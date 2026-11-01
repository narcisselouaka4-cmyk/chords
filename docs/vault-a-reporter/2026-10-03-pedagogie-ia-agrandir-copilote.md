# Pédagogie IA — agrandir le Copilote : poignée et bouton (03/10/2026)

À reporter dans le vault : `state/current-work.md`, `log.md`, `decisions/` (son choix :
poignée + bouton).

## Demande de Narcisse
« La fenêtre est trop petite : elle est vraiment trop courte. Il faudrait pouvoir
l'agrandir, mais si on agrandit la fenêtre de Copilot, la fenêtre vidéo ainsi qu'à côté
seront forcément impactées. Je ne sais pas trop comment relier les deux, mais il faut
trouver un moyen. »

Son choix, parmi trois : **une poignée et un bouton**. Les deux autres options étaient le
bouton seul et la poignée seule.

## Fait
- **La poignée**, entre la vidéo et le Copilote (`#pedagogie-resizer`, un séparateur).
  - On la tire à la souris : le Copilote grandit, la vidéo rétrécit d'autant, en gardant
    sa forme 16:9 ; ou l'inverse.
  - Au clavier : ← et → (2 % par appui), Début (le plus large) et Fin (le plus étroit) ;
    Entrée bascule entre normal et large.
  - Un double-clic rend la largeur normale.
- **Le bouton « Agrandir » / « Réduire »**, dans l'en-tête du Copilote : 38 % ↔ 60 % de
  la largeur.
- **Les bornes** :
  - le Copilote occupe de 25 à 72 % de la largeur, et 300 px au moins ;
  - la vidéo garde 380 px au moins.
- **La largeur est retenue** dans le navigateur (`pedagogie-copilot-width`).
- **L'en-tête du Copilote tient sur une ligne** (Copilote · tuto, Passage, Agrandir) : la
  conversation y gagne de la hauteur.
- **Fenêtre étroite** (moins de 1100 px, la vidéo au-dessus du Copilote) : ni poignée ni
  bouton.
- Module pur `src/pedagogie/copilot-width.js` (part par défaut, part large, bornes,
  poignée, clavier, part retenue), testé.

## Vérifié
- `test-copilot-width.js` : 12/12.
- `test-pedagogie-dom.js` : 147/147, dont 5 contrôles du lot.
- Scénario Playwright `pedago-resize`, en sombre et en clair, sans erreur, sur un écran de
  1600 px :
  1. normal : Copilote 597 px (38 %), vidéo 959 × 294 ;
  2. « Agrandir » : Copilote 943 px (60 %), vidéo 613 × 244, le bouton dit « Réduire » ;
  3. « Réduire » : retour à 38 % ;
  4. poignée tirée à 700 px : 56 % ;
  5. poignée tirée trop loin : bornée à 72 % ;
  6. trois fois → : 66 % ;
  7. double-clic : 38 % ;
  8. agrandi puis rouvert : toujours 60 % ;
  9. fenêtre de 1000 px : ni poignée ni bouton.
- Les scénarios `pedago-live` et `pedago-passage` repassent sans erreur.

## Pour gagner encore de la hauteur
Le clavier en bas de l'écran se replie avec sa flèche (à droite de « Clavier MIDI »). Il
n'est pas replié d'office : les touches que joue le Copilote s'y allument.
