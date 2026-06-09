
import json
import csv
import random
from pathlib import Path
from typing import List, Dict, Any

class KaggleDataConverter:
    """Kaggle数据集转换工具：将外部数据集转换为项目所需的ProductItem格式"""
    
    def __init__(self):
        # 类目映射
        self.category_mapping = {
            'Apparel': 'T恤',
            'Footwear': '运动鞋',
            'Accessories': '包包',
            'Personal Care': '其他',
            'Free Items': '其他',
            'Sporting Goods': '运动鞋',
            'Shoes': '运动鞋',
            'Clothing': 'T恤',
            'Tops': 'T恤',
            'Bottoms': 'T恤',
            'Dresses': 'T恤',
            'Bags': '包包',
            'Wallets': '包包',
            'Belts': '包包',
            'Headwear': '其他',
            'Scarves': '其他',
            'Watches': '其他',
        }
        
        # 品牌列表
        self.brands = [
            'Nike', 'Adidas', 'New Balance', 'Puma', 'Reebok',
            'Apple', 'Samsung', 'Sony', 'Bose', 'Huawei',
            'Uniqlo', 'Gap', 'Zara', 'H&M', 'Levi\'s',
            'Coach', 'MK', 'Furla', 'Gucci', 'LV'
        ]
        
        # 颜色列表
        self.colors = [
            '黑色', '白色', '灰色', '蓝色', '红色', '粉色',
            '绿色', '黄色', '橙色', '紫色', '米色', '棕色'
        ]
        
        # 风格列表
        self.styles = [
            '休闲', '运动', '商务', '时尚', '复古', '简约',
            '潮流', '经典', '舒适', '修身', '宽松', '百搭'
        ]
        
        # 店铺类型
        self.store_types = ['flagship', 'official', 'third_party']
    
    def _map_category(self, raw_category: str) -> str:
        """映射原始类目到项目类目"""
        if not raw_category:
            return '其他'
        
        raw_category = raw_category.strip().capitalize()
        for key, value in self.category_mapping.items():
            if key.lower() in raw_category.lower():
                return value
        return '其他'
    
    def _generate_price(self, category: str) -> Dict[str, float]:
        """根据类目生成合理的三平台价格"""
        price_ranges = {
            '运动鞋': (200, 2000),
            '手机': (500, 15000),
            '耳机': (100, 5000),
            'T恤': (30, 500),
            '包包': (200, 10000),
            '其他': (50, 5000)
        }
        
        min_price, max_price = price_ranges.get(category, (100, 1000))
        tmall = round(random.uniform(min_price, max_price), 2)
        jd = round(tmall * random.uniform(0.95, 0.99), 2)
        pdd = round(jd * random.uniform(0.85, 0.95), 2)
        
        return {
            'tmall': max(tmall, min_price),
            'jd': max(jd, min_price),
            'pdd': max(pdd, min_price)
        }
    
    def _generate_key_features(self, row: Dict[str, Any]) -> List[str]:
        """从数据行生成关键特性列表"""
        features = []
        
        # 从各种字段提取特征
        if row.get('season'):
            features.append(f"{row['season']}款")
        if row.get('usage'):
            features.append(f"{row['usage']}适用")
        if row.get('articleType'):
            features.append(f"{row['articleType']}")
        if row.get('baseColour'):
            features.append(f"{row['baseColour']}配色")
        
        # 添加通用特征
        feature_pool = [
            '品质保证', '正品保障', '七天无理由', '运费险',
            '极速发货', '官方授权', '品牌直营', '精选好货'
        ]
        features.extend(random.sample(feature_pool, min(2, len(feature_pool))))
        
        return features[:5]
    
    def convert_fashion_catalog(self, csv_path: str) -> List[Dict]:
        """转换Fashion Clothing Products Catalog数据集"""
        products = []
        
        with open(csv_path, 'r', encoding='utf-8', errors='ignore') as f:
            reader = csv.DictReader(f)
            for idx, row in enumerate(reader):
                category = self._map_category(row.get('masterCategory', '') or row.get('category', ''))
                prices = self._generate_price(category)
                
                product = {
                    'id': f"KAG{idx+1:06d}",
                    'name': row.get('productDisplayName', row.get('title', f'商品{idx+1}')).strip(),
                    'category': category,
                    'subcategory': row.get('subCategory', row.get('articleType', '')).strip(),
                    'brand': row.get('brand', random.choice(self.brands)).strip(),
                    'color': row.get('baseColour', row.get('color', random.choice(self.colors))).strip(),
                    'style': row.get('season', random.choice(self.styles)).strip(),
                    'key_features': self._generate_key_features(row),
                    'platform_prices': {
                        'tmall': prices['tmall'],
                        'jd': prices['jd'],
                        'pdd': prices['pdd']
                    },
                    'min_price': prices['pdd'],
                    'rating': round(random.uniform(4.0, 4.9), 1),
                    'sales': random.randint(100, 100000),
                    'store_type': random.choice(self.store_types),
                    'tags': ['官方'] if random.random() > 0.3 else [],
                    'image_url': f"https://picsum.photos/seed/kag{f'item{idx+1}'}/300/300"
                }
                
                products.append(product)
        
        return products
    
    def convert_wardrobe_assistant(self, csv_path: str) -> List[Dict]:
        """转换Wardrobe Assistant数据集"""
        products = []
        
        try:
            with open(csv_path, 'r', encoding='utf-8', errors='ignore') as f:
                reader = csv.DictReader(f)
                for idx, row in enumerate(reader):
                    category = self._map_category(row.get('category', '') or row.get('type', ''))
                    prices = self._generate_price(category)
                    
                    product = {
                        'id': f"WRD{idx+1:06d}",
                        'name': row.get('name', row.get('title', f'穿搭商品{idx+1}')).strip(),
                        'category': category,
                        'subcategory': row.get('subcategory', row.get('style', '')).strip(),
                        'brand': row.get('brand', random.choice(self.brands)).strip(),
                        'color': row.get('color', random.choice(self.colors)).strip(),
                        'style': row.get('style', random.choice(self.styles)).strip(),
                        'key_features': self._generate_key_features(row),
                        'platform_prices': {
                            'tmall': prices['tmall'],
                            'jd': prices['jd'],
                            'pdd': prices['pdd']
                        },
                        'min_price': prices['pdd'],
                        'rating': round(random.uniform(4.0, 4.9), 1),
                        'sales': random.randint(100, 50000),
                        'store_type': random.choice(self.store_types),
                        'tags': ['搭配推荐'] if random.random() > 0.5 else [],
                        'image_url': f"https://picsum.photos/seed/wrd{f'{idx+1}'}/300/300"
                    }
                    
                    products.append(product)
        except Exception as e:
            print(f"转换Wardrobe Assistant失败: {e}")
        
        return products
    
    def convert_fashion_images(self, csv_path: str, images_dir: str = None) -> List[Dict]:
        """转换Fashion Product Images Small数据集"""
        products = []
        
        with open(csv_path, 'r', encoding='utf-8', errors='ignore') as f:
            reader = csv.DictReader(f)
            for idx, row in enumerate(reader):
                category = self._map_category(row.get('category', '') or row.get('masterCategory', ''))
                prices = self._generate_price(category)
                
                # 构建图片URL
                image_id = row.get('id', str(idx+1))
                image_url = f"https://picsum.photos/seed/fsh{image_id}/300/300"
                if images_dir:
                    image_path = Path(images_dir) / f"{image_id}.jpg"
                    if image_path.exists():
                        image_url = f"/images/{image_id}.jpg"
                
                product = {
                    'id': f"FSH{image_id.zfill(6)}",
                    'name': row.get('productDisplayName', f'时尚商品{idx+1}').strip(),
                    'category': category,
                    'subcategory': row.get('articleType', '').strip(),
                    'brand': row.get('brand', random.choice(self.brands)).strip(),
                    'color': row.get('baseColour', random.choice(self.colors)).strip(),
                    'style': row.get('season', random.choice(self.styles)).strip(),
                    'key_features': self._generate_key_features(row),
                    'platform_prices': {
                        'tmall': prices['tmall'],
                        'jd': prices['jd'],
                        'pdd': prices['pdd']
                    },
                    'min_price': prices['pdd'],
                    'rating': round(random.uniform(4.0, 4.9), 1),
                    'sales': random.randint(500, 80000),
                    'store_type': random.choice(self.store_types),
                    'tags': ['精选'] if random.random() > 0.5 else [],
                    'image_url': image_url
                }
                
                products.append(product)
        
        return products
    
    def merge_and_deduplicate(self, datasets: List[List[Dict]]) -> List[Dict]:
        """合并多个数据集并去重"""
        all_products = []
        seen_names = set()
        
        for dataset in datasets:
            for product in dataset:
                # 基于商品名称去重
                name_key = product['name'].lower().strip()
                if name_key not in seen_names:
                    seen_names.add(name_key)
                    all_products.append(product)
        
        # 重新分配ID
        for idx, product in enumerate(all_products):
            product['id'] = f"ITEM{idx+1:06d}"
        
        return all_products
    
    def save_to_json(self, products: List[Dict], output_path: str):
        """保存为JSON文件"""
        output_dir = Path(output_path).parent
        output_dir.mkdir(parents=True, exist_ok=True)
        
        with open(output_path, 'w', encoding='utf-8') as f:
            json.dump(products, f, ensure_ascii=False, indent=2)
        
        print(f"已保存 {len(products)} 条商品数据到 {output_path}")
    
    def convert_multiple(self, input_paths: List[str], output_path: str):
        """批量转换多个数据集"""
        all_results = []
        
        for path in input_paths:
            file_path = Path(path)
            if not file_path.exists():
                print(f"警告：文件不存在: {path}")
                continue
            
            # 根据文件名猜测数据集类型
            filename = file_path.name.lower()
            print(f"正在处理: {filename}")
            
            if 'fashion' in filename and 'catalog' in filename:
                results = self.convert_fashion_catalog(str(file_path))
            elif 'wardrobe' in filename:
                results = self.convert_wardrobe_assistant(str(file_path))
            elif 'product' in filename and 'image' in filename:
                results = self.convert_fashion_images(str(file_path))
            else:
                # 默认尝试作为Fashion Catalog处理
                try:
                    results = self.convert_fashion_catalog(str(file_path))
                except Exception as e:
                    print(f"无法识别文件格式: {filename}, 错误: {e}")
                    continue
            
            all_results.extend(results)
            print(f"  已转换 {len(results)} 条记录")
        
        # 去重
        unique_products = self.merge_and_deduplicate([all_results])
        print(f"去重后剩余 {len(unique_products)} 条记录")
        
        # 保存
        self.save_to_json(unique_products, output_path)
        
        return unique_products


def main():
    converter = KaggleDataConverter()
    
    # 默认输入路径（用户需要根据实际下载位置修改）
    input_paths = [
        'datasets/fashion-clothing-products-catalog.csv',
        'datasets/wardrobe-assistant.csv',
        'datasets/fashion-product-images-small/styles.csv'
    ]
    
    # 输出路径
    output_path = 'backend/data/kaggle_products.json'
    
    # 检查输入文件
    print("=== Kaggle数据集转换器 ===")
    print("输入文件:")
    for path in input_paths:
        exists = Path(path).exists()
        status = "✓" if exists else "✗"
        print(f"  {status} {path}")
    
    # 执行转换
    print("\n开始转换...")
    converter.convert_multiple(input_paths, output_path)
    
    print("\n=== 转换完成 ===")


if __name__ == "__main__":
    main()
