// Validateur generique du pipeline de voicings.

import {
  allNotes,
  validateNotesBelongToChord,
  validateNoUselessNotes,
  validateVoiceCount,
  validateHandRanges,
  validateNoHandCrossing,
  validateSlashBass,
  validateVoiceOrdering,
  validateRegisterContinuity,
  combineValidationResults,
} from '../utils/voicing-utils.js';

/** @typedef {import('../data-model.js').VoicingCandidate} VoicingCandidate */
/** @typedef {import('../families/specifications.js').VoicingFamilySpec} VoicingFamilySpec */

/**
 * Resultat de validation.
 * @typedef {{ ok: boolean, errors: string[] }} ValidationResult
 */

/**
 * Valide une candidate selon la specification de sa famille.
 * Ordre explicite : structure generique, puis validateur specifique a la famille.
 * @param {VoicingCandidate} candidate
 * @param {VoicingFamilySpec} spec
 * @param {(candidate: VoicingCandidate, spec: VoicingFamilySpec) => ValidationResult} familyValidator
 * @returns {ValidationResult}
 */
export function validateVoicing(candidate, spec, familyValidator) {
  const generic = combineValidationResults([
    validateNotesBelongToChord(candidate),
    validateNoUselessNotes(candidate),
    validateVoiceCount(candidate, spec.minVoices, spec.maxVoices, spec.voiceCountScope),
    validateHandRanges(candidate, spec.handRangeOptions),
    validateNoHandCrossing(candidate),
    validateSlashBass(candidate),
    validateVoiceOrdering(candidate),
    spec.allowsRegisterGaps ? { ok: true, errors: [] } : validateRegisterContinuity(candidate),
  ]);

  if (!generic.ok) {
    return generic;
  }

  const specific = familyValidator(candidate, spec);
  if (!specific.ok) {
    return specific;
  }

  return { ok: true, errors: [] };
}

/**
 * Pipeline complet : identification (noop ici, la famille est connue) puis validation.
 * @param {VoicingCandidate} candidate
 * @param {VoicingFamilySpec} spec
 * @param {(candidate: VoicingCandidate, spec: VoicingFamilySpec) => ValidationResult} familyValidator
 * @returns {ValidationResult}
 */
export function identifyAndValidate(candidate, spec, familyValidator) {
  return validateVoicing(candidate, spec, familyValidator);
}
