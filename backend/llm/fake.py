from __future__ import annotations

from collections import deque
from collections.abc import AsyncIterator, Iterable, Sequence
from typing import Any


class FakeChatModel:
    """Deterministic test adapter that never accesses the network."""

    def __init__(
        self,
        responses: Iterable[str | BaseException] = (),
        *,
        streams: Iterable[Iterable[str]] = (),
    ) -> None:
        self._responses = deque(responses)
        self._streams = deque([list(chunks) for chunks in streams])
        self.calls: list[dict[str, Any]] = []

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
        self.calls.append(
            {
                "messages": list(messages),
                "tools": tools,
                "tool_choice": tool_choice,
                "response_schema": response_schema,
                "temperature": temperature,
                "timeout": timeout,
                "max_tokens": max_tokens,
            }
        )
        if not self._responses:
            raise RuntimeError("FakeChatModel has no response queued")
        response = self._responses.popleft()
        if isinstance(response, BaseException):
            raise response
        return response

    async def stream(
        self,
        messages: Sequence[dict[str, Any]],
        *,
        tools: list[dict[str, Any]] | None = None,
        temperature: float | None = None,
        timeout: float | None = None,
        max_tokens: int | None = None,
    ) -> AsyncIterator[str]:
        self.calls.append(
            {
                "messages": list(messages),
                "tools": tools,
                "stream": True,
                "temperature": temperature,
                "timeout": timeout,
                "max_tokens": max_tokens,
            }
        )
        if not self._streams:
            raise RuntimeError("FakeChatModel has no stream queued")
        for chunk in self._streams.popleft():
            yield chunk
