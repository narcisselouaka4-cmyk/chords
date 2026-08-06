// [OpenCode] — 2026-08-06 — Incrément 4 : génération des candidats d’accords.
// Pour chaque ancre harmonique éligible, produit un ensemble déterministe de
// ChordCandidate compatibles avec la mélodie, les politiques, le contexte tonal
// et les accords de début/fin verrouillés.
//
// Ce module est pur : pas de DOM, pas de réseau, pas d’IA, pas de mutation des
// entrées. Il consomme exclusivement CHORD_DEFINITIONS via
// resolveCanonicalChordDefinition / parseChordSymbol.

import { resolveCanonicalChordDefinition, parseChordSymbol } from '../chord-engine/chord-display.js';
import { CHORD_DEFINITIONS } from '../chord-engine/chord-defs.js';
import { transposePc } from '../chord-engine/intervals.js';
import {
  spellPitchClass,
  spellMidiNote,
  spellChordReference,
  parseSpelledChordSymbol,
} from './spelled-pitch.js';

// ---------------------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------------------

// Vocabulaire harmonique initial supporté.
const SUPPORTED_QUALITIES = new Set([
  '', 'm', 'maj7', 'm7', '7', 'm7b5', 'dim7',
  '6', 'm6', '6/9', 'maj9', 'm9', '9',
  '7sus4', '9sus4', '7b9', '13',
]);

// Ordre de priorité déterministe des sources.
const SOURCE_PRIORITY = {
  'locked-boundary': 0,
  'manual': 1,
  'diatonic': 2,
  'substitution': 3,
  'secondary-dominant': 4,
  'diminished-approach': 5,
  'borrowed': 6,
};

const DEFAULT_MAX_CANDIDATES_PER_ANCHOR = 20;

// Degrés diatoniques majeurs en jazz : qualité et intervalle depuis la tonique.
const MAJOR_DEGREES = [
  { degree: 0, quality: 'maj7', rootOffset: 0, roman: 'I' },
  { degree: 1, quality: 'm7', rootOffset: 2, roman: 'ii' },
  { degree: 2, quality: 'm7', rootOffset: 4, roman: 'iii' },
  { degree: 3, quality: 'maj7', rootOffset: 5, roman: 'IV' },
  { degree: 4, quality: '7', rootOffset: 7, roman: 'V' },
  { degree: 5, quality: 'm7', rootOffset: 9, roman: 'vi' },
  { degree: 6, quality: 'm7b5', rootOffset: 11, roman: 'vii°' },
];

// Degrés diatoniques mineurs naturels (tonique = degré I mineur).
const MINOR_DEGREES = [
  { degree: 0, quality: 'm7', rootOffset: 0, roman: 'i' },
  { degree: 1, quality: 'm7b5', rootOffset: 2, roman: 'ii°' },
  { degree: 2, quality: 'maj7', rootOffset: 3, roman: 'III' },
  { degree: 3, quality: 'm7', rootOffset: 5, roman: 'iv' },
  { degree: 4, quality: '7', rootOffset: 7, roman: 'V' },
  { degree: 5, quality: 'maj7', rootOffset: 8, roman: 'VI' },
  { degree: 6, quality: '7', rootOffset: 10, roman: 'VII' },
];

// Substitutions diatoniques documentées.
// Chaque entrée indique : dans un mode donné, le degré source peut substituer
// le degré cible lorsque la note mélodique est compatible.
const DIATONIC_SUBSTITUTIONS = [
  // En majeur, iii (m7) peut substituer I (maj7) : Em7 et Cmaj7 partagent E, G, B.
  { mode: 'major', sourceDegree: 2, targetDegree: 0, relation: 'iii-for-I' },
  // En majeur, vi (m7) peut substituer IV (maj7) : Am7 et Fmaj7 partagent A, C, E.
  { mode: 'major', sourceDegree: 5, targetDegree: 3, relation: 'vi-for-IV' },
];

// ---------------------------------------------------------------------------
// Types conceptuels (documentés dans ./midi-types.js)
// ---------------------------------------------------------------------------

/**
 * @typedef {import('./midi-types.js').HarmonicAnchor} HarmonicAnchor
 * @typedef {import('./midi-types.js').HarmonicContext} HarmonicContext
 * @typedef {import('./midi-types.js').MelodyEvent} MelodyEvent
 * @typedef {import('./midi-types.js').MelodyTrack} MelodyTrack
 * @typedef {import('./midi-types.js').TonalContext} TonalContext
 * @typedef {import('./midi-types.js').ChordReference} ChordReference
 * @typedef {import('./midi-types.js').ChordCandidate} ChordCandidate
 * @typedef {import('./midi-types.js').MelodyCompatibility} MelodyCompatibility
 * @typedef {import('./midi-types.js').TonalRelation} TonalRelation
 * @typedef {import('./midi-types.js').CandidateValidationReport} CandidateValidationReport
 * @typedef {import('./midi-types.js').AnchorCandidateGenerationResult} AnchorCandidateGenerationResult
 * @typedef {import('./midi-types.js').ValidationIssue} ValidationIssue
 */

// ---------------------------------------------------------------------------
// Helpers de base
// ---------------------------------------------------------------------------

function normalizePc(pc) {
  return ((pc % 12) + 12) % 12;
}

function isValidPitchClass(pc) {
  return Number.isInteger(pc) && pc >= 0 && pc <= 11;
}

function isSupportedQuality(quality) {
  return typeof quality === 'string' && SUPPORTED_QUALITIES.has(quality);
}

/**
 * Retourne la définition canonique d'une qualité supportée, ou null.
 *
 * @param {string} quality
 * @returns {{ name: string, symbol: string, intervals: number[], identityIntervals?: number[], optionalIntervals?: number[], defaultOmissions?: number[], supportedOmissions?: number[], extensionIntervals?: number[], suspensionIntervals?: number[] } | null}
 */
function getCanonicalDefinition(quality) {
  const def = resolveCanonicalChordDefinition(quality);
  if (!def) return null;
  return def;
}

/**
 * Calcule les pitch classes d'un accord à partir de sa fondamentale et qualité.
 *
 * @param {number} rootPc
 * @param {string} quality
 * @returns {number[]}
 */
function computeChordPitchClasses(rootPc, quality) {
  const def = getCanonicalDefinition(quality);
  const intervals = def ? def.intervals : [0, 4, 7];
  const pcs = intervals.map((i) => normalizePc(rootPc + i));
  return Array.from(new Set(pcs)).sort((a, b) => a - b);
}

/**
 * Retourne les métadonnées d'identité d'une qualité, avec valeurs par défaut.
 *
 * @param {string} quality
 * @returns {{
 *   identityIntervals: number[],
 *   optionalIntervals: number[],
 *   defaultOmissions: number[],
 *   supportedOmissions: number[],
 *   extensionIntervals: number[],
 *   suspensionIntervals: number[]
 * }}
 */
function getIdentityMetadata(quality) {
  const def = getCanonicalDefinition(quality);
  const intervals = def ? def.intervals : [0, 4, 7];
  const nonRoot = intervals.filter((i) => i !== 0);

  // Valeurs par défaut : tout intervalle non-fondamentale est identitaire,
  // sauf la quinte juste (7) considérée comme optionnelle.
  const defaultIdentity = nonRoot.filter((i) => i !== 7);
  const defaultOptional = nonRoot.includes(7) ? [7] : [];

  return {
    identityIntervals: def && def.identityIntervals ? def.identityIntervals : defaultIdentity,
    optionalIntervals: def && def.optionalIntervals ? def.optionalIntervals : defaultOptional,
    defaultOmissions: def && def.defaultOmissions ? def.defaultOmissions : [],
    supportedOmissions: def && def.supportedOmissions ? def.supportedOmissions : [],
    extensionIntervals: def && def.extensionIntervals ? def.extensionIntervals : [],
    suspensionIntervals: def && def.suspensionIntervals ? def.suspensionIntervals : [],
  };
}

/**
 * Construit une ChordReference à partir de données numériques, avec orthographe
 * contextuelle.
 *
 * @param {number} rootPc
 * @param {string} quality
 * @param {number | null} bassPc
 * @param {TonalContext | null} tonalContext
 * @param {ChordReference | null} explicitReference
 * @returns {ChordReference}
 */
function buildChordReference(rootPc, quality, bassPc, tonalContext, explicitReference) {
  if (explicitReference) {
    return spellChordReference(explicitReference, tonalContext);
  }

  // Sans symbole original explicite, on applique directement l'orthographe
  // contextuelle. On ne construit pas de symbole artificiel avec dièses qui
  // serait interprété comme une orthographe explicite.
  return {
    root: rootPc,
    quality,
    bass: bassPc,
    rootSpelling: spellPitchClass(rootPc, tonalContext),
    bassSpelling: bassPc != null ? spellPitchClass(bassPc, tonalContext) : null,
    originalSymbol: null,
  };
}

/**
 * Propose une orthographe contextuelle pour chaque note de l'accord.
 *
 * @param {number[]} pitchClasses
 * @param {TonalContext | null} tonalContext
 * @returns {import('./midi-types.js').SpelledPitch[]}
 */
function spellChordTones(pitchClasses, tonalContext) {
  return pitchClasses.map((pc) => spellPitchClass(pc, tonalContext));
}

/**
 * Détermine le degré diatonique d'une fondamentale dans une tonalité.
 *
 * @param {number} rootPc
 * @param {TonalContext | null} tonalContext
 * @returns {{ degree: number | null, romanNumeral: string | null, mode: string | null }}
 */
function resolveDegree(rootPc, tonalContext) {
  if (!tonalContext || !tonalContext.selected) {
    return { degree: null, romanNumeral: null, mode: null };
  }
  const tonic = normalizePc(tonalContext.selected.tonicPitchClass);
  const mode = tonalContext.selected.mode;
  const degrees = mode === 'minor' ? MINOR_DEGREES : MAJOR_DEGREES;
  const match = degrees.find((d) => normalizePc(tonic + d.rootOffset) === normalizePc(rootPc));
  if (!match) return { degree: null, romanNumeral: null, mode };
  return { degree: match.degree, romanNumeral: match.roman, mode };
}

// ---------------------------------------------------------------------------
// Identifiants déterministes
// ---------------------------------------------------------------------------

function makeCandidateId(anchorId, rootPc, quality, bassPc, source, melodyPc) {
  const bass = bassPc != null ? String(bassPc) : 'x';
  return `cand-${anchorId}-r${rootPc}-q${quality || 'maj'}-b${bass}-s${source}-m${melodyPc}`;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/**
 * Valide un candidat brut.
 *
 * @param {ChordCandidate} candidate
 * @param {object} context
 * @returns {CandidateValidationReport}
 */
function validateChordCandidate(candidate, context) {
  const hardViolations = [];
  const warnings = [];
  const satisfiedConstraints = [];

  // 1. Ancre valide
  if (!candidate.anchorId) {
    hardViolations.push({
      severity: 'error',
      code: 'MISSING_ANCHOR_ID',
      message: 'Le candidat n\'a pas d\'identifiant d\'ancre.',
      anchorId: null,
      melodyEventId: candidate.melodyEventId,
      details: {},
    });
  } else {
    satisfiedConstraints.push('anchor-id-present');
  }

  // 2. Qualité canonique
  if (!isSupportedQuality(candidate.qualityId)) {
    hardViolations.push({
      severity: 'error',
      code: 'UNSUPPORTED_QUALITY',
      message: `La qualité "${candidate.qualityId}" n'est pas dans le vocabulaire initial.`,
      anchorId: candidate.anchorId,
      melodyEventId: candidate.melodyEventId,
      details: { qualityId: candidate.qualityId },
    });
  } else {
    satisfiedConstraints.push('quality-in-vocabulary');
  }

  const def = getCanonicalDefinition(candidate.qualityId);
  if (!def) {
    hardViolations.push({
      severity: 'error',
      code: 'UNKNOWN_DEFINITION',
      message: `Aucune définition canonique pour "${candidate.qualityId}".`,
      anchorId: candidate.anchorId,
      melodyEventId: candidate.melodyEventId,
      details: { qualityId: candidate.qualityId },
    });
  } else {
    satisfiedConstraints.push('canonical-definition-exists');
  }

  // 3. Orthographe valide
  if (!candidate.rootSpelling || candidate.rootSpelling.pitchClass !== candidate.rootPitchClass) {
    hardViolations.push({
      severity: 'error',
      code: 'INVALID_ROOT_SPELLING',
      message: 'Orthographe de fondamentale incohérente avec la pitch class.',
      anchorId: candidate.anchorId,
      melodyEventId: candidate.melodyEventId,
      details: { rootPitchClass: candidate.rootPitchClass },
    });
  } else {
    satisfiedConstraints.push('root-spelling-valid');
  }

  // 4. Intervalles identitaires préservables
  const meta = getIdentityMetadata(candidate.qualityId);
  for (const interval of meta.identityIntervals) {
    const expectedPc = normalizePc(candidate.rootPitchClass + interval);
    if (!candidate.pitchClasses.includes(expectedPc)) {
      hardViolations.push({
        severity: 'error',
        code: 'MISSING_IDENTITY_INTERVAL',
        message: `Intervalle identitaire ${interval} manquant pour ${candidate.qualityId}.`,
        anchorId: candidate.anchorId,
        melodyEventId: candidate.melodyEventId,
        details: { interval, expectedPitchClass: expectedPc },
      });
    }
  }
  if (hardViolations.every((v) => v.code !== 'MISSING_IDENTITY_INTERVAL')) {
    satisfiedConstraints.push('identity-intervals-preserved');
  }

  // 5. Mélodie compatible selon les politiques
  const compat = candidate.melodyCompatibility;
  if (compat.category === 'incompatible') {
    hardViolations.push({
      severity: 'error',
      code: 'MELODY_INCOMPATIBLE',
      message: `La mélodie (pc ${compat.melodyPitchClass}) est incompatible avec ${candidate.qualityId}.`,
      anchorId: candidate.anchorId,
      melodyEventId: candidate.melodyEventId,
      details: { melodyPitchClass: compat.melodyPitchClass },
    });
  } else {
    satisfiedConstraints.push('melody-compatible');
  }

  // 6. Omission autorisée
  for (const omitted of candidate.omittedIntervals) {
    if (!meta.supportedOmissions.includes(omitted) && !meta.optionalIntervals.includes(omitted)) {
      hardViolations.push({
        severity: 'error',
        code: 'FORBIDDEN_OMISSION',
        message: `L'omission de l'intervalle ${omitted} n'est pas supportée pour ${candidate.qualityId}.`,
        anchorId: candidate.anchorId,
        melodyEventId: candidate.melodyEventId,
        details: { omittedInterval: omitted },
      });
    }
  }
  if (!hardViolations.some((v) => v.code === 'FORBIDDEN_OMISSION')) {
    satisfiedConstraints.push('omissions-allowed');
  }

  // 7. Avertissements contextuels
  if (candidate.tonalRelation.borrowed) {
    warnings.push({
      severity: 'warning',
      code: 'BORROWED_CHORD',
      message: `Accord emprunté : ${candidate.tonalRelation.romanNumeral || ''}.`,
      anchorId: candidate.anchorId,
      melodyEventId: candidate.melodyEventId,
      details: { tonalRelation: candidate.tonalRelation },
    });
  }

  // 8. Avertissements heuristiques sur les catégories mélodiques permissives.
  // Ces classifications sont initiales ; la justification musicale complète
  // (durée, position temporelle, résolution) sera vérifiée lors du voicing.
  if (compat.category === 'non-chord-tone-allowed') {
    warnings.push({
      severity: 'warning',
      code: 'NON_CHORD_TONE_HEURISTIC',
      message: 'Note mélodique classée comme non-chord-tone autorisée : justification musicale à vérifier lors du voicing.',
      anchorId: candidate.anchorId,
      melodyEventId: candidate.melodyEventId,
      details: { melodyPitchClass: compat.melodyPitchClass },
    });
  }
  if (compat.category === 'suspension') {
    warnings.push({
      severity: 'warning',
      code: 'SUSPENSION_HEURISTIC',
      message: 'Note mélodique classée comme suspension : résolution et contexte à vérifier lors du voicing.',
      anchorId: candidate.anchorId,
      melodyEventId: candidate.melodyEventId,
      details: { melodyPitchClass: compat.melodyPitchClass, matchingInterval: compat.matchingInterval },
    });
  }

  return {
    valid: hardViolations.length === 0,
    hardViolations,
    warnings,
    satisfiedConstraints,
  };
}

// ---------------------------------------------------------------------------
// Compatibilité mélodique
// ---------------------------------------------------------------------------

/**
 * Classifie la compatibilité d'une note mélodique avec un candidat.
 *
 * @param {{
 *   melodyEvent: MelodyEvent | null,
 *   rootPc: number,
 *   quality: string,
 *   bassPc: number | null,
 *   policies: { sopranoPolicy: string, harmonizationPolicy: string, preserveExactPitch: boolean }
 * }} input
 * @returns {MelodyCompatibility}
 */
function classifyMelodyCompatibility(input) {
  const { melodyEvent, rootPc, quality, bassPc, policies } = input;

  const noMelodyResult = {
    category: 'non-chord-tone-allowed',
    melodyPitchClass: -1,
    melodyMidi: null,
    matchingInterval: null,
    exactPitchRequired: false,
    exactPitchSatisfied: false,
    sopranoPolicy: policies.sopranoPolicy,
    harmonizationPolicy: policies.harmonizationPolicy,
    reasons: ['Aucun événement mélodique fourni : l\'ancre est traitée sans contrainte mélodique.'],
  };

  if (!melodyEvent) {
    return noMelodyResult;
  }

  const melodyPc = normalizePc(melodyEvent.pitchClass);
  const melodyMidi = melodyEvent.midi;
  const interval = normalizePc(melodyPc - rootPc);

  const meta = getIdentityMetadata(quality);
  const allPcs = computeChordPitchClasses(rootPc, quality);
  const bassPcNorm = bassPc != null ? normalizePc(bassPc) : null;

  const reasons = [];
  let category = 'incompatible';
  let matchingInterval = null;

  if (allPcs.includes(melodyPc) || meta.identityIntervals.includes(interval)) {
    category = 'chord-tone';
    matchingInterval = interval;
    reasons.push(`La mélodie (pc ${melodyPc}) est une note constitutive de l'accord.`);
  } else if (meta.extensionIntervals.includes(interval)) {
    category = 'available-tension';
    matchingInterval = interval;
    reasons.push(`La mélodie (pc ${melodyPc}) est une tension disponible.`);
  } else if (meta.suspensionIntervals.includes(interval)) {
    category = 'suspension';
    matchingInterval = interval;
    reasons.push(`La mélodie (pc ${melodyPc}) est traitée comme suspension.`);
  } else if (policies.harmonizationPolicy === 'automatic') {
    category = 'non-chord-tone-allowed';
    matchingInterval = interval;
    reasons.push(`La mélodie (pc ${melodyPc}) est une note non constitutive tolérée en mode automatique.`);
  } else if (policies.harmonizationPolicy === 'force') {
    category = 'incompatible';
    reasons.push(`La mélodie (pc ${melodyPc}) n'appartient pas à l'accord en mode force.`);
  }

  // La basse slash n'influe pas sur la compatibilité mélodique : la note
  // mélodique est évaluée par rapport à l'accord complet.
  if (bassPcNorm != null && !allPcs.includes(bassPcNorm)) {
    reasons.push(`Basse slash ${bassPcNorm} ajoutée en dehors des notes de l'accord.`);
  }

  const exactPitchRequired = policies.preserveExactPitch === true;
  // La contrainte d'exactitude MIDI est enregistrée pour le voicing futur.
  // À ce stade, aucun voicing n'est généré : on ne prétend pas que la
  // contrainte est déjà satisfaite, et on évite toute réduction à la pitch class.
  const exactPitchSatisfied = exactPitchRequired ? false : true;

  if (exactPitchRequired) {
    reasons.push(`Contrainte d'exactitude MIDI enregistrée (midi ${melodyMidi}) pour le voicing futur.`);
  }

  return {
    category,
    melodyPitchClass: melodyPc,
    melodyMidi,
    matchingInterval,
    exactPitchRequired,
    exactPitchSatisfied,
    sopranoPolicy: policies.sopranoPolicy,
    harmonizationPolicy: policies.harmonizationPolicy,
    reasons,
  };
}

// ---------------------------------------------------------------------------
// Construction d'un candidat
// ---------------------------------------------------------------------------

/**
 * Construit un ChordCandidate complet et immuable.
 *
 * @param {object} input
 * @returns {ChordCandidate}
 */
function buildCandidate(input) {
  const {
    anchorId,
    melodyEvent,
    rootPc,
    quality,
    bassPc,
    tonalContext,
    source,
    locked,
    tonalRelation,
    explicitReference,
    policies: inputPolicies,
  } = input;

  const melodyEventId = melodyEvent ? melodyEvent.id : null;
  const chordRef = buildChordReference(rootPc, quality, bassPc, tonalContext, explicitReference);
  const pitchClasses = computeChordPitchClasses(rootPc, quality);
  const spelledTones = spellChordTones(pitchClasses, tonalContext);
  const meta = getIdentityMetadata(quality);

  const policies = inputPolicies || {
    sopranoPolicy: melodyEvent ? melodyEvent.sopranoPolicy : 'free',
    harmonizationPolicy: melodyEvent ? melodyEvent.harmonizationPolicy : 'automatic',
    preserveExactPitch: melodyEvent ? melodyEvent.preserveExactPitch : false,
  };

  const melodyCompatibility = classifyMelodyCompatibility({
    melodyEvent,
    rootPc,
    quality,
    bassPc,
    policies,
  });

  const candidate = {
    id: makeCandidateId(anchorId, rootPc, quality, bassPc, source, melodyEvent ? melodyEvent.pitchClass : -1),
    anchorId,
    melodyEventId,
    chord: chordRef,
    rootPitchClass: rootPc,
    rootSpelling: chordRef.rootSpelling,
    bassPitchClass: bassPc,
    bassSpelling: chordRef.bassSpelling,
    qualityId: quality,
    canonicalDefinitionId: quality,
    pitchClasses,
    spelledTones,
    identityIntervals: meta.identityIntervals,
    optionalIntervals: meta.optionalIntervals,
    omittedIntervals: meta.defaultOmissions,
    omissionReason: meta.defaultOmissions.length > 0
      ? 'Omissions par défaut documentées pour cette qualité.'
      : null,
    melodyCompatibility,
    tonalRelation,
    locked: locked === true,
    source,
    validation: {
      valid: true,
      hardViolations: [],
      warnings: [],
      satisfiedConstraints: [],
    },
  };

  candidate.validation = validateChordCandidate(candidate, {});
  return Object.freeze(candidate);
}

// ---------------------------------------------------------------------------
// Familles de candidats
// ---------------------------------------------------------------------------

function buildDiatonicCandidates(input) {
  const { anchorId, melodyEvent, tonalContext, locked, sourceOverride, policies } = input;
  if (!tonalContext || !tonalContext.selected) return [];

  const tonic = normalizePc(tonalContext.selected.tonicPitchClass);
  const mode = tonalContext.selected.mode;
  const degrees = mode === 'minor' ? MINOR_DEGREES : MAJOR_DEGREES;

  const candidates = [];
  for (const deg of degrees) {
    if (!isSupportedQuality(deg.quality)) continue;

    const rootPc = normalizePc(tonic + deg.rootOffset);
    const tonalRelation = {
      degree: deg.degree,
      romanNumeral: deg.roman,
      diatonic: true,
      borrowed: false,
      secondaryDominantTarget: null,
      approachType: 'none',
    };

    candidates.push(buildCandidate({
      anchorId,
      melodyEvent,
      rootPc,
      quality: deg.quality,
      bassPc: null,
      tonalContext,
      source: sourceOverride || 'diatonic',
      locked,
      tonalRelation,
      policies,
    }));
  }
  return candidates;
}

function buildDiatonicSubstitutionCandidates(input) {
  const { anchorId, melodyEvent, tonalContext, locked, policies } = input;
  if (!tonalContext || !tonalContext.selected) return [];

  const tonic = normalizePc(tonalContext.selected.tonicPitchClass);
  const mode = tonalContext.selected.mode;

  const candidates = [];
  for (const sub of DIATONIC_SUBSTITUTIONS) {
    if (sub.mode !== mode) continue;

    const degrees = mode === 'minor' ? MINOR_DEGREES : MAJOR_DEGREES;
    const sourceDeg = degrees.find((d) => d.degree === sub.sourceDegree);
    if (!sourceDeg || !isSupportedQuality(sourceDeg.quality)) continue;

    const rootPc = normalizePc(tonic + sourceDeg.rootOffset);
    const tonalRelation = {
      degree: sourceDeg.degree,
      romanNumeral: sourceDeg.roman,
      diatonic: true,
      borrowed: false,
      secondaryDominantTarget: null,
      approachType: 'diatonic-substitution',
    };

    candidates.push(buildCandidate({
      anchorId,
      melodyEvent,
      rootPc,
      quality: sourceDeg.quality,
      bassPc: null,
      tonalContext,
      source: 'substitution',
      locked,
      tonalRelation,
      policies,
    }));
  }
  return candidates;
}

function buildSecondaryDominantCandidates(input) {
  const { anchorId, melodyEvent, tonalContext, locked, policies } = input;
  if (!tonalContext || !tonalContext.selected) return [];

  const tonic = normalizePc(tonalContext.selected.tonicPitchClass);
  const mode = tonalContext.selected.mode;

  // Tables de dominantes secondaires valides.
  const majorTargets = [1, 2, 3, 4, 5, 6]; // V/ii, V/iii, V/IV, V/V, V/vi, V/vii°
  const minorTargets = [2, 3, 4, 5, 6]; // V/III, V/iv, V/V, V/VI, V/VII
  const targets = mode === 'minor' ? minorTargets : majorTargets;
  const degrees = mode === 'minor' ? MINOR_DEGREES : MAJOR_DEGREES;

  const candidates = [];
  for (const targetDegree of targets) {
    const targetDeg = degrees.find((d) => d.degree === targetDegree);
    if (!targetDeg) continue;

    // La dominante secondaire est un accord de 7 situé une quinte au-dessus
    // de la cible (intervalle +7 demi-tons).
    const targetRoot = normalizePc(tonic + targetDeg.rootOffset);
    const dominantRoot = normalizePc(targetRoot + 7);

    if (!isSupportedQuality('7')) continue;

    const tonalRelation = {
      degree: null,
      romanNumeral: `V/${targetDeg.roman}`,
      diatonic: false,
      borrowed: false,
      secondaryDominantTarget: targetDegree,
      approachType: 'secondary-dominant',
    };

    candidates.push(buildCandidate({
      anchorId,
      melodyEvent,
      rootPc: dominantRoot,
      quality: '7',
      bassPc: null,
      tonalContext,
      source: 'secondary-dominant',
      locked,
      tonalRelation,
      policies,
    }));
  }
  return candidates;
}

function buildDiminishedApproachCandidates(input) {
  const { anchorId, melodyEvent, tonalContext, locked, policies } = input;
  if (!tonalContext || !tonalContext.selected) return [];

  const tonic = normalizePc(tonalContext.selected.tonicPitchClass);
  const mode = tonalContext.selected.mode;
  const degrees = mode === 'minor' ? MINOR_DEGREES : MAJOR_DEGREES;

  const candidates = [];
  for (const targetDeg of degrees) {
    if (!isSupportedQuality('dim7')) continue;

    const targetRoot = normalizePc(tonic + targetDeg.rootOffset);
    // Diminué d'approche : fondamentale un demi-ton chromatique au-dessus de la cible.
    const approachRoot = normalizePc(targetRoot + 1);

    const tonalRelation = {
      degree: null,
      romanNumeral: `dim7→${targetDeg.roman}`,
      diatonic: false,
      borrowed: false,
      secondaryDominantTarget: null,
      approachType: 'diminished-approach',
    };

    candidates.push(buildCandidate({
      anchorId,
      melodyEvent,
      rootPc: approachRoot,
      quality: 'dim7',
      bassPc: null,
      tonalContext,
      source: 'diminished-approach',
      locked,
      tonalRelation,
      policies,
    }));
  }

  // Le dim7 est symétrique : quatre noms enharmoniques partagent les mêmes notes.
  // On retient un seul candidat par cible diatonique, pas quatre doublons.
  return candidates;
}

function buildBorrowedCandidates(input) {
  const { anchorId, melodyEvent, tonalContext, locked, policies } = input;
  if (!tonalContext || !tonalContext.selected) return [];

  const tonic = normalizePc(tonalContext.selected.tonicPitchClass);
  const mode = tonalContext.selected.mode;
  if (mode !== 'major') return [];

  // Emprunts modaux limités depuis le mineur parallèle.
  const borrowings = [
    { rootOffset: 3, quality: 'maj7', roman: 'bIII' },
    { rootOffset: 8, quality: 'maj7', roman: 'bVI' },
    { rootOffset: 10, quality: '7', roman: 'bVII' },
    { rootOffset: 5, quality: 'm7', roman: 'iv' },
  ];

  const candidates = [];
  for (const item of borrowings) {
    if (!isSupportedQuality(item.quality)) continue;
    const rootPc = normalizePc(tonic + item.rootOffset);
    const tonalRelation = {
      degree: null,
      romanNumeral: item.roman,
      diatonic: false,
      borrowed: true,
      secondaryDominantTarget: null,
      approachType: 'modal-borrowing',
    };

    candidates.push(buildCandidate({
      anchorId,
      melodyEvent,
      rootPc,
      quality: item.quality,
      bassPc: null,
      tonalContext,
      source: 'borrowed',
      locked,
      tonalRelation,
      policies,
    }));
  }
  return candidates;
}

// ---------------------------------------------------------------------------
// Dédoublonnage et limitation
// ---------------------------------------------------------------------------

/**
 * Construit une clé de dédoublonnage stable.
 *
 * @param {ChordCandidate} c
 * @returns {string}
 */
function dedupKey(c) {
  const pcs = c.pitchClasses.join(',');
  const bass = c.bassPitchClass != null ? String(c.bassPitchClass) : 'x';
  const degree = c.tonalRelation.degree != null ? String(c.tonalRelation.degree) : 'x';
  const approach = c.tonalRelation.approachType;
  const functionKey = `${degree}:${approach}:${c.tonalRelation.romanNumeral || ''}`;
  const spellingRoot = `${c.rootSpelling.letter}:${c.rootSpelling.accidental}`;
  return `${pcs}|${c.qualityId}|${bass}|${functionKey}|${spellingRoot}`;
}

/**
 * Supprime les doublons sonores et fonctionnels tout en conservant les
 * orthographes fonctionnellement distinctes.
 *
 * @param {ChordCandidate[]} candidates
 * @returns {ChordCandidate[]}
 */
function deduplicateChordCandidates(candidates) {
  const seen = new Map();
  const result = [];
  for (const c of candidates) {
    const key = dedupKey(c);
    if (!seen.has(key)) {
      seen.set(key, c);
      result.push(c);
    }
  }
  return result;
}

/**
 * Limite le nombre de candidats selon le plafond configuré, en conservant
 * l'ordre déterministe.
 *
 * @param {ChordCandidate[]} candidates
 * @param {{ maxCandidatesPerAnchor?: number }} [options]
 * @returns {ChordCandidate[]}
 */
function limitChordCandidates(candidates, options = {}) {
  const max = options.maxCandidatesPerAnchor ?? DEFAULT_MAX_CANDIDATES_PER_ANCHOR;
  return candidates.slice(0, max);
}

/**
 * Trie les candidats selon un ordre déterministe non musical (priorité source,
 * puis identifiant).
 *
 * @param {ChordCandidate[]} candidates
 * @returns {ChordCandidate[]}
 */
function sortCandidates(candidates) {
  return [...candidates].sort((a, b) => {
    const pa = SOURCE_PRIORITY[a.source] ?? 99;
    const pb = SOURCE_PRIORITY[b.source] ?? 99;
    if (pa !== pb) return pa - pb;
    return a.id.localeCompare(b.id);
  });
}

// ---------------------------------------------------------------------------
// API publique : génération par ancre
// ---------------------------------------------------------------------------

/**
 * Génère les candidats pour une ancre harmonique.
 *
 * @param {{
 *   anchor: HarmonicAnchor,
 *   track: MelodyTrack,
 *   harmonicContext: HarmonicContext,
 *   options?: { maxCandidatesPerAnchor?: number }
 * }} input
 * @returns {AnchorCandidateGenerationResult}
 */
export function generateChordCandidatesForAnchor(input) {
  const { anchor, track, harmonicContext, options = {} } = input;
  const maxCandidates = options.maxCandidatesPerAnchor ?? DEFAULT_MAX_CANDIDATES_PER_ANCHOR;

  const warnings = [];
  const rejectedSummary = { total: 0, byReason: {} };

  // 1. Ancre invalide
  if (!anchor || !anchor.id) {
    return {
      anchorId: anchor ? anchor.id : null,
      melodyEventId: anchor ? anchor.melodyEventId : null,
      status: 'invalid-anchor',
      candidates: [],
      rejectedSummary,
      warnings: [{
        severity: 'error',
        code: 'INVALID_ANCHOR',
        message: 'Ancre harmonique invalide.',
        anchorId: null,
        melodyEventId: null,
        details: {},
      }],
    };
  }

  // 2. Politique skip
  if (anchor.harmonizationPolicy === 'skip') {
    return {
      anchorId: anchor.id,
      melodyEventId: anchor.melodyEventId,
      status: 'skipped',
      candidates: [],
      rejectedSummary,
      warnings: [{
        severity: 'warning',
        code: 'ANCHOR_SKIPPED',
        message: 'L\'ancre est volontairement ignorée par sa politique d\'harmonisation.',
        anchorId: anchor.id,
        melodyEventId: anchor.melodyEventId,
        details: {},
      }],
    };
  }

  // 3. Résolution du MelodyEvent lié
  /** @type {MelodyEvent | null} */
  let melodyEvent = null;
  if (anchor.melodyEventId) {
    melodyEvent = track.events.find((e) => e.id === anchor.melodyEventId) || null;
    if (!melodyEvent || !melodyEvent.enabled) {
      warnings.push({
        severity: 'warning',
        code: 'MELODY_EVENT_DISABLED',
        message: `L'événement mélodique "${anchor.melodyEventId}" est introuvable ou désactivé.`,
        anchorId: anchor.id,
        melodyEventId: anchor.melodyEventId,
        details: {},
      });
    }
  }

  const tonalContext = harmonicContext ? harmonicContext.tonalContext : null;

  // Politiques effectives : l'ancre a la primauté sur l'événement mélodique
  // pour harmonizationPolicy, tandis que sopranoPolicy et preserveExactPitch
  // proviennent de l'événement lié (ou valeurs par défaut s'il est absent).
  const policies = {
    sopranoPolicy: melodyEvent ? melodyEvent.sopranoPolicy : 'free',
    harmonizationPolicy: anchor.harmonizationPolicy,
    preserveExactPitch: melodyEvent ? melodyEvent.preserveExactPitch : false,
  };

  // 4. Accord original explicite non verrouillé : candidat prioritaire
  let candidates = [];
  if (anchor.originalChord && !anchor.locked) {
    const ref = anchor.originalChord;
    const rootPc = normalizePc(ref.root);
    const quality = ref.quality || '';
    const bassPc = ref.bass != null ? normalizePc(ref.bass) : null;
    const degreeInfo = resolveDegree(rootPc, tonalContext);

    candidates.push(buildCandidate({
      anchorId: anchor.id,
      melodyEvent,
      rootPc,
      quality,
      bassPc,
      tonalContext,
      source: 'manual',
      locked: false,
      tonalRelation: {
        degree: degreeInfo.degree,
        romanNumeral: degreeInfo.romanNumeral,
        diatonic: degreeInfo.degree != null,
        borrowed: false,
        secondaryDominantTarget: null,
        approachType: 'none',
      },
      explicitReference: ref,
      policies,
    }));
  }

  // 5. Accord verrouillé à la frontière
  const firstAnchor = [...harmonicContext.anchors].sort((a, b) => a.relativeTime - b.relativeTime)[0];
  const isStartBoundary = firstAnchor && firstAnchor.id === anchor.id;
  const isEndBoundary = anchor.type === 'end' || (
    harmonicContext.anchors.length > 0 &&
    anchor.id === [...harmonicContext.anchors].sort((a, b) => b.relativeTime - a.relativeTime)[0].id
  );

  if (isStartBoundary && harmonicContext.startChord && harmonicContext.startChord.locked) {
    const ref = harmonicContext.startChord.chord;
    const rootPc = normalizePc(ref.root);
    const quality = ref.quality || '';
    const bassPc = ref.bass != null ? normalizePc(ref.bass) : null;
    const degreeInfo = resolveDegree(rootPc, tonalContext);

    const lockedCandidate = buildCandidate({
      anchorId: anchor.id,
      melodyEvent,
      rootPc,
      quality,
      bassPc,
      tonalContext,
      source: 'locked-boundary',
      locked: true,
      tonalRelation: {
        degree: degreeInfo.degree,
        romanNumeral: degreeInfo.romanNumeral,
        diatonic: degreeInfo.degree != null,
        borrowed: false,
        secondaryDominantTarget: null,
        approachType: 'none',
      },
      explicitReference: ref,
      policies,
    });

    // Si l'accord verrouillé est incompatible, on le retourne quand même avec
    // un rapport de validation explicite plutôt que de le remplacer silencieusement.
    return {
      anchorId: anchor.id,
      melodyEventId: anchor.melodyEventId,
      status: 'generated',
      candidates: [lockedCandidate],
      rejectedSummary,
      warnings: lockedCandidate.validation.warnings.concat(lockedCandidate.validation.hardViolations),
    };
  }

  if (isEndBoundary && harmonicContext.endChord && harmonicContext.endChord.locked) {
    const ref = harmonicContext.endChord.chord;
    const rootPc = normalizePc(ref.root);
    const quality = ref.quality || '';
    const bassPc = ref.bass != null ? normalizePc(ref.bass) : null;
    const degreeInfo = resolveDegree(rootPc, tonalContext);

    const lockedCandidate = buildCandidate({
      anchorId: anchor.id,
      melodyEvent,
      rootPc,
      quality,
      bassPc,
      tonalContext,
      source: 'locked-boundary',
      locked: true,
      tonalRelation: {
        degree: degreeInfo.degree,
        romanNumeral: degreeInfo.romanNumeral,
        diatonic: degreeInfo.degree != null,
        borrowed: false,
        secondaryDominantTarget: null,
        approachType: 'none',
      },
      explicitReference: ref,
      policies,
    });

    return {
      anchorId: anchor.id,
      melodyEventId: anchor.melodyEventId,
      status: 'generated',
      candidates: [lockedCandidate],
      rejectedSummary,
      warnings: lockedCandidate.validation.warnings.concat(lockedCandidate.validation.hardViolations),
    };
  }

  // 6. Génération des familles
  const familyInput = {
    anchorId: anchor.id,
    melodyEvent,
    tonalContext,
    locked: anchor.locked === true,
    policies,
  };

  candidates = candidates.concat(buildDiatonicCandidates(familyInput));
  candidates = candidates.concat(buildDiatonicSubstitutionCandidates(familyInput));
  candidates = candidates.concat(buildSecondaryDominantCandidates(familyInput));
  candidates = candidates.concat(buildDiminishedApproachCandidates(familyInput));
  candidates = candidates.concat(buildBorrowedCandidates(familyInput));

  // 7. Filtrage selon les politiques
  const validCandidates = [];
  for (const c of candidates) {
    if (c.validation.valid) {
      validCandidates.push(c);
    } else {
      rejectedSummary.total += 1;
      for (const v of c.validation.hardViolations) {
        rejectedSummary.byReason[v.code] = (rejectedSummary.byReason[v.code] || 0) + 1;
      }
    }
  }

  // 8. Mode force : un candidat valide est requis
  if (anchor.harmonizationPolicy === 'force' && validCandidates.length === 0) {
    return {
      anchorId: anchor.id,
      melodyEventId: anchor.melodyEventId,
      status: 'no-valid-candidate',
      candidates: [],
      rejectedSummary,
      warnings: warnings.concat([{
        severity: 'error',
        code: 'FORCE_NO_CANDIDATE',
        message: `Aucun candidat valide pour l'ancre "${anchor.id}" en mode force.`,
        anchorId: anchor.id,
        melodyEventId: anchor.melodyEventId,
        details: { rejectedSummary },
      }]),
    };
  }

  // 9. Dédoublonnage, tri, limitation
  let finalCandidates = deduplicateChordCandidates(validCandidates);
  finalCandidates = sortCandidates(finalCandidates);
  const beforeLimit = finalCandidates.length;
  finalCandidates = limitChordCandidates(finalCandidates, { maxCandidatesPerAnchor: maxCandidates });

  if (beforeLimit > finalCandidates.length) {
    warnings.push({
      severity: 'warning',
      code: 'CANDIDATES_TRUNCATED',
      message: `${beforeLimit} candidats générés, tronqués à ${maxCandidates}.`,
      anchorId: anchor.id,
      melodyEventId: anchor.melodyEventId,
      details: { beforeLimit, afterLimit: finalCandidates.length },
    });
  }

  return {
    anchorId: anchor.id,
    melodyEventId: anchor.melodyEventId,
    status: finalCandidates.length > 0 ? 'generated' : 'no-valid-candidate',
    candidates: finalCandidates,
    rejectedSummary,
    warnings,
  };
}

/**
 * Génère les candidats pour toutes les ancres d'un HarmonicContext.
 *
 * @param {{
 *   harmonicContext: HarmonicContext,
 *   track: MelodyTrack,
 *   options?: { maxCandidatesPerAnchor?: number }
 * }} input
 * @returns {AnchorCandidateGenerationResult[]}
 */
export function generateChordCandidatesForContext(input) {
  const { harmonicContext, track, options = {} } = input;
  const sortedAnchors = [...harmonicContext.anchors].sort((a, b) => a.relativeTime - b.relativeTime);
  return sortedAnchors.map((anchor) => generateChordCandidatesForAnchor({
    anchor,
    track,
    harmonicContext,
    options,
  }));
}

// ---------------------------------------------------------------------------
// Ré-exports utiles pour les tests
// ---------------------------------------------------------------------------

export {
  buildDiatonicCandidates,
  buildDiatonicSubstitutionCandidates,
  buildSecondaryDominantCandidates,
  buildDiminishedApproachCandidates,
  buildBorrowedCandidates,
  classifyMelodyCompatibility,
  validateChordCandidate,
  deduplicateChordCandidates,
  limitChordCandidates,
  computeChordPitchClasses,
  getIdentityMetadata,
  SUPPORTED_QUALITIES,
  DEFAULT_MAX_CANDIDATES_PER_ANCHOR,
};
