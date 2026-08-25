import AsyncStorage from '@react-native-async-storage/async-storage';
import { NativeModules, Platform } from 'react-native';

const { PedalDeviceModule } = NativeModules;

const BINDINGS_KEY = 'pedal_settings_bindings_v1';
const ACTIVE_DEVICE_KEY = 'pedal_settings_active_device_v1';

/**
 * Aktionen, die einem Bluetooth-Fußpedal-Tastendruck zugewiesen werden
 * können - als Liste angelegt, damit künftige Aktionen ergänzt werden
 * können, ohne das Speicherformat zu ändern. Gelten jeweils sowohl in der
 * normalen Song-/Übungsansicht als auch im Show-Modus.
 */
export const PEDAL_ACTIONS = [
  { id: 'toggleScroll', label: 'Scrollen Start/Stopp', hint: 'Übungsansicht & Show-Modus' },
  {
    id: 'scrollQuarterPageDown',
    label: '1/4 Seite sanft nach unten scrollen',
    hint: 'Übungsansicht & Show-Modus - stört laufenden Autoscroll nicht',
  },
  {
    id: 'scrollQuarterPageUp',
    label: '1/4 Seite sanft nach oben scrollen',
    hint: 'Übungsansicht & Show-Modus - stört laufenden Autoscroll nicht',
  },
];

// In-Memory-Cache: die Pedal-Erkennung während des Scrollens braucht
// synchronen Zugriff (läuft in einem onKeyPress-Handler) - einmal beim
// App-Start laden (loadPedalSettings), danach nur noch aus dem Cache lesen.
let currentBindings = {}; // { [actionId]: zuletzt empfangener Tasten-Wert }
let currentActiveDevice = null; // { vendorId, productId, deviceName } | null - siehe setActivePedalDevice

export function getPedalBindings() {
  return currentBindings;
}

export function getActivePedalDevice() {
  return currentActiveDevice;
}

export async function loadPedalSettings() {
  const [bindingsJson, deviceJson] = await Promise.all([
    AsyncStorage.getItem(BINDINGS_KEY),
    AsyncStorage.getItem(ACTIVE_DEVICE_KEY),
  ]);
  try {
    currentBindings = bindingsJson ? JSON.parse(bindingsJson) : {};
  } catch (e) {
    currentBindings = {};
  }
  try {
    currentActiveDevice = deviceJson ? JSON.parse(deviceJson) : null;
  } catch (e) {
    currentActiveDevice = null;
  }
  // Beim App-Start die aus AsyncStorage geladene Auswahl erneut an die
  // native Schicht durchreichen (siehe syncActiveDeviceToNative) - die hält
  // ihren eigenen, von MainActivity.dispatchKeyEvent synchron gelesenen
  // Cache in SharedPreferences, der bei einer Neuinstallation/App-Update
  // sonst von AsyncStorage abweichen könnte.
  syncActiveDeviceToNative(currentActiveDevice);
  return currentBindings;
}

/**
 * Reicht die aktuelle Geräteauswahl an PedalDeviceModule (Kotlin) weiter,
 * damit MainActivity.dispatchKeyEvent (siehe
 * plugins/withKeyEventMainActivity.js) sie synchron abfragen kann. Nur auf
 * Android verfügbar - auf anderen Plattformen existiert das Modul nicht.
 */
function syncActiveDeviceToNative(device) {
  if (Platform.OS !== 'android' || !PedalDeviceModule) return;
  if (device) {
    PedalDeviceModule.setActivePedalDevice(device.vendorId || 0, device.productId || 0, device.deviceName || '');
  } else {
    PedalDeviceModule.clearActivePedalDevice();
  }
}

export async function setPedalBinding(actionId, key) {
  currentBindings = { ...currentBindings, [actionId]: key };
  await AsyncStorage.setItem(BINDINGS_KEY, JSON.stringify(currentBindings));
  return currentBindings;
}

export async function clearPedalBinding(actionId) {
  const next = { ...currentBindings };
  delete next[actionId];
  currentBindings = next;
  await AsyncStorage.setItem(BINDINGS_KEY, JSON.stringify(currentBindings));
  return currentBindings;
}

/**
 * Legt fest, welches physische Gerät als "das" Pedal gilt (angelernt anhand
 * eines empfangenen usePedalDeviceListener-Events aus den Einstellungen).
 * Identifiziert wird primär über vendorId/productId (stabil über
 * Neukopplungen hinweg); liefert ein Bluetooth-HID-Gerät diese nicht (beides
 * 0), wird ersatzweise der deviceName verglichen. Ist kein aktives Pedal
 * gesetzt, akzeptiert die App wie bisher Tastendrücke von jedem Gerät.
 */
export async function setActivePedalDevice(event) {
  currentActiveDevice = event
    ? {
        vendorId: event.vendorId || 0,
        productId: event.productId || 0,
        deviceName: event.deviceName || 'Unbekanntes Gerät',
      }
    : null;
  await AsyncStorage.setItem(ACTIVE_DEVICE_KEY, JSON.stringify(currentActiveDevice));
  syncActiveDeviceToNative(currentActiveDevice);
  return currentActiveDevice;
}

export async function clearActivePedalDevice() {
  currentActiveDevice = null;
  await AsyncStorage.removeItem(ACTIVE_DEVICE_KEY);
  syncActiveDeviceToNative(null);
  return null;
}

/**
 * Prüft, ob ein empfangenes Pedal-Event vom aktuell festgelegten "aktiven
 * Pedal" stammt (siehe setActivePedalDevice). Ohne festgelegtes Gerät wird
 * alles akzeptiert (Standardverhalten, kein Setup nötig).
 */
export function matchesActivePedalDevice(event) {
  if (!currentActiveDevice) return true;
  if (currentActiveDevice.vendorId || currentActiveDevice.productId) {
    return event.vendorId === currentActiveDevice.vendorId && event.productId === currentActiveDevice.productId;
  }
  return event.deviceName === currentActiveDevice.deviceName;
}
