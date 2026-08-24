// [OpenCode] — 2026-08-07 — Incrément 9, Lot 1 : orchestrateur UI du moteur
// canonique de réharmonisation.
//
// Rôle exclusif :
//   1. recevoir un wrapper canonique { track, harmonicContext } ;
//   2. appeler UNIQUEMENT buildHarmonizationPlan() de
//      src/melody/harmonization-planner.js ;
//   3. convertir le HarmonizationPlan renvoyé en un modèle de vue distinct et
//      non mutable (viewModel) destiné à la couche UI ;
//   4. capturer proprement TypeError et RangeError du planificateur.
//
// Cet orchestrateur ne prend AUCUNE décision musicale : il ne recalcule ni
// accord, ni voicing, ni score. Il ne modifie jamais le plan ni ses sous-objets.
// Il n'importe ni l'ancien moteur de substitution par style (couche analyzer
// historique) ni le moteur de voicing de l'UI : les voicings affichés
// proviennent exclusivement de plan.steps[i].voicing (voicing-path-finder
// canonique).

import { buildHarmonizationPlan } from '../melody/harmonization-planner.js';
import { buildGospelHarmonizationPlan } from '../melody/gospel-harmonization-planner.js';
import { identifyGospelTechnique } from '../melody/gospel-techniques.js';
import { validateReharmonizationPlan } from '../melody/reharmonization-validator.js';
import {
  spellChordReference,
  formatSpelledPitch,
  spellMidiNote,
} from '../melody/spelled-pitch.js';

// Champs stricts acceptés par le planificateur. Tout autre champ (style,
// rehararm, reharmonization, settings, ui*, meta, etc.) est interdit au moteur.
const ALLOWED_WRAPPER_KEYS = Object.freeze(['track', 'harmonicContext']);

/**
 * Extrait exactement { track, harmonicContext } d'une entrée potentiellement
 * enrichie par la couche UI (meta, labels, etc.). Garantit qu'aucun champ
 * interdit n'atteint le moteur canonique.
 *
 * @param {{ track: object, harmonicContext: object }} input
 * @returns {{ track: object, harmonicContext: object }}
 */
export function sanitizeHarmonizationInput(input) {
  return {
    track: input.track,
    harmonicContext: input.harmonicContext,
  };
}

// --- Helpers de présentation (lecture seule sur les objets canoniques) -----

function chordSymbol(candidate, tonalContext) {
  if (!candidate || !candidate.chord) return '—';
  const spelled = spellChordReference(candidate.chord, tonalContext);
  const root = formatSpelledPitch(spelled.rootSpelling);
  let symbol = root + (spelled.quality || '');
  if (spelled.bass != null && spelled.bassSpelling) {
    symbol += '/' + formatSpelledPitch(spelled.bassSpelling);
  }
  return symbol;
}

function noteName(midi, tonalContext) {
  if (!Number.isInteger(midi)) return null;
  return formatSpelledPitch(spellMidiNote(midi, tonalContext), { showOctave: true });
}

function topNoteForAnchor(anchor, track) {
  if (!anchor || !anchor.melodyEventId) return null;
  const event = track.events.find((e) => e.id === anchor.melodyEventId);
  return event ? event.midi : null;
}

// Copie défensive et non mutable d'un candidat pour la couche UI.
function mapAlternative(candidate, tonalContext) {
  return Object.freeze({
    id: candidate.id,
    symbol: chordSymbol(candidate, tonalContext),
    qualityId: candidate.qualityId,
    melodyCompatibilityCategory: candidate.melodyCompatibility
      ? candidate.melodyCompatibility.category
      : null,
    locked: candidate.locked === true,
    source: candidate.source || null,
  });
}

function mapStep(step, track, tonalContext) {
  const topNote = topNoteForAnchor(step.anchor, track);
  const voicing = step.voicing;
  const melComp = step.candidate ? step.candidate.melodyCompatibility : null;

  return Object.freeze({
    index: step.index,
    anchorId: step.anchor.id,
    anchorType: step.anchor.type,
    anchorLabel: step.anchor.label || step.anchor.type,
    melodyEventId: step.anchor.melodyEventId || null,
    topNoteMidi: topNote,
    topNoteName: noteName(topNote, tonalContext),
    chordSymbol: chordSymbol(step.candidate, tonalContext),
    chordQualityId: step.candidate ? step.candidate.qualityId : null,
    // Compatibilité mélodique RÉELLE issue du moteur (objet canonique copié).
    melodyCompatibility: melComp
      ? Object.freeze({
          category: melComp.category,
          melodyPitchClass: melComp.melodyPitchClass,
          melodyMidi: melComp.melodyMidi,
          matchingInterval: melComp.matchingInterval,
          exactPitchRequired: melComp.exactPitchRequired,
          exactPitchSatisfied: melComp.exactPitchSatisfied,
          sopranoPolicy: melComp.sopranoPolicy,
          harmonizationPolicy: melComp.harmonizationPolicy,
          reasons: Object.freeze([...(melComp.reasons || [])]),
        })
      : null,
    // Notes du voicing RÉEL (voicing-path-finder canonique), copiées.
    voicingMidiNotes: Object.freeze([...(voicing.midiNotes || [])]),
    voicingLeftHand: Object.freeze([...(voicing.leftHand || [])]),
    voicingRightHand: Object.freeze([...(voicing.rightHand || [])]),
    voicingBassMidiNote: voicing.bassMidiNote,
    voicingIsRootPosition: voicing.isRootPosition,
    voicingSpanSemitones: voicing.spanSemitones,
    // Score de transition RÉEL lorsqu'il existe (null à l'indice 0).
    harmonicTransitionTotal: step.harmonicTransition ? step.harmonicTransition.totalScore : null,
    voicingTransitionCost: step.voicingTransition ? step.voicingTransition.score.cost : null,
    voicingTransitionTotalMovement: step.voicingTransition
      ? step.voicingTransition.score.totalMovement
      : null,
    // Alternatives RÉELLES de candidateLayer (consultation seule).
    // Invariant canonique : le chemin conserve la référence exacte du candidat
    // sélectionné, donc step.candidate appartient à candidateLayer. On l'exclut
    // de la présentation : la liste « Alternatives » ne contient que les candidats
    // NON retenus, dans l'ordre original du générateur. Transformation de
    // présentation uniquement — aucune nouvelle décision musicale, aucun tri par
    // score, aucune modification de candidateLayer ni de step.candidate.
    alternatives: Object.freeze(
      (step.candidateLayer || [])
        .filter((c) => c !== step.candidate)
        .map((c) => mapAlternative(c, tonalContext)),
    ),
  });
}

function mapTotals(plan) {
  const h = plan.harmonicPathResult;
  const v = plan.voicingPathResult;
  return Object.freeze({
    harmonicPathTotal: h.totalScore,
    harmonicCompatibilityScore: h.compatibilityScore,
    harmonicTransitionScore: h.transitionScore,
    harmonicWeights: Object.freeze({
      compatibility: h.weights.compatibility,
      transition: h.weights.transition,
    }),
    voicingTotalCost: v.totalCost,
    voicingTotalMovement: v.totalMovement,
    voicingRegisterDeviation: v.registerDeviation,
    voicingParallelFifths: v.parallelFifths,
    voicingParallelOctaves: v.parallelOctaves,
  });
}

/**
 * Fonction pure de transformation d'un HarmonizationPlan canonique en modèle de
 * vue UI. Ne fait que LIRE le plan (et track/harmonicContext passés par
 * l'appelant) : aucune décision musicale, aucun recalcul d'accord ou de voicing,
 * aucun appel à un autre moteur, aucune mutation du plan ni de ses sous-objets.
 *
 * @param {import('../melody/midi-types.js').HarmonizationPlan} plan
 * @param {{ track: object, harmonicContext: object }} ctx - track et
 *   harmonicContext utilisés pour résoudre la top note de chaque ancre.
 * @returns {{ status: 'success', steps: object[], totals: object, meta: object }}
 *   Modèle de vue figé (même forme « success » que buildReharmonizationViewModel).
 */
export function mapHarmonizationPlanToViewModel(plan, { track, harmonicContext }) {
  const tonalContext = harmonicContext.tonalContext || null;
  const steps = plan.steps.map((step) => mapStep(step, track, tonalContext));
  return Object.freeze({
    status: 'success',
    steps: Object.freeze(steps),
    totals: mapTotals(plan),
    meta: Object.freeze({
      trackId: track.id,
      harmonicContextId: harmonicContext.id,
      anchorCount: harmonicContext.anchors.length,
      stepCount: plan.steps.length,
    }),
  });
}

/**
 * Construit le modèle de vue UI à partir d'un wrapper canonique.
 *
 * @param {{ track: object, harmonicContext: object }} input
 * @returns {{
 *   status: 'success' | 'error',
 *   errorKind?: 'TypeError' | 'RangeError' | 'Error',
 *   message?: string,
 *   steps?: object[],
 *   totals?: object,
 *   meta?: object
 * }}
 *   - status 'success' : `steps` (un par ancre), `totals` (chemins harmonique et
 *     voicing), `meta` (identifiants et comptages).
 *   - status 'error' : `errorKind` et `message` traduits du planificateur.
 *   Aucun champ `style`, `reharmonization` ou `settings` n'est jamais transmis
 *   au moteur : seul le wrapper sanitisé { track, harmonicContext } l'atteint.
 */
export function buildReharmonizationViewModel(input) {
  // Validation minimale du wrapper avant sanitarisation.
  if (
    !input
    || typeof input !== 'object'
    || Array.isArray(input)
    || !input.track
    || !input.harmonicContext
  ) {
    return {
      status: 'error',
      errorKind: 'TypeError',
      message: 'Entrée canonique invalide : wrapper { track, harmonicContext } requis.',
    };
  }

  // Wrapper strict envoyé au moteur : exactement les deux clés canoniques.
  const wrapper = sanitizeHarmonizationInput(input);
  const wrapperKeys = Object.keys(wrapper).sort();
  if (wrapperKeys.join(',') !== ALLOWED_WRAPPER_KEYS.slice().sort().join(',')) {
    // Garde-fou : ne devrait jamais échouer grâce à sanitizeHarmonizationInput.
    return {
      status: 'error',
      errorKind: 'TypeError',
      message: 'Wrapper canonique corrompu avant envoi au moteur.',
    };
  }

  try {
    const plan = buildHarmonizationPlan(wrapper);
    return mapHarmonizationPlanToViewModel(plan, wrapper);
  } catch (err) {
    const errorKind = err instanceof TypeError
      ? 'TypeError'
      : err instanceof RangeError
        ? 'RangeError'
        : 'Error';
    return {
      status: 'error',
      errorKind,
      message: err.message || 'Erreur du planificateur de réharmonisation.',
    };
  }
}

// [OpenCode] — 2026-08-24 — Réharmonisation V1, Tâche 2 : variante Gospel.
// Identique à buildReharmonizationViewModel mais utilise l'orchestrateur
// Gospel (candidats canoniques enrichis des techniques Gospel) et ajoute le
// rapport de techniques au viewModel pour la traçabilité (critère 4 du score).
export function buildGospelReharmonizationViewModel(input) {
  if (
    !input
    || typeof input !== 'object'
    || Array.isArray(input)
    || !input.track
    || !input.harmonicContext
  ) {
    return {
      status: 'error',
      errorKind: 'TypeError',
      message: 'Entrée canonique invalide : wrapper { track, harmonicContext } requis.',
    };
  }
  const wrapper = sanitizeHarmonizationInput(input);
  try {
    const plan = buildGospelHarmonizationPlan(wrapper);
    const vm = mapHarmonizationPlanToViewModel(plan, wrapper);
    // Score de validité 4 critères (Tâche 3).
    const validationReport = validateReharmonizationPlan(plan);
    // Ajoute le rapport de techniques pour la traçabilité (critère 4) et le
    // score de validité au viewModel.
    return Object.freeze({
      ...vm,
      techniqueReport: plan.techniqueReport,
      validationReport,
    });
  } catch (err) {
    const errorKind = err instanceof TypeError
      ? 'TypeError'
      : err instanceof RangeError
        ? 'RangeError'
        : 'Error';
    return {
      status: 'error',
      errorKind,
      message: err.message || 'Erreur du planificateur Gospel.',
    };
  }
}
