// [OpenCode] — 2026-08-25 — EXP-031 Tâche 2 : voicings idiomatiques Neo Soul.
//
// Produit des voicings de piano idiomatiques du style Neo Soul pour un
// ChordCandidate donné, en complément des voicings génériques produits par
// voicing-path-finder.js. Chaque technique est une primitive explicite et
// traçable (critère 4 du score de validité), suivant le patron posé par
// gospel-voicings.js (EXP-030 Tâche C).
//
// Sous-ensemble V1 (EXP-031) :
//   N7 — Voicing quartal : empilement de quartes justes plutôt que de
//        tierces, posé au-dessus d'une note de basse.
//
// Garde-fou respecté à l'époque d'EXP-031 : voicing-path-finder.js non
// modifié. EXP-034 (2026-08-25) a levé ce garde-fou de façon explicite et
// délimitée : la règle d'inclusion des tensions disponibles vit dans
// voicing-tone-set.js et est partagée par ce module et le chemin canonique.

import { withMelodyTension, MAX_VOICING_TONES } from './voicing-tone-set.js';

function toneSetOf(candidate) {
  return withMelodyTension(candidate.pitchClasses, candidate, {
    maxTones: MAX_VOICING_TONES,
  });
}

function normalizePc(pc) {
  return ((pc % 12) + 12) % 12;
}

const C4 = 60;

/**
 * @typedef {{
 *   candidate: object,
 *   midiNotes: number[],
 *   leftHand: number[],
 *   rightHand: number[],
 *   bassMidiNote: number,
 *   bassPitchClass: number,
 *   inversionInterval: number,
 *   isRootPosition: boolean,
 *   spanSemitones: number,
 *   registerDeviation: number,
 *   techniqueId: string,
 *   techniqueName: string
 * }} NeoSoulVoicing
 */

/**
 * Construit un voicing quartal pour un candidat.
 *
 * Voicing quartal : empilement de quartes justes (5 demi-tons) plutôt que de
 * tierces. On part de la note la plus grave disponible (fondamentale ou
 * basse), puis on empile des quartes justes en utilisant les pitch classes de
 * l'accord (en complétant si nécessaire avec la quinte juste par défaut).
 *
 * Typique Neo Soul : posé au-dessus d'une basse (souvent la fondamentale à
 * l'octave grave, main gauche), la main droite joue l'empilement de quartes.
 *
 * @param {object} candidate
 * @param {number} octave - octave de base (défaut 4)
 * @returns {NeoSoulVoicing | null}
 */
function buildQuartalVoicing(candidate, octave = 4) {
  // [Claude] — 2026-08-25 — EXP-034 : même ensemble de tons résolu que les
  // autres techniques, pour que l'empilement de quartes puisse porter la
  // tension mélodique au lieu de l'ignorer.
  const { pitchClasses: pcs, addedTensions } = toneSetOf(candidate);
  if (!pcs || pcs.length < 3) return null;

  const root = normalizePc(candidate.rootPitchClass);
  const sorted = [...pcs].sort((a, b) => a - b);

  // Empilement de quartes justes : on part de la note la plus grave de l'accord
  // (souvent la fondamentale) et on empile des quartes en piochant dans les
  // pitch classes disponibles. Si une quarte juste n'est pas dans l'accord,
  // on l'ajoute quand même (couleur quartale — la 11e est typique Neo Soul).
  const baseMidi = (octave + 1) * 12 + sorted[0];
  const voicing = [baseMidi];
  let currentPc = sorted[0];
  let usedPcs = new Set([currentPc]);

  // Empile 3-4 quartes justes
  const targetCount = Math.min(4, pcs.length + 1);
  for (let i = 1; i < targetCount; i++) {
    let nextPc = normalizePc(currentPc + 5); // quarte juste
    // Si la quarte n'est pas dans l'accord, on la prend quand même (quartal color)
    // mais on privilégie les pcs de l'accord quand disponibles.
    const availablePcs = sorted.filter((pc) => !usedPcs.has(pc));
    const quarteInChord = availablePcs.find((pc) => normalizePc(pc - currentPc) === 5);
    if (quarteInChord !== undefined) nextPc = quarteInChord;
    usedPcs.add(nextPc);
    voicing.push(voicing[voicing.length - 1] + normalizePc(nextPc - currentPc));
    currentPc = nextPc;
  }

  voicing.sort((a, b) => a - b);

  // Contraintes de jouabilité
  if (voicing[0] < 36 || voicing[voicing.length - 1] > 84) return null;
  const span = voicing[voicing.length - 1] - voicing[0];
  if (span > 24) return null;

  // Division : basse à gauche (fondamentale à l'octave grave), reste à droite
  const bassMidi = (octave - 1 + 1) * 12 + root; // basse une octave plus grave
  if (bassMidi < 28) return null;
  const leftHand = [bassMidi];
  const rightHand = voicing;

  return Object.freeze({
    candidate,
    midiNotes: Object.freeze([bassMidi, ...voicing].sort((a, b) => a - b)),
    leftHand: Object.freeze(leftHand),
    rightHand: Object.freeze(rightHand),
    bassMidiNote: bassMidi,
    bassPitchClass: bassMidi % 12,
    inversionInterval: (bassMidi % 12 - root + 12) % 12,
    isRootPosition: (bassMidi % 12) === root,
    spanSemitones: span + 12, // inclut la basse
    registerDeviation: Math.abs(bassMidi - 36) + Math.abs(voicing[voicing.length - 1] - 64),
    addedTensions: Object.freeze(addedTensions.slice()),
    techniqueId: 'neo-soul-quartal',
    techniqueName: 'Quartal',
  });
}

/**
 * Génère tous les voicings idiomatiques Neo Soul pour un candidat.
 *
 * @param {object} candidate
 * @param {object} [options]
 * @param {number} [options.centerOctave]
 * @returns {NeoSoulVoicing[]}
 */
export function generateNeoSoulVoicings(candidate, options = {}) {
  if (!candidate || !candidate.pitchClasses) return [];
  const centerOctave = options.centerOctave !== undefined ? options.centerOctave : 4;
  const octaves = [centerOctave - 1, centerOctave, centerOctave + 1].filter((o) => o >= 2 && o <= 5);
  const voicings = [];
  for (const octave of octaves) {
    const quartal = buildQuartalVoicing(candidate, octave);
    if (quartal) voicings.push(quartal);
  }
  return voicings;
}

export const NEO_SOUL_VOICING_TECHNIQUES = Object.freeze([
  {
    id: 'neo-soul-quartal',
    name: 'Quartal',
    description:
      "Empilement de quartes justes plutôt que de tierces, posé au-dessus " +
      "d'une note de basse. Couleur Neo Soul typique.",
  },
]);

export function identifyNeoSoulVoicingTechnique(voicing) {
  if (!voicing || !voicing.techniqueId) return null;
  return NEO_SOUL_VOICING_TECHNIQUES.find((t) => t.id === voicing.techniqueId) || null;
}