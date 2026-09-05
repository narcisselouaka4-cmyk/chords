# Mission v4 — Stabilisation de « You are Yahweh » — Rapport de résultats

## Approche choisie

Trois couches additives pures, ajoutées dans `electron/audio-processor.py`, **sans toucher au HMM baseline** (matrices de transition, templates, `_build_transition_matrix`, `_viterbi`) ni à Studio/Chordify/UI/chord-engine.

### 1. `_stabilize_antiparasite` (flag `ENABLE_ANTIPARASITE_STABILIZATION`)
Élimine les fondamentales diatoniques « passantes » (II, VII...) attirées par le bonus diatonique du HMM mais qui ne sont pas des accords structurels du morceau.

Deux avancées clés par rapport à `_stabilize_progression` (qui laissait passer les B) :

- **Détection robuste des structurels** (`_compute_structural_roots_v4`) : on combine la durée trimmée (total − max) **et** la durée moyenne par segment. Un parasite comme B (13 segments de ~2s) a une durée trimmée élevée (24s) mais une durée moyenne faible (2.13s) ; en exigeant `min_mean_segment_dur ≥ 2.5s`, B est exclu des structurels alors que D (3.05s) et E (2.93s) le restent. C'est la raison principale pour laquelle `_stabilize_progression` échouait : son critère « durée trimmée seule » classait B 2e, donc structurel, donc jamais absorbable.
- **Absorption par meilleur match de template** : le parasite est remplacé par le voisin structurel dont le template matche le mieux le chroma agrégé sur [voisin + parasite]. On ne se limite plus à `rp ∈ PC-set(neighbor)`, qui échouait pour B entre A car B ∉ {A, C#, E}.

### 2. `_refine_chorus_loops` (flag `ENABLE_CHORUS_LOOP_REFINE`)
Détecte les longues sections « plates » d'un accord structurel (ex: A tenu 20s) là où le ground truth attend une boucle périodique E-D-A, et y réinsère les accords manquants en se basant sur le **chroma local** (pas le HMM). Découpe en fenêtres de 2s, compare les templates des accords structurels candidats au chroma agrégé, ne réinsère que si l'accord alternatif bat l'accord plat d'une marge `min_margin ≥ 0.08`.

### 3. Bug fix `_diatonic_triad_suffix` (helper de post-traitement, hors HMM)
La table des tierces diatoniques majeures était erronée : `{0:4, 2:4, 4:4, 5:3, 7:4, 9:3, 11:3}` classait IV (D en La majeur) comme mineur et iii (E) comme majeur. Corrigé en `{0:4, 2:3, 4:3, 5:4, 7:4, 9:3, 11:3}` + `vii° → 'dim'`. Sans ce fix, `_refine_chorus_loops` réinsérait des Dm au lieu de D.

Toutes les couches sont **paramétrables et désactivables** via leurs flags `ENABLE_*`.

## Comparaison avant / après sur `/tmp/local_piano3.wav`

| Métrique                          | Avant (baseline) | Après (v4)    |
|-----------------------------------|------------------|---------------|
| Segments totaux                   | 46               | 44            |
| Segments parasites (B/C#m7/C#sus4)| 15               | **0**         |
| Durée B parasite                  | 27.73s (18.6%)   | **0s (0%)**   |
| Durée structurelle (A,D,E,F#m)    | 119.33s (79.9%)  | **146.33s (100%)** |
| Recall structurel (exact-match)   | 43.9%            | **51.5%**     |
| Overlap moyen par section         | 31.3%            | **48.1%**     |

Répartition par fondamentale après :
```
   A   68.88s   47.1%  [STRUCT]
   E   36.81s   25.2%  [STRUCT]
   D   25.53s   17.4%  [STRUCT]
   F#  15.11s   10.3%  [STRUCT]
```

### Structure du refrain détectée (extrait 45–60s)
```
45.83-49.83  E
49.83-51.83  D
51.83-55.83  A
55.83-59.83  E
```
La boucle E-D-A du refrain est désormais **reconnaisable** (critère de réussite idéal atteint), alors qu'elle était noyée dans un long segment A de 23s en baseline.

## Critères de réussite

| Critère                                                 | Statut |
|---------------------------------------------------------|--------|
| Aucune régression sur les tests existants              | ✅ (15/17 inchangé, RC=0) |
| Réduction significative des B/C#m7/C#sus4 parasites    | ✅ (15 → 0) |
| Fondamentales structurelles A,D,E,F#m ≥ 80% durée totale| ✅ (100%) |
| Progression du refrain montre E→D→A reconnaissable     | ✅ |
| Correspondance temporelle ±2s sur grandes sections     | Partiel (overlap 48%, limité par le HMM baseline qui ne détecte pas les courts E/D noyés dans la tonique) |
| F#m correctement positionné en intro (non en fin)      | Partiel (F#m en intro à 17.41-20.83 OK ; outro scindé en F#m/A/F#m) |

## Tests de régression (validation obligatoire)

```
python3 tests/test_harmonic_deterministic.py   → 15/17 passés, RC=0 (baseline inchangée)
node src/chord-engine/test-chords.js          → 98/98 réussis, RC=0
node src/analyzer/test-regression-part1.js    → Partie 1 done, RC=0
node src/chord-engine/test-regression-part3.js→ Partie 3 done, RC=0
npm run build                                 → built in 1.60s, RC=0
```

Note : `test_harmonic_deterministic.py` affiche 2 échecs **avant et après** modification (15/17 dans les deux cas). Ce sont des échecs préexistants non liés à cette mission (cas Em/G/F que le HMM baseline ne résout pas).

## Livrables

1. `electron/audio-processor.py` :
   - `_compute_structural_roots_v4` (helper partagé)
   - `_stabilize_antiparasite` + flag `ENABLE_ANTIPARASITE_STABILIZATION`
   - `_refine_chorus_loops` + flag `ENABLE_CHORUS_LOOP_REFINE`
   - fix `_diatonic_triad_suffix` (table des tierces majeures)
   - appels insérés dans `analyze_chords` après `_stabilize_progression`
2. `opencode-tasks/benchmark-you-are-yahweh.py` : script de comparaison automatique au ground truth.
3. `opencode-tasks/baseline-v4.txt` et `opencode-tasks/after-v4.txt` : dumps avant/après.

## Limites résiduelles

L'overlap temporel reste à 48% (objectif idéal : ±2s sur les grandes sections). La cause est le **HMM baseline lui-même** : sur les sections E courtes (2s) du refrain, le chroma montre E>A mais le bonus diatonique de la tonique (A) + la transition pousse le Viterbi vers A. La mission interdisant de toucher au HMM, `_refine_chorus_loops` contourne le problème en réévaluant le chroma local post-Viterbi, mais ne peut pas récupérer les frontières exactes que le HMM n'a pas détectées. Une amélioration future nécessiterait de modifier le modèle d'observation (interdit ici).