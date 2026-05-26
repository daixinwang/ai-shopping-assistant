import json
import logging
import re
from models.recognition import RecognitionResult, SuggestionCard, SuggestionFilterParams
from services.ai_client_factory import AIClientFactory

SYSTEM_PROMPT = """你是购物导购助手。
根据商品识别结果，生成4-5个引导购买决策的建议卡片，输出严格的JSON数组，不要输出其他内容，不要添加markdown代码块标记。

输出格式：
[
  {"id": "唯一标识（英文小写）", "label": "卡片文字（8字以内）", "filter_params": {"sort": "可选", "store_type": "可选", "platform": "可选", "rating_min": 可选数字}},
  ...
]"""

def _clean(raw: str) -> str:
    match = re.search(r'```(?:json)?\s*(.*?)\s*```', raw, re.DOTALL)
    if match:
        return match.group(1).strip()
    return raw.strip()


logger = logging.getLogger(__name__)


class SuggestionService:
    def __init__(self):
        self.factory = AIClientFactory()

    def generate(self, recognition: RecognitionResult) -> list[SuggestionCard]:
        user_text = (
            f"商品识别结果：\n类目：{recognition.category} - {recognition.subcategory}\n"
            f"品牌：{recognition.brand or '未知'}\n颜色：{recognition.color}\n"
            f"风格：{recognition.style}\n关键特征：{', '.join(recognition.key_features)}\n\n"
            "请生成4-5个购买建议卡片。"
        )
        try:
            raw = _clean(self.factory.call(system=SYSTEM_PROMPT, text=user_text))
            return [
                SuggestionCard(id=item["id"], label=item["label"],
                               filter_params=SuggestionFilterParams(**item.get("filter_params", {})))
                for item in json.loads(raw)
            ]
        except Exception as e:
            logger.warning("建议卡片生成失败: %s，使用默认卡片", e)
            return self._default_suggestions()

    def _default_suggestions(self) -> list[SuggestionCard]:
        return [
            SuggestionCard(id="low_price", label="查看同款低价", filter_params=SuggestionFilterParams(sort="price_asc")),
            SuggestionCard(id="flagship", label="只看官方旗舰", filter_params=SuggestionFilterParams(store_type="flagship")),
            SuggestionCard(id="high_rating", label="高评价优先", filter_params=SuggestionFilterParams(sort="rating")),
            SuggestionCard(id="best_sales", label="热销款优先", filter_params=SuggestionFilterParams(sort="sales")),
        ]
