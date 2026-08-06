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
 * Candidat tonal.
 * @typedef {{
 *   tonicPitchClass: number,
 *   mode: string,
 *   confidence: number,
 *   score: number,
 *   source: 'melody-raw-notes' | 'harmony-chords' | 'combined' | 'manual',
 *   evidence: {
 *     noteCount: number,
 *     weightedPitchClasses: number[],
 *     supportingEventIds: string[],
 *     conflictingEventIds: string[]
 *   }
 * }} TonalCandidate
 */

/**
 * Contexte tonal.
 * @typedef {{
 *   id: string,
 *   selected: { tonicPitchClass: number, mode: string } | null,
 *   spelledKey: SpelledKey | null,
 *   candidates: TonalCandidate[],
 *   selectionOrigin: 'detected' | 'manual' | 'corrected' | null,
 *   melodyEstimate: TonalCandidate | null,
 *   harmonyEstimate: TonalCandidate | null,
 *   confirmedByUser: boolean,
 *   confidence: number | null,
 *   createdAt: number,
 *   updatedAt: number
 * }} TonalContext
 */

/**
 * Référence d'accord conservant l'orthographe originale.
 * @typedef {{
 *   root: number,
 *   quality: string,
 *   bass: number | null,
 *   rootSpelling: SpelledPitch | null,
 *   bassSpelling: SpelledPitch | null,
 *   originalSymbol: string | null
 * }} ChordReference
 */

/**
 * Point d'ancrage harmonique dans la phrase.
 * @typedef {{
 *   anchorId: string,
 *   melodyEventId: string | null,
 *   relativeTime: number,
 *   sourceTime: number | null,
 *   type: 'start' | 'end' | 'user' | 'original-chord' | 'section',
 *   harmonizationPolicy: 'force' | 'automatic' | 'skip',
 *   originalChord: ChordReference | null,
 *   locked: boolean,
 *   label: string | null
 * }} HarmonicAnchor
 */

/**
 * Contexte harmonique lié à une MelodyTrack.
 * @typedef {{
 *   id: string,
 *   melodyTrackId: string,
 *   tonalContext: TonalContext | null,
 *   startChord: { chord: ChordReference, locked: boolean } | null,
 *   endChord: { chord: ChordReference, locked: boolean } | null,
 *   originalProgression: HarmonicAnchor[],
 *   anchors: HarmonicAnchor[],
 *   version: number,
 *   createdAt: number,
 *   updatedAt: number
 * }} HarmonicContext
 */

/**
 * Hauteur sonore et orthographe musicale distinctes.
 *
 * Identité sonore : pitchClass 0-11 (+ octave éventuelle).
 * Orthographe     : letter A-G + accidental entier.
 *
 * @typedef {{
 *   pitchClass: number,      // 0-11
 *   letter: 'C' | 'D' | 'E' | 'F' | 'G' | 'A' | 'B',
 *   accidental: number,       // -2 double bémol, -1 bémol, 0 naturel, 1 dièse, 2 double dièse
 *   octave: number | null,
 *   origin: 'key-context' | 'chord-symbol' | 'manual' | 'detected' | 'fallback',
 *   explicit: boolean
 * }} SpelledPitch
 */

/**
 * Tonalité avec orthographe préférée explicite.
 * @typedef {{
 *   tonicPitchClass: number,
 *   mode: string,
 *   tonic: SpelledPitch,
 *   fifths: number | null,
 *   source: 'detected-default' | 'manual' | 'corrected' | 'imported',
 *   explicit: boolean
 * }} SpelledKey
 */


/**
 * Compatibilité mélodique d'un candidat par rapport à un événement mélodique.
 * @typedef {{
 *   category: 'chord-tone' | 'available-tension' | 'suspension' | 'non-chord-tone-allowed' | 'incompatible',
 *   melodyPitchClass: number,
 *   melodyMidi: number | null,
 *   matchingInterval: number | null,
 *   exactPitchRequired: boolean,
 *   exactPitchSatisfied: boolean,
 *   sopranoPolicy: 'allow-notes-above' | 'melody-must-be-top' | 'free',
 *   harmonizationPolicy: 'force' | 'automatic' | 'skip',
 *   reasons: string[]
 * }} MelodyCompatibility
 */

/**
 * Relation d'un candidat à la tonalité courante.
 * @typedef {{
 *   degree: number | null,
 *   romanNumeral: string | null,
 *   diatonic: boolean,
 *   borrowed: boolean,
 *   secondaryDominantTarget: number | null,
 *   approachType: 'none' | 'diatonic-substitution' | 'secondary-dominant' | 'diminished-approach' | 'modal-borrowing'
 * }} TonalRelation
 */

/**
 * Rapport de validation d'un candidat.
 * @typedef {{
 *   valid: boolean,
 *   hardViolations: ValidationIssue[],
 *   warnings: ValidationIssue[],
 *   satisfiedConstraints: string[]
 * }} CandidateValidationReport
 */

/**
 * Candidat d'accord enrichi.
 * @typedef {{
 *   id: string,
 *   anchorId: string,
 *   melodyEventId: string | null,
 *   chord: ChordReference,
 *   rootPitchClass: number,
 *   rootSpelling: SpelledPitch,
 *   bassPitchClass: number | null,
 *   bassSpelling: SpelledPitch | null,
 *   qualityId: string,
 *   canonicalDefinitionId: string,
 *   pitchClasses: number[],
 *   spelledTones: SpelledPitch[],
 *   identityIntervals: number[],
 *   optionalIntervals: number[],
 *   omittedIntervals: number[],
 *   omissionReason: string | null,
 *   melodyCompatibility: MelodyCompatibility,
 *   tonalRelation: TonalRelation,
 *   locked: boolean,
 *   source: 'locked-boundary' | 'diatonic' | 'substitution' | 'secondary-dominant' | 'diminished-approach' | 'borrowed' | 'manual',
 *   validation: CandidateValidationReport
 * }} ChordCandidate
 */

/**
 * Résultat de la génération de candidats pour une ancre.
 * @typedef {{
 *   anchorId: string,
 *   melodyEventId: string | null,
 *   status: 'generated' | 'skipped' | 'no-valid-candidate' | 'invalid-anchor',
 *   candidates: ChordCandidate[],
 *   rejectedSummary: { total: number, byReason: Record<string, number> },
 *   warnings: ValidationIssue[]
 * }} AnchorCandidateGenerationResult
 */

/**
 * Transition entre deux accords candidats.
 *
 * NB : les champs dépendant des voicings — `parallelFifths`, `parallelOctaves`
 * et un véritable `voiceLeadingScore` (mouvement de voix par registre) —
 * attendent l'Incrément 7 (génération de voicings). L'Incrément 5 ne produit
 * que {@link TransitionScore}, un proxy sur pitch classes.
 *
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
 * Score pur d'une transition dirigée entre deux ChordCandidate.
 *
 * Produit par `scoreChordTransition({ from, to })` (Incrément 5), sans
 * voicings, sans sélection de chemin et sans recalcul de MelodyCompatibility.
 * Toutes les composantes et le total sont compris entre 0 et 100 ; plus le
 * score est élevé, plus la transition est fluide/cohérente selon ce proxy.
 * `totalScore` est arrondi à l'entier. Chaque composante non active vaut null.
 *
 * @typedef {{
 *   fromId: string,
 *   toId: string,
 *   commonTones: number,
 *   commonToneRate: number,
 *   movementSemitones: number,
 *   movementRate: number,
 *   rootFifthsDistance: number,
 *   rootScore: number,
 *   bassScore: number | null,
 *   resolutionScore: number | null,
 *   componentScores: {
 *     common: number,
 *     motion: number,
 *     root: number,
 *     bass: number | null,
 *     resolution: number | null
 *   },
 *   activeWeights: Record<string, number>,
 *   direction: 'directional',
 *   totalScore: number,
 *   limits: string[]
 * }} TransitionScore
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
