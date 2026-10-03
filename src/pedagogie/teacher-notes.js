// [Claude] — 2026-09-25 — Les notes du professeur, gardées telles qu'elles sont jouées.
//
// Narcisse : « quand je demande à Copilot de me jouer un lick joué dans le
// tutoriel, il n'est pas capable de le faire. De même pour un voicing : il
// paraît qu'il manque d'informations ». L'analyse d'un tutoriel ne gardait que
// des noms d'accords (le regroupement en accords écartait les notes brèves, les
// licks) ; le Copilote ne recevait que le chemin du fichier.
//
// Ici, les notes lues sont gardées avec leur début, leur fin et leur main :
//   - clavier dessiné (Synthesia) : touches allumées image par image, la main
//     d'après la couleur ;
//   - vrai clavier filmé (V2N) : notes de V2N ;
//   - pianiste filmé de côté : notes de la transcription du son (piano-transcriber.py).
// Le Copilote en reçoit une frise compacte, et ses outils rejouent les notes
// exactes d'un passage (transposables pour une autre chanson) ou les montrent
// au clavier. Module pur (testé en Node).

import { frenchNoteName } from './example-guide.js';
import { buildNotesExample } from './copilot-demo.js';
import { parseChordName } from './note-roles.js';

const pcOf = (n) => ((n % 12) + 12) % 12;
const round2 = (x) => Math.round(x * 100) / 100;

/**
 * Touches allumées image par image (clavier dessiné) → notes : une note par
 * suite d'images où la touche reste allumée.
 * @param {{t: number, keys: {midi: number, hand?: string}[]}[]} samples
 * @param {number} interval - secondes entre deux images lues
 * @returns {{midi: number, start: number, end: number, hand: 'lh'|'rh'|null}[]}
 */
export function samplesToNoteEvents(samples, interval) {
  const open = new Map();
  const notes = [];
  const step = Number(interval) > 0 ? Number(interval) : 0.25;
  const close = (midi, t) => {
    const o = open.get(midi);
    if (!o) return;
    notes.push({ midi, start: round2(o.start), end: round2(t), hand: o.hand });
    open.delete(midi);
  };
  let lastT = 0;
  for (const s of samples || []) {
    const t = Number(s.t) || 0;
    lastT = t;
    const lit = new Map((s.keys || []).map((k) => [k.midi, k]));
    for (const midi of [...open.keys()]) if (!lit.has(midi)) close(midi, t);
    for (const [midi, k] of lit) {
      if (!open.has(midi)) open.set(midi, { start: t, hand: handOf(k.hand) });
    }
  }
  for (const midi of [...open.keys()]) close(midi, lastT + step);
  return notes.sort((a, b) => a.start - b.start || a.midi - b.midi);
}

function handOf(value) {
  const v = String(value || '').toLowerCase();
  if (v.startsWith('l')) return 'lh';
  if (v.startsWith('r')) return 'rh';
  return null;
}

/**
 * Notes de V2N ({midi, onset, offset}) ou de la transcription du son
 * ({midi, onset, offset, velocity}) → notes du professeur.
 */
export function eventsFromTranscription(list) {
  return (list || [])
    .filter((n) => Number.isFinite(n?.midi) && Number.isFinite(n?.onset))
    .map((n) => ({
      midi: Math.round(n.midi),
      start: round2(n.onset),
      end: round2(Number.isFinite(n.offset) && n.offset > n.onset ? n.offset : n.onset + 0.25),
      hand: handOf(n.hand),
      ...(Number.isFinite(n.velocity) ? { velocity: n.velocity > 1 ? n.velocity / 127 : n.velocity } : {}),
    }))
    .sort((a, b) => a.start - b.start || a.midi - b.midi);
}

/**
 * Mains des notes sans couleur (V2N, son) : à chaque instant, les notes sous
 * la plus grande coupure (une quinte au moins) sont à la main gauche ; une note
 * seule, d'après sa place (sous Do4 : main gauche).
 */
export function guessHands(notes) {
  return (notes || []).map((n, i, all) => {
    if (n.hand) return n;
    const together = all.filter((m) => m.start < n.end && m.end > n.start).map((m) => m.midi).sort((a, b) => a - b);
    let cut = null;
    let widest = 0;
    for (let k = 1; k < together.length; k += 1) {
      const gap = together[k] - together[k - 1];
      if (gap > widest) { widest = gap; cut = together[k]; }
    }
    const hand = widest >= 7 && cut != null ? (n.midi < cut ? 'lh' : 'rh') : (n.midi < 60 ? 'lh' : 'rh');
    return { ...n, hand };
  });
}

/** Notes attaquées entre start et end (secondes), main au choix. */
export function notesInRange(notes, start, end, { hand = null } = {}) {
  const h = handOf(hand);
  return (notes || []).filter((n) => n.start >= start - 0.02 && n.start < end && (!h || n.hand === h));
}

/** Notes qui sonnent à l'instant t. */
export function notesAt(notes, t) {
  return (notes || []).filter((n) => n.start <= t + 0.05 && n.end > t);
}

const clock = (t) => {
  const s = Math.max(0, t);
  return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
};

/**
 * Frise compacte pour le Copilote : pour chaque accord de la grille, les notes
 * du professeur main gauche | main droite ; entre les accords (ou sans grille),
 * les lignes (licks, gammes) dans l'ordre. Bornée (`maxLines`).
 * @param {object[]} notes - notes du professeur
 * @param {{start: number, end: number, label?: string}[]} segments - grille datée
 * @returns {string[]}
 */
export function compactTimeline(notes, segments = [], { maxLines = 80 } = {}) {
  const list = guessHands(notes || []);
  if (!list.length) return [];
  const out = [];
  // [Claude] — 2026-09-25 — Notes écrites d'après l'accord de la grille : le
  // Fa# d'un D9 s'écrivait « Solb3 » (tutoriel Amazing Grace, 0:47).
  const name = (n, label = null) => frenchNoteName(n.midi, label);
  const hands = (group, label = null) => {
    const lh = group.filter((n) => n.hand === 'lh').map((n) => name(n, label));
    const rh = group.filter((n) => n.hand !== 'lh').map((n) => name(n, label));
    return `${lh.join(' ') || '—'} | ${rh.join(' ') || '—'}`;
  };
  const segs = (segments || []).filter((s) => Number.isFinite(s.start)).sort((a, b) => a.start - b.start);
  if (segs.length) {
    for (const seg of segs) {
      const inSeg = notesInRange(list, seg.start, seg.end);
      if (!inSeg.length) continue;
      // Attaques ensemble (±60 ms) = l'accord ; le reste = une ligne.
      const first = inSeg[0].start;
      const chord = inSeg.filter((n) => n.start - first < 0.06);
      const line = inSeg.filter((n) => n.start - first >= 0.06);
      const label = seg.label || null;
      out.push(`- ${clock(seg.start)} ${label || '?'} : ${hands(chord, label)}${line.length ? ` · puis ${line.slice(0, 16).map((n) => `${name(n, label)}${n.hand === 'lh' ? '(g)' : ''}`).join(' ')}${line.length > 16 ? ' …' : ''}` : ''}`);
      if (out.length >= maxLines) break;
    }
  } else {
    // Sans grille : des groupes de huit secondes.
    const end = Math.max(...list.map((n) => n.end));
    for (let t = 0; t < end && out.length < maxLines; t += 8) {
      const group = notesInRange(list, t, t + 8);
      if (group.length) out.push(`- ${clock(t)} : ${group.slice(0, 20).map((n) => `${name(n)}${n.hand === 'lh' ? '(g)' : ''}`).join(' ')}${group.length > 20 ? ' …' : ''}`);
    }
  }
  if (out.length >= maxLines) out.push('- … (suite de la vidéo non détaillée ici : demande un moment précis)');
  return out;
}

/**
 * Demi-tons pour transposer un passage d'une tonalité à une autre
 * (« en Fa », « F », « Sib ») ; le plus petit déplacement (−5 à +6).
 */
export function transposeInterval(fromKey, toKey) {
  const from = keyRoot(fromKey);
  const to = keyRoot(toKey);
  if (from == null || to == null) return 0;
  let d = pcOf(to - from);
  if (d > 6) d -= 12;
  return d;
}

const SOLFEGE = { do: 0, re: 2, 'ré': 2, mi: 4, fa: 5, sol: 7, la: 9, si: 11 };
function keyRoot(key) {
  // [Claude] — 2026-10-03 — « Fa♯ », « Si♭ » (noms affichés par Pédagogie IA) : ♯ et ♭ lus.
  const text = String(key || '').trim().replace(/♯/g, '#').replace(/♭/g, 'b');
  if (!text) return null;
  const fr = /^(do|ré|re|mi|fa|sol|la|si)\s*(#|b|dièse|bémol)?/i.exec(text);
  if (fr) return pcOf(SOLFEGE[fr[1].toLowerCase()] + (/^(#|dièse)/i.test(fr[2] || '') ? 1 : fr[2] ? -1 : 0));
  const c = parseChordName(text.replace(/\s*(majeur|mineur|major|minor)$/i, ''));
  return c ? c.rootPc : null;
}

const ROOT_SPELLING = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
const LETTER_PCS = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/**
 * Nom d'accord de la grille transposé (« Dm9 » + 3 → « Fm9 », basse comprise :
 * « C/E » + 2 → « D/F# »). Le suffixe est gardé tel quel.
 */
export function transposeChordLabel(label, semitones) {
  const shift = Math.round(Number(semitones) || 0);
  const text = String(label || '');
  if (!shift) return text;
  const move = (root) => {
    const pc = LETTER_PCS[root[0]] + (root[1] === '#' ? 1 : root[1] === 'b' ? -1 : 0);
    return ROOT_SPELLING[pcOf(pc + shift)];
  };
  return text
    .replace(/^([A-G][#b]?)/, (m) => move(m))
    .replace(/\/([A-G][#b]?)$/, (m, root) => `/${move(root)}`);
}

// [Claude] — 2026-10-03 — Le rejeu d'un passage « vrillait » vers la fin (vidéo de
// Narcisse) : chaque note durait jusqu'à la fin du passage + 1 s, et les notes s'empilaient
// (un amas de 12 notes à la fin). Désormais une note dure 2,5 s au plus et s'arrête quand
// la même touche est rejouée ; jamais plus de 10 notes ensemble (deux mains).
// Puis, ses essais sur « Amazing Grace » (9:57 → 10:57) : « il joue comme s'il n'avait pas
// de pédale, le jeu devient saccadé ». Les notes lues à l'image durent le temps de la
// touche enfoncée ; le prof, lui, tient la pédale (on l'entend). Le rejeu la tient aussi :
// la vraie, quand le relevé au son l'a donnée ; sinon une pédale « harmonique », enfoncée
// juste après chaque nouvel accord (ou nouvelle basse) et relevée juste avant le suivant.
// Et quand il s'arrête pour expliquer, la pause est ramenée à 2 s et signalée (son choix).
export const REPLAY_NOTE_SECONDS = 2.5;
export const REPLAY_MAX_TOGETHER = 10;
/** Une pause de plus de 2 s (il explique) est ramenée à 2 s. */
export const REPLAY_PAUSE_SECONDS = 2;
/** La plage la plus longue qu'on rejoue : celle du Copilote (10 min). */
export const REPLAY_MAX_SECONDS = 600;
/** Pédale harmonique : enfoncée un peu après l'accord, relevée juste avant le suivant. */
const PEDAL_DOWN_AFTER = 0.04;
const PEDAL_UP_BEFORE = 0.02;
/** Dans une pause, la pédale est relevée peu après la dernière note ; en fin de passage aussi. */
const PEDAL_RELEASE_AFTER = 0.3;
/** Notes attaquées ensemble (un accord). */
const TOGETHER = 0.06;

/**
 * Les instants où le prof change d'harmonie : attaques de main gauche (une basse, un
 * accord) ; sans main gauche, les accords d'au moins 3 notes ; et la première note.
 * @param {object[]} picked - notes triées, mains devinées
 * @returns {number[]}
 */
function harmonyChanges(picked) {
  const group = (list) => {
    const times = [];
    for (const n of list) if (!times.length || n.start - times[times.length - 1] > TOGETHER) times.push(n.start);
    return times;
  };
  const left = picked.filter((n) => n.hand === 'lh');
  let changes;
  if (left.length) changes = group(left);
  else {
    changes = [];
    let i = 0;
    while (i < picked.length) {
      let j = i;
      while (j + 1 < picked.length && picked[j + 1].start - picked[i].start <= TOGETHER) j += 1;
      if (j - i + 1 >= 3) changes.push(picked[i].start);
      i = j + 1;
    }
  }
  if (!changes.length || changes[0] > picked[0].start + TOGETHER) changes.unshift(picked[0].start);
  return changes;
}

/**
 * Passage du professeur en exemple (ses notes, ses mains, son rythme, sa pédale), une main
 * au choix, transposable (« joue-moi ce lick en Fa »). Ses touches s'allument en jaune
 * pendant l'écoute. Les notes reçues sont celles qu'il JOUE (teacher-activity.js : sans
 * celles que sa voix fait naître pendant qu'il parle).
 * @param {object[]} notes - notes du professeur
 * @param {object} options
 * @param {number} options.start
 * @param {number} options.end
 * @param {string|null} [options.hand]
 * @param {number} [options.semitones]
 * @param {string} [options.title]
 * @param {{start: number, end: number}[]|null} [options.pedals] - sa pédale, relevée au son
 * @param {{start: number, end: number, kind: string}[]} [options.speech] - moments (teacherActivity)
 * @returns {object|null} exemple (copilot-demo.js) avec `tutorialStart`, `markers` (les
 *   pauses, « le prof explique ») et `timeMap` (temps de l'exemple → temps de la vidéo)
 */
export function passageExample(notes, { start, end, hand = null, semitones = 0, title = '', pedals = null, speech = [] } = {}) {
  const from = Math.max(0, Number(start) || 0);
  const to = Math.max(from + 0.5, Math.min(Number(end) || from + 4, from + REPLAY_MAX_SECONDS));
  const picked = guessHands(notesInRange(notes, from, to, { hand }))
    .sort((a, b) => a.start - b.start || a.midi - b.midi);
  if (!picked.length) return null;
  const shift = Math.max(-12, Math.min(12, Math.round(semitones || 0)));

  // Durées : 2,5 s au plus, jusqu'à la prochaine attaque de la même touche, et pas
  // au-delà d'une demi-seconde après la fin du passage.
  const nextSame = new Map();
  const ends = new Array(picked.length);
  for (let i = picked.length - 1; i >= 0; i -= 1) {
    const n = picked[i];
    let until = Math.min(Number.isFinite(n.end) ? n.end : n.start + 0.25, n.start + REPLAY_NOTE_SECONDS, to + 0.5);
    const next = nextSame.get(n.midi);
    if (next !== undefined) until = Math.min(until, next - 0.01);
    ends[i] = Math.max(n.start + 0.12, until);
    nextSame.set(n.midi, n.start);
  }

  // Les pauses de plus de 2 s sont ramenées à 2 s ; celles où il parle sont signalées.
  const talks = (speech || []).filter((s) => s.kind === 'parle' || s.kind === 'joue-et-parle');
  const speaks = (a, b) => talks.some((s) => Math.min(b, s.end) - Math.max(a, s.start) >= Math.min(0.5, (b - a) / 2));
  const pauses = [];
  const out = [];
  let removed = 0;
  let coverEnd = from;
  for (let i = 0; i < picked.length; i += 1) {
    const n = picked[i];
    const gap = n.start - coverEnd;
    const talking = gap > 0 && speaks(coverEnd, n.start);
    // En tête de passage, un silence sans parole est simplement sauté (0,3 s).
    const kept = i === 0 && !talking ? Math.min(gap, 0.3) : REPLAY_PAUSE_SECONDS;
    if (gap > kept && (i > 0 || gap > 0.3)) {
      const exStart = coverEnd - from - removed;
      removed += gap - kept;
      if (i > 0 || talking) pauses.push({ videoStart: coverEnd, videoEnd: n.start, exStart, exEnd: exStart + kept, speaks: talking });
    }
    coverEnd = Math.max(coverEnd, ends[i]);
    out.push({ n, at: n.start - from - removed, until: ends[i] - from - removed });
  }
  // Temps de l'exemple → temps de la vidéo : un point à chaque bout de pause, droite entre deux.
  const timeMap = [[0, from]];
  for (const p of pauses) timeMap.push([p.exStart, p.videoStart], [p.exEnd, p.videoEnd]);
  timeMap.push([coverEnd - from - removed, coverEnd]);
  const toExample = (t) => {
    for (let k = 1; k < timeMap.length; k += 1) {
      const [e0, v0] = timeMap[k - 1];
      const [e1, v1] = timeMap[k];
      if (t <= v1) return v1 > v0 ? e0 + ((Math.max(t, v0) - v0) * (e1 - e0)) / (v1 - v0) : e0;
    }
    // Après la dernière note : le temps file comme dans la vidéo.
    const [eLast, vLast] = timeMap[timeMap.length - 1];
    return eLast + (t - vLast);
  };

  // Jamais plus de 10 notes ensemble : la plus ancienne s'arrête.
  const sounding = [];
  for (const o of out) {
    for (let k = sounding.length - 1; k >= 0; k -= 1) if (sounding[k].until <= o.at) sounding.splice(k, 1);
    while (sounding.length >= REPLAY_MAX_TOGETHER) {
      sounding.sort((a, b) => a.at - b.at);
      const oldest = sounding.shift();
      oldest.until = Math.max(oldest.at + 0.12, o.at);
    }
    sounding.push(o);
  }

  // La pédale, en temps de la vidéo : la sienne (relevée au son), sinon une par harmonie.
  // Relevée dans chaque pause (peu après la dernière note) et en fin de passage.
  const fromSound = (pedals || [])
    .map((p) => ({ start: Number(p.start ?? p.onset), end: Number(p.end ?? p.offset) }))
    .filter((p) => Number.isFinite(p.start) && Number.isFinite(p.end) && p.end > p.start && p.start < to && p.end > from);
  let held = [];
  if (fromSound.length) held = fromSound.map((p) => ({ start: Math.max(from, p.start), end: Math.min(coverEnd + PEDAL_RELEASE_AFTER, p.end) }));
  else {
    const changes = harmonyChanges(picked);
    changes.forEach((t, k) => {
      const next = changes[k + 1];
      held.push({ start: t + PEDAL_DOWN_AFTER, end: next !== undefined ? next - PEDAL_UP_BEFORE : coverEnd + PEDAL_RELEASE_AFTER });
    });
  }
  // Une pause coupe la pédale : relevée 0,3 s (temps de l'exemple) après la dernière note.
  const cutByPauses = [];
  for (const h of held) {
    let piece = { ...h };
    for (const p of pauses) {
      if (p.videoEnd <= piece.start || p.videoStart >= piece.end) continue;
      if (p.videoStart > piece.start) cutByPauses.push({ start: piece.start, end: p.videoStart, extra: PEDAL_RELEASE_AFTER });
      piece = { start: p.videoEnd, end: piece.end };
      if (piece.end <= piece.start) break;
    }
    if (piece.end > piece.start) cutByPauses.push(piece);
  }
  const pedalEvents = [];
  for (const h of cutByPauses) {
    const down = Math.round(toExample(h.start) * 1000) / 1000;
    const up = Math.round((toExample(h.end) + (h.extra || 0)) * 1000) / 1000;
    if (up - down < 0.05) continue;
    pedalEvents.push({ time: down, type: 'sustain', value: true }, { time: up, type: 'sustain', value: false });
  }

  const explains = pauses.some((p) => p.speaks);
  const example = buildNotesExample(out.map(({ n, at, until }) => ({
    midi: n.midi + shift,
    startOffsetMs: Math.round(at * 1000),
    durationMs: Math.round(Math.max(0.12, until - at) * 1000),
    velocity: n.velocity ?? 0.72,
    hand: n.hand === 'lh' ? 'LH' : 'RH',
  })), {
    kind: 'tutorial',
    title: title || `Passage du tutoriel ${clock(from)}–${clock(to)}`,
    subtitle: `${out.length} notes jouées par le professeur${hand ? ` (${handOf(hand) === 'lh' ? 'main gauche' : 'main droite'})` : ''}`
      + `${shift ? ` · transposées de ${shift > 0 ? '+' : ''}${shift} demi-ton${Math.abs(shift) > 1 ? 's' : ''}` : ''}`
      + `${pedalEvents.length ? (fromSound.length ? ' · avec sa pédale' : ' · pédale à chaque accord') : ''}`
      + `${explains ? ' · ses explications raccourcies à 2 s' : ''}`,
  });
  if (example) {
    if (pedalEvents.length) {
      const order = { noteOff: 0, sustain: 1, noteOn: 2 };
      example.events = [...example.events, ...pedalEvents].sort((a, b) => a.time - b.time || order[a.type] - order[b.type]);
      example.beats = Math.max(example.beats, ...pedalEvents.map((e) => e.time));
    }
    example.tutorialStart = from;
    example.tutorialEnd = to;
    example.markers = pauses.map((p) => ({
      at: Math.round(p.exStart * 100) / 100,
      until: Math.round(p.exEnd * 100) / 100,
      videoStart: Math.round(p.videoStart * 100) / 100,
      videoEnd: Math.round(p.videoEnd * 100) / 100,
      kind: p.speaks ? 'parle' : 'pause',
    }));
    example.timeMap = timeMap.map(([e, v]) => [Math.round(e * 1000) / 1000, Math.round(v * 1000) / 1000]);
  }
  return example;
}
