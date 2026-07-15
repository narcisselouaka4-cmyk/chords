# Phase 2B — Close/Simple Text Preview Integration — Rapport

> **Projet :** Piano Jazz Chords
> **Date :** 2026-07-14
> **Phase :** 2B — UI du sélecteur Close/Simple

---

## Fichiers modifiés (Phase 2B)

| Fichier | Type de modification |
|---------|---------------------|
| `src/ui/voicing-preview.js` | Ajout des fonctions de gestion de style, modification de `buildVoicingTextModel`, `updateVoicingPreviewForChord`, `renderVoicingTextPreview` et `clearVoicingTextPreview` |
| `src/ui/analyzer-tab.js` | Import des nouvelles fonctions, ajout du cache `lastRenderedVoicingStyle`, initialisation dans `showResults`, reset dans `showImportScreen` |
| `src/style.css` | Ajout des styles `.voicing-style-selector`, `.voicing-style-btn`, `.voicing-style-btn.active` |
| `src/index.html` | Ajout du conteneur statique `#analyzer-voicing-style-selector` et de la zone de contenu `#analyzer-voicing-content` |
| `src/ui/test-voicing-preview.js` | Ajout de 34 tests Phase 2B (total porté à 69), y compris tests DOM du sélecteur statique |

## Fichier créé

| Fichier | Contenu |
|---------|---------|
| `docs/TWO_HAND_VOICING_ENGINE_V1_PHASE2B_UI_REPORT.md` | Ce rapport |

## Aucun fichier interdit modifié

`src/voicing-engine/**`, `src/chord-engine/**`, `electron/**`, `src/main.js` — aucun.

---

## Diagnostic de l'absence du sélecteur

**Cause exacte :** dans l'implémentation initiale, `renderVoicingStyleSelector()` créait dynamiquement les boutons Close/Simple à l'intérieur du panneau `#analyzer-voicing-preview`. Ensuite, `renderVoicingTextPreview()` et `clearVoicingTextPreview()` effectuaient un `container.innerHTML = ''` pour rafraîchir le voicing. Cette opération effaçait non seulement l'ancien texte, mais aussi le sélecteur qui vivait dans le même conteneur. Dès le premier rendu de segment, les boutons disparaissaient.

**Stratégie retenue :** passage à une architecture **statique + isolée** :
- Le sélecteur est défini directement dans `src/index.html` dans `#analyzer-voicing-style-selector`.
- Le contenu textuel (titre, LH, RH, états d'erreur) est rendu dans `#analyzer-voicing-content`, jamais dans le parent commun avec `innerHTML`.
- `renderVoicingTextPreview()` et `clearVoicingTextPreview()` ne touchent qu'à la zone de contenu, préservant ainsi le sélecteur.

---

## Architecture finale

### Source de vérité unique

Dans `voicing-preview.js` :

```js
let currentVoicingStyle = 'close';
let voicingStyleInitialized = false;
```

`getVoicingStyle()` retourne `currentVoicingStyle` sans relire `localStorage`.

### Fonctions ajoutées

| Fonction | Rôle |
|----------|------|
| `normalizeVoicingStyle(raw)` | Normalise une valeur : `"simple"` ou `"close"` par défaut |
| `getVoicingStyle()` | Retourne la valeur mémoire |
| `setVoicingStyle(rawStyle)` | Écrit en mémoire + localStorage (try/catch) |
| `selectVoicingStyle(rawStyle)` | Compare, écrit si différent, invalide le cache, déclenche le re-rendu |
| `updateVoicingStyleSelector(style)` | Met à jour `aria-pressed` et la classe `active` dans le sélecteur statique |
| `renderVoicingStyleSelector(container, currentStyle, onChange)` | Connecte les boutons statiques avec leurs listeners (une seule fois) |
| `initVoicingStyle()` | Initialisation unique au démarrage : lecture localStorage → normalisation → connexion du sélecteur |

### Sélecteur statique dans `src/index.html`

```html
<section id="analyzer-voicing-preview" class="voicing-preview-panel" aria-label="Aperçu du voicing piano" style="display:none">
  <div id="analyzer-voicing-style-selector" class="voicing-style-selector" role="group" aria-label="Style de voicing">
    <button type="button" class="voicing-style-btn" data-voicing-style="close" aria-pressed="true">Close</button>
    <button type="button" class="voicing-style-btn" data-voicing-style="simple" aria-pressed="false">Simple</button>
  </div>
  <div id="analyzer-voicing-content"></div>
</section>
```

### Cache dans analyzer-tab.js

```js
let lastRenderedVoicingChord = null;
let lastRenderedVoicingStyle = null;
```

Le cache est invalidé quand l'accord effectif change **ou** le style change. Même accord + même style = zéro appel moteur.

### Contrôle accessible

De vrais `<button>` avec `type="button"`, `role="group"`, `aria-label="Style de voicing"`, `aria-pressed` dynamique, classe `active`. Gestion des événements clavier avec `stopPropagation()` uniquement (pas `preventDefault()`), le `click` est l'unique chemin de changement.

### Appel moteur unique

`updateVoicingPreviewForChord` appelle `generateVoicing(input, { style })` **une seule fois** par recalcul. Le même `VoicingResult` alimente le titre, LH et RH.

### Gestion des échecs Simple

Quand `generateVoicing(input, { style: 'simple' })` retourne `ok: false` :
- Style `"simple"` conservé
- Pas d'appel à Close
- Preview nettoyé
- Récupération possible sur un segment valide suivant

### Notation enharmonique

Inchangée par rapport à Phase 1.5A. `resolveUseSharps()` et `inferUseSharpsFromSymbol()` restent seules responsables.

---

## Résultats des tests

### Tests Phase 2B

69/69 tests OK (35 Phase 1.5A + 34 Phase 2B).

Nouveaux tests DOM ajoutés :

| Test | Vérification |
|------|--------------|
| HTML statique contient le sélecteur accessible | présence des id, classes, role, aria-label, boutons |
| Sélecteur DOM : présence exacte de deux boutons Close/Simple | 2 boutons avec labels corrects |
| État initial Close — aria-pressed et classe active | Close actif, Simple inactif |
| Clic sur Simple → VOICING SIMPLE et état actif mis à jour | style, aria-pressed, classe active |
| Clic sur Close → VOICING CLOSE et retour état actif | idem inverse |
| Rendu textuel ne détruit pas le sélecteur | le sélecteur et ses boutons survivent à `renderVoicingTextPreview` |
| Deux initialisations successives ne dupliquent pas les listeners | un seul listener click par bouton |
| Conteneur absent puis présent — initialisation réussit au second appel | robustesse au timing DOM |
| Aucune modification du petit clavier Hero ni du grand clavier | non-régression claviers |

### Non-régressions

| Suite | Résultat |
|-------|----------|
| `test-voicing-phase0.js` | 107/107 OK |
| `test-voicing-phase1.js` | 57/57 OK |
| `test-voicing-phase2.js` | 62/62 OK |
| `test-voicing-preview.js` | 69/69 OK |
| `test-chord-editor.js` | 83/83 OK |
| `test-analysis-export.js` | 17/17 OK |
| `test-analysis.js` | 1/1 OK |
| `test-regression-part1.js` | 3/3 OK |
| `test-regression-part3.js` | 2/2 OK |
| `npm run build` | OK |
| `git diff --check` | OK |

### Échec environnemental préexistant

```text
node src/ui/test-load-session.js → ReferenceError: window is not defined
```

**PREEXISTING_ENVIRONMENT_DEPENDENT_FAILURE** — Ce test nécessite un environnement Electron/Chromium. L'échec est identique avant et après Phase 2B.

---

## Confirmation clavier

- Aucune classe `.voicing-lh`, `.voicing-rh`, `.voicing-both`, `.voicing-bass` n'a été ajoutée au CSS.
- `#analyzer-hero-keyboard` (mini clavier Hero) n'est pas modifié.
- Le grand clavier inférieur (`#keyboard-container`) n'est pas modifié.
- Aucune couleur de touche modifiée.

---

## État Git

### Fichiers Phase 2B modifiés

```text
M src/index.html
M src/ui/analyzer-tab.js
M src/ui/test-voicing-preview.js
M src/ui/voicing-preview.js
M src/style.css
```

### Modifications étrangères préexistantes (non touchées)

```text
M src/main.js
M src/recorder/serializer.js
M electron/audio-processor.py
M electron/__pycache__/audio-processor.cpython-313.pyc
M package.json
M package-lock.json
M vite.config.js
M CHANGES.md
M .clinerules/rules-projet.md
```

---

## Validation runtime utilisateur

Validation manuelle confirmée par l'utilisateur :

- sélecteur Close | Simple visible dans le panneau textuel ;
- passage immédiat entre VOICING CLOSE et VOICING SIMPLE ;
- notes LH/RH actualisées sans changement de segment ;
- position audio inchangée lors du changement de style ;
- préférence Simple conservée après fermeture complète et relance ;
- activation avec Espace sur le bouton sans lancer ni interrompre l'audio ;
- corrections manuelles suivies correctement ;
- undo et redo actualisent le preview ;
- slash chords conservés ;
- petit clavier Hero inchangé ;
- grand clavier inchangé et non coloré.

Cette validation est manuelle et ne remplace pas les tests automatisés.

### Remarques non bloquantes connues

- activation clavier native non simulée intégralement de bout en bout dans les tests Node ;
- raccourci global de lecture non simulé avec focus réel sur le bouton ;
- contrôle visuel des claviers principalement confirmé par inspection du diff et validation runtime ;
- éventuelle collision de numérotation interne des tests sans effet fonctionnel.

Aucun commit créé.
