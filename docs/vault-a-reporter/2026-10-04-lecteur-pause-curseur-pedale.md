# Lecteur des exemples du Copilote — pause figée, curseur suivi, sans pédale (04/10/2026)

À reporter dans le vault : `state/current-work.md`, `log.md`. Ajouter dans `concepts/` l'état
d'une démo « à l'instant t » (voir plus bas), qui sert à la pause, au curseur et à la reprise.

## Retour de Narcisse
- « Là, c'est presque parfait. Le jeu avec la pédale rend le copilote beaucoup plus
  productif. » Il trouve aussi que c'est « une très bonne idée d'avoir mis le lecteur dans la
  conversation, comme si c'était un message vocal ».
- **Rembobinage synchronisé** :
  - « Si je redescends avec le curseur à 24, 23 ou 20 secondes, il faudrait que le jeu en bas
    rembobine aussi » ;
  - sans « cumul d'accords » : « quand je redescends à 25 secondes, le do ne doit pas rester
    affiché ».
- **Pause** :
  - « il faudrait que le jeu en bas se mette réellement en pause et fige l'affichage » ;
  - aujourd'hui, les couleurs (jaune, orange) disparaissent.
- **Sans pédale** : « avec la pédale, il y a une telle flopée de notes qu'on ne distingue pas
  bien le jeu du prof ; un mode sans pédale permettrait de beaucoup mieux discerner les
  licks ».

## Causes
- **Pause** : le lecteur (`exercise-demo-player.js`) relâchait toutes les touches, pédale
  comprise. Les touches s'éteignaient donc avec le son.
- **Curseur** :
  - il ne déplaçait la lecture qu'au lâcher de la souris ;
  - en pause, aller à un instant ne changeait que la position, pas le clavier.

## Fait
- **L'état d'une démo à l'instant t** (`stateAt`, fonction pure) :
  - il donne les notes tenues, celles que la pédale prolonge après leur relâchement, la pédale
    et le dernier repère ;
  - il est calculé à chaque fois depuis le début, jamais accumulé : c'est ce qui garantit
    l'absence de cumul ;
  - il sert à la pause, au curseur et à la reprise.
- **« show » / « hide »** : la touche s'allume ou s'éteint sans le son ni la sortie MIDI
  (`feedDemoEvent`, `main.js`). Les touches restent jaunes, et la lecture d'accord du clavier
  (« Accord ») reste affichée.
- **Pause** :
  - le son s'arrête ;
  - les touches de l'instant restent allumées : notes tenues, et notes prolongées par la
    pédale si elle est jouée ;
  - à la reprise, la pédale est remise et les notes tenues sont rejouées. Les notes que la
    pédale prolongeait restent allumées sans être rejouées, jusqu'à la remontée de la
    pédale ;
  - la reprise est immédiate, sans clignotement.
- **Curseur** (`copilot-tab.js`, `main.js`) :
  - tiré à la souris, il envoie « scrub » à chaque mouvement. Le son se tait et le clavier
    montre l'instant pointé, et seulement lui ;
  - au lâcher (« scrub-end »), la lecture reprend si elle jouait, sinon la pause reste à cet
    instant ;
  - pendant le geste, le bouton garde « Pause » si l'exemple jouait ;
  - lâché n'importe où, même hors du curseur, le geste se termine ;
  - au clavier (flèches), chaque pas va à l'instant ;
  - « ⟲ 5 s » et « Voir dans la vidéo » en pause montrent aussi les touches de l'instant.
- **Sans pédale** :
  - le bouton « Pédale » est dans la barre de lecture, seulement pour les exemples qui en ont
    une : les rejeux du prof (« avec sa pédale », « pédale à chaque accord ») et ceux de ton
    propre jeu (« pédale comprise ») ;
  - allumé, il joue avec la pédale (par défaut) ; barré, il joue sans, et chaque note s'arrête
    quand le doigt se lève ;
  - il s'applique en direct, du même instant, ou en pause : le clavier montre alors ce qui
    sonne sans la pédale ;
  - le choix est retenu (`copilot-example-pedal`) pour les exemples suivants ;
  - le sous-titre de la carte dit « sans pédale » ;
  - la durée du curseur ne change pas.
- **Une touche figée** que le pianiste joue lui-même : bleue pendant l'appui, elle redevient
  jaune quand il la relâche (pour imiter l'accord en pause).

## Vérifié
- Tests :
  - `practice-demo.test.js` 107/107, dont 18 contrôles nouveaux et 2 mis à jour : état à l'instant, pause
    figée, curseur sans cumul (Fa 24 s, Ré 25 s, Do 26 s, son exemple), reprise, sans pédale
    en lecture et en pause, arrêt ;
  - `test-copilot-tab.js` 37/37, dont 5 pour le sous-titre ;
  - `test-pedagogie-dom.js` 159/159, dont 5 contrôles du lot ;
  - `test-copilot-demo.js` 23/23.
- Scénario Playwright `pedago-scrub` (variante « lick » : une ligne de main droite sous la
  pédale), en sombre et en clair, sans erreur. À chaque arrêt, les touches allumées sont
  comparées à un calcul indépendant de ce qui sonne :
  1. pause à 2,6 s : Dm9 reste allumé, « Accord : Dm9 » reste lu ; 1,5 s plus tard, rien
     n'a bougé ;
  2. curseur tiré en pause, en avant puis en arrière (4,5 → 7 → 2 s) : toujours les touches
     de l'instant, sans cumul ;
  3. sans pédale, en pause à 6,4 s : 2 touches (main gauche et note de la ligne) au lieu
     de 7 ;
  4. une touche figée jouée au clavier de l'écran : bleue, puis jaune ;
  5. curseur tiré pendant la lecture : le bouton reste « Pause », le clavier suit, la lecture
     reprend au lâcher, même lâché hors du curseur ;
  6. après « Arrêter », plus rien d'allumé ; rejoué, l'exemple part sans pédale (choix
     retenu).
- Les scénarios `pedago-transport`, `pedago-speech`, `pedago-apply`, `pedago-tools`,
  `pedago-chips`, `pedago-live` et `pedago-short` repassent.
- Suite complète : 97 suites, seuls les 6 échecs anciens connus restent. Build et
  régressions Partie 1 et Partie 3 OK.

## À vérifier chez Narcisse
- Avec sa vraie vidéo (Amazing Grace), et sa sortie MIDI vers le VST s'il l'utilise :
  - en pause, le VST doit se taire (notes relâchées, pédale levée) ;
  - les touches de l'écran doivent rester allumées.
- Sans pédale, les notes lues **au son** gardent la durée entendue, qui peut inclure la
  résonance. Celles lues **à l'image** s'arrêtent au lever du doigt.
