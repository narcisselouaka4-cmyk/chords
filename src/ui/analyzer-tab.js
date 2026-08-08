import { selectMediaFile, createAudioPlayer, isSupportedMediaFile } from '../audio/media-engine.js';
import { createAudioAnalyzer } from '../analyzer/audio-analyzer.js';
import {
  exportAnalysisToMidi,
  exportAnalysisToJson,
  exportAnalysisToText,
  computeProductStatistics,
  countManuallyEditedChords,
} from '../analyzer/analysis-export.js';
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
} from '../chord-engine/chord-display.js';
import {
  buildProjectPath,
  buildProjectData,
  validateProjectSchema,
  verifyAudioIdentity,
  tryApplyProjectOverrides,
} from './chord-editor.js';
// [OpenCode] — 2026-08-07 — Incrément 9, Lot 1 : raccordement du panneau
// Réharmonisation au moteur canonique buildHarmonizationPlan via un
// orchestrateur UI déterministe. Entrée de démonstration (fixture) tant que
// l'extraction d'une vraie MelodyTrack (Incrément 11) n'est pas raccordée.
import { buildDemoFixture } from './reharmonization-demo-fixture.js';
import { buildReharmonizationViewModel } from './reharmonization-orchestrator.js';
import {
  renderReharmonizationEmpty,
  renderReharmonizationLoading,
  renderReharmonizationError,
  renderReharmonizationSuccess,
} from './reharmonization-view.js';
import './reharmonization-view.css';
import { buildFileContextText } from './file-context.js';

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
  results: document.getElementById('analyzer-results'),
  backBtn: document.getElementById('analyzer-back-btn'),

  songTitle: document.getElementById('analyzer-song-title'),
  songArtist: document.getElementById('analyzer-song-artist'),
  stemBadge: document.getElementById('analyzer-stem-badge'),

  prevBtn: document.getElementById('analyzer-prev-btn'),
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
  timelineScrollLeft: document.getElementById('analyzer-timeline-scroll-left'),
  timelineScrollRight: document.getElementById('analyzer-timeline-scroll-right'),

  audioContainer: document.getElementById('analyzer-audio-container'),

  sectionTabs: document.querySelectorAll('#analyzer-section-tabs button[data-section]'),
  sectionPanels: document.querySelectorAll('#analyzer-section-panels > [data-section]'),

  exportMidiBtn: document.getElementById('analyzer-export-midi-btn'),
  exportJsonBtn: document.getElementById('analyzer-export-json-btn'),
  copyTextBtn: document.getElementById('analyzer-copy-text-btn'),
  statsContent: document.getElementById('analyzer-stats-content'),

  // Hero chord (sous la timeline)
  hero: document.getElementById('analyzer-hero'),
  heroName: document.getElementById('analyzer-hero-name'),
  heroNotes: document.getElementById('analyzer-hero-notes'),
  heroKeyboard: document.getElementById('analyzer-hero-keyboard'),

  processing: document.getElementById('analyzer-processing'),
  processingText: document.getElementById('analyzer-processing-text'),

  // Panneau Réharmonisation (Incrément 9, Lot 1) — démonstration du moteur canonique.
  reharmStyle: document.getElementById('analyzer-reharm-style'),
  reharmRun: document.getElementById('analyzer-reharm-run'),
  reharmOutput: document.getElementById('analyzer-reharm-output'),
  // Lot A — conteneur <details> parent et son <summary>, pour ouverture
  // automatique et aria-expanded lors d'un rendu réussi.
  reharmDetails: document.getElementById('analyzer-reharm-details'),
  reharmSummary: document.getElementById('analyzer-reharm-summary'),
};

let analyzer = null;
let currentPlayer = null;
let currentAnalysis = null;
let currentFileName = '';
let currentAudioPath = '';
let isDraggingProgress = false;
let lastAutoScrollIndex = -1;
let lastRenderedVoicingChord = null;
let lastRenderedVoicingStyle = null;

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
  bindSectionTabs();
  bindExportMidiButton();
  bindExportJsonButton();
  bindCopyTextButton();
  initChordEditor();
  initKeyboardShortcuts();
  initReharmonizationPanel();
}

function bindImportButton() {
  els.importBtn?.addEventListener('click', handleImportClick);
  els.backBtn?.addEventListener('click', showImportScreen);
}

async function handleImportClick() {
  try {
    const filePath = await selectMediaFile();
    if (!filePath) return;

    if (!isSupportedMediaFile(filePath)) {
      alert('Format non supporté. Formats acceptés : MP3, WAV, MP4, M4A.');
      return;
    }

    currentAudioPath = filePath;
    currentFileName = filePath.split('/').pop() || filePath.split('\\').pop() || filePath;
    showProcessing('Extraction audio en cours…');

    const analysis = await analyzer.analyze(filePath);
    currentAnalysis = analysis;

    showResults(analysis);
  } catch (err) {
    console.error('[Analyzer] import failed:', err);
    hideProcessing();
    alert(`Erreur d'analyse : ${err.message}`);
  }
}

function showProcessing(text) {
  els.processingText.textContent = text;
  els.processing.style.display = 'flex';
}

function hideProcessing() {
  els.processing.style.display = 'none';
}

async function showResults(analysis) {
  hideProcessing();
  els.importScreen.style.display = 'none';
  els.results.style.display = 'flex';
  currentAnalysis = analysis;
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
}

function showImportScreen() {
  if (currentPlayer) {
    currentPlayer.destroy();
    currentPlayer = null;
  }
  currentAnalysis = null;
  currentFileName = '';
  currentAudioPath = '';
  resetProjectState();
  resetUndoRedo();
  chordEditor?.close();
  els.results.style.display = 'none';
  els.importScreen.style.display = 'flex';
  lastRenderedVoicingChord = null;
  lastRenderedVoicingStyle = null;
  els.chordTimelineInner.innerHTML = '';
  if (els.hero) els.hero.style.display = 'none';
  clearVoicingTextPreview();
  els.stemBadge.textContent = '';
  els.stemBadge.classList.remove('visible');
  const bassTimeline = document.getElementById('analyzer-bass-timeline-wrapper');
  if (bassTimeline) bassTimeline.remove();
  const bassDevInfo = document.getElementById('analyzer-bass-dev-info');
  if (bassDevInfo) bassDevInfo.remove();
  // Lot B — retour à l’état vide explicite quand aucun fichier n’est analysé.
  updateAnalyzerFileContext('');
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
    renderTimeline(currentAnalysis.chords || [], currentAnalysis.duration || 0);
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
    els.chordTimelineInner.innerHTML = '<span class="text-sm text-(--text-dim)">Aucun accord détecté.</span>';
    return;
  }

  chords.forEach((chord, index) => {
    const block = document.createElement('button');
    block.className = 'absolute inset-y-2 flex items-center justify-center bg-(--surface-secondary) border border-(--border) rounded-md text-(--text) font-bold text-lg cursor-pointer hover:bg-(--border) hover:border-sky-500 transition-all overflow-hidden';
    block.type = 'button';
    block.dataset.index = String(index);
    block.dataset.start = String(chord.startTime);
    block.dataset.segmentId = chord.segmentId || '';

    const left = chord.startTime * pps + index * BLOCK_GAP;
    const timeWidth = Math.max((chord.endTime - chord.startTime) * pps - BLOCK_GAP, 0);
    block.style.left = `${left}px`;
    block.style.width = `${timeWidth}px`;

    const fmt = (s) => {
      const m = Math.floor(s / 60);
      const sec = Math.floor(s % 60);
      return `${m}:${String(sec).padStart(2, '0')}`;
    };

    const effectiveChordStr = getEffectiveChord(chord);
    const originalDetected = chord.chord;
    const isOverridden = chord.manualOverride != null;

    if (isOverridden) {
      block.title = `Corrigé manuellement — ${originalDetected} → ${effectiveChordStr}  ${fmt(chord.startTime)} → ${fmt(chord.endTime)}  (${(chord.endTime - chord.startTime).toFixed(1)}s)`;
    } else {
      block.title = `${effectiveChordStr}  ${fmt(chord.startTime)} → ${fmt(chord.endTime)}  (${(chord.endTime - chord.startTime).toFixed(1)}s)`;
    }

    const fontSize = effectiveChordStr.length >= 7 ? 'text-base' : 'text-lg';
    block.classList.add(fontSize);

    // Bloc très étroit : pas de texte, simple marqueur visuel
    if (timeWidth < 24) {
      block.classList.add('timeline-block-micro');
    }

    if (isOverridden) {
      block.classList.add('manual-override');
    }

    block.innerHTML = `
      <span class="truncate max-w-full px-2 font-bold">${escapeHtml(effectiveChordStr)}</span>
      ${isOverridden ? '<span class="manual-override-icon" title="Corrigé manuellement">✏</span>' : ''}
    `;

    block.addEventListener('click', () => {
      if (currentPlayer) {
        currentPlayer.seek(chord.startTime);
        currentPlayer.play();
      }
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
      openChordEditor(index);
    });
    block.addEventListener('pointerdown', (e) => e.stopPropagation());
    els.chordTimelineInner.appendChild(block);
  });

  // Restaurer la sélection active
  updatePlaybackPosition(
    currentPlayer?.element?.currentTime ?? 0
  );
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

  const chords = currentAnalysis.chords || [];
  let activeIndex = -1;
  for (let i = 0; i < chords.length; i++) {
    if (clamped >= chords[i].startTime && clamped < chords[i].endTime) {
      activeIndex = i;
      break;
    }
  }

  const blocks = els.chordTimelineInner.querySelectorAll('.analyzer-timeline-block, button[data-index]');
  blocks.forEach((block, idx) => {
    if (idx === activeIndex) {
      block.classList.add('!bg-sky-600', '!border-sky-400', '!text-white', 'shadow-lg', 'shadow-sky-500/20', 'scale-105', 'z-10');
      block.classList.remove('bg-(--surface-secondary)', 'border-(--border)', 'text-(--text)');
    } else {
      block.classList.remove('!bg-sky-600', '!border-sky-400', '!text-white', 'shadow-lg', 'shadow-sky-500/20', 'scale-105', 'z-10');
      block.classList.add('bg-(--surface-secondary)', 'border-(--border)', 'text-(--text)');
    }
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
    currentPlayer.play();
  } else {
    currentPlayer.pause();
  }
  updatePlayButton();
}

function bindPlayerControls() {
  els.playBtn?.addEventListener('click', togglePlayback);

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
      renderTimeline(currentAnalysis.chords || [], currentAnalysis.duration || 0);
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
      els.sectionTabs.forEach((t) => {
        t.classList.remove('text-sky-400', 'border-b-2', 'border-sky-400');
        t.classList.add('text-(--text-dim)', 'hover:text-(--text)');
        t.setAttribute('aria-selected', 'false');
      });
      tab.classList.remove('text-(--text-dim)', 'hover:text-(--text)');
      tab.classList.add('text-sky-400', 'border-b-2', 'border-sky-400');
      tab.setAttribute('aria-selected', 'true');

      const section = tab.dataset.section;
      els.sectionPanels.forEach((panel) => {
        if (panel.dataset.section === section) {
          panel.style.display = '';
        } else {
          panel.style.display = 'none';
        }
      });
    });
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

async function saveProject() {
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
    const data = buildProjectData(audioIdentity, currentAnalysis.chords || [], currentProjectOrphanedOverrides);

    // Écriture atomique : fichier temporaire → renommage
    const tmpPath = projectPath + '.tmp';
    await window.electronAPI.files.writeFile(tmpPath, JSON.stringify(data, null, 2));
    await window.electronAPI.files.rename(tmpPath, projectPath);

    markClean();
    const displayPath = projectPath || '';
    const shortPath = displayPath.length > 60 ? '…' + displayPath.slice(-60) : displayPath;
    showToast(`Projet enregistré : ${shortPath}`, 4000);
  } catch (err) {
    console.error('[Analyzer] save failed:', err);
    showToast("Erreur d'enregistrement : " + err.message, 5000);
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

function escapeHtml(str) {
  return String(str)
    .replace(/\u0026/g, '\u0026amp;')
    .replace(/\u003c/g, '\u0026lt;')
    .replace(/\u003e/g, '\u0026gt;')
    .replace(/"/g, '\u0026quot;');
}

// ---------------------------------------------------------------------------
// Incrément 9, Lot 1 — Panneau Réharmonisation (démonstration du moteur canonique)
// ---------------------------------------------------------------------------

// Initialise le panneau Réharmonisation existant (#analyzer-reharm-style / run /
// output). Le sélecteur de style est DÉSACTIVÉ et jamais lu : aucun mapping
// Worship/Gospel/Jazz/Neo Soul déterministe n'existe dans le moteur canonique.
// Le bouton lance une démonstration explicite d'une fixture déterministe.
function initReharmonizationPanel() {
  const styleSelect = els.reharmStyle;
  const runBtn = els.reharmRun;
  const output = els.reharmOutput;
  const details = els.reharmDetails;
  const summary = els.reharmSummary;

  if (styleSelect) {
    // Désactivation + accessibilité : la valeur n'est jamais lue.
    styleSelect.disabled = true;
    styleSelect.setAttribute('aria-disabled', 'true');
    styleSelect.setAttribute('tabindex', '-1');
    styleSelect.title = 'Style désactivé : aucun mapping déterministe style → moteur n’existe encore.';
  }

  if (runBtn) {
    // Formulation explicite : il s’agit d’une démonstration, pas d’une analyse
    // du fichier audio actuellement chargé.
    runBtn.textContent = 'Voir la démonstration';
    runBtn.setAttribute('aria-controls', 'analyzer-reharm-output');
    runBtn.setAttribute('aria-expanded', 'false');
    runBtn.addEventListener('click', runReharmonizationDemo);
  }

  // Lot A — synchronisation de aria-expanded sur le <summary> quand
  // l'utilisateur ouvre/ferme manuellement le <details>. On n'intercepte pas
  // le comportement natif : on observe simplement l'état pour l'accessibilité.
  if (details && summary) {
    const syncExpanded = () => {
      const open = details.hasAttribute('open');
      summary.setAttribute('aria-expanded', String(open));
    };
    syncExpanded();
    details.addEventListener('toggle', syncExpanded);
  }

  if (output) {
    output.setAttribute('aria-live', 'polite');
    output.setAttribute('aria-busy', 'false');
    renderReharmonizationEmpty(output);
  }
}

// Lance la démonstration : construit la fixture canonique, appelle le moteur
// via l’orchestrateur, affiche le résultat. États vide/chargement/succès/erreur.
async function runReharmonizationDemo() {
  const runBtn = els.reharmRun;
  const output = els.reharmOutput;
  if (!runBtn || !output) return;

  runBtn.disabled = true;
  runBtn.setAttribute('aria-expanded', 'true');
  output.setAttribute('aria-busy', 'true');
  renderReharmonizationLoading(output);

  // Laisse le navigateur peindre l’état chargement avant le travail synchrone.
  await new Promise((resolve) => requestAnimationFrame(resolve));
  await new Promise((resolve) => setTimeout(resolve, 0));

  try {
    const fixture = buildDemoFixture();
    const viewModel = buildReharmonizationViewModel({
      track: fixture.track,
      harmonicContext: fixture.harmonicContext,
    });

    if (viewModel.status === 'success') {
      renderReharmonizationSuccess(output, viewModel, fixture.meta);
      // Lot A — ouvrir automatiquement le <details> parent pour rendre les
      // étapes visibles immédiatement après le succès. La fermeture puis
      // réouverture ne dupliquent pas les résultats : renderReharmonizationSuccess
      // appelle clearChildren() au début, donc chaque rendu repart d'un
      // conteneur vide.
      if (els.reharmDetails && !els.reharmDetails.hasAttribute('open')) {
        els.reharmDetails.setAttribute('open', '');
      }
      if (els.reharmSummary) {
        els.reharmSummary.setAttribute('aria-expanded', 'true');
      }
    } else {
      renderReharmonizationError(output, viewModel.message, viewModel.errorKind);
    }
  } catch (err) {
    // Filet de sécurité : toute erreur non interceptée par l’orchestrateur.
    renderReharmonizationError(output, err && err.message ? err.message : 'Erreur inattendue.', 'Error');
  } finally {
    runBtn.disabled = false;
    runBtn.setAttribute('aria-expanded', String(!!els.reharmDetails?.hasAttribute('open')));
    output.setAttribute('aria-busy', 'false');
  }
}
