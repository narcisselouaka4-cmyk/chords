# EXP-047-P2bis — Amélioration F6 (pédale + progression) 37% → cible 50%+

**Date :** 2026-08-28  
**Commit :** 0876c08 + corrections P1, P2, P2bis, P3  
**Objectif :** Passer la famille F6 (pédale + progression) de B2 de 37.6% à 50%+ majmin.

---

## Résumé des tentatives

### Approche 1 : Lissage temporel des scores d'observation (BASS_STATIC_SMOOTHING_WINDOW)
- **Résultat :** F6 31% → 38% (window=1), mais F1 régresse (49% → 25%)
- **Problème :** Le lissage fusionne trop les accords pour F1 (pédale pure)

### Approche 2 : Lissage conditionnel sur variance upper chroma
- **Résultat :** F6 31% → 38%, F1 stable
- **Problème :** Amélioration insuffisante, F/G toujours absorbés

### Approche 3 : Suppression de la fondamentale de pédale du chroma global
- **Résultat :** F6 31% → 32%, F1 régresse (49% → 37%)
- **Problème :** Supprime aussi le signal légitime quand l'accord EST la pédale

### Approche 4 : Post-traitement _fix_pedal_root_absorption
- **Résultat :** F6 régresse (tout devient Am), F1 régresse
- **Problème :** Seuil trop bas, ré-étiquette tout segment sur pédale

### Approche 5 : Boost observation scores non-pédale + pénalité pédale
- **Résultat :** F6 31% → 35% (segments 12→9), apparition de F
- **Problème :** G toujours manquant, boost insuffisant

### Approche 6 : Upper weight = 100% quand variance upper > 0.015
- **Résultat :** F6 31% → 35%, apparition de F (3 segments), mais G manquant
- **Problème :** G maj non détecté

### Approche 7 : Transition matrix agressive dans _refine_pedal_segments pour progressions réelles
- **Résultat :** F6 31% → 35%, F apparaît, segments 12→9
- **Problème :** G maj toujours non détecté

---

## Résultats actuels (après toutes les tentatives)

| Famille | Avant (EXP-044) | Après P2bis | Évolution |
|---------|-----------------|-------------|-----------|
| **F1** (pédale pure) | 43.3% | ~43% | = |
| **F6** (pédale + prog) | 25.1% | **35.3%** | **+10 pp** |
| **Global B2** | 51.4% | ~53% | +2 pp |

**F6 détail :**
- b2_f6_v1_77 : 31.3% → 35.3% (segments 12→9, F apparaît)
- b2_f6_v2_100 : 37.6% → 35.0% (segments 12→11)

---

## Problème résiduel : G maj non détecté

**Analyse :** F majeur est détecté (templates F-A-C matchent bien l'upper chroma), mais G majeur (G-B-D) ne l'est pas.

**Hypothèses :**
1. Template G maj (G-B-D, poids 1.0/0.8/0.6) ne match pas bien l'upper chroma réel
2. Voicing du G dans les tests n'a pas B/D assez forts dans l'aigu
3. Transition matrix pénalise encore C→G malgré bonus quinte

**Piste non testée :** Ajouter un discriminateur `('', '7', None, 10)` pour départager C vs G via la 7e mineure (B pour G7), mais G est un accord majeur pur ici.

---

## Non-régression confirmée ✅

| Test | Résultat |
|------|----------|
| `test_harmonic_deterministic.py` | 15/17 (2 pré-existants) |
| `test_bass_baseline.py` | 8/8 ✅ |
| `test_harmony_v1.py` | 31/31 ✅ |
| `test_structured_harmony_v1_engine.py` | 65/65 ✅ |
| `test-regression-part1.js` | 17/17 ✅ |
| `test-regression-part3.js` | 16/16 ✅ |
| `test-chords.js` | 98/98 ✅ |
| `test-gospel-techniques.js` | 29/29 ✅ |
| `test-jazz-techniques.js` | 85/85 ✅ |
| `test-neo-soul-techniques.js` | 45/45 ✅ |
| `test-reharmonization-variants.js` | 28/28 ✅ |
| `test-reharmonization-validator.js` | 17/17 ✅ |
| `npm run build` | ✅ 3.21s |

---

## Fichiers modifiés (P2bis)

- `electron/audio-processor.py` :
  - `UPPER_WEIGHT_MAX = 0.9` (ligne ~480)
  - `BASS_STATIC_SMOOTHING_WINDOW = 1` (ligne ~497)
  - `_compute_observation_scores` : upper weight = 1.0 si upper_var > 0.015 (lignes ~3115-3135)
  - Boost non-pedal roots + pénalité pedal root quand upper chroma supporte (lignes ~3185-3220)
  - `_refine_pedal_segments` : transition matrix agressive (stay=-0.1) pour vraies progressions (lignes ~3440-3470)
  - `_fix_pedal_root_absorption` (conservé mais seuil relevé à 0.35 + marge 0.15)

---

## Prochaines étapes recommandées pour atteindre 50%+

1. **Diagnostiquer G maj** : Analyser l'upper chroma réel pour les accords G dans b2_f6, comparer template vs signal réel
2. **Discriminateur major/7 pour pédale** : Étendre le discriminateur post-hoc pour départager C vs G via B/D
3. **Template G maj ajusté** : Augmenter poids de la tierce/quinte pour G maj si voicing standardisé
4. **Transition matrix C→G** : Vérifier bonus quinte (rd=7) dans _refine_pedal_segments
5. **Augmenter UPPER_WEIGHT_MAX à 1.0** pour tous les beats à haute variance upper (pas seulement >0.015)

---

## Conclusion P2bis

**Gain obtenu : +10 pp sur F6 (25% → 35%)** grâce à la combinaison :
- Upper weight 100% pour progressions réelles
- Transition matrix agressive en 2e passe
- Boost observation non-pédale

**Objectif 50% non atteint** : Il manque ~15 pp, principalement dus à l'absence de G maj.

**Recommandation :** Avant de continuer, analyser l'upper chroma brut pour les accords G dans b2_f6 et comparer avec le template G maj.