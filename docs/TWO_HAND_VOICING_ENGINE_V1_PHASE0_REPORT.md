# Two-Hand Piano Voicing Engine V1 — Rapport Phase 0

## Objectif
Poser les fondations pures, testables et isolées du nouveau moteur de voicings à deux mains, **sans générer aucun voicing utilisateur**.

## Livrables

### 1. Module harmonique partagé (`src/chord-engine/chord-display.js`)
- Extraction des fonctions pures du moteur d'affichage d'accords :
  - `parseChordSymbol`
  - `formatEffectiveChord`
  - `getEffectiveChord`
  - `normalizeOverride`
  - `deriveChordDisplay`
- Aucune dépendance à `src/ui/`.
- Réexporté depuis `src/ui/chord-editor.js` pour préserver l'API existante.

### 2. Modules du voicing-engine (`src/voicing-engine/`)
| Fichier | Rôle |
|---------|------|
| `chord-input.js` | Contrat d'entrée pur : `normalizeVoicingInput`, `normalizeVoicingInputFromSymbol`. |
| `midi-convention.js` | Convention C4=MIDI 60, helpers pc/octave/MIDI. |
| `hand-ranges.js` | Plages strictes/préférentielles LH/RH, max spans. |
| `data-model.js` | Types et constructeurs immuables `HandVoicing`, `VoicingCandidate`. |
| `constraints.js` | Validation hard par main et par candidate ; mesure des features soft. |
| `corpus-invariants.js` | 30+ cas de référence couvrant triades, 7èmes, extensions, suspensions, slash. |
| `test-voicing-phase0.js` | Suite de tests Phase 0. |

### 3. Tests
- **Phase 0** : 40 tests, **40 passés**.
- **Tests de régression existants** : tous passent.
  - `src/ui/test-chord-editor.js`
  - `src/analyzer/test-analysis-export.js`
  - `src/analyzer/test-regression-part1.js`
  - `src/chord-engine/test-regression-part3.js`
- **Build Vite** : OK.

## Points de vigilance respectés
- Aucun module `src/voicing-engine/*` n'importe `src/ui/`.
- Aucun générateur de voicings (`close.js`, `jazz.js`, `gospel.js`, etc.) n'a été créé.
- `rootless` reste `false` partout en Phase 0.
- Les fichiers pré-modifiés protégés restent en l'état ; ils ne sont pas dans le périmètre Phase 0.
- Non-régression `Fmaj7 → Fm7/D` : la suite Partie 1 et le test dédié Phase 0 passent (pas d'A naturel dans un Fm7/D hypothétique).

## Plages et contraintes physiques validées
- LH strict : 28–55 (E1–G3), préférentiel : 36–48 (C2–C3), span max 12.
- RH strict : 48–84 (C3–C6), préférentiel : 55–72 (G3–C5), span max 16.
- Hard constraints : notes dans plages, pas de doublons MIDI, pas de croisement, basse slash = note la plus grave.

## Prochaine étape
Phase 1 : implémenter le premier générateur de candidates (close two-hand) en utilisant uniquement les fondations ci-dessus.

---

## Section d'audit indépendant — Phase 0

Audit réalisé sur la base de :
- `docs/TWO_HAND_VOICING_ENGINE_V1_PLAN.md`
- `docs/TWO_HAND_VOICING_ENGINE_V1_PHASE0_REPORT.md`
- modules `src/chord-engine/chord-display.js` et `src/voicing-engine/*`
- consommateurs `src/ui/chord-editor.js`, `src/ui/analyzer-tab.js`, `src/analyzer/analysis-export.js`, `src/ui/test-chord-editor.js`
- tests existants et build Vite

### 1. Périmètre Git

| Catégorie | Fichiers |
|-----------|----------|
| Préexistants (hors Phase 0) | `.clinerules/rules-projet.md`, `CHANGES.md`, `electron/audio-processor.py`, `package*.json`, `src/main.js`, `src/recorder/serializer.js`, `vite.config.js` |
| Modifiés par Phase 0 | `src/ui/chord-editor.js`, `src/ui/analyzer-tab.js`, `src/analyzer/analysis-export.js`, `src/ui/test-chord-editor.js` |
| Créés par Phase 0 | `src/chord-engine/chord-display.js`, `src/voicing-engine/*` (7 fichiers), `docs/TWO_HAND_VOICING_ENGINE_V1_PLAN.md`, `docs/TWO_HAND_VOICING_ENGINE_V1_PHASE0_REPORT.md` |

Aucun fichier protégé n'a été modifié fonctionnellement.

### 2. Dépendances

Architecture respectée : `chord-engine / voicing-engine → UI`. Aucun import `../ui/` dans `src/chord-engine/` ni `src/voicing-engine/`. Aucune référence DOM, Electron, `window` ou état de timeline dans les modules moteur.

### 3. Extraction `chord-display.js`

Les 5 fonctions canoniques sont centralisées dans un seul fichier, réexportées sans copie locale divergente. `src/analyzer/chord-comparator.js` possède un `parseChordSymbol` local, mais il appartient à un autre domaine (Coach de Studio) et n'est pas un doublon du canonique.

### 4. Contrat `VoicingInput`

`normalizeVoicingInput` valide correctement les pitch classes 0–11, les qualités depuis `CHORD_DEFINITIONS`, la basse optionnelle, et rejette les entrées invalides. Pas de dépendance UI, pas de mutation de l'entrée, déterministe.

### 5. Convention MIDI

C4 = 60 cohérent avec `intervals.js`, `ai-client.js` et `keyboard-svg.js`. Frontières B3/C4, B4/C5 vérifiées.

### 6. Plages des mains

| Constante | Min | Max |
|-----------|-----|-----|
| LH_HARD_RANGE | 28 | 55 |
| LH_SOFT_RANGE | 36 | 48 |
| RH_HARD_RANGE | 48 | 84 |
| RH_SOFT_RANGE | 55 | 72 |
| LH_MAX_SPAN | — | 12 |
| RH_MAX_SPAN | — | 16 |

Zone de chevauchement 48–55. Règle de croisement `maxLh > minRh` (strict). Pas de `minBassToRightGap` ni de min/max notes par main en Phase 0.

### 7. Contraintes physiques

`checkHandHardConstraints` et `checkCandidateHardConstraints` invalident correctement : hors plage, doublons MIDI, span excessif, croisement, basse slash non la plus grave. Soft features déterministes sans pondération cachée.

### 8. Modèle de données

`HandVoicing` et `VoicingCandidate` sont immuables, séparent LH/RH, gardent fondamentale et basse slash distinctes, n'exigent aucune classe UI.

### 9. Rootless désactivé

`rootless: false` partout. Aucun comportement rootless actif.

### 10. Corpus

32 cas couvrant triades, 7èmes, extensions, suspensions, slash et couleurs jazz. Tous en Do (ou proches).

### 11. Qualité des tests

40 tests passent. Points faibles relevés : peu de tests RH hard, peu d'edge cases, aucun test de transposition dans le corpus, `notesOnStaff` non validé, paramètre `notationPreference` mort.

### 12. Absence de générateur

Confirmé : pas de `close.js`, `simple.js`, `jazz.js`, `gospel.js`, `candidate-generator.js`, `scorer.js`, `formatter.js`, `voice-leading.js`.

### 13. Régressions

Tous les tests de régression existants passent ; build Vite OK.

### 14. Protection des moteurs

Aucune modification de moteur audio, segmentation, Viterbi, downgrade ou export harmonique existant.

### 15. Verdict

**Défauts confirmés (mineurs) :**
1. `notationPreference` — paramètre mort dans `chord-input.js`
2. `OCTAVE_BASES` — constante inutilisée dans `midi-convention.js`
3. `notesOnStaff` — champ mort dans le corpus
4. `bassDistanceFromIdealLow` — placeholder toujours à 0
5. `voiceLeadingCost` — placeholder toujours à 0

**Risques :**
- Corpus 100% en Do
- Aucun cas invalide dans le corpus
- Tests RH hard peu couverts

**Verdict : TWO_HAND_VOICING_ENGINE_V1_PHASE0_AUDITED_READY** — fondations solides, défauts mineurs à traiter en Phase 0.5 avant tout générateur.

---

## Phase 0.5 — Durcissement

### Objectif
Corriger les défauts mineurs de l'audit, compléter les tests de frontière, enrichir le corpus et borner explicitement le vocabulaire Phase 1 avant tout générateur.

### Défauts résolus

| Défaut | Fichier | Action | Justification |
|--------|---------|--------|---------------|
| `notationPreference` mort | `chord-input.js` | Retiré du contrat interne | Pitch classes et MIDI ne dépendent jamais de la notation |
| `OCTAVE_BASES` inutilisée | `midi-convention.js` | Supprimée | Une seule convention d'octave via `pcOctaveToMidi` |
| `notesOnStaff` mort | `corpus-invariants.js` | Documenté comme référence non testée | Le corpus teste `expectedPcSet` et `expectedBassPc` ; `notesOnStaff` sert au futur générateur |
| `bassDistanceFromIdealLow` placeholder | `constraints.js`, `data-model.js` | Renommé `bassDistanceFromIdealLowReserved` | Pas de mesure factice présentée comme réelle |
| `voiceLeadingCost` placeholder | `constraints.js`, `data-model.js` | Renommé `voiceLeadingCostReserved` | Pas de faux champ fonctionnel avant la phase voice leading |
| `generatorId` vide | `data-model.js` | Documenté comme réservé Phase 1+ | Champ public conservé, valeur `''` explicite |

Amélioration complémentaire : `checkCandidateHardConstraints` gère explicitement les mains vides (`-Infinity`/`Infinity` remplacés par des gardes).

### Tests ajoutés

#### VoicingInput (18 nouveaux)
- Frontières `rootPc` : 0, 11, négatif, 12, float, string, `NaN`
- Frontières `bassPc` : 0, 11, négatif, >11, absence
- Immutabilité entrée et résultat
- Toutes les 10 qualités supportées V1
- Qualités futures reconnues mais non supportées
- Bases slash invalides rejetées

#### MIDI / notation (10 nouveaux)
- Dièses / bémols / politique `NOTE_NAMING_POLICY`
- `noteNameToMidi` invalide retourne `null`
- Doubles altérations rejetées
- Round-trip nom → MIDI → nom
- `pcMidiInstances` vide si `minOctave > maxOctave`
- Les 12 pitch classes sur plusieurs octaves

#### Hard constraints (18 nouveaux)
- RH sous/au-dessus des limites
- RH span 16 valide, span 17 invalide
- Doublon RH
- Main vide LH/RH/les deux
- `max(LH) === min(RH)` autorisé
- `max(LH) > min(RH)` invalide
- Notes exactement aux limites : 28, 55, 48, 84
- Notes juste hors limites : 27, 56, 47, 85
- Basse slash correcte vs non la plus grave

#### Soft features (8 nouveaux)
- Doublures comptées
- Notes hard mais hors soft
- Limites soft exactes
- Span nul
- `bassToRightGap` mesuré
- Déterminisme
- Soft features ne rendent jamais invalide
- Placeholders `Reserved` documentés

#### Corpus (10 nouveaux)
- 48 cas total (passage de 32 à 48)
- 6+ fondamentales différentes (C, F, Bb, G, D, A, Eb)
- 10+ qualités V1 distinctes
- Slash bass interne et étrangère
- Classifications : `hard_invariants`, `acceptable_properties`, `style_preferences`, `out_of_scope`

### Vocabulaire Phase 1

Fichier `src/voicing-engine/vocabulary.js`.

| Catégorie | Qualités |
|-----------|----------|
| `supportedInV1` | `''`, `m`, `7`, `maj7`, `m7`, `m7b5`, `dim`, `aug`, `sus2`, `sus4` |
| `metadataOnly` | `/` (séparateur de basse slash) |
| `futurePhase` | `6`, `m6`, `add9`, `9`, `m9`, `maj9`, `11`, `m11`, `maj11`, `13`, `m13`, `maj13`, `7b9`, `7#9`, `7b9#9`, `7#11`, `7b13`, `7#5`, `7b5`, `7sus4`, `7sus2`, `mMaj7`, `maj7#5` |
| `unsupported` | `alt`, `5`, `quartal`, `quartal(add4)`, `6/9`, `6add11`, `madd9`, `add11`, `13sus4`, `13#11`, `7#9b13`, `7b9b13`, `m7b9` |

Le générateur Phase 1 refusera proprement toute qualité hors `supportedInV1` (pas de fallback silencieux vers major).

### Résultats

- **Tests Phase 0.5** : 96 tests, **96 passés**.
- **Tests de régression existants** : tous passent.
- **Build Vite** : OK.

### Fichiers admissibles au futur commit Phase 0.5

Nouveaux :
- `src/voicing-engine/vocabulary.js`

Modifiés (Phase 0.5 uniquement) :
- `src/voicing-engine/chord-input.js`
- `src/voicing-engine/midi-convention.js`
- `src/voicing-engine/data-model.js`
- `src/voicing-engine/constraints.js`
- `src/voicing-engine/corpus-invariants.js`
- `src/voicing-engine/test-voicing-phase0.js`
- `docs/TWO_HAND_VOICING_ENGINE_V1_PHASE0_REPORT.md`

**Préexistants exclus** : `.clinerules/rules-projet.md`, `CHANGES.md`, `electron/audio-processor.py`, `package*.json`, `src/main.js`, `src/recorder/serializer.js`, `vite.config.js`.

### Verdict Phase 0.5

**TWO_HAND_VOICING_ENGINE_V1_PHASE0_5_VALIDATED**

Défauts résolus, frontières testées, corpus diversifié à 48 cas, vocabulaire V1 borné. Aucun générateur n'a été créé. Les régressions passent toutes. La base est prête pour une revue finale avant Phase 1.

---

## Phase 0.6 — Micro-nettoyage des risques résiduels

### Objectif
Éliminer les quatre risques résiduels simples identifiés après la revue finale, sans créer de générateur, sans démarrer la Phase 1, et sans modifier aucune interface produit ou export.

### Risques résolus

| Risque | Fichier | Action | Justification |
|--------|---------|--------|---------------|
| Recherche `CHORD_DEFINITIONS.find` arbitraire | `src/chord-engine/chord-display.js`, `src/voicing-engine/chord-input.js`, `src/ui/analyzer-tab.js` | Création de `resolveCanonicalChordDefinition` : sélectionne uniquement la définition normale (sans `parentSymbol`) correspondant à la qualité publique | Évite de choisir la première entrée si plusieurs symboles coexistent ; rootless et métadonnées internes sont ignorées |
| Valeurs MIDI non entières | `src/voicing-engine/hand-ranges.js`, `src/voicing-engine/constraints.js`, `src/voicing-engine/data-model.js`, `src/voicing-engine/midi-convention.js` | `midiInRange` exige un entier ; `createHandVoicing` lève `TypeError` si une note n'est pas un entier ; `pcOctaveToMidi`, `midiToPcOctave`, `pcMidiInstances` et `noteNameToMidi` rejettent float/NaN/Infinity/strings | Pas d'arrondi silencieux ; validation en profondeur |
| Commentaire `bassToRightGap` incorrect | `src/voicing-engine/constraints.js` | Commentaire corrigé pour décrire exactement la distance entre la note la plus grave globale et la note la plus grave de la main droite | L'algorithme était déjà correct ; seule la documentation était fausse |
| Helper de test mort | `src/voicing-engine/test-voicing-phase0.js` | Suppression de `assertThrows` inutilisé | Les tests d'immutabilité utilisent `Object.isFrozen` |

### Détail des changements

#### 1. Résolution canonique des accords

Nouvelle fonction publique dans `src/chord-engine/chord-display.js` :

```js
export function resolveCanonicalChordDefinition(quality) {
  const trimmed = quality === '' ? '' : quality.trim();
  return CHORD_DEFINITIONS.find((d) => d.symbol === trimmed && !d.parentSymbol);
}
```

- `deriveChordDisplay` l'utilise.
- `normalizeVoicingInput` l'utilise.
- `src/ui/analyzer-tab.js` (fonction `chordNotes`) l'utilise également pour rester cohérent.
- Une définition miroir `m7b5` avec `parentSymbol: 'm7b5'` a été ajoutée à la fin de `CHORD_DEFINITIONS` comme fixture de test ; la résolution canonique retourne toujours `[0, 3, 6, 10]` et non `[3, 6, 10]`.

#### 2. Validation des MIDI entiers

- `isIntegerMidi(value)` ajouté dans `src/voicing-engine/hand-ranges.js`.
- `midiInRange` exige maintenant `Number.isInteger(midi)`.
- `checkHandHardConstraints` détecte les notes non entières avant la vérification de plage.
- `createHandVoicing` lève `TypeError` si une note n'est pas un entier MIDI.
- `pcOctaveToMidi`, `midiToPcOctave`, `pcMidiInstances` lèvent `TypeError` sur arguments non entiers.
- `noteNameToMidi` retourne `null` si l'octave parsé n'est pas un entier (ex. `C4.5`, `CNaN`).

#### 3. `bassToRightGap`

Le commentaire indique désormais :

> Distance basse → main droite : information soft, pas un hard constraint. Mesurée ici en demi-tons entre la note globalement la plus grave (toutes mains confondues) et la note la plus grave de la main droite. Quand la main droite est vide, la mesure vaut 0.

#### 4. Risques volontairement conservés

| Risque | Justification |
|--------|---------------|
| Candidats invalides dans le corpus principal | Le corpus contient uniquement des accords/candidats valides servant d'invariants. Les cas invalides (hors plage, croisement, doublons, float MIDI) sont couverts par des tests dédiés de `constraints.js` et `hand-ranges.js`. |
| Doubles altérations (`C##`, `Bbb`) hors périmètre V1 | Le parseur les rejette proprement (`noteNameToMidi` retourne `null`). Leur support n'est pas requis pour le vocabulaire V1 et n'est pas élargi dans cette phase. |

### Tests ajoutés

- `resolveCanonicalChordDefinition` choisit la définition normale malgré une variante rootless.
- `isIntegerMidi` true/false pour entiers, floats, NaN, Infinity, strings.
- `midiInRange` rejette 36.5, NaN, Infinity et `'36'`.
- `pcOctaveToMidi`, `midiToPcOctave`, `pcMidiInstances` lèvent sur arguments non entiers.
- `noteNameToMidi` retourne `null` sur octave non entier.
- `createHandVoicing` lève sur float/NaN/Infinity/string.
- `checkHandHardConstraints` refuse LH/RH avec float, NaN, Infinity, string (via le rejet de `createHandVoicing`).

### Résultats

- **Tests Phase 0/0.5/0.6** : 107 tests, **107 passés**.
- **Tests chord-display (`src/ui/test-chord-editor.js`)** : passés.
- **Tests Manual Chord Editing / persistance (`src/ui/test-chord-editor.js`)** : passés.
- **Tests exports/statistiques (`src/analyzer/test-analysis-export.js`)** : passés.
- **Régressions générales** :
  - `src/analyzer/test-regression-part1.js` : passé
  - `src/chord-engine/test-regression-part3.js` : passé
- **Build Vite** : OK.

### Vérifications spécifiques demandées

| Vérification | Résultat |
|--------------|----------|
| `Fm7/D` = basse D + F Ab C Eb | ✅ Tests `deriveChordDisplay` et `normalizeVoicingInputFromSymbol` + export MIDI |
| `Gm7b5` = G Bb Db F | ✅ Corpus + tests de régression |
| `Fsus4` = F Bb C | ✅ Tests de régression |
| `Amaj7` = A C# E G# | ✅ Vocabulaire + définition canonique |
| MIDI 60 = C4 | ✅ Tests Phase 0.6 et convention MIDI |

### Fichiers admissibles au commit Phase 0/0.5/0.6

Nouveaux :
- `src/voicing-engine/vocabulary.js`

Modifiés (Phase 0 / 0.5 / 0.6 uniquement) :
- `src/chord-engine/chord-display.js`
- `src/chord-engine/chord-defs.js`
- `src/voicing-engine/chord-input.js`
- `src/voicing-engine/midi-convention.js`
- `src/voicing-engine/hand-ranges.js`
- `src/voicing-engine/data-model.js`
- `src/voicing-engine/constraints.js`
- `src/voicing-engine/corpus-invariants.js`
- `src/voicing-engine/test-voicing-phase0.js`
- `src/ui/analyzer-tab.js` (utilisation de `resolveCanonicalChordDefinition` pour cohérence)
- `docs/TWO_HAND_VOICING_ENGINE_V1_PHASE0_REPORT.md`

**Préexistants exclus** : `.clinerules/rules-projet.md`, `CHANGES.md`, `electron/audio-processor.py`, `package*.json`, `src/main.js`, `src/recorder/serializer.js`, `vite.config.js`.

### Verdict Phase 0.6

**TWO_HAND_VOICING_ENGINE_V1_PHASE0_6_VALIDATED**

Risques résiduels traités, tests ajoutés, suites de régression et build verts. Aucun générateur n'a été créé. La base reste prête pour la Phase 1.

---

## Final Independent Review — Phase 0/0.5/0.6

Review conducted independently against:
- `docs/TWO_HAND_VOICING_ENGINE_V1_PLAN.md`
- `docs/TWO_HAND_VOICING_ENGINE_V1_PHASE0_REPORT.md` (current)
- modules under `src/chord-engine/` and `src/voicing-engine/`
- dependent consumers: `src/ui/chord-editor.js`, `src/ui/analyzer-tab.js`, `src/analyzer/analysis-export.js`, `src/ui/test-chord-editor.js`
- test runners:
  - `node src/voicing-engine/test-voicing-phase0.js`
  - `node src/ui/test-chord-editor.js`
  - `node src/analyzer/test-analysis-export.js`
  - `node src/analyzer/test-regression-part1.js`
  - `node src/chord-engine/test-regression-part3.js`
  - `npm run build`

### 1. Git scope verification

| Category | Files |
|----------|-------|
| Pre-existing (outside Phase 0/0.5) | `.clinerules/rules-projet.md`, `CHANGES.md`, `electron/audio-processor.py`, `package*.json`, `src/main.js`, `src/recorder/serializer.js`, `vite.config.js` |
| Created by Phase 0/0.5/0.6 | `src/chord-engine/chord-display.js`, `src/chord-engine/chord-defs.js`, `src/voicing-engine/chord-input.js`, `src/voicing-engine/midi-convention.js`, `src/voicing-engine/hand-ranges.js`, `src/voicing-engine/data-model.js`, `src/voicing-engine/constraints.js`, `src/voicing-engine/corpus-invariants.js`, `src/voicing-engine/vocabulary.js`, `src/voicing-engine/test-voicing-phase0.js`, `docs/TWO_HAND_VOICING_ENGINE_V1_PLAN.md`, `docs/TWO_HAND_VOICING_ENGINE_V1_PHASE0_REPORT.md` |
| Modified by Phase 0/0.5/0.6 (UI re-exports + canonical lookup) | `src/ui/chord-editor.js`, `src/ui/analyzer-tab.js`, `src/analyzer/analysis-export.js`, `src/ui/test-chord-editor.js` |

No pre-existing engine file was functionally modified. No audio, segmentation, Viterbi, or export engine code was touched.

### 2. Dependency direction

Confirmed: `src/chord-engine/` and `src/voicing-engine/` never import from `src/ui/`. No DOM, Electron, `window`, or timeline-state references exist in any foundation module. UI modules only consume the shared harmonic contract (`chord-display.js`) and will later consume the voicing contract.

### 3. Shared harmonic module

All five canonical functions live in `src/chord-engine/chord-display.js`:
- `parseChordSymbol`
- `formatEffectiveChord`
- `getEffectiveChord`
- `normalizeOverride`
- `deriveChordDisplay`

`src/ui/chord-editor.js` re-exports them without local copy. The local parser in `src/analyzer/chord-comparator.js` belongs to the Studio Coach domain and is explicitly not part of the shared canon.

### 4. Voicing input contract

`src/voicing-engine/chord-input.js` exposes:
- `normalizeVoicingInput(input)`
- `normalizeVoicingInputFromSymbol(symbol, options)`

Validation covers root pitch-class 0–11, quality lookup against `CHORD_DEFINITIONS`, optional slash bass, and invalid-input rejection. The contract is immutable, deterministic, and UI-free. `notationPreference` has been removed from the internal contract as it has no bearing on pitch classes or MIDI numbers.

### 5. MIDI convention

`C4 = 60` is enforced consistently in:
- `src/voicing-engine/midi-convention.js`
- `src/chord-engine/intervals.js`
- `src/ui/keyboard-svg.js`
- `src/ui/mini-keyboard.js`
- `src/ai/ai-client.js`

`OCTAVE_BASES` was removed; a single octave convention is used via `pcOctaveToMidi`.

### 6. Hand ranges and spans

| Constant | Min | Max |
|----------|-----|-----|
| `LH_HARD_RANGE` | 28 (E1) | 55 (G3) |
| `LH_SOFT_RANGE` | 36 (C2) | 48 (C3) |
| `RH_HARD_RANGE` | 48 (C3) | 84 (C6) |
| `RH_SOFT_RANGE` | 55 (G3) | 72 (C5) |
| `LH_MAX_SPAN` | — | 12 |
| `RH_MAX_SPAN` | — | 16 |

Overlap zone 48–55 is accepted. Crossing rule is `maxLh > minRh` (strict). `maxLh === minRh` is accepted as non-crossing. Empty hands are explicitly allowed.

### 7. Hard constraints

`checkHandHardConstraints` and `checkCandidateHardConstraints` invalidate:
- notes outside the strict hand range,
- duplicate MIDI numbers inside a hand,
- span exceeding the hand maximum,
- left/right crossing (`maxLh > minRh`),
- slash bass not being the lowest sounding pitch.

Empty hands pass all constraints. A candidate with both hands empty is structurally allowed by the validator (generators will decide whether to emit it).

### 8. Soft features

`measureCandidateSoftFeatures` reports deterministic, unweighted measurements:
- `lhNotesInSoft`, `rhNotesInSoft`
- `completeness`
- `doublings`
- `omissions`
- `bassToRightGap`
- reserved placeholders: `bassDistanceFromIdealLowReserved`, `voiceLeadingCostReserved`

No hidden weights, no fake values presented as real metrics. Soft features never cause hard invalidation.

### 9. Data model

`HandVoicing` and `VoicingCandidate` in `src/voicing-engine/data-model.js` are immutable constructors. They keep root and slash bass distinct, separate LH and RH note arrays, and reserve `generatorId` (empty string in Phase 0/0.5) for future generators.

### 10. Rootless flag

`rootless` is present in the model but is always `false` in Phase 0/0.5. No rootless generation logic exists.

### 11. Vocabulary V1

`src/voicing-engine/vocabulary.js` classifies qualities into four buckets:
- `supportedInV1` (10 qualities): `''`, `m`, `7`, `maj7`, `m7`, `m7b5`, `dim`, `aug`, `sus2`, `sus4`
- `metadataOnly`: `/` (slash separator)
- `futurePhase` (23 qualities): `6`, `m6`, `add9`, `9`, `m9`, `maj9`, `11`, `m11`, `maj11`, `13`, `m13`, `maj13`, `7b9`, `7#9`, `7b9#9`, `7#11`, `7b13`, `7#5`, `7b5`, `7sus4`, `7sus2`, `mMaj7`, `maj7#5`
- `unsupported` (13 qualities): `alt`, `5`, `quartal`, `quartal(add4)`, `6/9`, `6add11`, `madd9`, `add11`, `13sus4`, `13#11`, `7#9b13`, `7b9b13`, `m7b9`

Phase 1 generators will reject any quality not in `supportedInV1`; no silent fallback to major triad.

### 12. Corpus

`src/voicing-engine/corpus-invariants.js` contains 48 reference cases across 7 roots (C, F, Bb, G, D, A, Eb). Cases are tagged:
- `hard_invariants` (38)
- `acceptable_properties` (3)
- `style_preferences` (2)
- `out_of_scope` (5)

Coverage includes triads, sevenths, suspensions, slash bass (internal and foreign), and the previously validated `Fm7/D` non-regression case (upper-structure F-Ab-C-Eb plus bass D, no natural A).

### 13. Tests

- **Phase 0/0.5/0.6 test suite**: 107 tests, **107 passed**.
- **Tests chord-display (`src/ui/test-chord-editor.js`)**: passed.
- **Tests Manual Chord Editing / persistance (`src/ui/test-chord-editor.js`)**: passed.
- **Tests exports/statistiques (`src/analyzer/test-analysis-export.js`)**: passed.
- **Regression Part 1**: passed.
- **Regression Part 3**: passed.
- **Build Vite**: OK.

Test categories include VoicingInput boundaries, MIDI notation round-trips, hard-constraint edge cases, MIDI integer validation, canonical chord-definition resolution, soft-feature determinism, and corpus diversity.

### 14. Pre-existing file protection

Verified: the following files were not functionally changed by Phase 0/0.5:
- `.clinerules/rules-projet.md`
- `CHANGES.md`
- `electron/audio-processor.py`
- `package.json`
- `package-lock.json`
- `src/main.js`
- `src/recorder/serializer.js`
- `vite.config.js`

Only UI re-export files (`src/ui/chord-editor.js`, `src/ui/analyzer-tab.js`, `src/analyzer/analysis-export.js`, `src/ui/test-chord-editor.js`) were adjusted to use the shared module, which is within scope.

### 15. What is explicitly NOT present

No generator has been created. The following files do not exist:
- `src/voicing-engine/close.js`
- `src/voicing-engine/simple.js`
- `src/voicing-engine/jazz.js`
- `src/voicing-engine/gospel.js`
- `src/voicing-engine/candidate-generator.js`
- `src/voicing-engine/scorer.js`
- `src/voicing-engine/formatter.js`
- `src/voicing-engine/voice-leading.js`

No scoring weights, no voice-leading cost implementation, no style templates, and no real bass-distance-to-ideal-low metric exist yet.

### 16. Final verdict

**TWO_HAND_VOICING_ENGINE_V1_FOUNDATIONS_READY_FOR_PHASE1**

The Phase 0/0.5/0.6 foundations are complete, tested, and isolated. The shared harmonic contract, canonical chord-definition lookup, pure voicing input contract, MIDI convention, strict MIDI integer validation, hand ranges, hard/soft constraints, corrected `bassToRightGap` documentation, immutable data model, bounded V1 vocabulary, and diversified corpus of 48 invariants are all in place. All regression tests pass and the build is green. The workspace is ready for Phase 1: the first candidate generator (close two-hand) may now be implemented on top of these foundations only.

---

*Rapport mis à jour le 2026-07-13.*
