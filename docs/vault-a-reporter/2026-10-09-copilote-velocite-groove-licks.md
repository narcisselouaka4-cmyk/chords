# Pédagogie IA — rejeu du Copilote : vélocité, groove, licks rapides, grace notes (09/10/2026)

À reporter dans le vault :
- `log.md`, `state/current-work.md` ;
- `decisions/` : (a) relecture fine à 30 i/s des passages rapides ; (b) vélocité mesurée au son
  de la vidéo + règles de pianiste ; (c) un bloc de touches voisines allumées l'une après
  l'autre est du jeu, pas un bandeau (renverse une règle du 04/10) ;
- `experiments/` : les mesures ci-dessous ;
- `state/next-actions.md` : les vérifications en bas.

## Ses demandes
1. « Copilot reproduit bien les notes mais ça manque de vélocité » — deux pistes proposées : la
   lire sur la vidéo, ou s'appuyer sur la façon dont jouent les pianistes en général.
2. « Avec une vidéo de salsa, ça manque cruellement de rythme : le groove n'y est pas. »
3. Pédale + licks, surtout les grace notes : d'un ton (ré → mi) et d'un demi-ton (mi♭ → mi,
   ré – mi♭ – mi). Exemple : « Gospel Piano Harmony Secrets » (Gifted Hands Music, 12:31), 0:20–0:22,
   un lick archi rapide de l'octave 5 à l'octave 2 ; tout le passage 0:09–0:23 met l'app en
   difficulté dès que le tempo accélère.

## Ce qui a été mesuré
- **Cadence de lecture** : sur ses deux relevés (`fixtures/`), toutes les attaques tombent sur une
  grille de 0,12 s. Le clavier dessiné est lu à **8 images/s** (`sampleFps: 8`, pedagogie-tab.js).
  - Un lick de 20+ notes en 2 s : moins de 0,1 s par note → des notes passent entre deux images.
    Simulation : 12 notes vues sur 22.
  - Montuno à 190 à la noire : une double-croche = 79 ms, moins qu'un pas de lecture → attaques
    décalées jusqu'à 0,12 s (le groove disparaît). Simulation : 12 attaques vues sur 38.
  - Le rejeu ne recale rien sur une grille : le groove dépend entièrement de la précision de lecture.
- **Vélocité** : ses relevés à l'image ne portent AUCUNE vélocité ; le rejeu jouait 0,72 partout.
- **Filtre « bandeau »** (`readingArtifacts`, 04/10) : un bloc de 6 touches voisines ou plus qui
  sonnent ensemble était écarté comme un bandeau/logo — avec tout ce qui se joue dans sa zone
  ±0,3 s. Un run rapide dont les touches restent allumées le temps de la descente formait
  exactement ce bloc. Les bandeaux réellement observés (Si6 → Si7 ; 80 touches de l'écran de fin)
  s'allument tous d'un coup.
- Non vérifiable ici : sa vidéo n'est pas accessible depuis l'environnement de test. Lequel de ces
  mécanismes a cassé le lick de 0:20 précisément n'est donc pas établi ; tous les trois sont corrigés.

## Fait
- **Relecture fine** (`src/pedagogie/fine-reading.js`, `electron/main.js`) : après la lecture à
  8 i/s, les passages chargés (≥ 5 instants d'attaque par seconde, ou ≥ 3 dont 2 notes vues sur
  une seule image) sont relus à 30 i/s (`streamFrames` sur un extrait, `-ss`/`-t`), ±0,5 s,
  fusionnés s'ils se touchent. Sur ses relevés : 38 % du solo « L'Éternel est bon », 2 % du tuto
  « comment harmoniser » (joué en accords).
- **Lick ≠ bandeau** (`teacher-activity.js`, `isPlayedLine`) : un bloc dont les touches
  s'attaquent l'une après l'autre (≤ 0,25 s d'écart), à 80 % dans le même sens, est gardé. Le test
  du 04/10 « à l'image, 8 touches voisines tenues ensemble ne sont pas du jeu » est renversé et
  documenté ; les bandeaux mesurés restent écartés.
- **Pédale** (`teacher-notes.js`) :
  - grace note d'un ton reconnue (≤ 0,2 s, note d'arrivée tenue ≥ 0,35 s et 2,5 fois plus
    longtemps ; sur « L'Éternel est bon », Fa5 → Sol5 tenu 0,25 s est une ligne, pas une grace) ;
  - runs rapides (≥ 5 notes seules de leur main, ≤ 0,15 s d'écart, brèves, même sens) traités
    comme une figure d'approche : la pédale se relève pendant le run et se reprend à sa dernière
    note ; basse et accord tenus au doigt ;
  - note rejouée la plus courte : 0,05 s (au lieu de 0,12 s, qui faisait chevaucher les runs).
- **Vélocité** (`src/pedagogie/dynamics.js`, IPC `pedagogie:loudness`) :
  - mesurée au SON de la vidéo (l'image ne montre pas la force) : niveau RMS toutes les 10 ms
    (ffmpeg, mono 8 kHz) ; à chaque attaque, le pic juste après, rapporté au passage (10e → 90e
    centile → 0,4 → 0,95). Enregistrée avec les notes à l'analyse. Un relevé au son garde la
    vélocité de son modèle ;
  - règles de pianiste, sur toutes les notes : dessus d'accord +0,07, voix intérieures −0,05,
    basse +0,02, notes d'approche et de run −0,12, ±0,03 de variation stable. Sans mesure
    (analyses enregistrées avant), ces règles seules.

## Vérifié
- `test-fine-reading.js` 11/11 : lick 22/22 notes dans l'ordre à 30 ms près (12/22 à 8 i/s) ;
  montuno 38/38 (12/38) ; un accompagnement d'accords tenus n'est pas relu.
- `test-teacher-activity.js` 51/51 (lick gardé ; bandeaux d'un coup ou lents écartés).
- `test-teacher-notes.js` 78/78 : grace d'un ton oui, gamme par tons non ; run sous la pédale :
  1 note du run à la fois au lieu de toutes, basse tenue, dernière note reprise ; ses 11 notes
  d'approche de « L'Éternel est bon » inchangées.
- `test-dynamics.js` 17/17 ; mesure du volume sur un vrai MP4 (un pic par accord, toutes les 2 s).
- Toutes les suites Pédagogie/Copilote/recorder, build, Parties 1 et 3.

## Limites
- Les tutoriels déjà analysés gardent leurs notes à 8 i/s et sans force mesurée : il faut les
  **réanalyser** pour profiter de la relecture fine et de la vélocité au son. Les règles de
  pianiste (nuances dans l'accord, notes d'approche plus légères) s'appliquent tout de suite.
- La vélocité au son est celle de l'ATTAQUE (un accord = une force) ; la voix du prof pendant
  qu'il joue peut fausser un peu la mesure.
- Coût : la relecture fine ajoute environ 4× le transfert d'images sur les seuls passages chargés.

## À vérifier sur sa machine
1. Réanalyser « Gospel Piano Harmony Secrets » ; rejouer 0:09–0:23 et 0:20–0:22 (le lick) avec et
   sans pédale.
2. La vidéo de salsa : réanalyser, rejouer un passage de montuno (rythme, accents).
3. Un passage d'accords plaqués : les accords forts et doux du prof doivent s'entendre.
