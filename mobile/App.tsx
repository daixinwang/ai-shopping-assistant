import React, { useEffect } from 'react';
import { DefaultTheme, NavigationContainer } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import AppNavigator from './src/navigation/AppNavigator';
import { updateAIConfig } from './src/api/client';
import storage from './src/utils/storage';
import { colors } from './src/theme';

const navigationTheme = {
  ...DefaultTheme,
  colors: { ...DefaultTheme.colors, primary: colors.ink, background: colors.paper, card: colors.surface, text: colors.ink, border: colors.rule },
};

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
      <StatusBar style="dark" backgroundColor={colors.paper} />
      <NavigationContainer theme={navigationTheme}>
        <AppNavigator />
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
