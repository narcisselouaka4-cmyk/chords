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

- [ ] Studio — thème Global
- [ ] Studio — thème v2
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

### Prochaine étape

- [ ] Étape 2 — Studio, les deux skins (relais §2, §12.2). Global d'abord (le
  plus abouti), puis v2. Maquettes HTML dispo sur disque :
  `~/Téléchargements/refonte-studio-{global,v2}_2.html` (= images 01/02).
