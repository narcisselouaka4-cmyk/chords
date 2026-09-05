import { selectMediaFile, selectAudioFile, selectVideoFile, createAudioPlayer, isSupportedMediaFile, isAudioFile, isVideoFile } from '../audio/media-engine.js';
import { globalAudioFocusManager } from '../audio/audio-focus-manager.js';
import { createAudioAnalyzer } from '../analyzer/audio-analyzer.js';
import {
  exportAnalysisToMidi,
  exportAnalysisToJson,
  exportAnalysisToText,
  computeProductStatistics,
  countManuallyEditedChords,
} from '../analyzer/analysis-export.js';
import { resolveAnalysisState, inferSourceType } from './analyzer-workflow.js';
import { miniKeyboardForNotes } from './mini-keyboard.js';
import {
  updateVoicingPreviewForChord,
  clearVoicingTextPreview,
  initVoicingStyle,
  getVoicingStyle,
  selectVoicingStyle,
  setRerenderActiveVoicing,
  renderVoicingStyleSelector,
} from './voicing-preview.js';
import { CHORD_DEFINITIONS } from '../chord-engine/chord-defs.js';
import { noteNameToPc } from '../chord-engine/intervals.js';
import { ChordEditor, makeSegmentId, NOTE_NAMES } from './chord-editor.js';
import {
  openChordEditSession,
  applyChordTargetMutation,
  resolveChordTarget,
} from './chord-edit-session.js';
import {
  getEffectiveChord,
  formatEffectiveChord,
  deriveChordDisplay,
  parseChordSymbol,
} from '../chord-engine/chord-display.js';
import {
  buildProjectPath,
  buildProjectData,
  validateProjectSchema,
  verifyAudioIdentity,
  tryApplyProjectOverrides,
  extractCachedAnalysis,
} from './chord-editor.js';
import { fitChordLabel } from './chord-label-fit.js';
import { notifyOnboarding } from './onboarding.js';
import { buildDemoFixture } from './reharmonization-demo-fixture.js';
import { buildReharmonizationViewModel, buildReharmonizationVariantsViewModel } from './reharmonization-orchestrator.js';
import { startLiveMelodyCapture } from '../melody/reharmonization-live-capture.js';
import { extractAudioMelody } from '../melody/reharmonization-audio-capture.js';
import { buildSessionMelodyWrapper } from '../melody/reharmonization-session-capture.js';
import {
  renderReharmonizationEmpty,
  renderReharmonizationLoading,
  renderReharmonizationError,
  renderReharmonizationSuccess,
  renderReharmonizationVariants,
} from './reharmonization-view.js';
import {
  initMasterclassPanel,
  renderMasterclass,
  updateAIConnected,
  setMasterclassSourceType,
} from './masterclass-panel.js';
import {
  initCorrigerPanel,
  renderCorriger,
} from './corriger-panel.js';
import './reharmonization-view.css';
import { playNote, releaseNote, resumeAudio } from '../audio/simple-synth.js';
import { buildFileContextText } from './file-context.js';
import { listTracks, loadMetadata, getOriginalPath, importToLibrary, renameTrack, deleteTrack } from './media-library.js';

const BASE_PIXELS_PER_SECOND = 80;
const MIN_BLOCK_WIDTH = 4;
const BLOCK_GAP = 4;

let timelineZoom = 1.0;

let undoStack = [];
let redoStack = [];
const MAX_UNDO = 50;

let chordEditor = null;

const els = {
  importScreen: document.getElementById('analyzer-import-screen'),
   importBtn: document.getElementById('analyzer-import-btn'),
   prepareBackBtn: document.getElementById('analyzer-prepare-back-btn'),
   videoTypeBackBtn: document.getElementById('analyzer-videotype-back-btn'),
   midiBackBtn: document.getElementById('analyzer-midi-back-btn'),
  importAudioBtn: document.getElementById('analyzer-import-audio-btn'),
  importVideoBtn: document.getElementById('analyzer-import-video-btn'),
  importMidiBtn: document.getElementById('analyzer-import-midi-btn'),
  libraryList: document.getElementById('analyzer-library-list'),
  results: document.getElementById('analyzer-results'),
  backBtn: document.getElementById('analyzer-back-btn'),
  backToImportBtn: document.getElementById('analyzer-back-to-import-btn'),

  // États du workspace (maquettes)
  statePrepare: document.getElementById('analyzer-state-prepare'),
  stateVideoType: document.getElementById('analyzer-state-video-type'),
  stateMidiRecord: document.getElementById('analyzer-state-midi-record'),
  stateResults: document.getElementById('analyzer-state-results'),
  analysisTab: document.getElementById('analysis-tab'),
  sidebar: document.getElementById('analyzer-sidebar'),

  // Préparation audio
  prepareFileName: document.getElementById('analyzer-prepare-file-name'),
  prepareFileMeta: document.getElementById('analyzer-prepare-file-meta'),
  prepareWaveform: document.getElementById('analyzer-prepare-waveform'),
  prepareRemove: document.getElementById('analyzer-prepare-file-remove'),
  launchAnalysisBtn: document.getElementById('analyzer-launch-analysis-btn'),

  // Type vidéo
  videoTypeCards: document.querySelectorAll('#analyzer-state-video-type .analyzer-video-card'),
  confirmVideoTypeBtn: document.getElementById('analyzer-confirm-video-type'),

  // Enregistrement MIDI
  midiSourceName: document.getElementById('analyzer-midi-source-name'),
  midiRecordBtn: document.getElementById('analyzer-midi-record-btn'),
  midiPauseBtn: document.getElementById('analyzer-midi-pause-btn'),
  midiStopBtn: document.getElementById('analyzer-midi-stop-btn'),
  midiTimer: document.getElementById('analyzer-midi-timer'),
  topNotesList: document.getElementById('analyzer-topnotes-list'),
  midiSourceBadge: document.getElementById('analyzer-midi-source-badge'),
  midiRecBadge: document.getElementById('analyzer-midi-rec-badge'),
  midiDurationStat: document.getElementById('analyzer-midi-duration-stat'),
  midiSegmentsStat: document.getElementById('analyzer-midi-segments-stat'),
  midiNotesStat: document.getElementById('analyzer-midi-notes-stat'),
  midiStatusBadge: document.getElementById('analyzer-midi-status-badge'),

  // Résultats réharmonisation
  resultKey: document.getElementById('analyzer-result-key'),
  resultStyle: document.getElementById('analyzer-result-style'),
  resultSource: document.getElementById('analyzer-result-source'),
  resultDuration: document.getElementById('analyzer-result-duration'),
  reharmGrid: document.getElementById('analyzer-reharm-grid'),
  summaryKey: document.getElementById('analyzer-summary-key'),
  summaryAnalysis: document.getElementById('analyzer-summary-analysis'),

  songTitle: document.getElementById('analyzer-song-title'),
  songArtist: document.getElementById('analyzer-song-artist'),
  stemBadge: document.getElementById('analyzer-stem-badge'),

  prevBtn: document.getElementById('analyzer-prev-btn'),
  skipBackBtn: document.getElementById('analyzer-skip-back-btn'),
  skipFwdBtn: document.getElementById('analyzer-skip-fwd-btn'),
  playBtn: document.getElementById('analyzer-play-btn'),
  progressTrack: document.getElementById('analyzer-progress-track'),
  progressFill: document.getElementById('analyzer-progress-fill'),
  progressThumb: document.getElementById('analyzer-progress-thumb'),
  currentTimeEl: document.getElementById('analyzer-current-time'),
  durationEl: document.getElementById('analyzer-duration'),
  mediaContext: document.getElementById('analyzer-media-context'),

  zoomSlider: document.getElementById('analyzer-zoom'),
  zoomValue: document.getElementById('analyzer-zoom-value'),

  chordTimeline: document.getElementById('analyzer-chord-timeline'),
  chordTimelineInner: document.getElementById('analyzer-chord-timeline-inner'),
  reanalyzeBtn: document.getElementById('analyzer-reanalyze-btn'),
  cachedBadge: document.getElementById('analyzer-cached-badge'),
  timelineLegend: document.getElementById('analyzer-timeline-legend'),
  hierarchyToggle: document.getElementById('analyzer-hierarchy-toggle'),
  timelineScrollLeft: document.getElementById('analyzer-timeline-scroll-left'),
  timelineScrollRight: document.getElementById('analyzer-timeline-scroll-right'),

  audioContainer: document.getElementById('analyzer-audio-container'),

  sectionTabs: document.querySelectorAll('#analyzer-section-tabs button[data-section]'),
  sectionPanels: document.querySelectorAll('#analyzer-section-panels > [data-section]'),

  exportMidiBtn: document.getElementById('analyzer-export-midi-btn'),
  exportJsonBtn: document.getElementById('analyzer-export-json-btn'),
  copyTextBtn: document.getElementById('analyzer-copy-text-btn'),
  statsContent: document.getElementById('analyzer-stats-content'),
  overviewContent: document.getElementById('analyzer-overview-content'),

  // Hero chord + inspecteur
  hero: document.getElementById('analyzer-hero'),
  heroName: document.getElementById('analyzer-hero-name'),
  heroNotes: document.getElementById('analyzer-hero-notes'),
  heroKeyboard: document.getElementById('analyzer-hero-keyboard'),
  inspectorEmpty: document.getElementById('analyzer-inspector-empty'),
  inspectorContent: document.getElementById('analyzer-inspector-content'),
  inspectorChord: document.getElementById('analyzer-inspector-chord'),
  inspectorTimes: document.getElementById('analyzer-inspector-times'),
  inspectorDetails: document.getElementById('analyzer-inspector-details'),
  inspectorEditBtn: document.getElementById('analyzer-inspector-edit-btn'),

  processing: document.getElementById('analyzer-processing'),
  processingText: document.getElementById('analyzer-processing-text'),
  processingElapsed: document.getElementById('analyzer-processing-elapsed'),

  // Panneau Réharmonisation (refonte visuelle §3.2).
  reharmRun: document.getElementById('reharm-run-btn'),
  reharmResults: document.getElementById('reharm-results'),
  reharmContextKey: document.getElementById('reharm-context-key'),
  reharmContextSource: document.getElementById('reharm-context-source'),
  reharmContextRange: document.getElementById('reharm-context-range'),
  reharmStyleSelector: document.getElementById('reharm-style-selector'),
  reharmPlayStyleSelector: document.getElementById('reharm-play-style-selector'),
  reharmMelodyStrip: document.getElementById('reharm-melody-strip'),
  reharmMelodyEmpty: document.getElementById('reharm-melody-empty'),
  reharmPostApply: document.getElementById('reharm-post-apply'),
  reharmVersionToggle: document.getElementById('reharm-version-toggle'),
  reharmAppliedContext: document.getElementById('reharm-applied-context'),
  reharmAppliedScore: document.getElementById('reharm-applied-score'),
  reharmConfirmBand: document.getElementById('reharm-confirm-band'),
  reharmRevertBtn: document.getElementById('reharm-revert-btn'),
  reharmRelistenBtn: document.getElementById('reharm-relisten-btn'),
  reharmSendTrainingBtn: document.getElementById('reharm-send-training-btn'),
  reharmCompareBtn: document.getElementById('reharm-compare-btn'),

  // Panneau Masterclass (refonte visuelle §3.3).
  masterclassEmpty: document.getElementById('masterclass-empty'),
  masterclassContent: document.getElementById('masterclass-content'),

  // Panneau Corriger (refonte visuelle §3.4).
  corrigerHeader: document.getElementById('corriger-header'),
  corrigerFilter: document.getElementById('corriger-filter'),
  corrigerMessage: document.getElementById('corriger-message'),
  corrigerList: document.getElementById('corriger-list'),
  corrigerEditor: document.getElementById('corriger-editor'),
  corrigerEditorDetected: document.getElementById('corriger-editor-detected'),
  corrigerEditorMeta: document.getElementById('corriger-editor-meta'),
  corrigerKeyboard: document.getElementById('corriger-keyboard'),
  corrigerInput: document.getElementById('corriger-input'),
  corrigerCandidates: document.getElementById('corriger-candidates'),
  corrigerListenBtn: document.getElementById('corriger-listen-btn'),
  corrigerApplyBtn: document.getElementById('corriger-apply-btn'),
  corrigerCorrectBtn: document.getElementById('corriger-correct-btn'),
  corrigerResetBtn: document.getElementById('corriger-reset-btn'),
};

let analyzer = null;
let currentPlayer = null;
let currentAnalysis = null;
let currentFileName = '';
let currentAudioPath = '';
let currentSourceType = null; // 'audio' | 'video' | 'midi'
let currentVideoType = null; // 'tutorial' | 'cover' | 'song' | 'demo'
let isDraggingProgress = false;
let lastAutoScrollIndex = -1;
let lastRenderedVoicingChord = null;
let lastRenderedVoicingStyle = null;
let selectedSegmentId = null; // segmentId sélectionné dans la timeline

// Hiérarchie visuelle structurel / passage. Le moteur qualifie chaque segment
// d'un rôle harmonique ; la timeline le traduit en poids visuel. Désactivable :
// certains utilisateurs préfèrent une grille uniforme.
let hierarchyEnabled = true;

// En dessous de cette largeur, un accord non structurel se replie en marqueur
// fin : il ne disparaît pas du modèle et reste cliquable, il cesse seulement de
// disputer la place aux piliers. C'est le « repli progressif » demandé plutôt
// qu'une suppression — zoomer les fait réapparaître.
const COLLAPSE_MIN_WIDTH_PX = 26;

// Pas de navigation rapide, en secondes.
const SKIP_SECONDS = 10;

const ROLE_LABELS = {
  structural: 'Accord structurel',
  passing: 'Accord de passage',
  uncertain: 'Détection incertaine',
  silence: 'Silence',
};

// Rôle par défaut : les analyses produites avant l'introduction du champ, et
// les segments corrigés à la main, sont traités comme structurels — un accord
// que l'utilisateur a lui-même saisi n'est jamais « incertain ».
function segmentRole(segment) {
  if (!segment) return 'structural';
  if (segment.manualOverride) return 'structural';
  const role = segment.role;
  return Object.prototype.hasOwnProperty.call(ROLE_LABELS, role) ? role : 'structural';
}

// Capture MIDI (UI) — métriques du panneau droit « État de la session ».
let midiCaptureSeconds = 0;
let midiCaptureTimer = null;
let midiCaptureRunning = false; // true pendant l'enregistrement actif
let midiSessionFinalized = false; // true après Stop : la session est terminée

// [OpenCode] — 2026-08-24 — Réharmonisation V1, Étape 1 : capture MIDI live.
// Session de capture active (instance de startLiveMelodyCapture) + dernier
// wrapper finalisé prêt à alimenter le moteur canonique. null tant qu'aucune
// capture n'a été lancée ou qu'aucune note n'a été jouée.
let reharmLiveSession = null;
let reharmLiveWrapper = null;
// [OpenCode] — 2026-08-25 — EXP-031 Tâche 3 : style de réharmonisation actif.
// 'gospel' par défaut pour préserver R1 inchangé.
let reharmActiveStyle = 'gospel';

// [Refonte visuelle 2026-09-02] — État d'une réharmonisation appliquée.
let appliedReharmonization = null; // { variantId, styleId, chords[], meta }
let timelineViewMode = 'original'; // 'original' | 'reharm'
let lastReharmVariantsVm = null;
let lastReharmMeta = null;
// 'block' (accords plaqués, comportement historique) ou 'arpeggio' (notes égrenées).
// Contrôle uniquement le bouton "▶ Écouter" — n'affecte ni Appliquer, ni Basculer.
let reharmPlayStyle = 'block';

// Retourne le style de réharmonisation actuellement sélectionné dans l'UI.
function getReharmActiveStyle() {
  if (els.reharmStyleSelector) {
    const active = els.reharmStyleSelector.querySelector('[aria-pressed="true"]');
    if (active) return active.dataset.style;
  }
  return reharmActiveStyle;
}

// Retourne l'accord affiché selon le mode timeline actuel.
function getDisplayChords() {
  if (timelineViewMode === 'reharm' && appliedReharmonization && appliedReharmonization.chords) {
    return appliedReharmonization.chords;
  }
  return currentAnalysis?.chords || [];
}

// Phase B : persistance
let projectDirty = false;
let projectPath = null;
let audioIdentity = null;
let saveStatusEl = null;
let currentProjectOrphanedOverrides = {};

export function initAnalyzerTab() {
  analyzer = createAudioAnalyzer();
  bindImportButton();
  bindPlayerControls();
  bindToolbar();
  initTimelineZoom();
  bindTimelineScroll();
  bindHierarchyToggle();
  els.reanalyzeBtn?.addEventListener('click', () => { reanalyzeCurrentTrack(); });
  bindSectionTabs();
  bindExportMidiButton();
  bindExportJsonButton();
  bindCopyTextButton();
  initChordEditor();
  initKeyboardShortcuts();
  initReharmonizationPanel();
  initMasterclassPanel(els, {
    sourceType: currentSourceType,
    onCorrect: (segment) => {
      // Basculer vers Corriger et sélectionner le segment concerné.
      activateSectionTab('corriger');
      if (segment) selectSegment(segment.segmentId);
    },
    onAskAI: (segment) => {
      activateSectionTab('corriger');
      if (segment) selectSegment(segment.segmentId);
    },
  });
  initCorrigerPanel(els, {
    getSegments: () => getDisplayChords(),
    getAnalysis: () => currentAnalysis,
    getPlayer: () => currentPlayer,
    requestPause: () => pausePlayback(),
    onSelect: (segmentId) => selectSegment(segmentId),
    onCorrected: (segmentId) => {
      markDirty();
      rerenderTimeline();
      const segment = getDisplayChords().find((s) => s.segmentId === segmentId) || null;
      renderCorriger(els, segment, currentAnalysis);
    },
    onExportMidi: () => handleExportMidi(),
    onExportJson: () => handleExportJson(),
    onCopyText: () => handleCopyText(),
  });
  refreshLibraryList();
  // [Refonte] — la bibliothèque vit maintenant dans sa propre fenêtre : elle se
  // rafraîchit à chaque ouverture, pour refléter les imports faits entretemps.
  document.addEventListener('app-library-refresh', () => refreshLibraryList());

  // [Claude] — 2026-08-08 — Enregistrement auprès du gestionnaire d’audio focus.
  // Studio et Analyse restent deux lecteurs indépendants, mais un seul workspace
  // peut produire du son à la fois.
  globalAudioFocusManager.register('analysis', {
    play: () => currentPlayer?.play(),
    pause: () => currentPlayer?.pause(),
    isPlaying: () => !!(currentPlayer && !currentPlayer.element?.paused),
  });

  initWorkspaceStates();
}

// [Claude] — 2026-08-08 — Gestion des états du workspace Analyse.
function setAnalyzerState(state) {
  const states = ['import', 'prepare', 'video-type', 'midi-record', 'results', 'analysis'];
  if (!states.includes(state)) return;

  // Réinitialiser tous les états
  els.importScreen?.classList.remove('active');
  els.statePrepare?.classList.remove('active');
  els.stateVideoType?.classList.remove('active');
  els.stateMidiRecord?.classList.remove('active');
  els.stateResults?.classList.remove('active');
  els.results?.classList.remove('active');

  // En capture MIDI, la sidebar globale « Flux d'analyse » est masquée : le
  // panneau de droite de l'état affiche les métriques de session.
  els.analysisTab?.classList.toggle('midi-capture', state === 'midi-record');

  switch (state) {
    case 'import':
      els.importScreen?.classList.add('active');
      break;
    case 'prepare':
      els.statePrepare?.classList.add('active');
      break;
    case 'video-type':
      els.stateVideoType?.classList.add('active');
      break;
    case 'midi-record':
      els.stateMidiRecord?.classList.add('active');
      break;
    case 'results':
      els.stateResults?.classList.add('active');
      break;
    case 'analysis':
      els.results?.classList.add('active');
      break;
  }
}

function initWorkspaceStates() {
  // Par défaut, l'écran d'import est visible (CSS active + setAnalyzerState au cas où)
  setAnalyzerState('import');

  // Boutons de l'écran d'accueil
  els.importAudioBtn?.addEventListener('click', () => handleImportClick('audio'));
  els.importVideoBtn?.addEventListener('click', () => handleImportClick('video'));
  els.importMidiBtn?.addEventListener('click', () => { resetAnalysisSession(); setAnalyzerState('midi-record'); });
  els.importBtn?.addEventListener('click', () => handleImportClick('audio'));

  // Préparation audio
  els.prepareRemove?.addEventListener('click', () => showImportScreen());
  els.launchAnalysisBtn?.addEventListener('click', () => {
    if (currentSourceType === 'video' && !currentVideoType) {
      setAnalyzerState('video-type');
    } else {
      launchAnalysisFromPrepare();
    }
  });

  // Type vidéo
  els.videoTypeCards?.forEach((card) => {
    card.addEventListener('click', () => {
      els.videoTypeCards.forEach((c) => c.classList.remove('selected'));
      card.classList.add('selected');
      currentVideoType = card.dataset.videoType;
      if (els.confirmVideoTypeBtn) els.confirmVideoTypeBtn.disabled = false;
    });
  });
  els.confirmVideoTypeBtn?.addEventListener('click', () => {
    if (!currentVideoType) return;
    launchAnalysisFromPrepare();
  });

  // Retour à l'accueil (« Nouvelle analyse ») : reset centralisé, jamais reload.
  els.backBtn?.addEventListener('click', resetAnalysisSession);
  els.backToImportBtn?.addEventListener('click', resetAnalysisSession);
  els.prepareBackBtn?.addEventListener('click', resetAnalysisSession);
  els.videoTypeBackBtn?.addEventListener('click', resetAnalysisSession);
  els.midiBackBtn?.addEventListener('click', resetAnalysisSession);

  // [OpenCode] — 2026-08-08 — Capture MIDI : câblage des métriques du panneau
  // droit « État de la session ». Le moteur de capture réel reste
  // src/melody/midi-capture.js ; ici on alimente l'UI (durée, badges, statut).
  els.midiRecordBtn?.addEventListener('click', startMidiCaptureUI);
  els.midiPauseBtn?.addEventListener('click', pauseMidiCaptureUI);
  els.midiStopBtn?.addEventListener('click', stopMidiCaptureUI);

  // Inspecteur
  els.inspectorEditBtn?.addEventListener('click', () => {
    if (!selectedSegmentId || !currentAnalysis) return;
    const index = currentAnalysis.chords.findIndex((s) => s.segmentId === selectedSegmentId);
    if (index >= 0) openChordEditor(index);
  });
}

// [OpenCode] — Passe corrective — Le bouton d'import global est déjà lié dans
// initWorkspaceStates (handleImportClick('audio')) ; on évite un double file
// picker. bindImportButton est conservé comme point d'accroche éventuel.
function bindImportButton() {
}

async function refreshLibraryList() {
  if (!els.libraryList) return;
  try {
    const tracks = await listTracks();
    const enriched = await Promise.all(tracks.map(async (track) => {
      try {
        const metadata = await loadMetadata(track.id);
        return { ...track, metadata };
      } catch (e) {
        return track;
      }
    }));
    renderLibraryList(enriched);
  } catch (err) {
    console.error('[Analyzer] library list failed:', err);
  }
}

function renderLibraryList(tracks) {
  if (!els.libraryList) return;
  els.libraryList.innerHTML = '';

  if (tracks.length === 0) {
    els.libraryList.innerHTML =
      '<p class="analyzer-library-empty">Aucun morceau importé pour l\'instant.</p>';
    return;
  }

  // [Refonte] — Ces lignes utilisaient des classes utilitaires Tailwind
  // pointant vers des variables inexistantes (--surface-secondary, --text-dim) :
  // elles s'affichaient donc en blanc sur fond sombre. Classes propres, mises en
  // forme dans analyse.css comme le reste de la refonte.
  for (const track of tracks) {
    const metadata = track.metadata || {};
    const displayName = metadata.name || track.id;
    const ext = (metadata.format || metadata.sourcePath?.split('.').pop() || '').toUpperCase();

    const row = document.createElement('div');
    row.className = 'analyzer-library-row';

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'analyzer-library-item';
    btn.innerHTML = `<span class="analyzer-library-name">${escapeHtml(displayName)}</span><span class="analyzer-library-ext">${ext}</span>`;
    btn.addEventListener('click', () => analyzeLibraryTrack(track));
    row.appendChild(btn);

    // Menu ⋮
    const menuContainer = document.createElement('div');
    menuContainer.className = 'analyzer-library-menu-container';

    const menuBtn = document.createElement('button');
    menuBtn.type = 'button';
    menuBtn.className = 'analyzer-library-menu-btn';
    menuBtn.textContent = '⋮';
    menuBtn.title = 'Actions';

    const menu = document.createElement('div');
    menu.className = 'analyzer-library-menu';

    // Renommer
    const renameItem = document.createElement('button');
    renameItem.type = 'button';
    renameItem.className = 'analyzer-library-menu-item';
    renameItem.innerHTML = '<span>✏️</span> Renommer';
    renameItem.addEventListener('click', () => {
      menu.classList.remove('open');
      promptRenameTrack(track, displayName);
    });
    menu.appendChild(renameItem);

    // Supprimer
    const deleteItem = document.createElement('button');
    deleteItem.type = 'button';
    deleteItem.className = 'analyzer-library-menu-item danger';
    deleteItem.innerHTML = '<span>🗑️</span> Supprimer';
    deleteItem.addEventListener('click', () => {
      menu.classList.remove('open');
      confirmDeleteTrack(track, displayName);
    });
    menu.appendChild(deleteItem);

    // Toggle menu au clic sur ⋮ — détection d'espace pour ouvrir vers le haut
    // si le menu dépasserait le bas de la zone visible.
    menuBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      // Fermer tous les autres menus
      document.querySelectorAll('.analyzer-library-menu.open').forEach(m => {
        if (m !== menu) m.classList.remove('open');
      });
      const willOpen = !menu.classList.contains('open');
      if (willOpen) {
        // Calculer l'espace disponible sous le bouton
        const btnRect = menuBtn.getBoundingClientRect();
        const viewportHeight = window.innerHeight;
        const estimatedMenuHeight = 90; // 2 items × ~45px chacun
        const spaceBelow = viewportHeight - btnRect.bottom;
        if (spaceBelow < estimatedMenuHeight) {
          menu.classList.add('up');
        } else {
          menu.classList.remove('up');
        }
      }
      menu.classList.toggle('open');
    });

    // Fermer le menu si on clique ailleurs
    document.addEventListener('click', function closeMenu(e) {
      if (!menuContainer.contains(e.target)) {
        menu.classList.remove('open');
      }
    });

    menuContainer.appendChild(menuBtn);
    menuContainer.appendChild(menu);
    row.appendChild(menuContainer);
    els.libraryList.appendChild(row);
  }
}

async function promptRenameTrack(track, currentName) {
  const newName = await showRenameModal(currentName);
  if (!newName || newName.trim() === '' || newName.trim() === currentName) return;
  try {
    await renameTrack(track.id, newName.trim());
    await refreshLibraryList();
  } catch (err) {
    console.error('[Analyzer] rename failed:', err);
    alert(`Erreur lors du renommage : ${err.message}`);
  }
}

async function confirmDeleteTrack(track, displayName) {
  const confirmed = await showDeleteModal(displayName);
  if (!confirmed) return;
  try {
    await deleteTrack(track.id);
    await refreshLibraryList();
  } catch (err) {
    console.error('[Analyzer] delete failed:', err);
    alert(`Erreur lors de la suppression : ${err.message}`);
  }
}

// ── Modales bibliothèque ──

function showRenameModal(currentName) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'analyzer-modal-overlay';
    overlay.innerHTML = `
      <div class="analyzer-modal">
        <h3 class="analyzer-modal-title">Renommer le morceau</h3>
        <div class="analyzer-modal-body">
          <label class="analyzer-modal-label" for="analyzer-rename-input">Nouveau nom</label>
          <input type="text" id="analyzer-rename-input" class="analyzer-modal-input" value="${escapeHtml(currentName)}" autofocus />
        </div>
        <div class="analyzer-modal-actions">
          <button type="button" class="btn-secondary btn-sm analyzer-modal-cancel">Annuler</button>
          <button type="button" class="btn-primary btn-sm analyzer-modal-confirm">Enregistrer</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    const input = overlay.querySelector('#analyzer-rename-input');
    const confirmBtn = overlay.querySelector('.analyzer-modal-confirm');
    const cancelBtn = overlay.querySelector('.analyzer-modal-cancel');

    const cleanup = () => {
      overlay.removeEventListener('click', onOverlayClick);
      overlay.remove();
    };

    const submit = () => {
      const value = input.value.trim();
      cleanup();
      resolve(value || null);
    };

    const cancel = () => {
      cleanup();
      resolve(null);
    };

    const onOverlayClick = (e) => {
      if (e.target === overlay) cancel();
    };

    confirmBtn.addEventListener('click', submit);
    cancelBtn.addEventListener('click', cancel);
    overlay.addEventListener('click', onOverlayClick);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') submit();
      if (e.key === 'Escape') cancel();
    });

    // Focus automatique
    requestAnimationFrame(() => {
      input.focus();
      input.select();
    });
  });
}

function showDeleteModal(displayName) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'analyzer-modal-overlay';
    overlay.innerHTML = `
      <div class="analyzer-modal">
        <h3 class="analyzer-modal-title">Supprimer le morceau</h3>
        <div class="analyzer-modal-body">
          <p class="analyzer-modal-text">Supprimer définitivement <strong>${escapeHtml(displayName)}</strong> ?</p>
          <p class="analyzer-modal-hint">Cette action est irréversible.</p>
        </div>
        <div class="analyzer-modal-actions">
          <button type="button" class="btn-secondary btn-sm analyzer-modal-cancel">Annuler</button>
          <button type="button" class="btn-danger btn-sm analyzer-modal-confirm">Supprimer</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    const confirmBtn = overlay.querySelector('.analyzer-modal-confirm');
    const cancelBtn = overlay.querySelector('.analyzer-modal-cancel');

    const cleanup = () => {
      overlay.removeEventListener('click', onOverlayClick);
      overlay.remove();
    };

    const submit = () => {
      cleanup();
      resolve(true);
    };

    const cancel = () => {
      cleanup();
      resolve(null);
    };

    const onOverlayClick = (e) => {
      if (e.target === overlay) cancel();
    };

    confirmBtn.addEventListener('click', submit);
    cancelBtn.addEventListener('click', cancel);
    overlay.addEventListener('click', onOverlayClick);
    overlay.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') cancel();
    });

    // Focus sur le bouton Annuler par défaut (sécurité)
    requestAnimationFrame(() => cancelBtn.focus());
  });
}

// [OpenCode] — Passe corrective — Pipeline d'import unifié.
// `loadAnalysisSource` est le SEUL point d'entrée pour charger une source
// (choix depuis le file picker OU depuis la bibliothèque). La bibliothèque
// réutilise exactement le même chemin d'état que l'import manuel :
//   MP3/WAV → AUDIO_PREP (état 'prepare')
//   MP4/M4V/MOV/WEBM → VIDEO_TYPE_SELECTION (état 'video-type')
// Aucun pipeline parallèle entre manuel et bibliothèque.
async function loadAnalysisSource(sourceType, filePath, fileName) {
  if (!filePath) return;
  currentAudioPath = filePath;
  currentFileName = fileName || filePath.split('/').pop() || filePath.split('\\').pop() || filePath;
  currentSourceType = sourceType;

  // Discrimination audio/vidéo par extension (auto-détection fiable du format).
  const ext = (filePath.split('.').pop() || '').toLowerCase();
  currentSourceType = inferSourceType(ext, currentSourceType);
  setMasterclassSourceType(currentSourceType);

  // Un morceau déjà analysé revient directement à ses résultats : l'analyse
  // est relue depuis le projet .pjc.json plutôt que recalculée. Exigence du
  // niveau 6 de la Definition of Done.
  if (await restoreSavedAnalysis(filePath)) return;

  const target = resolveAnalysisState(ext, currentSourceType);
  if (target === 'video-type') {
    // La vidéo passe directement à la sélection de type (HOME → Vidéo → choix).
    currentVideoType = null;
    if (els.videoTypeCards) {
      els.videoTypeCards.forEach((c) => c.classList.remove('selected'));
    }
    if (els.confirmVideoTypeBtn) els.confirmVideoTypeBtn.disabled = true;
    setAnalyzerState('video-type');
  } else {
    showPrepareScreen();
  }
}

async function handleImportClick(sourceType = 'audio') {
  if (analysisRunning) {
    showToast('Une analyse est en cours : attendez qu’elle se termine avant d’importer.', 4000, 'warning');
    return;
  }
  try {
    // Filtre strict : le file picker natif n'accepte que les formats du type demandé.
    const filePath = sourceType === 'video'
      ? await selectVideoFile()
      : await selectAudioFile();
    if (!filePath) return;

    // Validation défensive : refuser un format qui aurait contourné le filtre natif.
    if (sourceType === 'video' && !isVideoFile(filePath)) {
      alert('Format non supporté pour la vidéo. Seuls les fichiers .mp4 sont acceptés.');
      return;
    }
    if (sourceType === 'audio' && !isAudioFile(filePath)) {
      alert('Format non supporté pour l\'audio. Formats acceptés : MP3, WAV, M4A.');
      return;
    }

    loadAnalysisSource(sourceType, filePath);
  } catch (err) {
    console.error('[Analyzer] import failed:', err);
    alert(`Erreur d'import : ${err.message}`);
  }
}

// [OpenCode] — Passe corrective — Bibliographie réutilise le pipeline d'import.
async function analyzeLibraryTrack(track) {
  if (analysisRunning) {
    showToast('Une analyse est en cours : attendez qu’elle se termine.', 4000, 'warning');
    return;
  }
  try {
    const originalPath = await getOriginalPath(track.id);
    if (!originalPath) {
      alert('Fichier original introuvable.');
      return;
    }
    // Gestion propre des entrées orphelines (fichier supprimé).
    const exists = await window.electronAPI?.files?.exists?.(originalPath);
    if (exists === false) {
      alert('Fichier introuvable dans la bibliothèque. Réimportez-le.');
      return;
    }
    const name = track.metadata?.name || track.id;
    const sourceType = inferSourceType(originalPath, 'audio');
    resetAnalysisSession();
    loadAnalysisSource(sourceType, originalPath, name);
  } catch (err) {
    console.error('[Analyzer] library track load failed:', err);
    alert(`Erreur de chargement : ${err.message}`);
  }
}

function showPrepareScreen() {
  selectedSegmentId = null;
  setAnalyzerState('prepare');

  // Audio : la case fichier reprend les métadonnées disponibles.
  if (currentSourceType === 'video') {
    // La vidéo est routée directement vers la sélection de type par
    // loadAnalysisSource ; on ne passe pas par showPrepareScreen.
    return;
  }
  if (currentSourceType === 'audio' && currentAudioPath) {
    if (els.prepareFileName) els.prepareFileName.textContent = currentFileName || '—';
    const ext = (currentAudioPath.split('.').pop() || '').toUpperCase();
    const metaParts = [];
    if (ext) metaParts.push(ext);
    if (currentAnalysis?.duration) metaParts.push(formatTime(currentAnalysis.duration));
    if (els.prepareFileMeta) els.prepareFileMeta.textContent = metaParts.join(' · ') || '—';
  }

  // La waveform n'est pas encore extraite ici : message honnête.
  if (els.prepareWaveform) {
    els.prepareWaveform.innerHTML = `<span class="analyzer-waveform-hint">Waveform disponible après lancement de l'analyse</span>`;
  }
}

/**
 * Tente de rouvrir un morceau depuis son analyse enregistrée.
 *
 * Retourne true si les résultats ont été affichés sans relancer l'analyse.
 * Toute anomalie — projet absent, illisible, d'un autre schéma, fichier audio
 * modifié depuis — fait retomber silencieusement sur le flux normal : la
 * restauration est une optimisation, jamais un point de défaillance.
 */
async function restoreSavedAnalysis(filePath) {
  const files = window.electronAPI?.files;
  const path = buildProjectPath(filePath);
  if (!files?.readFile || !path) return false;

  try {
    if (!(await files.exists(path))) return false;
    const data = safeJsonParse(await files.readFile(path));
    if (!validateProjectSchema(data)) return false;

    const cached = extractCachedAnalysis(data);
    if (!cached) return false; // projet en schéma 1 : analyse à refaire

    // Le fichier audio a-t-il changé depuis l'enregistrement ? Si oui, les
    // temps de l'analyse ne décrivent plus ce fichier : on ne restaure pas.
    const stat = await getAudioStat(filePath);
    if (stat && data.audio) {
      const current = buildAudioIdentity(filePath, { duration: cached.duration }, stat);
      if (!verifyAudioIdentity(data.audio, current)) {
        showToast(
          "Le fichier audio a changé depuis la dernière analyse : nouvelle analyse nécessaire.",
          6000,
          'warning',
        );
        return false;
      }
    }

    showProcessing('Chargement de l’analyse enregistrée…');
    const playback = await window.electronAPI?.analyzer?.preparePlayback?.(filePath);
    if (!playback?.wavPath) {
      hideProcessing();
      return false;
    }

    const analysis = {
      ...cached,
      wavPath: playback.wavPath,
      duration: cached.duration ?? playback.duration ?? 0,
      restoredFromProject: true,
    };
    if (analysis.videoType) currentVideoType = analysis.videoType;

    currentAnalysis = analysis;
    await showResults(analysis);
    showToast('Analyse enregistrée rechargée — aucun recalcul.', 4000);
    return true;
  } catch (err) {
    console.warn('[Analyzer] restauration impossible, analyse normale :', err);
    hideProcessing();
    return false;
  }
}

/** Relance une analyse complète sur le morceau courant, en écrasant le cache. */
async function reanalyzeCurrentTrack() {
  if (!currentAudioPath) return;
  const hasEdits = (currentAnalysis?.chords || []).some((seg) => seg.manualOverride);
  if (hasEdits && !window.confirm(
    'Relancer l’analyse va recalculer tous les accords. '
    + 'Vos corrections manuelles seront réappliquées quand le segment correspondant existe encore, '
    + 'et conservées de côté sinon. Continuer ?',
  )) return;
  await launchAnalysisFromPrepare();
}

// [Refonte 2026-09-02] — Une seule analyse à la fois.
//
// L'analyse est une opération lourde : ffmpeg, librosa, le moteur de basse,
// trois processus Python et un WAV décompressé, soit près d'une minute de CPU
// plein pour une minute et demie d'audio. Rien n'empêchait jusqu'ici d'en
// lancer plusieurs : l'overlay masquait le bouton « Lancer l'analyse » mais ne
// le désactivait pas, et un bouton visuellement recouvert reste **activable au
// clavier** — la répétition automatique d'une touche Entrée maintenue suffisait
// à empiler les analyses. Les traces laissées dans /tmp en portaient la marque :
// 25 pipelines démarrés en 30 secondes, à 18 ms d'intervalle.
//
// On garde donc l'état ici, on désactive réellement les commandes concernées, et
// le processus principal applique le même verrou de son côté.
let analysisRunning = false;
let processingTimer = null;
let processingStartedAt = 0;

/** Active ou désactive les commandes qui déclencheraient une seconde analyse. */
function setAnalysisControlsDisabled(disabled) {
  const controls = [
    els.launchAnalysisBtn,
    els.reanalyzeBtn,
    els.confirmVideoTypeBtn,
    els.importAudioBtn,
    els.importVideoBtn,
    els.importBtn,
  ];
  for (const el of controls) {
    if (!el) continue;
    el.disabled = disabled;
    el.setAttribute('aria-disabled', String(disabled));
  }
}

async function launchAnalysisFromPrepare() {
  if (!currentAudioPath) return;
  if (analysisRunning) {
    showToast('Une analyse est déjà en cours.', 3000, 'warning');
    return;
  }
  analysisRunning = true;
  setAnalysisControlsDisabled(true);
  showProcessing('Extraction audio en cours…', { withElapsed: true });
  try {
    const analysis = await analyzer.analyze(currentAudioPath);
    currentAnalysis = analysis;
    // Enregistrer le type vidéo dans l'analyse si pertinent.
    if (currentSourceType === 'video' && currentVideoType) {
      analysis.videoType = currentVideoType;
    }
    await showResults(analysis);
    // Ajouter à la bibliothèque en arrière-plan.
    importToLibrary(currentAudioPath).then(() => refreshLibraryList()).catch((e) => {
      console.warn('[Analyzer] library import failed:', e);
    });
  } catch (err) {
    console.error('[Analyzer] analysis failed:', err);
    hideProcessing();
    alert(`Erreur d'analyse : ${err.message}`);
  } finally {
    analysisRunning = false;
    setAnalysisControlsDisabled(false);
  }
}

/**
 * Affiche l'écran d'attente.
 * @param {string} text
 * @param {{withElapsed?: boolean}} [opts] — affiche le temps écoulé : une
 *   analyse peut durer plusieurs minutes, un compteur qui avance est la seule
 *   preuve visible que l'application n'est pas figée.
 */
function showProcessing(text, opts = {}) {
  els.processingText.textContent = text;
  els.processing.style.display = 'flex';
  if (processingTimer) clearInterval(processingTimer);
  processingTimer = null;
  if (els.processingElapsed) els.processingElapsed.textContent = '';
  if (!opts.withElapsed) return;
  processingStartedAt = Date.now();
  const tick = () => {
    if (!els.processingElapsed) return;
    const s = Math.round((Date.now() - processingStartedAt) / 1000);
    const mm = String(Math.floor(s / 60)).padStart(2, '0');
    const ss = String(s % 60).padStart(2, '0');
    els.processingElapsed.textContent = `Temps écoulé ${mm}:${ss}`;
  };
  tick();
  processingTimer = setInterval(tick, 1000);
}

function hideProcessing() {
  els.processing.style.display = 'none';
  if (processingTimer) {
    clearInterval(processingTimer);
    processingTimer = null;
  }
  if (els.processingElapsed) els.processingElapsed.textContent = '';
}

async function showResults(analysis) {
  hideProcessing();
  setAnalyzerState('analysis');
  currentAnalysis = analysis;
  selectedSegmentId = null;
  clearInspector();
  // Lot B — contexte fichier explicite : « Fichier analysé : <nom> ».
  updateAnalyzerFileContext(currentFileName);
  enrichSegments(analysis.chords);
  resetUndoRedo();
  chordEditor?.close();
  resetZoom();
  lastRenderedVoicingChord = null;
  lastRenderedVoicingStyle = null;

  initVoicingStyle();
  setRerenderActiveVoicing(() => {
    lastRenderedVoicingChord = null;
    lastRenderedVoicingStyle = null;
    if (currentPlayer) {
      updatePlaybackPosition(currentPlayer.element?.currentTime ?? 0);
    }
  });

  renderHeader(analysis);
  addSaveIndicator();
  await loadProjectIfExists();

  if (currentPlayer) {
    currentPlayer.destroy();
    currentPlayer = null;
  }

  if (analysis.wavPath) {
    const blobUrl = await loadAudioBlobUrl(analysis.wavPath);
    currentPlayer = createAudioPlayer(els.audioContainer, blobUrl, {
      onTimeUpdate: updatePlaybackPosition,
    });
  }

  renderTimeline(analysis.chords || [], analysis.duration || 0);
  updatePlayButton();
  renderStats(analysis);
  renderOverview(analysis);
  renderResultsSidebar(analysis);

  // Première grille d'accords affichée : c'est le moment où expliquer Chordify
  // a un sens, puisque ses éléments existent enfin à l'écran.
  notifyOnboarding('chordify', 'first-results');

  // Une analyse fraîche est enregistrée aussitôt : sans cela le cache
  // n'existerait jamais et la réouverture relancerait tout. Placé après
  // loadProjectIfExists pour ne pas écraser les corrections déjà connues.
  if (!analysis.restoredFromProject) {
    saveProject({ silent: true }).catch((err) => {
      console.warn('[Analyzer] enregistrement automatique impossible :', err);
    });
  }
}

function renderHeader(analysis) {
  const baseName = currentFileName.replace(/\.[^.]+$/, '') || 'Morceau importé';
  els.songTitle.textContent = baseName;
  els.songArtist.textContent = 'Import local';

  if (analysis.usedPianoStem) {
    els.stemBadge.textContent = 'Analyse piano isolé';
    els.stemBadge.classList.add('visible');
  } else {
    els.stemBadge.textContent = '';
    els.stemBadge.classList.remove('visible');
  }

  // L'utilisateur doit savoir s'il regarde un résultat frais ou relu : sans
  // cette indication, « pourquoi l'analyse n'a pas changé » devient un mystère.
  if (els.cachedBadge) {
    els.cachedBadge.style.display = analysis.restoredFromProject ? '' : 'none';
  }
}

// [P0 Analyse] — Reset centralisé de la session Analyse.
// Utilisé par « Nouvelle analyse » / Retour. Stoppe le lecteur, libère les
// références média temporaires, nettoie l'état, remet la machine d'état à
// HOME. Ne touche en aucun cas au Studio ni à Electron (pas de reload).
export function resetAnalysisSession() {
  if (currentPlayer) {
    currentPlayer.destroy();
    currentPlayer = null;
  }
  hideProcessing();
  currentAnalysis = null;
  currentFileName = '';
  currentAudioPath = '';
  currentSourceType = null;
  setMasterclassSourceType('audio');
  currentVideoType = null;
  selectedSegmentId = null;
  clearInspector();
  resetProjectState();
  resetUndoRedo();
  chordEditor?.close();
  lastRenderedVoicingChord = null;
  lastRenderedVoicingStyle = null;
  els.chordTimelineInner.innerHTML = '';
  if (els.hero) els.hero.style.display = 'none';
  clearVoicingTextPreview();
  if (els.overviewContent) els.overviewContent.innerHTML = '';
  els.stemBadge.textContent = '';
  els.stemBadge.classList.remove('visible');
  // Retour à l’état vide explicite quand aucun fichier n’est analysé.
  updateAnalyzerFileContext('');
  resetMidiMetricsUI();
  setAnalyzerState('import');
  refreshLibraryList();
}

function showImportScreen() {
  resetAnalysisSession();
}

// ── Capture MIDI (UI) : métriques du panneau droit « État de la session » ──
function resetMidiMetricsUI() {
  clearMidiCaptureTimer();
  midiCaptureSeconds = 0;
  midiCaptureRunning = false;
  midiSessionFinalized = false;
  if (els.midiTimer) els.midiTimer.textContent = formatTime(0);
  if (els.midiDurationStat) els.midiDurationStat.textContent = formatTime(0);
  if (els.midiSegmentsStat) els.midiSegmentsStat.textContent = '0';
  if (els.midiNotesStat) els.midiNotesStat.textContent = '0';
  setMidiBadge(els.midiSourceBadge, 'Connectée', 'connected');
  setMidiBadge(els.midiRecBadge, 'Inactif', '');
  setMidiBadge(els.midiStatusBadge, 'Prêt', 'ready');
  els.stateMidiRecord?.classList.remove('recording');
}

function startMidiCaptureUI() {
  // Si une session précédente a été finalisée (Stop), on repart à zéro.
  if (midiSessionFinalized) {
    resetMidiMetricsUI();
  }
  clearMidiCaptureTimer();
  midiCaptureRunning = true;
  midiSessionFinalized = false;
  els.stateMidiRecord?.classList.add('recording');
  setMidiBadge(els.midiRecBadge, 'En cours', 'recording');
  setMidiBadge(els.midiStatusBadge, 'Enregistrement', 'recording');
  midiCaptureTimer = setInterval(() => {
    midiCaptureSeconds += 1;
    const t = formatTime(midiCaptureSeconds);
    if (els.midiTimer) els.midiTimer.textContent = t;
    if (els.midiDurationStat) els.midiDurationStat.textContent = t;
  }, 1000);

  // [OpenCode] — 2026-08-24 — Démarre une capture de mélodie live pour la
  // réharmonisation. On nettoie tout wrapper précédent : un nouvel
  // enregistrement invalide l'ancien.
  try {
    if (reharmLiveSession) reharmLiveSession.unsubscribe();
    reharmLiveSession = startLiveMelodyCapture({ name: 'Mélodie live (session Analyse)' });
    reharmLiveWrapper = null;
    if (els.reharmLiveStatus) {
      els.reharmLiveStatus.textContent = 'Capture en cours… jouez votre mélodie.';
    }
    if (els.reharmLive) els.reharmLive.disabled = true;
  } catch (err) {
    console.warn('[Analyse] capture live échouée:', err);
    reharmLiveSession = null;
  }
}

function pauseMidiCaptureUI() {
  clearMidiCaptureTimer();
  midiCaptureRunning = false;
  setMidiBadge(els.midiRecBadge, 'En pause', '');
  setMidiBadge(els.midiStatusBadge, 'En pause', '');
}

function stopMidiCaptureUI() {
  // Arrêter le timer et figer les métriques.
  clearMidiCaptureTimer();
  const kept = midiCaptureSeconds;
  midiCaptureRunning = false;
  midiSessionFinalized = true;

  // Conserver les données capturées (ne pas les remettre à zéro).
  if (kept > 0 && els.midiDurationStat) els.midiDurationStat.textContent = formatTime(kept);
  if (els.midiTimer) els.midiTimer.textContent = formatTime(kept);

  // Badges : session terminée.
  els.stateMidiRecord?.classList.remove('recording');
  setMidiBadge(els.midiRecBadge, 'Terminé', '');
  setMidiBadge(els.midiStatusBadge, 'Session terminée', 'ready');

  // [OpenCode] — 2026-08-24 — Finalise la capture live et stocke le wrapper
  // canonique { track, harmonicContext }. Active le bouton « Réharmoniser ma
  // mélodie » si la capture a produit au moins une note.
  if (reharmLiveSession) {
    try {
      const result = reharmLiveSession.finalize();
      if (result.status === 'success' && result.wrapper) {
        reharmLiveWrapper = result.wrapper;
        if (els.reharmLive) els.reharmLive.disabled = false;
        if (els.reharmLiveStatus) {
          els.reharmLiveStatus.textContent =
            `${result.noteCount} note(s) capturée(s). Cliquez sur « Réharmoniser ma mélodie ».`;
        }
      } else {
        if (els.reharmLive) els.reharmLive.disabled = true;
        if (els.reharmLiveStatus) {
          els.reharmLiveStatus.textContent = result.message || 'Capture vide.';
        }
      }
    } catch (err) {
      console.warn('[Analyse] finalisation live échouée:', err);
      if (els.reharmLiveStatus) {
        els.reharmLiveStatus.textContent = 'Erreur de finalisation de la capture.';
      }
    } finally {
      reharmLiveSession = null;
    }
  }
}

function setMidiBadge(el, text, modifier) {
  if (!el) return;
  el.textContent = text;
  el.classList.remove('connected', 'ready', 'recording');
  if (modifier) el.classList.add(modifier);
}

function clearMidiCaptureTimer() {
  if (midiCaptureTimer) {
    clearInterval(midiCaptureTimer);
    midiCaptureTimer = null;
  }
}

// Lot B — affiche « Fichier analysé : <nom> » ou « Aucun fichier analysé ».
function updateAnalyzerFileContext(fileName) {
  if (!els.mediaContext) return;
  els.mediaContext.textContent = buildFileContextText({ tab: 'analyzer', fileName: fileName || '' });
}

function formatTime(seconds) {
  const total = Math.max(0, Math.floor(seconds));
  const m = String(Math.floor(total / 60)).padStart(2, '0');
  const s = String(total % 60).padStart(2, '0');
  return `${m}:${s}`;
}

function chordNotes(chordName) {
  if (!chordName || chordName === 'N') return [];
  const slashIdx = chordName.indexOf('/');
  const namePart = slashIdx >= 0 ? chordName.slice(0, slashIdx) : chordName;
  const rootMatch = namePart.match(/^([A-G][#b]?)/);
  if (!rootMatch) return [];
  const rootPc = noteNameToPc(rootMatch[1]);
  if (rootPc === null) return [];

  const suffix = namePart.slice(rootMatch[1].length).trim();
  const def = CHORD_DEFINITIONS.find((d) => d.symbol === suffix && !d.parentSymbol);
  const intervals = def ? def.intervals : [0, 4, 7];

  const chordPcs = intervals.map((i) => (rootPc + i) % 12);

  if (slashIdx >= 0) {
    const bassStr = chordName.slice(slashIdx + 1).trim();
    const bassPc = noteNameToPc(bassStr);
    if (bassPc != null) {
      chordPcs.push(bassPc % 12);
    }
  }

  return [...new Set(chordPcs)];
}

function enrichSegments(chords) {
  if (!chords) return;
  for (const seg of chords) {
    if (!seg.segmentId) seg.segmentId = makeSegmentId(seg);
    if (!Object.prototype.hasOwnProperty.call(seg, 'manualOverride')) {
      seg.manualOverride = null;
    }
  }
}

function resetUndoRedo() {
  undoStack = [];
  redoStack = [];
}

function pushUndo(action) {
  undoStack.push(action);
  redoStack.length = 0;
  if (undoStack.length > MAX_UNDO) undoStack.shift();
}

function undo() {
  const cmd = undoStack.pop();
  if (!cmd) return;
  const seg = currentAnalysis?.chords?.[cmd.segmentIndex];
  if (!seg) return;
  seg.manualOverride = cmd.oldState;
  redoStack.push(cmd);
  rerenderTimeline();
}

function redo() {
  const cmd = redoStack.pop();
  if (!cmd) return;
  const seg = currentAnalysis?.chords?.[cmd.segmentIndex];
  if (!seg) return;
  seg.manualOverride = cmd.newState;
  undoStack.push(cmd);
  rerenderTimeline();
}

function rerenderTimeline() {
  if (currentAnalysis) {
    renderTimeline(getDisplayChords(), currentAnalysis.duration || 0);
  }
}

// Lot C — applique un override UNIQUEMENT sur la cible d'édition capturée
// (descripteur { segmentId }). Résolution par identité stable, jamais par
// l'index d'origine ni par l'état de lecture courant. Si la cible a disparu,
// la mutation est refusée sans modifier un autre segment et sans erreur.
function applyChordOverride(target, override) {
  if (!currentAnalysis || !target) return;
  const mutation = applyChordTargetMutation(currentAnalysis.chords, target, override);
  if (!mutation.ok) {
    showToast("L'accord ciblé n'est plus disponible. Aucune modification appliquée.", 3000, 'warning');
    return;
  }
  pushUndo({ segmentIndex: mutation.index, oldState: mutation.oldValue, newState: mutation.newValue });
  markDirty();
  rerenderTimeline();
}

function initChordEditor() {
  chordEditor = new ChordEditor({
    onSave: (target, override) => {
      applyChordOverride(target, override);
    },
    onCancel: () => {
      // Rien à faire — l'éditeur est fermé
    },
    onReset: (target) => {
      applyChordOverride(target, null);
    },
  });
}

// Lot C — la lecture est-elle active ?
function isPlaybackActive() {
  return !!(currentPlayer && currentPlayer.element && !currentPlayer.element.paused);
}

// Lot C — met la lecture en pause (sans effet si déjà en pause). Ne relance
// jamais la lecture.
function pausePlayback() {
  if (currentPlayer && !currentPlayer.element?.paused) {
    currentPlayer.pause();
  }
  updatePlayButton();
}

function initKeyboardShortcuts() {
  document.addEventListener('keydown', (e) => {
    if (chordEditor?.isOpen) {
      if (e.key === 'Escape') {
        e.preventDefault();
        chordEditor.close();
        return;
      }
      // Ne pas intercepter Ctrl+Z/S dans l'éditeur si un champ texte a le focus
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
      // Lot C — pendant qu'un accord est en cours d'édition, la barre d'espace
      // ne relance JAMAIS la lecture.
      if (e.key === ' ' || e.code === 'Space') {
        e.preventDefault();
        return;
      }
    }

    // Ctrl+S : sauvegarde du projet
    if (e.ctrlKey && (e.key === 's' || e.key === 'S')) {
      e.preventDefault();
      saveProject();
      return;
    }

    if (e.ctrlKey && e.shiftKey && (e.key === 'z' || e.key === 'Z')) {
      e.preventDefault();
      redo();
      return;
    }
    if (e.ctrlKey && (e.key === 'z' || e.key === 'Z')) {
      e.preventDefault();
      // Ne pas intercepter dans les champs texte
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
      undo();
      return;
    }

    if (e.key === ' ' || e.code === 'Space') {
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
      e.preventDefault();
      togglePlayback();
      return;
    }

    // Navigation rapide au clavier. Les blocs de la timeline ont le focus par
    // moments : on ne détourne les flèches que lorsque ce n'est pas le cas,
    // pour ne pas casser le déplacement d'accord en accord.
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      const active = document.activeElement;
      const tag = active?.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
      if (active?.classList?.contains('analyzer-timeline-block')) return;
      if (!currentPlayer) return;
      e.preventDefault();
      seekBy(e.key === 'ArrowLeft' ? -SKIP_SECONDS : SKIP_SECONDS);
    }
  });
}

function openChordEditor(segmentIndex) {
  if (!currentAnalysis) return;
  const seg = currentAnalysis.chords[segmentIndex];
  if (!seg) return;
  // Lot C — ouverture d'une session d'édition : la lecture active est mise en
  // pause immédiatement (avant toute évolution qui pourrait déplacer la cible),
  // et la cible est capturée par segmentId. Si le segment n'est pas valide,
  // on n'ouvre rien.
  const target = openChordEditSession({
    chords: currentAnalysis.chords,
    index: segmentIndex,
    playbackActive: isPlaybackActive,
    pause: pausePlayback,
  });
  if (!target) return;
  const resolved = resolveChordTarget(currentAnalysis.chords, target) || seg;
  chordEditor.open(resolved, segmentIndex, currentAnalysis);
}

function renderTimeline(chords, duration) {
  if (!els.chordTimelineInner) return;
  els.chordTimelineInner.innerHTML = '';

  duration = Math.max(duration || 0, 1);
  const pps = BASE_PIXELS_PER_SECOND * timelineZoom;
  const totalWidth = Math.max(duration * pps + (chords.length - 1) * BLOCK_GAP, 0);
  els.chordTimelineInner.style.width = `${totalWidth}px`;

  if (chords.length === 0) {
    els.chordTimelineInner.innerHTML = '<span class="analyzer-timeline-empty">Aucun accord détecté.</span>';
    return;
  }

  const fmt = (s) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${String(sec).padStart(2, '0')}`;
  };

  chords.forEach((chord, index) => {
    const effectiveChordStr = getEffectiveChord(chord);
    const originalDetected = chord.chord;
    const isOverridden = chord.manualOverride != null;

    const left = chord.startTime * pps + index * BLOCK_GAP;
    const timeWidth = Math.max((chord.endTime - chord.startTime) * pps - BLOCK_GAP, 0);

    const block = document.createElement('button');
    block.className = 'analyzer-timeline-block';
    block.type = 'button';
    block.setAttribute('tabindex', '0');
    block.setAttribute('role', 'button');
    block.setAttribute(
      'aria-label',
      `${effectiveChordStr}, ${ROLE_LABELS[segmentRole(chord)] || ''} — ${fmt(chord.startTime)} à ${fmt(chord.endTime)}`,
    );
    block.dataset.index = String(index);
    block.dataset.start = String(chord.startTime);
    block.dataset.segmentId = chord.segmentId || '';
    block.style.left = `${left}px`;
    block.style.width = `${timeWidth}px`;

    const roleLabel = ROLE_LABELS[segmentRole(chord)] || '';
    const timeRange = `${fmt(chord.startTime)} → ${fmt(chord.endTime)}  (${(chord.endTime - chord.startTime).toFixed(1)}s)`;
    if (isOverridden) {
      block.title = `Corrigé manuellement — ${originalDetected} → ${effectiveChordStr}  ${timeRange}`;
    } else {
      block.title = `${effectiveChordStr} · ${roleLabel}  ${timeRange}`;
    }

    if (isOverridden) {
      block.classList.add('manual-override');
    }

    // Hiérarchie harmonique : le rôle devient un poids visuel, jamais un
    // masquage. Un accord de passage reste lisible et cliquable — il est
    // seulement présenté comme secondaire.
    const role = segmentRole(chord);
    block.dataset.harmonicRole = role;
    if (hierarchyEnabled) {
      block.classList.add(`role-${role}`);
    }

    // Repli progressif : au dézoom, les accords non structurels devenus trop
    // étroits se réduisent à un marqueur. Les piliers, eux, gardent toujours
    // leur pastille — c'est la structure qu'on veut pouvoir lire de loin.
    const collapsed = hierarchyEnabled
      && role !== 'structural'
      && timeWidth < COLLAPSE_MIN_WIDTH_PX;
    if (collapsed) block.classList.add('collapsed');

    // Le symbole s'adapte à la place disponible plutôt que d'être tronqué :
    // « F#m » ne devient jamais « F... ». Quand rien ne tient, on n'affiche
    // rien — le nom complet reste dans l'infobulle et l'aria-label.
    const fitted = collapsed
      ? { text: '', fontPx: 0, truncated: true }
      : fitChordLabel(effectiveChordStr, timeWidth);
    if (fitted.truncated) block.classList.add('label-reduced');
    block.innerHTML = `
      ${fitted.text
        ? `<span class="analyzer-timeline-label" style="font-size:${fitted.fontPx}px">${escapeHtml(fitted.text)}</span>`
        : ''}
      ${isOverridden ? '<span class="override-icon" title="Corrigé manuellement">✏</span>' : ''}
    `;

    // Clic simple : sélection + mise à jour de l'inspecteur.
    // Double-clic : édition.
    block.addEventListener('click', () => {
      selectSegment(chord.segmentId);
      block.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    });
    block.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        openChordEditor(index);
      }
    });
    block.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      selectSegment(chord.segmentId);
      openChordEditor(index);
    });
    block.addEventListener('pointerdown', (e) => e.stopPropagation());
    els.chordTimelineInner.appendChild(block);
  });

  // Restaurer la sélection et l’accord courant
  updatePlaybackPosition(currentPlayer?.element?.currentTime ?? 0);
  if (selectedSegmentId) highlightSelectedSegment(selectedSegmentId);
}

function bindHierarchyToggle() {
  if (!els.hierarchyToggle) return;
  hierarchyEnabled = els.hierarchyToggle.checked;
  els.hierarchyToggle.addEventListener('change', () => {
    hierarchyEnabled = els.hierarchyToggle.checked;
    els.timelineLegend?.classList.toggle('muted', !hierarchyEnabled);
    rerenderTimeline();
  });
}

function selectSegment(segmentId) {
  selectedSegmentId = segmentId;
  highlightSelectedSegment(segmentId);
  const segment = getDisplayChords().find((s) => s.segmentId === segmentId) || null;
  renderInspector(segment);
  renderMasterclass(els, segment, currentAnalysis);
  renderCorriger(els, segment, currentAnalysis);
}

function highlightSelectedSegment(segmentId) {
  const blocks = els.chordTimelineInner?.querySelectorAll('.analyzer-timeline-block');
  if (!blocks) return;
  blocks.forEach((block) => {
    const isSelected = block.dataset.segmentId === segmentId;
    block.classList.toggle('selected', isSelected);
  });
}

function clearInspector() {
  if (!els.inspectorEmpty || !els.inspectorContent) return;
  els.inspectorEmpty.style.display = '';
  els.inspectorContent.style.display = 'none';
}

function renderInspector(segment) {
  if (!segment) {
    clearInspector();
    return;
  }
  const effective = getEffectiveChord(segment);
  const display = deriveChordDisplay(effective);
  const detected = parseChordSymbol(segment.chord);

  if (els.inspectorEmpty) els.inspectorEmpty.style.display = 'none';
  if (els.inspectorContent) els.inspectorContent.style.display = '';
  if (els.inspectorChord) els.inspectorChord.textContent = effective;
  if (els.inspectorTimes) {
    els.inspectorTimes.textContent = `${formatTime(segment.startTime)} – ${formatTime(segment.endTime)}`;
  }

  const rows = [];
  rows.push(['Fondamentale', NOTE_NAMES[display.rootPc] || '—']);
  rows.push(['Qualité', display.quality || 'majeur']);
  rows.push(['Basse', display.bassName || NOTE_NAMES[display.rootPc] || '—']);
  rows.push(['Notes', display.allNames.join(' · ') || '—']);
  if (segment.degree) rows.push(['Degré', segment.degree]);
  if (typeof segment.confidence === 'number') {
    rows.push(['Confiance', `${(segment.confidence * 100).toFixed(0)}%`]);
  }
  rows.push(['Rôle', ROLE_LABELS[segmentRole(segment)] || '—']);
  rows.push(['Origine', segment.manualOverride ? 'Corrigé manuellement' : 'Détecté automatiquement']);

  if (els.inspectorDetails) {
    els.inspectorDetails.innerHTML = rows
      .map(([label, value]) => `
        <span class="label">${escapeHtml(label)}</span>
        <span class="value">${escapeHtml(value)}</span>
      `)
      .join('');
  }
}

function renderHeroChord(chord) {
  if (!els.hero) return;
  if (!chord) {
    els.hero.style.display = 'none';
    return;
  }

  const effectiveChordStr = getEffectiveChord(chord);
  const display = deriveChordDisplay(effectiveChordStr);
  const originalDetected = chord.chord;

  els.hero.style.display = 'flex';

  if (chord.manualOverride) {
    els.heroName.textContent = display.symbol;
    els.heroName.title = `Détecté : ${originalDetected}`;
  } else {
    els.heroName.textContent = display.symbol || originalDetected || '';
    els.heroName.title = '';
  }

  // Notes
  let notesText = display.chordToneNames.join(' · ');
  if (display.bassName) {
    notesText = `Accord : ${notesText}    Basse : ${display.bassName}`;
  }
  els.heroNotes.textContent = notesText;

  // Mini clavier : toutes les notes y compris la basse
  const allPcs = display.allPcs;
  if (allPcs.length) {
    const midiNotes = allPcs.map((pc) => 60 + ((pc - (60 % 12) + 12) % 12));
    const { svg } = miniKeyboardForNotes(midiNotes);
    els.heroKeyboard.innerHTML = svg;
  } else {
    els.heroKeyboard.innerHTML = '';
  }
}

function updatePlaybackPosition(currentTime) {
  if (!currentAnalysis) return;
  const duration = currentPlayer?.getDuration?.() || currentAnalysis.duration || 1;
  const clamped = Math.max(0, Math.min(currentTime, duration));
  const ratio = duration > 0 ? clamped / duration : 0;

  els.progressFill.style.width = `${ratio * 100}%`;
  els.progressThumb.style.left = `${ratio * 100}%`;
  els.currentTimeEl.textContent = formatTime(clamped);
  els.durationEl.textContent = formatTime(duration);

  const chords = getDisplayChords();
  let activeIndex = -1;
  for (let i = 0; i < chords.length; i++) {
    if (clamped >= chords[i].startTime && clamped < chords[i].endTime) {
      activeIndex = i;
      break;
    }
  }

  const blocks = els.chordTimelineInner.querySelectorAll('.analyzer-timeline-block');
  blocks.forEach((block, idx) => {
    block.classList.toggle('current', idx === activeIndex);
  });

  // Hero chord
  const activeChord = activeIndex >= 0 ? chords[activeIndex] : null;
  renderHeroChord(activeChord);

  // Phase 1.5A + 2B : read-only close/simple voicing text preview
  const effectiveChord = activeChord ? getEffectiveChord(activeChord) : null;
  const currentStyle = getVoicingStyle();
  if (effectiveChord !== lastRenderedVoicingChord || currentStyle !== lastRenderedVoicingStyle) {
    lastRenderedVoicingChord = effectiveChord;
    lastRenderedVoicingStyle = currentStyle;
    if (effectiveChord) {
      updateVoicingPreviewForChord(effectiveChord, { style: currentStyle });
    } else {
      clearVoicingTextPreview();
    }
  }

  // Auto-scroll horizontal : défiler uniquement quand le segment approche du bord.
  if (activeIndex >= 0 && activeIndex !== lastAutoScrollIndex && blocks[activeIndex]) {
    lastAutoScrollIndex = activeIndex;
    const block = blocks[activeIndex];
    const containerRect = els.chordTimeline.getBoundingClientRect();
    const blockRect = block.getBoundingClientRect();
    const margin = 120;
    if (blockRect.right > containerRect.right - margin || blockRect.left < containerRect.left + margin) {
      const targetScroll = els.chordTimeline.scrollLeft + blockRect.left - containerRect.left - containerRect.width / 3 + blockRect.width / 2;
      els.chordTimeline.scrollTo({ left: targetScroll, behavior: 'smooth' });
    }
  }
}

function togglePlayback() {
  if (!currentPlayer) return;
  if (currentPlayer.element?.paused) {
    // [Claude] — 2026-08-08 — Demande l’audio focus avant de jouer. Si Studio
    // est en train de jouer, il est mis en pause sans synchronisation de
    // currentTime ou de position.
    globalAudioFocusManager.requestFocus('analysis');
    currentPlayer.play();
  } else {
    currentPlayer.pause();
  }
  updatePlayButton();
}

function bindPlayerControls() {
  els.playBtn?.addEventListener('click', togglePlayback);
  els.skipBackBtn?.addEventListener('click', () => seekBy(-SKIP_SECONDS));
  els.skipFwdBtn?.addEventListener('click', () => seekBy(SKIP_SECONDS));

  els.prevBtn?.addEventListener('click', () => {
    if (!currentPlayer) return;
    currentPlayer.seek(0);
    currentPlayer.play();
  });

  els.progressTrack?.addEventListener('pointerdown', (e) => {
    if (!currentPlayer) return;
    isDraggingProgress = true;
    seekFromPointerEvent(e);

    function onMove(ev) {
      seekFromPointerEvent(ev);
    }

    function onUp() {
      isDraggingProgress = false;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    }

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  });
}

function seekFromPointerEvent(e) {
  if (!currentPlayer) return;
  const rect = els.progressTrack.getBoundingClientRect();
  const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
  const duration = currentPlayer.getDuration?.() || currentAnalysis?.duration || 1;
  currentPlayer.seek(ratio * duration);
}

/**
 * Déplace la lecture d'un pas relatif, sans interrompre ni réinitialiser.
 * Revenir de quelques secondes ne doit pas obliger à repartir du début.
 */
function seekBy(seconds) {
  const el = currentPlayer?.element;
  if (!el) return;
  const duration = currentPlayer.getDuration?.() || currentAnalysis?.duration || 0;
  const target = Math.max(0, Math.min(el.currentTime + seconds, Math.max(duration - 0.05, 0)));
  el.currentTime = target;
  updatePlaybackPosition(target);
}

function updatePlayButton() {
  if (!els.playBtn || !currentPlayer) return;
  const isPaused = currentPlayer.element?.paused !== false;
  els.playBtn.textContent = isPaused ? '▶' : '⏸';
  els.playBtn.title = isPaused ? 'Lecture' : 'Pause';
}

function bindToolbar() {
  // Only zoom slider in the toolbar for now
}

function resetZoom() {
  timelineZoom = 1.0;
  if (els.zoomSlider) els.zoomSlider.value = '1';
  if (els.zoomValue) els.zoomValue.textContent = '100%';
}

function initTimelineZoom() {
  els.zoomSlider?.addEventListener('input', () => {
    timelineZoom = Number(els.zoomSlider.value);
    els.zoomValue.textContent = `${Math.round(timelineZoom * 100)}%`;
    if (currentAnalysis) {
      renderTimeline(getDisplayChords(), currentAnalysis.duration || 0);
    }
  });
}

async function handleExportMidi() {
  if (!currentAnalysis) return;
  if (!window.electronAPI?.files?.saveDialog || !window.electronAPI?.files?.writeBinary) {
    alert('Export MIDI non disponible dans cet environnement.');
    return;
  }

  const baseName = currentFileName.replace(/\.[^.]+$/, '') || 'analyse';
  const filePath = await window.electronAPI.files.saveDialog({
    defaultPath: `${baseName}_analysis.mid`,
  });
  if (!filePath) return;

  const midiBytes = exportAnalysisToMidi(currentAnalysis);
  if (!midiBytes) {
    alert('Aucune donnée à exporter.');
    return;
  }
  await window.electronAPI.files.writeBinary(filePath, midiBytes);
  const edited = countManuallyEditedChords(currentAnalysis);
  const suffix = edited > 0 ? ` — ${edited} accord(s) corrigé(s) manuellement inclus(s)` : '';
  showToast(`MIDI exporté${suffix} vers ${filePath}`, 4000);
}

async function handleExportJson() {
  if (!currentAnalysis) return;
  if (!window.electronAPI?.files?.saveDialog || !window.electronAPI?.files?.writeFile) {
    alert('Export JSON non disponible dans cet environnement.');
    return;
  }

  const baseName = currentFileName.replace(/\.[^.]+$/, '') || 'analyse';
  const filePath = await window.electronAPI.files.saveDialog({
    defaultPath: `${baseName}_analysis.json`,
    filters: [{ name: 'Fichier JSON', extensions: ['json'] }, { name: 'Tous les fichiers', extensions: ['*'] }],
  });
  if (!filePath) return;

  const jsonData = exportAnalysisToJson(currentAnalysis);
  await window.electronAPI.files.writeFile(filePath, JSON.stringify(jsonData, null, 2));
  const edited = countManuallyEditedChords(currentAnalysis);
  const suffix = edited > 0 ? ` — ${edited} correction(s) manuelle(s)` : '';
  showToast(`JSON exporté${suffix} vers ${filePath}`, 4000);
}

async function handleCopyText() {
  if (!currentAnalysis) return;
  const text = exportAnalysisToText(currentAnalysis);
  if (navigator.clipboard) {
    await navigator.clipboard.writeText(text);
  } else {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    textarea.remove();
  }
  const edited = countManuallyEditedChords(currentAnalysis);
  const suffix = edited > 0 ? ` — ${edited} correction(s) manuelle(s)` : '';
  showToast(`Grille texte copiée${suffix}`, 3000);
}

function showToast(message, duration = 3000, type = 'info') {
  const existing = document.getElementById('analyzer-toast');
  if (existing) existing.remove();
  const toast = document.createElement('div');
  toast.id = 'analyzer-toast';
  toast.className = `analyzer-toast ${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.classList.add('visible'), 10);
  setTimeout(() => {
    toast.classList.remove('visible');
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

function bindTimelineScroll() {
  els.timelineScrollLeft?.addEventListener('click', () => {
    els.chordTimeline.scrollBy({ left: -els.chordTimeline.clientWidth * 0.6, behavior: 'smooth' });
  });
  els.timelineScrollRight?.addEventListener('click', () => {
    els.chordTimeline.scrollBy({ left: els.chordTimeline.clientWidth * 0.6, behavior: 'smooth' });
  });
}

function bindSectionTabs() {
  if (!els.sectionTabs.length) return;

  els.sectionTabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      activateSectionTab(tab.dataset.section);
    });
  });
}

function activateSectionTab(section) {
  els.sectionTabs.forEach((t) => {
    const active = t.dataset.section === section;
    t.classList.toggle('active', active);
    t.setAttribute('aria-selected', String(active));
  });
  els.sectionPanels.forEach((panel) => {
    const active = panel.dataset.section === section;
    panel.style.display = active ? '' : 'none';
    if (active && section === 'masterclass') {
      renderMasterclass(els, getDisplayChords().find((s) => s.segmentId === selectedSegmentId) || null, currentAnalysis);
    }
    if (active && section === 'corriger') {
      renderCorriger(els, getDisplayChords().find((s) => s.segmentId === selectedSegmentId) || null, currentAnalysis);
    }
  });
}

function bindExportMidiButton() {
  els.exportMidiBtn?.addEventListener('click', handleExportMidi);
}

function bindExportJsonButton() {
  els.exportJsonBtn?.addEventListener('click', handleExportJson);
}

function bindCopyTextButton() {
  els.copyTextBtn?.addEventListener('click', handleCopyText);
}

async function loadAudioBlobUrl(filePath) {
  if (!window.electronAPI?.files?.readBinary) {
    throw new Error('Lecture de fichier non disponible');
  }
  const bytes = await window.electronAPI.files.readBinary(filePath);
  const blob = new Blob([bytes], { type: 'audio/wav' });
  return URL.createObjectURL(blob);
}

// ── Phase B : Persistance des overrides ──

function resetProjectState() {
  projectDirty = false;
  projectPath = null;
  audioIdentity = null;
  currentProjectOrphanedOverrides = {};
  if (saveStatusEl) {
    saveStatusEl.remove();
    saveStatusEl = null;
  }
  window.__projectDirty = false;
}

function addSaveIndicator() {
  if (saveStatusEl) { saveStatusEl.remove(); saveStatusEl = null; }
  saveStatusEl = document.createElement('span');
  saveStatusEl.id = 'analyzer-save-status';
  saveStatusEl.className = 'analyzer-save-status';
  const projectPathDisplay = projectPath || buildProjectPath(currentAudioPath) || '(chemin inconnu)';
  saveStatusEl.title = `Enregistrer les corrections (Ctrl+S)\nFichier : ${projectPathDisplay}`;
  saveStatusEl.addEventListener('click', (e) => {
    e.stopPropagation();
    saveProject();
  });
  const header = els.songTitle?.parentElement;
  if (header) {
    header.appendChild(saveStatusEl);
  }
  markClean();
}

async function getAudioStat(filePath) {
  if (!window.electronAPI?.files?.stat) return null;
  try {
    return await window.electronAPI.files.stat(filePath);
  } catch {
    return null;
  }
}

function markDirty() {
  if (!projectDirty) {
    projectDirty = true;
    window.__projectDirty = true;
    updateSaveIndicator();
  }
}

function markClean() {
  projectDirty = false;
  window.__projectDirty = false;
  updateSaveIndicator();
}

function updateSaveIndicator() {
  if (!saveStatusEl) return;
  const projectPathDisplay = projectPath || buildProjectPath(currentAudioPath) || '(chemin inconnu)';
  saveStatusEl.title = `Enregistrer les corrections (Ctrl+S)\nFichier : ${projectPathDisplay}`;
  if (projectDirty) {
    saveStatusEl.textContent = '⚠ Modifications non enregistrées';
    saveStatusEl.className = 'analyzer-save-status dirty';
  } else {
    saveStatusEl.textContent = '💾 Enregistré';
    saveStatusEl.className = 'analyzer-save-status clean';
  }
}

async function saveProject({ silent = false } = {}) {
  if (!currentAudioPath || !currentAnalysis) return;
  if (!window.electronAPI?.files?.writeFile || !window.electronAPI?.files?.rename) {
    showToast('Sauvegarde non disponible dans cet environnement.');
    return;
  }

  try {
    if (!audioIdentity) {
      const stat = await getAudioStat(currentAudioPath);
      audioIdentity = buildAudioIdentity(currentAudioPath, currentAnalysis, stat);
    }

    projectPath = projectPath || buildProjectPath(currentAudioPath);
    const data = buildProjectData(
      audioIdentity,
      currentAnalysis.chords || [],
      currentProjectOrphanedOverrides,
      currentAnalysis,
    );

    // Écriture atomique : fichier temporaire → renommage
    const tmpPath = projectPath + '.tmp';
    await window.electronAPI.files.writeFile(tmpPath, JSON.stringify(data, null, 2));
    await window.electronAPI.files.rename(tmpPath, projectPath);

    markClean();
    if (!silent) {
      const displayPath = projectPath || '';
      const shortPath = displayPath.length > 60 ? '…' + displayPath.slice(-60) : displayPath;
      showToast(`Projet enregistré : ${shortPath}`, 4000);
    }
  } catch (err) {
    console.error('[Analyzer] save failed:', err);
    if (!silent) showToast("Erreur d'enregistrement : " + err.message, 5000);
    // Les corrections en mémoire restent intactes
  }
}

async function loadProjectIfExists() {
  if (!currentAudioPath || !currentAnalysis) return;
  if (!window.electronAPI?.files?.readFile) return;

  const path = buildProjectPath(currentAudioPath);
  if (!path) return;
  projectPath = path;

  try {
    const exists = await window.electronAPI.files.exists(path);
    if (!exists) return;

    const content = await window.electronAPI.files.readFile(path);
    if (!content) {
      showToast('Projet existant vide ou illisible.', 5000, 'warning');
      return;
    }

    const data = safeJsonParse(content);
    if (!data) {
      console.warn('[Analyzer] projet invalide (JSON mal formé) :', path);
      showToast('Projet existant illisible (JSON invalide).', 6000, 'warning');
      return;
    }

    if (!validateProjectSchema(data)) {
      console.warn('[Analyzer] projet incompatible (schemaVersion) :', path);
      const version = data && data.schemaVersion;
      const detail = version != null ? ` (version ${version})` : '';
      showToast(`Projet incompatible${detail}. Créez un nouveau projet avec Ctrl+S.`, 6000, 'warning');
      return;
    }

    const stat = await getAudioStat(currentAudioPath);
    const identity = buildAudioIdentity(currentAudioPath, currentAnalysis, stat);
    audioIdentity = identity;

    if (!verifyAudioIdentity(data.audio, identity)) {
      console.warn('[Analyzer] identité audio différente — overrides ignorés');
      const diff = describeIdentityDiff(data.audio, identity);
      showToast(`Projet existant incompatible.${diff} Corrections non appliquées.`, 8000, 'warning');
      return;
    }

    const { applied, orphaned } = tryApplyProjectOverrides(data, currentAnalysis.chords || []);
    currentProjectOrphanedOverrides = orphaned;

    // L'état chargé est la nouvelle ligne de base : pas d'undo possible sur le load
    resetUndoRedo();
    rerenderTimeline();

    if (applied.length > 0) {
      showToast(`${applied.length} correction(s) chargée(s).`, 3000, 'info');
    } else if (Object.keys(data.manualChordOverrides || {}).length === 0) {
      showToast('Aucune correction enregistrée dans ce projet.', 2000, 'info');
    }
    if (Object.keys(orphaned).length > 0) {
      console.warn('[Analyzer] overrides orphelins conservés :', Object.keys(orphaned));
      showToast(`${Object.keys(orphaned).length} correction(s) orpheline(s) conservée(s).`, 5000, 'warning');
    }

    markClean();
  } catch (err) {
    console.error('[Analyzer] load project failed:', err);
    showToast('Erreur de lecture du projet.', 6000, 'error');
  }
}

function describeIdentityDiff(savedAudio, currentAudio) {
  if (!savedAudio || !currentAudio) return '';
  if (savedAudio.path !== currentAudio.path) {
    return ' Ce fichier audio semble différent.';
  }
  if (savedAudio.size > 0 && currentAudio.size > 0 && savedAudio.size !== currentAudio.size) {
    return ' La taille du fichier a changé.';
  }
  if (savedAudio.modifiedAt > 0 && currentAudio.modifiedAt > 0 && savedAudio.modifiedAt !== currentAudio.modifiedAt) {
    return ' Le fichier a été modifié.';
  }
  return '';
}

function safeJsonParse(str) {
  try { return JSON.parse(str); } catch { return null; }
}

function buildAudioIdentity(audioPath, analysis, stat) {
  return {
    path: audioPath,
    size: stat?.size ?? 0,
    duration: analysis?.duration ?? 0,
    modifiedAt: stat?.mtimeMs ?? 0,
  };
}

// Exposé pour le gestionnaire close dans main.js
window.__projectDirty = false;
window.__saveProjectBeforeClose = async function () {
  await saveProject();
};

function renderStats(analysis) {
  if (!els.statsContent) return;
  const stats = computeProductStatistics(analysis);
  const qualityRows = Object.entries(stats.qualityCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([q, count]) => `<div class="flex justify-between text-xs"><span>${q || 'majeur'}</span><span>${count}</span></div>`)
    .join('');

  const topRows = stats.mostUsedChords
    .map(({ symbol, count }) => `<div class="flex justify-between text-xs"><span>${escapeHtml(symbol)}</span><span>${count}</span></div>`)
    .join('');

  els.statsContent.innerHTML = `
    <div class="space-y-3">
      <div class="flex justify-between text-sm font-medium text-(--text)"><span>Segments</span><span>${stats.totalSegments}</span></div>
      <div class="flex justify-between text-sm font-medium text-(--text)"><span>Durée totale</span><span>${formatTime(stats.totalDuration)}</span></div>
      <div class="flex justify-between text-sm font-medium text-(--text)"><span>Corrections manuelles</span><span>${stats.manuallyEditedCount}</span></div>
      <div class="flex justify-between text-sm font-medium text-(--text)"><span>Slash chords</span><span>${stats.slashChordCount}</span></div>
      <div>
        <div class="text-xs font-semibold text-(--text-dim) uppercase mb-1">Qualités</div>
        ${qualityRows || '<div class="text-xs text-(--text-dim)">Aucune</div>'}
      </div>
      <div>
        <div class="text-xs font-semibold text-(--text-dim) uppercase mb-1">Accords les plus utilisés</div>
        ${topRows || '<div class="text-xs text-(--text-dim)">Aucun</div>'}
      </div>
    </div>
  `;
}

// [Claude] — 2026-08-08 — Vue d'ensemble scrollable (LOT 4).
// Remplit #analyzer-overview-content avec les blocs : score, pattern, basse,
// réharmonisation, statistiques, export.
function renderOverview(analysis) {
  if (!els.overviewContent) return;
  const stats = computeProductStatistics(analysis);
  const chords = analysis.chords || [];
  const duration = analysis.duration || 0;

  // En-tête : métriques globales (LOT 4)
  const headerItems = [
    { label: 'Tonalité', value: analysis.key ? `${analysis.key} ${analysis.keyMode || 'majeur'}` : '—' },
    { label: 'Tempo', value: analysis.tempo ? `${Math.round(analysis.tempo)} BPM` : '—' },
    { label: 'Durée', value: formatTime(duration) },
    { label: 'Confiance', value: analysis.confidence ? `${(analysis.confidence * 100).toFixed(0)}%` : '—' },
  ];

  // Score analyse : détails mesurables
  const avgConfidence = chords.length > 0
    ? `${(chords.reduce((acc, c) => acc + (typeof c.confidence === 'number' ? c.confidence : 0), 0) / chords.length * 100).toFixed(0)}%`
    : '—';
  const uniqueChordCount = new Set(chords.map((c) => getEffectiveChord(c))).size;
  const scoreRows = [
    { label: 'Segments', value: String(stats.totalSegments) },
    { label: 'Accords distincts', value: String(uniqueChordCount) },
    { label: 'Confiance moyenne', value: avgConfidence },
    { label: 'Durée couverte', value: `${((stats.totalDuration / Math.max(duration, 1)) * 100).toFixed(0)}%` },
  ];

  // Pattern harmonique : progression simplifiée
  const progression = chords
    .map((c) => getEffectiveChord(c))
    .filter((s, i, arr) => i === 0 || s !== arr[i - 1])
    .slice(0, 32);

  // Ligne de basse : fondamentale de chaque accord
  const bassNotes = chords
    .map((c) => {
      const eff = getEffectiveChord(c);
      const display = deriveChordDisplay(eff);
      return display.bassName || NOTE_NAMES[display.rootPc] || '?';
    })
    .filter((n, i, arr) => i === 0 || n !== arr[i - 1])
    .slice(0, 32);

  // Qualités
  const qualityRows = Object.entries(stats.qualityCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([q, count]) => `<div class="flex justify-between text-xs"><span>${q || 'majeur'}</span><span>${count}</span></div>`)
    .join('') || '<div class="text-xs text-(--text-dim)">Aucune</div>';

  // Accords les plus utilisés
  const topRows = stats.mostUsedChords
    .map(({ symbol, count }) => `<div class="flex justify-between text-xs"><span>${escapeHtml(symbol)}</span><span>${count}</span></div>`)
    .join('') || '<div class="text-xs text-(--text-dim)">Aucun</div>';

  els.overviewContent.innerHTML = `
    <div class="analyzer-overview-header">
      ${headerItems.map(({ label, value }) => `
        <div class="analyzer-overview-metric overview-header-metric">
          <div class="value">${escapeHtml(value)}</div>
          <div class="label">${escapeHtml(label)}</div>
        </div>
      `).join('')}
    </div>

    <div class="analyzer-overview-row">
      <div class="analyzer-overview-block">
        <h3>Score analyse</h3>
        <div class="analyzer-overview-grid">
          ${scoreRows.map(({ label, value }) => `
            <div class="analyzer-overview-metric">
              <div class="value">${escapeHtml(value)}</div>
              <div class="label">${escapeHtml(label)}</div>
            </div>
          `).join('')}
        </div>
      </div>

      <div class="analyzer-overview-block">
        <h3>Pattern harmonique</h3>
        <div class="analyzer-bass-line">
          ${progression.length > 0
            ? progression.map((s) => `<span class="note-pill">${escapeHtml(s)}</span>`).join(' ')
            : '<span class="text-xs text-(--text-dim)">Aucun accord détecté.</span>'}
        </div>
      </div>
    </div>

    <div class="analyzer-overview-row">
      <div class="analyzer-overview-block">
        <h3>Ligne de basse</h3>
        <div class="analyzer-bass-line">
          ${bassNotes.length > 0
            ? bassNotes.map((n) => `<span class="note-pill">${escapeHtml(n)}</span>`).join('<span class="bass-arrow" aria-hidden="true">→</span>')
            : '<span class="text-xs text-(--text-dim)">Non disponible.</span>'}
        </div>
      </div>

      <div class="analyzer-overview-block">
        <h3>Statistiques</h3>
        <div class="analyzer-overview-grid">
          <div class="analyzer-overview-metric">
            <div class="value">${stats.totalSegments}</div>
            <div class="label">Segments</div>
          </div>
          <div class="analyzer-overview-metric">
            <div class="value">${formatTime(stats.totalDuration)}</div>
            <div class="label">Durée totale</div>
          </div>
          <div class="analyzer-overview-metric">
            <div class="value">${stats.manuallyEditedCount}</div>
            <div class="label">Corrections</div>
          </div>
          <div class="analyzer-overview-metric">
            <div class="value">${stats.slashChordCount}</div>
            <div class="label">Slash chords</div>
          </div>
        </div>
        <div class="mt-3">
          <div class="text-xs font-semibold text-(--text-dim) uppercase mb-1">Qualités</div>
          ${qualityRows}
        </div>
        <div class="mt-2">
          <div class="text-xs font-semibold text-(--text-dim) uppercase mb-1">Accords les plus utilisés</div>
          ${topRows}
        </div>
      </div>
    </div>

    <div class="analyzer-overview-row">
      <div class="analyzer-overview-block">
        <h3>Export / Actions</h3>
        <div class="flex flex-wrap gap-2">
          <button type="button" class="btn-secondary" id="analyzer-overview-export-midi">Exporter en MIDI</button>
          <button type="button" class="btn-secondary" id="analyzer-overview-export-json">Exporter en JSON</button>
          <button type="button" class="btn-secondary" id="analyzer-overview-copy-text">Copier la grille texte</button>
        </div>
        <p class="text-xs text-(--text-dim) mt-2">MIDI, JSON et texte reflètent les corrections manuelles. JSON conserve aussi la détection originale.</p>
      </div>
    </div>
  `;

  // Brancher les boutons d'export de la vue d'ensemble
  const overviewExportMidi = document.getElementById('analyzer-overview-export-midi');
  const overviewExportJson = document.getElementById('analyzer-overview-export-json');
  const overviewCopyText = document.getElementById('analyzer-overview-copy-text');

  if (overviewExportMidi) overviewExportMidi.addEventListener('click', () => exportAnalysisToMidi(analysis, currentFileName));
  if (overviewExportJson) overviewExportJson.addEventListener('click', () => exportAnalysisToJson(analysis, currentFileName));
  if (overviewCopyText) overviewCopyText.addEventListener('click', () => exportAnalysisToText(analysis, currentFileName));
}

// [Claude] — 2026-08-08 — Sidebar résultats (LOT 3).
// Remplit les infos de la sidebar dans l'état "results" (réharmonisation).
function renderResultsSidebar(analysis) {
  if (els.resultKey) els.resultKey.textContent = analysis.key ? `${analysis.key} ${analysis.keyMode || 'majeur'}` : '—';
  if (els.resultStyle) els.resultStyle.textContent = analysis.style || '—';
  if (els.resultSource) els.resultSource.textContent = currentSourceType === 'midi' ? 'MIDI' : (currentSourceType === 'video' ? 'Vidéo' : 'Audio');
  if (els.resultDuration) els.resultDuration.textContent = formatTime(analysis.duration || 0);
  if (els.summaryKey) els.summaryKey.textContent = analysis.key ? `${analysis.key} ${analysis.keyMode || 'majeur'}` : '—';
  if (els.summaryAnalysis) {
    const chordCount = (analysis.chords || []).length;
    els.summaryAnalysis.textContent = chordCount > 0 ? `${chordCount} accords détectés` : '—';
  }
}

function escapeHtml(str) {
  return String(str)
    .replace(/\u0026/g, '\u0026amp;')
    .replace(/\u003c/g, '\u0026lt;')
    .replace(/\u003e/g, '\u0026gt;')
    .replace(/"/g, '\u0026quot;');
}

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Refonte visuelle — Panneau Réharmonisation (§3.2)
// ---------------------------------------------------------------------------

// Initialise le panneau Réharmonisation : sélecteur de style en pilules,
// lancement de la démonstration, comparaison, puis gestion des états post-apply.
function initReharmonizationPanel() {
  // Sélecteur de style (Worship / Gospel / Jazz / Neo Soul).
  if (els.reharmStyleSelector) {
    const buttons = els.reharmStyleSelector.querySelectorAll('button[data-style]');
    buttons.forEach((btn) => {
      const active = btn.dataset.style === reharmActiveStyle;
      btn.setAttribute('aria-pressed', String(active));
      btn.classList.toggle('active', active);
      btn.addEventListener('click', () => setReharmStyle(btn.dataset.style));
    });
  }

  // Sélecteur de style de lecture (Plaqué / Arpégé) pour le bouton "▶ Écouter".
  if (els.reharmPlayStyleSelector) {
    const playButtons = els.reharmPlayStyleSelector.querySelectorAll('button[data-play-style]');
    playButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        reharmPlayStyle = btn.dataset.playStyle;
        playButtons.forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));
      });
    });
  }

  // Bouton principal : réharmoniser le morceau chargé dans Analyse (stems Studio
  // si disponibles, sinon sélection manuelle d'un stem).
  if (els.reharmRun) {
    els.reharmRun.addEventListener('click', runReharmonizationFromCurrentFile);
  }

  // Bouton secondaire : comparer les propositions (scroll vers les cartes).
  if (els.reharmCompareBtn) {
    els.reharmCompareBtn.addEventListener('click', () => {
      if (lastReharmVariantsVm) {
        els.reharmResults?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } else {
        showToast('Lancez d’abord une réharmonisation pour comparer les propositions.', 3000);
      }
    });
  }

  // Clics délégués sur les cartes (Écouter / Appliquer / Basculer).
  els.reharmResults?.addEventListener('click', (e) => {
    const listenBtn = e.target.closest('[data-reharm-listen]');
    if (listenBtn) {
      const variant = lastReharmVariantsVm?.variants?.find(
        (v) => v.id === listenBtn.dataset.reharmListen
      );
      if (variant) playReharmonizationVariant(variant);
      return;
    }
    const applyBtn = e.target.closest('[data-reharm-apply]');
    if (applyBtn) {
      applyReharmonization(applyBtn.dataset.reharmApply);
      return;
    }
    const switchBtn = e.target.closest('[data-reharm-switch]');
    if (switchBtn) {
      applyReharmonization(switchBtn.dataset.reharmSwitch);
    }
  });

  // Interrupteur Original / Réharmonisé après application.
  if (els.reharmVersionToggle) {
    const buttons = els.reharmVersionToggle.querySelectorAll('button[data-version]');
    buttons.forEach((btn) => {
      btn.addEventListener('click', () => setTimelineViewMode(btn.dataset.version));
    });
  }

  els.reharmRevertBtn?.addEventListener('click', () => {
    setTimelineViewMode('original');
    appliedReharmonization = null;
    if (els.reharmPostApply) els.reharmPostApply.style.display = 'none';
    rerenderTimeline();
  });

  els.reharmRelistenBtn?.addEventListener('click', () => {
    if (timelineViewMode !== 'reharm') setTimelineViewMode('reharm');
    togglePlayback();
  });

  els.reharmSendTrainingBtn?.addEventListener('click', () => {
    showToast('Envoi vers Entraînement — à brancher dans l’onglet Entraînement.', 3000);
  });

  if (els.reharmResults) {
    els.reharmResults.setAttribute('aria-live', 'polite');
    els.reharmResults.setAttribute('aria-busy', 'false');
    renderReharmonizationEmpty(els.reharmResults);
  }
}

// [2026-09-04] — Lecture audio d'une proposition de réharmonisation, dans
// l'ordre des steps, plaquée ou égrenée selon le sélecteur Plaqué / Arpégé.
// Espacement entre accords constant (CHORD_DURATION_MS + GAP_MS) quel que
// soit le mode ; l'extinction reste groupée au même instant pour toutes les
// notes d'un même accord. Sur le modèle de playNotes() de masterclass-panel.js
// (mêmes playNote/releaseNote, extinction différée).
async function playReharmonizationVariant(variant) {
  if (!variant || !Array.isArray(variant.steps) || variant.steps.length === 0) return;
  await resumeAudio();
  const CHORD_DURATION_MS = 1200;
  const GAP_MS = 150;
  const ARPEGGIO_STEP_MS = 70;
  const RELEASE_OFFSET_MS = CHORD_DURATION_MS - 100;
  let delay = 0;
  for (const step of variant.steps) {
    const notes = (step.voicingMidiNotes || []).slice().sort((a, b) => a - b);
    const startDelay = delay;
    notes.forEach((midi, i) => {
      const strikeOffset = reharmPlayStyle === 'arpeggio' ? i * ARPEGGIO_STEP_MS : 0;
      setTimeout(() => playNote(midi, 0.75), startDelay + strikeOffset);
      setTimeout(() => releaseNote(midi), startDelay + RELEASE_OFFSET_MS);
    });
    delay += CHORD_DURATION_MS + GAP_MS;
  }
}

function setReharmStyle(styleId) {
  reharmActiveStyle = styleId;
  if (els.reharmStyleSelector) {
    const buttons = els.reharmStyleSelector.querySelectorAll('button[data-style]');
    buttons.forEach((btn) => {
      const active = btn.dataset.style === styleId;
      btn.setAttribute('aria-pressed', String(active));
      btn.classList.toggle('active', active);
    });
  }
}

function setTimelineViewMode(mode) {
  timelineViewMode = mode === 'reharm' ? 'reharm' : 'original';
  if (els.reharmVersionToggle) {
    const buttons = els.reharmVersionToggle.querySelectorAll('button[data-version]');
    buttons.forEach((btn) => {
      const active = btn.dataset.version === timelineViewMode;
      btn.setAttribute('aria-pressed', String(active));
      btn.classList.toggle('active', active);
    });
  }
  rerenderTimeline();
}

function countModifiedChords(reharmChords, originalChords) {
  if (!originalChords || originalChords.length === 0) return reharmChords.length;
  let modified = 0;
  const n = Math.min(reharmChords.length, originalChords.length);
  for (let i = 0; i < n; i++) {
    if (reharmChords[i].chord !== originalChords[i].chord) modified++;
  }
  modified += Math.abs(reharmChords.length - originalChords.length);
  return modified;
}

function buildReharmChords(variant) {
  const duration = currentAnalysis?.duration || lastReharmMeta?.track?.duration || 10;
  const stepDuration = duration / Math.max(variant.steps.length, 1);
  return variant.steps.map((step, i) => ({
    segmentId: `reharm-${variant.id}-${i}`,
    chord: step.chordSymbol,
    startTime: i * stepDuration,
    endTime: (i + 1) * stepDuration,
    confidence: 1,
    role: 'structural',
  }));
}

function applyReharmonization(variantId) {
  if (!lastReharmVariantsVm) return;
  const variant = lastReharmVariantsVm.variants.find((v) => v.id === variantId);
  if (!variant) return;

  const chords = buildReharmChords(variant);
  appliedReharmonization = {
    variantId: variant.id,
    styleId: getReharmActiveStyle(),
    chords,
    meta: lastReharmMeta,
  };

  if (els.reharmPostApply) els.reharmPostApply.style.display = '';

  const styleLabels = {
    worship: 'Worship',
    gospel: 'Gospel',
    jazz: 'Jazz',
    neoSoul: 'Neo Soul',
  };
  const styleLabel = styleLabels[appliedReharmonization.styleId] || appliedReharmonization.styleId;
  const originalCount = (currentAnalysis?.chords || []).length || variant.steps.length;
  const modifiedCount = countModifiedChords(chords, currentAnalysis?.chords || []);
  if (els.reharmAppliedContext) {
    els.reharmAppliedContext.textContent = `${styleLabel} · ${variant.label} — ${modifiedCount} accord(s) sur ${originalCount} modifié(s)`;
  }
  if (els.reharmAppliedScore) {
    els.reharmAppliedScore.textContent = `${variant.validationReport.score}/4 critères`;
  }

  // Met à jour les cartes : la variante appliquée passe en « ✓ Appliquée ».
  if (els.reharmResults) {
    renderReharmonizationVariants(els.reharmResults, lastReharmVariantsVm, lastReharmMeta, variantId);
  }

  setTimelineViewMode('reharm');
  togglePlayback();
}

function updateReharmContext(meta, viewModel) {
  if (!meta) return;
  const hc = meta.harmonicContext;
  const track = meta.track;

  if (els.reharmContextKey) {
    const tonic = hc?.tonalContext?.spelledKey?.tonicSpelling?.letter;
    const mode = hc?.tonalContext?.selected?.mode === 'minor' ? 'mineur' : 'majeur';
    els.reharmContextKey.textContent = tonic ? `${tonic} ${mode}` : '—';
  }

  let sourceText = 'Démonstration';
  if (meta.isLive) sourceText = 'Clavier MIDI';
  else if (meta.isAudio) sourceText = 'Fichier audio';
  else if (meta.isSession) sourceText = 'Session enregistrée';
  if (els.reharmContextSource) els.reharmContextSource.textContent = sourceText;

  if (els.reharmContextRange) {
    let rangeText = '—';
    if (track && Array.isArray(track.events) && track.events.length > 0) {
      const times = track.events
        .map((e) => e.startedAt ?? 0)
        .filter((t) => typeof t === 'number')
        .sort((a, b) => a - b);
      const first = times[0];
      const last = times[times.length - 1];
      if (first != null && last != null) {
        rangeText = `${formatTime(first / 1000)} – ${formatTime(last / 1000)}`;
      }
    }
    els.reharmContextRange.textContent = rangeText;
  }

  renderReharmMelodyStrip(track, viewModel?.variants?.[0]?.steps || []);
}

function renderReharmMelodyStrip(track, steps) {
  if (!els.reharmMelodyStrip || !els.reharmMelodyEmpty) return;
  if (!track || !Array.isArray(track.events) || track.events.length === 0) {
    els.reharmMelodyStrip.innerHTML = '';
    els.reharmMelodyEmpty.style.display = '';
    return;
  }

  const melodyEvents = track.events
    .filter((e) => typeof e.midi === 'number')
    .sort((a, b) => (a.startedAt ?? 0) - (b.startedAt ?? 0));

  if (melodyEvents.length === 0) {
    els.reharmMelodyStrip.innerHTML = '';
    els.reharmMelodyEmpty.style.display = '';
    return;
  }

  els.reharmMelodyEmpty.style.display = 'none';

  const times = melodyEvents.map((e) => e.startedAt ?? 0);
  const minTime = Math.min(...times);
  const maxTime = Math.max(...times) || minTime + 1;
  const range = maxTime - minTime || 1;
  const minMidi = Math.min(...melodyEvents.map((e) => e.midi));
  const maxMidi = Math.max(...melodyEvents.map((e) => e.midi));
  const midiRange = Math.max(maxMidi - minMidi, 1);

  // Notes repères : jusqu'à 4 ancres mélodiques.
  const anchorEventIds = new Set();
  steps.slice(0, 4).forEach((s) => {
    if (s.melodyEventId) anchorEventIds.add(s.melodyEventId);
  });

  els.reharmMelodyStrip.innerHTML = '';
  melodyEvents.forEach((ev) => {
    const bar = document.createElement('div');
    bar.className = 'reharm-melody-bar';
    if (anchorEventIds.has(ev.id)) bar.classList.add('highlight');
    const left = ((ev.startedAt - minTime) / range) * 100;
    const bottom = ((ev.midi - minMidi) / midiRange) * 100;
    bar.style.left = `${Math.max(0, Math.min(100, left))}%`;
    bar.style.bottom = `${Math.max(0, Math.min(100, bottom))}%`;
    bar.style.height = `${Math.max(4, Math.min(40, (ev.duration || 200) / 30))}px`;
    bar.title = `MIDI ${ev.midi} @ ${formatTime((ev.startedAt ?? 0) / 1000)}`;
    els.reharmMelodyStrip.appendChild(bar);
  });
}

// Lance la démonstration : construit la fixture canonique, appelle le moteur
// via l’orchestrateur, affiche les 3 cartes de propositions.
async function runReharmonizationDemo() {
  const runBtn = els.reharmRun;
  const output = els.reharmResults;
  if (!runBtn || !output) return;

  runBtn.disabled = true;
  output.setAttribute('aria-busy', 'true');
  renderReharmonizationLoading(output);

  await new Promise((resolve) => requestAnimationFrame(resolve));
  await new Promise((resolve) => setTimeout(resolve, 0));

  try {
    const fixture = buildDemoFixture();
    const viewModel = buildReharmonizationVariantsViewModel({
      track: fixture.track,
      harmonicContext: fixture.harmonicContext,
      styleId: getReharmActiveStyle(),
    });

    if (viewModel.status === 'success') {
      const meta = Object.freeze({
        isDemo: true,
        label: 'Démonstration du moteur de réharmonisation',
        description: 'Ligne mélodique déterministe Do-Mi-Sol en Do majeur.',
        track: fixture.track,
        harmonicContext: fixture.harmonicContext,
      });
      lastReharmVariantsVm = viewModel;
      lastReharmMeta = meta;
      renderReharmonizationVariants(output, viewModel, meta);
      updateReharmContext(meta, viewModel);
    } else {
      renderReharmonizationError(output, viewModel.message, viewModel.errorKind);
    }
  } catch (err) {
    renderReharmonizationError(output, err && err.message ? err.message : 'Erreur inattendue.', 'Error');
  } finally {
    runBtn.disabled = false;
    output.setAttribute('aria-busy', 'false');
  }
}

// [OpenCode] — 2026-08-24 — Réharmonisation V1, Étape 1 : lance le moteur
// canonique sur la dernière capture MIDI live.
async function runReharmonizationLive() {
  const output = els.reharmResults;
  if (!output) return;
  if (!reharmLiveWrapper) {
    renderReharmonizationError(
      output,
      'Aucune mélodie live disponible. Lancez une session MIDI, jouez une mélodie, puis arrêtez.',
      'EmptyMelody',
    );
    return;
  }

  output.setAttribute('aria-busy', 'true');
  renderReharmonizationLoading(output);
  await new Promise((resolve) => requestAnimationFrame(resolve));
  await new Promise((resolve) => setTimeout(resolve, 0));

  try {
    const viewModel = buildReharmonizationVariantsViewModel({
      track: reharmLiveWrapper.track,
      harmonicContext: reharmLiveWrapper.harmonicContext,
      styleId: getReharmActiveStyle(),
    });
    if (viewModel.status === 'success') {
      const meta = Object.freeze({
        isDemo: false,
        isLive: true,
        label: 'Réharmonisation de votre mélodie',
        description: `Mélodie live capturée au clavier (${reharmLiveWrapper.track.events.length} notes).`,
        track: reharmLiveWrapper.track,
        harmonicContext: reharmLiveWrapper.harmonicContext,
      });
      lastReharmVariantsVm = viewModel;
      lastReharmMeta = meta;
      renderReharmonizationVariants(output, viewModel, meta);
      updateReharmContext(meta, viewModel);
    } else {
      renderReharmonizationError(output, viewModel.message, viewModel.errorKind);
    }
  } catch (err) {
    renderReharmonizationError(output, err && err.message ? err.message : 'Erreur inattendue.', 'Error');
  } finally {
    output.setAttribute('aria-busy', 'false');
  }
}

// Cherche si le fichier actuellement chargé dans Analyse a déjà des pistes
// séparées dans Studio, en comparant metadata.json.sourcePath de chaque piste.
async function findExistingStemsForPath(audioPath, preferredStem = 'piano') {
  const api = window.electronAPI;
  if (!api?.files?.homeDir || !api?.files?.readDir || !api?.files?.readFile || !audioPath) return null;
  try {
    const home = await api.files.homeDir();
    const studioDir = home + '/PianoJazzChords/Studio';
    let entries = [];
    try {
      entries = await api.files.readDir(studioDir);
    } catch (_) {
      return null;
    }
    const trackNames = (entries || [])
      .map((e) => (typeof e === 'string' ? e : e.name))
      .filter((name) => name && name.startsWith('Track_'));

    for (const trackName of trackNames) {
      try {
        const metaJson = await api.files.readFile(studioDir + '/' + trackName + '/metadata.json');
        const meta = JSON.parse(metaJson || '{}');
        if (meta.sourcePath !== audioPath) continue;

        const preferredPath = studioDir + '/' + trackName + '/stems/' + preferredStem + '.wav';
        const fallbackPath = studioDir + '/' + trackName + '/stems/vocals.wav';
        if (api.files.stat) {
          if (await api.files.stat(preferredPath).catch(() => null)) return preferredPath;
          if (await api.files.stat(fallbackPath).catch(() => null)) return fallbackPath;
          return null;
        }
        return preferredPath;
      } catch (_) {
        continue;
      }
    }
  } catch (_) {
    return null;
  }
  return null;
}

// Remplace runReharmonizationDemo comme gestionnaire du bouton principal.
async function runReharmonizationFromCurrentFile() {
  const output = els.reharmResults;
  if (!output) return;
  if (!currentAudioPath) {
    renderReharmonizationError(output, 'Aucun fichier audio chargé dans Analyse.', 'NoFile');
    return;
  }
  const existingStemPath = await findExistingStemsForPath(currentAudioPath, 'piano');
  await runReharmonizationFromAudio(existingStemPath || undefined, 'piano');
}

// [OpenCode] — 2026-08-24 — EXP-027 Étape 2 : réharmonisation depuis un stem
// audio sélectionné (vocals/piano/other) déjà séparé dans le Studio.
async function runReharmonizationFromAudio(stemPath, stemKind = 'vocals') {
  const output = els.reharmResults;
  if (!output) return;

  const api = window.electronAPI;
  if (!api?.studio?.selectAudioFile) {
    renderReharmonizationError(output, 'IPC Studio non disponible.', 'NoIPC');
    return;
  }

  if (!stemPath) {
    stemPath = await api.studio.selectAudioFile();
    if (!stemPath) return;
  }

  let harmonicKey = null;
  try {
    const stemDir = stemPath.includes('/stems/') ? stemPath.split('/stems/')[0] : null;
    if (stemDir && api.analyzer?.processFile) {
      const fs = api.files;
      const candidates = ['original.mp3', 'original.mp4', 'original.m4a', 'original.wav'];
      let originalPath = null;
      for (const c of candidates) {
        const candidate = stemDir + '/' + c;
        try {
          const stat = await fs?.stat?.(candidate);
          if (stat) { originalPath = candidate; break; }
        } catch (_) { /* try next */ }
      }
      if (originalPath) {
        const analysis = await api.analyzer.processFile(originalPath, { analyzeBass: false });
        if (analysis && analysis.key) {
          harmonicKey = { key: analysis.key, mode: analysis.keyMode || 'major' };
        }
      }
    }
  } catch (err) {
    console.warn('[Reharm] Chordify key detection échouée:', err);
  }

  output.setAttribute('aria-busy', 'true');
  renderReharmonizationLoading(output);
  await new Promise((resolve) => requestAnimationFrame(resolve));

  try {
    const extracted = await extractAudioMelody(stemPath, {
      name: `Mélodie extraite (${stemKind})`,
      ipcOptions: {},
      harmonicKey,
    });

    if (extracted.status !== 'success') {
      renderReharmonizationError(output, extracted.message, extracted.errorKind);
      return;
    }

    const viewModel = buildReharmonizationVariantsViewModel({
      track: extracted.wrapper.track,
      harmonicContext: extracted.wrapper.harmonicContext,
      styleId: getReharmActiveStyle(),
    });

    if (viewModel.status === 'success') {
      const meta = Object.freeze({
        isDemo: false,
        isLive: false,
        isAudio: true,
        label: 'Réharmonisation depuis fichier audio',
        description: `${extracted.noteCount} notes extraites du stem « ${stemKind} ».`,
        track: extracted.wrapper.track,
        harmonicContext: extracted.wrapper.harmonicContext,
      });
      lastReharmVariantsVm = viewModel;
      lastReharmMeta = meta;
      renderReharmonizationVariants(output, viewModel, meta);
      updateReharmContext(meta, viewModel);
    } else {
      renderReharmonizationError(output, viewModel.message, viewModel.errorKind);
    }
  } catch (err) {
    renderReharmonizationError(output, err && err.message ? err.message : 'Erreur inattendue.', 'Error');
  } finally {
    output.setAttribute('aria-busy', 'false');
  }
}

// [OpenCode] — 2026-08-24 — EXP-030 Tâche A : réharmonisation depuis une
// session enregistrée.
async function runReharmonizationFromSession(sessionId) {
  const output = els.reharmResults;
  if (!output) return;

  const api = window.electronAPI;
  if (!api?.files?.homeDir || !api?.files?.readDir || !api?.files?.readFile) {
    renderReharmonizationError(output, 'IPC fichiers non disponible.', 'NoIPC');
    return;
  }

  if (!sessionId) {
    const home = await api.files.homeDir();
    const sessionsDir = home + '/PianoJazzChords/Sessions';
    let dirs = [];
    try {
      dirs = await api.files.readDir(sessionsDir);
    } catch (_) { /* dossier inexistant */ }
    if (!dirs || dirs.length === 0) {
      showToast('Aucune session enregistrée trouvée.', 3000);
      return;
    }
    sessionId = typeof dirs[0] === 'string' ? dirs[0] : dirs[0].name;
  }

  output.setAttribute('aria-busy', 'true');
  renderReharmonizationLoading(output);
  await new Promise((r) => requestAnimationFrame(r));

  try {
    const home = await api.files.homeDir();
    const sessionsDir = home + '/PianoJazzChords/Sessions';
    const eventsJson = await api.files.readFile(sessionsDir + '/' + sessionId + '/events.json');
    const sessionJson = await api.files.readFile(sessionsDir + '/' + sessionId + '/session.json').catch(() => '{}');
    const events = JSON.parse(eventsJson || '[]');
    const session = JSON.parse(sessionJson || '{}');

    const wrapperResult = buildSessionMelodyWrapper({ events, session }, { name: sessionId });
    if (wrapperResult.status !== 'success') {
      renderReharmonizationError(output, wrapperResult.message, wrapperResult.errorKind);
      return;
    }

    const viewModel = buildReharmonizationVariantsViewModel({
      ...wrapperResult.wrapper,
      styleId: getReharmActiveStyle(),
    });
    if (viewModel.status === 'success') {
      const meta = Object.freeze({
        isDemo: false,
        isLive: false,
        isAudio: false,
        isSession: true,
        label: 'Réharmonisation depuis session enregistrée',
        description: `${wrapperResult.noteCount} notes de la session « ${sessionId} ».`,
        track: wrapperResult.wrapper.track,
        harmonicContext: wrapperResult.wrapper.harmonicContext,
      });
      lastReharmVariantsVm = viewModel;
      lastReharmMeta = meta;
      renderReharmonizationVariants(output, viewModel, meta);
      updateReharmContext(meta, viewModel);
    } else {
      renderReharmonizationError(output, viewModel.message, viewModel.errorKind);
    }
  } catch (err) {
    renderReharmonizationError(output, err && err.message ? err.message : 'Erreur inattendue.', 'Error');
  } finally {
    output.setAttribute('aria-busy', 'false');
  }
}