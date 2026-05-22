import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  SafeAreaView, ScrollView, Alert, ActivityIndicator,
} from 'react-native';
import { Picker } from '@react-native-picker/picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/AppNavigator';
import { getProviders, updateAIConfig, ProvidersResponse } from '../api/client';

type Props = { navigation: NativeStackNavigationProp<RootStackParamList, 'Settings'> };

const STORAGE_KEY = 'ai_config';

const PROVIDER_LABELS: Record<string, string> = {
  anthropic: 'Anthropic (Claude)',
  openai: 'OpenAI (GPT)',
  gemini: 'Google Gemini',
};

export default function SettingsScreen({ navigation }: Props) {
  const [providers, setProviders] = useState<ProvidersResponse | null>(null);
  const [provider, setProvider] = useState('anthropic');
  const [model, setModel] = useState('claude-3-5-sonnet-20241022');
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<'idle' | 'ok' | 'error'>('idle');

  useEffect(() => {
    getProviders().then(setProviders).catch(() => {});
    AsyncStorage.getItem(STORAGE_KEY).then(raw => {
      if (raw) {
        const saved = JSON.parse(raw);
        setProvider(saved.provider || 'anthropic');
        setModel(saved.model || 'claude-3-5-sonnet-20241022');
        setApiKey(saved.api_key || '');
      }
    });
  }, []);

  const currentModels = providers?.[provider as keyof ProvidersResponse] ?? [];

  const handleProviderChange = (p: string) => {
    setProvider(p);
    const models = providers?.[p as keyof ProvidersResponse] ?? [];
    if (models.length > 0) setModel(models[0]);
    setStatus('idle');
  };

  const handleSave = async () => {
    if (!apiKey.trim()) {
      Alert.alert('请填写 API Key');
      return;
    }
    setSaving(true);
    setStatus('idle');
    try {
      await updateAIConfig({ provider, model, api_key: apiKey.trim() });
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ provider, model, api_key: apiKey.trim() }));
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
          {['anthropic', 'openai', 'gemini'].map(p => (
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
          <Picker selectedValue={model} onValueChange={setModel} style={styles.picker}>
            {currentModels.map(m => (
              <Picker.Item key={m} label={m} value={m} />
            ))}
          </Picker>
        </View>

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
  saveBtn: { marginTop: 32, backgroundColor: '#007AFF', borderRadius: 14, padding: 16, alignItems: 'center' },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  statusOk: { marginTop: 12, textAlign: 'center', color: '#34C759', fontSize: 15, fontWeight: '600' },
  statusErr: { marginTop: 12, textAlign: 'center', color: '#FF3B30', fontSize: 15, fontWeight: '600' },
});
