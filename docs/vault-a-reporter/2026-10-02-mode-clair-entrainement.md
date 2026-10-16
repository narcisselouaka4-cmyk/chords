# Mode clair d'Entraînement — fond gris lavande, roue redessinée (02/10/2026)

À reporter dans le vault (`state/current-work.md`, `log.md`, `decisions/` si utile).

## Demande de Narcisse
- Mode sombre du Temps réel : « c'est même parfait (que rien ne bouge de ce côté-là) ».
- Mode clair : il n'aime pas le fond blanc, et la roue « donne l'impression qu'elle
  passe uniquement en mode sombre ».
- Ses choix (question posée) : **fond gris lavande**, appliqué à **tout Entraînement**
  (Temps réel, Sessions MIDI, Pédagogie IA, Copilote IA, Exercices) ; Analyse et Studio
  inchangés.

## Fait
- `src/ui/refonte/astra-bridge.css` : sous `:root[data-theme='light'] #practice-tab`,
  fond `#e6e2ee` (au lieu de `#f5f4f7`), gris secondaires un cran plus foncés
  (`--tr-muted #655d70`, `--tr-secondary #5c546a`, ≥ 4,5:1 sur ce fond). En-tête,
  sous-navigation, clavier et pied de page restent clairs. `astra-training.css` (copie
  de la maquette Astra) non touchée.
- `src/ui/refonte/astra-realtime.css`, section « Mode clair : de néon à encre » :
  - un cadran (disque un peu plus clair que le fond, ombre douce) sous la roue ;
  - anneau, graduations et points en encre ;
  - polygone au contour net, sans halo ;
  - pastilles cerclées comme des épingles ;
  - fondamentale en vert foncé `#2b6a57` (5:1) ;
  - plus de lueur sous le nom de l'accord ;
  - séparateurs des lectures et du sélecteur de clé à l'encre légère.
- Piège rencontré : le cadran (`::before` positionné) se peignait **au-dessus** de la
  roue. En sombre, la lueur l'était déjà, mais transparente. Correctif, en clair
  seulement : `isolation: isolate` sur `.live-wheel-wrap` et `z-index: -1` sur le
  cadran.
- Garde-fou dans `src/ui/test-training-dom.js` : halos du sombre présents, clair sans
  halo, fond lavande déclaré.

## Vérifié
- Toutes les règles ajoutées commencent par `:root[data-theme='light']`, et aucune ligne
  n'a été retirée.
- Captures sombres du Temps réel (repos, Cmaj7, B♭11, Cdim7, petit écran) **identiques
  au pixel près** avant / après.
- Analyse en clair identique. Studio en clair identique, hors une zone animée qui varie
  déjà d'une capture à l'autre.
- Les 4 autres sous-onglets en clair : cartes blanches sur fond lavande, rien de perdu.
- Build OK, régressions Partie 1 / 3 OK, suite : 89 suites, mêmes 6 échecs anciens.

## Si Narcisse veut aller plus loin
- Même fond lavande pour Analyse (`--an-bg`) et Studio (`--r-ground`) : non fait (choix
  « tout Entraînement »).
