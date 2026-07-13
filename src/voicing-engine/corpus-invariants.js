// Corpus d'invariants pour le voicing-engine.
// Chaque entrée décrit un cas de test : nom, symbole, pitch classes attendues,
// basse attendue, classification et, le cas échéant, une voicingCandidate de test.
//
// Classification :
// - hard_invariants   : obligations physiques et harmoniques (ne doit jamais changer)
// - acceptable_properties : propriétés que le moteur devrait privilégier (soft)
// - style_preferences : choix stylistiques, non testés comme obligations
// - out_of_scope      : hors vocabulaire V1 ; conservé comme documentation
//
// Les champs `notesOnStaff` et `notes` ne sont PAS testés automatiquement
// (ils servent de référence pour le futur générateur). La validation
// automatique porte sur expectedPcSet et expectedBassPc.

/** @typedef {{ name: string, symbol: string, expectedPcSet: number[], expectedBassPc: number | null, notesOnStaff: number, notes: number[], classification: 'hard_invariants' | 'acceptable_properties' | 'style_preferences' | 'out_of_scope', description: string }} InvariantCase */

/** @type {InvariantCase[]} */
export const INVARIANT_CORPUS = Object.freeze([
  // ============================================================
  // hard_invariants — obligations physiques et harmoniques
  // ============================================================

  // --- Triades de base (support V1) ---
  { name: 'C major triad', symbol: 'C', expectedPcSet: [0, 4, 7], expectedBassPc: 0, notesOnStaff: 3, notes: [36, 43, 48], classification: 'hard_invariants', description: 'Triade majeure en Do' },
  { name: 'F major triad', symbol: 'F', expectedPcSet: [5, 9, 0], expectedBassPc: 5, notesOnStaff: 3, notes: [41, 48, 53], classification: 'hard_invariants', description: 'Triade majeure en Fa' },
  { name: 'Bb major triad', symbol: 'Bb', expectedPcSet: [10, 2, 5], expectedBassPc: 10, notesOnStaff: 3, notes: [46, 53, 58], classification: 'hard_invariants', description: 'Triade majeure en Sib' },
  { name: 'G major triad', symbol: 'G', expectedPcSet: [7, 11, 2], expectedBassPc: 7, notesOnStaff: 3, notes: [43, 50, 55], classification: 'hard_invariants', description: 'Triade majeure en Sol' },
  { name: 'D major triad', symbol: 'D', expectedPcSet: [2, 6, 9], expectedBassPc: 2, notesOnStaff: 3, notes: [38, 45, 50], classification: 'hard_invariants', description: 'Triade majeure en Ré' },
  { name: 'A major triad', symbol: 'A', expectedPcSet: [9, 1, 4], expectedBassPc: 9, notesOnStaff: 3, notes: [45, 52, 57], classification: 'hard_invariants', description: 'Triade majeure en La' },

  { name: 'C minor triad', symbol: 'Cm', expectedPcSet: [0, 3, 7], expectedBassPc: 0, notesOnStaff: 3, notes: [36, 43, 48], classification: 'hard_invariants', description: 'Triade mineure en Do' },
  { name: 'F minor triad', symbol: 'Fm', expectedPcSet: [5, 8, 0], expectedBassPc: 5, notesOnStaff: 3, notes: [41, 48, 53], classification: 'hard_invariants', description: 'Triade mineure en Fa' },
  { name: 'G minor triad', symbol: 'Gm', expectedPcSet: [7, 10, 2], expectedBassPc: 7, notesOnStaff: 3, notes: [43, 50, 55], classification: 'hard_invariants', description: 'Triade mineure en Sol' },

  { name: 'C diminished triad', symbol: 'Cdim', expectedPcSet: [0, 3, 6], expectedBassPc: 0, notesOnStaff: 3, notes: [36, 43, 48], classification: 'hard_invariants', description: 'Triade diminuée en Do' },
  { name: 'C augmented triad', symbol: 'Caug', expectedPcSet: [0, 4, 8], expectedBassPc: 0, notesOnStaff: 3, notes: [36, 44, 48], classification: 'hard_invariants', description: 'Triade augmentée en Do' },

  { name: 'Csus4', symbol: 'Csus4', expectedPcSet: [0, 5, 7], expectedBassPc: 0, notesOnStaff: 3, notes: [36, 41, 48], classification: 'hard_invariants', description: 'Sus4 en Do' },
  { name: 'Gsus4', symbol: 'Gsus4', expectedPcSet: [7, 0, 2], expectedBassPc: 7, notesOnStaff: 3, notes: [43, 48, 50], classification: 'hard_invariants', description: 'Sus4 en Sol' },
  { name: 'Dsus2', symbol: 'Dsus2', expectedPcSet: [2, 4, 9], expectedBassPc: 2, notesOnStaff: 3, notes: [38, 40, 45], classification: 'hard_invariants', description: 'Sus2 en Ré' },

  // --- Septièmes (support V1) ---
  { name: 'Cmaj7', symbol: 'Cmaj7', expectedPcSet: [0, 4, 7, 11], expectedBassPc: 0, notesOnStaff: 4, notes: [36, 43, 48, 52], classification: 'hard_invariants', description: 'Maj7 en Do' },
  { name: 'Fmaj7', symbol: 'Fmaj7', expectedPcSet: [5, 9, 0, 4], expectedBassPc: 5, notesOnStaff: 4, notes: [41, 48, 53, 57], classification: 'hard_invariants', description: 'Maj7 en Fa' },
  { name: 'Bbmaj7', symbol: 'Bbmaj7', expectedPcSet: [10, 2, 5, 9], expectedBassPc: 10, notesOnStaff: 4, notes: [46, 53, 58, 62], classification: 'hard_invariants', description: 'Maj7 en Sib' },

  { name: 'C7', symbol: 'C7', expectedPcSet: [0, 4, 7, 10], expectedBassPc: 0, notesOnStaff: 4, notes: [36, 43, 48, 51], classification: 'hard_invariants', description: 'Dominante en Do' },
  { name: 'G7', symbol: 'G7', expectedPcSet: [7, 11, 2, 5], expectedBassPc: 7, notesOnStaff: 4, notes: [43, 50, 55, 59], classification: 'hard_invariants', description: 'Dominante en Sol' },
  { name: 'D7', symbol: 'D7', expectedPcSet: [2, 6, 9, 0], expectedBassPc: 2, notesOnStaff: 4, notes: [38, 45, 50, 53], classification: 'hard_invariants', description: 'Dominante en Ré' },

  { name: 'Cm7', symbol: 'Cm7', expectedPcSet: [0, 3, 7, 10], expectedBassPc: 0, notesOnStaff: 4, notes: [36, 43, 48, 51], classification: 'hard_invariants', description: 'Mineur 7 en Do' },
  { name: 'Fm7', symbol: 'Fm7', expectedPcSet: [5, 8, 0, 3], expectedBassPc: 5, notesOnStaff: 4, notes: [41, 48, 53, 56], classification: 'hard_invariants', description: 'Mineur 7 en Fa' },
  { name: 'Gm7', symbol: 'Gm7', expectedPcSet: [7, 10, 2, 5], expectedBassPc: 7, notesOnStaff: 4, notes: [43, 50, 55, 59], classification: 'hard_invariants', description: 'Mineur 7 en Sol' },

  { name: 'Cm7b5', symbol: 'Cm7b5', expectedPcSet: [0, 3, 6, 10], expectedBassPc: 0, notesOnStaff: 4, notes: [36, 43, 48, 51], classification: 'hard_invariants', description: 'Demi-diminué en Do' },
  { name: 'Gm7b5', symbol: 'Gm7b5', expectedPcSet: [7, 10, 1, 5], expectedBassPc: 7, notesOnStaff: 4, notes: [43, 50, 55, 59], classification: 'hard_invariants', description: 'Demi-diminué en Sol' },

  // --- Slash chords : basse dans l'accord ---
  { name: 'C/E', symbol: 'C/E', expectedPcSet: [0, 4, 7], expectedBassPc: 4, notesOnStaff: 3, notes: [40, 43, 48], classification: 'hard_invariants', description: 'C majeur avec basse tierce' },
  { name: 'C/G', symbol: 'C/G', expectedPcSet: [0, 4, 7], expectedBassPc: 7, notesOnStaff: 3, notes: [43, 48, 52], classification: 'hard_invariants', description: 'C majeur avec basse quinte' },
  { name: 'G/B', symbol: 'G/B', expectedPcSet: [7, 11, 2], expectedBassPc: 11, notesOnStaff: 3, notes: [47, 50, 55], classification: 'hard_invariants', description: 'G majeur avec basse tierce' },
  { name: 'F/A', symbol: 'F/A', expectedPcSet: [5, 9, 0], expectedBassPc: 9, notesOnStaff: 3, notes: [45, 48, 53], classification: 'hard_invariants', description: 'F majeur avec basse tierce' },

  // --- Slash chords : basse étrangère ---
  { name: 'Dm/A', symbol: 'Dm/A', expectedPcSet: [2, 5, 9], expectedBassPc: 9, notesOnStaff: 3, notes: [45, 50, 54], classification: 'hard_invariants', description: 'Dm avec basse A' },
  { name: 'Gm/D', symbol: 'Gm/D', expectedPcSet: [7, 10, 2], expectedBassPc: 2, notesOnStaff: 3, notes: [38, 50, 55], classification: 'hard_invariants', description: 'Gm avec basse D' },
  { name: 'Bb/G', symbol: 'Bb/G', expectedPcSet: [10, 2, 5], expectedBassPc: 7, notesOnStaff: 3, notes: [43, 58, 62], classification: 'hard_invariants', description: 'Bb avec basse G' },

  // --- Slash chords 7èmes : basse étrangère ---
  { name: 'Fm7/D', symbol: 'Fm7/D', expectedPcSet: [5, 8, 0, 3], expectedBassPc: 2, notesOnStaff: 4, notes: [38, 53, 56, 60], classification: 'hard_invariants', description: 'Fm7 avec basse D' },
  { name: 'C7/Bb', symbol: 'C7/Bb', expectedPcSet: [0, 4, 7, 10], expectedBassPc: 10, notesOnStaff: 4, notes: [46, 48, 52, 55], classification: 'hard_invariants', description: 'C7 avec basse Bb' },

  // --- Non-régression Fmaj7/D ---
  { name: 'Fmaj7/D (non-reg)', symbol: 'Fmaj7/D', expectedPcSet: [0, 4, 5, 9], expectedBassPc: 2, notesOnStaff: 4, notes: [38, 53, 57, 60], classification: 'hard_invariants', description: 'Fmaj7 sur D : contient A naturel, pas Ab' },

  // ============================================================
  // acceptable_properties — propriétés soft à privilégier
  // ============================================================

  { name: 'Cmaj7 confortable', symbol: 'Cmaj7', expectedPcSet: [0, 4, 7, 11], expectedBassPc: 0, notesOnStaff: 4, notes: [36, 43, 48, 52], classification: 'acceptable_properties', description: 'Toutes les notes dans les plages soft' },
  { name: 'C7 confortable', symbol: 'C7', expectedPcSet: [0, 4, 7, 10], expectedBassPc: 0, notesOnStaff: 4, notes: [36, 43, 48, 51], classification: 'acceptable_properties', description: 'Toutes les notes dans les plages soft' },
  { name: 'Dm/A confortable', symbol: 'Dm/A', expectedPcSet: [2, 5, 9], expectedBassPc: 9, notesOnStaff: 3, notes: [45, 50, 54], classification: 'acceptable_properties', description: 'Slash dans les plages soft' },

  // ============================================================
  // style_preferences — choix stylistiques futurs, non obligatoires
  // ============================================================

  { name: 'Cmaj9', symbol: 'Cmaj9', expectedPcSet: [0, 2, 4, 7, 11], expectedBassPc: 0, notesOnStaff: 5, notes: [36, 43, 48, 52, 55], classification: 'style_preferences', description: 'Extension — choix stylistique futur' },
  { name: 'C9', symbol: 'C9', expectedPcSet: [0, 2, 4, 7, 10], expectedBassPc: 0, notesOnStaff: 5, notes: [36, 43, 48, 51, 55], classification: 'style_preferences', description: 'Extension — choix stylistique futur' },

  // ============================================================
  // out_of_scope — documentés mais hors vocabulaire V1
  // ============================================================

  { name: 'C11', symbol: 'C11', expectedPcSet: [0, 2, 4, 5, 7, 10], expectedBassPc: 0, notesOnStaff: 6, notes: [36, 43, 48, 50, 53, 55], classification: 'out_of_scope', description: 'Extension 11 — hors V1' },
  { name: 'C13', symbol: 'C13', expectedPcSet: [0, 2, 4, 5, 7, 9, 10], expectedBassPc: 0, notesOnStaff: 7, notes: [36, 43, 48, 50, 53, 55, 58], classification: 'out_of_scope', description: 'Extension 13 — hors V1' },
  { name: 'C7b9', symbol: 'C7b9', expectedPcSet: [0, 1, 4, 7, 10], expectedBassPc: 0, notesOnStaff: 5, notes: [36, 43, 48, 51, 55], classification: 'out_of_scope', description: 'Couleur jazz b9 — hors V1' },
  { name: 'C7#9', symbol: 'C7#9', expectedPcSet: [0, 3, 4, 7, 10], expectedBassPc: 0, notesOnStaff: 5, notes: [36, 43, 48, 51, 55], classification: 'out_of_scope', description: 'Couleur jazz #9 — hors V1' },
  { name: 'CmMaj7', symbol: 'CmMaj7', expectedPcSet: [0, 3, 7, 11], expectedBassPc: 0, notesOnStaff: 4, notes: [36, 43, 48, 52], classification: 'out_of_scope', description: 'Mineur-majeur 7 — hors V1' },
  { name: 'D7', symbol: 'D7', expectedPcSet: [2, 6, 9, 0], expectedBassPc: 2, notesOnStaff: 4, notes: [38, 45, 50, 53], classification: 'hard_invariants', description: 'Dominante en Ré (cas transposition supplémentaire)' },
  { name: 'C7/F', symbol: 'C7/F', expectedPcSet: [0, 4, 7, 10], expectedBassPc: 5, notesOnStaff: 4, notes: [41, 48, 52, 55], classification: 'hard_invariants', description: 'C7 avec basse F (quinte dans l\'accord)' },
  { name: 'Ebmaj7', symbol: 'Ebmaj7', expectedPcSet: [3, 7, 10, 2], expectedBassPc: 3, notesOnStaff: 4, notes: [39, 46, 51, 55], classification: 'hard_invariants', description: 'Maj7 en Mib (cas transposition supplémentaire)' },
]);

/**
 * Retourne le cas du corpus correspondant à un symbole d'accord.
 * @param {string} symbol
 * @returns {InvariantCase | undefined}
 */
export function findInvariant(symbol) {
  return INVARIANT_CORPUS.find((c) => c.symbol === symbol);
}

/**
 * Filtre le corpus par classification.
 * @param {'hard_invariants' | 'acceptable_properties' | 'style_preferences' | 'out_of_scope'} classification
 * @returns {InvariantCase[]}
 */
export function invariantsByClassification(classification) {
  return INVARIANT_CORPUS.filter((c) => c.classification === classification);
}
