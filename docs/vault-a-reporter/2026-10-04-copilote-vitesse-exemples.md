# Copilote — la vitesse des exemples (04/10/2026)

À reporter dans le vault : `state/current-work.md`, `log.md`, et `experiments/` (la règle
d'orthographe des accords, et ses deux régressions trouvées et corrigées, voir plus bas).

## Demande de Narcisse
« Ajoute une option au copilot pour que l'on puisse régler la vitesse selon ce que l'on veut
(0,5× ; 0,75× ; 1× ; etc.), ça évite de lui demander à chaque fois de ralentir. »

## Fait
- **Où** : sous chaque exemple du Copilote, dans sa barre de lecture, un choix
  « Vitesse : 0,5× · 0,75× · 1× · 1,25× ».
- **Retenu** d'un exemple à l'autre, et après une relance de l'application (clé locale
  `copilot-example-rate`).
- **Lecteur** (`src/exercise-demo-player.js`) :
  - option `rate` de `play()`, `setRate()` et `rate()` ; la vitesse est bornée de 0,25× à 2× ;
  - la vitesse divise le tempo de l'exemple : à 0,5×, les mêmes notes deux fois plus lentes.
    La position et le temps affiché restent ceux de l'exemple (« 0:02 / 0:10 », à toute
    vitesse) ;
  - **changée en pleine lecture, sans coupure.** Rien n'est relâché ni rejoué : les
    évènements pas encore joués (`pending`) sont seulement reprogrammés, du même instant, à
    la nouvelle vitesse. La pédale et les notes tenues continuent de sonner. Une reprise ou
    un « aller à » rejouent l'état de l'instant (`startFrom`), comme avant ;
  - **changée en pause** : la pause reste, la vitesse vaut à la reprise.
- **`src/main.js`** passe la vitesse au départ de l'exemple (`copilot-play-example`), et
  l'action `rate` en cours de lecture (`copilot-example-control`).
- **La barre de lecture tient sur deux lignes** (`copilot-tab.js`, `astra-bridge.css`) :
  - ligne 1 : Pause, ⟲ 5 s, le curseur, le temps ;
  - ligne 2 : « Dans la vidéo : 0:14 · Voir dans la vidéo » à gauche, « Vitesse » et
    « Pédale » à droite.
  - Pourquoi : sur une seule ligne, à 1280 px de large, « Pédale » sortait de la carte et le
    curseur tombait à 90 px. Désormais, le curseur fait 269 px au format normal (1600 px ;
    il en faisait 136) et 147 px à 1280 px. Dans un Copilote très étroit, les réglages
    passent à la ligne, toujours à droite.
- **Copilote** (`copilot-client.js`), règle 8 : quand le pianiste dit « ralentis », le
  Copilote refait l'exemple, et rappelle en une phrase où se règle la vitesse (« Vitesse »,
  sous l'exemple), et que le choix est gardé.

## Corrigé en vérifiant (deux régressions du recalage `c9e658b`, poussé le même jour)
En repassant le scénario `pedago-structure`, la structure ne partait plus.
1. **La structure disparaissait pour les tutos lus au son** (pianiste filmé de côté).
   - Cause : le recalage écartait les « accords » d'une seule note (`midis` d'une seule
     classe de note). Un accord lu au son n'a pas de notes (`midis` vide), et il était
     écarté aussi.
   - Corrigé dans `pedagogie-tab.js` : seul un segment qui a des notes, et dont les notes
     ne forment qu'une seule note, est écarté.
   - « L'Éternel est bon », lu à l'image, n'était pas touché.
2. **L'orthographe des accords suivait l'armure, pas le degré.**
   - En Do majeur (sans bémols), Db9 devenait C#9 et un Bb serait devenu A#.
   - Désormais, la fondamentale s'écrit d'après son degré dans la tonalité (`respell`,
     `degreeSpelling`) :
     - dans la gamme, la note de la gamme (C# en La majeur) ;
     - hors gamme, le degré d'usage : b2, b3, #4, b6, b7 en majeur (Db9, Bb, F#7 en Do) ;
       b2, #3, #4, #6, #7 en mineur ;
     - un **diminué** hors gamme monte vers le degré suivant : il s'écrit sur le degré du
       dessous, haussé (en Do, C#°7 vers Dm, G#°7 vers Am). Son degré se dit « #1(°) »,
       « #5(°) » (`degreeLabel`) ;
     - les noms qu'on n'écrit pas (Cb, Fb, E#, B#) deviennent la touche blanche (B7 en Si♭
       majeur, pas Cb7).
   - Le relevé de « L'Éternel est bon » reste écrit pareil : Si♭ majeur, Ab9sus4,
     Ebmaj7/G, F7, Gm, Cm, Bb.

## Vérifié
- Tests :
  - `src/practice-demo.test.js` 115/115. Ajoutés : la vitesse ; le changement sans coupure
    (pédale gardée, note tenue attaquée une seule fois, la suite à la nouvelle vitesse) ; le
    changement pendant les 80 ms du départ ;
  - `src/pedagogie/test-copilot-tab.js` 38/38 ;
  - `src/ui/test-pedagogie-dom.js` 166/166, dont 5 contrôles nouveaux ;
  - `src/pedagogie/test-song-structure.js` 40/40, dont 3 contrôles nouveaux (orthographe
    par degré, diminués, degrés des diminués) ;
  - `test-copilot-client.js` 217/217 ; `test-melodic-moves.js` 11/11 ;
    `test-tutorial-transfer.js` 99/99.
- Scénario Playwright `pedago-rate`, en sombre et en clair, sans erreur :
  - à 1× : 1,04× mesuré ;
  - 0,5× choisi en pleine lecture : la position continue du même instant (1,68 → 1,70 s),
    0,51× mesuré ;
  - remis à 1× : 1,05× mesuré ;
  - changé en pause : la pause reste (position figée), et 0,76× mesuré à la reprise ;
  - arrêté puis rejoué : l'exemple part à 0,5×, et le choix affiche 0,5× ;
  - après une relance de l'application : toujours 0,5× ;
  - la barre à 1600, 1280 et 1024 px : rien ne sort de la carte.
- Scénarios repassés sans erreur : `pedago-scrub` et `pedago-transport` ; `pedago-structure`
  en sombre et en clair (boucle 2 – 5 – 1 – 6(7), « Db9 (b2(7)) », lick « sur Cmaj9 (le
  1) »).
- Suite complète : 99 suites, seuls les 6 échecs anciens connus. Build et régressions
  Partie 1 et Partie 3 OK.

## Limites
- La vidéo du prof n'est pas ralentie : la vitesse vaut pour les exemples joués par
  l'application (le clavier du bas, le son ou la sortie MIDI).
- Le choix s'arrête à 1,25×. Le lecteur accepte de 0,25× à 2× : il suffit d'ajouter des
  valeurs à `EXAMPLE_RATES` si Narcisse en veut d'autres.
