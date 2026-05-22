import json
from pathlib import Path
from models.product import ProductItem


class MockProductRepository:
    """从 JSON 文件加载商品数据，提供按类目和关键词检索功能"""

    _instance = None
    _products: list[ProductItem] = []

    def __new__(cls):
        """单例，避免重复加载 JSON"""
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._load()
        return cls._instance

    def _load(self):
        data_path = Path(__file__).parent.parent / "data" / "mock_products.json"
        with open(data_path, encoding="utf-8") as f:
            raw = json.load(f)
        self._products = [ProductItem(**item) for item in raw]

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
