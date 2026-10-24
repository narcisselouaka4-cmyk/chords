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
