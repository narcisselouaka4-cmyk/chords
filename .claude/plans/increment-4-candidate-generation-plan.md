# Plan — Incrément 4 : génération des candidats d’accords

## 1. Vue d’ensemble

Objectif : pour chaque ancre harmonique éligible d’une `MelodyTrack`, générer un ensemble déterministe de `ChordCandidate` compatibles avec la note mélodique, ses politiques, le contexte tonal, les accords de début/fin verrouillés, l’orthographe enharmonique et le vocabulaire harmonique autorisé.

Ce plan ne couvre que la génération et le filtrage de candidats individuels. Aucun scoring de transition, aucun chemin global, aucun voicing définitif, aucune variante stylistique, aucune interface utilisateur, aucun appel réseau ou IA.

## 2. Fichiers concernés

### Créés
- `src/melody/chord-candidate-generator.js` — moteur de génération des candidats.
- `src/melody/test-chord-candidates.js` — tests déterministes de l’Incrément 4.

### Modifiés
- `src/chord-engine/chord-defs.js` — ajout de métadonnées d’identité (`identityIntervals`, `optionalIntervals`, `defaultOmissions`, `supportedOmissions`, `extensionIntervals`, `suspensionIntervals`) aux définitions canoniques, sans casser les consommateurs existants.
- `src/melody/midi-types.js` — mise à jour des typedefs `ChordCandidate`, `MelodyCompatibility`, `TonalRelation`, `CandidateValidationReport`, `AnchorCandidateGenerationResult`.

### Non modifiés (conservés intacts)
- `src/melody/melody-track.js`
- `src/melody/midi-capture.js`
- `src/melody/tonal-context.js`
- `src/melody/harmonic-context.js`
- `src/melody/spelled-pitch.js`
- `src/melody/test-melody-track.js`
- `src/melody/test-midi-capture.js`
- `src/melody/test-tonal-harmonic.js`
- `src/melody/test-spelled-pitch.js`
- `src/note-grouper.js`
- onglet Entraînement
- détecteur tonal (`src/analyzer/key-detector.js`)
- `structured_harmony_v1`

## 3. Décisions architecturales clés

### 3.1 Source de vérité unique des accords
`CHORD_DEFINITIONS` reste l’unique référentiel des qualités d’accords. Les nouvelles métadonnées d’identité y sont ajoutées directement. Le nouveau moteur consomme exclusivement :
- `parseChordSymbol()`
- `resolveCanonicalChordDefinition()`
- `CHORD_DEFINITIONS`
- les utilitaires harmoniques existants (`noteNameToPc`, `transposePc`, etc.)

Aucune seconde table de qualités, aucune seconde liste d’intervalles, aucun mapping local maj7/m7/7/m7b5/dim7 dans `src/melody`.

### 3.2 Métadonnées d’identité ajoutées à CHORD_DEFINITIONS
Chaque définition canonique peut porter les champs optionnels suivants :
- `identityIntervals: number[]` — intervalles indispensables à l’identité (ex. maj7 → [3,7] exprimés en demi-tons depuis la fondamentale, mais stockés sous forme canonique stable).
- `optionalIntervals: number[]` — intervalles omissibles sans changer la fonction (ex. quinte juste).
- `defaultOmissions: number[]` — omissions courantes appliquées par défaut lors du calcul de compatibilité.
- `supportedOmissions: number[]` — omissions explicitement autorisées.
- `extensionIntervals: number[]` — tensions disponibles (9, 11, 13 et leurs altérations).
- `suspensionIntervals: number[]` — intervalles de suspension (4, 9, etc.).

Les consommateurs existants qui ne lisent que `name`, `symbol` et `intervals` restent inchangés.

### 3.3 Orthographe enharmonique centralisée
La génération des candidats réutilise `spellPitchClass`, `spellMidiNote`, `spellChordReference` et `parseSpelledChordSymbol` de `src/melody/spelled-pitch.js`. La priorité est :
1. orthographe explicite d’un accord verrouillé ou manuel ;
2. orthographe du symbole original ;
3. `TonalContext` confirmé/détecté ;
4. fallback déterministe.

### 3.4 Pureté et déterminisme
Toutes les fonctions du nouveau module sont pures, sans DOM, sans réseau, sans mutation des entrées, sans `Date.now()` dans les résultats dérivés. Les identifiants de candidats sont déterministes et stables pour une même entrée.

### 3.5 Limites strictes
- Pas de scoring de transition.
- Pas de voice leading.
- Pas de programmation dynamique / beam search.
- Pas de voicings main gauche/droite.
- Pas de StyleProfile complet.
- Pas d’interface utilisateur.
- Pas d’IA.
- Pas de reprise de Phase 1B7.

## 4. Implémentation détaillée

### 4.1 Extension de `src/chord-engine/chord-defs.js`

Ajouter, pour les qualités du vocabulaire initial, des métadonnées d’identité. Exemples :

```js
{ name: 'Major 7', symbol: 'maj7', intervals: [0, 4, 7, 11],
  identityIntervals: [4, 11], optionalIntervals: [7],
  defaultOmissions: [], supportedOmissions: [7],
  extensionIntervals: [2, 9, 14, 17, 21],
  suspensionIntervals: [5] },
{ name: 'Dominant 7', symbol: '7', intervals: [0, 4, 7, 10],
  identityIntervals: [4, 10], optionalIntervals: [7],
  defaultOmissions: [], supportedOmissions: [7],
  extensionIntervals: [2, 9, 14, 17, 18, 20, 21],
  suspensionIntervals: [5] },
{ name: 'Minor 7', symbol: 'm7', intervals: [0, 3, 7, 10],
  identityIntervals: [3, 10], optionalIntervals: [7],
  defaultOmissions: [], supportedOmissions: [7],
  extensionIntervals: [2, 9, 14, 17, 21],
  suspensionIntervals: [5] },
{ name: 'Half-Diminished 7', symbol: 'm7b5', intervals: [0, 3, 6, 10],
  identityIntervals: [3, 6, 10], optionalIntervals: [],
  defaultOmissions: [], supportedOmissions: [],
  extensionIntervals: [9, 14],
  suspensionIntervals: [] },
{ name: 'Diminished 7', symbol: 'dim7', intervals: [0, 3, 6, 9],
  identityIntervals: [3, 6, 9], optionalIntervals: [],
  defaultOmissions: [], supportedOmissions: [],
  extensionIntervals: [], suspensionIntervals: [] },
{ name: 'Dominant 7 sus4', symbol: '7sus4', intervals: [0, 5, 7, 10],
  identityIntervals: [5, 10], optionalIntervals: [7],
  defaultOmissions: [], supportedOmissions: [7],
  extensionIntervals: [2, 14], suspensionIntervals: [] },
```

Les définitions sans métadonnées restent utilisables : le générateur tombe sur des valeurs par défaut raisonnables (tous les intervalles sauf la fondamentale sont identitaires, sauf quinte juste optionnelle).

### 4.2 `src/melody/chord-candidate-generator.js`

#### Données internes
- Vocabulaire initial supporté : `''`, `'m'`, `'maj7'`, `'m7'`, `'7'`, `'m7b5'`, `'dim7'`, `'6'`, `'m6'`, `'6/9'`, `'maj9'`, `'m9'`, `'9'`, `'7sus4'`, `'9sus4'`, `'7b9'`, `'13'` (limitée).
- Degrés diatoniques majeurs : `['', 'm7', 'm7', 'maj7', '7', 'm7', 'm7b5']` sur fondamentales `[0,2,4,5,7,9,11]`.
- Degrés diatoniques mineurs naturels : `['m7', 'm7b5', 'maj7', 'm7', '7', 'maj7', '7']` sur fondamentales `[0,2,3,5,7,8,10]` (tonique = degré I mineur).
- Substitution diatonique documentée : `m7` sur III peut remplacer `maj7` sur I lorsqu’il partage 3 notes significatives (ex. Em7 / Cmaj7 partagent E, G, B).
- Dominantes secondaires : uniquement si la cible diatonique est identifiable (V/ii, V/iii, V/iv, V/V, V/vi, V/VII en majeur ; V/III, V/IV, V/V, V/VI, V/VII en mineur).
- Diminués d’approche : `dim7` sur la note située un demi-ton chromatique au-dessus de la cible diatonique, avec la cible enregistrée.
- Emprunts modaux limités : mineur parallèle (bIII, bVI, bVII, iv) en partant d’une tonalité majeure.

#### API publique

```js
// Contrats mis à jour
generateChordCandidatesForAnchor(input)
generateChordCandidatesForContext(input)

buildDiatonicCandidates(input)
buildDiatonicSubstitutionCandidates(input)
buildSecondaryDominantCandidates(input)
buildDiminishedApproachCandidates(input)
buildBorrowedCandidates(input)

classifyMelodyCompatibility(input)
validateChordCandidate(candidate, context)
deduplicateChordCandidates(candidates)
limitChordCandidates(candidates, options)
```

##### `generateChordCandidatesForAnchor(input)`
Entrée :
- `anchor: HarmonicAnchor`
- `track: MelodyTrack`
- `harmonicContext: HarmonicContext`
- `options?: { maxCandidatesPerAnchor?: number }`

Comportement :
1. Valider l’ancre.
2. Si `harmonizationPolicy === 'skip'`, retourner `{ status: 'skipped', candidates: [] }`.
3. Résoudre le `MelodyEvent` lié si `melodyEventId` est présent.
4. Vérifier les accords verrouillés (`startChord`/`endChord`) : si l’ancre est en début/fin et l’accord est verrouillé, l’imposer comme candidat unique verrouillé (puis valider la compatibilité).
5. Générer les familles de candidats : diatonique, substitution, dominante secondaire, diminué d’approche, emprunt modal.
6. Classifier la compatibilité mélodique pour chaque candidat.
7. Filtrer selon les politiques mélodiques (`force` doit produire au moins un candidat valide ou `no-valid-candidate`).
8. Dédoublonner.
9. Limiter au plafond configuré (`maxCandidatesPerAnchor`, défaut 20).
10. Trier selon l’ordre déterministe : verrouillé, original explicite, diatonique, substitution, dominante secondaire, diminué d’approche, emprunt modal, identifiant stable.

Retour : `AnchorCandidateGenerationResult`.

##### `generateChordCandidatesForContext(input)`
Itère `generateChordCandidatesForAnchor` sur toutes les ancres d’un `HarmonicContext`, retourne un tableau de `AnchorCandidateGenerationResult`.

##### `classifyMelodyCompatibility(input)`
Entrée :
- `melodyEvent: MelodyEvent | null`
- `candidate: ChordCandidate`
- `policies`

Retourne une `MelodyCompatibility` avec la catégorie et les raisons.
Règles :
- `chord-tone` si la pitch class de la mélodie est dans `identityIntervals` (ou dans `intervals` si pas de métadonnées).
- `available-tension` si dans `extensionIntervals`.
- `suspension` si dans `suspensionIntervals`.
- `non-chord-tone-allowed` si la politique `automatic` l’autorise (note faible, ornement, etc.) ; jamais en `force`.
- `incompatible` sinon.

##### `validateChordCandidate(candidate, context)`
Retourne un `CandidateValidationReport` avec `valid`, `hardViolations`, `warnings`, `satisfiedConstraints`.

##### `deduplicateChordCandidates(candidates)`
Clé de dédoublonnage : même `pitchClasses`, même `qualityId`, même `bassPitchClass`, même `tonalRelation.degree`, même `melodyCompatibility.matchingInterval`, et aucune différence orthographique explicite significative.

##### `limitChordCandidates(candidates, options)`
Tronque selon `maxCandidatesPerAnchor` en conservant l’ordre déterministe.

### 4.3 Mise à jour de `src/melody/midi-types.js`

Remplacer les typedefs `ChordCandidate`, etc. par des versions enrichies correspondant aux contrats de la mission.

### 4.4 Tests `src/melody/test-chord-candidates.js`

Couvrir les 68 cas obligatoires regroupés en :
- source unique (4) ;
- identité des accords (8) ;
- compatibilité mélodique (11) ;
- ancres (7) ;
- familles (9) ;
- enharmonie (5) ;
- dédoublonnage et limites (6) ;
- validation et contrats (9) ;
- scénario de référence (5) ;
- non-régression (4).

Les tests utiliseront les helpers existants (`createMidiCapture`, `createMelodyTrack`, `createHarmonicContext`, `setManualTonalContext`, etc.).

## 5. Validation et non-régression

Après implémentation, exécuter :
- `node src/melody/test-chord-candidates.js`
- `node src/melody/test-spelled-pitch.js`
- `node src/melody/test-tonal-harmonic.js`
- `node src/melody/test-midi-capture.js`
- `node src/melody/test-melody-track.js`
- `node src/analyzer/test-regression-part1.js`
- `node src/chord-engine/test-regression-part3.js`
- `node src/chord-engine/test-chords.js`
- `npm run build`

Vérifier :
- `note-grouper.js` non modifié ;
- onglet Entraînement non modifié ;
- `key-detector.js` inchangé ;
- `structured_harmony_v1` inchangé ;
- aucune interface finale ajoutée ;
- aucune IA ; aucun réseau ; aucune dépendance inutile ;
- aucune seconde source de vérité des accords.

## 6. Git

Un seul commit atomique, si et seulement si tous les tests passent :

```
feat: generate melody-aware chord candidates

Co-Authored-By: Claude <noreply@anthropic.com>
```
