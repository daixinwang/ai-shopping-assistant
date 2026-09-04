import React, { useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  SafeAreaView, Alert
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
  { label: '低价', sort: 'price_asc' },
  { label: '高价', sort: 'price_desc' },
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
      Alert.alert('排序失败', '请确认后端服务正在运行。');
    }
  };

  const handleNLFilter = async (query: string) => {
    setIsFiltering(true);
    try {
      const result = await filterProducts(sessionId, query);
      setProducts(result.products);
      const filters = result.applied_filters;
      const chips: Array<{ key: string; label: string }> = [];
      if (filters.price_max) chips.push({ key: 'price_max', label: `≤ ¥${filters.price_max}` });
      if (filters.price_min) chips.push({ key: 'price_min', label: `≥ ¥${filters.price_min}` });
      if (filters.color) chips.push({ key: 'color', label: filters.color });
      if (filters.rating_min) chips.push({ key: 'rating_min', label: `评分 ≥ ${filters.rating_min}` });
      if (filters.platform) chips.push({ key: 'platform', label: filters.platform });
      if (filters.store_type) chips.push({ key: 'store_type', label: filters.store_type === 'flagship' ? '旗舰店' : '官方/自营' });
      setAppliedFilters(chips);
    } catch {
      Alert.alert('筛选失败', '请稍后重试。');
    } finally {
      setIsFiltering(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>返回</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{category}（{products.length} 件）</Text>
        <View style={{ width: 60 }} />
      </View>

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

      <NLFilterBar
        onFilter={handleNLFilter}
        appliedFilters={appliedFilters}
        isLoading={isFiltering}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F7F8FA' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
  backBtn: { width: 60 },
  backText: { color: '#2563EB', fontSize: 16, fontWeight: '600' },
  headerTitle: { fontSize: 16, fontWeight: '800', color: '#111827', textAlign: 'center', flex: 1 },
  sortBar: { flexDirection: 'row', backgroundColor: '#fff', paddingVertical: 9, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
  sortTab: { paddingHorizontal: 13, paddingVertical: 7, borderRadius: 16, marginRight: 6 },
  sortTabActive: { backgroundColor: '#111827' },
  sortText: { fontSize: 13, color: '#4B5563', fontWeight: '600' },
  sortTextActive: { color: '#fff', fontWeight: '800' },
  listContent: { padding: 12 },
  empty: { alignItems: 'center', paddingTop: 60 },
  emptyText: { fontSize: 16, color: '#6B7280' },
});
