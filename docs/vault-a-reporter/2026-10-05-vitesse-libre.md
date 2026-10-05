# Pédagogie IA — vitesse libre, de 0,25× à 2× (exemples du Copilote et vidéo) (05/10/2026)

À reporter dans le vault :
- `state/current-work.md` et `log.md` ;
- `decisions/` : un seul réglage de vitesse pour les deux lecteurs (`speed-menu`). La vitesse
  de la vidéo reste gardée pendant la séance seulement ;
- `state/next-actions.md` :
  - lui demander s'il veut que la vitesse de la vidéo soit retenue d'un lancement à l'autre ;
  - la tâche proposée sur Échap et les raccourcis (voir Limites).

## Demande de Narcisse
- « Modifier manuellement la vitesse de copilote quand il veut faire une démonstration… Là,
  ce sont des vitesses qui nous sont imposées en ×1, ×0,75 ou 0,5. Moi je veux vouloir imposer
  une vitesse, mais avec une plus large plage de choix. »
- Ses choix :
  - **les deux lecteurs** : les exemples du Copilote et la vidéo du tuto ;
  - de **0,25× à 2× par pas de 0,05** ;
  - la forme **« menu + curseur »**.

## Avant
- Les exemples du Copilote : une liste 0,5× · 0,75× · 1× · 1,25× (retenue d'un exemple à
  l'autre).
- La vidéo : un sélecteur segmenté 0,5× | 0,75× | 1× (gardé d'un tuto à l'autre pendant la
  séance).

## Fait
### Un réglage commun : `src/ui/components/speed-menu.{js,css}`
Il suit le modèle de `loader-chroma` : JS et CSS dans `ui/components/`, feuille liée dans
`index.html`, jetons `--tr-*` en sombre et en clair.
- **Le bouton** « 0,75× ▾ » dit la vitesse (nom accessible : « Vitesse de l'exemple : 0,75× »).
- **Son panneau** :
  - le nom et la vitesse en grand ;
  - les vitesses courantes 0,5× 0,75× 1× 1,25× 1,5× ;
  - un curseur fin de 0,25× à 2× (pas de 0,05) entre − et + ;
  - l'échelle 0,25× · 1× · 2×, le 1× à sa vraie place ;
  - une ligne de rappel.
- **Comportement** :
  - chaque changement s'entend tout de suite, et le panneau reste ouvert pour affiner ;
  - − et + se grisent aux bornes ;
  - à l'ouverture, le focus va au curseur : les flèches marchent tout de suite.
- **Placement** :
  - c'est un `popover` : posé au-dessus de tout, jamais coupé par le défilement de la
    conversation ;
  - un clic dehors le ferme, et le bouton le ferme aussi ;
  - il se place sous le bouton (au-dessus s'il manque de place), entier dans la fenêtre ;
  - il se ferme si la page défile ou si la fenêtre change de taille.
- **Échap** est géré par le panneau lui-même. Raison : `refonte/astra-shell.js` annule Échap
  sur toute la page (voir Limites).
- Partie pure, testée sous Node :
  - `clampSpeed` borne, arrondit au pas et lit « 0,75 » comme « 0.75 » ;
  - une valeur fausse donne 1× ;
  - `speedLabel` écrit « 0,25× », « 1,05× » (jamais « 1,0500000001× »).

### Les exemples du Copilote (`src/pedagogie/copilot-tab.js`)
- La liste est remplacée par le menu, après « Vitesse », sur la ligne des réglages de la barre
  de lecture. Le rappel : « Retenue pour les exemples suivants. »
- Le choix est retenu (`copilot-example-rate`). Un ancien choix (0,5 / 0,75 / 1 / 1,25) reste
  valable.
- Le lecteur et `main.js` ne changent pas : ils acceptaient déjà 0,25× à 2×, sans coupure.
- `EXAMPLE_RATES` et `rateLabel` sont retirés.
- **Consigne 8** du Copilote : « (« Vitesse » : de 0,25× à 2×, par pas de 0,05) ».

### La vidéo (`src/ui/pedagogie-tab.js`)
- Le même menu, sous la vidéo, après « Vitesse ». Le rappel : « La hauteur du son ne change
  pas. Gardée d'un tuto à l'autre, jusqu'à la fermeture. »
- Il est construit une seule fois : le reconstruire à chaque changement fermerait le panneau
  pendant qu'on tire le curseur.
- `preservesPitch`, `defaultPlaybackRate` et `playbackRate` ne changent pas.

### Nettoyage
Les règles devenues inutiles sont retirées : `.copilot-transport-rate` (la liste) dans
`astra-bridge.css` et `.pedago-segmented` dans `astra-pedagogie.css`.

## Vérifié
- **Tests** :
  - `test-speed-menu.js` 10/10 (nouveau) ;
  - `test-pedagogie-dom.js` 177/177 : sections 11, 20 et 23 réécrites, et 3 contrôles du
    composant (feuille liée, popover, Échap, curseur, nom accessible) ;
  - `test-copilot-tab.js` 37/37 ;
  - `test-copilot-client.js` 231/231.
- **Scénario `pedago-rate`** (exemples du Copilote) :
  - le panneau s'ouvre avec 1× actif ;
  - le curseur à 0,35× donne un tempo mesuré de 0,35×, sans saut de position ;
  - « + » donne 0,4× ;
  - 1,5× donne 1,58× mesuré ;
  - ← au clavier donne 1,45× ;
  - Échap ferme et rend le focus au bouton ; un clic dehors ferme ;
  - en pause, changer la vitesse garde la pause, et la reprise se fait à 0,79× (0,75×) ;
  - arrêté puis rejoué, l'exemple repart à 0,6× (0,63× mesuré) ;
  - le choix est retenu après relance ;
  - à 1600, 1280 et 1024 px : rien ne sort de la carte, le panneau est entier dans la fenêtre.
- **Scénario `pedago-tools`** (vidéo) :
  - à 0,25×, la vidéo avance à 0,25× ; à 2×, à 2× ;
  - `preservesPitch` est gardé ;
  - le son n'est pas coupé : une tonalité de test captée donne le même niveau à 1×, 0,25×
    et 2× (0,259) ;
  - l'autre tuto s'ouvre à 2× : la vitesse est gardée ;
  - Boucler, la frise et l'envoi vers Exercices ne changent pas.
- **Scénario `pedago-fenetre`** :
  - la carte sous la vidéo mesure 217 px à 1600 px (219 avant) et 224 px à 1280 px (226 avant),
    avec le panneau ouvert ou non ;
  - rien ne déborde ;
  - le panneau ouvert (177 px) est entier dans la fenêtre.
- **Tous les scénarios Pédagogie IA**, en sombre et en clair : 42 passages (21 scénarios,
  dont `pedago-grace`), sans erreur.
  - Les trois scénarios de la vitesse ont été repassés sur la version finale, après le
    nettoyage des écouteurs quand le panneau est retiré de la page.
- **Suite complète** : 95 suites. Seuls 5 échecs anciens, dont les sorties sont identiques
  avant et après. Régressions Partie 1 et Partie 3, et build, OK.

## Limites
- La vitesse de la vidéo n'est pas retenue d'un lancement à l'autre (comme avant) : à lui
  demander.
- Le son à 0,25× a été vérifié sur le Chromium des tests (141). Electron 32 embarque
  Chromium 128 : à écouter sur sa machine.
- **Bug trouvé en chemin, hors de cette demande** (tâche proposée à part) :
  - `#ai-settings-modal` est caché par `style="display:none"` et non par `hidden` ;
  - `astra-shell.js` le compte donc comme une fenêtre ouverte, et annule Échap partout ;
  - pour la même raison, les raccourcis B, M et C (tiroirs) ne marchent jamais.
