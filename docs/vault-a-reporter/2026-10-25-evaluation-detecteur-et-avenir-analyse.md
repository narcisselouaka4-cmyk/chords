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
