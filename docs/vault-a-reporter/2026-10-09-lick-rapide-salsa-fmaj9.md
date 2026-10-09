# 2026-10-09 — Lick rapide relu, salsa détachée, Fmaj9/C en grand

À reporter dans le vault : `log.md`, `state/current-state.md`, `experiments/` (le lick et la
salsa ne sont pas encore vérifiés sur les vraies vidéos).

## Fmaj9/C (choix de Narcisse)
- Main gauche Do + Sol, main droite Fa La Do Mi : le moteur nommait C6add11 (73 points contre 70
  pour Fmaj9/C : basse = fondamentale +15, note à éviter −12). Narcisse : « affiche Fa majeur 9
  / Do en grand ».
- Règle (`detectChord`, `src/chord-engine/index.js`) : quand la première lecture NOMME une 11te
  juste sur tierce majeure (add11, 6add11 : la 11te est obligatoire, pas une tension facultative
  comme dans C13) et qu'un accord de 5 notes au moins est joué en entier au-dessus de la basse,
  sans note étrangère, à 6 points au plus, c'est lui qu'on nomme.
- Balayage des 1 012 accords de 3 à 6 notes : seul Do Mi Fa Sol La change. C13 reste C13
  (un premier essai, pénalité globale −16, en faisait « Gm13/C » : rejeté).

## Lick de « Gospel Piano Harmony Secrets » (0:20–0:22) : « 4 ou 5 notes sur 19 à 26 »
Trois causes possibles, toutes traitées (la vidéo n'est pas sur la machine de travail) :
1. **Relevé gardé** : un tuto déjà lu revient de la mémoire sans relire la vidéo. Son relevé
   à 8 i/s, fait avant la relecture fine, revenait tel quel. → `READING_REVISION = 2`
   (`tutorial-memory.js`) : un relevé « clavier dessiné » plus ancien est relu une fois, tout seul,
   à la réouverture du tuto (quelques minutes). Les relevés au son ou V2N restent.
2. **Le passage le plus rapide échappait à la relecture fine** : plus les touches restent
   allumées peu de temps, moins la lecture à 8 i/s en voit, et le déclenchement comptait les
   attaques vues. → Une seconde où 2 instants ne montrent une note que sur UNE image est relue
   (`BUSY_BRIEF_INSTANTS`) ; marge de 1 s (et non 0,5) avant/après. Simulé : 26 notes en 2 s,
   touches allumées 35 ms → 6 à 8 vues à 8 i/s, 26 après relecture.
3. **Au son, un lick par arpèges joué en parlant** était pris pour la voix (lineNotes exigeait
   des pas de 4 demi-tons au plus). → Une ligne très rapide (5 notes et plus, 0,15 s au plus
   entre deux, 70 % dans un même sens) est toujours du jeu (`isFastLine`).

## Salsa (« Clase dos : diez secretos para improvisar en la salsa », 5:29–5:37, audio)
- « Monotone, alors que le pianiste joue saccadé ». Cause retenue : la pédale. Rejeu au son :
  pédale de la transcription (souvent trompée par réverbération/percussions) ou « à chaque
  accord » ; dans un montuno, chaque note courte sonnait jusqu'au changement d'harmonie.
- → `percussivePiece` (`teacher-notes.js`) : un morceau de pédale est retiré quand, sur 2 s
  autour, les notes sont presque toutes courtes (≤ 0,25 s pour 75 %), répétées (40 % rejouent
  une touche déjà jouée) et au plus une longue. Sous-titre : « jeu détaché, sans pédale ».
- Vérifié : les rejeux complets de « L'Éternel est bon » et « comment harmoniser » sont
  identiques à l'octet près (aucun passage marqué détaché).
- Précision du rythme mesurée dans le navigateur (montuno à 190) : écart moyen 2 ms, au plus
  12 ms. Pas de chantier de programmation audio nécessaire.
- Limite : si la transcription donne des notes longues (réverbération), le jeu n'est pas reconnu
  détaché. À vérifier sur sa vidéo.

## Tests
- `test-fine-reading` 15/15, `test-teacher-activity` 53/53, `test-teacher-notes` 84/84,
  `test-tutorial-memory` 19/19, `note-grouper.test` 16/16, `test:chords` 98/98, bibliothèque
  d'accords 112/112, régressions Partie 1 et 3, toutes les suites Pédagogie, build.
