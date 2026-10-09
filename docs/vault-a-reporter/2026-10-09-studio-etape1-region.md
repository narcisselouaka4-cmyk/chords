# Studio — étape 1 : consigne, « Confirmer la région », verrou, morceaux courts (09/10/2026)

À reporter dans le vault :
- `log.md` et `state/current-work.md` ;
- `decisions/` : un morceau de 5 min au plus est séparé directement, sans étape 1 ;
- **corriger** `decisions/ADR-017-studio-overlay-css-positioning.md` (session OpenCode du
  08/10) : son correctif n'a jamais été enregistré dans le dépôt, et la vraie cause était
  autre (voir 1) ;
- `state/next-actions.md` : les vérifications sur sa machine (en bas).

Suite de `2026-10-09-studio-separation-bips.md`, la séparation ratée remplacée par des bips.
Quatre commits sur `fix/exercices-voicing-correctifs` :
`f0d2a44` (bips), `ccb0328` (consigne), `e207bbb` (« Confirmer »), `dba87fd` (verrou,
morceaux courts).

## 1. La consigne de l'étape 1 décalée d'un demi-écran (`ccb0328`)
- **Ce qu'il voyait** (capture) :
  - la moitié gauche de l'écran floutée ;
  - « Sélectionnez une zone à travailler » coupé, collé au bord gauche.
- **Cause** :
  - le bloc du skin, dans `refonte/studio.css`, posait `inset: 0` sur tout l'onglet, avec un
    voile flouté ;
  - mais il gardait le `transform: translateX(-50%)` de `style.css` ;
  - mesuré : le voile commence à x = −960 px sur un écran de 1920.
- **Correctif** :
  - la consigne est déplacée dans `.studio-player-wrap` : une petite carte centrée en haut du
    lecteur ;
  - il n'y a plus de voile : la vidéo et la waveform restent nettes. C'est ce que demande
    CLAUDE.md : un message flottant compact.
- **Vérifié** : scénario Playwright avant / après, en sombre et en clair. L'ancien build
  reproduit sa capture au pixel près.

## 2. Pas de bouton « Confirmer la région » (`e207bbb`)
- **Ce qu'il voyait** : étape 1, aucun « Confirmer », et la barre de région grisée et floue.
- **Cause** :
  - à l'ouverture d'un morceau, une région gardée comme « confirmée » était restaurée telle
    quelle, même sans pistes ;
  - c'était le cas de ses morceaux dont les anciens bips sont désormais écartés ;
  - résultat : « Confirmer » caché, et « ↩ » grisé et inactif (règle de l'étape 1 de
    `style.css`). Aucune sortie possible.
- **Correctif** : sans pistes, la région gardée est conservée mais redevient « à confirmer ».

## 3. Boutons de région actifs pendant le chargement et le traitement (`dba87fd`)
- **Sa demande** : « Pendant le traitement audio (chargement), les boutons Confirmer la région,
  Réinitialiser la région et Revenir à la timeline entière sont interactifs, ce qui n'est pas
  censé être le cas. »
- **Cause** : la barre de région (`z-index: 25`) passe au-dessus du voile de chargement
  (`z-index: 20`).
- **Correctif** :
  - `regionLocked()` = chargement ou traitement en cours ;
  - les trois boutons sont désactivés pendant ce temps, et les fonctions refusent d'agir ;
  - `updateStudioStage` remet les boutons à jour à chaque changement.

## 4. Les morceaux de 5 min au plus sont séparés directement (`dba87fd`)
- **Sa demande** : « Pour tous les fichiers de moins de 5 min, pas besoin de demander de
  sélectionner une région à travailler : que la séparation se fasse directement. »
- **Fait** (`separateShortTrackDirectly`) : à la fin du chargement, si le morceau dure 5 min
  au plus et n'a pas de pistes, la région devient le morceau entier et la séparation démarre.
- **Une seule tentative automatique par morceau et par séance** :
  - un échec ne relance pas plusieurs minutes de calcul à chaque ouverture ;
  - l'étape 1 reste, et « Confirmer la région » relance.
- CLAUDE.md §2 (étape 1) est mis à jour.

## Vérifié
- `test-studio-dom.js` : quatre nouveaux contrôles.
  - la séparation ratée n'est pas remplacée par des bips ;
  - la consigne est dans le lecteur, sans voile ;
  - une région gardée sans pistes redevient « à confirmer » ;
  - la région est verrouillée, et un morceau court est séparé directement.
- `test-studio-skin.js`, build, régressions Partie 1 et Partie 3.

## À vérifier sur sa machine
Rien n'a pu être testé ici avec un vrai morceau chargé, ni avec une vraie séparation Demucs :
l'index PyTorch est bloqué depuis l'environnement de test.
1. Un morceau de moins de 5 min : la séparation part seule, et les boutons de région sont
   grisés pendant le traitement.
2. « MARYA ADE » (4 min 27) :
   - avec la nouvelle règle, sa séparation devrait partir seule à l'ouverture ;
   - les pistes doivent être les vraies, et non des bips.
3. Un morceau de plus de 5 min : étape 1 avec la carte de consigne en haut du lecteur, et
   « Confirmer » actif dès qu'une région est tracée.

## Leçon
- Vérifier une étape d'interface **avec l'état que laisse l'étape d'avant**. Ici, une région
  restée « confirmée » sans pistes, après la séparation ratée, menait à un cul-de-sac que la
  vérification à vide ne montrait pas.
- Un `z-index` mis pour passer au-dessus d'un voile rend aussi cliquable ce qui devrait être
  bloqué.

## 5. Ajout — la lecture se place sur le marqueur lâché
- **Sa demande** : « Quand on choisit sa région, au lieu de modifier le lecteur manuellement
  pour se positionner pile sur le marqueur de sélection, ce serait mieux que l'app le fasse
  automatiquement. »
- **Fait** (`studio-tab.js`, au lâcher de la souris sur la waveform) :
  - quand on lâche le marqueur de début, ou la région déplacée en entier (Ctrl + glisser), la
    lecture se place au début de la région ;
  - quand on lâche le marqueur de fin, elle se place 3 s avant la fin
    (`END_PREVIEW_SECONDS`), pour entendre où la région s'arrête ;
  - une lecture en cours continue depuis là.
- La waveform ne se modifie plus pendant un chargement ou un traitement (`regionLocked`).
- CLAUDE.md §2 (étape 1) est complété. `test-studio-dom.js` a un contrôle de plus.
- **À vérifier sur sa machine** : tirer chaque marqueur et lâcher. Le curseur et la vidéo
  doivent aller au bon endroit.

## 6. Ajout — « Revenir au début » va au début de la région
- **Sa demande** : « Affecte aussi le bouton "Revenir au début". »
- **Avant** : ◀◀ ramenait au début de la région seulement une fois la région confirmée ; à
  l'étape 1, il ramenait au début du morceau.
- **Fait** (`studio-tab.js`) : dès qu'une région est tracée, confirmée ou non, ◀◀ ramène à son
  début ; sans région, au début du morceau.
- CLAUDE.md §2 (étape 1) est complété. `test-studio-dom.js` a un contrôle de plus.
- **À vérifier sur sa machine** : tracer une région, avancer la lecture, cliquer ◀◀ : le
  curseur et la vidéo reviennent au marqueur de début.

## 7. Waveform vide, région impossible à tracer
- **Ce qu'il voyait** (capture, « Seigneur fais-moi voir ta gloire », MP4 de 7:47) :
  - le cadre de la waveform vide, seulement le curseur de lecture et un marqueur collé à gauche ;
  - le texte « Sélectionnez une région… » : la région par défaut n'était pas dessinée.
- **Cause** :
  - la waveform était calculée **uniquement par Python** (`audio-processor.py waveform`, qui
    importe librosa), avec un délai de 15 s. Délai dépassé ou échec : `waveformData` restait vide ;
  - sans `waveformData`, la région n'était ni dessinée ni modifiable (`if (!waveformData) return`
    dans le glisser et dans `updateRegionUI`) ;
  - le repli sur le fichier original ne marchait jamais : `tryGenerate(a) || …` testait une
    promesse, toujours « vraie ».
  - Non établi : pourquoi Python a échoué ce jour-là sur sa machine (délai ou erreur). Son log
    de la console le dirait (`[Studio] waveform generation timed out or failed`).
- **Correctif** (`studio-tab.js`) :
  - les crêtes sont tirées du son **déjà décodé** pour la lecture (`peaksFromAudioBuffer`, même
    forme que le calcul Python : 400 crêtes). Instantané, sans Python. Python reste pour le M4A ;
  - le repli Python sur l'original est réparé (`await`) ;
  - la région se trace et s'affiche dès que la durée est connue, même sans waveform ;
  - un `ResizeObserver` redessine waveform, région et curseur quand le cadre change de taille
    (une waveform dessinée pendant que le cadre est caché gardait 1 px de large).
- `test-studio-dom.js` : un contrôle de plus (crêtes calculées sur un faux AudioBuffer).
- **À vérifier sur sa machine** : rouvrir ce morceau ; la waveform et la région de 5 min
  apparaissent, et les marqueurs se tirent.

## 8. « Annuler et revenir à la sélection » pendant le traitement
- **Sa demande** : « Après la sélection de la région, l'utilisateur peut vouloir se rétracter,
  mais il doit attendre la longue fin du chargement. Il faudrait, sous la barre de chargement,
  une option Annuler qui annule le chargement et revient à l'étape de la sélection de région. »
- **Fait** :
  - `index.html` : bouton `#studio-processing-cancel` sous la barre, visible seulement pendant
    le traitement d'une région (pas pendant le chargement d'un morceau, qui utilise le même voile) ;
  - `electron/main.js` : chaque Demucs en cours est suivi par morceau (`demucsRuns`) ; l'IPC
    `studio:cancel-separation` le tue. Une séparation annulée rend `{ cancelled: true }` et ne
    touche pas aux pistes d'avant. Demucs passe aussi par `trackChild` (tué à la fermeture de
    l'application) ;
  - `preload.{cjs,js}`, `stem-separator.js` : `cancelSeparation(trackId)` ;
  - `studio-tab.js` (`cancelRegionProcessing`) : retour à l'étape 1, région gardée et « à
    confirmer » (aussi dans les métadonnées, sinon la réouverture la restaurerait confirmée),
    lecture placée au début de la région. Annulé pendant le découpage : la région n'est pas
    enregistrée comme confirmée.
- Un morceau de 5 min au plus annulé ne relance pas sa séparation automatique pendant la séance.
- `test-studio-dom.js` : un contrôle de plus ; capture du voile en sombre et en clair.
- **À vérifier sur sa machine** : confirmer une région, cliquer « Annuler » pendant la
  séparation → retour à l'étape 1 tout de suite, et plus de processus Python de Demucs actif
  (moniteur système).
