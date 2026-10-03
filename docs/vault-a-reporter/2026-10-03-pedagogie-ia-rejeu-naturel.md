# Pédagogie IA — ne rejouer que ce que le prof joue, avec sa pédale (03/10/2026)

À reporter dans le vault : `state/current-work.md`, `log.md`, et `concepts/` (« il joue /
il parle »).

## Ce que Narcisse a montré
- **Vidéo du tuto GHM.** Le rejeu de 0:04 → 0:24, « 150 notes jouées par le professeur »,
  « vrille totalement » vers la fin. Or le prof y **parle**, assis sur un canapé, sans
  clavier à l'image.
  - Le relevé au son (piano-transcription-inference) avait transcrit sa voix comme un
    piano.
  - Au rejeu, chaque note durait jusqu'à la fin du passage + 1 s
    (`passageExample`). Les notes s'empilaient jusqu'à former un amas de 12 notes
    (Si♭3 → La6, les 12 sons).
  - Le Copilote a aussi rejoué 0:00 → 0:24 alors que le passage affiché était 0:00 → 0:04.
  - Pendant le relevé, il disait « l'application n'a pas pu lire son clavier ».
- **Amazing Grace, 9:57 → 10:57.** Le rejeu est juste et la transposition aussi, mais
  « saccadé » : le prof tient la pédale, on l'entend. Les notes lues à l'image ne durent que
  le temps de la touche enfoncée.
- « Quand le prof explique, le Copilote reproduit les mêmes temps d'arrêt… il faudrait
  rendre ça plus clair. » Son choix : **pauses ramenées à 2 s et signalées**.

## Fait
- **`src/pedagogie/teacher-activity.js`** (nouveau, pur, testé) :
  - `cleanTeacherNotes` : touches 21 à 108 ; une note dure 4 s au plus ; une touche rejouée
    arrête la précédente. Pour les notes venues du son, en plus :
    - les notes fantômes sont écartées ;
    - une attaque de plus de 10 notes, ou de 4 demi-tons collés, est écartée ;
    - jamais plus de 10 notes ne sonnent ensemble, ni un amas de demi-tons.
  - `teacherActivity` découpe le relevé en moments : il joue, il parle, les deux, rien.
    - La parole vient des phrases de faster-whisper, élargies de 0,3 s et réunies quand
      moins d'1 s les sépare.
    - Pendant qu'il parle, une note venue du son ne compte que dans un accord d'au moins
      3 notes, ou si elle est jouée à son niveau de jeu ailleurs dans le passage.
    - Une note bien plus faible que les autres notes de l'accord est un reste de la voix.
    - Un moment où il joue n'est jamais effacé par le lissage.
  - `activitySummary` : « il parle 0:04–0:24 · il joue 0:24–0:52 ».
  - Les seuils sont réunis en tête du module, pour être réglés sur de vrais relevés.
- **Rejeu (`passageExample`, `teacher-notes.js`)** :
  - **seulement ses notes jouées** ; une note dure 2,5 s au plus ; jamais plus de 10 notes
    ensemble ;
  - **la pédale** est sa vraie pédale quand le relevé au son l'a donnée (`pedals` de
    `transcribePiano`, gardé dans `analysis.pedals`). Sinon, c'est une pédale
    « harmonique » :
    - enfoncée 40 ms après chaque nouvel accord ou nouvelle basse ;
    - relevée 20 ms avant le suivant ;
    - relevée aussi 0,3 s après la dernière note d'une pause, et en fin de passage.

    C'est l'évènement `sustain` du lecteur, que le piano de l'app et la sortie MIDI (CC64)
    savaient déjà jouer.
  - **Pauses** :
    - une pause de plus de 2 s est ramenée à 2 s ;
    - l'exemple porte des `markers` (« le prof explique » ou « pause », avec leurs instants
      dans la vidéo) et une `timeMap` (temps de l'exemple → temps de la vidéo), pour la
      barre de lecture à venir ;
    - un silence sans parole en tête de passage est sauté.
  - Le sous-titre dit tout cela : « avec sa pédale » ou « pédale à chaque accord », et
    « ses explications raccourcies à 2 s ».
- **Copilote (`copilot-client.js`, `tutorial-questions.js`)** :
  - **Nouvelle demande « rejouer »** : « reproduis ce qu'il a joué », « peux-tu
    reproduire ce que je viens d'entendre ? », « rejoue ce passage ».
    - Elle rejoue **le passage affiché**, jamais une plage choisie par le modèle.
    - « Rejoue ma mélodie » reste le jeu du pianiste (play_my_playing).
  - **Messages quand il n'y a rien à rejouer** (`teacherNotesMissing`) :
    - là où il parle : « Entre 0:04 et 0:24, le prof parle : il ne joue pas. Je peux
      t'expliquer ce qu'il dit. » ;
    - quand les notes sont vraiment absentes, la raison est donnée.
  - **Prompt** :
    - « Ce que fait le prof » ;
    - « Dans ce passage : il parle… » ;
    - « Ici, le prof ne joue pas : il parle. Explique ce qu'il dit… » ;
    - règle 19 : là où il parle, aucun accord n'est décrit et rien n'est rejoué.
- **Écran (`pedagogie-tab.js`)** :
  - le Copilote reçoit les notes jouées, et les accords des seuls moments où il joue
    (l'accord lu pendant qu'il parle est retiré) ;
  - la frise montre « Il explique » là où il parle ;
  - les relevés déjà gardés en profitent sans être refaits.

## Vérifié
- Tests :
  - `test-teacher-activity.js` : 26/26, construit sur la vidéo (150 notes de voix, amas de
    12 notes, accords plaqués en parlant, ligne douce hors parole, clavier dessiné) ;
  - `test-teacher-notes.js` : 47/47 (10 notes au plus, durées, pédale par accord, vraie
    pédale, pauses de 2 s signalées, pédale relevée en pause, table de temps) ;
  - `test-copilot-client.js` : 210/210 (passage parlé, raison des notes absentes,
    « reproduis » qui suit le passage affiché, prompt) ;
  - `test-pedagogie-dom.js` : 123/123.
- Scénario Playwright `pedago-speech`, sans erreur. Le prof joue Dm9, G13 et Cmaj9 (avec
  sa pédale), puis parle de 0:12 à 0:16 ; sa voix donne 28 notes parasites.
  - La frise montre « Dm9 G13 Cmaj9 · Il explique » : A7#9, lu pendant qu'il parle, est
    retiré.
  - « peux-tu reproduire ce que je viens d'entendre ? » rejoue **15 notes** (aucune de la
    voix) avec **sa pédale** (↓0,1 ↑3,8 ↓4,1 ↑7,8…).
  - « Qu'a-t-il voulu dire ? » sur 0:12 → 0:16 : le Copilote reçoit « il parle 0:12–0:16 »
    et « Ici, le prof ne joue pas ».

## Limites
- Sans faster-whisper, rien ne dit quand il parle. Seul le tri des notes s'applique alors
  (amas, 10 notes au plus, durées).
- Les seuils viennent de la vidéo de Narcisse, pas encore de vrais relevés : son fichier de
  mémoire du tuto GHM aiderait à les régler.
