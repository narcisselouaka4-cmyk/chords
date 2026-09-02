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
  deleteTrack,
  renameTrack,
} from '../recorder/studio-storage.js';
import { importToLibrary } from './media-library.js';
import { createStemMixer, dbToGain } from '../audio/stem-mixer.js';
import { separateStems, getStems, STEMS } from '../audio/stem-separator.js';
import { createPitchShifter } from '../audio/pitch-shifter.js';
import { getAudioContext, connectOutput as connectSynthOutput } from '../audio/simple-synth.js';
import { globalAudioFocusManager } from '../audio/audio-focus-manager.js';
import { formatMediaDuration, isValidMediaDuration } from './media-format.js';
import { buildFileContextText } from './file-context.js';
import { applyStudioSidebarState } from './studio-view-state.js';
import { getSkin } from './refonte/skin-manager.js';

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

// [OpenCode] — 2026-07-04 — État transposition / waveform de l'onglet Studio
let transpose = 0;
let audioWavPath = null;
let waveformData = null;
let originalStemsBlobUrls = null;
let originalStemsPaths = null;
let regionStart = 0;
let regionEnd = null;
let regionConfirmed = false;
// [Refonte v2/Global] — « Boucler la région » (relais §2). Quand true, atteindre
// regionEnd relance la lecture à regionStart au lieu de mettre en pause.
let loopRegion = false;
let isDraggingHandle = null;
let isAudioOnly = false;
let mediaDuration = 0;
let isAudioReady = false;
let pendingTranspose = 0;
let isLoadingTrack = false;
let currentWaveformTrackId = null;

// UX Studio en 4 étapes : 0=accueil, 1=ciblage, 2=traitement, 3=lecture pro
let studioStage = 0;
let isProcessing = false;
let processingJobId = null;
let pendingRegion = null;

// Réarchitecture audio : lecteur vidéo visible + lecteur audio unique (timing + son).
// [Claude] — 2026-07-07 — Unification du timing et du son sur un seul élément audio
// pour éliminer les décalages entre curseur visuel et audio réel.
let playerVideo = null;
let playerAudio = null;
let audioBlobUrl = null;
let videoBlobUrl = null;
let syncRafId = null;

// AudioContext partagé pour le Studio (pitch-shift via MediaElementSourceNode)
let studioAudioCtx = null;
let studioDestination = null;
let mediaElementSource = null;
let pitchShifterNode = null;
let pitchGainNode = null;       // relicat de l'ancien graphe MediaElementSource (conservé pour compatibilité volume)

// Lecteurs audio/vidéo de l'Étape 1 (avant séparation en stems).
let masterPlayer = null;        // lecteur AudioBuffer natif (fichier WAV décodé)
let masterAudioBuffer = null;   // AudioBuffer décodé pour le masterPlayer
let masterAudioUrl = null;      // blob URL du fichier audio source
let html5Audio = null;          // lecteur HTML5 audio natif (fallback M4A/AAC)
let html5AudioCanPlay = false;  // flag prêt du lecteur HTML5 audio
let html5AudioReadyPromise = null;
let html5AudioResolve = null;

// [Claude] — 2026-07-07 — État du Screen Recorder intégré au Studio.
let isLeftPanelCollapsed = false;
let isRecording = false;
let countdownTimeout = null;

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
  loopRegion: document.getElementById('studio-loop-region'),
  transposePlus: document.getElementById('studio-transpose-plus'),
  separateBtn: document.getElementById('studio-separate-btn'),
  separateBtnCenter: document.getElementById('studio-separate-btn-center'),
  separateStatus: document.getElementById('studio-separate-status'),
  centerHeader: document.getElementById('studio-center-header'),
  centerTitle: document.getElementById('studio-center-title'),
  stemsSection: document.getElementById('studio-stems-section'),
  stemsBottom: document.getElementById('studio-stems-bottom'),
  stemsListBottom: document.getElementById('studio-stems-list-bottom'),
  stemsBottomStatus: document.getElementById('studio-stems-bottom-status'),
  stageOverlay: document.getElementById('studio-stage-overlay'),
  processingOverlay: document.getElementById('studio-processing-overlay'),
  processingLabel: document.getElementById('studio-processing-label'),
  processingBar: document.getElementById('studio-processing-bar'),
  readyToast: document.getElementById('studio-ready-toast'),
  stemsList: document.getElementById('studio-stems-list'),
  studioStatus: document.getElementById('studio-status-text'),
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
  mediaContext: document.getElementById('studio-media-context'),
  transposeStatus: document.getElementById('studio-transpose-status'),
  sidebarLeft: document.getElementById('studio-sidebar-left'),
  tracksHeader: document.getElementById('studio-tracks-header'),
  collapseLeftBtn: document.getElementById('studio-collapse-left'),
  collapseTabBtn: document.getElementById('studio-collapse-tab'),
  recordBtn: document.getElementById('studio-record-btn'),
  recordCountdown: document.getElementById('studio-record-countdown'),
  recordCountdownNumber: document.getElementById('studio-record-countdown-number'),
  recordingIndicator: document.getElementById('studio-recording-indicator'),
};

function formatDuration(seconds) {
  // Lot B — délègue au formateur robuste partagé. Gère NaN, Infinity,
  // négatifs et bornage. Conservé pour ne pas toucher tous les sites d'appel.
  return formatMediaDuration(seconds);
}

function updateTransposeUI() {
  if (els.transposeInput) els.transposeInput.value = String(transpose);
}

function setStatus(message) {
  // Affichage prioritaire dans la zone d'état dédiée du Studio (sidebar droite).
  if (els.studioStatus) {
    els.studioStatus.textContent = message;
    els.studioStatus.style.display = message ? '' : 'none';
  }
  // Fallback sur la barre de status globale.
  const statusBar = document.getElementById('status-bar');
  if (statusBar) statusBar.textContent = message;
}

function setTransposeControlsEnabled(enabled) {
  if (els.transposeInput) els.transposeInput.disabled = !enabled;
  if (els.transposeMinus) els.transposeMinus.disabled = !enabled;
  if (els.transposePlus) els.transposePlus.disabled = !enabled;
}

export function initStudioTab() {
  // L'état vide doit être visible même si l'initialisation audio échoue ensuite.
  updateStudioStage(0);
  ensureStudioAudioContext();
  mixer = createStemMixer(studioAudioCtx, readAudioFile);
  mixer.setOnProgress((current, duration) => {
    updateProgressUI(current, duration);
  });

  bindPlayer();
  bindStems();
  bindWaveform();
  bindCropButtons();
  bindScreenRecorder();
  refreshTrackList();

  document.addEventListener('app-switch-tab', (e) => {
    if (e.detail?.tab === 'studio') {
      if (!currentTrack) updateStudioStage(0);
      refreshTrackList();
    }
  });

  // [Claude] — 2026-08-08 — Enregistrement auprès du gestionnaire d'audio focus.
  // Studio et Analyse restent deux lecteurs indépendants, mais un seul workspace
  // peut produire du son à la fois.
  globalAudioFocusManager.register('studio', {
    play,
    pause,
    isPlaying: () => isPlaying,
  });

  // Redessiner la waveform au changement de thème (clair ↔ sombre).
  // Le canvas est rasterisé avec la couleur du thème courant via getComputedStyle ;
  // sans redraw, il garde l'ancienne couleur et devient invisible sur le nouveau fond.
  window.addEventListener('app-theme-changed', () => {
    if (waveformData) renderWaveform();
  });

  // [Refonte v2/Global] — réorganise le DOM du Studio selon le skin sélectionné
  // (stems à droite en Global, stems en bas en v2, header central, etc.).
  applyStudioSkinLayout(getSkin());
  window.addEventListener('app-skin-changed', (e) => {
    applyStudioSkinLayout(e.detail?.skin || getSkin());
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

  // Raccourci R global dédié au Screen Recorder du Studio.
  document.addEventListener('keydown', (e) => {
    if (e.code !== 'KeyR') return;
    if (['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(e.target?.tagName)) return;
    e.preventDefault();
    e.stopPropagation();
    toggleRecording();
  });

  els.stopBtn?.addEventListener('click', () => stop());

  els.prevBtn?.addEventListener('click', () => {
    const target = regionConfirmed ? regionStart : 0;
    seek(target);
    updateProgressUI(target, getEffectiveDuration());
    updatePlayhead(target, getEffectiveDuration());
  });

  els.resetRegionBtn?.addEventListener('click', () => resetRegion());

  els.progress?.addEventListener('input', () => {
    // La barre de progression reste toujours calée sur la durée TOTALE du fichier.
    const duration = getTotalDuration() || 1;
    const time = (Number(els.progress.value) / 100) * duration;
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

  // [Refonte v2/Global] — bascule « Boucler la région » (bloc Lecture).
  if (els.loopRegion) {
    try {
      loopRegion = localStorage.getItem('studio-loop-region') === '1';
    } catch (_) {}
    els.loopRegion.checked = loopRegion;
    els.loopRegion.addEventListener('change', () => {
      loopRegion = els.loopRegion.checked;
      try {
        localStorage.setItem('studio-loop-region', loopRegion ? '1' : '0');
      } catch (_) {}
    });
  }

  // Les événements media sont attachés dynamiquement à chaque nouvel élément.
  // Voir createMediaPlayer().
}

// [Claude] — 2026-07-07 — Screen Recorder : panneau rétractable + record + raccourcis.
function bindScreenRecorder() {
  els.collapseLeftBtn?.addEventListener('click', () => toggleLeftPanel());
  els.collapseTabBtn?.addEventListener('click', () => toggleLeftPanel());
  els.recordBtn?.addEventListener('click', () => toggleRecording());
}

function toggleLeftPanel() {
  setLeftPanelCollapsed(!isLeftPanelCollapsed);
}

function setLeftPanelCollapsed(collapsed) {
  isLeftPanelCollapsed = applyStudioSidebarState({
    sidebar: els.sidebarLeft,
    collapseButton: els.collapseLeftBtn,
    expandButton: els.collapseTabBtn,
  }, studioStage, collapsed);
}

// [Refonte v2/Global] — Déplace les éléments du Studio entre leurs deux positions
// selon le skin actif. v2 : pistes en bas + header central + Lecture à droite.
// Global : pistes à droite + contexte fichier sous lecteur + Lecture dans la sidebar.
function applyStudioSkinLayout(skin) {
  const isV2 = skin === 'v2';
  const list = els.stemsList;
  const bottomList = els.stemsListBottom;
  const section = els.stemsSection;

  if (isV2) {
    // v2 : déplacer la liste de stems en bas de la zone centrale.
    if (list && bottomList && list.parentElement !== bottomList) {
      bottomList.appendChild(list);
    }
    if (section) section.style.display = 'none';
    if (els.centerHeader) els.centerHeader.style.display = '';
    if (els.mediaContext) els.mediaContext.style.display = 'none';
    if (els.separateBtnCenter) {
      els.separateBtnCenter.style.display = '';
      els.separateBtnCenter.disabled = els.separateBtn?.disabled ?? true;
    }
    if (els.separateBtn) els.separateBtn.style.display = 'none';
  } else {
    // Global : remettre la liste de stems dans la sidebar droite.
    if (list && section && list.parentElement !== section) {
      section.appendChild(list);
    }
    if (section) section.style.display = '';
    if (els.centerHeader) els.centerHeader.style.display = 'none';
    if (els.mediaContext) els.mediaContext.style.display = '';
    if (els.separateBtnCenter) els.separateBtnCenter.style.display = 'none';
    if (els.separateBtn) els.separateBtn.style.display = '';
  }

  applyStudioSkinStageVisibility(skin, studioStage);
}

// Affiche ou masque la zone stems-bottom en v2 selon l'étape (stage 3 seulement).
function applyStudioSkinStageVisibility(skin, stage) {
  const isV2 = skin === 'v2';
  if (els.stemsBottom) {
    const showBottom = isV2 && stage >= 3;
    els.stemsBottom.style.display = showBottom ? '' : 'none';
  }
  if (isV2 && els.waveformWrap && els.regionBar) {
    // En v2, la waveform classique reste visible aux étapes 1 et 2, puis est
    // remplacée visuellement par les stems en bas à l'étape 3.
    const showWaveform = stage === 1 || stage === 2;
    els.waveformWrap.style.display = showWaveform ? '' : 'none';
    els.regionBar.style.display = showWaveform ? '' : 'none';
  }
}

function toggleRecording() {
  if (isRecording) {
    stopRecording();
  } else {
    startRecordingSequence();
  }
}

function startRecordingSequence() {
  if (isRecording || !window.electronAPI?.studio?.getWindowSource) return;

  // Libérer l'espace visuel avant le record.
  if (!isLeftPanelCollapsed) toggleLeftPanel();

  runCountdown(3, () => {
    startCapture();
  });
}

function runCountdown(startFrom, onComplete) {
  if (!els.recordCountdown || !els.recordCountdownNumber) {
    onComplete();
    return;
  }

  let count = startFrom;
  els.recordCountdown.style.display = 'flex';

  const tick = () => {
    if (count <= 0) {
      els.recordCountdown.style.display = 'none';
      onComplete();
      return;
    }
    els.recordCountdownNumber.textContent = String(count);
    // Forcer le restart de l'animation.
    els.recordCountdownNumber.style.animation = 'none';
    void els.recordCountdownNumber.offsetWidth;
    els.recordCountdownNumber.style.animation = '';
    count -= 1;
    countdownTimeout = setTimeout(tick, 1000);
  };

  tick();
}

// [Claude] — 2026-07-07 — Enregistrement vidéo+audio natif via desktopCapturer +
// MediaRecorder + graphe Web Audio existant.
let screenRecordStream = null;
let screenRecordRecorder = null;
let screenRecordChunks = [];
let audioDestinationNode = null;

async function startCapture() {
  try {
    if (!window.electronAPI?.studio?.getScreenSourceId) {
      setStatus('Enregistrement vidéo indisponible — redémarrez l\'application');
      return;
    }

    const source = await window.electronAPI.studio.getScreenSourceId();
    if (source?.error || !source?.id) {
      throw new Error(source?.error || 'Source d\'écran introuvable');
    }

    // Obtenir le flux vidéo de la fenêtre de l'application.
    const screenStream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        mandatory: {
          chromeMediaSource: 'desktop',
          chromeMediaSourceId: source.id,
        },
      },
    });

    // Capturer l'audio depuis le graphe Web Audio existant (Studio + synthé).
    ensureStudioAudioContext();
    // Le contexte doit être actif pour que les MediaStreamDestination alimentent leurs pistes.
    if (studioAudioCtx.state === 'suspended') {
      await studioAudioCtx.resume();
    }

    audioDestinationNode = studioAudioCtx.createMediaStreamDestination();

    // Route toutes les sources audio vers cette seule destination d'enregistrement :
    // - sortie du lecteur principal (étape 1)
    if (studioDestination) {
      studioDestination.connect(audioDestinationNode);
    }
    // - sortie du mixer de stems (après séparation)
    if (mixer?.getDestination?.() && mixer.getDestination() !== studioDestination) {
      mixer.getDestination().connect(audioDestinationNode);
    }
    // - sortie du synthétiseur global (clavier MIDI / virtuel)
    connectSynthOutput(audioDestinationNode);

    const audioTracks = [...audioDestinationNode.stream.getAudioTracks()];

    const combinedStream = new MediaStream([
      ...screenStream.getVideoTracks(),
      ...audioTracks,
    ]);

    console.log('[Studio] startCapture audio tracks:', audioTracks.length, 'ctx state:', studioAudioCtx.state, 'mixer dest:', !!mixer?.getDestination?.());

    screenRecordStream = combinedStream;

    const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')
      ? 'video/webm;codecs=vp9,opus'
      : 'video/webm';

    screenRecordRecorder = new MediaRecorder(combinedStream, { mimeType });
    screenRecordChunks = [];
    screenRecordRecorder.ondataavailable = (event) => {
      if (event.data?.size > 0) screenRecordChunks.push(event.data);
    };
    screenRecordRecorder.onerror = (err) => {
      console.error('[Studio] MediaRecorder error:', err);
      setStatus('Erreur MediaRecorder — enregistrement interrompu');
      cleanupRecording();
    };
    screenRecordRecorder.onstop = () => finalizeRecording();
    screenRecordRecorder.start(1000);

    isRecording = true;
    els.recordBtn?.classList.add('recording');
    if (els.recordingIndicator) els.recordingIndicator.style.display = 'flex';
    setStatus('Enregistrement vidéo en cours... (R pour arrêter)');
  } catch (err) {
    console.error('[Studio] startCapture failed:', err);
    setStatus(`Erreur de capture : ${err.message}`);
    cleanupRecording();
  }
}

async function stopRecording() {
  if (!isRecording || !screenRecordRecorder) return;
  screenRecordRecorder.stop();
}

async function finalizeRecording() {
  try {
    setStatus('Finalisation de l\'enregistrement...');
    const blob = new Blob(screenRecordChunks, { type: screenRecordRecorder?.mimeType || 'video/webm' });
    const arrayBuffer = await blob.arrayBuffer();

    const saveResult = await window.electronAPI.studio.saveRecording(arrayBuffer);
    if (saveResult?.canceled) {
      setStatus('Enregistrement annulé');
    } else if (saveResult?.path) {
      setStatus(`Vidéo enregistrée : ${saveResult.path}`);
    } else {
      setStatus('Erreur de sauvegarde');
    }
  } catch (err) {
    console.error('[Studio] finalizeRecording failed:', err);
    setStatus(`Erreur de sauvegarde : ${err.message}`);
  } finally {
    cleanupRecording();
  }
}

function cleanupRecording() {
  isRecording = false;
  if (screenRecordRecorder?.state !== 'inactive') {
    try { screenRecordRecorder?.stop(); } catch (_) {}
  }
  screenRecordRecorder = null;

  if (screenRecordStream) {
    screenRecordStream.getTracks().forEach((track) => {
      try { track.stop(); } catch (_) {}
    });
    screenRecordStream = null;
  }

  if (audioDestinationNode) {
    try { audioDestinationNode.disconnect(); } catch (_) {}
    audioDestinationNode = null;
  }

  screenRecordChunks = [];
  els.recordBtn?.classList.remove('recording');
  if (els.recordingIndicator) els.recordingIndicator.style.display = 'none';

  if (countdownTimeout) {
    clearTimeout(countdownTimeout);
    countdownTimeout = null;
  }
  if (els.recordCountdown) els.recordCountdown.style.display = 'none';
}

let mediaEventCleanup = null;

// [Claude] — 2026-07-06 — La synchronisation est maintenant pilotée par le temps
// de l'AudioContext. Le HTMLVideoElement est muet et calé explicitement, sans
// modification de playbackRate.
let lastReportedAudioTime = 0;

function bindMediaEvents(audio) {
  if (mediaEventCleanup) {
    try { mediaEventCleanup(); } catch (_) {}
  }
  if (!audio) {
    mediaEventCleanup = null;
    return;
  }

  const onAudioEnded = () => {
    stopSyncLoop();
  };
  const onAudioTimeUpdate = () => {
    // ABSOLUTE TIMELINE : fin de la région confirmée.
    if (regionConfirmed && regionEnd !== null && audio.currentTime >= regionEnd - 0.02) {
      if (loopRegion) {
        seek(regionStart);
      } else {
        pause();
        seek(regionEnd - 0.001);
      }
    }
  };
  // Lot B — rafraîchir le timer dès que la durée réelle est connue, y compris
  // si elle arrive tard (loadedmetadata) ou est corrigée (durationchange).
  const onAudioLoadedMetadata = () => {
    const d = audio?.duration;
    if (Number.isFinite(d) && d > 0) {
      mediaDuration = d;
      refreshMediaDurationDisplay();
    }
  };
  const onAudioDurationChange = onAudioLoadedMetadata;

  audio.addEventListener('ended', onAudioEnded);
  audio.addEventListener('timeupdate', onAudioTimeUpdate);
  audio.addEventListener('loadedmetadata', onAudioLoadedMetadata);
  audio.addEventListener('durationchange', onAudioDurationChange);

  mediaEventCleanup = () => {
    audio.removeEventListener('ended', onAudioEnded);
    audio.removeEventListener('timeupdate', onAudioTimeUpdate);
    audio.removeEventListener('loadedmetadata', onAudioLoadedMetadata);
    audio.removeEventListener('durationchange', onAudioDurationChange);
  };
}

function getStudioCurrentTime() {
  try {
    if (mixer?.hasStems()) {
      // Les stems sont extraits de la région : leur temps local doit être
      // converti en temps absolu sur la timeline globale.
      return regionStart + (mixer.getCurrentTime() || 0);
    }

    // Source de vérité du son réel (avant confirmation de région) :
    // 1. lecteur HTML5 natif pour M4A/AAC (c'est lui qui sort du son),
    // 2. lecteur AudioBuffer décodé pour les autres formats,
    // 3. éléments média muets de secours uniquement en fallback.
    if (html5Audio && html5Audio.currentTime != null) {
      return html5Audio.currentTime || 0;
    }
    if (masterPlayer) {
      return masterPlayer.getCurrentTime() || 0;
    }
    if (playerAudio && playerAudio.currentTime != null) {
      return playerAudio.currentTime || 0;
    }
    if (playerVideo && playerVideo.currentTime != null) {
      return playerVideo.currentTime || 0;
    }
    return 0;
  } catch (e) {
    return 0;
  }
}

function getStudioDuration() {
  // ABSOLUTE TIMELINE : la durée affichée est toujours la durée totale du fichier.
  return getEffectiveDuration();
}

function syncVideoAndCursor() {
  try {
    const realTime = getStudioCurrentTime();
    const duration = getStudioDuration();

    // Gestion de la région comme zone restreinte : fin de région.
    if (regionConfirmed && regionEnd !== null && realTime >= regionEnd - 0.02) {
      if (loopRegion) {
        seek(regionStart);
      } else {
        pause();
        seek(regionEnd - 0.001);
      }
    }

    // Synchronisation de l'élément vidéo visible (muet) sur le temps audio réel.
    // On ne modifie JAMAIS playbackRate pour rattraper la dérive : cela causait
    // un bégaiement et un décalage perceptible (voir CLAUDE.md §4).
    if (playerVideo && playerVideo.currentTime != null) {
      const drift = realTime - playerVideo.currentTime;
      const absDrift = Math.abs(drift);

      // On force un resync par currentTime si la dérive dépasse le seuil,
      // sinon on laisse la vidéo avancer à son propre rythme naturel.
      if (absDrift > 0.15 || playerVideo.paused) {
        playerVideo.currentTime = realTime;
      }
      // Garder playbackRate à 1.0 en permanence pour éviter toute dérive induite.
      if (playerVideo.playbackRate !== 1.0) {
        playerVideo.playbackRate = 1.0;
      }
    }

    // Synchroniser l'élément audio muet de timing sur le son réel pour que
    // metadata/currentTime restent cohérents avec ce qui est entendu.
    if (html5Audio && playerAudio && playerAudio.currentTime != null && !html5Audio.paused) {
      const audioDrift = html5Audio.currentTime - playerAudio.currentTime;
      if (Math.abs(audioDrift) > 0.05) {
        playerAudio.currentTime = html5Audio.currentTime;
      }
    }

    // Affichage UI en temps absolu sur la timeline globale.
    updateProgressUI(realTime, duration);
    updatePlayhead(realTime, duration);
  } catch (e) {
    console.warn('[Studio] syncVideoAndCursor error:', e);
  }
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
  els.separateBtnCenter?.addEventListener('click', () => runSeparation());
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

async function backRegion() {
  regionConfirmed = false;
  // Revenir au mode fichier entier : les stems séparés ne sont plus la source active.
  // On arrête tout et on recharge le fichier original pour que le son suive la nouvelle région.
  mixer?.reset();
  stop();
  setLoadingState(true);
  try {
    await rebuildMediaPlayerForFullTrack();
  } catch (err) {
    console.error('[Studio] backRegion failed:', err);
  } finally {
    setLoadingState(false);
  }
  seek(0);
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

async function resetRegion() {
  const totalDuration = getTotalDuration();
  regionStart = 0;
  // Réinitialiser la région à la plage maximale autorisée (5 min) par défaut,
  // jamais zoomée. Si le fichier est plus court, on prend toute la durée.
  regionEnd = totalDuration > 0
    ? Math.min(totalDuration, MAX_REGION_DURATION)
    : null;
  regionConfirmed = false;
  // Revenir au mode fichier entier : les stems séparés ne sont plus actifs.
  mixer?.reset();
  stop();
  setLoadingState(true);
  try {
    await rebuildMediaPlayerForFullTrack();
  } catch (err) {
    console.error('[Studio] resetRegion failed:', err);
  } finally {
    setLoadingState(false);
  }
  // Remettre le lecteur au début du fichier original.
  seek(0);
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
  destroyMediaPlayer();
  audioWavPath = null;
  waveformData = null;
  originalStemsBlobUrls = null;
  originalStemsPaths = null;
  currentWaveformTrackId = null;
  regionStart = 0;
  regionEnd = null;
  regionConfirmed = false;
  pendingRegion = null;
  updateProgressUI(0, 0);
}

function bindWaveform() {
  if (!els.waveformWrap) return;

  const wrap = els.waveformWrap;
  let dragStartX = 0;
  let dragStartRegionStart = 0;
  let dragStartRegionEnd = null;
  let isDraggingRegion = false;

  function timeAtX(x) {
    const rect = wrap.getBoundingClientRect();
    if (!rect.width) return 0;
    const duration = getTotalDuration() || 1;
    const clampedX = Math.max(0, Math.min(x - rect.left, rect.width));
    return (clampedX / rect.width) * duration;
  }

  wrap.addEventListener('mousedown', (e) => {
    // ABSOLUTE TIMELINE : le clic sur la waveform modifie audio.currentTime de
    // manière absolue sur le fichier entier, sans jamais toucher aux limiteurs.
    const time = timeAtX(e.clientX);

    if (regionConfirmed) {
      seek(time);
      return;
    }

    if (e.ctrlKey || e.metaKey) {
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
      seek(time);
    }
  });

  window.addEventListener('mousemove', (e) => {
    if (regionConfirmed) return;
    if (!waveformData) return;
    const rect = els.waveformWrap.getBoundingClientRect();
    const duration = getTotalDuration();
    const time = timeAtX(e.clientX);

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
      let newStart = Math.max(0, Math.min(time, regionEnd !== null ? regionEnd : duration));
      if (regionEnd !== null) {
        // Bloquer la région à MAX_REGION_DURATION max en déplaçant le début.
        if (regionEnd - newStart > MAX_REGION_DURATION) {
          newStart = regionEnd - MAX_REGION_DURATION;
        }
        // Bloquer également le début à ne pas dépasser la fin.
        if (newStart > regionEnd) newStart = regionEnd;
      }
      regionStart = newStart;
    } else if (isDraggingHandle === 'end') {
      let newEnd = Math.min(duration, Math.max(time, regionStart));
      // Bloquer la région à MAX_REGION_DURATION max en déplaçant la fin.
      if (newEnd - regionStart > MAX_REGION_DURATION) {
        newEnd = regionStart + MAX_REGION_DURATION;
      }
      regionEnd = newEnd;
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

function getTotalDuration() {
  // Lot B — ne jamais retourner NaN/Infinity/négatif. On retourne la première
  // durée finie strictement positive parmi les sources disponibles, sinon 0.
  const candidates = [
    html5Audio?.duration,
    waveformData?.duration,
    els.playerAudio?.duration,
    els.player?.duration,
    mediaDuration,
  ];
  for (const c of candidates) {
    if (isValidMediaDuration(c)) return Number(c);
  }
  return 0;
}

function getHandleX(time) {
  if (!els.waveformWrap || !waveformData) return 0;
  const rect = els.waveformWrap.getBoundingClientRect();
  const duration = getTotalDuration() || 1;
  return (time / duration) * rect.width;
}

function updateRegionUI() {
  if (!els.region || !els.handleStart || !els.handleEnd || !waveformData) return;
  const rect = els.waveformWrap.getBoundingClientRect();
  const duration = getTotalDuration();
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
  const rect = els.waveformWrap?.getBoundingClientRect();
  if (!rect || rect.width <= 0) return;
  // ABSOLUTE TIMELINE : le curseur se déplace sur TOUTE la waveform globale.
  const pct = Math.max(0, Math.min(1, current / duration));
  els.playhead.style.left = `${pct * rect.width}px`;
}

function bindCropButtons() {
  els.confirmRegionBtn?.addEventListener('click', () => confirmRegion());
  els.backRegionBtn?.addEventListener('click', () => backRegion());
}

const SUPPORTED_FORMATS = ['mp3', 'wav', 'm4a', 'mp4'];
const AUDIO_ONLY_FORMATS = ['mp3', 'wav', 'm4a', 'aac', 'ogg', 'flac'];

function getFileExtension(filePath) {
  const match = filePath.match(/\.([a-zA-Z0-9]+)$/);
  return match ? match[1].toLowerCase() : '';
}

function isSupportedFormat(filePath) {
  return SUPPORTED_FORMATS.includes(getFileExtension(filePath));
}

function isAudioOnlyByExtension(filePath) {
  return AUDIO_ONLY_FORMATS.includes(getFileExtension(filePath));
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

    // Dédoublonnage : importToLibrary retrouve une entrée existante si le
    // même fichier (identité stable) a déjà été importé, ou crée une
    // nouvelle entrée avec résolution de conflit de nom.
    const { id: trackId, isReimport } = await importToLibrary(filePath);

    // Mettre à jour le type de source dans les métadonnées.
    const meta = await loadMetadata(trackId);
    if (meta) {
      meta.sourceType = sourceType;
      await saveMetadata(trackId, meta);
    }

    await refreshTrackList();
    await loadTrack(trackId);
    const displayName = meta?.name || trackId;
    setStatus(isReimport
      ? `Morceau retrouvé : ${displayName} (modifications conservées)`
      : `Morceau importé : ${displayName}`);
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
    const ext = metadata.sourcePath ? getFileExtension(metadata.sourcePath).toUpperCase() : '';

    // Si le morceau a été renommé, on n'affiche pas l'ancien nom source en doublon.
    const wasRenamed = metadata.name && metadata.name !== source && metadata.name !== track.id;
    const metaLine = wasRenamed
      ? `${ext ? `.${ext} · ` : ''}${formatDuration(metadata.duration || 0)}`
      : `${escapeHtml(source)} · ${formatDuration(metadata.duration || 0)}`;

    const info = document.createElement('div');
    info.className = 'studio-track-info';
    info.innerHTML = `
      <div class="studio-track-name">${escapeHtml(displayName)}</div>
      <div class="studio-track-meta">${metaLine}</div>
    `;
    info.addEventListener('click', () => loadTrack(track.id));

    const actions = document.createElement('div');
    actions.className = 'studio-track-actions';
    actions.innerHTML = `
      <button class="studio-track-rename" title="Renommer">✏️</button>
      <button class="studio-track-delete" title="Supprimer">🗑️</button>
    `;

    actions.querySelector('.studio-track-rename').addEventListener('click', (e) => {
      e.stopPropagation();
      handleRenameTrack(track.id, metadata.name || track.id);
    });
    actions.querySelector('.studio-track-delete').addEventListener('click', (e) => {
      e.stopPropagation();
      handleDeleteTrack(track.id, metadata.name || track.id);
    });

    item.appendChild(info);
    item.appendChild(actions);
    els.trackList.appendChild(item);
  }
}

async function handleRenameTrack(trackId, currentName) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.style.zIndex = '4000';
  overlay.innerHTML = `
    <div class="modal-box" style="max-width: 420px; text-align: center;">
      <h3>Renommer le morceau</h3>
      <input type="text" id="rename-input" class="session-title-input" value="${escapeHtml(currentName)}" style="width: 100%; margin-top: 12px;" />
      <div class="modal-actions" style="margin-top: 16px;">
        <button type="button" class="primary" id="rename-confirm">Renommer</button>
        <button type="button" class="secondary" id="rename-cancel">Annuler</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  const input = overlay.querySelector('#rename-input');
  input.focus();
  input.select();

  return new Promise((resolve) => {
    const cleanup = () => {
      if (overlay.parentNode) document.body.removeChild(overlay);
    };

    const doRename = async () => {
      const newName = input.value.trim();
      cleanup();
      if (!newName || newName === currentName) {
        resolve(false);
        return;
      }
      try {
        await renameTrack(trackId, newName);
        if (currentTrack?.id === trackId) {
          currentTrack.metadata.name = newName;
          updateAudioBackdrop(newName);
        }
        await refreshTrackList();
        setStatus(`Morceau renommé : ${newName}`);
        resolve(true);
      } catch (err) {
        console.error('Rename failed:', err);
        setStatus(`Erreur de renommage : ${err.message}`);
        resolve(false);
      }
    };

    overlay.querySelector('#rename-confirm').addEventListener('click', doRename);
    overlay.querySelector('#rename-cancel').addEventListener('click', () => {
      cleanup();
      resolve(false);
    });
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        cleanup();
        resolve(false);
      }
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') doRename();
      if (e.key === 'Escape') {
        cleanup();
        resolve(false);
      }
    });
  });
}

async function handleDeleteTrack(trackId, displayName) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.style.zIndex = '4000';
  overlay.innerHTML = `
    <div class="modal-box" style="max-width: 420px; text-align: center;">
      <h3>Supprimer le morceau ?</h3>
      <p class="modal-hint">"${escapeHtml(displayName)}" sera supprimé définitivement.<br/>Cette action est irréversible.</p>
      <div class="modal-actions" style="margin-top: 16px;">
        <button type="button" class="danger" id="delete-confirm" style="background:#bf3a2b;color:#fff;border-color:#bf3a2b;">Supprimer</button>
        <button type="button" class="secondary" id="delete-cancel">Annuler</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  const confirmed = await new Promise((resolve) => {
    const cleanup = () => {
      if (overlay.parentNode) document.body.removeChild(overlay);
    };
    overlay.querySelector('#delete-confirm').addEventListener('click', () => { cleanup(); resolve(true); });
    overlay.querySelector('#delete-cancel').addEventListener('click', () => { cleanup(); resolve(false); });
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) { cleanup(); resolve(false); }
    });
  });

  if (!confirmed) return;
  try {
    if (currentTrack?.id === trackId) {
      await resetStudioState();
      currentTrack = null;
      updateStudioFileContext('');
      updateStudioStage(0);
    }
    await deleteTrack(trackId);
    await refreshTrackList();
    setStatus(`Morceau supprimé : ${displayName}`);
  } catch (err) {
    console.error('Delete failed:', err);
    setStatus(`Erreur de suppression : ${err.message}`);
  }
}

function updateAudioBackdrop(title) {
  if (!els.audioBackdrop || !els.backdropTitle) return;
  if (isAudioOnly) {
    els.audioBackdrop.style.display = 'flex';
    els.backdropTitle.textContent = title || 'Fichier audio';
    els.playerWrap?.classList.add('is-audio-only');
  } else {
    els.audioBackdrop.style.display = 'none';
    els.backdropTitle.textContent = '';
    els.playerWrap?.classList.remove('is-audio-only');
  }
}

function inspectMedia(blobUrl) {
  return new Promise((resolve) => {
    const media = document.createElement('audio');
    media.preload = 'metadata';
    media.src = blobUrl;
    const timer = setTimeout(() => {
      resolve({ isAudioOnly: true, duration: media.duration || 0 });
    }, 3000);

    media.onloadedmetadata = () => {
      clearTimeout(timer);
      // <audio> n'a pas de pistes vidéo.
      resolve({ isAudioOnly: true, duration: media.duration || 0 });
    };
    media.onloadeddata = () => {
      clearTimeout(timer);
      resolve({ isAudioOnly: true, duration: media.duration || 0 });
    };
    media.onerror = () => {
      clearTimeout(timer);
      resolve({ isAudioOnly: true, duration: 0 });
    };
  });
}

function ensureStudioAudioContext() {
  if (studioAudioCtx) return studioAudioCtx;
  // Partage le même AudioContext que le synthé : le mixage dans MediaRecorder
  // nécessite que toutes les MediaStreamTracks proveniennent du même contexte.
  studioAudioCtx = mixer?.getAudioContext?.() || getAudioContext() || new (window.AudioContext || window.webkitAudioContext)();
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
    const buffer = await studioAudioCtx.decodeAudioData(arrayBuffer);
    if (!isValidAudioBuffer(buffer)) {
      throw new Error('decoded buffer is empty or invalid');
    }
    return buffer;
  } catch (err) {
    console.warn('[Studio] decodeMasterAudio failed:', err);
    return null;
  }
}

function destroyMediaPlayer() {
  masterPlayer?.stop();
  masterPlayer = null;
  masterAudioBuffer = null;
  // Lot B — réinitialiser l'état durée lors d'un changement de fichier pour
  // éviter d'afficher la durée d'un fichier précédent.
  mediaDuration = 0;
  lastKnownDuration = 0;
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
  if (html5Audio) {
    try {
      html5Audio.onerror = null;
      html5Audio.ontimeupdate = null;
      html5Audio.oncanplaythrough = null;
      html5Audio.onloadedmetadata = null;
      html5Audio.ondurationchange = null;
      html5Audio.pause();
      html5Audio.removeAttribute('src');
      html5Audio.load();
    } catch (_) {}
    if (html5Audio.parentNode) html5Audio.parentNode.removeChild(html5Audio);
    html5Audio = null;
  }
  html5AudioCanPlay = false;
  html5AudioReadyPromise = null;
  html5AudioResolve = null;
  if (audioBlobUrl) {
    URL.revokeObjectURL(audioBlobUrl);
    audioBlobUrl = null;
  }
  els.player = null;
  els.playerAudio = null;
}

function isM4aFile(filePath) {
  const ext = getFileExtension(filePath);
  return ext === 'm4a' || ext === 'aac';
}

// [Claude] — 2026-07-07 — Quand on sort d'une région confirmée (backRegion / resetRegion),
// il faut recharger le fichier original entier. Les stems séparés ne doivent plus être joués.
async function rebuildMediaPlayerForFullTrack() {
  if (!currentTrack || !currentTrack.metadata) return;
  try {
    const originalBlobUrl = await readOriginalAsBlobUrl(currentTrack.id);
    if (!originalBlobUrl) return;

    // Extraction WAV fraîche du fichier original.
    let wavBytes = null;
    let wavPath = null;
    if (window.electronAPI?.studio?.extractAudio) {
      try {
        wavPath = await window.electronAPI.studio.extractAudio(currentTrack.id, currentTrack.metadata.originalPath);
      } catch (err) {
        console.warn('[Studio] extractAudio failed during rebuild:', err);
      }
    }
    if (wavPath && window.electronAPI?.files?.readBinary) {
      try {
        wavBytes = await window.electronAPI.files.readBinary(wavPath);
      } catch (err) {
        console.warn('[Studio] readBinary wav failed during rebuild:', err);
      }
    }

    audioWavPath = wavPath || audioWavPath;
    await createMediaPlayer(originalBlobUrl, wavPath, wavBytes, !isAudioOnly);

    if (wavPath) {
      await waitAudioElementReady(playerAudio);
      if (html5Audio) await waitHtml5AudioReady(10000);
    }
  } catch (err) {
    console.warn('[Studio] rebuildMediaPlayerForFullTrack failed:', err);
  }
}

async function createMediaPlayer(originalBlobUrl, wavPath, wavBytes, isVideo, options = {}) {
  destroyMediaPlayer();

  // Source audio fiable : le WAV extrait s'il existe, sinon le conteneur original.
  audioBlobUrl = wavBytes
    ? URL.createObjectURL(new Blob([wavBytes], { type: 'audio/wav' }))
    : originalBlobUrl;

  // Source vidéo visible : le conteneur original (MP4) pour conserver l'image.
  const visualBlobUrl = isVideo ? originalBlobUrl : audioBlobUrl;

  // --- Lecteur visuel (vidéo ou audio muet de référence) ---
  if (isVideo) {
    const video = document.createElement('video');
    video.id = 'studio-player-video';
    video.className = 'studio-player';
    video.preload = 'auto';
    video.src = visualBlobUrl;
    video.muted = true;
    video.volume = 0;
    video.controls = false;
    video.playsInline = true;
    els.playerVideoContainer.appendChild(video);
    playerVideo = video;
    els.player = video;
  }

  // --- Audio caché : timing / metadata de secours ---
  const audio = document.createElement('audio');
  audio.id = 'studio-player-audio';
  audio.className = 'studio-player';
  audio.preload = 'auto';
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

  bindMediaEvents(audio);

  // --- Fallback M4A : lecteur HTML5 natif ---
  // [Claude] — 2026-07-07 — Le lecteur audio réel (html5Audio) utilise le WAV extrait
  // (blob local) quand il est disponible, plutôt que le M4A original. Cela garantit un
  // seek instantané et fiable, et synchronise parfaitement le son avec le timing de playerAudio.
  const originalIsM4a = isM4aFile(currentTrack?.metadata?.originalPath || '');
  if (originalIsM4a) {
    html5AudioReadyPromise = new Promise((resolve) => {
      html5AudioResolve = resolve;
    });
    html5Audio = document.createElement('audio');
    html5Audio.id = 'studio-html5-audio';
    html5Audio.preload = 'auto';
    html5Audio.src = audioBlobUrl;
    html5Audio.crossOrigin = 'anonymous';
    html5Audio.style.display = 'none';
    document.body.appendChild(html5Audio);

    html5Audio.onloadedmetadata = () => {
      const realDuration = html5Audio.duration;
      if (Number.isFinite(realDuration) && realDuration > 0) {
        mediaDuration = realDuration;
        if (waveformData && (!waveformData.duration || waveformData.duration <= 2)) {
          waveformData.duration = realDuration;
          renderWaveform();
          updateRegionUI();
        }
        // Lot B — rafraîchir immédiatement le timer dès que la durée réelle
        // est disponible, pour ne jamais rester bloqué sur 00:00 / 00:00.
        refreshMediaDurationDisplay();
      }
      console.log('[Studio] HTML5 audio metadata:', { duration: html5Audio.duration });
    };

    // Lot B — durationchange couvre le cas où la durée est mise à jour après
    // loadedmetadata (certains conteneurs MP4 mettent la durée à jour tard).
    html5Audio.ondurationchange = () => {
      const realDuration = html5Audio.duration;
      if (Number.isFinite(realDuration) && realDuration > 0) {
        mediaDuration = realDuration;
        refreshMediaDurationDisplay();
      }
    };

    html5Audio.oncanplaythrough = () => {
      if (!html5AudioCanPlay) {
        html5AudioCanPlay = true;
        console.log('[Studio] HTML5 audio can play through');
        html5AudioResolve?.(true);
      }
    };

    html5Audio.onerror = (e) => {
      const err = html5Audio?.error;
      console.error('[Studio] HTML5 audio error code:', err?.code, 'message:', err?.message, 'event:', e);
      html5AudioCanPlay = false;
      html5AudioResolve?.(false);
    };

    html5Audio.ontimeupdate = () => {
      // Gestion de la région : pause automatique à la fin de la zone confirmée.
      if (regionConfirmed && regionEnd !== null && html5Audio.currentTime >= regionEnd - 0.02) {
        pause();
        seek(regionEnd - 0.001);
      }
    };

    html5Audio.load();
  }

  // Décoder le WAV extrait en AudioBuffer natif pour un playback fiable.
  masterAudioUrl = audioBlobUrl;
  const decodePath = wavPath || (audioBlobUrl.startsWith('blob:') ? null : audioBlobUrl);
  if (decodePath && !originalIsM4a) {
    masterAudioBuffer = await decodeMasterAudio(decodePath);
    if (isValidAudioBuffer(masterAudioBuffer)) {
      masterPlayer = createMasterPlayer(studioAudioCtx, studioDestination, masterAudioBuffer);
      const db = Number(els.volume?.value) || 0;
      masterPlayer.setVolume(db);
    } else {
      console.error('[Studio] decoded audio buffer is invalid:', masterAudioBuffer);
      masterAudioBuffer = null;
    }
  }

  return { audio };
}

function isValidAudioBuffer(buffer) {
  return !!buffer
    && Number.isFinite(buffer.duration)
    && buffer.duration > 0.001
    && buffer.numberOfChannels > 0
    && buffer.sampleRate > 0;
}

function isHtml5AudioReady() {
  return !isM4aFile(currentTrack?.metadata?.originalPath || '') || html5AudioCanPlay;
}

async function waitHtml5AudioReady(timeoutMs = 10000) {
  if (!isM4aFile(currentTrack?.metadata?.originalPath || '')) return true;
  if (html5AudioCanPlay) return true;
  if (!html5AudioReadyPromise) return false;
  const timeout = new Promise((resolve) => setTimeout(() => resolve(false), timeoutMs));
  return Promise.race([html5AudioReadyPromise, timeout]);
}

// [Claude] — 2026-07-07 — Attendre que l'élément audio de timing soit prêt
// (canplaythrough ou loadeddata), sinon le curseur et la durée peuvent être instables
// alors que le spinner a déjà disparu.
function waitAudioElementReady(audio, timeoutMs = 10000) {
  return new Promise((resolve) => {
    if (!audio) { resolve(); return; }
    if (audio.readyState >= 3 || audio.duration > 0) { resolve(); return; }

    let resolved = false;
    const done = () => {
      if (resolved) return;
      resolved = true;
      audio.removeEventListener('canplaythrough', onReady);
      audio.removeEventListener('loadeddata', onReady);
      audio.removeEventListener('error', onError);
      resolve();
    };
    const onReady = () => done();
    const onError = () => {
      console.warn('[Studio] waitAudioElementReady error');
      done();
    };

    audio.addEventListener('canplaythrough', onReady, { once: true });
    audio.addEventListener('loadeddata', onReady, { once: true });
    audio.addEventListener('error', onError, { once: true });
    setTimeout(done, timeoutMs);
  });
}

function getRegionDuration() {
  if (regionEnd === null || regionStart === null) return 0;
  return Math.max(0.01, regionEnd - regionStart);
}

function getEffectiveDuration() {
  // ABSOLUTE TIMELINE : le lecteur et la barre de progression utilisent TOUJOURS
  // la durée totale du fichier original, qu'une région soit active ou non.
  const total = getTotalDuration();
  if (total > 0) return total;
  return mixer?.getDuration?.()
    || masterPlayer?.getDuration?.()
    || els.playerAudio?.duration
    || els.player?.duration
    || 0;
}

function getEffectiveCurrentTime() {
  // ABSOLUTE TIMELINE : le temps affiché est toujours le temps absolu du fichier.
  return getStudioCurrentTime();
}

function isInsideRegion(time) {
  if (regionEnd === null) return true;
  return time >= regionStart && time < regionEnd - 0.001;
}

function storeOriginalStems(blobUrls, paths) {
  originalStemsBlobUrls = blobUrls;
  originalStemsPaths = paths;
}

function updateStudioStage(stage) {
  studioStage = stage;
  setLeftPanelCollapsed(stage === 0 ? false : isLeftPanelCollapsed);
  const tab = document.getElementById('studio-tab');
  if (tab) {
    tab.classList.remove('stage-0', 'stage-1', 'stage-2', 'stage-3');
    tab.classList.add(`stage-${stage}`);
  }

  if (els.stageOverlay) {
    // Masquer les instructions de ciblage tant que le morceau n'est pas chargé :
    // montrer les consignes "écoutez + tracez" pendant l'extraction donnerait
    // l'illusion que le morceau est prêt alors que le son/la waveform ne le sont pas.
    els.stageOverlay.style.display = (stage === 1 && !isLoadingTrack) ? 'flex' : 'none';
  }
  // Ne jamais cacher l'overlay de chargement pendant que isLoadingTrack est
  // vrai. updateStudioStage est appelé plusieurs fois pendant loadTrack
  // (restauration de région, initialisation du stage) et écraserait
  // l'affichage du spinner, donnant l'illusion que le morceau est prêt.
  if (els.processingOverlay && !isLoadingTrack) {
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
  if (els.centerHeader) els.centerHeader.style.display = stage0 ? 'none' : '';

  // Stage 1 : seuls la waveform, le play et la sélection de région sont actifs.
  const stage1Locked = stage === 1;
  const canSeparate = !stage1Locked && regionConfirmed && !stage0 && !isLoadingTrack;
  setTransposeControlsEnabled(!stage1Locked && regionConfirmed && !stage0 && !isLoadingTrack);
  if (els.playBtn) els.playBtn.disabled = isLoadingTrack;
  if (els.stopBtn) els.stopBtn.disabled = isLoadingTrack;
  if (els.prevBtn) els.prevBtn.disabled = isLoadingTrack;
  if (els.separateBtn) els.separateBtn.disabled = !canSeparate;
  if (els.separateBtnCenter) els.separateBtnCenter.disabled = !canSeparate;
  if (els.stemsList) els.stemsList.style.display = (stage1Locked || stage0) ? 'none' : '';
  if (els.separateStatus) els.separateStatus.style.display = (stage1Locked || stage0) ? 'none' : '';

  // [Refonte v2/Global] — visibilité des zones spécifiques au skin.
  applyStudioSkinStageVisibility(getSkin(), stage);

  if (stage === 3) {
    showReadyToast();
  }
}

let waveformProgressCleanup = null;

function setLoadingState(loading) {
  isLoadingTrack = loading;
  updateStudioStage(studioStage);
  if (els.processingLabel) els.processingLabel.textContent = loading ? 'Chargement du morceau...' : '';
  if (els.processingBar) els.processingBar.style.width = loading ? '30%' : '0%';
  if (els.processingOverlay) {
    els.processingOverlay.style.display = loading ? 'flex' : (studioStage === 2 ? 'flex' : 'none');
  }
}

// [Claude] — 2026-07-07 — Le spinner de chargement d'un morceau ne se ferme qu'après le message
// de succès explicite, ou en cas d'erreur. On ne ferme plus le spinner dans un finally aveugle.
function finishTrackLoading(name) {
  if (waveformProgressCleanup) {
    try { waveformProgressCleanup(); } catch (_) {}
    waveformProgressCleanup = null;
  }
  // Nettoyer les messages d'extraction/waveform pour ne pas laisser de texte fantôme.
  setStatus(`Morceau chargé : ${name}`);
  setLoadingState(false);
  // Lot B — contexte fichier explicite : le nom du fichier actif est affiché
  // dans le Studio. Le libellé ne laisse aucun doute sur l'onglet concerné.
  updateStudioFileContext(name);
  // S'assurer que l'overlay initial est bien caché même si updateStudioStage a été
  // appelé entre-temps (cas région confirmée + stems déjà séparés).
  if (els.processingOverlay && studioStage !== 2) {
    els.processingOverlay.style.display = 'none';
  }
}

// Lot B — affiche « Fichier du Studio : <nom> » (ou l'état vide explicite).
function updateStudioFileContext(name) {
  const trackName = currentTrack?.metadata?.name || name || '';
  const text = buildFileContextText({ tab: 'studio', fileName: trackName });
  if (els.mediaContext) els.mediaContext.textContent = text;
  // [Refonte v2] — breadcrumb "Studio / nom" dans l'en-tête centrale.
  if (els.centerTitle) els.centerTitle.textContent = trackName ? `Studio / ${trackName}` : 'Studio / Aucun fichier chargé';
}

function failTrackLoading(message) {
  if (waveformProgressCleanup) {
    try { waveformProgressCleanup(); } catch (_) {}
    waveformProgressCleanup = null;
  }
  setStatus(message);
  setLoadingState(false);
  destroyMediaPlayer();
  currentTrack = null;
  updateStudioFileContext('');
  updateStudioStage(0);
  if (els.processingOverlay) {
    els.processingOverlay.style.display = 'none';
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
    // Reset complet du player : forcer le retour au début de la nouvelle région.
    stop();
    seek(regionStart);
    updateProgressUI(regionStart, getEffectiveDuration());
    updatePlayhead(regionStart, getEffectiveDuration());
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
  let trackName = trackId;
  try {
    setLoadingState(true);
    stop();
    mixer?.reset();
    currentWaveformTrackId = null;
    // [OpenCode] — Passe corrective — Nettoyer immédiatement l'ancien état
    // visuel lors d'un changement de fichier : l'ancienne waveform / ancien
    // nom ne doivent jamais être visibles pendant le chargement du nouveau
    // morceau (rien ne doit paraître "prêt" tant que play/seek ne sont pas réels).
    waveformData = null;
    if (els.waveform) {
      const ctx = els.waveform.getContext('2d');
      if (ctx) ctx.clearRect(0, 0, els.waveform.width, els.waveform.height);
    }
    if (els.waveformWrap) els.waveformWrap.style.display = 'none';
    if (els.regionInfo) els.regionInfo.style.display = 'none';
    if (els.readyToast) els.readyToast.style.display = 'none';
    const metadata = await loadMetadata(trackId);
    currentTrack = { id: trackId, metadata };
    trackName = metadata?.name || trackId;
    // Mettre à jour le contexte fichier immédiatement, sans attendre la fin
    // du chargement (extraction audio + waveform). Sans cela, le texte
    // « Aucun fichier chargé dans le Studio » persiste pendant tout le
    // chargement, en contradiction avec le backdrop qui affiche déjà le nom.
    updateStudioFileContext(trackName);

    const originalBlobUrl = await readOriginalAsBlobUrl(trackId);
    if (!originalBlobUrl) {
      failTrackLoading('Fichier original introuvable');
      return;
    }

    // Détection audio-only par extension dès le départ (le probe navigateur est
    // peu fiable sur certains conteneurs M4A/AAC).
    isAudioOnly = isAudioOnlyByExtension(metadata?.originalPath || '');
    const originalIsM4a = isM4aFile(metadata?.originalPath || '');

    // Extraction WAV : utilisé pour la waveform et les stems.
    // Pour M4A, la lecture elle-même passera par un élément <audio> HTML5.
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

    // Pour M4A, on laisse l'élément HTML5 audio récupérer la vraie durée via
    // loadedmetadata. Pour les autres formats, on probe le WAV.
    if (!originalIsM4a) {
      const durationSourceBlob = wavBytes
        ? URL.createObjectURL(new Blob([wavBytes], { type: 'audio/wav' }))
        : originalBlobUrl;
      const info = await inspectMedia(durationSourceBlob);
      mediaDuration = info.duration || 0;
      if (wavBytes && durationSourceBlob !== originalBlobUrl) {
        URL.revokeObjectURL(durationSourceBlob);
      }
    }

    // Créer les players.
    // Pour M4A, l'audio HTML5 caché sera la source principale ; le WAV est
    // toujours disponible pour la waveform et la séparation de stems.
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

    audioWavPath = wavPath || null;

    // Attendre explicitement que l'élément audio de timing soit prêt avant de débloquer l'UI.
    await waitAudioElementReady(playerAudio);
    if (html5Audio) await waitHtml5AudioReady(10000);

    // Restaurer la région persistée si elle existe et est confirmée
    if (metadata?.region?.confirmed) {
      regionStart = metadata.region.start;
      regionEnd = metadata.region.end;
      regionConfirmed = true;
      renderWaveform();
      updateRegionUI();
      updateCropButtons();
      // Reset player : revenir au début de la région confirmée sur la timeline globale.
      stop();
      seek(regionStart);
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
      // Pas de région confirmée : initialiser une région par défaut de 5 min max.
      const totalDuration = getTotalDuration();
      regionStart = 0;
      regionEnd = totalDuration > 0
        ? Math.min(totalDuration, MAX_REGION_DURATION)
        : null;
      regionConfirmed = false;
      renderWaveform();
      updateRegionUI();
      updateCropButtons();
      updateStudioStage(1);
    }

    await refreshTrackList();
    await refreshStems();

    // Génération waveform : le chargement n'est terminé que lorsque l'audio ET
    // la waveform sont prêts. Le spinner reste actif pendant l'analyse.
    await generateWaveformBlocking(wavPath, metadata?.originalPath);

    finishTrackLoading(trackName);
  } catch (err) {
    console.error('Failed to load track:', err);
    failTrackLoading(`Erreur de chargement : ${err.message}`);
  } finally {
    // Sécurité : si loadTrack quitte avec le spinner encore actif (timeout,
    // exception silencieuse, etc.), on force la fermeture du chargement initial.
    if (isLoadingTrack) {
      setLoadingState(false);
      setStatus('Chargement terminé');
    }
  }
}

// [Claude] — 2026-07-07 — Génération waveform : attendue avant la fin du chargement
// du morceau. Le spinner reste affiché pendant toute la durée de l'analyse ; le
// transport n'est débloqué que lorsque l'audio ET la waveform sont prêts.
// Un timeout de 15s évite un blocage infini si le worker Python est coincé.
async function generateWaveformBlocking(preferredWavPath, fallbackOriginalPath) {
  if (!window.electronAPI?.studio?.generateWaveform) return;

  const trackId = currentTrack?.id;
  currentWaveformTrackId = trackId;

  const cleanupProgress = () => {
    if (waveformProgressCleanup) {
      try { waveformProgressCleanup(); } catch (_) {}
      waveformProgressCleanup = null;
    }
  };
  cleanupProgress();

  waveformProgressCleanup = window.electronAPI.studio.onWaveformProgress?.((event) => {
    const percent = event?.percent ?? 0;
    setStatus(`Analyse waveform en cours... ${percent}%`);
    if (els.processingLabel) els.processingLabel.textContent = `Analyse waveform en cours... ${percent}%`;
    if (els.processingBar) els.processingBar.style.width = `${40 + Math.min(50, percent * 0.5)}%`;
  });

  const tryGenerate = async (path) => {
    if (!path) return null;
    try {
      setStatus('Analyse waveform en cours...');
      return await window.electronAPI.studio.generateWaveform(path);
    } catch (err) {
      console.warn('[Studio] generateWaveform failed:', err);
      return null;
    }
  };

  const timeout = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const data = await Promise.race([
    (async () => tryGenerate(preferredWavPath) || await tryGenerate(fallbackOriginalPath))(),
    timeout(15000),
  ]);
  cleanupProgress();

  // Si l'utilisateur a changé de morceau entre-temps, ignorer ce résultat.
  if (currentTrack?.id !== trackId || currentWaveformTrackId !== trackId) return;

  if (data) {
    waveformData = data;
    renderWaveform();
    updateRegionUI();
    updatePlayhead(getStudioCurrentTime(), getEffectiveDuration());
    // Lot B — la waveform apporte souvent la durée avant le lecteur HTML5 :
    // rafraîchir le timer dès que la waveform est prête.
    refreshMediaDurationDisplay();
  } else {
    console.warn('[Studio] waveform generation timed out or failed');
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
  // [Refonte v2/Global] — la waveform hérite de sa couleur skin via CSS.
  ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--r-waveform')
    || getComputedStyle(document.body).getPropertyValue('--text')
    || '#1f2937';

  let peaks = waveformData.peaks || [];
  if (peaks.length === 0) return;

  // La waveform affiche toujours le fichier ENTIER, jamais zoomée sur la région.
  const totalDuration = getTotalDuration() || 1;
  canvas.dataset.totalDuration = String(totalDuration);

  const step = Math.max(1, w / peaks.length);
  for (let i = 0; i < peaks.length; i++) {
    const amp = peaks[i] * center * 0.95;
    const x = i * step;
    ctx.fillRect(x, center - amp, Math.max(1, step - 0.5), amp * 2);
  }
}


function updateProgressUI(current, duration) {
  if (!els.progress || !els.time) return;
  // Lot B — ne jamais afficher NaN/Infinity. Le temps courant et la durée
  // utilisent le même formateur robuste.
  const dur = isValidMediaDuration(duration) ? Number(duration) : getTotalDuration();
  const cur = Number.isFinite(current) ? Math.max(0, Math.min(current, dur > 0 ? dur : current)) : 0;
  const pct = dur > 0 ? (cur / dur) * 100 : 0;
  els.progress.value = Math.max(0, Math.min(100, pct));
  // ABSOLUTE TIMELINE : le timer affiche toujours le temps absolu du fichier.
  els.time.textContent = `${formatDuration(cur)} / ${formatDuration(dur)}`;
  // Mémorise la dernière durée valide pour les rafraîchissements différés.
  if (isValidMediaDuration(dur)) lastKnownDuration = dur;
}

// Lot B — rafraîchit l'affichage du timer à partir de la durée réellement
// disponible. Appelé à loadedmetadata / durationchange / waveform ready,
// ainsi qu'après un changement de fichier. Ne force pas la lecture.
let lastKnownDuration = 0;
function refreshMediaDurationDisplay() {
  const dur = getTotalDuration();
  if (isValidMediaDuration(dur)) {
    lastKnownDuration = dur;
  }
  const cur = getStudioCurrentTime() || 0;
  updateProgressUI(cur, isValidMediaDuration(dur) ? dur : (isValidMediaDuration(lastKnownDuration) ? lastKnownDuration : 0));
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

// [Claude] — 2026-07-07 — Pendant la prévisualisation (région non confirmée), la source de vérité
// de la position de lecture est le curseur VISUEL (slider/waveform), pas le lecteur audio,
// afin d'éviter que l'audio ne reparte d'une ancienne position si currentTime n'a pas encore
// convergé après un seek.
function getVisualCursorTime() {
  const duration = getTotalDuration() || 1;
  const sliderValue = Number(els.progress?.value) || 0;
  return Math.max(0, Math.min((sliderValue / 100) * duration, duration));
}

// [Claude] — 2026-07-07 — Le seek sur un élément HTML5 audio est asynchrone (notamment M4A/AAC).
// Attendre explicitement l'événement 'seeked' avant de lancer play() évite que le son ne parte
// de l'ancienne position.
function seekHtml5Audio(audio, time) {
  return new Promise((resolve) => {
    if (!audio) { resolve(); return; }

    // Déjà à la bonne position : résoudre immédiatement.
    if (audio.readyState >= 1 && Math.abs(audio.currentTime - time) < 0.001) {
      resolve();
      return;
    }

    let resolved = false;
    const done = () => {
      if (resolved) return;
      resolved = true;
      audio.removeEventListener('seeked', onSeeked);
      audio.removeEventListener('error', onError);
      resolve();
    };
    const onSeeked = () => done();
    const onError = () => {
      console.warn('[Studio] seekHtml5Audio error, currentTime may be out of sync');
      done();
    };

    audio.addEventListener('seeked', onSeeked, { once: true });
    audio.addEventListener('error', onError, { once: true });

    try {
      audio.currentTime = time;
    } catch (err) {
      console.warn('[Studio] Failed to set html5Audio.currentTime:', err);
      done();
      return;
    }

    // Timeout de sécurité : certains navigateurs ne déclenchent pas 'seeked' si l'audio n'est pas prêt.
    setTimeout(done, 400);
  });
}

export async function play() {
  if (isLoadingTrack || isPlaying) return;

  // [Claude] — 2026-08-08 — Demande l'audio focus. Si Analyse est en train de
  // jouer, elle est mise en pause sans que ses positions ou son currentTime
  // soient modifiés.
  globalAudioFocusManager.requestFocus('studio');

  const canPlay = await waitHtml5AudioReady();
  if (!canPlay) {
    setStatus('Audio non prêt — réessayez dans un instant');
    return;
  }

  if (!mixer?.hasStems() && !masterPlayer && !html5Audio) return;

  ensureStudioAudioContext();
  if (studioAudioCtx?.state === 'suspended') {
    try { await studioAudioCtx.resume(); } catch (_) {}
  }

  // ABSOLUTE TIMELINE : la position de départ est explicitement synchronisée sur le curseur visuel.
  let resumeTime = getVisualCursorTime();

  // Si une région est confirmée, on restreint la lecture à la région.
  if (regionConfirmed) {
    if (regionEnd !== null && !isInsideRegion(resumeTime)) {
      resumeTime = regionStart;
    }
  }

  // Synchronisation EXPLICITE de tous les lecteurs "silencieux" / de timing sur la position visuelle.
  if (playerAudio && playerAudio.currentTime != null) playerAudio.currentTime = resumeTime;
  if (playerVideo && playerVideo.currentTime != null) playerVideo.currentTime = resumeTime;
  if (masterPlayer) masterPlayer.seek(resumeTime);

  if (mixer?.hasStems()) {
    // Convertir le temps absolu en temps local dans la région extraite.
    const localTime = Math.max(0, Math.min(getRegionDuration(), resumeTime - regionStart));
    mixer.seek(localTime);
    mixer.play();
    if (transpose !== 0) mixer.setDetune(transpose);
  } else if (html5Audio) {
    // Le seek HTML5 audio est asynchrone : on attend explicitement avant de lancer play().
    html5Audio.volume = dbToGain(Number(els.volume?.value) || 0);
    await seekHtml5Audio(html5Audio, resumeTime);
    html5Audio.play().catch((err) => console.error('[Studio] HTML5 play failed:', err));
  } else if (masterPlayer) {
    masterPlayer.seek(resumeTime);
    masterPlayer.play();
    if (transpose !== 0) await masterPlayer.setPitch(transpose);
  }

  // Synchroniser les éléments média visuels sur la position absolue.
  if (playerVideo && playerVideo.currentTime != null) {
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
  } else if (html5Audio) {
    html5Audio.pause();
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
  const target = regionConfirmed ? regionStart : 0;
  if (html5Audio) {
    html5Audio.pause();
    html5Audio.currentTime = target;
  }
  if (playerVideo && playerVideo.currentTime != null) playerVideo.currentTime = target;
  if (playerAudio && playerAudio.currentTime != null) playerAudio.currentTime = target;
  isPlaying = false;
  if (els.playBtn) els.playBtn.textContent = '▶';
  updateProgressUI(target, getEffectiveDuration());
  updatePlayhead(target, getEffectiveDuration());
  stopSyncLoop();
}

function clampToRegion(time) {
  // ABSOLUTE TIMELINE : le seek reste libre sur le fichier entier, sauf si on
  // est en mode lecture région confirmée où on reboucle au début de la région.
  if (regionConfirmed && regionEnd !== null) {
    return Math.max(regionStart, Math.min(time, regionEnd - 0.001));
  }
  return Math.max(0, Math.min(time, getTotalDuration()));
}

function seek(time) {
  if (isLoadingTrack) return;
  const clamped = clampToRegion(time);
  if (playerVideo && playerVideo.currentTime != null) playerVideo.currentTime = clamped;
  if (playerAudio && playerAudio.currentTime != null) playerAudio.currentTime = clamped;
  if (html5Audio) html5Audio.currentTime = clamped;
  if (mixer?.hasStems()) {
    const localTime = Math.max(0, Math.min(getRegionDuration(), clamped - regionStart));
    mixer.seek(localTime);
  } else {
    masterPlayer?.seek(clamped);
  }
  updateProgressUI(clamped, getEffectiveDuration());
  updatePlayhead(clamped, getEffectiveDuration());
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
  const globalText = hasStems ? 'Réanalyser le fichier' : '🎚 Séparer les pistes';
  const v2Text = hasStems ? 'Réanalyser le fichier' : '🎚 Séparer les pistes';
  const title = hasStems
    ? 'Relancer la séparation des pistes à partir du fichier original'
    : 'Séparer les pistes (basse, batterie, voix, autres, piano) avec Demucs';
  if (els.separateBtn) {
    els.separateBtn.textContent = globalText;
    els.separateBtn.title = title;
    els.separateBtn.classList.toggle('studio-separate-done', hasStems);
    els.separateBtn.disabled = !regionConfirmed;
  }
  if (els.separateBtnCenter) {
    els.separateBtnCenter.textContent = v2Text;
    els.separateBtnCenter.title = title;
    els.separateBtnCenter.classList.toggle('studio-separate-done', hasStems);
    els.separateBtnCenter.disabled = !regionConfirmed;
  }
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
    row.dataset.stem = stem; // [Refonte] pastille de couleur par stem en CSS

    const name = document.createElement('div');
    name.className = 'studio-stem-name';
    name.textContent = labels[stem];

    const s = mixerState[stem] || { muted: false, solo: false, volumeDb: 0 };

    const muteBtn = document.createElement('button');
    muteBtn.textContent = 'M';
    muteBtn.title = 'Muet — couper le son de cette piste';
    muteBtn.setAttribute('aria-label', 'Muet');
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
    soloBtn.title = 'Solo — écouter uniquement cette piste';
    soloBtn.setAttribute('aria-label', 'Solo');
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
    volume.title = `Volume ${labels[stem]} (dB)`;
    volume.setAttribute('aria-label', `Volume ${labels[stem]}`);
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
