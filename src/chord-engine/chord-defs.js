// Interval definitions in semitones from root.
// Each chord has a name (english), symbol, optional aliases, and a set of required intervals.
// Order matters: first match wins, so put the most specific / jazziest forms first.

export const CHORD_DEFINITIONS = [
  // 13th chords
  { name: 'Dominant 13 sus4', symbol: '13sus4', intervals: [0, 5, 7, 10, 14, 17, 21],
    identityIntervals: [5, 10, 21], optionalIntervals: [7, 14, 17], supportedOmissions: [7, 14, 17], extensionIntervals: [2], suspensionIntervals: [] },
  { name: 'Major 13', symbol: 'maj13', intervals: [0, 4, 7, 11, 14, 17, 21],
    identityIntervals: [4, 11, 21], optionalIntervals: [7, 14, 17], supportedOmissions: [7, 14, 17], extensionIntervals: [2], suspensionIntervals: [5] },
  { name: 'Dominant 13', symbol: '13', intervals: [0, 4, 7, 10, 14, 17, 21],
    identityIntervals: [4, 10, 21], optionalIntervals: [7, 14, 17], supportedOmissions: [7, 14, 17], extensionIntervals: [2], suspensionIntervals: [5] },
  { name: 'Minor 13', symbol: 'm13', intervals: [0, 3, 7, 10, 14, 17, 21],
    identityIntervals: [3, 10, 21], optionalIntervals: [7, 14, 17], supportedOmissions: [7, 14, 17], extensionIntervals: [2], suspensionIntervals: [5] },
  { name: 'Dominant 13 #11', symbol: '13#11', intervals: [0, 4, 7, 10, 14, 18, 21],
    identityIntervals: [4, 10, 18, 21], optionalIntervals: [7, 14], supportedOmissions: [7, 14], extensionIntervals: [2], suspensionIntervals: [5] },
  { name: 'Dominant 7 b13', symbol: '7b13', intervals: [0, 4, 7, 10, 14, 20],
    identityIntervals: [4, 10, 20], optionalIntervals: [7, 14], supportedOmissions: [7, 14], extensionIntervals: [2, 9, 17], suspensionIntervals: [5] },
  { name: 'Dominant 7 #9 b13', symbol: '7#9b13', intervals: [0, 4, 7, 10, 15, 20],
    identityIntervals: [4, 10, 15, 20], optionalIntervals: [7], supportedOmissions: [7], extensionIntervals: [14, 17, 21], suspensionIntervals: [5] },
  { name: 'Dominant 7 b9 b13', symbol: '7b9b13', intervals: [0, 4, 7, 10, 13, 20],
    identityIntervals: [4, 10, 13, 20], optionalIntervals: [7], supportedOmissions: [7], extensionIntervals: [14, 17, 21], suspensionIntervals: [5] },

  // 11th chords
  { name: 'Major 11', symbol: 'maj11', intervals: [0, 4, 7, 11, 14, 17],
    identityIntervals: [4, 11, 17], optionalIntervals: [7, 14], supportedOmissions: [7, 14], extensionIntervals: [2, 9, 21], suspensionIntervals: [5] },
  { name: 'Dominant 11', symbol: '11', intervals: [0, 4, 7, 10, 14, 17],
    identityIntervals: [4, 10, 17], optionalIntervals: [7, 14], supportedOmissions: [7, 14], extensionIntervals: [2, 9, 21], suspensionIntervals: [5] },
  { name: 'Minor 11', symbol: 'm11', intervals: [0, 3, 7, 10, 14, 17],
    identityIntervals: [3, 10, 17], optionalIntervals: [7, 14], supportedOmissions: [7, 14], extensionIntervals: [2, 9, 21], suspensionIntervals: [5] },
  { name: 'Dominant 7 #11', symbol: '7#11', intervals: [0, 4, 7, 10, 18],
    identityIntervals: [4, 10, 18], optionalIntervals: [7], supportedOmissions: [7], extensionIntervals: [2, 9, 14, 17, 20, 21], suspensionIntervals: [5] },

  // 9th chords
  { name: 'Dominant 9 sus4', symbol: '9sus4', intervals: [0, 5, 7, 10, 14],
    identityIntervals: [5, 10, 14], optionalIntervals: [7], supportedOmissions: [7], extensionIntervals: [2, 17, 21], suspensionIntervals: [] },
  { name: 'Major 9', symbol: 'maj9', intervals: [0, 4, 7, 11, 14],
    identityIntervals: [4, 11, 14], optionalIntervals: [7], supportedOmissions: [7], extensionIntervals: [2, 9, 17, 21], suspensionIntervals: [5] },
  { name: 'Dominant 9', symbol: '9', intervals: [0, 4, 7, 10, 14],
    identityIntervals: [4, 10, 14], optionalIntervals: [7], supportedOmissions: [7], extensionIntervals: [2, 9, 17, 18, 20, 21], suspensionIntervals: [5] },
  { name: 'Minor 9', symbol: 'm9', intervals: [0, 3, 7, 10, 14],
    identityIntervals: [3, 10, 14], optionalIntervals: [7], supportedOmissions: [7], extensionIntervals: [2, 9, 17, 21], suspensionIntervals: [5] },
  { name: 'Dominant 7 b9', symbol: '7b9', intervals: [0, 4, 7, 10, 13],
    identityIntervals: [4, 10, 13], optionalIntervals: [7], supportedOmissions: [7], extensionIntervals: [9, 14, 17, 20, 21], suspensionIntervals: [5] },
  { name: 'Dominant 7 #9', symbol: '7#9', intervals: [0, 4, 7, 10, 15],
    identityIntervals: [4, 10, 15], optionalIntervals: [7], supportedOmissions: [7], extensionIntervals: [9, 14, 17, 20, 21], suspensionIntervals: [5] },
  { name: 'Dominant 7 b9 #9', symbol: '7b9#9', intervals: [0, 4, 7, 10, 13, 15],
    identityIntervals: [4, 10, 13, 15], optionalIntervals: [7], supportedOmissions: [7], extensionIntervals: [9, 14, 17, 20, 21], suspensionIntervals: [5] },
  { name: 'Minor 7 b9', symbol: 'm7b9', intervals: [0, 3, 7, 10, 13],
    identityIntervals: [3, 10, 13], optionalIntervals: [7], supportedOmissions: [7], extensionIntervals: [9, 14, 17], suspensionIntervals: [5] },

  // 7th chords
  { name: 'Major 7', symbol: 'maj7', intervals: [0, 4, 7, 11],
    identityIntervals: [4, 11], optionalIntervals: [7], supportedOmissions: [7], extensionIntervals: [2, 9, 14, 17, 21], suspensionIntervals: [5] },
  { name: 'Dominant 7', symbol: '7', intervals: [0, 4, 7, 10],
    identityIntervals: [4, 10], optionalIntervals: [7], supportedOmissions: [7], extensionIntervals: [2, 9, 14, 17, 18, 20, 21], suspensionIntervals: [5] },
  { name: 'Minor 7', symbol: 'm7', intervals: [0, 3, 7, 10],
    identityIntervals: [3, 10], optionalIntervals: [7], supportedOmissions: [7], extensionIntervals: [2, 9, 14, 17, 21], suspensionIntervals: [5] },
  { name: 'Half-Diminished 7', symbol: 'm7b5', intervals: [0, 3, 6, 10],
    identityIntervals: [3, 6, 10], optionalIntervals: [], supportedOmissions: [], extensionIntervals: [9, 14], suspensionIntervals: [] },
  { name: 'Diminished 7', symbol: 'dim7', intervals: [0, 3, 6, 9],
    identityIntervals: [3, 6, 9], optionalIntervals: [], supportedOmissions: [], extensionIntervals: [], suspensionIntervals: [] },
  { name: 'Augmented 7', symbol: '7#5', intervals: [0, 4, 8, 10],
    identityIntervals: [4, 8, 10], optionalIntervals: [], supportedOmissions: [], extensionIntervals: [9, 14, 17, 21], suspensionIntervals: [5] },
  { name: 'Dominant 7 b5', symbol: '7b5', intervals: [0, 4, 6, 10],
    identityIntervals: [4, 6, 10], optionalIntervals: [], supportedOmissions: [], extensionIntervals: [9, 14, 17, 21], suspensionIntervals: [5] },
  { name: 'Major 7 #5', symbol: 'maj7#5', intervals: [0, 4, 8, 11],
    identityIntervals: [4, 8, 11], optionalIntervals: [], supportedOmissions: [], extensionIntervals: [9, 14, 17, 21], suspensionIntervals: [5] },
  { name: 'Minor Major 7', symbol: 'mMaj7', intervals: [0, 3, 7, 11],
    identityIntervals: [3, 11], optionalIntervals: [7], supportedOmissions: [7], extensionIntervals: [9, 14, 17, 21], suspensionIntervals: [5] },
  { name: 'Dominant 7 sus4', symbol: '7sus4', intervals: [0, 5, 7, 10],
    identityIntervals: [5, 10], optionalIntervals: [7], supportedOmissions: [7], extensionIntervals: [2, 14, 17, 21], suspensionIntervals: [] },
  { name: 'Dominant 7 sus2', symbol: '7sus2', intervals: [0, 2, 7, 10],
    identityIntervals: [2, 10], optionalIntervals: [7], supportedOmissions: [7], extensionIntervals: [14, 17, 21], suspensionIntervals: [] },
  { name: 'Major 7 suspended 2', symbol: 'maj7sus2', intervals: [0, 2, 7, 11],
    identityIntervals: [2, 11], optionalIntervals: [7], supportedOmissions: [7], extensionIntervals: [14, 17, 21], suspensionIntervals: [] },
  { name: 'Major 7 suspended 4', symbol: 'maj7sus4', intervals: [0, 5, 7, 11],
    identityIntervals: [5, 11], optionalIntervals: [7], supportedOmissions: [7], extensionIntervals: [14, 17, 21], suspensionIntervals: [] },
  { name: 'Minor 7 b5', symbol: 'm7b5', intervals: [0, 3, 6, 10],
    identityIntervals: [3, 6, 10], optionalIntervals: [], supportedOmissions: [], extensionIntervals: [9, 14], suspensionIntervals: [] },

  // 6/9 and add chords
  { name: 'Major 6/9', symbol: '6/9', intervals: [0, 4, 7, 9, 14],
    identityIntervals: [4, 9, 14], optionalIntervals: [7], supportedOmissions: [7], extensionIntervals: [2], suspensionIntervals: [5] },
  { name: 'Major 6', symbol: '6', intervals: [0, 4, 7, 9],
    identityIntervals: [4, 9], optionalIntervals: [7], supportedOmissions: [7], extensionIntervals: [14], suspensionIntervals: [5] },
  { name: 'Minor 6', symbol: 'm6', intervals: [0, 3, 7, 9],
    identityIntervals: [3, 9], optionalIntervals: [7], supportedOmissions: [7], extensionIntervals: [14], suspensionIntervals: [] },
  { name: 'Major add9', symbol: 'add9', intervals: [0, 4, 7, 14],
    identityIntervals: [4, 7, 14], optionalIntervals: [], supportedOmissions: [], extensionIntervals: [9, 17, 21], suspensionIntervals: [5] },
  { name: 'Minor add9', symbol: 'madd9', intervals: [0, 3, 7, 14],
    identityIntervals: [3, 7, 14], optionalIntervals: [], supportedOmissions: [], extensionIntervals: [9, 17, 21], suspensionIntervals: [] },
  { name: 'Major add11', symbol: 'add11', intervals: [0, 4, 7, 17],
    identityIntervals: [4, 7, 17], optionalIntervals: [], supportedOmissions: [], extensionIntervals: [9, 14, 21], suspensionIntervals: [5] },
  { name: 'Major 6 add11', symbol: '6add11', intervals: [0, 4, 7, 9, 17],
    identityIntervals: [4, 9, 17], optionalIntervals: [7], supportedOmissions: [7], extensionIntervals: [14], suspensionIntervals: [5] },

  // Triads
  { name: 'Augmented', symbol: 'aug', intervals: [0, 4, 8],
    identityIntervals: [4, 8], optionalIntervals: [], supportedOmissions: [], extensionIntervals: [], suspensionIntervals: [] },
  { name: 'Diminished', symbol: 'dim', intervals: [0, 3, 6],
    identityIntervals: [3, 6], optionalIntervals: [], supportedOmissions: [], extensionIntervals: [], suspensionIntervals: [] },
  { name: 'Major', symbol: '', intervals: [0, 4, 7],
    identityIntervals: [4, 7], optionalIntervals: [], supportedOmissions: [], extensionIntervals: [2, 9, 14], suspensionIntervals: [5] },
  { name: 'Minor', symbol: 'm', intervals: [0, 3, 7],
    identityIntervals: [3, 7], optionalIntervals: [], supportedOmissions: [], extensionIntervals: [2, 9, 14], suspensionIntervals: [] },
  { name: 'Sus4', symbol: 'sus4', intervals: [0, 5, 7],
    identityIntervals: [5, 7], optionalIntervals: [], supportedOmissions: [], extensionIntervals: [2, 14], suspensionIntervals: [] },
  { name: 'Sus2', symbol: 'sus2', intervals: [0, 2, 7],
    identityIntervals: [2, 7], optionalIntervals: [], supportedOmissions: [], extensionIntervals: [14], suspensionIntervals: [] },

  // Power chord
  { name: 'Power', symbol: '5', intervals: [0, 7],
    identityIntervals: [7], optionalIntervals: [], supportedOmissions: [], extensionIntervals: [], suspensionIntervals: [] },

  // Single notes
  { name: '', symbol: '', intervals: [0],
    identityIntervals: [], optionalIntervals: [], supportedOmissions: [], extensionIntervals: [], suspensionIntervals: [] },

  // Définition factice partageant le symbole 'm7b5' pour tester la résolution
  // canonique. Elle doit être placée après la définition standard. Grâce à
  // `parentSymbol`, `resolveCanonicalChordDefinition` l'ignore et la définition
  // complète [0,3,6,10] reste choisie pour 'm7b5'.
  { name: 'Half-Diminished 7 (rootless mirror)', symbol: 'm7b5', parentSymbol: 'm7b5', intervals: [3, 6, 10] },
];

// [OpenCode] — 2026-07-03 — Common rootless jazz voicings
// Each entry describes a set of pitch classes (relative to the implied root) that, when played
// without the root, represents the parent chord.
export const ROOTLESS_DEFINITIONS = [
  { name: 'Major 7', symbol: 'maj7', parentSymbol: 'maj7', intervals: [4, 7, 11] },      // 3-5-7
  { name: 'Major 9', symbol: 'maj9', parentSymbol: 'maj9', intervals: [4, 7, 11, 14] },    // 3-5-7-9
  { name: 'Dominant 7', symbol: '7', parentSymbol: '7', intervals: [4, 7, 10] },            // 3-5-b7
  { name: 'Dominant 9', symbol: '9', parentSymbol: '9', intervals: [4, 7, 10, 14] },        // 3-5-b7-9
  { name: 'Minor 7', symbol: 'm7', parentSymbol: 'm7', intervals: [3, 7, 10] },             // b3-5-b7
  { name: 'Minor 9', symbol: 'm9', parentSymbol: 'm9', intervals: [3, 7, 10, 14] },        // b3-5-b7-9
  { name: 'Half-Diminished 7', symbol: 'm7b5', parentSymbol: 'm7b5', intervals: [3, 6, 10] }, // b3-b5-b7
];

// Intervals names for pedagogical display
export const INTERVAL_NAMES = {
  0: 'fondamentale',
  1: 'mineure seconde',
  2: 'majeure seconde',
  3: 'mineure tierce',
  4: 'majeure tierce',
  5: 'quarte juste',
  6: 'quarte augmentée / quinte diminuée',
  7: 'quinte juste',
  8: 'quinte augmentée / mineure sixte',
  9: 'majeure sixte',
  10: 'mineure septième',
  11: 'majeure septième',
  12: 'octave',
  13: 'neuvième mineure',
  14: 'neuvième majeure',
  15: 'neuvième augmentée',
  16: 'dixième mineure',
  17: 'onzième juste',
  18: 'onzième augmentée',
  20: 'treizième mineure',
  21: 'treizième majeure',
};
