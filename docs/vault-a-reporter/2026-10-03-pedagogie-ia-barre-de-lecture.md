# Pédagogie IA — la barre de lecture des exemples du Copilote (03/10/2026)

À reporter dans le vault : `state/current-work.md`, `log.md`.

## Demande de Narcisse
- « Un contrôle de lecture : il faudrait un système pour pouvoir revenir en arrière
  manuellement quand le copilote joue, un peu comme sur un lecteur. Ce serait vraiment
  pratique pour revoir un passage et demander des explications supplémentaires sur tel ou
  tel point. »
- Sur les pauses du prof dans un rejeu : « il faudrait rendre ça un peu plus clair, par
  exemple en signalant les moments où le prof parle ». Son choix (lot 2) : des pauses
  raccourcies à 2 s, et signalées.

## Fait
### Le lecteur (`src/exercise-demo-player.js`)
- Nouveau : `pause()`, `resume()`, `seek(t)`, `position()`, `duration()`, `isPaused()`,
  `isActive()`.
- Une reprise au milieu d'un accord le rejoue, comme un lecteur qui reprend :
  - la pédale est remise dans son état ;
  - les notes tenues à cet instant sont rejouées (une seule attaque par note) ;
  - la suite part à son heure.
- En pause, tout est relâché (notes et pédale), et rien ne joue.
- Arrêter pendant une pause annonce la fin, comme pendant la lecture.
- Les démos des Exercices (« Écouter le mouvement ») passent par le même lecteur. Elles
  sont inchangées (tests et scénario `demo-live`).

### `src/main.js`
- Évènement `copilot-example-control` : pause, reprise, −5 s, aller à.
- Évènement `copilot-example-progress` : la position, la durée et l'état de pause, envoyés
  à la carte toutes les 250 ms.

### La carte de l'exemple (`src/pedagogie/copilot-tab.js`, `astra-bridge.css`)
Sous l'exemple qui joue, et seulement sous lui :
```
[▶ Reprendre] [⟲ 5 s]  ━━━━━━━━●━━━▮▮━━━━━  0:11 / 0:15
│ Ici, le prof explique (0:10 → 0:20) : sa pause est raccourcie à 2 s.
Dans la vidéo : 0:14 · Voir dans la vidéo
```
- **Pause / Reprendre**, et **« ⟲ 5 s »** (en lecture, la lecture continue de là ; en
  pause, la position recule).
- **Curseur**, qu'on tire ou qu'on règle au clavier. Les moments où le prof parle y sont
  marqués en gris ; un simple arrêt de jeu est marqué d'un contour.
- **Pendant une de ses pauses**, la phrase « Ici, le prof explique (10:12 → 10:20) : sa
  pause est raccourcie à 2 s. » s'affiche. Elle reste 2,5 s de plus, le temps de la lire.
- **L'instant de la vidéo** qui correspond (« Dans la vidéo : 0:14 »), avec « Voir dans la
  vidéo » : l'exemple se met en pause, et la vidéo du prof va à cet instant.
- Quand la barre (ou la phrase) apparaît et dépasse en bas, la conversation défile
  juste ce qu'il faut. Une conversation qu'on relit plus haut n'est pas ramenée.
- Module pur `src/pedagogie/example-transport.js` (testé) :
  - `exampleSeconds` (durée) ;
  - `videoTimeAt` (temps de l'exemple → temps de la vidéo, pauses dépliées) ;
  - `markerAt`, `markerNote`, `markerSpans`, `timeLabel`.

### Correction du lot 2 (`teacher-notes.js`)
- Quand un passage commence par un silence sans parole, ce silence est sauté dans le rejeu.
- Mais la table « temps de l'exemple → temps de la vidéo » l'ignorait : une note jouée à
  0:20 aurait été annoncée vers 0:07.
- Son premier point en tient compte désormais (`leadSkipped`).

## Vérifié
- `src/practice-demo.test.js` : 89/89, dont 12 contrôles du lecteur avec une horloge
  simulée :
  - pause : tout relâché ;
  - en pause, rien ne joue ;
  - reprise au milieu de l'accord : pédale remise et note rejouée, puis la suite à son
    heure ;
  - « −5 s » : retour au début ;
  - arrêt pendant une pause.
- `test-example-transport.js` : 18/18, sur le cas de Narcisse (il joue Do à 9:57, explique
  de 9:58 à 10:10, puis joue Mi).
- `test-teacher-notes.js` : 48/48 (silence de tête dans la table).
- `src/ui/test-pedagogie-dom.js` : 142/142, dont 5 contrôles du lot.
- Scénario Playwright `pedago-transport`, en sombre et en clair, sans erreur. Le prof joue
  0:00 → 0:12, explique 0:12 → 0:20, puis reprend :
  1. « Rejoue ce passage » : l'exemple joue (« avec sa pédale · ses explications
     raccourcies à 2 s ») ; la barre apparaît : « Pause », 0:00 / 0:15, une marque grise ;
  2. Pause : la position reste à 0:01 ;
  3. « ⟲ 5 s » ramène à 0:00 ;
  4. curseur dans son explication : « Ici, le prof explique (0:10 → 0:20) : sa pause est
     raccourcie à 2 s. », « Dans la vidéo : 0:14 » ;
  5. Reprendre : la lecture repart de là ;
  6. « Voir dans la vidéo » : l'exemple se met en pause, et la vidéo va à 0:20 ;
  7. Arrêter : la barre disparaît.
- Les scénarios `pedago-speech`, `pedago-tools`, `pedago-live`, `pedago-apply` et
  `demo-live` (Exercices) repassent sans erreur.
- Suite complète : 96 suites, seuls les 6 échecs anciens connus restent, avec le même
  nombre de contrôles ratés qu'avant. Build et régressions Partie 1 et Partie 3 OK.
