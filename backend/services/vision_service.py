import json
import logging
import re

from pydantic import ValidationError

from models.recognition import RecognitionResult
from services.ai_client_factory import AIClientFactory
from services.ai_config import AIConfig

SYSTEM_PROMPT = """你是专业商品识别专家。
请分析图片并只输出严格 JSON，不要输出解释、Markdown 或代码块。

输出格式：
{
  "category": "主类目，必须是：运动鞋/手机/耳机/T恤/包包 之一",
  "subcategory": "子类目",
  "brand": "品牌名称，无法识别时为 null",
  "color": "主色调，例如：黑色/白色/黑白/红色",
  "style": "简短风格描述，10 字以内",
  "key_features": ["特征1", "特征2", "特征3"],
  "search_keywords": ["关键词1", "关键词2"]
}"""

class VisionUnavailableError(RuntimeError):
    """Raised when recognition cannot safely produce a factual result."""


def _clean(raw: str) -> str:
    match = re.search(r"```(?:json)?\s*(.*?)\s*```", raw, re.DOTALL)
    if match:
        return match.group(1).strip()
    return raw.strip()


logger = logging.getLogger(__name__)


class VisionService:
    def __init__(self):
        self.factory = AIClientFactory()
        self.max_retries = 2

    def identify(self, image_bytes: bytes, media_type: str = "image/jpeg") -> RecognitionResult:
        logger.info("开始识别图片 size=%d", len(image_bytes))

        if not AIConfig.get_instance().api_key:
            raise VisionUnavailableError("vision provider is not configured")

        last_error = None
        raw_response = None

        for attempt in range(self.max_retries):
            prompt = "请识别这个商品并输出 JSON。"
            if attempt > 0 and raw_response:
                prompt = f"上次输出无法解析，请严格按 JSON 格式重新输出：\n{raw_response}"
            try:
                raw_response = _clean(self.factory.call(
                    system=SYSTEM_PROMPT,
                    text=prompt,
                    image_bytes=image_bytes,
                    media_type=media_type,
                ))
                return RecognitionResult(**json.loads(raw_response))
            except (json.JSONDecodeError, ValidationError, KeyError, ValueError) as e:
                last_error = e

        logger.warning("识别失败，未返回猜测商品")
        raise VisionUnavailableError("vision provider returned an unusable response")
