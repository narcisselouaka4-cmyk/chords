# Two-Hand Piano Voicing Engine V1 — Phase 2A Simple Report

> **Statut :** implémenté et prêt pour audit.
> **Périmètre :** uniquement la Phase 2A (moteur Simple stateless). Aucune Phase 2B, aucune UI, aucune persistance.

---

## 1. Fichiers créés et modifiés

### Créés

| Fichier | Rôle |
|---------|------|
| `src/voicing-engine/styles/simple.js` | Générateur Simple-v1 (`generateSimpleVoicing`, `SIMPLE_GENERATOR_ID`, `SIMPLE_CANDIDATE_BUDGET`, helpers de dérivation de rôles). |
| `src/voicing-engine/test-voicing-phase2.js` | Suite de tests Phase 2A : oracles, anti-index, 120 transpositions, contrats d'échec, immutabilité, non-régressions Close. |
| `docs/TWO_HAND_VOICING_ENGINE_V1_PHASE2_SIMPLE_REPORT.md` | Ce rapport. |

### Modifiés

| Fichier | Modification |
|---------|-------------|
| `src/voicing-engine/generate-voicing.js` | Ajout du dispatch `style` (`close` par défaut, `simple`, échec `UNSUPPORTED_STYLE`). `generateVoicingFromSymbol` accepte désormais un second argument `options`. |

### Non modifiés

- `src/voicing-engine/candidate-generator.js`
- `src/voicing-engine/constraints.js`
- `src/voicing-engine/hand-ranges.js`
- `src/voicing-engine/data-model.js`
- `src/voicing-engine/chord-input.js`
- `src/voicing-engine/vocabulary.js`
- `src/voicing-engine/styles/close.js`
- Tous les fichiers sous `src/ui/`
- `src/index.html`
- `src/style.css`
- `src/main.js`
- `src/chord-engine/**`
- `electron/**`

---

## 2. API finale

```javascript
// Chemins Close-v1 inchangés
generateVoicing(input)                         // Close
generateVoicing(input, {})                     // Close
generateVoicing(input, { style: "close" })     // Close

// Nouveau chemin Simple
generateVoicing(input, { style: "simple" })      // Simple

// Rejets explicites
generateVoicing(input, { style: "unknown" })   // UNSUPPORTED_STYLE
generateVoicing(input, { style: "jazz" })      // UNSUPPORTED_STYLE
generateVoicing(input, { style: "simple", quality: "9" }) // UNSUPPORTED_QUALITY
```

Le chemin Close reste bit-à-bit identique : `generateVoicing(input)` et `generateVoicing(input, {})` et `generateVoicing(input, { style: "close" })` produisent le même résultat que `generateCloseVoicing(input)`.

---

## 3. Règles musicales

### 3.1 Dérivation des rôles

Tous les rôles sont dérivés depuis `rootPc` avec :

```javascript
const rolePc = (rootPc + interval) % 12;
```

**Aucune utilisation** de `chordTonePcs[0]`, `chordTonePcs[1]`, etc. Le tableau `chordTonePcs` est trié numériquement et n'encode pas l'ordre root/third/fifth/seventh.

### 3.2 Table canonique V1

| Qualité | Intervalles |
|---------|-------------|
| `''` | 0, 4, 7 |
| `m` | 0, 3, 7 |
| `dim` | 0, 3, 6 |
| `aug` | 0, 4, 8 |
| `sus2` | 0, 2, 7 |
| `sus4` | 0, 5, 7 |
| `7` | 0, 4, 7, 10 |
| `maj7` | 0, 4, 7, 11 |
| `m7` | 0, 3, 7, 10 |
| `m7b5` | 0, 3, 6, 10 |

### 3.3 Main droite

- **Triades** : les 3 pitch classes canoniques en RH.
- **7 / maj7 / m7** : root, tierce, septième ; la quinte (root+7) est omise.
- **m7b5 avec fondamentale en LH** : b3, b5, b7 ; la fondamentale est omise en RH car déjà en LH.
- **m7b5 avec basse slash non fondamentale** : accord complet (root, b3, b5, b7) en RH.

### 3.4 Main gauche

- **Triades avec basse fondamentale** : fondamentale + octave si l'octave tient dans `LH_HARD_RANGE` (28–55), sinon fondamentale seule.
- **Triades avec basse slash non fondamentale** : basse seule.
- **Septièmes (toutes)** : une seule note (fondamentale ou basse slash).

---

## 4. Traitement LH

La fonction `buildSimpleLeftHand(input)` place la basse jouée (`bassPc ?? rootPc`) dans `LH_SOFT_RANGE` si possible, sinon dans `LH_HARD_RANGE`, en choisissant l'instance médiane.

Pour les triades `bassIsRoot`, elle tente d'ajouter l'octave supérieure. Si celle-ci dépasse `LH_HARD_RANGE.max`, la LH se limite à la fondamentale.

Exemples validés par les tests :

- `C` → LH `[36, 48]` (C2 C3)
- `C/E` → LH `[40]` (E2)
- `G7/B` → LH `[35]` (B1, hard range)
- `Fm7/D` → LH `[38]` (D2)
- `C#m7b5/D` → LH `[38]` (D2)

---

## 5. Traitement m7b5

Deux cas explicitement testés :

| Symbole | Basse | RH sélection | Note |
|-----------|-------|--------------|------|
| `Gm7b5` | fondamentale G | Bb Db F | fondamentale omise en RH |
| `C#m7b5/D` | basse D non fondamentale | C# E G B | accord complet en RH |

Dans le second cas, `omittedPitchClasses` reste vide car toutes les notes canoniques sont présentes dans LH+RH.

---

## 6. Absence totale de dépendance aux index

Le module `simple.js` ne référence jamais `chordTonePcs[0]`, `chordTonePcs[1]`, etc. La sélection RH utilise `getSimpleRightHandPitchClasses(rootPc, quality, bassIsRoot)`, qui calcule `(rootPc + interval) % 12`.

Les tests anti-index injectent un `chordTonePcs` volontairement trié numériquement (ordre non canonique) pour `Dmaj7`, `F#7`, `Bbm7` et `Amaj7`, et vérifient que le résultat reste correct.

---

## 7. Génération et budget

```javascript
export const SIMPLE_CANDIDATE_BUDGET = 200;
```

Le générateur réutilise `generateRightHandCandidates` et `rankCandidate` de `candidate-generator.js`. Le sous-ensemble de pitch classes Simple est passé sous forme de `derivedInput` immutable à `generateRightHandCandidates(derivedInput)`, qui produit les candidates concrètes dans `RH_HARD_RANGE` avec span ≤ `RH_MAX_SPAN`.

Le classement lexicographique existant est utilisé sans modification. Le résultat est sélectionné déterministiquement. Aucun poids arbitraire n'est ajouté.

Contraintes respectées :

- plages hard LH/RH
- plages soft
- spans maximaux (`LH_MAX_SPAN = 12`, `RH_MAX_SPAN = 16`)
- aucun croisement
- basse jouée comme note globalement la plus grave

Si aucun candidat n'est valide, l'appel retourne `NO_VALID_SIMPLE_VOICING`. Aucun fallback vers Close.

---

## 8. Métadonnées

Les métadonnées du candidat Simple contiennent :

```javascript
{
  generatorId: 'simple-v1',
  style: 'simple',
  rootless: false,
  omittedPitchClasses: [...],  // calculé depuis LH+RH
  doubledPitchClasses: [...], // calculé depuis LH+RH
  interHandDoubledPitchClasses: [...],
  inversion: number
}
```

- `omittedPitchClasses` est calculé par différence d'ensembles entre les pitch classes canoniques et les pitch classes réellement présentes dans LH+RH.
- `doubledPitchClasses` est calculé depuis les notes MIDI réelles.
- `interHandDoubledPitchClasses` liste les pitch classes communes entre LH et RH.

Exemples validés :

- `Amaj7` → `omittedPitchClasses: [4]` (E omis)
- `F#7` → `omittedPitchClasses: [1]` (C# omis)
- `C` → `doubledPitchClasses: [0]` (C doublé en LH)
- `C#m7b5/D` → `omittedPitchClasses: []`

---

## 9. Oracles

### 9.1 Oracles de base validés

| Symbole | LH PCs | RH PCs |
|---------|--------|--------|
| C | 0 | 0 4 7 |
| Cm | 0 | 0 3 7 |
| C7 | 0 | 0 4 10 |
| Cmaj7 | 0 | 0 4 11 |
| Cm7 | 0 | 0 3 10 |
| Cm7b5 | 0 | 3 6 10 |
| Cdim | 0 | 0 3 6 |
| Caug | 0 | 0 4 8 |
| Csus2 | 0 | 0 2 7 |
| Csus4 | 0 | 0 5 7 |
| C/E | 4 | 0 4 7 |
| C/G | 7 | 0 4 7 |
| G7/B | 11 | 7 11 5 |
| Fm7/D | 2 | 5 8 3 |
| Gm7b5 | 7 | 10 1 5 |
| C#m7b5/D | 2 | 1 4 7 11 |

### 9.2 Oracles hors Do validés

| Symbole | LH PCs | RH PCs | Omis |
|---------|--------|--------|------|
| Dmaj7 | 2 | 2 6 1 | 9 (A) |
| F#7 | 6 | 6 10 4 | 1 (C#) |
| Bbm7 | 10 | 10 1 8 | 5 (F) |
| Amaj7 | 9 | 9 1 8 | 4 (E) |

---

## 10. Tests de transposition

10 qualités × 12 fondamentales = 120 transpositions testées.

Pour chaque transposition, les tests vérifient :

- rôles dérivés relativement à `rootPc`
- pitch classes RH exactes
- quinte omise pour `7`, `maj7`, `m7`
- aucune note étrangère en RH
- basse jouée présente et la plus grave
- pas de croisement
- span RH ≤ 16
- déterminisme

---

## 11. Tests exécutés et résultats

| Suite | Commande | Résultat |
|-------|----------|----------|
| Phase 0 | `node src/voicing-engine/test-voicing-phase0.js` | 107/107 OK |
| Phase 1 | `node src/voicing-engine/test-voicing-phase1.js` | 57/57 OK |
| Phase 2A | `node src/voicing-engine/test-voicing-phase2.js` | 62/62 OK |
| UI Voicing Preview (Phase 1.5A) | `node src/ui/test-voicing-preview.js` | 35/35 OK |
| UI Chord Editor | `node src/ui/test-chord-editor.js` | OK |
| UI Load Session | `node src/ui/test-load-session.js` | Échec préexistant (`window is not defined`, requiert un contexte browser/Electron) |
| Analyzer Export | `node src/analyzer/test-analysis-export.js` | OK |
| Analyzer | `node src/analyzer/test-analysis.js` | OK |
| Régression Partie 1 | `node src/analyzer/test-regression-part1.js` | OK |
| Régression Partie 3 | `node src/chord-engine/test-regression-part3.js` | OK |
| Build Vite | `npm run build` | OK |

Le build Vite réussit sans avertissement lié à la Phase 2A.

---

## 12. Non-régressions

- Les tests Phase 0 et Phase 1 passent sans modification.
- Les tests de régression Partie 1 et Partie 3 passent sans modification.
- Le preview textuel Close (Phase 1.5A) reste inchangé.
- Aucun fichier `src/ui/` n'a été modifié.
- Le chemin Close dans `generate-voicing.js` est conservé via `dispatchVoicing` ; `generateCloseVoicing` est appelé directement pour `style === 'close'` ou en l'absence d'option.

---

## 13. Limites restantes

- Le style Simple est disponible uniquement via l'API `generateVoicing(input, { style: "simple" })` ; aucun sélecteur UI n'est ajouté (Phase 2B).
- Aucune persistance du style, aucun `localStorage`.
- Aucune coloration du grand clavier (Phase 1.5B est `DEFERRED_BY_USER`).
- Aucun export MIDI modifié.
- Pas de rootless, pas de voice leading, pas de Jazz/Gospel.

---

## 14. Confirmation UI

Aucun fichier dans `src/ui/`, `src/index.html`, `src/style.css`, `src/main.js` n'a été modifié. La Phase 2A est strictement confinée au moteur de voicing.

---

## 15. Audit fixes

Suite au verdict `TWO_HAND_VOICING_ENGINE_V1_PHASE2A_SIMPLE_AUDIT_REQUIRES_FIXES`, les corrections suivantes ont été appliquées sans modifier la logique musicale.

### 15.1 Test anti-index réel

Le faux test anti-index (lignes 295–330 de la version initiale) injectait des `chordTonePcs` déjà triés dans le même ordre que la normalisation, et passait par `normalizeVoicingInput` qui retriait le tableau. Il ne pouvait pas détecter une implémentation basée sur les index.

Le nouveau test (section *Phase 2A: Test anti-index réel*) :

- appelle directement `getSimpleRightHandPitchClasses(rootPc, quality, true)` ;
- construit des objets d'entrée gelés avec `chordTonePcs` volontairement permutés ;
- vérifie ensuite `generateSimpleVoicing(scrambledInput)` pour s'assurer que le générateur entier ignore l'ordre de `chordTonePcs`.

Cas utilisés :

| Symbole | rootPc | chordTonePcs (non trié) | expectedRhPcs |
|---------|--------|-------------------------|---------------|
| Dmaj7 | 2 | `[9, 6, 2, 1]` | `[2, 6, 1]` |
| F#7 | 6 | `[10, 6, 4, 1]` | `[6, 10, 4]` |
| Bbm7 | 10 | `[8, 1, 10, 5]` | `[10, 1, 8]` |
| Amaj7 | 9 | `[4, 9, 1, 8]` | `[9, 1, 8]` |

### 15.2 Suppression des tests circulaires

Les tests d'omission de quinte utilisaient `getSimpleRightHandPitchClasses()` pour calculer leur propre attente. Ils ont été remplacés par une table d'intervalles indépendante, littérale et réservée aux tests :

```javascript
const TEST_SIMPLE_SEVENTH_RULES = Object.freeze({
  '7': Object.freeze({
    canonicalIntervals: Object.freeze([0, 4, 7, 10]),
    rhIntervals: Object.freeze([0, 4, 10]),
    omittedIntervals: Object.freeze([7])
  }),
  'maj7': Object.freeze({
    canonicalIntervals: Object.freeze([0, 4, 7, 11]),
    rhIntervals: Object.freeze([0, 4, 11]),
    omittedIntervals: Object.freeze([7])
  }),
  'm7': Object.freeze({
    canonicalIntervals: Object.freeze([0, 3, 7, 10]),
    rhIntervals: Object.freeze([0, 3, 10]),
    omittedIntervals: Object.freeze([7])
  })
});
```

Pour chacune des 12 fondamentales et des 3 qualités, le test appelle `generateVoicing(..., { style: 'simple' })`, calcule l'attente depuis cette table et `rootPc`, et compare les ensembles.

### 15.3 Gel profond des métadonnées Simple

Dans `src/voicing-engine/styles/simple.js`, les trois sous-tableaux suivants sont désormais gelés avec `Object.freeze()` avant d'être insérés dans les métadonnées finales :

- `omittedPitchClasses`
- `doubledPitchClasses`
- `interHandDoubledPitchClasses`

Des tests dédiés vérifient :

```javascript
Object.isFrozen(metadata.omittedPitchClasses) === true
Object.isFrozen(metadata.doubledPitchClasses) === true
Object.isFrozen(metadata.interHandDoubledPitchClasses) === true
```

et tentent une mutation `push()` en mode strict, confirmant que la mutation lève une erreur et que le contenu reste inchangé.

### 15.4 Règles musicales inchangées

Aucune règle musicale n'a été modifiée :

- triades complètes en RH ;
- octave LH uniquement quand `bassIsRoot` et physiquement valide ;
- basse slash non fondamentale seule en LH ;
- quinte omise pour `7`, `maj7`, `m7` ;
- `m7b5` avec fondamentale en LH → RH `b3, b5, b7` ;
- `m7b5` avec basse slash non fondamentale → accord complet RH ;
- budget maximal de 200 ;
- aucun fallback vers Close ;
- aucun index harmonique ;
- `rootless: false`.

### 15.5 Résultats après correction

| Suite | Commande | Résultat |
|-------|----------|----------|
| Phase 2A | `node src/voicing-engine/test-voicing-phase2.js` | **62/62 OK** |
| Phase 0 | `node src/voicing-engine/test-voicing-phase0.js` | 107/107 OK |
| Phase 1 | `node src/voicing-engine/test-voicing-phase1.js` | 57/57 OK |
| UI Voicing Preview | `node src/ui/test-voicing-preview.js` | 35/35 OK |
| UI Chord Editor | `node src/ui/test-chord-editor.js` | OK |
| Analyzer Export | `node src/analyzer/test-analysis-export.js` | OK |
| Analyzer | `node src/analyzer/test-analysis.js` | OK |
| Régression Partie 1 | `node src/analyzer/test-regression-part1.js` | OK |
| Régression Partie 3 | `node src/chord-engine/test-regression-part3.js` | OK |
| Build Vite | `npm run build` | OK |

`src/ui/test-load-session.js` échoue avec `ReferenceError: window is not defined` ; cet échec est préexistant car le test nécessite un contexte browser/Electron et n'est pas lié à la Phase 2A.

---

## 16. Résumé

La Phase 2A est implémentée et corrigée conformément au plan `docs/TWO_HAND_VOICING_ENGINE_V1_PHASE2_SIMPLE_PLAN.md` :

- moteur Simple isolé dans `src/voicing-engine/styles/simple.js`
- dispatch `style` dans `src/voicing-engine/generate-voicing.js`
- tests complets et corrigés dans `src/voicing-engine/test-voicing-phase2.js`
- aucune modification UI
- aucune règle musicale changée
- aucun commit créé

**Signature finale :** `TWO_HAND_VOICING_ENGINE_V1_PHASE2A_SIMPLE_AUDIT_FIXES_APPLIED_READY_FOR_REAUDIT`
