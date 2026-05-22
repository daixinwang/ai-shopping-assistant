import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Alert, SafeAreaView, ActivityIndicator, Platform
} from 'react-native';
import { RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/AppNavigator';
import { searchProducts } from '../api/client';

type Props = {
  route: RouteProp<RootStackParamList, 'Recognition'>;
  navigation: NativeStackNavigationProp<RootStackParamList, 'Recognition'>;
};

export default function RecognitionScreen({ route, navigation }: Props) {
  const { sessionId, recognition, suggestions, products } = route.params;
  const [loadingCardId, setLoadingCardId] = useState<string | null>(null);
  // 可修正的属性（本地覆盖显示）
  const [overrides, setOverrides] = useState<Record<string, string>>({});

  const displayValue = (key: string, defaultVal: string) =>
    overrides[key] || defaultVal;

  const handleEditAttr = (key: string, label: string, currentVal: string) => {
    if (Platform.OS === 'android') {
      // Android 不支持 Alert.prompt，提示用户
      Alert.alert(
        `修正${label}`,
        `当前值：${currentVal}\n\nAndroid 暂不支持直接输入，请在 RecognitionScreen 修改属性。`,
        [{ text: '知道了' }]
      );
      return;
    }
    Alert.prompt(
      `修正${label}`,
      `当前值：${currentVal}`,
      (newVal) => {
        if (newVal && newVal.trim()) {
          setOverrides(prev => ({ ...prev, [key]: newVal.trim() }));
        }
      },
      'plain-text',
      currentVal
    );
  };

  const handleSuggestionPress = async (card: typeof suggestions[0]) => {
    setLoadingCardId(card.id);
    try {
      const result = await searchProducts(sessionId, card.filter_params);
      navigation.navigate('ProductList', {
        sessionId,
        category: recognition.category,
        searchKeywords: recognition.search_keywords,
        products: result.products,
      });
    } catch (e) {
      Alert.alert('加载失败', '请重试');
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
      {/* 顶部导航栏 */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>← 返回</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>识别结果</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        {/* 属性区域 */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>商品属性</Text>
          <View style={styles.attrGrid}>
            {attrs.map(({ key, label, value }) => (
              <TouchableOpacity
                key={key}
                style={styles.attrCard}
                onPress={() => handleEditAttr(key, label, displayValue(key, value))}
              >
                <Text style={styles.attrLabel}>{label}</Text>
                <Text style={styles.attrValue}>{displayValue(key, value)}</Text>
                <Text style={styles.attrEdit}>✎</Text>
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

        {/* 建议卡片 */}
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
                  ? <ActivityIndicator color="#007AFF" />
                  : <Text style={styles.suggText}>{card.label}</Text>
                }
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* 查看全部商品 */}
        <TouchableOpacity
          style={styles.ctaBtn}
          onPress={() => navigation.navigate('ProductList', {
            sessionId,
            category: recognition.category,
            searchKeywords: recognition.search_keywords,
            products,
          })}
        >
          <Text style={styles.ctaText}>查看全部商品（{products.length} 件）→</Text>
        </TouchableOpacity>
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
  scroll: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 40 },
  section: { marginBottom: 24 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#333', marginBottom: 12 },
  attrGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  attrCard: { backgroundColor: '#fff', borderRadius: 12, padding: 12, width: '47%', borderWidth: 1, borderColor: '#e8e8e8', position: 'relative' },
  attrLabel: { fontSize: 12, color: '#999', marginBottom: 4 },
  attrValue: { fontSize: 15, fontWeight: '600', color: '#333' },
  attrEdit: { position: 'absolute', top: 8, right: 10, color: '#007AFF', fontSize: 14 },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 12 },
  tag: { backgroundColor: '#E3F2FF', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
  tagText: { fontSize: 12, color: '#007AFF' },
  cardScroll: { marginHorizontal: -4 },
  suggCard: { backgroundColor: '#007AFF', borderRadius: 20, paddingHorizontal: 18, paddingVertical: 12, marginHorizontal: 4, minWidth: 100, alignItems: 'center', justifyContent: 'center' },
  suggText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  ctaBtn: { backgroundColor: '#333', borderRadius: 16, padding: 18, alignItems: 'center', marginTop: 8 },
  ctaText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
