# Manual Chord Editing — Plan Architectural

> **État** : PLAN — à valider avant tout code  
> **Projet** : Piano Jazz Chords  
> **Contexte** : `structured_harmony_v1` archivé et gelé. Aucun moteur de détection modifié.  
> **Principe** : Couche produit située *après* l'analyse. Les overrides n'écrasent jamais la détection originale.

---

## 1. État actuel de la timeline et des structures

### 1.1 Flux de données actuel

```
audio-processor.py (JSON stdout)
    │  { chords: [{ startTime, endTime, chord, confidence, ... }] }
    ▼
electron/main.js
    │  ajoute wavPath, usedPianoStem, bassSegments
    ▼
src/analyzer/audio-analyzer.js  (TemplateAudioAnalyzer.analyze)
    │  normalise, ajoute keyCandidates
    ▼
src/ui/analyzer-tab.js
    │  renderTimeline(analysis.chords, analysis.duration)
    │  renderHeroChord(chord) via chord.chord
    ▼
MIDI export : midi-exporter.js → chordNameToMidiNotes(chord.chord)
```

### 1.2 Modèle du segment actuel (`analysis.chords[i]`)

```js
{
  startTime: 1.234,       // float secondes
  endTime: 3.567,         // float secondes
  chord: "Cmaj7",         // string, symbole complet
  structuralChord: "C",   // string, version simplifiée
  confidence: 0.85,       // float 0-1
  analysis: {},           // dict réservé
  techniques: [],
  suggestions: [],
  reharmonizations: [],
  voiceLeading: {}
}
```

Le segment n'a **pas d'identifiant stable** — il est référencé uniquement par son index dans le tableau `analysis.chords`.

### 1.3 Composants consommateurs

| Composant | Fichier | Utilise |
|-----------|---------|---------|
| Timeline (blocs) | `analyzer-tab.js:205-243` | `chord.chord`, `chord.startTime`, `chord.endTime` |
| Hero chord | `analyzer-tab.js:246-271` | `chord.chord` → `chordNotes()` → `miniKeyboardForNotes()` |
| Export MIDI | `midi-exporter.js:108-126` | `chord.chord` → `chordNameToMidiNotes()` |
| Playback seek | `analyzer-tab.js:235-240` | `chord.startTime` (clic sur segment) |
| Auto-scroll | `analyzer-tab.js:309-316` | index de `analysis.chords` |

### 1.4 Pas de persistance projet

Aucun format de fichier projet n'existe. Les seules persistances sont :
- `localStorage` (thème, config IA, sessions metadata)
- `~/PianoJazzChords/Sessions/<id>/` (sessions MIDI enregistrées)
- `~/PianoJazzChords/Studio/<trackId>/` (tracks importés)

Les analyses de l'onglet Studio/analyse ne sont **pas persistées** entre les sessions — elles vivent uniquement en mémoire.

---

## 2. Architecture proposée

### 2.1 Principe de séparation des couches

```
Moteur de détection (gelé)           → detected_chord uniquement
Couche d'édition manuelle (NOUVEAU)  → manual_override → effective_chord
Couche d'affichage (modifié)         → effective_chord partout sauf indication "détecté"
```

### 2.2 Segment enrichi — modèle de données

Chaque segment de `analysis.chords[]` est enrichi d'un champ `manualOverride` :

```js
{
  // Champs existants (inchangés)
  startTime: 1.234,
  endTime: 3.567,
  chord: "Cmaj7",           // DETECTED — ne jamais modifier
  structuralChord: "C",
  confidence: 0.85,
  analysis: {},
  techniques: [],
  suggestions: [],
  reharmonizations: [],
  voiceLeading: {},

  // NOUVEAUX CHAMPS
  segmentId: "seg_a1b2c3d4",  // identifiant stable, généré une fois
  manualOverride: null,         // ou { root, quality, bass, editedAt, source }
}
```

**`segmentId`** : chaîne hex aléatoire de 8 caractères, générée côté JS au premier rendu de la timeline.  
**Stable** : si on réanalyse le même fichier, les IDs sont regénérés — les overrides d'une analyse précédente ne s'appliquent pas automatiquement.

### 2.3 Calcul de `effective_chord`

```js
function getEffectiveChord(segment) {
  if (segment.manualOverride) {
    const rootName = NOTE_NAMES[segment.manualOverride.root];
    const quality = segment.manualOverride.quality;
    const bassName = segment.manualOverride.bass != null
      ? NOTE_NAMES[segment.manualOverride.bass]
      : null;
    const symbol = quality === '' ? rootName : `${rootName}${quality}`;
    return bassName ? `${symbol}/${bassName}` : symbol;
  }
  return segment.chord; // detected
}
```

### 2.4 Où vivent les données

Les overrides sont stockés **dans l'objet analysis en mémoire** (sur `analysis.chords[i].manualOverride`).  
Pas de store global — `currentAnalysis` est la source unique.

Pour la persistance (Phase B), on extrait les overrides dans un objet latéral.

---

## 3. Flux UI

### 3.1 Ouverture de l'éditeur

**Déclencheur** : double-clic sur un segment de la timeline (compatible avec le clic simple existant qui seek/play).

Alternatives écartées :
- Clic simple : réservé au seek/play (existant, attendu par l'utilisateur).
- Clic droit (context menu) : non standard dans l'UI actuelle.

### 3.2 Panneau d'édition

Un overlay compact semi-transparent, positionné au-dessus ou à côté du segment cliqué.  
Utilise le même style que les overlays existants (`.analyzer-toast` comme référence de design).

**Contenu du panneau** :

```
┌──────────────────────────────────────────┐
│  Éditer l'accord                         │
│                                          │
│  Détecté : Cmaj7                         │
│  ─────────────────────────────           │
│  Fondamentale : [ C ▼ ]   (dropdown 12)  │
│  Qualité :      [ maj7 ▼ ] (dropdown)    │
│  Basse :        [ (aucune) ▼ ] optionnel │
│                                          │
│  Aperçu : Cmaj7                          │
│                                          │
│  [Revenir à la détection] [Annuler] [Enr.]│
└──────────────────────────────────────────┘
```

**Comportement** :
- Les dropdowns sont des `<select>` simples (pas de custom combobox en V1).
- "Revenir à la détection" : vide `manualOverride`, désactive le bouton Enregistrer.
- "Annuler" : ferme le panneau sans changement, restore l'état précédent.
- "Enregistrer" : écrit `manualOverride` sur le segment, ferme le panneau, rafraîchit la timeline.

### 3.3 Vocabulaire V1

**Fondamentales** (12, cohérentes avec l'affichage actuel) :

```
C  C#  D  D#  E  F  F#  G  G#  A  A#  B
```

Pas d'orthographe bémol en V1 — uniquement dièse, cohérent avec `intervals.js` (`NOTE_NAMES`).

**Qualités** (celles déjà affichables) :

| Symbole | Label |
|---------|-------|
| `""` (vide) | Majeur |
| `m` | mineur |
| `7` | 7 (dominante) |
| `maj7` | Maj7 |
| `m7` | mineur 7 |
| `m7b5` | mineur 7 b5 |
| `dim` | diminué |
| `aug` | augmenté |
| `sus2` | sus2 |
| `sus4` | sus4 |

**Basse** : dropdown avec les 12 notes + option "(aucune)".  
Quand une basse est sélectionnée, le symbole final affiche un slash chord.

### 3.4 Indication visuelle dans la timeline

Chaque segment avec `manualOverride` non null reçoit :

1. Une **icône crayon** (✏) dans le coin supérieur droit du bloc
2. Une **classe CSS** `.manual-override` sur le bloc (contour discret, par ex. `border-amber-500`)
3. **Infobulle** (`title`) enrichie : `"Corrigé manuellement — Gm7 → Gm7/Bb"`

Pas de changement de couleur harmonique.

### 3.5 Mise à jour du rendu

`renderTimeline()` modifié pour :

```js
function renderTimeline(chords, duration) {
  // ... existant ...
  chords.forEach((chord, index) => {
    const effectiveChord = getEffectiveChord(chord);
    const displayLabel = effectiveChord;
    
    // Affiche effectiveChord, pas chord.chord
    block.title = buildTitle(chord, effectiveChord);
    
    // Ajoute indicateur si override
    if (chord.manualOverride) {
      block.classList.add('manual-override');
      block.innerHTML = `
        <span class="truncate max-w-full px-2 font-bold">${escapeHtml(displayLabel)}</span>
        <span class="manual-override-icon">✏</span>
      `;
    }
  });
}
```

### 3.6 Hero chord

`renderHeroChord()` utilise `effectiveChord` au lieu de `chord.chord` pour l'affichage et pour `chordNotes()`.

---

## 4. Stratégie de persistance

### 4.1 Pendant la session

Tout est en mémoire dans `currentAnalysis.chords[i].manualOverride`.  
Aucune sérialisation nécessaire.

### 4.2 Format latéral JSON (projet)

Créer un format de fichier projet `.pjc` (Piano Jazz Chords) :

```json
{
  "version": 1,
  "sourceFile": "morceau.mp3",
  "analysisTimestamp": "2026-07-13T10:30:00Z",
  "overrides": [
    {
      "segmentIndex": 3,
      "segmentId": "seg_a1b2c3d4",
      "startTime": 1.234,
      "manualOverride": {
        "root": 0,
        "quality": "maj7",
        "bass": 4,
        "editedAt": "2026-07-13T10:35:00Z",
        "source": "user"
      }
    }
  ]
}
```

**Pourquoi index + segmentId + startTime** : chaque override stocke l'index du segment au moment de la création, son ID stable, et son startTime. Cela permet de réassocier les overrides après une réanalyse (Phase D).

### 4.3 Sauvegarde automatique

À chaque Enregistrer d'une correction, le fichier `.pjc` est mis à jour automatiquement dans le même répertoire que le fichier audio source.

### 4.4 Chargement au retour

Quand on importe le même fichier audio, `analyzer-tab.js` cherche un fichier `.pjc` au même endroit. Si trouvé, il tente d'apparier les overrides par `startTime` (tolérance ±0.1s) et les applique.

### 4.5 Non-régression

- Jamais d'écriture dans le fichier audio source.
- Les overrides ne sont pas stockés dans les sessions MIDI (`~/PianoJazzChords/Sessions/`).
- Export MIDI : on utilise `getEffectiveChord()` — pas de modification du fichier source.

---

## 5. Propagation de `effective_chord`

| Point d'entrée | Utilise actuellement | Après modification |
|----------------|---------------------|-------------------|
| Timeline (label) | `chord.chord` | `getEffectiveChord(chord)` |
| Timeline (tooltip) | `chord.chord` + times | ajoute `"Détecté : chord.chord"` si override |
| Hero chord | `chord.chord` | `getEffectiveChord(chord)` |
| Mini clavier | `chordNotes(chord.chord)` | `chordNotes(getEffectiveChord(chord))` |
| Export MIDI | `chord.chord` | `getEffectiveChord(chord)` |
| Export texte/JSON | N/A | `getEffectiveChord(chord)` |
| Statistiques | `chord.chord` | `getEffectiveChord(chord)` |
| Futurs voicings | N/A | `getEffectiveChord(chord)` |

Le moteur d'analyse (`audio-processor.py`, `audio-analyzer.js`) retourne toujours la détection originale inchangée.

---

## 6. Undo / Redo

### 6.1 Architecture

Pile de commandes simple (pas d'architecture d'état lourde) :

```js
const undoStack = [];
const redoStack = [];
const MAX_UNDO = 50;
```

Chaque commande :

```js
{
  type: 'override' | 'clearOverride' | 'timeEdit',
  segmentIndex: 3,
  previousOverride: null,  // ou l'override avant modification
  newOverride: { root: 0, quality: 'maj7', bass: null },
  previousStart: 1.234,   // pour timeEdit
  previousEnd: 3.567,     // pour timeEdit
  newStart: 1.500,
  newEnd: 3.800,
}
```

### 6.2 Fonctions

```js
function pushUndo(command) {
  undoStack.push(command);
  redoStack.length = 0;
  if (undoStack.length > MAX_UNDO) undoStack.shift();
}

function undo() {
  const cmd = undoStack.pop();
  if (!cmd) return;
  // Inverser la commande
  redoStack.push(cmd);
}

function redo() {
  const cmd = redoStack.pop();
  if (!cmd) return;
  // Réappliquer la commande
  undoStack.push(cmd);
}
```

### 6.3 Raccourcis

- `Ctrl+Z` : `undo()`
- `Ctrl+Shift+Z` : `redo()`

Implémentés via un écouteur global `keydown` dans `analyzer-tab.js`, actif uniquement quand un champ d'édition n'a pas le focus.

### 6.4 Limitations V1

- Une seule pile par analyse. Pas de undo/redo multi-session.
- Pas de fusion de commandes (chaque action = une entrée).

---

## 7. Édition temporelle (Phase C)

### 7.1 Principe

L'éditeur de symbole (Phase A) est étendu avec des champs `startTime` et `endTime` :

```
Début : [ 1.234 ] secondes
Fin :   [ 3.567 ] secondes
```

### 7.2 Contraintes de validation

```js
function validateTimeEdit(segments, index, newStart, newEnd) {
  if (newStart >= newEnd) return 'La fin doit être après le début';
  if (newStart < 0) return 'Le début ne peut pas être négatif';
  
  const prev = segments[index - 1];
  const next = segments[index + 1];
  
  if (prev && newStart < prev.startTime) return 'Chevauchement avec le segment précédent';
  if (prev && newStart < prev.endTime) return 'Chevauchement avec la fin du segment précédent';
  if (next && newEnd > next.endTime) return 'Chevauchement avec le segment suivant';
  if (next && newEnd > next.startTime) return 'Chevauchement avec le début du segment suivant';
  
  return null; // valide
}
```

### 7.3 Conséquences sur l'export MIDI

L'export utilise `chord.startTime` et `chord.endTime` modifiés → les corrections temporelles se propagent automatiquement à l'export.

### 7.4 Risques

- **Trou temporel** : si on réduit la fin d'un segment sans que le suivant soit étendu. → Solution : le segment suivant commence automatiquement là où le précédent se termine (pas de gap).
- **Superposition** : deux segments qui se chevauchent. → Interdit par validation stricte.
- **Export MIDI désynchronisé** : les notes sont lues aux temps corrigés → cohérent par construction.

---

## 8. Fichiers à créer ou modifier

### 8.1 Créations

| Fichier | Contenu |
|---------|---------|
| `src/ui/chord-editor.js` | Composant d'édition (panneau, dropdowns, validation, undo/redo) |

### 8.2 Modifications

| Fichier | Changement |
|---------|------------|
| `src/ui/analyzer-tab.js` | Ajouter `segmentId`, `manualOverride`, `getEffectiveChord()`, double-clic handler, rafraîchissement timeline, undo/redo keyboard binding |
| `src/analyzer/midi-exporter.js` | Utiliser `getEffectiveChord()` au lieu de `chord.chord` |
| `src/index.html` | Ajouter le template HTML du panneau d'édition (ou le générer en JS) |
| `src/style.css` (ou `src/ui/components/design-system.css`) | Styles `.manual-override`, `.chord-editor-panel` |

### 8.3 Non modifiés

```
electron/audio-processor.py         — GELÉ
electron/harmony_engine/            — GELÉ
src/analyzer/audio-analyzer.js      — retourne detected inchangé
src/chord-engine/                   — inchangé
src/analyzer/harmonic-utils.js      — inchangé
src/chord-engine/naming.js          — inchangé
src/chord-engine/intervals.js       — inchangé
```

---

## 9. Tests

### 9.1 Tests unitaires (nouveau fichier `src/ui/chord-editor.test.js`)

| Test | Description |
|------|-------------|
| `effectiveChord sans override` | Retourne `segment.chord` |
| `effectiveChord avec override` | Retourne le symbole corrigé |
| `effectiveChord avec slash chord` | Retourne `"C/E"` |
| `effectiveChord après clear` | Retourne `segment.chord` |
| `override root only` | Qualité conservée, root changée |
| `override quality only` | Root conservée, qualité changée |
| `override identique à detected` | On crée quand même l'override (pas de détection spéciale) |
| `validateTimeEdit chevauchement` | Retourne une erreur |
| `validateTimeEdit négatif` | Retourne une erreur |
| `validateTimeEdit valide` | Retourne `null` |
| `undo restore previous state` | Après undo, l'override revient à l'état précédent |
| `redo restore new state` | Après undo puis redo, l'override est réappliqué |
| `segment invalide refusé` | Toute modification sur un segment inexistant est ignorée |
| `notes correspondent au symbole corrigé` | `chordNotes` retourne les bonnes notes pour le symbole effectif |

### 9.2 Tests d'intégration

| Test | Description |
|------|-------------|
| Création d'un override depuis l'UI | Double-clic → éditeur → sélection → Enregistrer → timeline mise à jour |
| Suppression d'un override | Revenir à la détection → timeline mise à jour |
| Export MIDI avec correction | Le fichier MIDI contient les notes corrigées |
| Export MIDI sans correction | Comportement identique à aujourd'hui |
| Détection originale intacte | `analysis.chords[i].chord` n'est jamais modifié |
| Persistance save/load | Overrides écrits dans `.pjc` → rechargés au prochain import |
| Réanalyse complète | Les overrides ne sont pas réappliqués automatiquement |
| Undo/redo visuel | La timeline se met à jour après chaque undo/redo |

---

## 10. Découpage en phases

### Phase A : Correction du symbole (estimation : 1-2 sessions)

**Objectif** : L'utilisateur peut corriger fondamentale, qualité, basse d'un segment. Pas de persistance entre les sessions.

**Tâches** :
1. Ajouter `segmentId` et `manualOverride` au modèle de données
2. Créer `getEffectiveChord()` dans `analyzer-tab.js`
3. Ajouter la détection de double-clic sur les blocs de la timeline
4. Créer `src/ui/chord-editor.js` (panneau d'édition)
5. Modifier `renderTimeline()` pour utiliser `effectiveChord`
6. Modifier `renderHeroChord()` pour utiliser `effectiveChord`
7. Implémenter undo/redo
8. Ajouter l'indicateur visuel (icône crayon + style)
9. Tests unitaires

**Critères de réussite** :
- Double-clic → éditeur visible
- Sélection fondamentale/qualité/basse → aperçu mis à jour
- Enregistrer → timeline mise à jour avec le nouveau symbole
- Revenir à la détection → timeline restaurée
- Ctrl+Z annule la dernière action
- La détection originale est intacte dans `analysis.chords`

### Phase B : Persistance (estimation : 1 session)

**Objectif** : Les corrections survivent à la fermeture et réouverture du projet.

**Tâches** :
1. Définir le format `.pjc` (JSON latéral)
2. Fonction `saveOverrides(analysis, sourcePath)` → écrit `.pjc`
3. Fonction `loadOverrides(sourcePath)` → lit `.pjc`
4. Appel automatique après chaque Enregistrer
5. Appel au chargement du même fichier audio (appariement par startTime)
6. Tests de persistance

**Critères de réussite** :
- Après correction → fichier `.pjc` créé
- Après fermeture et réouverture du projet → corrections chargées
- Export MIDI utilise les corrections chargées
- Réanalyse complète → pas de réapplication automatique

### Phase C : Édition temporelle (estimation : 1 session)

**Objectif** : L'utilisateur peut modifier le début et la fin d'un segment.

**Tâches** :
1. Ajouter les champs startTime/endTime à l'éditeur (Phase A)
2. Implémenter `validateTimeEdit()` avec toutes les contraintes
3. Ajouter undo/redo pour les modifications temporelles
4. Propager les modifications à la timeline et à l'export MIDI
5. Tests de validation temporelle

**Critères de réussite** :
- Modification du début → segment redimensionné dans la timeline
- Modification de la fin → segment redimensionné dans la timeline
- Chevauchement refusé avec message d'erreur
- Durée négative refusée
- Export MIDI reflète les nouvelles bornes temporelles

### Phase D : Intégration complète aux exports (estimation : 1 session)

**Objectif** : Tous les exports et affichages utilisent `effectiveChord`.

**Tâches** :
1. Vérifier et corriger tous les points de propagation (cf. section 5)
2. Ajouter l'export texte/JSON avec les overrides
3. Ajouter l'indication "Corrigé manuellement" dans les exports
4. Tests d'export avec et sans corrections
5. Documentation utilisateur

**Critères de réussite** :
- Export MIDI avec corrections → notes corrigées
- Export JSON inclut les overrides
- Statistiques utilisent les données effectives
- Aucune régression sur les exports sans correction

---

## 11. Risques

| Risque | Probabilité | Impact | Mitigation |
|--------|-------------|--------|------------|
| Chevauchement temporel après édition | Moyenne | Élevé | Validation stricte avant application |
| Perte des overrides après réanalyse | Haute | Moyen | Documentation claire + appariement par startTime |
| Confusion utilisateur entre detected/effective | Basse | Moyen | Indication visuelle "Corrigé manuellement" + infobulle |
| Export MIDI avec notes incohérentes (qualité inconnue) | Très basse | Élevé | Validation du symbole avant enregistrement |
| Undo/redo avec modifications temporelles chaînées | Basse | Moyen | Tester les séquences undo/redo complexes |
| Fichier `.pjc` corrompu | Très basse | Faible | Validation JSON au chargement, fallback silencieux |
| Regression du clic simple (seek) | Basse | Élevé | Double-clic dédié, clic simple inchangé |

---

## 12. Cas particuliers — Traitement

| Cas | Traitement |
|-----|-----------|
| Segment `"N"` (pas d'accord) | La dropdown fondamentale est pré-remplie avec `C` (valeur par défaut). L'éditeur s'ouvre normalement. |
| Fondamentale modifiée, qualité conservée | `manualOverride = { root: 5, quality: segment.symbol, bass: null }`. On calcule le symbole depuis la qualité détectée. |
| Qualité modifiée, fondamentale conservée | `manualOverride = { root: detectedRoot, quality: "maj7", bass: null }`. |
| Ajout d'une basse | `manualOverride.bass = 4`. Le symbole devient `C/E`. |
| Suppression d'une basse | `manualOverride.bass = null`. Le symbole redevient `C`. |
| Correction identique à la détection | On crée quand même l'override. L'icône crayon apparaît. L'utilisateur doit utiliser "Revenir à la détection" pour l'enlever. |
| Segment supprimé ou recréé après nouvelle analyse | Les overrides ne sont pas réappliqués automatiquement (startTime peut différer). |
| Réanalyse complète du même fichier | Overrides ignorés. L'utilisateur doit les réappliquer (ou les charger depuis `.pjc` manuellement). |
| Symbole invalide | Impossible en V1 : les dropdowns ne permettent que des valeurs valides. |
| Orthographe enharmonique | V1 utilise uniquement les dièses (cohérent avec `intervals.js`). |

---

## 13. Détails d'implémentation — `src/ui/chord-editor.js`

### 13.1 API publique

```js
export class ChordEditor {
  constructor(options = {})
  
  // Ouvrir l'éditeur pour un segment
  open(segment, segmentIndex, analysis, {
    onSave: (segmentIndex, override) => void,
    onCancel: () => void,
    onReset: (segmentIndex) => void,
  })
  
  // Fermer sans sauvegarder
  close()
  
  // État
  get isOpen() : boolean
}
```

### 13.2 Raccourcis internes

```js
// Mapping qualité → symbole pour l'affichage
const QUALITY_SYMBOLS = {
  '': '',
  'm': 'm',
  '7': '7',
  'maj7': 'maj7',
  'm7': 'm7',
  'm7b5': 'm7b5',
  'dim': 'dim',
  'aug': 'aug',
  'sus2': 'sus2',
  'sus4': 'sus4',
};

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
```

### 13.3 Détection de la qualité actuelle depuis `chord.chord`

Pour pré-remplir l'éditeur avec les valeurs détectées, on extrait la qualité depuis le symbole complet :

```js
function parseChordSymbol(chordStr) {
  if (!chordStr || chordStr === 'N') return { root: 0, quality: '', bass: null };
  const slashParts = chordStr.split('/');
  const namePart = slashParts[0];
  const bassPart = slashParts[1];
  const rootMatch = namePart.match(/^([A-G][#b]?)(.*)/);
  if (!rootMatch) return { root: 0, quality: '', bass: null };
  const root = noteNameToPc(rootMatch[1]);
  const quality = rootMatch[2] || '';
  const bass = bassPart ? noteNameToPc(bassPart.trim()) : null;
  return { root, quality, bass };
}
```

---

## 14. Glossaire

| Terme | Définition |
|-------|-----------|
| `detected_chord` | Le symbole retourné par le moteur d'analyse (jamais modifié) |
| `manual_override` | Les champs modifiés par l'utilisateur (root, quality, bass) |
| `effective_chord` | Le symbole effectif affiché/utilisé : priorité à l'override, fallback detected |
| `segmentId` | Identifiant stable d'un segment, généré côté JS |
| Override | Correction partielle (root, quality, bass) d'un segment |

---

## 15. Critères de réussite globaux

- [ ] L'utilisateur peut corriger fondamental, qualité, basse de n'importe quel segment
- [ ] Les corrections sont immédiatement visibles dans la timeline et le hero panel
- [ ] Les corrections survivent à la fermeture/réouverture du projet (Phase B) et à l'export (Phase D)
- [ ] La détection originale n'est jamais modifiée
- [ ] Le moteur d'analyse n'est jamais modifié
- [ ] L'utilisateur peut annuler/rétablir ses actions
- [ ] Les exports (MIDI, JSON) reflètent les corrections
- [ ] Les limites temporelles des segments sont validées contre les chevauchements
- [ ] Toute action invalide est refusée avec un message utilisateur clair
- [ ] Aucune régression sur les fonctionnalités existantes (import, lecture, export, zoom, scroll)

---

MANUAL_CHORD_EDITING_PLAN_READY
