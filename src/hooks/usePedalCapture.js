import { useEffect } from 'react';
import { DeviceEventEmitter, Platform } from 'react-native';
import { getPedalBindings, matchesActivePedalDevice } from '../services/pedalSettings';

// Häufige Android-KeyCodes lesbar beschriften - der native Wert bleibt
// trotzdem immer die Zahl (keyCode), die auch gespeichert/verglichen wird.
const KEYCODE_LABELS = {
  4: 'Zurück',
  19: 'Pfeil hoch (↑)',
  20: 'Pfeil runter (↓)',
  21: 'Pfeil links (←)',
  22: 'Pfeil rechts (→)',
  23: 'DPAD Mitte',
  62: 'Leertaste',
  66: 'Enter ⏎',
  67: 'Rücktaste',
  24: 'Lauter',
  25: 'Leiser',
  85: 'Medien Play/Pause',
  87: 'Medien Weiter',
  88: 'Medien Zurück',
  92: 'Bild hoch (PageUp)',
  93: 'Bild runter (PageDown)',
  111: 'Esc',
  126: 'Medien Play',
  127: 'Medien Pause',
};

export function describePedalKeyCode(keyCode) {
  if (keyCode === null || keyCode === undefined) return null;
  return KEYCODE_LABELS[keyCode] ? `${KEYCODE_LABELS[keyCode]} (Code ${keyCode})` : `Code ${keyCode}`;
}

/**
 * Formatiert die von MainActivity.dispatchKeyEvent (siehe
 * plugins/withKeyEventMainActivity.js) mitgesendeten Gerätedaten für die
 * Anzeige in den Einstellungen.
 */
export function describePedalDevice(event) {
  if (!event) return null;
  const idBits = [];
  if (event.vendorId) idBits.push(`Vendor ${event.vendorId}`);
  if (event.productId) idBits.push(`Product ${event.productId}`);
  const idSuffix = idBits.length > 0 ? ` (${idBits.join(', ')})` : '';
  return `${event.deviceName || 'Unbekanntes Gerät'}${idSuffix}`;
}

// react-native-keyevent meldet immer nur EINEN globalen onKeyDown-Listener
// (removeKeyDownListener() kappt ihn komplett) - dieser kleine Multiplexer
// erlaubt mehreren Screens (SongDetailScreen, ShowModeScreen,
// SettingsScreen), gleichzeitig auf Pedal-Tasten zu lauschen, ohne sich
// gegenseitig den nativen Listener wegzunehmen. Läuft jetzt über das von
// MainActivity per DeviceEventEmitter gesendete "onPedalKeyEvent" (statt nur
// über react-native-keyevents eigenes "onKeyDown"), weil dieses zusätzlich
// Gerätemetadaten (deviceName/vendorId/productId) mitliefert.
const deviceListeners = new Set();
let nativeSubscription = null;

function ensureNativeListener() {
  if (Platform.OS !== 'android' || nativeSubscription) return;
  nativeSubscription = DeviceEventEmitter.addListener('onPedalKeyEvent', (event) => {
    if (event.action !== 'DOWN') return;
    // Jeden Listener einzeln try/catch-geschützt aufrufen: deviceListeners
    // ist ein gemeinsam genutztes Set über mehrere gleichzeitig registrierte
    // Screens hinweg (z.B. bleibt SongDetailScreen im Navigations-Stack
    // technisch gemountet, wenn man in den Show-Modus wechselt). Ohne diesen
    // Schutz würde eine Exception in EINEM (evtl. gar nicht mehr sichtbaren)
    // Listener die for-each-Schleife abbrechen und alle SPÄTER registrierten
    // Listener (z.B. den des gerade fokussierten Screens) stillschweigend
    // nie erreichen - genau das konnte dazu führen, dass das Pedal in einem
    // Screen komplett tot wirkte, obwohl der native Teil korrekt feuerte.
    deviceListeners.forEach((cb) => {
      try {
        cb(event);
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn('[Pedal] Listener-Fehler ignoriert:', e?.message || e);
      }
    });
  });
}

function teardownNativeListenerIfIdle() {
  if (deviceListeners.size === 0 && nativeSubscription) {
    nativeSubscription.remove();
    nativeSubscription = null;
  }
}

/**
 * Wie usePedalKeyListener, liefert aber das volle Event inkl. Gerätedaten
 * (deviceName, deviceId, vendorId, productId, isPhysicalDevice) statt nur
 * des rohen keyCode - für die Geräte-Erkennung/-Zuweisung in den
 * Einstellungen (SettingsScreen). Es wird NICHT nach "aktivem Pedal"
 * gefiltert, damit auch ein neues, noch nicht zugewiesenes Gerät sichtbar
 * bleibt.
 */
export function usePedalDeviceListener(onEvent, enabled = true) {
  useEffect(() => {
    if (!enabled || Platform.OS !== 'android') return undefined;
    const cb = (event) => onEvent(event);
    deviceListeners.add(cb);
    ensureNativeListener();
    return () => {
      deviceListeners.delete(cb);
      teardownNativeListenerIfIdle();
    };
    // eslint-disable-next-line
  }, [enabled, onEvent]);
}

/**
 * Lauscht auf Tastendrücke eines gekoppelten Bluetooth-HID-Fußpedals - nativ
 * über MainActivity.dispatchKeyEvent (siehe plugins/withKeyEventMainActivity.js),
 * das Tasten direkt auf Activity-Ebene abfängt, BEVOR Androids eigene Fokus-
 * Navigation (Pfeiltasten) oder das Software-Tastatur-System (Leertaste/
 * Enter) reagieren können. `onKeyCode(keyCode)` wird mit dem rohen Android-
 * KeyCode aufgerufen - aber nur, wenn kein "aktives Pedal" in den
 * Einstellungen festgelegt ist, oder das Event von genau diesem Gerät kommt
 * (siehe pedalSettings.matchesActivePedalDevice). Nur auf Android verfügbar.
 */
export function usePedalKeyListener(onKeyCode, enabled = true) {
  usePedalDeviceListener((event) => {
    if (!matchesActivePedalDevice(event)) return;
    onKeyCode(event.keyCode);
  }, enabled);
}

/**
 * Wie usePedalKeyListener, löst aber direkt `onTrigger()` aus, sobald der
 * empfangene KeyCode mit der in den Einstellungen für `actionId`
 * hinterlegten Bindung übereinstimmt (siehe pedalSettings.js /
 * SettingsScreen). Ohne hinterlegte Bindung passiert nichts.
 */
export function usePedalAction(actionId, onTrigger, enabled = true) {
  usePedalKeyListener((keyCode) => {
    const boundKeyCode = getPedalBindings()[actionId];
    if (boundKeyCode !== undefined && boundKeyCode !== null && keyCode === boundKeyCode) {
      onTrigger();
    }
  }, enabled);
}
