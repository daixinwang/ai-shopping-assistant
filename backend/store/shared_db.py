"""Bounded PostgreSQL pool and adapter for the catalog's parameterized SQL.

No database connection is held while waiting for model/network calls. Only explicitly
scoped short mutations participate in a shared transaction via ``transaction()``.
"""
from contextlib import contextmanager
from contextvars import ContextVar
import os
from pathlib import Path
from threading import Lock

from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool

_pools = {}
_lock = Lock()
_transaction = ContextVar('postgres_transaction', default=None)


def enabled():
    return bool(os.getenv('DATABASE_URL'))


def pool():
    url = os.environ['DATABASE_URL']
    with _lock:
        if url not in _pools:
            _pools[url] = ConnectionPool(
                url, min_size=1, max_size=int(os.getenv('PG_POOL_SIZE', '10')),
                timeout=3, max_waiting=32,
                kwargs={'row_factory': dict_row, 'connect_timeout': 3,
                        'options': '-c statement_timeout=5000 -c lock_timeout=2000 -c idle_in_transaction_session_timeout=5000'},
                open=True,
            )
        return _pools[url]


def close_pools():
    with _lock:
        for instance in _pools.values():
            instance.close()
        _pools.clear()


def initialize():
    with pool().connection() as conn:
        conn.execute(Path(__file__).resolve().parents[1].joinpath('db/postgres.sql').read_text(encoding='utf-8'))


class Connection:
    def __enter__(self):
        self.conn = _transaction.get()
        self.borrowed = self.conn is not None
        if not self.borrowed:
            self.manager = pool().connection()
            self.conn = self.manager.__enter__()
        return self

    def __exit__(self, *exc):
        if not self.borrowed:
            return self.manager.__exit__(*exc)

    @staticmethod
    def sql(query):
        # Only internal SQL templates use this adapter, never user-provided SQL.
        return query.replace("datetime('now')", 'CURRENT_TIMESTAMP').replace('group_concat(', 'string_agg(').replace('?', '%s')

    def execute(self, query, params=()):
        return self.conn.execute(self.sql(query), params)

    def executemany(self, query, params):
        return self.conn.cursor().executemany(self.sql(query), params)

    def commit(self):
        if not self.borrowed:
            self.conn.commit()


def connection():
    return Connection()


@contextmanager
def transaction():
    existing = _transaction.get()
    if existing is not None:
        yield existing
        return
    with pool().connection() as conn:
        token = _transaction.set(conn)
        try:
            yield conn
        finally:
            _transaction.reset(token)


def catalog_revision():
    with pool().connection() as conn:
        return conn.execute('SELECT revision FROM catalog_revision WHERE singleton').fetchone()['revision']
