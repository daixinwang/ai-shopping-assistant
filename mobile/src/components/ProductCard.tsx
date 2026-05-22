import React from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import { ProductItem } from '../api/client';

interface Props { product: ProductItem; }

export default function ProductCard({ product }: Props) {
  const { name, brand, min_price, platform_prices, rating, store_type, tags, image_url } = product;

  return (
    <View style={styles.card}>
      <Image source={{ uri: image_url }} style={styles.image} resizeMode="cover" />
      <View style={styles.info}>
        <Text style={styles.name} numberOfLines={2}>{name}</Text>
        <Text style={styles.brand}>{brand}</Text>
        <View style={styles.priceRow}>
          <Text style={styles.price}>¥{min_price.toFixed(0)}</Text>
          <Text style={styles.rating}>⭐ {rating.toFixed(1)}</Text>
        </View>
        <View style={styles.platforms}>
          {platform_prices.tmall && <Text style={styles.platformTag}>天猫¥{platform_prices.tmall}</Text>}
          {platform_prices.jd && <Text style={styles.platformTag}>京东¥{platform_prices.jd}</Text>}
          {platform_prices.pdd && <Text style={styles.platformTag}>拼多多¥{platform_prices.pdd}</Text>}
        </View>
        <View style={styles.tagRow}>
          {tags.slice(0, 2).map((t, i) => (
            <View key={i} style={styles.tag}><Text style={styles.tagText}>{t}</Text></View>
          ))}
          {store_type === 'flagship' && <View style={styles.flagshipTag}><Text style={styles.flagshipText}>旗舰</Text></View>}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', backgroundColor: '#fff', borderRadius: 12, marginBottom: 12, overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 4, elevation: 2 },
  image: { width: 110, height: 110 },
  info: { flex: 1, padding: 10 },
  name: { fontSize: 13, color: '#333', fontWeight: '600', lineHeight: 18 },
  brand: { fontSize: 12, color: '#999', marginTop: 2 },
  priceRow: { flexDirection: 'row', alignItems: 'center', marginTop: 6 },
  price: { fontSize: 18, fontWeight: '800', color: '#FF4444' },
  rating: { fontSize: 12, color: '#666', marginLeft: 8 },
  platforms: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 4 },
  platformTag: { fontSize: 10, color: '#666', backgroundColor: '#f0f0f0', borderRadius: 4, paddingHorizontal: 4, paddingVertical: 2 },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 4 },
  tag: { backgroundColor: '#f0f5ff', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  tagText: { fontSize: 10, color: '#007AFF' },
  flagshipTag: { backgroundColor: '#FF4444', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  flagshipText: { fontSize: 10, color: '#fff', fontWeight: '600' },
});
