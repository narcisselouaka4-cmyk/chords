# Plan — Refonte de l'onglet Analyse avec sous-onglets

## Objectif
Rendre l'onglet **Analyse** plus clair et plus lisible en organisant l'information en **sous-onglets**, tout en conservant la sidebar gauche (Nouvelle session + liste des sessions) et en gardant l'affichage progressif déjà en place.

## Diagnostic rapide de l'état actuel
L'onglet Analyse actuel (`#analysis-tab`) est une grille à 2 colonnes :
- **Colonne gauche** : nouvelle session, contrôles d'enregistrement, liste des sessions.
- **Colonne droite** : infos de session, transport, analyse complète (timeline d'accords, scores, patterns, réharmonisation, détail d'accord).

Le problème : la colonne droite empile trop d'informations de nature différente (lecture, métriques, accords, suggestions, détail). L'affichage progressif par accordéons améliore la situation, mais la hiérarchie reste confuse.

## Proposition : sous-onglets dans la zone d'analyse

### Structure visuelle
```
┌─────────────────┬──────────────────────────────────────────────┐
│  Nouvelle       │  Session : [Nom]   [▶] [⏸] [■] [slider]    │
│  session + REC  │────────────────────────────────────────────│
│                 │  [ Accords | Analyse | Masterclass ]         │
│                 │                                              │
│  Sessions       │  ┌───────────────────┬───────────────────┐   │
│  enregistrées   │  │  Contenu actif    │  Détail / Aperçu  │   │
│                 │  │  (grille/timeline)│  (accord/suggestions│   │
│                 │  └───────────────────┴───────────────────┘   │
└─────────────────┴──────────────────────────────────────────────┘
```

La barre de sous-onglets est placée **sous** la barre de transport, qui reste toujours visible (lecture + infos de session). La zone sous les onglets affiche le contenu adapté.

### Sous-onglets proposés

| Onglet | Icône | Contenu |
|--------|-------|---------|
| **Accords** | 🎹 | Grille d'accords par section (ou timeline pour Cover), détail de l'accord sélectionné à droite, voicings alternatifs, substitutions, suggestions par style pour l'accord actif. |
| **Analyse** | 📊 | Scores de session, patterns harmoniques (II-V-I, cadences, turnarounds, substitutions), réharmonisation complète de session avec lecture. |
| **Masterclass** | 🎓 | Analyse IA de la session entière (si clé API configurée), avec fallback algorithmique. |

### Gestion de la sélection d'accord
- Dans l'onglet **Accords**, cliquer sur un accord met à jour le panneau de droite (détail + suggestions).
- Dans les onglets **Analyse** et **Masterclass**, le panneau de droite peut être masqué ou afficher un aperçu global ; les tuiles d'accord restent cliquables pour recentrer la vue sur un accord.

## Fichiers concernés

1. **`src/index.html`**
   - Restructurer `recording-center` pour ajouter une barre de sous-onglets (`analysis-subtabs`) et un conteneur `analysis-subview`.
   - Garder `analysis-content` comme zone racine pour `analyzer-tab.js`.

2. **`src/ui/analyzer-tab.js`**
   - Modifier `buildMidiViewHtml`, `buildTutorialHtml`, `buildCoverHtml` pour produire du contenu destiné au sous-onglet actif.
   - Ajouter `renderSubTabs(analysis, sourceType)` qui génère la barre d'onglets et 3 vues.
   - Ajouter un état `activeSubTab` par session.
   - Déplacer les scores/patterns/réharmonisation dans l'onglet **Analyse**.
   - Déplacer la Masterclass complète dans l'onglet **Masterclass**.
   - Conserver l'affichage progressif (panneaux repliables par défaut dans l'onglet Analyse).

3. **`src/ui/recording-tab.js`**
   - S'assurer que le transport (play/pause/slider) reste visible au-dessus des sous-onglets.
   - Adapter `runAnalysis()` pour passer le sous-onglet par défaut (`accords`).

4. **`src/style.css`**
   - Styles pour la barre de sous-onglets (`analysis-subtabs`) : reprendre le style pill de `tab-nav` mais plus petit.
   - Styles pour `analysis-subview` : flex 1, scrollable.
   - Adapter `.analysis-layout` pour qu'elle fonctionne à l'intérieur d'un sous-onglet.
   - S'assurer que la zone de détail reste bien positionnée.

5. **`CHANGES.md`**
   - Documenter la refonte.

## Approche technique

### Vue unique par sous-onglet
Au lieu de tout afficher dans une seule grande colonne, `analyzer-tab.js` rendra :
1. Une barre d'onglets HTML avec 3 boutons.
2. Un conteneur dont le contenu change selon `activeSubTab`.

### Gestion d'état
- `currentSubTab` en haut de `analyzer-tab.js`.
- Lors du clic sur un sous-onglet, on re-render uniquement le contenu du sous-onglet, pas toute l'analyse (évite les requêtes IA inutiles).
- Le détail d'accord sélectionné (`selectedChordId`) est conservé entre les sous-onglets.

### Réduction de la complexité visuelle
- Supprimer les panneaux d'accordéons de la vue principale ; les regrouper dans l'onglet **Analyse**.
- L'onglet **Accords** garde uniquement : titre de session/tonalité + grille/timeline + détail.
- L'onglet **Masterclass** affiche un résumé pédagogique de toute la session.

## Tests et vérifications
- `node src/analyzer/test-regression-part1.js`
- `node src/chord-engine/test-regression-part3.js`
- `npm run build`
- Vérifier visuellement (si possible) que les 3 sous-onglets fonctionnent et que la sélection d'accord met à jour le détail.

## Questions à trancher
1. Faut-il garder le sous-onglet **Session** (infos + transport) séparé, ou la barre de transport reste-t-elle suffisante en haut ?
2. Les noms et icônes des sous-onglets te conviennent-ils (Accords / Analyse / Masterclass) ?
3. La Masterclass IA doit-elle rester accessible aussi par accord dans l'onglet **Accords** (bouton par accord) en plus du sous-onglet global ?
