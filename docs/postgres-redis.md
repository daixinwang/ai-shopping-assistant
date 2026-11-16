# PostgreSQL + Redis 共享部署

本模式用于把 API 实例的商品检索、会话和请求账本接到共享服务。未设置 `DATABASE_URL` 时，原 SQLite 离线演示仍可运行；设置后不会在数据库故障时悄悄回退到本地文件。

## 数据流

```text
客户端 → 任意 FastAPI 实例
           ├─ Redis：聊天并发名额、会话租约、最近 10 条消息与工作记忆、检索缓存
           └─ PostgreSQL：商品/SKU、pgvector、购物车、偏好、会话检查点、请求账本
```

PostgreSQL 中的商品事实与向量通过 `product_id` 和 `content_version` 关联。SQL 在同一次查询中检查类目、品牌、排除条件及同一个在售 SKU 的预算上下限，再计算向量距离。目前使用精确余弦检索，尚未启用 HNSW；小目录优先建立正确性基线，后续应在真实数据集上比较召回率、P95 和索引成本。

Redis 存储最近 **10 条消息，而非 10 轮对话**，以及工作记忆。每次写入先提交 PostgreSQL 检查点；读取时核对版本，防止进程在数据库提交后、缓存发布前退出造成旧缓存覆盖。Redis key 过期或丢失可恢复，会多一次数据库读取，这是当前一致性的成本。

## 本机启动（PowerShell）

在仓库根目录启动两个存储服务。Compose 里的密码仅适用于绑定本机回环地址的开发环境。

```powershell
docker compose -p shopping-scale -f compose.storage.yml up -d --wait postgres redis
.venv\Scripts\python.exe -m pip install -r backend\requirements.txt

$env:DATABASE_URL='postgresql://shopping:local-shopping-only@127.0.0.1:55432/shopping'
$env:REDIS_URL='redis://127.0.0.1:56379/0'
$env:REDIS_PREFIX='shopping'
$env:PG_POOL_SIZE='10'
$env:CHAT_MAX_INFLIGHT='16'
$env:RETRIEVAL_MODE='lexical'
cd backend
..\.venv\Scripts\python.exe -m scripts.shared_storage init
..\.venv\Scripts\python.exe -m scripts.shared_storage migrate --sqlite storage/ecommerce_agent.sqlite3
..\.venv\Scripts\python.exe -m uvicorn main:app --host 127.0.0.1 --port 8000 --limit-concurrency 64
```

迁移要求目标商品表为空，源 SQLite 只读打开，采用一致性读快照。迁移包含商品/SKU、FAQ/评价、购物车、偏好、会话和旧请求记录；旧请求记录没有参数指纹，切换后的客户端应生成新的请求 ID。先暂停旧实例写入再做正式切换，不能让两套数据库分别承接新写入。

若没有现成 SQLite 目录，先在未设置 `DATABASE_URL` 的环境运行 `python -m store.import_product_data`，从仓库 JSON 建立源库。正式模型通过所有实例相同的 `CHAT_*` 环境变量配置；共享模式不读取本机保存的模型设置。

离线演示可将最后一条命令换成 `python scripts/run_demo_server.py`。第二个终端设置相同存储环境和 `DEMO_PORT=8001` 后启动第二个演示进程，即可交替访问两个端口。离线演示不代表真实模型效果。

可选容器 API：数据库初始化、目录迁移及模型环境配置完成后，在仓库根目录执行：

```powershell
docker compose -p shopping-scale -f compose.storage.yml --profile api up -d --build --scale api=2
docker compose -p shopping-scale -f compose.storage.yml ps
```

API 使用不同的随机本机端口；通过 `ps` 查看映射。真实部署在前面配置负载均衡与 TLS。每个 API 无需会话粘滞，不挂载运行时状态目录。当前已实际验证本机 Python 双进程；该可选容器 API 配置需在目标部署环境构建验证。

## 向量及派生资料

配置 `EMBEDDING_API_KEY`、`EMBEDDING_BASE_URL`、`EMBEDDING_MODEL` 后：

```powershell
python -m scripts.shared_storage index
$env:RETRIEVAL_MODE='hybrid'
```

该构建命令会调用真实 Embedding 服务；本轮基础设施测试使用人工确定的三维向量，没有消耗模型接口额度。索引按商品构建文本证据，改变了旧 Chroma 分块粒度，语义召回质量需要重新评测，不能直接沿用旧分数。

商品或 SKU/FAQ/评价修改会递增版本，旧向量、图片向量和对比资料立即被查询排除，需要增量重建。构建过程不长时间持有数据库连接；写回时再核对版本，拒绝发布生成期间已变化的商品。

`python -m rag.build_compare_index` 和 `python -m rag.build_image_index` 在共享模式写 PostgreSQL；图片索引读取数据库里的 `image_url`。商品演示图片无需提交，部署时使用对象存储/CDN URL。未建立对比资料时显示已有结构化事实，未建立图片向量时没有视觉相似度加分。

## 缓存和并发策略

| 项目 | 策略 |
| --- | --- |
| 查询解析 | Redis 精确键；规范化查询、模型、接口地址、提示词版本、目录版本；默认 300 秒 |
| 查询向量 | 查询文本、Embedding 模型及接口地址；默认 3600 秒 |
| 向量召回 | 查询、全部解析条件、top-k、模型、接口地址、目录版本；默认 60 秒 |
| 回源并发 | 分布式短锁合并相同 key 的回源，等待超时返回受控繁忙；TTL 加随机抖动 |
| Redis 缓存故障 | 查询计算直接回源；不缓存模型失败结果 |
| 会话并发 | 同会话租约互斥，30 秒租期、8 秒续租；冲突返回 409；失租拒绝状态提交 |
| 聊天入口容量 | 全实例共用 Redis 并发名额，默认 16；超限 429 与 Retry-After |
| PostgreSQL | 每进程默认最多 10 连接、最多 32 等待者、等待 3 秒、语句超时 5 秒、锁等待 2 秒 |

缓存不保存完整个性化回答。用户偏好在进入检索前合并到条件，价格、SKU 等由数据库事实回填。目录版本统一失效简单可靠，但更新频繁时可能使缓存命中率下降。健康 Redis 下回源等待超时不会放行所有等待者再次调用模型；Redis 本身不可用时可绕过缓存。

会话接管会递增 PostgreSQL fencing token；购物车、偏好和会话保存均在短事务内锁定并检查 token，防止旧请求在接管后提交业务变更。这不代表任意跨服务副作用都具备 exactly-once。`/cart/mutate` 将修改与请求结果写入放在同一 PostgreSQL 事务，事务失败全部回滚；同一请求 ID 携带不同参数返回 409。

聊天跨越模型调用，不能持有长期数据库事务。共享账本记录完成后可重放；如果进程在工具执行后、响应记录前崩溃，请求维持 pending，**不自动超时接管**，避免重复加购。此时需要核对业务状态后人工处理记录；不要自动删除 pending 或换 ID 重试未知结果。完整工具级持久工作流/事务发件箱仍是后续工作。

## 健康、持久化与回滚

- `/live`：进程存活；`/ready`：PostgreSQL、Redis 和已启用索引可用，失败返回 503；`/health` 保留检索配置状态。
- Redis 开发容器开启 AOF 和 `noeviction`。内存满时拒绝写入，协调失败会拒绝聊天；会话检查点仍在 PostgreSQL。该配置不等于 Redis 高可用。
- 所有实例必须使用相同数据库、Redis namespace、模型配置与代码版本；连接预算按“实例数 × 每实例连接池”计算。
- 共享模式不挂载旧 `/api/v1/identify`、`/api/v1/filter` 等依赖进程内数据的接口，也不提供本机模型设置写入接口。根路径聊天/商品/对比/购物车接口保留。CORS 可通过 `CORS_ALLOW_ORIGINS` 设置逗号分隔的来源列表。
- 回滚前暂停流量。若共享模式已产生新写入，应先备份 PostgreSQL 并制定数据回迁，不能仅删除环境变量后认为数据已经回滚。源 SQLite 保留便于演练撤回，但不包含切换后的写入。

数据库定期备份、恢复演练、复制与故障切换、认证与租户隔离、模型供应商 RPM/TPM 配额、指标采集与告警仍需按部署目标补齐。现有购物车仍是 `demo_user` 演示账户，不能直接作为多用户电商上线。

## 测试与压测复现

从 `backend` 目录执行，测试数据库名称必须以 `_test` 结尾：

```powershell
$env:SHOPPING_TEST_DATABASE_URL='postgresql://shopping:local-shopping-only@127.0.0.1:55432/shopping_test'
$env:SHOPPING_TEST_REDIS_URL='redis://127.0.0.1:56379/0'
python -m pytest tests/test_shared_storage.py -q
```

先用 `createdb` 建立该专用库。测试会清空测试库中的业务表，Redis 只删除测试随机前缀，不会使用 `FLUSHDB`。未设置测试 URL 时，这些集成用例明确跳过，不能把 skip 算通过。

负载脚本启动、回收两个真实 HTTP 进程，使用已有专用测试目录；数据库和 Redis 均是真实服务，模型明确使用离线适配器：

```powershell
$env:DATABASE_URL='postgresql://shopping:local-shopping-only@127.0.0.1:55432/shopping_bench_test'
$env:REDIS_URL='redis://127.0.0.1:56379/0'
python -m eval.shared_load --requests 1000 --chats 200 --concurrency 8 --output ../docs/benchmarks/local.json
python -m eval.shared_load --duration 30 --concurrency 8 --output ../docs/benchmarks/soak.json
```

需要先初始化并迁移专用负载库。脚本不会清空数据库，运行会留下会话和请求账本，测试完可按测试数据生命周期清理。结果包括请求数、实际耗时、状态码、传输异常、RPS、P50/P95/P99；不是开放到达率测试，不覆盖真实模型的延迟/配额，也不能外推成百万并发保证。
