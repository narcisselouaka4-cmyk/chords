import { generateKeyboard, keyboardLayout, setPitchWheel, setModWheel } from './ui/keyboard-svg.js';
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
import { setSustain, ensurePianoSamples, resumeAudio } from './audio/simple-synth.js';

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
import {
  createPracticeExercise,
  renderExerciseTarget,
  difficultyOfVoicing,
  getAvailableTechniques,
  listMovementNames,
  KEY_ORDERS,
  TARGET_QUALITY_GROUPS,
  findChordsByTopNote,
  renderTopNoteBrowser,
  renderVoicingChoices,
  renderDoublingSelect,
  TOP_NOTE_FILTERS,
  TECHNIQUE_LABELS,
  topNoteChoices,
  spellChordTone,
  isTensionQuality,
} from './practice-exercise.js';
import { loadGrids, saveGrids, upsertGrid, removeGrid } from './practice-grids.js';
import movementsLibrary from './data/movements-library.json' with { type: 'json' };
import { keyLabel } from './practice-key-spelling.js';
import {
  loadFavorites,
  saveFavorites,
  toggleFavorite,
  removeFavorite,
  favoriteFromTarget,
  renderFavoritesList,
  restoreFavorites,
} from './practice-favorites.js';
import { voicingToNoteSequence } from './pedagogie/copilot-voicing.js';
import { buildDemo, DEMO_STYLES, DEMO_STYLE_IDS, defaultDemoStyle, demoCardHands } from './practice-demo.js';
import { createDemoPlayer } from './exercise-demo-player.js';
import {
  listMidiOutputs, openMidiOutput, savedMidiOutputName, isMidiOutputActive, currentMidiOutput, sendMidi,
} from './midi-output.js';
import { applyTabVisibility } from './ui/tab-visibility.js';
import { initAstraShell } from './ui/refonte/astra-shell.js';
import { initOnboarding, notifyOnboarding } from './ui/onboarding.js';
import { lightKeyElement, unlightKeyElement } from './ui/key-colors.js';
import { liveTake } from './recorder/live-take.js';
import { registerCopilotContext } from './pedagogie/copilot-context.js';
import { exerciseContext } from './pedagogie/exercise-context.js';
import {
  publishLiveNoteOn,
  publishLiveNoteOff,
  publishLiveSustain,
  hasLiveMidiSubscribers,
} from './melody/live-midi-bus.js';

const state = {
  activeNotes: new Map(), // midi -> velocity
  sustainedNotes: new Set(), // midi sustained while pedal down
  // [Claude] — 2026-09-24 — Notes venues d'une relecture (Sessions MIDI, démo) :
  // la détection d'accord est différée (80 ms), state.isPlayback est déjà
  // retombé quand elle tourne ; c'est cet ensemble qui l'empêche alors de
  // juger l'exercice (une démo qui joue le voicing attendu ne le valide pas).
  playbackNotes: new Set(),
  sustain: false,
  currentPitch: 0,
  currentMod: 0,
  noteStart: 'C0',
  noteEnd: 'C9',
  notation: 'english',
  transpose: 0,
  silentMode: false,
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
// [Claude] — 2026-09-25 — Derniers essais pas encore retenus (notes, accord entendu) :
// le Copilote les reçoit avec l'exercice (« Demander au Copilote », « Qu'en penses-tu ? »).
const exerciseAttempts = [];
let renderPracticeExercise = null;

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
  practiceMidiStatusDot: document.getElementById('practice-midi-status-dot'),
  practiceMidiStatusText: document.getElementById('practice-midi-status-text'),
  practiceRecordBtn: document.getElementById('practice-record-btn'),
  exerciseDifficultySelect: document.getElementById('exercise-difficulty-select'),
  exerciseKeySelect: document.getElementById('exercise-key-select'),
  exerciseMovementSettings: document.getElementById('exercise-movement-settings'),
  exerciseKeyGrid: document.getElementById('exercise-key-grid'),
  exerciseKeyOrder: document.getElementById('exercise-key-order'),
  exerciseCurrentKey: document.getElementById('exercise-current-key'),
  exerciseKeyStrip: document.getElementById('exercise-key-strip'),
  exerciseChordsEyebrow: document.getElementById('exercise-chords-eyebrow'),
  exerciseArenaEyebrow: document.getElementById('exercise-arena-eyebrow'),
  exerciseGridForm: document.getElementById('exercise-grid-form'),
  exerciseGridRoot: document.getElementById('exercise-grid-root'),
  exerciseGridQuality: document.getElementById('exercise-grid-quality'),
  exerciseGridAdd: document.getElementById('exercise-grid-add'),
  exerciseGridChips: document.getElementById('exercise-grid-chips'),
  exerciseGridClear: document.getElementById('exercise-grid-clear'),
  exerciseGridTop: document.getElementById('exercise-grid-top'),
  exerciseGridCancel: document.getElementById('exercise-grid-cancel'),
  exerciseGridName: document.getElementById('exercise-grid-name'),
  exerciseGridSave: document.getElementById('exercise-grid-save'),
  exerciseGridStatus: document.getElementById('exercise-grid-status'),
  exerciseTargetChoice: document.getElementById('exercise-target-choice'),
  exerciseTargetRoot: document.getElementById('exercise-target-root'),
  exerciseTargetQuality: document.getElementById('exercise-target-quality'),
  exerciseTopNote: document.getElementById('exercise-top-note'),
  exerciseTopNoteLevel: document.getElementById('exercise-top-note-level'),
  exerciseTopNoteBrowser: document.getElementById('exercise-topnote-browser'),
  exerciseTopNoteFilters: document.getElementById('exercise-topnote-filters'),
  exerciseTopNoteFiltersHint: document.getElementById('exercise-topnote-filters-hint'),
  exerciseChordSide: document.getElementById('exercise-chord-side'),
  exerciseChordHead: document.getElementById('exercise-chord-head'),
  exerciseFavorites: document.getElementById('exercise-favorites'),
  exerciseFavoritesSearch: document.getElementById('exercise-favorites-search'),
  exerciseFavoritesDialog: document.getElementById('exercise-favorites-dialog'),
  exerciseFavoritesCount: document.getElementById('exercise-favorites-count'),
  exerciseVoicingChoices: document.getElementById('exercise-voicing-choices'),
  exerciseFiltersDialog: document.getElementById('exercise-filters-dialog'),
  exerciseFiltersCount: document.getElementById('exercise-filters-count'),
  exerciseDoublingFilter: document.getElementById('exercise-doubling-filter'),
  exerciseTopNoteReset: document.getElementById('exercise-topnote-reset'),
  exerciseRandomTargetBtn: document.getElementById('exercise-random-target-btn'),
  exerciseLibraryBtn: document.getElementById('exercise-library-btn'),
  exerciseLibrary: document.getElementById('exercise-library'),
  exerciseLibrarySearch: document.getElementById('exercise-library-search'),
  exerciseLibraryCategories: document.getElementById('exercise-library-categories'),
  exerciseLibraryGrid: document.getElementById('exercise-library-grid'),
  practiceViewMidiSessions: document.getElementById('practice-view-midi-sessions'),
  practiceViewCoach: document.getElementById('practice-view-coach'),
  practiceViewPedagogie: document.getElementById('practice-view-pedagogie'),
  practiceViewCopilot: document.getElementById('practice-view-copilot'),
  practiceViewExercices: document.getElementById('practice-view-exercices'),

  keyboardSize: document.getElementById('keyboard-size'),
  transposeInput: document.getElementById('transpose'),
  toleranceInput: document.getElementById('tolerance'),
  silentMode: document.getElementById('silent-mode'),
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
  // Pas de plancher ici : generateKeyboard borne déjà la hauteur des touches.
  // L'ancien plancher (60 px) faisait rétrécir en largeur un clavier réduit.
  const height = Math.max(rect.height, 1);

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
  fitKeyboardPanelHeight(width);
  initVirtualKeyboard({
    onNoteOn: (note, velocity = 0.8) => handleNoteOn(note, velocity, true, true),
    onNoteOff: (note) => handleNoteOff(note, true, true),
  });
}

/**
 * Hauteur du clavier virtuel décidée par l'application : la zone des touches
 * prend la hauteur idéale de keyboardLayout (proportions de piano). Le panneau
 * est ajusté du même écart ; le ResizeObserver redessine ensuite les touches.
 */
function fitKeyboardPanelHeight(width) {
  const panel = document.getElementById('keyboard-panel');
  if (!panel || panel.classList.contains('collapsed')) return;
  const { keysHeightPx } = keyboardLayout(state.noteStart, state.noteEnd, width);
  const current = els.keyboard.getBoundingClientRect().height;
  if (current <= 0 || Math.abs(keysHeightPx - current) < 1) return;
  panel.style.height = `${Math.round(panel.getBoundingClientRect().height + keysHeightPx - current)}px`;
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
  // [Claude] — 2026-09-25 — Bleu : tes doigts ; jaune : l'application (voir key-colors.js).
  for (const midi of state.activeNotes.keys()) {
    lightKey(midi, state.playbackNotes.has(midi));
  }
  for (const midi of state.sustainedNotes) {
    lightKey(midi, state.playbackNotes.has(midi));
  }
  for (const midi of state.suggestionNotes) {
    lightKey(midi, true);
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
      unlightKey(n);
      releaseVirtualNote(n);
    }
    state.suggestionNotes.clear();
  }
  if (action === 'play' && notes && notes.length > 0) {
    for (const note of notes) {
      playVirtualNote(note, 0.78);
      lightKey(note, true);
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

/** Allume une touche : en jaune si c'est l'application qui la joue (key-colors.js). */
function lightKey(midi, fromApp = false) {
  lightKeyElement(document.getElementById(`note-${midi}`), fromApp);
}

function unlightKey(midi) {
  unlightKeyElement(document.getElementById(`note-${midi}`));
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
  // [Claude] — 2026-09-25 — Une relecture (session, démo, exemple) s'affiche mais
  // n'entre pas dans l'historique de ce que l'élève a joué.
  if (!notes.some((n) => state.playbackNotes.has(n))) addToHistory(result);

  // Vérification de l'exercice rapide si un accord valide est détecté.
  // [Refonte 03/09] — Jamais pendant une relecture Sessions MIDI : rejouer une
  // session ne doit pas faire progresser un exercice en cours.
  // [Claude] — 2026-09-24 — La réponse est jugée sur l'accord annoncé : un
  // voicing juste que le détecteur ne sait pas nommer (« ? ») est validé aussi,
  // mais un « ? » faux (accord en cours de formation) ne compte pas d'essai.
  const fromPlayback = notes.some((n) => state.playbackNotes.has(n));
  if (!state.isPlayback && !fromPlayback && result && result.notes.length >= 3
    && (result.symbol !== '?' || practiceExercise?.isCorrect(result.notes))) {
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
  // [Claude] — 2026-09-24 — Jouer soi-même arrête la démo en cours.
  if (!state.isPlayback && demoPlayer.isPlaying()) demoPlayer.stop();
  // Auto-clear suggestion notes when user plays real MIDI
  if (!state.isPlayback && state.suggestionNotes.size > 0) {
    for (const n of state.suggestionNotes) {
      unlightKey(n);
      releaseVirtualNote(n);
    }
    state.suggestionNotes.clear();
  }
  const safeVelocity = Number.isFinite(velocity) && velocity >= 0 && velocity <= 1 ? velocity : 0.8;
  if (audible && !state.silentMode) playVirtualNote(transposed, safeVelocity);
  state.activeNotes.set(transposed, safeVelocity);
  if (state.isPlayback) state.playbackNotes.add(transposed);
  else state.playbackNotes.delete(transposed);
  // [Claude] — 2026-09-25 — Jaune quand l'application joue (démo, exemple, relecture).
  lightKey(transposed, state.isPlayback);
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
  if (!state.isPlayback) {
    feedRecorderNoteOn(note, safeVelocity);
    // [Claude] — 2026-09-25 — Mémoire du jeu récent (« Qu'en penses-tu ? ») : la
    // note entendue (transposition comprise), jamais une démo ni une relecture.
    liveTake.noteOn(transposed, safeVelocity, undefined, note);
  }
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
  if (!state.isPlayback) {
    feedRecorderNoteOff(note);
    liveTake.noteOff(transposed, undefined, note);
  }
  if (state.sustain) {
    // [Claude] — 2026-09-24 — Touche relâchée : elle quitte les notes tenues et
    // ne sonne plus que par la pédale (sustainedNotes). Restée dans activeNotes,
    // elle survivait au relevé de la pédale (touche allumée et comptée dans
    // l'accord détecté jusqu'au prochain appui).
    state.activeNotes.delete(transposed);
    state.sustainedNotes.add(transposed);
    noteGrouper?.noteOff(transposed, { sustained: true });
    if (hasLiveMidiSubscribers()) publishLiveNoteOff(note, 0);
    return;
  }
  state.activeNotes.delete(transposed);
  state.playbackNotes.delete(transposed);
  unlightKey(transposed);
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
  if (!state.isPlayback) {
    feedRecorderSustain(value);
    liveTake.sustain(Boolean(value));
  }
  if (!value) {
    for (const note of state.sustainedNotes) {
      if (!state.activeNotes.has(note)) {
        unlightKey(note);
        state.playbackNotes.delete(note);
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

// [Claude] — 2026-09-24 — Démo des mouvements et « Écouter » (Narcisse : « comme
// si c'était nous qui jouions alors que c'est l'application qui joue ») : même
// chemin qu'un évènement de clavier (touches allumées, accord détecté, bus
// live), jamais enregistré ni jugé par l'exercice (state.isPlayback et
// state.playbackNotes). Notes à leur hauteur écrite : la transposition
// d'affichage est compensée. Sortie MIDI choisie : les notes partent vers le
// VST et le piano intégré se tait.
function feedDemoEvent(type, a, b) {
  const toOutput = isMidiOutputActive();
  if (toOutput) {
    if (type === 'noteOn') sendMidi([0x90, a, Math.max(1, Math.min(127, Math.round((b ?? 0.8) * 127)))]);
    else if (type === 'noteOff') sendMidi([0x80, a, 0]);
    else if (type === 'sustain') sendMidi([0xb0, 64, a ? 127 : 0]);
  }
  state.isPlayback = true;
  try {
    if (type === 'noteOn') handleNoteOn(a - state.transpose, b, true, !toOutput);
    else if (type === 'noteOff') handleNoteOff(a - state.transpose, true, !toOutput);
    else if (type === 'sustain') handleSustain(Boolean(a));
  } finally {
    state.isPlayback = false;
  }
}

// Notes possibles au dessus d'un accord (voice leading), mises en cache : le
// calcul parcourt toutes les techniques.
const topNoteChoicesCache = new Map();
function cachedTopNoteChoices(rootPc, quality) {
  const key = `${rootPc}|${quality}`;
  if (!topNoteChoicesCache.has(key)) topNoteChoicesCache.set(key, topNoteChoices(rootPc, quality));
  return topNoteChoicesCache.get(key);
}

// Rappels posés par initPracticeExercise (accord suivi, accord de passage, fin
// de démo) ; cardExtras : notes que la démo ajoute à la carte affichée ;
// playingPassing : rang de l'accord suivi par le passage qui sonne.
const demoHooks = { onStep: null, onPassing: null, onEnd: null, cardExtras: null, playingPassing: null };
const demoPlayer = createDemoPlayer({
  send: feedDemoEvent,
  onStep: (step) => demoHooks.onStep?.(step),
  onPassing: (after) => demoHooks.onPassing?.(after),
  onEnd: (reason) => demoHooks.onEnd?.(reason),
});

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

// [Claude] — 2026-09-24 — Menu « Sortie » du pied de page : piano intégré ou port
// MIDI (VST). Le dernier choix est rouvert au lancement, par son nom.
async function initMidiOutput() {
  const select = document.getElementById('midi-output-select');
  if (!select) return;
  const fill = async () => {
    const outputs = await listMidiOutputs().catch(() => []);
    const current = currentMidiOutput();
    select.innerHTML = '<option value="">Piano intégré</option>'
      + outputs.map((o) => `<option value="${String(o.id).replace(/"/g, '&quot;')}">${String(o.name).replace(/</g, '&lt;')}</option>`).join('');
    select.value = current ? String(current.id) : '';
    return outputs;
  };
  const outputs = await fill();
  const saved = savedMidiOutputName();
  const match = saved && outputs.find((o) => o.name === saved);
  if (match) {
    await openMidiOutput(match.id, match.name);
    select.value = String(match.id);
  }
  // Nouveaux ports (hôte de VST lancé après l'application) : liste relue à l'ouverture du menu.
  select.addEventListener('focus', fill);
  select.addEventListener('change', async () => {
    demoPlayer.stop();
    const option = select.selectedOptions[0];
    const opened = await openMidiOutput(select.value || null, option?.textContent || null);
    if (select.value && !opened) {
      setStatus('Sortie MIDI impossible à ouvrir : retour au piano intégré');
      select.value = '';
    } else {
      setStatus(opened ? `Démo et « Écouter » joués sur ${opened.name}` : 'Démo et « Écouter » joués sur le piano intégré');
    }
  });
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

// [Claude] — 2026-09-25 — La pastille « Toi » de la légende du clavier suit la
// couleur des notes réglée dans le pied de page (bleue par défaut).
function applyYouColor() {
  document.documentElement.style.setProperty('--kb-you', state.colorNote);
}

function initSettings() {
  els.noteStart.value = state.noteStart;
  els.noteEnd.value = state.noteEnd;
  els.keyboardSize.value = 'midi';
  els.notation.value = state.notation || 'english';
  els.colorNote.value = state.colorNote;
  els.colorTonic.value = state.colorTonic;
  applyYouColor();
  els.transposeInput.value = state.transpose;
  // [Claude] — 2026-09-24 — Silencieux coché à l'ouverture (demande de Narcisse) :
  // le clavier joué ne sonne pas par défaut ; « Écouter » de l'Exercice n'est
  // pas concerné (il appelle directement playVirtualNote).
  state.silentMode = true;
  els.silentMode.checked = true;
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
    applyYouColor();

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
  // Rien à côté du titre du sous-onglet « Exercices » (demande de Narcisse) :
  // le mode et l'avancement sont déjà affichés dans la vue.
  if (els.exerciseCollapsedProgress) {
    els.exerciseCollapsedProgress.textContent = '';
    els.exerciseCollapsedProgress.style.display = 'none';
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
// [Claude] — 2026-09-24 — Mode Progression retiré ; en Mouvement, la colonne de
// gauche porte les réglages du tour (niveau, tonalités, ordre, départ) et celle
// de droite la tonalité en cours, la frise des tonalités et les accords, tous
// cliquables (Narcisse : tonalité active mal placée, réglages « posés à la
// va-vite », pas de saut direct à un accord, tonalités non choisies).

const KEY_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
const DEMO_PLAY_ICON = '<svg class="tr-i" width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5.5v13l11-6.5z"/></svg>';
const DEMO_STOP_ICON = '<svg class="tr-i" width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6.5" y="6.5" width="11" height="11" rx="1.5"/></svg>';

/** Panneau de gauche : ce qu'on travaille, et les réglages du tour en Mouvement. */
function renderExerciseBrief(exState) {
  const category = document.getElementById('exercise-brief-category');
  const title = document.getElementById('exercise-brief-title');
  const text = document.getElementById('exercise-brief-text');
  if (!category || !title || !text) return;

  const target = exState.target;
  const isMovement = exState.mode === 'movement' && Boolean(target?.movementName);
  if (els.exerciseMovementSettings) els.exerciseMovementSettings.hidden = !isMovement;

  if (isMovement) {
    category.textContent = target.movementCategory || 'MOUVEMENT 12 TONS';
    title.textContent = target.movementName;
    text.textContent = target.movementDescription || '';
    renderMovementSettings(exState);
    return;
  }

  category.textContent = 'ACCORD CIBLE';
  title.textContent = 'Un accord, puis le suivant.';
  text.textContent = '';
}

/** Réglages du tour : niveau, tonalités retenues, ordre et départ, lus dans l'état. */
function renderMovementSettings(exState) {
  if (els.exerciseDifficultySelect) {
    els.exerciseDifficultySelect.value = String(exState.difficulty);
    // Mouvement aux accords fixés (Barry Harris, « Ma grille ») : le niveau ne change pas ses qualités.
    const fixed = Boolean(exState.progression?.movement?.preserveQualities);
    els.exerciseDifficultySelect.disabled = fixed;
    els.exerciseDifficultySelect.title = fixed ? 'Les accords de ce mouvement sont fixés : le niveau ne les change pas.' : '';
  }
  const keySet = new Set(exState.keySet || []);
  if (els.exerciseKeyGrid) {
    els.exerciseKeyGrid.innerHTML = KEY_NAMES.map((name, pc) => {
      const on = keySet.has(pc);
      const alone = on && keySet.size === 1;
      return `<button type="button" class="exercise-key-toggle${on ? ' is-on' : ''}" data-key-toggle="${pc}" aria-pressed="${on}"${alone ? ' disabled title="Au moins une tonalité"' : ''}>${name}</button>`;
    }).join('') + `<button type="button" class="exercise-key-all" data-key-all${keySet.size === 12 ? ' hidden' : ''}>Toutes les tonalités</button>`;
  }
  if (els.exerciseKeyOrder) {
    if (!els.exerciseKeyOrder.options.length) {
      els.exerciseKeyOrder.innerHTML = Object.entries(KEY_ORDERS).map(([id, o]) => `<option value="${id}">${o.label}</option>`).join('');
    }
    els.exerciseKeyOrder.value = exState.keyOrder || 'chromatic';
  }
  if (els.exerciseKeySelect) {
    els.exerciseKeySelect.innerHTML = '<option value="">Au hasard</option>'
      + KEY_NAMES.map((name, pc) => (keySet.has(pc) ? `<option value="${pc}">${name}</option>` : '')).join('');
    els.exerciseKeySelect.value = exState.keyChoice == null ? '' : String(exState.keyChoice);
  }
}

/** Panneau de droite : tonalité en cours, frise des tonalités, accords (cliquables). */
function renderExerciseProgressPanel(exState) {
  const eyebrow = document.getElementById('exercise-progress-eyebrow');
  const counter = document.getElementById('exercise-progress-counter');
  const track = document.getElementById('exercise-progress-track');
  const path = document.getElementById('exercise-progress-path');
  const quiet = document.getElementById('exercise-progress-quiet');
  if (!counter || !track || !path || !quiet) return;

  const bar = track.firstElementChild;
  const prog = exState.mode === 'movement' ? exState.progression : null;
  if (els.exerciseCurrentKey) els.exerciseCurrentKey.hidden = !prog;
  if (els.exerciseKeyStrip) els.exerciseKeyStrip.hidden = !prog;
  if (els.exerciseChordsEyebrow) els.exerciseChordsEyebrow.hidden = !prog;
  // [Claude] — 2026-09-24 (nuit) — Accords de passage = étapes à jouer (règle de
  // Narcisse : les tensions ne se jouent qu'en passage ; le niveau se lit aux passages).
  const steps = prog ? prog.chords.reduce((n, c) => n + (c.passingChord ? 2 : 1), 0) : 0;
  const stepNumber = prog
    ? prog.chords.slice(0, prog.stepIndex || 0).reduce((n, c) => n + (c.passingChord ? 2 : 1), 0) + (prog.onPassing ? 1 : 0)
    : 0;
  if (els.exerciseArenaEyebrow) {
    els.exerciseArenaEyebrow.textContent = prog && exState.target?.keyName
      ? `À VOUS DE JOUER · ${exState.target.keyName.toUpperCase()} · ACCORD ${stepNumber + 1} / ${steps}${prog.onPassing ? ' · PASSAGE' : ''}`
      : 'À VOUS DE JOUER';
  }

  if (prog) {
    const keys = prog.keys || [];
    const perKey = steps || 1;
    const totalKeys = prog.totalKeys || keys.length || 1;
    const keyIndex = prog.keyIndex || 0;
    const stepIndex = prog.stepIndex || 0;
    const onPassing = Boolean(prog.onPassing);
    const minor = Boolean(prog.minor);
    if (eyebrow) eyebrow.textContent = 'LE TOUR DES TONALITÉS';
    if (els.exerciseCurrentKey) els.exerciseCurrentKey.textContent = exState.target?.keyName || keyLabel(prog.currentKey, minor);
    counter.style.display = '';
    counter.innerHTML = `<span>Tonalité</span><strong>${String(keyIndex + 1).padStart(2, '0')}</strong><span>/ ${String(totalKeys).padStart(2, '0')}</span>`;
    track.style.display = '';
    if (bar) bar.style.width = `${Math.max(0, Math.min(100, ((keyIndex * perKey + stepNumber) / (totalKeys * perKey)) * 100)).toFixed(1)}%`;
    if (els.exerciseKeyStrip) {
      els.exerciseKeyStrip.innerHTML = keys.map((pc, i) => {
        const state = i === keyIndex ? ' is-current' : i < keyIndex ? ' is-done' : '';
        const name = keyLabel(pc, minor).split(' ')[0];
        return `<button type="button" class="exercise-key-chip${state}" data-key-index="${i}" title="Aller en ${keyLabel(pc, minor)}"${i === keyIndex ? ' aria-current="true"' : ''}>${name}</button>`;
      }).join('');
    }
    // Voice leading : note du dessus choisie pour l'accord (⚠ si aucun voicing ne l'a au sommet).
    const topTag = (chord) => {
      const rootName = /^[A-G][#b]*/.exec(chord.name || '')?.[0];
      const topName = chord.topInterval != null ? spellChordTone(rootName, chord.topInterval, chord.quality) : null;
      return topName
        ? `<small class="exercise-path-top${chord.topMissed ? ' is-missed' : ''}" title="${chord.topMissed ? `Aucun voicing n'a ${topName} au sommet : dessus libre joué` : `Dessus : ${topName}`}">♪ ${topName}${chord.topMissed ? ' ⚠' : ''}</small>`
        : '';
    };
    const notes = (list) => list.map((n) => `${noteName(((n % 12) + 12) % 12)}${Math.floor(n / 12) - 1}`).join(' ');
    // Accords de passage (entre deux accords) : des étapes comme les autres,
    // cliquables, allumés aussi quand la démo les joue.
    path.innerHTML = prog.chords.map((chord, i) => {
      const current = i === stepIndex && !onPassing;
      const state = current ? 'is-active' : i < stepIndex || (i === stepIndex && onPassing) ? 'is-done' : '';
      const row = `<button type="button" class="${state}" data-step="${i}" title="Afficher ${chord.name}"${current ? ' aria-current="step"' : ''}><span>${i + 1}</span><div><strong>${chord.name || '—'}</strong>${topTag(chord)}</div></button>`;
      const p = chord.passingChord;
      if (!p) return row;
      const onIt = onPassing && i === stepIndex;
      const passingState = onIt ? ' is-active' : i < stepIndex ? ' is-done' : '';
      const playing = demoHooks.playingPassing === i ? ' is-playing' : '';
      const hands = `main gauche ${notes(p.voicing?.leftHand || [])}, main droite ${notes(p.voicing?.rightHand || [])}`;
      return `${row}<button type="button" class="exercise-passing-chord${passingState}${playing}" data-passing="${i}" title="Accord de passage (tension) — ${hands}. Cliquez pour le travailler."${onIt ? ' aria-current="step"' : ''}><span aria-hidden="true">↳</span><div><strong>${p.name}</strong><small>passage</small>${topTag(p)}</div></button>`;
    }).join('');
    quiet.textContent = 'Cliquez une tonalité ou un accord pour y aller directement.';
    quiet.style.display = '';
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

// [Claude] — 2026-09-24 — « Écouter » passe par le lecteur de démo : touches
// allumées comme au clavier, sortie MIDI vers le VST si elle est choisie.
async function playExerciseVoicing(voicing) {
  if (!voicing || !voicing.isPlayable) return;
  // Réveille l'AudioContext si nécessaire avant de planifier les notes.
  try {
    await resumeAudio();
  } catch (err) {
    console.warn('[PracticeExercise] Impossible de réveiller l\'audio', err);
    return;
  }
  const sequence = voicingToNoteSequence(voicing, { pattern: 'block', durationMs: 1200 });
  // Tempo 60 : un temps = une seconde.
  const events = sequence.flatMap((n) => [
    { time: n.startOffsetMs / 1000, type: 'noteOn', note: n.midi, velocity: n.velocity || 0.8 },
    { time: (n.startOffsetMs + n.durationMs) / 1000, type: 'noteOff', note: n.midi },
  ]).sort((a, b) => a.time - b.time || (a.type === 'noteOff' ? -1 : 1));
  demoPlayer.play({ events, beats: Math.max(...events.map((e) => e.time)) }, { tempo: 60 });
}

function initPracticeExercise() {
  const panel = document.getElementById('practice-exercise-panel');
  if (!panel) return;

  const modeButtons = panel.querySelectorAll('.exercise-mode-btn');
  const targetDiv = document.getElementById('exercise-target');
  const feedbackDiv = document.getElementById('exercise-feedback');

  practiceExercise = createPracticeExercise();
  registerCopilotContext('exercise', () => (practiceExercise ? exerciseContext(practiceExercise.getState(), exerciseAttempts) : null));
  // [Claude] — 2026-09-25 — « Demander au Copilote » : l'assistant reçoit l'exercice affiché.
  document.getElementById('exercise-copilot-btn')?.addEventListener('click', () => {
    document.dispatchEvent(new CustomEvent('app-switch-training-view', { detail: { view: 'copilot' } }));
    document.dispatchEvent(new CustomEvent('copilot-open-exercise'));
  });

  const prevBtn = document.getElementById('prev-exercise-btn');

  const escapeAttr = (str) => String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

  // Note du dessus changée sur la carte d'une grille Perso, gardée dans la
  // grille enregistrée ({ name, step }) : signalé sous la carte de cet accord.
  let topSavedNotice = null;

  function render() {
    const exState = practiceExercise.getState();
    targetDiv.style.display = exState.target ? 'flex' : 'none';
    if (exState.target) {
      const categories = getAvailableTechniques(exState.target.name);
      const difficulty = difficultyOfVoicing(exState.target);
      const isFavorite = exerciseFavorites.some((f) => f.key === favoriteFromTarget(exState.target)?.key);
      // Orthographe des notes selon la tonalité (Mouvement).
      const prog = exState.progression;
      const spelling = exState.mode === 'movement' && prog ? { keyPc: prog.currentKey, minor: Boolean(prog.minor) } : null;
      // Voice leading : note du dessus de l'accord affiché (Mouvement).
      let topNote = null;
      const mainChord = prog?.chords?.[prog.stepIndex || 0];
      const step = prog?.onPassing ? mainChord?.passingChord : mainChord;
      if (exState.mode === 'movement' && step) {
        const rootName = /^[A-G][#b]*/.exec(step.name)?.[0];
        if (topSavedNotice && (topSavedNotice.step !== (prog.stepIndex || 0) || topSavedNotice.passing !== Boolean(prog.onPassing)
          || topSavedNotice.name !== exState.customGridName)) topSavedNotice = null;
        topNote = {
          choices: cachedTopNoteChoices(step.rootPc, step.quality).map((c) => ({ ...c, name: spellChordTone(rootName, c.interval, step.quality) })),
          selected: step.topInterval ?? null,
          missed: Boolean(step.topMissed),
          missedName: step.topInterval != null ? spellChordTone(rootName, step.topInterval, step.quality) : null,
          savedIn: topSavedNotice?.name || null,
        };
      }
      targetDiv.innerHTML = renderExerciseTarget(exState.target, {
        categories, difficulty, variant: exState.variant, selectedTechnique: exState.technique,
        doubling: exState.doubling, isFavorite, layout: exState.mode === 'chord' ? 'chord' : 'default', spelling,
        leftHandStyle: exState.leftHandStyle,
        topNote,
        // Accord de passage : l'accord vers lequel il mène (le premier de la grille pour un retour).
        passingTo: prog?.onPassing ? (prog.chords[(prog.stepIndex || 0) + 1] || prog.chords[0])?.name : null,
        demo: demoHooks.cardExtras?.(exState) || null,
      });
    }
    refreshTargetChoice(exState);
    refreshChordSide(exState);
    refreshDemoButtons(exState);
    if (prevBtn) {
      prevBtn.style.display = practiceExercise.canGoPrevious() ? '' : 'none';
    }
    updateExerciseProgressUI(exState);
    showExerciseNotice(exState);
  }

  // [Claude] — 2026-09-24 — Mouvement ou progression impossible à construire,
  // accord ignoré ou sauté : practice-exercise.js le signale dans `notice` au
  // lieu de remplacer en silence ; on l'affiche une fois dans la bulle.
  let lastExerciseNotice = null;
  function showExerciseNotice(exState) {
    const notice = exState.progression?.notice || null;
    if (notice && notice !== lastExerciseNotice && feedbackDiv) {
      feedbackDiv.textContent = notice;
      feedbackDiv.className = 'exercise-feedback error';
      clearTimeout(feedbackHideTimer);
      feedbackHideTimer = setTimeout(() => { feedbackDiv.textContent = ''; }, 10000);
    }
    lastExerciseNotice = notice;
  }

  // Voicings favoris (mode Accord cible), persistés dans localStorage.
  let exerciseFavorites = loadFavorites(window.localStorage);
  // Favoris retirés récemment : ils s'accumulent tant que le bandeau
  // « Annuler » est affiché (10 s après le dernier retrait), puis sont oubliés.
  let removedFavorites = [];
  let removedFavoriteTimer = null;
  let favoritesQuery = '';
  const FAVORITES_SEARCH_MIN = 8;

  /**
   * Disposition du mode Accord cible : bande du haut (choix de l'accord,
   * boutons des fenêtres Filtres et Favoris), colonne gauche réduite à la note
   * du dessus + résultats, colonne droite = voicings de l'accord à la place du
   * score. Les autres modes gardent la leur.
   */
  function refreshChordSide(exState) {
    const isChord = exState.mode === 'chord';
    const stage = els.exerciseChordHead?.closest('.tr-exercise-stage');
    stage?.classList.toggle('is-chord-mode', isChord);
    if (els.exerciseChordHead) els.exerciseChordHead.hidden = !isChord;
    // Retour de jeu : en Accord cible, bulle à gauche de la bande du haut (sans
    // recouvrir les réglages) ; ailleurs, bulle flottante en haut de la zone.
    const feedback = document.getElementById('exercise-feedback');
    const feedbackHome = isChord ? els.exerciseChordHead : stage;
    if (feedback && feedbackHome && feedback.parentElement !== feedbackHome) feedbackHome.prepend(feedback);
    els.exerciseChordSide?.closest('.tr-exercise-progress')?.classList.toggle('is-chord-side', isChord);
    if (els.exerciseChordSide) els.exerciseChordSide.hidden = !isChord;
    if (!isChord) return;
    // Voicings disponibles de l'accord affiché (hors de la carte en Accord cible).
    if (els.exerciseVoicingChoices) {
      els.exerciseVoicingChoices.innerHTML = exState.target
        ? renderVoicingChoices(exState.target, { variant: exState.variant, selectedTechnique: exState.technique })
        : '';
    }
    // Fenêtre Filtres : doublures, et nombre de réglages actifs sur le bouton.
    if (els.exerciseDoublingFilter) els.exerciseDoublingFilter.innerHTML = renderDoublingSelect(exState.doubling);
    if (els.exerciseFiltersCount) {
      const topNoteActive = exState.topNote?.pc == null ? 0
        : [...Object.keys(TOP_NOTE_FILTERS), 'level'].filter((k) => (exState.topNote[k] || 'all') !== 'all').length;
      const active = topNoteActive + (exState.doubling && exState.doubling !== 'none' ? 1 : 0);
      els.exerciseFiltersCount.hidden = active === 0;
      els.exerciseFiltersCount.textContent = String(active);
    }
    // Bouton Favoris : nombre de favoris enregistrés (rien quand la liste est vide).
    if (els.exerciseFavoritesCount) {
      els.exerciseFavoritesCount.hidden = exerciseFavorites.length === 0;
      els.exerciseFavoritesCount.textContent = String(exerciseFavorites.length);
    }
    if (!els.exerciseFavorites) return;
    const activeKey = exState.target?.voicing?.source === 'favori' ? favoriteFromTarget(exState.target)?.key : null;
    // Recherche seulement quand la liste devient longue (place limitée) ; en
    // dessous, le regroupement par accord suffit. Une recherche en cours reste visible.
    if (els.exerciseFavoritesSearch) {
      els.exerciseFavoritesSearch.hidden = exerciseFavorites.length < FAVORITES_SEARCH_MIN && !favoritesQuery;
    }
    els.exerciseFavorites.innerHTML = renderFavoritesList(exerciseFavorites, {
      techniqueLabels: TECHNIQUE_LABELS, activeKey, query: favoritesQuery, removed: removedFavorites.map((r) => r.fav),
    });
  }

  els.exerciseFavorites?.addEventListener('click', (e) => {
    const open = e.target.closest('[data-favorite-open]');
    if (open) {
      const fav = exerciseFavorites.find((f) => f.key === open.dataset.favoriteOpen);
      if (fav) practiceExercise.showFavorite(fav);
      // [Claude] — 2026-09-25 — Favori choisi : la fenêtre se ferme sur la carte.
      // Fermée ici (par sa croix, qui rend le focus au bouton Favoris) : render()
      // réécrit la liste, le clic ne remonte donc plus jusqu'à la fenêtre.
      if (fav) els.exerciseFavoritesDialog?.querySelector('[data-astra-close]')?.click();
      render();
      return;
    }
    const remove = e.target.closest('[data-favorite-remove]');
    if (remove) {
      const index = exerciseFavorites.findIndex((f) => f.key === remove.dataset.favoriteRemove);
      if (index < 0) return;
      removedFavorites.push({ fav: exerciseFavorites[index], index });
      exerciseFavorites = removeFavorite(exerciseFavorites, remove.dataset.favoriteRemove);
      saveFavorites(window.localStorage, exerciseFavorites);
      clearTimeout(removedFavoriteTimer);
      removedFavoriteTimer = setTimeout(() => { removedFavorites = []; render(); }, 10000);
      render();
      return;
    }
    if (e.target.closest('[data-favorite-undo]') && removedFavorites.length > 0) {
      exerciseFavorites = restoreFavorites(exerciseFavorites, removedFavorites);
      saveFavorites(window.localStorage, exerciseFavorites);
      removedFavorites = [];
      clearTimeout(removedFavoriteTimer);
      render();
    }
  });
  els.exerciseFavoritesSearch?.addEventListener('input', () => {
    favoritesQuery = els.exerciseFavoritesSearch.value;
    render();
  });

  // Navigateur par note du dessus : clé du dernier rendu complet, pour ne pas
  // reconstruire la liste (et perdre le défilement) à chaque clic.
  let topNoteBrowserKey = '';

  function refreshTopNoteBrowser(exState) {
    const box = els.exerciseTopNoteBrowser;
    if (!box) return;
    const topPc = exState.topNote?.pc;
    const hint = document.getElementById('exercise-topnote-browser-hint');
    if (hint) hint.hidden = topPc != null;
    if (exState.mode !== 'chord' || topPc == null) {
      box.hidden = true;
      topNoteBrowserKey = '';
      return;
    }
    box.hidden = false;
    // Mêmes options que la carte (niveau + filtres) : les index concordent.
    const { pc: _pc, ...searchOptions } = exState.topNote;
    const selected = exState.target?.voicing?.topNoteSuggestions && !exState.target.topNoteMiss
      ? { rootPc: exState.target.rootPc, quality: exState.target.symbol }
      : null;
    // Seul le filtre Technique restreint les techniques, jamais la technique
    // cliquée auparavant sur la carte.
    const key = JSON.stringify(exState.topNote);
    if (key !== topNoteBrowserKey) {
      const results = findChordsByTopNote(topPc, searchOptions);
      box.innerHTML = renderTopNoteBrowser(results, { topPc, selected });
      topNoteBrowserKey = key;
      return;
    }
    // Même liste : on ne déplace que la surbrillance (le défilement est conservé).
    box.querySelectorAll('.exercise-browser-chord.selected').forEach((b) => b.classList.remove('selected'));
    if (selected) {
      const row = box.querySelector(`[data-browse-root="${selected.rootPc}"][data-browse-quality="${CSS.escape(selected.quality)}"]`);
      row?.classList.add('selected');
      // Garde la ligne sélectionnée visible dans la liste (sans faire défiler la page).
      const list = box.querySelector('[data-browser-scroll]');
      if (row && list) {
        const top = row.offsetTop - list.offsetTop;
        if (top < list.scrollTop || top + row.offsetHeight > list.scrollTop + list.clientHeight) {
          list.scrollTop = Math.max(0, top - list.clientHeight / 3);
        }
      }
    }
  }

  /** Affiche ou masque le sélecteur d'accord cible selon le mode. */
  function refreshTargetChoice(exState) {
    if (!els.exerciseTargetChoice) return;
    if (exState.mode === 'chord') {
      els.exerciseTargetChoice.style.display = '';
      const choice = exState.targetChoice;
      if (els.exerciseTargetRoot) els.exerciseTargetRoot.value = String(choice ? choice.rootPc : exState.target?.rootPc ?? 0);
      if (els.exerciseTargetQuality) els.exerciseTargetQuality.value = choice ? choice.symbol : (exState.target?.symbol ?? '');
      const topPc = exState.topNote?.pc;
      if (els.exerciseTopNote) els.exerciseTopNote.value = topPc == null ? '' : String(topPc);
      if (els.exerciseTopNoteLevel) {
        els.exerciseTopNoteLevel.value = exState.topNote?.level || 'all';
        els.exerciseTopNoteLevel.disabled = topPc == null;
      }
      if (els.exerciseTopNoteFilters) {
        els.exerciseTopNoteFilters.hidden = topPc == null;
        if (els.exerciseTopNoteFiltersHint) els.exerciseTopNoteFiltersHint.hidden = topPc != null;
        let active = 0;
        els.exerciseTopNoteFilters.querySelectorAll('[data-topnote-filter], #exercise-top-note-level').forEach((sel) => {
          if (sel.dataset.topnoteFilter) sel.value = exState.topNote?.[sel.dataset.topnoteFilter] || 'all';
          // Filtre actif mis en évidence : on voit d'un coup d'œil ce qui restreint la liste.
          sel.classList.toggle('is-active', sel.value !== 'all');
          if (sel.value !== 'all') active += 1;
        });
        // Réinitialiser seulement s'il y a de quoi.
        if (els.exerciseTopNoteReset) els.exerciseTopNoteReset.hidden = active === 0;
      }
      refreshTopNoteBrowser(exState);
    } else {
      els.exerciseTargetChoice.style.display = 'none';
      refreshTopNoteBrowser(exState);
    }
  }

  // Exposé au module pour que checkPracticeExercise() rafraîchisse aussi le
  // bouton « Accord précédent » après une réponse, et pas seulement la carte
  // et le panneau de progression.
  renderPracticeExercise = render;

  function setModeButtonActive(mode) {
    modeButtons.forEach((b) => b.classList.toggle('active', b.dataset.mode === mode));
  }

  function maybeConfirmReset() {
    const cur = practiceExercise.getState();
    if (cur.score > 0 || cur.attempts > 0) {
      return confirm('Recommencer ? Votre progression sur cet exercice sera perdue.');
    }
    return true;
  }

  modeButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      // Ne pas perdre la progression en cours sur un clic accidentel :
      // si l'exercice courant a déjà été joué, demander confirmation.
      if (!maybeConfirmReset()) return;
      setModeButtonActive(btn.dataset.mode);
      practiceExercise.setMode(btn.dataset.mode);
      feedbackDiv.textContent = '';
      render();
    });
  });

  const difficultySelect = els.exerciseDifficultySelect;
  difficultySelect?.addEventListener('change', () => {
    const value = difficultySelect.value;
    practiceExercise.setDifficulty(value);
    render();
  });

  els.exerciseKeySelect?.addEventListener('change', () => {
    const value = els.exerciseKeySelect.value;
    practiceExercise.setKeyChoice(value);
    render();
  });

  // Tonalités du tour : bascule d'une tonalité, « Toutes », ordre de parcours.
  els.exerciseKeyGrid?.addEventListener('click', (e) => {
    const exState = practiceExercise.getState();
    const toggle = e.target.closest('[data-key-toggle]');
    if (toggle) {
      const pc = Number(toggle.dataset.keyToggle);
      const set = new Set(exState.keySet);
      if (set.has(pc)) set.delete(pc);
      else set.add(pc);
      if (set.size === 0) return;
      practiceExercise.setKeySet([...set]);
      render();
      return;
    }
    if (e.target.closest('[data-key-all]')) {
      practiceExercise.setKeySet(Array.from({ length: 12 }, (_, pc) => pc));
      render();
    }
  });
  els.exerciseKeyOrder?.addEventListener('change', () => {
    practiceExercise.setKeyOrder(els.exerciseKeyOrder.value);
    render();
  });

  // Saut direct : une tonalité de la frise, un accord de la liste.
  els.exerciseKeyStrip?.addEventListener('click', (e) => {
    const chip = e.target.closest('[data-key-index]');
    if (!chip) return;
    practiceExercise.goToKey(Number(chip.dataset.keyIndex));
    feedbackDiv.textContent = '';
    render();
  });
  document.getElementById('exercise-progress-path')?.addEventListener('click', (e) => {
    const passingRow = e.target.closest('[data-passing]');
    if (passingRow) {
      // Accord de passage : une étape de l'exercice, comme les autres.
      if (practiceExercise.getState().mode !== 'movement') return;
      practiceExercise.goToPassing(Number(passingRow.dataset.passing));
      feedbackDiv.textContent = '';
      render();
      return;
    }
    const step = e.target.closest('[data-step]');
    if (!step || practiceExercise.getState().mode !== 'movement') return;
    practiceExercise.goToStep(Number(step.dataset.step));
    feedbackDiv.textContent = '';
    render();
  });

  // Navigation arrière : réexaminer l'accord précédent (et éventuellement en
  // changer la technique) sans consommer de tentative ni toucher au score.
  prevBtn?.addEventListener('click', () => {
    if (!practiceExercise.previous()) return;
    feedbackDiv.textContent = '';
    render();
  });

  // ── Bibliothèque des mouvements (fenêtre Astra) ──
  // [Claude] — 2026-09-24 — Fenêtre centrée (.tr-overlay, ouverte et fermée par
  // astra-shell.js : fond, Échap, ✕) ; onglet Progressions retiré avec le mode.
  let libraryCategory = null;
  // Ma grille : accords choisis, dans l'ordre ({ root, quality, top }).
  let gridChords = [];
  // Grilles enregistrées (catégorie Perso de la bibliothèque).
  let customGrids = loadGrids(window.localStorage);
  // Grille dont la suppression attend confirmation (second clic).
  let gridDeleteArmed = null;
  let gridDeleteTimer = null;
  let librarySearch = '';

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function renderStarString(level) {
    const filled = Math.min(5, Math.max(1, Number(level) || 1));
    const empty = 5 - filled;
    return '<span class="star filled" aria-hidden="true">★</span>'.repeat(filled)
      + '<span class="star empty" aria-hidden="true">☆</span>'.repeat(empty);
  }

  // [Claude] — 2026-09-24 — Catégorie Perso : grilles enregistrées depuis « Ma
  // grille » (Narcisse : « une nouvelle catégorie Perso pour y stocker toutes nos grilles »).
  const PERSO_CATEGORY = 'Perso';
  /** Résumé d'une grille enregistrée : accords, passages entre parenthèses, notes du dessus (« Dm11 ♪ C → (D7b9) → G13 »). */
  const gridSummary = (grid) => {
    const chords = grid.chords.map((c) => gridChordFrom(c.name, c.top));
    const roles = gridRoles(chords.map((c) => c || { quality: '' }));
    return grid.chords.map((c, i) => {
      const top = chords[i] ? gridTopLabel(chords[i]) : '';
      const label = top ? `${c.name} ♪ ${top}` : c.name;
      return roles[i] === 'passing' ? `(${label})` : label;
    }).join(' → ');
  };

  function getLibraryItems() {
    const movements = (movementsLibrary?.movements || []).map((m) => ({
      id: m.id,
      name: m.name,
      category: m.category || 'Mouvements 12 tons',
      level: m.level,
      description: m.description || '',
      tags: m.tags || [],
      style: m.style,
    }));
    const perso = customGrids.map((g) => ({
      id: g.id,
      name: g.name,
      category: PERSO_CATEGORY,
      level: 0,
      description: gridSummary(g),
      tags: [],
      style: undefined,
      grid: g,
    }));
    return [...movements, ...perso];
  }

  function renderLibrary() {
    const all = getLibraryItems();
    let items = all;
    const q = librarySearch.trim().toLowerCase();
    if (q) {
      items = items.filter((item) =>
        item.name.toLowerCase().includes(q)
        || item.category.toLowerCase().includes(q)
        || item.description.toLowerCase().includes(q)
        || item.tags.some((tag) => tag.toLowerCase().includes(q)));
    }
    // Catégories de la bibliothèque par ordre alphabétique, Perso (vos grilles) en dernier.
    const categories = [...new Set(all.map((i) => i.category))].filter((c) => c !== PERSO_CATEGORY)
      .sort((a, b) => a.localeCompare(b)).concat(PERSO_CATEGORY);
    if (els.exerciseLibraryCategories) {
      els.exerciseLibraryCategories.innerHTML = [`<button type="button" class="exercise-library-chip ${libraryCategory ? '' : 'active'}" data-category="" aria-pressed="${!libraryCategory}">Tous<span class="exercise-library-count">${all.length}</span></button>`]
        .concat(categories.map((cat) => {
          const count = all.filter((i) => i.category === cat).length;
          const active = libraryCategory === cat;
          return `<button type="button" class="exercise-library-chip ${active ? 'active' : ''}" data-category="${escapeAttr(cat)}" aria-pressed="${active}">${escapeHtml(cat)}<span class="exercise-library-count">${count}</span></button>`;
        })).join('');
    }
    if (libraryCategory) items = items.filter((i) => i.category === libraryCategory);
    const persoLast = (item) => (item.category === PERSO_CATEGORY ? 1 : 0);
    items.sort((a, b) => persoLast(a) - persoLast(b) || a.category.localeCompare(b.category) || (a.level || 0) - (b.level || 0) || a.name.localeCompare(b.name));
    if (!els.exerciseLibraryGrid) return;
    const current = practiceExercise.getState().progression?.name;
    const empty = libraryCategory === PERSO_CATEGORY && !q
      ? 'Aucune grille perso pour l\'instant : composez une grille dans « Ma grille », donnez-lui un nom puis « Enregistrer ».'
      : 'Aucun mouvement ne correspond à votre recherche.';
    els.exerciseLibraryGrid.innerHTML = items.length === 0
      ? `<div class="exercise-library-empty">${empty}</div>`
      : items.map((item) => `<article class="exercise-library-card${item.name === current ? ' is-current' : ''}${item.grid ? ' is-perso' : ''}" data-id="${escapeAttr(item.id)}" tabindex="0" role="button" aria-label="${escapeAttr(item.grid ? `${item.name}, grille perso` : `${item.name}, niveau ${item.level} sur 5`)}">
            <div class="exercise-library-card-header">
              <span class="exercise-library-card-category">${escapeHtml(item.category)}</span>
              ${item.grid
    ? `<span class="exercise-library-card-count">${item.grid.chords.length} accord${item.grid.chords.length > 1 ? 's' : ''}</span>`
    : `<span class="exercise-library-card-stars" title="Niveau ${item.level} sur 5">${renderStarString(item.level)}</span>`}
            </div>
            <h4>${escapeHtml(item.name)}${item.name === current ? '<span class="exercise-library-current">En cours</span>' : ''}</h4>
            <p>${escapeHtml(item.description)}</p>
            <div class="exercise-library-card-actions">
              <button type="button" class="exercise-library-play${previewId === item.id ? ' is-playing' : ''}" data-preview="${escapeAttr(item.id)}" aria-label="${escapeAttr(`${previewId === item.id ? 'Arrêter' : 'Écouter'} : ${item.name}`)}">${previewId === item.id ? DEMO_STOP_ICON : DEMO_PLAY_ICON}<span>${previewId === item.id ? 'Arrêter' : 'Écouter'}</span></button>
              ${item.grid ? `<button type="button" class="exercise-library-grid-action" data-grid-load="${escapeAttr(item.id)}" aria-label="${escapeAttr(`Modifier la grille ${item.name}`)}">Modifier</button>
              <button type="button" class="exercise-library-grid-action is-danger${gridDeleteArmed === item.id ? ' is-armed' : ''}" data-grid-delete="${escapeAttr(item.id)}" aria-label="${escapeAttr(`Supprimer la grille ${item.name}`)}">${gridDeleteArmed === item.id ? 'Confirmer' : 'Supprimer'}</button>` : ''}
            </div>
          </article>`).join('');
  }

  /** Prépare le contenu ; l'ouverture elle-même est faite par astra-shell.js (data-astra-open). */
  function openLibrary() {
    libraryCategory = null;
    librarySearch = '';
    if (els.exerciseLibrarySearch) els.exerciseLibrarySearch.value = '';
    const exState = practiceExercise.getState();
    if (exState.customGrid) {
      gridChords = exState.customGrid.map((t) => gridChordFrom(t.name, t.top)).filter(Boolean);
      if (els.exerciseGridName) els.exerciseGridName.value = exState.customGridName || '';
    }
    gridEditing = null;
    renderGridChips();
    renderLibrary();
  }

  function closeLibrary() {
    if (!els.exerciseLibrary || els.exerciseLibrary.hidden) return;
    els.exerciseLibrary.hidden = true;
    document.body.classList.remove('tr-dialog-open');
  }

  /** Passe en mode Mouvement si besoin (après confirmation si un exercice est en cours). */
  function ensureMovementMode() {
    if (practiceExercise.getState().mode === 'movement') return true;
    if (!maybeConfirmReset()) return false;
    practiceExercise.setMode('movement');
    setModeButtonActive('movement');
    return true;
  }

  function selectLibraryCard(item) {
    demoPlayer.stop();
    if (!ensureMovementMode()) return;
    if (item.grid) practiceExercise.setCustomGrid(item.grid.chords, { name: item.grid.name });
    else practiceExercise.setContentChoice(item.name);
    closeLibrary();
    feedbackDiv.textContent = '';
    render();
  }

  els.exerciseLibraryBtn?.setAttribute('data-astra-open', 'exercise-library');
  els.exerciseLibraryBtn?.addEventListener('click', openLibrary);

  // ── Ma grille : accords choisis un par un (fondamentale + qualité) ──
  // [Claude] — 2026-09-24 — Narcisse : « pas pratique d'écrire, mieux de
  // sélectionner ». Puis : note du dessus par accord (voice leading), un accord
  // précis se modifie d'un clic (« sans tout recommencer »), la grille
  // s'enregistre sous un nom dans la catégorie Perso de la bibliothèque.
  // gridChords : { root: 'D', quality: 'm11', top: intervalle | null }.
  const GRID_ROOTS = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
  const GRID_MAX = 16;
  let gridEditing = null; // rang de l'accord en cours de modification
  if (els.exerciseGridRoot) {
    els.exerciseGridRoot.innerHTML = GRID_ROOTS.map((name) => `<option value="${name}">${name}</option>`).join('');
  }
  if (els.exerciseGridQuality) {
    els.exerciseGridQuality.innerHTML = TARGET_QUALITY_GROUPS.map((group) => `
      <optgroup label="${group.label}">${group.qualities.map((q) =>
    `<option value="${escapeAttr(q)}">${q === '5' ? '5 (power chord)' : escapeAttr(q)}</option>`).join('')}
      </optgroup>`).join('');
    els.exerciseGridQuality.value = 'm7';
  }

  const gridChordName = (c) => `${c.root}${c.quality}`;
  /** Accord de grille depuis son nom (« Dm11 ») et sa note du dessus. */
  const gridChordFrom = (name, top = null) => {
    const match = /^([A-G][#b]?)(.*)$/.exec(String(name || ''));
    return match ? { root: match[1], quality: match[2], top: Number.isInteger(top) ? top : null } : null;
  };
  const gridTopLabel = (c) => (c.top == null ? '' : spellChordTone(c.root, c.top, c.quality));

  // [Claude] — 2026-09-24 (nuit) — Règle de Narcisse : un accord de tension (7b9,
  // 7alt, dim7…) ne se joue qu'en passage, entre deux accords principaux. Rôle de
  // chaque accord de la grille, comme le moteur le lira (splitGridPassing) : un
  // accord de tension qui suit un accord principal est son passage ; en tête ou
  // après un autre passage, il reste principal.
  function gridRoles(chords) {
    let mainSeen = false;
    let passingTaken = true;
    return chords.map((c) => {
      if (isTensionQuality(c.quality) && mainSeen && !passingTaken) {
        passingTaken = true;
        return 'passing';
      }
      mainSeen = true;
      passingTaken = false;
      return 'main';
    });
  }

  /** Refus d'un accord de tension à la place `index` (null = il peut s'y jouer en passage). */
  function passingRefusal(chord, index, chords) {
    if (!isTensionQuality(chord.quality)) return null;
    const before = chords[index - 1];
    const after = chords[index + 1];
    if (!before) return `${gridChordName(chord)} est un accord de tension : il se joue en passage, après un accord principal. Ajoutez d'abord l'accord qu'il suit.`;
    if (isTensionQuality(before.quality) || (after && isTensionQuality(after.quality))) return 'Un seul accord de passage entre deux accords principaux.';
    return null;
  }

  /** Libellé du bouton d'ajout : « Ajouter en passage » pour un accord de tension. */
  function refreshGridAddLabel() {
    if (!els.exerciseGridAdd) return;
    const tension = isTensionQuality(els.exerciseGridQuality?.value ?? '');
    els.exerciseGridAdd.textContent = gridEditing != null ? `Modifier l'accord ${gridEditing + 1}` : tension ? 'Ajouter en passage' : 'Ajouter';
  }

  /** Menu « Dessus » : notes de l'accord choisi, grisées si aucun voicing ne les met au sommet. */
  function renderGridTopOptions(selected = null) {
    if (!els.exerciseGridTop || !els.exerciseGridRoot || !els.exerciseGridQuality) return;
    const root = els.exerciseGridRoot.value;
    const quality = els.exerciseGridQuality.value;
    const rootPc = GRID_ROOTS.indexOf(root);
    const choices = rootPc >= 0 ? cachedTopNoteChoices(rootPc, quality) : [];
    els.exerciseGridTop.innerHTML = ['<option value="">Dessus libre</option>']
      .concat(choices.map((c) => `<option value="${c.interval}"${c.available ? '' : ' disabled'}>Dessus ${escapeAttr(spellChordTone(root, c.interval, quality))} (${escapeAttr(c.degree)})</option>`))
      .join('');
    const keep = choices.find((c) => c.interval === selected && c.available);
    els.exerciseGridTop.value = keep ? String(selected) : '';
  }

  function renderGridChips() {
    if (!els.exerciseGridChips) return;
    const roles = gridRoles(gridChords);
    els.exerciseGridChips.innerHTML = gridChords.length
      ? gridChords.map((c, i) => {
        const name = gridChordName(c);
        const top = gridTopLabel(c);
        const passing = roles[i] === 'passing';
        // Accord de tension resté principal (grille d'avant la règle) : signalé.
        const stray = !passing && isTensionQuality(c.quality);
        const title = passing ? 'Accord de passage (tension) — cliquer pour le modifier'
          : stray ? 'Accord de tension joué comme accord principal : placez-le après un accord principal' : 'Modifier cet accord';
        return `<li class="${[i === gridEditing ? 'is-editing' : '', passing ? 'is-passing' : '', stray ? 'is-stray' : ''].filter(Boolean).join(' ')}"><button type="button" class="exercise-grid-chip" data-grid-edit="${i}" title="${title}" aria-label="Modifier l'accord ${i + 1} : ${escapeAttr(name)}${passing ? ', accord de passage' : ''}${top ? `, dessus ${escapeAttr(top)}` : ''}">${passing ? '<span aria-hidden="true">↳</span>' : ''}${escapeAttr(name)}${top ? `<small>♪ ${escapeAttr(top)}</small>` : ''}</button><button type="button" data-grid-remove="${i}" aria-label="Retirer ${escapeAttr(name)}" title="Retirer">×</button></li>`;
      }).join('')
      : '<li class="exercise-grid-empty">Aucun accord pour l\'instant : choisissez une fondamentale et une qualité, puis « Ajouter ».</li>';
    const editing = gridEditing != null;
    if (els.exerciseGridAdd) els.exerciseGridAdd.disabled = !editing && gridChords.length >= GRID_MAX;
    refreshGridAddLabel();
    if (els.exerciseGridCancel) els.exerciseGridCancel.hidden = !editing;
  }

  /**
   * Grille Perso en cours : la note du dessus choisie sur la carte est gardée
   * dans la grille enregistrée (même nom), comme si elle avait été modifiée
   * dans « Ma grille ». Les flèches (variantes) ne touchent pas la grille.
   * @returns {{name: string, step: number, passing: boolean}|null}
   */
  function keepCardTopInPerso(step, passing = false) {
    const exState = practiceExercise.getState();
    const name = String(exState.customGridName || '').trim().toLowerCase();
    const saved = name ? customGrids.find((g) => g.name.trim().toLowerCase() === name) : null;
    if (!saved || !exState.customGrid) return null;
    // Grille jouée sous ce nom mais changée sans être enregistrée : on n'écrase rien.
    const sameChords = saved.chords.length === exState.customGrid.length
      && saved.chords.every((c, i) => c.name === exState.customGrid[i].name);
    if (!sameChords) return null;
    const { grids, grid } = upsertGrid(customGrids, { name: saved.name, chords: exState.customGrid.map((c) => ({ name: c.name, top: c.top })) });
    if (!grid) return null;
    customGrids = grids;
    saveGrids(window.localStorage, customGrids);
    return { name: exState.customGridName, step, passing };
  }

  function gridStatus(message) {
    if (!els.exerciseGridStatus) return;
    els.exerciseGridStatus.textContent = message;
    clearTimeout(gridStatus.timer);
    gridStatus.timer = setTimeout(() => { els.exerciseGridStatus.textContent = ''; }, 4000);
  }

  function stopGridEditing() {
    gridEditing = null;
    renderGridChips();
  }

  els.exerciseGridRoot?.addEventListener('change', () => renderGridTopOptions(els.exerciseGridTop?.value === '' ? null : Number(els.exerciseGridTop?.value)));
  els.exerciseGridQuality?.addEventListener('change', () => {
    renderGridTopOptions(els.exerciseGridTop?.value === '' ? null : Number(els.exerciseGridTop?.value));
    refreshGridAddLabel();
  });
  els.exerciseGridAdd?.addEventListener('click', () => {
    const root = els.exerciseGridRoot?.value;
    const quality = els.exerciseGridQuality?.value ?? '';
    if (!root) return;
    const topValue = els.exerciseGridTop?.value ?? '';
    const chord = { root, quality, top: topValue === '' ? null : Number(topValue) };
    if (gridEditing != null) {
      // Modification d'un accord précis : les autres restent tels quels.
      const refusal = passingRefusal(chord, gridEditing, gridChords);
      if (refusal) {
        gridStatus(refusal);
        return;
      }
      gridChords[gridEditing] = chord;
      gridStatus(`Accord ${gridEditing + 1} modifié : ${gridChordName(chord)}${chord.top != null ? ` (dessus ${gridTopLabel(chord)})` : ''}.`);
      gridEditing = null;
    } else {
      if (gridChords.length >= GRID_MAX) return;
      const refusal = passingRefusal(chord, gridChords.length, gridChords);
      if (refusal) {
        gridStatus(refusal);
        return;
      }
      gridChords.push(chord);
      if (isTensionQuality(quality)) gridStatus(`${gridChordName(chord)} ajouté en passage, au dernier temps de ${gridChordName(gridChords[gridChords.length - 2])}.`);
    }
    renderGridChips();
  });
  els.exerciseGridCancel?.addEventListener('click', stopGridEditing);
  els.exerciseGridChips?.addEventListener('click', (e) => {
    const remove = e.target.closest('[data-grid-remove]');
    if (remove) {
      const index = Number(remove.dataset.gridRemove);
      gridChords.splice(index, 1);
      if (gridEditing === index) gridEditing = null;
      else if (gridEditing != null && gridEditing > index) gridEditing -= 1;
      renderGridChips();
      return;
    }
    const edit = e.target.closest('[data-grid-edit]');
    if (!edit) return;
    // Un clic sur un accord le charge dans les menus pour le modifier.
    const index = Number(edit.dataset.gridEdit);
    const chord = gridChords[index];
    if (!chord) return;
    gridEditing = index;
    if (els.exerciseGridRoot) els.exerciseGridRoot.value = GRID_ROOTS.includes(chord.root) ? chord.root : 'C';
    if (els.exerciseGridQuality) els.exerciseGridQuality.value = chord.quality;
    renderGridTopOptions(chord.top);
    renderGridChips();
  });
  els.exerciseGridClear?.addEventListener('click', () => {
    gridChords = [];
    gridEditing = null;
    if (els.exerciseGridName) els.exerciseGridName.value = '';
    renderGridChips();
  });
  // Enregistrer : catégorie Perso de la bibliothèque (même nom = mise à jour).
  els.exerciseGridSave?.addEventListener('click', () => {
    if (gridChords.length === 0) {
      els.exerciseGridRoot?.focus();
      gridStatus('Ajoutez au moins un accord avant d\'enregistrer.');
      return;
    }
    const name = els.exerciseGridName?.value.trim() || '';
    if (!name) {
      els.exerciseGridName?.focus();
      gridStatus('Donnez un nom à la grille pour l\'enregistrer.');
      return;
    }
    const { grids, grid } = upsertGrid(customGrids, { name, chords: gridChords.map((c) => ({ name: gridChordName(c), top: c.top })) });
    if (!grid) return;
    customGrids = grids;
    saveGrids(window.localStorage, customGrids);
    gridStatus(`« ${grid.name} » enregistrée dans Perso.`);
    renderLibrary();
  });
  renderGridTopOptions();
  renderGridChips();

  els.exerciseGridForm?.addEventListener('submit', (e) => {
    e.preventDefault();
    if (gridChords.length === 0) {
      els.exerciseGridRoot?.focus();
      return;
    }
    if (practiceExercise.getState().mode !== 'movement' && !maybeConfirmReset()) return;
    const name = els.exerciseGridName?.value.trim() || null;
    practiceExercise.setCustomGrid(gridChords.map((c) => ({ name: gridChordName(c), top: c.top })), { name });
    setModeButtonActive('movement');
    closeLibrary();
    feedbackDiv.textContent = '';
    render();
  });

  els.exerciseLibrarySearch?.addEventListener('input', (e) => {
    librarySearch = e.target.value;
    renderLibrary();
  });

  els.exerciseLibraryCategories?.addEventListener('click', (e) => {
    const chip = e.target.closest('button[data-category]');
    if (!chip) return;
    const cat = chip.dataset.category || null;
    libraryCategory = libraryCategory === cat ? null : cat;
    renderLibrary();
  });

  const pickLibraryCard = (card) => {
    const item = getLibraryItems().find((i) => i.id === card.dataset.id);
    if (item) selectLibraryCard(item);
  };
  els.exerciseLibraryGrid?.addEventListener('click', (e) => {
    const play = e.target.closest('[data-preview]');
    if (play) {
      togglePreview(play.dataset.preview);
      return;
    }
    // Grille Perso : « Modifier » la charge dans « Ma grille » (même nom = mise à jour).
    const load = e.target.closest('[data-grid-load]');
    if (load) {
      const grid = customGrids.find((g) => g.id === load.dataset.gridLoad);
      if (!grid) return;
      gridChords = grid.chords.map((c) => gridChordFrom(c.name, c.top)).filter(Boolean);
      gridEditing = null;
      if (els.exerciseGridName) els.exerciseGridName.value = grid.name;
      renderGridChips();
      gridStatus(`« ${grid.name} » chargée : cliquez un accord pour le modifier, puis « Enregistrer ».`);
      els.exerciseGridForm?.scrollIntoView({ block: 'nearest' });
      return;
    }
    // « Supprimer » demande une confirmation (second clic dans les 3 s).
    const del = e.target.closest('[data-grid-delete]');
    if (del) {
      const id = del.dataset.gridDelete;
      if (gridDeleteArmed !== id) {
        gridDeleteArmed = id;
        clearTimeout(gridDeleteTimer);
        gridDeleteTimer = setTimeout(() => { gridDeleteArmed = null; renderLibrary(); }, 3000);
        renderLibrary();
        return;
      }
      const grid = customGrids.find((g) => g.id === id);
      customGrids = removeGrid(customGrids, id);
      saveGrids(window.localStorage, customGrids);
      gridDeleteArmed = null;
      clearTimeout(gridDeleteTimer);
      if (grid) gridStatus(`« ${grid.name} » supprimée de Perso.`);
      renderLibrary();
      return;
    }
    const card = e.target.closest('.exercise-library-card');
    if (card) pickLibraryCard(card);
  });
  els.exerciseLibraryGrid?.addEventListener('keydown', (e) => {
    if (e.target.closest('[data-preview], [data-grid-load], [data-grid-delete]')) return;
    const card = e.target.closest('.exercise-library-card');
    if (!card || (e.key !== 'Enter' && e.key !== ' ')) return;
    e.preventDefault();
    pickLibraryCard(card);
  });

  // ── Démo des mouvements ──
  // [Claude] — 2026-09-24 — « Écouter le mouvement » (vue Mouvement : la carte
  // suit l'accord joué, puis revient où l'on était) et « Écouter » sur chaque
  // carte de la bibliothèque (aperçu sans rien choisir). Voicings de l'exercice,
  // sortie MIDI si elle est choisie. Style choisi par l'utilisateur, ou selon le
  // mouvement (jazz → Comping swing, gospel / worship → Gospel, « Ma grille » →
  // Ballade) ; chaque style a son tempo.
  // demoContext : { kind: 'movement', stepBefore, passingBefore } | { kind: 'preview', previewId } | null
  let demoContext = null;
  let previewId = null;

  const DEMO_STYLE_STORAGE = 'exercise-demo-style';
  let demoStyle = 'auto';
  try {
    const saved = window.localStorage?.getItem(DEMO_STYLE_STORAGE);
    if (saved && (saved === 'auto' || DEMO_STYLES[saved])) demoStyle = saved;
  } catch (e) {
    // Stockage indisponible : « Selon le mouvement ».
  }
  const resolveDemoStyle = (movementStyle) => (demoStyle === 'auto' ? defaultDemoStyle(movementStyle) : demoStyle);
  const demoStyleSelects = [...document.querySelectorAll('[data-demo-style]')];
  // Options posées une fois (un menu reconstruit à chaque rendu se refermerait
  // pendant la démo) ; seul le libellé « Selon le mouvement » suit le mouvement.
  demoStyleSelects.forEach((select) => {
    select.innerHTML = '<option value="auto">Selon le mouvement</option>'
      + DEMO_STYLE_IDS.map((id) => `<option value="${id}">${DEMO_STYLES[id].label} · ${DEMO_STYLES[id].tempo}</option>`).join('');
    select.value = demoStyle;
    select.addEventListener('change', () => {
      demoStyle = select.value;
      try {
        window.localStorage?.setItem(DEMO_STYLE_STORAGE, demoStyle);
      } catch (e) {
        // Choix gardé pour cette séance seulement.
      }
      demoStyleSelects.forEach((other) => { other.value = demoStyle; });
      demoPlayer.stop();
      // Carte (notes ajoutées par la démo) et liste (accords de passage) suivent le style.
      render();
    });
  });

  async function startDemo(chords, context, movementStyle) {
    if (!chords?.length) return;
    try {
      await resumeAudio();
    } catch (err) {
      console.warn('[Démo] Audio indisponible', err);
    }
    const styleId = resolveDemoStyle(movementStyle);
    demoPlayer.play(buildDemo(chords, styleId), { tempo: DEMO_STYLES[styleId].tempo });
    demoContext = context;
    previewId = context.kind === 'preview' ? context.previewId : null;
    refreshDemoButtons(practiceExercise.getState());
    if (context.kind === 'preview') renderLibrary();
  }

  function toggleMovementDemo() {
    if (demoContext?.kind === 'movement') {
      demoPlayer.stop();
      return;
    }
    const exState = practiceExercise.getState();
    if (exState.mode !== 'movement' || !exState.progression) return;
    startDemo(exState.progression.chords, { kind: 'movement', stepBefore: exState.progression.stepIndex || 0, passingBefore: Boolean(exState.progression.onPassing) }, exState.progression.movement?.style);
  }

  function togglePreview(id) {
    if (previewId === id) {
      demoPlayer.stop();
      return;
    }
    const item = getLibraryItems().find((i) => i.id === id);
    const exState = practiceExercise.getState();
    // Aperçu dans la tonalité en cours (sinon le départ choisi, sinon Do) ; une
    // grille Perso, dans le ton où elle a été écrite.
    const key = exState.mode === 'movement' && exState.progression ? exState.progression.currentKey : (exState.keyChoice ?? 0);
    const chords = !item ? null : item.grid
      ? practiceExercise.previewGrid(item.grid.chords, item.grid.name)
      : practiceExercise.previewMovement(item.name, key);
    if (chords) startDemo(chords, { kind: 'preview', previewId: id }, item.style);
  }

  // Notes que la démo ajoute à l'accord affiché (basse, doublure), pour la carte.
  demoHooks.cardExtras = (exState) => {
    const prog = exState.mode === 'movement' ? exState.progression : null;
    if (!prog?.chords?.length) return null;
    const styleId = resolveDemoStyle(prog.movement?.style);
    const extras = demoCardHands(prog.chords, prog.stepIndex || 0, styleId, { passing: Boolean(prog.onPassing) });
    return extras ? { ...extras, styleId, styleLabel: DEMO_STYLES[styleId]?.label } : null;
  };
  demoHooks.onStep = (step) => {
    // [Claude] — 2026-09-25 — Exemple du Copilote : rien à suivre (plus de marques
    // au clavier, les touches s'allument en jaune).
    if (demoContext?.kind === 'copilot') return;
    // La carte d'exercice suit l'accord joué par la démo du mouvement.
    if (demoContext?.kind !== 'movement') return;
    demoHooks.playingPassing = null;
    practiceExercise.goToStep(step);
    render();
  };
  demoHooks.onPassing = (after) => {
    // L'accord de passage s'allume dans la liste et la carte le montre.
    if (demoContext?.kind !== 'movement') return;
    demoHooks.playingPassing = after;
    practiceExercise.goToPassing(after);
    render();
  };
  demoHooks.onEnd = () => {
    const context = demoContext;
    demoContext = null;
    previewId = null;
    demoHooks.playingPassing = null;
    if (context?.kind === 'copilot') {
      document.dispatchEvent(new CustomEvent('copilot-example-state', { detail: { id: context.id, playing: false } }));
      return;
    }
    if (context?.kind === 'movement' && practiceExercise.getState().mode === 'movement') {
      practiceExercise.goToStep(context.stepBefore, { passing: context.passingBefore });
      render();
    } else {
      refreshDemoButtons(practiceExercise.getState());
    }
    if (context?.kind === 'preview') renderLibrary();
  };

  // [Claude] — 2026-09-24 — Exemples du Copilote IA : même lecteur que les démos des
  // exercices (touches allumées, son de l'application ou sortie MIDI vers le VST).
  // L'onglet Copilote demande la lecture ; il est prévenu de la fin.
  document.addEventListener('copilot-play-example', async (e) => {
    const { id, example } = e.detail || {};
    if (!example?.events?.length) return;
    // Une démo en cours s'arrête d'abord proprement (son contexte est rendu).
    if (demoPlayer.isPlaying()) demoPlayer.stop();
    try {
      await resumeAudio();
    } catch (err) {
      console.warn('[Copilot] Audio indisponible', err);
    }
    demoPlayer.play({ events: example.events, beats: example.beats }, { tempo: example.tempo || 60 });
    demoContext = { kind: 'copilot', id };
    document.dispatchEvent(new CustomEvent('copilot-example-state', { detail: { id, playing: true } }));
  });
  document.addEventListener('copilot-stop-example', () => {
    if (demoContext?.kind === 'copilot') demoPlayer.stop();
  });

  function refreshDemoButtons(exState) {
    const btn = document.getElementById('exercise-demo-btn');
    if (!btn) return;
    btn.hidden = exState.mode !== 'movement' || !exState.progression;
    const styleRow = document.getElementById('exercise-demo-style-row');
    if (styleRow) styleRow.hidden = btn.hidden;
    // « Selon le mouvement » annonce le style qu'il donnera pour le mouvement affiché.
    const movementStyle = exState.progression?.movement?.style;
    const autoStyle = DEMO_STYLES[defaultDemoStyle(movementStyle)];
    const autoOption = document.querySelector('#exercise-demo-style option[value="auto"]');
    if (autoOption) autoOption.textContent = `Selon le mouvement · ${autoStyle.label}`;
    const style = DEMO_STYLES[resolveDemoStyle(movementStyle)];
    btn.title = `Démo ${style.label} (${style.tempo} à la noire) dans la tonalité en cours, avec les voicings de l'exercice`;
    const playing = demoContext?.kind === 'movement';
    btn.classList.toggle('is-playing', playing);
    btn.innerHTML = `${playing ? DEMO_STOP_ICON : DEMO_PLAY_ICON}<span>${playing ? 'Arrêter la démo' : 'Écouter le mouvement'}</span>`;
    btn.closest('.tr-exercise-progress')?.classList.toggle('is-demo-playing', playing);
  }

  document.getElementById('exercise-demo-btn')?.addEventListener('click', toggleMovementDemo);

  // Toute autre action de l'utilisateur dans la vue Exercices (réglage, clic
  // sur un accord, une tonalité, une technique…) arrête la démo d'abord.
  const exercisesView = document.getElementById('practice-view-exercices');
  const interruptDemo = (e) => {
    if (!demoPlayer.isPlaying() || e.target.closest('#exercise-demo-btn, [data-preview], #exercise-library')) return;
    if (e.type === 'change' || e.target.closest('button, select, input, [data-step], [data-key-index], [role="button"]')) demoPlayer.stop();
  };
  exercisesView?.addEventListener('click', interruptDemo, true);
  exercisesView?.addEventListener('change', interruptDemo, true);
  // Changer de vue ou d'onglet, ou fermer la bibliothèque pendant un aperçu, arrête aussi.
  document.addEventListener('app-switch-training-view', () => demoPlayer.stop());
  document.querySelectorAll('.tab-btn').forEach((tab) => tab.addEventListener('click', () => demoPlayer.stop()));
  if (els.exerciseLibrary && typeof MutationObserver !== 'undefined') {
    new MutationObserver(() => {
      if (els.exerciseLibrary.hidden && demoContext?.kind === 'preview') demoPlayer.stop();
    }).observe(els.exerciseLibrary, { attributes: true, attributeFilter: ['hidden'] });
  }

  // Menu des qualités : généré depuis la liste partagée avec le navigateur.
  if (els.exerciseTargetQuality) {
    els.exerciseTargetQuality.innerHTML = TARGET_QUALITY_GROUPS.map((group) => `
      <optgroup label="${group.label}">${group.qualities.map((q) =>
    `<option value="${q}">${q === '5' ? '5 (power chord)' : q}</option>`).join('')}
      </optgroup>`).join('');
  }

  // Navigateur « accords avec cette note au sommet » : filtre de famille et
  // clic sur un voicing (charge l'accord puis la suggestion correspondante).
  els.exerciseTopNoteBrowser?.addEventListener('click', (e) => {
    // Clic sur un accord : il est chargé sur la carte (premier voicing) ;
    // les flèches ‹ › de la carte parcourent ensuite ses voicings.
    const chordBtn = e.target.closest('[data-browse-root]');
    if (chordBtn) {
      practiceExercise.setTargetChoice(parseInt(chordBtn.dataset.browseRoot, 10), chordBtn.dataset.browseQuality);
      render();
    }
  });

  // Sélecteur d'accord cible (mode Accord cible uniquement).
  els.exerciseTargetRoot?.addEventListener('change', () => {
    const rootPc = parseInt(els.exerciseTargetRoot.value, 10);
    const symbol = els.exerciseTargetQuality.value;
    practiceExercise.setTargetChoice(rootPc, symbol);
    render();
  });

  els.exerciseTargetQuality?.addEventListener('change', () => {
    const rootPc = parseInt(els.exerciseTargetRoot.value, 10);
    const symbol = els.exerciseTargetQuality.value;
    practiceExercise.setTargetChoice(rootPc, symbol);
    render();
  });

  // Recherche de voicings par note du dessus (mode Accord cible).
  els.exerciseTopNote?.addEventListener('change', () => {
    const value = els.exerciseTopNote.value;
    practiceExercise.setTopNote(value === '' ? null : parseInt(value, 10));
    render();
  });

  els.exerciseTopNoteLevel?.addEventListener('change', () => {
    practiceExercise.setTopNoteLevel(els.exerciseTopNoteLevel.value);
    render();
  });

  // Filtres de la recherche par note du dessus (octave, technique, mains, taille, fondamentale).
  const NOTE_OPTIONS = ['C', 'C# / Db', 'D', 'D# / Eb', 'E', 'F', 'F# / Gb', 'G', 'G# / Ab', 'A', 'A# / Bb', 'B'];
  const MINOR_NAMES = ['Cm', 'C#m', 'Dm', 'Ebm', 'Em', 'Fm', 'F#m', 'Gm', 'G#m', 'Am', 'Bbm', 'Bm'];
  const fillNoteFilter = (name, allLabel, label) => {
    const sel = els.exerciseTopNoteFilters?.querySelector(`[data-topnote-filter="${name}"]`);
    if (!sel) return;
    sel.innerHTML = `<option value="all">${allLabel}</option>`
      + NOTE_OPTIONS.map((n, pc) => `<option value="${pc}">${label(n, pc)}</option>`).join('');
  };
  // Tonalité majeure et son relatif mineur naturel (même gamme).
  fillNoteFilter('key', 'Toutes tonalités', (n, pc) => `Tonalité ${n} (${MINOR_NAMES[(pc + 9) % 12]})`);
  fillNoteFilter('chordRoot', 'Toutes fondamentales', (n) => `Accords de ${n}`);
  const topNoteTechniqueFilter = els.exerciseTopNoteFilters?.querySelector('[data-topnote-filter="technique"]');
  if (topNoteTechniqueFilter) {
    topNoteTechniqueFilter.innerHTML = TOP_NOTE_FILTERS.technique
      .map((t) => `<option value="${t}">${t === 'all' ? 'Toutes techniques' : TECHNIQUE_LABELS[t] || t}</option>`)
      .join('');
  }
  els.exerciseTopNoteReset?.addEventListener('click', () => {
    practiceExercise.resetTopNoteFilters();
    render();
  });
  els.exerciseTopNoteFilters?.addEventListener('change', (e) => {
    const sel = e.target.closest('[data-topnote-filter]');
    if (!sel) return;
    practiceExercise.setTopNoteFilter(sel.dataset.topnoteFilter, sel.value);
    render();
  });

  els.exerciseRandomTargetBtn?.addEventListener('click', () => {
    practiceExercise.clearTargetChoice();
    render();
  });

  // Délégation d'événement pour le bouton "Écouter" et les étiquettes de
  // catégories de voicings recréées à chaque render.
  // Doublures : menu rendu dans la carte (recréé à chaque rendu), donc délégué.
  targetDiv?.addEventListener('change', (e) => {
    // [Claude] — 2026-09-24 — Voice leading : note du dessus de l'accord affiché.
    const top = e.target.closest('[data-exercise-top]');
    if (top) {
      const prog = practiceExercise.getState().progression;
      const step = prog?.stepIndex || 0;
      const passing = Boolean(prog?.onPassing);
      practiceExercise.setStepTopNote(step, top.value === '' ? null : Number(top.value), { passing });
      topSavedNotice = keepCardTopInPerso(step, passing);
      render();
      return;
    }
    // [Claude] — 2026-09-24 — Main gauche d'un style ajoutée au voicing (menu de la carte).
    const leftHand = e.target.closest('[data-exercise-left-hand]');
    if (leftHand) {
      practiceExercise.setLeftHandStyle(leftHand.value);
      render();
      return;
    }
    const sel = e.target.closest('[data-exercise-doubling]');
    if (!sel) return;
    practiceExercise.setDoubling(sel.value);
    render();
  });

  /** Clics sur la carte et sur les voicings de la colonne de droite. */
  function handleVoicingClick(e) {
    if (e.target.closest('[data-action="toggle-favorite"]')) {
      exerciseFavorites = toggleFavorite(exerciseFavorites, favoriteFromTarget(practiceExercise.getState().target));
      saveFavorites(window.localStorage, exerciseFavorites);
      render();
      return;
    }
    const btn = e.target.closest('[data-action="listen-exercise"]');
    if (btn) {
      const exState = practiceExercise.getState();
      if (exState.target?.voicing) {
        // En Mouvement, on entend aussi ce que la démo ajoute (basse, doublure), comme affiché.
        const extras = demoHooks.cardExtras?.(exState);
        playExerciseVoicing(extras ? { ...exState.target.voicing, leftHand: extras.lh, rightHand: extras.rh } : exState.target.voicing);
      }
      return;
    }
    const suggestion = e.target.closest('[data-topnote-index]');
    if (suggestion) {
      practiceExercise.selectTopNoteSuggestion(parseInt(suggestion.dataset.topnoteIndex, 10));
      render();
      return;
    }
    const arrow = e.target.closest('[data-variant-delta]');
    if (arrow) {
      const delta = parseInt(arrow.dataset.variantDelta, 10);
      practiceExercise.setVariant(delta);
      render();
      return;
    }
    const tag = e.target.closest('.exercise-category-tag[data-technique]');
    if (tag && !tag.classList.contains('disabled')) {
      const technique = tag.dataset.technique;
      practiceExercise.setTechnique(technique);
      render();
    }
  }
  targetDiv?.addEventListener('click', handleVoicingClick);
  els.exerciseVoicingChoices?.addEventListener('click', handleVoicingClick);

  // Doublures choisies dans la fenêtre Filtres.
  els.exerciseFiltersDialog?.addEventListener('change', (e) => {
    const sel = e.target.closest('[data-exercise-doubling]');
    if (!sel) return;
    practiceExercise.setDoubling(sel.value);
    render();
  });

  // Premier exercice au démarrage
  practiceExercise.next();
  render();
}

let feedbackHideTimer = null;

function checkPracticeExercise(notes) {
  if (!practiceExercise) return;
  const result = practiceExercise.check(notes);
  if (result.expectedName) {
    // Un accord réussi efface ses essais ; un essai pas encore retenu est gardé (dix au plus).
    if (result.success) {
      for (let i = exerciseAttempts.length - 1; i >= 0; i -= 1) if (exerciseAttempts[i].expected === result.expectedName) exerciseAttempts.splice(i, 1);
    } else {
      exerciseAttempts.push({ expected: result.expectedName, notes: [...notes], heard: result.heard || null, at: Date.now() });
      if (exerciseAttempts.length > 10) exerciseAttempts.shift();
    }
  }
  const feedbackDiv = document.getElementById('exercise-feedback');
  if (feedbackDiv) {
    feedbackDiv.textContent = result.message;
    // [Claude] — 2026-09-25 — Pas encore juste : une suggestion (bulle neutre), pas une erreur en rouge.
    feedbackDiv.className = `exercise-feedback ${result.success ? 'success' : 'hint'}`;
    // Bulle flottante : elle s'efface seule après quelques secondes.
    clearTimeout(feedbackHideTimer);
    feedbackHideTimer = setTimeout(() => { feedbackDiv.textContent = ''; }, 5000);
  }
  // [Astra round 3] — mise à jour aussi en cas d'échec : le compteur d'essais
  // du panneau de droite reflète alors la tentative qui vient d'avoir lieu.
  // On repasse par le render complet pour que le bouton « Accord précédent »
  // suive la nouvelle cible.
  if (renderPracticeExercise) {
    renderPracticeExercise();
  } else {
    const exState = practiceExercise.getState();
    if (result.success) {
      const categories = getAvailableTechniques(exState.target.name);
      const difficulty = difficultyOfVoicing(exState.target);
      document.getElementById('exercise-target').innerHTML = renderExerciseTarget(exState.target, { categories, difficulty, variant: exState.variant, selectedTechnique: exState.technique });
    }
    updateExerciseProgressUI(exState);
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
  safeInit('initKeyboardReview', () => {
    // [Claude] — 2026-09-25 — Messages courts de l'application (avis sans clé d'IA,
    // « rien à écouter »…) dans la ligne d'état de la fenêtre.
    document.addEventListener('app-status', (e) => setStatus(e.detail?.text || ''));
    // « Qu'en penses-tu ? » depuis la barre du clavier (tous les onglets) : le
    // Copilote analyse le dernier passage joué.
    document.getElementById('keyboard-review-btn')?.addEventListener('click', () => {
      // La vue d'origine : depuis Exercices, l'avis compare le jeu à l'exercice en cours.
      document.dispatchEvent(new CustomEvent('copilot-review-take', { detail: { question: '', fromView: els.practiceLayout?.dataset.trainingView || null } }));
    });
  });
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
  safeInit('initMidiOutput', () => initMidiOutput());

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
    if (Number.isFinite(midi)) lightKey(midi, true);
  });
  document.addEventListener('copilot-note-off', (e) => {
    const midi = Number(e.detail?.midi);
    if (Number.isFinite(midi)) unlightKey(midi);
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
          unlightKey(n);
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
