# EXP-041 — Correction détection sous pédale (B2) — Résultats et diagnostic

## Résumé
**La correction complète n'est pas aboutie en une session.** Le diagnostic a révélé que le problème est structurel dans le modèle d'observation du HMM, pas dans le post-traitement. Le correctif tenté (post-processing split) améliore la segmentation mais pas l'identification d'accords.

## Vérification `FIFTH_CONFUSION_FIX`
✅ **Actif et fonctionnel** (ligne 627 `ENABLE_FIFTH_CONFUSION_FIX = True`, appelé ligne 4792)
- Essentiel sur B2 (EXP-013 : -43 pts si retiré)
- Toujours opérationnel dans le code actuel

## Diagnostic précis B2 actuel (baseline)

| Famille | CSR majmin | CSR 7ths | Problème principal |
|---------|-----------|----------|-------------------|
| F1 Pédale basse | 31% | 24% | **HMM aveugle aux changements d'harmonie** |
| F2 Quinte dominante | 59% | 59% | Dégradation sans basse (49%) |
| F3 Walking bass | 51% | 48% | Confusion basse/harmonie |
| F4 Arpège | 66% | 66% | Correct |
| F5 Silences | 63% | 57% | Correct |
| F6 Pédale + progression | 25% | 25% | **HMM aveugle** |
| **B2 TOTAL** | **49%** | **47%** | |

## Cause racine identifiée (confirmée par EXP-013/014)

Le Viterbi **fusionne les 8 segments de vérité terrain en 3** car le chroma global est dominé par la basse statique (pédale). L'information d'harmonie est perdue **avant** le post-traitement.

Exemple `b2_f1_v1_77` (pédale C, progression C-Am-F-G-C-Am-F-G) :
- **Vérité terrain** : 8 segments (C/Am/F/G × 2)
- **Viterbi sortie** : 3 segments (C7 18.7s / Am7 3.1s / Cmaj7 5.8s)
- **Post-traitement** : ne peut pas récupérer ce qui est déjà fusionné

Le chroma aigu (upper) **montre bien** les changements d'harmonie (cosinus change à chaque accord), mais n'est utilisé que pour *empêcher* des fusions, pas pour *détecter* des frontières.

## Tentative de correction (post-processing split)

Ajout de `_split_pedal_segments` après `_resolve_fifth_confusion` :
- Détecte segments avec basse statique + harmonie changeante (via upper chroma)
- Scinde aux frontières du chroma aigu
- Réattribue accords via chroma global (basse + aigu) + templates pondérés

**Résultats** :
- Segmentation améliorée (plus de segments créés)
- **Mais identification d'accords toujours faible** : le chroma global reste dominé par la basse
- Beaucoup de "N" (silence) sur sous-segments courts
- Scores B2 non mesurés complets (lent) mais sans gain significatif attendu

## Cause fondamentale

L'architecture actuelle sépare :
1. **Modèle d'observation** (global chroma) → Viterbi → segmentation
2. **Post-traitement** (upper chroma) → seulement prévention fusions

Le chroma aigu n'est **jamais** utilisé pour *découvrir* des frontières, seulement pour *valider* des fusions. L'information d'harmonie est jetée au Viterbi.

## Solution structurelle requise (hors scope session)

Modifier le **modèle d'observation** pour utiliser un mélange adaptatif :
```
si (basse_statique_détectée):
    observation = α × global_chroma + (1-α) × upper_chroma
sinon:
    observation = global_chroma
```

Ou bien : passer l'upper chroma en feature supplémentaire dans le HMM (états augmentés).

## Ce qui a été fait dans cette session

1. ✅ Confirmé `FIFTH_CONFUSION_FIX` actif
2. ✅ Diagnostiqué la cause racine (Viterbi fusionne avant post-traitement)
3. ✅ Tenté correctif post-traitement (`_split_pedal_segments`)
4. ✅ Non-régression : 302+ tests passent, build OK
5. ❌ Gain B2 non significatif (correctif structurel nécessaire)

## Recommandation pour relais suivant

**EXP-042 ou nouveau** : Modifier `_compute_observation_scores` pour :
1. Détecter basse statique (faible variance chroma global basses fréquences)
2. Si détectée : scorer avec mélange `0.5 × global + 0.5 × upper` (ou HMM à 2 chromas)
3. Valider sur B2 + non-régression B1/B3/B4/B5

## Non-régression confirmée
- ✅ 302+ tests unitaires (Partie 1, 3, chord-engine, gospel, jazz, neo-soul, validator)
- ✅ Build Vite OK
- ✅ B1/B4 non régressés (vérifié manuel)

## Note
Le correctif `_split_pedal_segments` reste dans le code (activé par `ENABLE_ARPEGGIO_FIGURE_ABSORPTION`) mais n'apporte pas de gain mesurable. Il peut servir de base pour un futur correctif d'observation.
