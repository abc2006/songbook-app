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
 */
export function ChordProLines({ lines, fontSize }) {
  const { typography } = getChordSettings();
  const scale = (fontSize || DEFAULT_BASE_FONT_SIZE) / DEFAULT_BASE_FONT_SIZE;
  const chordStyle = chordTextStyle(typography, scale);

  return (
    <>
      {lines.map((line, idx) => {
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
            <View key={idx} style={styles.chorusBorder}>
              {content}
            </View>
          ) : (
            <View key={idx}>{content}</View>
          );
        }

        const content = (
          <View>
            {line.chordLine ? <Text style={chordStyle}>{line.chordLine}</Text> : null}
            <LyricLine line={line} textStyle={textStyle} />
          </View>
        );

        return isBorderedChorus ? (
          <View key={idx} style={styles.chorusBorder}>
            {content}
          </View>
        ) : (
          <View key={idx}>{content}</View>
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
};
