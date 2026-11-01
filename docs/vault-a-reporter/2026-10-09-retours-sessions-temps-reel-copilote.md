# 2026-10-09 — Retours : Sessions MIDI, Temps réel, Copilote, grilles, MIDI dans Analyse

À reporter dans le vault : `log.md`, `state/current-state.md`, `state/next-actions.md`.

## Sessions MIDI
- **Lecteur.** La pause revenait à 0 : `pause()` (`src/recorder/player.js`) changeait d'état AVANT
  de lire la position, et `getCurrentTime()` ne compte le temps écoulé qu'en lecture. On lit la
  position d'abord. La barre ne se déplaçait pas pendant la lecture : la boucle d'affichage
  réécrivait sa valeur. Pendant le glisser, seul l'affichage suit ; le saut se fait au lâcher
  (`recording-tab.js`, `transportScrubbing`).
- **« Le carnet des moments marquants »** est masqué.
- **Export .mid.** Bouton ⤓ sur chaque ligne de la bibliothèque : fenêtre « Enregistrer sous »,
  fichier MIDI standard. Au passage, `buildMidiFile` (`serializer.js`) écrivait les temps
  (en secondes) comme des noires : à 120 BPM, les `events.mid` gardés à côté des sessions se
  jouaient **deux fois trop lentement**. Corrigé (960 ticks par seconde) ; vélocités bornées
  1..127 ; une note_on à force nulle est écrite comme un relâchement.
- **Vélocité / fluidité de l'enregistrement du clavier virtuel : EN ATTENTE** (Narcisse l'a mis
  en standby).

## Temps réel
- « Qualité » affiche « — » au repos (plus « En attente »).
- Bouton « Masquer / Afficher les caractéristiques », mémorisé (`pjc.live.readoutsHidden`).

## Copilot IA (vue)
- Logo de l'accueil entier (`justify-content: safe center`), barre de défilement collée à droite
  (le défileur prend toute la largeur, la colonne de lecture est centrée par des marges
  internes), mention « Copilot IA » du titre retirée.

## Entraînement — Ma grille
- Une grille sans nom s'enregistre sous « Ma grille N » (le plus petit N libre :
  `defaultGridName`, `practice-grids.js`).

## Pédagogie IA — Copilote
- **Plus d'exemple non demandé.** Causes : le routage d'intention forçait un exemple sur toute
  explication (décision du 24/09), les règles 3-5 poussaient le modèle à en joindre un, et trois
  relances (« tu dois impérativement appeler play_progression ») partaient dès que la question
  CITAIT « progression », « voicing » ou « main gauche ». Désormais un exemple n'est préparé que si
  le pianiste demande à entendre (`asksForExample` : joue, fais entendre, montre-moi, un exemple,
  à quoi ça ressemble…). Sinon l'outil audio du modèle est écarté, la phrase « Écoute l'exemple
  ci-dessous » est retirée, et « Fais-le-moi entendre » est proposé d'un clic (il rejoue
  l'exemple de la question d'avant, avec les accords de la réponse d'avant).
- **Questions de progression** (« la progression », « la boucle », « ce qui fait tourner »,
  « les bases ») : une consigne interne (`structureFocus`) est ajoutée à la question dans un
  tuto — la boucle calculée d'abord (règle 21), pas la grille de bout en bout ; sans boucle, le
  dire et donner les accords principaux.
- **Lisibilité** : réponses en 14 px, couleur du texte (plus le gris secondaire), interligne 1,6.

## Analyse — fichiers MIDI
- Le sélecteur accepte `.mid` / `.midi` (`studio:select-analysis-file`).
- `parseMidiFile` (`serializer.js`) : format 0 et 1, carte des tempos, statut courant, canal 10
  (batterie) écarté.
- `midi-source.js` (pur) : accords tirés des notes avec la détection des Sessions MIDI
  (`session-analysis.js`), rendus dans la forme de l'analyse audio ; tonalité, basse.
- `midi-render.js` : le son d'écoute est rendu hors ligne avec les échantillons de piano
  (pédale comprise), écrit en WAV sous `~/PianoJazzChords/Analyse/midi/`. Lecteur, frise,
  surbrillance, clic sur une étiquette marchent sans changement. Un MIDI n'est pas ajouté à la
  bibliothèque du Studio.

## Tests
- Nouveaux : `src/recorder/test-midi-file.js` (13), `src/analyzer/test-midi-source.js` (11).
- `test-copilot-client.js` 247/247 (explication sans exemple, « Fais-le-moi entendre »,
  questions de structure), `test-pedagogie-dom.js` 177/177, `test-player.js`, Partie 1 et 3, build.
- Échecs anciens inchangés : `test-training-dom` (11), `test-coach-dom` (2),
  `test-home-results-separation` (1), `test-load-session` (window absent).
