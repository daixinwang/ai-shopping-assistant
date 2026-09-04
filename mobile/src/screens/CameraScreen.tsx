import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/AppNavigator';

type Props = { navigation: NativeStackNavigationProp<RootStackParamList, 'Camera'> };

export default function CameraScreen({ navigation }: Props) {
  const [loading, setLoading] = React.useState(false);
  const [debug, setDebug] = React.useState('');

  const processImage = async (base64: string | null | undefined) => {
    setLoading(true);
    setDebug('');
    try {
      if (!base64) throw new Error('无法读取图片内容，请换一张图片重试。');
      navigation.navigate('Assistant', { imageBase64: base64 });
    } catch (e: any) {
      const msg = e?.response?.data?.detail
        || e?.response?.data?.error?.message
        || e?.message
        || '识别服务暂时不可用，请确认后端已启动。';
      setDebug(`错误：${msg}`);
      Alert.alert('识别失败', msg);
    } finally {
      setLoading(false);
    }
  };

  const handlePickImage = async (useCamera: boolean) => {
    try {
      if (useCamera) {
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert('需要摄像头权限');
          return;
        }
        const result = await ImagePicker.launchCameraAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          quality: 0.8,
          base64: true,
        });
        if (!result.canceled && result.assets?.[0]) {
          await processImage(result.assets[0].base64);
        }
        return;
      }

      if (Platform.OS === 'web') {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.onchange = async () => {
          const file = input.files?.[0];
          if (file) {
            const base64 = await new Promise<string>((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () => resolve(String(reader.result || ''));
              reader.onerror = () => reject(new Error('图片读取失败'));
              reader.readAsDataURL(file);
            });
            await processImage(base64);
          }
        };
        input.click();
        return;
      }

      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('需要相册访问权限');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.8,
        base64: true,
      });
      if (!result.canceled && result.assets?.[0]) {
        await processImage(result.assets[0].base64);
      }
    } catch (e: any) {
      const msg = e?.message || '图片选择失败';
      setDebug(`异常：${msg}`);
      Alert.alert('出错了', msg);
    }
  };

  if (loading) {
    return (
      <View style={[styles.container, { justifyContent: 'center' }]}>
        <ActivityIndicator size="large" color="#111827" />
        <Text style={styles.loadingText}>正在读取图片...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>选择商品图片</Text>
      <Text style={styles.subtitle}>图片会交给统一导购 Agent 提取商品特征并检索相似商品。</Text>
      <TouchableOpacity style={styles.button} onPress={() => handlePickImage(true)}>
        <Text style={styles.buttonText}>拍摄照片</Text>
      </TouchableOpacity>
      <TouchableOpacity style={[styles.button, styles.secondaryButton]} onPress={() => handlePickImage(false)}>
        <Text style={styles.buttonText}>从相册选择</Text>
      </TouchableOpacity>
      {debug !== '' && <Text style={styles.debug}>{debug}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F7F8FA', padding: 24 },
  title: { fontSize: 26, fontWeight: '800', marginBottom: 10, color: '#111827' },
  subtitle: { fontSize: 15, color: '#6B7280', lineHeight: 22, textAlign: 'center', marginBottom: 28 },
  button: { backgroundColor: '#111827', paddingHorizontal: 40, paddingVertical: 16, borderRadius: 28, width: '82%', alignItems: 'center' },
  secondaryButton: { backgroundColor: '#2563EB', marginTop: 14 },
  buttonText: { color: '#fff', fontSize: 17, fontWeight: '700' },
  loadingText: { marginTop: 16, color: '#4B5563', fontSize: 15 },
  debug: { marginTop: 24, color: '#DC2626', fontSize: 13, textAlign: 'center', paddingHorizontal: 16 },
});
