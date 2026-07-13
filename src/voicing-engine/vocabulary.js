// Vocabulaire officiel du Two-Hand Piano Voicing Engine V1.
// Ce tableau borne explicitement ce que le générateur Phase 1 doit accepter.
// Toute qualité hors `supportedInV1` doit être rejetée proprement par le
// générateur, sans fallback silencieux vers major.

/** @typedef {{ category: 'supportedInV1' | 'metadataOnly' | 'futurePhase' | 'unsupported', description: string }} QualityCategory */

/** @type {Readonly<Record<string, QualityCategory>>} */
export const VOICING_V1_VOCABULARY = Object.freeze({
  // Triades et modes de base — supportés en V1
  '': { category: 'supportedInV1', description: 'Major triad' },
  'm': { category: 'supportedInV1', description: 'Minor triad' },
  'dim': { category: 'supportedInV1', description: 'Diminished triad' },
  'aug': { category: 'supportedInV1', description: 'Augmented triad' },
  'sus2': { category: 'supportedInV1', description: 'Sus2 triad' },
  'sus4': { category: 'supportedInV1', description: 'Sus4 triad' },

  // Septièmes — supportées en V1
  '7': { category: 'supportedInV1', description: 'Dominant 7' },
  'maj7': { category: 'supportedInV1', description: 'Major 7' },
  'm7': { category: 'supportedInV1', description: 'Minor 7' },
  'm7b5': { category: 'supportedInV1', description: 'Half-diminished 7' },

  // Slash bass — traitée comme métadonnée sur n'importe quel accord V1
  '/': { category: 'metadataOnly', description: 'Slash bass separator; not a quality' },

  // Extensions et couleurs — reportées à des phases ultérieures
  '6': { category: 'futurePhase', description: 'Major 6' },
  'm6': { category: 'futurePhase', description: 'Minor 6' },
  'add9': { category: 'futurePhase', description: 'Major add9' },
  '9': { category: 'futurePhase', description: 'Dominant 9' },
  'm9': { category: 'futurePhase', description: 'Minor 9' },
  'maj9': { category: 'futurePhase', description: 'Major 9' },
  '11': { category: 'futurePhase', description: 'Dominant 11' },
  'm11': { category: 'futurePhase', description: 'Minor 11' },
  'maj11': { category: 'futurePhase', description: 'Major 11' },
  '13': { category: 'futurePhase', description: 'Dominant 13' },
  'm13': { category: 'futurePhase', description: 'Minor 13' },
  'maj13': { category: 'futurePhase', description: 'Major 13' },
  '7b9': { category: 'futurePhase', description: 'Dominant 7 flat 9' },
  '7#9': { category: 'futurePhase', description: 'Dominant 7 sharp 9' },
  '7b9#9': { category: 'futurePhase', description: 'Dominant 7 flat 9 sharp 9' },
  '7#11': { category: 'futurePhase', description: 'Dominant 7 sharp 11' },
  '7b13': { category: 'futurePhase', description: 'Dominant 7 flat 13' },
  '7#5': { category: 'futurePhase', description: 'Augmented 7' },
  '7b5': { category: 'futurePhase', description: 'Dominant 7 flat 5' },
  '7sus4': { category: 'futurePhase', description: 'Dominant 7 sus4' },
  '7sus2': { category: 'futurePhase', description: 'Dominant 7 sus2' },
  'mMaj7': { category: 'futurePhase', description: 'Minor major 7' },
  'maj7#5': { category: 'futurePhase', description: 'Major 7 sharp 5' },

  // Hors périmètre
  'alt': { category: 'unsupported', description: 'Altered chord — not in CHORD_DEFINITIONS' },
  '5': { category: 'unsupported', description: 'Power chord — not targeted by V1 voicing engine' },
  'quartal': { category: 'unsupported', description: 'Quartal harmony — not targeted by V1' },
  'quartal(add4)': { category: 'unsupported', description: 'Quartal add4 — not targeted by V1' },
  '6/9': { category: 'unsupported', description: 'Major 6/9 — parsed as quality "6" plus unexpected chars by current parser' },
  '6add11': { category: 'unsupported', description: 'Major 6 add11 — parsed as quality "6" plus unexpected chars' },
  'madd9': { category: 'unsupported', description: 'Minor add9 — parsed as quality "m" plus unexpected chars' },
  'add11': { category: 'unsupported', description: 'Major add11 — parsed as quality "add11" not present in definitions' },
  '13sus4': { category: 'unsupported', description: 'Dominant 13 sus4 — parsed as quality "13sus4" not present in definitions' },
  '13#11': { category: 'unsupported', description: 'Dominant 13 #11 — parsed as quality "13#11" not present in definitions' },
  '7#9b13': { category: 'unsupported', description: 'Dominant 7 #9 b13 — parsed as quality "7#9b13" not present in definitions' },
  '7b9b13': { category: 'unsupported', description: 'Dominant 7 b9 b13 — parsed as quality "7b9b13" not present in definitions' },
  'm7b9': { category: 'unsupported', description: 'Minor 7 b9 — parsed as quality "m7b9" not present in definitions' },
});

/**
 * Retourne true si la qualité est officiellement supportée par le générateur V1.
 * @param {string} quality
 * @returns {boolean}
 */
export function isSupportedInV1(quality) {
  return VOICING_V1_VOCABULARY[quality]?.category === 'supportedInV1';
}

/**
 * Retourne true si la qualité fait partie du vocabulaire (supportée ou future).
 * Les qualités non listées sont totalement inconnues.
 * @param {string} quality
 * @returns {boolean}
 */
export function isKnownQuality(quality) {
  return quality in VOICING_V1_VOCABULARY;
}

/**
 * Catégorie d'une qualité.
 * @param {string} quality
 * @returns {QualityCategory['category'] | 'unknown'}
 */
export function qualityCategory(quality) {
  return VOICING_V1_VOCABULARY[quality]?.category || 'unknown';
}
