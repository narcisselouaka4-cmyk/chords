# EXP-045 — Transition vers rootless mapping (B5)

## Contexte
Suite aux EXP-040 à EXP-044, le moteur de détection d'accords a été considérablement amélioré sur les batteries B1-B4. La batterie B5 (voicings jazz rootless) reste le point faible principal avec ~37% CSR majmin.

## État actuel B5

| Famille | Cas | Ground Truth | Détection actuelle | Score |
|---------|-----|--------------|-------------------|-------|
| f1_no_root | 1 | C-F-Dm-G7 | C/Am/F/G | 0% |
| f2_upper | 1 | C7-Dm-G7-C | C7/Dm/G7/C | 62% |
| f3_quartal | 1 | C-Fm-Dm-G7 | C/Fm-Dm-G | 50% |
| f4_slash | 1 | C-G-Am-D | C/G-Am-D | 37% |
| f5_tensions | 1 | Fm-G7-Dm-C | Fm-G7-Dm-C | 37% |

**Total B5 : 37% majmin / 17% sevenths**

## Diagnostic

### Problème principal : Rootless (f1_no_root = 0%)
Le cas `b5_f1_no_root` a pour ground truth : C-F-Dm-G7 (basse joue la quinte).
Le moteur détecte : C-F-Dm-G7 → mais le premier accord C est détecté comme Cmaj (sans 7e) au lieu de Cmaj7 attendu.

Le problème : les voicings rootless (sans fondamentale jouée) ne correspondent à aucun template HMM. Les templates actuels exigent la fondamentale (poids 1.0 sur PC 0).

### Problème secondaire : Tensions (f5_tensions = 37%)
Les accords avec 9/11/13 ne sont pas reconnus car le vocabulaire s'arrête aux 7èmes.

## Hypothèses testées

| Hypothèse | Approche | Complexité | Impact attendu |
|-----------|----------|------------|----------------|
| 1. Alias rootless | États supplémentaires `m7_noroot`, `7_noroot`, `maj7_noroot` | Faible | +10-15pp sur f1 |
| 2. Templates partiels | Templates sans fondamentale | Moyenne | +5-10pp |
| 3. Clustering qualité | Grouper extensions | Élevée | +5pp |
| 4. Post-hoc mapping | Remplacement post-Viterbi | Faible | +5-10pp |

## Choix : Hypothèse 1 (Alias rootless) - IMPLÉMENTÉE PARTIELLEMENT

Templates ajoutés dans `CHORD_TEMPLATES_WEIGHTED` :
- `m7_noroot`: [(3, 0.9), (7, 0.7), (10, 0.5)]
- `7_noroot`: [(4, 0.8), (7, 0.6), (10, 0.5)]
- `maj7_noroot`: [(4, 0.9), (7, 0.7), (11, 0.6)]

**Résultat actuel sur f1_no_root** : 0% (toujours) — les templates existent mais ne sont pas utilisés car le HMM ne génère pas ces états sans déclencheur.

## Prochaine étape : Post-hoc mapping (Hypothèse 4)

Ajouter une étape post-Viterbi `_map_rootless_chords` qui :
1. Détecte les segments où la fondamentale n'est pas dans le chroma (basse ≠ fondamentale)
2. Tente de mapper vers l'équivalent rootless si le chroma upper matche
3. Exemple : si `Cmaj` détecté mais basse = E et upper = G-B-D-F# → `Cmaj7/E`

## Décision de périmètre (2026-08-27)

La détection d'accords enrichis, rootless et tensions est **trop complexe et
hors périmètre prioritaire** pour le moteur actuel. Les templates rootless
seront maintenus en commentaire/ documentation mais **non réactivés**.

Le moteur reste sur le vocabulaire simple :
`maj`, `min`, `maj7`, `m7`, `7`, `dim`, `dim7`, `aug`, `aug7`.

L'effort futur sur l'analyse se concentrera sur la robustesse de la structure
harmonique de base (B1-B4) plutôt que sur l'enrichissement harmonique.

## Prochaines étapes

Aucune pour B5 rootless. Ce sujet est clos.

## Non-régression à vérifier
- B1 (ii-V-I) : 100% Gm7 posthoc
- B2 (pédale) : 43%+ F1, 25%+ F6
- B3 (anticipation) : 72%+ majmin
- B4 (tempo) : 19/20 exact
- Tests unitaires : 302+ pass

## Fichiers à modifier
- `electron/audio-processor.py` : ajouter `_map_rootless_chords` et l'appeler en fin de pipeline
