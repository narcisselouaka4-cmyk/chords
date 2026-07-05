import { detectChord } from '../chord-engine/index.js';

// [OpenCode] — 2026-07-04 — Construit une timeline d'accords à partir d'événements MIDI.
// Regroupe les notes actives en "chord slices" et détecte l'accord à chaque changement significatif.

const MIN_CHORD_DURATION = 0.2; // secondes, ignore les accords trop fugaces (200ms = fenêtre arpège)
const SILENCE_GAP = 0.5; // secondes de silence = coupure entre deux accords
const GRACE_NOTE_THRESHOLD = 0.2; // secondes, notes jouées moins longtemps sont taguées grace notes

export function buildChordTimeline(events, options = {}) {
  const minDuration = options.minDuration ?? MIN_CHORD_DURATION;
  const silenceGap = options.silenceGap ?? SILENCE_GAP;

  const sorted = [...events].filter((e) => e != null).sort((a, b) => a.time - b.time);

  let activeNotes = new Map(); // midi -> { time: note_on, isGrace: boolean }
  let lastChord = null;
  let chordStartTime = 0;
  let pendingGraceNotes = new Set(); // grace notes detected while current chord active
  const chords = [];

  function currentPcSet() {
    return Array.from(new Set([...activeNotes.keys()]
      .filter((n) => !activeNotes.get(n)?.isGrace)
      .map((n) => n % 12))).sort((a, b) => a - b);
  }

  function activeNotesForDetection() {
    return [...activeNotes.keys()].filter((n) => !activeNotes.get(n)?.isGrace);
  }

  function finishChord(endTime) {
    if (!lastChord) return;
    const duration = endTime - chordStartTime;
    if (duration >= minDuration) {
      chords.push({
        ...lastChord,
        duration,
        endTime,
        graceNotes: [...pendingGraceNotes],
      });
    }
    lastChord = null;
    pendingGraceNotes.clear();
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

  for (let i = 0; i < sorted.length; i++) {
    const event = sorted[i];
    const nextEvent = sorted[i + 1];

    if (event.type === 'note_on') {
      activeNotes.set(event.note, { time: event.time, isGrace: false });
    } else if (event.type === 'note_off') {
      const noteState = activeNotes.get(event.note);
      if (noteState) {
        const heldDuration = event.time - noteState.time;
        if (heldDuration < GRACE_NOTE_THRESHOLD) {
          // Tag as grace note and attach to current chord block
          pendingGraceNotes.add(event.note);
        }
      }
      activeNotes.delete(event.note);
    }

    const nextTime = nextEvent ? nextEvent.time : event.time + silenceGap;

    // Detect chord using only non-grace notes
    const pcs = currentPcSet();
    const detected = pcs.length >= 3 ? detectChord(activeNotesForDetection()) : null;

    if (detected && detected.symbol !== '?') {
      if (!lastChord) {
        chordStartTime = event.time;
        lastChord = {
          time: chordStartTime,
          rootPc: detected.rootPc,
          symbol: detected.symbol,
          bassPc: detected.bassPc,
          notes: detected.notes,
          techniques: extractTechniques(detected),
          voicing: detected.voicing,
        };
      } else {
        const sameChord =
          lastChord.rootPc === detected.rootPc &&
          lastChord.symbol === detected.symbol &&
          lastChord.bassPc === detected.bassPc;
        if (!sameChord) {
          finishChord(event.time);
          chordStartTime = event.time;
          lastChord = {
            time: chordStartTime,
            rootPc: detected.rootPc,
            symbol: detected.symbol,
            bassPc: detected.bassPc,
            notes: detected.notes,
            techniques: extractTechniques(detected),
            voicing: detected.voicing,
          };
        }
      }
    } else {
      // Silence or not enough notes: finish current chord if gap is large enough
      if (lastChord && nextTime - event.time >= silenceGap) {
        finishChord(event.time);
      }
    }
  }

  // Finish last chord at end of events
  if (lastChord && sorted.length > 0) {
    const endTime = sorted[sorted.length - 1].time + minDuration;
    finishChord(endTime);
  }

  return chords;
}
