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
import { playNote, releaseNote, resumeAudio } from '../audio/simple-synth.js';
import { segmentSessionEvents, nameChordSegments } from '../recorder/session-analysis.js';
// [Refonte Astra 12/09] — Le paysage harmonique remplace l'ancienne frise de
// blocs, qui forçait toute la session à tenir dans la largeur. buildNoteWindows
// est la fonction déjà utilisée par l'analyse de session : on la réutilise, on
// n'en écrit pas une seconde.
import { buildNoteWindows } from '../recorder/session-analysis.js';
import { renderHarmonicRoll, windowsToRollNotes } from './refonte/astra-harmonic-roll.js';
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
let harmonicRoll = null;      // instance du paysage harmonique
let rollSpatial = true;       // Relief (true) ou 2D (false)
let rollNotes = [];
let rollDuration = 1;
let currentMetadata = null;
let onMidiEvent = null;
let getCurrentChordFn = null;
let refreshHistoryCallback = null;
let recordingTimerInterval = null;
let metronomeInterval = null;
let lastChordName = null;
let chordCountDuringRecording = 0;

const els = {
  sessionList: document.getElementById('midi-session-list'),
  sessionSearch: document.getElementById('midi-session-search'),
  newSessionBtn: document.getElementById('midi-session-new-btn'),
  startRecordingBtn: document.getElementById('midi-session-start-btn'),
  stopRecordingBtn: document.getElementById('midi-session-stop-btn'),
  recordingControls: document.getElementById('midi-session-controls'),
  recordingStatus: document.getElementById('midi-session-status'),
  recordingCountdown: document.getElementById('midi-session-countdown'),
  recordingTimer: document.getElementById('midi-session-timer'),
  recordingStats: document.getElementById('midi-session-stats'),
  recordingInitModal: document.getElementById('midi-session-init-modal'),
  metronomeToggle: document.getElementById('midi-session-metronome-toggle'),
  selectedSessionInfo: document.getElementById('midi-session-info'),
  carnet: document.getElementById('midi-session-carnet'),
  carnetStickyHead: document.getElementById('carnet-sticky-head'),
  carnetSessionTitle: document.getElementById('carnet-session-title'),
  carnetSessionMeta: document.getElementById('carnet-session-meta'),
  carnetExploreAll: document.getElementById('carnet-explore-all'),
  carnetTimeline: document.getElementById('carnet-timeline'),
  carnetEntries: document.getElementById('carnet-entries'),
  modalOverlay: document.getElementById('midi-session-end-modal'),
  modalStats: document.getElementById('midi-session-modal-stats'),
  modalKeepBtn: document.getElementById('midi-session-keep'),
  modalDeleteBtn: document.getElementById('midi-session-delete'),
  modalReplayBtn: document.getElementById('midi-session-replay'),
  transportBar: document.getElementById('midi-session-transport'),
  transportRewind: document.getElementById('midi-session-rewind'),
  transportPlay: document.getElementById('midi-session-play'),
  transportSlider: document.getElementById('midi-session-slider'),
  sessionTitleInput: document.getElementById('midi-session-title-input'),
  sessionBpmInput: document.getElementById('midi-session-bpm-input'),
  bpmRow: document.getElementById('midi-session-bpm-row'),
  countdownOverlay: document.getElementById('midi-session-countdown-overlay'),
  countdownNumber: document.getElementById('midi-session-countdown-number'),
  copilotSessionBtn: document.getElementById('midi-session-copilot-btn'),
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

  // NOTE : recording-tab.js est initialisé au chargement de main.js. À ce
  // moment, l'onglet Sessions MIDI n'est pas forcément affiché. On initialise
  // le player sans branchement au clavier principal : le câblage MIDI live
  // reste dans main.js. Le player sert uniquement à la relecture des sessions.
  player = createPlayer({
    onNoteOn: (note, velocity) => playNote(note, velocity),
    onNoteOff: (note) => releaseNote(note),
    onSustain: () => {},
    onPitchWheel: () => {},
    onModWheel: () => {},
  });

  bindSessionForm();
  bindRecordingControls();
  bindModal();
  bindSessionSearch();
  bindCopilotButton();
  bindTransportBar();
  bindCarnetEvents();
  bindProjectionSwitch();
  // Paysage harmonique vide dès l'ouverture : la maquette montre la scène et
  // son message d'attente, pas un cadre gris.
  mountHarmonicRoll();
  refreshSessionList();

  switchToRecordingTab();
}

export function switchToRecordingTab() {
  // Ne rien faire : cette fonction datait du temps où Sessions MIDI était
  // l'onglet Analyse. Aujourd'hui c'est une sous-vue de l'onglet Entraînement,
  // gérée par app-switch-training-view dans main.js. Bascouler vers l'onglet
  // Analyse ici cassait la navigation.
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

    if (els.carnet) els.carnet.style.display = 'none';
    stopCarnetLoop();

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
  if (els.carnet) els.carnet.style.display = 'none';
  stopCarnetLoop();
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
          currentMetadata = null;
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
    renderCarnet();
    refreshSessionList();
    if (els.copilotSessionBtn) els.copilotSessionBtn.disabled = false;
    if (els.transportBar) els.transportBar.style.display = 'flex';
    if (els.carnet) els.carnet.style.display = 'flex';
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

function formatTimeShort(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const total = Math.floor(seconds);
  const m = Math.floor(total / 60);
  const s = String(total % 60).padStart(2, '0');
  return `${m}:${s}`;
}

function renderCarnet() {
  if (!currentSession || !currentEvents.length) return;

  const segments = nameChordSegments(segmentSessionEvents(currentEvents));
  if (!segments.length) return;

  const totalDuration = currentSession.duration || segments[segments.length - 1].end || 1;

  renderCarnetHeader(segments, totalDuration);
  renderTimeline(segments, totalDuration);
  renderCarnetEntries(segments);
  bindCarnetPlayButtons(segments);
  bindCarnetExploreButtons(segments);
  bindCarnetExploreAll(segments);
}

function renderCarnetHeader(segments, totalDuration) {
  if (!els.carnetSessionTitle || !els.carnetSessionMeta) return;
  const chordCount = segments.filter((s) => s.type === 'chord').length;
  const durationStr = formatDuration(totalDuration);
  els.carnetSessionTitle.textContent = currentSession.name;
  els.carnetSessionMeta.textContent = `${durationStr} · ${currentSession.noteCount || 0} notes · ${chordCount} vrais moments d'accord · ${currentSession.key || 'tonalité non définie'}`;
}

// [Refonte Astra 12/09] — « Paysage harmonique ». L'ancienne frise plaçait un
// bloc par segment, à l'échelle de la largeur disponible : au-delà d'une
// vingtaine de moments, elle devenait un dégradé illisible. Le relief d'Astra
// affiche les notes elles-mêmes — hauteur MIDI en profondeur, vélocité en
// élévation — et se lit à n'importe quelle densité.
//
// Les segments restent l'entrée de la fonction (l'appelant n'a pas changé),
// mais les notes viennent de buildNoteWindows(), sur les évènements bruts.
function renderTimeline(segments, totalDuration) {
  if (!els.carnetTimeline) return;
  rollDuration = Math.max(1, Number(totalDuration) || 1);
  rollNotes = windowsToRollNotes(buildNoteWindows(currentEvents || []));
  mountHarmonicRoll();
}

function mountHarmonicRoll() {
  if (!els.carnetTimeline) return;
  const payload = {
    notes: rollNotes,
    duration: rollDuration,
    position: player?.getCurrentTime?.() || 0,
    spatial: rollSpatial,
    recording: Boolean(recorder?.isRecording),
    onSeek: (time) => {
      player?.seek(time);
      updateTransportUI();
    },
  };
  if (harmonicRoll) harmonicRoll.update(payload);
  else harmonicRoll = renderHarmonicRoll(els.carnetTimeline, payload);
}

function updateHarmonicRollPosition(position) {
  harmonicRoll?.update({ position: Number(position) || 0 });
}

// Bascule 2D / Relief de la maquette.
function bindProjectionSwitch() {
  const group = document.getElementById('midi-roll-projection');
  if (!group) return;
  group.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-projection]');
    if (!btn) return;
    rollSpatial = btn.dataset.projection === 'spatial';
    group.querySelectorAll('button[data-projection]').forEach((b) => {
      const on = b === btn;
      b.classList.toggle('is-active', on);
      b.setAttribute('aria-pressed', String(on));
    });
    mountHarmonicRoll();
  });
}

function renderCarnetEntries(segments) {
  if (!els.carnetEntries) return;
  els.carnetEntries.innerHTML = '';

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const entry = document.createElement('div');
    entry.className = `carnet-entry ${seg.type}`;
    entry.dataset.index = String(i);
    entry.id = `carnet-entry-${i}`;

    const timeStr = formatTimeShort(seg.start);
    const endTimeStr = formatTimeShort(seg.end);

    if (seg.type === 'chord') {
      const chordName = seg.chordName || 'Accord non identifié';
      entry.innerHTML = `
        <button class="carnet-play-btn" data-index="${i}" title="Écouter ce moment en boucle">▶</button>
        <div class="carnet-entry-time">${timeStr}</div>
        <div class="carnet-entry-main">
          <div class="carnet-entry-label">${escapeHtml(chordName)} <span class="carnet-chip chord-tag">accord</span></div>
          <div class="carnet-entry-detail">${seg.notes?.length || 0} notes tenues ensemble · ${seg.chordName ? 'voicing main gauche + main droite' : 'accord non identifié'}</div>
        </div>
        <button class="carnet-explore-btn" data-index="${i}">✨ Explorer ce moment</button>
      `;
    } else {
      entry.innerHTML = `
        <button class="carnet-play-btn" data-index="${i}" title="Écouter ce passage en boucle">▶</button>
        <div class="carnet-entry-time">${timeStr}</div>
        <div class="carnet-entry-main">
          <div class="carnet-entry-label">Passage mélodique <span class="carnet-chip melody-tag">${seg.notes?.length || 0} notes</span></div>
          <div class="carnet-entry-detail">${timeStr} → ${endTimeStr} · aucune note tenue simultanément — pas un accord</div>
        </div>
        <button class="carnet-explore-btn" data-index="${i}">✨ Explorer ce passage</button>
      `;
    }
    els.carnetEntries.appendChild(entry);
  }
}

let carnetLoopRafId = null;
let carnetLoopSegment = null;
let carnetLoopStart = 0;
let carnetLoopEnd = 0;

function bindCarnetPlayButtons(segments) {
  if (!els.carnetEntries) return;
  els.carnetEntries.querySelectorAll('.carnet-play-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const index = Number(btn.dataset.index);
      const seg = segments[index];
      if (!seg) return;
      toggleCarnetLoop(seg, btn, segments);
    });
  });
}

async function toggleCarnetLoop(seg, btn, segments) {
  const isCurrentlyPlaying = carnetLoopSegment === seg;

  stopCarnetLoop();

  if (!isCurrentlyPlaying) {
    carnetLoopSegment = seg;
    carnetLoopStart = seg.start;
    carnetLoopEnd = seg.end;
    btn.classList.add('is-playing');
    btn.textContent = '⏸';

    player.seek(carnetLoopStart);
    await resumeAudio();
    player.play();
    startCarnetLoop();
  }
}

function startCarnetLoop() {
  if (carnetLoopRafId) cancelAnimationFrame(carnetLoopRafId);
  function loop() {
    if (!carnetLoopSegment || !player || !player.isPlaying) {
      stopCarnetLoop();
      return;
    }
    const cur = player.getCurrentTime();
    if (cur >= carnetLoopEnd - 0.05) {
      player.seek(carnetLoopStart);
    }
    carnetLoopRafId = requestAnimationFrame(loop);
  }
  carnetLoopRafId = requestAnimationFrame(loop);
}

function stopCarnetLoop() {
  player?.pause();
  if (carnetLoopRafId) {
    cancelAnimationFrame(carnetLoopRafId);
    carnetLoopRafId = null;
  }
  if (els.carnetEntries) {
    els.carnetEntries.querySelectorAll('.carnet-play-btn.is-playing').forEach((b) => {
      b.classList.remove('is-playing');
      b.textContent = '▶';
    });
  }
  carnetLoopSegment = null;
  carnetLoopStart = 0;
  carnetLoopEnd = 0;
}

function bindCarnetExploreButtons(segments) {
  if (!els.carnetEntries) return;
  els.carnetEntries.querySelectorAll('.carnet-explore-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const index = Number(btn.dataset.index);
      const seg = segments[index];
      if (!seg) return;
      openCopilotForSegment(seg);
    });
  });
}

function bindCarnetExploreAll(segments) {
  if (!els.carnetExploreAll) return;
  els.carnetExploreAll.disabled = false;
  els.carnetExploreAll.onclick = () => {
    if (!currentSession) return;
    const context = buildSessionContext();
    if (!context) return;
    document.dispatchEvent(new CustomEvent('app-switch-training-view', { detail: { view: 'copilot' } }));
    document.dispatchEvent(new CustomEvent('copilot-switch-to-session', { detail: context }));
    const starter = 'Que peux-tu me dire sur cette session ?';
    setTimeout(() => {
      document.dispatchEvent(new CustomEvent('copilot-send-message', { detail: { message: starter } }));
    }, 50);
  };
}

function openCopilotForSegment(seg) {
  if (!currentSession) return;
  const context = buildSessionContext();
  if (!context) return;
  document.dispatchEvent(new CustomEvent('app-switch-training-view', { detail: { view: 'copilot' } }));
  document.dispatchEvent(new CustomEvent('copilot-switch-to-session', { detail: context }));

  let starter = '';
  if (seg.type === 'chord') {
    starter = `Que peux-tu me dire sur l'accord ${seg.chordName || 'non identifié'} vers ${formatTimeShort(seg.start)} ?`;
  } else {
    starter = `Que peux-tu me dire sur le passage mélodique entre ${formatTimeShort(seg.start)} et ${formatTimeShort(seg.end)} ?`;
  }
  setTimeout(() => {
    document.dispatchEvent(new CustomEvent('copilot-send-message', { detail: { message: starter } }));
  }, 50);
}

function bindCarnetEvents() {
  if (!els.carnetTimeline || !els.carnetEntries) return;

  // [Refonte Astra 12/09] — L'ancienne frise .tl-seg n'existe plus : le
  // paysage harmonique est composé de notes, et un clic sur une note déplace
  // directement la tête de lecture (rappel onSeek de mountHarmonicRoll()).

  const mainContainer = document.querySelector('.midi-sessions-main');
  if (mainContainer) {
    mainContainer.addEventListener('scroll', () => {
      mainContainer.classList.toggle('is-scrolled', mainContainer.scrollTop > 4);
    });
  }
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

function buildSessionContext() {
  if (!currentSession) return null;

  // Le vrai type d'événement stocké est 'note_on' (avec underscore), jamais
  // 'noteOn'. Ce comptage ne sert que de repli si currentSession.noteCount
  // est absent — currentSession.noteCount reste prioritaire pour rester
  // cohérent avec ce qu'affiche déjà l'en-tête du carnet.
  const noteEvents = (currentEvents || []).filter((e) => e.type === 'note_on' && e.velocity > 0);

  // On ne cherche plus ev.chordName sur les événements bruts (ce champ n'a
  // jamais existé) — on rejoue la session à travers la même analyse fraîche
  // que le carnet (segmentSessionEvents + nameChordSegments), qui est déjà
  // la source de vérité affichée à l'écran.
  const segments = nameChordSegments(segmentSessionEvents(currentEvents || []));
  const chordSegments = segments.filter((s) => s.type === 'chord');

  // Liste chronologique des vrais moments d'accord. Pas de déduplication par
  // nom : une grille qui repasse par le même accord doit apparaître à chaque
  // occurrence, pas une seule fois.
  const chordMoments = chordSegments
    .filter((s) => s.chordName)
    .map((s) => ({ start: s.start, label: s.chordName }));

  return {
    type: 'session',
    sessionId: currentSession.id,
    name: currentSession.name,
    duration: Number.isFinite(currentSession.duration) ? currentSession.duration : 0,
    tempo: currentSession.tempo || null,
    key: currentSession.key || null,
    noteCount: currentSession.noteCount || noteEvents.length || 0,
    // chordCount reflète maintenant le VRAI nombre de moments d'accord
    // (même calcul que renderCarnetHeader()), plus le vieux compteur périmé
    // de l'enregistrement live.
    chordCount: chordSegments.length,
    comments: currentSession.comments || '',
    chords: chordMoments,
  };
}

function bindCopilotButton() {
  if (!els.copilotSessionBtn) return;
  els.copilotSessionBtn.addEventListener('click', () => {
    if (!currentSession) return;
    const context = buildSessionContext();
    if (!context) return;
    document.dispatchEvent(new CustomEvent('app-switch-training-view', { detail: { view: 'copilot' } }));
    document.dispatchEvent(new CustomEvent('copilot-switch-to-session', { detail: context }));
    const starter = 'Que peux-tu me dire sur cette session ?';
    setTimeout(() => {
      document.dispatchEvent(new CustomEvent('copilot-send-message', { detail: { message: starter } }));
    }, 50);
  });
}

let transportRafId = null;

const PLAY_SVG = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m7 4 13 8-13 8z" fill="currentColor"/></svg>';
const PAUSE_SVG = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" aria-hidden="true"><path d="M9 5v14M15 5v14"/></svg>';

function bindTransportBar() {
  if (!els.transportBar) return;

  els.transportRewind?.addEventListener('click', () => {
    player?.stop();
    updateTransportUI();
  });

  els.transportPlay?.addEventListener('click', async () => {
    if (!player) return;
    if (player.isPlaying) {
      player.pause();
    } else {
      if (player.getCurrentTime() >= player.getDuration()) {
        player.stop();
      }
      await resumeAudio();
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
  const percent = dur > 0 ? (cur / dur) * 100 : 0;
  els.transportSlider.value = String(percent);
  els.transportSlider.style.setProperty('--progress', `${percent}%`);
}

function updateTransportUI() {
  if (!els.transportBar) return;
  const dur = player?.getDuration() || 0;
  const cur = player?.getCurrentTime() || 0;
  updateTransportSliderOnly(cur, dur);
  if (els.transportPlay) {
    // innerHTML et non textContent : le bouton porte une icône SVG depuis la
    // refonte, un textContent la supprimerait au premier changement d'état.
    els.transportPlay.innerHTML = player?.isPlaying ? PAUSE_SVG : PLAY_SVG;
    els.transportPlay.classList.toggle('is-playing', Boolean(player?.isPlaying));
  }
  updateHarmonicRollPosition(cur);
}
