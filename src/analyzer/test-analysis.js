import { buildChordTimeline } from './chord-timeline.js';
import { segment } from './segmenter.js';
import { scoreSession } from './scorer.js';
import { suggestReharmonization, renderSuggestionToEvents } from './reharmonizer.js';
import { formatPc } from '../chord-engine/naming.js';

function makeEventsFromProgression(progression, startTime = 0, chordDuration = 2) {
  const events = [];
  let t = startTime;
  for (const chord of progression) {
    const [rootName, symbol, bassName] = chord;
    // Simplified note generation: root + third + fifth + optional seventh
    const rootPc = noteNameToPc(rootName);
    const bassPc = bassName ? noteNameToPc(bassName) : rootPc;
    const notes = buildNotes(rootPc, bassPc, symbol);
    for (const note of notes) {
      events.push({ time: t, type: 'note_on', note, velocity: 0.8 });
    }
    for (const note of notes) {
      events.push({ time: t + chordDuration - 0.1, type: 'note_off', note });
    }
    t += chordDuration;
  }
  return events.sort((a, b) => a.time - b.time);
}

function noteNameToPc(name) {
  const map = { C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11 };
  return map[name] ?? 0;
}

function buildNotes(rootPc, bassPc, symbol) {
  const intervals = [0, 4, 7];
  if (symbol.includes('m')) intervals[1] = 3;
  if (symbol.includes('7') || symbol.includes('9') || symbol.includes('13')) intervals.push(10);
  if (symbol.includes('maj7')) intervals[intervals.length - 1] = 11;
  const base = 48 + bassPc;
  return intervals.map((i) => base + ((rootPc + i - bassPc + 12) % 12));
}

function formatChord(chord) {
  const root = formatPc(chord.rootPc, false);
  const symbol = chord.symbol || '';
  const bass = chord.bassPc != null && chord.bassPc !== chord.rootPc ? `/${formatPc(chord.bassPc, false)}` : '';
  return `${root}${symbol}${bass}`;
}

const progression = [
  ['C', 'maj7'],
  ['A', 'm7'],
  ['D', 'm7'],
  ['G', '7'],
  ['C', 'maj7'],
  ['A', 'm7'],
  ['D', 'm7'],
  ['G', '7'],
  ['F', 'maj7'],
  ['G', '7'],
  ['E', 'm7'],
  ['A', '7'],
  ['D', 'm7'],
  ['G', '7'],
  ['C', 'maj7'],
];

const events = makeEventsFromProgression(progression, 0, 2);
const totalDuration = events[events.length - 1].time + 0.5;

const chords = buildChordTimeline(events);
console.log('Chords detected:', chords.length);
for (const c of chords) console.log(formatChord(c), c.time.toFixed(2), c.duration.toFixed(2));

const sections = segment(chords, totalDuration);
console.log('\nSections:', sections.length);
for (const s of sections) {
  const sectionChords = s.chordIndices.map((idx) => chords[idx]).filter(Boolean);
  console.log(s.label, s.start.toFixed(2), s.end.toFixed(2), sectionChords.map(formatChord).join(' → '));
}

const scores = scoreSession(chords, 0);
console.log('\nScores:');
for (const [k, v] of Object.entries(scores)) console.log(k, v.value, '-', v.comment);

const jazz = suggestReharmonization(chords, 'jazz');
console.log('\nJazz suggestion:');
for (const c of jazz.slice(0, 6)) console.log(formatChord(c));

const suggestionEvents = renderSuggestionToEvents(jazz.slice(0, 4));
console.log('\nSuggestion events:', suggestionEvents.length);

console.log('\n=== Analysis test passed ===');
