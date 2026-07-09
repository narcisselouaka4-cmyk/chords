# Intégration Fusion Engine — Phase 5

## Pipeline

L'analyse de la basse est intégrée dans le pipeline existant de l'Analyzer tab. Elle est déclenchée automatiquement lors de l'appel `analyzer:process-file`.

### Flux

```
Utilisateur importe un fichier (MP3/WAV/MP4)
        │
        ▼
analyzer:process-file(filePath, { analyzeBass: true })
        │
        ├── 1. Probe : durée du fichier
        ├── 2. Extract : mix original → playbackWav
        ├── 3. Piano stem (si disponible) → analysisWav
        ├── 4. Bass stem (si disponible) → bassWav
        │
        ├── 5. analyze-chords sur analysisWav → chords JSON
        │
        └── 6. Bass analysis (si analyzeBass !== false) :
                ├── export_bass_candidates.py --wav bassWav → candidates.json
                └── fusion_bass_chord.py --candidates --chords → segments.json
                        │
                        ├── chords (existant)
                        ├── bassSegments (nouveau)
                        └── retour à l'UI Analyzer
```

### Architecture

```
Analyzer tab
    │
    ├── Chord Engine (audio-processor.py → chords.json)
    │
    └── Fusion Engine (module séparé, scripts/)
            ├── export_bass_candidates.py (Bass Engine V2.5)
            └── fusion_bass_chord.py (Fusion V1.0)
```

**Règles :**
- Le Fusion Engine reste un module séparé, appelable indépendamment.
- `audio-processor.py` orchestre l'appel mais ne contient pas la logique de fusion.
- Zéro modification du Bass Engine V2.5 ou du Chord Engine.

### Source audio pour la basse

| Priorité | Source | Condition |
|----------|--------|-----------|
| 1 | Stem `bass` du Studio | Disponible après séparation Demucs |
| 2 | Mix complet | Fallback par défaut |

### Handler IPC

**Signature :** `analyzer:process-file(filePath, options = { analyzeBass: true })`

**Retour :**
```javascript
{
  wavPath: string,
  analysisWavPath: string,
  usedPianoStem: boolean,
  usedBassStem: boolean,
  duration: number,
  tempo: number|null,
  timeSignature: string,
  key: string|null,
  keyConfidence: number,
  confidence: number,
  chords: ChordSegment[],
  bassSegments: BassSegment[]
}
```

## Format de sortie

### BassSegment (timeline brute)

```javascript
{
  startTime: number,   // début en secondes
  endTime: number,     // fin en secondes
  midi: number,        // MIDI note
  note: string,        // "E"
  octave: number,      // 2
  confidence: number,  // 0.0–1.0
  source: 'bass_engine' | 'chord_engine_virtual',
  isVirtual: boolean
}
```

### ChordSegment enrichi (après normalisation côté UI)

```javascript
{
  startTime: number,
  endTime: number,
  chord: string,           // "C"
  structuralChord: string, // "C" (conservé)
  confidence: number,
  bass: {                  // null si pas de basse pour cet accord
    note: string,          // "E"
    midi: number,          // 40
    octave: number,        // 2
    confidence: number,
    source: 'bass_engine' | 'chord_engine_virtual',
    isVirtual: boolean,
    relationToChord: 'root' | 'chord_tone' | 'passing_tone' | 'slash_bass' | 'unknown'
  },
  bassInterpretation: {   // null si pas d'interprétation
    slashChord: {          // null si basse = root
      name: "C/E",        // nom complet
      confidence: 0.73,
      reason: "bass_in_chord_stable"
    } | null,
    inversion: {
      type: 'root_position' | 'first_inversion' | 'second_inversion' | 'third_inversion' | 'independent_bass',
      label: '1ère inversion',
      confidence: 0.73
    } | null,
    confidence: 0.73       // confiance globale de l'interprétation
  }
}
```

## Critères d'interprétation

### relationToChord

| Valeur | Condition |
|--------|-----------|
| `root` | bassPc === rootPc de l'accord |
| `chord_tone` | bassPc ∈ tierce, quinte, septième |
| `slash_bass` | bassPc === slash bass notée dans le nom (C/E) |
| `passing_tone` | bassPc hors de l'accord |
| `unknown` | nom d'accord non parseable |

### Slash chord suggéré

Un slash chord (`C/E`) est proposé seulement si :
1. `relationToChord` === `chord_tone` ou `slash_bass`
2. Durée de chevauchement basse-accord > 0.2s
3. Stabilité de la basse >= `minStability` (défaut: 0.3)
4. Même PC dominant pendant au moins N trames consécutives

### Confiance de l'interprétation

```
confidence_interp = base(relation) × stabilité × overlapRatio × confBasse × 2
```

Où :
- `base(relation)` : root=1.0, chord_tone=0.85, slash_bass=0.9, passing_tone=0.4, unknown=0.1
- `stabilité` : ratio trames consécutives / durée attendue
- `overlapRatio` : durée chevauchement / durée accord
- `confBasse` : confiance de la note de basse (0–1)

## Invocation du script

### Via Electron (automatique)

```javascript
const analysis = await window.electronAPI.analyzer.processFile(filePath, {
  analyzeBass: true
});
console.log(analysis.bassSegments);
```

### Via CLI (manuel, debug)

```bash
# Exporter les candidats BE
python scripts/export_bass_candidates.py --wav audio.wav --output candidates.json

# Lancer la fusion
python scripts/fusion_bass_chord.py \
  --candidates candidates.json \
  --chords chords.json \
  --params fusion_params.json \
  --output-segments fusion_segments.json

# Le résultat est dans fusion_segments.json
```

## Fichiers modifiés

| Fichier | Modification |
|---------|-------------|
| `electron/main.js` | Handler `analyzer:process-file` : options + `runBassAnalysis()`, fonction `findStudioBassStemForFile()` |
| `electron/preload.cjs` | API `processFile` avec paramètre `options` |
| `src/analyzer/audio-analyzer.js` | Normalisation `bassSegments` + `structuralChord` + `usedBassStem` |
| `src/analyzer/bass-harmonic-relation.js` | **Nouveau** : `computeRelationToChord()`, `findDominantBassForChord()`, `enrichChordWithBass()` |
| `src/ui/analyzer-tab.js` | Timeline basse, enrichissement cartes d'accords, mode développeur |
| `src/style.css` | Styles timeline basse, dev mode |

## Non-régression

Avant déploiement, vérifier :
- `npm run build` OK
- Tests de régression Partie 1 et Partie 3 OK
- Analyse sans bass stem (fallback mix) fonctionne
- Analyse avec `analyzeBass: false` retourne les accords sans basse
- Mode développeur désactivé par défaut

## Limites connues

- La basse détectée sur le mix complet peut contenir des artefacts d'autres instruments.
- Les slash chords dérivés sont une suggestion — l'affichage distingue toujours "Basse détectée : E2" de l'interprétation "Probablement C/E".
- La relation `passing_tone` est délibérément prudente (confiance ≤ 0.4) pour éviter la sur-interprétation.
- Les segments de basse et d'accord conservent leurs propres découpages temporels : la synchronisation se fait par chevauchement, pas par découpage forcé.
