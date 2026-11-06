import React from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { AgentProduct } from '../api/client';
import Icon from './Icon';
import { LogoMark, PriceTag } from './Brand';
import { colors, radii, text } from '../theme';

interface Props {
  product: AgentProduct;
  reason?: string;
  writing?: boolean;
  selected: boolean;
  onToggleCompare: () => void;
  onOpen: () => void;
  onAdd: () => void;
}

// The card is a plain container: opening the detail, toggling compare and adding to the
// cart are sibling controls, because nested buttons are invalid on the web.
export default function AgentProductCard({ product, reason, writing, selected, onToggleCompare, onOpen, onAdd }: Props) {
  const meta = [product.brand, product.subCategory].filter(Boolean).join(' · ');
  return (
    <View style={[styles.card, selected && styles.cardSelected]}>
      <Pressable onPress={onOpen} accessibilityRole="button" accessibilityLabel={`${product.title}，${product.priceDisplay}，查看详情`}
        style={({ pressed }) => pressed && { opacity: 0.9 }}>
        <View style={styles.media}>
          {product.imageUrl
            ? <Image source={{ uri: product.imageUrl }} style={styles.image} resizeMode="contain" accessibilityIgnoresInvertColors />
            : <View style={styles.placeholder}><LogoMark size={40} tagColor={colors.wash} /><Text style={text.micro}>暂无图片</Text></View>}
        </View>
        <View style={styles.head}>
          {!!meta && <Text style={styles.meta} numberOfLines={1}>{meta}</Text>}
          <Text style={styles.title} numberOfLines={2}>{product.title}</Text>
        </View>
      </Pressable>
      <Pressable onPress={onToggleCompare} hitSlop={8} accessibilityRole="checkbox"
        accessibilityState={{ checked: selected }} accessibilityLabel={selected ? '移出对比' : '加入对比'}
        style={[styles.compare, selected && styles.compareOn]}>
        {selected ? <Icon name="check" size={14} strokeWidth={3} /> : <Icon name="compare" size={14} color={colors.muted} />}
      </Pressable>
      <View style={styles.body}>
        <View style={styles.priceRow}>
          <PriceTag display={product.priceDisplay} size="sm" />
          <Pressable onPress={onAdd} hitSlop={6} accessibilityRole="button" accessibilityLabel={`把${product.title}加入购物车`}
            style={({ pressed }) => [styles.add, pressed && { opacity: 0.7 }]}>
            <Icon name="plus" size={18} color={colors.surface} strokeWidth={2.4} />
          </Pressable>
        </View>
        {reason
          ? <Text style={styles.reason} numberOfLines={3}>{reason}</Text>
          : writing && <View style={styles.skeleton}><View style={styles.line} /><View style={[styles.line, { width: '62%' }]} /></View>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: 196, marginRight: 12, borderRadius: radii.md, backgroundColor: colors.surface,
    borderWidth: 1, borderColor: colors.rule, overflow: 'hidden',
  },
  cardSelected: { borderColor: colors.ink, borderWidth: 2 },
  media: { height: 148, backgroundColor: colors.surface, padding: 10 },
  image: { width: '100%', height: '100%' },
  placeholder: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: colors.paper, borderRadius: radii.sm },
  compare: {
    position: 'absolute', top: 8, right: 8, width: 30, height: 30, borderRadius: 15,
    alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.rule,
  },
  compareOn: { backgroundColor: colors.tag, borderColor: colors.ink },
  head: { paddingHorizontal: 12, paddingTop: 2, gap: 6 },
  body: { paddingHorizontal: 12, paddingBottom: 12, paddingTop: 8, gap: 6 },
  meta: { ...text.micro, color: colors.muted },
  title: { fontSize: 14, lineHeight: 20, fontWeight: '700', color: colors.ink, minHeight: 40 },
  priceRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  add: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center' },
  reason: { fontSize: 12.5, lineHeight: 18, color: colors.muted, marginTop: 2 },
  skeleton: { gap: 6, marginTop: 6 },
  line: { height: 8, borderRadius: 4, backgroundColor: colors.wash, width: '92%' },
});
