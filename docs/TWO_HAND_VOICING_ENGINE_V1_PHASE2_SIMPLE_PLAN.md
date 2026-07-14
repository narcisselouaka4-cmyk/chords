# Two-Hand Piano Voicing Engine V1 — Plan Phase 2 : Style Simple

> **Nature du document :** plan technique détaillé. Aucun fichier de code ne doit être modifié ni créé à ce stade.
> **Projet :** Piano Jazz Chords
> **Contexte :** Phase 1 (Close-v1) est implémentée, testée et commitée. Phase 1.5A (Close Voicing Text Preview) est commitée. Phase 1.5B (keyboard coloring) est DEFERRED_BY_USER.
> **Audit :** `TWO_HAND_VOICING_ENGINE_V1_PHASE2_SIMPLE_PLAN_AUDIT_PASS`

---

## 1. État des lieux

### 1.1 Fondations existantes

| Fichier | Rôle | Impact Phase 2 |
|---------|------|---------------|
| `src/voicing-engine/chord-input.js` | Normalisation d'entrée (`normalizeVoicingInput`, `normalizeVoicingInputFromSymbol`) | Réutilisé tel quel |
| `src/voicing-engine/vocabulary.js` | Vocabulaire canonique V1 (`isSupportedInV1`) | Réutilisé tel quel |
| `src/voicing-engine/hand-ranges.js` | Plages physiques LH/RH, `span`, `midiInRange` | Réutilisé tel quel |
| `src/voicing-engine/constraints.js` | Validation hard/soft (`checkCandidateHardConstraints`, `measureSoftConstraintFeatures`) | Réutilisé tel quel |
| `src/voicing-engine/data-model.js` | Constructeurs immuables (`createHandVoicing`, `createVoicingCandidate`) | Réutilisé tel quel |
| `src/voicing-engine/candidate-generator.js` | Générateur Close-v1 (`generateCloseVoicing`, `generateRightHandCandidates`, `rankCandidate`) | **Non modifié** — Simple a son propre générateur |
| `src/voicing-engine/generate-voicing.js` | API publique (`generateVoicing`, `generateVoicingFromSymbol`) | **Modifié** — ajout du dispatch `style` |
| `src/voicing-engine/styles/close.js` | Re-export du style Close | Inchangé |
| `src/voicing-engine/styles/simple.js` | Générateur Simple | **Créé** |
| `src/voicing-engine/test-voicing-phase2.js` | Tests Phase 2 | **Créé** |

### 1.2 Garanties à préserver

- `generateVoicing(input)` sans options → Close-v1, bit-à-bit inchangé.
- `generateVoicing(input, {})` → Close-v1, bit-à-bit inchangé.
- `generateVoicing(input, { style: "close" })` → Close-v1, bit-à-bit inchangé.
- Aucun fichier `src/ui/` modifié en Phase 2A.
- Aucune coloration du grand clavier.
- Aucune persistance du style.
- Aucun export MIDI modifié.
- Aucune détection audio modifiée.

---

## 2. Définition musicale de Simple

Le style **Simple** est un voicing pianistique déterministe, non-rootless, conçu pour l'apprentissage. Il ne contient **aucune** règle Jazz, Gospel ou voice leading.

### 2.1 Principe général

- **Main gauche** : fondamentale + octave (doublure) lorsque la basse est la fondamentale et que l'octave tient dans les contraintes physiques. Sinon, basse seule.
- **Main droite** : sous-ensemble des pitch classes harmoniques, avec omission de la quinte pour les accords de septième (sauf m7b5 avec basse slash non-fondamentale).
- **Aucune omission pour les triades** : la RH contient toutes les pitch classes de l'accord.
- **Aucun rootless** : `rootless: false` en permanence.

### 2.2 Comparaison Close / Simple

| Aspect | Close-v1 | Simple |
|--------|----------|--------|
| LH triades (bassIsRoot) | 1 note (fondamentale) | 2 notes (fondamentale + octave) |
| LH triades (basse slash) | 1 note (basse) | 1 note (basse) |
| LH septièmes (bassIsRoot) | 1 note (fondamentale) | 1 note (fondamentale) |
| LH septièmes (basse slash) | 1 note (basse) | 1 note (basse) |
| RH triades | Triade complète | Triade complète |
| RH 7, maj7, m7 | Accord complet (4 notes) | Quinte omise (3 notes) |
| RH m7b5 (bassIsRoot) | Accord complet (4 notes) | b3, b5, b7 (3 notes, fondamentale en LH) |
| RH m7b5 (basse slash non-fondamentale) | Accord complet (4 notes) | Accord complet (4 notes) |
| Omissions | Aucune | Quinte pour 7/maj7/m7 ; fondamentale pour m7b5 (si en LH) |
| Doublures | Aucune (sauf slash inter-mains) | Fondamentale en LH pour triades bassIsRoot |
| rootless | false | false |

---

## 3. Règles par qualité

### 3.1 Intervalles canoniques

Tous les rôles harmoniques sont dérivés depuis `rootPc` avec la formule :

```javascript
const rolePc = (rootPc + interval) % 12;
```

**Interdiction absolue** d'utiliser `chordTonePcs[0]`, `chordTonePcs[1]`, etc. `chordTonePcs` est trié numériquement et ne représente pas l'ordre root, third, fifth, seventh.

| Qualité | Intervalles canoniques | Notes |
|---------|----------------------|-------|
| `''` (major) | 0, 4, 7 | root, M3, P5 |
| `m` (minor) | 0, 3, 7 | root, m3, P5 |
| `dim` | 0, 3, 6 | root, m3, dim5 |
| `aug` | 0, 4, 8 | root, M3, aug5 |
| `sus2` | 0, 2, 7 | root, M2, P5 |
| `sus4` | 0, 5, 7 | root, P4, P5 |
| `7` | 0, 4, 7, 10 | root, M3, P5, m7 |
| `maj7` | 0, 4, 7, 11 | root, M3, P5, M7 |
| `m7` | 0, 3, 7, 10 | root, m3, P5, m7 |
| `m7b5` | 0, 3, 6, 10 | root, m3, dim5, m7 |

### 3.2 Triades (major, minor, dim, aug, sus2, sus4)

**Règle RH** : triade complète (toutes les pitch classes).

**Règle LH** :
- Si `bassIsRoot` (bassPc == null || bassPc === rootPc) : fondamentale + octave, si l'octave tient dans `LH_HARD_RANGE`.
- Si l'octave ne tient pas dans `LH_HARD_RANGE` : fondamentale seule.
- Si basse slash différente de la fondamentale (`bassPc != null && bassPc !== rootPc`) : basse seule, jamais doublée.

**Exemples** :

```
C     → LH C2 C3 | RH C E G
Cm    → LH C2 C3 | RH C Eb G
Cdim  → LH C2 C3 | RH C Eb Gb
Caug  → LH C2 C3 | RH C E G#
Csus2 → LH C2 C3 | RH C D G
Csus4 → LH C2 C3 | RH C F G
C/E   → LH E2    | RH C E G
C/G   → LH G2    | RH C E G
```

### 3.3 Septièmes 7, maj7, m7

**Règle RH** : root, tierce, septième. **La quinte est omise.**

**Règle LH** :
- Si `bassIsRoot` : fondamentale seule.
- Si basse slash non-fondamentale : basse seule.

**Exemples** :

```
C7    → LH C | RH C E Bb
Cmaj7 → LH C | RH C E B
Cm7   → LH C | RH C Eb Bb
G7/B  → LH B | RH G B F
Fm7/D → LH D | RH F Ab Eb
```

### 3.4 m7b5 (half-diminished)

**Cas 1 : fondamentale en LH** (`bassIsRoot`)

- LH : fondamentale seule.
- RH : b3, b5, b7 (la fondamentale est omise en RH car déjà en LH).

```
Cm7b5 → LH C | RH Eb Gb Bb
Gm7b5 → LH G | RH Bb Db F
```

**Cas 2 : basse slash différente de la fondamentale** (`bassPc != null && bassPc !== rootPc`)

- LH : basse seule.
- RH : accord complet (root, b3, b5, b7). La fondamentale reste en RH car elle n'est pas en LH.

```
C#m7b5/D → LH D | RH C# E G B
```

---

## 4. Dérivation des rôles depuis rootPc

### 4.1 Table de correspondance qualité → intervalles

```javascript
const SIMPLE_INTERVALS = Object.freeze({
  '':     [0, 4, 7],       // major
  'm':    [0, 3, 7],       // minor
  'dim':  [0, 3, 6],       // diminished
  'aug':  [0, 4, 8],       // augmented
  'sus2': [0, 2, 7],       // sus2
  'sus4': [0, 5, 7],       // sus4
  '7':    [0, 4, 7, 10],   // dominant 7
  'maj7': [0, 4, 7, 11],   // major 7
  'm7':   [0, 3, 7, 10],   // minor 7
  'm7b5': [0, 3, 6, 10],   // half-diminished 7
});
```

### 4.2 Fonctions de dérivation

```javascript
function getCanonicalIntervals(quality) {
  return SIMPLE_INTERVALS[quality] || null;
}

function getCanonicalPitchClasses(rootPc, quality) {
  const intervals = getCanonicalIntervals(quality);
  if (!intervals) return null;
  return [...new Set(intervals.map(i => (rootPc + i) % 12))].sort((a, b) => a - b);
}

function getRolePc(rootPc, interval) {
  return (rootPc + interval) % 12;
}
```

### 4.3 Sélection du sous-ensemble RH

```javascript
function selectRightHandPcs(rootPc, quality, bassIsRoot) {
  const intervals = getCanonicalIntervals(quality);
  if (!intervals) return null;

  const isTriad = intervals.length === 3;
  const isSeventh = intervals.length === 4;

  if (isTriad) {
    // Triade : toutes les pitch classes en RH
    return intervals.map(i => (rootPc + i) % 12);
  }

  if (isSeventh) {
    if (quality === 'm7b5' && bassIsRoot) {
      // m7b5 avec fondamentale en LH : RH = b3, b5, b7
      // Intervalles canoniques : [0, 3, 6, 10]
      // On garde les intervalles 3, 6, 10 (b3, b5, b7)
      return [3, 6, 10].map(i => (rootPc + i) % 12);
    }
    // 7, maj7, m7 : quinte omise
    // m7b5 avec basse slash non-fondamentale : accord complet
    if (quality === 'm7b5' && !bassIsRoot) {
      return intervals.map(i => (rootPc + i) % 12);
    }
    // Pour 7, maj7, m7 : on garde root, tierce, septième
    // Intervalles canoniques : [0, 3ou4, 7, 10ou11]
    // On garde 0, 3ou4, 10ou11 (root, tierce, septième)
    const root = 0;
    const third = intervals[1]; // 3 ou 4
    const seventh = intervals[3]; // 10 ou 11
    return [root, third, seventh].map(i => (rootPc + i) % 12);
  }

  return null;
}
```

**Note importante** : `selectRightHandPcs` retourne un sous-ensemble de pitch classes (pas des notes MIDI). Ce sous-ensemble est ensuite transmis à `generateRightHandCandidates` (ou son équivalent Simple) qui place ces pitch classes dans des octaves concrètes.

---

## 5. Contraintes physiques

### 5.1 Plages (inchangées)

```javascript
LH_HARD_RANGE = { min: 28, max: 55 }   // E1 → G3
LH_SOFT_RANGE = { min: 36, max: 48 }   // C2 → C3
RH_HARD_RANGE = { min: 48, max: 84 }   // C3 → C6
RH_SOFT_RANGE = { min: 55, max: 72 }   // G3 → C5
LH_MAX_SPAN = 12
RH_MAX_SPAN = 16
```

### 5.2 Contrainte d'octave LH pour triades

Pour les triades avec `bassIsRoot`, la LH joue fondamentale + octave. L'octave doit tenir dans `LH_HARD_RANGE` :

```javascript
function canDoubleOctaveInLH(rootPc) {
  const fundamental = midiInstancesInRange(rootPc, LH_SOFT_RANGE.min, LH_SOFT_RANGE.max);
  if (fundamental.length === 0) {
    // fallback LH_HARD_RANGE
    const fHard = midiInstancesInRange(rootPc, LH_HARD_RANGE.min, LH_HARD_RANGE.max);
    if (fHard.length === 0) return { ok: false };
    const f = /* meilleure fondamentale */;
    const octave = f + 12;
    if (octave <= LH_HARD_RANGE.max) return { ok: true, notes: [f, octave] };
    return { ok: true, notes: [f] }; // octave hors plage → fondamentale seule
  }
  const f = /* meilleure fondamentale */;
  const octave = f + 12;
  if (octave <= LH_HARD_RANGE.max) return { ok: true, notes: [f, octave] };
  return { ok: true, notes: [f] };
}
```

### 5.3 Absence de croisement

Contrainte hard existante dans `checkCandidateHardConstraints` : toutes les notes LH ≤ toutes les notes RH. Réutilisée telle quelle.

---

## 6. Génération et classement

### 6.1 Budget

```javascript
export const SIMPLE_CANDIDATE_BUDGET = 200;
```

### 6.2 Algorithme de génération Simple

```
1. Déterminer bassIsRoot = (bassPc == null || bassPc === rootPc)
2. Construire LH :
   a. Si triade ET bassIsRoot ET octave possible → [fondamentale, octave]
   b. Si triade ET bassIsRoot ET octave impossible → [fondamentale]
   c. Si triade ET basse slash non-fondamentale → [basse]
   d. Si septième → [fondamentale] ou [basse] selon bassIsRoot
3. Sélectionner le sous-ensemble RH de pitch classes via selectRightHandPcs()
4. Transmettre ce sous-ensemble à generateRightHandCandidates() (réutilisé)
5. Pour chaque candidate RH :
   a. Construire VoicingCandidate avec LH + RH
   b. Valider avec checkCandidateHardConstraints()
   c. Si valide, ajouter aux candidates scorées
6. Classer avec rankCandidate() (réutilisé)
7. Sélectionner la meilleure candidate
8. Calculer omittedPitchClasses et doubledPitchClasses depuis le résultat réel
9. Retourner le résultat
```

### 6.3 Classement (réutilisé)

Le classement lexicographique déterministe de `rankCandidate()` est réutilisé :
1. Violation hard (0 = valide, 1 = invalide)
2. Notes RH hors soft range
3. Distance totale des notes RH à la soft range
4. Span RH
5. Distance du centre de gravité RH à RH_TARGET_CENTER
6. Note RH la plus grave
7. Ordre lexicographique des notes RH

Aucun poids arbitraire. Tie-break stable.

### 6.4 Fallback interdit

- **Aucun fallback silencieux** de Simple vers Close.
- Si Simple ne produit aucune candidate valide → échec explicite `NO_VALID_SIMPLE_VOICING`.
- Si la qualité n'est pas supportée → `UNSUPPORTED_QUALITY`.
- Si le style est inconnu → `UNSUPPORTED_STYLE`.

---

## 7. API et contrat d'échec

### 7.1 Signature

```javascript
// Chemins existants (Close-v1, inchangés)
generateVoicing(input)                          // → Close-v1
generateVoicing(input, {})                      // → Close-v1
generateVoicing(input, { style: "close" })      // → Close-v1

// Nouveau chemin (Simple)
generateVoicing(input, { style: "simple" })     // → Simple-v1

// Rejet explicite
generateVoicing(input, { style: "jazz" })       // → UNSUPPORTED_STYLE
generateVoicing(input, { style: "unknown" })    // → UNSUPPORTED_STYLE
```

### 7.2 Dispatch dans `generate-voicing.js`

```javascript
export function generateVoicing(rawInput, options = {}) {
  const input = normalizeVoicingInput(rawInput);
  if (!input.valid) return generateCloseVoicing(input);

  const style = options.style || 'close';

  if (style === 'close') {
    if (!isSupportedInV1(input.quality)) {
      return { ok: false, /* ... */ rejectionReasons: ['UNSUPPORTED_QUALITY'] };
    }
    return generateCloseVoicing(input);
  }

  if (style === 'simple') {
    if (!isSupportedInV1(input.quality)) {
      return { ok: false, /* ... */ rejectionReasons: ['UNSUPPORTED_QUALITY'] };
    }
    return generateSimpleVoicing(input);
  }

  return Object.freeze({
    ok: false,
    input,
    selectedCandidate: null,
    candidatesConsidered: 0,
    candidatesValid: 0,
    diagnostics: Object.freeze([`unsupported style: '${style}'`]),
    rejectionReasons: Object.freeze(['UNSUPPORTED_STYLE']),
  });
}
```

### 7.3 Contrat d'échec

| Condition | rejectionReasons |
|-----------|-----------------|
| Qualité non supportée | `['UNSUPPORTED_QUALITY']` |
| Style inconnu | `['UNSUPPORTED_STYLE']` |
| Aucune candidate Simple valide | `['NO_VALID_SIMPLE_VOICING', ...]` |
| Entrée invalide | `['INVALID_INPUT']` |
| Aucune note LH possible | `['NO_VALID_LH_BASS']` |

---

## 8. Métadonnées calculées depuis le résultat réel

### 8.1 omittedPitchClasses

Calculé par **différence d'ensembles concrets** entre les pitch classes canoniques de l'accord et les pitch classes réellement présentes dans LH + RH.

```javascript
function computeOmittedPitchClasses(canonicalPcs, lhNotes, rhNotes) {
  const presentPcs = new Set([...lhNotes, ...rhNotes].map(n => n % 12));
  return canonicalPcs.filter(pc => !presentPcs.has(pc));
}
```

**Ne pas déduire** `omittedPitchClasses` uniquement depuis la qualité théorique. Une implémentation qui retournerait `[7]` pour tous les `7` sans vérifier les notes réelles serait incorrecte (ex: m7b5 avec basse slash non-fondamentale ne doit pas omettre la quinte).

### 8.2 doubledPitchClasses

Calculé depuis les notes MIDI réellement produites.

```javascript
function computeDoubledPitchClasses(lhNotes, rhNotes) {
  const allNotes = [...lhNotes, ...rhNotes];
  const pcCounts = new Map();
  for (const n of allNotes) {
    const pc = n % 12;
    pcCounts.set(pc, (pcCounts.get(pc) || 0) + 1);
  }
  return [...pcCounts.entries()]
    .filter(([, count]) => count > 1)
    .map(([pc]) => pc);
}
```

### 8.3 Métadonnées de la candidate Simple

```javascript
{
  generatorId: 'simple-v1',
  style: 'simple',
  rootless: false,
  omittedPitchClasses: [...],   // calculé depuis le résultat réel
  doubledPitchClasses: [...],  // calculé depuis le résultat réel
  interHandDoubledPitchClasses: [...],
  inversion: number,
}
```

---

## 9. Oracles obligatoires

### 9.1 Oracles de base

| Symbole | LH | RH | Notes |
|---------|----|----|-------|
| C | C2 C3 | C E G | Triade majeure, fondamentale doublée |
| Cm | C2 C3 | C Eb G | Triade mineure, fondamentale doublée |
| C7 | C | C E Bb | Quinte (G) omise |
| Cmaj7 | C | C E B | Quinte (G) omise |
| Cm7 | C | C Eb Bb | Quinte (G) omise |
| Cm7b5 | C | Eb Gb Bb | Fondamentale en LH, RH = b3,b5,b7 |
| Cdim | C2 C3 | C Eb Gb | Triade diminuée |
| Caug | C2 C3 | C E G# | Triade augmentée |
| Csus2 | C2 C3 | C D G | Triade sus2 |
| Csus4 | C2 C3 | C F G | Triade sus4 |
| C/E | E2 | C E G | Basse slash, LH seule |
| C/G | G2 | C E G | Basse slash, LH seule |
| G7/B | B | G B F | Basse slash, quinte omise |
| Fm7/D | D | F Ab Eb | Basse slash, quinte omise |
| Gm7b5 | G | Bb Db F | Fondamentale en LH, RH = b3,b5,b7 |
| Fsus4 | F2 F3 | F Bb C | Triade sus4, fondamentale doublée |

### 9.2 Oracles hors Do (particulièrement bloquants)

| Symbole | LH | RH | Note critique |
|---------|----|----|--------------|
| Dmaj7 | D | D F# C# | A (quinte) omis |
| F#7 | F# | F# A# E | C# (quinte) omis |
| Bbm7 | Bb | Bb Db Ab | F (quinte) omis |
| Amaj7 | A | A C# G# | E (quinte) omis |
| Gm7b5 | G | Bb Db F | Fondamentale en LH, RH = b3,b5,b7 |
| C#m7b5/D | D | C# E G B | Basse slash non-fondamentale, accord complet en RH |

### 9.3 Test anti-index

Un test doit échouer explicitement avec une implémentation basée sur la position dans `chordTonePcs` trié.

**Contre-exemple** : `Dmaj7` a `chordTonePcs = [1, 2, 6, 9]` (C#, D, F#, A). Une sélection naïve `chordTonePcs[0], chordTonePcs[1], chordTonePcs[3]` donnerait C#, D, A alors que le voicing Simple attendu est D, F#, C#. `F#7` a `chordTonePcs = [1, 4, 6, 10]` (C#, E, F#, A#). `chordTonePcs[0], chordTonePcs[1], chordTonePcs[3]` donnerait C#, E, A# alors que le voicing Simple attendu est F#, A#, E. `Bbm7` a `chordTonePcs = [1, 5, 8, 10]` (Db, F, Ab, Bb). `chordTonePcs[0], chordTonePcs[1], chordTonePcs[3]` donnerait Db, F, Bb alors que le voicing Simple attendu est Bb, Db, Ab. `Amaj7` a `chordTonePcs = [1, 4, 8, 9]` (C#, E, G#, A). `chordTonePcs[0], chordTonePcs[1], chordTonePcs[3]` donnerait C#, E, A alors que le voicing Simple attendu est A, C#, G#. Dans tous les cas l'ordre trié place les pitch classes par valeur numérique et non par rôle harmonique ; la seule coïncidence (m7b5 sur C) tient au fait que `rootPc = 0` aligne l'ordre numérique et l'ordre des rôles, ce qui disparaît dès que la fondamentale n'est pas 0.

**Le test anti-index doit vérifier que l'implémentation utilise bien `(rootPc + interval) % 12` et non un index dans `chordTonePcs`.** Une façon de le faire : vérifier que le code ne référence jamais `chordTonePcs[0]`, `chordTonePcs[1]`, etc. dans le module Simple. Une autre : injecter un `chordTonePcs` délibérément dans un ordre non canonique et vérifier que le résultat reste correct (ce qui prouve que l'implémentation ignore l'ordre de `chordTonePcs`).

### 9.4 Transpositions

Prévoir les 120 transpositions : 10 qualités × 12 fondamentales. Les tests doivent couvrir au minimum les 12 fondamentales pour les qualités `7`, `maj7`, `m7`, `m7b5` (48 tests) et un échantillon représentatif pour les triades.

---

## 10. Tests et non-régressions

### 10.1 Tests Phase 2A

Fichier : `src/voicing-engine/test-voicing-phase2.js`

Catégories de tests :

1. **Génération Simple basique** : tous les oracles de la section 9.1.
2. **Génération Simple hors Do** : tous les oracles de la section 9.2.
3. **Test anti-index** : vérifie que l'implémentation n'utilise pas `chordTonePcs[i]`.
4. **Transpositions** : 120 combinaisons (10 qualités × 12 fondamentales).
5. **Contrat d'échec** : `UNSUPPORTED_STYLE`, `UNSUPPORTED_QUALITY`, `NO_VALID_SIMPLE_VOICING`.
6. **Métadonnées** : `omittedPitchClasses` et `doubledPitchClasses` calculés correctement.
7. **Non-régression Close** : `generateVoicing(input)` et `generateVoicing(input, {})` et `generateVoicing(input, { style: "close" })` produisent exactement le même résultat qu'avant Phase 2.
8. **Contraintes physiques** : pas de croisement, respect des plages, span RH ≤ 16.
9. **Doublure LH** : triades bassIsRoot ont bien 2 notes en LH (sauf si octave hors plage).
10. **Basse slash non doublée** : une basse slash non-fondamentale n'est jamais doublée.

### 10.2 Non-régressions

- `node src/voicing-engine/test-voicing-phase0.js` → tous les tests passent.
- `node src/voicing-engine/test-voicing-phase1.js` → tous les tests passent (35/35).
- `node src/chord-engine/test-regression-part3.js` → inchangé.
- `node src/analyzer/test-regression-part1.js` → inchangé.
- `npm run build` → OK.

---

## 11. Sous-phases

### Phase 2A (ce document)

- Moteur Simple isolé dans `src/voicing-engine/styles/simple.js`.
- Dispatch `style` dans `src/voicing-engine/generate-voicing.js`.
- Tests dans `src/voicing-engine/test-voicing-phase2.js`.
- Rapport dans `docs/TWO_HAND_VOICING_ENGINE_V1_PHASE2_REPORT.md`.
- **Aucune interface**.
- **Aucune persistance**.
- **Aucun fichier `src/ui/` modifié**.

### Phase 2B (future, ne pas implémenter maintenant)

- Sélecteur textuel Close/Simple dans l'interface.
- Close par défaut.
- Préférence éventuellement conservée dans `localStorage`.
- **Aucune coloration du grand clavier** (Phase 1.5B est DEFERRED_BY_USER).

---

## 12. Fichiers prévus

### Créés

| Fichier | Rôle |
|---------|------|
| `src/voicing-engine/styles/simple.js` | Générateur Simple-v1 (`generateSimpleVoicing`, `SIMPLE_GENERATOR_ID`, `SIMPLE_CANDIDATE_BUDGET`) |
| `src/voicing-engine/test-voicing-phase2.js` | Tests Phase 2A |
| `docs/TWO_HAND_VOICING_ENGINE_V1_PHASE2_REPORT.md` | Rapport d'implémentation Phase 2A |

### Modifiés

| Fichier | Modification |
|---------|-------------|
| `src/voicing-engine/generate-voicing.js` | Ajout du dispatch `style` (options.style), import de `generateSimpleVoicing` |

### Non modifiés

Tous les autres fichiers, en particulier :
- `src/voicing-engine/candidate-generator.js`
- `src/voicing-engine/constraints.js`
- `src/voicing-engine/hand-ranges.js`
- `src/voicing-engine/data-model.js`
- `src/voicing-engine/chord-input.js`
- `src/voicing-engine/vocabulary.js`
- `src/voicing-engine/styles/close.js`
- Tous les fichiers sous `src/ui/`
- Tous les fichiers sous `src/audio/`
- Tous les fichiers sous `src/analyzer/`
- Tous les fichiers sous `src/chord-engine/`
- Tous les fichiers sous `src/recorder/`

---

## 13. Risques et mitigations

| Risque | Probabilité | Impact | Mitigation |
|--------|------------|--------|-----------|
| Octave LH hors plage pour triades aiguës/graves | Moyen | Faible | Fallback → fondamentale seule |
| Confusion index vs intervalle dans `chordTonePcs` | Élevé | Bloquant | Test anti-index + interdiction explicite dans le code |
| Omission incorrecte pour m7b5 avec basse slash | Moyen | Moyen | Oracle `C#m7b5/D` dans les tests |
| Régression Close-v1 | Faible | Bloquant | Tests de non-régression bit-à-bit |
| `omittedPitchClasses` déduit de la théorie au lieu du résultat | Moyen | Faible | Calcul par différence d'ensembles concrets |
| Budget candidats insuffisant pour accords denses | Faible | Faible | `SIMPLE_CANDIDATE_BUDGET = 200`, identique à Close |

---

## 14. Critères de réussite

1. Tous les oracles de la section 9 produisent exactement les notes attendues.
2. Les 120 transpositions (10 qualités × 12 fondamentales) passent.
3. Le test anti-index échoue avec une implémentation basée sur `chordTonePcs[i]`.
4. `generateVoicing(input)`, `generateVoicing(input, {})`, `generateVoicing(input, { style: "close" })` produisent le même résultat bit-à-bit qu'avant Phase 2.
5. `generateVoicing(input, { style: "simple" })` produit un voicing Simple valide.
6. `generateVoicing(input, { style: "jazz" })` retourne `UNSUPPORTED_STYLE`.
7. `omittedPitchClasses` et `doubledPitchClasses` reflètent le résultat réel.
8. Aucune régression sur les tests Phase 0, Phase 1, Partie 1, Partie 3.
9. `npm run build` OK.
10. Aucun fichier `src/ui/` modifié.

---

## 15. Protection Git

- Commit atomique : uniquement les fichiers de la Phase 2A.
- Message : `feat: add simple voicing style (Phase 2A)`.
- Aucun fichier étranger inclus.
- Aucun fichier de code non lié à Phase 2A inclus.
- `git add` explicite, jamais `git add .` ni `git add -A`.
