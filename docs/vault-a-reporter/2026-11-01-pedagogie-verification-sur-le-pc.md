---
title: Pédagogie IA — vérification réelle sur le PC : le détecteur est réparé, la transcription ne plantait pas
type: bug
date: 2026-11-01
status: vérifié sur les vraies vidéos et le vrai modèle ; reste les clics dans Electron
tags: [pedagogie-ia, lecture-image, format-detector, transcription, sound-reconcile, amazing-grace]
---

# Vérification réelle des deux correctifs de la session cloud

SHA applicatif : `58e4c4f` (branche `fix/exercices-voicing-correctifs`), plus le présent commit.
Première session à avoir accès au PC de Narcisse : les deux correctifs n'avaient jamais été
exercés avec les vraies vidéos ni le vrai modèle.

## 1. Le correctif du détecteur de clavier marche (Amazing Grace)

Banc hors Electron reproduisant **exactement** le pipeline d'`electron/main.js`
(`probeFps = min(1, maxProbes/durée)`, 24 sondes, `detectVideoFormat` → `readLitKeys` à 4 i/s →
`busyWindows` → relecture fine à 30 i/s → `samplesToNoteEvents`), sur
`~/PianoJazzChords/Pedagogie/bibliotheque/- Amazing Grace - Slow Gospel Blues Piano.mp4`
(640×360, 175,89 s).

| | avant `53ed8bd` | après (code actuel) |
|---|---|---|
| clavier retenu (bas des touches) | **y = 323** (le vrai piano filmé) | **y = 233** (le clavier dessiné) |
| touches comptées | 46 blanches, **33** noires | 46 blanches, **32** noires |
| touches allumées lues | 73 | 2 175 |
| **notes lues à l'image** | **72** | **560** |
| rendu « éclair » | `true` (à tort) | `false` |

Le vote sur l'emplacement du clavier fait donc bien ce qu'il annonce.

## 2. Non-régression sur Next Level Worship (un seul clavier, mains devant)

Même banc, `Next Level Worship Chords  Piano Chords & Reharmonization.mp4` (232,62 s) :
avant et après le correctif, résultat **identique** — clavier y = 320, 52 blanches, 36 noires,
1 196 touches allumées, **784 notes**, rendu éclair `true` (attendu pour ce tuto). Le vote n'a
rien cassé.

## 3. La transcription du piano au son ne plantait pas

Sur le PC de Narcisse, avec le **vrai** modèle :
- `~/piano_transcription_inference_data/note_F1=0.9677_pedal_F1=0.9186.pth` : 171 966 578 octets,
  complet, présent depuis le 15/10 ;
- torch **2.14.0+cpu** : `torch.load(modèle)` réussit **sans** `weights_only=False`. Le correctif
  du 01/11 n'était donc pas nécessaire ici (il reste comme garde-fou pour une version future) ;
- `piano_transcription_inference`, `torch`, `librosa` : tous importables dans `.venv` ;
- `electron/piano-transcriber.py transcribe <wav> --windows=30:20` → `{"ok": true}`, 66 notes,
  12 pédales, octaves 2 à 5, classes très diatoniques (9 altérations sur 66) : plausible pour du
  gospel blues ;
- le WAV produit par `electron/audio-processor.py extract` est identique, à l'octet, à un
  `ffmpeg -ac 2 -ar 44100` manuel (31 027 278 octets) : rien à chercher de ce côté.

### La vraie cause, lue dans son relevé gardé

`~/PianoJazzChords/Pedagogie/memoire/04028adb.json` (28/10, 12:04), le dernier relevé fait par
l'application sur sa machine :

```
notesSource: image (clavier dessiné) | readingRevision: 5 | noteEvents: 127 | midi 33..67
soundCheck: { reliable: false, reason: "unreliable", imageNotes: 127, soundNotes: 307,
              confirmed: 3, studied: 85, unsupported: 82, sampled: true }
```

`soundNotes: 307` : **le son avait été transcrit sans problème**. Le recoupement a échoué parce
que l'image ne donnait que 127 notes (bug des deux claviers) : 3 confirmations sur 85 comparées,
très en dessous du seuil. La phrase réellement affichée était
« Le son et l'image ne se recoupent pas assez (musique de fond ?) : les notes viennent de l'image
seule. » — et non « le son n'a pas pu être transcrit », sur laquelle la session cloud avait bâti
son diagnostic.

→ **Un seul bug, pas deux** : le détecteur de clavier. Il faisait tomber l'image, et l'image qui
tombe fait rejeter le son.

## 4. Le recoupement image/son, bout en bout, sur les vraies données

4 extraits de 20 s choisis par `pickSoundWindows` sur les 560 notes de l'image
(`--windows=2:20,54:20,109.9:20,145.9:20`), transcrits par le vrai modèle (1 min 57 de CPU pour
80 s d'audio), puis `reconcileWithSound` :

```
reliable: true | imageNotes: 560 | soundNotes: 317 | studied: 298
confirmed: 287 | octaveFixed: 0 | globalShift: 0 | addedSlide: 3 | heardOnly: 27 | unsupported: 11
→ 563 notes après recoupement (midi 31..72, inchangé)
```

Phrase affichée : « son écouté par extraits (298 notes comparées), 287 notes de l'image confirmées
par le son, 3 notes ajoutées dans des glissandos. »

96 % de confirmation et **aucune** correction d'octave : l'image lisait déjà le bon clavier. C'est
une seconde preuve, indépendante, que le détecteur retient maintenant le bon des deux claviers.

## 5. `test-tutorial-moment` : 32/32

Les 2 échecs anciens n'étaient pas un bug : le test attendait encore cinq propositions dont
« Joue le résultat final », partie le 16/10 avec le Guide du tuto (`a511dc5`, demande de Narcisse).
Test aligné sur le code (quatre propositions, deux directes, deux avec un choix).

## 6. Le Guide du tuto est bien retiré — à ne pas remettre

Vérifié dans le code : `pedagogie-guide.js`, `tutorial-guide.js`, `guide-chapters.js`,
`guide-highlights.js`, `demo-check.js` sont absents ; `TUTORIAL_QUICK_ACTIONS`
(`src/pedagogie/tutorial-questions.js:78`) n'a plus que quatre entrées ; l'outil
`play_final_result` n'existe plus. Les « rôles supposés » (intro / couplet / mouvement) du 14/10
sont donc partis avec. C'était le choix explicite de Narcisse — rien n'est remis sans son accord.

## Vérifié
- Les deux vraies vidéos, avec les vrais modules et les mêmes sondes qu'Electron (tableaux ci-dessus).
- Le vrai modèle de transcription, deux lancements (1 extrait, puis les 4 de l'application).
- Le recoupement `reconcileWithSound` sur les vraies données des deux côtés.
- Son relevé gardé du 28/10, qui porte la cause réelle.
- Tests : `test-pedagogie-engine`, `test-sound-reconcile`, `test-sound-sampling`,
  `test-tutorial-memory`, `test-flash-notes`, `test-fine-reading` verts ;
  `test-tutorial-moment` 32/32 ; Partie 1 et Partie 3 OK ; `test:chords` 98/98 ; `npm run build` OK.
- `npm run dev` démarre (fenêtre ouverte, handlers enregistrés, pas d'erreur au démarrage).
- Le relevé gardé est en révision 5 et `READING_REVISION` vaut 7 : `staleImageReading` rend `true`,
  donc Amazing Grace est relu tout seul à la réouverture.

## À vérifier (pas fait ici)
- **Les clics dans Electron** : ouvrir Amazing Grace, laisser la relecture se faire, demander au
  Copilote « Rejoue ce passage » de 0:03 à 2:55. Je ne peux pas piloter la fenêtre Electron depuis
  cette session. Attendu, d'après les mesures : ≈ 560 notes, plus de « Ici, le prof s'arrête de
  jouer » au milieu, et la phrase de lecture qui parle de recoupement avec le son.
- Les six autres tutos de la bibliothèque n'ont pas été repassés au banc.
- La relecture fine (13 passages à 30 i/s sur Amazing Grace) est comprise dans les chiffres, mais
  son effet propre n'a pas été isolé.

## À mettre dans decisions/
- Plusieurs claviers à l'écran : on lit celui que montrent le plus d'images de sondage
  (confirmé par la mesure, à verser depuis la note du 28/10).
- Le modèle de transcription est chargé en mode complet (`weights_only=False`) le temps de sa
  construction : garde-fou pour les torch futurs, pas une correction de panne observée.

## À mettre dans experiments/
- Banc de lecture hors Electron : il faut reprendre **exactement** les sondes d'Electron
  (`probeFps = min(1, maxProbes/durée)`, `maxProbes = min(60, max(24, ⌈durée/30⌉))`, 4 i/s puis
  `busyWindows` à 30 i/s), sinon ce genre de bug est invisible. Le banc de cette session rejoue
  aussi le choix des extraits sonores et le recoupement : il reproduit le relevé de l'application
  de bout en bout.
- Méthode : **lire le relevé gardé avant de supposer une cause**. Le `soundCheck` enregistré a
  démenti en une minute un diagnostic bâti sur une hypothèse.

## Prochaines actions / questions
- Narcisse : faire les clics ci-dessus et confirmer le rejeu.
- Boucle de batterie par style : **quels styles** ? (gospel, blues lent, salsa, swing… ta liste).
