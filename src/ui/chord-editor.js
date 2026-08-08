import { noteNameToPc, NOTE_NAMES } from '../chord-engine/intervals.js';
export { NOTE_NAMES } from '../chord-engine/intervals.js';
import { captureChordTarget } from './chord-edit-session.js';

// Fonctions harmoniques pures déplacées dans le module partagé chord-display.js.
export {
  parseChordSymbol,
  formatEffectiveChord,
  getEffectiveChord,
  normalizeOverride,
  deriveChordDisplay,
} from '../chord-engine/chord-display.js';

// Imports locaux : les re-exports ci-dessus ne créent pas de liaison locale.
import { parseChordSymbol, formatEffectiveChord, normalizeOverride as normalizeOverridePure } from '../chord-engine/chord-display.js';

export const QUALITY_OPTIONS = [
  { value: '', label: 'Majeur' },
  { value: 'm', label: 'mineur' },
  { value: '7', label: '7 (dominante)' },
  { value: 'maj7', label: 'Maj7' },
  { value: 'm7', label: 'mineur 7' },
  { value: 'm7b5', label: 'mineur 7 b5' },
  { value: 'dim', label: 'diminué' },
  { value: 'aug', label: 'augmenté' },
  { value: 'sus2', label: 'sus2' },
  { value: 'sus4', label: 'sus4' },
];

export function makeSegmentId(seg) {
  const str = `${seg.startTime}|${seg.endTime}|${seg.chord}`;
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const chr = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + chr;
    hash |= 0;
  }
  return `seg_${Math.abs(hash).toString(36)}`;
}

export function findQualityIndex(quality) {
  const idx = QUALITY_OPTIONS.findIndex((o) => o.value === quality);
  return idx >= 0 ? idx : 0;
}

export class ChordEditor {
  constructor(callbacks = {}) {
    this.panel = null;
    this.overlay = null;
    this.isOpen = false;
    this.segmentIndex = -1;
    this.segment = null;
    this.editTarget = null;
    this.analysis = null;
    this.onSave = callbacks.onSave || (() => {});
    this.onCancel = callbacks.onCancel || (() => {});
    this.onReset = callbacks.onReset || (() => {});

    this._rootSelect = null;
    this._qualitySelect = null;
    this._bassSelect = null;
    this._previewEl = null;
    this._detectedEl = null;
    this._saveBtn = null;
    this._resetBtn = null;

    this._boundKeydown = null;
  }

  open(segment, segmentIndex, analysis) {
    if (this.isOpen) this.close();
    this.segment = segment;
    this.segmentIndex = segmentIndex;
    // Lot C — cible d'édition immuable, capturée à l'ouverture via segmentId.
    // Elle ne sera JAMAIS recalculée depuis currentTime, l'index actif de
    // lecture, la surbrillance ou la position visuelle de la timeline.
    this.editTarget = captureChordTarget(segment);
    this.analysis = analysis;
    this.isOpen = true;
    this._build();
  }

  close() {
    if (!this.isOpen) return;
    if (this.overlay && this.overlay.parentNode) {
      this.overlay.parentNode.removeChild(this.overlay);
    }
    if (this._boundKeydown) {
      document.removeEventListener('keydown', this._boundKeydown);
      this._boundKeydown = null;
    }
    this.panel = null;
    this.overlay = null;
    this.isOpen = false;
    this.segment = null;
    this.segmentIndex = -1;
    // Lot C — nettoyage complet de la cible d'édition locale.
    this.editTarget = null;
    this._rootSelect = null;
    this._qualitySelect = null;
    this._bassSelect = null;
    this._previewEl = null;
    this._detectedEl = null;
    this._saveBtn = null;
    this._resetBtn = null;
    this.onCancel();
  }

  _build() {
    const detected = parseChordSymbol(this.segment.chord);
    const currentOverride = this.segment.manualOverride;

    const initialRoot = currentOverride ? currentOverride.root : (detected.isN ? 0 : detected.root);
    const initialQuality = currentOverride ? currentOverride.quality : (detected.isN ? '' : detected.quality);
    const initialBass = currentOverride ? currentOverride.bass : (detected.bass);

    const overlay = document.createElement('div');
    overlay.className = 'chord-editor-overlay';
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) this.close();
    });

    const panel = document.createElement('div');
    panel.className = 'chord-editor-panel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', "Éditer l'accord");

    const header = document.createElement('div');
    header.className = 'chord-editor-header';
    header.innerHTML = `<span class="chord-editor-title">Éditer l'accord</span>`;
    panel.appendChild(header);

    const body = document.createElement('div');
    body.className = 'chord-editor-body';

    const detectedLine = document.createElement('div');
    detectedLine.className = 'chord-editor-detected';
    this._detectedEl = document.createElement('span');
    this._detectedEl.className = 'chord-editor-detected-name';
    this._detectedEl.textContent = this.segment.chord || 'N';
    detectedLine.innerHTML = 'Détecté&nbsp;: ';
    detectedLine.appendChild(this._detectedEl);
    body.appendChild(detectedLine);

    const rootField = this._makeField('Fondamentale');
    this._rootSelect = document.createElement('select');
    this._rootSelect.className = 'chord-editor-select';
    for (let i = 0; i < 12; i++) {
      const opt = document.createElement('option');
      opt.value = String(i);
      opt.textContent = NOTE_NAMES[i];
      this._rootSelect.appendChild(opt);
    }
    this._rootSelect.value = String(initialRoot);
    this._rootSelect.addEventListener('change', () => this._updatePreview());
    rootField.appendChild(this._rootSelect);
    body.appendChild(rootField);

    const qualityField = this._makeField('Qualité');
    this._qualitySelect = document.createElement('select');
    this._qualitySelect.className = 'chord-editor-select';
    for (const q of QUALITY_OPTIONS) {
      const opt = document.createElement('option');
      opt.value = q.value;
      opt.textContent = q.label;
      this._qualitySelect.appendChild(opt);
    }
    this._qualitySelect.value = findQualityIndex(initialQuality) >= 0 ? initialQuality : '';
    this._qualitySelect.addEventListener('change', () => this._updatePreview());
    qualityField.appendChild(this._qualitySelect);
    body.appendChild(qualityField);

    const bassField = this._makeField('Basse (facultative)');
    this._bassSelect = document.createElement('select');
    this._bassSelect.className = 'chord-editor-select';
    const noneOpt = document.createElement('option');
    noneOpt.value = '';
    noneOpt.textContent = '(aucune)';
    this._bassSelect.appendChild(noneOpt);
    for (let i = 0; i < 12; i++) {
      const opt = document.createElement('option');
      opt.value = String(i);
      opt.textContent = NOTE_NAMES[i];
      this._bassSelect.appendChild(opt);
    }
    this._bassSelect.value = initialBass != null ? String(initialBass) : '';
    this._bassSelect.addEventListener('change', () => this._updatePreview());
    bassField.appendChild(this._bassSelect);
    body.appendChild(bassField);

    const previewLine = document.createElement('div');
    previewLine.className = 'chord-editor-preview';
    previewLine.innerHTML = 'Aperçu&nbsp;: ';
    this._previewEl = document.createElement('span');
    this._previewEl.className = 'chord-editor-preview-name';
    previewLine.appendChild(this._previewEl);
    body.appendChild(previewLine);

    panel.appendChild(body);

    const footer = document.createElement('div');
    footer.className = 'chord-editor-footer';

    this._resetBtn = document.createElement('button');
    this._resetBtn.className = 'chord-editor-btn chord-editor-reset-btn';
    this._resetBtn.textContent = 'Revenir à la détection';
    this._resetBtn.type = 'button';
    this._resetBtn.addEventListener('click', () => this._onReset());
    footer.appendChild(this._resetBtn);

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'chord-editor-btn chord-editor-cancel-btn';
    cancelBtn.textContent = 'Annuler';
    cancelBtn.type = 'button';
    cancelBtn.addEventListener('click', () => this.close());
    footer.appendChild(cancelBtn);

    this._saveBtn = document.createElement('button');
    this._saveBtn.className = 'chord-editor-btn chord-editor-save-btn';
    this._saveBtn.textContent = 'Enregistrer';
    this._saveBtn.type = 'button';
    this._saveBtn.addEventListener('click', () => this._onSave());
    footer.appendChild(this._saveBtn);

    panel.appendChild(footer);
    overlay.appendChild(panel);

    const results = document.getElementById('analyzer-results');
    if (results) {
      results.appendChild(overlay);
    } else {
      document.body.appendChild(overlay);
    }

    this.panel = panel;
    this.overlay = overlay;

    this._updatePreview();

    this._boundKeydown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        this.close();
      }
    };
    document.addEventListener('keydown', this._boundKeydown);
  }

  _makeField(labelText) {
    const field = document.createElement('div');
    field.className = 'chord-editor-field';
    const label = document.createElement('label');
    label.className = 'chord-editor-label';
    label.textContent = labelText;
    field.appendChild(label);
    return field;
  }

  _getFormValues() {
    const root = this._rootSelect ? parseInt(this._rootSelect.value, 10) : 0;
    const quality = this._qualitySelect ? this._qualitySelect.value : '';
    const bassRaw = this._bassSelect ? this._bassSelect.value : '';
    const bass = bassRaw === '' ? null : parseInt(bassRaw, 10);
    return { root, quality, bass };
  }

  _updatePreview() {
    const { root, quality, bass } = this._getFormValues();
    const preview = formatEffectiveChord(root, quality, bass);
    if (this._previewEl) {
      this._previewEl.textContent = preview;
    }
  }

  _onSave() {
    const { root, quality, bass } = this._getFormValues();
    // Lot C : transmet la cible immuable capturée, jamais l'index d'origine.
    this.onSave(this.editTarget, { root, quality, bass });
    this.close();
  }

  _onReset() {
    // Lot C : transmet la cible immuable capturée, jamais l'index d'origine.
    this.onReset(this.editTarget);
    this.close();
  }
}

// ── Phase B : Persistance des overrides ──

export function buildProjectPath(audioPath) {
  if (!audioPath) return null;
  return audioPath.replace(/\.[^/.]+$/, '') + '.pjc.json';
}

export function buildProjectData(audioIdentity, chords, existingOrphanedOverrides = {}) {
  const overrides = {};
  for (const seg of chords) {
    if (seg.manualOverride) {
      overrides[seg.segmentId] = {
        root: seg.manualOverride.root,
        quality: seg.manualOverride.quality,
        bass: seg.manualOverride.bass,
        editedAt: new Date().toISOString(),
        source: 'user',
        startTime: seg.startTime,
        endTime: seg.endTime,
        detectedChord: seg.chord,
      };
    }
  }
  return {
    schemaVersion: 1,
    audio: { ...audioIdentity },
    analysis: { segmentSignatureVersion: 1 },
    manualChordOverrides: overrides,
    orphanedOverrides: { ...(existingOrphanedOverrides || {}) },
  };
}

export function validateProjectSchema(data) {
  if (!data || typeof data !== 'object') return false;
  if (data.schemaVersion !== 1) return false;
  if (!data.audio || typeof data.audio !== 'object') return false;
  if (!data.audio.path) return false;
  if (typeof data.audio.path !== 'string') return false;
  if (!data.manualChordOverrides || typeof data.manualChordOverrides !== 'object') return false;
  return true;
}

export function verifyAudioIdentity(savedInfo, currentInfo) {
  if (!savedInfo || !currentInfo) return false;
  if (savedInfo.path !== currentInfo.path) return false;
  if (savedInfo.size > 0 && currentInfo.size > 0 && savedInfo.size !== currentInfo.size) return false;
  if (savedInfo.modifiedAt > 0 && currentInfo.modifiedAt > 0 && savedInfo.modifiedAt !== currentInfo.modifiedAt) return false;
  return true;
}

export function findTemporalFallback(overrideData, segments) {
  const origStart = overrideData.startTime;
  const origEnd = overrideData.endTime;
  if (origStart == null || origEnd == null) return null;
  const origDur = origEnd - origStart;
  if (origDur <= 0) return null;

  const candidates = segments.filter((s) => {
    const dur = s.endTime - s.startTime;
    if (dur <= 0) return false;
    const overlapStart = Math.max(origStart, s.startTime);
    const overlapEnd = Math.min(origEnd, s.endTime);
    const overlap = Math.max(0, overlapEnd - overlapStart);
    const overlapRatio = overlap / Math.min(origDur, dur);
    if (overlapRatio < 0.8) return false;
    const durRatio = Math.abs(origDur - dur) / Math.max(origDur, dur);
    if (durRatio > 0.2) return false;
    return true;
  });

  if (candidates.length === 1) return candidates[0];
  return null;
}

export function tryApplyProjectOverrides(projectData, segments) {
  const applied = [];
  const orphaned = { ...(projectData.orphanedOverrides || {}) };
  const overrides = projectData.manualChordOverrides || {};

  for (const [segmentId, overrideData] of Object.entries(overrides)) {
    let match = segments.find((s) => s.segmentId === segmentId);

    if (!match) {
      match = findTemporalFallback(overrideData, segments);
    }

    if (match) {
      const normalized = normalizeOverridePure(match, {
        root: overrideData.root,
        quality: overrideData.quality,
        bass: overrideData.bass,
      });
      match.manualOverride = normalized;
      applied.push({ segmentId, status: 'applied', segmentIndex: segments.indexOf(match), temporal: match.segmentId !== segmentId });
    } else {
      orphaned[segmentId] = overrideData;
    }
  }

  return { applied, orphaned };
}
