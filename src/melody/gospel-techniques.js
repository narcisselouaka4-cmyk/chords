// [OpenCode] — 2026-08-24 — Réharmonisation V1, Étape 1, Tâche 2 : bibliothèque
// de techniques Gospel.
//
// Couche additive au-dessus du générateur de candidats canonique
// (src/melody/chord-candidate-generator.js) : ajoute des candidats
// spécifiques au style Gospel, chacun traçable à une règle explicite de la
// bibliothèque (critère 4 du score de validité).
//
// Périmètre V1 : style Gospel uniquement. Jazz et Neo Soul explicitement hors
// périmètre — leurs bibliothèques seront construites plus tard par une
// recherche séparée.
//
// Aucune décision de voicing ici : les voicings restent produits par
// voicing-path-finder. Aucune modification du moteur canonique : les techniques
// Gospel sont injectées comme candidats supplémentaires avant le path-finder.
//
// Invariant numéro un (non négociable) : ne jamais sacrifier la mélodie. Le
// générateur canonique valide déjà la compatibilité mélodique de chaque
// candidat ; les techniques Gospel ne produisent que des candidats qui passent
// cette validation (sinon ils sont rejetés comme les autres).

import {
  buildCandidate,
  deduplicateChordCandidates,
  sortCandidates,
  SUPPORTED_QUALITIES,
  MAJOR_DEGREES,
  MINOR_DEGREES,
} from './chord-candidate-generator.js';

function normalizePc(pc) {
  return ((pc % 12) + 12) % 12;
}

// ---------------------------------------------------------------------------
// Catalogue des techniques Gospel (traçabilité — critère 4 du score)
// ---------------------------------------------------------------------------

/**
 * @typedef {{
 *   id: string,
 *   name: string,
 *   description: string,
 *   appliesTo: 'passage' | 'structural' | 'both',
 *   source: string
 * }} GospelTechnique
 *
 * `source` est la valeur du champ `source` du ChordCandidate pour traçabilité.
 */

export const GOSPEL_TECHNIQUES = Object.freeze([
  {
    id: 'gospel-passage-alt7b9',
    name: 'Accord de passage V7b9',
    description:
      "Dominante altérée avec b9 comme accord de passage vers sa cible. " +
      "La mélodie est traitée comme tension b9 (intervalle 1 ou 13 au-dessus de " +
      "la dominante). Résolution obligatoire vers la cible diatonique.",
    appliesTo: 'passage',
    source: 'gospel-passage-7b9',
  },
  {
    id: 'gospel-passage-alt7sharp5',
    name: 'Accord de passage V7#5',
    description:
      "Dominante altérée avec #5 (augmentée) comme accord de passage. " +
      "La mélodie est traitée comme #5. Résolution obligatoire vers la cible.",
    appliesTo: 'passage',
    source: 'gospel-passage-7sharp5',
  },
  {
    id: 'gospel-structural-add9',
    name: 'Accord structurel add9',
    description:
      "Accord diatonique enrichi d'une 9e quand la mélodie est la 9e de " +
      "l'accord. Couleur gospel typique sur I, IV, vi (ex. Fadd9, Dm9, " +
      "Cmaj9). Pas de résolution requise : c'est un accord structurel.",
    appliesTo: 'structural',
    source: 'gospel-add9',
  },
  {
    id: 'gospel-structural-add6',
    name: 'Accord structurel add6/13',
    description:
      "Accord diatonique enrichi d'une 6e/13e quand la mélodie est la 6e. " +
      "Couleur gospel (F6, C6) typique des finales et des转身.",
    appliesTo: 'structural',
    source: 'gospel-add6',
  },
  {
    id: 'gospel-sus2',
    name: 'Accord sus2',
    description:
      "Accord avec tierce remplacée par une 2e quand la mélodie est la 2e. " +
      "Suspension ouverte, typique des montées gospel (Dsus2, Gsus2).",
    appliesTo: 'both',
    source: 'gospel-sus2',
  },
]);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isSupported(q) {
  return typeof q === 'string' && SUPPORTED_QUALITIES.has(q);
}

/**
 * Résout le degré diatonique d'une pitch class dans la tonalité.
 * @param {number} rootPc
 * @param {{ selected: { tonicPitchClass: number, mode: string } } | null} tonalContext
 * @returns {{ degree: number, romanNumeral: string } | null}
 */
function degreeOf(rootPc, tonalContext) {
  if (!tonalContext || !tonalContext.selected) return null;
  const tonic = normalizePc(tonalContext.selected.tonicPitchClass);
  const mode = tonalContext.selected.mode;
  const degrees = mode === 'minor' ? MINOR_DEGREES : MAJOR_DEGREES;
  const offset = normalizePc(rootPc - tonic);
  const found = degrees.find((d) => d.rootOffset === offset);
  return found ? { degree: found.degree, romanNumeral: found.roman } : null;
}

/**
 * Retourne la pitch class de la mélodie liée à une ancre, ou null.
 * @param {object} anchor
 * @param {object} track
 * @returns {number | null}
 */
function melodyPcOf(anchor, track) {
  if (!anchor || !anchor.melodyEventId) return null;
  const ev = track.events.find((e) => e.id === anchor.melodyEventId);
  if (!ev) return null;
  return normalizePc(ev.pitchClass);
}

// ---------------------------------------------------------------------------
// Techniques : génération de candidats
// ---------------------------------------------------------------------------

/**
 * Technique V7b9 : dominante secondaire ou V diatonique avec b9.
 * Condition : la mélodie est à intervalle 1 (b9) ou 13 (#8 = b9 enharmonique
 * à l'octave) au-dessus de la fondamentale dominante. La cible de résolution
 * est le degré vers lequel la dominante résout (un degré en dessous).
 *
 * On génère le candidat uniquement si l'ancre n'est pas la dernière (pas de
 * passage sans résolution possible), et on ne le verrouille jamais : le
 * path-finder décidera.
 */
function buildAlt7b9Candidates({ anchor, track, harmonicContext, policies }) {
  if (!harmonicContext.tonalContext || !harmonicContext.tonalContext.selected) return [];
  // Dernière ancre : pas de passage possible (pas de cible).
  const anchors = harmonicContext.anchors;
  if (anchor.id === anchors[anchors.length - 1].id) return [];

  const melodyPc = melodyPcOf(anchor, track);
  if (melodyPc === null) return [];
  if (!isSupported('7b9')) return [];

  const tonic = normalizePc(harmonicContext.tonalContext.selected.tonicPitchClass);
  const mode = harmonicContext.tonalContext.selected.mode;
  const degrees = mode === 'minor' ? MINOR_DEGREES : MAJOR_DEGREES;

  const candidates = [];
  // On tente V7b9 diatonique (degré V) + dominantes secondaires vers chaque degré.
  for (const targetDeg of degrees) {
    const targetRoot = normalizePc(tonic + targetDeg.rootOffset);
    const dominantRoot = normalizePc(targetRoot + 7);
    const b9Interval = normalizePc(melodyPc - dominantRoot);
    if (b9Interval !== 1 && b9Interval !== 13) continue;

    const targetDegreeInfo = degreeOf(dominantRoot, harmonicContext.tonalContext);
    candidates.push(buildCandidate({
      anchorId: anchor.id,
      melodyEvent: track.events.find((e) => e.id === anchor.melodyEventId) || null,
      rootPc: dominantRoot,
      quality: '7b9',
      bassPc: null,
      tonalContext: harmonicContext.tonalContext,
      source: 'gospel-passage-7b9',
      locked: false,
      tonalRelation: {
        degree: targetDegreeInfo ? targetDegreeInfo.degree : null,
        romanNumeral: targetDeg.roman ? `V7b9/${targetDeg.roman}` : 'V7b9',
        diatonic: false,
        borrowed: false,
        secondaryDominantTarget: targetDeg.degree,
        approachType: 'gospel-passage',
      },
      policies,
    }));
  }
  return candidates;
}

/**
 * Technique V7#5 : dominante avec quinte augmentée.
 * Condition : la mélodie est à intervalle 8 (#5) au-dessus de la dominante.
 */
function buildAlt7Sharp5Candidates({ anchor, track, harmonicContext, policies }) {
  if (!harmonicContext.tonalContext || !harmonicContext.tonalContext.selected) return [];
  const anchors = harmonicContext.anchors;
  if (anchor.id === anchors[anchors.length - 1].id) return [];

  const melodyPc = melodyPcOf(anchor, track);
  if (melodyPc === null) return [];
  // [OpenCode] — 2026-08-24 — EXP-030 Tâche B : 7#5 est maintenant dans
  // SUPPORTED_QUALITIES (débloqué). Intervalle 8 = #5 au-dessus de la
  // dominante.
  if (!isSupported('7#5')) return [];

  const tonic = normalizePc(harmonicContext.tonalContext.selected.tonicPitchClass);
  const mode = harmonicContext.tonalContext.selected.mode;
  const degrees = mode === 'minor' ? MINOR_DEGREES : MAJOR_DEGREES;

  const candidates = [];
  for (const targetDeg of degrees) {
    const targetRoot = normalizePc(tonic + targetDeg.rootOffset);
    const dominantRoot = normalizePc(targetRoot + 7);
    const sharp5Interval = normalizePc(melodyPc - dominantRoot);
    if (sharp5Interval !== 8) continue;

    const targetDegreeInfo = degreeOf(dominantRoot, harmonicContext.tonalContext);
    candidates.push(buildCandidate({
      anchorId: anchor.id,
      melodyEvent: track.events.find((e) => e.id === anchor.melodyEventId) || null,
      rootPc: dominantRoot,
      quality: '7#5',
      bassPc: null,
      tonalContext: harmonicContext.tonalContext,
      source: 'gospel-passage-7sharp5',
      locked: false,
      tonalRelation: {
        degree: targetDegreeInfo ? targetDegreeInfo.degree : null,
        romanNumeral: targetDeg.roman ? `V7#5/${targetDeg.roman}` : 'V7#5',
        diatonic: false,
        borrowed: false,
        secondaryDominantTarget: targetDeg.degree,
        approachType: 'gospel-passage',
      },
      policies,
    }));
  }
  return candidates;
}

/**
 * Technique add9 : accord diatonique enrichi d'une 9e.
 * Condition : la mélodie est à intervalle 2 (9e) ou 14 (9e à l'octave) au-dessus
 * de la fondamentale. On ajoute maj9/m9/9 selon la qualité diatonique.
 */
function buildAdd9Candidates({ anchor, track, harmonicContext, policies }) {
  if (!harmonicContext.tonalContext || !harmonicContext.tonalContext.selected) return [];
  const melodyPc = melodyPcOf(anchor, track);
  if (melodyPc === null) return [];

  const tonic = normalizePc(harmonicContext.tonalContext.selected.tonicPitchClass);
  const mode = harmonicContext.tonalContext.selected.mode;
  const degrees = mode === 'minor' ? MINOR_DEGREES : MAJOR_DEGREES;

  const candidates = [];
  for (const deg of degrees) {
    const rootPc = normalizePc(tonic + deg.rootOffset);
    const interval = normalizePc(melodyPc - rootPc);
    if (interval !== 2 && interval !== 14) continue;

    // Choix de la qualité enrichie selon la qualité diatonique.
    let enrichedQuality = null;
    if (deg.quality === 'maj7') enrichedQuality = 'maj9';
    else if (deg.quality === 'm7') enrichedQuality = 'm9';
    else if (deg.quality === '7') enrichedQuality = '9';
    if (!enrichedQuality || !isSupported(enrichedQuality)) continue;

    const degInfo = degreeOf(rootPc, harmonicContext.tonalContext);
    candidates.push(buildCandidate({
      anchorId: anchor.id,
      melodyEvent: track.events.find((e) => e.id === anchor.melodyEventId) || null,
      rootPc,
      quality: enrichedQuality,
      bassPc: null,
      tonalContext: harmonicContext.tonalContext,
      source: 'gospel-add9',
      locked: false,
      tonalRelation: {
        degree: degInfo ? degInfo.degree : deg.degree,
        romanNumeral: deg.roman,
        diatonic: true,
        borrowed: false,
        secondaryDominantTarget: null,
        approachType: 'gospel-add9',
      },
      policies,
    }));
  }
  return candidates;
}

/**
 * Technique add6/13 : accord diatonique enrichi d'une 6e/13e.
 * Condition : la mélodie est à intervalle 9 (6e/13e) au-dessus de la fondamentale.
 */
function buildAdd6Candidates({ anchor, track, harmonicContext, policies }) {
  if (!harmonicContext.tonalContext || !harmonicContext.tonalContext.selected) return [];
  const melodyPc = melodyPcOf(anchor, track);
  if (melodyPc === null) return [];

  const tonic = normalizePc(harmonicContext.tonalContext.selected.tonicPitchClass);
  const mode = harmonicContext.tonalContext.selected.mode;
  const degrees = mode === 'minor' ? MINOR_DEGREES : MAJOR_DEGREES;

  const candidates = [];
  for (const deg of degrees) {
    const rootPc = normalizePc(tonic + deg.rootOffset);
    const interval = normalizePc(melodyPc - rootPc);
    if (interval !== 9) continue;

    // 6 pour majeur, m6 pour mineur, 6/9 si 9e aussi (non testé ici).
    let enrichedQuality = null;
    if (deg.quality === 'maj7') enrichedQuality = '6';
    else if (deg.quality === 'm7') enrichedQuality = 'm6';
    if (!enrichedQuality || !isSupported(enrichedQuality)) continue;

    const degInfo = degreeOf(rootPc, harmonicContext.tonalContext);
    candidates.push(buildCandidate({
      anchorId: anchor.id,
      melodyEvent: track.events.find((e) => e.id === anchor.melodyEventId) || null,
      rootPc,
      quality: enrichedQuality,
      bassPc: null,
      tonalContext: harmonicContext.tonalContext,
      source: 'gospel-add6',
      locked: false,
      tonalRelation: {
        degree: degInfo ? degInfo.degree : deg.degree,
        romanNumeral: deg.roman,
        diatonic: true,
        borrowed: false,
        secondaryDominantTarget: null,
        approachType: 'gospel-add6',
      },
      policies,
    }));
  }
  return candidates;
}

/**
 * Technique sus2 : accord avec tierce remplacée par 2e.
 * Condition : la mélodie est à intervalle 2 (sus2). On utilise 9sus4 quand
 * disponible (9sus4 supporté), sinon on écarte.
 */
function buildSus2Candidates({ anchor, track, harmonicContext, policies }) {
  if (!harmonicContext.tonalContext || !harmonicContext.tonalContext.selected) return [];
  const melodyPc = melodyPcOf(anchor, track);
  if (melodyPc === null) return [];

  const tonic = normalizePc(harmonicContext.tonalContext.selected.tonicPitchClass);
  const mode = harmonicContext.tonalContext.selected.mode;
  const degrees = mode === 'minor' ? MINOR_DEGREES : MAJOR_DEGREES;

  const candidates = [];
  // On utilise 9sus4 comme qualité la plus proche de sus2 disponible.
  if (!isSupported('9sus4')) return candidates;

  for (const deg of degrees) {
    const rootPc = normalizePc(tonic + deg.rootOffset);
    const interval = normalizePc(melodyPc - rootPc);
    if (interval !== 2 && interval !== 14) continue;

    const degInfo = degreeOf(rootPc, harmonicContext.tonalContext);
    candidates.push(buildCandidate({
      anchorId: anchor.id,
      melodyEvent: track.events.find((e) => e.id === anchor.melodyEventId) || null,
      rootPc,
      quality: '9sus4',
      bassPc: null,
      tonalContext: harmonicContext.tonalContext,
      source: 'gospel-sus2',
      locked: false,
      tonalRelation: {
        degree: degInfo ? degInfo.degree : deg.degree,
        romanNumeral: deg.roman,
        diatonic: true,
        borrowed: false,
        secondaryDominantTarget: null,
        approachType: 'gospel-sus2',
      },
      policies,
    }));
  }
  return candidates;
}

// ---------------------------------------------------------------------------
// API publique
// ---------------------------------------------------------------------------

/**
 * Génère les candidats Gospel pour une ancre donnée.
 *
 * @param {{
 *   anchor: object,
 *   track: object,
 *   harmonicContext: object,
 *   policies?: object
 * }} input
 * @returns {object[]} candidats Gospel (ChordCandidate) — peut être vide.
 */
export function buildGospelCandidatesForAnchor(input) {
  const { anchor, track, harmonicContext, policies } = input;
  if (!anchor || !track || !harmonicContext) return [];

  const defaultPolicies = {
    sopranoPolicy: 'melody-must-be-top',
    harmonizationPolicy: 'automatic',
    preserveExactPitch: false,
  };
  const p = policies || defaultPolicies;

  let candidates = [];
  candidates = candidates.concat(
    buildAlt7b9Candidates({ anchor, track, harmonicContext, policies: p }),
  );
  candidates = candidates.concat(
    buildAlt7Sharp5Candidates({ anchor, track, harmonicContext, policies: p }),
  );
  candidates = candidates.concat(
    buildAdd9Candidates({ anchor, track, harmonicContext, policies: p }),
  );
  candidates = candidates.concat(
    buildAdd6Candidates({ anchor, track, harmonicContext, policies: p }),
  );
  candidates = candidates.concat(
    buildSus2Candidates({ anchor, track, harmonicContext, policies: p }),
  );

  // Filtre les candidats invalides (compatibilité mélodique, support de qualité).
  return candidates.filter((c) => c.validation && c.validation.valid);
}

/**
 * Retourne la liste documentée des techniques Gospel (pour l'affichage et la
 * traçabilité — critère 4 du score de validité).
 */
export function listGospelTechniques() {
  return GOSPEL_TECHNIQUES.slice();
}

/**
 * Identifie la technique Gospel qui a produit un candidat donné (via son
 * champ `source`). Retourne la technique ou null si le candidat n'est pas
 * issu d'une technique Gospel.
 *
 * @param {{ source: string }} candidate
 * @returns {GospelTechnique | null}
 */
export function identifyGospelTechnique(candidate) {
  if (!candidate || !candidate.source) return null;
  return GOSPEL_TECHNIQUES.find((t) => t.source === candidate.source) || null;
}