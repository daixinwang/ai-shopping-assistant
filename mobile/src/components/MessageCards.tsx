import React, { ReactNode, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import ActionButton from './ActionButton';
import { Chip } from './ui';
import type { CartLine, CartSnapshot, CheckoutPreview, Comparison, PlacedOrder } from '../utils/conversations';
import { colors, fonts, radii, text } from '../theme';

export const formatMoney = (value: number) => `¥${Number.isInteger(value) ? value : value.toFixed(2)}`;

const TEETH = 22;
function zigzag(pointingUp: boolean) {
  const step = 100 / TEETH;
  let d = pointingUp ? 'M0 8' : 'M0 0';
  for (let i = 0; i < TEETH; i += 1) {
    d += pointingUp ? ` L${(i + 0.5) * step} 0 L${(i + 1) * step} 8` : ` L${(i + 0.5) * step} 8 L${(i + 1) * step} 0`;
  }
  return `${d} Z`;
}
const TOP_EDGE = zigzag(true);
const BOTTOM_EDGE = zigzag(false);

/** Paper-receipt frame: perforated edges, used wherever money is about to change hands. */
function Receipt({ children, label }: { children: ReactNode; label: string }) {
  return (
    <View style={styles.receipt}>
      <Svg width="100%" height={8} viewBox="0 0 100 8" preserveAspectRatio="none">
        <Path d={TOP_EDGE} fill={colors.surface} />
      </Svg>
      <View style={styles.receiptBody}>
        <Text style={text.micro}>{label}</Text>
        {children}
      </View>
      <Svg width="100%" height={8} viewBox="0 0 100 8" preserveAspectRatio="none">
        <Path d={BOTTOM_EDGE} fill={colors.surface} />
      </Svg>
    </View>
  );
}

function Lines({ lines }: { lines: CartLine[] }) {
  return (
    <View style={{ gap: 10, marginTop: 10 }}>
      {lines.map(line => {
        const options = Object.values(line.options || {}).filter(Boolean).join(' / ');
        return (
          <View key={`${line.cartItemId}-${line.skuId}`} style={styles.line}>
            <View style={{ flex: 1 }}>
              <Text style={styles.lineTitle} numberOfLines={1}>{line.title}</Text>
              <Text style={styles.lineMeta} numberOfLines={1}>{options ? `${options} · ` : ''}×{line.quantity}</Text>
            </View>
            <Text style={styles.lineMoney}>{formatMoney(line.subtotal)}</Text>
          </View>
        );
      })}
    </View>
  );
}

function Total({ count, total }: { count: number; total: number }) {
  return (
    <>
      <View style={styles.dashed} />
      <View style={styles.totalRow}>
        <Text style={styles.totalLabel}>合计 {count} 件</Text>
        <Text style={styles.totalMoney}>{formatMoney(total)}</Text>
      </View>
    </>
  );
}

export function CheckoutCard({ preview, active, disabled, onConfirm, onCancel }: {
  preview: CheckoutPreview; active: boolean; disabled?: boolean; onConfirm: () => void; onCancel: () => void;
}) {
  return (
    <Receipt label={active ? 'ORDER PREVIEW · 待你确认' : 'ORDER PREVIEW · 已处理'}>
      <Lines lines={preview.lines} />
      <Total count={preview.itemCount} total={preview.total} />
      <Text style={styles.address}><Text style={styles.addressLabel}>寄往  </Text>{preview.address}</Text>
      {active ? (
        <View style={styles.actions}>
          <ActionButton icon="check" label="确认下单" primary disabled={disabled} onPress={onConfirm} style={{ flex: 1 }} />
          <ActionButton icon="undo" label="再想想" disabled={disabled} onPress={onCancel} />
        </View>
      ) : (
        <Text style={styles.note}>这份确认已处理，以对话里最新的结果为准。</Text>
      )}
      <Text style={styles.note}>由你确认后才会提交，助手不会替你下单。</Text>
    </Receipt>
  );
}

export function OrderCard({ order }: { order: PlacedOrder }) {
  return (
    <Receipt label="ORDER · 已提交">
      <View style={styles.stamp} accessible accessibilityLabel="已下单">
        <Text style={styles.stampText}>已下单</Text>
      </View>
      <Text style={styles.orderId} selectable>订单号 {order.orderId}</Text>
      <Lines lines={order.lines} />
      <Total count={order.itemCount} total={order.total} />
      <Text style={styles.address}><Text style={styles.addressLabel}>寄往  </Text>{order.address}</Text>
    </Receipt>
  );
}

export function CartSummary({ cart }: { cart: CartSnapshot }) {
  return (
    <Receipt label="CART · 购物车">
      <Lines lines={cart.lines} />
      <Total count={cart.itemCount} total={cart.total} />
    </Receipt>
  );
}

export function SpecCard({ title, dimensions, active, onPick }: {
  title: string; dimensions: { name: string; values: string[] }[]; active: boolean; onPick: (value: string) => void;
}) {
  // One dimension: a tap answers. Several: pick one value per row, then confirm once,
  // like the SKU picker of a shopping app (the backend narrows on the combined answer).
  const [picked, setPicked] = useState<Record<string, string>>({});
  const single = dimensions.length <= 1;
  const missing = dimensions.filter(dim => !picked[dim.name]).length;
  const choose = (name: string, value: string) => {
    if (single) onPick(value);
    else setPicked(current => ({ ...current, [name]: current[name] === value ? '' : value }));
  };
  return (
    <View style={styles.panel}>
      <Text style={text.micro}>选择规格</Text>
      <Text style={styles.panelTitle} numberOfLines={2}>{title}</Text>
      {dimensions.map(dim => (
        <View key={dim.name} style={{ gap: 8, marginTop: 10 }}>
          <Text style={styles.dimName}>{dim.name}{picked[dim.name] ? `：${picked[dim.name]}` : ''}</Text>
          <View style={styles.wrap}>
            {dim.values.map(value => (
              <Chip key={value} label={value} disabled={!active} selected={single ? undefined : picked[dim.name] === value}
                onPress={() => choose(dim.name, value)} />
            ))}
          </View>
        </View>
      ))}
      {!single && active && (
        <View style={styles.actions}>
          <ActionButton icon="cart" label={missing ? `还差 ${missing} 项没选` : '就要这个规格'} primary disabled={missing > 0}
            onPress={() => onPick(dimensions.map(dim => picked[dim.name]).join(' '))} style={{ flex: 1 }} />
        </View>
      )}
    </View>
  );
}

export function ChoicesCard({ options, active, onPick }: {
  options: { label: string; reply: string }[]; active: boolean; onPick: (reply: string) => void;
}) {
  return (
    <View style={styles.panel}>
      <Text style={text.micro}>选一款</Text>
      {options.map((option, index) => (
        <Pressable key={option.reply} disabled={!active} onPress={() => onPick(option.reply)} accessibilityRole="button"
          accessibilityLabel={`选择第 ${index + 1} 款：${option.label}`}
          style={({ pressed }) => [styles.choice, pressed && { backgroundColor: colors.wash }, !active && { opacity: 0.5 }]}>
          <Text style={styles.choiceIndex}>{index + 1}</Text>
          <Text style={styles.choiceLabel} numberOfLines={2}>{option.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

export function CompareTable({ comparison }: { comparison: Comparison }) {
  const columns = comparison.products;
  return (
    <View style={styles.panel}>
      <Text style={text.micro}>COMPARE · 对比</Text>
      <View style={[styles.row, { borderTopWidth: 0 }]}>
        <View style={styles.labelCell} />
        {columns.map(product => (
          <View key={product.productId} style={styles.headCell}>
            {product.imageUrl ? <Image source={{ uri: product.imageUrl }} style={styles.thumb} resizeMode="contain" /> : null}
            <Text style={styles.headTitle} numberOfLines={2}>{product.title}</Text>
          </View>
        ))}
      </View>
      {comparison.rows.map(row => (
        <View key={row.label} style={styles.row}>
          <Text style={[styles.labelCell, styles.rowLabel]}>{row.label}</Text>
          {row.values.map((value, index) => (
            <View key={index} style={[styles.valueCell, row.highlight === index && styles.best]}>
              <Text style={[styles.value, row.label === '价格' && { fontFamily: fonts.mono, fontWeight: '700' }]}>{value}</Text>
            </View>
          ))}
        </View>
      ))}
      {!!comparison.missing?.length && (
        <Text style={styles.missing}>{comparison.missing.join('、')}：商品库里暂无数据，未列出。</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  receipt: { marginTop: 12, maxWidth: 440 },
  receiptBody: { backgroundColor: colors.surface, paddingHorizontal: 18, paddingVertical: 10 },
  line: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  lineTitle: { fontSize: 14, fontWeight: '600', color: colors.ink },
  lineMeta: { fontSize: 12, color: colors.muted, marginTop: 2 },
  lineMoney: { fontFamily: fonts.mono, fontSize: 14, fontWeight: '700', color: colors.ink },
  dashed: { borderTopWidth: 1, borderStyle: 'dashed', borderColor: colors.faint, marginTop: 14, marginBottom: 10 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  totalLabel: { fontSize: 13, color: colors.muted, fontWeight: '600' },
  totalMoney: { fontFamily: fonts.mono, fontSize: 22, fontWeight: '800', color: colors.ink },
  address: { fontSize: 12, lineHeight: 18, color: colors.muted, marginTop: 8 },
  addressLabel: { color: colors.ink, fontWeight: '700' },
  actions: { flexDirection: 'row', gap: 10, marginTop: 14 },
  note: { fontSize: 11, color: colors.faint, marginTop: 10 },
  orderId: { fontFamily: fonts.mono, fontSize: 13, color: colors.ink, marginTop: 6 },
  stamp: {
    position: 'absolute', right: 16, top: 6, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 2,
    borderColor: colors.success, borderRadius: radii.sm, transform: [{ rotate: '-8deg' }],
  },
  stampText: { color: colors.success, fontWeight: '900', fontSize: 15, letterSpacing: 2 },
  panel: {
    marginTop: 12, padding: 14, borderRadius: radii.md, backgroundColor: colors.surface,
    borderWidth: 1, borderColor: colors.rule, maxWidth: 560,
  },
  panelTitle: { fontSize: 14, fontWeight: '700', color: colors.ink, marginTop: 4 },
  dimName: { fontSize: 12, color: colors.muted, fontWeight: '600' },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  choice: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, paddingHorizontal: 8, borderRadius: radii.sm },
  choiceIndex: {
    width: 26, height: 26, borderRadius: 13, textAlign: 'center', lineHeight: 26, overflow: 'hidden',
    backgroundColor: colors.tag, color: colors.ink, fontFamily: fonts.mono, fontWeight: '800',
  },
  choiceLabel: { flex: 1, fontSize: 14, color: colors.ink },
  row: { flexDirection: 'row', borderTopWidth: 1, borderColor: colors.rule, paddingVertical: 8, gap: 8 },
  labelCell: { width: 64 },
  rowLabel: { fontSize: 12, color: colors.muted, fontWeight: '600', paddingTop: 4 },
  headCell: { flex: 1, gap: 6 },
  thumb: { width: '100%', height: 64 },
  headTitle: { fontSize: 12, lineHeight: 17, fontWeight: '700', color: colors.ink },
  valueCell: { flex: 1, paddingVertical: 4, paddingHorizontal: 6, borderRadius: 6 },
  best: { backgroundColor: colors.tag },
  value: { fontSize: 13, lineHeight: 18, color: colors.ink },
  missing: { fontSize: 12, lineHeight: 18, color: colors.muted, borderTopWidth: 1, borderColor: colors.rule, paddingTop: 8 },
});
