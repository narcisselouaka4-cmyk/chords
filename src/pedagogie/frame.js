// [Claude] — 2026-09-05 — Pédagogie IA : abstraction minimale d'une image.
//
// Toute l'analyse d'image de ce chantier travaille sur cette structure, jamais
// sur un <canvas>, un <img> ou un Buffer d'un format particulier. Deux raisons :
//
//   1. les mêmes fonctions doivent tourner dans le processus principal Electron
//      (pixels bruts sortis de ffmpeg, RGB 3 octets) et, si besoin un jour, dans
//      le rendu (ImageData d'un canvas, RGBA 4 octets) ;
//   2. elles restent testables en Node sur des images synthétiques, sans
//      décodeur d'image ni dépendance native.
//
// Aucune décision musicale ici : ce module ne connaît que des pixels.

/**
 * @typedef {object} PixelFrame
 * @property {Uint8Array|Uint8ClampedArray|Buffer} data
 * @property {number} width
 * @property {number} height
 * @property {number} channels - 3 (RGB) ou 4 (RGBA)
 */

/**
 * Construit une image à partir d'un tampon de pixels.
 *
 * @param {Uint8Array|Uint8ClampedArray|Buffer} data
 * @param {number} width
 * @param {number} height
 * @param {number} [channels]
 * @returns {PixelFrame}
 */
export function createFrame(data, width, height, channels = 3) {
  if (!data || typeof data.length !== 'number') {
    throw new TypeError('data doit être un tampon de pixels');
  }
  if (!Number.isInteger(width) || width <= 0 || !Number.isInteger(height) || height <= 0) {
    throw new RangeError(`Dimensions invalides : ${width}×${height}`);
  }
  if (channels !== 3 && channels !== 4) {
    throw new RangeError(`channels doit valoir 3 ou 4, reçu ${channels}`);
  }
  const expected = width * height * channels;
  if (data.length < expected) {
    throw new RangeError(`Tampon trop court : ${data.length} octets pour ${expected} attendus`);
  }
  return { data, width, height, channels };
}

/**
 * Couleur d'un pixel, en RGB. Hors limites, retourne du noir plutôt que de
 * lever : les balayages géométriques débordent naturellement des bords, et une
 * exception à cet endroit transformerait un pixel manquant en panne complète.
 *
 * @param {PixelFrame} frame
 * @param {number} x
 * @param {number} y
 * @returns {[number, number, number]}
 */
export function getPixel(frame, x, y) {
  const xi = Math.round(x);
  const yi = Math.round(y);
  if (xi < 0 || yi < 0 || xi >= frame.width || yi >= frame.height) return [0, 0, 0];
  const i = (yi * frame.width + xi) * frame.channels;
  return [frame.data[i], frame.data[i + 1], frame.data[i + 2]];
}

/**
 * Luminance approchée (moyenne des canaux). Suffisante ici : on distingue des
 * touches blanches d'un fond noir, pas des nuances proches.
 *
 * @param {PixelFrame} frame
 * @param {number} x
 * @param {number} y
 * @returns {number} 0-255
 */
export function getLuma(frame, x, y) {
  const [r, g, b] = getPixel(frame, x, y);
  return (r + g + b) / 3;
}

/**
 * Couleur médiane d'un petit carré, pour ne pas décider sur un pixel isolé
 * (bord de touche, artefact de compression, reflet du rendu).
 *
 * @param {PixelFrame} frame
 * @param {number} x
 * @param {number} y
 * @param {number} [radius]
 * @returns {[number, number, number]}
 */
export function sampleMedian(frame, x, y, radius = 1) {
  const rs = [];
  const gs = [];
  const bs = [];
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const [r, g, b] = getPixel(frame, x + dx, y + dy);
      rs.push(r); gs.push(g); bs.push(b);
    }
  }
  const mid = (arr) => {
    arr.sort((a, b) => a - b);
    return arr[Math.floor(arr.length / 2)];
  };
  return [mid(rs), mid(gs), mid(bs)];
}

/**
 * Crée une image unie — utilisée par les tests pour fabriquer des claviers
 * synthétiques dont la géométrie attendue est connue exactement.
 *
 * @param {number} width
 * @param {number} height
 * @param {[number, number, number]} [color]
 * @param {number} [channels]
 * @returns {PixelFrame}
 */
export function createBlankFrame(width, height, color = [0, 0, 0], channels = 3) {
  const data = new Uint8Array(width * height * channels);
  for (let i = 0; i < width * height; i++) {
    const o = i * channels;
    data[o] = color[0];
    data[o + 1] = color[1];
    data[o + 2] = color[2];
    if (channels === 4) data[o + 3] = 255;
  }
  return createFrame(data, width, height, channels);
}

/**
 * Peint un rectangle plein. Réservé aux tests et aux images de diagnostic.
 *
 * @param {PixelFrame} frame
 * @param {number} x0
 * @param {number} y0
 * @param {number} w
 * @param {number} h
 * @param {[number, number, number]} color
 */
export function fillRect(frame, x0, y0, w, h, color) {
  for (let y = Math.max(0, y0); y < Math.min(frame.height, y0 + h); y++) {
    for (let x = Math.max(0, x0); x < Math.min(frame.width, x0 + w); x++) {
      const i = (y * frame.width + x) * frame.channels;
      frame.data[i] = color[0];
      frame.data[i + 1] = color[1];
      frame.data[i + 2] = color[2];
      if (frame.channels === 4) frame.data[i + 3] = 255;
    }
  }
}
