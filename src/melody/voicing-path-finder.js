// [OpenCode] — 2026-08-06 — Incrément 7 : chemin de voicings de piano jouables.
// À partir d'un HarmonicPathResult validé (Incrément 6), génère des voicings de
// piano V1 pour chaque candidat, réels dans un registre MIDI, divisés en basse
// (gauche) et droite, fidèles aux pitch classes, et choisit un chemin global
// optimum par programmation dynamique exacte (départage complet, aucun greedy).
//
// Module pur : pas de DOM, pas de réseau, pas de MIDI/audio émis, pas d'UI, pas
// de mutation des entrées, pas de recalcul ni de remplacement du chemin
// harmonique, pas d'état global, pas de cache persistant entre deux appels.
// Aucune dépendance ajoutée.
//
// Complexité de la DP après génération des variantes :
// O(somme |voicings[t-1]| × |voicings[t]|). L'alignement des voix reste
// constant car chaque voicing contient au plus 6 notes.

import { scoreChordTransition } from './transition-score.js';

// ---------------------------------------------------------------------------
// Constantes internes du modèle de jouabilité V1 (non configurables)
// ---------------------------------------------------------------------------

export const VOICING_PATH_SETTINGS = Object.freeze({
  minMidiNote: 36,
  maxMidiNote: 84,
  leftHandMinMidi: 36,
  leftHandMaxMidi: 60,
  rightHandMinMidi: 48,
  rightHandMaxMidi: 84,
  leftHandMinNotes: 1,
  leftHandMaxNotes: 2,
  rightHandMinNotes: 2,
  rightHandMaxNotes: 4,
  leftHandMaxSpan: 12,
  rightHandMaxSpan: 12,
  maxInterHandGap: 24,
  unmatchedVoiceCost: 12,
  largeLeapThreshold: 7,
  largeLeapPenalty: 6,
  parallelFifthPenalty: 12,
  parallelOctavePenalty: 18,
  targetBassMidi: 43,
  targetLeftUpperMidi: 52,
  targetRightHandMidi: 64,
});

// ---------------------------------------------------------------------------
// Types conceptuels (documentés dans ./midi-types.js)
// ---------------------------------------------------------------------------

/**
 * @typedef {import('./midi-types.js').ChordCandidate} ChordCandidate
 * @typedef {import('./midi-types.js').HarmonicPathResult} HarmonicPathResult
 * @typedef {import('./midi-types.js').PianoVoicing} PianoVoicing
 * @typedef {import('./midi-types.js').VoicingTransitionScore} VoicingTransitionScore
 * @typedef {import('./midi-types.js').VoicingPathResult} VoicingPathResult
 */

// ---------------------------------------------------------------------------
// Helpers de validation et utilitaires
// ---------------------------------------------------------------------------

/**
 * Gèle en profondeur une valeur (objet ou tableau).
 * @param {object|array} value
 * @returns {object|array} la même valeur gelée
 */
function deepFreeze(value) {
  if (value !== null && typeof value === 'object') {
    for (const key of Object.keys(value)) {
      deepFreeze(value[key]);
    }
    return Object.freeze(value);
  }
  return value;
}

/**
 * Valide un tableau de notes MIDI.
 * @param {unknown} arr
 * @param {string} role
 * @param {boolean} requireNonEmpty
 */
function validateMidiArray(arr, role, requireNonEmpty) {
  if (!Array.isArray(arr)) {
    throw new TypeError(`${role} doit être un tableau`);
  }
  if (requireNonEmpty && arr.length === 0) {
    throw new TypeError(`${role} ne doit pas être vide`);
  }
  for (let i = 0; i < arr.length; i++) {
    if (!(i in arr)) {
      throw new TypeError(`${role} ne doit pas être un tableau creux`);
    }
  }
  for (const note of arr) {
    if (typeof note !== 'number' || !Number.isInteger(note) || note < 0 || note > 127) {
      throw new TypeError(`${role} contient une note MIDI invalide`);
    }
  }
  for (let i = 1; i < arr.length; i++) {
    if (arr[i] <= arr[i - 1]) {
      throw new TypeError(`${role} doit être strictement croissant sans doublon`);
    }
  }
}

/**
 * Valide un candidat en réutilisant le contrat public de l'Incrément 5 via une
 * transition identité (candidat → même candidat), comme le fait l'Incrément 6.
 * Ne recopie pas un validateur divergent.
 *
 * @param {ChordCandidate} candidate
 * @param {string} role
 */
function validateCandidate(candidate, role) {
  if (candidate == null || typeof candidate !== 'object') {
    throw new TypeError(`${role} doit être un objet non nul`);
  }
  scoreChordTransition({ from: candidate, to: candidate });
}

/**
 * Ensemble ordonné (trié, dédupliqué) des pitch classes à placer dans un
 * voicing. Si la basse est présente et hors de l'accord, elle est ajoutée
 * exactement une fois comme basse externe. Une basse omise/null reste valide.
 *
 * @param {ChordCandidate} candidate
 * @returns {number[]}
 */
function chordPitchClasses(candidate) {
  const set = new Set(candidate.pitchClasses);
  const bass = candidate.bassPitchClass === undefined ? null : candidate.bassPitchClass;
  if (bass !== null && !set.has(bass)) set.add(bass);
  return Array.from(set).sort((a, b) => a - b);
}

/**
 * Comparaison lexicale de deux tableaux MIDI.
 * @param {number[]} a
 * @param {number[]} b
 * @returns {number} -1, 0 ou 1
 */
function compareMidiArrays(a, b) {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    if (a[i] !== b[i]) return a[i] - b[i];
  }
  return a.length - b.length;
}

// ---------------------------------------------------------------------------
// Génération des voicings d'un accord
// ---------------------------------------------------------------------------

/**
 * Valeurs MIDI possibles pour une pitch class dans le registre [36,84].
 * @param {number} pc
 * @returns {number[]} croissantes
 */
function midiCandidatesForPc(pc) {
  const out = [];
  for (let v = 36 + pc; v <= 84; v += 12) out.push(v);
  return out;
}

/**
 * Division des mains recommandée pour une suite MIDI strictement croissante.
 * Règle : préférer une seule note à la basse ; sinon deux notes à la basse.
 *
 * @param {number[]} notes
 * @returns {{ leftHand: number[], rightHand: number[] } | null}
 */
function handDivisionOf(notes) {
  const s = VOICING_PATH_SETTINGS;
  function okRange(v, lo, hi) { return v >= lo && v <= hi; }
  function leftValid(left) {
    if (left.length < s.leftHandMinNotes || left.length > s.leftHandMaxNotes) return false;
    for (const v of left) if (!okRange(v, s.leftHandMinMidi, s.leftHandMaxMidi)) return false;
    if (left.length > 1 && left[left.length - 1] - left[0] > s.leftHandMaxSpan) return false;
    return true;
  }
  function rightValid(right) {
    if (right.length < s.rightHandMinNotes || right.length > s.rightHandMaxNotes) return false;
    if (right.length === 0) return false;
    for (const v of right) if (!okRange(v, s.rightHandMinMidi, s.rightHandMaxMidi)) return false;
    if (right[right.length - 1] - right[0] > s.rightHandMaxSpan) return false;
    return true;
  }
  function gapOk(left, right) {
    const lo = left[left.length - 1];
    const hi = right[0];
    return lo < hi && hi - lo <= s.maxInterHandGap;
  }

  if (notes.length >= 3 && notes.length <= 5) {
    const left = [notes[0]];
    const right = notes.slice(1);
    if (leftValid(left) && rightValid(right) && gapOk(left, right)) {
      return { leftHand: left, rightHand: right };
    }
  }
  if (notes.length >= 4 && notes.length <= 6) {
    const left = [notes[0], notes[1]];
    const right = notes.slice(2);
    if (leftValid(left) && rightValid(right) && gapOk(left, right)) {
      return { leftHand: left, rightHand: right };
    }
  }
  return null;
}

/**
 * Déviation de registre d'un voicing (coût de départage, ne rentre pas dans
 * le coût principal).
 * @param {number[]} leftHand
 * @param {number[]} rightHand
 * @returns {number}
 */
function registerDeviationOf(leftHand, rightHand) {
  const s = VOICING_PATH_SETTINGS;
  let dev = Math.abs(leftHand[0] - s.targetBassMidi);
  if (leftHand.length > 1) dev += Math.abs(leftHand[1] - s.targetLeftUpperMidi);
  for (const v of rightHand) dev += Math.abs(v - s.targetRightHandMidi);
  return dev;
}

/**
 * Construit un voicing figé à partir d'une suite MIDI triée et d'une division
 * des mains.
 *
 * @param {ChordCandidate} candidate
 * @param {number[]} notes (strictement croissantes)
 * @param {{ leftHand: number[], rightHand: number[] }} hands
 * @returns {PianoVoicing}
 */
function buildVoicing(candidate, notes, hands) {
  const bassMidiNote = notes[0];
  const bassPitchClass = bassMidiNote % 12;
  const rootPitchClass = candidate.rootPitchClass;
  const inversionInterval = (bassPitchClass - rootPitchClass + 12) % 12;
  const spanSemitones = notes[notes.length - 1] - notes[0];
  return Object.freeze({
    candidate,
    midiNotes: Object.freeze(notes.slice()),
    leftHand: Object.freeze(hands.leftHand.slice()),
    rightHand: Object.freeze(hands.rightHand.slice()),
    bassMidiNote,
    bassPitchClass,
    inversionInterval,
    isRootPosition: inversionInterval === 0,
    spanSemitones,
    registerDeviation: registerDeviationOf(hands.leftHand, hands.rightHand),
  });
}

/**
 * Génère tous les voicings admissibles d'un accord (Incrément 7).
 *
 * @param {{ candidate: ChordCandidate }} input
 * @returns {PianoVoicing[]} tableau figé, trié (ordre MIDI puis lexical)
 */
export function generatePlayableChordVoicings({ candidate }) {
  validateCandidate(candidate, 'candidate');
  const bass =
    candidate.bassPitchClass === undefined ? null : candidate.bassPitchClass;
  const pcs = chordPitchClasses(candidate);

  if (pcs.length < 3 || pcs.length > 6) {
    throw new RangeError(
      `candidat ${candidate.id} : ${pcs.length} pitch classes, un voicing V1 exige de 3 à 6 notes distintas sans doublon`,
    );
  }

  // Énumère toutes les affectations d'une octave par pitch class. Chaque pitch
  // class apparaît exactement une fois ; aucune note étrangère n'est ajoutée ;
  // l'ordre original de pitchClasses n'influence pas le résultat (tri de pcs).
  const octaveLists = pcs.map((pc) => midiCandidatesForPc(pc));
  const seen = new Set();
  const voicings = [];

  function rec(i, acc) {
    if (i === pcs.length) {
      const sorted = acc.slice().sort((a, b) => a - b);
      const key = sorted.join(',');
      if (seen.has(key)) return;
      seen.add(key);
      // Basse explicite = note la plus grave.
      if (bass !== null && sorted[0] % 12 !== bass) return;
      const hands = handDivisionOf(sorted);
      if (!hands) return;
      voicings.push(buildVoicing(candidate, sorted, hands));
      return;
    }
    for (const v of octaveLists[i]) {
      acc.push(v);
      rec(i + 1, acc);
      acc.pop();
    }
  }
  rec(0, []);

  if (voicings.length === 0) {
    throw new RangeError(
      `candidat ${candidate.id} : aucun voicing admissible dans le modèle V1`,
    );
  }

  voicings.sort((a, b) => compareMidiArrays(a.midiNotes, b.midiNotes));
  return Object.freeze(voicings);
}

// ---------------------------------------------------------------------------
// Alignement monotone des voix entre deux voicings
// ---------------------------------------------------------------------------

/**
 * Alignement dynamique monotone minimal entre deux suites de notes MIDI
 * strictement croissantes. Renvoie les mouvements orientés (du grave vers
 * l'aigu) et les compteurs. Départage : coût minimal, puis davantage de voix
 * immobiles, puis davantage de voix appariées, puis match < delete < insert.
 *
 * @param {number[]} from
 * @param {number[]} to
 * @returns {{
 *   movements: object[],
 *   totalMovement: number, maxMovement: number, stationaryVoiceCount: number,
 *   unmatchedVoiceCount: number, largeLeapCount: number,
 *   parallelFifths: number, parallelOctaves: number
 * }}
 */
function alignVoices(from, to) {
  const n = from.length;
  const m = to.length;
  const COST = VOICING_PATH_SETTINGS.unmatchedVoiceCost;
  const opRank = { match: 0, delete: 1, insert: 2 };
  const key = (cand) => [
    cand.cost,
    -cand.stationary,
    -cand.matched,
    opRank[cand.op],
  ];

  // dp[i][j] = meilleure valeur pour préfixes from[0..i) et to[0..j).
  // stocké : { cost, stationary, matched, op, prevI, prevJ }
  const dp = [];
  for (let i = 0; i <= n; i++) dp.push(new Array(m + 1));

  dp[0][0] = { cost: 0, stationary: 0, matched: 0, op: '', prevI: 0, prevJ: 0 };

  for (let i = 0; i <= n; i++) {
    for (let j = 0; j <= m; j++) {
      if (i === 0 && j === 0) continue;
      let best = null;
      let bestKey = null;
      const consider = (cand) => {
        const ck = key(cand);
        if (bestKey === null) {
          best = cand;
          bestKey = ck;
          return;
        }
        for (let k = 0; k < 4; k++) {
          if (ck[k] !== bestKey[k]) {
            if (ck[k] < bestKey[k]) {
              best = cand;
              bestKey = ck;
            }
            return;
          }
        }
      };

      if (i > 0 && j > 0) {
        const prev = dp[i - 1][j - 1];
        const d = Math.abs(from[i - 1] - to[j - 1]);
        consider({
          cost: prev.cost + d,
          stationary: prev.stationary + (d === 0 ? 1 : 0),
          matched: prev.matched + 1,
          op: 'match',
          prevI: i - 1,
          prevJ: j - 1,
        });
      }
      if (i > 0) {
        const prev = dp[i - 1][j];
        consider({
          cost: prev.cost + COST,
          stationary: prev.stationary,
          matched: prev.matched,
          op: 'delete',
          prevI: i - 1,
          prevJ: j,
        });
      }
      if (j > 0) {
        const prev = dp[i][j - 1];
        consider({
          cost: prev.cost + COST,
          stationary: prev.stationary,
          matched: prev.matched,
          op: 'insert',
          prevI: i,
          prevJ: j - 1,
        });
      }
      dp[i][j] = best;
    }
  }

  // Reconstruction des opérations (de la fin vers le début, puis inversion).
  const ops = [];
  let i = n;
  let j = m;
  while (i > 0 || j > 0) {
    const cell = dp[i][j];
    ops.push(cell.op);
    i = cell.prevI;
    j = cell.prevJ;
  }
  ops.reverse();

  // Construction des mouvements et agrégats.
  const movements = [];
  let fi = 0;
  let fj = 0;
  let totalMovement = 0;
  let maxMovement = 0;
  let stationaryVoiceCount = 0;
  let unmatchedVoiceCount = 0;
  let largeLeapCount = 0;
  const matchedRefs = [];
  for (const op of ops) {
    if (op === 'match') {
      const fr = from[fi];
      const tt = to[fj];
      const sem = Math.abs(tt - fr);
      movements.push({ fromIndex: fi, toIndex: fj, fromNote: fr, toNote: tt, semitones: sem });
      totalMovement += sem;
      if (sem > maxMovement) maxMovement = sem;
      if (sem === 0) stationaryVoiceCount++;
      if (sem > VOICING_PATH_SETTINGS.largeLeapThreshold) largeLeapCount++;
      matchedRefs.push({ fi, fj, sem, fr, tt });
      fi++;
      fj++;
    } else if (op === 'delete') {
      movements.push({
        fromIndex: fi, toIndex: null, fromNote: from[fi], toNote: null, semitones: null,
      });
      unmatchedVoiceCount++;
      fi++;
    } else {
      movements.push({
        fromIndex: null, toIndex: fj, fromNote: null, toNote: to[fj], semitones: null,
      });
      unmatchedVoiceCount++;
      fj++;
    }
  }

  // Quintes et octaves parallèles entre voix appariées.
  let parallelFifths = 0;
  let parallelOctaves = 0;
  for (let a = 0; a < matchedRefs.length; a++) {
    for (let b = a + 1; b < matchedRefs.length; b++) {
      const va = matchedRefs[a];
      const vb = matchedRefs[b];
      const dirA = Math.sign(va.tt - va.fr);
      const dirB = Math.sign(vb.tt - vb.fr);
      if (dirA === 0 || dirB === 0 || dirA !== dirB) continue;
      const intervalInitial = Math.abs(vb.fr - va.fr);
      const intervalFinal = Math.abs(vb.tt - va.tt);
      if (intervalInitial % 12 === 7 && intervalFinal % 12 === 7) {
        parallelFifths++;
      } else if (
        intervalInitial > 0 && intervalInitial % 12 === 0 &&
        intervalFinal > 0 && intervalFinal % 12 === 0
      ) {
        parallelOctaves++;
      }
    }
  }

  return {
    movements: deepFreeze(movements),
    totalMovement,
    maxMovement,
    stationaryVoiceCount,
    unmatchedVoiceCount,
    largeLeapCount,
    parallelFifths,
    parallelOctaves,
  };
}

/**
 * Note une transition entre deux voicings (Increment 7).
 *
 * @param {{ fromMidiNotes: number[], toMidiNotes: number[] }} input
 * @returns {VoicingTransitionScore} objet figé
 */
export function scoreVoicingTransition({ fromMidiNotes, toMidiNotes }) {
  validateMidiArray(fromMidiNotes, 'fromMidiNotes', true);
  validateMidiArray(toMidiNotes, 'toMidiNotes', true);

  const {
    movements, totalMovement, maxMovement, stationaryVoiceCount,
    unmatchedVoiceCount, largeLeapCount, parallelFifths, parallelOctaves,
  } = alignVoices(fromMidiNotes, toMidiNotes);

  const s = VOICING_PATH_SETTINGS;
  const cost =
    totalMovement +
    s.unmatchedVoiceCost * unmatchedVoiceCount +
    s.largeLeapPenalty * largeLeapCount +
    s.parallelFifthPenalty * parallelFifths +
    s.parallelOctavePenalty * parallelOctaves;

  return deepFreeze({
    movements,
    totalMovement,
    maxMovement,
    stationaryVoiceCount,
    unmatchedVoiceCount,
    largeLeapCount,
    parallelFifths,
    parallelOctaves,
    cost,
  });
}

// ---------------------------------------------------------------------------
// Recherche globale du meilleur chemin de voicings
// ---------------------------------------------------------------------------

/**
 * Comparaison terminale de deux états : critères cumulés, puis les rangs
 * lexicographiques MIDI et d'indices.
 * @param {object} a
 * @param {object} b
 * @returns {boolean} vrai si `a` bat `b`
 */
function stateBeats(a, b) {
  if (a.totalCost !== b.totalCost) return a.totalCost < b.totalCost;
  if (a.octaves !== b.octaves) return a.octaves < b.octaves;
  if (a.fifths !== b.fifths) return a.fifths < b.fifths;
  if (a.leap !== b.leap) return a.leap < b.leap;
  if (a.unmatched !== b.unmatched) return a.unmatched < b.unmatched;
  if (a.movement !== b.movement) return a.movement < b.movement;
  if (a.registerDev !== b.registerDev) return a.registerDev < b.registerDev;
  if (a.midiRank !== b.midiRank) return a.midiRank < b.midiRank;
  return a.indexRank < b.indexRank;
}

/**
 * Départage au sein d'une colonne (même candidat courant) : seul le préfixe
 * (rangs lexicographique et d'indices du prédécesseur) distingue deux options
 * à cumulés à coût égal.
 * @param {object} a
 * @param {object} b
 * @returns {boolean} vrai si `a` bat `b`
 */
function columnBeats(a, b) {
  if (a.totalCost !== b.totalCost) return a.totalCost < b.totalCost;
  if (a.octaves !== b.octaves) return a.octaves < b.octaves;
  if (a.fifths !== b.fifths) return a.fifths < b.fifths;
  if (a.leap !== b.leap) return a.leap < b.leap;
  if (a.unmatched !== b.unmatched) return a.unmatched < b.unmatched;
  if (a.movement !== b.movement) return a.movement < b.movement;
  if (a.registerDev !== b.registerDev) return a.registerDev < b.registerDev;
  if (a.prefixMidiRank !== b.prefixMidiRank) return a.prefixMidiRank < b.prefixMidiRank;
  return a.prefixIndexRank < b.prefixIndexRank;
}

/**
 * Ordinal lexical d'une suite MIDI au sein d'une couche.
 * @param {PianoVoicing[]} layer
 * @returns {Map<PianoVoicing, number>}
 */
function midiOrdinals(layer) {
  const sorted = layer.slice().sort((x, y) => compareMidiArrays(x.midiNotes, y.midiNotes));
  const ord = new Map();
  for (let i = 0; i < sorted.length; i++) ord.set(sorted[i], i);
  return ord;
}

/**
 * Réassigne les rangs lexicographiques MIDI d'une ligne (profondeur t).
 * @param {object[]} row
 */
function assignMidiRanks(row) {
  const order = row.map((_, idx) => idx);
  order.sort((x, y) => {
    if (row[x].prefixMidiRank !== row[y].prefixMidiRank) {
      return row[x].prefixMidiRank - row[y].prefixMidiRank;
    }
    return row[x].midiOrdinal - row[y].midiOrdinal;
  });
  let rank = 0;
  let lastPrefix = null;
  let lastOrd = null;
  for (let k = 0; k < order.length; k++) {
    const state = row[order[k]];
    if (k > 0 && (state.prefixMidiRank !== lastPrefix || state.midiOrdinal !== lastOrd)) {
      rank++;
    }
    state.midiRank = rank;
    lastPrefix = state.prefixMidiRank;
    lastOrd = state.midiOrdinal;
  }
}

/**
 * Réassigne les rangs d'indices (variante) d'une ligne (profondeur t).
 * @param {object[]} row
 */
function assignIndexRanks(row) {
  const order = row.map((_, idx) => idx);
  order.sort((x, y) => {
    if (row[x].prefixIndexRank !== row[y].prefixIndexRank) {
      return row[x].prefixIndexRank - row[y].prefixIndexRank;
    }
    return row[x].index - row[y].index;
  });
  let rank = 0;
  let lastPrefix = null;
  let lastIdx = null;
  for (let k = 0; k < order.length; k++) {
    const state = row[order[k]];
    if (k > 0 && (state.prefixIndexRank !== lastPrefix || state.index !== lastIdx)) {
      rank++;
    }
    state.indexRank = rank;
    lastPrefix = state.prefixIndexRank;
    lastIdx = state.index;
  }
}

/**
 * Trouve le chemin global de voicings optimal pour un HarmonicPathResult.
 *
 * @param {{ harmonicPathResult: HarmonicPathResult }} input
 * @returns {VoicingPathResult}
 */
export function findBestVoicingPath({ harmonicPathResult }) {
  if (harmonicPathResult == null || typeof harmonicPathResult !== 'object') {
    throw new TypeError('harmonicPathResult doit être un objet non nul');
  }
  const path = harmonicPathResult.path;
  if (!Array.isArray(path) || path.length === 0) {
    throw new TypeError('harmonicPathResult.path doit être un tableau non vide');
  }
  for (let t = 0; t < path.length; t++) {
    validateCandidate(path[t], `harmonicPathResult.path[${t}]`);
  }

  // Génération des voicings de chaque couche, une seule fois par candidat.
  const chord = path;
  const layers = chord.map((c, t) => {
    try {
      return generatePlayableChordVoicings({ candidate: c });
    } catch (err) {
      if (err instanceof RangeError) {
        throw new RangeError(
          `aucun voicing admissible pour le candidat d'indice ${t} (${c.id})`,
        );
      }
      throw err;
    }
  });

  // Transitions pré-calculées entre deux couches adjacentes (une seule fois).
  const transCache = [];
  for (let t = 0; t < layers.length - 1; t++) {
    const row = [];
    for (let i = 0; i < layers[t].length; i++) {
      const cell = [];
      for (let j = 0; j < layers[t + 1].length; j++) {
        cell.push(scoreVoicingTransition({
          fromMidiNotes: layers[t][i].midiNotes,
          toMidiNotes: layers[t + 1][j].midiNotes,
        }));
      }
      row.push(cell);
    }
    transCache.push(row);
  }

  const midiOrd = layers.map((layer) => midiOrdinals(layer));

  // État initial : couche 0.
  const K0 = layers[0].length;
  let dp = new Array(K0);
  for (let j = 0; j < K0; j++) {
    const voicing = layers[0][j];
    dp[j] = {
      voicing,
      index: j,
      prev: null,
      totalCost: 0,
      octaves: 0,
      fifths: 0,
      leap: 0,
      unmatched: 0,
      movement: 0,
      registerDev: voicing.registerDeviation,
      prefixMidiRank: 0,
      prefixIndexRank: 0,
      midiOrdinal: midiOrd[0].get(voicing),
    };
  }
  assignMidiRanks(dp);
  assignIndexRanks(dp);

  // Programmation dynamique exacte, comparable depuis la première couche.
  for (let t = 1; t < layers.length; t++) {
    const row = new Array(layers[t].length);
    const layer = layers[t];
    for (let j = 0; j < layer.length; j++) {
      let best = null;
      for (let i = 0; i < layers[t - 1].length; i++) {
        const prev = dp[i];
        const tr = transCache[t - 1][i][j];
        const voicing = layer[j];
        const cand = {
          voicing,
          index: j,
          totalCost: prev.totalCost + tr.cost,
          octaves: prev.octaves + tr.parallelOctaves,
          fifths: prev.fifths + tr.parallelFifths,
          leap: prev.leap + tr.largeLeapCount,
          unmatched: prev.unmatched + tr.unmatchedVoiceCount,
          movement: prev.movement + tr.totalMovement,
          registerDev: prev.registerDev + voicing.registerDeviation,
          prev,
          prefixMidiRank: prev.midiRank,
          prefixIndexRank: prev.indexRank,
          midiOrdinal: midiOrd[t].get(voicing),
        };
        if (best === null || columnBeats(cand, best)) {
          best = cand;
        }
      }
      row[j] = best;
    }
    assignMidiRanks(row);
    assignIndexRanks(row);
    dp = row;
  }

  // Meilleur état terminal.
  let leaf = dp[0];
  for (let j = 1; j < dp.length; j++) {
    if (stateBeats(dp[j], leaf)) leaf = dp[j];
  }

  // Reconstruction par backtracking.
  const revVoicings = [];
  const revIndices = [];
  let state = leaf;
  while (state) {
    revVoicings.push(state.voicing);
    revIndices.push(state.index);
    state = state.prev;
  }
  const voicings = [];
  const indices = [];
  for (let k = revVoicings.length - 1; k >= 0; k--) {
    voicings.push(revVoicings[k]);
    indices.push(revIndices[k]);
  }

  const chordPath = chord.slice();
  const transitions = [];
  let totalMovement = 0;
  let unmatchedVoiceCount = 0;
  let largeLeapCount = 0;
  let parallelFifths = 0;
  let parallelOctaves = 0;
  let totalCost = 0;
  let registerDeviation = 0;
  for (let t = 0; t < voicings.length; t++) {
    registerDeviation += voicings[t].registerDeviation;
    if (t < voicings.length - 1) {
      const score = transCache[t][indices[t]][indices[t + 1]];
      transitions.push(Object.freeze({ from: voicings[t], to: voicings[t + 1], score }));
      totalMovement += score.totalMovement;
      unmatchedVoiceCount += score.unmatchedVoiceCount;
      largeLeapCount += score.largeLeapCount;
      parallelFifths += score.parallelFifths;
      parallelOctaves += score.parallelOctaves;
      totalCost += score.cost;
    }
  }

  return Object.freeze({
    chordPath: Object.freeze(chordPath.slice()),
    voicings: Object.freeze(voicings.slice()),
    transitions: Object.freeze(transitions.slice()),
    totalMovement,
    unmatchedVoiceCount,
    largeLeapCount,
    parallelFifths,
    parallelOctaves,
    totalCost,
    registerDeviation,
    settings: VOICING_PATH_SETTINGS,
  });
}