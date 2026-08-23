import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

const STORAGE_KEY_URL = 'supabase_url';
const STORAGE_KEY_ANON_KEY = 'supabase_anon_key';

let cachedClient = null;
let cachedConfigKey = null;

/**
 * Liest die aktuell gespeicherte Supabase-Konfiguration (URL + Anon-Key)
 * aus AsyncStorage. Beide leer/null, solange der Nutzer noch nichts in den
 * Einstellungen hinterlegt hat.
 */
export async function getSupabaseConfig() {
  const [url, anonKey] = await Promise.all([
    AsyncStorage.getItem(STORAGE_KEY_URL),
    AsyncStorage.getItem(STORAGE_KEY_ANON_KEY),
  ]);
  return { url: url || '', anonKey: anonKey || '' };
}

/**
 * Speichert URL + Anon-Key in AsyncStorage. Ein bereits erzeugter Client
 * wird verworfen, damit der nächste getSupabaseClient()-Aufruf mit den
 * neuen Zugangsdaten neu verbindet.
 */
export async function configureSupabase(url, anonKey) {
  await Promise.all([
    AsyncStorage.setItem(STORAGE_KEY_URL, url.trim()),
    AsyncStorage.setItem(STORAGE_KEY_ANON_KEY, anonKey.trim()),
  ]);
  cachedClient = null;
  cachedConfigKey = null;
}

export async function clearSupabaseConfig() {
  await Promise.all([
    AsyncStorage.removeItem(STORAGE_KEY_URL),
    AsyncStorage.removeItem(STORAGE_KEY_ANON_KEY),
  ]);
  cachedClient = null;
  cachedConfigKey = null;
}

/**
 * Gibt einen konfigurierten Supabase-Client zurück, oder `null`, wenn URL/
 * Anon-Key noch nicht hinterlegt sind. Der Client wird zwischen Aufrufen
 * wiederverwendet, solange sich die Zugangsdaten nicht ändern.
 */
export async function getSupabaseClient() {
  const { url, anonKey } = await getSupabaseConfig();
  if (!url || !anonKey) {
    return null;
  }

  const configKey = `${url}::${anonKey}`;
  if (cachedClient && cachedConfigKey === configKey) {
    return cachedClient;
  }

  cachedClient = createClient(url, anonKey, {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });
  cachedConfigKey = configKey;
  return cachedClient;
}
