"""快速验证脚本：验证 MockProductRepository 和 ProductService 的基本功能"""
import sys
from pathlib import Path

# 确保 backend 目录在 sys.path 中
sys.path.insert(0, str(Path(__file__).parent))

from repository.mock_product_repo import MockProductRepository
from services.product_service import ProductService
from models.filter import FilterParams


def check(description: str, condition: bool):
    status = "PASS" if condition else "FAIL"
    print(f"[{status}] {description}")
    if not condition:
        sys.exit(1)


def main():
    repo = MockProductRepository()
    service = ProductService()

    # 1. 加载所有商品，确认 len == 130
    all_products = repo.get_all()
    check(f"加载所有商品 len == 130 (actual: {len(all_products)})", len(all_products) == 130)

    # 2. 按类目搜索"运动鞋"，确认 len == 30
    sport_shoes = repo.get_by_category("运动鞋")
    check(f"按类目搜索'运动鞋' len == 30 (actual: {len(sport_shoes)})", len(sport_shoes) == 30)

    # 3. 按关键词搜索["Nike"]，确认结果 > 0
    nike_results = repo.search_by_keywords(["Nike"])
    check(f"按关键词搜索['Nike'] len > 0 (actual: {len(nike_results)})", len(nike_results) > 0)

    # 4. 应用 price_max=500 过滤，确认所有结果 min_price <= 500
    filters = FilterParams(price_max=500)
    filtered = service.apply_filters(all_products, filters)
    all_within_price = all(p.min_price <= 500 for p in filtered)
    check(f"price_max=500 过滤后所有商品 min_price <= 500 (filtered count: {len(filtered)})", all_within_price)

    # 5. 应用 sort=price_asc，确认第一条比最后一条便宜
    filters_sort = FilterParams(sort="price_asc")
    sorted_products = service.apply_filters(all_products, filters_sort)
    check(
        f"sort=price_asc 第一条({sorted_products[0].min_price}) <= 最后一条({sorted_products[-1].min_price})",
        sorted_products[0].min_price <= sorted_products[-1].min_price
    )

    print("\n所有验证通过!")


if __name__ == "__main__":
    main()
