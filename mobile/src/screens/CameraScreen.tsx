import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/AppNavigator';
import { identifyProduct } from '../api/client';

type Props = { navigation: NativeStackNavigationProp<RootStackParamList, 'Camera'> };

export default function CameraScreen({ navigation }: Props) {
  const [loading, setLoading] = React.useState(false);

  const handlePickImage = async (useCamera: boolean) => {
    let result;
    if (useCamera) {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') { Alert.alert('需要摄像头权限'); return; }
      result = await ImagePicker.launchCameraAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.8 });
    } else {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') { Alert.alert('需要相册访问权限'); return; }
      result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.8 });
    }

    if (!result.canceled && result.assets[0]) {
      setLoading(true);
      try {
        const data = await identifyProduct(result.assets[0].uri);
        navigation.navigate('Recognition', {
          sessionId: data.session_id,
          recognition: data.recognition,
          suggestions: data.suggestions,
          products: data.products,
        });
      } catch (e) {
        Alert.alert('识别失败', '请检查网络连接后重试');
      } finally {
        setLoading(false);
      }
    }
  };

  if (loading) {
    return (
      <View style={[styles.container, { justifyContent: 'center' }]}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={{ marginTop: 16, color: '#666' }}>AI 识别中...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>选择图片</Text>
      <TouchableOpacity style={styles.button} onPress={() => handlePickImage(true)}>
        <Text style={styles.buttonText}>📷  拍摄照片</Text>
      </TouchableOpacity>
      <TouchableOpacity style={[styles.button, { backgroundColor: '#34C759', marginTop: 16 }]} onPress={() => handlePickImage(false)}>
        <Text style={styles.buttonText}>🖼️  从相册选择</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f5f5f5', padding: 24 },
  title: { fontSize: 24, fontWeight: 'bold', marginBottom: 32, color: '#333' },
  button: { backgroundColor: '#007AFF', paddingHorizontal: 40, paddingVertical: 16, borderRadius: 30, width: '80%', alignItems: 'center' },
  buttonText: { color: '#fff', fontSize: 18, fontWeight: '600' },
});
