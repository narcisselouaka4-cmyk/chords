import { selectMediaFile, createAudioPlayer, isSupportedMediaFile } from '../audio/media-engine.js';
import { createAudioAnalyzer } from '../analyzer/audio-analyzer.js';
import { exportAnalysisToMidi } from '../analyzer/midi-exporter.js';
import { miniKeyboardForNotes } from './mini-keyboard.js';
import { CHORD_DEFINITIONS } from '../chord-engine/chord-defs.js';
import { noteNameToPc } from '../chord-engine/intervals.js';
import { ChordEditor, makeSegmentId, getEffectiveChord, normalizeOverride, formatEffectiveChord, deriveChordDisplay, NOTE_NAMES } from './chord-editor.js';

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

  // Hero chord (sous la timeline)
  hero: document.getElementById('analyzer-hero'),
  heroName: document.getElementById('analyzer-hero-name'),
  heroNotes: document.getElementById('analyzer-hero-notes'),
  heroKeyboard: document.getElementById('analyzer-hero-keyboard'),

  processing: document.getElementById('analyzer-processing'),
  processingText: document.getElementById('analyzer-processing-text'),
};

let analyzer = null;
let currentPlayer = null;
let currentAnalysis = null;
let currentFileName = '';
let isDraggingProgress = false;
let lastAutoScrollIndex = -1;

export function initAnalyzerTab() {
  analyzer = createAudioAnalyzer();
  bindImportButton();
  bindPlayerControls();
  bindToolbar();
  initTimelineZoom();
  bindTimelineScroll();
  bindSectionTabs();
  bindExportMidiButton();
  initChordEditor();
  initKeyboardShortcuts();
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
  enrichSegments(analysis.chords);
  resetUndoRedo();
  chordEditor?.close();
  resetZoom();

  renderHeader(analysis);

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
  resetUndoRedo();
  chordEditor?.close();
  els.results.style.display = 'none';
  els.importScreen.style.display = 'flex';
  els.chordTimelineInner.innerHTML = '';
  if (els.hero) els.hero.style.display = 'none';
  els.stemBadge.textContent = '';
  els.stemBadge.classList.remove('visible');
  const bassTimeline = document.getElementById('analyzer-bass-timeline-wrapper');
  if (bassTimeline) bassTimeline.remove();
  const bassDevInfo = document.getElementById('analyzer-bass-dev-info');
  if (bassDevInfo) bassDevInfo.remove();
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
  const def = CHORD_DEFINITIONS.find((d) => d.symbol === suffix);
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

function applyChordOverride(segmentIndex, override) {
  const seg = currentAnalysis?.chords?.[segmentIndex];
  if (!seg) return;
  const normalized = normalizeOverride(seg, override);
  pushUndo({ segmentIndex, oldState: seg.manualOverride, newState: normalized });
  seg.manualOverride = normalized;
  rerenderTimeline();
}

function initChordEditor() {
  chordEditor = new ChordEditor({
    onSave: (segmentIndex, override) => {
      applyChordOverride(segmentIndex, override);
    },
    onCancel: () => {
      // Rien à faire — l'éditeur est fermé
    },
    onReset: (segmentIndex) => {
      applyChordOverride(segmentIndex, null);
    },
  });
}

function initKeyboardShortcuts() {
  document.addEventListener('keydown', (e) => {
    if (chordEditor?.isOpen) {
      if (e.key === 'Escape') {
        e.preventDefault();
        chordEditor.close();
        return;
      }
      // Ne pas intercepter Ctrl+Z dans l'éditeur si un champ texte a le focus
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
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
  chordEditor.open(seg, segmentIndex, currentAnalysis);
}

function renderTimeline(chords, duration) {
  if (!els.chordTimelineInner) return;
  els.chordTimelineInner.innerHTML = '';

  duration = Math.max(duration || 0, 1);
  const pps = BASE_PIXELS_PER_SECOND * timelineZoom;
  const totalWidth = Math.max(duration * pps + (chords.length - 1) * BLOCK_GAP, 0);
  els.chordTimelineInner.style.width = `${totalWidth}px`;

  if (chords.length === 0) {
    els.chordTimelineInner.innerHTML = '<span class="text-sm text-zinc-500">Aucun accord détecté.</span>';
    return;
  }

  chords.forEach((chord, index) => {
    const block = document.createElement('button');
    block.className = 'absolute inset-y-2 flex items-center justify-center bg-zinc-800 border border-zinc-700 rounded-md text-zinc-200 font-bold text-lg cursor-pointer hover:bg-zinc-700 hover:border-sky-500 transition-all overflow-hidden';
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
      block.classList.remove('bg-zinc-800', 'border-zinc-700', 'text-zinc-200');
    } else {
      block.classList.remove('!bg-sky-600', '!border-sky-400', '!text-white', 'shadow-lg', 'shadow-sky-500/20', 'scale-105', 'z-10');
      block.classList.add('bg-zinc-800', 'border-zinc-700', 'text-zinc-200');
    }
  });

  // Hero chord
  const activeChord = activeIndex >= 0 ? chords[activeIndex] : null;
  renderHeroChord(activeChord);

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
  showToast(`MIDI exporté vers ${filePath}`);
}

function showToast(message, duration = 3000) {
  const existing = document.getElementById('analyzer-toast');
  if (existing) existing.remove();
  const toast = document.createElement('div');
  toast.id = 'analyzer-toast';
  toast.className = 'analyzer-toast';
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
        t.classList.add('text-zinc-500', 'hover:text-zinc-300');
        t.setAttribute('aria-selected', 'false');
      });
      tab.classList.remove('text-zinc-500', 'hover:text-zinc-300');
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

async function loadAudioBlobUrl(filePath) {
  if (!window.electronAPI?.files?.readBinary) {
    throw new Error('Lecture de fichier non disponible');
  }
  const bytes = await window.electronAPI.files.readBinary(filePath);
  const blob = new Blob([bytes], { type: 'audio/wav' });
  return URL.createObjectURL(blob);
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
