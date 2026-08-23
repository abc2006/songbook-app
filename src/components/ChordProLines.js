import React from 'react';
import { View, Text } from 'react-native';
import {
  getChordSettings,
  resolveColor,
  CHORD_COLOR_OPTIONS,
  VERSE_COLOR_OPTIONS,
  CHORUS_COLOR_OPTIONS,
  COMMENT_COLOR_OPTIONS,
  TAB_COLOR_OPTIONS,
} from '../services/chordSettingsService';

const DEFAULT_BASE_FONT_SIZE = 20;

function fontFamilyStyle(value) {
  return value === 'monospace' ? 'monospace' : undefined;
}

function chordTextStyle(typography, scale) {
  const cfg = typography.chords;
  return {
    fontSize: cfg.fontSize * scale,
    color: resolveColor(CHORD_COLOR_OPTIONS, cfg.color),
    fontWeight: cfg.bold ? 'bold' : 'normal',
    fontFamily: 'monospace',
  };
}

function sectionTextStyle(section, typography, scale) {
  if (section === 'chorus') {
    const cfg = typography.chorus;
    return {
      fontSize: cfg.fontSize * scale,
      color: resolveColor(CHORUS_COLOR_OPTIONS, cfg.color),
      fontFamily: fontFamilyStyle(cfg.fontFamily),
      fontStyle: cfg.style === 'italic' ? 'italic' : 'normal',
    };
  }
  if (section === 'tab') {
    const cfg = typography.tabs;
    return {
      fontSize: cfg.fontSize * scale,
      color: resolveColor(TAB_COLOR_OPTIONS, cfg.color),
      fontFamily: 'monospace',
    };
  }
  const cfg = typography.verse;
  return {
    fontSize: cfg.fontSize * scale,
    color: resolveColor(VERSE_COLOR_OPTIONS, cfg.color),
    fontFamily: fontFamilyStyle(cfg.fontFamily),
  };
}

function commentStyle(typography, scale) {
  const cfg = typography.comments;
  return {
    fontSize: cfg.fontSize * scale,
    color: resolveColor(COMMENT_COLOR_OPTIONS, cfg.color),
    fontStyle: cfg.style === 'italic' ? 'italic' : 'normal',
  };
}

function LyricLine({ line, textStyle }) {
  const segments = line.lyricSegments?.length ? line.lyricSegments : [{ text: line.lyricLine, highlightColor: null }];
  return (
    <Text style={textStyle}>
      {segments.map((seg, idx) =>
        seg.highlightColor ? (
          <Text key={idx} style={{ backgroundColor: seg.highlightColor }}>
            {seg.text}
          </Text>
        ) : (
          seg.text
        )
      )}
    </Text>
  );
}

/**
 * Rendert das Ergebnis von renderChordProLines() (chordParser.js) unter
 * Berücksichtigung der global konfigurierten Typografie (Schriftgröße,
 * -farbe, -art je Kategorie: Akkorde/Strophe/Refrain/Kommentar/Tabulatur) -
 * siehe chordSettingsService.js. `fontSize` ist der bestehende Song-Zoom
 * (A+/A-), wirkt als Skalierungsfaktor auf die konfigurierten Basisgrößen.
 * Gemeinsam genutzt von SongDetailView (Normalmodus) und ShowModeScreen.
 * `onPauseLayout(index, y, seconds)` (optional) wird für {pause:}/{p:}-
 * Marker mit deren vertikaler Position innerhalb der ScrollView aufgerufen
 * (nur relevant für den Show-Modus, der daraus die Auto-Scroll-Stopps
 * berechnet - im Normalmodus einfach weglassen).
 * `onSpeedZoneLayout(index, y, type, factor)` (optional) analog für
 * speedZoneStart/speedZoneEnd-Marker ({sos:}/{eos} oder automatisch
 * erkannte Akkord-Solo-Blöcke) - werden als unsichtbare Zero-Height-Marker
 * gerendert (kein Text im Songtext).
 * `lastLineIndex`/`onLastLineLayout(y, height)` (optional) melden Position
 * UND gerenderte Höhe der letzten "echten" Text-/Akkordzeile (nicht die
 * eines Kommentars/Markers) - für den intelligenten Auto-Scroll-Stopp am
 * Songende im Show-Modus (siehe ShowModeScreen).
 */
export function ChordProLines({ lines, fontSize, onPauseLayout, onSpeedZoneLayout, lastLineIndex, onLastLineLayout }) {
  const { typography } = getChordSettings();
  const scale = (fontSize || DEFAULT_BASE_FONT_SIZE) / DEFAULT_BASE_FONT_SIZE;
  const chordStyle = chordTextStyle(typography, scale);

  return (
    <>
      {lines.map((line, idx) => {
        if (line.type === 'speedZoneStart' || line.type === 'speedZoneEnd') {
          return (
            <View
              key={idx}
              style={styles.speedZoneMarker}
              onLayout={(e) =>
                onSpeedZoneLayout && onSpeedZoneLayout(idx, e.nativeEvent.layout.y, line.type, line.factor)
              }
            />
          );
        }

        if (line.type === 'pause') {
          return (
            <View
              key={idx}
              style={styles.pauseMarker}
              onLayout={(e) => onPauseLayout && onPauseLayout(idx, e.nativeEvent.layout.y, line.seconds)}
            >
              <Text style={styles.pauseMarkerText}>⏸ {line.seconds}s</Text>
            </View>
          );
        }

        if (line.type === 'comment') {
          const style = commentStyle(typography, scale);
          if (typography.comments.style === 'badge') {
            return (
              <View key={idx} style={[styles.commentBadge, { marginVertical: 4 }]}>
                <Text style={[style, { fontStyle: 'normal' }]}>{line.text}</Text>
              </View>
            );
          }
          return (
            <Text key={idx} style={[style, { marginVertical: 4 }]}>
              {line.text}
            </Text>
          );
        }

        const textStyle = sectionTextStyle(line.section, typography, scale);
        const isBorderedChorus = line.section === 'chorus' && typography.chorus.style === 'border';
        const lastLineLayoutProps =
          idx === lastLineIndex
            ? { onLayout: (e) => onLastLineLayout && onLastLineLayout(e.nativeEvent.layout.y, e.nativeEvent.layout.height) }
            : null;

        if (line.chords) {
          const colWidth = Math.round(chordStyle.fontSize * 4.5);
          const content = (
            <View style={styles.chordRow}>
              {line.chords.map((chord, chordIdx) => (
                <View key={chordIdx} style={{ width: colWidth }}>
                  <Text style={chordStyle}>{chord}</Text>
                </View>
              ))}
            </View>
          );
          return isBorderedChorus ? (
            <View key={idx} style={styles.chorusBorder} {...lastLineLayoutProps}>
              {content}
            </View>
          ) : (
            <View key={idx} {...lastLineLayoutProps}>{content}</View>
          );
        }

        const content = (
          <View>
            {line.chordLine ? <Text style={chordStyle}>{line.chordLine}</Text> : null}
            <LyricLine line={line} textStyle={textStyle} />
          </View>
        );

        return isBorderedChorus ? (
          <View key={idx} style={styles.chorusBorder} {...lastLineLayoutProps}>
            {content}
          </View>
        ) : (
          <View key={idx} {...lastLineLayoutProps}>{content}</View>
        );
      })}
    </>
  );
}

const styles = {
  chordRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', marginVertical: 2 },
  chorusBorder: { borderLeftWidth: 3, borderLeftColor: '#FB923C', paddingLeft: 10, marginVertical: 2 },
  commentBadge: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(136,136,136,0.18)',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  pauseMarker: {
    alignSelf: 'center',
    marginVertical: 6,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(136,136,136,0.35)',
    opacity: 0.5,
  },
  pauseMarkerText: { fontSize: 12, color: '#888' },
  speedZoneMarker: { height: 0 },
};
