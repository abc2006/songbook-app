import React, { useEffect, useState } from 'react';
import { View, ActivityIndicator, StatusBar, StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
import { RootNavigator } from './src/navigation/RootNavigator';
import { initDatabase } from './src/db/database';
import { loadChordSettings } from './src/services/chordSettingsService';
import { loadPedalSettings } from './src/services/pedalSettings';

export default function App() {
  const [dbReady, setDbReady] = useState(false);

  useEffect(() => {
    Promise.all([initDatabase(), loadChordSettings(), loadPedalSettings()]).then(() => setDbReady(true));
  }, []);

  if (!dbReady) {
    return (
      <View style={styles.loadingScreen}>
        <ActivityIndicator size="large" color="#888" />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <StatusBar barStyle="light-content" backgroundColor="#121212" translucent={false} />
      <NavigationContainer>
        <RootNavigator />
      </NavigationContainer>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  loadingScreen: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#1C1C1E' },
});
