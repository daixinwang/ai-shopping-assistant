# AI 购物助手

> [English Version](./README_EN.md)

一款 AI 驱动的智能购物应用，支持拍照识物、跨平台比价与自然语言筛选。后端支持 **Anthropic / OpenAI / Google Gemini** 三家 AI Provider，可在 App 内随时切换。

## 系统架构

```
┌──────────────────────────────────────┐
│       前端 (React Native + Expo)      │
│  HomeScreen → CameraScreen           │
│  → RecognitionScreen → ProductList   │
│  SettingsScreen（Provider / Key）    │
└──────────────────┬───────────────────┘
                   │ HTTP/JSON
                   ↓
┌──────────────────────────────────────┐
│         后端 (FastAPI + Python)       │
├──────────────────────────────────────┤
│ Stage 1: VisionService               │
│   图像 → 商品属性 JSON               │
├──────────────────────────────────────┤
│ Stage 2: SuggestionService           │
│   属性 → 4-5 张建议卡片             │
├──────────────────────────────────────┤
│ Stage 3: IntentService               │
│   自然语言 → 结构化过滤器            │
├──────────────────────────────────────┤
│ ProductService + MockProductRepo     │
│   搜索 / 过滤 / 排序（~130 SKU）    │
├──────────────────────────────────────┤
│ AIClientFactory（可插拔）            │
│   统一调用 Anthropic / OpenAI /      │
│   Gemini，Provider 运行时切换        │
└──────────────────────────────────────┘
                   ↓
┌──────────────┐ ┌──────────┐ ┌────────┐
│  Anthropic   │ │  OpenAI  │ │ Gemini │
│  (Claude)    │ │  (GPT)   │ │        │
└──────────────┘ └──────────┘ └────────┘
```

## 技术栈

### 后端
- **框架**: FastAPI 0.115.5
- **AI（可选）**: Anthropic Claude / OpenAI GPT / Google Gemini
- **数据验证**: Pydantic 2.10.3
- **测试**: pytest（23 个单元测试）

### 前端
- **框架**: React Native 0.74.5 + Expo 51
- **导航**: React Navigation v6
- **本地存储**: AsyncStorage（持久化 AI 配置）
- **HTTP 客户端**: Axios

### AI 支持

| Provider | 推荐模型 | 获取 Key |
|----------|---------|---------|
| Anthropic | claude-3-5-sonnet-20241022 | [console.anthropic.com](https://console.anthropic.com) |
| OpenAI | gpt-4o | [platform.openai.com](https://platform.openai.com) |
| Google Gemini | gemini-1.5-pro | [aistudio.google.com](https://aistudio.google.com) |

## 快速启动

### 前置条件
- Python 3.9+
- Node.js 16+
- 任意一家 AI Provider 的 API Key（Anthropic / OpenAI / Gemini）

### 后端启动

1. 安装依赖：
```bash
cd backend
pip install -r requirements.txt
```

2. 启动服务（无需提前配置 Key，可在 App 内设置）：
```bash
uvicorn main:app --reload
```

服务在 `http://localhost:8000` 启动，Swagger 文档：`http://localhost:8000/docs`

> **可选**：如需默认加载 Key，在 `backend/.env` 中配置 `ANTHROPIC_API_KEY=...`

### 前端启动

1. 进入前端目录：
```bash
cd mobile
```

2. 安装依赖：
```bash
npm install
```

3. 启动 Expo 开发服务器：
```bash
npx expo start
```

4. 选择运行平台：
- **Android**: 按 `a` 或 `npm run android`
- **iOS**: 按 `i` 或 `npm run ios`
- **Web**: 按 `w`

> 提示：需要 Android Studio 或 Xcode 以及对应的模拟器/设备。

## 核心功能演示

### 验证用例 1: 图像识别 + 初始搜索
**场景**: 用户拍摄运动鞋照片

**流程**:
1. 前端上传图片到 `/api/v1/identify`
2. 后端识别：品类(运动鞋) → 品牌 → 颜色 → 风格 → 关键特征
3. 自动生成 4 张建议卡片（价格排序、评分排序等）
4. 返回初始 20+ 件相关商品

**预期结果**: UI 展示认领卡片 + 建议卡片 + 商品列表

### 验证用例 2: 建议卡片点击过滤
**场景**: 用户点击"价格从低到高"建议卡片

**流程**:
1. 前端发送 `/api/v1/products/search` 请求（含建议参数）
2. 后端应用过滤器（price_asc）
3. 返回排序后的商品列表

**预期结果**: 商品按价格升序显示

### 验证用例 3: 自然语言过滤
**场景**: 用户在搜索框输入"1000元以下，4.5分以上的黑色鞋"

**流程**:
1. 前端发送 `/api/v1/filter` 请求（含 NL 查询）
2. 后端调用 IntentService 解析意图 → 结构化过滤器
3. ProductService 应用过滤器
4. 返回符合条件的商品

**预期结果**: 商品列表被筛选并展示

### 验证用例 4: 多次过滤叠加
**场景**: 用户先点击建议卡片，再输入自然语言查询

**流程**:
1. 会话保留初始识别结果（category/keywords）
2. 建议卡片参数 + NL 查询参数叠加
3. ProductService 应用所有过滤条件
4. 返回最终结果集

**预期结果**: 过滤条件正确叠加，商品结果符合所有条件

## 项目结构

```
.
├── README.md
├── README_EN.md                  # 英文版
├── backend/
│   ├── main.py
│   ├── requirements.txt
│   ├── api/v1/
│   │   ├── identify.py           # POST /identify
│   │   ├── products.py           # POST /products/search
│   │   ├── filter.py             # POST /filter
│   │   └── config.py             # POST/GET /config, GET /providers ★新增
│   ├── services/
│   │   ├── ai_config.py          # Provider 配置单例 ★新增
│   │   ├── ai_client_factory.py  # 多 Provider 工厂 ★新增
│   │   ├── vision_service.py
│   │   ├── suggestion_service.py
│   │   ├── intent_service.py
│   │   ├── product_service.py
│   │   └── session_store.py
│   ├── models/                   # Pydantic schemas
│   ├── repository/               # 数据访问层
│   ├── data/mock_products.json   # 130 条模拟商品
│   └── tests/                    # 23 个单元测试
└── mobile/
    ├── App.tsx                   # 启动时恢复 AI 配置
    ├── src/
    │   ├── screens/
    │   │   ├── HomeScreen.tsx    # ⚙️ 设置入口
    │   │   ├── CameraScreen.tsx
    │   │   ├── RecognitionScreen.tsx
    │   │   ├── ProductListScreen.tsx
    │   │   └── SettingsScreen.tsx  # AI Provider 设置 ★新增
    │   ├── components/
    │   │   ├── ProductCard.tsx
    │   │   └── NLFilterBar.tsx
    │   └── api/client.ts         # 含 config API 函数
    └── package.json
```

## AI Provider 配置

### 方式一：App 内设置（推荐）

启动 App 后点击首页右上角 **⚙️** 图标，在设置页：
1. 选择 Provider（Anthropic / OpenAI / Gemini）
2. 填写对应 API Key
3. 选择模型
4. 点击「保存并测试连接」

配置会保存到设备本地，下次启动 App 自动恢复。

### 方式二：后端 .env（批量部署）

```bash
# backend/.env
ANTHROPIC_API_KEY=sk-ant-...
# 或
OPENAI_API_KEY=sk-...
# 或
GOOGLE_API_KEY=...
```

> `.env` 已在 `.gitignore` 中，不会提交到 Git。

## 测试

```bash
cd backend && python3 -m pytest tests/ -v
# 23 passed
```

覆盖范围：`AIConfig` 单例、`AIClientFactory` Provider 路由、`ProductService` 过滤/排序、`SessionStore` TTL、`IntentService` NL 解析（含 Mock）。

## API 文档

详见 [backend/README.md](./backend/README.md)

Swagger 交互式文档: `http://localhost:8000/docs`

## 故障排除

### 后端问题

1. **启动报错**: 确保在 `backend/` 目录下执行 `uvicorn main:app --reload`
2. **Port 8000 被占用**: `uvicorn main:app --port 8001 --reload`
3. **AI 识别返回"未知商品"**: 打开 App 设置页检查 Provider / Key 是否正确配置

### 前端问题

1. **无法连接后端**: 真机调试时将 `mobile/src/api/client.ts` 中的 `localhost` 改为局域网 IP
2. **相机权限**: 在 iOS/Android 设置中授予相机和相册权限
3. **设置保存失败**: 确认后端已运行，并检查 API Key 格式（Anthropic 以 `sk-ant-` 开头，OpenAI 以 `sk-` 开头）
4. **Expo 缓存问题**: `npx expo start --clear`

## 许可证

MIT

## 相关资源

- [FastAPI 文档](https://fastapi.tiangolo.com/)
- [React Native 文档](https://reactnative.dev/)
- [Expo 文档](https://docs.expo.dev/)
- [Anthropic API 文档](https://docs.anthropic.com/)
- [OpenAI API 文档](https://platform.openai.com/docs/)
- [Google Gemini API 文档](https://ai.google.dev/)
