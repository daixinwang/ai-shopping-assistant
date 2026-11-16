"""Redis hot sessions with PostgreSQL checkpoints and optimistic version fencing."""
from contextlib import contextmanager
from threading import Event, Thread
import json
import os

import redis
from psycopg.types.json import Jsonb

from agent.session import AgentSession, Message
from infrastructure.cache import client, prefix
from infrastructure.admission import Admission, CapacityBusy
from store.shared_db import pool
from store.turn_context import fence_transaction, current_lease, mutation_scope


class SessionBusy(RuntimeError):
    pass


class SessionConflict(RuntimeError):
    pass


class SharedStateUnavailable(RuntimeError):
    pass


class RedisSessionStore:
    def key(self, session_id):
        return f'{prefix()}:session:{session_id}'

    @contextmanager
    def turn(self, session_id):
        lock = client().lock(self.key(session_id) + ':turn', timeout=30, blocking=False, thread_local=False)
        admission = Admission()
        try:
            admission.acquire()
            if not lock.acquire(blocking=False):
                admission.release()
                raise SessionBusy('该会话有请求正在执行，请稍后重试')
        except redis.RedisError as exc:
            try:
                admission.release()
            except redis.RedisError:
                pass
            raise SharedStateUnavailable('会话协调服务不可用') from exc
        try:
            with pool().connection() as conn:
                fence = conn.execute('INSERT INTO session_fences(session_id,fence) VALUES(%s,1) '
                    'ON CONFLICT(session_id) DO UPDATE SET fence=session_fences.fence+1 RETURNING fence',
                    (session_id,)).fetchone()['fence']
        except BaseException:
            try:
                lock.release()
                admission.release()
            except redis.RedisError:
                pass
            raise
        stop, lost = Event(), Event()
        def renew():
            while not stop.wait(8):
                try:
                    lock.extend(30, replace_ttl=True)
                    if not admission.renew():
                        lost.set()
                        return
                except redis.RedisError:
                    lost.set()
                    return
        worker = Thread(target=renew, daemon=True)
        worker.start()
        lease = {'lock':lock,'lost':lost,'fence':fence,'session_id':session_id}
        try:
            yield lease
            if lost.is_set():
                raise SessionConflict('会话租约丢失，请查询最新状态')
        finally:
            stop.set()
            worker.join(timeout=2)
            try:
                lock.release()
            except redis.RedisError:
                pass
            try:
                admission.release()
            except redis.RedisError:
                pass

    def get_or_create(self, session_id):
        session = AgentSession(session_id=session_id) if session_id else AgentSession()
        session._lease = current_lease()
        # Check the durable version before using Redis. This closes the PG commit /
        # Redis publish crash window and prevents a stale cache from losing a turn.
        with pool().connection() as conn:
            row = conn.execute('SELECT version FROM agent_sessions WHERE session_id=%s',
                               (session.session_id,)).fetchone()
        if row is None:
            session.storage_version = 0
            return session
        try:
            raw = client().get(self.key(session.session_id))
            cached = json.loads(raw) if raw else None
        except (redis.RedisError, ValueError):
            cached = None
        if not cached or cached['version'] != row['version']:
            with pool().connection() as conn:
                full = conn.execute('SELECT version,payload FROM agent_sessions WHERE session_id=%s',
                                    (session.session_id,)).fetchone()
            cached = {'version': full['version'], 'payload': full['payload']}
            self._publish(session.session_id, cached)
        payload = cached['payload']
        session.history = [Message(**m) for m in payload['history']][-10:]
        session.working_memory = payload['memory']
        session.user_id = payload.get('user_id')
        session.storage_version = cached['version']
        return session

    def _publish(self, session_id, record):
        try:
            client().set(self.key(session_id), json.dumps(record, ensure_ascii=False),
                         ex=int(os.getenv('SESSION_TTL_SECONDS', '86400')))
        except redis.RedisError:
            pass  # Durable checkpoint exists; turn acquisition still fails closed.

    def save(self, session):
        lease = getattr(session, '_lease', None)
        if lease is None or lease['session_id'] != session.session_id:
            raise SessionConflict('共享会话写入必须绑定当前请求的租约')
        version = getattr(session, 'storage_version', 0)
        payload = {'history': [vars(m) for m in session.history[-10:]],
                   'memory': session.working_memory, 'user_id': session.user_id}
        with pool().connection() as conn:
            fence_transaction(conn, lease)
            if version == 0:
                row = conn.execute('INSERT INTO agent_sessions(session_id,payload) VALUES(%s,%s) '
                                   'ON CONFLICT DO NOTHING RETURNING version',
                                   (session.session_id, Jsonb(payload))).fetchone()
            else:
                row = conn.execute('UPDATE agent_sessions SET payload=%s,version=version+1,updated_at=now() '
                                   'WHERE session_id=%s AND version=%s RETURNING version',
                                   (Jsonb(payload), session.session_id, version)).fetchone()
            if row is None:
                raise SessionConflict('会话版本已变化，拒绝覆盖较新的消息')
        session.storage_version = row['version']
        self._publish(session.session_id, {'version': row['version'], 'payload': payload})

    def reset(self, session_id):
        with self.turn(session_id) as lease, mutation_scope(lease):
            # Keep a versioned tombstone so outstanding stale saves cannot recreate it.
            session = self.get_or_create(session_id)
            session.history, session.working_memory = [], {}
            self.save(session)
