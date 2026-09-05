# Mission OpenCode v4 — Stabiliser la progression réelle de "You are Yahweh"

## Contexte

Projet : `/home/visiteur/piano-jazz-chords/`.

L’utilisateur a validé manuellement l’analyse de `/tmp/local_piano3.wav` (tutoriel piano de « Steve Crown – You are Yahweh ») et a fourni la progression structurelle réelle.

L’objectif n’est plus de réduire le nombre de segments. C’est de faire correspondre la timeline détectée avec la **progression réelle**.

## Ground truth structurale

Fichier : `/home/visiteur/piano-jazz-chords/opencode-tasks/ground-truth-you-are-yahweh.json`

Tonalité : **A majeur**.
Accords structurels : **A (I), D (IV), E (V), F#m (vi)**.

```
Intro:
  0.0  - 7.0   D
  7.0  - 11.0  A
  11.0 - 16.0  E
  16.0 - 21.0  F#m   (substitution diatonique)

Couplet:
  21.0 - 25.0  D
  25.0 - 30.0  A
  30.0 - 34.0  E
  34.0 - 39.0  A

Refrain (boucle E → D → A, 2 secondes chacun):
  39.0 - 41.0  E
  41.0 - 43.0  D
  43.0 - 48.0  A
  48.0 - 50.0  E
  50.0 - 52.0  D
  52.0 - 57.0  A
  57.0 - 59.0  E
  59.0 - 61.0  D
  61.0 - 66.0  A
  ... et ainsi de suite jusqu’à la fin (~141 s)
```

**Règle absolue** : les accords **B**, **C#m7**, **C#sus4**, **Dm**, **Fm** n’apparaissent jamais comme accords structurels dans ce morceau. S’ils apparaissent, ce sont des parasites de la basse/voix supérieure.

## Analyse actuelle (référence avant modification)

```
KEY A | BPM 53.8 | 46 segments

0.00-8.64   D
8.64-14.03  A
14.03-17.41 B       ← parasite
17.41-20.83 F#m
20.83-23.64 D
23.64-25.91 A
25.91-27.61 F#m     ← parasite mal placé
27.61-35.53 E
35.53-36.66 C#m7    ← parasite
36.66-37.83 E
37.83-40.61 A
40.61-43.45 B       ← parasite
43.45-49.67 A
49.67-52.50 B       ← parasite
52.50-59.30 A
59.30-61.00 B       ← parasite
61.00-62.69 D
62.69-67.80 A
67.80-70.06 B       ← parasite
70.06-71.75 D
71.75-76.86 A
76.86-79.11 E
79.11-79.67 B       ← parasite
79.67-85.89 A
85.89-88.75 B       ← parasite
88.75-91.00 A
91.00-94.39 E
94.39-95.53 C#sus4  ← parasite
95.53-97.22 B       ← parasite
97.22-99.50 A
99.50-101.75 E
101.75-102.31 A
102.31-102.89 E
102.89-104.03 A
104.03-106.86 B     ← parasite
106.86-113.08 A
113.08-115.91 B     ← parasite
115.91-122.69 A
122.69-124.39 B     ← parasite
124.39-126.11 D
126.11-131.75 A
131.75-133.44 B     ← parasite
133.44-135.16 D
135.16-135.72 A
135.72-136.28 B     ← parasite
136.28-149.33 F#m   ← trop long / mal placé
```

Problèmes observés :
1. **B parasites fréquents** — probablement causés par la note B dans les voicings (E/B, D/F#) ou des notes de passage.
2. **Frontières décalées** — le refrain devrait être E(2s) → D(2s) → A(5s), mais le moteur fond A et E en un seul bloc ou décale les changements.
3. **C#m7 / C#sus4 parasites** — notes de passage C#.
4. **F#m final trop long** — section outro mal interprétée.

## Objectif de la mission

Améliorer la correspondance entre la timeline détectée et le ground truth, **sans toucher au HMM baseline**, en ajoutant/modifiant uniquement des couches additives de post-traitement dans `electron/audio-processor.py`.

## Contraintes strictes

- **NE PAS MODIFIER** le HMM baseline (matrices de transition, templates, `_build_transition_matrix`, `_viterbi`).
- **NE PAS MODIFIER** Studio, Chordify, l’interface Analyse, `src/style.css`, `src/ui/*`.
- **NE PAS MODIFIER** `src/chord-engine/*`.
- Les modifications doivent être dans `electron/audio-processor.py` (post-traitement) ou dans les tests/benchmarks.
- Tout ajout doit être **paramétrable** et **désactivable** pour ne pas introduire de régression globale.
- Les tests de régression existants doivent tous continuer à passer.

## Stratégie suggérée (tu peux adapter)

1. **Diagnostic** : comprendre pourquoi le moteur choisit **B** alors que la tonalité est A majeur. Vérifier si c’est la basse, le chroma, ou le post-traitement actuel (`_stabilize_progression`) qui favorise B.
2. **Règle anti-parasite** : si un segment isolé a une fondamentale non diatonique dans la tonalité détectée (ex: B en La majeur), et qu’il est court et entouré d’accords diatoniques structurels, l’absorber ou le remplacer par le voisin.
3. **Stabilisation du refrain** : détecter les boucles rythmiques régulières (E-D-A toutes les 2/2/5 secondes) et aligner les frontières.
4. **Correction F#m final** : limiter la durée du F#m final à la section outro réelle, ou le fusionner dans A s’il n’est pas justifié par le chroma.
5. **Option** : ajouter une étape de sélection des fondamentales structurelles par vote majoritaire + durée, puis propager aux segments voisins.

## Livrables attendus

1. Modifications dans `electron/audio-processor.py` (fonction(s) additive(s), appelée(s) après `_stabilize_progression`).
2. Rapport court dans `/home/visiteur/piano-jazz-chords/opencode-tasks/task-you-are-yahweh-v4-result.md` contenant :
   - approche choisie ;
   - comparaison avant/après sur `/tmp/local_piano3.wav` ;
   - métriques simples calculées par toi (ex: nombre de segments parasites B, durée totale des accords corrects, etc.) ;
   - résultats des tests de régression.
3. Optionnel : un petit script de benchmark `opencode-tasks/benchmark-you-are-yahweh.py` qui compare automatiquement la sortie du moteur avec le ground truth JSON.

## Validation obligatoire

Après modification, exécuter et inclure les résultats dans le rapport :

```bash
cd /home/visiteur/piano-jazz-chords
python3 tests/test_harmonic_deterministic.py
node src/chord-engine/test-chords.js
node src/analyzer/test-regression-part1.js
node src/chord-engine/test-regression-part3.js
npm run build
```

Et comparer l’analyse de `/tmp/local_piano3.wav` avant/après avec le ground truth.

## Critère de réussite minimum

- Aucune régression sur les tests existants.
- Réduction significative des segments **B**, **C#m7**, **C#sus4** parasites.
- Les fondamentales structurelles **A, D, E, F#m** doivent représenter ≥ 80 % de la durée totale.
- La progression du refrain doit montrer une structure E → D → A reconnaissable.

## Critère de réussite idéal

- Correspondance temporelle raisonnable avec le ground truth (± 2 s sur les grandes sections).
- Plus de B parasite.
- F#m correctement positionné en intro et non en fin prolongée.
