# AI 购物助手

一个基于 Claude 3.5 Sonnet AI 的智能购物应用，通过图像识别和自然语言处理为用户提供个性化的商品推荐。

## 系统架构

```
┌─────────────────────┐
│   前端 (React Native)│
│    - Camera         │
│    - Recognition UI │
│    - Product List   │
└──────────┬──────────┘
           │ HTTP/JSON
           ↓
┌─────────────────────────────────────┐
│      后端 (FastAPI + Python)        │
├─────────────────────────────────────┤
│ Stage 1: 图像识别服务              │
│  - VisionService                    │
│  - 识别: 品类/品牌/颜色/风格       │
├─────────────────────────────────────┤
│ Stage 2: 建议生成服务              │
│  - SuggestionService                │
│  - 生成 4 张过滤建议卡片           │
├─────────────────────────────────────┤
│ Stage 3: 自然语言过滤              │
│  - IntentService                    │
│  - NL Query → 结构化过滤参数       │
├─────────────────────────────────────┤
│ 商品搜索服务                        │
│  - ProductService                   │
│  - 搜索 + 过滤 + 排序               │
└─────────────────────────────────────┘
           ↓ API Call
┌─────────────────────┐
│   Claude 3.5 Sonnet │
│   (Anthropic API)   │
└─────────────────────┘
```

## 技术栈

### 后端
- **框架**: FastAPI 0.115.5（异步 Web 框架）
- **服务器**: Uvicorn 0.32.1（ASGI 服务器）
- **AI 模型**: Claude 3.5 Sonnet（via Anthropic API）
- **数据验证**: Pydantic 2.10.3
- **测试**: pytest + pytest-asyncio

### 前端
- **框架**: React Native 0.74.5
- **开发环境**: Expo 51.0.0
- **导航**: React Navigation
- **构建语言**: TypeScript
- **HTTP 客户端**: Axios

### 依赖组件
- `expo-camera`: 相机访问
- `expo-image-picker`: 图片选择
- `python-multipart`: 文件上传支持
- `python-dotenv`: 环境变量管理

## 快速启动

### 前置条件
- Python 3.8+
- Node.js 16+
- Anthropic API Key（从 https://console.anthropic.com 获取）

### 后端启动

1. 进入后端目录并创建虚拟环境：
```bash
cd backend
python3 -m venv venv
source venv/bin/activate  # 或 Windows: venv\Scripts\activate
```

2. 安装依赖：
```bash
pip install -r requirements.txt
```

3. 创建 `.env` 文件（放在 `backend` 目录下）：
```bash
# backend/.env
ANTHROPIC_API_KEY=your_actual_api_key_here
```

4. 启动 API 服务：
```bash
uvicorn main:app --reload
```

服务将在 `http://localhost:8000` 启动，Swagger 文档在 `http://localhost:8000/docs`

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
├── README.md                     # 本文件
├── backend/
│   ├── README.md                 # 后端 API 文档
│   ├── main.py                   # FastAPI 应用主入口
│   ├── requirements.txt           # Python 依赖
│   ├── .env                       # 环境变量（需自行创建）
│   ├── api/
│   │   └── v1/
│   │       ├── identify.py        # POST /api/v1/identify - 图像识别
│   │       ├── products.py        # POST /api/v1/products/search - 商品搜索
│   │       └── filter.py          # POST /api/v1/filter - 自然语言过滤
│   ├── models/
│   │   ├── recognition.py         # 识别结果数据模型
│   │   ├── filter.py              # 过滤参数数据模型
│   │   └── product.py             # 商品数据模型
│   ├── services/
│   │   ├── vision_service.py       # 图像识别服务
│   │   ├── suggestion_service.py    # 建议生成服务
│   │   ├── intent_service.py        # NL 解析服务
│   │   ├── product_service.py       # 商品搜索服务
│   │   └── session_store.py         # 会话管理
│   ├── repository/
│   │   └── mock_product_repo.py     # 商品数据仓库
│   ├── data/
│   │   └── mock_products.json       # 模拟商品数据
│   ├── tests/
│   │   ├── test_intent_service.py   # Intent 解析测试
│   │   ├── test_product_service.py  # 商品服务测试
│   │   └── test_session_store.py    # 会话管理测试
│   └── verify.py                 # 验证脚本
├── mobile/
│   ├── README.md                 # 移动端文档（可选）
│   ├── package.json              # Node.js 依赖
│   ├── tsconfig.json             # TypeScript 配置
│   ├── App.tsx                   # 应用入口
│   ├── app.json                  # Expo 配置
│   ├── src/
│   │   ├── navigation/
│   │   │   └── AppNavigator.tsx   # 导航配置
│   │   ├── screens/
│   │   │   ├── HomeScreen.tsx     # 首页
│   │   │   ├── CameraScreen.tsx   # 相机屏幕
│   │   │   ├── RecognitionScreen.tsx  # 识别结果屏幕
│   │   │   └── ProductListScreen.tsx  # 商品列表屏幕
│   │   ├── components/
│   │   │   ├── ProductCard.tsx    # 商品卡片组件
│   │   │   └── NLFilterBar.tsx    # 自然语言过滤条
│   │   └── api/
│   │       └── client.ts          # HTTP 客户端
│   └── node_modules/             # 依赖包（自动生成）
└── .gitignore                    # Git 忽略配置
```

## 环境变量配置

在 `backend/.env` 中配置必要的环境变量：

```env
# 必需
ANTHROPIC_API_KEY=sk-ant-...your-key-here

# 可选（默认值）
# PYTHONPATH=.
# LOG_LEVEL=INFO
```

> 注意：`.env` 文件已在 `.gitignore` 中，不会被 Git 追踪，确保不会泄露 API 密钥。

## 测试

运行后端测试：
```bash
cd backend
python3 -m pytest tests/ -v
```

预期输出：
```
tests/test_session_store.py::test_create_session PASSED
tests/test_product_service.py::test_search_and_filter PASSED
tests/test_intent_service.py::test_parse_intent PASSED
...
```

## API 文档

详见 [backend/README.md](./backend/README.md)

Swagger 交互式文档: `http://localhost:8000/docs`

## 故障排除

### 后端问题

1. **导入错误**: 确保在 `backend` 目录下执行 `uvicorn main:app --reload`
2. **API Key 错误**: 检查 `.env` 文件中的 `ANTHROPIC_API_KEY` 是否正确
3. **Port 8000 被占用**: 使用 `uvicorn main:app --port 8001 --reload` 更改端口
4. **CORS 错误**: 已在 FastAPI 中配置允许所有来源（开发模式）

### 前端问题

1. **无法连接到后端**: 确认后端服务在 `http://localhost:8000` 运行
2. **相机权限**: 在 iOS/Android 设置中授予应用相机权限
3. **Expo 连接问题**: 运行 `npx expo start --clear` 清除缓存

## 许可证

MIT

## 相关资源

- [FastAPI 文档](https://fastapi.tiangolo.com/)
- [React Native 文档](https://reactnative.dev/)
- [Anthropic API 文档](https://docs.anthropic.com/)
- [Expo 文档](https://docs.expo.dev/)
