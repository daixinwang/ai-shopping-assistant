"""Exact pgvector recall with relational filters in the same SQL statement.

Start with exact recall for the current small catalog. ANN/HNSW requires a measured
recall/latency tradeoff and a fixed embedding dimension before enabling it.
"""
from dataclasses import asdict
import json
import math
import os

from infrastructure.cache import SharedCache
from rag.retriever import RetrievedChunk
from store.shared_db import pool, catalog_revision


def vector_literal(vector):
    values = [float(x) for x in vector]
    if not values or not all(math.isfinite(x) for x in values) or not any(values):
        raise ValueError('embedding must be finite and non-zero')
    return json.dumps(values)


class PgVectorStore:
    def __init__(self, model=None):
        self.model = model or os.getenv('EMBEDDING_MODEL') or os.getenv('ARK_EMBEDDING_MODEL')
        if not self.model:
            raise ValueError('EMBEDDING_MODEL is required')
        self.cache = SharedCache()

    def count(self):
        with pool().connection() as conn:
            return conn.execute('SELECT count(*) AS n FROM product_embeddings e JOIN products p USING(product_id) '
                                'WHERE e.model=%s AND e.product_version=p.content_version', (self.model,)).fetchone()['n']

    def upsert(self, product_id, document, vector, expected_version=None):
        with pool().connection() as conn:
            row = conn.execute('SELECT content_version FROM products WHERE product_id=%s FOR SHARE', (product_id,)).fetchone()
            if not row or (expected_version is not None and row['content_version'] != expected_version):
                raise ValueError('product changed during embedding; rebuild it')
            conn.execute('INSERT INTO product_embeddings VALUES(%s,%s,%s,%s::vector,%s) '
                         'ON CONFLICT(product_id,model) DO UPDATE SET document=excluded.document, '
                         'embedding=excluded.embedding,product_version=excluded.product_version',
                         (product_id,self.model,document,vector_literal(vector),row['content_version']))
            # Rebuilding vectors must also invalidate cached empty or partial recall.
            conn.execute('UPDATE catalog_revision SET revision=revision+1 WHERE singleton')

    def search_vector(self, vector, top_k=20, category=None, sub_category=None,
                      min_price=None, max_price=None, brand_include=None, brand_exclude=None,
                      category_exclude=None, sub_category_exclude=None):
        literal = vector_literal(vector)
        clauses = ["p.status='active'", 'e.model=%s', 'e.product_version=p.content_version',
                   'vector_dims(e.embedding)=%s']
        params = [self.model, len(vector)]
        for field, value in [('category',category), ('sub_category',sub_category)]:
            if value:
                clauses.append(f'p.{field}=%s')
                params.append(value)
        for field, values, excluded in [('brand',brand_include,False), ('brand',brand_exclude,True),
                                         ('category',category_exclude,True), ('sub_category',sub_category_exclude,True)]:
            if values:
                clauses.append(f"COALESCE(p.{field},'') {'<>' if excluded else '='} {'ALL' if excluded else 'ANY'}(%s)")
                params.append(list(values))
        sku = ["s.product_id=p.product_id", "s.status='active'"]
        for operator, value in [('>=', min_price), ('<=', max_price)]:
            if value is not None:
                sku.append(f's.price {operator} %s')
                params.append(value)
        clauses.append('EXISTS (SELECT 1 FROM product_skus s WHERE ' + ' AND '.join(sku) + ')')
        with pool().connection() as conn:
            rows = conn.execute(
                'SELECT p.product_id,p.title,p.brand,p.category,p.sub_category,p.base_price,e.document, '
                'e.embedding <=> %s::vector AS distance FROM product_embeddings e JOIN products p USING(product_id) '
                'WHERE ' + ' AND '.join(clauses) + ' ORDER BY distance,p.product_id LIMIT %s',
                [literal,*params,max(1,min(top_k,200))]).fetchall()
        return [RetrievedChunk(r['product_id']+'-pgvector', r['document'], {
            'product_id':r['product_id'], 'title':r['title'],'brand':r['brand'], 'category':r['category'],
            'sub_category':r['sub_category'] or '', 'base_price':float(r['base_price']), 'chunk_type':'product',
        },float(r['distance'])) for r in rows]

    def search_filtered(self, query, parsed, top_k=20):
        from rag.chroma_store import DoubaoEmbeddingFunction
        from search.query_understanding import expand_brands
        model_identity = {'model':self.model,'endpoint':os.getenv('EMBEDDING_BASE_URL') or os.getenv('ARK_EMBEDDING_BASE_URL')}
        embedding_key = self.cache.key('embedding', {**model_identity,'query':query})
        vector = self.cache.get_or_load(embedding_key, lambda: DoubaoEmbeddingFunction(self.model)([query])[0], ttl=3600)
        attributes = {**model_identity,'query':query,'filters':parsed.to_dict(),'top_k':top_k,'catalog':catalog_revision()}
        def retrieve():
            return [asdict(c) for c in self.search_vector(vector,top_k=top_k,category=parsed.category,
                sub_category=parsed.sub_category,min_price=parsed.min_price,max_price=parsed.max_price,
                brand_include=expand_brands(parsed.brand_include),brand_exclude=expand_brands(parsed.brand_exclude),
                category_exclude=parsed.category_exclude,sub_category_exclude=parsed.sub_category_exclude)]
        records = self.cache.get_or_load(self.cache.key('recall',attributes),retrieve)
        return [RetrievedChunk(**r) for r in records]
