# Studio — étapes 1 et 2 : région, waveform, annulation ; lecture fluide en étape 3 (09/10/2026)

À reporter dans le vault :
- `log.md` : une entrée par section ci-dessous (1 à 10) ;
- `state/current-work.md` : Studio — étape 1 et lecture de l'étape 3 retravaillées, en attente
  de ses essais sur sa machine ;
- `state/next-actions.md` : la liste « À vérifier sur sa machine » (consolidée en bas) ;
- `decisions/` :
  - un morceau de 5 min au plus est séparé directement, sans étape 1 (§4) ;
  - la waveform est tirée du son décodé, Python seulement en repli (§7) ;
  - **l'architecture audio de l'étape 3** : voir la note dédiée
    `2026-10-09-studio-lecture-fluide.md` (ADR à créer) ;
- **corriger** `decisions/ADR-017-studio-overlay-css-positioning.md` (session OpenCode du
  08/10) : son correctif n'a jamais été enregistré dans le dépôt, et la vraie cause était
  autre (voir 1) ;
- `contracts/` (si un contrat Studio existe) : les nouvelles règles de CLAUDE.md §2, §4 et §5.

Suite de `2026-10-09-studio-separation-bips.md`, la séparation ratée remplacée par des bips.
Commits sur `fix/exercices-voicing-correctifs`, dans l'ordre :

| Commit | Section | Sujet |
|---|---|---|
| `f0d2a44` | (note bips) | séparation ratée : plus de bips à la place des pistes |
| `ccb0328` | 1 | consigne de l'étape 1 en carte dans le lecteur |
| `e207bbb` | 2 | « Confirmer la région » revient pour une région gardée sans pistes |
| `dba87fd` | 3, 4 | boutons de région verrouillés ; ≤ 5 min séparé directement |
| `48a27e3` | 5 | la lecture se place sur le marqueur lâché |
| `fc444a0` | 6 | « Revenir au début » ramène au début de la région |
| `036ef51` | 7 | waveform tirée du son décodé ; région traçable sans waveform |
| `de016ff` | 8 | « Annuler et revenir à la sélection » pendant le traitement |
| `326dd52` | 9 | double-clic, trait de lecture, flèche du début ; un seul SoundTouch |
| `c0c2d0a` | 10 | micro-latences lors des changements brusques |

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

## Vérifié (§1 à §4)
- `test-studio-dom.js` : quatre nouveaux contrôles.
  - la séparation ratée n'est pas remplacée par des bips ;
  - la consigne est dans le lecteur, sans voile ;
  - une région gardée sans pistes redevient « à confirmer » ;
  - la région est verrouillée, et un morceau court est séparé directement.
- `test-studio-skin.js`, build, régressions Partie 1 et Partie 3.

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

## 9. Waveform : double-clic, trait de lecture, poignée du début ; lecture fluide en étape 3
**Ses demandes** : 1) le double-clic sur la waveform réinitialise la région, « cela ne doit pas
arriver » ; 2) le trait de lecture blanc est quasi invisible en thème clair ; 3) les marqueurs
sont durs à attraper, surtout au tout début : une mini-flèche au-dessus de la waveform ;
4) après la séparation, « micro-latences par-ci, par-là » (vidéo, voix, audio).

- **1** : le gestionnaire `dblclick` est retiré ; ↺ reste le seul moyen de réinitialiser.
- **2** : le trait prend `var(--r-text)` (presque blanc en sombre, presque noir en clair), 2 px,
  pleine opacité, liseré de la couleur de fond (avant : `#fff` à 0,8 dans les deux skins).
- **3** : `#studio-handle-rail` + `#studio-handle-grip-start` (flèche ▼, zone de prise 28 × 16 px)
  entre la vidéo et la waveform ; elle suit le début de la région (gardée entière au bord gauche)
  et se cache une fois la région confirmée. Zone de prise des marqueurs dans la waveform : 12 px.
- **4 — cause mesurée** :
  - le mixeur mettait **un SoundTouch par piste** (5 AudioWorklets), même à transposition 0 ;
  - simulation du processeur hors navigateur : pire bloc ≈ 0,68 ms par nœud ; les 5 pistes
    démarrent ensemble, leurs pics tombent au même bloc ≈ 3,4 ms pour un budget de 2,9 ms
    (128 échantillons à 44,1 kHz) → le rendu audio décroche. Sur sa machine, plus lente, pire ;
  - SoundTouch retarde le son de 128 à 142 ms : la vidéo, calée sur l'horloge, passait devant ;
  - la vidéo était recalée à chaque image tant qu'elle était en pause/en saut → sauts en rafale ;
  - `play()` relançait toutes les pistes une deuxième fois quand une transposition était active.
- **Correctif** :
  - `stem-mixer.js` : pistes → volumes → bus → (SoundTouch unique si transposition ≠ 0, sinon
    sortie directe). Horloge corrigée de `PITCH_SHIFTER_LATENCY` (0,135 s) quand SoundTouch est
    branché. Départ des 5 pistes à la même heure audio (+10 ms) ;
  - `studio-tab.js` : recalage vidéo seulement si dérive > 0,12 s, jamais pendant `seeking`, au
    plus toutes les 0,8 s ; vidéo arrêtée pendant la lecture → relancée ; transposition posée
    avant `mixer.play()`.
- **Vérifié** dans Chromium (page de test, 5 pistes synthétiques) : 441 Hz à 0, 877 Hz à +12 en
  cours de lecture, retour à 441 Hz, mute OK, horloge qui avance. Captures du trait et de la
  flèche en sombre et en clair. `test-studio-dom.js` : un contrôle de plus.
- **Non vérifiable ici** : la fluidité ressentie sur sa machine avec de vraies pistes Demucs.
- **À vérifier sur sa machine** : étape 3, lecture longue à 0 puis à +2 : plus de hachures,
  image et voix en phase ; thème clair : trait visible ; tirer la flèche ▼ au tout début.

## 10. Micro-latences lors des changements brusques (transposer et déplacer la lecture en pleine musique)
- **Ses indications** : les micro-latences arrivent surtout quand il transpose ET déplace le
  lecteur en pleine lecture ; pause puis lecture remet tout d'aplomb ; parfois la vidéo « bugue »
  puis accélère un instant pour rattraper, et ralentit. Son hypothèse : le processeur.
- **Causes trouvées** (en plus du §9) :
  1. **Restes de SoundTouch** : `clear()` appelé par notre code n'existe pas dans
     @soundtouchjs/audio-worklet 2.x (aucun message de vidage non plus). Après un saut ou une
     transposition, l'ancien nœud rejouait ~0,13 s de l'ancienne position, avec un retard
     variable ; l'horloge supposait 0,135 s → l'image se recalait (« accélère puis ralentit »).
     Pause + Play « réparait » car le tampon avait eu le temps de se vider.
  2. **Chaque transposition relançait toutes les pistes** (`setDetune` → `play()`), alors que
     SoundTouch change de hauteur en direct (tempo verrouillé à 1).
  3. **Glisser la barre de lecture** déclenchait un saut à chaque évènement `input` (des dizaines
     par seconde) : relance des 5 pistes + saut vidéo à chaque fois.
  4. Volume remonté après chaque relance par un `setTimeout(30 ms)`, qui glisse sous charge ;
     `getBoundingClientRect()` à chaque image (recalcul de mise en page de toute la fenêtre).
- **Correctif** :
  - `pitch-shifter.js` : `createPitchShifterNow()` (synchrone, processeur déjà enregistré) ;
  - `stem-mixer.js` : SoundTouch reste branché une fois la première transposition faite →
    `setPitch()` seul ensuite ; SoundTouch neuf à chaque relance (`freshShifter`) ; volume
    remonté par automation sur l'horloge audio ; `getWarmupRemaining()` ;
  - `studio-tab.js` : la vidéo attend, sur la bonne image, que le son relancé soit audible ;
    barre de lecture : affichage seul pendant le glisser, un seul saut au lâcher ; largeur de la
    waveform tenue par le ResizeObserver.
- **Vérifié dans Chromium** (5 pistes synthétiques, note qui change à 5 s) : 441 → 877 Hz (+12,
  démarrage 0,145 s) → 587 Hz (+5 en direct : aucune relance, horloge continue) → saut à 6 s :
  silence net à 60 ms (aucun reste de l'ancien son) puis 883 Hz → retour à 0 : 662 Hz en < 0,3 s.
  Piège de mesure : un AnalyserNode lisse entre deux lectures (`smoothingTimeConstant` 0,8), ce
  qui avait fait croire à un retard de 0,6 s ; mesurer avec un lissage à 0.
- **Le processeur** : il joue (décodage vidéo + SoundTouch sur sa machine), mais les causes
  ci-dessus produisaient les symptômes même sur une machine rapide.
- **À vérifier sur sa machine** : en pleine lecture, transposer plusieurs fois de suite, puis
  glisser la barre et lâcher : pas de hachure, pas d'image qui accélère.

## À vérifier sur sa machine (liste consolidée, §1 à §10)
Rien n'a pu être essayé ici avec un vrai morceau chargé ni une vraie séparation Demucs (index
PyTorch bloqué depuis l'environnement de test) ; tout le reste a été vérifié par tests, build,
régressions, captures et, pour l'audio, dans Chromium avec des pistes de synthèse.
1. Morceau de 5 min au plus : séparation lancée seule, boutons de région grisés pendant le
   traitement, vraies pistes (pas de bips) — par exemple « MARYA ADE » (4 min 27).
2. Morceau de plus de 5 min (« Seigneur fais-moi voir ta gloire », 7 min 47) : waveform et
   région de 5 min visibles ; carte de consigne en haut du lecteur ; « Confirmer » actif.
3. Tirer la flèche ▼ (début) et le marqueur de fin : la lecture se place au début, ou 3 s
   avant la fin ; ◀◀ ramène au début de la région ; le double-clic ne réinitialise plus rien.
4. Thème clair : le trait de lecture se voit.
5. Confirmer, puis « Annuler et revenir à la sélection » : retour immédiat à l'étape 1, plus de
   processus Demucs dans le moniteur système.
6. Étape 3 : lecture longue à 0 puis à +2 ; en pleine lecture, transposer plusieurs fois de
   suite, puis glisser la barre et lâcher : pas de hachure, image et voix en phase, pas
   d'image qui « accélère puis ralentit ».

## Leçons de la journée
- Vérifier une étape d'interface avec l'état que laisse l'étape d'avant (§2).
- Un `z-index` mis pour passer au-dessus d'un voile rend aussi cliquable ce qui devrait être
  bloqué (§3).
- Un repli silencieux cache la panne (bips, §bips ; waveform vide sans message, §7).
- Pour un symptôme « ça hache » en audio temps réel, mesurer le coût **du pire bloc**, pas la
  moyenne : 5 × 0,68 ms tombaient au même bloc (§9).
- Ne pas supposer qu'une méthode d'une bibliothèque existe : `clear()` de SoundTouch était
  appelé depuis des mois sans exister (§10).
- Un AnalyserNode lisse entre deux lectures : mesurer avec `smoothingTimeConstant = 0` (§10).
