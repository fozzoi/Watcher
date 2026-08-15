import React, { useEffect, useState } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import BottomTabNavigator from './BottomTabNavigator';
import Player from '@/src/Player';
import Onboarding from './Onboarding';
import StatsPage from './StatsPage';
import { isOnboardingComplete } from '@/src/userPreferences';

const Stack = createNativeStackNavigator();

const AppNavigator = () => {
  const [isReady, setIsReady] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);

  useEffect(() => {
    async function checkOnboarding() {
      const complete = await isOnboardingComplete();
      setShowOnboarding(!complete);
      setIsReady(true);
    }
    checkOnboarding();
  }, []);

  if (!isReady) {
    return (
      <View style={{ flex: 1, backgroundColor: '#000', justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#E50914" />
      </View>
    );
  }

  if (showOnboarding) {
    return <Onboarding onComplete={() => setShowOnboarding(false)} />;
  }

  return (
    <Stack.Navigator 
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: '#141414' }, // Still keeps our background color
        fullScreenGestureEnabled: false,
        keyboardHandlingEnabled: false,
      }}
    >
      <Stack.Screen 
        name="Home" 
        component={BottomTabNavigator} 
        options={{
          headerShown: false,
          headerTransparent: true,
        }}
      />
      <Stack.Screen 
        name="Player" 
        component={Player} 
        options={{ presentation: 'fullScreenModal', animation: 'slide_from_bottom' }} 
      />
      <Stack.Screen
        name="StatsPage"
        component={StatsPage}
        options={{ presentation: 'card', animation: 'slide_from_right' }}
      />
    </Stack.Navigator>
  );
};

export default AppNavigator;