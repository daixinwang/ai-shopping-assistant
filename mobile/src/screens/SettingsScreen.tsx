import ActionButton from '../components/ActionButton';
import { colors, fonts } from '../theme';
import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  SafeAreaView, ScrollView, Alert, ActivityIndicator,
} from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import storage from '../utils/storage';
import { RootStackParamList } from '../navigation/AppNavigator';
import { getProviders, updateAIConfig, ProvidersResponse } from '../api/client';

type Props = { navigation: NativeStackNavigationProp<RootStackParamList, 'Settings'> };

const STORAGE_KEY = 'ai_config';
const CUSTOM_SENTINEL = '__custom__';

const PROVIDER_LABELS: Record<string, string> = {
  anthropic: 'Anthropic',
  openai: 'OpenAI',
  gemini: 'Gemini',
  doubao: '豆包',
};

const FALLBACK_PROVIDERS: ProvidersResponse = {
  anthropic: ['claude-sonnet-4-5', 'claude-3-5-sonnet-20241022'],
  openai: ['gpt-4o', 'gpt-4o-mini', 'o4-mini'],
  gemini: ['gemini-2.5-flash-preview-05-20', 'gemini-2.0-flash', 'gemini-1.5-pro'],
  doubao: ['doubao-seed-2.0-lite', 'doubao-vision-pro-32k'],
};

export default function SettingsScreen({ navigation }: Props) {
  const [providers, setProviders] = useState<ProvidersResponse>(FALLBACK_PROVIDERS);
  const [provider, setProvider] = useState('doubao');
  const [pickerModel, setPickerModel] = useState('doubao-seed-2.0-lite');
  const [customModelText, setCustomModelText] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<'idle' | 'ok' | 'error'>('idle');

  const isCustomModel = pickerModel === CUSTOM_SENTINEL;
  const effectiveModel = isCustomModel ? customModelText.trim() : pickerModel;

  useEffect(() => {
    getProviders().then(setProviders).catch(() => setProviders(FALLBACK_PROVIDERS));
    storage.getItem(STORAGE_KEY).then(raw => {
      if (!raw) return;
      const saved = JSON.parse(raw);
      const savedProvider = saved.provider || 'doubao';
      const savedModel = saved.model || '';
      setProvider(savedProvider);
      setApiKey(saved.api_key || '');

      const list = FALLBACK_PROVIDERS[savedProvider as keyof ProvidersResponse] ?? [];
      if (list.includes(savedModel)) {
        setPickerModel(savedModel);
      } else if (savedModel) {
        setPickerModel(CUSTOM_SENTINEL);
        setCustomModelText(savedModel);
      }
    });
  }, []);

  const currentModels = providers?.[provider as keyof ProvidersResponse] ?? [];

  const handleProviderChange = (p: string) => {
    setProvider(p);
    const models = providers?.[p as keyof ProvidersResponse] ?? [];
    setPickerModel(models[0] ?? CUSTOM_SENTINEL);
    setCustomModelText('');
    setStatus('idle');
  };

  const handleSave = async () => {
    if (!effectiveModel) {
      Alert.alert('请填写模型名称');
      return;
    }
    setSaving(true);
    setStatus('idle');
    try {
      const payload = { provider, model: effectiveModel, api_key: apiKey.trim() };
      await updateAIConfig(payload);
      await storage.setItem(STORAGE_KEY, JSON.stringify(payload));
      setStatus('ok');
    } catch (e: any) {
      setStatus('error');
      Alert.alert('保存失败', e?.response?.data?.detail || '请检查后端服务和网络连接。');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>返回</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>AI 设置</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.tip}>不填写 API Key 时，系统会使用本地 demo 识别结果，方便离线演示。</Text>

        <Text style={styles.label}>AI Provider</Text>
        <View style={styles.providerRow}>
          {Object.keys(PROVIDER_LABELS).map(p => (
            <TouchableOpacity
              key={p}
              style={[styles.providerBtn, provider === p && styles.providerBtnActive]}
              onPress={() => handleProviderChange(p)}
            >
              <Text style={[styles.providerText, provider === p && styles.providerTextActive]}>
                {PROVIDER_LABELS[p]}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.label}>API Key</Text>
        <View style={styles.keyRow}>
          <TextInput
            style={styles.keyInput}
            placeholder="可留空使用本地演示模式"
            placeholderTextColor={colors.muted}
            value={apiKey}
            onChangeText={text => { setApiKey(text); setStatus('idle'); }}
            secureTextEntry={!showKey}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <TouchableOpacity onPress={() => setShowKey(v => !v)} style={styles.eyeBtn}>
            <Text style={styles.eyeText}>{showKey ? '隐藏' : '显示'}</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.label}>模型</Text>
        <View style={styles.pickerWrapper}>
          <Picker selectedValue={pickerModel} onValueChange={value => {
            setPickerModel(value);
            if (value !== CUSTOM_SENTINEL) setCustomModelText('');
            setStatus('idle');
          }} style={styles.picker}>
            {currentModels.map(m => (
              <Picker.Item key={m} label={m} value={m} />
            ))}
            <Picker.Item label="自定义模型 ID" value={CUSTOM_SENTINEL} />
          </Picker>
        </View>

        {isCustomModel && (
          <TextInput
            style={styles.customModelInput}
            placeholder="例如：doubao-seed-2.0-lite"
            placeholderTextColor={colors.muted}
            value={customModelText}
            onChangeText={text => { setCustomModelText(text); setStatus('idle'); }}
            autoCapitalize="none"
            autoCorrect={false}
          />
        )}

        <TouchableOpacity style={styles.saveBtn} onPress={handleSave} disabled={saving}>
          {saving ? <ActivityIndicator color={colors.surface} /> : <Text style={styles.saveBtnText}>保存配置</Text>}
        </TouchableOpacity>

        {status === 'ok' && <Text style={styles.statusOk}>配置已保存</Text>}
        {status === 'error' && <Text style={styles.statusErr}>保存失败，请检查后端服务</Text>}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.paper },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.rule },
  backBtn: { width: 60 },
  backText: { color: colors.ink, fontSize: 16, fontWeight: '600' },
  headerTitle: { fontFamily: fonts.editorial, fontSize: 18, fontWeight: '800', color: colors.ink },
  content: { padding: 20 },
  tip: { fontSize: 13, color: colors.muted, lineHeight: 20, backgroundColor: colors.wash, padding: 12, borderRadius: 3, borderWidth: 1, borderColor: colors.rule },
  label: { fontSize: 14, fontWeight: '800', color: colors.ink, marginTop: 20, marginBottom: 8 },
  providerRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  providerBtn: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 3, borderWidth: 1, borderColor: colors.rule, backgroundColor: colors.surface },
  providerBtnActive: { borderColor: colors.ink, backgroundColor: colors.ink },
  providerText: { fontSize: 13, color: colors.ink, fontWeight: '700' },
  providerTextActive: { color: colors.surface },
  keyRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: 3, borderWidth: 1, borderColor: colors.rule },
  keyInput: { flex: 1, padding: 14, fontSize: 14, color: colors.ink },
  eyeBtn: { padding: 12 },
  eyeText: { fontSize: 13, color: colors.ink, fontWeight: '800' },
  pickerWrapper: { backgroundColor: colors.surface, borderRadius: 3, borderWidth: 1, borderColor: colors.rule, overflow: 'hidden' },
  picker: { height: 50 },
  customModelInput: { marginTop: 8, backgroundColor: colors.surface, borderRadius: 3, borderWidth: 1, borderColor: colors.ink, padding: 14, fontSize: 14, color: colors.ink },
  saveBtn: { marginTop: 28, backgroundColor: colors.ink, borderRadius: 3, padding: 16, alignItems: 'center' },
  saveBtnText: { color: colors.surface, fontSize: 16, fontWeight: '800' },
  statusOk: { marginTop: 12, textAlign: 'center', color: colors.success, fontSize: 15, fontWeight: '800' },
  statusErr: { marginTop: 12, textAlign: 'center', color: colors.error, fontSize: 15, fontWeight: '800' },
});
