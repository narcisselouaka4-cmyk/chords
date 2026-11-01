# Pédagogie IA — appliquer les voicings du prof à une autre progression (Lot 2, 03/10/2026)

À reporter dans le vault (`state/current-work.md`, `log.md`, `concepts/` : « gabarit de
rôles »).

## Demande de Narcisse
« Comment est-ce qu'on appliquerait ce qu'il vient de faire dans une progression
4-5-3-6-2-5-1 ? » Ce qu'il veut reprendre du prof, dans l'ordre des lots :
- ses voicings (ce lot) ;
- ses enchaînements, c'est-à-dire ses accords de passage (lot 3) ;
- ses licks, runs et fills (lot 4).

Pas le rythme.

## Principe (décision)
Un moteur **déterministe** part des notes exactes du prof (lues à l'image, ou au son) et
les reconstruit sur chaque accord demandé. Le Copilote **explique** ; il n'écrit aucune
note lui-même. Les notes obtenues sont écrites par l'application sous sa réponse.

## Fait
- `src/pedagogie/tutorial-transfer.js` (nouveau) :
  - **Gabarit de rôles.**
    - Pour chaque accord du passage, on prend le plus grand groupe de notes attaquées
      ensemble, plus la basse encore tenue si elle est dans l'accord.
    - Les notes sont réparties main par main, avec le rôle de chaque note (1, 3, 5, 7,
      9, 11, 13, avec l'altération jouée) et l'écart avec la note du dessous.
    - Exemple : G13 = main gauche 1 | main droite b7 · 3 · 13 · 9.
  - **Sur l'accord cible**, chaque rôle prend la note qui le tient dans cet accord :
    - la 7e de Fmaj7 est Mi, celle de G7 est Fa ;
    - une tension absente prend la plus proche disponible (11 → #11 sur un majeur) ;
    - une triade fait jouer la fondamentale à la place de la 7e.
  - **Un gabarit par famille d'accord.** Le prof a souvent une forme pour le mineur, une
    pour la dominante, une pour le majeur. Si la famille manque, on prend la plus
    proche.
  - **Registre.**
    - Chaque main reste à une quinte au plus de là où le prof la pose. Auparavant,
      enchaîner au plus près sur un cycle de quartes faisait monter les mains jusqu'à
      l'aigu.
    - Le dessus de la main droite ne dépasse pas Sol5, sauf si le prof joue plus haut.
    - La main droite reste au-dessus de la gauche.
    - La basse écrite (G7/B) est jouée par la main gauche.
  - **Progressions en degrés** (`progressionFromDegrees`) :
    - « 4-5-3-6-2-5-1 », ou « IV-V-iii… », donne les accords à quatre sons de la
      tonalité ;
    - en mineur, on prend la gamme naturelle avec un V7 ;
    - les tonalités s'écrivent en anglais ou en français (« Fa♯ », « Sol mineur »,
      « Ré bémol ») ;
    - les noms d'accords et de notes s'écrivent en dièses ou en bémols selon la
      tonalité.
- **Outil du Copilote `apply_tutorial_passage`** (`src/pedagogie/copilot-client.js`).
  - Paramètres : start, end, what (voicing | enchainement | lick), chords, title.
  - Il est prioritaire sur les autres outils audio.
  - Sous la réponse, il écrit :
    - « _Voicings repris du prof (0:00 Dm9 : main gauche 1 | main droite b3 · 5 · b7
      · 9 ; …)_ » ;
    - puis une ligne par accord, par exemple « **Bmaj7** : main gauche Si2 · main
      droite Ré♯4 Fa♯4 La♯4 Do♯5 ».
  - Il prépare aussi l'exemple : touches jaunes, sortie MIDI.
- **Repli sans le modèle** (`parseTutorialRequest` + `tutorialToolCalls`). Une demande
  claire sur le passage reçoit toujours l'outil qui reprend les notes du prof :
  - c'est le cas même si le modèle n'appelle aucun outil, ou s'il appelle
    `play_progression`, qui jouerait les voicings de l'application ;
  - pour « appliquer », l'outil part avec les accords écrits par le modèle s'il les a
    donnés, sinon avec les accords de la tonalité ;
  - pour « ce voicing ? », on rejoue le dernier accord du passage ;
  - pour « autre tonalité », on rejoue le passage transposé ;
  - un moment cité (« le lick de 0:02 ») sert de passage ;
  - pour « qu'a-t-il voulu dire ? », le Copilote donne seulement l'explication, sans
    relance.
- Deux corrections trouvées en route :
  - Le contrôle anti-complaisance sur la tonalité relançait le modèle quand la réponse
    disait « en Fa♯ » alors que le tuto est en Do. La réponse et les notes calculées
    étaient effacées. Une tonalité demandée par le pianiste n'est plus une
    contradiction.
  - `transposeInterval` ne lisait pas « Fa♯ » ni « Si♭ » (symboles ♯ et ♭) : corrigé
    dans `teacher-notes.js`.

## Vérifié
- `src/pedagogie/test-tutorial-transfer.js` (44/44), avec des cas écrits à la main :
  - le prof joue Do2 Si2 | Mi3 Sol3 Ré4 ; sur 4-5-3-6-2-5-1 en Do, on obtient Fmaj7 =
    Fa2 Mi3 | La3 Do4 Sol4 et G7 = Sol2 Fa3 | Si3 Ré4 La4, et le Cmaj7 final retombe
    sur son voicing ;
  - les 12 tonalités : mains jamais croisées, dessus ≤ La5.
- `src/pedagogie/test-copilot-client.js` (197/197) : l'outil, le repli, aucune relance
  parasite, la tonalité demandée qui n'est plus « corrigée ».
- Scénario Playwright : « Appliquer à une progression → ses voicings → 4-5-3-6-2-5-1 →
  Fa♯ ».
  - Le Copilote simulé ne fait qu'expliquer.
  - L'application écrit les 7 accords en dièses et lance l'exemple, sans erreur.
- Build OK, régressions Partie 1 / 3 OK.

## Limites connues
- Si les mains ne sont pas lues à l'image (pas de couleur), la séparation se fait au plus
  grand écart entre deux notes. Elle peut différer de ce que fait vraiment le prof.
- Le gabarit d'une famille est le premier joué dans le passage.
