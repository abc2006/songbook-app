import { useEffect, useRef, useState } from 'react';
import { useAudioPlayer, useAudioPlayerStatus, setAudioModeAsync } from 'expo-audio';
import * as FileSystem from 'expo-file-system/legacy';
import { getSupabaseClient } from '../services/supabase';

const STORAGE_BUCKET = 'songbook-app';
const SIGNED_URL_EXPIRY_SECONDS = 60;
const AUDIO_DIR = `${FileSystem.documentDirectory}audio/`;

async function ensureAudioDir() {
  const info = await FileSystem.getInfoAsync(AUDIO_DIR);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(AUDIO_DIR, { intermediates: true });
  }
}

function getLocalAudioPath(fileName) {
  return `${AUDIO_DIR}${fileName}`;
}

/**
 * Stellt sicher, dass die Audiodatei lokal verfügbar ist (Offline-Cache im
 * App-Sandbox-Verzeichnis `${documentDirectory}audio/`): existiert sie dort
 * schon, wird sie direkt verwendet (100% offline abspielbar). Andernfalls
 * wird über den authentifizierten Supabase-Client eine kurzlebige signierte
 * URL für den privaten Bucket "songbook-app" angefordert und die Datei
 * einmalig heruntergeladen. Gibt den lokalen file://-Pfad zurück, oder
 * `null`, wenn weder ein lokaler Cache noch eine Online-Verbindung/Supabase-
 * Konfiguration verfügbar ist.
 */
async function ensureLocalAudioFile(fileName) {
  await ensureAudioDir();
  const localPath = getLocalAudioPath(fileName);
  const info = await FileSystem.getInfoAsync(localPath);
  if (info.exists) {
    return localPath;
  }

  const supabase = await getSupabaseClient();
  if (!supabase) return null;

  const { data, error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .createSignedUrl(fileName, SIGNED_URL_EXPIRY_SECONDS);
  if (error || !data?.signedUrl) return null;

  try {
    const result = await FileSystem.downloadAsync(data.signedUrl, localPath);
    if (result.status !== 200) {
      await FileSystem.deleteAsync(localPath, { idempotent: true });
      return null;
    }
    return localPath;
  } catch (e) {
    await FileSystem.deleteAsync(localPath, { idempotent: true });
    return null;
  }
}

let audioModeConfigured = false;

/**
 * Kapselt Laden (Offline-Cache-Auflösung), Abspielen/Pausieren und
 * Fortschritt der einem Song zugeordneten Audiodatei (`song.data.audioFile`)
 * - vollständig entkoppelt vom Songtext/Autoscroll. `useAudioPlayer` löst
 * beim Song-/Quellenwechsel automatisch die vorherige Player-Instanz auf
 * (kein manuelles unloadAsync nötig), sodass beim Songwechsel oder
 * Verlassen des Screens die Wiedergabe stoppt und sauber entladen wird.
 */
export function useSongAudioPlayer(song) {
  const fileName = song?.data?.audioFile || null;
  const [localUri, setLocalUri] = useState(null);
  const [isResolving, setIsResolving] = useState(false);
  const requestIdRef = useRef(0);

  useEffect(() => {
    if (audioModeConfigured) return;
    audioModeConfigured = true;
    setAudioModeAsync({ playsInSilentMode: true }).catch(() => {});
  }, []);

  useEffect(() => {
    const requestId = ++requestIdRef.current;
    setLocalUri(null);
    if (!fileName) return undefined;

    setIsResolving(true);
    ensureLocalAudioFile(fileName)
      .then((path) => {
        if (requestIdRef.current === requestId) setLocalUri(path);
      })
      .finally(() => {
        if (requestIdRef.current === requestId) setIsResolving(false);
      });

    return () => {
      requestIdRef.current += 1;
    };
  }, [fileName]);

  const source = localUri ? { uri: localUri } : null;
  const player = useAudioPlayer(source);
  const status = useAudioPlayerStatus(player);

  function togglePlayPause() {
    if (!localUri) return;
    if (status.playing) {
      player.pause();
    } else {
      player.play();
    }
  }

  function seekToFraction(fraction) {
    if (!localUri || !status.duration) return;
    const clamped = Math.max(0, Math.min(1, fraction));
    player.seekTo(clamped * status.duration);
  }

  function stop() {
    if (status.playing) player.pause();
  }

  const progress = status.duration > 0 ? status.currentTime / status.duration : 0;

  return {
    hasAudioFile: !!fileName,
    isReady: !!localUri,
    isResolving,
    isPlaying: !!status.playing,
    progress,
    togglePlayPause,
    seekToFraction,
    stop,
  };
}
