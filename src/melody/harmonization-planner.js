// [OpenCode] — 2026-08-07 — Incrément 8 : assemblage déterministe du pipeline
// complet de harmonisation mélodique.
//
// Orchestrateur pur : relie proprement les contrats déjà validés par les
// Incréments 2 (HarmonicContext), 4 (génération de ChordCandidate), 6 (chemin
// harmonique global) et 7 (chemin global de voicings jouables). Aucune nouvelle
// décision musicale : pas de recalcul de score, pas de reclassement, pas de
// greedy, pas de fallback, pas de génération de voicings maison, pas de
// remplacement de candidat verrouillé.
//
// Module pur : pas de DOM, pas de réseau, pas d'IA, pas de MIDI/audio émis, pas
// d'UI, pas de mutation des entrées, pas d'état global, pas de cache persistant
// entre deux appels, pas de Math.random, pas de date courante, pas
// d'identifiant généré. Aucune dépendance ajoutée.
//
// Complexité : linéaire en nombre d'ancres et de candidats copiés une fois les
// calculs amont effectués.

import { generateChordCandidatesForAnchor } from './chord-candidate-generator.js';
import { findBestHarmonicPath } from './harmonic-path-finder.js';
import { findBestVoicingPath } from './voicing-path-finder.js';

// ---------------------------------------------------------------------------
// Types conceptuels (documentés dans ./midi-types.js)
// ---------------------------------------------------------------------------

/**
 * @typedef {import('./midi-types.js').MelodyTrack} MelodyTrack
 * @typedef {import('./midi-types.js').HarmonicContext} HarmonicContext
 * @typedef {import('./midi-types.js').HarmonicAnchor} HarmonicAnchor
 * @typedef {import('./midi-types.js').ChordCandidate} ChordCandidate
 * @typedef {import('./midi-types.js').HarmonicPathResult} HarmonicPathResult
 * @typedef {import('./midi-types.js').VoicingPathResult} VoicingPathResult
 * @typedef {import('./midi-types.js').HarmonizationStep} HarmonizationStep
 * @typedef {import('./midi-types.js').HarmonizationPlan} HarmonizationPlan
 */

// ---------------------------------------------------------------------------
// Helpers de validation du wrapper d'entrée
// ---------------------------------------------------------------------------

/**
 * Valide que l'argument d'options est un objet non nul et non tableau. Un
 * argument absent, null, une primitive ou une fonction est rejeté. Un tableau
 * est rejeté même s'il porte artificiellement des propriétés track /
 * harmonicContext.
 *
 * @param {unknown} options
 * @param {string} fnName
 * @returns {object} l'objet d'options validé
 */
function requireOptionsObject(options, fnName) {
  if (options === undefined) {
    throw new TypeError(`${fnName} : l argument d options est obligatoire`);
  }
  if (
    options === null ||
    typeof options !== 'object' ||
    Array.isArray(options) ||
    typeof options === 'function'
  ) {
    throw new TypeError(
      `${fnName} : l argument d options doit être un objet non nul et non tableau`,
    );
  }
  return options;
}

/**
 * Vérifie qu'une propriété est présente par propriété propre (et non héritée)
 * sur l'objet d'options.
 *
 * @param {object} options
 * @param {string} prop
 * @param {string} fnName
 */
function requireOwnProperty(options, prop, fnName) {
  if (!Object.prototype.hasOwnProperty.call(options, prop)) {
    throw new TypeError(`${fnName} : propriété '${prop}' manquante`);
  }
}

/**
 * Vérifie qu'une valeur est un objet non nul et non tableau (typage du contrat
 * public de `track` et `harmonicContext`).
 *
 * @param {unknown} value
 * @param {string} role
 */
function requireObjectNotArray(value, role) {
  if (value === null || value === undefined) {
    throw new TypeError(`${role} doit être un objet non nul`);
  }
  if (typeof value !== 'object' || Array.isArray(value) || typeof value === 'function') {
    throw new TypeError(`${role} doit être un objet non nul et non tableau`);
  }
}

/**
 * Vérifie que `anchors` est un tableau non creux d'objets non nuls. Les
 * validations profondes du contrat des ancres sont déléguées aux moteurs amont
 * (générateur de candidats, validateur de contexte) ; ici on ne rejette que
 * les structures inutilisables.
 *
 * @param {unknown} anchors
 */
function requireAnchorsArray(anchors) {
  if (!Array.isArray(anchors)) {
    throw new TypeError('harmonicContext.anchors doit être un tableau');
  }
  for (let i = 0; i < anchors.length; i++) {
    if (!(i in anchors)) {
      throw new TypeError('harmonicContext.anchors ne doit pas être un tableau creux');
    }
    const a = anchors[i];
    if (a === null || typeof a !== 'object' || Array.isArray(a) || typeof a === 'function') {
      throw new TypeError(`harmonicContext.anchors[${i}] doit être un objet ancre non nul`);
    }
  }
}

// ---------------------------------------------------------------------------
// API publique
// ---------------------------------------------------------------------------

/**
 * Assemble le plan d'harmonisation complet d'une phrase mélodique.
 *
 * Étapes :
 *   1. validation du wrapper { track, harmonicContext } ;
 *   2. lecture des ancres dans l ordre exact de harmonicContext.anchors ;
 *   3. génération des candidats via generateChordCandidatesForAnchor, une
 *      seule fois par ancre, dans l ordre stocké ;
 *   4. sélection du chemin harmonique global via findBestHarmonicPath ;
 *   5. sélection du chemin global de voicings via findBestVoicingPath ;
 *   6. construction des steps alignés couche par couche.
 *
 * Le plan ne modifie jamais les entrées, ne fige rien a posteriori, et ne
 * remplace ni ne contourne aucun choix des moteurs amont.
 *
 * @param {{ track: MelodyTrack, harmonicContext: HarmonicContext }} input
 * @returns {HarmonizationPlan}
 */
export function buildHarmonizationPlan(input) {
  const opts = requireOptionsObject(input, 'buildHarmonizationPlan');
  requireOwnProperty(opts, 'track', 'buildHarmonizationPlan');
  requireOwnProperty(opts, 'harmonicContext', 'buildHarmonizationPlan');
  const { track, harmonicContext } = opts;
  requireObjectNotArray(track, 'track');
  requireObjectNotArray(harmonicContext, 'harmonicContext');

  // Les ancres sont lues dans l ordre exact du contexte canonique : jamais
  // triées, dédupliquées, remplacées ou réordonnées. Une absence d ancre est
  // une erreur de plage (RangeError) ; un tableau structurellement invalide
  // est une erreur de type (TypeError).
  requireAnchorsArray(harmonicContext.anchors);
  const anchors = harmonicContext.anchors;
  if (anchors.length === 0) {
    throw new RangeError(
      'buildHarmonizationPlan : aucun plan ne peut être construit sans ancre harmonique',
    );
  }
  const N = anchors.length;

  // Génération des candidats : une seule fois par ancre, dans l ordre stocké.
  // Chaque couche est une copie figée du tableau retourné ; les références
  // exactes des candidats sont préservées. Aucun reclassement, aucun tri.
  const candidateLayersFrozen = [];
  for (let i = 0; i < N; i++) {
    const result = generateChordCandidatesForAnchor({
      anchor: anchors[i],
      track,
      harmonicContext,
    });
    const layer = result.candidates;
    if (!Array.isArray(layer) || layer.length === 0) {
      const anchorId = anchors[i] && anchors[i].id ? anchors[i].id : null;
      throw new RangeError(
        `buildHarmonizationPlan : aucune couche de candidat admissible pour ` +
        `l ancre d indice ${i}${anchorId !== null ? ` (${anchorId})` : ''}`,
      );
    }
    // Copie plate figée : les références des candidats sont conservées telles
    // quelles (aucun clone), seul le conteneur est nouveau et figé.
    candidateLayersFrozen.push(Object.freeze(layer.slice()));
  }
  const candidateLayers = Object.freeze(candidateLayersFrozen);

  // Chemin harmonique global : exactement l objet retourné par le moteur.
  const harmonicPathResult = findBestHarmonicPath({ candidateLayers });

  // Chemin global de voicings : exactement l objet retourné par le moteur.
  const voicingPathResult = findBestVoicingPath({ harmonicPathResult });

  // Construction des steps alignés couche par couche. Les transitions sont
  // entrantes : null au premier step, puis transitions[i-1] pour i > 0.
  const stepsArr = [];
  for (let i = 0; i < N; i++) {
    const step = {
      index: i,
      anchor: anchors[i],
      candidateLayer: candidateLayers[i],
      candidate: harmonicPathResult.path[i],
      voicing: voicingPathResult.voicings[i],
      harmonicTransition: i === 0 ? null : harmonicPathResult.transitions[i - 1],
      voicingTransition: i === 0 ? null : voicingPathResult.transitions[i - 1],
    };
    stepsArr.push(Object.freeze(step));
  }
  const steps = Object.freeze(stepsArr);

  return Object.freeze({
    track,
    harmonicContext,
    candidateLayers,
    harmonicPathResult,
    voicingPathResult,
    steps,
  });
}