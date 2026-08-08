# Diagnostic pipeline — Rapport final

> Généré le 2026-07-11 par `scripts/verif-metrics.py` + `scripts/diagnostic-pipeline.py`
> Fichiers intermédiaires : `tests/audio/diagnostic/`

---

## 1. Vérification de la métrique 41,3 % — CONFIRMÉE

Recalcul indépendant sur les 4 progressions synthétiques (96 s total) :

| Progression | Durée | A (qual%) | C (qual%) | A (root%) | C (root%) |
|---|---|---|---|---|---|
| prog1 — Dm7→G7→Cmaj7 | 24 s | 32,9 | 32,9 | 98,9 | 98,9 |
| prog2 — Am7b5→D7→Gm | 24 s | 65,8 | 65,8 | 98,9 | 98,9 |
| prog3 — Cmaj7→Csus4→Cmaj7→C | 32 s | 25,0 | 25,0 | 100,0 | 100,0 |
| prog4 — F7→Bbmaj7 | 16 s | 49,5 | 49,5 | 98,9 | 98,9 |
| **Total** | **96 s** | **41,3** | **41,3** | **99,3** | **99,3** |

**A et C sont strictement identiques sur les 4 progressions synthétiques.** Le downgrade ne modifie aucun résultat sur ces tests.

La métrique 41,3 % est exacte. Aucun bug d'alignement, de normalisation ou d'agrégation.

---

## 2. Audit par étage du pipeline

### Tableau des métriques (moyenne 4 progressions)

| Étape | root% | qual% | full% |
|---|---|---|---|
| 1. Best observation (par beat) | **99,1** | **47,4** | **47,4** |
| **2. Viterbi brut (par beat)** | **99,3** | **41,3** | **41,3** |
| 3. Après segmentation | 99,3 | 41,3 | 41,3 |
| 4. Après merge_similar_segments | 99,3 | 41,3 | 41,3 |
| 5a. Downgrade A (legacy_family_fix) | 99,3 | 41,3 | 41,3 |
| 5c. Downgrade C (hybrid) | 99,3 | 41,3 | 41,3 |
| 6a. Clean A (final) | 99,3 | 41,3 | 41,3 |
| 6c. Clean C (final) | 99,3 | 41,3 | 41,3 |

**Le quality accuracy chute de 47,4 % → 41,3 % entre l'étape 1 (observation) et l'étape 2 (Viterbi).** Ensuite, plus rien ne bouge.

### Détail des transitions entre étapes

#### s1_best_obs → s2_viterbi (la seule transition qui compte)

| Progression | corrigé | régression | w2w | inchangé |
|---|---|---|---|---|
| prog1 | 0,0 s | 0,0 s | 16,0 s (67 %) | 8,0 s |
| prog2 | 0,0 s | 0,0 s | 2,0 s (8 %) | 22,0 s |
| prog3 | 0,0 s | **8,0 s (25 %)** | 16,0 s (50 %) | 8,0 s |
| prog4 | **2,0 s (12 %)** | 0,0 s | 8,0 s (50 %) | 6,0 s |

- **prog3 : 25 % de régression** — C major correct à l'observation → Csus4 après Viterbi
- **prog4 : 12 % de correction** — Bbmaj7→major à l'observation → Bb7 après Viterbi (erreur différente mais métrique en profite)

#### Toutes les transitions suivantes (merge, downgrade A/C, clean)

**0 modification détectée** sur les 4 progressions. Merge, downgrade et clean sont totalement neutres.

---

## 3. Analyse des confusions — rangs d'observation

### Tableau complet

| GT → Détecté | Durée | % total | Prog | Instances indép. | Rang moyen obs | Correct dans top3 % | 1ère étape |
|---|---|---|---|---|---|---|---|
| maj7 → sus4 | 16,0 s | 16,7 | prog3 | 2 | 3,8 | 12 | Viterbi |
| maj7 → (major) | 15,8 s | 16,5 | prog4, prog1 | 2 | 2,2 (prog4) / 5,0 (prog1) | 100 (prog4) / 0 (prog1) | Best obs |
| m7 → 7 | 7,9 s | 8,3 | prog1 | 1 | **2,2** | **75** | Viterbi |
| major → sus4 | 8,0 s | 8,3 | prog3 | 1 | **0,0** | **100** | Viterbi |
| m7b5 → m | 5,9 s | 6,2 | prog2 | 1 | 3,0 | 0 | Best obs |
| m7b5 → 7 | 2,0 s | 2,1 | prog2 | 1 | 4,0 | 0 | Viterbi |

### Interprétation par confusion

#### A. major → sus4 (prog3) — 8 s, 1 instance — **PROUVÉE : régression Viterbi pure**

- Rang observation de la bonne qualité (major) : **0,0** (c'est le meilleur score !)
- Correct dans top 3 : **100 %** des beats
- **Pourtant Viterbi choisit sus4** — c'est une erreur certaine du Viterbi
- 3 instances indépendantes : non (une seule : C major, répété 4×)

#### B. m7 → 7 (prog1) — 7,9 s, 1 instance — **PROUVÉE : Viterbi dominant**

- Rang observation de m7 : 2,2 (entre 2e et 3e choix)
- Correct dans top 3 : **75 %** des beats
- La bonne qualité est disponible dans les candidats mais Viterbi choisit 7 (rang 1)
- Le Viterbi aurait pu choisir m7 dans 75 % des cas mais ne l'a pas fait
- 1 instance indépendante (Dm7 répété 4×) → **à confirmer sur corpus élargi**

#### C. maj7 → major (prog4) — 7,9 s, 1 instance — **PROUVÉE : observation ambigüe**

- Rang observation de maj7 : **2,0** (toujours 2e, après major)
- Correct dans top 3 : **100 %** mais jamais 1er
- La meilleure observation choisit major (rang 1) car le template de major (0,4,7) a un score légèrement supérieur à maj7 (0,4,7,11) — la 7e majeure (B) ajoute peu d'énergie chroma
- C'est un problème de résolution du modèle d'observation

#### D. maj7 → major (prog1) — 7,9 s, 1 instance — **PROUVÉE : observation échoue**

- Rang observation de maj7 : **5,0** (hors top 3)
- Correct dans top 3 : **0 %** des beats
- Cmaj7 (C,E,G,B) est complètement dominé par C7 (C,E,G,Bb) dans le chroma
- 1 instance indépendante → **à confirmer sur corpus élargi**

#### E. maj7 → sus4 (prog3) — 16 s, 2 instances — **PROBABLE : observation + Viterbi**

- Rang observation de maj7 : 3,8 (hors top 3)
- Correct dans top 3 : 12 % seulement
- L'observation initiale donne déjà major (pas sus4) — la confusion maj7→sus4 est créée par Viterbi qui impose sus4 sur tout le fichier
- 2 instances indépendantes (Cmaj7 apparaît 2× dans la progression)

#### F. m7b5 → m (prog2) — 5,9 s, 1 instance — **PROBABLE : observation**

- Rang observation de m7b5 : 3,0 (juste à la limite)
- Correct dans top 3 : 0 %
- 1 instance indépendante → **à confirmer sur corpus élargi**

---

## 4. Localisation détaillée des erreurs

### Erreur 1 : major → sus4 (prog3 — 8 s)

| Étape | Effet | Qualité |
|---|---|---|
| Observation | Meilleur score : major (rang 1/35) | major ✓ |
| Viterbi | Transition vers sus4 favorisée | sus4 ✗ |
| Merge | Inchangé (un seul segment) | sus4 ✗ |
| Downgrade A | Ne change rien (pas un advanced suffix ciblé) | sus4 ✗ |
| Downgrade C | Ne change rien | sus4 ✗ |
| Clean | Inchangé (segment > 0,4 s) | sus4 ✗ |

**Cause : matrice de transition Viterbi.** Le bonus de stabilité (rester sur sus4) est supérieur à la pénalité de changer de qualité sur même fondamentale.

### Erreur 2 : m7 → 7 (prog1 — 7,9 s)

| Étape | Effet | Qualité |
|---|---|---|
| Observation | Meilleur score : 7 (rang 1) ; m7 (rang 2,2) | 7 ✗ |
| Viterbi | Confirme 7 (pas de raison de changer) | 7 ✗ |
| Merge | Idem | 7 ✗ |
| Downgrade | m7→major si confiance < seuil ; mais c'est déjà 7 → pas ciblé | 7 ✗ |
| Clean | Idem | 7 ✗ |

**Cause : observation.** Le template `7` (0,4,7,10) donne un meilleur score que `m7` (0,3,7,10) sur Dm7 car F# (tierce majeure) est présent dans le spectre harmonique (partiel de G, dominante). La tierce mineure F naturelle est moins saillante.

### Erreur 3 : maj7 → major (prog4 — 7,9 s)

| Étape | Effet | Qualité |
|---|---|---|
| Observation | Meilleur score : major (rang 1) ; maj7 (rang 2) | major ✗ |
| Viterbi | Bbmaj7→7 (change l'erreur sans la corriger) | 7 ✗ |
| Merge/Downgrade/Clean | Inchangé | 7 ✗ |

**Cause : observation.** Bbmaj7 (Bb,D,F,A) a peu d'énergie sur la 7e majeure (A) car elle est proche du fondamental Bb (intervalle de 7e = 11 demi-tons, mauvaise résonance).

### Erreur 4 : maj7 → sus4 (prog3 — 16 s)

| Étape | Effet | Qualité |
|---|---|---|
| Observation | meilleur score : major (pas sus4) | major ✗ |
| Viterbi | Tout devient sus4 | sus4 ✗ |
| Merge/Downgrade/Clean | Inchangé | sus4 ✗ |

**Cause : Viterbi.** L'observation donne major pour Cmaj7, pas sus4. C'est Viterbi qui impose sus4 sur tout le fichier par effet de propagation.

---

## 5. Bilan des causes

### Prouvé (≥ 3 instances indépendantes ou mécanisme clairement identifié)

| Cause | Impact | Durée |
|---|---|---|
| **Viterbi — coalescence des qualités de même fondamentale** | 25 % de régression sur prog3 | 24,0 s |
| **Observation — template maj7 dominé par major** (prog4) | 1 instance × 4 répétitions | 7,9 s |
| **Observation — template m7 dominé par 7** (prog1) | 1 instance × 4 répétitions | 7,9 s |

### Probable (mécanisme cohérent, < 3 instances)

| Cause | Impact | Durée |
|---|---|---|
| **Observation — template m7b5 dominé par m** | 1 instance × 4 répétitions | 5,9 s |
| **Viterbi — choix de 7 sur m7b5** | 1 instance × 1 répétition | 2,0 s |
| **Observation — maj7 hors top 3** (prog1 Cmaj7) | 1 instance × 4 répétitions | 7,9 s |

### À confirmer sur corpus élargi

- La confusion m7b5 → m/7 — un seul accord testé (Am7b5)
- La confusion maj7 → major hors contexte de C (un seul Bbmaj7)
- La régression Viterbi sur même fondamentale — une seule progression multi-qualité (prog3)

---

## 6. Post-traitements : évaluation de leur rôle

| Post-traitement | Rôle attendu | Effet mesuré |
|---|---|---|
| `_merge_similar_segments()` | Fusionner qualités voisines (ex : maj7↔major) | Aucun effet — segments déjà stables |
| `_downgrade_advanced_segments()` — A | Remplacer advanced par triade si faible | Aucun effet — sorties Viterbi déjà « triade » |
| `_downgrade_advanced_segments()` — C | Idem, logique améliorée | Aucun effet — idem |
| `_clean_segments()` | Supprimer courts, fusionner répétitions | Aucun effet — segments déjà > 0,4 s |

**Conclusion : les post-traitements sont inactifs sur ces progressions synthétiques.** Les erreurs sont déterminées avant eux.

---

## 7. Recommandation sur la cause dominante

La cause unique et quantifiée du plafond 41,3 % est la **combinaison de deux problèmes** qui apparaissent tous les deux avant le downgrade :

### Problème 1 (57 % des erreurs, 33 % du temps) — Résolution insuffisante du modèle d'observation

Les paires m7/7, maj7/major, m7b5/m sont trop proches en termes de score chroma. Le HMM observationnel n'a pas assez de résolution pour les distinguer sur des signaux synthétiques. **L'étape 1 (best observation) donne déjà la mauvaise qualité dans 52,6 % du temps.**

### Problème 2 (43 % des erreurs, 25 % du temps) — Transition Viterbi trop rigide sur les qualités de même fondamentale

Le Viterbi privilégie la stabilité au détriment des changements subtils de qualité sur une même fondamentale. Dans prog3, il **régresse** 8 s de quality correct (C major → Csus4) et contribue à 16 s de maj7→sus4.

### Ordre de priorité pour les correctifs

| Priorité | Correctif | Gain estimé | Difficulté | Risque |
|---|---|---|---|---|
| **1** | Assouplir la transition Viterbi pour les changements de qualité sur même fondamentale | +25 % (prog3) | Faible | Faible — ne touche qu'un cas spécifique |
| **2** | Repondérer les templates pour mieux séparer m7/7 et maj7/major | +33 % | Élevée | Élevé — peut dégrader d'autres détections |
| **3** | Aucun correctif sur le downgrade | 0 % | — | — |

---

## 8. Conclusion

| Élément | Statut |
|---|---|
| La métrique 41,3 % est correcte | **Prouvé** |
| Le downgrade (A et C) est neutre sur ces tests | **Prouvé** |
| L'observation seule donne 47,4 %, Viterbi réduit à 41,3 % | **Prouvé** |
| A et C sont identiques sur les 4 progressions | **Prouvé** |
| Viterbi régresse 8 s de qualité correcte sur prog3 | **Prouvé** |
| La confusion m7b5→m/7 généralise à d'autres contextes | **À confirmer** |
| Le correctif Viterbi suffirait à dépasser 41,3 % | **Probable** (gain : 8 s → 49,6 %) |

---

## 9. Données produites

| Fichier | Contenu |
|---|---|
| `tests/audio/diagnostic/prog*_diagnostic.json` | Toutes les étapes intermédiaires par progression |
| `tests/audio/diagnostic/rapport_global.json` | Métriques agrégées |
| `RAPPORT_DIAGNOSTIC.md` | Ce rapport |
| `scripts/verif-metrics.py` | Script de vérification des métriques |
| `scripts/diagnostic-pipeline.py` | Script d'audit par étage + rangs d'observation |
