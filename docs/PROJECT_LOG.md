# Journal de bord — Jazzaria : The Waltz of Steamboat Willie

> Décisions architecturales et jalons du projet.

---

## 2026-07-09 — Phase 6 : benchmark et validation

**Décisions :**

1. **Fusion VR activé par défaut** (Config A, score_ratio=0.3). Le benchmark
   Phase 6 montre un gain de +8,5 pp NW et −6,8 pp octave error par rapport
   au Bass Engine seul.

2. **Walking bass regression documentée, pas corrigée pour V1.0-rc1**. Le
   Virtual Root Candidate remplace les notes de passage par la fondamentale.
   Une implémentation ultérieure (bass_motion_score) est envisagée.

3. **Dépendance au Chord Engine acceptée comme limite architecturale**. Les
   performances de la fusion sont conditionnées par la qualité de l'analyse
   harmonique. Un benchmark harmonique séparé est une amélioration future.

4. **Licence** : CC BY-NC-ND pour l'œuvre originale.

**Livrables :**
- `docs/BENCHMARK_REPORT.md` — résultats complets sur 24 pièces
- `docs/KNOWN_LIMITATIONS.md` — 7 limitations documentées
- `benchmark_outputs/phase6/` — données brutes, CSV, graphiques

**Prochaine étape :** tag `v1.0.0-rc1`, smoke tests sur 5 MP3.

---

## 2026-07-09 — Phase 5 : intégration musicale

**Décisions :**

1. Timeline basse synchronisée dans l'onglet Analyzer.
2. Mode développeur (toggle Dev) pour afficher les logs bruts.
3. `relationToChord` implémenté : root / chord_tone / passing_tone avec
   interprétation slash chord et niveau de confiance.
4. Architecture IPC : `electron/main.js` → `preload.cjs` → UI.

**Livrables :**
- `docs/FUSION_INTEGRATION.md`
- Timeline basse + cartes d'accords enrichies dans `AnalyzerTab`
- Build Vite OK, tests Partie 1 et Partie 3 passent.

---

## 2026-07-09 — Phase 4 : Fusion Engine V1.0

**Décisions :**

1. Architecture ScoreComponent avec 4 composants : BassScore, HarmonicScore,
   OctaveScore, ContinuityScore.
2. Virtual Root Candidate injecté à 30 % du meilleur score BE.
3. Config A validée : virtual_root enabled, score_ratio=0.3,
   octave_bonus {2: 0.5, 3: 0.3}.
4. Le biais d'octave du BE est documenté comme limite interne, non résolvable
   par la fusion.

**Livrables :**
- `scripts/fusion_bass_chord.py` — Fusion Engine V1.0
- `fusion_params.json` — Config A
- `docs/FUSION_ENGINE_BASELINE.md`

---

## 2026-07-09 — Phase 3.5 : audit et candidats

**Décisions :**
- Export des 5 candidats d'octave par frame (`export_bass_candidates.py`)
- Validation de l'architecture par l'utilisateur avant implémentation.
