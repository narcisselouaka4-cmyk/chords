# Piano Jazz Chords

Application desktop d’affichage et d’apprentissage des accords jazz en temps réel.

## Fonctionnalités

- Détection d’accords jazz fiable : 7e, 9e, 11e, 13e, altérations, inversions, notations slash.
- Affichage temps réel sur un clavier SVG interactif.
- Entrée MIDI native via `@julusian/midi` (Windows/macOS/Linux).
- Clavier virtuel cliquable et jouable au clavier d’ordinateur avec synthèse Web Audio.
- Panneau pédagogique : inversion, close position, drop 2 / drop 3 / drop 2 & 4.
- Progressions d’accords simples (ex. `6-4-5-1`, `2-5-1`).
- Lecteur multi-pistes stems avec mute/solo/volume.

## Installation

```bash
cd piano-jazz-chords
npm install
```

## Démarrer en développement

```bash
npm run dev
```

## Tester le moteur d’accords

```bash
npm run test:chords
```

## Build

```bash
npm run build              # build renderer
npm run dist:linux         # package Linux
npm run dist:win           # package Windows
npm run dist:mac           # package macOS
```

## Raccourcis clavier virtuel

| Touche | Note |
|--------|------|
| A      | C4   |
| W      | C#4  |
| S      | D4   |
| E      | D#4  |
| D      | E4   |
| F      | F4   |
| T      | F#4  |
| G      | G4   |
| Y      | G#4  |
| H      | A4   |
| U      | A#4  |
| J      | B4   |
| K      | C5   |
| O      | C#5  |
| L      | D5   |
| P      | D#5  |

## Structure

- `electron/` : processus principal Electron + bridge MIDI.
- `src/chord-engine/` : moteur de détection d’accords jazz.
- `src/ui/` : clavier SVG et affichage.
- `src/audio/` : synthèse et lecteur multi-pistes.
- `src/progressions/` : parser de progressions.
