// [Claude] — 2026-10-03 — Pédagogie IA : la largeur du Copilote à côté de la vidéo.
//
// Narcisse : « La fenêtre est trop petite […] Il faudrait pouvoir l'agrandir, mais si on
// agrandit la fenêtre de Copilot, la fenêtre vidéo […] sera forcément impactée. Je ne sais
// pas trop comment relier les deux, mais il faut trouver un moyen. » Son choix : une
// poignée entre la vidéo et le Copilote (l'un grandit, l'autre rétrécit) et un bouton
// « Agrandir » / « Réduire » dans l'en-tête du Copilote. La largeur choisie est retenue.
//
// La part du Copilote dans la largeur de l'écran du tuto (0,38 = 38 %). Fonctions pures,
// testées dans test-copilot-width.js ; l'écran (src/ui/pedagogie-tab.js) les applique.
// Les minimums en pixels (Copilote 300 px, vidéo 380 px) sont tenus par la feuille de style.

/** Part par défaut (celle d'avant la poignée). */
export const DEFAULT_SHARE = 0.38;
/** Part du Copilote « agrandi ». */
export const WIDE_SHARE = 0.6;
/** Bornes : la vidéo garde au moins 28 % de la largeur, le Copilote au moins 25 %. */
export const MIN_SHARE = 0.25;
export const MAX_SHARE = 0.72;
/** Un pas au clavier (flèches sur la poignée). */
export const KEY_STEP = 0.02;

/** Une part valide (nombre entre les bornes) ; sinon la part par défaut. */
export function clampShare(share) {
  const n = Number(share);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_SHARE;
  return Math.min(MAX_SHARE, Math.max(MIN_SHARE, Math.round(n * 1000) / 1000));
}

/**
 * La part du Copilote quand la poignée est à l'abscisse `x` : le Copilote occupe ce qui
 * est à droite de la poignée.
 * @param {number} x - position du pointeur (px)
 * @param {{left: number, width: number}} rect - l'écran du tuto
 * @param {number} [handle] - largeur de la poignée (px)
 */
export function shareAt(x, rect, handle = 16) {
  const width = Number(rect?.width);
  if (!(width > 0) || !Number.isFinite(Number(x))) return DEFAULT_SHARE;
  const right = Number(rect.left) + width;
  return clampShare((right - Number(x) - handle / 2) / width);
}

/** Le Copilote est « agrandi » (le bouton propose alors « Réduire »). */
export function isWide(share) {
  return clampShare(share) >= (DEFAULT_SHARE + WIDE_SHARE) / 2;
}

/** Le bouton : agrandi → normal, sinon → agrandi. */
export function toggledShare(share) {
  return isWide(share) ? DEFAULT_SHARE : WIDE_SHARE;
}

/**
 * Les flèches sur la poignée : ← la poignée va à gauche (le Copilote grandit), → l'inverse ;
 * Début / Fin : le plus large, le plus étroit. null : touche sans effet.
 */
export function shareForKey(share, key) {
  const current = clampShare(share);
  switch (key) {
    case 'ArrowLeft': return clampShare(current + KEY_STEP);
    case 'ArrowRight': return clampShare(current - KEY_STEP);
    case 'Home': return MAX_SHARE;
    case 'End': return MIN_SHARE;
    default: return null;
  }
}

/** La part retenue (texte du stockage) ; la part par défaut si elle est absente ou fausse. */
export function storedShare(text) {
  return text == null || text === '' ? DEFAULT_SHARE : clampShare(Number(text));
}
