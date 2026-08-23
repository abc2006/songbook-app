import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  BackHandler,
  useWindowDimensions,
  StatusBar,
} from 'react-native';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getSetlistSongs } from '../db/database';
import { renderChordProLines, transposeKeyDisplay, resolvePreferFlat } from '../utils/chordParser';
import { ChordProLines } from '../components/ChordProLines';
import { getChordSettings } from '../services/chordSettingsService';

const THEME_BACKGROUND = { light: '#F4F4F4', dark: '#121212' };
// Statusleisten-Bereich bleibt im Show-Modus IMMER auf diesem dunklen
// Hintergrund (unabhängig vom hellen/dunklen Song-Theme), damit Uhrzeit/
// Akkustand (weiße Symbole, siehe App.js-StatusBar) jederzeit lesbar bleiben.
const STATUS_BAR_BACKGROUND = '#121212';

const TAP_MOVE_THRESHOLD = 12;
const TAP_TIME_THRESHOLD = 400;
const EXIT_CONFIRM_TIMEOUT = 2000;

// Auto-Scroll-Takt: alle SCROLL_TICK_MS wird um (Basisgeschwindigkeit *
// SCROLL_STEP_FACTOR) Pixel gescrollt - eine einzige, konstante, lineare
// Geschwindigkeit von Songanfang bis Songende, ohne Start-Delay, Fast-
// Forward, Pausen oder Geschwindigkeitszonen.
const SCROLL_TICK_MS = 50;
const SCROLL_STEP_FACTOR = 0.8;
// Interner Fallback-Wert, falls {bpm:} fehlt oder ungültig/0 ist - das
// BPM-Badge in der Header-Leiste färbt sich in diesem Fall rot (Warnhinweis).
const FALLBACK_BPM = 120;

/**
 * Ein einzelnes "Blatt" (Song-Seite) im Show-Modus-Karussell. Nur die aktive
 * (aktuelle) Seite ist scrollbar/interaktiv - die Nachbarn sind reine
 * Paging-Vorschau. Als eigene Komponente definiert (nicht inline), damit
 * React sie beim Neu-Rendern nicht jedes Mal neu montiert.
 */
function SongPage({ song, active, scrollRef, onScroll, onContentMetricsChange }) {
  const contentMetricsRef = useRef({ contentHeight: 0, viewportHeight: 0 });

  function reportContentFit() {
    if (!active || !onContentMetricsChange) return;
    const { contentHeight, viewportHeight } = contentMetricsRef.current;
    if (contentHeight > 0 && viewportHeight > 0) {
      onContentMetricsChange({ contentHeight, viewportHeight, fits: contentHeight <= viewportHeight });
    }
  }

  function handleScrollViewLayout(e) {
    contentMetricsRef.current.viewportHeight = e.nativeEvent.layout.height;
    reportContentFit();
  }

  function handleContentSizeChange(w, h) {
    contentMetricsRef.current.contentHeight = h;
    reportContentFit();
  }

  if (!song) {
    return <View style={{ flex: 1 }} />;
  }

  const { typography } = getChordSettings();
  const backgroundColor = THEME_BACKGROUND[typography.theme] || THEME_BACKGROUND.light;
  const titleColor = typography.theme === 'dark' ? '#FFFFFF' : '#222222';

  const transpose = Number(song.data?.transpose) || 0;
  const preferFlat = resolvePreferFlat(song.data?.key);
  const renderedLines = renderChordProLines(song.lyrics || '', transpose, preferFlat);
  const keyDisplay = transposeKeyDisplay(song.data?.key, transpose, preferFlat);
  const fontSize = Number(song.data?.fontsize) > 0 ? Number(song.data.fontsize) : 20;
  // Fehlt {bpm:} oder ist der Wert 0/ungültig, wird intern ein Fallback von
  // FALLBACK_BPM verwendet, damit immer ein sinnvoller Wert vorliegt - das
  // BPM-Badge färbt sich in diesem Fall knallrot als Warnhinweis, dass dem
  // Song der BPM-Tag fehlt.
  const rawBpm = Number(song.data?.bpm);
  const hasValidBpm = Number.isFinite(rawBpm) && rawBpm > 0;
  const bpm = hasValidBpm ? rawBpm : FALLBACK_BPM;

  return (
    <View style={[{ flex: 1, backgroundColor }]} pointerEvents={active ? 'auto' : 'none'}>
      {/* Feste Header-Leiste: Titel, Interpret und Metadaten-Badges (Key/BPM/
          Capo) bleiben beim Scrollen stehen - der scrollbare Bereich darunter
          beginnt direkt mit Notizen/Akkorden, ohne mitscrollenden Titel. */}
      <View style={[styles.headerBar, { backgroundColor }]}>
        <View style={styles.headerTitleWrap}>
          <Text style={[styles.headerTitleText, { color: titleColor }]} numberOfLines={1}>
            {song.title}
          </Text>
          {song.artist ? (
            <Text style={styles.headerArtistText} numberOfLines={1}>
              {song.artist}
            </Text>
          ) : null}
        </View>
        <View style={styles.headerBadgesRow}>
          <View style={[styles.headerBadge, !keyDisplay && styles.headerBadgeWarning]}>
            <Text style={styles.headerBadgeText}>{keyDisplay || 'No Key'}</Text>
          </View>
          <View style={[styles.headerBadge, styles.headerBadgeSpacing, !hasValidBpm && styles.headerBadgeWarning]}>
            <Text style={styles.headerBadgeText}>{hasValidBpm ? `⏱ ${bpm}` : `${bpm} BPM`}</Text>
          </View>
          {song.data?.capo ? (
            <View style={[styles.headerBadge, styles.headerBadgeSpacing]}>
              <Text style={styles.headerBadgeText}>Capo {song.data.capo}</Text>
            </View>
          ) : null}
        </View>
      </View>

      <ScrollView
        ref={scrollRef}
        style={[styles.scrollArea, { backgroundColor }]}
        scrollEnabled={active}
        onScroll={onScroll}
        onLayout={active ? handleScrollViewLayout : undefined}
        onContentSizeChange={active ? handleContentSizeChange : undefined}
        scrollEventThrottle={16}
      >
        <ChordProLines lines={renderedLines} fontSize={fontSize} />
        <View style={{ height: 300 }} />
      </ScrollView>
    </View>
  );
}

/**
 * Auftritt-Modus: kompletter Songtext ohne jegliches Chrome. Tap zum
 * Starten/Stoppen des Autoscrolls, horizontales Blättern zwischen den Songs
 * der Setliste über eine native, paginierende FlatList (pagingEnabled) -
 * das native Scroll-Handling übernimmt Snap-auf-Seite, Geschwindigkeits-
 * erkennung (Flick vs. Drag) und die Trennung von horizontaler und
 * vertikaler Geste (Songtext-ScrollView) automatisch. Das Autoscroll selbst
 * läuft mit einer einzigen, konstanten, linearen Geschwindigkeit von Y=0
 * bis zum Songende (scrollY >= maxScrollY) - kein Start-Delay, kein
 * Fast-Forward, keine Pausen-Marker, keine Geschwindigkeitszonen.
 */
export function ShowModeScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const { setlistId, startIndex = 0 } = route.params || {};
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();

  const [entries, setEntries] = useState([]);
  const [index, setIndex] = useState(startIndex);
  const [isScrolling, setIsScrolling] = useState(false);
  const [showExitConfirm, setShowExitConfirm] = useState(false);

  const scrollRef = useRef(null);
  const scrollY = useRef(0);
  const touchStartRef = useRef({ x: 0, y: 0, time: 0 });
  const showExitConfirmRef = useRef(false);
  const exitTimeoutRef = useRef(null);

  // Gemessene Inhalts-/Viewport-Höhe der aktuellen Seite (für "Song passt
  // komplett auf den Bildschirm" sowie den Stopp am Songende).
  const contentMetricsRef = useRef({ contentHeight: 0, viewportHeight: 0, fits: false });

  useEffect(() => {
    showExitConfirmRef.current = showExitConfirm;
  }, [showExitConfirm]);

  useEffect(() => {
    (async () => {
      const rows = await getSetlistSongs(setlistId);
      setEntries(rows);
    })();
  }, [setlistId]);

  function clearExitTimeout() {
    if (exitTimeoutRef.current) {
      clearTimeout(exitTimeoutRef.current);
      exitTimeoutRef.current = null;
    }
  }

  function openExitConfirm() {
    setShowExitConfirm(true);
    clearExitTimeout();
    exitTimeoutRef.current = setTimeout(() => {
      setShowExitConfirm(false);
    }, EXIT_CONFIRM_TIMEOUT);
  }

  function closeExitConfirm() {
    clearExitTimeout();
    setShowExitConfirm(false);
  }

  function confirmExit() {
    clearExitTimeout();
    navigation.goBack();
  }

  // Verlassen des Show-Modus ausschließlich über die Zurück-Aktion: erster
  // Druck zeigt die halbtransparente Sicherheitsabfrage, zweiter Druck
  // (während die Abfrage schon offen ist) bestätigt das Verlassen direkt.
  useFocusEffect(
    useCallback(() => {
      const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
        if (showExitConfirmRef.current) {
          confirmExit();
        } else {
          openExitConfirm();
        }
        return true;
      });
      return () => {
        subscription.remove();
        clearExitTimeout();
      };
      // eslint-disable-next-line
    }, [])
  );

  function handleContentMetricsChange(metrics) {
    contentMetricsRef.current = metrics;
  }

  // Beim Songwechsel: Autoscroll stoppen, an den Anfang springen, Content-
  // Metriken der neuen Seite zurücksetzen.
  useEffect(() => {
    setIsScrolling(false);
    scrollY.current = 0;
    scrollRef.current?.scrollTo({ y: 0, animated: false });
    contentMetricsRef.current = { contentHeight: 0, viewportHeight: 0, fits: false };
  }, [index]);

  const currentSong = entries[index]?.song || null;
  const backgroundColor = THEME_BACKGROUND[getChordSettings().typography.theme] || THEME_BACKGROUND.light;

  useEffect(() => {
    if (!isScrolling || !currentSong) return undefined;

    // Songs, die komplett auf den Bildschirm passen, werden gar nicht erst
    // gescrollt - Song bleibt statisch stehen.
    if (contentMetricsRef.current.fits) {
      setIsScrolling(false);
      return undefined;
    }

    const baseSpeed = Number(currentSong.data?.scrollSpeed) > 0 ? Number(currentSong.data.scrollSpeed) : 1;

    const intervalId = setInterval(() => {
      const { contentHeight, viewportHeight } = contentMetricsRef.current;
      const maxScrollY = Math.max(0, contentHeight - viewportHeight);

      scrollY.current = Math.min(maxScrollY, scrollY.current + baseSpeed * SCROLL_STEP_FACTOR);
      scrollRef.current?.scrollTo({ y: scrollY.current, animated: false });

      if (scrollY.current >= maxScrollY) {
        clearInterval(intervalId);
        setIsScrolling(false);
      }
    }, SCROLL_TICK_MS);
    return () => clearInterval(intervalId);
  }, [isScrolling, currentSong]);

  function toggleScrolling() {
    setIsScrolling((v) => {
      const next = !v;
      if (next && contentMetricsRef.current.fits) return false; // Song passt komplett auf den Bildschirm - kein Autoscroll
      return next;
    });
  }

  /**
   * FlatList-Paging: `pagingEnabled` lässt das native Scroll-Handling (iOS/
   * Android) immer exakt auf die nächste/vorherige Seite einrasten - kein
   * eigener Drag-/Flick-Berechnungscode mehr nötig. `onMomentumScrollEnd`
   * feuert erst, wenn die Seite final eingerastet ist, und synchronisiert
   * dann genau einmal den Index (State bleibt immer zu genau einem Song
   * synchron). Das native Scroll-Handling trennt horizontales Blättern und
   * vertikales Songtext-Scrollen automatisch und ruckelfrei.
   */
  function handleMomentumScrollEnd(e) {
    const newIndex = Math.round(e.nativeEvent.contentOffset.x / screenWidth);
    if (newIndex !== index && newIndex >= 0 && newIndex < entries.length) {
      setIndex(newIndex);
    }
  }

  function handleTouchStart(e) {
    const touch = e.nativeEvent.touches[0];
    if (!touch) return;
    touchStartRef.current = { x: touch.pageX, y: touch.pageY, time: Date.now() };
  }

  function handleTouchEnd(e) {
    const touch = e.nativeEvent.changedTouches[0];
    if (!touch) return;
    const dx = touch.pageX - touchStartRef.current.x;
    const dy = touch.pageY - touchStartRef.current.y;
    const dt = Date.now() - touchStartRef.current.time;
    if (Math.abs(dx) < TAP_MOVE_THRESHOLD && Math.abs(dy) < TAP_MOVE_THRESHOLD && dt < TAP_TIME_THRESHOLD) {
      toggleScrolling();
    }
  }

  const exitConfirmOverlay = showExitConfirm ? (
    <TouchableOpacity style={styles.exitOverlay} activeOpacity={1} onPress={closeExitConfirm}>
      <TouchableOpacity activeOpacity={1} style={styles.exitCard} onPress={() => {}}>
        <Text style={styles.exitTitle}>Show-Modus verlassen?</Text>
        <View style={styles.exitActions}>
          <TouchableOpacity onPress={closeExitConfirm} style={styles.exitCancelBtn}>
            <Text style={styles.exitCancelText}>Abbrechen</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={confirmExit} style={styles.exitConfirmBtn}>
            <Text style={styles.exitConfirmText}>Ja, beenden</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    </TouchableOpacity>
  ) : null;

  // Statusleiste im Show-Modus immer erzwingen (helle Ziffern/Symbole auf
  // dunklem Grund) - unabhängig davon, was andere Screens/App.js gerade
  // gesetzt haben. Mehrere gemountete <StatusBar>-Instanzen werden von RN
  // gemerged, die zuletzt gemountete (hier: dieser Screen) gewinnt, solange
  // er aktiv ist.
  const statusBarOverride = <StatusBar barStyle="light-content" backgroundColor={STATUS_BAR_BACKGROUND} translucent={false} />;
  // Fester dunkler Streifen exakt in Höhe des Safe-Area-Insets oben, statt
  // der Song-Theme-Farbe (die im hellen Theme sonst weiß/hell wäre und die
  // Statusleisten-Symbole unlesbar machen würde).
  const statusBarSpacer = <View style={{ height: insets.top, backgroundColor: STATUS_BAR_BACKGROUND }} />;

  if (!currentSong) {
    return (
      <View style={[styles.container, { backgroundColor }]}>
        {statusBarOverride}
        {statusBarSpacer}
        {exitConfirmOverlay}
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor }]}>
      {statusBarOverride}
      {statusBarSpacer}
      <View style={styles.carousel} onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
        <FlatList
          data={entries}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          initialScrollIndex={index}
          getItemLayout={(data, i) => ({ length: screenWidth, offset: screenWidth * i, index: i })}
          onMomentumScrollEnd={handleMomentumScrollEnd}
          keyExtractor={(item) => String(item.setlistSongId)}
          windowSize={3}
          maxToRenderPerBatch={3}
          removeClippedSubviews
          renderItem={({ item, index: itemIndex }) => {
            const isActive = itemIndex === index;
            return (
              <View style={{ width: screenWidth, height: '100%' }}>
                <SongPage
                  song={item.song}
                  active={isActive}
                  scrollRef={isActive ? scrollRef : undefined}
                  onScroll={isActive ? (e) => { scrollY.current = e.nativeEvent.contentOffset.y; } : undefined}
                  onContentMetricsChange={handleContentMetricsChange}
                />
              </View>
            );
          }}
        />
      </View>

      {exitConfirmOverlay}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F4F4F4' },
  scrollArea: { flex: 1, padding: 20 },
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(136,136,136,0.25)',
  },
  headerTitleWrap: { flex: 1, marginRight: 10 },
  headerTitleText: { fontSize: 20, fontWeight: 'bold' },
  headerArtistText: { fontSize: 13, color: '#9CA3AF', marginTop: 2 },
  headerBadgesRow: { flexDirection: 'row', alignItems: 'center' },
  headerBadge: {
    backgroundColor: 'rgba(34,34,34,0.85)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
  },
  headerBadgeSpacing: { marginLeft: 8 },
  headerBadgeText: { color: '#FFF', fontSize: 15, fontWeight: 'bold' },
  // Warnhinweis: BPM-/Key-Badge zeigt einen Fallback-Wert bzw. "No Key", weil der Tag im Song fehlt/ungültig ist.
  headerBadgeWarning: { backgroundColor: '#DC2626' },
  carousel: { flex: 1 },
  exitOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.28)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  exitCard: {
    minWidth: 260,
    backgroundColor: 'rgba(20,20,22,0.55)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    padding: 20,
  },
  exitTitle: { color: '#FFF', fontSize: 16, fontWeight: 'bold', textAlign: 'center', marginBottom: 16 },
  exitActions: { flexDirection: 'row', justifyContent: 'center' },
  exitCancelBtn: {
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.12)',
    marginRight: 10,
  },
  exitCancelText: { color: '#EEE', fontWeight: '600' },
  exitConfirmBtn: {
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 10,
    backgroundColor: 'rgba(255,107,107,0.75)',
  },
  exitConfirmText: { color: '#FFF', fontWeight: 'bold' },
});
