from __future__ import annotations

import base64
import json

import pytest
from fastapi.testclient import TestClient


@pytest.mark.asyncio
async def test_fake_chat_model_is_deterministic() -> None:
    from llm.fake import FakeChatModel

    model = FakeChatModel(["first", "second"])

    assert await model.complete(
        [{"role": "user", "content": "one"}],
        tools=[{"type": "function", "function": {"name": "pick"}}],
        response_schema={"type": "json_object"},
    ) == "first"
    assert await model.complete([{"role": "user", "content": "two"}]) == "second"
    assert len(model.calls) == 2
    assert model.calls[0]["tools"][0]["function"]["name"] == "pick"
    assert model.calls[0]["response_schema"] == {"type": "json_object"}


@pytest.mark.asyncio
async def test_fake_chat_model_streams_deterministic_chunks() -> None:
    from llm.fake import FakeChatModel

    model = FakeChatModel(streams=[["a", "b"]])

    assert [chunk async for chunk in model.stream([])] == ["a", "b"]


@pytest.mark.asyncio
async def test_doubao_adapter_forwards_tools_schema_and_stream() -> None:
    from llm.doubao import DoubaoChatModel, DoubaoSettings

    class Completions:
        def __init__(self):
            self.calls = []

        async def create(self, **kwargs):
            self.calls.append(kwargs)
            if kwargs.get("stream"):
                async def chunks():
                    for text in ("x", "y"):
                        delta = type("Delta", (), {"content": text})()
                        yield type("Chunk", (), {"choices": [type("C", (), {"delta": delta})()]})()
                return chunks()
            message = type("Message", (), {"content": "done"})()
            return type("Response", (), {"choices": [type("C", (), {"message": message})()]})()

    completions = Completions()
    client = type("Client", (), {"chat": type("Chat", (), {"completions": completions})()})()
    model = DoubaoChatModel(
        DoubaoSettings("k", "https://example.invalid/v1", "m"), client=client
    )
    tools = [{"type": "function", "function": {"name": "pick"}}]
    schema = {"type": "json_object"}

    assert await model.complete([], tools=tools, response_schema=schema) == "done"
    assert [chunk async for chunk in model.stream([], tools=tools)] == ["x", "y"]
    assert completions.calls[0]["tools"] == tools
    assert completions.calls[0]["response_format"] == schema


def test_chat_settings_prefer_new_names_and_support_ark(monkeypatch) -> None:
    from llm.doubao import DoubaoSettings

    monkeypatch.setenv("CHAT_API_KEY", "new-key")
    monkeypatch.setenv("CHAT_BASE_URL", "https://chat.example/v1")
    monkeypatch.setenv("CHAT_MODEL", "new-model")
    monkeypatch.setenv("ARK_API_KEY", "old-key")
    monkeypatch.setenv("ARK_BASE_URL", "https://old.example/v1")
    monkeypatch.setenv("ARK_MODEL", "old-model")

    settings = DoubaoSettings.from_env()

    assert settings.api_key == "new-key"
    assert settings.base_url == "https://chat.example/v1"
    assert settings.model == "new-model"


def test_lexical_mode_needs_no_embedding_or_reranker(monkeypatch) -> None:
    from search.config import RetrievalSettings

    for name in (
        "RETRIEVAL_MODE", "EMBEDDING_API_KEY", "EMBEDDING_BASE_URL",
        "EMBEDDING_MODEL", "ARK_EMBEDDING_API_KEY", "ARK_EMBEDDING_BASE_URL",
        "ARK_EMBEDDING_MODEL", "RERANK_API_KEY", "ZHIPU_API_KEY", "RERANK_MODEL", "USE_RERANK",
        "USE_HYBRID",
    ):
        monkeypatch.delenv(name, raising=False)

    settings = RetrievalSettings.from_env()

    assert settings.mode == "lexical"
    assert settings.vector_search is False
    assert settings.reranker is False


def test_hybrid_mode_requires_complete_embedding_config(monkeypatch) -> None:
    from search.config import RetrievalConfigurationError, RetrievalSettings

    monkeypatch.setenv("RETRIEVAL_MODE", "hybrid")
    monkeypatch.setenv("EMBEDDING_API_KEY", "key")
    monkeypatch.delenv("EMBEDDING_BASE_URL", raising=False)
    monkeypatch.delenv("EMBEDDING_MODEL", raising=False)

    with pytest.raises(RetrievalConfigurationError, match="EMBEDDING_BASE_URL"):
        RetrievalSettings.from_env()


def test_reranker_accepts_provider_neutral_api_key(monkeypatch) -> None:
    from search.config import RetrievalSettings

    monkeypatch.setenv("RETRIEVAL_MODE", "lexical")
    monkeypatch.setenv("USE_RERANK", "1")
    monkeypatch.setenv("RERANK_API_KEY", "test-key")
    monkeypatch.setenv("RERANK_BASE_URL", "https://example.invalid/rerank")
    monkeypatch.setenv("RERANK_MODEL", "test-reranker")
    monkeypatch.delenv("ZHIPU_API_KEY", raising=False)

    assert RetrievalSettings.from_env().reranker is True


def test_default_search_service_does_not_initialize_vector_store(monkeypatch) -> None:
    from search.search_service import SearchService

    monkeypatch.setenv("RETRIEVAL_MODE", "lexical")
    monkeypatch.setattr(
        "search.search_service.ChromaRetriever",
        lambda: (_ for _ in ()).throw(AssertionError("vector store initialized")),
    )

    service = SearchService()

    assert service._retriever is None


def test_api_health_and_image_validation(monkeypatch, tmp_path) -> None:
    monkeypatch.setenv("CARTPILOT_DB_PATH", str(tmp_path / "api.sqlite3"))
    from api import main as api_main

    client = TestClient(api_main.app)
    health = client.get("/health")
    assert health.status_code == 200
    assert health.json() == {
        "status": "ok",
        "retrieval_mode": "lexical",
        "vector_search": False,
        "reranker": False,
    }

    both = client.post(
        "/chat/stream",
        json={
            "query": "x",
            "image_url": "https://example.test/x.jpg",
            "image_base64": base64.b64encode(b"image").decode(),
        },
    )
    assert both.status_code == 422

    invalid = client.post(
        "/chat/stream", json={"query": "x", "image_base64": "not-base64!!!"}
    )
    assert invalid.status_code == 422

    fake_bytes = client.post(
        "/chat/stream",
        json={"query": "x", "image_base64": base64.b64encode(b"image").decode()},
    )
    assert fake_bytes.status_code == 422

    png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC"
    mismatch = client.post(
        "/chat/stream",
        json={"query": "x", "image_base64": f"data:image/jpeg;base64,{png}"},
    )
    assert mismatch.status_code == 422

    remote = client.post(
        "/chat/stream", json={"query": "x", "image_url": "https://example.test/a.jpg"}
    )
    assert remote.status_code == 422


def test_sse_data_lines_are_json_and_ordered(monkeypatch, tmp_path) -> None:
    monkeypatch.setenv("CARTPILOT_DB_PATH", str(tmp_path / "stream.sqlite3"))
    from api import main as api_main

    class FakeAgent:
        def handle_turn_stream(self, query, session):
            yield {"type": "meta", "data": {"query": query}}
            yield {"type": "tool_result", "data": {"products": []}}
            yield {"type": "token", "data": "ok"}
            yield {"type": "done", "data": {"narrative": "ok"}}

    api_main._agent = FakeAgent()
    client = TestClient(api_main.app)

    response = client.post("/chat/stream", json={"query": "hello"})
    events = []
    for block in response.text.strip().split("\n\n"):
        lines = block.splitlines()
        event = next(line[7:] for line in lines if line.startswith("event: "))
        payload = next(line[6:] for line in lines if line.startswith("data: "))
        json.loads(payload)
        events.append(event)

    assert events == ["session", "meta", "tool_result", "token", "done"]


def test_sse_error_does_not_echo_sensitive_exception_text() -> None:
    from api import main as api_main

    class BrokenAgent:
        def handle_turn_stream(self, query, session):
            raise RuntimeError("CHAT_API_KEY=secret image_base64=private")
            yield

    api_main._agent = BrokenAgent()
    response = TestClient(api_main.app).post("/chat/stream", json={"query": "hello"})

    assert "secret" not in response.text
    assert "private" not in response.text
    assert 'event: error' in response.text


def test_blocking_chat_routes_image_and_rejects_oversize(monkeypatch) -> None:
    from api import main as api_main

    class ImageAgent:
        def handle_image_turn_stream(self, image, session, hint_text=""):
            self.image = image
            yield {
                "type": "meta",
                "data": {
                    "decision": {
                        "tool": "recommend",
                        "rewritten_query": hint_text,
                        "confidence": "high",
                        "reasoning": "image",
                    },
                    "trace": {"source": "image"},
                },
            }
            yield {
                "type": "tool_result",
                "data": {"tool_name": "recommend", "payload": {"products": []}},
            }
            yield {"type": "token", "data": "visual result"}
            yield {"type": "done", "data": {"narrative": "visual result"}}

    agent = ImageAgent()
    api_main._agent = agent
    client = TestClient(api_main.app)
    encoded = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC"

    response = client.post("/chat", json={"query": "find this", "image_base64": encoded})

    assert response.status_code == 200
    assert response.json()["narrative"] == "visual result"
    assert agent.image == f"data:image/png;base64,{encoded}"

    monkeypatch.setenv("CHAT_IMAGE_MAX_BYTES", "2")
    too_large = client.post("/chat", json={"query": "x", "image_base64": encoded})
    assert too_large.status_code == 422


def test_legacy_application_keeps_v1_and_exposes_cartpilot_health() -> None:
    from main import app

    client = TestClient(app)

    assert client.get("/api/v1/health").status_code == 200
    assert client.get("/health").json()["retrieval_mode"] == "lexical"
    assert "/chat" in client.get("/openapi.json").json()["paths"]


def test_real_router_chain_uses_injected_chat_model_without_network() -> None:
    from agent.intent_router import route
    from agent.session import AgentSession
    from llm.client import reset_chat_model, set_chat_model
    from llm.fake import FakeChatModel

    fake = FakeChatModel([
        json.dumps({
            "tool": "recommend",
            "rewritten_query": "500元以内耳机",
            "confidence": "high",
            "reasoning": "budget and category",
        })
    ])
    set_chat_model(fake)
    try:
        decision = route("500元以内耳机", AgentSession())
    finally:
        reset_chat_model()

    assert decision.tool == "recommend"
    assert fake.calls[0]["tools"][0]["function"]["name"] == "route_to_tool"


def test_legacy_doubao_factory_uses_chat_environment_without_sdk(monkeypatch) -> None:
    from services.ai_client_factory import AIClientFactory

    calls = []

    class Adapter:
        async def complete(self, messages, *, tools=None, response_schema=None):
            calls.append(messages)
            return "adapter-result"

    monkeypatch.setenv("CHAT_API_KEY", "configured-key")
    monkeypatch.setenv("CHAT_BASE_URL", "https://chat.example/v1")
    monkeypatch.setenv("CHAT_MODEL", "configured-model")
    monkeypatch.setattr("llm.doubao.DoubaoChatModel", lambda settings: Adapter())

    result = AIClientFactory()._call_doubao("ignored", "ignored", "sys", "hi", None, "image/jpeg")

    assert result == "adapter-result"
    assert calls[0][0] == {"role": "system", "content": "sys"}


def test_hybrid_health_does_not_claim_vector_when_index_is_missing(
    monkeypatch, tmp_path
) -> None:
    from api import main as api_main

    monkeypatch.setenv("RETRIEVAL_MODE", "hybrid")
    monkeypatch.setenv("EMBEDDING_API_KEY", "test-key")
    monkeypatch.setenv("EMBEDDING_BASE_URL", "https://example.invalid/v1")
    monkeypatch.setenv("EMBEDDING_MODEL", "test-embedding")
    invalid_index = tmp_path / "invalid-index"
    invalid_index.mkdir()
    (invalid_index / "unrelated.txt").write_text("not a chroma index", encoding="utf-8")
    monkeypatch.setenv("CHROMA_PATH", str(invalid_index))

    payload = TestClient(api_main.app).get("/health").json()

    assert payload["retrieval_mode"] == "hybrid"
    assert payload["vector_search"] is False
    assert payload["vector_index_ready"] is False


def test_hybrid_health_degrades_when_embedding_configuration_is_missing(monkeypatch) -> None:
    from api import main as api_main

    monkeypatch.setenv("RETRIEVAL_MODE", "hybrid")
    for name in ("EMBEDDING_API_KEY", "EMBEDDING_BASE_URL", "EMBEDDING_MODEL"):
        monkeypatch.delenv(name, raising=False)

    response = TestClient(api_main.app).get("/health")

    assert response.status_code == 200
    assert response.json() == {
        "status": "degraded",
        "retrieval_mode": "hybrid",
        "vector_search": False,
        "reranker": False,
        "vector_index_ready": False,
    }


def test_compare_accepts_three_unique_products(monkeypatch) -> None:
    from agent import comparison
    from api import main as api_main
    from store import product_store

    class Store:
        def get_product_detail(self, product_id):
            return {"product_id": product_id}

    monkeypatch.setattr(product_store, "ProductStore", Store)
    monkeypatch.setattr(
        comparison,
        "build_comparison",
        lambda details, focus="": {"product_count": len(details), "focus": focus},
    )

    response = TestClient(api_main.app).post(
        "/compare",
        json={"product_ids": ["p1", "p2", "p3"], "focus": "price"},
    )

    assert response.status_code == 200
    assert response.json() == {"product_count": 3, "focus": "price"}


def test_hybrid_hits_are_hydrated_from_sqlite_facts() -> None:
    from types import SimpleNamespace

    from rag.retriever import RetrievedChunk
    from search.search_service import SearchService, _aggregate_by_distance

    chunk = RetrievedChunk(
        chunk_id="bad-metadata",
        document="evidence",
        metadata={
            "product_id": "p1",
            "title": "stale title",
            "brand": "stale brand",
            "category": "stale category",
            "sub_category": "stale subcategory",
            "base_price": 1,
            "chunk_type": "product",
        },
        distance=0.1,
    )
    factual = SimpleNamespace(
        product_id="p1",
        title="SQLite title",
        brand="SQLite brand",
        category="SQLite category",
        sub_category="SQLite subcategory",
        base_price=999,
        price_range=SimpleNamespace(min_price=88),
    )
    store = SimpleNamespace(get_products_by_ids=lambda _ids: [factual])
    service = SearchService(product_store=store, use_hybrid=False)

    hydrated = service._hydrate_product_facts(_aggregate_by_distance([chunk]))

    assert hydrated[0].title == "SQLite title"
    assert hydrated[0].brand == "SQLite brand"
    assert hydrated[0].category == "SQLite category"
    assert hydrated[0].sub_category == "SQLite subcategory"
    assert hydrated[0].base_price == 88


def test_agent_trace_and_payload_do_not_expose_internal_exception(monkeypatch) -> None:
    from agent.intent_router import IntentDecision
    from agent.orchestrator import Agent
    from agent.session import AgentSession

    secret = "sk-secret-provider-value"

    class FailingTool:
        name = "recommend"

        def run(self, query, session, slots):
            raise RuntimeError(f"provider failed with {secret}")

    class Composer:
        def compose(self, tool_result, session):
            return "fallback"

    tools = {name: FailingTool() for name in (
        "recommend", "refine", "compare", "product_detail", "cart",
        "clarify", "fallback",
    )}
    monkeypatch.setattr(
        "agent.orchestrator.route",
        lambda query, session: IntentDecision(
            tool="recommend",
            rewritten_query=query,
            confidence="high",
            reasoning="test",
        ),
    )

    response = Agent(tools=tools, composer=Composer()).handle_turn(
        "headphones", AgentSession()
    ).to_dict()

    serialized = json.dumps(response, ensure_ascii=False)
    assert secret not in serialized
    assert response["trace"]["tool_error"] == "tool_failed"
    assert response["tool_result"]["payload"]["error"] == "tool_failed"


def test_remote_image_url_is_supported_but_private_hosts_are_rejected(monkeypatch) -> None:
    from pydantic import ValidationError

    from api import main as api_main

    expected = "data:image/png;base64,aW1hZ2U="
    monkeypatch.setenv("CHAT_IMAGE_ALLOWED_HOSTS", "images.example.test")
    monkeypatch.setattr(api_main, "_download_image_url", lambda url: expected)

    request = api_main.ChatRequest(
        query="find this", image_url="https://images.example.test/item.png"
    )
    assert api_main._resolve_image(request) == expected

    with pytest.raises(ValidationError, match="public host"):
        api_main.ChatRequest(query="x", image_url="http://127.0.0.1/private.png")


def test_stream_bridge_yields_before_provider_stream_finishes() -> None:
    from llm.client import get_client, reset_chat_model, set_chat_model

    class Model:
        async def complete(self, messages, *, tools=None, response_schema=None):
            return "unused"

        async def stream(self, messages, *, tools=None):
            yield "first"
            raise RuntimeError("late provider failure")

    set_chat_model(Model())
    try:
        stream = get_client().chat.completions.create(messages=[], stream=True)
        assert next(iter(stream)).choices[0].delta.content == "first"
        with pytest.raises(RuntimeError, match="late provider failure"):
            next(stream)
    finally:
        reset_chat_model()


@pytest.mark.parametrize(
    "provider_error",
    [
        TimeoutError("provider timeout"),
        RuntimeError("provider returned 429"),
        RuntimeError("provider returned 500"),
    ],
)
def test_fake_adapter_can_exercise_provider_failure_paths(provider_error) -> None:
    from llm.client import get_client, reset_chat_model, set_chat_model
    from llm.fake import FakeChatModel

    fake = FakeChatModel([provider_error])
    set_chat_model(fake)
    try:
        with pytest.raises(type(provider_error), match=str(provider_error)):
            get_client().chat.completions.create(messages=[])
    finally:
        reset_chat_model()

    assert len(fake.calls) == 1


def test_invalid_router_json_has_a_finite_retry_budget() -> None:
    from agent.intent_router import route
    from agent.session import AgentSession
    from llm.client import reset_chat_model, set_chat_model
    from llm.fake import FakeChatModel

    fake = FakeChatModel(["not-json", "still-not-json"])
    set_chat_model(fake)
    try:
        with pytest.raises(ValueError):
            route("推荐耳机", AgentSession())
    finally:
        reset_chat_model()

    assert len(fake.calls) == 2


def test_query_understanding_logs_do_not_expose_provider_errors(
    monkeypatch, caplog
) -> None:
    import logging

    from search import query_understanding

    secret = "sk-provider-secret-in-error"

    def fail(_query):
        raise RuntimeError(secret)

    monkeypatch.setattr(query_understanding, "_cached_understand", fail)
    with caplog.at_level(logging.WARNING):
        parsed = query_understanding.understand_query("500 元以内耳机")

    assert parsed.retrieval_query
    assert secret not in caplog.text


def test_audited_catalog_image_is_served_locally() -> None:
    from api import main as api_main

    response = TestClient(api_main.app).get("/catalog-images/p_beauty_001.jpg")

    assert response.status_code == 200
    assert response.headers["content-type"] == "image/jpeg"
    assert response.content.startswith(b"\xff\xd8")
