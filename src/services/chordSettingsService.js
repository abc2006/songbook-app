import AsyncStorage from '@react-native-async-storage/async-storage';

const NOMENCLATURE_KEY = 'chord_setting_nomenclature';
const ACCIDENTALS_KEY = 'chord_setting_accidentals';
const TYPOGRAPHY_KEY = 'chord_setting_typography_v1';

export const NOMENCLATURE_OPTIONS = [
  { value: 'international', label: 'B / Bb', hint: 'Internationaler Standard' },
  { value: 'german', label: 'H / B', hint: 'Deutscher Standard' },
  { value: 'bassist', label: 'H / Bb', hint: 'Bassisten-Modus' },
];

export const ACCIDENTALS_OPTIONS = [
  { value: 'sharp', label: 'Immer X#', hint: 'Kreuz-Vorzeichen' },
  { value: 'flat', label: 'Immer Xb', hint: 'B-Vorzeichen' },
  { value: 'auto', label: 'Automatisch', hint: 'Musiktheoretisch nach Tonart' },
];

// "z.B." in der Vorgabe - die genannten Farben sind als Optionen enthalten,
// zusätzlich je Kategorie ein dunkler/heller "Standard"-Wert, der auf dem
// jeweiligen Default-Theme (hell) noch lesbar ist.
export const THEME_OPTIONS = [
  { value: 'light', label: 'Hell', hint: 'Standard' },
  { value: 'dark', label: 'Dunkel', hint: 'Bühnen-Optik' },
];

export const FONT_FAMILY_OPTIONS = [
  { value: 'sans', label: 'Standard', hint: 'Sans-Serif' },
  { value: 'monospace', label: 'Monospace', hint: 'Feste Zeichenbreite' },
];

export const CHORD_COLOR_OPTIONS = [
  { value: 'blue', label: 'Blau', hex: '#3478F6', hint: 'Standard' },
  { value: 'yellow', label: 'Gelb', hex: '#FFD700' },
  { value: 'green', label: 'Grün', hex: '#22C55E' },
  { value: 'white', label: 'Weiß', hex: '#FFFFFF' },
  { value: 'cyan', label: 'Cyan', hex: '#22D3EE' },
];

export const VERSE_COLOR_OPTIONS = [
  { value: 'dark', label: 'Dunkel', hex: '#222222', hint: 'Standard' },
  { value: 'white', label: 'Weiß', hex: '#FFFFFF' },
  { value: 'lightgray', label: 'Hellgrau', hex: '#CCCCCC' },
  { value: 'yellow', label: 'Gelb', hex: '#FFD700' },
];

export const CHORUS_COLOR_OPTIONS = [
  { value: 'dark', label: 'Dunkel', hex: '#222222', hint: 'Standard' },
  { value: 'white', label: 'Weiß', hex: '#FFFFFF' },
  { value: 'lightblue', label: 'Hellblau', hex: '#7DD3FC' },
  { value: 'orange', label: 'Orange', hex: '#FB923C' },
];

export const CHORUS_STYLE_OPTIONS = [
  { value: 'none', label: 'Normal' },
  { value: 'italic', label: 'Kursiv' },
  { value: 'border', label: 'Randbalken' },
];

export const COMMENT_COLOR_OPTIONS = [
  { value: 'gray', label: 'Grau', hex: '#888888', hint: 'Standard' },
  { value: 'lightgray', label: 'Hellgrau', hex: '#CCCCCC' },
  { value: 'yellow', label: 'Gelb', hex: '#FFD700' },
  { value: 'green', label: 'Grün', hex: '#22C55E' },
];

export const COMMENT_STYLE_OPTIONS = [
  { value: 'italic', label: 'Kursiv' },
  { value: 'badge', label: 'Badge-Hintergrund' },
];

export const TAB_COLOR_OPTIONS = [
  { value: 'dark', label: 'Dunkel', hex: '#222222', hint: 'Standard' },
  { value: 'white', label: 'Weiß', hex: '#FFFFFF' },
  { value: 'green', label: 'Grün', hex: '#22C55E' },
];

const DEFAULT_TYPOGRAPHY = {
  theme: 'light',
  chords: { fontSize: 20, color: 'blue', bold: true },
  verse: { fontFamily: 'sans', fontSize: 20, color: 'dark' },
  chorus: { fontFamily: 'sans', fontSize: 20, color: 'dark', style: 'italic' },
  comments: { fontSize: 14, color: 'gray', style: 'italic' },
  tabs: { fontSize: 16, color: 'dark' },
};

const DEFAULT_SETTINGS = {
  nomenclature: 'international',
  accidentals: 'auto',
  typography: DEFAULT_TYPOGRAPHY,
};

function mergeTypography(base, patch) {
  if (!patch) return base;
  const merged = { ...base };
  for (const key of Object.keys(patch)) {
    if (key === 'theme') {
      merged.theme = patch.theme;
    } else if (typeof patch[key] === 'object' && patch[key] !== null) {
      merged[key] = { ...base[key], ...patch[key] };
    }
  }
  return merged;
}

// In-Memory-Cache: chordParser.js/ChordProLines.js brauchen synchronen
// Zugriff (läuft während des Renderns), AsyncStorage ist aber async -
// deshalb einmal beim App-Start laden (loadChordSettings) und danach nur
// noch aus dem Cache lesen (getChordSettings).
let currentSettings = { ...DEFAULT_SETTINGS, typography: { ...DEFAULT_TYPOGRAPHY } };

export function getChordSettings() {
  return currentSettings;
}

export async function loadChordSettings() {
  const [nomenclature, accidentals, typographyJson] = await Promise.all([
    AsyncStorage.getItem(NOMENCLATURE_KEY),
    AsyncStorage.getItem(ACCIDENTALS_KEY),
    AsyncStorage.getItem(TYPOGRAPHY_KEY),
  ]);

  let typography = DEFAULT_TYPOGRAPHY;
  if (typographyJson) {
    try {
      typography = mergeTypography(DEFAULT_TYPOGRAPHY, JSON.parse(typographyJson));
    } catch (e) {
      typography = DEFAULT_TYPOGRAPHY;
    }
  }

  currentSettings = {
    nomenclature: nomenclature || DEFAULT_SETTINGS.nomenclature,
    accidentals: accidentals || DEFAULT_SETTINGS.accidentals,
    typography,
  };
  return currentSettings;
}

export async function setChordSettings(patch) {
  currentSettings = { ...currentSettings, ...patch };
  const writes = [];
  if (patch.nomenclature) writes.push(AsyncStorage.setItem(NOMENCLATURE_KEY, patch.nomenclature));
  if (patch.accidentals) writes.push(AsyncStorage.setItem(ACCIDENTALS_KEY, patch.accidentals));
  await Promise.all(writes);
  return currentSettings;
}

/**
 * patch kann {theme: 'dark'} sein oder {chords: {fontSize: 24}} etc. - wird
 * mit den bestehenden Typografie-Werten der jeweiligen Kategorie
 * zusammengeführt (nicht komplett ersetzt).
 */
export async function setTypographySettings(patch) {
  currentSettings = { ...currentSettings, typography: mergeTypography(currentSettings.typography, patch) };
  await AsyncStorage.setItem(TYPOGRAPHY_KEY, JSON.stringify(currentSettings.typography));
  return currentSettings;
}

export function resolveColor(options, value) {
  const found = options.find((o) => o.value === value);
  return found ? found.hex : options[0].hex;
}
