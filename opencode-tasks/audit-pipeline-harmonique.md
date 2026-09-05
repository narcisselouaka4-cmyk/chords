# Audit systématique du pipeline harmonique

## Résumé exécutif

L’objectif du produit est que le moteur de détection d’accords soit **fiable sur n’importe quel fichier audio**, et non seulement sur des cas d’école. Cet audit montre que :

- la **couche déterministe** (Viterbi + segmentation + post-traitement sur chroma synthétique) est déjà robuste : **15/17** cas passent après les deux dernières couches additives (`_merge_arpeggio_segments`, `_stabilize_progression`) ;
- la **couche audio de bout en bout** (extraction réelle, beat tracking, chroma) est le **vrai point de fragilité générique** : seulement **5/17** cas passent, avec 11 échecs et 1 blocage ;
- les échecs ne sont pas des cas isolés : ils tombent en **catégories récurrentes** (arpèges lents, pédale + mélodie, frontières plus courtes que la grille de beat, silence, walking bass, qualités suspendues).

**Conclusion immédiate** : pour améliorer la fiabilité générique, il faut prioritairement attaquer la **couche audio/pré-Viterbi**, pas le HMM baseline (qui est gelé et qui fonctionne bien quand on lui donne un chroma propre).

---

## 1. Cartographie du pipeline

Le moteur harmonique audio est entièrement dans `electron/audio-processor.py`. Le flux logique est :

```
Fichier audio (wav/mp4/...)
  → extract_audio()                 [FFmpeg, resampling 44.1 kHz]
  → y, sr                           [librosa load]
  → _beat_track() + detect_tempo() [librosa beat.plp / tempo estimation]
  → chroma + frame_energies         [librosa CQT chromagram + RMS]
  → _compute_observation_scores()   [templates spectraux pondérés, 10 qualités, 109 états]
  → _apply_discriminator()          [règles de contradiction tierce mineure/majeure]
  → _viterbi()                      [matrice de transition diatonique/sauts]
  → _segment_path()                 [découpage en zones selon les changements d’état]
  → post-traitements additifs :
      _merge_similar_segments()
      _merge_arpeggio_segments()    [ajout récent]
      _stabilize_progression()      [ajout récent]
      _downgrade_advanced_segments() / _clean_segments()
  → analyze_chords() retourne {key, tempo, chords[]}
  → Chordify / timeline UI
```

Les tests déterministes court-circuitent l’extraction audio : ils injectent directement un `beat_chroma` synthétique et un `beat_times` contrôlé. Cela isole Viterbi + segmentation + post-traitement.

---

## 2. Points de fragilité identifiés

### 2.1 Haute criticité — couche audio / pré-Viterbi

| # | Problème | Où | Impact | Exemples de tests E2E concernés |
|---|----------|-----|--------|----------------------------------|
| 1 | **Beat tracking trop grossier** | `_beat_track()` | La grille temporelle est plus lente que les frontières réelles. Un changement de 0.25 s ou 0.5 s ne peut pas être représenté. | I (C↔G 0.25 s bloqué), H (C 2 temps / G 2 temps fusionné en G), J (D7 de 1 temps absorbé) |
| 2 | **Chroma réel bruité / instable** | `librosa.feature.chroma_cqt` | Un arpège lent (noires/croches) produit un chroma qui oscille entre le vrai accord et des interprétations parasites (Cm, Am, Csus2). | C, D, E, K, L, Q |
| 3 | **Pas de gestion explicite du silence** | `_segment_path()` + `_clean_segments()` | Les silences > 1.2 s ne coupent pas toujours les segments ; l’accord précédent est prolongé artificiellement. | O (silence entre C et G) |
| 4 | **Détection de tonalité sensible au bruit** | `detect_key()` Krumhansl-Schmuckler | La tonalité estimée peut être faussée par les notes de passage dominantes, ce qui désactive les bons bonus diatoniques. | L (key=Em au lieu de C), P (key=Bm au lieu de probablement G/Am) |

### 2.2 Moyenne criticité — interprétation / post-Viterbi

| # | Problème | Où | Impact | Exemples |
|---|----------|-----|--------|----------|
| 5 | **Arpèges lents mal absorbés** | `_merge_arpeggio_segments()` | Quand les notes d’un arpège tombent exactement sur des beats, chaque fenêtre de chroma est dominée par une note différente et le merge ne s’active pas. | C (Cmaj7 noires) |
| 6 | **Qualités suspendues non reconnues en audio réel** | `_downgrade_*` + templates | Csus4→C et Gsus2 sont downgradés ou jamais reconnus. | M (Csus4→C fusionné), Q (Gsus2) |
| 7 | **Walking bass interprété comme changement d’accord** | `_merge_arpeggio_segments()` | La basse mobile (C-E-G-B) crée des segments Em, C, Em, C… car le merge ne considère pas la répétition périodique comme une figure mélodique. | L déterministe + E2E |
| 8 | **Pédale + mélodie interprétée comme changements** | `_stabilize_progression()` | Les notes de la mélodie créent des fondamentales temporaires (F, Em) qui ne sont pas toutes absorbées. | Q déterministe + E2E |

### 2.3 Faible criticité / sous contrôle

| # | Problème | Commentaire |
|---|----------|-------------|
| 9 | Alternances de qualité sur même racine | Corrigé par le fix Viterbi 2026-07-09 ; reste stable. |
| 10 | Classification JavaScript (`src/chord-engine/`) | 98/98 tests passent ; le classifieur pur n’est pas le goulot. |
| 11 | Build / UI | `npm run build` OK ; Studio et Chordify non impactés. |

---

## 3. Analyse des tests existants

### 3.1 Couche 1 — tests harmoniques déterministes

- **Fichier** : `tests/test_harmonic_deterministic.py`
- **Principe** : `beat_chroma` synthétique injecté directement.
- **Force** : isole le raisonnement harmonique du bruit audio.
- **Faiblesse** : couvre peu de cas (A–Q, 17 scénarios) et tous en tonalité de C ou G. Pas de cas complexes (modulations, bruit, voix, arrangements denses).
- **Score actuel** : **15/17 passes**.
- **Cas restants** : L (walking bass), Q (pédale + mélodie).

### 3.2 Couche 2 — tests audio de bout en bout

- **Fichier** : `tests/test_arpeggio_audio.py` + `tests/test_arpeggio_segmentation.py`
- **Principe** : génère des fichiers WAV réels et passe par tout le pipeline.
- **Force** : mesure la vraie robustesse audio.
- **Faiblesse** : corpus très petit (A–Q), mono-instrument synthétique, pas de bruit, pas de voix, pas de reverbe, pas de mixes réels.
- **Score actuel** : **5/17 passes**, 11 fails, 1 blocked.

### 3.3 Tests de régression JS

- `src/chord-engine/test-chords.js` : 98/98 — classifieur d’accords stable.
- `src/analyzer/test-regression-part1.js` : OK — régression globale stable.
- `src/chord-engine/test-regression-part3.js` : OK — pureté du classifieur.

### 3.4 Lacunes de couverture

- Aucun test sur **audio réel varié** (gospel, jazz, pop, solo piano, mix band).
- Aucune métrique continue (accuracy, fragmentation, faux changements).
- Aucun benchmark sur **beat tracking** isolément.
- Aucun test sur **détection de silence**.
- Aucun test sur **robustesse au tempo** (lent vs rapide).
- Aucun test sur **qualités suspendues** en condition réelle.

---

## 4. Proposition de benchmark universel

### 4.1 Métriques objectives

| Métrique | Définition | Pourquoi |
|----------|-----------|----------|
| **Root Accuracy (RA)** | % de segments dont la fondamentale est correcte (± tolérance temporelle) | Mesure l’essentiel pour l’utilisateur. |
| **Quality Accuracy (QA)** | % de segments avec bonne qualité (majeur, mineur, 7, maj7, sus4…) | Mesure la finesse harmonique. |
| **Fragmentation Rate (FR)** | nombre de segments détectés / nombre de segments attendus | < 1.5 idéal ; > 2 = sur-segmentation. |
| **False Change Rate (FCR)** | nombre de changements détectés non attendus / nombre total de changements détectés | Pénalise les parasites. |
| **Missed Change Rate (MCR)** | nombre de changements attendus manqués / nombre total de changements attendus | Pénalise les oublis. |
| **Boundary Error (BE)** | moyenne de l’erreur temporelle sur les frontières vraies | Tolérance typique ± 0.5 s. |
| **Tonal Coherence (TC)** | cohérence de la progression détectée avec la tonalité estimée | Détecte les fondamentales hors tonalité non justifiées. |
| **Silence Respect (SR)** | % de silences > 1 s qui ne sont pas recouverts par un accord | Garantit qu’on n’invente pas d’accords dans le vide. |

### 4.2 Corpus de référence

Le corpus doit contenir au minimum :

1. **Corpus synthétique** (généré par `scripts/generate-arpeggio-fixtures.py` étendu) :
   - accords plaqués ;
   - arpèges à différentes vitesses (noires, croches, doubles) ;
   - walking bass ;
   - pédale + mélodie ;
   - suspensions ;
   - silences ;
   - modulations simples.

2. **Corpus audio réel** :
   - fichiers du dossier `tests/audio/` existants ;
   - extraits de références du dossier `tests/references/` ;
   - fichiers utilisateur comme `/tmp/local_piano3.wav` ;
   - éventuellement des extraits libres de droits à récupérer si besoin.

3. **Corpus de régression** :
   - cas A–Q actuels (doivent rester stables ou s’améliorer) ;
   - Amazing Grace Gospel Piano (benchmark historique).

### 4.3 Procédure de mesure

Pour chaque modification algorithmique :

```
1. Lancer le benchmark complet avant modification → baseline.
2. Appliquer la modification.
3. Relancer le benchmark complet après modification.
4. Comparer RA, QA, FR, FCR, MCR, BE, TC, SR.
5. Accepter la modification uniquement si :
   - aucune métrique critique ne régresse ;
   - au moins une métrique cible s’améliore ;
   - les tests de régression existants passent toujours.
```

---

## 5. Pistes d’amélioration génériques

Ces pistes respectent le contract : **le HMM baseline reste gelé**, on ajoute des couches ou on améliore le pré-traitement.

### 5.1 Couche audio / pré-Viterbi (priorité haute)

1. **Beat tracking adaptatif** : permettre une grille plus fine que le beat détecté, ou autoriser des sous-beat pour les frontières courtes (cas I, H, J).
2. **Détection et respect du silence** : couper explicitement les segments sur les silences > 1 s avant Viterbi, ou après.
3. **Stabilisation chroma par médiane glissante** : lisser le chroma sur plusieurs frames pour réduire l’effet “note isolée par beat”.
4. **Séparation HPSS / source** : appliquer un pré-filtre harmonique/percussif pour isoler la partie harmonique avant le chroma.
5. **Tonalité locale** : estimer la tonalité non pas sur tout le morceau mais par fenêtre, pour mieux guider Viterbi quand le contexte change.

### 5.2 Couche post-Viterbi (priorité moyenne)

1. **Règle “pédale + mélodie”** : si une fondamentale domine en basse continue et que les autres notes forment un pattern mélodique court, forcer le maintien de la pédale.
2. **Règle “walking bass”** : détecter une succession cyclique de notes (C-E-G-B) et la fusionner en l’accord parent.
3. **Règle “sus4→C”** : reconnaître une suspension comme telle lorsqu’elle est suivie de la résolution dans un délai raisonnable.
4. **Paramétrage adaptatif des post-traitements** : rendre les seuils de merge dépendants du tempo, de la densité et de la durée des segments.

### 5.3 Couche benchmark / validation (priorité haute)

1. Créer un script unique `tests/benchmark_harmonic_pipeline.py` qui agrège toutes les métriques.
2. Générer automatiquement un rapport avant/après.
3. Intégrer le benchmark dans la CI ou dans le workflow de développement.

---

## 6. Plan d’action recommandé

### Prochaine mission (haute priorité)

**Construire le benchmark universel**.

- Créer `tests/benchmark_harmonic_universal.py`.
- Intégrer les cas A–Q + Amazing Grace + fichiers audio existants + `/tmp/local_piano3.wav`.
- Produire les métriques RA/QA/FR/FCR/MCR/BE/TC/SR.
- Établir la baseline actuelle.

### Mission suivante (haute priorité)

**Attaquer la couche audio**.

- Expérimenter le respect explicite du silence.
- Expérimenter une grille de beat plus fine / sous-beat.
- Tester un lissage chroma par médiane glissante.
- Valider chaque piste avec le benchmark universel.

### Mission suivante (moyenne priorité)

**Finaliser la couche déterministe**.

- Résoudre L et Q sans régression.
- Une fois le pré-traitement audio amélioré, vérifier que ces cas passent aussi en E2E.

### Mission suivante (faible priorité)

**Documentation**.

- Mettre à jour `tech/moteur-harmonique.md` avec les nouvelles couches.
- Documenter le benchmark et les métriques dans le wiki.

---

## 7. Résultats bruts des validations

Exécutés le 2026-08-20 :

```
python3 tests/test_harmonic_deterministic.py
→ 15/17 passés, 2 échoués (L, Q)

python3 tests/test_arpeggio_segmentation.py --allow-blocked
→ Couche 1 : 15/17
→ Couche 2 : 5/17 passes, 11 fails, 1 blocked
→ GLOBAL : FAIL

node src/chord-engine/test-chords.js
→ 98/98 tests réussis

node src/analyzer/test-regression-part1.js
→ OK

node src/chord-engine/test-regression-part3.js
→ OK

npm run build
→ OK
```

---

## 8. Recommandation immédiate

**Ne pas continuer à patcher cas par cas.** Passer à une approche benchmarkée sur la couche audio. La première mission concrète est de construire le benchmark universel et d’expérimenter les améliorations du pré-Viterbi (silence, grille fine, chroma lissé) avec mesure objective.
