# AI 购物助手

一个面向作品集与本地演示的多模态购物 Agent。用户可以用文字或图片描述需求，继续追加预算、品牌和排除条件，并在 React Native 客户端查看结构化商品卡、详情、对比结果、购物车和个人偏好。

> 数据边界：仓库内是固定的演示商品目录，价格不是实时价格；本项目不抓取京东、淘宝等平台，也不提供全网最低价或跨平台 SKU 对齐。

## 已实现能力

- FastAPI 统一 Agent 接口：`/chat` 与 `/chat/stream`
- 文本推荐、多轮 refine、图片检索、商品详情、2–3 件商品对比
- SQLite 商品事实、会话、偏好和购物车持久化
- 默认离线 lexical 检索；配置完整时可启用 Chroma hybrid 检索与云端 rerank
- 豆包 Ark 的统一 `ChatModel` Adapter，以及完全离线的 `FakeChatModel` 测试
- React Native / Expo 客户端：原生端使用稳定的非流式请求，Web 支持 SSE；断流不会自动重放购物车操作
- 兼容保留原项目 `/api/v1` 路由，避免旧页面立即失效

架构与边界见 [docs/architecture.md](./docs/architecture.md)，接口见 [docs/api.md](./docs/api.md)，迁移证据见 [docs/migration-report.md](./docs/migration-report.md)。

## Windows 最短启动路径

前置条件：Python 3.11、Node.js 20+。以下命令从仓库根目录执行。

```powershell
py -3.11 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r .\backend\requirements.txt
Copy-Item .\backend\.env.example .\.env
Set-Location .\backend
..\.venv\Scripts\python.exe -m store.import_product_data --reset
..\.venv\Scripts\python.exe -m store.import_image_manifest
..\.venv\Scripts\python.exe -m uvicorn main:app --host 127.0.0.1 --port 8000
```

打开 `http://127.0.0.1:8000/docs` 可查看 Swagger。默认 `RETRIEVAL_MODE=lexical` 不需要 Embedding 或 Rerank Key；若未配置聊天模型，商品事实检索仍可运行，模型负责的路由、改写和自然语言生成会进入安全降级。

另开一个 PowerShell 启动移动端：

```powershell
Set-Location D:\ai-shopping-assistant\mobile
npm install
$env:EXPO_PUBLIC_API_URL="http://127.0.0.1:8000"
npm start
```

- Android 模拟器未设置该变量时默认使用 `http://10.0.2.2:8000`。
- iOS 模拟器和 Web 默认使用 `http://localhost:8000`。
- 真机请将 `EXPO_PUBLIC_API_URL` 设置为电脑可访问的局域网地址，并让后端监听 `0.0.0.0`；不要把 Key 放进移动端。

## 豆包与检索配置

复制 `backend/.env.example` 为根目录 `.env`，填写你自己的 Ark 配置：

```dotenv
CHAT_PROVIDER=doubao
CHAT_API_KEY=
CHAT_BASE_URL=
CHAT_MODEL=
RETRIEVAL_MODE=lexical
USE_RERANK=0
```

模型 ID、Base URL 和能力取决于你的火山引擎部署，因此模板不猜测实际值。Hybrid 模式还需 `EMBEDDING_*`、有效的 Chroma collection；Rerank 仅在 `USE_RERANK=1` 时需要 `RERANK_*`。健康检查会明确报告这些能力是否真正就绪。

## 验证

```powershell
Set-Location D:\ai-shopping-assistant\backend
..\.venv\Scripts\python.exe -m pytest -q

Set-Location D:\ai-shopping-assistant\mobile
npm test
npx tsc --noEmit
```

推荐手工场景：

1. 输入“推荐一款 500 元以内、不要含酒精的防晒”。
2. 继续说“预算改成 300 元，排除某品牌”。
3. 选中 2–3 张商品卡进行对比，并将一件商品加入购物车。
4. 上传一张小于 5 MB 的 JPEG、PNG 或 WebP 图片。
5. 关闭后端验证客户端出现可重试提示；重新启动后继续对话。

## 目录

```text
backend/
  agent/       Agent 编排、路由、工具与回答生成
  api/         Chat、SSE、商品、对比、购物车、偏好接口
  llm/         ChatModel、豆包 Adapter、Fake Adapter
  search/ rag/ lexical/hybrid 检索、索引与 rerank
  store/ db/   SQLite 数据导入与事实存储
mobile/        React Native / Expo 客户端
data/          100 个演示商品 JSON 与对应的本地演示图片
docs/          架构、API、定位与迁移报告
```

## 限制与安全

- 演示目录不代表库存、成交价或平台可购买状态。
- 未使用真实模型凭据验证的能力不会被宣称为已验证。
- 图片 URL 只允许公网 HTTP(S)，拒绝私网地址、重定向、超限文件和伪造 MIME；上传内容限制为 JPEG/PNG/WebP。
- `.env`、SQLite 数据库、Chroma 索引、缓存和密钥不会提交。

## 项目定位

该项目强调“多模态输入 → 结构化检索 → 有状态工具编排 → 移动端交易前闭环”。它与偏研究型、重文档 RAG 基础设施的 Eino-Researcher 互补，不把固定商品目录包装成真实电商平台。详见 [docs/project-positioning.md](./docs/project-positioning.md)。

## License

MIT
