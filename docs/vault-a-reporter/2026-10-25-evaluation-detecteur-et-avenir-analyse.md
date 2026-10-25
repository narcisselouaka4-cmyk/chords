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

---

# Suite (25/10) — Le MIDI change le diagnostic

Narcisse se souvient avoir exporté une session MIDI (Sessions MIDI → .mid) et l'avoir passée
dans Analyse. Un MIDI qu'il a joué lui-même est une **vérité terrain exacte** : les notes sont
connues, il n'y a aucune ambiguïté acoustique, et il sait quels accords sont structurels.

Fichier retrouvé : `/home/visiteur/Musique/Session 15 09 2026 17 42.mid`, importé dans Analyse
le 25/10 à 01:02 (rendu en WAV dans `~/PianoJazzChords/Analyse/midi/`). L'analyse n'étant pas
sauvegardée en JSON, elle a été **rejouée hors app** avec les modules réels
(`parseMidiFile` + `analyzeMidiEvents`) pour reproduire exactement ce qu'il a vu.

Données : 906 événements, 147,9 s, tempo 120, **97 accords**.

## Ce que le chemin MIDI produit

**1. Aucune hiérarchie — du tout.** `role: 'structural'` est **codé en dur** pour les 97
accords (`src/analyzer/midi-source.js:85`), et `degree: null` pour les 97. Le chemin MIDI ne
passe **pas** par `_classify_chord_roles`. Donc sur MIDI : pas de case vide (tant mieux), mais
pas un seul accord de passage identifié, et pas un degré. La hiérarchisation demandée est
absente du chemin où elle serait pourtant la plus facile.

**2. Tonalité écrite « D# major ».** La cause est en une ligne : `detectKey(list, keyChords,
{ useSharps: true })` dans `midi-source.js`. Tous les accords sont écrits en bémols
(Eb, Ab, Bb, Cm, Fm), la tonalité en dièses. « D# major » n'est pas une tonalité d'usage —
c'est Mi bémol majeur. Confiance 0,60.

**3. 15 segments fantômes de ≤ 0,12 s** sur 97 (15 %), total 0,85 s — et surtout
**11 segments qui se chevauchent** dans le temps (jusqu'à −39 ms). Cause : dans
`analyzeMidiEvents`, `last.endTime = Math.max(last.startTime + 0.05, s.start)` impose 0,05 s
minimum au segment précédent, ce qui le fait dépasser le début du suivant. Un accord
fantôme naît d'une attaque de voicing dont une note arrive quelques millisecondes avant les
autres : le segmenteur coupe un nouvel accord sur un voicing partiel.

**4. Le nommage préfère systématiquement le gabarit le plus complexe, sans aucun contexte
tonal.** Dans `src/recorder/midi-chord-namer.js`, l'arbitrage est
`precision = required.length * 2 - optional.length * 0.25`, donc « plus de notes obligatoires
gagne ». **39 % des segments (38/97) ont plusieurs couples (fondamentale, gabarit) qui
collent exactement** aux notes jouées : l'arbitrage décide seul, sans savoir qu'on est en Mib.

Cas démontré : notes {Eb, G, Bb, F} (MIDI 55 63 65 70 75).
- `Ebadd9/G` — gabarit `add9` [0,4,2] + quinte facultative → precision **5,75**
- `F9sus4/G` — gabarit `9sus4` [0,5,10,2] → precision **7,75** → **retenu**

En Mi bémol majeur, {Eb, G, Bb, F} est **Eb add9**, le degré I. Le moteur affiche
`F9sus4/G`. Même schéma pour `F13sus4/D`, `Eb6/9/C`, `Abmaj7sus2/Bb`, `Cmadd9/Eb`.
Résultat : **53 % des noms portent add/sus/9/11/13/maj7/slash**, et **25 noms distincts**
apparaissent pour ce qui est une boucle qui se répète.

**5. Un `?` est affiché à l'utilisateur.** `Bb?` apparaît deux fois (8,50 s et 42,32 s), notes
{Bb, F, Ab} = Bb7 sans tierce. Aucun gabarit de la table ne décrit un accord **sans tierce**
(quinte + septième), qui est l'une des mains gauches les plus courantes en gospel. Faute de
gabarit, le repli `detectChord` produit le symbole `?`, et la frise affiche « Bb? ».

**6. La structure EST là, et elle est récupérable.** Débarrassée des fantômes, la suite montre
deux couplets quasi identiques :

```
Cmadd9/Eb Ab Bbadd9 Bbsus2 Bb? F9sus4/G Ebmaj7/G Cmadd9/Eb Ab Fm Bb6/D Csus4 Eb6/9/C Cm Fmadd9/Ab Bb Abadd9 Fdim
          Ab Bbadd9 Bbsus2 Bb? F9sus4/G Ebmaj7/G Cmadd9/Eb    Fm Bb6/D Csus4 Eb6/9/C Cm Fmadd9/Ab Bb Ab      Fdim
```

Les mêmes erreurs se répètent **à l'identique** (`Bb?` aux deux passages, `F9sus4/G` aux deux
passages) : le moteur est déterministe et cohérent, il se trompe de façon reproductible. Donc
un correctif de nommage se propage partout, et la hiérarchie structurel/passage est dérivable
**par répétition de section**, sans aucune acoustique.

Réduite aux fondamentales, la boucle est diatonique et banale en Mib :
**vi → IV → V → I → vi → IV → ii → V**, soit Cm → Ab → Bb → Eb → Cm → Ab → Fm → Bb.
C'est un gospel en Mi bémol. L'app en affiche 25 noms enrichis.

## Correction de deux chiffres annoncés plus haut dans cette note

- J'avais annoncé « 25 % des noms exigent une note jamais jouée ». **À retirer** : ce test
  utilisait mes propres intervalles obligatoires, pas la table réelle du moteur, qui rend la
  quinte facultative. Refait avec les vrais gabarits, les noms retenus **expliquent bien
  toutes les notes jouées** et aucune fondamentale retenue n'est hors de Mib (0/97). Le défaut
  n'est pas d'inventer des notes : c'est de choisir, parmi plusieurs lectures exactes, la plus
  complexe.
- Le « 37 % où un nom diatonique plus simple existait » est également **à retirer** :
  l'heuristique proposait des alternatives pires (`Fm → Ab6/F`, `Cm → Eb6/C`). Le chiffre
  solide est celui de l'ambiguïté : **39 % de segments à plusieurs lectures exactes**.

## Ce que ça change pour la décision

Le plateau mesuré du rapport ADR-061 porte sur la **transcription acoustique**. Le test MIDI
montre que, sur des notes **exactes**, l'onglet Analyse échoue encore — hiérarchie absente,
tonalité mal orthographiée, segments fantômes et chevauchants, nommage qui préfère la
complexité, `?` affiché. **Aucun de ces défauts n'est un problème de signal.** Ce sont des
bugs de logique, testables sans audio.

Conclusion : suspendre Analyse maintenant reviendrait à l'abandonner à cause d'un plafond
acoustique qui n'explique qu'une partie de ce que Narcisse voit.

## À mettre dans decisions/

Amender l'ADR proposé plus haut : le chemin MIDI doit passer par la **même** qualification que
l'audio (rôles et degrés), et le nommage doit recevoir la **tonalité** en contexte. Le MIDI
n'est pas un cas marginal : c'est le chemin de référence.

## À mettre dans experiments/

EXP à ouvrir : **« Le MIDI comme vérité terrain — session jouée par Narcisse »**.
C'est la réponse à sa question « comment mesurer objectivement les progrès ? » :
**Sessions MIDI est un générateur de vérité terrain**. Il joue une progression qu'il connaît,
l'exporte, la passe dans Analyse, et on compare. Étiquettes parfaites, pas de dérive
d'annotation, pas de désaccord avec Chordify, pas de tierce absente du mix. Aucun des
plafonds mesurés sur l'audio ne s'applique.

Banc proposé : un jeu de sessions jouées exprès (une par difficulté : boucle diatonique
simple, accords de passage explicites, renversements, modulation volontaire, mains séparées),
avec la grille écrite par Narcisse à côté. Métriques : nom exact, fondamentale exacte,
frontières à ±0,1 s (le MIDI le permet), et rôle structurel/passage — la seule qu'il est seul
à pouvoir fournir.

## Prochaines actions

1. **Rendre le banc MIDI** avant tout correctif : la mémoire du projet dit de simuler le
   correctif sur les données réelles avant de toucher au code.
2. Correctifs par ordre de rentabilité sur ce chemin, tous sans acoustique :
   orthographe de la tonalité (une ligne) → fantômes et chevauchements → gabarit « sans
   tierce » pour supprimer les `?` → arbitrage de nommage pondéré par la tonalité → rôles et
   degrés sur le chemin MIDI → hiérarchie par répétition de section.
3. Question pour Narcisse : écrire la grille qu'il **attendait** pour
   `Session 15 09 2026 17 42.mid` (accords, et lesquels sont de passage). C'est la première
   ligne du banc, et je ne peux pas la deviner à sa place.

---

# Suite 2 (25/10) — Vérité terrain donnée par Narcisse, et cause unique

Narcisse a dicté la structure de `Session 15 09 2026 17 42.mid`. **Tonalité : ré dièse majeur**
(il confirme que l'app l'a bien trouvée). Deux parties :

- **Couplet, 2 tours** : `I → IV → V → I` puis `I → IV → ii → V → I` (9 accords)
- **Refrain** : `I → IV → V → I → V (1er renversement) → vi → IV`, puis `I → V → vi → IV → V`,
  boucle répétée, et cadence finale `V → IV → I` où le IV peut être remplacé par un accord de
  tension, **A#7b9** (≈ 20 accords)

Soit **~29 accords de structure** pour 147,9 s.

## Correction à porter : j'avais tort sur l'orthographe

J'ai écrit plus haut que « D# major n'est pas une tonalité d'usage — c'est Mi bémol majeur ».
**À retirer.** Narcisse pense et écrit en dièses (il dit « ré dièse majeur », « La#7 bémol 9 »)
et juge la tonalité correctement trouvée. Le défaut réel n'est pas le choix de D# : c'est
l'**incohérence** entre la tonalité affichée en dièses (`D# major`) et les accords affichés en
bémols (`Eb`, `Ab`, `Bb`, `Cmadd9/Eb`). Le correctif est d'aligner l'orthographe des accords
sur celle de la tonalité — donc sur sa convention — et non de changer la tonalité.

## Ce que le moteur fait bien (à ne pas casser)

- **Aucun segment ne tombe sur un degré qu'il ne joue pas.** Les 82 segments réels se
  répartissent sur I (22), IV (18), vi (15), V (15), ii (12) — **exactement ses cinq degrés**,
  0 % de iii, de vii ou de chromatique. Les fondamentales retenues sont toutes dans son
  vocabulaire. *(Ma réduction en degrés de la passe précédente faisait apparaître des iii et
  des vii : c'était un défaut de MON heuristique, pas du moteur. Retiré.)*
- **Son V en premier renversement est bien vu** : basse D relevée à 21,47 / 56,04 / 86,36 /
  87,47 / 123,58 / 124,42 / 134,01 s.
- Le moteur est **déterministe** : les deux tours du couplet produisent les mêmes erreurs aux
  mêmes endroits.

## Les trois défauts réels, mesurés contre sa grille

**1. Sur-segmentation 3,3×.** 97 segments émis pour ~29 accords de structure (82 hors
fantômes, encore 62 après regroupement par degré, soit 2,1×). Cause : un changement de
voicing ou de note de mélodie sur un accord **tenu** ouvre un nouveau segment. Exemple, son
vi : `Csus4` (23,71) → `Eb6/9/C` (24,66) → `Cm` (24,97) = trois segments pour un seul accord.
Le garde-fou existant (`if (current && single && cluster[0].note === top) continue;`) ne
protège que le cas d'**une** note seule au sommet.

**2. Aucune hiérarchie : les 97 sont marqués `structural`.** Donc la sur-segmentation 3,3×
est présentée comme de la structure. Ses accords de passage — qu'il connaît — ne sont nulle
part. C'est le défaut le plus visible pour lui.

**3. Cause unique derrière le mauvais nommage : aucun gabarit pour un accord SANS TIERCE.**

Mesuré : **27 % des segments (22/82) ne contiennent pas la tierce du degré que joue la basse**
— ce sont les voicings « coquille » de la main gauche gospel. La table de
`src/recorder/midi-chord-namer.js` n'a **aucun** gabarit sans tierce. Faute de modèle, le
moteur re-enracine ailleurs, d'où **34 % de segments (28/82) dont la fondamentale retenue
n'est pas la basse**, et les noms exotiques.

Conséquences directement vérifiées sur sa grille :

| Il joue | Notes | Affiché | Occurrences |
|---|---|---|---|
| **I** (ouverture du couplet) | D#, C, D (sans la tierce G) | `Cmadd9/Eb` → **vi** | 2,34 / 14,14 / 47,81 |
| **V** (coquille) | A#, G#, G (sans la tierce D) | `Abmaj7sus2/Bb` | 74,52 / 112,06 |
| **vi** (coquille) | C, G, G# (sans la tierce D#) | `Abmaj7/C` | 79,17 |
| **V7** (sans tierce) | A#, F, G# | `Bb?` — un **`?` à l'écran** | 8,50 / 42,32 |
| **A#7b9** (sans fondamentale) | F, G#, B = 5 / b7 / b9 | `Fdim` | 31,52 (6,78 s) / 65,69 |
| **V 1er renversement** | basse D | `Bb6/D`, `Bb/D`, `F13sus4/D` | 3 noms pour un objet |

Le premier accord du morceau — son degré I — est lu **vi**, trois fois. Et son accord de
tension A#7b9, qu'il nomme lui-même, est affiché `Fdim` : le moteur n'a pas la notion de
**dominante sans fondamentale** (structure supérieure 5/b7/b9 au-dessus d'une basse qui est
la quinte).

Au total : **25 noms distincts** affichés pour 5 degrés et 1 accord de tension.

## Conclusion technique

Les trois défauts sont **indépendants du signal** et tous trois localisés :
sur-segmentation dans `segmentSessionEvents`, hiérarchie absente dans `analyzeMidiEvents`
(`role` codé en dur), nommage dans `midi-chord-namer.js` (table sans gabarit sans tierce,
arbitrage sans contexte tonal). Rien ici ne relève du plafond acoustique de l'ADR-061.

## Prochaines actions, par ordre de rentabilité

1. **Figer sa grille comme premier cas du banc MIDI** (couplet 2 tours + refrain + cadence
   A#7b9 ci-dessus). Simuler chaque correctif dessus avant de toucher au code.
2. **Gabarits sans tierce** (coquilles : fondamentale + quinte + 7e / 6e / 9e) — corrige en un
   point le `?`, le I lu vi, le V et le vi coquilles. Le gain le plus large pour le plus petit
   changement.
3. **Basse privilégiée comme fondamentale** quand elle est la fondamentale d'un degré de la
   tonalité et qu'aucune lecture mieux étayée n'existe. Demande de passer la **tonalité** à
   `nameMidiChord`, qui aujourd'hui n'en reçoit aucune.
4. **Orthographe cohérente** accords/tonalité, sur la convention de l'utilisateur (dièses ici).
5. **Fantômes et chevauchements** (≤ 0,12 s, 11 chevauchements jusqu'à −39 ms).
6. **Ne pas couper sur un changement de voicing d'un accord tenu** — étendre le garde-fou
   au-delà du cas « une seule note au sommet ».
7. **Rôles et degrés sur le chemin MIDI**, puis hiérarchie par **répétition de section** (les
   deux tours du couplet sont détectables : mêmes suites aux mêmes positions).
8. **Dominante sans fondamentale** (chantier à part, bien défini) : reconnaître une structure
   supérieure 5/b7/b9 et nommer le V7b9 au lieu d'une triade diminuée.

## Question restante pour Narcisse

Sa cadence finale : il dit « c'est 5, 4, 1, mais le 4 je le remplace par A#7b9 ». Comme A#
**est** le V en ré dièse, à confirmer — s'agit-il de `V → V7b9 → I` (le IV remplacé par une
tension bâtie sur le V), ou d'un autre degré ? Le relevé montre à ces endroits `Fdim` sur
{F, G#, B}, compatible avec A#7b9 sans fondamentale. À trancher par lui.

---

# Suite 3 (25/10) — Correctifs appliqués sur le chemin MIDI

Narcisse a joué une **troisième** session, `Session_017` (22 s, do majeur), en dictant sa
grille accord par accord, et a demandé de corriger. C'est le premier lot de code de la
journée (les deux précédents étaient des mesures).

## Vérité terrain de Session_017, dictée par Narcisse

`F → Gadd9 (appoggiature sur la seconde) → Em → Am → Dm7 → Gadd9/B → Fadd9/A →
Cmaj7-9 → Dm7-9 → Em7 (+ Fa d'appui)`

Deux écarts constatés entre son intention et le fichier, à lui signaler : **aucun Si n'est
joué** sur son « Do majeur 7 » (donc `Cadd9`, pas `Cmaj9`) et **aucun Do** sur son « Ré
mineur 7 » (donc `Dmadd9`, pas `Dm9`). Sur son « Sol add9 basse de Si », la note la plus
grave du fichier est un **La2**, pas un Si.

## Diagnostic : la règle qui manquait

Dans ses trois erreurs signalées, la lecture retenue était celle dont la **triade ne sonne
même pas** :

| Ses notes | Retenu | Sa triade | La triade du nom retenu |
|---|---|---|---|
| Sol La Si Ré | `A9sus4` | Sol-Si-Ré **jouée** | La-Do#-Mi : **ni Do# ni Mi** |
| Do Fa Sol La | `G9sus4/A` | Fa-La-Do **jouée** | Sol-Si-Ré : **ni Si ni Ré** |
| Mi Fa Sol Si | `G13/E` | Mi-Sol-Si **jouée** | Sol-Si-Ré : **pas de Ré** |

Cause : l'arbitrage `precision = required.length * 2 - optional.length * 0.25` récompense le
gabarit qui exige le **plus** de notes. L'identité d'un accord tient à sa triade, pas au
nombre de cases que coche un modèle.

### Piste essayée et corrigée en route (à garder)

Première version : exiger **tierce ET quinte**. Elle a cassé un cas réel de
`test-session-analysis.js` — `G13` joué sans quinte, basse Sol frappée, devenait `Em/G`
(4 suites en échec). **La quinte est la première note qu'un pianiste omet** : on ne doit
jamais l'exiger de l'accord retenu.

Le discriminant correct est la **basse**. {Mi Fa Sol Si} et {Mi Fa Sol La Si} sont le même
accord à une note près et correspondent tous deux au gabarit `13` : c'est la basse qui
tranche — Mi chez Narcisse (→ `Em`), Sol dans le test (→ `G13`). Le repli ne s'applique donc
que si **la basse jouée porte elle-même une triade entière** et que l'accord retenu n'est pas
déjà enraciné sur elle.

## Ce qui a été changé

`src/recorder/midi-chord-namer.js`
- Une lecture dont la triade est réellement jouée passe avant une lecture plus « riche »
  dont la triade est absente (bonus prioritaire sur la précision, mais la quinte n'est jamais
  exigée de l'accord retenu).
- Repli « appoggiature » : si aucun modèle ne décrit l'ensemble avec une triade qui sonne,
  mais que la basse porte une triade entière, on nomme cette triade (`matched: false`, donc
  confiance 0,6 — honnête : « Em, avec une note que je n'explique pas »).
- Gabarits ajoutés : `add11` / `madd11` (quarte ajoutée, l'appoggiature la plus courante) et
  coquille de septième **sans tierce** (`[0, 10]`, quinte facultative).
- Orthographe : option `useSharps`, pour que les accords suivent la convention de la tonalité.

`src/recorder/session-analysis.js` — `nameChordSegments` accepte `useSharps` et renomme.

`src/analyzer/midi-source.js`
- Un accord s'arrête **où le suivant commence** (le plancher de 0,05 s faisait chevaucher).
- `pruneAttackTransients` : un segment de moins de 0,12 s n'est pas un accord mais une note
  du voicing arrivée en avance ; il est retiré et l'accord suivant reprend son début.
- La tonalité se vote sur les accords **retenus**, pas sur les segments bruts.
- Accords et tonalité dans la même orthographe (dièses).

`src/analyzer/key-detector.js` — deux correctifs
- Une fondamentale **étrangère** à la tonalité candidate compte **contre** elle
  (`weights[deg] ?? -1.5`) au lieu de compter pour rien : un Fa majeur ne coûtait rien à Sol
  majeur, alors qu'il contredit son armure.
- Quand la corrélation tonale a un avis, le choix se joue entre **sa** tonalité et **sa
  relative** — la seule ambiguïté que les accords peuvent trancher, relatives majeure et
  mineure partageant tous leurs accords diatoniques. L'ancien
  `else if (chordScoreKrumhansl > best.score)` ne pouvait **jamais** se déclencher : `best`
  venait d'être écrasé par le vainqueur de la boucle exhaustive, donc supérieur ou égal.
  Mesuré : do majeur (Krumhansl **+0,737**) perdait contre la mineur (**−0,732**) sur un
  écart de **0,019** point de vote par accords.

## Résultats mesurés

| | Session_017 | Session 15/09 |
|---|---|---|
| segments | 13 → **11** (10 visés) | 97 → **81** |
| fantômes ≤ 0,12 s | 2 → **0** | 15 → **0** |
| chevauchements | 1 → **0** | 11 → **0** |
| « ? » affichés | 2 → **0** | 2 → **0** |
| tonalité | `C major` ✓ (passée par `Am minor` et `G major` en route) | `D# major` ✓ |

Les 10 accords de sa grille sont maintenant nommés comme il les a dictés, aux deux écarts
de notes près signalés plus haut. Sur la session du 15/09 : `F9sus4/G` → `D#add9/G` (son
degré I), `F13sus4/D` → `A#add11/D` (son V en premier renversement), `Bb?` → `A#7`.

## Ce qui a été vérifié, et comment

- **20 suites de tests** passent, dont les quatre cassées en route, les régressions Partie 1
  et Partie 3, et 98/98 sur `test-chords`. Nouveau banc : `test-midi-chord-namer.js`, 19
  contrôles tirés de ses deux grilles, avec les notes **relevées dans les fichiers MIDI**.
- `npm run build` passe.
- Les deux sessions réelles rejouées hors app.

## Ce qui reste à vérifier

- **Rien n'a été vérifié dans Electron** : à rouvrir ses sessions dans l'onglet Analyse pour
  juger à l'écran. Les analyses déjà enregistrées gardent les anciens noms.
- La convention « dièses » est imposée en dur dans `midi-source.js`. Une tonalité comme fa
  majeur y écrira `A#` au lieu de `Bb`. Une convention par tonalité (armure) ou une
  préférence utilisateur reste à décider — question pour Narcisse.
- La pénalité de fondamentale étrangère (−1,5) n'est **pas** calibrée sur un corpus : elle
  est vérifiée sur deux sessions et les 20 suites, rien de plus. À surveiller sur du jazz
  chromatique, où des fondamentales hors tonalité sont légitimes.

## Défauts encore ouverts (mesurés, non corrigés)

1. **Son Em de Session_017 reste coupé en deux** : `Esus4` (8,14 s) puis `Emadd11` (9,38 s).
   L'appoggiature La est tenue, puis se résout sur Sol : le segmenteur ouvre un accord à
   chaque état. C'est l'**appoggiature dans le temps**, pas dans le nom — le garde-fou de
   `segmentSessionEvents` ne couvre que le cas d'**une** note seule au sommet.
2. **Son degré I du 15/09 reste lu `Cmadd9/D#`** : {D# Do Ré} est une coquille majeure sans
   tierce ni quinte (fondamentale + 6e + 7e). Aucun gabarit, et la basse ne porte pas de
   triade entière, donc aucun des deux correctifs ne s'applique.
3. **Son A#7b9 reste affiché `Fdim`** : dominante **sans fondamentale** (structure supérieure
   5 / b7 / b9 au-dessus d'une basse qui est la quinte). Chantier à part, bien défini.
4. **Sur-segmentation 81 contre ~29** sur le 15/09 : un changement de voicing sur un accord
   tenu ouvre toujours un nouveau segment.
5. **Rôles et degrés toujours absents du chemin MIDI** (`role: 'structural'` en dur,
   `degree: null`). C'est le prochain chantier, avec la hiérarchie par répétition de section.

## Prochaines actions

1. Narcisse rouvre ses trois sessions dans Analyse (Electron) et juge à l'écran.
2. Trancher la convention d'orthographe (dièses partout, armure, ou préférence).
3. Appoggiature dans le temps (défaut 1) puis rôles/degrés sur le chemin MIDI (défaut 5) :
   ce sont les deux qui restent les plus visibles pour lui.

---

# Suite 4 (25/10) — Session_019, réglage d'orthographe, et la question du MIDI

## Session_019 : son jeu le plus avancé (34 accords, 50 s, 203 attaques)

Narcisse rejoue la même progression « en élevant le niveau », se filme en train d'enregistrer
et se place sur l'onglet Temps réel pour qu'on puisse juger sans dépendre de sa dictée.
Vidéo : `~/Vidéos/cinnamon-2026-10-25T014351+0200.webm` (72 s, 1920×1080).

**Sur 34 segments, un seul est faux.** Le moteur lit correctement :

- ses dominantes secondaires : `E7b9` (V7/vi, deux fois), `A7b9` (V7/ii) ;
- ses diminués de passage : `Ddim7`, `C#dim7` ;
- son V add9 **avec la basse Si cette fois** : `Gadd9/B` (deux fois) — l'accord qu'il avait
  signalé comme faux dans Session_017 ;
- son `Dm7b5` (ii ø) ;
- toute sa **cadence chromatique de sortie** : bVI → bVII → bII → bII7#9 → I.

Le seul faux : **n°22, `Cmaj7sus2/B`** sur {Si, Do, Ré} (0,43 s) — une figure de passage de
trois notes, pas un accord. Elle passe par le repli `detectChord` (`matched: false`).

Conclusion : sur un jeu nettement plus difficile, le chemin MIDI tient. Le défaut dominant
n'est plus le nommage mais l'**orthographe**.

## Le réglage d'orthographe (demande : « fait un réglage »)

`spelling.js` contenait déjà la convention jazz par famille d'accord — écrite en octobre
précisément parce que « le Temps réel écrivait toute fondamentale noire en dièse : A♯7,
D♯maj7, G♯maj7 ». **Elle n'était pas branchée sur le nommeur MIDI.**

Trois valeurs, parce que deux ne suffisent pas :

| | Session_019 (do majeur) | Session 15/09 (ré dièse) |
|---|---|---|
| `auto` (défaut) | `Abmaj7 Bb Db Db7#9/F` ✓ | `Ebadd9/G`, `Bb7` |
| `sharps` (sa convention) | `G#maj7 A# C# C#7#9/F` | `D#add9/G`, `A#7` ✓ |
| `flats` | tout en bémols | tout en bémols |

En `auto`, le diminué reste en dièses (`C#dim7`) : un Ré♭°7 obligerait à des doubles bémols.
Réglage **« Altérations »** dans la barre du clavier, à côté de Notation ; gardé d'une séance
à l'autre (`pjc.chords.spelling`) et transporté par `keyboard-settings-changed`.

## Mélodie legato au-dessus d'un accord tenu

Son mi mineur de Session_017 était coupé en trois. Mesuré : Mi3 + Mi4 tenus de 8,14 à 9,5 s,
ligne descendante Si4 (8,23) → La4 (8,78) → Sol4 (9,38). L'ancien critère — « la note jouée
est le sommet de TOUT ce qui sonne » — échouait parce que la note précédente sonnait encore
au-dessus (La4 sous Si4, puis Sol4 sous La4).

Nouveau critère, géométrique : une note seule **au moins une quinte au-dessus de la basse de
l'accord**, avec **au moins deux notes de l'accord en dessous d'elle**. Il garde les trois
comportements à ne pas casser : une nouvelle basse n'a aucune note de l'accord en dessous
d'elle, une voix intérieure une seule, une note de mélodie au moins deux.

**Session_017 : 13 → 10 segments, exactement ses 10 accords.**

## La question de Narcisse : « le MIDI, ce n'est pas l'audio » — il a raison

Question posée en cours de lot : travailler sur des fichiers MIDI n'est-il pas peu
représentatif, et sans effet sur la détection des vrais morceaux ? **Vérifié dans le code, la
réponse est oui.** Ce sont deux chaînes séparées, qui ne partagent rien :

| | Chemin MIDI | Chemin audio |
|---|---|---|
| langage | JS (`midi-chord-namer.js`, `session-analysis.js`) | Python (`electron/audio-processor.py`) |
| nommage | 45 gabarits + repli `detectChord` | `chord_name(root, suffix)` |
| vocabulaire | add9, sus, 11, 13, altérés… | **9 suffixes** (`SIMPLE_ALLOWED_SUFFIXES`, ADR-061) |
| tonalité | `src/analyzer/key-detector.js` | `detect_key` en Python |
| orthographe | réglage (ci-dessus) | `NOTE_NAMES = ['C','C#','D','D#',…]` — **tout en dièses, en dur** |

Le Python ne peut pas appeler le JS : aucun des correctifs d'aujourd'hui n'atteint l'audio.
`key-detector.js` n'est utilisé que par les chemins MIDI/sessions (`analyzer.js`,
`take-review.js`, `midi-source.js`, `tonal-context.js`).

**Risque réel à nommer** : mesurer les progrès de l'audio sur du MIDI serait se mentir. Le
thermomètre de l'audio reste `scripts/eval-chords-triad.py`, et lui seul.

**Ce qui reste vrai malgré tout** : le chemin MIDI n'est pas un proxy, c'est le chemin de
Sessions MIDI et d'Entraînement — là où Narcisse joue. Et le problème audio se décompose en
*transcription* (plafond mesuré) + *restitution* (découpage, rôles, hiérarchie) ; le banc MIDI
valide les **règles** de la seconde moitié, que l'audio devra adopter aussi — mais comme
spécification, pas comme code partagé.

**Transferts identifiés, à faire côté Python** :
1. `NOTE_NAMES` tout en dièses : exactement le défaut corrigé aujourd'hui pour le MIDI. Les
   deux onglets devraient lire le même réglage. Peu coûteux.
2. La règle « la triade doit sonner » comme critère d'émission.
3. **Le plus gros gain audio déjà mesuré reste intact et n'a rien à voir avec le MIDI** :
   classer les rôles sur la tonalité **locale** (38 % du temps masqué, les trous de 128 s et
   82 s). C'est du Python pur, et c'est là qu'il faut aller pour faire progresser l'audio.

## Vérifié / non vérifié

22 suites de tests et `npm run build` passent. Banc `test-midi-chord-namer.js` porté à 26
contrôles ; `test-keyboard-settings.js` étendu au nouveau réglage. **Rien n'a été vérifié dans
Electron** : le sélecteur « Altérations » n'a pas été vu à l'écran.

## Défauts encore ouverts

1. `Cmaj7sus2/B` sur une figure de passage de trois notes (Session_019 n°22).
2. Son degré I du 15/09 lu `Cmadd9/D#` (coquille majeure sans tierce ni quinte).
3. Son A#7b9 lu `Fdim` (dominante sans fondamentale).
4. Son `Esus4` de Session_017 : le découpage est juste, mais la quarte suspendue ne se résout
   pas en `Em` dans le nom (résolution 4–3 non implémentée).
5. Rôles et degrés toujours absents du chemin MIDI.

---

# Suite 5 (25/10) — Les quatre défauts relevés par Narcisse sur Session_019

Narcisse passe Session_019 dans Analyse et relève quatre défauts précis, avec les timecodes
et ce qu'il jouait réellement. Tous les quatre sont corrigés. Banc de bout en bout :
`src/analyzer/test-sessions-narcisse.js` (15 contrôles ; les MIDI vivent hors dépôt, le banc
passe en les signalant s'ils manquent).

## 1. L'absorption (17 s) — la cause la plus profonde

« À la 17e seconde l'accord affiché c'est Ddim7, alors que je commence par un Do majeur 7.
Il vient après, et après vient le La 7b9. Et même quand l'étiquette passe au La 7b9, au piano
je suis encore en Ddim7. »

Mesuré : son Cmaj9 **existe** à 17,43 s (C3 17,43 · D4 17,45 · G3 17,45 · B3 17,47 · E4 17,52
— une grappe étalée sur 90 ms) mais **ne dure que 0,04 s**, puis disparaît comme transitoire.

Cause : `lastAttack` valait la **première** attaque de la grappe. Les notes de la grappe
attaquées 40 ms plus tard étaient donc « attaquées depuis l'accord précédent », donc
considérées comme appartenant au **suivant**, dont le début reculait jusqu'à elles. Le Si3,
tenu jusqu'à 19,58 s, faisait commencer le Ddim7 de **18,61 s** à **17,47 s**.

C'est le mécanisme général d'absorption sur un **accord roulé**, et il explique aussi le
A7b9 affiché 1,1 s trop tôt.

## 2. Les arpèges comptés comme un accord (25 s)

Ré5 et Mi5 attaqués à **88 ms** d'écart — juste sous les 90 ms du groupement — formaient une
« grappe de deux notes », donc pas une note seule, donc pas de la mélodie. Une paire
**conjointe** (un ton ou moins) au-dessus de l'accord reste de la mélodie.

## 3. La figure de passage nommée comme un accord (29 s)

Son Fa dim7 drop 2 est **correctement détecté** (B2 F3 G#3 D4 → `Bdim7`, même notes). Mais sa
marche chromatique de basse **Si2 → Do3 → Do#3** produisait un `Cmaj7sus2/B` de 0,18 s sur
{Si, Do, Ré}. Un segment qu'aucun modèle n'explique et qui ne dure pas est écarté.

Et la purge distingue désormais deux cas : un **transitoire d'attaque** (ses notes sont celles
du suivant) fait reculer l'accord suivant ; une **figure de passage** (ses notes ne sont pas
celles du suivant) laisse l'accord **précédent** se prolonger — son harmonie n'a pas changé.

## 4. L'accord roulé incomplet (42 s)

« Il détecte un Ré bémol alors que je joue un Ré bémol 7. » Mesuré : son Db7 est roulé sur
197 ms et le **Si4 — la septième — arrive 158 ms après le reste**, au-delà du seuil de
groupement. Il était lu comme une note de mélodie. Une note tardive, proche du sommet de
l'accord et dans un court délai, complète désormais l'accord.

## Deux règles ajoutées en conséquence

- **Relâcher des notes ne crée pas un nouvel accord** : quand les notes du segment suivant
  sont toutes déjà dans le précédent, c'est le même accord qui se dégarnit. Son Sol add9 se
  coupait en `Gadd9` puis `Gsus2` dès que la tierce cessait de sonner.
- **Appoggiature plaquée avec l'accord** : un segment très court, même basse, une note
  d'écart, ne crée plus d'éclat avant l'accord.

Sans elles, corriger l'absorption faisait remonter Session_019 de 34 à **42** segments : les
segments jusque-là écrasés survivaient. Avec elles : **34**.

## Essayé et RÉFUTÉ — à ne pas retenter tel quel

**Écarter les notes d'agrément de l'attaque** (durée très inférieure à la médiane des notes de
l'accord, hors basse, et seulement si l'accord tient encore sans elles).

Cela corrige son n°1 de Session_017 : il dit « Fa majeur », l'app lit `Fadd9`, et le Sol4 dure
0,13 s quand le reste dure 1,15 à 1,96 s. **Mais** cela lui retire les appoggiatures qu'il veut
voir nommées : `Gadd9` → `G`, `Cadd9` → `C`, `Dmadd9` → `Dm`. Or il dit explicitement
« appoggiature sur la seconde, **on peut comptabiliser ça comme un Sol add9** ».

Un accord corrigé contre trois perdus. Retiré du code, pas laissé en place morte.

Leçon : chez lui, une appoggiature **tenue avec l'accord** fait partie de la couleur et doit
être nommée ; une appoggiature **qui se résout dans le temps** (le La4 → Sol4 de son mi mineur)
relève du découpage. Les deux ne se traitent pas pareil.

## Résultats

| | avant | après |
|---|---|---|
| Session_017 | 10 segments | **10** (ses 10 accords) |
| Session_019 | 34, quatre défauts | **34**, les quatre corrigés |
| chevauchements | — | 0 sur les deux |

23 suites de tests et `npm run build` passent. **Non vérifié dans Electron.**

## Défauts encore ouverts

1. Son `Esus4` de Session_017 : le découpage est juste, la résolution 4–3 n'est pas nommée.
2. Son degré I du 15/09 lu `Cmadd9/D#` (coquille majeure sans tierce ni quinte).
3. Son A#7b9 lu `Fdim` (dominante sans fondamentale).
4. Rôles et degrés toujours absents du chemin MIDI.
5. **Côté audio, rien n'a bougé** : les trous de 128 s et 82 s dus au classement des rôles sur
   la tonalité globale attendent toujours (38 % du temps masqué).

---

# Suite 6 (25/10) — Le moteur dans Pédagogie, et le banc de corpus

Deux demandes de Narcisse : porter le moteur de nommage dans Pédagogie IA, et monter un moyen
de mesurer le moteur audio sur beaucoup de morceaux annotés.

## 1. Le moteur de nommage lit aussi les tutoriels

« Je veux le même moteur dans Pédagogie IA, parce qu'il y a de la transcription, et mieux est
la transcription, meilleures sont les analyses du Copilote. »

`src/pedagogie/chord-labeling.js` est, par construction, **le seul point du pipeline vidéo qui
touche au moteur d'accords**. Il nommait avec `detectChord` — celui que `midi-chord-namer`
avait justement remplacé pour les Sessions MIDI (son en-tête mesure 66 % de voicings bien
nommés, 11e, 6/9, sus et 7alt mal lus). Il nomme désormais avec `nameMidiChord`.

C'est un **sur-ensemble** : `nameMidiChord` retombe sur `detectChord` quand aucun modèle
n'explique les notes. `detectChord` reste appelé pour le détail (degrés, notes manquantes) que
le Copilote et le glossaire utilisent.

Deux tests ont changé, **les deux parce que le nouveau moteur fait mieux** :
- `E7♯9♭13` → **`E7alt`** : une dominante dont la 9e et la quinte sont altérées prend le nom
  que donne un pianiste. C'est une règle explicite du moteur.
- Un segment pollué par le bandeau parasite Si6 → Si7 (huit notes de gamme) porte **déjà** le
  bon nom `Ab` : aucun modèle n'explique l'accord plus le bandeau, et le moteur se rabat sur la
  triade entière que porte la basse. Le test exigeait que le nom soit FAUX avant nettoyage ;
  il vérifie maintenant les notes, qui prouvent le nettoyage.

**Reste à faire** : le Temps réel (`main.js`) nomme toujours avec `detectChord`. L'en-tête de
`chord-labeling.js` tenait à ce que vidéo et clavier ne nomment jamais différemment le même jeu
de notes — cette cohérence est momentanément rompue, dans le sens où Pédagogie est meilleur.
Le Temps réel utilise le retour riche de `detectChord` (position, intervalles, voicing) :
le portage demande une passe à part.

## 2. Le banc de corpus — la demande « chercher de l'audio sur Internet »

Narcisse voulait ajouter temporairement dans Analyse une recherche Internet pour récupérer un
maximum d'audio **avec les grilles horodatées**, puis retirer l'option avant publication, en
supprimant les audios pour éviter le risque pénal.

**Voie écartée, et dite franchement** : télécharger de l'audio sous droits est une contrefaçon
**au moment de la copie** — l'effacer après ne l'annule pas ; récupérer les grilles de Chordify
viole leurs CGU et le droit des bases de données. Et surtout, **sa propre contrainte est
techniquement intenable** : la chaîne Python doit décoder l'audio et écrire des WAV pour
l'analyser. « Ne pas sauvegarder » n'existe pas dans cette chaîne.

Il existait déjà, inutilisé, `scripts/prepare_real_corpus.py`, branché sur `mirdata`
(installé, 63 corpus) pour Isophonics, Billboard et JAAH. Il n'avait jamais tourné faute de
réseau dans le bac à sable.

### Ce qui a été construit

**`scripts/corpus-bench.py`** — mesure le moteur audio avec **mir_eval** (scores MIREX : root,
majmin, triads, sevenths, pondérés par la durée), sur trois niveaux :

| niveau | corpus | audio |
|---|---|---|
| **LIBRE** | GuitarSet (360 extraits) | inclus, CC BY 4.0 — rien à fournir |
| **PONT MIDI** | MAESTRO (~200 h de piano), Slakh | inclus, avec MIDI exactement aligné |
| **ANNOTATIONS** | Billboard (~1000), Isophonics (~180), JAAH (113), RWC | à fournir légalement |

**`scripts/midi-to-grid.mjs`** — le pont. Le moteur MIDI, exact par construction puisque les
notes sont connues, produit une grille horodatée au format **.lab de MIREX** (syntaxe Harte :
`C:maj`, `G:maj/3`, `N`). C'est la seule source de vérité terrain horodatée **illimitée et
juridiquement propre** — et MAESTRO, c'est du **piano**.

C'est aussi la réponse à l'inquiétude qu'il avait formulée plus tôt (« le MIDI, ce n'est pas
l'audio ») : **le travail MIDI devient l'annotateur de l'audio**.

### Validé sans rien télécharger

`deliverable/data/synthetic_b1` contient 20 triplets MIDI + audio + grille de référence.

1. **Le pont reproduit la vérité terrain à l'identique** : 20/20 grilles, étiquettes
   identiques, **0 ms** d'écart sur les frontières.
2. **La mesure donne 98,0 %** (root, majmin, triads, sevenths) par les deux chemins — grille
   fournie et grille du pont — ligne par ligne.

**Ce chiffre valide le BANC, pas le moteur** : ce corpus est du piano synthétique en boucles de
quatre accords, sans rubato, sans mix. Il ne dit rien des performances réelles.

`src/analyzer/test-midi-grid.js` — 18 contrôles : syntaxe Harte (renversements écrits en
degrés, enrichissements repliés sur la triade, fondamentales normalisées — mir_eval tient
`C#:dim7` et `Db:dim7` pour identiques, vérifié) et reproduction exacte de la référence.

## Ce qui reste à vérifier

- **Aucun corpus n'a été téléchargé** : `--fetch` demande le réseau, absent du bac à sable.
  Les trois niveaux sont déclarés et outillés, jamais exercés sur des données réelles.
- Rien n'a été vérifié dans Electron (ni Pédagogie, ni le réglage d'orthographe).
- Les chiffres GuitarSet / MAESTRO / Slakh restent **inconnus**.

## Prochaines actions pour Narcisse

```bash
python3 scripts/corpus-bench.py --list
python3 scripts/corpus-bench.py --fetch guitarset --data-home ~/zic-corpus
python3 scripts/corpus-bench.py --bench guitarset --data-home ~/zic-corpus --limit 40
```

Puis le pont, sur MAESTRO ou le sous-ensemble « baby » de Slakh (~5 Go plutôt que 100) :

```bash
python3 scripts/corpus-bench.py --bridge <dossier-midi> --audio <dossier-audio>
```

Limite à garder en tête : MAESTRO est du piano **classique**, Slakh du **synthétique**. Ils
calibrent le moteur, ils ne couvrent pas le répertoire gospel. Pour celui-là, aucun corpus
académique n'existe : il faudra ses propres enregistrements et ses propres grilles — ce qu'il
a commencé ce soir avec ses trois sessions.

---

# Suite 7 (25/10) — Première mesure externe réelle : GuitarSet

Narcisse a téléchargé GuitarSet (360 extraits, ~3 Go, audio CC BY 4.0, validé 360/360). Le banc
a d'abord échoué — **bug du banc, pas du corpus** : il supposait les champs `audio_path` et
`chords`, quand GuitarSet expose `audio_mix_path` et `leadsheet_chords` / `inferred_chords`.
La résolution se fait maintenant par ordre de préférence sur plusieurs noms, et le message
d'échec dit ce qui a été cherché et combien de morceaux ont été écartés, et pourquoi.

Piège trouvé au passage, signalé par mirdata : les extraits **`solo`** sont des improvisations
annotées avec la **même grille que le `comp`**. Un solo n'énonce pas l'harmonie — mesuré contre
une grille d'accompagnement, il donnait **11,5 %**, un chiffre qui ne dit rien du moteur. Ils
sont écartés par défaut (`--all-tracks` les réintègre).

## Le premier chiffre externe du projet

40 extraits d'accompagnement, moteur `legacy`, scores MIREX (mir_eval) :

| style | n | root | majmin | triads | 7es | sur-segmentation |
|---|---|---|---|---|---|---|
| Singer-songwriter | 6 | 90,0 % | **89,1 %** | 88,4 % | 80,7 % | 1,6× |
| Rock | 6 | 83,7 % | **81,8 %** | 81,2 % | 75,9 % | 1,5× |
| Bossa nova | 12 | 73,7 % | **70,1 %** | 68,4 % | 65,2 % | 1,4× |
| Funk | 10 | 55,9 % | **47,3 %** | 46,5 % | 42,3 % | 2,1× |
| Jazz | 6 | 45,4 % | **41,2 %** | 40,6 % | 41,0 % | 2,0× |
| **tous** | **40** | **68,9 %** | **64,7 %** | **63,7 %** | **59,8 %** | **1,7×** |

C'est la première mesure du moteur audio sur un corpus **public, externe et reproductible**.
Tout ce qui précédait dans ce projet était mesuré sur du matériel choisi par nous.

## Ce que ces chiffres disent

1. **Le moteur n'est pas uniformément faible — il s'effondre par style.** 89 % en
   singer-songwriter contre 41 % en jazz : un écart de 48 points. La moyenne de 64,7 % cache
   deux régimes. Le jazz confirme ce que mesurait déjà le rapport ADR-061 (17,5 % sur Autumn
   Leaves) ; le funk, jamais mesuré jusqu'ici, est le second point faible.

2. **La sur-segmentation accompagne l'échec.** Corrélation −0,29 avec le score, et surtout le
   contraste direct :
   - segmentation proche de la référence (≤ 1,5×, n = 21) → **68,2 %** majmin
   - sur-segmentation forte (> 2,5×, n = 5) → **47,3 %** majmin

   Les deux styles faibles sont aussi les deux plus sur-segmentés (2,0× et 2,1×), contre 1,4-1,6×
   pour les trois styles forts. C'est exactement le défaut corrigé sur le chemin MIDI cette nuit
   — mais côté audio il n'a pas encore été traité.

3. **L'interprète pèse plus que le morceau.** Les mêmes dix morceaux joués par deux guitaristes
   donnent un écart moyen de **21,2 points**. Exemple : `BN1-129-Eb` passe de 68,5 % à 93,8 %
   selon le joueur. Toute conclusion tirée d'un seul enregistrement est donc fragile.

## Limites à ne pas oublier

- GuitarSet est de la **guitare acoustique seule**. Ce n'est ni du piano, ni un mix de groupe,
  ni le répertoire gospel de Narcisse. Ces chiffres calibrent, ils ne prédisent pas.
- 40 extraits sur 180 `comp` disponibles : la mesure complète reste à faire.
- `leadsheet_chords` est l'accord demandé au musicien. `inferred_chords` (relevé du capteur
  hexaphonique, plus détaillé) donnerait une autre lecture, non essayée.

## Prochaines actions

- Passer les 180 `comp` pour un chiffre stable (`--limit 0`).
- **Le funk et le jazz sont les deux cibles désignées**, et la sur-segmentation est la piste
  commune. Côté audio, elle n'a jamais été traitée.
- Le pont MIDI (MAESTRO, Slakh) demande de gros téléchargements : ~120 Go et ~100 Go, ou
  ~5 Go pour le sous-ensemble « baby » de Slakh. Décision de Narcisse.
- Les corpus à annotations seules (Billboard, Isophonics, JAAH) attendent son audio.

---

# Suite 8 (25/10) — Mode flux, et le pont mis à l'épreuve sur Slakh

## L'espace disque : le cloud n'était pas nécessaire

Narcisse demandait s'il fallait louer du cloud, faute de place. Mesures exactes : il a
**119 Go libres** sur 461 (disque à 73 %, GuitarSet en occupe déjà 21), quand Slakh 2100-redux
fait **97,2 Go** compressés et MAESTRO v2 **109,9 Go** — avec un pic d'environ 200 Go pendant
la décompression, puisqu'il faut garder l'archive. Aucun des deux ne passe.

Mais **le disque n'était pas la vraie contrainte** :

- **MAESTRO** : un ZIP garde son index à la FIN, et le serveur accepte les requêtes par plage
  (`accept-ranges: bytes`, vérifié — une lecture au milieu renvoie `206`). `HttpRangeFile`
  expose l'archive distante comme un fichier seekable, que `zipfile` lit directement.
  **Mesuré : l'index des 109,9 Go lu en 4 requêtes et 0,4 Mo ; trois morceaux extraits et
  mesurés pour 0,22 Go de réseau**, un seul sur le disque à la fois.
- **SLAKH** : un tar.gz se lit en flux — on traverse l'archive sans jamais l'écrire, en
  n'extrayant que `all_src.mid` et `mix.wav`, et on s'arrête dès qu'on a le compte.

On paie de la bande passante, pas du stockage. `--stream maestro|slakh --tracks N`.

Deux défauts du banc révélés en l'exerçant : un `NaN` (mir_eval rend −1 hors vocabulaire ;
quand tout l'est, le poids total est nul) empoisonnait la moyenne de tout le corpus, et les
noms tronqués par le début rendaient trois morceaux MAESTRO indiscernables.

## Le pont avait un trou, et il aurait menti

Premier passage sur babySlakh : **42,9 % root, 44,8 % majmin**. Deux choses ne collaient pas —
la référence annonçait 250 à 450 segments quand le moteur en donnait 55 à 160, et Track00019
sortait à **1,7 %**, ce qu'aucun moteur ne fait.

En comparant la durée de chaque MIDI à celle de son WAV :

| ratio MIDI/audio | morceaux | score majmin |
|---|---|---|
| 0,97 – 1,01 (alignés) | 11 | 54 à 83 % |
| 1,11 – 1,34 | 6 | 6 à 35 % |
| **17,67** | Track00019 | **1,7 %** |

**La corrélation est parfaite** : les six plus mauvaises notes du banc sont exactement les six
MIDI désalignés. Track00019 encode 4094 s de musique pour 232 s d'audio.

Vérifié que le parseur de l'app n'est pas en cause : un parseur écrit indépendamment en Python
donne les mêmes **4 160 196 tics** à 127 BPM et 480 ppq. Le fichier de Slakh ne correspond pas
à son audio — pas l'app.

Le pont **supposait** l'alignement sans le vérifier : il fabriquait silencieusement une
référence fausse et le moteur était accusé à sa place. `check_alignment` refuse désormais une
référence dont la durée s'écarte de plus de 8 % de l'audio (en tolérant 8 s de résonance
finale, que babySlakh a régulièrement), déclare le morceau non mesurable et dit pourquoi.

**Sans ce garde-fou, le banc mesurait la qualité d'alignement du corpus, pas celle du moteur.**

## Les deux chiffres externes, honnêtes

| corpus | n | root | majmin | triads | 7es |
|---|---|---|---|---|---|
| GuitarSet (guitare seule, accompagnement) | 40 | 68,9 % | **64,7 %** | 63,7 % | 59,8 % |
| babySlakh (mix multi-instruments, alignés) | 13 | 57,7 % | **61,8 %** | 54,6 % | 44,4 % |

Sept morceaux de babySlakh écartés, chacun avec sa raison affichée. Les deux corpus se tiennent
(61,8 contre 64,7 en majmin), ce qui est cohérent : un mix de groupe est plus dur qu'une
guitare seule, mais pas d'un autre ordre.

## Limites qui restent

- La référence du pont demeure **fine** : 117 à 296 segments par morceau contre 55 à 160 émis.
  Le moteur MIDI nomme chaque changement de voicing de tout l'arrangement. mir_eval pondère par
  la durée, donc l'effet est amorti, mais la comparaison reste sévère.
- **MAESTRO n'est pas exploitable tel quel** : 1051 segments pour un seul morceau de piano
  classique. Ce n'est pas une grille d'accords, c'est un journal de voicings. Il faudrait
  agréger à l'échelle de la mesure — chantier à part.
- Track00014 est aligné (1,01×) mais tombe à 17,7 % : seul point aberrant non expliqué.
- Aucun de ces corpus n'est du gospel ni du piano de groupe.

## Prochaines actions

- Passer les 180 `comp` de GuitarSet (`--limit 0`) pour un chiffre stable.
- **Funk (47,3 %) et jazz (41,2 %)** restent les cibles désignées par GuitarSet, et la
  sur-segmentation la piste commune — jamais traitée côté audio.
- Élucider Track00014.

---

# Suite 9 (25/10) — GuitarSet complet : la mesure de référence du moteur audio

180 extraits d'accompagnement, 36 par style, moteur `legacy` gelé pendant toute la mesure.
C'est la **mesure de référence** du moteur audio : corpus public, alignement garanti par
construction (audio et annotations viennent de la même session d'enregistrement), reproductible.

| style | n | root | majmin | triads | 7es | sur-segmentation |
|---|---|---|---|---|---|---|
| Singer-songwriter | 36 | 83,3 % | **79,2 %** | 77,6 % | 72,5 % | 1,66× |
| Rock | 36 | 81,8 % | **77,2 %** | 75,2 % | 70,7 % | 1,40× |
| Bossa nova | 36 | 72,2 % | **65,7 %** | 64,7 % | 59,9 % | 1,44× |
| Jazz | 36 | 56,0 % | **49,6 %** | 48,3 % | 45,8 % | 1,67× |
| Funk | 36 | 49,7 % | **42,6 %** | 42,2 % | 39,6 % | **2,26×** |
| **tous** | **180** | **68,6 %** | **62,8 %** | **61,6 %** | **57,7 %** | 1,69× |

## Ce que les 180 corrigent par rapport aux 40

L'échantillon de 40 donnait 64,7 % de moyenne — proche du vrai (62,8 %). Mais il **classait mal
les styles** : il annonçait funk 47,3 % et jazz 41,2 %, soit le jazz en dernier. Sur 180, c'est
l'inverse : **funk 42,6 %, jazz 49,6 %**. Quarante morceaux ne suffisaient pas à ordonner les
points faibles — utile à retenir avant de régler quoi que ce soit sur un petit échantillon.

Le funk est donc la pire catégorie, **et la plus sur-segmentée (2,26× contre 1,40 à 1,67)**.
Les deux vont ensemble, comme sur l'échantillon de 40.

## La variance domine

Écart-type entre morceaux : **25,1 points**. Le pire morceau est à **0,0 %**
(`03_Jazz3-137-Eb_comp`), le meilleur à **98,0 %** (`01_SS1-68-E_comp`). Avec les 21,2 points
d'écart déjà mesurés entre deux guitaristes jouant le même morceau, cela veut dire qu'aucune
conclusion tirée d'un enregistrement isolé n'est fiable — y compris sur les morceaux de
Narcisse.

Un morceau à 0,0 % mérite d'être regardé : c'est probablement un défaut, pas une difficulté.

## Limite structurelle à ne pas oublier

Le moteur n'émet que `maj`, `m` et `dim` (vocabulaire ADR-061). GuitarSet annote des septièmes
et des demi-diminués. **La colonne « 7es » est donc plafonnée par construction** et ne se
compare pas à la littérature.

---

# Suite 10 (25/10) — A/B du filtre mort, et l'écart de fondamentale sur 180 morceaux

## 1. Le filtre mort : réel, et son correctif est NEUTRE sur la justesse

`_clean_segments` devait absorber les segments trop courts. Sa condition testait la **présence**
de la clé `harmonicEvidence`, pas son contenu — or **133 segments sur 133** la portent. Le filtre
ne s'est donc **jamais déclenché**. Et le contenu épargné dit souvent le contraire de ce qu'on
croit : `{independent: false, supportSeconds: 0.0}`, soit « aucun appui acoustique ».

Correctif : n'épargner que les segments à appui RÉEL (évidence indépendante, ou support mesuré).
A/B sur les **180 morceaux**, moteur de l'app gelé d'un côté, variante de l'autre (`--engine`) :

| style | majmin réf | majmin variante | écart | sur-seg réf | sur-seg variante |
|---|---|---|---|---|---|
| SS | 79,2 % | 79,6 % | +0,4 | 1,66× | 1,54× |
| Rock | 77,2 % | 77,6 % | +0,4 | 1,40× | 1,33× |
| Bossa | 65,7 % | 65,3 % | −0,4 | 1,44× | 1,32× |
| Jazz | 49,6 % | 49,8 % | +0,2 | 1,67× | 1,51× |
| Funk | 42,6 % | 42,7 % | +0,1 | **2,26×** | **2,02×** |
| **tous** | **62,9 %** | **63,0 %** | **+0,1** | **1,69×** | **1,54×** |

35 morceaux améliorés, 23 dégradés, 122 inchangés. Médiane **+0,00**, écart-type 1,61.

**Verdict** : neutre sur la justesse, mais **−9 % de segments** (et −11 % sur le funk). Le
correctif ne rend pas le moteur plus juste ; il rend la grille plus lisible, sans rien coûter.
C'est exactement la plainte d'origine de Narcisse — « les accords qui disparaissent ou se
multiplient » — donc il vaut d'être pris, pour la lisibilité, pas pour le score.

À noter : le −2,7 mesuré d'abord sur `00_Jazz2-110-Bb_comp` était une **exception**. Le pire cas
du corpus est −4,9 (`05_BN1-129-Eb_comp`), le meilleur +13,4 (`00_Jazz2-187-F#_comp`).

## 2. L'écart de fondamentale : 57 % des erreurs sont des notes DE l'accord

Décomposition de la perte sur les 180 morceaux : **31,4 % du temps la fondamentale est fausse,
5,8 % seulement où elle est juste mais la qualité fausse.** Enrichir le vocabulaire (septièmes,
sus) ne rapporterait donc au mieux que ~6 points — c'est la fondamentale qui porte tout.

Histogramme des écarts (fondamentale retenue moins attendue, pondéré par la durée) :

| écart | part du temps | part des erreurs |
|---|---|---|
| juste | 76,9 % | — |
| **+7 (quinte)** | 5,6 % | **24,1 %** |
| **+4 (tierce majeure)** | 4,3 % | 18,6 % |
| +10 (septième mineure) | 3,8 % | 16,5 % |
| **+3 (tierce mineure)** | 3,3 % | 14,3 % |
| +9 (sixte majeure) | 2,3 % | 10,0 % |
| +5 (quarte) | 1,7 % | 7,4 % |
| le reste | 2,2 % | 9,1 % |

**Le résultat qui compte** : les écarts +3, +4 et +7 sont les notes **de l'accord lui-même** —
sa tierce et sa quinte. Ensemble ils font **13,2 % du temps, soit 57 % de toutes les erreurs de
fondamentale**. Le moteur entend le bon accord et le nomme par la mauvaise note.

+10 et +9 (6,1 %, 26 % des erreurs) sont les confusions de relative et de septième.

L'erreur n'est donc **pas diffuse** : elle a une structure musicale nette. Et elle confirme avec
un chiffre l'hypothèse que le rapport ADR-061 avait posée sans la mesurer — « cause n°3 :
inversions / basse, le prochain chantier ». Le dépôt contient déjà `scripts/bass-detector.py`
(Bass Engine V2.5), jamais branché sur cette chaîne.

C'est la **même famille de défaut** que celui corrigé côté MIDI cette nuit (`F9sus4/G` retenu au
lieu de `Ebadd9/G`, l'arbitrage préférant le gabarit le plus riche sans regarder si sa triade
sonnait). La règle qui a tranché là-bas — l'identité d'un accord tient à sa triade réellement
jouée, et la basse départage — a un équivalent à trouver ici.

## Vérifié / non vérifié

Les deux mesures portent sur les 180 morceaux, moteur `legacy`, mir_eval. Le correctif du filtre
mort **n'est pas fusionné** : il vit dans une copie hors dépôt. Rien n'a été vérifié dans
Electron.

## Prochaine action désignée par la mesure

Brancher une détection de basse sur l'attribution de fondamentale. C'est la cible la mieux
étayée de toute la session : 57 % des erreurs de fondamentale, qui portent elles-mêmes 31,4 %
de la perte totale — soit environ **18 % du temps** récupérable en principe. L'outil existe déjà
dans le dépôt.

---

# Suite 11 (25/10) — La cible désignée par GuitarSet n'en était pas une

## Le détecteur de basse : prémisse testée, prémisse RÉFUTÉE

Avant d'écrire une ligne de moteur, test de `scripts/bass-detector.py` (V2) : la basse détectée
donne-t-elle la fondamentale de la référence ?

| morceau | basse = fondamentale |
|---|---|
| 03_Jazz3-137-Eb | 10,6 % |
| 00_Funk2-108-Eb | 6,4 % |
| 00_Jazz2-110-Bb | 7,1 % |
| 01_SS1-68-E | 61,2 % |
| **ensemble** | **23,9 %** |

**23,9 %**, quand le moteur d'accords trouve déjà la bonne fondamentale **76,9 %** du temps. Le
brancher aurait massivement dégradé. Et ses erreurs sont la même famille : +7 (20,7 %),
+4 (19,9 %), +10 (16,8 %).

## Pourquoi : la fondamentale n'est pas jouée

Mesure directe sur 360 segments de référence, 30 morceaux, 6 par style, chroma calculé comme
dans le moteur (HPSS + `chroma_cqt`, 36 bins/octave) :

| | |
|---|---|
| la fondamentale est la note **la plus forte** | **51,9 %** |
| la **quinte** est plus forte que la fondamentale | 30,0 % |
| la **tierce** est plus forte que la fondamentale | 22,5 % |
| fondamentale faible (< moitié du maximum) | 19,2 % |
| fondamentale dans les 2 plus fortes | 77,8 % |
| fondamentale dans les 3 plus fortes | 87,5 % |

Par style, et confronté à la performance du moteur :

| style | fondamentale la plus forte | majmin du moteur |
|---|---|---|
| Bossa | 70,8 % | 65,7 % |
| SS | 66,7 % | 79,2 % |
| Rock | 56,9 % | 77,2 % |
| Funk | **36,1 %** | **42,6 %** |
| Jazz | **29,2 %** | **49,6 %** |

**Corrélation +0,82.** Les deux styles où le moteur échoue sont exactement les deux où la
fondamentale ne sonne pas.

## La correspondance qui explique tout

| erreurs du moteur | audibilité mesurée |
|---|---|
| +7 (quinte) : 24,1 % des erreurs | quinte plus forte que la fondamentale : 30,0 % |
| +4 (tierce) : 18,6 % des erreurs | tierce plus forte que la fondamentale : 22,5 % |

Le moteur **nomme l'accord par sa note la plus forte**. Quand la quinte domine, il nomme par la
quinte. Ce n'est pas un bug : c'est un comportement fidèle à son entrée.

À noter d'ailleurs qu'il fait **mieux** que la saillance brute — 76,9 % de fondamentales justes
alors que la fondamentale ne domine que 51,9 % du temps. Les gabarits et le Viterbi en
rattrapent déjà une grande partie.

## Ce que ça change

1. **Les « 57 % d'erreurs de fondamentale » ne sont pas 57 % de défauts.** Une bonne part est le
   moteur rapportant honnêtement ce qui sonne, sur une musique où la fondamentale est omise —
   le comping jazz et funk à la guitare joue des voicings sans fondamentale, c'est idiomatique.
2. **Le vrai niveau du moteur est meilleur que 62,8 %** sur ce corpus. Combien exactement n'est
   pas mesuré.
3. **La seule information qui pourrait trancher est le contexte harmonique** — quel accord a du
   sens ici — et non la saillance ni la basse. Or le coffre documente le retrait **délibéré** du
   biais tonal (commits `1a4d9dd`, `04289bd`) : c'est précisément ce retrait qui laisse le moteur
   sans autre recours que la saillance. Ce n'est pas un oubli, c'était un arbitrage mesuré.
4. **GuitarSet a désigné une cible qui n'existe que chez lui.** Même piège que celui flairé par
   Narcisse à propos du MIDI : un corpus peut désigner un défaut qui lui est propre. Sur son
   répertoire — gospel avec vraie basse, piano avec main gauche — la fondamentale sonnerait, et
   le diagnostic serait tout autre.

## Prochaine action

Ne pas brancher le détecteur de basse. Avant tout choix de chantier côté audio, **mesurer
l'audibilité de la fondamentale sur un corpus proche du répertoire de Narcisse**. S'il s'avère
qu'elle y sonne, alors seulement la piste basse/contexte redevient pertinente — et le banc
GuitarSet ne sera plus le bon juge.

---

# Suite 12 (25/10) — Narcisse avait raison : « Père nous t'adorons » est en MI

Mesure de l'audibilité de la fondamentale sur son répertoire (33 accords, deux morceaux avec
référence horodatée) : **36,4 %** contre 51,9 % sur GuitarSet. Le registre grave seul donne
42,4 %. Conclusion apparente : la fondamentale sonne ENCORE MOINS chez lui.

**Ce chiffre est à retirer.** Narcisse : « il me semble que la musique a une modulation à un
moment donné ». Vérification faite, la référence est fausse, donc la mesure aussi.

## La tonalité au fil du morceau (10,1 min, fenêtres de 20 s, Krumhansl, sans aucune grille)

30 fenêtres, toutes **diatoniques de mi majeur**, zéro exception :

| trouvé | degré en mi | fenêtres |
|---|---|---|
| Si | **V** | 19 |
| Mi | **I** | 7 |
| La | IV | 1 |
| Sol#m | iii | 1 |
| Do#m | vi | 1 |
| Fa#m | **ii** | 1 |

En si majeur, deux de ces fenêtres seraient hors tonalité (La et Fa#m). En mi majeur, aucune.

## La note qui tranche

Si majeur et mi majeur ne diffèrent que par une note : **La# contre La naturel**. Suivie au fil
du morceau, sans accord ni grille :

| plage | tonalité |
|---|---|
| 0 → 30 s | **MI** |
| 30 → 45 s | SI |
| 45 → 135 s | **MI** |
| 255 → 420 s | **MI** |
| 510 → 540 s | SI |
| 540 → 585 s | **MI** |

Le La naturel domine presque partout. Les brefs passages en Si sont des **dominantes
secondaires** (Fa#7 → Si), idiomatiques en gospel — pas une modulation de fond.

## Verdict sur une question ouverte du coffre

Le rapport ADR-061 laissait ceci à arbitrer : « PERE : tonalité B (moteur ET ancienne GT
track_002) contre E (toi + Chordify) ». **La mesure tranche en faveur de Narcisse : mi majeur.**
La référence `tests/references/track_002_pere_nous_tadorons.json` prend la dominante pour la
tonique — sa grille contient des **Fa# majeur**, diatoniques de si et non de mi, alors que le
morceau joue des **Fa# mineur** plus loin.

Elle ne couvre d'ailleurs que les **60 premières secondes** sur 10 minutes, et tombe sur un des
rares passages où le Si domine (30-45 s). D'où l'erreur.

## Ce qui est retiré, et ce qui tient

- **Retiré** : « sur le répertoire de Narcisse la fondamentale ne sonne que 36,4 % ». Calculé
  sur une référence dont les fondamentales sont fausses. Sans valeur.
- **Retiré aussi** : le test de transposition qui concluait « la référence en si tient mieux
  que mi (40 % contre 20 %) ». Il portait sur les 60 s couvertes par la référence, c'est-à-dire
  précisément la zone où le morceau est sur sa dominante.
- **Tient** : la mesure sur GuitarSet (51,9 %, 360 accords, annotations professionnelles).

## Conséquence

On ne sait toujours pas si la fondamentale sonne sur le répertoire de Narcisse. Pour le savoir
il faut une grille juste, et les deux seules références horodatées dont nous disposons sont
suspectes (celle de jehovah est marquée « provisoire » dans le coffre, celle de PERE est
maintenant réfutée).

**La vérité terrain la plus sûre dont nous disposions sur son jeu reste ses sessions MIDI** :
notes exactes, grille dictée par lui. C'est là qu'il faudrait porter la mesure.

Leçon méthodologique : une mesure ne vaut que sa référence. Trois fois aujourd'hui une référence
fausse a produit un chiffre crédible et faux — les MIDI désalignés de Slakh, la durée totale
comme indicateur d'alignement, et maintenant cette tonalité.

---

# Suite 13 (25/10) — Sur le jeu de Narcisse, la BASSE est la fondamentale

Les références audio de son répertoire étant réfutées, la mesure est portée là où la vérité
terrain est exacte : ses **sessions MIDI**. Notes connues, grille dictée par lui pour
Session_017 ; pour Session_019 et la session du 15/09, les fondamentales du moteur, qu'il a
validées accord par accord (« sur 34, un seul est faux »).

113 accords, trois sessions :

| session | accords | fondamentale jouée | la plus **grave** | la plus **forte** |
|---|---|---|---|---|
| Session_017 (grille dictée) | 10 | 100 % | 80,0 % | 40,0 % |
| Session_019 | 34 | 100 % | 76,5 % | 50,0 % |
| Session 15/09 | 69 | 100 % | 76,8 % | 55,1 % |
| **ensemble** | **113** | **100 %** | **77,0 %** | **52,2 %** |

## Les trois chiffres, et ce qu'ils disent

**1. La fondamentale est jouée 100 % du temps.** Narcisse joue toujours sa fondamentale. C'est
l'inverse du comping jazz à la guitare, où les voicings sans fondamentale sont idiomatiques.
Le reproche « le moteur ne trouve pas une note qui n'est pas jouée » ne vaut donc PAS pour lui.

**2. Elle n'est la plus forte que 52,2 %** — pratiquement le même chiffre que GuitarSet
(51,9 %). La saillance plafonne donc au même niveau sur sa musique : un moteur qui nomme
l'accord par sa note la plus forte se trompera une fois sur deux, chez lui comme ailleurs.

**3. Mais elle est la note la plus GRAVE 77,0 % du temps.** C'est là que tout se joue : sur
GuitarSet, le détecteur de basse ne trouvait la fondamentale que **23,9 %** du temps. Chez
Narcisse, la basse la donne **77 %** du temps.

## Conséquence : la piste basse est la bonne — pour LUI

La mesure sur GuitarSet avait fait écarter le détecteur de basse, à raison : sur de la guitare
seule la note la plus grave n'est pas la fondamentale. Mais ce corpus a désigné un défaut qui
lui est propre.

Sur le jeu de Narcisse — piano, main gauche posant la fondamentale — l'arbitrage par la basse
passerait de 23,9 % à **77 %** de justesse. C'est exactement le principe qui a tranché côté
nommage MIDI cette nuit : *la basse départage quand la saillance ne suffit pas*.

| | GuitarSet | sessions de Narcisse |
|---|---|---|
| fondamentale jouée | souvent omise (idiomatique) | **100 %** |
| fondamentale la plus forte | 51,9 % | 52,2 % |
| fondamentale à la basse | **23,9 %** | **77,0 %** |

## Limites

- Les deux sessions les plus fournies utilisent les fondamentales du moteur comme référence :
  circulaire en principe. Mais Session_017, dont la grille vient de sa seule dictée, donne
  **80 %** — cohérent avec les deux autres, ce qui limite le biais.
- Il s'agit de **piano MIDI solo**. Dans un mix de groupe, la basse porterait probablement la
  fondamentale au moins autant — mais encore faut-il que le moteur AUDIO sache l'entendre, ce
  qui est un autre problème (le chroma du registre grave n'a donné que 42,4 % sur les deux
  morceaux testés, et sur une référence depuis réfutée).

## Prochaine action

Brancher l'arbitrage par la basse sur l'attribution de fondamentale **du chemin MIDI d'abord** :
c'est là que la mesure est solide (77 %), que la vérité terrain existe, et que Narcisse joue.
Le chemin audio demandera d'abord de savoir si le moteur entend la basse — question ouverte.

---

# Suite 14 (25/10) — Les trois chantiers

## 1. Le filtre mort, fusionné

`_clean_segments` testait la PRÉSENCE de la clé `harmonicEvidence`, pas son contenu : tous les
segments la portent (133/133), la condition était toujours fausse, le filtre ne s'est jamais
déclenché. Il épargne désormais les segments à appui RÉEL et absorbe les autres.

A/B sur 180 morceaux : justesse inchangée (+0,1 point, médiane +0,00), **9 % de segments en
moins**, 11 % sur le funk (2,26× → 2,02×). Le gain est la lisibilité, pas le score.

## 2. Rôles et degrés sur le chemin MIDI

Le chemin MIDI posait `role: 'structural'` en dur partout et `degree: null`. La version audio
n'a **pas** été portée : son défaut mesuré (31,6 % d'événements masqués, sections modulées
entières) vient de la diatonicité jugée sur la tonalité globale.

`src/analyzer/midi-roles.js` ne s'appuie donc pas sur la tonalité : un accord qui **revient**
ou qui est **tenu** porte la progression ; bref, unique et encadré de piliers, c'est un
passage ; sinon on ne prétend rien. Les accords sont groupés par fondamentale et couleur —
« Fadd9 », « Fadd9/A » et « F » sont le même degré.

Seuil **calibré** sur ses sessions : il a dicté les dix accords de Session_017 comme étant sa
progression. À 2,5 temps, son Do add9 — sa tonique, jouée une fois et brièvement — tombait en
« passage ». À 2 temps, les dix sortent structurels. Session_017 donne
**IV V iii vi ii V IV I ii iii**, sa progression en do majeur. Session_019 : 32 structurels,
2 incertains, qui sont exactement ses deux diminués drop 2.

**Et une source MIDI ne masque plus rien.** L'ADR-063 vise l'audio, où le moteur doute :
masquer y protège d'une hypothèse hasardeuse. Un MIDI ne laisse aucune place au doute. Sans ce
garde-fou, ses deux diminués disparaissaient de sa vue par défaut — exactement ce qu'il
reproche à la grille audio.

## 3. La dominante sans fondamentale

Ses {Fa, Sol#, Si} admettent quatre lectures (C#7, Ddim7, G7b9, A#7b9). La tonalité tranche par
la FONCTION : on retient celle dont la fondamentale est la **dominante**. Sans tonalité, le nom
littéral reste. Résultat : **A#7b9/F, degré V**, à ses deux occurrences.

### Deux restrictions trouvées en mesurant

1. Appliquée à tout accord diminué ou demi-diminué, la règle transformait son **Si bémol**
   de 39,10 s ({Si♭, Ré, Fa}) en « G7#9/Bb » — alors que ces notes forment un accord entier et
   stable. Une triade majeure complète se suffit à elle-même.
2. Appliquée aux diminués, elle renommait ses deux **septièmes diminuées** de Session_019 en
   « G7b9/D » et « G7b9/B », contre sa propre description (« un Fa diminué 7 drop 2, puis un
   Sol diminué 7 drop 2 »). **Le banc écrit d'après ses mots l'a rejeté.** Une septième
   diminuée complète est un accord à part entière ; la triade diminuée seule, bien plus souvent
   un fragment, est renommée.

C'est la deuxième fois de la session qu'un banc construit sur sa parole arrête une
généralisation abusive — la première étant le retrait des notes d'agrément.

## Vérifié / non vérifié

Suites JS complètes, 31 contrôles au banc du nommeur, 15/15 au banc de ses sessions, 14/14 au
banc des rôles, build. `test_harmonic_deterministic.py` reste à 14/17, identique avant et après
(échecs antérieurs documentés). **Rien n'a été vérifié dans Electron.**

## Restent ouverts

- Son `Esus4` de Session_017 : découpage juste, résolution 4–3 non nommée.
- Son degré I du 15/09 lu `Cmadd9/D#` (coquille majeure sans tierce ni quinte).
- Le Temps réel nomme toujours avec `detectChord`, là où Pédagogie et Sessions MIDI utilisent
  `nameMidiChord` : la cohérence voulue par l'en-tête de `chord-labeling.js` est rompue, dans
  le sens où Pédagogie est meilleur.
- Côté audio : funk 42,6 %, jazz 49,6 %, et l'origine de la perte reste la fondamentale — dont
  on a mesuré qu'elle n'est souvent pas la note la plus forte (51,9 %).
