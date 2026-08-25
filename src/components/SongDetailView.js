import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, Modal } from 'react-native';
import { styles } from '../styles/appStyles';
import { MetronomeBar } from './MetronomeBar';
import { ChordProLines } from './ChordProLines';
import { AudioProgressBar } from './AudioProgressBar';
import { getChordSettings } from '../services/chordSettingsService';
import { renderChordProLines, transposeKeyDisplay, resolvePreferFlat } from '../utils/chordParser';

const THEME_BACKGROUND = { light: '#F4F4F4', dark: '#121212' };
const DEFAULT_BPM = 120;

/**
 * Key/BPM/Audio-Badge-Zeile über dem Songtext - von JEDER Seite im Pager
 * (aktiv wie inaktiv, siehe SongDetailPage) identisch genutzt, damit alle
 * Seiten IMMER exakt dieselben drei Badges in derselben Größe zeigen. Ohne
 * diese gemeinsame Komponente poppte der Audio-Button erst beim Aktivieren
 * einer Seite neu in die Zeile hinein - sichtbares Layout-Zucken beim
 * Wischen. `audio` ist auf inaktiven Seiten bewusst null, der Button wird
 * trotzdem im deaktivierten Zustand mitgerendert, rein für die Optik.
 */
export function SongBadgesOverlay({ keyDisplay, bpmDisplay, bpmWarning, audio }) {
  return (
    <View style={styles.fixedBadgesWrap} pointerEvents="box-none">
      <View style={[styles.fixedBadge, !keyDisplay && styles.fixedBadgeWarning]} pointerEvents="none">
        <Text style={styles.fixedBadgeText}>{keyDisplay || 'No Key'}</Text>
      </View>
      <View style={[styles.fixedBadge, styles.fixedBadgeSpacing, bpmWarning && styles.fixedBadgeWarning]} pointerEvents="none">
        <Text style={styles.fixedBadgeText}>{bpmDisplay}</Text>
      </View>
      <TouchableOpacity
        onPress={audio ? audio.togglePlayPause : undefined}
        disabled={!audio || !audio.hasAudioFile}
        pointerEvents={audio ? 'auto' : 'none'}
        style={[
          styles.fixedBadge,
          styles.fixedBadgeSpacing,
          audioStyles.audioBtn,
          (!audio || !audio.hasAudioFile) && audioStyles.audioBtnDisabled,
        ]}
      >
        <Text style={styles.fixedBadgeText}>
          {!audio || !audio.hasAudioFile ? '🎵' : audio.isResolving ? '⏳' : audio.isPlaying ? '⏸' : '▶'}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

/**
 * Eine einzelne Seite im horizontalen Song-Pager (SongDetailScreen). Aktive
 * UND inaktive (per Wisch-Geste sichtbare Nachbar-)Seiten nutzen exakt
 * dieselbe Komponente/Struktur - kein Wechsel auf eine andere, leichtere
 * "Vorschau"-Komponente beim Aktivieren mehr (das verursachte sichtbares
 * Zucken, weil zwei unterschiedlich aufgebaute Komponenten im DOM
 * getauscht wurden). Genau wie ShowModeScreen.SongPage berechnet jede Seite
 * Transpose/Schriftgröße/Tonart-Anzeige selbstständig aus `song.data` -
 * für die AKTIVE Seite kann das per transposeOverride/fontSizeOverride mit
 * dem noch nicht gespeicherten, live editierten Wert aus SongDetailScreen
 * überschrieben werden (z.B. während der Nutzer die Zoom-Stepper im
 * Einstellungsmenü bedient). Titel/Artist werden NICHT mehr hier gerendert
 * - die stehen einmalig in der nativen Titelleiste (siehe
 * SongDetailScreen.js, navigation.setOptions({ headerTitle })). Metronom/
 * Audio sind Instanzen aus SongDetailScreen und werden nur der aktiven
 * Seite mitgegeben (null für Nachbarseiten) - so läuft weiterhin nur ein
 * Metronom/Audio-Player gleichzeitig, ohne dass sich die Seiten strukturell
 * unterscheiden.
 */
export function SongDetailPage({
  song,
  active,
  transposeOverride,
  fontSizeOverride,
  scrollRef,
  onScroll,
  metronome,
  audio,
  isLandscape,
}) {
  if (!song) {
    return <View style={{ flex: 1, backgroundColor: '#F4F4F4' }} />;
  }

  const { typography } = getChordSettings();
  const backgroundColor = THEME_BACKGROUND[typography.theme] || THEME_BACKGROUND.light;

  const transpose = active && transposeOverride != null ? transposeOverride : Number(song.data?.transpose) || 0;
  const fontSize =
    active && fontSizeOverride != null
      ? fontSizeOverride
      : Number(song.data?.fontsize) > 0
      ? Number(song.data.fontsize)
      : 20;
  const preferFlat = resolvePreferFlat(song.data?.key);
  const renderedLines = renderChordProLines(song.lyrics || '', transpose, preferFlat);
  const keyDisplay = transposeKeyDisplay(song.data?.key, transpose, preferFlat);

  const rawBpm = Number(song.data?.bpm);
  const hasExplicitBpm = Number.isFinite(rawBpm) && rawBpm > 0;
  const bpm = metronome ? metronome.bpm : hasExplicitBpm ? rawBpm : DEFAULT_BPM;

  return (
    <View style={{ flex: 1, position: 'relative', backgroundColor }} pointerEvents={active ? 'auto' : 'none'}>
      <ScrollView
        ref={scrollRef}
        style={[styles.lyricsContainer, { backgroundColor }]}
        scrollEnabled={active}
        onScroll={active ? onScroll : undefined}
        scrollEventThrottle={16}
        focusable={false}
        accessible={false}
      >
        <ChordProLines lines={renderedLines} fontSize={fontSize} />
        <View style={{ height: 300 }} />
      </ScrollView>

      <SongBadgesOverlay
        keyDisplay={keyDisplay}
        bpmDisplay={hasExplicitBpm || metronome ? `⏱ ${bpm}` : `${bpm} BPM`}
        bpmWarning={!hasExplicitBpm}
        audio={audio}
      />

      {/* Fortschrittsbalken für die Audio-Wiedergabe an der langen Seite des
          Displays - nur sichtbar, solange der Song aktuell abgespielt wird. */}
      {audio && audio.isPlaying ? (
        <AudioProgressBar
          orientation={isLandscape ? 'horizontal' : 'vertical'}
          progress={audio.progress}
          onSeek={audio.seekToFraction}
        />
      ) : null}
    </View>
  );
}

/**
 * Eine Zeile im Einstellungsmenü: Beschriftung darüber, darunter groß
 * genug bedienbare -/+ -Buttons (56x56) links und rechts vom Wert, mit
 * reichlich Abstand, damit auf keinem Gerät etwas überlappt.
 */
function StepperRow({ label, value, onDown, onUp }) {
  return (
    <View style={menuStyles.stepperRow}>
      <Text style={menuStyles.sectionLabel}>{label}</Text>
      <View style={menuStyles.stepperControls}>
        <TouchableOpacity onPress={onDown} style={menuStyles.stepperBtn}>
          <Text style={menuStyles.stepperBtnText}>−</Text>
        </TouchableOpacity>
        <Text style={menuStyles.stepperValue}>{value}</Text>
        <TouchableOpacity onPress={onUp} style={menuStyles.stepperBtn}>
          <Text style={menuStyles.stepperBtnText}>+</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

/**
 * Einstellungsmenü (Bearbeiten, Transponieren, Scroll-Geschwindigkeit, Zoom,
 * Metronom) - EINMAL auf Bildschirmebene gerendert (siehe SongDetailScreen),
 * nicht mehr pro Pager-Seite. Bezieht sich immer auf den aktuell aktiven
 * Song; ein Modal pro FlatList-Item wäre unnötig (nur eine Seite ist je
 * aktiv) und hätte bei geteiltem menuOpen-State sogar auf mehreren Seiten
 * gleichzeitig aufklappen können.
 */
export function SongSettingsModal({
  visible,
  onClose,
  onEditStart,
  transpose,
  onTransposeDown,
  onTransposeUp,
  speed,
  onSpeedDown,
  onSpeedUp,
  fontSize,
  onFontSizeDown,
  onFontSizeUp,
  metronome,
}) {
  return (
    <Modal visible={!!visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={menuStyles.backdrop} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity activeOpacity={1} style={menuStyles.card} onPress={() => {}}>
          <ScrollView showsVerticalScrollIndicator={false}>
            <TouchableOpacity
              onPress={() => {
                onClose();
                onEditStart();
              }}
              style={menuStyles.editBtn}
            >
              <Text style={menuStyles.editBtnText}>✎ Song bearbeiten</Text>
            </TouchableOpacity>

            <StepperRow
              label="Transponieren"
              value={transpose > 0 ? `+${transpose}` : String(transpose)}
              onDown={onTransposeDown}
              onUp={onTransposeUp}
            />
            <StepperRow label="Scroll-Geschwindigkeit" value={`${speed}x`} onDown={onSpeedDown} onUp={onSpeedUp} />
            <StepperRow label="Zoom (Schriftgröße)" value={`${fontSize}px`} onDown={onFontSizeDown} onUp={onFontSizeUp} />

            <Text style={[menuStyles.sectionLabel, menuStyles.metronomeLabel]}>Metronom</Text>
            <View style={menuStyles.metronomeWrap}>
              <MetronomeBar
                bpm={metronome.bpm}
                setBpm={metronome.setBpm}
                isMetronomeActive={metronome.isMetronomeActive}
                setIsMetronomeActive={metronome.setIsMetronomeActive}
                isMetronomeMuted={metronome.isMetronomeMuted}
                setIsMetronomeMuted={metronome.setIsMetronomeMuted}
              />
            </View>
          </ScrollView>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

const audioStyles = {
  audioBtn: { minWidth: 40, alignItems: 'center' },
  audioBtnDisabled: { opacity: 0.35 },
};

const menuStyles = {
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  // Großzügig bemessene Karte - fast bildschirmbreit, damit auch die
  // (von Haus aus recht breite) MetronomeBar ohne Umbruch/Überlappung
  // reinpasst; nach oben durch maxHeight + interne ScrollView begrenzt,
  // damit auf kleinen/queren Displays nichts abgeschnitten wird.
  card: {
    width: '94%',
    maxWidth: 440,
    maxHeight: '85%',
    backgroundColor: '#FAFAFA',
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 10,
  },
  editBtn: {
    alignSelf: 'stretch',
    alignItems: 'center',
    backgroundColor: '#77DD77',
    paddingVertical: 14,
    borderRadius: 10,
    marginBottom: 22,
  },
  editBtnText: { color: '#183318', fontWeight: 'bold', fontSize: 16 },
  sectionLabel: { color: '#666', fontSize: 13, fontWeight: '700', letterSpacing: 0.3 },
  // Jede Einstellungszeile bekommt reichlich vertikalen Abstand zur
  // nächsten, damit auf keinem Gerät etwas ineinander/übereinander rutscht.
  stepperRow: { marginBottom: 22 },
  stepperControls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
  },
  // 56x56 - bequem mit dem Daumen bedienbar, deutlich größer als die
  // ursprünglichen kompakten Buttons aus der unteren Leiste.
  stepperBtn: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#E0E0E0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperBtnText: { fontSize: 26, fontWeight: 'bold', color: '#222' },
  stepperValue: {
    minWidth: 90,
    textAlign: 'center',
    fontSize: 20,
    fontWeight: 'bold',
    color: '#222',
    marginHorizontal: 16,
  },
  metronomeLabel: { marginBottom: 10 },
  // Metronom-Leiste ist von Haus aus recht breit (mehrere Buttons + BPM-
  // Anzeige nebeneinander) - passte bisher als volle Bildschirmbreite,
  // passt dank der ebenfalls breiten Karte (94%/440px) weiterhin ohne
  // Umbruch; eigener, dezent abgesetzter Rahmen zur optischen Abgrenzung.
  metronomeWrap: {
    borderWidth: 1,
    borderColor: '#E5E5E5',
    borderRadius: 10,
    overflow: 'hidden',
  },
};
