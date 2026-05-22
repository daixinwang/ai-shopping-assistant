import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/AppNavigator';

type Props = {
  route: RouteProp<RootStackParamList, 'ProductList'>;
  navigation: NativeStackNavigationProp<RootStackParamList, 'ProductList'>;
};

export default function ProductListScreen({ route }: Props) {
  const { products, category } = route.params;
  return (
    <View style={styles.container}>
      <Text style={styles.title}>{category} 商品列表</Text>
      <Text style={styles.count}>{products.length} 件商品</Text>
      <Text style={styles.placeholder}>完整实现待完善</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f5f5f5' },
  title: { fontSize: 24, fontWeight: 'bold', color: '#333', marginBottom: 8 },
  count: { fontSize: 16, color: '#007AFF', marginBottom: 16 },
  placeholder: { color: '#999', fontStyle: 'italic' },
});
