# 多 Provider AI 配置支持 — 设计规范

## Context

当前三个 AI 服务（VisionService / SuggestionService / IntentService）硬编码使用 Anthropic SDK，无法切换 Provider 或模型。需要让用户能在 App 内选择 Anthropic / OpenAI / Gemini，填入 API Key 并选择具体模型，配置全局生效。

---

## 方案：配置端点 + 内存存储（方案 A）

App 内设置页 → `POST /api/v1/config` → 后端内存单例 → 三个 AI 服务动态读取

---

## 后端设计

### 新增文件

#### `services/ai_config.py` — 全局配置单例

```python
class AIConfig:
    """全局 AI 配置单例，保存当前激活的 Provider / Model / Key"""
    provider: str = "anthropic"         # anthropic | openai | gemini
    model: str = "claude-3-5-sonnet-20241022"
    api_key: str = ""                   # 运行时填入，不持久化
```

#### `services/ai_client_factory.py` — Provider 工厂

根据 `AIConfig.provider` 返回对应的统一调用接口：

| Provider | SDK | 视觉 API 方式 |
|----------|-----|--------------|
| anthropic | `anthropic.Anthropic` | base64 image block（现有方式）|
| openai | `openai.OpenAI` | `image_url` data URI |
| gemini | `google-generativeai` | `inline_data` Part |

工厂暴露统一方法：
```python
def chat(system: str, user_text: str, image_bytes: bytes | None) -> str
```
三个服务改调此方法，不再直接依赖各 SDK。

### 新增 API 端点（`api/v1/config.py`）

```
POST /api/v1/config
  Body: { provider, model, api_key }
  → 更新内存配置，返回 { ok: true }
  → 若 api_key 无效（可选验证）返回 400

GET /api/v1/config
  → 返回 { provider, model, key_set: bool }（不返回 key 明文）

GET /api/v1/providers
  → 返回各 provider 的可选模型列表（硬编码）
  {
    "anthropic": ["claude-3-5-sonnet-20241022", "claude-3-opus-20240229", "claude-3-5-haiku-20241022"],
    "openai": ["gpt-4o", "gpt-4o-mini"],
    "gemini": ["gemini-1.5-pro", "gemini-1.5-flash"]
  }
```

### 修改现有服务

`VisionService / SuggestionService / IntentService` 统一改为：
1. 不再 `import anthropic` / 直接创建客户端
2. 调用 `AIClientFactory.get_instance().chat(system, user_text, image_bytes)` 完成 AI 调用
3. 其余 JSON 解析、重试、降级逻辑保持不变

### 新增 Python 依赖

```
openai>=1.50.0
google-generativeai>=0.8.0
```

---

## 前端设计

### 新增 `src/screens/SettingsScreen.tsx`

三个区块：

**区块1：Provider 选择**（横向三按钮）
- `[Anthropic]` `[OpenAI]` `[Gemini]`，选中高亮

**区块2：API Key 输入**
- `TextInput` secureTextEntry，右侧眼睛图标切换明文/密文

**区块3：模型选择**
- `Picker` 下拉，选项从 `GET /api/v1/providers` 加载，随 Provider 切换自动更新

**底部按钮：保存并测试**
- 调用 `POST /api/v1/config`
- 成功显示 ✅ 已连接
- 失败显示具体错误（如 Invalid API Key）

### 修改 `AppNavigator.tsx`

```typescript
// 新增 Settings 路由
Settings: undefined;
```

### 修改 `HomeScreen.tsx`

右上角加 ⚙️ `TouchableOpacity`，`onPress={() => navigation.navigate('Settings')}`

### 新增 API 函数（`client.ts`）

```typescript
export const getProviders = async () => { ... }
export const getAIConfig = async () => { ... }
export const updateAIConfig = async (config: AIConfigPayload) => { ... }
```

### 本地持久化

- 依赖：`@react-native-async-storage/async-storage`
- 存储键：`ai_config`，值：`{ provider, model, api_key }`
- App 启动（`App.tsx`）时自动读取并调用 `POST /api/v1/config` 恢复后端状态

---

## 变更文件清单

**后端（6 处）：**
- 新建：`services/ai_config.py`
- 新建：`services/ai_client_factory.py`
- 新建：`api/v1/config.py`
- 修改：`services/vision_service.py`
- 修改：`services/suggestion_service.py`
- 修改：`services/intent_service.py`
- 修改：`main.py`（注册 config 路由）
- 修改：`requirements.txt`（添加 openai, google-generativeai）

**前端（4 处）：**
- 新建：`src/screens/SettingsScreen.tsx`
- 修改：`src/navigation/AppNavigator.tsx`
- 修改：`src/screens/HomeScreen.tsx`
- 修改：`src/api/client.ts`
- 修改：`App.tsx`（启动时恢复配置）

---

## 验证方案

1. 后端启动后调用 `GET /api/v1/config` → 返回默认 anthropic 配置
2. `POST /api/v1/config { provider: "openai", model: "gpt-4o", api_key: "..." }` → 成功
3. App 内 Settings 页：切换 Gemini → 模型下拉自动变为 gemini-1.5-pro / flash
4. 填入有效 Gemini Key → 保存 → 拍照识别使用 Gemini 完成
5. 重启 App → AsyncStorage 自动恢复配置 → 后端状态恢复
