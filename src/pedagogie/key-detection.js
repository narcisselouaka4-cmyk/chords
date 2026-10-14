// [Claude] — 2026-09-05 — Pédagogie IA : lecture des touches allumées.
//
// Une fois la géométrie du clavier connue (keyboard-geometry.js), lire ce qui
// est joué revient à regarder la couleur de chaque touche. Les rendus de type
// Synthesia teintent les touches jouées, avec une couleur par main — bleu pour
// la gauche, vert pour la droite dans le fichier de référence.
//
// On ne code en dur AUCUNE couleur particulière : une touche est considérée
// comme allumée dès qu'elle est nettement colorée, c'est-à-dire quand ses trois
// canaux ne sont plus quasi égaux. Une touche blanche au repos est grise
// (244,244,244), une noire au repos est grise sombre (20,20,20) : dans les deux
// cas la saturation est proche de zéro. Les mains sont ensuite distinguées par
// la teinte dominante, telle qu'elle est observée, et non par une liste de
// couleurs attendues.
//
// Module pur : pas de DOM, pas de fichier, pas d'IPC.

import { getPixel, sampleMedian } from './frame.js';

export const DEFAULT_DETECTION_OPTIONS = {
  // Écart minimal entre canal max et canal min pour parler de couleur.
  minSaturation: 30,
  // Marge d'un canal sur le rouge pour trancher la teinte.
  hueMargin: 20,
  // Rayon d'échantillonnage : on décide sur une petite médiane, pas un pixel.
  sampleRadius: 1,
  // Fraction de la hauteur de touche blanche où échantillonner, sous les noires.
  whiteSampleRatio: 0.78,
  // [Claude] — 2026-10-14 — Une touche allumée est CLAIRE : une noire verdâtre à 41/255 n'est qu'une
  // noire éclairée de côté (« Next Level Worship » : un faux Fa♯). En dessous, on ne décide pas.
  minValue: 80,
  otherMinValue: 150,
  // Une peau (main du prof devant le clavier) n'est pas une touche allumée : teinte rouge-orangé,
  // saturation moyenne. Un vrai orange de rendu Synthesia est bien plus vif et plus clair.
  skinMaxSaturation: 0.75,
  skinMinValueVivid: 170,
  // [Claude] — 2026-10-15 — Au-delà de cette saturation, la couleur est un rendu, jamais de la peau
  // ni une touche ombrée. Mesuré sur deux vidéos : la peau des mains du prof (« Next Level Worship »)
  // plafonne à 0,60 de saturation, tandis qu'une NOIRE allumée en rouge (« Amazing Grace »,
  // rgb(119,17,15)) tient 0,87 à 0,93. Le seuil est posé dans l'intervalle vide entre les deux ;
  // de 0,70 à 0,80 la mesure donne le même résultat.
  vividSaturation: 0.75,
};

/**
 * Couleur de peau : rouge dominant, vert entre rouge et bleu (teinte 0–50°), peu saturée ou sombre.
 * Les hues de rendu (vert, bleu, magenta, jaune vif, orange vif) n'en sont pas.
 */
function isSkinTone(r, g, b, opts) {
  if (!(r >= g && g >= b && r > 0)) return false;
  const max = r;
  const min = b;
  const sat = (max - min) / max;
  const hue = (60 * (g - b)) / (max - min);          // 0° rouge … 60° jaune
  if (hue > 50) return false;
  // [Claude] — 2026-10-15 — Une saturation franche n'est jamais de la peau. Sans cette sortie, le
  // « ou max < skinMinValueVivid » écartait TOUTE touche rougeâtre sombre, donc toutes les noires
  // allumées en rouge — et la perte de la basse ruinait ensuite la segmentation.
  if (sat >= opts.vividSaturation) return false;
  return sat < opts.skinMaxSaturation || max < opts.skinMinValueVivid;
}

/**
 * Classe une couleur en « éteinte » ou en teinte de main.
 *
 * @param {number} r
 * @param {number} g
 * @param {number} b
 * @param {object} [options]
 * @returns {'blue'|'green'|'other'|null} null = touche éteinte
 */
export function classifyTint(r, g, b, options = {}) {
  const opts = { ...DEFAULT_DETECTION_OPTIONS, ...options };
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max - min < opts.minSaturation) return null;
  if (max < opts.minValue) return null;
  if (isSkinTone(r, g, b, opts)) return null;
  if (b > r + opts.hueMargin && b >= g) return 'blue';
  if (g > r + opts.hueMargin && g > b + opts.hueMargin) return 'green';
  // Une teinte « autre » (ni bleu ni vert) doit être franche et claire : le bord ombré d'une main ou
  // d'un objet donne du brun olive sombre, pas une touche allumée.
  if (max >= opts.otherMinValue) return 'other';
  // [Claude] — 2026-10-15 — … mais une NOIRE allumée reste sombre par nature : le rouge d'une noire
  // vaut rgb(119,17,15), sous les 150 attendus d'une blanche allumée. Une saturation franche suffit
  // alors à trancher : le brun olive d'un bord ombré ne monte pas à 0,75.
  return (max - min) / max >= opts.vividSaturation ? 'other' : null;
}

/**
 * [Claude] — 2026-10-14 — Le clavier est-il VISIBLE sur cette image ? (0 à 1)
 *
 * La géométrie est mesurée une fois, sur les images de sondage, puis appliquée à toutes les images
 * de la vidéo. Quand la vidéo quitte le clavier (titre, professeur seul, panneau publicitaire, écran
 * de fin), lire « les touches allumées » aux mêmes endroits fabrique des notes fantômes
 * (« Next Level Worship » : Si♭1 Si1 Do2 sur le panneau d'intro). On compare donc l'image au motif
 * attendu : noires sombres (ou colorées si allumées), blanches claires (ou colorées), sur la rangée
 * des noires, et blanches claires en bas des touches. Des mains devant le clavier ne font guère
 * baisser le score (0,93–0,98 mesuré) ; un autre décor tombe à 0,2–0,3.
 *
 * @returns {number}
 */
export function keyboardPresence(frame, geometry) {
  const lum = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b;
  const sat = (r, g, b) => Math.max(r, g, b) - Math.min(r, g, b);
  let plain = 0;
  let colored = 0;
  let n = 0;
  const px = (x, y) => getPixel(frame, Math.max(0, Math.min(frame.width - 1, Math.round(x))), y);
  // Une couleur vive compte pour une touche allumée, mais une touche allumée est l'exception :
  // un décor entièrement coloré (scène verte, panneau) ne doit pas passer pour un clavier.
  const tally = (r, g, b, expectDark, satMin) => {
    n++;
    const l = lum(r, g, b);
    if (expectDark ? l < 100 : l > 140) plain++;
    else if (sat(r, g, b) >= satMin) colored++;
  };
  for (const k of geometry.blackKeys) {
    const [r, g, b] = px(k.center, geometry.blackRow);
    tally(r, g, b, true, 60);
  }
  for (const k of geometry.whiteKeys) {
    const [r, g, b] = px(k.center, geometry.blackRow);
    tally(r, g, b, false, 60);
    if (Number.isFinite(geometry.sampleRow)) {
      const [r2, g2, b2] = px(k.center, geometry.sampleRow);
      tally(r2, g2, b2, false, 40);
    }
  }
  return n ? (plain + Math.min(colored, n * 0.25)) / n : 0;
}

/**
 * Lit les touches allumées d'une image, pour une géométrie donnée.
 *
 * Les touches noires sont lues en premier et « masquent » la blanche voisine :
 * sur un rendu de piano, une noire allumée déborde souvent sur le haut de la
 * blanche qui la jouxte, ce qui produirait une fausse blanche allumée. On
 * échantillonne donc les blanches TRÈS bas (sous les noires), et on écarte en
 * plus une blanche dont la seule couleur viendrait d'une noire adjacente.
 *
 * @param {import('./frame.js').PixelFrame} frame
 * @param {object} geometry - résultat de detectKeyboardGeometry
 * @param {object} [options]
 * @returns {{ midi: number, hand: string, kind: 'white'|'black' }[]} trié par hauteur
 */
export function readLitKeys(frame, geometry, options = {}) {
  const opts = { ...DEFAULT_DETECTION_OPTIONS, ...options };
  const lit = [];

  // Clavier absent de cette image (voir keyboardPresence) : rien n'est allumé, rien n'est lu.
  if (Number.isFinite(geometry.presenceMin) && keyboardPresence(frame, geometry) < geometry.presenceMin) return lit;

  // Rangée d'échantillonnage des blanches : bien sous les touches noires.
  // `sampleRow` est calculé par buildGeometry() à partir de mesures communes
  // aux deux stratégies (blackRow + bottom). En repli, on garde l'ancienne
  // formule strikeY-based pour la compatibilité avec d'éventuelles géométries
  // externes, mais les stratégies du dépôt fournissent toujours sampleRow.
  let whiteY = geometry.sampleRow;
  if (!Number.isFinite(whiteY)) {
    const top = Number.isFinite(geometry.strikeY) ? geometry.strikeY : geometry.blackRow;
    whiteY = Math.round(top + (geometry.bottom - top) * opts.whiteSampleRatio);
  }

  for (const key of geometry.blackKeys) {
    const [r, g, b] = sampleMedian(frame, key.center, geometry.blackRow, opts.sampleRadius);
    const hand = classifyTint(r, g, b, opts);
    if (hand) lit.push({ midi: key.midi, hand, kind: 'black' });
  }
  const litBlack = new Set(lit.map((k) => k.midi));

  for (const key of geometry.whiteKeys) {
    const [r, g, b] = sampleMedian(frame, key.center, whiteY, opts.sampleRadius);
    let hand = classifyTint(r, g, b, opts);
    // [Claude] — 2026-10-14 — Certains rendus (« Next Level Worship ») n'allument une blanche que
    // sur sa partie haute, entre les noires, et laissent le bas blanc ; les mains du prof couvrent
    // en plus le bas des touches. On lit donc aussi le centre de la blanche à hauteur des noires,
    // mais seulement pour une couleur franche (vert, bleu), jamais pour une teinte « autre ».
    // Une noire allumée voisine déborde sur le haut de cette blanche (sa barre fait presque une
    // blanche de large) : la couleur vue en haut serait la sienne (faux Si à côté d'un Si♭).
    const blackNeighbourLit = litBlack.has(key.midi - 1) || litBlack.has(key.midi + 1);
    if (!hand && !blackNeighbourLit && Number.isFinite(geometry.blackRow) && geometry.strategy === 'keyboardBand') {
      const [r2, g2, b2] = sampleMedian(frame, key.center, geometry.blackRow, opts.sampleRadius);
      const top = classifyTint(r2, g2, b2, opts);
      if (top === 'green' || top === 'blue') hand = top;
    }
    if (hand) lit.push({ midi: key.midi, hand, kind: 'white' });
  }

  return lit.sort((a, b) => a.midi - b.midi);
}

/**
 * Réduit une lecture de touches à la liste de numéros MIDI, prête pour
 * `detectChord()`.
 *
 * @param {{midi: number}[]} litKeys
 * @returns {number[]}
 */
export function toMidiList(litKeys) {
  return Array.from(new Set((litKeys || []).map((k) => k.midi))).sort((a, b) => a - b);
}

/**
 * Sépare une lecture par main. Le nom des mains n'est pas déduit de la couleur
 * elle-même — rien ne garantit que le bleu soit la gauche dans tous les rendus —
 * mais du registre : la main la plus grave est appelée gauche. C'est une
 * convention d'affichage, signalée comme telle.
 *
 * @param {{midi: number, hand: string}[]} litKeys
 * @returns {{ left: number[], right: number[], byTint: Record<string, number[]> }}
 */
export function splitHands(litKeys) {
  const byTint = {};
  for (const k of litKeys || []) {
    (byTint[k.hand] ||= []).push(k.midi);
  }
  const tints = Object.keys(byTint);
  if (tints.length === 0) return { left: [], right: [], byTint };
  if (tints.length === 1) {
    return { left: byTint[tints[0]].slice(), right: [], byTint };
  }
  // Deux teintes ou plus : celle dont la note la plus grave est la plus basse
  // devient la main gauche.
  const lowest = (t) => Math.min(...byTint[t]);
  const ordered = [...tints].sort((a, b) => lowest(a) - lowest(b));
  const left = byTint[ordered[0]].slice().sort((a, b) => a - b);
  const right = ordered.slice(1).flatMap((t) => byTint[t]).sort((a, b) => a - b);
  return { left, right, byTint };
}
