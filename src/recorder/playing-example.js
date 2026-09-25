// [Claude] — 2026-09-25 — Rejouer le jeu du pianiste à l'identique (outil play_my_playing).
//
// Narcisse : « Copilot n'est pas capable de reproduire les morceaux que je joue
// dans la session MIDI ». Le Copilote ne recevait qu'un portrait en texte : pour
// faire entendre un passage, il le recomposait avec ses propres voicings.
// Ici, l'extrait vient des évènements EXACTS (session, ou dernier passage de
// « Qu'en penses-tu ? ») : mêmes notes, mêmes moments, même pédale, mêmes nuances.
// Au début de l'extrait, ce qui sonnait déjà est remis en place : les touches
// tenues et la pédale (comme la relecture des Sessions reprise au milieu), plus
// les notes des 4 dernières secondes que la pédale fait encore sonner.
// Parties : tout, la mélodie seule (voix du dessus, melody-line.js), la main
// gauche ou la main droite. Les mains sont devinées à chaque attaque, sur les
// touches tenues à cet instant : la coupure qui laisse à chaque main un écart
// jouable (une octave, sans pénalité ; au-delà, de plus en plus cher) et cinq
// notes au plus, au plus grand intervalle ; une seule main si elle suffit.
// Même format que les exemples du Copilote (tempo 60 : un temps = une seconde),
// joué par le même lecteur : les touches s'allument en jaune.
// Module pur : pas de DOM.

import { buildNoteWindows } from './session-analysis.js';
import { extractMelody } from './melody-line.js';

/** Un extrait dure 60 s au plus, et compte 1 500 évènements au plus. */
export const PLAYING_MAX_SECONDS = 60;
export const PLAYING_MAX_EVENTS = 1500;
export const PLAYING_PARTS = ['tout', 'melodie', 'main_gauche', 'main_droite'];

// Une note frappée peu avant l'extrait et gardée par la pédale sonne encore.
const PEDAL_RESTORE_SECONDS = 4;
// Une note encore tenue à la fin de l'extrait sonne encore un peu.
const TAIL_SECONDS = 1;
const PART_WORDS = { tout: 'Ton jeu', melodie: 'Ta mélodie', main_gauche: 'Ta main gauche', main_droite: 'Ta main droite' };
// Mains : écart confortable d'une main (demi-tons), notes par main, coût d'un
// jeu à deux mains (rattrapé par un intervalle de plus d'une quarte entre les
// mains), registre de partage entre les mains (Sol3).
const HAND_SPAN = 12;
const HAND_NOTES = 5;
const TWO_HANDS_COST = 3;
const HANDS_GAP = 5;
const MIDDLE = 55;

const isPedal = (e) => e.type === 'control' && e.controller === 64;
// Vélocité de 0 à 1 (sessions importées : de 0 à 127).
const unit = (v) => Math.min(1, Math.max(0.05, v > 1 ? v / 127 : (v ?? 0.8)));

/** « 1:02 » */
function mmss(seconds) {
  const t = Math.max(0, Math.floor(seconds || 0));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
}

/**
 * Main de chaque note ('lh' ou 'rh'), d'après les touches tenues à son attaque.
 * @param {{note: number, onTime: number, keyOffTime?: number, offTime: number}[]} windows - triées par attaque
 * @param {object[]} picked - notes dont on veut la main (parmi `windows`)
 * @returns {Map<object, 'lh'|'rh'>}
 */
export function handsOf(windows, picked) {
  const hands = new Map();
  for (const w of picked) {
    const t = w.onTime + 0.03;
    const held = [];
    for (const o of windows) {
      if (o.onTime > t) break;
      if (o === w || (o.keyOffTime ?? o.offTime) > t) held.push(o.note);
    }
    const p = [...new Set(held)].sort((a, b) => a - b);
    const k = p.length;
    const span = (lo, hi) => (hi > lo ? p[hi - 1] - p[lo] : 0);
    const handCost = (lo, hi) => Math.max(0, span(lo, hi) - HAND_SPAN) * 2 + Math.max(0, hi - lo - HAND_NOTES) * 10;
    // Coupure c : main gauche p[0..c-1], main droite p[c..k-1] (0 : tout à droite, k : tout à gauche).
    let best = 0;
    let bestCost = Infinity;
    for (let c = 0; c <= k; c += 1) {
      let cost = handCost(0, c) + handCost(c, k);
      if (c === 0) cost += Math.max(0, MIDDLE - p[0]) * 0.5;
      else if (c === k) cost += Math.max(0, p[k - 1] - MIDDLE) * 0.5;
      else cost += TWO_HANDS_COST - Math.max(0, p[c] - p[c - 1] - HANDS_GAP) / 2;
      if (cost < bestCost) { bestCost = cost; best = c; }
    }
    hands.set(w, best > 0 && w.note <= p[best - 1] ? 'lh' : 'rh');
  }
  return hands;
}

/**
 * Extrait du jeu en exemple réécoutable.
 * @param {object[]} events - évènements de l'enregistreur ({type: 'note_on'|'note_off'|'control', note, velocity, controller, value, channel, time}), en secondes
 * @param {{start?: number, end?: number|null, part?: string, offset?: number, semitones?: number, title?: string}} [options]
 *   start, end : moments du jeu (secondes ; sans fin : jusqu'à 60 s plus loin) ;
 *   part : 'tout', 'melodie', 'main_gauche' ou 'main_droite' ;
 *   offset : décalage de hauteur silencieux (transposition du clavier, pour qu'une
 *   session sonne comme sa relecture) ; semitones : transposition demandée (dite
 *   dans le sous-titre).
 * @returns {object|null} exemple ({kind: 'playing', title, subtitle, tempo: 60, events, beats, chords: [], playingStart, playingEnd, part, noteCount}), ou null
 */
export function playingExample(events, { start = 0, end = null, part = 'tout', offset = 0, semitones = 0, title = '' } = {}) {
  const sorted = [...(events || [])].filter((e) => Number.isFinite(e?.time)).sort((a, b) => a.time - b.time);
  const windows = buildNoteWindows(sorted);
  if (!windows.length) return null;
  const which = PLAYING_PARTS.includes(part) ? part : 'tout';
  const last = windows.reduce((m, w) => Math.max(m, w.onTime, w.keyOffTime ?? w.offTime), 0);
  const from = Math.max(0, Number(start) || 0);
  if (from >= last) return null;
  const wanted = end != null && Number.isFinite(Number(end)) && Number(end) > from ? Number(end) : from + PLAYING_MAX_SECONDS;
  let to = Math.min(wanted, from + PLAYING_MAX_SECONDS);

  // Notes de l'extrait : {w (fenêtre de la note), midi, velocity, on, off}, temps du jeu.
  let notes = [];
  if (which === 'melodie') {
    for (const n of extractMelody(sorted)) {
      if (n.start >= to || n.end <= from) continue;
      notes.push({ midi: n.midi, velocity: n.velocity, on: Math.max(from, n.start), off: n.end });
    }
  } else {
    for (const w of windows) {
      if (w.onTime >= to) break;
      const keyOff = w.keyOffTime ?? w.offTime;
      if (w.onTime >= from) notes.push({ w, midi: w.note, velocity: w.velocity, on: w.onTime, off: keyOff });
      // Touche tenue au début de l'extrait.
      else if (keyOff > from) notes.push({ w, midi: w.note, velocity: w.velocity, on: from, off: keyOff });
      // Relâchée, mais la pédale la fait encore sonner.
      else if (w.offTime > from && w.onTime >= from - PEDAL_RESTORE_SECONDS) notes.push({ w, midi: w.note, velocity: w.velocity, on: from, off: from + 0.05 });
    }
    if (which === 'main_gauche' || which === 'main_droite') {
      const hands = handsOf(windows, notes.map((n) => n.w));
      const keep = which === 'main_gauche' ? 'lh' : 'rh';
      notes = notes.filter((n) => hands.get(n.w) === keep);
    }
  }
  if (!notes.length) return null;

  // Pédale : son état au début de l'extrait, puis ses changements (pas pour la mélodie seule).
  const withPedal = which !== 'melodie';
  let pedalAtStart = false;
  const pedalChanges = [];
  if (withPedal) {
    for (const e of sorted) {
      if (e.time >= from) break;
      if (isPedal(e)) pedalAtStart = e.value >= 64;
    }
    let down = pedalAtStart;
    for (const e of sorted) {
      if (e.time >= to) break;
      if (e.time < from || !isPedal(e)) continue;
      // Demi-pédale (valeurs de 0 à 127) : seul le passage de 64 compte.
      if ((e.value >= 64) !== down) {
        down = e.value >= 64;
        pedalChanges.push({ time: e.time, down });
      }
    }
  }

  // Au-delà de PLAYING_MAX_EVENTS évènements : l'extrait s'arrête avant, à une attaque.
  const marks = [...notes.map((n) => ({ t: n.on, cost: 2 })), ...pedalChanges.map((p) => ({ t: p.time, cost: 1 }))].sort((a, b) => a.t - b.t);
  let total = 2;
  for (const m of marks) {
    if (total + m.cost > PLAYING_MAX_EVENTS && m.t > from) { to = m.t; break; }
    total += m.cost;
  }
  notes = notes.filter((n) => n.on < to || n.on === from);

  const shift = Math.round(Number(offset) || 0) + Math.max(-12, Math.min(12, Math.round(Number(semitones) || 0)));
  const hand = which === 'main_gauche' ? 'lh' : 'rh';
  const out = [];
  if (pedalAtStart) out.push({ time: 0, type: 'sustain', value: true });
  let kept = 0;
  for (const n of notes) {
    const midi = n.midi + shift;
    if (midi < 21 || midi > 108) continue;
    const on = n.on - from;
    const off = Math.max(on + 0.03, Math.min(n.off, to + TAIL_SECONDS) - from);
    out.push({ time: on, type: 'noteOn', note: midi, velocity: unit(n.velocity), hand });
    out.push({ time: off, type: 'noteOff', note: midi, hand });
    kept += 1;
  }
  if (!kept) return null;
  let pedalDown = pedalAtStart;
  for (const p of pedalChanges) {
    if (p.time >= to) break;
    out.push({ time: p.time - from, type: 'sustain', value: p.down });
    pedalDown = p.down;
  }
  const order = { noteOff: 0, sustain: 1, noteOn: 2 };
  out.sort((a, b) => a.time - b.time || order[a.type] - order[b.type] || (a.note ?? 0) - (b.note ?? 0));
  const beats = Math.max(0, ...out.map((e) => e.time));
  if (pedalDown) out.push({ time: beats, type: 'sustain', value: false });

  const until = Math.min(to, last);
  const moved = Math.max(-12, Math.min(12, Math.round(Number(semitones) || 0)));
  const subtitle = [
    `${kept} note${kept > 1 ? 's' : ''} ${which === 'melodie' ? 'de la voix du dessus' : 'comme tu les as jouées'}${withPedal && (pedalAtStart || pedalChanges.length) ? ', pédale comprise' : ''}`,
    moved ? `transposées de ${moved > 0 ? '+' : ''}${moved} demi-ton${Math.abs(moved) > 1 ? 's' : ''}` : '',
  ].filter(Boolean).join(' · ');
  return {
    kind: 'playing',
    title: title || `${PART_WORDS[which]}, ${mmss(from)}–${mmss(Math.max(from + 1, until))}`,
    subtitle,
    style: null,
    tempo: 60,
    events: out,
    beats,
    chords: [],
    playingStart: from,
    playingEnd: until,
    part: which,
    noteCount: kept,
  };
}
