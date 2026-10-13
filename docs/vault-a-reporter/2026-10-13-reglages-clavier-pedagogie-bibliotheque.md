# 2026-10-13 — Réglages regroupés, clavier allégé, bibliothèque propre à Pédagogie IA

À reporter dans le vault : `log.md`, `state/current-state.md`, `decisions/` (silencieux : décision
inversée ; Pédagogie IA : bibliothèque intégrée au lieu d'un dossier).

## Temps réel
- Bouton des caractéristiques : « Masquer » / « Afficher » (ce que le bouton FAIT), « Afficher »
  par défaut = caractéristiques masquées au premier lancement. Clé de mémoire changée
  (`pjc.live.readoutsHidden.v2`) pour que l'ancien choix d'essai ne l'écrase pas.
- Chiffre du nombre de notes au centre de la roue : retiré. Compteur « 1 note, 2 notes… » en bas à
  droite du clavier : retiré.

## Clavier MIDI virtuel
- **Silencieux décoché par défaut** (décision du 24/09 inversée : le clavier sonne).
- « Étendue » : la liste se lit en entier (176 px au lieu de 132) ; Transposition et les réglages se
  collent à gauche, seul le bouton de repli reste à droite.
- « Couleur fondamentale » supprimée (champ, état d'écran, écouteurs). `state.colorTonic` garde sa
  valeur par défaut pour le dessin du clavier.
- **Pied de page supprimé** : entrée et sortie MIDI, état, couleur des notes et tolérance sont dans
  Réglages › Clavier et MIDI (mêmes `id=`, `main.js` inchangé). Notation, Étendue, Transposition
  restent sur le clavier.

## Réglages (engrenage en haut à droite)
- La fenêtre s'appelle « Réglages » (elle s'appelait « Paramètres »).
- La clé API a quitté l'en-tête : « Clé API de l'assistant IA… » dans Réglages › Assistant IA
  ouvre la même fenêtre qu'avant (`#ai-settings-modal`, aussi appelée par le Copilote via
  `app-open-ai-settings`).
- Le badge « Tutoriel » devient « Didacticiel » (infobulle, libellé, titre du menu, textes du pas à pas).

## Titres
- Sessions MIDI et Pédagogie IA : titre et sous-titre retirés (les actions restent à droite).
- Studio : « Tout le traitement se fait sur votre ordinateur » et son logo retirés.

## Pédagogie IA : bibliothèque intégrée
- Plus de dossier à choisir. Les vidéos .mp4 importées sont COPIÉES dans
  `~/PianoJazzChords/Pedagogie/bibliotheque/` (à côté de `…/Pedagogie/memoire/`).
- Bouton « Bibliothèque » (avec compteur) comme dans Sessions MIDI : tiroir avec recherche, filtre
  Tous / Analysés, rangées (vignette, durée, état), renommer (double-clic ou crayon : champ de saisie,
  le fichier ne bouge pas — le nom est gardé sur la fiche `cards[path].name`, la mémoire des relevés est
  indexée par chemin), supprimer (vidéo, fiche et relevé : `memory.forget`), ouvrir.
- Ancien dossier : s'il était configuré, « Reprendre mes N vidéos de l'ancien dossier » les copie
  d'un clic, puis oublie le réglage. Leur analyse est à refaire (nouveau chemin).
- Hors périmètre, non touché : l'IPC `pedagogie:select-tutorial-folder` et `tutorial-folder-pref.js`
  (encore utilisé pour la reprise).

## Tests
- Nouveau : `src/ui/test-settings-layout.js` (13). `test-pedagogie-dom` 178/178 (tests « dossier »
  réécrits pour la bibliothèque), `test-onboarding`, build, Partie 1 et 3, `test:chords`.
- Échecs anciens inchangés : `test-training-dom` (11), `test-coach-dom` (2), `test-home-results-separation`
  (1), `test-load-session` (window absent).

## Complément du 13/10 (soir)
- Sessions MIDI : repères C2, C3, C4, C5 retirés du paysage harmonique (`astra-harmonic-roll.js`).
- Copilot IA : l'explication en gris (ce que le Copilote connaît d'un tuto, d'un exercice, d'une
  session) quitte l'en-tête, où elle faisait trois lignes et poussait l'accueil sous le logo. Elle est
  dans l'accueil, sous le texte d'invitation (`setContextNote` / `.copilot-context-note`). L'en-tête
  garde le titre et les trois boutons (48 px au lieu de 83), avec son propre fond : rien n'est fusionné.

## Recherche dans chaque bibliothèque (13/10)
- Déjà équipées : Sessions MIDI, Pédagogie IA (tiroir), Bibliothèque des mouvements, favoris.
- Ajoutée : Studio (« Musiques importées »), Analyse (« Ma bibliothèque »), Coach (répertoire), Copilote (conversations).
- `src/ui/components/list-search.js` : filtre ce qui est affiché (sans accents ni casse, tous les mots
  doivent s'y trouver, Échap efface, « Aucun résultat pour … ») et se ré-applique quand l'application
  redessine la liste (MutationObserver). Aucun rendu de liste n'a été réécrit. Test : `test-list-search.js`.
