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

// [Claude] — 2026-10-25 — La sélection ne masque plus les accords de passage ni
// les détections incertaines : un segment retiré d'une frise posée au temps
// laissait un trou, et un trou se lit comme un silence. Narcisse, après avoir
// ouvert « Saint Esprit » : « je préfère avoir une étiquette parasite plutôt
// que de voir une case vide. » Seuls les « N » — aucun accord du tout — sont
// écartés, et la frise étend alors sa voisine.
test('tous les accords relevés restent, aux temps exacts et sans mutation', () => {
  const snapshot = structuredClone(source);
  const shown = selectChordProgression(source);
  assert.deepEqual(shown.map((s) => s.segmentId), ['a', 'b', 'c', 'd']);
  assert.equal(shown[0], source[0]);
  assert.equal(shown[0].endTime, 2);
  assert.equal(shown[3].startTime, 3);
  assert.deepEqual(source, snapshot);
  assert.deepEqual(selectChordProgression(source, { detailed: true }), shown);
});

test('un segment sans accord du tout reste écarté, quel que soit son rôle', () => {
  assert.deepEqual(selectChordProgression([source[4]]), []);
  assert.deepEqual(selectChordProgression(), []);
  assert.deepEqual(selectChordProgression([segment('n', 'N', 'structural', 0, 3)]), []);
  assert.deepEqual(selectChordProgression(source.slice(1, 3)).map((s) => s.segmentId), ['b', 'c']);
  assert.deepEqual(selectChordProgression([segment('u', 'C', 'unknown', 0, 3)]).map((s) => s.chord), ['C']);
});

test('corrections manuelles prioritaires et analyses MIDI sans rôle compatibles', () => {
  const corrected = { ...source[2], manualOverride: { root: 2, quality: 'm', bass: null } };
  assert.equal(harmonicRole(corrected), 'structural');
  assert.equal(getEffectiveChord(selectChordProgression([corrected])[0]), 'Dm');
  assert.deepEqual(selectChordProgression([segment('midi', 'Am', undefined, 0, 4)]).map((s) => s.chord), ['Am']);
  corrected.manualOverride = null;
  assert.deepEqual(selectChordProgression([corrected]).map((s) => s.chord), ['B']);
});

// La propriété que Narcisse a demandée, protégée par un test : la frise couvre
// toute la durée, sans aucun blanc. Les pastilles sont posées au temps, en
// absolu ; chacune court jusqu'au début de la suivante, et la première part de
// zéro — y compris quand un « N » a été écarté ou que le découpage a laissé un
// intervalle sans accord.
test('la frise ne laisse aucun vide, du début à la fin', () => {
  const c = controller();
  const blocks = c.els.chordTimelineInner.querySelectorAll();
  const px = (v) => Number(String(v).replace('px', ''));
  assert.equal(px(blocks[0].style.left), 0, 'la première pastille part de zéro');
  let prev = 0;
  for (const b of blocks) {
    const left = px(b.style.left);
    assert.ok(left <= prev + 1e-6, `vide avant ${b.dataset.segmentId} : ${prev} → ${left}`);
    prev = left + px(b.style.width) + 4; // + BLOCK_GAP
  }
  assert.ok(prev >= 6 * 80 - 1e-6, 'la dernière pastille atteint la fin du morceau');
});

test('exports MIDI, JSON, CSV et texte suivent la grille affichée', () => {
  const analysis = { duration: 6, tempo: 120, chords: selectChordProgression(source) };
  const events = buildAnalysisMidiEvents(analysis)[0].events;
  assert.deepEqual([...new Set(events.map((e) => e.time))], [0, 2, 2.5, 3, 5]);
  const json = exportAnalysisToJson(analysis);
  assert.deepEqual(json.segments.map((s) => s.chord), ['F', 'F#dim', 'B', 'G']);
  for (const output of [exportAnalysisToCsv(analysis), exportAnalysisToText(analysis)]) {
    assert(output.includes('F#dim'), 'un accord de passage figure désormais dans l\'export');
  }
  // Le « N » de 5 à 6 s n'a jamais d'étiquette : il n'est pas un accord.
  assert(!exportAnalysisToCsv(analysis).includes(',N,'));
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
  scrollTo(options) { this.lastScroll = options; }
}

function controller(chords = structuredClone(source)) {
  const els = Object.fromEntries(['chordTimelineInner', 'chordTimeline', 'hierarchyToggle', 'timelineLegend',
    'progressFill', 'progressThumb', 'currentTimeEl', 'durationEl', 'heroProgressFill', 'heroNext']
    .map((name) => [name, new Element()]));
  const context = vm.createContext({
    els, currentAnalysis: { chords, duration: 6 }, currentPlayer: null,
    timelineViewMode: 'original', appliedReharmonization: null, detailedChords: false,
    timelineZoom: 1, BASE_PIXELS_PER_SECOND: 80, BLOCK_GAP: 4,
    LABEL_MIN_BLOCK_PX: 20, selectedSegmentId: null,
    lastAutoScrollIndex: -1, pinnedStudy: null, studyTime: null, chordGridExpanded: false,
    renderMusicalGrid() {}, musicalGridView: { update() {} }, updateMusicContext() {}, isPlaybackActive: () => false,
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
  assert.deepEqual(blocks.map((b) => b.dataset.segmentId), ['a', 'b', 'c', 'd']);
  assert.equal(blocks[3].dataset.index, '3');
  assert.equal(blocks[3].style.left, '240px');
  blocks[3].listeners.dblclick({ stopPropagation() {} });
  assert.equal(c.editIndex, 3);
  assert.equal(c.hero.segmentId, 'd');
  assert.deepEqual(c.overview.chords.map((s) => s.segmentId), ['a', 'b', 'c', 'd']);
  assert.equal(c.currentAnalysis.chords.length, 5);
});

test('lecture : chaque instant joué a son accord, sauf le silence final', () => {
  const c = controller();
  c.updatePlaybackPosition(1);
  assert.equal(c.hero.segmentId, 'a');
  c.updatePlaybackPosition(2);
  assert.equal(c.hero.segmentId, 'b', 'un accord de passage est lu comme les autres');
  c.updatePlaybackPosition(2.75);
  assert.equal(c.hero.segmentId, 'c');
  c.updatePlaybackPosition(3);
  assert.equal(c.hero.segmentId, 'd');
  // De 5 à 6 s il n'y a aucun accord joué : le « N » reste sans étiquette.
  c.updatePlaybackPosition(5);
  assert.equal(c.hero, null);
});

test('le nombre de blocs ne décale pas les accords ; aucun marqueur de modulation dans la frise', () => {
  const c = controller();
  c.currentAnalysis.keys = [{ key: 'C', start: 0 }, { key: 'G', start: 3 }];
  for (const detailed of [false, true, false]) {
    c.els.hierarchyToggle.checked = detailed;
    c.els.hierarchyToggle.listeners.change();
    const children = c.els.chordTimelineInner.children;
    assert.equal(children.find((b) => b.dataset.segmentId === 'd').style.left, '240px');
    assert.equal(children.some((b) => b.className === 'analyzer-timeline-modkey'), false);
    assert.equal(c.els.chordTimelineInner.style.width, '480px');
  }
});

test('le bouton des détails ne fait plus disparaître la sélection', () => {
  const c = controller();
  c.els.hierarchyToggle.checked = true;
  c.els.hierarchyToggle.listeners.change();
  assert.equal(c.getDisplayChords().length, 4);
  c.selectSegment('c');
  assert.equal(c.hero.chord, 'B');
  c.els.hierarchyToggle.checked = false;
  c.els.hierarchyToggle.listeners.change();
  // Un accord incertain reste affiché : la sélection survit au basculement.
  assert.equal(c.hero.chord, 'B');
  assert.equal(c.selectedSegmentId, 'c');
  assert.deepEqual(c.getDisplayAnalysis().chords.map((s) => s.chord), ['F', 'F#dim', 'B', 'G']);
});

test('une grille faite de seuls accords douteux les montre quand même', () => {
  const c = controller(source.slice(1, 3));
  const blocks = c.els.chordTimelineInner.querySelectorAll();
  assert.deepEqual(blocks.map((b) => b.dataset.segmentId), ['b', 'c']);
  c.updatePlaybackPosition(2.75);
  assert.equal(c.hero.segmentId, 'c');
});

test('une grille sans aucun accord reste vide', () => {
  const c = controller([segment('z', 'N', 'silence', 0, 6)]);
  assert.equal(c.els.chordTimelineInner.children.length, 0);
  c.updatePlaybackPosition(3);
  assert.equal(c.hero, null);
});

// La projection musicale suit sa propre ligne, avec le même temps que le lecteur.
test('grille agrandie : le contrôleur transmet aussi les retours arrière à la grille musicale', () => {
  const c = controller();
  c.chordGridExpanded = true;
  c.els.chordTimeline.lastScroll = undefined;
  const times = []; c.musicalGridView = { update: (t) => times.push(t) };
  c.updatePlaybackPosition(3.5);
  assert.equal(c.hero.segmentId, 'd');
  c.updatePlaybackPosition(1);
  assert.equal(c.hero.segmentId, 'a');
  assert.deepEqual(times, [3.5, 1]);
  assert.equal(c.els.chordTimeline.lastScroll, undefined, 'la frise cachée ne déplace pas la grille');
});
