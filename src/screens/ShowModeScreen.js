import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  BackHandler,
  PanResponder,
  Animated,
  useWindowDimensions,
  StatusBar,
  Easing,
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
const DRAG_CAPTURE_THRESHOLD = 24;
const COMMIT_DISTANCE_RATIO = 0.25;
const COMMIT_VELOCITY_THRESHOLD = 0.4;
const RUBBER_BAND_FACTOR = 0.3;
const SLIDE_DURATION = 220;
const EXIT_CONFIRM_TIMEOUT = 2000;

// Auto-Scroll-Takt: alle SCROLL_TICK_MS wird um (Basisgeschwindigkeit *
// SCROLL_STEP_FACTOR) Pixel gescrollt - ergibt Basisgeschwindigkeit * 16
// Pixel/Sekunde. Wird sowohl vom Tick-Interval als auch von der
// Start-Delay-Berechnung (computeStartDelaySeconds) verwendet.
const SCROLL_TICK_MS = 50;
const SCROLL_STEP_FACTOR = 0.8;

const AUTO_START_DELAY_MAX_SECONDS = 30;
const CHORD_ONLY_LINE_WEIGHT = 2.0;
const NORMAL_LINE_WEIGHT = 1.0;
// Zusätzlicher Scroll-Puffer am Songende, damit die letzte Zeile nicht am
// unteren Bildschirmrand klebt (siehe computeFinalStopY).
const END_OF_SONG_EXTRA_LINES = 2;

/** Grobe Schätzung: Akkordzeile + Textzeile übereinander (Songbook-Darstellung). */
function estimateLineHeightPx(fontSize) {
  return fontSize * 2;
}

// Zeilen, die zwar Text enthalten, aber keine "echte" Gesangszeile sind -
// zählen für den Start-Delay als Notiz mit, beenden aber NICHT den
// Lead-In-Zähler (siehe computeStartDelaySeconds): $$-Anmerkungszeilen,
// '#'-Kommentarzeilen (nicht die {c:}/{comment:}-Direktive, die ohnehin
// als eigener type 'comment' übersprungen wird) sowie reine Taktzähler
// (z.B. "7" oder "1 2 3 4").
const NUMERIC_ONLY_LINE_REGEX = /^[0-9\s.-]+$/;

function isNonVocalLeadLine(trimmedLyric) {
  if (trimmedLyric === '') return true;
  if (trimmedLyric.startsWith('$$')) return true;
  if (trimmedLyric.startsWith('#')) return true;
  if (NUMERIC_ONLY_LINE_REGEX.test(trimmedLyric)) return true;
  return false;
}

/**
 * Berechnet die "musikalische Vorlaufzeit" (Start-Delay) bis zum Beginn des
 * Auto-Scrollings: zählt die führenden Zeilen des Songs (vor der ersten
 * echten Gesangszeile mit Text) gewichtet - reine Akkordzeilen/Intro-Zeilen
 * doppelt (CHORD_ONLY_LINE_WEIGHT), Notizen/Taktzähler/normale Zeilen
 * einfach - und rechnet die gewichtete Summe über die geschätzte
 * Zeilenhöhe/Scrollgeschwindigkeit in Sekunden um (auf
 * AUTO_START_DELAY_MAX_SECONDS begrenzt). $$-Notizzeilen, '#'-Kommentare und
 * reine Taktzähler-Zeilen (z.B. "7") gelten NICHT als Gesangstext und
 * stoppen den Zähler nicht - erst die erste Zeile mit echtem Liedtext (z.B.
 * "[Bm]On a dark desert highway...") tut das. Ein {pause:}/{p:} direkt am
 * Songanfang hat Vorrang: liefert dann 0 (kein zusätzliches Auto-Delay), da
 * der normale Pausen-Mechanismus (Marker bei y~0) die Wartezeit übernimmt.
 */
function computeStartDelaySeconds(renderedLines, fontSize, pxPerSecond) {
  if (!renderedLines || renderedLines.length === 0 || pxPerSecond <= 0) return 0;
  if (renderedLines[0]?.type === 'pause') return 0;

  let weighted = 0;
  for (const item of renderedLines) {
    if (item.type !== 'line') continue;
    // `chords` (Array) markiert eine reine Akkordzeile ohne Text (Intro/
    // Solo) - `chordLine` allein reicht NICHT, das ist auch bei normalen
    // Zeilen mit Inline-Akkorden über echtem Liedtext gesetzt.
    const isPureChordLine = Array.isArray(item.chords);
    const trimmedLyric = (item.lyricLine || '').trim();
    const isRealVocalLine = !isPureChordLine && !isNonVocalLeadLine(trimmedLyric);
    if (isRealVocalLine) break; // z.B. "[Bm]On a dark desert highway..."
    weighted += isPureChordLine ? CHORD_ONLY_LINE_WEIGHT : NORMAL_LINE_WEIGHT;
  }
  if (weighted <= 0) return 0;

  const seconds = weighted * (estimateLineHeightPx(fontSize) / pxPerSecond);
  return Math.min(AUTO_START_DELAY_MAX_SECONDS, seconds);
}

/**
 * Ein einzelnes "Blatt" (Song-Seite) im Show-Modus-Karussell. Wird für
 * vorherigen/aktuellen/nächsten Song gerendert. Nur die aktive (aktuelle)
 * Seite ist scrollbar/interaktiv - die Nachbarn sind reine Drag-Vorschau.
 * Als eigene Komponente definiert (nicht inline), damit React sie beim
 * Neu-Rendern nicht jedes Mal neu montiert.
 */
function SongPage({
  song,
  active,
  scrollRef,
  onScroll,
  onScrollBeginDrag,
  onPauseMarkersChange,
  onSpeedZonesChange,
  onContentMetricsChange,
  onLastLineMetricsChange,
  onStartDelayComputed,
}) {
  // Sammelt die vertikalen Positionen der {pause:}/{p:}-Marker sowie der
  // speedZoneStart/speedZoneEnd-Marker ({sos:}/{eos} und automatisch
  // erkannte Akkord-Solo-Blöcke) dieses Songs (nur relevant, wenn `active`)
  // - über Zeilen-Index statt Neuaufbau bei jedem Render, damit unveränderte
  // Marker (die kein erneutes onLayout auslösen) nicht aus der Liste fallen.
  const pauseMarkersMapRef = useRef(new Map());
  const speedZonesMapRef = useRef(new Map());
  const contentMetricsRef = useRef({ contentHeight: 0, viewportHeight: 0 });
  const startDelayReportedKeyRef = useRef(null);
  const songKeyRef = useRef(null);
  const songKey = song?.id ?? song?.uuid ?? null;
  if (songKeyRef.current !== songKey) {
    songKeyRef.current = songKey;
    pauseMarkersMapRef.current = new Map();
    speedZonesMapRef.current = new Map();
    contentMetricsRef.current = { contentHeight: 0, viewportHeight: 0 };
    if (active && onPauseMarkersChange) onPauseMarkersChange([]);
    if (active && onSpeedZonesChange) onSpeedZonesChange([]);
  }

  function handlePauseLayout(idx, y, seconds) {
    pauseMarkersMapRef.current.set(idx, { index: idx, y, seconds });
    if (active && onPauseMarkersChange) {
      onPauseMarkersChange(Array.from(pauseMarkersMapRef.current.values()).sort((a, b) => a.y - b.y));
    }
  }

  function handleSpeedZoneLayout(idx, y, type, factor) {
    speedZonesMapRef.current.set(idx, { index: idx, y, type, factor });
    if (active && onSpeedZonesChange) {
      onSpeedZonesChange(Array.from(speedZonesMapRef.current.values()).sort((a, b) => a.y - b.y));
    }
  }

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

  function handleLastLineLayout(y, height) {
    if (active && onLastLineMetricsChange) onLastLineMetricsChange({ y, height });
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
  const bpm = song.data?.bpm || '-';

  // Letzte "echte" Text-/Akkordzeile (leere Zeilen am Songende ignoriert) -
  // für den intelligenten Auto-Scroll-Stopp am Songende.
  let lastLineIndex = -1;
  for (let i = renderedLines.length - 1; i >= 0; i--) {
    const item = renderedLines[i];
    if (item.type === 'line') {
      const hasContent =
        (item.lyricLine || '').trim() !== '' || Array.isArray(item.chords) || (item.chordLine || '').trim() !== '';
      if (hasContent) {
        lastLineIndex = i;
        break;
      }
    }
  }

  // Start-Delay einmalig pro Song berechnen und an den Show-Modus-Screen
  // melden (Ref-Guard statt useEffect, konsistent mit dem songKey-Reset
  // oben - läuft synchron während des Renders, da renderedLines/fontSize
  // hier ohnehin schon vorliegen).
  if (active && onStartDelayComputed && startDelayReportedKeyRef.current !== songKey) {
    startDelayReportedKeyRef.current = songKey;
    const songSpeed = Number(song.data?.scrollSpeed) > 0 ? Number(song.data.scrollSpeed) : 1;
    const pxPerSecond = songSpeed * SCROLL_STEP_FACTOR * (1000 / SCROLL_TICK_MS);
    onStartDelayComputed(computeStartDelaySeconds(renderedLines, fontSize, pxPerSecond));
  }

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
          {keyDisplay ? (
            <View style={styles.headerBadge}>
              <Text style={styles.headerBadgeText}>{keyDisplay}</Text>
            </View>
          ) : null}
          <View style={[styles.headerBadge, styles.headerBadgeSpacing]}>
            <Text style={styles.headerBadgeText}>⏱ {bpm}</Text>
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
        onScrollBeginDrag={active ? onScrollBeginDrag : undefined}
        onLayout={active ? handleScrollViewLayout : undefined}
        onContentSizeChange={active ? handleContentSizeChange : undefined}
        scrollEventThrottle={16}
      >
        <ChordProLines
          lines={renderedLines}
          fontSize={fontSize}
          onPauseLayout={active ? handlePauseLayout : undefined}
          onSpeedZoneLayout={active ? handleSpeedZoneLayout : undefined}
          lastLineIndex={active ? lastLineIndex : undefined}
          onLastLineLayout={active ? handleLastLineLayout : undefined}
        />
        <View style={{ height: 300 }} />
      </ScrollView>
    </View>
  );
}

/**
 * Auftritt-Modus: kompletter Songtext ohne jegliches Chrome. Tap zum
 * Starten/Stoppen des Autoscrolls, fingergeführtes horizontales Ziehen
 * (Live-Drag mit Vorschau auf Nachbar-Songs, Snap/Spring beim Loslassen)
 * zum Song-Wechsel. Bewusst mit PanResponder + Animated (Kern-React-Native)
 * statt react-native-gesture-handler/Reanimated umgesetzt - letztere
 * brauchten Worklets, die in Expo Go zu Laufzeitfehlern führten (siehe
 * frühere Session).
 */
export function ShowModeScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const { setlistId, startIndex = 0 } = route.params || {};
  const insets = useSafeAreaInsets();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();

  const [entries, setEntries] = useState([]);
  const [index, setIndex] = useState(startIndex);
  const [isScrolling, setIsScrolling] = useState(false);
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  // null = kein Countdown aktiv, sonst { type: 'start'|'pause', remaining }
  // - vereinheitlichte Anzeige für Start-Delay ("⏳ Start in Xs") und
  // {pause:}/{p:}-Marker ("⏸ Pause: Xs"), siehe startCountdown().
  const [countdown, setCountdown] = useState(null);

  const scrollRef = useRef(null);
  const scrollY = useRef(0);
  const touchStartRef = useRef({ x: 0, y: 0, time: 0 });
  const entriesRef = useRef([]);
  const indexRef = useRef(startIndex);
  const showExitConfirmRef = useRef(false);
  const exitTimeoutRef = useRef(null);
  const isAnimatingRef = useRef(false);
  const dragX = useRef(new Animated.Value(0)).current;
  const countdownBarWidth = useRef(new Animated.Value(0)).current;

  // {pause:}/{p:}-Marker der aktuellen Seite (Auto-Scroll-Stopps).
  const activePauseMarkersRef = useRef([]);
  const triggeredPauseIndicesRef = useRef(new Set());
  // Gate für den Auto-Scroll-Tick: pausiert sowohl bei aktivem {pause:}-
  // Countdown als auch beim Start-Delay am Songbeginn (beide teilen sich
  // dieselbe Countdown-Anzeige/-Logik, siehe startCountdown()).
  const isPausedForCountdownRef = useRef(false);
  const countdownIntervalRef = useRef(null);
  const countdownMetaRef = useRef({ type: null, totalMs: 0, startTime: 0 });

  // speedZoneStart/speedZoneEnd-Marker der aktuellen Seite ({sos:}/{eos}
  // sowie automatisch erkannte Akkord-Solo-Blöcke), sortiert nach y.
  const activeSpeedZonesRef = useRef([]);

  // Gemessene Inhalts-/Viewport-Höhe der aktuellen Seite (für "Song passt
  // komplett auf den Bildschirm" sowie den intelligenten Songende-Stopp).
  const contentMetricsRef = useRef({ contentHeight: 0, viewportHeight: 0, fits: false });
  const lastLineMetricsRef = useRef(null); // {y, height} der letzten echten Zeile, oder null

  // Berechnetes Start-Delay (Sekunden) der aktuellen Seite (siehe
  // computeStartDelaySeconds) sowie ob es für diesen Song schon "verbraucht"
  // wurde (verhindert Mehrfach-Trigger bei wiederholtem Stop/Start an
  // Position 0).
  const startDelaySecondsRef = useRef(0);
  const startDelayAppliedRef = useRef(false);

  useEffect(() => {
    entriesRef.current = entries;
  }, [entries]);
  useEffect(() => {
    indexRef.current = index;
  }, [index]);
  useEffect(() => {
    showExitConfirmRef.current = showExitConfirm;
  }, [showExitConfirm]);

  // Aufräumen beim Verlassen des Screens.
  useEffect(() => {
    return () => {
      if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
    };
  }, []);

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

  /**
   * Bricht einen laufenden Countdown (Start-Delay ODER {pause:}-Marker)
   * sofort ab: Balken blendet aus, Auto-Scroll läuft im nächsten Tick direkt
   * ab der aktuellen scrollY-Position weiter - egal ob durch Tippen auf den
   * Balken (Skip) oder durch manuelles Scrollen (onScrollBeginDrag).
   */
  function clearCountdown() {
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }
    countdownBarWidth.stopAnimation();
    countdownBarWidth.setValue(0);
    isPausedForCountdownRef.current = false;
    setCountdown(null);
  }

  /**
   * Startet den vereinheitlichten Countdown (type: 'start' für das
   * Start-Delay am Songbeginn, 'pause' für einen erreichten {pause:}/{p:}-
   * Marker) - blendet den Fortschrittsbalken ein (synchron über die volle
   * Dauer animiert) und pausiert währenddessen den Auto-Scroll-Tick.
   */
  function startCountdown(type, seconds) {
    isPausedForCountdownRef.current = true;
    const totalMs = Math.max(100, seconds * 1000);
    countdownMetaRef.current = { type, totalMs, startTime: Date.now() };
    setCountdown({ type, remaining: Math.ceil(seconds) });

    countdownBarWidth.stopAnimation();
    countdownBarWidth.setValue(0);
    Animated.timing(countdownBarWidth, {
      toValue: 1,
      duration: totalMs,
      easing: Easing.linear,
      useNativeDriver: false,
    }).start();

    clearInterval(countdownIntervalRef.current);
    countdownIntervalRef.current = setInterval(() => {
      const { totalMs: total, startTime } = countdownMetaRef.current;
      const elapsed = Date.now() - startTime;
      if (elapsed >= total) {
        clearInterval(countdownIntervalRef.current);
        countdownIntervalRef.current = null;
        isPausedForCountdownRef.current = false;
        setCountdown(null);
      } else {
        setCountdown({ type, remaining: Math.max(0, Math.ceil((total - elapsed) / 1000)) });
      }
    }, 200);
  }

  function handleActivePauseMarkersChange(markers) {
    activePauseMarkersRef.current = markers;
  }

  function handleActiveSpeedZonesChange(markers) {
    activeSpeedZonesRef.current = markers;
  }

  function handleContentMetricsChange(metrics) {
    contentMetricsRef.current = metrics;
  }

  function handleLastLineMetricsChange(metrics) {
    lastLineMetricsRef.current = metrics;
  }

  function handleStartDelayComputed(seconds) {
    startDelaySecondsRef.current = seconds;
  }

  /** onScrollBeginDrag: Nutzer greift manuell ein - Countdown sofort abbrechen. */
  function handleScrollBeginDrag() {
    clearCountdown();
  }

  /**
   * Ermittelt den aktuell geltenden Geschwindigkeitsfaktor anhand der
   * speedZoneStart/speedZoneEnd-Marker, deren y-Position bereits die obere
   * Lesezone (oberes Drittel des Viewports, `boundaryY`) erreicht hat.
   * Marker sind nach y sortiert - der zuletzt passierte Marker bestimmt den
   * Faktor (1.0 = Basisgeschwindigkeit, sobald ein speedZoneEnd passiert
   * wurde oder gar kein Marker erreicht ist).
   */
  function computeSpeedFactor(markers, boundaryY) {
    let factor = 1;
    for (const m of markers) {
      if (m.y > boundaryY) break;
      factor = m.type === 'speedZoneStart' ? m.factor : 1;
    }
    return factor;
  }

  // Beim Songwechsel: Autoscroll stoppen, an den Anfang springen, alle
  // Pause-, Speed-Zonen-, Content-Metriken- und Start-Delay-Zustände der
  // neuen Seite zurücksetzen.
  useEffect(() => {
    setIsScrolling(false);
    scrollY.current = 0;
    scrollRef.current?.scrollTo({ y: 0, animated: false });
    activePauseMarkersRef.current = [];
    triggeredPauseIndicesRef.current = new Set();
    activeSpeedZonesRef.current = [];
    contentMetricsRef.current = { contentHeight: 0, viewportHeight: 0, fits: false };
    lastLineMetricsRef.current = null;
    startDelaySecondsRef.current = 0;
    startDelayAppliedRef.current = false;
    clearCountdown();
    // eslint-disable-next-line
  }, [index]);

  const currentSong = entries[index]?.song || null;
  const prevSong = entries[index - 1]?.song || null;
  const nextSong = entries[index + 1]?.song || null;
  const backgroundColor = THEME_BACKGROUND[getChordSettings().typography.theme] || THEME_BACKGROUND.light;

  useEffect(() => {
    if (!isScrolling || !currentSong) return undefined;

    // Songs, die komplett auf den Bildschirm passen, werden gar nicht erst
    // gescrollt (kein Start-Delay, kein Countdown-Balken) - Song bleibt
    // statisch stehen.
    if (contentMetricsRef.current.fits) {
      setIsScrolling(false);
      return undefined;
    }

    const baseSpeed = Number(currentSong.data?.scrollSpeed) > 0 ? Number(currentSong.data.scrollSpeed) : 1;

    // Intelligentes Start-Delay: nur auslösen, wenn der Song noch ganz am
    // Anfang steht (Position 0, kein manuelles Vor-Scrollen) und dieses
    // Delay für den aktuellen Song noch nicht verbraucht wurde. Ein
    // {pause:}/{p:} ganz oben im Song führt bereits zu Delay=0 (siehe
    // computeStartDelaySeconds) - der normale Pausen-Marker-Mechanismus
    // unten übernimmt die Wartezeit dann stattdessen.
    if (scrollY.current <= 0 && !startDelayAppliedRef.current) {
      startDelayAppliedRef.current = true;
      if (startDelaySecondsRef.current > 0) {
        startCountdown('start', startDelaySecondsRef.current);
      }
    }

    const intervalId = setInterval(() => {
      // Während eines Start-Delay- oder {pause:}/{p:}-Countdowns steht der
      // Bildlauf exakt still, der Interval-Takt läuft aber weiter (einfacher
      // als ihn ab-/wieder aufzubauen) - er überspringt hier nur das Scrollen.
      if (isPausedForCountdownRef.current) return;

      // Lesezone = oberes Drittel des Viewports; sobald ihr y-Wert einen
      // speedZoneStart/speedZoneEnd-Marker erreicht, ändert sich der
      // Geschwindigkeitsfaktor (Solo-/Instrumental-Passagen langsamer).
      const boundaryY = scrollY.current + screenHeight / 3;
      const speedFactor = computeSpeedFactor(activeSpeedZonesRef.current, boundaryY);

      const prevY = scrollY.current;
      scrollY.current += baseSpeed * speedFactor * SCROLL_STEP_FACTOR;

      // Intelligenter Stopp am Songende: sobald die letzte echte Zeile von
      // unten in den sichtbaren Bereich gescrollt ist plus 2 zusätzliche
      // Zeilenhöhen (finalStopY), wird endgültig gestoppt - erneutes
      // Starten an dieser Position löst wegen des Vergleichs unten sofort
      // wieder denselben Stopp aus, kein Extra-Flag nötig.
      const lastLine = lastLineMetricsRef.current;
      if (lastLine) {
        const viewportHeight = contentMetricsRef.current.viewportHeight || screenHeight;
        const finalStopY = lastLine.y - viewportHeight + lastLine.height * END_OF_SONG_EXTRA_LINES;
        if (scrollY.current >= finalStopY) {
          scrollY.current = finalStopY;
          scrollRef.current?.scrollTo({ y: finalStopY, animated: false });
          clearInterval(intervalId);
          setIsScrolling(false);
          return;
        }
      }

      scrollRef.current?.scrollTo({ y: scrollY.current, animated: false });

      const marker = activePauseMarkersRef.current.find(
        (m) => !triggeredPauseIndicesRef.current.has(m.index) && m.y > prevY && m.y <= scrollY.current
      );
      if (marker) {
        triggeredPauseIndicesRef.current.add(marker.index);
        startCountdown('pause', marker.seconds);
      }
    }, SCROLL_TICK_MS);
    return () => clearInterval(intervalId);
    // eslint-disable-next-line
  }, [isScrolling, currentSong, screenHeight]);

  function toggleScrolling() {
    setIsScrolling((v) => {
      const next = !v;
      if (next && contentMetricsRef.current.fits) return false; // Song passt komplett auf den Bildschirm - kein Autoscroll
      if (!next) clearCountdown(); // manuelles Stoppen bricht auch einen laufenden Countdown ab
      return next;
    });
  }

  /**
   * Schließt einen Song-Wechsel ab: Blatt gleitet die letzten paar Pixel
   * bis 100% raus, dann wird der Index gewechselt und dragX synchron auf 0
   * zurückgesetzt - da die neue "aktuelle" Seite (vorher die Nachbar-Seite)
   * an exakt derselben Bildschirmposition steht, gibt es keinen sichtbaren
   * Sprung.
   */
  function commitSwipe(toNext) {
    if (isAnimatingRef.current) return;
    isAnimatingRef.current = true;
    const target = toNext ? -screenWidth : screenWidth;
    Animated.timing(dragX, {
      toValue: target,
      duration: SLIDE_DURATION,
      useNativeDriver: true,
    }).start(() => {
      setIndex((i) => (toNext ? i + 1 : i - 1));
      dragX.setValue(0);
      isAnimatingRef.current = false;
    });
  }

  function snapBack() {
    Animated.spring(dragX, {
      toValue: 0,
      useNativeDriver: true,
      bounciness: 6,
      speed: 16,
    }).start();
  }

  const panResponder = useRef(
    PanResponder.create({
      // Nur bei eindeutig horizontaler Bewegung übernehmen, damit
      // vertikales Scrollen der ScrollView nicht gestört wird.
      onMoveShouldSetPanResponderCapture: (evt, gestureState) => {
        const { dx, dy } = gestureState;
        return Math.abs(dx) > DRAG_CAPTURE_THRESHOLD && Math.abs(dx) > Math.abs(dy) * 1.5;
      },
      onPanResponderMove: (evt, gestureState) => {
        if (isAnimatingRef.current) return;
        let dx = gestureState.dx;
        const atFirst = indexRef.current === 0;
        const atLast = indexRef.current >= entriesRef.current.length - 1;
        // Rubber-Banding an den Rändern der Setliste: gedämpfter Widerstand
        // statt das Blatt frei rausziehen zu lassen, wenn es keinen
        // Nachbar-Song in die gewünschte Richtung gibt.
        if (dx > 0 && atFirst) dx *= RUBBER_BAND_FACTOR;
        if (dx < 0 && atLast) dx *= RUBBER_BAND_FACTOR;
        dragX.setValue(dx);
      },
      onPanResponderRelease: (evt, gestureState) => {
        if (isAnimatingRef.current) return;
        const { dx, vx } = gestureState;
        const atFirst = indexRef.current === 0;
        const atLast = indexRef.current >= entriesRef.current.length - 1;
        const threshold = screenWidth * COMMIT_DISTANCE_RATIO;

        const wantsNext = dx < 0 && (Math.abs(dx) > threshold || vx < -COMMIT_VELOCITY_THRESHOLD);
        const wantsPrev = dx > 0 && (Math.abs(dx) > threshold || vx > COMMIT_VELOCITY_THRESHOLD);

        if (wantsNext && !atLast) {
          commitSwipe(true);
        } else if (wantsPrev && !atFirst) {
          commitSwipe(false);
        } else {
          snapBack();
        }
      },
      onPanResponderTerminate: () => {
        if (!isAnimatingRef.current) snapBack();
      },
    })
  ).current;

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

  // Vereinheitlichte, dezente Countdown-/Fortschrittsleiste direkt unter der
  // Statusleiste - Fall A (Start-Delay): "⏳ Start in Xs", Fall B
  // ({pause:}/{p:}-Marker): "⏸ Pause: Xs". Tippen überspringt sofort.
  const countdownBar = countdown ? (
    <TouchableOpacity style={styles.countdownBar} activeOpacity={0.75} onPress={clearCountdown}>
      <Animated.View
        style={[
          styles.countdownBarFill,
          { width: countdownBarWidth.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) },
        ]}
      />
      <Text style={styles.countdownBarText}>
        {countdown.type === 'start' ? `⏳ Start in ${countdown.remaining}s` : `⏸ Pause: ${countdown.remaining}s`}
      </Text>
    </TouchableOpacity>
  ) : null;

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
      {countdownBar}
      <View
        style={styles.carousel}
        {...panResponder.panHandlers}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        <Animated.View style={[styles.page, { left: -screenWidth, width: screenWidth, transform: [{ translateX: dragX }] }]}>
          <SongPage song={prevSong} active={false} />
        </Animated.View>
        <Animated.View style={[styles.page, { left: 0, width: screenWidth, transform: [{ translateX: dragX }] }]}>
          <SongPage
            song={currentSong}
            active
            scrollRef={scrollRef}
            onScroll={(e) => { scrollY.current = e.nativeEvent.contentOffset.y; }}
            onScrollBeginDrag={handleScrollBeginDrag}
            onPauseMarkersChange={handleActivePauseMarkersChange}
            onSpeedZonesChange={handleActiveSpeedZonesChange}
            onContentMetricsChange={handleContentMetricsChange}
            onLastLineMetricsChange={handleLastLineMetricsChange}
            onStartDelayComputed={handleStartDelayComputed}
          />
        </Animated.View>
        <Animated.View style={[styles.page, { left: screenWidth, width: screenWidth, transform: [{ translateX: dragX }] }]}>
          <SongPage song={nextSong} active={false} />
        </Animated.View>
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
  countdownBar: {
    height: 30,
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.35)',
    overflow: 'hidden',
  },
  countdownBarFill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: 'rgba(255,255,255,0.22)',
  },
  countdownBarText: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },
  carousel: { flex: 1, position: 'relative', overflow: 'hidden' },
  page: { position: 'absolute', top: 0, bottom: 0 },
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
