# 2026-10-13 — Fond unique, navigation Atelier/Scène, voicings indisponibles masqués

À reporter dans le vault : `log.md`, `state/current-state.md`, `decisions/` (le fond lavande est abandonné).

## Fond uniforme (Entraînement / Analyse / Studio)
- **Constat** : trois fonds différents. Entraînement avait en clair un gris lavande propre
  (`#e6e2ee`, décision du 02/10 — **abandonnée**, Narcisse veut qu'on sente la même
  application), Analyse ses propres gris violacés (`--an-*`, sombre `#121019`), Studio
  `--r-ground`.
- **Règle** : une seule source pour les neutres, `--tr-bg / --tr-header / --tr-surface /
  --tr-raised / --tr-hover / --tr-inset / --tr-border* / --tr-text*`. `--an-*` les lit
  (`astra-analysis.css`), le bloc `#practice-tab { --tr-bg: #e6e2ee }` d'`astra-bridge.css`
  est retiré. Mesuré : `rgb(20,20,22)` en sombre, `rgb(245,244,247)` en clair, pour les
  trois onglets, dans les deux habillages. Les accents et couleurs d'état d'Analyse restent
  propres à Analyse.
- La couleur d'accent personnalisée continue de teinter les clairs (`accent-theme.js`).

## Navigation (`src/ui/refonte/astra-nav.css`, chargée en dernier)
- **Onglets principaux** : un logo sur chacun (Entraînement : clavier de piano — l'ancienne
  forme d'onde était déjà celle de « Sessions MIDI » ; Analyse : loupe sur barres ; Studio :
  curseurs de mixage). Grille à colonnes égales : la barre garde la même largeur d'un onglet
  à l'autre.
- **Atelier** : aplat relevé + filet d'accent sous l'onglet actif.
- **Scène** : pilules ; l'onglet actif est un bouton plein (`--tr-button` / `--tr-button-text`,
  donc lisible quelle que soit la couleur d'accent, jaune compris), relief + ombre colorée ;
  léger soulèvement au survol (même effet que la carte « Choisir un fichier »). L'icône ne
  disparaît plus (elle était accent sur dégradé accent).
- **Sous-onglets (Entraînement et Analyse)** : Atelier = onglets soulignés, trait d'accent au
  survol (atténué) et sur l'onglet courant ; Scène = bande en pilule, onglet courant en relief
  (contour d'accent, ombre), moins appuyé que les onglets principaux. Le trait d'Astra
  (`.tr-active-underline`) est masqué : il se superposait ou dépassait de la pilule.
- Points de rupture d'`astra-training.css` non touchés (tailles, hauteurs). Vérifié sans
  débordement horizontal à 820, 1024 et 1400 px.

## Exercices
- `renderVoicingCategories` (`practice-exercise.js`) : les techniques inapplicables à l'accord
  ne sont plus affichées (elles étaient barrées, `.exercise-category-tag.disabled`). Une
  technique en cours de jeu est toujours gardée. Ex. C13 : « Shell » n'apparaît plus.
- Test ajouté dans `practice-exercise.test.js` (544/544).

## Tests
- `test-training-dom.js` : le contrôle « fond gris lavande en clair » est remplacé par quatre
  contrôles (pas de fond propre à Entraînement, `--an-*` lit `--tr-*`, colonnes égales, trois
  logos). Échecs anciens inchangés : training-dom (11), coach-dom (2), home-results (1),
  skin-manager (3 lignes), analyse-skin (2).
- `test:chords` 98/98, build OK.

## Non vérifié sur sa machine
- Le rendu réel des sous-onglets d'Analyse avec un morceau chargé (forcés à l'écran seulement).
- Studio en étape 1 à 3 (seul l'accueil a été capturé) ; Pédagogie IA, Sessions MIDI, Coach.

---

# Suite du 13/10 — Sessions MIDI : paysage harmonique et transposition en lecture

## Paysage harmonique (`astra-harmonic-roll.js`)
- **Couleur** : les violets étaient écrits en dur dans le SVG. Tout dérive maintenant de
  `--tr-accent` (`color-mix` avec du blanc / du noir) : le paysage suit la couleur choisie dans
  Réglages › Apparence, sans redessin (le navigateur relit les variables). Test : aucune teinte en
  dur dans le fichier.
- **Tête de lecture** : pas un bug mais la perspective — en relief, tous les points d'un même
  instant sont sur l'oblique de la grille ; l'ancien trait partait du coin avant du sol vers le
  fond en montant de 25, ni vertical ni sur le sol. Maintenant : trait **vertical** au bord avant
  (pastille sur le sol) et, en filigrane, la paroi qui s'étend jusqu'au fond (arête au sol sur la
  grille : les notes jouées à cet instant s'y alignent). À plat : un trait vertical, inchangé.
  Compromis connu : une note aiguë qui joue est à ~50 px à droite du trait vertical ; la paroi et
  la surbrillance de la note la relient.

## Transposition en pleine lecture (`transpose-shift.js`, `main.js`)
- **Cause** : à chaque changement de transposition, `activeNotes` et `sustainedNotes` étaient
  décalés, mais pas `playbackNotes` (l'ensemble qui décide jaune = l'application / bleu = le
  pianiste). Les touches décalées n'y figuraient plus et se rallumaient en bleu.
- **Correction** : `shiftTransposedState` décale les trois ensembles ensemble. Reproduit dans
  l'application avec l'exemple d'Exercices (avant : toutes les touches passent en « toi » après −1 ;
  après : toutes restent « app »). Test `src/test-transpose-shift.js` (7/7).
- **Non traité (à surveiller)** : le son d'une note en cours est lancé à l'ancienne hauteur ; son
  relâchement arrive à la nouvelle — une note tenue pendant le changement peut ne pas être relâchée
  proprement. Non vérifié à l'oreille.

---

# Suite du 13/10 (2) — « Ce que joue l'application » suit la couleur de l'application

- **Règle** (`resolveAppKeyColor`, `ui/key-colors.js`) : choix personnel (pastille « L'app » sous le
  clavier, `pjc.keyColors.app`) > couleur de l'application (`pjc.accent`, Réglages › Apparence) >
  jaune d'origine. Sans couleur d'application choisie (violet d'origine), les touches de
  l'application restent jaunes (décision du 25/09 : bleu = toi, jaune = l'app).
- `main.js` : `refreshAppKeyColor()` au démarrage, à chaque `app-theme-changed` et au clic sur la
  pastille. Réglages › Apparence : ligne « Ce que joue l'application » (état + bouton « Suivre la
  couleur de l'application », visible seulement après un choix personnel).
- Vérifié dans l'application : défaut jaune ; accent rose → touches roses ; changement via
  Réglages en direct ; choix bleu gardé quand l'accent change ; bouton → retour au suivi.
  `test-key-colors.js` 11/11.
