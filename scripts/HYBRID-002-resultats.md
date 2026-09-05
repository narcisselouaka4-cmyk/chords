# HYBRID-002 — Résultats hybride HMM + ISMIR2019

**Date :** 2026-08-28  
**Suite de :** HYBRID-001-architecture.md  
**Commit :** 0876c08 + PoC

---

## Résumé exécutif

L'architecture hybride **HMM (structure) + ISMIR2019 (qualité)** a été testée sur les batteries B1 et B2.

**Résultat principal :** L'hybride n'apporte **pas de gain net** sur les batteries testées. Dans la majorité des cas, les résultats sont identiques à l'HMM seul. Dans certains cas (B2 F4 v2_100), il y a une **régression** (-12.5 pp).

---

## Architecture testée

**Option A retenue (HYBRID-001) :** HMM pour tempo/beats/tonalité + ISMIR2019 pour qualité d'accord.

**Pipeline :**
1. HMM → tempo, beat grid, tonalité, segments (racines)
2. ISMIR2019 → segments d'accords avec qualités (frame-level ~10ms)
3. Alignment → ISMIR segments alignés sur grille HMM (beat-synchrone)
4. Arbitrage → Racine HMM + Qualité majoritaire ISMIR (pondérée par overlap temporel)

---

## Résultats détaillés

### B2 — F2 (Quinte dominante) & F4 (Arpège) — 4 cas testés

| Cas | HMM majmin | FUSED majmin | Δ | Note |
|-----|------------|--------------|---|------|
| b2_f2_v1_77 | 74.3% | 74.3% | 0% | Stable |
| b2_f2_v2_100 | 61.4% | 61.4% | 0% | Stable |
| b2_f4_v1_77 | 80.8% | 80.8% | 0% | Stable |
| b2_f4_v2_100 | **74.2%** | **61.7%** | **-12.5 pp** | **RÉGRESSION** |

### B1 — 4 cas testés (synthétique)

| Cas | HMM majmin | FUSED majmin | Δ |
|-----|------------|--------------|---|
| b1_1iivvi_77 | 99.1% | 99.1% | 0% |
| b1_2iviivv_77 | 99.0% | 99.0% | 0% |
| b1_3iivi_77 | 55.1% | **43.7%** | **-11.4 pp** |
| b1_4ivviiv_77 | 98.9% | 98.9% | 0% |

---

## Analyse des échecs

### 1. Désalignement temporel (cause principale)
- HMM : segments beat-synchrone (durée = N beats)
- ISMIR2019 : segments frame-level (~10ms), frontières libres
- L'overlap pondéré ne compense pas le décalage systématique

### 2. Mapping qualité imparfait
| Qualité ISMIR | Mapping HMM | Problème |
|---------------|-------------|----------|
| `min/b3` | → `m` | OK mais rare |
| `maj/5` | → `maj` | Perd l'info "slash" |
| `G:maj/5` | → `G` | Confond G maj et G/F |
| `min/b3` sur Gm | → `Gm` | OK |
| `maj` sur Em | → `E` | **Perd le mineur** |

### 3. Racines figées (design choice)
- L'arbitrage "Racine HMM + Qualité ISMIR" ne peut pas corriger les erreurs de racine
- Cas b2_f2_v1_77 segment final : HMM=D (erreur), ISMIR=G:maj/5 → Fusion=D (erreur conservée)

### 3. Qualité ISMIR sur mineurs (B1 3iivi)
ISMIR2019 vote souvent `maj` sur les accords mineurs (Gm → G, Am7 → A), causant une régression sur le ii-V-I mineur.

---

## Gain potentiel non réalisé

L'hybride pourrait aider sur :
- **B3 (audio réel)** : ISMIR2019 est entraîné sur audio réel, HMM souffre du bruit
- **Vocabulaire étendu** : ISMIR2019 reconnaît 9, 11, 13, hdim7, slash chords
- **Pédale de basse** : ISMIR2019 pourrait mieux voir les changements harmoniques

Mais ces gains nécessitent une refonte de l'alignement (DTW, Viterbi alignement) et un arbitrage plus sophistiqué.

---

## Conclusion et recommandation

### Verdict : **Ne pas intégrer en l'état**

L'architecture hybride simple (HMM root + ISMIR quality) n'apporte pas de gain net et introduit des régressions.

### Pistes pour version future (si budget disponible)

1. **Alignement DTW** : Aligner les séquences ISMIR/HMM par programmation dynamique
2. **Arbitrage probabiliste** : Modèle CRF/HMM hybride au lieu de vote majoritaire
3. **Correction racine** : Permettre à ISMIR de corriger la racine quand confiance > seuil
4. **Entraînement joint** : Fine-tuner ISMIR2019 sur données synthétiques B1 pour calibrer les qualités
5. **Ensemble Viterbi** : Fusionner les matrices de transition HMM + probas ISMIR

---

## Artefacts livrés

- `scripts/HYBRID-001-architecture.md` — Architecture détaillée
- `scripts/hybrid_poc.py` — PoC fonctionnel (testé manuellement)
- Ce document : `scripts/HYBRID-002-resultats.md`

---

## Non-régression HMM confirmée

Quand le flag hybride est OFF (défaut) :
- ✅ B1 90.0% majmin (inchangé)
- ✅ B2 54.5% majmin (inchangé)
- ✅ B3 61.4% majmin (inchangé)
- ✅ B4 84% majmin (inchangé)
- ✅ 302+ tests unitaires passent
- ✅ Build Vite OK

---

*Fin de mission HYBRID-001/002*