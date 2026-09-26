// [Claude] — 2026-09-25 — Melody chords : harmoniser une mélodie note par note.
//
// Narcisse : « L'idéal : générer des melody chords. La top note porte la
// mélodie, la basse est indépendante (cycle de quintes ou de tierces), on comble
// avec des notes de l'accord. »
// 1. Accords possibles pour chaque note : ceux dont elle est une note ou une
//    tension disponible. Coût du rôle de la note : 3ce, 7e (ou 6te, quarte d'un
//    sus) d'abord, puis quinte, 9e, 13e, fondamentale, puis 11e et #11, puis les
//    altérations. Les accords de la tonalité (et les dominantes secondaires) sont
//    préférés ; la tonalité est donnée, ou devinée d'après la mélodie.
// 2. La basse (la fondamentale) avance d'un accord au suivant selon le cycle
//    demandé : quintes (une quinte plus bas), tierces (une tierce plus bas) ou
//    libre (quintes et degrés conjoints). Le meilleur enchaînement est cherché
//    sur toute la mélodie (programmation dynamique) ; fin sur la tonique quand
//    la dernière note le permet.
// 3. Voicing : le dessus est la note de la mélodie, à son octave ; dessous, deux
//    ou trois notes de l'accord dans l'octave (notes guides d'abord), sans
//    doubler la mélodie ni frotter un demi-ton contre elle ; main gauche : la
//    basse entre Do2 et Si2, plus sa 7e, sa 10e ou sa quinte quand c'est
//    jouable (limites des intervalles graves, pas de 9e mineure).
// Module pur : pas de DOM.

import { respectsLowIntervalLimits, minorNinthClashes } from './textbook-voicings.js';
import { degreeOf } from '../pedagogie/note-roles.js';
import { frenchNoteName, degreeWord } from '../pedagogie/example-guide.js';

const pcOf = (n) => ((n % 12) + 12) % 12;
const ROOT_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
const KEY_WORDS = ['Do', 'Réb', 'Ré', 'Mib', 'Mi', 'Fa', 'Fa#', 'Sol', 'Lab', 'La', 'Sib', 'Si'];
export const BASS_MOVES = ['quintes', 'tierces', 'libre'];
/** Une mélodie harmonisée compte 32 notes au plus. */
export const MELODY_CHORDS_MAX = 32;
// Finir ailleurs que sur la tonique (quand la dernière note le permet) coûte plus
// qu'un pas de basse hors du cycle.
const TONIC_ENDING = 3.5;

// Familles d'accords : notes (demi-tons depuis la fondamentale), tensions que la
// mélodie peut porter, remplissage sous la mélodie (ordre de préférence), coût.
const FAMILIES = [
  { id: 'maj7', tones: [0, 4, 7, 11], tensions: [2, 6], fill: [4, 11, 2, 7], cost: 0 },
  { id: '6', tones: [0, 4, 7, 9], tensions: [2], fill: [4, 9, 2, 7], cost: 0.1 },
  { id: 'm7', tones: [0, 3, 7, 10], tensions: [2, 5], fill: [3, 10, 2, 7, 5], cost: 0 },
  { id: 'm6', tones: [0, 3, 7, 9], tensions: [2], fill: [3, 9, 2, 7], cost: 0.8 },
  { id: '7', tones: [0, 4, 7, 10], tensions: [2, 9, 1, 3, 8, 6], fill: [4, 10, 9, 2, 7], cost: 0 },
  { id: '7sus4', tones: [0, 5, 7, 10], tensions: [2, 9], fill: [5, 10, 2, 9, 7], cost: 0.6 },
  { id: 'm7b5', tones: [0, 3, 6, 10], tensions: [5, 2], fill: [3, 10, 6, 5], cost: 0.5 },
  { id: 'dim7', tones: [0, 3, 6, 9], tensions: [], fill: [3, 6, 9, 0], cost: 1.2 },
];
const GUIDE = { maj7: [4, 11], 6: [4, 9], m7: [3, 10], m6: [3, 9], 7: [4, 10], '7sus4': [5, 10], m7b5: [3, 10], dim7: [3, 9] };

/** Coût du rôle de la note de mélodie dans l'accord (demi-tons depuis la fondamentale). */
function roleCost(interval, family) {
  if (GUIDE[family.id].includes(interval)) return 0;
  if (family.id === 'm7b5' && interval === 6) return 0.8;
  if (family.id === 'dim7') return 0.6;
  if (interval === 7 || interval === 2 || interval === 9) return 1;
  if (interval === 0) return 1.2;
  if (interval === 5 || interval === 6) return 1.6;
  return 2.2; // b9, #9, b13
}

// Remplissage qui contredit la note de mélodie (tension altérée contre tension naturelle,
// #11 contre la quinte, b13 contre la 13e et la quinte).
function fillFor(family, melodyInterval) {
  let fill = family.fill.filter((i) => i !== melodyInterval);
  if (family.id === '7') {
    if (melodyInterval === 1 || melodyInterval === 3) fill = fill.filter((i) => i !== 2);
    if (melodyInterval === 8) fill = fill.filter((i) => i !== 9 && i !== 7);
    if (melodyInterval === 6) fill = fill.filter((i) => i !== 7);
  }
  if (family.id === 'maj7' && melodyInterval === 6) fill = fill.filter((i) => i !== 7);
  return fill;
}

/** Nom de l'accord d'après ses notes (« Dm9 », « G13 », « C6/9 », « G7b9 »). */
function chordName(rootPc, family, intervals) {
  const has = (i) => intervals.has(i);
  let q = family.id;
  if (family.id === 'maj7') q = has(6) ? (has(2) ? 'maj9#11' : 'maj7#11') : has(2) ? 'maj9' : 'maj7';
  else if (family.id === '6') q = has(2) ? '6/9' : '6';
  else if (family.id === 'm7') q = has(5) ? 'm11' : has(2) ? 'm9' : 'm7';
  else if (family.id === 'm6') q = has(2) ? 'm6/9' : 'm6';
  else if (family.id === '7') q = has(1) ? '7b9' : has(3) ? '7#9' : has(8) ? '7b13' : has(6) ? '7#11' : has(9) ? '13' : has(2) ? '9' : '7';
  else if (family.id === '7sus4') q = has(9) ? '13sus4' : has(2) ? '9sus4' : '7sus4';
  return { name: `${ROOT_NAMES[rootPc]}${q}`, quality: q };
}

/**
 * Voicing d'un accord sous une note de mélodie, ou null s'il n'y a pas au moins
 * deux notes à mettre dessous.
 * @returns {{leftHand: number[], rightHand: number[], name: string, quality: string}|null}
 */
function voiceChord(rootPc, family, melody) {
  const melodyInterval = pcOf(melody - rootPc);
  const inner = [];
  for (const interval of fillFor(family, melodyInterval)) {
    if (inner.length >= 3) break;
    // La plus haute place sous la mélodie, dans l'octave.
    let note = melody - pcOf(melody - (rootPc + interval));
    if (note === melody) note -= 12;
    if (melody - note === 1) continue; // pas de demi-ton contre la mélodie
    if (inner.some((n) => Math.abs(n - note) === 1)) continue; // pas de grappe
    // Mélodie grave : la note qui rendrait le voicing boueux est laissée.
    if (!respectsLowIntervalLimits([...inner, note, melody])) continue;
    inner.push(note);
  }
  if (inner.length < 2) return null;
  const rightHand = [...inner, melody].sort((a, b) => a - b);
  // Basse entre Do2 et Si2, plus une note si c'est jouable.
  const bass = 36 + rootPc;
  const lowest = rightHand[0];
  const flatNine = family.id === '7' && melodyInterval === 1;
  const rhPcs = new Set(rightHand.map(pcOf));
  const seventh = family.tones.find((i) => i >= 9);
  // 10e : tierce + octave (une quarte + octave serait une 11e, trop large).
  const third = family.tones.find((i) => i === 3 || i === 4);
  // Quinte de l'accord : diminuée pour m7b5 et dim7.
  const fifth = family.tones.find((i) => i >= 6 && i <= 8);
  const options = [
    seventh != null && !rhPcs.has(pcOf(rootPc + seventh)) ? bass + seventh : null,
    third != null ? bass + 12 + third : null,
    fifth != null ? bass + fifth : null,
  ].filter((n) => n != null && n < lowest - 1 && pcOf(n) !== pcOf(melody)); // la mélodie n'est pas doublée
  let leftHand = [bass];
  for (const extra of options) {
    const all = [bass, extra, ...rightHand];
    if (!respectsLowIntervalLimits([bass, extra])) continue;
    if (minorNinthClashes(all, rootPc, { flatNineChord: flatNine }).length) continue;
    leftHand = [bass, extra];
    break;
  }
  if (minorNinthClashes([...leftHand, ...rightHand], rootPc, { flatNineChord: flatNine }).length) return null;
  const intervals = new Set([...leftHand, ...rightHand].map((n) => pcOf(n - rootPc)));
  // L'accord doit s'entendre : sa tierce (ou la quarte d'un sus) est jouée.
  if (!family.tones.some((i) => (i === 3 || i === 4 || i === 5) && intervals.has(i))) return null;
  return { leftHand, rightHand, ...chordName(rootPc, family, intervals) };
}

// ── Mélodie tapée ──

const NOTE_TOKEN = /^(do|ré|re|mi|fa|sol|la|si|[a-g])(#|b|♯|♭|dièse|diese|bémol|bemol)?(\d)?(?::(\d+(?:[.,]\d+)?))?$/i;
const SOLFEGE = { do: 0, re: 2, ré: 2, mi: 4, fa: 5, sol: 7, la: 9, si: 11 };
const LETTERS = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };

/**
 * « Mi4 Ré4 Do4:2 » (ou « E4 D4 C4:2 ») → notes et durées en temps (1 par défaut).
 * Sans octave, la note la plus proche de la précédente (autour de Do4 pour la première).
 * @param {string} text
 * @returns {{midi: number, beats: number}[]}
 */
export function parseMelodyText(text) {
  const out = [];
  // Virgule suivie d'un chiffre : décimale d'une durée (« Do4:1,5 »), pas un séparateur.
  for (const token of String(text || '').split(/[\s;|→>]+|,(?!\d)|\s-\s/).filter(Boolean)) {
    const m = NOTE_TOKEN.exec(token.trim());
    if (!m) continue;
    const name = m[1].toLowerCase();
    let pc = SOLFEGE[name] ?? LETTERS[name];
    const acc = (m[2] || '').toLowerCase();
    if (acc === '#' || acc === '♯' || acc.startsWith('di')) pc += 1;
    else if (acc) pc -= 1;
    let midi;
    if (m[3] != null) midi = (Number(m[3]) + 1) * 12 + pc;
    else {
      const previous = out.length ? out[out.length - 1].midi : 65;
      midi = previous + ((((pc - previous) % 12) + 18) % 12) - 6;
    }
    const beats = m[4] ? Number(m[4].replace(',', '.')) : 1;
    if (midi >= 21 && midi <= 108 && beats > 0) out.push({ midi, beats });
  }
  return out;
}

// ── Tonalité ──

const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const MINOR = [0, 2, 3, 5, 7, 8, 10];

/**
 * Tonalité tapée (« C », « Fa », « Sib majeur », « Am », « La mineur ») → {pc, minor}.
 * @returns {{pc: number, minor: boolean}|null}
 */
export function parseKeyName(text) {
  const t = String(text || '').trim();
  const m = /^(do|ré|re|mi|fa|sol|la|si|[A-G])\s*(#|b|♯|♭|dièse|diese|bémol|bemol)?\s*(m(?![a-z])|min|mineur|minor)?/i.exec(t);
  if (!m) return null;
  const name = m[1].toLowerCase();
  let pc = SOLFEGE[name] ?? LETTERS[name];
  if (pc == null) return null;
  const acc = (m[2] || '').toLowerCase();
  if (acc === '#' || acc === '♯' || acc.startsWith('di')) pc += 1;
  else if (acc) pc -= 1;
  return { pc: pcOf(pc), minor: Boolean(m[3]) };
}

/** Tonalité majeure devinée : notes de la mélodie dans la gamme (durées), dernière note sur la tonique. */
export function guessKey(melody) {
  let best = null;
  for (let pc = 0; pc < 12; pc += 1) {
    const scale = new Set(MAJOR.map((i) => pcOf(pc + i)));
    let score = 0;
    for (const n of melody) score += (scale.has(pcOf(n.midi)) ? 1 : -1.5) * Math.min(2, n.beats || 1);
    const last = pcOf(melody[melody.length - 1].midi - pc);
    if (last === 0) score += 2;
    else if (last === 4 || last === 7) score += 0.5;
    if (!best || score > best.score) best = { pc, score };
  }
  return { pc: best.pc, minor: false };
}

const keyLabel = (key) => `${KEY_WORDS[key.pc]} ${key.minor ? 'mineur' : 'majeur'}`;

/** Coût d'un accord dans la tonalité : de la tonalité 0, dominante secondaire 0,7, sinon 2. */
function keyCost(rootPc, family, key) {
  const scale = new Set((key.minor ? MINOR : MAJOR).map((i) => pcOf(key.pc + i)));
  const pcs = family.tones.map((i) => pcOf(rootPc + i));
  if (pcs.every((pc) => scale.has(pc))) return 0;
  // Mineur : V7 avec la sensible (harmonique).
  if (key.minor && family.id === '7' && pcOf(rootPc - key.pc) === 7) return 0;
  if (family.id === '7' && scale.has(pcOf(rootPc + 5)) && pcOf(rootPc + 5) !== pcOf(key.pc + (key.minor ? 2 : 11))) return 0.7;
  return 2;
}

/** Coût du mouvement de la basse d'une fondamentale à la suivante. */
function moveCost(from, to, bass) {
  const d = pcOf(to - from);
  if (bass === 'tierces') {
    if (d === 8 || d === 9) return 0;
    if (d === 5 || d === 0) return 2;
    if (d === 3 || d === 4) return 2.2;
    return 3;
  }
  if (bass === 'libre') {
    if (d === 5) return 0;
    if (d === 1 || d === 2 || d === 10 || d === 11) return 0.5;
    if (d === 3 || d === 4 || d === 8 || d === 9) return 0.7;
    if (d === 7) return 1;
    if (d === 0) return 1.2;
    return 2;
  }
  // Quintes : une quinte plus bas ; la quinte diminuée du cycle diatonique (Fa → Si),
  // la résolution d'un substitut tritonique (Réb7 → Do) en retrait.
  if (d === 5) return 0;
  if (d === 6) return 0.8;
  if (d === 11) return 1.2;
  if (d === 0) return 1.5;
  if (d === 7) return 2;
  return 2.6;
}

/**
 * Melody chords : un accord sous chaque note (ou sous les notes longues).
 * @param {{midi: number, beats: number, start?: number}[]} melody - notes et durées (temps) ;
 *   `start` facultatif (sinon les notes se suivent)
 * @param {{key?: string|{pc: number, minor: boolean}|null, bass?: string, every?: 'note'|'temps-fort'}} [options]
 * @returns {{key: {pc: number, minor: boolean, label: string, guessed: boolean}, bass: string, chords: object[], summary: string}|null}
 */
export function harmonizeMelody(melody, { key = null, bass = 'quintes', every = 'note' } = {}) {
  const notes = [];
  let clock = 0;
  for (const n of (melody || []).slice(0, MELODY_CHORDS_MAX)) {
    if (!Number.isFinite(n?.midi)) continue;
    const beats = Math.max(0.1, Number(n.beats) || 1);
    const start = Number.isFinite(n.start) ? n.start : clock;
    notes.push({ midi: Math.round(n.midi), beats, start });
    clock = start + beats;
  }
  if (!notes.length) return null;
  const move = BASS_MOVES.includes(bass) ? bass : 'quintes';
  const given = typeof key === 'string' ? parseKeyName(key) : key && Number.isFinite(key.pc) ? { pc: pcOf(key.pc), minor: Boolean(key.minor) } : null;
  const tonality = given || guessKey(notes);
  // Notes qui reçoivent un accord ; « temps-fort » : les notes brèves passent sur l'accord tenu.
  const harmonized = notes.map((n, i) => every !== 'temps-fort' || i === 0 || n.beats >= 0.75);

  // Accords possibles pour chaque note harmonisée.
  const states = notes.map((n, i) => {
    if (!harmonized[i]) return null;
    const list = [];
    for (let rootPc = 0; rootPc < 12; rootPc += 1) {
      for (const family of FAMILIES) {
        const interval = pcOf(n.midi - rootPc);
        if (!family.tones.includes(interval) && !family.tensions.includes(interval)) continue;
        const voicing = voiceChord(rootPc, family, n.midi);
        if (!voicing) continue;
        let cost = roleCost(interval, family) + family.cost + keyCost(rootPc, family, tonality);
        // Fin sur la tonique quand la dernière note le permet.
        if (i === notes.length - 1) {
          const tonic = rootPc === tonality.pc && (tonality.minor ? ['m7', 'm6'] : ['maj7', '6']).includes(family.id);
          if (!tonic) cost += TONIC_ENDING;
        }
        list.push({ rootPc, family, interval, voicing, cost });
      }
    }
    return list;
  });

  // Programmation dynamique sur les notes harmonisées.
  const idx = notes.map((_, i) => i).filter((i) => states[i]?.length);
  if (!idx.length) return null;
  let prev = states[idx[0]].map((s) => ({ total: s.cost, back: null, s }));
  const layers = [prev];
  for (let k = 1; k < idx.length; k += 1) {
    const cur = states[idx[k]].map((s) => {
      let best = null;
      prev.forEach((p, j) => {
        const total = p.total + moveCost(p.s.rootPc, s.rootPc, move) + s.cost;
        if (!best || total < best.total) best = { total, back: j };
      });
      return { total: best.total, back: best.back, s };
    });
    layers.push(cur);
    prev = cur;
  }
  let at = prev.reduce((b, p, j) => (p.total < prev[b].total ? j : b), 0);
  const picked = [];
  for (let k = layers.length - 1; k >= 0; k -= 1) {
    picked[k] = layers[k][at].s;
    at = layers[k][at].back;
  }

  // Sortie : un accord par note harmonisée, tenu jusqu'au suivant ; les notes de passage dessus.
  const chords = [];
  let k = -1;
  notes.forEach((n, i) => {
    if (idx.includes(i)) {
      k += 1;
      const s = picked[k];
      const degree = degreeOf(s.interval, s.voicing.quality);
      chords.push({
        start: n.start, beats: n.beats, chord: s.voicing.name, rootPc: s.rootPc, quality: s.voicing.quality,
        leftHand: s.voicing.leftHand, rightHand: s.voicing.rightHand, melody: n.midi, degree, role: degreeWord(degree), passing: false,
      });
    } else if (chords.length) {
      const held = chords[chords.length - 1];
      chords.push({
        start: n.start, beats: n.beats, chord: held.chord, rootPc: held.rootPc, quality: held.quality,
        leftHand: [], rightHand: [n.midi], melody: n.midi, degree: degreeOf(pcOf(n.midi - held.rootPc), held.quality), role: 'passage', passing: true,
      });
    }
  });
  const summary = chords.filter((c) => !c.passing).map((c) => `${frenchNoteName(c.melody, c.chord)} = ${c.role} de ${c.chord}`).join(' · ');
  return { key: { ...tonality, label: keyLabel(tonality), guessed: !given }, bass: move, chords, summary };
}
