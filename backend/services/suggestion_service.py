import os
import json
import anthropic
from pydantic import ValidationError
from models.recognition import RecognitionResult, SuggestionCard, SuggestionFilterParams

SYSTEM_PROMPT = """你是购物导购助手。
根据商品识别结果，生成4-5个引导购买决策的建议卡片，输出严格的JSON数组，不要输出其他内容，不要添加markdown代码块标记。

输出格式：
[
  {"id": "唯一标识（英文小写）", "label": "卡片文字（8字以内）", "filter_params": {"sort": "可选", "store_type": "可选", "platform": "可选", "rating_min": 可选数字}},
  ...
]

建议卡片示例：
- {"id": "low_price", "label": "查看同款低价", "filter_params": {"sort": "price_asc"}}
- {"id": "flagship", "label": "只看官方旗舰", "filter_params": {"store_type": "flagship"}}
- {"id": "high_rating", "label": "高评价优先", "filter_params": {"sort": "rating", "rating_min": 4.5}}
- {"id": "best_sales", "label": "热销款优先", "filter_params": {"sort": "sales"}}
- {"id": "tmall_only", "label": "天猫专区", "filter_params": {"platform": "tmall"}}"""

class SuggestionService:
    def __init__(self):
        api_key = os.getenv("ANTHROPIC_API_KEY")
        self.client = anthropic.Anthropic(api_key=api_key)
        self.model = os.getenv("SUGGESTION_MODEL", "claude-3-5-haiku-20241022")

    def generate(self, recognition: RecognitionResult) -> list[SuggestionCard]:
        """
        根据识别结果生成建议卡片
        失败时返回默认卡片列表
        """
        user_text = f"""商品识别结果：
类目：{recognition.category} - {recognition.subcategory}
品牌：{recognition.brand or "未知"}
颜色：{recognition.color}
风格：{recognition.style}
关键特征：{', '.join(recognition.key_features)}

请生成4-5个购买建议卡片。"""

        try:
            response = self.client.messages.create(
                model=self.model,
                max_tokens=512,
                system=SYSTEM_PROMPT,
                messages=[{"role": "user", "content": user_text}]
            )
            raw = response.content[0].text.strip()
            if raw.startswith("```"):
                raw = raw.split("```")[1]
                raw = raw.strip()
                if raw.startswith("json"):
                    raw = raw[4:].strip()

            data = json.loads(raw)
            return [SuggestionCard(
                id=item["id"],
                label=item["label"],
                filter_params=SuggestionFilterParams(**item.get("filter_params", {}))
            ) for item in data]

        except Exception as e:
            print(f"[SuggestionService] 生成失败: {e}，使用默认卡片")
            return self._default_suggestions()

    def _default_suggestions(self) -> list[SuggestionCard]:
        return [
            SuggestionCard(id="low_price", label="查看同款低价", filter_params=SuggestionFilterParams(sort="price_asc")),
            SuggestionCard(id="flagship", label="只看官方旗舰", filter_params=SuggestionFilterParams(store_type="flagship")),
            SuggestionCard(id="high_rating", label="高评价优先", filter_params=SuggestionFilterParams(sort="rating")),
            SuggestionCard(id="best_sales", label="热销款优先", filter_params=SuggestionFilterParams(sort="sales")),
        ]
