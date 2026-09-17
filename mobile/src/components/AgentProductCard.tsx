import ActionButton from './ActionButton';
import { colors, fonts } from '../theme';
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
          <ActionButton icon="detail" label="详情" onPress={onDetail} />
          <ActionButton icon={selected ? 'check' : 'compare'} label={selected ? '取消对比' : '加入对比'} selected={selected} onPress={onToggle} />
          <ActionButton icon="cart" label="加购" primary onPress={onAdd} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { width: 260, marginRight: 12, borderRadius: 3, overflow: 'hidden', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.rule },
  selected: { borderColor: colors.ink, borderWidth: 2 },
  image: { width: '100%', height: 132, backgroundColor: colors.wash },
  placeholder: { alignItems: 'center', justifyContent: 'center' },
  placeholderText: { color: colors.muted, fontWeight: '800' },
  body: { padding: 13 },
  brand: { color: colors.ink, fontSize: 11, fontWeight: '800', textTransform: 'uppercase' },
  title: { fontFamily: fonts.editorial, color: colors.ink, fontSize: 15, lineHeight: 21, fontWeight: '800', marginTop: 4, minHeight: 42 },
  price: { color: colors.error, fontSize: 20, fontWeight: '900', marginTop: 8 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginTop: 12 },
  link: { color: colors.muted, fontSize: 12, fontWeight: '700' },
  add: { marginLeft: 'auto', backgroundColor: colors.ink, borderRadius: 3, paddingHorizontal: 12, paddingVertical: 7 },
  addText: { color: colors.surface, fontSize: 12, fontWeight: '800' },
});
