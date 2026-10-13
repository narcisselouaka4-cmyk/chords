# 2026-10-13 — Studio : roue des morceaux, barre du haut retirée, recentrage quand les pistes se replient

## Demande (Narcisse)
1. Étape 0 du Studio : enlever en haut à gauche « Musiques importées » et « Importer un fichier »
   (doublon avec le milieu) ; et pas de bouton « Importer un fichier » dans la liste des musiques.
2. Une animation d'ouverture spéciale au clic sur « Reprendre un morceau importé », différente de
   celle du panneau quand un fichier est déjà chargé.
3. Les musiques en demi-cercle, comme une roue, qu'on fait glisser.
4. Une barre de recherche sur le côté de la roue.
5. Pistes séparées repliées : « Lecture » en bas, au niveau du lecteur, pour que la fenêtre vidéo se
   recentre au milieu SANS être agrandie ; une animation pour ça.
6. La fenêtre vidéo est trop large en Scène : la même taille qu'en Atelier.

## Ce qui est fait
- **Barre du haut retirée** (`studio-home-bar` supprimée de `index.html`, CSS et JS nettoyés ; l'accueil
  n'a plus qu'une rangée dans la grille). À l'étape 0 le panneau de gauche n'existe plus (l'ancien
  tiroir est remplacé par la roue).
- **Roue** : `src/ui/components/track-wheel.{js,css}` (+ `test-track-wheel.js`, 24 tests).
  - Les morceaux sont posés sur un demi-cercle (centre au bord gauche) ; le morceau choisi est à 3 h,
    avec un repère. Glisser (souris / doigt, avec inertie), molette, ↑ ↓ / PgUp / PgDn / Début / Fin,
    clic sur un morceau (le fait tourner au milieu ; un clic sur celui du milieu l'ouvre), Entrée.
  - Ouverture : le disque grandit depuis son centre, les morceaux sortent du milieu et se déploient
    en éventail (les proches d'abord, léger effet de ressort), l'accueil glisse et s'efface, le côté
    arrive de la droite. Fermeture : l'éventail se replie. `prefers-reduced-motion` : tout est instantané.
  - Côté de la roue : « Votre bibliothèque », recherche (sans accents ni casse, comme `list-search`),
    compteur (« 1 résultat sur 18 »), carte du morceau choisi : Ouvrir / Renommer / Supprimer
    (réutilise `handleRenameTrack` / `handleDeleteTrack`), bouton « Retour », Échap. Aucun bouton
    d'import dans la roue.
  - `studio-tab.js` : `setStudioLibraryOpen` ouvre / ferme la roue (étape 0 seulement) ; `renderTrackList`
    la met à jour sur place (renommage, suppression) ; classe `wheel-open` sur `#studio-tab`.
  - Une fois un morceau chargé (étapes 1-3), `#studio-import-btn` reste dans le panneau de gauche :
    c'est le seul moyen d'importer un autre fichier à ce moment-là (il n'y a pas de retour à l'étape 0).
- **Pistes repliées** (`studio.css`, `applyStemsCollapsed`) :
  - Lecture + Export descendent en bas de la colonne de droite (le bas d'Export = le bas du lecteur) ;
    ils glissent (FLIP existant).
  - Classe `stems-collapsed` sur `#studio-tab` : grille `minmax(280px,1fr) · colonne centrale · minmax(280px,1fr)`.
    La colonne centrale garde la largeur qu'elle a pistes déployées et bibliothèque ouverte
    (`min((100% − 278px) × 0,7119 ; 100% − 278px − 270px)`), et se recentre dans la page ; elle glisse
    en animation (translation + largeur), la forme d'onde est redessinée à la fin.
  - Mesuré (Playwright) : 1500 px → vidéo 850 px, centre à 750 = centre de la page, identique à
    avant le repli ; 1920 px → 1149 px, centre 961 / 960 ; 1280 px → 693 → 664 px (les colonnes de
    côté ont besoin de 280 px chacune) ; 1024 px → 448 → 408 px.
- **Atelier = Scène** : Scène prend les mêmes colonnes (`auto · 2,1fr · minmax(270px,.85fr)`), le même
  écart et la même marge (14 px) qu'Atelier, et la bibliothèque à 250 px (260 px avant). Vidéo mesurée :
  850 px dans les deux à 1500 px de large, 693 à 1280, 1149 à 1920 (avant : 912 px en Scène à 1500).
- `CLAUDE.md` : étape 0, repli des pistes et checklist mis à jour.

## Choix à confirmer
- L'interprétation du point 5 : « Lecture » reste dans la colonne de droite, en bas, au niveau du
  lecteur (et sous la fenêtre vidéo), plutôt que d'entrer dans la colonne centrale (qui aurait
  rétréci la vidéo d'environ 65 px en hauteur).
- Vidéo : en repli total (bibliothèque en rond ET pistes en rond), la vidéo passe de 995 à 850 px
  (centrée) au lieu de grandir encore.

## Non vérifié
- Dans Electron réel : la fluidité de l'animation de la roue avec une vraie bibliothèque
  (testé : 18 morceaux factices), au doigt sur écran tactile.
