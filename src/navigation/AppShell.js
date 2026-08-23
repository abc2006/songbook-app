import React, { useCallback, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, Animated, StyleSheet, Easing, BackHandler, ToastAndroid, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { SongsListScreen } from '../screens/SongsListScreen';
import { SetlistsListScreen } from '../screens/SetlistsListScreen';
import { ImportExportScreen } from '../screens/ImportExportScreen';
import { SyncScreen } from '../screens/SyncScreen';
import { SettingsScreen } from '../screens/SettingsScreen';

const DARK_BG = '#1C1C1E';
const DARK_HEADER = '#232326';
const ACCENT = '#FFD700';
const SIDEBAR_WIDTH = 260;

const TABS = [
  { key: 'songs', label: '🎵  Songs', title: 'Songs' },
  { key: 'setlists', label: '📑  Setlisten', title: 'Setlisten' },
  { key: 'importExport', label: '📤  Import / Export', title: 'Import / Export' },
  { key: 'sync', label: '🔄  Synchronisation', title: 'Synchronisation' },
  { key: 'settings', label: '⚙️  Einstellungen', title: 'Einstellungen' },
];

/**
 * Ersetzt den ursprünglich geplanten @react-navigation/drawer: dieser
 * brauchte react-native-reanimated/react-native-worklets, die in Expo Go
 * (Play Store App, kein Custom-Dev-Client) zu Laufzeitfehlern führen
 * ("Cannot assign to read-only property"). Diese Sidebar kommt komplett
 * ohne Reanimated aus - nur React Natives eingebaute Animated-API.
 */
export function AppShell({ navigation }) {
  const insets = useSafeAreaInsets();
  const [activeTab, setActiveTab] = useState('songs');
  const [sidebarVisible, setSidebarVisible] = useState(false);
  const slideAnim = useRef(new Animated.Value(0)).current; // 0 = zu, 1 = offen
  const lastBackPressRef = useRef(0);

  // Zurück-Taste: auf einem anderen Tab als "Songs" erst zurück zu "Songs"
  // springen (App nicht sofort beenden). Nur auf dem Songs-Tab selbst greift
  // die bekannte "nochmal drücken zum Beenden"-Logik.
  useFocusEffect(
    useCallback(() => {
      const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
        if (activeTab !== 'songs') {
          setActiveTab('songs');
          return true;
        }

        const now = Date.now();
        if (now - lastBackPressRef.current < 2000) {
          BackHandler.exitApp();
          return true;
        }
        lastBackPressRef.current = now;
        if (Platform.OS === 'android') {
          ToastAndroid.show('Nochmal drücken zum Beenden', ToastAndroid.SHORT);
        }
        return true;
      });
      return () => subscription.remove();
    }, [activeTab])
  );

  function openSidebar() {
    setSidebarVisible(true);
    Animated.timing(slideAnim, {
      toValue: 1,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }

  function closeSidebar() {
    Animated.timing(slideAnim, {
      toValue: 0,
      duration: 200,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(() => setSidebarVisible(false));
  }

  function selectTab(key) {
    setActiveTab(key);
    closeSidebar();
  }

  const currentTab = TABS.find((t) => t.key === activeTab);
  const translateX = slideAnim.interpolate({ inputRange: [0, 1], outputRange: [-SIDEBAR_WIDTH, 0] });
  const backdropOpacity = slideAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 0.5] });

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top }]}>
        <View style={styles.headerRow}>
          <TouchableOpacity
            onPress={openSidebar}
            style={styles.hamburgerBtn}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Text style={styles.hamburgerIcon}>☰</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{currentTab.title}</Text>
        </View>
      </View>

      <View style={styles.body}>
        {activeTab === 'songs' && <SongsListScreen navigation={navigation} />}
        {activeTab === 'setlists' && <SetlistsListScreen navigation={navigation} />}
        {activeTab === 'importExport' && <ImportExportScreen />}
        {activeTab === 'sync' && <SyncScreen />}
        {activeTab === 'settings' && <SettingsScreen />}
      </View>

      {sidebarVisible && (
        <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
          <Animated.View style={[styles.backdrop, { opacity: backdropOpacity }]}>
            <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={closeSidebar} />
          </Animated.View>
          <Animated.View style={[styles.sidebar, { paddingTop: insets.top, transform: [{ translateX }] }]}>
            {TABS.map((tab) => (
              <TouchableOpacity
                key={tab.key}
                onPress={() => selectTab(tab.key)}
                style={[styles.sidebarItem, activeTab === tab.key && styles.sidebarItemActive]}
              >
                <Text style={[styles.sidebarItemText, activeTab === tab.key && styles.sidebarItemTextActive]}>
                  {tab.label}
                </Text>
              </TouchableOpacity>
            ))}
          </Animated.View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F4F4F4' },
  header: { backgroundColor: DARK_HEADER },
  headerRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 12 },
  hamburgerBtn: { padding: 8, marginRight: 8 },
  hamburgerIcon: { fontSize: 22, color: '#FFF' },
  headerTitle: { fontSize: 18, fontWeight: 'bold', color: '#FFF' },
  body: { flex: 1 },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: '#000' },
  sidebar: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    width: SIDEBAR_WIDTH,
    backgroundColor: DARK_BG,
    paddingHorizontal: 8,
  },
  sidebarItem: { paddingVertical: 14, paddingHorizontal: 12, borderRadius: 8, marginTop: 4 },
  sidebarItemActive: { backgroundColor: '#33333A' },
  sidebarItemText: { fontSize: 16, fontWeight: '600', color: '#DDD' },
  sidebarItemTextActive: { color: ACCENT },
});
