# À reporter dans le vault — 2026-09-25 : Copilote interactif, ton « assistant », Exercices, Sessions, Pédagogie IA

> Premier fichier du 25/09, après `2026-09-24-copilote-session-studio.md`. Branche
> `fix/exercices-voicing-correctifs`. Dix lots, un commit chacun (de `2a5ef75` à `fe5bc33`).

## `log.md` — entrée à ajouter

```markdown
## 2026-09-25 — Copilote interactif au clavier, ton « assistant », Exercices ↔ Copilote, Sessions en journal, Pédagogie IA
- Narcisse : « avec une sorte de bouton, je lui demande si ce que je joue est bon […] il
  faudrait qu'elle puisse interagir avec le clavier MIDI pour représenter visuellement ce
  qu'elle dit […] comme une sorte de tuto interactif » ; « le 2-5-1 n'était qu'un exemple :
  il faut que ce soit pour tout type de demande ».
- Favoris : « une fenêtre temporaire […] comme bouton à côté de Filtres ».
- Session MIDI : le Copilote « ne peut pas reproduire exactement mon jeu ni me dire à quel
  moment ça marche ou pas […] je n'arrive pas à situer exactement où et pourquoi ».
- Pédagogie IA : « l'application ne peut pas analyser l'image » ; le Copilote ne sait pas
  rejouer un lick ou un voicing du tutoriel ; tutoriels de trois sortes (vrai clavier filmé
  du dessus, clavier dessiné Synthesia, pianiste filmé de côté).
- Puis : « on reste un assistant, pas un coach : l'assistant devrait plutôt lui conseiller
  de faire ci ou ça » ; relier le Copilote aux Exercices (choix : « Demander au Copilote » +
  « Qu'en penses-tu ? » qui connaît l'exercice) ; Sessions MIDI gardées comme journal.
- Fait (10 lots) : Favoris en fenêtre ; marques sur les touches ; surbrillance pendant les
  exemples ; « Qu'en penses-tu ? » (tout jeu, toute question) ; pas à pas + suggestions au
  clavier ; Session précise (relecture exacte, moments au clavier, portrait au Copilote) ;
  Pédagogie IA (image relue, notes du prof, Copilote branché) ; ton « assistant » partout ;
  Exercices ↔ Copilote ; passages gardés dans Sessions.
```

## `decisions/` — ADR : « Le clavier qui montre »

- **Contexte** : une seule surbrillance (touche jouée) ; les annotations du Copilote étaient
  des flèches posées par-dessus le clavier, décalées au moindre redimensionnement.
- **Décision** : des marques posées DANS le SVG de chaque touche (`<g id="note-…">`) :
  pastille colorée + étiquette de 4 caractères au plus (`src/ui/keyboard-marks.js`), une
  marque par touche, légende d'une ligne sous le clavier ; `main.js` les réapplique après
  chaque rendu du clavier. Genres : rôle dans l'accord (fondamentale, 3ce/7e, quinte,
  couleur, basse), passage, hors accord, juste, **à remplacer**, **suggérée**, sonne encore
  (pédale), voix qui va bouger (anneau qui pulse).

## `decisions/` — ADR : « Qu'en penses-tu ? » — un portrait, jamais un défaut inventé

- **Décision** : l'application garde les 90 dernières secondes jouées (`live-take.js`,
  jamais une démo ni une relecture) ; le passage = ce qui suit la dernière pause (2,5 s sans
  touche tenue, deux fois plus si la pédale est enfoncée ; 60 s au plus). `take-review.js`
  en fait un portrait avec les notes exactes : accords (mains, voicing reconnu, rôles,
  conduite des voix), lignes (gamme reconnue, rôle de chaque note), tonalité (celle de la
  question, d'un II-V-I entendu, ou détectée ; degrés seulement à 60 % de confiance), rythme,
  constats du son. Le modèle ne propose rien que ce portrait ne soutienne.
- **Choix de Claude, à valider** : seuils de pause ; 23 gammes (`scales.js`) ; la question
  dit l'intention (accords, technique, gamme, arpège, « mon lick sur G7 » = accord sous la
  ligne) ; un voicing sans fondamentale est accepté comme l'accord voulu (rootless).

## `decisions/` — ADR : « Assistant, pas coach » (demande de Narcisse, 25/09)

- **Contexte** : les retours disaient « faux », « ne va pas », « à revoir », « Voir mes
  erreurs », touches rouges ; le prompt disait « tu es son coach ».
- **Décision** : partout où l'application commente le jeu, chaque point est une SUGGESTION —
  ce qui est entendu (moment, notes exactes), ce qu'on peut essayer, pourquoi ; « si c'est
  voulu, garde-le » pour une tension ou une note étrangère. Mots bannis : erreur, faute, faux
  / fausse note, ne va pas, à revoir, tu t'es trompé. Titres en conseils (« Relever la pédale
  aux changements », « Aérer le grave »…). Clavier : plus de rouge ; « À remplacer » (orange,
  ↔) et « Suggérée » (pointillé vert). Copilote : règle 20 du prompt, « le pianiste » au lieu
  de « l'élève ». Exercices : « J'entends Am. Pour C6, mettez C à la basse. » au lieu de
  « ❌ Vous avez joué Am. Cible : C6 ».
- **Garde-fou** : `src/pedagogie/test-suggestion-tone.js` fait produire les textes (passages,
  session, pas à pas, exercice, légende) et échoue au premier mot qui juge ou à la première
  suggestion sans action.
- **Resté positif** : « Juste ! », ✅ des exercices, « Bravo » à la fin d'un exemple.

## `decisions/` — ADR : « Pas à pas au clavier »

- **Décision** : `copilot-steps.js`. Un accord = une étape ; une ligne = des étapes de 4 notes
  dans l'ordre. Jugement à la classe de hauteur (autre octave acceptée et signalée) ; une
  note de l'accord ou une tension disponible en plus est acceptée ; seules les touches
  enfoncées depuis le début de l'étape comptent ; étape suivante 0,9 s après une étape juste.
  « Essayer les suggestions » : une étape par suggestion, avec la version proposée à rejouer
  quand l'application sait quelle note essayer.

## `decisions/` — ADR : « Pédagogie IA : dire pourquoi l'image n'est pas lue »

- **Constat** : V2N (vrai clavier filmé) n'avait jamais tourné : bouton de calibration retiré
  à la refonte Astra (12/09, à la demande de Narcisse), modèle réduit à un pointeur Git LFS de
  134 octets, `requirements.txt` incomplet (et `torch==2.6.0+cpu` absent de PyPI), vidéos à
  24 i/s refusées, toute la vidéo en mémoire, erreurs jamais affichées, et un `ffprobe`
  absent arrêtait tout. Le Copilote ne recevait que le chemin du fichier.
- **Décision** :
  - « Calibrer le clavier » revient, CACHÉ tant que V2N n'est pas prêt sur la machine
    (écart assumé avec le retrait du 12/09 : sans ces 4 clics, V2N ne peut rien lire) ;
  - raisons dites en clair (pointeur LFS → « git lfs pull », paquets manquants → la liste) ;
  - 24 i/s accepté, lecture au fil de l'eau ; repli ffmpeg puis son ;
  - notes du professeur gardées (clavier dessiné 8 i/s, V2N, ou transcription du son pour un
    pianiste filmé de côté : `electron/piano-transcriber.py`, piano-transcription-inference,
    MIT) ;
  - Copilote : contexte complet du tutoriel (registre `copilot-context.js`), outils
    `play_tutorial_passage` (notes exactes, une main, transposées) et `show_tutorial_moment`.

## `decisions/` — ADR : « Exercices ↔ Copilote » (choix de Narcisse)

- **Décision** : `exercise-context.js` décrit l'exercice affiché (accord cible ou mouvement,
  tonalité, étape, voicings EXACTS de la carte, trois derniers essais pas encore retenus).
  « Demander au Copilote » (actions de l'exercice) ouvre le mode exercice du Copilote
  (propositions, conversation par exercice) ; outil `play_exercise` (voicings de la carte tels
  quels). « Qu'en penses-tu ? » lancé depuis Exercices compare le jeu aux accords de
  l'exercice (`reviewTake(…, {expect})`) ; jouer l'accord en cours seul ne fait pas réclamer
  les autres.
- **Options proposées, non retenues pour l'instant** : « le Copilote ouvre un exercice »
  (bouton « M'exercer » sous une réponse) ; « piste au clavier sans IA » après plusieurs essais.

## `decisions/` — ADR : « Sessions MIDI = journal » (choix de Narcisse)

- **Décision** : les Sessions gardent les enregistrements longs (un morceau, une séance, une
  prise du Studio) ; un passage de « Qu'en penses-tu ? » s'y garde d'un clic (session
  `passage`, touches brutes, sans tempo inventé, question et verdict en commentaire).
  « Qu'en penses-tu ? » = l'avis immédiat ; Sessions = ce qu'on garde et réécoute.

## `state/current-state.md` — à fusionner

- **Clavier** : `keyboard-marks.js` (marques, légende, genres ci-dessus) ; `note-roles.js`
  (`noteRoles`, `nearestFitting` : la note à essayer à la place d'une autre).
- **Copilote** (`copilot-client.js`, `copilot-tab.js`, `copilot-demo.js`,
  `example-guide.js`, `copilot-steps.js`) : légendes pendant l'écoute des exemples (rôles,
  voix qui bouge : « Do (7e) descend sur Si, la 3ce de G13 ») ; « Qu'en penses-tu ? »
  (composeur et barre du clavier) ; carte « Ton passage » (Réécouter, Essayer les
  suggestions, Garder dans mes sessions, moments cliquables) ; pas à pas ; modes autonome /
  tutoriel / session / exercice ; outils `play_tutorial_passage`, `show_tutorial_moment`,
  `play_exercise` ; les « m:ss » des réponses sont des liens.
- **Sessions** : relecture exacte (`player.js` : note au début d'un moment, pédale, ce qui
  sonnait remis) par le pont `feedMidiEvent` ; moments d'une suggestion = boucle courte +
  clavier ; « Écouter la suggestion » (pédale reprise à chaque accord) ; portrait de session
  pour le Copilote (60 accords détaillés) ; carnet « Suggestion / Ce qui marche ».
- **Exercices** : Favoris en fenêtre (bouton à côté de Filtres) ; « Demander au Copilote » ;
  retour « J'entends … Pour …, … » (`exerciseSuggestion`) en bulle neutre.
- **Pédagogie IA** : voir l'ADR ; `teacher-notes.js` (notes du prof, frise compacte,
  transposition, passage en exemple).

## `state/current-work.md` — à vérifier sur le PC (Electron, clavier MIDI, clé IA)

1. Exercices : « Favoris » s'ouvre en fenêtre ; « Demander au Copilote » → en-tête de
   l'exercice, propositions ; « Ce voicing » → explication + exemple avec le voicing de la carte.
2. Jouer un accord pas encore juste : bulle « J'entends … Pour …, ajoutez … » (pas de rouge).
3. Jouer un II-V-I au vrai clavier MIDI, « Qu'en penses-tu ? » (barre du clavier) : carte
   « Ton passage », touches orange / pointillé vert, aucun « erreur » ; « Essayer les
   suggestions » ; « Garder dans mes sessions » → la session s'ouvre dans Sessions MIDI.
4. Même chose depuis Exercices : l'avis parle de l'exercice sans rien taper.
5. Copilote : « Explique-moi un 2-5-1 » puis Écouter : légendes au clavier pendant l'écoute ;
   « Pas à pas ».
6. Sessions MIDI : clic sur un moment → boucle courte + clavier ; « Écouter la suggestion » ;
   « Analyser mon jeu avec le Copilot » → moments m:ss cliquables.
7. Pédagogie IA, dans le dossier du projet : `git lfs install` puis `git lfs pull` (modèle V2N
   de 113 Mo) ; `.venv/bin/pip install -r requirements.txt` (torch par l'index CPU,
   torchvision, opencv, safetensors, scipy, piano-transcription-inference, torchlibrosa ;
   modèle de transcription ~170 Mo au premier usage). Puis :
   - vrai clavier filmé du dessus : « Calibrer le clavier » → 4 coins → lecture à l'image ;
   - clavier dessiné (Synthesia) : notes lues, mains d'après la couleur ;
   - pianiste filmé de côté : notes transcrites depuis le son ;
   - Copilote : « joue-moi le lick de 1:12 en Fa » → les notes du prof transposées ;
     « Voir dans la vidéo ».
8. Vraie IA : ton des réponses (suggestions), contexte de l'exercice et du tutoriel.

## `state/next-actions.md` — à ajouter

- Faire valider par Narcisse : seuils du passage (2,5 s / 60 s), couleurs des marques, noms
  des titres de suggestions, règle « assistant, pas coach » appliquée aux Exercices (vouvoiement
  gardé dans cet écran).
- Calibrer les suggestions sur de vrais passages et de vraies sessions (faux positifs ?).
- Plus tard, si utile : « le Copilote ouvre un exercice », « piste au clavier sans IA ».
- Bugs anciens repérés, hors de ce travail (proposés en tâches séparées) : degrés faux dans
  l'onglet Analyse (`harmonic-utils.js`, `degreeName`), bonus de dominante de la tonalité
  (`key-detector.js`, `deg === 5` au lieu de 7), rootless de Bm7b5 contenant Do (la b9).
- Six suites de tests échouaient déjà avant ce travail, à l'identique : `test-skin-manager`,
  `test-coach-dom` (28/30), `test-load-session` (window absent), `test-training-dom` (11
  anciens contrôles de panneaux retirés), `test-voicing-preview`,
  `tests/ui/test-analysis-workspace` (5/10).
