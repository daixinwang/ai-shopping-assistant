CREATE EXTENSION IF NOT EXISTS vector;
CREATE TABLE IF NOT EXISTS products (
 product_id TEXT PRIMARY KEY, title TEXT NOT NULL, brand TEXT NOT NULL,
 category TEXT NOT NULL, sub_category TEXT, base_price NUMERIC(14,2) NOT NULL,
 image_path TEXT, image_url TEXT, source_path TEXT, status TEXT NOT NULL DEFAULT 'active',
 content_version BIGINT NOT NULL DEFAULT 1,
 created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS product_skus (
 sku_id TEXT PRIMARY KEY, product_id TEXT NOT NULL REFERENCES products ON DELETE CASCADE,
 properties_json TEXT NOT NULL DEFAULT '{}', price NUMERIC(14,2) NOT NULL CHECK(price >= 0),
 stock_qty INTEGER NOT NULL DEFAULT 999, status TEXT NOT NULL DEFAULT 'active'
);
CREATE INDEX IF NOT EXISTS skus_product_price ON product_skus(product_id, price) WHERE status='active';
CREATE INDEX IF NOT EXISTS products_filters ON products(category, sub_category, brand) WHERE status='active';
CREATE TABLE IF NOT EXISTS product_descriptions (
 product_id TEXT PRIMARY KEY REFERENCES products ON DELETE CASCADE, marketing_description TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS product_faqs (
 faq_id BIGSERIAL PRIMARY KEY, product_id TEXT NOT NULL REFERENCES products ON DELETE CASCADE,
 source_index INTEGER NOT NULL, question TEXT NOT NULL, answer TEXT NOT NULL, UNIQUE(product_id,source_index)
);
CREATE TABLE IF NOT EXISTS product_reviews (
 review_id BIGSERIAL PRIMARY KEY, product_id TEXT NOT NULL REFERENCES products ON DELETE CASCADE,
 source_index INTEGER NOT NULL, nickname TEXT NOT NULL, rating INTEGER NOT NULL,
 content TEXT NOT NULL, polarity TEXT NOT NULL, UNIQUE(product_id,source_index)
);
CREATE TABLE IF NOT EXISTS users (user_id TEXT PRIMARY KEY, nickname TEXT);
INSERT INTO users(user_id) VALUES ('demo_user') ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS cart_items (
 cart_item_id BIGSERIAL PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users,
 product_id TEXT NOT NULL REFERENCES products ON DELETE CASCADE,
 sku_id TEXT NOT NULL REFERENCES product_skus ON DELETE CASCADE,
 selected_options_json TEXT NOT NULL, quantity INTEGER NOT NULL CHECK(quantity > 0),
 unit_price NUMERIC(14,2) NOT NULL, selected INTEGER NOT NULL DEFAULT 1, UNIQUE(user_id,sku_id)
);
CREATE OR REPLACE VIEW product_price_ranges AS
 SELECT product_id, MIN(price) AS min_price, MAX(price) AS max_price, COUNT(*) AS sku_count
 FROM product_skus WHERE status='active' GROUP BY product_id;
CREATE TABLE IF NOT EXISTS agent_sessions (
 session_id TEXT PRIMARY KEY, payload JSONB NOT NULL, version BIGINT NOT NULL DEFAULT 1,
 updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS session_fences (session_id TEXT PRIMARY KEY, fence BIGINT NOT NULL);
CREATE TABLE IF NOT EXISTS request_ledger (
 request_id TEXT PRIMARY KEY, scope TEXT NOT NULL, session_id TEXT,
 status TEXT NOT NULL, response_json TEXT, owner TEXT, fingerprint TEXT,
 updated_at DOUBLE PRECISION NOT NULL
);
CREATE INDEX IF NOT EXISTS ledger_expiry ON request_ledger(updated_at);
CREATE TABLE IF NOT EXISTS user_preferences (
 user_id TEXT PRIMARY KEY, preference_json TEXT NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS preference_undo_tokens (
 id BIGSERIAL PRIMARY KEY, undo_token TEXT NOT NULL UNIQUE, user_id TEXT NOT NULL,
 session_id TEXT, source TEXT NOT NULL, field TEXT NOT NULL, value_json TEXT NOT NULL,
 before_json TEXT NOT NULL, after_json TEXT NOT NULL, used INTEGER NOT NULL DEFAULT 0,
 created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS catalog_revision (singleton BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK(singleton), revision BIGINT NOT NULL);
INSERT INTO catalog_revision VALUES(TRUE,1) ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS product_embeddings (
 product_id TEXT NOT NULL REFERENCES products ON DELETE CASCADE,
 model TEXT NOT NULL, document TEXT NOT NULL, embedding VECTOR NOT NULL,
 product_version BIGINT NOT NULL, PRIMARY KEY(product_id,model)
);
CREATE TABLE IF NOT EXISTS product_assets (
 product_id TEXT NOT NULL REFERENCES products ON DELETE CASCADE, kind TEXT NOT NULL,
 model TEXT NOT NULL DEFAULT '', payload JSONB NOT NULL, embedding VECTOR,
 product_version BIGINT NOT NULL, PRIMARY KEY(product_id,kind,model)
);
CREATE OR REPLACE FUNCTION bump_product_version() RETURNS TRIGGER AS $$
BEGIN
 NEW.content_version := OLD.content_version + 1;
 NEW.updated_at := CURRENT_TIMESTAMP;
 RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE OR REPLACE FUNCTION bump_catalog_revision() RETURNS TRIGGER AS $$
BEGIN
 UPDATE catalog_revision SET revision=revision+1 WHERE singleton;
 RETURN NULL;
END $$ LANGUAGE plpgsql;
CREATE OR REPLACE FUNCTION invalidate_product_embedding() RETURNS TRIGGER AS $$
BEGIN
 IF TG_OP = 'DELETE' THEN
   UPDATE products SET updated_at=CURRENT_TIMESTAMP WHERE product_id=OLD.product_id;
 ELSE
   UPDATE products SET updated_at=CURRENT_TIMESTAMP WHERE product_id=NEW.product_id;
   IF TG_OP='UPDATE' AND OLD.product_id<>NEW.product_id THEN
     UPDATE products SET updated_at=CURRENT_TIMESTAMP WHERE product_id=OLD.product_id;
   END IF;
 END IF;
 RETURN NULL;
END $$ LANGUAGE plpgsql;
CREATE OR REPLACE TRIGGER products_version BEFORE UPDATE ON products FOR EACH ROW EXECUTE FUNCTION bump_product_version();
CREATE OR REPLACE TRIGGER catalog_changed AFTER INSERT OR UPDATE OR DELETE ON products FOR EACH STATEMENT EXECUTE FUNCTION bump_catalog_revision();
CREATE OR REPLACE TRIGGER sku_changed AFTER INSERT OR UPDATE OR DELETE ON product_skus FOR EACH ROW EXECUTE FUNCTION invalidate_product_embedding();
CREATE OR REPLACE TRIGGER description_changed AFTER INSERT OR UPDATE OR DELETE ON product_descriptions FOR EACH ROW EXECUTE FUNCTION invalidate_product_embedding();
CREATE OR REPLACE TRIGGER faq_changed AFTER INSERT OR UPDATE OR DELETE ON product_faqs FOR EACH ROW EXECUTE FUNCTION invalidate_product_embedding();
CREATE OR REPLACE TRIGGER review_changed AFTER INSERT OR UPDATE OR DELETE ON product_reviews FOR EACH ROW EXECUTE FUNCTION invalidate_product_embedding();
