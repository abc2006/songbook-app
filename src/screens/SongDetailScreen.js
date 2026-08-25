import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, ActivityIndicator, TouchableOpacity, Text, FlatList, StyleSheet, Animated, useWindowDimensions } from 'react-native';
import { useFocusEffect, useIsFocused, useNavigation, useRoute } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getSongById, updateSong, getSetlistSongs } from '../db/database';
import { triggerAutoSync } from '../services/autoSync';
import { useMetronome } from '../hooks/useMetronome';
import { useSongAudioPlayer } from '../hooks/useSongAudioPlayer';
import { usePedalAction } from '../hooks/usePedalCapture';
import { buildSongText, parseSongText } from '../utils/chordParser';
import { animateScrollTo, QUARTER_PAGE_SCROLL_DURATION_MS, QUARTER_PAGE_FRACTION } from '../utils/smoothScroll';
import { SongDetailPage, SongSettingsModal } from '../components/SongDetailView';
import { EditSongView } from '../components/EditSongView';

const DEFAULT_BPM = 120;
const MIN_SPEED = 1;
const MAX_SPEED = 10;

// Parallax-Distanz (px) für den nach links/rechts wegschiebenden
// Nachbar-Titel innerhalb der Titelleiste - bewusst deutlich kleiner als
// screenWidth, da der Titelbereich selbst nur ein schmaler Streifen
// zwischen Zurück-Button und Action-Icons ist.
const HEADER_TITLE_SLIDE_DISTANCE = 60;
// Anteil der Bildschirmbreite, nach dem der nächste Titel bereits voll
// sichtbar/lesbar sein soll (bzw. der aktuelle schon komplett ausgeblendet)
// - bewusst klein, damit man schon ganz am Anfang der Wisch-Geste erkennt,
// welcher Song als nächstes kommt, statt erst kurz vor dem Einrasten.
const HEADER_TITLE_REVEAL_FRACTION = 0.1;

/**
 * Zweizeiliger Titel (Titel fett/größer, Artist kleiner darunter) für die
 * native Titelleiste - einzige Stelle, an der Titel/Artist gerendert
 * werden (siehe navigation.setOptions({ headerTitle }) unten). Es gibt
 * bewusst KEINEN zweiten Titel-Header im Songtext-Body mehr: vorher stand
 * der Titel zusätzlich als eigene Zeile über dem Songtext, was wie zwei
 * gestapelte Leisten aussah.
 *
 * Gleitet synchron mit der horizontalen Wisch-Geste des Song-Pagers mit:
 * `scrollX` ist dasselbe Animated.Value, das per Animated.event direkt an
 * den `contentOffset.x` der FlatList gekoppelt ist (siehe unten). Für den
 * aktuellen Song sowie seine beiden Nachbarn wird je ein Text-Block
 * gerendert und über scrollX.interpolate() ein-/ausgeblendet bzw. leicht
 * verschoben - alle anderen Songs der Liste werden gar nicht erst
 * gemountet (Fenster von maximal 3). `overflow: hidden` auf dem Wrapper
 * maskiert den Titelbereich, der Rest der Leiste (Zurück-Button, Icons,
 * Metronom-Licht) bleibt davon komplett unberührt.
 */
function SlidingHeaderTitle({ entries, index, scrollX, screenWidth }) {
  const home = index * screenWidth;
  const reveal = screenWidth * HEADER_TITLE_REVEAL_FRACTION;
  // Dieselben 5 Stützstellen für alle drei gerenderten Titel - verankert an
  // der aktuell EINGERASTETEN Position (`home`), nicht am eigenen Slot des
  // jeweiligen Songs. Nur so ist die "wird nach `reveal` Pixeln bereits
  // lesbar"-Regel für BEIDE Wischrichtungen symmetrisch: sowohl der nächste
  // (index+1) als auch der vorherige Song (index-1) müssen ihren Sprung auf
  // volle Sichtbarkeit direkt beim VERLASSEN von `home` machen, nicht erst
  // kurz vor dem Erreichen ihres eigenen Slots.
  const inputRange = [home - screenWidth, home - reveal, home, home + reveal, home + screenWidth];

  return (
    <View style={headerStyles.slideWrap} pointerEvents="none">
      {entries.map((entry, i) => {
        if (Math.abs(i - index) > 1) return null;
        const song = entry.song;

        let opacityOutput;
        let translateOutput;
        if (i === index) {
          // Aktueller Song: bei `home` voll sichtbar, verblasst in beide
          // Richtungen innerhalb von `reveal` Pixeln.
          opacityOutput = [0, 0, 1, 0, 0];
          translateOutput = [
            HEADER_TITLE_SLIDE_DISTANCE,
            HEADER_TITLE_SLIDE_DISTANCE,
            0,
            -HEADER_TITLE_SLIDE_DISTANCE,
            -HEADER_TITLE_SLIDE_DISTANCE,
          ];
        } else if (i > index) {
          // Nächster Song (rechts): parkt rechts außerhalb, schnappt beim
          // Losscrollen nach rechts (Wischen nach links) innerhalb von
          // `reveal` Pixeln auf voll sichtbar/zentriert.
          opacityOutput = [0, 0, 0, 1, 1];
          translateOutput = [
            HEADER_TITLE_SLIDE_DISTANCE,
            HEADER_TITLE_SLIDE_DISTANCE,
            HEADER_TITLE_SLIDE_DISTANCE,
            0,
            0,
          ];
        } else {
          // Vorheriger Song (links): parkt links außerhalb, schnappt beim
          // Losscrollen nach links (Wischen nach rechts) innerhalb von
          // `reveal` Pixeln auf voll sichtbar/zentriert.
          opacityOutput = [1, 1, 0, 0, 0];
          translateOutput = [
            0,
            0,
            -HEADER_TITLE_SLIDE_DISTANCE,
            -HEADER_TITLE_SLIDE_DISTANCE,
            -HEADER_TITLE_SLIDE_DISTANCE,
          ];
        }

        const translateX = scrollX.interpolate({ inputRange, outputRange: translateOutput, extrapolate: 'clamp' });
        const opacity = scrollX.interpolate({ inputRange, outputRange: opacityOutput, extrapolate: 'clamp' });
        return (
          <Animated.View
            key={entry.setlistSongId != null ? String(entry.setlistSongId) : `${song.id}-${i}`}
            style={[headerStyles.slideItem, { opacity, transform: [{ translateX }] }]}
          >
            <Text style={headerStyles.titleText} numberOfLines={1}>
              {song.title}
            </Text>
            {song.artist ? (
              <Text style={headerStyles.artistText} numberOfLines={1}>
                {song.artist}
              </Text>
            ) : null}
          </Animated.View>
        );
      })}
    </View>
  );
}

/**
 * Detailansicht eines Songs. Wird sie mit `setlistId`/`startIndex` aus einer
 * Setliste heraus geöffnet (siehe SetlistDetailScreen), lädt sie die ganze
 * Setliste und stellt zusätzlich zum normalen vertikalen Songtext-Scrollen
 * ein horizontales Blätter-Karussell zum vorherigen/nächsten Song bereit -
 * über eine native, paginierende FlatList (pagingEnabled), strukturell
 * identisch zum Show-Modus (ShowModeScreen): JEDE Seite im Pager nutzt
 * dieselbe SongDetailPage-Komponente (aktiv wie inaktiv), kein Wechsel auf
 * eine andere "Vorschau"-Komponente beim Einrasten mehr - das verursachte
 * zuvor sichtbares Zucken. Ohne `setlistId` (z.B. Aufruf aus der
 * allgemeinen Songliste) verhält sich der Screen wie zuvor: ein einzelner
 * Song, kein Blättern möglich.
 */
export function SongDetailScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const { songId, setlistId, startIndex, startInEdit } = route.params || {};
  const insets = useSafeAreaInsets();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const isLandscape = screenWidth > screenHeight;
  // Wird false, sobald dieser Screen den Fokus verliert (z.B. Wechsel in
  // den Show-Modus) - er bleibt im Navigations-Stack technisch gemountet,
  // seine usePedalAction-Hooks liefen sonst im Hintergrund weiter mit.
  // Zusammen mit isFocused unten in pedalActionsEnabled sorgt das dafür,
  // dass wirklich nur der gerade sichtbare Screen auf Pedal-Tastendrücke
  // reagiert (siehe usePedalCapture.js).
  const isFocused = useIsFocused();

  const [entries, setEntries] = useState([]);
  const [index, setIndex] = useState(0);
  const [song, setSong] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editMode, setEditMode] = useState(!!startInEdit);
  const [isScrolling, setIsScrolling] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [fontSize, setFontSize] = useState(20);
  const [transpose, setTransposeState] = useState(0);

  const [editText, setEditText] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);

  const metronome = useMetronome(song?.id);
  // Audio-Wiedergabe (MP3, Offline-Cache) - komplett entkoppelt vom
  // Songtext/Autoscroll. useAudioPlayer (im Hook) löst beim Song-/
  // Quellenwechsel automatisch die vorherige Player-Instanz sauber auf.
  const audio = useSongAudioPlayer(song);
  const scrollRef = useRef(null);
  const scrollY = useRef(0);
  // Treibt den gleitenden Titel in der Titelleiste (SlidingHeaderTitle) -
  // per Animated.event direkt an den horizontalen contentOffset.x der
  // FlatList gekoppelt (siehe onScroll unten), läuft also im selben Takt
  // wie die Wisch-Geste selbst, nicht erst nach deren Abschluss.
  const scrollX = useRef(new Animated.Value(0)).current;
  const handleFlatListScroll = useRef(
    Animated.event([{ nativeEvent: { contentOffset: { x: scrollX } } }], { useNativeDriver: false })
  ).current;

  const applySongToState = useCallback((row) => {
    setSong(row);
    if (!row) return;
    const data = row.data || {};
    const bpm = Number(data.bpm);
    metronome.setBpm(!isNaN(bpm) && bpm > 0 ? bpm : DEFAULT_BPM);
    setFontSize(Number(data.fontsize) > 0 ? Number(data.fontsize) : 20);
    setTransposeState(Number(data.transpose) || 0);
    setSpeed(Number(data.scrollSpeed) > 0 ? Number(data.scrollSpeed) : 1);
    // eslint-disable-next-line
  }, []);

  // Lädt entweder die ganze Setliste (setlistId vorhanden) oder nur den
  // einzelnen Song (Direktaufruf, z.B. aus der allgemeinen Songliste).
  const loadEntries = useCallback(async () => {
    setLoading(true);
    let loadedEntries = [];
    let initialIndex = 0;

    if (setlistId) {
      loadedEntries = await getSetlistSongs(setlistId);
      const foundIdx = loadedEntries.findIndex((e) => String(e.song.id) === String(songId));
      initialIndex =
        Number.isInteger(startIndex) && startIndex >= 0 && startIndex < loadedEntries.length
          ? startIndex
          : Math.max(0, foundIdx);
    } else {
      const row = await getSongById(songId);
      loadedEntries = row ? [{ song: row }] : [];
    }

    setEntries(loadedEntries);
    setIndex(initialIndex);
    setLoading(false);

    const initialSong = loadedEntries[initialIndex]?.song;
    if (initialSong && startInEdit) {
      setEditText(buildSongText(initialSong));
      setEditMode(true);
    }
    // eslint-disable-next-line
  }, [songId, setlistId, startIndex]);

  useEffect(() => {
    loadEntries();
    // eslint-disable-next-line
  }, [songId, setlistId]);

  // Synchronisiert Titelleiste/Badges/Metronom/Controls auf den aktuell
  // aktiven Song (initial UND bei jedem Blättern, ausgelöst über
  // handleMomentumScrollEnd unten) - Songtext springt an den Anfang,
  // Autoscroll wird gestoppt.
  useEffect(() => {
    applySongToState(entries[index]?.song || null);
    scrollY.current = 0;
    scrollRef.current?.scrollTo({ y: 0, animated: false });
    setIsScrolling(false);
    setMenuOpen(false);
    // Hält scrollX exakt auf der eingerasteten Position - korrigiert
    // eventuelle Rundungsdrift und sorgt beim allerersten Render (bevor die
    // FlatList ihr erstes eigenes onScroll feuert) dafür, dass der
    // gleitende Titel schon korrekt zentriert startet.
    scrollX.setValue(index * screenWidth);
    // eslint-disable-next-line
  }, [index, entries]);

  // Metronom & Audio-Wiedergabe stoppen, sobald der Screen den Fokus
  // verliert (z.B. beim Zurückgehen).
  useFocusEffect(
    useCallback(() => {
      return () => {
        metronome.stopMetronome();
        audio.stop();
      };
      // eslint-disable-next-line
    }, [])
  );

  function handleEditStart() {
    if (!song) return;
    setEditText(buildSongText(song));
    setEditMode(true);
  }

  function handleEditCancel() {
    setEditMode(false);
  }

  async function handleEditSave() {
    if (!song) return;
    const parsed = parseSongText(editText);
    const newData = { ...song.data, bpm: parsed.data.bpm, key: parsed.data.key, tags: parsed.data.tags };
    const updated = await updateSong(song.id, {
      title: parsed.title,
      artist: parsed.artist,
      lyrics: parsed.lyrics,
      data: newData,
    });
    setSong(updated);
    setEntries((prev) => prev.map((e, i) => (i === index ? { ...e, song: updated } : e)));
    setEditMode(false);
    triggerAutoSync();
  }

  async function persistData(patch) {
    if (!song) return;
    const newData = { ...song.data, ...patch };
    const updated = await updateSong(song.id, {
      title: song.title,
      artist: song.artist,
      lyrics: song.lyrics,
      data: newData,
    });
    setSong(updated);
    setEntries((prev) => prev.map((e, i) => (i === index ? { ...e, song: updated } : e)));
    triggerAutoSync();
  }

  function handleTransposeChange(next) {
    setTransposeState(next);
    persistData({ transpose: next });
  }

  function handleFontSizeChange(next) {
    setFontSize(next);
    persistData({ fontsize: next });
  }

  function handleSpeedChange(next) {
    const clamped = Math.min(MAX_SPEED, Math.max(MIN_SPEED, next));
    setSpeed(clamped);
    persistData({ scrollSpeed: clamped });
  }

  // Einzige Titelleiste: Titel/Artist (headerTitle) UND die Action-Icons
  // (Metronom-Licht, Scroll-Start/Pause, Kebab-Menü, headerRight) laufen
  // über denselben Effekt, ausgelöst durch dieselben Abhängigkeiten -
  // dadurch bleiben beide immer synchron zum aktuell aktiven Song (`song`
  // wird ausschließlich durch den [index, entries]-Effekt oben gesetzt,
  // also strikt über den Pager-Index). Kein separates Re-Fetch, kein
  // zweiter State, der aus dem Takt geraten könnte.
  useEffect(() => {
    navigation.setOptions({
      headerTitle: () =>
        entries.length > 0 ? (
          <SlidingHeaderTitle entries={entries} index={index} scrollX={scrollX} screenWidth={screenWidth} />
        ) : null,
      headerRight: () =>
        !editMode ? (
          <View style={headerStyles.headerRightRow}>
            <View style={headerStyles.metroLightWrap}>
              <View style={[headerStyles.metroLight, metronome.metronomePulse && headerStyles.metroLightActive]} />
            </View>
            <TouchableOpacity
              onPress={() => setIsScrolling((v) => !v)}
              style={[headerStyles.scrollBtn, isScrolling && headerStyles.scrollBtnActive]}
            >
              <Text style={headerStyles.scrollBtnText}>{isScrolling ? 'Pause ⏸' : 'Start ▶'}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setMenuOpen((v) => !v)} style={headerStyles.editBtn}>
              <Text style={headerStyles.editBtnText}>⋮</Text>
            </TouchableOpacity>
          </View>
        ) : null,
    });
    // eslint-disable-next-line
  }, [editMode, song, entries, index, screenWidth, metronome.metronomePulse, isScrolling]);

  useEffect(() => {
    if (!isScrolling) return;
    const intervalId = setInterval(() => {
      scrollY.current += speed * 0.8;
      scrollRef.current?.scrollTo({ y: scrollY.current, animated: false });
    }, 50);
    return () => clearInterval(intervalId);
  }, [isScrolling, speed]);

  /**
   * FlatList-Paging: `pagingEnabled` lässt das native Scroll-Handling immer
   * exakt auf den nächsten/vorherigen Song einrasten. `onMomentumScrollEnd`
   * feuert erst, wenn die Seite final eingerastet ist, und synchronisiert
   * dann genau einmal den Index - Titelleiste/Badges/Metronom/Controls
   * werden über den [index, entries]-Effekt oben synchron auf genau einen
   * Song umgeschaltet.
   */
  function handleMomentumScrollEnd(e) {
    const newIndex = Math.round(e.nativeEvent.contentOffset.x / screenWidth);
    if (newIndex !== index && newIndex >= 0 && newIndex < entries.length) {
      setIndex(newIndex);
    }
  }

  // Sanftes Viertelseiten-Scrollen (Pedal-Aktion): addiert die Distanz per
  // RAF-Animation (siehe smoothScroll.js) auf die aktuelle Position auf,
  // ohne einen laufenden Autoscroll (siehe Intervall oben) zu unterbrechen -
  // der Intervall liest scrollY.current bei jedem Tick weiterhin normal
  // weiter, der hier nur einmalig verschoben wird. containerHeight ist die
  // Fensterhöhe als Näherung für die sichtbare Songtext-Fläche (kein exaktes
  // Layout-Measurement dieser ScrollView vorhanden, anders als im
  // Show-Modus).
  function scrollByQuarterPage(direction) {
    const containerHeight = screenHeight;
    const fromY = scrollY.current;
    const toY = Math.max(0, fromY + containerHeight * QUARTER_PAGE_FRACTION * direction);
    animateScrollTo(scrollRef, fromY, toY, QUARTER_PAGE_SCROLL_DURATION_MS, (y) => {
      scrollY.current = y;
    });
  }

  // Bluetooth-Fußpedal: löst dieselbe Start/Stopp-Funktion aus wie der
  // Scroll-Button in der Titelleiste (siehe SettingsScreen für die
  // Zuordnung), sowie die beiden Viertelseiten-Scroll-Aktionen. Nur aktiv,
  // solange die normale Songansicht sichtbar ist (nicht während
  // Laden/Bearbeiten). Vor den frühen Returns aufgerufen, damit die Hooks
  // bei jedem Render in derselben Reihenfolge laufen.
  const pedalActionsEnabled = !loading && !!song && !editMode && isFocused;
  usePedalAction('toggleScroll', () => setIsScrolling((v) => !v), pedalActionsEnabled);
  usePedalAction('scrollQuarterPageDown', () => scrollByQuarterPage(1), pedalActionsEnabled);
  usePedalAction('scrollQuarterPageUp', () => scrollByQuarterPage(-1), pedalActionsEnabled);

  if (loading) {
    return (
      <View style={headerStyles.loadingWrap}>
        <ActivityIndicator size="large" color="#888" />
      </View>
    );
  }

  if (!song) {
    return (
      <View style={headerStyles.loadingWrap}>
        <Text>Song nicht gefunden.</Text>
      </View>
    );
  }

  if (editMode) {
    return (
      <EditSongView
        insetsBottom={insets.bottom}
        editText={editText}
        onTextChange={setEditText}
        onCancel={handleEditCancel}
        onSave={handleEditSave}
      />
    );
  }

  return (
    <View style={headerStyles.carousel}>
      <FlatList
        data={entries}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        initialScrollIndex={index}
        getItemLayout={(data, i) => ({ length: screenWidth, offset: screenWidth * i, index: i })}
        onScroll={handleFlatListScroll}
        scrollEventThrottle={16}
        onMomentumScrollEnd={handleMomentumScrollEnd}
        keyExtractor={(item, i) => (item.setlistSongId != null ? String(item.setlistSongId) : String(item.song.id) + i)}
        windowSize={3}
        maxToRenderPerBatch={3}
        removeClippedSubviews
        focusable={false}
        accessible={false}
        renderItem={({ item, index: itemIndex }) => {
          const active = itemIndex === index;
          return (
            <View style={{ width: screenWidth, height: '100%' }}>
              <SongDetailPage
                song={item.song}
                active={active}
                transposeOverride={transpose}
                fontSizeOverride={fontSize}
                scrollRef={active ? scrollRef : undefined}
                onScroll={active ? (e) => { scrollY.current = e.nativeEvent.contentOffset.y; } : undefined}
                metronome={active ? metronome : null}
                audio={active ? audio : null}
                isLandscape={isLandscape}
              />
            </View>
          );
        }}
      />

      <SongSettingsModal
        visible={menuOpen}
        onClose={() => setMenuOpen(false)}
        onEditStart={handleEditStart}
        transpose={transpose}
        onTransposeDown={() => handleTransposeChange(transpose - 1)}
        onTransposeUp={() => handleTransposeChange(transpose + 1)}
        speed={speed}
        onSpeedDown={() => handleSpeedChange(speed - 1)}
        onSpeedUp={() => handleSpeedChange(speed + 1)}
        fontSize={fontSize}
        onFontSizeDown={() => handleFontSizeChange(Math.max(10, fontSize - 2))}
        onFontSizeUp={() => handleFontSizeChange(Math.min(40, fontSize + 2))}
        metronome={metronome}
      />
    </View>
  );
}

const headerStyles = StyleSheet.create({
  // Gleitender Titel/Artist in der Titelleiste (SlidingHeaderTitle) -
  // overflow:hidden maskiert den Titelbereich, damit der wegschiebende
  // Nachbar-Titel nicht über Zurück-Button/Icons hinausragt. slideItem ist
  // absolut positioniert, damit sich aktueller und Nachbar-Titel im selben
  // Slot überlappen (Voraussetzung für das Cross-Fade/Slide per scrollX).
  slideWrap: { alignSelf: 'stretch', height: 40, justifyContent: 'center', overflow: 'hidden' },
  slideItem: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  titleText: { color: '#FFF', fontSize: 17, fontWeight: 'bold' },
  artistText: { color: 'rgba(255,255,255,0.65)', fontSize: 12, marginTop: 1 },
  headerRightRow: { flexDirection: 'row', alignItems: 'center' },
  // Metronom-Licht in der Titelleiste - dezenter grauer Ring in Ruhe,
  // leuchtet bei jedem Takt-Impuls gelb auf (siehe metronome.metronomePulse).
  // Doppelt so groß wie ursprünglich (28px statt 14px).
  metroLightWrap: { width: 40, alignItems: 'center', justifyContent: 'center' },
  metroLight: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.4)',
  },
  metroLightActive: {
    backgroundColor: '#FFD700',
    borderColor: '#FFD700',
    transform: [{ scale: 1.3 }],
  },
  // Start/Pause-Button für das Songtext-Autoscroll.
  scrollBtn: {
    marginRight: 10,
    minWidth: 130,
    height: 50,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    backgroundColor: 'rgba(119,221,119,0.9)',
    borderRadius: 10,
  },
  scrollBtnActive: { backgroundColor: 'rgba(255,123,123,0.9)' },
  scrollBtnText: { color: '#183318', fontWeight: 'bold', fontSize: 13 },
  editBtn: {
    marginRight: 12,
    width: 50,
    height: 50,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 10,
  },
  editBtnText: { color: '#FFF', fontWeight: 'bold', fontSize: 22, lineHeight: 24 },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F4F4F4' },
  carousel: { flex: 1 },
});
