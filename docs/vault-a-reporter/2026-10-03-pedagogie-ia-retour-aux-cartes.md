# Pédagogie IA — retour aux cartes, relevé qui continue, « Style » groupé (03/10/2026)

À reporter dans le vault : `state/current-work.md`, `log.md`.

## Demande de Narcisse
« On ne peut pas revenir en arrière : une fois qu'on a choisi un tutoriel, on n'a pas
d'option qui permette d'en changer. […] à la place de cette bibliothèque [« Mes
tutoriels »], on met le bouton pour revenir en arrière. Quand on revient en arrière, on
retrouve les étiquettes. »

Vu dans sa vidéo : la liste « Style » était seule sur sa ligne, centrée, sous les
questions rapides du Copilote.

## Fait
- **`src/index.html`** :
  - dans l'en-tête, **« ← Mes tutoriels »** (`#pedagogie-back-btn`) remplace le bouton qui
    ouvrait le tiroir. Il n'apparaît que quand un tuto est ouvert. « Importer une vidéo »
    reste.
  - Le tiroir `#pedagogie-library-drawer`, sa liste `#pedagogie-track-list` et le bouton
    « Mes tutoriels » de l'accueil sont retirés : les cartes sont la bibliothèque.
  - La ligne du dossier, avec « Changer de dossier… », passe sur l'accueil, à droite du
    titre « Tes tutoriels ». Le chemin est raccourci (« …/Musique/Tutos ») ; il est en
    entier dans l'infobulle.
  - « Style » et sa liste sont groupés (`.copilot-style`) : ils restent ensemble, à droite
    de la rangée des questions.
- **`src/ui/pedagogie-tab.js`** :
  - `closeTutorial()` arrête la vidéo, ferme le tuto et revient aux cartes. Le Copilote
    quitte le mode tuto (`pedagogie-selection-change` sans chemin).
  - **Un relevé est un travail rangé à part** (`runReading`). Ses résultats restent dans
    un objet `job` :
    - ils ne s'affichent que si son tuto est encore ouvert ;
    - ils sont toujours gardés en mémoire sous son tuto.

    Avant, ils étaient écrits directement dans l'écran : rouvrir un autre tuto pendant un
    relevé les aurait mélangés. C'est pour cela que `selectTrack` était bloqué pendant un
    relevé.
  - Un seul relevé tourne à la fois. Les suivants attendent leur tour (`readingQueue`) ;
    leur carte dit « Relevé en attente… ».
  - La carte d'un tuto en cours de relevé dit « Relevé en cours… », puis « Déjà lu » une
    fois le relevé gardé.
  - L'accueil dit aussi quand le dossier n'a pas pu être lu, ou qu'il est vide. C'était le
    rôle du tiroir.

## Vérifié
- `src/ui/test-pedagogie-dom.js` : 120/120, dont 6 nouveaux contrôles (bouton retour,
  tiroir retiré, dossier sur l'accueil, retour aux cartes, relevé à part, Style groupé).
- Scénario Playwright `pedago-back`, sur l'application construite avec le faux
  electronAPI, en sombre et en clair, sans erreur :
  1. l'accueil n'a pas de bouton retour ;
  2. le tuto ouvert l'a ;
  3. le relevé est lancé, puis on clique « ← Mes tutoriels » : la carte dit « Relevé en
     cours… » ;
  4. un autre tuto s'ouvre, et le premier relevé finit pendant ce temps : rien ne s'affiche
     sur le second tuto, et le premier est gardé (« Déjà lu ») ;
  5. rouvert, le premier tuto revient de la mémoire ;
  6. « Style » et sa liste sont sur la même ligne.
- Les scénarios `pedago-live`, `pedago-memory` et `pedago-tools` repassent sans erreur.
