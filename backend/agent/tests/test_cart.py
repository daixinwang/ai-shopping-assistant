"""Regression tests for conversational cart, checkout, and unified tool invocation.

Action dispatch is monkeypatched to avoid real LLM calls, and CartStore uses a temporary SQLite
database so the suite remains deterministic in CI.
"""

from __future__ import annotations

import sqlite3
from pathlib import Path

import pytest

from agent.llm_actions import ActionDecision
from agent.session import AgentSession
from agent.tools import cart as cart_module
from agent.tools.cart import CartTool
from store.cart_store import CartStore


# --------------------------- Temporary SQLite fixture ---------------------------

_SCHEMA = """
CREATE TABLE products (
    product_id TEXT PRIMARY KEY, title TEXT, brand TEXT,
    category TEXT, sub_category TEXT, base_price REAL, status TEXT DEFAULT 'active'
);
CREATE TABLE product_skus (
    sku_id TEXT PRIMARY KEY, product_id TEXT, properties_json TEXT DEFAULT '{}',
    price REAL, stock_qty INTEGER DEFAULT 99, status TEXT DEFAULT 'active'
);
CREATE TABLE cart_items (
    cart_item_id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT, product_id TEXT, sku_id TEXT,
    selected_options_json TEXT DEFAULT '{}', quantity INTEGER,
    unit_price REAL, selected INTEGER DEFAULT 1,
    UNIQUE(user_id, sku_id)
);
"""


@pytest.fixture()
def store(tmp_path: Path) -> CartStore:
    db = tmp_path / "t.sqlite3"
    conn = sqlite3.connect(db)
    conn.executescript(_SCHEMA)
    conn.executemany(
        "INSERT INTO products(product_id,title,brand,category,sub_category,base_price) VALUES (?,?,?,?,?,?)",
        [
            ("p1", "珀莱雅双抗精华", "珀莱雅", "美妆护肤", "精华", 129),
            ("p2", "兰蔻小黑瓶", "兰蔻", "美妆护肤", "精华", 680),
        ],
    )
    conn.executemany(
        "INSERT INTO product_skus(sku_id,product_id,price) VALUES (?,?,?)",
        [("p1_s1", "p1", 129), ("p2_s1", "p2", 680)],
    )
    conn.commit()
    conn.close()
    return CartStore(db)


def _session_with_hits() -> AgentSession:
    sess = AgentSession()
    sess.remember_search(
        {"category": "美妆护肤"},
        [{"product_id": "p1", "title": "珀莱雅双抗精华"},
         {"product_id": "p2", "title": "兰蔻小黑瓶"}],
    )
    return sess


def _stub_dispatch(action: str, **args):
    """Replace `dispatch_action` with a fixed action to avoid a real LLM call."""
    def _fn(query, session, actions, *, purpose, timeout=6.0):
        return ActionDecision(action=action, args=args, raw={"action": action, **args})
    return _fn


# --------------------------- Direct CartStore tests ---------------------------


def test_store_add_and_list(store: CartStore):
    store.add_product("p1")
    store.add_product("p1")  # Increment the existing line.
    lines = store.list_items()
    assert len(lines) == 1
    assert lines[0].quantity == 2
    assert lines[0].subtotal == 258


def test_store_set_quantity_zero_removes(store: CartStore):
    line = store.add_product("p1")
    assert store.set_quantity(line.cart_item_id, 0) is None
    assert store.list_items() == []


def test_store_build_order_clears(store: CartStore):
    store.add_product("p1", quantity=2)
    store.add_product("p2")
    order = store.build_order()
    assert order.total == 129 * 2 + 680
    assert order.to_dict()["item_count"] == 3
    assert store.list_items() == []  # Checkout clears the cart.


def test_store_checkout_empty_raises(store: CartStore):
    from store.cart_store import CartNotFoundError
    with pytest.raises(CartNotFoundError):
        store.build_order()


def test_store_clear_removes_all(store: CartStore):
    store.add_product("p1", quantity=2)
    store.add_product("p2")
    removed = store.clear()
    assert removed == 2  # Two SKU rows were removed.
    assert store.list_items() == []


# --------------------------- CartTool and unified invocation ---------------------------


def test_cart_add_resolves_index(monkeypatch, store: CartStore):
    monkeypatch.setattr(cart_module, "dispatch_action", _stub_dispatch("add", index=2))
    tool = CartTool(cart_store=store)
    r = tool.run("把第二个加进来", _session_with_hits(), {})
    assert r.payload["action"] == "add"
    assert r.payload["added"]["title"] == "兰蔻小黑瓶"
    assert r.payload["resolution"]["source"] == "explicit_index"
    assert r.payload["resolution"]["resolved_query"] == "把「兰蔻小黑瓶」加入购物车"
    assert r.payload["cart"]["item_count"] == 1


def test_cart_add_confirmation_prints_amounts_like_prices(monkeypatch, store: CartStore):
    """The confirmation is shown verbatim, so totals read "680 元", never "680.0 元"."""
    monkeypatch.setattr(cart_module, "dispatch_action", _stub_dispatch("add", index=2))
    r = CartTool(cart_store=store).run("把第二个加进来", _session_with_hits(), {})
    assert "合计 680 元" in r.narrative_override
    assert ".0 元" not in r.narrative_override


def test_cart_view_hint_prints_amounts_like_prices(monkeypatch, store: CartStore):
    store.add_product("p2")
    monkeypatch.setattr(cart_module, "dispatch_action", _stub_dispatch("view"))
    r = CartTool(cart_store=store).run("看看购物车", AgentSession(), {})
    assert "合计 680 元" in (r.composer_hint or "")


def test_cart_add_uses_focus_when_no_index(monkeypatch, store: CartStore):
    monkeypatch.setattr(cart_module, "dispatch_action", _stub_dispatch("add"))
    sess = _session_with_hits()
    sess.set("last_focus_product_id", "p2")  # The previous detail turn focused the second product.
    r = CartTool(cart_store=store).run("把刚才那款加进来", sess, {})
    assert r.payload["added"]["product_id"] == "p2"
    assert r.payload["resolution"]["source"] == "focus"


def test_cart_add_prefers_focus_over_hallucinated_index(monkeypatch, store: CartStore):
    """Ignore a hallucinated dispatch index when the user gave no ordinal and a focused product exists."""
    monkeypatch.setattr(cart_module, "dispatch_action", _stub_dispatch("add", index=1))
    sess = _session_with_hits()
    sess.set("last_focus_product_id", "p2")

    r = CartTool(cart_store=store).run("帮我加入购物车吧", sess, {})

    assert r.payload["added"]["product_id"] == "p2"
    assert r.payload["resolution"]["source"] == "focus"


def test_cart_add_pronoun_uses_focus(monkeypatch, store: CartStore):
    """Treat the pronoun in an add-to-cart request as a reference, not a catalog keyword."""
    monkeypatch.setattr(cart_module, "dispatch_action", _stub_dispatch("add"))
    sess = _session_with_hits()
    sess.set("last_focus_product_id", "p2")

    r = CartTool(cart_store=store).run("把它加入购物车", sess, {})

    assert r.payload["added"]["product_id"] == "p2"
    assert r.payload["resolution"]["source"] == "focus"


def test_cart_add_spec_prompt_confirms_resolved_product(monkeypatch, store: CartStore):
    """Confirm the resolved product before showing a variant card for a multi-variant item."""
    with sqlite3.connect(store.db_path) as conn:
        conn.execute(
            "INSERT INTO products(product_id,title,brand,category,sub_category,base_price) VALUES (?,?,?,?,?,?)",
            ("p3", "测试旗舰手机", "测试", "数码电子", "智能手机", 3999),
        )
        conn.executemany(
            "INSERT INTO product_skus(sku_id,product_id,properties_json,price) VALUES (?,?,?,?)",
            [
                ("p3_black", "p3", '{"颜色":"黑色"}', 3999),
                ("p3_white", "p3", '{"颜色":"白色"}', 3999),
            ],
        )
        conn.commit()

    monkeypatch.setattr(cart_module, "dispatch_action", _stub_dispatch("add"))
    sess = AgentSession()
    sess.set("last_focus_product_id", "p3")

    r = CartTool(cart_store=store).run("把它加入购物车", sess, {})

    assert r.payload["action"] == "ask_spec"
    assert r.payload["resolution"]["source"] == "focus"
    assert r.payload["resolution"]["resolved_query"] == "把「测试旗舰手机」加入购物车"
    assert "已理解为把「测试旗舰手机」加入购物车" in (r.narrative_override or "")


def test_cart_remove_by_cart_index(monkeypatch, store: CartStore):
    store.add_product("p1")
    store.add_product("p2")
    monkeypatch.setattr(cart_module, "dispatch_action", _stub_dispatch("remove", cart_index=2))
    r = CartTool(cart_store=store).run("删掉第二个", AgentSession(), {})
    assert r.payload["removed"]["title"] == "兰蔻小黑瓶"
    assert r.payload["cart"]["item_count"] == 1


def test_cart_set_quantity(monkeypatch, store: CartStore):
    store.add_product("p1")
    monkeypatch.setattr(cart_module, "dispatch_action", _stub_dispatch("set_quantity", cart_index=1, quantity=3))
    r = CartTool(cart_store=store).run("第一件改成3个", AgentSession(), {})
    assert r.payload["cart"]["lines"][0]["quantity"] == 3


def _preview_checkout(monkeypatch, store: CartStore, sess: AgentSession):
    monkeypatch.setattr(cart_module, "dispatch_action", _stub_dispatch("checkout"))
    return CartTool(cart_store=store).run("下单吧，地址用默认的", sess, {})


def _forbid_model_dispatch(monkeypatch):
    def _fail(*_a, **_k):
        raise AssertionError("checkout confirmation must not be decided by the model")
    monkeypatch.setattr(cart_module, "dispatch_action", _fail)


def test_checkout_first_returns_a_confirmation_preview(monkeypatch, store: CartStore):
    store.add_product("p1", quantity=2)
    sess = AgentSession()

    r = _preview_checkout(monkeypatch, store, sess)

    assert r.payload["action"] == "checkout_confirm"
    assert r.payload["preview"]["total"] == 258
    assert r.payload["preview"]["item_count"] == 2
    assert "默认地址" in r.payload["preview"]["address"]
    assert r.needs_composer is False
    assert "确认下单" in r.narrative_override
    assert len(store.list_items()) == 1  # Nothing is purchased before the user confirms.
    assert sess.get("pending_checkout")


def test_confirm_reply_places_the_pending_order(monkeypatch, store: CartStore):
    store.add_product("p1", quantity=2)
    sess = AgentSession()
    _preview_checkout(monkeypatch, store, sess)
    _forbid_model_dispatch(monkeypatch)

    r = CartTool(cart_store=store).run("确认下单", sess, {})

    assert r.payload["action"] == "checkout"
    assert r.payload["order"]["total"] == 258
    assert r.payload["order"]["order_id"] in r.narrative_override
    assert store.list_items() == []
    assert sess.get("pending_checkout") is None


def test_cancel_reply_keeps_the_cart(monkeypatch, store: CartStore):
    store.add_product("p1", quantity=2)
    sess = AgentSession()
    _preview_checkout(monkeypatch, store, sess)
    _forbid_model_dispatch(monkeypatch)

    r = CartTool(cart_store=store).run("再想想", sess, {})

    assert r.payload["action"] == "checkout_cancelled"
    assert len(store.list_items()) == 1
    assert sess.get("pending_checkout") is None


def test_changed_cart_requires_a_fresh_confirmation(monkeypatch, store: CartStore):
    store.add_product("p1", quantity=2)
    sess = AgentSession()
    _preview_checkout(monkeypatch, store, sess)
    store.add_product("p2")
    _forbid_model_dispatch(monkeypatch)

    r = CartTool(cart_store=store).run("确认下单", sess, {})

    assert r.payload["action"] == "checkout_confirm"
    assert r.payload["preview"]["total"] == 258 + 680
    assert "有变化" in r.narrative_override
    assert len(store.list_items()) == 2


def test_expired_confirmation_requires_a_fresh_preview(monkeypatch, store: CartStore):
    store.add_product("p1")
    sess = AgentSession()
    _preview_checkout(monkeypatch, store, sess)
    sess.set("pending_checkout", {**sess.get("pending_checkout"), "expires_at": 0})
    _forbid_model_dispatch(monkeypatch)

    r = CartTool(cart_store=store).run("确认", sess, {})

    assert r.payload["action"] == "checkout_confirm"
    assert len(store.list_items()) == 1


def test_typed_confirmation_without_a_preview_only_previews(monkeypatch, store: CartStore):
    store.add_product("p1")
    monkeypatch.setattr(cart_module, "dispatch_action", _stub_dispatch("checkout"))

    r = CartTool(cart_store=store).run("确认下单", AgentSession(), {})

    assert r.payload["action"] == "checkout_confirm"
    assert len(store.list_items()) == 1


@pytest.mark.parametrize(
    "text, expected",
    [
        ("确认下单", "confirm"),
        ("好的", "confirm"),
        ("可以，下单吧", "confirm"),
        ("确定！", "confirm"),
        ("再想想", "cancel"),
        ("先不确认了", "cancel"),
        ("算了不买了", "cancel"),
        ("确认一下运费多少", None),
        ("对比一下这两款", None),
    ],
)
def test_checkout_reply_classification(text, expected):
    from agent.tools.cart import classify_checkout_reply

    assert classify_checkout_reply(text) == expected


class _StubTool:
    def __init__(self, name: str) -> None:
        self.name = name

    def run(self, query, session, slots):
        from agent.tools.base import ToolResult

        return ToolResult(tool_name=self.name, narrative_override="stub", needs_composer=False)


def _agent_with_cart(store: CartStore):
    from agent.intent_router import KNOWN_TOOLS
    from agent.orchestrator import Agent

    tools = {name: _StubTool(name) for name in KNOWN_TOOLS}
    tools["cart"] = CartTool(cart_store=store)
    return Agent(tools=tools)


def test_pending_checkout_confirmation_skips_the_router(monkeypatch, store: CartStore):
    from agent import orchestrator

    store.add_product("p1")
    sess = AgentSession()
    sess.add_user("下单吧")
    _preview_checkout(monkeypatch, store, sess)
    _forbid_model_dispatch(monkeypatch)

    def _router(*_a, **_k):
        raise AssertionError("the router must not decide a pending confirmation")

    monkeypatch.setattr(orchestrator, "route", _router)

    resp = _agent_with_cart(store).handle_turn("确认下单", sess)

    assert resp.decision.tool == "cart"
    assert resp.tool_result.payload["action"] == "checkout"
    assert store.list_items() == []


def test_changing_topic_withdraws_the_pending_checkout(monkeypatch, store: CartStore):
    from agent import orchestrator
    from agent.intent_router import IntentDecision

    store.add_product("p1")
    sess = AgentSession()
    _preview_checkout(monkeypatch, store, sess)
    routed: list[str] = []

    def _router(query, _session):
        routed.append(query)
        return IntentDecision(tool="recommend", rewritten_query=query, confidence="high", reasoning="t")

    monkeypatch.setattr(orchestrator, "route", _router)

    _agent_with_cart(store).handle_turn("推荐一款耳机", sess)

    assert routed == ["推荐一款耳机"]
    assert sess.get("pending_checkout") is None
    assert len(store.list_items()) == 1


def test_cart_view_empty(monkeypatch, store: CartStore):
    monkeypatch.setattr(cart_module, "dispatch_action", _stub_dispatch("view"))
    r = CartTool(cart_store=store).run("看看购物车", AgentSession(), {})
    assert r.needs_composer is False
    assert "空的" in r.narrative_override


def test_cart_dispatch_failure_falls_back_to_view(monkeypatch, store: CartStore):
    def _boom(*a, **k):
        raise RuntimeError("LLM down")
    monkeypatch.setattr(cart_module, "dispatch_action", _boom)
    store.add_product("p1")
    r = CartTool(cart_store=store).run("随便说点啥", AgentSession(), {})
    # Fall back to displaying the cart instead of raising.
    assert r.payload["action"] == "view"


# --------------------------- Variant disambiguation with shared prefixes ---------------------------

def _phone_skus() -> list[dict]:
    """Build phone variants whose storage options share a `12GB` prefix."""
    skus = []
    for storage, version, colors in (
        ("12GB+256GB", "标准版", ["星芒黑", "雪域白", "幻影紫", "青釉绿"]),
        ("12GB+512GB", "高配版", ["星芒黑", "雪域白", "幻影紫", "青釉绿"]),
    ):
        for i, color in enumerate(colors):
            skus.append({
                "sku_id": f"{storage}_{color}",
                "options": {"存储": storage, "颜色": color, "版本": version},
            })
    return skus


def test_filter_skus_disambiguates_shared_numeric_prefix(store: CartStore):
    """Ensure the 512 GB request is not captured by the 256 GB option's shared prefix."""
    tool = CartTool(cart_store=store)
    matched = tool._filter_skus("我要 12GB+512GB 幻影紫 高配版", _phone_skus())
    assert len(matched) == 1
    assert matched[0]["options"] == {"存储": "12GB+512GB", "颜色": "幻影紫", "版本": "高配版"}


def test_filter_skus_lower_storage_still_works(store: CartStore):
    tool = CartTool(cart_store=store)
    matched = tool._filter_skus("我要 12GB+256GB 星芒黑 标准版", _phone_skus())
    assert len(matched) == 1
    assert matched[0]["options"]["存储"] == "12GB+256GB"


def test_value_match_score_prefers_more_complete_match(store: CartStore):
    tool = CartTool(cart_store=store)
    q = "我要 12GB+512GB"
    # The 512 GB option matches two numeric tokens while the 256 GB option matches only one.
    assert tool._value_match_score("12GB+512GB", q) > tool._value_match_score("12GB+256GB", q)


def _pants_skus() -> list[dict]:
    """Build shorts with letter sizes and colors, including single-character size suffixes."""
    skus = []
    for size in ("M码", "L码", "XL码"):
        for color in ("黑色", "深灰色", "藏蓝色"):
            skus.append({"sku_id": f"{size}_{color}", "options": {"尺码": size, "颜色": color}})
    return skus


def test_filter_skus_letter_size_resolves_uniquely(store: CartStore):
    """Resolve a letter size and color uniquely without entering a clarification loop."""
    tool = CartTool(cart_store=store)
    matched = tool._filter_skus("我要 M码 深灰色", _pants_skus())
    assert len(matched) == 1
    assert matched[0]["options"] == {"尺码": "M码", "颜色": "深灰色"}


def test_letter_size_l_does_not_match_xl(store: CartStore):
    """Guard the left boundary so an L-size token does not match an XL-size request."""
    tool = CartTool(cart_store=store)
    q = "我要 XL码 黑色"
    assert tool._value_match_score("XL码", q) == 1
    assert tool._value_match_score("L码", q) == 0
    matched = tool._filter_skus(q, _pants_skus())
    assert len(matched) == 1
    assert matched[0]["options"] == {"尺码": "XL码", "颜色": "黑色"}


# --------------------- Exact full-value matching across categories ---------------------

def _beauty_skus() -> list[dict]:
    """Build beauty variants combining capacity and skin type with shared numeric prefixes."""
    skus = []
    for spec in ("30ml", "50ml", "30ml*2"):
        for skin in ("干性肌肤", "油性肌肤", "中性肌肤"):
            skus.append({"sku_id": f"{spec}_{skin}", "options": {"规格": spec, "肤质": skin}})
    return skus


def _food_skus() -> list[dict]:
    """Build food variants combining flavor and package size with shared numbers."""
    skus = []
    for flavor in ("原味", "藤椒味", "海苔味"):
        for size in ("100g", "100g*3", "500g"):
            skus.append({"sku_id": f"{flavor}_{size}", "options": {"口味": flavor, "规格": size}})
    return skus


def test_filter_skus_exact_match_phone_all_dims(store: CartStore):
    """Resolve all three canonical phone dimensions from a client variant card."""
    tool = CartTool(cart_store=store)
    matched = tool._filter_skus("我要 12GB+256GB 青釉绿 标准版", _phone_skus())
    assert len(matched) == 1
    assert matched[0]["options"] == {"存储": "12GB+256GB", "颜色": "青釉绿", "版本": "标准版"}


def test_filter_skus_exact_match_beauty_multipack(store: CartStore):
    """Prefer the exact longest beauty-package value so `30ml` cannot capture `30ml*2`."""
    tool = CartTool(cart_store=store)
    matched = tool._filter_skus("我要 30ml*2 干性肌肤", _beauty_skus())
    assert len(matched) == 1
    assert matched[0]["options"] == {"规格": "30ml*2", "肤质": "干性肌肤"}
    # A single package should also resolve exactly.
    single = tool._filter_skus("我要 30ml 油性肌肤", _beauty_skus())
    assert len(single) == 1
    assert single[0]["options"] == {"规格": "30ml", "肤质": "油性肌肤"}


def test_filter_skus_exact_match_food_multipack(store: CartStore):
    """Resolve food flavor and package exactly so `100g` cannot capture `100g*3`."""
    tool = CartTool(cart_store=store)
    matched = tool._filter_skus("我要 藤椒味 100g*3", _food_skus())
    assert len(matched) == 1
    assert matched[0]["options"] == {"口味": "藤椒味", "规格": "100g*3"}


def test_filter_skus_fuzzy_fallback_partial_color(store: CartStore):
    """Use fuzzy fallback for a partial color value that omits the final suffix."""
    tool = CartTool(cart_store=store)
    matched = tool._filter_skus("M码 深灰", _pants_skus())
    assert len(matched) == 1
    assert matched[0]["options"] == {"尺码": "M码", "颜色": "深灰色"}


def test_filter_skus_partial_spec_keeps_asking(store: CartStore):
    """Keep asking when a color without size still matches multiple SKUs."""
    tool = CartTool(cart_store=store)
    matched = tool._filter_skus("深灰色", _pants_skus())
    assert len(matched) == 3  # Three sizes share this color, so the match is not unique.





# --------------------------- LLM semantic disambiguation in cart flows ---------------------------

def test_add_ambiguous_name_uses_llm(store: CartStore, monkeypatch):
    """Use the LLM to select one subcategory when a brand matches products in multiple categories."""
    # The screen contains two products from one brand in different subcategories.
    sess = AgentSession()
    sess.remember_search(
        {"category": "数码电子"},
        [{"product_id": "d1", "title": "华为 FreeBuds 真无线耳机"},
         {"product_id": "d2", "title": "华为 Pura 90 手机"}],
    )
    tool = CartTool(cart_store=store)
    # Dispatch resolves to add without an index.
    monkeypatch.setattr(cart_module, "dispatch_action", _stub_dispatch("add"))
    # Stub resolve_one to simulate the LLM selecting the first candidate; missing enrichment is irrelevant.
    monkeypatch.setattr(cart_module, "resolve_one", lambda query, cands: 0)
    # d1 has no temporary SKU, so begin_add suggests another product rather than asking which product was meant.
    res = tool.run("把华为耳机加进来", sess, {})
    assert res.payload.get("action") != "ask_which_product"


def test_add_ambiguous_name_llm_unavailable_asks(store: CartStore, monkeypatch):
    """List candidates for clarification instead of adding arbitrarily when LLM resolution is unavailable."""
    sess = AgentSession()
    sess.remember_search(
        {"category": "数码电子"},
        [{"product_id": "d1", "title": "华为 FreeBuds 真无线耳机"},
         {"product_id": "d2", "title": "华为 Pura 90 手机"}],
    )
    tool = CartTool(cart_store=store)
    monkeypatch.setattr(cart_module, "dispatch_action", _stub_dispatch("add"))
    monkeypatch.setattr(cart_module, "resolve_one", lambda query, cands: None)
    res = tool.run("把华为加进来", sess, {})
    assert res.payload["action"] == "ask_which_product"
    assert sess.get("pending_add") is not None
