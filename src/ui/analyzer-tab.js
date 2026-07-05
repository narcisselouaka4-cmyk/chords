import { analyzeSession, loadAnalysis } from '../analyzer/analyzer.js';
import { suggestForChord, getStyleLabels } from '../analyzer/reharmonizer.js';
import { formatPc } from '../chord-engine/naming.js';
import { getVoicingLabel } from '../chord-engine/voicing.js';
import { miniKeyboardForNotes } from './mini-keyboard.js';
import { generateReharmonization, generateMasterclass } from '../ai/ai-client.js';
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
  }
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

function buildArrangementPanel(analysis) {
  const chords = analysis.chords || [];
  if (chords.length === 0) return '<p class="detail-hint">Aucun accord à arranger.</p>';

  const rows = chords.map((chord, i) => {
    const formatted = formatChord(chord);
    const topNoteName = getTopNoteName(chord);
    return `
      <div class="arrangement-row" data-chord-index="${i}">
        <span class="arrangement-name">${escapeHtml(formatted.name)}</span>
        <span class="arrangement-topnote">${escapeHtml(topNoteName)}</span>
        <label class="arrangement-toggle">
          <input type="checkbox" checked data-chord-index="${i}" />
        </label>
        <input type="text" class="arrangement-bass" placeholder="auto" data-chord-index="${i}" />
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
        <span class="detail-hint">Basse : laissez vide pour auto, ou entrez une note (C3, Eb2...) ou un pattern (7-3-6-2-5)</span>
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

  // Arrangement bass input handler
  arrangementSection.querySelectorAll('.arrangement-bass').forEach((input) => {
    input.addEventListener('change', () => {
      const idx = Number(input.dataset.chordIndex);
      const chord = analysis.chords[idx];
      if (chord) chord._arrangementBass = input.value.trim() || null;
    });
  });

  // Bouton Masterclass IA
  const masterclassBtn = document.createElement('button');
  masterclassBtn.className = 'panel-action masterclass-btn';
  masterclassBtn.textContent = '🎓 Masterclass IA';
  masterclassBtn.type = 'button';
  masterclassBtn.style.marginTop = '8px';
  masterclassBtn.style.width = '100%';
  const detailParent = detail.parentNode;
  detailParent.insertBefore(masterclassBtn, detail);

  const masterclassResult = document.createElement('div');
  masterclassResult.className = 'masterclass-result';
  masterclassResult.style.display = 'none';
  detailParent.insertBefore(masterclassResult, detail);

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

  const suggestions = Object.entries(labels).map(([style, label]) => {
    let suggestion = null;
    if (suggestionCache.has(cacheKey) && suggestionCache.get(cacheKey).has(style)) {
      suggestion = suggestionCache.get(cacheKey).get(style);
    } else {
      suggestion = suggestForChord(chord, style);
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
    const keyboard = miniKeyboardForNotes(suggestion.notes);
    const noteNames = keyboard.noteNames.join(' — ');
    const sub = suggestion.substitution
      ? `<span class="suggestion-sub">${escapeHtml(suggestion.substitution)}</span>`
      : '';
    return `
      <div class="suggestion-card" data-style="${style}">
        <div class="suggestion-card-header">
          <span class="suggestion-style">${label}</span>
          <span class="suggestion-name">${escapeHtml(suggestion.name)}</span>
        </div>
        ${sub}
        <div class="suggestion-keyboard">${keyboard.svg}</div>
        <div class="suggestion-notes">${noteNames}</div>
        <button class="suggestion-play" type="button" data-style="${style}">▶ Écouter</button>
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
    </div>
    <div class="detail-suggestions">
      <div class="detail-title">Suggestions</div>
      <div class="suggestions-grid">${stylesHtml}</div>
    </div>
  `;

  container.querySelectorAll('.suggestion-play').forEach((btn) => {
    btn.addEventListener('click', () => {
      const style = btn.dataset.style;
      const suggestion = suggestions.find((s) => s.style === style)?.suggestion;
      playSuggestion(suggestion);
    });
  });

  // Tentative IA en arrière-plan avec un délai entre chaque style pour éviter le rate limiting.
  (async () => {
    for (const { style, label } of suggestions) {
      if (suggestionCache.has(cacheKey) && suggestionCache.get(cacheKey).has(style)) continue;
      try {
        const aiResult = await generateReharmonization(chord, style);
        if (!aiResult || !aiResult.notes || aiResult.notes.length === 0) {
          await new Promise((r) => setTimeout(r, 300));
          continue;
        }
        await new Promise((r) => setTimeout(r, 300));
        if (!suggestionCache.has(cacheKey)) suggestionCache.set(cacheKey, new Map());
        suggestionCache.get(cacheKey).set(style, aiResult);
        const card = container.querySelector(`.suggestion-card[data-style="${style}"]`);
        if (!card) continue;
        const keyboard = miniKeyboardForNotes(aiResult.notes);
        const noteNames = keyboard.noteNames.join(' — ');
        card.querySelector('.suggestion-name').textContent = aiResult.name || '';
        card.querySelector('.suggestion-keyboard').innerHTML = keyboard.svg;
        card.querySelector('.suggestion-notes').textContent = noteNames;
        if (aiResult.substitution) {
          let subEl = card.querySelector('.suggestion-sub');
          if (!subEl) {
            subEl = document.createElement('span');
            subEl.className = 'suggestion-sub';
            card.querySelector('.suggestion-card-header')?.after(subEl);
          }
          subEl.textContent = aiResult.substitution;
        }
        const entry = suggestions.find((s) => s.style === style);
        if (entry) entry.suggestion = aiResult;
      } catch (_) { /* IA non disponible → on garde la suggestion algorithmique */ }
    }
  })();
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

function buildTutorialHtml() {
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
      <div class="analysis-mode-content">
        <div class="video-chord-block">
          <div class="vcb-title">Titre Global : II-V-I en C majeur</div>
          <div class="vcb-grid">
            <div class="vcb-cell"><span>LH</span><span>C2 - G2</span></div>
            <div class="vcb-cell"><span>RH</span><span>D3 - F3 - A3 - C4</span></div>
            <div class="vcb-cell"><span>Technique</span><span>Drop 2</span></div>
            <div class="vcb-cell"><span>Fonction</span><span>Dm7 / G7 / Cmaj7</span></div>
          </div>
        </div>
        <p class="detail-hint">Cette vue est une maquette. L'extraction automatique des accords depuis une vidéo sera intégrée plus tard.</p>
      </div>
    </div>
  `;
}

function buildCoverHtml() {
  return `
    <div class="analysis-mode-view cover-view">
      <div class="cover-timeline">
        <div class="panel-title">Timeline interactive</div>
        <div class="timeline-track">
          <div class="timeline-marker" data-time="0" style="left: 0%;">00:00</div>
          <div class="timeline-marker" data-time="15" style="left: 25%;">00:15</div>
          <div class="timeline-marker" data-time="30" style="left: 50%;">00:30</div>
          <div class="timeline-marker" data-time="45" style="left: 75%;">00:45</div>
          <div class="timeline-marker" data-time="60" style="left: 100%;">01:00</div>
        </div>
        <div class="timeline-chords">
          <button class="timeline-chord" data-time="0">Cmaj7</button>
          <button class="timeline-chord" data-time="15">Dm7</button>
          <button class="timeline-chord" data-time="30">G7</button>
          <button class="timeline-chord" data-time="45">Cmaj7</button>
        </div>
      </div>
      <p class="detail-hint">Cliquez sur un marqueur ou un accord pour déplacer la tête de lecture. (Maquette — moteur d'extraction audio non intégré cette nuit.)</p>
    </div>
  `;
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
