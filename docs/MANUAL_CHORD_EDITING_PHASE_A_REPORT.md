# Manual Chord Editing — Phase A : Rapport

> **État** : VALIDÉ  
> **Date** : 2026-07-13  
> **Phase** : A — Correction en mémoire du symbole d'accord (fondamentale, qualité, basse)

---

## Architecture réellement utilisée

### Principe

```
detected_chord  (immuable — segment.chord)
manual_override (null ou { root, quality, bass })
effective_chord = manualOverride ?? detectedChord
```

Le moteur d'analyse n'est jamais modifié. Les overrides sont une couche produit située après l'analyse, dans l'objet `currentAnalysis` en mémoire.

### Flux de données

```
audio-processor.py → main.js → audio-analyzer.js → analyzer-tab.js
                                                        │
                                                    enrichSegments()
                                                    (ajoute segmentId, manualOverride)
                                                        │
                                                    renderTimeline()
                                                    (utilise getEffectiveChord)
                                                        │
                                                    double-clic → ChordEditor.open()
                                                        │
                                                    Enregistrer → normalizeOverride → pushUndo
                                                        │
                                                    rerenderTimeline()
```

---

## Fichiers créés et modifiés

### Créés

| Fichier | Rôle |
|---------|------|
| `src/ui/chord-editor.js` | Composant d'édition (panneau, dropdowns, preview, save/cancel/reset) |
| `src/ui/test-chord-editor.js` | 44 tests unitaires pour les fonctions pures |

### Modifiés

| Fichier | Changement |
|---------|------------|
| `src/ui/analyzer-tab.js` | Import du ChordEditor ; `enrichSegments()` pour ajouter `segmentId` + `manualOverride` ; `getEffectiveChord()` ; `renderTimeline()` utilise `effectiveChord` + `manual-override` + `✏` + double-clic/Enter ; `renderHeroChord()` utilise `effectiveChord` ; undo/redo + `Ctrl+Z` / `Ctrl+Shift+Z` ; `resetUndoRedo()` |
| `src/style.css` | Ajout des classes `.chord-editor-*` (overlay, panel, select, preview, buttons) et `.manual-override` / `.manual-override-icon` |
| `src/analyzer/midi-exporter.js` | Ajout d'un commentaire `// TODO Phase D` pour le remplacement de `chord.chord` par `getEffectiveChord()` |

### Non modifiés

```
electron/audio-processor.py         — GELÉ (lecture seule)
electron/harmony_engine/            — GELÉ
src/analyzer/audio-analyzer.js      — inchangé
src/chord-engine/chord-defs.js      — inchangé
src/chord-engine/naming.js          — inchangé
src/chord-engine/intervals.js       — inchangé (NOTE_NAMES utilisé via chord-editor.js)
src/analyzer/harmonic-utils.js      — inchangé
src/index.html                      — inchangé
```

---

## Stratégie de segment_id

### Audit

Aucun identifiant stable préexistant dans les segments. Les segments sont des dictionnaires sans `id`, référencés uniquement par leur index dans `analysis.chords[]`.

### Implémentation

```js
function makeSegmentId(seg) {
  const str = `${seg.startTime}|${seg.endTime}|${seg.chord}`;
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const chr = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + chr;
    hash |= 0;
  }
  return `seg_${Math.abs(hash).toString(36)}`;
}
```

**Propriétés** :
- **Déterministe** : mêmes `startTime`, `endTime`, `chord` → même `segmentId`
- **Ne dépend pas** : de l'index, de `startTime` seul, du texte du symbole seul, de la position visuelle
- **Stable pendant la session** : survit aux rerenders, zoom, scroll, sélection, modification du symbole
- **Assigné au moment du rendu** dans `enrichSegments()`, appelé par `showResults()`

Pour Phase B (persistance), `segmentId` sera la clé de liaison entre les overrides stockés et les segments après réanalyse.

---

## Modèle de données

### Segment enrichi

```js
{
  // Champs existants (inchangés)
  startTime: 1.234,
  endTime: 3.567,
  chord: "Cmaj7",           // DETECTED — jamais modifié
  confidence: 0.85,
  // ...

  // Nouveaux champs
  segmentId: "seg_a1b2c3d4", // déterministe, ajouté par enrichSegments()
  manualOverride: null,       // ou { root: 9, quality: "m7", bass: null }
}
```

### `normalizeOverride(segment, override)`

Retourne `null` si l'override est identique à la détection (même rootPc, même qualité, même basse), ou l'override normalisé sinon. Cela évite un faux statut "corrigé manuellement" pour une correction qui ne change rien.

### `getEffectiveChord(segment)`

Retourne la chaîne de caractères du symbole effectif.

---

## Flux UI

### Ouverture de l'éditeur

| Déclencheur | Comportement |
|-------------|--------------|
| **Double-clic** sur un segment | Ouvre l'éditeur |
| **Touche Entrée** sur un segment focalisé | Ouvre l'éditeur |
| **Clic simple** | Seek + play (comportement existant inchangé) |

### Panneau d'édition

Overlay semi-transparent positionné dans `#analyzer-results` (absolu, centré).

```
┌──────────────────────────────────┐
│  Éditer l'accord                 │
│──────────────────────────────────│
│  Détecté : Cmaj7                 │
│  Fondamentale : [  C ▼ ]         │
│  Qualité :      [ Maj7 ▼ ]       │
│  Basse :        [ (aucune) ▼ ]   │
│  Aperçu : Cmaj7                  │
│──────────────────────────────────│
│ [Revenir à la dét.] [Annuler] [Enr.] │
└──────────────────────────────────┘
```

### Fermeture

| Déclencheur | Comportement |
|-------------|--------------|
| **Échap** | Ferme sans enregistrer |
| **Clic hors overlay** | Ferme sans enregistrer |
| **Annuler** | Ferme sans enregistrer |
| **Enregistrer** | Sauvegarde l'override, ferme, rafraîchit la timeline |
| **Revenir à la détection** | Supprime l'override (→ `null`), ferme, rafraîchit |

### Vocabulaire V1

**12 fondamentales** : C, C#, D, D#, E, F, F#, G, G#, A, A#, B (dièses uniquement, cohérent avec `intervals.js`)

**10 qualités** :

| Symbole | Label | Source CHORD_DEFINITIONS |
|---------|-------|--------------------------|
| `""` | Majeur | `{ symbol: '', intervals: [0,4,7] }` |
| `m` | mineur | `{ symbol: 'm', intervals: [0,3,7] }` |
| `7` | 7 (dominante) | `{ symbol: '7', intervals: [0,4,7,10] }` |
| `maj7` | Maj7 | `{ symbol: 'maj7', intervals: [0,4,7,11] }` |
| `m7` | mineur 7 | `{ symbol: 'm7', intervals: [0,3,7,10] }` |
| `m7b5` | mineur 7 b5 | `{ symbol: 'm7b5', intervals: [0,3,6,10] }` |
| `dim` | diminué | `{ symbol: 'dim', intervals: [0,3,6] }` |
| `aug` | augmenté | `{ symbol: 'aug', intervals: [0,4,8] }` |
| `sus2` | sus2 | `{ symbol: 'sus2', intervals: [0,2,7] }` |
| `sus4` | sus4 | `{ symbol: 'sus4', intervals: [0,5,7] }` |

### Indication visuelle

- **Icône crayon** (✏) dans le coin supérieur droit du segment
- **Bordure ambre** (`border-amber-500`, classe `.manual-override`)
- **Tooltip** enrichi : `"Corrigé manuellement — Cmaj7 → Am7"`
- **Pas de modification** de la couleur harmonique

---

## Fonctionnement undo/redo

### Pile de commandes

```js
undoStack = [];    // max 50 entrées
redoStack = [];
```

### Structure d'une commande

```js
{
  segmentIndex: 3,        // index dans analysis.chords[]
  oldState: null,          // manualOverride avant l'action
  newState: { root, quality, bass }  // manualOverride après l'action
}
```

### Comportement

| Action | undoStack | redoStack |
|--------|-----------|-----------|
| Appliquer un override | `push { old, new }` | vidé |
| Undo (`Ctrl+Z`) | `pop` → restore old → `push` sur redoStack | reçoit la commande |
| Redo (`Ctrl+Shift+Z`) | `pop` de redoStack → restore new → `push` sur undoStack | reçoit la commande |

### Raccourcis

- **`Ctrl+Z`** : undo (désactivé si le focus est dans un `<input>`, `<select>` ou `<textarea>`)
- **`Ctrl+Shift+Z`** : redo

---

## Tests exécutés

### Tests Phase A (nouveau) : `src/ui/test-chord-editor.js` — 44 tests, 100% réussis

| Catégorie | Tests |
|-----------|-------|
| `makeSegmentId` | Déterministe, différentiel, préfixe |
| `parseChordSymbol` | Majeur, mineur, 7, Maj7, m7b5, slash, dièse, bémol, N, vide, null |
| `formatEffectiveChord` | Majeur, mineur, 7, Maj7, m7b5, slash, slash avec qualité, basse=0 |
| `getEffectiveChord` | Sans override, avec override, avec basse, immutabilité |
| `normalizeOverride` | Identique→null, différent, basse ajoutée/supprimée, null→null, enharmonique |
| `NOTE_NAMES` | 12 noms, dièses seulement |
| `QUALITY_OPTIONS` | 10 qualités V1 |
| Cas particuliers | Racine modifiée, qualité modifiée, ajout/suppression basse, identique→null, m7b5 notes, sus4, N, cycle null→override→null, symbole inconnu |

### Tests de régression existants — inchangés

| Fichier | Résultat |
|---------|----------|
| `src/chord-engine/test-chords.js` | 19/19 ✅ |
| `src/chord-engine/test-regression-part3.js` | 3/3 ✅ |
| `src/analyzer/test-regression-part1.js` | 3/3 ✅ |

---

## Limites restantes

1. **Pas de persistance** : les overrides sont perdus à la fermeture du projet (Phase B)
2. **Pas d'édition temporelle** : startTime/endTime ne peuvent pas être modifiés (Phase C)
3. **Export MIDI** : utilise encore `chord.chord` (Phase D) — TODO ajouté dans le code
4. **Qualités limitées** : seules 10 qualités V1 supportées (les symboles avancés comme `maj9`, `13`, `dim7` ne sont pas dans les dropdowns)
5. **Orthographe dièse uniquement** : les overrides utilisent les dièses (cohérent avec `intervals.js`)
6. **Pas de réassociation après réanalyse** : les overrides ne survivent pas à une nouvelle analyse (Phase B)
7. **Pas de validation côté serveur** : toute la logique est côté client

---

## Éléments reportés aux phases B, C, D

### Phase B — Persistance
- Format de fichier `.pjc` (JSON latéral)
- `saveOverrides(analysis, sourcePath)` → écrit les overrides
- `loadOverrides(sourcePath)` → appariement par `segmentId` (+ fallback `startTime`)
- Sauvegarde automatique après chaque Enregistrer
- Chargement à l'import du même fichier audio

### Phase C — Édition temporelle
- Champs `startTime` / `endTime` dans l'éditeur
- `validateTimeEdit()` avec contraintes de non-chevauchement
- Propagation des temps modifiés à l'export MIDI

### Phase D — Intégration complète aux exports
- `midi-exporter.js` : remplacer `chord.chord` par `getEffectiveChord(chord)`
- Export JSON incluant les overrides
- Statistiques utilisant les données effectives
- Documentation utilisateur

---

## Fichiers protégés (non modifiés)

| Fichier | Raison |
|---------|--------|
| `electron/audio-processor.py` | Moteur de détection — GELÉ |
| `electron/harmony_engine/` | Moteur structuré — GELÉ |
| `src/analyzer/audio-analyzer.js` | Retourne la détection originale — inchangé |
| `src/chord-engine/` | Tables canoniques — inchangées |
| `electron/main.js` | Pas de modification nécessaire en Phase A |

---

## Phase A.6 — Corrections runtime

### Bug 1 : Voicing obsolète après correction

**Cause** : `chordNotes()` dans `analyzer-tab.js` ne gérait pas les slash chords. Pour `Fm7/D`, le suffixe extrait était `"m7/D"` (slash inclus), qui ne correspondait à aucun symbole dans `CHORD_DEFINITIONS`. La fonction retombait sur l'intervalle par défaut `[0, 4, 7]` (triade majeure), produisant `F – A – C` au lieu de `F – Ab – C – Eb`.

**Fix** : `chordNotes()` extrait désormais la partie avant le `/` avant la recherche d'intervalles, et ajoute la basse dans le tableau retourné.

**Fix structurel** : Nouvelle fonction `deriveChordDisplay(effectiveChord)` dans `chord-editor.js` qui sert de source unique de vérité. Elle retourne `{ symbol, rootPc, quality, bassPc, chordTonePcs, chordToneNames, bassName, allPcs, allNames }`. `renderHeroChord()` utilise cette fonction, et affiche séparément les notes de l'accord et la basse slash.

### Bug 2 : Timeline compressée et chevauchement

**Causes** :
- `BASE_PIXELS_PER_SECOND` trop faible (64) rendant les segments trop étroits
- `estTextWidth` élargissait les blocs au-delà de leur durée, provoquant des chevauchements visuels
- Plage de zoom limitée à 400%

**Fixes** :
- `BASE_PIXELS_PER_SECOND` : 64 → 80
- `MIN_BLOCK_WIDTH` : 96 → 100
- `BLOCK_GAP` : 3 → 4
- Largeur du bloc : utilise désormais uniquement `timeWidth` (durée × PPS) avec `minWidth: MIN_BLOCK_WIDTH`. Plus d'élargissement par `estTextWidth`.
- CSS : `white-space: nowrap; overflow: hidden; text-overflow: ellipsis;` garanti pour tous les textes de segments
- L'icône crayon a `max-width: calc(100% - 18px)` pour ne pas être masquée par l'ellipsis
- Zoom : plage étendue à `0.25 – 8.0` (25% – 800%)

### NOTE_NAMES

Déplacé vers `intervals.js` (canonique) avec `export const NOTE_NAMES`, réexporté par `chord-editor.js`. Plus de tableau local.

### Tests ajoutés

16 nouveaux tests pour `deriveChordDisplay` : Fmaj7, Fm7/D, Gm7b5, Fsus4, C, Am, C/E, Dm7/F, G7/B, retour à détection, Fsus4, vide/null.

### Fichiers modifiés

| Fichier | Changement |
|---------|------------|
| `src/chord-engine/intervals.js` | `NOTE_NAMES` passé de `const` à `export const` |
| `src/ui/chord-editor.js` | Import de `NOTE_NAMES` depuis `intervals.js` ; ajout de `deriveChordDisplay()` ; réexport de `NOTE_NAMES` |
| `src/ui/analyzer-tab.js` | `chordNotes()` gère les slash chords ; `renderHeroChord()` utilise `deriveChordDisplay()` ; `BASE_PIXELS_PER_SECOND` 64→80 ; plus d'`estTextWidth` ; import de `deriveChordDisplay` |
| `src/index.html` | Zoom `0.5–4.0` → `0.25–8.0` |
| `src/style.css` | Règles `white-space/overflow/text-overflow` pour les blocs timeline ; `.manual-override` texte limité à `calc(100% - 18px)` |
| `src/ui/test-chord-editor.js` | 16 nouveaux tests `deriveChordDisplay` ; attentes mises à jour pour NOTE_NAMES (dièses) |

### Fichiers protégés (non modifiés)

```
electron/audio-processor.py         — GELÉ
electron/harmony_engine/            — GELÉ
src/analyzer/audio-analyzer.js      — inchangé
src/analyzer/midi-exporter.js       — inchangé (TODO Phase D inchangé)
src/chord-engine/chord-defs.js      — inchangé
src/chord-engine/naming.js          — inchangé
src/analyzer/harmonic-utils.js      — inchangé
```

### Tests — 66/66 + 25/25 régressions

```
Tests Phase A (chord-editor)  : 66 ✅
test-chords.js                : 19 ✅
test-regression-part3.js      :  3 ✅
test-regression-part1.js      :  3 ✅
```

---

## Phase A.7 — Dernier ajustement de lisibilité

### Problème

À 25 % de zoom, les segments très courts devenaient des cases vides illisibles. À 100 %, certains textes restaient tronqués sans indication de la valeur réelle. Le défilement automatique pendant la lecture recentrait brutalement à chaque changement de segment.

### Corrections

| Changement | Détail |
|------------|--------|
| **Zoom initial forcé à 100 %** | `resetZoom()` dans `showResults()` remet le slider à 1.0 et `timelineZoom` à 1.0 après chaque analyse. 25 % reste accessible manuellement. |
| **Blocs micro** | Les blocs de largeur `< 24px` reçoivent la classe `.timeline-block-micro` qui masque le texte et l'icône crayon. Le marqueur visuel (bordure + fond) reste visible. Le symbole complet est toujours dans `title`/tooltip. |
| **Largeur naturelle** | `MIN_BLOCK_WIDTH` réduit à 4 (simple trait vertical), `timeWidth` n'est plus borné artificiellement. `minWidth` supprimé du CSS inline. |
| **Auto-scroll** | Le défilement ne se déclenche que quand le segment actif approche à moins de 120 px du bord du viewport. Pas de recentrage intempestif. |
| **ScrollIntoView manuel** | Le clic sur un segment appelle `block.scrollIntoView({ inline: 'center' })` en plus du seek existant. |
| **Scrollbar** | `::-webkit-scrollbar` personnalisé (8px, thumb #52525b, track #27272a) + `scrollbar-color` Firefox. |

### Fichiers modifiés

| Fichier | Changement |
|---------|------------|
| `src/ui/analyzer-tab.js` | `resetZoom()` ajouté et appelé dans `showResults()` ; `MIN_BLOCK_WIDTH` 100 → 4 ; `timeWidth` sans borne inférieure artificielle ; classe `.timeline-block-micro` pour `timeWidth < 24` ; `scrollIntoView` sur clic ; auto-scroll conditionnel (marge 120px) |
| `src/style.css` | `.timeline-block-micro` masque texte et icône ; scrollbar webkit track/thumb ; `scrollbar-color` Firefox |
| `src/ui/test-chord-editor.js` | 6 nouveaux tests timeline : width calculus, micro threshold, adequate width, tooltip full chord, overridden tooltip, effectiveChord after zoom |

---

MANUAL_CHORD_EDITING_PHASE_A_FINAL_VALIDATED
