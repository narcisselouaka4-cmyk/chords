import { noteNameToPc, NOTE_NAMES } from '../chord-engine/intervals.js';
export { NOTE_NAMES } from '../chord-engine/intervals.js';
import { CHORD_DEFINITIONS } from '../chord-engine/chord-defs.js';

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

export function parseChordSymbol(chordStr) {
  if (!chordStr || chordStr === 'N') return { root: 0, quality: '', bass: null, isN: !chordStr || chordStr === 'N' };
  const slashParts = chordStr.split('/');
  const namePart = slashParts[0];
  const bassPart = slashParts[1];
  const rootMatch = namePart.match(/^([A-G][#b]?)(.*)/);
  if (!rootMatch) return { root: 0, quality: '', bass: null, isN: false };
  const root = noteNameToPc(rootMatch[1]);
  const quality = rootMatch[2] || '';
  const bass = bassPart ? noteNameToPc(bassPart.trim()) : null;
  return { root: root != null ? root : 0, quality: quality || '', bass, isN: false };
}

export function formatEffectiveChord(root, quality, bass) {
  const idx = ((root % 12) + 12) % 12;
  const rootName = NOTE_NAMES[idx];
  const sym = quality === '' ? rootName : `${rootName}${quality}`;
  if (bass != null && bass >= 0) {
    const bassIdx = ((bass % 12) + 12) % 12;
    return `${sym}/${NOTE_NAMES[bassIdx]}`;
  }
  return sym;
}

export function getEffectiveChord(segment) {
  if (segment.manualOverride) {
    return formatEffectiveChord(
      segment.manualOverride.root,
      segment.manualOverride.quality,
      segment.manualOverride.bass
    );
  }
  return segment.chord;
}

export function normalizeOverride(segment, override) {
  if (override == null) return null;
  const detected = parseChordSymbol(segment.chord);
  const overrideRoot = ((override.root % 12) + 12) % 12;
  const detectedRoot = ((detected.root % 12) + 12) % 12;
  if (
    detectedRoot === overrideRoot &&
    detected.quality === override.quality &&
    detected.bass === override.bass
  ) {
    return null;
  }
  return { root: override.root, quality: override.quality, bass: override.bass != null ? override.bass : null };
}

export function findQualityIndex(quality) {
  const idx = QUALITY_OPTIONS.findIndex((o) => o.value === quality);
  return idx >= 0 ? idx : 0;
}

export function deriveChordDisplay(effectiveChord) {
  if (!effectiveChord || effectiveChord === 'N') {
    return { symbol: effectiveChord || 'N', rootPc: null, quality: null, bassPc: null, chordTonePcs: [], chordToneNames: [], bassName: null, allPcs: [], allNames: [] };
  }

  const slashIdx = effectiveChord.indexOf('/');
  const chordPart = slashIdx >= 0 ? effectiveChord.slice(0, slashIdx) : effectiveChord;
  const bassStr = slashIdx >= 0 ? effectiveChord.slice(slashIdx + 1).trim() : null;

  const rootMatch = chordPart.match(/^([A-G][#b]?)(.*)/);
  if (!rootMatch) {
    return { symbol: effectiveChord, rootPc: null, quality: null, bassPc: null, chordTonePcs: [], chordToneNames: [], bassName: null, allPcs: [], allNames: [] };
  }

  const rootName = rootMatch[1];
  const quality = rootMatch[2].trim();
  const rootPc = noteNameToPc(rootName);
  if (rootPc == null) {
    return { symbol: effectiveChord, rootPc: null, quality: null, bassPc: null, chordTonePcs: [], chordToneNames: [], bassName: null, allPcs: [], allNames: [] };
  }

  const def = CHORD_DEFINITIONS.find((d) => d.symbol === quality);
  const intervals = def ? def.intervals : [0, 4, 7];

  const pcSet = new Set(intervals.map((i) => ((rootPc + i) % 12 + 12) % 12));
  const chordTonePcs = [...pcSet].sort((a, b) => a - b);

  const bassPc = bassStr != null ? noteNameToPc(bassStr) : null;
  const normalizedBassPc = bassPc != null ? ((bassPc % 12) + 12) % 12 : null;

  const chordToneNames = chordTonePcs.map((pc) => NOTE_NAMES[pc]);
  const bassName = normalizedBassPc != null ? NOTE_NAMES[normalizedBassPc] : null;

  const bassInChord = normalizedBassPc != null && pcSet.has(normalizedBassPc);
  const allPcsRaw = bassInChord ? chordTonePcs : [...chordTonePcs, ...(normalizedBassPc != null ? [normalizedBassPc] : [])];
  const allPcs = [...allPcsRaw].sort((a, b) => a - b);
  const allNames = allPcs.map((pc) => NOTE_NAMES[pc]);

  return {
    symbol: effectiveChord,
    rootPc: ((rootPc % 12) + 12) % 12,
    quality,
    bassPc: normalizedBassPc,
    chordTonePcs,
    chordToneNames,
    bassName,
    allPcs,
    allNames,
  };
}

export class ChordEditor {
  constructor(callbacks = {}) {
    this.panel = null;
    this.overlay = null;
    this.isOpen = false;
    this.segmentIndex = -1;
    this.segment = null;
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
    this.onSave(this.segmentIndex, { root, quality, bass });
    this.close();
  }

  _onReset() {
    this.onReset(this.segmentIndex);
    this.close();
  }
}
