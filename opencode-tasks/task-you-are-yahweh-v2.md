# Mission OpenCode — Améliorer la stabilité harmonique sur "You are Yahweh"

## Contexte

Projet : `/home/visiteur/piano-jazz-chords/`
Fichier moteur : `electron/audio-processor.py`

Le moteur harmonique HMM/Viterbi baseline est figé. Une couche additive `_merge_arpeggio_segments()` existe déjà en post-Viterbi. Elle a permis de passer de 11/17 à 14/17 sur le banc déterministe.

## Cas cible

Morceau : Steve Crown – You are Yahweh (tutoriel piano Synthesia).
Vidéo de référence : `/home/visiteur/2026-08-20 22-26-49.mkv` (enregistrement d'écran de YouTube).
Audio analysé par l'appli : `/tmp/local_piano3.wav`.
Analyse actuelle : `/tmp/local_analysis3_clean.json`.

### Référence attendue
Progression structurelle visible dans la vidéo (accords bleus à gauche) : **A → E → B → D** en boucle.
Tonalité : A major.

### État actuel
- Tonalité détectée : A major ✅
- Tempo détecté : 53.8 BPM (peu fiable)
- Nombre de segments : 73 ❌
- Timeline très bruitée : Dmaj7, Asus4, Bsus4, Esus4, F#m7, C#m7, C#sus4, Gsus4...

### Problème
L'HMM/Viterbi interprète les notes de l'arpège / ligne mélodique comme des changements d'accord. Les fondamentales parasites C#, F#, G apparaissent comme des accords, et les vrais accords A/E/B/D sont sur-qualifiés (sus4, maj7, m7).

## Objectif

Améliorer la couche de post-traitement après Viterbi pour que l'analyse de `/tmp/local_piano3.wav` donne une timeline nettement plus proche de la référence A→E→B→D, sans toucher au HMM baseline ni à l'UI.

## Contraintes absolues

1. Ne pas modifier le HMM baseline, les observations chroma, le beat tracking, ni l'extraction audio.
2. Ne pas toucher au code UI/Studio/Chordify.
3. Ne pas supprimer Chordify, la sélection manuelle, ni la timeline.
4. Ne pas refactorer/reorganiser le code source.
5. Conserver les tests de régression :
   - `python3 tests/test_harmonic_deterministic.py` (≥ 14/17)
   - `node src/chord-engine/test-chords.js` (98/98)
   - `node src/analyzer/test-regression-part1.js`
   - `node src/chord-engine/test-regression-part3.js`
   - `npm run build`
6. Toute modification doit être additive (post-traitement).
7. Si une modification structurelle majeure apparaît nécessaire, STOP et explique pourquoi dans le rapport.

## Travail demandé

1. **Auditer** `electron/audio-processor.py`, `_merge_arpeggio_segments()`, et la structure des segments de `/tmp/local_analysis3_clean.json`.
2. **Concevoir** une amélioration additive du post-traitement (peut être dans `_merge_arpeggio_segments()` ou dans une nouvelle fonction appelée après).
3. **Implémenter** la solution dans `electron/audio-processor.py`.
4. **Tester** sur `/tmp/local_piano3.wav` et comparer le nombre de segments / la qualité des accords avant/après.
5. **Lancer** tous les tests de régression listés ci-dessus.
6. **Rédiger** un rapport dans `/home/visiteur/piano-jazz-chords/opencode-tasks/task-you-are-yahweh-v2-result.md` avec :
   - ce qui a été modifié
   - la timeline avant/après
   - les résultats des tests
   - les éventuelles limites restantes

## Approche suggérée (non obligatoire, à valider par toi)

- Détecter les fondamentales de la progression principale (A, E, B, D) en A major.
- Identifier les fondamentales parasites (C#, F#, G) qui apparaissent entre deux accords principaux.
- Absorber un segment parasite court dans le segment principal adjacent si sa fondamentale est une note de l'accord adjacent (ex: C# dans A major est la tierce de A ; F# est la tierce de D ; G est la septième d'A).
- Simplifier les qualités vers triade majeure/mineure par défaut quand le contexte est stable et répétitif.
- Fusionner les segments consécutifs de même fondamentale après simplification.

## Validation finale

L'analyse de `/tmp/local_piano3.wav` doit montrer une réduction significative du nombre de segments et une dominance des accords A, E, B, D (ou leurs variantes simples Amaj, Emaj, Bmaj, Dmaj).

Les tests de régression ne doivent pas regresser.
