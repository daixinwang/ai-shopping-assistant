import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import HomeScreen from '../screens/HomeScreen';
import CameraScreen from '../screens/CameraScreen';
import RecognitionScreen from '../screens/RecognitionScreen';
import ProductListScreen from '../screens/ProductListScreen';
import SettingsScreen from '../screens/SettingsScreen';
import AssistantScreen from '../screens/AssistantScreen';
import PreferencesScreen from '../screens/PreferencesScreen';
import { RecognitionResult, SuggestionCard, ProductItem } from '../api/client';

export type RootStackParamList = {
  Home: undefined;
  Assistant: { imageBase64?: string } | undefined;
  Camera: undefined;
  Recognition: {
    sessionId: string;
    recognition: RecognitionResult;
    suggestions: SuggestionCard[];
    products: ProductItem[];
  };
  ProductList: {
    sessionId: string;
    category: string;
    searchKeywords: string[];
    products: ProductItem[];
  };
  Settings: undefined;
  Preferences: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function AppNavigator() {
  return (
    <Stack.Navigator initialRouteName="Home" screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Home" component={HomeScreen} />
      <Stack.Screen name="Assistant" component={AssistantScreen} />
      <Stack.Screen name="Camera" component={CameraScreen} />
      <Stack.Screen name="Recognition" component={RecognitionScreen} />
      <Stack.Screen name="ProductList" component={ProductListScreen} />
      <Stack.Screen name="Settings" component={SettingsScreen} />
      <Stack.Screen name="Preferences" component={PreferencesScreen} />
    </Stack.Navigator>
  );
}
