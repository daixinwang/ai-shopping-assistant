import os
import json
import base64
import anthropic
from pathlib import Path
from pydantic import ValidationError
from models.recognition import RecognitionResult

SYSTEM_PROMPT = """你是专业商品识别专家。
分析图片并输出严格的JSON格式，不要输出任何其他内容，不要添加markdown代码块标记。

输出格式：
{
  "category": "主类目（必须是以下之一：运动鞋/手机/耳机/T恤/包包，无法判断填最相近的）",
  "subcategory": "子类目",
  "brand": "品牌名称，无法识别填null",
  "color": "主色调（如：黑色/白色/黑白/红色等）",
  "style": "简短风格描述（10字以内）",
  "key_features": ["特征1", "特征2", "特征3"],
  "search_keywords": ["关键词1", "关键词2"]
}"""

class VisionService:
    def __init__(self):
        api_key = os.getenv("ANTHROPIC_API_KEY")
        self.client = anthropic.Anthropic(api_key=api_key)
        self.model = os.getenv("VISION_MODEL", "claude-3-5-sonnet-20241022")
        self.max_retries = 2

    def identify(self, image_bytes: bytes, media_type: str = "image/jpeg") -> RecognitionResult:
        """
        图像识别主方法
        - 将图片 base64 编码后发送给 Claude
        - 解析 JSON 响应为 RecognitionResult
        - 失败时携带原始输出重试，超过 max_retries 返回降级结果
        """
        image_b64 = base64.standard_b64encode(image_bytes).decode("utf-8")
        last_error = None
        raw_response = None

        for attempt in range(self.max_retries):
            user_content = []

            if attempt > 0 and raw_response:
                # 重试时携带上次的失败输出
                user_content.append({
                    "type": "text",
                    "text": f"上次输出无法解析，请严格按JSON格式重新输出：\n{raw_response}"
                })

            user_content.append({
                "type": "image",
                "source": {
                    "type": "base64",
                    "media_type": media_type,
                    "data": image_b64,
                }
            })
            user_content.append({
                "type": "text",
                "text": "请识别这个商品并输出JSON。"
            })

            try:
                response = self.client.messages.create(
                    model=self.model,
                    max_tokens=1024,
                    system=SYSTEM_PROMPT,
                    messages=[{"role": "user", "content": user_content}]
                )
                raw_response = response.content[0].text.strip()

                # 清理可能的 markdown 代码块
                if raw_response.startswith("```"):
                    raw_response = raw_response.split("```")[1]
                    raw_response = raw_response.strip()
                    if raw_response.startswith("json"):
                        raw_response = raw_response[4:].strip()

                data = json.loads(raw_response)
                return RecognitionResult(**data)

            except (json.JSONDecodeError, ValidationError, KeyError) as e:
                last_error = e
                continue

        # 降级结果
        print(f"[VisionService] 识别失败，返回降级结果。最后错误: {last_error}")
        return RecognitionResult(
            category="未知商品",
            subcategory="未知",
            brand=None,
            color="未知",
            style="未知",
            key_features=[],
            search_keywords=[]
        )
