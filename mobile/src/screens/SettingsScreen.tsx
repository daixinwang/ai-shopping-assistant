import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, ScrollView, StyleSheet, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/AppNavigator';
import { AIConfigPayload, getAIConfig, updateAIConfig, testAIConfig } from '../api/client';
import ActionButton from '../components/ActionButton';
import Icon from '../components/Icon';
import { Chip, IconButton } from '../components/ui';
import storage from '../utils/storage';
import { colors, fonts, radii } from '../theme';

type Props = { navigation: NativeStackNavigationProp<RootStackParamList, 'Settings'> };
const STORAGE_KEY = 'ai_config';
const DEFAULT_URLS: Record<string, string> = {
  doubao: 'https://ark.cn-beijing.volces.com/api/v3',
  openai: 'https://api.openai.com/v1',
};
const PROVIDERS: [string, string][] = [['doubao', '豆包 / 火山方舟'], ['openai', 'OpenAI 兼容']];

export default function SettingsScreen({ navigation }: Props) {
  const [provider, setProvider] = useState('doubao');
  const [baseUrl, setBaseUrl] = useState(DEFAULT_URLS.doubao);
  const [model, setModel] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [keySet, setKeySet] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<'save' | 'test' | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState(false);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const current = await getAIConfig();
        if (!mounted) return;
        if (current.key_set || current.model) {
          setProvider(current.provider === 'openai' ? 'openai' : 'doubao');
          setBaseUrl(current.base_url || DEFAULT_URLS[current.provider] || '');
          setModel(current.model);
          setKeySet(current.key_set);
          setNotice(current.source === 'saved' ? '已读取后端保存的配置，重启后仍然生效。' : '当前读取环境变量配置；保存后将优先使用页面配置。');
        } else {
          const raw = await storage.getItem(STORAGE_KEY);
          if (!mounted || !raw) return;
          try {
            const old = JSON.parse(raw);
            if (!old.api_key) return;
            if (!['doubao', 'openai'].includes(old.provider)) {
              setNotice('检测到旧版配置。主导购支持 OpenAI 兼容协议，请重新填写对应接入信息。');
              return;
            }
            setProvider(old.provider);
            setBaseUrl(typeof old.base_url === 'string' ? old.base_url : DEFAULT_URLS[old.provider]);
            setModel(typeof old.model === 'string' ? old.model : '');
            setApiKey(typeof old.api_key === 'string' ? old.api_key : '');
            setNotice('已填入旧版本机配置。请核对 Base URL，保存后主导购才能使用。');
          } catch { setNotice('旧版配置无法读取，请重新填写。'); }
        }
      } catch {
        if (mounted) { setError(true); setMessage('无法读取配置，请先启动后端；可以填写后重试保存。'); }
      } finally { if (mounted) setLoading(false); }
    };
    void load();
    return () => { mounted = false; };
  }, []);

  const changed = () => { setMessage(''); setError(false); };
  const execute = async (action: 'save' | 'test') => {
    if (busy || loading) return;
    if (!baseUrl.trim() || !model.trim() || (!apiKey.trim() && !keySet)) {
      setError(true); setMessage('请填写 Base URL、模型 ID 和 API Key。'); return;
    }
    const payload: AIConfigPayload = { provider, base_url: baseUrl.trim(), model: model.trim(), api_key: apiKey.trim() };
    setBusy(action); setError(false); setMessage('');
    try {
      if (action === 'test') {
        const result = await testAIConfig(payload);
        setMessage(`${result.message} 测试不会保存配置；图片和工具调用能力需另行确认。`);
      } else {
        const saved = await updateAIConfig(payload);
        setBaseUrl(saved.base_url); setKeySet(saved.key_set); setApiKey('');
        setNotice('已保存到后端，主导购与图片识别立即使用新配置。');
        setMessage('配置已保存，无需重启。尚未验证连接时，请再点“测试连接”。');
        try {
          // Retire the old browser credential without returning server credentials to the client.
          await storage.setItem(STORAGE_KEY, JSON.stringify({ version: 2, provider: saved.provider, model: saved.model, base_url: saved.base_url }));
        } catch { setMessage('后端已保存；旧版浏览器配置未能清理，请检查本机存储权限。'); }
      }
    } catch (err: any) {
      setError(true);
      const detail = err?.response?.data?.detail;
      setMessage(typeof detail === 'string' ? detail : '操作失败，请检查填写内容和后端连接。');
    } finally { setBusy(null); }
  };

  const editable = !loading && !busy;
  const connected = keySet && !!model;
  return (
    <SafeAreaView style={s.safe} edges={['top', 'left', 'right', 'bottom']}>
      <View style={s.header}>
        <IconButton icon="back" label="返回" onPress={() => navigation.goBack()} disabled={!!busy} />
        <Text style={s.title} accessibilityRole="header">服务设置</Text>
        <View style={{ width: 44 }} />
      </View>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.content}>
        <View style={s.status}>
          <View style={[s.dot, { backgroundColor: connected ? colors.success : colors.faint }]} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={s.statusTitle}>{loading ? '正在读取配置…' : connected ? '模型已接入' : '还没有接入模型'}</Text>
            {connected && <Text style={s.statusModel} numberOfLines={1}>{model}</Text>}
            <Text style={s.statusNote}>{notice || 'API Key 只保存在后端本机，查询配置时不会返回。'}</Text>
          </View>
        </View>

        <View style={s.card}>
          <Text style={s.label}>接入方式</Text>
          <View style={s.row}>
            {PROVIDERS.map(([id, label]) => (
              <Chip key={id} label={label} selected={provider === id} disabled={!editable}
                onPress={() => { setProvider(id); setBaseUrl(DEFAULT_URLS[id]); setApiKey(''); setModel(''); setKeySet(false); changed(); }} />
            ))}
          </View>

          <Text style={s.label}>Base URL</Text>
          <TextInput accessibilityLabel="Base URL" style={s.input} value={baseUrl} onChangeText={value => { setBaseUrl(value); changed(); }}
            autoCapitalize="none" autoCorrect={false} editable={editable}
            placeholder="粘贴服务商的 OpenAI 兼容基础地址" placeholderTextColor={colors.faint} />
          <Text style={s.hint}>默认地址为普通 API 示例。套餐请填写套餐对应地址，不要包含 /chat/completions。</Text>

          <Text style={s.label}>模型 ID</Text>
          <TextInput accessibilityLabel="模型 ID" style={s.input} value={model} onChangeText={value => { setModel(value); changed(); }}
            autoCapitalize="none" autoCorrect={false} editable={editable}
            placeholder="从服务商控制台复制模型 ID 或接入点 ID" placeholderTextColor={colors.faint} />
          <Text style={s.hint}>图片找物需要支持图片输入；导购还会使用工具调用。</Text>

          <Text style={s.label}>API Key{keySet ? ' · 已设置' : ''}</Text>
          <View style={s.keyRow}>
            <TextInput accessibilityLabel="API Key" style={s.keyInput} value={apiKey} onChangeText={value => { setApiKey(value); changed(); }}
              secureTextEntry={!showKey} autoCapitalize="none" autoCorrect={false} editable={editable}
              placeholder={keySet ? '留空保留原 Key；更换地址时请重新填写' : '粘贴与地址、模型匹配的 API Key'} placeholderTextColor={colors.faint} />
            <Pressable accessibilityRole="button" accessibilityLabel={showKey ? '隐藏密钥' : '显示密钥'} style={s.show}
              onPress={() => setShowKey(value => !value)}>
              <Text style={s.showText}>{showKey ? '隐藏' : '显示'}</Text>
            </Pressable>
          </View>
        </View>

        {!!message && (
          <View style={[s.feedback, error ? s.feedbackError : s.feedbackOk]}
            accessibilityRole={error ? 'alert' : undefined} accessibilityLiveRegion="polite">
            <Icon name={error ? 'detail' : 'verified'} color={error ? colors.error : colors.success} />
            <Text style={[s.feedbackText, { color: error ? colors.error : colors.success }]}>{message}</Text>
          </View>
        )}
        <Text style={s.hint}>测试连接会发送一条简短请求，可能消耗少量模型额度。</Text>
      </ScrollView>
      <View style={s.footer}>
        <ActionButton icon="verified" label={busy === 'test' ? '正在测试…' : '测试连接'} onPress={() => void execute('test')} disabled={loading || !!busy} />
        <ActionButton icon="check" label={busy === 'save' ? '正在保存…' : '保存配置'} primary onPress={() => void execute('save')}
          disabled={loading || !!busy} style={{ flex: 1 }} />
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.paper },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 8, paddingVertical: 6, borderBottomWidth: 1, borderColor: colors.rule,
  },
  title: { fontSize: 16, fontWeight: '800', color: colors.ink },
  content: { padding: 20, paddingBottom: 32, gap: 12, width: '100%', maxWidth: 640, alignSelf: 'center' },
  status: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 12, padding: 16,
    borderRadius: radii.md, backgroundColor: colors.ink,
  },
  dot: { width: 10, height: 10, borderRadius: 5, marginTop: 6 },
  statusTitle: { fontSize: 15, fontWeight: '800', color: colors.surface },
  statusModel: { fontFamily: fonts.mono, fontSize: 13, color: colors.tag },
  statusNote: { fontSize: 13, lineHeight: 19, color: colors.mutedOnInk },
  card: { padding: 16, borderRadius: radii.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.rule },
  label: { fontSize: 13, fontWeight: '700', color: colors.ink, marginTop: 14, marginBottom: 8 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  input: {
    minHeight: 46, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: colors.ink,
    borderRadius: radii.sm, borderWidth: 1, borderColor: colors.rule, backgroundColor: colors.paper,
  },
  hint: { fontSize: 12, lineHeight: 18, color: colors.muted, marginTop: 6 },
  keyRow: { flexDirection: 'row', borderRadius: radii.sm, borderWidth: 1, borderColor: colors.rule, backgroundColor: colors.paper },
  keyInput: { flex: 1, minWidth: 0, minHeight: 46, paddingHorizontal: 12, fontSize: 14, color: colors.ink },
  show: { minWidth: 56, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10 },
  showText: { fontSize: 13, fontWeight: '700', color: colors.ink },
  feedback: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, padding: 12, borderRadius: radii.md },
  feedbackOk: { backgroundColor: '#E3F2EA' },
  feedbackError: { backgroundColor: '#FBEAE6' },
  feedbackText: { flex: 1, fontSize: 13, lineHeight: 20 },
  footer: {
    flexDirection: 'row', gap: 10, paddingHorizontal: 20, paddingTop: 10, paddingBottom: 12,
    borderTopWidth: 1, borderColor: colors.rule, width: '100%', maxWidth: 640, alignSelf: 'center',
  },
});
