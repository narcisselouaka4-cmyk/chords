// API publique Phase 1 du Two-Hand Piano Voicing Engine.
// Reçoit un symbole d'accord ou un VoicingInput normalisé et retourne un
// voicing close-v1 déterministe, stateless, sans UI.

import { normalizeVoicingInput, normalizeVoicingInputFromSymbol } from './chord-input.js';
import { generateCloseVoicing, CLOSE_GENERATOR_ID } from './candidate-generator.js';
import { isSupportedInV1 } from './vocabulary.js';

/**
 * @typedef {import('./chord-input.js').NormalizedVoicingInput} VoicingInput
 */

/**
 * Génère un voicing close-v1 à partir d'un symbole d'accord.
 * @param {string} chordSymbol
 * @returns {ReturnType<typeof generateCloseVoicing>}
 */
export function generateVoicingFromSymbol(chordSymbol) {
  const input = normalizeVoicingInputFromSymbol(chordSymbol);
  if (!input.valid) return generateCloseVoicing(input);
  if (!isSupportedInV1(input.quality)) {
    return Object.freeze({
      ok: false,
      input,
      selectedCandidate: null,
      candidatesConsidered: 0,
      candidatesValid: 0,
      diagnostics: Object.freeze([`quality '${input.quality}' is not supported in V1`]),
      rejectionReasons: Object.freeze(['UNSUPPORTED_QUALITY']),
    });
  }
  return generateCloseVoicing(input);
}

/**
 * Génère un voicing close-v1 à partir d'un objet brut.
 * @param {{ rootPc: number, quality: string, bassPc?: number|null }} rawInput
 * @returns {ReturnType<typeof generateCloseVoicing>}
 */
export function generateVoicing(rawInput) {
  const input = normalizeVoicingInput(rawInput);
  if (!input.valid) return generateCloseVoicing(input);
  if (!isSupportedInV1(input.quality)) {
    return Object.freeze({
      ok: false,
      input,
      selectedCandidate: null,
      candidatesConsidered: 0,
      candidatesValid: 0,
      diagnostics: Object.freeze([`quality '${input.quality}' is not supported in V1`]),
      rejectionReasons: Object.freeze(['UNSUPPORTED_QUALITY']),
    });
  }
  return generateCloseVoicing(input);
}

export { CLOSE_GENERATOR_ID, generateCloseVoicing };
