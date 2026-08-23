import React, { useMemo, useState } from 'react';
import { View, Text, Modal, TextInput, FlatList, TouchableOpacity, StyleSheet } from 'react-native';

export function AddSongsModal({ visible, allSongs, excludeSongIds, onAdd, onClose }) {
  const [query, setQuery] = useState('');

  const availableSongs = useMemo(() => {
    const excluded = new Set(excludeSongIds || []);
    const q = query.trim().toLowerCase();
    return allSongs
      .filter((s) => !excluded.has(s.id))
      .filter(
        (s) =>
          !q ||
          (s.title || '').toLowerCase().includes(q) ||
          (s.artist || '').toLowerCase().includes(q)
      );
  }, [allSongs, excludeSongIds, query]);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Songs hinzufügen</Text>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
            <Text style={styles.closeBtnText}>Fertig</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.searchWrap}>
          <TextInput
            style={styles.searchInput}
            value={query}
            onChangeText={setQuery}
            placeholder="Songs durchsuchen..."
            placeholderTextColor="#999"
          />
        </View>
        <FlatList
          data={availableSongs}
          keyExtractor={(item) => String(item.id)}
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.row} onPress={() => onAdd(item)}>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle} numberOfLines={1}>{item.title}</Text>
                <Text style={styles.rowArtist} numberOfLines={1}>{item.artist || ''}</Text>
              </View>
              <Text style={styles.addIcon}>+</Text>
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              <Text style={styles.emptyText}>Keine weiteren Songs verfügbar</Text>
            </View>
          }
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F4F4F4' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 16,
    backgroundColor: '#FAFAFA',
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  headerTitle: { fontSize: 18, fontWeight: 'bold', color: '#222' },
  closeBtn: { padding: 6 },
  closeBtnText: { color: '#3478F6', fontWeight: 'bold', fontSize: 16 },
  searchWrap: { padding: 12 },
  searchInput: {
    backgroundColor: '#FFF',
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 16,
    color: '#222',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#EBEBEB',
    backgroundColor: '#FFF',
  },
  rowTitle: { color: '#222', fontSize: 16, fontWeight: 'bold' },
  rowArtist: { color: '#888', fontSize: 13, marginTop: 2 },
  addIcon: { fontSize: 22, color: '#3478F6', fontWeight: 'bold', marginLeft: 12 },
  emptyWrap: { padding: 40, alignItems: 'center' },
  emptyText: { color: '#999', fontSize: 15 },
});
