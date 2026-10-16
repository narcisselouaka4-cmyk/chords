// [Claude] — 2026-09-24 — Découpage harmonique refait (Narcisse : « les accords
// détectés et affichés ne sont pas toujours les bons […] il faut vraiment
// corriger cette détection »). L'ancien découpage ne formait un accord qu'avec
// des notes attaquées ensemble, sur deux octaves au plus : un accord à deux
// mains (C2 G2 | E4 G4 B4 D5) passait pour de la mélodie, une basse tenue
// pendant que la main droite changeait d'accord était oubliée, une note de
// mélodie jouée juste après l'accord y était avalée ; et le nom affiché venait
// du `fullName` du moteur, sans fondamentale (« Major 9 »).
//
// Désormais, à chaque attaque (notes à moins de 90 ms l'une de l'autre, accord
// roulé compris), l'accord est lu sur ce qui sonne : les touches tenues, plus la
// basse gardée par la pédale (frappée pendant la pression en cours, sous tout le
// reste). Une note seule attaquée au-dessus de tout (mélodie) ne change pas
// l'accord ; une nouvelle basse ou une voix intérieure, si. Un même accord
// rejoué prolonge son segment ; un arpège lent complète l'accord qu'il forme.
// Nom : nameMidiChord (fondamentale, qualité de l'application, basse).

import { MIN_SIMULTANEOUS, CONJUNCT_INTERVAL_SEMITONES } from '../note-grouper.js';
import { nameMidiChord } from './midi-chord-namer.js';

// Écart maximal entre deux attaques d'un même accord (s), accord roulé compris.
const CLUSTER_GAP = 0.09;
// Lecture de ce qui sonne juste après la dernière attaque (s).
const HOLD_EPSILON = 0.03;
// Un arpège lent complète son accord pendant ce délai après sa dernière note (s).
const ARPEGGIO_WINDOW = 0.6;
// Une note frappée sous Do3 est une nouvelle basse : elle remplace celle que garde la pédale.
const NEW_BASS_BELOW = 48;

// Garde-fou "gamme sous pédale" — même logique que note-grouper.js (voir son commentaire) :
// un vrai accord n'a jamais TOUTES ses notes voisines d'un ton/demi-ton une fois triées par
// hauteur ; une gamme ou un trait conjoint, si.
function isMelodicRun(group) {
  if (group.length < MIN_SIMULTANEOUS) return false;
  const byPitch = group.map((w) => w.note).sort((a, b) => a - b);
  for (let i = 1; i < byPitch.length; i++) {
    if (byPitch[i] - byPitch[i - 1] > CONJUNCT_INTERVAL_SEMITONES) return false;
  }
  return true;
}

export function buildNoteWindows(events) {
  const noteOnMap = new Map();
  const sustainEvents = [];
  const noteWindows = [];

  for (const ev of events) {
    if (ev.type === 'note_on' && ev.velocity > 0) {
      const key = `${ev.channel}:${ev.note}`;
      const existing = noteOnMap.get(key);
      if (existing && existing.offTime !== null) {
        noteWindows.push({
          note: existing.note,
          channel: existing.channel,
          velocity: existing.velocity,
          onTime: existing.onTime,
          offTime: existing.offTime,
        });
        noteOnMap.set(key, { note: ev.note, channel: ev.channel, velocity: ev.velocity, onTime: ev.time, offTime: null });
      } else if (!existing) {
        noteOnMap.set(key, { note: ev.note, channel: ev.channel, velocity: ev.velocity, onTime: ev.time, offTime: null });
      }
    } else if ((ev.type === 'note_off' || (ev.type === 'note_on' && ev.velocity === 0)) && ev.note != null) {
      const key = `${ev.channel}:${ev.note}`;
      const window = noteOnMap.get(key);
      if (window && window.offTime === null) {
        window.offTime = ev.time;
      }
    } else if (ev.type === 'control' && ev.controller === 64) {
      sustainEvents.push({ time: ev.time, value: ev.value, channel: ev.channel });
    }
  }

  for (const [, window] of noteOnMap) {
    if (window.offTime !== null || window.onTime !== undefined) {
      noteWindows.push({
        note: window.note,
        channel: window.channel,
        velocity: window.velocity,
        onTime: window.onTime,
        offTime: window.offTime !== null ? window.offTime : window.onTime + 0.1,
      });
    }
  }

  sustainEvents.sort((a, b) => a.time - b.time);

  const sustainIntervals = [];
  let sustainStart = null;
  for (const se of sustainEvents) {
    if (se.value >= 64 && sustainStart === null) {
      sustainStart = se.time;
    } else if (se.value < 64 && sustainStart !== null) {
      sustainIntervals.push({ start: sustainStart, end: se.time, channel: se.channel });
      sustainStart = null;
    }
  }
  if (sustainStart !== null) {
    sustainIntervals.push({ start: sustainStart, end: Infinity, channel: sustainEvents[sustainEvents.length - 1].channel });
  }

  for (const window of noteWindows) {
    // Relâchement de la touche, avant la pédale : c'est lui qui dit ce que la main tient.
    window.keyOffTime = window.offTime;
    if (window.offTime !== null && isFinite(window.offTime)) {
      for (const si of sustainIntervals) {
        if (si.channel === window.channel && window.offTime >= si.start && window.offTime <= si.end) {
          window.offTime = si.end;
          break;
        }
      }
    }
  }

  noteWindows.sort((a, b) => a.onTime - b.onTime);
  return noteWindows;
}

function createMelodySegments(noteWindows, chordWindows) {
  const melodyNotes = noteWindows.filter((w) => !chordWindows.has(w));
  if (melodyNotes.length === 0) return [];

  const segments = [];
  let currentSegment = [];

  for (const w of melodyNotes) {
    if (currentSegment.length === 0) {
      currentSegment.push(w);
    } else {
      const prev = currentSegment[currentSegment.length - 1];
      if (w.onTime - prev.offTime < 0.5) {
        currentSegment.push(w);
      } else {
        segments.push({
          type: 'melody',
          start: currentSegment[0].onTime,
          end: currentSegment[currentSegment.length - 1].offTime,
          notes: currentSegment.map((x) => x.note),
        });
        currentSegment = [w];
      }
    }
  }
  if (currentSegment.length > 0) {
    segments.push({
      type: 'melody',
      start: currentSegment[0].onTime,
      end: currentSegment[currentSegment.length - 1].offTime,
      notes: currentSegment.map((x) => x.note),
    });
  }
  return segments;
}

/** Attaques rapprochées (moins de CLUSTER_GAP entre deux notes) : un accord, même roulé. */
export function clusterAttacks(windows) {
  const clusters = [];
  for (const w of windows) {
    const last = clusters[clusters.length - 1];
    if (last && w.onTime - last[last.length - 1].onTime <= CLUSTER_GAP) last.push(w);
    else clusters.push([w]);
  }
  return clusters;
}

/** Instants où la pédale est enfoncée (valeur ≥ 64 après un relâchement). */
function pedalPresses(events) {
  const presses = [];
  let down = false;
  for (const ev of events) {
    if (ev.type !== 'control' || ev.controller !== 64) continue;
    const on = ev.value >= 64;
    if (on && !down) presses.push(ev.time);
    down = on;
  }
  return presses;
}

/**
 * Découpe une session en accords et passages mélodiques (voir l'en-tête).
 * @returns {{type: 'chord'|'melody', start: number, end: number, notes: number[], chordName?: string, rootPc?: number, symbol?: string, bassPc?: number}[]}
 */
export function segmentSessionEvents(events) {
  if (!events || events.length === 0) return [];

  const sortedEvents = [...events].sort((a, b) => a.time - b.time);
  const windows = buildNoteWindows(sortedEvents);
  const presses = pedalPresses(sortedEvents);
  // Pression de pédale en cours à l'instant t (la dernière avant t), ou null.
  const pressBefore = (t) => {
    let found = null;
    for (const p of presses) if (p <= t) found = p;
    return found;
  };
  const chordWindows = new Set();
  const chordSegments = [];
  let current = null;

  for (const cluster of clusterAttacks(windows)) {
    const start = cluster[0].onTime;
    const t = cluster[cluster.length - 1].onTime + HOLD_EPSILON;
    // Ce que la main tient : touches enfoncées (et les notes qu'on vient d'attaquer).
    const held = windows.filter((w) => w.onTime <= t && (cluster.includes(w) || w.keyOffTime > t));
    const lowestHeld = Math.min(...held.map((w) => w.note));
    // La basse gardée par la pédale : frappée pendant la pression en cours, sous
    // tout le reste. Sauf si la main gauche frappe elle-même une nouvelle basse
    // (sous Do3) : l'ancienne ne fait que traîner sous la pédale (Dm9 → G13
    // pédale tenue : Ré2 sonne encore, mais l'accord joué est G13, pas G13/D).
    const press = pressBefore(t);
    const newBass = cluster.some((w) => w.note < NEW_BASS_BELOW);
    const pedalBass = press == null || newBass ? null : windows
      .filter((w) => !held.includes(w) && w.onTime >= press && w.onTime < start && w.offTime > t && w.note < lowestHeld)
      .sort((a, b) => a.note - b.note)[0] || null;
    const sounding = pedalBass ? [pedalBass, ...held] : held;
    const top = Math.max(...sounding.map((w) => w.note));
    // Une note seule au-dessus de tout, pendant un accord plaqué : c'est la mélodie.
    const single = cluster.length === 1;
    const arpeggioGrows = current?.arpeggio && single && start - current.lastAttack <= ARPEGGIO_WINDOW
      && current.windows.every((w) => sounding.includes(w));
    if (current && single && cluster[0].note === top && !arpeggioGrows) continue;
    if (cluster.length >= MIN_SIMULTANEOUS && isMelodicRun(cluster)) continue;
    const named = nameMidiChord(sounding.map((w) => w.note));
    if (!named) continue;
    // Notes de l'accord attaquées depuis le précédent (début d'un arpège, basse
    // gardée par la pédale) : elles lui appartiennent, pas à une mélodie.
    const since = current ? current.lastAttack : -Infinity;
    const own = sounding.filter((w) => w.onTime > since || cluster.includes(w));
    own.forEach((w) => chordWindows.add(w));
    if (arpeggioGrows || (current && current.name === named.name)) {
      // Arpège qui complète son accord, ou même accord rejoué : un seul segment.
      if (arpeggioGrows) Object.assign(current, { name: named.name, named, windows: sounding, attackNotes: sounding.map((w) => w.note) });
      current.lastAttack = start;
      current.notes = [...new Set([...current.notes, ...sounding.map((w) => w.note)])];
      current.end = Math.max(current.end, ...sounding.map((w) => w.offTime));
      continue;
    }
    current = {
      // Un accord né d'un arpège commence à sa première note.
      start: Math.min(start, ...own.map((w) => w.onTime)),
      end: Math.max(...sounding.map((w) => w.offTime)),
      name: named.name,
      named,
      windows: sounding,
      notes: sounding.map((w) => w.note),
      attackNotes: sounding.map((w) => w.note),
      lastAttack: start,
      // Accord né d'une note seule (troisième note d'un arpège) : il peut encore se compléter.
      arpeggio: single,
    };
    chordSegments.push(current);
  }

  // Un accord s'arrête quand le suivant commence.
  const chords = chordSegments.map((seg, i) => {
    const next = chordSegments[i + 1];
    return {
      type: 'chord',
      start: seg.start,
      end: next ? Math.min(seg.end, next.start) : seg.end,
      notes: [...seg.notes].sort((a, b) => a - b),
      chordName: seg.name,
      rootPc: seg.named.rootPc,
      symbol: seg.named.symbol,
      bassPc: seg.named.bassPc,
      // Faux si aucun accord connu n'explique toutes les notes (note étrangère ?).
      matched: seg.named.matched !== false,
      // Notes attaquées ou tenues au début de l'accord (voicing joué), sans ce qui s'y ajoute ensuite.
      attackNotes: [...new Set(seg.attackNotes)].sort((a, b) => a - b),
    };
  });

  const melodySegments = createMelodySegments(windows, chordWindows);
  return [...chords, ...melodySegments].sort((a, b) => a.start - b.start);
}

/**
 * Nom des accords (déjà posé par segmentSessionEvents) ; `latin` = Do, Ré, Mi.
 * @param {object[]} segments
 * @param {{latin?: boolean}} [options]
 */
export function nameChordSegments(segments, { latin = false } = {}) {
  for (const seg of segments) {
    if (seg.type !== 'chord' || !seg.notes?.length) continue;
    if (seg.chordName && !latin) continue;
    const named = nameMidiChord(seg.notes, { latin });
    seg.chordName = named?.name || seg.chordName || null;
  }
  return segments;
}
