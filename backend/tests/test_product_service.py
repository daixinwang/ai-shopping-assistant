import pytest
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from services.product_service import ProductService
from models.filter import FilterParams

@pytest.fixture
def svc():
    return ProductService()

def test_search_by_category(svc):
    """按类目搜索，运动鞋应有 30 条"""
    results = svc.search(keywords=[], category="运动鞋")
    assert len(results) == 30

def test_search_by_keywords(svc):
    """关键词搜索，Nike 应有结果"""
    results = svc.search(keywords=["Nike"], category=None)
    assert len(results) > 0
    # 所有结果应包含 Nike
    assert all("Nike" in (p.name + p.brand) for p in results)

def test_filter_price_max(svc):
    """价格上限过滤：所有结果 min_price <= 500"""
    products = svc.search(keywords=[], category="运动鞋")
    filtered = svc.apply_filters(products, FilterParams(price_max=500))
    assert all(p.min_price <= 500 for p in filtered)

def test_filter_price_range(svc):
    """价格区间过滤"""
    products = svc.search(keywords=[], category=None)
    filtered = svc.apply_filters(products, FilterParams(price_min=500, price_max=1000))
    assert all(500 <= p.min_price <= 1000 for p in filtered)

def test_filter_rating(svc):
    """最低评分过滤"""
    products = svc.search(keywords=[], category=None)
    filtered = svc.apply_filters(products, FilterParams(rating_min=4.8))
    assert all(p.rating >= 4.8 for p in filtered)

def test_sort_price_asc(svc):
    """价格升序排序"""
    products = svc.search(keywords=[], category="手机")
    sorted_products = svc.apply_filters(products, FilterParams(sort="price_asc"))
    prices = [p.min_price for p in sorted_products]
    assert prices == sorted(prices), "价格应为升序"

def test_sort_price_desc(svc):
    """价格降序排序"""
    products = svc.search(keywords=[], category="手机")
    sorted_products = svc.apply_filters(products, FilterParams(sort="price_desc"))
    prices = [p.min_price for p in sorted_products]
    assert prices == sorted(prices, reverse=True), "价格应为降序"

def test_filter_store_type(svc):
    """店铺类型过滤"""
    products = svc.search(keywords=[], category=None)
    filtered = svc.apply_filters(products, FilterParams(store_type="flagship"))
    assert all(p.store_type == "flagship" for p in filtered)

def test_empty_filters_returns_all(svc):
    """空过滤条件应返回全部搜索结果"""
    products = svc.search(keywords=[], category="运动鞋")
    filtered = svc.apply_filters(products, FilterParams())
    assert len(filtered) == len(products)
