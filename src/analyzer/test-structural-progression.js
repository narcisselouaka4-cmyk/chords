import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { harmonicRole, selectChordProgression } from './structural-progression.js';
import { getEffectiveChord } from '../chord-engine/chord-display.js';
import { buildAnalysisMidiEvents, exportAnalysisToJson, exportAnalysisToCsv, exportAnalysisToText } from './analysis-export.js';

const segment = (id, chord, role, startTime, endTime, extra = {}) =>
  ({ segmentId: id, chord, role, startTime, endTime, ...extra });
const source = [
  segment('a', 'F', 'structural', 0, 2),
  segment('b', 'F#dim', 'passing', 2, 2.5),
  segment('c', 'B', 'uncertain', 2.5, 3),
  segment('d', 'G', 'structural', 3, 5),
  segment('e', 'N', 'silence', 5, 6),
];

test('seuls les piliers restent, aux temps exacts et sans mutation', () => {
  const snapshot = structuredClone(source);
  const shown = selectChordProgression(source);
  assert.deepEqual(shown.map((s) => s.segmentId), ['a', 'd']);
  assert.equal(shown[0], source[0]);
  assert.equal(shown[0].endTime, 2);
  assert.equal(shown[1].startTime, 3);
  assert.deepEqual(source, snapshot);
  assert.deepEqual(selectChordProgression(source, { detailed: true }), source);
});

test('aucun remplacement si tous les événements sont incertains ou de passage', () => {
  assert.deepEqual(selectChordProgression(source.slice(1, 3)), []);
  assert.deepEqual(selectChordProgression([source[4]]), []);
  assert.deepEqual(selectChordProgression(), []);
  assert.deepEqual(selectChordProgression([segment('n', 'N', 'structural', 0, 3)]), []);
  assert.deepEqual(selectChordProgression([segment('u', 'C', 'unknown', 0, 3)]), []);
});

test('corrections manuelles prioritaires et analyses MIDI sans rôle compatibles', () => {
  const corrected = { ...source[2], manualOverride: { root: 2, quality: 'm', bass: null } };
  assert.equal(harmonicRole(corrected), 'structural');
  assert.equal(getEffectiveChord(selectChordProgression([corrected])[0]), 'Dm');
  assert.deepEqual(selectChordProgression([segment('midi', 'Am', undefined, 0, 4)]).map((s) => s.chord), ['Am']);
  corrected.manualOverride = null;
  assert.deepEqual(selectChordProgression([corrected]), []);
});

test('exports MIDI, JSON, CSV et texte conservent les intervalles sans accord', () => {
  const analysis = { duration: 6, tempo: 120, chords: selectChordProgression(source) };
  const events = buildAnalysisMidiEvents(analysis)[0].events;
  assert.deepEqual([...new Set(events.map((e) => e.time))], [0, 2, 3, 5]);
  const json = exportAnalysisToJson(analysis);
  assert.deepEqual(json.segments.map((s) => s.chord), ['F', 'G']);
  for (const output of [exportAnalysisToCsv(analysis), exportAnalysisToText(analysis)]) {
    assert(!output.includes('F#dim'));
    assert(!output.includes('B,'));
  }
});

// Exercer les vraies fonctions du contrôleur avec un DOM minimal, sans lancer
// Electron, l'audio ni les modules CSS. Les corps sont lus dans le fichier UI.
const ui = readFileSync(new URL('../ui/analyzer-tab.js', import.meta.url), 'utf8');
function controllerFunction(name) {
  const start = ui.indexOf(`function ${name}(`);
  assert(start >= 0, name);
  return ui.slice(start, ui.indexOf('\n}\n', start) + 3);
}

class Element {
  constructor() {
    this.dataset = {};
    this.children = [];
    this.listeners = {};
    this.classes = new Set();
    this.style = { setProperty() {}, removeProperty() {} };
    this.classList = {
      add: (...names) => names.forEach((name) => this.classes.add(name)),
      remove: (name) => this.classes.delete(name),
      toggle: (name, on) => on ? this.classes.add(name) : this.classes.delete(name),
      contains: (name) => this.classes.has(name),
    };
  }
  set innerHTML(value) { this.html = value; this.children = []; }
  get innerHTML() { return this.html || ''; }
  setAttribute() {}
  addEventListener(type, fn) { this.listeners[type] = fn; }
  appendChild(child) { this.children.push(child); }
  querySelectorAll() { return this.children.filter((c) => c.className === 'analyzer-timeline-block'); }
  getBoundingClientRect() { return { left: 0, right: 10000, width: 10000 }; }
  scrollIntoView() {}
  scrollTo() {}
}

function controller(chords = structuredClone(source)) {
  const els = Object.fromEntries(['chordTimelineInner', 'chordTimeline', 'hierarchyToggle', 'timelineLegend',
    'progressFill', 'progressThumb', 'currentTimeEl', 'durationEl', 'heroProgressFill', 'heroNext']
    .map((name) => [name, new Element()]));
  const context = vm.createContext({
    els, currentAnalysis: { chords, duration: 6 }, currentPlayer: null,
    timelineViewMode: 'original', appliedReharmonization: null, detailedChords: false,
    timelineZoom: 1, BASE_PIXELS_PER_SECOND: 80, BLOCK_GAP: 4,
    COLLAPSE_MIN_WIDTH_PX: 26, selectedSegmentId: null,
    lastAutoScrollIndex: -1,
    ROLE_LABELS: { structural: 'Accord structurel', passing: 'Accord de passage', uncertain: 'Incertain', silence: 'Silence' },
    document: { createElement: () => new Element() },
    harmonicRole, selectChordProgression, getEffectiveChord,
    fitChordLabel: (text) => ({ text, fontPx: 14 }), escapeHtml: (s) => s,
    formatTime: String, keyDisplayLabel: String,
    highlightSelectedSegment() {}, seekToSegment() {}, renderMasterclass() {}, renderCorriger() {},
  });
  context.renderHeroChord = (chord) => { context.hero = chord; };
  context.clearInspector = () => { context.inspector = null; };
  context.renderInspector = (chord) => { context.inspector = chord; };
  context.renderOverview = (analysis) => { context.overview = analysis; };
  context.renderStats = (analysis) => { context.stats = analysis; };
  context.openChordEditor = (index) => { context.editIndex = index; };
  vm.runInContext(['getDisplayChords', 'getDisplayAnalysis', 'segmentRole', 'renderTimeline',
    'bindHierarchyToggle', 'selectSegment', 'rerenderTimeline', 'updatePlaybackPosition']
    .map(controllerFunction).join('\n'), context);
  context.bindHierarchyToggle();
  context.rerenderTimeline();
  return context;
}

test('frise, vue d’ensemble et édition utilisent les bonnes identités après filtrage', () => {
  const c = controller();
  const blocks = c.els.chordTimelineInner.querySelectorAll();
  assert.deepEqual(blocks.map((b) => b.dataset.segmentId), ['a', 'd']);
  assert.equal(blocks[1].dataset.index, '3');
  assert.equal(blocks[1].style.left, '240px');
  blocks[1].listeners.dblclick({ stopPropagation() {} });
  assert.equal(c.editIndex, 3);
  assert.equal(c.inspector.segmentId, 'd');
  assert.deepEqual(c.overview.chords.map((s) => s.segmentId), ['a', 'd']);
  assert.equal(c.currentAnalysis.chords.length, 5);
});

test('lecture : aucun accord actif dans un intervalle omis, y compris après le dernier', () => {
  const c = controller();
  c.updatePlaybackPosition(1);
  assert.equal(c.hero.segmentId, 'a');
  c.updatePlaybackPosition(2);
  assert.equal(c.hero, null);
  assert(!c.els.chordTimelineInner.children.some((b) => b.classList.contains('current')));
  c.updatePlaybackPosition(3);
  assert.equal(c.hero.segmentId, 'd');
  c.updatePlaybackPosition(5);
  assert.equal(c.hero, null);
});

test('le nombre de blocs ne décale ni les accords ni les repères de modulation', () => {
  const c = controller();
  c.currentAnalysis.keys = [{ key: 'C', start: 0 }, { key: 'G', start: 3 }];
  for (const detailed of [false, true, false]) {
    c.els.hierarchyToggle.checked = detailed;
    c.els.hierarchyToggle.listeners.change();
    const children = c.els.chordTimelineInner.children;
    assert.equal(children.find((b) => b.dataset.segmentId === 'd').style.left, '240px');
    assert.equal(children.find((b) => b.className === 'analyzer-timeline-modkey').style.left, '240px');
    assert.equal(c.els.chordTimelineInner.style.width, '480px');
  }
});

test('retour des détails : masquer la sélection non structurelle et rafraîchir les exports', () => {
  const c = controller();
  c.els.hierarchyToggle.checked = true;
  c.els.hierarchyToggle.listeners.change();
  assert.equal(c.getDisplayChords().length, 5);
  c.selectSegment('c');
  assert.equal(c.inspector.chord, 'B');
  c.els.hierarchyToggle.checked = false;
  c.els.hierarchyToggle.listeners.change();
  assert.equal(c.inspector, null);
  assert.equal(c.selectedSegmentId, null);
  assert.deepEqual(c.getDisplayAnalysis().chords.map((s) => s.chord), ['F', 'G']);
});

test('une grille sans pilier confirmé reste vide pendant la lecture', () => {
  const c = controller(source.slice(1, 3));
  assert.equal(c.els.chordTimelineInner.children.length, 0);
  assert.match(c.els.chordTimelineInner.innerHTML, /Aucun accord structurel confirmé/);
  c.updatePlaybackPosition(2.75);
  assert.equal(c.hero, null);
});
