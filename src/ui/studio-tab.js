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

/**
 * Lit un fichier audio via IPC et retourne un ArrayBuffer brut.
 * Évite fetch(blob:) qui est bloqué par la Content Security Policy d'Electron.
 */
async function readAudioFile(path) {
  if (!window.electronAPI?.files?.readBinary) {
    throw new Error('readBinary IPC non disponible');
  }
  const bytes = await window.electronAPI.files.readBinary(path);
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

let mixer = null;
let currentBlobUrl = null;
let isPlaying = false;
let updateInterval = null;
let tracks = [];
let currentTrack = null;

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
let isLoadingTrack = false;

// UX Studio en 3 étapes : 1=ciblage, 2=traitement, 3=lecture pro
let studioStage = 1;
let isProcessing = false;
let processingJobId = null;
let pendingRegion = null;

// Réarchitecture audio : deux players (vidéo visible + audio caché)
let playerVideo = null;
let playerAudio = null;
let audioBlobUrl = null;
let videoBlobUrl = null;
let syncRafId = null;

// Lecteur master : buffer audio natif du fichier original (MP3/MP4/M4A…)
// utilisé à l'Étape 1 avant que les stems soient séparés.
let masterPlayer = null;
let masterAudioBuffer = null;
let masterAudioUrl = null;

// AudioContext partagé pour le Studio
let studioAudioCtx = null;
let studioDestination = null;

const els = {
  importBtn: document.getElementById('studio-import-btn'),
  trackList: document.getElementById('studio-track-list'),
  studioCenter: document.querySelector('.studio-center'),
  playerWrap: document.getElementById('studio-player-wrap'),
  playerVideoContainer: document.getElementById('studio-video-container'),
  playerAudioContainer: document.getElementById('studio-audio-container'),
  player: null,        // référence au <video> visible (UI/timing)
  playerAudio: null,   // référence au <audio> caché (son)
  audioBackdrop: document.getElementById('studio-audio-backdrop'),
  backdropTitle: document.getElementById('studio-backdrop-title'),
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
  stageOverlay: document.getElementById('studio-stage-overlay'),
  processingOverlay: document.getElementById('studio-processing-overlay'),
  processingLabel: document.getElementById('studio-processing-label'),
  processingBar: document.getElementById('studio-processing-bar'),
  readyToast: document.getElementById('studio-ready-toast'),
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

function updateTransposeUI() {
  if (els.transposeInput) els.transposeInput.value = String(transpose);
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
  ensureStudioAudioContext();
  mixer = createStemMixer(studioAudioCtx, readAudioFile);
  mixer.setOnProgress((current, duration) => {
    updateProgressUI(current, duration);
  });

  bindPlayer();
  bindStems();
  bindWaveform();
  bindCropButtons();
  refreshTrackList();
  updateStudioStage(0);

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
    if (isLoadingTrack) return;
    const db = Number(els.volume.value);
    const masterLabel = document.getElementById('studio-volume-label');
    if (masterLabel) masterLabel.textContent = formatDb(db);
    if (pitchGainNode) {
      const now = studioAudioCtx?.currentTime || 0;
      pitchGainNode.gain.setTargetAtTime(dbToGain(db), now, 0.05);
    }
    mixer?.setMasterVolume(db);
  });

  function onTransposeChanged() {
    if (isLoadingTrack || !regionConfirmed) {
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
    if (isLoadingTrack || !regionConfirmed) return;
    transpose = Math.max(-12, transpose - 1);
    updateTransposeUI();
    runPitchShift();
  });
  els.transposePlus?.addEventListener('click', () => {
    if (isLoadingTrack || !regionConfirmed) return;
    transpose = Math.min(12, transpose + 1);
    updateTransposeUI();
    runPitchShift();
  });

  // Les événements media sont attachés dynamiquement à chaque nouvel élément.
  // Voir createMediaPlayer().
}

let mediaEventCleanup = null;

// [Claude] — 2026-07-06 — La synchronisation est maintenant pilotée par le temps
// de l'AudioContext. Le HTMLVideoElement est muet et calé explicitement, sans
// modification de playbackRate.
let lastReportedAudioTime = 0;

function bindMediaEvents(video, audio) {
  if (mediaEventCleanup) {
    try { mediaEventCleanup(); } catch (_) {}
  }
  if (!video || !audio) {
    mediaEventCleanup = null;
    return;
  }

  const onAudioSeeked = () => {
    if (Math.abs(video.currentTime - audio.currentTime) > 0.05) {
      video.currentTime = audio.currentTime;
    }
  };
  const onAudioEnded = () => {
    video.pause();
    stopSyncLoop();
  };
  const onVideoSeeked = () => {
    audio.currentTime = video.currentTime;
  };

  audio.addEventListener('seeked', onAudioSeeked);
  audio.addEventListener('ended', onAudioEnded);
  video.addEventListener('seeked', onVideoSeeked);

  mediaEventCleanup = () => {
    audio.removeEventListener('seeked', onAudioSeeked);
    audio.removeEventListener('ended', onAudioEnded);
    video.removeEventListener('seeked', onVideoSeeked);
  };
}

function getStudioCurrentTime() {
  if (mixer?.hasStems()) {
    return mixer.getCurrentTime();
  }
  return masterPlayer?.getCurrentTime?.()
    || playerAudio?.currentTime
    || playerVideo?.currentTime
    || 0;
}

function getStudioDuration() {
  if (mixer?.hasStems()) {
    return mixer.getDuration();
  }
  return getEffectiveDuration();
}

function syncVideoAndCursor() {
  if (!playerVideo) return;
  const current = getStudioCurrentTime();

  // Boucle région stricte
  if (regionEnd !== null && current >= regionEnd) {
    const target = regionStart;
    if (mixer?.hasStems()) {
      mixer.seek(target);
    } else {
      masterPlayer?.seek(target);
    }
    playerVideo.currentTime = target;
    return;
  }

  const drift = current - playerVideo.currentTime;
  const absDrift = Math.abs(drift);

  // Saut brutal uniquement si la vidéo est très décalée ou si elle est en pause.
  if (absDrift > 0.25 || playerVideo.paused) {
    playerVideo.currentTime = current;
    if (!playerVideo.paused) playerVideo.playbackRate = 1.0;
  } else if (absDrift > 0.05) {
    // Rattrapage progressif par playbackRate (max ±4 %) pour rester fluide.
    const rate = Math.max(0.96, Math.min(1.04, 1.0 + drift * 0.5));
    playerVideo.playbackRate = Number.isFinite(rate) ? rate : 1.0;
  } else {
    playerVideo.playbackRate = 1.0;
  }

  const duration = getStudioDuration();
  updateProgressUI(current, duration);
  updatePlayhead(current, duration);
}

function startSyncLoop() {
  stopSyncLoop();
  const loop = () => {
    syncRafId = requestAnimationFrame(loop);
    syncVideoAndCursor();
  };
  loop();
}

function stopSyncLoop() {
  if (syncRafId) {
    cancelAnimationFrame(syncRafId);
    syncRafId = null;
  }
}

function bindStems() {
  els.separateBtn?.addEventListener('click', () => runSeparation());
}

// [Claude] — 2026-07-06 — Le mode hybride et son toggle ont été supprimés.
// Les stems sont toujours chargés dans l'AudioContext partagé quand disponibles.

const MAX_REGION_DURATION = 300; // 5 minutes maximum

function setCropControlsEnabled(enabled) {
  if (els.separateBtn) els.separateBtn.disabled = !enabled;
  console.log('[Studio] separate enabled:', enabled);
}

function updateCropButtons() {
  if (!els.confirmRegionBtn || !els.backRegionBtn) return;
  if (regionConfirmed) {
    els.confirmRegionBtn.style.display = 'none';
    els.confirmRegionBtn.disabled = true;
    els.backRegionBtn.style.display = 'inline-flex';
  } else if (regionEnd !== null) {
    els.confirmRegionBtn.style.display = 'inline-flex';
    els.confirmRegionBtn.disabled = false;
    els.backRegionBtn.style.display = 'none';
  } else {
    els.confirmRegionBtn.style.display = 'inline-flex';
    els.confirmRegionBtn.disabled = true;
    els.backRegionBtn.style.display = 'none';
  }
}

function confirmRegion() {
  if (regionEnd === null) return;
  // Lancer le traitement asynchrone de la région (extraction + séparation en tâche de fond)
  startRegionProcessing();
}

function backRegion() {
  regionConfirmed = false;
  renderWaveform();
  updateCropButtons();
  setCropControlsEnabled(false);
  setTransposeControlsEnabled(false);
  updateRegionUI();
  updateStudioStage(1);
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
  updateStudioStage(1);
  if (transpose !== 0) {
    transpose = 0;
    updateTransposeUI();
    runPitchShift();
  }
}

export async function resetStudioState() {
  stop();
  mixer?.reset();
  resetRegion();
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
      if (regionEnd !== null && time > regionEnd) {
        // Inversion de poignée : l'utilisateur a traîné le début au-delà de la fin.
        regionStart = regionEnd;
        regionEnd = Math.min(duration, time);
        isDraggingHandle = 'end';
      } else {
        regionStart = Math.max(0, Math.min(time, regionEnd !== null ? regionEnd : duration));
        if (regionEnd !== null && (regionEnd - regionStart) > MAX_REGION_DURATION) {
          regionStart = regionEnd - MAX_REGION_DURATION;
        }
      }
    } else if (isDraggingHandle === 'end') {
      if (time < regionStart) {
        // Inversion de poignée : l'utilisateur a traîné la fin avant le début.
        regionEnd = regionStart;
        regionStart = Math.max(0, time);
        isDraggingHandle = 'start';
      } else {
        regionEnd = Math.min(duration, Math.max(time, regionStart));
        if ((regionEnd - regionStart) > MAX_REGION_DURATION) {
          regionEnd = regionStart + MAX_REGION_DURATION;
        }
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
      ? `Région : ${formatDuration(regionStart)} – ${endText}${isMaxed ? ' (max 5:00)' : ''}`
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

const SUPPORTED_FORMATS = ['mp3', 'wav', 'm4a', 'mp4'];

function getFileExtension(filePath) {
  const match = filePath.match(/\.([a-zA-Z0-9]+)$/);
  return match ? match[1].toLowerCase() : '';
}

function isSupportedFormat(filePath) {
  return SUPPORTED_FORMATS.includes(getFileExtension(filePath));
}

async function importFile() {
  if (!window.electronAPI?.files) {
    setStatus('Import disponible uniquement sous Electron');
    return;
  }

  try {
    const filePath = await window.electronAPI.studio.selectFile();
    if (!filePath) return;

    if (!isSupportedFormat(filePath)) {
      setStatus('Format non supporté');
      alert(`Format non supporté\n\nFormats acceptés : ${SUPPORTED_FORMATS.join(', ').toUpperCase()}`);
      return;
    }

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
    // Charger les métadonnées pour chaque piste afin d'afficher le vrai nom de fichier.
    const enriched = await Promise.all(tracks.map(async (track) => {
      try {
        const metadata = await loadMetadata(track.id);
        return { ...track, metadata };
      } catch (e) {
        return track;
      }
    }));
    renderTrackList(enriched);
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
  studioAudioCtx = mixer?.getAudioContext?.() || new (window.AudioContext || window.webkitAudioContext)();
  studioDestination = studioAudioCtx.createGain();
  studioDestination.connect(studioAudioCtx.destination);
  return studioAudioCtx;
}

function resetTransposeState() {
  transpose = 0;
  if (els.transposeInput) els.transposeInput.value = '0';
  if (mixer?.hasStems()) mixer.setDetune(0);
  regionStart = 0;
  regionEnd = null;
  regionConfirmed = false;
  updateCropButtons();
  updateRegionUI();
  if (els.transposeStatus) els.transposeStatus.textContent = '';
  setTransposeControlsEnabled(false);
  setCropControlsEnabled(false);
}

/**
 * Lecteur mono-buffer utilisé à l'Étape 1 (fichier original non séparé).
 * Joue un AudioBuffer décodé nativement dans l'AudioContext partagé.
 */
function createMasterPlayer(audioCtx, destination, buffer) {
  let sourceNode = null;
  let pitchShifter = null;
  let gainNode = null;
  let currentTime = 0;
  let playStartCtxTime = 0;
  let isPlaying = false;
  let currentPitch = 0;
  let duration = buffer?.duration || 0;

  async function ensurePitch() {
    if (pitchShifter) return;
    if (!gainNode) {
      gainNode = audioCtx.createGain();
      gainNode.connect(destination);
    }
    pitchShifter = await createPitchShifter(audioCtx, gainNode, currentPitch);
  }

  function disconnectSource() {
    if (sourceNode) {
      try { sourceNode.stop?.(); } catch (_) {}
      try { sourceNode.disconnect(); } catch (_) {}
      sourceNode = null;
    }
  }

  function play(offset = null) {
    if (!buffer || !audioCtx) return;
    if (audioCtx.state === 'suspended') {
      audioCtx.resume().catch(() => {});
    }
    disconnectSource();

    const startOffset = offset !== null ? offset : currentTime;
    currentTime = startOffset;
    playStartCtxTime = audioCtx.currentTime;
    isPlaying = true;

    const src = audioCtx.createBufferSource();
    src.buffer = buffer;
    src.playbackRate.value = 1.0;

    if (!gainNode) {
      gainNode = audioCtx.createGain();
      gainNode.connect(destination);
    }

    if (currentPitch !== 0) {
      ensurePitch().then(() => {
        if (!isPlaying || sourceNode !== src) return;
        src.connect(pitchShifter.node);
        src.start(0, startOffset);
      }).catch((err) => console.warn('[MasterPlayer] pitch setup failed:', err));
    } else {
      src.connect(gainNode);
      src.start(0, startOffset);
    }

    sourceNode = src;
  }

  function pause() {
    if (!isPlaying) return;
    currentTime = getCurrentTime();
    isPlaying = false;
    disconnectSource();
  }

  function stop() {
    disconnectSource();
    isPlaying = false;
    currentTime = 0;
  }

  function seek(time) {
    currentTime = Math.max(0, time);
    if (isPlaying) play(currentTime);
  }

  function getCurrentTime() {
    if (!audioCtx) return 0;
    if (isPlaying) {
      const elapsed = audioCtx.currentTime - playStartCtxTime;
      return Math.min(duration, currentTime + elapsed);
    }
    return currentTime;
  }

  async function setPitch(semitones) {
    currentPitch = semitones;
    if (isPlaying) {
      currentTime = getCurrentTime();
      if (semitones !== 0) {
        await ensurePitch();
      }
      play(currentTime);
    } else if (semitones !== 0) {
      await ensurePitch();
    }
  }

  function setVolume(db) {
    if (gainNode) {
      gainNode.gain.setTargetAtTime(dbToGain(db), audioCtx.currentTime, 0.05);
    }
  }

  return {
    play,
    pause,
    stop,
    seek,
    getCurrentTime,
    getDuration: () => duration,
    setPitch,
    setVolume,
  };
}

async function decodeMasterAudio(path) {
  try {
    const arrayBuffer = await readAudioFile(path);
    ensureStudioAudioContext();
    return await studioAudioCtx.decodeAudioData(arrayBuffer);
  } catch (err) {
    console.warn('[Studio] decodeMasterAudio failed:', err);
    return null;
  }
}

function destroyMediaPlayer() {
  masterPlayer?.stop();
  masterPlayer = null;
  masterAudioBuffer = null;
  if (masterAudioUrl) {
    URL.revokeObjectURL(masterAudioUrl);
    masterAudioUrl = null;
  }
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
  els.player = null;
  els.playerAudio = null;
}

async function createMediaPlayer(videoBlobUrl, wavPath, wavBytes, isVideo) {
  destroyMediaPlayer();

  // --- Vidéo visible (image seule, muette) ---
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

  // --- Audio caché : timing / metadata de secours ---
  const audio = document.createElement('audio');
  audio.id = 'studio-player-audio';
  audio.className = 'studio-player';
  audio.preload = 'metadata';
  audioBlobUrl = wavBytes
    ? URL.createObjectURL(new Blob([wavBytes], { type: 'audio/wav' }))
    : videoBlobUrl;
  audio.src = audioBlobUrl;
  audio.controls = false;
  audio.muted = true;
  audio.volume = 0;
  if (!audioBlobUrl.startsWith('blob:')) {
    audio.crossOrigin = 'anonymous';
  }
  els.playerAudioContainer.appendChild(audio);
  playerAudio = audio;
  els.playerAudio = audio;

  bindMediaEvents(video, audio);

  // Décoder le WAV extrait en AudioBuffer natif pour un playback fiable
  // quel que soit le conteneur d'origine (MP3, MP4, M4A…).
  masterAudioUrl = audioBlobUrl;
  const decodePath = wavPath || (audioBlobUrl.startsWith('blob:') ? null : audioBlobUrl);
  if (decodePath) {
    masterAudioBuffer = await decodeMasterAudio(decodePath);
    if (masterAudioBuffer) {
      masterPlayer = createMasterPlayer(studioAudioCtx, studioDestination, masterAudioBuffer);
      const db = Number(els.volume?.value) || 0;
      masterPlayer.setVolume(db);
    }
  }

  return { video, audio };
}

function getEffectiveDuration() {
  // Dès qu'une région est tracée (même non confirmée), la timeline se cale sur elle.
  if (regionEnd !== null) {
    return Math.max(0.01, regionEnd - regionStart);
  }
  return mixer?.getDuration?.()
    || masterPlayer?.getDuration?.()
    || els.playerAudio?.duration
    || els.player?.duration
    || waveformData?.duration
    || mediaDuration
    || 0;
}

function getEffectiveCurrentTime() {
  const current = getStudioCurrentTime();
  if (regionEnd !== null) {
    return Math.max(0, Math.min(regionEnd - regionStart, current - regionStart));
  }
  return current;
}

function storeOriginalStems(blobUrls, paths) {
  originalStemsBlobUrls = blobUrls;
  originalStemsPaths = paths;
}

function updateStudioStage(stage) {
  studioStage = stage;
  const tab = document.getElementById('studio-tab');
  if (tab) {
    tab.classList.remove('stage-0', 'stage-1', 'stage-2', 'stage-3');
    tab.classList.add(`stage-${stage}`);
  }

  if (els.stageOverlay) {
    els.stageOverlay.style.display = stage === 1 ? 'flex' : 'none';
  }
  if (els.processingOverlay) {
    els.processingOverlay.style.display = stage === 2 ? 'flex' : 'none';
  }
  if (els.readyToast) {
    els.readyToast.style.display = 'none';
  }

  // Stage 0 : aucun morceau sélectionné. Seule la liste de tracks est visible.
  const stage0 = stage === 0;
  if (els.playerWrap) els.playerWrap.style.display = stage0 ? 'none' : '';
  if (els.waveformWrap) els.waveformWrap.style.display = stage0 ? 'none' : '';
  if (els.regionInfo) els.regionInfo.style.display = stage0 ? 'none' : '';
  if (els.studioCenter) els.studioCenter.style.display = stage0 ? 'none' : '';

  // Stage 1 : seuls la waveform, le play et la sélection de région sont actifs.
  const stage1Locked = stage === 1;
  setTransposeControlsEnabled(!stage1Locked && regionConfirmed && !stage0 && !isLoadingTrack);
  if (els.playBtn) els.playBtn.disabled = isLoadingTrack;
  if (els.stopBtn) els.stopBtn.disabled = isLoadingTrack;
  if (els.prevBtn) els.prevBtn.disabled = isLoadingTrack;
  if (els.separateBtn) els.separateBtn.disabled = stage1Locked || !regionConfirmed || stage0 || isLoadingTrack;
  if (els.stemsList) els.stemsList.style.display = (stage1Locked || stage0) ? 'none' : '';
  if (els.separateStatus) els.separateStatus.style.display = (stage1Locked || stage0) ? 'none' : '';

  if (stage === 3) {
    showReadyToast();
  }
}

function setLoadingState(loading) {
  isLoadingTrack = loading;
  updateStudioStage(studioStage);
  if (els.processingLabel) els.processingLabel.textContent = loading ? 'Chargement du morceau...' : '';
  if (els.processingBar) els.processingBar.style.width = loading ? '30%' : '0%';
  if (els.processingOverlay) {
    els.processingOverlay.style.display = loading ? 'flex' : (studioStage === 2 ? 'flex' : 'none');
  }
}

function showReadyToast() {
  if (!els.readyToast) return;
  els.readyToast.style.display = 'block';
  setTimeout(() => {
    if (els.readyToast) els.readyToast.style.display = 'none';
  }, 4000);
}

function setProcessingProgress(label, percent) {
  if (els.processingLabel) els.processingLabel.textContent = label;
  if (els.processingBar) {
    els.processingBar.style.width = `${Math.max(0, Math.min(100, percent))}%`;
  }
}

async function startRegionProcessing() {
  if (!currentTrack || regionEnd === null) return;

  // Isolation du blocage : pause audio automatique pendant le traitement.
  pause();

  regionConfirmed = true;
  pendingRegion = { start: regionStart, end: regionEnd };
  updateStudioStage(2);
  renderWaveform();
  updateCropButtons();
  updateRegionUI();

  const jobId = `job_${Date.now()}`;
  processingJobId = jobId;
  isProcessing = true;

  try {
    // 1. Extraire la région audio (WAV) pour Demucs
    setProcessingProgress('Découpage de la région audio...', 10);
    const regionPath = await getRegionTrimmedPath();

    // 2. Sauvegarder la région dans les métadonnées
    await saveMetadata(currentTrack.id, {
      ...currentTrack.metadata,
      region: { start: regionStart, end: regionEnd, confirmed: true, trimmedPath: regionPath },
    });

    setProcessingProgress('Extraction audio terminée', 30);

    // 3. Séparation des pistes en arrière-plan (non bloquant pour l'UI)
    setProcessingProgress('Séparation des pistes en cours...', 35);
    const originalPath = currentTrack.metadata?.originalPath;
    const separationResult = await separateStems(
      currentTrack.id,
      regionPath || originalPath,
      (percent, fallback) => {
        if (processingJobId !== jobId) return;
        const normalized = fallback ? Math.min(95, 35 + percent * 0.6) : 35 + percent * 0.6;
        setProcessingProgress('Séparation des pistes en cours...', normalized);
      },
    );

    await refreshStems();

    if (processingJobId !== jobId) return;

    setProcessingProgress(separationResult.simulated ? 'Pistes simulées prêtes' : 'Pistes séparées', 100);
    setStatus(separationResult.simulated
      ? `Pistes simulées créées pour ${currentTrack.metadata?.name || currentTrack.id}`
      : `Pistes séparées pour ${currentTrack.metadata?.name || currentTrack.id}`);

    finishRegionProcessing(true);
  } catch (err) {
    console.error('[Studio] Region processing failed:', err);
    if (processingJobId !== jobId) return;
    setProcessingProgress(`Erreur : ${err.message}`, 0);
    setStatus(`Erreur de préparation : ${err.message}`);
    finishRegionProcessing(false);
  }
}

function finishRegionProcessing(success) {
  isProcessing = false;
  processingJobId = null;
  if (success) {
    updateStudioStage(3);
    setTransposeControlsEnabled(true);
    setCropControlsEnabled(true);
    if (transpose !== 0) runPitchShift();
  } else {
    updateStudioStage(1);
    regionConfirmed = false;
    updateCropButtons();
  }
}

function cancelRegionProcessing() {
  if (!isProcessing) return;
  processingJobId = null;
  isProcessing = false;
  updateStudioStage(1);
  regionConfirmed = false;
  updateCropButtons();
  setStatus('Préparation annulée');
}

export async function loadTrack(trackId) {
  if (isLoadingTrack) return;
  try {
    setLoadingState(true);
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
    await createMediaPlayer(originalBlobUrl, wavPath, wavBytes, !isAudioOnly);
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
      // On ne crée PAS de MediaElementSourceNode au chargement : cela couperait
      // définitivement la sortie native. On route vers WebAudio seulement au moment
      // où une transposition est réellement demandée.
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

    // Restaurer la région persistée si elle existe et est confirmée
    if (metadata?.region?.confirmed) {
      regionStart = metadata.region.start;
      regionEnd = metadata.region.end;
      regionConfirmed = true;
      renderWaveform();
      updateRegionUI();
      updateCropButtons();
      // Si les stems existent déjà, on passe directement à l'étape 3
      const stemPaths = await getStems(trackId);
      const hasStems = Object.values(stemPaths).some(Boolean);
      if (hasStems) {
        updateStudioStage(3);
        setTransposeControlsEnabled(true);
        setCropControlsEnabled(true);
      } else {
        updateStudioStage(1);
      }
    } else {
      updateStudioStage(1);
    }

    await refreshTrackList();
    await refreshStems();
    setStatus(`Morceau chargé : ${metadata?.name || trackId}`);
  } catch (err) {
    console.error('Failed to load track:', err);
    setStatus(`Erreur de chargement : ${err.message}`);
  } finally {
    setLoadingState(false);
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


function updateProgressUI(current, duration) {
  if (!els.progress || !els.time) return;
  const pct = duration ? (current / duration) * 100 : 0;
  els.progress.value = Math.max(0, Math.min(100, pct));
  els.time.textContent = `${formatDuration(current)} / ${formatDuration(duration)}`;
}


async function runPitchShift() {
  if (!currentTrack) return;

  // Transposition interdite tant que la région n'est pas confirmée.
  if (!regionConfirmed) return;

  const hasStems = mixer?.hasStems();
  if (hasStems) {
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

  // Sans stems (fallback Étape 1) : pitch-shift sur le lecteur master buffer.
  if (masterPlayer) {
    await masterPlayer.setPitch(transpose);
    if (els.transposeStatus) {
      els.transposeStatus.textContent = transpose !== 0
        ? `Transposé : ${transpose > 0 ? '+' : ''}${transpose} demi-tons`
        : '';
    }
  }
}

export async function play() {
  if (isLoadingTrack) return;
  if (!mixer?.hasStems() && !masterPlayer) return;

  ensureStudioAudioContext();
  if (studioAudioCtx?.state === 'suspended') {
    try { await studioAudioCtx.resume(); } catch (_) {}
  }

  const rawTime = getStudioCurrentTime() || 0;
  const resumeTime = regionConfirmed ? Math.max(regionStart, Math.min(rawTime, regionEnd)) : rawTime;

  if (mixer?.hasStems()) {
    mixer.seek(resumeTime);
    mixer.play();
    if (transpose !== 0) mixer.setDetune(transpose);
  } else if (masterPlayer) {
    masterPlayer.seek(resumeTime);
    masterPlayer.play();
    if (transpose !== 0) await masterPlayer.setPitch(transpose);
  }

  if (playerVideo) {
    playerVideo.currentTime = resumeTime;
    playerVideo.play().catch(() => {});
  }

  isPlaying = true;
  if (els.playBtn) els.playBtn.textContent = '⏸';
  startSyncLoop();
}

export function pause() {
  if (isLoadingTrack) return;
  if (mixer?.hasStems()) {
    mixer.pause();
  } else {
    masterPlayer?.pause();
  }
  if (playerVideo) {
    playerVideo.pause();
    playerVideo.playbackRate = 1.0;
  }
  isPlaying = false;
  if (els.playBtn) els.playBtn.textContent = '▶';
  stopSyncLoop();
}

export function stop() {
  if (isLoadingTrack) return;
  mixer?.stop();
  masterPlayer?.stop();
  if (playerVideo) playerVideo.currentTime = regionConfirmed ? regionStart : 0;
  isPlaying = false;
  if (els.playBtn) els.playBtn.textContent = '▶';
  updateProgressUI(0, getEffectiveDuration());
  stopSyncLoop();
}

function clampToRegion(time) {
  if (regionEnd === null) return time;
  return Math.max(regionStart, Math.min(time, regionEnd));
}

function seek(time) {
  if (isLoadingTrack) return;
  const clamped = clampToRegion(time);
  if (playerVideo) playerVideo.currentTime = clamped;
  if (mixer?.hasStems()) {
    mixer.seek(clamped);
  } else {
    masterPlayer?.seek(clamped);
  }
}

async function refreshStems() {
  if (!currentTrack) {
    renderStems({});
    return;
  }
  const stemPaths = await getStems(currentTrack.id);
  const blobUrls = await readAllStemsAsBlobUrls(currentTrack.id);
  renderStems(stemPaths);

  const hasStems = Object.values(stemPaths).some(Boolean);
  updateSeparateButton(hasStems);
  if (hasStems) {
    storeOriginalStems(blobUrls, stemPaths);
    await mixer.loadStems(stemPaths);
    if (transpose !== 0) mixer.setDetune(transpose);
    // Si la région était déjà confirmée, on passe automatiquement à l'étape 3
    if (regionConfirmed && studioStage !== 3) {
      updateStudioStage(3);
      setTransposeControlsEnabled(true);
      setCropControlsEnabled(true);
    }
  } else {
    mixer.reset();
    storeOriginalStems(null, null);
  }
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
      if (isLoadingTrack) return;
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
      if (isLoadingTrack) return;
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
      if (isLoadingTrack) return;
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
  if (regionEnd === null || !currentTrack) return currentTrack.metadata?.originalPath;
  try {
    setStatus('Découpage de la région audio...');
    const sourcePath = audioWavPath || currentTrack.metadata?.originalPath;
    if (!sourcePath) return currentTrack.metadata?.originalPath;

    if (window.electronAPI?.studio?.trimRegion) {
      const tempPath = await window.electronAPI.studio.trimRegion(
        currentTrack.id,
        sourcePath,
        regionStart,
        regionEnd,
      );
      return tempPath;
    }
    return currentTrack.metadata?.originalPath;
  } catch (err) {
    console.warn('[Studio] Region trim failed, using original:', err);
    setStatus('Découpage impossible, utilisation du fichier entier');
    return currentTrack.metadata?.originalPath;
  }
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
