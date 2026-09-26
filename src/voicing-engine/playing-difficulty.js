// [Claude] — 2026-09-25 — Étoiles d'un voicing : la difficulté de JOUER les notes affichées.
//
// Narcisse : « les étoiles sont mal distribuées, elles ne sont pas vraiment
// représentatives du niveau de difficulté des voicings, surtout quand la main
// gauche est ajoutée dans un voicing qui n'avait que la main droite au départ ».
// Jusqu'ici l'étoile était une valeur fixe par technique (VoicingLab : close 1,
// rootless 2, drop 2 3, upper structure 4, cluster 5), posée avant la main gauche
// et jamais recalculée : un voicing à sept notes et deux mains gardait l'étoile
// de sa main droite seule.
//
// Désormais elle se calcule sur les notes AFFICHÉES (après la main gauche du
// style, les doublures et la note du dessus), en points :
//   - deux mains : +0,5 si la main gauche n'a qu'une note, +1 sinon ;
//   - main la plus chargée : 4 notes +0,5, 5 notes ou plus +1 ;
//   - deux mains et l'autre main a 3 notes ou plus : +0,5 ;
//   - 7 notes ou plus en tout : +0,5 ;
//   - écart d'une main : une 9e (13–14 demi-tons) +0,5, une 10e (15–16) +1,
//     au-delà +2 (la main saute ou arpège : stride) ;
//   - tensions naturelles (9, 11, 13) : +0,5 chacune, 1 au plus ;
//   - tensions altérées (b9, #9, #11, b13, b5, #5) : +0,5 chacune, 1 au plus.
// Étoiles = 1 + partie entière des points, de 1 à 5.
// Mêmes notes, mêmes étoiles : la technique n'entre pas en compte. Même forme
// dans les douze tonalités, mêmes étoiles : aucun critère de touches noires (le
// Mouvement 12 tons garde la même difficulté d'une tonalité à l'autre).
// Module pur : pas de DOM.

import { noteRoles } from '../pedagogie/note-roles.js';

const NATURAL_TENSIONS = new Set(['9', '11', '13']);
const ALTERED_TENSIONS = new Set(['b9', '#9', '#11', 'b13', 'b5', '#5']);

const span = (notes) => (notes.length > 1 ? Math.max(...notes) - Math.min(...notes) : 0);
const uniqueSorted = (notes) => [...new Set((notes || []).filter(Number.isFinite))].sort((a, b) => a - b);

/** Points d'écart d'une main (demi-tons entre sa note la plus grave et la plus aiguë). */
function stretchPoints(semitones) {
  if (semitones > 16) return 2;
  if (semitones >= 15) return 1;
  if (semitones >= 13) return 0.5;
  return 0;
}

/**
 * Difficulté de jeu d'un voicing.
 * @param {{leftHand?: number[], rightHand?: number[], chord?: string|{rootPc: number, quality: string, bassPc?: number|null}|null}} voicing
 *   `chord` : nom (« G13 ») ou accord analysé, pour compter les tensions ; sans
 *   accord, seules les mains comptent.
 * @returns {{stars: number, points: number, reasons: string[]}}
 */
export function playingDifficulty({ leftHand = [], rightHand = [], chord = null } = {}) {
  const lh = uniqueSorted(leftHand);
  const rh = uniqueSorted(rightHand);
  const reasons = [];
  let points = 0;
  const twoHands = lh.length > 0 && rh.length > 0;
  if (twoHands) {
    points += lh.length === 1 ? 0.5 : 1;
    reasons.push('2 mains');
  } else if (lh.length || rh.length) {
    reasons.push('1 main');
  }
  const total = uniqueSorted([...lh, ...rh]).length;
  if (total) reasons.push(`${total} note${total > 1 ? 's' : ''}`);
  const busiest = Math.max(lh.length, rh.length);
  if (busiest >= 5) points += 1;
  else if (busiest === 4) points += 0.5;
  if (twoHands && Math.min(lh.length, rh.length) >= 3) points += 0.5;
  if (total >= 7) points += 0.5;
  const widest = Math.max(span(lh), span(rh));
  const stretch = stretchPoints(widest);
  points += stretch;
  if (stretch >= 2) reasons.push('main qui saute');
  else if (stretch >= 1) reasons.push('écart de 10e');
  else if (stretch > 0) reasons.push('écart de 9e');

  if (chord) {
    const degrees = new Set(noteRoles(chord, [...lh, ...rh])
      // Quinte diminuée d'un m7b5 ou d'un dim, quinte augmentée d'un aug : la
      // structure de l'accord, pas une altération.
      .filter((r) => r.kind !== 'fifth')
      .map((r) => r.degree));
    const natural = [...degrees].filter((d) => NATURAL_TENSIONS.has(d));
    const altered = [...degrees].filter((d) => ALTERED_TENSIONS.has(d));
    points += Math.min(1, natural.length * 0.5) + Math.min(1, altered.length * 0.5);
    const named = [...natural, ...altered].sort((a, b) => Number(a.replace(/\D/g, '')) - Number(b.replace(/\D/g, '')));
    if (named.length) reasons.push(named.length === 1 ? `tension ${named[0]}` : `tensions ${named.join(' ')}`);
  }
  const stars = Math.min(5, Math.max(1, 1 + Math.floor(points + 1e-9)));
  return { stars, points, reasons };
}

/** Phrase courte pour l'infobulle des étoiles (« 2 mains · 7 notes · tensions 9 13 »). */
export function difficultyReasonText(result) {
  return (result?.reasons || []).join(' · ');
}
