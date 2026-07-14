// API publique Phase 1 du Two-Hand Piano Voicing Engine.
// Reçoit un symbole d'accord ou un VoicingInput normalisé et retourne un
// voicing close-v1 déterministe, stateless, sans UI.

import { normalizeVoicingInput, normalizeVoicingInputFromSymbol } from './chord-input.js';
import { generateCloseVoicing, CLOSE_GENERATOR_ID } from './candidate-generator.js';
import { generateSimpleVoicing } from './styles/simple.js';
import { isSupportedInV1 } from './vocabulary.js';

/**
 * @typedef {import('./chord-input.js').NormalizedVoicingInput} VoicingInput
 */

/**
 * Génère un voicing close-v1 à partir d'un symbole d'accord.
 * @param {string} chordSymbol
 * @returns {ReturnType<typeof generateCloseVoicing>}
 */
export function generateVoicingFromSymbol(chordSymbol, options = {}) {
  const input = normalizeVoicingInputFromSymbol(chordSymbol);
  return dispatchVoicing(input, options);
}

/**
 * Génère un voicing à partir d'un objet brut.
 * @param {{ rootPc: number, quality: string, bassPc?: number|null }} rawInput
 * @param {{ style?: string }} [options]
 * @returns {ReturnType<typeof generateCloseVoicing> | ReturnType<typeof generateSimpleVoicing>}
 */
export function generateVoicing(rawInput, options = {}) {
  const input = normalizeVoicingInput(rawInput);
  return dispatchVoicing(input, options);
}

function dispatchVoicing(input, options) {
  if (!input.valid) return generateCloseVoicing(input);

  const style = options.style || 'close';

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

  if (style === 'close') {
    return generateCloseVoicing(input);
  }

  if (style === 'simple') {
    return generateSimpleVoicing(input);
  }

  return Object.freeze({
    ok: false,
    input,
    selectedCandidate: null,
    candidatesConsidered: 0,
    candidatesValid: 0,
    diagnostics: Object.freeze([`unsupported style: '${style}'`]),
    rejectionReasons: Object.freeze(['UNSUPPORTED_STYLE']),
  });
}

export { CLOSE_GENERATOR_ID, generateCloseVoicing };
