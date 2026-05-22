import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import HomeScreen from '../screens/HomeScreen';
import CameraScreen from '../screens/CameraScreen';
import RecognitionScreen from '../screens/RecognitionScreen';
import ProductListScreen from '../screens/ProductListScreen';

export type RootStackParamList = {
  Home: undefined;
  Camera: undefined;
  Recognition: { sessionId: string; recognition: any; suggestions: any[]; products: any[] };
  ProductList: { sessionId: string; category: string; searchKeywords: string[]; products: any[] };
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function AppNavigator() {
  return (
    <Stack.Navigator initialRouteName="Home" screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Home" component={HomeScreen} />
      <Stack.Screen name="Camera" component={CameraScreen} />
      <Stack.Screen name="Recognition" component={RecognitionScreen} />
      <Stack.Screen name="ProductList" component={ProductListScreen} />
    </Stack.Navigator>
  );
}
