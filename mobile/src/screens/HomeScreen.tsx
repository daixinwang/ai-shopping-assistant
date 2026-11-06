import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator, DimensionValue, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/AppNavigator';
import { DEMO_USER_ID, getPreferences, getSuggestions } from '../api/client';
import storage from '../utils/storage';
import { CONVERSATIONS_KEY, LEGACY_CONVERSATIONS_KEY, restoreConversations } from '../utils/conversations';
import { describePreference } from '../utils/preferences';
import { ImageSource, pickImage } from '../utils/pickImage';
import { LogoMark, ScanLoader } from '../components/Brand';
import { CategoryGlyph, CategoryKind, SnapArt } from '../components/Illustrations';
import { Chip, IconButton } from '../components/ui';
import Icon from '../components/Icon';
import { colors, fonts, noOutline, radii, text } from '../theme';

type Props = { navigation: NativeStackNavigationProp<RootStackParamList, 'Home'> };

const CATEGORIES: { name: string; kind: CategoryKind; prompt: string }[] = [
  { name: '数码电子', kind: 'digital', prompt: '通勤用的降噪耳机' },
  { name: '美妆护肤', kind: 'beauty', prompt: '敏感肌能用的保湿精华' },
  { name: '服饰运动', kind: 'sports', prompt: '适合日常慢跑的跑鞋' },
  { name: '食品饮料', kind: 'food', prompt: '办公室提神的咖啡' },
];
const FALLBACK_HOT = ['500 元以内的防晒', '学生党平价耳机', '透气的速干T恤', '低糖的零食'];

function greeting(hour: number) {
  if (hour < 5) return '夜深了';
  if (hour < 11) return '早上好';
  if (hour < 13) return '中午好';
  if (hour < 18) return '下午好';
  return '晚上好';
}

export default function HomeScreen({ navigation }: Props) {
  const wide = useWindowDimensions().width >= 640;
  const [query, setQuery] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const [hot, setHot] = useState(FALLBACK_HOT);
  const [hotLoading, setHotLoading] = useState(false);
  const [recent, setRecent] = useState<{ title: string; asked: number } | null>(null);
  // undefined while loading, null when the backend could not be reached.
  const [pref, setPref] = useState<Record<string, any> | null | undefined>(undefined);
  const [reading, setReading] = useState(false);
  const [pickError, setPickError] = useState('');

  const loadHot = () => {
    setHotLoading(true);
    getSuggestions()
      .then(value => { if (value.hot_searches?.length) setHot(value.hot_searches.slice(0, 6)); })
      .catch(() => {})
      .finally(() => setHotLoading(false));
  };
  useEffect(() => { loadHot(); }, []);

  // Refresh on every visit: the assistant may have remembered a preference or the
  // user may have started a conversation since the last time.
  useFocusEffect(useCallback(() => {
    let live = true;
    (async () => {
      try {
        const restored = restoreConversations(await storage.getItem(CONVERSATIONS_KEY))
          ?? restoreConversations(await storage.getItem(LEGACY_CONVERSATIONS_KEY));
        const active = restored?.conversations.find(item => item.id === restored.activeId);
        const asked = active?.messages.filter(message => message.role === 'user').length ?? 0;
        if (live) setRecent(active && asked ? { title: active.title, asked } : null);
      } catch {
        if (live) setRecent(null);
      }
    })();
    getPreferences(DEMO_USER_ID)
      .then(value => { if (live) setPref(value); })
      .catch(() => { if (live) setPref(null); });
    return () => { live = false; };
  }, []));

  const ask = (value: string) => {
    const clean = value.trim();
    if (!clean) return;
    setQuery('');
    navigation.navigate('Assistant', { prompt: clean, newChat: true });
  };

  const snap = async (source: ImageSource) => {
    setPickError('');
    try {
      const image = await pickImage(source, () => setReading(true));
      if (image) navigation.navigate('Assistant', { imageBase64: image, newChat: true });
    } catch (error: any) {
      setPickError(error?.message || '图片读取失败，请重试。');
    } finally {
      setReading(false);
    }
  };

  const remembered = pref ? describePreference(pref) : [];
  const paused = pref?.personalization_enabled === false;
  const tileWidth: DimensionValue = wide ? '23.5%' : '48.5%';

  return (
    <SafeAreaView style={s.safe} edges={['top', 'left', 'right']}>
      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
        <View style={s.page}>
          <View style={s.topbar}>
            <View style={s.brand}>
              <LogoMark size={30} />
              <Text style={s.wordmark} accessibilityRole="header">AI 购物助手</Text>
            </View>
            <IconButton icon="settings" label="服务设置" onPress={() => navigation.navigate('Settings')} />
          </View>

          <Text style={s.greet}>{greeting(new Date().getHours())}</Text>
          <Text style={s.headline}>今天想买点什么？</Text>

          <View style={[s.search, searchFocused && s.searchFocused]}>
            <Icon name="search" color={colors.muted} />
            <TextInput style={[s.searchInput, noOutline]} value={query} onChangeText={setQuery} onSubmitEditing={() => ask(query)}
              onFocus={() => setSearchFocused(true)} onBlur={() => setSearchFocused(false)}
              returnKeyType="send" placeholder={`试试：${hot[0] || '推荐通勤降噪耳机'}`} placeholderTextColor={colors.faint}
              accessibilityLabel="告诉导购你想买什么" />
            {query.trim()
              ? <IconButton icon="arrowUp" label="发送给导购" tone="ink" onPress={() => ask(query)} />
              : <IconButton icon="camera" label="拍照找同款" tone="wash" onPress={() => navigation.navigate('Camera', { newChat: true })} />}
          </View>

          <View style={s.rowHead}>
            <Text style={text.heading}>大家在问</Text>
            <Pressable onPress={loadHot} disabled={hotLoading} hitSlop={8} accessibilityRole="button"
              accessibilityLabel="换一批热门问题" style={({ pressed }) => [s.refresh, (pressed || hotLoading) && { opacity: 0.5 }]}>
              <Icon name="refresh" size={14} color={colors.muted} />
              <Text style={s.refreshText}>换一批</Text>
            </Pressable>
          </View>
          <View style={s.wrap}>
            {hot.map(item => <Chip key={item} label={item} onPress={() => ask(item)} />)}
          </View>

          <View style={s.hero}>
            <View style={s.heroTop}>
              <View style={{ flex: 1 }}>
                <Text style={s.heroKicker}>VISUAL SEARCH · 以图找物</Text>
                <Text style={s.heroTitle}>拍一下，{'\n'}帮你找同款</Text>
                <Text style={s.heroSub}>识别品类、颜色和款式，再到商品库里找相似的。</Text>
              </View>
              <SnapArt width={wide ? 150 : 116} height={wide ? 132 : 106} />
            </View>
            <View style={s.heroActions}>
              <Pressable onPress={() => void snap('camera')} disabled={reading} accessibilityRole="button" accessibilityLabel="拍照找同款"
                style={({ pressed }) => [s.heroPrimary, pressed && { opacity: 0.85 }]}>
                <Icon name="camera" color={colors.ink} />
                <Text style={s.heroPrimaryText}>拍照</Text>
              </Pressable>
              <Pressable onPress={() => void snap('library')} disabled={reading} accessibilityRole="button" accessibilityLabel="从相册选图找同款"
                style={({ pressed }) => [s.heroSecondary, pressed && { opacity: 0.85 }]}>
                <Icon name="image" color={colors.surface} />
                <Text style={s.heroSecondaryText}>从相册选</Text>
              </Pressable>
            </View>
            {!!pickError && <Text style={s.heroError} accessibilityRole="alert">{pickError}</Text>}
          </View>

          {recent && (
            <Pressable onPress={() => navigation.navigate('Assistant')} accessibilityRole="button"
              accessibilityLabel={`继续上次对话：${recent.title}`}
              style={({ pressed }) => [s.recent, pressed && { opacity: 0.85 }]}>
              <View style={s.recentIcon}><Icon name="chat" /></View>
              <View style={{ flex: 1 }}>
                <Text style={text.micro}>继续上次对话</Text>
                <Text style={s.recentTitle} numberOfLines={1}>{recent.title}</Text>
              </View>
              <Text style={s.recentMeta}>{recent.asked} 条提问</Text>
              <Icon name="chevronRight" color={colors.faint} />
            </Pressable>
          )}

          <Text style={[text.heading, s.section]}>逛逛品类</Text>
          <View style={s.grid}>
            {CATEGORIES.map(item => (
              <Pressable key={item.name} onPress={() => ask(item.prompt)} accessibilityRole="button"
                accessibilityLabel={`${item.name}：${item.prompt}`}
                style={({ pressed }) => [s.tile, { width: tileWidth }, pressed && { opacity: 0.85 }]}>
                <View style={s.glyph}><CategoryGlyph kind={item.kind} size={40} /></View>
                <Text style={s.tileName}>{item.name}</Text>
                <Text style={s.tilePrompt} numberOfLines={2}>“{item.prompt}”</Text>
              </Pressable>
            ))}
          </View>

          <Pressable onPress={() => navigation.navigate('Preferences')} accessibilityRole="button" accessibilityLabel="管理我的偏好"
            style={({ pressed }) => [s.pref, pressed && { opacity: 0.9 }]}>
            <View style={s.prefHead}>
              <Text style={[text.heading, { fontSize: 15 }]}>导购记住的偏好</Text>
              <View style={s.prefLink}><Text style={s.prefLinkText}>管理</Text><Icon name="chevronRight" size={14} /></View>
            </View>
            {pref === undefined && <ActivityIndicator color={colors.ink} style={{ alignSelf: 'flex-start' }} />}
            {pref === null && <Text style={text.small}>暂时读取不到偏好，确认后端已启动后再试。</Text>}
            {!!pref && paused && <Text style={text.small}>个性化推荐已暂停，推荐不会参考你的偏好。</Text>}
            {!!pref && !paused && remembered.length === 0 && (
              <Text style={text.small}>还没有记下偏好。聊天时提到预算或品牌，我会记住；也可以在这里手动设置。</Text>
            )}
            {!!pref && !paused && remembered.length > 0 && (
              <View style={s.wrap}>{remembered.map(item => <Text key={item} style={s.memo}>{item}</Text>)}</View>
            )}
          </Pressable>

          <Text style={s.footer}>本地演示商品目录 · 价格与库存仅供演示</Text>
        </View>
      </ScrollView>
      {reading && (
        <View style={s.overlay} accessibilityLiveRegion="polite">
          <View style={s.overlayCard}><ScanLoader size={24} /><Text style={s.overlayText}>正在读取图片…</Text></View>
        </View>
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.paper },
  scroll: { flexGrow: 1 },
  page: { width: '100%', maxWidth: 760, alignSelf: 'center', paddingHorizontal: 20, paddingBottom: 32 },
  topbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 8 },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  wordmark: { fontFamily: fonts.editorial, fontSize: 17, fontWeight: '800', color: colors.ink, letterSpacing: -0.2 },
  greet: { ...text.small, marginTop: 18 },
  headline: { ...text.display, marginTop: 2 },
  search: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 16, paddingLeft: 16, paddingRight: 5, minHeight: 54,
    borderRadius: radii.pill, backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.ink,
  },
  searchInput: { flex: 1, minWidth: 0, fontSize: 15, color: colors.ink, paddingVertical: 12 },
  searchFocused: { borderWidth: 2.5 },
  rowHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 18, marginBottom: 10 },
  refresh: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 28 },
  refreshText: { fontSize: 12, color: colors.muted, fontWeight: '600' },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  hero: { marginTop: 22, padding: 18, borderRadius: radii.lg, backgroundColor: colors.ink },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  heroKicker: { ...text.micro, color: colors.tag },
  heroTitle: { fontFamily: fonts.editorial, fontSize: 24, lineHeight: 31, fontWeight: '800', color: colors.surface, marginTop: 8 },
  heroSub: { fontSize: 13, lineHeight: 19, color: colors.mutedOnInk, marginTop: 8 },
  heroActions: { flexDirection: 'row', gap: 10, marginTop: 18, maxWidth: 440 },
  heroPrimary: {
    flex: 1, minHeight: 48, borderRadius: radii.pill, backgroundColor: colors.tag,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  heroPrimaryText: { fontSize: 15, fontWeight: '800', color: colors.ink },
  heroSecondary: {
    flex: 1, minHeight: 48, borderRadius: radii.pill, borderWidth: 1, borderColor: '#4A4E57',
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  heroSecondaryText: { fontSize: 15, fontWeight: '700', color: colors.surface },
  heroError: { color: '#FFB4A6', fontSize: 13, lineHeight: 19, marginTop: 10 },
  recent: {
    flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 14, padding: 14,
    borderRadius: radii.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.rule,
  },
  recentIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: colors.tag, alignItems: 'center', justifyContent: 'center' },
  recentTitle: { fontSize: 15, fontWeight: '700', color: colors.ink, marginTop: 2 },
  recentMeta: { fontFamily: fonts.mono, fontSize: 12, color: colors.muted },
  section: { marginTop: 26, marginBottom: 12 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 12 },
  tile: { padding: 14, gap: 4, borderRadius: radii.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.rule },
  glyph: {
    width: 56, height: 56, borderRadius: 16, backgroundColor: colors.paper,
    alignItems: 'center', justifyContent: 'center', marginBottom: 6,
  },
  tileName: { fontSize: 15, fontWeight: '800', color: colors.ink },
  tilePrompt: { fontSize: 12, lineHeight: 17, color: colors.muted },
  pref: { marginTop: 14, padding: 16, gap: 10, borderRadius: radii.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.rule },
  prefHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  prefLink: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  prefLinkText: { fontSize: 13, fontWeight: '700', color: colors.ink },
  memo: {
    fontSize: 13, color: colors.ink, paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: radii.sm, backgroundColor: colors.wash, overflow: 'hidden',
  },
  footer: { ...text.micro, textAlign: 'center', marginTop: 28 },
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: colors.scrim, alignItems: 'center', justifyContent: 'center' },
  overlayCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingVertical: 16,
    borderRadius: radii.md, backgroundColor: colors.surface,
  },
  overlayText: { fontSize: 14, fontWeight: '700', color: colors.ink },
});
