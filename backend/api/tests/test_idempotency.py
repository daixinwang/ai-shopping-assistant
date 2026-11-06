"""Idempotency of side-effecting endpoints.

A client that loses a response retries with the same ``request_id``; the server must
replay the stored result instead of running the agent turn (or cart mutation) again.
"""

from __future__ import annotations

import json
from typing import Iterator

import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def api(tmp_path, monkeypatch):
    from api import main as api_main
    from store.request_ledger import RequestLedger

    monkeypatch.setattr(api_main, "_ledger", RequestLedger(tmp_path / "ledger.sqlite3"))
    api_main._agent = None
    yield api_main
    api_main._agent = None


class CountingAgent:
    """Fake agent whose every executed turn is a visible side effect."""

    def __init__(self) -> None:
        self.turns = 0

    def handle_turn(self, query, session):
        from agent.intent_router import IntentDecision
        from agent.orchestrator import AgentResponse
        from agent.tools.base import ToolResult

        self.turns += 1
        return AgentResponse(
            decision=IntentDecision(tool="cart", rewritten_query=query, confidence="high", reasoning="t"),
            tool_result=ToolResult(tool_name="cart", payload={"action": "add", "cart": {"item_count": self.turns}}),
            narrative="已加入购物车",
            trace={"timings": {}},
        )

    def handle_turn_stream(self, query, session) -> Iterator[dict]:
        self.turns += 1
        yield {"type": "meta", "data": {"decision": {"tool": "cart"}, "trace": {"timings": {}}}}
        yield {"type": "tool_result", "data": {"tool_name": "cart", "payload": {"action": "add", "cart": {"item_count": self.turns}}}}
        yield {"type": "token", "data": "已加入"}
        yield {"type": "token", "data": "购物车"}
        yield {"type": "done", "data": {"timings": {}, "narrative": "已加入购物车"}}


def _events(text: str) -> list[tuple[str, object]]:
    events = []
    for block in text.strip().split("\n\n"):
        lines = block.splitlines()
        name = next(line[7:] for line in lines if line.startswith("event: "))
        data = next(line[6:] for line in lines if line.startswith("data: "))
        events.append((name, json.loads(data)))
    return events


def test_repeated_chat_request_runs_the_turn_once(api) -> None:
    agent = CountingAgent()
    api._agent = agent
    client = TestClient(api.app)
    body = {"query": "把第一个加入购物车", "request_id": "req-chat-0001"}

    first = client.post("/chat", json=body)
    second = client.post("/chat", json=body)

    assert agent.turns == 1
    assert second.status_code == 200
    assert second.json() == first.json()
    assert second.headers.get("idempotent-replay") == "true"


def test_stream_retry_replays_the_stored_turn(api) -> None:
    agent = CountingAgent()
    api._agent = agent
    client = TestClient(api.app)
    body = {"query": "加入购物车", "request_id": "req-stream-001"}

    client.post("/chat/stream", json=body)
    replay = _events(client.post("/chat/stream", json=body).text)

    assert agent.turns == 1
    names = [name for name, _ in replay]
    assert names[0] == "session" and names[-1] == "done"
    tool = next(data for name, data in replay if name == "tool_result")
    assert tool["payload"]["cart"]["item_count"] == 1
    assert replay[-1][1]["narrative"] == "已加入购物车"
    assert replay[-1][1]["replayed"] is True


def test_blocking_retry_after_a_stream_shares_its_result(api) -> None:
    agent = CountingAgent()
    api._agent = agent
    client = TestClient(api.app)
    body = {"query": "加入购物车", "request_id": "req-mixed-001"}

    client.post("/chat/stream", json=body)
    retried = client.post("/chat", json=body).json()

    assert agent.turns == 1
    assert retried["narrative"] == "已加入购物车"
    assert retried["tool_result"]["payload"]["cart"]["item_count"] == 1


def test_stream_dropped_after_tool_result_is_not_executed_again(api) -> None:
    agent = CountingAgent()
    api._agent = agent

    events = api.open_chat_stream(api.ChatRequest(query="加入购物车", request_id="req-drop-0001"))
    for chunk in events:
        if chunk.startswith("event: tool_result"):
            break
    events.close()  # The client disconnected before the answer finished.

    retried = TestClient(api.app).post(
        "/chat", json={"query": "加入购物车", "request_id": "req-drop-0001"}
    ).json()
    assert agent.turns == 1
    assert retried["tool_result"]["payload"]["cart"]["item_count"] == 1


def test_stream_dropped_before_any_tool_ran_can_be_retried(api) -> None:
    agent = CountingAgent()
    api._agent = agent

    events = api.open_chat_stream(api.ChatRequest(query="推荐耳机", request_id="req-early-001"))
    next(events)  # Only the session frame was delivered.
    events.close()

    retried = TestClient(api.app).post("/chat", json={"query": "推荐耳机", "request_id": "req-early-001"})
    assert retried.status_code == 200
    assert agent.turns == 1


@pytest.mark.parametrize("path", ["/chat", "/chat/stream"])
def test_request_in_progress_is_rejected(api, path) -> None:
    api._agent = CountingAgent()
    api._ledger.claim("req-busy-0001", "chat")

    response = TestClient(api.app).post(path, json={"query": "下单", "request_id": "req-busy-0001"})

    assert response.status_code == 409
    assert response.json()["code"] == "request_in_progress"
    assert response.json()["retryable"] is True


def test_malformed_request_id_is_rejected(api) -> None:
    api._agent = CountingAgent()
    response = TestClient(api.app).post("/chat", json={"query": "x", "request_id": "bad id"})
    assert response.status_code == 422


def test_cart_mutation_is_applied_once_per_request_id(api, monkeypatch) -> None:
    added: list[str] = []

    class FakeCartStore:
        def add_product(self, product_id, sku_id=None, quantity=1):
            added.append(product_id)

        def list_items(self):
            return []

    monkeypatch.setattr(api, "CartStore", FakeCartStore)
    client = TestClient(api.app)
    body = {"action": "add", "productID": "p1", "request_id": "req-cart-0001"}

    first = client.post("/cart/mutate", json=body)
    second = client.post("/cart/mutate", json=body)

    assert added == ["p1"]
    assert second.json() == first.json()
