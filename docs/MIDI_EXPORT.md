# Export MIDI — Phase 7.1

## Objectif

Permettre d'exporter le résultat de l'analyse harmonique (basse + accords) sous forme de fichier MIDI SMF standard, compatible avec tous les DAW (Reaper, Ableton Live, Logic Pro, Cubase, etc.).

## Architecture

```
Analyzer (renderer)
    │
    ├── src/analyzer/midi-exporter.js
    │       ├── exportAnalysisToMidi(analysis, options)
    │       │       └── convertit bassSegments → note_on/note_off
    │       │       └── convertit chords → block chords root position
    │       │
    │       └── src/recorder/serializer.js
    │               └── buildMidiFileMultiTrack(tracks, options)
    │                       └── génère le binaire SMF Format 1
    │
    └── IPC electron
            ├── files:save-dialog (dialogue de sauvegarde)
            └── files:write-binary (écriture du fichier .mid)
```

## API publique

### `exportAnalysisToMidi(analysis, options)`

**Paramètres :**

| Nom | Type | Défaut | Description |
|-----|------|--------|-------------|
| `analysis` | Object | — | Résultat de `Analyzer.analyze()` |
| `options.includeBass` | boolean | `true` | Exporter la piste basse |
| `options.includeChords` | boolean | `true` | Exporter la piste accords |
| `options.bassProgram` | number | `33` | Programme MIDI de la basse (Electric Bass finger) |
| `options.chordProgram` | number | `1` | Programme MIDI des accords (Acoustic Grand Piano) |
| `options.bassVelocity` | number | `0.78` | Vélocité basse (0–1) |
| `options.chordVelocity` | number | `0.63` | Vélocité accords (0–1) |

**Retour :** `Uint8Array` contenant le fichier MIDI binaire, ou `null` si rien à exporter.

### `buildMidiFileMultiTrack(tracks, options)`

Dans `src/recorder/serializer.js`.

**Paramètres :**

| Nom | Type | Défaut | Description |
|-----|------|--------|-------------|
| `tracks` | Array | — | Tableau de pistes `{ name, channel, program, events }` |
| `options.tempo` | number | `120` | Tempo en BPM |
| `options.ppq` | number | `480` | Pulses par quarter note |
| `options.timeSignature` | Array | `[4, 4, 24, 8]` | Signature rythmique |
| `options.title` | string | — | Nom du morceau |

## Format de sortie

| Piste | Canal | Programme MIDI | Contenu |
|-------|-------|----------------|---------|
| 0 | — | — | Tempo, signature, nom du morceau (meta-events) |
| 1 | 0 | 33 (Electric Bass finger) | Notes de basse détectées par le Fusion Engine |
| 2 | 1 | 1 (Acoustic Grand Piano) | Accords en block chord root position (octave 4) |

### Spécifications SMF

- **Format :** 1 (multi-pistes)
- **PPQ :** 480
- **Tempo :** issu de `analysis.tempo` (fallback 120 BPM)
- **Signature :** 4/4 fixe

## Voicing des accords

Les accords sont exportés en **block chord root position** dans l'octave 4 :
- `C` → C4, E4, G4
- `C7` → C4, E4, G4, Bb4
- `Dm7` → D4, F4, A4, C5
- `Gmaj7` → G4, B4, D5, F#5

Les qualités supportées : maj, m, 7, maj7, m7, dim, dim7, aug, sus2, sus4, m7b5, mMaj7, 6, m6, 9, maj9, m9.

Les accords slash (`C/E`) sont interprétés sur la partie gauche uniquement.

## Utilisation

### Via l'UI Analyzer

1. Importer un fichier audio dans l'onglet Analyse.
2. Cliquer sur **Export MIDI** dans la barre d'outils.
3. Choisir le nom et l'emplacement du fichier `.mid`.
4. Une notification confirme l'export.

### Via l'API (usage programmatique)

```javascript
import { exportAnalysisToMidi } from '../analyzer/midi-exporter.js';

const analysis = await analyzer.analyze(filePath);
const midiBytes = exportAnalysisToMidi(analysis, {
  includeBass: true,
  includeChords: true,
});

// Écriture via IPC
await window.electronAPI.files.writeBinary(path, midiBytes);
```

## Tests

- `npm run build` : vérifie la compilation Vite.
- `node src/analyzer/test-regression-part1.js` : non-régression timeline/tonalité.
- `node src/chord-engine/test-regression-part3.js` : non-régression classification.
- Test manuel : exporter un fichier `.mid`, importer dans un DAW, vérifier le timing et les notes.

## Limites connues

- Tempo estimé par l'analyseur : peut être imprécis (fallback 120 BPM).
- Accords en root position uniquement (pas de voice leading ni de close voicing).
- Signature rythmique 4/4 fixe (non détectée par l'analyseur actuel).
- Les accords slash (`C/E`) ne sont pas résolus dans l'export.
- Les virtual roots (candidats virtuels du Fusion Engine) ne sont pas exportés.
