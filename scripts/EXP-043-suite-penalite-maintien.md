# EXP-043 Suite — Affinage pénalité de maintien 2e passe Viterbi

## Contexte
EXP-043 a implémenté une deuxième passe Viterbi ciblée sur les segments pédale (basse statique), avec une pénalité de maintien de **-0.02** pour forcer les changements d'accord. Résultats initiaux : F1 +18pp, F6 +14pp, mais F6 montre sur-segmentation (13 seg détectés vs 8 GT).

## Objectif
Tester si une pénalité réduite (**-0.01** au lieu de -0.02) réduit la sur-segmentation F6 sans dégrader F1.

## Résultats mesurés sur B2 (families F1 et F6)

| Pénalité | F1 majmin | F1 seg/GT | F6 majmin | F6 seg/GT | Note |
|----------|-----------|-----------|-----------|-----------|------|
| **-0.02** (retenu) | 43.2% | 5.5/8 | 25.0% | 11.3/8 | Sur-segmentation F6 |
| **-0.01** | 43.2% | 5.0/8 | 25.0% | 11.5/8 | Légèrement pire F6 |
| **-0.015** (intermédiaire) | 43.2% | 5.0/8 | 25.0% | 11.5/8 | Identique à -0.01 |

## Analyse

| Famille | -0.02 | -0.01 | Verdict |
|---------|-------|-------|---------|
| **F1 (Pédale basse)** | 43.2%, 5.5 seg | 43.2%, 5.0 seg | **Équivalent** — Pénalité n'affecte pas F1 (cas non détectés comme pédale par l'heuristique B3) |
| **F6 (Pédale + progression)** | 25.0%, 11.3 seg | 25.0%, 11.5 seg | **Pire avec -0.01** — Sur-segmentation inchangée voire légèrement pire |

## Analyse

1. **Pénalité -0.02 vs -0.01 : pas de différence sur F1** — Les cas F1 ne déclenchent pas la 2e passe Viterbi (heuristique B3 `num_segs > 25 && avg_dur < 4.0` non déclenchée car F1 n'a que 8 segments GT → ~4-6 détectés).

2. **F6 reste sur-segmenté** — 13 segments détectés vs 8 attendus. La pénalité -0.01 ne réduit pas la sur-segmentation, elle l'aggrave légèrement (+0.2 seg).

3. **Pénalité non déterminante** — Le problème de sur-segmentation F6 vient probablement de :
   - Détection pédale trop permissive (basse détectée comme statique alors qu'elle bouge)
   - Matrice de transition trop permissive (autres transitions négatives = -0.05)
   - Chroma aigu seul pas assez discriminant pour F6

## Décision

**Valeur retenue : -0.02** (valeur actuelle conservée)

**Justification :**
- -0.01 n'apporte aucune amélioration sur F1 (cas cible non affecté)
- -0.01 dégrade légèrement F6 (sur-segmentation +0.2 seg)
- -0.02 est la valeur originale validée dans EXP-043 (+7 pp total B2)

## Pistes futures pour F6 (hors scope)

1. **Améliorer détection pédale** : Ajouter critère "progression harmonique présente" pour distinguer F1 (pédale pure) de F6 (pédale + progression réelle)
2. **Transition adaptative** : Pénalité proportionnelle à `bass_var` (plus la basse est stable, plus on force le changement)
3. **Score upper chroma** : Utiliser `beat_chroma_upper` pour valider les frontières dans la 2e passe
4. **Seuil détection pédale** : Relâcher `bass_var < 0.01` → `0.015` ou exiger `len(bidx) > 6`

## Non-régression confirmée
- ✅ Build Vite OK
- ✅ 302+ tests unitaires passent
- ✅ B1 posthoc 100% Gm7 (production)
- ✅ B1/B4 non régressés

## Fichier modifié
- `electron/audio-processor.py` : ligne ~3017, constante `trans_pedal[i, j] = -0.02` conservée
