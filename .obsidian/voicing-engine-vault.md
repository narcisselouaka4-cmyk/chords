---
name: voicing-engine-vault
description: Mémoire de l’état, des règles, des erreurs et des décisions pour le moteur de voicings piano-jazz-chords.
metadata:
  type: project
---

# Vault — Moteur de voicings `piano-jazz-chords`

> Dernière mise à jour : session continue suite compaction. État fiable priorisé par rapport à la couverture.

## Journal

### 2026-09-24 (soir) — Voicings 11e / 13e / altérés contrôlés d'après les manuels, Mouvement 12 tons refait

- **Doute de Narcisse** : « Bmaj13 en close position = MG B3 D#4, MD A#4 G#5 ? ». C'est bien ce que l'app affichait (close VoicingLab B4 D#5 A#5 G#6, descendu d'une octave), mais ce n'est **pas** une close position : 21 demi-tons, alors qu'une close tient dans une octave (définition recoupée : The Jazz Piano Site, Learn Jazz Standards, piano.org, PianoGroove, Piano With Jonny, Wikipedia — lus via la recherche web, l'accès direct aux sites étant bloqué dans la session cloud).
- **Audit** (périmètre fixé par Narcisse : 11e, 13e et tous les altérés #11 / b9 / #9 / b13 / #5 / b5 / alt) : 3 643 voicings servis, ~1 100 non conformes. VoicingLab empile 1-3-7-13 dans l'ordre des tierces : Close, Drop 3 et Block de toutes les 11e / 13e / 7#11 / 7b9 / 7#9 faux ; upper structures de 13, 7b9 et alt avec la 11 juste contre la tierce (D13 = triade de Sol sur D7) ; Open de 7#5 / 7b13 avec quinte juste + #5 (9e mineure) ; voicings sous les limites graves de Levine (dont certains créés par mon recentrage de registre).
- **Décision de Narcisse : reconstruire.** Nouveau module `src/voicing-engine/textbook-voicings.js` : définitions des familles (close, drop 2/3/2-4, four-way close, block, rootless A/B, spread, open, So What, upper structure), limites d'intervalle grave (Levine), 9e mineure interdite (sauf b9 sur la fondamentale d'un accord b9), 11 juste + tierce majeure interdite, échelles d'accord des dominantes. `practice-exercise.js` (`conformOrRebuild`) garde les voicings VoicingLab conformes et reconstruit les autres **sur les mêmes notes** (upper structures : triades II, bIII, bV, bVI, VI, bVII, IV dans l'échelle de l'accord). Marqués « Reconstruit d'après les manuels (VoicingLab : …) » sur la carte.
  - Bmaj13 close → B3 D#4 G#4 A#4 ; Dm11 close → D4 F4 G4 C5 ; C7b9 upper structure → triades Gb et A ; C7alt → Gb et Ab ; Bmaj13 drop 2-4 désormais proposé (VoicingLab : 13e à la basse).
  - Upper structure barré pour les 13 simples (aucune triade du manuel sans b9 ni #11).
  - Registre : la descente d'octave s'arrête avant de passer sous une limite grave, un voicing publié trop grave remonte ; main gauche des clusters entre Fa2 et Mi3. Hors périmètre, seuls changent des voicings que mon recentrage rendait boueux.
  - Hors périmètre (7e, 9e, 6, add, m7b5, dim7) : inchangé, « on verra plus tard ».
- **Mouvement 12 tons** (demandes de Narcisse) :
  - Bug de niveau : `upgradeQualityForDifficulty` lisait la difficulté d'un palier comme un jeton de mouvement (« m9 » → illisible → 5★) : seul le niveau 5 enrichissait les accords. Le menu affichait « Avancé » mais le moteur était au niveau 3 → 7e simples. Corrigé (palier du chemin = niveau) ; défaut **Intermédiaire** (11e / 13e) ; chaque niveau change les qualités (7e, 9e, 11e/13e, #9/#11, alt).
  - Saut direct : clic sur un accord de la liste (`goToStep`) ou sur une tonalité de la frise (`goToKey`), sans essai ni point.
  - Tonalité en cours en tête du panneau de droite (et au-dessus de l'accord) ; réglages du tour à gauche en grille étiquette / contrôle : Niveau, Tonalités (12 bascules), Ordre (chromatique, quartes, quintes), Départ.
  - Bibliothèque : fenêtre Astra centrée (comme Sessions MIDI / Coach / Pédagogie), cartes en grille.
  - Textes des 12 mouvements réécrits en degrés (justes dans toute tonalité et tout niveau) ; noms faux corrigés : « IV-V-vi-ii pop » (jouait vi-ii), « Turnaround III-VI-II-V-I » (rien de chromatique), « Emprunt bIIImaj7 » (bIII n'est pas un sous-dominant mineur). Barry Harris : « les deux accords partagent presque toutes leurs notes » était faux (aucune note commune).
- **Mode Progression retiré** (décision de Narcisse : il choisissait seul extensions et altérations). « Ma grille » (bibliothèque) : accords tapés en symboles, joués comme un mouvement dans les tonalités choisies, qualités gardées telles quelles ; tonalité de lecture déduite (dernier accord si tonique mineure, sinon gamme majeure qui contient le plus de fondamentales) ; accords impossibles ignorés et annoncés.
- Validation : exercices **438/438**, parseur 51/51, Copilot 126/126, test:chords 98/98, Parties 1 et 3 OK, D2 10/10, test-training-dom 11 échecs voulus, build OK, essai Chromium (sombre et clair) sans erreur. Échecs préexistants inchangés : test-coach-dom (2), test-load-session (window), test-voicing-preview (1), test-skin-manager (2).

### 2026-09-24 (suite) — Registre étendu à toutes les familles, parseur 6/9, tests UI

- **Registre** (demande de Narcisse : « étends la règle aux autres familles ») : même principe que Drop 3 (le voicing entier descend d'une octave tant que son milieu dépasse un plafond), plafond par famille, choisi sur les données des 12 tons :
  - Do4 (60) : Shell, Two-note shell, Stride — main gauche seule avec la basse (Shell de Gmaj7 : G3 B3 F#4 → G2 B2 F#3 ; Stride de Cmaj7 en Do : G3 E4 G4 B4 → G2 E3 G3 B3).
  - Mi4 (64) : Rootless A/B — sans fondamentale, autour du Do central (Gmaj7 reste B3 D4 F#4 A4 ; à Do4 il tomberait à B2).
  - Mi5 (76) : 4-way close — les renversements publiés en Do avec la mélodie à G5 ne bougent pas.
  - Do5 (72) : toutes les autres familles à deux mains ou main droite (Drop 2/3/2-4, Close, Block, Spread, Open, Quartal, So What, Upper structure, Cluster avant ajout de sa main gauche).
  - Résultat : plus aucun dessus au-delà de D#6, aucune main gauche au-dessus de C#5, jamais de chevauchement des mains ; en Do seuls bougent des Drop 3 d'accords enrichis (20) et des Stride à basse sur la quinte (30). Bmaj7 Drop 2 : D#5 | A#5 B5 F#6 → D#4 | A#4 B4 F#5.
  - Règles écartées (mesures) : ±6 demi-tons autour de la version en Do (dessus jusqu'à D#6), plafond = plus aigu publié en Do (rootless B jusqu'à B1), bande d'une octave depuis le plus grave en Do (Close / Block jusqu'à C#6).
  - Effet de bord voulu : un Drop 2 de Fmaj7 devient identique à un Spread (F3 | C4 E4 A4) ; la recherche par top note ne garde qu'une fois un doublon exact (5 voicings avec La au sommet au lieu de 6).
- **Parseur** (`chord-parser-v2.js`) : « C6/9 » était coupé au « / » en C6 + basse « 9 » (illisible) → la 9e disparaissait (Copilot IA compris). Seul un nom de note fait une basse ; « 6/9 » et « m6/9 » normalisés en « 69 » / « m69 » (Tonal). C/E, Dm7/G, C6/9/E corrects ; « C/X » garde l'ancien repli (C).
- **Tests UI** : `test-workspace-navigation-d2.js` 10/10 (« Nouvel exercice » remplacé par « Bibliothèque » le 23/09 ; enveloppe Astra `#practice-body` entre la scène et l'onglet). `test-training-dom.js` décrivait une refonte rail + tiroirs jamais committée (révoquée le 02/09, JOURNAL-REFONTE.md) : assertions retirées ou remplacées par l'interface réelle (onglets, sous-navigation, vues dédiées Astra, panneau Techniques repliable, pédale testée par son comportement). Restent 11 échecs voulus : panneau Suggestions et affichage de l'historique des accords, jamais branchés — décidé le 24/09 : Temps réel n'est pas modifié, échecs laissés volontairement.
- Test instable corrigé : `checkTechniqueSwitch` tirait parfois un accord sans Close fidèle (7#9b13, 13#11, maj13#11 : 36 tirages sur 492).
- Validation : exercices **414/414**, parseur **51/51**, Copilot OK, catalogue 120 ✓, test:chords 98/98, Parties 1 et 3 OK, build OK, essai Chromium sans erreur.

### 2026-09-24 — Mouvements réparés, Drop 3 recentrés, validation sur l'accord annoncé

- **Mouvements remplacés en silence** (signalés par Narcisse) :
  - « II-V-I altéré en mineur » : motif `2m7b5-b5alt-1m` → `2m7b5-5alt-1mMaj7`. Le `b` de `b5alt` altère le DEGRÉ (Gb7alt en Do) ; `1m` = triade mineure, absente de VoicingLab → mouvement impossible sauf au niveau 5. Désormais Dm7b5 → G7#9b13 → CmMaj7 (= accords d'exemple du mouvement), 12 tons × 5 niveaux.
  - « Cycle de tierces majeures » : `6b7` donnait la qualité inconnue « b7 » → impossible partout. Reconstruit en vrai cycle de Coltrane : Cmaj7 Eb7 Abmaj7 B7 Emaj7 G7 Cmaj7 (nom, id `coltrane-changes-frag-1` et contexte le promettaient ; les anciens exemples Cmaj7 Em7 Eb7 Dm7 ne formaient pas un cycle de tierces).
  - Même défaut de jeton, sans remplacement visible : « Tritone substitution V7 » jouait Dbm7 (→ Db7) et « V/V vers I » Dm7 (→ D7).
  - Syntaxe : les jetons de mouvement acceptent `degré:qualité` (comme les progressions) quand la qualité commence par un chiffre (`b3:7`, `7:7`).
  - Plus de remplacement silencieux : mouvement ou progression impossible → `notice` affichée dans la bulle de retour (nom, accord fautif, remplaçant). Test : toute la bibliothèque se construit dans les 12 tons × 5 niveaux.
- **Drop 3 trop aigus** : VoicingLab publie chaque ton en transposant Do vers le haut (+0 à +11), et ses Drop 3 d'accords enrichis sont déjà très aigus en Do (C9 : MG C5 D5, MD E6 A#6). Dans l'Exercice, un Drop 3 descend d'une octave tant que son milieu (grave + aigu) / 2 dépasse Do5 (`withPlayableRegister`, `octaveShift` sur le voicing, info-bulle « une octave plus bas que VoicingLab »). Notes, écarts et mains inchangés ; les Drop 3 d'accords de 4 sons en Do ne bougent pas. Dessus max C7 → D#6, voicings au-dessus de C6 : 435 → 15, MG max B5 → A#4. Le référentiel `voicinglab-reference.json` n'est pas modifié.
- **Validation** : `check()` comparait le jeu à `detectChord(voicing affiché)`. 61 % des voicings affichés (4 859 / 7 969) sont lus comme un autre accord : un vrai C6 était refusé (« Vous avez joué C6. Cible : C6 ») et un La mineur accepté comme C6. Désormais `judgeAnswer` : juste si le jeu rejoue le voicing affiché (mêmes classes de hauteur, même basse), si le détecteur nomme exactement l'accord annoncé, ou si `realizesChord` (notes définissantes présentes, aucune note étrangère à l'accord ni au voicing affiché, ≥ 3 notes avec fondamentale / ≥ 4 sans, basse = 1, 3 ou 5 si la fondamentale est jouée). `main.js` : un accord que le détecteur ne sait pas nommer (« ? ») est validé s'il est juste.
- **Progression tapée en symboles** (`setCustomProgression`, API sans champ dans l'UI) : la qualité venait du nom Tonal (« major seventh ») → aucun voicing → remplacée en silence. Qualité tapée gardée si l'app la connaît, sinon conversion du nom Tonal (CM7, C-7, Cø7, C°7, CmM7, C69) ; accords impossibles ignorés et annoncés.
- Validation : exercices **404/404**, catalogue 120 ✓, `npm run test:chords` **98/98**, Parties 1 et 3 OK, Copilot (voicing 126/126, client 90/90, validation 78/78…) OK, `npm run build` OK ; essai réel Chromium de l'onglet Exercices (mouvements choisis affichés tels quels). Échecs préexistants et inchangés : `src/ui/test-training-dom.js` (47) et `tests/ui/test-workspace-navigation-d2.js` (8/10).

### 2026-09-23 — Alignement VoicingLab sur la catégorie C

- Lecture du CSV `voicinglab-C-5-familles-2026-09-23.csv` (862 voicings C, 5 familles de base × extensions/altérations).
- Script de comparaison créé dans `.claude/jobs/.../compare-voicinglab-c3.mjs` : regroupement par `(accord, famille)` et vérification que le moteur produit au moins un équivalent VoicingLab (classes de hauteur ou position exacte).
- Premier constat : de nombreux écarts viennent de définitions différentes (ex. VoicingLab `close`/`block` tolèrent des spans > 12 ; notre moteur reste strict à une octave) ou de familles non implémentées (`cluster`, `drop2Plus4`).
- Ajustements effectués :
  - `buildBassBelow` : la basse est désormais l’instance de fondamentale **immédiatement inférieure** au RH, et non la plus proche d’une octave théorique. Cela corrige des basses à 2 octaves de distance dans `twoNoteShell`.
  - `twoNoteShell` : alignement VoicingLab — root + une seule guide tone (3e ou 7e), choisie selon le meilleur centrage/compactage. Mise à jour de la spec (`minVoices: 2`, `maxVoices: 2`) et du validateur.
  - `generateShell` : ordre des candidates inversé pour privilégier le shell minimal (3e + 7e) avant d’ajouter une extension.
- Résultat de la comparaison sur 420 groupes (accord/famille) :
  - exactMatch = 26, pcMatch = 52, noMatch = 100, engineUnavailable = 242.
  - Correspondance exacte + classes de hauteur : 78/420 ≈ 18,5 % (limitée par les familles absentes et les définitions divergentes).
  - `twoNoteShell` : 50 % de correspondance exacte (18/36 groupes).
  - `shell` : 24 % (8/34 exacts).
- Mise à jour de `REFERENCE_VOICINGS.json` et du test structurel `assertIsTwoNoteShell`.
- Validation : tests catalogue **116/116**, exercices **237/237**, `npm run test:chords` **98/98**, `npm run build` OK.

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
6. Registre (2026-09-24) : toutes les familles sont recentrées dans l'Exercice (`withPlayableRegister`, plafond du milieu par famille : Do4 Shell / Two-note shell / Stride, Mi4 Rootless, Mi5 4-way close, Do5 pour le reste). Le référentiel VoicingLab n'est pas modifié ; `voicing.octaveShift` et l'info-bulle signalent le décalage.
7. Exercice : la cible d'une réponse est toujours l'accord ANNONCÉ. `detectChord` nomme ce qui est joué (message « Vous avez joué … ») et n'accepte une réponse que s'il nomme exactement cet accord ; il ne lit plus jamais le voicing affiché pour fixer la cible.
8. Accords de 11e, de 13e et altérés : chaque voicing servi respecte la définition de sa famille et les règles des manuels (`textbook-voicings.js`) ; les voicings VoicingLab non conformes sont reconstruits sur les mêmes notes (`voicing.rebuilt`, `rebuiltFrom`). Les autres qualités restent 100 % VoicingLab.
9. Mouvement 12 tons : seul mode à grille (Progression retiré) ; « Ma grille » garde les qualités tapées ; tonalités du tour choisies (`keySet`, `keyOrder`, `keyChoice`).

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

### 2026-09-23 — L'onglet Exercice ne génère plus de voicings
- L'Exercice lit `src/data/voicinglab-reference.json` (10 674 voicings VoicingLab réels, 12 tons) via `voicinglab-availability.js`. Les générateurs de `family-generators.js` ne servent plus qu'à l'onglet Analyse (`voicing-preview.js`).
- `generateVoicingCatalog(input, { voicingLabStrict: true })` filtre toutes les familles par racine + qualité VoicingLab.
- Décision complète : ADR-013 dans le vault externe.
