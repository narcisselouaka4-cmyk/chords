// [Claude] — 2026-09-25 — La mélodie d'un jeu enregistré : la voix du dessus.
//
// Narcisse : « Copilot n'est pas capable de reproduire les morceaux que je joue
// dans la session MIDI […] Il ne reconnaît même pas les notes mélodiques (les top
// notes) dans mes accords. » Jusqu'ici une note de mélodie attaquée avec son
// accord disparaissait dans l'accord ; seules les notes jouées seules formaient
// des lignes.
//
// Méthode (dite « skyline ») : à chaque attaque (notes à moins de 90 ms l'une de
// l'autre, accord roulé compris), la note la plus haute est candidate. Elle est
// écartée :
//   - si une note de mélodie précédente est encore TENUE au doigt et plus haute
//     (l'accompagnement joué sous une note de mélodie qui dure). Sauf dans une
//     ligne jouée legato : la note d'avant, à une tierce majeure au plus, est
//     relâchée dans les 150 ms ;
//   - si elle est sous le registre du dessus : plus de 12 demi-tons sous le 75e
//     centile des notes du dessus du passage, et jamais sous Do3 (la basse, la
//     main gauche jouée seule).
// Une note de mélodie dure jusqu'au relâchement de sa touche, et au plus jusqu'à
// la note suivante (la pédale ne l'allonge pas).
// Module pur : pas de DOM.

import { buildNoteWindows, clusterAttacks, segmentSessionEvents } from './session-analysis.js';
import { frenchNoteName } from '../pedagogie/example-guide.js';

// Jamais de mélodie sous Do3.
const MELODY_FLOOR = 48;
// Registre du dessus : 12 demi-tons sous le 75e centile des notes du dessus.
const REGISTER_SPAN = 12;
// Ligne legato : la touche d'avant se relâche au plus 150 ms après la suivante,
// à une tierce majeure au plus.
const LEGATO_OVERLAP = 0.15;
const LEGATO_STEP = 4;

/** « 1:02,4 » (même écriture que les portraits de take-review.js). */
function clock(seconds) {
  const t = Math.max(0, seconds || 0);
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  const whole = Math.floor(s);
  return `${m}:${String(whole).padStart(2, '0')},${Math.floor((s - whole) * 10)}`;
}

/**
 * Voix du dessus d'un jeu (session ou passage).
 * @param {object[]} events - évènements de l'enregistreur ({type, note, velocity, channel, time})
 * @returns {{midi: number, start: number, end: number, velocity: number}[]}
 */
export function extractMelody(events) {
  const sorted = [...(events || [])].filter((e) => Number.isFinite(e?.time)).sort((a, b) => a.time - b.time);
  const windows = buildNoteWindows(sorted);
  if (!windows.length) return [];
  const clusters = clusterAttacks(windows);
  const tops = clusters.map((c) => Math.max(...c.map((w) => w.note))).sort((a, b) => a - b);
  const high = tops[Math.floor(tops.length * 0.75)];
  const floor = Math.max(MELODY_FLOOR, high - REGISTER_SPAN);
  const picked = [];
  for (const cluster of clusters) {
    const top = cluster.reduce((a, w) => (w.note > a.note ? w : a));
    if (top.note < floor) continue;
    const previous = picked[picked.length - 1];
    // Accompagnement sous une note de mélodie encore tenue au doigt (pas une
    // ligne legato, où les touches se chevauchent un instant).
    if (previous && previous.keyOff > top.onTime + 0.02 && top.note < previous.midi) {
      const legato = previous.midi - top.note <= LEGATO_STEP && previous.keyOff <= top.onTime + LEGATO_OVERLAP;
      if (!legato) continue;
    }
    picked.push({ midi: top.note, start: top.onTime, keyOff: top.keyOffTime ?? top.offTime, velocity: top.velocity });
  }
  return picked.map((n, i) => {
    const next = picked[i + 1];
    const end = next ? Math.min(n.keyOff, next.start) : n.keyOff;
    return { midi: n.midi, start: n.start, end: Math.max(n.start + 0.05, end), velocity: n.velocity };
  });
}

/**
 * Accord qui sonne sous chaque note de mélodie (segments de session-analysis.js).
 * @param {{midi: number, start: number}[]} melody
 * @param {object[]} segments - segmentSessionEvents(events)
 * @returns {{midi: number, start: number, end: number, velocity: number, chord: string|null}[]}
 */
export function melodyWithChords(melody, segments) {
  const chords = (segments || []).filter((s) => s.type === 'chord' && s.chordName);
  return (melody || []).map((n) => {
    const seg = chords.find((s) => s.start - 0.1 <= n.start && n.start < s.end);
    return { ...n, chord: seg?.chordName || null };
  });
}

/**
 * La mélodie en texte, pour le Copilote : les notes groupées par accord, écrites
 * d'après l'accord (« 0:03,0 Dm9 : La4 Sol4 Fa4 · 0:08,2 G13 : Mi5 »). Bornée.
 * @param {object[]} events
 * @param {{max?: number, segments?: object[]|null}} [options]
 * @returns {string[]}
 */
export function melodyLines(events, { max = 120, segments = null } = {}) {
  return formatMelodyLines(melodyWithChords(extractMelody(events), segments || segmentSessionEvents(events || [])), { max });
}

/**
 * Même texte, à partir d'une mélodie déjà liée à ses accords (melodyWithChords).
 * @param {{midi: number, start: number, chord: string|null}[]} melody
 * @param {{max?: number}} [options]
 * @returns {string[]}
 */
export function formatMelodyLines(melody, { max = 120 } = {}) {
  if (!melody?.length) return [];
  const groups = [];
  for (const n of melody.slice(0, max)) {
    const last = groups[groups.length - 1];
    if (last && last.chord === n.chord) last.notes.push(n);
    else groups.push({ chord: n.chord, start: n.start, notes: [n] });
  }
  const out = groups.map((g) => `${clock(g.start)} ${g.chord || '(sans accord)'} : ${g.notes.map((n) => frenchNoteName(n.midi, g.chord)).join(' ')}`);
  if (melody.length > max) out.push(`… (${melody.length - max} notes de plus)`);
  return out;
}
