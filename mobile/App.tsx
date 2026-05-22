import React, { useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import AppNavigator from './src/navigation/AppNavigator';
import { updateAIConfig } from './src/api/client';

const STORAGE_KEY = 'ai_config';

export default function App() {
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then(raw => {
      if (raw) {
        const saved = JSON.parse(raw);
        if (saved.api_key) {
          updateAIConfig(saved).catch(() => {});
        }
      }
    });
  }, []);

  return (
    <SafeAreaProvider>
      <NavigationContainer>
        <AppNavigator />
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
