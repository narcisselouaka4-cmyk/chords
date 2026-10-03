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

import { parseChordName, availableTensions } from './note-roles.js';
import { chordToneIntervals } from '../practice-exercise.js';
import { guessHands } from './teacher-notes.js';
import { buildNotesExample } from './copilot-demo.js';
import { normalizeDegrees } from './tutorial-questions.js';

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

/** Nom d'un rôle tel qu'on le lit (« 1 », « b3 », « 7 », « #9 »…). */
export function roleLabel({ role, alt }) {
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
  const part = (list) => list.map(roleLabel).join(' · ') || '—';
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
 * L'octave d'une main : la note du bas dans le registre du prof ; d'abord sans
 * dépasser le plafond (ni passer sous la main gauche, pour la droite), puis au plus
 * près de l'accord précédent, puis au plus grave.
 * @param {{firstPc: number, offsets: number[]}} shape
 * @param {{source: number, ceiling: number, anchor: number, above?: number}} options
 * @returns {number[]}
 */
function placeHand({ firstPc, offsets }, { source, ceiling, anchor, above = -Infinity }) {
  const span = offsets[offsets.length - 1] || 0;
  let best = null;
  const consider = (lo, hi) => {
    for (let first = Math.max(21, lo); first <= Math.min(108 - span, hi); first += 1) {
      if (pcOf(first) !== firstPc) continue;
      const top = first + span;
      const excess = Math.max(0, top - ceiling) + (first <= above ? 24 : 0);
      const score = [excess, Math.abs(first - anchor), first];
      if (!best || score[0] < best.score[0] || (score[0] === best.score[0] && (score[1] < best.score[1] || (score[1] === best.score[1] && score[2] < best.score[2])))) {
        best = { first, score };
      }
    }
  };
  consider(source - REGISTER_SPAN, source + REGISTER_SPAN);
  // Trop haut dans le registre du prof (forme large, accord aigu) : une octave plus bas.
  if (best && best.score[0] > 0 && best.first > above) consider(source - REGISTER_SPAN - 12, source - REGISTER_SPAN - 1);
  // La main droite passe au-dessus de la gauche, une octave plus haut s'il le faut.
  if (best && best.first <= above) consider(source + REGISTER_SPAN + 1, source + REGISTER_SPAN + 12);
  return best ? offsets.map((o) => best.first + o) : [];
}

/**
 * Les voicings du prof posés sur une progression : chaque accord cible prend le
 * gabarit de sa famille ; chaque main reste dans le registre où le prof l'a jouée,
 * au plus près de l'accord précédent ; la main droite reste au-dessus de la gauche.
 * @param {object[]} shapes - voicingShapes()
 * @param {string[]} targets - accords cibles (« Fmaj7 », « G7 »…)
 * @returns {{name: string, leftHand: number[], rightHand: number[], from: string}[]}
 */
export function applyVoicings(shapes, targets) {
  if (!shapes?.length) return [];
  const result = [];
  const prevLow = { lh: null, rh: null };
  for (const name of targets || []) {
    const chord = parseChordName(name);
    if (!chord) continue;
    const shape = pickShape(shapes, chordFamily(chord.quality));
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
      });
    }
    if (hands.lh.length) prevLow.lh = hands.lh[0];
    if (hands.rh.length) prevLow.rh = hands.rh[0];
    result.push({ name: chord.name, leftHand: hands.lh, rightHand: hands.rh, from: shape.label });
  }
  return result;
}

/**
 * Les accords réalisés en exemple à écouter (plaqués, un accord toutes les
 * `seconds` secondes), avec leurs mains pour la carte du Copilote.
 */
export function chordsExample(realized, { title = '', subtitle = '', seconds = 1.6 } = {}) {
  const notes = [];
  realized.forEach((c, i) => {
    for (const [list, hand] of [[c.leftHand, 'LH'], [c.rightHand, 'RH']]) {
      for (const midi of list) {
        notes.push({ midi, startOffsetMs: Math.round(i * seconds * 1000), durationMs: Math.round(seconds * 920), velocity: 0.72, hand });
      }
    }
  });
  const example = buildNotesExample(notes, { kind: 'tutorial-transfer', title, subtitle });
  if (example) example.chords = realized.map((c) => ({ name: c.name, leftHand: c.leftHand, rightHand: c.rightHand }));
  return example;
}

/** Ligne de texte d'un accord réalisé : « **Fmaj7** : main gauche Fa2 Mi3 · main droite La3 Ré4 Sol4 ». */
export function realizedLine(c, { sharps = false } = {}) {
  const name = (m) => noteLabel(m, { sharps });
  const parts = [];
  if (c.leftHand.length) parts.push(`main gauche ${c.leftHand.map(name).join(' ')}`);
  if (c.rightHand.length) parts.push(`main droite ${c.rightHand.map(name).join(' ')}`);
  return `- **${c.name}** : ${parts.join(' · ')}`;
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

// ── L'outil, de bout en bout ────────────────────────────────────────────────────

/**
 * Ce que l'outil apply_tutorial_passage rend : l'exemple à écouter, et le texte qui
 * dit ce qui a été repris du prof et les notes de chaque accord.
 * @param {object} input
 * @param {object[]} input.notes - notes du prof
 * @param {object[]} input.chords - grille relevée
 * @param {number} input.start
 * @param {number} input.end
 * @param {'voicing'|'enchainement'|'lick'} [input.what]
 * @param {string[]} input.targets - accords cibles
 * @param {string} [input.title]
 * @returns {{example: object|null, text: string, error?: string}}
 */
export function applyTutorialPassage({ notes = [], chords = [], start, end, what = 'voicing', targets = [], title = '' } = {}) {
  const from = Math.max(0, Number(start) || 0);
  const to = Math.min(Number(end) || from + 20, from + 30);
  const list = (targets || []).map((t) => String(t || '').trim()).filter((t) => parseChordName(t));
  if (!list.length) return { example: null, text: '', error: 'Aucun accord cible reconnu.' };
  if (what === 'voicing' || what === 'auto' || !what) {
    const shapes = voicingShapes(notes, chords, { start: from, end: to });
    if (!shapes.length) return { example: null, text: '', error: `Je n'ai pas trouvé d'accord du prof assez net entre ${clock(from)} et ${clock(to)} pour en reprendre le voicing.` };
    const realized = applyVoicings(shapes, list);
    const used = [...new Map(realized.map((c) => [c.from, shapes.find((s) => s.label === c.from)])).values()].filter(Boolean)
      .sort((a, b) => a.time - b.time);
    const sharps = prefersSharps(list);
    const head = `_Voicings repris du prof (${used.map((s) => `${clock(s.time)} ${s.label} : ${describeShape(s)}`).join(' ; ')}) :_`;
    const example = chordsExample(realized, {
      title: title || `Ses voicings sur ${list.join(' → ')}`,
      subtitle: `Repris de ${clock(from)}–${clock(to)} · ${realized.length} accords`,
    });
    return { example, text: [head, ...realized.map((c) => realizedLine(c, { sharps }))].join('\n') };
  }
  return { example: null, text: '', error: `« ${what} » : pas encore disponible.` };
}
