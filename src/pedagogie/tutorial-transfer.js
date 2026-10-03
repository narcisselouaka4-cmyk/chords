// [Claude] — 2026-10-03 — Pédagogie IA : appliquer ce que fait le prof à une AUTRE progression.
//
// Narcisse : « Comment est-ce qu'on appliquerait ce qu'il vient de faire dans une
// progression 4-5-3-6-2-5-1 ? ». Ce qu'il veut reprendre : ses voicings, ses
// enchaînements (accords de passage), ses licks / runs / fills — pas son rythme.
//
// Principe : un moteur DÉTERMINISTE relève, dans les notes exactes du prof (lues à
// l'image), ce qu'il fait, et le reconstruit sur chaque accord demandé. Le Copilote
// explique ; il n'invente aucune note (outil apply_tutorial_passage, copilot-client.js).
//
// Voicings — un « gabarit de rôles » par main : sur G13 joué Sol2 | Fa4 Si4 Mi5, la main
// gauche joue la fondamentale, la droite 7 · 3 · 13 (de bas en haut, avec les mêmes
// écarts). Sur un accord cible, chaque rôle prend la note qui tient ce rôle dans CET
// accord (la 7e de Fmaj7 est Mi, celle de G7 est Fa ; une tension absente de la qualité
// prend la plus proche disponible : la 11 d'un accord mineur devient #11 sur un majeur).
// Le gabarit est choisi par famille (le prof a souvent une forme pour le mineur, une
// pour la dominante, une pour le majeur) ; chaque main reste près de l'accord précédent.
//
// Fonctions pures, testées dans test-tutorial-transfer.js.

import { parseChordName, availableTensions, degreeOf } from './note-roles.js';
import { scaleById } from './scales.js';
import { chordToneIntervals } from '../practice-exercise.js';
import { guessHands } from './teacher-notes.js';
import { buildNotesExample, buildChordExample } from './copilot-demo.js';
import { normalizeDegrees } from './tutorial-questions.js';
import { LOW_INTERVAL_LIMITS } from '../voicing-engine/textbook-voicings.js';

const pcOf = (n) => ((n % 12) + 12) % 12;
const DIM7 = /dim7|°7|^o7/;
const HALF_DIM = /m7b5|ø|m7\(b5\)/;
const DIMINISHED = /dim|°|^o|ø|m7b5|m7\(b5\)/;
const AUGMENTED = /aug|\+|#5/;
const FRENCH = ['Do', 'Ré♭', 'Ré', 'Mi♭', 'Mi', 'Fa', 'Fa♯', 'Sol', 'La♭', 'La', 'Si♭', 'Si'];
const FRENCH_SHARPS = ['Do', 'Do♯', 'Ré', 'Ré♯', 'Mi', 'Fa', 'Fa♯', 'Sol', 'Sol♯', 'La', 'La♯', 'Si'];

/** « Mi♭4 » (ou « Ré♯4 » dans une tonalité à dièses) : nom français et octave (Do4 = 60). */
export function noteLabel(midi, { sharps = false } = {}) {
  return `${(sharps ? FRENCH_SHARPS : FRENCH)[pcOf(midi)]}${Math.floor(midi / 12) - 1}`;
}

const FRENCH_LETTERS = { C: 'Do', D: 'Ré', E: 'Mi', F: 'Fa', G: 'Sol', A: 'La', B: 'Si' };
const LETTER_ORDER = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const NATURAL_PCS = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
// Intervalle depuis la fondamentale → lettres au-dessus d'elle : b9 et 9 sur la 2e lettre,
// b3 et 3 sur la 3e, 11 et #11 sur la 4e, 5 sur la 5e, b13 et 13 sur la 6e, b7 et 7 sur la 7e.
const CHORD_LETTER_STEPS = [0, 1, 1, 2, 2, 3, 3, 4, 5, 5, 6, 6];

/**
 * [Claude] — 2026-10-03 — Nom français d'une note dans un accord, sur la lettre de son
 * rôle : Sol♭ (b7) dans Ab7, Ré♯ (3) dans Bmaj7, Si♭♭ évité. Sans orthographe lisible
 * (Mi♯, Do♭, double altération), les dièses ou bémols de la fondamentale de l'accord.
 */
export function spellInChord(midi, chordName, { sharps = false } = {}) {
  const chord = parseChordName(chordName);
  const rootAccidental = /^[A-G]([#b]?)/.exec(String(chord?.name || ''))?.[1] || '';
  const plain = noteLabel(midi, { sharps: rootAccidental === '#' ? true : rootAccidental === 'b' ? false : sharps });
  if (!chord) return plain;
  const letter = chord.name[0];
  const q = chord.quality;
  const interval = pcOf(midi - chord.rootPc);
  let steps = CHORD_LETTER_STEPS[interval];
  if (interval === 3 && chordToneIntervals(q).has(4)) steps = 1; // #9 d'une dominante
  if (interval === 6 && (DIMINISHED.test(q) || /b5/.test(q))) steps = 4; // b5
  if (interval === 8 && AUGMENTED.test(q) && !/b13/.test(q)) steps = 4; // #5
  if (interval === 9 && DIM7.test(q)) steps = 6; // bb7
  const written = LETTER_ORDER[(LETTER_ORDER.indexOf(letter) + steps) % 7];
  const shift = ((pcOf(midi) - NATURAL_PCS[written]) % 12 + 18) % 12 - 6;
  if (Math.abs(shift) > 1 || ['Cb', 'Fb', 'E#', 'B#'].includes(`${written}${shift > 0 ? '#' : shift < 0 ? 'b' : ''}`)) return plain;
  return `${FRENCH_LETTERS[written]}${shift > 0 ? '♯' : shift < 0 ? '♭' : ''}${Math.floor(midi / 12) - 1}`;
}

/** Vrai si la progression s'écrit plutôt en dièses (F#maj7, C#7) qu'en bémols. */
export function prefersSharps(chordNames) {
  let sharps = 0;
  let flats = 0;
  for (const name of chordNames || []) {
    const m = /^[A-G]([#♯b♭]?)/.exec(String(name || '').trim());
    if (!m) continue;
    if (m[1] === '#' || m[1] === '♯') sharps += 1;
    else if (m[1]) flats += 1;
  }
  return sharps > flats;
}

const clock = (t) => {
  const s = Math.max(0, Number(t) || 0);
  return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
};

/** Accord de sixte (6, m6, 6/9) : la sixte y tient la place de la septième. */
function isSixthChord(quality) {
  return /(^|m|maj|M)6/.test(quality) && !/7|11|13/.test(quality);
}

/**
 * Famille d'un accord, pour choisir le gabarit du prof qui lui ressemble.
 * @returns {'dominant'|'major'|'minor'|'halfdim'|'dim'|'sus'|'other'}
 */
export function chordFamily(quality = '') {
  const q = String(quality || '');
  if (/sus/.test(q)) return 'sus';
  if (DIM7.test(q)) return 'dim';
  if (HALF_DIM.test(q)) return 'halfdim';
  const tones = chordToneIntervals(q);
  if (tones.has(4) && tones.has(10)) return 'dominant';
  if (tones.has(3)) return /dim/.test(q) ? 'dim' : 'minor';
  if (tones.has(4)) return 'major';
  return 'other';
}

/** Familles voisines, si le prof n'a pas joué la même. */
const FAMILY_FALLBACK = {
  dominant: ['dominant', 'sus', 'major', 'minor', 'halfdim', 'dim', 'other'],
  major: ['major', 'dominant', 'minor', 'sus', 'halfdim', 'dim', 'other'],
  minor: ['minor', 'halfdim', 'dim', 'major', 'dominant', 'sus', 'other'],
  halfdim: ['halfdim', 'minor', 'dim', 'dominant', 'major', 'sus', 'other'],
  dim: ['dim', 'halfdim', 'minor', 'dominant', 'major', 'sus', 'other'],
  sus: ['sus', 'dominant', 'major', 'minor', 'halfdim', 'dim', 'other'],
  other: ['major', 'dominant', 'minor', 'sus', 'halfdim', 'dim', 'other'],
};

/**
 * Rôle d'un intervalle (demi-tons depuis la fondamentale) dans l'accord du prof :
 * R, 3 (ou ce qui la remplace : sus), 5, 7 (ou la sixte d'un accord de sixte), 9, 11,
 * 13, avec l'intervalle exact (`alt`) pour garder son altération quand c'est possible.
 * @param {number} interval
 * @param {string} quality - qualité de l'accord du prof
 * @param {Set<number>} heard - intervalles joués par le prof sur cet accord
 */
export function roleOfInterval(interval, quality = '', heard = new Set()) {
  const i = pcOf(interval);
  const q = String(quality || '');
  switch (i) {
    case 0: return { role: 'R', alt: 0 };
    case 1: return { role: '9', alt: 1 };
    case 2: return /sus2/.test(q) ? { role: '3', alt: 2 } : { role: '9', alt: 2 };
    case 3: return heard.has(4) || (/#9/.test(q) && !/m/.test(q.replace(/maj/g, ''))) ? { role: '9', alt: 3 } : { role: '3', alt: 3 };
    case 4: return { role: '3', alt: 4 };
    case 5: return /sus(?!2)/.test(q) ? { role: '3', alt: 5 } : { role: '11', alt: 5 };
    case 6: return DIMINISHED.test(q) && !heard.has(7) ? { role: '5', alt: 6 } : { role: '11', alt: 6 };
    case 7: return { role: '5', alt: 7 };
    case 8: return AUGMENTED.test(q) && !heard.has(7) ? { role: '5', alt: 8 } : { role: '13', alt: 8 };
    case 9: return DIM7.test(q) || isSixthChord(q) ? { role: '7', alt: 9 } : { role: '13', alt: 9 };
    case 10: return { role: '7', alt: 10 };
    default: return { role: '7', alt: 11 };
  }
}

/** Nom d'un rôle tel qu'on le lit (« 1 », « b3 », « 7 », « #9 », « bb7 » d'un diminué…). */
export function roleLabel({ role, alt }, quality = '') {
  if (role === '7' && alt === 9 && DIM7.test(String(quality))) return 'bb7';
  const names = {
    R: { 0: '1' },
    3: { 2: '2', 3: 'b3', 4: '3', 5: '4' },
    5: { 6: 'b5', 7: '5', 8: '#5' },
    7: { 9: '6', 10: 'b7', 11: '7' },
    9: { 1: 'b9', 2: '9', 3: '#9' },
    11: { 5: '11', 6: '#11' },
    13: { 8: 'b13', 9: '13' },
  };
  return names[role]?.[alt] || role;
}

/**
 * L'intervalle qui tient ce rôle dans l'accord cible ; null si l'accord n'en a pas
 * (une septième sur une triade) : l'appelant prend alors un repli.
 */
export function intervalForRole({ role, alt }, quality = '') {
  const q = String(quality || '');
  const tones = chordToneIntervals(q);
  const usable = new Set([...tones, ...availableTensions(q)]);
  switch (role) {
    case 'R': return 0;
    case '3':
      if (/sus2/.test(q)) return 2;
      if (/sus/.test(q)) return 5;
      if (tones.has(3) && !tones.has(4)) return 3;
      return 4;
    case '5':
      if (tones.has(6) && DIMINISHED.test(q)) return 6;
      if (tones.has(8) && AUGMENTED.test(q)) return 8;
      return 7;
    case '7':
      if (tones.has(10)) return 10;
      if (tones.has(11)) return 11;
      if (tones.has(9) && (DIM7.test(q) || isSixthChord(q))) return 9;
      return null;
    case '9':
      for (const c of [alt, 2, 1, 3]) if (usable.has(c)) return c;
      return null;
    case '11':
      for (const c of [alt, alt === 5 ? 6 : 5]) if (usable.has(c)) return c;
      return null;
    case '13':
      for (const c of [alt, alt === 9 ? 8 : 9]) if (usable.has(c)) return c;
      return null;
    default: return null;
  }
}

/** Rôle de repli quand l'accord cible n'a pas le rôle demandé. */
const ROLE_FALLBACK = { 7: 'R', 9: '5', 11: '5', 13: '5' };

/** Groupe les attaques proches (accord plaqué ou légèrement roulé). */
function attackClusters(notes, gap = 0.08) {
  const sorted = [...notes].sort((a, b) => a.start - b.start);
  const clusters = [];
  for (const n of sorted) {
    const last = clusters[clusters.length - 1];
    if (last && n.start - last[last.length - 1].start <= gap) last.push(n);
    else clusters.push([n]);
  }
  return clusters;
}

/**
 * Les voicings du prof dans un passage : pour chaque accord de la grille, les notes de
 * son attaque principale (et la basse encore tenue), main par main, avec le rôle de
 * chaque note et l'écart à la note du dessous.
 * @param {{midi: number, start: number, end: number, hand?: string}[]} notes - notes du prof
 * @param {{start: number, end: number, label: string}[]} chords - grille relevée
 * @param {{start: number, end: number}} window - le passage
 * @returns {object[]} gabarits (voir applyVoicings)
 */
export function voicingShapes(notes, chords, { start, end }) {
  const shapes = [];
  const from = Number(start) || 0;
  const to = Number.isFinite(end) ? end : Infinity;
  const all = (notes || []).filter((n) => Number.isFinite(n?.midi) && Number.isFinite(n?.start));
  for (const c of chords || []) {
    if (!Number.isFinite(c?.start) || !(c.start < to && (c.end ?? c.start) > from)) continue;
    const chord = parseChordName(c.label || c.name);
    if (!chord) continue;
    const segEnd = Math.min(Number.isFinite(c.end) ? c.end : to, to);
    const attacked = all.filter((n) => n.start >= Math.max(from, c.start) - 0.15 && n.start < segEnd);
    if (!attacked.length) continue;
    // L'attaque principale : le plus grand groupe de notes attaquées ensemble.
    const main = attackClusters(attacked).sort((a, b) => b.length - a.length || a[0].start - b[0].start)[0];
    const at = main[0].start;
    // Plus les notes encore tenues qui appartiennent à l'accord (la basse posée juste
    // avant, une note commune gardée) ; un reste de l'accord précédent est écarté.
    const fits = new Set([...chordToneIntervals(chord.quality), ...availableTensions(chord.quality)]);
    const held = all.filter((n) => !main.includes(n) && n.start < at && (n.end ?? n.start) > at + 0.05
      && (fits.has(pcOf(n.midi - chord.rootPc)) || (chord.bassPc != null && pcOf(n.midi) === chord.bassPc)));
    const unique = [];
    for (const n of guessHands([...main, ...held]).sort((a, b) => a.midi - b.midi)) if (!unique.some((u) => u.midi === n.midi)) unique.push(n);
    if (new Set(unique.map((n) => pcOf(n.midi))).size < 3) continue;
    const heard = new Set(unique.map((n) => pcOf(n.midi - chord.rootPc)));
    const hands = { lh: [], rh: [] };
    for (const n of unique) {
      const side = n.hand === 'lh' ? 'lh' : 'rh';
      const list = hands[side];
      const role = roleOfInterval(n.midi - chord.rootPc, chord.quality, heard);
      list.push({ midi: n.midi, ...role, gap: list.length ? n.midi - list[list.length - 1].midi : 0 });
    }
    shapes.push({
      label: c.label || c.name,
      time: at,
      rootPc: chord.rootPc,
      quality: chord.quality,
      family: chordFamily(chord.quality),
      hands,
    });
  }
  return shapes;
}

/** Description d'un gabarit : « main gauche 1 · b7 | main droite 3 · 13 · 9 ». */
export function describeShape(shape) {
  const part = (list) => list.map((slot) => roleLabel(slot, shape.quality)).join(' · ') || '—';
  return `main gauche ${part(shape.hands.lh)} | main droite ${part(shape.hands.rh)}`;
}

/** Le gabarit à employer pour une famille d'accord. */
function pickShape(shapes, family) {
  for (const f of FAMILY_FALLBACK[family] || FAMILY_FALLBACK.other) {
    const found = shapes.find((s) => s.family === f);
    if (found) return found;
  }
  return shapes[0] || null;
}

/**
 * Registre d'une main : une quinte de part et d'autre de la note du bas jouée par le
 * prof. Chaque main reste là où il l'a posée ; sans cette borne, enchaîner au plus
 * près sur un cycle de quartes (4-5-3-6-2-5-1) faisait monter les mains d'accord en
 * accord jusqu'à l'aigu.
 */
const REGISTER_SPAN = 7;
// Dessus de main droite : pas au-dessus de Sol5 (règle des voicings de l'application,
// practice-exercise.js), sauf si le prof lui-même joue plus haut ; main gauche : pas
// au-dessus de Ré4.
const TOP_CEILING = { rh: 79, lh: 62 };

/**
 * La forme d'une main sur l'accord cible, au gabarit du prof : la classe de la note
 * du bas et les écarts des notes suivantes (ceux du prof, au plus près).
 * `bassPc` : basse écrite de l'accord cible (G7/B), prise par la note du bas.
 * @returns {{firstPc: number, offsets: number[]}}
 */
function handShape(slots, chord, bassPc = null) {
  const offsets = [];
  let firstPc = null;
  let prev = 0;
  for (const slot of slots) {
    let iv = intervalForRole(slot, chord.quality);
    if (iv === null) iv = intervalForRole({ role: ROLE_FALLBACK[slot.role] || 'R', alt: 0 }, chord.quality) ?? 0;
    const pc = firstPc === null && bassPc != null ? bassPc : pcOf(chord.rootPc + iv);
    if (firstPc === null) {
      firstPc = pc;
      offsets.push(0);
      continue;
    }
    let d0 = pcOf(pc - (firstPc + prev));
    if (d0 === 0) d0 = 12;
    const candidates = [d0, d0 + 12, d0 + 24];
    const step = candidates.reduce((best, d) => (Math.abs(d - slot.gap) < Math.abs(best - slot.gap) ? d : best), candidates[0]);
    prev += step;
    offsets.push(prev);
  }
  return { firstPc, offsets };
}

/**
 * Boue dans le grave : de combien de demi-tons les intervalles entre voix voisines
 * passent sous leur limite grave (Levine, textbook-voicings.js). Do2 Si2 : 5 ; Sol1 Fa2 : 10.
 */
function muddiness(notes) {
  const sorted = [...notes].sort((a, b) => a - b);
  let total = 0;
  for (let i = 1; i < sorted.length; i += 1) {
    const limit = LOW_INTERVAL_LIMITS[sorted[i] - sorted[i - 1]];
    if (limit != null && sorted[i - 1] < limit) total += limit - sorted[i - 1];
  }
  return total;
}

/**
 * L'octave d'une main : la note du bas dans le registre du prof ; d'abord sans dépasser
 * le plafond, sans être plus boueuse dans le grave que la main du prof (`sourceMud`), ni
 * passer sous la main gauche (pour la droite) ; puis au plus près de l'accord précédent,
 * puis du registre du prof, puis au plus grave. Une octave de plus de chaque côté si le
 * registre du prof ne suffit pas.
 * @param {{firstPc: number, offsets: number[]}} shape
 * @param {{source: number, ceiling: number, anchor: number, above?: number, sourceMud?: number}} options
 * @returns {number[]}
 */
function placeHand({ firstPc, offsets }, { source, ceiling, anchor, above = -Infinity, sourceMud = 0 }) {
  const span = offsets[offsets.length - 1] || 0;
  let best = null;
  const better = (a, b) => {
    for (let k = 0; k < a.length; k += 1) if (a[k] !== b[k]) return a[k] < b[k];
    return false;
  };
  const consider = (lo, hi) => {
    for (let first = Math.max(21, lo); first <= Math.min(108 - span, hi); first += 1) {
      if (pcOf(first) !== firstPc) continue;
      const notes = offsets.map((o) => first + o);
      const excess = Math.max(0, first + span - ceiling) + Math.max(0, muddiness(notes) - sourceMud) + (first <= above ? 24 : 0);
      const score = [excess, Math.abs(first - anchor), Math.abs(first - source), first];
      if (!best || better(score, best.score)) best = { first, score };
    }
  };
  consider(source - REGISTER_SPAN, source + REGISTER_SPAN);
  if (best && best.score[0] > 0) {
    consider(source - REGISTER_SPAN - 12, source - REGISTER_SPAN - 1);
    consider(source + REGISTER_SPAN + 1, source + REGISTER_SPAN + 12);
  }
  return best ? offsets.map((o) => best.first + o) : [];
}

/**
 * Les voicings du prof posés sur une progression : chaque accord cible prend le
 * gabarit de sa famille ; chaque main reste dans le registre où le prof l'a jouée,
 * au plus près de l'accord précédent ; la main droite reste au-dessus de la gauche.
 * @param {object[]} shapes - voicingShapes()
 * @param {(string|{name: string, prefer?: string})[]} targets - accords cibles (« Fmaj7 »,
 *   « G7 »…) ; un objet garde ses champs (durée, accord de passage) dans le résultat ;
 *   `prefer` : l'accord du prof dont prendre la forme (un accord de passage garde la sienne)
 * @param {{exclude?: Set<string>}} [options] - formes à ne prendre qu'en dernier recours
 *   (celles de ses accords de passage, pour les accords principaux)
 * @returns {{name: string, leftHand: number[], rightHand: number[], from: string}[]}
 */
export function applyVoicings(shapes, targets, { exclude = new Set() } = {}) {
  if (!shapes?.length) return [];
  const result = [];
  const prevLow = { lh: null, rh: null };
  const mainShapes = shapes.filter((sh) => !exclude.has(sh.label));
  for (const target of targets || []) {
    const item = typeof target === 'string' ? { name: target } : (target || {});
    const chord = parseChordName(item.name);
    if (!chord) continue;
    const family = chordFamily(chord.quality);
    const preferred = item.prefer ? shapes.find((sh) => sh.label === item.prefer) : null;
    const shape = preferred || pickShape(mainShapes.length ? mainShapes : shapes, family);
    if (!shape) continue;
    const hands = { lh: [], rh: [] };
    for (const side of ['lh', 'rh']) {
      const slots = shape.hands[side];
      if (!slots.length) continue;
      const source = slots[0].midi;
      const sourceTop = slots[slots.length - 1].midi;
      // La basse écrite revient à la main gauche (à la droite si le prof joue seul).
      const takesBass = side === 'lh' || !shape.hands.lh.length;
      hands[side] = placeHand(handShape(slots, chord, takesBass ? chord.bassPc : null), {
        source,
        ceiling: Math.max(TOP_CEILING[side], sourceTop),
        anchor: prevLow[side] ?? source,
        above: side === 'rh' && hands.lh.length ? Math.max(...hands.lh) : -Infinity,
        sourceMud: muddiness(slots.map((slot) => slot.midi)),
      });
    }
    if (hands.lh.length) prevLow.lh = hands.lh[0];
    if (hands.rh.length) prevLow.rh = hands.rh[0];
    result.push({ ...item, name: chord.name, leftHand: hands.lh, rightHand: hands.rh, from: shape.label });
  }
  return result;
}

/**
 * Les accords réalisés en exemple à écouter (plaqués, un accord toutes les
 * `seconds` secondes, ou la durée propre de l'accord : `c.seconds`), avec leurs mains
 * pour la carte du Copilote.
 */
export function chordsExample(realized, { title = '', subtitle = '', seconds = 1.6 } = {}) {
  const notes = [];
  let at = 0;
  realized.forEach((c) => {
    const length = Number.isFinite(c.seconds) && c.seconds > 0 ? c.seconds : seconds;
    for (const [list, hand] of [[c.leftHand, 'LH'], [c.rightHand, 'RH']]) {
      for (const midi of list) {
        notes.push({ midi, startOffsetMs: Math.round(at * 1000), durationMs: Math.round(length * 920), velocity: 0.72, hand });
      }
    }
    at += length;
  });
  const example = buildNotesExample(notes, { kind: 'tutorial-transfer', title, subtitle });
  if (example) example.chords = realized.map((c) => ({ name: c.name, leftHand: c.leftHand, rightHand: c.rightHand }));
  return example;
}

/** Ligne de texte d'un accord réalisé : « **Fmaj7** : main gauche Fa2 Mi3 · main droite La3 Ré4 Sol4 ». */
export function realizedLine(c, { sharps = false } = {}) {
  const name = (m) => spellInChord(m, c.name, { sharps });
  const parts = [];
  if (c.leftHand.length) parts.push(`main gauche ${c.leftHand.map(name).join(' ')}`);
  if (c.rightHand.length) parts.push(`main droite ${c.rightHand.map(name).join(' ')}`);
  return c.passing ? `- _${c.name}_ (passage) : ${parts.join(' · ')}` : `- **${c.name}** : ${parts.join(' · ')}`;
}

// ── Progressions données en degrés ─────────────────────────────────────────────

const SHARP_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const FLAT_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
// Tonalités qui s'écrivent avec des bémols (majeures, puis mineures).
const FLAT_MAJOR = new Set([5, 10, 3, 8, 1, 6]);
const FLAT_MINOR = new Set([2, 7, 0, 5, 10, 3]);
const SCALES = {
  major: { steps: [0, 2, 4, 5, 7, 9, 11], sevenths: ['maj7', 'm7', 'm7', 'maj7', '7', 'm7', 'm7b5'] },
  // Mineur : la gamme naturelle, avec la dominante (V7) de l'harmonique, comme en jazz.
  minor: { steps: [0, 2, 3, 5, 7, 8, 10], sevenths: ['m7', 'm7b5', 'maj7', 'm7', '7', 'maj7', '7'] },
};
const FRENCH_ROOTS = [['do', 0], ['ré', 2], ['re', 2], ['mi', 4], ['fa', 5], ['sol', 7], ['la', 9], ['si', 11]];

/**
 * Tonalité lue dans « C », « F# », « Bb », « Am », « A minor », « Fa♯ », « Sol mineur ».
 * @returns {{rootPc: number, minor: boolean, flats: boolean}|null}
 */
export function parseKey(keyText) {
  const raw = String(keyText || '').trim().replace(/♯/g, '#').replace(/♭/g, 'b');
  if (!raw) return null;
  let rootPc = null;
  let rest = '';
  // Le nom français d'abord : « Do », « Fa » commencent comme D et F.
  const fr = /^(do|ré|re|mi|fa|sol|la|si)(?![ac-zé])/i.exec(raw);
  const en = fr ? null : /^([A-G])([#b]?)(.*)$/.exec(raw);
  if (fr) {
    const after = raw.slice(fr[0].length);
    const acc = /^\s*(#|b(?![a-z])|dièse|diese|bémol|bemol)/i.exec(after);
    const shift = !acc ? 0 : /#|di/i.test(acc[1]) ? 1 : -1;
    rootPc = pcOf(FRENCH_ROOTS.find(([name]) => name === fr[1].toLowerCase())[1] + shift);
    rest = acc ? after.slice(acc[0].length) : after;
  } else if (en) {
    rootPc = pcOf('C D EF G A B'.indexOf(en[1]) + (en[2] === '#' ? 1 : en[2] === 'b' ? -1 : 0));
    rest = en[3];
  } else {
    return null;
  }
  const minor = /^\s*(m(?!aj)|min|mineur|minor)/i.test(rest);
  const written = /#|dièse|diese/i.test(raw) ? false : (en?.[2] === 'b' || /^\s*(b(?![a-z])|bémol|bemol)/i.test(fr ? raw.slice(fr[0].length) : '')) ? true : null;
  const flats = written ?? (minor ? FLAT_MINOR : FLAT_MAJOR).has(rootPc);
  return { rootPc, minor, flats };
}

/**
 * « 4-5-3-6-2-5-1 » (ou « IV-V-iii-vi-ii-V-I ») en Do → Fmaj7 G7 Em7 Am7 Dm7 G7 Cmaj7 : les accords à quatre sons
 * diatoniques de la tonalité (en mineur : gamme naturelle, V7 de l'harmonique).
 * null si le texte n'est pas une suite de degrés.
 * @param {string} degreesText
 * @param {string} keyText - « C », « F# », « Bb », « Am », « Fa♯ »…
 * @returns {string[]|null}
 */
export function progressionFromDegrees(degreesText, keyText = 'C') {
  // « 4-5-1 », « 4 - 5 - 1 » ou « IV-V-I ».
  const text = normalizeDegrees(String(degreesText || '').trim());
  if (!text || !/^[1-7](-[1-7])+$/.test(text)) return null;
  const key = parseKey(keyText) || { rootPc: 0, minor: false, flats: false };
  const scale = key.minor ? SCALES.minor : SCALES.major;
  const names = key.flats ? FLAT_NAMES : SHARP_NAMES;
  return text.split('-').map((d) => {
    const step = Number(d.trim()) - 1;
    return `${names[pcOf(key.rootPc + scale.steps[step])]}${scale.sevenths[step]}`;
  });
}

// ── Enchaînements : les accords de passage du prof ─────────────────────────────
// [Claude] — 2026-10-03 — Lot 3. Entre deux accords principaux, chaque accord de
// passage du prof est décrit par rapport à l'accord qui le SUIT (l'accord d'arrivée) :
// C#dim7 avant Dm7 = diminué un demi-ton sous l'arrivée ; Db7 avant Cmaj7 = dominante
// un demi-ton au-dessus (substitution tritonique) ; Em7b5 A7 avant Dm7 = II-V de
// l'arrivée ; C/E avant F = la basse qui monte vers l'arrivée. La même relation est
// glissée devant les accords de la progression demandée, avec sa durée relative, et
// le tout est joué avec ses voicings (gabarits ci-dessus). Les garde-fous sont ceux
// des accords de passage des Exercices (planPassingChord, practice-exercise.js).

const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const LETTER_PCS = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
// Demi-tons au-dessus de l'arrivée → lettres au-dessus : Db sur C, C# sous D (sensible),
// G sur C (dominante), Bb sous C…
const LETTER_STEPS = [0, 1, 1, 2, 2, 3, 3, 4, 5, 5, 6, 6];

/** Fondamentale à `interval` demi-tons au-dessus de l'arrivée, écrite sur la bonne lettre (C#dim7 avant Dm7, Db7 avant C). */
function spellFromArrival(arrival, interval, sharps = false) {
  const pc = pcOf(arrival.rootPc + interval);
  const fallback = (sharps ? SHARP_NAMES : FLAT_NAMES)[pc];
  const letter = /^([A-G])/.exec(String(arrival.name || ''))?.[1];
  if (!letter) return fallback;
  const written = LETTERS[(LETTERS.indexOf(letter) + LETTER_STEPS[pcOf(interval)]) % 7];
  const shift = ((pc - LETTER_PCS[written]) % 12 + 18) % 12 - 6;
  if (Math.abs(shift) > 1) return fallback;
  const name = `${written}${shift > 0 ? '#' : shift < 0 ? 'b' : ''}`;
  return ['Cb', 'Fb', 'E#', 'B#'].includes(name) ? fallback : name;
}

const DIATONIC_FAMILIES = {
  major: ['major', 'minor', 'minor', 'major', 'dominant', 'minor', 'halfdim'],
  minor: ['minor', 'halfdim', 'major', 'minor', 'dominant', 'major', 'dominant'],
};

/** Degré (0 à 6) d'une fondamentale dans la tonalité ; -1 hors de la gamme. */
function degreeInKey(key, rootPc) {
  return (key.minor ? SCALES.minor : SCALES.major).steps.indexOf(pcOf(rootPc - key.rootPc));
}

/** Vrai si l'accord appartient à la tonalité : fondamentale de la gamme, famille de son degré. */
function isDiatonic(key, rootPc, family, quality = '') {
  if (!key) return false;
  const d = degreeInKey(key, rootPc);
  if (d < 0) return false;
  const want = DIATONIC_FAMILIES[key.minor ? 'minor' : 'major'][d];
  if (family === want) return true;
  // Triades : Sol sur le V, Si diminué (sans la 7e diminuée) sur le VII.
  if (want === 'dominant' && family === 'major' && !chordToneIntervals(quality).has(11)) return true;
  return want === 'halfdim' && family === 'dim' && !DIM7.test(String(quality));
}

const INTERVAL_WORDS = {
  0: 'sur la même fondamentale', 1: 'un demi-ton au-dessus', 2: 'un ton au-dessus', 3: 'une tierce mineure au-dessus',
  4: 'une tierce majeure au-dessus', 5: 'une quarte au-dessus', 6: 'à un triton', 7: 'une quinte au-dessus',
  8: 'une tierce majeure en dessous', 9: 'une tierce mineure en dessous', 10: 'un ton en dessous', 11: 'un demi-ton en dessous',
};
const FAMILY_WORDS = {
  major: 'accord majeur', minor: 'accord mineur', dominant: 'dominante', halfdim: 'demi-diminué', dim: 'diminué', sus: 'accord suspendu', other: 'accord',
};

/**
 * Ce que fait un accord de passage par rapport à l'accord d'arrivée, en mots.
 * @param {{interval: number, family: string, bassInterval?: number|null}} step
 * @param {string} arrivalFamily
 * @param {{chainLength?: number, index?: number}} [position] - place dans une suite de passages
 */
export function relationLabel(step, arrivalFamily, { chainLength = 1, index = 0 } = {}) {
  const { interval, family, bassInterval = null } = step;
  if (bassInterval != null && bassInterval !== interval && [1, 2, 10, 11].includes(bassInterval)) {
    return `${FAMILY_WORDS[family] || 'accord'} avec la basse ${INTERVAL_WORDS[bassInterval]} de l'arrivée (la basse marche vers elle)`;
  }
  if (family === 'dim') {
    if (interval === 11) return 'diminué un demi-ton sous l\'accord d\'arrivée (sur sa sensible)';
    if (interval === 1) return 'diminué un demi-ton au-dessus de l\'arrivée (en descendant)';
    if (interval === 0) return 'diminué sur la fondamentale de l\'arrivée (note commune)';
  }
  if (family === 'dominant' || family === 'sus') {
    if (interval === 7) return chainLength > 1 && index > 0 ? 'V du II-V de l\'accord d\'arrivée' : 'dominante de l\'accord d\'arrivée';
    if (interval === 1) return 'dominante un demi-ton au-dessus de l\'arrivée (substitution tritonique)';
    if (interval === 10) return 'dominante un ton sous l\'arrivée (« backdoor »)';
    if (interval === 11) return 'dominante un demi-ton sous l\'arrivée';
  }
  if ((family === 'minor' || family === 'halfdim') && interval === 2 && chainLength > 1 && index === 0) return 'II du II-V de l\'accord d\'arrivée';
  if (family === 'minor' && interval === 5 && arrivalFamily === 'major') return 'IV mineur avant l\'arrivée (cadence plagale mineure)';
  if (family === arrivalFamily && (interval === 1 || interval === 11)) return `même accord ${INTERVAL_WORDS[interval]} (glissement chromatique)`;
  return `${FAMILY_WORDS[family] || 'accord'} ${INTERVAL_WORDS[interval]} de l'arrivée`;
}

/** Relation connue, qui fait d'un accord hors tonalité un accord de passage même s'il dure. */
function knownRelation(c, next) {
  const interval = pcOf(c.rootPc - next.rootPc);
  if (c.family === 'dim') return [11, 1, 0].includes(interval);
  if (c.family === 'dominant' || c.family === 'sus') return [7, 1, 10, 11].includes(interval);
  if (c.family === 'minor' && interval === 5 && next.family === 'major') return true;
  return c.family === next.family && (interval === 1 || interval === 11);
}

/**
 * Les enchaînements du prof : la grille du passage et, entre deux accords principaux,
 * ses accords de passage, chacun décrit par rapport à l'accord qui le suit.
 * Un accord est « de passage » s'il mène à un autre accord et qu'il est bref (au plus
 * 60 % de l'accord suivant ou du précédent), ou hors de la tonalité dans une relation
 * connue (diminué sur la sensible, dominante, substitution tritonique, IV mineur…).
 * @param {{start: number, end: number, label: string}[]} chords - grille relevée
 * @param {{start: number, end: number, key?: string|null}} window - passage, tonalité du tuto
 * @returns {{chords: object[], moves: {from: object|null, to: object, motion: number|null, time: number, chain: object[]}[]}}
 */
export function passingMoves(chords, { start = 0, end = Infinity, key = null } = {}) {
  const teacherKey = key ? parseKey(key) : null;
  // Toute la grille (l'accord d'arrivée peut tomber juste après le passage), sans doublons.
  const all = [];
  for (const c of [...(chords || [])].filter((x) => Number.isFinite(x?.start)).sort((a, b) => a.start - b.start)) {
    const parsed = parseChordName(c.label || c.name);
    if (!parsed) continue;
    const last = all[all.length - 1];
    if (last && last.name === parsed.name) {
      last.end = Math.max(last.end, Number.isFinite(c.end) ? c.end : c.start);
      continue;
    }
    all.push({ ...parsed, start: c.start, end: Number.isFinite(c.end) ? c.end : c.start, family: chordFamily(parsed.quality) });
  }
  // Durée d'un accord : jusqu'à l'accord suivant (son rythme harmonique).
  all.forEach((c, i) => { c.dur = Math.max(0.05, (all[i + 1] ? all[i + 1].start : c.end) - c.start); });
  const inWindow = (c) => c.start < end && c.start + c.dur > start;
  const passing = all.map((c, i) => {
    const next = all[i + 1];
    const prev = all[i - 1];
    if (!next || !inWindow(c)) return false;
    if (pcOf(c.rootPc - next.rootPc) === 0 && c.family === next.family) return false;
    const short = c.dur <= 0.6 * next.dur || Boolean(prev && c.dur <= 0.6 * prev.dur);
    const outside = teacherKey ? !isDiatonic(teacherKey, c.rootPc, c.family, c.quality) : false;
    return short || (outside && knownRelation(c, next));
  });
  const moves = [];
  for (let i = 0; i < all.length; i += 1) {
    if (!passing[i] || (i > 0 && passing[i - 1])) continue;
    let j = i;
    while (passing[j + 1]) j += 1;
    const to = all[j + 1];
    if (!to) continue;
    const from = i > 0 ? all[i - 1] : null;
    const run = all.slice(i, j + 1);
    const base = (from ? from.dur : to.dur) + run.reduce((sum, c) => sum + c.dur, 0);
    const chain = run.map((c, k) => {
      const step = {
        name: c.name,
        quality: c.quality,
        family: c.family,
        interval: pcOf(c.rootPc - to.rootPc),
        bassInterval: c.bassPc != null ? pcOf(c.bassPc - to.rootPc) : null,
        share: c.dur / base,
        time: c.start,
      };
      step.relation = relationLabel(step, to.family, { chainLength: run.length, index: k });
      return step;
    });
    moves.push({
      from: from ? { name: from.name, rootPc: from.rootPc, family: from.family } : null,
      to: { name: to.name, rootPc: to.rootPc, family: to.family },
      motion: from ? pcOf(to.rootPc - from.rootPc) : null,
      time: run[0].start,
      chain,
    });
  }
  return { chords: all.filter(inWindow), moves };
}

/**
 * Les accords de passage à glisser entre `prev` et `target` : ceux que le prof met devant
 * le même genre d'accord, arrivant par le même mouvement de basse si possible, avec la
 * même qualité à la même distance de l'arrivée ; null si aucun ne convient (même
 * fondamentale, basse au demi-ton, doublon de l'accord précédent, diminué après la
 * dominante qui mène déjà à l'accord).
 */
function chainBefore(moves, prev, target, { sharps = false, anywhere = false } = {}) {
  const motion = pcOf(target.rootPc - prev.rootPc);
  if (motion === 0) return null;
  const family = chordFamily(target.quality);
  const order = FAMILY_FALLBACK[family] || FAMILY_FALLBACK.other;
  const rank = (m) => {
    if (m.to.family === family && m.motion === motion) return 0;
    if (m.to.family === family) return 1;
    if (m.motion === motion) return 2;
    const f = order.indexOf(m.to.family);
    return 3 + (f < 0 ? order.length : f);
  };
  const move = [...moves].sort((a, b) => rank(a) - rank(b) || a.time - b.time)[0];
  if (!move) return null;
  // Là où il s'en sert : devant le même genre d'accord, ou par le même mouvement de basse.
  if (!anywhere && rank(move) > 2) return null;
  // Basse qui avance d'un demi-ton : pas de passage, sauf si le prof en mettait un là.
  if ((motion === 1 || motion === 11) && move.motion !== motion) return null;
  const steps = move.chain.map((step) => {
    const rootPc = pcOf(target.rootPc + step.interval);
    const { quality } = step;
    const bass = step.bassInterval != null ? `/${spellFromArrival(target, step.bassInterval, sharps)}` : '';
    return {
      name: `${spellFromArrival(target, step.interval, sharps)}${quality}${bass}`,
      rootPc,
      family: chordFamily(quality),
      passing: true,
      share: step.share,
      relation: step.relation,
      teacher: step.name,
      prefer: step.name,
    };
  });
  const prevFamily = chordFamily(prev.quality);
  if (steps.some((st) => st.rootPc === prev.rootPc && st.family === prevFamily)) return null;
  if (steps[0].family === 'dim' && pcOf(prev.rootPc - target.rootPc) === 7 && prevFamily === 'dominant') return null;
  return steps;
}

/** Durée d'un accord principal suivi de passages dans l'exemple (secondes). */
const PASSING_SLOT = 2;

/**
 * La progression demandée avec les accords de passage du prof, là où il s'en sert :
 * devant le même genre d'accord que dans la vidéo, ou quand la basse fait le même
 * mouvement (sa substitution tritonique de V → I va sur chaque quinte descendante, son
 * diminué sur la sensible devant chaque accord mineur). Si la progression n'en offre
 * aucune place, devant chaque accord (`everywhere`). Chaque passage prend sur l'accord
 * qui le précède la part qu'il avait chez le prof.
 * @param {object[]} moves - passingMoves().moves
 * @param {string[]} targets - accords de la progression
 * @param {{sharps?: boolean}} [options] - noms en dièses (sinon en bémols, hors lettre évidente)
 * @returns {{sequence: {name: string, passing: boolean, seconds: number, relation?: string, teacher?: string}[], everywhere: boolean}}
 */
export function applyPassingMoves(moves, targets, { sharps = false } = {}) {
  const parsed = (targets || []).map((t) => parseChordName(t)).filter(Boolean);
  const build = (anywhere) => {
    const list = [];
    parsed.forEach((t, i) => {
      const chain = i > 0 && moves?.length ? chainBefore(moves, parsed[i - 1], t, { sharps, anywhere }) : null;
      if (chain) list.push(...chain);
      list.push({ name: t.name, passing: false });
    });
    return list;
  };
  let sequence = build(false);
  let everywhere = false;
  if (!sequence.some((c) => c.passing)) {
    const loose = build(true);
    if (loose.some((c) => c.passing)) { sequence = loose; everywhere = true; }
  }
  // Durées : un passage prend sur l'accord principal qui le précède (60 % au plus).
  for (let i = 0; i < sequence.length; i += 1) {
    if (sequence[i].passing) continue;
    let j = i + 1;
    let shares = 0;
    while (sequence[j]?.passing) { shares += sequence[j].share; j += 1; }
    const total = Math.min(0.6, shares);
    sequence[i].seconds = Math.round(PASSING_SLOT * (1 - total) * 100) / 100;
    for (let k = i + 1; k < j; k += 1) {
      sequence[k].seconds = Math.max(0.35, Math.round(PASSING_SLOT * sequence[k].share * (total / shares) * 100) / 100);
    }
  }
  return { sequence, everywhere };
}

// ── Licks, runs et fills : la ligne du prof, note par note ──────────────────────
// [Claude] — 2026-10-03 — Lot 4. Chaque note de sa ligne est décrite par rapport à
// l'accord qui sonne dessous : note de l'accord ou tension (son rôle : 3, b7, 9…), note
// de la gamme de l'accord (son rang : dorien sur m7, mixolydien sur 7…) ou note
// chromatique (son écart avec la note qui suit : approche par en dessous, par
// au-dessus). Sur un accord cible, chaque rôle prend l'équivalent (3 → b3 sur un mineur,
// 7 → b7 sur une dominante), chaque note de gamme le même rang dans la gamme de l'accord
// cible ; le contour (montées, descentes, sauts) et le rythme du prof sont gardés.

const EXTRA_SCALES = { 'mixolydian-b13': [0, 2, 4, 5, 7, 8, 10] };

/**
 * Gamme d'un accord (« chord scale ») : ionien sur maj7, lydien sur maj7#11, dorien sur
 * m7, mineur mélodique sur m(maj7), mixolydien sur 7, altérée sur 7alt, diminuée
 * demi-ton / ton sur 7b9, locrien sur m7b5, diminuée ton / demi-ton sur dim7.
 * @returns {{id: string, intervals: number[]}}
 */
export function chordScale(quality = '') {
  const q = String(quality || '');
  const family = chordFamily(q);
  let id = 'major';
  if (family === 'dim') id = DIM7.test(q) ? 'diminished-wh' : 'locrian';
  else if (family === 'halfdim') id = 'locrian';
  else if (family === 'sus') id = 'mixolydian';
  else if (family === 'dominant') {
    if (/alt|#5|\+|aug/.test(q) || (/#9/.test(q) && /b13/.test(q))) id = 'altered';
    else if (/b9|#9/.test(q)) id = 'diminished-hw';
    else if (/#11/.test(q)) id = 'lydian-dominant';
    else if (/b13/.test(q)) id = 'mixolydian-b13';
    else id = 'mixolydian';
  } else if (family === 'minor') id = /maj7|M7/.test(q) ? 'melodic-minor' : /b6|b13/.test(q) ? 'aeolian' : 'dorian';
  else if (family === 'major') id = /#11|#4/.test(q) ? 'lydian' : AUGMENTED.test(q) ? 'whole-tone' : 'major';
  return { id, intervals: EXTRA_SCALES[id] || scaleById(id)?.intervals || [0, 2, 4, 5, 7, 9, 11] };
}

/** L'accord de la grille qui sonne à l'instant t (le dernier commencé). */
function chordAt(grid, t) {
  let found = null;
  for (const c of grid) if (c.start <= t + 0.05) found = c;
  return found;
}

/**
 * Ce qu'est une note de la ligne pour l'accord qui sonne dessous.
 * @returns {{kind: 'role'|'scale'|'chromatic', interval: number, role?: string, alt?: number, degree?: number, size?: number}}
 */
export function lickNoteRole(midi, chord) {
  const interval = pcOf(midi - chord.rootPc);
  const tones = chordToneIntervals(chord.quality);
  if (tones.has(interval) || availableTensions(chord.quality).has(interval)) {
    return { kind: 'role', interval, ...roleOfInterval(interval, chord.quality, tones) };
  }
  const scale = chordScale(chord.quality).intervals;
  const degree = scale.indexOf(interval);
  if (degree >= 0) return { kind: 'scale', interval, degree, size: scale.length };
  return { kind: 'chromatic', interval };
}

/**
 * La ligne du prof dans le passage (lick, run, fill) : ses notes seules (ou le dessus
 * d'une note doublée), main par main, en phrases (un silence de plus de 0,7 s les
 * sépare) ; la phrase la plus riche (4 notes au moins), la plus récente à égalité, sur
 * deux accords au plus et ses 4 dernières secondes (24 notes au plus) : « ce qu'il vient
 * de faire ». null s'il ne joue que des accords.
 * @param {object[]} notes - notes du prof
 * @param {{start: number, end: number, label: string}[]} chords - grille relevée
 * @param {{start: number, end: number}} window
 * @returns {{hand: 'lh'|'rh', start: number, end: number, notes: {midi: number, start: number, end: number, chord: object, role: object}[], chords: object[]}|null}
 */
export function lickLine(notes, chords, { start = 0, end = Infinity, maxNotes = 24, maxSeconds = 4 } = {}) {
  const grid = [...(chords || [])].filter((c) => Number.isFinite(c?.start)).sort((a, b) => a.start - b.start)
    .map((c) => ({ ...parseChordName(c.label || c.name), start: c.start, end: Number.isFinite(c.end) ? c.end : c.start }))
    .filter((c) => c.name);
  const inWindow = guessHands((notes || []).filter((n) => Number.isFinite(n?.midi) && Number.isFinite(n?.start) && n.start >= start && n.start < end));
  let best = null;
  for (const hand of ['rh', 'lh']) {
    const line = [];
    for (const group of attackClusters(inWindow.filter((n) => (n.hand === 'lh' ? 'lh' : 'rh') === hand), 0.04)) {
      // Une note seule, ou le dessus d'une note doublée (tierces, sixtes) ; un accord n'en est pas.
      if (group.length <= 2) line.push(group.reduce((top, n) => (n.midi > top.midi ? n : top)));
    }
    const phrases = [];
    for (const n of line) {
      const last = phrases[phrases.length - 1];
      if (last && n.start - last[last.length - 1].start <= 0.7) last.push(n);
      else phrases.push([n]);
    }
    for (const phrase of phrases) {
      if (phrase.length < 4) continue;
      // Un accord arpégé (notes encore tenues ensemble à la dernière) n'est pas une ligne.
      const last = phrase[phrase.length - 1];
      if (phrase.slice(0, -1).filter((n) => (Number.isFinite(n.end) ? n.end : n.start) > last.start + 0.05).length >= 3) continue;
      if (!best || phrase.length > best.phrase.length || (phrase.length === best.phrase.length && phrase[0].start > best.phrase[0].start)) best = { hand, phrase };
    }
  }
  if (!best) return null;
  const phraseEnd = best.phrase[best.phrase.length - 1].start;
  let kept = best.phrase.filter((n) => n.start >= phraseEnd - maxSeconds).slice(-maxNotes);
  // Deux accords au plus : les derniers sous la ligne.
  const under = (n) => chordAt(grid, n.start);
  const lickChords = [];
  for (const n of kept) {
    const c = under(n);
    if (c && lickChords[lickChords.length - 1] !== c) lickChords.push(c);
  }
  const lastTwo = lickChords.slice(-2);
  kept = kept.filter((n) => lastTwo.includes(under(n)));
  if (kept.length < 4 || !lastTwo.length) return null;
  return {
    hand: best.hand,
    start: kept[0].start,
    end: Math.max(...kept.map((n) => (Number.isFinite(n.end) ? n.end : n.start + 0.2))),
    notes: kept.map((n) => {
      const chord = under(n);
      return { midi: n.midi, start: n.start, end: Number.isFinite(n.end) ? n.end : n.start + 0.2, chord, role: lickNoteRole(n.midi, chord) };
    }),
    chords: lastTwo,
  };
}

/** La ligne du prof décrite : « 9 · 1 · b7 · (b7) · 13 | 3 » (entre parenthèses : notes chromatiques). */
export function describeLick(lick) {
  const parts = [];
  let current = null;
  for (const n of lick.notes) {
    if (current !== n.chord) {
      parts.push([]);
      current = n.chord;
    }
    const degree = degreeOf(n.role.interval, n.chord.quality);
    parts[parts.length - 1].push(n.role.kind === 'chromatic' ? `(${degree})` : degree);
  }
  return parts.map((p) => p.join(' · ')).join(' | ');
}

/** L'intervalle (depuis la fondamentale de l'accord cible) de la note qui tient le même rôle ; null : note chromatique. */
function lickInterval(role, target) {
  if (role.kind === 'chromatic') return null;
  if (role.kind === 'role') {
    const iv = intervalForRole(role, target.quality);
    if (iv != null) return iv;
  }
  const scale = chordScale(target.quality).intervals;
  if (role.kind === 'scale' && role.size === scale.length) return scale[role.degree];
  // Gammes de tailles différentes (diminuée à 8 notes), ou rôle absent : la note de la gamme la plus proche.
  return scale.reduce((best, iv) => (Math.abs(iv - role.interval) < Math.abs(best - role.interval) ? iv : best), scale[0]);
}

/** Le hauteur de cette classe la plus proche de `want`. */
function nearestPitch(pc, want) {
  const base = want - pcOf(want - pc);
  return want - base <= 6 ? base : base + 12;
}

/**
 * La ligne du prof posée sur un ou deux accords cibles (dans l'ordre de ses accords) :
 * même rôle ou même rang de gamme pour chaque note, mêmes intervalles autant que
 * possible (contour), notes chromatiques à la même distance de la note qui suit, et
 * dans le registre du prof (à l'octave près).
 * @param {object} lick - lickLine()
 * @param {object[]} targets - accords analysés (parseChordName), un par accord de la ligne
 * @returns {number[]} les hauteurs MIDI, note par note
 */
export function realizeLick(lick, targets) {
  const out = new Array(lick.notes.length).fill(null);
  const targetOf = (n) => targets[Math.max(0, lick.chords.indexOf(n.chord))] || targets[0];
  let prev = null;
  lick.notes.forEach((n, i) => {
    const target = targetOf(n);
    const iv = lickInterval(n.role, target);
    if (iv === null) return;
    const pc = pcOf(target.rootPc + iv);
    out[i] = prev ? nearestPitch(pc, out[prev.index] + (n.midi - prev.midi)) : nearestPitch(pc, n.midi);
    prev = { index: i, midi: n.midi };
  });
  // Notes chromatiques : même écart avec la note qui suit (ou, en fin de ligne, la précédente).
  for (let i = out.length - 1; i >= 0; i -= 1) {
    if (out[i] !== null) continue;
    const next = out.slice(i + 1).findIndex((m) => m !== null);
    if (next >= 0) {
      const j = i + 1 + next;
      out[i] = out[j] + (lick.notes[i].midi - lick.notes[j].midi);
    } else {
      const j = out.slice(0, i).map((m, k) => (m !== null ? k : -1)).filter((k) => k >= 0).pop();
      out[i] = j != null ? out[j] + (lick.notes[i].midi - lick.notes[j].midi) : lick.notes[i].midi;
    }
  }
  // Le registre du prof : la ligne entière, à l'octave près.
  const mean = (list) => list.reduce((a, b) => a + b, 0) / list.length;
  const shift = Math.round((mean(lick.notes.map((n) => n.midi)) - mean(out)) / 12) * 12;
  return out.map((m) => Math.min(108, Math.max(21, m + shift)));
}

/**
 * Où poser la ligne dans la progression : sur chaque accord du même genre que celui du
 * prof (ligne sur un accord) ; sur chaque paire d'accords qui fait le même mouvement que
 * chez lui (ligne de V → I, de II → V… : sur les autres quintes descendantes, les rôles
 * s'adaptent : sa 3 devient la b3 d'un accord mineur), d'abord celles dont les accords
 * sont du même genre que les siens, puis les plus proches de la fin. Jamais deux fois sur
 * le même accord. Sans place de ce genre, sur chaque accord ou chaque paire (`everywhere`).
 * @param {object} lick - lickLine()
 * @param {object[]} parsed - accords de la progression (parseChordName)
 * @returns {{at: number[], everywhere: boolean}} rang du premier accord de chaque pose, dans l'ordre
 */
export function lickPlacements(lick, parsed) {
  const k = lick.chords.length;
  const families = lick.chords.map((c) => chordFamily(c.quality));
  const motion = k === 2 ? pcOf(lick.chords[1].rootPc - lick.chords[0].rootPc) : null;
  const candidates = [];
  for (let j = 0; j + k <= parsed.length; j += 1) {
    const same = parsed.slice(j, j + k).filter((c, i) => chordFamily(c.quality) === families[i]).length;
    const moves = k === 2 ? pcOf(parsed[j + 1].rootPc - parsed[j].rootPc) : null;
    candidates.push({ j, same, strict: k === 1 ? same === 1 : moves === motion, loose: k === 1 || moves !== 0 });
  }
  const pick = (key) => {
    const taken = new Set();
    const at = [];
    for (const c of candidates.filter((x) => x[key]).sort((a, b) => b.same - a.same || b.j - a.j)) {
      const span = Array.from({ length: k }, (_, i) => c.j + i);
      if (span.some((i) => taken.has(i))) continue;
      span.forEach((i) => taken.add(i));
      at.push(c.j);
    }
    return at.sort((a, b) => a - b);
  };
  const strict = pick('strict');
  if (strict.length) return { at: strict, everywhere: false };
  return { at: pick('loose'), everywhere: true };
}

// ── L'outil, de bout en bout ────────────────────────────────────────────────────

/** Les gabarits du prof réellement employés, dans l'ordre où il les joue. */
function usedShapes(realized, shapes) {
  return [...new Map(realized.map((c) => [c.from, shapes.find((sh) => sh.label === c.from)])).values()].filter(Boolean)
    .sort((a, b) => a.time - b.time);
}

const describeUsed = (used) => used.map((sh) => `${clock(sh.time)} ${sh.label} : ${describeShape(sh)}`).join(' ; ');

/** Cas 1 : ses voicings sur la progression. */
function transferVoicings({ notes, chords, from, to, list, title, sharps }) {
  const shapes = voicingShapes(notes, chords, { start: from, end: to });
  if (!shapes.length) return { example: null, text: '', error: `Je n'ai pas trouvé d'accord du prof assez net entre ${clock(from)} et ${clock(to)} pour en reprendre le voicing.` };
  const realized = applyVoicings(shapes, list);
  const head = `_Voicings repris du prof (${describeUsed(usedShapes(realized, shapes))}) :_`;
  const example = chordsExample(realized, {
    title: title || `Ses voicings sur ${list.join(' → ')}`,
    subtitle: `Repris de ${clock(from)}–${clock(to)} · ${realized.length} accords`,
  });
  return { example, text: [head, ...realized.map((c) => realizedLine(c, { sharps }))].join('\n') };
}

/** Cas 2 : ses accords de passage, glissés dans la progression, avec ses voicings. */
function transferPassingChords({ notes, chords, from, to, list, title, sharps, key, found = null }) {
  const { chords: played, moves } = found || passingMoves(chords, { start: from, end: to, key });
  const withVoicings = (why) => {
    const fallback = transferVoicings({ notes, chords, from, to, list, title, sharps });
    const note = `_(${why} Voici ses voicings sur ta progression.)_`;
    return fallback.example ? { ...fallback, text: `${note}\n${fallback.text}` } : { ...fallback, error: `${why}` };
  };
  if (!moves.length) {
    const grid = played.map((c) => c.name).join(' → ') || 'aucun accord relevé';
    return withVoicings(`Pas d'accord de passage entre ${clock(from)} et ${clock(to)} : il enchaîne directement ${grid}.`);
  }
  const { sequence, everywhere } = applyPassingMoves(moves, list, { sharps });
  if (!sequence.some((c) => c.passing)) {
    return withVoicings('Ses accords de passage ne trouvent pas de place dans cette progression (même fondamentale ou basse au demi-ton d\'un accord à l\'autre).');
  }
  const where = everywhere ? ' (ta progression ne fait nulle part son mouvement : glissé devant chaque accord)' : '';
  const head = `_Enchaînement repris du prof (${moves.map((m) => `${clock(m.time)} : ${[m.from?.name, ...m.chain.map((c) => c.name), m.to.name].filter(Boolean).join(' → ')}, ${m.chain.map((c) => c.relation).join(', puis ')}`).join(' ; ')})${where} :_`;
  const subtitle = `Repris de ${clock(from)}–${clock(to)} · ${sequence.filter((c) => c.passing).length} accords de passage`;
  const exampleTitle = title || `Ses accords de passage sur ${list.join(' → ')}`;
  const shapes = voicingShapes(notes, chords, { start: from, end: to });
  const passingLabels = new Set(moves.flatMap((m) => m.chain.map((c) => c.name)));
  const realized = shapes.length ? applyVoicings(shapes, sequence, { exclude: passingLabels }) : [];
  if (realized.length === sequence.length) {
    const voicings = `_Joués avec ses voicings (${describeUsed(usedShapes(realized, shapes))}) :_`;
    const example = chordsExample(realized, { title: exampleTitle, subtitle });
    return { example, text: [head, voicings, ...realized.map((c) => realizedLine(c, { sharps }))].join('\n') };
  }
  // Ses voicings illisibles dans ce passage : ceux de l'application, enchaînés.
  const example = buildChordExample(sequence.map((c) => c.name), { styleId: 'auto' });
  if (!example) return { example: null, text: '', error: 'Je n\'ai pas pu faire jouer cette progression avec ses accords de passage.' };
  example.kind = 'tutorial-transfer';
  example.title = exampleTitle;
  example.subtitle = subtitle;
  const lines = (example.chords || []).map((c, i) => (c.leftHand || c.rightHand
    ? realizedLine({ name: c.name, leftHand: c.leftHand || [], rightHand: c.rightHand || [], passing: sequence[i]?.passing }, { sharps })
    : `- ${sequence[i]?.passing ? `_${c.name}_ (passage)` : `**${c.name}**`}`));
  return { example, text: [head, '_Ses voicings n\'ont pas pu être lus dans ce passage : voicings de l\'application._', ...lines].join('\n') };
}

/** Accompagnement simple quand le prof n'a pas de forme lisible : fondamentale et 7e (ou quinte), au grave. */
function shellFor(chord, side = 'lh') {
  const tones = chordToneIntervals(chord.quality);
  const upper = tones.has(10) ? 10 : tones.has(11) ? 11 : tones.has(9) && DIM7.test(chord.quality) ? 9 : 7;
  if (side === 'rh') {
    const third = tones.has(3) && !tones.has(4) ? 3 : 4;
    const low = 60 + pcOf(chord.rootPc + third - 60);
    return [low, low + pcOf(upper - third)];
  }
  const root = 36 + pcOf(chord.rootPc - 36);
  return [root, root + upper];
}

/** Cas 3 : sa ligne (lick, run, fill) posée sur la progression, ses voicings en accompagnement. */
function transferLick({ notes, chords, from, to, list, title, sharps, found = null }) {
  const lick = found || lickLine(notes, chords, { start: from, end: to });
  if (!lick) {
    const fallback = transferVoicings({ notes, chords, from, to, list, title, sharps });
    const why = `Pas de ligne de notes seules (lick, run, fill) entre ${clock(from)} et ${clock(to)} : il y joue des accords.`;
    return fallback.example ? { ...fallback, text: `_(${why} Voici ses voicings sur ta progression.)_\n${fallback.text}` } : { ...fallback, error: why };
  }
  const parsed = list.map((name) => parseChordName(name));
  const { at, everywhere } = lickPlacements(lick, parsed);
  const k = lick.chords.length;
  const span = lick.end - lick.start;
  const pre = k === 2 ? Math.max(0, lick.chords[1].start - lick.start) : 0;
  const slots = parsed.map(() => 2);
  for (const j of at) {
    if (k === 1) slots[j] = Math.max(2, span + 0.6);
    else {
      slots[j] = Math.max(2, pre + 0.6);
      slots[j + 1] = Math.max(2, span - pre + 0.4);
    }
  }
  const starts = [];
  slots.reduce((t, d) => { starts.push(t); return t + d; }, 0);
  const lickHand = lick.hand === 'lh' ? 'LH' : 'RH';
  const handWord = lick.hand === 'lh' ? 'main gauche' : 'main droite';
  const covered = new Set(at.flatMap((j) => Array.from({ length: k }, (_, i) => j + i)));
  const events = [];
  const lines = [];
  for (const j of at) {
    const targets = parsed.slice(j, j + k);
    const pitches = realizeLick(lick, targets);
    const origin = k === 1 ? starts[j] + 0.25 : starts[j + 1] - pre;
    lick.notes.forEach((n, i) => events.push({
      midi: pitches[i],
      startOffsetMs: Math.round(Math.max(0, origin + (n.start - lick.start)) * 1000),
      durationMs: Math.round(Math.max(0.08, n.end - n.start) * 1000),
      velocity: 0.8,
      hand: lickHand,
    }));
    const names = pitches.map((m, i) => spellInChord(m, (targets[lick.chords.indexOf(lick.notes[i].chord)] || targets[0]).name, { sharps }));
    // Un accord qui revient (G7 deux fois dans 4-5-3-6-2-5-1) : sa place dans la progression.
    const label = targets.map((c) => c.name).join(' → ');
    const repeated = at.filter((x) => parsed.slice(x, x + k).map((c) => c.name).join(' → ') === label).length > 1;
    lines.push(`- **${label}**${repeated ? ` (${j + 1}e accord)` : ''} : ${handWord} ${names.join(' ')}`);
  }
  // Ses voicings en accompagnement : l'autre main toujours, la main de la ligne là où elle ne joue pas.
  const shapes = voicingShapes(notes, chords, { start: from, end: to });
  const realized = shapes.length ? applyVoicings(shapes, list) : [];
  parsed.forEach((chord, i) => {
    const r = realized.length === parsed.length ? realized[i] : null;
    const other = lick.hand === 'lh' ? 'rightHand' : 'leftHand';
    const own = lick.hand === 'lh' ? 'leftHand' : 'rightHand';
    let accompaniment = r?.[other]?.length ? r[other] : shellFor(chord, lick.hand === 'lh' ? 'rh' : 'lh');
    const parts = [[accompaniment, lick.hand === 'lh' ? 'RH' : 'LH']];
    if (!covered.has(i) && r?.[own]?.length) parts.push([r[own], lickHand]);
    for (const [list2, hand] of parts) {
      for (const midi of list2) events.push({ midi, startOffsetMs: Math.round(starts[i] * 1000), durationMs: Math.round(slots[i] * 950), velocity: 0.62, hand });
    }
  });
  const example = buildNotesExample(events, {
    kind: 'tutorial-transfer',
    title: title || `Son lick sur ${list.join(' → ')}`,
    subtitle: `Repris de ${clock(lick.start)}–${clock(lick.end)} · ${lick.notes.length} notes · posé ${at.length} fois`,
  });
  if (example) example.chords = parsed.map((c, i) => ({ name: c.name, leftHand: [], rightHand: [], lick: covered.has(i) }));
  const where = everywhere ? ` ; ta progression n'a pas d'accord de ce genre : posé sur ${k === 1 ? 'chaque accord' : 'chaque enchaînement'}` : '';
  const head = `_Lick repris du prof (${clock(lick.start)}–${clock(lick.end)}, ${handWord}, sur ${lick.chords.map((c) => c.name).join(' → ')} : ${describeLick(lick)} ; entre parenthèses, les notes chromatiques${where}) :_`;
  const accompaniment = shapes.length ? '_Accompagné de ses voicings._' : '_Accompagné de la fondamentale et de la 7e (ses voicings n\'ont pas pu être lus dans ce passage)._';
  return { example, text: [head, ...lines, accompaniment].join('\n') };
}

/**
 * Ce que l'outil apply_tutorial_passage rend : l'exemple à écouter, et le texte qui
 * dit ce qui a été repris du prof et les notes de chaque accord.
 * @param {object} input
 * @param {object[]} input.notes - notes du prof
 * @param {object[]} input.chords - grille relevée
 * @param {number} input.start
 * @param {number} input.end
 * @param {'voicing'|'enchainement'|'lick'|'auto'} [input.what] - auto (« ce qu'il vient de
 *   faire ») : sa ligne si elle finit dans la seconde moitié du passage, sinon ses accords
 *   de passage s'il y en a, sinon ses voicings
 * @param {string[]} input.targets - accords cibles
 * @param {string} [input.title]
 * @param {string|null} [input.key] - tonalité du tuto : un accord hors tonalité dans une
 *   relation connue (diminué, dominante…) est un accord de passage même s'il dure
 * @returns {{example: object|null, text: string, error?: string}}
 */
export function applyTutorialPassage({ notes = [], chords = [], start, end, what = 'voicing', targets = [], title = '', key = null } = {}) {
  const from = Math.max(0, Number(start) || 0);
  const to = Math.min(Number(end) || from + 20, from + 30);
  const list = (targets || []).map((t) => String(t || '').trim()).filter((t) => parseChordName(t));
  if (!list.length) return { example: null, text: '', error: 'Aucun accord cible reconnu.' };
  const sharps = prefersSharps(list);
  const input = { notes, chords, from, to, list, title, sharps, key };
  let kind = what || 'auto';
  if (kind === 'auto') {
    const line = lickLine(notes, chords, { start: from, end: to });
    if (line && line.end >= from + (to - from) / 2) return transferLick({ ...input, found: line });
    const found = passingMoves(chords, { start: from, end: to, key });
    if (found.moves.length) return transferPassingChords({ ...input, found });
    kind = 'voicing';
  }
  if (kind === 'enchainement') return transferPassingChords(input);
  if (kind === 'lick') return transferLick(input);
  return transferVoicings(input);
}
