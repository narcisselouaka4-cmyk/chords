# 2026-10-09 — La lecture suit d'un onglet à l'autre ; la main gauche tenue compte dans l'accord

À reporter dans le vault : `log.md`, `state/current-state.md`, `decisions/` (le changement de
règle sur l'arrêt des démos).

## Exemples du Copilote et démos d'Exercices : ils continuent d'un onglet à l'autre
- Narcisse : « quand Copilote joue et que je bascule brusquement sur Temps réel, Copilote
  s'arrête ; on a envie que ça continue, et que ça ne s'arrête que quand c'est moi qui l'ai
  décidé » — comme la relecture d'une session MIDI, dont il aime l'animation dans Temps réel.
- Cause : `main.js` arrêtait le lecteur des démos (`demoPlayer.stop()`) à chaque changement de
  sous-onglet (`app-switch-training-view`) et d'onglet (`.tab-btn`). **Règle changée** : on ne
  l'arrête plus. Le clavier, l'accord, la portée et la roue du Temps réel suivaient déjà la démo
  (`feedDemoEvent` passe par le même chemin qu'une touche jouée), et suivent donc maintenant
  partout.
- Pour décider où qu'il soit : une pastille dans la barre du clavier (`#keyboard-playing`,
  « Copilote » / « Démo » / « Aperçu », pastille jaune = l'application joue) avec Pause/Reprise
  et Arrêter. Elle n'apparaît que pendant une lecture.
- Restent comme avant : jouer soi-même une touche arrête la démo ; dans Exercices, changer un
  réglage arrête la démo ; fermer la bibliothèque arrête l'aperçu d'une carte ; la vidéo de
  Pédagogie IA se met en pause quand on quitte la vue (c'est la vidéo, pas l'exemple).

## Détection : la main gauche tenue compte
- Narcisse : main gauche Do + Sol tenus, main droite Si Ré Mi → « je devrais avoir un Do majeur
  9 » ; il voyait l'accord de la main droite seule. Pareil avec Fa La Do Mi : « Fmaj7 », sans
  le Do ni le Sol.
- Cause : deux lectures. La première (80 ms, toutes les touches tenues) donnait juste ; la
  seconde, celle du regroupement temporel (`note-grouper.js`, 200 ms, faite pour les accords
  roulés), ne voyait que les notes ATTAQUÉES ensemble — la main droite — et écrasait la bonne.
- Correction : `chordNotesWithHeld(groupe, notes qui sonnent)` : le groupe plus tout ce qui sonne
  encore (touches tenues, notes tenues par la pédale).
- Mesuré dans le navigateur avec un faux clavier MIDI : avant « B · D · E » et « Fmaj7 » ;
  après « Cmaj9 » et « C6add11 » (Fmaj9/C et G13sus4/C en « Aussi »).
- Question ouverte : pour Do+Sol sous Fa La Do Mi, le moteur nomme d'abord C6add11 ; un
  pianiste dirait souvent Fmaj9/C. Le classement du moteur n'a pas été touché (régressions).

## Tests
- `src/note-grouper.test.js` 16/16 (4 nouveaux) ; régressions Partie 1 et 3 ; `test:chords`
  98/98 ; `practice-demo` 120/120 ; `test-pedagogie-dom` 177/177 ; build.
- `test-training-dom` : les 11 échecs anciens, identiques avant/après.
