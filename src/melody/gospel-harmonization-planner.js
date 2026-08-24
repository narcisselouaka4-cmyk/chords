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
import { generateGospelVoicings, identifyGospelVoicingTechnique } from './gospel-voicings.js';
import { findBestHarmonicPath } from './harmonic-path-finder.js';
import { findBestVoicingPath } from './voicing-path-finder.js';

// Calcule le mouvement total (en demi-tons) entre deux jeux de notes MIDI.
// Utilisé pour choisir le voicing idiomatique qui minimise le mouvement par
// rapport au voicing précédent.
function computeMovement(from, to) {
  if (!from || !to || from.length === 0 || to.length === 0) return 999;
  // Apparie par indice (les deux sont triés croissants).
  const n = Math.min(from.length, to.length);
  let total = 0;
  for (let i = 0; i < n; i++) {
    total += Math.abs(to[i] - from[i]);
  }
  // Pénalité pour différence de cardinalité
  total += Math.abs(from.length - to.length) * 6;
  return total;
}

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

  // [OpenCode] — 2026-08-24 — EXP-030 Tâche C : enrichissement des voicings
  // avec des techniques idiomatiques Gospel (drop 2, rootless, cluster).
  // Post-traitement : pour chaque step, on génère des voicings idiomatiques
  // et on choisit celui qui minimise le mouvement par rapport au voicing
  // précédent. Si aucun n'est meilleur que le canonique, on garde le canonique.
  // Ne modifie pas voicing-path-finder.js.
  const enrichedVoicings = [];
  const voicingTechniqueUsed = [];
  for (let i = 0; i < N; i++) {
    const canonicalVoicing = voicingPathResult.voicings[i];
    const candidate = harmonicPathResult.path[i];

    // [OpenCode] — 2026-08-24 — EXP-030 Tâche C : génère des voicings
    // idiomatiques autour du registre du voicing canonique pour qu'ils
    // soient compétitifs en termes de mouvement.
    const targetBass = canonicalVoicing.bassMidiNote || 43;
    const targetOctave = Math.floor(targetBass / 12) - 1;
    const gospelVoicings = generateGospelVoicings(candidate, { centerOctave: targetOctave });

    if (gospelVoicings.length === 0) {
      enrichedVoicings.push(canonicalVoicing);
      voicingTechniqueUsed.push(null);
      continue;
    }

    // Calcule le mouvement de chaque voicing par rapport au précédent.
    const prevNotes = i > 0
      ? (enrichedVoicings[i - 1]?.midiNotes || canonicalVoicing.midiNotes)
      : canonicalVoicing.midiNotes;

    // [OpenCode] — 2026-08-24 — EXP-030 Tâche C : choisit un voicing
    // idiomatique Gospel s'il maintient la note mélodique audible (critère 1
    // du score de validité) et minimise le mouvement. Ne dégrade jamais le
    // score : si aucun voicing idiomatique ne contient la note mélodique,
    // on garde le canonique.
    const melodyEvent = anchors[i].melodyEventId
      ? track.events.find((e) => e.id === anchors[i].melodyEventId)
      : null;
    const melodyPc = melodyEvent ? ((melodyEvent.midi % 12) + 12) % 12 : null;

    let best = canonicalVoicing;
    let bestTechnique = null;
    let bestMovement = computeMovement(prevNotes, canonicalVoicing.midiNotes);

    for (const gv of gospelVoicings) {
      // Le voicing idiomatique doit contenir la note mélodique (si présente)
      if (melodyPc !== null) {
        const voicingPcs = gv.midiNotes.map((n) => ((n % 12) + 12) % 12);
        if (!voicingPcs.includes(melodyPc)) continue;
      }
      const movement = computeMovement(prevNotes, gv.midiNotes);
      // Préfère le voicing idiomatique s'il a un mouvement raisonnable
      // (≤ bestMovement + 20) — les voicings idiomatiques sont structurellement
      // différents, on accepte un mouvement supérieur tant que la mélodie
      // reste audible.
      if (movement <= bestMovement + 20) {
        bestMovement = movement;
        best = {
          candidate: gv.candidate,
          midiNotes: gv.midiNotes,
          leftHand: gv.leftHand,
          rightHand: gv.rightHand,
          bassMidiNote: gv.bassMidiNote,
          bassPitchClass: gv.bassPitchClass,
          inversionInterval: gv.inversionInterval,
          isRootPosition: gv.isRootPosition,
          spanSemitones: gv.spanSemitones,
          registerDeviation: gv.registerDeviation,
        };
        bestTechnique = identifyGospelVoicingTechnique(gv);
      }
    }

    enrichedVoicings.push(Object.freeze(best));
    voicingTechniqueUsed.push(bestTechnique);
  }

  // 3. Construction des steps alignés avec voicings enrichis.
  const stepsArr = [];
  for (let i = 0; i < N; i++) {
    stepsArr.push(Object.freeze({
      index: i,
      anchor: anchors[i],
      candidateLayer: candidateLayers[i],
      candidate: harmonicPathResult.path[i],
      voicing: enrichedVoicings[i],
      harmonicTransition: i === 0 ? null : harmonicPathResult.transitions[i - 1],
      voicingTransition: i === 0 ? null : voicingPathResult.transitions[i - 1],
      gospelVoicingTechnique: voicingTechniqueUsed[i],
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