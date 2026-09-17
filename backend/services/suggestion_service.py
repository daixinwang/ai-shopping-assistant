import json
import logging
import re

from models.recognition import RecognitionResult, SuggestionCard, SuggestionFilterParams
from services.ai_client_factory import AIClientFactory
from services.ai_config import AIConfig

SYSTEM_PROMPT = """你是购物导购助手。
请根据商品识别结果生成 4-5 个可点击的购买决策建议卡片。
只输出严格 JSON 数组，不要输出解释、Markdown 或代码块。

输出格式：
[
  {
    "id": "英文小写唯一标识",
    "label": "8 字以内的卡片文字",
    "filter_params": {
      "sort": "price_asc/price_desc/sales/rating 之一或 null",
      "store_type": "flagship/official/third_party 之一或 null",
      "platform": "tmall/jd/pdd 之一或 null",
      "rating_min": 4.5
    }
  }
]"""


def _clean(raw: str) -> str:
    match = re.search(r"```(?:json)?\s*(.*?)\s*```", raw, re.DOTALL)
    if match:
        return match.group(1).strip()
    return raw.strip()


logger = logging.getLogger(__name__)


class SuggestionService:
    def __init__(self):
        self.factory = AIClientFactory()

    def generate(self, recognition: RecognitionResult) -> list[SuggestionCard]:
        if not AIConfig.get_instance().api_key:
            return self._default_suggestions()

        user_text = (
            f"商品识别结果：\n"
            f"类目：{recognition.category} - {recognition.subcategory}\n"
            f"品牌：{recognition.brand or '未知'}\n"
            f"颜色：{recognition.color}\n"
            f"风格：{recognition.style}\n"
            f"关键特征：{', '.join(recognition.key_features)}\n\n"
            "请生成 4-5 个导购建议卡片。"
        )
        try:
            raw = _clean(self.factory.call(system=SYSTEM_PROMPT, text=user_text))
            return [
                SuggestionCard(
                    id=item["id"],
                    label=item["label"],
                    filter_params=SuggestionFilterParams(**item.get("filter_params", {})),
                )
                for item in json.loads(raw)
            ]
        except Exception as e:
            logger.warning("建议卡片生成失败，使用默认卡片: %s", e)
            return self._default_suggestions()

    def _default_suggestions(self) -> list[SuggestionCard]:
        return [
            SuggestionCard(
                id="low_price",
                label="查看同款低价",
                filter_params=SuggestionFilterParams(sort="price_asc"),
            ),
            SuggestionCard(
                id="flagship",
                label="只看官方旗舰",
                filter_params=SuggestionFilterParams(store_type="flagship"),
            ),
            SuggestionCard(
                id="hot_sales",
                label="相似爆款推荐",
                filter_params=SuggestionFilterParams(sort="sales"),
            ),
            SuggestionCard(
                id="price_history",
                label="查看历史价格",
                filter_params=SuggestionFilterParams(sort="price_asc"),
            ),
        ]
