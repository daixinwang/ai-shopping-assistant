import json
import logging
import re

from models.filter import FilterParams
from services.ai_client_factory import AIClientFactory
from services.ai_config import AIConfig

SYSTEM_PROMPT = """你是购物助手，请从用户自然语言中提取结构化筛选条件。
只输出严格 JSON，不要输出解释、Markdown 或代码块。

输出格式，无法确定的字段填 null：
{
  "price_max": 数字或 null,
  "price_min": 数字或 null,
  "color": "颜色关键词或 null",
  "rating_min": 数字或 null,
  "platform": "tmall/jd/pdd 之一或 null",
  "store_type": "flagship/official/third_party 之一或 null",
  "sort": "price_asc/price_desc/sales/rating 之一或 null",
  "keywords": ["额外关键词列表"]
}"""


def _clean(raw: str) -> str:
    match = re.search(r"```(?:json)?\s*(.*?)\s*```", raw, re.DOTALL)
    if match:
        return match.group(1).strip()
    return raw.strip()


logger = logging.getLogger(__name__)


class IntentService:
    def __init__(self):
        self.factory = AIClientFactory()

    def parse(self, nl_query: str, category: str = "") -> FilterParams:
        if not AIConfig.get_instance().api_key:
            return self._parse_with_rules(nl_query)

        user_text = f"当前商品类目：{category}\n用户输入：\"{nl_query}\""
        try:
            raw = _clean(self.factory.call(system=SYSTEM_PROMPT, text=user_text))
            data = json.loads(raw)
            return FilterParams(**{k: v for k, v in data.items() if v is not None or k == "keywords"})
        except Exception as e:
            logger.warning("意图解析失败，使用规则降级: %s", e)
            return self._parse_with_rules(nl_query)

    def _parse_with_rules(self, query: str) -> FilterParams:
        text = query.strip()
        filters = FilterParams()

        price_max = re.search(r"(\d+(?:\.\d+)?)\s*(?:元|块)?\s*(?:以内|以下|之内|内)", text)
        if price_max:
            filters.price_max = float(price_max.group(1))

        price_min = re.search(r"(\d+(?:\.\d+)?)\s*(?:元|块)?\s*(?:以上|起)", text)
        if price_min and "分" not in text[max(0, price_min.start() - 2):price_min.end() + 2]:
            filters.price_min = float(price_min.group(1))

        rating_min = re.search(r"(?:评分|评价|好评|分数)?\s*(\d(?:\.\d)?)\s*分?\s*(?:以上|起)", text)
        if rating_min:
            filters.rating_min = float(rating_min.group(1))

        for color in ["黑色", "白色", "蓝色", "深蓝色", "红色", "灰色", "绿色", "黄色", "粉色", "棕色"]:
            if color in text:
                filters.color = color
                break

        if "天猫" in text or "tmall" in text.lower():
            filters.platform = "tmall"
        elif "京东" in text or "jd" in text.lower():
            filters.platform = "jd"
        elif "拼多多" in text or "pdd" in text.lower():
            filters.platform = "pdd"

        if "旗舰" in text:
            filters.store_type = "flagship"
        elif "官方" in text or "自营" in text:
            filters.store_type = "official"

        if "便宜" in text or "低价" in text or "价格从低" in text:
            filters.sort = "price_asc"
        elif "销量" in text or "爆款" in text or "热销" in text:
            filters.sort = "sales"
        elif "好评" in text or "评分" in text:
            filters.sort = "rating"

        return filters
