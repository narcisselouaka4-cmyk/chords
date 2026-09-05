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

## 3. État d'avancement

- [x] Exploration et validation empirique sur le fichier de référence (7/7)
- [ ] Briques pures `src/pedagogie/*`
- [ ] IPC d'extraction/analyse de frames
- [ ] Repli audio
- [ ] Écran et branchement
