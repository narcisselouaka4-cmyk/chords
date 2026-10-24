---
title: "Évaluation du détecteur d'accords et avenir de l'onglet Analyse"
type: feature
date: 2026-10-25
status: actif
tags:
  - piano-jazz-chords
  - analyse
  - detection-accords
  - adr-063
  - evaluation
---

# Évaluation demandée par Narcisse — détecteur d'accords et avenir d'Analyse

Narcisse demande une évaluation technique sérieuse avant de décider s'il faut suspendre
Analyse pour concentrer l'effort sur Entraînement et Studio. Aucun code n'a été modifié
dans ce lot : ce sont des **mesures** sur le code et sur les analyses réelles.

## Ce qui a été fait

Lecture du moteur (`electron/audio-processor.py`, 5484 lignes), du rapport
`RAPPORT-FINAL-DETECTION-ACCORDS.md`, de l'ADR-063, puis **mesure sur les 13 analyses
réellement sauvegardées** dans `~/PianoJazzChords/Studio/Track_*/original.pjc.json`
(2162 événements sonnants) — c'est-à-dire sur ce que Narcisse voit à l'écran, pas sur des
fixtures.

Fichiers lus (aucun écrit) : `electron/audio-processor.py`,
`src/analyzer/structural-progression.js`, `src/ui/analyzer-tab.js`.

## Ce qui a été vérifié, et comment

### 1. Les cases vides ne sont pas une simplification — mesuré

Distribution des rôles sur les 13 morceaux : `uncertain` écrase `passing` dans un rapport
d'environ **10 pour 1**. `passing` (la hiérarchisation voulue, à la Chordify) ne représente
que **1 à 5 %** du temps. Le reste des cases vides est de l'`uncertain`, c'est-à-dire
« le moteur ne sait pas ».

- **31,6 % des événements sonnants sont masqués** par défaut (683 / 2162), soit **963 s**.
- Parmi les masqués : **43 %** ont une confiance ≥ 0,80 ; **38 %** portent un accord qui est
  classé *structurel ailleurs dans le même morceau* ; **18 %** sont dans la boucle
  structurelle détectée (`inStructuralLoop: true`).

Le diagnostic de Narcisse est donc exact et chiffrable : l'affichage ne simplifie pas, il
efface. Et il efface en priorité les degrés secondaires — taux de disparition mesuré :
**v 91 %, vii 60 %, iv 54 %, ii 50 %, iii 45 %, vi 29 %**, contre **I 18 % et V 11 %**.
Le filtre amplifie la faiblesse du moteur sur le vi déjà mesurée dans EXP-058.

### 2. Cause n°1 — les rôles sont jugés sur la tonalité GLOBALE (bug d'ordre)

`_classify_chord_roles(segments, key, …)` est appelée **ligne 5275** avec la tonalité
globale. `detect_local_keys` est appelée **ligne 5374**, donc **après**, et uniquement pour
remplir `result['keys']` à l'affichage. Les tonalités locales sont calculées puis **jamais
utilisées pour classer les rôles**.

Conséquence sur un morceau qui module : toute la section modulée devient non diatonique →
hors vocabulaire → `uncertain` → masquée.

Cas mesuré, **Track_020** (durée 467 s, tonalité globale F détectée à 0,972 de confiance,
`keys: []` — aucune tonalité locale) : les **128 dernières secondes** (329 s → 457 s) sont
masquées d'un seul bloc, 51 événements, confiance moyenne **0,89**, et les accords sont
`C# (14), B (10), F# (9), D#m (9), A#m (5)` — soit V, IV, I, vi, iii de **Fa# majeur**.
Cinq des six accords les plus présents sont diatoniques de F#. Très probablement une
**modulation d'un demi-ton vers le haut** en fin de morceau (classique en louange).
Les accords semblent corrects ; c'est le filtre qui les jette.

**Track_022** : même schéma, 82 s masquées (453 s → 535 s), `D, A, G, F#m` contre une
tonalité globale C#.

Estimation du gain : en classant les rôles sur la tonalité **locale**, **365 s sur 963 s de
temps masqué seraient récupérées, soit 38 %** — et 94 % sur Track_020, 71 % sur Track_022.

### 3. Cause n°2 — le test de durée tue les accords structurels courts

`min_structural = max(0,12 ; 0,5 × durée médiane pondérée)`. Un accord devient `uncertain`
pour la seule raison qu'il est court, même quand tout le reste le désigne comme pilier.

Cas mesuré, **Track_002** (« Père nous t'adorons », tonalité E) : un **A** (le IV),
`confidence 0.932`, `inStructuralLoop: true`, durée 0,77 s → `role: uncertain` → **masqué**.

C'est exactement le scénario `I → [vide] → IV` décrit par Narcisse, où l'intervalle vide
avale un accord structurel.

### 4. Cause n°3 — aucun onset ne place jamais une frontière d'accord

Vérifié par recherche exhaustive : `librosa.onset.onset_strength` ne sert qu'à l'estimation
du tempo (`_resolve_tempo`, `_subdivision_support`) et au rognage du silence de tête
(`_audio_onset_time`). **Aucune information d'attaque n'intervient dans le placement des
frontières d'accord.**

Les frontières viennent uniquement du Viterbi sur une grille uniforme de 0,25 s, dont le
chroma est lissé sur une fenêtre effective de ~1,25 s, avec des coûts de transition **×2**
(« inertie forte », commit `bc35a22`). Le lissage est bien **centré** (noyau symétrique,
fenêtre centrée) : il n'introduit donc pas de retard causal. Mais l'inertie doublée ne
valide un changement qu'une fois assez de preuve accumulée, ce qui **retarde
systématiquement** les frontières. Le rapport le mesure déjà : F1 des frontières à ±0,5 s =
**33 à 56 %**, et nomme lui-même le correctif non fait — « la v2 passe par une vraie
fonction de nouveauté (novelty) ».

Le retard n'est donc pas mystérieux : l'information nécessaire pour le corriger est
**calculée puis jetée**.

### 5. Ce qui est vraiment dur, et ce qui ne l'est pas

À distinguer nettement :

- **Fiabilité de la transcription** (quel accord sonne) : **plateau démontré**. 13 itérations
  mesurées, généralisation 42,7 → 53,0 % d'alignement Chordify sur 6 morceaux hold-out, avec
  des plafonds honnêtement mesurés (tierces physiquement absentes du mix sur 3 accords
  annotés de yahweh_live ; renversements dominants sur Amazing Grace ; jazz modulant à
  17,5 %). Continuer à régler ce moteur par petites touches est sans perspective.
- **Restitution** (ce que l'utilisateur voit de ce que le moteur a trouvé) : **trois bugs
  d'architecture identifiés et localisés**, indépendants du plateau ci-dessus. Ce sont
  précisément les trois symptômes listés par Narcisse.

L'écart entre « CSR 63 % » et « Vue d'ensemble catastrophique » s'explique par là :
le moteur est médiocre, mais **l'affichage le fait paraître bien pire qu'il est**.

## Ce qui reste à vérifier

- **À l'oreille, par Narcisse** : Track_020 module-t-il bien en Fa# dans les 128 dernières
  secondes ? Si oui, l'analyse est bonne et seul le filtre est en cause. (Une erreur
  systématique d'un demi-ton est improbable : les 329 premières secondes ressortent
  correctement en F.) Même question pour Track_022 (D majeur en fin de morceau ?).
- Aucune mesure n'a été rejouée avec le moteur : `eval-chords-triad.py` sur le manifeste
  demande ~35 min et n'a pas été lancé dans cette session. Les chiffres ci-dessus portent
  sur les analyses **déjà sauvegardées**, donc sur des versions de moteur hétérogènes.
- Les gains de 38 % sont une **estimation** par meilleure tonalité majeure locale sur une
  fenêtre de ±20 s, pas le résultat d'un correctif appliqué.
- Rien n'a été vérifié dans Electron ; aucun build ni test lancé (aucun code modifié).

## À mettre dans decisions/

Un ADR est à écrire une fois la direction tranchée par Narcisse. Proposition :
**« Analyse : le moteur est gelé, la restitution est réparée »** — cesser toute campagne de
réglage du détecteur (plateau mesuré), et borner l'effort Analyse à trois corrections de
restitution : rôles sur tonalité locale, fin du masquage d'un accord confirmé au seul motif
de sa brièveté, frontières placées par fonction de nouveauté.

Cet ADR amenderait **ADR-063** sur un point : la règle 1 (« afficher par défaut les seuls
événements classés structurels ») est, en l'état du classificateur, un effaceur et non un
hiérarchiseur — `passing` ne pèse que 1 à 5 % du temps quand `uncertain` en masque 10 fois
plus. L'intention de l'ADR-063 (la simplicité comme arme) est juste ; son implémentation ne
la réalise pas.

## À mettre dans experiments/

EXP à ouvrir : **« Ce que l'affichage cache du moteur — 13 analyses réelles »**, avec les
chiffres ci-dessus (31,6 % d'événements masqués ; 963 s ; 43 % à confiance ≥ 0,80 ; 38 %
structurels ailleurs ; taux de disparition par degré ; 38 % récupérables par tonalité
locale ; trous de 128 s et 82 s). Mesures reproductibles depuis les JSON sauvegardés, sans
audio ni moteur.

Point méthodologique à retenir : **une métrique de restitution manquait**. Le thermomètre
mesure le CSR du moteur, jamais ce que la grille affichée en conserve. Métrique proposée —
*taux de restitution* = temps où la grille affichée montre le bon accord / temps où la
réponse interne du moteur était bonne. Par construction, il est aujourd'hui plafonné à
~68 % puisque 31,6 % des événements sont masqués.

## Prochaines actions et questions pour Narcisse

1. **Trancher la direction** (c'est la question posée) : ma recommandation est de **ne pas
   suspendre Analyse, mais de geler le détecteur**. Suspendre maintenant figerait l'onglet
   dans un état qui trahit son propre moteur, et c'est le masquage — plus qu'une étiquette
   fausse — qui porte le risque pédagogique : une case vide se lit « il n'y a rien ici »,
   un accord marqué incertain se lit « à vérifier ». L'effort de fond va à Entraînement et
   Studio ; Analyse reçoit un lot borné de restitution, puis plus rien.
2. **Confirmer les deux modulations à l'oreille** (Track_020, Track_022). C'est ce qui
   décide si la cause n°1 est bien un bug de filtre et non une erreur de transcription.
3. Ordre d'attaque proposé, du plus rentable au moins rentable : tonalité locale dans les
   rôles (38 % du temps masqué) → fin du masquage d'un accord confirmé et bref → frontières
   par fonction de nouveauté (le seul des trois qui demande une vraie expérience).
4. Question ouverte : accepte-t-on d'afficher un accord **marqué incertain** plutôt que rien ?
   L'ADR-063 l'interdit aujourd'hui par défaut. C'est le verrou qui tient les 963 s.
