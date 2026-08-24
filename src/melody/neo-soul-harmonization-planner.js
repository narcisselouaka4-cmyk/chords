// [OpenCode] — 2026-08-25 — EXP-031 Tâche 2 : orchestrateur Neo Soul.
//
// Assemble les candidats canoniques et Neo Soul, délègue aux path-finders,
// enrichit les voicings avec des techniques idiomatiques Neo Soul (quartal).
// Suit le patron de gospel-harmonization-planner.js (EXP-026 + EXP-030 C).
//
// voicing-path-finder.js non modifié.

import { generateChordCandidatesForAnchor } from './chord-candidate-generator.js';
import {
  buildNeoSoulCandidatesForAnchor,
  identifyNeoSoulTechnique,
  listNeoSoulTechniques,
} from './neo-soul-techniques.js';
import { generateNeoSoulVoicings, identifyNeoSoulVoicingTechnique } from './neo-soul-voicings.js';
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

export function buildNeoSoulHarmonizationPlan(input) {
  if (!input || !input.track || !input.harmonicContext) {
    throw new TypeError('buildNeoSoulHarmonizationPlan : { track, harmonicContext } requis');
  }
  const { track, harmonicContext } = input;
  const anchors = harmonicContext.anchors;
  if (!Array.isArray(anchors) || anchors.length === 0) {
    throw new RangeError('buildNeoSoulHarmonizationPlan : aucune ancre');
  }
  const N = anchors.length;

  const candidateLayers = [];
  for (let i = 0; i < N; i++) {
    const canonical = generateChordCandidatesForAnchor({
      anchor: anchors[i],
      track,
      harmonicContext,
    });
    const canonicalCandidates = canonical.status === 'generated' ? canonical.candidates : [];
    const neoSoulCandidates = buildNeoSoulCandidatesForAnchor({
      anchor: anchors[i],
      track,
      harmonicContext,
    });
    const seen = new Set();
    const merged = [];
    for (const c of canonicalCandidates.concat(neoSoulCandidates)) {
      const key = `${c.pitchClasses.join(',')}|${c.qualityId}|${c.bassPitchClass ?? 'x'}`;
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(c);
    }
    if (merged.length === 0) {
      throw new RangeError(`buildNeoSoulHarmonizationPlan : aucun candidat pour l'ancre ${i}`);
    }
    candidateLayers.push(Object.freeze(merged));
  }

  const harmonicPathResult = findBestHarmonicPath({ candidateLayers: Object.freeze(candidateLayers) });
  const voicingPathResult = findBestVoicingPath({ harmonicPathResult });

  const enrichedVoicings = [];
  const voicingTechniqueUsed = [];
  for (let i = 0; i < N; i++) {
    const canonicalVoicing = voicingPathResult.voicings[i];
    const candidate = harmonicPathResult.path[i];

    const targetBass = canonicalVoicing.bassMidiNote || 43;
    const targetOctave = Math.floor(targetBass / 12) - 1;
    const neoSoulVoicings = generateNeoSoulVoicings(candidate, { centerOctave: targetOctave });

    if (neoSoulVoicings.length === 0) {
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

    for (const nv of neoSoulVoicings) {
      if (melodyPc !== null) {
        const voicingPcs = nv.midiNotes.map((n) => ((n % 12) + 12) % 12);
        if (!voicingPcs.includes(melodyPc)) continue;
      }
      const movement = computeMovement(prevNotes, nv.midiNotes);
      if (movement <= bestMovement + 20) {
        bestMovement = movement;
        best = {
          candidate: nv.candidate,
          midiNotes: nv.midiNotes,
          leftHand: nv.leftHand,
          rightHand: nv.rightHand,
          bassMidiNote: nv.bassMidiNote,
          bassPitchClass: nv.bassPitchClass,
          inversionInterval: nv.inversionInterval,
          isRootPosition: nv.isRootPosition,
          spanSemitones: nv.spanSemitones,
          registerDeviation: nv.registerDeviation,
        };
        bestTechnique = identifyNeoSoulVoicingTechnique(nv);
      }
    }

    enrichedVoicings.push(Object.freeze(best));
    voicingTechniqueUsed.push(bestTechnique);
  }

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
      neoSoulVoicingTechnique: voicingTechniqueUsed[i],
    }));
  }
  const steps = Object.freeze(stepsArr);

  const used = [];
  const usedTechniqueIds = new Set();
  for (let i = 0; i < steps.length; i++) {
    const tech = identifyNeoSoulTechnique(steps[i].candidate);
    if (tech) {
      used.push({ techniqueId: tech.id, name: tech.name, stepIndex: i });
      usedTechniqueIds.add(tech.id);
    }
  }
  const allTechniques = listNeoSoulTechniques();
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