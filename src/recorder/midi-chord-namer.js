// [Claude] — 2026-09-24 — Nom d'un accord joué au clavier MIDI (sessions).
//
// Narcisse : « les accords détectés et affichés ne sont pas toujours les bons,
// alors qu'il s'agit bien de pur MIDI natif ». Le moteur général (detectChord)
// laissait tomber la 13e (C E A Bb D → C9), la #11 (Cmaj7#11 → Cmaj9), nommait
// mal les 11e, les 6/9, les sus et les 7alt (66 % de voicings de l'Exercice
// bien nommés, basse comprise), et la session affichait son `fullName` sans
// fondamentale (« Major 9 » au lieu de « Cmaj9 »).
//
// Ici, on part des notes réellement jouées : chaque classe de hauteur présente
// est essayée comme fondamentale, et l'accord retenu est celui dont le modèle
// explique TOUTES les notes (notes obligatoires présentes, notes facultatives —
// quinte, 9e d'une 13e — permises, aucune note étrangère). La basse jouée compte
// d'abord : un accord dont la fondamentale est à la basse passe avant un
// renversement (A C E G = Am7, pas C6/A) ; sinon on écrit la basse (C/E).
// Qualités : celles de l'application (maj7, m11, 13, 7alt…). Un ensemble qu'aucun
// modèle n'explique (voicings rares) repasse par detectChord, avec sa fondamentale.

import { detectChord } from '../chord-engine/index.js';

// [qualité, notes obligatoires, notes facultatives] en demi-tons depuis la fondamentale.
const TEMPLATES = [
  ['', [0, 4, 7], []],
  ['m', [0, 3, 7], []],
  ['dim', [0, 3, 6], []],
  ['aug', [0, 4, 8], []],
  ['sus4', [0, 5, 7], []],
  ['sus2', [0, 2, 7], []],
  ['6', [0, 4, 9], [7]],
  ['m6', [0, 3, 9], [7]],
  ['6/9', [0, 4, 9, 2], [7]],
  ['m6/9', [0, 3, 9, 2], [7]],
  ['add9', [0, 4, 2], [7]],
  ['madd9', [0, 3, 2], [7]],
  ['maj7', [0, 4, 11], [7]],
  ['maj9', [0, 4, 11, 2], [7]],
  ['maj13', [0, 4, 11, 9], [7, 2]],
  ['maj7#11', [0, 4, 11, 6], [7, 2]],
  ['maj13#11', [0, 4, 11, 6, 9], [7, 2]],
  ['maj7#5', [0, 4, 8, 11], [2]],
  ['m7', [0, 3, 10], [7]],
  ['m9', [0, 3, 10, 2], [7]],
  ['m11', [0, 3, 10, 5], [7, 2]],
  ['m13', [0, 3, 10, 9], [7, 2, 5]],
  ['mMaj7', [0, 3, 11], [7]],
  ['mMaj9', [0, 3, 11, 2], [7]],
  ['m7b5', [0, 3, 6, 10], [1, 2, 5]],
  ['dim7', [0, 3, 6, 9], []],
  ['7', [0, 4, 10], [7]],
  ['9', [0, 4, 10, 2], [7]],
  ['13', [0, 4, 10, 9], [7, 2]],
  ['7sus4', [0, 5, 10], [7]],
  ['9sus4', [0, 5, 10, 2], [7]],
  ['13sus4', [0, 5, 10, 9], [7, 2]],
  ['7b9', [0, 4, 10, 1], [7]],
  ['7#9', [0, 4, 10, 3], [7]],
  ['7#11', [0, 4, 10, 6], [7, 2]],
  ['13#11', [0, 4, 10, 6, 9], [7, 2]],
  ['7b13', [0, 4, 10, 8], [7, 2]],
  ['7#5', [0, 4, 8, 10], [2]],
  ['7b5', [0, 4, 6, 10], [2]],
  ['7b9b13', [0, 4, 10, 1, 8], []],
  ['7#9b13', [0, 4, 10, 3, 8], []],
  ['7b5b9', [0, 4, 6, 10, 1], []],
  ['7#5#9', [0, 4, 8, 10, 3], []],
  ['13b9', [0, 4, 10, 1, 9], [7]],
];

// 7alt : 9e altérée (b9 / #9) ET quinte altérée (b5 / #5), sans 5, 9, 13 naturelles.
function isAltered(intervals) {
  const has = (i) => intervals.has(i);
  if (!has(0) || !has(4) || !has(10)) return false;
  if (!(has(1) || has(3)) || !(has(6) || has(8))) return false;
  return ![2, 5, 7, 9, 11].some(has);
}

const NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
const LATIN = ['Do', 'Réb', 'Ré', 'Mib', 'Mi', 'Fa', 'Fa#', 'Sol', 'Lab', 'La', 'Sib', 'Si'];

/** Nom d'une classe de hauteur (orthographe courante des grilles : Bb, Eb, F#). */
export function pitchName(pc, { latin = false } = {}) {
  return (latin ? LATIN : NAMES)[((pc % 12) + 12) % 12];
}

/**
 * Accord joué : fondamentale, qualité (celle de l'application), basse, nom.
 * @param {number[]} notes - notes MIDI jouées ensemble
 * @param {{latin?: boolean}} [options]
 * @returns {{rootPc: number, symbol: string, bassPc: number, isSlash: boolean, name: string, matched: boolean}|null}
 */
export function nameMidiChord(notes, { latin = false } = {}) {
  const list = (notes || []).filter(Number.isFinite);
  if (list.length === 0) return null;
  const pcs = [...new Set(list.map((n) => ((n % 12) + 12) % 12))];
  if (pcs.length < 3) return null;
  const bassPc = ((Math.min(...list) % 12) + 12) % 12;
  let best = null;
  for (const root of pcs) {
    const intervals = new Set(pcs.map((pc) => (pc - root + 12) % 12));
    const candidates = TEMPLATES.map(([symbol, required, optional]) => ({ symbol, required, optional }))
      .filter(({ required, optional }) => required.every((i) => intervals.has(i))
        && [...intervals].every((i) => required.includes(i) || optional.includes(i)));
    // Dominante altérée (b9 / #9 et b5 / #5) : « 7alt », le nom que donne un
    // pianiste, plutôt que 7#9b13, 7b5b9…
    if (isAltered(intervals)) candidates.push({ symbol: '7alt', required: [0, 4, 10], optional: [1, 3, 6, 8], altered: true });
    for (const c of candidates) {
      // Le modèle le plus précis d'abord (plus de notes obligatoires, moins de
      // facultatives) ; la fondamentale à la basse passe avant tout.
      const precision = c.altered ? 11 : c.required.length * 2 - c.optional.length * 0.25;
      const score = (root === bassPc ? 100 : 0) + precision;
      if (!best || score > best.score) best = { rootPc: root, symbol: c.symbol, score };
    }
  }
  // Aucun modèle n'explique toutes les notes : nom approché (detectChord), et
  // `matched: false` (voicing rare, ou note étrangère : voir session-performance.js).
  const matched = Boolean(best);
  if (!best) {
    const detected = detectChord(list);
    if (!detected || detected.rootPc == null || detected.symbol == null) return null;
    best = { rootPc: detected.rootPc, symbol: detected.symbol };
  }
  const isSlash = best.rootPc !== bassPc;
  const name = `${pitchName(best.rootPc, { latin })}${best.symbol}${isSlash ? `/${pitchName(bassPc, { latin })}` : ''}`;
  return { rootPc: best.rootPc, symbol: best.symbol, bassPc, isSlash, name, matched };
}
