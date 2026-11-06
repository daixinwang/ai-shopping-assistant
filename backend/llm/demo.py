"""Offline, deterministic chat model for local demos and frontend integration.

``DemoChatModel`` implements the ``ChatModel`` protocol (``llm.base``) with hand-written
keyword and template rules, so the whole shopping agent can run end to end without an
API key or network access::

    from llm.client import set_chat_model
    from llm.demo import DemoChatModel

    set_chat_model(DemoChatModel())

The rules imitate the response *shape* each caller expects (function-call arguments for
the router, query parser, decomposer, action dispatcher and product matcher, plus plain
text for vision, titles and the answer composer). They do not represent the language
understanding, recall or writing quality of a real model and must not be used to judge
the product's real behaviour. Callers without a rule receive ``RuntimeError`` so their
existing fallback paths run, exactly as they would after a provider failure.
"""

from __future__ import annotations

import asyncio
import json
import os
import re
from collections.abc import AsyncIterator, Sequence
from typing import Any


# ---------------------------------------------------------------------------
# Shared text helpers
# ---------------------------------------------------------------------------

_CURRENT_QUERY_MARK = "当前 query："
_HISTORY_MARK = "最近对话："


def _content_text(content: Any) -> str:
    """Return the text of a chat message content, including multimodal text parts."""
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        return "\n".join(
            str(part.get("text") or "")
            for part in content
            if isinstance(part, dict) and part.get("type") == "text"
        )
    return ""


def _last_user_text(messages: Sequence[dict[str, Any]]) -> str:
    for message in reversed(messages):
        if message.get("role") == "user":
            return _content_text(message.get("content"))
    return ""


def _split_dialogue(content: str) -> tuple[str, str]:
    """Split router/action prompts into (recent conversation, current query)."""
    head, separator, tail = content.rpartition(_CURRENT_QUERY_MARK)
    if not separator:
        return "", content.strip()
    return head.replace(_HISTORY_MARK, "", 1).strip(), tail.strip()


def _first_hit(text: str, words: Sequence[str]) -> str | None:
    return next((word for word in words if word in text), None)


# ---------------------------------------------------------------------------
# Numbers and budgets
# ---------------------------------------------------------------------------

_CN_DIGITS = {"零": 0, "一": 1, "二": 2, "两": 2, "三": 3, "四": 4, "五": 5, "六": 6, "七": 7, "八": 8, "九": 9}
_CN_UNITS = {"十": 10, "百": 100, "千": 1000}
_NUMBER = r"\d+(?:\.\d+)?[kK千wW万]?|[一二两三四五六七八九十百千万]+"
_MONEY = r"(?P<unit>\s*(?:元|块钱|块))?"
_RANGE_RE = re.compile(
    rf"(?P<low>{_NUMBER})\s*(?:元|块钱|块)?\s*(?:到|至|-|~|～)\s*(?P<value>{_NUMBER}){_MONEY}"
)
_MAX_RES = (
    re.compile(rf"(?P<prefix>预算|不超过|不高于|低于|少于|最多)\s*(?P<value>{_NUMBER}){_MONEY}"),
    re.compile(rf"(?P<value>{_NUMBER}){_MONEY}\s*(?:以内|以下|之内|内)"),
)
_MIN_RES = (
    re.compile(rf"(?P<prefix>高于|超过|不低于|至少)\s*(?P<value>{_NUMBER}){_MONEY}"),
    re.compile(rf"(?P<value>{_NUMBER}){_MONEY}\s*(?:以上|起)"),
)


def _cn_to_number(token: str) -> int | None:
    """Convert simple Chinese numerals such as 五百、两千、一千五 to integers."""
    total = section = digit = 0
    last_unit = 1
    for char in token:
        if char in _CN_DIGITS:
            digit = _CN_DIGITS[char]
        elif char == "万":
            total += (section + digit) * 10000
            section = digit = 0
            last_unit = 10000
        elif char in _CN_UNITS:
            section += (digit or 1) * _CN_UNITS[char]
            digit = 0
            last_unit = _CN_UNITS[char]
        else:
            return None
    if digit:  # Colloquial "一千五" means 1500.
        section += digit * (last_unit // 10 if last_unit >= 10 else 1)
    return total + section


def _to_number(token: str) -> float | None:
    token = token.strip()
    if not token:
        return None
    if token[0].isdigit():
        multiplier = {"k": 1000, "K": 1000, "千": 1000, "w": 10000, "W": 10000, "万": 10000}.get(token[-1], 1)
        return float(token[:-1] if multiplier != 1 else token) * multiplier
    value = _cn_to_number(token)
    return float(value) if value is not None else None


def _plausible_price(token: str, has_unit: bool, prefix: str | None = None) -> bool:
    """Reject numbers that are clearly not budgets (预算一般 / 最多2个)."""
    if has_unit or prefix == "预算":
        return token[0].isdigit() or any(char in "十百千万" for char in token)
    if token[0].isdigit():
        return len(re.match(r"\d+", token).group()) >= 2 or token[-1] in "kK千wW万"
    return any(char in "百千万" for char in token)


def _find_budget(text: str) -> tuple[float | None, float | None, tuple[int, int] | None]:
    """Return (min_price, max_price, span of the max-price number) for explicit budgets."""
    text = text or ""
    for match in _RANGE_RE.finditer(text):
        low, high = match.group("low"), match.group("value")
        priced = bool(match.group("unit")) or any(word in text for word in ("预算", "价格", "价位"))
        if priced and _plausible_price(low, True) and _plausible_price(high, True):
            return _to_number(low), _to_number(high), match.span("value")

    def first(patterns: Sequence[re.Pattern[str]]) -> re.Match[str] | None:
        found = [
            match
            for pattern in patterns
            for match in pattern.finditer(text)
            if _plausible_price(
                match.group("value"),
                bool(match.group("unit")),
                match.groupdict().get("prefix"),
            )
        ]
        return min(found, key=lambda match: match.start("value")) if found else None

    max_match, min_match = first(_MAX_RES), first(_MIN_RES)
    return (
        _to_number(min_match.group("value")) if min_match else None,
        _to_number(max_match.group("value")) if max_match else None,
        max_match.span("value") if max_match else None,
    )


def _format_number(value: float) -> str:
    return str(int(value)) if float(value).is_integer() else f"{value:g}"


# ---------------------------------------------------------------------------
# route_to_tool (agent.intent_router)
# ---------------------------------------------------------------------------

_CART_WORDS = ("购物车", "加购", "加入", "加进", "下单", "结算", "删掉", "删除", "来一件", "来一个", "买这些")
_PRICE_HINT_RE = re.compile(r"[元块]|预算|以内|以下|以上|价")
_COMPARE_WORDS = ("对比", "比较", "区别", "哪个好", "哪款好", "哪个更", "哪款更")
_OFF_TOPIC_WORDS = (
    "天气", "新闻", "股票", "笑话", "讲个故事", "写代码", "编程", "翻译",
    "你是谁", "你叫什么", "你好", "谢谢", "再见",
)
_SHOPPING_WORDS = ("推荐", "买", "找", "想要", "有没有", "预算", "元", "块", "价格")
_VAGUE_WORDS = (
    "随便看看", "随便逛逛", "随便推荐", "有啥好东西", "有什么好东西",
    "买点啥", "买点什么", "不知道买什么",
)
_DETAIL_WORDS = ("评价", "怎么样", "续航", "口碑", "详细", "差评", "缺点", "好用吗", "值得买吗")
_REFINE_WORDS = (
    "再便宜", "便宜点", "便宜一点", "更便宜", "平价", "换个", "换一", "只要", "不要",
    "还有别的", "还有其他", "其他品牌", "别的品牌", "除了",
)
_CHEAPER_WORDS = ("便宜", "平价")
_PRODUCT_CONTEXT_MARKS = ("productId", "为你推荐了", "为你找到", "已为你对比")


def _cart_hit(text: str) -> str | None:
    hit = _first_hit(text, _CART_WORDS)
    if hit:
        return hit
    # "改成两件" is a cart edit, but "预算改成 300" is a refinement.
    if "改成" in text and not _PRICE_HINT_RE.search(text):
        return "改成"
    return None


def _off_topic_hit(text: str) -> str | None:
    hit = _first_hit(text, _OFF_TOPIC_WORDS)
    return hit if hit and not _first_hit(text, _SHOPPING_WORDS) else None


def _user_lines(context: str) -> list[str]:
    return [line[len("用户: "):].strip() for line in context.splitlines() if line.startswith("用户: ")]


def _rewrite_cheaper(query: str, context: str) -> str:
    """Rewrite "再便宜点" from the latest earlier budget: 500 元以内 → 350 元以内."""
    if not _first_hit(query, _CHEAPER_WORDS) or _find_budget(query)[1] is not None:
        return query
    for line in reversed(_user_lines(context)):
        if line == query:
            continue
        _, max_price, span = _find_budget(line)
        if max_price is not None and span is not None:
            lowered = max(int(round(max_price * 0.7 / 10.0)) * 10, 1)
            return line[: span[0]] + _format_number(lowered) + line[span[1]:]
    return query


def _route_to_tool(messages: Sequence[dict[str, Any]], schema: dict[str, Any]) -> dict[str, Any]:
    context, query = _split_dialogue(_last_user_text(messages))
    has_products = any(mark in context for mark in _PRODUCT_CONTEXT_MARKS)

    rules: tuple[tuple[str, str, str | None], ...] = (
        ("cart", "high", _cart_hit(query)),
        ("compare", "high", _first_hit(query, _COMPARE_WORDS)),
        ("fallback", "high", _off_topic_hit(query)),
        ("clarify", "low", _first_hit(query, _VAGUE_WORDS)),
        ("product_detail", "high", _first_hit(query, _DETAIL_WORDS) if has_products else None),
        ("refine", "high", _first_hit(query, _REFINE_WORDS) if has_products else None),
    )
    if not query:
        tool, confidence, reasoning = "clarify", "low", "demo 规则：空输入，引导补充需求"
    else:
        tool, confidence, hit = next(
            (rule for rule in rules if rule[2]),
            ("recommend", "medium", None),
        )
        reasoning = (
            f"demo 规则：命中「{hit}」→ {tool}"
            if hit
            else "demo 规则：未命中特殊关键词，按导购推荐处理"
        )

    rewritten = _rewrite_cheaper(query, context) if tool == "refine" else query
    return {
        "tool": tool,
        "rewritten_query": rewritten or query,
        "confidence": confidence,
        "reasoning": reasoning,
    }


# ---------------------------------------------------------------------------
# extract_search_intent (search.llm_parser)
# ---------------------------------------------------------------------------

# Colloquial words mapped to catalog values; a mapping is used only when its target is
# present in the enum the caller sends, so dynamic taxonomies stay authoritative.
_SUB_CATEGORY_ALIASES = {
    "蓝牙耳机": "真无线耳机", "无线耳机": "真无线耳机", "降噪耳机": "真无线耳机", "耳机": "真无线耳机",
    "手机": "智能手机", "平板": "平板电脑", "ipad": "平板电脑", "笔记本": "笔记本电脑", "电脑": "笔记本电脑",
    "跑鞋": "跑步鞋", "慢跑鞋": "跑步鞋", "运动鞋": "跑步鞋", "球鞋": "篮球鞋", "登山鞋": "徒步鞋",
    "t恤": "短袖T恤", "短袖": "短袖T恤", "速干衣": "速干T恤", "短裤": "运动短裤", "长裤": "运动长裤",
    "运动裤": "运动长裤", "双肩包": "背包", "书包": "背包",
    "洗面奶": "洁面", "洁面乳": "洁面", "口红": "唇釉", "唇膏": "唇釉", "防晒霜": "防晒", "防晒乳": "防晒",
    "爽肤水": "化妆水", "卸妆水": "卸妆", "卸妆油": "卸妆", "精华液": "精华", "散粉": "蜜粉", "粉饼": "蜜粉",
    "粉底": "粉底液", "气垫": "粉底液",
    "零食": "坚果/零食", "坚果": "坚果/零食", "泡面": "方便食品", "方便面": "方便食品",
    "汽水": "碳酸饮料", "可乐": "碳酸饮料", "能量饮料": "功能饮料", "功能性饮料": "功能饮料",
}
# Colloquial words mapped to a fragment of a top-level category name.
_CATEGORY_ALIASES = {
    "化妆品": "美妆", "护肤品": "护肤", "衣服": "服饰", "服装": "服饰", "穿的": "服饰",
    "吃的": "食品", "零嘴": "食品", "喝的": "饮料", "3c": "数码", "电子产品": "电子",
}
_BRAND_ALIASES = {
    "nike": "耐克", "adidas": "阿迪达斯", "lululemon": "露露乐蒙", "uniqlo": "优衣库",
    "北面": "The North Face", "iphone": "Apple 苹果", "huawei": "华为", "xiaomi": "小米",
    "lenovo": "联想", "anta": "安踏", "decathlon": "迪卡侬",
}
_EXCLUDE_CUES = ("不想要", "不要", "除了", "排除", "不考虑")
_INGREDIENT_CUES = ("不含", "不要", "不加", "无")
_INGREDIENT_TERMS = ("酒精", "香精", "色素", "防腐剂", "咖啡因", "花生", "香菜", "糖", "辣")
_SOFT_TERMS = (
    "通勤", "降噪", "轻薄", "便携", "性价比", "学生", "送礼", "礼物", "办公", "游戏", "拍照",
    "续航", "防水", "透气", "保湿", "控油", "敏感肌", "油皮", "干皮", "健身", "跑步", "户外", "旅行",
)
_WINDOW_STOPS = set("，,。.;；！!？?的和或")


def _enum_values(schema: dict[str, Any], field: str) -> list[str]:
    spec = schema.get("function", {}).get("parameters", {}).get("properties", {}).get(field, {})
    values = spec.get("enum") or (spec.get("items") or {}).get("enum") or []
    return [value for value in values if isinstance(value, str) and value]


def _negated_spans(text: str, cues: Sequence[str]) -> list[tuple[int, int]]:
    """Short windows after negation cues, ending at punctuation or 的/和/或."""
    spans = []
    for cue in cues:
        start = text.find(cue)
        while start >= 0:
            begin = end = start + len(cue)
            while end < len(text) and end - begin < 12 and text[end] not in _WINDOW_STOPS:
                end += 1
            spans.append((begin, end))
            start = text.find(cue, begin)
    return spans


def _matches(text: str, aliases: dict[str, str]) -> list[tuple[int, int, str]]:
    """Find aliases in text, dropping matches nested inside a longer match."""
    lowered = text.lower()
    found = []
    for alias, value in aliases.items():
        index = lowered.find(alias.lower())
        if index >= 0:
            found.append((index, index + len(alias), value))
    return sorted(
        (
            match for match in found
            if not any(
                other[0] <= match[0] and match[1] <= other[1] and other[1] - other[0] > match[1] - match[0]
                for other in found
            )
        ),
        key=lambda match: (match[0], match[0] - match[1]),
    )


def _split_by_negation(
    matches: list[tuple[int, int, str]], spans: list[tuple[int, int]]
) -> tuple[list[str], list[str]]:
    wanted: list[str] = []
    excluded: list[str] = []
    for start, _, value in matches:
        target = excluded if any(begin <= start < end for begin, end in spans) else wanted
        if value not in target:
            target.append(value)
    return wanted, [value for value in excluded if value not in wanted]


def _sub_category_aliases(sub_categories: list[str]) -> dict[str, str]:
    aliases: dict[str, str] = {}
    for sub in sub_categories:
        aliases[sub] = sub
        for part in re.split(r"[/、]", sub):
            if len(part) >= 2:
                aliases.setdefault(part, sub)
    for alias, sub in _SUB_CATEGORY_ALIASES.items():
        if sub in sub_categories:
            aliases.setdefault(alias, sub)
    return aliases


def _category_aliases(categories: list[str]) -> dict[str, str]:
    aliases: dict[str, str] = {}
    for category in categories:
        aliases[category] = category
        if len(category) == 4:  # 美妆护肤 → 美妆 / 护肤
            aliases.setdefault(category[:2], category)
            aliases.setdefault(category[2:], category)
    for alias, fragment in _CATEGORY_ALIASES.items():
        target = next((category for category in categories if fragment in category), None)
        if target:
            aliases.setdefault(alias, target)
    return aliases


def _brand_aliases(brands: list[str]) -> dict[str, str]:
    aliases: dict[str, str] = {}
    for brand in brands:
        aliases[brand] = brand
        for token in brand.split():
            if len(token) >= 2 and token.lower() != "the":
                aliases.setdefault(token, brand)
    for alias, brand in _BRAND_ALIASES.items():
        if brand in brands:
            aliases.setdefault(alias, brand)
    return aliases


def _json_number(value: float | None) -> int | float | None:
    if value is None:
        return None
    return int(value) if float(value).is_integer() else value


def _extract_search_intent(messages: Sequence[dict[str, Any]], schema: dict[str, Any]) -> dict[str, Any]:
    text = _split_dialogue(_last_user_text(messages))[1]
    excluded_spans = _negated_spans(text, _EXCLUDE_CUES)

    sub_wanted, sub_excluded = _split_by_negation(
        _matches(text, _sub_category_aliases(_enum_values(schema, "sub_category"))), excluded_spans
    )
    category_wanted, category_excluded = _split_by_negation(
        _matches(text, _category_aliases(_enum_values(schema, "category"))), excluded_spans
    )
    brand_wanted, brand_excluded = _split_by_negation(
        _matches(text, _brand_aliases(_enum_values(schema, "brand_include"))), excluded_spans
    )
    min_price, max_price, _ = _find_budget(text)

    negatives: list[str] = []
    for begin, end in _negated_spans(text, _INGREDIENT_CUES):
        for term in _INGREDIENT_TERMS:
            if term in text[begin:end] and term not in negatives:
                negatives.append(term)
    soft_terms = [term for term in _SOFT_TERMS if term in text]
    if _first_hit(text, ("便宜", "平价", "实惠")) and "性价比" not in soft_terms:
        soft_terms.append("性价比")

    sub_category = sub_wanted[0] if sub_wanted else None
    category = None if sub_category else (category_wanted[0] if category_wanted else None)
    has_signal = any((sub_category, category, brand_wanted, min_price, max_price, soft_terms))
    return {
        "category": category,
        "sub_category": sub_category,
        "brand_include": brand_wanted,
        "brand_exclude": brand_excluded,
        "category_exclude": category_excluded,
        "sub_category_exclude": sub_excluded,
        "max_price": _json_number(max_price),
        "min_price": _json_number(min_price),
        "negative_ingredients": negatives,
        "soft_terms": soft_terms,
        "needs_clarification": not has_signal and (not text or bool(_first_hit(text, _VAGUE_WORDS))),
    }


# ---------------------------------------------------------------------------
# split_shopping_requests (search.query_decomposer)
# ---------------------------------------------------------------------------

_FILLER_WORDS = (
    "我想要", "我想", "想要", "想买", "我要", "帮我", "给我", "请问", "麻烦", "推荐",
    "一下", "一款", "几款", "一些", "一个", "有没有", "有什么", "找", "看看",
    "吗", "呢", "吧", "啊", "呀",
)
_PUNCTUATION_RE = re.compile(r"[\s，。,.!！?？、~～：:；;「」\"']+")


def _strip_fillers(text: str) -> str:
    for word in _FILLER_WORDS:
        text = text.replace(word, "")
    return _PUNCTUATION_RE.sub("", text)


def _short_label(query: str) -> str:
    """Short demand label such as 耳机 / 洗面奶 for one shopping request."""
    cleaned = _strip_fillers(query)
    tail = cleaned.rsplit("的", 1)[-1]
    if 2 <= len(tail) <= 6:
        return tail
    return cleaned.replace("的", "")[:6] or query[:6]


def _split_shopping_requests(messages: Sequence[dict[str, Any]], schema: dict[str, Any]) -> dict[str, Any]:
    query = _split_dialogue(_last_user_text(messages))[1]
    return {"requests": [{"label": _short_label(query), "query": query}]}


# ---------------------------------------------------------------------------
# choose_action (agent.llm_actions)
# ---------------------------------------------------------------------------

_COUNT = r"[0-9]+|[一二两三四五六七八九十]+"
_UNIT = r"(?:件|个|份|双|台|盒|瓶|支|套|只|包|条)"
_ORDINAL_RE = re.compile(rf"第\s*(?P<n>{_COUNT})")
_QUANTITY_RE = re.compile(rf"(?<![第0-9一二两三四五六七八九十])(?P<n>{_COUNT})\s*{_UNIT}")
_TARGET_QUANTITY_RE = re.compile(rf"(?:改成|改为|数量为)\s*(?P<n>{_COUNT})")
_ADD_COUNT_RE = re.compile(rf"来\s*(?:{_COUNT})\s*{_UNIT}")
_ADDRESS_RE = re.compile(r"(?:寄到|送到|收货地址[是为：:]?|地址[是为：:])\s*(?P<address>[^，。,；;！!？?]+)")
_ACTION_WORDS: tuple[tuple[str, tuple[str, ...]], ...] = (
    ("checkout", ("下单", "结算", "买这些", "就买", "付款", "提交订单")),
    ("remove", ("删掉", "删除", "去掉", "移除", "拿掉", "不要第")),
    ("set_quantity", ("改成", "改为", "数量")),
    ("add", ("加入", "加购", "加进", "加到", "放进", "来一件", "来一个")),
    ("view", ("购物车", "车里", "多少钱", "合计")),
)


def _count(pattern: re.Pattern[str], text: str) -> int | None:
    match = pattern.search(text)
    if not match:
        return None
    token = match.group("n")
    return int(token) if token.isdigit() else _cn_to_number(token)


def _choose_action(messages: Sequence[dict[str, Any]], schema: dict[str, Any]) -> dict[str, Any]:
    query = _split_dialogue(_last_user_text(messages))[1]
    declared = schema.get("function", {}).get("parameters", {}).get("properties", {})
    actions = _enum_values(schema, "action")

    action = next(
        (
            name
            for name, words in _ACTION_WORDS
            if name in actions
            and (_first_hit(query, words) or (name == "add" and _ADD_COUNT_RE.search(query)))
        ),
        "view" if "view" in actions else None,
    )
    if action is None:
        raise RuntimeError("demo model has no rule for choose_action")

    ordinal = _count(_ORDINAL_RE, query)
    quantity = _count(_QUANTITY_RE, query)
    address = _ADDRESS_RE.search(query)
    candidates: dict[str, Any] = {}
    if action == "add":
        candidates = {"index": ordinal, "quantity": quantity}
    elif action == "set_quantity":
        candidates = {"cart_index": ordinal, "quantity": quantity or _count(_TARGET_QUANTITY_RE, query)}
    elif action == "remove":
        candidates = {"cart_index": ordinal}
    elif action == "checkout":
        candidates = {"address": address.group("address").strip() if address else None}
    return {
        "action": action,
        **{name: value for name, value in candidates.items() if name in declared and value is not None},
    }


# ---------------------------------------------------------------------------
# pick_products (agent.tools.llm_match)
# ---------------------------------------------------------------------------

_CANDIDATE_LINE_RE = re.compile(r"^(?P<index>\d+)\.\s*(?P<fields>.+)$")
_SENTENCE_RE = re.compile(r"用户这句话：(?P<sentence>.*)")
_MODEL_TOKEN_RE = re.compile(r"[A-Za-z][A-Za-z0-9]{3,}")
_GENERIC_MODEL_TOKENS = {"plus", "ultra", "mini", "max"}


def _mention(sentence: str, words: Sequence[str]) -> int | None:
    lowered = sentence.lower()
    positions = [lowered.find(word.lower()) for word in words if word]
    positions = [position for position in positions if position >= 0]
    return min(positions) if positions else None


def _candidate_score(sentence: str, fields: dict[str, str]) -> tuple[int, int]:
    """Score one candidate as (brand*2 + category + model, first mention position)."""
    brand = fields.get("品牌", "")
    sub_category = fields.get("子品类", "")
    signals = (
        (2, [brand, *[token for token in brand.split() if len(token) >= 2]]),
        (1, [sub_category, *[alias for alias, sub in _SUB_CATEGORY_ALIASES.items() if sub == sub_category]]),
        (1, [
            token for token in _MODEL_TOKEN_RE.findall(fields.get("标题", ""))
            if token.lower() not in _GENERIC_MODEL_TOKENS
        ]),
    )
    score, positions = 0, []
    for weight, words in signals:
        position = _mention(sentence, words)
        if position is not None:
            score += weight
            positions.append(position)
    return score, min(positions, default=len(sentence))


def _pick_products(messages: Sequence[dict[str, Any]], schema: dict[str, Any]) -> dict[str, Any]:
    content = _last_user_text(messages)
    sentence_match = _SENTENCE_RE.search(content)
    sentence = sentence_match.group("sentence").strip() if sentence_match else ""
    candidates = []
    for line in content.splitlines():
        match = _CANDIDATE_LINE_RE.match(line.strip())
        if match:
            fields = dict(
                (key.strip(), value.strip())
                for key, _, value in (part.partition("：") for part in match.group("fields").split("｜"))
            )
            candidates.append((int(match.group("index")), _candidate_score(sentence, fields)))
    if not candidates:
        return {"indices": [], "reason": "demo 规则：没有候选商品"}

    best = max(score for _, (score, _) in candidates)
    if best == 0:
        return {"indices": [candidates[0][0]], "reason": "demo 规则：未匹配到名称，默认第一个候选"}
    picked = sorted((position, index) for index, (score, position) in candidates if score == best)
    return {
        "indices": [index for _, index in picked],
        "reason": "demo 规则：按品牌、子品类和型号子串匹配",
    }


# ---------------------------------------------------------------------------
# Plain-text callers: vision (llm.vision) and titles (api.main /title)
# ---------------------------------------------------------------------------

_VISION_QUERY = "降噪蓝牙耳机"
_TITLE_PROMPT_MARK = "标题生成器"


def _has_image(messages: Sequence[dict[str, Any]]) -> bool:
    return any(
        isinstance(message.get("content"), list)
        and any(isinstance(part, dict) and part.get("type") == "image_url" for part in message["content"])
        for message in messages
    )


def _title(content: str) -> str:
    """At most 8 characters taken from the user's need, e.g. 适合油皮洗面奶."""
    user_text = next(
        (line[len("用户："):] for line in content.splitlines() if line.startswith("用户：")),
        content,
    )
    cleaned = _strip_fillers(user_text).replace("的", "")
    return (cleaned or user_text.strip())[:8]


def _plain_reply(messages: Sequence[dict[str, Any]]) -> str:
    system = next(
        (_content_text(message.get("content")) for message in messages if message.get("role") == "system"),
        "",
    )
    if _has_image(messages):
        return _VISION_QUERY
    if _TITLE_PROMPT_MARK in system:
        return _title(_last_user_text(messages))
    if _DETAIL_PROMPT_MARK in system:
        _, payload, _ = _composer_input(messages)
        return _compose_detail(payload)
    if _COMPOSER_PROMPT_MARK in system:
        tool, payload, hint = _composer_input(messages)
        return json.dumps(_compose_answer(tool, payload, hint), ensure_ascii=False)
    raise RuntimeError("demo model has no rule for plain completion")


# ---------------------------------------------------------------------------
# Answer composer (agent.composer system prompts, no tools)
# ---------------------------------------------------------------------------

_COMPOSER_PROMPT_MARK = "电商导购助手"
_DETAIL_PROMPT_MARK = "单品导购问答助手"

# Descriptions avoid digits, prices, brands and model names, as the composer prompt
# requires; each category pool is long enough for one answer without repeats.
_DESCRIPTIONS: dict[str, tuple[str, ...]] = {
    "数码电子": (
        "音质通透、佩戴稳当，通勤地铁里也能安静听歌，日常用起来很省心",
        "续航扎实、连接稳定，上课办公随拿随用，适合想要省心好用的上班族",
        "做工细致、手感轻巧，追剧学习都很顺手，适合追求性价比的学生党",
        "性能释放稳定、屏幕观感舒服，剪辑修图也跟得上，适合进阶用户",
        "系统流畅、日常响应快，拍照和影音体验均衡，送给家人也很合适",
        "机身轻薄方便携带，出差路上也能高效处理工作，适合移动办公人群",
    ),
    "美妆护肤": (
        "质地轻薄好推开，上脸不黏腻，早晚都能用，适合日常基础护理",
        "主打温和保湿，敏感肌也能放心尝试，换季时用来稳住肤况正合适",
        "提亮肤色的同时兼顾修护，熬夜后用来救急，适合追求光泽感的人",
        "清爽不闷痘，夏天油皮用着也舒服，通勤前上妆服帖不容易搓泥",
        "成分精简、刺激性低，护肤新手入门友好，日常坚持用效果更稳定",
        "滋润度在线，干皮秋冬也不紧绷，睡前厚涂一层第二天更加水润",
    ),
    "服饰运动": (
        "面料亲肤透气，版型利落好搭配，通勤逛街和轻运动都很合适",
        "包裹性好、脚感回弹，日常跑步和健身训练都能穿，久走也不累",
        "速干排汗表现不错，户外徒步出汗后也不闷，适合爱运动的人",
        "剪裁宽松不挑身材，休闲日常穿着舒服，周末出游随手一套就行",
        "耐磨又防泼水，背负舒适不压肩，短途旅行和日常通勤都能用",
        "弹力足、贴合不勒，瑜伽和普拉提动作舒展自如，运动时更自在",
    ),
    "食品饮料": (
        "口感清爽不腻，办公室下午来一份提神解乏，囤货也很方便",
        "配料表简单干净，早餐搭配或加餐都合适，全家人都能放心吃",
        "香气浓郁、回味顺滑，熬夜加班时来一杯，提神效果比较明显",
        "分量实在、开袋即食，追剧看球时的好伙伴，适合爱囤零食的人",
        "冲泡方便，几分钟就能吃上热乎的，宿舍和加班场景都很实用",
        "低负担好入口，运动后补充能量也合适，日常当作健康饮品不错",
    ),
}
_GENERIC_DESCRIPTIONS = (
    "整体做工扎实、口碑稳定，日常使用很省心，适合追求性价比的人",
    "设计简洁好上手，送礼自用都合适，买回家不容易踩雷，值得一看",
    "细节处理到位，使用体验舒适，适合想一步到位、少折腾的用户",
    "定位均衡、各方面表现都不拉胯，作为入门之选很稳妥，放心入手",
    "颜值和实用兼顾，日常高频使用也耐造，适合注重品质感的人群",
    "评价里好评集中，复购的人不少，第一次尝试这个品类也很友好",
)
_CART_FOLLOWUP = ["看看购物车", "帮我下单", "再推荐几款相似的"]
_CART_REPORT_MARK = "请用自然口吻汇报购物车"
_CART_SUMMARY_PREFIX = "请确认并带出"


def _composer_input(messages: Sequence[dict[str, Any]]) -> tuple[str, dict[str, Any], str]:
    """Read ``tool``, ``payload`` and ``hint`` from the composer's last user message."""
    tool, payload, hint = "", {}, ""
    for line in _last_user_text(messages).splitlines():
        if line.startswith("tool: "):
            tool = line[len("tool: "):].strip()
        elif line.startswith("payload: "):
            try:
                payload = json.loads(line[len("payload: "):])
            except json.JSONDecodeError:
                payload = {}
        elif line.startswith("hint: "):
            hint = line[len("hint: "):].strip()
    return tool, payload, hint


def _need_label(payload: dict[str, Any]) -> tuple[str, str]:
    """Return (budget phrase, product label) describing what the user asked for."""
    parsed = payload.get("parsed") or {}
    hits = payload.get("hits") or []
    label = parsed.get("sub_category") or parsed.get("category")
    if not label:
        subs = {hit.get("sub_category") for hit in hits if hit.get("sub_category")}
        label = subs.pop() if len(subs) == 1 else "好物"
    low, high = parsed.get("min_price"), parsed.get("max_price")
    if low and high:
        budget = f"{_format_number(low)}–{_format_number(high)} 元的"
    elif high:
        budget = f"{_format_number(high)} 元以内的"
    elif low:
        budget = f"{_format_number(low)} 元以上的"
    else:
        budget = ""
    return budget, label


def _cart_opening(hint: str) -> str:
    if hint.startswith(_CART_REPORT_MARK):
        total = re.search(r"合计\s*([\d.]+)\s*元", hint)
        if total:
            return f"你的购物车目前合计 {total.group(1)} 元，确认无误就可以直接下单。"
        return "这是你购物车里的商品，确认无误就可以直接下单。"
    kept = []
    for sentence in (part.strip() for part in re.split(r"[。！]", hint)):
        if not sentence:
            continue
        if sentence.startswith(_CART_SUMMARY_PREFIX):
            kept.append(sentence[len(_CART_SUMMARY_PREFIX):])
        elif not sentence.startswith("请"):
            kept.append(sentence)
    return "，".join(kept) + "。" if kept else "好的，已经处理好了。"


def _compose_answer(tool: str, payload: dict[str, Any], hint: str) -> dict[str, Any]:
    if tool == "cart":
        return {"opening": _cart_opening(hint), "items": [], "followup": list(_CART_FOLLOWUP)}

    hits = payload.get("hits") or []
    budget, label = _need_label(payload)
    need = f"{budget}{label}"
    if not hits:
        return {
            "opening": f"抱歉，暂时没有找到 {need}，可以放宽预算或换个品牌再试试",
            "items": [],
            "followup": ["预算放宽一些再推荐", f"不限品牌推荐{label}", "换个品类看看"],
        }

    used: dict[str, int] = {}
    items = []
    for hit in hits:
        category = hit.get("category") or ""
        pool = _DESCRIPTIONS.get(category, _GENERIC_DESCRIPTIONS)
        index = used.get(category, 0)
        used[category] = index + 1
        description = pool[index] if index < len(pool) else _GENERIC_DESCRIPTIONS[index % len(_GENERIC_DESCRIPTIONS)]
        items.append({"productId": hit.get("productId"), "description": description})

    verb = "对比了" if tool == "compare" else "推荐了"
    count = f"为你{verb} {len(hits)} 款"
    opening = f"{count} {need}" if budget else f"{count}{label}"
    return {
        "opening": opening,
        "items": items,
        "followup": [f"推荐一些更平价的{label}", "对比一下刚才推荐的前两款", "看看第一款的用户评价"],
    }


_DETAIL_TEMPLATES = {
    "general": "这款{sub}整体定位均衡，核心卖点集中在日常好用和做工扎实上，适合想省心选购的人；如果对细节有特别要求，建议先看看规格参数和用户评价再决定。",
    "performance": "从现有信息看，这款{sub}的表现比较稳定，日常高频使用不容易出问题，适合追求省心体验的人；如果有更专业的需求，建议再对比一下同价位的其他款。",
    "reviews": "从现有评价看，这款{sub}整体口碑偏正面，用户提到最多的是用起来顺手、品质稳定；也有人觉得价格不算低，建议结合自己的预算和使用频率综合考虑。",
    "negative_reviews": "目前没有看到集中的差评，少数用户提到这款{sub}价格偏高、个别细节还有改进空间；如果你对性价比比较敏感，可以再对比一下同类商品的评价。",
    "sensitive_skin": "从现有评价和问答看，这款{sub}整体比较温和，但每个人的肤质不同，敏感肌建议先在耳后或手腕小范围试用两三天，没有不适再正常使用。",
    "size_fit": "从现有评价看，这款{sub}的尺码整体比较标准，多数用户按平时的尺码选择就合适；如果介于两个尺码之间，建议参考详情页的尺码表再决定。",
    "usage": "这款{sub}上手门槛不高，按说明正常使用就能获得不错的体验；日常注意妥善保管、按需使用，能让它保持更好的状态，有问题也可以继续问我。",
}


def _compose_detail(payload: dict[str, Any]) -> str:
    product = payload.get("product") or {}
    sub = product.get("sub_category") or product.get("category") or "商品"
    template = _DETAIL_TEMPLATES.get(payload.get("focus_aspect") or "", _DETAIL_TEMPLATES["general"])
    return template.format(sub=sub)


# ---------------------------------------------------------------------------
# Streaming
# ---------------------------------------------------------------------------

_CHUNK_SIZES = (3, 5, 2, 6, 4)


def _chunks(text: str) -> list[str]:
    """Split text into 2–6 character pieces, imitating token-sized deltas."""
    pieces, start, turn = [], 0, 0
    while start < len(text):
        size = _CHUNK_SIZES[turn % len(_CHUNK_SIZES)]
        pieces.append(text[start:start + size])
        start += size
        turn += 1
    return pieces


def _stream_delay() -> float:
    try:
        return max(0.0, float(os.getenv("DEMO_STREAM_DELAY_MS", "35")) / 1000)
    except ValueError:
        return 0.035


# ---------------------------------------------------------------------------
# Model
# ---------------------------------------------------------------------------

_TOOL_RULES = {
    "route_to_tool": _route_to_tool,
    "extract_search_intent": _extract_search_intent,
    "split_shopping_requests": _split_shopping_requests,
    "choose_action": _choose_action,
    "pick_products": _pick_products,
}


def _requested_tool(tools: list[dict[str, Any]], tool_choice: Any) -> str:
    """Resolve the function name the same way the client bridge labels the call."""
    if isinstance(tool_choice, dict):
        name = (tool_choice.get("function") or {}).get("name")
        if name:
            return name
    return (tools[0].get("function") or {}).get("name") or "tool"


def _tool_schema(tools: list[dict[str, Any]], name: str) -> dict[str, Any]:
    for tool in tools:
        if (tool.get("function") or {}).get("name") == name:
            return tool
    return tools[0]


class DemoChatModel:
    """Rule-based ``ChatModel`` for offline demos; see the module docstring."""

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
        if not tools:
            return _plain_reply(messages)
        name = _requested_tool(tools, tool_choice)
        rule = _TOOL_RULES.get(name)
        if rule is None:
            raise RuntimeError(f"demo model has no rule for {name}")
        return json.dumps(rule(messages, _tool_schema(tools, name)), ensure_ascii=False)

    async def stream(
        self,
        messages: Sequence[dict[str, Any]],
        *,
        tools: list[dict[str, Any]] | None = None,
        temperature: float | None = None,
        timeout: float | None = None,
        max_tokens: int | None = None,
    ) -> AsyncIterator[str]:
        if tools:
            raise RuntimeError("demo model does not stream tool calls")
        delay = _stream_delay()
        for piece in _chunks(_plain_reply(messages)):
            if delay:
                await asyncio.sleep(delay)
            yield piece
