import { analyzeSession, loadAnalysis } from '../analyzer/analyzer.js';
import { suggestForChord, getStyleLabels, suggestProgression, playProgression } from '../analyzer/reharmonizer.js';
import { formatPc } from '../chord-engine/naming.js';
import { getVoicingLabel } from '../chord-engine/voicing.js';
import { miniKeyboardForNotes } from './mini-keyboard.js';
import { generateReharmonization, generateMasterclass, midiToNoteName, classifyAndLabel } from '../ai/ai-client.js';
import { getAIConfig } from '../ai/openai-config.js';
import { parseChordGrid, compareGridToPlayed } from '../analyzer/chord-comparator.js';
import { generateAlternatives } from '../analyzer/alternatives.js';
import { findSubstitutions } from '../analyzer/substitutions.js';
import { buildVoiceLeading } from '../analyzer/voice-leading.js';

// [OpenCode] — 2026-07-06 — Interface d'analyse unifiée.
// Le type de vue est déterminé par session.sourceType : 'midi' | 'tutorial' | 'cover'.
// Affichage progressif : liste d'abord, détail d'accord au clic, suggestions au clic.

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
let currentAnalysisContainer = null;
let currentAnalysisSessionId = null;
let currentAnalysisEvents = null;
let currentAnalysisSession = null;
let selectedChordId = null;
let arrangementExpanded = false;

const VIEW_RENDERERS = {
  midi: buildMidiViewHtml,
  tutorial: buildTutorialHtml,
  cover: buildCoverHtml,
};

export function initAnalyzerTab({ containerId, onPlay, onSuggestionPlay: sugPlay } = {}) {
  if (onPlay) feedMidiEvent = onPlay;
  if (sugPlay) onSuggestionPlay = sugPlay;
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
  selectedChordId = null;
  arrangementExpanded = false;

  const sourceType = session?.sourceType || 'midi';
  const renderer = VIEW_RENDERERS[sourceType] || VIEW_RENDERERS.midi;

  // Met à jour le titre du panneau selon le type de source.
  const panelTitle = document.getElementById('analysis-panel-title');
  if (panelTitle) {
    const labels = { midi: 'Jeu enregistré', tutorial: 'Tutoriel', cover: 'Cover / Performance' };
    panelTitle.textContent = labels[sourceType] || 'Analyse';
  }

  container.innerHTML = '<p class="detail-hint">Analyse en cours...</p>';

  try {
    const analysis = await analyzeSession(sessionId, events, session);
    currentAnalysis = analysis;
    suggestionCache.clear();
    container.innerHTML = renderer(analysis);
    bindAnalysisActions(container, analysis, sourceType);
  } catch (err) {
    console.error('Analysis failed:', err);
    container.innerHTML = `<p class="detail-hint">Erreur d'analyse : ${escapeHtml(err.message)}</p>`;
  }
}

function buildKeyInfo(analysis) {
  if (analysis.isMelodic) {
    return analysis.key
      ? `<span class="analysis-key">Tonalité : ${escapeHtml(analysis.key.name)} <span class="analysis-key-source">(${analysis.key.source})</span></span>`
      : '<span class="analysis-key analysis-key-missing">Tonalité non définie</span>';
  }
  return analysis.key
    ? `<span class="analysis-key">Tonalité : ${escapeHtml(analysis.key.name)} <span class="analysis-key-source">(${analysis.key.source}, confiance ${Math.round(analysis.key.confidence * 100)}%)</span></span>`
    : '<span class="analysis-key analysis-key-missing">Tonalité non définie</span>';
}

function buildAnalysisShell(analysis, contentHtml, sourceType) {
  const keyInfo = buildKeyInfo(analysis);
  const title = analysis.isMelodic
    ? 'Ligne mélodique'
    : sourceType === 'midi'
      ? 'Accords détectés'
      : sourceType === 'cover'
        ? 'Timeline interactive'
        : 'Accords du tutoriel';

  return `
    <div class="analysis-layout analysis-layout-${sourceType}">
      <div class="analysis-timeline">
        <div class="panel-title">
          ${title}
          ${keyInfo}
        </div>
        ${contentHtml}
      </div>
      <div class="analysis-detail" id="analysis-detail">
        <p class="detail-hint">Cliquez sur un accord pour explorer les suggestions.</p>
      </div>
    </div>
  `;
}

function buildCollapsiblePanel(id, title, contentHtml, expanded = false) {
  return `
    <div class="panel collapsible-panel" data-collapsible-id="${escapeHtml(id)}">
      <div class="panel-title collapsible-toggle" style="cursor:pointer;">
        ${escapeHtml(title)} <span class="collapsible-icon">${expanded ? '−' : '+'}</span>
      </div>
      <div class="collapsible-content" style="display:${expanded ? '' : 'none'};">${contentHtml}</div>
    </div>
  `;
}

function buildMidiViewHtml(analysis) {
  // Affichage progressif : scores, patterns et réharmonisation repliés par défaut.
  const scoresPanel = analysis.scores
    ? buildCollapsiblePanel('analysis-scores', 'Scores de session', buildScoresHtml(analysis.scores), false)
    : '';
  const patternsPanel = analysis.patterns
    ? buildCollapsiblePanel('analysis-patterns', 'Patterns harmoniques', buildPatternsHtml(analysis.patterns), false)
    : '';
  const reharmPanel = !analysis.isMelodic && analysis.chords?.length > 0
    ? buildCollapsiblePanel('session-reharm', 'Réharmonisation de session', buildSessionReharmPanel(analysis), false)
    : '';
  const header = scoresPanel + patternsPanel + reharmPanel;

  if (analysis.isMelodic) {
    return buildAnalysisShell(analysis, header + buildMelodyHtml(analysis.melodyLine), 'midi');
  }
  return buildAnalysisShell(analysis, header + buildSectionsHtml(analysis.sections, analysis.chords), 'midi');
}

function buildSessionReharmPanel(analysis) {
  if (analysis.isMelodic || !analysis.chords || analysis.chords.length === 0) return '';

  const labels = getStyleLabels();
  const buttons = Object.entries(labels).map(([style, label]) => `
    <button class="session-reharm-btn" data-style="${escapeHtml(style)}" type="button">
      ${escapeHtml(label)}
    </button>
  `).join('');

  return `
    <div class="analysis-reharm-panel">
      <div class="panel-title">Réharmonisation de session</div>
      <div class="detail-hint">Générer une version stylisée de toute la progression et l'écouter.</div>
      <div class="session-reharm-styles">${buttons}</div>
      <div class="session-reharm-result" id="session-reharm-result"></div>
    </div>
  `;
}

function buildScoresHtml(scores) {
  if (!scores) return '';
  const entries = Object.entries(scores).filter(([_, s]) => s && typeof s.value === 'number');
  if (entries.length === 0) return '';

  const cards = entries.map(([key, score]) => {
    const label = SCORE_LABELS[key] || key;
    const value = Math.round(score.value);
    const colorClass = value >= 8 ? 'score-good' : value >= 5 ? 'score-medium' : 'score-low';
    return `
      <div class="score-card ${colorClass}" data-score-key="${escapeHtml(key)}" title="${escapeHtml(score.comment || '')}">
        <div class="score-value" style="--score:${value}">${value}/10</div>
        <div class="score-label">${escapeHtml(label)}</div>
        <div class="score-comment">${escapeHtml(score.comment || '')}</div>
      </div>
    `;
  }).join('');

  return `
    <div class="analysis-scores">
      <div class="panel-title">Scores de session</div>
      <div class="score-grid">${cards}</div>
    </div>
  `;
}

const SCORE_LABELS = {
  voiceLeading: 'Voice Leading',
  transitions: 'Transitions',
  tensions: 'Tensions',
  innerVoices: 'Inner Voices',
};

function buildPatternsHtml(patterns) {
  if (!patterns) return '';
  const badges = [];
  if (patterns.iiVIs?.length) badges.push(`${patterns.iiVIs.length} II-V-I`);
  if (patterns.cadences?.length) badges.push(`${patterns.cadences.length} cadence${patterns.cadences.length > 1 ? 's' : ''}`);
  if (patterns.turnarounds?.length) badges.push(`${patterns.turnarounds.length} turnaround${patterns.turnarounds.length > 1 ? 's' : ''}`);
  if (patterns.substitutions?.length) badges.push(`${patterns.substitutions.length} substitution${patterns.substitutions.length > 1 ? 's' : ''}`);

  if (badges.length === 0) {
    return `
      <div class="analysis-patterns">
        <div class="panel-title">Patterns harmoniques</div>
        <p class="detail-hint">Aucun pattern caractéristique détecté dans cette session.</p>
      </div>
    `;
  }

  const cadencesHtml = (patterns.cadences || []).map((c) => `
    <div class="pattern-item">
      <span class="pattern-badge ${c.type}">${escapeHtml(c.label)}</span>
      <span class="pattern-desc">${escapeHtml(c.description)}</span>
    </div>
  `).join('');

  const iiViHtml = (patterns.iiVIs || []).map((p, i) => `
    <div class="pattern-item">
      <span class="pattern-badge ii-v-i">II-V-I #${i + 1}</span>
      <span class="pattern-desc">${escapeHtml(p.description)}</span>
    </div>
  `).join('');

  return `
    <div class="analysis-patterns">
      <div class="panel-title">Patterns harmoniques — ${escapeHtml(badges.join(' · '))}</div>
      ${iiViHtml}
      ${cadencesHtml}
    </div>
  `;
}

function buildMelodyHtml(melodyLine) {
  if (!melodyLine || melodyLine.length === 0) {
    return '<p class="detail-hint">Aucune note détectée.</p>';
  }
  const rows = melodyLine.map((note) => `
    <div class="melody-row" data-note="${note.note}" data-time="${note.time.toFixed(2)}">
      <span class="melody-time">${formatDuration(note.time)}</span>
      <span class="melody-note">${escapeHtml(formatNoteName(note.note))}</span>
    </div>
  `).join('');
  return `<div class="melody-list">${rows}</div>
    <p class="detail-hint" style="margin-top:8px;">Session principalement mélodique — aucun accord détecté.</p>`;
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
      const degreeHtml = chord.degree
        ? `<span class="chord-tile-degree" title="Degré dans la tonalité">${escapeHtml(chord.degree)}</span>`
        : '';
      return `
        <button class="chord-tile" data-chord-index="${globalIndex}" title="${escapeHtml(formatted.name)} ${chord.degree ? `(${chord.degree})` : ''}">
          ${degreeHtml}
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

function bindAnalysisActions(container, analysis, sourceType) {
  const detail = container.querySelector('#analysis-detail');

  // Accordéons d'affichage progressif (scores / patterns / réharmonisation)
  container.querySelectorAll('.collapsible-panel').forEach((panel) => {
    const toggle = panel.querySelector('.collapsible-toggle');
    const content = panel.querySelector('.collapsible-content');
    const icon = panel.querySelector('.collapsible-icon');
    toggle?.addEventListener('click', () => {
      const isHidden = content.style.display === 'none';
      content.style.display = isHidden ? '' : 'none';
      icon.textContent = isHidden ? '−' : '+';
    });
  });

  // Clic sur un accord (MIDI / Tutoriel / Cover)
  container.querySelectorAll('.chord-tile, .timeline-chord, .video-chord-block').forEach((el) => {
    el.addEventListener('click', () => {
      clearSuggestionNotes();
      const index = Number(el.dataset.chordIndex);
      const chord = analysis.chords[index];
      if (!chord) return;
      selectedChordId = index;
      renderChordDetail(detail, chord, index, sourceType);
      container.querySelectorAll('.chord-tile, .timeline-chord, .video-chord-block').forEach((b) => b.classList.remove('active'));
      el.classList.add('active');
    });
  });

  // Réharmonisation de session
  container.querySelectorAll('.session-reharm-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const style = btn.dataset.style;
      const resultDiv = container.querySelector('#session-reharm-result');
      if (!resultDiv) return;

      resultDiv.innerHTML = '<p class="detail-hint">Génération en cours...</p>';
      const progression = suggestProgression(analysis.chords, style);
      if (!progression || progression.length === 0) {
        resultDiv.innerHTML = '<p class="detail-hint">Impossible de générer une réharmonisation pour cette session.</p>';
        return;
      }

      const labels = getStyleLabels();
      const summary = progression.map((p) => formatChord(p.replacement)).join(' → ');
      resultDiv.innerHTML = `
        <div class="reharm-summary">
          <strong>${escapeHtml(labels[style] || style)} :</strong> ${escapeHtml(summary)}
        </div>
        <button class="panel-action" id="session-reharm-play" type="button">▶ Écouter la réharmonisation</button>
      `;

      resultDiv.querySelector('#session-reharm-play')?.addEventListener('click', () => {
        const bpm = currentAnalysisSession?.tempo || 90;
        playProgression(progression, onSuggestionPlay ? (type, notes, velocity) => {
          if (type === 'noteOn') {
            onSuggestionPlay('clear');
            onSuggestionPlay('play', notes);
          }
        } : feedMidiEvent, bpm);
      });
    });
  });

  // Arrangement harmonique (replié par défaut) — uniquement pour sourceType 'midi'
  if (sourceType === 'midi' && !analysis.isMelodic) {
    const arrangementHtml = buildArrangementPanel(analysis);
    const arrangementSection = document.createElement('div');
    arrangementSection.className = 'panel arrangement-section';
    arrangementSection.innerHTML = `
      <div class="panel-title" style="cursor:pointer;" id="arrangement-toggle">
        Arrangement harmonique <span id="arrangement-toggle-icon">+</span>
      </div>
      <div id="arrangement-content" style="display:none;">${arrangementHtml}</div>
    `;
    detail.parentNode.insertBefore(arrangementSection, detail);

    const arrToggle = arrangementSection.querySelector('#arrangement-toggle');
    const arrContent = arrangementSection.querySelector('#arrangement-content');
    const arrIcon = arrangementSection.querySelector('#arrangement-toggle-icon');
    arrToggle?.addEventListener('click', () => {
      const isHidden = arrContent.style.display === 'none';
      arrContent.style.display = isHidden ? '' : 'none';
      arrIcon.textContent = isHidden ? '−' : '+';
      arrangementExpanded = !isHidden;
    });

    arrangementSection.querySelectorAll('.arrangement-toggle input').forEach((cb) => {
      cb.addEventListener('change', () => {
        const idx = Number(cb.dataset.chordIndex);
        const chord = analysis.chords[idx];
        if (chord) chord._arrangementActive = cb.checked;
      });
    });

    arrangementSection.querySelectorAll('.arrangement-bass').forEach((select) => {
      select.addEventListener('change', () => {
        const idx = Number(select.dataset.chordIndex);
        const chord = analysis.chords[idx];
        if (chord) chord._arrangementBass = select.value || null;
      });
    });
  }

  // Grille de référence : toggle + comparaison (uniquement MIDI non mélodique)
  if (sourceType === 'midi' && !analysis.isMelodic) {
    const gridSection = document.createElement('div');
    gridSection.className = 'panel chord-grid-panel';
    gridSection.style.marginTop = '1rem';
    gridSection.innerHTML = `
      <div class="panel-title" style="cursor:pointer;" id="chord-grid-toggle">Grille de référence <span id="chord-grid-toggle-icon">+</span></div>
      <div id="chord-grid-content" style="display:none;">
        <p class="detail-hint">Entrez la grille attendue (un accord par ligne ou séparé par des espaces) :</p>
        <textarea id="chord-grid-input" class="chord-grid-input" rows="4" placeholder="C  Am7  Dm7  G7&#10;C  Am7  Dm7  G7"></textarea>
        <button id="chord-grid-compare-btn" class="panel-action" type="button">Comparer</button>
        <div id="chord-grid-result"></div>
      </div>
    `;
    const timeline = container.querySelector('.analysis-timeline');
    if (timeline) timeline.appendChild(gridSection);

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

  // Cover : timeline cliquable
  if (sourceType === 'cover') {
    bindCoverTimelineControls();
  }
}

function buildDegreeHtml(chord) {
  if (!chord.degree) return '';
  return `<span class="detail-degree" title="Degré dans la tonalité détectée">(${escapeHtml(chord.degree)})</span>`;
}

function buildVoiceLeadingHtml(chord, index) {
  if (!currentAnalysis || !currentAnalysis.chords) return '';
  const chords = currentAnalysis.chords;
  const prev = index > 0 ? chords[index - 1] : null;
  const next = index < chords.length - 1 ? chords[index + 1] : null;

  const parts = [];
  if (prev) {
    const vl = buildVoiceLeading(prev.notes || [], chord.notes || []);
    if (vl) {
      const common = vl.movements.filter((m) => m.semitones === 0).length;
      const moveText = vl.movements.map((m) => {
        if (m.semitones === 0) return `<span class="vl-common">${formatNoteName(m.from)}</span>`;
        const arrow = m.semitones > 0 ? '↑' : '↓';
        return `<span class="vl-move" title="${Math.abs(m.semitones)} demi-tons">${formatNoteName(m.from)} ${arrow}${Math.abs(m.semitones)}</span>`;
      }).join(' ');
      parts.push(`<div class="vl-block"><strong>Depuis ${formatChord(prev).name} :</strong> ${moveText} · ${common} note${common > 1 ? 's' : ''} commune${common > 1 ? 's' : ''}</div>`);
    }
  }
  if (next) {
    const vl = buildVoiceLeading(chord.notes || [], next.notes || []);
    if (vl) {
      const common = vl.movements.filter((m) => m.semitones === 0).length;
      parts.push(`<div class="vl-block"><strong>Vers ${formatChord(next).name} :</strong> ${vl.totalMovement} demi-tons totaux · ${common} note${common > 1 ? 's' : ''} commune${common > 1 ? 's' : ''}</div>`);
    }
  }

  if (parts.length === 0) return '';
  return `
    <div class="detail-voice-leading">
      <div class="detail-title">Voice leading</div>
      ${parts.join('')}
    </div>
  `;
}

function buildAlternativesHtml(chord) {
  const alternatives = generateAlternatives({
    rootPc: chord.rootPc,
    symbol: chord.symbol,
    intervals: chord.notes?.map((n) => (n - chord.rootPc + 12) % 12).filter((v, i, a) => a.indexOf(v) === i).sort((a, b) => a - b),
    bassPc: chord.bassPc,
  }, notation === 'latin');

  if (!alternatives || alternatives.length === 0) return '';

  const cards = alternatives.map((alt) => {
    const kb = miniKeyboardForNotes(alt.midiNotes || []);
    return `
      <div class="alternative-card" data-notes="${escapeHtml(JSON.stringify(alt.midiNotes || []))}">
        <div class="alternative-name">${escapeHtml(alt.name)}</div>
        <div class="alternative-keyboard">${kb.svg}</div>
        <div class="alternative-notes">${escapeHtml(alt.notes?.join(' — ') || '')}</div>
      </div>
    `;
  }).join('');

  return `
    <div class="detail-alternatives">
      <div class="detail-title">Voicings alternatifs</div>
      <div class="alternatives-grid">${cards}</div>
    </div>
  `;
}

function buildSubstitutionsHtml(chord, index) {
  if (!currentAnalysis || !currentAnalysis.chords) return '';
  const chords = currentAnalysis.chords;
  const prev = index > 0 ? chords[index - 1] : null;
  const subs = findSubstitutions(prev, chord);
  if (!subs || subs.length === 0) return '';

  const items = subs.map((s) => `
    <div class="substitution-item">
      <span class="substitution-type">${escapeHtml(s.label)}</span>
      <span class="substitution-desc">${escapeHtml(s.description)}</span>
    </div>
  `).join('');

  return `
    <div class="detail-substitutions">
      <div class="detail-title">Substitutions & fonction</div>
      ${items}
    </div>
  `;
}

function renderChordDetail(container, chord, index, sourceType = 'midi') {
  if (!container) return;
  const labels = getStyleLabels();
  const originalNotes = normalizeNotes(chord.notes || []);
  const cacheKey = `${chord.rootPc}-${chord.symbol}`;
  const topNoteName = getTopNoteName(chord);
  const originalTopNoteMidi = getTopNote(chord);

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
      // Filet de sécurité : recalcule au rendu si l'appelant a oublié de normaliser.
      const normalized = sug.voicingType ? sug : classifyAndLabel(sug.voicingNotes, sug.technique);
      if (!normalized) return '';
      const keyboard = miniKeyboardForNotes(normalized.voicingNotes || []);
      const noteNames = keyboard.noteNames.join(' — ');
      const topNoteName = normalized.topNoteName || '—';
      return `
        <div class="suggestion-inspiration-card" data-suggestion-index="${i}" data-style="${style}">
          <div class="suggestion-inspiration-header">
            <span class="suggestion-inspiration-name">${escapeHtml(normalized.inspiration || 'Générique')}</span>
            <span class="suggestion-inspiration-badge">${i + 1}</span>
          </div>
          <div class="suggestion-inspiration-meta">
            <span class="suggestion-inspiration-voicing">${escapeHtml(normalized.voicingType)}</span>
            ${normalized.styleLabel ? `<span class="suggestion-inspiration-style" title="Intention stylistique">${escapeHtml(normalized.styleLabel)}</span>` : ''}
          </div>
          <div class="suggestion-keyboard">${keyboard.svg}</div>
          <div class="suggestion-notes">${noteNames}</div>
          <div class="suggestion-topnote">Top Note : ${escapeHtml(topNoteName)}</div>
        </div>
      `;
    }).filter(Boolean).join('');

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

  const masterclassBtn = sourceType === 'midi'
    ? `<button class="panel-action masterclass-btn" id="masterclass-btn" type="button" style="margin-top: 8px; width: 100%;">🎓 Analyse IA de cet accord</button>`
    : '';

  const degreeHtml = buildDegreeHtml(chord);
  const voiceLeadingHtml = buildVoiceLeadingHtml(chord, index);
  const alternativesHtml = buildAlternativesHtml(chord);
  const substitutionsHtml = buildSubstitutionsHtml(chord, index);

  container.innerHTML = `
    <div class="detail-original">
      <div class="detail-title">Accord original : ${escapeHtml(originalFormatted.name)} ${degreeHtml}</div>
      ${originalVoicingHtml}
      ${graceNoteNames ? `<div class="detail-grace-notes">✨ Grace notes : ${escapeHtml(graceNoteNames)}</div>` : ''}
      <div class="detail-keyboard">${originalKeyboard.svg}</div>
      <div class="detail-notes">${originalNoteNames}</div>
      <div class="detail-top-note">Top Note : ${escapeHtml(topNoteName)} <span class="detail-top-midi">(MIDI ${originalTopNoteMidi})</span></div>
    </div>
    ${voiceLeadingHtml}
    ${alternativesHtml}
    ${substitutionsHtml}
    <div class="detail-suggestions">
      <div class="detail-title">Suggestions par influence locale</div>
      <div class="suggestions-grid">${stylesHtml}</div>
    </div>
    ${masterclassBtn}
    <div class="masterclass-result" id="masterclass-result-${index}" style="display:none;"></div>
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

  const masterclassResult = container.querySelector(`#masterclass-result-${index}`);
  container.querySelector('#masterclass-btn')?.addEventListener('click', async () => {
    if (!masterclassResult) return;
    const btn = container.querySelector('#masterclass-btn');
    btn.disabled = true;
    btn.textContent = 'Analyse en cours...';
    masterclassResult.style.display = 'block';
    masterclassResult.innerHTML = '<p class="detail-hint">Consultation du professeur...</p>';
    const data = await generateMasterclassForChord(chord, index);
    btn.disabled = false;
    btn.textContent = '🎓 Analyse IA de cet accord';
    if (!data) {
      const hasKey = getAIConfig()?.apiKey;
      masterclassResult.innerHTML = hasKey
        ? '<p class="detail-hint">Masterclass temporairement indisponible (limite de requêtes ou erreur réseau). Réessayez plus tard.</p>'
        : '<p class="detail-hint">Configurez une clé API dans ⚙️ Paramètres IA pour utiliser la Masterclass.</p>';
      return;
    }
    masterclassResult.innerHTML = buildSingleMasterclassHtml(data);
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
        renderChordDetail(container, chord, index, sourceType); // Re-render avec les résultats IA
      } catch (_) { /* IA non disponible → on garde la suggestion algorithmique */ }
    }
  })();
}

async function generateMasterclassForChord(chord, index) {
  const config = getAIConfig();
  if (!config) return null;
  // On crée une pseudo-analyse contenant un seul accord pour éviter l'analyse globale lourde.
  const pseudoAnalysis = {
    chords: [chord],
    sections: [],
  };
  return generateMasterclass(pseudoAnalysis);
}

function buildSingleMasterclassHtml(data) {
  if (!Array.isArray(data) || data.length === 0) return '';
  const item = data[0];
  return `
    <div class="masterclass-item">
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
      <div class="masterclass-comment">${escapeHtml(item.commentaire || '')}</div>
    </div>
  `;
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

function buildTutorialHtml(analysis) {
  const chords = analysis?.chords || [];
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

  const sidebar = `
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
  `;

  const content = `
    <div class="analysis-mode-view tutorial-view">
      ${sidebar}
      <div class="analysis-mode-content tutorial-blocks">
        ${blocks}
        <p class="detail-hint">${chords.length > 0 ? 'Blocs extraits de la session importée.' : 'Cette vue est une maquette. L\'extraction automatique depuis une vidéo sera intégrée plus tard.'}</p>
      </div>
    </div>
  `;

  return buildAnalysisShell(analysis, content, 'tutorial');
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

function buildCoverHtml(analysis) {
  const chords = analysis?.chords || [];
  const duration = computeAnalysisDuration(chords);
  const timelineItems = buildCoverTimelineItems(chords, duration);

  const content = `
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

  return buildAnalysisShell(analysis, content, 'cover');
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

  const maxMarkers = 8;
  const markerTimes = sampleTimelineTimes(chords.map((c) => c.time || 0), duration, maxMarkers);
  const markers = markerTimes.map((time) => {
    const pct = duration ? (time / duration) * 100 : 0;
    return `<div class="timeline-marker" data-time="${time.toFixed(2)}" style="left: ${pct}%;" title="${formatDuration(time)}">${formatDuration(time)}</div>`;
  }).join('');

  // Limite le nombre d'accords affichés pour éviter la saturation.
  const maxChords = 24;
  const step = Math.max(1, Math.ceil(chords.length / maxChords));
  const visibleChords = chords.filter((_, i) => i % step === 0);
  const chordButtons = visibleChords.map((chord) => {
    const time = chord.time || 0;
    const formatted = formatChord(chord);
    const technique = detectTechnique(chord);
    return `<button class="timeline-chord" data-time="${time.toFixed(2)}" title="${escapeHtml(technique)}">${escapeHtml(formatted.name)}<span class="timeline-chord-time">${formatDuration(time)} — ${escapeHtml(technique)}</span></button>`;
  }).join('');

  return { markers, chords: chordButtons };
}

function sampleTimelineTimes(times, duration, maxCount) {
  const unique = Array.from(new Set(times.filter((t) => t >= 0).sort((a, b) => a - b)));
  if (unique.length <= maxCount) return unique;
  const result = [0];
  for (let i = 1; i < maxCount - 1; i++) {
    const target = (duration * i) / (maxCount - 1);
    const closest = unique.reduce((best, t) => (Math.abs(t - target) < Math.abs(best - target) ? t : best), unique[0]);
    if (!result.includes(closest)) result.push(closest);
  }
  const last = unique[unique.length - 1];
  if (!result.includes(last)) result.push(last);
  if (result.length > maxCount) {
    return result.filter((_, i) => i === 0 || i === result.length - 1 || i % 2 === 0).slice(0, maxCount);
  }
  return result.sort((a, b) => a - b);
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
