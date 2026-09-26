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
  const text = String(key || '').trim();
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

/**
 * Passage du professeur en exemple (mêmes notes, mêmes durées), une main au
 * choix, transposable (« joue-moi ce lick en Fa »). Ses touches s'allument en
 * jaune pendant l'écoute.
 * @param {object[]} notes - notes du professeur
 * @param {{start: number, end: number, hand?: string|null, semitones?: number, title?: string}} options
 * @returns {object|null} exemple (copilot-demo.js) avec `tutorialStart`
 */
export function passageExample(notes, { start, end, hand = null, semitones = 0, title = '' } = {}) {
  const from = Math.max(0, Number(start) || 0);
  const to = Math.max(from + 0.5, Number(end) || from + 4);
  const picked = guessHands(notesInRange(notes, from, Math.min(to, from + 30), { hand }));
  if (!picked.length) return null;
  const shift = Math.max(-12, Math.min(12, Math.round(semitones || 0)));
  const example = buildNotesExample(picked.map((n) => ({
    midi: n.midi + shift,
    startOffsetMs: Math.round((n.start - from) * 1000),
    durationMs: Math.round(Math.max(0.12, Math.min(n.end, to + 1) - n.start) * 1000),
    velocity: n.velocity ?? 0.72,
    hand: n.hand === 'lh' ? 'LH' : 'RH',
  })), {
    kind: 'tutorial',
    title: title || `Passage du tutoriel ${clock(from)}–${clock(to)}`,
    subtitle: `${picked.length} notes jouées par le professeur${hand ? ` (${handOf(hand) === 'lh' ? 'main gauche' : 'main droite'})` : ''}${shift ? ` · transposées de ${shift > 0 ? '+' : ''}${shift} demi-ton${Math.abs(shift) > 1 ? 's' : ''}` : ''}`,
  });
  if (example) {
    example.tutorialStart = from;
    example.tutorialEnd = to;
  }
  return example;
}
