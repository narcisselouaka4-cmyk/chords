// [Claude] — 2026-09-25 — Ce que le clavier montre pendant un exemple du Copilote.
//
// Narcisse veut que le clavier « mette en surbrillance ce qu'elle fait, comme
// une sorte de tuto interactif ». Pour chaque moment d'un exemple (un accord
// d'une progression, une note d'un lick, d'une gamme, d'un arpège, d'un run),
// ce module prépare les marques des touches (rôle de chaque note, voix qui va
// bouger) et une phrase de légende :
//   « Dm9 → G13 : Do (7e) descend sur Si, la 3ce de G13 ; Fa reste (3ce → 7e) »
//   « Ré# : approche chromatique de Mi, la 3ce de C »
// Tout est calculé depuis les notes réellement jouées par l'exemple ; rien
// n'est demandé au modèle.

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

/** « Ré (fondamentale) | Fa (3ce) La (quinte) Do (7e) Mi (9e) » : les deux mains d'un accord. */
function handsSummary(chord, c) {
  const roleOf = new Map(noteRoles(c, [...(chord.leftHand || []), ...(chord.rightHand || [])]).map((r) => [r.midi, r.degree]));
  const side = (notes) => [...notes].sort((x, y) => x - y)
    .map((n) => `${frenchPitchName(n, c)} (${degreeWord(roleOf.get(n))})`).join(' ');
  const lh = side(chord.leftHand || []);
  const rh = side(chord.rightHand || []);
  return [lh, rh].filter(Boolean).join(' | ');
}

/**
 * Marques et légende de chaque accord d'un exemple (un accord = un moment) :
 * rôle de chaque note, voix qui va bouger vers l'accord suivant (anneau), et la
 * phrase qui dit pourquoi.
 * @param {{name: string, leftHand?: number[], rightHand?: number[]}[]} chords
 * @returns {{marks: object[], caption: string}[]}
 */
export function chordExampleSteps(chords) {
  const list = chords || [];
  const leadings = list.map((c, i) => (list[i + 1] ? describeVoiceLeading(c, list[i + 1]) : null));
  return list.map((chord, i) => {
    const c = parseChordName(chord.name);
    const notes = [...(chord.leftHand || []), ...(chord.rightHand || [])];
    if (!c || notes.length === 0) return { marks: notes.map((midi) => ({ midi, kind: 'target', label: '' })), caption: chord.name || '' };
    const leading = leadings[i];
    const moving = new Set((leading?.moves || []).filter((m) => m.kind !== 'common').map((m) => m.from));
    const marks = noteRoles(c, notes).map((r) => ({ midi: r.midi, kind: r.kind, label: r.degree, moving: moving.has(r.midi) }));
    let caption;
    if (list.length === 1) {
      caption = `${chord.name} : ${handsSummary(chord, c)}`;
    } else if (leading) {
      caption = `${chord.name} → ${list[i + 1].name}${leading.text ? ` : ${leading.text}` : ''}`;
    } else {
      // Dernier accord : où la voix qui a bougé est arrivée.
      const previous = leadings[i - 1];
      const resolution = previous?.moves.find((m) => m.kind === 'resolution');
      caption = resolution
        ? `${chord.name} : la 7e de ${list[i - 1].name} (${frenchPitchName(resolution.from, list[i - 1].name)}) est arrivée sur ${frenchPitchName(resolution.to, c)}, la ${degreeWord(resolution.toDegree)}`
        : `${chord.name} : ${handsSummary(chord, c)}`;
    }
    return { marks, caption };
  });
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

/**
 * Moments d'un exemple fait de notes (lick, gamme, arpège, run, notes isolées,
 * lignes de guide tones) : un moment par attaque (notes attaquées ensemble =
 * un moment). Les marques montrent toute la forme sous l'accord en cours (les
 * notes à venir comprises, avec leur rôle) ; la légende dit le rôle de la note
 * jouée. Des notes attaquées ensemble et portant un accord sont lues comme cet
 * accord (conduite des voix comprise).
 * @param {{midi: number, startOffsetMs: number, hand?: string, chord?: string}[]} notes
 * @param {{chord?: string}} [options] - accord de toute la ligne (lick sur G7)
 * @returns {{time: number, marks: object[], caption: string}[]} time en millisecondes
 */
export function notesExampleSteps(notes, { chord = '' } = {}) {
  const list = [...(notes || [])].filter((n) => Number.isFinite(n.midi))
    .sort((a, b) => (a.startOffsetMs || 0) - (b.startOffsetMs || 0) || a.midi - b.midi);
  if (list.length === 0) return [];
  const chordOf = (n) => (n.chord && parseChordName(n.chord) ? n.chord : chord && parseChordName(chord) ? chord : '');
  // Attaques groupées (±30 ms).
  const groups = [];
  for (const n of list) {
    const t = n.startOffsetMs || 0;
    const last = groups[groups.length - 1];
    if (last && t - last.time <= 30 && chordOf(n) === last.chord) last.notes.push(n);
    else groups.push({ time: t, chord: chordOf(n), notes: [n] });
  }
  // Groupes de plusieurs notes portant un accord : ce sont des accords.
  const blocks = groups.every((g) => g.notes.length >= 2 && g.chord);
  if (blocks) {
    const chords = groups.map((g) => ({
      name: g.chord,
      leftHand: g.notes.filter((n) => String(n.hand).toUpperCase() === 'LH').map((n) => n.midi),
      rightHand: g.notes.filter((n) => String(n.hand).toUpperCase() !== 'LH').map((n) => n.midi),
    }));
    return chordExampleSteps(chords).map((s, i) => ({ ...s, time: groups[i].time }));
  }
  // Forme de chaque accord : toutes les notes jouées sous lui, avec leur rôle.
  const flat = groups.flatMap((g) => g.notes.map((n) => ({ midi: n.midi, chord: g.chord })));
  const roleCache = new Map();
  const roleAt = (i) => {
    if (!roleCache.has(i)) roleCache.set(i, lineNoteRole(flat[i].midi, flat[i].chord, flat[i - 1]?.midi, flat[i + 1]?.midi));
    return roleCache.get(i);
  };
  const shapeMarks = (chordName) => {
    const marks = [];
    flat.forEach((n, i) => {
      if (n.chord !== chordName || marks.some((m) => m.midi === n.midi)) return;
      const r = roleAt(i);
      marks.push({ midi: n.midi, kind: r.kind, label: r.label });
    });
    return marks;
  };
  let index = 0;
  return groups.map((g) => {
    const first = index;
    index += g.notes.length;
    let caption;
    if (g.notes.length === 1) {
      caption = roleAt(first).text;
    } else {
      const names = g.notes.map((n, k) => roleAt(first + k).text.split(' : ')[0]).join(' ');
      caption = g.chord ? `${g.chord} : ${names}` : g.notes.map((n) => frenchNoteName(n.midi)).join(' ');
    }
    return { time: g.time, marks: shapeMarks(g.chord), caption };
  });
}
