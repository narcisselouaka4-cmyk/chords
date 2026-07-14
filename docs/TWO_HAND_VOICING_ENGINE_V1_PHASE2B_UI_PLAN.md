# Two-Hand Piano Voicing Engine V1 — Phase 2B : Close/Simple Text Preview Integration

> **Nature du document :** plan uniquement. Aucun fichier de code ne doit être modifié ni créé à ce stade.
> **Projet :** Piano Jazz Chords
> **Contexte :**
> - Fondations : commit `70d1035`
> - Moteur Close : commit `d11f754`
> - Preview textuel Close : commit `9b037e5`
> - Plan Simple : commit `06f9ed8`
> - Moteur Simple Phase 2A : commit `66b12de`
> - Phase 1.5B (coloration du grand clavier) : `DEFERRED_BY_USER`

---

## 1. Objectif utilisateur

Ajouter dans le panneau textuel de voicing existant un choix minimal :

```text
Close | Simple
```

Le choix doit modifier uniquement le voicing textuel affiché :

```text
VOICING CLOSE
LH ...
RH ...
```

ou :

```text
VOICING SIMPLE
LH ...
RH ...
```

**Ne pas modifier :**
- le petit clavier du Hero ;
- le grand clavier inférieur ;
- les couleurs des touches ;
- la timeline ;
- la détection d'accords.

---

## 2. API existante

Réutiliser exclusivement :

```js
generateVoicing(input, { style: selectedStyle })
```

Styles autorisés :
- `close`
- `simple`

**Ne pas dupliquer la logique musicale dans `src/ui/`.**

**Ne jamais appeler séparément le moteur pour le titre et pour les notes.**

Un recalcul du segment actif doit provoquer **un seul appel** à `generateVoicing()`.

---

## 3. Architecture du flux

### 3.1 Source de vérité unique en mémoire

Le style actif possède une **seule source de vérité JavaScript**, dans `voicing-preview.js` :

```js
let currentVoicingStyle = 'close';
let voicingStyleInitialized = false;
```

**Ordre d'initialisation (une seule fois au démarrage) :**

1. Lire une seule fois `localStorage` de manière sécurisée.
2. Normaliser la valeur.
3. Stocker le résultat dans `currentVoicingStyle`.
4. Rendre le sélecteur (`renderVoicingStyleSelector`).
5. Attacher les écouteurs une seule fois.
6. Rendre le segment actif lorsque celui-ci existe.

Après l'initialisation, `getVoicingStyle()` retourne la valeur en mémoire et **ne relit pas** `localStorage` à chaque rendu.

### 3.2 Diagramme de flux

```text
┌─────────────────────────────────────────────────────────────┐
│  localStorage                                               │
│  clé : piano-jazz-chords.voicing-style                      │
│  valeurs : "close" | "simple"                               │
└──────────────────────┬──────────────────────────────────────┘
                       │ lecture unique au démarrage
                       ▼
┌─────────────────────────────────────────────────────────────┐
│  voicing-preview.js                                         │
│                                                             │
│  currentVoicingStyle = 'close'   ← source de vérité mémoire │
│  voicingStyleInitialized = false                            │
│                                                             │
│  initVoicingStyle()                                          │
│       │  lit localStorage, normalise, stocke en mémoire     │
│       │  renderVoicingStyleSelector(container, style, cb)   │
│       │  attache les écouteurs une seule fois               │
│       ▼                                                     │
│                                                             │
│  getVoicingStyle() ──► retourne currentVoicingStyle          │
│                                                             │
│  selectVoicingStyle(rawStyle)                                │
│       │                                                     │
│       ├─► normalizeVoicingStyle(rawStyle) → "close"|"simple"│
│       │                                                     │
│       ├─► si newStyle === currentVoicingStyle :              │
│       │     updateVoicingStyleSelector(currentVoicingStyle)  │
│       │     return false  (aucun recalcul, aucune écriture)  │
│       │                                                     │
│       ├─► currentVoicingStyle = newStyle  (mémoire d'abord) │
│       │                                                     │
│       ├─► try { localStorage.setItem(...) } catch { }       │
│       │                                                     │
│       ├─► updateVoicingStyleSelector(newStyle)               │
│       │                                                     │
│       └─► rerenderActiveVoicing() → 1 appel generateVoicing │
│                                                             │
│  updateVoicingPreviewForChord(effectiveChord, { style })    │
│       │                                                     │
│       ├─► effectiveChordToVoicingInput(effectiveChord)      │
│       │         │                                           │
│       │         ▼                                           │
│       │   { rootPc, quality, bassPc }                       │
│       │         │                                           │
│       │         ▼                                           │
│       │   generateVoicing(input, { style })  ◄── UN SEUL    │
│       │         │                        appel moteur       │
│       │         ▼                                           │
│       │   VoicingResult immuable                             │
│       │         │                                           │
│       ▼                                                     │
│  renderVoicingTextPreview(result, { style, ... })            │
│       │                                                     │
│       ├─► buildVoicingTextModel(result, { style, ... })     │
│       │         │                                           │
│       │         ▼                                           │
│       │   title = style === 'simple'                        │
│       │     ? 'VOICING SIMPLE'                              │
│       │     : 'VOICING CLOSE'                               │
│       │         │                                           │
│       │         ▼                                           │
│       │   midiToNoteName(midi, { useSharps })               │
│       │         │                                           │
│       │         ▼                                           │
│       │   DOM textuel dans #analyzer-voicing-preview         │
│       ▼                                                     │
│  updateVoicingStyleSelector(style)  ← mise à jour aria      │
│       │                              pressed + classe active │
│       ▼                                                     │
│  DOM : [Close] [Simple]  dans le panneau de preview          │
└─────────────────────────────────────────────────────────────┘
                       │
                       │ onChange (selectVoicingStyle)
                       ▼
┌─────────────────────────────────────────────────────────────┐
│  analyzer-tab.js                                            │
│                                                             │
│  updatePlaybackPosition(currentTime)                        │
│       │                                                     │
│       ▼                                                     │
│  effectiveChord = getEffectiveChord(activeChord)            │
│       │                                                     │
│       ▼                                                     │
│  updateVoicingPreviewForChord(effectiveChord, { style })    │
│                                                             │
│  Cache : lastRenderedVoicingChord + lastRenderedStyle       │
│  → évite les appels redondants                              │
└─────────────────────────────────────────────────────────────┘
```

**Distinction importante :**
- `renderVoicingStyleSelector(container, style, onChange)` : création initiale du DOM du sélecteur, appelée **une seule fois** lors de l'initialisation.
- `updateVoicingStyleSelector(style)` : mise à jour des attributs `aria-pressed` et de la classe `active` sur les boutons existants, appelée après chaque changement réel de style.
- Aucune création de sélecteur à chaque changement de segment.

---

## 4. Contrôle Close/Simple

### 4.1 Emplacement

Le sélecteur est placé **dans le panneau de preview existant** (`#analyzer-voicing-preview`), au-dessus du titre ou en première ligne.

### 4.2 Rendu accessible

```html
<div
  class="voicing-style-selector"
  role="group"
  aria-label="Style de voicing"
>
  <button
    type="button"
    data-voicing-style="close"
    aria-pressed="true"
  >
    Close
  </button>

  <button
    type="button"
    data-voicing-style="simple"
    aria-pressed="false"
  >
    Simple
  </button>
</div>
```

### 4.3 Exigences d'accessibilité

- De vrais `<button>` avec `type="button"`.
- Groupe accessible (`role="group"`, `aria-label="Style de voicing"`).
- `aria-pressed` actualisé à chaque changement.
- Classe `active` actualisée en même temps que `aria-pressed`.
- État actif compréhensible sans dépendre uniquement de la couleur.
- Focus clavier visible.
- Comportement natif Entrée/Espace.
- Aucun conflit avec le raccourci global de lecture lorsque le focus est sur un bouton. Le `keydown` handler global vérifie déjà `tagName === 'INPUT' || 'SELECT' || 'TEXTAREA'`. Les boutons du sélecteur ne sont pas dans ces cas. Le handler `keydown` local du sélecteur appelle uniquement `e.stopPropagation()` (pas `preventDefault()`) pour les touches Espace et Entrée, ce qui empêche le raccourci global de lecture tout en laissant le navigateur produire naturellement l'événement `click` natif. Le gestionnaire `click` est l'unique chemin qui appelle `selectVoicingStyle()`.

### 4.4 Comportement

- **Close** reste la valeur initiale par défaut.
- Changement immédiat du preview du segment actif.
- Aucun rechargement audio.
- Aucun nouveau calcul de détection.
- Aucun changement de segment.
- Aucune modification manuelle de l'accord.
- Aucun changement du moteur d'analyse.
- Cohérent avec le design Tailwind existant (tons zinc/sky).

### 4.5 Fonctions à créer dans `voicing-preview.js`

```js
const VOICING_STYLE_KEY = 'piano-jazz-chords.voicing-style';

let currentVoicingStyle = 'close';
let voicingStyleInitialized = false;
let voicingStyleSelectorInitialized = false;

function normalizeVoicingStyle(raw) {
  if (raw === 'simple') return 'simple';
  return 'close';
}

export function getVoicingStyle() {
  return currentVoicingStyle;
}

export function setVoicingStyle(rawStyle) {
  const normalizedStyle = normalizeVoicingStyle(rawStyle);
  currentVoicingStyle = normalizedStyle;

  try {
    getLocalStorage()?.setItem(VOICING_STYLE_KEY, normalizedStyle);
  } catch {
    // La préférence reste active pour la session courante.
    // Au prochain lancement, l'absence d'écriture réussie
    // fera revenir la valeur persistée précédente.
  }

  return normalizedStyle;
}

export function selectVoicingStyle(rawStyle) {
  const newStyle = normalizeVoicingStyle(rawStyle);
  const previousStyle = currentVoicingStyle;

  if (newStyle === previousStyle) {
    updateVoicingStyleSelector(previousStyle);
    return false;
  }

  setVoicingStyle(newStyle);
  updateVoicingStyleSelector(newStyle);
  rerenderActiveVoicing();
  return true;
}

export function updateVoicingStyleSelector(selectedStyle) {
  const container = document.getElementById(CONTAINER_ID);
  if (!container) return;
  const buttons = container.querySelectorAll('[data-voicing-style]');
  buttons.forEach((btn) => {
    const isActive = btn.dataset.voicingStyle === selectedStyle;
    btn.setAttribute('aria-pressed', String(isActive));
    btn.classList.toggle('active', isActive);
  });
}

export function renderVoicingStyleSelector(container, currentStyle, onChange) {
  if (voicingStyleSelectorInitialized) return;
  voicingStyleSelectorInitialized = true;

  const group = document.createElement('div');
  group.className = 'voicing-style-selector';
  group.setAttribute('role', 'group');
  group.setAttribute('aria-label', 'Style de voicing');

  for (const style of ['close', 'simple']) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'voicing-style-btn';
    btn.dataset.voicingStyle = style;
    btn.setAttribute('aria-pressed', String(style === currentStyle));
    if (style === currentStyle) btn.classList.add('active');
    btn.textContent = style === 'close' ? 'Close' : 'Simple';

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      onChange(style);
    });

    btn.addEventListener('keydown', (e) => {
      if (e.key === ' ' || e.key === 'Enter') {
        e.stopPropagation();
      }
    });

    group.appendChild(btn);
  }

  container.prepend(group);
}
```

### 4.6 Installation unique des écouteurs

La variable `voicingStyleSelectorInitialized` protège contre les attachements multiples. L'initialisation répétée après plusieurs imports ou appels à `showResults()` ne doit jamais ajouter plusieurs gestionnaires de clic.

Le conteneur `#analyzer-voicing-preview` persiste dans le DOM. Les boutons sont créés une seule fois. Les appels suivants à `renderVoicingStyleSelector()` sont sans effet.

---

## 5. Persistance

### 5.1 Clé

```
piano-jazz-chords.voicing-style
```

### 5.2 Règles

| Valeur stockée | Style effectif |
|----------------|----------------|
| Absente / `null` | `close` |
| `"close"` | `close` |
| `"simple"` | `simple` |
| Toute autre valeur | `close` (normalisée) |
| Erreur d'accès localStorage | `close` (silencieux) |

### 5.3 Comportement de `setVoicingStyle` en cas d'erreur d'écriture

La mise à jour en mémoire réussit **même si l'écriture persistante échoue** :

1. `currentVoicingStyle = normalizedStyle` (toujours, avant le `try`).
2. `localStorage.setItem(...)` dans un `try/catch`.
3. En cas d'exception : la préférence reste active pour la session courante, le preview continue de fonctionner normalement.
4. Aucune restauration de l'ancien style.
5. Aucune relecture immédiate de l'ancienne valeur persistée.
6. Aucun fallback Close.
7. Au prochain lancement seulement, l'absence d'une écriture réussie pourra faire revenir la valeur persistée précédente.

### 5.4 Non-persistance dans `.pjc.json`

La préférence de style de voicing est une **préférence d'interface**, pas une donnée projet. Elle n'est **jamais** ajoutée aux fichiers `.pjc.json`.

---

## 6. Mises à jour du preview

Le style sélectionné doit être pris en compte lors de :

1. Lecture et déplacement dans l'audio (`updatePlaybackPosition`)
2. Clic sur un segment (timeline)
3. Changement automatique de segment actif
4. Correction manuelle d'un accord (override)
5. Undo/redo d'une correction
6. Suppression d'une correction
7. Import d'un nouvel audio
8. Chargement d'un projet
9. Retour à l'écran d'import
10. Accord ou qualité non supportés

**Aucune information provenant de l'ancien style ne doit rester affichée après un changement.**

### 6.1 Mécanisme de cache

Dans `analyzer-tab.js`, étendre le cache existant :

```js
let lastRenderedVoicingChord = null;
let lastRenderedVoicingStyle = null;  // ← ajouté
```

Avant d'appeler `updateVoicingPreviewForChord()` :

```js
const currentStyle = getVoicingStyle();
if (effectiveChord !== lastRenderedVoicingChord || currentStyle !== lastRenderedVoicingStyle) {
  lastRenderedVoicingChord = effectiveChord;
  lastRenderedVoicingStyle = currentStyle;
  if (effectiveChord) {
    updateVoicingPreviewForChord(effectiveChord, { style: currentStyle });
  } else {
    clearVoicingTextPreview();
  }
}
```

**Règles du cache :**
- Même accord + même style → pas de recalcul redondant.
- Même accord + style différent → recalcul obligatoire.
- Accord corrigé + même style → recalcul obligatoire.
- Changement de segment → recalcul obligatoire.

Ne pas résoudre le problème en remettant systématiquement tous les caches à `null`.

### 6.2 Changement de style

Quand l'utilisateur change le style via le sélecteur, `selectVoicingStyle()` est appelé :

1. `normalizeVoicingStyle(rawStyle)` → `"close"` ou `"simple"`.
2. Si `newStyle === currentVoicingStyle` : mise à jour cosmétique du sélecteur uniquement, `return false`. **Aucun appel à `generateVoicing()`, aucune écriture `localStorage`, aucune modification du segment, aucun déplacement de lecture.**
3. Si `newStyle !== currentVoicingStyle` :
   - `setVoicingStyle(newStyle)` → mémoire + persistance.
   - `updateVoicingStyleSelector(newStyle)` → `aria-pressed` + classe `active`.
   - `rerenderActiveVoicing()` → invalide le cache (`lastRenderedVoicingChord = null`) puis appelle `updatePlaybackPosition()` avec le temps courant → **exactement un nouveau calcul** du segment actif.

### 6.3 Nettoyage du cache

Dans `showImportScreen()` et `showResults()` :

```js
lastRenderedVoicingChord = null;
lastRenderedVoicingStyle = null;
```

### 6.4 Règle métier `effectiveChord`

La règle métier qui détermine l'accord transmis au moteur est :

```js
const effectiveChord =
  segment.manualOverride ?? segment.detectedChord;
```

`getEffectiveChord(segment)` (dans `src/chord-engine/chord-display.js`) est l'encapsulation existante de cette règle et **doit rester la source unique utilisée par l'interface**. Aucun code de l'onglet Analyse ne doit reconstruire `effectiveChord` depuis le seul `detectedChord`.

**Modification d'un override :**
- L'accord détecté est présent.
- L'override existant est remplacé par un nouvel accord.
- Le moteur reçoit le nouvel override.
- Le style actif reste inchangé.

**Suppression d'un override :**
- L'override est retiré.
- Retour à `detectedChord`.
- Recalcul exactement une fois.
- Aucune ancienne note conservée.

**Slash chord manuel :**
- Override tel que `Fm7/D` ou `C/E`.
- Le symbole complet avec basse slash est transmis au moteur.
- Le changement Close/Simple ne supprime ni ne transforme la basse slash.

---

## 7. Erreurs

### 7.1 Résultat Simple invalide ou indisponible

Quand `generateVoicing(input, { style: 'simple' })` retourne `ok: false` :

- Conserver `currentVoicingStyle === 'simple'`.
- **Ne pas appeler Close.**
- **Ne pas modifier la préférence enregistrée.**
- Effacer entièrement les anciennes données :
  - Titre précédent.
  - LH.
  - RH.
  - Classes d'état.
  - Caches de rendu.
- Afficher l'état indisponible prévu (ex: `'Indisponible pour cet accord'`).
- Aucune note Close précédente ne doit rester visible.

### 7.2 Style stocké invalide

Un style stocké invalide (ex: `"jazz"`, `"gospel"`, `"rootless"`) est normalisé vers `"close"` **avant** l'appel moteur, dans `normalizeVoicingStyle()`.

### 7.3 Erreur localStorage en lecture

Une erreur d'accès à `localStorage` (navigateur privé, quota dépassé, etc.) ne doit pas casser le preview. Le style par défaut `"close"` est utilisé silencieusement.

### 7.4 Erreur localStorage en écriture

Voir section 5.3. La mise à jour en mémoire réussit toujours. L'échec d'écriture est silencieux.

### 7.5 Récupération après un échec Simple

Après un résultat Simple invalide :

```
generateVoicing(input, { style: "simple" }) → { ok: false }
```

le preview est nettoyé et les caches sont mis dans un état permettant le rendu suivant. Lorsqu'un futur segment possède un accord Simple valide :

- le moteur est de nouveau appelé avec `{ style: "simple" }` ;
- le nouveau voicing est affiché normalement ;
- le style reste `"simple"` ;
- aucune action manuelle de réinitialisation n'est nécessaire ;
- aucun fallback Close n'a lieu.

Le cache `lastRenderedVoicingChord` est mis à `null` lors du rendu indisponible, ce qui garantit que le prochain segment valide déclenchera un nouvel appel moteur.

---

## 8. Notation enharmonique

Conserver l'orthographe contextuelle déjà validée en Phase 1.5A.

Exemples :

| Accord | Notes affichées |
|--------|----------------|
| E7/D# | D#, G# |
| Fm7/D | Eb, Ab |
| Gm7b5 | Bb, Db |
| Amaj7 | C#, G# |

Le changement Close/Simple ne doit **pas** modifier la politique enharmonique. La fonction `resolveUseSharps()` et la déduction contextuelle `inferUseSharpsFromSymbol()` restent inchangées.

---

## 9. Tests obligatoires

### 9.1 Tests unitaires (dans `test-voicing-preview.js`)

| # | Test | Assertion |
|---|------|-----------|
| 1 | Close par défaut sans préférence | `getVoicingStyle()` → `"close"` |
| 2 | Préférence stockée "close" valide | `localStorage.getItem(key)` → `"close"` ; `getVoicingStyle()` → `"close"` ; bouton Close `aria-pressed="true"` ; bouton Simple `aria-pressed="false"` ; le rendu utilise `{ style: "close" }` ; aucune réécriture inutile dans `localStorage` pendant l'initialisation |
| 3 | Lecture d'une préférence Simple valide | `setVoicingStyle("simple")` → `getVoicingStyle()` → `"simple"` |
| 4 | Valeur persistée invalide → Close | `localStorage.setItem(key, "jazz")` → `getVoicingStyle()` → `"close"` |
| 5 | Erreur de localStorage en lecture | Simuler `localStorage` cassé → `getVoicingStyle()` → `"close"` |
| 6 | Changement Close → Simple | `setVoicingStyle("simple")` persiste et retourne `"simple"` |
| 7 | Changement Simple → Close | `setVoicingStyle("close")` persiste et retourne `"close"` |
| 8 | Recalcul immédiat du segment actif | Changement de style → `lastRenderedVoicingChord` reset → nouvel appel |
| 9 | Un seul appel moteur par recalcul | Vérifier que `generateVoicing` est appelé 1 fois par `updateVoicingPreviewForChord` |
| 10 | Correction manuelle | Override → preview mis à jour avec le style courant |
| 11 | Undo/redo | Undo → preview mis à jour avec le style courant |
| 12 | Slash chords | `C/E`, `E7/D#`, `Fm7/D` → preview correct dans les deux styles |
| 13 | Changement de segment | Navigation → preview mis à jour avec le style courant |
| 14 | Import d'un nouvel audio | Nouvelle analyse → preview réinitialisé avec le style courant |
| 15 | Qualité non supportée | `C13` → état `unsupported` dans les deux styles |
| 16 | Absence de segment actif | `clearVoicingTextPreview()` → conteneur masqué |
| 17 | Notation enharmonique | `E7/D#` → D#, G# (pas Eb, Ab) quel que soit le style |
| 18 | Aucune coloration du grand clavier | Aucune classe `.voicing-lh/rh/both/bass` dans le CSS |
| 19 | Aucune modification du petit clavier | `#analyzer-hero-keyboard` inchangé |
| 20 | Non-régression de la touche Espace | `Space` → toggle lecture, pas intercepté par le sélecteur |
| 21 | Écriture localStorage en erreur | `setItem()` lève une exception ; le style en mémoire change malgré tout ; le preview est recalculé ; aucun crash ; aucune relecture immédiate de l'ancienne valeur |
| 22 | Clic sur le style déjà actif (Close) | Style actuel `close`, clic sur Close ; zéro appel supplémentaire à `generateVoicing()` ; zéro écriture supplémentaire |
| 23 | Clic sur le style déjà actif (Simple) | Style actuel `simple`, clic sur Simple ; zéro appel supplémentaire à `generateVoicing()` ; zéro écriture supplémentaire |
| 24 | Même résultat pour le titre et les notes | Instrumenter un seul appel moteur ; retourner un résultat identifiable ; vérifier que le titre, LH et RH proviennent du même objet `voicingResult` ; aucun second appel moteur |
| 25 | Changement de style avec le même accord | Accord inchangé ; passage Close → Simple ; exactement un appel moteur ; résultat Simple affiché ; passage Simple → Close également testé |
| 26 | Suppression d'une correction manuelle | Segment avec `manualOverride` ; suppression de l'override ; retour au `detectedChord` ; recalcul avec le style toujours actif ; aucune ancienne note conservée |
| 27 | Échec Simple sans fallback Close | Moteur Simple retourne `ok: false` ; aucun second appel avec `style: "close"` ; préférence Simple conservée ; preview nettoyé et indisponible |
| 28 | Chargement d'un projet | Préférence d'interface conservée ; elle n'est pas lue depuis `.pjc.json` ; segment actif recalculé une seule fois ; aucun écouteur dupliqué |
| 29 | Activation clavier native (Espace) | Focus sur le bouton Simple ; appui Espace ; `stopPropagation()` appelé, pas `preventDefault()` ; le navigateur produit le `click` natif ; exactement un changement de style ; exactement un appel moteur ; aucun déclenchement du raccourci global de lecture |
| 30 | Activation clavier native (Entrée) | Focus sur le bouton Close ; appui Entrée ; `stopPropagation()` appelé, pas `preventDefault()` ; le navigateur produit le `click` natif ; exactement un changement de style ; exactement un appel moteur ; aucun double appel causé par `keydown` puis `click` |
| 31 | Récupération après un échec Simple | Segment A → résultat Simple invalide ; titre/LH/RH nettoyés ; passage au segment B valide ; exactement un nouvel appel Simple ; voicing du segment B correctement affiché ; style toujours `"simple"` ; aucun fallback Close |

### 9.2 Cas runtime prévus

| Symbole | Style Close (LH / RH) | Style Simple (LH / RH) |
|---------|----------------------|------------------------|
| C | C3 / C4 E4 G4 | C2 C3 / C4 E4 G4 |
| C/E | E2 / C4 E4 G4 | E2 / C4 E4 G4 |
| C7 | C3 / E4 G4 Bb4 | C3 / C4 E4 Bb4 |
| Amaj7 | A2 / G#3 A3 C#4 E4 | A2 / A3 C#4 G#4 |
| Gm7b5 | G2 / Bb3 Db4 F4 G4 | G2 / Bb3 Db4 F4 |
| C#m7b5/D | D2 / C#3 E3 G3 B3 | D2 / C#3 E3 G3 B3 |
| E7/D# | D#2 / G#3 B3 D4 E4 | D#2 / E3 G#3 B3 D4 |
| Fm7/D | D2 / C4 Eb4 F4 Ab4 | D2 / F3 Ab3 C4 Eb4 |

---

## 10. Fichiers prévus

### 10.1 Modifiés

| Fichier | Modifications |
|---------|--------------|
| `src/ui/voicing-preview.js` | Ajout de `currentVoicingStyle`, `voicingStyleInitialized`, `voicingStyleSelectorInitialized`, `normalizeVoicingStyle()`, `getVoicingStyle()`, `setVoicingStyle()`, `selectVoicingStyle()`, `updateVoicingStyleSelector()`, `renderVoicingStyleSelector()` ; modification de `buildVoicingTextModel()` pour accepter `style` et adapter le titre ; modification de `updateVoicingPreviewForChord()` pour accepter et transmettre `style` à `generateVoicing()` |
| `src/ui/analyzer-tab.js` | Import de `getVoicingStyle` ; extension du cache avec `lastRenderedVoicingStyle` ; appel de `updateVoicingPreviewForChord()` avec `{ style }` ; initialisation du sélecteur de style dans `showResults()` ; reset du cache style dans `showImportScreen()` |
| `src/index.html` | Ajout d'un conteneur pour le sélecteur de style dans `#analyzer-voicing-preview` (ou le sélecteur est injecté dynamiquement) |
| `src/style.css` | Styles pour `.voicing-style-selector`, `.voicing-style-btn`, `.voicing-style-btn.active` |
| `src/ui/test-voicing-preview.js` | Ajout des 31 tests Phase 2B |

### 10.2 Non modifiés

- `src/voicing-engine/**` — aucun fichier touché
- `src/analyzer/**` — détection audio inchangée
- `src/audio/**` — lecture audio inchangée
- `src/chord-engine/**` — définitions d'accords inchangées
- `src/voicing-engine/styles/close.js` — inchangé
- `src/voicing-engine/styles/simple.js` — inchangé
- `src/voicing-engine/generate-voicing.js` — déjà prêt (dispatch style existant)
- `src/ui/mini-keyboard.js` — inchangé
- `src/ui/chord-editor.js` — inchangé
- `electron/**` — aucun fichier touché
- `src/main.js` — inchangé
- Exports MIDI/JSON/texte — inchangés
- Statistiques — inchangées

---

## 11. Périmètre interdit

Ne pas :

- modifier `src/voicing-engine/` ;
- modifier `electron/**` ;
- modifier `src/main.js` ;
- modifier le petit clavier du Hero ;
- ajouter Jazz ;
- ajouter Gospel ;
- ajouter rootless ;
- ajouter voice leading ;
- colorer le grand clavier ;
- créer un mini-clavier ;
- modifier les exports ;
- enregistrer le style dans `.pjc.json` ;
- modifier la détection audio ;
- modifier HMM/Viterbi ;
- modifier la timeline ;
- créer un commit.

---

## 12. Critères de réussite

1. Le sélecteur Close/Simple est visible dans le panneau de preview.
2. Close est sélectionné par défaut au premier lancement.
3. Le changement Close → Simple met à jour immédiatement le preview textuel.
4. Le changement Simple → Close restaure le preview Close.
5. La préférence est persistée dans `localStorage` et restaurée au rechargement.
6. Une valeur invalide dans `localStorage` est normalisée vers Close.
7. Une erreur `localStorage` en lecture ne casse pas le preview.
8. Une erreur `localStorage` en écriture ne casse pas le preview et ne restaure pas l'ancien style.
9. Un seul appel à `generateVoicing()` par recalcul de segment.
10. Les corrections manuelles, undo/redo, changements de segment déclenchent le recalcul.
11. L'import d'un nouvel audio réinitialise correctement le preview.
12. Les qualités non supportées affichent l'état indisponible sans basculer de style.
13. La notation enharmonique contextuelle est préservée (E7/D# → D#, G#).
14. Aucune classe `.voicing-lh/rh/both/bass` n'est ajoutée au CSS.
15. Le petit clavier Hero et le grand clavier restent inchangés.
16. La touche Espace continue de fonctionner pour play/pause.
17. Cliquer sur le style déjà actif ne provoque aucun recalcul ni écriture.
18. En cas d'échec Simple, le preview est nettoyé sans fallback Close.
19. Le titre, LH et RH proviennent du même appel `generateVoicing()`.
20. Aucun écouteur dupliqué après plusieurs imports.
21. Tous les tests Phase 0, Phase 1, Phase 2A, Phase 1.5A passent sans régression.
22. `npm run build` OK.

---

## 13. Protection Git

- Commit atomique : uniquement les fichiers de la Phase 2B.
- Message : `feat: add Close/Simple voicing style selector (Phase 2B)`.
- Aucun fichier étranger inclus.
- `git add` explicite, jamais `git add .` ni `git add -A`.

---

TWO_HAND_VOICING_ENGINE_V1_PHASE2B_UI_PLAN_READY
