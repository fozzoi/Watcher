import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import BottomTabNavigator from './BottomTabNavigator';
import Player from '@/src/Player';

const Stack = createNativeStackNavigator();

const AppNavigator = () => {
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
      <Stack.Screen name="Player" component={Player} />
    </Stack.Navigator>
  );
};

export default AppNavigator;