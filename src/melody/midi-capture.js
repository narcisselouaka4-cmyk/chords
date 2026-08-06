// [OpenCode] — 2026-08-06 — Capture MIDI temporelle non destructive.
// Module parallèle à note-grouper.js ; l'onglet Entraînement conserve son
// pipeline actuel. Ce module conserve l'intégralité de la timeline MIDI
// et permet de reconstruire l'état des notes à n'importe quel instant.

// Les types partagés sont documentés dans ./midi-types.js

const DEFAULT_SUSTAIN_CONTROLLER = 64;
const DEFAULT_SOURCE_ID = 'default';

let nextNoteId = 0;
let nextEventId = 0;

function makeNoteId() {
  return `n-${++nextNoteId}`;
}

function makeEventId() {
  return `e-${++nextEventId}`;
}

function noteKey(sourceId, channel, note) {
  return `${String(sourceId)}|${channel}|${note}`;
}

/**
 * Crée une capture MIDI temporelle non destructive.
 *
 * @param {object} [options]
 * @param {() => number} [options.getTime] - Horloge monotonique en millisecondes.
 *   Par défaut performance.now() (disponible dans le navigateur et Node ≥16).
 * @returns {object} API de capture
 */
export function createMidiCapture({ getTime = getDefaultTime } = {}) {
  /** @type {import('./midi-types.js').MidiNoteEvent[]} */
  const events = [];

  // Notes activement jouées : clé composite sourceId + channel + note MIDI.
  /** @type {Map<string, import('./midi-types.js').MidiNote>} */
  const activeNotes = new Map();

  // Pédale de sustain par canal et par source.
  /** @type {Map<string, boolean>} */
  const sustainByChannel = new Map();

  // Notes maintenues par le sustain, par canal et par source.
  /** @type {Map<string, Set<string>>} */
  const sustainedNotesByChannel = new Map();

  let finalized = false;
  let finalizeReason = null;

  function nowSeconds() {
    const t = getTime();
    if (!Number.isFinite(t) || t < 0) {
      throw new RangeError(`L'horloge doit retourner un nombre fini positif, reçu : ${t}`);
    }
    return t / 1000;
  }

  /**
   * Enregistre un événement note_on.
   * @param {number} note - 0-127
   * @param {number} [velocity] - 0-1
   * @param {number} [channel] - 0-15
   * @param {string} [sourceId] - identifiant de la source MIDI
   */
  function noteOn(note, velocity = 0.8, channel = 0, sourceId = DEFAULT_SOURCE_ID) {
    if (finalized) return;
    assertValidNote(note);
    assertValidChannel(channel);

    const safeVelocity = Number.isFinite(velocity) ? Math.max(0, Math.min(1, velocity)) : 0.8;

    // Convention MIDI : note-on vélocité 0 équivaut à note-off.
    if (safeVelocity === 0) {
      noteOff(note, 0, channel, sourceId);
      return;
    }

    const time = nowSeconds();
    const key = noteKey(sourceId, channel, note);
    events.push({
      id: makeEventId(),
      time,
      type: 'note_on',
      note,
      velocity: safeVelocity,
      channel,
      sourceId,
    });

    // Si une note de même clé est déjà active, on la considère comme
    // répétée : la nouvelle instance écrase l'ancienne en gardant le même
    // startedAt (la nouvelle attaque redémarre le temps). L'événement note_on
    // précédent reste dans la timeline.
    activeNotes.set(key, {
      id: makeNoteId(),
      midi: note,
      channel,
      sourceId,
      startedAt: time,
      releasedAt: null,
      endedAt: time,
      duration: 0,
      velocity: safeVelocity,
      releaseVelocity: null,
      sustained: false,
      terminationReason: null,
    });
  }

  /**
   * Enregistre un événement note_off.
   * @param {number} note - 0-127
   * @param {number} [releaseVelocity] - 0-1
   * @param {number} [channel] - 0-15
   * @param {string} [sourceId] - identifiant de la source MIDI
   */
  function noteOff(note, releaseVelocity = 0, channel = 0, sourceId = DEFAULT_SOURCE_ID) {
    if (finalized) return;
    assertValidNote(note);
    assertValidChannel(channel);

    const safeReleaseVelocity = Number.isFinite(releaseVelocity)
      ? Math.max(0, Math.min(1, releaseVelocity))
      : 0;

    const time = nowSeconds();
    const key = noteKey(sourceId, channel, note);

    events.push({
      id: makeEventId(),
      time,
      type: 'note_off',
      note,
      velocity: safeReleaseVelocity,
      channel,
      sourceId,
    });

    const active = activeNotes.get(key);
    if (!active || active.channel !== channel || active.sourceId !== sourceId) {
      // note-off orphelin : on l'enregistre mais on ne modifie pas l'état
      return;
    }

    active.releasedAt = time;
    active.releaseVelocity = safeReleaseVelocity;

    const sustain = sustainByChannel.get(noteKey(sourceId, channel, 'sustain')) || false;
    if (sustain) {
      active.sustained = true;
      const set = sustainedNotesByChannel.get(key) || new Set();
      set.add(key);
      sustainedNotesByChannel.set(key, set);
    } else {
      active.endedAt = time;
      active.duration = active.endedAt - active.startedAt;
      active.terminationReason = 'physical-release';
      activeNotes.delete(key);
    }
  }

  /**
   * Enregistre un message de contrôleur continu.
   * @param {number} controller - 0-127
   * @param {number} value - 0-127
   * @param {number} [channel] - 0-15
   * @param {string} [sourceId] - identifiant de la source MIDI
   */
  function control(controller, value, channel = 0, sourceId = DEFAULT_SOURCE_ID) {
    if (finalized) return;
    assertValidController(controller);
    assertValidChannel(channel);
    const safeValue = Math.max(0, Math.min(127, Math.round(value)));
    const time = nowSeconds();

    events.push({
      id: makeEventId(),
      time,
      type: 'control',
      controller,
      value: safeValue,
      channel,
      sourceId,
    });

    if (controller === DEFAULT_SUSTAIN_CONTROLLER) {
      const sustainKey = noteKey(sourceId, channel, 'sustain');
      const active = safeValue >= 64;
      const wasSustaining = sustainByChannel.get(sustainKey) || false;
      sustainByChannel.set(sustainKey, active);
      if (wasSustaining && !active) {
        releaseSustainedNotes(sourceId, channel);
      }
    }
  }

  /**
   * Enregistre un message de sustain (CC64).
   * @param {boolean} value
   * @param {number} [channel]
   * @param {string} [sourceId]
   */
  function sustain(value, channel = 0, sourceId = DEFAULT_SOURCE_ID) {
    control(DEFAULT_SUSTAIN_CONTROLLER, value ? 127 : 0, channel, sourceId);
  }

  /**
   * Relâche toutes les notes actuellement maintenues par le sustain sur un canal/source.
   * @param {string} sourceId
   * @param {number} channel
   * @param {string} [reason]
   */
  function releaseSustainedNotes(sourceId, channel, reason = 'sustain-release') {
    const channelKey = noteKey(sourceId, channel, 'sustain');
    const sustained = sustainedNotesByChannel.get(channelKey);
    if (!sustained) return;
    for (const key of sustained) {
      const state = activeNotes.get(key);
      if (state && state.channel === channel && state.sourceId === sourceId && state.sustained) {
        state.endedAt = nowSeconds();
        state.duration = state.endedAt - state.startedAt;
        state.terminationReason = reason;
        activeNotes.delete(key);
      }
    }
    sustained.clear();
  }

  /**
   * Retourne une copie de tous les événements capturés, triés par temps.
   * @returns {import('./midi-types.js').MidiNoteEvent[]}
   */
  function getEvents() {
    return [...events].sort((a, b) => {
      if (a.time !== b.time) return a.time - b.time;
      return events.indexOf(a) - events.indexOf(b);
    });
  }

  /**
   * Reconstruit l'état des notes tenues à l'instant demandé.
   * Cette fonction est pure : elle rejoue les événements sans modifier
   * l'état interne de la capture. Le résultat est JSON-safe.
   *
   * @param {number} time - secondes
   * @returns {import('./midi-types.js').HeldNoteState}
   */
  function getTimeline(time) {
    /** @type {Map<string, { midi: number, channel: number, sourceId: string, startTime: number, velocity: number, sustained: boolean }>} */
    const active = new Map();
    /** @type {Map<string, Set<string>>} */
    const sustainedByChannel = new Map();
    /** @type {Map<string, boolean>} */
    const sustain = new Map();

    function releaseSustainedTimeline(channelKey) {
      const set = sustainedByChannel.get(channelKey);
      if (!set) return;
      for (const key of set) {
        const noteState = active.get(key);
        if (noteState && noteState.sustained) {
          active.delete(key);
        }
      }
      set.clear();
    }

    const sorted = getEvents();
    for (const event of sorted) {
      if (event.time > time) break;

      const sustainKey = noteKey(event.sourceId || DEFAULT_SOURCE_ID, event.channel, 'sustain');
      const key = noteKey(event.sourceId || DEFAULT_SOURCE_ID, event.channel, event.note);

      if (event.type === 'note_on') {
        active.set(key, {
          midi: event.note,
          channel: event.channel,
          sourceId: event.sourceId || DEFAULT_SOURCE_ID,
          startTime: event.time,
          velocity: event.velocity ?? 0.8,
          sustained: false,
        });
        const set = sustainedByChannel.get(sustainKey);
        if (set) set.delete(key);
      } else if (event.type === 'note_off') {
        // Un note-off synthétique (finalize) doit toujours fermer la note,
        // même sous sustain, car la pédale a déjà été relâchée dans les
        // événements précédents.
        const isSynthetic = event.synthetic === true;
        const isSustaining = sustain.get(sustainKey) || false;
        const state = active.get(key);
        if (state && state.channel === event.channel) {
          if (isSustaining && !isSynthetic) {
            state.sustained = true;
            let set = sustainedByChannel.get(sustainKey);
            if (!set) {
              set = new Set();
              sustainedByChannel.set(sustainKey, set);
            }
            set.add(key);
          } else {
            active.delete(key);
            const set = sustainedByChannel.get(sustainKey);
            if (set) set.delete(key);
          }
        }
      } else if (event.type === 'control' && event.controller === DEFAULT_SUSTAIN_CONTROLLER) {
        const activeSustain = event.value >= 64;
        const wasSustaining = sustain.get(sustainKey) || false;
        sustain.set(sustainKey, activeSustain);
        if (!activeSustain) {
          if (wasSustaining) {
            releaseSustainedTimeline(sustainKey);
          }
        }
      }
    }

    return {
      activeNotes: [...active.values()],
      sustainedNotes: [...active.values()].filter((n) => n.sustained),
      sustainPedal: [...sustain.values()].some(Boolean),
    };
  }

  /**
   * Retourne une copie JSON-safe de toutes les notes terminées ou encore actives.
   * @returns {import('./midi-types.js').MidiNote[]}
   */
  function getNotes() {
    const now = finalized ? Number.POSITIVE_INFINITY : nowSeconds();
    const result = [];
    const seen = new Set();

    // Rejoue les événements pour reconstruire l'historique complet des notes,
    // y compris celles déjà terminées.
    const sorted = getEvents();
    /** @type {Map<string, import('./midi-types.js').MidiNote>} */
    const ongoing = new Map();
    for (const event of sorted) {
      const key = noteKey(event.sourceId || DEFAULT_SOURCE_ID, event.channel, event.note);
      if (event.type === 'note_on') {
        const note = {
          id: makeNoteId(),
          midi: event.note,
          channel: event.channel,
          sourceId: event.sourceId || DEFAULT_SOURCE_ID,
          startedAt: event.time,
          releasedAt: null,
          endedAt: event.time,
          duration: 0,
          velocity: event.velocity ?? 0.8,
          releaseVelocity: null,
          sustained: false,
          terminationReason: null,
        };
        ongoing.set(key, note);
      } else if (event.type === 'note_off') {
        const note = ongoing.get(key);
        if (note) {
          note.releasedAt = note.releasedAt || event.time;
          note.releaseVelocity = note.releaseVelocity ?? event.velocity;
          note.endedAt = event.time;
          note.duration = note.endedAt - note.startedAt;
          if (event.synthetic) {
            note.terminationReason = event.terminationReason || finalizeReason || 'session-stop';
          } else {
            note.terminationReason = note.sustained ? 'sustain-release' : 'physical-release';
          }
          if (!seen.has(note.id)) {
            seen.add(note.id);
            result.push(note);
          }
          ongoing.delete(key);
        }
      } else if (event.type === 'control' && event.controller === DEFAULT_SUSTAIN_CONTROLLER) {
        if (event.value >= 64) {
          for (const note of ongoing.values()) {
            if (note.channel === event.channel && note.sourceId === (event.sourceId || DEFAULT_SOURCE_ID)) {
              note.sustained = true;
            }
          }
        }
      }
    }

    // Notes encore actives (non finalisées).
    for (const note of ongoing.values()) {
      if (!seen.has(note.id)) {
        const live = { ...note };
        live.endedAt = now;
        live.duration = live.endedAt - live.startedAt;
        result.push(live);
      }
    }

    return result.sort((a, b) => {
      if (a.startedAt !== b.startedAt) return a.startedAt - b.startedAt;
      return a.midi - b.midi;
    });
  }

  /**
   * Finalise la capture en relâchant automatiquement toutes les notes
   * encore actives ou maintenues par le sustain. Garantit l'absence de
   * notes bloquées après la fin de session. Idempotent.
   *
   * @param {string} [reason] - 'disconnect' | 'session-stop' | 'reset'
   * @returns {import('./midi-types.js').MidiNoteEvent[]}
   */
  function finalize(reason = 'session-stop') {
    if (finalized) return getEvents();
    finalized = true;
    finalizeReason = reason;

    const finalTime = nowSeconds();
    const epsilon = 1e-9;

    // 1. Relâche la pédale de sustain sur tous les canaux/sources actifs.
    for (const [key, active] of sustainByChannel.entries()) {
      if (active) {
        const [sourceId, channel] = key.split('|');
        events.push({
          id: makeEventId(),
          time: finalTime,
          type: 'control',
          controller: DEFAULT_SUSTAIN_CONTROLLER,
          value: 0,
          channel: Number(channel),
          sourceId,
          synthetic: true,
          terminationReason: reason,
        });
      }
    }

    // 2. Relâche toutes les notes encore actives ou sustained.
    const stuckNotes = [...activeNotes.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    for (const [key, state] of stuckNotes) {
      state.releasedAt = state.releasedAt || finalTime;
      state.endedAt = finalTime + epsilon;
      state.duration = state.endedAt - state.startedAt;
      state.terminationReason = reason;
      events.push({
        id: makeEventId(),
        time: finalTime + epsilon,
        type: 'note_off',
        note: state.midi,
        velocity: state.releaseVelocity ?? 0,
        channel: state.channel,
        sourceId: state.sourceId,
        synthetic: true,
        terminationReason: reason,
      });
    }

    activeNotes.clear();
    sustainedNotesByChannel.clear();
    return getEvents();
  }

  /**
   * Réinitialise la capture. Les événements précédents sont perdus.
   */
  function clear() {
    events.length = 0;
    activeNotes.clear();
    sustainByChannel.clear();
    sustainedNotesByChannel.clear();
    finalized = false;
    finalizeReason = null;
  }

  /**
   * Retourne le temps de fin de la capture en secondes.
   * @returns {number}
   */
  function getDuration() {
    if (events.length === 0) return 0;
    const sorted = getEvents();
    return sorted[sorted.length - 1].time;
  }

  return {
    noteOn,
    noteOff,
    control,
    sustain,
    getEvents,
    getTimeline,
    getNotes,
    finalize,
    clear,
    getDuration,
  };
}

// ---------------------------------------------------------------------------
// Utilitaires
// ---------------------------------------------------------------------------

function getDefaultTime() {
  if (typeof performance !== 'undefined' && performance.now) {
    return performance.now();
  }
  return Date.now();
}

function assertValidNote(note) {
  if (!Number.isInteger(note) || note < 0 || note > 127) {
    throw new RangeError(`La note MIDI doit être un entier entre 0 et 127, reçu : ${note}`);
  }
}

function assertValidChannel(channel) {
  if (!Number.isInteger(channel) || channel < 0 || channel > 15) {
    throw new RangeError(`Le canal MIDI doit être un entier entre 0 et 15, reçu : ${channel}`);
  }
}

function assertValidController(controller) {
  if (!Number.isInteger(controller) || controller < 0 || controller > 127) {
    throw new RangeError(`Le numéro de contrôleur doit être un entier entre 0 et 127, reçu : ${controller}`);
  }
}
