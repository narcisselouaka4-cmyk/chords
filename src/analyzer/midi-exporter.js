import { noteNameToPc } from '../chord-engine/intervals.js';
import { buildMidiFileMultiTrack } from '../recorder/serializer.js';

const CHORD_QUALITY_INTERVALS = {
  '':         [0, 4, 7],
  'maj':      [0, 4, 7],
  'min':      [0, 3, 7],
  'maj7':     [0, 4, 7, 11],
  'min7':     [0, 3, 7, 10],
  '7':        [0, 4, 7, 10],
  'm7':       [0, 3, 7, 10],
  'dim':      [0, 3, 6],
  'dim7':     [0, 3, 6, 9],
  'aug':      [0, 4, 8],
  'sus2':     [0, 2, 7],
  'sus4':     [0, 5, 7],
  'm7b5':     [0, 3, 6, 10],
  'mMaj7':    [0, 3, 7, 11],
  '6':        [0, 4, 7, 9],
  'm6':       [0, 3, 7, 9],
  '9':        [0, 4, 7, 10, 14],
  'maj9':     [0, 4, 7, 11, 14],
  'm9':       [0, 3, 7, 10, 14],
};

const QUALITY_PATTERNS = [
  { quality: 'min', suffixes: ['m', 'min', '-'] },
  { quality: 'maj7', suffixes: ['maj7', 'M7'] },
  { quality: 'min7', suffixes: ['m7', 'min7', '-7'] },
  { quality: 'dim7', suffixes: ['dim7'] },
  { quality: 'm7b5', suffixes: ['m7b5'] },
  { quality: 'mMaj7', suffixes: ['mMaj7', 'mM7'] },
  { quality: 'maj9', suffixes: ['maj9', 'M9'] },
  { quality: 'm9', suffixes: ['m9', 'min9', '-9'] },
  { quality: '9', suffixes: ['9'] },
  { quality: '7', suffixes: ['7'] },
  { quality: 'dim', suffixes: ['dim', '°', 'o'] },
  { quality: 'aug', suffixes: ['aug', '+'] },
  { quality: 'sus2', suffixes: ['sus2'] },
  { quality: 'sus4', suffixes: ['sus4'] },
  { quality: '6', suffixes: ['6'] },
  { quality: 'm6', suffixes: ['m6'] },
];

function parseChordQuality(suffix) {
  if (!suffix) return '';
  for (const { quality, suffixes } of QUALITY_PATTERNS) {
    for (const s of suffixes) {
      if (suffix === s) return quality;
    }
  }
  return '';
}

function chordNameToMidiNotes(chordName, octave = 4) {
  if (!chordName || chordName === '?' || chordName === 'N') return [];
  const slashParts = chordName.split('/');
  const namePart = slashParts[0].trim();
  const rootMatch = namePart.match(/^([A-G][#b]?)(.*)/);
  if (!rootMatch) return [];
  const rootName = rootMatch[1];
  const suffix = rootMatch[2].trim();
  const rootPc = noteNameToPc(rootName);
  if (rootPc === null) return [];
  const quality = parseChordQuality(suffix);
  const intervals = CHORD_QUALITY_INTERVALS[quality] || [0, 4, 7];
  const rootMidi = rootPc + (octave + 1) * 12;
  return intervals.map((i) => rootPc + (octave + 1) * 12 + i);
}

function isNoteOverlap(a, b) {
  return a.startTime < b.endTime && a.endTime > b.startTime;
}

export function exportAnalysisToMidi(analysis, options = {}) {
  const {
    includeBass = true,
    includeChords = true,
    bassProgram = 33,
    chordProgram = 1,
    bassVelocity = 0.78,
    chordVelocity = 0.63,
  } = options;

  const bassSegments = analysis.bassSegments || [];
  const chords = analysis.chords || [];
  const tempo = analysis.tempo || 120;
  const title = analysis.title || 'Piano Jazz Chords Analysis';

  const tracks = [];

  if (includeBass && bassSegments.length > 0) {
    const bassEvents = [];
    for (const seg of bassSegments) {
      bassEvents.push(
        { time: seg.startTime, type: 'note_on', note: seg.midi, velocity: bassVelocity },
        { time: seg.endTime, type: 'note_off', note: seg.midi, velocity: 0 },
      );
    }
    tracks.push({
      name: 'Bass detected',
      channel: 0,
      program: bassProgram,
      events: bassEvents,
    });
  }

  if (includeChords && chords.length > 0) {
    const chordEvents = [];
    for (const chord of chords) {
      // TODO Phase D : utiliser getEffectiveChord(chord) à la place de chord.chord
      // pour que l'export MIDI reflète les corrections manuelles.
      const chordName = chord.chord;
      const notes = chordNameToMidiNotes(chordName);
      if (notes.length === 0) continue;
      for (const midi of notes) {
        chordEvents.push(
          { time: chord.startTime, type: 'note_on', note: midi, velocity: chordVelocity },
          { time: chord.endTime, type: 'note_off', note: midi, velocity: 0 },
        );
      }
    }
    tracks.push({
      name: 'Chords detected',
      channel: 1,
      program: chordProgram,
      events: chordEvents,
    });
  }

  if (tracks.length === 0) return null;

  return buildMidiFileMultiTrack(tracks, {
    tempo,
    title,
    timeSignature: [4, 4, 24, 8],
  });
}

export default exportAnalysisToMidi;
