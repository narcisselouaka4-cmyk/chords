---
name: voicing-engine-vault
description: Mémoire de l’état, des règles, des erreurs et des décisions pour le moteur de voicings piano-jazz-chords.
metadata:
  type: project
---

# Vault — Moteur de voicings `piano-jazz-chords`

> Dernière mise à jour : session continue suite compaction. État fiable priorisé par rapport à la couverture.

## Journal

### 2026-09-23 — Répartition des mains corrigée pour les familles compactes

- Bug signalé : C7 four-way close produisait LH C2 (36) et RH C4 E4 G4 Bb4 (60–70), écart de ~2 octaves entre les mains.
- Cause : `generateClose` / `generateFourWayClose` centraient le RH dans sa tessiture douce mais la basse restait en LH soft basse, créant un trou musical.
- Corrections :
  - ajout de `buildBassBelow(input, referenceMidi)` dans `src/voicing-engine/generators/base-generator.js` : place la basse une octave sous le RH, contrainte à `LH_HARD_RANGE` ;
  - `generateClose`, `generateFourWayClose`, `generateBlock` construisent le RH autour du centre doux (`defaultRhCenter() = 60`) puis placent la basse juste en dessous ;
  - `generateDrop2` et `generateDrop3` itèrent sur tout le range RH dur, acceptent uniquement les positions où la basse ET la note descendue restent dans `LH_HARD_RANGE`, et privilégient l’écart LH/RH le plus compact ;
  - `buildRightHandClose` impose désormais que la note la plus basse du RH soit dans `RH_SOFT_RANGE` (≥ 55) et pénalise les écarts LH/RH trop larges, évitant que shell/stride/open tombent une octave trop bas.
- Mise à jour de `src/voicing-engine/fixtures/REFERENCE_VOICINGS.json` avec les nouvelles positions des 9 accords obligatoires.
- Validation : tests catalogue **57/57**, exercices **237/237**, `npm run test:chords` **98/98**, `npm run build` OK.

### 2026-09-23 — Généralisation de la répartition compacte à tous les accords

- Extension de la règle « basse collée sous le RH » à `shell` et `twoNoteShell` : le RH est d’abord centré autour de 60, puis la basse est placée juste en dessous via `buildBassBelow`.
- `buildRightHandClose` distingue deux modes :
  - sans basse connue (`bassMidi = -Infinity`) : le RH peut descendre dans le hard range pour permettre une basse compacte ;
  - avec une vraie basse (`bassMidi >= LH_HARD_RANGE.min`) : le RH reste dans `RH_SOFT_RANGE` pour garder un registre confortable.
- `generateDrop2` / `generateDrop3` : recherche sur tout le range RH dur, accepte uniquement les positions où la basse et la note descendue tiennent dans `LH_HARD_RANGE`, privilégie le plus petit écart LH/RH.
- Correction de la fixture `REFERENCE_VOICINGS.json` : la structure était devenue invalide (`accords[sym]` contenait le catalogue entier au lieu de `familyId -> { lh, rh, ... }`). Régénération propre avec la bonne structure.
- Résultat : tests catalogue **116/116** (toutes les familles sont maintenant vérifiées note par note), exercices **237/237**, `npm run test:chords` **98/98**, `npm run build` OK.

### 2026-09-23 — Vault créé + retrait du catalogue d’Analyse

- Création du Vault `.obsidian/voicing-engine-vault.md`.
- Pointeur ajouté dans la mémoire Claude : `piano-jazz-voicing-engine-vault.md`.
- Catalogue de voicings retiré de l’onglet **Analyse** :
  - suppression de la section `#analyzer-voicing-preview` dans `src/index.html` ;
  - suppression de `renderVoicingCatalog` dans `src/ui/voicing-preview.js` ;
  - `updateVoicingPreviewForChord` réduit à un simple aperçu textuel via `generateSingleVoicing` ;
  - retrait de tous les appels voicing-preview dans `src/ui/analyzer-tab.js`.
- Validation : `npm run build` OK ; tests catalogue (64/64) et exercices (237/237) passent.

### 2026-09-23 — Continuité de registre corrigée

- Ajout de `validateRegisterContinuity` dans `src/voicing-engine/utils/voicing-utils.js`.
- Intégration dans `validateVoicing` via `spec.allowsRegisterGaps`.
- Règle appliquée **par main** : chaque main doit couvrir toutes les octaves entre sa note la plus basse et sa note la plus haute. Le passage LH/RH n’est pas un trou.
- `allowsRegisterGaps` ajouté au type `VoicingFamilySpec` pour les futures familles stride/walking bass.
- Validation : `npm run build` OK ; tests catalogue (64/64) et exercices (237/237) passent.

### 2026-09-23 — Drop 3 implémenté

- Ajout de `generateDrop3` dans `src/voicing-engine/generators/family-generators.js`.
- Ajout de `validateDrop3` dans `src/voicing-engine/validators/family-validators.js`.
- Spec `drop3` activée (`isApplicable`) dans `src/voicing-engine/families/specifications.js`.
- Définition formelle ajoutée dans `FORMAL_DEFINITIONS.md`.
- Validation manuelle sur les 9 accords obligatoires : Drop 3 disponible pour tous.
- Validation : `npm run build` OK ; tests catalogue (64/64) et exercices (237/237) passent.

### 2026-09-23 — Familles Phase 4 implémentées

- Implémentation des générateurs `generateBlock`, `generateStride`, `generateOpen`, `generateSpread`, `generateQuartal`, `generateSoWhat`, `generateUpperStructure` dans `src/voicing-engine/generators/family-generators.js`.
- Implémentation des validateurs correspondants dans `src/voicing-engine/validators/family-validators.js`.
- Ajout de `generateNonRootRoleCandidates` pour éviter les doublons de fondamentale entre LH et RH dans les familles stride/open/spread.
- Correction de `validateRegisterContinuity` : appliquée uniquement intra-main ; le trou entre LH et RH est autorisé.
- Correction de la règle de span main-droite : ajout de `handRangeOptions` dans les specs pour autoriser des spans larges (open, spread, quartal) sans relâcher les autres familles.
- Correction d’un bug d’infini dans `rotateCloseStack` (`midi-placement.js`) : la première note de chaque rotation est désormais fixée à `src`.
- Mise à jour de `src/voicing-engine/fixtures/REFERENCE_VOICINGS.json` avec les sorties des nouvelles familles sur les 9 accords obligatoires.
- Mise à jour de `src/voicing-engine/test-voicing-catalog.js` : assertions structurelles pour drop3, block, stride, open, spread, quartal, soWhat, upperStructure ; invariant sur l’indisponibilité de `drop2Plus4` ; raison explicite pour les familles unavailable.
- Résultat : tests catalogue **137/137** et exercices **237/237** passent.

## Principe directeur

**Fiabilité avant couverture.**
Un accord → une famille demandée → un algorithme familial spécifique → un candidat → un validateur familial strict → affichage uniquement si valide.
Aucune permutation arbitraire de notes ne peut être étiquetée d’une famille.

## Pipeline

1. Résolution des rôles depuis les définitions canoniques d’accords (intervalles bruts pour éviter l’ambiguïté modulo 12).
2. Détermination des familles applicables (`applicableFamilies`).
3. Génération par algorithme familial dédié (`FAMILY_GENERATORS`).
4. Validation générique puis validation familiale (`FAMILY_VALIDATORS`).
5. Calcul de difficulté seulement après validation.
6. Affichage dans **Entraînement → Exercices** ; catalogue retiré d’Analyse.

## Familles

### Implémentées (14)

| Famille | Fichier | État | Notes |
|---|---|---|---|
| `shell` | `family-generators.js` | OK | LH root/bass, RH 3+7 + extension optionnelle (9→13→11→5). |
| `twoNoteShell` | `family-generators.js` | OK | LH root/bass, RH exactement 3+7. |
| `rootlessA` | `family-generators.js` | OK | RH 3-5-7-9, LH vide. |
| `rootlessB` | `family-generators.js` | OK | RH 7-3-5-9, LH vide. Souvent non applicable (span > 12). |
| `close` | `family-generators.js` | OK | Notes empilées par rôle dans une octave (span ≤ 12). |
| `fourWayClose` | `family-generators.js` | OK | 4 voix distinctes, root+3+7 + 5 ou extension. |
| `drop2` | `family-generators.js` | OK | Dérivé d’un 4-way close valide, baisse de la 2ᵉ voix du haut d’une octave. |
| `drop3` | `family-generators.js` | OK | Dérivé d’un 4-way close valide, baisse de la 3ᵉ voix du haut (2ᵉ depuis le bas) d’une octave. |
| `block` | `family-generators.js` | OK | 5 voix en close, 2 graves en LH, 3 aiguës en RH, span total ≤ 12. |
| `stride` | `family-generators.js` | OK | Basse lointaine LH + accord compact RH, écart ≥ 12. |
| `open` | `family-generators.js` | OK | Close dont une voix est montée d’une octave (span RH > 12). |
| `spread` | `family-generators.js` | OK | Notes réparties sur ≥ 3 octaves en RH. |
| `quartal` | `family-generators.js` | OK | Chaîne de quartes (écarts 5-7) sur les accords sus/11. |
| `soWhat` | `family-generators.js` | OK | Stack quartal décalé sur m7/m9 avec 11e. |
| `upperStructure` | `family-generators.js` | OK | Triade majeure/mineure/dim/aug dont les 3 notes appartiennent à l’accord dominant. |

### Manquantes / volontairement non implémentées (1)

- `drop2Plus4` — volontairement non implémenté : descendre la 2ᵉ et 4ᵉ voix depuis le haut du close impliquerait de descendre la voix la plus basse, déjà en LH, créant un doublon fondamentale interdit.

## Accords obligatoires (9)

Référence : `src/voicing-engine/fixtures/REFERENCE_VOICINGS.json`.

1. `G13`
2. `C7`
3. `Dm7`
4. `Fmaj7`
5. `Cm7`
6. `G7#9`
7. `F#7#11`
8. `F#7#9#11`
9. `Fmaj13#11`

## Règles de répartition des mains

### Ranges MIDI

- **LH hard** : 28–55
- **LH soft** : 36–48
- **RH hard** : 48–84
- **RH soft** : 55–72

### Continuité de registre

Pour chaque main, les octaves comprises entre la note la plus basse et la note la plus haute de cette main doivent contenir au moins une note. Le passage entre LH et RH est un changement de main, pas un trou de registre. Les familles avec justification musicale explicite de trou d’octave interne (stride, walking bass) peuvent désactiver cette règle via `allowsRegisterGaps`.

> Exemple problématique corrigé : CmMaj7 Close ne doit pas produire RH C4 D#4 B4 (octave 5 vide entre C4 et B4).

### Comptage de voix

Compte des pitch classes uniques avec scope :

- `all` : toutes les notes
- `rightHand` : main droite seule
- `chordVoices` : notes de l’accord (pas la basse slash externe)

## Difficulté

`computeDifficulty` dans `generate-voicing-catalog.js` :

- Base = 1
- +1 si RH ≥ 3 notes (sauf `twoNoteShell`)
- +1 si RH ≥ 4 notes **et** famille `close`
- +1 si qualité contient 9/11/13 non altérés (sauf `twoNoteShell`, `rootlessA`)
- +1 par altération (`#` ou `b` avant 9/11/13/5)
- +1 si `metadata.rootless`
- Plafond à 5

## Points d’attention / limitations actuelles

1. `rootlessB` est souvent unavailable car la pile 7-3-5-9 dépasse souvent une octave. C’est volontaire (fiabilité).
2. La technique `rootless` dans les exercices est mappée uniquement sur `rootlessA`.
3. `drop2Plus4` reste volontairement non implémenté (doublon LH).
4. Le calcul de difficulté est symbolique, pas basé sur l’étendue physique réelle.
5. Les familles stride/open/spread utilisent des rôles non-fondamentaux incluant la quinte pour atteindre le nombre de voix requis sans doublon de fondamentale inter-main.

## Fichiers clés

- `src/voicing-engine/families/FORMAL_DEFINITIONS.md` — source musicale de vérité.
- `src/voicing-engine/families/specifications.js` — specs applicables des familles.
- `src/voicing-engine/generators/family-generators.js` — algorithmes de construction.
- `src/voicing-engine/validators/family-validators.js` — validateurs familiaux.
- `src/voicing-engine/generate-voicing-catalog.js` — orchestrateur et difficulté.
- `src/voicing-engine/fixtures/REFERENCE_VOICINGS.json` — oracle des 9 accords obligatoires.
- `src/practice-exercise.js` — intégration dans Entraînement → Exercices.

## Prochaines étapes

1. [x] Corriger la continuité de registre dans les validateurs génériques.
2. [ ] Construire la bibliothèque C famille par famille (référence VoicingLab).
3. [x] Implémenter les familles Phase 4 ou les marquer unavailable explicitement.
4. [x] Ajouter des tests C couvrant toutes les familles et enrichissements.
5. [x] Valider les 9 accords obligatoires après chaque implémentation.
6. [x] Mettre à jour ce Vault après chaque changement significatif.
