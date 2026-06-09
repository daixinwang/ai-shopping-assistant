import React, { useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import AppNavigator from './src/navigation/AppNavigator';
import { updateAIConfig } from './src/api/client';

const STORAGE_KEY = 'ai_config';

export default function App() {
  // 启动时不再自动恢复旧配置，避免覆盖后端已设好的正确配置
  // 用户需在设置页手动保存一次，之后当前会话有效

  return (
    <SafeAreaProvider>
      <NavigationContainer>
        <AppNavigator />
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
