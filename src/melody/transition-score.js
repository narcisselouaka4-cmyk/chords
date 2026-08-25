// [OpenCode] — 2026-08-06 — Incrément 5 : score d'une transition dirigée entre deux ChordCandidate.
// Module pur, déterministe et testable. Aucun voicing, aucune sélection de chemin,
// aucun calcul de MelodyCompatibility, aucune connaissance de CHORD_DEFINITIONS.

/**
 * Distance cyclique minimale entre deux pitch classes, exprimée en demi-tons.
 * @param {number} x
 * @param {number} y
 * @returns {number} 0 à 6
 */
function cyclicDistance(x, y) {
  const d = Math.abs(x - y);
  return Math.min(d, 12 - d);
}

/**
 * Moyenne des plus courtes distances cycliques de chaque note de A vers B.
 * @param {number[]} a
 * @param {number[]} b
 * @returns {number} 0 à 6
 */
function directedMean(a, b) {
  let sum = 0;
  for (const notePc of a) {
    let best = 6;
    for (const targetPc of b) {
      const d = cyclicDistance(notePc, targetPc);
      if (d < best) best = d;
    }
    sum += best;
  }
  return a.length === 0 ? 0 : sum / a.length;
}

/**
 * Proxy symétrique et bidirectionnel du déplacement entre deux ensembles de
 * pitch classes. Compris entre 0 (ensembles identiques) et 6.
 * @param {number[]} a
 * @param {number[]} b
 * @returns {number}
 */
function movementSemitonesBetween(a, b) {
  return (directedMean(a, b) + directedMean(b, a)) / 2;
}

/**
 * Distance sur le cycle des quintes entre deux pitch classes.
 * @param {number} a
 * @param {number} b
 * @returns {number} 0 à 6
 */
function fifthsDistance(a, b) {
  const k = (((b - a) * 7) % 12 + 12) % 12;
  return Math.min(k, 12 - k);
}

/**
 * Copie triée et dédupliquée des pitch classes.
 * @param {number[]} pcs
 * @returns {number[]}
 */
function deduplicatedSortedPcs(pcs) {
  return Array.from(new Set(pcs)).sort((x, y) => x - y);
}

/**
 * Détecte une résolution V → I (principale ou secondaire).
 * - Résolution principale : V (degré 4) → I (degré 0) dans la tonalité principale.
 * - Résolution secondaire : from.secondaryDominantTarget === to.degree
 *   (ex. V/ii → ii, V/vi → vi, etc.)
 * @param {ChordCandidate} from
 * @param {ChordCandidate} to
 * @returns {boolean}
 */
function isDominantToTonic(from, to) {
  if (!from.tonalRelation || !to.tonalRelation) return false;
  // Résolution principale : V (degré 4) → I (degré 0) dans la tonalité principale
  if (from.tonalRelation.degree === 4 && to.tonalRelation.degree === 0) {
    return true;
  }
  // Résolution secondaire : dominante secondaire vers sa cible
  const target = from.tonalRelation.secondaryDominantTarget;
  if (target !== null && target !== undefined && target === to.tonalRelation.degree) {
    return true;
  }
  return false;
}

/**
 * Validate un candidat. Lève TypeError sur toute donnée invalide.
 * @param {ChordCandidate} candidate
 * @param {string} role
 */
function validateCandidate(candidate, role) {
  if (candidate == null || typeof candidate !== 'object') {
    throw new TypeError(`${role} doit être un ChordCandidate valide`);
  }
  if (typeof candidate.id !== 'string' || candidate.id.length === 0) {
    throw new TypeError(`${role}.id doit être une chaîne non vide`);
  }
  const pcs = candidate.pitchClasses;
  if (!Array.isArray(pcs) || pcs.length === 0) {
    throw new TypeError(`${role}.pitchClasses doit être un tableau non vide`);
  }
  for (const pc of pcs) {
    if (typeof pc !== 'number' || !Number.isInteger(pc) || pc < 0 || pc > 11) {
      throw new TypeError(`${role}.pitchClasses contient une pitch class invalide`);
    }
  }
  const root = candidate.rootPitchClass;
  if (typeof root !== 'number' || !Number.isInteger(root) || root < 0 || root > 11) {
    throw new TypeError(`${role}.rootPitchClass doit être un entier entre 0 et 11`);
  }
  const bass = candidate.bassPitchClass;
  // Une basse absente (propriété omise) ou null est valide et normalisée à null.
  if (bass !== undefined && bass !== null) {
    if (typeof bass !== 'number' || !Number.isInteger(bass) || bass < 0 || bass > 11) {
      throw new TypeError(`${role}.bassPitchClass doit être un entier entre 0 et 11, ou null`);
    }
  }
}

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

/** Poids des composantes actives d'une transition. Figés, non configurables. */
const W_COMMON = 0.35;
const W_MOTION = 0.35;
const W_ROOT = 0.30;
const W_BASS = 0.10;
const W_RESOLUTION = 0.10;

/** Association nom → poids, figée, dérivée des constantes W_*. */
export const TRANSITION_WEIGHTS = Object.freeze({
  common: W_COMMON,
  motion: W_MOTION,
  root: W_ROOT,
  bass: W_BASS,
  resolution: W_RESOLUTION,
});

/** Limites documentées du proxy (pitch classes seules, sans voicings). */
const LIMITS = Object.freeze([
  'Le calcul repose uniquement sur les pitch classes des candidats.',
  'Il ne connaît ni octave, ni registre, ni renversement réel.',
  'Une note commune théorique peut être réarticulée dans une autre octave.',
  'Les omissions réelles du futur voicing ne sont pas encore évaluées.',
  'Les quintes et octaves parallèles ne sont pas détectables ici.',
]);

/**
 * Évalue une transition dirigée de `from` vers `to`.
 *
 * @param {{ from: ChordCandidate, to: ChordCandidate }} input
 * @returns {TransitionScore}
 */
export function scoreChordTransition({ from, to }) {
  validateCandidate(from, 'from');
  validateCandidate(to, 'to');

  const a = deduplicatedSortedPcs(from.pitchClasses);
  const b = deduplicatedSortedPcs(to.pitchClasses);

  // --- Notes communes (symétrique) ---
  let commonTones = 0;
  for (const pc of a) {
    if (b.includes(pc)) commonTones++;
  }
  const commonToneRate = commonTones / Math.min(a.length, b.length);
  const commonScore = 100 * commonToneRate;

  // --- Proxy de mouvement (symétrique bidirectionnel) ---
  const movementSemitones = movementSemitonesBetween(a, b);
  const movementRate = 1 - Math.min(movementSemitones / 6, 1);
  const motionScore = 100 * movementRate;

  // --- Mouvement de fondamentale (symétrique) ---
  const rootFifthsDistance = fifthsDistance(from.rootPitchClass, to.rootPitchClass);
  const rootScore = 100 * (1 - rootFifthsDistance / 6);

  // --- Basse explicite (active seulement si les deux basses existent) ---
  // Une basse absente (propriété omise) est normalisée à null ici.
  const fromBass = from.bassPitchClass === undefined ? null : from.bassPitchClass;
  const toBass = to.bassPitchClass === undefined ? null : to.bassPitchClass;
  const bassActive = fromBass !== null && toBass !== null;
  const bassScore = bassActive
    ? 100 * (1 - fifthsDistance(fromBass, toBass) / 6)
    : null;

  // --- Résolution directional V → I (bonus de résolution) ---
  const resolutionActive = isDominantToTonic(from, to);
  const resolutionScore = resolutionActive ? 100 : null;

  // --- Poids actifs ---
  const activeIds = ['common', 'motion', 'root'];
  if (bassActive) activeIds.push('bass');
  if (resolutionActive) activeIds.push('resolution');
  const activeWeights = {};
  for (const id of activeIds) {
    activeWeights[id] = TRANSITION_WEIGHTS[id];
  }

  const componentScores = {
    common: commonScore,
    motion: motionScore,
    root: rootScore,
    bass: bassScore,
    resolution: resolutionScore,
  };

  let weightedSum = 0;
  let weightTotal = 0;
  for (const id of activeIds) {
    weightedSum += activeWeights[id] * componentScores[id];
    weightTotal += activeWeights[id];
  }
  const totalScore = Math.round(weightedSum / weightTotal);

  return deepFreeze({
    fromId: from.id,
    toId: to.id,
    commonTones,
    commonToneRate,
    movementSemitones,
    movementRate,
    rootFifthsDistance,
    rootScore,
    bassScore,
    resolutionScore,
    componentScores,
    activeWeights,
    direction: 'directional',
    totalScore,
    limits: LIMITS,
  });
}