// Générateur de candidates close-v1 pour le Two-Hand Piano Voicing Engine.
// Stateless, pur, sans UI. Produit des candidates immuables validées.

import { createHandVoicing, createVoicingCandidate } from './data-model.js';
import {
  LH_HARD_RANGE,
  LH_SOFT_RANGE,
  RH_HARD_RANGE,
  RH_SOFT_RANGE,
  RH_MAX_SPAN,
  midiInRange,
  span,
} from './hand-ranges.js';
import { checkCandidateHardConstraints, measureSoftConstraintFeatures } from './constraints.js';

/**
 * @typedef {import('./chord-input.js').NormalizedVoicingInput} VoicingInput
 * @typedef {import('./data-model.js').VoicingCandidate} VoicingCandidate
 */

export const CLOSE_GENERATOR_ID = 'close-v1';

/** Budget maximal de candidates RH inspectés par accord. */
export const CLOSE_CANDIDATE_BUDGET = 200;

/** Centre de registre de référence pour la main droite (C4). */
export const RH_TARGET_CENTER = 60;

/**
 * Génère toutes les instances MIDI d'une pitch class dans une plage.
 * @param {number} pc
 * @param {number} minMidi
 * @param {number} maxMidi
 * @returns {number[]}
 */
export function midiInstancesInRange(pc, minMidi, maxMidi) {
  const notes = [];
  let first = minMidi + ((pc - (minMidi % 12) + 12) % 12);
  if (first < minMidi) first += 12;
  for (let m = first; m <= maxMidi; m += 12) {
    notes.push(m);
  }
  return notes;
}

/**
 * Construit la main gauche Close-v1 : exactement une note.
 * - Si bassPc est défini : note la plus confortable dans LH_SOFT_RANGE,
 *   sinon dans LH_HARD_RANGE.
 * - Sinon : fondamentale dans LH_SOFT_RANGE si possible, sinon LH_HARD_RANGE.
 * @param {VoicingInput} input
 * @returns {{ notes: number[], diagnostics: string[] }}
 */
function buildLeftHand(input) {
  const diagnostics = [];
  const targetPc = input.bassPc != null ? input.bassPc : input.rootPc;
  let candidates = midiInstancesInRange(targetPc, LH_SOFT_RANGE.min, LH_SOFT_RANGE.max);
  let source = 'LH_SOFT_RANGE';
  if (candidates.length === 0) {
    candidates = midiInstancesInRange(targetPc, LH_HARD_RANGE.min, LH_HARD_RANGE.max);
    source = 'LH_HARD_RANGE';
  }
  if (candidates.length === 0) {
    diagnostics.push(`LH: no MIDI instance found for pc ${targetPc}`);
    return { notes: [], diagnostics };
  }
  // Préfère l'octave confortable médiane : proche du centre C3 (48).
  const center = source === 'LH_SOFT_RANGE' ? 42 : 41;
  const note = candidates.reduce((best, n) => (Math.abs(n - center) < Math.abs(best - center) ? n : best));
  diagnostics.push(`LH: ${note} (pc ${targetPc}, ${source})`);
  return { notes: [note], diagnostics };
}

/**
 * Génère les rotations (inversions) d'un ensemble de pitch classes.
 * Chaque rotation est un tableau de pitch classes ordonnées en partant d'une
 * note différente, avec l'ordre ascendant mod 12 préservé.
 * @param {number[]} pcs
 * @returns {number[][]}
 */
export function generateRotations(pcs) {
  if (!pcs || pcs.length === 0) return [];
  const sorted = [...pcs].sort((a, b) => a - b);
  const rotations = [];
  for (let i = 0; i < sorted.length; i++) {
    const rotation = [];
    for (let j = 0; j < sorted.length; j++) {
      const pc = sorted[(i + j) % sorted.length];
      // L'inversion de départ reste dans [0,11], les suivantes montent d'une
      // octave quand elles descendent par rapport à la précédente, afin de
      // préserver l'ordre MIDI strictement croissant.
      const prev = j === 0 ? -Infinity : rotation[j - 1];
      let shifted = pc;
      while (shifted <= prev) shifted += 12;
      rotation.push(shifted);
    }
    rotations.push(rotation);
  }
  return rotations;
}

/**
 * Convertit une rotation relative (pitch classes exprimées avec octaves
 * relatifs 0..23) en candidates MIDI concrètes dans la plage RH, en plaçant
 * chaque note de la rotation dans toutes les octaves compatibles.
 * @param {number[]} relativePcs
 * @param {number} minMidi
 * @param {number} maxMidi
 * @param {number} maxSpan
 * @returns {number[][]}
 */
function concreteRotationsFromRelative(relativePcs, minMidi, maxMidi, maxSpan) {
  const allInstances = relativePcs.map((rpc) => midiInstancesInRange(rpc % 12, minMidi, maxMidi));
  /** @type {number[][]} */
  const results = [];

  function backtrack(index, current) {
    if (index === relativePcs.length) {
      results.push([...current]);
      return;
    }
    for (const m of allInstances[index]) {
      if (current.length > 0 && m <= current[current.length - 1]) continue;
      current.push(m);
      backtrack(index + 1, current);
      current.pop();
    }
  }

  backtrack(0, []);
  return results.filter((notes) => span(notes) <= maxSpan);
}

/**
 * Génère les candidates de main droite close pour un accord donné.
 * Conserve toutes les inversions pertinentes (au plus n) et les place dans
 * toutes les octaves compatibles avec RH_HARD_RANGE, avec span ≤ RH_MAX_SPAN.
 * @param {VoicingInput} input
 * @returns {{ candidates: number[][], diagnostics: string[] }}
 */
export function generateRightHandCandidates(input) {
  const diagnostics = [];
  const pcs = input.chordTonePcs;
  if (pcs.length === 0) {
    diagnostics.push('RH: no chord tones available');
    return { candidates: [], diagnostics };
  }

  const rotations = generateRotations(pcs);
  /** @type {number[][]} */
  const all = [];
  for (const rot of rotations) {
    const concrete = concreteRotationsFromRelative(rot, RH_HARD_RANGE.min, RH_HARD_RANGE.max, RH_MAX_SPAN);
    all.push(...concrete);
    if (all.length > CLOSE_CANDIDATE_BUDGET) {
      diagnostics.push(`RH: candidate budget exceeded (${CLOSE_CANDIDATE_BUDGET}), truncating`);
      break;
    }
  }

  diagnostics.push(`RH: ${all.length} concrete candidates from ${rotations.length} rotations`);
  return { candidates: all.slice(0, CLOSE_CANDIDATE_BUDGET), diagnostics };
}

/**
 * Tuple de classement lexicographique déterministe pour une candidate.
 * Ordre (du plus petit au plus grand) :
 * 1. violation hard (0 = valide, 1 = invalide)
 * 2. notes RH hors soft range
 * 3. distance totale des notes RH à la soft range
 * 4. span RH
 * 5. distance du centre de gravité RH à RH_TARGET_CENTER
 * 6. note RH la plus grave
 * 7. ordre lexicographique des notes RH
 * @param {VoicingCandidate} candidate
 * @returns {number[]}
 */
export function rankCandidate(candidate) {
  const { rh } = candidate;
  const hard = checkCandidateHardConstraints(candidate);
  const rhOutOfSoft = rh.notes.filter((n) => !midiInRange(n, RH_SOFT_RANGE)).length;
  const rhSoftDistance = rh.notes.reduce((sum, n) => {
    if (n < RH_SOFT_RANGE.min) return sum + RH_SOFT_RANGE.min - n;
    if (n > RH_SOFT_RANGE.max) return sum + n - RH_SOFT_RANGE.max;
    return sum;
  }, 0);
  const rhSpan = span(rh.notes);
  const centroid = rh.notes.length > 0 ? rh.notes.reduce((a, b) => a + b, 0) / rh.notes.length : 0;
  const centerDistance = Math.abs(centroid - RH_TARGET_CENTER);
  const lowestRh = rh.notes.length > 0 ? rh.notes[0] : 0;
  return [
    hard.valid ? 0 : 1,
    rhOutOfSoft,
    rhSoftDistance,
    rhSpan,
    centerDistance,
    lowestRh,
    ...rh.notes,
  ];
}

/**
 * Compare deux tuples de classement lexicographiquement.
 * @param {number[]} a
 * @param {number[]} b
 * @returns {number}
 */
function compareRank(a, b) {
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const av = a[i] ?? 0;
    const bv = b[i] ?? 0;
    if (av !== bv) return av - bv;
  }
  return 0;
}

/**
 * Génère le voicing close-v1 pour une entrée normalisée.
 * @param {VoicingInput} input
 * @returns {{
 *   ok: boolean,
 *   input: VoicingInput,
 *   selectedCandidate: VoicingCandidate | null,
 *   candidatesConsidered: number,
 *   candidatesValid: number,
 *   diagnostics: string[],
 *   rejectionReasons?: string[]
 * }}
 */
export function generateCloseVoicing(input) {
  const diagnostics = [];
  if (!input || !input.valid) {
  return Object.freeze({
    ok: false,
    input,
    selectedCandidate: null,
    candidatesConsidered: 0,
    candidatesValid: 0,
    diagnostics: Object.freeze(['input is invalid or missing']),
    rejectionReasons: Object.freeze(['INVALID_INPUT']),
  });
}

  const lh = buildLeftHand(input);
  diagnostics.push(...lh.diagnostics);
  if (lh.notes.length === 0) {
    return Object.freeze({
      ok: false,
      input,
      selectedCandidate: null,
      candidatesConsidered: 0,
      candidatesValid: 0,
      diagnostics: Object.freeze(diagnostics),
      rejectionReasons: Object.freeze(['NO_VALID_LH_BASS']),
    });
  }

  const rh = generateRightHandCandidates(input);
  diagnostics.push(...rh.diagnostics);

  let candidatesConsidered = 0;
  let candidatesValid = 0;
  /** @type {VoicingCandidate[]} */
  const scored = [];
  const rejectionReasons = [];

  for (const rhNotes of rh.candidates) {
    candidatesConsidered++;
    const candidate = createVoicingCandidate(
      input,
      createHandVoicing('LH', lh.notes),
      createHandVoicing('RH', rhNotes),
      0,
      {
        generatorId: CLOSE_GENERATOR_ID,
        rootless: false,
      },
    );
    const hard = checkCandidateHardConstraints(candidate);
    if (hard.valid) {
      candidatesValid++;
      scored.push(candidate);
    } else {
      if (candidatesConsidered <= 5) {
        rejectionReasons.push(`rejected ${rhNotes.join(',')}: ${hard.errors.join('; ')}`);
      }
    }
  }

  if (scored.length === 0) {
    return Object.freeze({
      ok: false,
      input,
      selectedCandidate: null,
      candidatesConsidered,
      candidatesValid,
      diagnostics: Object.freeze(diagnostics),
      rejectionReasons: Object.freeze(['NO_VALID_CLOSE_VOICING', ...rejectionReasons]),
    });
  }

  scored.sort((a, b) => compareRank(rankCandidate(a), rankCandidate(b)));
  const selected = scored[0];

  // Métadonnées Phase 1 enrichies.
  const interHandDoubled = selected.lh.notes.filter((n) => selected.rh.notes.some((r) => r % 12 === n % 12)).map((n) => n % 12);
  const inversion = selected.rh.notes.length > 0 ? (selected.rh.notes[0] % 12) : 0;
  const enriched = createVoicingCandidate(
    selected.input,
    createHandVoicing('LH', selected.lh.notes, {
      ...selected.lh.metadata,
      source: CLOSE_GENERATOR_ID,
    }),
    createHandVoicing('RH', selected.rh.notes, {
      ...selected.rh.metadata,
      source: CLOSE_GENERATOR_ID,
    }),
    selected.score,
    {
      ...selected.metadata,
      generatorId: CLOSE_GENERATOR_ID,
      rootless: false,
      style: 'close',
      inversion,
      omittedPitchClasses: [],
      doubledPitchClasses: [],
      interHandDoubledPitchClasses: interHandDoubled,
    },
  );

  return Object.freeze({
    ok: true,
    input,
    selectedCandidate: enriched,
    candidatesConsidered,
    candidatesValid,
    diagnostics: Object.freeze(diagnostics),
    rejectionReasons: Object.freeze(rejectionReasons),
  });
}
