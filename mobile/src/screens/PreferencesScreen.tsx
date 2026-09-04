import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, SafeAreaView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/AppNavigator';
import { getPreferences, updatePreferences } from '../api/client';

type Props = { navigation: NativeStackNavigationProp<RootStackParamList, 'Preferences'> };
const USER_ID = 'mobile-demo-user';

export default function PreferencesScreen({ navigation }: Props) {
  const [budgetMax, setBudgetMax] = useState('');
  const [brands, setBrands] = useState('');
  const [excluded, setExcluded] = useState('');
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getPreferences(USER_ID).then(value => {
      setBudgetMax(value.budget_max == null ? '' : String(value.budget_max));
      setBrands((value.brand_include || []).join('、'));
      setExcluded((value.brand_exclude || []).join('、'));
      setNote(value.preference_note || value.notes || '');
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const save = async () => {
    setLoading(true);
    try {
      await updatePreferences(USER_ID, {
        personalization_enabled: true,
        budget_max: budgetMax ? Number(budgetMax) : null,
        brand_include: brands.split(/[、,，]/).map(v => v.trim()).filter(Boolean),
        brand_exclude: excluded.split(/[、,，]/).map(v => v.trim()).filter(Boolean),
        preference_note: note || null,
      });
      Alert.alert('已保存', '之后的推荐会参考这些偏好。');
    } catch (error: any) { Alert.alert('保存失败', error?.message || '请稍后重试'); }
    finally { setLoading(false); }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}><TouchableOpacity onPress={() => navigation.goBack()}><Text style={styles.back}>返回</Text></TouchableOpacity><Text style={styles.title}>导购偏好</Text><View style={{ width: 36 }} /></View>
      <View style={styles.content}>
        <Text style={styles.tip}>偏好保存在本地演示后端，可随时修改，不会作为真实购物平台账号信息使用。</Text>
        <Text style={styles.label}>常用最高预算（元）</Text><TextInput style={styles.input} value={budgetMax} onChangeText={setBudgetMax} keyboardType="numeric" placeholder="例如 1000" />
        <Text style={styles.label}>偏好品牌</Text><TextInput style={styles.input} value={brands} onChangeText={setBrands} placeholder="用逗号分隔" />
        <Text style={styles.label}>排除品牌</Text><TextInput style={styles.input} value={excluded} onChangeText={setExcluded} placeholder="用逗号分隔" />
        <Text style={styles.label}>补充说明</Text><TextInput style={[styles.input, styles.note]} value={note} onChangeText={setNote} multiline placeholder="例如：敏感肌、偏好轻量款" />
        <TouchableOpacity style={styles.save} onPress={save} disabled={loading}>{loading ? <ActivityIndicator color="#FFF" /> : <Text style={styles.saveText}>保存偏好</Text>}</TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F4F6F8' }, header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, backgroundColor: '#FFF', borderBottomWidth: 1, borderBottomColor: '#E5E7EB' }, back: { color: '#2563EB', fontWeight: '800' }, title: { fontSize: 18, fontWeight: '900', color: '#111827' },
  content: { padding: 20 }, tip: { backgroundColor: '#E8EEF9', borderRadius: 12, padding: 13, color: '#475569', lineHeight: 20 }, label: { marginTop: 19, marginBottom: 7, color: '#334155', fontWeight: '800' }, input: { backgroundColor: '#FFF', borderWidth: 1, borderColor: '#D8DEE8', borderRadius: 12, padding: 13, color: '#111827' }, note: { minHeight: 88, textAlignVertical: 'top' }, save: { marginTop: 28, borderRadius: 14, padding: 15, alignItems: 'center', backgroundColor: '#2563EB' }, saveText: { color: '#FFF', fontSize: 16, fontWeight: '900' },
});
