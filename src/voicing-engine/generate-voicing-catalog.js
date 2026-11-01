// Orchestrateur du catalogue de voicings par famille.
// Ordre impose : accord -> generation -> validation -> classification -> difficulte -> affichage.

import { normalizeVoicingInput, normalizeVoicingInputFromSymbol } from './chord-input.js';
import { applicableFamilies } from './families/specifications.js';
import { FAMILY_GENERATORS } from './generators/family-generators.js';
import { FAMILY_VALIDATORS } from './validators/family-validators.js';
import { validateVoicing } from './validators/voicing-validator.js';
import { createVoicingCatalog, createFamilyCatalogEntry, createEmptyVoicingCatalog } from './catalog-model.js';
import { isFamilyConfirmedByVoicingLab, VOICINGLAB_GATED_FAMILIES } from './voicinglab-availability.js';
import { measureSoftConstraintFeatures } from './constraints.js';

/** @typedef {import('./data-model.js').VoicingCandidate} VoicingCandidate */

/**
 * Calcule la difficulte d'un voicing valide (1-5 etoiles).
 * Basee sur la densite de la main droite, les extensions, les alterations
 * et l'absence de fondamentale en main gauche.
 *
 * Regle formelle :
 *   base = 1
 *   + 1 si la main droite compte 3 notes ou plus (famille autre que twoNoteShell)
 *   + 1 si la main droite compte 4 notes ou plus en Close
 *   + 1 si l'accord contient une extension 9/11/13 non alteree
 *     (sauf twoNoteShell et rootlessA, ou la structure est fixee)
 *   + (nombre d'alterations #9/b9/#11/b13/#5/b5)
 *   + 1 si le voicing est rootless
 *   cap a 5
 *
 * @param {VoicingCandidate} candidate
 * @returns {number}
 */
function computeDifficulty(candidate) {
  const { input, rh, metadata } = candidate;
  const familyId = metadata.familyId;
  const quality = input.quality;
  const rhCount = rh.notes.length;

  // Extensions non alterees : 9, 11, 13 precedes d'un caractere autre que # ou b.
  const extensionMatches = [...quality.matchAll(/(?<![#b])(9|11|13)/g)];
  const extensionCount = extensionMatches.length;

  // Alterations : # ou b suivi de 9, 11, 13 ou 5.
  const alterationMatches = [...quality.matchAll(/[#b](9|11|13|5)/g)];
  const alterationCount = alterationMatches.length;

  let difficulty = 1;

  if (rhCount >= 3 && familyId !== 'twoNoteShell') difficulty += 1;
  if (rhCount >= 4 && familyId === 'close') difficulty += 1;
  if (extensionCount > 0 && familyId !== 'twoNoteShell' && familyId !== 'rootlessA') {
    difficulty += 1;
  }
  difficulty += alterationCount;
  if (metadata.rootless) difficulty += 1;

  return Math.min(5, Math.max(1, difficulty));
}

/**
 * Genere et valide le voicing d'une famille.
 * @param {import('./chord-input.js').NormalizedVoicingInput} input
 * @param {import('./families/specifications.js').VoicingFamilySpec} spec
 * @returns {import('./catalog-model.js').FamilyCatalogEntry}
 */
function generateAndValidateFamily(input, spec, options = {}) {
  const generator = FAMILY_GENERATORS[spec.id];
  const validator = FAMILY_VALIDATORS[spec.id];

  if (!generator || !validator) {
    return createFamilyCatalogEntry(spec, null, false, `Famille ${spec.id} non implementee`);
  }

  // Mode strict : toutes les familles exigent une confirmation VoicingLab pour
  // cette racine precise. Par defaut (onglet Analyse), seules les familles
  // Phase 4 sont filtrees, pour ne pas retirer les voicings de triades.
  const gated = options.voicingLabStrict || VOICINGLAB_GATED_FAMILIES.includes(spec.id);
  if (gated && !isFamilyConfirmedByVoicingLab(spec.id, input.quality, input.rootPc)) {
    return createFamilyCatalogEntry(spec, null, false, `Famille ${spec.id} non publiee par VoicingLab pour '${input.quality}' (racine ${input.rootPc})`);
  }

  const result = generator(input);
  if (!result.available || !result.candidate) {
    return createFamilyCatalogEntry(spec, null, false, result.reason || 'Generation refusee');
  }

  // Validation specifique + generique.
  const validation = validateVoicing(result.candidate, spec, validator);
  if (!validation.ok) {
    return createFamilyCatalogEntry(spec, null, false, validation.errors.join('; '));
  }

  // Difficulte post-validation uniquement.
  const difficulty = computeDifficulty(result.candidate);
  const enriched = Object.freeze({
    ...result.candidate,
    metadata: Object.freeze({
      ...result.candidate.metadata,
      difficulty,
      features: measureSoftConstraintFeatures(result.candidate),
    }),
  });

  return createFamilyCatalogEntry(spec, enriched, true);
}

/**
 * Genere le catalogue de voicings pour un accord donne.
 * @param {{ rootPc: number, quality: string, bassPc?: number | null }} rawInput
 * @param {{ voicingLabStrict?: boolean }} [options] - strict : toutes les familles
 *   exigent un voicing VoicingLab publie pour cette racine et cette qualite
 * @returns {import('./catalog-model.js').VoicingCatalog}
 */
export function generateVoicingCatalog(rawInput, options = {}) {
  const input = normalizeVoicingInput(rawInput);
  if (!input.valid) {
    return createEmptyVoicingCatalog(input, input.errors);
  }

  const families = applicableFamilies(input);
  if (families.length === 0) {
    return createEmptyVoicingCatalog(input, ['Aucune famille applicable pour cet accord']);
  }

  const entries = families.map((spec) => generateAndValidateFamily(input, spec, options));

  // Famille par defaut : la premiere disponible, priorite Close puis Shell.
  const priorityOrder = ['close', 'shell', 'fourWayClose', 'drop2', 'rootlessA', 'rootlessB'];
  let defaultFamilyId = '';
  for (const id of priorityOrder) {
    const entry = entries.find((e) => e.spec.id === id && e.available);
    if (entry) {
      defaultFamilyId = id;
      break;
    }
  }
  if (!defaultFamilyId) {
    const firstAvailable = entries.find((e) => e.available);
    defaultFamilyId = firstAvailable ? firstAvailable.spec.id : '';
  }

  return createVoicingCatalog(input, entries, defaultFamilyId);
}

/**
 * Genere le catalogue a partir d'un symbole d'accord.
 * @param {string} chordSymbol
 * @param {{ voicingLabStrict?: boolean }} [options]
 * @returns {import('./catalog-model.js').VoicingCatalog}
 */
export function generateVoicingCatalogFromSymbol(chordSymbol, options = {}) {
  const input = normalizeVoicingInputFromSymbol(chordSymbol);
  return generateVoicingCatalog({
    rootPc: input.rootPc,
    quality: input.quality,
    bassPc: input.bassPc,
  }, options);
}

/**
 * Conserve la compatibilite avec l'API ancienne : retourne un seul voicing.
 * Selectionne la famille par defaut du catalogue.
 * @param {{ rootPc: number, quality: string, bassPc?: number | null }} rawInput
 * @param {{ familyId?: string }} [options]
 * @returns {import('./generate-voicing.js').VoicingResult}
 */
export function generateSingleVoicing(rawInput, options = {}) {
  const catalog = generateVoicingCatalog(rawInput);
  if (!catalog.ok) {
    return Object.freeze({
      ok: false,
      input: catalog.input,
      selectedCandidate: null,
      candidatesConsidered: 0,
      candidatesValid: 0,
      diagnostics: catalog.diagnostics,
      rejectionReasons: catalog.diagnostics,
    });
  }

  const familyId = options.familyId || catalog.defaultFamilyId;
  const entry = catalog.families[familyId];
  if (!entry || !entry.available || !entry.candidate) {
    return Object.freeze({
      ok: false,
      input: catalog.input,
      selectedCandidate: null,
      candidatesConsidered: 0,
      candidatesValid: 0,
      diagnostics: ['Famille non disponible'],
      rejectionReasons: ['FAMILY_UNAVAILABLE'],
    });
  }

  return Object.freeze({
    ok: true,
    input: catalog.input,
    selectedCandidate: entry.candidate,
    candidatesConsidered: Object.values(catalog.families).length,
    candidatesValid: Object.values(catalog.families).filter((f) => f.available).length,
    diagnostics: catalog.diagnostics,
    rejectionReasons: Object.freeze([]),
  });
}
