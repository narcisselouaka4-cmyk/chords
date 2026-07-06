# Brief de reprise pour Claude — Module Studio Piano Jazz Chords

> Ce fichier est destiné à Claude pour qu'il prenne le relais.  
> Contexte complet + état actuel du code + bugs restants + mission précise.  
> Mode d'exécution souhaité par l'utilisateur : **auto / don't ask**.

---

## 1. Contexte

**Application** : Piano Jazz Chords (Electron + Vite + vanilla JS).
**Objectif du module Studio** : importer des fichiers audio/vidéo (MP3, WAV, MP4, etc.), écouter, sélectionner une région de travail, séparer les pistes avec Demucs, transposer et mixer les stems.

Le projet est un **apprentissage de jazz interactif** où l'onglet Studio permet d'étudier des performances/covers importées.

---

## 2. Historique des itérations récentes

### Commits existants (ordre chronologique inverse)

1. **`f54e733`** — `feat(studio): workflow UX en 3 etapes`
   - Limite région passée à 5 minutes (300s).
   - Overlay flouté Étape 1 (ciblage).
   - Loader Étape 2 (traitement async extraction + Demucs).
   - Déblocage Étape 3 (Studio Pro : transpo, stems, toggle mix original).
   - Persistance de la région dans `metadata.json`.

2. **`f81a8f9`** — `docs: mets a jour STUDIO_REARCH.md`
   - Mise à jour de ce fichier.

3. **`acc82fa`** — `Synth: clamper les fréquences des oscillateurs`
   - `clampOscFrequency()` dans `simple-synth.js` pour éviter le warning WebAudio.

4. **`7a27af8`** — `Studio: réarchitecture du pipeline audio`
   - Vidéo visible (`<video>`) + audio caché (`<audio>`) synchronisés.
   - Audio caché alimenté par le WAV extrait via `extractAudio()`.
   - Toggle "Pistes séparées / Mix original".

5. **`7e70929`** — `fix(audio): sortie native lecteur, stems propres a transpo 0, garde MIDI`
   - Sortie native quand pas de transposition.
   - Stems : bypass pitch-shift à transposition 0.
   - Garde notes MIDI 0–127.

6. `c723e21`, `c0c36ca`, `8f4ffed` — tentatives précédentes de correction du son.

---

## 3. Architecture actuelle du Studio (résumé technique)

### Pipeline audio

```
Import fichier
    │
    ▼
┌─────────────────┐
│ extractAudio()  │  → fichier audio.wav dans ~/PianoJazzChords/Studio/<track>/
└─────────────────┘
    │
    ▼
┌─────────────────────┐
│ generateWaveform()  │  → données waveform pour l'UI
└─────────────────────┘
    │
    ▼
Lecteur double :
    - <video> visible (image seule, muted)
    - <audio> caché (son natif + WebAudio quand transposition active)
    │
    ▼
Étape 1 : Ciblage
    - overlay flouté
    - message "Sélectionnez une région de maximum 5 minutes"
    - bouton Play/Pause natif
    │
    ▼
Confirmer la région
    │
    ▼
Étape 2 : Traitement asynchrone
    - Découpage région WAV (getRegionTrimmedPath)
    - Séparation Demucs (runDemucs) ou stems simulés
    - Loader avec pourcentage
    │
    ▼
Étape 3 : Studio Pro
    - transposition +/- 12 demi-tons
    - toggle pistes séparées / mix original
    - mute/solo/volume par stem
```

### Fichiers importants

| Fichier | Rôle |
|---------|------|
| `src/ui/studio-tab.js` | Logique UI + audio du Studio (≈1600 lignes) |
| `src/audio/pitch-shifter.js` | SoundTouch AudioWorklet pour la transposition |
| `src/audio/stem-mixer.js` | Mixer multi-pistes (bass, drums, vocals, other, piano) |
| `src/audio/stem-separator.js` | Interface avec Demucs via IPC Electron |
| `src/audio/simple-synth.js` | Synthétiseur virtuel + garde MIDI |
| `src/recorder/studio-storage.js` | Lecture/écriture metadata + fichiers |
| `electron/main.js` | IPC main process (extraction, Demucs, waveform, fichiers) |
| `electron/preload.js` | Exposition `window.electronAPI` |
| `src/index.html` | DOM de l'onglet Studio |
| `src/style.css` | Styles overlays, lecteur, stems |

---

## 4. État fonctionnel

### ✅ Ce qui fonctionne

1. **Import de fichiers** : MP3, MP4, WAV, etc.
2. **Lecteur vidéo** : l'image MP4 s'affiche.
3. **Waveform** : se génère et s'affiche.
4. **Sélection de région** : clic + drag sur la waveform.
5. **Workflow 3 étapes** : overlays, loader, toast "prêt".
6. **Persistance région** : sauvegardée dans `metadata.json`.
7. **Séparation Demucs / stems simulés** : fonctionne, loader avec pourcentage.
8. **Toggle stems / mix original** : bouton présent dans la sidebar droite.
9. **Synthétiseur** : garde anti-notes invalides, clamp fréquences.
10. **Build Vite** : OK (0 erreur).
11. **Tests de régression** : Partie 1 et Partie 3 passent.

### ❌ Bug principal encore non résolu

**Aucun son ne sort du lecteur Studio pour les fichiers non séparés.**

Track_003 (séparé par Demucs) sortait du son dans une version précédente, mais la qualité était mauvaise (craquements). Avec la nouvelle architecture double lecteur, le son est muet sur les tests actuels.

### Symptômes

- La vidéo avance, la barre de progression bouge.
- Le Play/Pause fonctionne.
- Aucune sortie audio audible.
- Console : parfois warning `Oscillator.frequency.value ... outside nominal range` (résidu du synthétiseur, pas directement lié au lecteur Studio).

---

## 5. Hypothèses sur le silence

1. **Autoplay policy d'Electron** : l'`<audio>` caché nécessite une interaction utilisateur explicite pour démarrer le son. Le clic Play est censé suffire, mais peut-être pas si l'élément est `display:none` ou `muted`.
2. **`display:none` sur le conteneur audio** : un élément media dans un conteneur `display:none` peut ne pas jouer correctement dans Electron.
3. **Mauvais blob MIME** : le blob URL créé à partir du WAV extrait peut avoir un type incorrect ou être invalide.
4. **`crossOrigin='anonymous'` sur fichier local** : peut bloquer le chargement.
5. **Synchronisation vidéo/audio** : l'audio est censé mener, mais si l'audio ne démarre jamais, la vidéo continue seule.
6. **Volume initial** : `playerAudio.volume` pourrait être à 0 ou `muted` à cause d'un appel mal placé.
7. **AudioContext suspendu** : quand transposition active, le `studioAudioCtx` n'est pas résumé au moment du clic.

---

## 6. Mission pour Claude

### Objectif principal
**Faire sortir le son du lecteur Studio dans tous les cas :**
- MP3 / WAV seul.
- MP4 (vidéo + son synchronisés).
- Après séparation de pistes (stems + mix original).
- Avec transposition active (region confirmée).

### Contraintes
1. **Garder le workflow 3 étapes** déjà implémenté.
2. **Garder la double architecture video/audio** (pas retour à un seul `<audio>`/`<video>`).
3. **Garder la sélection de région et sa persistance**.
4. **Garder le toggle stems / mix original**.
5. **Ne pas casser les tests de régression existants** (`src/analyzer/test-regression-part1.js`, `src/chord-engine/test-regression-part3.js`).
6. **Build Vite doit rester OK**.

### Suggestions d'approche

1. **Commencer par simplifier et auditer le lecteur audio caché** :
   - Ne plus utiliser `display:none` pour le conteneur audio ; utiliser `position:absolute; width:0; height:0; opacity:0; pointer-events:none;` (déjà partiellement fait).
   - Vérifier que `playerAudio.muted = false` et `playerAudio.volume > 0` au moment du Play.
   - Logger dans la console : `playerAudio.readyState`, `playerAudio.error`, `playerAudio.muted`, `playerAudio.volume`, `playerAudio.paused`.

2. **Tester la sortie native sans WebAudio d'abord** :
   - Quand pas de transposition (Étape 1 et Étape 3 avec transpose=0), désactiver totalement WebAudio pour le player audio caché.
   - Utiliser `playerAudio.play()` directement avec `muted=false` et `volume=1` (test).

3. **Réparer la synchronisation** :
   - L'audio doit démarrer **avant** ou **en même temps** que la vidéo.
   - Éviter que `video.play()` ne soit appelé si `audio.play()` a échoué.
   - Ajouter un catch sur `audio.play()` et afficher l'erreur.

4. **Gérer l'AudioContext** :
   - Dans `play()`, si transposition active, réveiller `studioAudioCtx` explicitement après interaction utilisateur.
   - Si `studioAudioCtx.state === 'suspended'`, appeler `resume()`.

5. **Vérifier le blob WAV** :
   - S'assurer que `audioBlobUrl` est bien créé avec `type: 'audio/wav'`.
   - Vérifier que `wavBytes` n'est pas vide.
   - Ajouter un fallback : si le WAV extrait ne fonctionne pas, utiliser le blob original comme source audio.

6. **Stabiliser le stem-mixer** :
   - Quand `useStemsMode = true`, s'assurer que le mixer est correctement connecté à `audioContext.destination`.
   - Quand `useStemsMode = false`, le son doit revenir au mix original (`playerAudio`).

### Tests à valider

1. Importer un MP3 → Play à l'Étape 1 → son sort.
2. Importer un MP4 → Play à l'Étape 1 → image + son synchronisés.
3. Sélectionner une région → Confirmer → loader → Étape 3 → Play → son sort.
4. Étape 3 → transposer +2 → son transposé, tempo stable.
5. Track séparé (Track_003) → toggle "Écouter les pistes séparées" puis "Écouter le mix original" → les deux sortent.
6. Changer de track puis revenir → région et stems persistants.
7. Aucun buzz MIDI parasite au Play.

---

## 7. Notes diverses

- L'utilisateur souhaite ajouter plus tard un bouton **"Enregistrer la Session"** via `MediaRecorder`. C'est hors scope de cette mission.
- Le code est commenté en français ; maintenir cette convention.
- L'utilisateur a explicitement demandé le mode automatique : ne pas re-demander de validation pour chaque modification, sauf blocage majeur.

---

## 8. Ressources utiles

- `src/ui/studio-tab.js` — fonction critique : `createMediaPlayer`, `bindMediaEvents`, `play`, `ensurePlayerRouted`, `startRegionProcessing`, `loadTrack`, `refreshStems`.
- `electron/main.js` — IPCs : `studio:extract-audio`, `studio:separate`, `studio:get-stems`.
- `src/audio/stem-mixer.js` — `loadStems`, `play`, `setDetune`.
- `src/audio/pitch-shifter.js` — factory SoundTouch.

---

## 9. Message final de l'utilisateur

> "Voici les réponses aux 7 questions de précision. Applique ce plan immédiatement en mode automatique sans me redemander de validation."

L'utilisateur veut que Claude prenne le relais et corrige le bug du son sans re-planifier.
