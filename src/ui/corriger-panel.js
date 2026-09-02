// [Refonte visuelle 2026-09-02] — Panneau Corriger de l'onglet Analyse.
//
// Ce module est autonome : il lit les segments fournis par analyzer-tab.js,
// génère une liste de segments à vérifier, propose des candidats alternatifs
// à partir des notes de l'accord effectif, et permet d'appliquer ou de révoquer
// une correction manuelle. Toute mutation passe par chord-edit-session
// (identité stable segmentId) et reste la responsabilité de l'appelant pour
// la persistance (markDirty / rerenderTimeline).

import {
  getEffectiveChord,
  parseChordSymbol,
  deriveChordDisplay,
  formatEffectiveChord,
} from '../chord-engine/chord-display.js';
import { applyChordTargetMutation } from './chord-edit-session.js';
import { CHORD_DEFINITIONS } from '../chord-engine/chord-defs.js';
import { NOTE_NAMES } from '../chord-engine/intervals.js';
import { miniKeyboardForNotes } from './mini-keyboard.js';

const VALID_CHORD_RE = /^([A-G][#b]?)(.*)$/;

let panelEls = null;
let callbacks = {};
let selectedSegmentId = null;
let loopTimer = null;
let currentFilter = 'flagged'; // 'flagged' | 'all'

/**
 * Initialise le panneau Corriger.
 *
 * @param {object} els Éléments DOM du panneau (ids corriger-*).
 * @param {object} cb  Callbacks fournis par analyzer-tab.js :
 *   - getSegments(): tableau de segments affichés
 *   - getAnalysis(): analyse courante
 *   - onSelect(segmentId): sélectionne un segment dans la timeline
 *   - onCorrected(segmentId): notifier une correction appliquée/retirée
 *   - getPlayer(): retourne le lecteur audio actuel (ou null)
 *   - requestPause(): met la lecture en pause
 */
export function initCorrigerPanel(els, cb) {
  panelEls = els;
  callbacks = cb || {};
  bindCorrigerUI();
}

export function renderCorriger(els, segment, analysis) {
  panelEls = els;
  if (segment && segment.segmentId) {
    selectedSegmentId = segment.segmentId;
  }
  renderHeader();
  renderSegmentList();
  renderEditor(segment, analysis);
}

function bindCorrigerUI() {
  if (!panelEls) return;

  panelEls.corrigerFilter?.addEventListener('change', (e) => {
    currentFilter = e.target.value;
    renderSegmentList();
  });

  panelEls.corrigerListenBtn?.addEventListener('click', toggleListenLoop);

  panelEls.corrigerApplyBtn?.addEventListener('click', () => {
    const input = panelEls.corrigerInput?.value?.trim() || '';
    applyEditorInput(input);
  });

  panelEls.corrigerCorrectBtn?.addEventListener('click', () => {
    // Marquer correct = supprimer toute correction manuelle.
    applyEditorInput('');
  });

  panelEls.corrigerResetBtn?.addEventListener('click', () => {
    const segment = resolveSegment(selectedSegmentId);
    if (!segment) return;
    const effective = getEffectiveChord(segment);
    if (panelEls.corrigerInput) panelEls.corrigerInput.value = effective === 'N' ? '' : effective;
  });

  panelEls.corrigerInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      applyEditorInput(panelEls.corrigerInput.value.trim());
    }
  });

  panelEls.corrigerCandidates?.addEventListener('click', (e) => {
    const chip = e.target.closest('[data-candidate]');
    if (!chip || !panelEls.corrigerInput) return;
    panelEls.corrigerInput.value = chip.dataset.candidate;
    panelEls.corrigerInput.focus();
  });

  // Export conservés dans le panneau Corriger : ils portent les ids
  // analyzer-export-* pour rester compatibles avec analyzer-tab.js.
}

function getSegments() {
  return Array.isArray(callbacks.getSegments?.()) ? callbacks.getSegments() : [];
}

function getAnalysis() {
  return callbacks.getAnalysis?.() || null;
}

function isFlagged(segment) {
  if (!segment) return false;
  if (!segment.chord || segment.chord === 'N') return true;
  if (segment.role === 'uncertain') return true;
  if (typeof segment.confidence === 'number' && segment.confidence < 0.55) return true;
  return false;
}

function renderHeader() {
  if (!panelEls?.corrigerHeader) return;
  const segments = getSegments();
  const total = segments.length;
  const lowConf = segments.filter((s) => typeof s.confidence === 'number' && s.confidence < 0.55).length;
  const nCount = segments.filter((s) => !s.chord || s.chord === 'N').length;
  const corrected = segments.filter((s) => s.manualOverride != null).length;

  panelEls.corrigerHeader.innerHTML = `
    <div class="corriger-stat">
      <span class="corriger-stat-value">${total}</span>
      <span class="corriger-stat-label">Accords</span>
    </div>
    <div class="corriger-stat ${lowConf ? 'warn' : ''}">
      <span class="corriger-stat-value">${lowConf}</span>
      <span class="corriger-stat-label">Confiance faible</span>
    </div>
    <div class="corriger-stat ${nCount ? 'warn' : ''}">
      <span class="corriger-stat-value">${nCount}</span>
      <span class="corriger-stat-label">Vides (N)</span>
    </div>
    <div class="corriger-stat ${corrected ? 'ok' : ''}">
      <span class="corriger-stat-value">${corrected}</span>
      <span class="corriger-stat-label">Corrigés</span>
    </div>
    <div class="corriger-actions">
      <button type="button" class="btn-secondary" id="analyzer-export-midi-btn">Exporter MIDI</button>
      <button type="button" class="btn-secondary" id="analyzer-export-json-btn">Exporter JSON</button>
      <button type="button" class="btn-secondary" id="analyzer-copy-text-btn">Copier le texte</button>
    </div>
  `;

  panelEls.corrigerHeader.querySelector('#analyzer-export-midi-btn')?.addEventListener('click', () => callbacks.onExportMidi?.());
  panelEls.corrigerHeader.querySelector('#analyzer-export-json-btn')?.addEventListener('click', () => callbacks.onExportJson?.());
  panelEls.corrigerHeader.querySelector('#analyzer-copy-text-btn')?.addEventListener('click', () => callbacks.onCopyText?.());
}

function renderSegmentList() {
  if (!panelEls?.corrigerList) return;
  const segments = getSegments();
  const filtered = currentFilter === 'all'
    ? segments
    : segments.filter((s) => isFlagged(s) || s.manualOverride != null);

  if (filtered.length === 0) {
    panelEls.corrigerList.innerHTML = `
      <div class="corriger-list-empty">
        Aucun segment signalé. Passez en mode “Tous” pour voir l’analyse complète.
      </div>
    `;
    return;
  }

  const fmt = (s) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${String(sec).padStart(2, '0')}`;
  };

  panelEls.corrigerList.innerHTML = filtered.map((seg) => {
    const effective = getEffectiveChord(seg);
    const detected = seg.chord || 'N';
    const isSelected = seg.segmentId === selectedSegmentId;
    const reason = segmentReason(seg);
    const corrected = seg.manualOverride != null;
    return `
      <button type="button" class="corriger-segment ${isSelected ? 'selected' : ''} ${corrected ? 'corrected' : ''}"
              data-segment-id="${escapeHtml(seg.segmentId || '')}"
              title="${fmt(seg.startTime)} → ${fmt(seg.endTime)} — ${corrected ? `Corrigé : ${detected} → ${effective}` : reason}">
        <span class="corriger-segment-chord">${escapeHtml(effective)}</span>
        <span class="corriger-segment-time">${fmt(seg.startTime)} – ${fmt(seg.endTime)}</span>
        <span class="corriger-segment-reason">${escapeHtml(reason)}</span>
        ${corrected ? '<span class="corriger-segment-badge" title="Corrigé manuellement">✏</span>' : ''}
      </button>
    `;
  }).join('');

  panelEls.corrigerList.querySelectorAll('[data-segment-id]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.segmentId;
      callbacks.onSelect?.(id);
    });
  });
}

function segmentReason(segment) {
  if (!segment.chord || segment.chord === 'N') return 'Silence / non détecté';
  if (segment.role === 'uncertain') return 'Détection incertaine';
  if (typeof segment.confidence === 'number' && segment.confidence < 0.55) return `Confiance ${(segment.confidence * 100).toFixed(0)}%`;
  return 'Relecture';
}

function resolveSegment(segmentId) {
  if (!segmentId) return null;
  return getSegments().find((s) => s.segmentId === segmentId) || null;
}

function renderEditor(segment, analysis) {
  if (!panelEls?.corrigerEditor) return;
  if (!segment) {
    panelEls.corrigerEditor.style.display = 'none';
    return;
  }
  panelEls.corrigerEditor.style.display = '';

  const effective = getEffectiveChord(segment);
  const detected = segment.chord || 'N';
  const corrected = segment.manualOverride != null;

  if (panelEls.corrigerEditorDetected) {
    panelEls.corrigerEditorDetected.textContent = detected === effective ? detected : `${detected} → ${effective}`;
    panelEls.corrigerEditorDetected.classList.toggle('corrected', corrected);
  }
  if (panelEls.corrigerEditorMeta) {
    panelEls.corrigerEditorMeta.textContent = formatTime(segment.startTime) + ' – ' + formatTime(segment.endTime)
      + (typeof segment.confidence === 'number' ? ` · confiance ${(segment.confidence * 100).toFixed(0)}%` : '');
  }

  const inputValue = corrected ? effective : '';
  if (panelEls.corrigerInput && document.activeElement !== panelEls.corrigerInput) {
    panelEls.corrigerInput.value = inputValue;
  }

  renderEditorKeyboard(effective);
  renderCandidates(segment, effective);
}

function renderEditorKeyboard(effectiveChord) {
  if (!panelEls?.corrigerKeyboard) return;
  if (!effectiveChord || effectiveChord === 'N') {
    panelEls.corrigerKeyboard.innerHTML = '<span class="corriger-keyboard-empty">Aucune note à afficher.</span>';
    return;
  }
  const display = deriveChordDisplay(effectiveChord);
  const notes = display.allPcs.map((pc) => pc + 60); // C4 octave approximative
  const { svg, noteNames } = miniKeyboardForNotes(notes);
  panelEls.corrigerKeyboard.innerHTML = `
    <div class="corriger-keyboard-wrap">${svg}</div>
    <div class="corriger-keyboard-notes">${noteNames.join(' · ') || '—'}</div>
  `;
}

function renderCandidates(segment, effectiveChord) {
  if (!panelEls?.corrigerCandidates) return;
  const candidates = generateCandidates(effectiveChord);
  if (candidates.length === 0) {
    panelEls.corrigerCandidates.innerHTML = '';
    return;
  }
  panelEls.corrigerCandidates.innerHTML = candidates.map((c) => `
    <button type="button" class="corriger-candidate" data-candidate="${escapeHtml(c.chord)}" title="${escapeHtml(c.reason)}">
      <span class="corriger-candidate-name">${escapeHtml(c.chord)}</span>
      <span class="corriger-candidate-score">${(c.confidence * 100).toFixed(0)}%</span>
    </button>
  `).join('');
}

function generateCandidates(effectiveChord) {
  if (!effectiveChord || effectiveChord === 'N') return [];
  const display = deriveChordDisplay(effectiveChord);
  const pcs = display.allPcs;
  if (!pcs.length) return [];
  const pcSet = new Set(pcs);
  const seen = new Set();
  const list = [];

  // Accord actuel en premier.
  seen.add(effectiveChord);
  list.push({ chord: effectiveChord, confidence: 1, reason: 'Accord actuel' });

  for (const root of pcs) {
    for (const def of CHORD_DEFINITIONS) {
      const required = def.intervals.slice(1).map((i) => (root + i) % 12);
      if (!required.every((pc) => pcSet.has(pc))) continue;
      const chordStr = formatEffectiveChord(root, def.symbol, null);
      if (seen.has(chordStr)) continue;
      seen.add(chordStr);
      const missingRoot = !pcSet.has(root % 12);
      const missingCount = required.filter((pc) => !pcSet.has(pc)).length;
      let confidence = 1 - missingCount * 0.08;
      let reason = 'Correspondance exacte';
      if (missingRoot) {
        confidence = Math.max(0.5, 0.7 - missingCount * 0.05);
        reason = 'Fondamentale manquante';
      } else if (missingCount > 0) {
        reason = 'Notes optionnelles manquantes';
      }
      list.push({ chord: chordStr, confidence, reason });
    }
  }

  return list
    .filter((c) => c.chord !== effectiveChord)
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 5);
}

function applyEditorInput(raw) {
  const segment = resolveSegment(selectedSegmentId);
  const analysis = getAnalysis();
  if (!segment || !analysis) return;

  const input = raw.trim();
  let override = null;

  if (input && input !== 'N') {
    if (!VALID_CHORD_RE.test(input)) {
      showPanelMessage('Symbole invalide. Utilisez par exemple F#m7, C/E, Bbmaj9…', 'warning');
      return;
    }
    const parsed = parseChordSymbol(input);
    override = {
      root: parsed.root,
      quality: parsed.quality,
      bass: parsed.bass,
    };
  }

  stopListenLoop();
  callbacks.requestPause?.();

  const target = { segmentId: segment.segmentId };
  const mutation = applyChordTargetMutation(analysis.chords, target, override);
  if (!mutation.ok) {
    showPanelMessage("L'accord ciblé n'est plus disponible. Aucune modification appliquée.", 'warning');
    return;
  }

  callbacks.onCorrected?.(segment.segmentId);
  showPanelMessage(override ? 'Correction appliquée.' : 'Correction retirée : accord marqué correct.', 'success');
}

function toggleListenLoop() {
  if (loopTimer) {
    stopListenLoop();
    return;
  }
  const segment = resolveSegment(selectedSegmentId);
  if (!segment) return;
  const player = callbacks.getPlayer?.();
  if (!player) return;

  player.pause();
  player.seek(segment.startTime);
  player.play();
  loopTimer = setInterval(() => {
    const t = player.getCurrentTime?.() ?? player.element?.currentTime ?? 0;
    if (t >= segment.endTime - 0.03) {
      player.seek(segment.startTime);
    }
  }, 80);

  if (panelEls?.corrigerListenBtn) {
    panelEls.corrigerListenBtn.textContent = '⏸ Arrêter la boucle';
    panelEls.corrigerListenBtn.setAttribute('aria-pressed', 'true');
  }
}

function stopListenLoop() {
  if (!loopTimer) return;
  clearInterval(loopTimer);
  loopTimer = null;
  const player = callbacks.getPlayer?.();
  if (player) player.pause();
  if (panelEls?.corrigerListenBtn) {
    panelEls.corrigerListenBtn.textContent = '▶ Écouter en boucle';
    panelEls.corrigerListenBtn.setAttribute('aria-pressed', 'false');
  }
}

function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

function escapeHtml(text) {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function showPanelMessage(message, kind = 'info') {
  if (!panelEls?.corrigerMessage) {
    // eslint-disable-next-line no-console
    console.log(`[Corriger] ${message}`);
    return;
  }
  panelEls.corrigerMessage.textContent = message;
  panelEls.corrigerMessage.className = `corriger-message ${kind}`;
  panelEls.corrigerMessage.style.display = '';
  setTimeout(() => {
    if (panelEls?.corrigerMessage) panelEls.corrigerMessage.style.display = 'none';
  }, 3000);
}
