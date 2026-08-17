import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, Text, View, FlatList, TouchableOpacity, ScrollView, StatusBar, TextInput, Platform } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAudioPlayer, setAudioModeAsync } from 'expo-audio';
import { parseChordPro, setDirective, renderTransposedLyrics } from './src/utils/chordParser';
import { INITIAL_SONGS } from './src/data/initialSongs';

const isWeb = Platform.OS === 'web';

// Kurzer Metronom-Click als Base64-WAV (ca. 1 kHz, 30 ms, Mono)
const METRONOME_CLICK_BASE64 =
  'UklGRtQAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YYQAAACAgIDg4ODg4ODg4ODg4ODg4ODg4ODg4ODg4ODg4ODg4ODg4ODg4ODg4ODg4ODg4ODg4ODg4ODg4ODg4ODg4ODg4ODg4ODg4ODg4ODg4ODg4ODg4ODg4ODg4ODg4ODg4ODg4ODg4ODg4ODg4ODg4ODg4ODg4ODg4ODg4ODg4ODg4ODg4ODg4OD';
const METRONOME_CLICK_SOURCE = `data:audio/wav;base64,${METRONOME_CLICK_BASE64}`;

// ----------- React Komponente -------------
function AppInner() {
  const [songs, setSongs] = useState(INITIAL_SONGS);
  const [selectedSong, setSelectedSong] = useState(null);
  const [isScrolling, setIsScrolling] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [preferFlat, setPreferFlat] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editLyrics, setEditLyrics] = useState('');
  const [editTitle, setEditTitle] = useState('');
  const [editArtist, setEditArtist] = useState('');
  const [fontSize, setFontSize] = useState(20);

  // --- Metronom State ---
  const [bpm, setBpm] = useState(120);
  const [isMetronomeActive, setIsMetronomeActive] = useState(false);
  const [metronomePulse, setMetronomePulse] = useState(false);

  // --- Audio (Mute) State ---
  const [isMetronomeMuted, setIsMetronomeMuted] = useState(false);

  const metronomeTimeout = useRef(null);
  const webAudioCtx = useRef(null);
  const metronomePlayer = useAudioPlayer(isWeb ? null : METRONOME_CLICK_SOURCE);

  useEffect(() => {
    if (isWeb) return;
    setAudioModeAsync({ playsInSilentMode: true });
  }, []);

  async function playMetronomeClick() {
    if (isMetronomeMuted) return;
    if (isWeb) {
      if (typeof window === 'undefined') return;
      const WebAudioContext = window.AudioContext || window.webkitAudioContext;
      if (!WebAudioContext) return;

      if (!webAudioCtx.current) {
        webAudioCtx.current = new WebAudioContext();
      }
      const ctx = webAudioCtx.current;
      if (ctx.state === 'suspended') {
        try {
          await ctx.resume();
        } catch (e) {
          return;
        }
      }

      const duration = 0.027;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = 940;
      gain.gain.value = 0.18;
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      gain.gain.setValueAtTime(0.18, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0, ctx.currentTime + duration);
      osc.stop(ctx.currentTime + duration);
      osc.onended = () => {
        osc.disconnect();
        gain.disconnect();
      };
    } else if (metronomePlayer.isLoaded) {
      try {
        await metronomePlayer.seekTo(0);
        metronomePlayer.play();
      } catch (e) {
        // ignore, silent fail
      }
    }
  }

  // Synchronisiere BPM und Schriftgröße beim Songwechsel
  useEffect(() => {
    if (!selectedSong) return;
    const cp = parseChordPro(selectedSong.lyrics);
    const tempo = Number(cp.meta.tempo);
    const savedFontSize = Number(cp.meta.fontsize);
    setBpm(isNaN(tempo) ? 120 : tempo);
    if (!isNaN(savedFontSize)) {
      setFontSize(savedFontSize);
    }
    setIsMetronomeActive(false);
    setMetronomePulse(false);
    clearTimeout(metronomeTimeout.current);
    // eslint-disable-next-line
  }, [selectedSong]);

  // Dieser Effekt steuert das Metronom-Pulsing (inkl. Audio-Klick/Ton)
  useEffect(() => {
    if (!isMetronomeActive) {
      setMetronomePulse(false);
      clearTimeout(metronomeTimeout.current);
      return;
    }
    let cancelled = false;
    function pulse() {
      if (cancelled) return;
      setMetronomePulse(true);
      playMetronomeClick();
      metronomeTimeout.current = setTimeout(() => {
        setMetronomePulse(false);
        // Starte nächsten Puls nach Intervall
        metronomeTimeout.current = setTimeout(() => {
          if (!cancelled) {
            pulse();
          }
        }, Math.max(10, (60 / bpm) * 1000 - 100)); // -100ms damit der Puls kurz sichtbar ist
      }, 100); // Pulsdauer (ms)
    }
    pulse();
    return () => {
      cancelled = true;
      clearTimeout(metronomeTimeout.current);
    };
    // ACHTUNG: playMetronomeClick als Dependency würde Endlosschleife triggern – intentionally omitted
    // eslint-disable-next-line
  }, [isMetronomeActive, bpm, selectedSong, isMetronomeMuted]);

  const scrollRef = useRef(null);
  const scrollY = useRef(0);

  const insets = useSafeAreaInsets();
  const currentChordPro = selectedSong ? parseChordPro(selectedSong.lyrics) : null;

  function updateSongLyrics(newLyrics) {
    if (!selectedSong) return;
    const updated = { ...selectedSong, lyrics: newLyrics };
    setSongs((prev) => prev.map((song) => (song.id === updated.id ? updated : song)));
    setSelectedSong(updated);
  }

  function getCurrentTranspose() {
    if (!selectedSong) return 0;
    const value = Number(parseChordPro(selectedSong.lyrics).meta.transpose);
    return isNaN(value) ? 0 : value;
  }

  function setTranspose(value) {
    if (!selectedSong) return;
    updateSongLyrics(setDirective(selectedSong.lyrics, 'transpose', String(value)));
  }

  function setFontSizeDir(size) {
    if (!selectedSong) return;
    updateSongLyrics(setDirective(selectedSong.lyrics, 'fontsize', String(size)));
  }

  function getRenderedLyrics() {
    if (!selectedSong) return '';
    return renderTransposedLyrics(selectedSong.lyrics, getCurrentTranspose(), preferFlat);
  }

  function handleEditStart() {
    if (!selectedSong) return;
    const cp = parseChordPro(selectedSong.lyrics);
    setEditTitle(cp.meta.title || '');
    setEditArtist(cp.meta.artist || '');
    setEditLyrics(selectedSong.lyrics);
    setEditMode(true);
  }

  function handleEditTitleChange(text) {
    setEditTitle(text);
    setEditLyrics((prev) => setDirective(prev, 'title', text));
  }

  function handleEditArtistChange(text) {
    setEditArtist(text);
    setEditLyrics((prev) => setDirective(prev, 'artist', text));
  }

  function handleEditCancel() {
    setEditMode(false);
  }

  function handleEditSave() {
    if (!selectedSong) return;
    updateSongLyrics(editLyrics);
    setEditMode(false);
  }

  useEffect(() => {
    if (!isScrolling) return;
    const intervalId = setInterval(() => {
      scrollY.current += speed * 0.8;
      scrollRef.current?.scrollTo({ y: scrollY.current, animated: false });
    }, 50);
    return () => clearInterval(intervalId);
  }, [isScrolling, speed]);

  // -------- Render UI ------

  return (
    <View style={[styles.safeArea, { paddingTop: insets.top }]}>
      <StatusBar barStyle="dark-content" />
      {selectedSong ? (
        editMode ? (
          // Editieransicht - alle Werte werden aus ChordPro geholt!
          <>
            <View style={styles.header}>
              <TouchableOpacity onPress={() => { setIsScrolling(false); setSelectedSong(null); setEditMode(false); scrollY.current = 0; }} style={styles.backBtn}>
                <Text style={styles.btnText}>‹ Zurück</Text>
              </TouchableOpacity>
              <Text style={styles.headerTitle} numberOfLines={1}>{'Bearbeiten'}</Text>
            </View>
            <ScrollView style={styles.lyricsContainer} keyboardShouldPersistTaps="handled">
              <Text style={styles.label}>Titel</Text>
              <TextInput
                style={styles.input}
                value={editTitle}
                onChangeText={handleEditTitleChange}
                placeholder="Titel"
                placeholderTextColor="#aaa"
              />
              <Text style={styles.label}>Interpret</Text>
              <TextInput
                style={styles.input}
                value={editArtist}
                onChangeText={handleEditArtistChange}
                placeholder="Interpret"
                placeholderTextColor="#aaa"
              />
              <Text style={styles.label}>Lyrics mit ChordPro-Tags & Akkorden</Text>
              <TextInput
                style={[styles.input, styles.lyricsEditInput]}
                value={editLyrics}
                onChangeText={setEditLyrics}
                placeholder={`{title: ...}\n[Am] ...`}
                placeholderTextColor="#aaa"
                multiline
                textAlignVertical="top"
              />
              <View style={{ height: 100 }} />
            </ScrollView>
            <View style={[styles.controlBarEdit, { paddingBottom: insets.bottom }]}>
              <TouchableOpacity onPress={handleEditCancel} style={styles.cancelBtn}>
                <Text style={styles.cancelBtnText}>Abbrechen</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleEditSave} style={styles.saveBtn}>
                <Text style={styles.saveBtnText}>Speichern</Text>
              </TouchableOpacity>
            </View>
          </>
        ) : (
          // normale Detailansicht
          <>
            <View style={styles.header}>
              <TouchableOpacity onPress={() => { setIsScrolling(false); setSelectedSong(null); scrollY.current = 0; setEditMode(false); clearTimeout(metronomeTimeout.current); setIsMetronomeActive(false); }} style={styles.backBtn}>
                <Text style={styles.btnText}>‹ Zurück</Text>
              </TouchableOpacity>
              <Text style={styles.headerTitle} numberOfLines={1}>{currentChordPro?.meta.title || 'Untitled Song'}</Text>
              <TouchableOpacity onPress={handleEditStart} style={styles.editBtn}>
                <Text style={styles.editBtnText}>Edit</Text>
              </TouchableOpacity>
            </View>
            {/* ----- Metronom UI ----- */}
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
                onPress={() => setIsMetronomeMuted(m => !m)}
                style={[styles.metroMuteBtn, isMetronomeMuted ? styles.metroMuted : null]}
                accessibilityLabel={isMetronomeMuted ? "Metronom-Ton ein" : "Metronom-Ton aus"}
              >
                <Text style={styles.metroMuteIcon}>
                  {isMetronomeMuted
                    ? // Lautsprecher durchgestrichen
                      "\uD83D\uDD07"
                    : // Lautsprecher normal
                      "\uD83D\uDD0A"
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
            {/* ----- /Metronom UI ----- */}
            <ScrollView
              ref={scrollRef}
              style={styles.lyricsContainer}
              onScroll={(e) => { scrollY.current = e.nativeEvent.contentOffset.y; }}
              scrollEventThrottle={16}
            >
              {/* Anzeigen von Titel, Artist, Capo, Tempo - alles aus ChordPro */}
              <Text style={{ color: '#666', fontSize: 14, fontStyle: 'italic', marginBottom: 8 }}>
                {currentChordPro?.meta.artist ? currentChordPro.meta.artist : ''}
              </Text>
              <Text
                style={[
                  styles.lyricsText,
                  { fontSize: fontSize }
                ]}
              >
                {getRenderedLyrics()}
              </Text>
              <View style={{ height: 300 }} />
            </ScrollView>
            <View style={[styles.controlBar, { paddingBottom: insets.bottom }]}>
              {/* Transponier- und FontSize-Leiste, Buttons und Zahl */}
              <View style={styles.transposeControls}>
                {/* Transpose */}
                <TouchableOpacity onPress={() => {
                  let curr = getCurrentTranspose();
                  setTranspose(curr - 1);
                }} style={styles.transposeBtn}>
                  <Text style={styles.transposeBtnText}>-</Text>
                </TouchableOpacity>
                <Text style={styles.transposeText}>{(() => { let t = getCurrentTranspose(); return t > 0 ? `+${t}` : t; })()}</Text>
                <TouchableOpacity onPress={() => {
                  let curr = getCurrentTranspose();
                  setTranspose(curr + 1);
                }} style={styles.transposeBtn}>
                  <Text style={styles.transposeBtnText}>+</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setPreferFlat(!preferFlat)} style={styles.flatSharpBtn}>
                  <Text style={styles.flatSharpBtnText}>{preferFlat ? 'b' : '#'}</Text>
                </TouchableOpacity>
              </View>
              <TouchableOpacity
                style={[styles.playBtn, isScrolling && styles.playBtnActive]}
                onPress={() => setIsScrolling(!isScrolling)}
              >
                <Text style={styles.playBtnText}>{isScrolling ? 'Pause ⏸' : 'Start ▶'}</Text>
              </TouchableOpacity>
              {/* FontSize buttons */}
              <View style={styles.speedControls}>
                <TouchableOpacity onPress={() => {
                  const s = Math.max(10, fontSize - 2);
                  setFontSize(s);
                  setFontSizeDir(s);
                }} style={styles.speedBtn}>
                  <Text style={styles.speedBtnText}>A-</Text>
                </TouchableOpacity>
                <Text style={styles.speedText}>{fontSize}px</Text>
                <TouchableOpacity onPress={() => {
                  const s = Math.min(40, fontSize + 2);
                  setFontSize(s);
                  setFontSizeDir(s);
                }} style={styles.speedBtn}>
                  <Text style={styles.speedBtnText}>A+</Text>
                </TouchableOpacity>
              </View>
            </View>
          </>
        )
      ) : (
        // Hauptliste
        <>
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Mein Songbook</Text>
          </View>
          <FlatList
            data={songs}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => {
              const meta = parseChordPro(item.lyrics)?.meta;
              return (
                <TouchableOpacity
                  style={styles.songItem}
                  onPress={() => {
                    setSelectedSong(item);
                    setEditMode(false);
                  }}
                >
                  <Text style={styles.songTitle}>{meta?.title || 'Untitled Song'}</Text>
                  <Text style={styles.songArtist}>{meta?.artist || ''}</Text>
                </TouchableOpacity>
              );
            }}
          />
        </>
      )}
    </View>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AppInner />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F4F4F4',
    // paddingTop wird dynamisch via SafeAreaInsets gesetzt
  },
  container: { flex: 1, backgroundColor: '#F4F4F4' },
  header: {
    // Kein paddingTop mehr, safe-area oben nur durch äußeren Container per useSafeAreaInsets
    paddingHorizontal: 16,
    paddingVertical: 16,
    backgroundColor: '#FAFAFA',
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  headerTitle: { color: '#222', fontSize: 18, fontWeight: 'bold', marginLeft: 10, flex: 1 },
  backBtn: { padding: 8, backgroundColor: '#E0E0E0', borderRadius: 6 },
  btnText: { color: '#222', fontWeight: 'bold' },
  editBtn: { marginLeft: 10, padding: 8, backgroundColor: '#DDD', borderRadius: 6 },
  editBtnText: { color: '#222', fontWeight: 'bold' },
  songItem: { padding: 18, borderBottomWidth: 1, borderBottomColor: '#EBEBEB' },
  songTitle: { color: '#222', fontSize: 18, fontWeight: 'bold' },
  songArtist: { color: '#888', fontSize: 14, marginTop: 4 },
  lyricsContainer: { flex: 1, padding: 20 },
  lyricsText: { color: '#222', fontSize: 20, lineHeight: 32, fontFamily: 'monospace' },
  controlBar: {
    padding: 14,
    backgroundColor: '#FAFAFA',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
    // paddingBottom für gestenleiste wird dynamisch hinzugefügt
  },
  controlBarEdit: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 14,
    backgroundColor: '#FAFAFA',
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
    // paddingBottom für gestenleiste wird dynamisch hinzugefügt
  },
  // --- Metronom Styles ---
  metronomeBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 8,
    paddingBottom: 8,
    paddingHorizontal: 18,
    backgroundColor: '#FCFCFC',
    borderBottomWidth: 1,
    borderBottomColor: '#E6E6E6',
  },
  metroBtn: {
    backgroundColor: '#E0E0E0',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    marginRight: 18,
  },
  metroPlayActive: {
    backgroundColor: '#FFDF91',
  },
  metroBtnText: {
    color: '#222',
    fontWeight: 'bold',
    fontSize: 15,
  },
  bpmControls: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
  bpmBtn: {
    backgroundColor: '#F1F1F1',
    borderRadius: 8,
    paddingHorizontal: 9,
    paddingVertical: 6,
    marginHorizontal: 2,
  },
  bpmBtnText: {
    color: '#333',
    fontSize: 15,
    fontWeight: 'bold',
  },
  bpmText: {
    color: '#222',
    fontWeight: 'bold',
    fontSize: 16,
    marginHorizontal: 10,
    minWidth: 62,
    textAlign: 'center'
  },
  // -- Mute/Unmute Metronom Button --
  metroMuteBtn: {
    backgroundColor: '#EFEFEF',
    borderRadius: 8,
    marginLeft: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: '#DDD',
    justifyContent: 'center',
    alignItems: 'center'
  },
  metroMuted: {
    backgroundColor: '#FADADA',
    borderColor: '#C29797'
  },
  metroMuteIcon: {
    fontSize: 22,
    marginHorizontal: 0,
    color: '#7C6D6D'
  },
  metroCircleWrap: {
    width: 38,
    alignItems: 'center',
    marginLeft: 10,
  },
  metroCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#EEE',
    marginVertical: 3,
    borderWidth: 1.5,
    borderColor: '#D2B20E',
    transform: [{ scale: 1 }],
    transitionProperty: 'backgroundColor',
  },
  metroCircleActive: {
    backgroundColor: '#FFD700',
    transform: [{ scale: 1.4 }],
    // shadow kann auf Wunsch noch "pop" hinzufügen:
    shadowColor: '#FFD700',
    shadowRadius: 12,
    shadowOpacity: 0.6,
    shadowOffset: { width: 0, height: 0 },
    elevation: 4,
  },
  playBtn: { backgroundColor: '#77DD77', paddingVertical: 10, paddingHorizontal: 20, borderRadius: 8 },
  playBtnActive: { backgroundColor: '#FF7B7B' },
  playBtnText: { color: '#222', fontWeight: 'bold', fontSize: 16 },
  speedControls: { flexDirection: 'row', alignItems: 'center' },
  speedBtn: { backgroundColor: '#E0E0E0', width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
  speedBtnText: { color: '#222', fontSize: 17, fontWeight: 'bold' },
  speedText: { color: '#222', marginHorizontal: 12, fontSize: 16, fontWeight: 'bold' },
  transposeControls: { flexDirection: 'row', alignItems: 'center', marginRight: 16 },
  transposeBtn: { backgroundColor: '#E0E0E0', width: 32, height: 32, borderRadius: 16, justifyContent: 'center', alignItems: 'center', marginHorizontal: 4 },
  transposeBtnText: { color: '#222', fontWeight: 'bold', fontSize: 18 },
  transposeText: { color: '#222', marginHorizontal: 2, fontSize: 16, fontWeight: 'bold', minWidth: 28, textAlign: 'center' },
  flatSharpBtn: { backgroundColor: '#FFF', borderRadius: 8, marginLeft: 4, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1, borderColor: '#E0E0E0' },
  flatSharpBtnText: { color: '#222', fontWeight: 'bold', fontSize: 16 },
  label: { color: '#222', fontSize: 15, marginTop: 12, marginBottom: 4 },
  input: { backgroundColor: '#FFF', color: '#222', fontSize: 17, borderRadius: 6, padding: 10, marginBottom: 6 },
  lyricsEditInput: { minHeight: 120, fontFamily: 'monospace', textAlignVertical: 'top' },
  cancelBtn: { backgroundColor: '#DDD', paddingVertical: 10, paddingHorizontal: 18, borderRadius: 8 },
  cancelBtnText: { color: '#222', fontWeight: 'bold', fontSize: 16 },
  saveBtn: { backgroundColor: '#77DD77', paddingVertical: 10, paddingHorizontal: 18, borderRadius: 8 },
  saveBtnText: { color: '#222', fontWeight: 'bold', fontSize: 16 },
});