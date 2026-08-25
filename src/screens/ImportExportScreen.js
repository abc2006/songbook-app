import React, { useCallback, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { getAllSongs, createSong } from '../db/database';
import { triggerAutoSync } from '../services/autoSync';
import { buildSongText, parseSongText } from '../utils/chordParser';

function sanitizeFileName(name) {
  const cleaned = (name || 'song').replace(/[^a-z0-9äöüß _-]/gi, '_').trim();
  return cleaned || 'song';
}

export function ImportExportScreen() {
  const [songs, setSongs] = useState([]);
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [busy, setBusy] = useState(false);

  const loadSongs = useCallback(async () => {
    const rows = await getAllSongs();
    setSongs(rows);
    setSelectedIds((prev) => {
      const validIds = new Set(rows.map((r) => r.id));
      const next = new Set([...prev].filter((id) => validIds.has(id)));
      return next;
    });
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadSongs();
    }, [loadSongs])
  );

  function toggleSelect(id) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function selectAll() {
    setSelectedIds(new Set(songs.map((s) => s.id)));
  }

  function clearSelection() {
    setSelectedIds(new Set());
  }

  async function handleExport() {
    const selected = songs.filter((s) => selectedIds.has(s.id));
    if (selected.length === 0) {
      Alert.alert('Keine Songs ausgewählt', 'Bitte zuerst mindestens einen Song auswählen.');
      return;
    }
    const available = await Sharing.isAvailableAsync();
    if (!available) {
      Alert.alert('Teilen nicht verfügbar', 'Auf diesem Gerät ist kein Teilen-Dialog verfügbar.');
      return;
    }

    setBusy(true);
    try {
      // Jede Datei wird nacheinander über den System-Dialog geteilt - eine
      // "Sammel-Freigabe" mehrerer Dateien auf einmal unterstützt
      // expo-sharing plattformübergreifend nicht zuverlässig.
      for (const song of selected) {
        const text = buildSongText(song);
        const fileName = `${sanitizeFileName(song.title)}.txt`;
        const file = new File(Paths.cache, fileName);
        file.create({ overwrite: true });
        file.write(text);
        // eslint-disable-next-line no-await-in-loop
        await Sharing.shareAsync(file.uri, { mimeType: 'text/plain', dialogTitle: song.title });
      }
    } catch (e) {
      Alert.alert('Fehler beim Exportieren', String(e?.message || e));
    } finally {
      setBusy(false);
    }
  }

  async function handleImport() {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'text/plain',
        multiple: true,
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets?.length) return;

      setBusy(true);
      let importedCount = 0;
      for (const asset of result.assets) {
        try {
          const file = new File(asset.uri);
          // eslint-disable-next-line no-await-in-loop
          const text = await file.text();
          const parsed = parseSongText(text);
          // Altbestand ohne {id: ...}-Direktive (z.B. Textdatei aus einer
          // anderen Quelle) - beim Import/Nacherfassen sichtbar markieren.
          const title = parsed.id ? parsed.title : `${parsed.title} (AUTOID)`;
          // eslint-disable-next-line no-await-in-loop
          await createSong({
            id: parsed.id,
            title,
            artist: parsed.artist,
            lyrics: parsed.lyrics,
            data: { ...parsed.data, transpose: 0, fontsize: 20 },
          });
          importedCount++;
        } catch (e) {
          Alert.alert('Fehler beim Import', `"${asset.name}" konnte nicht gelesen werden: ${String(e?.message || e)}`);
        }
      }
      await loadSongs();
      if (importedCount > 0) {
        triggerAutoSync();
        Alert.alert('Import abgeschlossen', `${importedCount} Song(s) importiert.`);
      }
    } catch (e) {
      Alert.alert('Fehler beim Importieren', String(e?.message || e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.actionBar}>
        <TouchableOpacity onPress={handleImport} style={styles.actionBtn} disabled={busy}>
          <Text style={styles.actionBtnText}>📥 Importieren</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={handleExport}
          style={[styles.actionBtn, styles.exportBtn]}
          disabled={busy || selectedIds.size === 0}
        >
          <Text style={styles.actionBtnText}>📤 Teilen ({selectedIds.size})</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.selectionBar}>
        <TouchableOpacity onPress={selectAll}>
          <Text style={styles.selectionLink}>Alle auswählen</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={clearSelection}>
          <Text style={styles.selectionLink}>Auswahl aufheben</Text>
        </TouchableOpacity>
      </View>

      {busy && (
        <View style={styles.busyBar}>
          <ActivityIndicator size="small" color="#888" />
          <Text style={styles.busyText}>Bitte warten...</Text>
        </View>
      )}

      <FlatList
        data={songs}
        keyExtractor={(item) => String(item.id)}
        renderItem={({ item }) => {
          const checked = selectedIds.has(item.id);
          return (
            <TouchableOpacity style={styles.row} onPress={() => toggleSelect(item.id)}>
              <View style={[styles.checkbox, checked && styles.checkboxChecked]}>
                {checked ? <Text style={styles.checkboxMark}>✓</Text> : null}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle} numberOfLines={1}>{item.title}</Text>
                <Text style={styles.rowArtist} numberOfLines={1}>{item.artist || ''}</Text>
              </View>
            </TouchableOpacity>
          );
        }}
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <Text style={styles.emptyText}>Keine Songs vorhanden</Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F4F4F4' },
  actionBar: {
    flexDirection: 'row',
    padding: 12,
    backgroundColor: '#FAFAFA',
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  actionBtn: {
    flex: 1,
    backgroundColor: '#E0E0E0',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
    marginRight: 8,
  },
  exportBtn: { backgroundColor: '#FFDF91', marginRight: 0 },
  actionBtnText: { fontWeight: 'bold', color: '#222' },
  selectionBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  selectionLink: { color: '#3478F6', fontSize: 13, fontWeight: '600' },
  busyBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 8 },
  busyText: { marginLeft: 8, color: '#888', fontSize: 13 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#EBEBEB',
    backgroundColor: '#FFF',
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#CCC',
    marginRight: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: { backgroundColor: '#77DD77', borderColor: '#77DD77' },
  checkboxMark: { color: '#222', fontWeight: 'bold', fontSize: 14 },
  rowTitle: { color: '#222', fontSize: 16, fontWeight: 'bold' },
  rowArtist: { color: '#888', fontSize: 13, marginTop: 2 },
  emptyWrap: { padding: 40, alignItems: 'center' },
  emptyText: { color: '#999', fontSize: 15 },
});
