import ActionButton from '../components/ActionButton';
import { colors, fonts } from '../theme';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, SafeAreaView, StyleSheet, Text, TextInput, TouchableOpacity, ScrollView, View } from 'react-native';
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
      <View style={styles.header}><ActionButton icon="back" label="返回" onPress={() => navigation.goBack()} /><Text style={styles.title}>导购偏好</Text><View style={{ width: 36 }} /></View>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.tip}>偏好保存在本地演示后端，可随时修改，不会作为真实购物平台账号信息使用。</Text>
        <Text style={styles.label}>常用最高预算（元）</Text><TextInput style={styles.input} value={budgetMax} onChangeText={setBudgetMax} keyboardType="numeric" placeholder="例如 1000" />
        <Text style={styles.label}>偏好品牌</Text><TextInput style={styles.input} value={brands} onChangeText={setBrands} placeholder="用逗号分隔" />
        <Text style={styles.label}>排除品牌</Text><TextInput style={styles.input} value={excluded} onChangeText={setExcluded} placeholder="用逗号分隔" />
        <Text style={styles.label}>补充说明</Text><TextInput style={[styles.input, styles.note]} value={note} onChangeText={setNote} multiline placeholder="例如：敏感肌、偏好轻量款" />
        <TouchableOpacity style={styles.save} onPress={save} disabled={loading}>{loading ? <ActivityIndicator color={colors.surface} /> : <Text style={styles.saveText}>保存偏好</Text>}</TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.paper }, header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.rule }, back: { color: colors.ink, fontWeight: '800' }, title: { fontFamily: fonts.editorial, fontSize: 18, fontWeight: '900', color: colors.ink },
  content: { padding: 24, paddingBottom: 48, width: '100%', maxWidth: 720, alignSelf: 'center' }, tip: { backgroundColor: colors.wash, borderRadius: 3, padding: 13, color: colors.muted, lineHeight: 20 }, label: { marginTop: 19, marginBottom: 7, color: colors.ink, fontWeight: '800' }, input: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.rule, borderRadius: 3, padding: 13, color: colors.ink }, note: { minHeight: 88, textAlignVertical: 'top' }, save: { marginTop: 28, borderRadius: 3, padding: 15, alignItems: 'center', backgroundColor: colors.ink }, saveText: { color: colors.surface, fontSize: 16, fontWeight: '900' },
});
