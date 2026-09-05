# Pédagogie IA — compréhension de tutoriel vidéo

> Chantier ouvert le 05/09/2026. Document tenu **en cours de travail**, pas
> rédigé à la fin : il doit permettre de reprendre le chantier en l'état.

## 0. Deux documents cités par le prompt n'existent pas sur le disque

`spec-pedagogie-ia-comprehension-tutoriel-video.md` et
`retour-analyse-you-are-yahweh.md` ne sont **pas** dans le dépôt (`find /`
n'en trouve aucune trace). Ils vivent dans le Project Claude « zic », auquel
une session autonome n'a pas accès. Le travail s'appuie donc sur le prompt de
relais et sur le code réel.

**Ce n'est pas bloquant pour la vérité terrain** : elle existe sous une forme
meilleure que le `.md` cité — versionnée et lisible par machine dans
`tests/corpus/gt/you-are-yahweh-tutorial.json` (`status: validated`,
`validatedBy: utilisateur`). 20 segments sur 0–75 s, tonalité La majeur,
accords D / A / E / F#m, avec une note de provenance qui précise que la grille
a été corrigée par lecture image par image du tutoriel.

## 1. La découverte qui change l'architecture

Le prompt prévoyait, pour le Format B, un **OCR des étiquettes de notes** puis
un mapping lettre → numéro MIDI, en signalant qu'il faudrait décider quelle
octave choisir et documenter ce choix.

Inspection réelle du fichier de référence : ce n'est pas nécessaire, et une
lecture strictement meilleure est disponible.

Le rendu de type Synthesia affiche **un clavier graphique en bas de l'image**,
et les touches jouées y sont **teintées** (bleu = main gauche, vert = main
droite). La position horizontale d'une touche sur ce clavier donne la note
**exacte, octave comprise**. Aucune reconnaissance de caractères n'intervient :
on lit une couleur à une position géométrique.

Conséquences :

- **La question « quelle octave choisir » disparaît** — elle était un artefact
  de l'approche OCR. La géométrie donne l'octave.
- **Aucune dépendance OCR n'est ajoutée** (`tesseract.js` : ~plusieurs Mo de
  wasm + `.traineddata`, avec un risque de packaging `electron-builder`). Voir
  §5 pour ce que ça coûte et ce que ça laisse ouvert.
- Le calage des hauteurs est **auto-calibré** par le motif des touches noires
  (groupes de 2 = Do♯/Ré♯, groupes de 3 = Fa♯/Sol♯/La♯) : aucune constante de
  ce fichier précis n'est écrite en dur.

### Validation empirique, avant d'écrire la moindre ligne de production

Sept frames lues, comparées à la vérité terrain — **7 sur 7 exactes** :

| t | Vérité terrain | Touches lues (b=bleu/gauche, g=vert/droite) |
|---|---|---|
| 5 s | D | D3(b) A3(b) A5(g) |
| 9 s | A | A2(b) E3(b) C#5(g) |
| 17 s | F#m | F#3(b) A3(b) C#4(b) C#5(g) |
| 23 s | D | D3(b) A3(b) A5(g) |
| 36 s | A | A2(b) E3(b) A4(g) |
| 45 s | A | A2(b) E3(b) E5(g) |
| 60 s | D | D3(b) A3(b) A4(g) |

La ligne t=17 s mérite d'être soulignée : la note de provenance de la vérité
terrain dit « à t=17 s la main gauche affiche F#, A, Db ». La lecture
automatique donne F#3, A3, C#4 — **la même chose, exactement** (D♭ = Do♯).

### Géométrie mesurée sur le fichier de référence

Ces valeurs ne sont **pas** écrites en dur dans le code — elles sont
redécouvertes à chaque vidéo par `keyboard-geometry.js`. Elles servent ici de
trace de ce qui a été observé :

- image 640×360, 24 i/s, 141 s ;
- ligne de frappe rouge à y = 230 ;
- bande des touches noires y ≈ 238–302, bande des blanches seules y ≈ 310–345 ;
- 21 touches noires, écarts alternés ≈ 24,5 px (dans un groupe) / 37,5 px
  (entre deux groupes) → motif 2,3,2,3,2,3,2,3,1 ;
- 29 touches blanches de ≈ 21,3 px, soit Do2–Do6.

## 2. L'octave absolue : la seule inconnue, et pourquoi elle ne fausse rien

Le motif des touches noires donne les **classes de hauteur** sans ambiguïté,
mais pas le numéro d'octave absolu : un clavier Do2–Do6 et un clavier Do1–Do5
produisent la même image à un décalage près.

**Ce que ça n'affecte pas** : le nom des accords. `detectChord()` travaille sur
les classes de hauteur et sur l'ordre relatif des notes ; translater tout le
clavier d'une octave laisse le nom d'accord, la basse et le renversement
strictement identiques. La sortie musicale du pipeline est donc **indépendante
de cet ancrage**.

**Ce que ça affecte** : uniquement l'affichage (à quelle hauteur les touches
s'allument sur le clavier virtuel).

**Heuristique retenue, documentée comme telle** : ancrer la plage affichée pour
qu'elle soit centrée sur le do central (MIDI 60). Sur le fichier de référence,
49 touches de Do2 à Do6 ont pour centre exact Do4 = 60 — l'heuristique tombe
juste. Elle est exposée et remplaçable (`octaveAnchor`), et le pipeline signale
qu'il s'agit d'une heuristique plutôt que d'une lecture.

## 3. Ce qui est construit

### 3.1 La cascade, dès cette passe

Un seul format est réellement lu à l'image (le B), **mais la cascade existe**,
parce que le pire cas est confirmé réel et dans le périmètre : une vidéo non
reconnue doit être routée vers le son, pas produire un écran vide.

`format-detector.js` sonde plusieurs images réparties sur toute la durée — et
non le début seul, beaucoup de tutoriels s'ouvrant sur un titre. Il conclut au
Format B, ou rend un motif d'échec **assorti d'un message affichable** et
`fallback: 'audio'`.

Le critère de conclusion porte sur un **nombre** d'images cohérentes (2), pas
sur une proportion. Une proportion serait fausse en pratique : une touche noire
allumée n'est plus sombre, elle échappe à la détection et casse le motif 2/3 de
son octave. Exiger qu'une majorité d'images livre un clavier parfait
rejetterait presque tous les tutoriels. Deux détections indépendantes et
cohérentes suffisent — le motif alterné avec grille régulière ne se produit pas
par hasard.

Corollaire trouvé par les tests : **la géométrie doit être prise sur l'image la
plus au repos**. La cascade retient donc celle qui montre le plus de touches
noires, ce qui revient à choisir la vue la plus dégagée sans avoir à deviner
laquelle l'est.

### 3.2 Modules

Tous purs : ni DOM, ni ffmpeg, ni IPC. Testables en Node.

| Fichier | Rôle |
|---|---|
| `src/pedagogie/frame.js` | Abstraction d'image (RGB ou RGBA), pour que le même code tourne côté Electron et, si besoin, côté rendu |
| `src/pedagogie/keyboard-geometry.js` | Retrouve le clavier : ligne de frappe, grille des blanches, motif 2/3 des noires, numérotation MIDI |
| `src/pedagogie/key-detection.js` | Lit les touches allumées et sépare les mains |
| `src/pedagogie/note-grouping.js` | Agrège dans le temps : segmentation par la basse, filtre de présence |
| `src/pedagogie/chord-labeling.js` | Nomme via `detectChord()` — le moteur existant, jamais un second |
| `src/pedagogie/format-detector.js` | La cascade |
| `src/pedagogie/cross-check.js` | Recoupe deux lectures sans jamais arbitrer |
| `src/pedagogie/glossary.js` | Table concept → fiche, déterministe |
| `src/pedagogie/video-analysis.js` | Assemblage, et ce qui n'est pas garanti |

Extraction des images : `electron/main.js`, IPC `pedagogie:analyze-video`, deux
passes ffmpeg sur le même patron de `spawn` que le remux d'enregistrement
Studio. Le relevé travaille **en flux** — chaque image est lue puis jetée, seules
les touches allumées sont conservées. Une image 640×360 pèse 691 ko ; dix
minutes à 4 i/s en pèseraient 1,6 Go. Rien n'est écrit sur le disque.

### 3.3 Pourquoi il a fallu agréger dans le temps

Nommer l'accord d'une image isolée donne un résultat littéralement juste mais
harmoniquement pauvre : à t=5 s, la main gauche tient ré + la et la mélodie n'a
pas encore amené la tierce. La lecture instantanée répond « ré5 » là où la
grille de référence dit « ré ». Ce n'est pas une erreur — c'est vraiment ce qui
sonne — mais ce n'est pas la bonne granularité.

La segmentation suit donc **la basse** : dans ce type de tutoriel, la main
gauche pose la fondamentale et la tient pendant que la mélodie bouge au-dessus.
Elle compare les classes de hauteur, pas les hauteurs absolues : passer de la2
à la3 est un changement d'octave, pas d'harmonie.

**Seuil de présence : 0,30, calibré sur mesure, pas choisi a priori.** Les taux
relevés sur le fichier de référence : notes d'accompagnement tenues à 100 % du
segment ; tierce apportée par la mélodie entre 39 % et 72 % ; notes de passage
sous 25 %. À 0,22 une neuvième de passage entrait (« ré add9 » là où la grille
dit « ré ») ; à 0,30 la tierce est conservée et la note de passage écartée.
**Calibré sur un seul fichier : à revoir sur d'autres tutoriels.**

### 3.4 Résultat mesuré contre la vérité terrain

Pipeline complet sur le fichier de référence, comparé à
`tests/corpus/gt/you-are-yahweh-tutorial.json` (validée à la main), échantillonné
toutes les 0,5 s sur 0–75 s :

| Mesure | Valeur |
|---|---|
| Format reconnu | Format B, confiance 1,00 (12 sondages sur 12) |
| Clavier détecté | Do2 → Ré6, ancrage d'octave heuristique |
| Segments relevés | 44, dont **0 non résolu** |
| **Fondamentale identique** | **91,2 %** |
| Étiquette exactement identique | 46,3 % |

L'écart entre les deux derniers chiffres est **entièrement** constitué de
quintes à vide : 66 instants sur 150 où l'image lit « la5 » ou « mi5 » là où la
grille dit « la » ou « mi », parce que la tierce n'est réellement jouée par
aucune des deux mains sur ce passage. Les deux lectures ont raison : l'une
décrit ce qui est joué, l'autre l'harmonie. Le recoupement classe ces cas comme
`enrichment` (même fondamentale, précision différente) et non comme conflit.

Les 13 instants classés `conflict` (8,7 %) sont, sauf un, des décalages de
frontière de 0,5 s à 1 s entre deux segments voisins. Le seul écart de fond est
l'intro (0–2,5 s) : la vidéo ne montre encore aucune touche allumée là où la
grille annote déjà « ré ».

**Ces écarts sont consignés, pas arrondis.** Le pipeline n'a pas été réglé pour
faire monter le chiffre.

### 3.5 Le glossaire

Contenu pur, séparé du moteur, sur le patron de `src/ui/onboarding-content.js`.
Correspondance concept → fiche par **table**, pas par génération : c'est ce qui
permet à la partie « pourquoi ça marche » de fonctionner sur une source **sans
narration parlée** — un extrait de réseau social — où il n'y a rien à
transcrire.

Cinq fiches, couvrant uniquement ce que le fichier de référence contient
réellement : accord parfait majeur, accord parfait mineur, quinte à vide,
degrés d'une tonalité, progression diatonique. Chaque fiche porte sa `source`
(« définition » ou « vérité terrain »).

**Aucun contenu n'a été inventé au-delà.** Un concept rencontré sans fiche est
remonté comme dette (`collectMissing`) et affiché comme telle. Sur le fichier
de référence, la dette est nulle.

## 4. Décisions à signaler

### 4.1 `tesseract.js` n'a pas été ajouté — et pourquoi

Le prompt prévoyait d'ajouter cette dépendance pour lire les étiquettes de
notes. Elle n'a pas été installée, parce que la lecture géométrique la rend
inutile pour le chemin principal (§1) et qu'elle coûte plusieurs mégaoctets de
wasm et de `.traineddata`, avec un risque de packaging `electron-builder`.

Ce que ça laisse ouvert : l'OCR des étiquettes reste la **deuxième source
naturelle** pour un recoupement interne au Format B. `cross-check.js` accepte
déjà deux listes de segments quelconques — le brancher ne demanderait aucune
retouche du reste.

Le npm du poste atteint bien le registre (`npm view tesseract.js version` →
7.0.0) ; c'est un choix, pas un empêchement.

### 4.2 L'octave absolue : heuristique assumée

Voir §2. Rappel porté jusqu'à l'écran : elle ne change **aucun** nom d'accord,
seulement la hauteur d'affichage.

### 4.3 Le repli audio réutilise le pipeline existant

`analyzer:process-file` en mode `posthoc_discriminator` — le même moteur que
l'onglet Analyse, localisé dans `electron/audio-processor.py` (le mode y est
implémenté ligne ~4512 ; ce n'est pas un module de `src/`). Aucun second moteur
d'accords n'a été écrit.

**Non vérifié de bout en bout** : le repli demande Electron et l'environnement
Python du projet. Le câblage est en place et testé au niveau du contrat, mais
son exécution réelle n'a pas pu être observée dans cette session.

## 5. Ce qui n'a pas pu être vérifié

- **Le repli audio en exécution réelle** (demande Electron + Python).
- **Les formats A, C et D** : hors périmètre de cette passe, comme prévu.
- **Les captures d'écran** : indisponibles dans cet environnement. La
  vérification visuelle s'est faite par styles calculés dans un vrai
  navigateur, dans les deux skins, pas à l'œil.
- **Le packaging** : si `electron-builder` est relancé, vérifier que rien de
  nouveau n'est requis — le chantier n'ajoute aucune dépendance npm, seulement
  un appel à `ffmpeg`/`ffprobe`, déjà supposés présents par le remux Studio.

## 6. État d'avancement

- [x] Exploration et validation empirique sur le fichier de référence (7/7)
- [x] Briques pures `src/pedagogie/*` (9 modules)
- [x] Cascade de reconnaissance de format + repli routé
- [x] IPC d'extraction en flux (`pedagogie:analyze-video`)
- [x] Recoupement image / son sans arbitrage
- [x] Glossaire déterministe + dette de contenu
- [x] Écran, branchement, deux skins
- [x] Tests : 55 unitaires + 37 contrôles de contrat DOM
- [ ] Formats A, C, D
- [ ] Couche IA facultative (point d'extension laissé ouvert, non branché)
- [ ] Seuil de présence à revalider sur d'autres tutoriels
- [ ] Repli audio à observer en exécution réelle
