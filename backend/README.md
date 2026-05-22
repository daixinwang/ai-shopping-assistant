# 后端 API 文档

AI 购物助手后端 API 服务，基于 FastAPI 框架。

## 概述

后端通过三个核心服务阶段处理用户请求：

1. **Stage 1**: 图像识别 - 将用户上传的图片转化为结构化的识别结果
2. **Stage 2**: 建议生成 - 基于识别结果生成 4 张过滤建议卡片
3. **Stage 3**: 自然语言过滤 - 解析用户的自然语言查询为结构化过滤参数
4. **商品搜索** - 基于关键词、过滤参数、品类进行搜索和排序

## API 接口

### 1. 健康检查

**端点**: `GET /api/v1/health`

**描述**: 检查 API 服务是否正常运行

**请求**:
```bash
curl -X GET http://localhost:8000/api/v1/health
```

**响应**:
```json
{
  "status": "ok",
  "version": "1.0.0"
}
```

**状态码**: 200

---

### 2. 图像识别 + 初始搜索

**端点**: `POST /api/v1/identify`

**描述**: 上传图片进行识别，一次性返回识别结果、建议卡片和初始商品列表

**内容类型**: `multipart/form-data`

**请求参数**:
| 参数名 | 类型 | 必需 | 说明 |
|--------|------|------|------|
| `image` | File | 是 | 图片文件（支持 JPG、PNG 等） |

**请求示例**:
```bash
curl -X POST http://localhost:8000/api/v1/identify \
  -F "image=@shoe.jpg"
```

**响应示例**:
```json
{
  "session_id": "sess_abc123xyz",
  "recognition": {
    "category": "运动鞋",
    "subcategory": "跑步鞋",
    "brand": "Nike",
    "color": "白色黑条纹",
    "style": "休闲运动风格",
    "key_features": ["透气网面", "缓震气垫", "防滑鞋底"],
    "search_keywords": ["Nike 跑步鞋", "白色运动鞋", "透气网面鞋"]
  },
  "suggestions": [
    {
      "id": "sug_price_asc",
      "label": "价格从低到高",
      "filter_params": {
        "sort": "price_asc",
        "store_type": null,
        "platform": null,
        "rating_min": null
      }
    },
    {
      "id": "sug_price_desc",
      "label": "价格从高到低",
      "filter_params": {
        "sort": "price_desc",
        "store_type": null,
        "platform": null,
        "rating_min": null
      }
    },
    {
      "id": "sug_sales",
      "label": "销量排序",
      "filter_params": {
        "sort": "sales",
        "store_type": null,
        "platform": null,
        "rating_min": null
      }
    },
    {
      "id": "sug_rating",
      "label": "高评分优先",
      "filter_params": {
        "sort": "rating",
        "store_type": null,
        "platform": null,
        "rating_min": 4.5
      }
    }
  ],
  "products": [
    {
      "id": "prod_001",
      "name": "Nike Revolution 7",
      "category": "运动鞋",
      "brand": "Nike",
      "price": 379,
      "original_price": 599,
      "discount": 37,
      "rating": 4.8,
      "reviews": 5234,
      "sales": 45230,
      "image_url": "https://example.com/nike-rev7.jpg",
      "store_type": "official",
      "platform": "tmall"
    },
    {
      "id": "prod_002",
      "name": "Nike Downshifter 12",
      "category": "运动鞋",
      "brand": "Nike",
      "price": 289,
      "original_price": 459,
      "discount": 37,
      "rating": 4.6,
      "reviews": 3891,
      "sales": 28934,
      "image_url": "https://example.com/nike-ds12.jpg",
      "store_type": "official",
      "platform": "tmall"
    }
  ]
}
```

**状态码**:
- 200: 成功
- 400: 不支持的文件类型
- 500: 服务错误

---

### 3. 商品搜索

**端点**: `POST /api/v1/products/search`

**描述**: 基于会话 ID 和过滤参数进行商品搜索

**请求体**:
```json
{
  "session_id": "sess_abc123xyz",
  "filter_params": {
    "sort": "price_asc",
    "store_type": "flagship",
    "platform": "jd",
    "price_min": 200,
    "price_max": 800,
    "rating_min": 4.0
  }
}
```

**请求参数说明**:
| 参数名 | 类型 | 必需 | 说明 |
|--------|------|------|------|
| `session_id` | String | 是 | 会话 ID（来自 `/identify` 响应） |
| `filter_params` | Object | 是 | 过滤参数对象 |
| `filter_params.sort` | String | 否 | 排序方式：`price_asc`/`price_desc`/`sales`/`rating` |
| `filter_params.store_type` | String | 否 | 店铺类型：`flagship`/`official`/`third_party` |
| `filter_params.platform` | String | 否 | 平台：`tmall`/`jd`/`pdd` |
| `filter_params.price_min` | Number | 否 | 最低价格 |
| `filter_params.price_max` | Number | 否 | 最高价格 |
| `filter_params.rating_min` | Number | 否 | 最低评分 |

**请求示例**:
```bash
curl -X POST http://localhost:8000/api/v1/products/search \
  -H "Content-Type: application/json" \
  -d '{
    "session_id": "sess_abc123xyz",
    "filter_params": {
      "sort": "price_asc",
      "store_type": "flagship",
      "rating_min": 4.0
    }
  }'
```

**响应示例**:
```json
{
  "products": [
    {
      "id": "prod_003",
      "name": "Nike Court Legacy",
      "category": "运动鞋",
      "brand": "Nike",
      "price": 299,
      "original_price": 499,
      "discount": 40,
      "rating": 4.7,
      "reviews": 2156,
      "sales": 18934,
      "image_url": "https://example.com/nike-cl.jpg",
      "store_type": "official",
      "platform": "jd"
    }
  ],
  "total": 1
}
```

**状态码**:
- 200: 成功
- 404: 会话不存在或已过期
- 500: 服务错误

---

### 4. 自然语言过滤

**端点**: `POST /api/v1/filter`

**描述**: 解析自然语言查询，生成结构化过滤参数，并返回符合条件的商品

**请求体**:
```json
{
  "session_id": "sess_abc123xyz",
  "nl_query": "1000元以下，4.5分以上的黑色运动鞋"
}
```

**请求参数说明**:
| 参数名 | 类型 | 必需 | 说明 |
|--------|------|------|------|
| `session_id` | String | 是 | 会话 ID（来自 `/identify` 响应） |
| `nl_query` | String | 是 | 自然语言查询，如"1000元以下"、"黑色"、"4.5分以上"等 |

**请求示例**:
```bash
curl -X POST http://localhost:8000/api/v1/filter \
  -H "Content-Type: application/json" \
  -d '{
    "session_id": "sess_abc123xyz",
    "nl_query": "1000元以下，4.5分以上的黑色运动鞋"
  }'
```

**响应示例**:
```json
{
  "products": [
    {
      "id": "prod_001",
      "name": "Nike Revolution 7",
      "category": "运动鞋",
      "brand": "Nike",
      "price": 379,
      "original_price": 599,
      "discount": 37,
      "rating": 4.8,
      "reviews": 5234,
      "sales": 45230,
      "image_url": "https://example.com/nike-rev7.jpg",
      "store_type": "official",
      "platform": "tmall"
    }
  ],
  "applied_filters": {
    "sort": "rating",
    "store_type": null,
    "platform": null,
    "price_min": null,
    "price_max": 1000,
    "rating_min": 4.5
  }
}
```

**状态码**:
- 200: 成功
- 404: 会话不存在或已过期
- 500: 服务错误

---

## 测试

### 运行单元测试

```bash
cd backend
python3 -m pytest tests/ -v
```

**预期输出**:
```
tests/test_session_store.py::test_create_session PASSED          [ 25%]
tests/test_product_service.py::test_search_and_filter PASSED     [ 50%]
tests/test_intent_service.py::test_parse_intent PASSED           [ 75%]
...
==================== 4 passed in 0.56s ====================
```

### 运行单个测试

```bash
python3 -m pytest tests/test_product_service.py -v
```

### 带覆盖率的测试

```bash
python3 -m pytest tests/ --cov=. --cov-report=html
```

---

## Swagger 文档

启动服务后，访问以下地址查看交互式 API 文档：

- **Swagger UI**: http://localhost:8000/docs
- **ReDoc**: http://localhost:8000/redoc

## 环境变量

在 `backend/.env` 中配置：

```env
# 必需 - Anthropic API 密钥
ANTHROPIC_API_KEY=sk-ant-...your-key-here

# 可选
# PYTHON_ENV=development
# LOG_LEVEL=INFO
```

## 数据模型

### RecognitionResult（识别结果）
```python
{
  "category": str          # 主类目：运动鞋/手机/耳机/T恤/包包
  "subcategory": str       # 子类目
  "brand": str | None      # 品牌
  "color": str             # 主色调
  "style": str             # 风格描述
  "key_features": [str]    # 关键特征 2-4 个
  "search_keywords": [str] # 检索关键词 2-3 个
}
```

### FilterParams（过滤参数）
```python
{
  "sort": str | None         # 排序方式：price_asc/price_desc/sales/rating
  "store_type": str | None   # 店铺类型：flagship/official/third_party
  "platform": str | None     # 平台：tmall/jd/pdd
  "price_min": float | None  # 最低价格
  "price_max": float | None  # 最高价格
  "rating_min": float | None # 最低评分
}
```

### ProductItem（商品）
```python
{
  "id": str                # 商品 ID
  "name": str              # 商品名称
  "category": str          # 品类
  "brand": str             # 品牌
  "price": float           # 现价
  "original_price": float  # 原价
  "discount": int          # 折扣率 (%)
  "rating": float          # 评分 (0-5)
  "reviews": int           # 评论数
  "sales": int             # 销量
  "image_url": str         # 图片 URL
  "store_type": str        # 店铺类型
  "platform": str          # 平台
}
```

## 错误处理

所有错误响应遵循以下格式：

```json
{
  "detail": "错误描述信息"
}
```

### 常见错误码

| 状态码 | 说明 |
|--------|------|
| 400 | 请求参数错误或文件类型不支持 |
| 404 | 资源不存在（如会话已过期） |
| 500 | 服务器内部错误 |

## 会话管理

会话默认有效期为 10 分钟（600 秒）。超过该时间未访问的会话将被自动清理。

会话 ID 在用户上传图片时生成，用于关联后续的搜索和过滤请求。

## 性能注意事项

- 大型图片（>10MB）建议在前端压缩后再上传
- 商品搜索基于内存中的模拟数据，实际应用应接入真实数据库
- AI 调用（识别和过滤）可能需要 1-3 秒，建议前端显示加载状态

## 技术栈详情

- **FastAPI 0.115.5**: 现代 Python Web 框架，支持异步
- **Uvicorn 0.32.1**: ASGI 服务器
- **Pydantic 2.10.3**: 数据验证和序列化
- **Anthropic 0.40.0**: Claude API 客户端
- **pytest 8.3.4**: 测试框架
- **httpx 0.28.1**: 异步 HTTP 客户端

## 故障排除

### 问题：导入错误
**解决方案**: 确保在 `backend` 目录下运行命令，且已激活虚拟环境

### 问题：API Key 无效
**解决方案**: 检查 `.env` 文件中的 `ANTHROPIC_API_KEY` 是否正确，密钥应以 `sk-ant-` 开头

### 问题：Port 8000 被占用
**解决方案**: 使用 `uvicorn main:app --port 8001 --reload` 更改端口

### 问题：会话过期错误
**解决方案**: 确保在调用搜索/过滤接口时使用最新的 `session_id`，建议在 10 分钟内完成交互

## 相关资源

- [FastAPI 官方文档](https://fastapi.tiangolo.com/)
- [Anthropic API 文档](https://docs.anthropic.com/)
- [Pydantic 文档](https://docs.pydantic.dev/)
