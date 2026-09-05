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

import { sampleMedian } from './frame.js';

export const DEFAULT_DETECTION_OPTIONS = {
  // Écart minimal entre canal max et canal min pour parler de couleur.
  minSaturation: 30,
  // Marge d'un canal sur le rouge pour trancher la teinte.
  hueMargin: 20,
  // Rayon d'échantillonnage : on décide sur une petite médiane, pas un pixel.
  sampleRadius: 1,
  // Fraction de la hauteur de touche blanche où échantillonner, sous les noires.
  whiteSampleRatio: 0.78,
};

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
  if (b > r + opts.hueMargin && b >= g) return 'blue';
  if (g > r + opts.hueMargin && g > b + opts.hueMargin) return 'green';
  return 'other';
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

  // Rangée d'échantillonnage des blanches : bien sous les touches noires.
  const whiteY = Math.round(
    geometry.strikeY + (geometry.bottom - geometry.strikeY) * opts.whiteSampleRatio,
  );

  for (const key of geometry.blackKeys) {
    const [r, g, b] = sampleMedian(frame, key.center, geometry.blackRow, opts.sampleRadius);
    const hand = classifyTint(r, g, b, opts);
    if (hand) lit.push({ midi: key.midi, hand, kind: 'black' });
  }

  for (const key of geometry.whiteKeys) {
    const [r, g, b] = sampleMedian(frame, key.center, whiteY, opts.sampleRadius);
    const hand = classifyTint(r, g, b, opts);
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
