# API 契约

服务默认地址为 `http://127.0.0.1:8000`，交互式文档位于 `/docs`。

## 健康检查

`GET /health` 返回服务状态、`retrieval_mode`、`vector_search`、`reranker`；hybrid 索引可验证时还返回 `vector_index_ready`。配置声明为 hybrid 但索引无效时状态为 `degraded`。

## 对话

`POST /chat`：

```json
{
  "query": "500 元以内的防晒",
  "session_id": null,
  "user_id": "mobile-demo-user",
  "image_base64": null,
  "image_url": null
}
```

`image_base64` 可为纯 base64 或 `data:image/...;base64,...`；`image_url` 与其互斥。远程域名默认关闭，只有显式列入 `CHAT_IMAGE_ALLOWED_HOSTS` 的可信域名可用；公网 IP 仍需通过地址校验。响应包含 `session_id`、`decision`、`tool_result`、`narrative` 和 `trace`。商品卡位于 `tool_result.payload.products`，字段包括 `product_id`、`title`、`brand`、`category`、`sub_category`、`price`、`price_display`、`image_url`。

`POST /chat/stream` 使用相同请求体，SSE 事件顺序为：

```text
session → status* → meta → tool_result → token* → memory_update* → done
```

失败时可能返回 `error`。每条 `data:` 都是 JSON，客户端不能把它当作未转义文本拼接。

## 商品与对比

- `GET /products/{product_id}`：完整商品、价格、规格、SKU、评价和证据。
- `GET /products?ids=p1,p2`：批量商品详情。
- `POST /compare`：请求 `{ "product_ids": ["p1", "p2"], "focus": "续航" }`，支持 2–3 个去重后的有效 ID。

## 购物车

- `GET /cart`：当前快照。
- `POST /cart/mutate`：`add`、`remove`、`updateQuantity`、`updateSpecification`。
- `POST /cart/reset`：清空演示购物车，仅供本地调试。

加购示例：

```json
{ "action": "add", "productID": "p1", "quantity": 1 }
```

未提供 SKU 时后端选择最便宜的可售 SKU。

## 偏好

- `GET /preferences/{user_id}`
- `PUT /preferences/{user_id}`
- `POST /preferences/{user_id}/undo`

偏好字段包含预算、偏好/排除品牌、品类、关键词、风格和说明。它们是本地演示数据，不应使用真实账号标识。

## 错误与限制

普通 HTTP 错误使用 FastAPI `detail`；SSE 错误使用 `{ "message": "..." }`。客户端应允许用户修改条件和重试。默认图片上限为 5 MB、2000 万像素，可通过环境变量下调；只支持 JPEG、PNG、WebP。
