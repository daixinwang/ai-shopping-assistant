import React, { useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  SafeAreaView, Alert, ActivityIndicator
} from 'react-native';
import { RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/AppNavigator';
import { ProductItem, searchProducts, filterProducts } from '../api/client';
import ProductCard from '../components/ProductCard';
import NLFilterBar from '../components/NLFilterBar';

type Props = {
  route: RouteProp<RootStackParamList, 'ProductList'>;
  navigation: NativeStackNavigationProp<RootStackParamList, 'ProductList'>;
};

const SORT_TABS = [
  { label: '综合', sort: undefined },
  { label: '价格↑', sort: 'price_asc' },
  { label: '价格↓', sort: 'price_desc' },
  { label: '销量', sort: 'sales' },
  { label: '好评', sort: 'rating' },
] as const;

export default function ProductListScreen({ route, navigation }: Props) {
  const { sessionId, category, products: initialProducts } = route.params;
  const [products, setProducts] = useState<ProductItem[]>(initialProducts);
  const [activeSort, setActiveSort] = useState<string | undefined>(undefined);
  const [isFiltering, setIsFiltering] = useState(false);
  const [appliedFilters, setAppliedFilters] = useState<Array<{ key: string; label: string }>>([]);

  const handleSortPress = async (sort: string | undefined) => {
    if (activeSort === sort) return;
    setActiveSort(sort);
    try {
      const result = await searchProducts(sessionId, { sort });
      setProducts(result.products);
    } catch {
      Alert.alert('排序失败', '请重试');
    }
  };

  const handleNLFilter = async (query: string) => {
    setIsFiltering(true);
    try {
      const result = await filterProducts(sessionId, query);
      setProducts(result.products);
      // 将 applied_filters 转为展示标签
      const filters = result.applied_filters;
      const chips: Array<{ key: string; label: string }> = [];
      if (filters.price_max) chips.push({ key: 'price_max', label: `≤¥${filters.price_max}` });
      if (filters.price_min) chips.push({ key: 'price_min', label: `≥¥${filters.price_min}` });
      if (filters.color) chips.push({ key: 'color', label: filters.color });
      if (filters.rating_min) chips.push({ key: 'rating_min', label: `⭐≥${filters.rating_min}` });
      if (filters.platform) chips.push({ key: 'platform', label: filters.platform });
      setAppliedFilters(chips);
    } catch {
      Alert.alert('筛选失败', '请重试');
    } finally {
      setIsFiltering(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* 顶部 */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>← 返回</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{category}（{products.length} 件）</Text>
        <View style={{ width: 60 }} />
      </View>

      {/* 排序 Tab */}
      <View style={styles.sortBar}>
        {SORT_TABS.map(({ label, sort }) => (
          <TouchableOpacity
            key={label}
            style={[styles.sortTab, activeSort === sort && styles.sortTabActive]}
            onPress={() => handleSortPress(sort)}
          >
            <Text style={[styles.sortText, activeSort === sort && styles.sortTextActive]}>{label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* 商品列表 */}
      <FlatList
        data={products}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <ProductCard product={item} />}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>没有找到符合条件的商品</Text>
          </View>
        }
      />

      {/* 底部自然语言过滤栏 */}
      <NLFilterBar
        onFilter={handleNLFilter}
        appliedFilters={appliedFilters}
        isLoading={isFiltering}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#f5f5f5' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#eee' },
  backBtn: { width: 60 },
  backText: { color: '#007AFF', fontSize: 16 },
  headerTitle: { fontSize: 16, fontWeight: '600', color: '#333', textAlign: 'center', flex: 1 },
  sortBar: { flexDirection: 'row', backgroundColor: '#fff', paddingVertical: 8, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: '#eee' },
  sortTab: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, marginRight: 6 },
  sortTabActive: { backgroundColor: '#007AFF' },
  sortText: { fontSize: 13, color: '#666' },
  sortTextActive: { color: '#fff', fontWeight: '600' },
  listContent: { padding: 12 },
  empty: { alignItems: 'center', paddingTop: 60 },
  emptyText: { fontSize: 16, color: '#999' },
});
