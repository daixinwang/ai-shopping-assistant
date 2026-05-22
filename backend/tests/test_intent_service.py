import pytest
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

os.environ.setdefault("ANTHROPIC_API_KEY", "test-key")

from unittest.mock import MagicMock, patch
from services.intent_service import IntentService
from models.filter import FilterParams

@pytest.fixture
def svc():
    return IntentService()

def make_mock_response(text: str):
    """构造 Mock 的 anthropic 响应对象"""
    mock_resp = MagicMock()
    mock_resp.content = [MagicMock(text=text)]
    return mock_resp

def test_parse_price_and_color(svc):
    """解析价格和颜色条件"""
    mock_response = make_mock_response(
        '{"price_max": 1000, "price_min": null, "color": "黑色", "rating_min": null, "platform": null, "store_type": null, "sort": null, "keywords": []}'
    )
    with patch.object(svc.client.messages, "create", return_value=mock_response):
        result = svc.parse("1000元以内的黑色款", "运动鞋")

    assert result.price_max == 1000.0
    assert result.color == "黑色"
    assert result.price_min is None

def test_parse_rating(svc):
    """解析评分条件"""
    mock_response = make_mock_response(
        '{"price_max": null, "price_min": null, "color": null, "rating_min": 4.8, "platform": null, "store_type": null, "sort": null, "keywords": []}'
    )
    with patch.object(svc.client.messages, "create", return_value=mock_response):
        result = svc.parse("评价4.8分以上的", "手机")

    assert result.rating_min == 4.8

def test_parse_fallback_on_invalid_json(svc):
    """JSON 解析失败时返回空 FilterParams"""
    mock_response = make_mock_response("这不是JSON格式")
    with patch.object(svc.client.messages, "create", return_value=mock_response):
        result = svc.parse("一些输入", "运动鞋")

    assert isinstance(result, FilterParams)
    assert result.price_max is None
    assert result.color is None

def test_parse_empty_query(svc):
    """空查询返回空 FilterParams"""
    mock_response = make_mock_response(
        '{"price_max": null, "price_min": null, "color": null, "rating_min": null, "platform": null, "store_type": null, "sort": null, "keywords": []}'
    )
    with patch.object(svc.client.messages, "create", return_value=mock_response):
        result = svc.parse("", "")

    # 所有字段都为 None 或空列表
    assert result.price_max is None
