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
import { analyzeSessionPerformance, formatPerformanceFindings } from '../recorder/session-performance.js';
import { reviewTake, takeMarks, takeContextLines, takeMoment } from '../recorder/take-review.js';
import { setKeyboardMarks } from './keyboard-marks.js';
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
// Filtre actif de la bibliothèque : 'all' ou 'captures'.
let sessionFilter = 'all';
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
  carnetFindings: document.getElementById('carnet-findings'),
  modalOverlay: document.getElementById('midi-session-end-modal'),
  modalStats: document.getElementById('midi-session-modal-stats'),
  modalKeepBtn: document.getElementById('midi-session-keep'),
  modalDeleteBtn: document.getElementById('midi-session-delete'),
  modalReplayBtn: document.getElementById('midi-session-replay'),
  transportBar: document.getElementById('midi-session-transport'),
  transportRewind: document.getElementById('midi-session-rewind'),
  transportStop: document.getElementById('midi-session-stop'),
  transportPlay: document.getElementById('midi-session-play'),
  transportSlider: document.getElementById('midi-session-slider'),
  timecodeCurrent: document.getElementById('midi-session-current-time'),
  transportLoop: document.getElementById('midi-session-loop'),
  transportSpeed: document.getElementById('midi-session-speed'),
  timecodeTotal: document.getElementById('midi-session-total-time'),
  loadedState: document.getElementById('midi-session-loaded-state'),
  sessionTitleInput: document.getElementById('midi-session-title-input'),
  sessionBpmInput: document.getElementById('midi-session-bpm-input'),
  bpmRow: document.getElementById('midi-session-bpm-row'),
  immediateToggle: document.getElementById('midi-session-immediate-toggle'),
  cancelSessionBtn: document.getElementById('midi-session-cancel-btn'),
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
  // [Claude] — 2026-09-25 — Relecture par le pont de main.js (feedMidiEvent) : touches
  // allumées, accord lu, pédale rejouée, jamais réenregistré ni jugé par un exercice
  // (Narcisse : « il ne peut pas reproduire exactement mon jeu »). Sans pont
  // (tests), le synthé directement, comme avant.
  player = createPlayer({
    onNoteOn: (note, velocity) => (onMidiEvent ? onMidiEvent('noteOn', note, velocity) : playNote(note, velocity)),
    onNoteOff: (note) => (onMidiEvent ? onMidiEvent('noteOff', note) : releaseNote(note)),
    onSustain: (down) => onMidiEvent?.('sustain', Boolean(down)),
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

// [Astra round 3] — Nom de session par défaut. Même format que celui déjà
// utilisé par startRecording() en repli (« Session 12/09/2026 22:16 »), extrait
// ici pour pouvoir pré-remplir le champ à l'ouverture de la modale, comme le
// fait defaultSessionName() dans la maquette.
function defaultSessionName() {
  const now = new Date();
  const dateStr = `${now.toLocaleDateString('fr-FR')} ${now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`;
  return `Session ${dateStr}`;
}

// Le libellé du bouton principal dit ce qui va réellement se passer.
function updateStartButtonLabel() {
  if (!els.startRecordingBtn) return;
  els.startRecordingBtn.textContent = els.immediateToggle?.checked
    ? 'Créer la session'
    : 'Démarrer (3…2…1…)';
}

function closeSessionInitModal() {
  if (els.recordingInitModal) els.recordingInitModal.style.display = 'none';
  if (els.newSessionBtn) els.newSessionBtn.style.display = 'inline-flex';
}

function bindSessionForm() {
  els.newSessionBtn?.addEventListener('click', () => {
    els.recordingInitModal.style.display = 'flex';
    els.newSessionBtn.style.display = 'none';
    if (els.sessionTitleInput) {
      // Pré-rempli et modifiable : le placeholder reste le repli si la date
      // n'est pas disponible.
      els.sessionTitleInput.value = defaultSessionName();
      els.sessionTitleInput.focus();
      els.sessionTitleInput.select();
    }
    // Le tempo est une métadonnée de la session, pas un réglage du métronome :
    // il reste visible en permanence (il l'était seulement métronome coché).
    updateStartButtonLabel();
  });

  els.startRecordingBtn?.addEventListener('click', () => {
    // Chemin alternatif ajouté, le compte à rebours reste le comportement par
    // défaut (case décochée).
    if (els.immediateToggle?.checked) startImmediately();
    else startCountdown();
  });

  els.cancelSessionBtn?.addEventListener('click', () => closeSessionInitModal());
  els.immediateToggle?.addEventListener('change', updateStartButtonLabel);
}

// Démarrage sans compte à rebours : même séquence que startCountdown(), sans
// l'overlay ni le décompte.
function startImmediately() {
  els.recordingInitModal.style.display = 'none';
  els.recordingControls.style.display = 'flex';
  if (els.recordingCountdown) els.recordingCountdown.style.display = 'none';
  if (els.countdownOverlay) els.countdownOverlay.style.display = 'none';
  startRecording();
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

  // [Astra round 6] — Filtre « Toutes / Mes captures » de la bibliothèque.
  document.getElementById('midi-session-filters')?.addEventListener('click', (e) => {
    const button = e.target.closest('[data-session-filter]');
    if (!button) return;
    e.stopPropagation(); // sinon astra-shell referme le tiroir sur ce clic
    sessionFilter = button.dataset.sessionFilter;
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
    // [Astra round 3] — Le tempo saisi est enregistré même métronome décoché :
    // c'est une métadonnée de la session (liste, fiche, contexte Copilot), pas
    // un réglage du seul métronome. Avant, un 120 arbitraire l'écrasait.
    const tempo = Number(els.sessionBpmInput?.value) || 90;
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
    if (els.loadedState) els.loadedState.style.display = 'none';
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
    // Nombre d'accords : celui du carnet (découpage de la session), pas le
    // compteur approximatif de l'enregistrement en direct.
    const chordCount = segmentSessionEvents(currentEvents).filter((seg) => seg.type === 'chord').length;
    const stats = { ...recorder.getStats(), chordCount };
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
  if (els.loadedState) els.loadedState.style.display = 'none';
  stopCarnetLoop();
  resetSelectedSessionInfo();
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
  studioTake?.recorder.noteOn(note, velocity);
}

export function feedRecorderNoteOff(note) {
  recorder?.noteOff(note);
  studioTake?.recorder.noteOff(note);
}

export function feedRecorderSustain(value) {
  recorder?.sustain(value);
  studioTake?.recorder.sustain(value);
}

export function feedRecorderPitchWheel(value) {
  recorder?.pitchWheel(value);
  studioTake?.recorder.pitchWheel(value);
}

export function feedRecorderModWheel(value) {
  recorder?.modWheel(value);
  studioTake?.recorder.modWheel(value);
}

// ── Prises du Studio ──
// [Claude] — 2026-09-24 — Narcisse : « quand j'enregistre mon jeu dans le Studio,
// que la prise soit automatiquement enregistrée dans le sous-onglet Session »,
// pour la retrouver dès l'arrêt, la réécouter seule (sans les pistes audio) et
// l'analyser. Le Studio annonce le début et la fin de son enregistrement
// (évènements « studio-take-start » / « studio-take-stop ») ; pendant ce temps,
// un second enregistreur reçoit les mêmes notes que celui des sessions.
let studioTake = null; // { recorder, meta: { trackName, position } }

function startStudioTake(meta = {}) {
  studioTake = { recorder: createRecorder(), meta };
  studioTake.recorder.start();
}

/**
 * Fin de prise : si des notes ont été jouées, une session « Prise du Studio »
 * est créée et sauvegardée, puis sélectionnée dans la liste.
 * @returns {Promise<object|null>} la session créée
 */
async function stopStudioTake() {
  const take = studioTake;
  studioTake = null;
  if (!take) return null;
  const events = take.recorder.stop();
  const notes = events.filter((e) => e.type === 'note_on' && e.velocity > 0);
  const notify = (detail) => document.dispatchEvent(new CustomEvent('studio-take-saved', { detail }));
  if (notes.length === 0) {
    notify({ empty: true });
    return null;
  }
  try {
    if (!window.electronAPI?.files) throw new Error('enregistrement des sessions indisponible hors de l\'application');
    const now = new Date();
    const when = `${now.toLocaleDateString('fr-FR')} ${now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`;
    const trackName = String(take.meta.trackName || '').trim();
    const name = `Studio · ${trackName || 'prise'} · ${when}`;
    const position = Number(take.meta.position);
    const session = await createSession({
      name,
      // Le Studio ne connaît pas le tempo du morceau : aucun tempo inventé.
      tempo: Number(take.meta.tempo) || null,
      tags: ['studio'],
      sourceType: 'studio',
      comments: `Prise enregistrée dans le Studio${trackName ? ` sur « ${trackName} »` : ''}${Number.isFinite(position) && position > 0 ? `, à partir de ${formatTimeShort(position)} du morceau` : ''}.`,
    });
    const chordCount = segmentSessionEvents(events).filter((seg) => seg.type === 'chord').length;
    const stats = { ...take.recorder.getStats(), chordCount };
    await saveSessionEvents(session.id, events, stats);
    await refreshSessionList();
    // Pas de prise en cours dans l'onglet Session : la nouvelle prise y est sélectionnée.
    if (!recorder?.isRecording) await loadAndPlaySession(session.id);
    notify({ sessionId: session.id, name, noteCount: notes.length, chordCount });
    return session;
  } catch (err) {
    console.error('[Session] Prise du Studio non sauvegardée :', err);
    notify({ error: err.message || String(err) });
    return null;
  }
}

document.addEventListener('studio-take-start', (e) => startStudioTake(e.detail || {}));
document.addEventListener('studio-take-stop', () => { stopStudioTake(); });

async function refreshSessionList() {
  if (!els.sessionList) return;
  try {
    const sessions = await listSessions();
    const query = (els.sessionSearch?.value || '').trim().toLowerCase();

    const scoped = sessionFilter === 'captures'
      ? sessions.filter((s) => ['midi', 'studio'].includes(s.sourceType || 'midi'))
      : sessions;

    const filtered = query
      ? scoped.filter((s) => {
          try {
            return (
              (s.name || '').toLowerCase().includes(query) ||
              (s.comments || '').toLowerCase().includes(query) ||
              (s.tags || []).some((t) => (t || '').toLowerCase().includes(query))
            );
          } catch { return false; }
        })
      : scoped;

    syncSessionFilterUi(sessions.length);
    renderSessionList(filtered, { total: sessions.length, query });
  } catch (err) {
    console.error('Failed to list sessions:', err);
    els.sessionList.innerHTML = `<div class="tr-empty">${ICON_EMPTY_LIBRARY}<h3>Bibliothèque indisponible</h3><p>Les sessions enregistrées n'ont pas pu être lues. Rouvrez la bibliothèque pour réessayer.</p></div>`;
  }
}

// Reflète le filtre actif et le nombre total de sessions dans la barre d'outils.
function syncSessionFilterUi(total) {
  const group = document.getElementById('midi-session-filters');
  if (!group) return;
  for (const button of group.querySelectorAll('[data-session-filter]')) {
    const isActive = button.dataset.sessionFilter === sessionFilter;
    button.classList.toggle('is-active', isActive);
    button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
  }
  const count = document.getElementById('midi-session-count-all');
  if (count) count.textContent = total;
}

// Libellé de provenance affiché sous le nom de la session.
const SESSION_SOURCE_LABELS = {
  midi: 'Capture locale',
  studio: 'Prise du Studio',
  import: 'Import MIDI',
  example: 'Exemple',
};

function formatSessionDate(value) {
  const date = new Date(value);
  if (isNaN(date)) return '';
  return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
}

// Aperçu MIDI : barres de densité de jeu, calculées par session-manager à
// partir des vraies notes. Une session sans note affiche un repère plat plutôt
// qu'un graphique inventé.
function renderMiniWave(preview) {
  const width = 110;
  const height = 27;
  if (!Array.isArray(preview) || preview.length === 0) {
    return `<svg class="tr-mini-wave is-flat" viewBox="0 0 ${width} ${height}" fill="none" stroke="currentColor" stroke-width="1" aria-hidden="true"><path d="M0 ${height / 2}h${width}"/></svg>`;
  }

  const step = width / preview.length;
  const barWidth = Math.max(1, step * 0.55);
  const bars = preview.map((value, i) => {
    const barHeight = Math.max(1.5, Math.min(1, Math.max(0, value)) * (height - 4));
    const x = i * step + (step - barWidth) / 2;
    const y = (height - barHeight) / 2;
    return `<rect x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${barWidth.toFixed(2)}" height="${barHeight.toFixed(2)}" rx="${(barWidth / 2).toFixed(2)}"/>`;
  }).join('');

  return `<svg class="tr-mini-wave" viewBox="0 0 ${width} ${height}" fill="currentColor" aria-hidden="true">${bars}</svg>`;
}

const ICON_FILE_MUSIC = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><circle cx="9.5" cy="17" r="1.8"/><path d="M11.3 17v-4.6l4 1"/></svg>';
const ICON_TRASH = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>';
const ICON_OPEN = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 17 17 7"/><path d="M7 7h10v10"/></svg>';
const ICON_EMPTY_LIBRARY = '<svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.35" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>';

function renderSessionList(sessions, { total = 0, query = '' } = {}) {
  if (!els.sessionList) return;
  els.sessionList.innerHTML = '';

  if (sessions.length === 0) {
    els.sessionList.innerHTML = total === 0
      ? `<div class="tr-empty">${ICON_EMPTY_LIBRARY}<h3>Aucune session pour l'instant</h3><p>Installez-vous au clavier et lancez une nouvelle session : votre jeu sera enregistré ici, note par note.</p></div>`
      : `<div class="tr-empty">${ICON_EMPTY_LIBRARY}<h3>Aucun résultat</h3><p>${query ? `Aucune session ne correspond à « ${escapeHtml(query)} ».` : 'Aucune session ne correspond à ce filtre.'}</p></div>`;
    return;
  }

  for (const session of sessions) {
    const item = document.createElement('div');
    item.className = 'tr-library-row';
    const isSelected = currentSession && currentSession.id === session.id;
    if (isSelected) item.classList.add('is-selected');

    const sourceLabel = SESSION_SOURCE_LABELS[session.sourceType] || SESSION_SOURCE_LABELS.midi;
    const dateLabel = formatSessionDate(session.date);
    const duration = formatDuration(session.duration);
    const noteCount = session.noteCount || 0;

    item.innerHTML = `
      <button class="tr-library-select" type="button" aria-current="${isSelected ? 'true' : 'false'}">
        <span class="tr-file-icon">${ICON_FILE_MUSIC}</span>
        <span>
          <strong class="session-name" title="${escapeHtml(session.name)}">${escapeHtml(session.name)}</strong>
          <small>${escapeHtml(dateLabel)}${dateLabel ? ' · ' : ''}${sourceLabel}</small>
        </span>
      </button>
      ${renderMiniWave(session.preview)}
      <span class="tr-library-cell">${duration}</span>
      <span class="tr-library-cell">${noteCount}</span>
      <div class="tr-library-row-actions">
        <button class="tr-icon-button tr-delete" type="button" data-action="delete" aria-label="Supprimer la session ${escapeHtml(session.name)}" title="Supprimer">${ICON_TRASH}</button>
        <button class="tr-icon-button" type="button" data-action="open" aria-label="Ouvrir la session ${escapeHtml(session.name)}" title="Ouvrir">${ICON_OPEN}</button>
      </div>
    `;

    // Renommage en place : double-clic sur le nom, comme avant la refonte.
    const nameEl = item.querySelector('.session-name');
    nameEl.addEventListener('dblclick', (e) => {
      e.preventDefault();
      e.stopPropagation();
      item.dataset.editing = 'true';
      nameEl.contentEditable = 'true';
      nameEl.focus();
      getSelection()?.selectAllChildren(nameEl);
    });
    // Pendant l'édition, aucun clic ne doit sélectionner la session ni fermer
    // le tiroir (astra-shell écoute au niveau du document).
    nameEl.addEventListener('click', (e) => {
      if (item.dataset.editing === 'true') e.stopPropagation();
    });
    nameEl.addEventListener('blur', async () => {
      if (item.dataset.editing !== 'true') return;
      delete item.dataset.editing;
      nameEl.contentEditable = 'false';
      const next = nameEl.textContent.trim();
      if (next && next !== session.name) {
        await renameSession(session.id, next);
      }
      refreshSessionList();
    });
    nameEl.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') {
        e.preventDefault();
        nameEl.blur();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        nameEl.textContent = session.name;
        nameEl.blur();
      }
    });

    item.addEventListener('click', (e) => {
      if (item.dataset.editing === 'true') return;
      if (e.target.closest('[data-action="delete"]')) return;
      loadAndPlaySession(session.id);
    });

    item.querySelector('[data-action="delete"]')?.addEventListener('click', async (e) => {
      e.stopPropagation(); // garde le tiroir ouvert après une suppression
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
    if (els.recordingControls) els.recordingControls.style.display = 'none';
    if (els.loadedState) els.loadedState.style.display = 'inline-flex';
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
    <div class="info-row">${currentSession.noteCount || 0} notes · ${currentSession.chordCount || 0} accords · ${currentSession.tempo || '—'} BPM · ${currentSession.key || 'Tonalité non définie'}</div>
    <div class="info-row">${escapeHtml(currentSession.comments || '')}</div>
    <div class="info-tags">${(currentSession.tags || []).map((t) => `<span class="tag">${escapeHtml(t)}</span>`).join('')}</div>
  `;
}

function resetSelectedSessionInfo() {
  if (els.selectedSessionInfo) {
    els.selectedSessionInfo.innerHTML = `<p class="detail-hint">Aucune session sélectionnée. Créez une nouvelle session ou choisissez-en une dans la liste.</p>`;
  }
  if (els.carnetSessionTitle) els.carnetSessionTitle.textContent = 'Aucune session sélectionnée';
  if (els.carnetSessionMeta) els.carnetSessionMeta.textContent = '';
}

function formatTimeShort(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const total = Math.floor(seconds);
  const m = Math.floor(total / 60);
  const s = String(total % 60).padStart(2, '0');
  return `${m}:${s}`;
}

function renderCarnet() {
  if (!currentSession) return;

  const segments = currentEvents.length
    ? nameChordSegments(segmentSessionEvents(currentEvents), { latin: currentNotation === 'latin' })
    : [];
  const totalDuration = currentSession.duration || segments[segments.length - 1]?.end || 1;

  renderCarnetHeader(segments, totalDuration);
  renderTimeline(segments, totalDuration);
  renderCarnetFindings(sessionAnalysis());
  if (segments.length) {
    renderCarnetEntries(segments);
    bindCarnetPlayButtons(segments);
    bindCarnetExploreButtons(segments);
    bindCarnetExploreAll(segments);
  } else {
    if (els.carnetEntries) els.carnetEntries.innerHTML = '';
  }
}

// [Claude] — 2026-09-24 — Analyse du jeu de la session affichée (pédale, grave
// boueux, voix du dessus, régularité, nuances… : session-performance.js), gardée
// tant que la session et la notation ne changent pas ; le Copilote reçoit la même.
let analysisCache = { events: null, notation: null, analysis: null };

function sessionAnalysis() {
  if (analysisCache.events === currentEvents && analysisCache.notation === currentNotation) return analysisCache.analysis;
  const analysis = currentEvents?.length
    ? analyzeSessionPerformance(currentEvents, { tempo: currentSession?.tempo || null, latin: currentNotation === 'latin' })
    : null;
  analysisCache = { events: currentEvents, notation: currentNotation, analysis };
  return analysis;
}

// [Claude] — 2026-09-25 — Portrait complet de la session (accords exacts main gauche |
// main droite, voicing reconnu, rôles, lignes et gammes, rythme, constats détaillés) :
// le même que « Qu'en penses-tu ? ». Le Copilote le reçoit ; ses moments m:ss
// sont cliquables (session-show-moment).
let reviewCache = { events: null, review: null };

function sessionReview() {
  if (reviewCache.events === currentEvents) return reviewCache.review;
  const review = currentEvents?.length ? reviewTake(currentEvents) : null;
  reviewCache = { events: currentEvents, review };
  return review;
}

/**
 * Montre un moment de la session : boucle courte autour de lui (on l'entend
 * arriver) et, au clavier, l'accord joué avec le rôle de chaque note et les
 * notes en cause (celles qui traînent sous la pédale, qui frottent, qui sautent).
 */
function showSessionMoment(at, detail = null, issueId = null) {
  if (!player) return;
  const review = sessionReview();
  const chord = review?.chords.find((c) => c.at - 0.05 <= at && at < c.end + 0.05) || null;
  let view = null;
  if (detail) view = takeMarks(null, { ...detail, issueId });
  else if (chord) {
    view = {
      marks: chord.roles.map((r) => ({ midi: r.midi, kind: r.kind, label: r.degree })),
      caption: `${takeMoment(chord.at)} ${chord.name} : ${chord.voicing.label}${chord.voicing.detail ? ` (${chord.voicing.detail})` : ''}`,
      tone: '',
    };
  }
  const start = Math.max(0, at - 0.4);
  const end = Math.min(player.getDuration(), Math.max(at + 2.2, chord ? Math.min(chord.end, at + 4) : at + 2.2));
  playMomentLoop(start, end);
  if (view) setKeyboardMarks(view.marks, { caption: view.caption, tone: view.tone });
}

/** Boucle courte sur [start, end] (même mécanique que les boucles du carnet). */
async function playMomentLoop(start, end) {
  stopCarnetLoop();
  carnetLoopSegment = { start, end, moment: true };
  carnetLoopStart = start;
  carnetLoopEnd = end;
  player.seek(start);
  await resumeAudio();
  player.play();
  startCarnetLoop();
  startTransportLoop();
}

/**
 * « Écouter la suggestion » (pédale gardée) : le même passage, pédale relevée à
 * chaque nouvel accord et reprise juste après (pédale syncopée) — avant / après.
 */
function playPedalFixed(detail) {
  const review = sessionReview();
  if (!review || !detail) return;
  const from = Math.max(0, detail.at - 2);
  const to = detail.at + 2.5;
  const starts = review.chords.map((c) => c.at).filter((t) => t > from && t < to);
  const events = [];
  for (const e of currentEvents) {
    if (e.time < from || e.time > to) continue;
    if (e.type === 'control' && e.controller === 64) continue;
    if (e.type === 'note_on' && e.velocity > 0) events.push({ time: e.time - from, type: 'noteOn', note: e.note, velocity: e.velocity > 1 ? e.velocity / 127 : e.velocity });
    else if (e.type === 'note_off' || e.type === 'note_on') events.push({ time: e.time - from, type: 'noteOff', note: e.note });
  }
  events.push({ time: 0, type: 'sustain', value: true });
  for (const t of starts) {
    events.push({ time: Math.max(0, t - from - 0.02), type: 'sustain', value: false });
    events.push({ time: t - from + 0.12, type: 'sustain', value: true });
  }
  events.push({ time: to - from, type: 'sustain', value: false });
  const order = { noteOff: 0, sustain: 1, noteOn: 2 };
  events.sort((a, b) => a.time - b.time || order[a.type] - order[b.type]);
  stopCarnetLoop();
  document.dispatchEvent(new CustomEvent('copilot-play-example', { detail: { id: 'session-pedal-fixed', example: { events, beats: to - from, tempo: 60 } } }));
  setKeyboardMarks([], { caption: `Corrigé : pédale relevée à chaque accord (${takeMoment(detail.at)} ${detail.chord || ''}) — compare avec « Écouter tel quel »`, tone: 'ok' });
}

/** Rangée « Analyse du jeu » du carnet : un constat par pastille, ses moments cliquables. */
function renderCarnetFindings(analysis) {
  const host = els.carnetFindings;
  if (!host) return;
  host.innerHTML = '';
  const items = analysis
    ? [...analysis.issues.map((f) => ({ ...f, kind: 'issue' })), ...analysis.strengths.map((f) => ({ ...f, kind: 'strength' }))]
    : [];
  host.hidden = items.length === 0;
  if (!items.length) return;
  const label = document.createElement('span');
  label.className = 'carnet-findings-label';
  label.textContent = 'Analyse du jeu';
  host.appendChild(label);
  for (const f of items) {
    const pill = document.createElement('div');
    pill.className = `carnet-finding is-${f.kind}${f.severity >= 3 ? ' is-major' : ''}`;
    pill.setAttribute('role', 'listitem');
    pill.title = f.text;
    const dot = document.createElement('span');
    dot.className = 'carnet-finding-dot';
    dot.setAttribute('aria-hidden', 'true');
    const title = document.createElement('span');
    title.className = 'carnet-finding-title';
    title.textContent = f.title;
    // Le détail (lu par les lecteurs d'écran ; à l'écran, au survol).
    const detail = document.createElement('span');
    detail.className = 'carnet-finding-detail';
    detail.textContent = `${f.kind === 'issue' ? 'Suggestion' : 'Ce qui marche'} : ${f.text}`;
    pill.append(dot, title, detail);
    (f.times || []).slice(0, 3).forEach((t, i) => {
      const detailCase = f.details?.[i] || null;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'carnet-finding-time';
      btn.textContent = formatTimeShort(t);
      btn.title = detailCase ? `${formatTimeShort(t)} — ${detailCase.text} (écouter en boucle, voir au clavier)` : `Écouter ${formatTimeShort(t)} en boucle`;
      // [Claude] — 2026-09-25 — Le moment en boucle courte, et au clavier la suggestion.
      btn.addEventListener('click', () => showSessionMoment(t, detailCase, f.id));
      pill.appendChild(btn);
    });
    if (f.id === 'pedal-blur' && f.details?.length) {
      const fixed = document.createElement('button');
      fixed.type = 'button';
      fixed.className = 'carnet-finding-time carnet-finding-fix';
      fixed.textContent = 'Écouter la suggestion';
      fixed.title = 'Le même passage, pédale relevée à chaque nouvel accord (à comparer avec le moment tel quel)';
      fixed.addEventListener('click', () => playPedalFixed(f.details[0]));
      pill.appendChild(fixed);
    }
    if ((f.times || []).length > 3) {
      const more = document.createElement('span');
      more.className = 'carnet-finding-more';
      more.textContent = `+${f.times.length - 3}`;
      pill.appendChild(more);
    }
    host.appendChild(pill);
  }
}

function renderCarnetHeader(segments, totalDuration) {
  if (!els.carnetSessionTitle || !els.carnetSessionMeta) return;
  const chordCount = segments.filter((s) => s.type === 'chord').length;
  els.carnetSessionTitle.textContent = currentSession.name;
  els.carnetSessionMeta.textContent = `${currentSession.noteCount || 0} notes · ${chordCount} accords · ${currentSession.tempo || '—'} BPM · ${currentSession.key || 'Tonalité non définie'}`;
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
          <div class="carnet-entry-label">${escapeHtml(chordName)}</div>
          <span class="carnet-chip chord-tag">accord</span>
        </div>
        <button class="carnet-explore-btn" data-index="${i}" title="Explorer avec le Copilot">✨</button>
      `;
    } else {
      entry.innerHTML = `
        <button class="carnet-play-btn" data-index="${i}" title="Écouter ce passage en boucle">▶</button>
        <div class="carnet-entry-time">${timeStr}</div>
        <div class="carnet-entry-main">
          <div class="carnet-entry-label">Passage mélodique</div>
          <span class="carnet-chip melody-tag">${seg.notes?.length || 0} notes</span>
        </div>
        <button class="carnet-explore-btn" data-index="${i}" title="Explorer avec le Copilot">✨</button>
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
    // [Claude] — 2026-09-25 — Tête de lecture et temps à jour pendant la boucle.
    startTransportLoop();
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

// [Claude] — 2026-09-24 — Narcisse : « transférer une session MIDI vers le
// Copilote IA pour qu'il analyse le jeu, donne des conseils et pointe ce qui ne
// va pas ».
// [Claude] — 2026-09-25 — Ton « assistant, pas coach » : des suggestions, pas des défauts.
// (Pas « écoute » : ce mot fait démarrer un exemple sonore, voir wantsToHear.)
const SESSION_COACHING_REQUEST = 'Que penses-tu de ma session ? Ce qui marche, et tes suggestions (avec les moments) pour aller plus loin.';

function bindCarnetExploreAll(segments) {
  if (!els.carnetExploreAll) return;
  els.carnetExploreAll.disabled = false;
  els.carnetExploreAll.onclick = () => {
    if (!currentSession) return;
    const context = buildSessionContext();
    if (!context) return;
    document.dispatchEvent(new CustomEvent('app-switch-training-view', { detail: { view: 'copilot' } }));
    document.dispatchEvent(new CustomEvent('copilot-switch-to-session', { detail: context }));
    const starter = SESSION_COACHING_REQUEST;
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
  // [Claude] — 2026-09-25 — Un moment (m:ss) cliqué dans une réponse du Copilote.
  document.addEventListener('session-show-moment', (e) => {
    const at = Number(e.detail?.time);
    if (!Number.isFinite(at) || !currentSession) return;
    const review = sessionReview();
    const moment = review?.moments.find((m) => Math.abs(m.at - at) < 0.6) || null;
    showSessionMoment(at, moment, moment?.issueId || null);
  });
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
  const segments = nameChordSegments(segmentSessionEvents(currentEvents || []), { latin: currentNotation === 'latin' });
  const chordSegments = segments.filter((s) => s.type === 'chord');

  // Liste chronologique des vrais moments d'accord. Pas de déduplication par
  // nom : une grille qui repasse par le même accord doit apparaître à chaque
  // occurrence, pas une seule fois.
  const chordMoments = chordSegments
    .filter((s) => s.chordName)
    .map((s) => ({ start: s.start, label: s.chordName }));

  // [Claude] — 2026-09-24 — Constats mesurés sur le jeu (pédale, grave boueux,
  // voix du dessus, régularité, nuances…) : le Copilote les commente en coach.
  const performance = sessionAnalysis();

  return {
    type: 'session',
    sessionId: currentSession.id,
    name: currentSession.name,
    source: SESSION_SOURCE_LABELS[currentSession.sourceType] || null,
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
    performance: performance ? { lines: formatPerformanceFindings(performance) } : null,
    // [Claude] — 2026-09-25 — Notes exactes : voicings datés, types, rôles, lignes, constats détaillés.
    portrait: (() => {
      const review = sessionReview();
      return review ? takeContextLines(review, { title: '## Portrait de la session (notes exactes, moments m:ss,d)', maxChords: 60 }) : null;
    })(),
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
    const starter = SESSION_COACHING_REQUEST;
    setTimeout(() => {
      document.dispatchEvent(new CustomEvent('copilot-send-message', { detail: { message: starter } }));
    }, 50);
  });
}

let transportRafId = null;
// Relance la session à la fin quand l'utilisateur travaille un passage.
let transportLoopEnabled = false;

const PLAY_SVG = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m7 4 13 8-13 8z" fill="currentColor"/></svg>';
const PAUSE_SVG = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" aria-hidden="true"><path d="M9 5v14M15 5v14"/></svg>';

function bindTransportBar() {
  if (!els.transportBar) return;

  els.transportRewind?.addEventListener('click', () => {
    player?.stop();
    updateTransportUI();
  });

  els.transportStop?.addEventListener('click', () => {
    player?.stop();
    if (transportRafId) {
      cancelAnimationFrame(transportRafId);
      transportRafId = null;
    }
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

  els.transportLoop?.addEventListener('click', () => {
    transportLoopEnabled = !transportLoopEnabled;
    els.transportLoop.classList.toggle('is-active', transportLoopEnabled);
    els.transportLoop.setAttribute('aria-pressed', transportLoopEnabled ? 'true' : 'false');
  });

  els.transportSpeed?.addEventListener('change', () => {
    const speed = Number(els.transportSpeed.value);
    if (speed > 0) player?.setSpeed(speed);
  });
}

function startTransportLoop() {
  if (transportRafId) cancelAnimationFrame(transportRafId);
  function loop() {
    if (!player || !player.isPlaying) {
      // Fin de session : on repart de zéro si la boucle est armée, sinon on
      // rend la main (pause manuelle comprise).
      const duration = player?.getDuration() || 0;
      if (transportLoopEnabled && duration > 0 && player?.getCurrentTime() >= duration) {
        player.seek(0);
        player.play();
        updateTransportUI();
        transportRafId = requestAnimationFrame(loop);
        return;
      }
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
  if (els.timecodeCurrent) els.timecodeCurrent.textContent = formatDuration(cur);
  if (els.timecodeTotal) els.timecodeTotal.textContent = formatDuration(dur);
  if (els.transportPlay) {
    // innerHTML et non textContent : le bouton porte une icône SVG depuis la
    // refonte, un textContent la supprimerait au premier changement d'état.
    els.transportPlay.innerHTML = player?.isPlaying ? PAUSE_SVG : PLAY_SVG;
    els.transportPlay.classList.toggle('is-playing', Boolean(player?.isPlaying));
  }
  updateHarmonicRollPosition(cur);
}
