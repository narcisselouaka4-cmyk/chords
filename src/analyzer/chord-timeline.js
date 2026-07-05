import { detectChord } from '../chord-engine/index.js';

// [OpenCode] — 2026-07-06 — Construit une timeline d'accords à partir d'événements MIDI.
// Pattern COLLECT-PUIS-ANALYSE synchrone : les notes sont regroupées par proximité temporelle,
// puis chaque groupe est analysé UNE SEULE FOIS quand il se stabilise.

const MIN_CHORD_DURATION = 0.2; // secondes, ignore les accords trop fugaces
const SILENCE_GAP = 0.5; // secondes de silence = coupure entre deux accords
const GRACE_NOTE_THRESHOLD = 0.2; // secondes, notes jouées moins longtemps sont taguées grace notes
const COLLECT_WINDOW = 0.18; // fenêtre de collecte en secondes (180ms)
const MELODIC_RATIO_THRESHOLD = 0.15; // Partie 1.4

export function buildChordTimeline(events, options = {}) {
  const minDuration = options.minDuration ?? MIN_CHORD_DURATION;
  const silenceGap = options.silenceGap ?? SILENCE_GAP;
  const collectWindow = options.collectWindow ?? COLLECT_WINDOW;

  const sorted = [...events].filter((e) => e != null).sort((a, b) => a.time - b.time);

  // ── Détection du caractère mélodique de la session ──
  const melodicProfile = computeMelodicProfile(sorted);
  const isMelodic = melodicProfile.ratio < MELODIC_RATIO_THRESHOLD;

  if (isMelodic) {
    return {
      isMelodic: true,
      chords: [],
      melodyLine: melodicProfile.melodyLine,
      noteGroups: melodicProfile.groups,
    };
  }

  // ── Phase 1 : Collecte synchrone des groupes de notes ──
  // On construit des "note groups" : ensembles de notes actives pendant une période.
  const rawGroups = collectNoteGroups(sorted, collectWindow);

  // ── Phase 2 : Analyse de chaque groupe stable ──
  const chords = [];
  let lastChord = null;
  let pendingGraceNotes = new Set();

  for (const group of rawGroups) {
    const notes = group.activeNotes;
    if (notes.length < 3) {
      // Pas assez de notes : possiblement un silence ou une ligne mélodique isolée
      if (lastChord) {
        const nextTime = group.startTime;
        if (nextTime - (lastChord.time + lastChord.duration) >= silenceGap) {
          lastChord = null;
        }
      }
      continue;
    }

    // Grace notes : notes tenues moins longtemps que le seuil
    const graceNotes = new Set();
    for (const n of notes) {
      const held = group.endTime - n.onTime;
      if (held < GRACE_NOTE_THRESHOLD && held >= 0) {
        graceNotes.add(n.midi);
      }
    }

    const detectionNotes = notes.filter((n) => !graceNotes.has(n.midi)).map((n) => n.midi);
    const detected = detectionNotes.length >= 3 ? detectChord(detectionNotes) : null;
    if (!detected || detected.symbol === '?') {
      lastChord = null;
      continue;
    }

    const startTime = group.startTime;
    const duration = Math.max(minDuration, group.endTime - group.startTime);

    if (!lastChord) {
      lastChord = makeChordEntry(detected, startTime, duration, graceNotes);
    } else {
      const sameChord =
        lastChord.rootPc === detected.rootPc &&
        lastChord.symbol === detected.symbol &&
        lastChord.bassPc === detected.bassPc;
      if (!sameChord) {
        chords.push(lastChord);
        lastChord = makeChordEntry(detected, startTime, duration, graceNotes);
      } else {
        // Même accord : on étend la durée et on met à jour les notes avec le groupe complet
        lastChord.duration += duration;
        lastChord.notes = detected.notes;
        lastChord.graceNotes = [...new Set([...lastChord.graceNotes, ...graceNotes])];
        lastChord.techniques = extractTechniques(detected);
        lastChord.voicing = detected.voicing;
      }
    }
  }

  if (lastChord) chords.push(lastChord);

  return {
    isMelodic: false,
    chords,
    melodyLine: [],
    noteGroups: [],
  };
}

function makeChordEntry(detected, startTime, duration, graceNotes) {
  return {
    time: startTime,
    rootPc: detected.rootPc,
    symbol: detected.symbol,
    bassPc: detected.bassPc,
    notes: detected.notes,
    duration,
    endTime: startTime + duration,
    graceNotes: [...graceNotes],
    techniques: extractTechniques(detected),
    voicing: detected.voicing,
  };
}

function extractTechniques(result) {
  const techniques = [];
  if (result.rootless) techniques.push('rootless');
  if (result.quartal) techniques.push('quartal');
  if (result.upperStructure) techniques.push('upper_structure');
  if (result.polychord) techniques.push('polychord');
  if (result.cluster) techniques.push('cluster');
  return techniques;
}

// Collecte synchrone des groupes de notes actives.
// Un groupe couvre une période où au moins une note est active, avec une marge
// de collectWindow entre deux groupes.
function collectNoteGroups(events, collectWindow) {
  if (events.length === 0) return [];

  // Construire des segments actifs : pour chaque note, période [note_on, note_off]
  const noteSpans = [];
  const active = new Map();
  const lastTime = events[events.length - 1]?.time || 0;

  for (const e of events) {
    if (e.type === 'note_on') {
      active.set(e.note, e.time);
    } else if (e.type === 'note_off') {
      const onTime = active.get(e.note);
      if (onTime != null) {
        noteSpans.push({ midi: e.note, onTime, offTime: e.time });
        active.delete(e.note);
      }
    }
  }

  // Notes encore actives à la fin
  for (const [note, onTime] of active) {
    noteSpans.push({ midi: note, onTime, offTime: lastTime + 0.5 });
  }

  noteSpans.sort((a, b) => a.onTime - b.onTime);

  const groups = [];
  let currentGroup = null;

  for (const span of noteSpans) {
    if (!currentGroup) {
      currentGroup = {
        startTime: span.onTime,
        endTime: span.offTime,
        activeNotes: [{ midi: span.midi, onTime: span.onTime }],
      };
    } else if (span.onTime - currentGroup.endTime <= collectWindow) {
      // Fait partie du groupe courant (marge glissante)
      currentGroup.endTime = Math.max(currentGroup.endTime, span.offTime);
      currentGroup.activeNotes.push({ midi: span.midi, onTime: span.onTime });
    } else {
      // Nouveau groupe
      groups.push(currentGroup);
      currentGroup = {
        startTime: span.onTime,
        endTime: span.offTime,
        activeNotes: [{ midi: span.midi, onTime: span.onTime }],
      };
    }
  }
  if (currentGroup) groups.push(currentGroup);

  return groups;
}

function computeMelodicProfile(events) {
  const groups = [];
  let active = new Map();
  const lastTime = events[events.length - 1]?.time || 0;

  for (const e of events) {
    if (e.type === 'note_on') {
      active.set(e.note, e.time);
    } else if (e.type === 'note_off') {
      if (active.has(e.note)) {
        groups.push({ note: e.note, time: active.get(e.note), duration: e.time - active.get(e.note) });
        active.delete(e.note);
      }
    }
  }

  for (const [note, time] of active) {
    groups.push({ note, time, duration: Math.max(0, lastTime - time) });
  }

  const sortedGroups = [...groups].sort((a, b) => a.time - b.time);

  // Regroupe les notes quasi-simultanées (50ms)
  let simultaneousGroups = 0;
  let totalGroups = 0;
  let currentWindow = [];

  for (const g of sortedGroups) {
    if (currentWindow.length === 0 || g.time - currentWindow[currentWindow.length - 1].time <= 0.05) {
      currentWindow.push(g);
    } else {
      totalGroups++;
      if (currentWindow.length >= 2) simultaneousGroups++;
      currentWindow = [g];
    }
  }
  if (currentWindow.length > 0) {
    totalGroups++;
    if (currentWindow.length >= 2) simultaneousGroups++;
  }

  const ratio = totalGroups > 0 ? simultaneousGroups / totalGroups : 0;

  return {
    groups: sortedGroups,
    melodyLine: sortedGroups.map((g) => ({ note: g.note, time: g.time })),
    ratio,
    totalGroups,
    simultaneousGroups,
  };
}

export function isMelodicSession(events) {
  return computeMelodicProfile(events).ratio < MELODIC_RATIO_THRESHOLD;
}
