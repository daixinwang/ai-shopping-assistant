"""Shared comparison facts and visual vectors; stale derived data is excluded."""
import os
from psycopg.types.json import Jsonb
from rag.pgvector_store import vector_literal
from store.shared_db import pool


def save_asset(product_id, kind, payload, vector=None, model='', expected_version=None):
    with pool().connection() as conn:
        row = conn.execute('SELECT content_version FROM products WHERE product_id=%s FOR SHARE', (product_id,)).fetchone()
        if not row or (expected_version is not None and row['content_version'] != expected_version):
            raise ValueError('product changed while generating derived data')
        conn.execute('INSERT INTO product_assets(product_id,kind,model,payload,embedding,product_version) '
                     'VALUES(%s,%s,%s,%s,%s::vector,%s) ON CONFLICT(product_id,kind,model) DO UPDATE '
                     'SET payload=excluded.payload,embedding=excluded.embedding,product_version=excluded.product_version',
                     (product_id,kind,model,Jsonb(payload),vector_literal(vector) if vector else None,row['content_version']))


class PgCompareIndex:
    def _entry(self, product_id):
        with pool().connection() as conn:
            row = conn.execute("SELECT a.payload FROM product_assets a JOIN products p USING(product_id) "
                               "WHERE a.product_id=%s AND a.kind='compare' AND a.model='' "
                               'AND a.product_version=p.content_version', (product_id,)).fetchone()
        return row['payload'] if row else {}

    def __len__(self):
        with pool().connection() as conn:
            return conn.execute("SELECT count(*) AS n FROM product_assets a JOIN products p USING(product_id) "
                                "WHERE kind='compare' AND a.model='' AND a.product_version=p.content_version").fetchone()['n']

    def has(self, product_id):
        return bool(self._entry(product_id))

    def value(self, product_id, dimension):
        return str(self._entry(product_id).get('dims',{}).get(dimension) or '—')

    def tagline(self, product_id):
        return str(self._entry(product_id).get('tagline') or '')


class PgVisualIndex:
    def __init__(self):
        self.model = os.getenv('EMBEDDING_MODEL') or os.getenv('ARK_EMBEDDING_MODEL') or ''

    def __len__(self):
        with pool().connection() as conn:
            return conn.execute("SELECT count(*) AS n FROM product_assets a JOIN products p USING(product_id) "
                                "WHERE kind='image' AND a.model=%s AND a.product_version=p.content_version", (self.model,)).fetchone()['n']

    def has(self, product_id):
        with pool().connection() as conn:
            return bool(conn.execute("SELECT 1 FROM product_assets a JOIN products p USING(product_id) "
                                     "WHERE kind='image' AND a.model=%s AND a.product_id=%s "
                                     'AND a.product_version=p.content_version', (self.model,product_id)).fetchone())

    def _scores(self, vector, ids=None, k=200):
        query = ("SELECT a.product_id,1-(a.embedding <=> %s::vector) AS score FROM product_assets a "
                 "JOIN products p USING(product_id) WHERE a.kind='image' AND a.model=%s "
                 "AND p.status='active' AND a.product_version=p.content_version AND vector_dims(a.embedding)=%s ")
        params = [vector_literal(vector),self.model,len(vector)]
        if ids is not None:
            query += 'AND a.product_id=ANY(%s) '
            params.append(ids)
        query += 'ORDER BY score DESC,a.product_id LIMIT %s'
        params.append(k)
        with pool().connection() as conn:
            return [(r['product_id'],float(r['score'])) for r in conn.execute(query,params)]

    def score_many(self, query_vec, product_ids):
        return dict(self._scores(query_vec, product_ids, len(product_ids)))

    def score(self, query_vec, product_id):
        return self.score_many(query_vec,[product_id]).get(product_id)

    def top_k(self, query_vec, k=10):
        return self._scores(query_vec,k=k)
