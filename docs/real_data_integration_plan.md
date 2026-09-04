# 真实电商数据接入方案

## 一、当前架构分析

### 1.1 数据层架构

```
┌─────────────────────────────────────────────────────────────┐
│                     ProductService                          │
│  search() → apply_filters() → search_and_filter()          │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│              ProductRepository (接口层)                     │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│          MockProductRepository (当前实现)                   │
│          从 mock_products.json 加载模拟数据                  │
└─────────────────────────────────────────────────────────────┘
```

### 1.2 当前数据问题

| 问题 | 影响 |
|-----|------|
| 数据静态固定 | 价格、库存等信息无法更新 |
| 数据量有限 | 仅130条商品，覆盖5类目 |
| 无实时搜索 | 无法搜索真实商品 |
| 店铺类型模拟 | "旗舰店"等标签为硬编码 |

---

## 二、真实数据接入方案

### 2.1 方案对比

| 方案 | 优点 | 缺点 | 适用场景 |
|-----|------|------|---------|
| **电商平台开放API** | 数据真实、实时 | 需要申请、有限流限制 | 长期生产环境 |
| **商品搜索API聚合服务** | 一站式接入多平台 | 第三方服务，可能收费 | 快速上线 |
| **爬虫（不推荐）** | 数据全面 | 违法违规、易被封禁 | 绝对禁止 |
| **自建商品数据库** | 可控性强 | 维护成本高 | 企业级应用 |

### 2.2 推荐方案：开放API + 聚合服务

#### 推荐接入的API资源

| API服务 | 平台覆盖 | 类型 | 费用 | 申请难度 |
|--------|---------|------|------|---------|
| **淘宝开放平台** | 淘宝/天猫 | 官方API | 免费额度+付费 | 中等 |
| **京东开放平台** | 京东 | 官方API | 免费额度+付费 | 中等 |
| **拼多多开放平台** | 拼多多 | 官方API | 免费额度+付费 | 中等 |
| **易源数据** | 多平台聚合 | 第三方 | 按量付费 | 低 |
| **聚合数据** | 多平台聚合 | 第三方 | 按量付费 | 低 |
| **API集市** | 多平台聚合 | 第三方 | 按量付费 | 低 |

---

## 三、架构扩展设计

### 3.1 可扩展Repository模式

```python
# backend/repository/__init__.py

from abc import ABC, abstractmethod
from typing import Optional, List
from models.product import ProductItem

class ProductRepository(ABC):
    """商品数据仓库抽象接口"""
    
    @abstractmethod
    def get_all(self) -> List[ProductItem]:
        pass
    
    @abstractmethod
    def get_by_category(self, category: str) -> List[ProductItem]:
        pass
    
    @abstractmethod
    def search_by_keywords(self, keywords: List[str]) -> List[ProductItem]:
        pass
    
    @abstractmethod
    def search_by_image(self, image_features: dict) -> List[ProductItem]:
        """根据图片特征搜索相似商品"""
        pass
```

### 3.2 多数据源聚合器

```python
# backend/repository/hybrid_product_repo.py

from typing import List
from models.product import ProductItem
from .mock_product_repo import MockProductRepository

class HybridProductRepository(ProductRepository):
    """混合数据源仓库：优先调用真实API，降级到Mock数据"""
    
    def __init__(self):
        self.mock_repo = MockProductRepository()
        self.real_repos = []  # 真实API仓库列表
        self.use_real_data = True
    
    def add_real_repo(self, repo: ProductRepository):
        self.real_repos.append(repo)
    
    def search_by_keywords(self, keywords: List[str]) -> List[ProductItem]:
        if self.use_real_data and self.real_repos:
            results = []
            for repo in self.real_repos:
                try:
                    results.extend(repo.search_by_keywords(keywords))
                except Exception as e:
                    print(f"数据源 {repo.__class__.__name__} 调用失败: {e}")
            # 去重
            if results:
                seen = set()
                return [p for p in results if not (p.id in seen or seen.add(p.id))]
        # 降级到Mock数据
        return self.mock_repo.search_by_keywords(keywords)
```

---

## 四、具体实现步骤

### 4.1 步骤1：创建真实API仓库

```python
# backend/repository/taobao_api_repo.py

import requests
import json
from typing import List
from models.product import ProductItem, PlatformPrices
from . import ProductRepository

class TaobaoApiRepository(ProductRepository):
    """淘宝开放平台API仓库"""
    
    def __init__(self, app_key: str, app_secret: str):
        self.app_key = app_key
        self.app_secret = app_secret
        self.base_url = "https://eco.taobao.com/router/rest"
    
    def _sign_request(self, params: dict) -> dict:
        """生成签名（简化版）"""
        params['app_key'] = self.app_key
        params['sign_method'] = 'md5'
        params['timestamp'] = '2026-05-27 12:00:00'
        params['v'] = '2.0'
        return params
    
    def search_by_keywords(self, keywords: List[str]) -> List[ProductItem]:
        if not keywords:
            return []
        
        params = self._sign_request({
            'method': 'taobao.tbk.dg.material.optional',
            'q': ' '.join(keywords),
            'page_size': 20,
        })
        
        try:
            response = requests.get(self.base_url, params=params, timeout=10)
            data = response.json()
            
            if 'tbk_dg_material_optional_response' in data:
                result_list = data['tbk_dg_material_optional_response']['result_list']['map_data']
                return self._parse_items(result_list)
        except Exception as e:
            print(f"淘宝API调用失败: {e}")
        
        return []
    
    def _parse_items(self, raw_items: list) -> List[ProductItem]:
        """解析淘宝API返回数据"""
        products = []
        for item in raw_items:
            try:
                products.append(ProductItem(
                    id=f"TB_{item['item_id']}",
                    name=item.get('title', ''),
                    category=self._map_category(item.get('category_name', '')),
                    subcategory='',
                    brand=item.get('brand', ''),
                    color='',
                    style='',
                    key_features=[],
                    platform_prices=PlatformPrices(
                        tmall=float(item.get('zk_final_price', 0)),
                        jd=None,
                        pdd=None
                    ),
                    min_price=float(item.get('zk_final_price', 0)),
                    rating=float(item.get('user_eval_count', 0)) > 0 and 4.5 or 0,
                    sales=int(item.get('sales', 0)),
                    store_type='flagship' if '旗舰店' in item.get('shop_title', '') else 'third_party',
                    tags=['官方'] if '官方' in item.get('shop_title', '') else [],
                    image_url=item.get('pict_url', '')
                ))
            except Exception as e:
                print(f"解析商品失败: {e}")
        
        return products
    
    def _map_category(self, category_name: str) -> str:
        """映射淘宝类目到系统类目"""
        category_map = {
            '运动鞋': '运动鞋',
            '手机': '手机',
            '耳机': '耳机',
            'T恤': 'T恤',
            '包包': '包包',
        }
        for key in category_map:
            if key in category_name:
                return category_map[key]
        return '未知商品'
    
    def get_all(self) -> List[ProductItem]:
        return []
    
    def get_by_category(self, category: str) -> List[ProductItem]:
        return self.search_by_keywords([category])
    
    def search_by_image(self, image_features: dict) -> List[ProductItem]:
        return []
```

### 4.2 步骤2：更新ProductService使用新仓库

```python
# backend/services/product_service.py

from typing import Optional, List
from repository.mock_product_repo import MockProductRepository
from repository.hybrid_product_repo import HybridProductRepository
from models.product import ProductItem
from models.filter import FilterParams

class ProductService:
    def __init__(self):
        # 使用混合仓库
        self.repo = HybridProductRepository()
        
        # 如果配置了真实API，添加真实数据源
        self._init_real_repos()
    
    def _init_real_repos(self):
        """初始化真实API仓库"""
        try:
            from repository.taobao_api_repo import TaobaoApiRepository
            
            # 从环境变量读取配置
            import os
            app_key = os.environ.get('TAOBAO_APP_KEY')
            app_secret = os.environ.get('TAOBAO_APP_SECRET')
            
            if app_key and app_secret:
                taobao_repo = TaobaoApiRepository(app_key, app_secret)
                self.repo.add_real_repo(taobao_repo)
                print("已接入淘宝API")
        except Exception as e:
            print(f"初始化真实API失败，使用Mock数据: {e}")
    
    # ... 其他方法保持不变
```

---

## 五、功能实现映射

### 5.1 "查看同款低价"实现

```python
# 在 ProductService 中
def get_lowest_price_products(self, keywords: List[str], category: str) -> List[ProductItem]:
    """获取同款低价商品"""
    products = self.search(keywords, category)
    # 按最低价格排序
    products.sort(key=lambda p: p.min_price)
    return products[:10]
```

### 5.2 "只看旗舰店"实现

```python
# 在 FilterParams 中已有 store_type 字段
# 服务端 apply_filters 已支持
def apply_filters(self, products: List[ProductItem], filters: FilterParams) -> List[ProductItem]:
    if filters.store_type:
        result = [p for p in result if p.store_type == filters.store_type]
```

### 5.3 "相似爆款推荐"实现

```python
def get_hot_recommendations(self, category: str, limit: int = 10) -> List[ProductItem]:
    """获取爆款推荐（按销量排序）"""
    products = self.search([], category)
    products.sort(key=lambda p: p.sales, reverse=True)
    return products[:limit]
```

---

## 六、免费API申请指南

### 6.1 淘宝联盟API

1. **申请地址**：https://pub.alimama.com/
2. **步骤**：
   - 注册淘宝联盟账号
   - 创建应用获取 App Key 和 App Secret
   - 申请推广权限
   - 调用 `taobao.tbk.dg.material.optional` 接口

### 6.2 京东联盟API

1. **申请地址**：https://union.jd.com/
2. **步骤**：
   - 注册京东联盟账号
   - 创建推广位
   - 获取 API Key
   - 调用商品搜索接口

### 6.3 易源数据（第三方聚合）

1. **地址**：https://www.showapi.com/
2. **优势**：一站式接入多个平台
3. **推荐接口**：
   - 淘宝商品搜索
   - 京东商品搜索
   - 拼多多商品搜索

---

## 七、配置与部署

### 7.1 环境变量配置

```env
# .env
TAOBAO_APP_KEY=your_taobao_app_key
TAOBAO_APP_SECRET=your_taobao_app_secret
JD_API_KEY=your_jd_api_key
USE_REAL_DATA=true
```

### 7.2 启动命令

```bash
# 开发模式（使用Mock数据）
cd backend
python main.py

# 生产模式（使用真实数据）
TAOBAO_APP_KEY=xxx TAOBAO_APP_SECRET=xxx python main.py
```

---

## 八、数据更新策略

### 8.1 缓存机制

```python
# 添加缓存层
from datetime import datetime, timedelta
from typing import Dict, List
from models.product import ProductItem

class ProductCache:
    def __init__(self):
        self.cache: Dict[str, dict] = {}
        self.cache_ttl = timedelta(hours=1)
    
    def get(self, key: str) -> List[ProductItem]:
        entry = self.cache.get(key)
        if entry and datetime.now() - entry['timestamp'] < self.cache_ttl:
            return entry['data']
        return None
    
    def set(self, key: str, data: List[ProductItem]):
        self.cache[key] = {
            'data': data,
            'timestamp': datetime.now()
        }
```

### 8.2 定时更新

```python
# 在 main.py 中添加定时任务
async def update_product_cache():
    """定时更新商品缓存"""
    while True:
        try:
            # 更新热门商品缓存
            product_svc = ProductService()
            for category in ['运动鞋', '手机', '耳机', 'T恤', '包包']:
                hot_products = product_svc.get_hot_recommendations(category, 20)
                cache.set(f"hot_{category}", hot_products)
            print(f"缓存更新完成: {datetime.now()}")
        except Exception as e:
            print(f"缓存更新失败: {e}")
        
        await asyncio.sleep(3600)  # 每小时更新一次
```

---

## 九、风险与注意事项

| 风险 | 缓解措施 |
|-----|---------|
| API调用失败 | 降级到Mock数据 |
| API限流 | 添加请求间隔控制、使用缓存 |
| 数据格式变化 | 增加异常处理、日志记录 |
| 成本控制 | 设置API调用上限、监控告警 |
| 合规问题 | 使用官方API，不爬虫 |

---

## 十、实施建议

### 10.1 短期目标（1-2周）

| 任务 | 描述 |
|-----|------|
| 注册API账号 | 申请淘宝/京东联盟账号 |
| 实现API仓库 | 创建淘宝API仓库类 |
| 集成混合仓库 | 更新ProductService |
| 测试验证 | 验证真实数据获取 |

### 10.2 中期目标（2-4周）

| 任务 | 描述 |
|-----|------|
| 添加京东API | 扩展支持京东平台 |
| 实现缓存 | 添加商品缓存层 |
| 完善错误处理 | 添加降级和重试机制 |
| 性能优化 | 添加请求限流 |

---

**文档版本**：v1.0  
**生成日期**：2026-05-27  
**适用场景**：真实电商数据接入