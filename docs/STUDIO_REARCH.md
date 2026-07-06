# Plan de réarchitecture audio du module Studio — Piano Jazz Chords

> **STATUT : PLAN EXÉCUTÉ PAR CLAUDE**  
> Ce document décrit l'état cible déjà atteint. Il peut servir de référence pour les prochaines itérations ou debug.

---

## 1. Contexte du projet

**Application** : Piano Jazz Chords (Electron + Vite + vanilla JS).  
**Module concerné** : Studio (import, lecture, transposition, séparation de pistes Demucs, analyse de performances/covers).

### Architecture actuelle du Studio (après réarchitecture)

- Un onglet `Studio` avec :
  - Liste de morceaux importés (MP3, WAV, MP4, etc.).
  - **Vidéo visible** (`<video>`) pour l'image uniquement.
  - **Audio caché** (`<audio>`) pour le son natif + traitement WebAudio.
  - Waveform + sélection de région.
  - Contrôles de transposition en demi-tons (verrouillés tant que la région n'est pas confirmée).
  - Bouton de séparation de pistes (Demucs).
  - Toggle "Pistes séparées / Mix original".
  - Mixer de stems (bass, drums, vocals, other, piano).

- Fichiers clés :
  - `src/ui/studio-tab.js` : logique UI + audio du Studio.
  - `src/audio/pitch-shifter.js` : SoundTouch AudioWorklet pour la transposition.
  - `src/audio/stem-mixer.js` : mixer multi-pistes.
  - `src/audio/stem-separator.js` : interface avec Demucs via IPC Electron.
  - `src/audio/simple-synth.js` : synthétiseur virtuel (avec clamp fréquences + garde MIDI).
  - `src/virtual-keyboard.js` : clavier virtuel + raccourcis.
  - `src/index.html` : DOM.
  - `src/style.css` : styles.

---

## 2. Historique des bugs corrigés

Les commits récents ont corrigé les problèmes suivants :

1. **Corruption pitch-shifting SoundTouch** : verrouillage tempo/rate, purge buffers au retour à 0.
2. **Désynchronisation région / lecteur global** : duration relative, boucle via `timeupdate`, seek waveform relatif.
3. **Régression MIDI (buzz)** : isolation du bouton Play, filtre `Space` dans le clavier virtuel.
4. **Crash AudioContext sur erreur Demucs** : try/catch strict, protection du routage principal.
5. **Isolation Studio / clavier principal** : suppression du callback `feedMidiEvent` du Studio.
6. **Verrou région transpo/séparation** : transposition et séparation désactivées tant que la région n'est pas confirmée manuellement.
7. **`<video>` pour MP4** : le lecteur affiche maintenant les vidéos.
8. **Garde anti-notes MIDI invalides** : rejet si `midi < 0 || midi > 127` dans `simple-synth.js`.
9. **Réarchitecture audio hybride** : vidéo visible + audio caché synchronisés.
10. **Clamp fréquences oscillateurs** : évite le warning WebAudio `frequency outside nominal range`.

---

## 3. État actuel

### ✅ Ce qui est implémenté
- **Vidéo visible + audio caché** : le son sort via un `<audio>` caché alimenté par le WAV extrait, tandis que l'image reste visible.
- **Synchronisation robuste** : l'audio mène le timing, la vidéo suit via événements critiques + `requestAnimationFrame` + resync si dérive.
- **Toggle stems/mix** : bouton dans la sidebar droite pour basculer instantanément entre pistes séparées et mix original.
- **Transposition** : appliquée uniquement quand la région est confirmée, via WebAudio/SoundTouch sur l'audio caché.
- **Fallback** : si l'extraction WAV échoue, l'audio caché utilise le blob original.

### ⚠️ À vérifier / potentiellement à corriger
1. **Son sur les tracks non séparés** : à tester sous Electron.
2. **Craquements Track_003** : vérifier si le clamp/purge suffit.
3. **Dérive audio/vidéo** : vérifier sur des MP4 longs.

---

## 4. Décisions utilisateur validées (et appliquées)

| Question | Réponse appliquée | Résultat |
|----------|-------------------|----------|
| Q1 : synchronisation video/audio | **A** — Synchronisation sur événements critiques + `requestAnimationFrame` + resync. | L'audio est la source de vérité du timing. |
| Q2 : source audio cachée | **A** — Fichier WAV extrait via `extractAudio()`. | Moins de RAM, WebAudio plus stable. |
| Q3 : mix original avec stems | **A** — Garde l'audio caché, toggle "Pistes séparées / Mix original". | Bascule instantanée. |
| Q4 : lecture du fichier WAV | **A** — `readBinary()` + blob URL. | Plus sûr que `file://`. |

---

## 5. Détails de l'implémentation

### 6.1 DOM Studio

Remplacer dans `src/index.html` :

```html
<div class="studio-player-wrap" id="studio-player-wrap">
  <!-- Vidéo visible : image uniquement -->
  <div id="studio-video-container" class="studio-video-container"></div>
  <!-- Audio caché : son natif + WebAudio -->
  <div id="studio-studio-audio-container" class="studio-audio-container" style="display:none;"></div>
  <!-- Backdrop pour fichiers audio sans image -->
  <div id="studio-audio-backdrop" class="studio-audio-backdrop" style="display: none;">
    <div class="studio-backdrop-icon">🎵</div>
    <div class="studio-backdrop-title" id="studio-backdrop-title"></div>
    <div class="studio-backdrop-hint">Fichier audio</div>
  </div>
</div>
```

### 6.2 Références DOM dans `studio-tab.js`

```js
const els = {
  // ... existants ...
  playerVideoContainer: document.getElementById('studio-video-container'),
  playerAudioContainer: document.getElementById('studio-audio-container'),
  player: null,        // référence au <video> visible (UI/timing)
  playerAudio: null,   // référence au <audio> caché (son)
  stemsModeToggle: document.getElementById('studio-stems-mode-toggle'), // à créer
  // ...
};
```

### 6.3 Création des deux players

```js
let playerVideo = null;
let playerAudio = null;
let audioBlobUrl = null;
let videoBlobUrl = null;

function destroyMediaPlayer() {
  if (playerVideo) {
    try { playerVideo.pause(); } catch (_) {}
    try { playerVideo.src = ''; } catch (_) {}
    try { playerVideo.load(); } catch (_) {}
    if (playerVideo.parentNode) playerVideo.parentNode.removeChild(playerVideo);
    playerVideo = null;
  }
  if (playerAudio) {
    try { playerAudio.pause(); } catch (_) {}
    try { playerAudio.src = ''; } catch (_) {}
    try { playerAudio.load(); } catch (_) {}
    if (playerAudio.parentNode) playerAudio.parentNode.removeChild(playerAudio);
    playerAudio = null;
  }
  if (audioBlobUrl) {
    URL.revokeObjectURL(audioBlobUrl);
    audioBlobUrl = null;
  }
  // videoBlobUrl est géré par le storage existant
  disconnectPitchShifter();
  pitchSourceNode = null;
  playerSourceCreated = false;
  els.player = null;
  els.playerAudio = null;
}

async function createMediaPlayer(videoBlobUrl, wavBytes, isVideo) {
  destroyMediaPlayer();

  // --- Vidéo visible (image seule) ---
  const video = document.createElement(isVideo ? 'video' : 'audio');
  video.id = 'studio-player-video';
  video.className = 'studio-player';
  video.preload = 'auto';
  video.src = videoBlobUrl;
  video.muted = true;     // JAMAIS de son ici
  video.volume = 0;
  video.controls = false;
  if (isVideo) video.playsInline = true;
  els.playerVideoContainer.appendChild(video);
  playerVideo = video;
  els.player = video;

  // --- Audio caché (son natif + WebAudio) ---
  const audio = document.createElement('audio');
  audio.id = 'studio-player-audio';
  audio.className = 'studio-player';
  audio.preload = 'auto';
  audioBlobUrl = URL.createObjectURL(new Blob([wavBytes], { type: 'audio/wav' }));
  audio.src = audioBlobUrl;
  audio.crossOrigin = 'anonymous';
  audio.controls = false;
  els.playerAudioContainer.appendChild(audio);
  playerAudio = audio;
  els.playerAudio = audio;

  bindMediaEvents(video, audio);
  setAudioVolume();

  return { video, audio };
}
```

### 6.4 Synchronisation robuste

Principe : **l'audio est la source de vérité du timing**. La vidéo suit l'audio.

```js
let syncRafId = null;
let lastSyncTime = 0;

function bindMediaEvents(video, audio) {
  if (!video || !audio) return;

  // Audio mène le timing
  audio.addEventListener('play', () => {
    video.play().catch(() => {});
    startSyncLoop(video, audio);
  });

  audio.addEventListener('pause', () => {
    video.pause();
    stopSyncLoop();
  });

  audio.addEventListener('seeked', () => {
    if (Math.abs(video.currentTime - audio.currentTime) > 0.05) {
      video.currentTime = audio.currentTime;
    }
  });

  audio.addEventListener('ended', () => {
    video.pause();
    stopSyncLoop();
  });

  // Vidéo répercute les interactions utilisateur sur l'audio
  video.addEventListener('play', () => {
    audio.play().catch(() => {});
    startSyncLoop(video, audio);
  });

  video.addEventListener('pause', () => {
    audio.pause();
    stopSyncLoop();
  });

  video.addEventListener('seeking', () => {
    audio.currentTime = video.currentTime;
  });

  video.addEventListener('seeked', () => {
    audio.currentTime = video.currentTime;
  });

  // UI timeupdate : on l'attache à l'audio
  audio.addEventListener('timeupdate', () => {
    if (!els.playerAudio) return;

    // Boucle région
    if (regionEnd !== null && els.playerAudio.currentTime >= regionEnd) {
      els.playerAudio.currentTime = regionStart;
      video.currentTime = regionStart;
      mixer?.seek(regionStart);
    }

    const duration = getEffectiveDuration();
    const current = getEffectiveCurrentTime();
    updateProgressUI(current, duration);
    updatePlayhead(current, duration);
  });
}

function startSyncLoop(video, audio) {
  stopSyncLoop();
  const loop = () => {
    syncRafId = requestAnimationFrame(loop);
    const now = performance.now();
    if (now - lastSyncTime < 100) return; // vérifier tous les 100 ms max
    lastSyncTime = now;

    if (!audio.paused && !video.paused) {
      const drift = video.currentTime - audio.currentTime;
      if (Math.abs(drift) > 0.04) {
        // Resync brut si dérive importante
        video.currentTime = audio.currentTime;
        video.playbackRate = 1.0;
      } else if (Math.abs(drift) > 0.01) {
        // Rattrapage progressif
        video.playbackRate = drift > 0 ? 0.98 : 1.02;
      } else {
        video.playbackRate = 1.0;
      }
    }
  };
  loop();
}

function stopSyncLoop() {
  if (syncRafId) {
    cancelAnimationFrame(syncRafId);
    syncRafId = null;
  }
  if (playerVideo) playerVideo.playbackRate = 1.0;
}
```

### 6.5 Routage audio conditionnel

```js
let useStemsMode = false; // false = mix original, true = stems

function setAudioVolume() {
  if (!playerAudio) return;
  const db = Number(els.volume?.value) || 0;
  playerAudio.volume = dbToGain(db);
}

function setPlayerMuted() {
  if (!playerAudio) return;
  playerAudio.muted = true;
  playerAudio.volume = 0;
}

function setPlayerAudible() {
  if (!playerAudio) return;
  playerAudio.muted = false;
  setAudioVolume();
}

async function play() {
  if (!playerAudio?.src) return;

  if (playerAudio.readyState < 2) {
    playerAudio.addEventListener('canplay', () => play(), { once: true });
    playerAudio.load();
    return;
  }

  const useStems = mixer?.hasStems() && useStemsMode;
  const needsPitchShift = regionConfirmed && transpose !== 0;

  if (useStems) {
    setPlayerMuted();
    mixer?.seek(regionConfirmed ? regionStart : playerAudio.currentTime);
    mixer?.play();
  } else if (needsPitchShift) {
    ensureStudioAudioContext();
    if (studioAudioCtx?.state === 'suspended') {
      try { await studioAudioCtx.resume(); } catch (_) {}
    }
    setPlayerMuted();
    await ensurePlayerRouted();
    if (!pitchShifter) await runPitchShift();
    if (pitchShifter) pitchShifter.setPitch(transpose);
  } else {
    disconnectPitchShifter();
    setPlayerAudible();
  }

  const startTime = regionConfirmed ? regionStart : playerAudio.currentTime;
  if (regionConfirmed && playerAudio.currentTime < regionStart) {
    playerAudio.currentTime = startTime;
    playerVideo.currentTime = startTime;
  }

  playerAudio.play().catch((err) => console.error('Play failed:', err));
  playerVideo.play().catch(() => {});

  isPlaying = true;
  els.playBtn.textContent = '⏸';
}

export function pause() {
  if (playerAudio?.paused) return;
  playerAudio?.pause();
  playerVideo?.pause();
  mixer?.pause();
  isPlaying = false;
  els.playBtn.textContent = '▶';
  stopUpdateLoop();
  stopSyncLoop();
}

export function stop() {
  playerAudio?.pause();
  playerVideo?.pause();
  if (playerAudio) playerAudio.currentTime = regionConfirmed ? regionStart : 0;
  if (playerVideo) playerVideo.currentTime = regionConfirmed ? regionStart : 0;
  mixer?.stop();
  isPlaying = false;
  els.playBtn.textContent = '▶';
  updateProgressUI(0, getEffectiveDuration());
  stopUpdateLoop();
  stopSyncLoop();
}

function seek(time) {
  const clamped = clampToRegion(time);
  if (playerAudio) playerAudio.currentTime = clamped;
  if (playerVideo) playerVideo.currentTime = clamped;
  mixer?.seek(clamped);
  if (pitchShifter) {
    try { pitchShifter.clear(); } catch (_) {}
  }
}

async function ensurePlayerRouted() {
  if (!playerAudio || !studioAudioCtx) return;

  if (!pitchGainNode) {
    pitchGainNode = studioAudioCtx.createGain();
    pitchGainNode.connect(studioDestination);
  }

  if (!playerSourceCreated) {
    try {
      pitchSourceNode = studioAudioCtx.createMediaElementSource(playerAudio);
      playerSourceCreated = true;
    } catch (e) {
      console.warn('[Studio] Impossible de créer MediaElementSource:', e);
      playerSourceCreated = false;
      return;
    }
  }

  if (pitchSourceNode) {
    pitchSourceNode.disconnect();
    if (pitchShifter) {
      try { pitchShifter.clear(); } catch (_) {}
      try { pitchShifter.disconnect(); } catch (_) {}
      pitchShifter = null;
    }
    if (transpose !== 0) {
      pitchShifter = await createPitchShifter(studioAudioCtx, pitchGainNode, transpose);
      pitchSourceNode.connect(pitchShifter.node);
    } else {
      pitchSourceNode.connect(pitchGainNode);
    }
  }
}
```

### 6.6 Chargement de piste (`loadTrack`)

```js
export async function loadTrack(trackId) {
  try {
    stop();
    mixer?.reset();
    const metadata = await loadMetadata(trackId);
    currentTrack = { id: trackId, metadata };

    const originalBlobUrl = await readOriginalAsBlobUrl(trackId);
    if (!originalBlobUrl) {
      setStatus('Fichier original introuvable');
      return;
    }

    const info = await inspectMedia(originalBlobUrl);
    isAudioOnly = info.isAudioOnly;
    mediaDuration = info.duration || 0;

    // Extraction WAV
    let wavBytes = null;
    let wavPath = null;
    if (window.electronAPI?.studio?.extractAudio) {
      try {
        setStatus('Extraction audio en cours...');
        wavPath = await window.electronAPI.studio.extractAudio(trackId, metadata?.originalPath);
      } catch (err) {
        console.warn('[Studio] extractAudio failed:', err);
      }
    }

    if (wavPath && window.electronAPI?.files?.readBinary) {
      try {
        wavBytes = await window.electronAPI.files.readBinary(wavPath);
      } catch (err) {
        console.warn('[Studio] readBinary wav failed:', err);
      }
    }

    // Fallback : si pas de WAV, on utilisera le blob original comme audio
    if (!wavBytes) {
      wavBytes = null; // createMediaPlayer gérera le fallback
    }

    // Créer les players
    await createMediaPlayer(originalBlobUrl, wavBytes, !isAudioOnly);

    // Génération waveform
    if (wavPath && window.electronAPI?.studio?.generateWaveform) {
      try {
        setStatus('Analyse waveform en cours...');
        audioWavPath = wavPath;
        waveformData = await window.electronAPI.studio.generateWaveform(wavPath);
      } catch (err) {
        console.warn('[Studio] generateWaveform failed:', err);
        audioWavPath = null;
        waveformData = null;
      }
    }

    // Si aucune waveform, fallback sur le blob original pour waveform
    if (!waveformData && window.electronAPI?.studio?.generateWaveform) {
      try {
        waveformData = await window.electronAPI.studio.generateWaveform(metadata?.originalPath);
      } catch (_) {}
    }

    renderWaveform();
    updateAudioBackdrop(metadata?.name || trackId);
    resetTransposeState();
    isAudioReady = false;
    pendingTranspose = 0;

    const onAudioReady = async () => {
      if (isAudioReady) return;
      isAudioReady = true;
      ensureStudioAudioContext();
      await ensurePlayerRouted();
      if (pendingTranspose !== 0 || transpose !== 0) {
        await runPitchShift();
      }
    };
    playerAudio?.addEventListener('canplaythrough', onAudioReady, { once: true });
    playerAudio?.addEventListener('loadedmetadata', onAudioReady, { once: true });
    playerAudio?.addEventListener('loadeddata', onAudioReady, { once: true });

    await refreshTrackList();
    await refreshStems();
    setStatus(`Morceau chargé : ${metadata?.name || trackId}`);
  } catch (err) {
    console.error('Failed to load track:', err);
    setStatus(`Erreur de chargement : ${err.message}`);
  }
}
```

### 6.7 Fallback audio sans WAV

Si `wavBytes` est `null`, `createMediaPlayer` doit utiliser le blob original comme source audio aussi :

```js
async function createMediaPlayer(videoBlobUrl, wavBytes, isVideo) {
  destroyMediaPlayer();

  // Vidéo visible
  const video = document.createElement(isVideo ? 'video' : 'audio');
  video.id = 'studio-player-video';
  video.className = 'studio-player';
  video.preload = 'auto';
  video.src = videoBlobUrl;
  video.muted = true;
  video.volume = 0;
  video.controls = false;
  if (isVideo) video.playsInline = true;
  els.playerVideoContainer.appendChild(video);
  playerVideo = video;
  els.player = video;

  // Audio caché
  const audio = document.createElement('audio');
  audio.id = 'studio-player-audio';
  audio.className = 'studio-player';
  audio.preload = 'auto';
  audioBlobUrl = wavBytes
    ? URL.createObjectURL(new Blob([wavBytes], { type: 'audio/wav' }))
    : videoBlobUrl;
  audio.src = audioBlobUrl;
  audio.crossOrigin = 'anonymous';
  audio.controls = false;
  els.playerAudioContainer.appendChild(audio);
  playerAudio = audio;
  els.playerAudio = audio;

  bindMediaEvents(video, audio);
  setAudioVolume();

  return { video, audio };
}
```

### 6.8 Toggle pistes séparées / mix original

Ajouter dans la sidebar droite, au-dessus de la liste des stems :

```html
<div class="studio-stems-mode">
  <button id="studio-stems-mode-toggle" type="button">Écouter le mix original</button>
</div>
```

```js
function bindStemsModeToggle() {
  if (!els.stemsModeToggle) return;
  els.stemsModeToggle.addEventListener('click', () => {
    useStemsMode = !useStemsMode;
    updateStemsModeUI();
    // Si en lecture, basculer immédiatement
    if (isPlaying) {
      play();
    }
  });
}

function updateStemsModeUI() {
  if (!els.stemsModeToggle) return;
  els.stemsModeToggle.textContent = useStemsMode
    ? 'Écouter le mix original'
    : 'Écouter les pistes séparées';
  els.stemsModeToggle.disabled = !mixer?.hasStems();
}
```

Appeler `updateStemsModeUI()` dans `refreshStems()`.

### 6.9 Volume et mute

Dans `bindPlayer` :

```js
els.volume?.addEventListener('input', () => {
  const db = Number(els.volume.value);
  const masterLabel = document.getElementById('studio-volume-label');
  if (masterLabel) masterLabel.textContent = formatDb(db);
  setAudioVolume();
  if (pitchGainNode) {
    const now = studioAudioCtx?.currentTime || 0;
    pitchGainNode.gain.setTargetAtTime(dbToGain(db), now, 0.05);
  }
  mixer?.setMasterVolume(db);
});
```

### 6.10 Transposition

```js
async function runPitchShift() {
  if (!currentTrack) return;
  if (!regionConfirmed) return; // verrou région
  if (!isAudioReady) {
    pendingTranspose = transpose;
    return;
  }

  const useStems = mixer?.hasStems() && useStemsMode;
  if (useStems) {
    mixer.setDetune(transpose);
    if (els.transposeStatus) {
      els.transposeStatus.textContent = transpose !== 0
        ? `Transposé : ${transpose > 0 ? '+' : ''}${transpose} demi-tons`
        : '';
    }
    return;
  }

  ensureStudioAudioContext();
  if (!studioAudioCtx) return;

  if (transpose === 0) {
    if (pitchShifter) {
      try { pitchShifter.clear(); } catch (_) {}
      try { pitchShifter.disconnect(); } catch (_) {}
      pitchShifter = null;
    }
  }

  await ensurePlayerRouted();

  if (pitchShifter) {
    pitchShifter.setPitch(transpose);
  }

  pendingTranspose = 0;

  if (els.transposeStatus) {
    els.transposeStatus.textContent = transpose !== 0
      ? `Transposé : ${transpose > 0 ? '+' : ''}${transpose} demi-tons`
      : '';
  }
}
```

### 6.11 Gestion du stem-mixer

Dans `stem-mixer.js`, conserver l'approche actuelle mais s'assurer que `setDetune(0)` appelle `clear()` avant d'appliquer le pitch neutre (déjà fait partiellement).

### 6.12 CSS

Ajouter dans `src/style.css` :

```css
.studio-player-wrap {
  position: relative;
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #000;
  border-radius: var(--radius-sm);
  overflow: hidden;
  min-height: 0;
}

.studio-video-container,
.studio-audio-container,
.studio-video-container video,
.studio-audio-container audio {
  max-width: 100%;
  max-height: 100%;
  width: 100%;
  height: 100%;
  display: block;
}

.studio-audio-container {
  position: absolute;
  width: 0;
  height: 0;
  overflow: hidden;
  opacity: 0;
  pointer-events: none;
}

.studio-audio-backdrop {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  background: radial-gradient(circle at 30% 30%, var(--accent-soft) 0%, var(--bg) 60%);
  color: var(--text);
  text-align: center;
  padding: 24px;
  z-index: 2;
  pointer-events: none;
}
```

---

## 6.13 Commit associé

```
7a27af8 Studio: réarchitecture du pipeline audio (vidéo visible + audio caché)
acc82fa Synth: clamper les fréquences des oscillateurs pour éviter le warning Web Audio
```

---

## 7. Fichiers modifiés (réellement)

1. `src/index.html` — séparation en `#studio-video-container` + `#studio-audio-container` + toggle stems.
2. `src/style.css` — styles des deux conteneurs + bouton toggle stems.
3. `src/ui/studio-tab.js` — réarchitecture complète (deux players, synchro, toggle stems, loadTrack).
4. `src/audio/simple-synth.js` — `clampOscFrequency()` + garde MIDI 0–127.

---

## 8. Tests à valider

1. **MP3** : import → waveform → Play → son sort.
2. **MP4** : import → image + son synchronisés → Play → son sort, image suit.
3. **Seek** : clic waveform → audio et vidéo se repositionnent ensemble.
4. **Région** : sélection + confirmation → transposition active.
5. **Transposition +2** : son transposé, tempo inchangé.
6. **Transposition retour 0** : son normal, pas de craquement.
7. **Track séparé** : toggle "Pistes séparées / Mix original" fonctionne instantanément.
8. **Séparation Demucs manquante** : pas de crash audio.
9. **Aucun buzz MIDI** au Play.
