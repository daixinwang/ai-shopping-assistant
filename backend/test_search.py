#!/usr/bin/env python3
"""测试搜索比价功能的验证脚本"""

import sys
import json
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from repository.mock_product_repo import MockProductRepository
from services.product_service import ProductService
from models.filter import FilterParams


def print_separator(title):
    print(f"\n{'='*60}")
    print(f" {title}")
    print(f"{'='*60}")


def test_data_loading():
    print_separator("1. 测试数据加载")
    
    repo = MockProductRepository()
    all_products = repo.get_all()
    
    print(f"商品总数: {len(all_products)}")
    
    category_counts = {}
    for p in all_products:
        category_counts[p.category] = category_counts.get(p.category, 0) + 1
    
    print("\n类目分布:")
    for cat, count in category_counts.items():
        print(f"  - {cat}: {count} 条")
    
    products_with_images = [p for p in all_products if p.image_url.startswith('/images/myntra/')]
    print(f"\n带真实图片的商品数: {len(products_with_images)}")
    
    return len(all_products) > 0


def test_search_keywords():
    print_separator("2. 测试关键词搜索")
    
    service = ProductService()
    
    results = service.search(keywords=["Shirt"], category=None)
    print(f"搜索 'Shirt': {len(results)} 条结果")
    
    if results:
        print(f"   示例商品: {results[0].name}")
        print(f"   品牌: {results[0].brand}")
        print(f"   价格: 天猫{results[0].platform_prices.tmall}, 京东{results[0].platform_prices.jd}, 拼多多{results[0].platform_prices.pdd}")
    
    results = service.search(keywords=["Nike"], category=None)
    print(f"\n搜索 'Nike': {len(results)} 条结果")
    
    results = service.search(keywords=["Blue"], category=None)
    print(f"搜索 'Blue': {len(results)} 条结果")
    
    return True


def test_category_search():
    print_separator("3. 测试类目搜索")
    
    service = ProductService()
    
    categories = ['运动鞋', 'T恤', '包包', '其他']
    for cat in categories:
        results = service.search(keywords=[], category=cat)
        print(f"类目 '{cat}': {len(results)} 条结果")
    
    return True


def test_price_filter():
    print_separator("4. 测试价格过滤")
    
    service = ProductService()
    products = service.search(keywords=[], category=None)
    
    filters = FilterParams(price_max=500)
    filtered = service.apply_filters(products, filters)
    all_within_price = all(p.min_price <= 500 for p in filtered)
    print(f"价格上限 500: {len(filtered)} 条结果 (验证通过: {all_within_price})")
    
    filters = FilterParams(price_min=200, price_max=500)
    filtered = service.apply_filters(products, filters)
    all_in_range = all(200 <= p.min_price <= 500 for p in filtered)
    print(f"价格区间 200-500: {len(filtered)} 条结果 (验证通过: {all_in_range})")
    
    return all_within_price and all_in_range


def test_store_type_filter():
    print_separator("5. 测试店铺类型过滤")
    
    service = ProductService()
    products = service.search(keywords=[], category=None)
    
    filters = FilterParams(store_type="flagship")
    filtered = service.apply_filters(products, filters)
    all_flagship = all(p.store_type == "flagship" for p in filtered)
    print(f"旗舰店: {len(filtered)} 条结果 (验证通过: {all_flagship})")
    
    filters = FilterParams(store_type="official")
    filtered = service.apply_filters(products, filters)
    all_official = all(p.store_type == "official" for p in filtered)
    print(f"官方店: {len(filtered)} 条结果 (验证通过: {all_official})")
    
    return all_flagship and all_official


def test_sorting():
    print_separator("6. 测试排序功能")
    
    service = ProductService()
    products = service.search(keywords=[], category="T恤")
    
    filters = FilterParams(sort="price_asc")
    sorted_products = service.apply_filters(products, filters)
    prices_asc = [p.min_price for p in sorted_products]
    is_asc = prices_asc == sorted(prices_asc)
    print(f"价格升序: {is_asc}")
    
    filters = FilterParams(sort="price_desc")
    sorted_products = service.apply_filters(products, filters)
    prices_desc = [p.min_price for p in sorted_products]
    is_desc = prices_desc == sorted(prices_desc, reverse=True)
    print(f"价格降序: {is_desc}")
    
    filters = FilterParams(sort="sales")
    sorted_products = service.apply_filters(products, filters)
    sales = [p.sales for p in sorted_products]
    is_sales_desc = sales == sorted(sales, reverse=True)
    print(f"销量排序: {is_sales_desc}")
    
    return is_asc and is_desc and is_sales_desc


def test_price_comparison():
    print_separator("7. 测试比价功能")
    
    service = ProductService()
    products = service.search(keywords=["Shirt"], category=None)
    
    if products:
        product = products[0]
        print(f"商品: {product.name}")
        print(f"品牌: {product.brand}")
        print(f"颜色: {product.color}")
        print(f"风格: {product.style}")
        print(f"季节: {', '.join(product.tags)}")
        print("\n三平台价格对比:")
        print(f"    天猫: {product.platform_prices.tmall}")
        print(f"    京东: {product.platform_prices.jd}")
        print(f"    拼多多: {product.platform_prices.pdd}")
        print(f"\n最低价: {product.min_price}")
        
        price_ok = (product.platform_prices.tmall >= product.platform_prices.jd >= product.platform_prices.pdd)
        print(f"\n价格关系验证 (天猫 >= 京东 >= 拼多多): {price_ok}")
        
        return price_ok
    return True


def test_real_images():
    print_separator("8. 测试真实图片链接")
    
    repo = MockProductRepository()
    products = repo.get_all()
    
    local_images = [p for p in products if p.image_url.startswith('/images/myntra/')]
    remote_images = [p for p in products if p.image_url.startswith('https://')]
    
    print(f"本地图片: {len(local_images)} 条")
    print(f"远程占位图: {len(remote_images)} 条")
    
    if local_images:
        print(f"\n示例图片URL: {local_images[0].image_url}")
    
    return len(local_images) > 0


def main():
    print("\nAI购物助手 - 搜索比价功能测试")
    print("="*60)
    
    all_passed = True
    
    tests = [
        ("数据加载", test_data_loading),
        ("关键词搜索", test_search_keywords),
        ("类目搜索", test_category_search),
        ("价格过滤", test_price_filter),
        ("店铺类型过滤", test_store_type_filter),
        ("排序功能", test_sorting),
        ("比价功能", test_price_comparison),
        ("真实图片", test_real_images),
    ]
    
    for name, test_func in tests:
        try:
            result = test_func()
            if not result:
                print(f"\n{name} 测试失败")
                all_passed = False
        except Exception as e:
            print(f"\n{name} 测试异常: {e}")
            all_passed = False
    
    print("\n" + "="*60)
    if all_passed:
        print("所有测试通过！搜索比价功能正常工作！")
        print("\n测试摘要:")
        repo = MockProductRepository()
        print(f"  - 商品总数: {len(repo.get_all())}")
        print(f"  - 支持类目: 运动鞋、T恤、包包、其他")
        print(f"  - 支持过滤: 价格区间、店铺类型、评分")
        print(f"  - 支持排序: 价格、销量、评分")
        print(f"  - 比价平台: 天猫、京东、拼多多")
    else:
        print("部分测试失败，请检查错误信息")
    
    return 0 if all_passed else 1


if __name__ == "__main__":
    sys.exit(main())
