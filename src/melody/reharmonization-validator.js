// [OpenCode] — 2026-08-24 — Réharmonisation V1, Tâche 3 : score de validité.
//
// Quatre critères vérifiables automatiquement sur la sortie du moteur de
// réharmonisation. Le score n'est JAMAIS une distance à une réponse jugée
// unique : il n'existe pas de réponse unique à une réharmonisation. Plusieurs
// réharmonisations différentes peuvent être également valables.
//
// Critères :
//   1. Mélodie audible : la note mélodique est présente dans le voicing.
//   2. Résolution des passages : un accord de passage se résout vers une cible.
//   3. Absence de quintes/octaves parallèles consécutives.
//   4. Traçabilité : chaque accord est justifiable par une règle explicite.
//
// Aucune décision musicale : lecture seule du plan.

import { identifyGospelTechnique, GOSPEL_TECHNIQUES } from './gospel-techniques.js';

// Sources canoniques considérées comme justifiables (règles explicites du
// moteur canonique + techniques Gospel).
const JUSTIFIABLE_SOURCES = new Set([
  'locked-boundary',
  'manual',
  'diatonic',
  'substitution',
  'secondary-dominant',
  'diminished-approach',
  'borrowed',
  ...GOSPEL_TECHNIQUES.map((t) => t.source),
]);

// Sources qui dénotent un accord de passage (la résolution est obligatoire).
const PASSAGE_SOURCES = new Set([
  'secondary-dominant',
  'diminished-approach',
  'gospel-passage-7b9',
  'gospel-passage-7sharp5',
]);

// Sources qui dénotent un accord structurel (pas de résolution requise).
const STRUCTURAL_SOURCES = new Set([
  'locked-boundary',
  'manual',
  'diatonic',
  'substitution',
  'borrowed',
  'gospel-add9',
  'gospel-add6',
  'gospel-sus2',
]);

/**
 * @typedef {{
 *   criterionId: string,
 *   criterionName: string,
 *   satisfied: boolean,
 *   details: string,
 *   failingStepIndices: number[]
 * }} CriterionResult
 */

/**
 * @typedef {{
 *   score: number,
 *   maxScore: number,
 *   ratio: number,
 *   criteria: CriterionResult[],
 *   summary: string
 * }} ValidationReport
 */

/**
 * Valide un plan de réharmonisation sur les 4 critères.
 *
 * @param {{ steps: object[], voicingPathResult: { parallelFifths: number, parallelOctaves: number }, track?: object }} plan
 * @returns {ValidationReport}
 */
export function validateReharmonizationPlan(plan) {
  if (!plan || !Array.isArray(plan.steps) || !plan.voicingPathResult) {
    return {
      score: 0,
      maxScore: 4,
      ratio: 0,
      criteria: [],
      summary: 'Plan invalide.',
    };
  }

  const steps = plan.steps;
  const track = plan.track || null;

  const criteria = [
    checkMelodyAudible(steps, track),
    checkPassageResolution(steps),
    checkNoParallelMotions(plan),
    checkTraceability(steps),
  ];

  const score = criteria.filter((c) => c.satisfied).length;
  const ratio = score / 4;
  const summary = `${score}/4 critères satisfaits : `
    + criteria.map((c) => `${c.criterionName}=${c.satisfied ? 'OK' : 'KO'}`).join(', ');

  return Object.freeze({
    score,
    maxScore: 4,
    ratio,
    criteria: Object.freeze(criteria),
    summary,
  });
}

// ---------------------------------------------------------------------------
// Critère 1 : la note mélodique est présente dans le voicing
// ---------------------------------------------------------------------------

function checkMelodyAudible(steps, track) {
  const failing = [];
  if (!track || !track.events) {
    return {
      criterionId: 'melody-audible',
      criterionName: 'Mélodie audible',
      satisfied: true,
      details: 'Aucune track fournie : critère non applicable (considéré OK).',
      failingStepIndices: [],
    };
  }
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    if (!step.anchor || !step.anchor.melodyEventId) continue;
    const ev = track.events.find((e) => e.id === step.anchor.melodyEventId);
    if (!ev) continue;
    const melodyPc = ((ev.midi % 12) + 12) % 12;
    const voicingNotes = step.voicing?.midiNotes || [];
    const voicingPcs = voicingNotes.map((n) => ((n % 12) + 12) % 12);
    if (!voicingPcs.includes(melodyPc)) {
      failing.push(i);
    }
  }
  return {
    criterionId: 'melody-audible',
    criterionName: 'Mélodie audible',
    satisfied: failing.length === 0,
    details: failing.length === 0
      ? 'La note mélodique est présente dans le voicing à chaque step.'
      : `${failing.length} step(s) sans la mélodie dans le voicing.`,
    failingStepIndices: failing,
  };
}

// ---------------------------------------------------------------------------
// Critère 2 : résolution des accords de passage
// ---------------------------------------------------------------------------

function checkPassageResolution(steps) {
  const failing = [];
  for (let i = 0; i < steps.length - 1; i++) {
    const src = steps[i].candidate?.source;
    if (!src || !PASSAGE_SOURCES.has(src)) continue;
    // Step i est un passage. Step i+1 doit être structurel (diatonique,
    // substitution, add9/add6/sus2, ou manual/locked). Une chaîne de passages
    // courte (passage → passage → structurel) est tolérée si le passage
    // suivant résout à son tour : on vérifie que le dernier step n'est pas
    // un passage sans cible.
    let j = i + 1;
    while (j < steps.length - 1 && PASSAGE_SOURCES.has(steps[j].candidate?.source || '')) j++;
    const targetSrc = steps[j]?.candidate?.source;
    if (!targetSrc || !STRUCTURAL_SOURCES.has(targetSrc)) {
      failing.push(i);
    }
  }
  // Dernier step : si c'est un passage sans cible, échec.
  const lastSrc = steps[steps.length - 1]?.candidate?.source;
  if (lastSrc && PASSAGE_SOURCES.has(lastSrc)) {
    failing.push(steps.length - 1);
  }
  return {
    criterionId: 'passage-resolution',
    criterionName: 'Résolution des passages',
    satisfied: failing.length === 0,
    details: failing.length === 0
      ? 'Tous les accords de passage se résolvent vers une cible structurelle.'
      : `${failing.length} passage(s) non résolu(s) (steps ${failing.join(', ')}).`,
    failingStepIndices: failing,
  };
}

// ---------------------------------------------------------------------------
// Critère 3 : absence de quintes/octaves parallèles
// ---------------------------------------------------------------------------

function checkNoParallelMotions(plan) {
  const fifths = plan.voicingPathResult.parallelFifths || 0;
  const octaves = plan.voicingPathResult.parallelOctaves || 0;
  const total = fifths + octaves;
  return {
    criterionId: 'no-parallel-motion',
    criterionName: 'Pas de quintes/octaves parallèles',
    satisfied: total === 0,
    details: `${fifths} quinte(s) parallèle(s), ${octaves} octave(s) parallèle(s).`,
    failingStepIndices: [],
  };
}

// ---------------------------------------------------------------------------
// Critère 4 : traçabilité de chaque accord à une règle
// ---------------------------------------------------------------------------

function checkTraceability(steps) {
  const failing = [];
  for (let i = 0; i < steps.length; i++) {
    const src = steps[i].candidate?.source;
    if (!src || !JUSTIFIABLE_SOURCES.has(src)) {
      failing.push(i);
    }
  }
  return {
    criterionId: 'traceability',
    criterionName: 'Traçabilité à une règle',
    satisfied: failing.length === 0,
    details: failing.length === 0
      ? 'Chaque accord est justifiable par une règle canonique ou Gospel.'
      : `${failing.length} accord(s) non justifiable(s) (steps ${failing.join(', ')}).`,
    failingStepIndices: failing,
  };
}