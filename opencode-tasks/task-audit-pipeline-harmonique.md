# Mission OpenCode — Audit systématique du pipeline harmonique

## Contexte

Projet : Piano Jazz Chords (`/home/visiteur/piano-jazz-chords/`).

L’objectif final du produit est que le moteur de détection d’accords fonctionne de manière **fiable sur n’importe quel fichier audio**, et pas seulement sur des cas d’école ou un morceau spécifique.

Le moteur harmonique est principalement dans `electron/audio-processor.py`. Il repose sur un HMM/Viterbi dont la baseline est **gelée** depuis 2026-07-09. Des couches additives de post-traitement ont été ajoutées (`_merge_arpeggio_segments`, `_stabilize_progression`).

## Objectif de cette mission

Faire un **audit systématique et non destructif** du pipeline harmonique pour identifier les points de fragilité génériques et proposer un plan de benchmark universel.

## Contraintes strictes

- NE MODIFIE AUCUN FICHIER SOURCE pendant cette mission.
- NE MODIFIE PAS le HMM baseline.
- NE MODIFIE PAS Studio, Chordify, ni l’interface Analyse.
- Lis et analyse uniquement ; propose ; documente.
- Si tu découvres un bug trivial qui mérite une correction rapide, note-le mais ne corrige pas sans autorisation explicite.

## Fichiers à analyser

1. `electron/audio-processor.py` — tout le pipeline d’analyse audio (extraction, chroma, beat tracking, HMM/Viterbi, post-traitement, classification).
2. `tests/test_harmonic_deterministic.py` — tests déterministes stricts sur beat_chroma synthétique.
3. `tests/test_arpeggio_segmentation.py` — runner global qui agrège couche 1 (déterministe) et couche 2 (audio E2E).
4. `tests/test_arpeggio_audio.py` — tests audio de bout en bout.
5. `tests/generate-arpeggio-fixtures.py` (si présent) — générateur de fixtures.
6. Tous autres tests/benchmarks dans `tests/` et `src/chord-engine/`, `src/analyzer/`.
7. La documentation du wiki si pertinente : `/home/visiteur/.openclaw/workspace/apps/piano-jazz-chord/`, notamment `tech/moteur-harmonique.md`, `contracts/moteur-harmonique-contract.md`, `log.md`.

## Questions à répondre

Pour chaque étape du pipeline (audio → extraction → chroma → beat tracking → agrégation temporelle → candidats → HMM/Viterbi → segmentation → classification → post-traitement → Chordify), réponds aux questions suivantes :

1. Quel est le rôle exact de cette étape ?
2. Quels sont les hyperparamètres et seuils clés ?
3. Quels sont les cas où cette étape est susceptible de dégrader la fiabilité générique ?
4. Cette étape dépend-elle fortement du genre, du tempo, de la qualité audio, de la densité harmonique ?
5. Existe-t-il des tests qui couvrent cette étape isolément ?
6. Quelles métriques pourraient mesurer la qualité de sortie de cette étape ?

## Livrable attendu

Un rapport structuré à écrire dans `/home/visiteur/piano-jazz-chords/opencode-tasks/audit-pipeline-harmonique.md`.

Le rapport doit contenir :

1. **Cartographie du pipeline** — étape par étape, avec fichiers/fonctions concernés.
2. **Points de fragilité identifiés** — classés par criticité (haute / moyenne / faible) et par étape du pipeline.
3. **Analyse des tests existants** — couverture, lacunes, ce qu’ils mesurent vraiment, ce qu’ils ne mesurent pas.
4. **Proposition de benchmark universel** :
   - métriques objectives à définir (ex: accuracy root, accuracy qualité, fragmentation rate, false change rate, missed change rate, tonal coherence, etc.) ;
   - corpus de référence (synthétique + audio réel si disponible) ;
   - procédure de mesure avant/après chaque modification.
5. **Pistes d’amélioration génériques** — idées de couches additives ou de paramétrages qui amélioreraient la robustesse globale sans casser la baseline.
6. **Plan d’action recommandé** — ordre de priorité des prochaines missions.

## Durée et mode

- Prends le temps nécessaire pour lire et comprendre le code.
- Tu n’as pas à modifier le code.
- Documente avec des exemples concrets tirés du code quand c’est pertinent.
- Utilise un ton technique et concis.

## Validation

À la fin, exécute si possible les commandes suivantes et inclus les résultats bruts en annexe du rapport :

```bash
cd /home/visiteur/piano-jazz-chords
python3 tests/test_harmonic_deterministic.py
python3 tests/test_arpeggio_segmentation.py --allow-blocked
node src/chord-engine/test-chords.js
node src/analyzer/test-regression-part1.js
node src/chord-engine/test-regression-part3.js
npm run build
```
