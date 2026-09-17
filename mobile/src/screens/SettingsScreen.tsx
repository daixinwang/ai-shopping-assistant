import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/AppNavigator';
import { AIConfigPayload, getAIConfig, updateAIConfig, testAIConfig } from '../api/client';
import ActionButton from '../components/ActionButton';
import storage from '../utils/storage';
import { colors, fonts } from '../theme';

type Props = { navigation: NativeStackNavigationProp<RootStackParamList, 'Settings'> };
const STORAGE_KEY = 'ai_config';
const DEFAULT_URLS: Record<string, string> = {
  doubao: 'https://ark.cn-beijing.volces.com/api/v3',
  openai: 'https://api.openai.com/v1',
};

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

  return <SafeAreaView style={s.safe}>
    <View style={s.header}><ActionButton icon="back" label="返回" onPress={() => navigation.goBack()} disabled={!!busy} /><Text style={s.title}>模型 API 设置</Text><View style={{ width: 76 }} /></View>
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.content}>
      <Text style={s.kicker}>MODEL CONNECTION / 模型连接</Text>
      <Text style={s.tip}>在这里配置导购使用的模型。保存后无需编辑 .env；API Key 仅保存在后端本机，不会通过配置查询返回。</Text>
      {!!notice && <Text style={s.note}>{notice}</Text>}
      <Text style={s.label}>接入方式</Text>
      <View style={s.row}>{[['doubao', '豆包 / 火山方舟'], ['openai', 'OpenAI 兼容']].map(([id, label]) => <ActionButton key={id} icon="settings" label={label} selected={provider === id} disabled={loading || !!busy} onPress={() => { setProvider(id); setBaseUrl(DEFAULT_URLS[id]); setApiKey(''); setModel(''); setKeySet(false); changed(); }} />)}</View>
      <Text style={s.label}>Base URL</Text>
      <TextInput accessibilityLabel="Base URL" style={s.input} value={baseUrl} onChangeText={value => { setBaseUrl(value); changed(); }} autoCapitalize="none" autoCorrect={false} editable={!loading && !busy} placeholder="粘贴服务商的 OpenAI 兼容基础地址" placeholderTextColor={colors.muted} />
      <Text style={s.hint}>默认地址为普通 API 示例。套餐请填写套餐对应地址，不要包含 /chat/completions。</Text>
      <Text style={s.label}>模型 ID</Text>
      <TextInput accessibilityLabel="模型 ID" style={s.input} value={model} onChangeText={value => { setModel(value); changed(); }} autoCapitalize="none" autoCorrect={false} editable={!loading && !busy} placeholder="从服务商控制台复制模型 ID 或接入点 ID" placeholderTextColor={colors.muted} />
      <Text style={s.hint}>图片找物需要支持图片输入；导购还会使用工具调用。</Text>
      <Text style={s.label}>API Key{keySet ? ' · 已设置' : ''}</Text>
      <View style={s.keyRow}><TextInput accessibilityLabel="API Key" style={s.keyInput} value={apiKey} onChangeText={value => { setApiKey(value); changed(); }} secureTextEntry={!showKey} autoCapitalize="none" autoCorrect={false} editable={!loading && !busy} placeholder={keySet ? '留空保留原 Key；更换地址时请重新填写' : '粘贴与地址、模型匹配的 API Key'} placeholderTextColor={colors.muted} /><TouchableOpacity accessibilityRole="button" accessibilityLabel={showKey ? '隐藏密钥' : '显示密钥'} style={s.show} onPress={() => setShowKey(value => !value)}><Text style={s.showText}>{showKey ? '隐藏' : '显示'}</Text></TouchableOpacity></View>
      <View style={[s.row, { marginTop: 28 }]}><ActionButton icon="check" label={busy === 'test' ? '正在测试…' : '测试连接'} onPress={() => void execute('test')} disabled={loading || !!busy} /><ActionButton icon="settings" label={busy === 'save' ? '正在保存…' : '保存配置'} primary onPress={() => void execute('save')} disabled={loading || !!busy} /></View>
      <Text style={s.hint}>测试连接会发送一条简短请求，可能消耗少量模型额度。</Text>
      {!!message && <Text accessibilityRole={error ? 'alert' : undefined} accessibilityLiveRegion="polite" style={[s.feedback, { color: error ? colors.error : colors.success }]}>{message}</Text>}
    </ScrollView>
  </SafeAreaView>;
}
const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.paper }, header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1, borderColor: colors.rule, backgroundColor: colors.surface }, title: { fontFamily: fonts.editorial, fontSize: 18, color: colors.ink, fontWeight: '700' },
  content: { padding: 24, paddingBottom: 48, width: '100%', maxWidth: 760, alignSelf: 'center' }, kicker: { color: colors.muted, fontSize: 11, letterSpacing: 1, marginBottom: 14 }, tip: { backgroundColor: colors.wash, color: colors.ink, lineHeight: 23, padding: 14, borderWidth: 1, borderColor: colors.rule }, note: { fontSize: 12, lineHeight: 21, color: colors.muted, marginTop: 12 },
  label: { fontSize: 14, fontWeight: '700', color: colors.ink, marginTop: 22, marginBottom: 9 }, row: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 }, input: { minHeight: 48, borderWidth: 1, borderColor: colors.rule, backgroundColor: colors.surface, color: colors.ink, padding: 13, borderRadius: 3 }, hint: { fontSize: 11, color: colors.muted, lineHeight: 19, marginTop: 7 }, keyRow: { flexDirection: 'row', borderWidth: 1, borderColor: colors.rule, backgroundColor: colors.surface, borderRadius: 3 }, keyInput: { minHeight: 48, flex: 1, padding: 13, color: colors.ink }, show: { minWidth: 48, justifyContent: 'center', padding: 10 }, showText: { color: colors.ink, fontSize: 12 }, feedback: { marginTop: 18, lineHeight: 23 },
});
