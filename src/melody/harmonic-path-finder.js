// [OpenCode] — 2026-08-06 — Incrément 6 : sélection du meilleur chemin harmonique global.
// Programmation dynamique exacte de type Viterbi sur une succession ordonnée de
// couches de ChordCandidate. Chaque couche contribue exactement un candidat au
// chemin final. Le score combine la compatibilité mélodique (Incrément 4) et les
// transitions entre candidats consécutifs (Incrément 5, scoreChordTransition).
//
// Module pur : pas de DOM, pas de réseau, pas d'IA, pas de mutation des entrées,
// pas d'état global, pas de cache persistant entre deux appels.

import { scoreChordTransition } from './transition-score.js';

// ---------------------------------------------------------------------------
// Constantes internes non configurables
// ---------------------------------------------------------------------------

/** Poids du score de compatibilité mélodique dans le chemin global. */
const W_COMPATIBILITY = 0.60;

/** Poids du score de transition dans le chemin global. */
const W_TRANSITION = 0.40;

/**
 * Score MelodyCompatibility canonique.
 *
 * L'Incrément 4 ne définit aucun champ numérique de compatibilité : le contrat
 * réel expose uniquement `melodyCompatibility.category`. Le score déterministe
 * C_i utilisé ici est donc dérivé exclusivement de cette catégorie canonique,
 * selon l'échelle figée ci-dessous. Aucun autre champ n'est lu ni inventé.
 */
const MELODY_CATEGORY_SCORES = Object.freeze({
  'chord-tone': 100,
  'available-tension': 90,
  'suspension': 60,
  'non-chord-tone-allowed': 30,
  incompatible: 0,
});

// ---------------------------------------------------------------------------
// Types conceptuels (documentés dans ./midi-types.js)
// ---------------------------------------------------------------------------

/**
 * @typedef {import('./midi-types.js').ChordCandidate} ChordCandidate
 * @typedef {import('./midi-types.js').TransitionScore} TransitionScore
 * @typedef {import('./midi-types.js').HarmonicPathResult} HarmonicPathResult
 */

// ---------------------------------------------------------------------------
// Helpers de validation
// ---------------------------------------------------------------------------

/**
 * Score de compatibilité mélodique canonique d'un candidat.
 *
 * @param {ChordCandidate} candidate
 * @returns {number} score dans [0,100]
 */
function compatibilityScoreOf(candidate) {
  const mc = candidate.melodyCompatibility;
  if (mc == null) {
    throw new TypeError('melodyCompatibility absente : la compatibilité mélodique est requise');
  }
  const score = MELODY_CATEGORY_SCORES[mc.category];
  if (score === undefined) {
    throw new TypeError(`category de melodyCompatibility invalide : ${String(mc.category)}`);
  }
  return score;
}

/**
 * Valide le contrat public de chaque candidat en réutilisant l'API existante
 * de l'Incrément 5 (transition identité candidat → même candidat, garantie
 * valide). La validation de `melodyCompatibility` reste locale car ce champ
 * n'est pas vérifié par scoreChordTransition.
 *
 * @param {ChordCandidate} candidate
 * @param {string} role
 * @returns {number} score de compatibilité mélodique dans [0,100]
 */
function validateCandidate(candidate, role) {
  if (candidate == null || typeof candidate !== 'object') {
    throw new TypeError(`${role} doit être un objet non nul`);
  }
  // Réutilise le validateur public de l'Incrémentée 5 (id, pitchClasses,
  // rootPitchClass, bassPitchClass absente/null autorisée).
  scoreChordTransition({ from: candidate, to: candidate });
  return compatibilityScoreOf(candidate);
}

// ---------------------------------------------------------------------------
// Départage déterministe
// ---------------------------------------------------------------------------

/**
 * Compare deux suites de chaînes en partant de la première valeur.
 * Ordre lexicographique strict par indices, indéterminé en cas d'égalité.
 *
 * @param {string[]} a
 * @param {string[]} b
 * @returns {-1|0|1}
 */
function compareStringSequences(a, b) {
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1;
  }
  if (a.length !== b.length) return a.length < b.length ? -1 : 1;
  return 0;
}

/**
 * Compare deux suites d'indices d'origine en partant de la première couche.
 *
 * @param {number[]} a
 * @param {number[]} b
 * @returns {number}
 */
function compareIndexSequences(a, b) {
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    if (a[i] !== b[i]) return a[i] - b[i];
  }
  if (a.length !== b.length) return a.length - b.length;
  return 0;
}

/**
 * Comparaison de deux états dynamiques. Retourne true si `A` bat `B`.
 *
 * 1. plus grande somme pondérée ;
 * 2. à égalité, plus grande somme de compatibilité ;
 * 3. à égalité, plus grande somme de transitions ;
 * 4. à égalité, identifiants lexicalement plus petits ;
 * 5. à égalité, indices d'origine plus petits.
 *
 * @param {object} a
 * @param {object} b
 * @returns {boolean}
 */
function stateBeats(a, b) {
  if (a.weightedSum !== b.weightedSum) return a.weightedSum > b.weightedSum;
  if (a.compatSum !== b.compatSum) return a.compatSum > b.compatSum;
  if (a.transSum !== b.transSum) return a.transSum > b.transSum;
  const idCmp = compareStringSequences(a.ids, b.ids);
  if (idCmp !== 0) return idCmp < 0;
  return compareIndexSequences(a.indices, b.indices) < 0;
}

// ---------------------------------------------------------------------------
// Programmation dynamique
// ---------------------------------------------------------------------------

/**
 * Trouve le chemin harmonique global optimal à travers les couches.
 *
 * @param {{ candidateLayers: ChordCandidate[][] }} input
 * @returns {HarmonicPathResult}
 */
export function findBestHarmonicPath({ candidateLayers }) {
  if (candidateLayers === undefined) {
    throw new TypeError('candidateLayers est requis');
  }
  if (!Array.isArray(candidateLayers) || candidateLayers.length === 0) {
    throw new TypeError('candidateLayers doit être un tableau non vide de couches');
  }

  const compensations = candidateLayers.length;
  const layers = candidateLayers;
  for (let t = 0; t < layers.length; t++) {
    const layer = layers[t];
    if (!Array.isArray(layer) || layer.length === 0) {
      throw new TypeError(`couche ${t} doit être un tableau non vide de candidats`);
    }
  }

  // 1. Scores de compatibilité pré-calculés et validation de chaque candidat.
  const compatScores = layers.map((layer, t) =>
    layer.map((candidate, j) => {
      try {
        return validateCandidate(candidate, `candidateLayers[${t}][${j}]`);
      } catch (err) {
        if (err instanceof TypeError) throw err;
        throw new TypeError(`candidateLayers[${t}][${j}] invalide`);
      }
    }),
  );

  // 2. Transitions pré-calculées entre couches adjacentes.
  // transCache[t][i][j] = TransitionScore(candidateLayers[t][i] → candidateLayers[t+1][j]).
  const transCache = [];
  for (let t = 0; t < layers.length - 1; t++) {
    const row = [];
    for (let i = 0; i < layers[t].length; i++) {
      const cell = [];
      for (let j = 0; j < layers[t + 1].length; j++) {
        cell.push(
          scoreChordTransition({
            from: layers[t][i],
            to: layers[t + 1][j],
          }),
        );
      }
      row.push(cell);
    }
    transCache.push(row);
  }

  // 3. Viterbi avec backpointers.
  let dp = layers[0].map((cand, j) => ({
    weightedSum: W_COMPATIBILITY * compatScores[0][j],
    compatSum: compatScores[0][j],
    transSum: 0,
    ids: [cand.id],
    indices: [j],
    candidate: cand,
    prev: null,
  }));

  for (let t = 1; t < layers.length; t++) {
    const next = [];
    for (let j = 0; j < layers[t].length; j++) {
      let best = null;
      for (let i = 0; i < layers[t - 1].length; i++) {
        const prevState = dp[i];
        const transition = transCache[t - 1][i][j];
        const candidate = {
          weightedSum: prevState.weightedSum
            + W_COMPATIBILITY * compatScores[t][j]
            + W_TRANSITION * transition.totalScore,
          compatSum: prevState.compatSum + compatScores[t][j],
          transSum: prevState.transSum + transition.totalScore,
          ids: [...prevState.ids, layers[t][j].id],
          indices: [...prevState.indices, j],
          candidate: layers[t][j],
          prev: prevState,
        };
        if (best === null || stateBeats(candidate, best)) {
          best = candidate;
        }
      }
      next.push(best);
    }
    dp = next;
  }

  // 4. Meilleur état terminal.
  let leaf = dp[0];
  for (let j = 1; j < dp.length; j++) {
    if (stateBeats(dp[j], leaf)) leaf = dp[j];
  }

  // 5. Reconstruction du chemin et des transitions.
  // La feuille terminale porte les indices d'origine de chaque couche.
  const indicesInPath = leaf.indices;
  const revPath = [];
  let state = leaf;
  while (state) {
    revPath.push(state.candidate);
    state = state.prev;
  }
  const path = [];
  for (let k = revPath.length - 1; k >= 0; k--) {
    path.push(revPath[k]);
  }

  // Les TransitionScore ont déjà été calculés pendant la DP : on les
  // réutilise tels quels pour la reconstruction (déterminisme strict).
  const transitions = [];
  for (let t = 0; t < layers.length - 1; t++) {
    transitions.push(transCache[t][indicesInPath[t]][indicesInPath[t + 1]]);
  }

  // 6. Métriques finales.
  const N = path.length;
  const compatTotal = path.reduce((acc, c) => acc + compatibilityScoreOf(c), 0);
  const compatibilityScore = compatTotal / N;

  let transitionScore = null;
  if (N > 1) {
    const transTotal = transitions.reduce((acc, tr) => acc + tr.totalScore, 0);
    transitionScore = transTotal / (N - 1);
  }

  const weightedSum = W_COMPATIBILITY * compatTotal + W_TRANSITION *
    (N > 1 ? transitions.reduce((acc, tr) => acc + tr.totalScore, 0) : 0);
  const normalizationWeight = W_COMPATIBILITY * N + W_TRANSITION * (N - 1);
  const totalScore = weightedSum / normalizationWeight;

  const weights = Object.freeze({
    compatibility: W_COMPATIBILITY,
    transition: W_TRANSITION,
  });

  return Object.freeze({
    path: Object.freeze(path),
    transitions: Object.freeze(transitions),
    compatibilityScore,
    transitionScore,
    totalScore,
    weights,
  });
}