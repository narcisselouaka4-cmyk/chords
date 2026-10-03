// Types / data model immuables du voicing-engine.
// Aucun code exécutable, juste des constantes et constructeurs purs.

/**
 * Entrée pure normalisée pour le voicing-engine.
 * @typedef {import('./chord-input.js').NormalizedVoicingInput} VoicingInput
 */

/**
 * Notes MIDI d'une main.
 * @typedef {{ hand: 'LH' | 'RH', notes: number[], metadata: VoicingHandMetadata }} HandVoicing
 */

/**
 * Métadonnées attachées à une main.
 * @typedef {{
 *   rootless: boolean,
 *   omitted?: string[],
 *   doubled?: string[],
 *   source?: string
 * }} VoicingHandMetadata
 */

/**
 * Candidate complète (LH + RH) pour un accord.
 * @typedef {{
 *   input: VoicingInput,
 *   lh: HandVoicing,
 *   rh: HandVoicing,
 *   score: number,
 *   metadata: VoicingCandidateMetadata
 * }} VoicingCandidate
 */

/**
 * Assignation d'une note MIDI a un role harmonique.
 * @typedef {{ midi: number, role: string, hand: 'LH' | 'RH' }} RoleAssignment
 */

/**
 * Métadonnées globales de la candidate.
 * `generatorId` est réservé pour Phase 1+ et reste vide en Phase 0.
 * @typedef {{
 *   generatorId: string,
 *   rootless: boolean,
 *   features: import('./constraints.js').SoftConstraintFeatures,
 *   familyId: string,
 *   displayName: string,
 *   available: boolean,
 *   roleAssignments: RoleAssignment[],
 *   omittedRoles: string[],
 *   doubledRoles: string[],
 *   difficulty: number
 * }} VoicingCandidateMetadata
 */

/**
 * Résultat de validation hard.
 * @typedef {{
 *   valid: boolean,
 *   errors: string[]
 * }} ConstraintResult
 */

/** Métadonnées par défaut pour une main en Phase 0 (rootless toujours false). */
export const DEFAULT_HAND_METADATA = Object.freeze({
  rootless: false,
  omitted: [],
  doubled: [],
  source: '',
});

/** Métadonnées par défaut pour une candidate en Phase 0.
 * Les champs suffixés `Reserved` sont explicitement des placeholders
 * pour des phases ultérieures ; ils ne doivent pas être interprétés comme des
 * mesures fonctionnelles en Phase 0.
 */
export function createDefaultCandidateMetadata() {
  return Object.freeze({
    generatorId: '',
    rootless: false,
    features: {
      lhNotesInSoft: 0,
      rhNotesInSoft: 0,
      totalNotesInSoft: 0,
      lhSpan: 0,
      rhSpan: 0,
      totalSpan: 0,
      bassDistanceFromIdealLowReserved: 0,
      voiceLeadingCostReserved: 0,
      completeness: 0,
      doublings: 0,
      omissions: 0,
    },
    familyId: '',
    displayName: '',
    available: false,
    roleAssignments: Object.freeze([]),
    omittedRoles: Object.freeze([]),
    doubledRoles: Object.freeze([]),
    difficulty: 0,
  });
}

/**
 * Crée un HandVoicing immuable.
 * Rejette les valeurs MIDI non entières (float, NaN, Infinity, chaînes).
 * @param {'LH' | 'RH'} hand
 * @param {number[]} notes
 * @param {Partial<VoicingHandMetadata>} [metadata]
 * @returns {HandVoicing}
 */
export function createHandVoicing(hand, notes, metadata = {}) {
  const bad = notes.find((n) => !Number.isInteger(n));
  if (bad !== undefined) {
    throw new TypeError(`HandVoicing notes must be integer MIDI numbers, got ${bad}`);
  }
  return Object.freeze({
    hand,
    notes: Object.freeze([...notes].sort((a, b) => a - b)),
    metadata: Object.freeze({ ...DEFAULT_HAND_METADATA, ...metadata }),
  });
}

/**
 * Crée une VoicingCandidate immuable.
 * @param {VoicingInput} input
 * @param {HandVoicing} lh
 * @param {HandVoicing} rh
 * @param {number} score
 * @param {Partial<VoicingCandidateMetadata>} [metadata]
 * @returns {VoicingCandidate}
 */
export function createVoicingCandidate(input, lh, rh, score, metadata = {}) {
  const defaults = createDefaultCandidateMetadata();
  return Object.freeze({
    input,
    lh,
    rh,
    score,
    metadata: Object.freeze({
      ...defaults,
      ...metadata,
      features: Object.freeze({ ...defaults.features, ...(metadata.features || {}) }),
    }),
  });
}
