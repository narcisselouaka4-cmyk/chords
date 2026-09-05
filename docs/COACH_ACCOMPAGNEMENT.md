# Coach d'accompagnement au chant — notes d'implémentation

> Chantier ouvert le 05/09/2026. Ce document est tenu **en cours de travail**,
> pas rédigé à la fin : il doit permettre de reprendre le chantier en l'état.

## 1. L'idée

Prendre un morceau dont on a séparé les pistes pour ne garder que la voix,
annoncer un style, compter 3-2-1, et accompagner au piano pendant que la voix
seule joue. Ensuite, comparer ce qui a été joué à ce qui a été chanté.

Le reproche que Narcisse se fait — « j'en fais trop : soit trop de mouvements,
soit trop de licks, et ça gêne l'accompagnement ; un bon pianiste accompagnateur
laisse vraiment la voix mise en avant et rebondit uniquement sur les moments de
vide » — n'est **pas un problème d'harmonie**. C'est un problème de densité et
de placement dans le temps. C'est ce qui rend le chantier faisable : il se
mesure en superposant deux courbes d'activité, sans jamais nommer un accord.
Aucune détection d'accord n'intervient, donc rien ne peut se tromper sur une
étiquette.

## 2. Les quatre couches, et ce qui est réellement construit

| Couche | Sujet | État |
|---|---|---|
| 1 | **L'espace** — recouvrement, remplissage des vides, densité par phrase | **Construite** |
| 2 | **Le registre** — le piano empiète-t-il sur la tessiture chantée ? | **Construite**, confiance basse assumée |
| 3 | Le soutien harmonique | **Délibérément différée** — voir §6 |
| 4 | La conformité au style | Hors périmètre (chantier séparé) |

## 3. Modules

Tous purs : ni DOM, ni Web Audio, ni IPC. Testables en Node.

| Fichier | Rôle |
|---|---|
| `src/coach/vocal-activity.js` | Enveloppe d'énergie du stem vocal → phrases chantées et respirations. Refus explicite d'un stem inexploitable. |
| `src/coach/accompaniment-metrics.js` | Couches 1 et 2. Alignement des notes MIDI sur la base de temps du stem. |
| `src/coach/coach-report.js` | Rapport en trois parties. Porte la discipline de calibration (§5). |
| `src/coach/latency-probe.js` | Estimation puis mesure réelle du décalage MIDI/audio. |
| `src/coach/test-coach-engine.js` | Suite de tests du moteur (`node src/coach/test-coach-engine.js`). |

## 4. Décisions techniques tranchées, et pourquoi

### 4.1 Pas de beat-tracking — découpage en phrases par les respirations

Le prompt de relais affirmait qu'aucun beat-tracker n'existait dans le projet.
**C'est faux** : `electron/audio-processor.py` en contient un
(`_beat_track`, librosa, lignes ~477 et ~3638), utilisé par l'analyse
harmonique pour agréger les accords en mesures. Il n'est en revanche pas
branché sur le Studio, et il suppose un tempo stable — hypothèse fragile sur une
voix seule, souvent rubato.

**Décision : ne pas s'en servir.** Les limites de phrases viennent des
respirations, sur le principe de `src/analyzer/segmenter.js` (qui découpe par
les silences) mais appliqué à l'enveloppe d'énergie du stem vocal. C'est
exactement le signal déjà mesuré par le taux de remplissage des vides : aucun
nouveau signal n'est introduit.

### 4.2 Seuil d'énergie dérivé du signal, jamais fixé en dB

Un stem Demucs n'a ni niveau ni plancher de bruit normalisés d'un morceau à
l'autre. Le plancher est donc estimé par un bas percentile, et le niveau chanté
par une **séparation en deux classes** (médiane des trames au-dessus du milieu
de la dynamique) — et non par un haut percentile de toutes les trames, qui
s'effondre quand la voix n'occupe que quelques pour cent de la région (longue
intro instrumentale). Ce point a été trouvé par le test T14, pas anticipé.

Une hystérésis (entrée/sortie à deux seuils distincts) évite de hacher une tenue
qui module.

### 4.3 `minGapSec = 0,35 s` — le seul paramètre musical

C'est la durée au-delà de laquelle un silence vocal cesse d'être une
articulation entre deux mots et devient une vraie respiration, c'est-à-dire une
place laissée au piano. 0,35 s correspond à une respiration chantée courte.
**C'est un défaut technique explicite, pas un seuil de jugement** : il est
exposé dans l'UI (réglable) pour être ajusté sur du matériel réel.

### 4.4 Latence MIDI/audio — mesurée, pas devinée

Deux niveaux, du plus faible au plus fort :

1. **Estimation automatique** — `AudioContext.baseLatency + outputLatency`.
   Disponible sans rien demander, mais ne couvre que la sortie audio.
2. **Mesure réelle** — une série de clics est jouée par le *même* graphe audio
   que le stem, l'utilisateur tape dessus au clavier MIDI, et on compare
   l'horodatage MIDI à l'instant où chaque clic a réellement atteint la sortie
   (pont `AudioContext.getOutputTimestamp()`). Mesure de bout en bout : sortie
   audio + entrée MIDI + biais personnel du joueur.

Convention de signe tenue partout : un écart **positif** = la frappe arrive
**après** le clic entendu ; la correction appliquée aux notes est son opposé.

**Aucun chiffre n'est écrit en dur dans le code.** La valeur ne peut être
obtenue qu'en faisant tourner la calibration sur le poste, avec le clavier
branché — ce qui n'a pas pu être fait dans cette session (pas de matériel
accessible). Tant que la calibration n'a pas tourné, l'app utilise l'estimation
automatique et **le dit dans l'interface**.

### 4.5 Stem vocal inexploitable — refus explicite

Conformément au garde-fou transverse du projet (« ne jamais afficher une
information que l'app ne peut pas garantir »), trois motifs de refus distincts,
chacun avec un message affichable : `FlatStem` (morceau instrumental ou
séparation ratée), `TooFewPhrases`, `MostlySilent`. Pas d'écran vide, pas de
rapport silencieusement faux.

### 4.6 Le MIDI ne dit pas quelle main joue

La couche 2 ne peut donc pas mesurer « la main droite empiète ». Ce qui est
mesuré à la place, et qui est vérifiable : la part des notes jouées qui tombe
**dans la tessiture chantée**, et la part du temps simultané où une note se
trouve à moins d'une tierce mineure de la note chantée. L'absence d'attribution
de main est portée dans les données (`handAttribution: false`) et dite dans
l'interface.

## 5. La discipline du rapport — le point le plus important

Le rapport **ne note pas, il montre**. Pas de score global. Chaque observation
repose sur l'une de trois bases, et sur aucune autre :

- **`fact`** — un comptage vrai par construction.
  *« 3 respirations sur 12 sont restées sans réponse. »*
- **`ranking`** — un classement relatif, sans seuil absolu.
  *« Vos trois phrases les plus couvertes sont les n° 4, 7 et 2. »*
- **`direction`** — une comparaison dont le **sens** souhaité vient de
  l'objectif que Narcisse a lui-même énoncé. Le sens est jugé, **jamais
  l'ampleur**.

Un test (`T37`) vérifie mécaniquement qu'aucune observation ne sort de ces trois
bases et qu'aucune ne se déclare calibrée.

### Question de goût NON tranchée, et assumée comme telle

**À partir de quel taux de recouvrement doit-on dire « tu joues trop » ?**
Ce seuil ne peut venir que de la comparaison de plusieurs séances réelles de
Narcisse avec son propre ressenti. Il n'a pas été inventé. `calibration.calibrated`
vaut `false` et l'interface affiche la raison.

## 6. Couche 3 — pourquoi elle est absente

Le soutien harmonique supposerait de faire confiance à `melody_extractor.py`
pour affirmer un jugement fin de justesse. Son **F1 mesuré sur du réel est de
0,484** (EXP-027) : une note sur deux est fausse. L'implémenter reproduirait
l'erreur déjà corrigée sur Masterclass. Elle est donc absente, pas même
partiellement.

La couche 2 utilise le même extracteur, mais **uniquement en agrégat** (bornes
de tessiture, proportions de temps), jamais note à note, et tout ce qu'elle
produit porte `confidence: 'low'` avec le rappel du F1 réel jusque dans
l'affichage.

## 7. Frontière avec Sessions MIDI

Deux flux séparés, sans pont de données (décision du 03/09, non rouverte).
Sessions MIDI est du jeu libre sans voix de référence ; le Coach compare
toujours le jeu à une courbe d'activité vocale qui n'existe pas dans une session
MIDI classique. Le bouton « Analyser cette session » de Sessions MIDI garde son
comportement actuel.

## 8. L'écran

### 8.1 Une destination de sous-navigation, pas un panneau compagnon

Le menu ☰ d'Entraînement n'existe plus (abandonné le 02/09). Le Coach est une
**pilule de la sous-navigation**, exactement comme Sessions MIDI :

- `src/index.html` : la pilule perd `is-placeholder`/`disabled` et gagne
  `data-view="coach"` ; une vue sœur `#practice-view-coach` est ajoutée sur le
  patron de `#practice-view-midi-sessions`, cachée par défaut.
- `src/main.js` : `applyView()` ne connaissait que `midiView` en dur. Elle
  s'appuie désormais sur une **table `{ vue → élément }**, ce qui la rend
  extensible sans la dupliquer. « realtime » et « exercise » n'y figurent pas :
  elles partagent `.training-workspace` et se distinguent par
  `data-training-view`, que `practice.css` interprète — comportement inchangé.

### 8.2 Discipline visuelle

Aucune couleur nouvelle : tout dérive des variables `--r-*` existantes. Le
sélecteur de style réutilise le vocabulaire `.segmented` déjà en place (mêmes
déclarations que dans `analyse.css`, re-portées dans `practice.css` parce que
ce fichier-là est scopé à `#analysis-tab`). Différenciation des deux skins
conforme à la table du projet : Global = anguleux, aplats, filet d'accent en
bordure ; v2 = arrondis, pilules, dégradés.

Le clavier virtuel MIDI existant n'est pas touché — un test le vérifie.

### 8.3 Séance enregistrée pour la réécoute

Question tranchée : **oui**. À l'arrêt, la capture est convertie en
**MelodyTrack canonique** (`createMelodyTrack`, le pont d'EXP-030). La piste
reçoit pour origine l'instant de départ du stem **corrigé de la latence**, si
bien que les temps de ses événements sont directement ceux du stem : la même
piste sert de trace de la séance ET de source pour la réécoute, sans seconde
conversion qui pourrait diverger. Deux tests (T51, T52) verrouillent cette
égalité — si elle casse, le rapport et la réécoute ne parlent plus du même
instant.

La réécoute rejoue **la voix ET ce qui a été joué par-dessus**. Réécouter la
voix seule ne dirait rien : c'est la superposition qui montre si le piano a
couvert la phrase ou habité la respiration. Les deux sont planifiés dans le
même AudioContext, à l'échantillon près — d'où le choix de synthétiser la voix
de piano localement plutôt que d'appeler `simple-synth.js`, qui possède son
propre AudioContext et joue à l'instant de l'appel, sans planification : les
deux horloges dériveraient et la réécoute perdrait exactement ce qu'elle doit
montrer.

**Limite assumée** : la séance vit en mémoire pour la durée de la session
applicative ; elle n'est pas persistée sur disque et ne survit donc pas à un
redémarrage. La structure produite étant déjà canonique et validée
(`validateMelodyTrack`), l'y ajouter plus tard ne demandera pas de retoucher la
mesure.

### 8.4 Ce qui n'a pas pu être vérifié dans cette session

Vérifié réellement, dans un navigateur, sur le serveur de développement :
bascule de vue (la vue s'affiche, l'espace de travail et Sessions MIDI se
masquent, la pilule devient active), rendu du sélecteur de style, état vide de
la liste de morceaux, bouton de démarrage désactivé sans morceau, styles
calculés des cartes de rapport **dans les deux skins**, et absence d'erreur
console imputable au module.

**Non vérifié faute de matériel accessible** : le déroulé complet d'une séance
(il faut Electron, un clavier MIDI branché et un stem séparé par Demucs), et
donc la valeur réelle de la latence sur ce poste. Les captures d'écran n'étaient
pas disponibles non plus — la vérification visuelle s'est faite par styles
calculés, pas à l'œil.

## 9. État d'avancement

- [x] Moteur couches 1 et 2 + rapport + sonde de latence
- [x] Suite de tests moteur (53 tests)
- [x] Écran, branchement dans la sous-navigation, deux skins
- [x] Test de contrat DOM (30 contrôles)
- [x] Séance conservée en MelodyTrack + réécoute des passages cités
- [ ] Calibration de la latence à faire tourner sur le poste, avec le clavier
- [ ] Seuils de jugement à calibrer sur des séances réelles (§5)
- [ ] Persistance des séances sur disque (facultatif)
