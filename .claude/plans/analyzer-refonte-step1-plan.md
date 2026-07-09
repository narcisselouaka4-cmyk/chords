# Plan : Refonte du module Analyse – Étape 1 (réduction de périmètre)

## Objectif

Transformer l'onglet **Analyse** en un outil simple et fiable :

> Importer un fichier → l'analyser automatiquement → afficher les accords détectés synchronisés avec la timeline.

Toutes les fonctionnalités avancées (sessions MIDI, réharmonisation, suggestions IA, scores, voice leading, etc.) sont supprimées de cette étape. L'architecture reste prévue pour les réintroduire plus tard sans refonte.

## Choix architecturaux validés avec l'utilisateur

1. **Sessions MIDI** : supprimer complètement la section "Nouvelle session" et "Sessions enregistrées" de l'onglet Analyse.
2. **Moteur audio** : extraire la couche d'import/lecture audio du Studio pour en faire un **service partagé** utilisé à la fois par Studio et Analyse.
3. **Analyse audio** : commencer par un algorithme simple **chromagramme + templates d'accords**, derrière une abstraction `AudioAnalyzer` extensible.
4. **Données** : adopter le format de donnée extensible proposé par l'utilisateur, avec les champs avancés vides pour l'instant.

## Phases d'implémentation

### Phase 1 — Fondation Python : commande `analyze-chords`

Fichier : `electron/audio-processor.py`

Ajouter une commande `analyze-chords <wav_path>` qui :
- charge le WAV avec `librosa`,
- calcule un chromagramme,
- applique un template matching sur les accords de base : majeur, mineur, 7, maj7, m7,
- segmente le temps avec une fenêtre glissante (ex. 1 seconde, hop 0,5 s),
- filtre les redondances consécutives,
- retourne un JSON de la forme :
  ```json
  {
    "duration": 120.5,
    "chords": [
      { "startTime": 0.0, "endTime": 6.0, "chord": "Cmaj9", "confidence": 0.98 },
      { "startTime": 6.0, "endTime": 11.0, "chord": "Am7", "confidence": 0.85 }
    ]
  }
  ```

**À ne pas faire dans cette phase** : modèles ML, détection de tonalité, classification de voicing.

### Phase 2 — Service audio partagé

Fichier : `src/audio/media-engine.js` (nouveau)

Créer un service qui regroupe ce qui est aujourd'hui dispersé dans `studio-tab.js` :
- `importFile(filePath)` : extrait l'audio via Python (`extract`), retourne `{ wavPath, duration, waveform }`.
- `createPlayer(container, { wavPath, originalBlobUrl, isVideo })` : crée un lecteur audio/vidéo utilisable par Studio et Analyse.
- `play()`, `pause()`, `stop()`, `seek(time)`, `getCurrentTime()`, `getDuration()`.

Adapter `src/ui/studio-tab.js` pour utiliser ce service au lieu de sa logique interne.

### Phase 3 — Abstraction AudioAnalyzer côté JS

Fichier : `src/analyzer/audio-analyzer.js` (nouveau)

```js
export class AudioAnalyzer {
  async analyze(wavPath) { throw new Error('not implemented'); }
}

export class TemplateAudioAnalyzer extends AudioAnalyzer {
  async analyze(wavPath) {
    // Appelle IPC `studio:analyze-chords` ou `analyzer:analyze`
    // Retourne { duration, chords }
  }
}
```

Cette abstraction permettra plus tard de brancher un moteur plus avancé (Basic Pitch, modèle externe) sans toucher au reste de l'application.

### Phase 4 — Refonte UI de l'onglet Analyse

Fichiers : `src/index.html`, `src/ui/analyzer-tab.js`, `src/style.css`

Dans `src/index.html` :
- Supprimer dans `#analysis-tab` les sections "Nouvelle session" et "Sessions enregistrées".
- Remplacer par un écran d'accueil minimaliste :
  - Titre "Importer un fichier"
  - Liste des formats acceptés (MP3, WAV, MP4, M4A)
  - Bouton "Choisir un fichier"
  - Texte d'aide
- Ajouter, caché par défaut, les conteneurs pour la timeline d'accords (`#analysis-timeline`) et le lecteur (`#analysis-player`).

Dans `src/ui/analyzer-tab.js` :
- Réécrire `initAnalyzerTab` pour afficher l'écran d'import.
- `handleImport(filePath)` :
  1. appelle `mediaEngine.importFile()`,
  2. appelle `audioAnalyzer.analyze()`,
  3. affiche la grille d'accords.
- Rendu de la grille : liste verticale simple, un bloc par accord avec temps de début, nom d'accord, niveau de confiance.
- Synchronisation avec le lecteur :
  - l'accord courant est mis en évidence pendant la lecture,
  - un clic sur un accord saute la lecture au `startTime` correspondant.

### Phase 5 — IPC main → renderer

Fichier : `electron/main.js`

Ajouter un handler IPC `analyzer:analyze-chords` (ou réutiliser `studio:*`) qui :
- extrait l'audio si nécessaire,
- appelle `runAudioProcessor(['analyze-chords', wavPath])`,
- retourne le JSON de grille au renderer.

### Phase 6 — Tests et documentation

- `npm run build` OK.
- `node src/analyzer/test-regression-part1.js` OK.
- `node src/chord-engine/test-regression-part3.js` OK.
- Mettre à jour `CHANGES.md` avec la refonte.
- Note explicite : la qualité de l'algorithme de templates sera limitée sur les arrangements complexes ; le but est de valider la chaîne technique.

## Fichiers impactés

- `electron/audio-processor.py` — nouvelle commande `analyze-chords`
- `electron/main.js` — handler IPC
- `src/audio/media-engine.js` — nouveau service partagé
- `src/analyzer/audio-analyzer.js` — nouvelle abstraction
- `src/analyzer/analyzer.js` — simplifié ou remplacé
- `src/ui/analyzer-tab.js` — refondu
- `src/ui/studio-tab.js` — adapté au service partagé
- `src/index.html` — nouvelle structure onglet Analyse
- `src/style.css` — nouveaux styles
- `CHANGES.md` — documentation

## Ce qui est volontairement hors périmètre

- Réharmonisation
- Suggestions IA / Masterclass
- Voicings / mouvements / upper structures / substitutions
- Scoring / voice leading / analyses pédagogiques
- Sessions MIDI (supprimées de l'onglet Analyse)
- Détection automatique fine du type de contenu (uniquement stockée, pas affichée)

## Risques identifiés

1. **Sessions MIDI existantes** : les fichiers de session resteront sur disque, mais l'accès UI disparaît. Si l'utilisateur a des sessions importantes, il faudra prévoir un message ou un mécanisme de migration.
2. **Qualité de l'analyse simple** : le template matching ne sera fiable que sur des enregistrements relativement propres (piano/guitare solo, mix simple).
3. **Refactor du Studio** : extraire le lecteur en service partagé peut introduire des régressions dans le Studio si ce n'est pas fait avec soin.
