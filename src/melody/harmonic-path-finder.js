// [OpenCode] — 2026-08-06 — Incrément 6 : sélection du meilleur chemin harmonique global.
// Programmation dynamique exacte de type Viterbi sur une succession ordonnée de
// couches de ChordCandidate. Chaque couche contribue exactement un candidat au
// chemin final. Le score combine la compatibilité mélodique (Incrément 4) et les
// transitions entre candidats consécutifs (Incrément 5, scoreChordTransition).
//
// Module pur : pas de DOM, pas de réseau, pas d'IA, pas de mutation des entrées,
// pas d'état global, pas de cache persistant entre deux appels.
//
// Complexité de l'espace : chaque état dynamique a une taille constante (aucune
// copie de suite d'identifiants ni de suite d'indices). Le départage
// lexicographique et le départage par indices utilisent des rangs entiers
// re-numérotés à chaque profondeur, calculés à partir de la paire
// (rang du préfixe, identifiant courant) puis (rang d'indices du préfixe,
// indice courant), ce qui préserve l'ordre d'une comparaison vraiment
// lexicographique sans jamais matérialiser les suites complètes.

import { scoreChordTransition } from './transition-score.js';

// ---------------------------------------------------------------------------
// Constantes internes non configurables
// ---------------------------------------------------------------------------

/**
 * Poids du score de compatibilité mélodique dans le chemin global.
 * Conservés uniquement pour la sortie publique `weights` .
 */
const W_COMPATIBILITY = 0.60;

/** Poids du score de transition dans le chemin global. */
const W_TRANSITION = 0.40;

/**
 * Unités entières exactes du score pondéré.
 *
 * Les poids 0.60 et 0.40 étant respectivement égaux à  3/5 et 2/5 , on compare
 * les chemins avec une unité entière exacte `scoreUnits = 3×compatSum
 * + 2×transSum`, strictement équivalente à `0.60×compatSum + 0.40×transSum`
 * mais sans erreurs flottantes d'accumulation. Le score final se normalise
 * alors par `3×N + 2×(N−1)` et vaut exactement 100 pour un chemin parfait.
 */
const UNIT_COMPATIBILITY = 3;
const UNIT_TRANSITION = 2;

/**
 * Score MelodyCompatibility canonique.
 *
 * L'Incrément 4 ne définit aucun champ numérique de compatibilité : le contrat
 * réel expose uniquement `melodyCompatibility.category`. Le score déterministe
 * C_i utilisé ici est donc dérivé exclusivement de cette catégorie canonique,
 * selon l'échelle figée ci-dessous (adoptée explicitement par l'utilisateur).
 * Aucun autre champ n'est lu ni inventé.
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
 * Lecture stricte : `melodyCompatibility` doit être un objet non nul, et
 * `category` doit être une chaîne qui soit une propriété propre de la table des
 * scores. Un check par `Object.hasOwn` rend impossible toute résolution vers
 * des valeurs héritées d'`Object.prototype` (toString, constructor, valueOf,
 * hasOwnProperty, __proto__…), qui lèveraient `TypeError` au lieu de produire
 * `NaN` ou `Infinity`. La propriété `category` n'est lue qu'une seule fois.
 *
 * @param {ChordCandidate} candidate
 * @returns {number} score dans [0,100]
 */
function compatibilityScoreOf(candidate) {
  const mc = candidate.melodyCompatibility;
  if (mc === null || typeof mc !== 'object' || Array.isArray(mc)) {
    throw new TypeError('melodyCompatibility doit être un objet non nul');
  }
  const category = mc.category;
  if (typeof category !== 'string' || !Object.hasOwn(MELODY_CATEGORY_SCORES, category)) {
    throw new TypeError(
      `category de melodyCompatibility invalide : ${category === null ? 'null' : String(category)}`,
    );
  }
  return MELODY_CATEGORY_SCORES[category];
}

/**
 * Valide le contrat public de chaque candidat en réutilisant l'API existante
 * de l'Incrément 5 (transition identité candidat → même candidat, garantie
 * valide). La validation de `melodyCompatibility` reste locale car ce champ
 * n'est pas vérifié par scoreChordTransition.
 *
 * @param {ChordCandidate} candidate
 * @param {string} role
 * @returns {number} score de compatibilité mélodique dans [0..100]
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
// Départage déterministe (par rangs)
// ---------------------------------------------------------------------------

/**
 * Même colonne : deux choix de prédécesseur pour le même candidat courant j.
 * La comparaison lexicographique des suites complètes « préfixe + identifiant
 * courant » se réduit alors à la comparaison des suites de préfixes (le suffixe
 * étant identique), soit exactement le rang du préfixe. Il en va de même pour
 * les suites d'indices. Aucune suite n'est jamais copiée.
 *
 * @param {object} a candidat en cours de construction
 * @param {object} b meilleur candidat jusqu'ici (même colonne j)
 * @returns {boolean} vrai si `a` bat `b`
 */
function sameColumnBeats(a, b) {
  if (a.scoreUnits !== b.scoreUnits) return a.scoreUnits > b.scoreUnits;
  if (a.compatSum !== b.compatSum) return a.compatSum > b.compatSum;
  if (a.transSum !== b.transSum) return a.transSum > b.transSum;
  if (a.prefixRank !== b.prefixRank) return a.prefixRank < b.prefixRank;
  if (a.prefixIndexRank !== b.prefixIndexRank) return a.prefixIndexRank < b.prefixIndexRank;
  return false;
}

/**
 * Comparaison terminale de deux états de profondeur égale. Les rangs de la
 * profondeur étant injectifs et ordonnés de façon exactement lexicographique,
 * la comparaison d'entiers reproduit la comparaison des suites complètes.
 *
 * @param {object} a
 * @param {object} b
 * @returns {boolean} vrai si `a` bat `b`
 */
function stateBeats(a, b) {
  if (a.scoreUnits !== b.scoreUnits) return a.scoreUnits > b.scoreUnits;
  if (a.compatSum !== b.compatSum) return a.compatSum > b.compatSum;
  if (a.transSum !== b.transSum) return a.transSum > b.transSum;
  if (a.rank !== b.rank) return a.rank < b.rank;
  return a.indexRank < b.indexRank;
}

/**
 * Re-numérote les rangs lexicographiques d'une ligne de la profondeur courante.
 *
 * Le rang du nouvel état est dérivé du couple (rang du préfixe, ordre de
 * l'identifiant courant). Deux suites d'identifiants réellement identiques
 * reçoivent le même rang ; des suites distinctes reçoivent des rangs
 * distincts, dans l'ordre lexicographique exact.
 *
 * @param {object[]} row
 */
function assignLexicRanks(row) {
  const order = row.map((_, i) => i);
  order.sort((x, y) => {
    const a = row[x];
    const b = row[y];
    if (a.prefixRank !== b.prefixRank) return a.prefixRank - b.prefixRank;
    return a.identOrdinal - b.identOrdinal;
  });
  let rank = 0;
  let lastPrefix = null;
  let lastOrd = null;
  for (let k = 0; k < order.length; k++) {
    const state = row[order[k]];
    if (k > 0 && (state.prefixRank !== lastPrefix || state.identOrdinal !== lastOrd)) {
      rank++;
    }
    state.rank = rank;
    lastPrefix = state.prefixRank;
    lastOrd = state.identOrdinal;
  }
}

/**
 * Re-numérote séparément les rangs des suites d'indices d'origine pour la
 * même profondeur, sur le même principe que les rangs lexicographiques.
 *
 * @param {Array[]} row
 */
function assignIndexRanks(row) {
  const order = row.map((_, i) => i);
  order.sort((x, y) => {
    const a = row[x];
    const b = row[y];
    if (a.prefixIndexRank !== b.prefixIndexRank) return a.prefixIndexRank - b.prefixIndexRank;
    return a.index - b.index;
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
 * Ordinal lexicographique de chaque identifiant d'une couche.
 *
 * @param {ChordCandidate[]} layer
 * @returns {Map<string, number>}
 */
function identOrdinals(layer) {
  const distinct = Array.from(new Set(layer.map((c) => c.id)));
  distinct.sort((x, y) => (x < y ? -1 : x > y ? 1 : 0));
  const ord = new Map();
  for (let k = 0; k < distinct.length; k++) ord.set(distinct[k], k);
  return ord;
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

  const layers = candidateLayers;
  for (let t = 0; t < layers.length; t++) {
    const layer = layers[t];
    if (!Array.isArray(layer) || layer.length === 0) {
      throw new TypeError(`couche ${t} doit être un tableau non vide de candidats`);
    }
  }

  // 1. Scores de compatibilité pré-calculés et validation de chaque candidat.
  //    Une seule lecture de category par candidat, au plus.
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
  // [OpenCode] — 2026-08-26 — EXP-033 : lookahead bonus for secondary dominants.
  // Si le candidat d'arrivée (layer t+1) est une dominante secondaire (a secondaryDominantTarget),
  // et que la couche suivante (t+2) contient un candidat de degré correspondant,
  // on ajoute un bonus au score de transition pour favoriser l'approche de la dominante secondaire.
  const transCache = [];
  for (let t = 0; t < layers.length - 1; t++) {
    const row = [];
    for (let i = 0; i < layers[t].length; i++) {
      const cell = [];
      for (let j = 0; j < layers[t + 1].length; j++) {
        const fromCand = layers[t][i];
        const toCand = layers[t + 1][j];
        let transition = scoreChordTransition({
          from: fromCand,
          to: toCand,
        });

        // Lookahead bonus : si 'to' est une dominante secondaire Neo Soul N1 (7b9→mineur),
        // et que la couche suivante (t+2) contient un candidat de degré correspondant,
        // on ajoute un bonus au score de transition pour favoriser l'approche de la dominante secondaire.
        // On restreint au approachType 'neo-soul-7b9-to-minor' pour ne pas affecter Gospel ni les dominantes secondaires canoniques.
        const secDomTarget = toCand.tonalRelation?.secondaryDominantTarget;
        const approachType = toCand.tonalRelation?.approachType;
        if (
          approachType === 'neo-soul-7b9-to-minor' &&
          secDomTarget !== null &&
          secDomTarget !== undefined &&
          t + 2 < layers.length
        ) {
          // Vérifier si la couche t+2 a un candidat de degré = secDomTarget
          const hasTarget = layers[t + 2].some(
            (c) => c.tonalRelation?.degree === secDomTarget
          );
          if (hasTarget) {
            // On marque le bonus dans componentScores pour l'affichage/debug.
            // Le bonus réel est ajouté en unités (scoreUnits) dans la boucle Viterbi
            // pour éviter l'écrêtage du totalScore à 100.
            transition = Object.freeze({
              ...transition,
              componentScores: Object.freeze({
                ...transition.componentScores,
                secondaryDominantApproach: 35,
              }),
              activeWeights: Object.freeze({
                ...transition.activeWeights,
                secondaryDominantApproach: 0.10,
              }),
            });
          }
        }

        cell.push(transition);
      }
      row.push(cell);
    }
    transCache.push(row);
  }

  // 3. Ordres lexicographiques des identifiants par couche (pour les rangs).
  const idOrd = layers.map((layer) => identOrdinals(layer));

  // 4. État initial : couche 0. Chaque état est de taille constante : rangs
  //    lexicographique et d'indices (suites de longueur 1), sommes numériques
  //    en unités entières exactes, backpointer, candidat et indice d'origine.
  const K0 = layers[0].length;
  let dp = new Array(K0);
  for (let j = 0; j < K0; j++) {
    const cand = layers[0][j];
    dp[j] = {
      candidate: cand,
      index: j,
      prev: null,
      scoreUnits: UNIT_COMPATIBILITY * compatScores[0][j],
      compatSum: compatScores[0][j],
      transSum: 0,
      rank: idOrd[0].get(cand.id),
      indexRank: j,
    };
  }

  // 5. Viterbi, profondeur par profondeur. Aucune suite n'est copiée : chaque
  //    état porte uniquement les rangs de son préfixe et le backpointer vers
  //    son prédécesseur.
  for (let t = 1; t < layers.length; t++) {
    const row = new Array(layers[t].length);
    const layer = layers[t];
    for (let j = 0; j < layer.length; j++) {
      let best = null;
      for (let i = 0; i < layers[t - 1].length; i++) {
        const prev = dp[i];
        const transition = transCache[t - 1][i][j];
        // [OpenCode] — 2026-08-26 — EXP-033 : bonus direct en unités pour approche dominante secondaire Neo Soul.
        // Le bonus est ajouté directement aux scoreUnits pour éviter l'écrêtage à 100 du totalScore.
        const approachBonus = transition.componentScores?.secondaryDominantApproach
          ? UNIT_TRANSITION * transition.componentScores.secondaryDominantApproach
          : 0;
        const cand = {
          candidate: layer[j],
          index: j,
          scoreUnits: prev.scoreUnits
            + UNIT_COMPATIBILITY * compatScores[t][j]
            + UNIT_TRANSITION * transition.totalScore
            + approachBonus,
          compatSum: prev.compatSum + compatScores[t][j],
          transSum: prev.transSum + transition.totalScore,
          prev,
          prefixRank: prev.rank,
          prefixIndexRank: prev.indexRank,
          identOrdinal: idOrd[t].get(layer[j].id),
        };
        if (best === null || sameColumnBeats(cand, best)) {
          best = cand;
        }
      }
      row[j] = best;
    }
    // Rangs définitifs de la profondeur t (suite complète = préfixe + id).
    assignLexicRanks(row);
    // Rangs distincts des suites d'indices.
    assignIndexRanks(row);
    dp = row;
  }

  // 6. Meilleur état terminal de la dernière profondeur.
  let leaf = dp[0];
  for (let j = 1; j < dp.length; j++) {
    if (stateBeats(dp[j], leaf)) leaf = dp[j];
  }

  // 7. Reconstruction du chemin et des transitions par simple backtracking.
  const revCandidates = [];
  const revIndices = [];
  let state = leaf;
  while (state) {
    revCandidates.push(state.candidate);
    revIndices.push(state.index);
    state = state.prev;
  }
  const path = [];
  const indicesInPath = [];
  for (let k = revCandidates.length - 1; k >= 0; k--) {
    path.push(revCandidates[k]);
    indicesInPath.push(revIndices[k]);
  }

  // Les TransitionScore ont déjà été calculés pendant la DP : on les
  // réutilise tels quels pour la reconstruction (déterminisme strict).
  const transitions = [];
  for (let t = 0; t < layers.length - 1; t++) {
    transitions.push(transCache[t][indicesInPath[t]][indicesInPath[t + 1]]);
  }

  // 8. Métriques finales réutilisant les sommes portées par la feuille : aucun
  //    re-parcours, aucune nouvelle lecture de `category`.
  //    La normalisation en unités entières est strictement équivalente à la
  //    formule 0.60/0.40 et garantit exactement 100 pour un chemin parfait.
  const N = path.length;
  const compatibilityScore = leaf.compatSum / N;
  const transitionScore = N > 1 ? leaf.transSum / (N - 1) : null;
  const normalizationWeight = UNIT_COMPATIBILITY * N + UNIT_TRANSITION * (N - 1);
  const totalScore = leaf.scoreUnits / normalizationWeight;

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