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

type Props = {
  route: RouteProp<RootStackParamList, 'Assistant'>;
  navigation: NativeStackNavigationProp<RootStackParamList, 'Assistant'>;
};
type Message = { id: string; role: 'user' | 'assistant'; text: string };

const SESSION_KEY = 'cartpilot_session_id';
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
  const [messages, setMessages] = useState<Message[]>([
    { id: 'welcome', role: 'assistant', text: '告诉我预算、品类或使用场景，我会从本地商品目录中帮你挑选。' },
  ]);
  const [query, setQuery] = useState('');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessionReady, setSessionReady] = useState(false);
  const [products, setProducts] = useState<AgentProduct[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');
  const consumedImage = useRef(false);

  useEffect(() => {
    storage.getItem(SESSION_KEY).then(setSessionId).finally(() => setSessionReady(true));
  }, []);
  useEffect(() => {
    if (sessionReady && route.params?.imageBase64 && !consumedImage.current) {
      consumedImage.current = true;
      void send('识别这张图片并推荐相似商品', route.params.imageBase64);
    }
  }, [route.params?.imageBase64, sessionReady]);

  const acceptReply = async (reply: AgentReply, replaceId?: string) => {
    if (reply.sessionId) {
      setSessionId(reply.sessionId);
      await storage.setItem(SESSION_KEY, reply.sessionId);
    }
    setMessages(current => [...current.filter(message => message.id !== replaceId), {
      id: `${Date.now()}-assistant`, role: 'assistant', text: readableNarrative(reply.narrative),
    }]);
    setProducts(reply.products);
    setSelected([]);
  };

  const send = async (text = query, imageBase64?: string) => {
    const clean = text.trim();
    if ((!clean && !imageBase64) || loading) return;
    setMessages(current => [...current, { id: `${Date.now()}-user`, role: 'user', text: clean || '发送了一张商品图片' }]);
    setQuery('');
    setLoading(true);
    setStatus('正在理解需求…');
    const input = { query: clean, sessionId, userId: USER_ID, imageBase64 };
    const streamMessageId = `${Date.now()}-stream`;
    let streamedText = '';
    try {
      const reply = await chatWithFallback(input, event => {
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
        <TouchableOpacity onPress={() => navigation.goBack()}><Text style={styles.headerLink}>返回</Text></TouchableOpacity>
        <View><Text style={styles.headerTitle}>智能导购</Text><Text style={styles.headerSub}>本地目录 · Agent 多轮对话</Text></View>
        <TouchableOpacity onPress={() => navigation.navigate('Preferences')}><Text style={styles.headerLink}>偏好</Text></TouchableOpacity>
      </View>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView style={styles.flex} contentContainerStyle={styles.content}>
          {messages.map(message => (
            <View key={message.id} style={[styles.bubble, message.role === 'user' ? styles.userBubble : styles.assistantBubble]}>
              <Text style={message.role === 'user' ? styles.userText : styles.assistantText}>{message.text}</Text>
            </View>
          ))}
          {loading && <View style={styles.loading}><ActivityIndicator color="#2563EB" /><Text style={styles.status}>{status}</Text></View>}
          {products.length > 0 && (
            <View style={styles.products}>
              <View style={styles.sectionHeader}><Text style={styles.sectionTitle}>推荐商品</Text>{selected.length >= 2 && <TouchableOpacity onPress={compareSelected}><Text style={styles.compare}>对比 {selected.length} 件</Text></TouchableOpacity>}</View>
              <FlatList horizontal data={products} keyExtractor={item => item.productId} showsHorizontalScrollIndicator={false}
                renderItem={({ item }) => <AgentProductCard product={item} selected={selected.includes(item.productId)}
                  onToggle={() => setSelected(current => current.includes(item.productId) ? current.filter(id => id !== item.productId) : current.length < 3 ? [...current, item.productId] : current)}
                  onDetail={() => showDetail(item)} onAdd={() => addToCart(item)} />} />
            </View>
          )}
        </ScrollView>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.quickRow}>
          {QUICK_PROMPTS.map(prompt => <TouchableOpacity key={prompt} style={styles.quick} onPress={() => send(prompt)} disabled={loading}><Text style={styles.quickText}>{prompt}</Text></TouchableOpacity>)}
        </ScrollView>
        <View style={styles.composer}>
          <TouchableOpacity style={styles.camera} onPress={() => navigation.navigate('Camera')}><Text style={styles.cameraText}>图片</Text></TouchableOpacity>
          <TextInput style={styles.input} value={query} onChangeText={setQuery} placeholder="例如：800 元内，续航好的耳机" multiline editable={!loading} />
          <TouchableOpacity style={[styles.send, loading && styles.disabled]} onPress={() => send()} disabled={loading}><Text style={styles.sendText}>发送</Text></TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 }, safeArea: { flex: 1, backgroundColor: '#F4F6F8' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, paddingVertical: 12, backgroundColor: '#FFF', borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
  headerTitle: { textAlign: 'center', fontSize: 17, color: '#111827', fontWeight: '900' }, headerSub: { fontSize: 10, color: '#64748B', marginTop: 2 }, headerLink: { color: '#2563EB', fontWeight: '800' },
  content: { padding: 16, paddingBottom: 24 }, bubble: { maxWidth: '88%', paddingHorizontal: 15, paddingVertical: 11, borderRadius: 18, marginBottom: 10 },
  userBubble: { alignSelf: 'flex-end', backgroundColor: '#111827', borderBottomRightRadius: 5 }, assistantBubble: { alignSelf: 'flex-start', backgroundColor: '#FFF', borderBottomLeftRadius: 5, borderWidth: 1, borderColor: '#E5E7EB' },
  userText: { color: '#FFF', lineHeight: 21 }, assistantText: { color: '#1F2937', lineHeight: 22 }, loading: { flexDirection: 'row', alignItems: 'center', gap: 9, marginVertical: 8 }, status: { color: '#64748B', fontSize: 13 },
  products: { marginTop: 10 }, sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }, sectionTitle: { color: '#111827', fontSize: 17, fontWeight: '900' }, compare: { color: '#2563EB', fontWeight: '800' },
  quickRow: { paddingHorizontal: 12, paddingVertical: 8, gap: 8 }, quick: { backgroundColor: '#E8EEF9', borderRadius: 16, paddingHorizontal: 12, paddingVertical: 8 }, quickText: { color: '#334155', fontSize: 12, fontWeight: '700' },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, padding: 12, backgroundColor: '#FFF', borderTopWidth: 1, borderTopColor: '#E5E7EB' }, camera: { paddingHorizontal: 10, paddingVertical: 12 }, cameraText: { color: '#2563EB', fontWeight: '800' },
  input: { flex: 1, maxHeight: 96, minHeight: 44, borderRadius: 18, backgroundColor: '#F1F5F9', paddingHorizontal: 14, paddingVertical: 11, color: '#111827' }, send: { backgroundColor: '#2563EB', borderRadius: 18, paddingHorizontal: 15, paddingVertical: 12 }, disabled: { opacity: 0.45 }, sendText: { color: '#FFF', fontWeight: '900' },
});
