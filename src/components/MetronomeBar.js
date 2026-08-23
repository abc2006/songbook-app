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
  metronomePulse,
}) {
  return (
    <View style={styles.metronomeBar}>
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
      {/* BPM Bereich */}
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
      {/* Blinkender Kreis */}
      <View style={styles.metroCircleWrap}>
        <View
          style={[
            styles.metroCircle,
            metronomePulse ? styles.metroCircleActive : null,
          ]}
        />
      </View>
    </View>
  );
}
