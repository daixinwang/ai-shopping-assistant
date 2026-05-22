import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/AppNavigator';

type Props = {
  route: RouteProp<RootStackParamList, 'Recognition'>;
  navigation: NativeStackNavigationProp<RootStackParamList, 'Recognition'>;
};

export default function RecognitionScreen({ route }: Props) {
  const { recognition } = route.params;
  return (
    <View style={styles.container}>
      <Text style={styles.title}>识别结果</Text>
      <Text style={styles.subtitle}>{recognition.category} · {recognition.brand || '未知品牌'}</Text>
      <Text style={styles.placeholder}>完整实现待完善</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f5f5f5' },
  title: { fontSize: 24, fontWeight: 'bold', color: '#333', marginBottom: 8 },
  subtitle: { fontSize: 16, color: '#666', marginBottom: 16 },
  placeholder: { color: '#999', fontStyle: 'italic' },
});
