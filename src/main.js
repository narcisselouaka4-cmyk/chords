import { generateKeyboard, setPitchWheel, setModWheel } from './ui/keyboard-svg.js';
import { updateDisplay, clearDisplay } from './ui/display.js';
import { detectChord } from './chord-engine/index.js';
import { noteName, formatPc } from './chord-engine/naming.js';

import {
  initVirtualKeyboard,
  playVirtualNote,
  releaseVirtualNote,
  setPcKeyboardToMidiEnabled,
  isPcKeyboardToMidiEnabled,
} from './virtual-keyboard.js';
import { setSynthMode, setSustain, ensurePianoSamples } from './audio/simple-synth.js';

import { initWebMidi, getWebMidiInputs, openWebMidiInput } from './midi-fallback.js';
import { createChordHistory } from './chord-history.js';
import { initCopilotTab } from './pedagogie/copilot-tab.js';

import { createNoteGrouper } from './note-grouper.js';
import { initAnalyzerTab } from './ui/analyzer-tab.js';
import { initStudioTab } from './ui/studio-tab.js';
// [Claude 05/09] — Coach d'accompagnement au chant : vue sœur de Sessions MIDI
// dans la sous-navigation d'Entraînement. Reste un flux séparé, sans pont de
// données avec Sessions MIDI (décision du 03/09, non rouverte).
import { initCoachTab } from './ui/coach-tab.js';
// [Claude 05/09] — Pédagogie IA : lecture d'un tutoriel vidéo. Vue sœur de
// Coach d'accompagnement dans la sous-navigation d'Entraînement.
import { initPedagogieTab } from './ui/pedagogie-tab.js';
// [Refonte 03/09] — Sous-vue « Sessions MIDI » d'Entraînement, raccordée sur
// demande explicite de Narcisse (décision : reste séparée de Coach
// d'accompagnement, cf. spec-coach-accompagnement-chant.md).
import {
  initRecordingTab,
  switchToRecordingTab,
  feedRecorderNoteOn,
  feedRecorderNoteOff,
  feedRecorderSustain,
  feedRecorderPitchWheel,
  feedRecorderModWheel,
} from './ui/recording-tab.js';

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
import { voicingToNoteSequence } from './pedagogie/copilot-voicing.js';
import { applyTabVisibility } from './ui/tab-visibility.js';
import { initAstraShell } from './ui/refonte/astra-shell.js';
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
  pcKeyboardToMidi: true,
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
  practiceMidiHint: document.getElementById('practice-midi-hint'),
  practiceLayout: document.getElementById('practice-tab'),
  exerciseCollapsedProgress: document.getElementById('exercise-collapsed-progress'),
  exerciseDegreeBadge: document.getElementById('exercise-degree-badge'),
  practiceMidiStatusDot: document.getElementById('practice-midi-status-dot'),
  practiceMidiStatusText: document.getElementById('practice-midi-status-text'),
  practiceRecordBtn: document.getElementById('practice-record-btn'),
  exerciseTechniqueSelect: document.getElementById('exercise-technique-select'),
  practiceViewMidiSessions: document.getElementById('practice-view-midi-sessions'),
  practiceViewCoach: document.getElementById('practice-view-coach'),
  practiceViewPedagogie: document.getElementById('practice-view-pedagogie'),
  practiceViewCopilot: document.getElementById('practice-view-copilot'),
  practiceViewExercices: document.getElementById('practice-view-exercices'),

  keyboardSize: document.getElementById('keyboard-size'),
  transposeInput: document.getElementById('transpose'),
  toleranceInput: document.getElementById('tolerance'),
  silentMode: document.getElementById('silent-mode'),
  rhodesMode: document.getElementById('rhodes-mode'),
  pcKeyboardMidi: document.getElementById('pc-keyboard-midi'),
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

  // Vérification de l'exercice rapide si un accord valide est détecté.
  // [Refonte 03/09] — Jamais pendant une relecture Sessions MIDI : rejouer une
  // session ne doit pas faire progresser un exercice en cours.
  if (!state.isPlayback && result && result.notes.length >= 3 && result.symbol !== '?') {
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
  // [Refonte 03/09] — Alimente l'enregistrement Sessions MIDI en cours (no-op
  // tant qu'aucune session n'est en cours d'enregistrement). Jamais pendant
  // une relecture (state.isPlayback), pour ne pas ré-enregistrer ce qu'on est
  // en train de rejouer. Note brute, comme pour le bus live ci-dessus : la
  // transposition est un offset d'affichage, pas une altération enregistrée.
  if (!state.isPlayback) feedRecorderNoteOn(note, safeVelocity);
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
  // [Refonte 03/09] — Voir handleNoteOn : même pont vers Sessions MIDI, jamais
  // pendant une relecture, note brute.
  if (!state.isPlayback) feedRecorderNoteOff(note);
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
  // [Claude] — 2026-09-05 — Le synthé connaît maintenant la pédale : les notes
  // relâchées pédale enfoncée continuent de sonner et s'éteignent à la remontée.
  setSustain(value);
  if (hasLiveMidiSubscribers()) publishLiveSustain(value, 0);
  if (!state.isPlayback) feedRecorderSustain(value);
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
  if (!state.isPlayback) feedRecorderPitchWheel(value);
}

function handleModWheel(value) {
  state.currentMod = value;
  setModWheel(value);
  if (!state.isPlayback) feedRecorderModWheel(value);
}

// [Refonte 03/09] — Pont de relecture pour Sessions MIDI (recording-tab.js) :
// le lecteur de session appelle cette fonction pour chaque évènement rejoué,
// afin qu'il traverse exactement le même pipeline qu'un évènement MIDI réel
// (affichage, clavier, détection d'accord, bus live). state.isPlayback est
// levé le temps de l'appel — il existait déjà dans state (déclaré le
// 2026-07-03) mais rien ne le positionnait jusqu'ici faute de relecture
// raccordée ; handleNoteOn le consultait déjà pour ne pas effacer les notes
// de suggestion pendant une relecture.
function feedMidiEvent(type, a, b) {
  state.isPlayback = true;
  try {
    switch (type) {
      case 'noteOn': handleNoteOn(a, b, true, true); break;
      case 'noteOff': handleNoteOff(a, true, true); break;
      case 'sustain': handleSustain(a); break;
      case 'pitchWheel': handlePitchWheel(a); break;
      case 'modWheel': handleModWheel(a); break;
      default: console.warn('[Main] feedMidiEvent : type inconnu', type);
    }
  } finally {
    state.isPlayback = false;
  }
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
  if (els.practiceMidiHint) {
    els.practiceMidiHint.textContent = currentMidiName ? `MIDI connecté : ${currentMidiName}` : '';
  }
  // [Refonte 02/09] — Même état, affiché aussi dans la sous-navigation
  // d'Entraînement (point + texte, maquettes 15/16) — pas une détection
  // supplémentaire, juste une seconde lecture de currentMidiName.
  if (els.practiceMidiStatusDot) {
    els.practiceMidiStatusDot.classList.toggle('connected', Boolean(currentMidiName));
  }
  if (els.practiceMidiStatusText) {
    els.practiceMidiStatusText.textContent = currentMidiName
      ? `Clavier MIDI connecté`
      : 'Clavier MIDI non détecté';
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
  state.pcKeyboardToMidi = true;
  if (els.pcKeyboardMidi) els.pcKeyboardMidi.checked = true;

  const update = () => {
    const previousTranspose = state.transpose;
    state.noteStart = els.noteStart.value || 'C0';
    state.noteEnd = els.noteEnd.value || 'C9';
    state.notation = els.notation.value || 'english';
    state.transpose = Number(els.transposeInput.value) || 0;
    state.silentMode = els.silentMode.checked;
    state.pcKeyboardToMidi = els.pcKeyboardMidi ? els.pcKeyboardMidi.checked : true;
    setPcKeyboardToMidiEnabled(state.pcKeyboardToMidi);
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
  els.pcKeyboardMidi?.addEventListener('change', update);
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

  // [Refonte 03/09] — Exercice n'a plus d'état replié/déplié à restaurer :
  // c'est une vue de sous-navigation à part entière désormais (voir
  // initPracticeSubnavViews()), au même titre que Sessions MIDI.

  // MIDI diagnostic panel: starts hidden
  els.midiDiagnosticToggle?.addEventListener('click', () => {
    const isHidden = els.midiDiagnosticContent.style.display === 'none';
    els.midiDiagnosticContent.style.display = isHidden ? '' : 'none';
    els.midiDiagnosticPanel.style.display = '';
    els.midiDiagnosticToggle.textContent = isHidden ? '−' : '+';
    els.midiDiagnosticToggle.title = isHidden ? 'Masquer le diagnostic MIDI' : 'Afficher le diagnostic MIDI';
  });
}

// [Refonte 03/09] — Bascule entre les vues de la sous-navigation
// d'Entraînement (Temps réel ↔ Sessions MIDI), sur le même principe que
// initTabNavigation() pour les onglets principaux : un clic sur une pilule
// [data-view] déclenche l'évènement app-switch-training-view, un seul
// gestionnaire l'écoute et bascule l'affichage.
// [Claude 05/09] — Coach d'accompagnement et Pédagogie IA ont désormais chacune
// leur vue et leur data-view ; plus aucune pilule n'est un placeholder.
// [Refonte 03/09] — Exercices a rejoint Sessions MIDI comme vraie destination
// (data-view="exercise") au lieu d'un panneau qu'on ouvrait/fermait à côté de
// Temps réel, sur demande explicite de Narcisse. La scène (#practice-center)
// ne peut pas être dupliquée — c'est la même détection d'accord, une seule
// instance, avec des id= fixes que display.js écrit sans condition — donc les
// trois vues partagent la même .training-workspace ; seul l'attribut
// data-training-view sur #practice-tab change, et c'est practice.css qui,
// selon sa valeur, réduit la scène en bande compacte et élargit le panneau
// Exercice (vue « exercise »), ou masque entièrement le panneau Exercice (vue
// « realtime »). Rien de nouveau n'est calculé ; seule la présentation change.
function initPracticeSubnavViews() {
  const practiceTab = els.practiceLayout;
  const workspace = document.querySelector('#practice-tab .training-workspace');

  // [Claude 05/09] — Table vue → élément, au lieu du seul `midiView` codé en
  // dur : chaque destination qui possède sa propre vue s'ajoute ici. « realtime »
  // et « exercise » n'y figurent pas — elles partagent .training-workspace et se
  // distinguent par data-training-view, que practice.css interprète.
  const dedicatedViews = {
    'midi-sessions': els.practiceViewMidiSessions,
    coach: els.practiceViewCoach,
    pedagogie: els.practiceViewPedagogie,
    copilot: els.practiceViewCopilot,
    // [Refonte Astra 12/09] — Exercices a maintenant sa vue dédiée : elle ne
    // partage plus .training-workspace avec Temps réel, qui redevient intact.
    exercise: els.practiceViewExercices,
  };

  function applyView(view) {
    const dedicated = dedicatedViews[view] || null;
    if (practiceTab) practiceTab.dataset.trainingView = view;
    if (workspace) workspace.style.display = dedicated ? 'none' : '';
    for (const [name, node] of Object.entries(dedicatedViews)) {
      if (!node) continue;
      const active = name === view;
      node.style.display = active ? 'flex' : 'none';
      node.style.flexDirection = active ? 'column' : '';
    }
    document.querySelectorAll('#practice-subnav .practice-mode-btn[data-view]').forEach((btn) => {
      const active = btn.dataset.view === view;
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-selected', String(active));
    });
  }

  document.addEventListener('app-switch-training-view', (e) => {
    if (e.detail?.view) applyView(e.detail.view);
  });

  document.querySelectorAll('#practice-subnav .practice-mode-btn[data-view]').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (btn.disabled) return;
      document.dispatchEvent(new CustomEvent('app-switch-training-view', { detail: { view: btn.dataset.view } }));
    });
  });

  // État initial explicite : sans ça, data-training-view resterait absent au
  // chargement et .quick-exercise-panel (display:flex par défaut dans
  // style.css) apparaîtrait à côté de la scène avant tout clic.
  applyView('realtime');

  // Raccourci « Enregistrer » depuis Temps réel : bascule vers Sessions MIDI
  // et ouvre directement la modale de nouvelle session, comme un clic sur la
  // pilule suivi d'un clic sur « + Nouvelle session ».
  els.practiceRecordBtn?.addEventListener('click', () => {
    switchToRecordingTab();
    document.getElementById('midi-session-new-btn')?.click();
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
// [Refonte 02/09] — Alimente le rail Exercice replié (badge d'avancement,
// maquettes 15/16) et le badge de degré de la scène, à partir des seules
// données déjà calculées par practice-exercise.js. Aucune analyse tonale
// nouvelle : en mode « Accord cible » ou hors exercice, pas de degré à
// afficher, donc le badge reste masqué plutôt que rempli d'une valeur inventée.
function updateExerciseProgressUI(exState) {
  if (els.exerciseCollapsedProgress) {
    let progressText = '';
    if (exState.mode === 'progression' && exState.progression) {
      const total = exState.progression.chords.length;
      progressText = `${exState.progression.name} · ${exState.stepIndex + 1}/${total}`;
    } else if (exState.target) {
      progressText = exState.score > 0 ? `Accord cible · ${exState.score} pts` : 'Accord cible';
    }
    els.exerciseCollapsedProgress.textContent = progressText;
    els.exerciseCollapsedProgress.style.display = progressText ? '' : 'none';
  }

  if (els.exerciseDegreeBadge) {
    const degree = exState.mode === 'progression' ? exState.target?.degree : null;
    if (degree) {
      els.exerciseDegreeBadge.textContent = degree;
      els.exerciseDegreeBadge.style.display = '';
    } else {
      els.exerciseDegreeBadge.style.display = 'none';
    }
  }

  renderExerciseBrief(exState);
  renderExerciseProgressPanel(exState);
}

// [Astra round 3] — Les deux zones dédiées de la vue Exercices
// (.tr-exercise-brief et .tr-exercise-progress) étaient des textes figés :
// l'une annonçait « Un accord, puis le suivant », l'autre promettait un
// avancement qui ne venait jamais. Elles affichent maintenant les données que
// practice-exercise.js calcule déjà — rien n'est inventé, aucun libellé
// pédagogique n'est ajouté.

/** Panneau de gauche : ce qu'on travaille, selon le mode réellement actif. */
function renderExerciseBrief(exState) {
  const category = document.getElementById('exercise-brief-category');
  const title = document.getElementById('exercise-brief-title');
  const text = document.getElementById('exercise-brief-text');
  const keyPill = document.getElementById('exercise-brief-key');
  if (!category || !title || !text) return;

  const target = exState.target;

  if (exState.mode === 'movement' && target?.movementName) {
    category.textContent = target.movementCategory || 'MOUVEMENT 12 TONS';
    title.textContent = target.movementName;
    text.textContent = target.movementDescription || '';
    if (keyPill) {
      // Affichage seul : practice-exercise.js n'expose aucun changement manuel
      // de tonalité, on n'en invente pas un.
      keyPill.textContent = target.keyLabel || '';
      keyPill.style.display = target.keyLabel ? '' : 'none';
    }
    return;
  }

  if (exState.mode === 'progression' && exState.progression) {
    category.textContent = 'PROGRESSION';
    title.textContent = exState.progression.name || 'Progression';
    text.textContent = 'Jouez les accords dans l\'ordre. Le degré attendu est indiqué en face de chaque étape.';
    if (keyPill) keyPill.style.display = 'none';
    return;
  }

  category.textContent = 'ACCORD CIBLE';
  title.textContent = 'Un accord, puis le suivant.';
  text.textContent = "Jouez les notes de l'accord affiché, ensemble ou une à une. La reconnaissance est celle du moteur d'accords de l'application : elle compare les notes reçues, pas votre doigté.";
  if (keyPill) keyPill.style.display = 'none';
}

/** Panneau de droite : compteur, barre et étapes réelles de l'exercice. */
function renderExerciseProgressPanel(exState) {
  const eyebrow = document.getElementById('exercise-progress-eyebrow');
  const counter = document.getElementById('exercise-progress-counter');
  const track = document.getElementById('exercise-progress-track');
  const path = document.getElementById('exercise-progress-path');
  const quiet = document.getElementById('exercise-progress-quiet');
  if (!counter || !track || !path || !quiet) return;

  const bar = track.firstElementChild;
  const showBar = (ratio) => {
    track.style.display = '';
    if (bar) bar.style.width = `${Math.max(0, Math.min(100, ratio * 100)).toFixed(1)}%`;
  };
  const setCounter = (current, total) => {
    counter.style.display = '';
    counter.innerHTML = '';
    const strong = document.createElement('strong');
    strong.textContent = String(current).padStart(2, '0');
    const span = document.createElement('span');
    span.textContent = `/ ${String(total).padStart(2, '0')}`;
    counter.append(strong, span);
  };
  const renderSteps = (chords, activeIndex, withDegree) => {
    path.innerHTML = '';
    chords.forEach((chord, index) => {
      const step = document.createElement('div');
      step.className = index === activeIndex ? 'is-active' : index < activeIndex ? 'is-done' : '';
      const mark = document.createElement('span');
      mark.textContent = withDegree && chord.degree ? chord.degree : String(index + 1);
      const body = document.createElement('div');
      const name = document.createElement('strong');
      name.textContent = chord.name || '—';
      body.appendChild(name);
      step.append(mark, body);
      path.appendChild(step);
    });
  };

  // Mode « Mouvement 12 tons » : deux échelles réelles, les tons et les accords.
  if (exState.mode === 'movement' && exState.progression) {
    const prog = exState.progression;
    const perKey = prog.chords.length || 1;
    const totalKeys = prog.totalKeys || 12;
    const done = (prog.keyIndex || 0) * perKey + (prog.stepIndex || 0);
    if (eyebrow) eyebrow.textContent = 'LE TOUR DES TONALITÉS';
    setCounter((prog.keyIndex || 0) + 1, totalKeys);
    showBar(done / (totalKeys * perKey));
    renderSteps(prog.chords, prog.stepIndex || 0, false);
    quiet.textContent = [exState.target?.keyProgress, exState.target?.stepProgress]
      .filter(Boolean).join(' · ');
    quiet.style.display = quiet.textContent ? '' : 'none';
    return;
  }

  // Mode « Progression » : une seule échelle, les accords de la grille.
  if (exState.mode === 'progression' && exState.progression) {
    const chords = exState.progression.chords || [];
    const total = chords.length || 1;
    const step = exState.stepIndex || 0;
    if (eyebrow) eyebrow.textContent = 'VOTRE PROGRESSION';
    setCounter(Math.min(step + 1, total), total);
    showBar(step / total);
    renderSteps(chords, step, true);
    quiet.textContent = exState.score > 0 ? `${exState.score} pts` : '';
    quiet.style.display = quiet.textContent ? '' : 'none';
    return;
  }

  // Mode « Accord cible » : pas de progression multi-étapes côté Zic. On
  // n'invente pas d'échelle : on montre le score et les tentatives réels.
  if (eyebrow) eyebrow.textContent = 'VOTRE SCORE';
  counter.style.display = 'none';
  track.style.display = 'none';
  path.innerHTML = '';
  const bits = [`${exState.score || 0} pt${(exState.score || 0) > 1 ? 's' : ''}`];
  if (exState.attempts > 0) bits.push(`${exState.attempts} essai${exState.attempts > 1 ? 's' : ''} sur l'accord en cours`);
  quiet.textContent = bits.join(' · ');
  quiet.style.display = '';
}

// [Phase 1 voicing] — Timers de la démo audio de l'exercice, annulés avant
// chaque nouvelle lecture pour éviter les notes superposées.
let exerciseDemoTimers = new Set();

function cancelExerciseDemo() {
  for (const timer of exerciseDemoTimers) {
    clearTimeout(timer);
  }
  exerciseDemoTimers.clear();
}

function playExerciseVoicing(voicing) {
  if (!voicing || !voicing.isPlayable) return;
  cancelExerciseDemo();
  const sequence = voicingToNoteSequence(voicing, { pattern: 'block', durationMs: 1200 });
  for (const note of sequence) {
    try {
      const startTimer = setTimeout(() => {
        exerciseDemoTimers.delete(startTimer);
        playVirtualNote(note.midi, note.velocity || 0.8);
        const releaseTimer = setTimeout(() => {
          exerciseDemoTimers.delete(releaseTimer);
          releaseVirtualNote(note.midi);
        }, note.durationMs);
        exerciseDemoTimers.add(releaseTimer);
      }, note.startOffsetMs);
      exerciseDemoTimers.add(startTimer);
    } catch (err) {
      console.warn('[PracticeExercise] Échec du jeu de la note', note.midi, err);
    }
  }
}

function initPracticeExercise() {
  const panel = document.getElementById('practice-exercise-panel');
  if (!panel) return;

  const modeButtons = panel.querySelectorAll('.exercise-mode-btn');
  const newBtn = document.getElementById('new-exercise-btn');
  const targetDiv = document.getElementById('exercise-target');
  const feedbackDiv = document.getElementById('exercise-feedback');
  const techniqueSelect = els.exerciseTechniqueSelect;

  practiceExercise = createPracticeExercise();

  function render() {
    const exState = practiceExercise.getState();
    targetDiv.style.display = exState.target ? 'flex' : 'none';
    if (exState.target) {
      targetDiv.innerHTML = renderExerciseTarget(exState.target);
    }
    updateExerciseProgressUI(exState);
  }

  modeButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      // Ne pas perdre la progression en cours sur un clic accidentel :
      // si l'exercice courant a déjà été joué, demander confirmation.
      const cur = practiceExercise.getState();
      if (cur.score > 0 || cur.attempts > 0) {
        if (!confirm('Recommencer ? Votre progression sur cet exercice sera perdue.')) return;
      }
      modeButtons.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      practiceExercise.setMode(btn.dataset.mode);
      feedbackDiv.textContent = '';
      render();
    });
  });

  newBtn?.addEventListener('click', () => {
    // Même protection pour "Nouvel exercice" : confirmation si l'exercice
    // courant a déjà été tenté, bascule immédiate sinon.
    const cur = practiceExercise.getState();
    if (cur.attempts > 0) {
      if (!confirm('Recommencer ? Votre progression sur cet exercice sera perdue.')) return;
    }
    practiceExercise.next();
    feedbackDiv.textContent = '';
    render();
  });

  techniqueSelect?.addEventListener('change', () => {
    const value = techniqueSelect.value;
    practiceExercise.setTechnique(value);
    render();
  });

  // Délégation d'événement pour le bouton "Écouter" recréé à chaque render.
  targetDiv?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action="listen-exercise"]');
    if (!btn) return;
    const exState = practiceExercise.getState();
    if (exState.target?.voicing) {
      playExerciseVoicing(exState.target.voicing);
    }
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
  const exState = practiceExercise.getState();
  if (result.success) {
    const targetDiv = document.getElementById('exercise-target');
    targetDiv.innerHTML = renderExerciseTarget(exState.target);
  }
  // [Astra round 3] — mise à jour aussi en cas d'échec : le compteur d'essais
  // du panneau de droite reflète alors la tentative qui vient d'avoir lieu.
  updateExerciseProgressUI(exState);
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

  function openAIModal() {
    loadConfigIntoUI();
    modal.hidden = false;
    modal.style.display = 'flex';
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('tr-dialog-open');
  }

  function closeAIModal() {
    modal.hidden = true;
    modal.style.display = 'none';
    modal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('tr-dialog-open');
  }

  els.aiSettingsToggle?.addEventListener('click', openAIModal);

  document.addEventListener('app-open-ai-settings', openAIModal);

  els.aiCancelBtn?.addEventListener('click', closeAIModal);

  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeAIModal();
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
    closeAIModal();
  });
}

// [Régression 2026-09-06] — Chaque initialisation est blindée individuellement :
// une exception dans UNE fonctionnalité (ex. un sous-onglet neuf) ne doit plus
// JAMAIS empêcher les autres de démarrer. Avant ce correctif, un seul appel qui
// levait dans la séquence ci-dessous laissait Studio, Analyse, la navigation et
// le MIDI muets — silencieusement. Le label passe en argument pour que le
// console.error nomme LA fonctionnalité fautive sans duplication de code.
function safeInit(label, fn) {
  try {
    const result = fn();
    // Les init asynchrones retournent une promesse : un rejet y est attrapé
    // aussi, sinon il resterait non capturé (initMidi, loadSecureAIConfig).
    if (result && typeof result.catch === 'function') {
      result.catch((e) => {
        console.error(`[Main] Échec asynchrone de ${label} — cette fonctionnalité restera indisponible, le reste de l'application continue :`, e);
      });
    }
  } catch (e) {
    console.error(`[Main] Échec de ${label} — cette fonctionnalité restera indisponible, le reste de l'application continue :`, e);
  }
}

async function init() {
  // [Refonte 2026-09-02] — Chargement sécurisé de la config IA en PREMIER.
  // Il doit être AWAITÉ avant d'initialiser le Copilot IA ou toute autre
  // fonctionnalité qui appelle hasAIConfig(), sinon getAIConfig() retourne
  // une clé vide (le préfixe enc: ne peut pas être déchiffré de façon synchrone).
  // Un échec ici ne doit pas bloquer le reste : la clé resterait vide, mais
  // l'app démarre (repli « pas de clé » déjà prévu partout).
  try {
    await loadSecureAIConfig();
  } catch (e) {
    console.warn('[Main] Chargement sécurisé de la config IA impossible :', e);
  }
  safeInit('initTheme', initTheme);
  // [Refonte v2/Global] — bascule de skin (Paramètres › Apparence).
  safeInit('initSkin', () => initSkin({ selector: document.getElementById('skin-selector') }));
  safeInit('initAppSettings', initAppSettings);
  safeInit('initLibraryModal', initLibraryModal);
  safeInit('initKeyboardCollapse', initKeyboardCollapse);
  safeInit('initPanelToggles', initPanelToggles);
  safeInit('refreshKeyboard', refreshKeyboard);
  safeInit('initSettings', initSettings);
  safeInit('initNoteGrouper', initNoteGrouper);
  safeInit('initHistory', initHistory);
  safeInit('initPracticeExercise', initPracticeExercise);
  safeInit('initPracticeSubnavViews', initPracticeSubnavViews);
  // [Refonte 03/09] — Raccordement de Sessions MIDI : getCurrentChord réutilise
  // formatChordResult (même fonction que l'historique d'accords) pour que
  // le nom affiché pendant l'enregistrement soit identique partout ailleurs
  // dans l'app, sans dupliquer la logique de formatage.
  safeInit('initRecordingTab', () => initRecordingTab({
    notation: state.notation,
    feedMidiEvent,
    getCurrentChord: () => (state.currentChord
      ? { ...state.currentChord, name: formatChordResult(state.currentChord) }
      : null),
  }));
  // [Claude 05/09] — Coach d'accompagnement : initialisé comme Sessions MIDI,
  // une fois pour toute l'application. Le module s'abonne lui-même à
  // app-switch-training-view pour rafraîchir sa liste à l'ouverture.
  safeInit('initCoachTab', initCoachTab);
  // [Claude 05/09] — Pédagogie IA, initialisée comme les autres vues dédiées.
  safeInit('initPedagogieTab', initPedagogieTab);
  // [Claude 2026-09-06] — Copilot IA : assistant conversationnel pour le tutoriel.
  safeInit('initCopilotTab', () => initCopilotTab());
  // [Claude 2026-09-08] — Le Copilot IA démontre des notes sur le clavier virtuel
  // sans passer par handleNoteOn (qui alimenterait state.activeNotes, le
  // regroupeur d'accords et l'enregistreur). On écoute ses événements dédiés pour
  // n'allumer / n'éteindre que visuellement la touche concernée.
  safeInit('initCopilotKeyboardEvents', initCopilotKeyboardEvents);
  safeInit('initAISettings', initAISettings);
  // [Claude] — 2026-07-08 — Initialisation de l'onglet Analyse simplifié (import → analyse → grille).
  safeInit('initAnalyzerTab', initAnalyzerTab);

  // [OpenCode] — 2026-07-04 — Initialisation de l'onglet Studio (Module 4)
  // Le Studio est isolé du synthétiseur/clavier principal : aucun feedMidiEvent.
  safeInit('initStudioTab', initStudioTab);
  // La navigation d'onglets et le MIDI sont les deux fonctions les plus
  // critiques : sans elles, l'app semble « vide » (aucun onglet cliquable,
  // aucun périphérique). Elles restent donc en FIN de séquence ET blindées.
  safeInit('initTabNavigation', initTabNavigation);
  // [Refonte Astra 12/09] — raccordement de la coquille recopiée (commutateur
  // Sombre/Clair, logotype). Après initTabNavigation pour que #theme-toggle
  // soit déjà câblé quand le commutateur le clique.
  safeInit('initAstraShell', initAstraShell);
  safeInit('initMidi', () => initMidi());

  // [Claude] — 2026-09-05 — Précharge les échantillons de piano du sampler en
  // arrière-plan, pour que la première vraie note n'attende pas le décodage.
  // Silencieux : en cas d'échec, le moteur synthétique reste le repli.
  safeInit('ensurePianoSamples', () => ensurePianoSamples().then((ok) => {
    if (!ok) console.warn('[Main] échantillons piano indisponibles — repli synthétique');
  }));
}

// [Refonte] — Ma bibliothèque : fenêtre commune au Studio et à l'Analyse,
// ouverte depuis l'en-tête (🎵) ou depuis l'écran d'import de l'Analyse.
function initLibraryModal() {
  const modal = document.getElementById('library-modal');
  if (!modal) return;
  const open = () => {
    modal.style.display = 'flex';
    // La liste est peuplée par analyzer-tab.js ; on lui demande de se
    // rafraîchir à l'ouverture pour refléter les derniers imports.
    document.dispatchEvent(new CustomEvent('app-library-refresh'));
  };
  document.getElementById('library-toggle')?.addEventListener('click', open);
  document.getElementById('analyzer-library-open')?.addEventListener('click', open);
  document.getElementById('library-close')?.addEventListener('click', () => {
    modal.style.display = 'none';
  });
  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.style.display = 'none';
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal.style.display === 'flex') modal.style.display = 'none';
  });
  // Un morceau choisi dans la bibliothèque lance son analyse : la fenêtre a
  // fait son travail, elle se referme.
  modal.addEventListener('click', (e) => {
    if (e.target.closest('.analyzer-library-item')) modal.style.display = 'none';
  });
}

// [Refonte 2026-09-02, rétabli le 2026-09-03] — Repli du clavier virtuel.
//
// Le clavier et sa barre de réglages tiennent environ 200 px en bas de chaque
// écran. Sur une fenêtre de 900 px, il ne reste alors que 490 px à l'espace de
// travail : c'est ce qui obligeait la colonne « Lecture » du Studio et le
// bouton « Lancer l'analyse » à se battre pour quelques dizaines de pixels.
// Le repli est purement additif — déployé par défaut, l'état est mémorisé —
// et ne touche en rien au composant clavier lui-même.
function initCopilotKeyboardEvents() {
  document.addEventListener('copilot-note-on', (e) => {
    const midi = Number(e.detail?.midi);
    if (Number.isFinite(midi)) highlightKey(midi, 'active');
  });
  document.addEventListener('copilot-note-off', (e) => {
    const midi = Number(e.detail?.midi);
    if (Number.isFinite(midi)) unhighlightKey(midi, 'active');
  });
}

function initKeyboardCollapse() {
  const panel = document.getElementById('keyboard-panel');
  const btn = document.getElementById('keyboard-collapse-btn');
  if (!panel || !btn) return;
  const STORAGE_KEY = 'keyboard-collapsed';

  const apply = (collapsed) => {
    panel.classList.toggle('collapsed', collapsed);
    btn.setAttribute('aria-expanded', String(!collapsed));
    btn.title = collapsed ? 'Afficher le clavier virtuel' : 'Réduire le clavier virtuel';
    // Le clavier se redessine sur la largeur disponible : on prévient les
    // composants qui écoutent le redimensionnement.
    window.dispatchEvent(new Event('resize'));
  };

  let saved = false;
  try {
    saved = localStorage.getItem(STORAGE_KEY) === '1';
  } catch (_) { /* pas de persistance : on reste déployé */ }
  apply(saved);

  btn.addEventListener('click', () => {
    const collapsed = !panel.classList.contains('collapsed');
    apply(collapsed);
    try {
      localStorage.setItem(STORAGE_KEY, collapsed ? '1' : '0');
    } catch (_) { /* ignore */ }
  });
}

// [Refonte] — Paramètres de l'application (rouage de l'en-tête). Distinct du
// modal 🔑 qui ne concerne que la clé API de l'assistant IA.
function initAppSettings() {
  const modal = document.getElementById('app-settings-modal');
  const toggle = document.getElementById('app-settings-toggle');
  const close = document.getElementById('app-settings-close');
  if (!modal || !toggle) return;

  toggle.addEventListener('click', () => {
    modal.style.display = 'flex';
  });
  close?.addEventListener('click', () => {
    modal.style.display = 'none';
  });
  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.style.display = 'none';
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal.style.display === 'flex') modal.style.display = 'none';
  });
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

init().catch((e) => {
  console.error('[Main] Échec global de init() — l\'application n\'a pas pu démarrer complètement :', e);
});
