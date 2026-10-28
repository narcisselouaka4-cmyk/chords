# Temps réel — scène épurée, grace notes ignorées (02/10/2026)

À reporter dans le vault (`state/current-work.md`, `log.md`, `experiments/` si utile).

## Demande de Narcisse
Retours après essai de la Lecture en direct (la roue lui convient telle quelle) :
1. Au-dessus de la roue, garder « Jouez un accord sur votre clavier MIDI » ; retirer
   « MIDI connecté : … » et « Les notes jouées seront reconnues automatiquement ».
2. Retirer « Réécouter » (inutile en temps réel) et les lignes MIDI et Fréquence.
3. Lectures utiles (fondamentale, basse jouée, qualité, position, intervalles, voicing)
   en haut à droite, à la place du compteur de notes, supprimé.
4. Portée en haut à gauche, à la place du bandeau « Lecture en direct », supprimé.
5. Grace notes : Cmaj7 avec un Ré frotté vers le Mi → l'app comptait le Ré.

## Fait
- `src/index.html`, `src/ui/refonte/astra-realtime.css` : grille d'une rangée
  `left center side`, portée et lectures calées en haut ; éléments retirés.
- `src/ui/live-reading.js` : plus de compteur, MIDI, Fréquence, ni « Réécouter » ;
  `src/main.js` : `replayLiveChord` et le texte « MIDI connecté » retirés.
- Grace notes — `isGraceNote` (`src/note-grouper.js`) : touche tenue ≤ 150 ms, note
  voisine (≤ 2 demi-tons) enfoncée 30 ms après au moins et au plus 80 ms après le
  relevé, et qui dure plus longtemps. Utilisée par le regroupement temporel (c'était
  lui qui remettait le Ré ~200 ms après) et par `main.js` sous la pédale (le Ré sort
  de l'accord, le son continue).
- Tests : `src/note-grouper.test.js` (12/12), test-live-reading 31/31,
  test-training-dom (mêmes 11 anciens échecs). Suite : 89 suites, mêmes 6 échecs
  anciens. Build OK, régressions Partie 1 et 3 OK. Vérifié en navigateur (faux MIDI) :
  grace Ré→Mi avec et sans pédale → Cmaj7 ; Ré tenu → Cmaj9.

## Pas fait (plus tard, d'après Narcisse)
- Reconnaître les mouvements (traits, ornements comme geste musical).
