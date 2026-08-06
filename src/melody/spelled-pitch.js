// [OpenCode] — 2026-08-06 — Incrément 3 : moteur central d'orthographe musicale.
// Sépare strictement l'identité sonore (pitch class / MIDI) de l'orthographe
// (lettre + altération + octave). Toutes les opérations sont pures,
// JSON-safe et indépendantes du DOM.
//
// Ce module est la source unique d'orthographe musicale pour le pipeline
// Mélodie & Réharmonisation et les consommateurs futurs (structured_harmony_v1).

import { noteNameToPc } from '../chord-engine/intervals.js';
import { parseChordSymbol } from '../chord-engine/chord-display.js';

// ---------------------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------------------

const VALID_LETTERS = Object.freeze(['C', 'D', 'E', 'F', 'G', 'A', 'B']);
const LETTER_TO_PC = Object.freeze({ C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 });
const VALID_MODES = Object.freeze(new Set(['major', 'minor']));
const VALID_ACCIDENTALS = Object.freeze(new Set([-2, -1, 0, 1, 2]));
const VALID_ORIGINS = Object.freeze(new Set([
  'key-context',
  'chord-symbol',
  'manual',
  'detected',
  'fallback',
]));
const VALID_KEY_SOURCES = Object.freeze(new Set([
  'detected-default',
  'manual',
  'corrected',
  'imported',
]));

// Signature d'armure standard pour les tonalités majeures, de -7 à +7 quintes.
// Chaque entrée fournit la tonique et les 7 degrés diatoniques avec 7 lettres
// distinctes dans l'ordre diatonique.
const MAJOR_SIGNATURES = Object.freeze([
  // -7 : Do bémol majeur
  {
    fifths: -7,
    tonic: { letter: 'C', accidental: -1 },
    scale: [
      { letter: 'C', accidental: -1 },
      { letter: 'D', accidental: -1 },
      { letter: 'E', accidental: -1 },
      { letter: 'F', accidental: -1 },
      { letter: 'G', accidental: -1 },
      { letter: 'A', accidental: -1 },
      { letter: 'B', accidental: -1 },
    ],
  },
  // -6 : Sol bémol majeur
  {
    fifths: -6,
    tonic: { letter: 'G', accidental: -1 },
    scale: [
      { letter: 'G', accidental: -1 },
      { letter: 'A', accidental: -1 },
      { letter: 'B', accidental: -1 },
      { letter: 'C', accidental: -1 },
      { letter: 'D', accidental: -1 },
      { letter: 'E', accidental: -1 },
      { letter: 'F', accidental: 0 },
    ],
  },
  // -5 : Ré bémol majeur
  {
    fifths: -5,
    tonic: { letter: 'D', accidental: -1 },
    scale: [
      { letter: 'D', accidental: -1 },
      { letter: 'E', accidental: -1 },
      { letter: 'F', accidental: 0 },
      { letter: 'G', accidental: -1 },
      { letter: 'A', accidental: -1 },
      { letter: 'B', accidental: -1 },
      { letter: 'C', accidental: 0 },
    ],
  },
  // -4 : La bémol majeur
  {
    fifths: -4,
    tonic: { letter: 'A', accidental: -1 },
    scale: [
      { letter: 'A', accidental: -1 },
      { letter: 'B', accidental: -1 },
      { letter: 'C', accidental: 0 },
      { letter: 'D', accidental: -1 },
      { letter: 'E', accidental: -1 },
      { letter: 'F', accidental: 0 },
      { letter: 'G', accidental: 0 },
    ],
  },
  // -3 : Mi bémol majeur
  {
    fifths: -3,
    tonic: { letter: 'E', accidental: -1 },
    scale: [
      { letter: 'E', accidental: -1 },
      { letter: 'F', accidental: 0 },
      { letter: 'G', accidental: 0 },
      { letter: 'A', accidental: -1 },
      { letter: 'B', accidental: -1 },
      { letter: 'C', accidental: 0 },
      { letter: 'D', accidental: 0 },
    ],
  },
  // -2 : Si bémol majeur
  {
    fifths: -2,
    tonic: { letter: 'B', accidental: -1 },
    scale: [
      { letter: 'B', accidental: -1 },
      { letter: 'C', accidental: 0 },
      { letter: 'D', accidental: 0 },
      { letter: 'E', accidental: -1 },
      { letter: 'F', accidental: 0 },
      { letter: 'G', accidental: 0 },
      { letter: 'A', accidental: 0 },
    ],
  },
  // -1 : Fa majeur
  {
    fifths: -1,
    tonic: { letter: 'F', accidental: 0 },
    scale: [
      { letter: 'F', accidental: 0 },
      { letter: 'G', accidental: 0 },
      { letter: 'A', accidental: 0 },
      { letter: 'B', accidental: -1 },
      { letter: 'C', accidental: 0 },
      { letter: 'D', accidental: 0 },
      { letter: 'E', accidental: 0 },
    ],
  },
  // 0 : Do majeur
  {
    fifths: 0,
    tonic: { letter: 'C', accidental: 0 },
    scale: [
      { letter: 'C', accidental: 0 },
      { letter: 'D', accidental: 0 },
      { letter: 'E', accidental: 0 },
      { letter: 'F', accidental: 0 },
      { letter: 'G', accidental: 0 },
      { letter: 'A', accidental: 0 },
      { letter: 'B', accidental: 0 },
    ],
  },
  // +1 : Sol majeur
  {
    fifths: 1,
    tonic: { letter: 'G', accidental: 0 },
    scale: [
      { letter: 'G', accidental: 0 },
      { letter: 'A', accidental: 0 },
      { letter: 'B', accidental: 0 },
      { letter: 'C', accidental: 0 },
      { letter: 'D', accidental: 0 },
      { letter: 'E', accidental: 0 },
      { letter: 'F', accidental: 1 },
    ],
  },
  // +2 : Ré majeur
  {
    fifths: 2,
    tonic: { letter: 'D', accidental: 0 },
    scale: [
      { letter: 'D', accidental: 0 },
      { letter: 'E', accidental: 0 },
      { letter: 'F', accidental: 1 },
      { letter: 'G', accidental: 0 },
      { letter: 'A', accidental: 0 },
      { letter: 'B', accidental: 0 },
      { letter: 'C', accidental: 1 },
    ],
  },
  // +3 : La majeur
  {
    fifths: 3,
    tonic: { letter: 'A', accidental: 0 },
    scale: [
      { letter: 'A', accidental: 0 },
      { letter: 'B', accidental: 0 },
      { letter: 'C', accidental: 1 },
      { letter: 'D', accidental: 0 },
      { letter: 'E', accidental: 0 },
      { letter: 'F', accidental: 1 },
      { letter: 'G', accidental: 1 },
    ],
  },
  // +4 : Mi majeur
  {
    fifths: 4,
    tonic: { letter: 'E', accidental: 0 },
    scale: [
      { letter: 'E', accidental: 0 },
      { letter: 'F', accidental: 1 },
      { letter: 'G', accidental: 1 },
      { letter: 'A', accidental: 0 },
      { letter: 'B', accidental: 0 },
      { letter: 'C', accidental: 1 },
      { letter: 'D', accidental: 1 },
    ],
  },
  // +5 : Si majeur
  {
    fifths: 5,
    tonic: { letter: 'B', accidental: 0 },
    scale: [
      { letter: 'B', accidental: 0 },
      { letter: 'C', accidental: 1 },
      { letter: 'D', accidental: 1 },
      { letter: 'E', accidental: 0 },
      { letter: 'F', accidental: 1 },
      { letter: 'G', accidental: 1 },
      { letter: 'A', accidental: 1 },
    ],
  },
  // +6 : Fa dièse majeur
  {
    fifths: 6,
    tonic: { letter: 'F', accidental: 1 },
    scale: [
      { letter: 'F', accidental: 1 },
      { letter: 'G', accidental: 1 },
      { letter: 'A', accidental: 1 },
      { letter: 'B', accidental: 0 },
      { letter: 'C', accidental: 1 },
      { letter: 'D', accidental: 1 },
      { letter: 'E', accidental: 1 },
    ],
  },
  // +7 : Do dièse majeur
  {
    fifths: 7,
    tonic: { letter: 'C', accidental: 1 },
    scale: [
      { letter: 'C', accidental: 1 },
      { letter: 'D', accidental: 1 },
      { letter: 'E', accidental: 1 },
      { letter: 'F', accidental: 1 },
      { letter: 'G', accidental: 1 },
      { letter: 'A', accidental: 1 },
      { letter: 'B', accidental: 1 },
    ],
  },
]);

// Mapping pc → fifths par défaut pour les tonalités majeures.
// Les choix enharmoniques suivent la convention : dièses préférés aux bémols
// lorsque plusieurs armures aboutissent à la même pitch class (C#/Db, F#/Gb, B/Cb).
const MAJOR_PC_TO_DEFAULT_FIFTHS = Object.freeze({
  0: 0,   // C
  1: 7,   // C# (par défaut plutôt que Db=-5)
  2: 2,   // D
  3: -3,  // Eb
  4: 4,   // E
  5: -1,  // F
  6: 6,   // F# (par défaut plutôt que Gb=-6)
  7: 1,   // G
  8: -4,  // Ab
  9: 3,   // A
  10: -2, // Bb
  11: 5,  // B (par défaut plutôt que Cb=-7)
});

// ---------------------------------------------------------------------------
// Helpers internes
// ---------------------------------------------------------------------------

function normalizePc(pc) {
  return ((pc % 12) + 12) % 12;
}

function isValidLetter(letter) {
  return typeof letter === 'string' && VALID_LETTERS.includes(letter);
}

function isValidMode(mode) {
  return typeof mode === 'string' && VALID_MODES.has(mode);
}

function accidentalToString(accidental) {
  if (accidental === 0) return '';
  if (accidental === 1) return '#';
  if (accidental === 2) return '##';
  if (accidental === -1) return 'b';
  if (accidental === -2) return 'bb';
  return '';
}

function buildSpelledPitch(input, defaultOrigin) {
  const pitchClass = normalizePc(input.pitchClass);
  const letter = input.letter;
  const accidental = Number(input.accidental);
  const octave = input.octave == null ? null : Number(input.octave);
  const origin = input.origin || defaultOrigin;
  const explicit = input.explicit === true;

  return createSpelledPitch({
    pitchClass,
    letter,
    accidental,
    octave,
    origin,
    explicit,
  });
}

function getMajorSignature(fifths) {
  return MAJOR_SIGNATURES.find((s) => s.fifths === fifths) || null;
}

function computeFifthsForMajorPc(pc) {
  return MAJOR_PC_TO_DEFAULT_FIFTHS[normalizePc(pc)] ?? 0;
}

function computeFifthsForKey(pc, mode) {
  const normalized = normalizePc(pc);
  if (mode === 'major') {
    return computeFifthsForMajorPc(normalized);
  }
  if (mode === 'minor') {
    // Armure relative majeure : tonique majeure = tonique mineure + 3 demi-tons.
    const relativeMajorPc = normalizePc(normalized + 3);
    return computeFifthsForMajorPc(relativeMajorPc);
  }
  // Mode non supporté : on tombe sur Do majeur par défaut.
  return 0;
}

function letterIndex(letter) {
  return VALID_LETTERS.indexOf(letter);
}

function rotateScaleToTonic(scale, letter, accidental) {
  const idx = scale.findIndex((s) => s.letter === letter && s.accidental === accidental);
  if (idx === -1) {
    throw new Error(`La note ${letter}${accidentalToString(accidental)} n'appartient pas à la gamme.`);
  }
  return [...scale.slice(idx), ...scale.slice(0, idx)];
}

// ---------------------------------------------------------------------------
// API publique — SpelledPitch
// ---------------------------------------------------------------------------

/**
 * Crée un SpelledPitch immuable et validé.
 *
 * @param {object} input
 * @param {number} input.pitchClass
 * @param {string} input.letter
 * @param {number} input.accidental
 * @param {number|null} [input.octave]
 * @param {SpelledPitch['origin']} [input.origin]
 * @param {boolean} [input.explicit]
 * @returns {import('./midi-types.js').SpelledPitch}
 */
export function createSpelledPitch(input) {
  if (!input || typeof input !== 'object') {
    throw new TypeError('createSpelledPitch attend un objet en entrée.');
  }

  const pitchClass = normalizePc(input.pitchClass);

  if (!isValidLetter(input.letter)) {
    throw new TypeError(`Lettre invalide : "${input.letter}".`);
  }

  if (!Number.isInteger(input.accidental) || !VALID_ACCIDENTALS.has(input.accidental)) {
    throw new RangeError(`Altération hors plage MVP : "${input.accidental}" (attendu -2 à +2).`);
  }

  const expectedPc = pitchClassFromSpelling(input.letter, input.accidental);
  if (expectedPc !== pitchClass) {
    throw new Error(
      `Incohérence orthographique : ${input.letter}${accidentalToString(input.accidental)} = pc ${expectedPc}, ` +
      `mais pitchClass fournie = ${pitchClass}.`,
    );
  }

  const origin = input.origin || 'fallback';
  if (!VALID_ORIGINS.has(origin)) {
    throw new TypeError(`Origine invalide : "${origin}".`);
  }

  const octave = input.octave == null ? null : Number(input.octave);
  if (octave !== null && !Number.isInteger(octave)) {
    throw new TypeError(`Octave invalide : "${octave}".`);
  }

  const explicit = input.explicit === true;

  return Object.freeze({
    pitchClass,
    letter: input.letter,
    accidental: input.accidental,
    octave,
    origin,
    explicit,
  });
}

/**
 * Valide un SpelledPitch sans lever d'exception.
 *
 * @param {object} spelledPitch
 * @returns {{ valid: boolean, error: string | null }}
 */
export function validateSpelledPitch(spelledPitch) {
  try {
    createSpelledPitch(spelledPitch);
    return { valid: true, error: null };
  } catch (err) {
    return { valid: false, error: err.message };
  }
}

/**
 * Calcule la pitch class correspondant à une lettre et une altération.
 *
 * @param {string} letter
 * @param {number} accidental
 * @returns {number}
 */
export function pitchClassFromSpelling(letter, accidental) {
  if (!isValidLetter(letter)) {
    throw new TypeError(`Lettre invalide : "${letter}".`);
  }
  if (!Number.isInteger(accidental)) {
    throw new TypeError(`Altération non entière : "${accidental}".`);
  }
  return normalizePc(LETTER_TO_PC[letter] + accidental);
}

/**
 * Vérifie que deux hauteurs ont la même identité sonore.
 *
 * @param {import('./midi-types.js').SpelledPitch} a
 * @param {import('./midi-types.js').SpelledPitch} b
 * @returns {boolean}
 */
export function sameSound(a, b) {
  if (!a || !b) return false;
  if (normalizePc(a.pitchClass) !== normalizePc(b.pitchClass)) return false;
  if (a.octave != null && b.octave != null && a.octave !== b.octave) return false;
  return true;
}

/**
 * Vérifie que deux hauteurs ont exactement la même orthographe.
 *
 * @param {import('./midi-types.js').SpelledPitch} a
 * @param {import('./midi-types.js').SpelledPitch} b
 * @returns {boolean}
 */
export function sameSpelling(a, b) {
  if (!a || !b) return false;
  return (
    a.letter === b.letter &&
    a.accidental === b.accidental &&
    a.octave === b.octave
  );
}

// ---------------------------------------------------------------------------
// API publique — Clés tonales
// ---------------------------------------------------------------------------

/**
 * Crée un SpelledKey à partir d'une orthographe explicite de tonique.
 *
 * @param {number} tonicPitchClass
 * @param {string} mode
 * @param {string} letter
 * @param {number} accidental
 * @param {SpelledKey['source']} [source]
 * @returns {import('./midi-types.js').SpelledKey}
 */
export function createSpelledKeyFromTonicSpelling(tonicPitchClass, mode, letter, accidental, source = 'manual') {
  if (!isValidMode(mode)) {
    throw new Error(`Mode non supporté : "${mode}".`);
  }
  if (!VALID_KEY_SOURCES.has(source)) {
    throw new TypeError(`Source de tonalité invalide : "${source}".`);
  }

  const normalizedPc = normalizePc(tonicPitchClass);

  let signature;
  if (mode === 'major') {
    // La signature majeure est identifiée par l'orthographe exacte de la tonique.
    signature = MAJOR_SIGNATURES.find((s) =>
      s.tonic.letter === letter && s.tonic.accidental === accidental,
    );
  } else {
    // Pour un mode mineur, l'armure est celle du relatif majeur (tonique + 3 demi-tons).
    const lookupPc = normalizePc(normalizedPc + 3);
    signature = MAJOR_SIGNATURES.find((s) => {
      const tonicPc = normalizePc(LETTER_TO_PC[s.tonic.letter] + s.tonic.accidental);
      return tonicPc === lookupPc;
    });
  }

  if (!signature) {
    throw new Error(
      `Aucune signature standard ne correspond à ${letter}${accidentalToString(accidental)} ${mode}.`,
    );
  }

  // Pour un mode mineur, la gamme démarre sur la tonique mineure.
  const scaleSpellings = mode === 'minor'
    ? rotateScaleToTonic(signature.scale, letter, accidental)
    : signature.scale;

  const tonic = createSpelledPitch({
    pitchClass: normalizedPc,
    letter,
    accidental,
    octave: null,
    origin: source === 'detected-default' ? 'detected' : source,
    explicit: source !== 'detected-default',
  });

  // Vérification : la première note de la gamme doit coïncider avec la tonique.
  const firstDegree = scaleSpellings[0];
  const firstPc = normalizePc(LETTER_TO_PC[firstDegree.letter] + firstDegree.accidental);
  if (firstPc !== normalizedPc || firstDegree.letter !== letter || firstDegree.accidental !== accidental) {
    throw new Error('Rotation de gamme incohérente.');
  }

  return Object.freeze({
    tonicPitchClass: normalizedPc,
    mode,
    tonic,
    fifths: signature.fifths,
    source,
    explicit: source !== 'detected-default',
  });
}

/**
 * Crée un SpelledKey par défaut à partir d'une tonique et d'un mode.
 *
 * @param {{ tonicPitchClass: number, mode: string }} key
 * @param {SpelledKey['source']} [source]
 * @returns {import('./midi-types.js').SpelledKey}
 */
export function createSpelledKeyFromKeyObject(key, source = 'detected-default') {
  if (!key || typeof key.tonicPitchClass !== 'number' || typeof key.mode !== 'string') {
    throw new TypeError('createSpelledKeyFromKeyObject attend { tonicPitchClass, mode }.');
  }
  if (!isValidMode(key.mode)) {
    throw new Error(`Mode non supporté : "${key.mode}".`);
  }
  if (!VALID_KEY_SOURCES.has(source)) {
    throw new TypeError(`Source de tonalité invalide : "${source}".`);
  }

  const tonicPitchClass = normalizePc(key.tonicPitchClass);
  const mode = key.mode;
  const fifths = computeFifthsForKey(tonicPitchClass, mode);
  const signature = getMajorSignature(fifths);
  if (!signature) {
    throw new Error(`Aucune signature trouvée pour ${tonicPitchClass} ${mode}.`);
  }

  // Pour le mode mineur, la tonique se trouve dans la gamme du relatif majeur.
  const tonicSpelling = mode === 'minor'
    ? signature.scale.find((s) => normalizePc(LETTER_TO_PC[s.letter] + s.accidental) === tonicPitchClass)
    : signature.tonic;

  if (!tonicSpelling) {
    throw new Error(`La tonique ${tonicPitchClass} n'est pas dans la signature ${fifths}.`);
  }

  const tonic = createSpelledPitch({
    pitchClass: tonicPitchClass,
    letter: tonicSpelling.letter,
    accidental: tonicSpelling.accidental,
    octave: null,
    origin: source === 'detected-default' ? 'detected' : source,
    explicit: source !== 'detected-default',
  });

  return Object.freeze({
    tonicPitchClass,
    mode,
    tonic,
    fifths,
    source,
    explicit: source !== 'detected-default',
  });
}

/**
 * Définit une orthographe préférée explicite sur un TonalContext.
 *
 * @param {import('./midi-types.js').TonalContext} context
 * @param {import('./midi-types.js').SpelledKey} spelledKey
 * @returns {import('./midi-types.js').TonalContext}
 */
export function setPreferredKeySpelling(context, spelledKey) {
  if (!context || typeof context !== 'object') {
    throw new TypeError('TonalContext invalide.');
  }
  if (!spelledKey || typeof spelledKey !== 'object') {
    throw new TypeError('SpelledKey invalide.');
  }

  const selected = {
    tonicPitchClass: normalizePc(spelledKey.tonicPitchClass),
    mode: spelledKey.mode,
  };

  const newSpelledKey = Object.freeze({
    ...spelledKey,
    tonicPitchClass: selected.tonicPitchClass,
    source: spelledKey.source === 'detected-default' ? 'manual' : spelledKey.source,
    explicit: true,
  });

  return {
    ...context,
    selected,
    spelledKey: newSpelledKey,
    selectionOrigin: context.selectionOrigin === 'detected' ? 'corrected' : (context.selectionOrigin || 'manual'),
    confirmedByUser: true,
    updatedAt: Date.now(),
  };
}

/**
 * Restaure l'orthographe par défaut de la tonalité détectée.
 *
 * @param {import('./midi-types.js').TonalContext} context
 * @returns {import('./midi-types.js').TonalContext}
 */
export function clearPreferredKeySpelling(context) {
  if (!context || typeof context !== 'object') {
    throw new TypeError('TonalContext invalide.');
  }

  const selected = context.selected
    ? { tonicPitchClass: context.selected.tonicPitchClass, mode: context.selected.mode }
    : null;

  let spelledKey = null;
  if (selected) {
    spelledKey = createSpelledKeyFromKeyObject(selected, 'detected-default');
  }

  return {
    ...context,
    spelledKey,
    updatedAt: Date.now(),
  };
}

// ---------------------------------------------------------------------------
// API publique — Orthographe contextuelle
// ---------------------------------------------------------------------------

/**
 * Retourne la signature de la tonalité (tonique + 7 degrés).
 *
 * @param {import('./midi-types.js').SpelledKey | import('./midi-types.js').TonalContext | null} context
 * @returns {{ fifths: number, tonic: import('./midi-types.js').SpelledPitch, scale: import('./midi-types.js').SpelledPitch[] } | null}
 */
function resolveKeySignature(context) {
  if (!context) return null;

  let spelledKey = null;
  if (context.spelledKey) {
    spelledKey = context.spelledKey;
  } else if (context.selected) {
    spelledKey = createSpelledKeyFromKeyObject(context.selected, 'detected-default');
  }

  if (!spelledKey) return null;

  const signature = getMajorSignature(spelledKey.fifths);
  if (!signature) return null;

  const scaleSpellings = spelledKey.mode === 'minor'
    ? rotateScaleToTonic(signature.scale, spelledKey.tonic.letter, spelledKey.tonic.accidental)
    : signature.scale;

  const tonic = createSpelledPitch({
    pitchClass: spelledKey.tonicPitchClass,
    letter: spelledKey.tonic.letter,
    accidental: spelledKey.tonic.accidental,
    octave: null,
    origin: 'key-context',
    explicit: spelledKey.explicit,
  });

  const scale = scaleSpellings.map((s) => createSpelledPitch({
    pitchClass: normalizePc(LETTER_TO_PC[s.letter] + s.accidental),
    letter: s.letter,
    accidental: s.accidental,
    octave: null,
    origin: 'key-context',
    explicit: spelledKey.explicit,
  }));

  return { fifths: spelledKey.fifths, tonic, scale };
}

/**
 * Propose une orthographe contextuelle pour une pitch class.
 *
 * @param {number} pitchClass
 * @param {import('./midi-types.js').SpelledKey | import('./midi-types.js').TonalContext | null} context
 * @returns {import('./midi-types.js').SpelledPitch}
 */
export function spellPitchClass(pitchClass, context) {
  const pc = normalizePc(pitchClass);
  const signature = resolveKeySignature(context);

  if (signature && signature.scale) {
    const diatonic = signature.scale.find((s) => s.pitchClass === pc);
    if (diatonic) {
      return createSpelledPitch({
        pitchClass: pc,
        letter: diatonic.letter,
        accidental: diatonic.accidental,
        octave: null,
        origin: 'key-context',
        explicit: signature.tonic.explicit,
      });
    }

    // Note chromatique : choisir une orthographe cohérente avec l'armure.
    const chromatic = spellChromaticInSignature(pc, signature.scale, signature.fifths);
    if (chromatic) return chromatic;
  }

  // Fallback déterministe : utiliser les noms avec dièses.
  return createSpelledPitch({
    pitchClass: pc,
    letter: sharpLetterForPc(pc),
    accidental: sharpAccidentalForPc(pc),
    octave: null,
    origin: 'fallback',
    explicit: false,
  });
}

/**
 * Propose une orthographe contextuelle pour une note MIDI.
 *
 * @param {number} midi
 * @param {import('./midi-types.js').SpelledKey | import('./midi-types.js').TonalContext | null} context
 * @returns {import('./midi-types.js').SpelledPitch}
 */
export function spellMidiNote(midi, context) {
  if (!Number.isInteger(midi) || midi < 0 || midi > 127) {
    throw new RangeError(`midi doit être un entier 0-127, reçu : ${midi}`);
  }
  const pc = normalizePc(midi);
  const octave = Math.floor(midi / 12) - 1;
  const spelled = spellPitchClass(pc, context);
  return createSpelledPitch({
    pitchClass: spelled.pitchClass,
    letter: spelled.letter,
    accidental: spelled.accidental,
    octave,
    origin: spelled.origin,
    explicit: spelled.explicit,
  });
}

/**
 * Retourne les 7 degrés diatoniques d'une tonalité.
 *
 * @param {import('./midi-types.js').TonalContext} tonalContext
 * @returns {import('./midi-types.js').SpelledPitch[]}
 */
export function spellScale(tonalContext) {
  const signature = resolveKeySignature(tonalContext);
  if (!signature || !signature.scale) {
    throw new Error('Impossible de déterminer la gamme : aucune tonalité fournie.');
  }
  return signature.scale;
}

// ---------------------------------------------------------------------------
// API publique — Accords
// ---------------------------------------------------------------------------

/**
 * Parse un symbole d'accord en ChordReference enrichi de l'orthographe exacte.
 * Ne modifie pas parseChordSymbol() de chord-display.js.
 *
 * @param {string} symbol
 * @returns {import('./midi-types.js').ChordReference | null}
 */
export function parseSpelledChordSymbol(symbol) {
  if (!symbol || symbol === 'N') return null;

  const parsed = parseChordSymbol(symbol);
  if (parsed.isN) return null;

  const rootSpelling = spellingFromRawRootInSymbol(symbol, parsed.root);
  const bassSpelling = parsed.bass != null ? spellingFromRawBassInSymbol(symbol, parsed.bass) : null;

  return Object.freeze({
    root: normalizePc(parsed.root),
    quality: parsed.quality || '',
    bass: parsed.bass != null ? normalizePc(parsed.bass) : null,
    rootSpelling,
    bassSpelling,
    originalSymbol: symbol,
  });
}

/**
 * Propose une orthographe contextuelle pour une ChordReference.
 * Respecte la priorité : orthographe explicite > symbole original > contexte tonal > fallback.
 *
 * @param {import('./midi-types.js').ChordReference} chordReference
 * @param {import('./midi-types.js').TonalContext | null} tonalContext
 * @param {{ forceRespelling?: boolean }} [options]
 * @returns {import('./midi-types.js').ChordReference}
 */
export function spellChordReference(chordReference, tonalContext, options = {}) {
  const forceRespelling = options.forceRespelling === true;

  let rootSpelling = chordReference.rootSpelling;
  let bassSpelling = chordReference.bassSpelling;

  if (forceRespelling || !rootSpelling || !rootSpelling.explicit) {
    rootSpelling = spellPitchClass(chordReference.root, tonalContext);
    rootSpelling = createSpelledPitch({
      ...rootSpelling,
      origin: rootSpelling.origin === 'fallback' ? 'key-context' : rootSpelling.origin,
      explicit: chordReference.rootSpelling?.explicit === true && !forceRespelling,
    });
  }

  if (chordReference.bass != null) {
    if (forceRespelling || !bassSpelling || !bassSpelling.explicit) {
      bassSpelling = spellPitchClass(chordReference.bass, tonalContext);
      bassSpelling = createSpelledPitch({
        ...bassSpelling,
        origin: bassSpelling.origin === 'fallback' ? 'key-context' : bassSpelling.origin,
        explicit: chordReference.bassSpelling?.explicit === true && !forceRespelling,
      });
    }
  }

  return Object.freeze({
    root: chordReference.root,
    quality: chordReference.quality,
    bass: chordReference.bass,
    rootSpelling,
    bassSpelling,
    originalSymbol: chordReference.originalSymbol,
  });
}

// ---------------------------------------------------------------------------
// Affichage
// ---------------------------------------------------------------------------

/**
 * Formate un SpelledPitch pour l'affichage (♭ / ♯ / 𝄫 / 𝄪).
 *
 * @param {import('./midi-types.js').SpelledPitch} spelledPitch
 * @param {{ showOctave?: boolean }} [options]
 * @returns {string}
 */
export function formatSpelledPitch(spelledPitch, options = {}) {
  if (!spelledPitch) return '';
  const accidentalChar = {
    '-2': '𝄫',
    '-1': '♭',
    0: '',
    1: '♯',
    2: '𝄪',
  }[String(spelledPitch.accidental)] || '';

  let name = spelledPitch.letter + accidentalChar;
  if (options.showOctave && spelledPitch.octave != null) {
    name += String(spelledPitch.octave);
  }
  return name;
}

// ---------------------------------------------------------------------------
// Helpers privés d'orthographe chromatique et d'extraction de symboles
// ---------------------------------------------------------------------------

function spellChromaticInSignature(pc, scale, fifths) {
  // Trouve le degré diatonique le plus proche en demi-tons.
  let best = null;
  let bestDistance = Infinity;
  for (const degree of scale) {
    const distance = Math.min(
      Math.abs(pc - degree.pitchClass),
      Math.abs(pc - degree.pitchClass + 12),
      Math.abs(pc - degree.pitchClass - 12),
    );
    if (distance < bestDistance) {
      bestDistance = distance;
      best = degree;
    } else if (distance === bestDistance && best) {
      // En cas d'égalité, privilégier la lettre précédente (dièse) si armure
      // à dièses ou nulle, sinon la lettre suivante (bémol).
      if (fifths >= 0) {
        // on garde le premier trouvé (lettre plus basse)
      } else {
        best = degree;
      }
    }
  }

  if (!best) return null;

  const accidental = pc - normalizePc(LETTER_TO_PC[best.letter]);
  if (!VALID_ACCIDENTALS.has(accidental)) return null;

  return createSpelledPitch({
    pitchClass: pc,
    letter: best.letter,
    accidental,
    octave: null,
    origin: 'key-context',
    explicit: best.explicit,
  });
}

function sharpLetterForPc(pc) {
  // Table de correspondance pc → lettre naturelle la plus proche par le haut
  // (C, C#/Db, D, D#/Eb, E, F, F#/Gb, G, G#/Ab, A, A#/Bb, B)
  return ['C', 'C', 'D', 'D', 'E', 'F', 'F', 'G', 'G', 'A', 'A', 'B'][pc];
}

function sharpAccidentalForPc(pc) {
  return [0, 1, 0, 1, 0, 0, 1, 0, 1, 0, 1, 0][pc];
}

function spellingFromRawRootInSymbol(symbol, rootPc) {
  // Extrait la fondamentale telle qu'écrite dans le symbole original.
  const slashIdx = symbol.indexOf('/');
  const chordPart = slashIdx >= 0 ? symbol.slice(0, slashIdx) : symbol;
  const match = chordPart.match(/^([A-G][#b]?)(.*)/);
  if (!match) {
    return createSpelledPitch({
      pitchClass: rootPc,
      letter: sharpLetterForPc(normalizePc(rootPc)),
      accidental: sharpAccidentalForPc(normalizePc(rootPc)),
      octave: null,
      origin: 'chord-symbol',
      explicit: false,
    });
  }

  const raw = match[1];
  const letter = raw.charAt(0).toUpperCase();
  const accidentalStr = raw.slice(1);
  const accidental = accidentalStringToValue(accidentalStr);

  return createSpelledPitch({
    pitchClass: rootPc,
    letter,
    accidental,
    octave: null,
    origin: 'chord-symbol',
    explicit: true,
  });
}

function spellingFromRawBassInSymbol(symbol, bassPc) {
  const slashIdx = symbol.indexOf('/');
  if (slashIdx < 0) return null;
  const bassStr = symbol.slice(slashIdx + 1).trim();
  const match = bassStr.match(/^([A-G][#b]?)$/);
  if (!match) {
    return createSpelledPitch({
      pitchClass: bassPc,
      letter: sharpLetterForPc(normalizePc(bassPc)),
      accidental: sharpAccidentalForPc(normalizePc(bassPc)),
      octave: null,
      origin: 'chord-symbol',
      explicit: false,
    });
  }

  const raw = match[1];
  const letter = raw.charAt(0).toUpperCase();
  const accidental = accidentalStringToValue(raw.slice(1));

  return createSpelledPitch({
    pitchClass: bassPc,
    letter,
    accidental,
    octave: null,
    origin: 'chord-symbol',
    explicit: true,
  });
}

function accidentalStringToValue(str) {
  if (!str) return 0;
  let value = 0;
  for (const ch of str) {
    if (ch === '#') value += 1;
    else if (ch === 'b') value -= 1;
  }
  return value;
}
