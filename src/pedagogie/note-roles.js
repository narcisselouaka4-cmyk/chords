// [Claude] — 2026-09-25 — Rôle de chaque note par rapport à un accord.
//
// Sert au clavier qui « montre » (tuto interactif du Copilote, pas à pas,
// « Qu'en penses-tu ? », moments d'une session) : sur Dm9 joué Ré | Fa La Do Mi,
// Ré est la fondamentale (1), Fa la tierce mineure (b3), La la quinte (5), Do la
// septième (b7), Mi la neuvième (9). Les genres (`kind`) donnent la couleur de
// la marque au clavier : fondamentale, notes guides (3ce, 7e : celles qui
// disent la qualité de l'accord), quinte, couleurs (9e, 11e, 13e, altérations),
// basse écrite d'un accord sur basse, note étrangère à l'accord.

import { chordToneIntervals, degreeName } from '../practice-exercise.js';
import { parseChordSymbol } from './chord-parser-v2.js';

const pcOf = (n) => ((n % 12) + 12) % 12;

/**
 * Nom d'accord → fondamentale, qualité (« m9 », « 7alt », « » pour une triade
 * majeure) et basse écrite. `null` si le nom n'est pas un accord.
 * @param {string} name - ex. « Dm9 », « G13 », « C/E », « Bbmaj7#11 »
 * @returns {{name: string, rootPc: number, quality: string, bassPc: number|null}|null}
 */
export function parseChordName(name) {
  const text = String(name || '').trim();
  const match = /^([A-G](?:#|b)?)(.*)$/.exec(text);
  if (!match) return null;
  const parsed = parseChordSymbol(text);
  if (!parsed || parsed.rootPc == null) return null;
  let quality = match[2];
  // Basse écrite (C/E, Dm7/G) : ôtée de la qualité ; « 6/9 » reste une qualité.
  if (parsed.bassPc != null) {
    const slash = quality.lastIndexOf('/');
    if (slash >= 0) quality = quality.slice(0, slash);
  }
  return { name: text, rootPc: parsed.rootPc, quality, bassPc: parsed.bassPc ?? null };
}

const DIMINISHED = /dim|°|^o|ø|m7b5|m7\(b5\)/;
const AUGMENTED = /aug|\+|#5/;

/**
 * Degré lisible d'un intervalle (demi-tons depuis la fondamentale) dans la
 * qualité : « 1 », « b3 », « 3 », « 5 », « b7 », « 9 », « #11 », « 13 »…
 * Précise ce que la table générique ne sait pas : quinte diminuée d'un accord
 * diminué ou demi-diminué, septième diminuée (bb7), quinte augmentée, quarte
 * et seconde des accords suspendus.
 */
export function degreeOf(interval, quality = '') {
  const i = pcOf(interval);
  const q = String(quality || '');
  if (i === 6 && DIMINISHED.test(q)) return 'b5';
  if (i === 9 && /dim7|°7|^o7/.test(q)) return 'bb7';
  if (i === 8 && AUGMENTED.test(q) && !/b13/.test(q)) return '#5';
  if (i === 5 && /sus(?!2)/.test(q)) return '4';
  if (i === 2 && /sus2/.test(q)) return '2';
  return degreeName(i, q);
}

const GUIDE_DEGREES = new Set(['3', 'b3', '7', 'b7', 'bb7', '4', '2']);

/**
 * Genre d'une note pour les marques du clavier.
 * @returns {'root'|'guide'|'fifth'|'color'|'bass'|'outside'}
 */
export function roleKind(degree, { inChord = true, quality = '', isBass = false } = {}) {
  if (degree === '1') return 'root';
  if (!inChord) return isBass ? 'bass' : 'outside';
  if (GUIDE_DEGREES.has(degree)) return 'guide';
  // Sixte d'un accord de sixte : elle tient le rôle de la septième.
  if (degree === '6') return 'guide';
  if (degree === '5') return 'fifth';
  // Quinte diminuée d'un m7b5 / dim, quinte augmentée d'un aug : de structure.
  if ((degree === 'b5' && DIMINISHED.test(quality)) || (degree === '#5' && /aug|\+/.test(quality))) return 'fifth';
  return 'color';
}

/**
 * Tensions disponibles (demi-tons depuis la fondamentale) d'une famille
 * d'accords, même absentes du nom : une 9e sur G7 ou une 11e sur Dm7 ne sont
 * pas des fautes. Majeur : 9, #11, 13 (la 11 juste frotte la tierce) ; mineur :
 * 9, 11, 13 ; dominante : 9, b9, #9, #11, 13, b13 ; demi-diminué : 9, 11, b13 ;
 * diminué : un ton au-dessus de chaque note ; suspendu : b9, 9, 13.
 */
export function availableTensions(quality = '') {
  const q = String(quality || '');
  const tones = chordToneIntervals(q);
  if (/dim7|°7|^o7/.test(q)) return new Set([2, 5, 8, 11]);
  if (/m7b5|ø|m7\(b5\)/.test(q)) return new Set([2, 5, 8]);
  if (/sus/.test(q)) return new Set([1, 2, 9]);
  if (tones.has(4) && tones.has(10)) return new Set([1, 2, 3, 6, 8, 9]);
  if (tones.has(3) && !tones.has(6)) return new Set([2, 5, 9]);
  if (tones.has(4)) return new Set([2, 6, 9]);
  return new Set();
}

/** Libellé français d'un genre (légende du clavier). */
export const ROLE_KIND_LABELS = {
  root: 'Fondamentale',
  guide: '3ce / 7e',
  fifth: 'Quinte',
  color: 'Couleur',
  bass: 'Basse',
  outside: 'Hors accord',
};

/**
 * Rôle de chaque note jouée (ou à jouer) par rapport à l'accord.
 * @param {string|{rootPc: number, quality: string, bassPc?: number|null}} chord - nom (« Dm9 ») ou accord analysé
 * @param {number[]} notes - MIDI
 * `inChord` : note du nom de l'accord (ou sa basse écrite) ; `tension` : note
 * absente du nom mais disponible sur l'accord (9e sur G7) — marquée « couleur ».
 * @returns {{midi: number, pc: number, interval: number, degree: string, kind: string, inChord: boolean, tension: boolean}[]}
 */
export function noteRoles(chord, notes) {
  const c = typeof chord === 'string' ? parseChordName(chord) : chord;
  if (!c || c.rootPc == null) return [];
  const quality = c.quality || '';
  const tones = chordToneIntervals(quality);
  const tensions = availableTensions(quality);
  return [...new Set((notes || []).filter(Number.isFinite))].sort((a, b) => a - b).map((midi) => {
    const interval = pcOf(midi - c.rootPc);
    const isBass = c.bassPc != null && pcOf(midi) === c.bassPc;
    const inChord = tones.has(interval);
    const tension = !inChord && tensions.has(interval);
    const degree = degreeOf(interval, quality);
    const kind = tension && !isBass ? 'color' : roleKind(degree, { inChord, quality, isBass });
    return { midi, pc: pcOf(midi), interval, degree, kind, inChord: inChord || isBass, tension };
  });
}
