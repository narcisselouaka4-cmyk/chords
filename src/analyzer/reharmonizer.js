import { midiToPc } from '../chord-engine/intervals.js';

// [OpenCode] — 2026-07-04 — Suggestions de réharmonisation par style, accord par accord.
// Chaque suggestion est un objet { name, notes: number[], style } avec un tableau MIDI jouable.

const STYLE_LABELS = {
  worship: 'Worship',
  gospel: 'Gospel',
  jazz: 'Jazz',
  neoSoul: 'Neo Soul',
};

const STYLE_TRANSFORMERS = {
  worship: transformWorship,
  gospel: transformGospel,
  jazz: transformJazz,
  neoSoul: transformNeoSoul,
};

export function getStyleLabels() {
  return STYLE_LABELS;
}

export function suggestForChord(chord, style = 'jazz') {
  const transformer = STYLE_TRANSFORMERS[style] || transformJazz;
  return transformer(chord);
}

// ────────────────────────────── Utilitaires ──────────────────────────────

function rootPc(chord) {
  return typeof chord.rootPc === 'number' ? chord.rootPc : midiToPc(baseNotes(chord)[0]);
}

function baseNotes(chord) {
  if (!chord) return [];
  if (Array.isArray(chord.notes) && chord.notes.length > 0) {
    return chord.notes.map((n) => (typeof n === 'number' ? n : midiToPc(n) + 60));
  }
  return [];
}

function isMinorSymbol(symbol) {
  if (!symbol) return false;
  // Match "m", "m7...", "min", "mi" as a distinct qualifier, or "-" (minus chord shorthand)
  return /^(m(?=\d|\/|add|sus|$)|min|mi(?=\d|\/|add|sus|$)|-)/i.test(symbol);
}

function isDominantSymbol(symbol) {
  if (!symbol || isMinorSymbol(symbol)) return false;
  return /^(7|9|13|dim|°)/i.test(symbol) || (/7/.test(symbol) && !/maj/i.test(symbol));
}

function pickInversion(notes, bassPc) {
  if (bassPc == null) return notes;
  const bassMidi = notes.find((n) => midiToPc(n) === bassPc) ?? notes[0];
  const result = [bassMidi];
  for (const note of notes) {
    if (note === bassMidi) continue;
    let pos = note;
    while (pos <= bassMidi) pos += 12;
    result.push(pos);
  }
  return result.sort((a, b) => a - b);
}

function voicing(root, intervals, options = {}) {
  const { bassPc = null, octave = 4, spread = false } = options;
  const base = (octave + 1) * 12 + root;
  const notes = intervals.map((i, idx) => {
    if (spread && idx === 1 && i > 7) return base + i - 12;
    if (spread && idx === 3 && i > 14) return base + i - 12;
    return base + i;
  });
  const sorted = [...new Set(notes)].sort((a, b) => a - b);
  if (bassPc != null && bassPc !== root) {
    return pickInversion(sorted, bassPc);
  }
  return sorted;
}

function pcName(pc, latin = false) {
  const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const LATIN_NAMES = ['Do', 'Do#', 'Ré', 'Ré#', 'Mi', 'Fa', 'Fa#', 'Sol', 'Sol#', 'La', 'La#', 'Si'];
  const names = latin ? LATIN_NAMES : NOTE_NAMES;
  return names[(pc + 12) % 12];
}

function name(root, symbol, bassPc = null, latin = false) {
  const rootName = pcName(root, latin);
  const bassName = bassPc != null && bassPc !== root ? `/${pcName(bassPc, latin)}` : '';
  return `${rootName}${symbol}${bassName}`;
}

function hash(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) & 0x7fffffff;
  return h;
}

function seededChoice(seed, items) {
  return items[Math.abs(hash(String(seed))) % items.length];
}

function chordSeed(chord) {
  const root = rootPc(chord);
  const sym = chord.symbol || '';
  const time = Math.floor((chord.time || 0) * 100);
  return `${root}-${sym}-${time}`;
}

// ────────────────────────────── Worship ──────────────────────────────

function transformWorship(chord) {
  const r = rootPc(chord);
  const sym = chord.symbol || '';
  const minor = isMinorSymbol(sym);
  const seed = chordSeed(chord);

  const options = minor
    ? [
        { symbol: 'm(add9)', intervals: [0, 3, 7, 14] },
        { symbol: 'm7', intervals: [0, 3, 7, 10] },
        { symbol: 'm9', intervals: [0, 3, 7, 10, 14] },
        { symbol: 'm(add4)', intervals: [0, 3, 5, 7] },
        { symbol: 'sus2', intervals: [0, 2, 7, 12] },
      ]
    : [
        { symbol: '', intervals: [0, 4, 7, 12] },
        { symbol: 'add9', intervals: [0, 4, 7, 14] },
        { symbol: 'sus2', intervals: [0, 2, 7, 12] },
        { symbol: 'sus4', intervals: [0, 5, 7, 12] },
        { symbol: 'maj7', intervals: [0, 4, 7, 11] },
        { symbol: 'maj9', intervals: [0, 4, 7, 11, 14] },
      ];

  const choice = seededChoice(seed, options);
  return {
    name: name(r, choice.symbol),
    notes: voicing(r, choice.intervals, { spread: true }),
    style: 'worship',
  };
}

// ────────────────────────────── Gospel ──────────────────────────────

function transformGospel(chord) {
  const r = rootPc(chord);
  const sym = chord.symbol || '';
  const seed = chordSeed(chord);
  const minor = isMinorSymbol(sym);
  const dominant = isDominantSymbol(sym);

  if (dominant || (!minor && /[0-9]/.test(sym))) {
    const options = [
      { symbol: '9', intervals: [0, 4, 7, 10, 14] },
      { symbol: '13', intervals: [0, 4, 7, 10, 14, 21] },
      { symbol: '7(#9)', intervals: [0, 4, 7, 10, 15] },
      { symbol: '7(b9)', intervals: [0, 4, 7, 10, 13] },
    ];
    const choice = seededChoice(seed, options);
    return {
      name: name(r, choice.symbol),
      notes: voicing(r, choice.intervals),
      style: 'gospel',
    };
  }

  if (!minor && Math.abs(hash(seed)) % 4 === 0) {
    const subRoot = (r + 6) % 12;
    return {
      name: name(subRoot, '7b9', r),
      notes: voicing(subRoot, [0, 4, 7, 10, 13], { bassPc: r }),
      style: 'gospel',
    };
  }

  if (minor) {
    const options = [
      { symbol: 'm9', intervals: [0, 3, 7, 10, 14] },
      { symbol: 'm11', intervals: [0, 3, 7, 10, 14, 17] },
      { symbol: 'm7(b5)', intervals: [0, 3, 6, 10] },
    ];
    const choice = seededChoice(seed, options);
    return {
      name: name(r, choice.symbol),
      notes: voicing(r, choice.intervals),
      style: 'gospel',
    };
  }

  const options = [
    { symbol: 'maj9', intervals: [0, 4, 7, 11, 14] },
    { symbol: '6/9', intervals: [0, 4, 7, 9, 14] },
    { symbol: '13sus', intervals: [0, 5, 7, 10, 14, 21] },
  ];
  const choice = seededChoice(seed, options);
  return {
    name: name(r, choice.symbol),
    notes: voicing(r, choice.intervals),
    style: 'gospel',
  };
}

// ────────────────────────────── Jazz ──────────────────────────────

function transformJazz(chord) {
  const r = rootPc(chord);
  const sym = chord.symbol || '';
  const seed = chordSeed(chord);
  const minor = isMinorSymbol(sym);
  const dominant = isDominantSymbol(sym);

  if (dominant) {
    const options = [
      { symbol: '7alt', intervals: [0, 4, 8, 10, 13, 15, 18] },
      { symbol: '13', intervals: [0, 4, 7, 10, 14, 17, 21] },
      { symbol: '9', intervals: [0, 4, 7, 10, 14] },
      { symbol: '7b9', intervals: [0, 4, 7, 10, 13] },
    ];
    const choice = seededChoice(seed, options);
    return {
      name: name(r, choice.symbol),
      notes: voicing(r, choice.intervals, { spread: true }),
      style: 'jazz',
    };
  }

  if (!minor && Math.abs(hash(seed)) % 3 === 0) {
    const subRoot = (r + 6) % 12;
    return {
      name: name(subRoot, '7b9', r),
      notes: voicing(subRoot, [0, 4, 8, 10, 13], { bassPc: r }),
      style: 'jazz',
    };
  }

  if (minor) {
    const options = [
      { symbol: 'm9', intervals: [0, 3, 7, 10, 14] },
      { symbol: 'm11', intervals: [0, 3, 7, 10, 14, 17] },
      { symbol: 'm6', intervals: [0, 3, 7, 9] },
      { symbol: 'm7(b5)', intervals: [0, 3, 6, 10] },
    ];
    const choice = seededChoice(seed, options);
    return {
      name: name(r, choice.symbol),
      notes: voicing(r, choice.intervals, { spread: true }),
      style: 'jazz',
    };
  }

  const options = [
    { symbol: 'maj9', intervals: [0, 4, 7, 11, 14] },
    { symbol: 'maj7(#11)', intervals: [0, 4, 7, 11, 18] },
    { symbol: '6', intervals: [0, 4, 7, 9] },
    { symbol: 'maj13', intervals: [0, 4, 7, 11, 14, 17, 21] },
  ];
  const choice = seededChoice(seed, options);
  return {
    name: name(r, choice.symbol),
    notes: voicing(r, choice.intervals, { spread: true }),
    style: 'jazz',
  };
}

// ────────────────────────────── Neo Soul ──────────────────────────────

function transformNeoSoul(chord) {
  const r = rootPc(chord);
  const sym = chord.symbol || '';
  const seed = chordSeed(chord);
  const minor = isMinorSymbol(sym);

  if (minor) {
    const options = [
      { symbol: 'm9', intervals: [0, 3, 7, 10, 14] },
      { symbol: 'm11', intervals: [0, 3, 7, 10, 14, 17] },
      { symbol: 'm7(9,11)', intervals: [0, 3, 7, 10, 14, 17] },
      { symbol: 'm7 add11', intervals: [0, 3, 7, 10, 17] },
    ];
    const choice = seededChoice(seed, options);
    return {
      name: name(r, choice.symbol),
      notes: voicing(r, choice.intervals, { spread: true }),
      style: 'neoSoul',
    };
  }

  const options = [
    { symbol: 'maj9', intervals: [0, 4, 7, 11, 14] },
    { symbol: '11', intervals: [0, 4, 7, 10, 14, 17] },
    { symbol: '13sus', intervals: [0, 5, 7, 10, 14, 21] },
    { symbol: 'add9(#11)', intervals: [0, 4, 7, 14, 18] },
    { symbol: 'quartal', intervals: [0, 5, 10, 15, 19] },
  ];
  const choice = seededChoice(seed, options);
  return {
    name: name(r, choice.symbol),
    notes: voicing(r, choice.intervals, { spread: true }),
    style: 'neoSoul',
  };
}

// ────────────────────────────── Réharmonisation d'une progression complète ──────────────────────────────

export function suggestProgression(chords, style = 'jazz') {
  if (!Array.isArray(chords) || chords.length === 0) return [];

  return chords.map((chord) => {
    const suggestion = suggestForChord(chord, style);
    return {
      original: {
        rootPc: chord.rootPc,
        symbol: chord.symbol,
        bassPc: chord.bassPc,
        notes: chord.notes,
        time: chord.time,
        duration: chord.duration,
      },
      replacement: {
        rootPc: chord.rootPc,
        symbol: suggestion.name.replace(/^[^/]+/, '').replace(/^\//, '') || chord.symbol,
        name: suggestion.name,
        notes: suggestion.notes,
        style,
      },
      time: chord.time,
      duration: chord.duration,
    };
  });
}

export function renderProgressionToEvents(progression, bpm = 90) {
  if (!Array.isArray(progression) || progression.length === 0) return [];

  const beatDuration = 60 / bpm;
  const events = [];

  for (const entry of progression) {
    const notes = entry.replacement?.notes || entry.original?.notes || [];
    if (notes.length === 0) continue;

    const duration = entry.duration || entry.original?.duration || beatDuration * 4;
    const startTime = entry.time || entry.original?.time || 0;
    const velocity = 0.72;

    for (const note of notes) {
      events.push({ time: startTime, type: 'note_on', note, velocity, channel: 0 });
      events.push({ time: startTime + duration, type: 'note_off', note, velocity: 0, channel: 0 });
    }
  }

  return events.sort((a, b) => a.time - b.time);
}

export function playProgression(progression, feedMidiEvent, bpm = 90) {
  if (!feedMidiEvent || !Array.isArray(progression) || progression.length === 0) return;

  const events = renderProgressionToEvents(progression, bpm);
  const now = performance.now();
  const startOffset = events[0]?.time || 0;

  for (const event of events) {
    const delay = (event.time - startOffset) * 1000;
    setTimeout(() => {
      switch (event.type) {
        case 'note_on':
          feedMidiEvent('noteOn', event.note, event.velocity);
          break;
        case 'note_off':
          feedMidiEvent('noteOff', event.note);
          break;
      }
    }, delay);
  }
}

// ────────────────────────────── Export playback helpers ──────────────────────────────

export function renderSuggestionToEvents(suggestion, channel = 0) {
  if (!suggestion || !Array.isArray(suggestion.notes) || suggestion.notes.length === 0) return [];
  const velocity = 0.7;
  const duration = 1.0;
  const events = [];
  for (const note of suggestion.notes) {
    events.push({ time: 0, type: 'note_on', note, velocity, channel });
  }
  for (const note of suggestion.notes) {
    events.push({ time: duration, type: 'note_off', note, channel });
  }
  return events.sort((a, b) => a.time - b.time);
}

export function playSuggestion(suggestion, feedMidiEvent) {
  if (!feedMidiEvent) return;
  const events = renderSuggestionToEvents(suggestion);
  for (const event of events) {
    setTimeout(() => {
      switch (event.type) {
        case 'note_on':
          feedMidiEvent('noteOn', event.note, event.velocity);
          break;
        case 'note_off':
          feedMidiEvent('noteOff', event.note);
          break;
      }
    }, event.time * 1000);
  }
}
