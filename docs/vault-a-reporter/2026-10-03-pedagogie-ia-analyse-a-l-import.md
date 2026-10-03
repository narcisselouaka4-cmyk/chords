# Pédagogie IA — analyse à l'import, Copilote fermé tant que ce n'est pas prêt (03/10/2026)

À reporter dans le vault : `state/current-work.md`, `log.md`, et `decisions/`. La décision
de Narcisse : « tout le tuto analysé à l'import, comme Analyse / Studio ; 30 min au plus ».

## Demande de Narcisse
- « Tant que l'analyse des images et de l'audio n'a pas été faite, je ne peux pas demander
  au Copilote de reproduire ce que le pianiste joue. Ça ne sert à rien de le garder ouvert :
  autant le fermer et faire comprendre à l'utilisateur qu'il faut attendre. »
- « Il faudrait un temps de chargement, comme dans l'onglet Analyse et l'onglet Studio […]
  En attendant, on peut bouger et aller ailleurs, et une fois que c'est fini, on revient et
  on fait ce qu'on veut. »
- Son choix, parmi deux déroulés : **toute la vidéo analysée dès l'import**. L'autre option
  était de régler une plage, puis de l'analyser.
- Toujours en vigueur : « il faut absolument qu'on impose une durée maximale de vidéo
  traitée ».

## Fait (`src/ui/pedagogie-tab.js`, `src/index.html`, `astra-pedagogie.css`)
- **Importer une vidéo** :
  - sa durée est lue avant la copie (`pedagogie:thumbnail`, qui rend aussi la vignette) ;
  - au-delà de **30 minutes**, c'est le plafond déjà en place dans `pedagogie:analyze-video`.
    La vidéo est refusée avec un message clair : « Cette vidéo dure 1:30:00 : Pédagogie IA
    analyse les tutos de 30 minutes au plus… » ;
  - sinon elle est copiée, sa fiche est remplie (vignette, durée), puis elle s'ouvre et
    **son analyse démarre aussitôt**.
- **Ouvrir un tuto pas encore analysé** lance son analyse : un tuto posé à la main dans le
  dossier, ou un tuto d'avant.
  - Un tuto déjà analysé s'ouvre prêt, depuis la mémoire.
  - Un tuto de plus de 30 min dit pourquoi il ne sera pas analysé.
- **Écran d'attente** (`#pedagogie-reading`), posé sur la vue du tuto comme celui du Studio.
  - Il contient la scène commune `loader-chroma`, le nom du tuto, l'étape (« Lecture des
    images… », « Écoute du son… »), le temps écoulé, et « Tu peux aller dans les autres
    onglets, ou revenir à tes tutoriels : l'analyse continue. Le Copilote s'ouvrira quand
    elle sera finie. »
  - Il dit aussi « En attente : « X » est en cours d'analyse », « Tutoriel trop long » (sans
    la scène), et « L'analyse n'a pas abouti », avec « Relancer l'analyse ».
- **Le Copilote n'est amarré qu'une fois le tuto analysé.** Disparaissent :
  - l'avis « Relevé en cours » et le message trompeur « n'a pas pu lire son clavier » pendant
    le relevé (bug vu dans sa vidéo) ;
  - le bouton « Lire ce tutoriel », le titre posé sur la vidéo et la ligne d'avancement
    sous la vidéo.
- **Message « prêt »**, visible depuis n'importe quel onglet : « « Amazing Grace » est prêt
  · Pédagogie IA · ouvrir ».
  - Un clic ouvre Entraînement › Pédagogie IA sur ce tuto.
  - Il ne s'affiche pas si l'on regarde déjà ce tuto (`isViewVisible` : la vue suit aussi les
    grands onglets, pas seulement les sous-onglets).
- **Cartes** : « Analyse en cours… », « Analyse en attente… », « Prêt · analysé le
  3 octobre », « Trop long : 30 min au plus », « Pas encore analysé ».
- « Refaire le relevé » devient « Refaire l'analyse ».
- **Correction à part** (`7520bc7`) : un lick joué doucement pendant qu'il parle n'était plus
  gardé (notes isolées sous le seuil de force).
  - Une suite d'au moins 4 notes courtes et rapprochées, par petits intervalles, reste
    désormais son jeu (`lineNotes`).
  - Une note de force inconnue n'est jamais écartée.

## Vérifié
- `src/ui/test-pedagogie-dom.js` : 128/128, dont 6 contrôles du lot (écran d'attente,
  Copilote seulement prêt, import avec durée lue avant, message « prêt », trop long et
  erreur).
- `test-teacher-activity.js` : 28/28, avec le lick joué en parlant et la note de force
  inconnue.
- Scénario Playwright `pedago-import`, en sombre et en clair, sans erreur :
  1. l'accueil montre « Pas encore analysé » et « Trop long : 30 min au plus » ;
  2. importer une vidéo de 1:30:00 est refusé, avec le message, et aucune carte n'est
     ajoutée ;
  3. on importe un tuto : il s'ouvre, l'écran d'attente montre l'étape et le temps écoulé,
     sans Copilote ;
  4. on passe dans le Studio : « « Nouveau tuto — leçon 2 » est prêt » apparaît ;
  5. un clic sur le message mène au tuto prêt : Copilote amarré, contrôles de la vidéo,
     « Refaire l'analyse », 4 accords ;
  6. sa carte dit « Prêt · analysé le 3 octobre » ;
  7. le tuto de 2 h montre « Tutoriel trop long », sans analyse lancée.
- Les scénarios `pedago-back`, `pedago-memory`, `pedago-live`, `pedago-tools`,
  `pedago-speech` et `pedago-apply` (voicings, enchaînement, lick) repassent sans erreur,
  adaptés à l'analyse à l'ouverture.

## Limites
- La vidéo est encore lue en entier en mémoire pour être jouée (`files.readBinary` puis
  blob), comme dans le Studio. Le plafond de 30 minutes protège aussi de ce côté.
