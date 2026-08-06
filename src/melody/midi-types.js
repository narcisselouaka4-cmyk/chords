// [OpenCode] — 2026-08-06 — Types partagés du pipeline Mélodie & Réharmonisation.
// Ce fichier ne contient que des définitions JSDoc. Aucun code exécutable.
// Les contrats ci-dessous sont validés par les Incréments 0 à 3 avant
// réouverture technique de Phase 1B7 / structured_harmony_v1.

/**
 * Événement MIDI brut capturé, non destructif.
 * @typedef {{
 *   time: number,              // secondes depuis le début de la capture
 *   type: 'note_on' | 'note_off' | 'control',
 *   note?: number,            // 0-127, présent pour note_on/note_off
 *   velocity?: number,         // 0-1, présent pour note_on/note_off
 *   controller?: number,      // 0-127, présent pour control
 *   value?: number,           // 0-127 pour control
 *   channel: number,           // 0-15
 *   sourceId?: string,         // identifiant de la source MIDI
 *   synthetic: boolean,        // false si réel, true si généré par le moteur
 *   terminationReason?: string // raison de fin pour note_off synthétique
 * }} MidiNoteEvent
 */

/**
 * Note consolidée issue de la timeline MIDI.
 * @typedef {{
 *   id: string,                // identifiant unique de la note
 *   midi: number,                // 0-127
 *   channel: number,             // 0-15
 *   sourceId: string,            // identifiant de la source MIDI
 *   startedAt: number,         // secondes
 *   releasedAt: number | null, // secondes, note-off physique reçu
 *   endedAt: number,           // secondes, fin sonore réelle ou forcée
 *   duration: number,          // endedAt - startedAt
 *   velocity: number,          // 0-1, vélocité d'attaque
 *   releaseVelocity: number | null, // 0-1, vélocité de relâchement si reçue
 *   sustained: boolean,        // maintenue par le sustain à un moment
 *   terminationReason: 'physical-release' | 'sustain-release' | 'disconnect' | 'session-stop' | 'reset' | null
 * }} MidiNote
 */

/**
 * État des notes tenues à un instant donné (format JSON-safe).
 * @typedef {{
 *   activeNotes: { midi: number, channel: number, sourceId: string, startTime: number, velocity: number, sustained: boolean }[],
 *   sustainedNotes: { midi: number, channel: number, sourceId: string, startTime: number, velocity: number }[],
 *   sustainPedal: boolean
 * }} HeldNoteState
 */

/**
 * Marqueur temporel sur une piste mélodique.
 * @typedef {{
 *   id: string,
 *   time: number,            // secondes depuis le début de la piste
 *   type: 'phrase-start' | 'phrase-end' | 'section' | 'user',
 *   label: string | null
 * }} MelodyMarker
 */

/**
 * Note de mélodie avec politique d'harmonisation.
 * @typedef {{
 *   id: string,              // identifiant stable
 *   sourceNoteId: string,    // référence à la MidiNote source
 *   midi: number,            // 0-127
 *   pitchClass: number,      // 0-11
 *   octave: number,          // C4=4
 *   velocity: number,        // 0-1
 *   startedAt: number,       // secondes depuis le début de la piste
 *   releasedAt: number | null,
 *   endedAt: number,
 *   duration: number,
 *   channel: number,         // 0-15
 *   sourceId: string | null, // identifiant de la source MIDI
 *   preserveExactPitch: boolean,
 *   sopranoPolicy: 'allow-notes-above' | 'melody-must-be-top' | 'free',
 *   harmonizationPolicy: 'force' | 'automatic' | 'skip',
 *   enabled: boolean,
 *   annotations: string[]
 * }} MelodyEvent
 */

/**
 * Piste mélodique complète.
 * @typedef {{
 *   id: string,
 *   name: string,
 *   sourceCaptureId: string,
 *   startedAt: number,       // secondes absolus de la capture source
 *   endedAt: number,
 *   duration: number,
 *   events: MelodyEvent[],
 *   markers: MelodyMarker[],
 *   version: number,
 *   createdAt: number,
 *   updatedAt: number
 * }} MelodyTrack
 */

/**
 * Diagnostic non destructif d'une piste mélodique.
 * @typedef {{
 *   overlaps: { fromId: string, toId: string, time: number }[],
 *   simultaneousAttacks: { time: number, ids: string[] }[],
 *   unusuallyLongNotes: { id: string, duration: number, threshold: number }[],
 *   incompleteEvents: { id: string, reason: string }[],
 *   forcedTerminations: { id: string, reason: string }[],
 *   warnings: string[]
 * }} MelodyTrackDiagnostic
 */

/**
 * Événement de lecture produit à partir d'une MelodyTrack.
 * @typedef {{
 *   time: number,            // secondes relatifs à la piste
 *   type: 'note_on' | 'note_off',
 *   midi: number,
 *   velocity: number,
 *   channel: number,
 *   sourceId: string | null,
 *   melodyEventId: string
 * }} MelodyPlaybackEvent
 */

/**
 * Contexte tonal.
 * @typedef {{
 *   tonicPc: number,
 *   mode: 'major' | 'minor',
 *   confidence: number,
 *   candidates: { tonicPc: number, mode: string, confidence: number }[]
 * }} TonalContext
 */

/**
 * Point d'ancrage harmonique dans la phrase.
 * @typedef {{
 *   anchorId: string,
 *   melodyEventId: string,
 *   time: number,
 *   rootPc: number,
 *   quality: string,
 *   bassPc: number | null,
 *   isUserDefined: boolean,
 *   source: 'manual' | 'detected' | 'imported'
 * }} HarmonicAnchor
 */

/**
 * Pitch class avec orthographe enharmonique.
 * @typedef {{
 *   midi: number,
 *   pitchClass: number,
 *   letter: string,
 *   accidental: string,
 *   octave: number,
 *   displayName: string
 * }} SpelledPitch
 */

/**
 * Candidat d'accord.
 * @typedef {{
 *   rootPc: number,
 *   quality: string,
 *   bassPc: number | null,
 *   inversion: number,
 *   chordTonePcs: number[],
 *   identityIntervals: string[],
 *   optionalIntervals: string[],
 *   omittedIntervals: string[],
 *   omissionReason: string | null,
 *   melodyCompatibility: 'chord-tone' | 'available-tension' | 'suspension' | 'non-chord-tone-allowed' | 'incompatible',
 *   containsMelodyNote: boolean,
 *   melodyNotePosition: 'soprano' | 'inner' | 'bass' | 'absent',
 *   isDiatonic: boolean,
 *   harmonicFunction: string | null,
 *   source: 'diatonic' | 'secondary-dominant' | 'approach-diminished' | 'substitution' | 'borrowed'
 * }} ChordCandidate
 */

/**
 * Transition entre deux accords candidats.
 * @typedef {{
 *   from: ChordCandidate,
 *   to: ChordCandidate,
 *   voiceLeadingScore: number,
 *   resolutionScore: number,
 *   harmonicFunctionScore: number,
 *   bassMovementScore: number,
 *   commonTones: number,
 *   parallelFifths: boolean,
 *   parallelOctaves: boolean,
 *   totalScore: number
 * }} CandidateTransition
 */

/**
 * Profil de jouabilité configurable.
 * @typedef {{
 *   leftHandMin: number,
 *   leftHandMax: number,
 *   rightHandMin: number,
 *   rightHandMax: number,
 *   leftHandMaxSpan: number,
 *   rightHandMaxSpan: number,
 *   allowRolledChords: boolean,
 *   allowHandRedistribution: boolean,
 *   strictPlayability: boolean
 * }} PlayabilityProfile
 */

/**
 * Profil stylistique déterminant les poids des soft heuristics.
 * @typedef {{
 *   id: string,
 *   label: string,
 *   weights: {
 *     voiceLeadingSmoothness: number,
 *     commonToneRetention: number,
 *     leadingToneResolution: number,
 *     seventhResolution: number,
 *     parallelFifthsPenalty: number,
 *     parallelOctavesPenalty: number,
 *     leadingToneDoublingPenalty: number,
 *     stepwiseMotion: number,
 *     registerStability: number,
 *     handBalance: number,
 *     functionalCoherence: number,
 *     tensionPreparation: number,
 *     tensionResolution: number,
 *     harmonicVariety: number
 *   },
 *   tolerances: {
 *     maxVoiceLeadingJump: number,
 *     allowedNonChordToneDuration: number,
 *     allowedNonChordToneMetricPosition: 'any' | 'weak' | 'none'
 *   },
 *   melodyPreferences: {
 *     preferChordTones: boolean,
 *     allowTensions: boolean,
 *     allowSuspensions: boolean,
 *     allowNonChordTones: boolean
 *   }
 * }} StyleProfile
 */

/**
 * Issue de validation.
 * @typedef {{
 *   severity: 'error' | 'warning',
 *   code: string,
 *   message: string,
 *   anchorId: string | null,
 *   melodyEventId: string | null,
 *   details: object
 * }} ValidationIssue
 */

/**
 * Résultat de validation d'un événement mélodique.
 * @typedef {{
 *   melodyEventId: string,
 *   midi: number,
 *   harmonizationPolicy: 'force' | 'automatic' | 'skip',
 *   chordCandidate: { rootPc: number, quality: string } | null,
 *   compatibility: 'chord-tone' | 'available-tension' | 'suspension' | 'non-chord-tone-allowed' | 'incompatible',
 *   presentInChord: boolean,
 *   exactPitchPreserved: boolean,
 *   sopranoPolicyRespected: boolean,
 *   issues: ValidationIssue[]
 * }} MelodyValidationResult
 */

/**
 * Rapport de validation structuré pour un chemin de réharmonisation.
 * @typedef {{
 *   valid: boolean,
 *   hardViolations: ValidationIssue[],
 *   warnings: ValidationIssue[],
 *   satisfiedConstraints: string[],
 *   melodyChecks: MelodyValidationResult[]
 * }} ValidationReport
 */

/**
 * Chemin de réharmonisation complet pour une phrase.
 * @typedef {{
 *   id: string,
 *   style: string,
 *   tensionLevel: number,
 *   anchors: { anchorId: string, melodyEventId: string, time: number, chord: ChordCandidate }[],
 *   transitions: CandidateTransition[],
 *   voicings: object[] | null,
 *   totalScore: number,
 *   validationReport: ValidationReport,
 *   explanationKey: string | null
 * }} ReharmonizationPath
 */

/**
 * Contraintes de réharmonisation.
 * @typedef {{
 *   preserveMelody: boolean,
 *   sopranoPolicy: 'melody-must-be-top' | 'allow-notes-above' | 'free',
 *   style: 'faithful' | 'gospel' | 'tense' | 'jazz',
 *   maxTension: number,
 *   allowedQualities: string[],
 *   minCommonTones: number,
 *   preferStepwiseBass: boolean,
 *   maxCandidatesPerAnchor: number,
 *   useSecondaryDominants: boolean,
 *   useApproachDiminished: boolean,
 *   useDiatonicSubstitutions: boolean
 * }} ReharmonizationConstraints
 */
