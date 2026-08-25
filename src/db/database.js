import * as SQLite from 'expo-sqlite';
import { generateShortId, isValidShortId } from '../utils/shortId';

const db = SQLite.openDatabaseSync('songbook.db');

let initPromise = null;

/**
 * Legt die Tabellen an (falls nicht vorhanden), migriert alte IDs (z.B.
 * lange UUIDs aus einer früheren Version) auf das neue 4-stellige
 * alphanumerische Format und räumt Song-Duplikate auf. Eine neue/leere
 * Datenbank bleibt komplett leer - keine Beispiel-/Seed-Songs mehr.
 */
export function initDatabase() {
  if (!initPromise) {
    initPromise = runMigrations().then(dedupeSongs);
  }
  return initPromise;
}

async function ensureColumn(table, column, definition) {
  const info = await db.getAllAsync(`PRAGMA table_info(${table})`);
  const exists = info.some((col) => col.name === column);
  if (!exists) {
    await db.execAsync(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

/**
 * Erzeugt eine 4-stellige alphanumerische ID und würfelt neu, falls sie in
 * der jeweiligen Tabelle schon vergeben ist (Punkt 1 der Vorgabe).
 */
async function generateUniqueShortId(table) {
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const candidate = generateShortId();
    // eslint-disable-next-line no-await-in-loop
    const existing = await db.getFirstAsync(`SELECT 1 as found FROM ${table} WHERE uuid = ?`, candidate);
    if (!existing) return candidate;
  }
}

/**
 * Stellt sicher, dass jede Zeile eine gültige 4-stellige ID hat. Zeilen
 * ohne id oder mit einer alten (z.B. langen UUID-)id bekommen eine frische
 * 4-stellige, kollisionsfreie ID zugewiesen.
 */
async function migrateToShortIds(table) {
  const rows = await db.getAllAsync(`SELECT id, uuid FROM ${table}`);
  const now = new Date().toISOString();
  for (const row of rows) {
    if (!isValidShortId(row.uuid)) {
      // eslint-disable-next-line no-await-in-loop
      const newId = await generateUniqueShortId(table);
      // eslint-disable-next-line no-await-in-loop
      await db.runAsync(
        `UPDATE ${table} SET uuid = ?, updated_at = COALESCE(updated_at, ?) WHERE id = ?`,
        newId,
        now,
        row.id
      );
    }
  }
}

async function runMigrations() {
  await db.execAsync(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS songs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      artist TEXT,
      lyrics TEXT NOT NULL DEFAULT '',
      data TEXT NOT NULL DEFAULT '{}'
    );

    CREATE TABLE IF NOT EXISTS setlists (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      created_at TEXT
    );

    CREATE TABLE IF NOT EXISTS setlist_songs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      setlist_id INTEGER NOT NULL,
      song_id INTEGER NOT NULL,
      position INTEGER NOT NULL,
      FOREIGN KEY (setlist_id) REFERENCES setlists (id) ON DELETE CASCADE,
      FOREIGN KEY (song_id) REFERENCES songs (id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_setlist_songs_setlist
      ON setlist_songs (setlist_id, position);
  `);

  // uuid-Spalte trägt jetzt die 4-stellige Sync-ID (Name aus früherer
  // Migration beibehalten, um keine riskante Spalten-Umbenennung zu brauchen).
  for (const table of ['songs', 'setlists', 'setlist_songs']) {
    // eslint-disable-next-line no-await-in-loop
    await ensureColumn(table, 'uuid', 'TEXT');
    // eslint-disable-next-line no-await-in-loop
    await ensureColumn(table, 'updated_at', 'TEXT');
  }

  // Soft-Delete: gelöschte Songs/Setlisten werden nicht mehr per DELETE
  // entfernt, sondern nur markiert - sonst würden sie beim nächsten Sync
  // als "neu" wieder von einem anderen Gerät hochgeladen werden (Zombie).
  for (const table of ['songs', 'setlists']) {
    // eslint-disable-next-line no-await-in-loop
    await ensureColumn(table, 'deleted_at', 'TEXT');
  }

  await db.execAsync(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_songs_uuid ON songs (uuid);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_setlists_uuid ON setlists (uuid);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_setlist_songs_uuid ON setlist_songs (uuid);
  `);

  for (const table of ['songs', 'setlists', 'setlist_songs']) {
    // eslint-disable-next-line no-await-in-loop
    await migrateToShortIds(table);
  }
}

function songKey(title, artist) {
  return `${(title || '').trim().toLowerCase()}::${(artist || '').trim().toLowerCase()}`;
}

function timeValue(iso) {
  if (!iso) return -Infinity;
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? -Infinity : t;
}

/**
 * Räumt lokale Song-Duplikate auf (gleicher Titel+Artist, unterschiedliche
 * id). Der jeweils zuerst angelegte Datensatz bleibt als "Original"
 * bestehen (stabile id für evtl. schon verknüpfte Setlisten); sein Inhalt
 * wird durch die neuere Version ersetzt, falls die neuer ist. Setlisten-
 * Zuordnungen, die auf das gelöschte Duplikat zeigten, werden auf das
 * Original umgehängt (bzw. entfernt, falls das Original schon in derselben
 * Setliste vorkommt).
 */
async function dedupeSongs() {
  const rows = await db.getAllAsync('SELECT * FROM songs WHERE deleted_at IS NULL ORDER BY id ASC');
  const keepers = new Map();

  for (const row of rows) {
    const key = songKey(row.title, row.artist);
    const keeper = keepers.get(key);

    if (!keeper) {
      keepers.set(key, row);
      continue;
    }

    if (timeValue(row.updated_at) > timeValue(keeper.updated_at)) {
      await db.runAsync(
        'UPDATE songs SET title = ?, artist = ?, lyrics = ?, data = ?, updated_at = ? WHERE id = ?',
        row.title,
        row.artist,
        row.lyrics,
        row.data,
        row.updated_at,
        keeper.id
      );
    }

    const referencing = await db.getAllAsync('SELECT * FROM setlist_songs WHERE song_id = ?', row.id);
    for (const ref of referencing) {
      // eslint-disable-next-line no-await-in-loop
      const existing = await db.getFirstAsync(
        'SELECT id FROM setlist_songs WHERE setlist_id = ? AND song_id = ? AND id != ?',
        ref.setlist_id,
        keeper.id,
        ref.id
      );
      if (existing) {
        // eslint-disable-next-line no-await-in-loop
        await db.runAsync('DELETE FROM setlist_songs WHERE id = ?', ref.id);
      } else {
        // eslint-disable-next-line no-await-in-loop
        await db.runAsync('UPDATE setlist_songs SET song_id = ? WHERE id = ?', keeper.id, ref.id);
      }
    }

    await db.runAsync('DELETE FROM songs WHERE id = ?', row.id);
  }
}

function parseSongRow(row) {
  if (!row) return null;
  let data = {};
  try {
    data = JSON.parse(row.data || '{}');
  } catch (e) {
    data = {};
  }
  return { ...row, data };
}

function formatDateTime(date) {
  const pad = (n) => String(n).padStart(2, '0');
  const dd = pad(date.getDate());
  const mm = pad(date.getMonth() + 1);
  const yy = pad(date.getFullYear() % 100);
  const hh = pad(date.getHours());
  const min = pad(date.getMinutes());
  return `${dd}.${mm}.${yy} ${hh}:${min}`;
}

// ------------------------- Songs -------------------------

export async function getAllSongs() {
  const rows = await db.getAllAsync('SELECT * FROM songs WHERE deleted_at IS NULL ORDER BY title COLLATE NOCASE ASC');
  return rows.map(parseSongRow);
}

export async function getSongById(id) {
  const row = await db.getFirstAsync('SELECT * FROM songs WHERE id = ? AND deleted_at IS NULL', id);
  return parseSongRow(row);
}

/**
 * `id` (optional) ist die 4-stellige Sync-ID aus einer {id: ...}-Direktive
 * (z.B. beim Import). Ist sie ungültig oder bereits vergeben, wird
 * automatisch eine neue, kollisionsfreie 4-stellige ID erzeugt.
 */
export async function createSong({ title, artist = '', lyrics = '', data = {}, id = null }) {
  let finalId = null;
  if (id && isValidShortId(id)) {
    const taken = await db.getFirstAsync('SELECT 1 as found FROM songs WHERE uuid = ?', id);
    if (!taken) finalId = id;
  }
  if (!finalId) {
    finalId = await generateUniqueShortId('songs');
  }

  const result = await db.runAsync(
    'INSERT INTO songs (title, artist, lyrics, data, uuid, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
    title,
    artist,
    lyrics,
    JSON.stringify(data),
    finalId,
    new Date().toISOString()
  );
  return getSongById(result.lastInsertRowId);
}

export async function updateSong(id, { title, artist, lyrics, data }) {
  // Die Sync-ID (uuid) bleibt beim Bearbeiten eines bestehenden Songs immer
  // unverändert, auch wenn im Text eine abweichende {id: ...}-Zeile steht.
  await db.runAsync(
    'UPDATE songs SET title = ?, artist = ?, lyrics = ?, data = ?, updated_at = ? WHERE id = ?',
    title,
    artist,
    lyrics,
    JSON.stringify(data),
    new Date().toISOString(),
    id
  );
  return getSongById(id);
}

/**
 * Soft-Delete: löscht nicht physisch, sondern markiert nur (deleted_at +
 * updated_at), damit die Löschung beim nächsten Sync korrekt als
 * Tombstone auf andere Geräte übertragen wird statt den Song dort einfach
 * bestehen zu lassen bzw. ihn versehentlich zu reaktivieren.
 */
export async function deleteSong(id) {
  const now = new Date().toISOString();
  await db.runAsync('UPDATE songs SET deleted_at = ?, updated_at = ? WHERE id = ?', now, now, id);
}

// ------------------------- Setlisten -------------------------

export async function getSetlists() {
  return db.getAllAsync('SELECT * FROM setlists WHERE deleted_at IS NULL ORDER BY id DESC');
}

export async function getSetlistById(id) {
  return db.getFirstAsync('SELECT * FROM setlists WHERE id = ? AND deleted_at IS NULL', id);
}

export async function createSetlist(name) {
  const createdAt = formatDateTime(new Date());
  const id = await generateUniqueShortId('setlists');
  const result = await db.runAsync(
    'INSERT INTO setlists (name, created_at, uuid, updated_at) VALUES (?, ?, ?, ?)',
    name,
    createdAt,
    id,
    new Date().toISOString()
  );
  return getSetlistById(result.lastInsertRowId);
}

/**
 * Soft-Delete wie bei Songs (siehe deleteSong). Die lokale
 * setlist_songs-Zuordnung wird trotzdem physisch geräumt - die ist kein
 * eigenständig synchronisiertes Objekt (siehe song_ids auf der
 * setlists-Zeile), daher unkritisch.
 */
export async function deleteSetlist(id) {
  await db.runAsync('DELETE FROM setlist_songs WHERE setlist_id = ?', id);
  const now = new Date().toISOString();
  await db.runAsync('UPDATE setlists SET deleted_at = ?, updated_at = ? WHERE id = ?', now, now, id);
}

// --------------------- Setlisten-Songs ---------------------

export async function getSetlistSongs(setlistId) {
  const rows = await db.getAllAsync(
    `SELECT setlist_songs.id as setlistSongId, setlist_songs.position as position, songs.*
     FROM setlist_songs
     JOIN songs ON songs.id = setlist_songs.song_id
     WHERE setlist_songs.setlist_id = ? AND songs.deleted_at IS NULL
     ORDER BY setlist_songs.position ASC`,
    setlistId
  );
  return rows.map((row) => {
    const { setlistSongId, position, ...songFields } = row;
    return { setlistSongId, position, song: parseSongRow(songFields) };
  });
}

export async function addSongToSetlist(setlistId, songId) {
  const row = await db.getFirstAsync(
    'SELECT MAX(position) as maxPosition FROM setlist_songs WHERE setlist_id = ?',
    setlistId
  );
  const nextPosition = (row && row.maxPosition != null ? row.maxPosition : -1) + 1;
  const id = await generateUniqueShortId('setlist_songs');
  await db.runAsync(
    'INSERT INTO setlist_songs (setlist_id, song_id, position, uuid, updated_at) VALUES (?, ?, ?, ?, ?)',
    setlistId,
    songId,
    nextPosition,
    id,
    new Date().toISOString()
  );
  await touchSetlist(setlistId);
}

export async function removeSongFromSetlist(setlistSongId) {
  const row = await db.getFirstAsync('SELECT setlist_id FROM setlist_songs WHERE id = ?', setlistSongId);
  await db.runAsync('DELETE FROM setlist_songs WHERE id = ?', setlistSongId);
  if (row) await touchSetlist(row.setlist_id);
}

/**
 * Vertauscht die Position eines Setlist-Eintrags mit seinem direkten
 * Nachbarn (direction: -1 = nach oben, +1 = nach unten) und schreibt beide
 * neuen Positionen persistent in die DB.
 */
export async function moveSetlistSong(setlistId, setlistSongId, direction) {
  const entries = await db.getAllAsync(
    'SELECT id, position FROM setlist_songs WHERE setlist_id = ? ORDER BY position ASC',
    setlistId
  );
  const index = entries.findIndex((e) => e.id === setlistSongId);
  const targetIndex = index + direction;
  if (index === -1 || targetIndex < 0 || targetIndex >= entries.length) return;

  const current = entries[index];
  const target = entries[targetIndex];
  const now = new Date().toISOString();

  await db.runAsync('UPDATE setlist_songs SET position = ?, updated_at = ? WHERE id = ?', target.position, now, current.id);
  await db.runAsync('UPDATE setlist_songs SET position = ?, updated_at = ? WHERE id = ?', current.position, now, target.id);
  await touchSetlist(setlistId);
}

/**
 * Setzt updated_at der Setliste selbst neu, wenn sich ihre Song-Zuordnung
 * ändert (Hinzufügen/Entfernen/Umsortieren) - die Song-Liste ist Teil der
 * Setlisten-Identität beim Sync (siehe song_ids weiter unten), nicht mehr
 * eine separat synchronisierte Tabelle.
 */
async function touchSetlist(setlistId) {
  await db.runAsync('UPDATE setlists SET updated_at = ? WHERE id = ?', new Date().toISOString(), setlistId);
}

// --------------------------- Sync ---------------------------
// Rohe Lese-/Schreibfunktionen für den Supabase-Sync (syncService.js).
// Getrennt von den UI-nahen Funktionen oben, damit die App-Screens nichts
// von uuid (4-stellige Sync-ID)/updated_at/song_ids wissen müssen.
// Der Abgleich läuft ausschließlich über diese id - kein Fallback-Matching
// über Titel/Artist/Name mehr.

export async function getAllSongsForSync() {
  const rows = await db.getAllAsync('SELECT * FROM songs');
  return rows.map(parseSongRow);
}

export async function getAllSetlistsForSync() {
  return db.getAllAsync('SELECT * FROM setlists');
}

/**
 * Liefert für jede lokale Setliste die geordnete Liste der Song-ids -
 * das ist die Form, in der eine Setliste bei Supabase gespeichert wird
 * (song_ids-Array direkt auf der setlists-Zeile statt einer eigenen
 * Zuordnungstabelle).
 */
export async function getSetlistSongUuidsMap() {
  const rows = await db.getAllAsync(
    `SELECT setlist_songs.setlist_id as setlistId, songs.uuid as songUuid
     FROM setlist_songs
     JOIN songs ON songs.id = setlist_songs.song_id
     WHERE songs.deleted_at IS NULL
     ORDER BY setlist_songs.setlist_id ASC, setlist_songs.position ASC`
  );
  const map = new Map();
  for (const row of rows) {
    if (!map.has(row.setlistId)) map.set(row.setlistId, []);
    map.get(row.setlistId).push(row.songUuid);
  }
  return map;
}

async function getLocalIdByUuid(table, uuid) {
  if (!uuid) return null;
  const row = await db.getFirstAsync(`SELECT id FROM ${table} WHERE uuid = ?`, uuid);
  return row ? row.id : null;
}

/**
 * Für die einmalige AUTOID-Vergabe beim Sync (syncService.js): prüft, ob
 * eine Sync-id lokal bereits vergeben ist, damit eine für die Cloud neu
 * generierte id garantiert auch lokal kollisionsfrei ist.
 */
export async function songIdExistsLocally(id) {
  const row = await db.getFirstAsync('SELECT 1 as found FROM songs WHERE uuid = ?', id);
  return !!row;
}

/**
 * Übernimmt eine von Supabase heruntergeladene Song-Zeile in die lokale DB,
 * gematcht ausschließlich über die 4-stellige id. Legt sie neu an (falls
 * die id lokal unbekannt ist) oder aktualisiert die bestehende Zeile.
 */
export async function upsertSongFromRemote(remote) {
  const localId = await getLocalIdByUuid('songs', remote.uuid);
  const dataJson = JSON.stringify(remote.data || {});
  const deletedAt = remote.deleted_at || null;

  if (!localId) {
    await db.runAsync(
      'INSERT INTO songs (title, artist, lyrics, data, uuid, updated_at, deleted_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      remote.title || 'Untitled Song',
      remote.artist || '',
      remote.lyrics || '',
      dataJson,
      remote.uuid,
      remote.updated_at || new Date().toISOString(),
      deletedAt
    );
    return 'inserted';
  }

  await db.runAsync(
    'UPDATE songs SET title = ?, artist = ?, lyrics = ?, data = ?, updated_at = ?, deleted_at = ? WHERE id = ?',
    remote.title || 'Untitled Song',
    remote.artist || '',
    remote.lyrics || '',
    dataJson,
    remote.updated_at || new Date().toISOString(),
    deletedAt,
    localId
  );
  return 'updated';
}

/**
 * Übernimmt eine von Supabase heruntergeladene Setlisten-Zeile inkl. ihres
 * song_ids-Arrays (gematcht über die 4-stellige id): legt/aktualisiert die
 * setlists-Zeile und gleicht danach die lokalen setlist_songs-Einträge an
 * das Array an (Reihenfolge = Array-Reihenfolge). Songs müssen zu diesem
 * Zeitpunkt bereits lokal vorhanden sein (Songs werden vor Setlisten
 * synchronisiert).
 */
export async function upsertSetlistFromRemote(remote) {
  const localId = await getLocalIdByUuid('setlists', remote.uuid);
  let setlistId = localId;
  const deletedAt = remote.deleted_at || null;

  if (!localId) {
    const result = await db.runAsync(
      'INSERT INTO setlists (name, created_at, uuid, updated_at, deleted_at) VALUES (?, ?, ?, ?, ?)',
      remote.name || 'Setliste',
      remote.created_at || '',
      remote.uuid,
      remote.updated_at || new Date().toISOString(),
      deletedAt
    );
    setlistId = result.lastInsertRowId;
  } else {
    await db.runAsync(
      'UPDATE setlists SET name = ?, created_at = ?, updated_at = ?, deleted_at = ? WHERE id = ?',
      remote.name || 'Setliste',
      remote.created_at || '',
      remote.updated_at || new Date().toISOString(),
      deletedAt,
      localId
    );
  }

  // Ein als gelöscht markierter Datensatz bekommt keine song_ids mehr
  // aufgezwungen - sonst würden alte Zuordnungen einen bereits gelöschten
  // Song "wiederbeleben".
  if (!deletedAt) {
    await reconcileSetlistSongs(setlistId, remote.song_ids || []);
  }
  return localId ? 'updated' : 'inserted';
}

/**
 * Bringt die lokalen setlist_songs-Einträge einer Setliste in Deckung mit
 * dem gegebenen song_ids-Array (Song-ids in Zielreihenfolge): entfernt
 * Einträge, die nicht mehr im Array sind, legt fehlende an, korrigiert
 * Positionen.
 */
async function reconcileSetlistSongs(setlistId, songUuids) {
  const localSongRows =
    songUuids.length > 0
      ? await db.getAllAsync(
          'SELECT id, uuid FROM songs WHERE deleted_at IS NULL AND uuid IN (' + songUuids.map(() => '?').join(',') + ')',
          ...songUuids
        )
      : [];
  const localIdByUuid = new Map(localSongRows.map((r) => [r.uuid, r.id]));
  const targetSongIds = songUuids.map((uuid) => localIdByUuid.get(uuid)).filter((id) => id != null);

  const existing = await db.getAllAsync('SELECT id, song_id FROM setlist_songs WHERE setlist_id = ?', setlistId);
  const existingBySongId = new Map(existing.map((e) => [e.song_id, e.id]));

  const now = new Date().toISOString();

  for (let position = 0; position < targetSongIds.length; position++) {
    const songId = targetSongIds[position];
    const existingRowId = existingBySongId.get(songId);
    if (existingRowId) {
      // eslint-disable-next-line no-await-in-loop
      await db.runAsync('UPDATE setlist_songs SET position = ? WHERE id = ?', position, existingRowId);
      existingBySongId.delete(songId);
    } else {
      // eslint-disable-next-line no-await-in-loop
      const id = await generateUniqueShortId('setlist_songs');
      // eslint-disable-next-line no-await-in-loop
      await db.runAsync(
        'INSERT INTO setlist_songs (setlist_id, song_id, position, uuid, updated_at) VALUES (?, ?, ?, ?, ?)',
        setlistId,
        songId,
        position,
        id,
        now
      );
    }
  }

  // Alles, was übrig geblieben ist, war lokal noch zugeordnet, steht aber
  // nicht mehr im Cloud-Array -> entfernen.
  for (const remainingRowId of existingBySongId.values()) {
    // eslint-disable-next-line no-await-in-loop
    await db.runAsync('DELETE FROM setlist_songs WHERE id = ?', remainingRowId);
  }
}
