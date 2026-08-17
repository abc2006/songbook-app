const CHORDS_SHARP = [
  'C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'
];
const CHORDS_FLAT = [
  'C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'
];

const FLAT_TO_SHARP = {
  Db: 'C#',
  Eb: 'D#',
  Gb: 'F#',
  Ab: 'G#',
  Bb: 'A#',
};

/**
 * Offizieller ChordPro-Direktiven-Standard-Aliase
 * (case-insensitive Vergleich!)
 */
const CHORDPRO_DIRECTIVE_ALIASES = {
  title: ['title', 't'],
  artist: ['artist', 'subtitle', 'st'],
  key: ['key', 'k'],
  tempo: ['tempo'],
  capo: ['capo'],
  time: ['time'],
  transpose: ['transpose'],
  fontsize: ['fontsize', 'font'],
};

const CHORDPRO_DIRECTIVE_PREFERRED = {
  title: 'title',
  artist: 'artist',
  key: 'key',
  tempo: 'tempo',
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

function getCanonicalDirectiveKey(name) {
  const lowerName = name.toLowerCase();
  for (const [canonicalKey, aliases] of Object.entries(CHORDPRO_DIRECTIVE_ALIASES)) {
    if (aliases.map((alias) => alias.toLowerCase()).includes(lowerName)) {
      return canonicalKey;
    }
  }
  return null;
}

function normalizeRoot(root) {
  const normalized =
    root.charAt(0).toUpperCase() + (root.length > 1 ? root.slice(1) : '');
  return FLAT_TO_SHARP[normalized] || normalized;
}

function transposeSingleChord(chord, semitones, preferFlat) {
  const match = chord.match(/^([A-G](?:#|b)?)(.*)$/i);
  if (!match) return chord;

  const root = match[1].charAt(0).toUpperCase() + match[1].slice(1);
  const suffix = match[2];
  const normalized = normalizeRoot(root);

  let idx = CHORDS_SHARP.indexOf(normalized);
  if (idx === -1) {
    idx = CHORDS_FLAT.indexOf(root);
    if (idx === -1) return chord;
  }

  const newIdx = ((idx + semitones) % 12 + 12) % 12;
  const newRoot = preferFlat ? CHORDS_FLAT[newIdx] : CHORDS_SHARP[newIdx];
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
    if (directive) {
      const canonicalKey = getCanonicalDirectiveKey(directive.name);
      if (canonicalKey) {
        meta[canonicalKey] = directive.value;
      } else {
        meta[directive.name.toLowerCase()] = directive.value;
      }
    } else {
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
 */
export function renderTransposedLyrics(rawText, semitones, preferFlat = false) {
  const { lines } = parseChordPro(rawText);
  const source = lines.join('\n');

  return source.replace(/\[([^\]\n]+)\]/g, (match, chord) => {
    return `[${transposeSingleChord(chord.trim(), semitones, preferFlat)}]`;
  });
}
