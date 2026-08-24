// [OpenCode] — 2026-08-24 — EXP-030 Tâche A : pont session enregistrée → MelodyTrack.
//
// Troisième source de mélodie pour la réharmonisation (après MIDI live et
// audio importé). Les sessions enregistrées (`src/recorder/`) stockent des
// événements MIDI bruts ({time, type, note, velocity, channel}) dans
// events.json. Ce module convertit ces événements en objet MelodyTrack
// conforme à melody-track.js:76, consommable tel quel par l'orchestrateur
// canonique — sans modifier l'orchestrateur ni le moteur de réharmonisation.
//
// Logique de conversion : appairer les note_on/note_off pour construire
// des notes avec startedAt/endedAt/duration. Les note_on sans note_off
// correspondant (fin de session) sont fermés au temps du dernier événement.
// Les événements non-note (control, pitch_bend, etc.) sont ignorés pour la
// mélodie — seule la voix mélodique (top note à chaque instant) nous
// intéresse, mais on conserve toutes les notes et laisse le sopranoPolicy
// de MelodyTrack décider.

import { createMelodyTrack, validateMelodyTrack } from './melody-track.js';
import {
  createTonalContext,
  estimateTonalContextFromMelody,
  setManualTonalContext,
} from './tonal-context.js';
import {
  createHarmonicContext,
  addHarmonicAnchor,
} from './harmonic-context.js';

const SESSION_SOURCE_ID = 'reharm-session';

let nextSessionNoteId = 0;
function makeSessionNoteId() {
  return `sn-${++nextSessionNoteId}`;
}

/**
 * Convertit les événements d'une session enregistrée (format events.json
 * de src/recorder/) en notes compatibles avec createMelodyTrack.
 *
 * @param {{time: number, type: string, note: number, velocity: number, channel: number}[]} events
 * @returns {{notes: object[], sourceCaptureId: string, startedAt: number, endedAt: number} | null}
 */
function sessionEventsToNotes(events) {
  if (!Array.isArray(events) || events.length === 0) return null;

  // Trie par time (les événements ne le sont pas toujours strictement)
  const sorted = [...events].sort((a, b) => a.time - b.time);

  // Appaire note_on / note_off par (channel, note). On garde le premier
  // note_on non encore fermé pour chaque (channel, note) — un nouveau
  // note_on sans note_off ferme implicitement le précédent.
  /** @type {Map<string, {startedAt: number, velocity: number, channel: number, note: number}>} */
  const active = new Map();
  const notes = [];
  let minTime = Infinity;
  let maxTime = -Infinity;

  for (const ev of sorted) {
    if (typeof ev.time !== 'number' || typeof ev.note !== 'number') continue;
    const key = `${ev.channel ?? 0}|${ev.note}`;

    if (ev.type === 'note_on' && ev.velocity > 0) {
      // Ferme implicitement une note active de même hauteur si elle existe.
      if (active.has(key)) {
        const prev = active.get(key);
        const dur = ev.time - prev.startedAt;
        notes.push({
          id: makeSessionNoteId(),
          midi: prev.note,
          channel: prev.channel,
          sourceId: SESSION_SOURCE_ID,
          startedAt: prev.startedAt,
          releasedAt: ev.time,
          endedAt: ev.time,
          duration: Math.max(0, dur),
          velocity: prev.velocity,
          sustained: false,
          releaseVelocity: 0,
          terminationReason: 'physical-release',
        });
      }
      active.set(key, {
        startedAt: ev.time,
        velocity: ev.velocity,
        channel: ev.channel ?? 0,
        note: ev.note,
      });
      minTime = Math.min(minTime, ev.time);
    } else if (ev.type === 'note_off' || (ev.type === 'note_on' && ev.velocity === 0)) {
      const prev = active.get(key);
      if (prev) {
        const dur = ev.time - prev.startedAt;
        notes.push({
          id: makeSessionNoteId(),
          midi: prev.note,
          channel: prev.channel,
          sourceId: SESSION_SOURCE_ID,
          startedAt: prev.startedAt,
          releasedAt: ev.time,
          endedAt: ev.time,
          duration: Math.max(0, dur),
          velocity: prev.velocity,
          sustained: false,
          releaseVelocity: 0,
          terminationReason: 'physical-release',
        });
        active.delete(key);
      }
      maxTime = Math.max(maxTime, ev.time);
    }
  }

  // Ferme les notes encore actives à la fin (fin de session).
  for (const [, prev] of active) {
    const end = maxTime > prev.startedAt ? maxTime : prev.startedAt + 0.5;
    notes.push({
      id: makeSessionNoteId(),
      midi: prev.note,
      channel: prev.channel,
      sourceId: SESSION_SOURCE_ID,
      startedAt: prev.startedAt,
      releasedAt: end,
      endedAt: end,
      duration: Math.max(0, end - prev.startedAt),
      velocity: prev.velocity,
      sustained: false,
      releaseVelocity: 0,
      terminationReason: 'session-stop',
    });
    maxTime = Math.max(maxTime, end);
  }

  if (notes.length === 0) return null;
  return {
    notes,
    sourceCaptureId: SESSION_SOURCE_ID,
    startedAt: minTime,
    endedAt: maxTime,
  };
}

/**
 * Construit un wrapper canonique { track, harmonicContext } depuis une
 * session enregistrée.
 *
 * @param {{events: object[], session?: {key?: string}}} sessionData
 *   Résultat de loadSession (events + métadonnées).
 * @param {object} [options]
 * @param {string} [options.name]
 * @param {'allow-notes-above'|'melody-must-be-top'|'free'} [options.sopranoPolicy]
 * @returns {{ status: 'success', wrapper: { track: object, harmonicContext: object }, noteCount: number } |
 *           { status: 'error', errorKind: string, message: string, noteCount: number }}
 */
export function buildSessionMelodyWrapper(sessionData, options = {}) {
  if (!sessionData || !Array.isArray(sessionData.events)) {
    return {
      status: 'error',
      errorKind: 'TypeError',
      message: 'Session invalide : events manquantes.',
      noteCount: 0,
    };
  }

  const snapshot = sessionEventsToNotes(sessionData.events);
  if (!snapshot) {
    return {
      status: 'error',
      errorKind: 'EmptyMelody',
      message: 'Aucune note dans la session. La session est peut-être vide ou ne contient que des événements non-mélodiques.',
      noteCount: 0,
    };
  }

  const track = createMelodyTrack(snapshot, {
    name: options.name || 'Mélodie (session enregistrée)',
    sopranoPolicy: options.sopranoPolicy || 'melody-must-be-top',
    harmonizationPolicy: 'automatic',
  });

  const validation = validateMelodyTrack(track);
  if (!validation.valid) {
    return {
      status: 'error',
      errorKind: 'InvalidMelody',
      message: `Mélodie invalide : ${validation.errors.join('; ')}`,
      noteCount: snapshot.notes.length,
    };
  }

  // Détection de tonalité. Si la session a une tonalité manuelle (key field),
  // on l'utilise en priorité ; sinon estimation sur la mélodie.
  let tonalContext = null;
  const sessionKey = sessionData.session?.key;
  if (sessionKey && typeof sessionKey === 'string' && sessionKey.length > 0) {
    tonalContext = setManualTonalContextSafe(createTonalContext(), sessionKey);
  }
  if (!tonalContext || !tonalContext.selected) {
    const { context: estimated } = estimateTonalContextFromMelody(track);
    tonalContext = (estimated && estimated.selected)
      ? estimated
      : setManualTonalContextSafe(createTonalContext(), 'C');
  }

  let ctx = createHarmonicContext(track, { tonalContext });
  for (let i = 0; i < track.events.length; i++) {
    const type = i === 0 ? 'start' : i === track.events.length - 1 ? 'end' : 'user';
    ctx = addHarmonicAnchor(ctx, {
      melodyEventId: track.events[i].id,
      relativeTime: track.events[i].startedAt,
      type,
      harmonizationPolicy: 'automatic',
    });
  }

  return {
    status: 'success',
    wrapper: { track, harmonicContext: ctx },
    noteCount: snapshot.notes.length,
  };
}

function setManualTonalContextSafe(base, key) {
  try {
    return setManualTonalContext(base, key);
  } catch (_) {
    return base;
  }
}