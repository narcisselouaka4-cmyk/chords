// [OpenCode] — 2026-07-03 — Module moteur harmonique avancé (rootless, quartal, etc.)
import { CHORD_DEFINITIONS, ROOTLESS_DEFINITIONS } from './chord-defs.js';

import { formatNote } from './intervals.js';

// [OpenCode] — 2026-07-03 — Upper structure triads detection
// Given a detected chord, look for a complete triad formed by the upper notes
// whose root is different from the chord root. Common in jazz (e.g. D major over C7).
const UPPER_STRUCTURE_TRIADS = [
  { name: 'Major', symbol: '', intervals: [0, 4, 7] },
  { name: 'Minor', symbol: 'm', intervals: [0, 3, 7] },
  { name: 'Augmented', symbol: 'aug', intervals: [0, 4, 8] },
  { name: 'Diminished', symbol: 'dim', intervals: [0, 3, 6] },
];

function findUpperStructure(pcSet, rootPc, notes) {
  // Exclude the root from the upper notes search
  const upperPcs = notes.filter((pc) => pc !== rootPc);
  if (upperPcs.length < 3) return null;

  for (const triad of UPPER_STRUCTURE_TRIADS) {
    for (let triadRoot = 0; triadRoot < 12; triadRoot++) {
      if (triadRoot === rootPc) continue;
      const triadPcs = triad.intervals.map((i) => (triadRoot + i) % 12);
      if (triadPcs.every((pc) => upperPcs.includes(pc))) {
        return { rootPc: triadRoot, triad };
      }
    }
  }
  return null;
}

// [OpenCode] — 2026-07-03 — Polychord detection
// A polychord is the superposition of two distinct triads.
function findPolychord(pcSet) {
  const foundTriads = [];
  for (const triad of UPPER_STRUCTURE_TRIADS) {
    for (let root = 0; root < 12; root++) {
      const triadPcs = triad.intervals.map((i) => (root + i) % 12);
      if (triadPcs.every((pc) => pcSet.has(pc))) {
        foundTriads.push({ rootPc: root, triad });
      }
    }
  }
  // Look for pairs of triads with different roots and minimal overlap
  for (let i = 0; i < foundTriads.length; i++) {
    for (let j = i + 1; j < foundTriads.length; j++) {
      const a = foundTriads[i];
      const b = foundTriads[j];
      if (a.rootPc === b.rootPc) continue;
      const setA = new Set(a.triad.intervals.map((i) => (a.rootPc + i) % 12));
      const setB = new Set(b.triad.intervals.map((i) => (b.rootPc + i) % 12));
      const overlap = [...setA].filter((pc) => setB.has(pc)).length;
      if (overlap === 0) {
        return { lower: a, upper: b };
      }
    }
  }
  return null;
}

function setEquals(a, b) {
  if (a.size !== b.size) return false;
  for (const x of a) {
    if (!b.has(x)) return false;
  }
  return true;
}

function isSubset(subset, superset) {
  for (const x of subset) {
    if (!superset.has(x)) return false;
  }
  return true;
}

function buildPcSet(root, intervals) {
  return new Set(intervals.map((i) => (root + i) % 12));
}

function findInversionIndex(pcs, root, intervals) {
  // intervals are from root, find which chord tone is in the bass
  const bassPc = pcs[0]; // pcs is sorted ascending by midi, so first is bass
  const idx = intervals.findIndex((i) => (root + i) % 12 === bassPc);
  return idx === -1 ? 0 : idx;
}

// [OpenCode] — 2026-07-03 — Rootless voicings detection
const MIN_ROOTLESS_NOTES = 3;

// [OpenCode] — 2026-07-03 — Dedicated rootless definitions using explicit parent chord tones
function findRootlessMatches(pcSet, uniquePcs) {
  const matches = [];
  // [OpenCode] — 2026-07-03 — Rootless requires at least 3 notes and no more than the voicing size
  if (uniquePcs.length < 3) return matches;

  const sortedPlayed = [...uniquePcs].sort((a, b) => a - b);

  for (const def of ROOTLESS_DEFINITIONS) {
    if (sortedPlayed.length !== def.intervals.length) continue;

    // Try every possible implied root
    for (let impliedRoot = 0; impliedRoot < 12; impliedRoot++) {
      // The root must not be present in the played notes
      if (pcSet.has(impliedRoot)) continue;

      const rootlessRequired = def.intervals.map((i) => (impliedRoot + i) % 12);
      const sortedRequired = [...rootlessRequired].sort((a, b) => a - b);

      if (!sortedPlayed.every((pc, idx) => pc === sortedRequired[idx])) continue;

      // Determine bass note info relative to the parent chord intervals (root included)
      const parentIntervals = [0, ...def.intervals];
      const bassPc = sortedPlayed[0];
      const inversion = parentIntervals.findIndex((i) => (impliedRoot + i) % 12 === bassPc);

      matches.push({
        rootPc: impliedRoot,
        def,
        bassPc,
        inversion: inversion === -1 ? 0 : inversion,
        confidence: 1.0,
      });
    }
  }
  return matches;
}

// [OpenCode] — 2026-07-06 — Classifieur pur de voicing, réutilisable pour le jeu live et les suggestions.
// Même tableau de notes MIDI en entrée → même résultat en sortie.
export function classifyVoicing(midiNotes) {
  if (!Array.isArray(midiNotes) || midiNotes.length === 0) {
    return { topNote: null, voicingType: '—', inversion: 0, bassPc: null };
  }

  const sortedNotes = [...midiNotes].sort((a, b) => a - b);
  const topNote = sortedNotes[sortedNotes.length - 1];
  const bassMidi = sortedNotes[0];
  const bassPc = bassMidi % 12;

  const uniquePcs = Array.from(new Set(sortedNotes.map((n) => n % 12))).sort((a, b) => a - b);

  if (uniquePcs.length < 2) {
    return { topNote, voicingType: 'single', inversion: 0, bassPc };
  }

  const spans = [];
  for (let i = 1; i < uniquePcs.length; i++) {
    spans.push((uniquePcs[i] - uniquePcs[i - 1] + 12) % 12);
  }
  const hasMinorSecond = spans.includes(1);
  const hasMajorSecond = spans.includes(2);
  const hasOctave = spans.includes(0);
  const totalRange = (uniquePcs[uniquePcs.length - 1] - uniquePcs[0] + 12) % 12;

  let voicingType = 'close';

  if (midiNotes.length === 2 && (spans.includes(3) || spans.includes(4) || spans.includes(10) || spans.includes(11))) {
    voicingType = 'shell';
  } else if (hasMinorSecond) {
    voicingType = 'cluster';
  } else if (totalRange <= 7 && !hasOctave) {
    voicingType = 'close';
  } else if (hasOctave || totalRange > 19) {
    voicingType = 'spread';
  } else if (totalRange > 7) {
    voicingType = 'open';
  }

  return { topNote, voicingType, inversion: 0, bassPc };
}

export function detectChord(activeNotes) {
  if (!activeNotes || activeNotes.length === 0) return null;

  const sortedNotes = [...activeNotes].sort((a, b) => a - b);
  const bassMidi = sortedNotes[0];
  const bassPc = bassMidi % 12;
  const uniquePcs = Array.from(new Set(sortedNotes.map((n) => n % 12))).sort((a, b) => a - b);
  const pcSet = new Set(uniquePcs);

  const classification = classifyVoicing(sortedNotes);
  const voicing = classification.voicingType;

  let bestMatch = null;
  let bestScore = -1;

  // [OpenCode] — 2026-07-03 — Standard chord detection first
  for (const rootPc of uniquePcs) {
    for (const def of CHORD_DEFINITIONS) {
      const required = buildPcSet(rootPc, def.intervals);
      if (!isSubset(required, pcSet)) continue;

      // Compute score: prefer larger definitions that match exactly, and prefer root = bass
      let score = def.intervals.length * 10;
      const exactMatch = setEquals(required, pcSet);
      if (exactMatch) score += 20; // exact match bonus
      if (exactMatch && rootPc === bassPc) score += 15; // strong bonus for exact rooted chord with root in bass
      else if (rootPc === bassPc) score += 5; // root in bass bonus
      if (rootPc === uniquePcs[0]) score += 3; // alphabetical root bonus
      // [OpenCode] — 2026-07-03 — Slight bonus for 7th/9th chords that contain an upper-structure triad
      if ((def.symbol.includes('7') || def.symbol.includes('9')) && rootPc === bassPc) {
        const upper = findUpperStructure(pcSet, rootPc, uniquePcs);
        if (upper) score += 4;
      }

      if (score > bestScore) {
        bestScore = score;
        const inversion = findInversionIndex(uniquePcs, rootPc, def.intervals);
        const confidence = setEquals(required, pcSet) ? 1.0 : required.size / pcSet.size;
      bestMatch = {
        rootPc,
        symbol: def.symbol,
        fullName: def.name,
        intervals: def.intervals,
        notes: sortedNotes,
        bassPc,
        inversion,
        isSlash: bassPc !== rootPc,
        missing: [],
        confidence,
        rootless: false,
        voicing,
      };
      }
    }
  }

  // [OpenCode] — 2026-07-03 — Rootless post-processing
  // Prefer a rootless interpretation when the standard match is a triad in root position
  // and the notes also form a known rootless 7th chord. This covers guide-tone voicings
  // like E-G-B being Cmaj7 rootless rather than Em, while preserving slash chords like C/E.
  // [Claude] — 2026-07-03 — Correction : ne pas écraser une triade parfaite en position fondamentale par un rootless. Un C-E-G est un C majeur, pas un Am7 rootless.
  if (bestMatch && bestMatch.intervals.length === 3 && bestMatch.bassPc === bestMatch.rootPc) {
    const rootlessMatches = findRootlessMatches(pcSet, uniquePcs);
    const richerRootless = rootlessMatches.find((m) => m.def.intervals.length >= 3);
    // Only upgrade to rootless when we have more than 3 notes. With exactly 3 notes, the simplest
    // and most reliable reading is the triad itself (e.g. C-E-G is C major, not Am7 rootless).
    if (richerRootless && uniquePcs.length > 3) {
      const { rootPc, def, bassPc: rlBassPc, inversion, confidence } = richerRootless;
      const parentIntervals = [0, ...def.intervals];
      return {
        rootPc,
        symbol: def.symbol,
        fullName: `${def.name} (rootless)`,
        intervals: parentIntervals,
        notes: sortedNotes,
        bassPc: rlBassPc,
        inversion,
        isSlash: rlBassPc !== rootPc,
        missing: [0],
        confidence,
        rootless: true,
        voicing,
      };
    }
  }

  // [OpenCode] — 2026-07-03 — Upper structure enrichment
  // When a standard chord contains a 7th or 9th/11th/13th, see if the upper notes also form
  // a complete triad whose root differs from the chord root. If so, enrich the result.
  if (bestMatch && bestMatch.intervals.some((i) => [10, 11, 14, 17, 18, 20, 21].includes(i))) {
    const upper = findUpperStructure(pcSet, bestMatch.rootPc, uniquePcs);
    if (upper) {
      bestMatch.upperStructure = upper;
      bestMatch.fullName = `${bestMatch.fullName} (upper: ${upper.triad.name} ${formatNote(upper.rootPc)})`;
      bestMatch.voicing = voicing;
    }
  }

  // [OpenCode] — 2026-07-03 — Polychord detection
  // Detect two non-overlapping triads as a polychord. Prefer this interpretation when
  // the standard match is just a generic 7th/9th/11th that happens to contain the triads,
  // unless it is an exact match with the root in bass.
  const exactRooted = bestMatch && bestMatch.confidence === 1.0 && bestMatch.bassPc === bestMatch.rootPc;
  if (!exactRooted) {
    const poly = findPolychord(pcSet);
    if (poly) {
      const { lower, upper } = poly;
      return {
        rootPc: lower.rootPc,
        symbol: upper.triad.symbol,
        fullName: `${lower.triad.name} / ${upper.triad.name} polychord`,
        intervals: [...lower.triad.intervals, ...upper.triad.intervals.map((i) => i + 12)],
        notes: sortedNotes,
        bassPc,
        inversion: 0,
        isSlash: true,
        missing: [],
        confidence: 1.0,
        rootless: false,
        polychord: { lower, upper },
        voicing,
      };
    }
  }

  // [OpenCode] — 2026-07-03 — Helper: detect clusters of minor/major seconds
  function hasCluster(notes, requireMinorSecond = false) {
    const sorted = [...notes].sort((a, b) => a - b);
    for (let i = 1; i < sorted.length; i++) {
      const gap = (sorted[i] - sorted[i - 1] + 12) % 12;
      if (requireMinorSecond) {
        if (gap === 1) return true;
      } else {
        if (gap === 1 || gap === 2) return true;
      }
    }
    return false;
  }

  // [OpenCode] — 2026-07-03 — Rootless fallback
  // If no standard chord matches, try interpreting the notes as a rootless jazz voicing.
  if (!bestMatch) {
    const rootlessMatches = findRootlessMatches(pcSet, uniquePcs);
    if (rootlessMatches.length > 0) {
      const match = rootlessMatches.sort((a, b) => b.def.intervals.length - a.def.intervals.length)[0];
      const { rootPc, def, bassPc: rlBassPc, inversion, confidence } = match;
      return {
        rootPc,
        symbol: def.symbol,
        fullName: `${def.name} (rootless)`,
        intervals: def.intervals.slice(1),
        notes: sortedNotes,
        bassPc: rlBassPc,
        inversion,
        isSlash: rlBassPc !== rootPc,
        missing: [0],
        confidence,
        rootless: true,
        voicing,
      };
    }
  }

  if (!bestMatch) {
    // Fallback: no known chord.
    return {
      rootPc: bassPc,
      symbol: '?',
      fullName: 'Accord non identifié',
      intervals: [0],
      notes: sortedNotes,
      bassPc,
      inversion: 0,
      isSlash: false,
      missing: [],
      confidence: 0,
      rootless: false,
      voicing,
    };
  }

  bestMatch.voicing = voicing;
  return bestMatch;
}
