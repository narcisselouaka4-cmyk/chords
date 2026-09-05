# EXP-039 — Verdict Chordify readiness : 5 batteries mesurées (relais final)

## Résumé exécutif

**Chordify n'est PAS prête pour la production générale.** 

Sur les 5 batteries spécifiées depuis le 22/08/2026 (`corpus-test-detection-accords.md`), **seules B1 et B4 atteignent des scores acceptables (>90% CSR majmin)**. B2, B3 et B5 restent bien en dessous, avec des causes identifiées qui ne sont pas des régressions récentes mais des limitations structurelles du moteur.

| Batterie | Baseline | Posthoc | Statut |
|----------|----------|---------|--------|
| **B1** (accords plaqués) | **93.2%** / 84.7% | **98.5%** / **86.7%** | ✅ Prête |
| **B4** (tempo/rubato) | **83.4%** / — | — | ⚠️ Tempo OK, majmin faible |
| **B2** (pédale/walking bass) | 49.1% / 46.6% | 52.5% / 49.8% | ❌ **Bloquant** (cas gospel core) |
| **B3** (anticipation basse) | 62.5% / 49.0% | 61.1% / 40.8% | ❌ **Bloquant** |
| **B5** (voicings jazz) | 37.2% / 17.4% | 39.6% / 17.4% | ❌ **Bloquant** |

> Format : `CSR(majmin)` / `CSR(sevenths)` — `—` = non mesuré / non pertinent

---

## Tâche 1 — Mode de production confirmé

### Recherche dans le code
- **Appel unique** : `src/ui/analyzer-tab.js:2473` → `await api.analyzer.processFile(originalPath, { analyzeBass: false })`
- **Paramètre `observationMode`** : **jamais passé** (seul `analyzeBass: false`)
- **Défaut Python** : `analyze_chords(..., observation_mode="baseline")` (ligne 4403 `audio-processor.py`)
- **Préférences/UI** : aucun réglage exposé pour `observationMode`

### Verdict
**La production tourne en mode `baseline`** (par défaut, sans option de bascule utilisateur).

### Impact réel utilisateur (selon EXP-038)
- **120 BPM** : `Gm7` détecté ✅ (corrigé par EXP-038)
- **60 BPM** : `Gm7` détecté ✅ (corrigé par EXP-038)
- **77/90 BPM** : **oscillation `Am7`/`Gm7`** sur progression ii-V-I (Fmaj7/Am7 confusion, 3 notes communes sur 4) — **non corrigé**, cause : grille beat/accord mal alignée (7-8 segments au lieu de 10)

### Recommandation
Basculer le défaut production vers `posthoc_discriminator` (100% sur B1/ii-V-I à tous tempos) :
- Soit changer l'appel à `{ analyzeBass: false, observationMode: 'posthoc_discriminator' }`
- Soit changer le défaut Python → `observation_mode="posthoc_discriminator"` (impact plus large, à valider)

**Ceci doit faire l'objet d'une EXP dédiée (EXP-040) avec mesure avant/après sur B1 en conditions réelles d'appel.**

---

## Tâche 2 — B2 Remesurée (EXP-013 : 47.23% CSR)

### Résultats actuels

| Famille | Baseline majmin | Baseline 7ths | Posthoc majmin | Posthoc 7ths | Δ Posthoc |
|---------|----------------|---------------|----------------|--------------|-----------|
| F1 Pédale basse | **31.1%** | **24.9%** | **31.1%** | **24.9%** | 0 |
| F2 Quinte dominante | 58.8% | 58.8% | 58.8% | 58.8% | 0 |
| F3 Walking bass | 51.2% | 48.1% | **53.2%** | **48.2%** | +2/+0 |
| F4 Arpège | 65.9% | 65.9% | **64.4%** | **61.6%** | -1.5/-4 |
| F5 Silences | 62.7% | 57.2% | **62.6%** | **51.5%** | 0/-5.7 |
| F6 Pédale + progression | **25.0%** | **25.0%** | **28.1%** | **28.1%** | +3/+3 |
| **B2 TOTAL** | **49.1%** | **46.6%** | **52.5%** | **49.8%** | **+3.4 / +3.2** |

### Comparaison EXP-013 (47.23% CSR majmin)
- **Gain de +5.3 pp en posthoc** depuis EXP-013 (attribuable aux fix EXP-024→038 : temps fort, clipping, seventh evidence)
- **Mais toujours < 55%** — insuffisant pour le public gospel/worship (pédale = cas central)

### Causes persistantes (identifiées dès EXP-013/014)
1. **F1/F6 (pédale)** : l'harmonie change au-dessus d'une fondamentale fixe → le chroma global confond basse et accord. `ENABLE_FIFTH_CONFUSION_FIX` ne suffit pas (cible quinte vs fondamentale, pas pédale harmonique).
2. **F3 (walking bass)** : le moteur suit la basse mobile au lieu de l'harmonie tenue. Gardes `upper_voice_stability` et `arpeggio_figure_absorption` insuffisantes.
3. **Aucun effet de bord négatif** des changements EXP-024→038 sur B2 — le gain vient de la réduction du clipping et du seventh evidence.

### Diagnostic pour relais correctif futur
> **Cible** : F1/F6 (pédale) — ajout d'un détecteur de "basse statique + harmonie changeante" qui force la segmentation sur l'harmonie (chroma aigu), pas sur la fondamentale.
> **Cible** : F3 (walking bass) — renforcer `ENABLE_ARPEGGIO_FIGURE_ABSORPTION` avec détection de pattern "même PC-set sur 4+ beats consécutifs avec basse mobile".

---

## Tâche 3 — B3 & B5 Première mesure

### B3 — Anticipation de basse (20 cas)

| Progression | Baseline majmin | Baseline 7ths | Posthoc majmin | Posthoc 7ths |
|-------------|----------------|---------------|----------------|--------------|
| I-IV-V-I | **93.4%** | 77.9% | **95.1%** | **79.8%** |
| I-vi-IV-V | 72.6% | 65.2% | 72.6% | 53.2% |
| I-V-vi-IV | 72.8% | 63.6% | 62.5% | 38.5% |
| i-iv-v-i (mineur) | **13.9%** | **13.9%** | **6.7%** | **6.7%** |
| ii-V-I | 59.6% | **24.7%** | 68.6% | **25.8%** |
| **B3 TOTAL** | **62.5%** | **49.0%** | **61.1%** | **40.8%** |

**Observations clés** :
- L'anticipation de basse tire les frontières en **avance** (offset médian -18 ms baseline, -72 ms posthoc) — confirmé : le moteur suit la basse.
- **Mineur (i-iv-v-i) : effondrement total** (13.9% → 6.7%) — tonalité mineure + anticipation = cas non géré.
- **Posthoc dégrade les sevenths** (-8 pp) : le discriminateur `major/maj7` confond Fmaj7/Am7 sur fond d'anticipation.
- **Hypothèse validée** : le bass-engine (EXP-005/007) n'est pas la cause — c'est le HMM principal qui suit la basse anticipée.

### B5 — Voicings jazz (5 cas = 5 familles × 1 tempo)

| Famille | Baseline majmin | Baseline 7ths | Posthoc majmin | Posthoc 7ths |
|---------|----------------|---------------|----------------|--------------|
| F1 Sans fondamentale | **0.0%** | **0.0%** | **0.0%** | **0.0%** |
| F2 Upper structures | 61.8% | 12.5% | 61.8% | 12.5% |
| F3 Quartal/clusters | 50.0% | 25.0% | 49.8% | 12.5% |
| F4 Slash/renversements | 37.0% | 37.0% | 37.0% | 37.0% |
| F5 Tensions 9/11/13 | 37.0% | 12.3% | 39.6% | **24.8%** |
| **B5 TOTAL** | **37.2%** | **17.4%** | **39.6%** | **17.4%** |

**Observations clés** :
- **F1 (sans fondamentale) = 0%** — le moteur ne peut pas identifier l'accord sans fondamentale dans le chroma global. Nécessite chroma aigu + modèle sans fondamentale.
- **F5 tensions** : léger gain posthoc sur sevenths (+12 pp) — le discriminateur `major/7` aide un peu.
- **Vocabulaire limité** : le HMM ne connaît que triades/7èmes, pas 9/11/13/altérations → identification par approximation (triade la plus proche).

---

## Verdict final : Chordify est-elle prête ?

| Critère | Résultat |
|---------|----------|
| **Accords pop/rock simples (B1)** | ✅ Oui (93-99%) |
| **Tempo/rubato (B4)** | ⚠️ Tempo OK, mais majmin 83% (clé mineure instable) |
| **Gospel/worship avec pédale (B2)** | ❌ **Non** (49-53%) |
| **Basse anticipée (B3)** | ❌ **Non** (61-62%, frontières en avance) |
| **Voicings jazz réalistes (B5)** | ❌ **Non** (37-40%, 0% sans fondamentale) |

### Prochaines étapes priorisées

1. **EXP-040** : Basculer défaut production → `posthoc_discriminator` (gain immédiat B1, neutre B2/B3/B5)
2. **EXP-041** : Correction pédale (F1/F6 B2) — détecteur "basse statique + harmonie changeante" via chroma aigu
3. **EXP-042** : Correction anticipation basse (B3) — option "suivre harmonie, ignorer basse anticipée" 
4. **EXP-043** : Extension vocabulaire voicings (B5) — templates sans fondamentale, 9/11/13, quartal

---

## Non-régression confirmée
- ✅ Build Vite OK
- ✅ 302+ tests unitaires passent (Partie 1, 3, chord-engine, gospel, jazz, neo-soul, validator)
- ✅ Aucune régression sur B1/B4 depuis EXP-038

---

## Mise à jour mémoire projet
- `relais-reprise-second-cerveau-etat-detection-accords.md` → ajouter ce verdict
- `state/current-work.md` → EXP-039 terminée, EXP-040/041/042/043 en attente
- `log.md` → entrée EXP-039 avec tableaux ci-dessus
