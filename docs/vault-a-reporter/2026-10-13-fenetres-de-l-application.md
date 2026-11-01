# 2026-10-13 — Plus aucune fenêtre du système : questions et messages dessinés par l'application

## Demande (Narcisse)
« Pour toutes les suppressions, ou dans Exercices quand je passe d'« Accord cible » à
« Mouvement 12 tons », j'ai un message qui vient d'Electron ou de Linux… Il faut que le message
vienne vraiment de l'application. On ne sait jamais quel type de PC l'utilisateur aura. »

## Cause
`confirm()` et `alert()` du navigateur ouvrent une fenêtre du **système** (titre « Electron »,
boutons et police du bureau Linux / Windows / macOS). Idem pour `dialog.showMessageBox` dans
`electron/main.js` (question « Modifications non enregistrées » à la fermeture).

## Ce qui est fait
- Nouveau composant `src/ui/components/app-dialog.{js,css}` :
  - `appConfirm({ title, message, confirmLabel, cancelLabel, danger })` → `Promise<boolean>` ;
  - `appAlert({ title, message, tone })` ;
  - `appDialog({ title, message, detail, buttons, cancelId, tone })` → id du bouton.
  - Basé sur `<dialog>.showModal()` : au-dessus de tout, le reste inactif, Échap = Annuler
    (géré sur la fenêtre même, sans remonter aux raccourcis des onglets), clic sur le voile =
    Annuler, focus rendu à l'élément d'avant. Plusieurs demandes passent l'une après l'autre.
  - Suppression (`danger`) : bouton rouge, focus sur « Annuler » (pas de suppression sur un
    Entrée machinal).
  - Couleurs `--tr-*` (sombre/clair, accent), police de l'application, boutons en pilule en Scène.
- Les **questions** passent par `appConfirm` :
  - Exercices : changer de mode / ouvrir un mouvement de la bibliothèque / lancer Ma grille quand
    l'exercice en cours a un score ou des essais (« Changer d'exercice ? » ; « Recommencer
    l'exercice ? » si on reclique le mode courant). `maybeConfirmReset`, `ensureMovementMode`,
    `selectLibraryCard` deviennent asynchrones.
  - Suppression d'une conversation du Copilote, des conversations vides, d'une session MIDI, d'un
    tutoriel de Pédagogie IA.
  - Analyse : « Relancer l'analyse ? » quand il y a des corrections manuelles.
  - Fermeture de l'application avec des corrections non enregistrées : `electron/main.js` demande
    `window.__askBeforeClose()` (analyzer-tab.js) → 'save' | 'discard' | 'cancel'. La fenêtre du
    système ne sert plus qu'en dernier recours si l'interface ne répond pas.
- Les **messages** (`alert`) passent par la notification de l'application (`notify`, en bas à
  droite, rouge pour une erreur) : erreurs d'Analyse (import, chargement, analyse, renommage,
  suppression, export), format non supporté du Studio, échec d'export MIDI des Sessions,
  « Aucune conversation vide à supprimer ». `app-notify` gagne une icône « i » pour `tone: 'info'`.
- Il ne reste aucun `confirm(` / `alert(` / `prompt(` dans `src/` ni `electron/`.

## Vérification
- Test Node `src/ui/components/test-app-dialog.js` (4/4) : `confirm`/`alert` du système
  remplacés par des fonctions qui échouent si appelées.
- Navigateur (Playwright, `page.on('dialog')` pour attraper toute fenêtre du système) :
  Exercices Accord cible → Mouvement 12 tons avec un essai joué → fenêtre de l'application ;
  Échap = reste sur Accord cible ; « Changer d'exercice » = passe en Mouvement ; fenêtre de
  suppression (focus sur Annuler) ; fenêtre de fermeture. **Fenêtres du système : aucune.**
- Build OK, `test:chords` 98/98, régressions Partie 1 et 3 OK ; suite complète : seuls les échecs
  anciens (training-dom, coach-dom, home-results, skin-manager, analyse-skin, load-session,
  voicing-preview — ce dernier échoue depuis au moins 6 commits, sans lien).

## Non vérifié
- Dans Electron réel : la fermeture de la fenêtre avec corrections non enregistrées (le
  `executeJavaScript` qui attend la réponse de l'interface).

## Règle pour la suite
Ne plus utiliser `confirm()`, `alert()`, `prompt()` ni `dialog.showMessageBox` : `appConfirm` /
`appDialog` pour une question, `notify` pour une information.
