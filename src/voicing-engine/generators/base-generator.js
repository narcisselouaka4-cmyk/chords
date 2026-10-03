// Helpers communs aux generateurs de voicings par famille.

import { createHandVoicing, createVoicingCandidate } from '../data-model.js';
import { buildBassNote, placeNearCenter, midiInstancesInRange, pickNearest } from '../utils/midi-placement.js';
import { LH_HARD_RANGE, RH_SOFT_RANGE, RH_HARD_RANGE } from '../hand-ranges.js';
import { resolveRoles } from '../families/role-map.js';

/** @typedef {import('../chord-input.js').NormalizedVoicingInput} VoicingInput */
/** @typedef {import('../data-model.js').VoicingCandidate} VoicingCandidate */

/**
 * @typedef {{
 *   candidate: VoicingCandidate | null,
 *   diagnostics: string[],
 *   available: boolean,
 *   reason?: string
 * }} GeneratorResult
 */

/**
 * Cree un resultat de generateur valide.
 * @param {VoicingCandidate} candidate
 * @param {string[]} diagnostics
 * @returns {GeneratorResult}
 */
export function successResult(candidate, diagnostics = []) {
  return { candidate, diagnostics, available: true };
}

/**
 * Cree un resultat de generateur indisponible.
 * @param {string} reason
 * @param {string[]} diagnostics
 * @returns {GeneratorResult}
 */
export function unavailableResult(reason, diagnostics = []) {
  return { candidate: null, diagnostics, available: false, reason };
}

/**
 * Construit la main gauche standard avec la fondamentale/basse.
 * @param {VoicingInput} input
 * @returns {{ hand: import('../data-model.js').HandVoicing | null, diagnostics: string[] }}
 */
export function buildStandardLeftHand(input) {
  const { note, diagnostics } = buildBassNote(input);
  if (note == null) {
    return { hand: null, diagnostics };
  }
  const hand = createHandVoicing('LH', [note], { source: 'bass' });
  return { hand, diagnostics };
}

/**
 * Place la fondamentale/basse juste en dessous d'une note de reference,
 * typiquement l'octave immediatement inferieure au RH pour les voicings compacts.
 * @param {VoicingInput} input
 * @param {number} referenceMidi
 * @returns {{ note: number | null, diagnostics: string[] }}
 */
export function buildBassBelow(input, referenceMidi) {
  const diagnostics = [];
  const targetPc = input.bassPc ?? input.rootPc;
  const instances = midiInstancesInRange(targetPc, LH_HARD_RANGE.min, LH_HARD_RANGE.max)
    .filter((n) => n < referenceMidi);
  if (instances.length === 0) {
    diagnostics.push(`LH: impossible de placer la basse pc ${targetPc} sous ${referenceMidi}`);
    return { note: null, diagnostics };
  }
  // Choisit l'instance de basse immediatement inferieure au RH pour un ecart
  // LH/RH musical et compact (pas de trou artificiel de plusieurs octaves).
  const note = instances[instances.length - 1];
  diagnostics.push(`LH: ${note} (pc ${targetPc}, placee sous ${referenceMidi})`);
  return { note, diagnostics };
}

/**
 * Choisit un centre de registre pour la main droite.
 * Prefere RH_SOFT_RANGE autour de C4/E4.
 * @returns {number}
 */
export function defaultRhCenter() {
  return 60;
}

/**
 * Place une liste de pitch classes dans la tessiture RH autour d'un centre.
 * @param {number[]} pcs
 * @param {number} center
 * @returns {number[] | null}
 */
export function placeRightHandPcs(pcs, center) {
  const notes = [];
  for (const pc of pcs) {
    const instances = midiInstancesInRange(pc, RH_HARD_RANGE.min, RH_HARD_RANGE.max);
    if (instances.length === 0) return null;
    const note = pickNearest(instances, center);
    notes.push(note);
  }
  // Ajuste pour que les notes soient strictement croissantes et proches les unes des autres.
  const adjusted = [];
  for (let i = 0; i < notes.length; i++) {
    const pc = pcs[i];
    let note = notes[i];
    while (adjusted.length > 0 && note <= adjusted[adjusted.length - 1]) {
      note += 12;
    }
    if (!midiInstancesInRange(pc % 12, RH_HARD_RANGE.min, RH_HARD_RANGE.max).includes(note)) {
      return null;
    }
    adjusted.push(note);
  }
  return adjusted;
}

/**
 * Construit une candidate a partir de LH/RH, d'une famille et de metadata.
 * @param {VoicingInput} input
 * @param {import('../data-model.js').HandVoicing} lh
 * @param {import('../data-model.js').HandVoicing} rh
 * @param {string} familyId
 * @param {string} displayName
 * @param {object} extraMetadata
 * @returns {VoicingCandidate}
 */
export function buildCandidate(input, lh, rh, familyId, displayName, extraMetadata = {}) {
  const allNotes = [...lh.notes, ...rh.notes];
  const uniquePcs = new Set(allNotes.map((n) => n % 12));
  const roleMap = resolveRoles(input);

  /** @type {Array<{ midi: number, role: string, hand: 'LH' | 'RH' }>} */
  const roleAssignments = [];
  for (const note of lh.notes) {
    const role = Object.keys(roleMap).find((r) => roleMap[r] === note % 12) || 'unknown';
    roleAssignments.push({ midi: note, role, hand: 'LH' });
  }
  for (const note of rh.notes) {
    const role = Object.keys(roleMap).find((r) => roleMap[r] === note % 12) || 'unknown';
    roleAssignments.push({ midi: note, role, hand: 'RH' });
  }

  const presentRoles = roleAssignments.map((a) => a.role);
  const omittedRoles = Object.keys(roleMap).filter((role) =>
    roleMap[role] != null && !presentRoles.includes(role)
  );

  const doubledRoles = [];
  const counts = {};
  for (const a of roleAssignments) {
    counts[a.role] = (counts[a.role] || 0) + 1;
  }
  for (const [role, count] of Object.entries(counts)) {
    if (count > 1) doubledRoles.push(role);
  }

  return createVoicingCandidate(
    input,
    lh,
    rh,
    0,
    {
      familyId,
      displayName,
      available: true,
      roleAssignments: Object.freeze(roleAssignments),
      omittedRoles: Object.freeze(omittedRoles),
      doubledRoles: Object.freeze(doubledRoles),
      difficulty: 0,
      ...extraMetadata,
    }
  );
}
