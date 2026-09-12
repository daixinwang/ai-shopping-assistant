import { colors, fonts } from '../theme';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, FlatList, KeyboardAvoidingView, Platform,
  SafeAreaView, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/AppNavigator';
import AgentProductCard from '../components/AgentProductCard';
import {
  AgentProduct, AgentReply, chatWithFallback, compareAgentProducts,
  getProductDetail, mutateCart,
} from '../api/client';
import storage from '../utils/storage';
import ActionButton from '../components/ActionButton';
import Icon from '../components/Icon';
import { CONVERSATIONS_KEY, Conversation, Message, createConversation, conversationReducer, restoreConversations } from '../utils/conversations';

type Props = {
  route: RouteProp<RootStackParamList, 'Assistant'>;
  navigation: NativeStackNavigationProp<RootStackParamList, 'Assistant'>;
};
const newId = () => `chat-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
const USER_ID = 'mobile-demo-user';
const QUICK_PROMPTS = ['500 元以内的防晒', '推荐通勤耳机', '再便宜一点', '看看购物车'];

function readableNarrative(value: string): string {
  try {
    const parsed = JSON.parse(value);
    const descriptions = Array.isArray(parsed.items)
      ? parsed.items.map((item: any) => item.description).filter(Boolean)
      : [];
    return [parsed.opening, ...descriptions, ...(parsed.followup || []).slice(0, 2)]
      .filter(Boolean).join('\n');
  } catch {
    return value || '已完成处理。';
  }
}

export default function AssistantScreen({ route, navigation }: Props) {
  const [store, setStore] = useState(() => {
    const first = createConversation(newId());
    return { activeId: first.id, conversations: [first] };
  });
  const active = store.conversations.find(item => item.id === store.activeId)!;
  const { messages, products, sessionId } = active;
  const [query, setQuery] = useState('');
  const [sessionReady, setSessionReady] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [storageError, setStorageError] = useState('');
  const writes = useRef(Promise.resolve());
  const sending = useRef(false);
  const updateActive = (patch: Partial<Conversation>) => setStore(current => conversationReducer(current, { type: 'update', id: active.id, patch }));
  const setMessages = (update: (current: Message[]) => Message[]) => setStore(current => {
    const target = current.conversations.find(item => item.id === active.id)!;
    return conversationReducer(current, { type: 'update', id: active.id, patch: { messages: update(target.messages), updatedAt: Date.now() } });
  });
  const [selected, setSelected] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');
  const consumedImage = useRef(false);

  useEffect(() => {
    let mounted = true;
    storage.getItem(CONVERSATIONS_KEY).then(raw => {
      if (!mounted) return;
      const saved = restoreConversations(raw);
      if (saved) setStore(saved);
      else if (raw) setStorageError('历史记录无法读取，已打开新对话。');
    }).catch(() => { if (mounted) setStorageError('无法读取本机历史记录。'); })
      .finally(() => { if (mounted) setSessionReady(true); });
    return () => { mounted = false; };
  }, []);
  useEffect(() => {
    if (!sessionReady) return;
    const snapshot = JSON.stringify(store);
    writes.current = writes.current.then(() => storage.setItem(CONVERSATIONS_KEY, snapshot))
      .catch(() => setStorageError('对话暂未保存到本机，请检查浏览器存储空间。'));
  }, [store, sessionReady]);
  const startNew = () => {
    if (sending.current || !sessionReady) return;
    setStore(current => conversationReducer(current, { type: 'new', conversation: createConversation(newId()) }));
    setSelected([]); setQuery(''); setStatus(''); setHistoryOpen(false);
  };
  const selectConversation = (id: string) => {
    if (sending.current || !sessionReady) return;
    setStore(current => conversationReducer(current, { type: 'select', id }));
    setSelected([]); setQuery(''); setStatus(''); setHistoryOpen(false);
  };
  useEffect(() => {
    if (sessionReady && route.params?.imageBase64 && !consumedImage.current) {
      consumedImage.current = true;
      void send('识别这张图片并推荐相似商品', route.params.imageBase64);
    }
  }, [route.params?.imageBase64, sessionReady]);

  const acceptReply = async (reply: AgentReply, replaceId?: string) => {
    if (reply.sessionId) {
      updateActive({ sessionId: reply.sessionId });
    }
    setMessages(current => [...current.filter(message => message.id !== replaceId), {
      id: `${Date.now()}-assistant`, role: 'assistant', text: readableNarrative(reply.narrative),
    }]);
    updateActive({ products: reply.products });
    setSelected([]);
  };

  const send = async (text = query, imageBase64?: string) => {
    const clean = text.trim();
    if ((!clean && !imageBase64) || sending.current || !sessionReady) return;
    sending.current = true;
    if (!messages.some(message => message.role === 'user')) updateActive({ title: (clean || '图片找物').slice(0, 24) });
    setMessages(current => [...current, { id: `${Date.now()}-user`, role: 'user', text: clean || '发送了一张商品图片' }]);
    setQuery('');
    setLoading(true);
    setStatus('正在理解需求…');
    const input = { query: clean, sessionId, userId: USER_ID, imageBase64 };
    const streamMessageId = `${Date.now()}-stream`;
    let streamedText = '';
    try {
      const reply = await chatWithFallback(input, event => {
        if (event.event === 'session' && event.data?.session_id) updateActive({ sessionId: event.data.session_id });
        if (event.event === 'status') setStatus(event.data?.message || '正在挑选商品…');
        if (event.event === 'token') {
          streamedText += String(event.data || '');
          setMessages(current => {
            const message = { id: streamMessageId, role: 'assistant' as const, text: readableNarrative(streamedText) };
            return current.some(item => item.id === streamMessageId)
              ? current.map(item => item.id === streamMessageId ? message : item)
              : [...current, message];
          });
        }
      });
      await acceptReply(reply, streamMessageId);
    } catch (error: any) {
      setMessages(current => [...current, {
        id: `${Date.now()}-error`, role: 'assistant',
        text: `暂时没有完成请求：${error?.message || '后端不可用'}。你可以修改条件后重试。`,
      }]);
    } finally {
      sending.current = false;
      setLoading(false);
      setStatus('');
    }
  };

  const showDetail = async (product: AgentProduct) => {
    try {
      const detail = await getProductDetail(product.productId);
      Alert.alert(detail.title, `${detail.price?.display || product.priceDisplay}\n${detail.summary || '暂无更多介绍'}`);
    } catch (error: any) { Alert.alert('详情加载失败', error?.message || '请稍后重试'); }
  };

  const addToCart = async (product: AgentProduct) => {
    try {
      const result = await mutateCart({ action: 'add', productID: product.productId, quantity: 1 });
      Alert.alert('已加入购物车', `当前共 ${result.cart?.item_count || 0} 件，合计 ¥${result.cart?.total || 0}`);
    } catch (error: any) { Alert.alert('加购失败', error?.message || '请稍后重试'); }
  };

  const compareSelected = async () => {
    if (selected.length < 2) return Alert.alert('请选择 2–3 件商品');
    try {
      const result = await compareAgentProducts(selected);
      const rows = (result.rows || []).slice(0, 5).map((row: any) => `${row.label || row.dimension}：${(row.values || []).join(' / ')}`).join('\n');
      Alert.alert('商品对比', rows || result.recommendation || '对比已生成');
    } catch (error: any) { Alert.alert('对比失败', error?.message || '请稍后重试'); }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <ActionButton icon="back" label="返回" onPress={() => navigation.goBack()} disabled={loading} />
        <View><Text style={styles.headerTitle}>智能导购</Text><Text style={styles.headerSub}>购物顾问 / THE ADVISORY</Text></View>
        <ActionButton icon="settings" label="偏好" onPress={() => navigation.navigate('Preferences')} disabled={loading} />
      </View>
      <View style={styles.sessionToolbar}>
        <ActionButton icon="plus" label="新对话" primary onPress={startNew} disabled={loading || !sessionReady} />
        <ActionButton icon="history" label={`会话记录 (${store.conversations.length})`} onPress={() => setHistoryOpen(value => !value)} selected={historyOpen} disabled={loading || !sessionReady} />
        <Text style={styles.sessionTitle} numberOfLines={1}>{active.title}</Text>
      </View>
      {historyOpen && <View style={styles.historyPanel}>
        <Text style={styles.historyCaption}>保存在本机 · 选择会话继续聊</Text>
        <ScrollView style={{ maxHeight: 220 }}>
          {store.conversations.map(item => <TouchableOpacity key={item.id} accessibilityRole="button" accessibilityLabel={`打开会话：${item.title}`} accessibilityState={{ selected: item.id === active.id }}
            style={[styles.historyItem, item.id === active.id && { backgroundColor: colors.wash, borderColor: colors.ink }]} onPress={() => selectConversation(item.id)}>
            <Icon name={item.id === active.id ? 'check' : 'chat'} />
            <View style={{ flex: 1 }}><Text style={styles.historyTitle} numberOfLines={1}>{item.title}</Text><Text style={styles.historyCaption}>{item.messages.filter(message => message.role === 'user').length} 条提问 · {new Date(item.updatedAt).toLocaleString()}</Text></View>
          </TouchableOpacity>)}
        </ScrollView>
      </View>}
      <Text selectable style={styles.sessionMeta}>{sessionId ? `Session · ${sessionId}` : '新会话 · 发送第一条消息后建立独立上下文'}</Text>
      {!!storageError && <Text accessibilityRole="alert" style={styles.storageError}>{storageError}</Text>}
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView style={styles.flex} contentContainerStyle={styles.content}>
          {messages.map(message => (
            <View key={message.id} style={[styles.bubble, message.role === 'user' ? styles.userBubble : styles.assistantBubble]}>
              <Text style={message.role === 'user' ? styles.userText : styles.assistantText}>{message.text}</Text>
            </View>
          ))}
          {loading && <View style={styles.loading}><ActivityIndicator color={colors.ink} /><Text style={styles.status}>{status}</Text></View>}
          {products.length > 0 && (
            <View style={styles.products}>
              <View style={styles.sectionHeader}><Text style={styles.sectionTitle}>推荐商品</Text>{selected.length >= 2 && <ActionButton icon="compare" label={`对比 ${selected.length} 件`} onPress={compareSelected} />}</View>
              <FlatList horizontal data={products} keyExtractor={item => item.productId} showsHorizontalScrollIndicator={false}
                renderItem={({ item }) => <AgentProductCard product={item} selected={selected.includes(item.productId)}
                  onToggle={() => setSelected(current => current.includes(item.productId) ? current.filter(id => id !== item.productId) : current.length < 3 ? [...current, item.productId] : current)}
                  onDetail={() => showDetail(item)} onAdd={() => addToCart(item)} />} />
            </View>
          )}
        </ScrollView>
        <ScrollView horizontal style={{ flexGrow: 0, flexShrink: 0 }} showsHorizontalScrollIndicator={false} contentContainerStyle={styles.quickRow}>
          {QUICK_PROMPTS.map(prompt => <ActionButton key={prompt} icon={prompt === '看看购物车' ? 'cart' : 'chat'} label={prompt} onPress={() => send(prompt)} disabled={loading || !sessionReady} />)}
        </ScrollView>
        <View style={styles.composer}>
          <ActionButton icon="camera" label="图片" onPress={() => navigation.navigate('Camera')} disabled={loading || !sessionReady} />
          <TextInput style={styles.input} value={query} onChangeText={setQuery} placeholder="例如：800 元内，续航好的耳机" multiline editable={!loading && sessionReady} />
          <ActionButton icon="send" label="发送" primary onPress={() => send()} disabled={loading || !sessionReady || !query.trim()} />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  sessionToolbar: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center', paddingHorizontal: 18, paddingTop: 12 },
  sessionTitle: { color: colors.muted, fontSize: 12, flexShrink: 1 },
  sessionMeta: { color: colors.muted, fontSize: 10, paddingHorizontal: 18, paddingVertical: 10 },
  historyPanel: { marginHorizontal: 18, marginTop: 10, padding: 12, borderWidth: 1, borderColor: colors.rule, backgroundColor: colors.surface },
  historyCaption: { color: colors.muted, fontSize: 10, marginVertical: 5 },
  historyItem: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10, minHeight: 60, borderWidth: 1, borderColor: colors.rule, marginTop: 6 },
  historyTitle: { color: colors.ink, fontSize: 13, fontWeight: '700' },
  storageError: { color: colors.error, paddingHorizontal: 18, fontSize: 12 },
  flex: { flex: 1 }, safeArea: { flex: 1, backgroundColor: colors.paper },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, paddingVertical: 12, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.rule },
  headerTitle: { fontFamily: fonts.editorial, textAlign: 'center', fontSize: 17, color: colors.ink, fontWeight: '900' }, headerSub: { fontSize: 10, color: colors.muted, marginTop: 2 }, headerLink: { color: colors.ink, fontWeight: '800' },
  content: { padding: 24, paddingBottom: 32, width: '100%', maxWidth: 1000, alignSelf: 'center' }, bubble: { maxWidth: '88%', paddingHorizontal: 15, paddingVertical: 11, borderRadius: 3, marginBottom: 10 },
  userBubble: { alignSelf: 'flex-end', backgroundColor: colors.ink, borderBottomRightRadius: 5 }, assistantBubble: { alignSelf: 'flex-start', backgroundColor: colors.surface, borderBottomLeftRadius: 5, borderWidth: 1, borderColor: colors.rule },
  userText: { color: colors.surface, lineHeight: 21 }, assistantText: { color: colors.ink, lineHeight: 22 }, loading: { flexDirection: 'row', alignItems: 'center', gap: 9, marginVertical: 8 }, status: { color: colors.muted, fontSize: 13 },
  products: { marginTop: 10 }, sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }, sectionTitle: { fontFamily: fonts.editorial, color: colors.ink, fontSize: 17, fontWeight: '900' }, compare: { color: colors.ink, fontWeight: '800' },
  quickRow: { paddingHorizontal: 24, paddingVertical: 8, gap: 8, flexGrow: 1, justifyContent: 'center' }, quick: { backgroundColor: colors.wash, borderRadius: 3, paddingHorizontal: 12, paddingVertical: 8 }, quickText: { color: colors.ink, fontSize: 12, fontWeight: '700' },
  composer: { width: '100%', maxWidth: 1000, alignSelf: 'center', flexDirection: 'row', alignItems: 'flex-end', gap: 8, padding: 12, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.rule }, camera: { paddingHorizontal: 10, paddingVertical: 12 }, cameraText: { color: colors.ink, fontWeight: '800' },
  input: { flex: 1, maxHeight: 96, minHeight: 44, borderRadius: 3, backgroundColor: colors.wash, paddingHorizontal: 14, paddingVertical: 11, color: colors.ink }, send: { backgroundColor: colors.ink, borderRadius: 3, paddingHorizontal: 15, paddingVertical: 12 }, disabled: { opacity: 0.45 }, sendText: { color: colors.surface, fontWeight: '900' },
});
