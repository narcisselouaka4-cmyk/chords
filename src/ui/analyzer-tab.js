import { selectMediaFile, createAudioPlayer, isSupportedMediaFile } from '../audio/media-engine.js';
import { createAudioAnalyzer } from '../analyzer/audio-analyzer.js';
import { enrichChordWithBass } from '../analyzer/bass-harmonic-relation.js';
import { miniKeyboardForNotes } from './mini-keyboard.js';
import { formatNote } from '../chord-engine/intervals.js';

// [Claude] — 2026-07-08 — Onglet Analyse au modèle Chordify.
// Flux : import d'un fichier media → analyse automatique → affichage d'une timeline
// horizontale d'accords synchronisée, avec mini-claviers pédagogiques.
// Les fonctionnalités avancées (paroles, boucle fine, accordeur, suggestions)
// sont volontairement en placeholder pour l'instant.

const PIXELS_PER_SECOND = 64;
const MIN_BLOCK_WIDTH = 56;

const els = {
  importScreen: document.getElementById('analyzer-import-screen'),
  importBtn: document.getElementById('analyzer-import-btn'),
  results: document.getElementById('analyzer-results'),
  backBtn: document.getElementById('analyzer-back-btn'),

  // En-tête morceau
  songTitle: document.getElementById('analyzer-song-title'),
  songArtist: document.getElementById('analyzer-song-artist'),
  stemBadge: document.getElementById('analyzer-stem-badge'),

  // Lecteur
  prevBtn: document.getElementById('analyzer-prev-btn'),
  playBtn: document.getElementById('analyzer-play-btn'),
  progressTrack: document.getElementById('analyzer-progress-track'),
  progressFill: document.getElementById('analyzer-progress-fill'),
  progressThumb: document.getElementById('analyzer-progress-thumb'),
  currentTimeEl: document.getElementById('analyzer-current-time'),
  durationEl: document.getElementById('analyzer-duration'),

  // Outils
  countdownBtn: document.getElementById('analyzer-countdown-btn'),
  loopBtn: document.getElementById('analyzer-loop-btn'),
  tempoSlider: document.getElementById('analyzer-tempo'),
  tempoValue: document.getElementById('analyzer-tempo-value'),
  transposeBtn: document.getElementById('analyzer-transpose-btn'),
  simplifyBtn: document.getElementById('analyzer-simplify-btn'),
  tunerBtn: document.getElementById('analyzer-tuner-btn'),

  // Timeline horizontale
  chordTimeline: document.getElementById('analyzer-chord-timeline'),
  chordTimelineInner: document.getElementById('analyzer-chord-timeline-inner'),
  timelineScrollLeft: document.getElementById('analyzer-timeline-scroll-left'),
  timelineScrollRight: document.getElementById('analyzer-timeline-scroll-right'),

  // Lecteur audio natif
  audioContainer: document.getElementById('analyzer-audio-container'),

  // Onglets + contenu
  viewTabs: document.querySelectorAll('.analyzer-view-tab'),
  chordGrid: document.getElementById('analyzer-chord-grid'),
  previewView: document.getElementById('analyzer-preview-view'),
  lyricsView: document.getElementById('analyzer-lyrics-view'),

  // Panneau latéral
  infoKey: document.getElementById('analyzer-info-key'),
  infoChords: document.getElementById('analyzer-info-chords'),
  infoBpm: document.getElementById('analyzer-info-bpm'),
  infoSignature: document.getElementById('analyzer-info-signature'),
  infoDuration: document.getElementById('analyzer-info-duration'),

  processing: document.getElementById('analyzer-processing'),
  processingText: document.getElementById('analyzer-processing-text'),
};

let analyzer = null;
let currentPlayer = null;
let currentAnalysis = null;
let currentFileName = '';
let isDraggingProgress = false;
let isLooping = false;
let devMode = false;

export function initAnalyzerTab() {
  analyzer = createAudioAnalyzer();
  bindImportButton();
  bindPlayerControls();
  bindToolbar();
  bindTimelineScroll();
  bindViewTabs();
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

  renderHeader(analysis);
  renderSidebar(analysis);

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

  const bassSegments = analysis.bassSegments || [];

  // Enrich chords with bass info
  const enrichedChords = bassSegments.length > 0
    ? analysis.chords.map((c) => {
        const dominant = findDominantBassForChord(bassSegments, c.startTime, c.endTime);
        return enrichChordWithBass(c, dominant);
      })
    : analysis.chords;

  renderTimeline(analysis.chords || [], analysis.duration || 0);
  renderBassTimeline(bassSegments, analysis.duration || 0);
  renderChordGrid(enrichedChords);
  renderBassDevInfo(bassSegments);
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

function renderSidebar(analysis) {
  const chords = analysis.chords || [];
  const uniqueChords = [...new Set(chords.map((c) => c.chord).filter(Boolean))].slice(0, 8);

  els.infoKey.textContent = analysis.key ? `${formatKeyLabel(analysis.key, analysis.keyMode)}` : '—';
  els.infoChords.textContent = uniqueChords.length ? uniqueChords.join(' · ') : '—';
  els.infoBpm.textContent = analysis.tempo ? `${Math.round(analysis.tempo)}` : '—';
  els.infoSignature.textContent = analysis.timeSignature ?? '—';
  els.infoDuration.textContent = analysis.duration ? formatTime(analysis.duration) : '—';
}

function formatKeyLabel(name, mode) {
  if (!name) return '—';
  const suffix = mode === 'minor' ? ' mineur' : ' majeur';
  return `${name}${suffix}`;
}

function showImportScreen() {
  if (currentPlayer) {
    currentPlayer.destroy();
    currentPlayer = null;
  }
  currentAnalysis = null;
  currentFileName = '';
  els.results.style.display = 'none';
  els.importScreen.style.display = 'flex';
  els.chordTimelineInner.innerHTML = '';
  els.chordGrid.innerHTML = '';
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
  // Retourne les pitch-classes d'un accord standard à partir de son nom texte.
  if (!chordName || chordName === 'N') return [];
  const rootMatch = chordName.match(/^([A-G][#b]?)/);
  if (!rootMatch) return [];
  const rootPc = noteNameToPc(rootMatch[1]);
  if (rootPc === null) return [];

  const suffix = chordName.slice(rootMatch[1].length).trim();
  let intervals = [0, 4, 7]; // majeur par défaut
  if (suffix === 'm' || suffix === 'min') intervals = [0, 3, 7];
  else if (suffix === '7') intervals = [0, 4, 7, 10];
  else if (suffix === 'maj7' || suffix === 'M7') intervals = [0, 4, 7, 11];
  else if (suffix === 'm7') intervals = [0, 3, 7, 10];
  else if (suffix === 'sus2') intervals = [0, 2, 7];
  else if (suffix === 'sus4') intervals = [0, 5, 7];
  else if (suffix === 'dim') intervals = [0, 3, 6];
  else if (suffix === 'aug') intervals = [0, 4, 8];

  return intervals.map((i) => (rootPc + i) % 12);
}

function noteNameToPc(name) {
  const normalized = name.trim().replace(/♭/g, 'b').replace(/♯/g, '#');
  const base = normalized.charAt(0).toUpperCase();
  const alter = normalized.slice(1);
  const baseIndex = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'].indexOf(base);
  if (baseIndex === -1) return null;
  let offset = 0;
  for (const ch of alter) {
    if (ch === '#') offset += 1;
    else if (ch === 'b') offset -= 1;
  }
  return (baseIndex + offset + 12) % 12;
}

function chordNotesInRange(chordName) {
  const pcs = chordNotes(chordName);
  if (!pcs.length) return [];
  // Octave C4 autour du centre : on construit des notes MIDI entre C4 et B5.
  return pcs.map((pc) => 60 + ((pc - (60 % 12) + 12) % 12));
}

function renderTimeline(chords, duration) {
  if (!els.chordTimelineInner) return;
  els.chordTimelineInner.innerHTML = '';

  duration = Math.max(duration || 0, 1);
  const totalWidth = Math.max(duration * PIXELS_PER_SECOND, 0);
  els.chordTimelineInner.style.width = `${totalWidth}px`;

  if (chords.length === 0) {
    els.chordTimelineInner.innerHTML = '<p class="detail-hint">Aucun accord détecté.</p>';
    return;
  }

  chords.forEach((chord, index) => {
    const block = document.createElement('button');
    block.className = 'analyzer-timeline-block';
    block.type = 'button';
    block.dataset.index = String(index);
    block.dataset.start = String(chord.startTime);

    const left = chord.startTime * PIXELS_PER_SECOND;
    const width = Math.max((chord.endTime - chord.startTime) * PIXELS_PER_SECOND, MIN_BLOCK_WIDTH);
    block.style.left = `${left}px`;
    block.style.width = `${width}px`;

    block.innerHTML = `
      <span class="analyzer-timeline-block-name">${escapeHtml(chord.chord)}</span>
    `;

    block.addEventListener('click', () => {
      if (currentPlayer) {
        currentPlayer.seek(chord.startTime);
        currentPlayer.play();
      }
    });
    block.addEventListener('pointerdown', (e) => e.stopPropagation());
    els.chordTimelineInner.appendChild(block);
  });
}

function findDominantBassForChord(bassSegments, chordStart, chordEnd) {
  const overlapping = bassSegments.filter((s) =>
    s.startTime < chordEnd && s.endTime > chordStart
  );
  if (!overlapping.length) return null;

  const byMidi = {};
  for (const s of overlapping) {
    const overlap = Math.min(s.endTime, chordEnd) - Math.max(s.startTime, chordStart);
    if (overlap < 0.05) continue;
    if (!byMidi[s.midi]) byMidi[s.midi] = { ...s, totalOverlap: 0 };
    byMidi[s.midi].totalOverlap += overlap;
  }

  const entries = Object.entries(byMidi);
  if (!entries.length) return null;
  const best = entries.sort((a, b) => b[1].totalOverlap - a[1].totalOverlap)[0][1];
  return best;
}

function renderBassTimeline(bassSegments, duration) {
  const containerId = 'analyzer-bass-timeline-inner';
  let inner = document.getElementById(containerId);
  if (!inner) {
    const wrapper = document.createElement('div');
    wrapper.className = 'analyzer-bass-timeline';
    wrapper.id = 'analyzer-bass-timeline-wrapper';
    inner = document.createElement('div');
    inner.className = 'analyzer-timeline-inner';
    inner.id = containerId;
    wrapper.appendChild(inner);
    els.chordTimeline.parentNode.insertBefore(wrapper, els.chordTimeline.nextSibling);
  }
  inner.innerHTML = '';

  if (!bassSegments || bassSegments.length === 0) {
    inner.innerHTML = '<p class="detail-hint">Aucune basse détectée.</p>';
    return;
  }

  duration = Math.max(duration || 0, 1);
  const totalWidth = Math.max(duration * PIXELS_PER_SECOND, 0);
  inner.style.width = `${totalWidth}px`;

  bassSegments.forEach((seg) => {
    const block = document.createElement('div');
    block.className = 'analyzer-bass-block';
    block.dataset.start = String(seg.startTime);

    const left = seg.startTime * PIXELS_PER_SECOND;
    const width = Math.max((seg.endTime - seg.startTime) * PIXELS_PER_SECOND, 4);
    block.style.left = `${left}px`;
    block.style.width = `${width}px`;

    const noteLabel = `${seg.note || seg.noteName || ''}${seg.octave != null ? seg.octave : ''}`;
    block.innerHTML = `<span class="analyzer-bass-block-label">${escapeHtml(noteLabel)}</span>`;

    if (seg.isVirtual) block.classList.add('bass-virtual');
    if (devMode) {
      block.title = `src=${seg.source || 'bass_engine'} virt=${seg.isVirtual} conf=${seg.confidence}`;
    }

    block.addEventListener('click', () => {
      if (currentPlayer) {
        currentPlayer.seek(seg.startTime);
        currentPlayer.play();
      }
    });

    inner.appendChild(block);
  });
}

function renderBassDevInfo(bassSegments) {
  const containerId = 'analyzer-bass-dev-info';
  let devInfo = document.getElementById(containerId);
  if (!devInfo) {
    devInfo = document.createElement('div');
    devInfo.id = containerId;
    devInfo.className = 'analyzer-dev-info';
    els.chordTimeline.parentNode.insertBefore(devInfo, els.chordTimeline.nextSibling);
  }

  // Hide dev info by default
  devInfo.style.display = devMode ? 'block' : 'none';

  if (!devMode || !bassSegments || bassSegments.length === 0) return;

  const virtualCount = bassSegments.filter((s) => s.isVirtual).length;
  const realCount = bassSegments.length - virtualCount;
  const virtualPct = bassSegments.length > 0 ? (virtualCount / bassSegments.length * 100).toFixed(1) : 0;

  devInfo.innerHTML = `
    <div class="dev-info-header">Mode développeur — Analyse basse</div>
    <div class="dev-info-row">
      <span>Segments basse</span><span>${bassSegments.length}</span>
      <span>Dont virtuels</span><span>${virtualCount} (${virtualPct}%)</span>
      <span>Dont réels BE</span><span>${realCount}</span>
    </div>
  `;
}

function toggleDevMode() {
  devMode = !devMode;
  const btn = document.getElementById('analyzer-dev-toggle');
  if (btn) btn.classList.toggle('active', devMode);
  if (currentAnalysis) {
    renderBassDevInfo(currentAnalysis.bassSegments || []);
    const bassBlocks = document.querySelectorAll('.analyzer-bass-block');
    bassBlocks.forEach((b) => b.title = devMode ? 'mode dev' : '');
  }
}

function renderChordGrid(chords) {
  if (!els.chordGrid) return;
  els.chordGrid.innerHTML = '';

  if (chords.length === 0) {
    els.chordGrid.innerHTML = '<p class="detail-hint">Aucun accord détecté.</p>';
    return;
  }

  chords.forEach((chord, index) => {
    const notes = chordNotesInRange(chord.chord || chord.structuralChord || '');
    const { svg, noteNames } = notes.length
      ? miniKeyboardForNotes(notes)
      : { svg: '', noteNames: [] };

    const card = document.createElement('div');
    card.className = 'analyzer-chord-card';
    card.dataset.index = String(index);

    let bassHtml = '';
    if (chord.bass) {
      const bassLabel = `${chord.bass.note}${chord.bass.octave}`;
      bassHtml = `<div class="chord-card-bass">Basse: ${escapeHtml(bassLabel)}`;
      if (chord.bass.relationToChord && chord.bass.relationToChord !== 'root') {
        bassHtml += ` <span class="chord-card-relation">(${chord.bass.relationToChord})</span>`;
      }
      bassHtml += '</div>';
      if (chord.bassInterpretation?.slashChord && devMode) {
        bassHtml += `<div class="chord-card-interp">→ ${escapeHtml(chord.bassInterpretation.slashChord.name)}</div>`;
      }
      if (devMode) {
        bassHtml += `<div class="chord-card-dev">src=${chord.bass.source} virt=${chord.bass.isVirtual} conf=${chord.bass.confidence}</div>`;
      }
    }

    card.innerHTML = `
      <div class="analyzer-chord-card-name">${escapeHtml(chord.chord)}</div>
      <div class="analyzer-chord-card-time">${formatTime(chord.startTime)}</div>
      <div class="analyzer-chord-card-keyboard">${svg}</div>
      <div class="analyzer-chord-card-notes">${escapeHtml(noteNames.join(' · ') || '')}</div>
      ${bassHtml}
    `;

    card.addEventListener('click', () => {
      if (currentPlayer) {
        currentPlayer.seek(chord.startTime);
        currentPlayer.play();
      }
    });

    els.chordGrid.appendChild(card);
  });
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

  // Mise en évidence de l'accord courant dans la timeline.
  const chords = currentAnalysis.chords || [];
  let activeIndex = -1;
  for (let i = 0; i < chords.length; i++) {
    if (clamped >= chords[i].startTime && clamped < chords[i].endTime) {
      activeIndex = i;
      break;
    }
  }

  const blocks = els.chordTimelineInner.querySelectorAll('.analyzer-timeline-block');
  blocks.forEach((block, idx) => {
    block.classList.toggle('active', idx === activeIndex);
  });

  const cards = els.chordGrid.querySelectorAll('.analyzer-chord-card');
  cards.forEach((card, idx) => {
    card.classList.toggle('active', idx === activeIndex);
  });

  // Mise en évidence de la basse courante.
  const bassBlocks = document.querySelectorAll('#analyzer-bass-timeline-inner .analyzer-bass-block');
  const bassSegments = currentAnalysis.bassSegments || [];
  let activeBassIdx = -1;
  for (let i = 0; i < bassSegments.length; i++) {
    if (clamped >= bassSegments[i].startTime && clamped < bassSegments[i].endTime) {
      activeBassIdx = i;
      break;
    }
  }
  bassBlocks.forEach((block, idx) => {
    block.classList.toggle('active', idx === activeBassIdx);
  });

  // Auto-scroll horizontal de la timeline des accords.
  if (activeIndex >= 0 && blocks[activeIndex]) {
    const block = blocks[activeIndex];
    const containerRect = els.chordTimeline.getBoundingClientRect();
    const blockRect = block.getBoundingClientRect();
    const targetScroll = els.chordTimeline.scrollLeft + blockRect.left - containerRect.left - containerRect.width / 2 + blockRect.width / 2;
    els.chordTimeline.scrollTo({ left: targetScroll, behavior: 'smooth' });
  }
}

function bindPlayerControls() {
  els.playBtn?.addEventListener('click', () => {
    if (!currentPlayer) return;
    if (currentPlayer.element?.paused) {
      currentPlayer.play();
    } else {
      currentPlayer.pause();
    }
    updatePlayButton();
  });

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
  els.tempoSlider?.addEventListener('input', () => {
    const rate = Number(els.tempoSlider.value);
    els.tempoValue.textContent = `${Math.round(rate * 100)}%`;
    if (currentPlayer?.element) {
      currentPlayer.element.playbackRate = rate;
    }
  });

  els.loopBtn?.addEventListener('click', () => {
    isLooping = !isLooping;
    els.loopBtn.classList.toggle('active', isLooping);
    if (currentPlayer?.element) {
      currentPlayer.element.loop = isLooping;
    }
  });

  // Placeholders : affichent une alerte éducative pour l'instant.
  els.countdownBtn?.addEventListener('click', () => alert('Compte à rebours — à venir.'));
  els.transposeBtn?.addEventListener('click', () => alert('Transposition globale — à venir.'));
  els.simplifyBtn?.addEventListener('click', () => alert('Simplification des accords — à venir.'));
  els.tunerBtn?.addEventListener('click', () => alert('Accordeur — à venir.'));

  // Dev mode toggle
  const devToggle = document.createElement('button');
  devToggle.type = 'button';
  devToggle.id = 'analyzer-dev-toggle';
  devToggle.className = 'analyzer-tool-btn analyzer-dev-toggle';
  devToggle.title = 'Mode développeur (basse)';
  devToggle.textContent = 'Dev';
  devToggle.addEventListener('click', toggleDevMode);
  els.tunerBtn?.parentNode?.insertBefore(devToggle, els.tunerBtn.nextSibling);
}

function bindTimelineScroll() {
  els.timelineScrollLeft?.addEventListener('click', () => {
    const delta = -els.chordTimeline.clientWidth * 0.6;
    els.chordTimeline.scrollBy({ left: delta, behavior: 'smooth' });
    syncBassTimelineScroll();
  });
  els.timelineScrollRight?.addEventListener('click', () => {
    const delta = els.chordTimeline.clientWidth * 0.6;
    els.chordTimeline.scrollBy({ left: delta, behavior: 'smooth' });
    syncBassTimelineScroll();
  });

  // Sync bass timeline when chord timeline scrolls
  els.chordTimeline?.addEventListener('scroll', syncBassTimelineScroll);
}

function syncBassTimelineScroll() {
  const bassWrapper = document.getElementById('analyzer-bass-timeline-wrapper');
  if (bassWrapper) {
    bassWrapper.scrollLeft = els.chordTimeline?.scrollLeft || 0;
  }
}

function bindViewTabs() {
  els.viewTabs?.forEach((tab) => {
    tab.addEventListener('click', () => {
      els.viewTabs.forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');
      const view = tab.dataset.view;
      els.chordGrid.style.display = view === 'grid' ? 'grid' : 'none';
      els.previewView.style.display = view === 'preview' ? 'flex' : 'none';
      els.lyricsView.style.display = view === 'lyrics' ? 'flex' : 'none';
    });
  });
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
