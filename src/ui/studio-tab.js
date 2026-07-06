import {
  ensureStudioDir,
  getNextTrackId,
  createTrackDir,
  saveOriginal,
  saveMetadata,
  loadMetadata,
  listTracks,
  readOriginalAsBlobUrl,
  readAllStemsAsBlobUrls,
} from '../recorder/studio-storage.js';
import { createStemMixer, dbToGain } from '../audio/stem-mixer.js';
import { separateStems, getStems, STEMS } from '../audio/stem-separator.js';
import { createPitchShifter } from '../audio/pitch-shifter.js';

let mixer = null;
let currentTrack = null;
let currentBlobUrl = null;
let isPlaying = false;
let updateInterval = null;
let tracks = [];

// [OpenCode] — 2026-07-04 — État transposition / waveform de l’onglet Studio
let transpose = 0;
let audioWavPath = null;
let waveformData = null;
let originalStemsBlobUrls = null;
let originalStemsPaths = null;
let regionStart = 0;
let regionEnd = null;
let regionConfirmed = false;
let isDraggingHandle = null;
let isAudioOnly = false;
let mediaDuration = 0;
let isAudioReady = false;
let pendingTranspose = 0;

// Réarchitecture audio : deux players (vidéo visible + audio caché)
let playerVideo = null;
let playerAudio = null;
let audioBlobUrl = null;
let videoBlobUrl = null;
let useStemsMode = false; // false = mix original, true = pistes séparées
let syncRafId = null;
let lastSyncTime = 0;

// AudioContext partagé pour le Studio (évite les doubles contextes et preserve la qualité)
let studioAudioCtx = null;
let studioDestination = null;
let pitchSourceNode = null;
let pitchGainNode = null;
let pitchShifter = null;
let playerSourceCreated = false;

const els = {
  importBtn: document.getElementById('studio-import-btn'),
  trackList: document.getElementById('studio-track-list'),
  playerWrap: document.getElementById('studio-player-wrap'),
  playerVideoContainer: document.getElementById('studio-video-container'),
  playerAudioContainer: document.getElementById('studio-audio-container'),
  player: null,        // référence au <video> visible (UI/timing)
  playerAudio: null,   // référence au <audio> caché (son)
  audioBackdrop: document.getElementById('studio-audio-backdrop'),
  backdropTitle: document.getElementById('studio-backdrop-title'),
  stemsMode: document.getElementById('studio-stems-mode'),
  stemsModeToggle: document.getElementById('studio-stems-mode-toggle'),
  playBtn: document.getElementById('studio-play-btn'),
  stopBtn: document.getElementById('studio-stop-btn'),
  prevBtn: document.getElementById('studio-prev-btn'),
  progress: document.getElementById('studio-progress'),
  time: document.getElementById('studio-time'),
  volume: document.getElementById('studio-volume'),
  transposeControl: document.getElementById('studio-transpose-control'),
  transposeInput: document.getElementById('studio-transpose'),
  transposeMinus: document.getElementById('studio-transpose-minus'),
  transposePlus: document.getElementById('studio-transpose-plus'),
  separateBtn: document.getElementById('studio-separate-btn'),
  separateStatus: document.getElementById('studio-separate-status'),
  stemsList: document.getElementById('studio-stems-list'),
  waveformWrap: document.getElementById('studio-waveform-wrap'),
  waveform: document.getElementById('studio-waveform'),
  region: document.getElementById('studio-region'),
  playhead: document.getElementById('studio-playhead'),
  handleStart: document.getElementById('studio-handle-start'),
  handleEnd: document.getElementById('studio-handle-end'),
  regionInfo: document.getElementById('studio-region-info'),
  resetRegionBtn: document.getElementById('studio-reset-region'),
  confirmRegionBtn: document.getElementById('studio-confirm-region'),
  backRegionBtn: document.getElementById('studio-back-region'),
  transposeStatus: document.getElementById('studio-transpose-status'),
};

function formatDuration(seconds) {
  if (!seconds || isNaN(seconds)) return '00:00';
  const total = Math.floor(Number(seconds));
  const mins = String(Math.floor(total / 60)).padStart(2, '0');
  const secs = String(total % 60).padStart(2, '0');
  return `${mins}:${secs}`;
}

function setStatus(message) {
  const statusBar = document.getElementById('status-bar');
  if (statusBar) statusBar.textContent = message;
}

function setTransposeControlsEnabled(enabled) {
  if (els.transposeInput) els.transposeInput.disabled = !enabled;
  if (els.transposeMinus) els.transposeMinus.disabled = !enabled;
  if (els.transposePlus) els.transposePlus.disabled = !enabled;
}

export function initStudioTab() {
  mixer = createStemMixer();
  mixer.setOnProgress((current, duration) => {
    updateProgressUI(current, duration);
  });

  bindPlayer();
  bindStems();
  bindStemsModeToggle();
  bindWaveform();
  bindCropButtons();
  refreshTrackList();

  document.addEventListener('app-switch-tab', (e) => {
    if (e.detail?.tab === 'studio') refreshTrackList();
  });
}

function bindPlayer() {
  els.importBtn?.addEventListener('click', () => importFile());

  els.playBtn?.addEventListener('click', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (isPlaying) pause();
    else await play();
  });

  // Raccourci Espace global dédié au transport Studio.
  // Le clavier virtuel est filtré dans virtual-keyboard.js pour ignorer Space.
  document.addEventListener('keydown', (e) => {
    if (e.code !== 'Space') return;
    if (['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(e.target?.tagName)) return;
    if (!currentTrack) return;
    e.preventDefault();
    e.stopPropagation();
    if (isPlaying) pause();
    else play();
  });

  els.stopBtn?.addEventListener('click', () => stop());

  els.prevBtn?.addEventListener('click', () => {
    const target = regionConfirmed ? regionStart : 0;
    seek(target);
    updateProgressUI(0, getEffectiveDuration());
  });

  els.resetRegionBtn?.addEventListener('click', () => resetRegion());

  els.progress?.addEventListener('input', () => {
    const duration = getEffectiveDuration();
    const time = regionConfirmed
      ? regionStart + (Number(els.progress.value) / 100) * (regionEnd - regionStart)
      : (Number(els.progress.value) / 100) * duration;
    seek(time);
  });

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

  function updateTransposeUI() {
    if (els.transposeInput) els.transposeInput.value = String(transpose);
  }

  function onTransposeChanged() {
    if (!regionConfirmed) {
      // Ignorer les changements de transposition tant que la région n'est pas confirmée.
      updateTransposeUI();
      return;
    }
    transpose = Number(els.transposeInput?.value) || 0;
    updateTransposeUI();
    runPitchShift();
  }

  if (!els.transposeMinus || !els.transposePlus || !els.transposeInput) {
    console.error('[Studio] Transpose controls not found:', {
      minus: !!els.transposeMinus,
      plus: !!els.transposePlus,
      input: !!els.transposeInput,
    });
  }

  els.transposeInput?.addEventListener('change', onTransposeChanged);

  els.transposeMinus?.addEventListener('click', () => {
    if (!regionConfirmed) return;
    transpose = Math.max(-12, transpose - 1);
    updateTransposeUI();
    runPitchShift();
  });
  els.transposePlus?.addEventListener('click', () => {
    if (!regionConfirmed) return;
    transpose = Math.min(12, transpose + 1);
    updateTransposeUI();
    runPitchShift();
  });

  // Les événements media sont attachés dynamiquement à chaque nouvel élément.
  // Voir createMediaPlayer().
}

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

    // Boucle région stricte : on repositionne l'audio sans forcer de re-render.
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
    if (now - lastSyncTime < 100) return;
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

function bindStems() {
  els.separateBtn?.addEventListener('click', () => runSeparation());
}

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
  els.stemsModeToggle.classList.toggle('active', useStemsMode);
  if (els.stemsMode) {
    els.stemsMode.style.display = mixer?.hasStems() ? '' : 'none';
  }
}

const MAX_REGION_DURATION = 210; // 3min30 en secondes

function setCropControlsEnabled(enabled) {
  if (els.separateBtn) els.separateBtn.disabled = !enabled;
  console.log('[Studio] separate enabled:', enabled);
}

function updateCropButtons() {
  if (!els.confirmRegionBtn || !els.backRegionBtn) return;
  if (regionConfirmed) {
    els.confirmRegionBtn.style.display = 'none';
    els.backRegionBtn.style.display = 'inline-flex';
  } else if (regionEnd !== null) {
    els.confirmRegionBtn.style.display = 'inline-flex';
    els.backRegionBtn.style.display = 'none';
  } else {
    els.confirmRegionBtn.style.display = 'none';
    els.backRegionBtn.style.display = 'none';
  }
}

function confirmRegion() {
  if (regionEnd === null) return;
  regionConfirmed = true;
  renderWaveform();
  updateCropButtons();
  setCropControlsEnabled(true);
  setTransposeControlsEnabled(true);
  updateRegionUI();
  // Applique la transposition si elle a été modifiée pendant que les contrôles étaient verrouillés.
  if (transpose !== 0) runPitchShift();
}

function backRegion() {
  regionConfirmed = false;
  renderWaveform();
  updateCropButtons();
  setCropControlsEnabled(false);
  setTransposeControlsEnabled(false);
  updateRegionUI();
  // On remet la transposition à 0 quand on sort du mode région confirmée.
  if (transpose !== 0) {
    transpose = 0;
    updateTransposeUI();
    runPitchShift();
  }
}

function resetRegion() {
  regionStart = 0;
  regionEnd = null;
  regionConfirmed = false;
  renderWaveform();
  updateRegionUI();
  updateCropButtons();
  setCropControlsEnabled(false);
  setTransposeControlsEnabled(false);
  if (transpose !== 0) {
    transpose = 0;
    updateTransposeUI();
    runPitchShift();
  }
}

function bindWaveform() {
  if (!els.waveformWrap) return;

  const wrap = els.waveformWrap;
  let dragStartX = 0;
  let dragStartRegionStart = 0;
  let dragStartRegionEnd = null;
  let isDraggingRegion = false;

  wrap.addEventListener('mousedown', (e) => {
    if (e.ctrlKey || e.metaKey) {
      const rect = wrap.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const duration = waveformData?.duration || els.playerAudio?.duration || els.player?.duration || 0;
      if (!duration) return;
      const time = (x / rect.width) * duration;
      if (regionEnd === null) return;
      if (time < regionStart || time > regionEnd) return;
      isDraggingRegion = true;
      dragStartX = e.clientX;
      dragStartRegionStart = regionStart;
      dragStartRegionEnd = regionEnd;
      return;
    }

    const rect = wrap.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const startX = getHandleX(regionStart);
    const endX = regionEnd !== null ? getHandleX(regionEnd) : rect.width;

    if (Math.abs(x - startX) < 10) {
      isDraggingHandle = 'start';
    } else if (Math.abs(x - endX) < 10) {
      isDraggingHandle = 'end';
    } else {
      isDraggingHandle = null;
      const duration = waveformData?.duration || els.playerAudio?.duration || els.player?.duration || 0;
      if (duration) {
        let time;
        if (regionConfirmed) {
          // Clic dans la région zoomée : la largeur du canvas représente la région.
          const regionWidth = rect.width;
          time = regionStart + (x / regionWidth) * (regionEnd - regionStart);
          time = Math.max(regionStart, Math.min(time, regionEnd));
        } else {
          time = (x / rect.width) * duration;
          if (regionEnd !== null) {
            time = Math.max(regionStart, Math.min(time, regionEnd));
          }
        }
        seek(time);
      }
    }
  });

  window.addEventListener('mousemove', (e) => {
    if (regionConfirmed) return;
    if (!waveformData) return;
    const rect = els.waveformWrap.getBoundingClientRect();
    const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
    const duration = waveformData.duration;
    const time = (x / rect.width) * duration;

    if (isDraggingRegion) {
      const dx = e.clientX - dragStartX;
      const dt = (dx / rect.width) * duration;
      let newStart = dragStartRegionStart + dt;
      let newEnd = dragStartRegionEnd + dt;
      if (newStart < 0) { newEnd -= newStart; newStart = 0; }
      if (newEnd > duration) { newStart -= newEnd - duration; newEnd = duration; }
      if (newEnd - newStart > MAX_REGION_DURATION) {
        if (dt > 0) newEnd = newStart + MAX_REGION_DURATION;
        else newStart = newEnd - MAX_REGION_DURATION;
      }
      if (newStart >= 0 && newEnd <= duration && (newEnd - newStart) <= MAX_REGION_DURATION) {
        regionStart = newStart;
        regionEnd = newEnd;
      }
      updateRegionUI();
      return;
    }

    if (!isDraggingHandle) return;
    if (isDraggingHandle === 'start') {
      regionStart = Math.max(0, Math.min(time, regionEnd !== null ? regionEnd : duration));
      if (regionEnd !== null && (regionEnd - regionStart) > MAX_REGION_DURATION) {
        regionStart = regionEnd - MAX_REGION_DURATION;
      }
    } else if (isDraggingHandle === 'end') {
      regionEnd = Math.min(duration, Math.max(time, regionStart));
      if ((regionEnd - regionStart) > MAX_REGION_DURATION) {
        regionEnd = regionStart + MAX_REGION_DURATION;
      }
    }
    updateRegionUI();
    updateCropButtons();
  });

  window.addEventListener('mouseup', () => {
    if (regionConfirmed) return;
    if (isDraggingHandle) {
      isDraggingHandle = null;
      if (regionConfirmed && transpose !== 0) runPitchShift();
    }
    if (isDraggingRegion) {
      isDraggingRegion = false;
      if (regionConfirmed && transpose !== 0) runPitchShift();
    }
  });

  wrap.addEventListener('dblclick', () => {
    if (!regionConfirmed) resetRegion();
  });
}

function getHandleX(time) {
  if (!els.waveformWrap || !waveformData) return 0;
  const rect = els.waveformWrap.getBoundingClientRect();
  const duration = waveformData.duration || 1;
  return (time / duration) * rect.width;
}

function updateRegionUI() {
  if (!els.region || !els.handleStart || !els.handleEnd || !waveformData) return;
  const rect = els.waveformWrap.getBoundingClientRect();
  const duration = waveformData.duration;
  const startX = getHandleX(regionStart);
  const endX = regionEnd !== null ? getHandleX(regionEnd) : rect.width;
  els.region.style.left = `${startX}px`;
  els.region.style.width = `${Math.max(0, endX - startX)}px`;

  if (regionConfirmed) {
    els.handleStart.style.display = 'none';
    els.handleEnd.style.display = 'none';
    els.region.style.pointerEvents = 'none';
  } else {
    els.handleStart.style.display = '';
    els.handleEnd.style.display = '';
    els.handleStart.style.left = `${Math.max(0, startX - 4)}px`;
    els.handleEnd.style.left = `${Math.max(0, endX - 4)}px`;
    els.region.style.pointerEvents = '';
  }

  const regionDuration = regionEnd !== null ? regionEnd - regionStart : duration;
  const isMaxed = regionEnd !== null && regionDuration >= MAX_REGION_DURATION;
  els.region.classList.toggle('studio-region-maxed', isMaxed);
  els.handleStart.classList.toggle('studio-handle-maxed', isMaxed);
  els.handleEnd.classList.toggle('studio-handle-maxed', isMaxed);

  if (els.regionInfo) {
    const endText = regionEnd !== null ? formatDuration(regionEnd) : formatDuration(duration);
      const infoText = regionEnd !== null
      ? `Région : ${formatDuration(regionStart)} – ${endText}${isMaxed ? ' (max 3:30)' : ''}`
      : 'Sélectionnez une région pour activer transpo / séparation';
    els.regionInfo.textContent = infoText;
  }
}

function updatePlayhead(current, duration) {
  if (!els.playhead || !duration) return;
  const x = (current / duration) * els.waveformWrap.getBoundingClientRect().width;
  els.playhead.style.left = `${x}px`;
}

function bindCropButtons() {
  els.confirmRegionBtn?.addEventListener('click', () => confirmRegion());
  els.backRegionBtn?.addEventListener('click', () => backRegion());
}

async function importFile() {
  if (!window.electronAPI?.files) {
    setStatus('Import disponible uniquement sous Electron');
    return;
  }

  try {
    const filePath = await window.electronAPI.studio.selectFile();
    if (!filePath) return;

    // Choix manuel du type de source : tutoriel pédagogique ou morceau/performance.
    const sourceType = await askSourceType();
    if (!sourceType) return;

    setStatus(`Import de ${filePath}...`);
    const trackId = await getNextTrackId();
    await createTrackDir(trackId);

    const bytes = await window.electronAPI.files.readBinary(filePath);
    const originalPath = await saveOriginal(trackId, filePath, bytes);
    const name = filePath.split('/').pop() || filePath.split('\\').pop() || filePath;
    await saveMetadata(trackId, {
      name,
      sourcePath: filePath,
      originalPath,
      sourceType,
      duration: 0,
      importedAt: new Date().toISOString(),
    });

    await refreshTrackList();
    await loadTrack(trackId);
    setStatus(`Morceau importé : ${name}`);
  } catch (err) {
    console.error('Import failed:', err);
    setStatus(`Erreur d'import : ${err.message}`);
  }
}

function askSourceType() {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.style.zIndex = '3000';
    overlay.innerHTML = `
      <div class="modal-box" style="max-width: 420px; text-align: center;">
        <h3>Type d'import</h3>
        <p class="modal-hint">Comment classer ce fichier pour l'analyse ?</p>
        <div class="modal-actions" style="flex-direction: column; gap: 10px; margin-top: 16px;">
          <button type="button" class="primary" id="import-type-tutorial">Tutoriel pédagogique</button>
          <button type="button" class="secondary" id="import-type-cover">Morceau à étudier</button>
          <button type="button" class="secondary" id="import-type-cancel">Annuler</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    overlay.querySelector('#import-type-tutorial').addEventListener('click', () => {
      document.body.removeChild(overlay);
      resolve('tutorial');
    });
    overlay.querySelector('#import-type-cover').addEventListener('click', () => {
      document.body.removeChild(overlay);
      resolve('cover');
    });
    overlay.querySelector('#import-type-cancel').addEventListener('click', () => {
      document.body.removeChild(overlay);
      resolve(null);
    });
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        document.body.removeChild(overlay);
        resolve(null);
      }
    });
  });
}

async function refreshTrackList() {
  if (!els.trackList) return;
  try {
    tracks = await listTracks();
    renderTrackList(tracks);
  } catch (err) {
    console.error('Failed to list tracks:', err);
    els.trackList.innerHTML = `<p class="detail-hint">Impossible de charger les morceaux.</p>`;
  }
}

function renderTrackList(tracks) {
  if (!els.trackList) return;
  els.trackList.innerHTML = '';

  if (tracks.length === 0) {
    els.trackList.innerHTML = `<p class="detail-hint">Aucun morceau importé.</p>`;
    return;
  }

  for (const track of tracks) {
    const item = document.createElement('div');
    item.className = 'studio-track-item';
    if (currentTrack && currentTrack.id === track.id) item.classList.add('active');

    const metadata = track.metadata || {};
    const displayName = metadata.name || track.id;
    const source = metadata.sourcePath ? metadata.sourcePath.split('/').pop() || metadata.sourcePath.split('\\').pop() : track.id;
    item.innerHTML = `
      <div class="studio-track-name">${escapeHtml(displayName)}</div>
      <div class="studio-track-meta">${escapeHtml(source)} · ${formatDuration(metadata.duration || 0)}</div>
    `;
    item.addEventListener('click', () => loadTrack(track.id));
    els.trackList.appendChild(item);
  }
}

function updateAudioBackdrop(title) {
  if (!els.audioBackdrop || !els.backdropTitle) return;
  if (isAudioOnly) {
    els.audioBackdrop.style.display = 'flex';
    els.backdropTitle.textContent = title || 'Fichier audio';
  } else {
    els.audioBackdrop.style.display = 'none';
    els.backdropTitle.textContent = '';
  }
}

function inspectMedia(blobUrl) {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.src = blobUrl;
    video.onloadedmetadata = () => {
      const hasVideo = video.videoWidth > 0 && video.videoHeight > 0;
      resolve({ isAudioOnly: !hasVideo, duration: video.duration || 0 });
    };
    video.onerror = () => resolve({ isAudioOnly: false, duration: 0 });
  });
}

function ensureStudioAudioContext() {
  if (studioAudioCtx) return studioAudioCtx;
  studioAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
  studioDestination = studioAudioCtx.createGain();
  studioDestination.connect(studioAudioCtx.destination);
  return studioAudioCtx;
}

function resetTransposeState() {
  transpose = 0;
  if (els.transposeInput) els.transposeInput.value = '0';
  if (mixer?.hasStems()) mixer.setDetune(0);
  // On garde le mixer actif (les stems peuvent être réutilisés), mais on
  // s'assure qu'aucun pitch-shift n'est appliqué à transposition 0.
  disconnectPitchShifter();
  regionStart = 0;
  regionEnd = null;
  regionConfirmed = false;
  updateCropButtons();
  updateRegionUI();
  if (els.transposeStatus) els.transposeStatus.textContent = '';
  // Transposition et séparation verrouillées jusqu'à confirmation région.
  setTransposeControlsEnabled(false);
  setCropControlsEnabled(false);
}

function disconnectPitchShifter() {
  if (pitchShifter) {
    try { pitchShifter.clear(); } catch (_) {}
    try { pitchShifter.disconnect(); } catch (_) {}
    pitchShifter = null;
  }
  if (pitchSourceNode) {
    try { pitchSourceNode.disconnect(); } catch (_) {}
    // NE PAS mettre pitchSourceNode = null : un seul MediaElementSourceNode possible
    // par élément media. La source reste attachée à l'ancien élément.
  }
}

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

function setAudioVolume() {
  if (!playerAudio) return;
  const db = Number(els.volume?.value) || 0;
  playerAudio.volume = dbToGain(db);
}

function setPlayerMuted() {
  if (!playerAudio) return;
  // Quand on passe par Web Audio (pitch-shift ou stems), on coupe la sortie native.
  playerAudio.muted = true;
  playerAudio.volume = 0;
}

function setPlayerAudible() {
  if (!playerAudio) return;
  const db = Number(els.volume?.value) || 0;
  playerAudio.muted = false;
  playerAudio.volume = dbToGain(db);
}

function getEffectiveDuration() {
  if (regionConfirmed && regionEnd !== null) {
    return Math.max(0.01, regionEnd - regionStart);
  }
  return els.playerAudio?.duration || els.player?.duration || waveformData?.duration || mediaDuration || 0;
}

function getEffectiveCurrentTime() {
  if (regionConfirmed && regionEnd !== null) {
    return Math.max(0, els.playerAudio.currentTime - regionStart);
  }
  return els.playerAudio?.currentTime || els.player?.currentTime || 0;
}

function storeOriginalStems(blobUrls, paths) {
  originalStemsBlobUrls = blobUrls;
  originalStemsPaths = paths;
}

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

    // Fallback : si pas de WAV, createMediaPlayer utilisera le blob original comme audio.
    if (!wavBytes) {
      wavBytes = null;
    }

    // Créer les players (vidéo visible + audio caché)
    await createMediaPlayer(originalBlobUrl, wavBytes, !isAudioOnly);
    updateAudioBackdrop(metadata?.name || trackId);

    if (currentBlobUrl) {
      // Différer la révocation pour éviter les races avec le player précédent.
      const revoked = currentBlobUrl;
      setTimeout(() => URL.revokeObjectURL(revoked), 5000);
    }
    currentBlobUrl = originalBlobUrl;

    resetTransposeState();
    isAudioReady = false;
    pendingTranspose = 0;

    const onAudioReady = async () => {
      if (isAudioReady) return;
      isAudioReady = true;
      // Le fichier est décodé : on établit le routage audio pour qu'il soit prêt au Play.
      ensureStudioAudioContext();
      await ensurePlayerRouted();
      if (pendingTranspose !== 0 || transpose !== 0) {
        await runPitchShift();
      }
    };
    playerAudio?.addEventListener('canplaythrough', onAudioReady, { once: true });
    playerAudio?.addEventListener('loadedmetadata', onAudioReady, { once: true });
    playerAudio?.addEventListener('loadeddata', onAudioReady, { once: true });

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
    updateRegionUI();
    updateCropButtons();
    setCropControlsEnabled(false);

    await refreshTrackList();
    await refreshStems();
    setStatus(`Morceau chargé : ${metadata?.name || trackId}`);
  } catch (err) {
    console.error('Failed to load track:', err);
    setStatus(`Erreur de chargement : ${err.message}`);
  }
}

function renderWaveform() {
  if (!els.waveform || !waveformData) return;
  const canvas = els.waveform;
  const wrap = els.waveformWrap;
  const rect = wrap.getBoundingClientRect();
  canvas.width = Math.max(1, Math.floor(rect.width));
  canvas.height = Math.max(1, Math.floor(rect.height));
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  const center = h / 2;

  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--text') || '#1f2937';

  let peaks = waveformData.peaks || [];
  if (peaks.length === 0) return;

  // Crop visuel : si région confirmée, on ne dessine que la zone sélectionnée
  if (regionConfirmed && regionEnd !== null && waveformData.duration) {
    const totalDuration = waveformData.duration;
    const startIdx = Math.floor((regionStart / totalDuration) * peaks.length);
    const endIdx = Math.floor((regionEnd / totalDuration) * peaks.length);
    peaks = peaks.slice(startIdx, endIdx);
    canvas.dataset.regionStart = String(regionStart);
    canvas.dataset.regionEnd = String(regionEnd);
  } else {
    delete canvas.dataset.regionStart;
    delete canvas.dataset.regionEnd;
  }

  const step = Math.max(1, w / peaks.length);
  for (let i = 0; i < peaks.length; i++) {
    const amp = peaks[i] * center * 0.95;
    const x = i * step;
    ctx.fillRect(x, center - amp, Math.max(1, step - 0.5), amp * 2);
  }
}

async function ensurePlayerRouted() {
  if (!playerAudio || !studioAudioCtx) return;

  if (!pitchGainNode) {
    pitchGainNode = studioAudioCtx.createGain();
    const db = Number(els.volume?.value) || 0;
    pitchGainNode.gain.setValueAtTime(dbToGain(db), studioAudioCtx.currentTime);
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

async function runPitchShift() {
  if (!currentTrack) return;

  // Transposition interdite tant que la région n'est pas confirmée.
  if (!regionConfirmed) return;

  // Attendre que le fichier audio soit prêt avant d'appliquer du pitch-shifting.
  if (!isAudioReady) {
    pendingTranspose = transpose;
    return;
  }

  const useStems = mixer?.hasStems() && useStemsMode;
  if (useStems) {
    // Transposition temps réel sur chaque stem individuellement
    try {
      mixer.setDetune(transpose);
      if (els.transposeStatus) {
        els.transposeStatus.textContent = transpose !== 0
          ? `Transposé : ${transpose > 0 ? '+' : ''}${transpose} demi-tons`
          : '';
      }
    } catch (err) {
      console.error('[Studio] setDetune failed:', err);
      if (els.transposeStatus) els.transposeStatus.textContent = 'Erreur transposition stems';
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

function clampToRegion(time) {
  if (regionEnd === null) return time;
  return Math.max(regionStart, Math.min(time, regionEnd));
}

export async function play() {
  if (!playerAudio?.src) return;

  // Si le fichier n'est pas encore prêt, on attend canplay puis on rejoue.
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
    // Web Audio : transposition active sur la région confirmée.
    ensureStudioAudioContext();
    if (studioAudioCtx?.state === 'suspended') {
      try { await studioAudioCtx.resume(); } catch (_) {}
    }
    setPlayerMuted();
    await ensurePlayerRouted();
    if (!pitchShifter) await runPitchShift();
    if (pitchShifter) pitchShifter.setPitch(transpose);
  } else {
    // Sortie native de meilleure qualité, sans passer par Web Audio.
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
  if (playerAudio?.paused) return; // déjà en pause, ne pas reseeker
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

function updateProgressUI(current, duration) {
  if (!els.progress || !els.time) return;
  const pct = duration ? (current / duration) * 100 : 0;
  els.progress.value = Math.max(0, Math.min(100, pct));
  els.time.textContent = `${formatDuration(current)} / ${formatDuration(duration)}`;
}

function startUpdateLoop() {
  // Déprécié : la mise à jour est maintenant pilotée par l'événement natif
  // 'timeupdate' de l'élément audio pour éviter les conflits d'état UI.
  stopUpdateLoop();
}

function stopUpdateLoop() {
  if (updateInterval) {
    clearInterval(updateInterval);
    updateInterval = null;
  }
}

async function refreshStems() {
  if (!currentTrack) {
    renderStems({});
    updateStemsModeUI();
    return;
  }
  const stemPaths = await getStems(currentTrack.id);
  const blobUrls = await readAllStemsAsBlobUrls(currentTrack.id);
  renderStems(stemPaths);

  const hasStems = Object.values(stemPaths).some(Boolean);
  updateSeparateButton(hasStems);
  if (hasStems) {
    storeOriginalStems(blobUrls, stemPaths);
    await mixer.loadStems(blobUrls);
    if (useStemsMode) {
      setPlayerMuted();
      if (transpose !== 0) mixer.setDetune(transpose);
    } else {
      setPlayerAudible();
    }
  } else {
    mixer.reset();
    setPlayerAudible();
    storeOriginalStems(null, null);
    useStemsMode = false;
  }
  updateStemsModeUI();
}

function updateSeparateButton(hasStems) {
  if (!els.separateBtn) return;
  if (hasStems) {
    els.separateBtn.textContent = 'Réanalyser le fichier';
    els.separateBtn.classList.add('studio-separate-done');
  } else {
    els.separateBtn.textContent = 'Séparer les pistes';
    els.separateBtn.classList.remove('studio-separate-done');
  }
  els.separateBtn.disabled = !regionConfirmed;
}

function renderStems(stemPaths) {
  if (!els.stemsList) return;
  els.stemsList.innerHTML = '';

  const labels = {
    bass: 'Basse',
    drums: 'Batterie',
    vocals: 'Voix',
    other: 'Autres',
    piano: 'Piano',
  };

  const mixerState = mixer?.getState?.() || {};

  for (const stem of STEMS) {
    const path = stemPaths[stem];
    const row = document.createElement('div');
    row.className = 'studio-stem-row';

    const name = document.createElement('div');
    name.className = 'studio-stem-name';
    name.textContent = labels[stem];

    const s = mixerState[stem] || { muted: false, solo: false, volumeDb: 0 };

    const muteBtn = document.createElement('button');
    muteBtn.textContent = 'M';
    muteBtn.title = 'Mute';
    muteBtn.className = 'studio-stem-btn';
    if (s.muted) muteBtn.classList.add('active');
    muteBtn.addEventListener('click', () => {
      const muted = !muteBtn.classList.contains('active');
      muteBtn.classList.toggle('active', muted);
      mixer?.setMute(stem, muted);
    });

    const soloBtn = document.createElement('button');
    soloBtn.textContent = 'S';
    soloBtn.title = 'Solo';
    soloBtn.className = 'studio-stem-btn';
    if (s.solo) soloBtn.classList.add('active');
    soloBtn.addEventListener('click', () => {
      const soloed = !soloBtn.classList.contains('active');
      soloBtn.classList.toggle('active', soloed);
      mixer?.setSolo(stem, soloed);
    });

    const volumeWrap = document.createElement('div');
    volumeWrap.className = 'studio-stem-volume-wrap';

    const volume = document.createElement('input');
    volume.type = 'range';
    volume.min = '-60';
    volume.max = '6';
    volume.step = '1';
    volume.value = String(s.volumeDb);
    volume.className = 'studio-stem-volume';
    volume.addEventListener('input', () => {
      const db = Number(volume.value);
      label.textContent = formatDb(db);
      mixer?.setVolume(stem, db);
    });

    const label = document.createElement('span');
    label.className = 'studio-stem-volume-label';
    label.textContent = formatDb(s.volumeDb);

    volumeWrap.appendChild(volume);
    volumeWrap.appendChild(label);

    if (!path) {
      row.classList.add('studio-stem-missing');
      muteBtn.disabled = true;
      soloBtn.disabled = true;
      volume.disabled = true;
    }

    row.appendChild(name);
    row.appendChild(muteBtn);
    row.appendChild(soloBtn);
    row.appendChild(volumeWrap);
    els.stemsList.appendChild(row);
  }
}

function formatDb(db) {
  if (db <= -60) return '-∞ dB';
  return `${db > 0 ? '+' : ''}${db} dB`;
}

async function getRegionTrimmedPath() {
  if (regionEnd === null || !currentBlobUrl || !currentTrack) return currentTrack.metadata?.originalPath;
  try {
    setStatus('Découpage de la région audio...');
    const response = await fetch(currentBlobUrl);
    const arrayBuffer = await response.arrayBuffer();
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
    const sampleRate = audioBuffer.sampleRate;
    const startSample = Math.floor(regionStart * sampleRate);
    const endSample = Math.floor(regionEnd * sampleRate);
    const length = endSample - startSample;
    if (length <= 0) return currentTrack.metadata?.originalPath;

    const offlineCtx = new OfflineAudioContext(audioBuffer.numberOfChannels, length, sampleRate);
    const buffer = offlineCtx.createBuffer(audioBuffer.numberOfChannels, length, sampleRate);
    for (let ch = 0; ch < audioBuffer.numberOfChannels; ch++) {
      const chanData = audioBuffer.getChannelData(ch);
      buffer.copyToChannel(chanData.slice(startSample, endSample), ch);
    }
    const src = offlineCtx.createBufferSource();
    src.buffer = buffer;
    src.connect(offlineCtx.destination);
    src.start(0);
    const rendered = await offlineCtx.startRendering();

    const wavBytes = encodeWav(rendered);
    const homeDir = await window.electronAPI.files.homeDir();
    const tempDir = `${homeDir}/PianoJazzChords/Studio/temp`;
    await window.electronAPI.files.ensureDir(tempDir);
    const tempPath = `${tempDir}/${currentTrack.id}_region_${Date.now()}.wav`;
    await window.electronAPI.files.writeBinary(tempPath, wavBytes);
    return tempPath;
  } catch (err) {
    console.warn('[Studio] Region trim failed, using original:', err);
    setStatus('Découpage impossible, utilisation du fichier entier');
    return currentTrack.metadata?.originalPath;
  }
}

function encodeWav(audioBuffer) {
  const numChannels = audioBuffer.numberOfChannels;
  const sampleRate = audioBuffer.sampleRate;
  const bitDepth = 16;
  const bytesPerSample = bitDepth / 8;
  const blockAlign = numChannels * bytesPerSample;
  const data = [];
  for (let i = 0; i < audioBuffer.length; i++) {
    for (let ch = 0; ch < numChannels; ch++) {
      const s = Math.max(-1, Math.min(1, audioBuffer.getChannelData(ch)[i]));
      const v = s < 0 ? s * 0x8000 : s * 0x7FFF;
      data.push(v & 0xFF);
      data.push((v >> 8) & 0xFF);
    }
  }
  const dataSize = data.length;
  const buf = new ArrayBuffer(44 + dataSize);
  const v = new DataView(buf);
  function ws(offset, str) { for (let i = 0; i < str.length; i++) v.setUint8(offset + i, str.charCodeAt(i)); }
  ws(0, 'RIFF'); v.setUint32(4, 36 + dataSize, true);
  ws(8, 'WAVE'); ws(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true);
  v.setUint16(22, numChannels, true); v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * blockAlign, true); v.setUint16(32, blockAlign, true);
  v.setUint16(34, bitDepth, true); ws(36, 'data');
  v.setUint32(40, dataSize, true);
  const u8 = new Uint8Array(buf);
  for (let i = 0; i < dataSize; i++) u8[44 + i] = data[i];
  return Array.from(u8);
}

async function runSeparation() {
  if (!currentTrack) {
    setStatus('Aucun morceau sélectionné');
    return;
  }
  if (!window.electronAPI?.studio?.separate) {
    setStatus('Séparation non disponible en mode navigateur');
    return;
  }

  let tempPath = null;
  try {
    els.separateBtn.disabled = true;
    els.separateStatus.textContent = 'Séparation en cours...';
    const originalPath = await getRegionTrimmedPath();
    if (originalPath !== currentTrack.metadata?.originalPath) tempPath = originalPath;
    const result = await separateStems(
      currentTrack.id,
      originalPath,
      (percent) => {
        els.separateStatus.textContent = `Séparation en cours : ${Math.round(percent)}%`;
      },
    );

    // Ne re-router l'audio que si la séparation a réussi (succès explicite ou simulation).
    const succeeded = result && (result.success === true || result.simulated === true || Object.values(result).some(Boolean));
    if (!succeeded) {
      throw new Error('La séparation n\'a retourné aucune piste');
    }

    els.separateStatus.textContent = result.simulated ? 'Pistes simulées (Demucs non installé)' : 'Séparation terminée';
    await refreshStems();
    setStatus(result.simulated ? 'Pistes simulées créées' : 'Pistes séparées');
  } catch (err) {
    console.error('Separation failed:', err);
    els.separateStatus.textContent = `Erreur : ${err.message}`;
    setStatus(`Erreur de séparation : ${err.message}`);
    // Protection AudioContext : on ne touche PAS au routage principal en cas d'erreur.
  } finally {
    els.separateBtn.disabled = false;
    if (tempPath) window.electronAPI.files.deleteFile(tempPath).catch(() => {});
  }
}

export function switchToStudioTab() {
  document.dispatchEvent(new CustomEvent('app-switch-tab', { detail: { tab: 'studio' } }));
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
