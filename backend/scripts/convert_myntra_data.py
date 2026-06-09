
import json
import csv
import random
from pathlib import Path
from typing import List, Dict, Any

class MyntraDataConverter:
    """Myntra数据集转换工具：将myntradataset转换为项目所需的ProductItem格式"""
    
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
            'Jewellery': '其他',
        }
        
        # 品牌列表（从productDisplayName提取，首词通常是品牌）
        self.brands = [
            'Nike', 'Adidas', 'New Balance', 'Puma', 'Reebok',
            'Apple', 'Samsung', 'Sony', 'Bose', 'Huawei',
            'Uniqlo', 'Gap', 'Zara', 'H&M', 'Levi\'s',
            'Coach', 'MK', 'Furla', 'Gucci', 'LV',
            'Puma', 'Jack', 'Jones', 'Allen', 'Solly',
            'Peter', 'England', 'Arrow', 'Van', 'Heusen',
            'Blackberry', 'Louis', 'Philippe', 'US', 'Polo',
            'Raymond', 'Park', 'Avenue', 'Wrangler', 'Lee'
        ]
        
        # 颜色映射（转换为中文）
        self.color_mapping = {
            'Navy Blue': '深蓝色',
            'Blue': '蓝色',
            'Black': '黑色',
            'White': '白色',
            'Grey': '灰色',
            'Gray': '灰色',
            'Red': '红色',
            'Pink': '粉色',
            'Green': '绿色',
            'Yellow': '黄色',
            'Orange': '橙色',
            'Purple': '紫色',
            'Brown': '棕色',
            'Beige': '米色',
            'Cream': '米色',
            'Off White': '米白色',
            'Maroon': '酒红色',
            'Burgundy': '酒红色',
            'Olive': '橄榄绿',
            'Teal': '青色',
            'Turquoise': '青色',
            'Silver': '银色',
            'Gold': '金色',
            'Multicolor': '多色',
            'Print': '印花',
            'Pattern': '图案',
        }
        
        # 风格列表
        self.styles = [
            '休闲', '运动', '商务', '时尚', '复古', '简约',
            '潮流', '经典', '舒适', '修身', '宽松', '百搭'
        ]
        
        # 店铺类型
        self.store_types = ['flagship', 'official', 'third_party']
    
    def _extract_brand(self, display_name: str) -> str:
        """从productDisplayName提取品牌（首词）"""
        if not display_name:
            return random.choice(self.brands)
        
        # 按空格分割，取第一个词作为品牌
        parts = display_name.split()
        if parts:
            brand = parts[0].strip()
            # 如果首词看起来像品牌，返回它
            if len(brand) >= 2 and len(brand) <= 15:
                return brand
        
        return random.choice(self.brands)
    
    def _map_category(self, master_category: str) -> str:
        """映射类目到项目类别"""
        if not master_category:
            return '其他'
        
        mc = master_category.strip().capitalize()
        for key, value in self.category_mapping.items():
            if key.lower() in mc.lower():
                return value
        return '其他'
    
    def _map_color(self, base_color: str) -> str:
        """映射颜色到中文"""
        if not base_color:
            return random.choice(list(self.color_mapping.values()))
        
        bc = base_color.strip()
        return self.color_mapping.get(bc, bc)
    
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
        article_type = row.get('articleType')
        if article_type:
            features.append(f"{article_type}")
        
        # 添加通用特征
        feature_pool = [
            '品质保证', '正品保障', '七天无理由', '运费险',
            '极速发货', '官方授权', '品牌直营', '精选好货'
        ]
        features.extend(random.sample(feature_pool, min(2, len(feature_pool))))
        
        return features[:5]
    
    def convert(self, csv_path: str, images_dir: str) -> List[Dict]:
        """转换Myntra数据集"""
        products = []
        images_path = Path(images_dir)
        
        with open(csv_path, 'r', encoding='utf-8', errors='ignore') as f:
            reader = csv.DictReader(f)
            for row in reader:
                # 获取ID
                item_id = row.get('id', '')
                if not item_id:
                    continue
                
                # 检查图片是否存在
                image_filename = f"{item_id}.jpg"
                image_path = images_path / image_filename
                if not image_path.exists():
                    # 如果图片不存在，使用占位图
                    image_url = f"https://picsum.photos/seed/myntra{item_id}/300/300"
                else:
                    # 使用本地图片路径（相对路径）
                    image_url = f"/images/myntra/{image_filename}"
                
                # 映射类目
                category = self._map_category(row.get('masterCategory', ''))
                prices = self._generate_price(category)
                
                # 提取品牌
                display_name = row.get('productDisplayName', '')
                brand = self._extract_brand(display_name)
                
                # 映射颜色
                color = self._map_color(row.get('baseColour', ''))
                
                # 构建tags列表（包含season季节标签）
                tags = []
                season = row.get('season')
                if season:
                    tags.append(f"{season}")
                if random.random() > 0.3:
                    tags.append('官方')
                
                # 生成商品数据
                product = {
                    'id': f"MYN{item_id.zfill(6)}",
                    'name': display_name.strip() if display_name else f'商品{item_id}',
                    'category': category,
                    'subcategory': row.get('subCategory', row.get('articleType', '')).strip(),
                    'brand': brand,
                    'color': color,
                    'style': row.get('usage', random.choice(self.styles)).strip(),
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
                    'tags': tags,
                    'image_url': image_url
                }
                
                products.append(product)
        
        print(f"已转换 {len(products)} 条记录")
        return products
    
    def save_to_json(self, products: List[Dict], output_path: str):
        """保存为JSON文件"""
        output_dir = Path(output_path).parent
        output_dir.mkdir(parents=True, exist_ok=True)
        
        with open(output_path, 'w', encoding='utf-8') as f:
            json.dump(products, f, ensure_ascii=False, indent=2)
        
        print(f"已保存 {len(products)} 条商品数据到 {output_path}")


def main():
    converter = MyntraDataConverter()
    
    # 输入路径
    csv_path = 'dataset/myntradataset/styles.csv'
    images_dir = 'dataset/myntradataset/images'
    output_path = 'backend/data/myntra_products.json'
    
    # 检查输入文件
    print("=== Myntra数据集转换器 ===")
    print(f"输入CSV: {csv_path}")
    print(f"图片目录: {images_dir}")
    print(f"输出路径: {output_path}")
    
    csv_exists = Path(csv_path).exists()
    images_exists = Path(images_dir).exists()
    
    if not csv_exists:
        print(f"错误：CSV文件不存在: {csv_path}")
        return
    
    if not images_exists:
        print(f"警告：图片目录不存在: {images_dir}，将使用占位图片")
    
    # 执行转换
    print("\n开始转换...")
    products = converter.convert(csv_path, images_dir)
    
    # 保存
    converter.save_to_json(products, output_path)
    
    print("\n=== 转换完成 ===")


if __name__ == "__main__":
    main()
