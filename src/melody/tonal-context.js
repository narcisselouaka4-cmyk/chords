// [OpenCode] — 2026-08-06 — Incrément 2 : contexte tonal.
// Estimation, sélection, correction manuelle et comparaison mélodie/harmonie.
// Utilise computeKeyFromRawNotes / computeKeyCandidatesFromRawNotes du
// détecteur de tonalité existant (src/analyzer/key-detector.js).

import {
  computeKeyFromRawNotes,
  computeKeyCandidatesFromRawNotes,
  parseKeyInput,
  buildPcHistogram,
} from '../analyzer/key-detector.js';
import {
  createSpelledKeyFromKeyObject,
  createSpelledKeyFromTonicSpelling,
  pitchClassFromSpelling,
  setPreferredKeySpelling as applyPreferredKeySpelling,
  clearPreferredKeySpelling as applyClearPreferredKeySpelling,
} from './spelled-pitch.js';

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
 *   spelledKey: import('./midi-types.js').SpelledKey | null,
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
        spelledKey: null,
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
  const weightedPitchClasses = buildPcHistogram(events);

  const candidates = rawCandidates.map((c) => ({
    tonicPitchClass: c.pc,
    mode: c.mode,
    confidence: c.confidence,
    score: c.score,
    source: /** @type {'melody-raw-notes'} */ ('melody-raw-notes'),
    evidence: {
      noteCount: diagnostics.totalEnabled,
      weightedPitchClasses,
      supportingEventIds: [],
      conflictingEventIds: [],
    },
  }));

  const melodyEstimate = candidates.length > 0 ? candidates[0] : null;
  const selected = melodyEstimate
    ? { tonicPitchClass: melodyEstimate.tonicPitchClass, mode: melodyEstimate.mode }
    : null;

  const spelledKey = selected
    ? createSpelledKeyFromKeyObject(selected, 'detected-default')
    : null;

  const now = Date.now();
  return {
    context: {
      id: makeContextId(),
      selected,
      spelledKey,
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
 * @param {import('./midi-types.js').SpelledKey | null} [options.spelledKey]
 * @param {TonalCandidate[]} [options.candidates]
 * @param {TonalCandidate | null} [options.melodyEstimate]
 * @param {TonalCandidate | null} [options.harmonyEstimate]
 * @returns {TonalContext}
 */
export function createTonalContext(options = {}) {
  const now = Date.now();
  const selected = options.selected || null;

  let spelledKey = options.spelledKey || null;
  if (selected && !spelledKey) {
    spelledKey = createSpelledKeyFromKeyObject(selected, 'manual');
  }

  return {
    id: makeContextId(),
    selected,
    spelledKey,
    candidates: options.candidates || [],
    selectionOrigin: selected ? 'manual' : null,
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
  const selected = { tonicPitchClass: candidate.tonicPitchClass, mode: candidate.mode };
  const spelledKey = createSpelledKeyFromKeyObject(selected, 'detected-default');
  return {
    ...context,
    selected,
    spelledKey,
    selectionOrigin: 'detected',
    confirmedByUser: true,
    confidence: candidate.confidence,
    updatedAt: Date.now(),
  };
}

/**
 * Parse une chaîne de tonalité enharmonique (C#, Db, C#m, Dbm...).
 *
 * @param {string} key
 * @returns {{ tonicPitchClass: number, mode: string, letter: string, accidental: number } | null}
 */
function parseManualKeyInput(key) {
  if (!key) return null;
  const normalized = String(key).trim().replace(/♭/g, 'b').replace(/♯/g, '#');
  const match = normalized.match(/^([A-Ga-g][#b]?)(m?)$/);
  if (!match) return null;

  const raw = match[1];
  const letter = raw.charAt(0).toUpperCase();
  const accidentalStr = raw.slice(1).toLowerCase();
  let accidental = 0;
  for (const ch of accidentalStr) {
    if (ch === '#') accidental += 1;
    else if (ch === 'b') accidental -= 1;
  }

  const tonicPitchClass = pitchClassFromSpelling(letter, accidental);
  const mode = match[2] === 'm' ? 'minor' : 'major';
  return { tonicPitchClass, mode, letter, accidental };
}

function normalizePc(pc) {
  return ((pc % 12) + 12) % 12;
}

/**
 * Définit manuellement une tonalité (écrase toute détection).
 * Conserve l'orthographe enharmonique exacte si une chaîne "C#" ou "Db" est fournie.
 *
 * @param {TonalContext} context
 * @param {{ tonicPitchClass: number, mode: string, letter?: string, accidental?: number, spelledKey?: import('./midi-types.js').SpelledKey } | string} key
 * @returns {TonalContext}
 */
export function setManualTonalContext(context, key) {
  let selected;
  let spelledKey;

  if (typeof key === 'string') {
    const parsed = parseManualKeyInput(key);
    if (!parsed) {
      throw new Error(`Impossible de parser la tonalité : "${key}"`);
    }
    selected = { tonicPitchClass: parsed.tonicPitchClass, mode: parsed.mode };
    spelledKey = createSpelledKeyFromTonicSpelling(
      selected.tonicPitchClass,
      selected.mode,
      parsed.letter,
      parsed.accidental,
      'manual',
    );
  } else if (key && typeof key === 'object' && typeof key.tonicPitchClass === 'number' && typeof key.mode === 'string') {
    selected = { tonicPitchClass: normalizePc(key.tonicPitchClass), mode: key.mode };
    if (typeof key.letter === 'string' && typeof key.accidental === 'number') {
      spelledKey = createSpelledKeyFromTonicSpelling(
        selected.tonicPitchClass,
        selected.mode,
        key.letter,
        key.accidental,
        'manual',
      );
    } else if (key.spelledKey && typeof key.spelledKey === 'object') {
      spelledKey = applyPreferredKeySpelling({ ...context, selected }, key.spelledKey).spelledKey;
    } else {
      spelledKey = createSpelledKeyFromKeyObject(selected, 'manual');
    }
  } else {
    throw new TypeError('Tonalité invalide : fournir {tonicPitchClass, mode} ou une chaîne "C", "Cm", etc.');
  }

  if (selected.mode !== 'major' && selected.mode !== 'minor') {
    throw new Error(`Mode non supporté : "${selected.mode}". Utiliser "major" ou "minor".`);
  }

  // La sélection manuelle est conservée séparément des candidats détectés.
  // On ne modifie ni les scores ni la liste des candidats automatiques.
  return {
    ...context,
    selected,
    spelledKey,
    candidates: context.candidates.map((c) => ({ ...c, evidence: { ...c.evidence } })),
    selectionOrigin: 'manual',
    confirmedByUser: true,
    confidence: null,
    updatedAt: Date.now(),
  };
}

/**
 * Corrige la tonalité sélectionnée (ajuste sans perdre l'origine de détection).
 * Se comporte comme setManualTonalContext mais conserve selectionOrigin = 'corrected'.
 *
 * @param {TonalContext} context
 * @param {{ tonicPitchClass: number, mode: string, letter?: string, accidental?: number, spelledKey?: import('./midi-types.js').SpelledKey } | string} key
 * @returns {TonalContext}
 */
export function correctTonalContext(context, key) {
  const corrected = setManualTonalContext(context, key);
  const spelledKey = corrected.spelledKey
    ? Object.freeze({ ...corrected.spelledKey, source: 'corrected', explicit: true })
    : null;
  return {
    ...corrected,
    spelledKey,
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

  const spelledKey = selected
    ? createSpelledKeyFromKeyObject(selected, 'detected-default')
    : null;

  return {
    ...context,
    selected,
    spelledKey,
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
