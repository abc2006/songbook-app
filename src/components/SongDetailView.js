import React from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { styles } from '../styles/appStyles';
import { MetronomeBar } from './MetronomeBar';
import { ChordProLines } from './ChordProLines';
import { getChordSettings } from '../services/chordSettingsService';

const THEME_BACKGROUND = { light: '#F4F4F4', dark: '#121212' };

export function SongDetailView({
  insetsBottom,
  keyDisplay,
  hasExplicitBpm,
  renderedLines,
  fontSize,
  transpose,
  speed,
  isScrolling,
  scrollRef,
  onScroll,
  onToggleScrolling,
  onTransposeDown,
  onTransposeUp,
  onSpeedDown,
  onSpeedUp,
  onFontSizeDown,
  onFontSizeUp,
  metronome,
}) {
  const { typography } = getChordSettings();
  const backgroundColor = THEME_BACKGROUND[typography.theme] || THEME_BACKGROUND.light;

  return (
    <View style={{ flex: 1 }}>
      <MetronomeBar
        bpm={metronome.bpm}
        setBpm={metronome.setBpm}
        isMetronomeActive={metronome.isMetronomeActive}
        setIsMetronomeActive={metronome.setIsMetronomeActive}
        isMetronomeMuted={metronome.isMetronomeMuted}
        setIsMetronomeMuted={metronome.setIsMetronomeMuted}
        metronomePulse={metronome.metronomePulse}
      />

      {/* Textbereich mit fixiertem Key/BPM-Badge-Overlay - das Overlay
          scrollt nicht mit, weil es außerhalb der ScrollView, aber
          innerhalb dieses relativ positionierten Wrappers sitzt. */}
      <View style={{ flex: 1, position: 'relative', backgroundColor }}>
        <ScrollView
          ref={scrollRef}
          style={[styles.lyricsContainer, { backgroundColor }]}
          onScroll={onScroll}
          scrollEventThrottle={16}
        >
          <ChordProLines lines={renderedLines} fontSize={fontSize} />
          <View style={{ height: 300 }} />
        </ScrollView>

        <View style={styles.fixedBadgesWrap} pointerEvents="none">
          <View style={[styles.fixedBadge, !keyDisplay && styles.fixedBadgeWarning]}>
            <Text style={styles.fixedBadgeText}>{keyDisplay || 'No Key'}</Text>
          </View>
          <View style={[styles.fixedBadge, styles.fixedBadgeSpacing, !hasExplicitBpm && styles.fixedBadgeWarning]}>
            <Text style={styles.fixedBadgeText}>
              {hasExplicitBpm ? `⏱ ${metronome.bpm}` : `${metronome.bpm} BPM`}
            </Text>
          </View>
        </View>
      </View>

      <View style={[styles.controlBar, { paddingBottom: insetsBottom }]}>
        {/* Transponier-Leiste */}
        <View style={styles.transposeControls}>
          <TouchableOpacity onPress={onTransposeDown} style={styles.transposeBtn}>
            <Text style={styles.transposeBtnText}>-</Text>
          </TouchableOpacity>
          <Text style={styles.transposeText}>{transpose > 0 ? `+${transpose}` : transpose}</Text>
          <TouchableOpacity onPress={onTransposeUp} style={styles.transposeBtn}>
            <Text style={styles.transposeBtnText}>+</Text>
          </TouchableOpacity>
        </View>

        {/* Scrollgeschwindigkeit */}
        <View style={styles.scrollSpeedControls}>
          <TouchableOpacity onPress={onSpeedDown} style={styles.scrollSpeedBtn}>
            <Text style={styles.scrollSpeedBtnText}>-</Text>
          </TouchableOpacity>
          <Text style={styles.scrollSpeedText}>{speed}x</Text>
          <TouchableOpacity onPress={onSpeedUp} style={styles.scrollSpeedBtn}>
            <Text style={styles.scrollSpeedBtnText}>+</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={[styles.playBtn, isScrolling && styles.playBtnActive]}
          onPress={onToggleScrolling}
        >
          <Text style={styles.playBtnText}>{isScrolling ? 'Pause ⏸' : 'Start ▶'}</Text>
        </TouchableOpacity>

        {/* FontSize buttons */}
        <View style={styles.speedControls}>
          <TouchableOpacity onPress={onFontSizeDown} style={styles.speedBtn}>
            <Text style={styles.speedBtnText}>A-</Text>
          </TouchableOpacity>
          <Text style={styles.speedText}>{fontSize}px</Text>
          <TouchableOpacity onPress={onFontSizeUp} style={styles.speedBtn}>
            <Text style={styles.speedBtnText}>A+</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}
