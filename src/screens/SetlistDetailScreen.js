import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet } from 'react-native';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import {
  getSetlistSongs,
  getAllSongs,
  addSongToSetlist,
  removeSongFromSetlist,
  moveSetlistSong,
} from '../db/database';
import { AddSongsModal } from '../components/AddSongsModal';
import { SongBadges } from '../components/SongBadges';

export function SetlistDetailScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const { setlistId, setlistName } = route.params || {};

  const [entries, setEntries] = useState([]);
  const [allSongs, setAllSongs] = useState([]);
  const [modalVisible, setModalVisible] = useState(false);

  const loadEntries = useCallback(async () => {
    const rows = await getSetlistSongs(setlistId);
    setEntries(rows);
  }, [setlistId]);

  useFocusEffect(
    useCallback(() => {
      loadEntries();
    }, [loadEntries])
  );

  useEffect(() => {
    navigation.setOptions({
      title: setlistName || 'Setliste',
      headerRight: () => (
        <View style={styles.headerActions}>
          <TouchableOpacity onPress={() => handleStartShowMode(0)} style={styles.headerShowBtn}>
            <Text style={styles.headerShowBtnText}>▶ Show starten</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={openAddModal} style={styles.headerAddBtn}>
            <Text style={styles.headerAddBtnText}>+ Song</Text>
          </TouchableOpacity>
        </View>
      ),
    });
    // eslint-disable-next-line
  }, [setlistName, entries]);

  // Startet den Show-Modus mit exakt der Reihenfolge/den Song-IDs dieser
  // Setliste - `startIndex` erlaubt den Einstieg ab Song #1 (Haupt-Button)
  // oder ab einem beliebigen, per Zeilen-Button ausgewählten Song
  // ("Show ab hier starten", z.B. nach einem Soundcheck).
  function handleStartShowMode(startIndex) {
    if (entries.length === 0) return;
    navigation.navigate('ShowMode', { setlistId, startIndex });
  }

  async function openAddModal() {
    const songs = await getAllSongs();
    setAllSongs(songs);
    setModalVisible(true);
  }

  async function handleAddSong(song) {
    await addSongToSetlist(setlistId, song.id);
    await loadEntries();
  }

  async function handleRemove(entry) {
    await removeSongFromSetlist(entry.setlistSongId);
    loadEntries();
  }

  async function handleMove(entry, direction) {
    await moveSetlistSong(setlistId, entry.setlistSongId, direction);
    loadEntries();
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={entries}
        keyExtractor={(item) => String(item.setlistSongId)}
        renderItem={({ item, index }) => (
          <View style={styles.row}>
            <TouchableOpacity
              style={styles.rowInfo}
              onPress={() => navigation.navigate('SongDetail', { songId: item.song.id, setlistId, startIndex: index })}
            >
              <Text style={styles.rowTitle} numberOfLines={1}>{item.song.title}</Text>
              <Text style={styles.rowArtist} numberOfLines={1}>{item.song.artist || ''}</Text>
              <SongBadges song={item.song} style={styles.rowBadges} />
            </TouchableOpacity>
            <View style={styles.rowActions}>
              <TouchableOpacity
                onPress={() => handleMove(item, -1)}
                disabled={index === 0}
                style={[styles.moveBtn, index === 0 && styles.moveBtnDisabled]}
              >
                <Text style={styles.moveBtnText}>▲</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => handleMove(item, 1)}
                disabled={index === entries.length - 1}
                style={[styles.moveBtn, index === entries.length - 1 && styles.moveBtnDisabled]}
              >
                <Text style={styles.moveBtnText}>▼</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => handleStartShowMode(index)} style={styles.showFromHereBtn}>
                <Text style={styles.showFromHereBtnText}>▶</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => handleRemove(item)} style={styles.removeBtn}>
                <Text style={styles.removeBtnText}>✕</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <Text style={styles.emptyText}>Noch keine Songs - mit "+" oben Songs hinzufügen</Text>
          </View>
        }
        contentContainerStyle={{ flexGrow: 1 }}
      />

      <AddSongsModal
        visible={modalVisible}
        allSongs={allSongs}
        excludeSongIds={entries.map((e) => e.song.id)}
        onAdd={handleAddSong}
        onClose={() => setModalVisible(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F4F4F4' },
  headerActions: { flexDirection: 'row', alignItems: 'center' },
  headerShowBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
    backgroundColor: 'rgba(119,221,119,0.9)',
    marginRight: 8,
  },
  headerShowBtnText: { fontSize: 14, color: '#183318', fontWeight: 'bold' },
  headerAddBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
    backgroundColor: '#2563EB',
  },
  headerAddBtnText: { fontSize: 14, color: '#FFF', fontWeight: 'bold' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#EBEBEB',
    backgroundColor: '#FFF',
  },
  rowInfo: { flex: 1, marginRight: 10 },
  rowTitle: { color: '#222', fontSize: 16, fontWeight: 'bold' },
  rowArtist: { color: '#888', fontSize: 13, marginTop: 2 },
  rowBadges: { marginTop: 6, marginLeft: -6, justifyContent: 'flex-start' },
  rowActions: { flexDirection: 'row', alignItems: 'center' },
  moveBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#E0E0E0',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 6,
  },
  moveBtnDisabled: { opacity: 0.35 },
  moveBtnText: { fontSize: 12, color: '#555' },
  showFromHereBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#77DD77',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 6,
  },
  showFromHereBtnText: { fontSize: 12, color: '#183318' },
  removeBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#FADADA',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 6,
  },
  removeBtnText: { fontSize: 14, color: '#A33' },
  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  emptyText: { color: '#999', fontSize: 15, textAlign: 'center' },
});
