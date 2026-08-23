import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { AppShell } from './AppShell';
import { SongDetailScreen } from '../screens/SongDetailScreen';
import { SetlistDetailScreen } from '../screens/SetlistDetailScreen';
import { ShowModeScreen } from '../screens/ShowModeScreen';

const RootStack = createNativeStackNavigator();

const DARK_HEADER = '#232326';

export function RootNavigator() {
  return (
    <RootStack.Navigator>
      <RootStack.Screen name="Main" component={AppShell} options={{ headerShown: false }} />
      <RootStack.Screen
        name="SongDetail"
        component={SongDetailScreen}
        options={{
          title: '',
          headerStyle: { backgroundColor: DARK_HEADER },
          headerTintColor: '#FFF',
        }}
      />
      <RootStack.Screen
        name="SetlistDetail"
        component={SetlistDetailScreen}
        options={{
          headerStyle: { backgroundColor: DARK_HEADER },
          headerTintColor: '#FFF',
        }}
      />
      <RootStack.Screen
        name="ShowMode"
        component={ShowModeScreen}
        options={{ headerShown: false, animation: 'fade' }}
      />
    </RootStack.Navigator>
  );
}
