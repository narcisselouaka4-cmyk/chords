# Mission OpenCode — Améliorer la détection sur "You are Yahweh"

## Contexte

Projet : Piano Jazz Chords (`/home/visiteur/piano-jazz-chords/`)
Moteur harmonique : `electron/audio-processor.py`

## Problème à résoudre

Le moteur actuel sur-segmente et parasite l'analyse du tutoriel piano **Steve Crown – You are Yahweh**.

### Référence attendue (vidéo YouTube + enregistrement d'écran)
- Vidéo originale : https://youtu.be/MLWnpB8jTfw
- Enregistrement d'écran de la référence : `/home/visiteur/2026-08-20 22-26-49.mkv`
- Progression structurelle visible (accords bleus à gauche) : **A → E → B → D** en boucle
- Tonalité : **A major**

### Résultat actuel de Piano Jazz Chords
- Vidéo d'analyse locale : `/home/visiteur/2026-08-20 22-15-41.mkv`
- Audio extrait : `/tmp/local_piano3.wav`
- Analyse JSON brute : `/tmp/local_analysis3_clean.json`
- Tonalité détectée : A major ✅
- Tempo détecté : 53.8 BPM (affiché appli : 108 BPM) ❌
- Nombre de segments : 73 ❌ (sur-segmentation massive)

### Timeline actuelle (extrait)
```
0.00 - 6.94  : Dmaj7
6.94 - 8.08  : Asus4
8.08 - 8.64  : D
8.64 - 9.20  : E
9.20 - 12.89 : A
12.89 - 13.47: C#
13.47 - 14.03: A
14.03 - 17.41: Bsus4
17.41 - 20.83: F#m
20.83 - 23.64: Dmaj7
23.64 - 25.91: Asus4
...
136.28 - 149.33: F#m7
```

### Écarts majeurs
1. **Sur-segmentation** : 73 segments pour une progression simple en boucle A-E-B-D.
2. **Parasites de qualité** : Dmaj7, Asus4, Bsus4, Esus4, F#m7, C#m7, C#sus4, Gsus4, etc. Le tutoriel utilise des triades/simples accords : A, E, B, D.
3. **Fondamentales parasites** : C#, F#, G apparaissent comme des fondamentales d'accords, alors que ce sont des notes internes de l'arpège ou de la ligne mélodique.
4. **Tempo** : probablement un multiple/sous-multiple du vrai tempo (non prioritaire, mais à noter).

## Objectif

Améliorer la couche d'**interprétation harmonique** (post-Viterbi) pour que l'analyse de ce fichier donne une timeline beaucoup plus proche de la référence A → E → B → D, avec moins de segments et moins de parasites.

## Contraintes STRICTES (non négociables)

1. **Ne PAS modifier le HMM baseline** dans `electron/audio-processor.py` ni ailleurs. Le modèle HMM figé le 2026-07-09 reste inchangé.
2. **Ne PAS toucher à l'interface Studio/Chordify** : pas de modification UI, pas de réorganisation de code frontend.
3. **Ne PAS supprimer Chordify, la sélection manuelle d'accords, ni la timeline Chordify.**
4. **Ne PAS refactorer/reorganiser le code source** selon la structure du wiki.
5. **Conserver tous les tests de régression existants** :
   - `node src/chord-engine/test-chords.js` (doit rester à 98/98)
   - `node src/analyzer/test-regression-part1.js`
   - `node src/chord-engine/test-regression-part3.js`
   - `python3 tests/test_harmonic_deterministic.py` (doit rester ≥ 14/17, idéalement améliorer)
6. Le build `npm run build` doit passer.
7. Les modifications doivent être **additives** : on ajoute une couche de post-traitement, on ne change pas l'extraction audio, l'observation chroma, ni le Viterbi.

## Fichiers à modifier (principaux)

- `electron/audio-processor.py` : enrichir/améliorer `_merge_arpeggio_segments()` ou ajouter une nouvelle couche de post-traitement.
- `tests/test_harmonic_deterministic.py` : optionnel, pour ajouter un test synthétique de type A-E-B-D si pertinent.

## Approche suggérée

1. Analyser `/tmp/local_analysis3_clean.json` pour comprendre exactement où les segments A/E/B/D se brisent en C#, F#, G, etc.
2. Améliorer `_merge_arpeggio_segments()` pour :
   - Fusionner les courts segments consécutifs dont les fondamentales forment une progression diatonique simple et répétitive (I-V-II-IV en A major).
   - Privilégier les triades/simples accords quand le contexte est stable (répétition de la même cellule).
   - Ignorer/absorber les fondamentales parasites (C#, F#, G) quand elles apparaissent entre des accords de la progression principale.
3. Optionnellement ajouter un post-traitement de "pattern loop detection" : si A-E-B-D revient plusieurs fois, stabiliser les accords sur cette boucle.
4. Ne PAS toucher au beat tracking ni au tempo pour cette mission (hors scope).

## Livrables attendus

1. Code modifié dans `electron/audio-processor.py` (et éventuellement tests).
2. Un nouveau run d'analyse sur `/tmp/local_piano3.wav` montrant l'amélioration (moins de segments, moins de parasites, fondamentales principales A/E/B/D préservées).
3. Les tests de régression doivent toujours passer.
4. Un court rapport écrit dans `/home/visiteur/piano-jazz-chords/opencode-tasks/task-you-are-yahweh-result.md` expliquant ce qui a été modifié et les résultats obtenus.

## Commandes de validation

```bash
cd /home/visiteur/piano-jazz-chords
python3 -c "
import json, importlib.util
spec = importlib.util.spec_from_file_location('audio_processor', 'electron/audio-processor.py')
ap = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ap)
result = ap.analyze_chords('/tmp/local_piano3.wav')
print(json.dumps(result, indent=2, ensure_ascii=False))
" > /tmp/local_analysis3_after.json 2>&1

node src/chord-engine/test-chords.js
node src/analyzer/test-regression-part1.js
node src/chord-engine/test-regression-part3.js
python3 tests/test_harmonic_deterministic.py
npm run build
```

## Notes

- La couche `_merge_arpeggio_segments()` existe déjà dans `audio-processor.py`. Elle a permis de passer de 11/17 à 14/17 sur le banc déterministe. Elle peut être enrichie.
- L'utilisateur a confirmé que le morceau analysé est bien Steve Crown - You are Yahweh.
- Le wiki du projet est dans `/home/visiteur/.openclaw/workspace/apps/piano-jazz-chord/` pour référence.
