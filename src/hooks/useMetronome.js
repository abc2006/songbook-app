import { useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import { createAudioPlayer, setAudioModeAsync } from 'expo-audio';

const isWeb = Platform.OS === 'web';

// Kurzer Metronom-Click als lokale WAV-Datei für native Plattformen
const METRONOME_CLICK_SOURCE = require('../../assets/click.wav');

// Anzahl paralleler Player, die im Kreis wiederverwendet werden. So muss
// pro Klick nichts Neues angelegt werden (das war die Ursache für das
// schwankende Timing), und trotzdem hat jeder einzelne Player genug Zeit
// zwischen zwei Einsätzen, um sicher zurückgesetzt zu sein.
const AUDIO_PLAYER_POOL_SIZE = 4;

function playWebMetronomeClick(ctx) {
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
}

/**
 * Kapselt den kompletten Metronom-Zustand: BPM, Start/Pause, Mute
 * und die Wiedergabe des Klicks (Web Audio API im Browser,
 * expo-audio auf nativen Plattformen).
 */
export function useMetronome(selectedSong) {
  const [bpm, setBpm] = useState(120);
  const [isMetronomeActive, setIsMetronomeActive] = useState(false);
  const [metronomePulse, setMetronomePulse] = useState(false);
  const [isMetronomeMuted, setIsMetronomeMuted] = useState(false);

  const metronomeTimeoutRef = useRef(null);
  const metronomePulseOnRef = useRef(null);
  const metronomePulseOffRef = useRef(null);
  const webAudioCtx = useRef(null);
  const audioPlayerPoolRef = useRef([]);
  const audioPlayerIndexRef = useRef(0);
  const [resyncToken, setResyncToken] = useState(0);

  useEffect(() => {
    if (isWeb) return;
    setAudioModeAsync({ playsInSilentMode: true });

    // Player nur anlegen (lädt/bereitet vor) - das allein spielt nichts ab
    // und holt sich keinen Audio-Fokus, ist also komplett lautlos. Es wird
    // absichtlich NICHT mehr automatisch "vorgewärmt" (play() aufgerufen),
    // denn play() fordert intern Audio-Fokus an, selbst wenn stummgeschaltet
    // - das kann sich wie ein ungewolltes Anspringen des Metronoms beim
    // App-Start anfühlen (z.B. Ducking anderer Musik). Der Klick soll
    // wirklich erst beim Drücken von "Start" passieren.
    const pool = [];
    for (let i = 0; i < AUDIO_PLAYER_POOL_SIZE; i++) {
      pool.push(createAudioPlayer(METRONOME_CLICK_SOURCE));
    }
    audioPlayerPoolRef.current = pool;

    return () => {
      pool.forEach((player) => {
        try {
          player.release();
        } catch (e) {
          // bereits freigegeben
        }
      });
      audioPlayerPoolRef.current = [];
    };
  }, []);

  // Solange die App im Hintergrund ist, drosselt/pausiert das Betriebssystem
  // JS-Timer. Ohne Gegenmaßnahme versucht unser Taktgeber beim Zurückkommen,
  // alle "verpassten" Ticks in Windeseile nachzuholen (Timeout-Delay wird ja
  // nur bis 0 gedeckelt) - das klingt wie ein sich überschlagender Rasseltakt.
  // Deshalb bei Rückkehr in den Vordergrund den Taktgeber einfach neu starten
  // (nextTickAt wird dabei auf "jetzt" zurückgesetzt statt aufzuholen).
  useEffect(() => {
    if (isWeb) return;
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        setResyncToken((t) => t + 1);
      }
    });
    return () => subscription.remove();
  }, []);

  function stopMetronomeTimers() {
    clearTimeout(metronomeTimeoutRef.current);
    clearTimeout(metronomePulseOnRef.current);
    clearTimeout(metronomePulseOffRef.current);
    metronomeTimeoutRef.current = null;
    metronomePulseOnRef.current = null;
    metronomePulseOffRef.current = null;
  }

  function playMetronomeClick() {
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
        void ctx.resume().then(() => playWebMetronomeClick(ctx)).catch(() => {});
        return;
      }
      playWebMetronomeClick(ctx);
    } else {
      const pool = audioPlayerPoolRef.current;
      if (pool.length === 0) return;
      const player = pool[audioPlayerIndexRef.current];
      audioPlayerIndexRef.current = (audioPlayerIndexRef.current + 1) % pool.length;
      try {
        // Player ist bereits auf Position 0 (siehe Reset weiter unten) -
        // hier nur noch der reine play()-Aufruf, ohne zusätzlichen
        // asynchronen seekTo()-Umweg im zeitkritischen Pfad.
        player.play();
        // Der Klick ist ca. 50ms lang und läuft von selbst zu Ende;
        // danach nur zurückspulen (kein pause(), siehe Kommentar oben).
        setTimeout(() => {
          try {
            player.seekTo(0);
          } catch (e) {
            // ignorieren
          }
        }, 150);
      } catch (e) {
        // Wiedergabe fehlgeschlagen, Metronom-Licht blinkt trotzdem weiter
      }
    }
  }

  // Metronom stoppen und BPM aus dem Song übernehmen, wenn der Song wechselt
  useEffect(() => {
    setIsMetronomeActive(false);
    setMetronomePulse(false);
    stopMetronomeTimers();
    // eslint-disable-next-line
  }, [selectedSong]);

  // Metronom: Ton und Licht gleichzeitig beim Beat-Start, Licht geht danach aus.
  // Statt setInterval (das über die Zeit driftet) wird die nächste Ausführung
  // jedes Mal relativ zum ursprünglich geplanten Zeitpunkt neu berechnet,
  // damit sich Verzögerungen nicht aufsummieren.
  useEffect(() => {
    if (!isMetronomeActive) {
      setMetronomePulse(false);
      stopMetronomeTimers();
      return;
    }

    const beatMs = (60 / bpm) * 1000;
    const pulseMs = 100;
    // Kleiner Versatz, damit das Licht dem hörbaren Klick folgt statt
    // gleichzeitig zu feuern - gleicht die spürbare Start-Latenz der
    // nativen Audiowiedergabe aus.
    const lightDelayMs = 200;
    let nextTickAt = performance.now();

    const runTick = () => {
      playMetronomeClick();

      clearTimeout(metronomePulseOnRef.current);
      clearTimeout(metronomePulseOffRef.current);
      metronomePulseOnRef.current = setTimeout(() => {
        setMetronomePulse(true);
        metronomePulseOffRef.current = setTimeout(() => {
          setMetronomePulse(false);
        }, pulseMs);
      }, lightDelayMs);

      nextTickAt += beatMs;
      const now = performance.now();
      // Falls wir (z.B. durch App-Backgrounding) mehr als einen Takt
      // hinterherhängen, nicht nachholen, sondern beim nächsten sinnvollen
      // Takt weitermachen - sonst feuert das hier eine Salve verpasster
      // Klicks in Windeseile ab.
      if (nextTickAt < now) {
        nextTickAt = now + beatMs;
      }
      const delay = Math.max(0, nextTickAt - now);
      metronomeTimeoutRef.current = setTimeout(runTick, delay);
    };

    runTick();

    return () => {
      stopMetronomeTimers();
      setMetronomePulse(false);
    };
    // eslint-disable-next-line
  }, [isMetronomeActive, bpm, selectedSong, isMetronomeMuted, resyncToken]);

  function stopMetronome() {
    stopMetronomeTimers();
    setIsMetronomeActive(false);
  }

  return {
    bpm,
    setBpm,
    isMetronomeActive,
    setIsMetronomeActive,
    metronomePulse,
    isMetronomeMuted,
    setIsMetronomeMuted,
    stopMetronome,
  };
}
