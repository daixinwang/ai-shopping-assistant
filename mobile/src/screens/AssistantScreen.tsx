import React, { useEffect, useRef, useState } from 'react';
import {
  AppState, KeyboardAvoidingView, NativeScrollEvent, NativeSyntheticEvent, Platform, Pressable, ScrollView,
  StyleSheet, Text, TextInput, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/AppNavigator';
import {
  AgentProduct, DEMO_USER_ID as USER_ID, getCart, getProductDetail, getSuggestions, mutateCart, newRequestId, sendChat,
  undoPreference,
} from '../api/client';
import { skuLabel, skusFromDetail } from '../utils/sku';
import storage from '../utils/storage';
import {
  CONVERSATIONS_KEY, Conversation, ConversationState, LEGACY_CONVERSATIONS_KEY, Message,
  applyStreamEvent, conversationReducer, createConversation, restoreConversations,
} from '../utils/conversations';
import { AssistantMessage, UserBubble } from '../components/ChatMessage';
import { CartSheet, CompareSheet, HistorySheet, ProductSheet } from '../components/Sheets';
import { Chip, IconButton, Toast, ToastState } from '../components/ui';
import { LogoMark } from '../components/Brand';
import Icon from '../components/Icon';
import { colors, noOutline, radii, text } from '../theme';

type Props = {
  route: RouteProp<RootStackParamList, 'Assistant'>;
  navigation: NativeStackNavigationProp<RootStackParamList, 'Assistant'>;
};

const DEFAULT_STARTERS = ['500 元以内的防晒', '推荐通勤降噪耳机', '适合跑步的鞋', '看看购物车'];
const MAX_COMPARE = 3;
const localId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export default function AssistantScreen({ route, navigation }: Props) {
  const [store, setStore] = useState<ConversationState>(() => {
    const first = createConversation(localId('chat'));
    return { activeId: first.id, conversations: [first] };
  });
  const [ready, setReady] = useState(false);
  const [storageError, setStorageError] = useState('');
  const [query, setQuery] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [selected, setSelected] = useState<AgentProduct[]>([]);
  const [cartCount, setCartCount] = useState(0);
  const [productSheet, setProductSheet] = useState<AgentProduct | null>(null);
  const [compareOpen, setCompareOpen] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [starters, setStarters] = useState(DEFAULT_STARTERS);
  const [composerFocused, setComposerFocused] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const stoppedRef = useRef(false);
  const followRef = useRef(true);
  const scrollRef = useRef<ScrollView>(null);
  const consumedParam = useRef<string | null>(null);

  const active = store.conversations.find(item => item.id === store.activeId) ?? store.conversations[0];
  const busy = busyId !== null;
  const selectedIds = selected.map(item => item.productId);
  const lastId = active.messages[active.messages.length - 1]?.id;
  const fresh = !active.messages.some(message => message.role === 'user');

  const showToast = (value: Omit<ToastState, 'id'>) => setToast({ ...value, id: Date.now() });
  const refreshCart = () => getCart()
    .then(body => setCartCount(Number(body?.cart?.item_count) || 0))
    .catch(() => {});

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const raw = await storage.getItem(CONVERSATIONS_KEY);
        const restored = restoreConversations(raw) ?? restoreConversations(await storage.getItem(LEGACY_CONVERSATIONS_KEY));
        if (!live) return;
        if (restored) setStore(restored);
        else if (raw) setStorageError('历史记录无法读取，已为你打开新对话。');
      } catch {
        if (live) setStorageError('无法读取本机历史记录。');
      } finally {
        if (live) setReady(true);
      }
    })();
    refreshCart();
    getSuggestions()
      .then(value => { if (live && value.hot_searches?.length) setStarters([...value.hot_searches.slice(0, 5), '看看购物车']); })
      .catch(() => {});
    return () => { live = false; };
  }, []);

  // The newest state, for writes that cannot wait for the debounce below.
  const latest = useRef({ store, ready });
  latest.current = { store, ready };
  const persistNow = () => {
    if (!latest.current.ready) return;
    storage.setItem(CONVERSATIONS_KEY, JSON.stringify(latest.current.store))
      .catch(() => setStorageError('对话暂未保存到本机，请检查存储空间。'));
  };

  useEffect(() => {
    if (!ready) return;
    // Debounced: streaming changes the store on every token.
    const timer = setTimeout(persistNow, 500);
    return () => clearTimeout(timer);
  }, [store, ready]);

  // Leaving the screen or backgrounding the app cancels the pending debounce; without
  // this write, an answer that just finished would be restored as interrupted.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => { if (state !== 'active') persistNow(); });
    return () => {
      subscription.remove();
      persistNow();
    };
  }, []);

  const patchConversation = (id: string, patch: Partial<Conversation>) =>
    setStore(current => conversationReducer(current, { type: 'update', id, patch }));
  const editMessages = (id: string, edit: (messages: Message[]) => Message[]) => setStore(current => {
    const target = current.conversations.find(item => item.id === id);
    if (!target) return current;
    return conversationReducer(current, { type: 'update', id, patch: { messages: edit(target.messages), updatedAt: Date.now() } });
  });
  const editMessage = (conversationId: string, messageId: string, edit: (message: Message) => Message) =>
    editMessages(conversationId, messages => messages.map(item => (item.id === messageId ? edit(item) : item)));

  const announceMemory = (event: any) => {
    const token = typeof event?.undo_token === 'string' ? event.undo_token : '';
    showToast({
      message: event?.message || '已记住你的偏好',
      icon: 'sparkle',
      actionLabel: token ? '撤销' : undefined,
      onAction: token ? () => {
        undoPreference(USER_ID, token)
          .then(() => showToast({ message: '已撤销这条偏好，之后的推荐不再参考它。', icon: 'undo' }))
          .catch(error => showToast({ message: error?.message || '撤销失败，请到偏好设置里修改。', icon: 'close' }));
      } : undefined,
    });
  };

  const send = async (raw: string, options: {
    imageBase64?: string; display?: string; retryOf?: Message; conversation?: Conversation;
  } = {}) => {
    const clean = raw.trim();
    if ((!clean && !options.imageBase64) || busy || !ready) return;
    const target = options.conversation ?? active;
    const conversationId = target.id;
    const firstQuestion = !target.messages.some(message => message.role === 'user');
    const requestId = options.retryOf?.retry?.requestId || newRequestId();
    const answerId = localId('answer');
    const answer: Message = {
      id: answerId, role: 'assistant', text: '', status: 'streaming',
      phaseLabel: options.imageBase64 ? '正在识别图片…' : '正在理解需求…',
      retry: { query: clean, requestId },
    };
    editMessages(conversationId, messages => {
      const base = options.retryOf
        ? messages.filter(item => item.id !== options.retryOf!.id)
        : [...messages, { id: localId('user'), role: 'user' as const, text: options.display || clean, ...(options.imageBase64 ? { hasImage: true } : {}) }];
      return [...base, answer];
    });
    if (firstQuestion && !options.retryOf) patchConversation(conversationId, { title: (options.display || clean || '图片找物').slice(0, 20) });
    setQuery('');
    setBusyId(conversationId);
    followRef.current = true;
    stoppedRef.current = false;
    const controller = new AbortController();
    abortRef.current = controller;
    let sawMemory = false;
    try {
      const reply = await sendChat({
        query: clean, sessionId: target.sessionId, userId: USER_ID, imageBase64: options.imageBase64, requestId,
      }, event => {
        if (event.event === 'session' && event.data?.session_id) patchConversation(conversationId, { sessionId: event.data.session_id });
        if (event.event === 'memory_update') { sawMemory = true; announceMemory(event.data); }
        if (event.event === 'tool_result' && event.data?.tool_name === 'cart') {
          const count = event.data?.payload?.cart?.item_count;
          if (typeof count === 'number') setCartCount(count); else refreshCart();
        }
        editMessage(conversationId, answerId, message => applyStreamEvent(message, event));
      }, { signal: controller.signal });
      if (reply.sessionId) patchConversation(conversationId, { sessionId: reply.sessionId });
      // A reply recovered through /chat after a dropped stream carries the final state itself.
      editMessage(conversationId, answerId, message => (message.status === 'done' ? message : applyStreamEvent(
        applyStreamEvent(message, { event: 'tool_result', data: reply.toolResult }),
        { event: 'done', data: { narrative: reply.narrative } },
      )));
      if (!sawMemory) (reply.trace?.memory_updates as any[] | undefined)?.forEach(announceMemory);
      if (reply.toolResult?.tool_name === 'cart') refreshCart();
    } catch (error: any) {
      editMessage(conversationId, answerId, message => (stoppedRef.current
        ? { ...message, status: 'done', text: message.text || '已停止生成。', phase: undefined, phaseLabel: undefined }
        : { ...message, status: 'error', error: error?.message || '后端暂时不可用', phase: undefined, phaseLabel: undefined }));
    } finally {
      abortRef.current = null;
      setBusyId(null);
    }
  };

  const stop = () => {
    stoppedRef.current = true;
    abortRef.current?.abort();
  };

  useEffect(() => {
    if (!ready) return;
    const { imageBase64, prompt, newChat } = route.params ?? {};
    const key = imageBase64 ? `image:${imageBase64.length}:${imageBase64.slice(-24)}` : prompt ? `prompt:${prompt}` : null;
    // Params are cleared once consumed; forgetting the key lets the same image or
    // prompt be sent again later (for example, to retry a poor image search).
    if (!key) {
      consumedParam.current = null;
      return;
    }
    if (consumedParam.current === key) return;
    consumedParam.current = key;
    navigation.setParams({ imageBase64: undefined, prompt: undefined, newChat: undefined });
    let target = active;
    if (newChat && !fresh) {
      target = createConversation(localId('chat'));
      const created = target;
      setStore(current => conversationReducer(current, { type: 'new', conversation: created }));
      setSelected([]);
    }
    if (imageBase64) void send('', { imageBase64, display: '用这张图找同款', conversation: target });
    else if (prompt) void send(prompt, { conversation: target });
  }, [ready, route.params?.imageBase64, route.params?.prompt]);

  const startNew = () => {
    if (busy || !ready) return;
    setStore(current => conversationReducer(current, { type: 'new', conversation: createConversation(localId('chat')) }));
    setSelected([]);
    setQuery('');
    setHistoryOpen(false);
  };
  const openConversation = (id: string) => {
    if (busy) return;
    setStore(current => conversationReducer(current, { type: 'select', id }));
    setSelected([]);
    setHistoryOpen(false);
  };

  const toggleCompare = (product: AgentProduct) => setSelected(current => {
    if (current.some(item => item.productId === product.productId)) return current.filter(item => item.productId !== product.productId);
    if (current.length >= MAX_COMPARE) {
      showToast({ message: `最多同时对比 ${MAX_COMPARE} 款，先移出一款再选。`, icon: 'compare' });
      return current;
    }
    return [...current, product];
  });

  const addToCart = async (product: AgentProduct, sku: { id: string; label: string } | null = null) => {
    try {
      const result = await mutateCart({
        action: 'add', productID: product.productId, ...(sku ? { skuID: sku.id } : {}), quantity: 1,
      });
      setCartCount(Number(result?.cart?.item_count) || 0);
      showToast({
        message: sku ? `已加入购物车（${sku.label}）：${product.title}` : `已加入购物车：${product.title}`,
        icon: 'cart', actionLabel: '去看看', onAction: () => setCartOpen(true),
      });
    } catch (error: any) {
      showToast({ message: error?.message || '加购失败，请稍后重试。', icon: 'close' });
    }
  };

  // "+" on a card adds right away only when there is nothing to choose; a product with
  // several specs opens the spec picker instead of silently taking the cheapest one.
  const quickAdd = async (product: AgentProduct) => {
    try {
      const skus = skusFromDetail(await getProductDetail(product.productId));
      if (skus.length > 1) {
        setProductSheet(product);
        return;
      }
      if (skus.length === 1 && !skus[0].inStock) {
        showToast({ message: '这款暂时缺货，可以看看相似的商品。', icon: 'close' });
        return;
      }
      await addToCart(product, skus[0] ? { id: skus[0].id, label: skuLabel(skus[0]) } : null);
    } catch (error: any) {
      showToast({ message: error?.message || '加购失败，请稍后重试。', icon: 'close' });
    }
  };

  const onScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    followRef.current = contentSize.height - (contentOffset.y + layoutMeasurement.height) < 140;
  };

  const onKeyPress = (event: any) => {
    const key = event.nativeEvent ?? {};
    if (Platform.OS !== 'web' || key.key !== 'Enter' || key.shiftKey) return;
    // Enter also confirms a pinyin (IME) composition; that keystroke must not send.
    if (key.isComposing || key.keyCode === 229) return;
    event.preventDefault?.();
    void send(query);
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right', 'bottom']}>
      <View style={styles.header}>
        <IconButton icon="back" label="返回首页" onPress={() => navigation.navigate('Home')} />
        <Pressable style={styles.headerTitleWrap} onPress={() => setHistoryOpen(true)} accessibilityRole="button" accessibilityLabel="打开会话记录">
          <LogoMark size={22} />
          <View style={{ flexShrink: 1 }}>
            <Text style={styles.headerTitle}>AI 导购</Text>
            <Text style={styles.headerSub} numberOfLines={1}>{active.title}</Text>
          </View>
        </Pressable>
        <View style={styles.headerActions}>
          <IconButton icon="plus" label="开始新对话" onPress={startNew} disabled={busy || !ready} />
          <IconButton icon="history" label="会话记录" onPress={() => setHistoryOpen(true)} disabled={!ready} />
          <IconButton icon="cart" label="购物车" badge={cartCount} onPress={() => setCartOpen(true)} />
        </View>
      </View>
      {!!storageError && <Text accessibilityRole="alert" style={styles.storageError}>{storageError}</Text>}

      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView ref={scrollRef} style={styles.flex} contentContainerStyle={styles.feed}
          onScroll={onScroll} scrollEventThrottle={64}
          onContentSizeChange={() => { if (followRef.current) scrollRef.current?.scrollToEnd({ animated: true }); }}>
          {active.messages.map(message => (message.role === 'user'
            ? <UserBubble key={message.id} message={message} />
            : <AssistantMessage key={message.id} message={message} latest={message.id === lastId} busy={busy}
                selectedIds={selectedIds} onSend={value => void send(value)} onRetry={item => void send(item.retry?.query || '', { retryOf: item })}
                onOpenProduct={setProductSheet} onToggleCompare={toggleCompare} onAdd={product => void quickAdd(product)} />
          ))}

          {fresh && (
            <View style={styles.starters}>
              <Pressable onPress={() => navigation.navigate('Camera')} accessibilityRole="button" accessibilityLabel="拍照或选图找同款"
                style={({ pressed }) => [styles.snap, pressed && { opacity: 0.9 }]}>
                <View style={styles.snapIcon}><Icon name="camera" color={colors.ink} size={22} /></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.snapTitle}>拍一下，找同款</Text>
                  <Text style={styles.snapSub}>识别类目和关键属性，再按图找相似商品</Text>
                </View>
                <Icon name="chevronRight" color={colors.surface} />
              </Pressable>
              <Text style={[text.micro, { marginTop: 18, marginBottom: 10 }]}>大家在问</Text>
              <View style={styles.wrap}>
                {starters.map(item => <Chip key={item} label={item} icon={item === '看看购物车' ? 'cart' : 'search'} disabled={busy || !ready} onPress={() => void send(item)} />)}
              </View>
            </View>
          )}
        </ScrollView>

        {selected.length > 0 && (
          <View style={styles.tray}>
            <Text style={styles.trayText}>已选 {selected.length}/{MAX_COMPARE}{selected.length < 2 ? '，再选 1 款就能对比' : ''}</Text>
            <Chip label="清空" onPress={() => setSelected([])} />
            <Chip label="开始对比" icon="compare" tone="tag" disabled={selected.length < 2} onPress={() => setCompareOpen(true)} />
          </View>
        )}

        <View style={styles.composerBar}>
          <View style={[styles.composer, composerFocused && styles.composerFocused]}>
            <IconButton icon="camera" label="拍照或选图找同款" tone="wash" disabled={busy} onPress={() => navigation.navigate('Camera')} />
            <TextInput style={[styles.input, noOutline]} value={query} onChangeText={setQuery} onKeyPress={onKeyPress}
              onFocus={() => setComposerFocused(true)} onBlur={() => setComposerFocused(false)}
              placeholder="说说预算、品类或用途…" placeholderTextColor={colors.faint} multiline editable={ready}
              accessibilityLabel="输入你的购物需求" />
            {busy
              ? <IconButton icon="stop" label="停止生成" tone="ink" onPress={stop} />
              : <IconButton icon="arrowUp" label="发送" tone="ink" disabled={!query.trim() || !ready} onPress={() => void send(query)} />}
          </View>
        </View>
        <Toast toast={toast} onClose={() => setToast(null)} />
      </KeyboardAvoidingView>

      <ProductSheet product={productSheet} inCompare={!!productSheet && selectedIds.includes(productSheet.productId)}
        onClose={() => setProductSheet(null)}
        onAdd={sku => { if (productSheet) void addToCart(productSheet, sku); setProductSheet(null); }}
        onToggleCompare={() => { if (productSheet) toggleCompare(productSheet); }} />
      <CompareSheet visible={compareOpen} productIds={selectedIds} onClose={() => setCompareOpen(false)} onClear={() => setSelected([])} />
      <CartSheet visible={cartOpen} onClose={() => setCartOpen(false)} onCount={setCartCount}
        onCheckout={() => { setCartOpen(false); void send('帮我下单'); }} />
      <HistorySheet visible={historyOpen} conversations={store.conversations} activeId={active.id}
        onClose={() => setHistoryOpen(false)} onSelect={openConversation} onNew={startNew} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.paper },
  flex: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 6,
    borderBottomWidth: 1, borderColor: colors.rule, backgroundColor: colors.paper,
  },
  headerTitleWrap: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 4, minHeight: 44 },
  headerTitle: { fontSize: 15, fontWeight: '800', color: colors.ink },
  headerSub: { fontSize: 11, color: colors.muted },
  headerActions: { flexDirection: 'row' },
  storageError: { color: colors.error, fontSize: 12, paddingHorizontal: 16, paddingTop: 6 },
  feed: { paddingHorizontal: 16, paddingTop: 18, paddingBottom: 24, width: '100%', maxWidth: 820, alignSelf: 'center' },
  starters: { marginLeft: 42, marginTop: -6 },
  snap: {
    flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: radii.md,
    backgroundColor: colors.ink, maxWidth: 460,
  },
  snapIcon: { width: 44, height: 44, borderRadius: 12, backgroundColor: colors.tag, alignItems: 'center', justifyContent: 'center' },
  snapTitle: { color: colors.surface, fontSize: 15, fontWeight: '800' },
  snapSub: { color: colors.mutedOnInk, fontSize: 12, marginTop: 2 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tray: {
    flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 8,
    borderTopWidth: 1, borderColor: colors.rule, backgroundColor: colors.surface,
  },
  trayText: { flex: 1, fontSize: 13, color: colors.ink, fontWeight: '600' },
  composerBar: { paddingHorizontal: 12, paddingTop: 8, paddingBottom: 10, backgroundColor: colors.paper },
  composer: {
    width: '100%', maxWidth: 820, alignSelf: 'center', flexDirection: 'row', alignItems: 'flex-end', gap: 6,
    padding: 6, borderRadius: 28, backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.rule,
  },
  composerFocused: { borderColor: colors.ink },
  input: {
    flex: 1, minHeight: 44, maxHeight: 120, paddingHorizontal: 8, paddingTop: 12, paddingBottom: 10,
    fontSize: 15, color: colors.ink,
  },
});
