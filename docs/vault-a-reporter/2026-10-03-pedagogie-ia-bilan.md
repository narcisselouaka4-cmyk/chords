# Pédagogie IA — bilan de la refonte (6 lots, 03/10/2026)

À reporter dans le vault : `state/current-state.md` (Pédagogie IA refaite),
`state/next-actions.md` (essais sur le PC de Narcisse), `log.md`. Le détail de chaque lot
est dans sa note, dans le même dossier.

## Le besoin, dit par Narcisse
« La clarté des “professeurs” sur YouTube : parfois je ne comprends pas tout ce que dit
le pianiste (langue, explications floues). Pédagogie IA doit m'aider à comprendre les
concepts utilisés dans la vidéo, pour les appliquer à mon jeu. » Et surtout : « Comment
est-ce qu'on appliquerait ce qu'il vient de faire dans une progression
4-5-3-6-2-5-1 ? »

## Les 6 lots (branche `fix/exercices-voicing-correctifs`)

| Lot | Commit | Ce qui a changé | Note |
|---|---|---|---|
| 1 | `698c503` | Vidéo à gauche, Copilote intégré à droite ; « ici » = le passage regardé ; questions rapides ; moments cliquables ; retraits (résumé, glossaire, transcription affichée) | `…-copilote-integre.md` |
| 2 | `bbe3cd6` | **Ses voicings** appliqués à une autre progression (gabarit de rôles, registre du prof) ; outil `apply_tutorial_passage` ; repli sans le modèle | `…-transfert-voicings.md` |
| 3 | `6fa7c2f` | **Ses accords de passage** (relation à l'accord d'arrivée), placés là où il s'en sert | `…-transfert-enchainements.md` |
| 4 | `cd1ef41` | **Ses licks, runs, fills** : rôle ou rang de gamme de chaque note, contour et rythme gardés | `…-transfert-licks.md` |
| 5 | `f6f0a6e` | Relevé **gardé en mémoire** (réouverture instantanée), **accueil en cartes** (vignette ffmpeg, durée, « Déjà lu ») | `…-memoire-vignettes.md` |
| 6 | `57da6f2` | **Vitesse**, **boucle A-B**, exemple → **Ma grille** / **Favoris** d'Exercices | `…-outils-de-travail.md` |

## Décisions à garder
- **Un moteur déterministe** reconstruit ce que joue le prof : il part de ses notes
  exactes, lues à l'image ou au son. Le Copilote **explique** : il n'écrit aucune note
  du transfert ; l'application les écrit sous sa réponse.
- **La parole du prof** est un indice pour le Copilote, jamais affichée ni citée.
- **Les demandes claires** (appliquer, autre tonalité, « ce voicing ? ») reçoivent
  toujours l'outil qui reprend les notes du prof, même si le modèle se trompe d'outil ou
  n'en appelle aucun.
- **Un relevé est gardé.** Le refaire est un choix (« Refaire le relevé »).

## Vérifications faites (dans le conteneur)
- Tests :
  - `test-tutorial-transfer.js` 86/86 ;
  - `test-copilot-client.js` 199/199 ;
  - `test-tutorial-memory.js` 16/16 ;
  - `test-example-export.js` 8/8 ;
  - `test-tutorial-moment.js` 26/26 ;
  - `test-pedagogie-dom.js` 114/114.
- Suite complète (93 suites) : seuls restent les 6 échecs anciens (skin-manager,
  coach-dom, load-session, training-dom, voicing-preview, analysis-workspace).
- Build OK, régressions Partie 1 et Partie 3 OK.
- Scénarios Playwright sur l'application construite, avec un faux electronAPI, en sombre
  et en clair, sans erreur :
  - lecture et Copilote ;
  - les trois transferts ;
  - mémoire après rechargement ;
  - vitesse et boucle ;
  - envoi vers Exercices.
- Non exécuté ici : Electron lui-même, pour le nouvel IPC `pedagogie:thumbnail`. Sa
  commande ffmpeg a été vérifiée telle quelle avec le ffmpeg d'imageio.

## À essayer sur le PC de Narcisse
1. `git pull`, puis relancer l'application (`npm run dev`).
2. Entraînement › Pédagogie IA. L'accueil montre les tutos en cartes ; les vignettes
   arrivent une à une.
3. Ouvrir « Amazing Grace », « Lire ce tutoriel », laisser jouer jusqu'à un passage qui
   l'intéresse.
4. « Appliquer à une progression… » → ses voicings → 4-5-3-6-2-5-1 → une tonalité.
   Écouter, puis « Ajouter à Ma grille ».
5. Taper sa question : « Comment est-ce qu'on appliquerait ce qu'il vient de faire dans
   une 4-5-3-6-2-5-1 ? »
6. Fermer, rouvrir le tuto : il doit s'ouvrir tout de suite, avec « Déjà lu ».
7. Si les notes du prof n'ont pas pu être lues (clavier non lisible à l'image, pas de
   transcription au son), le Copilote le dit. Il faut alors calibrer le clavier (V2N)
   ou installer la transcription au son.
