/**
 * Référentiel VoicingLab : voicings réels publiés par https://voicinglab.com,
 * extraits ton par ton (12 racines) le 2026-09-23.
 *
 * Données : src/data/voicinglab-reference.json, régénéré par
 *   node scripts/voicinglab/extract-voicinglab.mjs   (extraction live du site)
 *   node scripts/voicinglab/build-reference.mjs      (compactage + mains LH/RH)
 *
 * Règle : une famille n'est proposée pour un accord que si VoicingLab publie
 * au moins un voicing de ce style pour CETTE racine et CETTE qualité.
 * Combinaison absente = non confirmée = indisponible.
 *
 * Exception validée par Narcisse (2026-09-23) : 9 qualités absentes de
 * VoicingLab (m13, 11, maj11, 13#11, maj13#11, 7sus2, madd9, add11, 6add11)
 * sont servies par src/data/voicinglab-derived.json — voicings VoicingLab réels
 * du même ton dont UNE note est déplacée (scripts/voicinglab/build-derived.mjs).
 * Ils sont marqués derived = true et nomment leur accord VoicingLab d'origine.
 */

import reference from '../data/voicinglab-reference.json' with { type: 'json' };
import derived from '../data/voicinglab-derived.json' with { type: 'json' };

/** Familles historiquement filtrées même hors mode strict (mission 1). */
export const VOICINGLAB_GATED_FAMILIES = Object.freeze([
  'block', 'stride', 'open', 'spread', 'quartal', 'soWhat', 'upperStructure',
]);

/** Famille du moteur -> style VoicingLab. */
export const VOICINGLAB_STYLE_BY_FAMILY = Object.freeze({
  shell: 'shell',
  twoNoteShell: 'two_note_shell',
  rootlessA: 'rootless',
  rootlessB: 'rootless',
  close: 'close',
  fourWayClose: 'fourway_close',
  drop2: 'drop2',
  drop3: 'drop3',
  drop2Plus4: 'drop2_4',
  block: 'block',
  stride: 'stride',
  open: 'open',
  spread: 'spread',
  quartal: 'quartal',
  soWhat: 'so_what',
  upperStructure: 'upper_structure',
  // Pas de famille « cluster » dans le moteur : utilisé uniquement par l'Exercice.
  cluster: 'cluster',
});

// Orthographe des qualités dans l'app -> orthographe VoicingLab.
const QUALITY_TO_VOICINGLAB = { '6/9': '69', 'm6/9': 'm69', alt: '7alt' };

export function toVoicingLabQuality(quality) {
  return QUALITY_TO_VOICINGLAB[quality] ?? quality;
}

function chordEntry(rootPc, quality, { includeDerived = true } = {}) {
  const key = `${((rootPc % 12) + 12) % 12}|${toVoicingLabQuality(quality)}`;
  return reference.chords[key] || (includeDerived ? derived.chords[key] : null) || null;
}

/** Qualité servie par des voicings dérivés (absente de VoicingLab) ? */
export function isDerivedQuality(quality) {
  return derived.chords[`0|${toVoicingLabQuality(quality)}`] != null;
}

/**
 * Rootless A = commence sur la tierce, Rootless B = commence sur la septième
 * (définition VoicingLab). Utilisé pour répartir le style "rootless" en deux familles.
 */
function rootlessType(intervals) {
  return intervals.startsWith('7') ? 'B' : 'A';
}

/**
 * Qualité jouable dans l'Exercice (VoicingLab réel ou dérivé) ? Sans racine :
 * pour au moins un ton.
 * @param {string} quality
 * @param {number} [rootPc]
 */
export function isQualityOnVoicingLab(quality, rootPc) {
  if (rootPc != null) return chordEntry(rootPc, quality) != null;
  return Array.from({ length: 12 }, (_, pc) => pc).some((pc) => chordEntry(pc, quality) != null);
}

/**
 * Voicings VoicingLab (réels, puis dérivés si autorisés) pour une famille, une
 * racine et une qualité.
 * @param {number} rootPc
 * @param {string} quality
 * @param {string} familyId - id de famille du moteur (drop2, upperStructure…)
 * @param {{ includeDerived?: boolean }} [options] - false : VoicingLab réel uniquement
 * @returns {{lh: number[], rh: number[], names: string, intervals: string, difficulty: number, symbol: string, derived: boolean, derivedFrom: string|null, sourceVoicing: string|null}[]}
 */
export function getVoicingLabVoicings(rootPc, quality, familyId, options = {}) {
  const entry = chordEntry(rootPc, quality, options);
  const style = VOICINGLAB_STYLE_BY_FAMILY[familyId];
  if (!entry || !style) return [];
  let list = entry.styles[style] || [];
  if (familyId === 'rootlessA' || familyId === 'rootlessB') {
    const wanted = familyId === 'rootlessA' ? 'A' : 'B';
    list = list.filter((v) => rootlessType(v.i) === wanted);
  }
  return list.map((v) => ({
    lh: [...v.lh], rh: [...v.rh], names: v.n, intervals: v.i, difficulty: v.d, symbol: entry.s,
    derived: entry.derivedFrom != null,
    derivedFrom: entry.derivedFrom ?? null,
    sourceVoicing: v.from ?? null,
  }));
}

/**
 * La famille est-elle confirmée par VoicingLab pour cet accord ?
 * Voicings RÉELS uniquement : ce filtre sert aussi le catalogue du moteur
 * (onglet Analyse, gelé), qui ne doit pas changer avec les dérivés.
 * @param {string} familyId
 * @param {string} quality
 * @param {number} [rootPc] - sans racine : confirmée pour au moins un ton
 */
export function isFamilyConfirmedByVoicingLab(familyId, quality, rootPc) {
  const realOnly = { includeDerived: false };
  if (rootPc != null) return getVoicingLabVoicings(rootPc, quality, familyId, realOnly).length > 0;
  return Array.from({ length: 12 }, (_, pc) => pc)
    .some((pc) => getVoicingLabVoicings(pc, quality, familyId, realOnly).length > 0);
}
