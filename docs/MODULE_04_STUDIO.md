# Cahier des charges — Module 4 : Studio

> Ce document décrit le Module 4 de Piano Jazz Chords : un espace pour importer un morceau audio/vidéo, le lire, le transposer et séparer les pistes pour s'entraîner par-dessus.> Adapté à la stack : Electron + Vite + JavaScript natif.

## Objectifs

1. Créer un nouvel onglet **Studio**.
2. Permettre l'import de fichiers audio/vidéo (MP3, MP4, WAV, FLAC, OGG).
3. Lire le fichier dans une zone vidéo/audio centrale.
4. Afficher une waveform et permettre la sélection d'une région.
5. Offrir une transposition pitch-seul (sans changer le tempo) en demi-tons, appliquée à la région sélectionnée ou au morceau entier.
6. Séparer les pistes avec Demucs : Basse, Batterie, Voix, Autres, Piano.
7. Offrir un panneau de mixage avec mute/solo/volume par piste, gradué en dB.
8. Conserver les séparations sur disque pour éviter de les recalculer.
9. Garder le clavier MIDI virtuel en bas pour visualiser les notes jouées en temps réel.

## Non-objectifs

- Pas de capture d'écran vidéo dans cette version.
- Pas de détection automatique d'accords sur l'audio.
- Pas d'import YouTube direct (l'utilisateur convertit lui-même en MP3/MP4).
- Pas d'analyse pédagogique automatique dans cette version.

## Structure de l'onglet Studio

```
┌───────────────────┬──────────────────────────────┬─────────────────────┐
│                   │                              │                     │
│ Morceaux importés │   Lecteur vidéo/audio        │  Pistes séparées    │
│ [Importer]        │   (zone principale)          │  [x] Basse          │
│ Track_001         │                              │  [x] Batterie       │
│ Track_002         │   Waveform + région          │  [x] Voix           │
│                   │                              │  [x] Autres         │
│                   │                              │  [x] Piano          │
│                   │                              │                     │
├───────────────────┴──────────────────────────────┴─────────────────────┤
│     Barre de contrôle centrale                                          │
│     [◀◀] [▶/⏸] [⏹]  [════════════]  [Transpo]  [Vol]                 │
├─────────────────────────────────────────────────────────────────────────┤
│          Clavier MIDI virtuel                                             │
└─────────────────────────────────────────────────────────────────────────┘
```

## Panneau gauche

- Bouton **Importer un fichier**.
- Liste des morceaux déjà importés dans cette session Studio.
- Quand on clique sur un morceau de la liste, il se charge dans le lecteur.

## Zone centrale

- Lecteur `<video>` si le fichier contient une piste vidéo (MP4).
- Lecteur `<audio>` si c'est un fichier audio (MP3, WAV, FLAC, OGG).
- Fond musical stylisé pour les fichiers audio-only.
- Waveform affichée sous le lecteur.
- Sélection de région avec deux poignées (début/fin) sur la waveform.
- Double-clic sur la waveform pour réinitialiser la région à tout le morceau.
- Tête de lecture synchronisée avec la waveform.

## Barre de contrôle

- Play / Pause / Stop.
- Barre de progression cliquable.
- Transposition en demi-tons (−12 à +12), traitement pitch-seul offline.
- Volume global en dB (−60 dB à +6 dB).
- La transposition est temporaire ; les fichiers transposés sont supprimés après usage.

## Panneau droit

- Section "Pistes séparées".
- Pour chaque piste : nom, bouton Mute, bouton Solo, curseur Volume en dB.
- Bouton **Séparer les pistes** si le morceau n'a pas encore été traité.
- Affichage de l'état de la séparation (pourcentage, terminé, erreur).

## Transposition pitch-seul

- Déclenchée par le contrôle de transposition (−12 à +12 demi-tons).
- Le traitement est réalisé par un script Python (`electron/audio-processor.py`) utilisant `librosa` (phase vocoder) et `ffmpeg` (via `imageio-ffmpeg`).
- Seule la région sélectionnée est traitée, ce qui réduit le temps de calcul.
- Par défaut, la région = tout le morceau.
- Le résultat est un fichier WAV temporaire lu à la place de la piste originale ; le fichier est supprimé ensuite.
- Quand des stems séparés existent, la transposition s'applique au master mixé des stems.
- Temps de traitement indicatif : quelques secondes pour une région de 3–4 min, 15–45 s pour 15 min entier.

## Stockage des fichiers

Chaque morceau importé est stocké dans `~/PianoJazzChords/Studio/`.

```
Studio/
  Track_<id>/
    original.mp3       # fichier original copié
    audio.wav          # piste audio extraite pour waveform + transposition
    metadata.json      # nom, durée, date d'import
    stems/
      bass.wav
      drums.wav
      vocals.wav
      other.wav
      piano.wav
```

## Architecture

### `StudioTab`

Responsabilité : orchestrer l'UI du Studio.

API :
- `initStudioTab({ onMidiEvent })` : initialise l'onglet.
- `loadTrack(trackId)` : charge un morceau existant.
- `importFile(filePath)` : importe un nouveau fichier, le copie dans le dossier Studio.
- `play()`, `pause()`, `stop()`, `seek(time)` : contrôles de lecture.
- `runPitchShift()` : génère l'audio transposé temporaire.

### `StemSeparator`

Responsabilité : communiquer avec Demucs pour séparer les pistes.

API :
- `separate(trackId, inputPath, onProgress)` : lance la séparation.
- `getStems(trackId)` : retourne les chemins des fichiers séparés.
- `isSeparated(trackId)` : indique si les pistes existent déjà.

### `StemMixer`

Responsabilité : mixer les pistes séparées avec mute/solo/volume.

API :
- `loadStems(stemPaths)` : charge les fichiers audio.
- `setMute(stem, muted)`.
- `setSolo(stem, soloed)`.
- `setVolume(stem, volumeDb)`.
- `setMasterVolume(volumeDb)`.
- `play()`, `pause()`, `stop()`, `seek(time)`.

### `StudioStorage`

Responsabilité : gérer les fichiers du Studio via le bridge Electron.

API :
- `ensureStudioDir()`.
- `createTrackDir(trackId)`.
- `listTracks()`.
- `saveOriginal(trackId, sourcePath)`.
- `saveMetadata(trackId, metadata)`.
- `loadMetadata(trackId)`.
- `readOriginalAsBlobUrl(trackId)`.
- `readAllStemsAsBlobUrls(trackId)`.

### `AudioProcessor` (Python)

Responsabilité : traitements audio offline.

Commandes :
- `extract <input> <output_wav>` : extraction audio.
- `waveform <wav>` : génère `{duration, peaks}`.
- `pitch-shift <input> <output> <semitones> [<start>] [<end>]` : transposition pitch-seul d'une région.
- `mix-stems <stem1,stem2,...\u003e <output>` : mixe les stems en un master.

## Contraintes techniques

- Tout le code en JavaScript natif avec ES modules.
- Demucs est appelé via un script Python exécuté par le processus principal Electron.
- FFmpeg est embarqué via `imageio-ffmpeg` dans le venv local.
- Le pitch-shift est réalisé en Python pur avec `librosa` + `resampy` (phase vocoder).
- Les fichiers audio sont lus via des blob URLs créés avec le bridge Electron.
- Le clavier MIDI virtuel en bas reste connecté au moteur existant.
- Les raccourcis clavier du clavier virtuel sont désactivés en dehors de l'onglet Entraînement.

## Critères d'acceptation

- [x] Les onglets sont renommés : Entraînement, Analyse, Studio.
- [x] L'onglet Entraînement n'affiche plus le lecteur multi-pistes ni la progression.
- [x] L'onglet Studio permet d'importer un fichier MP3/MP4/WAV/FLAC/OGG.
- [x] Le fichier importé est listé et peut être rechargé.
- [x] Le lecteur central affiche la vidéo ou joue l'audio.
- [x] Une waveform est affichée et une région peut être sélectionnée.
- [x] La transposition pitch-seul fonctionne sans changer le tempo.
- [x] Un bouton permet de séparer les pistes avec Demucs.
- [x] Les pistes séparées sont affichées dans le panneau droit.
- [x] Mute, solo et volume en dB fonctionnent par piste.
- [x] Le clavier MIDI virtuel en bas affiche les notes jouées en temps réel.
- [x] Les fichiers séparés sont conservés sur disque.
- [x] Le build passe sans erreur.
