from __future__ import annotations

from collections.abc import AsyncIterator, Sequence
from typing import Any, Protocol


class ChatModel(Protocol):
    """Small provider-neutral interface used by CartPilot LLM consumers."""

    async def complete(
        self,
        messages: Sequence[dict[str, Any]],
        *,
        tools: list[dict[str, Any]] | None = None,
        response_schema: dict[str, Any] | None = None,
    ) -> str:
        """Return the assistant text for a list of chat messages."""

    async def stream(
        self,
        messages: Sequence[dict[str, Any]],
        *,
        tools: list[dict[str, Any]] | None = None,
    ) -> AsyncIterator[str]:
        """Stream assistant text chunks."""
        if False:  # pragma: no cover - marks this Protocol member as an async generator
            yield ""
