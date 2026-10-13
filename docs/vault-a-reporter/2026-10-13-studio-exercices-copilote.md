# 2026-10-13 — Studio (notification, couleurs, panneau, région), Exercices (mains), Copilot (étiquettes)

À reporter dans le vault : `log.md`, `state/current-state.md`, `decisions/` (noms de styles, étiquettes).

## Banc d'essai du Studio (hors dépôt)
Le Studio dépend d'Electron (fichiers, extraction, Demucs). Pour le voir en vrai dans le navigateur
de test : un faux `window.electronAPI` (système de fichiers en mémoire, WAV synthétiques, séparation
simulée avec progression) injecté par Playwright. Il a permis de reproduire la notification, de
tester une séparation complète, de capturer les étapes 1 à 3 dans les deux habillages.
Note : appeler `loadTrack` par `import('/ui/studio-tab.js')` charge une SECONDE instance du module
(non initialisée) : passer par un clic dans la liste.

## Notification « morceau prêt »
- **Causes** (reproduites) : `showReadyToast()` partait à CHAQUE passage à l'étape 3 — dans
  `refreshStems()` puis dans `finishRegionProcessing()` (d'où deux fois), et à la simple réouverture
  d'un morceau déjà séparé, pendant son chargement (d'où « trop tôt »). Le message vivait dans
  l'onglet Studio : invisible ailleurs.
- **Maintenant** : composant `ui/components/app-notify.{js,css}` (notification de l'application, sur
  `<body>`, en bas à droite, ferme seule, survol = pause, ×). Une seule, à la vraie fin d'une
  séparation (`notifySeparationReady()` dans `finishRegionProcessing(true)`), avec « Ouvrir le
  Studio » quand on est ailleurs ; un échec de séparation hors du Studio est notifié aussi.
  Vérifié : 0 notification à la réouverture d'un morceau séparé ; 1 seule après une séparation
  lancée puis quittée pour Analyse ; « Ouvrir le Studio » ramène au Studio.

## Studio
- **Couleurs** : pistes (5 nuances de la couleur de l'application, du clair au profond), forme
  d'onde, région et poignées suivent la couleur de l'application dans les deux habillages
  (`studio.css`, `:root[data-skin][data-theme]`).
- **Forme d'onde masquable** : bouton « Masquer l'onde / Afficher l'onde » (gardé :
  `pjc.studio.waveHidden`) ; toujours visible à l'étape 1 (on y trace la région), bouton grisé.
- **Boutons de région nommés** : ↩ → « Modifier la région » (retour à l'étape 1, région gardée) ;
  ↺ → « Réinitialiser la région » (0 → 5 min max).
- **« Effets »** retiré (c'était un emplacement vide « À venir »). « Export » gardé (boutons encore
  inactifs : rien n'est branché derrière — à décider).
- **Libellés** : « Transposition du morceau » (≠ « Transposition » du clavier MIDI) ;
  « Lire la région en boucle » (ex-« Boucler la région »).
- **Musiques importées** : se replie en ROND (note de musique + nombre de morceaux) en haut à
  gauche, animation bas→haut et vers la gauche (largeur, hauteur, arrondi ; le contenu s'efface
  d'abord, le rond apparaît ensuite ; l'inverse au déploiement). La colonne passe à 46 px : la vidéo
  gagne la place. Replié par défaut une fois un morceau ouvert, choix gardé
  (`pjc.studio.libraryCollapsed`). `prefers-reduced-motion` respecté.
- **Cadre du lecteur** : un « écran » toujours sombre, coins 16 px, reflet de la couleur de
  l'application, ombre portée ; fond audio : pastille ronde avec une note (au lieu de l'émoji 🎵),
  titre clair (il était sombre sur sombre en mode clair, Scène).
- **« Réanalyser le fichier »** → **« ↻ Refaire la séparation »**, discret (bordure pointillée), sous
  la liste des pistes, à la même place dans les deux habillages (avant : en tête du panneau en
  Atelier, dans l'en-tête du lecteur en Scène). Avant séparation, « Séparer les pistes » garde sa
  place d'action principale.

## Exercices
- **Couleurs des mains** (`ui/hand-colors.js`, testé) : chaque main prend la première couleur de sa
  liste qui se distingue nettement (≥ 38° de teinte) de la couleur de l'application, de l'autre
  main et de l'ambre des notes ajoutées. Violet d'origine → main gauche rose (elle était violette,
  comme l'application) ; accent vert ou turquoise → main droite bleue. Variables `--hand-lh`,
  `--hand-rh` posées par `main.js` à chaque changement de couleur.
- **Défaut trouvé et corrigé** (causé par le travail du 13/10 sur la couleur) : avec la couleur
  d'origine, les touches allumées des mini-claviers (Exercices…) étaient peintes en NOIR :
  `--vk-accent-deep` n'existait que dans `.vk-root`. Défini désormais sur `:root`.
- **Styles de main gauche** renommés (identifiants internes inchangés) : Gospel / worship → **Posé**,
  Ballade → **Arpégé**, Comping swing → **Rythmé** (Plaqué inchangé). Consigne du Copilote à jour.

## Copilot IA — étiquettes
- Accueil : « Par où commencer au piano ? », « Comment accompagner une chanson ? », « Rends mes
  accords plus beaux » (avant : « voicing intéressant », « 2-5-1 », « mieux accompagner »).
- « Continuer : » : « Fais-moi entendre un exemple », « Plus simple, s'il te plaît », « Va plus
  loin », « Que fait chaque main ? », « Donne-moi un exercice pour le travailler », « Résume en trois
  points ». Seul le premier déclenche un exemple audio (`asksForExample` vérifié).
- Exercices : + « Comment le retenir ? », « Dans quels morceaux l'utiliser ? » ; « Quelles voix
  bougent ? » → « Quelles notes bougent ? ».
- Consigne : « pianiste qui maîtrise son instrument dans tous les styles (variété, pop, gospel,
  jazz, classique…) … débutants comme confirmés » (avant : « jazz, gospel, worship »).

## Tests
- Nouveaux : `test-hand-colors.js` (14). Mis à jour : `practice-exercise.test.js` (noms de styles),
  `test-copilot-demo.js` (sous-titre « Arpégé »), `test-pedagogie-dom.js` (étiquettes).
- Suite complète comparée avant/après : seule différence, le nouveau test (vert). Build, `test:chords`
  98/98, Parties 1 et 3 OK.

## Non vérifié
- Sur la vraie application Electron : vidéo MP4 réelle dans le nouveau cadre, séparation Demucs réelle.
- Export (WAV / MIDI) : toujours inactif.

## Correction du 13/10 (Narcisse) — transposition du Studio
- « Transposition du morceau » : trop long → **libellé retiré**. Les boutons deviennent **♭** (un
  demi-ton plus bas) et **♯** (un demi-ton plus haut) : ils disent ce qu'ils font et se distinguent du
  − / + du clavier MIDI. Infobulles et noms accessibles complets. Valeur centrée et lisible (les
  flèches du champ numérique rognaient « −1 ») ; « −1 demi-ton » au singulier.

## Suite du 13/10 (Narcisse) — Pistes séparées, ♭ 0 ♯, export, mode enregistrement
- **Pistes séparées repliables** en miroir de Musiques importées : bouton › dans l'en-tête ; replié =
  rond de 46 px (icône de console) en haut à droite ; « Lecture » et « Export » remontent vers le
  milieu de la colonne. Animation FLIP (studio-tab.js `applyStemsCollapsed`) : taille du panneau et
  déplacement des deux blocs animés, contenu effacé d'abord. Choix gardé (`pjc.studio.stemsCollapsed`).
- **♭ 0 ♯** : signes dessinés en SVG (le caractère ♭/♯ dépendait de la police et laissait un espace
  au-dessus), groupe centré dans « Lecture » (grille minmax(0,1fr) · auto · minmax(0,1fr)), texte
  d'état à droite (« −1 demi‑ton », trait d'union insécable).
- « Lire la région en boucle » → **« Lire la piste en boucle »**.
- **Export branché** (`ui/studio-export.js`, testé 13/13) :
  - « Exporter le mixage (WAV) » : pistes séparées avec leurs réglages (volume, muet, solo, volume
    général) et la transposition, rendues hors temps réel (OfflineAudioContext + SoundTouch) ; sans
    pistes, la région du morceau d'origine. Vérifié dans le banc d'essai : fichier écrit, son non
    silencieux, transposition +2 réellement appliquée (rapport des passages par zéro 1,1227 = 2^(2/12)).
  - « Exporter le piano (MIDI) » : la piste piano transcrite par `pedagogie:transcribe-piano`
    (piano-transcriber.py, même moteur que Pédagogie IA), décalée de la transposition, pédale
    comprise ; sans séparation, le son de la région. Si les modules Python manquent, la notification
    le dit.
  - Export visible aussi en Scène (il y était masqué).
- **Mode enregistrement** (bouton ● du lecteur, dès le compte à rebours) : classe `studio-rec-mode`
  sur `<html>` ; ne restent que la vidéo, le lecteur, le nom du fichier, le nom et le logo de
  l'application, centrés. Masqués : onglets, thème, réglages, clavier MIDI, panneaux, pistes, Lecture,
  Export, boutons de région, forme d'onde, notifications. Tout revient à l'arrêt (ou si la capture
  échoue).
- **Non vérifié** : la vraie capture d'écran (Electron) et la vraie transcription (modules Python).
