from __future__ import annotations

from typing import Optional
from repository.mock_product_repo import MockProductRepository
from models.product import ProductItem
from models.filter import FilterParams

# 最大返回商品数，避免一次返回几万条
MAX_RESULTS = 200
# 后端静态图片基础 URL（开发环境）
IMAGE_BASE_URL = "http://localhost:8000"


class ProductService:
    def __init__(self):
        self.repo = MockProductRepository()

    @staticmethod
    def _fix_image_urls(products: list[ProductItem]) -> list[ProductItem]:
        """将相对路径图片 URL 转为绝对路径（适配 Myntra 数据集）"""
        for p in products:
            if p.image_url and p.image_url.startswith("/images/"):
                p.image_url = f"{IMAGE_BASE_URL}{p.image_url}"
        return products

    def search(self, keywords: list[str], category: Optional[str] = None) -> list[ProductItem]:
        """基于关键词和类目召回初始商品列表"""
        if category:
            products = self.repo.get_by_category(category)
            # 如果类目匹配结果不足5条，补充关键词搜索结果
            if len(products) < 5 and keywords:
                extra = self.repo.search_by_keywords(keywords)
                # 合并去重
                ids = {p.id for p in products}
                products += [p for p in extra if p.id not in ids]
        elif keywords:
            products = self.repo.search_by_keywords(keywords)
        else:
            products = self.repo.get_all()
        return self._fix_image_urls(products)[:MAX_RESULTS]

    def apply_filters(self, products: list[ProductItem], filters: FilterParams) -> list[ProductItem]:
        """应用结构化过滤条件"""
        result = products

        # 价格过滤（基于 min_price）
        if filters.price_max is not None:
            result = [p for p in result if p.min_price <= filters.price_max]
        if filters.price_min is not None:
            result = [p for p in result if p.min_price >= filters.price_min]

        # 颜色过滤（模糊匹配）
        if filters.color:
            result = [p for p in result if filters.color.lower() in p.color.lower()]

        # 评分过滤
        if filters.rating_min is not None:
            result = [p for p in result if p.rating >= filters.rating_min]

        # 平台：该平台有价格才算
        if filters.platform:
            result = [p for p in result if getattr(p.platform_prices, filters.platform) is not None]

        # 店铺类型
        if filters.store_type:
            result = [p for p in result if p.store_type == filters.store_type]

        # 关键词过滤
        if filters.keywords:
            result = [p for p in result if any(
                kw.lower() in (p.name + p.brand + p.color).lower()
                for kw in filters.keywords
            )]

        # 排序
        sort_key = filters.sort
        if sort_key == "price_asc":
            result.sort(key=lambda p: p.min_price)
        elif sort_key == "price_desc":
            result.sort(key=lambda p: p.min_price, reverse=True)
        elif sort_key == "sales":
            result.sort(key=lambda p: p.sales, reverse=True)
        elif sort_key == "rating":
            result.sort(key=lambda p: p.rating, reverse=True)

        return result

    def search_and_filter(self, keywords: list[str], filters: FilterParams, category: Optional[str] = None) -> list[ProductItem]:
        """搜索 + 过滤一步完成"""
        products = self.search(keywords, category)
        filtered = self.apply_filters(products, filters)
        return self._fix_image_urls(filtered)[:MAX_RESULTS]
