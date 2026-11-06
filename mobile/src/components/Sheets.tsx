import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import {
  AgentProduct, absoluteAssetUrl, compareAgentProducts, getCart, getProductDetail, mutateCart,
} from '../api/client';
import ActionButton from './ActionButton';
import Icon from './Icon';
import { LogoMark, PriceTag } from './Brand';
import { CompareTable, formatMoney } from './MessageCards';
import { IconButton, Sheet } from './ui';
import {
  CartSnapshot, Comparison, Conversation, cartFromPayload, comparisonFromPayload,
} from '../utils/conversations';
import {
  Picked, defaultPick, matchSku, optionState, pickOption, skuLabel, skusFromDetail,
} from '../utils/sku';
import { colors, fonts, radii, text } from '../theme';

function Loading({ label }: { label: string }) {
  return (
    <View style={styles.center}>
      <ActivityIndicator color={colors.ink} />
      <Text style={text.small}>{label}</Text>
    </View>
  );
}

function Failure({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <View style={styles.center}>
      <Text style={[text.small, { color: colors.error }]}>{message}</Text>
      <ActionButton icon="refresh" label="重新加载" onPress={onRetry} />
    </View>
  );
}

type ChosenSku = { id: string; label: string } | null;

export function ProductSheet({ product, inCompare, onClose, onAdd, onToggleCompare }: {
  product: AgentProduct | null; inCompare: boolean; onClose: () => void;
  onAdd: (sku: ChosenSku) => void; onToggleCompare: () => void;
}) {
  const [detail, setDetail] = useState<any>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [picked, setPicked] = useState<Picked>({});
  useEffect(() => {
    if (!product) return;
    let live = true;
    setDetail(null);
    setError('');
    setPicked({});
    getProductDetail(product.productId)
      .then(value => {
        if (!live) return;
        setDetail(value);
        setPicked(defaultPick(skusFromDetail(value)));
      })
      .catch(err => { if (live) setError(err?.message || '详情加载失败'); });
    return () => { live = false; };
  }, [product?.productId, attempt]);

  const skus = useMemo(() => skusFromDetail(detail), [detail]);
  const sku = matchSku(skus, picked);
  const image = absoluteAssetUrl(detail?.imageURL) || product?.imageUrl;
  const dimensions: { name: string; options: { label: string }[] }[] = detail?.specifications || [];
  const reviews: { id: string; nickname?: string; rating?: number; content: string }[] = (detail?.reviews || []).slice(0, 2);
  const canAdd = !!detail && (skus.length === 0 || (!!sku && sku.inStock));
  const stockNote = !detail ? '' : !sku ? (skus.length ? '请选择完整规格' : '') : sku.inStock ? `库存 ${sku.stock}` : '该规格暂时缺货';
  return (
    <Sheet visible={!!product} title="商品详情" onClose={onClose} footer={product ? (
      <>
        <ActionButton icon={inCompare ? 'check' : 'compare'} label={inCompare ? '已加入对比' : '加入对比'} selected={inCompare} onPress={onToggleCompare} />
        <ActionButton icon="cart" label={sku && !sku.inStock ? '该规格缺货' : '加入购物车'} primary disabled={!canAdd}
          onPress={() => onAdd(sku ? { id: sku.id, label: skuLabel(sku) } : null)} style={{ flex: 1 }} />
      </>
    ) : undefined}>
      {product && (
        <View style={{ gap: 12 }}>
          <View style={styles.hero}>
            {image ? <Image source={{ uri: image }} style={styles.heroImage} resizeMode="contain" /> : <LogoMark size={64} tagColor={colors.wash} />}
          </View>
          <Text style={text.micro}>{[product.brand, product.subCategory || product.category].filter(Boolean).join(' · ')}</Text>
          <Text style={styles.title}>{product.title}</Text>
          <View style={styles.priceRow}>
            <PriceTag display={sku?.priceDisplay || detail?.price?.display || product.priceDisplay} size="lg" holeColor={colors.paper} />
            {!!stockNote && <Text style={[styles.stock, sku && !sku.inStock && { color: colors.error }]}>{stockNote}</Text>}
          </View>
          <View style={styles.verified}>
            <Icon name="verified" size={16} color={colors.success} />
            <Text style={styles.verifiedText}>价格和规格取自商品库，不由模型生成</Text>
          </View>
          {!detail && !error && <Loading label="正在读取商品资料…" />}
          {!!error && <Failure message={error} onRetry={() => setAttempt(value => value + 1)} />}
          {dimensions.length > 0 && (
            <View style={styles.skuBox}>
              <Text style={styles.label}>选择规格</Text>
              {dimensions.map(dim => (
                <View key={dim.name} style={{ gap: 8 }}>
                  <Text style={styles.dimName}>{dim.name}</Text>
                  <View style={styles.wrap}>
                    {dim.options.map(option => {
                      const state = optionState(skus, picked, dim.name, option.label);
                      const selected = picked[dim.name] === option.label;
                      return (
                        <Pressable key={option.label} onPress={() => setPicked(current => pickOption(skus, current, dim.name, option.label))}
                          accessibilityRole="button" accessibilityState={{ selected }}
                          accessibilityLabel={`${dim.name}：${option.label}${state === 'soldout' ? '，缺货' : ''}`}
                          style={({ pressed }) => [styles.option, selected && styles.optionOn,
                            state === 'missing' && !selected && styles.optionMissing,
                            state === 'soldout' && !selected && styles.optionSoldout, pressed && { opacity: 0.7 }]}>
                          <Text style={[styles.optionText, state === 'soldout' && styles.optionTextSoldout]}>{option.label}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              ))}
            </View>
          )}
          {!!detail?.summary && <Text style={text.body}>{detail.summary}</Text>}
          {reviews.length > 0 && <Text style={styles.label}>用户评价</Text>}
          {reviews.map(review => (
            <View key={review.id} style={styles.review}>
              <Text style={styles.reviewHead}>{review.nickname || '用户'} · {'★'.repeat(Math.max(0, Math.min(5, Math.round(review.rating || 0))))}</Text>
              <Text style={text.small} numberOfLines={4}>{review.content}</Text>
            </View>
          ))}
        </View>
      )}
    </Sheet>
  );
}

export function CompareSheet({ productIds, visible, onClose, onClear }: {
  productIds: string[]; visible: boolean; onClose: () => void; onClear: () => void;
}) {
  const [comparison, setComparison] = useState<Comparison | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const key = productIds.join(',');
  useEffect(() => {
    if (!visible) return;
    let live = true;
    setComparison(null);
    setError('');
    compareAgentProducts(productIds)
      .then(value => { if (live) setComparison(comparisonFromPayload(value)); })
      .catch(err => { if (live) setError(err?.message || '对比失败'); });
    return () => { live = false; };
  }, [visible, key, attempt]);
  return (
    <Sheet visible={visible} title={`对比 ${productIds.length} 款`} onClose={onClose}
      footer={<ActionButton icon="trash" label="清空对比" onPress={() => { onClear(); onClose(); }} style={{ flex: 1 }} />}>
      {!comparison && !error && <Loading label="正在整理差异…" />}
      {!!error && <Failure message={error} onRetry={() => setAttempt(value => value + 1)} />}
      {comparison && <CompareTable comparison={comparison} />}
      {comparison && <Text style={[text.small, { marginTop: 10 }]}>黄色标出的是该项更优的一款；文字类参数只列事实，不替你下结论。</Text>}
    </Sheet>
  );
}

export function CartSheet({ visible, onClose, onCheckout, onCount }: {
  visible: boolean; onClose: () => void; onCheckout: () => void; onCount: (count: number) => void;
}) {
  const [cart, setCart] = useState<CartSnapshot | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const accept = (body: any) => {
    const next = cartFromPayload(body?.cart);
    setCart(next);
    if (next) onCount(next.itemCount);
  };
  useEffect(() => {
    if (!visible) return;
    setError('');
    getCart().then(accept).catch(err => setError(err?.message || '购物车加载失败'));
  }, [visible, attempt]);
  const change = async (payload: Record<string, unknown>) => {
    if (busy) return;
    setBusy(true);
    try { accept(await mutateCart(payload)); } catch (err: any) { setError(err?.message || '操作失败'); } finally { setBusy(false); }
  };
  const empty = cart && cart.lines.length === 0;
  return (
    <Sheet visible={visible} title="购物车" onClose={onClose} footer={cart && !empty ? (
      <>
        <View style={{ flex: 1, justifyContent: 'center' }}>
          <Text style={text.micro}>合计 {cart.itemCount} 件</Text>
          <Text style={styles.total}>{formatMoney(cart.total)}</Text>
        </View>
        <ActionButton icon="receipt" label="去结算" primary disabled={busy} onPress={onCheckout} />
      </>
    ) : undefined}>
      {!cart && !error && <Loading label="正在读取购物车…" />}
      {!!error && <Failure message={error} onRetry={() => setAttempt(value => value + 1)} />}
      {empty && (
        <View style={styles.center}>
          <Icon name="receipt" size={40} color={colors.faint} />
          <Text style={text.title}>购物车还是空的</Text>
          <Text style={text.small}>在推荐卡片上点「+」，或者对导购说「把第一个加入购物车」。</Text>
          <ActionButton icon="search" label="去挑几件" onPress={onClose} />
        </View>
      )}
      {cart?.lines.map(line => (
        <View key={line.cartItemId} style={styles.cartLine}>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={styles.lineTitle} numberOfLines={2}>{line.title}</Text>
            <Text style={text.small} numberOfLines={1}>{Object.values(line.options || {}).join(' / ') || '默认规格'}</Text>
            <Text style={styles.lineMoney}>{formatMoney(line.subtotal)}</Text>
          </View>
          <View style={styles.stepper}>
            <IconButton icon={line.quantity > 1 ? 'minus' : 'trash'} label={line.quantity > 1 ? '减少一件' : '移出购物车'} disabled={busy}
              onPress={() => change(line.quantity > 1
                ? { action: 'updateQuantity', cartItemID: String(line.cartItemId), quantity: line.quantity - 1 }
                : { action: 'remove', cartItemID: String(line.cartItemId) })} />
            <Text style={styles.qty}>{line.quantity}</Text>
            <IconButton icon="plus" label="增加一件" disabled={busy}
              onPress={() => change({ action: 'updateQuantity', cartItemID: String(line.cartItemId), quantity: line.quantity + 1 })} />
          </View>
        </View>
      ))}
      {cart && !empty && <Text style={[text.small, { marginTop: 12 }]}>去结算会先生成订单预览，你确认后才会提交。</Text>}
    </Sheet>
  );
}

function shortTime(timestamp: number) {
  const date = new Date(timestamp);
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return date.toDateString() === now.toDateString()
    ? `${pad(date.getHours())}:${pad(date.getMinutes())}`
    : `${date.getMonth() + 1}月${date.getDate()}日`;
}

export function HistorySheet({ visible, conversations, activeId, onClose, onSelect, onNew }: {
  visible: boolean; conversations: Conversation[]; activeId: string; onClose: () => void;
  onSelect: (id: string) => void; onNew: () => void;
}) {
  const sorted = [...conversations].sort((a, b) => b.updatedAt - a.updatedAt);
  return (
    <Sheet visible={visible} title="会话记录" onClose={onClose}
      footer={<ActionButton icon="plus" label="开始新对话" primary onPress={onNew} style={{ flex: 1 }} />}>
      <Text style={[text.small, { marginBottom: 8 }]}>保存在这台设备上，选一个继续聊。</Text>
      {sorted.map(item => {
        const asked = item.messages.filter(message => message.role === 'user').length;
        const active = item.id === activeId;
        return (
          <Pressable key={item.id} onPress={() => onSelect(item.id)} accessibilityRole="button"
            accessibilityState={{ selected: active }} accessibilityLabel={`打开会话：${item.title}`}
            style={({ pressed }) => [styles.history, active && styles.historyActive, pressed && { opacity: 0.8 }]}>
            <Icon name={active ? 'check' : 'chat'} color={colors.ink} />
            <View style={{ flex: 1 }}>
              <Text style={styles.lineTitle} numberOfLines={1}>{item.title}</Text>
              <Text style={text.small}>{asked} 条提问 · {shortTime(item.updatedAt)}</Text>
            </View>
            <Icon name="chevronRight" color={colors.faint} />
          </Pressable>
        );
      })}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center', gap: 12, paddingVertical: 28 },
  hero: { height: 220, borderRadius: radii.md, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', padding: 16 },
  heroImage: { width: '100%', height: '100%' },
  title: { fontSize: 18, lineHeight: 26, fontWeight: '800', color: colors.ink },
  verified: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  verifiedText: { fontSize: 12, color: colors.success, fontWeight: '600' },
  label: { fontSize: 13, fontWeight: '700', color: colors.ink, marginTop: 4 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: 12, flexWrap: 'wrap' },
  stock: { fontFamily: fonts.mono, fontSize: 12, color: colors.muted },
  skuBox: { gap: 12, padding: 14, borderRadius: radii.md, backgroundColor: colors.surface },
  dimName: { fontSize: 12, fontWeight: '600', color: colors.muted },
  option: {
    minHeight: 36, justifyContent: 'center', paddingHorizontal: 14, borderRadius: radii.sm,
    borderWidth: 1, borderColor: colors.rule, backgroundColor: colors.paper,
  },
  optionOn: { borderWidth: 2, paddingHorizontal: 13, borderColor: colors.ink, backgroundColor: colors.tag },
  optionMissing: { borderStyle: 'dashed', borderColor: colors.faint },
  optionSoldout: { opacity: 0.45 },
  optionText: { fontSize: 13, fontWeight: '600', color: colors.ink },
  optionTextSoldout: { textDecorationLine: 'line-through' },
  review: { padding: 12, borderRadius: radii.sm, backgroundColor: colors.surface, gap: 4 },
  reviewHead: { fontSize: 12, fontWeight: '700', color: colors.ink },
  total: { fontFamily: fonts.mono, fontSize: 22, fontWeight: '800', color: colors.ink },
  cartLine: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderColor: colors.rule },
  lineTitle: { fontSize: 14, fontWeight: '700', color: colors.ink },
  lineMoney: { fontFamily: fonts.mono, fontSize: 14, fontWeight: '700', color: colors.ink, marginTop: 2 },
  stepper: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: radii.pill, borderWidth: 1, borderColor: colors.rule },
  qty: { fontFamily: fonts.mono, fontWeight: '800', minWidth: 22, textAlign: 'center', color: colors.ink },
  history: {
    flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, marginBottom: 8,
    borderRadius: radii.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.rule,
  },
  historyActive: { borderColor: colors.ink, borderWidth: 2 },
});
