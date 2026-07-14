# Two-Hand Piano Voicing Engine V1 — Phase 1.5A Report

> **Périmètre :** lecture seule, affichage textuel uniquement.  
> **Non inclus :** Phase 1.5B (overlay clavier), Simple, Jazz, Gospel, rootless, voice leading, export voicings.

---

## 1. Architecture réelle

### Couche UI (`src/ui/voicing-preview.js`)

Le module UI est la **seule couche autorisée à importer le moteur**.

```text
src/ui/analyzer-tab.js
        │
        ▼
effectiveChord = getEffectiveChord(activeChord)
        │
        ▼
updateVoicingPreviewForChord(effectiveChord)
        │
        ├─► effectiveChordToVoicingInput(effectiveChord)
        │           │
        │           ▼
        │   { rootPc, quality, bassPc }
        │           │
        │           ▼
        │   generateVoicing(input)   ← import depuis src/voicing-engine/
        │           │
        │           ▼
        │   VoicingResult immuable
        │           │
        ▼
renderVoicingTextPreview(result)
        │
        ├─► buildVoicingTextModel(result, notation)
        │           │
        │           ▼
        │   midiToNoteName(midi, { useSharps })   ← src/voicing-engine/midi-convention.js
        │           │
        │           ▼
        │   DOM textuel dans #analyzer-voicing-preview
        ▼
clearVoicingTextPreview()
```

### Règles respectées

- Aucune règle musicale n’est déplacée dans l’UI.
- `src/voicing-engine/**` n’importe **rien** de `src/ui/**`.
- L’entrée et le résultat du moteur ne sont **jamais mutés**.

---

## 2. Fichiers créés et modifiés

### Fichiers créés pour Phase 1.5A

| Fichier | Rôle |
|---------|------|
| `src/ui/voicing-preview.js` | Adaptateur, modèle textuel, rendu DOM, nettoyage |
| `src/ui/test-voicing-preview.js` | Tests unitaires et d’intégration Phase 1.5A |
| `docs/TWO_HAND_VOICING_ENGINE_V1_PHASE1_5A_REPORT.md` | Ce rapport |

### Fichiers modifiés pour Phase 1.5A

| Fichier | Modification |
|---------|--------------|
| `src/index.html` | Ajout du conteneur `#analyzer-voicing-preview` sous `#analyzer-hero` |
| `src/style.css` | Styles textuels uniquement (titre, lignes LH/RH, état indisponible) |
| `src/ui/analyzer-tab.js` | Import du module, appel dans `updatePlaybackPosition`, nettoyage dans `showImportScreen`, cache d’évitement de recalcul |

### Fichiers étrangers déjà modifiés avant Phase 1.5A (non touchés)

- `src/main.js`
- `src/recorder/serializer.js`
- `src/index.html.tailwind-backup` (untracked)
- `src/ui/components/design-system.css` (untracked)
- `src/ui/components/index.js` (untracked)

### Fichiers protégés — aucune modification

- `src/voicing-engine/**`
- `src/analyzer/**` (détection audio, HMM/Viterbi, segmentation)
- `src/audio/**`
- `src/chord-engine/**` (sauf import existant déjà utilisé)
- `src/recorder/**` (sauf modification préexistante étrangère)
- Exports MIDI/JSON/texte
- Statistiques
- Grand clavier et petit clavier harmonique
- MIDI live
- Raccourci Espace

---

## 3. Point d’insertion du rendu

### `updatePlaybackPosition(currentTime)` (`src/ui/analyzer-tab.js`)

```js
const effectiveChord = activeChord ? getEffectiveChord(activeChord) : null;
if (effectiveChord !== lastRenderedVoicingChord) {
  lastRenderedVoicingChord = effectiveChord;
  if (effectiveChord) {
    updateVoicingPreviewForChord(effectiveChord);
  } else {
    clearVoicingTextPreview();
  }
}
```

`lastRenderedVoicingChord` évite d’appeler `generateVoicing()` à chaque frame quand le segment actif n’a pas changé.

### Nettoyage

Dans `showImportScreen()` :

```js
clearVoicingTextPreview();
```

Cela garantit qu’aucun ancien voicing ne reste visible quand on revient à l’écran d’import.

---

## 4. Événements gérés

Le preview est actualisé automatiquement après :

- sélection d’un segment (lecture ou clic timeline) ;
- déplacement de la lecture vers un autre segment ;
- modification manuelle de l’accord (override) ;
- modification de la basse slash ;
- undo / redo ;
- suppression d’un override ;
- chargement ou rechargement d’un projet.

Tous ces cas passent par `rerenderTimeline()` ou `currentPlayer.seek()`, qui déclenchent `updatePlaybackPosition()` avec un `effectiveChord` différent.

Aucun parcours de timeline complet ni recalcul global n’est effectué.

---

## 5. États visuels

### Accord supporté

```text
Voicing Close
LH  D2
RH  C4 · Eb4 · F4 · Ab4
```

### Accord non supporté (qualité hors V1)

```text
Voicing Close
Indisponible pour cet accord
Qualité non supportée en V1
```

### Échec du générateur

```text
Voicing Close
Aucun voicing valide
NO_VALID_CLOSE_VOICING
```

### Aucun accord actif

Le conteneur est masqué (`display: none`) et son contenu est vidé.

---

## 6. Exemples LH/RH vérifiés

| Accord | LH | RH |
|--------|----|----|
| `Fm7/D` | D2 | C4 · Eb4 · F4 · Ab4 |
| `Gm7b5` | G2 | Bb3 · Db4 · F4 · G4 |
| `Fsus4` | F2 | Bb3 · C4 · F4 |
| `Amaj7` | A2 | G#3 · A3 · C#4 · E4 |
| `C/E` | E2 | C4 · E4 · G4 |
| `C/G` | G2 | C4 · E4 · G4 |
| `G7/B` | B2 | D3 · F3 · G3 · B3 |
| `E7/D#` | D#2 | G#3 · B3 · D4 · E4 |

L’ordre suit strictement les numéros MIDI retournés par le moteur. La préférence enharmonique n’affecte que les labels affichés, jamais les MIDI. À défaut de préférence explicite, l’orthographe est déduite du symbole d’accord (famille diésée, bémolée ou imposée par la qualité).

---

## 7. Validation runtime

Validation effectuée en conditions réelles de lecture et d’édition :

| Accord | LH | RH |
|--------|----|----|
| `E7/D#` | `D#2` | `G#3 · B3 · D4 · E4` |
| `Amaj7` | `A2` | `G#3 · A3 · C#4 · E4` |
| `Fm7/D` | `D2` | `C4 · Eb4 · F4 · Ab4` |
| `Gm7b5` | `G2` | `Bb3 · Db4 · F4 · G4` |

Confirmations :

- **MIDI invariants** : les numéros MIDI générés par `generateVoicing()` sont identiques quelle que soit l’orthographe affichée.
- **Octaves conservées** : les octaves affichées correspondent strictement aux MIDI retournés par le moteur.
- **Ordre conservé** : l’ordre des notes RH/LH suit les numéros MIDI triés par main.
- **Enharmonique contextuelle** : l’orthographe dépend du symbole d’accord effectif (fondamentale, basse slash, qualité), sans préférence utilisateur explicite.
- **Correction manuelle** : modifier un accord via l’éditeur de grille met à jour le preview immédiatement.
- **Changement de segment** : naviguer dans la timeline ou la lecture vers un autre segment actualise le preview.
- **Aucune coloration du grand clavier** : `#hero-keyboard` n’a reçu aucune classe `.voicing-*` et reste inchangé.

---

## 8. Résultats de tests

### Tests Phase 0.5 / 0.6 — fondations

```bash
node src/voicing-engine/test-voicing-phase0.js
```

**Résultat :** 107/107 OK.

### Tests Phase 1 — Close Voicing Generator

```bash
node src/voicing-engine/test-voicing-phase1.js
```

**Résultat :** 57/57 OK.

### Tests Phase 1.5A — UI Preview

```bash
node src/ui/test-voicing-preview.js
```

**Résultat :** 35/35 OK.

### Manual Chord Editing — Partie B persistance

```bash
node src/ui/test-chord-editor.js
```

**Résultat :** tous les tests OK.

### Régressions générales

```bash
node src/analyzer/test-regression-part1.js
node src/chord-engine/test-regression-part3.js
```

**Résultat :** OK.

### Build Vite

```bash
npm run build
```

**Résultat :** build réussi (`../dist` généré).

---

## 8. Limites

- Le preview est **textuel uniquement** ; aucune coloration du clavier.
- Seul le style **Close** est affiché ; les futures variantes (Simple, Jazz, Gospel, rootless, voice leading) ne sont pas implémentées.
- La préférence explicite dièses/bémols est stockée dans `localStorage`. À défaut, la famille enharmonique est déduite du symbole d’accord effectif (fondamentale, basse slash, qualité). Elle n’est pas encore liée au sélecteur global de notation de l’onglet Entraînement.
- Aucune exportation de voicing n’est ajoutée.
- Le Hero harmonique existant affiche encore ses pitch classes selon son ancienne politique de notation, qui peut différer du preview contextuel. Cette harmonisation globale est hors périmètre de la Phase 1.5A et doit être traitée séparément, sans modifier le moteur de voicing.

---

## 9. Éléments strictement reportés à Phase 1.5B

- `renderVoicingKeyboardOverlay()`
- `clearVoicingKeyboardOverlay()`
- Classes CSS clavier : `.voicing-lh`, `.voicing-rh`, `.voicing-both`, `.voicing-bass`
- Coloration du grand clavier `#hero-keyboard`
- Interaction live / priorité live sur les touches

---

## 10. Vérification statique du périmètre

- ✅ Aucune modification de `src/voicing-engine/`
- ✅ Aucune coloration du grand clavier
- ✅ Aucun mini-clavier de voicing ajouté
- ✅ Aucun export de voicing créé
- ✅ Aucun voice leading
- ✅ Aucune seconde exécution inutile de `generateVoicing()`
- ✅ Aucune modification des moteurs d’analyse
- ✅ Aucune classe `.voicing-lh/rh/both/bass` dans le CSS
- ✅ Aucune fonction `renderVoicingKeyboardOverlay` dans `voicing-preview.js`

---

## 11. Informations Git

Aucun commit n’a été créé.  
Les fichiers `src/main.js` et `src/recorder/serializer.js` apparaissent modifiés mais sont des modifications étrangères préexistantes, hors périmètre Phase 1.5A.

---

Phase 1.5A implémentée, testée et prête pour audit runtime utilisateur.
