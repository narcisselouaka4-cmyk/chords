# Analyse : pourquoi l'exactitude qualité reste à 41,3 %

## Sources des erreurs (benchmark synthétique, variante C, 96s total)

### 1. Confusion m7b5 → m / 7 — **8,3 %** (7,94 s)

| Attendu | Détecté | Durée |
|---------|---------|:-----:|
| Am7b5 | `m` | 5,94 s |
| Am7b5 | `7` | 2,00 s |

**Étape responsable** : **HMM Viterbi (pré-downgrade).**
`m7b5` n'est pas dans `ADVANCED_SUFFIXES`. La fonction de downgrade ne
traite pas ce suffixe — l'erreur vient directement du décodeur.

**Cause** : le template `m7b5` = [0, 3, 6, 10] est proche de `m` = [0, 3, 7].
La différence d'un demi-ton (6 vs 7) est mal discriminée par le produit
scalaire sur chroma normalisé, surtout sur des sinusoïdes pures.

**Solution** : améliorer la résolution du Viterbi pour `m7b5`, pas le downgrade.

---

### 2. Même fondamentale, qualités différentes — **25,0 %** (24,0 s)

| Attendu | Détecté | Durée |
|---------|---------|:-----:|
| C:maj7 | `sus4` (A/C) ou `major` (B) | 16,00 s |
| C:major | `sus4` (A/C) ou `major` (B) | 8,00 s |

**Étape responsable** : **`_merge_similar_segments` (post-HMM, pré-downgrade).**

Tous les segments de racine C sont fusionnés en un seul (32 s) car
`_is_similar_quality(maj7, sus4) → True` (même famille 0). Le HMM initial
détectait des changements de qualité, mais la fusion les annule.

Le segment unique reçoit la qualité majoritaire de la moyenne chroma, qui
penche vers `sus4` (A/C) ou `major` (B) selon le comportement du downgrade.

**Solution** : désactiver ou assouplir `_merge_similar_segments` pour les
qualités de la même famille quand le changement est harmoniquement
significatif (maj7 ↔ sus4 ↔ major).

---

### 3. Dm7 → D7 (m7 → 7) — **8,3 %** (7,94 s)

| Attendu | Détecté | Durée |
|---------|---------|:-----:|
| D:m7 | `7` | 7,94 s |

**Étape responsable** : **`_downgrade_advanced_segments`** puis HMM.

Le HMM détecte `Dm7` (l'observation `Dm7` est dans les candidats), mais
le downgrade (toutes variantes) évalue l'énergie sur l'intervalle 10 (7ème).
Pour `m7`, le seuil est 0,08. Si l'énergie de la 7ème est insuffisante,
`m7` → `m`.

Ici le HMM émet déjà `D7` (dominante) en sortie Viterbi, pas `Dm7`.
L'observation montre `Dm7` score 1.0 mais Viterbi choisit `D7` (score 0.983).

**Cause** : la transition de `Dm7` à `G7` (V7 classique) est favorisée par
la matrice de transition (bonus quinte). Le Viterbi choisit D7 plutôt que
Dm7 pour anticiper la résolution vers G7.

**Solution** : revoir la matrice de transition pour ne pas favoriser
systématiquement `7` sur `m7` quand la fondamentale est identique.

---

### 4. Bbmaj7 → A# (major, variante C) — **8,2 %** (7,91 s)

| Attendu | Détecté | Durée |
|---------|---------|:-----:|
| A#:maj7 | `major` | 7,91 s |

**Étape responsable** : **`_downgrade_advanced_segments`** (variante C).

Le HMM détecte `A#7` (dominante). La variante C applique la logique
`distinctive_interval` pour `maj7` : si l'énergie sur l'intervalle 11
(7ème majeure) est insuffisante, le maj7 est downgradé en triade majeure.

**Cause** : les harmoniques du signal sinusoïdal ne produisent pas assez
d'énergie sur la 7ème majeure pour dépasser le seuil 0,15.

**Solution** : abaisser le seuil `maj7` de 0,15 à ~0,10, ou enrichir le
signal de test avec plus d'harmoniques.

→ C'est le seul cas de la variante C qui reste imparfait sur ce benchmark.

---

### 5. F7 → F7 (correct) — **8,3 %** (7,92 s) ✅

Seul segment parfait de prog4.

---

## Bilan

| Source d'erreur | Durée | % total | Dépend du downgrade ? | Priorité |
|-----------------|:-----:|:-------:|:---------------------:|:--------:|
| m7b5 → m/7 (HMM) | 7,94 s | 8,3 % | Non | 1 |
| Fusion même-racine (merge) | 24,00 s | 25,0 % | Non | 2 |
| m7 → 7 (Viterbi) | 7,94 s | 8,3 % | Indirect | 3 |
| maj7 → major (downgrade) | 7,91 s | 8,2 % | **Oui** | 4 |
| **Total erreur** | **47,79 s** | **49,8 %** | | |
| **Total correct** | **39,63 s** | **41,3 %** | | |
| Silence/gap (30ms×N) | 8,58 s | 8,9 % | — | — |

**Conclusion** : l'exactitude à 41,3 % est dominée par **deux problèmes
antérieurs au downgrade** :

1. **`_merge_similar_segments`** (25 % du temps) fusionne des qualités
   différentes de la même famille harmonique → perte de résolution.
2. **HMM/Viterbi** confond `m7b5` avec `m`/`7` (8,3 %) et favorise
   les transitions `m7→7` devant les résolutions de V7 (8,3 %).

Le downgrade (toutes variantes confondues) ne cause directement qu'environ
**8 à 16 %** des erreurs, selon la variante.

Pour dépasser 41,3 %, il faut agir sur le merge puis le Viterbi, pas sur
le downgrade.
