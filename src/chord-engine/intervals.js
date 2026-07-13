export const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const FLAT_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
const LATIN_NAMES = ['Do', 'Do#', 'Ré', 'Ré#', 'Mi', 'Fa', 'Fa#', 'Sol', 'Sol#', 'La', 'La#', 'Si'];
const LATIN_FLAT_NAMES = ['Do', 'Réb', 'Ré', 'Mib', 'Mi', 'Fa', 'Solb', 'Sol', 'Lab', 'La', 'Sib', 'Si'];

const NAME_ALIASES = new Map([
  ['do', 'do'],
  ['ré', 'ré'],
  ['re', 'ré'],
  ['mi', 'mi'],
  ['fa', 'fa'],
  ['sol', 'sol'],
  ['la', 'la'],
  ['si', 'si'],
  ['ti', 'si'],
]);

function latinBaseAlias(name) {
  // Remove accidentals from the end to find the base note name
  const base = name.replace(/[#b]+$/, '');
  return NAME_ALIASES.get(base);
}

export function midiToPc(midi) {
  return midi % 12;
}

export function pcDistance(from, to) {
  return (to - from + 12) % 12;
}

export function midiToNoteName(midi, useSharps = true, latin = false) {
  const pc = midiToPc(midi);
  const names = latin
    ? useSharps
      ? LATIN_NAMES
      : LATIN_FLAT_NAMES
    : useSharps
      ? NOTE_NAMES
      : FLAT_NAMES;
  return names[pc];
}

export function noteNameToPc(name) {
  const normalized = name.trim().replace(/♭/g, 'b').replace(/♯/g, '#');
  const base = normalized.charAt(0).toUpperCase();
  const alter = normalized.slice(1);
  const baseIndex = NOTE_NAMES.indexOf(base);
  if (baseIndex === -1) return null;

  let offset = 0;
  for (const ch of alter) {
    if (ch === '#') offset += 1;
    else if (ch === 'b') offset -= 1;
  }
  return (baseIndex + offset + 12) % 12;
}

function latinNoteNameToPc(name) {
  const normalized = name.trim().toLowerCase().replace(/♭/g, 'b').replace(/♯/g, '#').replace(/-?\d+$/, '');
  const baseMatch = normalized.match(/^([a-zéèêôóò]+)([#b]*)$/);
  if (!baseMatch) return null;
  const baseName = baseMatch[1];
  const alter = baseMatch[2];
  const alias = latinBaseAlias(baseName);
  if (!alias) return null;
  const baseIndex = LATIN_NAMES.findIndex((n) => n.toLowerCase() === alias);
  if (baseIndex === -1) return null;

  let offset = 0;
  for (const ch of alter) {
    if (ch === '#') offset += 1;
    else if (ch === 'b') offset -= 1;
  }
  return (baseIndex + offset + 12) % 12;
}

export function noteNameToMidi(name, defaultOctave = 4) {
  const normalized = name.trim().replace(/♭/g, 'b').replace(/♯/g, '#');

  // Latin notation support (Do/Ré/Mi..., with or without octave)
  const latinMatch = normalized.match(/^([Dd][Oo]?[Bb#]?|[Rr][EéÉ]?[Bb#]?|[Mm][Ii]?[Bb#]?|[Ff][Aa]?[Bb#]?|[Ss][Oo][Ll]?[Bb#]?|[Ll][Aa]?[Bb#]?|[Ss][Ii]?[Bb#]?|[Tt][Ii][Bb#]?)(-?\d+)?$/);
  if (latinMatch) {
    const [, notePart, octaveStr] = latinMatch;
    const pc = latinNoteNameToPc(notePart);
    if (pc === null) return null;
    const octave = octaveStr !== undefined ? Number(octaveStr) : defaultOctave;
    return pc + (octave + 1) * 12;
  }

  const match = normalized.match(/^([A-Ga-g])([#b]*)(-?\d+)?$/);
  if (!match) return null;

  const [, notePart, alter, octaveStr] = match;
  const pc = noteNameToPc(notePart + alter);
  if (pc === null) return null;

  const octave = octaveStr !== undefined ? Number(octaveStr) : defaultOctave;
  return pc + (octave + 1) * 12;
}

export function midiToOctave(midi) {
  return Math.floor(midi / 12) - 1;
}

export function noteSetToPcs(notes) {
  return Array.from(new Set(notes.map(midiToPc))).sort((a, b) => a - b);
}

export function transposePc(pc, semitones) {
  return (pc + semitones + 12) % 12;
}

export function formatNote(pc, useSharps = true, latin = false) {
  return midiToNoteName(pc + 60, useSharps, latin);
}
