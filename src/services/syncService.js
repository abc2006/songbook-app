import AsyncStorage from '@react-native-async-storage/async-storage';
import { getSupabaseClient } from './supabase';
import { generateShortId } from '../utils/shortId';
import {
  getAllSongsForSync,
  getAllSetlistsForSync,
  getSetlistSongUuidsMap,
  upsertSongFromRemote,
  upsertSetlistFromRemote,
  songIdExistsLocally,
} from '../db/database';

const LAST_SYNCED_AT_KEY = 'supabase_last_synced_at';

export async function getLastSyncedAt() {
  return AsyncStorage.getItem(LAST_SYNCED_AT_KEY);
}

async function setLastSyncedAt(iso) {
  await AsyncStorage.setItem(LAST_SYNCED_AT_KEY, iso);
}

function timeValue(iso) {
  if (!iso) return -Infinity;
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? -Infinity : t;
}

function formatDate(iso) {
  if (!iso) return '-';
  try {
    return new Date(iso).toLocaleString('de-DE');
  } catch (e) {
    return iso;
  }
}

// kind: 'local' (grün), 'cloud' (blau), 'neutral' (grau/Header).
function line(text, kind = 'neutral') {
  return { text, kind };
}

function cap(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Erzeugt eine 4-stellige id, die weder unter den gerade geladenen
 * Remote-Songs noch lokal schon vergeben ist.
 */
async function generateUniqueSongIdForCloud(existingRemoteIds) {
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const candidate = generateShortId();
    if (existingRemoteIds.has(candidate)) continue;
    // eslint-disable-next-line no-await-in-loop
    const takenLocally = await songIdExistsLocally(candidate);
    if (!takenLocally) return candidate;
  }
}

/**
 * Einmalige Behandlung von Cloud-Songs ohne id (null/leer, z.B. Altlasten
 * aus einer früheren Version oder externe Einfügung ohne id): vergibt eine
 * neue, kollisionsfreie 4-stellige id, hängt "(AUTOID)" an den Titel (falls
 * nicht schon vorhanden) und schreibt beides SOFORT per UPDATE nach
 * Supabase zurück - damit der Song ab sofort eine feste id hat und beim
 * nächsten Sync ganz normal darüber gematcht wird, statt erneut als
 * id-loser Sonderfall aufzutauchen. Kein Merging, kein Löschen - Songs mit
 * gleichem Titel bleiben immer eigenständig bestehen.
 */
async function assignMissingSongIds(supabase, remoteRows) {
  const log = [];
  const result = [];
  const existingIds = new Set(remoteRows.filter((r) => r.id && String(r.id).trim() !== '').map((r) => r.id));

  for (const row of remoteRows) {
    if (row.id && String(row.id).trim() !== '') {
      result.push(row);
      continue;
    }

    // eslint-disable-next-line no-await-in-loop
    const newId = await generateUniqueSongIdForCloud(existingIds);
    existingIds.add(newId);
    const baseTitle = row.title || 'Untitled Song';
    const newTitle = baseTitle.includes('(AUTOID)') ? baseTitle : `${baseTitle} (AUTOID)`;
    const now = new Date().toISOString();

    // eslint-disable-next-line no-await-in-loop
    const { error } = await supabase
      .from('songs')
      .update({ id: newId, title: newTitle, updated_at: now })
      .eq('id', row.id ?? '');
    if (error) throw new Error(`Songs AutoID Write-back: ${error.message}`);

    log.push(line(`-- Song without id found in cloud. Assigned new id ${newId}: ${newTitle}`, 'cloud'));
    result.push({ ...row, id: newId, title: newTitle, updated_at: now });
  }

  return { remoteRows: result, log };
}

/**
 * Synchronisiert eine Tabelle (songs oder setlists) datensatzweise anhand
 * von updated_at. Der Abgleich läuft ausschließlich über die 4-stellige id
 * (uuid-Spalte) - kein Fallback-Matching über Titel/Name. Zwei Songs mit
 * gleichem Titel, aber unterschiedlicher id, bleiben immer zwei
 * eigenständige Songs.
 */
async function syncEntityTable({ supabase, table, entityLabel, getLocalRows, getName, buildRemotePayload, applyRemoteLocally, preprocessRemoteRows }) {
  const log = [line(`Starting to process ${entityLabel}s from the cloud.`)];

  const { data: rawRemoteRows, error } = await supabase.from(table).select('*');
  if (error) throw new Error(`${table}: ${error.message}`);

  let remoteRows = rawRemoteRows || [];
  if (preprocessRemoteRows) {
    const preprocessed = await preprocessRemoteRows(supabase, remoteRows);
    remoteRows = preprocessed.remoteRows;
    log.push(...preprocessed.log);
  }

  const localRows = await getLocalRows();

  const remoteByUuid = new Map(remoteRows.map((r) => [r.id, r]));
  const localByUuid = new Map(localRows.map((r) => [r.uuid, r]));

  const toPush = [];

  for (const local of localRows) {
    const remote = remoteByUuid.get(local.uuid);
    const name = getName(local);

    if (!remote) {
      toPush.push(local);
      log.push(line(`-- ${cap(entityLabel)} does not exist in cloud. Adding cloud ${entityLabel}: ${name}`, 'cloud'));
    } else if (timeValue(local.updated_at) > timeValue(remote.updated_at)) {
      toPush.push(local);
      log.push(
        line(
          `-- Updating cloud ${entityLabel} ${name}, local Last Edit ${formatDate(local.updated_at)} is greater than cloud Last Edit ${formatDate(remote.updated_at)}`,
          'cloud'
        )
      );
    }
    // Fall "remote neuer/gleich" wird unten behandelt bzw. still übersprungen.
  }

  if (toPush.length > 0) {
    const payload = await Promise.all(toPush.map(buildRemotePayload));
    const { error: upErr } = await supabase.from(table).upsert(payload, { onConflict: 'id' });
    if (upErr) throw new Error(`${table} Upload: ${upErr.message}`);
  }

  for (const remote of remoteRows) {
    const local = localByUuid.get(remote.id);
    const name = remote.title || remote.name || '?';

    if (!local) {
      // eslint-disable-next-line no-await-in-loop
      await applyRemoteLocally(remote);
      log.push(line(`-- ${cap(entityLabel)} does not exist locally. Adding local ${entityLabel}: ${name}`, 'local'));
    } else if (timeValue(remote.updated_at) > timeValue(local.updated_at)) {
      // eslint-disable-next-line no-await-in-loop
      await applyRemoteLocally(remote);
      log.push(
        line(
          `-- Updating local ${entityLabel} ${name}, cloud Last Edit ${formatDate(remote.updated_at)} is greater than local Last Edit ${formatDate(local.updated_at)}`,
          'local'
        )
      );
    }
  }

  log.push(line(`Finished processing ${entityLabel}s.`));
  return log;
}

/**
 * Führt eine vollständige bidirektionale Synchronisierung durch. Eine
 * Setliste wird als Einheit behandelt: ihre Song-Zuordnung (song_ids,
 * geordnetes Array von Song-uuids) ist Teil der Setlisten-Zeile selbst,
 * es gibt keinen separaten Sync-Schritt/Log-Abschnitt für Zuordnungen.
 */
export async function syncNow() {
  const supabase = await getSupabaseClient();
  if (!supabase) {
    throw new Error('Supabase ist noch nicht konfiguriert. Bitte URL und Anon-Key in den Einstellungen eintragen.');
  }

  const songLog = await syncEntityTable({
    supabase,
    table: 'songs',
    entityLabel: 'song',
    getLocalRows: getAllSongsForSync,
    getName: (s) => s.title,
    preprocessRemoteRows: assignMissingSongIds,
    buildRemotePayload: (s) => ({
      id: s.uuid,
      title: s.title,
      artist: s.artist || '',
      lyrics: s.lyrics || '',
      data: s.data || {},
      updated_at: s.updated_at,
      deleted_at: s.deleted_at || null,
    }),
    applyRemoteLocally: (remote) => upsertSongFromRemote({ ...remote, uuid: remote.id }),
  });

  let songUuidsMapPromise = null;
  const setlistLog = await syncEntityTable({
    supabase,
    table: 'setlists',
    entityLabel: 'setlist',
    getLocalRows: getAllSetlistsForSync,
    getName: (s) => s.name,
    buildRemotePayload: async (s) => {
      if (!songUuidsMapPromise) songUuidsMapPromise = getSetlistSongUuidsMap();
      const songUuidsMap = await songUuidsMapPromise;
      return {
        id: s.uuid,
        name: s.name,
        created_at: s.created_at || '',
        song_ids: songUuidsMap.get(s.id) || [],
        updated_at: s.updated_at,
        deleted_at: s.deleted_at || null,
      };
    },
    applyRemoteLocally: (remote) => upsertSetlistFromRemote({ ...remote, uuid: remote.id }),
  });

  const log = [...songLog, ...setlistLog, line('Sync finished successfully.')];

  // eslint-disable-next-line no-console
  console.log('[Supabase-Sync]\n' + log.map((l) => l.text).join('\n'));

  const now = new Date().toISOString();
  await setLastSyncedAt(now);

  return { log, syncedAt: now };
}
