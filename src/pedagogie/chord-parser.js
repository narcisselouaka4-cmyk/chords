// [Claude] — 2026-09-09 — Parser d'accords v2 pour le Copilot IA.
//
// Ce module re-exporte désormais la version basée sur @tonaljs/tonal
// (src/pedagogie/chord-parser-v2.js). Il est conservé pour la compatibilité
// des imports existants.

export {
  parseChordSymbol,
  chordSymbolToMidi,
  chordSymbolToPitchClasses,
  isChordSymbolRecognized,
  extractChordSymbol,
} from './chord-parser-v2.js';
