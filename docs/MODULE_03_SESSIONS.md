# Cahier des charges — Module 3 : Sessions MIDI

> Ce document décrit le Module 3 de Piano Jazz Chords : enregistrement, sauvegarde, gestion et relecture des sessions MIDI.
> Il est adapté à la stack existante : Electron + Vite + JavaScript natif.
> Le Module 3 ne doit pas casser les Modules 1 et 2.

## Contexte

L'application possède déjà :
- `src/recorder/recorder.js`
- `src/recorder/player.js`
- `src/recorder/session-manager.js`
- `src/recorder/storage.js`
- `src/recorder/serializer.js`
- `src/ui/recording-tab.js`
- Un onglet "Enregistrement" dans `src/index.html`

Ces fichiers forment les fondations mais ils sont incomplets et partiellement bogués.
Le Module 3 consiste à les consolider et à ajouter les fonctionnalités manquantes.

## Objectifs

1. Permettre à l'utilisateur d'enregistrer sa session de jeu MIDI.
2. Sauvegarder chaque session dans un dossier dédié sous le home utilisateur.
3. Permettre la relecture d'une session avec les mêmes affichages que le mode temps réel.
4. Offrir une gestion simple des sessions : liste, renommage, suppression, recherche.
5. Préparer l'architecture pour les analyses futures du Module 4.

## Non-objectifs

- Pas d'import/export audio dans ce module.
- Pas d'analyse IA dans ce module.
- Pas de segmentation automatique en sections.
- Pas de suggestions de réharmonisation.

Ces fonctionnalités seront développées dans les modules suivants.

## Structure d'une session

Chaque session est un dossier sous `~/PianoJazzChords/Sessions/Session_NNN/`.

```
Session_001/
├── session.json       # métadonnées + statistiques
├── metadata.json      # métadonnées éditables
├── events.json        # événements MIDI avec timestamps (format lisible)
├── events.mid         # fichier MIDI standard (SMF)
├── markers.json       # sections vides pour l'instant, prêt pour Module 4
└── analysis/
    └── .gitkeep       # prêt pour Module 4
```

### `session.json`

```json
{
  "id": "Session_001",
  "name": "Session 04/07/2026 10:00",
  "date": "2026-07-04T10:00:00.000Z",
  "duration": 125.4,
  "key": "C",
  "tempo": 120,
  "noteCount": 420,
  "chordCount": 32,
  "appVersion": "0.1.0"
}
```

### `metadata.json`

```json
{
  "name": "Session 04/07/2026 10:00",
  "key": "C",
  "tempo": 120,
  "comments": "Travail sur les 2-5-1",
  "tags": ["gospel", "2-5-1"],
  "createdAt": "2026-07-04T10:00:00.000Z"
}
```

### `events.json`

Tableau d'événements au format suivant :

```json
[
  { "time": 0.0, "type": "note_on", "note": 60, "velocity": 95, "channel": 0 },
  { "time": 0.5, "type": "note_off", "note": 60, "velocity": 0, "channel": 0 },
  { "time": 1.2, "type": "sustain", "value": true, "channel": 0 },
  { "time": 3.4, "type": "pitch_wheel", "value": 0.12, "channel": 0 }
]
```

### `events.mid`

Fichier MIDI SMF format 0, généré à partir de `events.json`.

### `markers.json`

Tableau vide pour l'instant :

```json
[]
```

## Flux utilisateur

### Démarrer une session

1. L'utilisateur va dans l'onglet "Enregistrement".
2. Il clique sur "Nouvelle session".
3. Un formulaire apparaît avec les champs :
   - Nom (généré automatiquement avec la date/heure)
   - Tonalité (optionnel)
   - Tempo (optionnel)
   - Commentaires (optionnel)
   - Tags (optionnel)
4. L'utilisateur clique sur "● REC".
5. L'enregistrement démarre.

### Pendant l'enregistrement

- Le chronomètre s'incrémente.
- Le nombre de notes augmente.
- Le nombre d'accords détectés s'affiche.
- L'accord courant est visible.
- Les événements MIDI sont stockés en mémoire avec un timestamp relatif.

### Arrêter une session

1. L'utilisateur clique sur "■ Stop".
2. L'application calcule les statistiques.
3. L'application propose :
   - **Conserver** : sauvegarde la session dans `~/PianoJazzChords/Sessions`.
   - **Supprimer** : efface l'enregistrement en mémoire.
   - **Rejouer** : lance immédiatement la lecture de la session.

### Gérer les sessions

La liste des sessions affiche :
- Nom
- Date
- Durée
- Tonalité
- Tempo
- Nombre de notes
- Nombre d'accords

Actions disponibles sur chaque session :
- Charger / Lire
- Renommer
- Supprimer

### Lire une session

1. L'utilisateur sélectionne une session dans la liste.
2. Il clique sur "▶ Lecture".
3. La lecture démarre.
4. Les événements MIDI sont réinjectés dans le moteur existant.
5. L'affichage (clavier, accord, historique, techniques) fonctionne comme en temps réel.
6. Les contrôles disponibles :
   - Pause
   - Stop
   - Retour début
   - Vitesse : 0.5x, 0.75x, 1x, 1.25x, 1.5x, 2x

## Interfaces et responsabilités

### `Recorder`

Responsabilité : capturer les événements MIDI entrants pendant l'enregistrement.

API attendue :
- `start()` : démarre l'enregistrement, réinitialise les buffers.
- `pause()` : met en pause.
- `resume()` : reprend.
- `stop()` : termine et retourne les événements + statistiques.
- `noteOn(note, velocity)` : enregistre un note on.
- `noteOff(note)` : enregistre un note off.
- `sustain(value)` : enregistre un changement de pédale.
- `pitchWheel(value)` : enregistre un pitch bend.
- `modWheel(value)` : enregistre une modulation.
- `getCurrentTime()` : temps écoulé en ms.
- `getStats()` : notes, accords, durée.

### `Player`

Responsabilité : lire une session MIDI enregistrée et réinjecter les événements.

API attendue :
- `load(events)` : charge un tableau d'événements.
- `play()` : démarre la lecture.
- `pause()` : met en pause.
- `stop()` : arrête et remet à zéro.
- `seek(time)` : saute à un temps donné.
- `setSpeed(speed)` : change la vitesse.
- `getCurrentTime()` : temps actuel.
- `getDuration()` : durée totale.

### `SessionManager`

Responsabilité : créer, sauvegarder, charger, lister, renommer et supprimer les sessions.

API attendue :
- `createSession(metadata)` : crée un dossier de session.
- `saveSessionEvents(sessionId, events, stats)` : sauvegarde les événements et les stats.
- `loadSession(sessionId)` : retourne `{ session, events, metadata }`.
- `listSessions()` : retourne la liste des sessions triées par date décroissante.
- `renameSession(sessionId, newName)` : renomme une session.
- `deleteSession(sessionId)` : supprime une session.

### `Storage`

Responsabilité : abstraction du système de fichiers via le bridge Electron.

API attendue :
- `ensureSessionsDir()` : crée le dossier racine des sessions.
- `createSessionDir(sessionId)` : crée le dossier d'une session.
- `listSessionDirs()` : liste les dossiers `Session_*`.
- `writeSessionFile(sessionId, filename, content)` : écrit un fichier.
- `readSessionFile(sessionId, filename)` : lit un fichier.
- `deleteSessionDir(sessionId)` : supprime un dossier.

### `Serializer`

Responsabilité : convertir les événements entre formats JSON et MIDI SMF.

API attendue :
- `serializeEventsJson(events)` : tableau JSON normalisé.
- `parseEventsJson(json)` : parse le JSON.
- `buildMidiFile(events)` : génère un `Uint8Array` SMF format 0.

### `RecordingTab`

Responsabilité : orchestrer l'UI de l'onglet Enregistrement.

Doit gérer :
- le formulaire de nouvelle session ;
- les contrôles REC / Pause / Stop ;
- l'affichage du chronomètre et des statistiques ;
- la liste des sessions ;
- le lecteur avec ses contrôles ;
- la boîte de dialogue post-enregistrement (Conserver / Supprimer / Rejouer).

## Contraintes techniques

- Tout le code est en JavaScript natif avec ES modules.
- Le bridge système de fichiers passe par `window.electronAPI.files`.
- Les événements de lecture doivent passer par les mêmes fonctions `handleNoteOn`, `handleNoteOff`, etc. de `src/main.js`.
- Aucune logique de détection d'accords ne doit être dupliquée.
- Le système doit supporter plusieurs centaines de sessions et des milliers d'événements sans ralentir.

## Critères d'acceptation

- [ ] L'utilisateur peut créer une nouvelle session avec métadonnées.
- [ ] L'utilisateur peut enregistrer son jeu MIDI.
- [ ] Pendant l'enregistrement, le temps, le nombre de notes et le nombre d'accords s'affichent.
- [ ] Après l'enregistrement, l'utilisateur peut conserver, supprimer ou rejouer la session.
- [ ] La session est sauvegardée avec `session.json`, `metadata.json`, `events.json`, `events.mid` et `markers.json`.
- [ ] L'utilisateur peut lister ses sessions.
- [ ] L'utilisateur peut renommer et supprimer une session.
- [ ] L'utilisateur peut lire une session avec les affichages temps réel.
- [ ] La vitesse de lecture est réglable.
- [ ] La lecture réinjecte correctement les événements dans le moteur de détection existant.
- [ ] Le code est modulaire, commenté et sans duplication inutile.

## Préparation pour les modules futurs

La structure de session doit rester compatible avec :
- `analysis/` pour les résultats d'analyse IA.
- `markers.json` pour la segmentation manuelle ou automatique.
- l'import/export de fichiers MIDI.
- la synchronisation audio/MIDI.

## Fichiers concernés

- `src/recorder/recorder.js`
- `src/recorder/player.js`
- `src/recorder/session-manager.js`
- `src/recorder/storage.js`
- `src/recorder/serializer.js`
- `src/ui/recording-tab.js`
- `src/index.html`
- `src/style.css`
- `src/main.js` (pour la réinjection des événements et l'état `isPlayback`)
- `electron/main.js` (bridge fichiers déjà existant)
