"""Explicit migration/indexing CLI; never runs inside API startup."""
import argparse
import json
from pathlib import Path
import sqlite3

from store.shared_db import initialize, pool, close_pools


def migrate(path):
    if not path.is_file():
        raise ValueError('SQLite source does not exist')
    with sqlite3.connect(path.resolve().as_uri() + '?mode=ro', uri=True) as source, pool().connection() as target:
        source.row_factory = sqlite3.Row
        source.execute('BEGIN')
        if target.execute('SELECT count(*) AS n FROM products').fetchone()['n']:
            raise ValueError('Target catalog must be empty; migration never overwrites live data')
        tables = {r[0] for r in source.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        counts = {}
        for table in ('products','product_skus','product_descriptions','product_faqs','product_reviews',
                      'users','cart_items','user_preferences','preference_undo_tokens'):
            if table not in tables:
                continue
            columns = {r['column_name'] for r in target.execute(
                "SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=%s", (table,))}
            common = [r[1] for r in source.execute(f'PRAGMA table_info({table})') if r[1] in columns]
            rows = source.execute(f"SELECT {','.join(common)} FROM {table}").fetchall()
            placeholders = ','.join('%s' for _ in common)
            conflict = 'ON CONFLICT DO NOTHING'
            if table == 'users' and 'nickname' in common:
                conflict = 'ON CONFLICT(user_id) DO UPDATE SET nickname=excluded.nickname'
            for row in rows:
                target.execute(f"INSERT INTO {table} ({','.join(common)}) VALUES ({placeholders}) {conflict}", tuple(row))
            counts[table] = len(rows)
        if 'agent_sessions' in tables:
            from psycopg.types.json import Jsonb
            for row in source.execute('SELECT session_id,history_json,memory_json FROM agent_sessions'):
                target.execute('INSERT INTO agent_sessions(session_id,payload) VALUES(%s,%s)',
                    (row['session_id'],Jsonb({'history':json.loads(row['history_json'])[-10:],
                     'memory':json.loads(row['memory_json'])})))
        if 'request_ledger' in tables:
            for row in source.execute('SELECT request_id,scope,session_id,status,response_json,updated_at FROM request_ledger'):
                target.execute('INSERT INTO request_ledger(request_id,scope,session_id,status,response_json,updated_at) '
                               'VALUES(%s,%s,%s,%s,%s,%s)',tuple(row))
        for table, column in [('cart_items','cart_item_id'), ('product_faqs','faq_id'),
                              ('product_reviews','review_id'), ('preference_undo_tokens','id')]:
            target.execute(f"SELECT setval(pg_get_serial_sequence('{table}','{column}'), "
                           f"COALESCE((SELECT max({column}) FROM {table}),1), EXISTS(SELECT 1 FROM {table}))")
        return counts


def index():
    from rag.pgvector_store import PgVectorStore
    from rag.chroma_store import DoubaoEmbeddingFunction
    from store.product_store import ProductStore
    from agent.comparison import product_brief
    store, products = PgVectorStore(), ProductStore()
    embed = DoubaoEmbeddingFunction(store.model)
    with pool().connection() as conn:
        rows = conn.execute("SELECT p.product_id,p.content_version FROM products p LEFT JOIN product_embeddings e "
                            "ON e.product_id=p.product_id AND e.model=%s WHERE p.status='active' AND "
                            '(e.product_version IS NULL OR e.product_version<>p.content_version)', (store.model,)).fetchall()
    for row in rows:
        detail = products.get_product_detail(row['product_id'])
        if detail is None:
            continue
        document = product_brief(detail)
        vector = embed([document])[0]
        store.upsert(detail.product_id, document, vector, expected_version=row['content_version'])
    return {'rebuilt':len(rows),'current':store.count()}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('command', choices=['init','migrate','index'])
    parser.add_argument('--sqlite', type=Path)
    args = parser.parse_args()
    try:
        if args.command == 'init':
            initialize()
            result = {'schema':'ready'}
        elif args.command == 'migrate':
            if not args.sqlite:
                parser.error('migrate requires --sqlite')
            result = migrate(args.sqlite)
        else:
            result = index()
        print(json.dumps(result,ensure_ascii=False))
    finally:
        close_pools()


if __name__ == '__main__':
    main()
