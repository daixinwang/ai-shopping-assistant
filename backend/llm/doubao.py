from __future__ import annotations

import os
import json
from collections.abc import AsyncIterator
from dataclasses import dataclass
from typing import Any, Sequence


@dataclass(frozen=True)
class DoubaoSettings:
    api_key: str
    base_url: str
    model: str
    timeout: float = 30.0
    max_retries: int = 1

    @classmethod
    def from_env(cls) -> "DoubaoSettings":
        api_key = os.getenv("CHAT_API_KEY") or os.getenv("ARK_API_KEY")
        base_url = os.getenv("CHAT_BASE_URL") or os.getenv("ARK_BASE_URL")
        model = os.getenv("CHAT_MODEL") or os.getenv("ARK_MODEL")
        missing = [
            name
            for name, value in (
                ("CHAT_API_KEY (or ARK_API_KEY)", api_key),
                ("CHAT_BASE_URL (or ARK_BASE_URL)", base_url),
                ("CHAT_MODEL (or ARK_MODEL)", model),
            )
            if not value
        ]
        if missing:
            raise RuntimeError("Missing chat configuration: " + ", ".join(missing))
        return cls(
            api_key=api_key,
            base_url=base_url,
            model=model,
            timeout=float(os.getenv("CHAT_TIMEOUT", os.getenv("ARK_TIMEOUT", "30"))),
            max_retries=int(
                os.getenv("CHAT_MAX_RETRIES", os.getenv("ARK_MAX_RETRIES", "1"))
            ),
        )


class DoubaoChatModel:
    """OpenAI-compatible chat adapter configured without provider defaults."""

    def __init__(self, settings: DoubaoSettings | None = None, client: Any | None = None):
        self.settings = settings or DoubaoSettings.from_env()
        if client is None:
            from openai import AsyncOpenAI

            client = AsyncOpenAI(
                api_key=self.settings.api_key,
                base_url=self.settings.base_url,
                timeout=self.settings.timeout,
                max_retries=self.settings.max_retries,
            )
        self.client = client

    async def complete(
        self,
        messages: Sequence[dict[str, Any]],
        *,
        tools: list[dict[str, Any]] | None = None,
        response_schema: dict[str, Any] | None = None,
    ) -> str:
        kwargs: dict[str, Any] = {
            "model": self.settings.model,
            "messages": list(messages),
            "timeout": self.settings.timeout,
        }
        if tools is not None:
            kwargs["tools"] = tools
        if response_schema is not None:
            kwargs["response_format"] = response_schema
        response = await self.client.chat.completions.create(**kwargs)
        message = response.choices[0].message
        if getattr(message, "tool_calls", None):
            # The unified protocol carries structured tool arguments as JSON text.
            return str(message.tool_calls[0].function.arguments or "{}").strip()
        return (message.content or "").strip()

    async def stream(
        self,
        messages: Sequence[dict[str, Any]],
        *,
        tools: list[dict[str, Any]] | None = None,
    ) -> AsyncIterator[str]:
        kwargs: dict[str, Any] = {
            "model": self.settings.model,
            "messages": list(messages),
            "timeout": self.settings.timeout,
            "stream": True,
        }
        if tools is not None:
            kwargs["tools"] = tools
        response = await self.client.chat.completions.create(**kwargs)
        async for chunk in response:
            if not getattr(chunk, "choices", None):
                continue
            text = getattr(chunk.choices[0].delta, "content", None)
            if text:
                yield text
