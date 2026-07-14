// Style Simple du Two-Hand Piano Voicing Engine V1.
// Stateless, pur, sans UI. Conçu pour l'apprentissage : pas de Jazz, Gospel,
// voice leading, ni rootless. Dérive tous les rôles depuis rootPc et n'utilise
// jamais la position dans chordTonePcs trié.

import { createHandVoicing, createVoicingCandidate } from '../data-model.js';
import {
  LH_HARD_RANGE,
  LH_SOFT_RANGE,
  RH_HARD_RANGE,
  RH_SOFT_RANGE,
  midiInRange,
  span,
} from '../hand-ranges.js';
import { checkCandidateHardConstraints, measureSoftConstraintFeatures } from '../constraints.js';
import {
  generateRightHandCandidates,
  rankCandidate,
  midiInstancesInRange,
} from '../candidate-generator.js';

/**
 * @typedef {import('../chord-input.js').NormalizedVoicingInput} VoicingInput
 * @typedef {import('../data-model.js').VoicingCandidate} VoicingCandidate
 */

export const SIMPLE_GENERATOR_ID = 'simple-v1';

/** Budget maximal de candidates RH inspectés par accord. */
export const SIMPLE_CANDIDATE_BUDGET = 200;

/** Table canonique V1 des intervalles relatifs à rootPc. */
export const SIMPLE_INTERVALS = Object.freeze({
  '': [0, 4, 7],       // major
  'm': [0, 3, 7],      // minor
  'dim': [0, 3, 6],    // diminished
  'aug': [0, 4, 8],    // augmented
  'sus2': [0, 2, 7],   // sus2
  'sus4': [0, 5, 7],   // sus4
  '7': [0, 4, 7, 10],  // dominant 7
  'maj7': [0, 4, 7, 11], // major 7
  'm7': [0, 3, 7, 10], // minor 7
  'm7b5': [0, 3, 6, 10], // half-diminished 7
});

/**
 * Retourne les intervalles canoniques d'une qualité V1, ou null.
 * @param {string} quality
 * @returns {number[] | null}
 */
export function getCanonicalIntervals(quality) {
  return SIMPLE_INTERVALS[quality] || null;
}

/**
 * Retourne les pitch classes canoniques d'un accord, dérivées depuis rootPc.
 * Le résultat est trié numériquement ; l'appelant ne doit pas interpréter
 * l'ordre comme un ordre de rôles.
 * @param {number} rootPc
 * @param {string} quality
 * @returns {number[] | null}
 */
export function getCanonicalPitchClasses(rootPc, quality) {
  const intervals = getCanonicalIntervals(quality);
  if (!intervals) return null;
  return [...new Set(intervals.map((i) => (rootPc + i) % 12))].sort((a, b) => a - b);
}

/**
 * Retourne la pitch class d'un rôle relatif à rootPc.
 * @param {number} rootPc
 * @param {number} interval
 * @returns {number}
 */
export function getRolePc(rootPc, interval) {
  return (rootPc + interval) % 12;
}

/**
 * Indique si la qualité est une triade.
 * @param {string} quality
 * @returns {boolean}
 */
export function isTriad(quality) {
  const intervals = getCanonicalIntervals(quality);
  return !!intervals && intervals.length === 3;
}

/**
 * Indique si la qualité est un accord de septième.
 * @param {string} quality
 * @returns {boolean}
 */
export function isSeventh(quality) {
  const intervals = getCanonicalIntervals(quality);
  return !!intervals && intervals.length === 4;
}

/**
 * Sélectionne le sous-ensemble de pitch classes pour la main droite Simple.
 * Aucune utilisation de l'index dans chordTonePcs : les rôles sont calculés
 * depuis rootPc.
 *
 * @param {number} rootPc
 * @param {string} quality
 * @param {boolean} bassIsRoot
 * @returns {number[] | null}
 */
export function getSimpleRightHandPitchClasses(rootPc, quality, bassIsRoot) {
  const intervals = getCanonicalIntervals(quality);
  if (!intervals) return null;

  if (isTriad(quality)) {
    // Triades : toutes les pitch classes canoniques en RH.
    return intervals.map((i) => (rootPc + i) % 12);
  }

  if (isSeventh(quality)) {
    if (quality === 'm7b5') {
      if (bassIsRoot) {
        // Fondamentale en LH : RH = b3, b5, b7 (intervalles 3, 6, 10).
        return [3, 6, 10].map((i) => (rootPc + i) % 12);
      }
      // Basse slash non fondamentale : accord complet en RH.
      return intervals.map((i) => (rootPc + i) % 12);
    }

    // 7, maj7, m7 : quinte omise ; on garde root, tierce, septième.
    // Les intervalles canoniques sont [0, 3|4, 7, 10|11].
    const root = 0;
    const third = intervals[1];
    const seventh = intervals[3];
    return [root, third, seventh].map((i) => (rootPc + i) % 12);
  }

  return null;
}

/**
 * Choix médian d'une note dans une liste d'instances MIDI triées.
 * @param {number[]} instances
 * @param {number} center
 * @returns {number | null}
 */
function pickMedianNote(instances, center) {
  if (!instances || instances.length === 0) return null;
  return instances.reduce((best, n) => (Math.abs(n - center) < Math.abs(best - center) ? n : best));
}

/**
 * Construit la main gauche Simple.
 *
 * - Triades avec basse fondamentale : fondamentale + octave si l'octave tient
 *   dans LH_HARD_RANGE, sinon fondamentale seule.
 * - Basse slash non fondamentale : basse seule.
 * - Septièmes : une seule note (fondamentale ou basse slash).
 *
 * @param {VoicingInput} input
 * @returns {{ notes: number[], diagnostics: string[] }}
 */
function buildSimpleLeftHand(input) {
  const diagnostics = [];
  const playedBassPc = input.bassPc ?? input.rootPc;
  const bassIsRoot = input.bassPc == null || input.bassPc === input.rootPc;

  // Fondamentale/basse dans la soft range si possible, sinon hard range.
  let instances = midiInstancesInRange(playedBassPc, LH_SOFT_RANGE.min, LH_SOFT_RANGE.max);
  let source = 'LH_SOFT_RANGE';
  if (instances.length === 0) {
    instances = midiInstancesInRange(playedBassPc, LH_HARD_RANGE.min, LH_HARD_RANGE.max);
    source = 'LH_HARD_RANGE';
  }
  if (instances.length === 0) {
    diagnostics.push(`LH: no MIDI instance found for pc ${playedBassPc}`);
    return { notes: [], diagnostics };
  }

  const bassNote = pickMedianNote(instances, source === 'LH_SOFT_RANGE' ? 42 : 41);

  // Doublure d'octave réservée aux triades avec fondamentale en basse.
  if (isTriad(input.quality) && bassIsRoot) {
    const octave = bassNote + 12;
    if (midiInRange(octave, LH_HARD_RANGE)) {
      diagnostics.push(`LH: ${bassNote},${octave} (pc ${playedBassPc}, ${source}, octave doubled)`);
      return { notes: [bassNote, octave], diagnostics };
    }
    diagnostics.push(`LH: ${bassNote} (pc ${playedBassPc}, ${source}, octave out of range)`);
    return { notes: [bassNote], diagnostics };
  }

  diagnostics.push(`LH: ${bassNote} (pc ${playedBassPc}, ${source})`);
  return { notes: [bassNote], diagnostics };
}

/**
 * Valide que toutes les pitch classes sélectionnées pour la RH appartiennent
 * à l'ensemble canonique de l'accord.
 * @param {number} rootPc
 * @param {string} quality
 * @param {number[]} selectedRhPcs
 * @returns {{ ok: boolean, errors: string[] }}
 */
function validateSelectedPitchClasses(rootPc, quality, selectedRhPcs) {
  const canonical = new Set(getCanonicalPitchClasses(rootPc, quality));
  const errors = [];
  for (const pc of selectedRhPcs) {
    if (!canonical.has(pc)) {
      errors.push(`RH pitch class ${pc} not in canonical set for ${quality}`);
    }
  }
  return { ok: errors.length === 0, errors };
}

/**
 * Calcule omittedPitchClasses par différence d'ensembles concrets.
 * @param {number[]} canonicalPcs
 * @param {number[]} lhNotes
 * @param {number[]} rhNotes
 * @returns {number[]}
 */
export function computeOmittedPitchClasses(canonicalPcs, lhNotes, rhNotes) {
  const presentPcs = new Set([...lhNotes, ...rhNotes].map((n) => n % 12));
  return canonicalPcs.filter((pc) => !presentPcs.has(pc));
}

/**
 * Calcule doubledPitchClasses depuis les notes MIDI réelles.
 * @param {number[]} lhNotes
 * @param {number[]} rhNotes
 * @returns {number[]}
 */
export function computeDoubledPitchClasses(lhNotes, rhNotes) {
  const pcCounts = new Map();
  for (const n of [...lhNotes, ...rhNotes]) {
    const pc = n % 12;
    pcCounts.set(pc, (pcCounts.get(pc) || 0) + 1);
  }
  return [...pcCounts.entries()]
    .filter(([, count]) => count > 1)
    .map(([pc]) => pc)
    .sort((a, b) => a - b);
}

/**
 * Compare deux tuples de classement lexicographiquement (même contrat que Close).
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
 * Génère le voicing Simple-v1 pour une entrée normalisée.
 *
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
export function generateSimpleVoicing(input) {
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

  const playedBassPc = input.bassPc ?? input.rootPc;
  const bassIsRoot = input.bassPc == null || input.bassPc === input.rootPc;

  // Main gauche.
  const lh = buildSimpleLeftHand(input);
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

  // Sous-ensemble RH concret de pitch classes, sans index harmonique.
  const selectedRhPcs = getSimpleRightHandPitchClasses(input.rootPc, input.quality, bassIsRoot);
  if (selectedRhPcs == null) {
    // Ne devrait jamais arriver car la qualité est validée en amont.
    return Object.freeze({
      ok: false,
      input,
      selectedCandidate: null,
      candidatesConsidered: 0,
      candidatesValid: 0,
      diagnostics: Object.freeze([`unknown quality: '${input.quality}'`]),
      rejectionReasons: Object.freeze(['UNSUPPORTED_QUALITY']),
    });
  }

  const validation = validateSelectedPitchClasses(input.rootPc, input.quality, selectedRhPcs);
  if (!validation.ok) {
    return Object.freeze({
      ok: false,
      input,
      selectedCandidate: null,
      candidatesConsidered: 0,
      candidatesValid: 0,
      diagnostics: Object.freeze(validation.errors),
      rejectionReasons: Object.freeze(['INVALID_SIMPLE_VOICING_CONFIGURATION']),
    });
  }

  // On génère les candidates RH à partir du sous-ensemble sélectionné,
  // sans muter l'entrée originale.
  const derivedInput = Object.freeze({
    ...input,
    chordTonePcs: Object.freeze([...selectedRhPcs]),
  });

  const rhGen = generateRightHandCandidates(derivedInput);
  diagnostics.push(...rhGen.diagnostics);

  // Contrôle du budget Simple (le générateur RH respecte déjà le budget Close,
  // mais on tronque défensivement au budget Simple).
  const rhCandidates = rhGen.candidates.slice(0, SIMPLE_CANDIDATE_BUDGET);

  let candidatesConsidered = 0;
  let candidatesValid = 0;
  /** @type {VoicingCandidate[]} */
  const scored = [];
  const rejectionReasons = [];

  for (const rhNotes of rhCandidates) {
    candidatesConsidered++;
    const candidate = createVoicingCandidate(
      input,
      createHandVoicing('LH', lh.notes),
      createHandVoicing('RH', rhNotes),
      0,
      {
        generatorId: SIMPLE_GENERATOR_ID,
        rootless: false,
        style: 'simple',
      },
    );

    // Ajoute les features soft pour le classement (même contrat que Close).
    const features = measureSoftConstraintFeatures(candidate);
    const featured = createVoicingCandidate(
      candidate.input,
      candidate.lh,
      candidate.rh,
      candidate.score,
      {
        ...candidate.metadata,
        features,
      },
    );

    const hard = checkCandidateHardConstraints(featured);
    if (hard.valid) {
      candidatesValid++;
      scored.push(featured);
    } else if (candidatesConsidered <= 5) {
      rejectionReasons.push(`rejected ${rhNotes.join(',')}: ${hard.errors.join('; ')}`);
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
      rejectionReasons: Object.freeze(['NO_VALID_SIMPLE_VOICING', ...rejectionReasons]),
    });
  }

  scored.sort((a, b) => compareRank(rankCandidate(a), rankCandidate(b)));
  const selected = scored[0];

  // Métadonnées calculées depuis le résultat réel.
  const canonicalPcs = getCanonicalPitchClasses(input.rootPc, input.quality) || [];
  const omittedPitchClasses = Object.freeze(
    computeOmittedPitchClasses(
      canonicalPcs,
      selected.lh.notes,
      selected.rh.notes,
    ),
  );
  const doubledPitchClasses = Object.freeze(
    computeDoubledPitchClasses(
      selected.lh.notes,
      selected.rh.notes,
    ),
  );
  const interHandDoubled = Object.freeze(
    selected.lh.notes
      .filter((n) => selected.rh.notes.some((r) => r % 12 === n % 12))
      .map((n) => n % 12)
      .sort((a, b) => a - b),
  );
  const inversion = selected.rh.notes.length > 0 ? (selected.rh.notes[0] % 12) : 0;

  const enriched = createVoicingCandidate(
    selected.input,
    createHandVoicing('LH', selected.lh.notes, {
      ...selected.lh.metadata,
      source: SIMPLE_GENERATOR_ID,
    }),
    createHandVoicing('RH', selected.rh.notes, {
      ...selected.rh.metadata,
      source: SIMPLE_GENERATOR_ID,
    }),
    selected.score,
    {
      ...selected.metadata,
      generatorId: SIMPLE_GENERATOR_ID,
      rootless: false,
      style: 'simple',
      inversion,
      omittedPitchClasses,
      doubledPitchClasses,
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

export { generateSimpleVoicing as default };
