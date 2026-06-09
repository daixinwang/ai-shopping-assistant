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
  anthropic: 'Anthropic (Claude)',
  openai: 'OpenAI (GPT)',
  gemini: 'Google Gemini',
  doubao: '豆包 (Doubao)',
};

const FALLBACK_PROVIDERS: ProvidersResponse = {
  anthropic: [
    'claude-opus-4-5',
    'claude-sonnet-4-5',
    'claude-haiku-4-5-20251001',
    'claude-3-5-sonnet-20241022',
    'claude-3-5-haiku-20241022',
    'claude-3-opus-20240229',
    'claude-3-sonnet-20240229',
    'claude-3-haiku-20240307',
  ],
  openai: [
    'gpt-4o',
    'gpt-4o-mini',
    'gpt-4-turbo',
    'gpt-4',
    'gpt-3.5-turbo',
    'o1',
    'o1-mini',
    'o3-mini',
    'o4-mini',
  ],
  gemini: [
    'gemini-2.5-pro-preview-05-06',
    'gemini-2.5-flash-preview-05-20',
    'gemini-2.0-flash',
    'gemini-1.5-pro',
    'gemini-1.5-flash',
    'gemini-1.5-flash-8b',
  ],
  doubao: [
    'doubao-seed-2.0',
    'doubao-seed-2.0-lite',
    'doubao-pro-32k',
    'doubao-pro-4k',
    'doubao-lite-32k',
    'doubao-lite-4k',
    'doubao-vision-pro-32k',
  ],
};

export default function SettingsScreen({ navigation }: Props) {
  const [providers, setProviders] = useState<ProvidersResponse | null>(null);
  const [provider, setProvider] = useState('anthropic');
  const [pickerModel, setPickerModel] = useState('claude-sonnet-4-5');
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
      if (raw) {
        const saved = JSON.parse(raw);
        const savedProvider = saved.provider || 'anthropic';
        const savedModel = saved.model || '';
        setProvider(savedProvider);
        setApiKey(saved.api_key || '');
        // 判断保存的模型是否在预设列表里
        const list = FALLBACK_PROVIDERS[savedProvider as keyof ProvidersResponse] ?? [];
        if (list.includes(savedModel)) {
          setPickerModel(savedModel);
        } else if (savedModel) {
          setPickerModel(CUSTOM_SENTINEL);
          setCustomModelText(savedModel);
        }
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

  const handlePickerChange = (value: string) => {
    setPickerModel(value);
    if (value !== CUSTOM_SENTINEL) setCustomModelText('');
    setStatus('idle');
  };

  const handleSave = async () => {
    if (!apiKey.trim()) {
      Alert.alert('请填写 API Key');
      return;
    }
    if (!effectiveModel) {
      Alert.alert('请填写模型名称');
      return;
    }
    setSaving(true);
    setStatus('idle');
    try {
      await updateAIConfig({ provider, model: effectiveModel, api_key: apiKey.trim() });
      await storage.setItem(STORAGE_KEY, JSON.stringify({ provider, model: effectiveModel, api_key: apiKey.trim() }));
      setStatus('ok');
    } catch (e: any) {
      setStatus('error');
      Alert.alert('保存失败', e?.response?.data?.detail || '请检查 API Key 和网络连接');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>← 返回</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>AI 设置</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.label}>AI 提供商</Text>
        <View style={styles.providerRow}>
          {['anthropic', 'openai', 'gemini', 'doubao'].map(p => (
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
            placeholder="请输入 API Key"
            placeholderTextColor="#aaa"
            value={apiKey}
            onChangeText={text => { setApiKey(text); setStatus('idle'); }}
            secureTextEntry={!showKey}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <TouchableOpacity onPress={() => setShowKey(v => !v)} style={styles.eyeBtn}>
            <Text style={styles.eyeText}>{showKey ? '🙈' : '👁️'}</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.label}>模型</Text>
        <View style={styles.pickerWrapper}>
          <Picker selectedValue={pickerModel} onValueChange={handlePickerChange} style={styles.picker}>
            {currentModels.map(m => (
              <Picker.Item key={m} label={m} value={m} />
            ))}
            <Picker.Item label="自定义输入..." value={CUSTOM_SENTINEL} />
          </Picker>
        </View>

        {isCustomModel && (
          <TextInput
            style={styles.customModelInput}
            placeholder="输入模型 ID 或 Endpoint，例如：doubao-pro-32k"
            placeholderTextColor="#aaa"
            value={customModelText}
            onChangeText={text => { setCustomModelText(text); setStatus('idle'); }}
            autoCapitalize="none"
            autoCorrect={false}
          />
        )}

        <TouchableOpacity style={styles.saveBtn} onPress={handleSave} disabled={saving}>
          {saving
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.saveBtnText}>保存并测试连接</Text>
          }
        </TouchableOpacity>

        {status === 'ok' && <Text style={styles.statusOk}>✅ 连接成功，配置已保存</Text>}
        {status === 'error' && <Text style={styles.statusErr}>❌ 连接失败，请检查 Key</Text>}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#f5f5f5' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#eee' },
  backBtn: { width: 60 },
  backText: { color: '#007AFF', fontSize: 16 },
  headerTitle: { fontSize: 18, fontWeight: '600', color: '#333' },
  content: { padding: 20 },
  label: { fontSize: 14, fontWeight: '600', color: '#555', marginTop: 20, marginBottom: 8 },
  providerRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  providerBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1.5, borderColor: '#ddd', backgroundColor: '#fff' },
  providerBtnActive: { borderColor: '#007AFF', backgroundColor: '#007AFF' },
  providerText: { fontSize: 13, color: '#555' },
  providerTextActive: { color: '#fff', fontWeight: '600' },
  keyRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: '#ddd' },
  keyInput: { flex: 1, padding: 14, fontSize: 14, color: '#333' },
  eyeBtn: { padding: 12 },
  eyeText: { fontSize: 18 },
  pickerWrapper: { backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: '#ddd', overflow: 'hidden' },
  picker: { height: 50 },
  customModelInput: { marginTop: 8, backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: '#007AFF', padding: 14, fontSize: 14, color: '#333' },
  saveBtn: { marginTop: 32, backgroundColor: '#007AFF', borderRadius: 14, padding: 16, alignItems: 'center' },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  statusOk: { marginTop: 12, textAlign: 'center', color: '#34C759', fontSize: 15, fontWeight: '600' },
  statusErr: { marginTop: 12, textAlign: 'center', color: '#FF3B30', fontSize: 15, fontWeight: '600' },
});
