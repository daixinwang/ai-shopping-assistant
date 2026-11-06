from __future__ import annotations

import pytest


TOOLS = [{"type": "function", "function": {"name": "route_to_tool"}}]
CHOICE = {"type": "function", "function": {"name": "route_to_tool"}}


def test_bridge_forwards_generation_options_to_chat_model() -> None:
    from llm.client import get_client, reset_chat_model, set_chat_model
    from llm.fake import FakeChatModel

    fake = FakeChatModel(['{"tool": "recommend"}'])
    set_chat_model(fake)
    try:
        get_client().chat.completions.create(
            model="ignored-by-bridge",
            messages=[{"role": "user", "content": "推荐耳机"}],
            tools=TOOLS,
            tool_choice=CHOICE,
            temperature=0.1,
            timeout=6.5,
            max_tokens=64,
        )
    finally:
        reset_chat_model()

    call = fake.calls[0]
    assert call.get("tool_choice") == CHOICE
    assert call.get("temperature") == 0.1
    assert call.get("timeout") == 6.5
    assert call.get("max_tokens") == 64


def test_bridge_forwards_zero_temperature() -> None:
    from llm.client import get_client, reset_chat_model, set_chat_model
    from llm.fake import FakeChatModel

    fake = FakeChatModel(["{}"])
    set_chat_model(fake)
    try:
        get_client().chat.completions.create(messages=[], tools=TOOLS, tool_choice=CHOICE, temperature=0.0)
    finally:
        reset_chat_model()

    assert fake.calls[0].get("temperature") == 0.0


def test_stream_bridge_forwards_generation_options() -> None:
    from llm.client import get_client, reset_chat_model, set_chat_model
    from llm.fake import FakeChatModel

    fake = FakeChatModel(streams=[["a", "b"]])
    set_chat_model(fake)
    try:
        stream = get_client().chat.completions.create(
            messages=[], stream=True, temperature=0.4, timeout=12.0
        )
        assert [chunk.choices[0].delta.content for chunk in stream] == ["a", "b"]
    finally:
        reset_chat_model()

    assert fake.calls[0].get("temperature") == 0.4
    assert fake.calls[0].get("timeout") == 12.0


class _RecordingCompletions:
    def __init__(self) -> None:
        self.calls: list[dict] = []

    async def create(self, **kwargs):
        self.calls.append(kwargs)
        if kwargs.get("stream"):
            async def chunks():
                delta = type("Delta", (), {"content": "x"})()
                yield type("Chunk", (), {"choices": [type("C", (), {"delta": delta})()]})()
            return chunks()
        message = type("Message", (), {"content": "done", "tool_calls": None})()
        return type("Response", (), {"choices": [type("C", (), {"message": message})()]})()


def _doubao_with(completions):
    from llm.doubao import DoubaoChatModel, DoubaoSettings

    client = type("Client", (), {"chat": type("Chat", (), {"completions": completions})()})()
    return DoubaoChatModel(DoubaoSettings("k", "https://example.invalid/v1", "m", timeout=30.0), client=client)


@pytest.mark.asyncio
async def test_doubao_adapter_sends_forced_tool_choice_temperature_and_timeout() -> None:
    completions = _RecordingCompletions()
    model = _doubao_with(completions)

    await model.complete([], tools=TOOLS, tool_choice=CHOICE, temperature=0.0, timeout=5.0, max_tokens=20)
    _ = [chunk async for chunk in model.stream([], temperature=0.4, timeout=9.0)]

    sent, streamed = completions.calls
    assert sent.get("tool_choice") == CHOICE
    assert sent.get("temperature") == 0.0
    assert sent.get("timeout") == 5.0
    assert sent.get("max_tokens") == 20
    assert streamed.get("temperature") == 0.4
    assert streamed.get("timeout") == 9.0


@pytest.mark.asyncio
async def test_doubao_adapter_uses_configured_timeout_when_caller_omits_it() -> None:
    completions = _RecordingCompletions()
    model = _doubao_with(completions)

    await model.complete([])

    assert completions.calls[0]["timeout"] == 30.0
    assert "temperature" not in completions.calls[0]
    assert "tool_choice" not in completions.calls[0]
