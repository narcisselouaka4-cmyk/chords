import {
  createSession,
  saveSessionEvents,
  loadSession,
  listSessions,
  deleteSession,
  renameSession,
} from '../recorder/session-manager.js';
import { createRecorder } from '../recorder/recorder.js';
import { createPlayer } from '../recorder/player.js';
// [Refonte 2026-09-03] — Plus d'import depuis analyzer-tab.js.
//
// Ce module visait une API qui n'existe plus : `renderAnalysis` et
// `setAnalyzerNotation` ont été retirés d'analyzer-tab.js (commit 8a1a9e2), et
// `initAnalyzerTab` ne prend plus d'options — c'est main.js qui l'initialise,
// une fois pour toute l'application. L'import restait sans effet tant que
// personne ne chargeait recording-tab.js ; le jour où main.js l'a importé pour
// brancher « Sessions MIDI », l'import manquant a fait échouer l'évaluation du
// module — donc de main.js tout entier : plus de navigation entre onglets, plus
// d'initialisation MIDI côté interface. Une seule ligne d'import a suffi à
// éteindre l'application.

let currentNotation = 'english';
let recorder = null;
let player = null;
let currentSession = null;
let currentEvents = [];
let currentMetadata = null;
let onMidiEvent = null;
let getCurrentChordFn = null;
let refreshHistoryCallback = null;
let recordingTimerInterval = null;
let metronomeInterval = null;
let lastChordName = null;
let chordCountDuringRecording = 0;

const els = {
  sessionList: document.getElementById('session-list'),
  sessionSearch: document.getElementById('session-search'),
  newSessionBtn: document.getElementById('new-session-btn'),
  startRecordingBtn: document.getElementById('start-recording-btn'),
  stopRecordingBtn: document.getElementById('stop-recording-btn'),
  recordingControls: document.getElementById('recording-controls'),
  recordingStatus: document.getElementById('recording-status'),
  recordingCountdown: document.getElementById('recording-countdown'),
  recordingTimer: document.getElementById('recording-timer'),
  recordingStats: document.getElementById('recording-stats'),
  recordingInitModal: document.getElementById('recording-init-modal'),
  metronomeToggle: document.getElementById('metronome-toggle'),
  selectedSessionInfo: document.getElementById('selected-session-info'),
  analysisContent: document.getElementById('analysis-content'),
  analyzeSessionBtn: document.getElementById('analyze-session-btn'),
  modalOverlay: document.getElementById('session-end-modal'),
  modalStats: document.getElementById('modal-stats'),
  modalKeepBtn: document.getElementById('modal-keep'),
  modalDeleteBtn: document.getElementById('modal-delete'),
  modalReplayBtn: document.getElementById('modal-replay'),
  transportBar: document.getElementById('transport-bar'),
  transportRewind: document.getElementById('transport-rewind'),
  transportPlay: document.getElementById('transport-play'),
  transportSlider: document.getElementById('transport-slider'),
  sessionTitleInput: document.getElementById('session-title-input'),
  sessionBpmInput: document.getElementById('session-bpm-input'),
  bpmRow: document.getElementById('bpm-row'),
  countdownOverlay: document.getElementById('countdown-overlay'),
  countdownNumber: document.getElementById('countdown-number'),
};

export function initRecordingTab({
  notation = 'english',
  feedMidiEvent,
  getCurrentChord,
  refreshHistory,
} = {}) {
  currentNotation = notation;
  onMidiEvent = feedMidiEvent;
  getCurrentChordFn = getCurrentChord;
  refreshHistoryCallback = refreshHistory;

  // L'onglet Analyse est initialisé une seule fois, par main.js. L'appel qui se
  // trouvait ici en posait un second jeu d'écouteurs sur les mêmes boutons :
  // un clic sur « Lancer l'analyse » déclenchait deux analyses.

  player = createPlayer({
    onNoteOn: (note, velocity) => feedMidiEvent?.('noteOn', note, velocity),
    onNoteOff: (note) => feedMidiEvent?.('noteOff', note),
    onSustain: (value) => feedMidiEvent?.('sustain', value),
    onPitchWheel: (value) => feedMidiEvent?.('pitchWheel', value),
    onModWheel: (value) => feedMidiEvent?.('modWheel', value),
  });

  bindSessionForm();
  bindRecordingControls();
  bindModal();
  bindSessionSearch();
  bindAnalyzeButton();
  bindTransportBar();
  refreshSessionList();

  switchToRecordingTab();
}

export function switchToRecordingTab() {
  const event = new CustomEvent('app-switch-tab', { detail: { tab: 'analysis' } });
  document.dispatchEvent(event);
}

function bindSessionForm() {
  els.newSessionBtn?.addEventListener('click', () => {
    els.recordingInitModal.style.display = 'flex';
    els.newSessionBtn.style.display = 'none';
    if (els.sessionTitleInput) els.sessionTitleInput.value = '';
    if (els.sessionTitleInput) els.sessionTitleInput.focus();
    if (els.bpmRow) {
      els.bpmRow.style.display = els.metronomeToggle?.checked ? 'flex' : 'none';
    }
  });
  els.startRecordingBtn?.addEventListener('click', () => startCountdown());

  if (els.metronomeToggle && els.bpmRow) {
    els.metronomeToggle.addEventListener('change', () => {
      els.bpmRow.style.display = els.metronomeToggle.checked ? 'flex' : 'none';
    });
  }
}

function startCountdown() {
  els.recordingInitModal.style.display = 'none';
  els.recordingControls.style.display = 'flex';
  const countdownEl = els.recordingCountdown;
  countdownEl.style.display = 'block';

  if (els.countdownOverlay) {
    els.countdownOverlay.style.display = 'flex';
  }
  if (els.countdownNumber) {
    els.countdownNumber.textContent = '3';
  }

  let count = 3;
  countdownEl.textContent = '3';

  const interval = setInterval(() => {
    count--;
    if (count > 0) {
      countdownEl.textContent = String(count);
      if (els.countdownNumber) els.countdownNumber.textContent = String(count);
    } else if (count === 0) {
      countdownEl.textContent = 'GO !';
      if (els.countdownNumber) els.countdownNumber.textContent = 'GO !';
    } else {
      clearInterval(interval);
      countdownEl.style.display = 'none';
      if (els.countdownOverlay) els.countdownOverlay.style.display = 'none';
      startRecording();
    }
  }, 800);
}

function bindRecordingControls() {
  els.stopRecordingBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    stopRecording();
  });
}

function bindModal() {
  els.modalKeepBtn?.addEventListener('click', () => keepSession());
  els.modalDeleteBtn?.addEventListener('click', () => discardSession());
  els.modalReplayBtn?.addEventListener('click', () => replaySession());
}

function bindSessionSearch() {
  els.sessionSearch?.addEventListener('input', () => {
    refreshSessionList();
  });
}

async function startRecording() {
  try {
    if (!window.electronAPI?.files) {
      throw new Error('Mode navigateur non supporté pour l\'enregistrement. Lancez l\'application via Electron.');
    }

    const now = new Date();
    const dateStr = now.toLocaleDateString('fr-FR') + ' ' + now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    const title = els.sessionTitleInput?.value?.trim() || `Session ${dateStr}`;
    const tempo = els.metronomeToggle?.checked ? Number(els.sessionBpmInput?.value) || 90 : 120;
    const metadata = {
      name: title,
      key: '',
      tempo,
      comments: '',
      tags: [],
    };
    currentSession = await createSession(metadata);
    if (!currentSession || !currentSession.id) {
      throw new Error('La session n\'a pas pu être créée');
    }

    currentEvents = [];
    currentMetadata = metadata;
    lastChordName = null;
    chordCountDuringRecording = 0;

    recorder = createRecorder();
    recorder.start();

    startMetronome();
    setRecordingStatus('● Enregistrement en cours...', 'recording');
    startRecordingTimer();
    blinkStopButton(true);
  } catch (err) {
    console.error('Failed to start recording:', err);
    setRecordingStatus(`Erreur : ${err.message}`, 'error');
    if (els.modalOverlay) {
      showEndModal({ duration: 0, noteCount: 0, chordCount: 0, error: err.message });
    }
  }
}

function blinkStopButton(on) {
  const btn = els.stopRecordingBtn;
  if (!btn) return;
  if (on) {
    let visible = true;
    btn._blink = setInterval(() => {
      visible = !visible;
      btn.style.opacity = visible ? '1' : '0.3';
    }, 600);
  } else {
    if (btn._blink) clearInterval(btn._blink);
    btn.style.opacity = '1';
  }
}

function startMetronome() {
  if (!els.metronomeToggle?.checked) return;
  stopMetronome();
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state === 'suspended') ctx.resume();
  const bpm = Number(els.sessionBpmInput?.value) || 90;
  const intervalMs = 60000 / bpm;
  metronomeInterval = setInterval(() => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = 1200;
    gain.gain.value = 0.15;
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.05);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.05);
  }, intervalMs);
}

function stopMetronome() {
  if (metronomeInterval) {
    clearInterval(metronomeInterval);
    metronomeInterval = null;
  }
}

async function stopRecording() {
  if (!recorder || !currentSession) return;
  stopMetronome();
  currentEvents = recorder.stop();
  stopRecordingTimer();
  blinkStopButton(false);

  const stats = recorder.getStats();
  stats.chordCount = chordCountDuringRecording;
  currentSession = { ...currentSession, ...stats };

  showRecordingUI(false);
  showEndModal(stats);
}

function showRecordingUI(active) {
  if (!els.recordingControls || !els.newSessionBtn) return;
  els.recordingControls.style.display = active ? 'flex' : 'none';
  els.newSessionBtn.style.display = active ? 'none' : 'inline-flex';
  if (els.recordingInitModal) els.recordingInitModal.style.display = 'none';
}

function setRecordingStatus(text, state) {
  if (!els.recordingStatus) return;
  els.recordingStatus.textContent = text;
  els.recordingStatus.dataset.state = state;
}

function startRecordingTimer() {
  stopRecordingTimer();
  recordingTimerInterval = setInterval(() => {
    if (!recorder) return;
    const seconds = Math.floor(recorder.getCurrentTime());
    els.recordingTimer.textContent = formatDuration(seconds);
    const stats = recorder.getStats();
    const chord = getCurrentChordFn?.();
    if (chord && chord.name && chord.name !== lastChordName) {
      lastChordName = chord.name;
      chordCountDuringRecording += 1;
    }
    els.recordingStats.textContent = `${stats.noteCount} notes · ${chordCountDuringRecording} accords · Cours : ${chord?.name || '—'}`;
  }, 200);
}

function stopRecordingTimer() {
  if (recordingTimerInterval) {
    clearInterval(recordingTimerInterval);
    recordingTimerInterval = null;
  }
}

function showEndModal(stats) {
  if (!els.modalOverlay || !els.modalStats) return;
  els.modalStats.innerHTML = `
    <div><strong>Nom :</strong> ${escapeHtml(currentSession.name)}</div>
    <div><strong>Durée :</strong> ${formatDuration(stats.duration)}</div>
    <div><strong>Notes :</strong> ${stats.noteCount}</div>
    <div><strong>Accords :</strong> ${stats.chordCount}</div>
  `;
  els.modalOverlay.style.display = 'flex';
}

function hideEndModal() {
  if (els.modalOverlay) els.modalOverlay.style.display = 'none';
}

async function keepSession() {
  hideEndModal();
  try {
    const stats = { ...recorder.getStats(), chordCount: chordCountDuringRecording };
    await saveSessionEvents(currentSession.id, currentEvents, stats);
    currentSession = { ...currentSession, ...stats };
    setRecordingStatus('Session sauvegardée.', 'saved');
    refreshSessionList();
    selectSession(currentSession.id);
    // Activer directement l'analyse
    if (els.analyzeSessionBtn) els.analyzeSessionBtn.disabled = false;
  } catch (err) {
    console.error('Failed to save recording:', err);
    setRecordingStatus(`Erreur de sauvegarde : ${err.message}`, 'error');
  }
}

async function discardSession() {
  hideEndModal();
  try {
    if (currentSession?.id) await deleteSession(currentSession.id);
  } catch (err) {
    console.error('Failed to delete session:', err);
  }
  if (els.transportBar) els.transportBar.style.display = 'none';
  currentSession = null;
  currentEvents = [];
  currentMetadata = null;
  setRecordingStatus('Session supprimée.', 'deleted');
  refreshSessionList();
}

async function replaySession() {
  await keepSession();
  if (currentSession && player) {
    player.stop();
    player.play();
    startTransportLoop();
  }
}

export function feedRecorderNoteOn(note, velocity) {
  recorder?.noteOn(note, velocity);
}

export function feedRecorderNoteOff(note) {
  recorder?.noteOff(note);
}

export function feedRecorderSustain(value) {
  recorder?.sustain(value);
}

export function feedRecorderPitchWheel(value) {
  recorder?.pitchWheel(value);
}

export function feedRecorderModWheel(value) {
  recorder?.modWheel(value);
}

async function refreshSessionList() {
  if (!els.sessionList) return;
  try {
    const sessions = await listSessions();
    const query = (els.sessionSearch?.value || '').trim().toLowerCase();
    const filtered = query
      ? sessions.filter((s) => {
          try {
            return (
              (s.name || '').toLowerCase().includes(query) ||
              (s.comments || '').toLowerCase().includes(query) ||
              (s.tags || []).some((t) => (t || '').toLowerCase().includes(query))
            );
          } catch { return false; }
        })
      : sessions;
    renderSessionList(filtered);
  } catch (err) {
    console.error('Failed to list sessions:', err);
    els.sessionList.innerHTML = `<p class="detail-hint">Impossible de charger les sessions.</p>`;
  }
}

function renderSessionList(sessions) {
  if (!els.sessionList) return;
  els.sessionList.innerHTML = '';

  if (sessions.length === 0) {
    els.sessionList.innerHTML = `<p class="detail-hint">Aucune session enregistrée.</p>`;
    return;
  }

  for (const session of sessions) {
    const item = document.createElement('div');
    item.className = 'session-item';
    const date = new Date(session.date).toLocaleString('fr-FR');
    const duration = formatDuration(session.duration);
    const isSelected = currentSession && currentSession.id === session.id;
    if (isSelected) item.classList.add('active');

    item.innerHTML = `
      <div class="session-name" contenteditable="false" title="${escapeHtml(session.name)}">${escapeHtml(session.name)}</div>
      <div class="session-meta">${date} · ${duration} · ${session.noteCount || 0} notes · ${session.chordCount || 0} accords${session.key ? ` · ${session.key}` : ''}${session.tempo ? ` · ${session.tempo} BPM` : ''}</div>
      <div class="session-actions">
        <button class="session-action delete" data-id="${session.id}" title="Supprimer">🗑</button>
      </div>
    `;

    const nameEl = item.querySelector('.session-name');
    nameEl.addEventListener('dblclick', () => {
      nameEl.contentEditable = 'true';
      nameEl.focus();
    });
    nameEl.addEventListener('blur', async () => {
      nameEl.contentEditable = 'false';
      await renameSession(session.id, nameEl.textContent.trim() || session.name);
      refreshSessionList();
    });
    nameEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        nameEl.blur();
      }
    });

    item.addEventListener('click', (e) => {
      if (e.target.closest('.delete')) return;
      loadAndPlaySession(session.id);
    });
    item.querySelector('.delete')?.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (confirm(`Supprimer la session "${session.name}" ?`)) {
        await deleteSession(session.id);
        if (currentSession?.id === session.id) {
          currentSession = null;
          currentEvents = [];
          resetSelectedSessionInfo();
        }
        refreshSessionList();
      }
    });

    els.sessionList.appendChild(item);
  }
}

function selectSession(sessionId) {
  loadAndPlaySession(sessionId);
}

async function loadAndPlaySession(sessionId, autoPlay = false) {
  try {
    const data = await loadSession(sessionId);
    currentSession = data.session;
    currentEvents = data.events;
    currentMetadata = data.metadata;

    player.load(currentEvents);
    renderSelectedSessionInfo();
    refreshSessionList();
    if (els.analyzeSessionBtn) els.analyzeSessionBtn.disabled = false;
    if (els.analysisContent) {
      els.analysisContent.innerHTML = '<p class="detail-hint">Cliquez sur « Analyser » pour générer l\'analyse de cette session.</p>';
    }
    if (els.transportBar) els.transportBar.style.display = 'flex';
    updateTransportUI();
    if (autoPlay) {
      player.play();
      startTransportLoop();
    }
  } catch (err) {
    console.error('Failed to load session:', err);
    setRecordingStatus(`Erreur de lecture : ${err.message}`, 'error');
  }
}

function renderSelectedSessionInfo() {
  if (!els.selectedSessionInfo || !currentSession) return;
  const duration = formatDuration(currentSession.duration);
  els.selectedSessionInfo.innerHTML = `
    <div class="info-row"><strong>${escapeHtml(currentSession.name)}</strong></div>
    <div class="info-row">${currentSession.noteCount || 0} notes · ${currentSession.chordCount || 0} accords · ${duration}</div>
    <div class="info-row">${currentSession.key || 'Tonalité non définie'} · ${currentSession.tempo || '—'} BPM</div>
    <div class="info-row">${escapeHtml(currentSession.comments || '')}</div>
    <div class="info-tags">${(currentSession.tags || []).map((t) => `<span class="tag">${escapeHtml(t)}</span>`).join('')}</div>
  `;
}

function resetSelectedSessionInfo() {
  if (!els.selectedSessionInfo) return;
  els.selectedSessionInfo.innerHTML = `<p class="detail-hint">Aucune session sélectionnée. Créez une nouvelle session ou choisissez-en une dans la liste.</p>`;
}

function formatDuration(seconds) {
  if (!seconds || isNaN(seconds)) return '00:00';
  const total = Math.floor(Number(seconds));
  const mins = String(Math.floor(total / 60)).padStart(2, '0');
  const secs = String(total % 60).padStart(2, '0');
  return `${mins}:${secs}`;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function setRecordingNotation(notation) {
  // La notation de l'onglet Analyse est gérée par analyzer-tab.js lui-même
  // depuis la refonte ; on ne conserve ici que celle des Sessions MIDI.
  currentNotation = notation;
}

function bindAnalyzeButton() {
  if (!els.analyzeSessionBtn) return;
  els.analyzeSessionBtn.addEventListener('click', async () => {
    if (!currentSession || !currentEvents.length) return;
    await runAnalysis();
  });
}

// [Refonte 2026-09-03] — L'analyse d'une session enregistrée n'est plus câblée.
// Ses ancrages DOM (#analysis-content, #analyze-session-btn) ont disparu de
// index.html lors de la refonte de la navigation, et le rendu qu'elle appelait
// a été retiré d'analyzer-tab.js : le chemin était mort des deux côtés. On le
// laisse explicitement inerte plutôt que de simuler une fonctionnalité absente.
// Enregistrement, relecture et gestion des sessions ne sont pas concernés.
async function runAnalysis() {
  console.info('[Sessions MIDI] Analyse de session non disponible dans cette version.');
}

let transportRafId = null;

function bindTransportBar() {
  if (!els.transportBar) return;

  els.transportRewind?.addEventListener('click', () => {
    player?.stop();
    updateTransportUI();
  });

  els.transportPlay?.addEventListener('click', () => {
    if (!player) return;
    if (player.isPlaying) {
      player.pause();
    } else {
      if (player.getCurrentTime() >= player.getDuration()) {
        player.stop();
      }
      player.play();
    }
    updateTransportUI();
    if (player.isPlaying) startTransportLoop();
  });

  els.transportSlider?.addEventListener('input', () => {
    const duration = player?.getDuration() || 0;
    const val = Number(els.transportSlider.value);
    // Mise à jour visuelle uniquement pendant le drag ; le son se déclenche au mouseup.
    updateTransportSliderOnly((val / 100) * duration, duration);
  });

  els.transportSlider?.addEventListener('change', () => {
    const duration = player?.getDuration() || 0;
    const val = Number(els.transportSlider.value);
    player?.seek((val / 100) * duration);
  });
}

function startTransportLoop() {
  if (transportRafId) cancelAnimationFrame(transportRafId);
  function loop() {
    if (!player || !player.isPlaying) {
      updateTransportUI();
      transportRafId = null;
      return;
    }
    updateTransportUI();
    transportRafId = requestAnimationFrame(loop);
  }
  transportRafId = requestAnimationFrame(loop);
}

function updateTransportSliderOnly(cur, dur) {
  if (!els.transportBar || !els.transportSlider) return;
  els.transportSlider.value = dur > 0 ? String((cur / dur) * 100) : '0';
}

function updateTransportUI() {
  if (!els.transportBar) return;
  const dur = player?.getDuration() || 0;
  const cur = player?.getCurrentTime() || 0;
  updateTransportSliderOnly(cur, dur);
  if (els.transportPlay) {
    els.transportPlay.textContent = player?.isPlaying ? '⏸' : '▶';
  }
}
