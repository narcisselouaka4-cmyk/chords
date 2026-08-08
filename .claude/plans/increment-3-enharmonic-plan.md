# Plan — Incrément 3 : modèle enharmonique et stabilisation des contrats musicaux partagés

## 1. Vue d'ensemble

Objectif : introduire un **moteur d'orthographe musicale unique** qui sépare strictement l'identité sonore (MIDI / pitch class) de l'orthographe (lettre + altération), puis l'intégrer aux contrats déjà stabilisés des Incréments 0–2 (MidiNoteEvent, MelodyEvent, MelodyTrack, TonalContext, HarmonicContext, ChordReference).

Livrables :
- contrat `SpelledPitch` et sa source de vérité unique ;
- contrat `SpelledKey` intégré à `TonalContext` ;
- orthographe contextuelle des gammes (7 lettres diatoniques distinctes) ;
- tonalité détectée → orthographe par défaut déterministe ; tonalité manuelle → orthographe exacte conservée ;
- `ChordReference` enrichi sans dupliquer les définitions d'accords ;
- `HarmonicContext` avec `startChord`/`endChord` verrouillables ;
- politique formalisée des ancres hors plage ;
- tests obligatoires et non-régression.

## 2. Fichiers concernés

### Créés
- `src/melody/spelled-pitch.js` — moteur central d'orthographe musicale.
- `src/melody/test-spelled-pitch.js` — tests déterministes de l'Incrément 3.

### Modifiés
- `src/melody/midi-types.js` — mise à jour des typedefs `SpelledPitch`, `SpelledKey`, `TonalContext`, `HarmonicContext`, `ChordReference`, `ValidationIssue`.
- `src/melody/tonal-context.js` — intégration de `SpelledKey`, sélection manuelle enharmonique, non-régression du détecteur.
- `src/melody/harmonic-context.js` — verrouillage de `startChord`/`endChord`, validation renforcée des ancres hors plage.
- `src/melody/test-tonal-harmonic.js` — nouveaux cas de test pour l'enharmonie, le verrouillage et les ancres hors plage.

### Non modifiés (conservés intacts)
- `src/melody/melody-track.js`
- `src/melody/midi-capture.js`
- `src/melody/test-melody-track.js`
- `src/melody/test-midi-capture.js`
- `src/chord-engine/chord-defs.js`
- `src/chord-engine/intervals.js`
- `src/note-grouper.js`
- onglet Entraînement
- détecteur tonal (`src/analyzer/key-detector.js`) : scores inchangés

## 3. Décisions architecturales clés

### 3.1 Un seul moteur d'orthographe
Toutes les opérations enharmoniques vivent dans `src/melody/spelled-pitch.js`. Ce module réutilise `noteNameToPc` de `src/chord-engine/intervals.js` comme fonction de conversion fiable, mais ne duplique pas les tables de qualités d'accords. `formatNote()` reste un outil d'affichage historique ; il n'est pas utilisé comme identité canonique.

### 3.2 Rétrocompatibilité des contrats
- `TonalContext.selected` continue d'exposer `{ tonicPitchClass, mode }`.
- Un champ optionnel `spelledKey: SpelledKey | null` est ajouté. Les anciennes données sans ce champ restent lisibles ; le moteur les traite comme `spelledKey: null` et applique le fallback déterministe.
- `ChordReference` conserve `root`, `quality`, `bass` et ajoute `rootSpelling`, `bassSpelling`, `originalSymbol`. Les consommateurs existants qui ne lisent que les 3 premiers champs continuent de fonctionner.
- `HarmonicContext.startChord`/`endChord` passent de `ChordReference | null` à `{ chord: ChordReference, locked: boolean } | null`. C'est un changement de contrat ; les 2 tests existants de `test-tonal-harmonic.js` qui accèdent directement à `ctx.startChord.root` seront adaptés, car le contrat est rendu explicite par la mission.

### 3.3 Stabilité des identifiants
Les IDs (`MelodyEvent.id`, `HarmonicAnchor.anchorId`, `TonalContext.id`) restent indépendants de l'orthographe. Un respelling C# → D♭ ne recrée pas d'IDs.

### 3.4 Pas de nouvelle définition de qualités d'accords
`CHORD_DEFINITIONS` et `resolveCanonicalChordDefinition` restent la seule source de vérité des qualités. C#m7 et D♭m7 partagent la même définition `m7` tout en conservant des orthographes distinctes.

## 4. Implémentation détaillée

### 4.1 `src/melody/spelled-pitch.js`

#### Données internes
- `DIATONIC_LETTERS = ['C','D','E','F','G','A','B']`
- Table des armures usuelles : mapping `fifths → { tonicLetter, tonicAccidental, scaleSpellings[7] }` pour `-7` à `+7`.
- `LETTER_TO_PC = { C:0, D:2, E:4, F:5, G:7, A:9, B:11 }`

#### API publique

```js
// Contrats (structural, JSON-safe)
SpelledPitch {
  pitchClass: number,        // 0-11
  letter: 'C'|'D'|'E'|'F'|'G'|'A'|'B',
  accidental: number,        // -2, -1, 0, 1, 2
  octave: number | null,
  origin: 'key-context'|'chord-symbol'|'manual'|'detected'|'fallback',
  explicit: boolean
}

SpelledKey {
  tonicPitchClass: number,
  mode: string,
  tonic: SpelledPitch,
  fifths: number | null,
  source: 'detected-default'|'manual'|'corrected'|'imported',
  explicit: boolean
}
```

Fonctions pures :
- `createSpelledPitch(input)` — validation + freeze.
- `validateSpelledPitch(sp)` — retourne `{ valid: boolean, error: string | null }` sans jeter.
- `pitchClassFromSpelling(letter, accidental)`.
- `sameSound(a, b)` — égalité sur `pitchClass` (et `octave` si les deux ont une octave).
- `sameSpelling(a, b)` — égalité sur `letter`, `accidental`, `octave`.
- `spellPitchClass(pc, context)` — contexte = `SpelledKey | TonalContext | null`.
- `spellMidiNote(midi, context)`.
- `spellScale(tonalContext)` — retourne `SpelledPitch[]` de 7 degrés, 7 lettres distinctes.
- `spellChordReference(chordReference, tonalContext, options)` — propose une orthographe contextuelle si aucune explicite.
- `setPreferredKeySpelling(tonalContext, spelledKey)`.
- `clearPreferredKeySpelling(tonalContext)`.
- `createSpelledKeyFromKeyObject({ tonicPitchClass, mode }, source?)`.
- `parseSpelledChordSymbol(symbol)` — utilise `parseChordSymbol` de `chord-display.js`, puis construit `rootSpelling`/`bassSpelling` avec origin='chord-symbol', explicit=true.
- `formatSpelledPitch(sp, options?)` — affichage (♭/♯/𝄫/𝄪), sans servir d'identité.

#### Règles d'orthographe par défaut d'une tonalité détectée
- Calcul du nombre de quintes (`fifths`) à partir de `(tonicPitchClass, mode)`.
- Pour les tonalités enharmoniquement équivalentes (C# majeur / D♭ majeur, F# majeur / G♭ majeur, B majeur / C♭ majeur), choisir l'orthographe par convention stable :
  - tons avec dièses préférés lorsque `fifths > 0` ;
  - tons avec bémols préférés lorsque `fifths < 0`.
- C# majeur (7#) et D♭ majeur (-5♭) : C# majeur par défaut.
- F# majeur (6#) et G♭ majeur (-6♭) : F# majeur par défaut.
- B majeur (5#) et C♭ majeur (-7♭) : B majeur par défaut.

#### Validation
`createSpelledPitch` lève `RangeError` ou `TypeError` structuré si `pitchClass(letter, accidental) !== pitchClass stockée`.

### 4.2 `src/melody/midi-types.js`

Mettre à jour :
- `SpelledPitch` : accidental devient `number`, suppression de `displayName` comme champ obligatoire, ajout de `origin` et `explicit`.
- Ajouter `SpelledKey` typedef.
- `TonalContext` : ajouter `spelledKey: SpelledKey | null`, conserver `selected`.
- `HarmonicContext` : `startChord`/`endChord` deviennent `{ chord: ChordReference, locked: boolean } | null`.
- `ChordReference` : ajouter `rootSpelling`, `bassSpelling`, `originalSymbol`.
- `ValidationIssue` : ajouter `details: object`.

### 4.3 `src/melody/tonal-context.js`

- Adapter `TonalContext` pour porter `spelledKey`.
- `estimateTonalContextFromMelody` : construit un `SpelledKey` par défaut (`detected-default`) à partir du meilleur candidat.
- `createTonalContext` : accepte `options.spelledKey`, sinon `null`.
- `selectTonalCandidate` : copie le `SpelledKey` par défaut du candidat sélectionné.
- `setManualTonalContext` :
  - chaîne enharmonique : `'Db'` vs `'C#'` résolvent en `tonicPitchClass` identique mais `SpelledKey` différent ;
  - objet `{ tonicPitchClass, mode }` : utilise l'orthographe par défaut + source='manual' ;
  - accepte un `SpelledKey` complet comme entrée pour préserver une orthographe explicite.
- `correctTonalContext` : même comportement que manuel avec source='corrected'.
- `clearTonalConfirmation` : restaure le `SpelledKey` détecté par défaut, écrase toute orthographe manuelle.
- `rebuildTonalContext` : conserve `spelledKey` et recrée un nouvel ID.

### 4.4 `src/melody/harmonic-context.js`

- `ChordReference` local enrichi avec les champs spelling.
- `createHarmonicContext` : construit `startChord`/`endChord` comme objets `{ chord, locked: false }`.
- `setStartChord(context, chord, options?)` : options `{ locked? }`.
- `setEndChord(context, chord, options?)` : idem.
- Ajouter `setStartChordLocked(context, locked)` et `setEndChordLocked(context, locked)`.
- `resolveChordReference` : via `parseSpelledChordSymbol` du moteur d'orthographe pour capturer l'orthographe exacte saisie.
- `validateHarmonicContext` :
  - ancre `relativeTime < 0` → `error` (inchangé) ;
  - ancre `relativeTime > trackDuration` :
    - `force` ou `locked` ou `type === 'original-chord'` et `originalChord != null` → `error` ;
    - sinon → `warning` ;
  - retour enrichi d'un statut par ancre (`{ anchorId, status: 'ok'|'warning'|'error', issues }`) exploitable sans supprimer les données.

### 4.5 Tests

#### `src/melody/test-spelled-pitch.js`
Couvrir les 38 points obligatoires de la section 15 de la mission, regroupés en :
- A. SpelledPitch de base (1–7)
- B. Orthographe des gammes (8–13)
- C. Tonalités détectées / manuelles (14–19)
- D. ChordReference enharmonique (20–25)
- E. Verrouillage HarmonicContext (26–28)
- F. Validation des ancres hors plage (29–32)
- G. Identifiants / sérialisation / immutabilité (33–35)
- H. Non-régression détecteur / unique source d'accords (36–37)
- I. Tous les tests précédents restent verts (38)

#### `src/melody/test-tonal-harmonic.js`
- Adapter les accès directs à `ctx.startChord.root` en `ctx.startChord.chord.root`.
- Ajouter des tests pour le verrouillage et les tonalités manuelles enharmoniques.

## 5. Non-régression

Commandes à exécuter avant commit :
1. `node src/melody/test-spelled-pitch.js`
2. `node src/melody/test-tonal-harmonic.js`
3. `node src/melody/test-midi-capture.js`
4. `node src/melody/test-melody-track.js`
5. `node src/analyzer/test-regression-part1.js`
6. `node src/chord-engine/test-regression-part3.js`
7. `npm run test:chords`
8. `npm run build`

Critères de succès : tous les tests passent, le build Vite réussit, `note-grouper` et l'onglet Entraînement restent inchangés.

## 6. Risques et mitigations

| Risque | Mitigation |
|--------|-----------|
| Modifier `parseChordSymbol` casse l'analyseur ou le voicing-engine | Ne pas modifier `parseChordSymbol` ; créer `parseSpelledChordSymbol` dans le moteur d'orthographe. |
| Changement de contrat `startChord`/`endChord` casse les tests existants | Mettre à jour les tests pour refléter le nouveau contrat explicite. |
| Orthographe des gammes avec 7#/7♭ incorrecte | Utiliser une table d'armures explicite couvrant `-7` à `+7` et la valider avec les exemples obligatoires. |
| Identifiants instables après respelling | Ne jamais régénérer d'ID lors d'un changement d'orthographe. |

## 7. Commit attendu

`feat: add enharmonic spelling and stabilize shared music contracts`

---

Ce plan reste dans le périmètre strict de l'Incrément 3 : pas de génération de candidats d'accords, pas de scoring, pas de voicings contextuels, pas d'IA, pas d'interface finale, pas de relance de Phase 1B7.
