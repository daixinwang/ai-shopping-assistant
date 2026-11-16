"""Shared idempotency ledger; cart side effects and response commit together."""
import json
import time
import uuid
from threading import Lock

from store.request_ledger import RequestLedger, LedgerClaim
from store.shared_db import pool, transaction


class RequestConflict(ValueError):
    pass


class PgRequestLedger:
    validate = staticmethod(RequestLedger.validate)

    def __init__(self):
        self._owners = {}
        self._lock = Lock()

    @staticmethod
    def _locked_row(conn, request_id):
        conn.execute('SELECT pg_advisory_xact_lock(hashtextextended(%s,0))', (request_id,))
        return conn.execute('SELECT * FROM request_ledger WHERE request_id=%s', (request_id,)).fetchone()

    def claim(self, request_id, scope, session_id=None, fingerprint=None):
        self.validate(request_id)
        with pool().connection() as conn:
            row = self._locked_row(conn, request_id)
            if row:
                if row['scope'] != scope or (session_id and row['session_id'] != session_id) or row['fingerprint'] != fingerprint:
                    return LedgerClaim('conflict')
                if row['status'] == 'done':
                    return LedgerClaim('done', json.loads(row['response_json']))
                # A crashed chat may already have run a tool: never automatically
                # replay an unknown side effect after an arbitrary timeout.
                return LedgerClaim('pending')
            owner = uuid.uuid4().hex
            conn.execute("INSERT INTO request_ledger(request_id,scope,session_id,status,owner,fingerprint,updated_at) "
                         "VALUES(%s,%s,%s,'pending',%s,%s,%s)", (request_id,scope,session_id,owner,fingerprint,time.time()))
        with self._lock:
            self._owners[request_id] = owner
        return LedgerClaim('new')

    def complete(self, request_id, response):
        with self._lock:
            owner = self._owners.get(request_id)
        with pool().connection() as conn:
            conn.execute("UPDATE request_ledger SET status='done',response_json=%s,updated_at=%s "
                         "WHERE request_id=%s AND owner=%s", (json.dumps(response,ensure_ascii=False),time.time(),request_id,owner))
        with self._lock:
            self._owners.pop(request_id, None)

    def release(self, request_id):
        # Shared chat requests stay pending on ambiguous failures. Releasing them
        # could duplicate an already committed tool mutation. Operator reconciliation
        # is explicit; ordinary successful retries replay the completed response.
        with self._lock:
            self._owners.pop(request_id, None)

    def release_unstarted(self, request_id):
        with self._lock:
            owner = self._owners.get(request_id)
        with pool().connection() as conn:
            conn.execute("DELETE FROM request_ledger WHERE request_id=%s AND owner=%s AND status='pending'",
                         (request_id,owner))
        with self._lock:
            self._owners.pop(request_id,None)

    def run_atomic(self, request_id, scope, session_id, action, fingerprint=None):
        self.validate(request_id)
        with transaction() as conn:
            row = self._locked_row(conn, request_id)
            if row:
                if (row['scope'],row['session_id'],row['fingerprint']) != (scope,session_id,fingerprint):
                    raise RequestConflict('request_id 已用于不同的请求参数')
                if row['status'] != 'done':
                    raise RequestConflict('请求正在执行或等待核对')
                return json.loads(row['response_json'])
            result = action()
            conn.execute("INSERT INTO request_ledger(request_id,scope,session_id,status,response_json,fingerprint,updated_at) "
                         "VALUES(%s,%s,%s,'done',%s,%s,%s)",
                         (request_id,scope,session_id,json.dumps(result,ensure_ascii=False),fingerprint,time.time()))
            return result
