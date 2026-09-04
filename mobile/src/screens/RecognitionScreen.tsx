import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Alert, SafeAreaView, ActivityIndicator, Modal, TextInput
} from 'react-native';
import { RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/AppNavigator';
import { searchProducts } from '../api/client';

type Props = {
  route: RouteProp<RootStackParamList, 'Recognition'>;
  navigation: NativeStackNavigationProp<RootStackParamList, 'Recognition'>;
};

type EditingAttr = { key: string; label: string; value: string } | null;

export default function RecognitionScreen({ route, navigation }: Props) {
  const { sessionId, recognition, suggestions, products } = route.params;
  const [loadingCardId, setLoadingCardId] = useState<string | null>(null);
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [editingAttr, setEditingAttr] = useState<EditingAttr>(null);
  const [draftValue, setDraftValue] = useState('');

  const displayValue = (key: string, defaultVal: string) => overrides[key] || defaultVal;

  const openEditAttr = (key: string, label: string, currentVal: string) => {
    setEditingAttr({ key, label, value: currentVal });
    setDraftValue(currentVal);
  };

  const saveEditAttr = () => {
    if (editingAttr && draftValue.trim()) {
      setOverrides(prev => ({ ...prev, [editingAttr.key]: draftValue.trim() }));
    }
    setEditingAttr(null);
    setDraftValue('');
  };

  const handleSuggestionPress = async (card: typeof suggestions[0]) => {
    setLoadingCardId(card.id);
    try {
      const result = await searchProducts(sessionId, card.filter_params);
      navigation.navigate('ProductList', {
        sessionId,
        category: displayValue('category', recognition.category),
        searchKeywords: recognition.search_keywords,
        products: result.products,
      });
    } catch (e) {
      Alert.alert('加载失败', '请确认后端服务正在运行。');
    } finally {
      setLoadingCardId(null);
    }
  };

  const attrs = [
    { key: 'category', label: '类目', value: recognition.category },
    { key: 'brand', label: '品牌', value: recognition.brand || '未知' },
    { key: 'color', label: '颜色', value: recognition.color },
    { key: 'style', label: '风格', value: recognition.style },
  ];

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>返回</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>识别结果</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>商品属性</Text>
          <View style={styles.attrGrid}>
            {attrs.map(({ key, label, value }) => (
              <TouchableOpacity
                key={key}
                style={styles.attrCard}
                onPress={() => openEditAttr(key, label, displayValue(key, value))}
              >
                <Text style={styles.attrLabel}>{label}</Text>
                <Text style={styles.attrValue}>{displayValue(key, value)}</Text>
                <Text style={styles.attrEdit}>编辑</Text>
              </TouchableOpacity>
            ))}
          </View>
          {recognition.key_features.length > 0 && (
            <View style={styles.tagRow}>
              {recognition.key_features.map((f, i) => (
                <View key={i} style={styles.tag}>
                  <Text style={styles.tagText}>{f}</Text>
                </View>
              ))}
            </View>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>购买建议</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.cardScroll}>
            {suggestions.map((card) => (
              <TouchableOpacity
                key={card.id}
                style={styles.suggCard}
                onPress={() => handleSuggestionPress(card)}
                disabled={loadingCardId === card.id}
              >
                {loadingCardId === card.id
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={styles.suggText}>{card.label}</Text>
                }
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        <TouchableOpacity
          style={styles.ctaBtn}
          onPress={() => navigation.navigate('ProductList', {
            sessionId,
            category: displayValue('category', recognition.category),
            searchKeywords: recognition.search_keywords,
            products,
          })}
        >
          <Text style={styles.ctaText}>查看全部商品（{products.length} 件）</Text>
        </TouchableOpacity>
      </ScrollView>

      <Modal transparent visible={!!editingAttr} animationType="fade" onRequestClose={() => setEditingAttr(null)}>
        <View style={styles.modalMask}>
          <View style={styles.modalPanel}>
            <Text style={styles.modalTitle}>修正{editingAttr?.label}</Text>
            <TextInput
              style={styles.modalInput}
              value={draftValue}
              onChangeText={setDraftValue}
              autoFocus
              placeholder="输入新的属性值"
              placeholderTextColor="#9CA3AF"
            />
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setEditingAttr(null)}>
                <Text style={styles.cancelText}>取消</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={saveEditAttr}>
                <Text style={styles.saveText}>保存</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F7F8FA' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
  backBtn: { width: 60 },
  backText: { color: '#2563EB', fontSize: 16, fontWeight: '600' },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#111827' },
  scroll: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 40 },
  section: { marginBottom: 24 },
  sectionTitle: { fontSize: 17, fontWeight: '800', color: '#111827', marginBottom: 12 },
  attrGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  attrCard: { backgroundColor: '#fff', borderRadius: 10, padding: 12, width: '48%', borderWidth: 1, borderColor: '#E5E7EB' },
  attrLabel: { fontSize: 12, color: '#6B7280', marginBottom: 4 },
  attrValue: { fontSize: 15, fontWeight: '700', color: '#111827' },
  attrEdit: { marginTop: 8, color: '#2563EB', fontSize: 12, fontWeight: '700' },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 12 },
  tag: { backgroundColor: '#EFF6FF', borderRadius: 16, paddingHorizontal: 10, paddingVertical: 5 },
  tagText: { fontSize: 12, color: '#2563EB', fontWeight: '600' },
  cardScroll: { marginHorizontal: -4 },
  suggCard: { backgroundColor: '#111827', borderRadius: 18, paddingHorizontal: 16, paddingVertical: 12, marginHorizontal: 4, minWidth: 112, alignItems: 'center', justifyContent: 'center' },
  suggText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  ctaBtn: { backgroundColor: '#2563EB', borderRadius: 16, padding: 18, alignItems: 'center', marginTop: 8 },
  ctaText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  modalMask: { flex: 1, backgroundColor: 'rgba(17, 24, 39, 0.42)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  modalPanel: { width: '100%', maxWidth: 360, backgroundColor: '#fff', borderRadius: 12, padding: 18 },
  modalTitle: { fontSize: 18, fontWeight: '800', color: '#111827', marginBottom: 12 },
  modalInput: { borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 11, fontSize: 15, color: '#111827' },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 16 },
  cancelBtn: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10, backgroundColor: '#F3F4F6' },
  cancelText: { color: '#374151', fontWeight: '700' },
  saveBtn: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10, backgroundColor: '#2563EB' },
  saveText: { color: '#fff', fontWeight: '800' },
});
