import { formatNote } from '../chord-engine/intervals.js';
import { slashName, inversionName } from '../chord-engine/naming.js';

const NOTE_PCS = {
  'C': 0, 'C#': 1, 'Db': 1, 'D': 2, 'D#': 3, 'Eb': 3,
  'E': 4, 'F': 5, 'F#': 6, 'Gb': 6, 'G': 7, 'G#': 8,
  'Ab': 8, 'A': 9, 'A#': 10, 'Bb': 10, 'B': 11,
};

const CHORD_QUALITY_PATTERNS = [
  { quality: 'min', suffixes: ['m', 'min', '-'] },
  { quality: 'maj7', suffixes: ['maj7', 'M7'] },
  { quality: 'min7', suffixes: ['m7', 'min7', '-7'] },
  { quality: 'dom7', suffixes: ['7'] },
  { quality: 'dim', suffixes: ['dim', '°', 'o'] },
  { quality: 'aug', suffixes: ['aug', '+'] },
  { quality: 'sus2', suffixes: ['sus2'] },
  { quality: 'sus4', suffixes: ['sus4'] },
];

const QUALITY_INTERVALS = {
  '':         [0, 4, 7],               // major triad
  'maj':      [0, 4, 7],               // major triad
  'min':      [0, 3, 7],               // minor triad
  'maj7':     [0, 4, 7, 11],           // major 7
  'min7':     [0, 3, 7, 10],           // minor 7
  'dom7':     [0, 4, 7, 10],           // dominant 7
  'dim':      [0, 3, 6],               // diminished
  'aug':      [0, 4, 8],               // augmented
  'sus2':     [0, 2, 7],               // sus2
  'sus4':     [0, 5, 7],               // sus4
};

function parseChordName(chordName) {
  if (!chordName || typeof chordName !== 'string') return null;
  if (chordName.length >= 2 && chordName.slice(0, 2) in NOTE_PCS) {
    return chordName.slice(0, 2);
  }
  if (chordName[0] in NOTE_PCS) {
    return chordName[0];
  }
  return null;
}

function parseChordQuality(chordName, rootName) {
  const rest = chordName.slice(rootName.length).toLowerCase();
  if (!rest) return '';
  for (const { quality, suffixes } of CHORD_QUALITY_PATTERNS) {
    for (const suffix of suffixes) {
      if (rest === suffix || rest.startsWith(suffix)) {
        return quality;
      }
    }
  }
  // Default: treat as major if just root
  if (rest === '') return '';
  // Unknown quality, return as-is
  return rest;
}

function getIntervalsForQuality(quality) {
  return QUALITY_INTERVALS[quality] || QUALITY_INTERVALS[''];
}

function pcToNoteName(pc) {
  return formatNote(pc, true, false);
}

export function computeRelationToChord(bassMidi, chordName) {
  if (!chordName || chordName === '?' || bassMidi == null) {
    return { relation: 'unknown', slashChord: null, inversion: null, confidence: 0 };
  }

  const rootName = parseChordName(chordName);
  if (!rootName) {
    return { relation: 'unknown', slashChord: null, inversion: null, confidence: 0 };
  }
  const rootPc = NOTE_PCS[rootName];
  const quality = parseChordQuality(chordName, rootName);
  const intervals = getIntervalsForQuality(quality);
  const bassPc = bassMidi % 12;

  // Check slash bass notation (e.g., "C/E")
  let slashBassPc = null;
  if (chordName.includes('/')) {
    const parts = chordName.split('/');
    const slashPart = parts[parts.length - 1].trim();
    if (slashPart in NOTE_PCS) {
      slashBassPc = NOTE_PCS[slashPart];
    }
  }

  // Determine relation
  let relation = 'passing_tone';
  let intervalIndex = -1;

  if (slashBassPc !== null && bassPc === slashBassPc) {
    relation = 'slash_bass';
  }

  for (let i = 0; i < intervals.length; i++) {
    const intervalPc = (rootPc + intervals[i]) % 12;
    if (bassPc === intervalPc) {
      if (i === 0) {
        relation = 'root';
      } else {
        relation = 'chord_tone';
      }
      intervalIndex = i;
      break;
    }
  }

  // Slash chord name
  let slashChord = null;
  if (relation !== 'root' && relation !== 'unknown') {
    slashChord = slashName(rootPc, quality, bassPc, false);
  }

  // Inversion type
  let inversion = null;
  if (intervalIndex > 0) {
    inversion = {
      type: intervalIndex === 1 ? 'first_inversion'
           : intervalIndex === 2 ? 'second_inversion'
           : intervalIndex === 3 ? 'third_inversion'
           : 'inversion',
      label: inversionName(intervalIndex),
    };
  } else if (relation === 'independent_bass') {
    inversion = { type: 'independent_bass', label: 'basse indépendante' };
  }

  return {
    relation,
    rootPc,
    bassPc,
    intervalIndex,
    slashChord,
    inversion,
  };
}

export function computeInterpretationConfidence(relation, bassStability, overlapRatio, bassConfidence) {
  const relationConfidence = {
    'root': 1.0,
    'chord_tone': 0.85,
    'slash_bass': 0.9,
    'passing_tone': 0.4,
    'unknown': 0.1,
  };
  const base = relationConfidence[relation] || 0.1;
  const stability = Math.min(1, Math.max(0, bassStability));
  const overlap = Math.min(1, Math.max(0, overlapRatio));
  return round(base * stability * overlap * (bassConfidence || 0.5) * 2, 3);
}

function round(v, d) {
  const f = Math.pow(10, d);
  return Math.round(v * f) / f;
}

export function findDominantBassForChord(bassSegments, chordStart, chordEnd, minDuration = 0.15) {
  const overlapping = bassSegments.filter((s) =>
    s.startTime < chordEnd && s.endTime > chordStart
  );
  if (!overlapping.length) return null;

  const segmentsByMidi = new Map();
  for (const s of overlapping) {
    const dur = s.endTime - s.startTime;
    if (dur < minDuration) continue;
    const adjDur = Math.min(dur, chordEnd - Math.max(s.startTime, chordStart));
    if (!segmentsByMidi.has(s.midi)) {
      segmentsByMidi.set(s.midi, { ...s, totalOverlap: 0, weightedConf: 0, segmentCount: 0 });
    }
    const entry = segmentsByMidi.get(s.midi);
    entry.totalOverlap += adjDur;
    entry.weightedConf += adjDur * (s.confidence || 0.5);
    entry.segmentCount++;
  }

  if (!segmentsByMidi.size) return null;

  // Pick by max total overlap
  const dominant = [...segmentsByMidi.entries()]
    .sort((a, b) => b[1].totalOverlap - a[1].totalOverlap)[0][1];

  const avgConf = dominant.totalOverlap > 0
    ? round(dominant.weightedConf / dominant.totalOverlap, 3)
    : dominant.confidence || 0.5;

  const chordDuration = chordEnd - chordStart;
  const overlapRatio = chordDuration > 0
    ? round(Math.min(1, dominant.totalOverlap / chordDuration), 3)
    : 0;

  return {
    midi: dominant.midi,
    note: dominant.note,
    octave: dominant.octave,
    confidence: avgConf,
    source: dominant.source || 'bass_engine',
    isVirtual: dominant.isVirtual || false,
    totalOverlap: round(dominant.totalOverlap, 3),
    overlapRatio,
    stability: Math.min(1, dominant.segmentCount / Math.max(1, Math.ceil(chordDuration / 0.092))),
    segmentCount: dominant.segmentCount,
  };
}

export function enrichChordWithBass(chord, dominantBass, minStability = 0.3) {
  if (!dominantBass) {
    return { ...chord, bass: null, bassInterpretation: null };
  }

  const chordName = chord.chord || chord.structuralChord || '';
  const relationData = computeRelationToChord(dominantBass.midi, chordName);

  const bassStability = dominantBass.stability || 0;
  const interpretationConfidence = relationData.relation === 'root'
    ? 1.0
    : computeInterpretationConfidence(
        relationData.relation,
        bassStability,
        dominantBass.overlapRatio || 0,
        dominantBass.confidence
      );

  // Slash only when bass is stable enough and is a chord tone or slash
  let slashChordInterpretation = null;
  if (
    (relationData.relation === 'chord_tone' || relationData.relation === 'slash_bass') &&
    bassStability >= minStability &&
    dominantBass.totalOverlap >= 0.2
  ) {
    slashChordInterpretation = {
      name: relationData.slashChord,
      confidence: round(interpretationConfidence, 3),
      reason: relationData.relation === 'slash_bass' ? 'slash_bass_detected' : 'bass_in_chord_stable',
    };
  }

  let inversionInterpretation = null;
  if (relationData.inversion) {
    inversionInterpretation = {
      ...relationData.inversion,
      confidence: round(interpretationConfidence, 3),
    };
  }

  return {
    ...chord,
    bass: {
      note: dominantBass.note,
      midi: dominantBass.midi,
      octave: dominantBass.octave,
      confidence: dominantBass.confidence,
      source: dominantBass.source,
      isVirtual: dominantBass.isVirtual,
      relationToChord: relationData.relation,
    },
    bassInterpretation: {
      slashChord: slashChordInterpretation,
      inversion: inversionInterpretation,
      confidence: round(interpretationConfidence, 3),
    },
  };
}
