import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault("ANTHROPIC_API_KEY", "test")

import pytest
from unittest.mock import patch
from services.intent_service import IntentService
from models.filter import FilterParams

@pytest.fixture
def svc():
    return IntentService()

def test_parse_price_and_color(svc):
    mock_text = '{"price_max": 1000, "price_min": null, "color": "黑色", "rating_min": null, "platform": null, "store_type": null, "sort": null, "keywords": []}'
    with patch.object(svc.factory, "call", return_value=mock_text):
        result = svc.parse("1000元以内的黑色款", "运动鞋")
    assert result.price_max == 1000.0
    assert result.color == "黑色"
    assert result.price_min is None

def test_parse_rating(svc):
    mock_text = '{"price_max": null, "price_min": null, "color": null, "rating_min": 4.8, "platform": null, "store_type": null, "sort": null, "keywords": []}'
    with patch.object(svc.factory, "call", return_value=mock_text):
        result = svc.parse("评价4.8分以上的", "手机")
    assert result.rating_min == 4.8

def test_parse_fallback_on_invalid_json(svc):
    with patch.object(svc.factory, "call", return_value="这不是JSON格式"):
        result = svc.parse("一些输入", "运动鞋")
    assert isinstance(result, FilterParams)
    assert result.price_max is None

def test_parse_empty_query(svc):
    mock_text = '{"price_max": null, "price_min": null, "color": null, "rating_min": null, "platform": null, "store_type": null, "sort": null, "keywords": []}'
    with patch.object(svc.factory, "call", return_value=mock_text):
        result = svc.parse("", "")
    assert result.price_max is None
