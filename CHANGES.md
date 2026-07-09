# Journal des modifications — Piano Jazz Chords

> Ce fichier permet de savoir qui (OpenCode ou Claude) a modifié quoi et quand.
> Règle : chaque intervention significative est documentée ici avec date, agent, fichiers touchés et description.

## 2026-07-09 — OpenCode (Baseline officielle du moteur harmonique)

**Objectif** : enrichir le moteur HMM (10 qualités, 109 états), stabiliser
les sorties par régularisation post-Viterbi, et figer la baseline officielle.

**Ce qui a été fait :**

- `electron/audio-processor.py`
  - Passage de 5 à 10 qualités d'accords (`CHORD_TEMPLATES_WEIGHTED`) :
    ajout de `maj7`, `m7`, `dim`, `aug`, `m7b5`
  - `_build_diatonic_roots()` : union de 3 variantes mineures (naturelle,
    harmonique, mélodique)
  - `_compute_observation_scores()` : score root-only, bonus diatonique +0.05
  - `observation_candidates` + `viterbi_choice` dans la sortie JSON
  - `ENABLE_CHORD_DOWNGRADE=False` (désactivé)
  - `QUALITY_FAMILIES` (5 familles) + `_is_similar_quality()` pour la
    régularisation
  - `_build_transition_matrix()` : `same_root_similar` (qualité voisine =
    −0.02, neutre)
  - `_merge_similar_segments()` : fusion post-Viterbi des segments de même
    fondamentale et qualité voisine

- `scripts/test-analysis-diagnostic.js`
  - Ajout de `sanitizeAudioPath()` (robustesse aux guillemets Unicode)
  - Ajout de `HARMONIC_FAMILIES` + `toHarmonicKey()` + `computeChordsPerMeasure()`
  - Ajout de `segmentsPerMinute` + `qualityCounts` dans les stats
  - Flags `--save-pre=<path>` / `--benchmark-pre=<path>`
  - Section `FINAL HARMONIC ENGINE BENCHMARK` + timeline comparative 15s

- `docs/ARCHITECTURE.md` (création) — documentation complète du moteur,
  de la baseline et de la commande de reproductibilité

**Benchmark final — Amazing Grace Gospel Piano (72 BPM, 63 accords)**

```
Pipeline                   Score    Fond.    Segm.  Chg/m  Seg/min
RAW enrichi (avant régul.)   21.2%   22.9%   231  5.45  112.5
RAW + régularisation         27.7%   30.5%   175  4.72   85.2
GRID_HALF + régul.           47.9%   52.1%    60  1.60   29.2
```

**Vérifications :**
- `node --check scripts/test-analysis-diagnostic.js` OK
- Benchmark reproductible via `--benchmark-pre=/tmp/pre_regul.json`
- Moteur figé comme baseline officielle du projet

---

## 2026-07-08 — Claude (Diagnostic audio et corrections d'interface)

**Objectif** : expliquer et corriger les mauvais résultats constatés sur un morceau réel (tempo à 152, accords incohérents) ; améliorer l'interface de l'onglet Analyse.

**Diagnostic réalisé :**
- Morceau test : `Track_006` du Studio (original en Sol majeur).
- Analyse du **mix complet** : tonalité `G majeur`, tempo `152 BPM`, accords `G Bm Em Dsus4 D7 G F#m D7 D G Em G...`
- Analyse du **piano isolé** (stem `piano.wav`) : tonalité `G majeur`, tempo `78.3 BPM`, accords `G C D7 G Gmaj7 G D F#m Em G Gsus4 G...`
- Conclusion : le moteur n'est pas fondamentalement cassé. La densité du mix (batterie, voix, autres instruments) noie le chromagramme et double artificiellement le tempo perçu. La séparation source et la correction du tempo sont les leviers principaux.

**Ce qui a été fait :**
- `electron/audio-processor.py`
  - Ajout de `_resolve_tempo(y, sr, detected_tempo)` : choisit entre `tempo/2`, `tempo` et `tempo*2` en maximisant l'alignement de la grille sur l'enveloppe d'onset.
  - Pénalise les tempi en dehors de la plage musicale raisonnable (45–200 BPM) et désavantage légèrement le double pour favoriser la valeur réelle.
  - Le mix testé passe ainsi de `152 BPM` à `76 BPM`, cohérent avec le piano isolé (`78.3 BPM`).

- `electron/main.js`
  - Ajout de `findStudioPianoStemForFile(filePath)` : si le fichier importé dans l'onglet Analyse correspond à un morceau déjà séparé dans le Studio, on analyse son stem `piano.wav` au lieu du mix complet.
  - Le lecteur audio continue de jouer le mix original (`wavPath`), tandis que l'analyse utilise le stem (`analysisWavPath`).
  - Retourne `usedPianoStem: true` quand ce mécanisme s'active.

- `src/analyzer/audio-analyzer.js`
  - Propagation des champs `analysisWavPath` et `usedPianoStem`.

- `src/ui/analyzer-tab.js` / `src/index.html` / `src/style.css`
  - Suppression des pourcentages de confiance dans le résumé (tonalité, alternatives, carte Confiance) : ils prêtaient à confusion.
  - Ajout d'un badge "Analyse piano isolé" dans la carte Tonalité quand `usedPianoStem` est actif.
  - Correction du clavier MIDI virtuel qui apparaissait "croqué" sur les onglets Analyse/Studio : le SVG force désormais `height: 100%` et `width: auto` avec `max-width: 100%`, évitant que le ratio du viewBox ne fasse déborder et couper les touches.

**Vérifications :**
- `npm run build` OK.
- `node src/analyzer/test-regression-part1.js` OK.
- `node src/chord-engine/test-regression-part3.js` OK.
- Test Python : mix `Track_006` → `G majeur 76 BPM` ; piano isolé → `G majeur 78.3 BPM` avec progression diatonique nettement plus propre.

## 2026-07-08 — Claude (Refonte UI de l'onglet Analyse au modèle Chordify)

**Objectif** : reproduire l'interface Chordify observée dans la capture `Capture d’écran du 2026-07-08 03-22-47.png` : en-tête morceau, lecteur avec outils, timeline horizontale, mini-claviers par accord, onglets et panneau latéral d'informations.

**Ce qui a été fait :**
- `src/index.html`
  - Remplacement de la structure précédente (cartes de résumé + timeline simple) par une interface complète :
    - En-tête : titre du morceau, artiste/source, badge "Analyse piano isolé", bouton "Importer un autre fichier".
    - Lecteur : transport (précédent, play/pause), barre de progression avec temps courant/total.
    - Barre d'outils : compte à rebours, boucle, tempo, transposer, simplifier, accordeur.
    - Timeline horizontale défilable avec gros blocs d'accords.
    - Onglets : "Grille d'accords", "Aperçu des accords", "Accords & Paroles".
    - Zone principale : grille de cartes d'accords avec mini-claviers.
    - Panneau latéral droit : lecteur visuel (placeholder), détails de la chanson (tonalité, accords, BPM, signature, durée), morceaux similaires (placeholder).

- `src/ui/analyzer-tab.js` (réécriture complète)
  - Rendu de l'en-tête, du lecteur personnalisé, de la timeline, de la grille de mini-claviers et du panneau latéral.
  - Calcul des notes d'un accord à partir de son nom texte pour générer les mini-claviers pédagogiques.
  - Synchronisation temps : barre de progression, accord actif dans la timeline et dans la grille.
  - Clic sur un accord (timeline ou grille) → saut à l'instant correspondant + lecture.
  - Contrôles fonctionnels : lecture/pause, retour au début, tempo de lecture, boucle.
  - Placeholders éducatifs pour compte à rebours, transposition globale, simplification et accordeur.

- `src/style.css`
  - Styles complets pour la nouvelle interface : en-tête, lecteur, outils, timeline, onglets, grille de cartes, mini-claviers, sidebar, responsive.
  - Suppression des anciens styles `.analyzer-summary`, `.analyzer-timeline`, `.analyzer-chord-block`, `.analyzer-playhead`, etc.

**Fonctionnalités volontairement en placeholder :**
- Paroles synchronisées.
- Aperçu audio individuel des accords.
- Accordeur, transposition globale, simplification, compte à rebours.
- Lecteur vidéo / visuel et suggestions de morceaux similaires.

**Vérifications :**
- `npm run build` OK.
- `node src/analyzer/test-regression-part1.js` OK.
- `node src/chord-engine/test-regression-part3.js` OK.

## 2026-07-08 — Claude (Refonte du moteur d'analyse audio – HMM + contexte harmonique)

**Objectif** : obtenir une détection d'accords fiable (tonalité, triades, 7/maj7/sus si confiance élevée, timing) pour l'onglet Analyse, et empêcher l'entrée MIDI de perturber la lecture audio.

**Ce qui a été fait :**
- `electron/audio-processor.py`
  - Remplacement du template-matching frame par frame par un décodeur **HMM + chromagramme beat-synchrone**.
  - Prétraitement : séparation harmonique/percussive (`librosa.effects.hpss`) et chroma CQT.
  - Détection des beats réels, tempo moyen robuste (médiane des inter-beat intervals) et signature rythmique conservée.
  - Tonalité par profils Krumhansl-Schmuckler, avec liste des candidates ordonnées.
  - Vocabulaire strict d'accords : majeur, mineur, 7, maj7, sus2, sus4 — pas de 9/11/13/altérations.
  - Matrice de transition privilégiant la stabilité, les mouvements naturels (quinte, ton voisin) et les degrés diatoniques.
  - Décodage Viterbi pour corriger les erreurs isolées et produire des progressions cohérentes.
  - Post-traitement : suppression des silences/segments très courts, fusion des répétitions, downgrade conditionnel des accords avancés vers la triade simple si la confiance n'est pas nette.
  - Sortie enrichie : `keyMode`, `keyCandidates`.

- `src/analyzer/audio-analyzer.js`
  - Normalisation des nouveaux champs `keyMode` et `keyCandidates`.

- `src/ui/analyzer-tab.js` / `src/index.html` / `src/style.css`
  - Affichage de la tonalité principale avec confiance (`G majeur 96 %`).
  - Affichage des alternatives (`Em mineur 78 %`, etc.) sous la carte Tonalité.
  - Styles pour les pastilles d'alternatives.

- `src/main.js`
  - Différé de `refreshChord` (80 ms) et du callback du `noteGrouper` (50 ms) pour ne pas bloquer le thread principal.
  - Cela garantit que le défilement de la timeline de l'onglet Analyse reste fluide quand on joue sur le clavier MIDI.

**Fonctionnalités volontairement absentes :**
- Accords enrichis (9, 11, 13), altérations, rootless, polychords, upper structures, substitutions, réharmonisation.
- IA, scores, voice leading, analyses pédagogiques.

**Vérifications :**
- `npm run build` OK.
- `node src/analyzer/test-regression-part1.js` OK.
- `node src/chord-engine/test-regression-part3.js` OK.
- Test Python sur progression synthétique `C – Am – F – G` : tonalité `C majeur`, accords correctement détectés.

## 2026-07-08 — Claude (Refonte du module Analyse – Étape 2 : fiabilité et interface horizontale)

**Objectif** : rendre le module Analyse fiable, lisible et agréable à utiliser : pipeline d'analyse logique, informations globales affichées, détection contextuelle des accords principaux, timeline horizontale synchronisée.

**Ce qui a été fait :**
- `electron/audio-processor.py`
  - Pipeline d'analyse réorganisé : extraction → tempo → signature estimée → tonalité → segmentation → accords principaux contextualisés.
  - Détection du tempo avec `librosa.beat.beat_track` (wrapper robuste aux versions de librosa).
  - Estimation de la signature rythmique par autocorrélation des beats (3/4 vs 4/4, fallback 4/4).
  - Détection de la tonalité par profils Krumhansl-Schmuckler pondérés par l'énergie.
  - Templates restreints aux accords diatoniques de la tonalité + emprunts modaux courants (bVI, bVII, V/V).
  - Suppression du template `maj7` : seuls majeur, mineur, 7 et m7 sont détectés à cette étape.
  - Lissage temporel par vote majoritaire et fusion des segments très courts.
  - Format de sortie enrichi : `{ duration, tempo, timeSignature, key, keyConfidence, confidence, chords: [ChordEvent] }`.

- `electron/main.js`
  - Handler IPC `analyzer:process-file` propagates désormais tous les champs globaux (tempo, signature, tonalité, confiances).

- `src/analyzer/audio-analyzer.js`
  - `TemplateAudioAnalyzer` normalise les nouveaux champs globaux.
  - Les champs réservés aux futures évolutions (`analysis`, `techniques`, `suggestions`, `reharmonizations`, `voiceLeading`) restent vides.

- `src/ui/analyzer-tab.js`
  - Affichage d'un résumé global : tonalité, tempo, signature, confiance.
  - Timeline horizontale avec blocs d'accords proportionnels à leur durée.
  - Tête de lecture et auto-scroll synchronisés avec la lecture audio.
  - Clic sur un accord → saut à cet instant.
  - Lecteur audio conservé : play/pause natifs + bouton Stop + sélecteur de vitesse.

- `src/index.html`
  - Ajout de la carte de résumé global et de la structure de timeline horizontale.

- `src/style.css`
  - Styles pour le résumé, la timeline horizontale, les blocs d'accords, la tête de lecture et les contrôles du lecteur.

**Fonctionnalités volontairement absentes de cette étape :**
- Accords enrichis, voicings, accords de passage, substitutions, tensions, réharmonisations.
- IA, scores, voice leading, techniques détectées, commentaires pédagogiques.

**Vérifications :**
- `npm run build` OK.
- `node src/analyzer/test-regression-part1.js` OK.
- `node src/chord-engine/test-regression-part3.js` OK.
- Test Python sur fichier synthétique : tonalité, tempo, signature et accords principaux retournés.

## 2026-07-08 — Claude (Refonte du module Analyse – Étape 1 : réduction de périmètre)

**Objectif** : transformer l'onglet Analyse en un outil simple et fiable : import fichier → analyse automatique → grille d'accords synchronisée avec la lecture.

**Fonctionnalités supprimées de l'onglet Analyse pour cette étape :**
- Sessions MIDI (enregistrement, liste, transport)
- Réharmonisation, suggestions IA, Masterclass
- Scores, voice leading, analyses pédagogiques
- Onglets internes Accords / Analyse / Masterclass

- `electron/audio-processor.py`
  - Nouvelle commande `analyze-chords` : calcule un chromagramme avec `librosa`, applique un template matching sur les accords de base (majeur, mineur, 7, maj7, m7), segmente dans le temps et retourne une grille `{ duration, chords: [{ startTime, endTime, chord, confidence }] }`.
  - C'est un moteur volontairement simple, conçu pour être remplacé par un modèle plus avancé plus tard.

- `electron/main.js`
  - Nouvel handler IPC `analyzer:process-file` : extrait la piste audio du fichier importé, lance `analyze-chords`, retourne `{ wavPath, duration, chords }`.

- `electron/preload.cjs`
  - Exposition de `window.electronAPI.analyzer.processFile(filePath)`.

- `src/analyzer/audio-analyzer.js` (création)
  - Abstraction `AudioAnalyzer` avec implémentation `TemplateAudioAnalyzer`.
  - Normalise les résultats dans le format extensible demandé (`analysis`, `suggestions`, `reharmonizations`, `voiceLeading`, `techniques` vides pour l'instant).

- `src/audio/media-engine.js` (création)
  - Service audio partagé minimal : `selectMediaFile()`, `isSupportedMediaFile()`, `createAudioPlayer(container, blobUrl, callbacks)`.
  - Prévu pour évoluer vers un moteur commun avec le Studio.

- `src/ui/analyzer-tab.js` (refonte complète)
  - Écran d'accueil : "Importer un fichier" avec formats acceptés (MP3, WAV, MP4, M4A).
  - Workflow automatique : import → extraction → analyse → affichage.
  - Affichage d'une grille verticale d'accords avec temps, nom et confiance.
  - Lecteur audio synchronisé : accord courant mis en évidence, clic sur un accord = saut à ce moment.
  - Lecture du WAV via blob URL (le lecteur HTML5 ne peut pas lire directement les chemins /tmp).

- `src/index.html`
  - Suppression de la structure complexe de l'ancien onglet Analyse (sidebar sessions, transport MIDI, sous-onglets).
  - Nouvelle structure minimale : écran d'import + résultats (lecteur + timeline).

- `src/style.css`
  - Styles pour l'onglet Analyse simplifié : carte d'import, grille d'accords, lecteur, état actif.

- `src/main.js`
  - Remplacement de `initRecordingTab` par `initAnalyzerTab`.
  - Suppression des appels à `feedRecorderNoteOn/Off/Sustain/PitchWheel/ModWheel` et `setRecordingNotation`.
  - Adaptation de `switchToTab` pour afficher l'onglet Analyse en `flex`.

- Vérifications
  - `npm run build` OK.
  - `node src/analyzer/test-regression-part1.js` OK.
  - `node src/chord-engine/test-regression-part3.js` OK.
  - Test réel d'analyse audio : à valider manuellement.

## 2026-07-07 — Claude (Correctifs Studio : permission capture + CSP + son d'enregistrement)

- `src/audio/simple-synth.js`
  - Remplacement de la `MediaStreamDestination` unique par un **bus de sortie permanent** (`synthOutput`, un `GainNode`). Toutes les notes jouées passent par ce bus.
  - `getMediaStream()` crée désormais une `MediaStreamDestination` temporaire branchée sur `synthOutput` au moment de l'appel : toutes les notes jouées pendant l'enregistrement sont capturées, y compris celles qui démarrent après le début de l'enregistrement.
  - Ajout de `connectOutput(destination)` pour brancher le bus du synthé sur une destination externe (utilisé par le Studio).

- `src/ui/studio-tab.js`
  - `ensureStudioAudioContext()` partage désormais le même `AudioContext` que le synthétiseur (`getAudioContext()`) au lieu d'en créer un second.
  - `startCapture()` attend explicitement le resume du contexte audio partagé avant de créer les `MediaStreamDestination`.
  - Toutes les sources audio sont maintenant mixées dans une **seule** `MediaStreamDestination` d'enregistrement :
    - sortie du lecteur principal (`studioDestination`) ;
    - sortie du mixer de stems (`mixer.getDestination()`) ;
    - sortie du synthétiseur global (`connectSynthOutput`).
    Cela évite les problèmes de synchronisation entre plusieurs pistes audio dans `MediaRecorder`.

- `electron/main.js`
  - `studio:get-screen-source-id` utilise désormais `mainWindow.getMediaSourceId()` pour obtenir l'ID fiable de la fenêtre de l'application.
  - Suppression de la recherche par titre dans `desktopCapturer.getSources()`, cause de l'erreur "Source d'écran introuvable".
  - Ajout d'un `setPermissionRequestHandler` sur la session de la fenêtre principale : autorise automatiquement les requêtes `media`, `display-capture` et `clipboard-sanitized-write` provenant de la fenêtre de l'application elle-même. Corrige le `NotAllowedError: Permission denied` au lancement de `navigator.mediaDevices.getUserMedia({ chromeMediaSource: 'desktop' })`.

- `src/index.html`
  - CSP (Content-Security-Policy) générée dynamiquement : `unsafe-eval` autorisé seulement en développement pour Vite HMR, supprimé en production. L'avertissement Electron Security Warning (Insecure Content-Security-Policy) ne doit plus apparaître une fois l'application packagée.

- `src/audio/simple-synth.js`
  - Ajout d'une `MediaStreamDestination` partagée (`synthDestination`) connectée à la sortie du synthétiseur.
  - Export de `getMediaStream()` pour récupérer le flux audio du synthé.

- `src/ui/studio-tab.js`
  - Import de `getMediaStream` depuis `simple-synth.js`.
  - Le `MediaRecorder` du Studio mixe désormais :
    - la vidéo de la fenêtre (desktopCapturer),
    - l'audio du graphe Studio (`studioAudioCtx`),
    - l'audio du synthétiseur global (clavier MIDI / virtuel de l'onglet Entraînement).

- Vérifications
  - `npm run build` OK.
  - `node src/analyzer/test-regression-part1.js` OK.
  - `node src/chord-engine/test-regression-part3.js` OK.
  - Test réel d'enregistrement avec son MIDI : à valider manuellement (pas de serveur graphier dans l'environnement de cette session).

## Convention de commentaires dans le code

Pour les modifications non triviales, ajouter un commentaire court au-dessus du bloc concerné :

```js
// [OpenCode | Claude] — YYYY-MM-DD — brève description de la modif
```

Exemple :

```js
// [OpenCode] — 2026-07-03 — Réparation du parsing des notes en notation latine
function latinNoteNameToPc(name) {
  ...
}
```

## Historique

### 2026-07-07 — Claude (Refonte UX de l'onglet Analyse avec sous-onglets)

- `src/index.html`
  - Restructuration de la zone d'analyse pour accueillir une barre de sous-onglets.

- `src/ui/analyzer-tab.js`
  - Ajout de 3 sous-onglets dans l'onglet Analyse : **Accords**, **Analyse**, **Masterclass**.
  - Sous-onglet **Accords** : grille/timeline des accords + détail de l'accord sélectionné + suggestions par style + arrangement harmonique + grille de référence.
  - Sous-onglet **Analyse** : scores de session, patterns harmoniques et réharmonisation complète, regroupés dans des panneaux repliables.
  - Sous-onglet **Masterclass** : analyse IA de la session entière, avec indicateur visuel si aucune clé API n'est configurée.
  - Badges sur les sous-onglets (nombre d'accords, nombre de patterns, indicateur clé API manquante).
  - Refactor : l'arrangement harmonique et la grille de référence sont désormais intégrés au HTML statique du sous-onglet Accords plutôt qu'ajoutés dynamiquement.

- `src/style.css`
  - Styles de la barre de sous-onglets (`analysis-subtabs`), des badges, du conteneur de sous-vue.
  - Amélioration des tuiles d'accords (meilleur contraste, hover, état actif, degré et voicing).
  - Amélioration du détail d'accord (sections encadrées, voice leading coloré).

- Vérifications
  - `npm run build` OK.
  - `node src/analyzer/test-regression-part1.js` OK.
  - `node src/chord-engine/test-regression-part3.js` OK.

---

### 2026-07-07 — Claude (Corrections bugs Studio : synchro audio/visuel + spinner de chargement)

- `src/ui/studio-tab.js`
  - Correction de la désynchronisation audio/visuelle en prévisualisation de région :
    - Ajout de `getVisualCursorTime()` : la position de départ de la lecture est désormais lue depuis le curseur visuel (slider/waveform) plutôt que depuis le lecteur audio.
    - Synchronisation explicite de tous les lecteurs (`html5Audio`, `masterPlayer`, `playerAudio`, `playerVideo`) sur la position visuelle AVANT le `play()`, même si la région n'est pas encore confirmée.
    - Ajout d'un guard `isPlaying` au début de `play()` pour éviter les redémarrages parasites.
    - Ajout de `seekHtml5Audio(audio, time)` : attend l'événement `seeked` (ou un timeout de sécurité) avant de lancer `html5Audio.play()`, car le seek sur un élément HTML5 audio est asynchrone.
    - Pour les fichiers M4A/AAC, le lecteur audio réel (`html5Audio`) utilise désormais le WAV extrait (blob local) quand il est disponible, au lieu du M4A original, garantissant un seek instantané et une synchronisation parfaite avec `playerAudio`.
  - Correction de la fermeture prématurée de l'écran de chargement :
    - Suppression du `finally { setLoadingState(false); }` dans `loadTrack()`.
    - Ajout de `finishTrackLoading(name)` : le spinner ne se ferme que lorsque le message `Morceau chargé : [titre]` est émis.
    - Ajout de `failTrackLoading(message)` pour fermer le spinner en cas d'erreur ou de fichier introuvable.

- Vérifications
  - `npm run build` OK.
  - `node src/analyzer/test-regression-part1.js` OK.
  - `node src/chord-engine/test-regression-part3.js` OK.

---

### 2026-07-07 — Claude (Pipeline Analyse enrichi + Exercices rapides Entraînement)

- `src/analyzer/harmonic-utils.js` (création)
  - Utilitaires harmoniques partagés : classification dominante/mineur/majeur, degrés dans la tonalité, formatage compact des accords.

- `src/analyzer/harmonic-patterns.js` (création)
  - Détection de patterns harmoniques : II-V-I, cadences (parfaite, plagale, demi, rompue), turnarounds, substitutions (tritonique, backdoor).
  - Enrichissement des accords avec leur degré dans la tonalité détectée.
  - Refactor pour utiliser `src/analyzer/harmonic-utils.js` et éviter la duplication avec `src/analyzer/substitutions.js`.

- `src/analyzer/substitutions.js`
  - Refactor pour utiliser les helpers de `src/analyzer/harmonic-utils.js`.

- `src/analyzer/analyzer.js`
  - Intégration des scores de session (`scoreSession`) : Voice Leading, Transitions, Tensions, Inner Voices.
  - Intégration du voice leading entre accords consécutifs (`buildVoiceLeading`).
  - Intégration des patterns harmoniques dans le résultat d'analyse.
  - Persistance inchangée via `analysis/analysis.json`.

- `src/analyzer/reharmonizer.js`
  - `suggestProgression(chords, style)` : génère une réharmonisation complète de la session selon Worship, Gospel, Jazz ou Neo Soul.
  - `renderProgressionToEvents` et `playProgression` pour écouter la progression stylisée.

- `src/ui/analyzer-tab.js`
  - Affichage des scores de session en haut de l'analyse.
  - Affichage des patterns harmoniques détectés avec badges et descriptions.
  - Affichage du degré de chaque accord sur sa tuile.
  - Détail d'accord enrichi : degré, voice leading avec l'accord précédent/suivant, voicings alternatifs (close, drop 2, spread), substitutions détectées.
  - Panneau "Réharmonisation de session" : génère et écoute une version stylisée de toute la progression.
  - Correction du rendu du détail d'accord pour éviter les sauts de layout.
  - Affichage progressif : scores de session, patterns harmoniques et réharmonisation de session sont désormais regroupés dans des panneaux repliés par défaut.

- `src/practice-exercise.js` (création)
  - Moteur d'exercices rapides pour l'onglet Entraînement.
  - Mode "Accord cible" : l'utilisateur doit jouer l'accord affiché.
  - Mode "Progression" : l'utilisateur doit jouer une progression générée (II-V-I, I-V-vi-IV, etc.) étape par étape.
  - Feedback visuel immédiat et score interne.

- `src/main.js`
  - Initialisation du panneau d'exercice rapide (`initPracticeExercise`).
  - Vérification automatique de l'exercice à chaque accord détecté (`checkPracticeExercise`).

- `src/index.html`
  - Ajout du panneau "Exercice rapide" dans la colonne de gauche de l'onglet Entraînement.

- `src/style.css`
  - Styles pour les scores de session, les patterns harmoniques, les degrés d'accord.
  - Styles pour les voicings alternatifs et les substitutions dans le détail d'accord.
  - Styles pour le panneau de réharmonisation de session.
  - Styles pour le panneau d'exercice rapide et le feedback visuel.
  - Styles pour les panneaux repliables de l'onglet Analyse (affichage progressif).

- Vérifications
  - `npm run build` OK.
  - `node src/analyzer/test-regression-part1.js` OK.
  - `node src/chord-engine/test-regression-part3.js` OK.

---

### 2026-07-05 — OpenCode (Passe corrective Partie 1 — bugs moteur du module Analyse)

- `src/recorder/player.js`
  - Machine à états explicite (`stopped | playing | paused`) avec conservation de la position courante à la pause.
  - Correction du seek : coupure de toutes les notes actives avant le repositionnement.

- `src/ui/recording-tab.js`
  - Transport : mise à jour visuelle pendant le drag du slider, déclenchement audio réel au relâchement (`change`).
  - Liste des sessions : ellipsis sur les noms longs et tooltip natif `title`.

- `src/analyzer/chord-timeline.js`
  - Pattern **collect-puis-analyse** : fenêtre de collecte de 180 ms, calcul du nom d'accord et de la top note une fois le groupe stabilisé.
  - Détection du mode mélodique : ratio de groupes simultanés < 15 %.

- `src/analyzer/key-detector.js`
  - Ajout de `computeKeyFromRawNotes()` indépendante de la segmentation en accords, basée sur un histogramme pondéré Krumhansl-Schmuckler.

- `src/analyzer/test-regression-part1.js` (création)
  - Tests de non-régression : Fmaj9 à 6 notes, mélodie isolée C-D-E-F-G → Do majeur, progression II-V-I non mélodique.

- Vérifications
  - `node src/analyzer/test-regression-part1.js` OK.

---

### 2026-07-06 — OpenCode (Passe corrective Partie 2-3 — architecture Analyse et classifieur unique)

- `src/recorder/session-manager.js`
  - Ajout du champ `sourceType` au schéma de session (`midi`, `tutorial`, `cover`), défaut sûr `midi` pour les sessions existantes.

- `src/analyzer/analyzer.js`
  - Routage de l'analyse selon `sourceType` : mélodique vs accords, persistance via `analysis/analysis.json`.

- `src/ui/analyzer-tab.js`
  - Vue unique selon `sourceType` : `Jeu enregistré` / `Tutoriel` / `Cover / Performance`.
  - Affichage progressif : liste d'abord, détail d'accord au clic, suggestions au clic.
  - Masterclass IA par accord sélectionné, avec fallback algorithmique.

- `src/ui/studio-tab.js`
  - Choix manuel du type de source à l'import (`Tutoriel pédagogique` / `Morceau à étudier`).

- `src/chord-engine/index.js`
  - Exposition de `classifyVoicing(midiNotes)` : fonction pure, même entrée → même sortie, réutilisable pour le jeu live et les suggestions.

- `src/ai/ai-client.js`
  - Post-traitement systématique des suggestions IA via `classifyVoicing`.
  - Cache + retry sur les appels Masterclass IA, fallback sur la bibliothèque locale de mouvements.
  - Anonymisation des noms d'artistes : remplacement par des catégories stylistiques (`Walk-up Gospel`, `Montée diatonique Worship`, `Turnaround Gospel`, `Couleur Gospel moderne`, `Substitution Jazz`, `II-V-I Jazz mineur`).

- `src/data/movements-library.json`
  - Remplacement des noms de musiciens par des catégories stylistiques.

- `src/chord-engine/test-regression-part3.js` (création)
  - Tests de non-régression : cluster détecté comme cluster, triade sur basse différente classifiée, pureté du classifieur.

- Vérifications
  - `npm run build` OK.
  - `node src/analyzer/test-regression-part1.js` OK.
  - `node src/chord-engine/test-regression-part3.js` OK.

---

### 2026-07-06 — OpenCode (Validation et consolidation du workflow Studio)

- `src/ui/studio-tab.js` / `src/audio/stem-mixer.js` / `src/audio/pitch-shifter.js`
  - Réarchitecture audio validée : lecteur vidéo visible muet + audio caché, AudioContext partagé, fallback HTML5 natif pour les fichiers M4A/AAC.
  - Workflow région assouplie : la région couvre le fichier entier par défaut (jusqu'à 5 min max) ; lecture et transposition disponibles immédiatement ; séparation/export exigent une région confirmée.
  - Limitation automatique de la région : `MAX_REGION_DURATION = 300` s (5 minutes) avec retour visuel quand la limite est atteinte.
  - Principe anti-dégradation : la transposition s'applique toujours depuis le buffer original via `setDetune` / `setPitch` avec un ratio absolu, jamais par cumul de transpositions successives.
  - Noms de fichiers affichés dans la liste Studio (`metadata.name`) au lieu des identifiants techniques.

- Vérifications
  - `npm run build` OK.

---

### 2026-07-03 — OpenCode

- `src/index.html`
  - Interface retravaillée (header avec icône, panneaux aérés).
  - Diagnostic MIDI masqué par défaut.
  - Ajout du preset "Virtuel MIDI (C0–C9)".

- `src/style.css`
  - Refonte visuelle (thèmes clair/sombre, panneaux, ombres, arrondis).
  - Fond sombre du panneau clavier pour un rendu piano pro.

- `src/main.js`
  - Clavier par défaut sur C0–C9.
  - Historique : ne garde que les accords identifiés (≥3 notes, pas de `?`).
  - Correction du bouton Effacer de l'historique.

- `src/chord-engine/intervals.js`
  - Ajout du support de la notation latine (Do/Ré/Mi + dièses/bémols + octaves).

- `src/ui/keyboard-svg.js`
  - Couleurs notes/fondamentale appliquées dynamiquement.
  - Redessin du clavier style piano pro (dégradés, ombres, espacement).

- `~/.opencode/memory.md` / `~/MEMOIRE.md`
  - Création et mise à jour de la mémoire partagée.

---

### 2026-07-03 — Claude

- `src/ui/keyboard-svg.js`
  - Refonte complète du rendu clavier pour reproduire les proportions et le style de [chord-display](https://github.com/rednetio/chord-display).
  - Proportions fixes : touches blanches 40×150, touches noires 22×90.
  - Gradients `whiteKey` / `blackKey` et filtre d’enfoncement `insetKey` copiés à l’identique.
  - Positionnement réaliste des touches noires aux jointures des touches blanches.
  - [Claude] — 2026-07-03 — Correction du clavier virtuel : ajout de l'attribut `data-midi` sur chaque touche pour que les événements souris/tactiles fonctionnent.

- `src/style.css`
  - Fond du panneau clavier passé en clair (var(--panel-bg)).
  - Clavier virtuel calé en bas du panneau ; les contrôles sont positionnés au-dessus.
  - Suppression des anciens styles 3D ; styles de touches repris de chord-display.
  - [Claude] — 2026-07-03 — Panneau Techniques déplacé au centre, agrandi et avec une typographie plus lisible pour une lecture sans interaction.
  - [Claude] — 2026-07-03 — Rééquilibrage des hauteurs : clavier moins haut (30vh max), zone centrale plus grande, suppression des scrollbars parasites sur le panneau Techniques.

- `src/index.html`
  - Couleur active par défaut passée à `#bf3a2b` (rouge chord-display).
  - [Claude] — 2026-07-03 — Panneau Techniques déplacé de la right-panel vers la zone centrale (`center-stage`).

- `src/main.js`
  - Valeur par défaut de `state.colorNote` synchronisée sur `#bf3a2b`.
  - [Claude] — 2026-07-03 — Transposition fonctionnelle : les notes MIDI/virtuelles sont transposées pour l'affichage, la détection d'accords et le son. Retransposition dynamique des notes actives quand le réglage change.
  - [Claude] — 2026-07-03 — Gestion des grace notes : une note relâchée avant la fin de la fenêtre de tolérance est retirée du groupe (sauf si sustain). Ajout d'un réglage UI "Tolérance (ms)" pour le groupement temporel.
  - [Claude] — 2026-07-03 — Gestion de `midi-port-lost` : affichage "Périphérique perdu".
  - [Claude] — 2026-07-03 — Auto-sélection du périphérique préféré quand le port actuel disparaît ou quand la liste était vide.
  - [Claude] — 2026-07-03 — Utilisation du résultat de `openInput` pour confirmer le succès de l'ouverture.
  - [Claude] — 2026-07-03 — Intégration de l'onglet Analyse via `initAnalyzerTab` et `notifyNewSession`. Sauvegarde d'une session entraînement bascule automatiquement vers l'onglet Analyse.
  - [Claude] — 2026-07-03 — Synchronisation de la notation latine/anglaise avec l'onglet Analyse.

- `src/note-grouper.js`
  - [Claude] — 2026-07-03 — Refonte pour retirer les notes relâchées du groupe pending, avec prise en compte du sustain. Ajout de `getTolerance()`.

- `src/index.html`
  - [Claude] — 2026-07-03 — Ajout de l'input "Tolérance (ms)" dans les contrôles du clavier.

- `REPARTITION.md`
  - [Claude] — 2026-07-03 — Document de répartition des tâches Module 1 entre OpenCode et Claude.

- `src/ui/analyzer-tab.js`
  - [Claude] — 2026-07-03 — Logique de l'onglet Analyse : liste des sessions, timeline, détail d'accord, alternatives, import de session.

- `src/analyzer/voice-leading.js`
  - [Claude] — 2026-07-03 — Calcul du voice leading, score de fluidité, score de tension, score de richesse, et fonction `analyzeSequence`.

- `src/analyzer/substitutions.js`
  - [Claude] — 2026-07-03 — Détection basique des substitutions (tritonique, dominante secondaire, accord de passage).

- `src/analyzer/alternatives.js`
  - [Claude] — 2026-07-03 — Génération de voicings alternatifs (close, drop 2, spread) pour un accord détecté.

- `src/audio/simple-player.js`
  - [Claude] — 2026-07-03 — Lecteur MIDI simple pour écouter les alternatives dans l'onglet Analyse.

- `src/index.html` / `src/style.css`
  - [Claude] — 2026-07-03 — Barre d'onglets Entraînement/Analyse et styles dédiés à l'onglet Analyse.

---

### 2026-07-03 — OpenCode (Module 1)

- `src/chord-engine/chord-defs.js`
  - Ajout de `ROOTLESS_DEFINITIONS` pour les voicings jazz sans fondamentale (maj7, 7, m7, maj9, 9, m9, m7b5).

- `src/chord-engine/index.js`
  - Implémentation de la détection des **rootless voicings**.
  - Un accord rootless est proposé quand les notes jouées correspondent exactement aux notes d'un accord 7th/9th sans sa fondamentale, et que le meilleur match standard est une triade en position fondamentale.
  - Ajout du flag `rootless` dans les résultats.

- `src/ui/display.js`
  - Affichage sans slash pour les accords rootless (ex. `Cmaj7` plutôt que `Cmaj7/E`).

- `src/main.js`
  - Affichage de l'historique sans slash pour les accords rootless.

- `src/chord-engine/test-chords.js`
  - Ajout de 3 tests rootless (Cmaj7, C7, Cm7).
  - Ajout de 2 tests quartal (C quartal, C quartal add4).
  - Ajout d'un test upper structure (C13#11 + D major).
  - Ajout d'un test polychord (D/C).
  - Ajout d'un test cluster (C-D#-E).

- `src/chord-engine/chord-defs.js`
  - Ajout des définitions quartal (`quartal`, `quartal(add4)`).
  - Ajout de `ROOTLESS_DEFINITIONS` pour les voicings jazz sans fondamentale.

- `src/chord-engine/index.js`
  - Implémentation de la détection des **rootless voicings**.
  - Implémentation de la détection des **quartal voicings**.
  - Implémentation de la détection des **upper structures** (triade dans les notes supérieures).
  - Implémentation de la détection des **polychords** (superposition de deux triades disjointes).
  - Implémentation de la détection des **clusters** (groupes dissonants en secondes rapprochées).
  - [Claude] — 2026-07-03 — Correction du rootless agressif : une triade simple en position fondamentale (C-E-G, F-A-C…) n'est plus écrasée par un accord 7ème rootless. Les rootless sont désormais réservés aux voicings de plus de 3 notes, en attendant un scoring plus fin d'OpenCode.

- `src/ui/display.js` / `src/main.js`
  - Affichage sans slash pour les accords rootless.

- `src/chord-engine/test-chords.js`
  - [Claude] — 2026-07-03 — Tests rootless 3 notes désactivés temporairement ; ajout de tests C majeur et F majeur pour sécuriser la correction.

- `electron/main.js`
  - [Claude] — 2026-07-03 — Suivi du port MIDI actuellement ouvert (`currentInputId`).
  - [Claude] — 2026-07-03 — Fermeture propre du port natif quand le périphérique disparaît (hot-unplug).
  - [Claude] — 2026-07-03 — Émission de l'événement `midi-port-lost` vers le renderer.
  - [Claude] — 2026-07-03 — Retour de l'id du port réellement ouvert par `midi:open-input`.

- `electron/preload.cjs` / `electron/preload.js`
  - [Claude] — 2026-07-03 — Exposition du canal `onPortLost`.

- `src/main.js`
  - [Claude] — 2026-07-03 — Gestion de `midi-port-lost` : affichage "Périphérique perdu".
  - [Claude] — 2026-07-03 — Auto-sélection du périphérique préféré quand le port actuel disparaît ou quand la liste était vide.
  - [Claude] — 2026-07-03 — Utilisation du résultat de `openInput` pour confirmer le succès de l'ouverture.

### 2026-07-03 — OpenCode (intervention sur fichiers Claude — bug MIDI urgent)

- `electron/main.js`
  - Fermeture de l'énumérateur MIDI quand un port est ouvert pour éviter les conflits ALSA.
  - Fermeture de l'input actif avant le refresh des ports.
  - Arrêt du polling quand un port MIDI est ouvert.
  - Ajout de logs de debug temporaires dans le handler de message MIDI.

- `src/main.js`
  - Ajout de logs de debug temporaires sur les événements `note-on`/`note-off` du renderer.
  - Suppression d'un handler `onNoteOff` en double.

### 2026-07-04 — OpenCode (correction détection MIDI)

- `electron/main.js`
  - Mode dev : charge `http://localhost:5173/` quand `dist/index.html` n'existe pas encore, évitant l'erreur `ERR_FILE_NOT_FOUND`.
  - Correction du chemin d'icône vers `assets/icon.svg`.
  - Ajout d'une heuristique `isLikelyHardware` pour ignorer les ports virtuels ALSA (`Midi Through`, `FluidSynth`, `PipeWire`…) lors de l'auto-connexion.
  - Tracking du port ouvert par `name` en plus de `id` pour reconnecter automatiquement après un hot-plug.
  - `openMidiInput` retourne désormais `{ success, portId, name }`.
  - Polling MIDI : scanne même quand un port est ouvert pour détecter le débranchement, puis tente une reconnexion automatique.
  - `midi:refresh-inputs` tente une auto-connexion matérielle après le scan.
  - Émission de `midi-device-connected` vers le renderer.

- `electron/preload.cjs` / `electron/preload.js`
  - Exposition du canal `onDeviceConnected`.

- `src/main.js`
  - Refonte de `initMidi` : logique unique pour le bridge natif et le fallback Web MIDI.
  - `findPreferredInput` privilégie les périphériques matériels réels et ignore les ports virtuels.
  - `tryOpenMidi` centralise l'ouverture, l'affichage du statut et le nom du périphérique.
  - Gestion du hot-plug et de la reconnexion automatique simplifiée.

- `package.json`
  - Script `dev` modifié pour lancer Vite en mode serveur et Electron en parallèle, sans effacer `dist/`.

### 2026-07-04 — OpenCode (refonte de l'onglet Analyse)

- `src/ui/mini-keyboard.js` (création)
  - Générateur de mini-clavier SVG pédagogique.
  - Affiche une fenêtre de 3 octaves (C3–B5) avec les notes actives en rouge.
  - Touches blanches/noires simples, noms des notes actives visibles.

- `src/analyzer/reharmonizer.js`
  - Refonte : suggestions générées accord par accord (pas de progression entière).
  - Chaque suggestion est un objet `{ name, notes: number[], style }` avec un tableau MIDI jouable.
  - 4 styles : Worship, Gospel, Jazz, Neo Soul.
  - Ajout de `renderSuggestionToEvents` et `playSuggestion` pour la lecture.

- `src/ui/analyzer-tab.js`
  - Refonte complète : timeline d'accords originaux par section sous forme de grille cliquable.
  - Panneau de droite affichant l'accord original + 4 suggestions par style.
  - Mini-claviers SVG pour l'original et chaque suggestion.
  - Bouton "▶ Écouter" à côté de chaque suggestion.
  - Suppression totale des scores (voice leading, transitions, tensions, voix internes).

- `src/analyzer/analyzer.js`
  - Suppression des appels au scorer et des suggestions globales.
  - Résultat d'analyse : `chords` + `sections` enrichies uniquement.

- `src/ui/recording-tab.js`
  - Intégration du nouvel `analyzer-tab.js` via `initAnalyzerTab`.
  - Suppression de toute la logique de lecteur à droite (`player-controls`, `playerPlayBtn`, etc.).
  - Simplification du chargement de session : plus de lecture automatique liée au player UI.
  - Écoute des suggestions via `noteOn/noteOff` envoyés à `onMidiEvent`.

- `src/index.html`
  - Suppression de la sidebar droite "Lecteur" (`player-controls`).
  - L'onglet Enregistrement passe en layout deux colonnes (sidebar gauche + centre).

- `src/style.css`
  - Suppression des styles `.analysis-scores` / `.score-card` (scores retirés).
  - Ajout des styles pour `.analysis-layout`, `.analysis-timeline`, `.analysis-detail`.
  - Grille d'accords `.chord-grid` + tuiles `.chord-tile`.
  - Cartes de suggestions `.suggestion-card` + mini-clavier `.mini-keyboard`.
  - Adaptation responsive `.recording-tab` pour 2 colonnes seulement.

### 2026-07-04 — OpenCode (Module 4 Studio)

- `src/index.html`
  - Renommage de l'onglet « Enregistrement » en « Analyse ».
  - Ajout du troisième onglet « Studio ».
  - Suppression du panneau Lecteur multi-pistes et de la zone Progression dans l'onglet Entraînement.
  - Création du layout Studio : import à gauche, lecteur vidéo au centre, pistes séparées à droite.

- `src/main.js`
  - Centralisation de la navigation par onglets (`initTabNavigation`).
  - Événement `app-switch-tab` permettant aux modules Analyse et Studio de demander un changement d'onglet.
  - Initialisation de l'onglet Studio via `initStudioTab`.

- `src/ui/studio-tab.js` (création)
  - Import de fichiers audio/vidéo (MP3, MP4, WAV, FLAC, OGG).
  - Liste des morceaux importés.
  - Lecteur `<video>` avec contrôles Play/Pause/Stop, progression et volume.
  - Affichage des pistes séparées (Basse, Batterie, Voix, Autres, Piano) avec Mute/Solo/Volume.
  - Bouton « Séparer les pistes ».

- `src/audio/stem-separator.js` (création)
  - Bridge vers le processus principal pour lancer Demucs.
  - Fallback automatique sur des pistes simulées si Demucs n'est pas installé.

- `src/audio/stem-mixer.js` (création)
  - Mixage des pistes via Web Audio API.
  - Gestion du Mute/Solo/Volume par piste et du volume principal.

- `src/recorder/studio-storage.js` (création)
  - Stockage des morceaux et métadonnées dans `~/PianoJazzChords/Studio/`.
  - Lecture des fichiers originaux et des pistes sous forme de blob URLs.

- `electron/main.js`
  - Ajout de `setupStudioIPC` : dialogue d'import, exécution de Demucs, fallback simulé, état de séparation.
  - Création de fichiers WAV factices pour les tests sans Demucs.

- `electron/preload.cjs` / `electron/preload.js`
  - Exposition de l'API `window.electronAPI.studio`.

- `src/ui/recording-tab.js`
  - Suppression de la gestion locale des onglets au profit de la navigation centralisée.
  - `switchToRecordingTab` émet un événement `app-switch-tab`.

- `src/style.css`
  - Styles du layout Studio, du lecteur, des pistes et des contrôles Mute/Solo/Volume.

### 2026-07-04 — OpenCode (corrections Studio)

- `src/audio/stem-mixer.js`
  - Correction du buzz au lancement : gains initiaux à 0, rampe progressive au Play.
  - Synchronisation des sources audio avant le démarrage.
  - Volumes convertis en dB (-60 dB à +6 dB) avec `dbToGain` / `gainToDb`.
  - Exposition de l'état du mixer pour conserver les réglages au re-rendu.

- `src/ui/studio-tab.js`
  - Lecture originale par défaut ; le mixer prend le relais uniquement quand des stems existent.
  - Curseurs de piste et volume principal en dB avec affichage `-∞ dB` … `+6 dB`.
  - Chargement des stems via des blob URLs (lecture sécurisée sous Electron).
  - Affichage de la progression de la séparation en pourcentage.

- `src/audio/stem-separator.js`
  - `separateStems` accepte un callback de progression via `studio:onSeparationProgress`.

- `electron/main.js`
  - Nettoyage des anciens stems avant de copier ceux de Demucs.
  - Envoi des pourcentages de progression au renderer en parsant stdout Demucs.
  - Utilisation du venv local `.venv` pour Demucs.

- `electron/preload.cjs` / `electron/preload.js`
  - Ajout du canal `onSeparationProgress`.

- `src/recorder/studio-storage.js`
  - Ajout de `readAllStemsAsBlobUrls` pour convertir les stems en URLs accessibles au renderer.

- `src/index.html`
  - Curseur de volume principal en dB.

- `src/style.css`
  - Styles pour les nouveaux contrôles de volume en dB.

---

### 2026-07-04 — Claude (Studio : transposition + fond musical audio-only)

- `src/index.html`
  - Fond musical stylisé affiché derrière le player quand le fichier importé est audio-only (MP3, WAV…).
  - Ajout d’un contrôle de transposition en demi-tons dans la barre de contrôles Studio.

- `src/style.css`
  - Styles pour le fond musical `.studio-audio-backdrop` (gradient, icône, titre, hint).
  - Styles pour le contrôle de transposition `.studio-transpose-label` et ses boutons +/−.

- `src/audio/stem-mixer.js`
  - Exposition de `getAudioContext`, `getDestination` et `getSources` pour permettre le pitch-shifting externe et l’accès aux sources audio.

- `src/ui/studio-tab.js`
  - Détection audio-only et récupération de la durée d’un média importé.
  - Mode pitch-seul via `AudioBufferSourceNode.detune` pour les fichiers audio courts (< 10 min).
  - Fallback `playbackRate` (pitch + vitesse liés) pour les vidéos et les fichiers longs.
  - Transposition appliquée aux pistes séparées (stems) via `playbackRate`.
  - Timekeeper visuel muet pour synchroniser la timeline en mode pitch-seul.

---

### 2026-07-04 — OpenCode (Studio : waveform + transposition pitch-seul)

- `electron/audio-processor.py` (création)
  - Script Python de traitement audio offline.
  - Extraction audio via `imageio-ffmpeg`.
  - Génération de waveform (400 peaks).
  - Pitch-shift pitch-seul d'une région avec `librosa` + `resampy` (phase vocoder).
  - Mixage des stems en master WAV.

- `electron/main.js`
  - Ajout des IPC `studio:extract-audio`, `studio:generate-waveform`, `studio:pitch-shift`, `studio:cleanup-shifted`.
  - Fonctions `runAudioProcessor`, `extractTrackAudio`, `generateWaveform`, `pitchShiftRegion`, `mixStemsToMaster`.

- `electron/preload.cjs` / `electron/preload.js`
  - Exposition des nouvelles APIs audio du Studio.

- `src/ui/studio-tab.js`
  - Réécriture complète de la gestion de la transposition.
  - Suppression de l'ancien mode pitch-shift Web Audio limité à 10 min.
  - Ajout de la waveform Canvas avec sélection de région (deux poignées).
  - Double-clic pour réinitialiser la région à tout le morceau.
  - Transposition offline déclenchée par le contrôle de transposition.
  - Lecture de l'audio transposé synchronisée avec la vidéo muette.
  - Suppression automatique des fichiers temporaires transposés.

- `src/index.html`
  - Ajout du conteneur waveform, de la région, des poignées, de la tête de lecture.
  - Ajout de l'indicateur de statut de transposition.

- `src/style.css`
  - Styles pour la waveform, la région sélectionnée, les poignées, la tête de lecture.
  - Style pour l'indicateur de statut de transposition.

- `docs/MODULE_04_STUDIO.md`
  - Mise à jour du cahier des charges avec la transposition, la waveform, les volumes dB.

---

### 2026-07-04 — OpenCode

- `electron/audio-processor.py`
  - Correction de la transposition pitch-seul pour qu'elle soit tempo-invariante.
  - Ajout de RubberBand (`rubberband -p <semitones> -F`) en algorithme principal, avec fallback `librosa.effects.pitch_shift`.
  - Suppression de l'ancien algorithme `time_stretch + resample` qui ralentissait le tempo.
  - Conservation de la durée exacte de la région traitée.

- `src/ui/studio-tab.js`
  - Lecture audio unique : le lecteur vidéo est toujours muet ; la sortie audio passe exclusivement par le mixer de stems ou par `shiftedAudio`.
  - Correction du problème de double lecture (originale + transposée) lors de la transposition.
  - Boucle automatique de la lecture à l'intérieur de la région sélectionnée.
  - Contrainte du seek et du démarrage à la région sélectionnée.
  - Reprise automatique de la lecture après un changement de transposition.

- Système
  - Installation de `librubberband-dev` et `rubberband-cli` pour le pitch-shift de qualité pro.

---

### 2026-07-04 — OpenCode (suite)

- `electron/audio-processor.py`
  - Ajout de la commande `pitch-shift-stems` pour transposer chaque piste Demucs individuellement.

- `electron/main.js`
  - Ajout de l'IPC `studio:pitch-shift-stems` qui transpose tous les stems et retourne leurs chemins.

- `electron/preload.js` / `electron/preload.cjs`
  - Exposition de `pitchShiftStems` au renderer.

- `src/ui/studio-tab.js`
  - Transposition globale affectant toutes les pistes : chaque stem est transposé individuellement puis rechargé dans le mixer.
  - Le mute / solo / volume en dB fonctionne toujours sur les stems transposés.
  - Correction du bug de clics rapides sur les boutons +/− : les contrôles sont désactivés pendant le traitement et les résultats obsolètes sont ignorés.

- `src/chord-engine/chord-defs.js`
  - Ajout des accords `m7b9`, `9sus4`, `13sus4`.
  - Réorganisation pour que les formes les plus spécifiques soient détectées en priorité.

- `src/chord-engine/index.js`
  - Suppression de la règle "Cluster" comme nom d'accord principal. Un accord en voicing cluster garde son nom harmonique (ex. `Em7b9`).
  - Ajout de la détection du type de voicing (cluster, close, open, spread, shell).

- `src/chord-engine/voicing.js` (nouveau)
  - Labels pédagogiques des voicings et alias musicaux utiles.

- `src/ui/display.js`
  - Affichage du type de voicing sous le nom de l'accord.
  - Affichage d'un alias quand il est musicallement pertinent.

- `src/main.js` / `src/index.html`
  - Ajout des éléments DOM `#voicing-label` et `#alias-label` dans le panneau Entraînement.

- `src/chord-engine/test-chords.js`
  - Ajout des tests pour `C9sus4`, `C13sus4` et `Em7b9` en voicing cluster.

- Système
  - Installation de `librubberband-dev` et `rubberband-cli`.
  - Tests : build OK, application démarre, tests d'accords 19/19.

---

### 2026-07-04 — OpenCode (revue chef de projet)

- `VISION.md`
  - Mise à jour de l'état du Module 3 Analyse IA : fonctionnel, segmentation + réharmonisation + écoute.

- `src/main.js`
  - Correction de la notation latine/anglaise : synchronisation renforcée de `state.notation`.
  - Ajout d'un paramètre `audible` sur `handleNoteOn`/`handleNoteOff` pour que la relecture de session produise du son.
  - Initialisation du toggle compact clavier.

- `src/audio/simple-synth.js`
  - Refonte du synthétiseur : synthèse additive piano-like avec 7 partiels, enveloppe ADSR et filtre passe-bas.

- `src/ui/studio-tab.js` / `src/style.css`
  - Le bouton `Séparer les pistes` devient `Réanalyser le fichier` (style outline discret) quand les stems existent.

- `src/ui/mini-keyboard.js` / `src/ui/analyzer-tab.js` / `src/style.css`
  - Ajout de tooltips avec les noms de notes sur le mini-clavier.
  - Affichage textuel des notes sous chaque mini-clavier.
  - Séparation du nom d'accord et du type de voicing dans l'onglet Analyse.

- `src/style.css` / `src/index.html`
  - Ajout du bouton `[^]` à côté du sélecteur de taille du clavier.
  - Mode compact automatique + toggle manuel pour réduire le clavier.

- `src/analyzer/segmenter.js`
  - Sur les sessions de moins de 60 secondes, les sections sont nommées `Section A`, `Section B`, etc. au lieu de `Intro` / `Outro`.

- `src/ui/recording-tab.js` / `src/ui/analyzer-tab.js`
  - Vérification du flux audio pour le bouton `Écouter` des suggestions de réharmonisation.
  - Correction de la relecture de session MIDI avec son.

---

### 2026-07-04 — Claude (Panneau de configuration API IA)

- `src/ai/openai-config.js` (création)
  - Stockage / lecture de la config IA dans le `localStorage`.
  - Presets Groq, OpenRouter, Google AI Studio avec URL et modèles par défaut.
  - Fonction `testAIConfig` pour valider une clé via un appel `/chat/completions`.
  - Client compatible OpenAI (`baseUrl` + `apiKey` + `model`).

- `src/index.html`
  - Bouton 🔑 "Paramètres IA" dans le header.
  - Modal de configuration avec preset, base URL, clé API et modèle.
  - Boutons "Tester" et "Enregistrer".

- `src/style.css`
  - Style du bouton paramètres IA.
  - Styles du modal IA : champs, preset, message de test (succès/erreur).

- `src/main.js`
  - Initialisation du panneau `initAISettings`.
  - Gestion des presets, test de clé, sauvegarde et fermeture du modal.

---

### 2026-07-04 — OpenCode (Phase 1 UI Analyse + architecture IA + Coach grille)

- `src/ui/analyzer-tab.js`
  - Timer 2s supprimé de `playSuggestion` : les notes ne s'effacent plus après 1 seconde.
  - Persistance des suggestions : les notes restent sur le clavier principal jusqu'au clic suivant.
  - Ajout du callback `onSuggestionPlay` pour la gestion visuelle/audio séparée.
  - Appel IA en arrière-plan (`generateReharmonization`) : si une clé API est configurée,
    les suggestions algorithmiques sont remplacées par les réponses du LLM.
  - Ajout du panneau « Grille de référence » avec parsing, comparaison et feedback.
  - Nettoyage des notes de suggestion au clic sur un accord ou au changement d'onglet.

- `src/main.js`
  - Ajout de `state.suggestionNotes` (Set) pour les notes de suggestion.
  - Ajout de `handleSuggestionPlay(action, notes, name)` pour l'affichage/audio.
  - `applyActiveNotes()` inclut désormais `state.suggestionNotes`.
  - Auto-clear des suggestions quand l'utilisateur joue une note MIDI réelle.
  - Nettoyage des suggestions au changement d'onglet (hors Analyse).

- `src/ui/recording-tab.js`
  - Passage du callback `onSuggestionPlay` à `initAnalyzerTab`.

- `src/ai/ai-client.js` (création)
  - Client API IA compatible OpenAI (Groq, OpenRouter, Google AI Studio).
  - Lecture de la clé depuis localStorage (via `openai-config.js`) ou `window.electronAPI.env.IA_API_KEY`.
  - `generateReharmonization(chord, style)` → retourne `null` si pas de clé (fallback).

- `src/ai/openai-config.js` (inchangé)
  - UI modale déjà existante pour saisir la clé API.

- `electron/preload.cjs` / `electron/preload.js`
  - Exposition des variables d'environnement `IA_*` via `window.electronAPI.env`.

- `.env.example` (création)
  - Template pour les variables d'environnement (IA_API_KEY, IA_BASE_URL, IA_MODEL).

- `src/analyzer/chord-comparator.js` (création)
  - `parseChordGrid(text)` → parsing de grille texte (accords séparés par espaces/lignes).
  - `compareGridToPlayed(referenceGrid, playedChords)` → comparaison + feedback.
  - Détection de substitutions (tritonique, tierce, quarte/quinte).

- `src/style.css`
  - Styles pour le panneau Grille de référence et les résultats de comparaison.

### 2026-07-04 — OpenCode

- **Bug notation critique** : tous les appels à `updateDisplay` et `generateKeyboard` passaient `state.notation` (string `'english'`) comme booléen `latin` → toujours latin. Corrigé avec `state.notation === 'latin'`.

- `src/ui/analyzer-tab.js`
  - Cache des suggestions IA (Map par rootPc-symbol + style), évite de rappeler l'API
  - Suppression des horodatages de section (Intro 0:00 – 0:21 supprimé)
  - Nettoyage variable `duration` inutilisée

- `src/ui/display.js`
  - Suppression de l'affichage "Confiance 100%"

- `src/main.js`
  - Historique supprimé du DOM et code nettoyé
  - Imports inutilisés nettoyés
  - Ajout du toggle Rhodes (bouton dans settings, import `setSynthMode`)

- `src/style.css`
  - Agrandissement du bloc Techniques (min-height 300px, max-height 480px)
  - Ajout `max-height` + `overflow-y` sur `#chord-grid-content` pour scroll interne
  - `.center-stage` passe de `overflow: hidden` à `overflow-y: auto`
  - `.session-form` remplacé par `.recording-init-modal`
  - Ajout `.recording-countdown`

- `src/note-grouper.js`
  - Tolérance par défaut 100→200ms
  - `noteOff` ne retire plus les notes du buffer (capture les arpèges)
  - Fenêtre glissante : toutes les notes jouées dans la fenêtre sont conservées

- `src/audio/simple-synth.js`
  - Ajout synthèse FM Rhodes : modulateur×3, partiels cloche, ADSR doux
  - `setSynthMode('piano'|'rhodes')` pour basculer

- `src/ui/recording-tab.js`
  - Nouveau flux session : bouton → mini-modal (metronome) → REC → countdown 3-2-1-GO
  - Bouton STOP clignotant pendant enregistrement
  - Suppression ancien formulaire (Tonalité/Tempo/Tags)
  - Session sauvegardée → analyse activée directement

- `src/index.html`
  - Panneau Historique supprimé
  - Formulaire session remplacé par `.recording-init-modal`
  - Ajout toggle Rhodes et champ tolérance 200ms par défaut
  - Bouton Pause supprimé (flux simplifié)

- `src/analyzer/chord-timeline.js`
  - `MIN_CHORD_DURATION` 0.15→0.2s (200ms fenêtre arpège)

- `src/recorder/player.js`
  - **BUG AUDIO CORRIGÉ** : vélocité divisée par 127 une deuxième fois → inaudible. Retrait du `/ 127`.

- `src/ai/ai-client.js`
  - Nouveau : `generateMasterclass(analysis)` → envoie toute la session à Groq
  - Prompt système détaillé (professeur expert, top note, worship/jazz voicings, mouvement)

- `src/ui/analyzer-tab.js`
  - Nouveau panneau Arrangement Harmonique (dans détail analyse)
  - Grille : accord, top note, toggle ON/OFF, basse (auto ou note/pattern)
  - Bouton "Masterclass IA" → envoie la session au complet → affiche le rapport

- `src/style.css`
  - `.app-main` : keyboard row réduite (22vh au lieu de 30vh) pour plus d'espace en haut
  - `.pedagogy-panel` : plus de max-height, `flex: 1` pour remplir l'espace
  - Nouveaux styles : `.arrangement-*`, `.masterclass-*`

- `src/ui/recording-tab.js`
  - Métronome fonctionnel : `startMetronome()` / `stopMetronome()`, click AudioContext à 120 BPM
  - Branché sur le toggle `#metronome-toggle` dans le mini-modal du flux session

