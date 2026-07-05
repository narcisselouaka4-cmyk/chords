import { analyzeSession, loadAnalysis } from '../analyzer/analyzer.js';
import { suggestForChord, getStyleLabels } from '../analyzer/reharmonizer.js';
import { formatPc } from '../chord-engine/naming.js';
import { getVoicingLabel } from '../chord-engine/voicing.js';
import { miniKeyboardForNotes } from './mini-keyboard.js';
import { generateReharmonization, generateMasterclass, midiToNoteName } from '../ai/ai-client.js';
import { getAIConfig } from '../ai/openai-config.js';
import { parseChordGrid, compareGridToPlayed } from '../analyzer/chord-comparator.js';

// [OpenCode] — 2026-07-04 — Interface d'analyse pédagogique.
// Timeline d'accords par section + panneau droit de suggestions par style avec mini-claviers.

// Normalise les notes : si ce sont des pitch classes (0-11, cache d'anciennes analyses),
// on les remappe dans la tessiture C3-B4 (MIDI 48-71) pour un affichage correct.
function normalizeNotes(notes) {
  if (!Array.isArray(notes) || notes.length === 0) return notes;
  if (notes.every((n) => typeof n === 'number' && n >= 0 && n < 12)) {
    return notes.map((pc) => pc + 48);
  }
  return notes;
}

function formatNoteName(note) {
  if (note == null) return '—';
  if (note < 12) return formatPc(note, notation === 'latin');
  return formatPc(note % 12, notation === 'latin') + Math.floor(note / 12 - 1);
}

const SECTION_LABELS = {
  Intro: 'Intro',
  Verse: 'Couplet',
  PreChorus: 'Pré-refrain',
  Chorus: 'Refrain',
  Bridge: 'Bridge',
  Outro: 'Outro',
  Interlude: 'Interlude',
};

let currentAnalysis = null;
let notation = 'english';
let feedMidiEvent = null;
let currentSuggestionNotes = [];
let onSuggestionPlay = null;
let suggestionCache = new Map(); // key: rootPc-symbol, value: Map<style->suggestion>
let currentAnalysisMode = 'midi';
let currentAnalysisContainer = null;
let currentAnalysisSessionId = null;
let currentAnalysisEvents = null;
let currentAnalysisSession = null;

export function initAnalyzerTab({ containerId, onPlay, onSuggestionPlay: sugPlay } = {}) {
  if (onPlay) feedMidiEvent = onPlay;
  if (sugPlay) onSuggestionPlay = sugPlay;
  bindAnalysisModeTabs();
}

function bindAnalysisModeTabs() {
  document.querySelectorAll('.analysis-mode-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.analysis-mode-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      currentAnalysisMode = btn.dataset.mode || 'midi';
      refreshAnalysisView();
    });
  });
}

function refreshAnalysisView() {
  if (!currentAnalysisContainer || !currentAnalysisSessionId) return;
  if (currentAnalysisMode === 'midi') {
    renderAnalysis(currentAnalysisSessionId, currentAnalysisEvents, currentAnalysisSession, currentAnalysisContainer);
  } else {
    currentAnalysisContainer.innerHTML = currentAnalysisMode === 'tutorial'
      ? buildTutorialHtml()
      : buildCoverHtml();
    if (currentAnalysisMode === 'cover') {
      bindCoverTimelineControls();
    }
  }
}

function bindCoverTimelineControls() {
  const duration = computeAnalysisDuration(currentAnalysis?.chords || []);
  bindCoverTimelineSeek(
    (time) => {
      // Synchroniser avec le lecteur studio s'il est actif
      const studioPlayer = document.getElementById('studio-player');
      if (studioPlayer) studioPlayer.currentTime = time;
    },
    () => {
      const studioPlayer = document.getElementById('studio-player');
      return studioPlayer ? studioPlayer.currentTime : 0;
    }
  );
  // Mise à jour régulière de la tête de lecture de la timeline
  if (window._coverTimelineInterval) clearInterval(window._coverTimelineInterval);
  window._coverTimelineInterval = setInterval(() => {
    const studioPlayer = document.getElementById('studio-player');
    if (studioPlayer) {
      updateCoverTimelineProgress(studioPlayer.currentTime, duration);
    }
  }, 250);
}

function clearSuggestionNotes() {
  if (currentSuggestionNotes.length > 0) {
    if (onSuggestionPlay) {
      onSuggestionPlay('clear', currentSuggestionNotes);
    } else if (feedMidiEvent) {
      for (const note of currentSuggestionNotes) {
        feedMidiEvent('noteOff', note);
      }
    }
    currentSuggestionNotes = [];
  }
}

export function setAnalyzerNotation(value) {
  notation = value;
}

export async function renderAnalysis(sessionId, events, session, container) {
  if (!container) return;
  currentAnalysisContainer = container;
  currentAnalysisSessionId = sessionId;
  currentAnalysisEvents = events;
  currentAnalysisSession = session;

  if (currentAnalysisMode !== 'midi') {
    container.innerHTML = currentAnalysisMode === 'tutorial' ? buildTutorialHtml() : buildCoverHtml();
    return;
  }

  container.innerHTML = '<p class="detail-hint">Analyse en cours...</p>';

  try {
    const analysis = await analyzeSession(sessionId, events, session);
    currentAnalysis = analysis;
    suggestionCache.clear();
    container.innerHTML = buildAnalysisHtml(analysis);
    bindAnalysisActions(container, analysis);
  } catch (err) {
    console.error('Analysis failed:', err);
    container.innerHTML = `<p class="detail-hint">Erreur d'analyse : ${escapeHtml(err.message)}</p>`;
  }
}

function buildAnalysisHtml(analysis) {
  return `
    <div class="analysis-layout">
      <div class="analysis-timeline">
        <div class="panel-title">Accords originaux par section</div>
        ${buildSectionsHtml(analysis.sections, analysis.chords)}
        <div class="panel chord-grid-panel" style="margin-top: 1rem;">
          <div class="panel-title" style="cursor:pointer;" id="chord-grid-toggle">Grille de référence <span id="chord-grid-toggle-icon">+</span></div>
          <div id="chord-grid-content" style="display:none;">
            <p class="detail-hint">Entrez la grille attendue (un accord par ligne ou séparé par des espaces) :</p>
            <textarea id="chord-grid-input" class="chord-grid-input" rows="4" placeholder="C  Am7  Dm7  G7&#10;C  Am7  Dm7  G7"></textarea>
            <button id="chord-grid-compare-btn" class="panel-action" type="button">Comparer</button>
            <div id="chord-grid-result"></div>
          </div>
        </div>
      </div>
      <div class="analysis-detail" id="analysis-detail">
        <p class="detail-hint">Cliquez sur un accord pour explorer les suggestions.</p>
      </div>
    </div>
  `;
}

function buildSectionsHtml(sections, chords) {
  if (!sections || sections.length === 0) {
    return '<p class="detail-hint">Aucune section détectée. Jouez des silences et des progressions répétées pour aider la segmentation.</p>';
  }

  return sections.map((section, index) => {
    const label = SECTION_LABELS[section.label] || section.label;
    const sectionChords = section.chords?.length
      ? section.chords
      : section.chordIndices?.map((i) => chords[i]).filter(Boolean) || [];

    const chordButtons = sectionChords.map((chord, chordIndex) => {
      const globalIndex = section.chordIndices?.[chordIndex] ?? -1;
      const formatted = formatChord(chord);
      const voicingHtml = formatted.voicing
        ? `<span class="chord-tile-voicing">${escapeHtml(formatted.voicing)}</span>`
        : '';
      const graceHtml = (chord.graceNotes?.length)
        ? `<span class="chord-tile-grace" title="Grace notes: ${escapeHtml(chord.graceNotes.map((n) => formatNoteName(n)).join(' '))}">✨</span>`
        : '';
      return `
        <button class="chord-tile" data-chord-index="${globalIndex}" title="${escapeHtml(formatted.name)}">
          <span class="chord-tile-name">${escapeHtml(formatted.name)}</span>
          ${voicingHtml}
          ${graceHtml}
          <span class="chord-tile-time">${formatDuration(chord.time)}</span>
        </button>
      `;
    }).join('');

    return `
      <div class="analysis-section" data-section-index="${index}">
        <div class="section-header">
          <span class="section-label">${index + 1}. ${label}</span>
        </div>
        <div class="chord-grid">${chordButtons || '<span class="detail-hint">Aucun accord</span>'}</div>
      </div>
    `;
  }).join('');
}

function formatChord(chord) {
  if (!chord) return { name: '—', voicing: '' };
  const root = formatPc(chord.rootPc, notation === 'latin');
  const symbol = chord.symbol || '';
  const bass = chord.bassPc != null && chord.bassPc !== chord.rootPc ? `/${formatPc(chord.bassPc, notation === 'latin')}` : '';

  // Some symbols are actually voicing descriptors (cluster, quartal, ?).
  // Display them separately to avoid names like "Ecluster".
  if (['cluster', 'quartal', 'quartal(add4)', '?'].includes(symbol)) {
    const name = symbol === '?' ? root : root;
    const voicing = symbol === '?' ? 'Non identifié' : getVoicingLabel(symbol);
    return { name, voicing };
  }

  return { name: `${root}${symbol}${bass}`, voicing: getVoicingLabel(chord.voicing) };
}

function getTopNote(chord) {
  if (!chord || !chord.notes || chord.notes.length === 0) return null;
  return Math.max(...chord.notes);
}

function getTopNoteName(chord) {
  const top = getTopNote(chord);
  return top != null ? formatNoteName(top) : '—';
}

const BASS_OPTIONS = [
  { value: '', label: 'Auto' },
  { value: '1', label: 'Fondamentale (1)' },
  { value: '3', label: 'Tierce (3)' },
  { value: '5', label: 'Quinte (5)' },
  { value: '7', label: 'Septième (7)' },
  { value: '7-3-6', label: '7-3-6' },
  { value: '7-3-6-2-5', label: '7-3-6-2-5' },
  { value: '5-1', label: '5-1' },
  { value: '2-5-1', label: '2-5-1' },
];

function buildArrangementPanel(analysis) {
  const chords = analysis.chords || [];
  if (chords.length === 0) return '<p class="detail-hint">Aucun accord à arranger.</p>';

  const bassOptionsHtml = BASS_OPTIONS.map((o) =>
    `<option value="${escapeHtml(o.value)}">${escapeHtml(o.label)}</option>`
  ).join('');

  const rows = chords.map((chord, i) => {
    const formatted = formatChord(chord);
    const topNoteName = getTopNoteName(chord);
    const active = chord._arrangementActive !== false;
    const bassValue = chord._arrangementBass || '';
    return `
      <div class="arrangement-row" data-chord-index="${i}">
        <span class="arrangement-name">${escapeHtml(formatted.name)}</span>
        <span class="arrangement-topnote">${escapeHtml(topNoteName)}</span>
        <label class="arrangement-toggle">
          <input type="checkbox" ${active ? 'checked' : ''} data-chord-index="${i}" />
        </label>
        <select class="arrangement-bass" data-chord-index="${i}">
          ${bassOptionsHtml.replace(`value="${bassValue}"`, `value="${bassValue}" selected`)}
        </select>
      </div>
    `;
  }).join('');

  return `
    <div class="arrangement-panel">
      <div class="arrangement-header">
        <span class="arrangement-col-name">Accord</span>
        <span class="arrangement-col-topnote">Top Note</span>
        <span class="arrangement-col-active">Actif</span>
        <span class="arrangement-col-bass">Basse</span>
      </div>
      ${rows}
      <div class="arrangement-footer">
        <span class="detail-hint">Désactivez un accord pour qu'il respire. Forcez la basse via le menu déroulant.</span>
      </div>
    </div>
  `;
}

function bindAnalysisActions(container, analysis) {
  const detail = container.querySelector('#analysis-detail');
  container.querySelectorAll('.chord-tile').forEach((btn) => {
    btn.addEventListener('click', () => {
      clearSuggestionNotes();
      const index = Number(btn.dataset.chordIndex);
      const chord = analysis.chords[index];
      if (!chord) return;
      renderChordDetail(detail, chord, index);
      container.querySelectorAll('.chord-tile').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });

  // Panneau d'arrangement harmonique
  const arrangementHtml = buildArrangementPanel(analysis);
  const arrangementSection = document.createElement('div');
  arrangementSection.className = 'panel arrangement-section';
  arrangementSection.innerHTML = `
    <div class="panel-title" style="cursor:pointer;" id="arrangement-toggle">
      Arrangement harmonique <span id="arrangement-toggle-icon">−</span>
    </div>
    <div id="arrangement-content">${arrangementHtml}</div>
  `;
  detail.parentNode.insertBefore(arrangementSection, detail);

  // Toggle arrangement panel
  const arrToggle = arrangementSection.querySelector('#arrangement-toggle');
  const arrContent = arrangementSection.querySelector('#arrangement-content');
  const arrIcon = arrangementSection.querySelector('#arrangement-toggle-icon');
  arrToggle?.addEventListener('click', () => {
    const isHidden = arrContent.style.display === 'none';
    arrContent.style.display = isHidden ? '' : 'none';
    arrIcon.textContent = isHidden ? '−' : '+';
  });

  // Arrangement toggle change handler
  arrangementSection.querySelectorAll('.arrangement-toggle input').forEach((cb) => {
    cb.addEventListener('change', () => {
      const idx = Number(cb.dataset.chordIndex);
      const chord = analysis.chords[idx];
      if (chord) chord._arrangementActive = cb.checked;
    });
  });

  // Arrangement bass dropdown handler
  arrangementSection.querySelectorAll('.arrangement-bass').forEach((select) => {
    select.addEventListener('change', () => {
      const idx = Number(select.dataset.chordIndex);
      const chord = analysis.chords[idx];
      if (chord) chord._arrangementBass = select.value || null;
    });
  });

  // Bouton Masterclass IA — inséré dans le panneau de détail pour éviter tout saut graphique
  const masterclassBtn = document.createElement('button');
  masterclassBtn.className = 'panel-action masterclass-btn';
  masterclassBtn.textContent = '🎓 Masterclass IA';
  masterclassBtn.type = 'button';
  masterclassBtn.style.marginTop = '8px';
  masterclassBtn.style.width = '100%';
  detail.appendChild(masterclassBtn);

  const masterclassResult = document.createElement('div');
  masterclassResult.className = 'masterclass-result';
  masterclassResult.style.display = 'none';
  detail.appendChild(masterclassResult);

  masterclassBtn.addEventListener('click', async () => {
    masterclassBtn.disabled = true;
    masterclassBtn.textContent = 'Analyse en cours...';
    masterclassResult.style.display = 'block';
    masterclassResult.innerHTML = '<p class="detail-hint">Consultation du professeur...</p>';
    const data = await generateMasterclass(analysis);
    masterclassBtn.disabled = false;
    masterclassBtn.textContent = '🎓 Masterclass IA';
    if (!data) {
      const hasKey = getAIConfig()?.apiKey;
      masterclassResult.innerHTML = hasKey
        ? '<p class="detail-hint">Masterclass temporairement indisponible (limite de requêtes ou erreur réseau). Réessayez plus tard.</p>'
        : '<p class="detail-hint">Configurez une clé API dans ⚙️ Paramètres IA pour utiliser la Masterclass.</p>';
      return;
    }
    masterclassResult.innerHTML = buildMasterclassHtml(data, analysis);
  });

  // Grille de référence : toggle + comparaison
  const toggle = container.querySelector('#chord-grid-toggle');
  const content = container.querySelector('#chord-grid-content');
  const toggleIcon = container.querySelector('#chord-grid-toggle-icon');
  toggle?.addEventListener('click', () => {
    const isHidden = content.style.display === 'none';
    content.style.display = isHidden ? '' : 'none';
    toggleIcon.textContent = isHidden ? '−' : '+';
  });

  const compareBtn = container.querySelector('#chord-grid-compare-btn');
  const input = container.querySelector('#chord-grid-input');
  const resultDiv = container.querySelector('#chord-grid-result');
  compareBtn?.addEventListener('click', () => {
    if (!input || !resultDiv || !analysis) return;
    const text = input.value.trim();
    if (!text) {
      resultDiv.innerHTML = '<p class="detail-hint">Entrez une grille pour comparer.</p>';
      return;
    }
    const referenceGrid = parseChordGrid(text);
    if (referenceGrid.length === 0) {
      resultDiv.innerHTML = '<p class="detail-hint">Impossible de parser la grille. Vérifiez le format.</p>';
      return;
    }
    const playedChords = analysis.chords || [];
    const result = compareGridToPlayed(referenceGrid, playedChords);
    const pct = result.total > 0 ? Math.round((result.matches / result.total) * 100) : 0;
    resultDiv.innerHTML = `
      <div class="grid-result-summary">${result.matches}/${result.total} accords corrects (${pct}%)</div>
      <div class="grid-result-detail">
        ${result.feedback.map((f) => `
          <div class="grid-result-item ${f.match ? 'match' : 'mismatch'}">
            <span class="grid-result-index">${f.index + 1}.</span>
            <span class="grid-result-ref">${escapeHtml(f.ref)}</span>
            <span class="grid-result-arrow">→</span>
            <span class="grid-result-played">${escapeHtml(f.played)}</span>
            <span class="grid-result-comment">${escapeHtml(f.comment)}</span>
          </div>
        `).join('')}
      </div>
    `;
  });
}

function renderChordDetail(container, chord, index) {
  if (!container) return;
  const labels = getStyleLabels();
  const originalNotes = normalizeNotes(chord.notes || []);
  const cacheKey = `${chord.rootPc}-${chord.symbol}`;
  const topNoteName = getTopNoteName(chord);

  // Suggestions algorithmiques par style (fallback avant IA).
  const suggestions = Object.entries(labels).map(([style, label]) => {
    let suggestion = null;
    if (suggestionCache.has(cacheKey) && suggestionCache.get(cacheKey).has(style)) {
      suggestion = suggestionCache.get(cacheKey).get(style);
    } else {
      const algo = suggestForChord(chord, style);
      suggestion = {
        accord_original: formatChord(chord).name,
        top_note: topNoteName,
        suggestions: [{
          inspiration: 'Générique',
          voicingNotes: algo.notes,
          voicingNames: algo.notes.map((n) => midiToNoteName(n)),
          technique: algo.substitution || getVoicingLabel(chord.voicing) || `${label} voicing`,
        }],
        style,
      };
    }
    return { style, label, suggestion };
  });

  const originalKeyboard = miniKeyboardForNotes(originalNotes);
  const originalNoteNames = originalKeyboard.noteNames.join(' — ');
  const graceNotes = normalizeNotes(chord.graceNotes || []);
  const graceNoteNames = graceNotes.length
    ? graceNotes.map((n) => formatNoteName(n)).join(' ')
    : null;

  const stylesHtml = suggestions.map(({ style, label, suggestion }) => {
    const cards = (suggestion.suggestions || []).slice(0, 3).map((sug, i) => {
      const keyboard = miniKeyboardForNotes(sug.voicingNotes || []);
      const noteNames = keyboard.noteNames.join(' — ');
      return `
        <div class="suggestion-inspiration-card" data-suggestion-index="${i}" data-style="${style}">
          <div class="suggestion-inspiration-header">
            <span class="suggestion-inspiration-name">${escapeHtml(sug.inspiration || 'Générique')}</span>
            <span class="suggestion-inspiration-badge">${i + 1}</span>
          </div>
          <div class="suggestion-inspiration-technique">${escapeHtml(sug.technique || '')}</div>
          <div class="suggestion-keyboard">${keyboard.svg}</div>
          <div class="suggestion-notes">${noteNames}</div>
        </div>
      `;
    }).join('');

    return `
      <div class="suggestion-card blueprint-suggestion-card" data-style="${style}">
        <div class="suggestion-card-header">
          <span class="suggestion-style">${label}</span>
          <span class="suggestion-name">${escapeHtml(suggestion.accord_original || formatChord(chord).name)}</span>
        </div>
        <div class="suggestion-inspirations">${cards}</div>
        <button class="suggestion-play" type="button" data-style="${style}">▶ Écouter ${label}</button>
      </div>
    `;
  }).join('');

  const originalFormatted = formatChord(chord);
  const originalVoicingHtml = originalFormatted.voicing
    ? `<div class="detail-voicing">${escapeHtml(originalFormatted.voicing)}</div>`
    : '';

  container.innerHTML = `
    <div class="detail-original">
      <div class="detail-title">Accord original : ${escapeHtml(originalFormatted.name)}</div>
      ${originalVoicingHtml}
      ${graceNoteNames ? `<div class="detail-grace-notes">✨ Grace notes : ${escapeHtml(graceNoteNames)}</div>` : ''}
      <div class="detail-keyboard">${originalKeyboard.svg}</div>
      <div class="detail-notes">${originalNoteNames}</div>
      <div class="detail-top-note">Top Note : ${escapeHtml(topNoteName)}</div>
    </div>
    <div class="detail-suggestions">
      <div class="detail-title">Suggestions par influence locale</div>
      <div class="suggestions-grid">${stylesHtml}</div>
    </div>
  `;

  container.querySelectorAll('.suggestion-play').forEach((btn) => {
    btn.addEventListener('click', () => {
      const style = btn.dataset.style;
      const suggestion = suggestions.find((s) => s.style === style)?.suggestion;
      if (suggestion?.suggestions?.[0]?.voicingNotes) {
        playSuggestion({ notes: suggestion.suggestions[0].voicingNotes, name: suggestion.accord_original });
      }
    });
  });

  // Tentative IA en arrière-plan pour chaque style.
  (async () => {
    for (const { style, label } of suggestions) {
      if (suggestionCache.has(cacheKey) && suggestionCache.get(cacheKey).has(style)) continue;
      try {
        const aiResult = await generateReharmonization(chord, style, topNoteName);
        if (!aiResult || !Array.isArray(aiResult.suggestions) || aiResult.suggestions.length === 0) {
          await new Promise((r) => setTimeout(r, 300));
          continue;
        }
        await new Promise((r) => setTimeout(r, 300));
        if (!suggestionCache.has(cacheKey)) suggestionCache.set(cacheKey, new Map());
        suggestionCache.get(cacheKey).set(style, aiResult);
        const entry = suggestions.find((s) => s.style === style);
        if (entry) entry.suggestion = aiResult;
        renderChordDetail(container, chord, index); // Re-render avec les résultats IA
        bindChordDetailAfterRender?.(container, chord, index, suggestions);
      } catch (_) { /* IA non disponible → on garde la suggestion algorithmique */ }
    }
  })();
}

function bindChordDetailAfterRender(container, chord, index, suggestions) {
  container.querySelectorAll('.suggestion-play').forEach((btn) => {
    btn.addEventListener('click', () => {
      const style = btn.dataset.style;
      const suggestion = suggestions.find((s) => s.style === style)?.suggestion;
      if (suggestion?.suggestions?.[0]?.voicingNotes) {
        playSuggestion({ notes: suggestion.suggestions[0].voicingNotes, name: suggestion.accord_original });
      }
    });
  });
}

export function playSuggestion(suggestion) {
  if (!suggestion || !Array.isArray(suggestion.notes) || suggestion.notes.length === 0) return;
  clearSuggestionNotes();
  const notes = suggestion.notes;
  currentSuggestionNotes = [...notes];
  if (onSuggestionPlay) {
    onSuggestionPlay('play', notes, suggestion.name);
  } else if (feedMidiEvent) {
    for (const note of notes) {
      feedMidiEvent('noteOn', note, 0.78);
    }
  }
}

function formatDuration(seconds) {
  if (!seconds || isNaN(seconds)) return '00:00';
  const total = Math.floor(Number(seconds));
  const mins = String(Math.floor(total / 60)).padStart(2, '0');
  const secs = String(total % 60).padStart(2, '0');
  return `${mins}:${secs}`;
}

function splitHands(notes) {
  if (!Array.isArray(notes) || notes.length === 0) return { lh: [], rh: [] };
  const sorted = [...notes].sort((a, b) => a - b);
  // Basse : note la plus basse (typiquement LH). Le reste constitue le voicing RH.
  const bass = sorted[0];
  const lh = [bass];
  const rh = sorted.slice(1);
  return { lh, rh };
}

function detectTechnique(chord) {
  const techniques = chord.techniques || [];
  if (techniques.includes('quartal')) return 'Quartal';
  if (techniques.includes('upper_structure')) return 'Upper Structure';
  if (techniques.includes('rootless')) return 'Rootless';
  if (techniques.includes('cluster')) return 'Cluster';
  if (chord.voicing) return getVoicingLabel(chord.voicing);
  return 'Position close / Drop 2';
}

function detectFunction(chord, index, chords) {
  const root = formatPc(chord.rootPc, notation === 'latin');
  const symbol = chord.symbol || '';
  const prev = chords[index - 1];
  const next = chords[index + 1];
  if (!prev && index === 0) return 'Tonalité / Départ';
  if (!next) return 'Cadence / Fin';
  // Détection simple de II-V-I
  if (prev && next) {
    const prevRoot = prev.rootPc;
    const nextRoot = next.rootPc;
    const curRoot = chord.rootPc;
    const prevIsM7 = /m7|m9|-7/.test(prev.symbol || '');
    const curIsDom = /7|9|13|alt/.test(symbol) && !/maj/.test(symbol);
    const nextIsMaj = /maj|Δ|6/.test(next.symbol || '');
    if (prevIsM7 && curIsDom && nextIsMaj &&
        (curRoot - prevRoot + 12) % 12 === 7 &&
        (nextRoot - curRoot + 12) % 12 === 5) {
      return 'II-V-I';
    }
  }
  if (/m7|m9|-7/.test(symbol)) return 'II / VI / III / VII mineur';
  if (/7|9|13|alt/.test(symbol) && !/maj/.test(symbol)) return 'V Dominante';
  if (/maj|Δ|6/.test(symbol)) return 'I / IV Majeur';
  return 'Couleur / Passage';
}

function buildTutorialHtml() {
  const chords = currentAnalysis?.chords || [];
  const blocks = chords.length > 0
    ? chords.slice(0, 8).map((chord, i) => buildVideoChordBlock(chord, i, chords)).join('')
    : `
        <div class="video-chord-block">
          <div class="vcb-title">Titre Global : II-V-I en C majeur</div>
          <div class="vcb-grid">
            <div class="vcb-cell"><span>LH</span><span>C2 - G2</span></div>
            <div class="vcb-cell"><span>RH</span><span>D3 - F3 - A3 - C4</span></div>
            <div class="vcb-cell"><span>Technique</span><span>Drop 2</span></div>
            <div class="vcb-cell"><span>Fonction</span><span>II-V-I</span></div>
          </div>
        </div>
      `;

  return `
    <div class="analysis-mode-view tutorial-view">
      <div class="analysis-mode-sidebar">
        <div class="panel-title">Résumé Masterclass</div>
        <div class="masterclass-summary">
          <p class="detail-hint">Notions clés du tutoriel :</p>
          <ul class="summary-list">
            <li><strong>Voicing Drop 2 :</strong> Répartition des 4 notes sur 2 octaves.</li>
            <li><strong>II-V-I :</strong> Cadence fondamentale du jazz.</li>
            <li><strong>Guide Tones :</strong> 3e et 7e essentielles.</li>
            <li><strong>Tritone Substitution :</strong> Remplacer V7 par bII7.</li>
          </ul>
        </div>
      </div>
      <div class="analysis-mode-content tutorial-blocks">
        ${blocks}
        <p class="detail-hint">${chords.length > 0 ? 'Blocs extraits de la session MIDI sélectionnée.' : 'Cette vue est une maquette. L\'extraction automatique depuis une vidéo sera intégrée plus tard.'}</p>
      </div>
    </div>
  `;
}

function buildVideoChordBlock(chord, index, chords) {
  const formatted = formatChord(chord);
  const hands = splitHands(normalizeNotes(chord.notes || []));
  const technique = detectTechnique(chord);
  const func = detectFunction(chord, index, chords);
  const topNoteName = getTopNoteName(chord);
  const lhNames = hands.lh.map((n) => formatNoteName(n)).join(' — ') || '—';
  const rhNames = hands.rh.map((n) => formatNoteName(n)).join(' — ') || '—';

  return `
    <div class="video-chord-block" data-chord-index="${index}">
      <div class="vcb-title">${escapeHtml(formatted.name)} — Top Note ${escapeHtml(topNoteName)}</div>
      <div class="vcb-grid">
        <div class="vcb-cell"><span>LH</span><span>${escapeHtml(lhNames)}</span></div>
        <div class="vcb-cell"><span>RH</span><span>${escapeHtml(rhNames)}</span></div>
        <div class="vcb-cell"><span>Technique</span><span>${escapeHtml(technique)}</span></div>
        <div class="vcb-cell"><span>Fonction</span><span>${escapeHtml(func)}</span></div>
      </div>
    </div>
  `;
}

function buildCoverHtml() {
  const chords = currentAnalysis?.chords || [];
  const duration = computeAnalysisDuration(chords);
  const timelineItems = buildCoverTimelineItems(chords, duration);

  return `
    <div class="analysis-mode-view cover-view">
      <div class="cover-timeline">
        <div class="panel-title">Timeline interactive — ${formatDuration(duration)}</div>
        <div class="timeline-track" id="cover-timeline-track">
          <div class="timeline-progress" id="cover-timeline-progress" style="left: 0%;"></div>
          ${timelineItems.markers}
        </div>
        <div class="timeline-chords">
          ${timelineItems.chords || '<span class="detail-hint">Aucun accord détecté</span>'}
        </div>
      </div>
      <p class="detail-hint">Cliquez sur un marqueur ou un accord pour déplacer la tête de lecture. Si un lecteur Studio est actif, le timestamp est synchronisé automatiquement.</p>
    </div>
  `;
}

function computeAnalysisDuration(chords) {
  if (!chords?.length) return 60;
  const last = chords[chords.length - 1];
  return Math.max(1, last.time + (last.duration || 1));
}

function buildCoverTimelineItems(chords, duration) {
  if (!chords?.length) {
    return {
      markers: `
        <div class="timeline-marker" data-time="0" style="left: 0%;">00:00</div>
        <div class="timeline-marker" data-time="15" style="left: 25%;">00:15</div>
        <div class="timeline-marker" data-time="30" style="left: 50%;">00:30</div>
        <div class="timeline-marker" data-time="45" style="left: 75%;">00:45</div>
        <div class="timeline-marker" data-time="60" style="left: 100%;">01:00</div>
      `,
      chords: `
        <button class="timeline-chord" data-time="0">Cmaj7</button>
        <button class="timeline-chord" data-time="15">Dm7</button>
        <button class="timeline-chord" data-time="30">G7</button>
        <button class="timeline-chord" data-time="45">Cmaj7</button>
      `,
    };
  }

  const markers = chords.map((chord, i) => {
    const time = chord.time || 0;
    const pct = duration ? (time / duration) * 100 : 0;
    return `<div class="timeline-marker" data-time="${time.toFixed(2)}" style="left: ${pct}%;" title="${formatDuration(time)}">${formatDuration(time)}</div>`;
  }).join('');

  const chordButtons = chords.map((chord, i) => {
    const time = chord.time || 0;
    const formatted = formatChord(chord);
    const technique = detectTechnique(chord);
    return `<button class="timeline-chord" data-time="${time.toFixed(2)}" title="${escapeHtml(technique)}">${escapeHtml(formatted.name)}<span class="timeline-chord-time">${formatDuration(time)} — ${escapeHtml(technique)}</span></button>`;
  }).join('');

  return { markers, chords: chordButtons };
}

export function bindCoverTimelineSeek(seekCallback, currentTimeCallback) {
  const duration = computeAnalysisDuration(currentAnalysis?.chords || []);
  document.querySelectorAll('#cover-timeline-track .timeline-marker, .timeline-chord').forEach((el) => {
    el.addEventListener('click', () => {
      const time = Number(el.dataset.time) || 0;
      seekCallback?.(time);
      updateCoverTimelineProgress(currentTimeCallback?.() || time, duration);
    });
  });
}

export function updateCoverTimelineProgress(currentTime, duration) {
  const progress = document.getElementById('cover-timeline-progress');
  if (!progress) return;
  const dur = duration || computeAnalysisDuration(currentAnalysis?.chords || []);
  if (!dur) return;
  const pct = Math.max(0, Math.min(100, (currentTime / dur) * 100));
  progress.style.left = `${pct}%`;
}

function buildMasterclassHtml(data, analysis) {
  const chords = analysis.chords || [];
  return `
    <div class="masterclass-feed">
      <div class="masterclass-header">
        <span class="masterclass-title">Analyse du professeur</span>
        <span class="masterclass-chord-count">${data.length} accords analyses</span>
      </div>
      ${data.map((item) => {
        const chord = chords[item.index];
        const formatted = chord ? formatChord(chord) : { name: '—', voicing: '' };
        const isSkip = item.skip;
        return `
          <div class="masterclass-item ${isSkip ? 'masterclass-skip' : ''}">
            <div class="masterclass-item-header">
              <span class="masterclass-chord-name">${isSkip ? '⏭' : ''} ${escapeHtml(formatted.name)}</span>
              ${!isSkip ? `
                <span class="masterclass-topnote">
                  Top Note : ${escapeHtml(getTopNoteName(chord))}
                </span>
              ` : ''}
            </div>
            ${!isSkip ? `
              ${item.worship && item.worship.length > 0 ? `
                <div class="masterclass-voicing">
                  <span class="masterclass-label">Worship/Open :</span>
                  <span class="masterclass-notes">${item.worship.map((n) => formatNoteName(n)).join(' ')}</span>
                </div>
              ` : ''}
              ${item.jazz && item.jazz.length > 0 ? `
                <div class="masterclass-voicing">
                  <span class="masterclass-label">Jazz/Advanced :</span>
                  <span class="masterclass-notes">${item.jazz.map((n) => formatNoteName(n)).join(' ')}</span>
                </div>
              ` : ''}
              ${item.passing ? `
                <div class="masterclass-passing">
                  <span class="masterclass-label">Mouvement :</span>
                  <span>${escapeHtml(item.passing)}</span>
                </div>
              ` : ''}
            ` : '<div class="masterclass-skip-note">Voicing non généré (désactivé)</div>'}
            <div class="masterclass-comment">${escapeHtml(item.commentaire || '')}</div>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
