import base64
import asyncio
import os
from typing import Optional

from services.ai_config import AIConfig


class AIClientFactory:
    """Unified AI call interface for Anthropic, OpenAI, Gemini, and Doubao."""

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
        if provider == "openai":
            return self._call_openai(api_key, model, system, text, image_bytes, media_type)
        if provider == "gemini":
            return self._call_gemini(api_key, model, system, text, image_bytes, media_type)
        if provider == "doubao":
            return self._call_doubao(api_key, model, system, text, image_bytes, media_type)
        raise ValueError(f"Unsupported provider: {provider}")

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
        if not response.content:
            raise ValueError("Anthropic returned an empty response")
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
        if not response.choices:
            raise ValueError("OpenAI returned an empty response")
        return response.choices[0].message.content

    def _call_gemini(self, api_key, model, system, text, image_bytes, media_type="image/jpeg"):
        import google.generativeai as genai

        genai.configure(api_key=api_key)
        gmodel = genai.GenerativeModel(model_name=model, system_instruction=system)
        parts = []
        if image_bytes:
            import io
            import PIL.Image

            img = PIL.Image.open(io.BytesIO(image_bytes))
            parts.append(img)
        parts.append(text)
        response = gmodel.generate_content(parts)
        return response.text

    def _call_doubao(self, api_key, model, system, text, image_bytes, media_type):
        from llm.doubao import DoubaoChatModel, DoubaoSettings

        settings = DoubaoSettings(
            api_key=os.getenv("CHAT_API_KEY") or os.getenv("ARK_API_KEY") or api_key,
            base_url=os.getenv("CHAT_BASE_URL") or os.getenv("ARK_BASE_URL") or "",
            model=os.getenv("CHAT_MODEL") or os.getenv("ARK_MODEL") or model,
        )
        if not settings.api_key or not settings.base_url or not settings.model:
            raise RuntimeError("Doubao chat configuration is incomplete")
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
        adapter = DoubaoChatModel(settings)
        return asyncio.run(adapter.complete(messages))
