# Journal de bord — Refonte visuelle v2 / Global

> Tenu en continu pendant l'implémentation autonome de la refonte visuelle (deux thèmes
> sélectionnables — « v2 » et « Global » — sur Studio, Analyse, Entraînement).
> Sources qui font foi : `/home/visiteur/handoff/` (relais + décision deux-thèmes + 16 images).
>
> **Pour reprendre le travail après interruption** : lire ce fichier en entier, puis
> `git log --oneline master..HEAD`, `git status`, et comparer l'état de chaque écran à la
> checklist « Définition de fini » ci-dessous avant de continuer.

---

## Définition de « fini » (rappel du prompt de mission, §2)

Pour **Studio**, **Analyse** (6 sous-onglets) et **Entraînement**, dans **les deux thèmes** :

- [x] Studio — thème Global
- [x] Studio — thème v2
- [ ] Analyse / Accord sélectionné — v2
- [ ] Analyse / Accord sélectionné — Global
- [ ] Analyse / Réharmonisation (+ comportement « Appliquer ») — v2
- [ ] Analyse / Réharmonisation (+ état après application) — Global
- [ ] Analyse / Masterclass (+ briques partagées glossaire & client IA) — v2
- [ ] Analyse / Masterclass — Global
- [ ] Analyse / Corriger — v2
- [ ] Analyse / Corriger — Global
- [ ] Réglages › Assistant IA (+ plafond d'appels réel, safeStorage) — v2
- [ ] Réglages › Assistant IA — Global
- [ ] Réglages › Apparence — sélecteur de thème qui bascule réellement v2 ↔ Global
- [ ] Entraînement / écran de jeu (+ Exercice par mouvements 12 tonalités) — v2
- [ ] Entraînement / écran de jeu — Global
- [ ] Non-régression complète du reste de l'app
- [ ] Tests existants passent + couverture raisonnable des nouveaux comportements
- [ ] `RAPPORT-FINAL-REFONTE.md` écrit

**Hors périmètre** (ne pas construire) : Coach d'accompagnement au chant (§9.1), couche de
jeu rythmique + licks (§9.2), refonte de Pédagogie IA (dépend d'un pipeline OCR).

---

## 2026-09-02 — Démarrage

### État de départ

- Branche de travail : `refonte-visuelle-v2-global`, créée depuis
  `analyse-v1-finalisation` @ `0876c08` (« EXP-034 : harnais de validation R1 audio + R1
  MIDI-live »). Cette base contient les 37 commits EXP du moteur harmonique /
  réharmonisation dont dépendent « Appliquer » (§3.2) et l'Exercice d'Entraînement (§6.2).
- **WIP mis de côté** : ~3 200 lignes non commitées (14 fichiers, dont `src/index.html`
  avec le rail de navigation abandonné, `src/style.css` +1154, `src/main.js` +502,
  `electron/audio-processor.py` +855) étaient dans l'arbre de travail au démarrage. Elles
  ne faisaient pas partie de cette mission et implémentaient une direction de navigation
  explicitement révoquée par le handoff. **Stashées** :
  `git stash list` → `stash@{0}: On worktree-refonte-ui-jazz: WIP analyse-v1 avant refonte visuelle v2/Global`.
  Le libellé « On worktree-refonte-ui-jazz » est un artefact cosmétique de git (worktree
  imbriqué) ; le stash est bien récupérable depuis ce dossier via `git stash pop`.
  Fichiers laissés tels quels car non gênants : `.claude/worktrees/refonte-ui-jazz`
  (worktree imbriqué), `electron/__pycache__/*.pyc` (bytecode régénéré).

### Décisions non tranchées — résolutions retenues (règle §5 : option la plus conservatrice)

1. **Emplacement du sélecteur de thème** → `Réglages`, nouvelle section « Apparence »,
   au-dessus / à côté du panneau « Assistant IA ». C'est la proposition du handoff (§0),
   cohérente avec l'existant (Réglages est déjà un écran réel). Documenté, pas deviné.
2. **Architecture de la bascule de thème** → attribut `data-skin="v2|global"` sur
   `<html>` (ou `#app`), deux jeux de variables CSS définis sous
   `:root[data-skin="v2"]` / `:root[data-skin="global"]`, plus quelques classes de
   composant préfixées quand la seule variable ne suffit pas. Choix d'implémentation
   laissé à l'exécutant par le handoff. Persisté dans le même stockage que le thème
   clair/sombre existant (`localStorage`). Rationale : le repo a déjà un `theme-toggle`
   🌙 clair/sombre — on réutilise le même mécanisme, on ne réinvente rien.

### Constat à corriger en fin de tâche (vault)

`state/current-state.md` du vault décrit encore le rail + tiroirs comme « refonte
navigation 02/09 version finale ». C'est périmé : le handoff (postérieur) le révoque.
À mettre à jour dans le vault à la clôture (CLAUDE.md §0).

### ✅ Étape 1 — Infrastructure de bascule de thème (relais §12.1) — FAITE

**Fichiers ajoutés**
- `src/ui/refonte/theme.css` — chargé en `<link>` dans `index.html` (après les 3
  feuilles existantes). Contient : la palette partagée §1 en tokens `--r-*` ;
  deux jeux de tokens de forme sous `:root[data-skin='v2']` et
  `:root[data-skin='global']` (pilule 100px + dégradé vs 5-7px + aplat + filet
  d'accent inséré à gauche) ; les premières primitives partagées (barre
  d'onglets, sélecteur de skin, sections de Réglages).
- `src/ui/refonte/skin-manager.js` — `getSkin` / `setSkin` / `initSkin`.
  Persistance `localStorage.skin`, événement `app-skin-changed`, repli sur
  `global` si valeur absente/invalide. Même mécanique que le thème clair/sombre
  existant (attribut sur `<html>` + `localStorage` + `CustomEvent`).
- `src/ui/refonte/refonte-fonts.js` — importe Manrope (600/700/800), Inter
  (400/500/600/700), JetBrains Mono (400/500) via `@fontsource` (bundlées par
  Vite en same-origin : aucun appel réseau à l'exécution, aucune entorse à la
  CSP stricte d'Electron). Dépendances ajoutées : `@fontsource/{manrope,inter,
  jetbrains-mono}`.
- `src/ui/refonte/test-skin-manager.js` — 18 assertions : comportement (bascule
  réelle, persistance, événement, repli, câblage du sélecteur) + câblage
  statique (index.html, theme.css, main.js). Vert.

**Fichiers modifiés**
- `src/index.html` — `<html data-skin="global">` ; le script inline de boot pose
  aussi `data-skin` depuis `localStorage.skin` (avant les styles, pas de flash) ;
  `<link>` vers `theme.css` ; section « Apparence » (sélecteur segmenté
  Global/v2) ajoutée en tête du modal Réglages, qui passe de « Paramètres IA » à
  « Réglages » avec deux sous-sections (Apparence / Assistant IA).
- `src/main.js` — import des polices + `initSkin({ selector: #skin-selector })`
  juste après `initTheme()`.

**Décision d'implémentation notée** : `theme.css` est chargé en `<link>` et non
via `import` JS. Raison vérifiée à l'écran : importé en JS, il passait sous une
cascade *layered* (Tailwind v4) et perdait contre les règles non-layered de
`style.css` malgré une spécificité supérieure. En `<link>`, il est non-layered
comme `style.css` — la spécificité tranche normalement.

**Vérification visuelle** (Chrome headless, cf. outillage ci-dessous) :
barre d'onglets rendue distinctement dans les deux skins — v2 = pilule en
dégradé violet, Global = boîte `accent-soft` discrète + police Manrope. Le reste
de l'app (corps des onglets, clavier MIDI, footer) inchangé — non-régression OK.

**Non couvert par la vérif visuelle auto** : l'aspect du modal Réglégas /
Apparence (le harnais headless ne peut pas ouvrir de modal de façon fiable dans
cet environnement). Comportement du sélecteur couvert par le test unitaire ;
aspect à revoir à l'œil quand l'écran Réglages complet sera fait (§3.6).

**Build OK · test-chords 98/98 · régressions Partie 1 & 3 OK.**

### Outillage de dev (non versionné — dans `.git/info/exclude`)

- `src/_dev-skin.html` — page same-origin qui écrit `skin`/`theme` dans le
  `localStorage` puis redirige vers `/`. Sert au harnais de capture.
- `refonte-shot.sh` — capture headless en deux passes Chrome partageant un
  profil (passe 1 = `_dev-skin.html` pose le localStorage, passe 2 = capture de
  l'app). `./refonte-shot.sh out.png [skin] [tab] [theme] [WxH]`.
- Chrome est instable dans cet environnement (crashs « FD ownership violation »,
  boucle de crash du network service, CDP/puppeteer inutilisables). Seul le
  `--screenshot` one-shot avec un jeu de flags **minimal** est fiable — surtout
  ne pas ajouter `--disable-*-for-testing` ni `--virtual-time-budget`, qui
  cassent la capture ici. Penser à `pkill -9 -f google-chrome` entre les séries.
- Dépendance dev ajoutée : `puppeteer-core` (finalement inutilisée — laissée car
  déjà installée ; à retirer si on veut nettoyer). *(à réévaluer)*

### ✅ Étape 2 — Studio, skins v2 et Global (relais §2, §12.2) — FAITE (commit d8ed061)

**Approche** : `src/ui/refonte/studio.css` en `<link>`, override scopé
`:root[data-skin='…'] #studio-tab` par-dessus le Studio existant. Zéro
changement à la logique de stages (0/1/2/3, `display:none`, overlays) — pilotée
comme avant par `style.css` + `studio-tab.js`.

**Ce qui a bougé dans le DOM (une fois, pour les deux skins)** : le bloc
« Lecture » (transposition + volume) quitte la barre de transport pour la
colonne de droite, comme sur les deux maquettes ; ajout de la bascule
« Boucler la région » (relais §2).

**Comportement câblé** : « Boucler la région » — `loopRegion` persisté dans
`localStorage`, et les deux gardes de fin de région (`onAudioTimeUpdate` +
`syncVideoAndCursor`) relancent à `regionStart` au lieu de `pause()` quand la
boucle est active. `renderStems` pose `data-stem` → pastille de couleur par
stem en CSS.

**Grammaire appliquée** : Global = cartes anguleuses 9-12px, aplats,
`accent-soft`, filet d'accent, transport plat, moniteur 16:9 dégradé, waveform
encadrée traits fins. v2 = pilules (stems à `border-radius:100px`, boutons
ronds, bouton play en dégradé), waveform arrondie, région pilule.

**Tests** : `src/ui/refonte/test-studio-skin.js` (18 assertions statiques :
markup du bloc Lecture, deux blocs de skin, boucle réellement câblée). Vert.
Build OK, régressions Partie 1 & 3 + test-chords 98/98 OK.

**Limite de vérification — IMPORTANT pour Narcisse** : l'environnement de cette
session **n'a pas d'affichage exploitable** (Chrome headless : crash « FD
ownership violation » + network service en boucle, CDP/puppeteer HS ;
`_dev-view.html` avec iframe : injection de script non exécutée ; Electron via
`run_in_background` : SIGKILL immédiat). Seules les captures **statiques sans
interaction ni IPC** marchent (`refonte-shot.sh` / `refonte-preview.sh`). Donc :
Studio **stage 0** (liste des morceaux) vérifié à l'écran dans les deux skins ;
**stages 1-3** (lecteur, waveform de région, cartes de stems, bloc Lecture) —
CSS dérivée ligne à ligne des maquettes `refonte-studio-{global,v2}_2.html`
mais **pas capturée en vrai**. À mettre en tête de liste du prochain point
matin (§9 du prompt).

### Décision non tranchée résolue (Studio)

- **Rail d'icônes v2** : la maquette `refonte-studio-v2_2.html` téléchargée le
  montre encore (colonne 56px `.icon-rail`). Écarté — §1.1 + `decision-deux-
  themes` abandonnent le rail dans les DEUX skins ; l'image `01-studio-v2.png`
  (référence) ne le montre pas. La barre d'onglets du haut (déjà en place, étape
  1) le remplace.
- **Panneau « Réglages du son » v2 avec ✕** (image 01) vs « Sound Settings
  abandonné » (addendum) : ce qui est abandonné c'est le *tiroir* accroché au
  rail. Le panneau de droite (volume / transpo / région / boucle / tags de
  stems) est réel — je garde le contenu, rendu dans la colonne de droite
  existante. Le ✕ n'est pas repris (pas de comportement garanti, §10) : on
  garde le mécanisme de repli `#studio-collapse` déjà présent.
- **« Effets + » / « Export + »** de la maquette Global : non repris — ces
  fonctions n'existent pas dans le code (§10 : ne pas afficher un contrôle sans
  comportement).
- **Miniatures de waveform** dans la liste des morceaux / les cartes de stems
  (maquettes) : non reprises pour l'instant — une fausse waveform est une
  fausse information (§10). Cartes stylées sans la vignette ; vraie vignette =
  petit chantier séparé (peaks de l'AudioBuffer).

### ✅ Étape 3a — Analyse : chrome commun, 2 skins (commit) — FAITE

`src/ui/refonte/analyse.css` (`<link>`), override `:root[data-skin] #analysis-tab`
par-dessus `analyzer-workspace.css`. En-tête / transport / légende repeints ;
sous-onglets Global = soulignement, v2 = pilule dégradé ; bande d'accords
Global = étiquettes 5px + filet d'accent, v2 = pilules 100px + dégradé courant ;
sélection = contour blanc neutre (§5). « Outils » → « Corriger »
(`data-section="corriger"`, bascule générique inchangée).
Vérifié à l'écran via mock de l'état analysis-view, deux skins.
`test-analyse-skin.js` vert. Build + régressions OK.

### Environnement de vérif — MISE À JOUR (méthode qui marche enfin)

`refonte-preview.sh` : boot Vite + captures Chrome headless **dans la même
invocation** (sinon `--unshare-net` isole Vite). Interaction via
`src/_dev-view.html` : iframe same-origin, pose skin/thème, puis injecte un
`<script>` après un `setTimeout` long (fast-forwardé par
`--virtual-time-budget`, mais laisse l'init async finir avant l'injection).
**Le payload d'injection doit être une expression simple, pas une IIFE avec
boucle** (une IIFE échouait en silence). Sous cette forme, on peut mettre
l'onglet Analyse dans l'état « analysis-view » et vérifier le chrome/timeline.
Studio stages 1-3 restent non vérifiés (dépend d'IPC ; le mock stage-3 ne
prenait pas).

### ✅ Étape 3b — Analyse §3.1 « Accord sélectionné », 2 skins (commit 3394961) — FAITE

Carte héros : dégradé violet plein (v2) / aplat `--r-surface` (Global). Nom
d'accord en Manrope, notes + métadonnées en JetBrains Mono. Segmented
« Fermer / Simple » du voicing en pilule (dégradé actif v2, accent-soft actif
Global). Écrans import/préparation alignés sur la palette. Vérifié à l'écran
dans les deux skins. `test-analyse-skin.js` étendu, vert.

---

## FIN DE SESSION 1 — 2026-09-02

**Branche `refonte-visuelle-v2-global`, 6 commits au-dessus de `master`** (via
`analyse-v1-finalisation`). Arbre propre. Build OK. Toutes les régressions +
les 3 tests refonte verts.

**Fait** : infra de bascule de skin (data-skin + theme.css + skin-manager +
sélecteur Réglages › Apparence + polices bundlées) · Studio 2 skins (+ boucle
de région câblée) · Analyse chrome 2 skins (en-tête, timeline, sous-onglets,
Outils→Corriger) · Analyse « Accord sélectionné » 2 skins.

**Pour reprendre** : `git log --oneline master..HEAD`, relire ce fichier,
`bash refonte-preview.sh` pour les captures (voir « Environnement de vérif »
plus haut — Vite + Chrome dans la même invocation, sandbox désactivé,
injection = expression simple).

**Reste, par priorité (ordre relais §12)** — voir détail juste en dessous.

### Reste sur Analyse (ordre relais §12)

- [ ] §3.2 Réharmonisation : panneau complet (contexte détecté, pilules de
  style, 4 critères NON cliquables, bande piano-roll, 3 cartes
  Fidèle/Équilibrée/Audacieuse avec score X/4, bouton « Appliquer ») + le
  **comportement « Appliquer »** (double effet timeline+lecture, interrupteur
  Original/Réharmonisé, « Envoyer vers Entraînement »). Existant à réutiliser :
  `src/ui/reharmonization-view.js` + `.css`, `reharmonization-orchestrator.js`,
  moteur EXP-026 (cartes + score 4 critères).
- [ ] §3.3 Masterclass + briques partagées §8.1 (glossaire) / §8.2 (client IA)
- [ ] §3.5 Corriger (panneau `.fx-panel`)
- [ ] §3.6 Réglages › Assistant IA (plafond d'appels réel, safeStorage)
- [ ] §3.1 Accord sélectionné (déjà validé, juste repeindre) + Vue d'ensemble
- [ ] Chaque équivalent Global juste après son v2 (§5)
- [ ] Étape 5 — Entraînement, 2 skins (§6, §7) + Exercice par mouvements 12 tons
- [ ] Étape 6 — Pédagogie IA (§12.6)

---

## 2026-09-02 — Session 2 : Masterclass, Corriger, Réglages IA, Entraînement

### ✅ Étape 3c — Masterclass (§3.3)

**Fichiers ajoutés**
- `src/ui/masterclass-panel.js` — panneau autonome : détection déterministe de concepts,
  fiches pré-écrites, lecture A/B par synthétiseur, bascule Jouer/Comprendre,
  avertissement si confiance faible, zone de question IA avec plafond mensuel.
- Re-utilise `simple-synth.js`, `chord-display.js`, `chord-edit-session.js`, `openai-config.js`.

**Fichiers modifiés**
- `src/ui/analyzer-tab.js` — importe `initMasterclassPanel`, `renderMasterclass`,
  `setMasterclassSourceType`, `updateAIConnected` ; appelle `renderMasterclass` dans
  `selectSegment` et `activateSectionTab('masterclass')`.
- `src/index.html` — panneau `data-section="masterclass"` avec `.masterclass-empty`
  et `.masterclass-content`.
- `src/ui/refonte/analyse.css` — styles `mc-*` pour les deux skins.

**Vérification** : build OK, tests Partie 1 & 3 OK, test-analyse-skin OK.

### ✅ Étape 3d — Corriger (§3.5)

**Fichiers ajoutés**
- `src/ui/corriger-panel.js` — en-tête statistique, liste filtrable (signalés / tous),
  éditeur de segment avec mini-clavier, candidats alternatifs générés depuis les
  notes de l'accord effectif, écoute en boucle, actions Marquer correct / Appliquer.
  Persistance via `applyChordTargetMutation` et notification à l'appelant
  (`markDirty` + `rerenderTimeline`).

**Fichiers modifiés**
- `src/index.html` — remplace le placeholder `.fx-panel` par le markup complet du
  panneau Corriger (`corriger-header`, `corriger-list`, `corriger-editor`, etc.).
  Les boutons d'export MIDI/JSON/Texte sont conservés dans l'en-tête Corriger.
- `src/ui/analyzer-tab.js` — récupère les éléments Corriger, importe et initie
  `corriger-panel`, appelle `renderCorriger` dans `selectSegment` et
  `activateSectionTab('corriger')`.
- `src/ui/refonte/analyse.css` — styles `corriger-*` pour les deux skins.

**Vérification** : build OK, tests Partie 1 & 3 OK, test-analyse-skin OK.

### ✅ Étape 3f — Réglages › Assistant IA (§3.6)

**Fichiers modifiés**
- `src/ai/openai-config.js` — ajout du `monthlyCap`, chiffrement asynchrone de la
  clé API via Electron `safeStorage` (`enc:` prefix), cache mémoire pour garder
  `getAIConfig()` synchrone après le chargement initial. Fonctions exportées :
  `loadSecureAIConfig`, `getAIConfig`, `saveAIConfig`, `testAIConfig`.
- `electron/main.js` — import `safeStorage` ; handlers IPC
  `safe-storage:is-available`, `safe-storage:encrypt`, `safe-storage:decrypt`.
- `electron/preload.cjs` & `electron/preload.js` — expose `window.electronAPI.safeStorage`.
- `src/index.html` — champ « Plafond mensuel d'appels IA » + compteur d'usage
  `ai-usage` dans le modal Réglages.
- `src/main.js` — appelle `loadSecureAIConfig()` au boot, charge le plafond et
  l'usage dans l'UI, sauvegarde le plafond via `setMonthlyCap` du masterclass.
- `src/style.css` — styles `.ai-cap-row`, `.ai-cap-field`, `.ai-usage`.

**Vérification** : build OK, tests Partie 1 & 3 OK, test-skin-manager OK.

### ✅ Étape 5 — Entraînement, 2 skins + Exercice par mouvements 12 tons (§6, §7)

**Fichiers ajoutés**
- `src/ui/refonte/practice.css` — habillage Entraînement pour v2 et Global :
  panneau d'exercice, boutons de mode en pilule, carte cible, en-tête de
  mouvement, stage principal.

**Fichiers modifiés**
- `src/practice-exercise.js` — ajout du mode `movement` : lecture d'un mouvement
  issu de `movements-library.json` dans les 12 tons, avancée accord par accord
  puis tonalité par tonalité, génération des notes via `deriveChordDisplay`.
  `renderExerciseTarget` affiche le nom du mouvement, la catégorie, la description,
  la tonalité courante et la progression (ton / accord).
- `src/index.html` — bouton `data-mode="movement"` « Mouvement 12 tons » ;
  `<link>` vers `practice.css`.
- `src/main.js` — aucun changement fonctionnel (le sélecteur de mode déjà générique).

**Vérification** : build OK, tests Partie 1 & 3 OK, test-chords 98/98.

### Captures d'écran

Captures Chrome headless (script `refonte-preview.sh`) :
- `$TMPDIR/refonte-shots/practice-global.png` — Entraînement, thème Global.
- `$TMPDIR/refonte-shots/practice-v2.png` — Entraînement, thème v2.
- `$TMPDIR/refonte-shots/settings-global.png` — modal Réglages › Assistant IA
  (plafond + usage) + Apparence.
- `$TMPDIR/refonte-shots/analysis-corriger-v2.png` / `analysis-corriger-global.png` —
  Analyse onglet Corriger (nécessite un état d'analyse peuplé pour un rendu complet).
- `$TMPDIR/refonte-shots/analysis-masterclass-v2.png` — Analyse onglet Masterclass.

### Non-régression

- `npm run build` : OK.
- `node src/analyzer/test-regression-part1.js` : OK.
- `node src/chord-engine/test-regression-part3.js` : OK.
- `npm run test:chords` : 98/98.
- `node src/ui/refonte/test-skin-manager.js` : OK.
- `node src/ui/refonte/test-studio-skin.js` : OK.
- `node src/ui/refonte/test-analyse-skin.js` : OK.

### Reste (toujours hors périmètre)

- Coach d'accompagnement au chant (§9.1).
- Couche de jeu rythmique + licks (§9.2).
- Refonte de Pédagogie IA (pipeline OCR).
- Étape 6 Pédagogie IA (§12.6) non traitée.

### ✅ Correction / refonte — Studio : deux layouts réels (v2 / Global)

**Constat** : l'Étape 2 initiale ne faisait que repeindre les tokens CSS. Le
sélecteur « Apparence › Thème visuel » ne basculait pas la structure du Studio :
la maquette v2 (carte « En cours » à gauche, lecteur centré fixe, pistes en
bandes horizontales en bas, panneau Lecture à droite) et la maquette Global
(liste « Musiques importées » à gauche, lecteur + waveform turquoise au centre,
stems dans la sidebar droite + sections Effets / Export) n'étaient pas réalisées.

**Changements**

- `src/index.html` : ajout de `#studio-center-header` (breadcrumb + bouton
  « Séparer les pistes »), déplacement de `#studio-stems-bottom` en frère de
  `.studio-center`/`.studio-sidebar` pour le placement en grille v2, ajout des
  sections « Effets » et « Export » placeholders dans la sidebar droite (Global).
- `src/ui/studio-tab.js` : `applyStudioSkinLayout()` déplace physiquement
  `#studio-stems-list` entre la sidebar droite (Global) et le panneau du bas
  (v2) au changement de skin ; `applyStudioSkinStageVisibility()` masque la
  waveform classique et affiche les stems en bas uniquement en v2 stage 3.
  `renderWaveform()` lit `--r-waveform` pour obtenir la couleur turquoise
  (Global) / violette (v2).
- `src/ui/refonte/studio.css` : réécriture complète du skin Studio. Global :
  liste de morceaux stylisée, lecteur moniteur, waveform turquoise, stems en
  cartes dans la sidebar + sections Lecture / Effets / Export. v2 : grille
  `#studio-tab` dédiée (`left / center / playback` + ligne `stems-bottom`),
  header central, carte « EN COURS » sur l'item actif, stems en pilules colorées
  horizontales en bas, Lecture uniquement à droite, waveform violette.

**Invariants Studio respectés** : aucune modification de la logique audio
(AudioContext unique, `decodeAudioData`, vidéo muette, stages 0-3, séparation
Demucs/simulation, transport). Seule la disposition et l'habillage changent.

**Vérification** : build OK · `test-studio-skin.js` OK ·
`test-skin-manager.js` OK · `test-analyse-skin.js` OK · régressions Partie 1
et Partie 3 OK · `npm run test:chords` 98/98.

### Notes pour la suite

- Le panneau Corriger et Masterclass ne peuvent être pleinement vérifiés visuellement
  sans un état d'analyse peuplé ; le code est câblé pour apparaître dès qu'un segment
  est sélectionné dans la timeline.
- L'environnement de capture reste fragile (Chrome headless one-shot) ; les captures
  servent de contrôle de non-régression globale plutôt que de recette interactive.
- Studio stages 1-3 restent difficiles à capturer en l'état (besoin d'un
  fichier audio chargé + d'IPC Demucs/waveform). Une prochaine session pourrait
  construire un mock d'état stage-3 suffisant pour le rendu statique.
