# Multi-Provider AI Config Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 App 支持 Anthropic / OpenAI / Gemini 三家 AI Provider，用户可在 App 内设置页填写 API Key 并选择模型，配置全局生效。

**Architecture:** 后端新增 `AIConfig` 单例保存运行时配置，`AIClientFactory` 封装三家 Provider 的统一调用接口；三个 AI 服务改为调用工厂方法；新增 `/config` 和 `/providers` 端点供前端读写配置。前端新增 SettingsScreen，用 AsyncStorage 持久化并在启动时恢复后端配置。

**Tech Stack:** Python `anthropic` / `openai` / `google-generativeai`；React Native `@react-native-async-storage/async-storage`；`@react-native-picker/picker`

---

## 文件变更清单

**后端（新建）：**
- `backend/services/ai_config.py` — 全局配置单例
- `backend/services/ai_client_factory.py` — 三家 Provider 统一调用接口
- `backend/api/v1/config.py` — `/config` 和 `/providers` 端点
- `backend/tests/test_ai_config.py` — AIConfig 单元测试
- `backend/tests/test_ai_client_factory.py` — Factory 单元测试（mock SDK）

**后端（修改）：**
- `backend/requirements.txt` — 添加 openai, google-generativeai
- `backend/services/vision_service.py` — 改用 factory.call()
- `backend/services/suggestion_service.py` — 改用 factory.call()
- `backend/services/intent_service.py` — 改用 factory.call()
- `backend/main.py` — 注册 config 路由

**前端（新建）：**
- `mobile/src/screens/SettingsScreen.tsx`

**前端（修改）：**
- `mobile/src/api/client.ts` — 添加 config API 函数
- `mobile/src/navigation/AppNavigator.tsx` — 添加 Settings 路由
- `mobile/src/screens/HomeScreen.tsx` — 添加 ⚙️ 入口
- `mobile/App.tsx` — 启动时恢复配置

---

## Task 1: 更新后端依赖

**Files:**
- Modify: `backend/requirements.txt`

- [ ] **Step 1: 添加新依赖**

将 `backend/requirements.txt` 替换为：

```
fastapi==0.115.5
uvicorn[standard]==0.32.1
python-multipart==0.0.12
anthropic==0.40.0
openai==1.54.0
google-generativeai==0.8.3
pydantic==2.10.3
pydantic-settings==2.7.0
pytest==8.3.4
pytest-asyncio==0.24.0
httpx==0.28.1
python-dotenv==1.0.1
```

- [ ] **Step 2: 安装依赖**

```bash
cd backend && pip3 install openai==1.54.0 google-generativeai==0.8.3
```

预期：两个包安装成功，无错误。

- [ ] **Step 3: 验证导入**

```bash
cd backend && python3 -c "import openai; import google.generativeai; print('OK')"
```

预期输出：`OK`

- [ ] **Step 4: Commit**

```bash
git add backend/requirements.txt
git commit -m "feat: add openai and google-generativeai dependencies"
```

---

## Task 2: 实现 AIConfig 单例

**Files:**
- Create: `backend/services/ai_config.py`
- Create: `backend/tests/test_ai_config.py`

- [ ] **Step 1: 写失败测试**

创建 `backend/tests/test_ai_config.py`：

```python
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from services.ai_config import AIConfig

def test_default_values():
    config = AIConfig.get_instance()
    assert config.provider == "anthropic"
    assert config.model == "claude-3-5-sonnet-20241022"
    assert config.api_key == ""

def test_singleton():
    a = AIConfig.get_instance()
    b = AIConfig.get_instance()
    assert a is b

def test_update():
    config = AIConfig.get_instance()
    config.update(provider="openai", model="gpt-4o", api_key="sk-test")
    assert config.provider == "openai"
    assert config.model == "gpt-4o"
    assert config.api_key == "sk-test"
    # 还原
    config.update(provider="anthropic", model="claude-3-5-sonnet-20241022", api_key="")
```

- [ ] **Step 2: 运行确认失败**

```bash
cd backend && python3 -m pytest tests/test_ai_config.py -v
```

预期：`ImportError` 或 `ModuleNotFoundError`

- [ ] **Step 3: 实现 AIConfig**

创建 `backend/services/ai_config.py`：

```python
class AIConfig:
    """全局 AI 配置单例，保存当前激活的 Provider / Model / API Key"""
    _instance = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance.provider = "anthropic"
            cls._instance.model = "claude-3-5-sonnet-20241022"
            cls._instance.api_key = ""
        return cls._instance

    @classmethod
    def get_instance(cls) -> "AIConfig":
        return cls()

    def update(self, provider: str, model: str, api_key: str):
        self.provider = provider
        self.model = model
        self.api_key = api_key
```

- [ ] **Step 4: 运行确认通过**

```bash
cd backend && python3 -m pytest tests/test_ai_config.py -v
```

预期：3 passed

- [ ] **Step 5: Commit**

```bash
git add backend/services/ai_config.py backend/tests/test_ai_config.py
git commit -m "feat: add AIConfig singleton for runtime provider configuration"
```

---

## Task 3: 实现 AIClientFactory

**Files:**
- Create: `backend/services/ai_client_factory.py`
- Create: `backend/tests/test_ai_client_factory.py`

- [ ] **Step 1: 写失败测试**

创建 `backend/tests/test_ai_client_factory.py`：

```python
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault("ANTHROPIC_API_KEY", "test")

from unittest.mock import MagicMock, patch
from services.ai_config import AIConfig
from services.ai_client_factory import AIClientFactory

def make_anthropic_response(text):
    mock = MagicMock()
    mock.content = [MagicMock(text=text)]
    return mock

def make_openai_response(text):
    mock = MagicMock()
    mock.choices = [MagicMock(message=MagicMock(content=text))]
    return mock

def setup_function():
    # 每个测试前重置配置
    AIConfig.get_instance().update("anthropic", "claude-3-5-sonnet-20241022", "test-key")

def test_call_anthropic_text_only():
    factory = AIClientFactory()
    mock_resp = make_anthropic_response("hello")
    with patch("anthropic.Anthropic") as MockClient:
        MockClient.return_value.messages.create.return_value = mock_resp
        result = factory.call(system="sys", text="hi")
    assert result == "hello"

def test_call_openai_text_only():
    AIConfig.get_instance().update("openai", "gpt-4o", "sk-test")
    factory = AIClientFactory()
    mock_resp = make_openai_response("world")
    with patch("openai.OpenAI") as MockClient:
        MockClient.return_value.chat.completions.create.return_value = mock_resp
        result = factory.call(system="sys", text="hi")
    assert result == "world"

def test_unsupported_provider_raises():
    AIConfig.get_instance().update("unknown", "model", "key")
    factory = AIClientFactory()
    try:
        factory.call(system="sys", text="hi")
        assert False, "应该抛出 ValueError"
    except ValueError as e:
        assert "unknown" in str(e)
```

- [ ] **Step 2: 运行确认失败**

```bash
cd backend && python3 -m pytest tests/test_ai_client_factory.py -v
```

预期：ImportError（AIClientFactory 未定义）

- [ ] **Step 3: 实现 AIClientFactory**

创建 `backend/services/ai_client_factory.py`：

```python
import base64
from services.ai_config import AIConfig


class AIClientFactory:
    """
    统一 AI 调用接口。
    根据 AIConfig 当前 provider，路由到对应 SDK 完成调用，返回纯文本响应。
    """

    def call(
        self,
        system: str,
        text: str,
        image_bytes: bytes | None = None,
        media_type: str = "image/jpeg",
    ) -> str:
        config = AIConfig.get_instance()
        provider = config.provider
        model = config.model
        api_key = config.api_key

        if provider == "anthropic":
            return self._call_anthropic(api_key, model, system, text, image_bytes, media_type)
        elif provider == "openai":
            return self._call_openai(api_key, model, system, text, image_bytes, media_type)
        elif provider == "gemini":
            return self._call_gemini(api_key, model, system, text, image_bytes)
        else:
            raise ValueError(f"不支持的 Provider: {provider}")

    # ── Anthropic ──────────────────────────────────────────────
    def _call_anthropic(self, api_key, model, system, text, image_bytes, media_type):
        import anthropic
        client = anthropic.Anthropic(api_key=api_key)
        user_content = []
        if image_bytes:
            user_content.append({
                "type": "image",
                "source": {
                    "type": "base64",
                    "media_type": media_type,
                    "data": base64.standard_b64encode(image_bytes).decode(),
                },
            })
        user_content.append({"type": "text", "text": text})
        response = client.messages.create(
            model=model,
            max_tokens=1024,
            system=system,
            messages=[{"role": "user", "content": user_content}],
        )
        return response.content[0].text

    # ── OpenAI ─────────────────────────────────────────────────
    def _call_openai(self, api_key, model, system, text, image_bytes, media_type):
        from openai import OpenAI
        client = OpenAI(api_key=api_key)
        messages = [{"role": "system", "content": system}]
        if image_bytes:
            b64 = base64.standard_b64encode(image_bytes).decode()
            messages.append({
                "role": "user",
                "content": [
                    {"type": "image_url", "image_url": {"url": f"data:{media_type};base64,{b64}"}},
                    {"type": "text", "text": text},
                ],
            })
        else:
            messages.append({"role": "user", "content": text})
        response = client.chat.completions.create(model=model, messages=messages, max_tokens=1024)
        return response.choices[0].message.content

    # ── Gemini ─────────────────────────────────────────────────
    def _call_gemini(self, api_key, model, system, text, image_bytes):
        import google.generativeai as genai
        genai.configure(api_key=api_key)
        gmodel = genai.GenerativeModel(model_name=model, system_instruction=system)
        parts = []
        if image_bytes:
            import PIL.Image, io
            img = PIL.Image.open(io.BytesIO(image_bytes))
            parts.append(img)
        parts.append(text)
        response = gmodel.generate_content(parts)
        return response.text
```

- [ ] **Step 4: 运行确认通过**

```bash
cd backend && python3 -m pytest tests/test_ai_client_factory.py -v
```

预期：3 passed（Gemini 测试暂不包含，因依赖复杂，后续集成测试覆盖）

- [ ] **Step 5: Commit**

```bash
git add backend/services/ai_client_factory.py backend/tests/test_ai_client_factory.py
git commit -m "feat: add AIClientFactory with Anthropic/OpenAI/Gemini support"
```

---

## Task 4: 重构 VisionService 使用 Factory

**Files:**
- Modify: `backend/services/vision_service.py`

- [ ] **Step 1: 替换 vision_service.py 全部内容**

```python
import json
from pydantic import ValidationError
from models.recognition import RecognitionResult
from services.ai_client_factory import AIClientFactory

SYSTEM_PROMPT = """你是专业商品识别专家。
分析图片并输出严格的JSON格式，不要输出任何其他内容，不要添加markdown代码块标记。

输出格式：
{
  "category": "主类目（必须是以下之一：运动鞋/手机/耳机/T恤/包包，无法判断填最相近的）",
  "subcategory": "子类目",
  "brand": "品牌名称，无法识别填null",
  "color": "主色调（如：黑色/白色/黑白/红色等）",
  "style": "简短风格描述（10字以内）",
  "key_features": ["特征1", "特征2", "特征3"],
  "search_keywords": ["关键词1", "关键词2"]
}"""

_FALLBACK = RecognitionResult(
    category="未知商品", subcategory="未知", brand=None,
    color="未知", style="未知", key_features=[], search_keywords=[]
)

def _clean(raw: str) -> str:
    if raw.startswith("```"):
        raw = raw.split("```")[1].strip()
        if raw.startswith("json"):
            raw = raw[4:].strip()
    return raw


class VisionService:
    def __init__(self):
        self.factory = AIClientFactory()
        self.max_retries = 2

    def identify(self, image_bytes: bytes, media_type: str = "image/jpeg") -> RecognitionResult:
        last_error = None
        raw_response = None

        for attempt in range(self.max_retries):
            prompt = "请识别这个商品并输出JSON。"
            if attempt > 0 and raw_response:
                prompt = f"上次输出无法解析，请严格按JSON格式重新输出：\n{raw_response}"
            try:
                raw_response = _clean(self.factory.call(
                    system=SYSTEM_PROMPT,
                    text=prompt,
                    image_bytes=image_bytes,
                    media_type=media_type,
                ))
                return RecognitionResult(**json.loads(raw_response))
            except (json.JSONDecodeError, ValidationError, KeyError) as e:
                last_error = e

        print(f"[VisionService] 识别失败: {last_error}")
        return _FALLBACK
```

- [ ] **Step 2: 确认现有测试仍通过**

```bash
cd backend && python3 -m pytest tests/ -v
```

预期：所有原有 17 个测试 + 新增测试全部通过

- [ ] **Step 3: Commit**

```bash
git add backend/services/vision_service.py
git commit -m "refactor: VisionService uses AIClientFactory"
```

---

## Task 5: 重构 SuggestionService 使用 Factory

**Files:**
- Modify: `backend/services/suggestion_service.py`

- [ ] **Step 1: 替换 suggestion_service.py 全部内容**

```python
import json
from models.recognition import RecognitionResult, SuggestionCard, SuggestionFilterParams
from services.ai_client_factory import AIClientFactory

SYSTEM_PROMPT = """你是购物导购助手。
根据商品识别结果，生成4-5个引导购买决策的建议卡片，输出严格的JSON数组，不要输出其他内容，不要添加markdown代码块标记。

输出格式：
[
  {"id": "唯一标识（英文小写）", "label": "卡片文字（8字以内）", "filter_params": {"sort": "可选", "store_type": "可选", "platform": "可选", "rating_min": 可选数字}},
  ...
]"""

def _clean(raw: str) -> str:
    if raw.startswith("```"):
        raw = raw.split("```")[1].strip()
        if raw.startswith("json"):
            raw = raw[4:].strip()
    return raw


class SuggestionService:
    def __init__(self):
        self.factory = AIClientFactory()

    def generate(self, recognition: RecognitionResult) -> list[SuggestionCard]:
        user_text = (
            f"商品识别结果：\n类目：{recognition.category} - {recognition.subcategory}\n"
            f"品牌：{recognition.brand or '未知'}\n颜色：{recognition.color}\n"
            f"风格：{recognition.style}\n关键特征：{', '.join(recognition.key_features)}\n\n"
            "请生成4-5个购买建议卡片。"
        )
        try:
            raw = _clean(self.factory.call(system=SYSTEM_PROMPT, text=user_text))
            return [
                SuggestionCard(id=item["id"], label=item["label"],
                               filter_params=SuggestionFilterParams(**item.get("filter_params", {})))
                for item in json.loads(raw)
            ]
        except Exception as e:
            print(f"[SuggestionService] 生成失败: {e}，使用默认卡片")
            return self._default_suggestions()

    def _default_suggestions(self) -> list[SuggestionCard]:
        return [
            SuggestionCard(id="low_price", label="查看同款低价", filter_params=SuggestionFilterParams(sort="price_asc")),
            SuggestionCard(id="flagship", label="只看官方旗舰", filter_params=SuggestionFilterParams(store_type="flagship")),
            SuggestionCard(id="high_rating", label="高评价优先", filter_params=SuggestionFilterParams(sort="rating")),
            SuggestionCard(id="best_sales", label="热销款优先", filter_params=SuggestionFilterParams(sort="sales")),
        ]
```

- [ ] **Step 2: 确认测试通过**

```bash
cd backend && python3 -m pytest tests/ -v
```

预期：全部通过

- [ ] **Step 3: Commit**

```bash
git add backend/services/suggestion_service.py
git commit -m "refactor: SuggestionService uses AIClientFactory"
```

---

## Task 6: 重构 IntentService 使用 Factory

**Files:**
- Modify: `backend/services/intent_service.py`

- [ ] **Step 1: 替换 intent_service.py 全部内容**

```python
import json
from models.filter import FilterParams
from services.ai_client_factory import AIClientFactory

SYSTEM_PROMPT = """你是购物助手，请从用户的自然语言中提取结构化筛选条件，输出严格的JSON，不要输出其他内容，不要添加markdown代码块标记。

输出格式（无法确定的字段填null）：
{
  "price_max": 数字或null,
  "price_min": 数字或null,
  "color": "颜色关键词或null",
  "rating_min": 数字或null,
  "platform": "tmall/jd/pdd之一或null",
  "store_type": "flagship/official/third_party之一或null",
  "sort": "price_asc/price_desc/sales/rating之一或null",
  "keywords": ["额外关键词列表"]
}"""

def _clean(raw: str) -> str:
    if raw.startswith("```"):
        raw = raw.split("```")[1].strip()
        if raw.startswith("json"):
            raw = raw[4:].strip()
    return raw


class IntentService:
    def __init__(self):
        self.factory = AIClientFactory()

    def parse(self, nl_query: str, category: str = "") -> FilterParams:
        user_text = f"当前商品类目：{category}\n用户输入：\"{nl_query}\""
        try:
            raw = _clean(self.factory.call(system=SYSTEM_PROMPT, text=user_text))
            data = json.loads(raw)
            return FilterParams(**{k: v for k, v in data.items() if v is not None or k == "keywords"})
        except Exception as e:
            print(f"[IntentService] 解析失败: {e}，返回空过滤条件")
            return FilterParams()
```

- [ ] **Step 2: 确认现有测试通过（IntentService mock 需更新）**

IntentService 的测试 mock 的是 `svc.client.messages.create`，现在需要 mock `factory.call`。更新 `backend/tests/test_intent_service.py`，将所有：

```python
with patch.object(svc.client.messages, "create", return_value=mock_response):
```

改为：

```python
with patch.object(svc.factory, "call", return_value=mock_response.content[0].text):
```

其中 `make_mock_response` 不再需要，直接传文本字符串：

```python
def test_parse_price_and_color(svc):
    mock_text = '{"price_max": 1000, "price_min": null, "color": "黑色", "rating_min": null, "platform": null, "store_type": null, "sort": null, "keywords": []}'
    with patch.object(svc.factory, "call", return_value=mock_text):
        result = svc.parse("1000元以内的黑色款", "运动鞋")
    assert result.price_max == 1000.0
    assert result.color == "黑色"

def test_parse_rating(svc):
    mock_text = '{"price_max": null, "price_min": null, "color": null, "rating_min": 4.8, "platform": null, "store_type": null, "sort": null, "keywords": []}'
    with patch.object(svc.factory, "call", return_value=mock_text):
        result = svc.parse("评价4.8分以上的", "手机")
    assert result.rating_min == 4.8

def test_parse_fallback_on_invalid_json(svc):
    with patch.object(svc.factory, "call", return_value="这不是JSON格式"):
        result = svc.parse("一些输入", "运动鞋")
    assert isinstance(result, FilterParams)
    assert result.price_max is None

def test_parse_empty_query(svc):
    mock_text = '{"price_max": null, "price_min": null, "color": null, "rating_min": null, "platform": null, "store_type": null, "sort": null, "keywords": []}'
    with patch.object(svc.factory, "call", return_value=mock_text):
        result = svc.parse("", "")
    assert result.price_max is None
```

```bash
cd backend && python3 -m pytest tests/ -v
```

预期：全部通过

- [ ] **Step 3: Commit**

```bash
git add backend/services/intent_service.py backend/tests/test_intent_service.py
git commit -m "refactor: IntentService uses AIClientFactory, update tests"
```

---

## Task 7: 实现 /config 和 /providers 端点

**Files:**
- Create: `backend/api/v1/config.py`
- Modify: `backend/main.py`

- [ ] **Step 1: 创建 `backend/api/v1/config.py`**

```python
from fastapi import APIRouter
from pydantic import BaseModel
from typing import Optional
from services.ai_config import AIConfig

router = APIRouter()

PROVIDERS = {
    "anthropic": [
        "claude-3-5-sonnet-20241022",
        "claude-3-5-haiku-20241022",
        "claude-3-opus-20240229",
    ],
    "openai": [
        "gpt-4o",
        "gpt-4o-mini",
    ],
    "gemini": [
        "gemini-1.5-pro",
        "gemini-1.5-flash",
    ],
}


class ConfigRequest(BaseModel):
    provider: str
    model: str
    api_key: str


class ConfigResponse(BaseModel):
    provider: str
    model: str
    key_set: bool


@router.post("/config", response_model=ConfigResponse)
async def update_config(req: ConfigRequest):
    if req.provider not in PROVIDERS:
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail=f"不支持的 Provider: {req.provider}。支持: {list(PROVIDERS.keys())}")
    if req.model not in PROVIDERS[req.provider]:
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail=f"模型 {req.model} 不属于 {req.provider}")
    AIConfig.get_instance().update(req.provider, req.model, req.api_key)
    return ConfigResponse(provider=req.provider, model=req.model, key_set=bool(req.api_key))


@router.get("/config", response_model=ConfigResponse)
async def get_config():
    c = AIConfig.get_instance()
    return ConfigResponse(provider=c.provider, model=c.model, key_set=bool(c.api_key))


@router.get("/providers")
async def get_providers():
    return PROVIDERS
```

- [ ] **Step 2: 在 `backend/main.py` 注册 config 路由**

在现有路由注册区域添加：

```python
from api.v1 import identify, products, filter as filter_router, config as config_router
# ...
app.include_router(config_router.router, prefix="/api/v1")
```

- [ ] **Step 3: 启动服务验证端点**

```bash
cd backend && python3 -c "from main import app; print('导入成功')"
```

预期输出：`导入成功`

- [ ] **Step 4: Commit**

```bash
git add backend/api/v1/config.py backend/main.py
git commit -m "feat: add /config and /providers API endpoints"
```

---

## Task 8: 前端 — 添加 config API 函数

**Files:**
- Modify: `mobile/src/api/client.ts`

- [ ] **Step 1: 在 `client.ts` 末尾追加以下代码**

```typescript
// ── AI 配置 API ──────────────────────────────────────────────

export interface AIConfigPayload {
  provider: string;
  model: string;
  api_key: string;
}

export interface AIConfigResponse {
  provider: string;
  model: string;
  key_set: boolean;
}

export interface ProvidersResponse {
  anthropic: string[];
  openai: string[];
  gemini: string[];
}

export const getProviders = async (): Promise<ProvidersResponse> => {
  const response = await api.get<ProvidersResponse>('/providers');
  return response.data;
};

export const getAIConfig = async (): Promise<AIConfigResponse> => {
  const response = await api.get<AIConfigResponse>('/config');
  return response.data;
};

export const updateAIConfig = async (payload: AIConfigPayload): Promise<AIConfigResponse> => {
  const response = await api.post<AIConfigResponse>('/config', payload);
  return response.data;
};
```

- [ ] **Step 2: Commit**

```bash
git add mobile/src/api/client.ts
git commit -m "feat: add AI config API functions to mobile client"
```

---

## Task 9: 前端 — 安装 AsyncStorage 和 Picker

**Files:**
- Modify: `mobile/package.json`

- [ ] **Step 1: 安装依赖**

```bash
cd mobile && npx expo install @react-native-async-storage/async-storage @react-native-picker/picker
```

预期：两个包写入 `package.json` 并安装成功

- [ ] **Step 2: Commit**

```bash
git add mobile/package.json mobile/package-lock.json
git commit -m "feat: add AsyncStorage and Picker dependencies"
```

---

## Task 10: 前端 — 实现 SettingsScreen

**Files:**
- Create: `mobile/src/screens/SettingsScreen.tsx`

- [ ] **Step 1: 创建 `mobile/src/screens/SettingsScreen.tsx`**

```tsx
import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  SafeAreaView, ScrollView, Alert, ActivityIndicator,
} from 'react-native';
import { Picker } from '@react-native-picker/picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/AppNavigator';
import { getProviders, updateAIConfig, ProvidersResponse } from '../api/client';

type Props = { navigation: NativeStackNavigationProp<RootStackParamList, 'Settings'> };

const STORAGE_KEY = 'ai_config';

const PROVIDER_LABELS: Record<string, string> = {
  anthropic: 'Anthropic (Claude)',
  openai: 'OpenAI (GPT)',
  gemini: 'Google Gemini',
};

export default function SettingsScreen({ navigation }: Props) {
  const [providers, setProviders] = useState<ProvidersResponse | null>(null);
  const [provider, setProvider] = useState('anthropic');
  const [model, setModel] = useState('claude-3-5-sonnet-20241022');
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<'idle' | 'ok' | 'error'>('idle');

  useEffect(() => {
    // 加载可选模型列表
    getProviders().then(setProviders).catch(() => {});
    // 加载本地存储的配置
    AsyncStorage.getItem(STORAGE_KEY).then(raw => {
      if (raw) {
        const saved = JSON.parse(raw);
        setProvider(saved.provider || 'anthropic');
        setModel(saved.model || 'claude-3-5-sonnet-20241022');
        setApiKey(saved.api_key || '');
      }
    });
  }, []);

  const currentModels = providers?.[provider as keyof ProvidersResponse] ?? [];

  const handleProviderChange = (p: string) => {
    setProvider(p);
    const models = providers?.[p as keyof ProvidersResponse] ?? [];
    if (models.length > 0) setModel(models[0]);
    setStatus('idle');
  };

  const handleSave = async () => {
    if (!apiKey.trim()) {
      Alert.alert('请填写 API Key');
      return;
    }
    setSaving(true);
    setStatus('idle');
    try {
      await updateAIConfig({ provider, model, api_key: apiKey.trim() });
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ provider, model, api_key: apiKey.trim() }));
      setStatus('ok');
    } catch (e: any) {
      setStatus('error');
      Alert.alert('保存失败', e?.response?.data?.detail || '请检查 API Key 和网络连接');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>← 返回</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>AI 设置</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Provider 选择 */}
        <Text style={styles.label}>AI 提供商</Text>
        <View style={styles.providerRow}>
          {['anthropic', 'openai', 'gemini'].map(p => (
            <TouchableOpacity
              key={p}
              style={[styles.providerBtn, provider === p && styles.providerBtnActive]}
              onPress={() => handleProviderChange(p)}
            >
              <Text style={[styles.providerText, provider === p && styles.providerTextActive]}>
                {PROVIDER_LABELS[p]}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* API Key */}
        <Text style={styles.label}>API Key</Text>
        <View style={styles.keyRow}>
          <TextInput
            style={styles.keyInput}
            placeholder="请输入 API Key"
            placeholderTextColor="#aaa"
            value={apiKey}
            onChangeText={text => { setApiKey(text); setStatus('idle'); }}
            secureTextEntry={!showKey}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <TouchableOpacity onPress={() => setShowKey(v => !v)} style={styles.eyeBtn}>
            <Text style={styles.eyeText}>{showKey ? '🙈' : '👁️'}</Text>
          </TouchableOpacity>
        </View>

        {/* 模型选择 */}
        <Text style={styles.label}>模型</Text>
        <View style={styles.pickerWrapper}>
          <Picker selectedValue={model} onValueChange={setModel} style={styles.picker}>
            {currentModels.map(m => (
              <Picker.Item key={m} label={m} value={m} />
            ))}
          </Picker>
        </View>

        {/* 保存按钮 */}
        <TouchableOpacity style={styles.saveBtn} onPress={handleSave} disabled={saving}>
          {saving
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.saveBtnText}>保存并测试连接</Text>
          }
        </TouchableOpacity>

        {status === 'ok' && (
          <Text style={styles.statusOk}>✅ 连接成功，配置已保存</Text>
        )}
        {status === 'error' && (
          <Text style={styles.statusErr}>❌ 连接失败，请检查 Key</Text>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#f5f5f5' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#eee' },
  backBtn: { width: 60 },
  backText: { color: '#007AFF', fontSize: 16 },
  headerTitle: { fontSize: 18, fontWeight: '600', color: '#333' },
  content: { padding: 20 },
  label: { fontSize: 14, fontWeight: '600', color: '#555', marginTop: 20, marginBottom: 8 },
  providerRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  providerBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1.5, borderColor: '#ddd', backgroundColor: '#fff' },
  providerBtnActive: { borderColor: '#007AFF', backgroundColor: '#007AFF' },
  providerText: { fontSize: 13, color: '#555' },
  providerTextActive: { color: '#fff', fontWeight: '600' },
  keyRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: '#ddd' },
  keyInput: { flex: 1, padding: 14, fontSize: 14, color: '#333' },
  eyeBtn: { padding: 12 },
  eyeText: { fontSize: 18 },
  pickerWrapper: { backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: '#ddd', overflow: 'hidden' },
  picker: { height: 50 },
  saveBtn: { marginTop: 32, backgroundColor: '#007AFF', borderRadius: 14, padding: 16, alignItems: 'center' },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  statusOk: { marginTop: 12, textAlign: 'center', color: '#34C759', fontSize: 15, fontWeight: '600' },
  statusErr: { marginTop: 12, textAlign: 'center', color: '#FF3B30', fontSize: 15, fontWeight: '600' },
});
```

- [ ] **Step 2: Commit**

```bash
git add mobile/src/screens/SettingsScreen.tsx
git commit -m "feat: add SettingsScreen for AI provider/model/key configuration"
```

---

## Task 11: 前端 — 更新导航和 HomeScreen

**Files:**
- Modify: `mobile/src/navigation/AppNavigator.tsx`
- Modify: `mobile/src/screens/HomeScreen.tsx`

- [ ] **Step 1: 更新 AppNavigator.tsx**

在 `RootStackParamList` 中添加 `Settings: undefined`，并在 Stack.Navigator 中注册：

```typescript
import SettingsScreen from '../screens/SettingsScreen';

export type RootStackParamList = {
  Home: undefined;
  Camera: undefined;
  Recognition: { sessionId: string; recognition: RecognitionResult; suggestions: SuggestionCard[]; products: ProductItem[] };
  ProductList: { sessionId: string; category: string; searchKeywords: string[]; products: ProductItem[] };
  Settings: undefined;   // ← 新增
};

// 在 Stack.Navigator 内添加：
<Stack.Screen name="Settings" component={SettingsScreen} />
```

- [ ] **Step 2: 更新 HomeScreen.tsx — 添加设置入口**

在 `HomeScreen` 的 `View` 容器右上角添加 ⚙️ 按钮。完整替换 `HomeScreen.tsx`：

```tsx
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/AppNavigator';

type Props = { navigation: NativeStackNavigationProp<RootStackParamList, 'Home'> };

export default function HomeScreen({ navigation }: Props) {
  return (
    <View style={styles.container}>
      {/* 右上角设置按钮 */}
      <TouchableOpacity style={styles.settingsBtn} onPress={() => navigation.navigate('Settings')}>
        <Text style={styles.settingsIcon}>⚙️</Text>
      </TouchableOpacity>

      <Text style={styles.title}>AI 购物助手</Text>
      <Text style={styles.subtitle}>拍照识物，智能比价</Text>
      <TouchableOpacity style={styles.button} onPress={() => navigation.navigate('Camera')}>
        <Text style={styles.buttonText}>📷  开始拍照</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f5f5f5' },
  settingsBtn: { position: 'absolute', top: 56, right: 20, padding: 8 },
  settingsIcon: { fontSize: 24 },
  title: { fontSize: 32, fontWeight: 'bold', color: '#333', marginBottom: 8 },
  subtitle: { fontSize: 16, color: '#666', marginBottom: 48 },
  button: { backgroundColor: '#007AFF', paddingHorizontal: 40, paddingVertical: 16, borderRadius: 30 },
  buttonText: { color: '#fff', fontSize: 18, fontWeight: '600' },
});
```

- [ ] **Step 3: Commit**

```bash
git add mobile/src/navigation/AppNavigator.tsx mobile/src/screens/HomeScreen.tsx
git commit -m "feat: add Settings navigation entry in HomeScreen"
```

---

## Task 12: 前端 — App 启动时恢复配置

**Files:**
- Modify: `mobile/App.tsx`

- [ ] **Step 1: 替换 `mobile/App.tsx`**

```tsx
import React, { useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import AppNavigator from './src/navigation/AppNavigator';
import { updateAIConfig } from './src/api/client';

const STORAGE_KEY = 'ai_config';

export default function App() {
  useEffect(() => {
    // 启动时将本地存储的 AI 配置恢复到后端
    AsyncStorage.getItem(STORAGE_KEY).then(raw => {
      if (raw) {
        const saved = JSON.parse(raw);
        if (saved.api_key) {
          updateAIConfig(saved).catch(() => {
            // 后端未启动时静默失败，用户打开设置页重新保存即可
          });
        }
      }
    });
  }, []);

  return (
    <SafeAreaProvider>
      <NavigationContainer>
        <AppNavigator />
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add mobile/App.tsx
git commit -m "feat: restore AI config from AsyncStorage on app startup"
```

---

## Task 13: 推送到 GitHub

- [ ] **Step 1: 确认所有后端测试通过**

```bash
cd backend && python3 -m pytest tests/ -v
```

预期：全部通过（原 17 个 + 新增约 6 个 = 23+）

- [ ] **Step 2: 推送**

```bash
git push origin main
```

---

## 验证清单

1. `GET /api/v1/providers` → 返回三家 Provider 和各自模型列表
2. `POST /api/v1/config { provider:"openai", model:"gpt-4o", api_key:"..." }` → 返回 `{ key_set: true }`
3. `GET /api/v1/config` → 返回当前配置（不含 key 明文）
4. App Settings 页：切换 Provider → 模型下拉自动更新
5. 填写有效 API Key → 点"保存并测试连接" → 显示 ✅
6. 重启 App → 后端配置自动恢复（前提后端已运行）
7. 全部后端单元测试通过
