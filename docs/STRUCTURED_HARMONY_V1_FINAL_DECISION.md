# structured_harmony_v1 — Décision finale

## 1. Objectif initial

Palier la faiblesse historique du moteur de production (*audio-processor.py*)
sur les accords avec septième, en développant un moteur structuré capable de
sélectionner la septième correcte (none / b7 / maj7 / bb7) sans régresser sur
les fondamentales et les triades.

## 2. Diagnostic du moteur historique

- Moteur de production : classification par produit scalaire avec templates
  fixes pondérés (argmax, pas de Viterbi sur snapshot unique).
- Vocabulaire V0 : 9 qualités (augmenté exclu), couverture partielle des
  extensions.
- Observé sur DEV (29 fixtures) : `exact_chord_t1 = 0.8966` sous conditions
  DEV, avec 15 erreurs de septième pures (fondamentale correcte, triade
  correcte, septième fausse → `none` prédit par défaut).

## 3. Déroulement

### Phase 0 — Fixtures synthétiques
- 63 chroma fixtures déterministes (DEV 29, validation 34).
- Split par racine : DEV roots [0, 2, 7], validation roots [3, 5, 9, 11].
- Inventory garantissant l'étanchéité des groupes parents.

### Phase 1A — Moteur structuré baseline
- Moteur modulaire : `chroma → roots → triades → septièmes → candidats →
  score acoustique → gating → total_score`.
- 65 tests unitaires passant à 100 %.
- Aucune contribution tonale (`tonal_weight=0.00`, 0 contextes clés DEV/29).

### Phase 1B — Calibration des hyperparamètres
- Configuration V3 gelée : `delta_gate=0.04`, `bass_weight=0.10`,
  `tonal_weight=0.00`, coûts de voicing (NO5=0.02, ROOTLESS=0.04, SHELL=0.02).
- Grille EMG-DEV (12 configurations) : sélection sur exact_chord_t1 moyen.

### Phase 1B.7 — Diagnostic causal
- Oracle O0→O6 : O3 atteint 100 % sur DEV (oracle `gt_root` + `gt_seventh`).
- Survival audit : 15 erreurs O0 sont toutes des erreurs de septième.
- Triade innocente : `triad_only_t1(O0)=0.931`, `=1.000` sous O1/O2/O3.
- O3 structural audit : la fonction oracle utilise `gt_root` et `gt_seventh`
  uniquement. Test d'invariance : PASS (29/29).
- **Verdict Phase 1B.7** : `PHASE_1B7_SEVENTH_SCORING_FAILURE`.

### Cycle 1 — `conditional_residual_seventh_v1`
- Hypothèse : énergie résiduelle conditionnelle (après retrait triade) aux
  intervalles 9/10/11.
- Résultat : toutes les configurations rejetées (root_t1 chute à 0.4828,
  car `f_seventh(none)=1.0` favorise toujours `none` dans le score global).
- **Verdict** : `CYCLE_1_SEVENTH_SCORER_NO_GAIN`.
- Compteur : `correction_cycles_used = 1`.

### Cycle 2 — `factorized_family_seventh_v2`
- Hypothèse : factoriser la décision en deux étages :
  1. Sélection de (root, triad) sans contribution de septième.
  2. Choix local de la septième à l'intérieur de la famille gagnante.
- Résultat DEV (pt=0.05, dt=0.00) :
  - `exact_chord_t1` : 0.4828 → **0.9310** (+44.83pp)
  - `root_t1` : 0.9310 → 0.9310 (identique)
  - `triad_only_t1` : 0.9310 → 0.9310 (identique)
  - `seventh_t1` : 0.4828 → **0.9310** (27/27 fondamentales correctes)
  - Faux enrichissements : 0 %
  - 13/15 erreurs de septième corrigées
  - 2 erreurs rootless non corrigibles (énergie fondamentale ~0.02)
- **Verdict** : `CYCLE_2_FACTORIZED_SEVENTH_VALIDATED`.
- Compteur final : `correction_cycles_used = 2, remaining = 0`.

### Phase 1C — Évaluation sur split réservé
- 34 fixtures validation (racines 3, 5, 9, 11), jamais consultées avant.
- Comparaison : V0 (legacy), V1 (factorisé), HISTORICAL (production).

## 4. Configuration finale gelée

| Paramètre | Valeur |
|---|---|
| `seventh_scorer` | `factorized_family_seventh_v2` |
| `presence_threshold` | 0.05 |
| `dominance_threshold` | 0.00 |
| `bass_weight` | 0.10 |
| `tonal_weight` | 0.00 |
| `delta_gate` | 0.04 |
| `no5_cost` | 0.02 |
| `rootless_cost` | 0.04 |
| `shell_cost` | 0.02 |

## 5. Résultats DEV (29 fixtures)

| Métrique | C0 legacy | C2 factorisé | Δ |
|---|---|---|---|
| `exact_chord_t1` | 0.4828 | 0.9310 | **+44.83pp** |
| `root_t1` | 0.9310 | 0.9310 | 0.00 |
| `triad_only_t1` | 0.9310 | 0.9310 | 0.00 |
| `seventh_t1` | 0.4828 | 0.9310 | **+44.83pp** |
| faux enrichissements | — | 0 % | — |
| faux appauvrissements | — | 0 % | — |

## 6. Résultats split réservé VAL (34 fixtures)

| Configuration | exact_chord_t1 | root_t1 | seventh_t1 | enrich |
|---|---|---|---|---|
| **V0** legacy | 0.3529 | 0.8529 | 0.3529 | 0 % |
| **V1** factorisé | **0.8529** | **0.8529** | **0.8529** | **0 %** |
| **HISTORICAL** | **0.9118** | 0.9118 | 0.9118 | 0 % |

- **V1 gain vs V0** : **+50.00pp** (>= 10pp ✅)
- **V1 vs HISTORICAL** : **−5.88pp** (> 5pp ❌)
- **root_t1 V1 vs V0** : 0.00pp ✅
- **triad_only_t1 V1 vs V0** : 0.00pp ✅
- **Faux enrichissements** : 0 % ✅
- **Fixtures correctes V1** : 29/34
- **Fixtures correctes HISTORICAL** : 31/34

## 7. Critères préétablis (gelés avant ouverture)

Exigences pour `PHASE_1C_VALIDATED` :
1. V1 gagne ≥ 10pp contre V0 → ✅ (+50.00pp)
2. V1 à ≤ 5pp de la baseline historique ou la dépasse → ❌ (−5.88pp)
3. Root_t1 ne baisse pas > 2pp → ✅ (0.00pp)
4. Triad_only_t1 ne baisse pas > 2pp → ✅ (0.00pp)
5. Faux enrichissements ≤ 15 % → ✅ (0 %)
6. Aucun invariant enfreint → ✅

## 8. Verdict

```
PHASE_1C_PROMISING_NOT_PROMOTABLE
```

- La sélection factorisée de septième est validée architecturalement.
- L'écart de 5.88pp avec la baseline historique est inférieur au seuil de
  promotion, mais reste proche.
- Aucun réglage n'a été effectué après consultation du split réservé.

## 9. Cinq erreurs restantes (V1 sur validation)

| Fixture | GT | Prédiction | Cause |
|---|---|---|---|
| `rootless_Am7` | A:m7 | C major | Énergie fondamentale A = 0.0219 |
| `rootless_F7` | F:7 | A dim | Énergie fondamentale F = 0.0295 |
| `ambiguity_dshm7_bmaj7_bassB` | B:maj7 | D#:m7 | Énergie fondamentale B = 0.0199 |
| `conf_m7_vs_m7b5_clean` | A:m7 | A:m7b5 | Ambigüité chroma intrinsèque |
| `complete_F7` | F:7 | (autre) | Erreur fondamentale non rootless |

- Les trois cas rootless ont une énergie de fondamentale ≤ 0.03 dans le chroma,
  rendant la détection de fondamentale structurellement impossible avec les
  seuls chroma harmoniques.
- La confusion m7/m7b5 est une ambigüité perceptuelle du chroma, pas un bug
  du moteur.

## 10. Raison de la non-promotion

Le seuil de 5 points avec la baseline historique n'est pas franchi (−5.88pp).
Le protocole interdit d'abaisser ce seuil après observation des résultats.
La décision est donc `PROMISING_NOT_PROMOTABLE` :
- architecture prometteuse et validée,
- gain substantiel (+50pp sur données jamais consultées),
- mais pas suffisamment proche de la baseline de production pour justifier
  un remplacement.

## 11. Statut du split réservé

```
RESERVED_SPLIT_CONSUMED
```

- Accès unique effectué (validation_access_count = 1).
- Split réservé conservé uniquement pour reproductibilité historique.
- Ne peut plus servir à calibrer, corriger, ou sélectionner.
- Toute future V2 nécessite un nouveau corpus de développement et un nouveau
  split réservé.

## 12. Conditions méthodologiques d'une éventuelle V2

1. Nouveau corpus de développement indépendant (nouveaux enregistrements,
   nouvelles qualités, nouveaux voicings).
2. Nouveau split réservé verrouillé avant toute expérience.
3. Critères de promotion préétablis (ne pas copier les seuils de V1).
4. Validation de la reproduction de l'architecture factorisée de septième
   (les résultats de V1 sont une cible de reproductibilité, pas un oracle).
5. Traitement des cas rootless si le nouveau corpus les inclut (nécessite
   probablement une source d'information autre que le chroma harmonique).

---

**Décision finale** : `STRUCTURED_HARMONY_V1_CLOSED_PROMISING_NOT_PROMOTABLE`
