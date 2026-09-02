import { generateKeyboard, setPitchWheel, setModWheel } from './ui/keyboard-svg.js';
import { updateDisplay, clearDisplay } from './ui/display.js';
import { detectChord } from './chord-engine/index.js';
import { noteName, formatPc } from './chord-engine/naming.js';

import { initVirtualKeyboard, playVirtualNote, releaseVirtualNote } from './virtual-keyboard.js';
import { setSynthMode } from './audio/simple-synth.js';

import { initWebMidi, getWebMidiInputs, openWebMidiInput } from './midi-fallback.js';
import { createChordHistory } from './chord-history.js';

import { createNoteGrouper } from './note-grouper.js';
import { initAnalyzerTab } from './ui/analyzer-tab.js';
import { initStudioTab } from './ui/studio-tab.js';

// [Refonte v2/Global] — 2026-09-02 — Polices + gestion du skin.
// theme.css est chargé en <link> dans index.html (cascade non-layered).
import './ui/refonte/refonte-fonts.js';
import { initSkin } from './ui/refonte/skin-manager.js';
import {
  getAIConfig,
  saveAIConfig,
  testAIConfig,
  loadSecureAIConfig,
  PRESETS,
} from './ai/openai-config.js';
import {
  getMonthlyCap,
  setMonthlyCap,
  getMonthlyUsage,
} from './ui/masterclass-panel.js';
import { createPracticeExercise, renderExerciseTarget } from './practice-exercise.js';
import { applyTabVisibility } from './ui/tab-visibility.js';
import { initOnboarding, notifyOnboarding } from './ui/onboarding.js';
import {
  publishLiveNoteOn,
  publishLiveNoteOff,
  publishLiveSustain,
  hasLiveMidiSubscribers,
} from './melody/live-midi-bus.js';

const state = {
  activeNotes: new Map(), // midi -> velocity
  sustainedNotes: new Set(), // midi sustained while pedal down
  sustain: false,
  currentPitch: 0,
  currentMod: 0,
  noteStart: 'C0',
  noteEnd: 'C9',
  notation: 'english',
  transpose: 0,
  silentMode: false,
  rhodesMode: false,
  // [Claude] — 2026-07-03 — Couleur active par défaut alignée sur chord-display (#bf3a2b)
  colorNote: '#2563eb',
  colorTonic: '#111111',
  currentChord: null,
  // [Claude] — 2026-07-03 — true quand une session est rejouée pour éviter la ré-enregistrement
  isPlayback: false,
  // [OpenCode] — 2026-07-04 — Notes de suggestion affichées sur le clavier principal
  suggestionNotes: new Set(),
};

let chordHistory = null;
let noteGrouper = null;
let practiceExercise = null;

// [Claude] — 2026-07-08 — Détection d'accord différée pour ne pas bloquer le thread
// principal quand le clavier MIDI envoie beaucoup d'événements. Cela permet au
// lecteur audio de l'onglet Analyse de continuer à défiler sans saccade.
let chordRefreshTimer = null;
function scheduleRefreshChord() {
  if (chordRefreshTimer) return;
  chordRefreshTimer = setTimeout(() => {
    chordRefreshTimer = null;
    refreshChord();
  }, 80);
}

let groupedDetectionTimer = null;
let pendingGroupNotes = null;
function scheduleGroupedDetection(notes) {
  pendingGroupNotes = notes;
  if (groupedDetectionTimer) return;
  groupedDetectionTimer = setTimeout(() => {
    groupedDetectionTimer = null;
    const toAnalyze = pendingGroupNotes;
    pendingGroupNotes = null;
    if (toAnalyze && toAnalyze.length >= 3) {
      const result = detectChord(toAnalyze);
      updateDisplay(els, result, toAnalyze, state.notation === 'latin');
      addToHistory(result);
    }
  }, 50);
}

const els = {
  midiSelect: document.getElementById('midi-select'),
  midiStatus: document.getElementById('midi-status-text'),
  keyboard: document.getElementById('keyboard-container'),
  noteStart: document.getElementById('note-start'),
  noteEnd: document.getElementById('note-end'),
  notation: document.getElementById('notation-select'),
  chordName: document.getElementById('chord-name'),
  chordDetail: document.getElementById('chord-detail'),
  chordMeta: document.getElementById('chord-meta'),
  voicingLabel: document.getElementById('voicing-label'),
  aliasLabel: document.getElementById('alias-label'),
  chordDisplay: document.getElementById('chord-display'),
  notesDisplay: document.getElementById('notes-display'),
  pedagogy: document.getElementById('pedagogy-content'),
  colorNote: document.getElementById('color-note'),
  colorTonic: document.getElementById('color-tonic'),
  statusBar: document.getElementById('status-bar'),

  midiRefresh: document.getElementById('midi-refresh'),
  midiPortCount: document.getElementById('midi-port-count'),
  midiPorts: document.getElementById('midi-ports'),
  midiLog: document.getElementById('midi-log'),
  midiSystem: document.getElementById('midi-system'),
  pedagogyPanel: document.getElementById('pedagogy-panel'),
  pedagogyToggle: document.getElementById('pedagogy-toggle'),
  pedagogyContent: document.getElementById('pedagogy-content'),
  pedagogyPanelTab: document.getElementById('pedagogy-panel-tab'),
  exercisePanel: document.getElementById('practice-exercise-panel'),
  exercisePanelToggle: document.getElementById('exercise-panel-toggle'),
  exercisePanelTab: document.getElementById('exercise-panel-tab'),
  practiceMidiHint: document.getElementById('practice-midi-hint'),
  practiceLayout: document.getElementById('practice-tab'),

  keyboardSize: document.getElementById('keyboard-size'),
  transposeInput: document.getElementById('transpose'),
  toleranceInput: document.getElementById('tolerance'),
  silentMode: document.getElementById('silent-mode'),
  rhodesMode: document.getElementById('rhodes-mode'),
  midiDiagnosticPanel: document.getElementById('midi-diagnostic-panel'),
  midiDiagnosticToggle: document.getElementById('midi-diagnostic-toggle'),
  midiDiagnosticContent: document.getElementById('midi-diagnostic-content'),
  themeToggle: document.getElementById('theme-toggle'),

  // [Claude] — 2026-07-04 — Paramètres API IA
  aiSettingsToggle: document.getElementById('ai-settings-toggle'),
  aiSettingsModal: document.getElementById('ai-settings-modal'),
  aiPreset: document.getElementById('ai-preset'),
  aiBaseUrl: document.getElementById('ai-base-url'),
  aiApiKey: document.getElementById('ai-api-key'),
  aiModel: document.getElementById('ai-model'),
  aiTestBtn: document.getElementById('ai-test-btn'),
  aiSaveBtn: document.getElementById('ai-save-btn'),
  aiCancelBtn: document.getElementById('ai-cancel-btn'),
  aiTestResult: document.getElementById('ai-test-result'),
  aiMonthlyCap: document.getElementById('ai-monthly-cap'),
  aiUsage: document.getElementById('ai-usage'),
};

function setStatus(message) {
  els.statusBar.textContent = message;
}

let keyboardResizeObserver = null;

function renderKeyboardAtCurrentSize() {
  const rect = els.keyboard.getBoundingClientRect();
  const width = Math.max(rect.width, 100);
  const height = Math.max(rect.height, 60);

  els.keyboard.innerHTML = generateKeyboard(
    state.noteStart,
    state.noteEnd,
    width,
    height,
    state.colorNote,
    state.colorTonic,
    state.notation === 'latin',
  );
  applyActiveNotes();
  initVirtualKeyboard({
    onNoteOn: (note, velocity = 0.8) => handleNoteOn(note, velocity, true, true),
    onNoteOff: (note) => handleNoteOff(note, true, true),
  });
}

function refreshKeyboard() {
  renderKeyboardAtCurrentSize();

  if (!keyboardResizeObserver) {
    keyboardResizeObserver = new ResizeObserver(() => {
      renderKeyboardAtCurrentSize();
    });
    keyboardResizeObserver.observe(els.keyboard);
  }
}

function applyActiveNotes() {
  for (const midi of state.activeNotes.keys()) {
    highlightKey(midi, 'active');
  }
  for (const midi of state.sustainedNotes) {
    highlightKey(midi, 'active');
  }
  for (const midi of state.suggestionNotes) {
    highlightKey(midi, 'active');
  }
}

let suggestionReleaseTimer = null;

function handleSuggestionPlay(action, notes, name) {
  if (action === 'clear' || action === 'play') {
    if (suggestionReleaseTimer) {
      clearTimeout(suggestionReleaseTimer);
      suggestionReleaseTimer = null;
    }
    for (const n of state.suggestionNotes) {
      unhighlightKey(n, 'active');
      releaseVirtualNote(n);
    }
    state.suggestionNotes.clear();
  }
  if (action === 'play' && notes && notes.length > 0) {
    for (const note of notes) {
      playVirtualNote(note, 0.78);
      highlightKey(note, 'active');
    }
    state.suggestionNotes = new Set(notes);
    if (name && els.chordName) els.chordName.textContent = name;
    if (els.chordDetail) {
      const names = notes.map((n) => formatNoteForDisplay(n % 12)).join(' — ');
      els.chordDetail.textContent = names;
    }
    if (els.voicingLabel) els.voicingLabel.style.display = 'none';
    if (els.aliasLabel) els.aliasLabel.style.display = 'none';
    // Auto-release apres 3 secondes (sans effacer l'affichage)
    suggestionReleaseTimer = setTimeout(() => {
      for (const n of state.suggestionNotes) {
        releaseVirtualNote(n);
      }
      suggestionReleaseTimer = null;
    }, 3000);
  }
}

function highlightKey(midi, className) {
  const key = document.getElementById(`note-${midi}`);
  if (key) key.classList.add(className);
}

function unhighlightKey(midi, className = 'active') {
  const key = document.getElementById(`note-${midi}`);
  if (key) key.classList.remove(className);
}

function getAllActivePcs() {
  const all = new Set([...state.activeNotes.keys(), ...state.sustainedNotes]);
  return Array.from(all).sort((a, b) => a - b);
}

function refreshChord() {
  const notes = getAllActivePcs();
  if (notes.length === 0) {
    clearDisplay(els);
    state.currentChord = null;
    return;
  }

  const result = detectChord(notes);
  state.currentChord = result;
  updateDisplay(els, result, notes, state.notation === 'latin');
  addToHistory(result);

  // Vérification de l'exercice rapide si un accord valide est détecté
  if (result && result.notes.length >= 3 && result.symbol !== '?') {
    checkPracticeExercise(result.notes);
  }
}

function addToHistory(result) {
  if (!result || !chordHistory) return;

  // Ignore single notes, two-note clusters, and unidentified chords
  if (result.notes.length < 3 || result.symbol === '?') return;

  const last = chordHistory.getAll()[0];
  const name = formatChordResult(result);

  if (last && last.name === name) return;

  chordHistory.add({
    name,
    display: name,
    result,
    notes: [...result.notes],
    timestamp: Date.now(),
  });
}

function formatNoteForDisplay(pc) {
  return formatPc(pc, state.notation === 'latin');
}

function formatChordResult(result) {
  if (!result) return '?';
  if (result.rootless) return `${formatNoteForDisplay(result.rootPc)}${result.symbol}`;
  if (result.isSlash) return `${formatNoteForDisplay(result.rootPc)}${result.symbol}/${formatNoteForDisplay(result.bassPc)}`;
  return `${formatNoteForDisplay(result.rootPc)}${result.symbol}`;
}

// [Claude] — 2026-07-03 — Transposition appliquée aux notes actives pour l'affichage, la détection et le son
function transposeNote(note) {
  return note + state.transpose;
}

function isPlayableMidi(note) {
  return Number.isFinite(note) && Number.isInteger(note) && note >= 0 && note <= 127;
}

function handleNoteOn(note, velocity = 0.8, virtual = false, audible = true) {
  if (!isPlayableMidi(note)) {
    console.warn('[Main] noteOn MIDI invalide ignorée:', note);
    return;
  }
  const transposed = transposeNote(note);
  if (!isPlayableMidi(transposed)) {
    console.warn('[Main] noteOn transposée invalide ignorée:', transposed);
    return;
  }
  // Auto-clear suggestion notes when user plays real MIDI
  if (!state.isPlayback && state.suggestionNotes.size > 0) {
    for (const n of state.suggestionNotes) {
      unhighlightKey(n, 'active');
      releaseVirtualNote(n);
    }
    state.suggestionNotes.clear();
  }
  const safeVelocity = Number.isFinite(velocity) && velocity >= 0 && velocity <= 1 ? velocity : 0.8;
  if (audible && !state.silentMode) playVirtualNote(transposed, safeVelocity);
  state.activeNotes.set(transposed, safeVelocity);
  highlightKey(transposed, 'active');
  noteGrouper?.noteOn(transposed, velocity);
  // [OpenCode] — 2026-08-24 — Publier la note brute vers le bus MIDI live pour
  // la réharmonisation (note non transposée : la transposition est un offset
  // d'affichage, pas une altération de la mélodie source).
  if (hasLiveMidiSubscribers()) publishLiveNoteOn(note, safeVelocity, 0);
  // La détection est différée pour ne pas bloquer le thread principal
  // (lecture audio / défilement de l'onglet Analyse).
  scheduleRefreshChord();
}

// [Claude] — 2026-07-03 — Gestion des grace notes : une note relâchée est retirée du groupement temporel sauf si la pédale de sustain est active.
function handleNoteOff(note, virtual = false, audible = true) {
  if (!isPlayableMidi(note)) {
    console.warn('[Main] noteOff MIDI invalide ignorée:', note);
    return;
  }
  const transposed = transposeNote(note);
  if (!isPlayableMidi(transposed)) {
    console.warn('[Main] noteOff transposée invalide ignorée:', transposed);
    return;
  }
  if (audible) releaseVirtualNote(transposed);
  if (state.sustain) {
    state.sustainedNotes.add(transposed);
    noteGrouper?.noteOff(transposed, { sustained: true });
    if (hasLiveMidiSubscribers()) publishLiveNoteOff(note, 0);
    return;
  }
  state.activeNotes.delete(transposed);
  unhighlightKey(transposed, 'active');
  noteGrouper?.noteOff(transposed, { sustained: false });
  if (hasLiveMidiSubscribers()) publishLiveNoteOff(note, 0);
  scheduleRefreshChord();
}

function handleSustain(value) {
  state.sustain = value;
  if (hasLiveMidiSubscribers()) publishLiveSustain(value, 0);
  if (!value) {
    for (const note of state.sustainedNotes) {
      if (!state.activeNotes.has(note)) {
        unhighlightKey(note, 'active');
      }
    }
    state.sustainedNotes.clear();
    scheduleRefreshChord();
  }
}

function handlePitchWheel(value) {
  state.currentPitch = value;
  setPitchWheel(value);
}

function handleModWheel(value) {
  state.currentMod = value;
  setModWheel(value);
}

function logMidiEvent(event) {
  if (!els.midiLog) return;
  const entry = document.createElement('div');
  entry.className = 'midi-log-entry';
  const time = new Date(event.time).toLocaleTimeString('fr-FR', { hour12: false });

  switch (event.type) {
    case 'scan':
      entry.textContent = `[${time}] Scan: ${event.data.count} port(s)`;
      break;
    case 'port':
      entry.textContent = `[${time}] Port ${event.data.id}: ${event.data.name}`;
      break;
    case 'open':
      entry.textContent = `[${time}] Ouverture port ${event.data.portId}`;
      break;
    case 'message':
      const { cmd, channel, data1, data2 } = event.data;
      let msg = `[${time}] ch=${channel} cmd=${cmd} note=${data1} vel=${data2}`;
      if (cmd === 9 && data2 > 0) msg += ' NOTE ON';
      if (cmd === 8 || (cmd === 9 && data2 === 0)) msg += ' NOTE OFF';
      entry.textContent = msg;
      break;
    default:
      entry.textContent = `[${time}] ${event.type}: ${JSON.stringify(event.data)}`;
  }

  els.midiLog.prepend(entry);
  while (els.midiLog.children.length > 50) {
    els.midiLog.lastChild.remove();
  }
}

async function loadSystemInfo() {
  try {
    if (window.electronAPI?.system?.getAudioGroups) {
      const info = await window.electronAPI.system.getAudioGroups();
      const status = info.inAudio
        ? '✅ Utilisateur dans le groupe audio'
        : '⚠️ Utilisateur NON dans le groupe audio (peut bloquer le MIDI)';
      els.midiSystem.innerHTML = `<div>${status}</div><div>Utilisateur: ${info.username}</div>`;
    }
  } catch (e) {
    console.error('System info error:', e);
  }
}

// [OpenCode] — 2026-07-04 — Gestion unifiée et robuste des ports MIDI.
let currentMidiName = null;

function updatePracticeMidiHint() {
  if (!els.practiceMidiHint) return;
  if (currentMidiName) {
    els.practiceMidiHint.textContent = `MIDI connecté : ${currentMidiName}`;
  } else {
    els.practiceMidiHint.textContent = '';
  }
}

const PREFERRED_MIDI_KEYWORDS = ['usb', 'piano', 'keyboard', 'mpk', 'midi', 'key', 'synth', 'controller'];
const VIRTUAL_PORT_NAMES = ['midi through', 'through', 'virmidi', 'timidity', 'fluidsynth', 'pipewire'];

function isHardwareInput(input) {
  const lower = input.name.toLowerCase();
  return !VIRTUAL_PORT_NAMES.some((v) => lower.includes(v));
}

function findPreferredInput(inputs) {
  const hardware = inputs.filter(isHardwareInput);
  for (const keyword of PREFERRED_MIDI_KEYWORDS) {
    const found = hardware.find((i) => i.name.toLowerCase().includes(keyword));
    if (found) return found;
  }
  return hardware[0] || inputs[0] || null;
}

function populateMidiSelect(inputs, onChange) {
  const previousValue = els.midiSelect.value;
  els.midiSelect.innerHTML = '';
  els.midiPorts.innerHTML = '';

  if (els.midiPortCount) els.midiPortCount.textContent = `(${inputs.length})`;
  if (inputs.length === 0) {
    els.midiStatus.textContent = 'Aucun périphérique';
    els.midiPorts.textContent = 'Aucun port MIDI trouvé';
    // Lot B — le sélecteur ne doit jamais paraître cassé/vide : une option
    // explicite « Aucun périphérique » est affichée lorsque rien n’est détecté.
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = 'Aucun périphérique MIDI';
    opt.disabled = true;
    els.midiSelect.appendChild(opt);
    return;
  }

  inputs.forEach((input) => {
    const opt = document.createElement('option');
    opt.value = input.id;
    opt.textContent = input.name;
    els.midiSelect.appendChild(opt);
  });

  els.midiPorts.innerHTML = inputs.map((i) => `<div>[${i.id}] ${i.name}</div>`).join('');

  const stillAvailable = Array.from(els.midiSelect.options).some((o) => o.value === previousValue);
  if (stillAvailable) {
    els.midiSelect.value = previousValue;
  }

  els.midiSelect.onchange = () => onChange(Number(els.midiSelect.value));
}

async function tryOpenMidi(portId, inputs) {
  const input = inputs.find((i) => i.id === portId);
  const name = input?.name || '';
  const result = await window.electronAPI.midi.openInput(portId);
  if (result?.success) {
    currentMidiName = result.name || name;
    updatePracticeMidiHint();
    els.midiStatus.textContent = 'Connecté';
    els.midiSelect.value = String(result.portId || portId);
    setStatus(`MIDI connecté : ${currentMidiName}`);
  } else {
    console.error('[MIDI] openInput failed:', result?.error || result);
    setStatus(`Échec connexion MIDI : ${result?.error || 'inconnu'}`);
  }
  return result;
}

async function initMidi() {
  await loadSystemInfo();
  const callbacks = {
    onNoteOn: (data) => handleNoteOn(data.note, data.velocity, false, true),
    onNoteOff: (data) => handleNoteOff(data.note, false, true),
    onSustain: (data) => handleSustain(data.value),
    onPitchWheel: (data) => handlePitchWheel(data.value),
    onModWheel: (data) => handleModWheel(data.value),
    onMidiLog: (data) => logMidiEvent(data),
  };

  if (!window.electronAPI?.midi) {
    const webMidi = await initWebMidi({ ...callbacks, onStateChange: handleWebMidiStateChange });
    if (webMidi.available) {
      updateMidiList(webMidi.inputs, callbacks, true);
      setStatus(webMidi.inputs.length > 0 ? 'MIDI Web prêt' : 'MIDI Web actif — aucun périphérique');
    } else {
      els.midiStatus.textContent = 'Non disponible';
      setStatus(webMidi.error || 'MIDI non disponible');
    }
    return;
  }

  window.electronAPI.midi.onNoteOn(callbacks.onNoteOn);
  window.electronAPI.midi.onNoteOff(callbacks.onNoteOff);
  window.electronAPI.midi.onSustain(callbacks.onSustain);
  window.electronAPI.midi.onPitchWheel(callbacks.onPitchWheel);
  window.electronAPI.midi.onModWheel(callbacks.onModWheel);
  window.electronAPI.midi.onMidiLog(callbacks.onMidiLog);

  window.electronAPI.midi.onDeviceConnected?.((event) => {
    currentMidiName = event.name;
    updatePracticeMidiHint();
    els.midiStatus.textContent = 'Connecté';
    if (els.midiSelect.value !== String(event.portId)) {
      els.midiSelect.value = String(event.portId);
    }
    setStatus(`MIDI connecté : ${event.name}`);
    logMidiEvent({ type: 'connected', data: event, time: Date.now() });
  });

  window.electronAPI.midi.onPortLost?.((event) => {
    currentMidiName = null;
    updatePracticeMidiHint();
    logMidiEvent({ type: 'port-lost', data: event, time: Date.now() });
    els.midiStatus.textContent = 'Périphérique perdu';
    setStatus('Périphérique MIDI débranché');
  });

  window.electronAPI.midi.onDevicesChanged?.((inputs) => {
    logMidiEvent({ type: 'scan', data: { count: inputs.length }, time: Date.now() });
    inputs.forEach((input) => logMidiEvent({ type: 'port', data: { id: input.id, name: input.name }, time: Date.now() }));

    populateMidiSelect(inputs, async (portId) => {
      await tryOpenMidi(portId, inputs);
    });

    const wasEmpty = els.midiSelect.dataset.lastCount === '0';
    els.midiSelect.dataset.lastCount = String(inputs.length);

    const previousValue = els.midiSelect.value;
    const previousStillAvailable = inputs.some((i) => String(i.id) === previousValue);

    if ((!previousStillAvailable || wasEmpty) && inputs.length > 0) {
      const preferred = findPreferredInput(inputs);
      if (preferred) {
        tryOpenMidi(preferred.id, inputs);
      }
    }
  });

  els.midiSelect.addEventListener('change', async () => {
    const portId = Number(els.midiSelect.value);
    const inputs = await window.electronAPI.midi.getInputs();
    await tryOpenMidi(portId, inputs);
  });

  els.midiRefresh?.addEventListener('click', async () => {
    const refreshed = await window.electronAPI.midi.refreshInputs();
    populateMidiSelect(refreshed, async (portId) => {
      await tryOpenMidi(portId, refreshed);
    });
    const preferred = findPreferredInput(refreshed);
    if (preferred) {
      await tryOpenMidi(preferred.id, refreshed);
    }
  });

  const inputs = await window.electronAPI.midi.getInputs();
  els.midiSelect.dataset.lastCount = String(inputs.length);
  logMidiEvent({ type: 'scan', data: { count: inputs.length }, time: Date.now() });
  inputs.forEach((input) => logMidiEvent({ type: 'port', data: { id: input.id, name: input.name }, time: Date.now() }));

  populateMidiSelect(inputs, async (portId) => {
    await tryOpenMidi(portId, inputs);
  });

  const preferred = findPreferredInput(inputs);
  if (preferred) {
    await tryOpenMidi(preferred.id, inputs);
  }
}

function handleWebMidiStateChange(inputs) {
  const callbacks = {
    onNoteOn: (data) => handleNoteOn(data.note, data.velocity, false, true),
    onNoteOff: (data) => handleNoteOff(data.note, false, true),
    onSustain: (data) => handleSustain(data.value),
    onPitchWheel: (data) => handlePitchWheel(data.value),
    onModWheel: (data) => handleModWheel(data.value),
  };
  updateMidiList(inputs, callbacks, true);
}

function updateMidiList(inputs, callbacks, isWeb) {
  logMidiEvent({ type: 'scan', data: { count: inputs.length }, time: Date.now() });
  inputs.forEach((input) => logMidiEvent({ type: 'port', data: { id: input.id, name: input.name }, time: Date.now() }));

  populateMidiSelect(inputs, async (portId) => {
    openWebMidiInput(portId, callbacks);
    els.midiStatus.textContent = 'Connecté (Web MIDI)';
    const name = els.midiSelect.options[els.midiSelect.selectedIndex]?.text || 'Web MIDI';
    currentMidiName = name;
    updatePracticeMidiHint();
    setStatus(`MIDI connecté : ${name}`);
  });

  const preferred = findPreferredInput(inputs);
  if (preferred) {
    els.midiSelect.value = preferred.id;
    openWebMidiInput(preferred.id, callbacks);
    els.midiStatus.textContent = 'Connecté (Web MIDI)';
    currentMidiName = preferred.name;
    updatePracticeMidiHint();
    setStatus(`MIDI connecté : ${preferred.name}`);
  }
}

const KEYBOARD_PRESETS = {
  '25': { start: 'C3', end: 'C5' },
  '49': { start: 'C2', end: 'C6' },
  '61': { start: 'C2', end: 'C7' },
  '76': { start: 'E1', end: 'G7' },
  '88': { start: 'A0', end: 'C8' },
  'midi': { start: 'C0', end: 'C9' },
  'custom': null,
};

function applyKeyboardPreset(size) {
  const preset = KEYBOARD_PRESETS[size];
  if (!preset) return;
  state.noteStart = preset.start;
  state.noteEnd = preset.end;
  els.noteStart.value = preset.start;
  els.noteEnd.value = preset.end;
  refreshKeyboard();
}

function initSettings() {
  els.noteStart.value = state.noteStart;
  els.noteEnd.value = state.noteEnd;
  els.keyboardSize.value = 'midi';
  els.notation.value = state.notation || 'english';
  els.colorNote.value = state.colorNote;
  els.colorTonic.value = state.colorTonic;
  els.transposeInput.value = state.transpose;
  // [Claude] — 2026-07-07 — Forcer le checkbox Silencieux à décoché au démarrage
  // pour éviter que le clavier MIDI virtuel soit muet par défaut.
  state.silentMode = false;
  els.silentMode.checked = false;
  els.rhodesMode.checked = state.rhodesMode;

  const update = () => {
    const previousTranspose = state.transpose;
    state.noteStart = els.noteStart.value || 'C0';
    state.noteEnd = els.noteEnd.value || 'C9';
    state.notation = els.notation.value || 'english';
    state.transpose = Number(els.transposeInput.value) || 0;
    state.silentMode = els.silentMode.checked;
    state.colorNote = els.colorNote.value;
    state.colorTonic = els.colorTonic.value;

    // [Claude] — 2026-07-03 — Retransposer les notes actives quand le réglage de transposition change
    const transposeDelta = state.transpose - previousTranspose;
    if (transposeDelta !== 0) {
      const newActiveNotes = new Map();
      for (const [midi, velocity] of state.activeNotes) {
        newActiveNotes.set(midi + transposeDelta, velocity);
      }
      state.activeNotes = newActiveNotes;

      const newSustainedNotes = new Set();
      for (const midi of state.sustainedNotes) {
        newSustainedNotes.add(midi + transposeDelta);
      }
      state.sustainedNotes = newSustainedNotes;
    }

    // [Claude] — 2026-07-03 — Mise à jour dynamique de la tolérance de groupement
    const toleranceMs = Number(els.toleranceInput?.value) || 200;
    noteGrouper?.setTolerance(toleranceMs);

    refreshKeyboard();
    refreshChord();
  };

  els.noteStart.addEventListener('change', () => {
    els.keyboardSize.value = 'custom';
    update();
  });
  els.noteEnd.addEventListener('change', () => {
    els.keyboardSize.value = 'custom';
    update();
  });
  els.notation.addEventListener('change', () => {
    update();
  });
  els.transposeInput.addEventListener('change', update);
  els.toleranceInput?.addEventListener('change', update);
  els.silentMode.addEventListener('change', update);
  els.rhodesMode.addEventListener('change', () => {
    state.rhodesMode = els.rhodesMode.checked;
    setSynthMode(state.rhodesMode ? 'rhodes' : 'piano');
  });
  els.colorNote.addEventListener('input', update);
  els.colorTonic.addEventListener('input', update);

  els.keyboardSize?.addEventListener('change', () => {
    applyKeyboardPreset(els.keyboardSize.value);
  });
}

function initPanelToggles() {
  const LEFT_COLLAPSED_CLASS = 'practice-left-collapsed';
  const RIGHT_COLLAPSED_CLASS = 'practice-right-collapsed';

  function applyPedagogyCollapsed(collapsed) {
    if (!els.practiceLayout) return;
    if (collapsed) {
      els.practiceLayout.classList.add(RIGHT_COLLAPSED_CLASS);
    } else {
      els.practiceLayout.classList.remove(RIGHT_COLLAPSED_CLASS);
    }
    if (els.pedagogyToggle) {
      els.pedagogyToggle.textContent = collapsed ? '+' : '−';
      els.pedagogyToggle.title = collapsed ? 'Afficher les techniques' : 'Masquer les techniques';
      els.pedagogyToggle.setAttribute('aria-expanded', String(!collapsed));
    }
    if (els.pedagogyPanelTab) {
      els.pedagogyPanelTab.style.display = collapsed ? 'flex' : 'none';
      els.pedagogyPanelTab.setAttribute('aria-expanded', String(collapsed));
    }
  }

  function applyExerciseCollapsed(collapsed) {
    if (!els.practiceLayout) return;
    if (collapsed) {
      els.practiceLayout.classList.add(LEFT_COLLAPSED_CLASS);
    } else {
      els.practiceLayout.classList.remove(LEFT_COLLAPSED_CLASS);
    }
    if (els.exercisePanelToggle) {
      els.exercisePanelToggle.textContent = collapsed ? '+' : '−';
      els.exercisePanelToggle.title = collapsed ? 'Développer Exercice rapide' : 'Réduire le panneau Exercice rapide';
      els.exercisePanelToggle.setAttribute('aria-expanded', String(!collapsed));
    }
    if (els.exercisePanelTab) {
      els.exercisePanelTab.style.display = collapsed ? 'flex' : 'none';
      els.exercisePanelTab.setAttribute('aria-expanded', String(collapsed));
    }
  }

  // Pedagogy panel: starts visible, can be collapsed
  const pedagogyCollapsed = localStorage.getItem('pedagogy-collapsed') === 'true';
  applyPedagogyCollapsed(pedagogyCollapsed);

  els.pedagogyToggle?.addEventListener('click', () => {
    const collapsed = !els.practiceLayout?.classList.contains(RIGHT_COLLAPSED_CLASS);
    applyPedagogyCollapsed(collapsed);
    localStorage.setItem('pedagogy-collapsed', String(collapsed));
  });

  els.pedagogyPanelTab?.addEventListener('click', () => {
    applyPedagogyCollapsed(false);
    localStorage.setItem('pedagogy-collapsed', 'false');
  });

  // Exercise panel: starts visible, can be collapsed
  const exerciseCollapsed = localStorage.getItem('exercise-collapsed') === 'true';
  applyExerciseCollapsed(exerciseCollapsed);

  els.exercisePanelToggle?.addEventListener('click', () => {
    const collapsed = !els.practiceLayout?.classList.contains(LEFT_COLLAPSED_CLASS);
    applyExerciseCollapsed(collapsed);
    localStorage.setItem('exercise-collapsed', String(collapsed));
  });

  els.exercisePanelTab?.addEventListener('click', () => {
    applyExerciseCollapsed(false);
    localStorage.setItem('exercise-collapsed', 'false');
  });

  // MIDI diagnostic panel: starts hidden
  els.midiDiagnosticToggle?.addEventListener('click', () => {
    const isHidden = els.midiDiagnosticContent.style.display === 'none';
    els.midiDiagnosticContent.style.display = isHidden ? '' : 'none';
    els.midiDiagnosticPanel.style.display = '';
    els.midiDiagnosticToggle.textContent = isHidden ? '−' : '+';
    els.midiDiagnosticToggle.title = isHidden ? 'Masquer le diagnostic MIDI' : 'Afficher le diagnostic MIDI';
  });
}

function initTheme() {
  const saved = localStorage.getItem('theme') || 'dark';
  const root = document.documentElement;
  root.setAttribute('data-theme', saved);
  root.style.backgroundColor = saved === 'dark' ? '#0f1117' : '#f4f6f8';
  updateThemeIcon(saved);

  els.themeToggle?.addEventListener('click', () => {
    const current = root.getAttribute('data-theme') || 'dark';
    const next = current === 'light' ? 'dark' : 'light';
    root.setAttribute('data-theme', next);
    root.style.backgroundColor = next === 'dark' ? '#0f1117' : '#f4f6f8';
    localStorage.setItem('theme', next);
    updateThemeIcon(next);
    // Notifier les composants qui dépendent des couleurs du thème (waveform canvas, etc.)
    window.dispatchEvent(new CustomEvent('app-theme-changed', { detail: { theme: next } }));
  });
}

function updateThemeIcon(theme) {
  if (els.themeToggle) {
    els.themeToggle.textContent = theme === 'light' ? '🌙' : '☀️';
    els.themeToggle.title = theme === 'light' ? 'Passer au mode sombre' : 'Passer au mode clair';
  }
}

function initNoteGrouper() {
  noteGrouper = createNoteGrouper({
    toleranceMs: Number(els.toleranceInput?.value) || 200,
    onGroupReady: (group) => {
      // Re-evaluate chord after grouping window closes, en différé pour ne pas
      // bloquer l'animation / le lecteur audio.
      const notes = group.map((n) => n.note);
      const unique = Array.from(new Set(notes)).sort((a, b) => a - b);
      if (unique.length >= 3) {
        scheduleGroupedDetection(unique);
      }
    },
  });
}

function initHistory() {
  chordHistory = createChordHistory(() => {});
}

// [Claude] — 2026-07-07 — Initialisation du panneau d'exercice rapide
function initPracticeExercise() {
  const panel = document.getElementById('practice-exercise-panel');
  if (!panel) return;

  const modeButtons = panel.querySelectorAll('.exercise-mode-btn');
  const newBtn = document.getElementById('new-exercise-btn');
  const targetDiv = document.getElementById('exercise-target');
  const feedbackDiv = document.getElementById('exercise-feedback');

  practiceExercise = createPracticeExercise();

  function render() {
    const exState = practiceExercise.getState();
    targetDiv.style.display = exState.target ? 'flex' : 'none';
    if (exState.target) {
      targetDiv.innerHTML = renderExerciseTarget(exState.target);
    }
  }

  modeButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      modeButtons.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      practiceExercise.setMode(btn.dataset.mode);
      feedbackDiv.textContent = '';
      render();
    });
  });

  newBtn?.addEventListener('click', () => {
    practiceExercise.next();
    feedbackDiv.textContent = '';
    render();
  });

  // Premier exercice au démarrage
  practiceExercise.next();
  render();
}

function checkPracticeExercise(notes) {
  if (!practiceExercise) return;
  const result = practiceExercise.check(notes);
  const feedbackDiv = document.getElementById('exercise-feedback');
  if (feedbackDiv) {
    feedbackDiv.textContent = result.message;
    feedbackDiv.className = `exercise-feedback ${result.success ? 'success' : 'error'}`;
  }
  if (result.success) {
    const targetDiv = document.getElementById('exercise-target');
    const exState = practiceExercise.getState();
    targetDiv.innerHTML = renderExerciseTarget(exState.target);
  }
}

// [Claude] — 2026-07-04 — Initialisation du panneau de configuration API IA
// [Refonte 2026-09-02] — Chiffrement safeStorage + plafond mensuel réel.
function initAISettings() {
  const modal = els.aiSettingsModal;
  if (!modal) return;

  async function loadConfigIntoUI() {
    const cfg = await loadSecureAIConfig();
    if (els.aiBaseUrl) els.aiBaseUrl.value = cfg.baseUrl;
    if (els.aiApiKey) els.aiApiKey.value = cfg.apiKey;
    if (els.aiModel) els.aiModel.value = cfg.model;
    if (els.aiMonthlyCap) els.aiMonthlyCap.value = String(getMonthlyCap());
    if (els.aiUsage) els.aiUsage.textContent = `${getMonthlyUsage()} / ${getMonthlyCap()} ce mois`;
    if (els.aiPreset) els.aiPreset.value = '';
    if (els.aiTestResult) {
      els.aiTestResult.textContent = '';
      els.aiTestResult.className = 'ai-test-result';
    }
  }

  function gatherConfigFromUI() {
    return {
      baseUrl: els.aiBaseUrl?.value || '',
      apiKey: els.aiApiKey?.value || '',
      model: els.aiModel?.value || '',
      monthlyCap: els.aiMonthlyCap?.value || '50',
    };
  }

  els.aiSettingsToggle?.addEventListener('click', () => {
    loadConfigIntoUI();
    modal.style.display = 'flex';
  });

  els.aiCancelBtn?.addEventListener('click', () => {
    modal.style.display = 'none';
  });

  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.style.display = 'none';
  });

  els.aiPreset?.addEventListener('change', () => {
    const key = els.aiPreset.value;
    const preset = PRESETS.find((p) => {
      if (key === 'groq' && p.name.includes('Groq')) return true;
      if (key === 'openrouter' && p.name.includes('OpenRouter')) return true;
      if (key === 'gemini' && p.name.includes('Google AI Studio')) return true;
      return false;
    });
    if (preset) {
      if (els.aiBaseUrl) els.aiBaseUrl.value = preset.baseUrl;
      if (els.aiModel) els.aiModel.value = preset.models[0] || '';
    }
  });

  els.aiTestBtn?.addEventListener('click', async () => {
    if (!els.aiTestResult) return;
    els.aiTestResult.textContent = 'Test en cours…';
    els.aiTestResult.className = 'ai-test-result';
    try {
      await testAIConfig(gatherConfigFromUI());
      els.aiTestResult.textContent = '✅ Clé API valide';
      els.aiTestResult.classList.add('success');
    } catch (err) {
      els.aiTestResult.textContent = `❌ ${err.message}`;
      els.aiTestResult.classList.add('error');
    }
  });

  els.aiSaveBtn?.addEventListener('click', async () => {
    const gathered = gatherConfigFromUI();
    const cfg = await saveAIConfig(gathered);
    setMonthlyCap(gathered.monthlyCap);
    if (els.aiUsage) els.aiUsage.textContent = `${getMonthlyUsage()} / ${getMonthlyCap()} ce mois`;
    setStatus(`Paramètres IA enregistrés (${cfg.model})`);
    modal.style.display = 'none';
  });
}

async function init() {
  // [Refonte 2026-09-02] — Chargement sécurisé de la config IA avant tout appel.
  await loadSecureAIConfig();
  initTheme();
  // [Refonte v2/Global] — bascule de skin (Réglages › Apparence).
  initSkin({ selector: document.getElementById('skin-selector') });
  initPanelToggles();
  refreshKeyboard();
  initSettings();
  initNoteGrouper();
  initHistory();
  initPracticeExercise();
  initAISettings();
  // [Claude] — 2026-07-08 — Initialisation de l'onglet Analyse simplifié (import → analyse → grille).
  initAnalyzerTab();

  // [OpenCode] — 2026-07-04 — Initialisation de l'onglet Studio (Module 4)
  // Le Studio est isolé du synthétiseur/clavier principal : aucun feedMidiEvent.
  initStudioTab();
  initTabNavigation();
  await initMidi();
}

function initTabNavigation() {
  const tabNav = document.getElementById('tab-nav');
  const practiceTab = document.getElementById('practice-tab');
  const analysisTab = document.getElementById('analysis-tab');
  const studioTab = document.getElementById('studio-tab');

  function switchToTab(tab) {
    applyTabVisibility({
      practice: practiceTab,
      analysis: analysisTab,
      studio: studioTab,
    }, tab);

    document.querySelectorAll('.tab-btn').forEach((b) => {
      b.classList.toggle('active', b.dataset.tab === tab);
    });

    // Le chapitre Studio n'a de sens qu'une fois le Studio à l'écran : ses
    // étapes visent des éléments qui n'existent nulle part ailleurs.
    if (tab === 'studio') notifyOnboarding('studio', 'first-studio');
  }

  tabNav?.addEventListener('click', (e) => {
    const btn = e.target.closest('.tab-btn');
    if (!btn) return;
    switchToTab(btn.dataset.tab);
  });

  document.addEventListener('app-switch-tab', (e) => {
    if (e.detail?.tab) {
      if (e.detail.tab !== 'analysis' && state.suggestionNotes.size > 0) {
        for (const n of state.suggestionNotes) {
          unhighlightKey(n, 'active');
          releaseVirtualNote(n);
        }
        state.suggestionNotes.clear();
        if (els.chordName) els.chordName.textContent = '—';
        if (els.chordDetail) els.chordDetail.textContent = '';
      }
      switchToTab(e.detail.tab);
    }
  });

  initOnboarding();

  if (window.location.hash === '#analysis') switchToTab('analysis');
  else if (window.location.hash === '#studio') switchToTab('studio');
  else switchToTab('practice');
}

init();
