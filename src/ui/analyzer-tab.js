import { formatMusicChord, formatMusicNote, notationOptions } from './music-notation.js';
import { normalizeGridSettings, effectiveGridTempo } from '../analyzer/musical-grid.js';
import { readGridView } from '../analyzer/grid-project.js';
import { createAnalysisMusicView as createMusicalGridView } from './components/analysis-music-view.js';
import { selectMediaFile, selectAnalysisFile, createAudioPlayer, isSupportedMediaFile, isAudioFile, isVideoFile } from '../audio/media-engine.js';
import { createRegionPlayer } from './components/analyzer-region-player.js';
import { globalAudioFocusManager } from '../audio/audio-focus-manager.js';
import { createAudioAnalyzer } from '../analyzer/audio-analyzer.js';
import {
  exportAnalysisToMidi,
  exportAnalysisToJson,
  exportAnalysisToCsv,
  exportAnalysisToText,
  countManuallyEditedChords,
} from '../analyzer/analysis-export.js';
import {
  inferSourceType, shouldOfferRegionSelection,
  REGION_SKIP_BELOW_SECONDS, REGION_DEFAULT_SECONDS,
} from './analyzer-workflow.js';
import { analyzeMidiFile, ensureMidiPlayback } from '../analyzer/midi-render.js';
import { buildHarmonicContexts, harmonicContextAt } from '../analyzer/principal-chords.js';
import { harmonicRole, selectChordProgression } from '../analyzer/structural-progression.js';
import { miniKeyboardForNotes } from './mini-keyboard.js';
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
import { ANALYSIS_ENGINE_VERSION, isEngineOutdated, engineLabel } from '../analyzer/engine-versions.js';
import { fitChordLabel } from './chord-label-fit.js';
import { notifyOnboarding } from './onboarding.js';
import { initAnalysisWaitingTips } from './components/analysis-waiting-tips.js';
import {
  initCorrigerPanel,
  renderCorriger,
} from './corriger-panel.js';
import { playNote, releaseNote, resumeAudio } from '../audio/simple-synth.js';
import { listTracks, loadMetadata, getOriginalPath, importToLibrary, renameTrack, deleteTrack } from './media-library.js';
import { appConfirm, appDialog } from './components/app-dialog.js';
import { notify } from './components/app-notify.js';
import { fillLibraryTrackButton } from './components/library-track-view.js';

// [Claude] — 2026-10-13 — Messages d'erreur dans la notification de l'application, et non plus
// dans une fenêtre du système (alert).
function notifyError(text) {
  const [title, ...rest] = String(text).split(/\s*(?: : |\n\n)\s*/);
  notify({ id: 'analyzer-error', tone: 'error', title, message: rest.join(' : '), duration: 10000 });
}

// [Refonte Astra Analyse 12/09] — icônes du transport (Lucide recopiées en SVG
// inline : aucune dépendance ajoutée).
const AN_PLAY_SVG = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m7 4 13 8-13 8z" fill="currentColor"/></svg>';
const AN_PAUSE_SVG = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M9 5v14M15 5v14"/></svg>';

const BASE_PIXELS_PER_SECOND = 80;
const MIN_BLOCK_WIDTH = 4;
const BLOCK_GAP = 4;

let timelineZoom = 1.0;
let chordGridExpanded = false;
let sectionBeforeGrid = 'grid';
let gridSettings = normalizeGridSettings();
let gridRhythm = null;
let gridRhythmRequest = null;
let gridRhythmAnalysis = null;
let musicalGridView = null;

let undoStack = [];
let redoStack = [];
const MAX_UNDO = 50;

let chordEditor = null;

const els = {
  importScreen: document.getElementById('analyzer-import-screen'),
   importBtn: document.getElementById('analyzer-import-btn'),
   midiBackBtn: document.getElementById('analyzer-midi-back-btn'),
  importAudioBtn: document.getElementById('analyzer-import-audio-btn'),
  libraryList: document.getElementById('analyzer-library-list'),
  results: document.getElementById('analyzer-results'),
  backToImportBtn: document.getElementById('analyzer-back-to-import-btn'),

  // Étape de région avant analyse (2026-10-21, fichiers longs).
  regionScreen: document.getElementById('analyzer-region-screen'),
  regionSubtitle: document.getElementById('analyzer-region-subtitle'),
  regionSummary: document.getElementById('analyzer-region-summary'),
  regionConfirmBtn: document.getElementById('analyzer-region-confirm-btn'),
  regionFullBtn: document.getElementById('analyzer-region-full-btn'),
  regionBackBtn: document.getElementById('analyzer-region-back-btn'),

  // États du workspace (maquettes) — [Claude] 2026-10-19 : l'écran « Préparer
  // l'analyse » est retiré ; seuls restent l'import et les résultats.
  analysisTab: document.getElementById('analysis-tab'),
  sidebar: document.getElementById('analyzer-sidebar'),

  // Type vidéo

  songTitle: document.getElementById('analyzer-song-title'),

  prevBtn: document.getElementById('analyzer-prev-btn'),
  skipBackBtn: document.getElementById('analyzer-skip-back-btn'),
  skipFwdBtn: document.getElementById('analyzer-skip-fwd-btn'),
  playBtn: document.getElementById('analyzer-play-btn'),
  progressTrack: document.getElementById('analyzer-progress-track'),
  progressFill: document.getElementById('analyzer-progress-fill'),
  progressThumb: document.getElementById('analyzer-progress-thumb'),
  currentTimeEl: document.getElementById('analyzer-current-time'),
  durationEl: document.getElementById('analyzer-duration'),

  zoomSlider: document.getElementById('analyzer-zoom'),
  zoomValue: document.getElementById('analyzer-zoom-value'),

  chordTimeline: document.getElementById('analyzer-chord-timeline'),
  progressionRibbon: document.getElementById('analyzer-progression-ribbon'),
  musicalGrid: document.getElementById('analyzer-musical-grid'),
  gridMeter: document.getElementById('analyzer-grid-meter'),
  gridView: document.getElementById('analyzer-grid-view'),
  gridTempo: document.getElementById('analyzer-grid-tempo'),
  gridStatus: document.getElementById('analyzer-grid-status'),
  gridHalf: document.getElementById('analyzer-grid-half'),
  gridDouble: document.getElementById('analyzer-grid-double'),
  gridSignature: document.getElementById('analyzer-grid-signature'),
  gridPhase: document.getElementById('analyzer-grid-phase'),
  gridOffset: document.getElementById('analyzer-grid-offset'),
  gridBpm: document.getElementById('analyzer-grid-bpm'),
  gridAlign: document.getElementById('analyzer-grid-align'),
  gridAnchor: document.getElementById('analyzer-grid-anchor'),
  gridReset: document.getElementById('analyzer-grid-reset'),
  gridTab: document.getElementById('analyzer-grid-tab'),
  tabNav: document.getElementById('analyzer-section-tabs'),
  panelsHost: document.getElementById('analyzer-section-panels'),
  chordTimelineInner: document.getElementById('analyzer-chord-timeline-inner'),
  reanalyzeBtn: document.getElementById('analyzer-reanalyze-btn'),
  staleBanner: document.getElementById('analyzer-stale-banner'),
  timelineScrollLeft: document.getElementById('analyzer-timeline-scroll-left'),
  timelineScrollRight: document.getElementById('analyzer-timeline-scroll-right'),

  audioContainer: document.getElementById('analyzer-audio-container'),

  sectionTabs: document.querySelectorAll('#analyzer-section-tabs button[data-section]'),
  sectionPanels: document.querySelectorAll('#analyzer-section-panels > [data-section]'),

  exportMidiBtn: document.getElementById('analyzer-export-midi-btn'),
  exportJsonBtn: document.getElementById('analyzer-export-json-btn'),
  exportCsvBtn: document.getElementById('analyzer-export-csv-btn'),
  copyTextBtn: document.getElementById('analyzer-copy-text-btn'),
  musicContext: document.getElementById('analyzer-music-context'),
  contextKey: document.getElementById('analyzer-context-key'),
  contextTempo: document.getElementById('analyzer-context-tempo'),
  contextChords: document.getElementById('analyzer-context-chords'),
  contextAnnouncement: document.getElementById('analyzer-context-announcement'),
  processing: document.getElementById('analyzer-processing'),
  processingText: document.getElementById('analyzer-processing-text'),
  processingElapsed: document.getElementById('analyzer-processing-elapsed'),

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
// Étape de région (2026-10-21) : region confirmée (passée au moteur), ou null
// pour analyser le fichier entier. regionDuration/regionPlayer/regionStart/
// regionEnd ne vivent que pendant que l'écran de région est affiché.
let currentRegion = null;
let regionDuration = 0;
let regionPlayer = null;
let regionStart = 0;
let regionEnd = 0;
let isDraggingProgress = false;
let lastAutoScrollIndex = -1;
let selectedSegmentId = null; // segmentId sélectionné dans la timeline

// [Claude] — 2026-10-25 — Le « repli progressif » est retiré. Un accord non
// structurel plus étroit que 26 px se réduisait à un trait pâle de 3 px, sans
// étiquette. Narcisse, après avoir ouvert « Saint Esprit » : « les cases vides,
// tu me les enlèves. Je préfère avoir une étiquette parasite plutôt que de voir
// une case vide. » Sur ce morceau, 35 segments sur 161 se repliaient — un
// accord sur cinq se lisait comme un blanc, donc comme un silence.
//
// À la place, toute pastille garde sa pleine couleur et porte au moins sa
// fondamentale : en dessous de cette largeur, elle s'élargit juste assez pour
// que « D# » ou « Bb » tienne à la plus petite police. Le léger empiètement sur
// la voisine est le prix accepté — un vide trompe, un chevauchement non.
const LABEL_MIN_BLOCK_PX = 20;

// Pas de navigation rapide, en secondes.
const SKIP_SECONDS = 10;

const ROLE_LABELS = {
  structural: 'Accord structurel',
  passing: 'Accord de passage',
  uncertain: 'Détection incertaine',
  silence: 'Silence',
};

// Rôle partagé entre la sélection des piliers et leurs libellés.
function segmentRole(segment) {
  return harmonicRole(segment);
}

// [Refonte Analyse 02/10] — l'écran de capture MIDI de l'onglet Analyse a été
// retiré : les Sessions MIDI de l'onglet Entraînement font déjà ce travail. Son
// état (compteur, badges) et la capture de mélodie live qui s'y greffait sont
// partis avec lui. La capture live n'avait d'ailleurs plus d'interface depuis
// un moment : els.reharmLive / els.reharmLiveStatus n'existaient dans aucun
// markup, et runReharmonizationLive() n'avait aucun appelant.
// Retourne l'accord affiché selon le mode timeline actuel.
function getDisplayChords() {
  // Une source MIDI ne masque rien : voir selectChordProgression.
  const sourceType = currentAnalysis?.sourceType ?? null;
  return selectChordProgression(currentAnalysis?.chords || [], { sourceType });
}

function getDisplayAnalysis() {
  return { ...currentAnalysis, chords: getDisplayChords() };
}

// Phase B : persistance
let projectDirty = false;
let projectRevision = 0;
let projectSaveQueue = Promise.resolve();
let projectPath = null;
let audioIdentity = null;
let currentProjectOrphanedOverrides = {};

export function initAnalyzerTab() {
  analyzer = createAudioAnalyzer();
  bindImportButton();
  bindPlayerControls();
  bindToolbar();
  initTimelineZoom();
  bindTimelineScroll();
  bindMusicalGrid();
  bindGridPresentation();
  lastNotation = JSON.stringify(notationOptions());
  window.addEventListener('keyboard-settings-changed', refreshAnalysisNotation);
  els.reanalyzeBtn?.addEventListener('click', () => { reanalyzeCurrentTrack(); });
  bindSectionTabs();
  bindExportMidiButton();
  bindExportJsonButton();
  bindCopyTextButton();
  initChordEditor();
  initKeyboardShortcuts();
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
    onExportCsv: () => handleExportCsv(),
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
  // Mêmes états que ANALYSIS_STATES dans analyzer-workflow.js, que
  // test-analysis-workflow.js garde synchronisé.
  const states = ['import', 'region', 'analysis'];
  if (!states.includes(state)) return;

  if (state !== 'region') regionPlayer?.pause();

  // Réinitialiser tous les états
  els.importScreen?.classList.remove('active');
  els.regionScreen?.classList.remove('active');
  els.results?.classList.remove('active');

  switch (state) {
    case 'import':
      els.importScreen?.classList.add('active');
      break;
    case 'region':
      els.regionScreen?.classList.add('active');
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
  els.importAudioBtn?.addEventListener('click', () => handleImportClick());
  els.importBtn?.addEventListener('click', () => handleImportClick());
  initImportDropzone(els.importAudioBtn);

  // Étape de région (2026-10-21).
  els.regionConfirmBtn?.addEventListener('click', () => confirmRegionSelection());
  els.regionFullBtn?.addEventListener('click', () => analyzeWholeFile());
  els.regionBackBtn?.addEventListener('click', () => resetAnalysisSession());

  // [Claude] — 2026-10-19 — Plus d'écran « Préparer l'analyse » (Narcisse : « supprime cette
  // étape ») ni d'écran « Quel type de vidéo » (2026-10-09) : sélectionner une source lance
  // directement l'analyse (loadAnalysisSource → launchAnalysisFromPrepare).

  // Retour à l'accueil (« Nouvelle analyse ») : reset centralisé, jamais reload.
  els.backToImportBtn?.addEventListener('click', resetAnalysisSession);
  els.midiBackBtn?.addEventListener('click', resetAnalysisSession);

  // [OpenCode] — 2026-08-08 — Capture MIDI : câblage des métriques du panneau
  // droit « État de la session ». Le moteur de capture réel reste
  // src/melody/midi-capture.js ; ici on alimente l'UI (durée, badges, statut).
}

// [OpenCode] — Passe corrective — Le bouton d'import global est déjà lié dans
// initWorkspaceStates (handleImportClick('audio')) ; on évite un double file
// picker. bindImportButton est conservé comme point d'accroche éventuel.
function bindImportButton() {
}

async function refreshLibraryList() {
  if (!els.libraryList) return;
  els.libraryList.setAttribute('aria-busy', 'true');
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
    els.libraryList.innerHTML = '<p class="analyzer-library-empty">Impossible de charger la bibliothèque. Fermez cette fenêtre puis réessayez.</p>';
  } finally {
    els.libraryList.setAttribute('aria-busy', 'false');
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

    const row = document.createElement('div');
    row.className = 'analyzer-library-row';

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'analyzer-library-item';
    fillLibraryTrackButton(btn, metadata, track.id);
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
    menuBtn.setAttribute('aria-label', `Actions pour ${displayName}`);
    menuBtn.setAttribute('aria-expanded', 'false');

    const menu = document.createElement('div');
    menu.className = 'analyzer-library-menu';

    // Renommer
    const renameItem = document.createElement('button');
    renameItem.type = 'button';
    renameItem.className = 'analyzer-library-menu-item';
    renameItem.textContent = 'Renommer';
    renameItem.addEventListener('click', () => {
      menuBtn.setAttribute('aria-expanded', 'false');
      menu.classList.remove('open');
      promptRenameTrack(track, displayName);
    });
    menu.appendChild(renameItem);

    // Supprimer
    const deleteItem = document.createElement('button');
    deleteItem.type = 'button';
    deleteItem.className = 'analyzer-library-menu-item danger';
    deleteItem.textContent = 'Supprimer';
    deleteItem.addEventListener('click', () => {
      menuBtn.setAttribute('aria-expanded', 'false');
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
        if (m !== menu) {
          m.classList.remove('open');
          m.previousElementSibling?.setAttribute('aria-expanded', 'false');
        }
      });
      const willOpen = !menu.classList.contains('open');
      if (willOpen) {
        // Calculer l'espace disponible sous le bouton
        const btnRect = menuBtn.getBoundingClientRect();
        const viewportHeight = Math.min(window.innerHeight, els.libraryList.getBoundingClientRect().bottom);
        const estimatedMenuHeight = 90; // 2 items × ~45px chacun
        const spaceBelow = viewportHeight - btnRect.bottom;
        if (spaceBelow < estimatedMenuHeight) {
          menu.classList.add('up');
        } else {
          menu.classList.remove('up');
        }
      }
      menu.classList.toggle('open');
      menuBtn.setAttribute('aria-expanded', String(willOpen));
    });

    menuContainer.appendChild(menuBtn);
    menuContainer.appendChild(menu);
    row.appendChild(menuContainer);
    els.libraryList.appendChild(row);
  }
}

// Un seul écouteur : les rafraîchissements ne conservent pas les anciennes lignes.
document.addEventListener('click', (event) => {
  document.querySelectorAll('.analyzer-library-menu.open').forEach((menu) => {
    if (!menu.parentElement.contains(event.target)) {
      menu.classList.remove('open');
      menu.previousElementSibling?.setAttribute('aria-expanded', 'false');
    }
  });
});

async function promptRenameTrack(track, currentName) {
  const newName = await showRenameModal(currentName);
  if (!newName || newName.trim() === '' || newName.trim() === currentName) return;
  try {
    await renameTrack(track.id, newName.trim());
    await refreshLibraryList();
  } catch (err) {
    console.error('[Analyzer] rename failed:', err);
    notifyError(`Erreur lors du renommage : ${err.message}`);
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
    notifyError(`Erreur lors de la suppression : ${err.message}`);
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
// réutilise exactement le même chemin que l'import manuel : audio et vidéo MP4
// passent tous deux par le même lancement. Aucun pipeline parallèle entre
// manuel et bibliothèque.
// [Claude] — 2026-10-19 — L'écran « Préparer l'analyse » est retiré (Narcisse :
// « supprime cette étape ») : il n'offrait qu'un récapitulatif du fichier et
// quatre cases à cocher jamais lues par le code. Sélectionner un fichier lance
// désormais l'analyse directement. Un morceau déjà analysé revient toujours à
// ses résultats sans recalcul.
async function loadAnalysisSource(sourceType, filePath, fileName) {
  if (!filePath) return;
  currentAudioPath = filePath;
  currentFileName = fileName || filePath.split('/').pop() || filePath.split('\\').pop() || filePath;
  currentSourceType = sourceType;
  currentRegion = null;

  // Discrimination audio/vidéo par extension (auto-détection fiable du format).
  const ext = (filePath.split('.').pop() || '').toLowerCase();
  currentSourceType = inferSourceType(ext, currentSourceType);

  // Un morceau déjà analysé revient directement à ses résultats : l'analyse
  // est relue depuis le projet .pjc.json plutôt que recalculée. Exigence du
  // niveau 6 de la Definition of Done.
  if (await restoreSavedAnalysis(filePath)) return;

  await prepareRegionStep();
}

/**
 * [Claude] — 2026-10-21 — Étape de région avant analyse : un fichier audio/vidéo
 * assez long propose de choisir un passage plutôt que d'attendre le calcul sur
 * l'intégralité. Ne bloque jamais l'analyse : toute erreur (IPC indisponible,
 * extraction échouée) retombe sur l'analyse du fichier entier, comme avant.
 */
async function prepareRegionStep() {
  if (currentSourceType === 'midi' || !window.electronAPI?.analyzer?.prepareRegion) {
    await launchAnalysisFromPrepare();
    return;
  }
  showProcessing('Préparation…');
  try {
    const info = await window.electronAPI.analyzer.prepareRegion(currentAudioPath, {
      skipBelowSeconds: REGION_SKIP_BELOW_SECONDS,
    });
    hideProcessing();
    if (!info?.wavPath || !shouldOfferRegionSelection(info.duration, currentSourceType)) {
      await launchAnalysisFromPrepare();
      return;
    }
    await showRegionScreen(info.duration, info.wavPath);
  } catch (err) {
    console.warn('[Analyzer] région indisponible, analyse du fichier entier :', err.message);
    hideProcessing();
    await launchAnalysisFromPrepare();
  }
}

/** Chemin déjà choisi par l'utilisateur (dialogue natif ou glisser-déposer) : valide le format et lance l'analyse. */
function importAnalysisFile(filePath) {
  if (!filePath) return;
  // Validation défensive : refuser un format qui aurait contourné le filtre natif ou la
  // liste blanche du glisser-déposer (electron/main.js, files:approve-dropped-file).
  if (!isAudioFile(filePath) && !isVideoFile(filePath) && inferSourceType(filePath) !== 'midi') {
    notifyError('Format non supporté\n\nFormats acceptés : MP3, WAV, M4A, MP4, MIDI.');
    return;
  }
  loadAnalysisSource(inferSourceType(filePath, 'audio'), filePath);
}

async function handleImportClick() {
  if (analysisRunning) {
    showToast('Une analyse est en cours : attendez qu’elle se termine avant d’importer.', 4000, 'warning');
    return;
  }
  try {
    // [Claude] — 2026-10-09 — MP4 accepté (Narcisse : « dans l'onglet Analyse, ajouter aussi les
    // fichiers MP4 ») : le son en est extrait par ffmpeg, comme pour la bibliothèque.
    const filePath = await selectAnalysisFile();
    importAnalysisFile(filePath);
  } catch (err) {
    console.error('[Analyzer] import failed:', err);
    notifyError(`Erreur d'import : ${err.message}`);
  }
}

/**
 * Glisser-déposer sur la carte d'import (Narcisse, 20/10, d'après la maquette retenue pour
 * Velours). Le drop est traité comme un choix de fichier explicite par l'utilisateur — il l'a
 * lui-même fait glisser depuis son Finder/Explorateur — et passe par le même garde-fou
 * d'approbation que le dialogue natif (electron/main.js, files:approve-dropped-file), jamais une
 * copie silencieuse d'un chemin arbitraire.
 */
function initImportDropzone(target) {
  if (!target || !window.electronAPI?.getPathForFile || !window.electronAPI?.files?.approveDroppedFile) return;
  let dragDepth = 0;
  const setDragOver = (on) => target.classList.toggle('is-dragover', on);
  target.addEventListener('dragenter', (e) => {
    if (!Array.from(e.dataTransfer?.types || []).includes('Files')) return;
    e.preventDefault();
    dragDepth += 1;
    setDragOver(true);
  });
  target.addEventListener('dragover', (e) => {
    if (!Array.from(e.dataTransfer?.types || []).includes('Files')) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  });
  target.addEventListener('dragleave', () => {
    dragDepth = Math.max(0, dragDepth - 1);
    if (dragDepth === 0) setDragOver(false);
  });
  target.addEventListener('drop', async (e) => {
    e.preventDefault();
    dragDepth = 0;
    setDragOver(false);
    if (analysisRunning) {
      showToast('Une analyse est en cours : attendez qu’elle se termine avant d’importer.', 4000, 'warning');
      return;
    }
    const file = e.dataTransfer?.files?.[0];
    if (!file) return;
    if (e.dataTransfer.files.length > 1) {
      notifyError('Déposez un seul fichier à la fois.');
      return;
    }
    try {
      const rawPath = window.electronAPI.getPathForFile(file);
      const approvedPath = await window.electronAPI.files.approveDroppedFile(rawPath);
      if (!approvedPath) {
        notifyError('Format non supporté\n\nFormats acceptés : MP3, WAV, M4A, MP4, MIDI.');
        return;
      }
      importAnalysisFile(approvedPath);
    } catch (err) {
      console.error('[Analyzer] drop import failed:', err);
      notifyError(`Erreur d'import : ${err.message}`);
    }
  });
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
      notifyError('Fichier original introuvable.');
      return;
    }
    // Gestion propre des entrées orphelines (fichier supprimé).
    const exists = await window.electronAPI?.files?.exists?.(originalPath);
    if (exists === false) {
      notifyError('Fichier introuvable dans la bibliothèque. Réimportez-le.');
      return;
    }
    const name = track.metadata?.name || track.id;
    const sourceType = inferSourceType(originalPath, 'audio');
    resetAnalysisSession();
    loadAnalysisSource(sourceType, originalPath, name);
  } catch (err) {
    console.error('[Analyzer] library track load failed:', err);
    notifyError(`Erreur de chargement : ${err.message}`);
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

    // Version du moteur : une analyse enregistrée avec une autre vitesse
    // du moteur (avant les tonalités locales, par exemple) ne décrit pas
    // ce que le moteur sortirait aujourd'hui — calibration des couches
    // changeante. On recalcule, puis le resauvegarde porte la bonne version.
    // Version du moteur. On ne recalcule PLUS de force : une analyse produite
    // par un moteur plus ancien reste lisible, et un recalcul impose plusieurs
    // minutes d'attente sans l'avoir demandé. On la restaure, et un bandeau
    // PERSISTANT dit d'où elle vient — jusqu'au clic sur « Relancer ».
    //
    // Narcisse : « tant que l'utilisateur n'a pas cliqué sur le bouton
    // relancer, il faut laisser le message là où il est […] il se peut qu'il
    // ait juste le dos tourné et qu'il ne voie pas ce message, et quand il
    // arrive sur l'analyse et qu'il voit qu'il y a des soucis, tout de suite il
    // fait remonter un problème qui a déjà été réglé. »
    if (!cached.engine) {
      // Analyse d'avant l'exposition de la version : trop ancienne pour être lue.
      return false;
    }
    const engineOutdated = isEngineOutdated(cached.engine);

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
    // [Claude] — 2026-10-09 — Un MIDI n'a pas de son à extraire : son WAV d'écoute est rendu.
    const playback = currentSourceType === 'midi'
      ? { wavPath: await ensureMidiPlayback(filePath).catch(() => null) }
      : await window.electronAPI?.analyzer?.preparePlayback?.(filePath);
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

    currentAnalysis = analysis;
    await showResults(analysis);
    // Le bandeau est posé par showResults, qui vient d'être appelé.
    if (!engineOutdated) showToast('Analyse enregistrée rechargée — aucun recalcul.', 4000);
    return true;
  } catch (err) {
    console.warn('[Analyzer] restauration impossible, analyse normale :', err);
    hideProcessing();
    return false;
  }
}

/**
 * Affiche l'avertissement d'analyse rechargée, et l'y laisse.
 *
 * Il ne disparaît QUE lorsque l'analyse est relancée — pas au bout de quelques
 * secondes, pas au premier clic ailleurs. C'est la demande de Narcisse, et elle
 * évite de faire remonter des défauts déjà corrigés depuis.
 */
function showStaleBanner(engine) {
  const banner = els.staleBanner;
  if (!banner) return;
  const texte = banner.querySelector('.an-stale-text');
  if (texte) {
    texte.textContent = `Cette analyse a été enregistrée par un ${engineLabel(engine)}. `
      + 'Les accords affichés ne sont pas ceux que la version actuelle trouverait.';
  }
  const action = banner.querySelector('.an-stale-action');
  if (action && !action.dataset.bound) {
    action.dataset.bound = '1';
    action.addEventListener('click', () => { reanalyzeCurrentTrack(); });
  }
  banner.hidden = false;
}

/** Retire l'avertissement : uniquement quand l'analyse a été refaite. */
function hideStaleBanner() {
  if (els.staleBanner) els.staleBanner.hidden = true;
}

/**
 * Relance une analyse complète sur le morceau courant, en écrasant le cache.
 *
 * [Claude] — 2026-10-28 — Narcisse : avant de relancer, un message doit rappeler
 * ce que l'utilisateur s'apprête à faire — pas seulement quand il y a des
 * corrections manuelles à perdre. Et pour un fichier qui dépasse le seuil de
 * l'étape de région (6 min, REGION_SKIP_BELOW_SECONDS), la relance doit
 * repasser par cette étape plutôt que recalculer tout le fichier d'un coup —
 * exactement ce que prepareRegionStep() fait déjà au premier import. Un
 * fichier déjà court ne voit toujours rien de plus que l'avertissement.
 */
async function reanalyzeCurrentTrack() {
  if (!currentAudioPath) return;
  const hasEdits = (currentAnalysis?.chords || []).some((seg) => seg.manualOverride);
  const message = hasEdits
    ? 'Tous les accords de ce morceau vont être recalculés depuis l’audio. Vos corrections '
      + 'manuelles seront réappliquées quand le segment correspondant existe encore, et '
      + 'conservées de côté sinon.'
    : 'Tous les accords de ce morceau vont être recalculés depuis l’audio. Pour un fichier '
      + 'long, cela peut prendre plusieurs minutes.';
  if (!await appConfirm({
    title: 'Relancer l’analyse ?',
    message,
    confirmLabel: 'Relancer l’analyse',
  })) return;
  // [Claude] — 2026-10-28 — Arrêter la lecture ICI, dès la confirmation : pour un
  // fichier long, prepareRegionStep() peut maintenant passer par l'étape de
  // région avant launchAnalysisFromPrepare() (qui fait ce même arrêt), et
  // setAnalyzerState('region') ne coupe pas le lecteur des résultats.
  hideStaleBanner();
  currentPlayer?.pause();
  await prepareRegionStep();
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
    els.reanalyzeBtn,
    els.importAudioBtn,
    els.importBtn,
  ];
  for (const el of controls) {
    if (!el) continue;
    el.disabled = disabled;
    el.setAttribute('aria-disabled', String(disabled));
  }
}

// ---------------------------------------------------------------------------
// Étape avant analyse : écouter le morceau et poser les repères du passage.
// ---------------------------------------------------------------------------

function formatRegionDuration(seconds) {
  const total = Math.max(0, Math.round(seconds));
  const m = Math.floor(total / 60);
  const s = total % 60;
  if (m === 0) return `${s} s`;
  if (s === 0) return `${m} min`;
  return `${m} min ${s} s`;
}

async function showRegionScreen(duration, wavPath) {
  regionDuration = duration;
  regionStart = 0;
  regionEnd = Math.min(duration, REGION_DEFAULT_SECONDS);
  if (els.regionSubtitle) {
    els.regionSubtitle.textContent = `Ce morceau dure ${formatRegionDuration(duration)}. `
      + 'Écoutez-le, puis indiquez le début et la fin du passage à étudier.';
  }
  regionPlayer?.destroy();
  regionPlayer = createRegionPlayer(document.getElementById('analyzer-region-player'), {
    duration, start: regionStart, end: regionEnd,
    onChange: (start, end) => {
      regionStart = start;
      regionEnd = end;
      updateRegionUI();
    },
  });
  setAnalyzerState('region');
  updateRegionUI();
  const player = regionPlayer;
  try {
    const url = await loadAudioBlobUrl(wavPath);
    if (regionPlayer !== player) { URL.revokeObjectURL(url); return; }
    player.load(url);
  } catch (err) {
    if (regionPlayer === player) player.fail();
    console.warn('[Analyzer] préécoute indisponible :', err);
  }
}

function updateRegionUI() {
  if (els.regionSummary) {
    els.regionSummary.innerHTML = `Passage choisi : <strong>${formatTime(regionStart)}</strong> → `
      + `<strong>${formatTime(regionEnd)}</strong> (${formatRegionDuration(regionEnd - regionStart)} `
      + `sur ${formatRegionDuration(regionDuration)})`;
  }
}

function confirmRegionSelection() {
  currentRegion = { start: regionStart, end: regionEnd };
  launchAnalysisFromPrepare();
}

function analyzeWholeFile() {
  currentRegion = null;
  launchAnalysisFromPrepare();
}

async function launchAnalysisFromPrepare() {
  if (!currentAudioPath) return;
  if (analysisRunning) {
    showToast('Une analyse est déjà en cours.', 3000, 'warning');
    return;
  }
  // L'avertissement d'analyse ancienne ne disparaît qu'ICI : une analyse est
  // effectivement en train d'être refaite, c'est le seul moment où il cesse
  // d'être vrai.
  hideStaleBanner();
  // Arrêter la LECTURE aussi, pas seulement le lecteur de région. Narcisse :
  // « quand l'utilisateur appuie sur play, puis sur relancer […] il faut que
  // la piste s'arrête aussi. Le souci, c'est que vu qu'on a lancé une nouvelle
  // analyse, on ne peut pas appuyer sur stop. » Les commandes sont désactivées
  // pendant l'analyse : si le son continue, plus rien ne peut l'arrêter.
  regionPlayer?.pause();
  currentPlayer?.pause();
  analysisRunning = true;
  setAnalysisControlsDisabled(true);
  const midi = currentSourceType === 'midi';
  showProcessing(midi ? 'Lecture des notes du fichier MIDI…' : 'Extraction audio en cours…', { withElapsed: true });
  try {
    // [Claude] — 2026-10-09 — Un fichier MIDI : ses notes sont exactes, les accords en sont tirés
    // directement (pas de ffmpeg ni de chromagramme), et son écoute est rendue au piano.
    const analysis = midi
      ? await analyzeMidiFile(currentAudioPath)
      : await analyzer.analyze(currentAudioPath, currentRegion ? { region: currentRegion } : {});
    currentAnalysis = analysis;
    await showResults(analysis);
    // Ajouter à la bibliothèque en arrière-plan (pas un MIDI : la bibliothèque est celle du Studio,
    // qui sépare des pistes audio).
    if (!midi) importToLibrary(currentAudioPath).then(() => refreshLibraryList()).catch((e) => {
      console.warn('[Analyzer] library import failed:', e);
    });
  } catch (err) {
    console.error('[Analyzer] analysis failed:', err);
    hideProcessing();
    notifyError(`Erreur d'analyse : ${err.message}`);
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
  initAnalysisWaitingTips();
  const tab = document.getElementById('analysis-tab');
  tab?.classList.add('is-processing');
  tab?.setAttribute('aria-busy', 'true');
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
  const tab = document.getElementById('analysis-tab');
  tab?.classList.remove('is-processing');
  tab?.setAttribute('aria-busy', 'false');
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
  resetMusicalGrid();
  // L'avertissement est décidé ICI, le seul point par lequel TOUTE grille
  // passe — restaurée du disque, fraîchement calculée, ou déjà en mémoire.
  // Le poser dans la seule restauration ne suffisait pas : une analyse gardée
  // en mémoire depuis le début de la session n'empruntait pas ce chemin, et
  // Narcisse a rouvert son live sans voir le moindre avertissement.
  if (isEngineOutdated(analysis?.engine)) showStaleBanner(analysis?.engine);
  else hideStaleBanner();
  selectedSegmentId = null;
  enrichSegments(analysis.chords);
  resetUndoRedo();
  chordEditor?.close();
  resetZoom();
  renderHeader();
  markClean();
  await loadProjectIfExists();

  if (currentPlayer) {
    currentPlayer.destroy();
    currentPlayer = null;
  }

  // [Claude] — 2026-10-18 — Le lecteur se créait seulement si `analysis.wavPath` existait, et sans
  // aucun filet : un WAV temporaire nettoyé (~/PianoJazzChords/.work vidé au démarrage) ou une analyse
  // rouverte sans wav laissait `currentPlayer` null, donc TOUT le transport muet — Narcisse : « le
  // lecteur est bloqué, quand j'interagis rien ne se passe ». On tente maintenant de retrouver l'audio.
  await createPlayerForAnalysis(analysis);

  // [Claude] — 2026-10-28 — Le calage des pulsations part DÈS que l'analyse est là, et non
  //   à l'ouverture de la grille. Narcisse : « le calage audio se fait quand je vais voir la
  //   grille d'accord, et c'est un souci parce que je vais devoir encore attendre ». Il prend
  //   13 à 31 s, autant qu'il tourne pendant qu'on lit les résultats. Sans attendre : la grille
  //   s'affiche au tempo estimé puis se recale toute seule quand le calcul rend la main.
  ensureGridRhythm();

  renderTimeline(getDisplayChords(), analysis.duration || 0);
  updatePlayButton();
  renderOverview(getDisplayAnalysis());
  // La grille est l'entrée commune aux résultats neufs et aux projets rouverts.
  activateSectionTab('grid');
  updatePlaybackPosition(0);

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

function renderHeader() {
  const baseName = currentFileName.replace(/\.[^.]+$/, '') || 'Morceau importé';
  els.songTitle.textContent = baseName;
}

// [P0 Analyse] — Reset centralisé de la session Analyse.
// Utilisé par « Nouvelle analyse » / Retour. Stoppe le lecteur, libère les
// références média temporaires, nettoie l'état, remet la machine d'état à
// HOME. Ne touche en aucun cas au Studio ni à Electron (pas de reload).
export function resetAnalysisSession() {
  setChordGridExpanded(false);
  resetMusicalGrid();
  if (currentPlayer) {
    currentPlayer.destroy();
    currentPlayer = null;
  }
  hideProcessing();
  currentAnalysis = null;
  currentFileName = '';
  currentAudioPath = '';
  currentSourceType = null;
  currentRegion = null;
  regionDuration = 0;
  regionPlayer?.destroy();
  regionPlayer = null;
  selectedSegmentId = null;
  resetProjectState();
  resetUndoRedo();
  chordEditor?.close();
  els.chordTimelineInner.innerHTML = '';
  harmonicContexts = [];
  lastContextId = null;
  if (els.contextKey) els.contextKey.textContent = '—';
  if (els.contextChords) els.contextChords.textContent = '—';
  if (els.contextTempo) els.contextTempo.textContent = '—';
  // Retour à l’état vide explicite quand aucun fichier n’est analysé.
  setAnalyzerState('import');
  refreshLibraryList();
}

function showImportScreen() {
  resetAnalysisSession();
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
    if (!getDisplayChords().some((s) => s.segmentId === selectedSegmentId)) {
      selectedSegmentId = null;
    }
    lastAutoScrollIndex = -1;
    renderTimeline(getDisplayChords(), currentAnalysis.duration || 0);
    renderOverview(getDisplayAnalysis());
    selectSegment(selectedSegmentId);
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
    const analysisTab = document.getElementById('analysis-tab');
    if (!analysisTab || analysisTab.getClientRects().length === 0) return;
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
  const totalWidth = duration * pps;
  els.chordTimelineInner.style.width = `${totalWidth}px`;

  if (chords.length === 0) {
    els.chordTimelineInner.innerHTML = '<span class="analyzer-timeline-empty">Aucun accord structurel confirmé.</span>';
    updatePlaybackPosition(currentPlayer?.element?.currentTime ?? 0);
    return;
  }

  const fmt = (s) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${String(sec).padStart(2, '0')}`;
  };


  chords.forEach((chord, index) => {
    // L'indice visible change avec le filtre, l'identité de la cible non.
    const sourceIndex = currentAnalysis?.chords?.indexOf(chord) ?? -1;
    const effectiveChordStr = formatMusicChord(getEffectiveChord(chord));
    const originalDetected = formatMusicChord(chord.chord);
    const isOverridden = chord.manualOverride != null;

    // Le premier accord part de zéro : un morceau commence rarement pile sur une
    // attaque, et le silence (ou la mélodie seule) du début laissait un vide en
    // tête de frise dans les trois sessions de Narcisse — « ce vide-là, je ne
    // l'aime pas ».
    const spanStart = index === 0 ? 0 : chord.startTime;
    const left = spanStart * pps;
    // La pastille court jusqu'au DÉBUT de la suivante, pas jusqu'à sa propre
    // fin. Les blocs sont posés au temps, en absolu : tout écart entre deux
    // segments — un « N » écarté, un trou du découpage — laissait un blanc, et
    // un blanc se lit comme un silence. Narcisse : « je ne veux plus voir de
    // vide entre deux étiquettes ». La frise est donc continue par
    // construction, quelle que soit l'origine du trou.
    const nextStart = chords[index + 1]?.startTime ?? duration;
    const spanEnd = Math.max(chord.endTime, Math.min(nextStart, duration));
    const timeWidth = Math.max((spanEnd - spanStart) * pps - BLOCK_GAP, 0);

    const block = document.createElement('button');
    block.className = 'analyzer-timeline-block';
    block.type = 'button';
    block.setAttribute('tabindex', '0');
    block.setAttribute('role', 'button');
    block.setAttribute(
      'aria-label',
      `${effectiveChordStr}, ${ROLE_LABELS[segmentRole(chord)] || ''} — ${fmt(chord.startTime)} à ${fmt(chord.endTime)}`,
    );
    block.dataset.index = String(sourceIndex);
    block.dataset.start = String(chord.startTime);
    block.dataset.segmentId = chord.segmentId || '';
    // Largeur rendue : jamais moins que ce qu'il faut pour une fondamentale.
    const renderWidth = Math.max(timeWidth, LABEL_MIN_BLOCK_PX);
    block.style.left = `${left}px`;
    block.style.width = `${renderWidth}px`;

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

    // Dans la vue détaillée, distinguer les passages et les incertitudes.
    const role = segmentRole(chord);
    block.dataset.harmonicRole = role;
    block.classList.add(`role-${role}`);

    // Le symbole s'adapte à la place disponible plutôt que d'être tronqué :
    // « F#m » ne devient jamais « F... ». Il se replie sur la triade puis sur la
    // seule fondamentale, et c'est la largeur RENDUE qui compte — un segment
    // élargi au minimum doit afficher ce que ce minimum permet.
    const fitted = fitChordLabel(effectiveChordStr, renderWidth);
    if (fitted.truncated) block.classList.add('label-reduced');
    block.innerHTML = `
      ${fitted.text
        ? `<span class="analyzer-timeline-label" style="font-size:${fitted.fontPx}px">${escapeHtml(fitted.text)}</span>`
        : ''}
      ${isOverridden ? '<span class="override-icon" title="Corrigé manuellement">✏</span>' : ''}
    `;

    // Clic simple : sélection + mise à jour de l'inspecteur, et la lecture se place sur l'accord.
    // Double-clic : édition.
    block.addEventListener('click', () => {
      selectSegment(chord.segmentId);
      seekToSegment(chord);
      block.scrollIntoView({ behavior: 'smooth', inline: chordGridExpanded ? 'nearest' : 'center', block: 'nearest' });
    });
    block.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        openChordEditor(sourceIndex);
      }
    });
    block.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      selectSegment(chord.segmentId);
      openChordEditor(sourceIndex);
    });
    block.addEventListener('pointerdown', (e) => e.stopPropagation());
    els.chordTimelineInner.appendChild(block);
  });

  renderMusicalGrid();
  // Restaurer la sélection et l’accord courant
  updatePlaybackPosition(currentPlayer?.element?.currentTime ?? 0);
  if (selectedSegmentId) highlightSelectedSegment(selectedSegmentId);
}

function resetMusicalGrid() {
  gridRhythmRequest = null; gridRhythmAnalysis = null;
  gridSettings = normalizeGridSettings({}, currentAnalysis?.timeSignature); gridRhythm = null;
  syncGridSettings();
}

function bindMusicalGrid() {
  musicalGridView = createMusicalGridView(els.musicalGrid, {
    onSeek: (time, segmentId) => {
      if (segmentId) selectSegment(segmentId);
      seekToSegment({ startTime: time });
    },
    onEdit: (segmentId) => {
      const index = currentAnalysis?.chords?.findIndex((s) => s.segmentId === segmentId) ?? -1;
      if (index >= 0) openChordEditor(index);
    },
  });
  const change = (patch) => {
    const oldTempo = gridSettings.tempoOverride;
    gridSettings = normalizeGridSettings({ ...gridSettings, ...patch }, currentAnalysis?.timeSignature);
    if (oldTempo !== gridSettings.tempoOverride) {
      gridRhythm = null; gridRhythmRequest = null; gridRhythmAnalysis = null;
      ensureGridRhythm();
    }
    syncGridSettings(); renderMusicalGrid();
    musicalGridView?.update(currentPlayer?.getCurrentTime?.() || 0);
    markDirty();
    if (window.electronAPI?.files?.writeFile) saveProject({ silent: true });
  };
  const applyGridTempo = () => {
    if (els.gridBpm.value === '') change({ tempoOverride: null });
    else if (els.gridBpm.validity.valid) change({ tempoOverride: els.gridBpm.valueAsNumber, tempoMultiplier: 1 });
  };
  els.gridBpm?.addEventListener('change', applyGridTempo);
  els.gridBpm?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') { event.preventDefault(); applyGridTempo(); els.gridBpm.blur(); }
  });
  els.gridAlign?.addEventListener('click', () => {
    const time = currentPlayer?.getCurrentTime?.();
    if (Number.isFinite(time)) change({ downbeatSeconds: time, phase: 0, offsetSeconds: 0 });
  });
  els.gridHalf?.addEventListener('click', () => change({ tempoMultiplier: Math.max(0.5, gridSettings.tempoMultiplier / 2) }));
  els.gridDouble?.addEventListener('click', () => change({ tempoMultiplier: Math.min(2, gridSettings.tempoMultiplier * 2) }));
  els.gridSignature?.addEventListener('change', () => {
    const [beatsPerBar, beatUnit] = els.gridSignature.value.split('/').map(Number);
    change({ beatsPerBar, beatUnit, phase: 0 });
  });
  els.gridPhase?.addEventListener('change', () => change({ phase: Number(els.gridPhase.value), downbeatSeconds: null }));
  els.gridOffset?.addEventListener('input', () => {
    if (els.gridOffset.value !== '' && Number.isFinite(els.gridOffset.valueAsNumber)) change({ offsetSeconds: els.gridOffset.valueAsNumber });
  });
  els.gridOffset?.addEventListener('change', () => {
    change({ offsetSeconds: Number(els.gridOffset.value) });
    if (document.activeElement !== els.gridOffset) els.gridOffset.value = String(gridSettings.offsetSeconds);
  });
  els.gridReset?.addEventListener('click', () => {
    change(normalizeGridSettings({}, currentAnalysis?.timeSignature));
    els.gridOffset.value = String(gridSettings.offsetSeconds);
  });
}

function syncGridSettings() {
  if (!els.gridSignature) return;
  els.gridSignature.value = `${gridSettings.beatsPerBar}/${gridSettings.beatUnit}`;
  if (document.activeElement !== els.gridBpm) els.gridBpm.value = gridSettings.tempoOverride == null ? '' : String(gridSettings.tempoOverride);
  els.gridBpm.placeholder = String(Math.round(effectiveGridTempo(currentAnalysis, gridSettings, gridRhythm) * 10) / 10);
  els.gridAnchor.textContent = gridSettings.downbeatSeconds == null ? '' : `Premier temps : ${(gridSettings.downbeatSeconds + gridSettings.offsetSeconds).toFixed(2)} s`;
  if (els.contextTempo && currentAnalysis) {
    const tempo = effectiveGridTempo(currentAnalysis, gridSettings, gridRhythm);
    els.contextTempo.textContent = `${Math.round(tempo * 10) / 10} BPM`;
    els.contextTempo.title = gridSettings.tempoOverride == null ? 'Tempo estimé' : `Tempo corrigé · détection d’origine : ${currentAnalysis.tempo || '—'} BPM`;
  }
  if (document.activeElement !== els.gridOffset) els.gridOffset.value = String(gridSettings.offsetSeconds);
  els.gridPhase.replaceChildren(...Array.from({ length: gridSettings.beatsPerBar }, (_, i) => {
    const option = document.createElement('option'); option.value = String(i);
    option.textContent = i ? `Pulsation ${i + 1}` : 'Pulsation 1'; return option;
  }));
  els.gridPhase.value = String(gridSettings.phase);
  els.gridHalf.disabled = gridSettings.tempoMultiplier === 0.5;
  els.gridDouble.disabled = gridSettings.tempoMultiplier === 2;
}

function bindGridPresentation() {
  try { if (localStorage.getItem('pjc.analysis.music-view') === 'score') els.gridView.value = 'score'; } catch (_) { /* Choix de séance. */ }
  els.gridView.addEventListener('change', () => {
    try { localStorage.setItem('pjc.analysis.music-view', els.gridView.value); } catch (_) { /* Choix de séance. */ }
    renderMusicalGrid();
    musicalGridView?.update(currentPlayer?.getCurrentTime?.() || 0);
  });
}

function renderMusicalGrid() {
  if (!chordGridExpanded || !currentAnalysis || !musicalGridView) return;
  const model = musicalGridView.render(currentAnalysis, { settings: gridSettings, rhythm: gridRhythm, formatChord: formatMusicChord, presentation: els.gridView.value });
  els.gridMeter.textContent = `${gridSettings.beatsPerBar}/${gridSettings.beatUnit} · ${els.gridView.value === 'score' ? 'grande portée piano' : '4 mesures / ligne'}`;
  els.gridTempo.textContent = `${Math.round(model.tempo * 10) / 10} BPM`;
  els.gridStatus.textContent = gridRhythmRequest ? 'Calage des pulsations…' : model.estimated ? 'Calage au tempo · réglable dans Corriger' : 'Calage audio estimé · Corriger';
  syncGridSettings();
}

async function ensureGridRhythm() {
  if (!currentAnalysis || gridRhythm || gridRhythmAnalysis === currentAnalysis) return;
  const analysis = currentAnalysis;
  if (!analysis.wavPath || !window.electronAPI?.analyzer?.gridBeats) return;
  gridRhythmAnalysis = analysis;
  const request = {};
  gridRhythmRequest = request; renderMusicalGrid();
  try {
    const rhythm = await window.electronAPI.analyzer.gridBeats(analysis.wavPath, {
      tempo: gridSettings.tempoOverride || analysis.tempo || 120,
      manual: gridSettings.tempoOverride != null,
    });
    if (currentAnalysis !== analysis || gridRhythmRequest !== request) return;
    gridRhythmRequest = null;
    gridRhythm = readGridView({ display: { chordGrid: { settings: gridSettings, rhythm } } }, analysis).rhythm;
    syncGridSettings(); renderMusicalGrid(); musicalGridView?.update(currentPlayer?.getCurrentTime?.() || 0);
    if (gridRhythm && window.electronAPI?.files?.writeFile) saveProject({ silent: true });
  } catch (error) {
    if (gridRhythmRequest !== request) return;
    gridRhythmRequest = null; renderMusicalGrid();
    console.warn('[Analyzer] calage de grille au tempo :', error.message);
  }
}

function selectSegment(segmentId) {
  selectedSegmentId = segmentId;
  highlightSelectedSegment(segmentId);
  const segment = getDisplayChords().find((s) => s.segmentId === segmentId) || null;
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

let harmonicContexts = [];
let lastContextId = null;
let lastNotation = '';

function updatePlaybackPosition(currentTime) {
  if (!currentAnalysis) return;
  const duration = currentPlayer?.getDuration?.() || currentAnalysis.duration || 1;
  const clamped = Math.max(0, Math.min(currentTime, duration));
  const ratio = duration > 0 ? clamped / duration : 0;

  // La grille reçoit l'horloge avant les autres panneaux et la frise masquée.
  if (chordGridExpanded) musicalGridView?.update(clamped);
  updateMusicContext(clamped);
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

  // [Claude] — 2026-10-09 — Narcisse : « quand le lecteur avance, on ne sait pas où l'on se
  // situe au niveau de l'accord ». L'accord en cours se remplit de gauche à droite au fil de la
  // lecture (--chord-progress, 0 → 1), et l'accord suivant est annoncé (.upcoming).
  const activeChord = activeIndex >= 0 ? chords[activeIndex] : null;
  const span = activeChord ? Math.max(activeChord.endTime - activeChord.startTime, 0.001) : 1;
  const chordProgress = activeChord ? Math.max(0, Math.min(1, (clamped - activeChord.startTime) / span)) : 0;
  const blocks = els.chordTimelineInner.querySelectorAll('.analyzer-timeline-block');
  blocks.forEach((block, idx) => {
    const isCurrent = idx === activeIndex;
    block.classList.toggle('current', isCurrent);
    block.classList.toggle('upcoming', activeIndex >= 0 && idx === activeIndex + 1);
    if (isCurrent) block.style.setProperty('--chord-progress', chordProgress.toFixed(4));
    else block.style.removeProperty('--chord-progress');
  });


  // Suivre la case courante sur son axe, sans déplacer les commandes du lecteur.
  if (activeIndex >= 0 && activeIndex !== lastAutoScrollIndex && blocks[activeIndex]) {
    lastAutoScrollIndex = activeIndex;
    const block = blocks[activeIndex];
    const containerRect = els.chordTimeline.getBoundingClientRect();
    const blockRect = block.getBoundingClientRect();
    const margin = 120;
    if (!chordGridExpanded && (blockRect.right > containerRect.right - margin || blockRect.left < containerRect.left + margin)) {
      const targetScroll = els.chordTimeline.scrollLeft + blockRect.left - containerRect.left - containerRect.width / 3 + blockRect.width / 2;
      els.chordTimeline.scrollTo({ left: targetScroll, behavior: 'smooth' });
    }
  }
}

async function togglePlayback() {
  // [Claude] — 2026-10-18 — Plus de clic sans effet et sans explication : si le lecteur n'existe
  // pas, on tente de le (re)créer, et faute de son jouable on le dit au lieu de rester muet.
  if (!currentPlayer) {
    const ok = await createPlayerForAnalysis(currentAnalysis);
    if (!ok) {
      showToast('Audio indisponible pour la lecture de cette analyse.', 3500, 'warning');
      return;
    }
    updatePlayButton();
  }
  const el = currentPlayer.element;
  if (el?.paused) {
    // [Claude] — 2026-08-08 — Demande l’audio focus avant de jouer. Si Studio
    // est en train de jouer, il est mis en pause sans synchronisation de
    // currentTime ou de position.
    globalAudioFocusManager.requestFocus('analysis');
    try {
      await el.play();
    } catch (err) {
      console.warn('[Analyzer] play failed:', err);
      showToast(`Lecture impossible : ${err?.message || 'erreur audio'}`, 4000, 'warning');
    }
  } else {
    el.pause();
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
  const target = ratio * duration;
  currentPlayer.seek(target);
  // [Claude] — 2026-10-18 — En pause, la boucle d'animation ne tourne pas : sans ceci, déplacer
  // manuellement le curseur ne bougeait rien à l'écran (« j'ai essayé d'aller à un endroit, sans
  // succès »). On met la barre et le temps à jour tout de suite.
  updatePlaybackPosition(target);
}

/**
 * [Claude] — 2026-10-09 — Narcisse : « quand on fait un clic gauche sur une étiquette d'accord,
 * que les lecteurs reviennent à cet accord-là ». La lecture se place au début de l'accord : en
 * cours de lecture, elle continue de là ; en pause, elle y reste. Le curseur, la frise et la
 * carte « Accord à l'écoute » suivent aussitôt.
 */
// [Mission §9, 18/10] Libellé de tonalité : « F majeur » / « F mineur »,
// JAMAIS « Fm major » (l'ancien code concaténait le nom qui porte déjà le
// mode + le champ mode). Les analyses sauvegardées par l'ancien moteur
// contiennent des paires incohérentes (« Fm » + « major ») : le nom fait foi.
function keyDisplayLabel(keyName, mode) {
  const name = String(keyName || '');
  if (!name) return '—';
  const endsM = /m$/i.test(name) && name.length >= 2;
  const root = endsM ? name.slice(0, -1) : name;
  const isMinor = endsM || mode === 'minor';
  return `${formatMusicNote(root)} ${isMinor ? 'mineur' : 'majeur'}`;
}


function seekToSegment(segment) {
  const el = currentPlayer?.element;
  if (!el || !segment || !Number.isFinite(segment.startTime)) return;
  const duration = currentPlayer.getDuration?.() || currentAnalysis?.duration || 0;
  const target = Math.max(0, Math.min(segment.startTime, Math.max(duration - 0.05, 0)));
  // Écrit directement sur l'élément : `seek()` du lecteur borne par audio.duration, qui vaut
  // NaN tant que les métadonnées ne sont pas lues (la lecture retombait alors à 0).
  el.currentTime = target;
  updatePlaybackPosition(target);
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
  // [Refonte Astra Analyse 12/09] — le bouton porte une icône SVG : on écrit
  // dans innerHTML, un textContent l'effacerait au premier changement d'état.
  els.playBtn.innerHTML = isPaused ? AN_PLAY_SVG : AN_PAUSE_SVG;
  els.playBtn.classList.toggle('is-playing', !isPaused);
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
    notifyError('Export MIDI non disponible dans cet environnement.');
    return;
  }

  const baseName = currentFileName.replace(/\.[^.]+$/, '') || 'analyse';
  const filePath = await window.electronAPI.files.saveDialog({
    defaultPath: `${baseName}_analysis.mid`,
  });
  if (!filePath) return;

  const midiBytes = exportAnalysisToMidi(getDisplayAnalysis());
  if (!midiBytes) {
    notifyError('Aucune donnée à exporter.');
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
    notifyError('Export JSON non disponible dans cet environnement.');
    return;
  }

  const baseName = currentFileName.replace(/\.[^.]+$/, '') || 'analyse';
  const filePath = await window.electronAPI.files.saveDialog({
    defaultPath: `${baseName}_analysis.json`,
    filters: [{ name: 'Fichier JSON', extensions: ['json'] }, { name: 'Tous les fichiers', extensions: ['*'] }],
  });
  if (!filePath) return;

  const jsonData = exportAnalysisToJson(getDisplayAnalysis(), { fileName: currentFileName });
  await window.electronAPI.files.writeFile(filePath, JSON.stringify(jsonData, null, 2));
  const edited = countManuallyEditedChords(currentAnalysis);
  const suffix = edited > 0 ? ` — ${edited} correction(s) manuelle(s)` : '';
  showToast(`JSON exporté${suffix} vers ${filePath}`, 4000);
}

// [Mission ANGES §8] Export CSV de la grille affichée (même contenu que le
// JSON, format tableur) via la boîte de sauvegarde système. Aucun réseau.
async function handleExportCsv() {
  if (!currentAnalysis) return;
  if (!window.electronAPI?.files?.saveDialog || !window.electronAPI?.files?.writeFile) {
    notifyError('Export CSV non disponible dans cet environnement.');
    return;
  }

  const baseName = currentFileName.replace(/\.[^.]+$/, '') || 'analyse';
  const filePath = await window.electronAPI.files.saveDialog({
    defaultPath: `${baseName}_analysis.csv`,
    filters: [{ name: 'Fichier CSV', extensions: ['csv'] }, { name: 'Tous les fichiers', extensions: ['*'] }],
  });
  if (!filePath) return;

  const csv = exportAnalysisToCsv(getDisplayAnalysis(), { fileName: currentFileName });
  await window.electronAPI.files.writeFile(filePath, csv);
  showToast(`CSV exporté vers ${filePath}`, 4000);
}

async function handleCopyText() {
  if (!currentAnalysis) return;
  const text = exportAnalysisToText(getDisplayAnalysis());
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
    tab.addEventListener('keydown', (event) => {
      const keys = ['ArrowUp', 'ArrowDown'];
      if (![...keys, 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const tabs = [...els.sectionTabs].filter((t) => !t.hidden);
      const index = tabs.indexOf(tab);
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1
        : (index + (event.key === keys[0] ? -1 : 1) + tabs.length) % tabs.length;
      activateSectionTab(tabs[next].dataset.section);
      tabs[next].focus();
    });
  });
  els.results?.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || !chordGridExpanded) return;
    event.preventDefault();
    event.stopPropagation();
    setChordGridExpanded(false);
    els.gridTab?.focus();
  });
}

function setChordGridExpanded(expanded) {
  if (!els.results || chordGridExpanded === expanded) return;
  if (expanded) {
    sectionBeforeGrid = [...els.sectionTabs].find((t) => t.getAttribute('aria-selected') === 'true')?.dataset.section || 'grid';
  }
  chordGridExpanded = expanded;
  els.results.classList.toggle('is-grid-expanded', expanded);
  els.panelsHost.hidden = expanded;
  if (els.musicalGrid) els.musicalGrid.hidden = !expanded;
  if (expanded) { renderMusicalGrid(); ensureGridRhythm(); }
  els.progressionRibbon.setAttribute('role', expanded ? 'tabpanel' : 'region');
  els.progressionRibbon.setAttribute('aria-label', expanded ? 'Grille complète des accords' : 'Ligne des accords');
  if (expanded) els.progressionRibbon.setAttribute('aria-labelledby', 'analyzer-grid-tab');
  else els.progressionRibbon.removeAttribute('aria-labelledby');
  els.sectionTabs.forEach((tab) => {
    const active = tab.dataset.section === (expanded ? 'grid' : sectionBeforeGrid);
    tab.classList.toggle('active', active);
    tab.setAttribute('aria-selected', String(active));
    tab.tabIndex = active ? 0 : -1;
  });
  lastAutoScrollIndex = -1;
  requestAnimationFrame(() => updatePlaybackPosition(currentPlayer?.getCurrentTime?.() || 0));
}

function activateSectionTab(section) {
  if (section === 'grid') { setChordGridExpanded(true); return; }
  if (chordGridExpanded) setChordGridExpanded(false);
  els.sectionTabs.forEach((t) => {
    const active = t.dataset.section === section;
    t.classList.toggle('active', active);
    t.setAttribute('aria-selected', String(active));
    t.tabIndex = active ? 0 : -1;
  });
  els.sectionPanels.forEach((panel) => {
    const active = panel.dataset.section === section;
    panel.style.display = active ? '' : 'none';
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
  els.exportCsvBtn?.addEventListener('click', handleExportCsv);
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

/**
 * [Claude] — 2026-10-18 — Crée le lecteur pour une analyse. Rend `true` s'il y a du son jouable.
 * Si `wavPath` manque ou n'est plus lisible (fichier temporaire nettoyé, analyse rouverte), on
 * redérive l'audio depuis le fichier source. Ne jette jamais : le reste de l'écran reste utilisable.
 */
async function createPlayerForAnalysis(analysis) {
  if (!analysis) return false;
  let wavPath = analysis.wavPath;
  try {
    const canRead = wavPath && (!window.electronAPI?.files?.exists || await window.electronAPI.files.exists(wavPath));
    if (!canRead && currentAudioPath) {
      const playback = currentSourceType === 'midi'
        ? { wavPath: await ensureMidiPlayback(currentAudioPath).catch(() => null) }
        : await window.electronAPI?.analyzer?.preparePlayback?.(currentAudioPath);
      wavPath = playback?.wavPath || null;
      if (wavPath) analysis.wavPath = wavPath;
    }
    if (!wavPath) return false;
    const blobUrl = await loadAudioBlobUrl(wavPath);
    currentPlayer = createAudioPlayer(els.audioContainer, blobUrl, {
      onTimeUpdate: updatePlaybackPosition,
    });
    // Les sauts en pause ne passent pas par la boucle requestAnimationFrame.
    for (const event of ['seeked', 'timeupdate', 'loadedmetadata']) {
      currentPlayer.element.addEventListener(event, () => {
        const time = currentPlayer?.getCurrentTime?.() || 0;
        // Les événements du média continuent le suivi même si un autre panneau
        // interrompt sa mise à jour par animation. Aucun changement de tempo ici.
        if (chordGridExpanded) musicalGridView?.update(time);
        updatePlaybackPosition(time);
      });
    }
    currentPlayer.element.addEventListener('ended', updatePlayButton);
    return true;
  } catch (err) {
    console.warn('[Analyzer] lecteur indisponible :', err);
    currentPlayer = null;
    return false;
  }
}

// ── Phase B : Persistance des overrides ──

function resetProjectState() {
  projectDirty = false;
  projectPath = null;
  audioIdentity = null;
  currentProjectOrphanedOverrides = {};
  window.__projectDirty = false;
}

async function getAudioStat(filePath) {
  if (!window.electronAPI?.files?.stat) return null;
  try {
    return await window.electronAPI.files.stat(filePath);
  } catch {
    return null;
  }
}

// [Claude] — 2026-10-28 — Plus d'indicateur visuel (« Analyse sauvegardée » sous le
// titre, demande de Narcisse) : projectDirty/__projectDirty restent suivis — Electron
// (main.js) les lit pour avertir avant de fermer une analyse non sauvegardée — mais
// sans plus aucun affichage dans l'onglet. Ctrl+S et la sauvegarde silencieuse après
// chaque correction restent les deux façons d'enregistrer.
function markDirty() {
  projectRevision++;
  if (!projectDirty) {
    projectDirty = true;
    window.__projectDirty = true;
  }
}

function markClean() {
  projectDirty = false;
  window.__projectDirty = false;
}

async function saveProject({ silent = false } = {}) {
  if (!currentAudioPath || !currentAnalysis) return;
  if (!window.electronAPI?.files?.writeFile || !window.electronAPI?.files?.rename) {
    showToast('Sauvegarde non disponible dans cet environnement.');
    return;
  }

  try {
    const analysisToSave = currentAnalysis;
    const audioPathToSave = currentAudioPath;
    const revisionToSave = projectRevision;
    if (!audioIdentity) {
      const stat = await getAudioStat(audioPathToSave);
      if (currentAnalysis !== analysisToSave || currentAudioPath !== audioPathToSave) return;
      audioIdentity = buildAudioIdentity(audioPathToSave, analysisToSave, stat);
    }

    if (currentAnalysis !== analysisToSave) return;
    projectPath = projectPath || buildProjectPath(currentAudioPath);
    const data = buildProjectData(
      audioIdentity,
      currentAnalysis.chords || [],
      currentProjectOrphanedOverrides,
      currentAnalysis,
      { settings: gridSettings, rhythm: gridRhythm },
    );

    // Sérialiser les sauvegardes du calage, des corrections et de Ctrl+S :
    // un seul fichier temporaire peut être en cours d'écriture par projet.
    const pathToSave = projectPath;
    const write = async () => {
      const tmpPath = pathToSave + '.tmp';
      await window.electronAPI.files.writeFile(tmpPath, JSON.stringify(data, null, 2));
      await window.electronAPI.files.rename(tmpPath, pathToSave);
    };
    const pending = projectSaveQueue.then(write, write);
    projectSaveQueue = pending.catch(() => {});
    await pending;
    if (currentAnalysis === analysisToSave && projectRevision === revisionToSave) markClean();
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

    const gridView = readGridView(data, currentAnalysis);
    gridSettings = gridView.settings; gridRhythm = gridView.rhythm;
    syncGridSettings();

    const { applied, orphaned } = tryApplyProjectOverrides(data, currentAnalysis.chords || []);
    currentProjectOrphanedOverrides = orphaned;

    // L'état chargé est la nouvelle ligne de base : pas d'undo possible sur le load
    resetUndoRedo();
    rerenderTimeline();

    // [Claude] — 2026-10-28 — Plus de toast quand il n'y a rien à signaler (Narcisse,
    // capture à l'appui) : « Aucune correction enregistrée » apparaissait, mal placée,
    // à chaque réouverture d'un projet sans correction — le cas le plus courant.
    if (applied.length > 0) {
      showToast(`${applied.length} correction(s) chargée(s).`, 3000, 'info');
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

// [Claude] — 2026-10-13 — Question posée à la fermeture quand des corrections ne sont pas
// enregistrées. Avant, electron/main.js ouvrait une fenêtre du système (dialog.showMessageBox) ;
// la question est maintenant dessinée par l'application. Réponse : 'save' | 'discard' | 'cancel'.
window.__askBeforeClose = function () {
  return appDialog({
    title: 'Modifications non enregistrées',
    message: 'Des modifications d’accords n’ont pas été enregistrées.',
    detail: 'Les corrections manuelles seront perdues si vous ne les enregistrez pas.',
    tone: 'question',
    cancelId: 'cancel',
    buttons: [
      { id: 'cancel', label: 'Annuler' },
      { id: 'discard', label: 'Ne pas enregistrer' },
      { id: 'save', label: 'Enregistrer', primary: true },
    ],
  });
};


// Repères du morceau partagés par tous les sous-onglets.
// Résumé recalculé uniquement à l’ouverture ou après une correction, pas à chaque image.
function renderOverview(analysis) {
  harmonicContexts = buildHarmonicContexts(analysis);
  lastContextId = null;
  syncGridSettings();
  updateMusicContext(currentPlayer?.getCurrentTime?.() || 0);
}

function refreshAnalysisNotation() {
  const notation = JSON.stringify(notationOptions());
  if (notation === lastNotation) return;
  lastNotation = notation;
  if (!currentAnalysis) return;
  const top = els.musicalGrid.scrollTop;
  lastContextId = null;
  rerenderTimeline();
  els.musicalGrid.scrollTop = top;
  musicalGridView?.update(currentPlayer?.getCurrentTime?.() || 0, false);
  if (chordEditor?.isOpen) chordEditor.refreshNotation();
}

function updateMusicContext(time) {
  const context = harmonicContextAt(harmonicContexts, time);
  if (!context || !els.musicContext) return;
  const id = `${context.start}:${context.key}:${context.mode}:${context.chords.join('|')}`;
  if (id === lastContextId) return;
  const changed = lastContextId !== null;
  lastContextId = id;
  els.musicContext.dataset.tone = String(context.color % 5);
  els.contextKey.textContent = keyDisplayLabel(context.key, context.mode);
  els.contextChords.replaceChildren();
  for (const chord of context.chords) {
    const span = document.createElement('span');
    span.textContent = formatMusicChord(chord);
    els.contextChords.appendChild(span);
  }
  if (!context.chords.length) els.contextChords.textContent = '—';
  els.contextChords.title = context.chords.length ? context.chords.map((chord) => formatMusicChord(chord)).join(' · ') : 'Aucune progression récurrente établie pour ce passage';
  if (changed) {
    els.contextAnnouncement.textContent = `Tonalité : ${els.contextKey.textContent}. Accords principaux : ${context.chords.map((chord) => formatMusicChord(chord)).join(', ') || 'non établis'}.`;
    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      els.musicContext.getAnimations().forEach((a) => a.cancel());
      els.musicContext.animate([{ opacity: 0.75 }, { opacity: 1 }], { duration: 160 });
    }
  }
}

function escapeHtml(str) {
  return String(str)
    .replace(/\u0026/g, '\u0026amp;')
    .replace(/\u003c/g, '\u0026lt;')
    .replace(/\u003e/g, '\u0026gt;')
    .replace(/"/g, '\u0026quot;');
}

