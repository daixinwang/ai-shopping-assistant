import json
import logging
import re
from models.filter import FilterParams
from services.ai_client_factory import AIClientFactory

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
}"""

def _clean(raw: str) -> str:
    match = re.search(r'```(?:json)?\s*(.*?)\s*```', raw, re.DOTALL)
    if match:
        return match.group(1).strip()
    return raw.strip()


logger = logging.getLogger(__name__)


class IntentService:
    def __init__(self):
        self.factory = AIClientFactory()

    def parse(self, nl_query: str, category: str = "") -> FilterParams:
        user_text = f"当前商品类目：{category}\n用户输入：\"{nl_query}\""
        try:
            raw = _clean(self.factory.call(system=SYSTEM_PROMPT, text=user_text))
            data = json.loads(raw)
            return FilterParams(**{k: v for k, v in data.items() if v is not None or k == "keywords"})
        except Exception as e:
            logger.warning("意图解析失败: %s，返回空过滤条件", e)
            return FilterParams()
