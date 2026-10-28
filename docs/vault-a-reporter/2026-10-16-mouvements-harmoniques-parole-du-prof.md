---
title: "Les mouvements harmoniques : la parole du prof fixe la tonalité et les degrés"
type: feature
date: 2026-10-16
status: livré (non vérifié dans Electron)
tags:
  - piano-jazz-chords
  - pedagogie-ia
  - guide-tuto
  - mouvements-harmoniques
  - transcription
---

# Les mouvements harmoniques : ce que le prof DIT l'emporte sur ce que le moteur devine

## Ce qui a été fait

### Le vrai défaut trouvé par la mesure

Mon constat de la veille — « le moteur ne relève **aucun** mouvement harmonique sur *Passing
chords… Drop 2* » — était **faux**. Il datait d'avant le correctif du clavier teinté. Après la
relecture (révision 4), le relevé donne 769 notes à l'image, un recoupement au son fiable, et
**5 mouvements**. Le problème n'était pas la quantité mais la **justesse** :

| | Ce que dit le prof | Ce qu'affichait le guide |
|---|---|---|
| tonalité | « the key of **C sharp** » (1:09) | La♭ majeur (devinée) |
| sujet | « from the chord **I** to the chord **V** » (×4) | « **4 → 1** » |
| boucle | 1 – 5 | 4 – 1 |

Le prof **annonce** sa tonalité et ses degrés ; le moteur les devinait d'après les accords relevés
et tombait sur la dominante. Tous les degrés du guide étaient donc décalés d'une quinte, et le guide
disait littéralement le contraire du tutoriel. C'est la substance de « en gros le guide tuto ne nous
aide pas du tout à comprendre la vidéo ».

### Le correctif

Nouveau module pur **`src/pedagogie/spoken-theory.js`** : il lit dans la transcription
- la **tonalité annoncée** (« the key of C sharp », « in F major », « en ré bémol majeur »,
  « tonalidad de sol menor ») ;
- les **degrés nommés** (« chord I », « the 5 », « chord 2 », « degré 4 ») ;
- les **suites énoncées** (« a 6, 5 chord progression », « a 2-5-1 turnaround »,
  « from the chord I to the chord V ») ;
- le **vocabulaire employé** (drop 2, accord de passage, notes de passage, upper structure,
  renversement, marche harmonique, emprunt, voicing, quartes, triton…).

Trois langues, parce que la bibliothèque en compte trois. Aucune déduction harmonique : le module
**lit**, il ne conclut pas.

Branché dans `tutorial-guide.js` :
1. la tonalité annoncée devient celle de la partie — **si ce qu'il joue la soutient** ;
2. les degrés qu'il nomme classent les mouvements (`said.pair`, `said.degrees`) ;
3. ses mots sont rattachés au passage où il les prononce et s'affichent sur la case ;
4. `alignKeys` ne recalcule plus une tonalité qu'il a annoncée, et une partie annoncée sert de
   référence avant toute autre.

### Le garde-fou, mesuré et non supposé

Sa phrase peut être mal transcrite, ou ne concerner qu'un exemple. Elle n'est retenue que si la part
de ce qu'il joue qui tient dans sa gamme (`keyCoverage`, nouvelle dans `song-structure.js`) n'est pas
franchement inférieure à celle de la tonalité devinée (marge de 5 points) :

| vidéo | annoncée | couverture annoncée | couverture devinée | retenu |
|---|---|---|---|---|
| Drop 2 | Ré♭ | **100 %** | 95 % (La♭) | sa phrase |
| Salsa (ES) | Sol mineur | 73 % | **91 %** (Si mineur) | le jeu |
| Next Level, Key Borrowing, Amazing Grace | = devinée | — | — | identique |

### Un bug latent révélé au passage

En changeant la tonalité d'une partie, les mouvements sont tombés à **zéro**. Cause :
`partProgression` prenait les `interval` rendus par `songStructure` — comptés depuis le tonique que
`songStructure` **devinait pour elle-même** — et les ajoutait au tonique de la **partie**. Tant que
les deux coïncidaient (par accident), les `pc` étaient bons ; dès qu'ils différaient (Ré♭ contre
La♭ : 5 demi-tons), plus aucun accord de la boucle n'était reconnu dans sa propre boucle, donc plus
un seul mouvement. Correctif : la tonalité de la partie est **donnée** à `songStructure`, et la
fondamentale de chaque accord est lue sur son nom (`rootOf`) plutôt que recalculée.

Ce bug était là avant ce travail, silencieux. Il aurait frappé n'importe quelle vidéo où la tonalité
d'une partie diffère de celle que la structure devine.

### Quatre autres correctifs issus de la même mesure

- **Une case par mouvement**, plus une par geste : « 1 → 5 » apparaissait deux fois (une fois en
  direct, une fois par un accord de passage), « 5 → 1 » aussi — quatre cases pour deux enseignements.
  La case porte maintenant tous ses gestes et rejoue son passage le plus riche.
- **Le vocabulaire rattaché au bon passage** : en prenant la fenêtre du premier au dernier passage
  d'un mouvement répété 7 fois sur 19 minutes, tout le vocabulaire de la vidéo se collait à chaque
  case (« renversement · drop 2 » partout sur *Above All*).
- **« en 3 tonalités »** ne s'affiche plus quand les trois parties sont dans la même tonalité
  (*Amazing Grace*).
- **Un décompte n'est pas une progression** : « 1, 2, 3, 4 », cinq fois dans la vidéo de salsa, était
  lu comme une progression annoncée — le Copilote l'aurait attribuée au prof. Une suite de chiffres
  ne compte que si un mot musical la nomme (« a 6, 5 **chord progression** », « a 2-5-1
  **turnaround** »). Mesuré : salsa, Key Borrowing et « comment harmoniser » n'annoncent alors plus
  rien (c'était du comptage de gamme), Drop 2 annonce 1→5 quatre fois, McCoy annonce 2-5.

## Ce qui a été vérifié, et comment

- **Mesure avant/après sur 10 relevés réels** de la bibliothèque (anglais, français, espagnol), en
  rejouant le vrai chemin de `pedagogie-tab.js` (`teacherActivity` → `chordsWhilePlaying` →
  `buildTutorialGuide` → `buildHighlights`). Scripts dans le scratchpad, hors dépôt.
- Résultat sur *Drop 2* : `PROGRESSION 1 – 5 · Ré♭ majeur`, puis
  `1 → 5 — drop 2 · avec accord de passage · 5 fois` et `5 → 1 — avec accord de passage · 2 fois`.
  C'est le sujet même de la vidéo, dans sa tonalité.
- Le contexte du Copilote contient maintenant : « tonalité(s) annoncée(s) : Ré♭ majeur (« key of
  C sharp », à 1:09) », « degrés qu'il nomme : 5 (12 fois), 1 (7 fois) », « vocabulaire qu'il
  emploie : drop 2, notes de passage ». Et les 20 premières secondes se lisent « il joue », plus
  « il parle ».
- Tests : **51 nouveaux** (`test-spoken-theory.js`, dont les pièges « in a major way », « en
  mi-chemin », « I » pronom anglais, le décompte), 56 guide (12 nouveaux sur la tonalité annoncée),
  22 cases, 182 DOM, 97 moteur, 247 Copilote, Parties 1 et 3, `npm run build` OK.

## Ce qui reste à vérifier

- **Rien n'a été vu tourner dans Electron.** Le guide est recalculé à l'affichage : **aucune
  ré-analyse n'est nécessaire**, il suffit de relancer l'app. À confirmer à l'écran : la pastille de
  tonalité (fond légèrement accentué, phrase au survol) et les nouvelles cases.
- Les titres de chapitres déjà gardés dans les fiches ne sont pas invalidés (`matchChapterTitles` les
  retrouve par recouvrement de temps) ; la demande à l'IA reçoit désormais l'annonce du prof, donc un
  tuto **déjà nommé** gardera ses anciens titres. Pour en voir l'effet, il faut un tuto non encore
  nommé (ou vider `chaptersFr` de sa fiche).
- Le motif anglais « in X major » exige une **majuscule** sur la note : si une transcription écrit
  « in f major », la tonalité n'est pas lue. Choix assumé (sans la majuscule, « in a major way »
  devenait « en La majeur »), mais à surveiller.

## À mettre dans decisions/

**ADR — « Ce que le prof annonce l'emporte sur ce que le moteur devine. »** La parole est la source
la plus sûre sur la tonalité et les degrés : le prof sait ce qu'il joue, le moteur le devine. Sa
phrase est retenue dès que son jeu ne la contredit pas franchement (marge mesurée de 5 points de
couverture). Ce qu'il n'annonce pas reste au moteur ; ce qu'il n'annonce pas n'est pas inventé.
Complète ADR-052 (les degrés plutôt que les noms d'accords) et ADR-056 (la progression écrite).

**ADR — « Une suite de chiffres n'est une progression que si elle se nomme. »** Mesuré : le décompte
« 1, 2, 3, 4 » et le comptage de gamme (« 1, 2, 3, 4, the 4 is B-flat ») représentaient la majorité
des suites détectées. Une attribution au prof exige un mot musical.

## À mettre dans experiments/

- **EXP — chercher la boucle d'*Above All* par fenêtres.** 250 accords des deux mains sur 19 min
  donnent **0 candidat de boucle** sur l'ensemble ; par fenêtres de 150 s, une seule fenêtre
  (7:30–10:00) en donne une — et ce n'est pas le 6-2-5 qu'il annonce. Conclusion : la boucle
  d'*Above All* n'est pas récupérable en préférant un candidat annoncé, il n'y a pas de candidat.
  Piste non suivie (Narcisse : « laisse de côté Above All pour le moment ») : découper les parties
  sur les tonalités annoncées — mais ses 8 annonces se bousculent entre 10:49 et 13:51 (il compare
  des tonalités), ce qui ferait du bruit.
- **EXP — afficher la progression annoncée.** Abandonné après mesure : `announcedProgression` rendait
  « 7-3 » sur *Above All* (bruit) et « 1-2-3-4 » sur la salsa (un décompte). C'est ce qui a conduit
  au garde-fou « une suite doit se nommer » plutôt qu'à un affichage.

## Prochaines actions

1. Narcisse relance l'app et ouvre *Drop 2* : le guide doit dire **Ré♭ majeur**, **1 – 5**, et
   « 1 → 5 · drop 2 ».
2. Reste du plan : demander le genre à l'import (tranche 2), la vue cover (tranche 3), replier la
   zone sous la vidéo et le Copilote (tranche 5).
3. *Above All* — mis de côté sur sa demande.

## Questions pour Narcisse

- Faut-il **dire à l'écran** que la tonalité vient de sa bouche, plus visiblement qu'au survol de la
  pastille ? (Aujourd'hui : fond légèrement accentué + phrase au survol.)
- Les cases affichent ses mots à lui (« drop 2 », « notes de passage »). Veux-tu aussi, quand il
  n'emploie aucun mot, que l'application nomme le procédé qu'elle reconnaît elle-même (upper
  structure par exemple), ou vaut-il mieux rester silencieux dans ce cas ?

## Liens

[[decisions/ADR-052-pedagogie-degres-plutot-que-noms-accords]] ·
[[decisions/ADR-056-pedagogie-progression-ecrite-et-sous-reperes]] ·
[[bugs/open/pedagogie-clavier-teinte-tout-lu-comme-allume]] ·
[[bugs/open/pedagogie-whisper-segments-mentent-sur-le-debut]] ·
[[features/pedagogie-ia/2026-10-15-guide-des-procedes]]
