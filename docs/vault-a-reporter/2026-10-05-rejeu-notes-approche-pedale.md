# Copilote — le rejeu change la pédale après les notes d'approche (05/10/2026)

À reporter dans le vault :
- `state/current-work.md` et `log.md` ;
- `concepts/` : la note d'approche sous la pédale, et ce que fait un pianiste ;
- `decisions/` : on change la pédale, on n'étouffe pas une note seule (impossible : la pédale
  MIDI, CC64, vaut pour tout le clavier) ;
- `state/next-actions.md` : l'écouter sur un vrai passage, en sortie MIDI vers un VST.

## Demande de Narcisse
« copilot gère mal quand il y a un mélange de grace note (montée ou descente chromatique) et
pédale de sustain : ça crée des dissonances qui n'ont pas lieu d'être ».

## Cause
- Un seul exemple mêle les notes du prof et la pédale : le rejeu d'un passage du prof
  (`passageExample`, `src/pedagogie/teacher-notes.js`).
  - Les exemples écrits par l'application jouent sans pédale.
  - Le rejeu de son propre jeu reprend sa vraie pédale ; on n'y touche pas.
- La pédale du rejeu est :
  - la vraie, quand elle a été relevée au son ;
  - sinon, « à chaque accord » : enfoncée 0,04 s après chaque attaque de main gauche, relevée
    0,02 s avant la suivante.
- Une note relâchée pédale enfoncée sonne jusqu'au prochain changement de pédale. Une note
  d'approche (Ré♯ → Mi) sonnait donc **avec** sa note d'arrivée, un demi-ton plus loin,
  jusqu'à l'accord suivant.
- Un pianiste change la pédale juste après la note d'arrivée : l'approche s'éteint, l'accord
  et la basse continuent.
- Mesuré sur ses relevés, en rejouant le rejeu d'avant :
  - « L'Éternel est bon » (48 s) : 8 de ses 11 notes d'approche sonnaient encore après le
    lever du doigt, 5,04 s en tout. Do♯5 tenait 1,23 s, Ré♯5 0,98 s, La♯5 1,11 s.
  - « comment harmoniser rapidement » (10 min) : 3 notes sur 5, 2,26 s en tout ; Si3 sonnait
    jusqu'à 1,10 s avec Do4.

## Fait
### Repérer les notes d'approche
`approachNotes`, une fonction pure. Une note est une note d'approche si elle est brève
(0,3 s au plus) et mène, à un demi-ton et dans la même main, à une autre note :
- **enchaînée** : sa note d'arrivée commence au plus 0,35 s après. Elle est relâchée au plus
  tard à cette attaque (à une image près, 0,06 s), liée ou détachée ;
- **écrasée** : attaquée avec une note tenue, à un demi-ton, et relâchée bien avant elle ;
- **en amas bref** : des demi-tons attaqués ensemble, seuls de leur main (Do5 + Do♯5).

Dans une montée ou une descente chromatique, toutes les notes en sont, sauf la dernière ;
dans une broderie (La → La♯ → La), les deux premières.

Ne sont **pas** des notes d'approche :
- un accord bref qui contient un demi-ton (Si Do Mi Sol), même lu une image de travers ;
- une note longue ;
- une note de l'autre main ;
- une note encore tenue après l'attaque de sa voisine.

### Changer la pédale autour d'elles
C'est `pedalAfterApproaches`, appelé par `passageExample`, pour les deux pédales.
- Dans chaque morceau de pédale, les relâchements de notes d'approche (à 0,35 s au plus l'un
  de l'autre) forment une figure.
  - **La pédale se relève** au premier relâchement et **se rabaisse** 0,04 s après le dernier.
  - La note d'arrivée, tenue au doigt, est reprise ; les notes d'approche s'éteignent.
- Un morceau de pédale de moins de 0,3 s avant la figure est supprimé : la pédale attend la fin
  de l'approche. C'est une pédale syncopée, pour une note écrasée avec l'accord.
- **Ce que la pédale faisait sonner continue de sonner.** La basse, l'accord et la mélodie
  relâchés, sauf les notes d'approche, sont tenus au doigt jusqu'à la reprise + 0,05 s
  (`holdMs`), sans dépasser la prochaine attaque de la même touche.
- Tout est calculé en millisecondes, comme les évènements : pas d'écart d'arrondi entre une
  note et la pédale.

### Le mode « sans pédale » reste fidèle
- Une note tenue au doigt garde sa vraie fin sur son relâchement (`withoutPedalAt`, posé par
  `buildNotesExample`).
- `withoutPedal()` (`src/exercise-demo-player.js`, désormais exporté) la remet à son heure.
  Sans pédale, chaque note s'arrête toujours quand le doigt se lève.

### Ce qui ne change pas
- Les notes : touches, attaques, forces.
- La pédale d'un passage sans note d'approche.
- Le sous-titre (« pédale à chaque accord », « avec sa pédale »).
- Le clavier montre ce qui sonne : les notes d'approche s'y éteignent avec le son.

## Vérifié
- **Tests unitaires** :
  - `test-teacher-notes.js` 69/69, dont 21 nouveaux :
    - la détection (cas qui en sont, cas qui n'en sont pas) ;
    - Ré♯5 écrasé avec l'accord ;
    - Fa♯5 → Sol5 au milieu d'une harmonie ;
    - la montée Do5 → Do♯5 → Ré5 ;
    - la pédale relevée au son ;
    - le mode sans pédale ;
    - un passage sans approche, inchangé ;
    - son vrai relevé.
  - `practice-demo.test.js` 120/120 : le lecteur sans pédale relâche à la vraie fin.
  - Les tests de pédale déjà écrits ne bougent pas.
- **Sur ses relevés réels**, en rejouant le son avant / après :

  | Relevé | Notes d'approche | Dissonance en moins | Autres notes |
  |---|---|---|---|
  | « L'Éternel est bon » (48 s) | 11 | 5,04 s | 144, toutes identiques (214,49 s de son, 132 prolongées par la pédale, avant comme après) |
  | idem, avec une pédale tenue tout du long | 11 | 83,12 s | 144, toutes identiques |
  | « comment harmoniser » (10 min) | 5 | 2,26 s | 620, toutes identiques |

  Aucune note d'approche ne sonne plus après le lever du doigt. Ce contrôle est gardé en test,
  sur `fixtures/eternel-est-bon.json`.
- **Scénario Playwright `pedago-grace`** sur l'application construite, avant puis après.
  - Le passage : G13, puis la ligne Ré5 Do5 Si4 La4 Fa♯4 Sol4.
  - Avant :
    - Do5 restait allumée 1,06 s avec Si4, et Fa♯4 0,46 s avec Sol4 ;
    - tout s'éteignait à la fin du passage.
  - Après :
    - Do5 s'éteint à 2,36 s, Fa♯4 à 2,96 s : 0 s avec leur note d'arrivée ;
    - l'accord, la basse, Ré5, Si4, La4 et Sol4 sonnent jusqu'à 3,46 s, comme avant.
  - Sans la pédale : identique avant / après. Chaque note s'éteint au lever du doigt (l'accord
    à 1,60 s).
- **Scénario `pedago-scrub`** (pause, curseur, mode sans pédale) :
  - son calcul de référence, pour le mode sans pédale, ignorait les vraies fins
    (`withoutPedalAt`) et réclamait l'accord encore tenu à 6,4 s ;
  - une fois mis à jour, il confirme ce que montre l'application : [Sol2 Si4] à 6,4 s,
    l'accord relâché à 5,6 s ;
  - avec la pédale, le clavier suit exactement les évènements.
- **Tous les scénarios Pédagogie IA**, en sombre et en clair : 42 passages (21 scénarios),
  sans erreur.
- **Suite complète** : 95 suites. Seuls 5 échecs anciens, dont les sorties sont identiques
  avant et après. Régressions Partie 1 et Partie 3, et build, OK.

## Limites
- Une approche lente (plus de 0,3 s, une appoggiature) n'est pas traitée : elle sonne avec la
  pédale comme avant.
- Une gamme sous la pédale : seuls ses demi-tons (Mi → Fa, Si → Do) sont nettoyés ; ses tons
  entiers se mêlent toujours, comme sous une vraie pédale.
- Avec sa vraie pédale relevée au son, la même règle s'applique. Le prof avait peut-être déjà
  changé la pédale lui-même : à écouter sur une vidéo où elle est relevée.
- En sortie MIDI vers un VST, la pédale est relevée 0,04 s. Un VST lent à étouffer peut
  laisser une légère traîne : à écouter.
