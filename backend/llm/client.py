from __future__ import annotations

"""Thin wrapper around an OpenAI-compatible Doubao Ark client.

Ark uses the OpenAI SDK protocol. This module loads provider configuration from the
environment and exposes process-wide clients to reuse HTTP connections.
"""

import os
import asyncio
import queue
import threading
from types import SimpleNamespace
from functools import lru_cache
from pathlib import Path
from typing import TYPE_CHECKING

import httpx
from dotenv import load_dotenv

if TYPE_CHECKING:
    from llm.base import ChatModel

PROJECT_ROOT = Path(__file__).resolve().parents[2]


def _load_env_once() -> None:
    """Load repository-root ``.env`` values without overriding the environment."""
    load_dotenv(PROJECT_ROOT / ".env", override=False)


_chat_model_override: "ChatModel | None" = None


def _run(coro):
    """Run one async adapter call from the legacy synchronous agent pipeline."""
    try:
        asyncio.get_running_loop()
    except RuntimeError:
        return asyncio.run(coro)
    raise RuntimeError("Synchronous ChatModel bridge cannot run on an active event loop")


def _iterate_async(async_iterator):
    """Expose an async text stream to the legacy sync composer without buffering."""
    items: queue.Queue[object] = queue.Queue()
    finished = object()

    async def pump() -> None:
        try:
            async for item in async_iterator:
                items.put(item)
        except BaseException as exc:  # delivered to the consuming thread
            items.put(exc)
        finally:
            items.put(finished)

    threading.Thread(target=lambda: asyncio.run(pump()), daemon=True).start()
    while True:
        item = items.get()
        if item is finished:
            return
        if isinstance(item, BaseException):
            raise item
        yield item


class _ChatCompletionsBridge:
    def create(self, *, messages, tools=None, tool_choice=None, stream=False, **_kwargs):
        model = get_chat_model()
        if stream:
            return (
                SimpleNamespace(
                    choices=[SimpleNamespace(delta=SimpleNamespace(content=chunk))]
                )
                for chunk in _iterate_async(model.stream(messages, tools=tools))
            )

        text = _run(model.complete(messages, tools=tools, response_schema=None))
        tool_calls = None
        if tools:
            name = None
            if isinstance(tool_choice, dict):
                name = (tool_choice.get("function") or {}).get("name")
            if not name:
                name = (tools[0].get("function") or {}).get("name")
            function = SimpleNamespace(name=name or "tool", arguments=text)
            tool_calls = [SimpleNamespace(function=function)]
        message = SimpleNamespace(content=None if tools else text, tool_calls=tool_calls)
        return SimpleNamespace(choices=[SimpleNamespace(message=message)])


class ChatModelSyncBridge:
    """OpenAI-shaped compatibility facade backed exclusively by ChatModel."""

    def __init__(self) -> None:
        self.chat = SimpleNamespace(completions=_ChatCompletionsBridge())


@lru_cache(maxsize=1)
def get_client() -> ChatModelSyncBridge:
    """Return the compatibility bridge; no provider SDK is exposed to consumers."""
    _load_env_once()
    return ChatModelSyncBridge()


def get_model_id() -> str:
    """Return the configured default model or endpoint ID."""
    _load_env_once()
    from services.model_config import chat_settings

    return chat_settings().model


@lru_cache(maxsize=1)
def get_chat_model():
    """Return the shared provider-neutral chat adapter."""
    from llm.doubao import DoubaoChatModel

    from services.model_config import chat_settings

    return _chat_model_override or DoubaoChatModel(chat_settings())


def set_chat_model(model: "ChatModel") -> None:
    """Inject a ChatModel for tests or application composition."""
    global _chat_model_override
    _chat_model_override = model
    get_chat_model.cache_clear()
    get_client.cache_clear()


def reset_chat_model() -> None:
    global _chat_model_override
    _chat_model_override = None
    get_chat_model.cache_clear()
    get_client.cache_clear()


@lru_cache(maxsize=1)
def get_embedding_client() -> OpenAI:
    """Return the process-wide embedding client.

    Embeddings may use a separate API key and base URL. Keys fall back from
    ``ARK_EMBEDDING_API_KEY`` to ``ARK_API_KEY``; base URLs fall back from
    ``ARK_EMBEDDING_BASE_URL`` to ``ARK_BASE_URL`` and then the default Ark endpoint.
    """
    from openai import OpenAI

    _load_env_once()
    api_key = os.getenv("EMBEDDING_API_KEY") or os.getenv("ARK_EMBEDDING_API_KEY")
    if not api_key:
        raise RuntimeError(
            "The embedding API key is missing. Set EMBEDDING_API_KEY "
            "or legacy ARK_EMBEDDING_API_KEY."
        )
    base_url = (
        os.getenv("EMBEDDING_BASE_URL") or os.getenv("ARK_EMBEDDING_BASE_URL")
    )
    if not base_url:
        raise RuntimeError(
            "The embedding base URL is missing. Set EMBEDDING_BASE_URL "
            "or legacy ARK_EMBEDDING_BASE_URL."
        )
    timeout = float(os.getenv("ARK_TIMEOUT", "30"))
    max_retries = int(os.getenv("ARK_MAX_RETRIES", "1"))
    return OpenAI(
        api_key=api_key,
        base_url=base_url,
        timeout=timeout,
        max_retries=max_retries,
    )


@lru_cache(maxsize=1)
def get_rerank_client() -> httpx.Client:
    """Return the process-wide reranking HTTP client.

    Cloud reranking avoids large local inference dependencies such as PyTorch and
    sentence-transformers. The configured service uses bearer authentication.

    ``RERANK_API_KEY`` is preferred; ``ZHIPU_API_KEY`` remains a compatibility alias.
    """
    _load_env_once()
    api_key = os.getenv("RERANK_API_KEY") or os.getenv("ZHIPU_API_KEY")
    if not api_key:
        raise RuntimeError(
            "The reranking API key is missing. Set RERANK_API_KEY in .env, "
            "or set USE_RERANK=0 when reranking is not required."
        )
    timeout = float(os.getenv("RERANK_TIMEOUT", os.getenv("ARK_TIMEOUT", "30")))
    return httpx.Client(
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        timeout=timeout,
    )


def get_rerank_base_url() -> str:
    """Return the reranking endpoint URL."""
    _load_env_once()
    base_url = os.getenv("RERANK_BASE_URL")
    if not base_url:
        raise RuntimeError("RERANK_BASE_URL is missing. Set the reranking endpoint URL in .env.")
    return base_url


def get_rerank_model_id() -> str:
    """Return the configured reranking model name."""
    _load_env_once()
    model = os.getenv("RERANK_MODEL")
    if not model:
        raise RuntimeError("RERANK_MODEL is missing. Set the reranking model ID in .env.")
    return model
