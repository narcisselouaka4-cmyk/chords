# Pédagogie IA — la structure d'un tuto : la boucle, les passages, les lignes (04/10/2026)

À reporter dans le vault : `state/current-work.md`, `log.md`, `concepts/` (la structure d'un
morceau : boucle, accords de passage, remplacements, lick / approche / remplacement), et
`state/next-actions.md` (calibrage sur un vrai relevé, voir la fin).

## Demande de Narcisse
- « Je lui ai demandé de me dire quelle était la progression. Il m'a sorti une flopée
  d'accords. […] Quand je demande la progression, je ne demande pas les accords que joue le
  pianiste du début jusqu'à la fin. Ce que je demande en réalité, c'est la structure de la
  musique. Donc en gros, la boucle. Est-ce qu'il y a quatre accords ? Est-ce qu'il y a cinq
  accords ? […] C'est après qu'il va devoir expliquer les accords de passage. »
- Le tuto : « L'Éternel est bon », Dena Mwana, solo blues. C'est un tuto sans
  explication : le pianiste joue seulement.
- « Ça doit être ma prochaine avancée. Ne plus simplement jouer, mais aussi donner la
  progression. Et les accords de passage. Et les mouvements mélodiques. Faut qu'ils sachent
  discerner. À quel moment il lick, à quel moment il fait un mouvement pour arriver à une
  destination, ou alors plutôt pour remplacer un accord structurel. »

## Cause
Le Copilote ne recevait que la grille relevée, changement par changement, avec l'heure de
chacun. Il n'avait aucune notion de boucle, et il la recopiait. La question était la bonne.

## Fait
- **`song-structure.js`** (nouveau, pur, déterministe) :
  1. **Les jetons.**
     - Un jeton par changement d'harmonie : Dsus4 puis D, ou Em7 puis Em9, n'en font qu'un.
     - Une basse qui bouge (D puis D/F#) en fait un autre.
     - L'accord est relu d'après les notes de son attaque quand l'étiquette ne les explique
       pas (`chordForNotes`).
  2. **Les accords de passage.**
     - Un accord est « de passage » s'il dure moins de la moitié de la durée habituelle.
     - Il l'est aussi s'il est plus bref que ses voisins et dans une relation de passage
       connue avec l'accord qui suit : diminué, dominante, substitution tritonique,
       glissement. `knownRelation` est désormais exportée de `tutorial-transfer.js`.
  3. **La tonalité** : celle du tuto, sinon devinée. Elle se juge sur les accords dans la
     gamme et sur l'accord de début et de fin.
  4. **La boucle**, cherchée en trois temps :
     - on cherche les motifs d'accords qui reviennent **deux tours de suite**, à une
       rotation près ;
     - si ce n'est pas le cas, des tours qui se ressemblent, à un accord près : la boucle est
       alors prise à la majorité et dite « probable » ;
     - chaque boucle possible est ensuite suivie sur tout le morceau, en acceptant un accord
       remplacé, ajouté ou sauté.
     La meilleure boucle est retenue ainsi : chaque accord à sa place compte un, chaque écart
     coûte un, et chaque accord de la boucle à retenir coûte un et quart. Il en découle que :
     - une variante régulière (un tour sur deux, longtemps) fait une boucle longue ;
     - des erreurs dispersées restent des écarts ;
     - une longue boucle qui n'est que la petite répétée, avec une variante minoritaire,
       redevient la petite.
  5. **Les parties** : ce qui ne suit plus la boucle est cherché de la même façon. On
     obtient une partie B, une A qui revient avec sa lettre, ou un passage hors boucle :
     introduction, fin, passage libre.
     - Un premier accord tenu bien plus longtemps qu'aux tours suivants est une
       introduction.
     - Un dernier tour à peine commencé est la fin.
  6. **Pour chaque boucle** :
     - ses accords, en degrés (« 1 – 6 – 4 – 5 », « 3(7) », « b7 ») et en accords ;
     - son nombre de tours et sa durée par tour ;
     - ses remplacements (« le 4 (C) remplacé par Am7 (2), à 0:20 et 0:44 » ; s'il n'y en
       a qu'un, « peut-être une erreur de lecture ») ;
     - ses ajouts et ses manques ;
     - ses accords de passage, décrits par rapport à l'accord d'arrivée et regroupés avec
       leur fréquence (« B7 avant le 6 (Em) : dominante de l'accord d'arrivée, 6 fois »).
  7. **Le passage désigné (« ici »)**, situé dans la structure :
     - la partie et les tours ;
     - chaque accord à sa place, remplacé, ajouté ou sauté ; pour un long passage,
       seulement les écarts ;
     - les accords de passage qui y tombent.
- **`melodic-moves.js`** (nouveau, pur) : les lignes du prof dans le passage, main par main.
  Une phrase s'arrête après plus de 0,6 s de silence, ou sur un accord plaqué, et la ligne
  arrive alors sur sa note la plus proche. Chaque phrase est classée ainsi :
  - **approche** si elle mène à l'accord suivant de la structure : sa dernière note tombe
    au changement, sur une note de l'accord d'arrivée, atteinte par un pas. À la main
    gauche, c'est une marche de basse vers la fondamentale ;
  - **remplacement** si elle joue à la place d'un accord de la boucle absent à ce tour
    (elle peut aussi mener au suivant) ;
  - **lick** sinon : sur l'accord qui sonne, avec le rôle de ses notes (« 5 · 13 · 7 · 9 ») ;
    les notes bleues sont signalées.
- **Copilote** (`copilot-client.js`, `pedagogie-tab.js`) :
  - le bloc « Structure du morceau » vient avant la grille. Celle-ci est désormais
    annoncée comme « ce n'est pas la progression » ;
  - « Dans la structure » et « Lignes du prof ici » sont ajoutés pour le passage ;
  - la structure est calculée une fois par relevé ;
  - nouvelle règle 21 : la progression, c'est la boucle, jamais la liste des accords. Le
    Copilote donne d'abord la boucle (combien d'accords, degrés puis accords, durée d'un
    tour, parties), puis en une ligne les passages et les remplacements. Il dit « probable »
    quand c'est le cas. Pour un passage, il situe et distingue : structure, passage,
    remplacement ; lick, approche, ligne à la place d'un accord.

## Vérifié
- Tests :
  - `test-song-structure.js` 31/31. Il couvre : degrés, jetons, tonalité, boucles de 4 et
    de 7 accords, accords de passage, remplacements, alternance devenue boucle de 8,
    introduction et fin, parties A B A, rien de répété, erreurs de lecture (isolées,
    fusionnées, un tour sur deux), passage désigné, long passage. Les trois grilles réelles
    de `benchmark_outputs` sont analysées sans erreur ;
  - `test-melodic-moves.js` 11/11 : lick, approche à la main droite (arrive sur la tierce),
    marche de basse, ligne à la place d'un accord sauté, notes bleues, texte ;
  - `test-copilot-client.js` 217/217, dont 4 contrôles nouveaux ;
  - `test-pedagogie-dom.js` 162/162, dont 3 contrôles nouveaux ;
  - `test-tutorial-transfer.js` 99/99.
- Scénario Playwright `pedago-structure`, en sombre et en clair, sans erreur. Faux tuto
  « boucle » : 2-5-1-6, six tours, Db9 au tour 4, un lick au tour 3.
  1. « Quelle est la progression ? » : « Boucle — 4 accords : 2 – 5 – 1 – 6(7) (Dm9 – G13 –
     Cmaj9 – A7#9) ; environ 8 s par tour ; 6 tours (0:00 → 0:48) ». Db9 est noté comme
     remplacement du 5. La structure vient avant la grille, et la règle 21 est envoyée.
  2. « Explique ce passage » à 0:22 : « tours 1 à 3 sur 6 », et « lick sur Cmaj9 (le 1) —
     5 · 13 · 7 · 9 ».
- Les scénarios `pedago-live`, `pedago-speech`, `pedago-apply`, `pedago-chips` et
  `pedago-transport` repassent.
- Suite complète : 99 suites (deux nouvelles), seuls les 6 échecs anciens connus restent.
  Build et régressions Partie 1 et Partie 3 OK.

## Limites connues, et suite
- **Grilles lues au son** (tuto filmé de côté) : très bruitées. Sur les trois extraits réels
  du dépôt, aucune boucle n'est trouvée, et la structure le dit plutôt que d'en inventer
  une. Les grilles lues à l'image sont bien plus propres.
- **Calibrage** : demandé à Narcisse, le relevé gardé de « L'Éternel est bon »
  (`~/PianoJazzChords/Pedagogie/memoire/<clé>.json`), pour éprouver la boucle et les lignes
  sur son vrai cas.
- **Ordre de la boucle** : elle est donnée dans l'ordre où le pianiste la joue (son entrée
  dans la boucle). Une boucle gospel commencée sur le 1 serait donc dite « 1 – 4 – 5 – 3 – 6
  – 2 – 5 » et non « 4-5-3-6-2-5-1 ». C'est à revoir avec lui si ça le gêne.
- **Proposé** : un affichage de la structure à l'écran (une ligne « Boucle : 1 – 6 – 4 – 5 »,
  la frise des accords qui distingue boucle et passage). À faire seulement s'il le veut,
  vu son souci du « trop d'inscriptions ».
