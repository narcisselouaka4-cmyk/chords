// [OpenCode] — 2026-08-24 — EXP-030 Tâche C : voicings idiomatiques Gospel.
//
// Produit des voicings de piano idiomatiques du style Gospel pour un
// ChordCandidate donné, en complément des voicings génériques produits par
// voicing-path-finder.js. Chaque technique est une primitive explicite et
// traçable (critère 4 du score de validité).
//
// Techniques implémentées (V1) :
//   1. Drop 2 : accord de 4 notes en position serrée, la 2e note du haut
//      abaissée d'une octave. Typique des voicings gospel jazz.
//   2. Rootless : fondamentale omise, accord posé sur sa 3e ou 7e. Typique
//      quand la basse est jouée par la main gauche ou un autre instrument.
//   3. Cluster : toutes les notes serrées dans moins d'une octave. Couleur
//      gospel moderne, utilisé ponctuellement.
//
// Périmètre : ce module produit des voicings ALTERNATIFS, sans modifier
// voicing-path-finder.js ni la logique d'inclusion des tensions disponibles
// (le défaut découvert dans EXP-029, hors périmètre). Les voicings produits
// ne contiennent que les pitch classes canoniques de l'accord (pas de
// tensions ajoutées).

const C4 = 60;

function normalizePc(pc) {
  return ((pc % 12) + 12) % 12;
}

function pcToMidi(pc, minOctave = 3, maxOctave = 6) {
  const out = [];
  for (let o = minOctave; o <= maxOctave; o++) {
    const m = (o + 1) * 12 + pc;
    if (m >= 36 && m <= 84) out.push(m);
  }
  return out;
}

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
 * }} GospelVoicing
 */

/**
 * Construit un voicing Drop 2 pour un candidat de 4 notes.
 *
 * Drop 2 : prend un accord de 4 notes en position serrée (close voicing) dans
 * une octave donnée, abaisse la 2e note du haut d'une octave.
 *
 * @param {object} candidate - ChordCandidate avec pitchClasses et rootPitchClass
 * @param {number} octave - octave de base (défaut 4 → C4)
 * @returns {GospelVoicing | null}
 */
function buildDrop2Voicing(candidate, octave = 4) {
  const pcs = candidate.pitchClasses;
  if (!pcs || pcs.length < 4 || pcs.length > 5) return null;

  // Position serrée : trier les pitch classes par ordre croissant depuis la
  // fondamentale, dans une seule octave.
  const root = normalizePc(candidate.rootPitchClass);
  const sorted = [...pcs].sort((a, b) => a - b);
  // Réordonne depuis la fondamentale
  const rootIdx = sorted.indexOf(root);
  if (rootIdx < 0) return null;
  const ordered = [...sorted.slice(rootIdx), ...sorted.slice(0, rootIdx)];

  // Construit le close voicing à partir de l'octave donnée
  const close = [];
  let currentMidi = (octave + 1) * 12 + ordered[0];
  close.push(currentMidi);
  for (let i = 1; i < ordered.length; i++) {
    const next = (octave + 1) * 12 + ordered[i];
    if (next < close[i - 1]) {
      currentMidi = next + 12;
    } else {
      currentMidi = next;
    }
    close.push(currentMidi);
  }

  // Drop 2 : abaisse la 2e note du haut d'une octave
  if (close.length < 4) return null;
  const drop2 = [...close];
  drop2[drop2.length - 2] -= 12;
  drop2.sort((a, b) => a - b);

  // Vérifie les contraintes de jouabilité (registre, division mains)
  if (drop2[0] < 36 || drop2[drop2.length - 1] > 84) return null;
  const span = drop2[drop2.length - 1] - drop2[0];
  if (span > 24) return null; // trop étendu pour 2 mains

  // Division : basse à gauche, reste à droite
  const bassMidi = drop2[0];
  const leftHand = [bassMidi];
  const rightHand = drop2.slice(1);

  return Object.freeze({
    candidate,
    midiNotes: Object.freeze(drop2),
    leftHand: Object.freeze(leftHand),
    rightHand: Object.freeze(rightHand),
    bassMidiNote: bassMidi,
    bassPitchClass: bassMidi % 12,
    inversionInterval: (bassMidi % 12 - root + 12) % 12,
    isRootPosition: (bassMidi % 12) === root,
    spanSemitones: span,
    registerDeviation: Math.abs(bassMidi - 43) + Math.abs(drop2[drop2.length - 1] - 64),
    techniqueId: 'gospel-drop2',
    techniqueName: 'Drop 2',
  });
}

/**
 * Construit un voicing rootless pour un candidat de 4-5 notes.
 *
 * Rootless : omets la fondamentale, pose l'accord sur sa 3e ou 7e. Typique
 * quand la basse est jouée séparément.
 *
 * @param {object} candidate
 * @param {number} octave
 * @returns {GospelVoicing | null}
 */
function buildRootlessVoicing(candidate, octave = 4) {
  const pcs = candidate.pitchClasses;
  if (!pcs || pcs.length < 4) return null;

  const root = normalizePc(candidate.rootPitchClass);
  // Omets la fondamentale, garde les autres notes
  const nonRoot = pcs.filter((pc) => normalizePc(pc) !== root);
  if (nonRoot.length < 3) return null;

  // Pose l'accord sur la 3e (ou 7e si pas de 3e)
  const has3rd = nonRoot.some((pc) => {
    const interval = (normalizePc(pc) - root + 12) % 12;
    return interval === 3 || interval === 4;
  });
  const startInterval = has3rd ? 3 : 7; // 3e majeure/mineure ou 7e
  let startPc = nonRoot.find((pc) => {
    const interval = (normalizePc(pc) - root + 12) % 12;
    return interval === startInterval || (startInterval === 3 && (interval === 3 || interval === 4));
  });
  if (startPc === undefined) startPc = nonRoot[0];
  startPc = normalizePc(startPc);

  // Construit le voicing en position serrée à partir de startPc
  const ordered = [startPc];
  const remaining = nonRoot.filter((pc) => normalizePc(pc) !== startPc);
  // Trie par ordre chromatique depuis startPc
  remaining.sort((a, b) => {
    const da = (normalizePc(a) - startPc + 12) % 12;
    const db = (normalizePc(b) - startPc + 12) % 12;
    return da - db;
  });
  ordered.push(...remaining.map(normalizePc));

  const voicing = [];
  let currentMidi = (octave + 1) * 12 + ordered[0];
  voicing.push(currentMidi);
  for (let i = 1; i < ordered.length; i++) {
    const next = (octave + 1) * 12 + ordered[i];
    if (next < voicing[i - 1]) {
      currentMidi = next + 12;
    } else {
      currentMidi = next;
    }
    voicing.push(currentMidi);
  }
  voicing.sort((a, b) => a - b);

  if (voicing[0] < 40 || voicing[voicing.length - 1] > 84) return null;
  const span = voicing[voicing.length - 1] - voicing[0];
  if (span > 18) return null;

  const bassMidi = voicing[0];
  return Object.freeze({
    candidate,
    midiNotes: Object.freeze(voicing),
    leftHand: Object.freeze([bassMidi]),
    rightHand: Object.freeze(voicing.slice(1)),
    bassMidiNote: bassMidi,
    bassPitchClass: bassMidi % 12,
    inversionInterval: (bassMidi % 12 - root + 12) % 12,
    isRootPosition: false, // rootless n'est jamais en position fondamentale
    spanSemitones: span,
    registerDeviation: Math.abs(bassMidi - 52) + Math.abs(voicing[voicing.length - 1] - 64),
    techniqueId: 'gospel-rootless',
    techniqueName: 'Rootless',
  });
}

/**
 * Construit un voicing cluster pour un candidat de 3-4 notes.
 *
 * Cluster : toutes les notes serrées dans moins d'une octave (écart < 6 demi-tons
 * entre notes consécutives). Couleur gospel moderne.
 *
 * @param {object} candidate
 * @param {number} octave
 * @returns {GospelVoicing | null}
 */
function buildClusterVoicing(candidate, octave = 4) {
  const pcs = candidate.pitchClasses;
  if (!pcs || pcs.length < 3 || pcs.length > 4) return null;

  const root = normalizePc(candidate.rootPitchClass);
  const sorted = [...pcs].sort((a, b) => a - b);
  // Essaie de serrer dans une octave
  const voicing = [];
  let currentMidi = (octave + 1) * 12 + sorted[0];
  voicing.push(currentMidi);
  for (let i = 1; i < sorted.length; i++) {
    const next = (octave + 1) * 12 + sorted[i];
    if (next < voicing[i - 1] + 6) {
      currentMidi = next;
    } else {
      currentMidi = next; // on garde dans la même octave
    }
    voicing.push(currentMidi);
  }
  voicing.sort((a, b) => a - b);

  // Vérifie que le span est < 12 (une octave)
  const span = voicing[voicing.length - 1] - voicing[0];
  if (span >= 12) return null;
  if (voicing[0] < 48 || voicing[voicing.length - 1] > 84) return null;

  const bassMidi = voicing[0];
  return Object.freeze({
    candidate,
    midiNotes: Object.freeze(voicing),
    leftHand: Object.freeze([bassMidi]),
    rightHand: Object.freeze(voicing.slice(1)),
    bassMidiNote: bassMidi,
    bassPitchClass: bassMidi % 12,
    inversionInterval: (bassMidi % 12 - root + 12) % 12,
    isRootPosition: (bassMidi % 12) === root,
    spanSemitones: span,
    registerDeviation: Math.abs(bassMidi - 55) + Math.abs(voicing[voicing.length - 1] - 64),
    techniqueId: 'gospel-cluster',
    techniqueName: 'Cluster',
  });
}

/**
 * Génère tous les voicings idiomatiques Gospel pour un candidat donné.
 *
 * @param {object} candidate
 * @param {object} [options]
 * @param {number} [options.centerOctave] - octave centrale pour générer des
 *   voicings proches du registre cible (défaut 4). Génère à centerOctave et
 *   centerOctave±1.
 * @returns {GospelVoicing[]}
 */
export function generateGospelVoicings(candidate, options = {}) {
  if (!candidate || !candidate.pitchClasses) return [];
  const centerOctave = options.centerOctave !== undefined ? options.centerOctave : 4;
  const octaves = [centerOctave - 1, centerOctave, centerOctave + 1].filter((o) => o >= 2 && o <= 5);
  const voicings = [];
  for (const octave of octaves) {
    const drop2 = buildDrop2Voicing(candidate, octave);
    if (drop2) voicings.push(drop2);
    const rootless = buildRootlessVoicing(candidate, octave);
    if (rootless) voicings.push(rootless);
    const cluster = buildClusterVoicing(candidate, octave);
    if (cluster) voicings.push(cluster);
  }
  return voicings;
}

/**
 * Catalogue des techniques de voicing Gospel (traçabilité — critère 4).
 */
export const GOSPEL_VOICING_TECHNIQUES = Object.freeze([
  {
    id: 'gospel-drop2',
    name: 'Drop 2',
    description: 'Accord de 4 notes en position serrée, 2e note du haut abaissée d\'une octave. Voicing gospel jazz typique.',
  },
  {
    id: 'gospel-rootless',
    name: 'Rootless',
    description: 'Fondamentale omise, accord posé sur sa 3e ou 7e. Typique quand la basse est jouée séparément.',
  },
  {
    id: 'gospel-cluster',
    name: 'Cluster',
    description: 'Toutes les notes serrées dans moins d\'une octave. Couleur gospel moderne, utilisé ponctuellement.',
  },
]);

/**
 * Identifie la technique de voicing Gospel d'un voicing (via techniqueId).
 */
export function identifyGospelVoicingTechnique(voicing) {
  if (!voicing || !voicing.techniqueId) return null;
  return GOSPEL_VOICING_TECHNIQUES.find((t) => t.id === voicing.techniqueId) || null;
}