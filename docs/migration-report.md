# CartPilot 代码迁移报告

## 来源与基线

- 目标仓库迁移起点：`316ceadbc8fa87140e80cf99881a62d9e7e88394`（分支 `shuai`）。
- CartPilot / E-commerce-AI-Agent 固定来源：`361184104f40ff0add11315b684729ab76c27b95`。本地来源副本不含 `.git`，已用远端固定提交的 362 个跟踪文件清单与内容校验；除未迁移的 SwiftUI/SVG 外，后端与数据一致。
- 目标仓库迁移前：后端 `45 passed`，移动端 `npx tsc --noEmit` 通过。
- 原版 CartPilot 隔离基线：`238 passed, 12 failed, 7 skipped`。12 个失败集中在未配置 Ark 模型时仍隐式调用路由/查询分解，不是通过降低断言隐藏；迁移时用 Adapter、Fake 和 lexical 默认模式消除了这类外部依赖。

## 文件映射

| 来源 | 目标 | 处理 |
|---|---|---|
| `backend/agent` | `backend/agent` | 迁入编排、会话、工具、composer；增加安全降级 |
| `backend/search`, `backend/rag` | 同名目录 | 迁入 lexical/hybrid、Chroma、rerank；SQLite 事实回填 |
| `backend/store`, `backend/db` | 同名目录 | 迁入商品、SKU、会话、偏好、购物车和初始化脚本 |
| `backend/api/main.py`, `products.py` | 同名路径 | 合并 Agent API，并挂载到原 FastAPI 应用 |
| `backend/llm` | 同名目录 | 增加 provider-neutral `ChatModel`、Doubao 和 Fake Adapter |
| `data/*.json`, `data/images/*.jpg` | `data` | 迁入 100 个演示商品与 100 张必要配图 |
| CartPilot tests/eval | `backend/**/tests`, `backend/eval` | 迁入并补充迁移契约测试 |
| CartPilot SwiftUI 客户端 | 未迁移 | 保留目标仓库 React Native 客户端 |

## 适配改动

- 同一应用同时暴露新 `/chat`、`/chat/stream` 和旧 `/api/v1`，避免两套服务器入口。
- 默认 lexical，无 Key 不构造 Embedding/Rerank 客户端；hybrid 健康检查打开并计数真实 collection。
- 商品标题、品牌、分类和价格始终由 SQLite 回填。
- ChatModel 同步兼容桥逐块转发异步流；测试可注入 Fake，不导出供应商 SDK。
- 图片验证真实解码格式、MIME、字节/像素限制；远程 URL 拒绝私网解析与重定向。
- compare 放宽到 2–3 件；公开 trace、payload 与日志使用稳定错误码，不输出底层异常文本。
- React Native 新增统一导购页、图片入口、商品卡、详情、对比、购物车和偏好；SSE 自动回退非流式。

## 验证记录

最终验证结果：后端 `315 passed, 7 skipped`；移动端 Vitest `8 passed`；TypeScript 与 Python compileall 均通过。自动测试不使用真实 Key、不访问模型或电商平台。主要命令：

```powershell
Set-Location backend
..\.venv\Scripts\python.exe -m pytest -q
..\.venv\Scripts\python.exe -m compileall .

Set-Location ..\mobile
npm test
npx tsc --noEmit
```

## 未验证与后续项

- 未获得用户真实 Ark/Embedding/Rerank 凭据，因此不宣称真实豆包或 hybrid 云端调用通过。
- 未连接真实电商平台；价格、库存和图片均为演示数据。
- 未在实体 iOS/Android 设备做 UI 点击验收；已做 TypeScript 与 API 映射测试。
- `npm install` 报告的传递依赖安全告警需要在 Expo 升级专项中处理，未执行可能破坏兼容性的 `npm audit fix --force`。
- FastAPI `on_event` 和测试依赖存在弃用警告，后续可统一迁移 lifespan；不影响当前运行。
