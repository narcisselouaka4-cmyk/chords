# EXP-047-P3bis — Amélioration harmonie syncopes (B4 F4) 65% → 84%

**Date :** 2026-08-28  
**Commit :** 0876c08 + corrections P1, P2, P3, P2bis  
**Objectif :** Améliorer l'accuracy majmin sur les syncopes (B4 F4) de 65% à 84%.

---

## Contexte

EXP-047 a corrigé le tempo ×2 sur les syncopes (B4 F4). Le tempo est maintenant correct :
- b4_syncop_60 : 58.7 BPM (au lieu de 117.5)
- b4_syncop_120 : 58.7 BPM (au lieu de 117.5)
- b4_syncop_140 : 71.8 BPM (au lieu de 143.6)

Mais l'**harmonie détectée** reste faible : **65% majmin** au lieu de **84%** sur les cas stables.

---

## Cause racine

Quand le tempo est correct (60 BPM), les contretemps sont alignés sur la grille de beats. Le Viterbi interprète les attaques de contretemps comme :
1. Des changements d'accord (sur-segmentation)
2. Du bruit harmonique (notes de passage détectées comme accords)

Le problème n'est pas le tempo mais l'**interprétation harmonique des syncopes**.

---

## Pistes à explorer

### 1. Vocabulaire "passing chords" / notes de passage
- Détecter les segments très courts (< 0.5 beat) sur contretemps
- Les fusionner avec le beat principal adjacent
- Flag : `ENABLE_SYNCOPE_PASSING_FILTER = True`

### 2. Pondération onset vs chroma
- Réduire l'influence des onsets forts sur contretemps dans le score d'observation
- Augmenter la continuité entre beats adjacents (smoothing inter-beat)
- Paramètre : `SYNCOPE_ONSET_WEIGHT = 0.5`

### 3. Post-traitement segments courts sous syncopes
- Identifier les cas B4 (via heuristique : tempo détecté ≈ 2× tempo stable attendu)
- Fusionner les segments < 1 beat avec le voisin harmoniquement le plus proche
- Flag : `ENABLE_SYNCOPE_SEGMENT_FUSION = True`

### 4. Transition matrix adaptée aux syncopes
- Pénaliser les changements d'accord sur contretemps
- Bonus pour maintenir l'accord sur temps fort → contretemps → temps fort

---

## Méthode de test

1. Lire `scripts/EXP-047-p3-tempo-harmonique.md` pour comprendre les corrections de tempo
2. Analyser `b4_syncop_60` : accords attendus vs détectés, position des erreurs
3. Tester une piste à la fois
4. Mesurer B4 F4 après chaque test

---

## Contraintes

- Ne PAS toucher au HMM baseline
- Ne PAS supprimer de tests
- Chaque tentative derrière un flag
- Conserver B1, B2, B3, B4 stable/rubato/accél, B5

---

## Livrables attendus

1. Document `scripts/EXP-047-p3bis-syncopes-harmonie.md`
2. Modification dans `electron/audio-processor.py` si solution retenue
3. Tableau des tentatives et résultats
4. Non-régression complète

---

## Cible

B4 F4 syncopes : 65% → 84% majmin  
B4 global : inchangé ou meilleur