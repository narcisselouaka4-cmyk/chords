// [Claude] — 2026-09-25 — Les notes en mots, pour les textes de l'application.
//
// Noms français écrits d'après l'accord (la 3ce de G7 est Si, la 7e de Bbmaj7
// est La), rôle d'une note d'une ligne (approche, passage, couleur) et conduite
// des voix d'un accord au suivant (« Do (7e) descend sur Si, la 3ce de G13 »).
// Ces phrases nourrissent les portraits envoyés au Copilote ; le clavier, lui,
// n'affiche plus d'étiquettes (Narcisse, 25/09 : « j'aime pas les étiquettes
// pour indiquer la fonction de chaque note »).
// Tout est calculé depuis les notes réellement jouées ; rien n'est demandé au
// modèle.

import { noteRoles, parseChordName, degreeOf } from './note-roles.js';
import { spellChordTone } from '../practice-exercise.js';

const pcOf = (n) => ((n % 12) + 12) % 12;
const SOLFEGE = { C: 'Do', D: 'Ré', E: 'Mi', F: 'Fa', G: 'Sol', A: 'La', B: 'Si' };
const FLAT_NAMES = ['Do', 'Réb', 'Ré', 'Mib', 'Mi', 'Fa', 'Solb', 'Sol', 'Lab', 'La', 'Sib', 'Si'];
const SHARP_NAMES = ['Do', 'Do#', 'Ré', 'Ré#', 'Mi', 'Fa', 'Fa#', 'Sol', 'Sol#', 'La', 'La#', 'Si'];

/** Nom anglais écrit (« Bb », « F# ») → nom français (« Sib », « Fa# »). */
function toSolfege(spelled) {
  const m = /^([A-G])([#b]*)$/.exec(String(spelled || ''));
  return m ? `${SOLFEGE[m[1]]}${m[2]}` : null;
}

/**
 * Nom français d'une note (sans octave), écrit d'après l'accord quand il est
 * connu : la 3ce de G7 est Si, la 7e de Bbmaj7 est La, la #9 de C7#9 est Ré#.
 */
export function frenchPitchName(midi, chord = null) {
  const c = typeof chord === 'string' ? parseChordName(chord) : chord;
  if (c && c.rootPc != null) {
    const rootName = /^([A-G][#b]?)/.exec(c.name || '')?.[1];
    if (rootName) {
      const spelled = toSolfege(spellChordTone(rootName, pcOf(midi - c.rootPc), c.quality || ''));
      if (spelled) return spelled;
    }
  }
  return FLAT_NAMES[pcOf(midi)];
}

/** Nom français avec l'octave (« Do4 », « Sib3 »). */
export function frenchNoteName(midi, chord = null) {
  return `${frenchPitchName(midi, chord)}${Math.floor(midi / 12) - 1}`;
}

const DEGREE_WORDS = {
  1: 'fondamentale', 3: '3ce', b3: '3ce', 5: 'quinte', b5: 'quinte diminuée', '#5': 'quinte augmentée',
  7: '7e majeure', b7: '7e', bb7: '7e diminuée', 6: '6te', 9: '9e', b9: 'b9', '#9': '#9',
  11: '11e', '#11': '#11', 13: '13e', b13: 'b13', 4: 'quarte', 2: 'seconde',
};

/** Degré en toutes lettres pour une légende (« 7e », « 3ce », « 9e »). */
export function degreeWord(degree) {
  return DEGREE_WORDS[degree] || degree;
}

const isSeventh = (d) => d === '7' || d === 'b7' || d === 'bb7';
const isThird = (d) => d === '3' || d === 'b3';

/** Notes au-dessus de la basse (la basse de la main gauche ne « conduit » pas les voix). */
function upperVoices(chord) {
  const lh = [...(chord.leftHand || [])].sort((a, b) => a - b);
  const rh = [...(chord.rightHand || [])].sort((a, b) => a - b);
  if (rh.length === 0) return lh.length > 1 ? lh.slice(1) : lh;
  return [...lh.slice(1), ...rh];
}

/**
 * Conduite des voix d'un accord au suivant (voix du dessus, basse exclue) :
 * notes communes et mouvements d'un ou deux demi-tons, avec le degré de départ
 * et d'arrivée. `text` résume le plus parlant : la 7e qui descend sur la 3ce
 * de l'accord suivant, puis une note commune qui change de rôle.
 * @param {{name: string, leftHand?: number[], rightHand?: number[]}} a
 * @param {{name: string, leftHand?: number[], rightHand?: number[]}} b
 * @returns {{moves: {from: number, to: number, fromDegree: string, toDegree: string, kind: 'common'|'step'|'resolution'}[], text: string}}
 */
export function describeVoiceLeading(a, b) {
  const ca = parseChordName(a?.name);
  const cb = parseChordName(b?.name);
  if (!ca || !cb) return { moves: [], text: '' };
  const fromNotes = upperVoices(a);
  const toNotes = upperVoices(b);
  const degA = new Map(noteRoles(ca, fromNotes).map((r) => [r.midi, r.degree]));
  const degB = new Map(noteRoles(cb, toNotes).map((r) => [r.midi, r.degree]));
  const used = new Set();
  const moves = [];
  // Notes communes d'abord, puis mouvements conjoints (le plus petit d'abord).
  for (const n of fromNotes) {
    if (toNotes.includes(n) && !used.has(n)) {
      used.add(n);
      moves.push({ from: n, to: n, fromDegree: degA.get(n), toDegree: degB.get(n), kind: 'common' });
    }
  }
  const pending = fromNotes.filter((n) => !moves.some((m) => m.from === n));
  const candidates = [];
  for (const n of pending) {
    for (const m of toNotes) {
      const d = Math.abs(m - n);
      if (d >= 1 && d <= 2 && !used.has(m)) candidates.push({ n, m, d });
    }
  }
  candidates.sort((x, y) => x.d - y.d);
  const moved = new Set();
  for (const { n, m } of candidates) {
    if (moved.has(n) || used.has(m)) continue;
    moved.add(n);
    used.add(m);
    const fromDegree = degA.get(n);
    const toDegree = degB.get(m);
    const kind = isSeventh(fromDegree) && isThird(toDegree) && m < n ? 'resolution' : 'step';
    moves.push({ from: n, to: m, fromDegree, toDegree, kind });
  }
  const name = (n, c) => frenchPitchName(n, c);
  const guide = (d) => isSeventh(d) || isThird(d);
  const parts = [];
  const resolution = moves.find((m) => m.kind === 'resolution');
  if (resolution) {
    parts.push(`${name(resolution.from, ca)} (${degreeWord(resolution.fromDegree)}) descend sur ${name(resolution.to, cb)}, la ${degreeWord(resolution.toDegree)} de ${cb.name}`);
  } else {
    // Sinon : une voix qui part d'une note guide, ou qui arrive sur la 3ce / 7e
    // de l'accord suivant (triades : la quinte de F qui descend sur la 3ce de G).
    const step = moves.find((m) => m.kind === 'step' && guide(m.fromDegree))
      || moves.find((m) => m.kind === 'step' && guide(m.toDegree));
    if (step) {
      parts.push(`${name(step.from, ca)} (${degreeWord(step.fromDegree)}) ${step.to < step.from ? 'descend' : 'monte'} sur ${name(step.to, cb)} (${degreeWord(step.toDegree)} de ${cb.name})`);
    }
  }
  const common = moves.find((m) => m.kind === 'common' && m.fromDegree && m.toDegree && m.fromDegree !== m.toDegree
    && (guide(m.toDegree) || guide(m.fromDegree)))
    || (parts.length === 0 ? moves.find((m) => m.kind === 'common' && m.fromDegree && m.toDegree && m.fromDegree !== m.toDegree) : null);
  if (common) parts.push(`${name(common.from, ca)} reste (${degreeWord(common.fromDegree)} → ${degreeWord(common.toDegree)})`);
  return { moves, text: parts.join(' ; ') };
}

/**
 * Rôle d'une note d'une ligne (lick, gamme, arpège, run) sur l'accord qui
 * sonne, en tenant compte de la note suivante (approche, passage).
 * @returns {{kind: string, label: string, text: string}}
 */
export function lineNoteRole(midi, chord, prev, next) {
  const c = chord ? parseChordName(chord) : null;
  const name = frenchPitchName(midi, c);
  if (!c) return { kind: 'target', label: name, text: frenchNoteName(midi) };
  const role = noteRoles(c, [midi])[0];
  if (role.inChord && role.kind !== 'outside') return { kind: role.kind, label: role.degree, text: `${name} : ${degreeWord(role.degree)} de ${c.name}` };
  // Entre deux notes à un demi-ton, dans le même sens : passage chromatique,
  // même si la note est aussi une tension (Mib entre Ré et Mi sur G7).
  if (Number.isFinite(prev) && Number.isFinite(next) && Math.abs(next - midi) === 1 && Math.abs(midi - prev) === 1
    && Math.sign(next - midi) === Math.sign(midi - prev)) {
    const spelled = (next > midi ? SHARP_NAMES : FLAT_NAMES)[pcOf(midi)];
    const target = noteRoles(c, [next])[0];
    const arrival = target && (target.inChord || target.tension) && target.kind !== 'outside' ? `, la ${degreeWord(target.degree)} de ${c.name}` : '';
    return { kind: 'passing', label: next > midi ? '↗' : '↘', text: `${spelled} : passage chromatique de ${frenchPitchName(prev, c)} vers ${frenchPitchName(next, c)}${arrival}` };
  }
  if (role.tension) return { kind: 'color', label: role.degree, text: `${name} : ${degreeWord(role.degree)}, couleur de ${c.name}` };
  const nextRole = Number.isFinite(next) ? noteRoles(c, [next])[0] : null;
  const nextIsChordTone = nextRole && (nextRole.inChord || nextRole.tension);
  if (nextIsChordTone && Math.abs(next - midi) === 1) {
    // Approche par en dessous écrite en dièse (Ré# vers Mi), par au-dessus en bémol.
    const below = next > midi;
    const approach = (below ? SHARP_NAMES : FLAT_NAMES)[pcOf(midi)];
    return { kind: 'passing', label: below ? '↗' : '↘', text: `${approach} : approche chromatique de ${frenchPitchName(next, c)}, la ${degreeWord(nextRole.degree)} de ${c.name}` };
  }
  if (Number.isFinite(prev) && Number.isFinite(next) && Math.abs(next - midi) <= 2 && Math.abs(midi - prev) <= 2
    && Math.sign(next - midi) === Math.sign(midi - prev)) {
    return { kind: 'passing', label: '·', text: `${name} : note de passage (de ${frenchPitchName(prev, c)} à ${frenchPitchName(next, c)})` };
  }
  return { kind: 'outside', label: degreeOf(role.interval, c.quality), text: `${name} : note étrangère à ${c.name}` };
}
