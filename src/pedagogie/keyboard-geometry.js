// [Claude] — 2026-09-05 — Pédagogie IA : géométrie du clavier graphique.
//
// Un tutoriel de type Synthesia (« Format B » de la taxonomie) affiche un
// clavier de piano dessiné en bas de l'image, sur lequel les touches jouées
// s'allument. Ce module retrouve ce clavier dans une image et en déduit, pour
// chaque touche, la zone de pixels à observer et le numéro MIDI correspondant.
//
// POURQUOI LA GÉOMÉTRIE PLUTÔT QUE L'OCR DES ÉTIQUETTES.
// Le plan initial était de lire au caractère les étiquettes portées par les
// barres qui tombent (« E », « Db »…), puis de décider arbitrairement d'une
// octave puisque ces étiquettes n'en portent pas. La position d'une touche sur
// le clavier donne directement la note, octave comprise : la question de
// l'octave était un artefact de l'approche OCR, pas un vrai problème. Lire une
// couleur à une position connue est aussi plus sûr qu'une reconnaissance de
// caractères sur des glyphes de 8 pixels, et n'ajoute aucune dépendance.
//
// RIEN N'EST CODÉ EN DUR POUR UNE VIDÉO PARTICULIÈRE. Les repères (ligne de
// frappe, bandes, largeur de touche, ancrage des hauteurs) sont redécouverts
// image par image. Le motif des touches noires — groupes alternés de 2 et de 3 —
// suffit à identifier les classes de hauteur sans ambiguïté et sans étiquette.
//
// Module pur : pas de DOM, pas de fichier, pas d'IPC.

import { getLuma, getPixel } from './frame.js';

/** Demi-tons des blanches dans une octave, à partir de do. */
const WHITE_SEMITONES = [0, 2, 4, 5, 7, 9, 11];
/** Demi-tons des noires dans une octave, à partir de do. */
const BLACK_SEMITONES = [1, 3, 6, 8, 10];

export const DEFAULT_GEOMETRY_OPTIONS = {
  // Une rangée est « la ligne de frappe » si elle est massivement rouge saturé.
  strikeMinRatio: 0.35,
  // Seuils de séparation blanc / noir sur le clavier.
  whiteLuma: 170,
  blackLuma: 100,
  // Une touche noire fait au moins ça de large : en dessous, c'est un liseré.
  minBlackWidth: 3,
  // Tolérance relative pour juger que deux écarts entre noires sont « du même
  // ordre » (à l'intérieur d'un groupe) ou non (entre deux groupes).
  groupGapRatio: 1.22,
  minWhiteKeys: 12,
  // [Claude] — 2026-09-25 — Stratégie « bande » : une rangée compte si elle
  // croise au moins ce nombre de noires au motif 2/3 valide, et la bande des
  // noires doit faire au moins cette hauteur (un clavier dessiné, pas un trait).
  minBandBlackKeys: 8,
  minBandHeight: 6,
};

/**
 * Trouve la rangée de la ligne de frappe rouge, qui sépare les barres qui
 * tombent du clavier lui-même.
 *
 * @param {import('./frame.js').PixelFrame} frame
 * @param {object} [options]
 * @returns {{ y: number, ratio: number } | null}
 */
export function findStrikeLine(frame, options = {}) {
  const opts = { ...DEFAULT_GEOMETRY_OPTIONS, ...options };
  let bestY = -1;
  let bestCount = 0;
  // On ne cherche que dans la moitié basse : la ligne de frappe est, par
  // construction du format, au-dessus du clavier et donc en bas de l'image.
  for (let y = Math.floor(frame.height * 0.35); y < frame.height; y++) {
    let count = 0;
    for (let x = 0; x < frame.width; x++) {
      const [r, g, b] = getPixel(frame, x, y);
      if (r > 110 && r > g * 1.7 && r > b * 1.7) count++;
    }
    if (count > bestCount) { bestCount = count; bestY = y; }
  }
  const ratio = bestCount / frame.width;
  if (bestY < 0 || ratio < opts.strikeMinRatio) return null;
  return { y: bestY, ratio };
}

/**
 * Détermine les deux rangées d'observation du clavier : celle où seules les
 * touches blanches sont visibles (sous les noires) et celle qui traverse les
 * noires.
 *
 * Méthode : sous la ligne de frappe, la luminance moyenne d'une rangée est
 * intermédiaire tant qu'elle croise des touches noires, puis devient franchement
 * claire quand il n'y a plus que du blanc, puis s'effondre sous le clavier.
 *
 * @param {import('./frame.js').PixelFrame} frame
 * @param {number} topY
 * @param {object} [options]
 * @returns {{ whiteRow: number, blackRow: number, bottom: number } | null}
 */
export function findKeyboardRows(frame, topY, options = {}) {
  const opts = { ...DEFAULT_GEOMETRY_OPTIONS, ...options };
  const rowMean = (y) => {
    let sum = 0;
    for (let x = 0; x < frame.width; x++) sum += getLuma(frame, x, y);
    return sum / frame.width;
  };

  const start = topY + 2;
  if (start >= frame.height) return null;

  // Bas du clavier : première rangée nettement sombre après une zone claire.
  let bottom = frame.height;
  let sawBright = false;
  for (let y = start; y < frame.height; y++) {
    const m = rowMean(y);
    if (m > opts.whiteLuma) sawBright = true;
    else if (sawBright && m < 60) { bottom = y; break; }
  }

  // Rangée « blanches seules » : la plus claire de la moitié basse du clavier.
  let whiteRow = -1;
  let whiteBest = -1;
  for (let y = Math.floor(start + (bottom - start) * 0.45); y < bottom; y++) {
    const m = rowMean(y);
    if (m > whiteBest) { whiteBest = m; whiteRow = y; }
  }
  if (whiteRow < 0 || whiteBest < opts.whiteLuma) return null;

  // Rangée des noires : choisie plus bas, par essai (voir pickBlackRow). Le
  // haut du clavier porte un liseré sombre continu qui se confondrait avec les
  // touches ; on ne peut donc pas prendre « la rangée la plus sombre ».
  return { whiteRow, blackRow: null, bottom, blackSearch: [start + 4, start + Math.max(6, (bottom - start) * 0.6)] };
}

/**
 * Repère les touches noires sur une rangée donnée.
 *
 * @param {import('./frame.js').PixelFrame} frame
 * @param {number} row
 * @param {object} [options]
 * @returns {{ center: number, left: number, right: number }[]}
 */
export function findBlackKeys(frame, row, options = {}) {
  const opts = { ...DEFAULT_GEOMETRY_OPTIONS, ...options };
  const keys = [];
  let start = null;
  for (let x = 0; x <= frame.width; x++) {
    const dark = x < frame.width && getLuma(frame, x, row) < opts.blackLuma;
    if (dark && start === null) start = x;
    else if (!dark && start !== null) {
      const width = x - start;
      if (width >= opts.minBlackWidth) {
        keys.push({ center: (start + x - 1) / 2, left: start, right: x - 1 });
      }
      start = null;
    }
  }
  return keys;
}

/**
 * Choisit la rangée où lire les touches noires.
 *
 * On ne peut pas simplement prendre « la rangée la plus sombre » : le haut du
 * clavier porte un liseré continu qui serait détecté comme une seule touche
 * géante. On essaie donc plusieurs rangées et on retient celle qui produit le
 * plus de touches noires AVEC un motif 2/3 valide — c'est-à-dire la seule
 * lecture qui soit cohérente avec un clavier de piano.
 *
 * @param {import('./frame.js').PixelFrame} frame
 * @param {[number, number]} range
 * @param {object} [options]
 * @returns {{ row: number, keys: object[], grouping: object } | null}
 */
export function pickBlackRow(frame, range, options = {}) {
  const [from, to] = range;
  let best = null;
  for (let y = Math.floor(from); y < Math.floor(to); y++) {
    const keys = findBlackKeys(frame, y, options);
    if (keys.length < 5) continue;
    const grouping = groupBlackKeys(keys, options);
    if (!grouping.valid) continue;
    if (!best || keys.length > best.keys.length) best = { row: y, keys, grouping };
  }
  return best;
}

/**
 * Repère les séparations entre touches blanches, puis en déduit une grille
 * régulière.
 *
 * Les séparations sont des traits d'un pixel que la compression vidéo efface
 * par endroits : on en détecte typiquement les trois quarts. Plutôt que de
 * travailler avec des trous, on ajuste une grille uniforme — le pas est estimé
 * en ramenant chaque écart au nombre entier de touches qu'il couvre.
 *
 * @param {import('./frame.js').PixelFrame} frame
 * @param {number} row
 * @param {object} [options]
 * @returns {{ width: number, origin: number, separators: number[] } | null}
 */
export function findWhiteGrid(frame, row, options = {}) {
  const opts = { ...DEFAULT_GEOMETRY_OPTIONS, ...options };
  const runs = [];
  let start = null;
  // Seuil des traits : fixe par défaut ; la stratégie « bande » le règle sur la
  // luminosité réelle des blanches (traits gris clair sur certains rendus).
  const separatorLuma = Number.isFinite(opts.separatorLuma) ? opts.separatorLuma : opts.whiteLuma - 40;
  for (let x = 0; x <= frame.width; x++) {
    const dark = x < frame.width && getLuma(frame, x, row) < separatorLuma;
    if (dark && start === null) start = x;
    else if (!dark && start !== null) { runs.push({ center: (start + x - 1) / 2, width: x - start }); start = null; }
  }
  // [Claude] — 2026-09-25 — Une touche blanche allumée (bleue, verte…) peut être
  // assez sombre pour passer pour un trait de séparation ; elle est bien plus
  // large qu'un trait : on l'écarte, sinon la grille se décale d'une demi-touche
  // (tutoriels de Narcisse : Amazing Grace, « comment harmoniser rapidement »).
  const widths = runs.map((r) => r.width).sort((a, b) => a - b);
  const typical = widths[Math.floor(widths.length / 2)] || 1;
  const separators = runs.filter((r) => r.width <= Math.max(4, typical * 3)).map((r) => r.center);
  if (separators.length < 4) return null;

  const gaps = [];
  for (let i = 1; i < separators.length; i++) gaps.push(separators[i] - separators[i - 1]);
  const sortedGaps = [...gaps].sort((a, b) => a - b);
  const unit = sortedGaps[Math.floor(sortedGaps.length * 0.2)];
  if (!(unit > 2)) return null;

  const estimates = [];
  for (const g of gaps) {
    const k = Math.round(g / unit);
    if (k >= 1 && Math.abs(g / k - unit) < unit * 0.25) estimates.push(g / k);
  }
  if (estimates.length === 0) return null;
  estimates.sort((a, b) => a - b);
  const width = estimates[Math.floor(estimates.length / 2)];

  // Ajustement par moindres carrés : chaque séparation détectée est assignée au
  // rang entier le plus proche, puis pas et origine sont réestimés sur
  // l'ensemble. Une estimation par phase moyenne suffisait à placer la grille,
  // mais pas à la garder alignée d'un bout à l'autre : une erreur de 0,3 px sur
  // le pas dérive de près d'une touche entière sur trente.
  let w = width;
  let origin = separators[0];
  // [Claude] — 2026-09-25 — Ajustement « en peigne » avant les moindres carrés :
  // la largeur retenue est celle qui aligne le mieux TOUTES les séparations vues
  // (longueur résultante de leurs phases), sans les arrondir d'abord à un rang.
  // Quand beaucoup de traits manquent (touches allumées, texte), l'arrondi d'une
  // séparation lointaine sur une largeur approchée tombait sur le mauvais rang et
  // tirait la grille (Amazing Grace : 15,8 px trouvés pour 16,3 réels, une
  // touche de décalage d'un bout à l'autre).
  {
    let bestR = -1;
    for (let cand = width * 0.93; cand <= width * 1.07; cand += width * 0.001) {
      let cx = 0;
      let sy = 0;
      for (const sep of separators) {
        const a = (2 * Math.PI * sep) / cand;
        cx += Math.cos(a);
        sy += Math.sin(a);
      }
      const r = Math.hypot(cx, sy) / separators.length;
      if (r > bestR + 1e-9) {
        bestR = r;
        w = cand;
        const phase = Math.atan2(sy, cx) / (2 * Math.PI);
        origin = ((phase % 1) + 1) % 1 * cand;
      }
    }
    // Origine ramenée près de la première séparation vue.
    while (origin + w <= separators[0] + w / 2) origin += w;
    while (origin > separators[0] + w / 2) origin -= w;
  }
  for (let iter = 0; iter < 4; iter++) {
    const ks = separators.map((sep) => Math.round((sep - origin) / w));
    const n = ks.length;
    const sumK = ks.reduce((a, b) => a + b, 0);
    const sumS = separators.reduce((a, b) => a + b, 0);
    const sumKK = ks.reduce((a, b) => a + b * b, 0);
    const sumKS = ks.reduce((a, b, i) => a + b * separators[i], 0);
    const denom = n * sumKK - sumK * sumK;
    if (denom === 0) break;
    const newW = (n * sumKS - sumK * sumS) / denom;
    const newOrigin = (sumS - newW * sumK) / n;
    if (!(newW > 2)) break;
    const converged = Math.abs(newW - w) < 1e-6 && Math.abs(newOrigin - origin) < 1e-6;
    w = newW;
    origin = newOrigin;
    if (converged) break;
  }
  while (origin - w >= 0) origin -= w;

  // Étendue horizontale réelle du clavier : au-delà, la grille continuerait
  // dans le fond de l'image et fabriquerait des touches qui n'existent pas.
  let left = frame.width;
  let right = -1;
  for (let x = 0; x < frame.width; x++) {
    if (getLuma(frame, x, row) >= opts.whiteLuma) {
      if (x < left) left = x;
      if (x > right) right = x;
    }
  }
  if (right <= left) return null;

  return { width: w, origin, separators, left, right };
}

/**
 * Regroupe les touches noires en groupes de 2 (do♯/ré♯)
 * (fa♯/sol♯/la♯), à partir des seuls écarts entre elles.
 *
 * C'est le cœur du calage : ce motif est une propriété du clavier de piano,
 * pas de la vidéo. Il permet d'attribuer une classe de hauteur à chaque touche
 * sans lire la moindre étiquette.
 *
 * @param {{center: number}[]} blackKeys
 * @param {object} [options]
 * @returns {{ groups: number[][], valid: boolean, reason: string|null }}
 */
export function groupBlackKeys(blackKeys, options = {}) {
  const opts = { ...DEFAULT_GEOMETRY_OPTIONS, ...options };
  if (blackKeys.length < 5) {
    return { groups: [], valid: false, reason: 'TooFewBlackKeys' };
  }
  const gaps = [];
  for (let i = 1; i < blackKeys.length; i++) gaps.push(blackKeys[i].center - blackKeys[i - 1].center);

  // L'écart « dans un groupe » est le plus petit régulier ; l'écart « entre
  // groupes » vaut environ une touche blanche de plus. On sépare par la
  // médiane pondérée plutôt que par un seuil absolu en pixels, pour rester
  // indépendant de la résolution de la vidéo.
  const sorted = [...gaps].sort((a, b) => a - b);
  const small = sorted[Math.floor(sorted.length * 0.25)];
  const threshold = small * opts.groupGapRatio;

  const groups = [[0]];
  for (let i = 0; i < gaps.length; i++) {
    if (gaps[i] > threshold) groups.push([i + 1]);
    else groups[groups.length - 1].push(i + 1);
  }

  // Le motif attendu alterne 2 et 3. On tolère un groupe tronqué au tout début
  // ou à la toute fin (clavier coupé par le bord de l'image), pas au milieu.
  const sizes = groups.map((g) => g.length);

  // Aucun groupe ne peut dépasser 3 : au-delà, ce ne sont pas des touches
  // noires de piano. Ce contrôle attrape le cas où tous les écarts sont égaux —
  // une mire, une grille, un motif régulier quelconque — qui formerait sinon
  // un unique groupe géant sans partie intérieure à valider.
  if (sizes.some((n) => n > 3)) {
    return { groups, valid: false, reason: `OversizedGroup:${sizes.join(',')}` };
  }
  // Un seul groupe ne permet pas d'établir l'alternance : c'est trop peu pour
  // affirmer qu'on regarde un clavier.
  if (groups.length < 2) {
    return { groups, valid: false, reason: `TooFewGroups:${sizes.join(',')}` };
  }

  const interior = sizes.slice(1, -1);
  const badInterior = interior.some((s) => s !== 2 && s !== 3);
  if (badInterior) {
    return { groups, valid: false, reason: `UnexpectedPattern:${sizes.join(',')}` };
  }
  if (interior.length > 0) {
    for (let i = 1; i < interior.length; i++) {
      if (interior[i] === interior[i - 1]) {
        return { groups, valid: false, reason: `NonAlternatingPattern:${sizes.join(',')}` };
      }
    }
  }
  return { groups, valid: true, reason: null };
}

/** Nombre de touches blanches séparant do du bord gauche de chaque noire. */
const WHITE_BEFORE = { 1: 1, 3: 2, 6: 4, 8: 5, 10: 6 };

/**
 * Décide, pour chaque groupe de touches noires, s'il s'agit d'un groupe de 2
 * (do♯/ré♯) ou de 3 (fa♯/sol♯/la♯).
 *
 * Les groupes intérieurs sont complets : leur taille suffit. Les groupes des
 * extrémités peuvent être tronqués par le bord de l'image ; on les déduit par
 * alternance depuis leur voisin.
 *
 * @param {number[][]} groups
 * @returns {boolean[] | null} true = groupe de 2
 */
export function classifyBlackGroups(groups) {
  if (groups.length === 0) return null;
  const isPair = new Array(groups.length).fill(null);
  for (let i = 0; i < groups.length; i++) {
    const interior = i > 0 && i < groups.length - 1;
    if (groups[i].length === 3) isPair[i] = false;
    else if (groups[i].length === 2 && interior) isPair[i] = true;
    else if (groups[i].length === 2 && groups.length === 1) isPair[i] = true;
  }
  let seed = isPair.findIndex((v) => v !== null);
  if (seed < 0) return null;
  for (let i = seed - 1; i >= 0; i--) isPair[i] = !isPair[i + 1];
  for (let i = seed + 1; i < groups.length; i++) {
    if (isPair[i] === null) isPair[i] = !isPair[i - 1];
    else if (isPair[i] === isPair[i - 1]) return null; // motif incohérent
  }
  return isPair;
}

/**
 * Assemble la géométrie complète à partir des rangées, touches noires et grille
 * d'une image. Utilisé indifféremment par toutes les stratégies de détection.
 *
 * @param {import('./frame.js').PixelFrame} frame
 * @param {{ whiteRow: number, bottom: number }} rows
 * @param {{ row: number, keys: object[], grouping: object }} picked
 * @param {{ width: number, origin: number, left: number, right: number }} grid
 * @param {object} [options]
 * @returns {object} `{ ok: true, ... }` ou `{ ok: false, reason, detail? }`
 */
function buildGeometry(frame, rows, picked, grid, options = {}) {
  const opts = { ...DEFAULT_GEOMETRY_OPTIONS, ...options };

  const isPair = classifyBlackGroups(picked.grouping.groups);
  if (!isPair) return { ok: false, reason: 'BlackKeyPattern', detail: 'Unclassifiable' };

  // 1. Classe de hauteur de chaque touche noire, depuis le seul motif 2/3.
  const blackPc = new Array(picked.keys.length).fill(null);
  picked.grouping.groups.forEach((g, gi) => {
    // Un groupe tronqué a perdu ses premières touches, pas ses dernières :
    // le bord gauche de l'image coupe par la gauche.
    const semis = (isPair[gi] ? [1, 3] : [6, 8, 10]).slice(-g.length);
    g.forEach((bi, k) => { blackPc[bi] = semis[k]; });
  });

  // 2. Sur quelle frontière de touches blanches chaque noire se trouve-t-elle ?
  const boundaryIndex = (x) => Math.round((x - grid.origin) / grid.width);

  // 3. Le do de référence : la blanche immédiatement à gauche d'un do♯.
  const cCandidates = [];
  for (let i = 0; i < picked.keys.length; i++) {
    const pc = blackPc[i];
    if (pc === null) continue;
    const b = boundaryIndex(picked.keys[i].center);
    // Ramène à l'indice de blanche du do de cette octave.
    cCandidates.push(b - WHITE_BEFORE[pc]);
  }
  if (cCandidates.length === 0) return { ok: false, reason: 'NoAnchor' };
  // Toutes ces estimations désignent un do, mais d'octaves différentes :
  // on les ramène modulo 7 puis on prend le mode.
  const counts = new Map();
  for (const c of cCandidates) {
    const m = ((c % 7) + 7) % 7;
    counts.set(m, (counts.get(m) || 0) + 1);
  }
  let cMod = 0;
  let bestCount = -1;
  for (const [m, n] of counts) if (n > bestCount) { bestCount = n; cMod = m; }
  if (bestCount < cCandidates.length * 0.6) {
    return { ok: false, reason: 'InconsistentAnchor', detail: `${bestCount}/${cCandidates.length}` };
  }

  // 4. Énumérer les touches blanches entièrement visibles.
  const whiteKeys = [];
  const tol = grid.width * 0.25;
  const firstIdx = Math.floor((grid.left - grid.origin) / grid.width) - 1;
  for (let i = firstIdx; ; i++) {
    const left = grid.origin + i * grid.width;
    const right = left + grid.width;
    if (left > grid.right) break;
    // Une touche n'est retenue que si elle tient dans l'étendue mesurée du
    // clavier : sinon la grille inventerait des touches dans le fond.
    if (left < grid.left - tol) continue;
    if (right > grid.right + tol) break;
    whiteKeys.push({ whiteIndex: i, left, right, center: (left + right) / 2 });
  }
  if (whiteKeys.length < opts.minWhiteKeys) {
    return { ok: false, reason: 'TooFewWhiteKeys', detail: String(whiteKeys.length) };
  }

  // Un vrai clavier de piano n'a jamais plus d'une cinquantaine de blanches
  // (88 touches = 52 blanches au maximum), et le rapport noires/blanches y
  // est stable autour de 0,69 (36 noires pour 52 blanches). Une lecture hors
  // de ces bornes n'est pas un clavier plus grand ou plus petit : c'est une
  // mauvaise lecture (mauvaise rangée de noires, grille mal calée), qu'il
  // faut écarter ici plutôt que la laisser fausser le contrôle de stabilité
  // entre plusieurs images (detectVideoFormat).
  if (whiteKeys.length > 60 || picked.keys.length < whiteKeys.length * 0.45) {
    return { ok: false, reason: 'ImplausibleKeyCount', detail: `${whiteKeys.length}w/${picked.keys.length}b` };
  }

  // 5. Demi-tons relatifs, do de référence = 0.
  const relSemitone = (whiteIndex) => {
    const d = whiteIndex - cMod;
    const oct = Math.floor(d / 7);
    const step = ((d % 7) + 7) % 7;
    return oct * 12 + WHITE_SEMITONES[step];
  };
  const relLow = relSemitone(whiteKeys[0].whiteIndex);
  const relHigh = relSemitone(whiteKeys[whiteKeys.length - 1].whiteIndex);

  // 6. Ancrage MIDI.
  //
  //    Les classes de hauteur sont sûres ; l'octave absolue ne l'est pas — un
  //    clavier do2–do6 et un clavier do1–do5 donnent la même image à un
  //    décalage près. Ça n'affecte PAS le nom des accords : detectChord ne
  //    dépend que des classes de hauteur et de l'ordre relatif des notes, tous
  //    deux invariants par transposition d'une octave. Seul l'affichage change.
  //    À défaut d'ancre fournie, on centre la plage sur le do central (MIDI 60),
  //    disposition usuelle de ces rendus.
  const pcLow = ((relLow % 12) + 12) % 12;
  let lowestMidi;
  let anchorIsHeuristic;
  if (Number.isFinite(opts.octaveAnchor)) {
    lowestMidi = opts.octaveAnchor;
    anchorIsHeuristic = false;
  } else {
    let best = null;
    for (let oct = 0; oct <= 9; oct++) {
      const cand = oct * 12 + pcLow;
      const mid = cand + (relHigh - relLow) / 2;
      const dist = Math.abs(mid - 60);
      if (best === null || dist < best.dist) best = { cand, dist };
    }
    lowestMidi = best.cand;
    anchorIsHeuristic = true;
  }

  for (const k of whiteKeys) k.midi = lowestMidi + relSemitone(k.whiteIndex) - relLow;

  const blackKeys = [];
  for (let i = 0; i < picked.keys.length; i++) {
    const pc = blackPc[i];
    if (pc === null) continue;
    const c = picked.keys[i].center;
    if (c < grid.left - grid.width * 0.5 || c > grid.right + grid.width * 0.5) continue;
    const b = boundaryIndex(picked.keys[i].center);
    const cIndex = b - WHITE_BEFORE[pc];
    const midi = lowestMidi + (relSemitone(cIndex) + pc) - relLow;
    blackKeys.push({
      midi,
      center: picked.keys[i].center,
      left: picked.keys[i].left,
      right: picked.keys[i].right,
    });
  }

  // Ligne d'échantillonnage fiable pour les touches blanches, utilisable par
  // readLitKeys() indépendamment de la stratégie de détection. On ne peut pas
  // utiliser rows.whiteRow directement : pour les claviers statiques, elle est
  // choisie comme la rangée la plus claire, qui peut tomber trop près du bord
  // bas. La zone de couleur des touches allumées est entre les noires et le bas
  // du clavier ; on place donc l'échantillon à une fraction de cette hauteur.
  // Pour Synthesia, strikeY est au-dessus du clavier et la formule précédente
  // (strikeY + ratio * (bottom - strikeY)) donnait une ligne similaire. On
  // reproduit ici la même chose en utilisant le haut effectif du clavier :
  // blackRow est toujours dans le clavier, y compris en statique.
  const sampleRow = Math.round(picked.row + (rows.bottom - picked.row) * 0.78);

  // [Claude] — 2026-09-25 — Une noire est toujours entre deux blanches : un bord
  // sombre de l'image pris pour une noire au-delà de la dernière blanche (« Ré8 »
  // fantôme sur Amazing Grace) est écarté, quelle que soit la stratégie.
  const whiteMidis = new Set(whiteKeys.map((k) => k.midi));
  const realBlackKeys = blackKeys.filter((k) => whiteMidis.has(k.midi - 1) && whiteMidis.has(k.midi + 1));

  return {
    ok: true,
    whiteRow: rows.whiteRow,
    blackRow: picked.row,
    bottom: rows.bottom,
    sampleRow,
    whiteWidth: grid.width,
    whiteKeys,
    blackKeys: realBlackKeys,
    lowestMidi: whiteKeys[0].midi,
    highestMidi: whiteKeys[whiteKeys.length - 1].midi,
    anchorIsHeuristic,
  };
}

/**
 * Stratégie 1 : clavier Synthesia classique avec barres tombantes.
 * Repère d'abord la ligne de frappe rouge, puis le clavier en dessous.
 *
 * @param {import('./frame.js').PixelFrame} frame
 * @param {object} [options]
 * @returns {object} `{ ok: true, ... }` ou `{ ok: false, reason, detail? }`
 */
export function detectSynthesiaGeometry(frame, options = {}) {
  const opts = { ...DEFAULT_GEOMETRY_OPTIONS, ...options };

  const strike = findStrikeLine(frame, opts);
  if (!strike) return { ok: false, reason: 'NoStrikeLine' };

  const rows = findKeyboardRows(frame, strike.y, opts);
  if (!rows) return { ok: false, reason: 'NoKeyboardRows' };

  const picked = pickBlackRow(frame, rows.blackSearch, opts);
  if (!picked) return { ok: false, reason: 'BlackKeyPattern', detail: 'NoValidRow' };

  const grid = findWhiteGrid(frame, rows.whiteRow, opts);
  if (!grid) return { ok: false, reason: 'NoWhiteGrid' };

  const geometry = buildGeometry(frame, rows, picked, grid, opts);
  if (!geometry.ok) return geometry;
  geometry.strikeY = strike.y;
  geometry.strategy = 'synthesia';
  return geometry;
}

/**
 * Stratégie 2 : clavier statique affiché sans ligne de frappe.
 * Cherche directement dans la moitié basse de l'image le motif noir/blanc.
 *
 * @param {import('./frame.js').PixelFrame} frame
 * @param {object} [options]
 * @returns {object} `{ ok: true, ... }` ou `{ ok: false, reason, detail? }`
 */
export function detectStaticKeyboardGeometry(frame, options = {}) {
  const opts = { ...DEFAULT_GEOMETRY_OPTIONS, ...options };

  // Le clavier statique occupe typiquement le tiers ou la moitié basse.
  const topY = Math.floor(frame.height * 0.5);
  const bottom = frame.height;

  // On essaye plusieurs plages de recherche si le clavier est petit ou mal centré.
  const starts = [topY, Math.floor(frame.height * 0.45), Math.floor(frame.height * 0.55)];
  let lastReason = 'StaticKeyboardNotFound';
  let lastDetail;
  for (const start of starts) {
    if (start + 6 >= bottom) continue;
    const rows = findKeyboardRows(frame, start, opts);
    if (!rows) continue;
    const picked = pickBlackRow(frame, rows.blackSearch, opts);
    if (!picked) continue;
    const grid = findWhiteGrid(frame, rows.whiteRow, opts);
    if (!grid) continue;
    const geometry = buildGeometry(frame, rows, picked, grid, opts);
    if (!geometry.ok) {
      lastReason = geometry.reason;
      lastDetail = geometry.detail;
      continue;
    }
    geometry.strategy = 'staticKeyboard';
    return geometry;
  }
  return { ok: false, reason: lastReason, detail: lastDetail };
}

/**
 * [Claude] — 2026-09-25 — Bande des touches noires : le groupe de rangées
 * consécutives où le motif 2/3 est valide, le plus haut et le plus fourni. On
 * la cherche dans TOUTE l'image : le clavier dessiné n'est pas toujours en bas
 * (Amazing Grace : portée et nom d'accord au-dessus, vrai piano filmé en
 * dessous ; « comment harmoniser » : titre et professeur au-dessus).
 *
 * @param {import('./frame.js').PixelFrame} frame
 * @param {object} [options]
 * @returns {{ top: number, bottom: number, rows: object[], score: number } | null}
 */
export function findKeyboardBand(frame, options = {}) {
  const opts = { ...DEFAULT_GEOMETRY_OPTIONS, ...options };
  const bands = [];
  for (let y = 0; y < frame.height; y++) {
    const keys = findBlackKeys(frame, y, opts);
    if (keys.length < opts.minBandBlackKeys) continue;
    const grouping = groupBlackKeys(keys, opts);
    if (!grouping.valid) continue;
    const row = { y, count: keys.length, keys, grouping };
    const last = bands[bands.length - 1];
    // Même bande : rangées voisines, à peu près le même nombre de noires
    // (une noire allumée peut manquer sur une rangée, pas dix).
    if (last && y - last.bottom <= 2 && Math.abs(row.count - last.count) <= 2) {
      last.bottom = y;
      last.rows.push(row);
    } else {
      bands.push({ top: y, bottom: y, count: row.count, rows: [row] });
    }
  }
  const scored = bands
    .filter((b) => b.bottom - b.top + 1 >= opts.minBandHeight)
    .map((b) => ({ ...b, score: (b.bottom - b.top + 1) * Math.max(...b.rows.map((r) => r.count)) }))
    .sort((a, b) => b.score - a.score);
  return scored[0] || null;
}

/**
 * [Claude] — 2026-09-25 — Complète les touches noires manquantes : une noire
 * allumée au moment du sondage n'est plus sombre et disparaît du relevé ; elle
 * ne pourrait alors jamais être lue. Sa place se déduit de la grille des
 * blanches et du décalage mesuré sur les noires de même nom.
 */
function completeBlackKeys(geometry, grid) {
  const whiteByMidi = new Map(geometry.whiteKeys.map((k) => [k.midi, k]));
  const known = new Set(geometry.blackKeys.map((k) => k.midi));
  const offsets = new Map();
  const widths = [];
  for (const k of geometry.blackKeys) {
    const below = whiteByMidi.get(k.midi - 1);
    if (!below) continue;
    const boundary = grid.origin + (below.whiteIndex + 1) * grid.width;
    const pc = ((k.midi % 12) + 12) % 12;
    (offsets.get(pc) || offsets.set(pc, []).get(pc)).push(k.center - boundary);
    widths.push(k.right - k.left);
  }
  if (!widths.length) return;
  const med = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
  const all = [...offsets.values()].flat();
  const width = med(widths);
  for (const white of geometry.whiteKeys) {
    const midi = white.midi + 1;
    const pc = ((midi % 12) + 12) % 12;
    if (![1, 3, 6, 8, 10].includes(pc) || known.has(midi) || !whiteByMidi.has(midi + 1)) continue;
    const center = grid.origin + (white.whiteIndex + 1) * grid.width + med(offsets.get(pc) || all);
    geometry.blackKeys.push({ midi, center, left: center - width / 2, right: center + width / 2, synthesized: true });
  }
  geometry.blackKeys.sort((a, b) => a.midi - b.midi);
}

/**
 * [Claude] — 2026-09-25 — Stratégie 3 : clavier dessiné n'importe où dans
 * l'image (bande des noires, puis zone des blanches juste en dessous). Les
 * tutoriels réels de Narcisse échouaient sur les deux autres : pas de ligne de
 * frappe, et un panneau blanc ou un visage au-dessus du clavier.
 *
 * @param {import('./frame.js').PixelFrame} frame
 * @param {object} [options]
 * @returns {object} `{ ok: true, ... }` ou `{ ok: false, reason, detail? }`
 */
export function detectKeyboardBandGeometry(frame, options = {}) {
  const opts = { ...DEFAULT_GEOMETRY_OPTIONS, ...options };
  const band = findKeyboardBand(frame, opts);
  if (!band) return { ok: false, reason: 'NoKeyboardBand' };

  // Rangée des noires : celle qui en montre le plus, au milieu de la bande.
  const most = Math.max(...band.rows.map((r) => r.count));
  const best = band.rows.filter((r) => r.count === most);
  const pickedRow = best[Math.floor(best.length / 2)];
  const picked = { row: pickedRow.y, keys: pickedRow.keys, grouping: pickedRow.grouping };

  // Luminance des blanches : entre les noires, sur la rangée retenue.
  const x0 = Math.max(0, Math.floor(picked.keys[0].left));
  const x1 = Math.min(frame.width - 1, Math.ceil(picked.keys[picked.keys.length - 1].right));
  const bright = [];
  for (let x = x0; x <= x1; x++) {
    const l = getLuma(frame, x, picked.row);
    if (l >= opts.blackLuma) bright.push(l);
  }
  bright.sort((a, b) => a - b);
  const whiteRef = bright.length ? bright[Math.floor(bright.length * 0.75)] : opts.whiteLuma;

  // Zone des blanches seules, sous les noires : claire (ou colorée : touche
  // allumée) sur toute la largeur du clavier.
  const isKeyPixel = (x, y) => {
    const [r, g, b] = getPixel(frame, x, y);
    const l = 0.299 * r + 0.587 * g + 0.114 * b;
    return l >= whiteRef * 0.72 || Math.max(r, g, b) - Math.min(r, g, b) >= 40;
  };
  const isKeyRow = (y) => {
    let ok = 0;
    let n = 0;
    for (let x = x0; x <= x1; x += 2) { n++; if (isKeyPixel(x, y)) ok++; }
    return ok / n >= 0.6;
  };
  // [Claude] — 2026-09-25 — Le bas des noires est flou (compression) : une ou
  // deux rangées de transition, ni noires ni blanches, précèdent la zone des
  // blanches. Sur « comment harmoniser rapidement », cette seule rangée faisait
  // échouer 13 images de sondage sur 24. On la saute avant de mesurer.
  let zoneTop = band.bottom + 1;
  while (zoneTop <= band.bottom + 3 && zoneTop < frame.height && !isKeyRow(zoneTop)) zoneTop++;
  let bottom = zoneTop - 1;
  for (let y = zoneTop; y < frame.height && y <= band.bottom + (band.bottom - band.top + 1) * 2; y++) {
    if (!isKeyRow(y)) break;
    bottom = y;
  }
  if (bottom - zoneTop + 1 < 3) return { ok: false, reason: 'NoWhiteZone' };
  const zoneHeight = bottom - zoneTop + 1;

  const whiteRow = zoneTop + Math.round(zoneHeight * 0.35);
  const grid = findWhiteGrid(frame, whiteRow, { ...opts, whiteLuma: Math.min(opts.whiteLuma, whiteRef * 0.85), separatorLuma: whiteRef - 25 });
  if (!grid) return { ok: false, reason: 'NoWhiteGrid' };

  const geometry = buildGeometry(frame, { whiteRow, bottom: bottom + 1 }, picked, grid, opts);
  if (!geometry.ok) return geometry;
  completeBlackKeys(geometry, grid);
  // Couleur des blanches lue juste sous les noires : au-dessus des étiquettes
  // éventuelles (« C1 »… « C8 ») posées tout en bas des touches.
  geometry.sampleRow = zoneTop + Math.round(zoneHeight * 0.45);
  geometry.blackTop = band.top;
  geometry.blackBottom = band.bottom;
  geometry.strategy = 'keyboardBand';
  return geometry;
}

/**
 * Liste ordonnée des stratégies de détection. Chaque stratégie a le même
 * contrat : `(frame, options) => { ok: true, ... } | { ok: false, reason }`.
 * Ajouter un format se résume à écrire une nouvelle fonction et l'insérer ici.
 */
export const DETECTION_STRATEGIES = [
  detectSynthesiaGeometry,
  detectStaticKeyboardGeometry,
  detectKeyboardBandGeometry,
];

/**
 * Construit la géométrie complète du clavier à partir d'une image où il est
 * visible (de préférence au repos, mais des touches allumées ne gênent pas :
 * elles restent sombres ou claires selon leur type).
 *
 * Principe : les positions des blanches ET des noires sont MESURÉES, jamais
 * déduites les unes des autres. Une tentative précédente supposait que deux
 * noires d'un même groupe étaient espacées d'exactement une touche blanche —
 * c'est faux, les proportions réelles d'un clavier de piano sont irrégulières,
 * et l'erreur décalait tout le calage. Le seul lien géométrique utilisé ici est
 * celui qui est vrai sur tout clavier : un do♯ se trouve au-dessus de la
 * frontière entre do et ré.
 *
 * @param {import('./frame.js').PixelFrame} frame
 * @param {object} [options]
 * @param {number} [options.octaveAnchor] - MIDI imposé pour la touche la plus
 *   grave ; sinon l'heuristique du centrage sur le do central s'applique.
 * @returns {object} `{ ok: true, ... }` ou `{ ok: false, reason, detail? }`
 */
export function detectKeyboardGeometry(frame, options = {}) {
  const failures = [];
  for (const strategy of DETECTION_STRATEGIES) {
    const result = strategy(frame, options);
    if (result.ok) return result;
    failures.push({ name: strategy.name, reason: result.reason, detail: result.detail });
  }
  return {
    ok: false,
    reason: 'AllStrategiesFailed',
    failures,
    detail: failures.map((f) => `${f.name}:${f.reason}`).join('; '),
  };
}

export { WHITE_SEMITONES, BLACK_SEMITONES };
