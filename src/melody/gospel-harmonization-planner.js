// [OpenCode] — 2026-08-24 — Réharmonisation V1, Tâche 2 : orchestrateur Gospel.
//
// Assemble les candidats canoniques (generateChordCandidatesForAnchor) et les
// candidats Gospel (buildGospelCandidatesForAnchor) en un seul jeu de couches,
// puis délègue au path-finder harmonique et au path-finder de voicings
// canoniques. Aucune nouvelle décision musicale : seulement un enrichissement
// du pool de candidats et un assemblage déterministe.
//
// Résultat : un HarmonizationPlan canonique (même forme que
// buildHarmonizationPlan) + un rapport de techniques utilisées pour la
// traçabilité (critère 4 du score de validité).

import { generateChordCandidatesForAnchor } from './chord-candidate-generator.js';
import {
  buildGospelCandidatesForAnchor,
  identifyGospelTechnique,
  listGospelTechniques,
} from './gospel-techniques.js';
import { findBestHarmonicPath } from './harmonic-path-finder.js';
import { findBestVoicingPath } from './voicing-path-finder.js';

/**
 * Construit un plan de réharmonisation Gospel en enrichissant le pool de
 * candidats canoniques avec les techniques Gospel.
 *
 * @param {{ track: object, harmonicContext: object }} input
 * @returns {{
 *   track: object,
 *   harmonicContext: object,
 *   candidateLayers: object[][],
 *   harmonicPathResult: object,
 *   voicingPathResult: object,
 *   steps: object[],
 *   techniqueReport: { used: { techniqueId: string, name: string, stepIndex: number }[], unused: { techniqueId: string, name: string }[] }
 * }}
 */
export function buildGospelHarmonizationPlan(input) {
  if (!input || !input.track || !input.harmonicContext) {
    throw new TypeError('buildGospelHarmonizationPlan : { track, harmonicContext } requis');
  }
  const { track, harmonicContext } = input;
  const anchors = harmonicContext.anchors;
  if (!Array.isArray(anchors) || anchors.length === 0) {
    throw new RangeError('buildGospelHarmonizationPlan : aucune ancre');
  }
  const N = anchors.length;

  // 1. Pour chaque ancre : candidats canoniques + candidats Gospel, dédoublonnés.
  const candidateLayers = [];
  for (let i = 0; i < N; i++) {
    const canonical = generateChordCandidatesForAnchor({
      anchor: anchors[i],
      track,
      harmonicContext,
    });
    const canonicalCandidates = canonical.status === 'generated' ? canonical.candidates : [];
    const gospelCandidates = buildGospelCandidatesForAnchor({
      anchor: anchors[i],
      track,
      harmonicContext,
    });
    // Concatène canoniques + Gospel, dédoublonne par (pitchClasses, quality, bass).
    const seen = new Set();
    const merged = [];
    for (const c of canonicalCandidates.concat(gospelCandidates)) {
      const key = `${c.pitchClasses.join(',')}|${c.qualityId}|${c.bassPitchClass ?? 'x'}`;
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(c);
    }
    if (merged.length === 0) {
      throw new RangeError(`buildGospelHarmonizationPlan : aucun candidat pour l'ancre ${i}`);
    }
    candidateLayers.push(Object.freeze(merged));
  }

  // 2. Chemin harmonique global + chemin de voicings (canoniques).
  const harmonicPathResult = findBestHarmonicPath({ candidateLayers: Object.freeze(candidateLayers) });
  const voicingPathResult = findBestVoicingPath({ harmonicPathResult });

  // 3. Construction des steps alignés.
  const stepsArr = [];
  for (let i = 0; i < N; i++) {
    stepsArr.push(Object.freeze({
      index: i,
      anchor: anchors[i],
      candidateLayer: candidateLayers[i],
      candidate: harmonicPathResult.path[i],
      voicing: voicingPathResult.voicings[i],
      harmonicTransition: i === 0 ? null : harmonicPathResult.transitions[i - 1],
      voicingTransition: i === 0 ? null : voicingPathResult.transitions[i - 1],
    }));
  }
  const steps = Object.freeze(stepsArr);

  // 4. Rapport de techniques utilisées pour traçabilité (critère 4).
  const used = [];
  const usedTechniqueIds = new Set();
  for (let i = 0; i < steps.length; i++) {
    const tech = identifyGospelTechnique(steps[i].candidate);
    if (tech) {
      used.push({ techniqueId: tech.id, name: tech.name, stepIndex: i });
      usedTechniqueIds.add(tech.id);
    }
  }
  // Import local différé pour éviter dépendance circulaire (gospel-techniques
  // n'importe pas ce module).
  const allTechniques = listGospelTechniques();
  const unused = allTechniques
    .filter((t) => !usedTechniqueIds.has(t.id))
    .map((t) => ({ techniqueId: t.id, name: t.name }));

  return Object.freeze({
    track,
    harmonicContext,
    candidateLayers: Object.freeze(candidateLayers),
    harmonicPathResult,
    voicingPathResult,
    steps,
    techniqueReport: Object.freeze({ used: Object.freeze(used), unused: Object.freeze(unused) }),
  });
}