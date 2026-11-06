"""Contract tests for the offline ``DemoChatModel``.

Caller-facing tests drive the real parsing code (router, query parser, action
dispatcher, composer, ...) with the demo model injected, so every demo output is checked
against the same schemas and parsers that a real provider response must satisfy.
"""

from __future__ import annotations

import json

import pytest

from agent.session import AgentSession
from llm.client import reset_chat_model, set_chat_model


@pytest.fixture(autouse=True)
def demo_model(monkeypatch):
    monkeypatch.setenv("DEMO_STREAM_DELAY_MS", "0")
    from llm.demo import DemoChatModel
    from search.query_understanding import clear_cache

    model = DemoChatModel()
    set_chat_model(model)
    clear_cache()
    yield model
    reset_chat_model()
    clear_cache()


def _session_with_recommendation() -> AgentSession:
    """Session whose history already contains one recommendation turn."""
    session = AgentSession()
    session.add_user("推荐 500 元以内的耳机")
    session.add_assistant(
        json.dumps(
            {
                "opening": "为你推荐了 2 款 500 元以内的真无线耳机",
                "items": [{"productId": "p_digital_007", "description": "降噪稳定，通勤路上很清净"}],
                "followup": ["对比一下前两款"],
            },
            ensure_ascii=False,
        )
    )
    return session


# ---------------------------------------------------------------------------
# Intent router (route_to_tool)
# ---------------------------------------------------------------------------

@pytest.mark.parametrize(
    ("query", "tool"),
    [
        ("推荐通勤耳机", "recommend"),
        ("看看购物车", "cart"),
        ("对比一下前两款", "compare"),
        ("今天天气怎么样", "fallback"),
        ("随便看看", "clarify"),
        ("续航好的耳机有哪些", "recommend"),
    ],
)
def test_router_routes_fresh_session_by_keywords(query, tool):
    from agent.intent_router import route

    assert route(query, AgentSession()).tool == tool


@pytest.mark.parametrize(
    ("query", "tool"),
    [
        ("第一款续航怎么样", "product_detail"),
        ("这款口碑如何", "product_detail"),
        ("换个品牌", "refine"),
        ("不要华为的", "refine"),
        ("把第二个加入购物车", "cart"),
    ],
)
def test_router_uses_product_context_for_follow_ups(query, tool):
    from agent.intent_router import route

    session = _session_with_recommendation()
    session.add_user(query)  # The orchestrator records the turn before routing.

    assert route(query, session).tool == tool


def test_router_rewrites_cheaper_follow_up_from_previous_budget():
    from agent.intent_router import route

    session = _session_with_recommendation()
    session.add_user("再便宜点")

    decision = route("再便宜点", session)

    assert decision.tool == "refine"
    assert decision.rewritten_query == "推荐 350 元以内的耳机"


def test_router_returns_every_schema_field():
    from agent.intent_router import route

    decision = route("推荐通勤耳机", AgentSession())

    assert decision.rewritten_query == "推荐通勤耳机"
    assert decision.confidence in {"high", "medium", "low"}
    assert decision.reasoning


# ---------------------------------------------------------------------------
# Query understanding (extract_search_intent) and decomposition
# ---------------------------------------------------------------------------

def test_query_parser_extracts_budget_and_subcategory():
    from search.llm_parser import parse_query_with_llm

    parsed = parse_query_with_llm("推荐 500 元以内的耳机")

    assert parsed.max_price == 500
    assert parsed.min_price is None
    assert parsed.sub_category == "真无线耳机"
    assert parsed.category == "数码电子"
    assert parsed.needs_clarification is False


def test_query_parser_separates_wanted_and_excluded_brands():
    from search.llm_parser import parse_query_with_llm

    parsed = parse_query_with_llm("推荐华为手机，不要小米")

    assert parsed.sub_category == "智能手机"
    assert parsed.brand_include == ["华为"]
    assert parsed.brand_exclude == ["小米"]


@pytest.mark.parametrize(
    ("query", "expected"),
    [
        ("200 到 500 元的跑鞋", {"min_price": 200, "max_price": 500, "sub_category": "跑步鞋"}),
        ("两千以内的平板", {"min_price": None, "max_price": 2000, "sub_category": "平板电脑"}),
        ("推荐点护肤品", {"category": "美妆护肤", "sub_category": None, "max_price": None}),
        ("预算一般，推荐几款防晒", {"sub_category": "防晒", "max_price": None}),
    ],
)
def test_query_parser_reads_prices_and_category_aliases(query, expected):
    from search.llm_parser import parse_query_with_llm

    parsed = parse_query_with_llm(query)

    assert {key: getattr(parsed, key) for key in expected} == expected


@pytest.mark.asyncio
async def test_query_parser_only_returns_values_from_the_schema_enum(demo_model):
    from search.llm_parser import _build_tool_schema

    schema = _build_tool_schema(
        {"sub_to_cat": {"头戴耳机": "影音"}, "brands": ["索尼"], "brand_expand": {}}
    )
    raw = await demo_model.complete(
        [{"role": "user", "content": "推荐索尼的蓝牙耳机"}],
        tools=[schema],
        tool_choice={"type": "function", "function": {"name": "extract_search_intent"}},
    )
    args = json.loads(raw)

    # "蓝牙耳机" normally maps to 真无线耳机, which this enum does not contain.
    assert args["sub_category"] is None
    assert args["brand_include"] == ["索尼"]
    assert set(args) == set(schema["function"]["parameters"]["required"])


def test_decomposer_keeps_one_request_with_short_label():
    from search.query_decomposer import SubRequest, decompose_query

    assert decompose_query("推荐 500 元以内的耳机") == [
        SubRequest(label="耳机", query="推荐 500 元以内的耳机")
    ]


# ---------------------------------------------------------------------------
# Cart action dispatch (choose_action) and product matching (pick_products)
# ---------------------------------------------------------------------------

def _cart_actions():
    """Mirror of the cart tool's ActionSpec contract, kept local so this suite stays stable."""
    from agent.llm_actions import ActionSpec

    return [
        ActionSpec("add", "把某款商品加入购物车", {
            "index": {"type": "integer"}, "quantity": {"type": "integer"},
        }),
        ActionSpec("set_quantity", "修改购物车里某件商品的数量", {
            "cart_index": {"type": "integer"}, "quantity": {"type": "integer"},
        }),
        ActionSpec("remove", "从购物车删除某件商品", {"cart_index": {"type": "integer"}}),
        ActionSpec("view", "查看当前购物车", {}),
        ActionSpec("checkout", "提交订单/下单", {"address": {"type": "string"}}),
    ]


@pytest.mark.parametrize(
    ("query", "action", "args"),
    [
        ("把第二个加入购物车", "add", {"index": 2}),
        ("第一款来两件", "add", {"index": 1, "quantity": 2}),
        ("第一件改成三件", "set_quantity", {"cart_index": 1, "quantity": 3}),
        ("删掉第二个", "remove", {"cart_index": 2}),
        ("看看购物车", "view", {}),
        ("下单吧", "checkout", {}),
        ("结算，寄到上海市浦东新区世纪大道 100 号", "checkout", {"address": "上海市浦东新区世纪大道 100 号"}),
    ],
)
def test_action_dispatcher_selects_cart_action_and_arguments(query, action, args):
    from agent.llm_actions import dispatch_action

    decision = dispatch_action(query, AgentSession(), _cart_actions(), purpose="购物车")

    assert (decision.action, decision.args) == (action, args)


def test_action_dispatcher_only_fills_declared_parameters():
    from agent.llm_actions import ActionSpec, dispatch_action

    actions = [ActionSpec("add", "加购", {}), ActionSpec("view", "查看", {})]

    decision = dispatch_action("把第二个加入购物车", AgentSession(), actions, purpose="购物车")

    assert (decision.action, decision.args) == ("add", {})


def test_action_dispatcher_without_matching_rule_raises():
    from agent.llm_actions import ActionSpec, dispatch_action

    with pytest.raises(RuntimeError, match="demo model has no rule for choose_action"):
        dispatch_action("帮我归档", AgentSession(), [ActionSpec("archive", "归档")], purpose="归档")


_HUAWEI_PHONE = {"title": "华为HUAWEI Pura 90 Pro 轻薄旗舰手机", "brand": "华为", "category": "数码电子", "sub_category": "智能手机"}
_HUAWEI_EARBUDS = {"title": "华为HUAWEI FreeBuds Pro 5 主动降噪真无线蓝牙耳机", "brand": "华为", "category": "数码电子", "sub_category": "真无线耳机"}
_XIAOMI_PHONE = {"title": "小米 17 Ultra 影像旗舰5G手机", "brand": "小米", "category": "数码电子", "sub_category": "智能手机"}


def test_product_matcher_prefers_brand_plus_category():
    from agent.tools.llm_match import llm_pick_candidate

    assert llm_pick_candidate("华为那个耳机", [_HUAWEI_PHONE, _HUAWEI_EARBUDS]) == 1


def test_product_matcher_returns_named_candidates_in_mention_order():
    from agent.tools.llm_match import llm_pick_candidates

    candidates = [_HUAWEI_EARBUDS, _HUAWEI_PHONE, _XIAOMI_PHONE]

    # The pick_products schema asks for indices in the user's word order.
    assert llm_pick_candidates("小米和华为手机", candidates, k=2) == [2, 1]


def test_product_matcher_falls_back_to_first_candidate():
    from agent.tools.llm_match import llm_pick_candidate

    assert llm_pick_candidate("就它吧", [_XIAOMI_PHONE, _HUAWEI_PHONE]) == 0


# ---------------------------------------------------------------------------
# Plain-text callers: vision query and conversation title
# ---------------------------------------------------------------------------

def test_vision_extraction_returns_fixed_search_phrase():
    from llm.vision import vision_extract_query

    png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC"

    assert vision_extract_query(png) == "降噪蓝牙耳机"


@pytest.mark.parametrize(
    ("user_text", "title"),
    [
        ("推荐一款适合油皮的洗面奶", "适合油皮洗面奶"),
        ("推荐 500 元以内的耳机", "500元以内耳机"),
    ],
)
def test_title_endpoint_returns_short_title_from_user_need(user_text, title):
    from fastapi.testclient import TestClient

    from api import main as api_main

    response = TestClient(api_main.app).post(
        "/title", json={"user_text": user_text, "assistant_text": "为你推荐了几款"}
    )

    assert response.status_code == 200
    assert response.json() == {"title": title}
    assert len(title) <= 8


# ---------------------------------------------------------------------------
# Answer composer (plain completion without tools)
# ---------------------------------------------------------------------------

_EARBUDS = {
    "product_id": "p_digital_007", "title": "华为HUAWEI FreeBuds Pro 5 主动降噪真无线蓝牙耳机高解析音质",
    "brand": "华为", "category": "数码电子", "sub_category": "真无线耳机", "price": 1699.0, "price_display": "¥1499 起",
}
_AIRPODS = {
    "product_id": "p_digital_018", "title": "Apple AirPods Pro 3 主动降噪真无线蓝牙耳机 心率监测版",
    "brand": "Apple 苹果", "category": "数码电子", "sub_category": "真无线耳机", "price": 1899.0, "price_display": "¥1799 起",
}
_SERUM = {
    "product_id": "p_beauty_009", "title": "珀莱雅弹润透亮青春精华液双抗精华提亮肤色淡纹保湿精华50ml",
    "brand": "珀莱雅", "category": "美妆护肤", "sub_category": "精华", "price": 280.0, "price_display": "¥280",
}


def _compose(tool_name: str, payload: dict, hint: str | None = None) -> str:
    from agent.composer import AnswerComposer
    from agent.tools.base import ToolResult

    result = ToolResult(tool_name=tool_name, payload=payload, composer_hint=hint)
    return AnswerComposer().compose(result, AgentSession())


def test_composer_opening_summarises_count_budget_and_category():
    payload = {
        "query": "推荐 2000 元以内的耳机",
        "products": [_EARBUDS, _AIRPODS],
        "debug": {"parsed": {"sub_category": "真无线耳机", "max_price": 2000.0}},
    }

    data = json.loads(_compose("recommend", payload, hint="已为用户找到 2 款商品"))

    assert data["opening"] == "为你推荐了 2 款 2000 元以内的真无线耳机"


def test_composer_items_use_payload_ids_and_clean_unique_descriptions():
    import re

    products = [_EARBUDS, _AIRPODS, _SERUM]
    payload = {"query": "推荐几款好物", "products": products, "debug": {"parsed": {}}}

    data = json.loads(_compose("recommend", payload, hint="已为用户找到 3 款商品"))

    assert [item["productId"] for item in data["items"]] == [p["product_id"] for p in products]
    descriptions = [item["description"] for item in data["items"]]
    assert len(set(descriptions)) == len(descriptions)
    for product, description in zip(products, descriptions):
        assert 25 <= len(description) <= 40
        assert product["brand"] not in description
        assert not any(token in description for token in product["title"].split())
        assert not re.search(r"\d|元|¥", description)
    assert len(data["followup"]) == 3
    assert all(text and "吗" not in text and "要不要" not in text for text in data["followup"])


def test_composer_without_hits_explains_and_suggests_relaxing():
    payload = {
        "query": "推荐 500 元以内的耳机",
        "products": [],
        "debug": {"parsed": {"sub_category": "真无线耳机", "max_price": 500.0}},
    }

    data = json.loads(_compose("recommend", payload, hint="本次未命中任何商品"))

    assert data["items"] == []
    assert data["opening"].startswith("抱歉，暂时没有找到 500 元以内的真无线耳机")
    assert "放宽" in data["opening"]
    assert len(data["followup"]) == 3


@pytest.mark.parametrize(
    ("hint", "opening"),
    [
        (
            "已把「华为FreeBuds Pro 5」从购物车删除。请确认并带出当前还剩 1 件、合计 1499.0 元。",
            "已把「华为FreeBuds Pro 5」从购物车删除，当前还剩 1 件、合计 1499.0 元。",
        ),
        (
            "下单成功！订单号 OD123，共 2 件、合计 3298.0 元，寄往：默认地址。请用愉快的口吻确认下单完成。",
            "下单成功，订单号 OD123，共 2 件、合计 3298.0 元，寄往：默认地址。",
        ),
        (
            "请用自然口吻汇报购物车：逐件说商品名、数量、小计，最后给出合计 3298.0 元，并询问是否下单。",
            "你的购物车目前合计 3298.0 元，确认无误就可以直接下单。",
        ),
    ],
)
def test_composer_rewrites_cart_hint_as_one_sentence_opening(hint, opening):
    payload = {"action": "view", "cart": {"lines": [], "item_count": 2, "total": 3298.0}}

    data = json.loads(_compose("cart", payload, hint=hint))

    assert data["opening"] == opening
    assert data["items"] == []
    assert len(data["followup"]) == 3


@pytest.mark.parametrize(
    "focus",
    ["general", "performance", "reviews", "negative_reviews", "sensitive_skin", "size_fit", "usage"],
)
@pytest.mark.parametrize("product", [_EARBUDS, _SERUM])
def test_composer_product_detail_is_one_short_natural_paragraph(focus, product):
    payload = {
        "query": "这款怎么样",
        "focus_aspect": focus,
        "product": product,
        "evidence": [{"source_type": "user_review", "title": "用户评价", "text": "降噪效果不错"}],
    }

    text = _compose("product_detail", payload, hint="这是 product_detail 单品介绍问答。")

    assert 60 <= len(text) <= 90
    assert "{" not in text and "\n" not in text


def test_composer_product_detail_without_evidence_stays_in_length():
    payload = {"query": "这款怎么样", "focus_aspect": "reviews", "product": _SERUM, "evidence": []}

    text = _compose("product_detail", payload)

    assert 60 <= len(text) <= 90


@pytest.mark.asyncio
async def test_unknown_tool_choice_raises_runtime_error(demo_model):
    name = "emit_product_dimensions"
    tools = [{"type": "function", "function": {"name": name, "parameters": {}}}]

    with pytest.raises(RuntimeError, match=f"demo model has no rule for {name}"):
        await demo_model.complete(
            [{"role": "user", "content": "x"}],
            tools=tools,
            tool_choice={"type": "function", "function": {"name": name}},
        )


@pytest.mark.asyncio
async def test_stream_splits_the_answer_into_token_sized_pieces(demo_model):
    from agent.composer import _build_messages
    from agent.tools.base import ToolResult

    messages = _build_messages(
        ToolResult(tool_name="recommend", payload={"query": "耳机", "products": [_EARBUDS]})
    )

    pieces = [piece async for piece in demo_model.stream(messages)]

    assert len(pieces) > 5
    assert all(1 <= len(piece) <= 6 for piece in pieces)
    assert json.loads("".join(pieces))["items"][0]["productId"] == "p_digital_007"


def test_agent_streams_a_recommendation_end_to_end():
    from agent.orchestrator import Agent

    events = list(Agent().handle_turn_stream("推荐通勤耳机", AgentSession()))

    tool = next(event for event in events if event["type"] == "tool_result")
    products = tool["data"]["payload"].get("products") or []
    assert products
    assert len([event for event in events if event["type"] == "token"]) > 1
    done = events[-1]
    assert done["type"] == "done"
    answer = json.loads(done["data"]["narrative"])
    assert {item["productId"] for item in answer["items"]} <= {p["product_id"] for p in products}
