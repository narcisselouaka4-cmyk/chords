// Modele de donnees pour le catalogue de voicings par famille.

import { createHandVoicing, createVoicingCandidate } from './data-model.js';

/**
 * @typedef {import('./data-model.js').VoicingCandidate} VoicingCandidate
 * @typedef {import('./families/specifications.js').VoicingFamilySpec} VoicingFamilySpec
 */

/**
 * Entree d'une famille dans le catalogue.
 * @typedef {{
 *   spec: VoicingFamilySpec,
 *   candidate: VoicingCandidate | null,
 *   available: boolean,
 *   reason?: string
 * }} FamilyCatalogEntry
 */

/**
 * Catalogue complet de voicings pour un accord.
 * @typedef {{
 *   ok: boolean,
 *   input: import('./chord-input.js').NormalizedVoicingInput,
 *   families: Record<string, FamilyCatalogEntry>,
 *   defaultFamilyId: string,
 *   diagnostics: string[]
 * }} VoicingCatalog
 */

/**
 * Cree une entree de catalogue pour une famille.
 * @param {VoicingFamilySpec} spec
 * @param {VoicingCandidate | null} candidate
 * @param {boolean} available
 * @param {string} [reason]
 * @returns {FamilyCatalogEntry}
 */
export function createFamilyCatalogEntry(spec, candidate, available, reason = '') {
  return Object.freeze({
    spec,
    candidate,
    available,
    reason: reason || undefined,
  });
}

/**
 * Cree un catalogue de voicings.
 * @param {import('./chord-input.js').NormalizedVoicingInput} input
 * @param {FamilyCatalogEntry[]} familyEntries
 * @param {string} defaultFamilyId
 * @param {string[]} diagnostics
 * @returns {VoicingCatalog}
 */
export function createVoicingCatalog(input, familyEntries, defaultFamilyId, diagnostics = []) {
  const families = Object.freeze(
    Object.fromEntries(familyEntries.map((entry) => [entry.spec.id, entry]))
  );
  return Object.freeze({
    ok: true,
    input,
    families,
    defaultFamilyId,
    diagnostics: Object.freeze([...diagnostics]),
  });
}

/**
 * Cree un catalogue vide en cas d'echec total.
 * @param {import('./chord-input.js').NormalizedVoicingInput} input
 * @param {string[]} diagnostics
 * @returns {VoicingCatalog}
 */
export function createEmptyVoicingCatalog(input, diagnostics = []) {
  return Object.freeze({
    ok: false,
    input,
    families: Object.freeze({}),
    defaultFamilyId: '',
    diagnostics: Object.freeze([...diagnostics]),
  });
}

export { createHandVoicing, createVoicingCandidate };
