# Pédagogie IA — mémoire des tutos et accueil en vignettes (Lot 5, 03/10/2026)

À reporter dans le vault (`state/current-work.md`, `log.md`, `decisions/` : « le relevé
d'un tuto est gardé ; le refaire est un choix »).

## Demande de Narcisse
Parmi ses choix pour Pédagogie IA : « Accueil en vignettes » et « Analyse gardée en
mémoire ». Rouvrir un tuto déjà lu ne doit pas refaire tout le relevé (lecture des
images, écoute du son, transcription de la parole), qui prend plusieurs minutes.

## Fait
- **`src/pedagogie/tutorial-memory.js`** (nouveau, sans Electron, testé) :
  - Le relevé d'un tuto est gardé dans
    `~/PianoJazzChords/Pedagogie/memoire/<clé>.json`. On y trouve : accords, notes du
    prof, parole, tonalité, comparaison image / son, message affiché sous la vidéo. La
    clé est un FNV-1a du chemin.
  - Les fiches de l'accueil (vignette, durée, date du relevé) sont dans `index.json`.
    Les écritures se suivent une à une, sans s'écraser.
  - Un relevé n'est rendu que s'il est encore celui du fichier (même taille, même date
    de modification) : un tuto remplacé sur le disque est relu.
  - Dans la même page, `thumbnailTime(durée)` donne l'instant de la vignette : 12 % de
    la durée, entre 1 et 60 s, car les tutos s'ouvrent souvent sur un titre.
    `thumbnailArgs()` donne la commande ffmpeg.
- **Electron** : nouveau canal `pedagogie:thumbnail` (`electron/main.js`, exposé par
  `electron/preload.cjs`).
  - Il reprend le même ffmpeg et la même sonde que la lecture des images
    (`resolveFfmpeg`, `probeVideoDimensions`).
  - Il prend une seule image JPEG de 360 px de la vraie piste vidéo, jamais l'image de
    couverture.
  - Il la renvoie en data URL (la CSP autorise `img-src data:`), avec la durée.
  - La commande a été vérifiée telle quelle avec le ffmpeg d'imageio sur une vidéo de
    test : image 360×202 de 9 Ko. Electron lui-même ne tourne pas dans le conteneur de
    test.
- **Écran** (`src/ui/pedagogie-tab.js`) :
  - **Rouvrir un tuto déjà lu est instantané.** Le relevé revient de la mémoire, avec la
    frise, le message et le Copilote, qui sait ce que joue le prof.
  - « Lire ce tutoriel » lance alors la vidéo sans nouveau relevé. Un nouveau bouton
    **« Refaire le relevé »** relit tout. L'intro dit « Déjà lu le 3 octobre : le relevé
    est gardé… ».
  - Après chaque relevé réussi, il est gardé.
  - **Accueil en cartes** : vignette, durée (« 12:34 »), nom, « Déjà lu · relevé
    gardé » ou « Pas encore lu ». L'en-tête se range en haut, et « Mes tutoriels » reste
    dans l'en-tête de la page.
  - Les vignettes manquantes sont demandées en arrière-plan, une à une, une seule fois
    par session. Sans ffmpeg, une image est prise sur la vidéo après quelques secondes de
    lecture (canvas).
  - La liste « Mes tutoriels » dit « Déjà lu ».
- **Conversation** : elle était déjà gardée par tuto par le Copilote (fichiers
  `conv_….json`, reprise de la dernière par `resumeOrStartConversation`). Elle apparaît
  dans « Conversations ». Rien à ajouter.

## Vérifié
- `src/pedagogie/test-tutorial-memory.js` (16/16), avec un faux disque : écriture,
  relecture, fichier remplacé, index illisible, fiches complétées sans s'écraser,
  instant et commande de la vignette.
- `src/ui/test-pedagogie-dom.js` (110/110) : 6 contrôles du lot 5.
- Scénario Playwright (faux electronAPI avec `stat`, vignettes et disque persistant d'un
  rechargement à l'autre), en sombre et en clair :
  1. l'accueil montre 2 cartes, avec vignettes et durées ;
  2. on lit un tuto : le relevé est fait puis gardé ;
  3. après un rechargement de l'application, la carte dit « Déjà lu » et aucune
     vignette n'est redemandée ;
  4. on rouvre le tuto : frise et message reviennent sans relire la vidéo ;
  5. « Lire » démarre sans relevé ;
  6. « Refaire le relevé » relit tout ;
  7. la liste dit « Déjà lu » ;
  8. aucune erreur.
