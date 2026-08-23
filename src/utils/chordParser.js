import { getChordSettings } from '../services/chordSettingsService';

/**
 * Die Notennamen an Index 10/11 (Bb/B) hängen von der Ton-Nomenklatur-
 * Einstellung ab (international/deutsch/bassist) - siehe
 * chordSettingsService.js. International: B=natürlich, Bb=erniedrigt.
 * Deutsch: H=natürlich, B=erniedrigt (klassische Umbenennung). Bassist:
 * H=natürlich (wie deutsch), aber Bb=erniedrigt (wie international) -
 * vermeidet die deutsche B/Bb-Verwechslung.
 */
function getChordTables() {
  const { nomenclature } = getChordSettings();
  const natural = nomenclature === 'international' ? 'B' : 'H';
  const flatSpelling = nomenclature === 'german' ? 'B' : 'Bb';

  const sharp = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', natural];
  const flat = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', flatSpelling, natural];

  // Für die Root-Erkennung beim Parsen (z.B. "H", "B", "Bb" im Songtext)
  const rootToIndex = {
    C: 0, 'C#': 1, Db: 1,
    D: 2, 'D#': 3, Eb: 3,
    E: 4,
    F: 5, 'F#': 6, Gb: 6,
    G: 7, 'G#': 8, Ab: 8,
    A: 9, 'A#': 10,
  };
  rootToIndex[flatSpelling] = 10;
  rootToIndex[natural] = 11;
  // Bassist-Modus: "B" allein soll wie international als natürlicher Ton gelten.
  if (nomenclature === 'bassist') {
    rootToIndex.B = 11;
    rootToIndex.Bb = 10;
  }

  return { sharp, flat, rootToIndex };
}

/**
 * Bestimmt anhand der Vorzeichen-Einstellung (immer #, immer b, oder
 * automatisch nach Tonart), ob Akkorde/Tonart mit b-Vorzeichen dargestellt
 * werden sollen. Im Automatik-Modus eine vereinfachte, aber gängige
 * Heuristik: b/# in der Tonart selbst entscheidet; bei naturbelassenen
 * Tonarten sind nur F-Dur/D-Moll "b-Tonarten", der Rest bevorzugt #.
 */
const FLAT_PREFERRING_NATURAL_KEYS = new Set(['F', 'Dm']);

export function resolvePreferFlat(key) {
  const { accidentals } = getChordSettings();
  if (accidentals === 'sharp') return false;
  if (accidentals === 'flat') return true;

  if (!key) return false;
  const trimmed = key.trim();
  if (trimmed.includes('b')) return true;
  if (trimmed.includes('#')) return false;
  return FLAT_PREFERRING_NATURAL_KEYS.has(trimmed);
}

/**
 * Offizieller ChordPro-Direktiven-Standard-Aliase
 * (case-insensitive Vergleich!)
 */
const CHORDPRO_DIRECTIVE_ALIASES = {
  id: ['id'],
  title: ['title', 't'],
  artist: ['artist', 'subtitle', 'st'],
  key: ['key', 'k'],
  bpm: ['bpm', 'tempo'],
  tags: ['tags'],
  capo: ['capo'],
  time: ['time'],
  transpose: ['transpose'],
  fontsize: ['fontsize', 'font'],
};

const CHORDPRO_DIRECTIVE_PREFERRED = {
  id: 'id',
  title: 'title',
  artist: 'artist',
  key: 'key',
  bpm: 'bpm',
  tags: 'tags',
  capo: 'capo',
  time: 'time',
  transpose: 'transpose',
  fontsize: 'fontsize',
};

function parseChordProDirective(line) {
  const trimmed = line.trim();
  const match = trimmed.match(/^\{([^:}]+):\s*(.*)\}$/);
  if (!match) return null;
  return { name: match[1].trim(), value: match[2].trim() };
}

/** Wie parseChordProDirective, erkennt zusätzlich direktiven ohne Wert (z.B. "{soc}", "{ehl}"). */
function parseAnyDirective(line) {
  const withValue = parseChordProDirective(line);
  if (withValue) return withValue;
  const trimmed = line.trim();
  const match = trimmed.match(/^\{([^:}]+)\}$/);
  if (!match) return null;
  return { name: match[1].trim(), value: '' };
}

// Umgebungs-/Inline-Tags, die NICHT als Metadaten interpretiert werden
// dürfen (im Gegensatz zu title/artist/bpm/... bleiben sie wörtlich im
// Songtext stehen, damit sie beim nächsten Rendern wieder ausgewertet
// werden können - siehe parseChordPro).
const SECTION_START_MAP = {
  soc: 'chorus', start_of_chorus: 'chorus',
  sov: 'verse', start_of_verse: 'verse',
  sot: 'tab', start_of_tab: 'tab',
};
const SECTION_END_MAP = {
  eoc: 'chorus', end_of_chorus: 'chorus',
  eov: 'verse', end_of_verse: 'verse',
  eot: 'tab', end_of_tab: 'tab',
};
const COMMENT_DIRECTIVE_NAMES = new Set(['c', 'comment']);
// {pause:}/{p:}/{delay:}/{sos:}/{eos}/{start_of_speed:}/{end_of_speed}
// werden nicht mehr unterstützt (kein Start-Delay/Fast-Forward/Pausen/
// Speed-Zonen mehr im Autoscroll) - bleiben aber body-only, damit sie bei
// älteren Songtexten nicht als Metadaten interpretiert werden, sondern
// einfach ignoriert (siehe renderChordProLines).
const IGNORED_DIRECTIVE_NAMES = new Set(['pause', 'p', 'delay', 'sos', 'start_of_speed', 'eos', 'end_of_speed']);
const BODY_ONLY_DIRECTIVE_NAMES = new Set([
  ...Object.keys(SECTION_START_MAP),
  ...Object.keys(SECTION_END_MAP),
  ...COMMENT_DIRECTIVE_NAMES,
  ...IGNORED_DIRECTIVE_NAMES,
  'shl',
  'ehl',
]);

function getCanonicalDirectiveKey(name) {
  const lowerName = name.toLowerCase();
  for (const [canonicalKey, aliases] of Object.entries(CHORDPRO_DIRECTIVE_ALIASES)) {
    if (aliases.map((alias) => alias.toLowerCase()).includes(lowerName)) {
      return canonicalKey;
    }
  }
  return null;
}

function transposeSingleChord(chord, semitones, preferFlat) {
  // Root: A-G oder H (deutsche Nomenklatur), optional #/b, Rest ist Suffix.
  const match = chord.match(/^([A-Ha-h])(#|b)?(.*)$/);
  if (!match) return chord;

  const rootLetter = match[1].toUpperCase();
  const accidental = match[2] || '';
  const suffix = match[3] || '';
  const rootName = rootLetter + accidental;

  const { sharp, flat, rootToIndex } = getChordTables();
  const idx = rootToIndex[rootName];
  if (idx === undefined) return chord;

  const newIdx = ((idx + semitones) % 12 + 12) % 12;
  const newRoot = preferFlat ? flat[newIdx] : sharp[newIdx];
  return newRoot + suffix;
}

/**
 * Parst ChordPro-Text in Metadaten und Songtext (ohne Direktiven).
 */
export function parseChordPro(rawText) {
  const lines = rawText.replace(/\r\n/g, '\n').split('\n');
  const meta = {};
  const bodyLines = [];

  for (const line of lines) {
    const directive = parseChordProDirective(line.trim());
    if (directive && !BODY_ONLY_DIRECTIVE_NAMES.has(directive.name.toLowerCase())) {
      const canonicalKey = getCanonicalDirectiveKey(directive.name);
      if (canonicalKey) {
        meta[canonicalKey] = directive.value;
      } else {
        meta[directive.name.toLowerCase()] = directive.value;
      }
    } else {
      // Umgebungs-/Kommentar-/Highlight-Tags (soc/eoc/sov/eov/sot/eot/c/
      // comment/shl/ehl) und normale Textzeilen bleiben unverändert im
      // Songtext - werden erst beim Rendern interpretiert (renderChordProLines).
      bodyLines.push(line);
    }
  }

  return {
    meta,
    body: bodyLines.join('\n'),
    lines: bodyLines,
  };
}

/**
 * Setzt oder überschreibt eine Direktive im ChordPro-Text.
 */
export function setDirective(rawText, directiveName, value) {
  const lines = rawText.replace(/\r\n/g, '\n').split('\n');
  const lowerName = directiveName.toLowerCase();
  let lineIdx = -1;
  let bestAlias = null;
  let isStandard = false;
  let canonicalKey = null;

  for (const [ckey, aliases] of Object.entries(CHORDPRO_DIRECTIVE_ALIASES)) {
    if (aliases.map((alias) => alias.toLowerCase()).includes(lowerName)) {
      canonicalKey = ckey;
      bestAlias = CHORDPRO_DIRECTIVE_PREFERRED[ckey];
      isStandard = true;
      break;
    }
  }

  if (!canonicalKey) {
    bestAlias = directiveName;
    canonicalKey = directiveName;
  }

  for (let i = 0; i < lines.length; ++i) {
    const line = lines[i].trim();
    const directive = parseChordProDirective(line);
    if (directive) {
      const directiveNameLower = directive.name.toLowerCase();
      if (isStandard) {
        if (
          CHORDPRO_DIRECTIVE_ALIASES[canonicalKey]
            .map((alias) => alias.toLowerCase())
            .includes(directiveNameLower)
        ) {
          lineIdx = i;
          break;
        }
      } else if (directiveNameLower === lowerName) {
        lineIdx = i;
        break;
      }
    }
  }

  const newDirective = `{${bestAlias}: ${value}}`;
  if (lineIdx >= 0) {
    lines[lineIdx] = newDirective;
  } else {
    let insertAt = 0;
    for (let i = 0; i < lines.length; ++i) {
      const line = lines[i].trim();
      if (!parseChordProDirective(line) && line !== '') {
        insertAt = i;
        break;
      }
      insertAt = i + 1;
    }
    lines.splice(insertAt, 0, newDirective);
  }

  return lines.join('\n');
}

/**
 * Gibt den Songtext mit transponierten Akkorden zurück (ohne Metadaten-Direktiven).
 * Akkorde bleiben inline in eckigen Klammern - für Stellen, an denen die
 * klassische Chord-über-Text-Darstellung (renderChordProLines) nicht passt.
 */
export function renderTransposedLyrics(rawText, semitones, preferFlat = false) {
  const { lines } = parseChordPro(rawText);
  const source = lines.join('\n');

  return source.replace(/\[([^\]\n]+)\]/g, (match, chord) => {
    return `[${transposeSingleChord(chord.trim(), semitones, preferFlat)}]`;
  });
}

const KEY_REGEX = /^([A-Ha-h](?:#|b)?)(m)?$/;

/**
 * Transponiert eine Tonart (z.B. "Am", "C#") um die angegebenen Halbtöne
 * und formatiert sie als "X-Dur"/"X-Moll" für die Anzeige. Erkennt Moll an
 * einem nachgestellten "m" (z.B. "Am", "F#m"), alles andere gilt als Dur.
 * Unbekanntes Format wird unverändert zurückgegeben.
 */
export function transposeKeyDisplay(key, semitones, preferFlat = false) {
  if (!key) return null;
  const match = key.trim().match(KEY_REGEX);
  if (!match) return key.trim();

  const isMinor = !!match[2];
  const transposedRoot = transposeSingleChord(match[1], semitones, preferFlat);
  return `${transposedRoot}-${isMinor ? 'Moll' : 'Dur'}`;
}

// Ein Token ist entweder ein Akkord [Am], eine Highlight-Start-Direktive
// {shl: farbe} oder eine Highlight-End-Direktive {ehl}.
const LINE_TOKEN_REGEX = /\[([^\]\n]+)\]|\{shl:\s*([^}]+)\}|\{ehl\}/gi;

/**
 * Zerlegt eine einzelne Zeile mit inline-Akkorden ([Am]Text) und optionalen
 * {shl:farbe}/{ehl}-Hervorhebungen in eine Akkord-Zeile (Akkorde an der
 * Spalten-Position ihres Auftretens im Text) und in Text-Segmente
 * (lyricSegments: [{text, highlightColor}]) - klassische
 * Songbook-Darstellung. `highlightState` ist ein über die ganze Zeilen-
 * schleife geteiltes {color} Objekt, damit eine Hervorhebung auch über
 * Zeilenenden hinweg laufen kann (kein {ehl} bis zum nächsten {shl}).
 */
function splitChordLine(line, semitones, preferFlat, highlightState) {
  LINE_TOKEN_REGEX.lastIndex = 0;
  let match;
  let lyric = '';
  let lastIndex = 0;
  const chordPositions = [];
  const highlightRanges = [];
  let activeColor = highlightState.color;
  let rangeStart = activeColor ? 0 : null;

  while ((match = LINE_TOKEN_REGEX.exec(line)) !== null) {
    lyric += line.slice(lastIndex, match.index);
    if (match[1] !== undefined) {
      const chordName = transposeSingleChord(match[1].trim(), semitones, preferFlat);
      chordPositions.push({ position: lyric.length, chord: chordName });
    } else if (match[2] !== undefined) {
      if (activeColor && rangeStart !== null && lyric.length > rangeStart) {
        highlightRanges.push({ start: rangeStart, end: lyric.length, color: activeColor });
      }
      activeColor = match[2].trim();
      rangeStart = lyric.length;
    } else {
      if (activeColor && rangeStart !== null && lyric.length > rangeStart) {
        highlightRanges.push({ start: rangeStart, end: lyric.length, color: activeColor });
      }
      activeColor = null;
      rangeStart = null;
    }
    lastIndex = LINE_TOKEN_REGEX.lastIndex;
  }
  lyric += line.slice(lastIndex);

  if (activeColor && rangeStart !== null && lyric.length > rangeStart) {
    highlightRanges.push({ start: rangeStart, end: lyric.length, color: activeColor });
  }
  // Für die nächste Zeile merken, falls die Hervorhebung noch offen ist.
  highlightState.color = activeColor;

  const lyricSegments = buildLyricSegments(lyric, highlightRanges);

  if (chordPositions.length === 0) {
    return { chordLine: null, lyricLine: lyric, lyricSegments };
  }

  // Reine Akkordzeile (Intro/Solo/Instrumental, z.B. "[Bm] [F#7] [A] [E7]"):
  // kein Text übrig außer Whitespace -> als Akkord-Array zurückgeben, damit
  // die Anzeige das als Flexbox-Zellenraster rendern kann statt mit
  // Text-Padding zu arbeiten.
  if (lyric.trim() === '') {
    return {
      chordLine: null,
      lyricLine: '',
      lyricSegments: [],
      chords: chordPositions.map((c) => c.chord),
    };
  }

  // Mindestabstand zwischen zwei Akkorden, falls sie im Text direkt
  // aufeinandertreffen (z.B. "[A]   [B]" oder "[C][G]") - unabhängig davon,
  // wie viele/wenige Leerzeichen im Quelltext dazwischen standen.
  const MIN_CHORD_GAP = 4;

  let chordLine = '';
  for (const { position, chord } of chordPositions) {
    let insertPos = Math.max(position, chordLine.length);
    if (chordLine.length > 0 && insertPos < chordLine.length + MIN_CHORD_GAP) {
      insertPos = chordLine.length + MIN_CHORD_GAP;
    }
    if (chordLine.length < insertPos) {
      chordLine += ' '.repeat(insertPos - chordLine.length);
    }
    chordLine += chord;
  }

  return { chordLine: chordLine.trimEnd(), lyricLine: lyric, lyricSegments };
}

/** Zerlegt lyric in Text-Segmente anhand der Highlight-Ranges (für verschachtelte <Text>-Spans beim Rendern). */
function buildLyricSegments(lyric, highlightRanges) {
  if (highlightRanges.length === 0) {
    return [{ text: lyric, highlightColor: null }];
  }
  const segments = [];
  let cursor = 0;
  for (const range of highlightRanges) {
    if (range.start > cursor) {
      segments.push({ text: lyric.slice(cursor, range.start), highlightColor: null });
    }
    segments.push({ text: lyric.slice(range.start, range.end), highlightColor: range.color });
    cursor = range.end;
  }
  if (cursor < lyric.length) {
    segments.push({ text: lyric.slice(cursor), highlightColor: null });
  }
  return segments;
}

/**
 * Wandelt den ChordPro-Songtext (ohne Meta-Direktiven) in eine Liste von
 * Zeilen-/Blockobjekten für die klassische Songbook-Darstellung um:
 * - {type: 'comment', text} für {c: ...}/{comment: ...}
 * - {type: 'line', section, chordLine, lyricLine, lyricSegments, chords?}
 *   für alles andere, `section` ist 'verse'|'chorus'|'tab'|null je nach
 *   umschließendem {sov}/{soc}/{sot}...{eov}/{eoc}/{eot}-Block.
 * {pause:}/{p:}/{delay:}/{sos:}/{eos}/{start_of_speed:}/{end_of_speed}
 * werden erkannt, aber ignoriert (kein Start-Delay/Fast-Forward/Pausen/
 * Speed-Zonen mehr - das Autoscroll läuft mit einer einzigen, konstanten
 * Geschwindigkeit durch, siehe ShowModeScreen).
 */
export function renderChordProLines(rawText, semitones, preferFlat = false) {
  const { lines } = parseChordPro(rawText);
  const result = [];
  let currentSection = null;
  const highlightState = { color: null };

  for (const rawLine of lines) {
    const directive = parseAnyDirective(rawLine.trim());
    if (directive) {
      const lowerName = directive.name.toLowerCase();
      if (SECTION_START_MAP[lowerName]) {
        currentSection = SECTION_START_MAP[lowerName];
        continue;
      }
      if (SECTION_END_MAP[lowerName]) {
        currentSection = null;
        continue;
      }
      if (COMMENT_DIRECTIVE_NAMES.has(lowerName)) {
        result.push({ type: 'comment', text: directive.value });
        continue;
      }
      if (IGNORED_DIRECTIVE_NAMES.has(lowerName)) {
        continue;
      }
    }

    const parsedLine = splitChordLine(rawLine, semitones, preferFlat, highlightState);
    result.push({ type: 'line', section: currentSection, ...parsedLine });
  }

  return result;
}

/**
 * Baut aus einem DB-Song (id/title/artist/lyrics/data) den editierbaren
 * Volltext mit vorangestellten Direktiven auf (DB -> Textfeld). {id: ...}
 * steht als allererste Zeile, damit sie im Editor sichtbar ist.
 */
export function buildSongText(song) {
  const data = song.data || {};
  const lines = [];
  if (song.uuid) {
    lines.push(`{id: ${song.uuid}}`);
  }
  lines.push(`{title: ${song.title || ''}}`, `{artist: ${song.artist || ''}}`);
  if (data.bpm !== undefined && data.bpm !== null && data.bpm !== '') {
    lines.push(`{bpm: ${data.bpm}}`);
  }
  if (data.key) {
    lines.push(`{key: ${data.key}}`);
  }
  if (Array.isArray(data.tags) && data.tags.length > 0) {
    lines.push(`{tags: ${data.tags.join(', ')}}`);
  }

  const body = (song.lyrics || '').trim();
  return body ? `${lines.join('\n')}\n\n${body}` : lines.join('\n');
}

const SHORT_ID_DIRECTIVE_REGEX = /^[A-Za-z0-9]{4}$/;

/**
 * Liest den editierbaren Volltext zurück in DB-Felder (Textfeld -> DB):
 * id (falls vorhanden & gültig, sonst null), title/artist als Spalten,
 * bpm/key/tags ins data-JSON, der Rest als lyrics. Der Titel wird hier NIE
 * verändert (kein automatisches "(AUTOID)") - das ist Sache des Aufrufers
 * (nur beim Import/Sync von Altbestand ohne id anhängen, siehe
 * ImportExportScreen), da parseSongText auch beim ganz normalen Speichern
 * eines bestehenden Songs im Editor läuft.
 */
export function parseSongText(text) {
  const cp = parseChordPro(text || '');
  const bpmNumber = Number(cp.meta.bpm);
  const tags = cp.meta.tags
    ? cp.meta.tags.split(',').map((t) => t.trim()).filter(Boolean)
    : [];

  const rawId = cp.meta.id?.trim();
  const hasValidId = rawId && SHORT_ID_DIRECTIVE_REGEX.test(rawId);

  return {
    id: hasValidId ? rawId : null,
    title: cp.meta.title?.trim() || 'Untitled Song',
    artist: cp.meta.artist?.trim() || '',
    lyrics: cp.body.trim(),
    data: {
      bpm: !isNaN(bpmNumber) && bpmNumber > 0 ? bpmNumber : null,
      key: cp.meta.key?.trim() || null,
      tags,
    },
  };
}
