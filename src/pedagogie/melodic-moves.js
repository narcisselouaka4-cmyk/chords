// [Claude] — 2026-10-04 — Pédagogie IA : ce que font les LIGNES du prof (mouvements mélodiques).
//
// Narcisse : « Faut qu'ils sachent discerner. À quel moment il lick, à quel moment il fait
// un mouvement pour arriver à une destination, ou alors plutôt pour remplacer un accord
// structurel. »
//
// Dans les notes exactes du prof, main par main, les lignes (une note seule, ou le dessus
// d'une note doublée à la main droite, le dessous à la gauche), découpées en phrases (plus de
// 0,6 s de silence, ou un accord plaqué, les séparent). Chaque phrase est :
//   - une APPROCHE si elle mène à l'accord suivant de la structure : sa dernière note tombe
//     au changement d'accord, sur une note de l'accord d'arrivée (fondamentale, tierce,
//     quinte, septième), atteinte par un pas (un ou deux demi-tons) ; à la main gauche, une
//     marche de basse qui arrive sur la fondamentale ;
//   - un REMPLACEMENT si elle occupe la place d'un accord de la boucle qui n'est pas joué à
//     ce tour (sauté, ou remplacé : song-structure.js) ;
//   - sinon un LICK sur l'accord qui sonne, décrit par le rôle de ses notes (9 · 1 · b7 ·
//     13 ; entre parenthèses, une note étrangère à l'accord), notes bleues signalées.
//
// Fonctions pures, testées dans test-melodic-moves.js.

import { parseChordName, degreeOf, availableTensions } from './note-roles.js';
import { guessHands } from './teacher-notes.js';
import { noteLabel, chordFamily } from './tutorial-transfer.js';
import { chordToneIntervals } from '../practice-exercise.js';
import { degreeLabel } from './song-structure.js';

const pcOf = (n) => ((n % 12) + 12) % 12;
/** Un silence plus long sépare deux phrases. */
const PHRASE_GAP = 0.6;
/** Les lignes d'un long passage sont lues sur ses dernières secondes. */
const LINES_SECONDS = 90;
/** La dernière note d'une approche tombe au changement d'accord, à cela près. */
const LANDING = 0.35;
// Notes d'arrivée d'une approche : fondamentale, tierces, quinte, sixte (accord de sixte), septièmes.
const TARGETS = new Set([0, 3, 4, 7, 9, 10, 11]);

const clock = (t) => {
  const s = Math.max(0, Math.floor((Number(t) || 0) + 1e-6));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

/** La grille, lue : accords triés, avec fondamentale et qualité. */
function readGrid(chords) {
  return [...(chords || [])].filter((c) => Number.isFinite(c?.start)).sort((a, b) => a.start - b.start)
    .map((c) => ({ ...parseChordName(c.label || c.name), start: c.start }))
    .filter((c) => c.name);
}

/** L'accord de la grille qui sonne à l'instant t (le dernier commencé). */
function chordAt(grid, t) {
  let found = null;
  for (const c of grid) if (c.start <= t + 0.05) found = c;
  return found;
}

/**
 * Les lignes d'une main, en phrases : une attaque d'une ou deux notes en est une note (le
 * dessus à droite, le dessous à gauche) ; un accord plaqué (trois notes ou plus) coupe la
 * phrase, comme un silence de plus de 0,6 s.
 */
function linePhrases(notes, hand) {
  const mine = notes.filter((n) => n.hand === hand).sort((a, b) => a.start - b.start || a.midi - b.midi);
  const clusters = [];
  // Un accord un peu roulé (attaques à 20 ms les unes des autres) reste un accord.
  for (const n of mine) {
    const last = clusters[clusters.length - 1];
    if (last && n.start - last[last.length - 1].start <= 0.04) last.push(n);
    else clusters.push([n]);
  }
  const phrases = [];
  let current = [];
  for (const group of clusters) {
    if (group.length >= 3) {
      // Un accord plaqué juste après la ligne : elle y arrive, sur la note de l'accord la plus
      // proche de sa dernière note.
      const last = current[current.length - 1];
      if (last && group[0].start - last.start <= PHRASE_GAP) {
        current.landing = group.reduce((pick, n) => (Math.abs(n.midi - last.midi) < Math.abs(pick.midi - last.midi) ? n : pick));
      }
      if (current.length) phrases.push(current);
      current = [];
      continue;
    }
    const note = group.reduce((pick, n) => ((hand === 'lh' ? n.midi < pick.midi : n.midi > pick.midi) ? n : pick));
    const last = current[current.length - 1];
    if (last && note.start - last.start > PHRASE_GAP) {
      phrases.push(current);
      current = [];
    }
    current.push(note);
  }
  if (current.length) phrases.push(current);
  return phrases;
}

/** Les changements d'accord de la structure (là où une approche peut arriver). */
function structureChanges(structure) {
  const out = [];
  for (const s of structure?.sections || []) {
    if (s.kind === 'loop') {
      for (const x of s.timeline || []) if (x.kind !== 'missing') out.push({ at: x.at, name: x.name, degree: x.kind === 'fit' ? x.expected.degree : x.degree });
    } else {
      for (const c of s.chords || []) out.push({ at: c.at, name: c.name, degree: c.degree });
    }
  }
  return out.sort((a, b) => a.at - b.at);
}

/**
 * Les accords de la boucle absents à leur tour, et le moment où ils auraient sonné : un
 * accord sauté, juste avant l'accord qui vient à sa place (la durée d'un accord de la
 * boucle) ; un accord remplacé, pendant celui qui le remplace.
 */
function absentChords(structure) {
  const out = [];
  for (const s of structure?.sections || []) {
    if (s.kind !== 'loop') continue;
    const slot = s.secondsPerCycle / Math.max(1, s.period);
    for (const x of s.timeline || []) {
      if (x.kind === 'missing') out.push({ from: x.at - slot, to: x.at, expected: x.expected, played: null });
      else if (x.kind === 'sub') out.push({ from: x.at, to: x.at + slot, expected: x.expected, played: { name: x.name, degree: x.degree } });
    }
  }
  return out;
}

const ROLE_WORDS = { 1: 'fondamentale', 3: 'tierce', b3: 'tierce', 5: 'quinte', b5: 'quinte bémol', '#5': 'quinte augmentée', 6: 'sixte', 7: 'septième', b7: 'septième' };

/**
 * Ce que font les lignes du prof dans un passage : lick, approche, remplacement.
 * @param {{notes: object[], chords: object[], structure?: object|null, start?: number, end?: number}} input
 * @returns {object[]} mouvements, dans l'ordre du temps
 */
export function lineMoves({ notes = [], chords = [], structure = null, start: from = 0, end = Infinity } = {}) {
  // Un long passage : ses 90 dernières secondes (« ce qu'il vient de faire » ; huit lignes
  // au plus sont dites au Copilote).
  const start = Number.isFinite(end) ? Math.max(from, end - LINES_SECONDS) : from;
  // Les accords de la structure (relus, sans les notes seules prises pour des accords).
  const grid = readGrid(structure?.grid?.length ? structure.grid : chords);
  const usable = (notes || []).filter((n) => Number.isFinite(n?.midi) && Number.isFinite(n?.start))
    .map((n) => ({ ...n, end: Number.isFinite(n.end) ? n.end : n.start + 0.2 }));
  const handed = guessHands(usable.filter((n) => n.start >= start - 2 && n.start < end + 0.5));
  const changes = structureChanges(structure);
  const absent = absentChords(structure);
  const key = structure?.key || null;
  const degreeOfChord = (c) => (key && c ? degreeLabel(key, { rootPc: c.rootPc, family: chordFamily(c.quality) }) : null);
  const moves = [];
  for (const hand of ['rh', 'lh']) {
    for (const phrase of linePhrases(handed, hand)) {
      const first = phrase[0];
      // La dernière note de la ligne, ou celle de l'accord où elle arrive.
      const last = phrase.landing || phrase[phrase.length - 1];
      const beforeLast = phrase.landing ? phrase[phrase.length - 1] : phrase[phrase.length - 2];
      // Le passage : une phrase qui y joue au moins une note.
      if (!phrase.some((n) => n.start >= start - 0.01 && n.start < end)) continue;
      if (phrase.length < (hand === 'lh' ? 2 : 3)) continue;
      const notesOf = [...phrase, ...(phrase.landing ? [phrase.landing] : [])].map((n) => n.midi);
      const rise = last.midi - first.midi;
      const direction = rise > 0 ? 'montée' : rise < 0 ? 'descente' : 'ligne';
      // Une approche : la dernière note tombe à un changement d'accord, sur une note de
      // l'accord d'arrivée, atteinte par un pas (une marche de basse : sur sa fondamentale).
      let leads = null;
      const arrival = changes.find((c) => c.at > first.start + 0.05 && Math.abs(last.start - c.at) <= LANDING);
      const target = arrival ? parseChordName(arrival.name) || chordAt(grid, arrival.at) : null;
      if (target) {
        const interval = pcOf(last.midi - target.rootPc);
        const leap = Math.abs(last.midi - beforeLast.midi);
        const onTone = TARGETS.has(interval) && chordToneIntervals(target.quality).has(interval);
        if (onTone && (leap <= 2 || (hand === 'lh' && interval === 0 && leap <= 5))) {
          leads = { to: { name: arrival.name, degree: arrival.degree, at: arrival.at }, lands: { midi: last.midi, role: degreeOf(interval, target.quality) } };
        }
      }
      // 1. Un remplacement : la ligne occupe la place d'un accord de la boucle absent à ce
      //    tour (elle peut aussi mener à l'accord suivant).
      const gap = absent.find((x) => first.start < x.to - 0.05 && last.start > x.from + 0.05);
      if (gap) {
        moves.push({ kind: 'remplacement', hand, start: first.start, end: last.start, notes: notesOf, direction, instead: gap.expected, played: gap.played, ...(leads || {}) });
        continue;
      }
      // 2. Une approche.
      if (leads) {
        moves.push({ kind: 'approche', hand, start: first.start, end: last.start, notes: notesOf, direction, ...leads });
        continue;
      }
      // 3. Un lick, sur l'accord qui sonne : à la main droite, quatre notes au moins (à la
      //    main gauche, une basse fondamentale-quinte n'est pas un lick).
      if (hand === 'lh' || phrase.length < 4) continue;
      const chord = chordAt(grid, first.start);
      if (!chord) continue;
      let blue = false;
      // Le rôle de chaque note dans l'accord qui sonne dessous ; un lick qui passe d'un
      // accord au suivant est décrit accord par accord (« … | … »).
      const parts = [];
      for (const n of phrase) {
        const under = chordAt(grid, n.start) || chord;
        const interval = pcOf(n.midi - under.rootPc);
        const family = chordFamily(under.quality);
        if ((family === 'major' || family === 'dominant') && (interval === 3 || interval === 6)) blue = true;
        const fits = chordToneIntervals(under.quality).has(interval) || availableTensions(under.quality).has(interval);
        const degree = degreeOf(interval, under.quality);
        if (parts[parts.length - 1]?.chord !== under) parts.push({ chord: under, roles: [] });
        parts[parts.length - 1].roles.push(fits ? degree : `(${degree})`);
      }
      moves.push({
        kind: 'lick',
        hand,
        start: first.start,
        end: last.start,
        notes: notesOf,
        over: { name: chord.name, degree: degreeOfChord(chord) },
        overs: parts.map((p) => ({ name: p.chord.name, degree: degreeOfChord(p.chord) })),
        roles: parts.flatMap((p) => p.roles),
        rolesByChord: parts.map((p) => p.roles),
        blue,
      });
    }
  }
  return moves.sort((a, b) => a.start - b.start || (a.hand === 'lh' ? 1 : -1));
}

const HAND_WORDS = { rh: 'main droite', lh: 'main gauche' };

/** « 0:06–0:07 » (ou « 0:06 » si la phrase tient dans la seconde). */
const span = (m) => (clock(m.start) === clock(m.end) ? clock(m.start) : `${clock(m.start)}–${clock(m.end)}`);

/**
 * Le bloc « Lignes du prof ici » du contexte du Copilote.
 * @param {object[]} moves - lineMoves()
 * @returns {string[]}
 */
export function movesLines(moves, { max = 8 } = {}) {
  if (!moves?.length) return [];
  const sharps = false;
  const out = ['Lignes du prof ici (calculées d\'après ses notes : lick sur un accord, approche qui mène à l\'accord suivant, ou ligne à la place d\'un accord de la boucle) :'];
  for (const m of moves.slice(0, max)) {
    const where = `${span(m)} ${HAND_WORDS[m.hand]}`;
    const melody = m.notes.map((midi) => noteLabel(midi, { sharps })).join(' ');
    const lands = (x) => `elle arrive sur sa ${ROLE_WORDS[x.lands.role] || x.lands.role} (${noteLabel(x.lands.midi, { sharps })}) à ${clock(x.to.at)}`;
    if (m.kind === 'approche') {
      const what = m.hand === 'lh' ? 'marche de basse' : m.direction;
      out.push(`- ${where} : ${what} (${melody}) qui mène au ${m.to.degree} (${m.to.name}) : ${lands(m)}.`);
    } else if (m.kind === 'remplacement') {
      const instead = `à la place du ${m.instead.degree} (${m.instead.name}) de la boucle${m.played ? `, remplacé par ${m.played.name} à ce tour` : ', qui n\'est pas joué à ce tour'}`;
      out.push(`- ${where} : ligne (${melody}) ${instead}${m.to ? ` ; elle mène au ${m.to.degree} (${m.to.name}) : ${lands(m)}` : ''}.`);
    } else {
      const overs = (m.overs || [m.over]).map((o) => `${o.name}${o.degree ? ` (le ${o.degree})` : ''}`).join(' puis ');
      const roles = (m.rolesByChord || [m.roles]).map((r) => r.join(' · ')).join(' | ');
      out.push(`- ${where} : lick sur ${overs} — ${roles}${m.blue ? ' (avec des notes bleues : tierce mineure ou quinte bémol sur un accord majeur)' : ''}.`);
    }
  }
  if (moves.length > max) out.push(`- … et ${moves.length - max} autre${moves.length - max > 1 ? 's' : ''}.`);
  return out;
}
