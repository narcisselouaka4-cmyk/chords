// [OpenCode] — 2026-08-25 — EXP-031 Tâche 1 : orchestrateur Jazz.
//
// Assemble les candidats canoniques (generateChordCandidatesForAnchor) et les
// candidats Jazz (buildJazzCandidatesForAnchor) en un seul jeu de couches,
// puis délègue au path-finder harmonique et au path-finder de voicings
// canoniques. Enrichit ensuite les voicings avec des techniques idiomatiques
// Jazz (Drop 2, Rootless). Suit exactement le patron de
// gospel-harmonization-planner.js (EXP-026 + EXP-030 Tâche C).
//
// Aucune modification de voicing-path-finder.js. Aucune décision musicale
// nouvelle : enrichissement du pool de candidats + post-traitement des
// voicings.

import { generateChordCandidatesForAnchor } from './chord-candidate-generator.js';
import {
  buildJazzCandidatesForAnchor,
  identifyJazzTechnique,
  listJazzTechniques,
} from './jazz-techniques.js';
import { generateJazzVoicings, identifyJazzVoicingTechnique } from './jazz-voicings.js';
import { findBestHarmonicPath } from './harmonic-path-finder.js';
import { findBestVoicingPath } from './voicing-path-finder.js';

function computeMovement(from, to) {
  if (!from || !to || from.length === 0 || to.length === 0) return 999;
  const n = Math.min(from.length, to.length);
  let total = 0;
  for (let i = 0; i < n; i++) {
    total += Math.abs(to[i] - from[i]);
  }
  total += Math.abs(from.length - to.length) * 6;
  return total;
}

/**
 * Construit un plan de réharmonisation Jazz.
 *
 * @param {{ track: object, harmonicContext: object }} input
 * @returns {{ track, harmonicContext, candidateLayers, harmonicPathResult, voicingPathResult, steps, techniqueReport }}
 */
export function buildJazzHarmonizationPlan(input) {
  if (!input || !input.track || !input.harmonicContext) {
    throw new TypeError('buildJazzHarmonizationPlan : { track, harmonicContext } requis');
  }
  const { track, harmonicContext } = input;
  const anchors = harmonicContext.anchors;
  if (!Array.isArray(anchors) || anchors.length === 0) {
    throw new RangeError('buildJazzHarmonizationPlan : aucune ancre');
  }
  const N = anchors.length;

  // 1. Pour chaque ancre : candidats canoniques + candidats Jazz, dédoublonnés.
  const candidateLayers = [];
  for (let i = 0; i < N; i++) {
    const canonical = generateChordCandidatesForAnchor({
      anchor: anchors[i],
      track,
      harmonicContext,
    });
    const canonicalCandidates = canonical.status === 'generated' ? canonical.candidates : [];
    const jazzCandidates = buildJazzCandidatesForAnchor({
      anchor: anchors[i],
      track,
      harmonicContext,
    });
    const seen = new Set();
    const merged = [];
    for (const c of canonicalCandidates.concat(jazzCandidates)) {
      const key = `${c.pitchClasses.join(',')}|${c.qualityId}|${c.bassPitchClass ?? 'x'}`;
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(c);
    }
    if (merged.length === 0) {
      throw new RangeError(`buildJazzHarmonizationPlan : aucun candidat pour l'ancre ${i}`);
    }
    candidateLayers.push(Object.freeze(merged));
  }

  // 2. Chemin harmonique global + chemin de voicings canoniques.
  const harmonicPathResult = findBestHarmonicPath({ candidateLayers: Object.freeze(candidateLayers) });
  const voicingPathResult = findBestVoicingPath({ harmonicPathResult });

  // 3. Enrichissement des voicings avec techniques idiomatiques Jazz.
  const enrichedVoicings = [];
  const voicingTechniqueUsed = [];
  for (let i = 0; i < N; i++) {
    const canonicalVoicing = voicingPathResult.voicings[i];
    const candidate = harmonicPathResult.path[i];

    const targetBass = canonicalVoicing.bassMidiNote || 43;
    const targetOctave = Math.floor(targetBass / 12) - 1;
    const jazzVoicings = generateJazzVoicings(candidate, { centerOctave: targetOctave });

    if (jazzVoicings.length === 0) {
      enrichedVoicings.push(canonicalVoicing);
      voicingTechniqueUsed.push(null);
      continue;
    }

    const prevNotes = i > 0
      ? (enrichedVoicings[i - 1]?.midiNotes || canonicalVoicing.midiNotes)
      : canonicalVoicing.midiNotes;

    const melodyEvent = anchors[i].melodyEventId
      ? track.events.find((e) => e.id === anchors[i].melodyEventId)
      : null;
    const melodyPc = melodyEvent ? ((melodyEvent.midi % 12) + 12) % 12 : null;

    let best = canonicalVoicing;
    let bestTechnique = null;
    let bestMovement = computeMovement(prevNotes, canonicalVoicing.midiNotes);

    for (const jv of jazzVoicings) {
      if (melodyPc !== null) {
        const voicingPcs = jv.midiNotes.map((n) => ((n % 12) + 12) % 12);
        if (!voicingPcs.includes(melodyPc)) continue;
      }
      const movement = computeMovement(prevNotes, jv.midiNotes);
      if (movement <= bestMovement + 20) {
        bestMovement = movement;
        best = {
          candidate: jv.candidate,
          midiNotes: jv.midiNotes,
          leftHand: jv.leftHand,
          rightHand: jv.rightHand,
          bassMidiNote: jv.bassMidiNote,
          bassPitchClass: jv.bassPitchClass,
          inversionInterval: jv.inversionInterval,
          isRootPosition: jv.isRootPosition,
          spanSemitones: jv.spanSemitones,
          registerDeviation: jv.registerDeviation,
        };
        bestTechnique = identifyJazzVoicingTechnique(jv);
      }
    }

    enrichedVoicings.push(Object.freeze(best));
    voicingTechniqueUsed.push(bestTechnique);
  }

  // 4. Construction des steps.
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
      jazzVoicingTechnique: voicingTechniqueUsed[i],
    }));
  }
  const steps = Object.freeze(stepsArr);

  // 5. Rapport de techniques utilisées (traçabilité — critère 4).
  const used = [];
  const usedTechniqueIds = new Set();
  for (let i = 0; i < steps.length; i++) {
    const tech = identifyJazzTechnique(steps[i].candidate);
    if (tech) {
      used.push({ techniqueId: tech.id, name: tech.name, stepIndex: i });
      usedTechniqueIds.add(tech.id);
    }
  }
  const allTechniques = listJazzTechniques();
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