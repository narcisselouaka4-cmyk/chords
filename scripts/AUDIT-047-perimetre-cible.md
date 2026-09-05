# AUDIT-047 — Bilan chiffré périmètre cible (B1–B4)

**Date :** 2026-08-27  
**Commit :** 0876c08 (post EXP-044)  
**Mode d'observation :** `legacy` / `baseline` (moteur HMM pur, sans posthoc_discriminator)

---

## 1. Périmètre cible rappelé

- Piano/gospel/jazz avec basse et batterie
- Tempo stable (pas de rubato important)
- Accords de base : `maj`, `min`, `maj7`, `m7`, `7`, `dim`, `dim7`, `aug`, `aug7`
- Arrangement relativement propre

---

## 2. Résultats globaux B1–B4 (après EXP-044)

| Batterie | Cas | CSR majmin | CSR sevenths | Offset médian | Tempo exact | Tonalité exacte |
|----------|-----|------------|--------------|---------------|-------------|-----------------|
| **B1** (synthétique propre) | 20 | **90.0%** | **81.2%** | 34 ms | 20/20 | 16/20 |
| **B2** (pédale/walking/silences) | 24 | **51.4%** | **50.3%** | 42 ms | — | — |
| **B3** (réel concert, baseline) | 20 | **61.4%** | **51.0%** | –57 ms | — | — |
| **B4** (tempo/rubato/syncopes) | 20 | **83.7%** | — | — | 19/20 | — |

> **Note B3** : le benchmark complet n'a pas pu tourner (timeout 5 min). Les chiffres proviennent du rapport `b3-baseline.json` existant (même commit).

---

## 3. Détail par famille / cas faibles

### B1 — Synthétique propre (20 cas)
| Famille / Cas | majmin | sevenths | Problème |
|--------------|--------|----------|----------|
| **3iivi (ii-V-I)** 60/77/90/120 | **43–55%** | **33%** | **Tonalité fausse (C au lieu de F)** → confusion tonique/sous-dominante |
| 5iivvi 90/120 (mineur) | 90–91% | 74% | Perte de sevenths sur tempo rapide |

**Point faible B1** : **Famille 3iivi (ii-V-I majeur)** — 4 cas à 43–55% majmin, 33% sevenths. Cause racine : détection tonique C au lieu de F (relative majeure/mineure ou confusion V/IV).

---

### B2 — Pédale / Walking / Silences (24 cas, 6 familles)

| Famille | Cas | majmin | sevenths | Segments (prédit/GT) | Diagnostic |
|---------|-----|--------|----------|----------------------|------------|
| **F6 : pédale + progression** | 4 | **25.1%** | **25.1%** | 12/8, 12/8, 7/8, 13/8 | **Sur-segmentation** + confusion harmonique |
| **F1 : pédale de basse** | 4 | **43.3%** | 43.3% | 6/8, 6/8, 4/8, 4/8 | **Sous-segmentation** (fusion) + offsets massifs (v3/v4 : 2–3 s) |
| **F3 : walking bass** | 4 | 51.2% | 48.1% | 17/8, 13/8, 16/8, 20/8 | **Sur-segmentation** sévère (2–2.5×) |
| F5 : silences | 4 | 62.7% | 59.0% | 16/16, 9/16, 16/16, 9/16 | **Tempo faux** v2/v4 (80 vs 100, 61 vs 77) → fusion segments |
| F2 : quinte dominante | 4 | 58.8% | 58.8% | 8/8, 8/8, 5/8, 5/8 | Fusion sur tempo rapide (v3/v4) |
| F4 : arpège | 4 | 67.5% | 67.5% | 9/8, 7/8, 8/8, 10/8 | Correct |

**Points faibles B2 (prioritaires) :**
1. **F6 (pédale + progression) : 25%** — Sur-segmentation (12–13 vs 8) + confusion qualité. La 2e passe Viterbi (EXP-043) ne suffit pas.
2. **F1 (pédale de basse) : 43%** — Sous-segmentation (4–6 vs 8) + offsets énormes sur versions A (tonalité mineure relative). Heuristique B3 ne déclenche pas.

---

### B3 — Réel concert (20 cas, baseline)
- Global : **61.4% majmin / 51.0% sevenths**
- Offset médian –57 ms (léger retard)
- Écart-type offset 1592 ms (très instable)
- Problèmes connus : octave tempo, anticipation basse, vocabulaire jazz incomplet (rootless, tensions)

---

### B4 — Tempo / Rubato / Syncopes (20 cas)

| Famille | Cas | majmin | Tempo exact | Problème |
|---------|-----|--------|-------------|----------|
| **F4 : syncopes** | 5 | **71.8%** | 4/5 | **Tempo ×2/÷2** sur b4_syncop_60 (117.5 vs 60) → majmin 72% |
| F1/F2 : stable/rubato | 10 | 84.1% | 10/10 | Clé fausse sur mineures (Am vs C) → 86% vs 99% |
| F3 : accel/ritard | 4 | 94–99% | 4/4 | Excellent |

**Point faible B4** : **F4 Syncopes (71.8%)** — Tempo détecté au double (contretemps pris pour temps forts). Impact : majmin chute 84% → 72%.

---

## 4. Top 3 points faibles prioritaires (impact chiffré)

| # | Point faible | Batterie impactée | Score actuel | Gain estimé si corrigé | Cause racine |
|---|--------------|-------------------|--------------|------------------------|--------------|
| **1** | **Confusion tonique / ii-V-I majeur (famille 3iivi)** | B1 (4 cas), B3 | **43–55%** majmin | **+35–45 pp** → 85%+ | HMM confond C (I) et F (IV) : chroma similaire, pas de modèle de progression harmonique forte |
| **2** | **Pédale + progression (F6 B2) — Sur-segmentation + confusion** | B2 (4 cas) | **25%** majmin | **+30–40 pp** → 60%+ | 2e passe Viterbi inadaptée : matrice transition trop permissive, détection pédale fausse positive |
| **3** | **Syncopes → tempo ×2 (F4 B4)** | B4 (1 cas critique + 4 moyens) | **72%** majmin | **+12 pp** → 84% | Beat tracker prend contretemps pour temps forts ; pas de vérification harmonique du tempo |

---

## 5. Hypothèses de correction & estimation gain

### P1 — Confusion ii-V-I majeur (B1 3iivi, B3)
| Hypothèse | Description | Complexité | Gain estimé |
|-----------|-------------|------------|-------------|
| **A. Prior harmonique fort** | Ajouter bias transition V→I et ii→V dans matrice HMM (log-prob +1.5 à +2.0) | Faible (config) | +25 pp sur 3iivi |
| **B. Post-hoc discriminator** | Étendre `posthoc_discriminator` (déjà 100% Gm7 production) aux cas majeurs : forcer maj7 sur I, m7 sur ii, 7 sur V | Moyenne (code) | +35 pp |
| **C. Templates chroma étendus** | Ajouter templates `maj7_noroot`, `m7_noroot` pour voicings rootless (EXP-045) | Moyenne | +15 pp |

**Recommandation P1 : B (Post-hoc discriminator)** — Déjà validé en production pour Gm7 (100% B1 posthoc). Étendre aux majeures donne le plus gros gain pour le moins d'effort.

---

### P2 — Pédale + progression F6 (B2)
| Hypothèse | Description | Complexité | Gain estimé |
|-----------|-------------|------------|-------------|
| **A. Détection pédale plus stricte** | Exiger `bass_var < 0.005` ET `len(bidx) > 8` + variance upper > seuil | Faible | +15 pp (réduit faux positifs) |
| **B. Transition adaptative** | Pénalité maintien proportionnelle à `1 - bass_var` (plus stable = plus force changement) | Moyenne | +20 pp |
| **C. Validation upper chroma en 2e passe** | Dans `_refine_pedal_segments`, n'accepter transition que si `beat_chroma_upper` confirme | Moyenne | +25 pp |

**Recommandation P2 : C (Validation upper chroma)** — Utilise l'architecture existante (bass/treble separation EXP-041). Corrige la cause racine : la 2e passe force des changements sans vérifier l'aigu.

---

### P3 — Syncopes → tempo ×2 (B4 F4)
| Hypothèse | Description | Complexité | Gain estimé |
|-----------|-------------|------------|-------------|
| **A. Vérification harmonique tempo** | Après beat tracking, tester tempo/2 et tempo*2 : garder celui qui maximise cohérence chroma/segments | Moyenne | +12 pp (ramène 72% → 84%) |
| **B. Filtre contretemps** | Dans `_resolve_tempo`, détecter énergie sur contretemps (offset 0.5 beat) et pénaliser tempo double | Faible | +8 pp |
| **C. Prior tempo métronome** | Renforcer prior gaussien autour du tempo médian global (σ=0.3 au lieu de 0.4) | Faible | +5 pp |

**Recommandation P3 : A (Vérification harmonique)** — Plus robuste, réutilisable pour rubato/accel.

---

## 6. Recommandation stratégique

| Option | Description | Effort | Risque | Gain total estimé |
|--------|-------------|--------|--------|-------------------|
| **Corriger moteur actuel (HMM + posthoc)** | Implémenter P1-B, P2-C, P3-A | ~3-5 jours | Faible (tests existants) | **+15–20 pp global** (B1 90→98%, B2 51→65%, B3 61→75%, B4 84→88%) |
| **Changer architecture (CRF/Transformer)** | Remplacer HMM par modèle séquentiel appris | ~3-4 semaines | Élevé (régression, data) | Inconnu, potentiellement +10 pp mais coût 10× |

**→ DÉCISION : Corriger le moteur actuel.**

**Justification :**
1. Le moteur HMM + posthoc_discriminator atteint **100% sur ii-V-I mineure (B1 production)** — preuve que l'architecture *peut* marcher avec les bons biais.
2. Les 3 points faibles sont des **défauts localisés** (biais transition, validation pédale, vérification tempo), pas des limites structurelles.
3. 302+ tests unitaires passent, build OK — base solide pour itérations rapides.
4. Changement d'architecture = réécrire 2 ans de fixes (EXP-030 à 044), casser la compatibilité Studio/Analyse.

---

## 7. Plan d'action proposé (séquentiel)

| Étape | Action | Fichiers | Tests validation |
|-------|--------|----------|------------------|
| **1** | Étendre `posthoc_discriminator` aux majeures (P1-B) | `electron/audio-processor.py` : `_apply_posthoc_discriminator` | B1 3iivi → 85%+, B1 global → 95%+ |
| **2** | Validation upper chroma dans 2e passe Viterbi (P2-C) | `electron/audio-processor.py` : `_refine_pedal_segments` | B2 F6 → 50%+, B2 global → 60%+ |
| **3** | Vérification harmonique tempo (P3-A) | `electron/audio-processor.py` : `_resolve_tempo` | B4 F4 syncop_60 → 84%+, tempo exact 20/20 |
| **4** | Benchmark complet B1–B4 + non-régression | `scripts/corpus_b*.py` | 302+ tests unitaires, Build Vite |

---

## 8. Annexe — Commandes de validation

```bash
# Build & tests unitaires
npm run build
node src/analyzer/test-regression-part1.js
node src/chord-engine/test-regression-part3.js
python3 tests/test_harmonic_deterministic.py
python3 tests/test_bass_baseline.py
python3 tests/test_harmony_v1.py

# Benchmarks
python3 scripts/corpus_b1.py run --label b1-post-audit --compare b1-apres-exp044
python3 scripts/corpus_b2.py run --label b2-post-audit --compare b2-apres-exp044
python3 scripts/corpus_b3.py run --label b3-post-audit --compare b3-baseline
python3 scripts/corpus_b4.py run --label b4-post-audit --compare b4-apres-exp044
```

---

*Document généré automatiquement par la mission AUDIT-047. Ne pas modifier le moteur dans cette mission.*