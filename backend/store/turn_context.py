"""Request-scoped fence, checked inside each short business transaction."""
from contextlib import contextmanager
from contextvars import ContextVar
from functools import wraps
import redis

_lease = ContextVar('shared_turn_lease', default=None)


def current_lease():
    return _lease.get()


def execution_started():
    lease = _lease.get()
    if lease is not None:
        lease['started'] = True


def has_started():
    lease = _lease.get()
    return lease is None or lease.get('started',False)


@contextmanager
def mutation_scope(lease):
    token = _lease.set(lease)
    try:
        yield
    finally:
        _lease.reset(token)


def fence_transaction(conn, lease=None):
    lease = lease if lease is not None else _lease.get()
    if lease is None:
        return
    from store.redis_session import SessionConflict, SharedStateUnavailable
    try:
        if lease['lost'].is_set() or not lease['lock'].owned():
            raise SessionConflict('会话租约已丢失，拒绝执行旧请求的写入')
    except redis.RedisError as exc:
        raise SharedStateUnavailable('会话协调服务不可用') from exc
    # A successor must acquire this row lock before increasing its fence. Holding it
    # until COMMIT linearizes this mutation before or after takeover, never across it.
    row = conn.execute('SELECT fence FROM session_fences WHERE session_id=%s FOR UPDATE',
                       (lease['session_id'],)).fetchone()
    if not row or row['fence'] != lease['fence']:
        raise SessionConflict('会话已被新请求接管，拒绝旧请求的写入')


def cart_transaction(method):
    @wraps(method)
    def wrapped(self,*args,**kwargs):
        from store.shared_db import enabled, transaction
        from store.product_store import DEFAULT_DB_PATH
        if not enabled() or self.db_path != DEFAULT_DB_PATH:
            return method(self,*args,**kwargs)
        with transaction() as conn:
            fence_transaction(conn)
            # The current cart API uses one demonstration user. Serialize its short
            # mutations, including read+delete checkout, across independent sessions.
            conn.execute("SELECT pg_advisory_xact_lock(hashtextextended('demo-cart',2))")
            return method(self,*args,**kwargs)
    return wrapped
