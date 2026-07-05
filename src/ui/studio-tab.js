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

let onMidiEvent = null;
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
  player: document.getElementById('studio-player'),
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

export function initStudioTab({ feedMidiEvent } = {}) {
  onMidiEvent = feedMidiEvent;
  mixer = createStemMixer();
  mixer.setOnProgress((current, duration) => {
    updateProgressUI(current, duration);
  });

  bindPlayer();
  bindStems();
  bindWaveform();
  bindCropButtons();
  refreshTrackList();

  document.addEventListener('app-switch-tab', (e) => {
    if (e.detail?.tab === 'studio') refreshTrackList();
  });
}

function bindPlayer() {
  els.importBtn?.addEventListener('click', () => importFile());

  els.playBtn?.addEventListener('click', () => {
    if (isPlaying) pause();
    else play();
  });

  els.stopBtn?.addEventListener('click', () => stop());

  els.prevBtn?.addEventListener('click', () => {
    seek(0);
    updateProgressUI(0, els.player?.duration || 0);
  });

  els.resetRegionBtn?.addEventListener('click', () => resetRegion());

  els.progress?.addEventListener('input', () => {
    const duration = els.player?.duration || waveformData?.duration || 0;
    const time = (Number(els.progress.value) / 100) * duration;
    seek(time);
  });

  els.volume?.addEventListener('input', () => {
    const db = Number(els.volume.value);
    const masterLabel = document.getElementById('studio-volume-label');
    if (masterLabel) masterLabel.textContent = formatDb(db);
    setPlayerMuted();
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

  els.transposeInput?.addEventListener('input', onTransposeChanged);
  els.transposeInput?.addEventListener('change', onTransposeChanged);

  els.transposeMinus?.addEventListener('click', () => {
    transpose = Math.max(-12, transpose - 1);
    updateTransposeUI();
    runPitchShift();
  });
  els.transposePlus?.addEventListener('click', () => {
    transpose = Math.min(12, transpose + 1);
    updateTransposeUI();
    runPitchShift();
  });

  els.player?.addEventListener('play', () => {
    isPlaying = true;
    els.playBtn.textContent = '⏸';
  });

  els.player?.addEventListener('pause', () => {
    isPlaying = false;
    els.playBtn.textContent = '▶';
  });

  els.player?.addEventListener('ended', () => {
    isPlaying = false;
    els.playBtn.textContent = '▶';
  });

  els.player?.addEventListener('timeupdate', () => {
    if (els.player) {
      updateProgressUI(els.player.currentTime, els.player.duration);
      updatePlayhead(els.player.currentTime, els.player.duration);
    }
  });
}

function bindStems() {
  els.separateBtn?.addEventListener('click', () => runSeparation());
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
  updateRegionUI();
}

function backRegion() {
  regionConfirmed = false;
  renderWaveform();
  updateCropButtons();
  setCropControlsEnabled(false);
  updateRegionUI();
}

function resetRegion() {
  regionStart = 0;
  regionEnd = null;
  regionConfirmed = false;
  renderWaveform();
  updateRegionUI();
  updateCropButtons();
  setCropControlsEnabled(false);
  if (transpose !== 0) runPitchShift();
}

function bindWaveform() {
  if (!els.waveformWrap) return;

  const wrap = els.waveformWrap;
  let dragStartX = 0;
  let dragStartRegionStart = 0;
  let dragStartRegionEnd = null;
  let isDraggingRegion = false;

  wrap.addEventListener('mousedown', (e) => {
    if (regionConfirmed) return;

    if (e.ctrlKey || e.metaKey) {
      const rect = wrap.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const duration = waveformData?.duration || els.player?.duration || 0;
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
      const duration = waveformData?.duration || els.player?.duration || 0;
      if (duration) {
        let time = (x / rect.width) * duration;
        if (regionEnd !== null) {
          time = Math.max(regionStart, Math.min(time, regionEnd));
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
      if (transpose !== 0) runPitchShift();
    }
    if (isDraggingRegion) {
      isDraggingRegion = false;
      if (transpose !== 0) runPitchShift();
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
    els.regionInfo.textContent = `Région : ${formatDuration(regionStart)} – ${endText}${isMaxed ? ' (max 3:30)' : ''}`;
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
  disconnectPitchShifter();
  regionStart = 0;
  regionEnd = null;
  regionConfirmed = false;
  updateCropButtons();
  updateRegionUI();
  if (els.transposeStatus) els.transposeStatus.textContent = '';
  setTransposeControlsEnabled(true);
  setCropControlsEnabled(false);
}

function disconnectPitchShifter() {
  if (pitchShifter) {
    try { pitchShifter.disconnect(); } catch (_) {}
    pitchShifter = null;
  }
  if (pitchSourceNode) {
    try { pitchSourceNode.disconnect(); } catch (_) {}
    pitchSourceNode = null;
  }
  playerSourceCreated = false;
}

function setPlayerMuted() {
  if (!els.player) return;
  // The visible player is always the timing reference.
  // Audio output goes through stem mixer or pitchCtx only.
  els.player.muted = true;
  els.player.volume = 0;
}

function setPlayerAudible() {
  if (!els.player) return;
  const db = Number(els.volume?.value) || 0;
  els.player.muted = false;
  els.player.volume = dbToGain(db);
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

    const blobUrl = await readOriginalAsBlobUrl(trackId);
    if (!blobUrl) {
      setStatus('Fichier original introuvable');
      return;
    }

    if (currentBlobUrl) URL.revokeObjectURL(currentBlobUrl);
    currentBlobUrl = blobUrl;

    resetTransposeState();
    regionConfirmed = false;
    updateCropButtons();

    els.player.src = blobUrl;
    els.player.load();
    setPlayerMuted();

    const info = await inspectMedia(blobUrl);
    isAudioOnly = info.isAudioOnly;
    mediaDuration = info.duration || 0;
    updateAudioBackdrop(metadata?.name || trackId);

    // Extract audio and generate waveform
    if (window.electronAPI?.studio?.extractAudio && window.electronAPI?.studio?.generateWaveform) {
      setStatus('Analyse audio en cours...');
      try {
        const wavPath = await window.electronAPI.studio.extractAudio(trackId, metadata?.originalPath);
        audioWavPath = wavPath;
        waveformData = await window.electronAPI.studio.generateWaveform(wavPath);
        renderWaveform();
        updateRegionUI();
        updateCropButtons();
        setCropControlsEnabled(false);
        setStatus(`Morceau chargé : ${metadata?.name || trackId}`);
      } catch (err) {
        console.warn('[Studio] waveform extraction failed:', err);
        audioWavPath = null;
        waveformData = null;
        setStatus(`Morceau chargé (waveform indisponible) : ${metadata?.name || trackId}`);
      }
    }

    await refreshTrackList();
    await refreshStems();
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
  if (!els.player || !studioAudioCtx) return;
  if (!pitchGainNode) {
    pitchGainNode = studioAudioCtx.createGain();
    const db = Number(els.volume?.value) || 0;
    pitchGainNode.gain.setValueAtTime(dbToGain(db), studioAudioCtx.currentTime);
    pitchGainNode.connect(studioDestination);
  }
  if (!playerSourceCreated) {
    try {
      pitchSourceNode = studioAudioCtx.createMediaElementSource(els.player);
      playerSourceCreated = true;
    } catch (e) {
      // Élément déjà routé (ne devrait pas arriver car on garde un seul audio element)
      console.warn('[Studio] MediaElementSource déjà créé:', e);
    }
  }
  if (pitchSourceNode) {
    pitchSourceNode.disconnect();
    if (pitchShifter) pitchShifter.disconnect();
    if (transpose !== 0) {
      if (!pitchShifter) {
        pitchShifter = await createPitchShifter(studioAudioCtx, pitchGainNode, transpose);
      }
      pitchSourceNode.connect(pitchShifter.node);
    } else {
      pitchSourceNode.connect(pitchGainNode);
    }
  }
}

async function runPitchShift() {
  if (!currentTrack) return;

  if (mixer?.hasStems()) {
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
      try { pitchShifter.disconnect(); } catch (_) {}
      pitchShifter = null;
    }
  }

  await ensurePlayerRouted();

  if (pitchShifter) {
    pitchShifter.setPitch(transpose);
  }

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

export function play() {
  if (!els.player?.src) return;

  const useStems = mixer?.hasStems();
  if (useStems) {
    setPlayerMuted();
    mixer?.seek(els.player.currentTime);
    mixer?.play();
  } else if (transpose !== 0) {
    setPlayerMuted();
    // Le son transposé sort via pitchGainNode / pitchShifter
    if (!pitchShifter) runPitchShift();
  } else {
    // Pas de stems, pas de transposition : sortie native de meilleure qualité
    setPlayerAudible();
  }

  els.player.play().catch((err) => console.error('Play failed:', err));

  isPlaying = true;
  els.playBtn.textContent = '⏸';
  startUpdateLoop();
}

export function pause() {
  if (els.player?.paused) return; // déjà en pause, ne pas reseeker
  els.player?.pause();
  mixer?.pause();
  isPlaying = false;
  els.playBtn.textContent = '▶';
  stopUpdateLoop();
}

export function stop() {
  els.player?.pause();
  if (els.player) els.player.currentTime = 0;
  mixer?.stop();
  isPlaying = false;
  els.playBtn.textContent = '▶';
  updateProgressUI(0, els.player?.duration || waveformData?.duration || 0);
  stopUpdateLoop();
}

function seek(time) {
  const clamped = clampToRegion(time);
  if (els.player) els.player.currentTime = clamped;
  mixer?.seek(clamped);
}

function updateProgressUI(current, duration) {
  if (!els.progress || !els.time) return;
  const pct = duration ? (current / duration) * 100 : 0;
  els.progress.value = Math.max(0, Math.min(100, pct));
  els.time.textContent = `${formatDuration(current)} / ${formatDuration(duration)}`;
}

function startUpdateLoop() {
  stopUpdateLoop();
  updateInterval = setInterval(() => {
    if (els.player) {
      let current = els.player.currentTime;
      const duration = els.player.duration;

      // Loop within the selected region.
      if (regionEnd !== null && current >= regionEnd) {
        seek(regionStart);
        current = regionStart;
      }

      updateProgressUI(current, duration);
      updatePlayhead(current, duration);
    }
  }, 200);
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
    setPlayerMuted();
    if (transpose !== 0) mixer.setDetune(transpose);
  } else {
    mixer.reset();
    setPlayerMuted();
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
    els.separateStatus.textContent = result.simulated ? 'Pistes simulées (Demucs non installé)' : 'Séparation terminée';
    await refreshStems();
    setStatus(result.simulated ? 'Pistes simulées créées' : 'Pistes séparées');
  } catch (err) {
    console.error('Separation failed:', err);
    els.separateStatus.textContent = `Erreur : ${err.message}`;
    setStatus(`Erreur de séparation : ${err.message}`);
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
