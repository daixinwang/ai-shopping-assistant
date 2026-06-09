import json
from pathlib import Path
from models.product import ProductItem


class MockProductRepository:
    """从 JSON 文件加载商品数据，提供按类目和关键词检索功能"""

    _instance = None
    _products: list[ProductItem] = []

    # 支持的数据源列表（用哪个开哪个）
    DATA_SOURCES = [
        # "mock_products.json",      # 原始模拟数据（已替换为Myntra真数据）
        "myntra_products.json",    # Myntra数据集（带真实图片）
        # "kaggle_products.json",   # Kaggle转换数据（可选）
    ]

    def __new__(cls):
        """单例，避免重复加载 JSON"""
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._load()
        return cls._instance

    def _load(self):
        """加载所有可用的数据源并合并"""
        self._products = []
        data_dir = Path(__file__).parent.parent / "data"
        
        for source in self.DATA_SOURCES:
            data_path = data_dir / source
            if data_path.exists():
                try:
                    with open(data_path, encoding="utf-8") as f:
                        raw = json.load(f)
                    products = [ProductItem(**item) for item in raw]
                    self._products.extend(products)
                    print(f"Loaded {len(products)} products from {source}")
                except Exception as e:
                    print(f"Failed to load {source}: {e}")
        
        # 去重：基于ID去重
        seen_ids = set()
        unique_products = []
        for p in self._products:
            if p.id not in seen_ids:
                seen_ids.add(p.id)
                unique_products.append(p)
        
        self._products = unique_products
        print(f"Total unique products: {len(self._products)}")

    def get_all(self) -> list[ProductItem]:
        return self._products.copy()

    def get_by_category(self, category: str) -> list[ProductItem]:
        return [p for p in self._products if p.category == category]

    def search_by_keywords(self, keywords: list[str]) -> list[ProductItem]:
        """关键词模糊匹配：name/brand/category/subcategory/style/key_features 任一包含关键词即命中"""
        if not keywords:
            return self._products.copy()

        results = []
        for product in self._products:
            search_text = " ".join([
                product.name, product.brand, product.category,
                product.subcategory, product.style, product.color,
                " ".join(product.key_features)
            ]).lower()
            if any(kw.lower() in search_text for kw in keywords):
                results.append(product)
        return results
