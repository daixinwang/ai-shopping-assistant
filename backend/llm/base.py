from __future__ import annotations

from collections.abc import AsyncIterator, Sequence
from typing import Any, Protocol


class ChatModel(Protocol):
    """Small provider-neutral interface used by CartPilot LLM consumers.

    Generation options default to ``None``, meaning "use the provider/configured
    default". Implementations must forward explicit values, including falsy ones such
    as ``temperature=0.0``.
    """

    async def complete(
        self,
        messages: Sequence[dict[str, Any]],
        *,
        tools: list[dict[str, Any]] | None = None,
        tool_choice: dict[str, Any] | str | None = None,
        response_schema: dict[str, Any] | None = None,
        temperature: float | None = None,
        timeout: float | None = None,
        max_tokens: int | None = None,
    ) -> str:
        """Return the assistant text for a list of chat messages."""

    async def stream(
        self,
        messages: Sequence[dict[str, Any]],
        *,
        tools: list[dict[str, Any]] | None = None,
        temperature: float | None = None,
        timeout: float | None = None,
        max_tokens: int | None = None,
    ) -> AsyncIterator[str]:
        """Stream assistant text chunks."""
        if False:  # pragma: no cover - marks this Protocol member as an async generator
            yield ""
