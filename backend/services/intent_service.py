import os
import json
import anthropic
from pydantic import ValidationError
from models.recognition import RecognitionResult
from models.filter import FilterParams

SYSTEM_PROMPT = """你是购物助手，请从用户的自然语言中提取结构化筛选条件，输出严格的JSON，不要输出其他内容，不要添加markdown代码块标记。

输出格式（无法确定的字段填null）：
{
  "price_max": 数字或null,
  "price_min": 数字或null,
  "color": "颜色关键词或null",
  "rating_min": 数字或null,
  "platform": "tmall/jd/pdd之一或null",
  "store_type": "flagship/official/third_party之一或null",
  "sort": "price_asc/price_desc/sales/rating之一或null",
  "keywords": ["额外关键词列表"]
}

示例：
用户："帮我找1000元以内的黑色款，要评价4.8分以上的"
输出：{"price_max": 1000, "price_min": null, "color": "黑色", "rating_min": 4.8, "platform": null, "store_type": null, "sort": null, "keywords": []}"""

class IntentService:
    def __init__(self):
        api_key = os.getenv("ANTHROPIC_API_KEY")
        self.client = anthropic.Anthropic(api_key=api_key)
        self.model = os.getenv("INTENT_MODEL", "claude-3-5-haiku-20241022")

    def parse(self, nl_query: str, category: str = "") -> FilterParams:
        """
        将自然语言转换为结构化筛选条件
        失败时返回空 FilterParams（不过滤）
        """
        user_text = f"当前商品类目：{category}\n用户输入：\"{nl_query}\""

        try:
            response = self.client.messages.create(
                model=self.model,
                max_tokens=256,
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
            # 将 null 值过滤（Pydantic 会处理 None）
            return FilterParams(**{k: v for k, v in data.items() if v is not None or k == "keywords"})

        except Exception as e:
            print(f"[IntentService] 解析失败: {e}，返回空过滤条件")
            return FilterParams()
