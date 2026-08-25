import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { styles } from '../styles/appStyles';

export function MetronomeBar({
  bpm,
  setBpm,
  isMetronomeActive,
  setIsMetronomeActive,
  isMetronomeMuted,
  setIsMetronomeMuted,
}) {
  return (
    <View style={styles.metronomeBar}>
      {/* Eigene Zeile: Start/Pause + Mute/Unmute. */}
      <View style={styles.metroTopRow}>
        <TouchableOpacity
          onPress={() => setIsMetronomeActive(!isMetronomeActive)}
          style={[
            styles.metroBtn,
            isMetronomeActive ? styles.metroPlayActive : null
          ]}
        >
          <Text style={styles.metroBtnText}>
            {isMetronomeActive ? 'Pause ⏸' : 'Start ▶'}
          </Text>
        </TouchableOpacity>
        {/* Mute/Unmute-Button (Lautsprechersymbol Toggle) */}
        <TouchableOpacity
          onPress={() => setIsMetronomeMuted((m) => !m)}
          style={[styles.metroMuteBtn, isMetronomeMuted ? styles.metroMuted : null]}
          accessibilityLabel={isMetronomeMuted ? 'Metronom-Ton ein' : 'Metronom-Ton aus'}
        >
          <Text style={styles.metroMuteIcon}>
            {isMetronomeMuted
              ? // Lautsprecher durchgestrichen
                '🔇'
              : // Lautsprecher normal
                '🔊'
            }
          </Text>
        </TouchableOpacity>
      </View>

      {/* Zweite Zeile: BPM-Regler (der blinkende Kreis sitzt jetzt in der
          Titelleiste neben dem Menü-Button, siehe SongDetailScreen). */}
      <View style={styles.metroBottomRow}>
        <View style={styles.bpmControls}>
          <TouchableOpacity
            onPress={() => setBpm((b) => Math.max(40, b - 5))}
            style={styles.bpmBtn}
          >
            <Text style={styles.bpmBtnText}>-5</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setBpm((b) => Math.max(30, b - 1))}
            style={styles.bpmBtn}
          >
            <Text style={styles.bpmBtnText}>-</Text>
          </TouchableOpacity>
          <Text style={styles.bpmText}>{bpm} BPM</Text>
          <TouchableOpacity
            onPress={() => setBpm((b) => Math.min(300, b + 1))}
            style={styles.bpmBtn}
          >
            <Text style={styles.bpmBtnText}>+</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setBpm((b) => Math.min(300, b + 5))}
            style={styles.bpmBtn}
          >
            <Text style={styles.bpmBtnText}>+5</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}
