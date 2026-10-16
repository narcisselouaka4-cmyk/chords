# Pédagogie IA — outils de travail : vitesse, boucle A-B, envoi vers Exercices (Lot 6, 03/10/2026)

À reporter dans le vault (`state/current-work.md`, `log.md`).

## Demande de Narcisse
« Outils de travail », un de ses choix pour Pédagogie IA :
- ralentir le prof ;
- boucler un passage ;
- garder ce que le Copilote construit (« Ajouter à Ma grille » / Favoris) pour le
  travailler ensuite.

## Fait
- **Vitesse** 0,5× · 0,75× · 1× sous la vidéo (`src/ui/pedagogie-tab.js`). On règle
  `playbackRate` et `defaultPlaybackRate` du lecteur natif avec `preservesPitch` : la
  hauteur du son ne change pas. La vitesse reste la même d'un tuto à l'autre.
- **Boucle A-B** :
  - « Boucle A-B » pose A à l'instant de la vidéo, puis « A 0:02 · poser B » pose B.
    La boucle dure au moins 1 s ; ✕ la retire.
  - **Maj + clic** sur un accord de la frise boucle cet accord.
  - La boucle devient « le passage » dont on parle au Copilote. C'était déjà prévu au
    lot 1 (`passageWindow`) ; le choix de durée du passage se grise.
  - Piège évité : la vidéo ne revient au début de la boucle que si la **lecture** en
    franchit la fin. Un saut voulu ailleurs (clic sur un accord hors boucle, curseur du
    lecteur) n'est pas ramené.
- **Sous un exemple du Copilote** (`src/pedagogie/copilot-tab.js`,
  `src/pedagogie/example-export.js`, nouveau et testé) :
  - **« Ajouter à Ma grille »** enregistre les accords de l'exemple en grille **Perso**
    d'Exercices (« Tuto · Fmaj7 G7 Em7… », 16 accords au plus).
    - Un lien **« Ouvrir dans Exercices »** suit : la grille s'ouvre en Mouvement 12
      tons, prête à travailler dans les 12 tonalités.
  - **« Ajouter ses N voicings aux Favoris »** : chaque voicing exact de l'exemple
    devient un favori de l'Accord cible, mains et notes comprises, libellé « Voicing du
    prof ». Un voicing qui revient (G7 deux fois) ne compte qu'une fois.
  - Les grilles et favoris vivent dans `src/main.js` (`customGrids`,
    `exerciseFavorites`). La carte les lui envoie par évènement : `exercise-save-grid`,
    `exercise-add-favorites`, `exercise-open-grid`. Écrire directement dans le stockage
    aurait été écrasé à la sauvegarde suivante.
  - Ce qui a été envoyé est retenu pendant la session : « Dans Ma grille (Exercices ›
    Perso) ✓ », « 6 voicings ajoutés aux Favoris ✓ ».

## Vérifié
- `src/pedagogie/test-example-export.js` (8/8). Il couvre : grille dans l'ordre (accords
  de passage compris), limite de 16, favoris sans doublon relus comme des favoris de
  l'Accord cible, rien pour un lick seul.
- `src/ui/test-pedagogie-dom.js` (114/114) : 4 contrôles du lot 6.
- Scénario Playwright (sombre), sans erreur :
  - 0,5× joue à mi-vitesse sans changer la hauteur du son ;
  - avec la boucle 0:02 → 0:05, la vidéo reste entre 2,4 et 5,1 s pendant 5 s ;
  - un clic sur A7#9 (0:12) n'est pas ramené dans la boucle ;
  - Maj + clic sur G13 donne « Boucle 0:04 → 0:08 » ;
  - sous l'exemple « ses voicings sur 4-5-3-6-2-5-1 », la grille va dans Perso et les 6
    voicings dans les Favoris ;
  - « Ouvrir dans Exercices » ouvre la grille en Mouvement 12 tons.

## Limites
- La grille envoyée porte les accords, pas les voicings du prof : Exercices choisit ses
  voicings. Les voicings exacts du prof passent par les Favoris.
