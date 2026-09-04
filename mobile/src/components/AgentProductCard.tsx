import React from 'react';
import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { AgentProduct } from '../api/client';

interface Props {
  product: AgentProduct;
  selected: boolean;
  onToggle: () => void;
  onDetail: () => void;
  onAdd: () => void;
}

export default function AgentProductCard({ product, selected, onToggle, onDetail, onAdd }: Props) {
  return (
    <View style={[styles.card, selected && styles.selected]}>
      {product.imageUrl
        ? <Image source={{ uri: product.imageUrl }} style={styles.image} />
        : <View style={[styles.image, styles.placeholder]}><Text style={styles.placeholderText}>商品</Text></View>}
      <View style={styles.body}>
        <Text style={styles.brand}>{product.brand || product.category}</Text>
        <Text style={styles.title} numberOfLines={2}>{product.title}</Text>
        <Text style={styles.price}>{product.priceDisplay}</Text>
        <View style={styles.actions}>
          <TouchableOpacity onPress={onDetail}><Text style={styles.link}>详情</Text></TouchableOpacity>
          <TouchableOpacity onPress={onToggle}><Text style={styles.link}>{selected ? '取消对比' : '加入对比'}</Text></TouchableOpacity>
          <TouchableOpacity style={styles.add} onPress={onAdd}><Text style={styles.addText}>加购</Text></TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { width: 260, marginRight: 12, borderRadius: 18, overflow: 'hidden', backgroundColor: '#FFF', borderWidth: 1, borderColor: '#E5E7EB' },
  selected: { borderColor: '#2563EB', borderWidth: 2 },
  image: { width: '100%', height: 132, backgroundColor: '#EEF2F7' },
  placeholder: { alignItems: 'center', justifyContent: 'center' },
  placeholderText: { color: '#94A3B8', fontWeight: '800' },
  body: { padding: 13 },
  brand: { color: '#2563EB', fontSize: 11, fontWeight: '800', textTransform: 'uppercase' },
  title: { color: '#111827', fontSize: 15, lineHeight: 21, fontWeight: '800', marginTop: 4, minHeight: 42 },
  price: { color: '#DC2626', fontSize: 20, fontWeight: '900', marginTop: 8 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 13, marginTop: 12 },
  link: { color: '#475569', fontSize: 12, fontWeight: '700' },
  add: { marginLeft: 'auto', backgroundColor: '#111827', borderRadius: 13, paddingHorizontal: 12, paddingVertical: 7 },
  addText: { color: '#FFF', fontSize: 12, fontWeight: '800' },
});
