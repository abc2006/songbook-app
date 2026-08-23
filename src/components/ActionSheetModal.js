import React from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet } from 'react-native';

/**
 * Dunkles Bottom-Sheet-Aktionsmenü als Ersatz für native Alert.alert-Listen
 * (die auf Android unschön/inkonsistent aussehen). `actions`: Array von
 * {icon, label, onPress, destructive?}.
 */
export function ActionSheetModal({ visible, title, actions, onClose }) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity activeOpacity={1} style={styles.sheet} onPress={() => {}}>
          {title ? <Text style={styles.title}>{title}</Text> : null}
          {actions.map((action, idx) => (
            <TouchableOpacity
              key={idx}
              onPress={() => {
                onClose();
                action.onPress();
              }}
              style={[styles.actionRow, idx === 0 && styles.actionRowPrimary]}
            >
              <Text style={styles.actionIcon}>{action.icon}</Text>
              <Text style={[styles.actionLabel, action.destructive && styles.actionLabelDestructive]}>
                {action.label}
              </Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity onPress={onClose} style={styles.cancelRow}>
            <Text style={styles.cancelLabel}>Abbrechen</Text>
          </TouchableOpacity>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#1C1C1E',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingTop: 12,
    paddingBottom: 28,
    paddingHorizontal: 12,
  },
  title: {
    color: '#888',
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 8,
    paddingHorizontal: 12,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 14,
    borderRadius: 10,
  },
  actionRowPrimary: {
    backgroundColor: '#33333A',
    marginBottom: 4,
  },
  actionIcon: { fontSize: 18, width: 30, textAlign: 'center' },
  actionLabel: { color: '#FFF', fontSize: 16, fontWeight: '600', marginLeft: 10 },
  actionLabelDestructive: { color: '#FF6B6B' },
  cancelRow: {
    marginTop: 8,
    paddingVertical: 14,
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#333',
  },
  cancelLabel: { color: '#AAA', fontSize: 15, fontWeight: '600' },
});
