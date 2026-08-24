// [OpenCode] — 2026-08-25 — EXP-031 Tâche 2 : bibliothèque de techniques Neo Soul.
//
// Couche additive au-dessus du générateur de candidats canonique, suivant
// exactement le patron posé par gospel-techniques.js (EXP-026). Chaque
// technique est traçable à une règle explicite (critère 4 du score).
//
// Sous-ensemble V1 (EXP-031) :
//   N1 — Dominante 7b9 comme pivot vers un mineur : dominante altérée (7b9)
//        de la tonique visée, résolvant vers un accord mineur étendu (m9/m11).
//        Schéma transposable : V7b9 → im9 (ex. Mi7b9 → Lam9).
//
// Techniques explicitement différées (dette technique future) : N2, N3, N4,
// N5, N6, N8.
//
// ADR-003 non concerné. voicing-path-finder.js non modifié.

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
// Catalogue des techniques Neo Soul (traçabilité — critère 4)
// ---------------------------------------------------------------------------

/**
 * @typedef {{
 *   id: string,
 *   name: string,
 *   description: string,
 *   appliesTo: 'passage' | 'structural' | 'both',
 *   source: string
 * }} NeoSoulTechnique
 */

export const NEO_SOUL_TECHNIQUES = Object.freeze([
  {
    id: 'neo-soul-7b9-to-minor',
    name: 'Dominante 7b9 vers mineur',
    description:
      "Dominante altérée 7b9 de la tonique visée, résolvant vers un accord " +
      "mineur étendu (m9/m11). Schéma transposable Neo Soul : V7b9 → im9. " +
      "La mélodie doit être un chord-tone ou une tension disponible de la " +
      "dominante altérée (b9, #9, 13 notamment).",
    appliesTo: 'passage',
    source: 'neo-soul-7b9-to-minor',
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

// Intervalle de la mélodie au-dessus de la dominante 7b9 qui sont des
// chord-tones ou tensions disponibles de la qualité 7b9 :
// 0 (1), 3 (b3/3e m), 4 (3e M), 6 (5e/Triton), 10 (7e), 1 (b9), 2 (9), 3 (#9=b3).
// On accepte : 0, 1, 2, 3, 4, 6, 10, 13 (9 à l'octave).
const B9_ALLOWED_MELODY_INTERVALS = new Set([0, 1, 2, 3, 4, 6, 10, 13]);

function melodyCompatibleWith7b9(melodyPc, dominantRoot) {
  const interval = normalizePc(melodyPc - dominantRoot);
  return B9_ALLOWED_MELODY_INTERVALS.has(interval);
}

// ---------------------------------------------------------------------------
// Technique N1 : Dominante 7b9 → mineur
// ---------------------------------------------------------------------------

/**
 * Construit les candidats 7b9 → mineur pour une ancre.
 *
 * Règle Neo Soul V1 : pour chaque degré mineur (i, iv en mode mineur ;
 * ii, iii, vi en mode majeur) qui peut être la cible d'une dominante
 * secondaire 7b9, on propose la dominante 7b9 (racine = cible + 7) comme
 * accord de passage. La mélodie doit être un chord-tone ou une tension
 * disponible de la dominante 7b9.
 *
 * On ne déclenche pas sur la dernière ancre (pas de cible). Le path-finder
 * décide ; on ne verrouille jamais.
 *
 * Différence avec la technique Gospel V7b9 (gospel-passage-7b9) : le style
 * Neo Soul réserve cette technique aux résolutions vers un mineur étendu
 * (m9/m11), tandis que Gospel l'applique à toutes les cibles diatoniques.
 * Ici on filtre les cibles mineures.
 */
function build7b9ToMinorCandidates({ anchor, track, harmonicContext, policies }) {
  if (!harmonicContext.tonalContext || !harmonicContext.tonalContext.selected) return [];
  const anchors = harmonicContext.anchors;
  if (anchor.id === anchors[anchors.length - 1].id) return [];

  const melodyPc = melodyPcOf(anchor, track);
  if (melodyPc === null) return [];
  if (!isSupported('7b9')) return [];

  const tonic = normalizePc(harmonicContext.tonalContext.selected.tonicPitchClass);
  const mode = harmonicContext.tonalContext.selected.mode;
  const degrees = mode === 'minor' ? MINOR_DEGREES : MAJOR_DEGREES;

  const idx = anchors.findIndex((a) => a.id === anchor.id);
  const targetAnchor = anchors[idx + 1];

  const candidates = [];

  // On cible uniquement les degrés mineurs (qualité m7 ou m7b5).
  // NB : 'maj7'.startsWith('m') === true, donc on doit exclure explicitement
  // les qualités majeures. On accepte m7, m7b5, m6, m9 — tout ce qui commence
  // par 'm' MAIS pas 'maj'.
  function isMinorQuality(q) {
    return q.startsWith('m') && !q.startsWith('maj');
  }
  for (const targetDeg of degrees) {
    if (!isMinorQuality(targetDeg.quality)) continue;
    const targetRoot = normalizePc(tonic + targetDeg.rootOffset);
    const dominantRoot = normalizePc(targetRoot + 7);

    if (!melodyCompatibleWith7b9(melodyPc, dominantRoot)) continue;

    const dominantDegreeInfo = degreeOf(dominantRoot, harmonicContext.tonalContext);
    candidates.push(buildCandidate({
      anchorId: anchor.id,
      melodyEvent: track.events.find((e) => e.id === anchor.melodyEventId) || null,
      rootPc: dominantRoot,
      quality: '7b9',
      bassPc: null,
      tonalContext: harmonicContext.tonalContext,
      source: 'neo-soul-7b9-to-minor',
      locked: false,
      tonalRelation: {
        degree: dominantDegreeInfo ? dominantDegreeInfo.degree : null,
        romanNumeral: targetDeg.roman ? `V7b9/${targetDeg.roman}` : 'V7b9',
        diatonic: false,
        borrowed: false,
        secondaryDominantTarget: targetDeg.degree,
        approachType: 'neo-soul-7b9-to-minor',
        resolvesTo: targetRoot,
      },
      policies,
    }));
  }

  return candidates;
}

// ---------------------------------------------------------------------------
// API publique
// ---------------------------------------------------------------------------

export function buildNeoSoulCandidatesForAnchor(input) {
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
    build7b9ToMinorCandidates({ anchor, track, harmonicContext, policies: p }),
  );

  return candidates.filter((c) => c.validation && c.validation.valid);
}

export function listNeoSoulTechniques() {
  return NEO_SOUL_TECHNIQUES.slice();
}

export function identifyNeoSoulTechnique(candidate) {
  if (!candidate || !candidate.source) return null;
  return NEO_SOUL_TECHNIQUES.find((t) => t.source === candidate.source) || null;
}