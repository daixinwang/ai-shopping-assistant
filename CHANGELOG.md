# 更新日志

## v1.1.0 — Myntra 真实数据集 & 多平台适配 (2026-06)

---

### 一、新增 AI 提供商：豆包 (Doubao)

| 文件 | 说明 |
|------|------|
| `backend/services/ai_client_factory.py` | 新增 `_call_doubao` 方法，使用 OpenAI SDK 对接火山方舟 API（`https://ark.cn-beijing.volces.com/api/v3`） |
| `backend/api/v1/config.py` | 添加 `doubao` 提供商及模型列表，支持自定义 Endpoint ID 输入 |
| `mobile/src/screens/SettingsScreen.tsx` | 设置页新增「豆包 (Doubao)」选项，支持从预设模型选择或手动输入 Endpoint ID |

**使用方式**：在设置页选择豆包，填入火山方舟 API Key 和 Endpoint ID，保存即可。

---

### 二、Myntra 真实商品数据集

用来自 Myntra 电商平台的 44,576 条真实商品数据替换了原有的 130 条模拟数据。

| 数据项 | 数量 |
|--------|------|
| 商品总数 | 44,576 条 |
| 带真实图片 | 44,441 条 |
| T恤 | 21,425 条 |
| 包包 | 11,314 条 |
| 运动鞋 | 9,277 条 |
| 其他 | 2,510 条 |

**相关文件**：

| 文件 | 说明 |
|------|------|
| `backend/data/myntra_products.json` | 商品元数据（JSON 格式） |
| `dataset/myntradataset/images/` | 商品图片（4.4万张，未入库） |
| `backend/scripts/convert_myntra_data.py` | Myntra 原始 CSV → JSON 转换脚本 |
| `backend/scripts/convert_kaggle_data.py` | Kaggle 数据集转换脚本（预留） |
| `backend/test_search.py` | 数据集验证脚本 |

**后端适配**：

| 文件 | 说明 |
|------|------|
| `backend/main.py` | 新增静态文件服务 `/images/myntra`，挂载商品图片目录 |
| `backend/repository/mock_product_repo.py` | 支持多数据源加载与合并、ID 去重，可通过 `DATA_SOURCES` 配置 |
| `backend/services/product_service.py` | 返回结果上限 200 条；自动将相对路径图片 URL 转为绝对路径（`http://localhost:8000/images/myntra/...`） |

---

### 三、Web 平台兼容

| 文件 | 说明 |
|------|------|
| `mobile/app.json` | 新增 `web.bundler` 配置 |
| `mobile/package.json` | 修复入口点 `expo/AppEntry`；添加 `react-native-web`、`react-dom`、`@expo/metro-runtime` |
| `mobile/src/screens/CameraScreen.tsx` | Web 端使用原生 HTML file input 替代 expo-image-picker（解决 blob URL 兼容问题）；改进错误信息展示（屏幕直接显示 + AsyncStorage 恢复支持） |
| `mobile/src/api/client.ts` | 图片上传前自动将 blob URL 转为 File 对象（Web 端适配） |

---

### 四、前端体验优化

| 文件 | 说明 |
|------|------|
| `mobile/src/screens/SettingsScreen.tsx` | 支持自定义模型/Endpoint 输入；本地存储改用统一 `storage` 工具；启动时自动恢复上次配置 |
| `mobile/src/utils/storage.ts` | 新增 AsyncStorage 封装工具，统一键名前缀和错误处理 |
| `mobile/App.tsx` | 启动时自动恢复已保存的 AI 配置 |

---

### 五、Bug 修复

| 问题 | 修复 |
|------|------|
| `httpx 0.28.1` 移除 `proxies` 参数导致 OpenAI SDK 报错 | 降级至 `httpx==0.27.2` |
| Web 端选照片后无反应 | CameraScreen 改回原生 HTML file input，避免 expo-image-picker Web 兼容问题 |
| 错误信息显示 `[object Object]` | 捕获多种错误结构（`response.data.detail`、`message`、JSON 序列化） |
| 图片 URL 相对路径前端无法加载 | 后端 `product_service.py` 自动转换为绝对 URL |

---

### 六、测试

| 文件 | 说明 |
|------|------|
| `backend/tests/test_product_service.py` | 适配新数据量级（MAX_RESULTS=200）和类目变更 |
| `backend/tests/test_api.py` | 新增 7 个 API 端到端测试（健康检查、配置、识别、搜索、过滤等） |

运行测试：
```bash
cd backend
python -m pytest tests/ -v    # 30 个测试
python test_search.py          # 数据集验证
```

---

### 七、快速启动

```bash
# 1. 后端
cd backend
python -m venv venv && source venv/bin/activate   # 或 venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload --host 0.0.0.0
# → http://localhost:8000/docs

# 2. 前端 (Web)
cd mobile
npm install
npx expo start --web
# → http://localhost:8081

# 3. 配置 AI（在 Swagger 或前端设置页）
# Provider: doubao
# Model: <你的 Endpoint ID>
# API Key: <你的火山方舟 Key>
```
