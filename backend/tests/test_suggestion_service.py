import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from services.suggestion_service import SuggestionService


def test_default_suggestions_cover_core_decision_paths():
    suggestions = SuggestionService()._default_suggestions()

    labels = [item.label for item in suggestions]
    assert "查看同款低价" in labels
    assert "只看官方旗舰" in labels
    assert "相似爆款推荐" in labels
    assert "查看历史价格" in labels

    by_id = {item.id: item for item in suggestions}
    assert by_id["low_price"].filter_params.sort == "price_asc"
    assert by_id["flagship"].filter_params.store_type == "flagship"
    assert by_id["hot_sales"].filter_params.sort == "sales"

