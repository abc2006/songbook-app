const { withMainActivity } = require('@expo/config-plugins');
const { mergeContents } = require('@expo/config-plugins/build/utils/generateCode');

// react-native-keyevent liefert kein eigenes Expo-Config-Plugin - laut
// Anleitung müssen onKeyDown/onKeyUp/onKeyMultiple manuell in MainActivity
// überschrieben werden, damit Tastendrücke eines Bluetooth-HID-Fußpedals
// direkt auf Activity-Ebene abgefangen werden (VOR Android's eigener Fokus-
// Navigation und dem Software-Tastatur-System). Dieser Plugin injiziert das
// bei jedem `expo prebuild` automatisch, idempotent über die @generated-
// Marker von mergeContents (kein doppeltes Einfügen bei erneutem Prebuild).

const TAG = 'react-native-keyevent';

const kotlinImports = (packageName) =>
  [
    'import android.view.KeyEvent',
    'import com.github.kevinejohn.keyevent.KeyEventModule',
    `import ${packageName}.pedaldevice.PedalDeviceModule`,
  ].join('\n');

// dispatchKeyEvent statt onKeyDown/onKeyUp: dispatchKeyEvent ist der ALLERERSTE
// Punkt, an dem die Activity von jedem Tastendruck erfährt - noch bevor die
// Event-Weitergabe an den gerade fokussierten View (z.B. ein TextInput, eine
// Liste mit D-Pad-Fokus) beginnt. onKeyDown() wäre dagegen nur der Fallback,
// der ausschließlich für vom View NICHT konsumierte Tasten aufgerufen wird -
// genau deshalb kamen bisher nicht alle Pedal-Tastendrücke am JS-Listener an
// (z.B. wenn zufällig ein Eingabefeld fokussiert war).
//
// event.device liefert die Gerätemetadaten (Name/Vendor/Product) - ist null
// oder "virtuell", wenn das Event von der Software-Tastatur (IME) stammt statt
// von einem echten angeschlossenen/gekoppelten Gerät. Konsumiert (return
// true) wird NUR, wenn das Gerät zusätzlich exakt dem in den Einstellungen
// als "aktives Pedal" ausgewählten Gerät entspricht (siehe
// PedalDeviceModule.matchesActiveDevice, gefüttert von
// SettingsScreen.js/pedalSettings.js) - jedes andere physische Gerät (z.B.
// eine normale Bluetooth-Tastatur) und alle Software-Tastatur-Events laufen
// unverändert weiter (return super.dispatchKeyEvent), damit Tippen dort
// normal funktioniert.
//
// Das Melden per DeviceEventEmitter ("onPedalKeyEvent", siehe
// usePedalCapture.js) läuft über PedalDeviceModule.sendPedalKeyEvent() statt
// direkt hier - reactApplicationContext ist in BaseJavaModule PROTECTED und
// von MainActivity aus (anderer Klassenkontext) nicht zugreifbar, auch nicht
// über KeyEventModule.getInstance().reactApplicationContext. Der öffentliche
// KeyEventModule-Instanzkanal (onKeyDownEvent/onKeyUpEvent) bleibt zusätzlich
// bestehen, für Abwärtskompatibilität mit dem bisherigen keyCode-Kanal.
const KOTLIN_METHODS = `
  override fun dispatchKeyEvent(event: KeyEvent): Boolean {
    val action = event.action
    if (action != KeyEvent.ACTION_DOWN && action != KeyEvent.ACTION_UP) {
      return super.dispatchKeyEvent(event)
    }

    val device = event.device
    val isPhysicalDevice = device != null && !device.isVirtual
    val actionName = if (action == KeyEvent.ACTION_DOWN) "DOWN" else "UP"
    val deviceName = device?.name ?: "Unknown"
    val vendorId = device?.vendorId ?: 0
    val productId = device?.productId ?: 0
    val keyName = KeyEvent.keyCodeToString(event.keyCode)

    PedalDeviceModule.sendPedalKeyEvent(
      deviceName, event.deviceId, vendorId, productId, event.keyCode, actionName, keyName, isPhysicalDevice
    )

    val keyEventModule = KeyEventModule.getInstance()
    if (action == KeyEvent.ACTION_DOWN) {
      keyEventModule?.onKeyDownEvent(event.keyCode, event)
    } else {
      keyEventModule?.onKeyUpEvent(event.keyCode, event)
    }

    val isActivePedal = isPhysicalDevice && PedalDeviceModule.matchesActiveDevice(this, vendorId, productId, deviceName)
    return if (isActivePedal) true else super.dispatchKeyEvent(event)
  }`;

function withKeyEventMainActivity(config) {
  return withMainActivity(config, (config) => {
    if (config.modResults.language !== 'kt') {
      throw new Error('withKeyEventMainActivity: erwartet eine Kotlin-MainActivity (.kt) - Java wird aktuell nicht unterstützt.');
    }
    const imports = kotlinImports(config.android.package);
    const methods = KOTLIN_METHODS;

    let { contents } = config.modResults;

    contents = mergeContents({
      src: contents,
      newSrc: imports,
      tag: `${TAG}-imports`,
      anchor: /^package .+$/,
      offset: 1,
      comment: '//',
    }).contents;

    // Fügt die Methoden direkt vor der (nicht eingerückten) schließenden
    // Klammer der Klasse ein - MainActivity ist eine einzelne Top-Level-
    // Klasse, ihre schließende Klammer ist die einzige Zeile, die exakt
    // mit "}" beginnt (verschachtelte Blöcke sind eingerückt).
    contents = mergeContents({
      src: contents,
      newSrc: methods,
      tag: `${TAG}-methods`,
      anchor: /^}/,
      offset: 0,
      comment: '//',
    }).contents;

    config.modResults.contents = contents;
    return config;
  });
}

module.exports = withKeyEventMainActivity;
