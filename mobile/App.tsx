import React, { useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import AppNavigator from './src/navigation/AppNavigator';
import { updateAIConfig } from './src/api/client';
import storage from './src/utils/storage';

const STORAGE_KEY = 'ai_config';

export default function App() {
  useEffect(() => {
    storage.getItem(STORAGE_KEY).then(raw => {
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
