import React, { useCallback, useEffect, useState } from 'react';
import {
  KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/AppNavigator';
import { DEMO_USER_ID, getPreferences, updatePreferences } from '../api/client';
import ActionButton from '../components/ActionButton';
import { ScanLoader } from '../components/Brand';
import Icon from '../components/Icon';
import { IconButton, Toggle } from '../components/ui';
import { PreferenceForm, formFromPreference, preferencePayload } from '../utils/preferences';
import { colors, fonts, radii, text } from '../theme';

type Props = { navigation: NativeStackNavigationProp<RootStackParamList, 'Preferences'> };
type Status = { tone: 'ok' | 'error'; message: string } | null;

function Money({ label, value, onChange, disabled }: {
  label: string; value: string; onChange: (value: string) => void; disabled?: boolean;
}) {
  return (
    <View style={s.money}>
      <Text style={s.moneyLabel}>{label}</Text>
      <Text style={s.yen}>¥</Text>
      <TextInput style={s.moneyInput} value={value} onChangeText={onChange} keyboardType="numeric" editable={!disabled}
        placeholder="不限" placeholderTextColor={colors.faint} accessibilityLabel={`${label}预算`} />
    </View>
  );
}

export default function PreferencesScreen({ navigation }: Props) {
  const [stored, setStored] = useState<Record<string, any> | null>(null);
  const [form, setForm] = useState<PreferenceForm>(() => formFromPreference(null));
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'failed'>('loading');
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<Status>(null);

  const load = useCallback(() => {
    setLoadState('loading');
    getPreferences(DEMO_USER_ID)
      .then(value => {
        setStored(value);
        setForm(formFromPreference(value));
        setLoadState('ready');
      })
      .catch(() => setLoadState('failed'));
  }, []);
  useEffect(() => { load(); }, [load]);

  const edit = (patch: Partial<PreferenceForm>) => {
    setForm(current => ({ ...current, ...patch }));
    setStatus(null);
  };

  const save = async () => {
    // Saving replaces the whole record, so never save a form that failed to load.
    if (loadState !== 'ready' || saving) return;
    const result = preferencePayload(stored, form);
    if ('error' in result) {
      setStatus({ tone: 'error', message: result.error });
      return;
    }
    setSaving(true);
    try {
      const saved = await updatePreferences(DEMO_USER_ID, result.payload);
      setStored(saved);
      setForm(formFromPreference(saved));
      setStatus({ tone: 'ok', message: '已保存，之后的推荐会参考这些偏好。' });
    } catch (error: any) {
      setStatus({ tone: 'error', message: error?.message || '保存失败，请稍后重试。' });
    } finally {
      setSaving(false);
    }
  };

  const memos = [
    ...form.categories.map(value => ({ field: 'categories' as const, value, label: `关注 ${value}` })),
    ...form.styles.map(value => ({ field: 'styles' as const, value, label: value })),
  ];
  const forget = (field: 'categories' | 'styles', value: string) =>
    edit(field === 'categories'
      ? { categories: form.categories.filter(item => item !== value) }
      : { styles: form.styles.filter(item => item !== value) });
  const ready = loadState === 'ready';

  return (
    <SafeAreaView style={s.safe} edges={['top', 'left', 'right', 'bottom']}>
      <View style={s.header}>
        <IconButton icon="back" label="返回" onPress={() => navigation.goBack()} />
        <Text style={s.title} accessibilityRole="header">我的偏好</Text>
        <View style={{ width: 44 }} />
      </View>
      <KeyboardAvoidingView style={s.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView style={s.flex} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
          <Text style={s.lead}>导购挑商品时会参考这些偏好。聊天里提到的预算、品牌和关注的品类，也会自动记在这里，随时可以改。</Text>

          {loadState === 'loading' && (
            <View style={s.center}><ScanLoader size={22} /><Text style={text.small}>正在读取偏好…</Text></View>
          )}
          {loadState === 'failed' && (
            <View style={s.failed} accessibilityRole="alert">
              <Text style={s.failedText}>偏好读取失败。为了不覆盖已经保存的内容，读取成功之前不能保存。</Text>
              <ActionButton icon="refresh" label="重新读取" onPress={load} />
            </View>
          )}

          {ready && (
            <>
              <View style={s.card}>
                <View style={s.switchRow}>
                  <View style={s.flex}>
                    <Text style={s.cardTitle}>个性化推荐</Text>
                    <Text style={text.small}>{form.enabled ? '开启中：推荐会参考下面的偏好。' : '已暂停：推荐暂时不参考下面的偏好。'}</Text>
                  </View>
                  <Toggle value={form.enabled} onChange={enabled => edit({ enabled })} label="个性化推荐" />
                </View>
              </View>

              <View style={[s.card, !form.enabled && s.paused]}>
                <Text style={s.cardTitle}>预算</Text>
                <View style={s.budgetRow}>
                  <Money label="最低" value={form.budgetMin} onChange={budgetMin => edit({ budgetMin })} />
                  <Text style={s.dash}>—</Text>
                  <Money label="最高" value={form.budgetMax} onChange={budgetMax => edit({ budgetMax })} />
                </View>
                <Text style={s.hint}>只填一个也可以，例如最高填 1000 表示「1000 元以内」。</Text>
              </View>

              <View style={[s.card, !form.enabled && s.paused]}>
                <Text style={s.cardTitle}>品牌</Text>
                <Text style={s.label}>优先考虑</Text>
                <TextInput style={s.input} value={form.brands} onChangeText={brands => edit({ brands })}
                  placeholder="例如：华为、Apple 苹果" placeholderTextColor={colors.faint} accessibilityLabel="优先考虑的品牌" />
                <Text style={s.label}>不想看到</Text>
                <TextInput style={s.input} value={form.excluded} onChangeText={excluded => edit({ excluded })}
                  placeholder="用顿号或逗号分隔" placeholderTextColor={colors.faint} accessibilityLabel="不想看到的品牌" />
              </View>

              <View style={[s.card, !form.enabled && s.paused]}>
                <Text style={s.cardTitle}>聊天中记住的</Text>
                {memos.length === 0 ? (
                  <Text style={s.hint}>还没有。和导购聊天时提到「关注护肤」「喜欢简约风」这类偏好，会出现在这里。</Text>
                ) : (
                  <View style={s.wrap}>
                    {memos.map(memo => (
                      <Pressable key={`${memo.field}:${memo.value}`} onPress={() => forget(memo.field, memo.value)}
                        accessibilityRole="button" accessibilityLabel={`忘掉：${memo.label}`}
                        style={({ pressed }) => [s.memo, pressed && { opacity: 0.7 }]}>
                        <Text style={s.memoText}>{memo.label}</Text>
                        <Icon name="close" size={14} color={colors.muted} />
                      </Pressable>
                    ))}
                  </View>
                )}
                <Text style={s.label}>补充说明</Text>
                <TextInput style={[s.input, s.note]} value={form.note} onChangeText={note => edit({ note })} multiline
                  placeholder="例如：敏感肌；偏好轻薄款；不要太花哨" placeholderTextColor={colors.faint} accessibilityLabel="补充说明" />
              </View>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
      <View style={s.footer}>
        {status && (
          <Text style={[s.status, { color: status.tone === 'ok' ? colors.success : colors.error }]}
            accessibilityLiveRegion="polite" accessibilityRole={status.tone === 'error' ? 'alert' : undefined}>
            {status.message}
          </Text>
        )}
        <ActionButton icon="check" label={saving ? '正在保存…' : '保存偏好'} primary disabled={!ready || saving}
          onPress={() => void save()} style={{ alignSelf: 'stretch' }} />
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.paper },
  flex: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 8, paddingVertical: 6, borderBottomWidth: 1, borderColor: colors.rule,
  },
  title: { fontSize: 16, fontWeight: '800', color: colors.ink },
  content: { padding: 20, paddingBottom: 32, gap: 12, width: '100%', maxWidth: 640, alignSelf: 'center' },
  lead: { ...text.small, marginBottom: 4 },
  center: { alignItems: 'center', gap: 10, paddingVertical: 32 },
  failed: { gap: 12, padding: 16, borderRadius: radii.md, backgroundColor: '#FBEAE6', alignItems: 'flex-start' },
  failedText: { color: colors.error, fontSize: 13, lineHeight: 19 },
  card: { padding: 16, borderRadius: radii.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.rule },
  paused: { opacity: 0.55 },
  cardTitle: { fontSize: 15, fontWeight: '800', color: colors.ink, marginBottom: 4 },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  budgetRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  money: {
    flex: 1, flexDirection: 'row', alignItems: 'center', minHeight: 48, paddingHorizontal: 12,
    borderRadius: radii.sm, borderWidth: 1, borderColor: colors.rule, backgroundColor: colors.paper,
  },
  moneyLabel: { fontSize: 12, color: colors.muted, marginRight: 8 },
  yen: { fontFamily: fonts.mono, fontSize: 15, fontWeight: '700', color: colors.ink },
  moneyInput: { flex: 1, minWidth: 0, fontFamily: fonts.mono, fontSize: 16, fontWeight: '700', color: colors.ink, paddingVertical: 10, paddingLeft: 4 },
  dash: { color: colors.faint },
  label: { fontSize: 13, fontWeight: '700', color: colors.ink, marginTop: 12, marginBottom: 6 },
  input: {
    minHeight: 46, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, color: colors.ink,
    borderRadius: radii.sm, borderWidth: 1, borderColor: colors.rule, backgroundColor: colors.paper,
  },
  note: { minHeight: 84, textAlignVertical: 'top' },
  hint: { fontSize: 12, lineHeight: 18, color: colors.muted, marginTop: 8 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6 },
  memo: {
    flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 34, paddingLeft: 12, paddingRight: 10,
    borderRadius: radii.pill, backgroundColor: colors.tag,
  },
  memoText: { fontSize: 13, fontWeight: '600', color: colors.ink },
  footer: {
    gap: 8, paddingHorizontal: 20, paddingTop: 10, paddingBottom: 12, borderTopWidth: 1, borderColor: colors.rule,
    width: '100%', maxWidth: 640, alignSelf: 'center',
  },
  status: { fontSize: 13, lineHeight: 19 },
});
