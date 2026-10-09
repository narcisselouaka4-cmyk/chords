# Pédagogie IA — la plage du Copilote (10 min), frise repliée (03/10/2026)

À reporter dans le vault : `state/current-work.md`, `log.md`, et `decisions/` (choix de
Narcisse : une plage de **10 minutes au plus**, choisie avec des listes).

## Demande de Narcisse
- « Pour la sélection du passage, ce n'est vraiment pas optimal de devoir définir une région
  en secondes […] sans avoir à taper du texte, des tirets ou des zéros. Il faudrait des
  champs présélectionnés (heures, minutes de 0 à 59). »
- « Ce qui serait bien […] ce serait qu'on puisse choisir les passages que l'on veut,
  définir notre propre plage d'analyse. Là, une minute, malheureusement c'est trop court. »
- Son choix : **10 minutes au plus**.
- « Les étiquettes d'accords : je ne sais pas pourquoi tu les as mises, d'autant que parfois
  elles ne suivent même pas ce que joue le pianiste. […] Autant les garder repliées par
  défaut et permettre de les déplier. »

## Fait
### Module pur `src/pedagogie/passage-range.js`, testé (`test-passage-range.js`, 12/12)
- `MAX_PASSAGE_SECONDS = 600`, `FOLLOW_SECONDS = 30`.
- `splitTime` / `joinTime` (h, min, s).
- `timeOptions(durée)` : les heures n'apparaissent que pour une vidéo d'une heure ou plus ;
  les minutes vont jusqu'à la dernière minute de la vidéo (de 0 à 59 au-delà d'une heure),
  les secondes de 0 à 59.
- `setRangeBound(plage, bord, s, durée)` :
  - le début reste avant la fin, la plage reste dans la vidéo et dure 10 min au plus ;
  - l'autre bord suit au besoin, et `adjusted` dit lequel.
- `rangeLength` : « 1:00 », « 10:00 ».

### La barre du passage, sous la vidéo (`index.html`, `pedagogie-tab.js`, `astra-pedagogie.css`)
```
Passage  Début [09] min [57] s [Maintenant] → Fin [10] min [57] s [Maintenant]  1:00 · 10 min max  [Boucler]
il joue 9:57–10:03 · il explique 10:03–10:12 …   (bande colorée, cliquable)
```
- Avant tout choix, elle **suit la vidéo** : les 30 dernières secondes. Ses listes avancent
  avec la vidéo, en grisé, avec « suit la vidéo : les 30 dernières secondes ».
- Toucher une liste ou « Maintenant » **fixe** le passage. Une liste ouverte n'est jamais
  changée sous les doigts.
- Quand un bord passe de l'autre côté, ou que la plage dépasserait 10 min, l'autre bord
  suit et la barre le dit :
  - « 0:30 · 10 min max · la fin a suivi » ;
  - « 10:00 · 10 min au plus : la fin a suivi ».
- « Boucler » (l'ancienne boucle A-B) fait tourner la vidéo sur le passage. Un saut voulu
  ailleurs (clic sur un accord) n'est pas ramené.
- « Suivre la vidéo » rend la plage à la vidéo.
- Maj + clic sur un accord de la frise : le passage devient cet accord, en boucle.
- **Bande « il joue / il explique »** du passage :
  - elle est à l'échelle du temps : un moment sans rien reste un blanc ;
  - violet : il joue ; gris : il explique ; rayé : il joue en parlant ;
  - un appui place la vidéo ;
  - une légende donne les moments (« il explique 0:12–0:16 »).
- Disparaissent :
  - la liste 10 / 20 / 30 / 60 s de l'en-tête du Copilote. L'en-tête garde « Passage
    9:57 → 10:57 », en lecture seule ;
  - le bloc « Boucle A-B ».

### Le Copilote parle de la plage choisie
- `passageWindow(now, { fixed })` (`tutorial-moment.js`) remplace `loop` (toujours
  accepté) ; le passage dit s'il est `chosen`.
- `momentContext` garde au plus 60 accords et 80 phrases (10 minutes, c'est beaucoup) et
  compte le reste (`chordsMore`, `transcriptMore`).
- Le contexte dit « = le passage qu'il a choisi (Début / Fin) de 9:57 à 10:57 », et « … (40
  de plus) » / « … (20 phrases de plus, non détaillées : demande un moment précis) ».

### Frise des accords repliée par défaut
- Le bouton « ▸ Accords relevés (3) » la déplie et la replie.
- Le choix est retenu dans le navigateur (`localStorage`, clé `pedagogie-strip-open`).
- Le conseil « Clic : placer la vidéo · Maj + clic : en faire le passage » est sur la frise
  elle-même.

## Vérifié
- Tests purs :
  - `test-passage-range.js` 12/12 ;
  - `test-tutorial-moment.js` 30/30 (plage de 10 min, contexte « choisi », reste compté) ;
  - `test-copilot-client.js` 210/210.
- `src/ui/test-pedagogie-dom.js` : 137/137, dont 9 contrôles du lot.
- Scénario Playwright `pedago-passage`, sur une vidéo de test de 12:34, en sombre et en
  clair, sans erreur :
  1. la frise est repliée, « Accords relevés (3) » ;
  2. à 0:20, la barre suit la vidéo (0:00 → 0:20), en grisé ; la bande montre « il joue en
     parlant 0:00–0:12 · il explique 0:12–0:16 », puis un blanc jusqu'à 0:20 ;
  3. un appui sur « il explique » place la vidéo à 0:12 ;
  4. Début 9 min → 9:00 → 9:30 (« la fin a suivi ») ; Début 57 s, puis Fin 57 s →
     **9:57 → 10:57**, « 1:00 · 10 min max » ;
  5. le Copilote reçoit « le passage qu'il a choisi (Début / Fin) de 9:57 à 10:57 (start
     597 s, end 657 s) » ;
  6. Fin 12:57 sur une vidéo de 12:34 donne 12:34. Début 1:57 donne **1:57 → 11:57**,
     « 10:00 · 10 min au plus : la fin a suivi » ;
  7. « Boucler » sur 1:57 → 2:03 : en 9 s de lecture, la vidéo reste entre 1:57 et 2:03 ;
  8. « Suivre la vidéo » donne 1:30 → 2:00, et la boucle est retirée ;
  9. la frise se déplie, et l'est encore quand on rouvre le tuto.
- Les scénarios `pedago-tools` (« Boucler », Maj + clic, saut hors du passage),
  `pedago-speech`, `pedago-live`, `pedago-back`, `pedago-memory`, `pedago-import` et
  `pedago-apply` repassent sans erreur.
- Suite complète : 95 suites, seuls les 6 échecs anciens connus restent. Build et
  régressions Partie 1 et Partie 3 OK.

## Pas fait (et pourquoi)
- `clock()` en h:mm:ss : inutile. Un tuto analysé dure 30 min au plus, et la barre n'existe
  que pour un tuto analysé. Les listes savent quand même afficher les heures.
