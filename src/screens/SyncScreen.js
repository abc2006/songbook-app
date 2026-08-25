import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { getSupabaseConfig, configureSupabase } from '../services/supabase';
import { syncNow, getLastSyncedAt } from '../services/syncService';
import { getAutoSyncStatus, subscribeAutoSyncStatus } from '../services/autoSync';

function formatTimestamp(iso) {
  if (!iso) return 'noch nie';
  try {
    const date = new Date(iso);
    return date.toLocaleString('de-DE');
  } catch (e) {
    return iso;
  }
}

const LOG_LINE_COLOR = { local: '#4CAF50', cloud: '#42A5F5', neutral: '#BBBBBB' };

// Rein informatives Icon+Label für den stillen Hintergrund-Sync - niemals
// ein Popup/Toast, nur ein dezenter Hinweis im Verwaltungsmodus.
const AUTO_SYNC_STATUS_LABEL = {
  idle: '',
  syncing: '🔄 Synchronisiert im Hintergrund…',
  synced: '✓ Automatisch synchronisiert',
  error: '⚠ Nicht synchronisiert (wird beim nächsten Mal erneut versucht)',
};

export function SyncScreen() {
  const [url, setUrl] = useState('');
  const [anonKey, setAnonKey] = useState('');
  const [savedMessage, setSavedMessage] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState('');
  const [syncLog, setSyncLog] = useState([]);
  const [lastSyncedAt, setLastSyncedAtState] = useState(null);
  const [autoSyncStatus, setAutoSyncStatus] = useState(getAutoSyncStatus());

  useEffect(() => {
    (async () => {
      const config = await getSupabaseConfig();
      setUrl(config.url);
      setAnonKey(config.anonKey);
      setLastSyncedAtState(await getLastSyncedAt());
    })();
  }, []);

  // Dezentes Status-Icon für den Auto-Sync im Hintergrund (Verwaltungsmodus)
  // - beeinflusst den Auto-Sync selbst nicht, informiert nur passiv.
  useEffect(() => {
    return subscribeAutoSyncStatus(setAutoSyncStatus);
  }, []);

  async function handleSaveConfig() {
    await configureSupabase(url, anonKey);
    setSavedMessage('Gespeichert.');
    setTimeout(() => setSavedMessage(''), 2000);
  }

  async function handleSyncNow() {
    setSyncing(true);
    setSyncError('');
    setSyncLog([]);
    try {
      const result = await syncNow();
      setLastSyncedAtState(result.syncedAt);
      setSyncLog(result.log);
    } catch (e) {
      setSyncError(e?.message || 'Unbekannter Fehler beim Synchronisieren.');
    } finally {
      setSyncing(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView style={styles.container} keyboardShouldPersistTaps="handled">
        <Text style={styles.icon}>🔄</Text>
        <Text style={styles.title}>Synchronisation</Text>

        <Text style={styles.sectionTitle}>Supabase-Synchronisierung</Text>

        <Text style={styles.label}>Supabase URL</Text>
        <TextInput
          style={styles.input}
          value={url}
          onChangeText={setUrl}
          placeholder="https://xxxxx.supabase.co"
          placeholderTextColor="#aaa"
          autoCapitalize="none"
          autoCorrect={false}
        />

        <Text style={styles.label}>Anon Key</Text>
        <TextInput
          style={styles.input}
          value={anonKey}
          onChangeText={setAnonKey}
          placeholder="eyJhbGciOi..."
          placeholderTextColor="#aaa"
          autoCapitalize="none"
          autoCorrect={false}
          secureTextEntry
        />

        <TouchableOpacity onPress={handleSaveConfig} style={styles.saveBtn}>
          <Text style={styles.saveBtnText}>Zugangsdaten speichern</Text>
        </TouchableOpacity>
        {savedMessage ? <Text style={styles.savedText}>{savedMessage}</Text> : null}

        <View style={styles.divider} />

        <Text style={styles.lastSyncText}>Zuletzt synchronisiert: {formatTimestamp(lastSyncedAt)}</Text>
        <View style={styles.autoSyncStatusRow}>
          <Text style={styles.autoSyncStatusText}>{AUTO_SYNC_STATUS_LABEL[autoSyncStatus.status]}</Text>
        </View>

        <TouchableOpacity
          onPress={handleSyncNow}
          style={[styles.syncBtn, syncing && styles.syncBtnDisabled]}
          disabled={syncing}
        >
          {syncing ? (
            <ActivityIndicator size="small" color="#222" />
          ) : (
            <Text style={styles.syncBtnText}>🔄 Jetzt synchronisieren</Text>
          )}
        </TouchableOpacity>

        {syncError ? <Text style={styles.syncErrorText}>{syncError}</Text> : null}

        {syncLog.length > 0 ? (
          <View style={styles.consoleBox}>
            {syncLog.map((entry, idx) => (
              <Text key={idx} style={[styles.consoleLine, { color: LOG_LINE_COLOR[entry.kind] || LOG_LINE_COLOR.neutral }]}>
                {entry.text}
              </Text>
            ))}
          </View>
        ) : null}

        <View style={{ height: 60 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F4F4F4', padding: 24 },
  icon: { fontSize: 40, marginBottom: 8, textAlign: 'center' },
  title: { fontSize: 20, fontWeight: 'bold', color: '#222', marginBottom: 20, textAlign: 'center' },
  sectionTitle: { fontSize: 16, fontWeight: 'bold', color: '#222', marginBottom: 10 },
  label: { color: '#222', fontSize: 14, marginTop: 10, marginBottom: 4 },
  input: {
    backgroundColor: '#FFF',
    color: '#222',
    fontSize: 15,
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: '#DDD',
  },
  saveBtn: {
    marginTop: 16,
    backgroundColor: '#E0E0E0',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  saveBtnText: { color: '#222', fontWeight: 'bold' },
  savedText: { color: '#3A8', fontSize: 13, marginTop: 8, textAlign: 'center' },
  divider: { height: 1, backgroundColor: '#E0E0E0', marginVertical: 20 },
  lastSyncText: { color: '#888', fontSize: 13, marginBottom: 4, textAlign: 'center' },
  autoSyncStatusRow: { alignItems: 'center', marginBottom: 12 },
  autoSyncStatusText: { color: '#999', fontSize: 12, textAlign: 'center' },
  syncBtn: {
    backgroundColor: '#FFDF91',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  syncBtnDisabled: { opacity: 0.6 },
  syncBtnText: { color: '#222', fontWeight: 'bold', fontSize: 16 },
  syncErrorText: { marginTop: 12, fontSize: 13, textAlign: 'center', color: '#C33' },
  consoleBox: {
    marginTop: 16,
    backgroundColor: '#1E1E1E',
    borderRadius: 10,
    padding: 12,
  },
  consoleLine: { fontFamily: 'monospace', fontSize: 12, lineHeight: 18 },
});
