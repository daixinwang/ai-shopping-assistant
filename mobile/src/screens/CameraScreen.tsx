import ActionButton from '../components/ActionButton';
import { colors, fonts } from '../theme';
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
        <ActivityIndicator size="large" color={colors.ink} />
        <Text style={styles.loadingText}>正在读取图片...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ActionButton icon="back" label="返回" style={{ marginBottom: 24 }} onPress={() => navigation.goBack()} /><Text style={styles.title}>以图寻物</Text>
      <Text style={styles.subtitle}>拍摄或上传一张清晰的商品图片，为你寻找相似好物。</Text>
      <ActionButton icon="camera" label="拍摄照片" primary style={{ width: '100%', maxWidth: 400 }} onPress={() => handlePickImage(true)} />
      <ActionButton icon="camera" label="从相册选择" style={{ width: '100%', maxWidth: 400, marginTop: 14 }} onPress={() => handlePickImage(false)} />
      {debug !== '' && <Text style={styles.debug}>{debug}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.paper, padding: 24 },
  title: { fontFamily: fonts.editorial, fontSize: 26, fontWeight: '800', marginBottom: 10, color: colors.ink },
  subtitle: { fontFamily: fonts.editorial, fontSize: 15, color: colors.muted, lineHeight: 22, textAlign: 'center', marginBottom: 28 },
  button: { backgroundColor: colors.ink, paddingHorizontal: 40, paddingVertical: 16, borderRadius: 3, width: '100%', maxWidth: 400, alignItems: 'center' },
  secondaryButton: { backgroundColor: colors.ink, marginTop: 14 },
  buttonText: { color: colors.surface, fontSize: 17, fontWeight: '700' },
  loadingText: { marginTop: 16, color: colors.muted, fontSize: 15 },
  debug: { marginTop: 24, color: colors.error, fontSize: 13, textAlign: 'center', paddingHorizontal: 16 },
});
