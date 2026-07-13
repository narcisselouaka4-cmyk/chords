// Validation hard et mesure soft features du voicing-engine.
// Toutes les fonctions sont pures, aucune dépendance UI.

import {
  LH_HARD_RANGE,
  LH_SOFT_RANGE,
  LH_MAX_SPAN,
  RH_HARD_RANGE,
  RH_SOFT_RANGE,
  RH_MAX_SPAN,
  midiInRange,
  span,
  isIntegerMidi,
} from './hand-ranges.js';

/**
 * @typedef {import('./data-model.js').HandVoicing} HandVoicing
 * @typedef {import('./data-model.js').VoicingCandidate} VoicingCandidate
 */

/**
 * Caractéristiques mesurées pour le scoring soft.
 * Les champs suffixés `Reserved` sont explicitement des placeholders pour des
 * phases ultérieures ; ils ne doivent pas être interprétés comme des mesures
 * fonctionnelles en Phase 0.
 * @typedef {{
 *   lhNotesInSoft: number,
 *   rhNotesInSoft: number,
 *   totalNotesInSoft: number,
 *   lhSpan: number,
 *   rhSpan: number,
 *   totalSpan: number,
 *   bassDistanceFromIdealLowReserved: number,
 *   voiceLeadingCostReserved: number,
 *   completeness: number,
 *   doublings: number,
 *   omissions: number
 * }} SoftConstraintFeatures
 */

/**
 * Vérifie qu'un HandVoicing respecte les contraintes strictes.
 * @param {HandVoicing} handVoicing
 * @returns {import('./data-model.js').ConstraintResult}
 */
export function checkHandHardConstraints(handVoicing) {
  const errors = [];
  const { hand, notes } = handVoicing;
  if (!notes || notes.length === 0) {
    return { valid: true, errors: [] };
  }

  const range = hand === 'LH' ? LH_HARD_RANGE : RH_HARD_RANGE;
  const maxSpan = hand === 'LH' ? LH_MAX_SPAN : RH_MAX_SPAN;

  const nonIntegerNotes = notes.filter((n) => !isIntegerMidi(n));
  if (nonIntegerNotes.length > 0) {
    errors.push(`${hand} notes must be integer MIDI numbers, got: ${nonIntegerNotes.join(',')}`);
  }

  const outOfRange = notes.filter((n) => isIntegerMidi(n) && !midiInRange(n, range));
  if (outOfRange.length > 0) {
    errors.push(`${hand} notes out of hard range ${range.min}-${range.max}: ${outOfRange.join(',')}`);
  }

  const duplicates = notes.filter((n, i) => notes.indexOf(n) !== i);
  if (duplicates.length > 0) {
    errors.push(`${hand} duplicate MIDI notes: ${[...new Set(duplicates)].join(',')}`);
  }

  if (span(notes) > maxSpan) {
    errors.push(`${hand} span ${span(notes)} exceeds max ${maxSpan}`);
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Vérifie qu'une candidate complète respecte les contraintes globales.
 * - Pas de croisement : toutes les notes LH <= toutes les notes RH.
 * - Si l'entrée indique un bassPc, la note la plus grave globale doit être cette hauteur (mod 12).
 * @param {VoicingCandidate} candidate
 * @returns {import('./data-model.js').ConstraintResult}
 */
export function checkCandidateHardConstraints(candidate) {
  const errors = [];
  const { input, lh, rh } = candidate;

  const lhCheck = checkHandHardConstraints(lh);
  const rhCheck = checkHandHardConstraints(rh);
  errors.push(...lhCheck.errors, ...rhCheck.errors);

  const allNotes = [...lh.notes, ...rh.notes];
  if (allNotes.length > 0) {
    // Une main vide ne peut pas croiser l'autre : sa borne est -Infinity/+Infinity.
    // On vérifie explicitement qu'il y a au moins une note de chaque côté avant de comparer.
    const maxLh = lh.notes.length > 0 ? Math.max(...lh.notes) : -Infinity;
    const minRh = rh.notes.length > 0 ? Math.min(...rh.notes) : Infinity;
    if (maxLh > minRh) {
      errors.push(`hand crossing: LH max ${maxLh} > RH min ${minRh}`);
    }

    if (input.bassPc != null) {
      const lowest = Math.min(...allNotes);
      if (lowest % 12 !== input.bassPc) {
        errors.push(`slash bass mismatch: lowest MIDI ${lowest} (${lowest % 12}) != expected pc ${input.bassPc}`);
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Mesure les features soft d'une candidate.
 * @param {VoicingCandidate} candidate
 * @returns {SoftConstraintFeatures}
 */
export function measureSoftConstraintFeatures(candidate) {
  const { input, lh, rh } = candidate;
  const lhNotesInSoft = lh.notes.filter((n) => midiInRange(n, LH_SOFT_RANGE)).length;
  const rhNotesInSoft = rh.notes.filter((n) => midiInRange(n, RH_SOFT_RANGE)).length;

  const allNotes = [...lh.notes, ...rh.notes];
  const uniquePcs = new Set(allNotes.map((n) => n % 12));
  const requiredPcs = new Set(input.chordTonePcs);

  let completeness = 0;
  for (const pc of requiredPcs) {
    if (uniquePcs.has(pc)) completeness += 1;
  }

  const presentRequired = [...uniquePcs].filter((pc) => requiredPcs.has(pc)).length;
  const doublings = allNotes.length - uniquePcs.size;
  const omissions = requiredPcs.size - presentRequired;

  // Distance basse → main droite : information soft, pas un hard constraint.
  // Mesurée ici en demi-tons entre la note globalement la plus grave (toutes
  // mains confondues) et la note la plus grave de la main droite. Quand la
  // main droite est vide, la mesure vaut 0.
  const lowestAll = allNotes.length > 0 ? Math.min(...allNotes) : 0;
  const lowestRh = rh.notes.length > 0 ? Math.min(...rh.notes) : lowestAll;
  const bassToRightGap = rh.notes.length > 0 ? lowestRh - lowestAll : 0;

  return Object.freeze({
    lhNotesInSoft,
    rhNotesInSoft,
    totalNotesInSoft: lhNotesInSoft + rhNotesInSoft,
    lhSpan: span(lh.notes),
    rhSpan: span(rh.notes),
    totalSpan: span(allNotes),
    bassDistanceFromIdealLowReserved: 0,
    voiceLeadingCostReserved: 0,
    bassToRightGap,
    completeness,
    doublings,
    omissions,
  });
}
