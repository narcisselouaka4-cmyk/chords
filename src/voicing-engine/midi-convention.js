// Convention MIDI du voicing-engine.
// C4 = MIDI 60. Toutes les fonctions sont pures.
// Convention octave : pcOctaveToMidi(pc, octave) = 12 * (octave + 1) + pc.

const NOTE_NAMES_SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const NOTE_NAMES_FLAT = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

/**
 * Convertit une pitch class et un octave en numéro MIDI.
 * @param {number} pc - pitch class 0..11
 * @param {number} octave - octave avec C4=60
 * @returns {number} numéro MIDI
 */
export function pcOctaveToMidi(pc, octave) {
  if (!Number.isInteger(pc) || !Number.isInteger(octave)) {
    throw new TypeError(`pcOctaveToMidi expects integer pc and octave, got pc=${pc}, octave=${octave}`);
  }
  return 12 * (octave + 1) + pc;
}

/**
 * Extrait la pitch class et l'octave d'un numéro MIDI.
 * @param {number} midi
 * @returns {{ pc: number, octave: number }}
 */
export function midiToPcOctave(midi) {
  if (!Number.isInteger(midi)) {
    throw new TypeError(`midiToPcOctave expects integer midi, got ${midi}`);
  }
  const pc = ((midi % 12) + 12) % 12;
  const octave = Math.floor(midi / 12) - 1;
  return { pc, octave };
}

/**
 * Renvoie le nom de note pour un MIDI donné.
 * Par défaut utilise la politique enharmonique du module (bémols).
 * Passer useSharps=true pour forcer les dièses.
 * @param {number} midi
 * @param {{ useSharps?: boolean }} [opts]
 * @returns {string}
 */
export function midiToNoteName(midi, opts = {}) {
  const { pc, octave } = midiToPcOctave(midi);
  const useSharps = opts.useSharps != null ? opts.useSharps : NOTE_NAMING_POLICY.defaultUseSharps;
  const names = useSharps ? NOTE_NAMES_SHARP : NOTE_NAMES_FLAT;
  return `${names[pc]}${octave}`;
}

/**
 * Renvoie le MIDI d'un nom de type "C4", "F#3", "Bb2".
 * Accepte les altérations simples (# ou b). Les doubles altérations (x, bb)
 * ne sont pas supportées et retournent null.
 * @param {string} name
 * @returns {number | null}
 */
export function noteNameToMidi(name) {
  if (typeof name !== 'string') return null;
  const m = name.match(/^([A-G])([#b]?)(-?\d+)$/);
  if (!m) return null;
  const base = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[m[1]];
  const alter = m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0;
  const octave = parseInt(m[3], 10);
  if (!Number.isInteger(octave)) {
    return null;
  }
  const pc = ((base + alter) % 12 + 12) % 12;
  return pcOctaveToMidi(pc, octave);
}

/**
 * Renvoie les numéros MIDI de toutes les occurrences d'une pitch class
 * dans un intervalle d'octaves [minOctave, maxOctave] inclus.
 * Si minOctave > maxOctave, retourne un tableau vide.
 * @param {number} pc - 0..11
 * @param {number} minOctave
 * @param {number} maxOctave
 * @returns {number[]}
 */
export function pcMidiInstances(pc, minOctave, maxOctave) {
  if (!Number.isInteger(pc) || !Number.isInteger(minOctave) || !Number.isInteger(maxOctave)) {
    throw new TypeError(`pcMidiInstances expects integer pc, minOctave and maxOctave, got pc=${pc}, minOctave=${minOctave}, maxOctave=${maxOctave}`);
  }
  const result = [];
  for (let oct = minOctave; oct <= maxOctave; oct++) {
    result.push(pcOctaveToMidi(pc, oct));
  }
  return result;
}

/**
 * Politique enharmonique du voicing-engine.
 * Par défaut les noms de notes utilisent les bémols (convention jazz courante).
 * Passer useSharps=true pour forcer les dièses.
 * Les pitch classes et les numéros MIDI restent inchangés quelle que soit la
 * notation choisie.
 * @type {Readonly<{ defaultUseSharps: boolean }>}
 */
export const NOTE_NAMING_POLICY = Object.freeze({
  defaultUseSharps: false,
});
