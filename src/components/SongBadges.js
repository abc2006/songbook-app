import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';

export function SongBadges({ song, onOpenMenu, style }) {
  const bpm = song.data?.bpm;
  const key = song.data?.key;
  const hasBpm = bpm !== null && bpm !== undefined && Number(bpm) > 0;
  const hasKey = !!key;

  return (
    <View style={[styles.badgesRow, style]}>
      <View style={[styles.badge, !hasBpm && styles.badgeMissing]}>
        <Text style={styles.badgeText}>{hasBpm ? `🎵 ${bpm}` : '❗'}</Text>
      </View>
      <View style={[styles.badge, styles.keyBadge, !hasKey && styles.badgeMissing]}>
        <Text style={styles.badgeText}>{hasKey ? key : '❗'}</Text>
      </View>
      {onOpenMenu ? (
        <TouchableOpacity onPress={onOpenMenu} style={styles.dropdownBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={styles.dropdownBtnText}>▼</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  badgesRow: { flexDirection: 'row', alignItems: 'center' },
  badge: {
    minWidth: 44,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 12,
    backgroundColor: '#EFEFEF',
    marginLeft: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  keyBadge: { backgroundColor: '#E4E4E4', borderRadius: 999 },
  badgeMissing: { backgroundColor: '#FADADA' },
  badgeText: { fontSize: 13, fontWeight: '600', color: '#333' },
  dropdownBtn: {
    marginLeft: 8,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#E0E0E0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dropdownBtnText: { fontSize: 11, color: '#555' },
});
