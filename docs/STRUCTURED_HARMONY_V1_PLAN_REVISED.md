# Plan Architectural : `structured_harmony_v1` — Version Révisée

> Document de travail issu de l'audit Fable 5. Aucune modification de production avant validation.

---

## 1. Incohérences corrigées du plan initial

| # | Problème | Correction |
|---|----------|------------|
| 1 | Test D#m7/Bmaj9 hors vocabulaire V1 (contient une 9e) | Remplacé par A–C–E–G (Am7 vs C/A) + tensions en métadonnées seulement |
| 2 | Double comptage : `acoustic_score` + `root_scores` + `triad_scores` additionnés | Partition disjointe des bins chroma ; chaque bin consommé par exactement un facteur |
| 3 | Bug template major : index 3 (tierce mineure) au lieu de 4 | Correction : tierce majeure = intervalle 4 |
| 4 | `_voicing_plausibility` testait `0 in expected_pcs` (= C absolu) | Test remplacé par `candidate.root in observed_pcs` |
| 5 | Rootless bonifié quand basse = tierce (inverse de la pratique) | Rootless plausible quand basse = root (comping band) ou guide tones (3+7) présents |
| 6 | Critères de succès sous la baseline (qualité ≥ 40% vs baseline 47.9%) | Qualité ≥ 53%, root ≥ 97% |
| 7 | `triad_scores` marginalisé incohéremment | Sortie = conditionnelle `P(triad\|best_root)` + root de référence |
| 8 | Fenêtre temporelle variable selon profil | Fenêtre = 1 beat pour tous ; corroboration séparée (ne peut qu'expliquer, pas ajouter) |
| 9 | Profils présentés avec valeurs non validées | Profils réduits à des priors faibles (±5%), marqués `UNVALIDATED` |
| 10 | Échelles non calibrées, `_bass_emphasis` indéfinissable | Basse = chroma bas-registre CQT ; températures softmax calibrées sur fixtures |

---

## 2. Formule de scoring sans double comptage

### 2.1 Partition des bins chroma (12 dimensions)

Chaque bin est consommé par **exactement un** facteur conditionnel :

```
bin r                        → facteur fondamentale
bins {r+2, r+3, r+4, r+5, r+6, r+7} → facteur triade
bins {r+9, r+10, r+11}      → facteur septième
bins {r+1, r+8}             → résidu (notes étrangères)
chroma bas-registre (C1–C3) → facteur basse (signal séparé)
tonalité globale (morceau)   → facteur tonal (précalculé)
profil stylistique           → prior (aucune évidence audio)
```

### 2.2 Chaîne conditionnelle

```
acoustic(c,v) = w_r · f_root(chroma_now, r, v)
              + w_t · f_triad(chroma_now, r, t)
              + w_s · f_seventh(chroma_now, r, t, s)
              − λ(v)

acoustic(c) = max_{v ∈ {full, no5, rootless}} acoustic(c,v)
```

Où :
- `f_root` : énergie du bin `r` si `v ≠ rootless` ; 0.5 (neutre) si `v = rootless`
- `f_triad` : softmax sur 5 classes (major, minor, dim, sus2, sus4) utilisant bins {r+2..r+7}
- `f_seventh` : softmax sur classes valides (none, b7, maj7, bb7) utilisant bins {r+9..r+11}
- `λ(full)=0`, `λ(no5)=0.02`, `λ(rootless)=0.06` (constants, calibrés sur fixtures)
- `rootless` autorisé uniquement si `s ≠ none`

### 2.3 Score total avec gating

```
total(c) = acoustic(c)
         + gated[ w_b·bass(c) + w_k·tonal(c) + w_y·style(c) ]

w_b = 0.25, w_k = 0.10, w_y = 0.05
```

**Règle de gating** : les termes contextuels (basse, tonalité, style) ne réordonnent que les candidats situés à `Δ ≤ 0.08` du leader acoustique. Un candidat acoustiquement faible ne peut jamais être promu.

### 2.4 Corroboration temporelle

- `chroma_now` : beat courant → seule évidence des facteurs.
- `chroma_corr = 0.25·prev + 0.5·now + 0.25·next` : corroboration uniquement.
- Règle : une note attendue absente de `chroma_now` mais présente dans `chroma_corr` voit son coût d'omission annulé (`temporally_spread`). La corroboration ne peut **jamais** ajouter une note non prédite.

---

## 3. Modèle rootless

### 3.1 Six concepts distincts

| Concept | Source |
|---------|--------|
| Contenu registre supérieur | `chroma_now` seuillé → `observed_pcs` |
| Fondamentale harmonique | candidat → `root` |
| Basse acoustique | chroma CQT C1–C3 → `bass_pc` |
| Note la plus grave du piano | indisponible (chroma sans octave) → documenté V2 |
| Renversement | `bass_pc ∈ chord_tones \ {root}` → `inversion` (métadonnée) |
| Voicing rootless | `root ∉ observed_pcs` → `voicing_type` |

### 3.2 Règles de plausibilité

```
rootless + bass_pc == root        → cas idéal (comping band) : omission expliquée par la basse
rootless + basse faible/absente   → acceptable si guide tones (3 ET 7) présents
rootless + bass_pc == tierce      → PAS de bonus ; mieux expliqué par lecture m7 relative
bass_pc étranger à l'accord       → bass(c) = 0 (contradiction forte)
registre grave vide               → terme basse neutralisé (poids effectif 0)
```

### 3.3 Test de référence

`{A, C, E, G}` :
- basse A → **Am7** top-1
- basse C → **Am7/C** dans top-3, et C major avec `tension_pcs={9}` (métadonnée)
- basse absente → les deux hypothèses proches, ambiguïté assumée
- aucun symbole `C6` émis (hors vocabulaire)

`{D#, F#, A#, C#}` :
- basse D# → **D#m7** top-1
- basse B → **Bmaj7 rootless** dans top-3, tension_pcs={2} (relatif à B = 9e)
- aucun symbole `Bmaj9` émis

---

## 4. Profils stylistiques réduits

### 4.1 Dataclass

```python
@dataclass
class StyleProfile:
    name: str
    quality_priors: dict        # (triad, seventh) → facteur ∈ [0.95, 1.05]
    rootless_cost_mult: float   # ∈ [0.8, 1.2]
    no5_cost_mult: float        # ∈ [0.8, 1.2]
    bass_weight_mult: float     # ∈ [0.8, 1.2]
```

### 4.2 Profils

| Profil | quality_priors | rootless_cost_mult | no5_cost_mult | bass_weight_mult | Statut |
|--------|----------------|--------------------|---------------|------------------|--------|
| `neutral` | identité (1.0) | 1.0 | 1.0 | 1.0 | **Validé** (benchmark principal) |
| `pop_rock` | major:1.05, sus2:1.03 | 0.9 | 0.9 | 1.1 | UNVALIDATED |
| `jazz_gospel` | dim:1.05, min:1.02 | 0.8 | 0.8 | 1.0 | UNVALIDATED |
| `latin_salsa` | major:1.05, sus4:1.03 | 0.9 | 0.9 | 1.1 | UNVALIDATED |

**Supprimés de V1** : `observation_window_beats`, `expected_chord_duration`, `allow_passing_chords`, `extra_note_penalty` (concepts de lissage/transition → V2).

---

## 5. Budgets du générateur de candidats

```
1. Pruning fondamentales : top-4 par marginale + pc de la basse si absent → R ≤ 5
2. Triades : 5 évaluées, top-2 conservées par root                       → ≤ 10
3. Septièmes : classes valides évaluées, top-2 par (r,t)                 → ≤ 20
4. Variantes d'omission : ≤ 3 par candidat (full, no5, rootless)        → pas de multiplication
5. Renversements : métadonnée, pas des candidats séparés
6. Cap final : 12 candidats scorés, top-3 exposés
```

---

## 6. Benchmark d'ablation

### Configurations

| Config | Composantes |
|--------|-------------|
| A0 | chaîne acoustique seule (avec variantes omission) |
| A1 | A0 + basse |
| A2 | A0 + tonalité |
| FULL | A0 + basse + tonalité (= neutral) |
| S1 | FULL + profil `jazz_gospel` (exploratoire) |

### Corpus

1. **Fixtures chroma déterministes** (tests unitaires)
2. **Synthétiques WAV étendus** (nouveaux, avec labels de voicing)
3. **4 progressions réelles** existantes

### Métriques

- root / triad / seventh / qualité complète (top-1, top-3)
- Matrice de confusion par dimension
- Taux fondamentales absentes correctes
- Taux faux enrichissements
- Temps CPU relatif

### Critères de succès

| Critère | Seuil | Référence |
|---------|-------|-----------|
| Fondamentale (observation) | ≥ 97% | baseline 99.1% |
| Qualité complète (observation) | ≥ 53% | baseline 47.9% + 5 pts |
| maj7 (corpus réel) | ≥ 40% | baseline 0% |
| m7b5 (observation) | ≥ 50% | baseline 0% |
| Faux enrichissements | ≤ 15% | — |
| Synthétique propre | 100% | **gate de sanité** |
| Fixtures rootless | ≥ 60% top-3 | — |
| Test Am7 vs C/A | ordre dépend basse | test bloquant |
| Temps | ≤ 2× baseline | — |

---

## 7. Phases d'implémentation

### Phase 0 — Corpus et calibration (actuelle)
- Fixtures chroma déterministes (tous les cas de voicing)
- Générateur synthétique étendu avec labels
- Schéma GT expérimental enrichi
- Tests unitaires d'invariants et bloquants
- Rapport phase0

### Phase 1 — Moteur (nouveau package isolé)
- `electron/harmony-engine/` — dataclasses, scoring, voicing, profils
- Tests unitaires sur fixtures

### Phase 2 — Benchmark (aucune modification production)
- `scripts/benchmark_v1.py` — ablation complète
- Résultats dans `tests/audio/v1_benchmark/`

### Phase 3 — Intégration conditionnelle
- Branche `observation_mode` dans `audio-processor.py`
- Baseline intouchée

---

## 8. Reporté à V2

- Nommage extensions 9/11/13 et altérations
- Qualité `aug`
- Lissage séparé root/triad/seventh/bass et Viterbi multidimensionnel
- Mapping candidats → 121 états Viterbi existant
- Classificateur/mélange automatique de profils
- Calibration corpus des valeurs de profils
- Split jazz vs gospel
- Voicing avec octaves (note la plus grave du piano)
- Basse depuis stem Demucs bass
- Rythme harmonique attendu, accords de passage
- Fenêtres adaptatives
- Modulation de tonalité par segment

---

## 9. Schéma GT expérimental (Phase 0)

Champs ajoutés (hors production) :

```json
{
  "root": "D",
  "quality": "m7",
  "seventh": "b7",
  "triad": "minor",
  "bass_pc": 2,
  "observed_pcs": [2, 5, 9, 0],
  "missing_pcs": [],
  "extra_pcs": [],
  "expected_pcs": [2, 5, 9, 0],
  "voicing_type": "complete",
  "tension_pcs": [],
  "temporal_spread": false,
  "intervals": [0, 3, 7, 10]
}
```

---

## 10. Tests bloquants (Phase 0)

1. Le template major utilise l'intervalle 4, jamais 3.
2. Le template minor utilise l'intervalle 3.
3. Les tests de fondamentale sont relatifs au root du candidat, pas au pitch class absolu 0.
4. Une fondamentale absente n'est pas confondue avec « C absent ».
5. L'ordre d'insertion des notes ne modifie pas le résultat.
6. Une note mélodique étrangère n'est pas intégrée à l'accord.
7. `chroma_corr` peut seulement corroborer, jamais ajouter une note.
8. La basse est calculée depuis un chroma bas-registre séparé.
9. Les profils stylistiques sont à l'identité en profil neutral.
10. Aucun prior stylistique ne peut promouvoir un candidat à Δ > 0.08.

---

## Verdict

Le plan initial était **PLAN_REQUIRES_REVISION**. Cette version corrigée résout les 10 incohérences identifiées. **READY_FOR_BUILD** — Phase 0 en cours.
