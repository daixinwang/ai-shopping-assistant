# 架构说明

## 请求链路

```text
React Native / Expo
  ├─ POST /chat              非流式可靠回退
  ├─ POST /chat/stream       SSE 状态、工具结果、token、完成事件
  ├─ GET /products/{id}      SQLite 商品事实
  ├─ POST /compare           2–3 件结构化对比
  ├─ GET/POST /cart          本地演示购物车
  └─ GET/PUT /preferences    跨会话偏好
             │
             ▼
FastAPI → Agent Orchestrator → Intent Router → Tool
                                      ├─ recommend / refine
                                      ├─ product_detail / compare
                                      └─ cart / clarify / fallback
             │
             ├─ ChatModel → DoubaoChatModel（真实环境）
             │             FakeChatModel（自动测试）
             ├─ SearchService → lexical（默认）
             │               └─ Chroma + BM25 + rerank（可选）
             └─ SQLite → products / SKU / sessions / preferences / cart
```

## 设计边界

SQLite 是商品标题、品牌、类别和价格的事实源。向量索引只提供召回证据；命中后必须回填 SQLite 字段，防止陈旧元数据成为商品事实。模型负责路由、查询改写、图像理解和表达，不直接生成价格或库存。

`ChatModel` 隔离模型供应商。现有 Agent 内部仍保留 OpenAI 形状的同步调用表面以减少迁移风险，但该表面由 Adapter 驱动，业务模块不拿到供应商 SDK 客户端。流式桥使用后台事件循环逐块转发，不预先缓冲完整回答。

## 降级策略

- 默认 `lexical`：无 Embedding、Chroma 或 Rerank Key 也能启动和检索。
- `hybrid`：必须能打开指定 Chroma collection 且 collection 非空，否则 `/health` 报 `degraded`，不会虚报向量能力。
- 模型异常：路由有限重试；编排和回答使用稳定的规则/模板降级。公开响应和日志不包含异常文本、Key 或图片内容。
- SSE：原生端在发送前选择 `/chat`，Web 使用 `/chat/stream`；断流后不自动重放可能产生购物车副作用的请求，界面提供可恢复提示。
- 图片：base64 和远程 URL 二选一。远程域名默认关闭并需管理员显式加入 allowlist；地址还必须解析到公网，禁止重定向，下载后验证真实格式、MIME、字节数和像素数。

## 数据与状态

演示目录为 100 个商品 JSON 和 100 张配图，导入后包含多 SKU。生成的 SQLite 与 Chroma 文件属于运行时产物并被 Git 忽略。会话 ID 存在客户端本地存储中；偏好按演示用户 ID 写入 SQLite；购物车当前为单演示用户模型，不是多租户生产实现。

## 兼容层

原项目的 `/api/v1` 路由继续挂载在同一个 FastAPI 应用中，旧识图和筛选页面仍可编译。新主入口只使用 CartPilot Agent API，避免维护两套新的业务链路。
