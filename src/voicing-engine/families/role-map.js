// Carte des intervalles harmoniques vers roles musicaux.
// Utilisee par tous les generateurs pour decrire un accord en termes de roles
// plutot qu'en simples pitch classes.

import { resolveCanonicalChordDefinition } from '../../chord-engine/chord-display.js';

/** @typedef {import('../chord-input.js').NormalizedVoicingInput} VoicingInput */

export const ROLE_INTERVALS = Object.freeze({
  root: 0,
  thirdMinor: 3,
  thirdMajor: 4,
  fourth: 5,
  fifthDiminished: 6,
  fifthPerfect: 7,
  fifthAugmented: 8,
  sixthMinor: 8,
  sixthMajor: 9,
  seventhMinor: 10,
  seventhMajor: 11,
  ninthMinor: 1,    // b9 = 13 mod 12
  ninthMajor: 2,    // 9  = 14 mod 12
  ninthAugmented: 3, // #9 = 15 mod 12
  eleventhPerfect: 5, // 11 = 17 mod 12
  eleventhAugmented: 6, // #11 = 18 mod 12
  thirteenthMinor: 8,   // b13 = 20 mod 12
  thirteenthMajor: 9,   // 13  = 21 mod 12
});

const INTERVAL_TO_ROLE = Object.freeze({
  0: 'root',
  3: 'thirdMinor',
  4: 'thirdMajor',
  5: 'fourth',
  6: 'fifthDiminished',
  7: 'fifthPerfect',
  8: 'fifthAugmented',
  9: 'sixthMajor',
  10: 'seventhMinor',
  11: 'seventhMajor',
  1: 'ninthMinor',
  2: 'ninthMajor',
  13: 'ninthMinor', // fallback non normalise
  14: 'ninthMajor',
  15: 'ninthAugmented',
  17: 'eleventhPerfect',
  18: 'eleventhAugmented',
  20: 'thirteenthMinor',
  21: 'thirteenthMajor',
});

/**
 * Mapping brut intervalle (en demi-tons depuis la fondamentale) vers role generique.
 * Utilise la definition canonique de l'accord, qui conserve les intervalles bruts,
 * evitant ainsi les ambiguites dues a la reduction modulo 12 (ex: #9 vs tierce mineure).
 */
const INTERVAL_TO_GENERIC_ROLE = Object.freeze({
  0: 'root',
  3: 'third',
  4: 'third',
  6: 'fifth',
  7: 'fifth',
  8: 'fifth',
  10: 'seventh',
  11: 'seventh',
  13: 'ninth',
  14: 'ninth',
  15: 'ninth',
  17: 'eleventh',
  18: 'eleventh',
  20: 'thirteenth',
  21: 'thirteenth',
});

/**
 * Retourne le role principal associe a un intervalle relatif a la fondamentale.
 * Accepte les intervalles bruts (ex. 14 pour 9e) ou normalises (ex. 2).
 * @param {number} interval
 * @returns {string | null}
 */
export function intervalToRole(interval) {
  return INTERVAL_TO_ROLE[interval % 12] || null;
}

/**
 * Determine la tierce d'un accord (majeure ou mineure) a partir de ses pitch classes.
 * @param {VoicingInput} input
 * @returns {number | null} pitch class de la tierce, ou null.
 */
export function thirdPcOf(input) {
  const pc = input.chordTonePcs.find(function (p) {
    const interval = (p - input.rootPc + 12) % 12;
    return interval === ROLE_INTERVALS.thirdMinor || interval === ROLE_INTERVALS.thirdMajor;
  });
  return pc === undefined ? null : pc;
}

/**
 * Determine la septieme d'un accord (mineure ou majeure).
 * @param {VoicingInput} input
 * @returns {number | null}
 */
export function seventhPcOf(input) {
  const pc = input.chordTonePcs.find(function (p) {
    const interval = (p - input.rootPc + 12) % 12;
    return interval === ROLE_INTERVALS.seventhMinor || interval === ROLE_INTERVALS.seventhMajor;
  });
  return pc === undefined ? null : pc;
}

/**
 * Determine la quinte d'un accord (dim, juste, aug).
 * @param {VoicingInput} input
 * @returns {number | null}
 */
export function fifthPcOf(input) {
  const pc = input.chordTonePcs.find(function (p) {
    const interval = (p - input.rootPc + 12) % 12;
    return interval === ROLE_INTERVALS.fifthDiminished
      || interval === ROLE_INTERVALS.fifthPerfect
      || interval === ROLE_INTERVALS.fifthAugmented;
  });
  return pc === undefined ? null : pc;
}

/**
 * Determine la neuvieme d'un accord (b9, 9, #9).
 * @param {VoicingInput} input
 * @returns {number | null}
 */
export function ninthPcOf(input) {
  const pc = input.chordTonePcs.find(function (p) {
    const interval = (p - input.rootPc + 12) % 12;
    return interval === ROLE_INTERVALS.ninthMinor
      || interval === ROLE_INTERVALS.ninthMajor
      || interval === ROLE_INTERVALS.ninthAugmented;
  });
  return pc === undefined ? null : pc;
}

/**
 * Determine la onzieme d'un accord (11, #11).
 * @param {VoicingInput} input
 * @returns {number | null}
 */
export function eleventhPcOf(input) {
  const pc = input.chordTonePcs.find(function (p) {
    const interval = (p - input.rootPc + 12) % 12;
    return interval === ROLE_INTERVALS.eleventhPerfect || interval === ROLE_INTERVALS.eleventhAugmented;
  });
  return pc === undefined ? null : pc;
}

/**
 * Determine la treizieme d'un accord (b13, 13).
 * @param {VoicingInput} input
 * @returns {number | null}
 */
export function thirteenthPcOf(input) {
  const pc = input.chordTonePcs.find(function (p) {
    const interval = (p - input.rootPc + 12) % 12;
    return interval === ROLE_INTERVALS.thirteenthMinor || interval === ROLE_INTERVALS.thirteenthMajor;
  });
  return pc === undefined ? null : pc;
}

/**
 * Construit les roles a partir de la definition canonique de l'accord.
 * Les intervalles bruts (non reduits modulo 12) permettent de distinguer
 * une tierce mineure d'une #9, une sixte d'une 13e, etc.
 * @param {VoicingInput} input
 * @returns {Record<string, number | null> | null}
 */
function rolesFromDefinition(input) {
  const def = resolveCanonicalChordDefinition(input.quality);
  if (!def) return null;

  const roles = {
    root: input.rootPc,
    third: null,
    fifth: null,
    seventh: null,
    ninth: null,
    eleventh: null,
    thirteenth: null,
  };

  for (const interval of def.intervals) {
    const role = INTERVAL_TO_GENERIC_ROLE[interval];
    if (!role) continue;
    const pc = (input.rootPc + interval) % 12;
    if (roles[role] == null) {
      roles[role] = pc;
    }
  }

  return Object.freeze(roles);
}

/**
 * Fallback quand aucune definition canonique n'est disponible.
 * Deduit les roles depuis chordTonePcs et exclut les extensions deja utilisees
 * par les roles fondamentaux.
 * @param {VoicingInput} input
 * @returns {Record<string, number | null>}
 */
function resolveRolesFallback(input) {
  const root = input.rootPc;
  const third = thirdPcOf(input);
  const fifth = fifthPcOf(input);
  const seventh = seventhPcOf(input);
  const usedPcs = new Set([root, third, fifth, seventh].filter((pc) => pc != null));

  const ninth = ninthPcOf(input);
  const eleventh = eleventhPcOf(input);
  const thirteenth = thirteenthPcOf(input);

  return Object.freeze({
    root,
    third,
    fifth,
    seventh,
    ninth: ninth != null && !usedPcs.has(ninth) ? ninth : null,
    eleventh: eleventh != null && !usedPcs.has(eleventh) ? eleventh : null,
    thirteenth: thirteenth != null && !usedPcs.has(thirteenth) ? thirteenth : null,
  });
}

/**
 * Retourne un objet { role: pitchClass } pour tous les roles presents dans l'accord.
 * Les roles absents valent null.
 * Prefere la definition canonique de l'accord (intervalles bruts) pour eviter
 * les ambiguites modulo 12 ; fallback sur chordTonePcs si necessaire.
 * @param {VoicingInput} input
 * @returns {Record<string, number | null>}
 */
export function resolveRoles(input) {
  return rolesFromDefinition(input) || resolveRolesFallback(input);
}

/**
 * Indique si un accord possede au moins une tierce et une septieme.
 * @param {VoicingInput} input
 * @returns {boolean}
 */
export function hasThirdAndSeventh(input) {
  const roles = resolveRoles(input);
  return roles.third !== null && roles.seventh !== null;
}

/**
 * Indique si un accord possede une neuvieme (b9, 9 ou #9).
 * @param {VoicingInput} input
 * @returns {boolean}
 */
export function hasNinth(input) {
  return resolveRoles(input).ninth !== null;
}

/**
 * Indique si l'accord a au moins 4 notes distinctes (pas de doublures d'octave).
 * @param {VoicingInput} input
 * @returns {boolean}
 */
export function hasAtLeastFourNotes(input) {
  return input.chordTonePcs.length >= 4;
}
