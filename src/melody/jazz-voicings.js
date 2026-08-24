// [OpenCode] — 2026-08-25 — EXP-031 Tâche 1 : voicings idiomatiques Jazz.
//
// Produit des voicings de piano idiomatiques du style Jazz pour un
// ChordCandidate donné, en complément des voicings génériques produits par
// voicing-path-finder.js. Chaque technique est une primitive explicite et
// traçable (critère 4 du score de validité), suivant le patron posé par
// gospel-voicings.js (EXP-030 Tâche C).
//
// Sous-ensemble V1 (EXP-031) :
//   J6 — Drop 2 : à partir d'un accord 4 notes en position resserrée,
//        descendre la 2e note en partant du haut d'une octave.
//   J7 — Rootless : RÉUTILISE la primitive déjà construite pour le Gospel
//        (gospel-voicings.js buildRootlessVoicing). On importe la fonction
//        et on re-étiquette la technique avec un id Jazz, sans la dupliquer.
//
// Garde-fou respecté : voicing-path-finder.js non modifié.

import { generateGospelVoicings, GOSPEL_VOICING_TECHNIQUES } from './gospel-voicings.js';

// ---------------------------------------------------------------------------
// Catalogue des techniques de voicing Jazz (traçabilité — critère 4)
// ---------------------------------------------------------------------------

export const JAZZ_VOICING_TECHNIQUES = Object.freeze([
  {
    id: 'jazz-drop2',
    name: 'Drop 2',
    description:
      "Accord de 4 notes en position serrée, 2e note en partant du haut " +
      "abaissée d'une octave. Voicing de comping jazz typique.",
  },
  {
    id: 'jazz-rootless',
    name: 'Rootless',
    description:
      "Fondamentale omise, accord posé sur sa 3e ou 7e. Typique quand la " +
      "basse est jouée séparément. Réutilise la primitive Gospel (EXP-030).",
  },
]);

/**
 * Génère tous les voicings idiomatiques Jazz pour un candidat donné.
 *
 * On réutilise generateGospelVoicings (qui produit Drop 2, Rootless, Cluster)
 * et on ne garde que les voicings Drop 2 et Rootless, en re-étiquetant leur
 * techniqueId avec les ids Jazz. Le Cluster est écarté (technique Gospel
// spécifique, pas Jazz).
 *
 * @param {object} candidate
 * @param {object} [options]
 * @param {number} [options.centerOctave]
 * @returns {object[]} voicings Jazz (techniqueId 'jazz-*')
 */
export function generateJazzVoicings(candidate, options = {}) {
  const gospelVoicings = generateGospelVoicings(candidate, options);
  const jazzVoicings = [];
  for (const gv of gospelVoicings) {
    let jazzId = null;
    if (gv.techniqueId === 'gospel-drop2') jazzId = 'jazz-drop2';
    else if (gv.techniqueId === 'gospel-rootless') jazzId = 'jazz-rootless';
    else continue; // Cluster écarté pour Jazz
    jazzVoicings.push(Object.freeze({
      ...gv,
      techniqueId: jazzId,
      techniqueName: JAZZ_VOICING_TECHNIQUES.find((t) => t.id === jazzId).name,
    }));
  }
  return jazzVoicings;
}

/**
 * Identifie la technique de voicing Jazz d'un voicing (via techniqueId).
 */
export function identifyJazzVoicingTechnique(voicing) {
  if (!voicing || !voicing.techniqueId) return null;
  return JAZZ_VOICING_TECHNIQUES.find((t) => t.id === voicing.techniqueId) || null;
}