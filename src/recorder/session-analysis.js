import { DEFAULT_TOLERANCE_MS, MAX_SPAN_SEMITONES, MIN_SIMULTANEOUS, CONJUNCT_INTERVAL_SEMITONES } from '../note-grouper.js';
import { detectChord } from '../chord-engine/index.js';

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

function buildNoteWindows(events) {
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

function groupNotesByAttack(noteWindows) {
  const groups = [];
  let currentGroup = [];

  for (const w of noteWindows) {
    if (currentGroup.length === 0) {
      currentGroup.push(w);
    } else {
      const lastOnTime = currentGroup[currentGroup.length - 1].onTime;
      if (w.onTime - lastOnTime < DEFAULT_TOLERANCE_MS / 1000) {
        currentGroup.push(w);
      } else {
        if (currentGroup.length > 0) {
          groups.push(currentGroup);
        }
        currentGroup = [w];
      }
    }
  }
  if (currentGroup.length > 0) {
    groups.push(currentGroup);
  }
  return groups;
}

function calculateMaxConcurrency(group) {
  const events = [];
  for (const w of group) {
    events.push({ time: w.onTime, delta: 1 });
    events.push({ time: w.offTime, delta: -1 });
  }
  events.sort((a, b) => a.time - b.time);
  let concurrent = 0;
  let maxConcurrent = 0;
  for (const e of events) {
    concurrent += e.delta;
    if (concurrent > maxConcurrent) maxConcurrent = concurrent;
  }
  return maxConcurrent;
}

function calculateSpan(group) {
  const notes = group.map((w) => w.note);
  return Math.max(...notes) - Math.min(...notes);
}

function createMelodySegments(noteWindows, chordSegments) {
  const chordTimes = new Set();
  for (const cs of chordSegments) {
    for (const w of cs.group) {
      chordTimes.add(`${w.channel}:${w.note}:${w.onTime}`);
    }
  }

  const melodyNotes = noteWindows.filter((w) => !chordTimes.has(`${w.channel}:${w.note}:${w.onTime}`));
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

export function segmentSessionEvents(events) {
  if (!events || events.length === 0) return [];

  const sortedEvents = [...events].sort((a, b) => a.time - b.time);
  const noteWindows = buildNoteWindows(sortedEvents);
  const candidateGroups = groupNotesByAttack(noteWindows);

  const chordSegments = [];
  for (const group of candidateGroups) {
    const span = calculateSpan(group);
    const maxConcurrent = calculateMaxConcurrency(group);

    if (span <= MAX_SPAN_SEMITONES && maxConcurrent >= MIN_SIMULTANEOUS && !isMelodicRun(group)) {
      chordSegments.push({
        type: 'chord',
        start: group[0].onTime,
        end: Math.max(...group.map((w) => w.offTime)),
        notes: group.map((w) => w.note),
        group,
      });
    }
  }

  const melodySegments = createMelodySegments(noteWindows, chordSegments);

  const allSegments = [...chordSegments, ...melodySegments].sort((a, b) => a.start - b.start);
  return allSegments.map(({ group, ...rest }) => rest);
}

export function nameChordSegments(segments) {
  for (const seg of segments) {
    if (seg.type === 'chord' && seg.notes && seg.notes.length > 0) {
      const result = detectChord(seg.notes);
      seg.chordName = result?.fullName || null;
    }
  }
  return segments;
}