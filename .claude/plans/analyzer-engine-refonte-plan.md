# Plan : Refonte du moteur d'analyse audio – Priorité précision

## Objectif

Rendre la détection d'accords de l'onglet **Analyse** fiable et propre, au niveau de Chordify / Moises / Yamaha Chord Tracker sur du pop/rock/gospel simple, sans chercher à détecter des accords jazz complexes.

Priorité stricte :
1. La bonne tonalité, affichée avec sa confiance et les alternatives.
2. Les bons accords principaux (majeur / mineur d'abord).
3. Puis `7`, `maj7`, `sus2`, `sus4` uniquement si la confiance est élevée.
4. Pas de `9/11/13`, altérations, rootless, polychords, upper-structures pour l'instant.
5. Le défilement horizontal des accords reste synchronisé avec la musique, même quand on joue sur le clavier MIDI.
6. Le clavier virtuel conserve exactement sa taille, hauteur et zoom actuels.

## Diagnostic rapide

- Le moteur actuel (`electron/audio-processor.py::analyze_chords`) fait du template-matching chromagramme frame par frame sans contexte harmonique : il invente des accords et produit des faux positifs.
- La tonalité est détectée par Krumhansl-Schmuckler uniquement, sans confirmation par la grille d'accords.
- Le tempo n'utilise pas de contexte rythmique : il est souvent faux sur du live.
- Le défilement de l'analyse est piloté par `requestAnimationFrame` du lecteur audio, mais `handleNoteOn` déclenche `refreshChord()` qui exécute `detectChord()` de manière synchrone et coûteuse : sur des accords riches cela bloque le thread principal et fait rater les frames d'animation.

## Choix architecturaux

### 1. Moteur Python : HMM + chromagramme beat-synchrone

On garde la stack actuelle (librosa, numpy, scipy) et on remplace l'algorithme de templates naïf par un décodeur Viterbi contextuel.

Étapes du nouveau pipeline dans `electron/audio-processor.py` :

1. **Prétraitement**
   - Extraction WAV (déjà faite via ffmpeg).
   - Chargement mono à 22050 Hz.
   - Séparation harmonique/percussive (`librosa.effects.hpss`) pour analyser la partie harmonique.

2. **Rythme**
   - `librosa.beat.beat_track` → grille de temps beat-synchrone.
   - Tempo moyen calculé sur les inter-beat intervals.
   - Estimation de signature 3/4 vs 4/4 par autocorrélation de l'énergie d'attaque (conservée / améliorée).
   - Pour un live variable, la grille suit les beats réels : on garde le tempo moyen en affichage, la synchronisation reste sur les temps détectés.

3. **Tonalité**
   - Profil Krumhansl-Schmuckler pondéré par l'énergie sur le chromagramme entier.
   - Retourne la tonalité principale + une liste ordonnée de candidates `{name, mode, confidence}`.
   - La tonalité sert de priorité dans le décodeur d'accords (bonus aux degrés diatoniques, pénalité aux emprunts).

4. **Chromagramme beat-synchrone**
   - `librosa.feature.chroma_cqt` sur la partie harmonique (meilleure résolution fréquentielle que STFT).
   - Moyennage des frames à l'intérieur de chaque beat → un vecteur 12D par beat.

5. **Vocabulaire d'accords strict**
   - 12 majeurs (`C`, `D#`, …)
   - 12 mineurs (`Cm`)
   - 12 dominantes (`C7`)
   - 12 majeur 7 (`Cmaj7`)
   - 12 suspendus 2 (`Csus2`)
   - 12 suspendus 4 (`Csus4`)
   - 1 état `N` (pas d'accord / silence)
   - Total : 73 états.

6. **Vraisemblance d'observation**
   - Template pitch-class pour chaque accord (fondamentale + intervalles).
   - Similarité cosinus entre le chroma beat et chaque template.
   - Bonus/pénalité selon la tonalité détectée (I, ii, iii, IV, V, vi en majeur ; i, ii°, III, iv, V, VI, VII en mineur).

7. **Matrice de transition (contexte harmonique)**
   - Forte probabilité de rester sur le même accord → accords stables et durées réalistes.
   - Privilégier les mouvements de quinte, de ton voisin, les degrés diatoniques.
   - Pénaliser les sauts chromatiques inexpliqués et les changements de type sans raison.
   - L'état `N` autorise les coupures (silences, intros sans harmonie).

8. **Décodage Viterbi**
   - Retourne la meilleure séquence d'états sur la grille beat.
   - Cela corrige les erreurs audio isolées en faveur d'une progression cohérente (ex. privilégie `Em C G D` en Sol majeur).

9. **Post-traitement / seuillage**
   - Fusion des états identiques consécutifs pour créer les segments `{startTime, endTime, chord, confidence}`.
   - Suppression des segments trop courts (< 1 beat ou < 0.6 s) et des états `N` sauf vrais silences.
   - ** downgrade conditionnel** : un `7`, `maj7`, `sus2`, `sus4` n'est gardé que s'il bat le candidat triade majeur/mineur par une marge de confiance suffisante (ex. > 0.08). Sinon on affiche la triade simple.
   - Confiance globale = moyenne des confiances des segments pondérée par durée.

10. **Sortie JSON**
    - `duration`, `tempo`, `timeSignature`
    - `key` (nom), `keyConfidence`, `keyCandidates`
    - `confidence`
    - `chords` : `startTime`, `endTime`, `chord`, `confidence`

### 2. Côté JS : conserver l'abstraction, enrichir les données

- `src/analyzer/audio-analyzer.js` reste l'interface. On normalise la réponse Python dans le format attendu par l'UI.
- On ajoute `keyConfidence` et `keyCandidates` au résumé.
- Aucun traitement harmonique lourd n'est fait côté renderer : toute l'intelligence reste dans Python.

### 3. UI : affichage de la tonalité et alternatives

- `src/ui/analyzer-tab.js` :
  - Afficher la tonalité principale avec son pourcentage de confiance.
  - Afficher les 2–3 alternatives sous forme de liste compacte (ex. `Em mineur 78%`).
  - Conserver la timeline horizontale, les blocs d'accords synchronisés, le défilement centré sur la tête de lecture.
  - Ajouter une indication du tempo moyen (BPM).

- `src/index.html` / `src/style.css` :
  - Étendre la carte "Tonalité" pour accueillir les alternatives.
  - Ne pas toucher au clavier virtuel ni à ses dimensions.

### 4. Corriger le bug "le défilement s'arrête quand je joue du MIDI"

Cause : `handleNoteOn` → `refreshChord()` → `detectChord()` est exécuté de manière synchrone et peut bloquer le thread principal, ce qui fait rater les `requestAnimationFrame` du lecteur audio.

Correctifs dans `src/main.js` :
- Décaler `refreshChord()` sur un `requestAnimationFrame` / `setTimeout(0)` avec un `pendingRefresh` pour éviter les appels en cascade.
- Limiter la fréquence de détection à ~80–100 ms maximum pour libérer le thread pour l'animation.
- S'assurer qu'aucun gestionnaire MIDI ne fait `pause()` / `seek()` sur le lecteur audio de l'onglet Analyse : le lecteur audio et l'entrée MIDI restent dans deux états totalement séparés.
- Côté `src/audio/media-engine.js`, vérifier que la boucle `requestAnimationFrame` du lecteur est lancée sur l'événement `play` et arrêtée uniquement sur `pause`/`ended`.

### 5. Moteur d'accords en temps réel (practice) : optionnel mais recommandé

Pour cohérence, on peut faire passer `src/chord-engine/index.js` sur le même vocabulaire strict (triades + 7/maj7/sus) en mode "analyse de base", et conserver l'ancien moteur enrichi derrière une option ou un autre export pour ne pas casser la pratique. Cela réduira aussi les faux positifs en live.

## Phases d'implémentation

### Phase 1 — Fondation Python
- Réécrire `analyze_chords` dans `electron/audio-processor.py` avec le pipeline HMM beat-synchrone.
- Ajouter des fonctions utilitaires : prétraitement HPSS, chroma CQT, Viterbi, segmentation, post-traitement.
- Nettoyer les anciens templates et la logique frame-by-frame.
- Ajouter un mode de test autonome : générer un WAV synthétique (`C - Am - F - G`) et vérifier que la sortie correspond.

### Phase 2 — Pont JS / normalisation
- Mettre à jour `src/analyzer/audio-analyzer.js` pour parser `keyCandidates`.
- Adapter `src/ui/analyzer-tab.js` pour afficher tonalité + confiance + alternatives.

### Phase 3 — Synchronisation et bug MIDI
- Modifier `src/main.js` pour throttler / décaler `refreshChord`.
- Vérifier `src/audio/media-engine.js` : isoler totalement la boucle de lecture de tout traitement MIDI.
- Ajouter un garde-fou : si l'onglet actif est "analysis", les événements MIDI ne déclenchent que la synthèse sonore et le highlight clavier, jamais une action sur le lecteur.

### Phase 4 — Tests de régression
- Lancer `node src/chord-engine/test-regression-part3.js`.
- Lancer `node src/analyzer/test-regression-part1.js` si pertinent.
- Lancer `npm run build`.
- Tester manuellement : import d'un MP3, lecture, défilement, puis jouer une note MIDI : le défilement doit rester fluide.

### Phase 5 — Documentation
- Mettre à jour `CHANGES.md`.
- Noter explicitement que les accords enrichis (9, 11, 13, substitutions) sont volontairement hors périmètre jusqu'à ce que la base soit solide.

## Fichiers impactés

- `electron/audio-processor.py` — moteur d'analyse audio (réécriture majeure)
- `src/analyzer/audio-analyzer.js` — normalisation des résultats
- `src/ui/analyzer-tab.js` — affichage tonalité/confiance/alternatives
- `src/index.html` — structure du résumé d'analyse
- `src/style.css` — styles du résumé
- `src/main.js` — throttling MIDI / détection, isolation du lecteur
- `src/audio/media-engine.js` — vérification / renforcement de l'indépendance du lecteur
- `src/chord-engine/index.js` — éventuel mode de détection basique unifié
- `CHANGES.md` — documentation

## Ce qui reste volontairement hors périmètre

- Accords enrichis : 9, 11, 13, altérations.
- Réharmonisation, suggestions IA, Masterclass.
- Analyse gospel/jazz avancée, voicings, upper structures, quartal, substitutions.
- Détection de tonalité modale ou emprunts modaux complexes.
- Modèles ML externes dans cette itération ; l'architecture HMM reste remplaçable plus tard via `AudioAnalyzer`.

## Risques

1. **Qualité sur arrangements très denses** : un morceau orchestral très chargé restera difficile avec un chromagramme seul. Accepter que la v1 vise pop/rock/gospel/piano solo.
2. **Temps de calcul** : Viterbi + CQT est rapide sur un morceau de 3–5 min, mais il faut tester sur fichier long.
3. **Régression Studio** : l'extraction audio est partagée avec le Studio. On ne change pas l'IPC `analyzer:process-file` ni la commande `extract`, donc le Studio reste stable.
4. **Clavier MIDI** : on ne touche ni à la taille ni au rendu du clavier ; seul le scheduling de `refreshChord` change.

## Prochaine étape

Valider ce plan. Une fois validé, j'implémente la Phase 1 (Python) d'abord, puis le reste.
