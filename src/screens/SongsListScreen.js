import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, TextInput, FlatList, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { getAllSongs, deleteSong } from '../db/database';
import { SongBadges } from '../components/SongBadges';

export function SongsListScreen({ navigation }) {
  const [songs, setSongs] = useState([]);
  const [query, setQuery] = useState('');

  const loadSongs = useCallback(async () => {
    const rows = await getAllSongs();
    setSongs(rows);
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadSongs();
    }, [loadSongs])
  );

  const filteredSongs = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return songs;
    return songs.filter(
      (s) =>
        (s.title || '').toLowerCase().includes(q) ||
        (s.artist || '').toLowerCase().includes(q)
    );
  }, [songs, query]);

  function handleOpenMenu(song) {
    Alert.alert(
      song.title,
      undefined,
      [
        { text: 'Bearbeiten', onPress: () => navigation.navigate('SongDetail', { songId: song.id, startInEdit: true }) },
        {
          text: 'Löschen',
          style: 'destructive',
          onPress: () => {
            Alert.alert('Song löschen?', `"${song.title}" wirklich löschen?`, [
              { text: 'Abbrechen', style: 'cancel' },
              {
                text: 'Löschen',
                style: 'destructive',
                onPress: async () => {
                  await deleteSong(song.id);
                  loadSongs();
                },
              },
            ]);
          },
        },
        { text: 'Abbrechen', style: 'cancel' },
      ]
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.searchWrap}>
        <Text style={styles.searchIcon}>🔍</Text>
        <TextInput
          style={styles.searchInput}
          value={query}
          onChangeText={setQuery}
          placeholder="Songs durchsuchen..."
          placeholderTextColor="#999"
        />
      </View>
      <FlatList
        data={filteredSongs}
        keyExtractor={(item) => String(item.id)}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.songRow}
            onPress={() => navigation.navigate('SongDetail', { songId: item.id })}
          >
            <View style={styles.songInfo}>
              <Text style={styles.songTitle} numberOfLines={1}>{item.title}</Text>
              <Text style={styles.songArtist} numberOfLines={1}>{item.artist || ''}</Text>
            </View>
            <SongBadges song={item} onOpenMenu={() => handleOpenMenu(item)} />
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <Text style={styles.emptyText}>Keine Songs gefunden</Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F4F4F4' },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF',
    margin: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  searchIcon: { fontSize: 16, marginRight: 8, color: '#888' },
  searchInput: { flex: 1, fontSize: 16, color: '#222', padding: 0 },
  songRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#EBEBEB',
    backgroundColor: '#FFF',
  },
  songInfo: { flex: 1, marginRight: 10 },
  songTitle: { color: '#222', fontSize: 17, fontWeight: 'bold' },
  songArtist: { color: '#888', fontSize: 13, marginTop: 2 },
  emptyWrap: { padding: 40, alignItems: 'center' },
  emptyText: { color: '#999', fontSize: 15 },
});
