import { generateKeyboard, keyboardLayout } from './ui/keyboard-svg.js';
import { initKeyboardWheels, setPitchWheel, setModWheel } from './ui/keyboard-wheels.js';
import { readSpelling, writeSpelling, DEFAULT_SPELLING } from './chord-engine/spelling-preference.js';
import { updateDisplay, clearDisplay } from './ui/display.js';
// [Claude] — 2026-10-02 — Temps réel : « Lecture en direct » (roue, lectures).
import { initLiveReading } from './ui/live-reading.js';
// [Claude] — 2026-10-02 — Temps réel : la portée (3e notation), clé au choix non mémorisée.
import { initLiveStaff } from './ui/live-staff.js';
import { detectChord } from './chord-engine/index.js';
import { noteName, formatPc } from './chord-engine/naming.js';

import {
  initVirtualKeyboard,
  playVirtualNote,
  releaseVirtualNote,
  setPcKeyboardToMidiEnabled,
  isPcKeyboardToMidiEnabled,
} from './virtual-keyboard.js';
import {
  setSustain, ensurePianoSamples, resumeAudio, setPitchBend, setModulation, getAudioContext,
  getAudioLatency,
} from './audio/simple-synth.js';
import {
  createDrumLoop, drumKitFor, drumTempoFor, drumStyles, setDrumManifest,
} from './audio/drum-loop.js';
import { initGlobalMetronome } from './ui/global-metronome.js';
import {bindPlaybackDrums} from './audio/playback-drums.js';

import { initWebMidi, getWebMidiInputs, openWebMidiInput } from './midi-fallback.js';
// [Claude] — 2026-10-02 — Qui est un vrai clavier (jamais notre propre port virtuel).
import { pickPreferredInput } from './midi-ports.js';
import { createChordHistory } from './chord-history.js';
import { initCopilotTab } from './pedagogie/copilot-tab.js';
import { createPlayingHighlights } from './ui/playing-highlights.js';

import { createNoteGrouper, isGraceNote, chordNotesWithHeld } from './note-grouper.js';
import { initAnalyzerTab } from './ui/analyzer-tab.js';
import { mountChromaStages } from './ui/components/loader-chroma.js';
import { attachListSearch } from './ui/components/list-search.js';
import { initLibraryModal } from './ui/components/library-modal.js';
import { appConfirm } from './ui/components/app-dialog.js';
import { initAccentTheme, savedAccent } from './ui/accent-theme.js';
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
import { initVeloursAmbient } from './ui/refonte/velours-ambient.js';
import {
  getAIConfig,
  saveAIConfig,
  testAIConfig,
  loadSecureAIConfig,
  PRESETS,
  EXTERNAL_PROVIDER_LINKS,
  listSavedKeys,
  saveNamedKey,
  activateSavedKey,
  activateSavedKeyModel,
  addModelToSavedKey,
  removeModelFromSavedKey,
  deleteSavedKey,
} from './ai/openai-config.js';
import {
  getMonthlyUsage,
  getMonthlyUsageHistory,
} from './ai/usage-cap.js';
import {
  createPracticeExercise,
  renderExerciseTarget,
  difficultyOfVoicing,
  getAvailableTechniques,
  listMovementNames,
  TARGET_QUALITY_GROUPS,
  findChordsByTopNote,
  renderTopNoteBrowser,
  renderVoicingChoices,
  renderChordExplorerVoicings,
  renderDoublingSelect,
  TOP_NOTE_FILTERS,
  TECHNIQUE_LABELS,
  topNoteChoices,
  spellChordTone,
  movementChordNames,
} from './practice-exercise.js';
import { loadGrids, saveGrids, upsertGrid, removeGrid, defaultGridName } from './practice-grids.js';
import movementsLibrary, { archivedMovements, EXERCISE_KIND_LABELS } from './exercise-catalogue.js';
import { keyLabel } from './practice-key-spelling.js';
import { miniKeyboardForNotes } from './ui/mini-keyboard.js';
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
import { buildDemo, DEMO_STYLES, DEMO_STYLE_IDS, DEMO_VARIATIONS, defaultDemoStyle, demoCardHands } from './practice-demo.js';
import { createDemoPlayer } from './exercise-demo-player.js';
import {
  listMidiOutputs, openMidiOutput, savedMidiOutputName, isMidiOutputActive, currentMidiOutput, sendMidi,
} from './midi-output.js';
import { applyTabVisibility } from './ui/tab-visibility.js';
import { initAstraShell } from './ui/refonte/astra-shell.js';
import { initOnboarding, notifyOnboarding } from './ui/onboarding.js';
import { lightKeyElement, unlightKeyElement, resolveAppKeyColor } from './ui/key-colors.js';
import { pickHandColors } from './ui/hand-colors.js';
import { liveTake } from './recorder/live-take.js';
import { registerCopilotContext } from './pedagogie/copilot-context.js';
import { exerciseContext } from './pedagogie/exercise-context.js';
import { shiftTransposedState } from './transpose-shift.js';
import {
  publishLiveNoteOn,
  publishLiveNoteOff,
  publishLiveSustain,
  hasLiveMidiSubscribers,
} from './melody/live-midi-bus.js';

const state = {
  activeNotes: new Map(), // midi -> velocity
  sustainedNotes: new Set(), // midi sustained while pedal down
  // [Claude] — 2026-10-02 — Appui et relevé de chaque touche (note transposée ->
  // { note, onTime, keyOffTime }) : sous la pédale, une grace note (le Ré frotté vers
  // le Mi) ne doit pas rester comptée dans l'accord (voir dropGraceNotes).
  keyTimes: new Map(),
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
  spelling: DEFAULT_SPELLING,
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
      const result = detectChord(toAnalyze, { allowRootless: false });
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
  spelling: document.getElementById('spelling-select'),
  chordName: document.getElementById('chord-name'),
  chordDetail: document.getElementById('chord-detail'),
  chordMeta: document.getElementById('chord-meta'),
  voicingLabel: document.getElementById('voicing-label'),
  aliasLabel: document.getElementById('alias-label'),
  chordDisplay: document.getElementById('chord-display'),
  notesDisplay: document.getElementById('notes-display'),
  pedagogy: document.getElementById('pedagogy-content'),
  colorNote: document.getElementById('color-you'), // [Claude] — 2026-10-13 — pastille « Toi » de la légende du clavier
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
  practiceLayout: document.getElementById('practice-tab'),
  exerciseCollapsedProgress: document.getElementById('exercise-collapsed-progress'),
  practiceMidiStatus: document.getElementById('practice-midi-status'),
  practiceMidiStatusDot: document.getElementById('practice-midi-status-dot'),
  practiceMidiStatusText: document.getElementById('practice-midi-status-text'),
  exerciseCurrentKey: document.getElementById('exercise-current-key'),
  exerciseKeyStrip: document.getElementById('exercise-key-strip'),
  exerciseChordsEyebrow: document.getElementById('exercise-chords-eyebrow'),
  exerciseArenaEyebrow: document.getElementById('exercise-arena-eyebrow'),
  exerciseGridDialog: document.getElementById('exercise-grid-dialog'),
  exerciseGridBtn: document.getElementById('exercise-grid-btn'),
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
  // [Claude] — 2026-11-05 — Remplace #exercise-chord-head (la bande du haut) :
  // panneau de gauche de l'explorateur Accord cible, porté du code du candidat.
  chordExplorerLeft: document.getElementById('chord-explorer-left'),
  chordExplorerSummary: document.getElementById('chord-explorer-summary'),
  chordExplorerFavoritesPreview: document.getElementById('chord-explorer-favorites-preview'),
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

  transposeInput: document.getElementById('transpose'),
  toleranceInput: document.getElementById('tolerance'),
  audioLatencyValue: document.getElementById('audio-latency-value'),
  audioLatencyRefresh: document.getElementById('audio-latency-refresh'),
  audioLatencyNote: document.getElementById('audio-latency-note'),
  silentMode: document.getElementById('silent-mode'),
  pcKeyboardMidi: document.getElementById('pc-keyboard-midi'),
  midiDiagnosticPanel: document.getElementById('midi-diagnostic-panel'),
  midiDiagnosticToggle: document.getElementById('midi-diagnostic-toggle'),
  midiDiagnosticContent: document.getElementById('midi-diagnostic-content'),
  themeToggle: document.getElementById('theme-toggle'),

  // [Claude] — 2026-07-04 — Paramètres API IA
  // [Claude] — 2026-10-13 — Le bouton de clé API a quitté l'en-tête : il s'ouvre depuis Réglages.
  // [Claude] — 2026-10-19 — Plus de fenêtre séparée (#ai-settings-modal, #ai-preset, #ai-cancel-btn) :
  // app-settings-ai-btn déplie maintenant #ai-key-panel sur la même page (voir initAISettings).
  aiSettingsToggle: document.getElementById('app-settings-ai-btn'),
  aiKeyPanel: document.getElementById('ai-key-panel'),
  aiBaseUrl: document.getElementById('ai-base-url'),
  aiApiKey: document.getElementById('ai-api-key'),
  aiModel: document.getElementById('ai-model'),
  aiModelSelect: document.getElementById('ai-model-select'),
  aiTestBtn: document.getElementById('ai-test-btn'),
  aiSaveBtn: document.getElementById('ai-save-btn'),
  aiTestResult: document.getElementById('ai-test-result'),
  aiUsage: document.getElementById('ai-usage'),
  aiUsageHistoryToggle: document.getElementById('ai-usage-history-toggle'),
  aiUsageChart: document.getElementById('ai-usage-chart'),
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
  demoHooks.onVisual?.();
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
    clearDisplay(els, state.notation === 'latin');
    state.currentChord = null;
    return;
  }

  const result = detectChord(notes, { allowRootless: false });
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

// [Claude] — 2026-09-25 — Le Copilote rejoue une session à la hauteur de sa
// relecture (touches brutes + transposition en cours) : il lit la transposition ici.
registerCopilotContext('keyboard', () => ({ transpose: state.transpose }));

function isPlayableMidi(note) {
  return Number.isFinite(note) && Number.isInteger(note) && note >= 0 && note <= 127;
}

// [Claude] — 2026-10-02 — Grace notes sous la pédale : la touche est relevée, la note
// sonne encore (le synthé la garde), mais elle sort de l'accord affiché. Même seuil que
// le regroupement temporel (isGraceNote, src/note-grouper.js). Sans pédale, la note
// relâchée quitte déjà activeNotes. Retourne true si une note a été retirée.
function dropGraceNotes() {
  let dropped = false;
  for (const midi of [...state.sustainedNotes]) {
    if (state.activeNotes.has(midi)) continue;
    if (!isGraceNote(state.keyTimes.get(midi), state.keyTimes.values())) continue;
    state.sustainedNotes.delete(midi);
    state.playbackNotes.delete(midi);
    state.keyTimes.delete(midi);
    unlightKey(midi);
    dropped = true;
  }
  return dropped;
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
  state.keyTimes.set(transposed, { note: transposed, onTime: performance.now(), keyOffTime: null });
  if (state.sustain) dropGraceNotes();
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
    // [Claude] — 2026-09-25 — Le jeu pour « Qu'en penses-tu ? » (gardé seulement
    // pendant l'écoute, entre ses deux clics) : la note entendue (transposition
    // comprise), jamais une démo ni une relecture.
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
    const times = state.keyTimes.get(transposed);
    if (times) times.keyOffTime = performance.now();
    noteGrouper?.noteOff(transposed, { sustained: true });
    if (hasLiveMidiSubscribers()) publishLiveNoteOff(note, 0);
    if (dropGraceNotes()) scheduleRefreshChord();
    return;
  }
  state.activeNotes.delete(transposed);
  state.keyTimes.delete(transposed);
  state.playbackNotes.delete(transposed);
  unlightKey(transposed);
  noteGrouper?.noteOff(transposed, { sustained: false });
  if (hasLiveMidiSubscribers()) publishLiveNoteOff(note, 0);
  scheduleRefreshChord();
  // [Claude] — 2026-10-04 — L'exemple du Copilote en pause garde ses touches allumées : une
  // touche jaune que le pianiste vient de jouer se rallume en jaune quand il la relâche.
  const shown = state.isPlayback ? null : demoPlayer.shownVelocity(transposed);
  if (shown !== null) feedDemoEvent('show', transposed, shown);
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
        state.keyTimes.delete(note);
      }
    }
    state.sustainedNotes.clear();
    scheduleRefreshChord();
  }
}

function handlePitchWheel(value) {
  state.currentPitch = value;
  setPitchWheel(value);
  setPitchBend(value);
  if (!state.isPlayback) feedRecorderPitchWheel(value);
}

function handleModWheel(value) {
  state.currentMod = value;
  setModWheel(value);
  setModulation(value);
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
  // [Claude] — 2026-10-04 — « show » / « hide » : la touche s'allume ou s'éteint sans le son
  // ni la sortie MIDI (l'exemple du Copilote en pause, ou le curseur qu'on tire).
  const display = type === 'show' || type === 'hide';
  const toOutput = !display && isMidiOutputActive();
  if (toOutput) {
    if (type === 'noteOn') sendMidi([0x90, a, Math.max(1, Math.min(127, Math.round((b ?? 0.8) * 127)))]);
    else if (type === 'noteOff') sendMidi([0x80, a, 0]);
    else if (type === 'sustain') sendMidi([0xb0, 64, a ? 127 : 0]);
  }
  state.isPlayback = true;
  try {
    if (type === 'noteOn' || type === 'show') handleNoteOn(a - state.transpose, b, true, !toOutput && !display);
    else if (type === 'noteOff' || type === 'hide') handleNoteOff(a - state.transpose, true, !toOutput && !display);
    else if (type === 'sustain') handleSustain(Boolean(a));
  } finally {
    state.isPlayback = false;
  }
  demoHooks.onVisual?.();
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
const demoHooks = { onStep: null, onPassing: null, onEnd: null, onVisual: null, cardExtras: null, playingPassing: null };
const demoPlayer = createDemoPlayer({
  send: feedDemoEvent,
  onStep: (step) => demoHooks.onStep?.(step),
  onPassing: (after) => demoHooks.onPassing?.(after),
  // La batterie s'arrête ici et non en emballant `demoHooks.onEnd` : ce champ
  // est réassigné plus tard par initPracticeExercise, qui écraserait l'emballage.
  onEnd: (reason) => { demoRhythm.end(); demoHooks.onEnd?.(reason); },
});

// [Claude] — 2026-11-04 — Boucle de batterie des démonstrations. Elle est
// branchée directement sur la sortie (pas sur le bus du piano) : un métronome
// doit rester net, sans la réverbération du piano.
//
// On EMBALLE les commandes du lecteur plutôt que de guetter chaque appel :
// `demoPlayer.stop()` est appelé depuis une douzaine d'endroits, et une
// batterie qui continue après la fin serait pire que pas de batterie du tout.

/**
 * Lecture d'une boucle depuis `assets/drum-loops`, par l'IPC Electron — comme
 * les échantillons de piano, et pour la même raison : la CSP de l'application
 * interdit de lire un fichier local par fetch. Hors Electron (navigateur
 * ordinaire), il n'y a pas de batterie du tout, et c'est voulu : mieux vaut
 * rien qu'une percussion synthétisée au jugé.
 */
let drumLoopsDir = null;
async function readDrumLoopFile(name) {
  // [Claude] — 2026-11-04 — DEUX chemins, et c'est voulu.
  //
  // Les boucles vivent dans `src/public/drum-loops`, donc Vite les sert en
  // développement et les recopie dans `dist` au build. On tente donc d'abord
  // un fetch sur l'origine de la page : la CSP l'autorise (`connect-src
  // 'self'`), ça marche dans Electron en développement ET dans un simple
  // navigateur — ce dernier point compte, c'est le seul endroit où je peux
  // VÉRIFIER que le son sort. La batterie est restée muette deux fois de
  // suite faute de pouvoir l'essayer.
  //
  // En production, la page est chargée en file:// où fetch est refusé : l'IPC
  // Electron prend alors le relais, comme pour les échantillons de piano.
  try {
    const res = await fetch(new URL(`drum-loops/${name}`, document.baseURI).href);
    if (res.ok) return new Uint8Array(await res.arrayBuffer());
  } catch (e) { /* file://, ou dossier absent : on passe à l'IPC */ }

  const files = window.electronAPI?.files;
  if (!files?.readBinary) throw new Error('fichier introuvable et pas d\'accès disque');
  if (!window.electronAPI?.assets?.drumLoopsDir) {
    // Cas vécu le 04/11/2026 : l'IPC a été ajouté pendant qu'Electron tournait.
    // Le processus principal ne se recharge pas à chaud — d'où un silence total.
    throw new Error('IPC drumLoopsDir absent — relancer Electron (npm run dev)');
  }
  if (!drumLoopsDir) {
    drumLoopsDir = (await window.electronAPI.assets.drumLoopsDir()) || '';
  }
  if (!drumLoopsDir) throw new Error('dossier des boucles introuvable');
  return files.readBinary(`${drumLoopsDir}/${name}`);
}

const drumLoop = createDrumLoop({ getContext: getAudioContext, readFile: readDrumLoopFile });

/**
 * [Claude] — 2026-11-04 — Le manifeste des styles, lu sur le disque pour que
 * Narcisse puisse déposer ses propres boucles et décider lui-même de ce que
 * chaque style joue. S'il manque, la table en dur du module prend le relais.
 */
let globalMetronome = null;
(async () => {
  try {
    const bytes = await readDrumLoopFile('kits.json');
    if (!bytes) return;
    const text = new TextDecoder().decode(bytes);
    if (setDrumManifest(JSON.parse(text))) globalMetronome?.refresh();
  } catch (e) {
    console.warn('[Batterie] manifeste kits.json illisible, styles par défaut —', e?.message || e);
  }
})();
// La batterie se lance uniquement après activation explicite dans cette séance.
let drumsEnabled = false;
const demoRhythm=bindPlaybackDrums({player:demoPlayer,drumLoop,
  metronome:()=>globalMetronome,enabled:()=>drumsEnabled,onChange:()=>refreshDrumsDiagnostic()});
function syncDemoDrums() {demoRhythm.sync();}

/**
 * [Claude] — 2026-11-04 — Dire POURQUOI la batterie ne sonne pas. Elle est
 * restée muette chez Narcisse sans qu'aucune trace n'existe nulle part : un
 * échec silencieux coûte un aller-retour complet. Le bouton porte désormais la
 * raison, et la console la répète une fois.
 */
let lastDrumsWarning = null;
function refreshDrumsDiagnostic() {
  const btn = document.getElementById('exercise-demo-drums');
  const why = drumLoop.lastError();
  if (why && why !== lastDrumsWarning) {
    lastDrumsWarning = why;
    console.warn(`[Batterie] silencieuse — ${why}`);
  }
  if (!why) lastDrumsWarning = null;
  if (!btn) return;
  btn.classList.toggle('is-silent', Boolean(why) && drumsEnabled);
  if (why && drumsEnabled) btn.title = `Batterie sans son — ${why}`;
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
  // [Claude] — 2026-10-02 — Plus de « MIDI connecté : … » au-dessus de la roue du
  // Temps réel (Narcisse) : l'état ne se lit plus que dans la sous-navigation.
  // [Refonte 02/09] — Même état, affiché aussi dans la sous-navigation
  // d'Entraînement (point + texte, maquettes 15/16) — pas une détection
  // supplémentaire, juste une seconde lecture de currentMidiName.
  if (els.practiceMidiStatusDot) {
    els.practiceMidiStatusDot.classList.toggle('connected', Boolean(currentMidiName));
  }
  if (midiReconnecting) return;
  if (els.practiceMidiStatusText) {
    els.practiceMidiStatusText.textContent = currentMidiName
      ? `Clavier MIDI connecté`
      : 'Clavier MIDI non détecté';
  }
  // [Claude] — 2026-10-02 — La pastille reconnecte d'un clic (voir reconnectMidi).
  if (els.practiceMidiStatus) {
    els.practiceMidiStatus.title = currentMidiName
      ? `${currentMidiName} — cliquer pour reconnecter le clavier`
      : 'Aucun clavier MIDI — cliquer pour chercher à nouveau';
  }
}

// [Claude] — 2026-10-02 — Le choix du clavier se fait dans electron/main.js (un seul
// décideur, src/midi-ports.js) : la fenêtre affiche l'état réel et n'ouvre plus de
// port d'elle-même. Avant, elle rouvrait en parallèle du scan du main, avec une
// autre heuristique qui pouvait prendre notre port virtuel « Piano Jazz Chords »
// pour le clavier (son nom contient « piano »).
let midiReconnecting = false;

/** Lit l'état réel de l'entrée dans le main et l'affiche. */
async function syncMidiStatus() {
  let status = null;
  try {
    status = await window.electronAPI?.midi?.getStatus?.();
  } catch (err) {
    console.warn('[MIDI] état illisible :', err?.message || err);
  }
  if (!status) return null;
  currentMidiName = status.connected ? status.name : null;
  if (status.connected) {
    els.midiStatus.textContent = 'Connecté';
    if (status.portId !== null && status.portId !== undefined) els.midiSelect.value = String(status.portId);
  } else {
    els.midiStatus.textContent = els.midiSelect.options.length && !els.midiSelect.options[0].disabled ? 'Non connecté' : 'Aucun périphérique';
  }
  updatePracticeMidiHint();
  return status;
}

/**
 * Connexion perdue ou reprise : les touches tenues à cet instant n'enverront jamais
 * leur relâchement. On les relâche ici, sinon l'accord affiché et les touches
 * allumées restaient figés.
 */
function releaseStuckMidiNotes() {
  for (const transposed of [...state.activeNotes.keys()]) {
    if (state.playbackNotes.has(transposed)) continue;
    handleNoteOff(transposed - state.transpose, false, true);
  }
  if (state.sustain) handleSustain(false);
}

/**
 * « Reconnecter » (pastille de la sous-navigation, bouton du pied de page) :
 * l'équivalent logiciel d'un débranchement / rebranchement.
 */
async function reconnectMidi() {
  if (midiReconnecting || !window.electronAPI?.midi?.refreshInputs) return;
  midiReconnecting = true;
  els.practiceMidiStatus?.classList.add('is-busy');
  if (els.practiceMidiStatusText) els.practiceMidiStatusText.textContent = 'Reconnexion…';
  try {
    const inputs = await window.electronAPI.midi.refreshInputs();
    populateMidiSelect(inputs || [], async (portId) => {
      await tryOpenMidi(portId, inputs || []);
    });
    releaseStuckMidiNotes();
  } catch (err) {
    console.warn('[MIDI] reconnexion impossible :', err?.message || err);
  } finally {
    midiReconnecting = false;
    els.practiceMidiStatus?.classList.remove('is-busy');
  }
  await syncMidiStatus();
  setStatus(currentMidiName ? `MIDI reconnecté : ${currentMidiName}` : 'Aucun clavier MIDI trouvé');
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
  let result = null;
  try {
    result = await window.electronAPI.midi.openInput(portId);
  } catch (err) {
    result = { success: false, error: err?.message || String(err) };
  }
  if (result?.success) {
    currentMidiName = result.name || name;
    updatePracticeMidiHint();
    els.midiStatus.textContent = 'Connecté';
    els.midiSelect.value = String(result.portId ?? portId);
    setStatus(`MIDI connecté : ${currentMidiName}`);
  } else {
    console.error('[MIDI] openInput failed:', result?.error || result);
    setStatus(`Échec connexion MIDI : ${result?.error || 'inconnu'}`);
    await syncMidiStatus();
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
    // [Claude] — 2026-10-02 — Connexion (re)prise : rien n'est tenu à cet instant.
    releaseStuckMidiNotes();
    setStatus(event.reason === 'reopen' || event.reason === 'resume' || event.reason === 'reconnect'
      ? `MIDI reconnecté : ${event.name}`
      : `MIDI connecté : ${event.name}`);
    logMidiEvent({ type: 'connected', data: event, time: Date.now() });
  });

  window.electronAPI.midi.onPortLost?.((event) => {
    currentMidiName = null;
    updatePracticeMidiHint();
    releaseStuckMidiNotes();
    logMidiEvent({ type: 'port-lost', data: event, time: Date.now() });
    els.midiStatus.textContent = 'Périphérique perdu';
    setStatus('Périphérique MIDI débranché');
  });

  // [Claude] — 2026-10-02 — Liste changée : on la montre, et c'est tout. Le main a
  // déjà décidé (et prévenu par midi-device-connected / midi-port-lost) ; ouvrir un
  // port d'ici refaisait une connexion concurrente de la sienne.
  window.electronAPI.midi.onDevicesChanged?.((inputs) => {
    logMidiEvent({ type: 'scan', data: { count: inputs.length }, time: Date.now() });
    inputs.forEach((input) => logMidiEvent({ type: 'port', data: { id: input.id, name: input.name }, time: Date.now() }));
    populateMidiSelect(inputs, async (portId) => {
      await tryOpenMidi(portId, inputs);
    });
    syncMidiStatus();
  });

  // Choix à la main : populateMidiSelect() pose déjà `onchange` sur le menu (un
  // second écouteur `change` ouvrait le port deux fois).
  els.midiRefresh?.addEventListener('click', () => reconnectMidi());
  // [Claude] — 2026-10-02 — La pastille « Clavier MIDI connecté » de la
  // sous-navigation reconnecte d'un clic, sans débrancher le synthé.
  els.practiceMidiStatus?.addEventListener('click', () => reconnectMidi());

  let inputs = [];
  try {
    inputs = await window.electronAPI.midi.getInputs();
  } catch (err) {
    console.warn('[MIDI] liste des ports illisible :', err?.message || err);
  }
  logMidiEvent({ type: 'scan', data: { count: inputs.length }, time: Date.now() });
  inputs.forEach((input) => logMidiEvent({ type: 'port', data: { id: input.id, name: input.name }, time: Date.now() }));

  populateMidiSelect(inputs, async (portId) => {
    await tryOpenMidi(portId, inputs);
  });
  // Le main s'est déjà connecté au démarrage : on affiche son état.
  await syncMidiStatus();
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

  const preferred = pickPreferredInput(inputs);
  if (preferred) {
    els.midiSelect.value = preferred.id;
    openWebMidiInput(preferred.id, callbacks);
    els.midiStatus.textContent = 'Connecté (Web MIDI)';
    currentMidiName = preferred.name;
    updatePracticeMidiHint();
    setStatus(`MIDI connecté : ${preferred.name}`);
  }
}

// [Claude] — 2026-09-25 — La pastille « Toi » de la légende du clavier suit la
// couleur des notes réglée dans le pied de page (bleue par défaut).
function applyYouColor() {
  document.documentElement.style.setProperty('--kb-you', state.colorNote);
}

// [Claude] — 2026-10-13 — Les deux couleurs des touches se règlent d'un clic sur leur pastille (légende
// « Toi / L'app » sous le clavier) ; elles sont gardées d'une ouverture à l'autre.
const KEY_COLORS_STORAGE = 'pjc.keyColors';
function lighten(hex, amount = 0.45) {
  const n = parseInt(hex.slice(1), 16);
  const mix = (c) => Math.round(c + (255 - c) * amount);
  return `#${[(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => mix(c).toString(16).padStart(2, '0')).join('')}`;
}
function applyAppColor(hex) {
  const style = document.documentElement.style;
  style.setProperty('--kb-app', hex);
  style.setProperty('--kb-app-light', lighten(hex));
}
// [Claude] — 2026-10-13 — « Ce que joue l'application » suit la couleur de l'application (rose, vert…),
// sauf si le pianiste a réglé cette couleur lui-même (pastille « L'app », gardée dans pjc.keyColors) :
// son choix gagne. Le bouton de Réglages › Apparence rend la main à la couleur de l'application.
// [Claude] — 2026-10-13 — Couleurs des mains (Exercices) : distinctes de la couleur de l'application.
function refreshHandColors() {
  const { lh, rh } = pickHandColors(savedAccent());
  document.documentElement.style.setProperty('--hand-lh', lh);
  document.documentElement.style.setProperty('--hand-rh', rh);
}

function refreshAppKeyColor() {
  refreshHandColors();
  const { color, source } = resolveAppKeyColor({ custom: readKeyColors().app, accent: savedAccent() });
  applyAppColor(color);
  const picker = document.getElementById('color-app');
  if (picker) picker.value = color;
  // [Claude] — 2026-10-18 — L'indication grisée sous « Ce que joue l'application » est retirée
  // (Narcisse : supprimer les indications grisées). Seul le bouton de réinitialisation reste.
  const reset = document.getElementById('app-key-color-reset');
  if (reset) reset.hidden = source !== 'custom';
  const field = document.getElementById('settings-app-keys');
  if (field) field.hidden = source !== 'custom';
}
function readKeyColors() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY_COLORS_STORAGE) || '{}');
    const ok = (v) => (/^#[0-9a-f]{6}$/i.test(v) ? v : null);
    return { you: ok(saved.you), app: ok(saved.app) };
  } catch { return { you: null, app: null }; }
}
function saveKeyColors(patch) {
  try { localStorage.setItem(KEY_COLORS_STORAGE, JSON.stringify({ ...readKeyColors(), ...patch })); } catch { /* idem */ }
}

function initSettings() {
  els.noteStart.value = state.noteStart;
  els.noteEnd.value = state.noteEnd;
  els.notation.value = state.notation || 'english';
  // Orthographe des fondamentales noires : gardée d'une séance à l'autre.
  state.spelling = readSpelling();
  if (els.spelling) els.spelling.value = state.spelling;
  const savedKeys = readKeyColors();
  if (savedKeys.you) state.colorNote = savedKeys.you;
  els.colorNote.value = state.colorNote;
  applyYouColor();
  const appPicker = document.getElementById('color-app');
  refreshAppKeyColor();
  appPicker?.addEventListener('input', () => { saveKeyColors({ app: appPicker.value }); refreshAppKeyColor(); });
  document.getElementById('app-key-color-reset')?.addEventListener('click', () => { saveKeyColors({ app: null }); refreshAppKeyColor(); });
  // Changer la couleur de l'application (Réglages › Apparence) : les touches de l'application suivent.
  window.addEventListener('app-theme-changed', refreshAppKeyColor);
  els.transposeInput.value = state.transpose;
  // [Claude] — 2026-10-13 — Silencieux DÉCOCHÉ à l'ouverture : Narcisse avait demandé l'inverse le
  // 24/09 (« le clavier joué ne sonne pas par défaut ») et a changé d'avis : le clavier MIDI
  // virtuel sonne par défaut. « Écouter » de l'Exercice n'est pas concerné (il appelle
  // directement playVirtualNote).
  state.silentMode = false;
  els.silentMode.checked = false;
  state.pcKeyboardToMidi = true;
  if (els.pcKeyboardMidi) els.pcKeyboardMidi.checked = true;

  const update = () => {
    const previousTranspose = state.transpose;
    state.noteStart = els.noteStart.value || 'C0';
    state.noteEnd = els.noteEnd.value || 'C9';
    state.notation = els.notation.value || 'english';
    if (els.spelling) state.spelling = writeSpelling(els.spelling.value);
    state.transpose = Number(els.transposeInput.value) || 0;
    state.silentMode = els.silentMode.checked;
    state.pcKeyboardToMidi = els.pcKeyboardMidi ? els.pcKeyboardMidi.checked : true;
    setPcKeyboardToMidiEnabled(state.pcKeyboardToMidi);
    state.colorNote = els.colorNote.value;
    saveKeyColors({ you: state.colorNote });
    applyYouColor();

    // [Claude] — 2026-07-03 — Retransposer les notes actives quand le réglage de transposition change
    const transposeDelta = state.transpose - previousTranspose;
    if (transposeDelta !== 0) shiftTransposedState(state, transposeDelta);

    // [Claude] — 2026-07-03 — Mise à jour dynamique de la tolérance de groupement
    const toleranceMs = Number(els.toleranceInput?.value) || 200;
    noteGrouper?.setTolerance(toleranceMs);

    refreshKeyboard();
    refreshChord();
    // [Claude] — 2026-10-13 — La cascade des Sessions MIDI se cale sur le clavier : transposition,
    // notation (lettres) et étendue (touches affichées).
    window.dispatchEvent(new CustomEvent('keyboard-settings-changed', {
      detail: { transpose: state.transpose, latin: state.notation === 'latin', spelling: state.spelling },
    }));
  };

  els.noteStart.addEventListener('change', update);
  els.noteEnd.addEventListener('change', update);
  els.notation.addEventListener('change', () => {
    update();
  });
  els.spelling?.addEventListener('change', update);
  els.transposeInput.addEventListener('change', update);
  els.toleranceInput?.addEventListener('change', update);

  /**
   * [Claude] — 2026-11-04 — Affiche le retard entre la touche et le son, en
   * clair. Narcisse a dû le découvrir seul en changeant la sortie audio de son
   * PC ; l'application ne le mesurait nulle part. Le seuil de 20 ms est celui
   * à partir duquel un pianiste commence à décaler son jeu pour compenser.
   */
  function refreshAudioLatency() {
    const out = els.audioLatencyValue;
    if (!out) return;
    const { base, output, total, sampleRate } = getAudioLatency();
    out.textContent = `${total.toFixed(1)} ms`;
    out.classList.toggle('is-warning', total >= 20);
    const detail = output > 0
      ? `${base.toFixed(1)} ms de traitement + ${output.toFixed(1)} ms de sortie système`
      : `${base.toFixed(1)} ms de traitement (la sortie système ne se déclare pas)`;
    if (els.audioLatencyNote) {
      els.audioLatencyNote.textContent = total >= 20
        ? `${detail} · ${sampleRate} Hz. Au-delà de 20 ms, le décalage s'entend : on joue en avance sans le vouloir, et l'enregistrement part décalé.`
        : `${detail} · ${sampleRate} Hz. En dessous de 20 ms, le retard ne se sent pas au jeu.`;
    }
  }

  els.audioLatencyRefresh?.addEventListener('click', refreshAudioLatency);
  // La mesure n'a de sens qu'une fois le contexte audio réveillé (politique
  // d'autoplay) : on la rafraîchit à l'ouverture des réglages.
  document.getElementById('app-settings-toggle')?.addEventListener('click', () => {
    setTimeout(refreshAudioLatency, 50);
  });
  refreshAudioLatency();
  els.silentMode.addEventListener('change', update);
  els.pcKeyboardMidi?.addEventListener('change', update);
  els.colorNote.addEventListener('input', update);

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

  // [Claude] — 2026-10-02 — Le raccourci « Enregistrer » de la sous-navigation
  // n'existe plus : « Enregistrer » est le bouton principal de Sessions MIDI.
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
      // [Claude] — 2026-10-09 — Avec ce que la main gauche tient toujours (chordNotesWithHeld).
      const unique = chordNotesWithHeld(group.map((n) => n.note), getAllActivePcs());
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
// [Claude] — 2026-09-24 — Mode Progression retiré ; en Mouvement, la tonalité
// en cours, la frise des tonalités et les accords sont tous cliquables
// (Narcisse : tonalité active mal placée, pas de saut direct à un accord).
// [Claude] — 2026-11-06 — Panneau de droite scindé en deux (Narcisse) : la
// progression migre dans .tr-exercise-brief (à la place d'« Options du
// tour », jamais utilisé — réglages couleurs/tonalités/ordre/départ retirés
// avec), .tr-exercise-progress ne garde que le Voicing.

const DEMO_PLAY_ICON = '<svg class="tr-i" width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5.5v13l11-6.5z"/></svg>';
const DEMO_STOP_ICON = '<svg class="tr-i" width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6.5" y="6.5" width="11" height="11" rx="1.5"/></svg>';
const DEMO_PAUSE_ICON = '<svg class="tr-i" width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>';

/** Panneau de gauche : ce qu'on travaille, et les réglages du tour en Mouvement. */
// [Claude] — 2026-11-07 — #exercise-brief-text (la phrase de contexte sous le
// titre du mouvement) retiré sur annotation de Narcisse : le titre seul reste.
function renderExerciseBrief(exState) {
  const category = document.getElementById('exercise-brief-category');
  const title = document.getElementById('exercise-brief-title');
  if (!category || !title) return;

  const target = exState.target;
  const isMovement = exState.mode === 'movement' && Boolean(target?.movementName);
  // Les options vivent dans leur panneau et ne déterminent plus la hauteur de la carte.

  if (isMovement) {
    const entry = exState.progression?.movement;
    category.textContent = EXERCISE_KIND_LABELS[entry?.kind] || target.movementCategory || 'PARCOURS HARMONIQUE';
    title.textContent = target.movementName;
    return;
  }

  category.textContent = 'ACCORD CIBLE';
  title.textContent = 'Un accord, puis le suivant.';
}

/** Panneau de droite : tonalité en cours, frise des tonalités, accords (cliquables). */
// [Claude] — 2026-11-07 — #exercise-progress-quiet (l'indice « Cliquez une
// tonalité... ») retiré sur annotation de Narcisse : simple guard désormais
// (`quiet` peut être absent sans empêcher le reste du panneau de se rendre).
function renderExerciseProgressPanel(exState) {
  const eyebrow = document.getElementById('exercise-progress-eyebrow');
  const counter = document.getElementById('exercise-progress-counter');
  const track = document.getElementById('exercise-progress-track');
  const path = document.getElementById('exercise-progress-path');
  const quiet = document.getElementById('exercise-progress-quiet');
  if (!counter || !track || !path) return;

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
      const role = { departure: 'Départ', passing: 'Passage écrit', arrival: 'Arrivée' }[chord.harmonicRole];
      // [Claude] — 2026-11-07 — Le rôle/minutage (« Départ · 1 temps ») ne
      // s'affiche plus sous le nom de l'accord (Narcisse) : gardé seulement
      // dans l'info-bulle (title), pas perdu, juste moins visible d'un coup d'œil.
      const timing = chord.studyStep ? `${role ? `${role} · ` : ''}${chord.studyStep.beats.toLocaleString('fr-FR')} temps` : '';
      const row = `<button type="button" class="${state}" data-step="${i}" title="Afficher ${chord.name}${timing ? ` · ${timing}` : ''}"${current ? ' aria-current="step"' : ''}><span>${i + 1}</span><div><strong>${chord.name || '—'}</strong>${topTag(chord)}</div></button>`;
      const p = chord.passingChord;
      if (!p) return row;
      const onIt = onPassing && i === stepIndex;
      const passingState = onIt ? ' is-active' : i < stepIndex ? ' is-done' : '';
      const playing = demoHooks.playingPassing === i ? ' is-playing' : '';
      const hands = `main gauche ${notes(p.voicing?.leftHand || [])}, main droite ${notes(p.voicing?.rightHand || [])}`;
      return `${row}<button type="button" class="exercise-passing-chord${passingState}${playing}" data-passing="${i}" title="Accord de passage (tension) — ${hands}. Cliquez pour le travailler."${onIt ? ' aria-current="step"' : ''}><span aria-hidden="true">↳</span><div><strong>${p.name}</strong><small>passage</small>${topTag(p)}</div></button>`;
    }).join('');
    return;
  }

  // Mode « Accord cible » : pas de progression multi-étapes côté Zic. On
  // n'invente pas d'échelle : on montre le score et les tentatives réels.
  if (eyebrow) eyebrow.textContent = 'VOTRE SCORE';
  counter.style.display = 'none';
  track.style.display = 'none';
  path.innerHTML = '';
  if (!quiet) return;
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
    setModeButtonActive(exState.mode);
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
        doubling: exState.doubling, isFavorite, layout: exState.mode === 'chord' ? 'chord' : 'default', separateVoicings: true, spelling,
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
   * [Claude] — 2026-11-05 — Disposition du mode Accord cible, porté du code du
   * candidat : panneau de gauche (Explorer), carte au centre, voicings à
   * droite. Parcours harmonique garde la sienne (bandeau + colonne de score).
   *
   * Accord cible devient un EXPLORATEUR LIBRE — demande explicite de
   * Narcisse après avoir vu la maquette (pas de jauge, pas de bonne/mauvaise
   * réponse) : rien n'est jugé dans ce mode, voir checkPracticeExercise(). La
   * bulle de retour (#exercise-feedback) n'a donc plus d'objet ici ; elle
   * reste réservée à Parcours harmonique.
   */
  function refreshChordSide(exState) {
    const isChord = exState.mode === 'chord';
    const stage = els.chordExplorerLeft?.closest('.tr-exercise-stage');
    stage?.classList.toggle('is-chord-mode', isChord);
    // [Claude] — 2026-11-05 — Classe à part pour la grille à 3 colonnes : une
    // ancienne règle `:has(#exercise-topnote-browser…)` d'astra-bridge.css
    // vise déjà .is-chord-mode, à spécificité égale à la mienne, et gagne la
    // cascade dès que #exercise-topnote-browser existe dans le DOM — ce qui
    // est désormais TOUJOURS vrai (il vit dans le panneau de gauche, caché,
    // pas injecté dynamiquement). Plutôt que d'entrer dans une guerre de
    // spécificité avec une règle écrite pour un autre usage, la grille prend
    // son propre crochet, que seul ce fichier connaît.
    stage?.classList.toggle('chord-explorer-3col', isChord);
    if (els.chordExplorerLeft) els.chordExplorerLeft.hidden = !isChord;
    const feedback = document.getElementById('exercise-feedback');
    if (feedback) {
      // En Accord cible, rien n'est jugé : la bulle reste vide et masquée.
      // Un passage depuis Parcours harmonique ne doit pas laisser un message
      // obsolète affiché par-dessus le nouvel explorateur.
      //
      // `hidden` est réaffecté à chaque rendu, SANS dépendre de parentElement :
      // conditionner le démasquage à « pas encore déplacée » a été repéré en
      // testant le retour Accord cible → Parcours harmonique — une fois cachée
      // par le premier, la bulle restait cachée pour toujours dans le second,
      // la condition la protégeant du déplacement court-circuitant aussi le
      // hidden = false. Réaffecter hidden ici est sans coût ; seul le
      // déplacement DOM (prepend) garde sa garde, pour ne pas le répéter.
      feedback.hidden = isChord;
      if (isChord) feedback.textContent = '';
      else if (feedback.parentElement !== stage) stage?.prepend(feedback);
    }
    els.exerciseChordSide?.closest('.tr-exercise-progress')?.classList.toggle('is-chord-side', isChord);
    if (els.exerciseChordSide) els.exerciseChordSide.hidden = !exState.target;
    renderChordExplorerSummary(exState, isChord);
    renderChordExplorerFavoritesPreview(isChord);
    // Voicings disponibles de l'accord affiché (hors de la carte en Accord cible).
    // Accord cible a sa propre présentation groupée (renderChordExplorerVoicings) ;
    // Parcours harmonique garde exactement le rendu d'avant, inchangé.
    if (els.exerciseVoicingChoices) {
      els.exerciseVoicingChoices.innerHTML = !exState.target ? ''
        : isChord ? renderChordExplorerVoicings(exState.target, getAvailableTechniques(exState.target.name))
          : renderVoicingChoices(exState.target, { variant: exState.variant, selectedTechnique: exState.technique });
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

  /**
   * Résumé « Accord de travail » du panneau de gauche : symbole et
   * difficulté — même échelle 1-5 que le reste de l'application
   * (difficultyOfVoicing), pas une échelle à 3 inventée pour l'occasion.
   * [Claude] — 2026-11-06 — Plus de ligne famille/nombre de sons sous le
   * symbole (Narcisse : sous-titres inintéressants) ; le nom de l'accord
   * étant déjà visible au centre, ce résumé n'est plus qu'un repère rapide.
   */
  function renderChordExplorerSummary(exState, isChord) {
    if (!els.chordExplorerSummary) return;
    const target = exState.target;
    if (!isChord || !target) { els.chordExplorerSummary.innerHTML = ''; return; }
    const stars = difficultyOfVoicing(target);
    const dots = Array.from({ length: 5 }, (_, i) => `<span class="chord-explorer-dot${i < stars ? ' is-on' : ''}"></span>`).join('');
    els.chordExplorerSummary.innerHTML = `
      <p class="chord-explorer-summary-symbol">${escapeHtmlForDisplay(target.name)}</p>
      <div class="chord-explorer-summary-stars">${dots}</div>`;
  }

  /**
   * Favoris récents (2 derniers) dans le panneau de gauche. Même donnée que
   * la fenêtre Favoris ; un clic charge le favori sur la carte, exactement
   * comme [data-favorite-open] dans cette fenêtre.
   */
  function renderChordExplorerFavoritesPreview(isChord) {
    if (!els.chordExplorerFavoritesPreview) return;
    if (!isChord) { els.chordExplorerFavoritesPreview.innerHTML = ''; return; }
    const preview = exerciseFavorites.slice(0, 2);
    if (!preview.length) {
      els.chordExplorerFavoritesPreview.innerHTML = '<p class="chord-explorer-favorites-empty">Étoilez un voicing pour le retrouver ici.</p>';
      return;
    }
    els.chordExplorerFavoritesPreview.innerHTML = preview.map((f) => {
      const notes = [...f.lh, ...f.rh].map((n) => `${noteName(n)}${Math.floor(n / 12) - 1}`).join(' · ');
      const technique = TECHNIQUE_LABELS[f.technique] || f.technique || '';
      return `<button type="button" class="chord-explorer-favorite" data-favorite-preview="${escapeAttrForDisplay(f.key)}">
          <span class="chord-explorer-favorite-main">
            <span class="chord-explorer-favorite-symbol">${escapeHtmlForDisplay(f.name)}</span>
            <span class="chord-explorer-favorite-technique">${escapeHtmlForDisplay(technique)}</span>
          </span>
          <span class="chord-explorer-favorite-notes">${escapeHtmlForDisplay(notes)}</span>
        </button>`;
    }).join('');
  }

  const escapeHtmlForDisplay = (s) => String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const escapeAttrForDisplay = (s) => escapeHtmlForDisplay(s).replace(/"/g, '&quot;');

  els.chordExplorerFavoritesPreview?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-favorite-preview]');
    if (!btn) return;
    const fav = exerciseFavorites.find((f) => f.key === btn.dataset.favoritePreview);
    if (fav) { practiceExercise.showFavorite(fav); render(); }
  });

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
    if (exState.mode !== 'chord' || topPc == null) {
      box.hidden = true;
      topNoteBrowserKey = '';
      return;
    }
    box.hidden = false;
    // Mêmes options que la carte (niveau + filtres) : les index concordent.
    // [Claude] — 2026-09-25 — Étoiles comptées avec la main gauche du style, comme sur la carte.
    const { pc: _pc, ...topOptions } = exState.topNote;
    const searchOptions = { ...topOptions, leftHandStyle: exState.leftHandStyle };
    const selected = exState.target?.voicing?.topNoteSuggestions && !exState.target.topNoteMiss
      ? { rootPc: exState.target.rootPc, quality: exState.target.symbol }
      : null;
    // Seul le filtre Technique restreint les techniques, jamais la technique
    // cliquée auparavant sur la carte.
    const key = JSON.stringify(searchOptions) + topPc;
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
    modeButtons.forEach((b) => {
      const selected = b.dataset.mode === mode;
      b.classList.toggle('active', selected);
      b.classList.toggle('is-active', selected);
      b.setAttribute('aria-selected', String(selected));
    });
  }

  // [Claude] — 2026-10-13 — La question est posée par l'application (appConfirm), et non plus
  // par une fenêtre du système (confirm) : même aspect sur tous les PC.
  async function maybeConfirmReset(restart = false) {
    const cur = practiceExercise.getState();
    if (cur.score > 0 || cur.attempts > 0) {
      return appConfirm({
        title: restart ? 'Recommencer l\'exercice ?' : 'Changer d\'exercice ?',
        message: 'Votre progression sur cet exercice (score et essais) sera perdue.',
        confirmLabel: restart ? 'Recommencer' : 'Changer d\'exercice',
        cancelLabel: 'Continuer l\'exercice',
      });
    }
    return true;
  }

  modeButtons.forEach((btn) => {
    btn.addEventListener('click', async () => {
      // Ne pas perdre la progression en cours sur un clic accidentel :
      // si l'exercice courant a déjà été joué, demander confirmation.
      if (!await maybeConfirmReset(btn.dataset.mode === practiceExercise.getState().mode)) return;
      setModeButtonActive(btn.dataset.mode);
      practiceExercise.setMode(btn.dataset.mode);
      feedbackDiv.textContent = '';
      render();
    });
  });

  // [Claude] — 2026-11-06 — « Options du tour » retiré (Couleurs/Tonalités/
  // Ordre/Départ) : le câblage de ces 4 contrôles (difficulté, grille de
  // tonalités, ordre, tonalité de départ) part avec. setDifficulty/setKeySet/
  // setKeyOrder/setKeyChoice restent dans practice-exercise.js (valeurs par
  // défaut toujours utilisées à la génération du tour), seule l'UI disparaît.

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
  // [Claude] — 2026-11-04 — Panneau actif À L'INTÉRIEUR de la catégorie (''= tout).
  // Ma grille : accords choisis, dans l'ordre ({ root, quality, top }).
  let gridChords = [];
  // Grilles enregistrées (catégorie Perso de la bibliothèque).
  let customGrids = loadGrids(window.localStorage);
  // Grille dont la suppression attend confirmation (second clic).
  let gridDeleteArmed = null;
  let gridDeleteTimer = null;
  let librarySearch = '';
  // [Claude] — 2026-11-05 — L'étude affichée dans le panneau de droite. La page
  // montre une liste ET ce qu'on regarde : il faut savoir laquelle.
  let librarySelected = null;

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
  const ARCHIVE_CATEGORY = 'Archives · grilles seules';
  // [Claude] — 2026-11-04 — Une seule case Latino, par demande explicite.
  const LATIN_CATEGORY = 'Latino';
  /** Résumé d'une grille enregistrée : accords, passages entre parenthèses, notes du dessus (« Dm11 ♪ C → (D7b9) → G13 »). */
  const gridSummary = (grid) => {
    const chords = grid.chords.map((c) => gridChordFrom(c.name, c.top, c.role));
    const roles = gridRoles(chords.map((c) => c || { quality: '' }));
    return grid.chords.map((c, i) => {
      const top = chords[i] ? gridTopLabel(chords[i]) : '';
      const label = top ? `${c.name} ♪ ${top}` : c.name;
      return roles[i] === 'passing' ? `(${label})` : label;
    }).join(' → ');
  };

  function getLibraryItems() {
    const movements = [...(movementsLibrary?.movements || []), ...archivedMovements].map((m) => ({
      id: m.id,
      kind: m.kind,
      route: m.route,
      focus: m.focus,
      provenance: m.provenance,
      score: m.score,
      name: m.name,
      category: m.category || 'Mouvements 12 tons',
      level: m.level,
      description: m.description || '',
      // [Claude] — 2026-10-16 — Ce qu'il manquait sur les cartes (Narcisse : « sur cadence éolienne,
      // il n'y a pas assez d'informations ; on ne sait pas ce que c'est ») : à quoi ça sert, l'effet
      // à l'oreille, quand s'en servir, et surtout LES ACCORDS — calculés par le moteur de jeu
      // (movementChordNames), donc exactement ceux que l'exercice jouera.
      context: m.context || '',
      sound: m.sound || '',
      use: m.use || '',
      chords: movementChordNames(m),
      tags: m.tags || [],
      style: m.style,
    }));
    const perso = customGrids.map((g) => ({
      id: g.id,
      name: g.name,
      category: PERSO_CATEGORY,
      level: 0,
      description: '',
      context: '',
      sound: '',
      use: '',
      chords: (g.chords || []).map((c) => c.name),
      tags: [],
      style: undefined,
      grid: g,
    }));
    return [...movements, ...perso];
  }

  /**
   * [Claude] — 2026-11-04 — Les « panneaux » : une seconde rangée de filtres,
   * À L'INTÉRIEUR de la catégorie choisie (Narcisse : « dans cette case-là,
   * ensuite après, tu rajoutes des sortes de panneaux débutant, avancé, etc.
   * Montuno, Tumbao »). Les panneaux sortent des `tags` des fiches montrées :
   * rien à tenir à jour ici quand une étude arrive. Les niveaux passent en
   * premier, le reste suit par ordre alphabétique.
   */

  function renderLibrary() {
    const all = getLibraryItems();
    const active = all.filter((i) => i.kind !== 'archive');
    const libraryStyle = document.getElementById('exercise-library-style');
    if (libraryStyle) renderDemoStyleMenu(libraryStyle, ![ARCHIVE_CATEGORY, PERSO_CATEGORY].includes(libraryCategory));
    let items = libraryCategory === ARCHIVE_CATEGORY ? all : active;
    const q = librarySearch.trim().toLowerCase();
    if (q) {
      items = items.filter((item) =>
        item.name.toLowerCase().includes(q)
        || item.category.toLowerCase().includes(q)
        || item.description.toLowerCase().includes(q)
        || (item.context || '').toLowerCase().includes(q)
        || (item.sound || '').toLowerCase().includes(q)
        || (item.use || '').toLowerCase().includes(q)
        || (item.chords || []).some((c) => c.toLowerCase().includes(q))
        || item.tags.some((tag) => tag.toLowerCase().includes(q)));
    }
    // Catégories de la bibliothèque, Perso (vos grilles) puis les archives en dernier.
    // [Claude] — 2026-11-04 — « Latino » est UNE case (Narcisse : « autant tout mettre
    // dans une même case »). Ce qui distinguait les trois anciennes catégories —
    // Débutant/Avancé, Montuno, Tumbao — devient un panneau à l'intérieur (voir
    // plus bas). Les Archives marchent pareil : leurs familles musicales, qu'on
    // écrasait, redeviennent des panneaux.
    const categoryOrder = ['Progressions', 'Mouvements', 'Gestes & voix',
      LATIN_CATEGORY, PERSO_CATEGORY, ARCHIVE_CATEGORY];
    const categories = categoryOrder;
    if (els.exerciseLibraryCategories) {
      els.exerciseLibraryCategories.innerHTML = [`<button type="button" class="exercise-library-chip ${libraryCategory ? '' : 'active'}" data-category="" aria-pressed="${!libraryCategory}">Études<span class="exercise-library-count">${active.length}</span></button>`]
        .concat(categories.map((cat) => {
          const count = all.filter((i) => i.category === cat).length;
          const active = libraryCategory === cat;
          return `<button type="button" class="exercise-library-chip ${active ? 'active' : ''}" data-category="${escapeAttr(cat)}" aria-pressed="${active}">${escapeHtml(cat)}<span class="exercise-library-count">${count}</span></button>`;
        })).join('');
    }
    if (libraryCategory) items = items.filter((i) => i.category === libraryCategory);
    // [Claude] — 2026-11-05 — Les « panneaux » (bulles Débutant, Clave, Danzón…)
    // sont retirés. Narcisse : « c'est sous forme de bulles, mais quand je suis
    // dans progression, passage, geste et voix, je vois qu'il y a juste des
    // étiquettes. Si je devais choisir entre les deux, je choisis largement les
    // étiquettes. » Et surtout ils trompaient : affichés sous « Études », ils
    // ne montraient que les tags de Latino sans dire d'où ils venaient. Les
    // catégories suffisent ; les tags restent dans le JSON et dans la recherche.
    items.sort((a, b) => categoryOrder.indexOf(a.category) - categoryOrder.indexOf(b.category) || a.name.localeCompare(b.name));
    if (!els.exerciseLibraryGrid) return;
    const current = practiceExercise.getState().progression?.name;
    const empty = libraryCategory === PERSO_CATEGORY && !q
      ? 'Aucune grille perso pour l\'instant : composez une grille dans « Ma grille », donnez-lui un nom puis « Enregistrer ».'
      : 'Aucune étude ne correspond à votre recherche.';
    els.exerciseLibraryGrid.innerHTML = items.length === 0
      ? `<div class="exercise-library-empty">${empty}</div>`
      : items.map((item, i) => renderLibraryCard(item, i, current)).join('');
    // [Claude] — 2026-11-05 — La page montre l'étude qu'on regarde à droite.
    // Si celle qui était choisie sort de la liste (recherche, changement de
    // catégorie), on prend la première plutôt que de laisser un vide.
    if (!items.some((i) => i.id === librarySelected)) librarySelected = items[0]?.id || null;
    renderLibraryDetail(items.find((i) => i.id === librarySelected) || null, current);
  }

  /**
   * [Claude] — 2026-11-05 — L'étude qu'on regarde, à droite de la liste.
   *
   * Narcisse, sur la présentation du mode Solo qu'il a retenue : « tu as trop
   * écrit dans les descriptions. Ce que ça donne, on veut pas le savoir. Comment
   * t'y mettre, on veut pas le savoir. Le détail, on veut même pas le savoir. À
   * la limite, ce qu'on peut garder, c'est l'intitulé ce que c'est. »
   *
   * Donc UNE ligne : « ce que c'est ». `sound` (ce que ça donne), `use` (comment
   * t'y mettre), `description` et `focus` (le détail) ne sont plus affichés —
   * ils restent dans le JSON, dans la recherche et à disposition du Copilote.
   */
  function renderLibraryDetail(item, current) {
    const host = document.getElementById('exercise-library-detail');
    if (!host) return;
    if (!item) { host.innerHTML = ''; return; }
    const isCurrent = item.name === current;
    const quoi = item.context || '';
    const playing = previewId === item.id;

    // Les accords de l'étude, avec leurs vraies notes : c'est ce qui remplit la
    // colonne et ce qui sert — « on peut rajouter des cartes d'accord, tu peux
    // rajouter des mini-keyboardings à chaque fois pour illustrer les accords ».
    // Même fabrique que l'aperçu sonore : ce qu'on voit est ce qu'on entendra.
    const key = practiceExercise.getState().keyChoice ?? 0;
    let voiced = null;
    try {
      voiced = item.grid
        ? practiceExercise.previewGrid(item.grid.chords, item.grid.name)
        : practiceExercise.previewMovement(item.id, key);
    } catch (e) {
      voiced = null;
    }
    const chordCards = (voiced || []).map((c) => {
      const notes = [...new Set([...(c.leftHand || []), ...(c.rightHand || []), ...(c.notes || [])])].sort((a, b) => a - b);
      if (!notes.length) return '';
      const kb = miniKeyboardForNotes(notes, { leftHand: c.leftHand || [], rightHand: c.rightHand || [] });
      const names = notes.map((n) => `${noteName(n)}${Math.floor(n / 12) - 1}`).join(' · ');
      return `<figure class="exercise-library-chord">
          <figcaption>${escapeHtml(c.name || '')}</figcaption>
          <div class="exercise-library-chord-kb">${kb.svg}</div>
          <span class="exercise-library-chord-notes">${escapeHtml(names)}</span>
        </figure>`;
    }).filter(Boolean).join('');

    host.innerHTML = `
      <span class="tr-eyebrow">${escapeHtml(EXERCISE_KIND_LABELS[item.kind] || item.category)}</span>
      <h2 class="exercise-library-detail-name">${escapeHtml(item.name)}${isCurrent ? '<span class="exercise-library-current">En cours</span>' : ''}</h2>
      ${item.route ? `<p class="exercise-library-detail-route">${escapeHtml(item.route)}</p>` : ''}
      ${quoi ? `<div class="exercise-library-what"><span class="exercise-library-what-label">Ce que c'est</span><p>${escapeHtml(quoi)}</p></div>` : ''}

      <div class="exercise-library-player${playing ? ' is-playing' : ''}">
        <button type="button" class="exercise-library-play" data-preview="${escapeAttr(item.id)}" aria-label="${escapeAttr(`${playing ? 'Arrêter' : 'Écouter'} : ${item.name}`)}">${playing ? DEMO_STOP_ICON : DEMO_PLAY_ICON}<span>${playing ? 'Arrêter' : 'Écouter'}</span></button>
        <div class="exercise-library-progress" role="presentation"><span id="exercise-library-progress-fill"></span></div>
        <button type="button" class="tr-button tr-primary" data-study-select="${escapeAttr(item.id)}">Travailler</button>
        ${item.grid ? `<button type="button" class="tr-button" data-grid-load="${escapeAttr(item.id)}" aria-label="${escapeAttr(`Modifier la grille ${item.name}`)}">Modifier</button>
        <button type="button" class="tr-button is-danger${gridDeleteArmed === item.id ? ' is-armed' : ''}" data-grid-delete="${escapeAttr(item.id)}" aria-label="${escapeAttr(`Supprimer la grille ${item.name}`)}">${gridDeleteArmed === item.id ? 'Confirmer' : 'Supprimer'}</button>` : ''}
      </div>

      ${chordCards ? `<div class="exercise-library-chords" role="group" aria-label="Accords de l'étude">${chordCards}</div>`
    : '<p class="exercise-library-noschords">Cette grille n\'a pas de position jouable à montrer.</p>'}`;
  }

  /**
   * La barre du lecteur suit l'aperçu en cours. Elle n'existe que pendant la
   * lecture : rien à animer quand rien ne joue.
   */
  function tickLibraryProgress() {
    const fill = document.getElementById('exercise-library-progress-fill');
    if (!fill) return;
    const total = demoPlayer.isActive() ? demoPlayer.duration() : 0;
    const at = demoPlayer.position();
    const pct = total > 0 ? Math.max(0, Math.min(100, (at / total) * 100)) : 0;
    fill.style.width = `${pct}%`;
  }

  /**
   * Une entrée de la LISTE : catégorie, nom, et la route en une ligne. Rien d'autre.
   *
   * [Claude] — 2026-10-16 (soir) — Premier allègement : « il y a beaucoup trop de détails sur
   * les cartes… il faut simplifier mille fois » ; les suites d'accords, le dépliant théorique,
   * les étoiles et les points étaient partis.
   * [Claude] — 2026-11-05 — Second allègement, sur le modèle du mode Solo que Narcisse a
   * retenu : la carte devient un bouton de liste, et la phrase de contexte comme les actions
   * passent dans le panneau de droite (renderLibraryDetail). Une carte ne porte plus qu'une
   * identité ; on clique, et on lit à côté.
   * Les données restent entières dans le JSON et dans la recherche (chercher « Dm7 » trouve
   * toujours les mouvements qui le contiennent) ; le moteur de jeu et le Copilote s'en servent
   * tels quels.
   */
  function renderLibraryCard(item, i, current) {
    const isCurrent = item.name === current;
    const selected = item.id === librarySelected;
    return `<button type="button" class="exercise-library-card${isCurrent ? ' is-current' : ''}${item.grid ? ' is-perso' : ''}${selected ? ' is-selected' : ''}" data-id="${escapeAttr(item.id)}" style="--i:${i}" aria-pressed="${selected}" aria-label="${escapeAttr(item.grid ? `${item.name}, grille perso` : item.name)}">
            <span class="exercise-library-card-category">${escapeHtml(EXERCISE_KIND_LABELS[item.kind] || item.category)}</span>
            <strong class="exercise-library-card-name">${escapeHtml(item.name)}${isCurrent ? '<span class="exercise-library-current">En cours</span>' : ''}</strong>
            ${item.route ? `<span class="exercise-library-card-route">${escapeHtml(item.route)}</span>` : ''}
          </button>`;
  }


  /** Prépare le contenu ; l'ouverture elle-même est faite par astra-shell.js (data-astra-open). */
  /**
   * Le conteneur des vues : c'est lui qui s'efface derrière la bibliothèque, et
   * lui qui cadre la page. La bibliothèque est sa fille, SŒUR de la vue
   * Exercices — héritage de l'ancien overlay, posé après elle dans le markup.
   */
  const exerciseView = () => document.getElementById('practice-body');

  function openLibrary() {
    libraryCategory = null;
    librarySearch = '';
    librarySelected = null;
    if (els.exerciseLibrarySearch) els.exerciseLibrarySearch.value = '';
    // [Claude] — 2026-11-05 — Plus de fenêtre : la bibliothèque est une PAGE de
    // l'onglet, sur le fond Velours. Le reste de la vue s'efface derrière elle
    // (classe sur la vue), comme la bibliothèque de l'Analyse depuis le 23/10.
    if (els.exerciseLibrary) els.exerciseLibrary.hidden = false;
    exerciseView()?.classList.add('library-page-open');
    renderLibrary();
    startLibraryProgress();
    els.exerciseLibrarySearch?.focus();
    // [Claude] — 2026-11-04 — On décode les boucles pendant qu'il choisit son
    // étude : à la première écoute, la batterie doit entrer en même temps que
    // le piano, pas après le temps de décodage.
    if (drumsEnabled) {
      Promise.all(['salsa', 'gospel'].map((k) => drumLoop.warm(k)))
        .then(() => refreshDrumsDiagnostic())
        .catch(() => refreshDrumsDiagnostic());
    }
  }

  function closeLibrary() {
    if (!els.exerciseLibrary || els.exerciseLibrary.hidden) return;
    // Un aperçu en cours n'a plus de raison de sonner quand on quitte la page.
    if (demoContext?.kind === 'preview') demoPlayer.stop();
    els.exerciseLibrary.hidden = true;
    stopLibraryProgress();
    exerciseView()?.classList.remove('library-page-open');
    els.exerciseLibraryBtn?.focus();
  }

  /** Passe en mode Mouvement si besoin (après confirmation si un exercice est en cours). */
  async function ensureMovementMode() {
    if (practiceExercise.getState().mode === 'movement') return true;
    if (!await maybeConfirmReset()) return false;
    practiceExercise.setMode('movement');
    setModeButtonActive('movement');
    return true;
  }

  async function selectLibraryCard(item) {
    demoPlayer.stop();
    if (!await ensureMovementMode()) return;
    if (item.grid) practiceExercise.setCustomGrid(item.grid.chords, { name: item.grid.name });
    else practiceExercise.setContentChoice(item.id);
    closeLibrary();
    feedbackDiv.textContent = '';
    render();
  }

  els.exerciseLibraryBtn?.addEventListener('click', openLibrary);
  document.getElementById('exercise-library-close')?.addEventListener('click', closeLibrary);
  // Échap quitte la page, comme il fermait la fenêtre. Limité à l'onglet visible
  // et à la page ouverte, pour ne pas voler le raccourci ailleurs.
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || els.exerciseLibrary?.hidden) return;
    if (document.querySelector('.tr-overlay:not([hidden])')) return; // une vraie fenêtre est au-dessus
    e.preventDefault();
    closeLibrary();
  });

  // ── Ma grille : accords choisis un par un (fondamentale + qualité) ──
  // [Claude] — 2026-09-24 — Narcisse : « pas pratique d'écrire, mieux de
  // sélectionner ». Puis : note du dessus par accord (voice leading), un accord
  // précis se modifie d'un clic (« sans tout recommencer »), la grille
  // s'enregistre sous un nom dans la catégorie Perso de la bibliothèque.
  // gridChords : { root: 'D', quality: 'm11', top: intervalle | null }.
  //
  // [Claude] — 2026-10-16 (soir) — L'atelier au mini-clavier a été retiré (Narcisse : « le
  // mini-keyboard avec des contours noirs est horrible… c'était bien mieux avant ») :
  // retour aux trois menus sobres — fondamentale, qualité, note du dessus — plus « Ajouter ».
  // Et la grille vit dans SA PROPRE fenêtre : elle n'occupe plus le haut de la bibliothèque
  // (« la mettre tout en haut comme ça, ça ne passe pas du tout »).
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
  const gridChordFrom = (name, top = null, role = undefined) => {
    const match = /^([A-G][#b]?)(.*)$/.exec(String(name || ''));
    return match ? { root: match[1], quality: match[2], top: Number.isInteger(top) ? top : null, role } : null;
  };
  const gridTopLabel = (c) => (c.top == null ? '' : spellChordTone(c.root, c.top, c.quality));

  // Le rôle est déclaré par l’utilisateur ; la couleur ne classe pas l’accord.
  function gridRoles(chords) {
    let available = false;
    return chords.map((c) => {
      const passing = c.role === 'passing' && available;
      available = !passing;
      return passing ? 'passing' : 'main';
    });
  }

  function passingRefusal(chord, index, chords) {
    if (chord.role !== 'passing') return null;
    if (index === 0 || gridRoles(chords.slice(0,index)).at(-1) === 'passing') return 'Placez le passage après un accord de grille.';
    if (chords[index + 1]?.role === 'passing') return 'Cet accord précède déjà un passage. Gardez-le dans la grille ou modifiez d’abord le passage suivant.';
    return null;
  }

  function refreshGridAddLabel() {
    if (!els.exerciseGridAdd) return;
    const passing = document.getElementById('exercise-grid-role')?.value === 'passing';
    els.exerciseGridAdd.textContent = gridEditing != null ? `Modifier l’accord ${gridEditing + 1}` : passing ? 'Ajouter en passage' : 'Ajouter';
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
        const title = passing ? 'Passage choisi — cliquer pour le modifier' : 'Accord de grille — cliquer pour le modifier';
        return `<li class="${[i === gridEditing ? 'is-editing' : '', passing ? 'is-passing' : ''].filter(Boolean).join(' ')}"><button type="button" class="exercise-grid-chip" data-grid-edit="${i}" title="${title}" aria-label="Modifier l'accord ${i + 1} : ${escapeAttr(name)}${passing ? ', accord de passage' : ''}${top ? `, dessus ${escapeAttr(top)}` : ''}">${passing ? '<span aria-hidden="true">↳</span>' : ''}${escapeAttr(name)}${top ? `<small>♪ ${escapeAttr(top)}</small>` : ''}</button><button type="button" data-grid-remove="${i}" aria-label="Retirer ${escapeAttr(name)}" title="Retirer">×</button></li>`;
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
      && saved.chords.every((c, i) => c.name === exState.customGrid[i].name && c.role === exState.customGrid[i].role);
    if (!sameChords) return null;
    const { grids, grid } = upsertGrid(customGrids, { name: saved.name, chords: exState.customGrid.map((c) => ({ name: c.name, top: c.top, ...(c.role === 'passing' ? { role: 'passing' } : {}) })) });
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
    const chord = { root, quality, top: topValue === '' ? null : Number(topValue), role: document.getElementById('exercise-grid-role')?.value === 'passing' ? 'passing' : undefined };
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
      if (chord.role === 'passing') gridStatus(`${gridChordName(chord)} ajouté en passage, au dernier temps de ${gridChordName(gridChords[gridChords.length - 2])}.`);
    }
    renderGridChips();
  });
  document.getElementById('exercise-grid-role')?.addEventListener('change', refreshGridAddLabel);
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
    const roleSelect = document.getElementById('exercise-grid-role');
    if (roleSelect) roleSelect.value = chord.role === 'passing' ? 'passing' : 'main';
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
    // Sans nom, la grille est enregistrée sous un nom par défaut (« Ma grille 1 »…), affiché
    // dans le champ pour pouvoir le changer ensuite.
    let name = els.exerciseGridName?.value.trim() || '';
    if (!name) {
      name = defaultGridName(customGrids);
      if (els.exerciseGridName) els.exerciseGridName.value = name;
    }
    const { grids, grid } = upsertGrid(customGrids, { name, chords: gridChords.map((c) => ({ name: gridChordName(c), top: c.top, ...(c.role === 'passing' ? { role: 'passing' } : {}) })) });
    if (!grid) return;
    customGrids = grids;
    saveGrids(window.localStorage, customGrids);
    gridStatus(`« ${grid.name} » enregistrée dans Perso.`);
    renderLibrary();
  });
  renderGridTopOptions();
  renderGridChips();

  // La fenêtre « Ma grille » s'ouvre par Astra (data-astra-open : Échap, le fond et la
  // croix ferment aussi). Ici, on ne fait que PRÉPARER son contenu : à l'ouverture
  // simple, elle repart de la grille en cours, s'il y en a une — on continue ce qu'on
  // avait commencé. « Modifier » sur une carte Perso la recharge préremplie.
  let gridKeepNextOpen = false;

  function openGridDialog({ keep = false } = {}) {
    if (!keep) {
      const exState = practiceExercise.getState();
      if (exState.customGrid) {
        gridChords = exState.customGrid.map((t) => gridChordFrom(t.name, t.top, t.role)).filter(Boolean);
        if (els.exerciseGridName) els.exerciseGridName.value = exState.customGridName || '';
      }
    }
    gridEditing = null;
    renderGridChips();
  }

  els.exerciseGridBtn?.addEventListener('click', () => {
    if (gridKeepNextOpen) {
      gridKeepNextOpen = false;
      openGridDialog({ keep: true });
    } else {
      openGridDialog();
    }
  });

  function closeGridDialog() {
    if (!els.exerciseGridDialog || els.exerciseGridDialog.hidden) return;
    els.exerciseGridDialog.hidden = true;
    document.body.classList.remove('tr-dialog-open');
  }

  els.exerciseGridForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (gridChords.length === 0) {
      els.exerciseGridRoot?.focus();
      return;
    }
    if (practiceExercise.getState().mode !== 'movement' && !await maybeConfirmReset()) return;
    const name = els.exerciseGridName?.value.trim() || null;
    practiceExercise.setCustomGrid(gridChords.map((c) => ({ name: gridChordName(c), top: c.top, ...(c.role === 'passing' ? { role: 'passing' } : {}) })), { name });
    setModeButtonActive('movement');
    closeGridDialog();
    feedbackDiv.textContent = '';
    render();
  });

  // [Claude] — 2026-10-03 — Pédagogie IA, lot 6 : un exemple du Copilote (les voicings du
  // prof posés sur une progression, ses accords de passage…) s'envoie dans Exercices.
  // Les grilles Perso et les favoris vivent ici (customGrids, exerciseFavorites) : écrits
  // ailleurs, ils seraient écrasés à la sauvegarde suivante. `done` répond à la carte.
  document.addEventListener('exercise-save-grid', (e) => {
    const { name, chords, done } = e.detail || {};
    const { grids, grid } = upsertGrid(customGrids, { name, chords });
    if (grid) {
      customGrids = grids;
      saveGrids(window.localStorage, customGrids);
      renderLibrary();
    }
    done?.(grid ? { ok: true, id: grid.id, name: grid.name, count: grid.chords.length } : { ok: false });
  });
  document.addEventListener('exercise-open-grid', (e) => {
    const item = getLibraryItems().find((i) => i.id === e.detail?.id);
    if (!item) return;
    document.dispatchEvent(new CustomEvent('app-switch-training-view', { detail: { view: 'exercise' } }));
    selectLibraryCard(item);
  });
  document.addEventListener('exercise-add-favorites', (e) => {
    const { favorites, done } = e.detail || {};
    const fresh = (favorites || []).filter((fav) => fav?.key && !exerciseFavorites.some((f) => f.key === fav.key));
    if (fresh.length) {
      exerciseFavorites = [...fresh, ...exerciseFavorites];
      saveFavorites(window.localStorage, exerciseFavorites);
      render();
    }
    done?.({ ok: true, added: fresh.length, already: (favorites || []).length - fresh.length });
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

  /**
   * La barre du lecteur se met à jour tant que la PAGE est ouverte, pas
   * seulement pendant la lecture : `startDemo` est asynchrone
   * (`await resumeAudio()`), si bien qu'au premier passage rien ne joue encore.
   *
   * Un `setInterval` plutôt qu'une boucle d'images : une chaîne de
   * requestAnimationFrame se réarme à chaque image, et si une seule est ratée
   * — onglet non rendu, fenêtre masquée — la chaîne meurt sans se relancer, le
   * drapeau restant posé. Dix rafraîchissements par seconde suffisent à l'œil
   * pour une barre de progression et ne dépendent pas du rythme de rendu.
   */
  let libraryProgressTimer = null;
  function startLibraryProgress() {
    stopLibraryProgress();
    libraryProgressTimer = setInterval(() => {
      if (els.exerciseLibrary?.hidden) { stopLibraryProgress(); return; }
      tickLibraryProgress();
    }, 100);
  }
  function stopLibraryProgress() {
    if (libraryProgressTimer == null) return;
    clearInterval(libraryProgressTimer);
    libraryProgressTimer = null;
  }

  const pickLibraryCard = (id) => {
    const item = getLibraryItems().find((i) => i.id === id);
    if (item) selectLibraryCard(item);
  };
  // [Claude] — 2026-11-05 — Un seul écouteur pour toute la page : les actions ont
  // quitté les cartes pour le panneau de droite, et deux écouteurs auraient
  // dupliqué la même logique de part et d'autre.
  els.exerciseLibrary?.addEventListener('click', (e) => {
    const play = e.target.closest('[data-preview]');
    if (play) {
      togglePreview(play.dataset.preview);
      startLibraryProgress();
      return;
    }
    // Grille Perso : « Modifier » l'ouvre dans « Ma grille » (même nom = mise à jour),
    // préremplie — sans repasser par la grille en cours.
    const load = e.target.closest('[data-grid-load]');
    if (load) {
      const grid = customGrids.find((g) => g.id === load.dataset.gridLoad);
      if (!grid) return;
      gridChords = grid.chords.map((c) => gridChordFrom(c.name, c.top, c.role)).filter(Boolean);
      gridEditing = null;
      if (els.exerciseGridName) els.exerciseGridName.value = grid.name;
      renderGridChips();
      gridStatus(`« ${grid.name} » chargée : cliquez un accord pour le modifier, puis « Enregistrer ».`);
      gridKeepNextOpen = true;
      els.exerciseGridBtn?.click();
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
    const choose = e.target.closest('[data-study-select]');
    if (choose) { pickLibraryCard(choose.dataset.studySelect); return; }
    // Un clic dans la liste change seulement ce qu'on regarde. Charger une étude
    // reste un acte explicite (« Travailler »), comme pour les morceaux du Studio
    // depuis le 14/10 : un clic sélectionne, un bouton confirme.
    const card = e.target.closest('.exercise-library-card');
    if (card?.dataset.id && card.dataset.id !== librarySelected) {
      librarySelected = card.dataset.id;
      renderLibrary();
    }
  });

  // ── Démo des mouvements ──
  // [Claude] — 2026-09-24 — « Écouter le mouvement » (vue Mouvement : la carte
  // suit l'accord joué, puis revient où l'on était) et « Écouter » sur chaque
  // carte de la bibliothèque (aperçu sans rien choisir). Voicings de l'exercice,
  // sortie MIDI si elle est choisie. Style choisi par l'utilisateur, ou selon le
  // mouvement (jazz → Comping swing, gospel / worship → Gospel, « Ma grille » →
  // Ballade) ; chaque style a son tempo.
  // demoContext : { kind: 'movement', stepBefore, passingBefore } | { kind: 'preview', previewId }
  //   | { kind: 'copilot', id, tempo } | null
  let demoContext = null;
  const playingHighlights = createPlayingHighlights(document);
  demoHooks.onVisual = () => {
    if (demoContext?.kind === 'copilot') playingHighlights.show(demoContext.comparison, demoPlayer.position(), { pedal: demoContext.pedal });
  };
  let previewId = null;
  // Envoi régulier de la position de l'exemple du Copilote à sa carte (barre de lecture).
  let exampleTicker = null;
  let exampleFrame = null;

  const DEMO_STYLE_STORAGE = 'exercise-demo-style';
  let demoStyle = 'auto';
  try {
    const saved = window.localStorage?.getItem(DEMO_STYLE_STORAGE);
    if (saved && (saved === 'auto' || DEMO_STYLES[saved])) demoStyle = saved;
  } catch (e) {
    // Stockage indisponible : « Selon le mouvement ».
  }
  const resolveDemoStyle = (movementStyle) => (demoStyle === 'auto' ? defaultDemoStyle(movementStyle) : demoStyle);
  const variationSelect = document.getElementById('exercise-demo-variation');
  const variationChoices = {};
  const nextVariation = {};
  let currentVariation = null;
  try {
    const saved = JSON.parse(window.localStorage?.getItem('exercise-demo-variations') || '{}');
    for (const id of DEMO_STYLE_IDS) {
      const value = saved?.[id];
      if (value === 'cycle' || (Number.isInteger(value) && value >= 0 && value < DEMO_VARIATIONS[id].length)) variationChoices[id] = value;
    }
  } catch (_) { /* Les prises tournent automatiquement par défaut. */ }
  variationSelect?.addEventListener('change', () => {
    const id = resolveDemoStyle(practiceExercise.getState().progression?.movement?.style);
    variationChoices[id] = variationSelect.value === 'cycle' ? 'cycle' : Number(variationSelect.value);
    try { window.localStorage?.setItem('exercise-demo-variations', JSON.stringify(variationChoices)); } catch (_) { /* Séance seulement. */ }
    demoPlayer.stop();
    currentVariation = null;
    refreshDemoButtons(practiceExercise.getState());
  });
  const demoStyleSelects = [...document.querySelectorAll('[data-demo-style]')];
  function renderDemoStyleMenu(select, written) {
    const menu = written ? 'study' : 'free';
    if (select.dataset.menu !== menu) {
      select.innerHTML = written
        ? '<option value="auto">Étude écrite</option><option value="plaque">Accords seuls</option>'
        : '<option value="auto">Accompagnement automatique</option>' + DEMO_STYLE_IDS.map((id) => `<option value="${id}">${DEMO_STYLES[id].label} · ${DEMO_STYLES[id].tempo}</option>`).join('');
      select.dataset.menu = menu;
    }
    select.value = written && demoStyle !== 'plaque' ? 'auto' : demoStyle;
  }
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

  /**
   * Lance la boucle de batterie d'une démo. `name` est un genre d'étude
   * (salsa, danzon…) ou un identifiant de style (gospel, montuno…) ; sans
   * motif connu, la démo joue simplement sans batterie.
   */
  function startDemoDrums(name, tempo) {
    demoRhythm.setKit(drumKitFor(name)?name:null,tempo);
    refreshDrumsToggle();
  }

  /** Bouton « Batterie » : état visible, et libellé qui dit ce qui jouera. */
  function refreshDrumsToggle() {
    const btn = document.getElementById('exercise-demo-drums');
    if (!btn) return;
    btn.classList.toggle('is-on', drumsEnabled);
    btn.setAttribute('aria-pressed', String(drumsEnabled));
    btn.title = drumsEnabled
      ? 'Boucle de batterie allumée — cliquer pour la couper'
      : 'Boucle de batterie coupée — cliquer pour l\'allumer';
  }

  document.getElementById('exercise-demo-drums')?.addEventListener('click', () => {
    drumsEnabled = !drumsEnabled;
    // La batterie s'allume ou se coupe sans interrompre la démo en cours.
    if (drumsEnabled) syncDemoDrums(); else drumLoop.stop();
    refreshDrumsToggle();
  });
  refreshDrumsToggle();

  async function startDemo(chords, context, movementStyle, entry = null) {
    if (!chords?.length) return;
    try {
      await resumeAudio();
    } catch (err) {
      console.warn('[Démo] Audio indisponible', err);
    }
    const written = chords.every((c) => c.studyStep);
    const styleId = written ? (demoStyle === 'plaque' ? 'plaque' : 'gospel') : resolveDemoStyle(movementStyle);
    const choice = variationChoices[styleId] ?? 'cycle';
    const variation = choice === 'cycle' ? (nextVariation[styleId] || 0) : choice;
    if (choice === 'cycle') nextVariation[styleId] = (variation + 1) % DEMO_VARIATIONS[styleId].length;
    currentVariation = { styleId, variation };
    // [Claude] — 2026-11-04 — La boucle de batterie suit la démo. Pour une étude
    // écrite, c'est son GENRE qui choisit le kit (salsa, merengue, danzón…) ;
    // pour une grille libre, l'identifiant du style joué.
    const kitName = written ? (entry?.style || styleId) : styleId;
    // Deux genres imposent leur tempo (danzón, merengue) : leurs études
    // tombaient trop loin de toute boucle enregistrée, et étirer un
    // enregistrement de plus d'un quart le rend faux. Le PIANO suit ce tempo
    // aussi, sinon les deux ne seraient plus ensemble.
    const tempo = drumTempoFor(kitName) || entry?.score?.tempo || DEMO_STYLES[styleId].tempo;
    demoPlayer.play(buildDemo(chords, styleId, { variation }), { tempo });
    startDemoDrums(kitName, tempo);
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
    startDemo(exState.progression.chords, { kind: 'movement', stepBefore: exState.progression.stepIndex || 0, passingBefore: Boolean(exState.progression.onPassing) }, exState.progression.movement?.style, exState.progression.movement);
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
      : practiceExercise.previewMovement(item.id, key);
    if (chords) startDemo(chords, { kind: 'preview', previewId: id }, item.style, item);
  }

  // Notes que la démo ajoute à l'accord affiché (basse, doublure), pour la carte.
  demoHooks.cardExtras = (exState) => {
    const prog = exState.mode === 'movement' ? exState.progression : null;
    if (!prog?.chords?.length) return null;
    if (prog.movement?.score) return null;
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
    playingHighlights.clear();
    previewId = null;
    demoHooks.playingPassing = null;
    if (context?.kind === 'copilot') {
      clearInterval(exampleTicker);
      exampleTicker = null;
      cancelAnimationFrame(exampleFrame);
      exampleFrame = null;
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
    // Une démo en cours (ou en pause) s'arrête d'abord proprement (son contexte est rendu).
    if (demoPlayer.isActive()) demoPlayer.stop();
    try {
      await resumeAudio();
    } catch (err) {
      console.warn('[Copilot] Audio indisponible', err);
    }
    const tempo = example.tempo || 60;
    // [Claude] — 2026-10-04 — Avec ou sans la pédale : le choix du pianiste (onglet Copilote).
    const pedal = e.detail.pedal !== false;
    demoContext = { kind: 'copilot', id, tempo, comparison: example.comparison, pedal };
    demoPlayer.play({ events: example.events, beats: example.beats }, { tempo, pedal, rate: Number(e.detail.rate) || 1 });
    document.dispatchEvent(new CustomEvent('copilot-example-state', { detail: { id, playing: true } }));
    clearInterval(exampleTicker);
    exampleTicker = setInterval(sendExampleProgress, 250);
    sendExampleProgress();
  });
  document.addEventListener('copilot-stop-example', () => {
    if (demoContext?.kind === 'copilot') demoPlayer.stop();
  });
  // [Claude] — 2026-10-03 — La barre de lecture de l'exemple (Narcisse : « revenir en arrière
  // manuellement quand le copilote joue, un peu comme sur un lecteur ») : pause, reprise,
  // −5 s, aller à un instant. La carte reçoit la position toutes les 250 ms.
  document.addEventListener('copilot-example-control', (e) => {
    const { id, action, seconds } = e.detail || {};
    if (demoContext?.kind !== 'copilot' || demoContext.id !== id) return;
    const perBeat = 60 / demoContext.tempo;
    const at = Number(seconds);
    if (action === 'pause') demoPlayer.pause();
    else if (action === 'resume') demoPlayer.resume();
    else if (action === 'back') demoPlayer.seek(demoPlayer.position() - (at || 5) / perBeat);
    else if (action === 'seek' && Number.isFinite(at)) demoPlayer.seek(at / perBeat);
    // [Claude] — 2026-10-04 — Le curseur qu'on tire (Narcisse : « si je redescends avec le
    // curseur […], il faudrait que le jeu en bas rembobine aussi ») : le son se tait, le
    // clavier montre l'instant pointé ; au lâcher, la lecture reprend si elle jouait.
    else if (action === 'scrub' && Number.isFinite(at)) {
      if (!demoContext.scrub) demoContext.scrub = { resume: demoPlayer.isPlaying() };
      if (demoPlayer.isPlaying()) demoPlayer.pause();
      demoPlayer.seek(at / perBeat);
    } else if (action === 'scrub-end') {
      const scrub = demoContext.scrub;
      demoContext.scrub = null;
      if (scrub && Number.isFinite(at)) demoPlayer.seek(at / perBeat);
      if (scrub?.resume) demoPlayer.resume();
    } else if (action === 'pedal') {
      demoContext.pedal = e.detail.on !== false;
      demoPlayer.setPedal(demoContext.pedal);
    }
    // [Claude] — 2026-10-04 — La vitesse de l'exemple, changée en cours de lecture.
    else if (action === 'rate') demoPlayer.setRate(Number(e.detail.rate) || 1);
    sendExampleProgress();
  });
  function sendExampleProgress() {
    if (demoContext?.kind !== 'copilot' || !demoPlayer.isActive()) return;
    demoHooks.onVisual?.();
    const perBeat = 60 / demoContext.tempo;
    document.dispatchEvent(new CustomEvent('copilot-example-progress', {
      detail: {
        id: demoContext.id,
        position: demoPlayer.position() * perBeat,
        duration: demoPlayer.duration() * perBeat,
        // Pendant qu'on tire le curseur d'un exemple qui jouait, le bouton reste « Pause ».
        paused: demoPlayer.isPaused() && !demoContext.scrub?.resume,
      },
    }));
    if (demoPlayer.isPlaying()) startExampleFrames();
    else { cancelAnimationFrame(exampleFrame); exampleFrame = null; }
  }

  // Le curseur suit l'horloge du lecteur, y compris après pause, saut et changement de vitesse.
  // Les autres contrôles gardent leur cadence de 250 ms : aucun formulaire reconstruit à 60 Hz.
  function startExampleFrames() {
    if (exampleFrame !== null) return;
    exampleFrame = requestAnimationFrame(() => {
      exampleFrame = null;
      if (demoContext?.kind !== 'copilot' || !demoPlayer.isPlaying()) return;
      demoHooks.onVisual?.();
      document.dispatchEvent(new CustomEvent('copilot-example-frame', {
        detail: { id: demoContext.id, position: demoPlayer.position() * 60 / demoContext.tempo },
      }));
      startExampleFrames();
    });
  }

  // [Claude] — 2026-10-09 — La lecture en cours, dans la barre du clavier (visible de partout).
  function initDemoDock() {
    const dock = document.getElementById('keyboard-playing');
    if (!dock) return;
    const label = dock.querySelector('[data-role="label"]');
    const pauseBtn = dock.querySelector('[data-action="pause"]');
    const stopBtn = dock.querySelector('[data-action="stop"]');
    // Court : la barre du clavier est déjà chargée (le nom complet est dans l'infobulle).
    const LABELS = { copilot: ['Copilote', 'Exemple du Copilote en lecture'], movement: ['Démo', 'Démo du mouvement en lecture'], preview: ['Aperçu', 'Aperçu du mouvement en lecture'] };
    let shown = '';
    const refresh = () => {
      const active = demoPlayer.isActive() && Boolean(demoContext);
      const paused = active && demoPlayer.isPaused();
      const key = active ? `${demoContext.kind}|${paused}` : '';
      if (key === shown) return;
      shown = key;
      dock.hidden = !active;
      if (!active) return;
      const [short, full] = LABELS[demoContext.kind] || ['Lecture', 'Lecture en cours'];
      label.textContent = short;
      dock.title = full;
      dock.classList.toggle('is-paused', paused);
      pauseBtn.innerHTML = paused ? DEMO_PLAY_ICON : DEMO_PAUSE_ICON;
      pauseBtn.setAttribute('aria-label', paused ? 'Reprendre la lecture' : 'Mettre la lecture en pause');
      pauseBtn.title = paused ? 'Reprendre' : 'Pause';
    };
    pauseBtn.addEventListener('click', () => {
      if (!demoPlayer.isActive()) return;
      if (demoPlayer.isPaused()) demoPlayer.resume(); else demoPlayer.pause();
      sendExampleProgress();
      refresh();
    });
    stopBtn.addEventListener('click', () => {
      demoPlayer.stop();
      refresh();
    });
    setInterval(refresh, 250);
  }

  function refreshDemoButtons(exState) {
    const btn = document.getElementById('exercise-demo-btn');
    if (!btn) return;
    btn.hidden = exState.mode !== 'movement' || !exState.progression;
    const styleRow = document.getElementById('exercise-demo-style-row');
    if (styleRow) styleRow.hidden = btn.hidden;
    const entry = exState.progression?.movement;
    const written = Boolean(entry?.score);
    demoStyleSelects.forEach((select) => {
      const useStudy = select.id === 'exercise-library-style'
        ? ![ARCHIVE_CATEGORY, PERSO_CATEGORY].includes(libraryCategory) : written;
      renderDemoStyleMenu(select, useStudy);
    });
    // [Claude] — 2026-11-07 — #exercise-study-info (route, dessus, repères,
    // tempo de l'étude écrite) retiré sur annotation de Narcisse : le bloc qui
    // le remplissait part avec.
    // « Selon le mouvement » annonce le style qu'il donnera pour le mouvement affiché.
    const movementStyle = exState.progression?.movement?.style;
    const autoStyle = DEMO_STYLES[defaultDemoStyle(movementStyle)];
    const autoOption = document.querySelector('#exercise-demo-style option[value="auto"]');
    if (autoOption) autoOption.textContent = written ? 'Étude écrite' : `Automatique · ${autoStyle.label}`;
    const styleId = resolveDemoStyle(movementStyle);
    const style = DEMO_STYLES[styleId];
    const variations = DEMO_VARIATIONS[styleId];
    const variationRow = document.getElementById('exercise-demo-variation-row');
    if (variationRow) variationRow.hidden = btn.hidden || written || variations.length === 1;
    if (variationSelect) {
      if (variationSelect.dataset.style !== styleId) {
        variationSelect.innerHTML = '<option value="cycle">Une autre à chaque écoute</option>'
          + variations.map((v, i) => `<option value="${i}">${v.label}</option>`).join('');
        variationSelect.dataset.style = styleId;
      }
      const choice = variationChoices[styleId] ?? 'cycle';
      variationSelect.value = String(choice);
      const active = demoContext?.kind === 'movement' && currentVariation?.styleId === styleId;
      const take = choice === 'cycle' ? (active ? currentVariation.variation : nextVariation[styleId] || 0) : choice;
      const caption = document.getElementById('exercise-demo-variation-description');
      if (caption) caption.textContent = choice === 'cycle'
        ? `${active ? 'En écoute' : 'Prochaine écoute'} : ${variations[take].label}. ${variations[take].description}`
        : variations[take].description;
    }
    btn.title = written ? `Étude écrite à ${entry.score.tempo} à la noire ; les accords et leur durée sont conservés` : `Accompagnement ${style.label} (${style.tempo} à la noire)`;
    const playing = demoContext?.kind === 'movement';
    btn.classList.toggle('is-playing', playing);
    btn.innerHTML = `${playing ? DEMO_STOP_ICON : DEMO_PLAY_ICON}<span>${playing ? 'Arrêter la démo' : written ? 'Écouter l’étude' : 'Écouter la grille'}</span>`;
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
  // [Claude] — 2026-10-09 — Changer de vue ou d'onglet n'arrête PLUS la lecture (Narcisse : « quand
  // Copilote joue et que je bascule sur Temps réel, il s'arrête ; on a envie que ça continue, et
  // que ça ne s'arrête que quand c'est moi qui l'ai décidé », comme une relecture de Sessions
  // MIDI). Le clavier, l'accord et l'animation du Temps réel suivent déjà la démo (feedDemoEvent).
  // Où qu'il soit, le pianiste la met en pause ou l'arrête depuis la barre du clavier
  // (#keyboard-playing). Seul l'aperçu d'une carte s'arrête quand on ferme la bibliothèque.
  initDemoDock();
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
  // [Claude] — 2026-11-05 — Accord cible est devenu un EXPLORATEUR LIBRE :
  // Narcisse, après avoir vu la maquette (ni jauge ni bonne/mauvaise réponse) :
  // « on choisit un accord et une disposition, on écoute ». Rien n'est jugé
  // dans ce mode — jouer sur le clavier allume les touches (ailleurs dans
  // handleNoteOn, indépendant d'ici) sans score ni avancement automatique.
  // Parcours harmonique garde exactement son fonctionnement d'avant.
  if (practiceExercise.getState().mode === 'chord') return;
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
// [Claude] — 2026-10-19 — Refonte complète (Narcisse) :
//   1. Plus de fenêtre à part : un accordéon (#ai-key-panel) qui se déroule sur la page Réglages,
//      ouvert/fermé par app-settings-ai-btn (voir initAppSettings pour la coordination d'ouverture
//      depuis app-open-ai-settings, déclenché par le Copilote).
//   2. Clés enregistrées : un <select> qui liste les profils déjà sauvegardés (openai-config.js,
//      listSavedKeys/saveNamedKey/activateSavedKey/deleteSavedKey) — plus besoin de retaper une clé.
//   3. Fournisseurs présélectionnés avec un vrai bouton « Générer une clé » vers la page du
//      fournisseur (PRESETS.genUrl, EXTERNAL_PROVIDER_LINKS pour Claude/autres non pré-remplis).
function initAISettings() {
  const toggle = els.aiSettingsToggle;
  const panel = els.aiKeyPanel;
  if (!toggle || !panel) return;

  const providerGrid = document.getElementById('ai-provider-grid');
  const keysList = document.getElementById('ai-keys-list');
  const newKeyForm = document.getElementById('ai-new-key-form');

  function openExternal(url) {
    if (window.electronAPI?.openExternal) window.electronAPI.openExternal(url);
    else window.open(url, '_blank', 'noopener');
  }

  // [Claude] — 2026-11-10 — Modèle présélectionné par fournisseur (Narcisse : « je m'y connais un
  // peu, mais des pianistes basiques ne vont pas se casser la tête » — un modèle tapé à la main,
  // comme « Haiku 5.5 » au lieu du vrai identifiant, finit en erreur 404 incompréhensible). Pour un
  // fournisseur connu (PRESETS), un menu déroulant liste ses vrais modèles, « Personnalisé… » en
  // dernier ; pour un fournisseur sans préréglage (Ollama, etc., dont les noms varient trop pour
  // être prévisibles), le champ texte reste seul, comme avant.
  function populateModelOptions(baseUrl, selectedModel) {
    const select = els.aiModelSelect;
    const textInput = els.aiModel;
    if (!select || !textInput) return;
    const preset = PRESETS.find((p) => p.baseUrl === (baseUrl || '').trim());
    const models = preset?.models || [];

    select.innerHTML = '';
    for (const m of models) {
      const opt = document.createElement('option');
      opt.value = m;
      opt.textContent = m;
      select.appendChild(opt);
    }
    const customOpt = document.createElement('option');
    customOpt.value = '__custom__';
    customOpt.textContent = 'Personnalisé…';
    select.appendChild(customOpt);

    if (!models.length) {
      select.hidden = true;
      textInput.hidden = false;
      return;
    }
    select.hidden = false;
    if (models.includes(selectedModel)) {
      select.value = selectedModel;
      textInput.value = selectedModel;
      textInput.hidden = true;
    } else {
      select.value = '__custom__';
      textInput.value = selectedModel || '';
      textInput.hidden = false;
    }
  }

  els.aiModelSelect?.addEventListener('change', () => {
    const select = els.aiModelSelect;
    const textInput = els.aiModel;
    if (!select || !textInput) return;
    if (select.value === '__custom__') {
      textInput.hidden = false;
      textInput.value = '';
      textInput.focus();
    } else {
      textInput.hidden = true;
      textInput.value = select.value;
    }
  });

  // Adresse tapée/collée à la main (pas via une carte de préréglage) : si elle correspond à un
  // fournisseur connu, le menu déroulant de ses modèles apparaît aussi dans ce cas.
  els.aiBaseUrl?.addEventListener('input', () => {
    populateModelOptions(els.aiBaseUrl.value, els.aiModel?.value || '');
  });

  // [Claude] — 2026-11-10 — Narcisse : le plafond ne sert à rien (jamais appliqué nulle part,
  // jamais regardé) ; ce qui l'intéresse, c'est le vrai compte d'appels, mois par mois, en
  // graphique. monthKeyToLabel/renderUsageChart/renderUsage remplacent l'ancien "X / cap ce mois".
  const MONTH_NAMES = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sep', 'Oct', 'Nov', 'Déc'];
  function monthKeyToLabel(monthKey) {
    const [y, m] = monthKey.split('-').map(Number);
    return `${MONTH_NAMES[(m - 1 + 12) % 12]} ${y}`;
  }

  function renderUsageChart() {
    const container = els.aiUsageChart;
    if (!container) return;
    const history = getMonthlyUsageHistory();
    container.innerHTML = '';
    if (!history.length) {
      const empty = document.createElement('p');
      empty.className = 'ai-usage-chart-empty';
      empty.textContent = 'Aucun appel enregistré pour l’instant.';
      container.appendChild(empty);
      return;
    }
    // Graduée par dizaines (Narcisse) : l'échelle monte toujours au palier de 10 au-dessus du pic.
    const maxCount = Math.max(...history.map((h) => h.count));
    const scaleMax = Math.max(10, Math.ceil(maxCount / 10) * 10);
    const bars = document.createElement('div');
    bars.className = 'ai-usage-chart-bars';
    for (const { month, count } of history) {
      const col = document.createElement('div');
      col.className = 'ai-usage-chart-col';
      const countEl = document.createElement('span');
      countEl.className = 'ai-usage-chart-count';
      countEl.textContent = String(count);
      const bar = document.createElement('div');
      bar.className = 'ai-usage-chart-bar';
      bar.style.height = `${Math.max(2, Math.round((count / scaleMax) * 100))}%`;
      bar.title = `${count} appel${count > 1 ? 's' : ''}`;
      const label = document.createElement('span');
      label.className = 'ai-usage-chart-label';
      label.textContent = monthKeyToLabel(month);
      col.append(countEl, bar, label);
      bars.appendChild(col);
    }
    container.appendChild(bars);
  }

  function renderUsage() {
    const count = getMonthlyUsage();
    if (els.aiUsage) els.aiUsage.textContent = `${count} appel${count > 1 ? 's' : ''} ce mois-ci`;
    if (els.aiUsageChart && !els.aiUsageChart.hidden) renderUsageChart();
  }

  els.aiUsageHistoryToggle?.addEventListener('click', () => {
    if (!els.aiUsageChart || !els.aiUsageHistoryToggle) return;
    const opening = els.aiUsageChart.hidden;
    els.aiUsageChart.hidden = !opening;
    els.aiUsageHistoryToggle.textContent = opening ? 'Masquer l’historique' : 'Voir l’historique';
    if (opening) renderUsageChart();
  });

  async function loadConfigIntoUI() {
    const cfg = await loadSecureAIConfig();
    if (els.aiBaseUrl) els.aiBaseUrl.value = cfg.baseUrl;
    if (els.aiApiKey) els.aiApiKey.value = cfg.apiKey;
    if (els.aiModel) els.aiModel.value = cfg.model;
    populateModelOptions(cfg.baseUrl, cfg.model);
    renderUsage();
    if (els.aiTestResult) {
      els.aiTestResult.textContent = '';
      els.aiTestResult.className = 'ai-test-result';
    }
    highlightActiveProvider();
    renderSavedKeys();
  }

  function gatherConfigFromUI() {
    return {
      baseUrl: els.aiBaseUrl?.value || '',
      apiKey: els.aiApiKey?.value || '',
      model: els.aiModel?.value || '',
    };
  }

  function highlightActiveProvider() {
    if (!providerGrid) return;
    const current = (els.aiBaseUrl?.value || '').trim();
    providerGrid.querySelectorAll('.ai-provider-card[data-base-url]').forEach((card) => {
      card.classList.toggle('is-active', card.dataset.baseUrl === current);
    });
  }

  // ---- Fournisseurs présélectionnés — « proposer des clés préexistantes » ----
  function renderProviders() {
    if (!providerGrid) return;
    providerGrid.innerHTML = '';
    for (const preset of PRESETS) {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'ai-provider-card';
      card.dataset.baseUrl = preset.baseUrl;
      const name = document.createElement('span');
      name.className = 'ai-provider-card-name';
      name.textContent = preset.name;
      const blurb = document.createElement('span');
      blurb.className = 'ai-provider-card-blurb';
      blurb.textContent = preset.blurb || '';
      card.append(name, blurb);
      // [Claude] — 2026-11-10 — Narcisse : « générer une clé » renvoyait juste vers la page du
      // fournisseur sans rien remplir — « pour un pianiste, remplir l'adresse de l'API, c'est pas
      // à sa portée ». selectProviderPreset() fait ce que fait déjà le clic sur la carte
      // (adresse + modèle), que la clé soit générée ou non : les deux boutons le font maintenant.
      const selectProviderPreset = () => {
        if (els.aiBaseUrl) els.aiBaseUrl.value = preset.baseUrl;
        if (els.aiModel) els.aiModel.value = preset.models[0] || '';
        populateModelOptions(preset.baseUrl, preset.models[0] || '');
        highlightActiveProvider();
      };
      card.addEventListener('click', () => {
        selectProviderPreset();
        els.aiApiKey?.focus();
      });
      if (preset.genUrl) {
        const genBtn = document.createElement('button');
        genBtn.type = 'button';
        genBtn.className = 'ai-provider-card-gen';
        genBtn.textContent = 'Générer une clé →';
        genBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          selectProviderPreset();
          openExternal(preset.genUrl);
        });
        card.appendChild(genBtn);
      }
      providerGrid.appendChild(card);
    }
    // Fournisseurs sans préréglage utilisable ici (schéma d'appel différent) : juste un lien vers
    // leur page de clé, l'utilisateur configure l'adresse lui-même ci-dessous (« Personnalisé »).
    for (const ext of EXTERNAL_PROVIDER_LINKS) {
      const card = document.createElement('div');
      card.className = 'ai-provider-card';
      const name = document.createElement('span');
      name.className = 'ai-provider-card-name';
      name.textContent = ext.name;
      const blurb = document.createElement('span');
      blurb.className = 'ai-provider-card-blurb';
      blurb.textContent = 'Configuration manuelle ci-dessous';
      const genBtn = document.createElement('button');
      genBtn.type = 'button';
      genBtn.className = 'ai-provider-card-gen';
      genBtn.textContent = 'Générer une clé →';
      genBtn.addEventListener('click', () => openExternal(ext.genUrl));
      card.append(name, blurb, genBtn);
      providerGrid.appendChild(card);
    }
  }

  function setNewKeyFormOpen(open) {
    if (!newKeyForm) return;
    newKeyForm.hidden = !open;
  }

  // [Claude] — 2026-11-10 — Narcisse : « ajouter une clé, toutes les cases devraient
  // être vides » — avant ce lot, le formulaire gardait l'adresse/le modèle de la
  // dernière clé active ou du dernier préréglage cliqué. « + Ajouter une clé » doit
  // toujours partir d'un formulaire vierge : aucune adresse, aucun modèle, aucune clé.
  function resetNewKeyForm() {
    if (els.aiBaseUrl) els.aiBaseUrl.value = '';
    if (els.aiApiKey) els.aiApiKey.value = '';
    if (els.aiModel) els.aiModel.value = '';
    populateModelOptions('', '');
    highlightActiveProvider();
    if (els.aiTestResult) {
      els.aiTestResult.textContent = '';
      els.aiTestResult.className = 'ai-test-result';
    }
  }

  // ---- Clés enregistrées — « sélectionner une clé au lieu de la retaper » ----
  // [Claude] — 2026-10-22 — Refonte (Narcisse : « je ne sais absolument pas où
  // récupérer les clés enregistrées ») : une liste visible plutôt qu'un <select>
  // qui ne s'affichait qu'une fois une clé déjà créée.
  // [Claude] — 2026-11-10 — Deuxième refonte (Narcisse : « quand je clique sur ma clé
  // Ollama, rien ne me permet de dérouler les modèles que j'y ai déjà mis — je suis
  // obligé de tout retaper »). Cliquer une clé enregistrée déroule maintenant la liste
  // de ses modèles connus (chacun l'active d'un clic, sans rien retaper) ; « + Ajouter
  // un modèle » y ajoute un nouveau modèle à CETTE clé. « + Ajouter une clé » reste
  // réservé à une VRAIE nouvelle clé API (adresse + clé + modèle vides, voir
  // resetNewKeyForm) — Narcisse : « depuis tout à l'heure je te parle de modèle, mais
  // ajouter une clé, c'est censé ajouter une nouvelle clé API ».
  let expandedKeyId = null;

  // [Claude] — 2026-11-10 — Narcisse : « je n'ai aucun moyen de vérifier ce qui se passe, je ne
  // peux pas tester la clé si ça marche » — un champ texte vide pour un fournisseur sans
  // préréglage (Ollama…) n'aide en rien à deviner un identifiant valide.
  function allKnownModels() {
    const known = new Set();
    for (const preset of PRESETS) for (const m of preset.models) known.add(m);
    for (const k of listSavedKeys()) for (const m of k.models) known.add(m);
    return Array.from(known).sort();
  }

  // [Claude] — 2026-11-10 — Deuxième refonte : le <datalist> natif posait sa liste comme une
  // fenêtre à part, mal ancrée au défilement (Narcisse : « on a l'impression qu'elle est fixée
  // sur l'écran »), et ne montrait rien tant qu'on n'avait pas commencé à taper. Remplacé par un
  // menu maison : un simple <div> ajouté comme frère du champ, positionné juste en-dessous par
  // CSS (position:relative sur le parent direct, posée ici si l'habillage ne l'a pas déjà) — il
  // suit donc le champ normalement au défilement. Tous les modèles connus s'affichent dès le
  // clic (avant de taper quoi que ce soit), puis se filtrent en tapant ; une saisie libre reste
  // toujours acceptée pour un modèle jamais vu.
  function attachModelCombobox(input) {
    if (!input || input.dataset.comboboxAttached) return;
    input.dataset.comboboxAttached = '1';

    const wrapper = input.parentElement;
    if (wrapper && getComputedStyle(wrapper).position === 'static') {
      wrapper.style.position = 'relative';
    }
    const box = document.createElement('div');
    box.className = 'ai-model-suggest-box';
    box.hidden = true;
    wrapper ? wrapper.appendChild(box) : input.insertAdjacentElement('afterend', box);

    function render(filterText) {
      const q = filterText.trim().toLowerCase();
      const items = allKnownModels().filter((m) => !q || m.toLowerCase().includes(q));
      box.innerHTML = '';
      if (!items.length) {
        box.hidden = true;
        return;
      }
      for (const m of items) {
        const row = document.createElement('button');
        row.type = 'button';
        row.className = 'ai-model-suggest-item';
        row.textContent = m;
        // mousedown (pas click) : se déclenche AVANT le blur du champ, sinon la liste se
        // referme (et disparaît du DOM) avant que le clic sur sa ligne n'ait pu être traité.
        row.addEventListener('mousedown', (e) => {
          e.preventDefault();
          const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
          setter.call(input, m);
          input.dispatchEvent(new Event('input', { bubbles: true }));
          box.hidden = true;
        });
        box.appendChild(row);
      }
      box.hidden = false;
    }

    input.addEventListener('focus', () => render(''));
    input.addEventListener('input', () => render(input.value));
    input.addEventListener('blur', () => { box.hidden = true; });
  }

  function renderSavedKeys() {
    if (!keysList) return;
    const keys = listSavedKeys();
    const activeCfg = getAIConfig();
    keysList.innerHTML = '';

    if (keys.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'ai-keys-empty';
      empty.textContent = 'Aucune clé enregistrée pour l’instant.';
      keysList.appendChild(empty);
    }

    for (const k of keys) {
      const card = document.createElement('div');
      card.className = 'ai-key-card';

      const row = document.createElement('div');
      row.className = 'ai-key-row';
      row.classList.toggle('is-active', k.baseUrl === activeCfg.baseUrl);

      const header = document.createElement('button');
      header.type = 'button';
      header.className = 'ai-key-row-activate';
      header.innerHTML = `<span class="ai-key-row-dot" aria-hidden="true"></span><span class="ai-key-row-label">${k.label}</span>`;
      header.title = `Voir les modèles de « ${k.label} »`;
      header.setAttribute('aria-expanded', String(expandedKeyId === k.id));
      header.addEventListener('click', () => {
        expandedKeyId = expandedKeyId === k.id ? null : k.id;
        renderSavedKeys();
      });

      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'tr-icon-button ai-key-row-delete';
      del.title = `Supprimer la clé « ${k.label} »`;
      del.setAttribute('aria-label', `Supprimer la clé « ${k.label} »`);
      del.textContent = '🗑';
      del.addEventListener('click', () => {
        deleteSavedKey(k.id);
        if (expandedKeyId === k.id) expandedKeyId = null;
        renderSavedKeys();
        setStatus('Clé enregistrée supprimée.');
      });

      row.append(header, del);
      card.appendChild(row);

      if (expandedKeyId === k.id) {
        const modelsPanel = document.createElement('div');
        modelsPanel.className = 'ai-key-row-models';

        for (const m of k.models) {
          const wrap = document.createElement('span');
          wrap.className = 'ai-key-row-model';
          wrap.classList.toggle('is-active', k.baseUrl === activeCfg.baseUrl && m === activeCfg.model);

          const select = document.createElement('button');
          select.type = 'button';
          select.className = 'ai-key-row-model-select';
          select.textContent = m;
          select.title = `Utiliser « ${k.label} » avec ${m}`;
          select.addEventListener('click', async () => {
            try {
              const cfg = await activateSavedKeyModel(k.id, m);
              if (els.aiBaseUrl) els.aiBaseUrl.value = cfg.baseUrl;
              if (els.aiApiKey) els.aiApiKey.value = cfg.apiKey;
              if (els.aiModel) els.aiModel.value = cfg.model;
              populateModelOptions(cfg.baseUrl, cfg.model);
              highlightActiveProvider();
              renderSavedKeys();
              setStatus(`« ${k.label} » activée avec ${m}`);
            } catch (err) {
              setStatus(err.message);
            }
          });

          // [Claude] — 2026-11-10 — Narcisse : « faut qu'on puisse supprimer des
          // modèles aussi » — retire CE modèle de l'historique de la clé, sans
          // toucher à l'adresse ni à la clé API (removeModelFromSavedKey).
          const remove = document.createElement('button');
          remove.type = 'button';
          remove.className = 'ai-key-row-model-remove';
          remove.textContent = '×';
          remove.title = `Retirer ${m} de « ${k.label} »`;
          remove.setAttribute('aria-label', `Retirer ${m} de « ${k.label} »`);
          remove.addEventListener('click', (e) => {
            e.stopPropagation();
            removeModelFromSavedKey(k.id, m);
            renderSavedKeys();
            setStatus(`Modèle « ${m} » retiré de « ${k.label} ».`);
          });

          wrap.append(select, remove);
          modelsPanel.appendChild(wrap);
        }

        const addModelBtn = document.createElement('button');
        addModelBtn.type = 'button';
        addModelBtn.className = 'ai-key-row-model-add';
        addModelBtn.textContent = '+ Ajouter un modèle';
        addModelBtn.addEventListener('click', () => {
          addModelBtn.hidden = true;
          const input = document.createElement('input');
          input.type = 'text';
          input.className = 'ai-key-row-model-input';
          input.placeholder = 'Identifiant du modèle';
          let committed = false;
          const commit = () => {
            if (committed) return;
            committed = true;
            const value = input.value.trim();
            if (value) addModelToSavedKey(k.id, value);
            renderSavedKeys();
          };
          input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); commit(); }
            if (e.key === 'Escape') { committed = true; renderSavedKeys(); }
          });
          input.addEventListener('blur', () => { if (!committed) commit(); });
          modelsPanel.insertBefore(input, addModelBtn);
          // attachModelCombobox a besoin d'un parent réel (position:relative posée dessus) :
          // appelé seulement une fois le champ inséré dans le DOM, pas avant.
          attachModelCombobox(input);
          input.focus();
        });
        modelsPanel.appendChild(addModelBtn);

        card.appendChild(modelsPanel);
      }

      keysList.appendChild(card);
    }

    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.className = 'ai-key-add-btn';
    addBtn.textContent = keys.length ? '+ Ajouter une clé' : '+ Ajouter une première clé';
    addBtn.addEventListener('click', () => {
      const opening = newKeyForm?.hidden !== false;
      if (opening) resetNewKeyForm();
      setNewKeyFormOpen(opening);
    });
    keysList.appendChild(addBtn);

    // Premier usage (aucune clé) : le formulaire reste ouvert pour ne pas
    // cacher la seule action possible derrière un clic en plus.
    setNewKeyFormOpen(keys.length === 0);
  }

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
    renderUsage();
    if (gathered.apiKey) {
      // [Claude] — 2026-10-22 — Plus de champ « Nom » (Narcisse : inutile) ;
      // saveNamedKey() déduit déjà un nom lisible du fournisseur/de l'adresse.
      await saveNamedKey({
        baseUrl: gathered.baseUrl,
        apiKey: gathered.apiKey,
        model: gathered.model,
      });
      renderSavedKeys();
    }
    highlightActiveProvider();
    setStatus(`Paramètres IA enregistrés (${cfg.model})`);
  });

  renderProviders();
  attachModelCombobox(els.aiModel);
  initSettingsAccordion('app-settings-ai-btn', 'ai-key-panel', { onExpand: loadConfigIntoUI });
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
  safeInit('initKeyboardWheels', () => initKeyboardWheels({ onPitch: handlePitchWheel, onMod: handleModWheel }));
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
  // [Claude] — 2026-10-02 — Lecture en direct du Temps réel (roue au repos).
  safeInit('initLiveReading', initLiveReading);
  safeInit('initLiveStaff', initLiveStaff);
  // [Refonte 02/10] — Écran d'attente commun : on remplit les emplacements
  // `data-chroma-stage` (Analyse, Studio) depuis une source unique.
  safeInit('mountChromaStages', () => mountChromaStages());
  // [Claude] — 2026-10-13 — Une barre de recherche dans chaque bibliothèque (list-search.js).
  safeInit('accentTheme', () => initAccentTheme());
  safeInit('veloursAmbient', () => initVeloursAmbient());
  safeInit('librarySearches', () => {
    for (const [input, list] of [
      ['studio-library-search', 'studio-track-list'],
      ['analyzer-library-search', 'analyzer-library-list'],
      ['coach-library-search', 'coach-track-list'],
      ['copilot-history-search', 'copilot-history-list'],
    ]) attachListSearch({ input: document.getElementById(input), list: document.getElementById(list) });
  });
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
    btn.setAttribute('aria-label', btn.title);
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
// [Claude] — 2026-10-19 — Narcisse : « il faut qu'il y ait une page qui s'ouvre, et plus une
// fenêtre temporaire qui floute tout ce qui entoure ». Réglages (#app-settings-modal) a quitté
// .modal-overlay pour .app-settings-page, un enfant flex de #app positionné entre les trois
// onglets et le clavier virtuel (index.html) : elle occupe donc exactement le même espace qu'un
// onglet, sans jamais recouvrir ni dépasser le clavier. Pour que cet espace lui revienne, l'onglet
// actif doit être masqué pendant que Réglages est ouverte — sinon les deux s'empileraient. On le
// fait ici plutôt que via applyTabVisibility (tab-visibility.js) : Réglages n'est pas un onglet de
// navigation (pas de bouton dans #tab-nav, pas de TAB_NAMES), juste une page qui emprunte
// temporairement son emplacement.
const APP_SETTINGS_TAB_IDS = ['practice-tab', 'analysis-tab', 'studio-tab'];

// [Claude] — 2026-10-20 — Accordéon générique des sections de Réglages (Narcisse : « masque
// Apparence à l'aide d'un bouton Apparence, et le contenu de Clavier et MIDI aussi » — même
// mécanique que l'accordéon Assistant IA du 19/10, désormais partagée par les trois sections).
// Le bouton EST le titre de la section ; le panneau est replié par défaut (hidden) et anime sa
// hauteur via .is-open (grid-template-rows 0fr → 1fr, theme.css).
function initSettingsAccordion(toggleId, panelId, { onExpand } = {}) {
  const toggle = document.getElementById(toggleId);
  const panel = document.getElementById(panelId);
  if (!toggle || !panel) return null;

  function setExpanded(expanded) {
    toggle.setAttribute('aria-expanded', String(expanded));
    panel.hidden = !expanded;
    if (expanded) requestAnimationFrame(() => panel.classList.add('is-open'));
    else panel.classList.remove('is-open');
  }

  toggle.addEventListener('click', () => {
    const expanded = toggle.getAttribute('aria-expanded') === 'true';
    if (!expanded) onExpand?.();
    setExpanded(!expanded);
  });

  return { toggle, panel, setExpanded };
}

function initAppSettings() {
  initSettingsAccordion('settings-appearance-toggle', 'settings-appearance-panel');
  initSettingsAccordion('settings-midi-toggle', 'settings-midi-panel');

  const modal = document.getElementById('app-settings-modal');
  const toggle = document.getElementById('app-settings-toggle');
  const closeButton = document.getElementById('app-settings-close');
  const dialog = modal?.querySelector('[role="dialog"]');
  if (!modal || !toggle) return;
  let previousFocus = null;
  let hiddenTabEl = null;

  const close = (restoreFocus = true) => {
    modal.style.display = 'none';
    toggle.setAttribute('aria-expanded', 'false');
    if (hiddenTabEl) {
      hiddenTabEl.style.removeProperty('display');
      hiddenTabEl = null;
    }
    if (restoreFocus && previousFocus?.isConnected) previousFocus.focus();
  };

  // [Claude] — 2026-10-19 — Point d'entrée unique, réutilisé par le bouton d'en-tête ET par
  // app-open-ai-settings (Copilote : « Ouvrir les réglages » sur l'écran « pas de clé ») — ce
  // dernier ouvre directement sur la clé API, en dépliant l'accordéon (app-settings-ai-btn,
  // géré par initAISettings) plutôt que par une fenêtre séparée désormais inexistante.
  const open = ({ focusAI = false } = {}) => {
    previousFocus = document.activeElement;
    const activeTab = APP_SETTINGS_TAB_IDS
      .map((id) => document.getElementById(id))
      .find((el) => el && el.style.display !== 'none');
    if (activeTab) {
      activeTab.style.display = 'none';
      hiddenTabEl = activeTab;
    }
    modal.style.display = 'flex';
    toggle.setAttribute('aria-expanded', 'true');
    dialog?.focus();
    if (focusAI) {
      requestAnimationFrame(() => {
        const aiToggle = document.getElementById('app-settings-ai-btn');
        if (aiToggle && aiToggle.getAttribute('aria-expanded') !== 'true') aiToggle.click();
        aiToggle?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      });
    }
  };

  toggle.setAttribute('aria-haspopup', 'dialog');
  toggle.setAttribute('aria-expanded', 'false');
  toggle.addEventListener('click', () => open());
  document.addEventListener('app-open-ai-settings', () => open({ focusAI: true }));
  // [Claude] — 2026-10-19 — Émis par switchToTab (main.js) à chaque navigation : Réglages se
  // ferme avant que l'onglet ciblé ne redevienne visible, sinon les deux se superposent (bug
  // signalé par Narcisse : « je clique Réglages, puis Analyse — c'est là que ça casse »).
  document.addEventListener('app-settings-force-close', () => {
    if (modal.style.display === 'flex') close(false);
  });
  closeButton?.addEventListener('click', () => close());
  document.getElementById('app-settings-dismiss')?.addEventListener('click', () => close());
  modal.addEventListener('click', (e) => {
    if (e.target === modal) close();
  });
  document.addEventListener('keydown', (e) => {
    if (modal.style.display !== 'flex') return;
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopImmediatePropagation();
      close();
    } else if (e.key === 'Tab' && dialog) {
      const controls = Array.from(dialog.querySelectorAll('button, input, select, textarea, a[href], [tabindex]'))
        .filter((element) => !element.disabled && element.tabIndex >= 0 && element.getClientRects().length > 0);
      const first = controls[0];
      const last = controls.at(-1);
      if (!first) { e.preventDefault(); dialog.focus(); }
      else if (e.shiftKey && (document.activeElement === first || document.activeElement === dialog)) {
        e.preventDefault(); last.focus();
      } else if (!e.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) {
        e.preventDefault(); first.focus();
      }
    }
  }, true);
}

function initTabNavigation() {
  const tabNav = document.getElementById('tab-nav');
  const practiceTab = document.getElementById('practice-tab');
  const analysisTab = document.getElementById('analysis-tab');
  const studioTab = document.getElementById('studio-tab');

  function switchToTab(tab) {
    // [Claude] — 2026-10-19 — Bug signalé par Narcisse : cliquer un bouton de navigation
    // (Analyse, Studio…) PENDANT que Réglages est ouverte rendait l'onglet visible
    // (applyTabVisibility ci-dessous) sans jamais fermer Réglages — les deux se
    // retrouvaient visibles en même temps, chacun flex:1, se partageant l'espace au lieu
    // de l'un remplaçant l'autre. switchToTab est le point de passage unique de toute
    // navigation (clic direct sur #tab-nav ET évènement app-switch-tab) : Réglages
    // écoute ce signal pour se fermer avant que l'onglet ne redevienne visible.
    document.dispatchEvent(new CustomEvent('app-settings-force-close'));
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

  // [Claude] — 2026-11-04 — Métronome de l'en-tête : disponible depuis tous les
  // onglets, et non plus seulement dans Exercices.
  globalMetronome = initGlobalMetronome({ drumLoop, styles: drumStyles, resumeAudio });

  if (window.location.hash === '#analysis') switchToTab('analysis');
  else if (window.location.hash === '#studio') switchToTab('studio');
  else switchToTab('practice');
}

init().catch((e) => {
  console.error('[Main] Échec global de init() — l\'application n\'a pas pu démarrer complètement :', e);
});
