import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, ActivityIndicator, TouchableOpacity, Text, ScrollView, FlatList, StyleSheet, useWindowDimensions } from 'react-native';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getSongById, updateSong, getSetlistSongs } from '../db/database';
import { useMetronome } from '../hooks/useMetronome';
import { renderChordProLines, transposeKeyDisplay, resolvePreferFlat, buildSongText, parseSongText } from '../utils/chordParser';
import { SongDetailView } from '../components/SongDetailView';
import { EditSongView } from '../components/EditSongView';
import { ChordProLines } from '../components/ChordProLines';
import { getChordSettings } from '../services/chordSettingsService';
import { styles as appStyles } from '../styles/appStyles';

const DEFAULT_BPM = 120;
const MIN_SPEED = 1;
const MAX_SPEED = 10;

const THEME_BACKGROUND = { light: '#F4F4F4', dark: '#121212' };

/**
 * Leichtgewichtige, nicht-interaktive Vorschau des vorherigen/nächsten Songs
 * einer Setliste - wird von der horizontalen Paging-FlatList (siehe
 * SongDetailScreen) für alle nicht-aktiven Items gerendert. Bewusst OHNE
 * Metronom/State (kein useMetronome-Hook, keine Controls), damit nicht
 * mehrere Audio-Player-Pools gleichzeitig instanziiert werden - nur die
 * aktive Seite ist voll interaktiv (SongDetailView).
 */
function DetailPagePreview({ song }) {
  if (!song) {
    return <View style={{ flex: 1, backgroundColor: '#F4F4F4' }} />;
  }

  const { typography } = getChordSettings();
  const backgroundColor = THEME_BACKGROUND[typography.theme] || THEME_BACKGROUND.light;
  const titleColor = typography.theme === 'dark' ? '#FFFFFF' : '#222222';
  const preferFlat = resolvePreferFlat(song.data?.key);
  const renderedLines = renderChordProLines(song.lyrics || '', 0, preferFlat);
  const keyDisplay = transposeKeyDisplay(song.data?.key, 0, preferFlat);
  const fontSize = Number(song.data?.fontsize) > 0 ? Number(song.data.fontsize) : 20;
  const bpm = song.data?.bpm || '-';

  return (
    <View style={{ flex: 1, backgroundColor }} pointerEvents="none">
      <View style={previewStyles.header}>
        <Text style={[previewStyles.title, { color: titleColor }]} numberOfLines={1}>
          {song.title}
        </Text>
        {song.artist ? (
          <Text style={previewStyles.artist} numberOfLines={1}>
            {song.artist}
          </Text>
        ) : null}
      </View>
      <View style={{ flex: 1, position: 'relative' }}>
        <ScrollView style={[appStyles.lyricsContainer, { backgroundColor }]} scrollEnabled={false}>
          <ChordProLines lines={renderedLines} fontSize={fontSize} />
        </ScrollView>
        <View style={appStyles.fixedBadgesWrap}>
          <View style={[appStyles.fixedBadge, !keyDisplay && appStyles.fixedBadgeWarning]}>
            <Text style={appStyles.fixedBadgeText}>{keyDisplay || 'No Key'}</Text>
          </View>
          <View style={[appStyles.fixedBadge, appStyles.fixedBadgeSpacing]}>
            <Text style={appStyles.fixedBadgeText}>⏱ {bpm}</Text>
          </View>
        </View>
      </View>
    </View>
  );
}

/**
 * Detailansicht eines Songs. Wird sie mit `setlistId`/`startIndex` aus einer
 * Setliste heraus geöffnet (siehe SetlistDetailScreen), lädt sie die ganze
 * Setliste und stellt zusätzlich zum normalen vertikalen Songtext-Scrollen
 * ein horizontales Blätter-Karussell zum vorherigen/nächsten Song bereit -
 * über eine native, paginierende FlatList (pagingEnabled), exakt wie im
 * Show-Modus (ShowModeScreen). Ohne `setlistId` (z.B. Aufruf aus der
 * allgemeinen Songliste) verhält sich der Screen wie zuvor: ein einzelner
 * Song, kein Blättern möglich.
 */
export function SongDetailScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const { songId, setlistId, startIndex, startInEdit } = route.params || {};
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();

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

  const metronome = useMetronome(song?.id);
  const scrollRef = useRef(null);
  const scrollY = useRef(0);

  const applySongToState = useCallback((row) => {
    setSong(row);
    if (!row) return;
    const data = row.data || {};
    const bpm = Number(data.bpm);
    metronome.setBpm(!isNaN(bpm) && bpm > 0 ? bpm : DEFAULT_BPM);
    setFontSize(Number(data.fontsize) > 0 ? Number(data.fontsize) : 20);
    setTransposeState(Number(data.transpose) || 0);
    setSpeed(Number(data.scrollSpeed) > 0 ? Number(data.scrollSpeed) : 1);
    navigation.setOptions({ title: row.artist ? `${row.title} - ${row.artist}` : row.title || 'Untitled Song' });
    // eslint-disable-next-line
  }, [navigation]);

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

  // Synchronisiert Header/Badges/Metronom/Controls auf den aktuell aktiven
  // Song (initial UND bei jedem Blättern) - Songtext springt an den Anfang,
  // Autoscroll wird gestoppt.
  useEffect(() => {
    applySongToState(entries[index]?.song || null);
    scrollY.current = 0;
    scrollRef.current?.scrollTo({ y: 0, animated: false });
    setIsScrolling(false);
    // eslint-disable-next-line
  }, [index, entries]);

  // Metronom stoppen, sobald der Screen den Fokus verliert (z.B. beim Zurückgehen).
  useFocusEffect(
    useCallback(() => {
      return () => {
        metronome.stopMetronome();
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

  useEffect(() => {
    navigation.setOptions({
      headerRight: () =>
        !editMode ? (
          <TouchableOpacity onPress={handleEditStart} style={headerStyles.editBtn}>
            <Text style={headerStyles.editBtnText}>Edit</Text>
          </TouchableOpacity>
        ) : null,
    });
    // eslint-disable-next-line
  }, [editMode, song]);

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
   * dann genau einmal den Index - Header/Badges/Metronom/Controls werden
   * über den [index, entries]-Effekt oben synchron auf genau einen Song
   * umgeschaltet.
   */
  function handleMomentumScrollEnd(e) {
    const newIndex = Math.round(e.nativeEvent.contentOffset.x / screenWidth);
    if (newIndex !== index && newIndex >= 0 && newIndex < entries.length) {
      setIndex(newIndex);
    }
  }

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

  const preferFlat = resolvePreferFlat(song.data?.key);
  const renderedLines = renderChordProLines(song.lyrics || '', transpose, preferFlat);
  const keyDisplay = transposeKeyDisplay(song.data?.key, transpose, preferFlat);

  return (
    <View style={headerStyles.carousel}>
      <FlatList
        data={entries}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        initialScrollIndex={index}
        getItemLayout={(data, i) => ({ length: screenWidth, offset: screenWidth * i, index: i })}
        onMomentumScrollEnd={handleMomentumScrollEnd}
        keyExtractor={(item, i) => (item.setlistSongId != null ? String(item.setlistSongId) : String(item.song.id) + i)}
        windowSize={3}
        maxToRenderPerBatch={3}
        removeClippedSubviews
        renderItem={({ item, index: itemIndex }) => {
          if (itemIndex !== index) {
            return (
              <View style={{ width: screenWidth, height: '100%' }}>
                <DetailPagePreview song={item.song} />
              </View>
            );
          }
          return (
            <View style={{ width: screenWidth, height: '100%' }}>
              <SongDetailView
                insetsBottom={insets.bottom}
                keyDisplay={keyDisplay}
                hasExplicitBpm={Number.isFinite(Number(song.data?.bpm)) && Number(song.data.bpm) > 0}
                renderedLines={renderedLines}
                fontSize={fontSize}
                transpose={transpose}
                speed={speed}
                isScrolling={isScrolling}
                scrollRef={scrollRef}
                onScroll={(e) => { scrollY.current = e.nativeEvent.contentOffset.y; }}
                onToggleScrolling={() => setIsScrolling(!isScrolling)}
                onTransposeDown={() => handleTransposeChange(transpose - 1)}
                onTransposeUp={() => handleTransposeChange(transpose + 1)}
                onSpeedDown={() => handleSpeedChange(speed - 1)}
                onSpeedUp={() => handleSpeedChange(speed + 1)}
                onFontSizeDown={() => handleFontSizeChange(Math.max(10, fontSize - 2))}
                onFontSizeUp={() => handleFontSizeChange(Math.min(40, fontSize + 2))}
                metronome={metronome}
              />
            </View>
          );
        }}
      />
    </View>
  );
}

const headerStyles = StyleSheet.create({
  editBtn: { marginRight: 12, padding: 6, backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 6 },
  editBtnText: { color: '#FFF', fontWeight: 'bold' },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F4F4F4' },
  carousel: { flex: 1 },
});

const previewStyles = StyleSheet.create({
  header: { paddingHorizontal: 20, paddingVertical: 12 },
  title: { fontSize: 20, fontWeight: 'bold' },
  artist: { fontSize: 13, color: '#9CA3AF', marginTop: 2 },
});
