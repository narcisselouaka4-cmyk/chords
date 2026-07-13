// Contrat d'entrée pur du voicing-engine.
// Reçoit un objet indépendant de toute UI ou timeline, et le normalise.
// Ne doit importer aucun module de src/ui/.

import { noteNameToPc } from '../chord-engine/intervals.js';
import { CHORD_DEFINITIONS } from '../chord-engine/chord-defs.js';
import { resolveCanonicalChordDefinition } from '../chord-engine/chord-display.js';

/**
 * Entrée pure du moteur de voicings.
 * Les pitch classes et les numéros MIDI ne dépendent jamais d'une préférence
 * de notation ; la notation n'a d'effet que sur l'affichage des noms de notes.
 * @typedef {{
 *   rootPc: number,
 *   quality: string,
 *   bassPc: number | null
 * }} VoicingChordInput
 */

/**
 * Résultat de la normalisation.
 * @typedef {{
 *   rootPc: number,
 *   quality: string,
 *   bassPc: number | null,
 *   chordTonePcs: number[],
 *   bassIsInChord: boolean,
 *   valid: boolean,
 *   errors: string[]
 * }} NormalizedVoicingInput
 */

const VALID_QUALITIES = new Set(CHORD_DEFINITIONS.map((d) => d.symbol).concat(''));

/**
 * Vérifie qu'une pitch class est un entier dans [0, 11].
 * @param {any} pc
 * @returns {boolean}
 */
function isValidPitchClass(pc) {
  return Number.isInteger(pc) && pc >= 0 && pc <= 11;
}

/**
 * Vérifie qu'une valeur est un numéro MIDI entier valide.
 * @param {any} midi
 * @returns {boolean}
 */
function isValidMidiNumber(midi) {
  return Number.isInteger(midi);
}

/**
 * Normalise une entrée de voicing.
 * Retourne un objet immuable avec les pitch classes de l'accord et un flag valid.
 * @param {VoicingChordInput} input
 * @returns {NormalizedVoicingInput}
 */
export function normalizeVoicingInput(input) {
  const errors = [];

  if (!input || typeof input !== 'object') {
    return Object.freeze({ rootPc: 0, quality: '', bassPc: null, chordTonePcs: Object.freeze([]), bassIsInChord: false, valid: false, errors: Object.freeze(['input must be an object']) });
  }

  const rootPc = input.rootPc;
  if (!isValidPitchClass(rootPc)) {
    errors.push(`rootPc must be an integer in 0..11, got ${rootPc}`);
  }

  const quality = input.quality;
  if (typeof quality !== 'string' || !VALID_QUALITIES.has(quality)) {
    errors.push(`quality must be one of ${[...VALID_QUALITIES].join(', ')}, got ${quality}`);
  }

  const bassPc = input.bassPc == null ? null : input.bassPc;
  if (bassPc != null && !isValidPitchClass(bassPc)) {
    errors.push(`bassPc must be null or an integer in 0..11, got ${bassPc}`);
  }

  if (errors.length > 0) {
    return Object.freeze({
      rootPc: isValidPitchClass(rootPc) ? rootPc : 0,
      quality: typeof quality === 'string' ? quality : '',
      bassPc: isValidPitchClass(bassPc) ? bassPc : null,
      chordTonePcs: Object.freeze([]),
      bassIsInChord: false,
      valid: false,
      errors: Object.freeze(errors),
    });
  }

  const def = resolveCanonicalChordDefinition(quality);
  const intervals = def ? def.intervals : [0, 4, 7]; // '' = major triade si pas trouvé dans chord-defs

  const chordTonePcs = Object.freeze([...new Set(intervals.map((i) => (rootPc + i) % 12))].sort((a, b) => a - b));
  const bassIsInChord = bassPc != null && chordTonePcs.includes(bassPc);

  return Object.freeze({
    rootPc,
    quality,
    bassPc,
    chordTonePcs,
    bassIsInChord,
    valid: true,
    errors: Object.freeze([]),
  });
}

/**
 * Convertit un symbole d'accord en entrée de voicing.
 * Cet adaptateur reste pur : il ne reçoit pas de segment UI.
 * @param {string} chordSymbol
 * @returns {NormalizedVoicingInput}
 */
export function normalizeVoicingInputFromSymbol(chordSymbol) {
  if (!chordSymbol || chordSymbol === 'N') {
    return Object.freeze({ rootPc: 0, quality: '', bassPc: null, chordTonePcs: Object.freeze([]), bassIsInChord: false, valid: false, errors: Object.freeze(['no chord or N chord']) });
  }

  const slashIdx = chordSymbol.indexOf('/');
  const chordPart = slashIdx >= 0 ? chordSymbol.slice(0, slashIdx) : chordSymbol;
  const bassStr = slashIdx >= 0 ? chordSymbol.slice(slashIdx + 1).trim() : null;

  const rootMatch = chordPart.match(/^([A-G][#b]?)(.*)/);
  if (!rootMatch) {
    return Object.freeze({ rootPc: 0, quality: '', bassPc: null, chordTonePcs: Object.freeze([]), bassIsInChord: false, valid: false, errors: Object.freeze([`unrecognized chord symbol ${chordSymbol}`]) });
  }

  const rootPc = noteNameToPc(rootMatch[1]);
  const quality = rootMatch[2] || '';
  if (rootPc == null) {
    return Object.freeze({ rootPc: 0, quality: '', bassPc: null, chordTonePcs: Object.freeze([]), bassIsInChord: false, valid: false, errors: Object.freeze([`unrecognized root note in ${chordSymbol}`]) });
  }
  if (bassStr != null && noteNameToPc(bassStr) == null) {
    return Object.freeze({ rootPc: 0, quality: '', bassPc: null, chordTonePcs: Object.freeze([]), bassIsInChord: false, valid: false, errors: Object.freeze([`unrecognized bass note in ${chordSymbol}`]) });
  }
  const bassPc = bassStr ? noteNameToPc(bassStr) : null;

  return normalizeVoicingInput({ rootPc, quality, bassPc });
}
