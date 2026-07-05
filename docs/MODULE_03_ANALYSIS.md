# Cahier des charges — Module 3 : Analyse IA des sessions MIDI

> Ce document décrit le Module 3 de Piano Jazz Chords : analyse harmonique automatique d'une session MIDI enregistrée.
> Il est adapté à la stack existante : Electron + Vite + JavaScript natif.
> Le Module 3 repose sur le Module 2 et ne doit pas le casser.

## Contexte

Le Module 2 permet d'enregistrer et de relire des sessions MIDI.
Chaque session est sauvegardée dans `~/PianoJazzChords/Sessions/Session_NNN/` avec :
- `session.json` : métadonnées et statistiques
- `metadata.json` : métadonnées éditables
- `events.json` : événements MIDI avec timestamps
- `events.mid` : fichier MIDI standard
- `markers.json` : tableaux de sections (vide pour l'instant)
- `analysis/` : dossier prêt pour les résultats d'analyse

Le Module 3 lit ces fichiers et produit une analyse musicale utilisable par le pianiste.

## Objectifs

1. Analyser automatiquement une session MIDI enregistrée.
2. Détecter les accords joués et leur position temporelle.
3. Segmenter la session en sections musicales (Intro, Couplet, Pré-refrain, Refrain, Bridge, Outro).
4. Calculer des scores sur le jeu : voice leading, transitions, tensions, voix internes.
5. Proposer des réharmonisations selon des styles prédéfinis : Worship, Gospel, Jazz, Neo Soul.
6. Permettre d'écouter immédiatement une suggestion.
7. Sauvegarder l'analyse dans `analysis/analysis.json` pour éviter de la recalculer.

## Non-objectifs

- Pas d'import audio/YouTube dans ce module (Module 4).
- Pas d'analyse de vidéo dans ce module.
- Pas de génération audio réelle des suggestions — seulement une version MIDI modifiée.

## Définitions

### Accord de référence
Un accord détecté à un instant donné est caractérisé par :
- `time` : temps en secondes
- `duration` : durée en secondes
- `rootPc` : classe de pitch de la fondamentale (0-11)
- `symbol` : type d'accord (maj7, m7, 7, etc.)
- `bassPc` : basse si slash chord
- `notes` : notes MIDI présentes
- `techniques` : rootless, upper structure, quartal, cluster, etc.

### Section
Une section est un segment temporel avec un label :
- `start` : temps de début
- `end` : temps de fin
- `label` : Intro, Verse, PreChorus, Chorus, Bridge, Outro, Interlude

### Score
Un score est une note entre 0 et 10 accompagnée d'un commentaire court.

## Flux utilisateur

### Ouvrir l'analyse

1. L'utilisateur va dans l'onglet "Enregistrement".
2. Il sélectionne une session dans la liste.
3. Il clique sur un bouton **Analyser**.
4. L'application calcule l'analyse (ou la charge si elle existe déjà).
5. Les résultats s'affichent dans le panneau central.

### Visualiser l'analyse

Le panneau central affiche :
- Les sections sous forme de timeline.
- Pour chaque section, la progression originale jouée.
- Les scores globaux.
- Les suggestions de réharmonisation.

### Appliquer une suggestion

1. L'utilisateur choisit un style : Worship, Gospel, Jazz, Neo Soul.
2. Il clique sur **Appliquer**.
3. L'application génère une nouvelle progression harmonique.
4. La timeline affiche la version modifiée.
5. L'utilisateur peut cliquer sur **▶ Écouter** pour entendre la suggestion.

## Architecture

### `Analyzer`

Responsabilité : orchestrer l'analyse complète d'une session.

API attendue :
- `analyze(sessionId, events, session)` : retourne un objet `AnalysisResult`.
- `loadAnalysis(sessionId)` : charge `analysis/analysis.json` s'il existe.
- `saveAnalysis(sessionId, result)` : sauvegarde le résultat.

### `ChordTimeline`

Responsabilité : transformer les événements MIDI en une timeline d'accords.

API attendue :
- `buildChordTimeline(events, options)` : retourne un tableau d'accords détectés avec leur durée.

### `Segmenter`

Responsabilité : découper la timeline en sections musicales.

API attendue :
- `segment(chords, totalDuration)` : retourne un tableau de sections.

Heuristiques simples :
- Silence de plus de 2 secondes = frontière possible.
- Répétition d'une progression = section.
- Début = Intro, fin = Outro.
- Sections longues et répétées = Couplet/Refrain.

### `Scorer`

Responsabilité : calculer les scores.

Scores :
- `voiceLeading` : fluidité des mouvements de voix entre accords consécutifs.
- `transitions` : qualité des résolutions harmoniques (V→I, ii→V, etc.).
- `tensions` : utilisation des tensions (9, 11, 13, alterations).
- `innerVoices` : richesse des mouvements internes.

### `Reharmonizer`

Responsabilité : générer des substitutions et des enrichissements.

Styles :
- **Worship** : accords simples, triades enrichies, suspension, pas d'altérations agressives.
- **Gospel** : dominantes secondaires, tritones, passing chords, mouvements chromatiques.
- **Jazz** : II-V-I, extensions 9/11/13, substitutions tritoniques, upper structures.
- **Neo Soul** : quartal voicings, planing, accords de passage, tensions douces.

API attendue :
- `suggest(chords, style)` : retourne une nouvelle timeline d'accords.

### `SuggestionPlayer`

Responsabilité : convertir une timeline d'accords suggérée en événements MIDI jouables.

API attendue :
- `playSuggestion(suggestion, feedMidiEvent)` : joue la suggestion en utilisant le moteur existant.
- `renderSuggestionToEvents(suggestion)` : génère des événements MIDI à partir d'une timeline d'accords.

### `AnalyzerTab`

Responsabilité : afficher les résultats dans l'onglet Enregistrement.

## Structure de `analysis.json`

```json
{
  "sessionId": "Session_001",
  "generatedAt": "2026-07-04T12:00:00.000Z",
  "appVersion": "0.1.0",
  "duration": 125.4,
  "chords": [
    {
      "time": 0.0,
      "duration": 4.0,
      "rootPc": 0,
      "symbol": "maj7",
      "bassPc": null,
      "notes": [48, 55, 59, 62],
      "techniques": []
    }
  ],
  "sections": [
    {
      "start": 0.0,
      "end": 16.0,
      "label": "Intro",
      "chordIndices": [0, 1, 2, 3]
    }
  ],
  "scores": {
    "voiceLeading": { "value": 8.2, "comment": "Mouvements de voix fluides" },
    "transitions": { "value": 7.5, "comment": "Bonne utilisation des II-V-I" },
    "tensions": { "value": 6.0, "comment": "Peu d'extensions 9/11/13" },
    "innerVoices": { "value": 7.0, "comment": "Voix internes simples mais cohérentes" }
  },
  "suggestions": {
    "worship": [...],
    "gospel": [...],
    "jazz": [...],
    "neoSoul": [...]
  }
}
```

## Contraintes techniques

- Analyse entièrement côté client, pas d'appel API externe.
- Utilisation du moteur de détection d'accords existant (`src/chord-engine/`).
- Pas de duplication de la logique de détection.
- Sauvegarde des analyses pour éviter les recalculs.
- Code modulaire avec responsabilités uniques.

## Critères d'acceptation

- [ ] L'utilisateur peut lancer une analyse depuis l'onglet Enregistrement.
- [ ] L'analyse détecte les accords et leur durée.
- [ ] L'analyse segmente la session en sections musicales.
- [ ] Les scores s'affichent avec des commentaires.
- [ ] Les suggestions par style sont générées.
- [ ] L'utilisateur peut écouter une suggestion.
- [ ] L'analyse est sauvegardée dans `analysis/analysis.json`.
- [ ] L'interface est claire et ne chevauche pas les éléments.
- [ ] Le code est modulaire et commenté.

## Fichiers concernés

- `src/analyzer/analyzer.js`
- `src/analyzer/chord-timeline.js`
- `src/analyzer/segmenter.js`
- `src/analyzer/scorer.js`
- `src/analyzer/reharmonizer.js`
- `src/analyzer/suggestion-player.js`
- `src/ui/analyzer-tab.js`
- `src/ui/recording-tab.js` (intégration)
- `src/recorder/storage.js` (lecture/écriture analysis.json)
- `src/index.html`
- `src/style.css`
