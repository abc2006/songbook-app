import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, ActivityIndicator, TouchableOpacity, Text, StyleSheet } from 'react-native';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getSongById, updateSong } from '../db/database';
import { useMetronome } from '../hooks/useMetronome';
import { renderChordProLines, transposeKeyDisplay, resolvePreferFlat, buildSongText, parseSongText } from '../utils/chordParser';
import { SongDetailView } from '../components/SongDetailView';
import { EditSongView } from '../components/EditSongView';

const DEFAULT_BPM = 120;
const MIN_SPEED = 1;
const MAX_SPEED = 10;

export function SongDetailScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const { songId, startInEdit } = route.params || {};
  const insets = useSafeAreaInsets();

  const [song, setSong] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editMode, setEditMode] = useState(!!startInEdit);
  const [isScrolling, setIsScrolling] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [fontSize, setFontSize] = useState(20);
  const [transpose, setTransposeState] = useState(0);

  const [editText, setEditText] = useState('');

  const metronome = useMetronome(songId);
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

  const loadSong = useCallback(async () => {
    const row = await getSongById(songId);
    applySongToState(row);
    setLoading(false);
    if (row && startInEdit) {
      setEditText(buildSongText(row));
      setEditMode(true);
    }
    // eslint-disable-next-line
  }, [songId, applySongToState]);

  useEffect(() => {
    loadSong();
    // eslint-disable-next-line
  }, [songId]);

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
    applySongToState(updated);
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

  const preferFlat = resolvePreferFlat(song.data?.key);
  const renderedLines = renderChordProLines(song.lyrics || '', transpose, preferFlat);
  const keyDisplay = transposeKeyDisplay(song.data?.key, transpose, preferFlat);

  return editMode ? (
    <EditSongView
      insetsBottom={insets.bottom}
      editText={editText}
      onTextChange={setEditText}
      onCancel={handleEditCancel}
      onSave={handleEditSave}
    />
  ) : (
    <SongDetailView
      insetsBottom={insets.bottom}
      keyDisplay={keyDisplay}
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
  );
}

const headerStyles = StyleSheet.create({
  editBtn: { marginRight: 12, padding: 6, backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 6 },
  editBtnText: { color: '#FFF', fontWeight: 'bold' },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F4F4F4' },
});
