# Comparaison A/B/C — Progressions contrôlées

Généré le 2026-07-10 23:08

## prog1_dm7_g7_cmaj7

- 4 répétitions × 3 accords = 24s

| # | Accord | Root | Qualité | Notes |
|---|--------|------|---------|-------|
| 1 | Dm7 | D | m7 | D2, F3, A3, C4 |
| 2 | G7 | G | 7 | G2, B3, D4, F4 |
| 3 | Cmaj7 | C | maj7 | C2, E3, G3, B3 |

| Métrique | Variante A | Variante B | Variante C |
|---|---|---|---|
| Root (pondéré durée) | 98.9% | 98.9% | 98.9% |
| Qualité (pondéré durée) | 32.9% | 32.9% | 32.9% |
| Root + Qualité | 32.9% | 32.9% | 32.9% |
| Segments détectés | 12 | 12 | 12 |
| Segments attendus | 12 | 12 | 12 |
| Segments < 0.4s | 0 | 0 | 0 |
| Ratio fragmentation | 1.0 | 1.0 | 1.0 |
| Faux positifs 7 (durée) | 15.83s (66.0%) | 7.94s (33.1%) | 7.94s (33.1%) |
| Sus → major (durée) | 0.00s (0.0%) | 0.00s (0.0%) | 0.00s (0.0%) |

### Matrice de confusion — Variante A
| Attendu \ Détecté | `7` |
|---|---|
| `maj7` | 7.89s |
| `7` | 7.91s |
| `m7` | 7.94s |

### Matrice de confusion — Variante B
| Attendu \ Détecté | `major` | `7` |
|---|---|---|
| `maj7` | 7.89s | 0.00s |
| `7` | 0.00s | 7.91s |
| `m7` | 0.00s | 7.94s |

### Matrice de confusion — Variante C
| Attendu \ Détecté | `major` | `7` |
|---|---|---|
| `maj7` | 7.89s | 0.00s |
| `7` | 0.00s | 7.91s |
| `m7` | 0.00s | 7.94s |

### Préservation par qualité — Variante A
| Qualité (root:suffix) | Correct | Total (durée) | Taux |
|---|---|---|---|
| C:maj7 | 0.00s | 7.89s | 0.0% |
| D:m7 | 0.00s | 7.94s | 0.0% |
| G:7 | 7.91s | 7.91s | 100.0% |

### Préservation par qualité — Variante B
| Qualité (root:suffix) | Correct | Total (durée) | Taux |
|---|---|---|---|
| C:maj7 | 0.00s | 7.89s | 0.0% |
| D:m7 | 0.00s | 7.94s | 0.0% |
| G:7 | 7.91s | 7.91s | 100.0% |

### Préservation par qualité — Variante C
| Qualité (root:suffix) | Correct | Total (durée) | Taux |
|---|---|---|---|
| C:maj7 | 0.00s | 7.89s | 0.0% |
| D:m7 | 0.00s | 7.94s | 0.0% |
| G:7 | 7.91s | 7.91s | 100.0% |

## prog2_am7b5_d7_gm

- 4 répétitions × 3 accords = 24s

| # | Accord | Root | Qualité | Notes |
|---|--------|------|---------|-------|
| 1 | Am7b5 | A | m7b5 | A2, C4, Eb4, G4 |
| 2 | D7 | D | 7 | D2, F#3, A3, C4 |
| 3 | Gminor | G | minor | G2, Bb3, D4 |

| Métrique | Variante A | Variante B | Variante C |
|---|---|---|---|
| Root (pondéré durée) | 98.9% | 98.9% | 98.9% |
| Qualité (pondéré durée) | 65.8% | 65.8% | 65.8% |
| Root + Qualité | 65.8% | 65.8% | 65.8% |
| Segments détectés | 12 | 12 | 12 |
| Segments attendus | 12 | 12 | 12 |
| Segments < 0.4s | 0 | 0 | 0 |
| Ratio fragmentation | 1.0 | 1.0 | 1.0 |
| Faux positifs 7 (durée) | 2.00s (8.3%) | 2.00s (8.3%) | 2.00s (8.3%) |
| Sus → major (durée) | 0.00s (0.0%) | 0.00s (0.0%) | 0.00s (0.0%) |

### Matrice de confusion — Variante A
| Attendu \ Détecté | `7` | `m` |
|---|---|---|
| `7` | 7.91s | 0.00s |
| `m` | 0.00s | 7.89s |
| `m7b5` | 2.00s | 5.94s |

### Matrice de confusion — Variante B
| Attendu \ Détecté | `7` | `m` |
|---|---|---|
| `7` | 7.91s | 0.00s |
| `m` | 0.00s | 7.89s |
| `m7b5` | 2.00s | 5.94s |

### Matrice de confusion — Variante C
| Attendu \ Détecté | `7` | `m` |
|---|---|---|
| `7` | 7.91s | 0.00s |
| `m` | 0.00s | 7.89s |
| `m7b5` | 2.00s | 5.94s |

### Préservation par qualité — Variante A
| Qualité (root:suffix) | Correct | Total (durée) | Taux |
|---|---|---|---|
| A:m7b5 | 0.00s | 7.94s | 0.0% |
| D:7 | 7.91s | 7.91s | 100.0% |
| G:m | 7.89s | 7.89s | 100.0% |

### Préservation par qualité — Variante B
| Qualité (root:suffix) | Correct | Total (durée) | Taux |
|---|---|---|---|
| A:m7b5 | 0.00s | 7.94s | 0.0% |
| D:7 | 7.91s | 7.91s | 100.0% |
| G:m | 7.89s | 7.89s | 100.0% |

### Préservation par qualité — Variante C
| Qualité (root:suffix) | Correct | Total (durée) | Taux |
|---|---|---|---|
| A:m7b5 | 0.00s | 7.94s | 0.0% |
| D:7 | 7.91s | 7.91s | 100.0% |
| G:m | 7.89s | 7.89s | 100.0% |

## prog3_cmaj7_csus4_cmaj7_c

- 4 répétitions × 4 accords = 32s

| # | Accord | Root | Qualité | Notes |
|---|--------|------|---------|-------|
| 1 | Cmaj7 | C | maj7 | C2, E3, G3, B3 |
| 2 | Csus4 | C | sus4 | C2, F3, G3, B3 |
| 3 | Cmaj7 | C | maj7 | C2, E3, G3, B3 |
| 4 | C | C | major | C2, E3, G3, C4 |

| Métrique | Variante A | Variante B | Variante C |
|---|---|---|---|
| Root (pondéré durée) | 100.0% | 100.0% | 100.0% |
| Qualité (pondéré durée) | 25.0% | 25.0% | 25.0% |
| Root + Qualité | 25.0% | 25.0% | 25.0% |
| Segments détectés | 1 | 1 | 1 |
| Segments attendus | 16 | 16 | 16 |
| Segments < 0.4s | 0 | 0 | 0 |
| Ratio fragmentation | 0.062 | 0.062 | 0.062 |
| Faux positifs 7 (durée) | 0.00s (0.0%) | 0.00s (0.0%) | 0.00s (0.0%) |
| Sus → major (durée) | 0.00s (0.0%) | 8.00s (25.0%) | 0.00s (0.0%) |

### Matrice de confusion — Variante A
| Attendu \ Détecté | `sus4` |
|---|---|
| `major` | 8.00s |
| `maj7` | 16.00s |
| `sus4` | 8.00s |

### Matrice de confusion — Variante B
| Attendu \ Détecté | `major` |
|---|---|
| `major` | 8.00s |
| `maj7` | 16.00s |
| `sus4` | 8.00s |

### Matrice de confusion — Variante C
| Attendu \ Détecté | `sus4` |
|---|---|
| `major` | 8.00s |
| `maj7` | 16.00s |
| `sus4` | 8.00s |

### Préservation par qualité — Variante A
| Qualité (root:suffix) | Correct | Total (durée) | Taux |
|---|---|---|---|
| C: | 0.00s | 8.00s | 0.0% |
| C:maj7 | 0.00s | 16.00s | 0.0% |
| C:sus4 | 8.00s | 8.00s | 100.0% |

### Préservation par qualité — Variante B
| Qualité (root:suffix) | Correct | Total (durée) | Taux |
|---|---|---|---|
| C: | 8.00s | 8.00s | 100.0% |
| C:maj7 | 0.00s | 16.00s | 0.0% |
| C:sus4 | 0.00s | 8.00s | 0.0% |

### Préservation par qualité — Variante C
| Qualité (root:suffix) | Correct | Total (durée) | Taux |
|---|---|---|---|
| C: | 0.00s | 8.00s | 0.0% |
| C:maj7 | 0.00s | 16.00s | 0.0% |
| C:sus4 | 8.00s | 8.00s | 100.0% |

## prog4_f7_bbmaj7

- 4 répétitions × 2 accords = 16s

| # | Accord | Root | Qualité | Notes |
|---|--------|------|---------|-------|
| 1 | F7 | F | 7 | F2, A3, C4, Eb4 |
| 2 | Bbmaj7 | Bb | maj7 | Bb2, D4, F4, A4 |

| Métrique | Variante A | Variante B | Variante C |
|---|---|---|---|
| Root (pondéré durée) | 98.9% | 98.9% | 98.9% |
| Qualité (pondéré durée) | 49.5% | 49.5% | 49.5% |
| Root + Qualité | 49.5% | 49.5% | 49.5% |
| Segments détectés | 8 | 8 | 8 |
| Segments attendus | 8 | 8 | 8 |
| Segments < 0.4s | 0 | 0 | 0 |
| Ratio fragmentation | 1.0 | 1.0 | 1.0 |
| Faux positifs 7 (durée) | 7.91s (49.4%) | 0.00s (0.0%) | 0.00s (0.0%) |
| Sus → major (durée) | 0.00s (0.0%) | 0.00s (0.0%) | 0.00s (0.0%) |

### Matrice de confusion — Variante A
| Attendu \ Détecté | `7` |
|---|---|
| `maj7` | 7.91s |
| `7` | 7.92s |

### Matrice de confusion — Variante B
| Attendu \ Détecté | `major` | `7` |
|---|---|---|
| `maj7` | 7.91s | 0.00s |
| `7` | 0.00s | 7.92s |

### Matrice de confusion — Variante C
| Attendu \ Détecté | `major` | `7` |
|---|---|---|
| `maj7` | 7.91s | 0.00s |
| `7` | 0.00s | 7.92s |

### Préservation par qualité — Variante A
| Qualité (root:suffix) | Correct | Total (durée) | Taux |
|---|---|---|---|
| A#:maj7 | 0.00s | 7.91s | 0.0% |
| F:7 | 7.92s | 7.92s | 100.0% |

### Préservation par qualité — Variante B
| Qualité (root:suffix) | Correct | Total (durée) | Taux |
|---|---|---|---|
| A#:maj7 | 0.00s | 7.91s | 0.0% |
| F:7 | 7.92s | 7.92s | 100.0% |

### Préservation par qualité — Variante C
| Qualité (root:suffix) | Correct | Total (durée) | Taux |
|---|---|---|---|
| A#:maj7 | 0.00s | 7.91s | 0.0% |
| F:7 | 7.92s | 7.92s | 100.0% |

## Synthèse globale

| Métrique | Variante A | Variante B | Variante C |
|---|---|---|---|
| Root (pondéré durée) | 99.3% | 99.3% | 99.3% |
| Qualité (pondéré durée) | 41.3% | 41.3% | 41.3% |
| Root + Qualité | 41.3% | 41.3% | 41.3% |
| Segments total | 33 | 33 | 33 |
| Segments < 0.4s total | 0 | 0 | 0 |
| Ratio fragmentation moyen | 0.688 | 0.688 | 0.688 |
| Faux positifs 7 (durée) | 25.74s (26.8%) | 9.94s (10.4%) | 9.94s (10.4%) |
| Sus → major (durée) | 0.00s (0.0%) | 8.00s (8.3%) | 0.00s (0.0%) |

## Analyse qualitative

- **prog1_dm7_g7_cmaj7** : A: root=98.9%, qual=32.9%, full=32.9%, B: root=98.9%, qual=32.9%, full=32.9%, C: root=98.9%, qual=32.9%, full=32.9%
- **prog2_am7b5_d7_gm** : A: root=98.9%, qual=65.8%, full=65.8%, B: root=98.9%, qual=65.8%, full=65.8%, C: root=98.9%, qual=65.8%, full=65.8%
- **prog3_cmaj7_csus4_cmaj7_c** : A: root=100.0%, qual=25.0%, full=25.0%, B: root=100.0%, qual=25.0%, full=25.0%, C: root=100.0%, qual=25.0%, full=25.0%
- **prog4_f7_bbmaj7** : A: root=98.9%, qual=49.5%, full=49.5%, B: root=98.9%, qual=49.5%, full=49.5%, C: root=98.9%, qual=49.5%, full=49.5%

## Décision

À déterminer après analyse des résultats ci-dessus.
