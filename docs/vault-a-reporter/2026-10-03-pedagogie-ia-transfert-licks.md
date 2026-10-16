# Pédagogie IA — appliquer les licks, runs et fills du prof à une autre progression (Lot 4, 03/10/2026)

À reporter dans le vault (`state/current-work.md`, `log.md`, `concepts/` : « ligne
décrite note par note par rapport à l'accord »).

## Demande de Narcisse
Reprendre « ses licks, runs et fills » (pas son rythme global) pour les jouer sur sa
progression (4-5-3-6-2-5-1…).

## Principe (décision)
Chaque note de la ligne est décrite par rapport à l'accord qui sonne dessous :
- **note de l'accord ou tension**, avec son rôle : 3, b7, 9…
- **note de la gamme de l'accord**, avec son rang dans cette gamme :
  - dorien sur m7, mixolydien sur 7, ionien sur maj7 ;
  - lydien sur maj7#11, altérée sur 7alt, diminuée demi-ton / ton sur 7b9 ;
  - locrien sur m7b5, diminuée ton / demi-ton sur dim7.
- **note chromatique**, avec son écart à la note qui suit (approche par en dessous ou par
  au-dessus).

Sur l'accord cible :
- chaque rôle prend l'équivalent : 3 devient b3 sur un mineur, 7 devient b7 sur une
  dominante ;
- chaque note de gamme garde son rang dans la gamme du nouvel accord ;
- le contour (montées, descentes, sauts), le rythme et le registre du prof (à l'octave
  près) sont gardés.

## Fait
- `src/pedagogie/tutorial-transfer.js` :
  - **`lickLine(notes, grille, passage)`** relève la ligne de la main qui joue la phrase
    la plus riche (4 notes au moins, la plus récente à égalité).
    - Elle garde les notes seules, ou le dessus d'une note doublée ; les accords sont
      écartés.
    - Un silence de plus de 0,7 s sépare deux phrases ; un accord arpégé (notes encore
      tenues ensemble) n'est pas une ligne.
    - Elle garde au plus deux accords, les 4 dernières secondes et 24 notes : « ce qu'il
      vient de faire ».
  - **`describeLick`** donne par exemple « 5 · 11 · 3 · 9 · (7) · 1 | 3 », avec les
    notes chromatiques entre parenthèses.
  - **`realizeLick`**. Exemple : la ligne Ré5 Do5 Si4 La4 Fa♯4 Sol4 | Mi4 sur G7 → Cmaj7.
    - Sur C7 → Fmaj7, c'est la même ligne une quarte plus haut.
    - Sur A7 → Dm7, la note d'arrivée devient Fa, la tierce mineure.
    - Sur Am7 → Dm7, on obtient Mi Ré Do Si Sol♯ La | Fa.
  - **`lickPlacements`** décide où poser la ligne :
    - une ligne sur un accord va sur chaque accord du même genre ;
    - une ligne sur deux accords (V → I, II → V…) va sur chaque paire qui fait le même
      mouvement, en priorité celles dont les accords sont du même genre, puis les plus
      proches de la fin, sans chevauchement ;
    - sans place de ce genre, sur chaque accord, et le texte le dit.
  - **Exemple** :
    - pour une ligne sur deux accords, sa note d'arrivée tombe avec l'accord d'arrivée ;
    - ses voicings sont dans l'autre main ;
    - sa main joue aussi ses voicings là où la ligne ne passe pas ;
    - sans forme lisible, l'accompagnement est la fondamentale et la 7e.
  - **Texte** :
    - « _Lick repris du prof (0:06–0:07, main droite, sur G13 : 5 · 11 · 3 · 9 · (7) ·
      1 ; …) :_ » ;
    - puis ses notes à chaque place (« **G7** (2e accord) : main droite Ré5 Do5 Si4… »).
  - **Choix automatique** pour « ce qu'il vient de faire » : sa ligne si elle finit dans
    la seconde moitié du passage, sinon ses accords de passage, sinon ses voicings.
    Quand on demande son lick et qu'il n'y en a pas, le Copilote le dit et donne ses
    voicings.
- `validateLick` (`copilot-lick.js`) n'est **pas** utilisé. Il limite l'étendue à 14
  demi-tons, une règle faite pour les licks générés : elle refuserait les runs d'une ou
  deux octaves du prof. Le registre est tenu par la règle « registre du prof à l'octave
  près ».

## Vérifié
- `src/pedagogie/test-tutorial-transfer.js` (86/86) : relevé de la ligne, rôles, gammes,
  transpositions (G7 → C, C7 → F, A7 → Dm, Am7 → Dm), places sur 4-5-3-6-2-5-1, run
  avec #11, accord arpégé écarté, minutage de l'exemple, choix automatique, absence de
  ligne.
- `src/pedagogie/test-copilot-client.js` (199/199) : apply_tutorial_passage avec `what:
  lick`.
- Scénario Playwright, tuto simulé avec une ligne sur G13 : « Appliquer à une
  progression → son lick → 4-5-3-6-2-5-1 → Do ». La ligne est posée sur les deux G7, sans
  erreur.
