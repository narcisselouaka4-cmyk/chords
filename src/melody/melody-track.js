// [OpenCode] — 2026-08-06 — Incrément 1 : piste mélodique explicite.
// Construction, diagnostic et édition non destructive d'une MelodyTrack
// à partir du snapshot validé de l'Incrément 0.

// Les types partagés sont documentés dans ./midi-types.js

const C4_MIDI = 60;
const TIME_EPSILON = 1e-9;
const UNUSUALLY_LONG_THRESHOLD_MS = 10000;

let nextTrackId = 0;
let nextMarkerId = 0;

function makeTrackId() {
  return `track-${++nextTrackId}`;
}

function makeMarkerId() {
  return `marker-${++nextMarkerId}`;
}

/**
 * Calcule la pitch class (0-11) et l'octave MIDI (C4 = 60 → octave 4).
 * @param {number} midi
 * @returns {{ pitchClass: number, octave: number }}
 */
function midiToPitch(midi) {
  return {
    pitchClass: ((midi % 12) + 12) % 12,
    octave: Math.floor(midi / 12) - Math.floor(C4_MIDI / 12),
  };
}

/**
 * Détermine si deux intervalles temporels se chevauchent.
 * @param {number} aStart
 * @param {number} aEnd
 * @param {number} bStart
 * @param {number} bEnd
 * @returns {boolean}
 */
function overlaps(aStart, aEnd, bStart, bEnd) {
  return aStart + TIME_EPSILON < bEnd && bStart + TIME_EPSILON < aEnd;
}

/**
 * Options par défaut pour la conversion d'une capture en MelodyTrack.
 */
const DEFAULT_MELODY_OPTIONS = {
  name: 'Mélodie',
  preserveExactPitch: true,
  sopranoPolicy: 'allow-notes-above',
  harmonizationPolicy: 'automatic',
  enabled: true,
  trackOffset: 0,
};

/**
 * Construit une MelodyTrack à partir d'un snapshot de capture MIDI.
 *
 * @param {{
 *   notes: import('./midi-types.js').MidiNote[],
 *   sourceCaptureId?: string,
 *   startedAt?: number,
 *   endedAt?: number
 * }} snapshot
 * @param {object} [options]
 * @param {string} [options.name]
 * @param {boolean} [options.preserveExactPitch]
 * @param {'allow-notes-above'|'melody-must-be-top'|'free'} [options.sopranoPolicy]
 * @param {'force'|'automatic'|'skip'} [options.harmonizationPolicy]
 * @param {boolean} [options.enabled]
 * @param {number} [options.trackOffset]
 * @returns {import('./midi-types.js').MelodyTrack}
 */
export function createMelodyTrack(snapshot, options = {}) {
  if (!snapshot || !Array.isArray(snapshot.notes)) {
    throw new TypeError('Le snapshot doit contenir un tableau notes');
  }

  const opts = { ...DEFAULT_MELODY_OPTIONS, ...options };
  const trackId = makeTrackId();
  const now = Date.now();
  const sourceCaptureId = snapshot.sourceCaptureId || trackId;

  const sortedNotes = [...snapshot.notes].sort((a, b) => {
    if (a.startedAt !== b.startedAt) return a.startedAt - b.startedAt;
    return a.midi - b.midi;
  });

  const trackStartedAt = Number.isFinite(snapshot.startedAt) ? snapshot.startedAt
    : (sortedNotes[0]?.startedAt || 0);
  const trackEndedAt = Number.isFinite(snapshot.endedAt) ? snapshot.endedAt
    : (sortedNotes[sortedNotes.length - 1]?.endedAt || trackStartedAt);

  /** @type {import('./midi-types.js').MelodyEvent[]} */
  const events = [];

  for (const note of sortedNotes) {
    const { pitchClass, octave } = midiToPitch(note.midi);
    const relativeStartedAt = note.startedAt - trackStartedAt + opts.trackOffset;
    const relativeEndedAt = note.endedAt - trackStartedAt + opts.trackOffset;
    const relativeReleasedAt = note.releasedAt !== null
      ? note.releasedAt - trackStartedAt + opts.trackOffset
      : null;

    const annotations = note.sustained ? ['sustained'] : [];
    if (note.terminationReason === 'disconnect' || note.terminationReason === 'session-stop' || note.terminationReason === 'reset') {
      annotations.push(`forced:${note.terminationReason}`);
    }

    events.push({
      id: note.id,
      sourceNoteId: note.id,
      midi: note.midi,
      pitchClass,
      octave,
      velocity: note.velocity,
      startedAt: Math.max(0, relativeStartedAt),
      releasedAt: relativeReleasedAt,
      endedAt: Math.max(0, relativeEndedAt),
      duration: Math.max(0, note.duration),
      channel: note.channel,
      sourceId: note.sourceId || null,
      preserveExactPitch: opts.preserveExactPitch,
      sopranoPolicy: opts.sopranoPolicy,
      harmonizationPolicy: opts.harmonizationPolicy,
      enabled: opts.enabled,
      annotations: [...annotations],
    });
  }

  return {
    id: trackId,
    name: opts.name,
    sourceCaptureId,
    startedAt: trackStartedAt,
    endedAt: trackEndedAt,
    duration: trackEndedAt - trackStartedAt,
    events: events.map((e) => ({ ...e, annotations: [...e.annotations] })),
    markers: [],
    version: 1,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Crée une session MelodyTrack vide prête à recevoir des notes.
 * Utile pour initialiser un enregistrement avant qu'une capture ne soit finalisée.
 *
 * @param {object} [options]
 * @returns {import('./midi-types.js').MelodyTrack}
 */
export function createEmptyMelodyTrack(options = {}) {
  const opts = { ...DEFAULT_MELODY_OPTIONS, ...options };
  const trackId = makeTrackId();
  const now = Date.now();
  return {
    id: trackId,
    name: opts.name,
    sourceCaptureId: trackId,
    startedAt: 0,
    endedAt: 0,
    duration: 0,
    events: [],
    markers: [],
    version: 1,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Produit un diagnostic non destructif de la piste.
 *
 * @param {import('./midi-types.js').MelodyTrack} track
 * @returns {import('./midi-types.js').MelodyTrackDiagnostic}
 */
export function diagnoseMelodyTrack(track) {
  const enabledEvents = track.events.filter((e) => e.enabled);
  /** @type {import('./midi-types.js').MelodyTrackDiagnostic['overlaps']} */
  const overlapsList = [];
  /** @type {import('./midi-types.js').MelodyTrackDiagnostic['simultaneousAttacks']} */
  const simultaneousAttacks = [];
  /** @type {import('./midi-types.js').MelodyTrackDiagnostic['unusuallyLongNotes']} */
  const unusuallyLongNotes = [];
  /** @type {import('./midi-types.js').MelodyTrackDiagnostic['incompleteEvents']} */
  const incompleteEvents = [];
  /** @type {import('./midi-types.js').MelodyTrackDiagnostic['forcedTerminations']} */
  const forcedTerminations = [];
  const warnings = [];

  const thresholdSeconds = UNUSUALLY_LONG_THRESHOLD_MS / 1000;

  // Regroupe les attaques simultanées.
  const attackGroups = new Map();
  for (const event of enabledEvents) {
    const key = String(event.startedAt.toFixed(6));
    if (!attackGroups.has(key)) attackGroups.set(key, []);
    attackGroups.get(key).push(event);
  }
  for (const [, group] of attackGroups) {
    if (group.length > 1) {
      simultaneousAttacks.push({
        time: group[0].startedAt,
        ids: group.map((e) => e.id),
      });
    }
  }

  for (let i = 0; i < enabledEvents.length; i++) {
    const a = enabledEvents[i];

    if (a.endedAt <= a.startedAt + TIME_EPSILON || a.duration <= 0) {
      incompleteEvents.push({ id: a.id, reason: 'durée nulle ou négative' });
    }

    if (a.duration > thresholdSeconds) {
      unusuallyLongNotes.push({ id: a.id, duration: a.duration, threshold: thresholdSeconds });
    }

    for (let j = i + 1; j < enabledEvents.length; j++) {
      const b = enabledEvents[j];
      if (b.startedAt > a.endedAt + TIME_EPSILON) break;
      if (overlaps(a.startedAt, a.endedAt, b.startedAt, b.endedAt)) {
        overlapsList.push({ fromId: a.id, toId: b.id, time: b.startedAt });
      }
    }
  }

  // Détecte les fins forcées à partir des annotations.
  // (Les annotations portent l'information d'origine transmise par la capture.)
  for (const event of track.events) {
    if (event.annotations.includes('forced:disconnect')) {
      forcedTerminations.push({ id: event.id, reason: 'disconnect' });
    } else if (event.annotations.includes('forced:session-stop')) {
      forcedTerminations.push({ id: event.id, reason: 'session-stop' });
    } else if (event.annotations.includes('forced:reset')) {
      forcedTerminations.push({ id: event.id, reason: 'reset' });
    }
  }

  if (overlapsList.length > 0) {
    warnings.push(`${overlapsList.length} chevauchement(s) détecté(s) ; la piste reste utilisable.`);
  }
  if (simultaneousAttacks.length > 0) {
    warnings.push(`${simultaneousAttacks.length} attaque(s) simultanée(s) conservée(s).`);
  }
  if (forcedTerminations.length > 0) {
    warnings.push(`${forcedTerminations.length} note(s) terminée(s) par événement forcé.`);
  }

  return {
    overlaps: overlapsList,
    simultaneousAttacks,
    unusuallyLongNotes,
    incompleteEvents,
    forcedTerminations,
    warnings,
  };
}

/**
 * Retourne une nouvelle MelodyTrack avec un événement activé/désactivé.
 *
 * @param {import('./midi-types.js').MelodyTrack} track
 * @param {string} eventId
 * @param {boolean} enabled
 * @returns {import('./midi-types.js').MelodyTrack}
 */
export function setEventEnabled(track, eventId, enabled) {
  return updateTrack(track, (events) =>
    events.map((e) => (e.id === eventId ? { ...e, enabled } : e)),
  );
}

/**
 * Modifie la politique soprano d'un événement.
 *
 * @param {import('./midi-types.js').MelodyTrack} track
 * @param {string} eventId
 * @param {'allow-notes-above'|'melody-must-be-top'|'free'} policy
 * @returns {import('./midi-types.js').MelodyTrack}
 */
export function setEventSopranoPolicy(track, eventId, policy) {
  return updateTrack(track, (events) =>
    events.map((e) => (e.id === eventId ? { ...e, sopranoPolicy: policy } : e)),
  );
}

/**
 * Modifie la politique d'harmonisation d'un événement.
 *
 * @param {import('./midi-types.js').MelodyTrack} track
 * @param {string} eventId
 * @param {'force'|'automatic'|'skip'} policy
 * @returns {import('./midi-types.js').MelodyTrack}
 */
export function setEventHarmonizationPolicy(track, eventId, policy) {
  return updateTrack(track, (events) =>
    events.map((e) => (e.id === eventId ? { ...e, harmonizationPolicy: policy } : e)),
  );
}

/**
 * Modifie l'option de conservation exacte du pitch pour un événement.
 *
 * @param {import('./midi-types.js').MelodyTrack} track
 * @param {string} eventId
 * @param {boolean} preserve
 * @returns {import('./midi-types.js').MelodyTrack}
 */
export function setEventPreserveExactPitch(track, eventId, preserve) {
  return updateTrack(track, (events) =>
    events.map((e) => (e.id === eventId ? { ...e, preserveExactPitch: preserve } : e)),
  );
}

/**
 * Renomme la piste.
 *
 * @param {import('./midi-types.js').MelodyTrack} track
 * @param {string} name
 * @returns {import('./midi-types.js').MelodyTrack}
 */
export function renameMelodyTrack(track, name) {
  return { ...track, name, version: track.version + 1, updatedAt: Date.now() };
}

/**
 * Ajoute un marqueur.
 *
 * @param {import('./midi-types.js').MelodyTrack} track
 * @param {number} time
 * @param {import('./midi-types.js').MelodyMarker['type']} type
 * @param {string|null} [label]
 * @returns {import('./midi-types.js').MelodyTrack}
 */
export function addMarker(track, time, type, label = null) {
  const marker = { id: makeMarkerId(), time, type, label };
  return updateTrack(track, (events) => events, (markers) => [...markers, marker].sort((a, b) => a.time - b.time));
}

/**
 * Supprime un marqueur.
 *
 * @param {import('./midi-types.js').MelodyTrack} track
 * @param {string} markerId
 * @returns {import('./midi-types.js').MelodyTrack}
 */
export function removeMarker(track, markerId) {
  return updateTrack(track, (events) => events, (markers) => markers.filter((m) => m.id !== markerId));
}

/**
 * Découpe la piste à une plage temporelle [start, end].
 * Les temps sont relatifs à la piste.
 *
 * @param {import('./midi-types.js').MelodyTrack} track
 * @param {number} start
 * @param {number} end
 * @returns {import('./midi-types.js').MelodyTrack}
 */
export function sliceMelodyTrack(track, start, end) {
  if (start >= end) throw new RangeError('La plage de découpage doit être croissante');

  const slicedEvents = track.events
    .filter((e) => e.enabled && overlaps(start, end, e.startedAt, e.endedAt))
    .map((e) => ({
      ...e,
      startedAt: Math.max(0, e.startedAt - start),
      releasedAt: e.releasedAt !== null ? Math.max(0, e.releasedAt - start) : null,
      endedAt: Math.max(0, Math.min(end, e.endedAt) - start),
      duration: Math.max(0, Math.min(end, e.endedAt) - Math.max(start, e.startedAt)),
    }));

  const slicedMarkers = track.markers
    .filter((m) => m.time >= start - TIME_EPSILON && m.time <= end + TIME_EPSILON)
    .map((m) => ({ ...m, time: Math.max(0, m.time - start) }));

  return updateTrack(track, () => slicedEvents, () => slicedMarkers);
}

/**
 * Produit la séquence de lecture d'une MelodyTrack.
 *
 * @param {import('./midi-types.js').MelodyTrack} track
 * @returns {import('./midi-types.js').MelodyPlaybackEvent[]}
 */
export function buildMelodyPlaybackEvents(track) {
  /** @type {import('./midi-types.js').MelodyPlaybackEvent[]} */
  const playback = [];

  for (const event of track.events) {
    if (!event.enabled) continue;

    playback.push({
      time: event.startedAt,
      type: 'note_on',
      midi: event.midi,
      velocity: event.velocity,
      channel: event.channel,
      sourceId: event.sourceId,
      melodyEventId: event.id,
    });

    playback.push({
      time: event.endedAt,
      type: 'note_off',
      midi: event.midi,
      velocity: 0,
      channel: event.channel,
      sourceId: event.sourceId,
      melodyEventId: event.id,
    });
  }

  return playback.sort((a, b) => {
    if (Math.abs(a.time - b.time) > TIME_EPSILON) return a.time - b.time;
    // note_on avant note_off aux temps identiques pour éviter les notes nulles
    if (a.type !== b.type) return a.type === 'note_on' ? -1 : 1;
    return a.melodyEventId.localeCompare(b.melodyEventId);
  });
}

/**
 * Vérifie qu'une piste peut être considérée comme valide pour la suite du pipeline.
 *
 * @param {import('./midi-types.js').MelodyTrack} track
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateMelodyTrack(track) {
  const errors = [];
  if (!track.events || track.events.length === 0) {
    errors.push('La piste ne contient aucun événement.');
  }

  const enabledEvents = track.events.filter((e) => e.enabled);
  if (enabledEvents.length === 0) {
    errors.push('La piste ne contient aucun événement activé.');
  }

  const diagnostic = diagnoseMelodyTrack(track);
  if (diagnostic.incompleteEvents.length > 0) {
    errors.push(`${diagnostic.incompleteEvents.length} événement(s) incomplet(s).`);
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Helper interne pour produire une nouvelle version de piste sans muter l'originale.
 *
 * @param {import('./midi-types.js').MelodyTrack} track
 * @param {(events: import('./midi-types.js').MelodyEvent[]) => import('./midi-types.js').MelodyEvent[]} eventMapper
 * @param {(markers: import('./midi-types.js').MelodyMarker[]) => import('./midi-types.js').MelodyMarker[]} [markerMapper]
 * @returns {import('./midi-types.js').MelodyTrack}
 */
function updateTrack(track, eventMapper, markerMapper = (m) => [...m]) {
  const events = eventMapper([...track.events]).map((e) => ({ ...e }));
  const markers = markerMapper([...track.markers]).map((m) => ({ ...m }));
  const endedAt = events.length > 0
    ? Math.max(...events.map((e) => e.endedAt))
    : track.endedAt - track.startedAt;
  return {
    ...track,
    events,
    markers,
    duration: Math.max(0, endedAt),
    version: track.version + 1,
    updatedAt: Date.now(),
  };
}
