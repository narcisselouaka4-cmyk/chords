// [OpenCode] — 2026-08-06 — Incrément 2 : contexte tonal.
// Estimation, sélection, correction manuelle et comparaison mélodie/harmonie.
// Utilise computeKeyFromRawNotes / computeKeyCandidatesFromRawNotes du
// détecteur de tonalité existant (src/analyzer/key-detector.js).

import {
  computeKeyFromRawNotes,
  computeKeyCandidatesFromRawNotes,
  parseKeyInput,
} from '../analyzer/key-detector.js';

// ---------------------------------------------------------------------------
// Types conceptuels (documentés dans ./midi-types.js)
// ---------------------------------------------------------------------------

/**
 * @typedef {{
 *   tonicPitchClass: number,
 *   mode: string,
 *   confidence: number,
 *   score: number,
 *   source: 'melody-raw-notes' | 'harmony-chords' | 'combined' | 'manual',
 *   evidence: {
 *     noteCount: number,
 *     weightedPitchClasses: number[],
 *     supportingEventIds: string[],
 *     conflictingEventIds: string[]
 *   }
 * }} TonalCandidate
 */

/**
 * @typedef {{
 *   id: string,
 *   selected: { tonicPitchClass: number, mode: string } | null,
 *   candidates: TonalCandidate[],
 *   selectionOrigin: 'detected' | 'manual' | 'corrected' | null,
 *   melodyEstimate: TonalCandidate | null,
 *   harmonyEstimate: TonalCandidate | null,
 *   confirmedByUser: boolean,
 *   confidence: number | null,
 *   createdAt: number,
 *   updatedAt: number
 * }} TonalContext
 */

/**
 * @typedef {{
 *   agreement: 'exact' | 'relative' | 'parallel' | 'conflict' | 'insufficient',
 *   confidenceDelta: number | null,
 *   recommendation: 'use-melody' | 'use-harmony' | 'request-user-confirmation' | 'insufficient-data',
 *   reasons: string[]
 * }} TonalContextComparison
 */

// ---------------------------------------------------------------------------
// Identifiants
// ---------------------------------------------------------------------------

let nextContextId = 0;

function makeContextId() {
  return `tonal-ctx-${++nextContextId}`;
}

// ---------------------------------------------------------------------------
// Adaptateur MelodyTrack → événements compatibles computeKeyFromRawNotes
// ---------------------------------------------------------------------------

/**
 * Transforme une MelodyTrack en tableau d'événements {time, type, note, velocity}
 * compatible avec computeKeyFromRawNotes / computeKeyCandidatesFromRawNotes.
 *
 * Règles :
 * - utilise uniquement les événements enabled ;
 * - conserve les pitch classes exactes ;
 * - pondère par durée et vélocité (compatible avec buildPcHistogram) ;
 * - ignore les événements incomplets (durée nulle ou négative) ;
 * - ne modifie pas la MelodyTrack.
 *
 * @param {import('./midi-types.js').MelodyTrack} track
 * @returns {{ events: Array<{time:number, type:string, note:number, velocity:number}>, diagnostics: { incompleteEventIds: string[], disabledEventIds: string[], totalEnabled: number } }}
 */
export function melodyTrackToRawEvents(track) {
  const events = [];
  const diagnostics = {
    incompleteEventIds: [],
    disabledEventIds: [],
    totalEnabled: 0,
  };

  for (const evt of track.events) {
    if (!evt.enabled) {
      diagnostics.disabledEventIds.push(evt.id);
      continue;
    }
    diagnostics.totalEnabled++;

    if (evt.duration <= 0 || evt.endedAt <= evt.startedAt) {
      diagnostics.incompleteEventIds.push(evt.id);
      continue;
    }

    events.push({
      time: evt.startedAt,
      type: 'note_on',
      note: evt.midi,
      velocity: evt.velocity,
    });
    events.push({
      time: evt.endedAt,
      type: 'note_off',
      note: evt.midi,
      velocity: 0,
    });
  }

  events.sort((a, b) => a.time - b.time);
  return { events, diagnostics };
}

// ---------------------------------------------------------------------------
// API publique
// ---------------------------------------------------------------------------

/**
 * Estime le contexte tonal à partir d'une MelodyTrack.
 * Utilise computeKeyCandidatesFromRawNotes pour obtenir tous les candidats.
 *
 * @param {import('./midi-types.js').MelodyTrack} track
 * @param {object} [options]
 * @param {boolean} [options.useSharps]
 * @param {boolean} [options.latin]
 * @returns {{ context: TonalContext, diagnostics: object }}
 */
export function estimateTonalContextFromMelody(track, options = {}) {
  const { events, diagnostics } = melodyTrackToRawEvents(track);

  if (events.length === 0) {
    const now = Date.now();
    return {
      context: {
        id: makeContextId(),
        selected: null,
        candidates: [],
        selectionOrigin: null,
        melodyEstimate: null,
        harmonyEstimate: null,
        confirmedByUser: false,
        confidence: null,
        createdAt: now,
        updatedAt: now,
      },
      diagnostics: { ...diagnostics, reason: 'no-events' },
    };
  }

  const rawCandidates = computeKeyCandidatesFromRawNotes(events, options);

  const candidates = rawCandidates.map((c, i) => ({
    tonicPitchClass: c.pc,
    mode: c.mode,
    confidence: c.confidence,
    score: c.score,
    source: /** @type {'melody-raw-notes'} */ ('melody-raw-notes'),
    evidence: {
      noteCount: diagnostics.totalEnabled,
      weightedPitchClasses: new Array(12).fill(0),
      supportingEventIds: [],
      conflictingEventIds: [],
    },
  }));

  const melodyEstimate = candidates.length > 0 ? candidates[0] : null;
  const selected = melodyEstimate
    ? { tonicPitchClass: melodyEstimate.tonicPitchClass, mode: melodyEstimate.mode }
    : null;

  const now = Date.now();
  return {
    context: {
      id: makeContextId(),
      selected,
      candidates,
      selectionOrigin: selected ? 'detected' : null,
      melodyEstimate,
      harmonyEstimate: null,
      confirmedByUser: false,
      confidence: melodyEstimate ? melodyEstimate.confidence : null,
      createdAt: now,
      updatedAt: now,
    },
    diagnostics,
  };
}

/**
 * Crée un TonalContext vide ou partiellement renseigné.
 *
 * @param {object} [options]
 * @param {{ tonicPitchClass: number, mode: string } | null} [options.selected]
 * @param {TonalCandidate[]} [options.candidates]
 * @param {TonalCandidate | null} [options.melodyEstimate]
 * @param {TonalCandidate | null} [options.harmonyEstimate]
 * @returns {TonalContext}
 */
export function createTonalContext(options = {}) {
  const now = Date.now();
  return {
    id: makeContextId(),
    selected: options.selected || null,
    candidates: options.candidates || [],
    selectionOrigin: options.selected ? 'manual' : null,
    melodyEstimate: options.melodyEstimate || null,
    harmonyEstimate: options.harmonyEstimate || null,
    confirmedByUser: false,
    confidence: null,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Sélectionne un candidat détecté dans le contexte.
 *
 * @param {TonalContext} context
 * @param {number} candidateIndex - index dans context.candidates
 * @returns {TonalContext}
 */
export function selectTonalCandidate(context, candidateIndex) {
  if (candidateIndex < 0 || candidateIndex >= context.candidates.length) {
    throw new RangeError(`Index candidat invalide : ${candidateIndex}`);
  }
  const candidate = context.candidates[candidateIndex];
  return {
    ...context,
    selected: { tonicPitchClass: candidate.tonicPitchClass, mode: candidate.mode },
    selectionOrigin: 'detected',
    confirmedByUser: true,
    confidence: candidate.confidence,
    updatedAt: Date.now(),
  };
}

/**
 * Définit manuellement une tonalité (écrase toute détection).
 *
 * @param {TonalContext} context
 * @param {{ tonicPitchClass: number, mode: string } | string} key - objet {tonicPitchClass, mode} ou chaîne "C", "Cm", "F#m", etc.
 * @returns {TonalContext}
 */
export function setManualTonalContext(context, key) {
  let resolved;
  if (typeof key === 'string') {
    const parsed = parseKeyInput(key);
    if (!parsed) {
      throw new Error(`Impossible de parser la tonalité : "${key}"`);
    }
    resolved = { tonicPitchClass: parsed.pc, mode: parsed.mode };
  } else if (key && typeof key.tonicPitchClass === 'number' && typeof key.mode === 'string') {
    resolved = { tonicPitchClass: ((key.tonicPitchClass % 12) + 12) % 12, mode: key.mode };
  } else {
    throw new TypeError('Tonalité invalide : fournir {tonicPitchClass, mode} ou une chaîne "C", "Cm", etc.');
  }

  if (resolved.mode !== 'major' && resolved.mode !== 'minor') {
    throw new Error(`Mode non supporté : "${resolved.mode}". Utiliser "major" ou "minor".`);
  }

  const manualCandidate = {
    tonicPitchClass: resolved.tonicPitchClass,
    mode: resolved.mode,
    confidence: 1,
    score: 1,
    source: /** @type {'manual'} */ ('manual'),
    evidence: {
      noteCount: 0,
      weightedPitchClasses: new Array(12).fill(0),
      supportingEventIds: [],
      conflictingEventIds: [],
    },
  };

  const candidates = [manualCandidate, ...context.candidates.filter(
    (c) => !(c.tonicPitchClass === resolved.tonicPitchClass && c.mode === resolved.mode),
  )];

  return {
    ...context,
    selected: resolved,
    candidates,
    selectionOrigin: 'manual',
    confirmedByUser: true,
    confidence: 1,
    updatedAt: Date.now(),
  };
}

/**
 * Corrige la tonalité sélectionnée (ajuste sans perdre l'origine de détection).
 * Se comporte comme setManualTonalContext mais conserve selectionOrigin = 'corrected'.
 *
 * @param {TonalContext} context
 * @param {{ tonicPitchClass: number, mode: string } | string} key
 * @returns {TonalContext}
 */
export function correctTonalContext(context, key) {
  const corrected = setManualTonalContext(context, key);
  return {
    ...corrected,
    selectionOrigin: 'corrected',
  };
}

/**
 * Retire la confirmation utilisateur et revient à l'estimation automatique.
 *
 * @param {TonalContext} context
 * @returns {TonalContext}
 */
export function clearTonalConfirmation(context) {
  const melodyEstimate = context.melodyEstimate;
  const selected = melodyEstimate
    ? { tonicPitchClass: melodyEstimate.tonicPitchClass, mode: melodyEstimate.mode }
    : null;

  return {
    ...context,
    selected,
    selectionOrigin: selected ? 'detected' : null,
    confirmedByUser: false,
    confidence: melodyEstimate ? melodyEstimate.confidence : null,
    updatedAt: Date.now(),
  };
}

/**
 * Compare deux estimations tonales (mélodie vs harmonie).
 *
 * @param {TonalCandidate | null} melodyEstimate
 * @param {TonalCandidate | null} harmonyEstimate
 * @returns {TonalContextComparison}
 */
export function compareTonalEstimates(melodyEstimate, harmonyEstimate) {
  if (!melodyEstimate && !harmonyEstimate) {
    return {
      agreement: 'insufficient',
      confidenceDelta: null,
      recommendation: 'insufficient-data',
      reasons: ['Aucune estimation disponible.'],
    };
  }

  if (!melodyEstimate) {
    return {
      agreement: 'insufficient',
      confidenceDelta: null,
      recommendation: 'use-harmony',
      reasons: ['Estimation mélodique absente, seule l\'estimation harmonique est disponible.'],
    };
  }

  if (!harmonyEstimate) {
    return {
      agreement: 'insufficient',
      confidenceDelta: null,
      recommendation: 'use-melody',
      reasons: ['Estimation harmonique absente, seule l\'estimation mélodique est disponible.'],
    };
  }

  const sameTonic = melodyEstimate.tonicPitchClass === harmonyEstimate.tonicPitchClass;
  const sameMode = melodyEstimate.mode === harmonyEstimate.mode;
  const confidenceDelta = melodyEstimate.confidence - harmonyEstimate.confidence;

  if (sameTonic && sameMode) {
    return {
      agreement: 'exact',
      confidenceDelta,
      recommendation: 'use-melody',
      reasons: ['Les deux estimations concordent exactement.'],
    };
  }

  // Relatif : Do majeur / La mineur (même armure)
  // Le relatif mineur d'une tonalité majeure est 9 demi-tons au-dessus (ex: Do→La)
  // Le relatif majeur d'une tonalité mineure est 3 demi-tons au-dessus (ex: La→Do)
  const isRelative =
    (melodyEstimate.mode === 'major' && harmonyEstimate.mode === 'minor' &&
     harmonyEstimate.tonicPitchClass === (melodyEstimate.tonicPitchClass + 9) % 12) ||
    (melodyEstimate.mode === 'minor' && harmonyEstimate.mode === 'major' &&
     harmonyEstimate.tonicPitchClass === (melodyEstimate.tonicPitchClass + 3) % 12);

  if (isRelative) {
    return {
      agreement: 'relative',
      confidenceDelta,
      recommendation: 'request-user-confirmation',
      reasons: [
        `Les estimations sont des relatifs (${melodyEstimate.mode === 'major' ? 'majeur/mineur' : 'mineur/majeur'}).`,
        `Mélodie : ${melodyEstimate.tonicPitchClass} ${melodyEstimate.mode} (confiance ${melodyEstimate.confidence.toFixed(2)}).`,
        `Harmonie : ${harmonyEstimate.tonicPitchClass} ${harmonyEstimate.mode} (confiance ${harmonyEstimate.confidence.toFixed(2)}).`,
      ],
    };
  }

  // Parallèle : Do majeur / Do mineur
  if (sameTonic && !sameMode) {
    return {
      agreement: 'parallel',
      confidenceDelta,
      recommendation: 'request-user-confirmation',
      reasons: [
        `Même tonique (${melodyEstimate.tonicPitchClass}) mais modes différents.`,
        `Mélodie : ${melodyEstimate.mode} (confiance ${melodyEstimate.confidence.toFixed(2)}).`,
        `Harmonie : ${harmonyEstimate.mode} (confiance ${harmonyEstimate.confidence.toFixed(2)}).`,
      ],
    };
  }

  return {
    agreement: 'conflict',
    confidenceDelta,
    recommendation: 'request-user-confirmation',
    reasons: [
      `Conflit : mélodie → ${melodyEstimate.tonicPitchClass} ${melodyEstimate.mode}, harmonie → ${harmonyEstimate.tonicPitchClass} ${harmonyEstimate.mode}.`,
      `Delta de confiance : ${confidenceDelta.toFixed(2)}.`,
    ],
  };
}

/**
 * Reconstruit une nouvelle version du contexte sans mutation.
 * Utile pour forcer une recréation après plusieurs éditions.
 *
 * @param {TonalContext} context
 * @returns {TonalContext}
 */
export function rebuildTonalContext(context) {
  return {
    ...context,
    id: makeContextId(),
    candidates: context.candidates.map((c) => ({ ...c, evidence: { ...c.evidence } })),
    updatedAt: Date.now(),
  };
}
