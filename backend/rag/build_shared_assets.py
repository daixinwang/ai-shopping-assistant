"""Rebuild comparison/visual facts in PostgreSQL with version fencing."""
from store.shared_db import pool
from store.shared_assets import PgCompareIndex, PgVisualIndex, save_asset


def build(kind, force=False):
    from store.product_store import ProductStore
    from rag.build_compare_index import _extract_one
    from llm.vision import embed_image
    index = PgCompareIndex() if kind == 'compare' else PgVisualIndex()
    with pool().connection() as conn:
        rows = conn.execute("SELECT product_id,content_version,image_url FROM products WHERE status='active'").fetchall()
    result = {}
    for row in rows:
        pid = row['product_id']
        if not force and index.has(pid):
            continue
        if kind == 'compare':
            entry = _extract_one(ProductStore().get_product_detail(pid),timeout=30)
            save_asset(pid,kind,entry,expected_version=row['content_version'])
            result[pid] = entry
        elif row['image_url']:
            vector = embed_image(row['image_url'])
            save_asset(pid,kind,{},vector=vector,model=index.model,expected_version=row['content_version'])
            result[pid] = vector
    return result
