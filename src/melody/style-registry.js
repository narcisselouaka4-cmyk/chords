// [OpenCode] — 2026-08-25 — EXP-031 Tâche 3 : registre des styles de réharmonisation.
//
// Point d'extension propre qui fédère les bibliothèques de techniques par style.
// Chaque style expose :
//   - id, label (UI)
//   - buildHarmonizationPlan (orchestrateur style-spécifique)
//   - listTechniques, identifyTechnique (catalogue style-spécifique)
//   - techniqueSources (toutes les sources produites par ce style, pour le
//     validateur — critère 4 traçabilité)
//   - structuralSources, passageSources (sous-ensembles pour le critère 2)
//
// Worship = style « fidèle » : pas de techniques stylistiques, uniquement les
// candidats canoniques. C'est l'équivalent de la variante « faithful » déjà
// existante, exposé comme style sélectionnable.
//
// Le validateur (reharmonization-validator.js) lit ce registre au lieu
// d'importer GOSPEL_TECHNIQUES en dur. Les variantes
// (reharmonization-variants.js) sont paramétrées par le style actif.
//
// Garde-fou respecté : voicing-path-finder.js non modifié.

import {
  GOSPEL_TECHNIQUES,
  listGospelTechniques,
  identifyGospelTechnique,
  buildGospelCandidatesForAnchor,
} from './gospel-techniques.js';
import { buildGospelHarmonizationPlan } from './gospel-harmonization-planner.js';
import {
  JAZZ_TECHNIQUES,
  listJazzTechniques,
  identifyJazzTechnique,
  buildJazzCandidatesForAnchor,
} from './jazz-techniques.js';
import { buildJazzHarmonizationPlan } from './jazz-harmonization-planner.js';
import {
  NEO_SOUL_TECHNIQUES,
  listNeoSoulTechniques,
  identifyNeoSoulTechnique,
  buildNeoSoulCandidatesForAnchor,
} from './neo-soul-techniques.js';
import { buildNeoSoulHarmonizationPlan } from './neo-soul-harmonization-planner.js';

/**
 * @typedef {{
 *   id: string,
 *   label: string,
 *   description: string,
 *   buildHarmonizationPlan: (input: {track: object, harmonicContext: object}) => object,
 *   listTechniques: () => object[],
 *   identifyTechnique: (candidate: object) => object | null,
 *   buildCandidatesForAnchor: (input: object) => object[],
 *   techniqueSources: string[],
 *   structuralSources: string[],
 *   passageSources: string[]
 * }} StyleEntry
 */

// Sources canoniques communes (justifiables par tous les styles).
const CANONICAL_SOURCES = [
  'locked-boundary',
  'manual',
  'diatonic',
  'substitution',
  'secondary-dominant',
  'diminished-approach',
  'borrowed',
];

export const STYLE_REGISTRY = Object.freeze({
  worship: Object.freeze({
    id: 'worship',
    label: 'Worship',
    description: 'Harmonie diatonique canonique, sans enrichissements stylistiques.',
    buildHarmonizationPlan: null, // Worship = fidèle, pas de plan style-spécifique
    listTechniques: () => [],
    identifyTechnique: () => null,
    buildCandidatesForAnchor: () => [],
    techniqueSources: [],
    structuralSources: ['locked-boundary', 'manual', 'diatonic', 'substitution', 'borrowed'],
    passageSources: ['secondary-dominant', 'diminished-approach'],
  }),

  gospel: Object.freeze({
    id: 'gospel',
    label: 'Gospel',
    description: 'Couleurs gospel (add9, add6, sus2, passages V7b9/V7#5, voicings Drop 2/Rootless/Cluster).',
    buildHarmonizationPlan: buildGospelHarmonizationPlan,
    listTechniques: listGospelTechniques,
    identifyTechnique: identifyGospelTechnique,
    buildCandidatesForAnchor: buildGospelCandidatesForAnchor,
    techniqueSources: GOSPEL_TECHNIQUES.map((t) => t.source),
    structuralSources: ['locked-boundary', 'manual', 'diatonic', 'substitution', 'borrowed', 'gospel-add9', 'gospel-add6', 'gospel-sus2'],
    passageSources: ['secondary-dominant', 'diminished-approach', 'gospel-passage-7b9', 'gospel-passage-7sharp5'],
  }),

  jazz: Object.freeze({
    id: 'jazz',
    label: 'Jazz',
    description: 'Substitution tritonique, voicings Drop 2 et Rootless.',
    buildHarmonizationPlan: buildJazzHarmonizationPlan,
    listTechniques: listJazzTechniques,
    identifyTechnique: identifyJazzTechnique,
    buildCandidatesForAnchor: buildJazzCandidatesForAnchor,
    techniqueSources: JAZZ_TECHNIQUES.map((t) => t.source),
    structuralSources: ['locked-boundary', 'manual', 'diatonic', 'substitution', 'borrowed'],
    passageSources: ['secondary-dominant', 'diminished-approach', 'jazz-tritone-sub'],
  }),

  neoSoul: Object.freeze({
    id: 'neoSoul',
    label: 'Neo Soul',
    description: 'Dominante 7b9 vers mineur, voicing quartal.',
    buildHarmonizationPlan: buildNeoSoulHarmonizationPlan,
    listTechniques: listNeoSoulTechniques,
    identifyTechnique: identifyNeoSoulTechnique,
    buildCandidatesForAnchor: buildNeoSoulCandidatesForAnchor,
    techniqueSources: NEO_SOUL_TECHNIQUES.map((t) => t.source),
    structuralSources: ['locked-boundary', 'manual', 'diatonic', 'substitution', 'borrowed'],
    passageSources: ['secondary-dominant', 'diminished-approach', 'neo-soul-7b9-to-minor'],
  }),
});

export const STYLE_IDS = Object.freeze(Object.keys(STYLE_REGISTRY));

/**
 * Retourne l'entrée d'un style par son id, ou null.
 * @param {string} id
 * @returns {StyleEntry | null}
 */
export function getStyle(id) {
  return STYLE_REGISTRY[id] || null;
}

/**
 * Liste des styles pour l'UI (id + label).
 */
export function listStyles() {
  return STYLE_IDS.map((id) => ({ id, label: STYLE_REGISTRY[id].label, description: STYLE_REGISTRY[id].description }));
}

/**
 * Retourne l'ensemble des sources justifiables (canoniques + techniques du
 * style), pour le critère 4 de traçabilité du validateur.
 * @param {string} styleId
 * @returns {Set<string>}
 */
export function justifiableSourcesForStyle(styleId) {
  const style = getStyle(styleId) || STYLE_REGISTRY.gospel;
  return new Set([...CANONICAL_SOURCES, ...style.techniqueSources]);
}

/**
 * Retourne l'ensemble des sources de passage (canoniques + techniques du
 * style), pour le critère 2 de résolution du validateur.
 * @param {string} styleId
 * @returns {Set<string>}
 */
export function passageSourcesForStyle(styleId) {
  const style = getStyle(styleId) || STYLE_REGISTRY.gospel;
  return new Set(style.passageSources);
}

/**
 * Retourne l'ensemble des sources structurelles (canoniques + techniques du
 * style), pour le critère 2 de résolution du validateur.
 * @param {string} styleId
 * @returns {Set<string>}
 */
export function structuralSourcesForStyle(styleId) {
  const style = getStyle(styleId) || STYLE_REGISTRY.gospel;
  return new Set(style.structuralSources);
}

export { CANONICAL_SOURCES };