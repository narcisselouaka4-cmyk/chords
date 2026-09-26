# À reporter dans le vault — 2026-09-26 : écran épuré, étoiles justes, mélodie des Sessions, melody chords

> Suite de `2026-09-25-copilote-interactif-exercices-pedagogie.md`. Branche
> `fix/exercices-voicing-correctifs`. Cinq lots, un commit chacun : `8434253` (couleurs,
> plus d'étiquettes), `fa2df2f` (moins de boutons), `534a1f4` (étoiles), `e53f929`
> (mélodie des Sessions, jeu rejoué à l'identique), `4894b26` (melody chords).

## `log.md` — entrée à ajouter

```markdown
## 2026-09-25/26 — Écran épuré, étoiles justes, mélodie des Sessions, melody chords
- Narcisse : « J'aime pas du tout les boutons que t'as rajoutés, ni les étiquettes pour
  indiquer la fonction de chaque note. […] Quand Copilot joue, il faudrait une autre
  couleur » ; « Copilot n'est pas capable de reproduire les morceaux que je joue dans la
  session MIDI […] Il ne reconnaît même pas les notes mélodiques (les top notes) » ;
  « L'idéal : générer des melody chords. La top note porte la mélodie, la basse est
  indépendante (cycle de quintes ou de tierces), on comble avec des notes de l'accord » ;
  « clair, épuré, intuitif, le plus simple possible » ; puis « les étoiles sont mal
  distribuées […] surtout quand la main gauche est ajoutée ».
- Ses choix : jaune quand l'app joue (exemples, démos, relecture des sessions) ; boutons
  gardés : « Qu'en penses-tu ? » (un seul, sous le clavier), « Demander au Copilote »,
  Favoris ; tout le reste retiré.
- Fait : bleu = tes doigts, jaune = l'app, plus aucune étiquette ; sept boutons et la carte
  « Ton passage » retirés ; étoiles calculées sur les notes à jouer (la main gauche compte) ;
  voix du dessus reconnue et donnée au Copilote ; outil qui rejoue le jeu exact ; melody
  chords (mélodie au-dessus, basse en quintes ou en tierces).
```

## `decisions/` — ADR : « Bleu = toi, jaune = l'app » (remplace « Le clavier qui montre »)

- **Contexte** : l'ADR du 25/09 « Le clavier qui montre » posait des pastilles, étiquettes,
  anneaux et une légende sous le clavier. Narcisse ne les aime pas ; il veut distinguer
  d'un coup d'œil ce qu'il joue de ce que l'app joue.
- **Décision** : une seule règle de couleur. Tout ce que l'app fait sonner (exemples du
  Copilote, démos des exercices, relecture des Sessions) passe par `handleNoteOn` avec
  `state.isPlayback` : la touche prend `active` + `is-app` (jaune `#f2b705`, blanches plus
  claires) ; ce que le pianiste joue reste bleu (`--kb-you`, couleur réglable). Jouer
  soi-même une touche jaune la repasse en bleu. Légende de la barre : « ● Toi ● L'app ».
  Plus aucune étiquette sur les touches : pour montrer des notes, le Copilote les fait
  entendre et les nomme (règle 18 du prompt). `src/ui/key-colors.js` (pur, testé).
- **Supprimés** : `keyboard-marks.js`, `#keyboard-mark-caption`, `copilot-steps.js`, les
  outils `annotate_keyboard` et `show_tutorial_moment`, le paramètre `steps` des outils.

## `experiments/` — « Marques et boutons du 25/09 » (rejetés par Narcisse le 25/09)

- Essayés le 25/09, retirés le 25/09 : marques sur les touches (rôle de chaque note, « à
  remplacer », « suggérée », pédale, voix qui bouge), légendes pendant l'écoute, « Pas à
  pas », « Essayer les suggestions », « Voir dans la vidéo », carte « Ton passage »
  (Réécouter, moments), second « Qu'en penses-tu ? » (composeur), « Garder dans mes
  sessions », « Écouter la suggestion » (Sessions), liens m:ss dans les réponses.
- Leçon : l'écran doit rester simple ; une information de plus sur le clavier coûte plus
  qu'elle n'apporte. Ce que ces boutons faisaient passe désormais par une question au
  Copilote (« rejoue ma mélodie », « rejoue ce que je viens de jouer »).

## `decisions/` — ADR : « Étoiles = difficulté des notes à jouer »

- **Contexte** : l'étoile était une valeur fixe par technique (VoicingLab : close 1,
  rootless 2, drop 2 3, upper structure 4, cluster 5), posée avant la main gauche et jamais
  recalculée : 0 changement sur 27 114 cas mesurés avec la main gauche ; en Auto, 516
  accords sur 576 à ★1.
- **Décision** : `src/voicing-engine/playing-difficulty.js` calcule sur les notes AFFICHÉES
  (main gauche du style, doublures, note du dessus comprises), en points : deux mains +0,5
  (main gauche d'une note) ou +1 ; main la plus chargée 4 notes +0,5, 5 et plus +1 ; deux
  mains et l'autre main à 3 notes et plus +0,5 ; 7 notes et plus +0,5 ; écart d'une main 9e
  +0,5, 10e +1, au-delà +2 (stride) ; tensions naturelles et altérées +0,5 chacune, 1 au
  plus par groupe. Étoiles = 1 + partie entière, de 1 à 5. Mêmes notes → mêmes étoiles ;
  même forme dans les douze tonalités → mêmes étoiles ; ajouter la main gauche n'en enlève
  jamais. Infobulle : « 2 mains · 7 notes · tensions 9 13 ».
- **Niveaux de la liste des notes du dessus** : Simple ★1, Intermédiaire ★2, Avancé ★3–5 ;
  niveau vide pour un accord → le plus proche. Le « Niveau » du Mouvement 12 tons est une
  autre notion, inchangée.

## `decisions/` — ADR : « La voix du dessus, et le jeu rejoué à l'identique »

- **Contexte** : une note de mélodie attaquée avec son accord disparaissait dans l'accord ;
  le Copilote ne recevait qu'un portrait en texte et recomposait le jeu avec ses voicings.
- **Voix du dessus** (`src/recorder/melody-line.js`, « skyline ») : la note la plus haute de
  chaque attaque (90 ms) ; écartée si une note de mélodie plus haute est encore tenue au
  doigt (accompagnement sous la mélodie) — sauf ligne legato (tierce majeure au plus,
  touche relâchée dans les 150 ms) — ou si elle est sous le registre du dessus (12
  demi-tons sous le 75e centile, jamais sous Do3). Le portrait (session et « Qu'en
  penses-tu ? ») dit le « dessus » de chaque accord et donne un bloc « Mélodie » groupé par
  accord.
- **Jeu rejoué** (`src/recorder/playing-example.js`, outil `play_my_playing`) : mêmes
  notes, moments, pédale et nuances ; au début de l'extrait, touches tenues, pédale et
  notes gardées par la pédale (4 s) remises ; tout, mélodie, main gauche ou main droite
  (mains devinées à chaque attaque : écart d'une octave par main, cinq notes au plus, au
  plus grand intervalle) ; transposable ; session à la hauteur de sa relecture (touches
  brutes + transposition du clavier) ; 60 s et 1 500 évènements au plus. Les évènements
  ne partent jamais en texte vers l'IA. « Rejoue ma mélodie », « fais-moi réécouter ma main
  gauche de 0:30 à 0:45 » sont routés vers cet outil même si l'IA n'appelle rien, jamais
  vers un lick recomposé.

## `decisions/` — ADR : « Melody chords »

- **Décision** : `src/voicing-engine/melody-chords.js`. Pour chaque note : les accords dont
  elle est une note ou une tension disponible (coût : 3ce/7e < quinte, 9e, 13e <
  fondamentale < 11e, #11 < altérations ; accords de la tonalité et dominantes secondaires
  préférés) ; la basse (fondamentale) suit le cycle demandé — quintes (par défaut),
  tierces ou libre — cherché sur toute la mélodie (programmation dynamique), fin sur la
  tonique quand la dernière note le permet. Voicing : dessus = la note de la mélodie à son
  octave ; dessous, 2 ou 3 notes de l'accord dans l'octave (notes guides d'abord), sans
  doubler la mélodie ni demi-ton contre elle, limites des intervalles graves respectées ;
  main gauche : basse de Do2 à Si2, plus 7e, 10e ou quinte quand c'est jouable, jamais de
  9e mineure.
- **Outil** `play_melody_chords` (toujours proposé) : mélodie tapée (« Mi4 Ré4 Do4:2 ») ou
  voix du dessus de la session / du passage. L'application écrit l'harmonisation sous la
  réponse (« Mi4 sur Dm9 (9e) → Ré4 sur G9 (quinte) → Do4 sur Cmaj7 (fondamentale) ») : le
  modèle ne l'invente pas. « L'harmonisation d'un 2-5-1 » reste une question ordinaire.
- **Exemples** : « Mi4 Ré4 Do4 » → Dm9 G9 Cmaj7 ; gamme descendante en tierces → C A F D B G
  E C ; Amazing Grace en Sol → iii–vi–ii–V–I–IV–ii–V–I.

## `state/current-state.md` — à fusionner

- **Clavier** : bleu = le pianiste, jaune = l'app (`key-colors.js`) ; plus de marques.
- **Boutons** : « Qu'en penses-tu ? » (un seul, sous le clavier ; sans clé d'IA, l'avis
  dans la ligne d'état), « Demander au Copilote » (Exercices), Favoris.
- **Étoiles** : `playing-difficulty.js` ; `difficultyDetailsOfVoicing`,
  `findVoicingsByTopNote(…, {leftHandStyle})` dans `practice-exercise.js`.
- **Copilote** : outils `play_my_playing` (session confiée ou dernier passage) et
  `play_melody_chords` ; registre `copilot-context.js` (`keyboard` → transposition).
- **Sessions** : portrait avec la mélodie ; le contexte envoyé au Copilote garde les
  évènements exacts (jamais dans le texte).

## `state/current-work.md` — à vérifier sur le PC (Electron, clavier MIDI, clé IA)

1. Jouer au clavier MIDI : touches bleues. « Écouter l'exemple » du Copilote, démo d'un
   mouvement, relecture d'une session : touches jaunes. Aucune étiquette sur les touches.
2. Un seul « Qu'en penses-tu ? » (sous le clavier) ; sans clé d'IA, l'avis en bas de la
   fenêtre.
3. Exercices, Accord cible Dm9 rootless : ★2 ; main gauche Gospel : ★3 ; survol des étoiles.
4. Sessions : enregistrer une mélodie jouée sur des accords (mélodie attaquée avec
   l'accord), « Analyser mon jeu avec le Copilot », puis « Rejoue ma mélodie » → exactement
   la voix du dessus, en jaune ; « Fais-moi réécouter ma main gauche de 0:10 à 0:20 ».
   Vérifier que les mains devinées sont les bonnes sur un vrai jeu.
5. « Harmonise ma mélodie en melody chords » (puis « basse en tierces ») ; mélodie tapée
   « Mi4 Ré4 Do4:2 ». Juger à l'oreille : accords trop colorés (beaucoup de 11e) ?
6. Vraie IA : appelle-t-elle `play_my_playing` / `play_melody_chords` d'elle-même (sinon le
   routage hors IA prend le relais pour les demandes claires) ?

## `state/next-actions.md` — à ajouter

- Faire valider à l'oreille les melody chords (coûts des rôles et des familles ajustables
  dans `melody-chords.js`) et la répartition des mains (`handsOf`, `playing-example.js`).
- Voix du dessus : cas d'une mélodie jouée plus de 90 ms après son accord (la note haute
  de l'accord entre alors dans la mélodie) — à observer sur de vraies sessions.
- Six suites de tests échouaient déjà avant ce travail, à l'identique : `test-skin-manager`,
  `test-coach-dom` (28/30), `test-load-session` (window absent), `test-training-dom` (11
  anciens contrôles), `test-voicing-preview`, `tests/ui/test-analysis-workspace` (5/10).
