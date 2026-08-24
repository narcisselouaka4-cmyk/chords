// [OpenCode] — 2026-08-25 — EXP-031 Tâche 1 : bibliothèque de techniques Jazz.
//
// Couche additive au-dessus du générateur de candidats canonique
// (src/melody/chord-candidate-generator.js), suivant exactement le patron
// posé par gospel-techniques.js (EXP-026). Chaque technique est traçable à une
// règle explicite de la bibliothèque (critère 4 du score de validité).
//
// Sous-ensemble V1 (EXP-031) :
//   J2 — Substitution tritonique : remplacer un V7 par la dominante à un
//        triton. La mélodie doit rester compatible (chord-tone ou tension
//        disponible sur la dominante substitute). La basse descend
//        chromatiquement d'un demi-ton vers la cible.
//
// Techniques explicitement différées (dette technique future, ne pas
// implémenter dans ce relais) : J1, J3, J4, J5, J8.
//
// ADR-003 non concerné (vocabulaires séparés, confirmé en EXP-030 Tâche B.0).
// voicing-path-finder.js non modifié (garde-fou).

import {
  buildCandidate,
  SUPPORTED_QUALITIES,
  MAJOR_DEGREES,
  MINOR_DEGREES,
} from './chord-candidate-generator.js';

function normalizePc(pc) {
  return ((pc % 12) + 12) % 12;
}

function isSupported(q) {
  return typeof q === 'string' && SUPPORTED_QUALITIES.has(q);
}

// ---------------------------------------------------------------------------
// Catalogue des techniques Jazz (traçabilité — critère 4)
// ---------------------------------------------------------------------------

/**
 * @typedef {{
 *   id: string,
 *   name: string,
 *   description: string,
 *   appliesTo: 'passage' | 'structural' | 'both',
 *   source: string
 * }} JazzTechnique
 */

export const JAZZ_TECHNIQUES = Object.freeze([
  {
    id: 'jazz-tritone-substitution',
    name: 'Substitution tritonique',
    description:
      "Remplace un V7 (ou une dominante secondaire) par la dominante située " +
      "à un triton (3 tons) de distance. Les deux dominantes partagent leur " +
      "triton guide-tones (3e et 7e). La basse descend chromatiquement d'un " +
      "demi-ton vers la cible (ex. G7 → Db7 résolvant sur C). La mélodie " +
      "doit rester un chord-tone ou une tension disponible de la " +
      "dominante substitute.",
    appliesTo: 'passage',
    source: 'jazz-tritone-sub',
  },
]);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function degreeOf(rootPc, tonalContext) {
  if (!tonalContext || !tonalContext.selected) return null;
  const tonic = normalizePc(tonalContext.selected.tonicPitchClass);
  const mode = tonalContext.selected.mode;
  const degrees = mode === 'minor' ? MINOR_DEGREES : MAJOR_DEGREES;
  const offset = normalizePc(rootPc - tonic);
  const found = degrees.find((d) => d.rootOffset === offset);
  return found ? { degree: found.degree, romanNumeral: found.roman } : null;
}

function melodyPcOf(anchor, track) {
  if (!anchor || !anchor.melodyEventId) return null;
  const ev = track.events.find((e) => e.id === anchor.melodyEventId);
  if (!ev) return null;
  return normalizePc(ev.pitchClass);
}

// Triton guide-tones des dominantes 7 : {3e, 7e} de la dominante originale
// = {7e, 3e} de la substitute. On vérifie que la mélodie est compatible avec
// la substitute : chord-tone (1, 3, 5, 7) ou tensions disponibles (9, b9, #9,
// 13, b13) — pas de #11 ni de tensions hors-champ.
// Pour V1, on accepte les intervalles 0,3,4,6,7,10 (1,3e,5e,7e) et 1,2,8,9,13
// (b9, 9, #9, #5/b13, 13) au-dessus de la racine substitute. Les autres
// intervalles (5=#11, 11=équiv #11 à l'octave) ne sont pas supportés par les
// qualités disponibles (7b9, 9, 13, 7#5).
const SUBSTITUTE_ALLOWED_INTERVALS = new Set([0, 3, 4, 6, 7, 10, 1, 2, 8, 9, 13]);

function melodyCompatibleWithSubstitute(melodyPc, subRoot) {
  const interval = normalizePc(melodyPc - subRoot);
  return SUBSTITUTE_ALLOWED_INTERVALS.has(interval);
}

// ---------------------------------------------------------------------------
// Technique J2 : substitution tritonique
// ---------------------------------------------------------------------------

/**
 * Construit les candidats de substitution tritonique pour une ancre.
 *
 * Règle : pour chaque dominante V7 (degré V diatonique ou dominante
 * secondaire) qui résout vers une cible, on propose la dominante à un triton
 * (rootPc + 6) comme candidat alternatif. La mélodie doit rester compatible
 * avec la substitute (chord-tone ou tension disponible). La substitute hérite
 * de la qualité 7, 9, 7b9, 7#5 selon la qualité de la dominante originale
 * (même couleur, même triton guide-tones).
 *
 * On ne déclenche pas sur la dernière ancre (pas de cible de résolution).
 * Le path-finder décide ; on ne verrouille jamais.
 */
function buildTritoneSubstitutionCandidates({ anchor, track, harmonicContext, policies }) {
  if (!harmonicContext.tonalContext || !harmonicContext.tonalContext.selected) return [];
  const anchors = harmonicContext.anchors;
  if (anchor.id === anchors[anchors.length - 1].id) return [];

  const melodyPc = melodyPcOf(anchor, track);
  if (melodyPc === null) return [];

  const tonic = normalizePc(harmonicContext.tonalContext.selected.tonicPitchClass);
  const mode = harmonicContext.tonalContext.selected.mode;
  const degrees = mode === 'minor' ? MINOR_DEGREES : MAJOR_DEGREES;

  const idx = anchors.findIndex((a) => a.id === anchor.id);
  // Cible = ancre suivante. On a besoin de la cible pour vérifier la résolution.
  const targetAnchor = anchors[idx + 1];

  const candidates = [];

  // 1. V7 diatonique : degré V (offset 7) → cible I (offset 0).
  //    Substitute : rootPc = V root + 6 (triton).
  for (const targetDeg of degrees) {
    const targetRoot = normalizePc(tonic + targetDeg.rootOffset);
    const dominantRoot = normalizePc(targetRoot + 7);
    const subRoot = normalizePc(dominantRoot + 6);

    // La mélodie doit être compatible avec la substitute.
    if (!melodyCompatibleWithSubstitute(melodyPc, subRoot)) continue;

    // Qualité de la substitute : on reprend la qualité de dominante canonique
    // (7 pour V diatonique). On propose aussi 7b9 et 9 si la mélodie le permet
    // (b9 = intervalle 1, 9 = intervalle 2 au-dessus de subRoot).
    const subInterval = normalizePc(melodyPc - subRoot);
    const qualities = [];
    if (isSupported('7')) qualities.push('7');
    if (subInterval === 1 && isSupported('7b9')) qualities.push('7b9');
    if (subInterval === 2 && isSupported('9')) qualities.push('9');
    if (subInterval === 8 && isSupported('7#5')) qualities.push('7#5');

    for (const quality of qualities) {
      const dominantDegreeInfo = degreeOf(dominantRoot, harmonicContext.tonalContext);
      candidates.push(buildCandidate({
        anchorId: anchor.id,
        melodyEvent: track.events.find((e) => e.id === anchor.melodyEventId) || null,
        rootPc: subRoot,
        quality,
        bassPc: null,
        tonalContext: harmonicContext.tonalContext,
        source: 'jazz-tritone-sub',
        locked: false,
        tonalRelation: {
          degree: dominantDegreeInfo ? dominantDegreeInfo.degree : null,
          romanNumeral: targetDeg.roman ? `subV7/${targetDeg.roman}` : 'subV7',
          diatonic: false,
          borrowed: false,
          secondaryDominantTarget: targetDeg.degree,
          approachType: 'jazz-tritone-sub',
          tritoneOf: dominantRoot,
          resolvesTo: targetRoot,
        },
        policies,
      }));
    }
  }

  return candidates;
}

// ---------------------------------------------------------------------------
// API publique
// ---------------------------------------------------------------------------

/**
 * Génère les candidats Jazz pour une ancre donnée.
 *
 * @param {{
 *   anchor: object,
 *   track: object,
 *   harmonicContext: object,
 *   policies?: object
 * }} input
 * @returns {object[]} candidats Jazz (ChordCandidate) — peut être vide.
 */
export function buildJazzCandidatesForAnchor(input) {
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
    buildTritoneSubstitutionCandidates({ anchor, track, harmonicContext, policies: p }),
  );

  return candidates.filter((c) => c.validation && c.validation.valid);
}

/**
 * Retourne la liste documentée des techniques Jazz.
 */
export function listJazzTechniques() {
  return JAZZ_TECHNIQUES.slice();
}

/**
 * Identifie la technique Jazz qui a produit un candidat (via son `source`).
 */
export function identifyJazzTechnique(candidate) {
  if (!candidate || !candidate.source) return null;
  return JAZZ_TECHNIQUES.find((t) => t.source === candidate.source) || null;
}