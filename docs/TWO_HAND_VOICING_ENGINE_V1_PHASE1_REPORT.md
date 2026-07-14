# Two-Hand Piano Voicing Engine V1 — Rapport Phase 1

## Objectif
Implémenter le premier générateur stateless de voicings à deux mains en position rapprochée (`close-v1`) sur les fondations Phase 0/0.5/0.6. Pas d'interface, pas de voice leading, pas de styles avancés, pas de rootless, pas de modification d'export MIDI existant.

## Statut
- Fondations : commit `70d1035 feat: add two-hand voicing engine foundations`
- Phase 1 : prête pour audit indépendant. **Aucun commit n'a été créé.**

---

## 1. Contrat musical Close-v1

### Main gauche
- Exactement **une note**.
- Si `bassPc` est défini : cette hauteur est jouée dans la plage stricte LH, priorité à la plage confortable `LH_SOFT_RANGE` (C2–C3).
- Sinon : la fondamentale harmonique `rootPc` est jouée dans la même plage.
- La note LH doit être globalement la plus grave.

### Main droite
- Contient **toutes les pitch classes harmoniques** (`input.chordTonePcs`) exactement une fois.
- Aucune omission, aucune doublure intra-main, aucun comportement rootless.
- Une basse slash étrangère n'est **pas** ajoutée aux pitch classes de la RH.
- Notes MIDI strictement croissantes.
- Span RH ≤ `RH_MAX_SPAN` (16 demi-tons) et, de préférence, ≤ une octave (12) lorsque cela est possible.
- Résultat validé par `checkCandidateHardConstraints()`.

### Slash chords
- La basse slash est une contrainte forte : la note la plus grave globale doit être `bassPc`.
- Exemple `Fm7/D` : LH = D, RH = F-Ab-C-Eb. D n'altère pas l'identité harmonique (pas de A naturel).
- Exemple `C/E` : LH = E, RH = C-E-G ; E est signalé comme doublure inter-mains sans être traité comme une erreur.

### Vocabulaire autorisé
Seules les qualités `supportedInV1` du module canonique `src/voicing-engine/vocabulary.js` sont acceptées :

| Qualité | Type |
|---------|------|
| `''` | Major triad |
| `m` | Minor triad |
| `dim` | Diminished triad |
| `aug` | Augmented triad |
| `sus2` | Sus2 triad |
| `sus4` | Sus4 triad |
| `7` | Dominant 7 |
| `maj7` | Major 7 |
| `m7` | Minor 7 |
| `m7b5` | Half-diminished 7 |

Toute autre qualité (`9`, `maj9`, `m9`, `11`, `13`, `alt`, `7b9`, `7#9`, `7#11`, inconnue, etc.) provoque un rejet explicite `UNSUPPORTED_QUALITY` sans fallback vers major.

---

## 2. Algorithme de génération

### Fichiers créés
| Fichier | Rôle |
|---------|------|
| `src/voicing-engine/candidate-generator.js` | Cœur du générateur close-v1 : LH, rotations RH, budget, classement, validation |
| `src/voicing-engine/generate-voicing.js` | API publique Phase 1 : `generateVoicing`, `generateVoicingFromSymbol` |
| `src/voicing-engine/styles/close.js` | Re-export du style close pour l'architecture modulaire future |
| `src/voicing-engine/test-voicing-phase1.js` | Suite de tests Phase 1 (57 tests) |
| `docs/TWO_HAND_VOICING_ENGINE_V1_PHASE1_REPORT.md` | Ce rapport |

### Étape 1 — Main gauche
```
buildLeftHand(input)
  targetPc = bassPc ?? rootPc
  candidates = instances MIDI de targetPc dans LH_SOFT_RANGE
  fallback = instances MIDI de targetPc dans LH_HARD_RANGE
  choisir la note la plus proche du centre C2/C3 (42-41)
```

### Étape 2 — Rotations de la main droite
```
generateRotations(chordTonePcs)
  pour chaque note de départ i dans l'accord trié
    rotation[j] = pc[(i+j) % n] relevé d'octaves pour rester strictement croissant
```

### Étape 3 — Candidates MIDI concrets
```
concreteRotationsFromRelative(rotation, RH_HARD_RANGE, RH_MAX_SPAN)
  pour chaque pitch class relative, toutes les instances MIDI dans RH_HARD_RANGE
  backtrack avec ordre strictement croissant
  filtre span ≤ RH_MAX_SPAN
```

### Étape 4 — Budget
- `CLOSE_CANDIDATE_BUDGET = 200`
- Limite supérieure stricte pour éviter toute explosion combinatoire.

### Étape 5 — Classement déterministe
Tuple lexicographique (du plus petit au plus grand) :
1. `hardValid` — 0 si `checkCandidateHardConstraints` passe, 1 sinon
2. `rhOutOfSoft` — nombre de notes RH hors `RH_SOFT_RANGE`
3. `rhSoftDistance` — distance totale des notes RH à `RH_SOFT_RANGE`
4. `rhSpan` — span de la main droite
5. `centerDistance` — distance du centroïde RH à `RH_TARGET_CENTER = 60` (C4)
6. `lowestRh` — note RH la plus grave
7. notes RH MIDI dans l'ordre lexicographique (départage final)

### Étape 6 — Validation finale
Chaque résultat repasse par `checkCandidateHardConstraints`. En l'absence de candidat valide, le résultat est :
```js
{
  ok: false,
  reason: 'NO_VALID_CLOSE_VOICING',
  diagnostics: [...],
  rejectionReasons: [...]
}
```
Aucun voicing physiquement invalide n'est retourné en fallback silencieux.

---

## 3. Modèle de données

### Sortie publique
```typescript
{
  ok: boolean,
  input: NormalizedVoicingInput,
  selectedCandidate: VoicingCandidate | null,
  candidatesConsidered: number,
  candidatesValid: number,
  diagnostics: string[],
  rejectionReasons?: string[]
}
```

### Métadonnées enrichies
```typescript
{
  style: 'close',
  generatorId: 'close-v1',
  rootless: false,
  inversion: number,              // pitch class de la note la plus grave de la RH
  omittedPitchClasses: [],
  doubledPitchClasses: [],
  interHandDoubledPitchClasses: number[]  // doublures entre LH et RH
}
```

Les tableaux retournés sont `Object.freeze()`. Les objets `HandVoicing` et `VoicingCandidate` sont construits via les fonctions immuables Phase 0.

---

## 4. Exemples de sorties MIDI

| Accord | LH | RH | Inversion |
|--------|----|----|-----------|
| C | C2 | C4 E4 G4 | 0 |
| Cm | C2 | C4 Eb4 G4 | 0 |
| Cdim | C2 | C4 Eb4 Gb4 | 0 |
| Caug | C2 | Ab3 C4 E4 | 8 |
| Csus2 | C2 | G3 C4 D4 | 7 |
| Csus4 | C2 | C4 F4 G4 | 0 |
| C7 | C2 | E4 G4 Bb4 C5 | 4 |
| Cmaj7 | C2 | B3 C4 E4 G4 | 11 |
| Cm7 | C2 | G3 Bb3 C4 Eb4 | 7 |
| Cm7b5 | C2 | Bb3 C4 Eb4 Gb4 | 10 |
| Fm7/D | D2 | C4 Eb4 F4 Ab4 | 0 |
| C/E | E2 | C4 E4 G4 | 0 |
| G7/B | B2 | B3 D4 F4 G4 | 11 |

Pour `Cmaj7`, 10 candidates sont considérées et 10 sont valides.

---

## 5. Candidats rejetés

Les raisons de rejet documentées incluent :
- `INVALID_INPUT` : entrée nulle, non normalisée ou invalide
- `UNSUPPORTED_QUALITY` : qualité hors `supportedInV1`
- `NO_VALID_LH_BASS` : aucune instance MIDI trouvée pour la basse LH
- `NO_VALID_CLOSE_VOICING` : aucune disposition RH ne passe les contraintes hard

Les 5 premiers candidats RH rejetés par hard constraints sont conservés dans `rejectionReasons` à des fins diagnostiques.

---

## 6. Tests

### Résultats
- **Phase 1** : 57 tests, **57 passés**
- **Phase 0/0.5/0.6** : 107 tests, **107 passés**
- **Tests chord-display (`src/ui/test-chord-editor.js`)** : passés
- **Tests Manual Chord Editing / persistance** : passés
- **Tests exports/statistiques (`src/analyzer/test-analysis-export.js`)** : passés
- **Régression Partie 1** : passée
- **Régression Partie 3** : passée
- **Build Vite** : OK

### Couverture Phase 1
- Rotations ascendantes
- Utilitaires MIDI (`midiInstancesInRange`, budget)
- Toutes les triades supportées (C, Cm, Cdim, Caug, Csus2, Csus4)
- Toutes les septièmes supportées (C7, Cmaj7, Cm7, Cm7b5)
- Slash chords bloquants (Fm7/D, C/E, C/G, G7/B)
- Cas musicaux obligatoires (Gm7b5, Fsus4, Amaj7)
- Transpositions sur les 12 fondamentales pour chaque qualité supportée
- Invariants bloquants (LH 1 note, RH complète, pas d'étrangère, entiers, triées, plages, span, non-croisement, rootless false, pas d'omission/doublure intra-main, déterminisme)
- Tests négatifs (qualité hors vocabulaire, PC/basse invalide, N, null, immutabilité)
- Comparaison des candidats (`rankCandidate`, diagnostics)
- Isolation : aucun module Phase 1 n'importe `src/ui/`

---

## 7. Fichiers créés / modifiés

### Créés
- `src/voicing-engine/candidate-generator.js`
- `src/voicing-engine/generate-voicing.js`
- `src/voicing-engine/styles/close.js`
- `src/voicing-engine/test-voicing-phase1.js`
- `docs/TWO_HAND_VOICING_ENGINE_V1_PHASE1_REPORT.md`

### Modifiés (uniquement test d'isolation)
- `src/voicing-engine/test-voicing-phase0.js` : le test d'isolation explore désormais aussi les sous-répertoires de `src/voicing-engine/` (styles/) et ignore les fichiers de test.

### Non modifiés
- Aucun fichier UI produit (panneau principal, claviers, timeline, corrections manuelles, projets, export MIDI) n'a été touché.
- Aucun moteur audio, segmentation, Viterbi, HMM, downgrade, persistance ou statistique existant n'a été modifié.

---

## 8. Limites et éléments reportés

### Ce qui est volontairement absent
- Voice leading (pas de contexte temporel reçu)
- Styles Simple, Jazz, Gospel
- Voicings rootless
- Doublures et omissions intentionnelles
- Extensions 9/11/13 et qualités altérées
- Scoring pondéré arbitraire
- Connexion aux interfaces produit ou aux exports existants

### Risques connus
- Pour certaines combinaisons rares de basse slash très aiguë et d'accord large, le générateur peut retourner `NO_VALID_CLOSE_VOICING` ; c'est le comportement attendu plutôt qu'un fallback invalide.
- Le span cible ≤ octave n'est pas un hard constraint ; le classement pénalise les spans plus larges sans les interdire tant qu'ils respectent `RH_MAX_SPAN`.

---

## 9. Vérifications demandées

| Vérification | Résultat |
|--------------|----------|
| Fm7/D = basse D + F Ab C Eb | ✅ |
| Gm7b5 = G Bb Db F | ✅ |
| Fsus4 = F Bb C | ✅ |
| Amaj7 = A C# E G# | ✅ |
| MIDI 60 = C4 | ✅ |

---

---

## 11. Independent Audit — Phase 1 Close

Audit réalisé indépendamment par relecture complète des fichiers et exécution des vérifications demandées.

### 11.1 Périmètre Git

| Catégorie | Fichiers |
|-----------|----------|
| Nouveaux Phase 1 | `src/voicing-engine/candidate-generator.js`, `src/voicing-engine/generate-voicing.js`, `src/voicing-engine/styles/close.js`, `src/voicing-engine/test-voicing-phase1.js`, `docs/TWO_HAND_VOICING_ENGINE_V1_PHASE1_REPORT.md` |
| Modifié Phase 1 | `src/voicing-engine/test-voicing-phase0.js` (test d'isolation étendu aux sous-répertoires) |
| Exclus (préexistants étrangers) | `.clinerules/rules-projet.md`, `CHANGES.md`, `electron/audio-processor.py`, `package*.json`, `src/main.js`, `src/recorder/serializer.js`, `vite.config.js`, caches Python, fichiers temporaires/audio non liés |

### 11.2 Contrat public

`generateVoicing(rawInput)` et `generateVoicingFromSymbol(chordSymbol)` sont les deux points d'entrée. Ils normalisent l'entrée, la valident, vérifient `isSupportedInV1`, puis appelent `generateCloseVoicing`. Aucun objet UI, timeline, symbole brut non reconnu ou entrée invalide n'est accepté. En cas d'erreur, le résultat contient explicitement `ok: false` et `rejectionReasons` (`INVALID_INPUT`, `UNSUPPORTED_QUALITY`, `NO_VALID_CLOSE_VOICING`, etc.). Aucun fallback silencieux vers major.

### 11.3 Identité harmonique

Les dix qualités `supportedInV1` (`''`, `m`, `7`, `maj7`, `m7`, `m7b5`, `dim`, `aug`, `sus2`, `sus4`) produisent toutes les pitch classes attendues, sans omission, sans doublure intra-main, sans pitch class étrangère. Vérifié sur C et transposé sur les 12 fondamentales.

### 11.4 Main gauche

Pour tous les voicings réussis : LH contient exactement 1 note entière MIDI, dans `LH_HARD_RANGE`, choisie dans `LH_SOFT_RANGE` quand c'est possible.

| Accord | LH | RH |
|--------|----|----|
| C | C2 (pc 0) | C4 E4 G4 |
| Cm7 | C2 (pc 0) | G3 Bb3 C4 Eb4 |
| Gm7b5 | G2 (pc 7) | Bb3 Db4 F4 G4 |
| Amaj7 | A2 (pc 9) | Ab3 A3 Db4 E4 (pcs 8,9,1,4) |
| C/E | E2 (pc 4) | C4 E4 G4 |
| C/G | G2 (pc 7) | C4 E4 G4 |
| G7/B | B2 (pc 11) | B3 D4 F4 G4 |
| Fm7/D | D2 (pc 2) | C4 Eb4 F4 Ab4 |

### 11.5 Slash chords

| Accord | Basse globale la plus grave | Identité supérieure conservée | Doublure inter-mains |
|--------|------------------------------|-------------------------------|----------------------|
| C/E | E2 | C E G | `[4]` (E) |
| C/G | G2 | C E G | `[7]` (G) |
| G7/B | B2 | G B D F | `[11]` (B) |
| Fm7/D | D2 | F Ab C Eb | `[]` | Aucun A naturel (pc 9) dans RH |

### 11.6 Génération des inversions

Pour n pitch classes, le générateur produit exactement n rotations (ex: 3 pour triade, 4 pour septième). Chaque rotation est strictement croissante. Le budget `CLOSE_CANDIDATE_BUDGET = 200` est respecté. Pour `Cmaj7` : 10 candidates considérées, 10 valides.

### 11.7 Position rapprochée

Notes RH strictement croissantes, une occurrence de chaque pitch class. Span RH ≤ `RH_MAX_SPAN` (16) ; en pratique les spans observés sont 6–9 demi-tons (dans ou légèrement au-dessus de l'octave). Aucune confusion entre position rapprochée et fondamentale.

### 11.8 Classement déterministe

Tuple implémenté (ordre lexicographique) :
1. `hardValid` (0 si valide)
2. `rhOutOfSoft` (notes hors `RH_SOFT_RANGE`)
3. `rhSoftDistance` (distance à la soft range)
4. `rhSpan`
5. `centerDistance` (centroïde RH vs 60)
6. `lowestRh`
7. Notes RH dans l'ordre lexicographique

Vérifié sur Cmaj7, C7, Cm7, Fm7/D, G7/B : le candidat sélectionné est réellement le minimum lexicographique. Aucun poids caché. L'ordre d'énumération n'affecte pas le résultat grâce au tri explicite.

### 11.9 Contraintes finales

Chaque candidat sélectionné repasse par `checkCandidateHardConstraints()`. En cas d'absence de candidat valide, `NO_VALID_CLOSE_VOICING` est retourné. Aucun candidat physiquement invalide n'est retourné.

### 11.10 Transpositions

Matrice 10 qualités × 12 fondamentales = 120 cas, 0 échec. Spans cohérents : triades 6–8, septièmes 8–9.

### 11.11 Frontières de registre

- LH minimum : pc 4 (E) → E2 (40), dans `LH_HARD_RANGE` 28–55
- RH dans `RH_HARD_RANGE` 48–84 pour tous les cas
- Chevauchement 48–55 respecté ; `max(LH) <= min(RH)` partout
- BassPc aigu (B avec Cmaj7) : OK

### 11.12 Métadonnées

- `style === "close"`
- `generatorId === "close-v1"`
- `rootless === false`
- `inversion` = pitch class de la note RH la plus grave
- `omittedPitchClasses === []`
- `doubledPitchClasses === []`
- `interHandDoubledPitchClasses` correctement rempli pour les slash chords

### 11.13 Immutabilité

Vérifié : l'objet racine `r`, les tableaux `r.diagnostics` / `r.rejectionReasons`, l'`input`, le `selectedCandidate`, les `HandVoicing` et leurs tableaux `notes`, ainsi que `metadata` sont désormais tous gelés via `Object.freeze()`. Aucune mutation silencieuse n'est possible.

La correction a été appliquée dans `src/voicing-engine/candidate-generator.js` et `src/voicing-engine/generate-voicing.js`.

### 11.14 Déterminisme

Dix exécutions consécutives identiques sur 5 accords différents. Aucun état global mutable. Le résultat ne dépend ni de l'ordre d'énumération ni de l'ordre des propriétés de l'objet d'entrée.

### 11.15 Absence de fonctionnalités prématurées

Aucun code Phase 1 n'importe `src/ui/`, `window`, `document`, Electron. Aucun voice leading, accord précédent/suivant, tonalité, tempo, style Jazz/Gospel/Simple, rootless, omission stylistique ou export MIDI de voicings.

### 11.16 Protection des systèmes existants

Toutes les suites passent :
- Phase 0/0.5/0.6 : 107/107
- Phase 1 : 57/57
- chord-display / Manual Chord Editing / persistance : OK
- exports/statistiques : OK
- Régression Partie 1 : OK
- Régression Partie 3 : OK
- Build Vite : OK

### 11.17 Verdict

**TWO_HAND_VOICING_ENGINE_V1_PHASE1_CLOSE_FINALIZED**

Le générateur close-v1 est conforme au contrat. Les résultats musicaux sont corrects, le classement est déterministe, les contraintes hard passent, les transpositions sont stables, l'immutabilité est totale, et aucun système existant n'est affecté. Phase 1 + correction 1.1 prêtes pour commit isolé.

---

## 10. Prochaine étape
Phase 1 close-v1 auditée et prête pour commit.

---

*Rapport mis à jour le 2026-07-13.*
