import base64
from typing import Optional
from services.ai_config import AIConfig


class AIClientFactory:
    """
    统一 AI 调用接口。
    根据 AIConfig 当前 provider，路由到对应 SDK 完成调用，返回纯文本响应。
    """

    def call(
        self,
        system: str,
        text: str,
        image_bytes: Optional[bytes] = None,
        media_type: str = "image/jpeg",
    ) -> str:
        config = AIConfig.get_instance()
        provider = config.provider
        model = config.model
        api_key = config.api_key

        if provider == "anthropic":
            return self._call_anthropic(api_key, model, system, text, image_bytes, media_type)
        elif provider == "openai":
            return self._call_openai(api_key, model, system, text, image_bytes, media_type)
        elif provider == "gemini":
            return self._call_gemini(api_key, model, system, text, image_bytes)
        else:
            raise ValueError(f"不支持的 Provider: {provider}")

    def _call_anthropic(self, api_key, model, system, text, image_bytes, media_type):
        import anthropic
        client = anthropic.Anthropic(api_key=api_key)
        user_content = []
        if image_bytes:
            user_content.append({
                "type": "image",
                "source": {
                    "type": "base64",
                    "media_type": media_type,
                    "data": base64.standard_b64encode(image_bytes).decode(),
                },
            })
        user_content.append({"type": "text", "text": text})
        response = client.messages.create(
            model=model,
            max_tokens=1024,
            system=system,
            messages=[{"role": "user", "content": user_content}],
        )
        return response.content[0].text

    def _call_openai(self, api_key, model, system, text, image_bytes, media_type):
        from openai import OpenAI
        client = OpenAI(api_key=api_key)
        messages = [{"role": "system", "content": system}]
        if image_bytes:
            b64 = base64.standard_b64encode(image_bytes).decode()
            messages.append({
                "role": "user",
                "content": [
                    {"type": "image_url", "image_url": {"url": f"data:{media_type};base64,{b64}"}},
                    {"type": "text", "text": text},
                ],
            })
        else:
            messages.append({"role": "user", "content": text})
        response = client.chat.completions.create(model=model, messages=messages, max_tokens=1024)
        return response.choices[0].message.content

    def _call_gemini(self, api_key, model, system, text, image_bytes):
        import google.generativeai as genai
        genai.configure(api_key=api_key)
        gmodel = genai.GenerativeModel(model_name=model, system_instruction=system)
        parts = []
        if image_bytes:
            import PIL.Image, io
            img = PIL.Image.open(io.BytesIO(image_bytes))
            parts.append(img)
        parts.append(text)
        response = gmodel.generate_content(parts)
        return response.text
