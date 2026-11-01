// Doublures d'octave optionnelles appliquées APRÈS le choix du voicing
// VoicingLab (onglet Exercice). Le voicing d'origine n'est jamais modifié :
// on ajoute seulement des notes déjà présentes, à l'octave, selon deux règles
// de pianiste réputées sûres :
//   - « bass »   : fondamentale doublée à l'octave à la main gauche (F2 + F3) ;
//   - « melody » : note du dessus doublée une octave plus bas à la main droite
//                  (principe des block chords / locked hands).
// Aucune doublure ne change l'ensemble des classes de hauteur ni la basse :
// la détection d'accord (detectChord) reste donc identique.

export const DOUBLING_MODES = ['none', 'bass', 'melody', 'full'];

export const DOUBLING_LABELS = {
  none: 'Aucune',
  bass: 'Octave de basse',
  melody: 'Mélodie doublée',
  full: 'Les deux',
};

// Limites de jouabilité / clarté.
const LOWEST_BASS = 28;        // E1 : en dessous, l'octave devient boueuse
const HIGHEST_BASS_OCTAVE = 55; // G3 : au-delà, la doublure n'est plus une basse
const MAX_HAND_SPAN = 12;      // une octave par main
const MAX_RH_NOTES = 5;

const hasSemitoneNeighbour = (notes, midi) => notes.some((n) => Math.abs(n - midi) === 1);

/**
 * Octave de la fondamentale à la main gauche, seulement si la basse est déjà
 * la fondamentale (on n'invente pas de basse sous un voicing rootless).
 * Retourne les nouvelles mains et la note ajoutée, ou null.
 */
function bassOctave(lh, rh, rootPc) {
  const all = [...lh, ...rh];
  if (all.length === 0) return null;
  const low = Math.min(...all);
  if (((low % 12) + 12) % 12 !== rootPc) return null;
  const below = low - 12;
  const belowOk = below >= LOWEST_BASS;

  // Voicing à une main droite seule (close) : la main gauche prend l'octave grave.
  if (lh.length === 0) return belowOk ? { lh: [below], rh, added: below } : null;

  // Octave en dessous, si la main gauche reste dans une octave.
  const lhHigh = Math.max(...lh);
  if (belowOk && lhHigh - below <= MAX_HAND_SPAN) return { lh: [below, ...lh], rh, added: below };

  // Voicing à une seule main (tout en LH) : la main gauche joue l'octave de
  // fondamentale, le reste passe à la main droite (s'il y tient).
  if (belowOk && rh.length === 0) {
    const rest = lh.filter((n) => n !== low);
    const restSpan = rest.length > 0 ? Math.max(...rest) - Math.min(...rest) : 0;
    if (restSpan <= MAX_HAND_SPAN && rest.length <= MAX_RH_NOTES) {
      return { lh: [below, low], rh: rest, added: below };
    }
  }

  // Sinon, octave au-dessus dans l'empan de la main, sans frottement de demi-ton.
  const above = low + 12;
  if (lh.includes(above) || above > HIGHEST_BASS_OCTAVE) return null;
  if (Math.max(lhHigh, above) - low > MAX_HAND_SPAN) return null;
  if (rh.length > 0 && above >= Math.min(...rh)) return null;
  if (hasSemitoneNeighbour(lh, above)) return null;
  return { lh: [...lh, above], rh, added: above };
}

/** Note du dessus doublée une octave plus bas, dans la main droite. */
function melodyOctave(lh, rh, rootPc) {
  if (rh.length === 0 || rh.length >= MAX_RH_NOTES) return null;
  const top = Math.max(...rh);
  const below = top - 12;
  if (rh.includes(below)) return null;
  if (lh.length > 0 && below <= Math.max(...lh)) return null;
  // Ne jamais passer sous la basse : l'accord détecté changerait (C6 → Am7).
  if (below <= Math.min(...lh, ...rh)) return null;
  // La b9 doublée est trop dure.
  if ((((top - rootPc) % 12) + 12) % 12 === 1) return null;
  // Pas de frottement de demi-ton avec les notes de la main droite.
  if (hasSemitoneNeighbour(rh, below)) return null;
  return below;
}

/**
 * Applique les doublures demandées à un voicing { leftHand, rightHand }.
 * @param {{leftHand: number[], rightHand: number[]}} voicing
 * @param {number} rootPc
 * @param {string} mode - 'none' | 'bass' | 'melody' | 'full'
 * @returns {{leftHand: number[], rightHand: number[], doubled: number[]}}
 */
export function applyDoublings(voicing, rootPc, mode = 'none') {
  let lh = [...(voicing?.leftHand || [])];
  let rh = [...(voicing?.rightHand || [])];
  const doubled = [];
  if (mode === 'bass' || mode === 'full') {
    const res = bassOctave(lh, rh, rootPc);
    if (res) { ({ lh, rh } = res); doubled.push(res.added); }
  }
  if (mode === 'melody' || mode === 'full') {
    const n = melodyOctave(lh, rh, rootPc);
    if (n != null) { rh.push(n); doubled.push(n); }
  }
  const asc = (a, b) => a - b;
  return { leftHand: lh.sort(asc), rightHand: rh.sort(asc), doubled: doubled.sort(asc) };
}
