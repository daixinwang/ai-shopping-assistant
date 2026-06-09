# Kaggle数据集转换工具使用指南

## 简介

本工具用于将Kaggle下载的时尚商品数据集转换为项目所需的 `ProductItem` 格式，以便用于比价搜索功能。

## 支持的数据集

| 数据集 | Kaggle链接 | 文件名 |
|-------|-----------|--------|
| Fashion Clothing Products Catalog | https://www.kaggle.com/datasets/shivamb/fashion-clothing-products-catalog | `fashion-clothing-products-catalog.csv` |
| Wardrobe Assistant | https://www.kaggle.com/datasets/shahzaibmalik44/wardrobe-assistant | `wardrobe-assistant.csv` |
| Fashion Product Images Small | https://www.kaggle.com/datasets/paramaggarwal/fashion-product-images-small | `styles.csv` |

## 使用步骤

### 1. 准备数据集

将下载的CSV文件放到 `datasets/` 目录下：

```
datasets/
├── fashion-clothing-products-catalog.csv
├── wardrobe-assistant.csv
└── fashion-product-images-small/
    └── styles.csv
```

### 2. 运行转换脚本

```bash
cd backend
python scripts/convert_kaggle_data.py
```

### 3. 检查输出

转换完成后，数据将保存到 `backend/data/kaggle_products.json`

## 数据转换说明

### 字段映射

| 项目字段 | 来源字段 | 说明 |
|---------|---------|------|
| `id` | 自动生成 | 格式: ITEM000001 |
| `name` | productDisplayName / title / name | 商品名称 |
| `category` | masterCategory / category / type | 映射到5大类目 |
| `subcategory` | subCategory / articleType / subcategory | 子类目 |
| `brand` | brand | 品牌，缺失时随机填充 |
| `color` | baseColour / color | 颜色，缺失时随机填充 |
| `style` | season / style | 风格，缺失时随机填充 |
| `key_features` | season / usage / articleType | 自动生成关键特性 |
| `platform_prices` | 自动生成 | 天猫/京东/拼多多价格 |
| `min_price` | 自动计算 | 三平台最低价 |
| `rating` | 自动生成 | 4.0-4.9随机评分 |
| `sales` | 自动生成 | 随机销量 |
| `store_type` | 自动生成 | flagship/official/third_party |
| `tags` | 自动生成 | 随机标签 |
| `image_url` | 自动生成 | picsum.photos图片 |

### 类目映射规则

```
Apparel / Clothing / Tops / Bottoms / Dresses → T恤
Footwear / Shoes / Sporting Goods → 运动鞋
Accessories / Bags / Wallets / Belts → 包包
其他 → 其他
```

### 价格生成规则

| 类目 | 价格范围(元) | 平台差价 |
|-----|------------|---------|
| 运动鞋 | 200-2000 | 天猫 > 京东 > 拼多多 |
| 手机 | 500-15000 | 天猫 > 京东 > 拼多多 |
| 耳机 | 100-5000 | 天猫 > 京东 > 拼多多 |
| T恤 | 30-500 | 天猫 > 京东 > 拼多多 |
| 包包 | 200-10000 | 天猫 > 京东 > 拼多多 |
| 其他 | 50-5000 | 天猫 > 京东 > 拼多多 |

## 自定义配置

### 修改输入输出路径

编辑 `convert_kaggle_data.py` 的 `main()` 函数：

```python
input_paths = [
    'path/to/your/dataset1.csv',
    'path/to/your/dataset2.csv',
]
output_path = 'backend/data/custom_products.json'
```

### 添加新类目映射

在 `KaggleDataConverter.__init__()` 中添加：

```python
self.category_mapping['NewCategory'] = '目标类目'
```

## 注意事项

1. **文件编码**：确保CSV文件使用UTF-8编码
2. **重复数据**：转换工具会自动基于商品名称去重
3. **图片URL**：使用picsum.photos生成随机图片，如需使用真实图片请自行配置
4. **数据合规**：请确保数据集的使用符合Kaggle的使用条款

## 示例输出

```json
{
  "id": "ITEM000001",
  "name": "Nike Air Max 运动鞋",
  "category": "运动鞋",
  "subcategory": "Running Shoes",
  "brand": "Nike",
  "color": "黑色",
  "style": "运动",
  "key_features": ["夏季款", "跑步适用", "品质保证", "正品保障"],
  "platform_prices": {
    "tmall": 899.0,
    "jd": 879.0,
    "pdd": 799.0
  },
  "min_price": 799.0,
  "rating": 4.7,
  "sales": 12500,
  "store_type": "flagship",
  "tags": ["官方"],
  "image_url": "https://picsum.photos/seed/kagitem1/300/300"
}
```

## 扩展数据源

项目的 `MockProductRepository` 支持自动加载多个数据源：

```python
DATA_SOURCES = [
    "mock_products.json",      # 原始模拟数据
    "kaggle_products.json",    # Kaggle转换数据
]
```

只需将新生成的JSON文件放入 `backend/data/` 目录并添加到列表即可。