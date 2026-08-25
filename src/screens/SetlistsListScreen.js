import React, { useCallback, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, Modal, TextInput, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { getSetlists, createSetlist, deleteSetlist } from '../db/database';
import { triggerAutoSync } from '../services/autoSync';
import { ActionSheetModal } from '../components/ActionSheetModal';

export function SetlistsListScreen({ navigation }) {
  const [setlists, setSetlists] = useState([]);
  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [newName, setNewName] = useState('');
  const [menuTarget, setMenuTarget] = useState(null);

  const loadSetlists = useCallback(async () => {
    const rows = await getSetlists();
    setSetlists(rows);
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadSetlists();
    }, [loadSetlists])
  );

  function handleOpenCreate() {
    setNewName('');
    setCreateModalVisible(true);
  }

  async function handleCreateSetlist() {
    const name = newName.trim();
    if (!name) return;
    await createSetlist(name);
    triggerAutoSync();
    setCreateModalVisible(false);
    setNewName('');
    loadSetlists();
  }

  function handleDeleteSetlist(setlist) {
    Alert.alert('Setliste löschen?', `"${setlist.name}" wirklich löschen?`, [
      { text: 'Abbrechen', style: 'cancel' },
      {
        text: 'Löschen',
        style: 'destructive',
        onPress: async () => {
          await deleteSetlist(setlist.id);
          triggerAutoSync();
          loadSetlists();
        },
      },
    ]);
  }

  const menuActions = menuTarget
    ? [{ icon: '🗑', label: 'Setliste löschen', destructive: true, onPress: () => handleDeleteSetlist(menuTarget) }]
    : [];

  return (
    <View style={styles.container}>
      <View style={styles.actionBar}>
        <TouchableOpacity onPress={handleOpenCreate} style={styles.actionBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={styles.actionBtnText}>+</Text>
        </TouchableOpacity>
      </View>
      <FlatList
        data={setlists}
        keyExtractor={(item) => String(item.id)}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.row}
            onPress={() => navigation.navigate('SetlistDetail', { setlistId: item.id, setlistName: item.name })}
          >
            <View style={styles.rowInfo}>
              <Text style={styles.rowName} numberOfLines={1}>{item.name}</Text>
              <Text style={styles.rowDate}>{item.created_at}</Text>
            </View>
            <TouchableOpacity
              onPress={() => setMenuTarget(item)}
              style={styles.dropdownBtn}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={styles.dropdownBtnText}>▼</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <Text style={styles.emptyText}>Noch keine Setlisten - mit "+" oben eine neue anlegen</Text>
          </View>
        }
        contentContainerStyle={{ flexGrow: 1 }}
      />

      <View style={styles.footer}>
        <Text style={styles.footerText}>{setlists.length} Setliste{setlists.length === 1 ? '' : 'n'}</Text>
      </View>

      <Modal visible={createModalVisible} transparent animationType="fade" onRequestClose={() => setCreateModalVisible(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Neue Setliste</Text>
            <TextInput
              style={styles.modalInput}
              value={newName}
              onChangeText={setNewName}
              placeholder="Name der Setliste"
              placeholderTextColor="#999"
              autoFocus
            />
            <View style={styles.modalActions}>
              <TouchableOpacity onPress={() => setCreateModalVisible(false)} style={styles.modalCancelBtn}>
                <Text style={styles.modalCancelBtnText}>Abbrechen</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleCreateSetlist} style={styles.modalCreateBtn}>
                <Text style={styles.modalCreateBtnText}>Erstellen</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <ActionSheetModal
        visible={!!menuTarget}
        title={menuTarget?.name}
        actions={menuActions}
        onClose={() => setMenuTarget(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F4F4F4' },
  actionBar: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#FAFAFA',
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  actionBtn: { paddingHorizontal: 10, paddingVertical: 4 },
  actionBtnText: { fontSize: 22, fontWeight: '600', color: '#333' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#EBEBEB',
    backgroundColor: '#FFF',
  },
  rowInfo: { flex: 1, marginRight: 10 },
  rowName: { color: '#222', fontSize: 17, fontWeight: 'bold' },
  rowDate: { color: '#888', fontSize: 13, marginTop: 4 },
  dropdownBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#E0E0E0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dropdownBtnText: { fontSize: 12, color: '#555' },
  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  emptyText: { color: '#999', fontSize: 15, textAlign: 'center' },
  footer: {
    paddingVertical: 10,
    alignItems: 'center',
    backgroundColor: '#232326',
  },
  footerText: { color: '#CCC', fontSize: 13, fontWeight: '600' },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  modalCard: { width: '100%', backgroundColor: '#FFF', borderRadius: 12, padding: 20 },
  modalTitle: { fontSize: 17, fontWeight: 'bold', color: '#222', marginBottom: 12 },
  modalInput: {
    borderWidth: 1,
    borderColor: '#DDD',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: '#222',
    marginBottom: 16,
  },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end' },
  modalCancelBtn: { paddingVertical: 10, paddingHorizontal: 16, borderRadius: 8, marginRight: 8 },
  modalCancelBtnText: { color: '#666', fontWeight: '600' },
  modalCreateBtn: { paddingVertical: 10, paddingHorizontal: 16, borderRadius: 8, backgroundColor: '#77DD77' },
  modalCreateBtnText: { color: '#222', fontWeight: 'bold' },
});
