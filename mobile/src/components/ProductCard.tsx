import React from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import { ProductItem } from '../api/client';

interface Props { product: ProductItem; }

const platformLabels: Record<string, string> = {
  tmall: '天猫',
  jd: '京东',
  pdd: '拼多多',
};

export default function ProductCard({ product }: Props) {
  const { name, brand, min_price, platform_prices, rating, store_type, tags, image_url, sales } = product;
  const prices = Object.entries(platform_prices).filter(([, value]) => typeof value === 'number') as Array<[string, number]>;
  const avgPrice = prices.length > 0
    ? prices.reduce((sum, [, price]) => sum + price, 0) / prices.length
    : min_price;

  return (
    <View style={styles.card}>
      <Image source={{ uri: image_url }} style={styles.image} resizeMode="cover" />
      <View style={styles.info}>
        <Text style={styles.name} numberOfLines={2}>{name}</Text>
        <Text style={styles.brand}>{brand}</Text>
        <View style={styles.priceRow}>
          <Text style={styles.price}>¥{min_price.toFixed(0)}</Text>
          <Text style={styles.avgPrice}>平台均价 ¥{avgPrice.toFixed(0)}</Text>
        </View>
        <Text style={styles.meta}>评分 {rating.toFixed(1)} · 销量 {sales.toLocaleString()}</Text>
        <View style={styles.platforms}>
          {prices.map(([platform, price]) => (
            <Text key={platform} style={styles.platformTag}>{platformLabels[platform] ?? platform} ¥{price.toFixed(0)}</Text>
          ))}
        </View>
        <View style={styles.tagRow}>
          {tags.slice(0, 2).map((t, i) => (
            <View key={i} style={styles.tag}><Text style={styles.tagText}>{t}</Text></View>
          ))}
          {store_type === 'flagship' && <View style={styles.flagshipTag}><Text style={styles.flagshipText}>旗舰</Text></View>}
          {store_type === 'official' && <View style={styles.officialTag}><Text style={styles.officialText}>官方</Text></View>}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', backgroundColor: '#fff', borderRadius: 10, marginBottom: 12, overflow: 'hidden', borderWidth: 1, borderColor: '#E5E7EB' },
  image: { width: 116, height: 128, backgroundColor: '#E5E7EB' },
  info: { flex: 1, padding: 10 },
  name: { fontSize: 14, color: '#111827', fontWeight: '700', lineHeight: 19 },
  brand: { fontSize: 12, color: '#6B7280', marginTop: 3 },
  priceRow: { flexDirection: 'row', alignItems: 'baseline', marginTop: 7 },
  price: { fontSize: 20, fontWeight: '900', color: '#DC2626' },
  avgPrice: { fontSize: 11, color: '#6B7280', marginLeft: 8 },
  meta: { fontSize: 12, color: '#4B5563', marginTop: 4 },
  platforms: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 6 },
  platformTag: { fontSize: 10, color: '#374151', backgroundColor: '#F3F4F6', borderRadius: 4, paddingHorizontal: 5, paddingVertical: 3 },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 6 },
  tag: { backgroundColor: '#EFF6FF', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 3 },
  tagText: { fontSize: 10, color: '#2563EB', fontWeight: '600' },
  flagshipTag: { backgroundColor: '#DC2626', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 3 },
  flagshipText: { fontSize: 10, color: '#fff', fontWeight: '700' },
  officialTag: { backgroundColor: '#059669', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 3 },
  officialText: { fontSize: 10, color: '#fff', fontWeight: '700' },
});
