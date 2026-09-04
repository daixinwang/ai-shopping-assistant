import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/AppNavigator';

type Props = { navigation: NativeStackNavigationProp<RootStackParamList, 'Home'> };

export default function HomeScreen({ navigation }: Props) {
  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.settingsBtn} onPress={() => navigation.navigate('Preferences')}>
        <Text style={styles.settingsIcon}>偏好</Text>
      </TouchableOpacity>

      <Text style={styles.eyebrow}>AI Shopping Agent</Text>
      <Text style={styles.title}>会理解需求的智能导购</Text>
      <Text style={styles.subtitle}>说出预算和使用场景，或上传一张图片；在本地演示商品目录中完成推荐、追问、对比和加购。</Text>

      <TouchableOpacity style={styles.button} onPress={() => navigation.navigate('Assistant')}>
        <Text style={styles.buttonText}>开始对话</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.imageButton} onPress={() => navigation.navigate('Camera')}>
        <Text style={styles.imageButtonText}>用图片找相似商品</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F7F8FA', padding: 24 },
  settingsBtn: { position: 'absolute', top: 56, right: 20, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 18, backgroundColor: '#fff', borderWidth: 1, borderColor: '#E5E7EB' },
  settingsIcon: { fontSize: 14, color: '#1F2937', fontWeight: '600' },
  eyebrow: { fontSize: 13, color: '#2563EB', fontWeight: '700', marginBottom: 10 },
  title: { fontSize: 32, fontWeight: '800', color: '#111827', marginBottom: 12, textAlign: 'center' },
  subtitle: { fontSize: 16, color: '#4B5563', marginBottom: 40, lineHeight: 24, textAlign: 'center', maxWidth: 360 },
  button: { backgroundColor: '#111827', paddingHorizontal: 44, paddingVertical: 16, borderRadius: 28 },
  buttonText: { color: '#fff', fontSize: 17, fontWeight: '700' },
  imageButton: { marginTop: 14, paddingHorizontal: 32, paddingVertical: 13, borderRadius: 24, borderWidth: 1, borderColor: '#CBD5E1', backgroundColor: '#FFF' },
  imageButtonText: { color: '#334155', fontSize: 15, fontWeight: '700' },
});
