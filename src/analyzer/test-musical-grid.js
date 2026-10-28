import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { buildMusicalGrid, beatAtTime, normalizeGridSettings } from './musical-grid.js';
import { DISPLAY_RHYTHM_VERSION } from './display-beats.js';
import { readGridView } from './grid-project.js';
import { buildProjectData, extractCachedAnalysis, tryApplyProjectOverrides } from '../ui/chord-editor.js';
import { exportAnalysisToJson, exportAnalysisToCsv, exportAnalysisToText, buildAnalysisMidiEvents } from './analysis-export.js';

const seg = (chord, startTime, endTime, role = 'structural') => ({ chord, startTime, endTime, role, segmentId: `${chord}-${startTime}` });
const song = (chords, duration = 8) => ({ chords, duration, tempo: 120, timeSignature: '4/4' });

test('quatre mesures par ligne, fusion proportionnelle et accord écrit une seule fois', () => {
  const grid = buildMusicalGrid(song([seg('C', 0, 2), seg('F', 2, 4), seg('G', 4, 8)]));
  assert.equal(grid.rows.length, 1); assert.equal(grid.bars.length, 4);
  assert.deepEqual(grid.rows[0].cells.map((c) => [c.symbol, c.to - c.from]), [['C', 4], ['F', 4], ['G', 8]]);
});

test('début calé au temps le plus proche, durée conservée en temps', () => {
  const grid = buildMusicalGrid(song([seg('C', 0, 2.24), seg('F', 2.24, 8)]));
  assert.equal(grid.rows[0].cells[1].startTime, 2);
  const forward = buildMusicalGrid(song([seg('C', 0, 2.28), seg('F', 2.28, 8)]));
  assert.equal(forward.rows[0].cells[1].startTime, 2.5);
});

test('accord court fusionné visuellement, passage inclus dans sa cellule, sources intactes', () => {
  const analysis = song([seg('C', 0, 1.8), seg('D#dim', 1.8, 2, 'passing'), seg('F', 2, 8)]);
  const before = structuredClone(analysis); const grid = buildMusicalGrid(analysis);
  assert.deepEqual(grid.rows[0].cells.map((c) => c.symbol), ['C', 'F']);
  assert.equal(grid.rows[0].cells[0].passages[0].symbol, 'D#dim');
  assert.deepEqual(analysis, before);
});

test('au plus deux harmonies par mesure même avec beaucoup de changements', () => {
  const analysis = song(Array.from({ length: 32 }, (_, i) => seg(['C', 'Dm', 'E', 'F'][i % 4], i / 4, (i + 1) / 4)));
  const grid = buildMusicalGrid(analysis);
  assert(grid.bars.every((bar) => bar.cells.length <= 2));
  assert(grid.rows[0].cells.some((c) => c.passages.length));
  assert.equal(analysis.chords.length, 32);
});

test('pulsations non uniformes respectées et retour arrière sur le bon temps', () => {
  const times = [0, .4, .81, 1.23, 1.66, 2.1, 2.55, 3.01, 3.48, 3.96, 4.45, 4.95];
  const grid = buildMusicalGrid(song([seg('C', 0, 1.65), seg('F', 1.65, 5.5)], 5.5), { rhythm: { beatTimes: times } });
  assert.equal(grid.estimated, false);
  assert.deepEqual(grid.boundaries.slice(0, times.length), times);
  assert.equal(grid.rows[0].cells[1].startTime, 1.66);
  assert.equal(beatAtTime(grid.boundaries, 4.5), 10);
  assert.equal(beatAtTime(grid.boundaries, .5), 1);
  assert.equal(beatAtTime(grid.boundaries, 5.5), -1);
});

test('×2 et ÷2 changent uniquement le nombre de temps affichés', () => {
  const analysis = song([seg('C', 0, 8)]), before = structuredClone(analysis);
  assert.equal(buildMusicalGrid(analysis).boundaries.length, 17);
  assert.equal(buildMusicalGrid(analysis, { settings: { tempoMultiplier: .5 } }).boundaries.length, 9);
  assert.equal(buildMusicalGrid(analysis, { settings: { tempoMultiplier: 2 } }).boundaries.length, 33);
  assert.deepEqual(analysis, before);
});

test('mesure, phase et décalage réglables sans modifier le tempo source', () => {
  const analysis = song([seg('C', 0, 8)]);
  const grid = buildMusicalGrid(analysis, { settings: { beatsPerBar: 3, phase: 1, offsetSeconds: .1 } });
  assert.equal(grid.bars[0].to, 2); assert.equal(grid.bars[1].to - grid.bars[1].from, 3);
  assert.equal(grid.boundaries[grid.bars[1].from], .6);
  assert.equal(grid.boundaries[1], .1);
  assert.equal(analysis.timeSignature, '4/4'); assert.equal(analysis.tempo, 120);
  assert.equal(normalizeGridSettings({ beatsPerBar: 999, tempoMultiplier: 999 }).beatsPerBar, 4);
});

test('sections A B A : même nom et même identité aux retours, sans nom inventé', () => {
  const analysis = song([seg('C', 0, 8), seg('G', 8, 16), seg('Dm', 16, 24), seg('Am', 24, 32), seg('C', 32, 40), seg('G', 40, 48)], 48);
  const grid = buildMusicalGrid(analysis);
  assert.deepEqual(grid.sections.map((s) => s.label), ['Partie A', 'Partie B', 'Partie A']);
  assert.deepEqual(grid.sections.map((s) => s.id), [0, 1, 0]);
});

test('continuité au saut de ligne et silence explicite', () => {
  const grid = buildMusicalGrid(song([seg('C', 0, 18), seg('N', 18, 24, 'silence')], 24));
  assert.equal(grid.rows[1].cells[0].continued, true);
  assert(grid.rows[2].cells.some((c) => c.symbol === 'N'));
});

test('correction par identité sur la source, jamais sur un indice de cellule fusionnée', () => {
  const analysis = song([seg('C', 0, 2), seg('F', 2, 8)]);
  analysis.chords[1].manualOverride = { root: 7, quality: '7', bass: null };
  const grid = buildMusicalGrid(analysis), cell = grid.rows[0].cells.find((c) => c.symbol === 'G7');
  assert.equal(cell.segmentId, analysis.chords[1].segmentId);
  const project = buildProjectData({ path: '/audio.wav' }, analysis.chords, {}, analysis);
  const restored = extractCachedAnalysis(project); tryApplyProjectOverrides(project, restored.chords);
  assert.equal(buildMusicalGrid(restored).rows[0].cells[1].symbol, 'G7');
});

test('réglages et pulsations persistés à part ; anciens projets compatibles', () => {
  const analysis = song([seg('C', 0, 8)]);
  const view = { settings: { beatsPerBar: 3, beatUnit: 4, tempoMultiplier: .5, phase: 2, offsetSeconds: .15, tempoOverride: null, downbeatSeconds: null }, rhythm: { version: DISPLAY_RHYTHM_VERSION, source: 'librosa-display', sourceTempo: 120, tempo: 120, duration: 8, beatTimes: [0, .5, 1, 1.5, 2], downbeatTimes: [] } };
  const project = JSON.parse(JSON.stringify(buildProjectData({ path: '/audio.wav' }, analysis.chords, {}, analysis, view)));
  assert.deepEqual(readGridView(project, analysis), view);
  assert.equal(project.analysis.tempo, 120); assert.equal(project.analysis.timeSignature, '4/4');
  assert(!('beatTimes' in project.analysis));
  assert.equal(readGridView({}, analysis).settings.beatsPerBar, 4);
  project.display.chordGrid.rhythm.beatTimes = [0, 1, .5];
  assert.equal(readGridView(project, analysis).rhythm, null);
});

test('sauvegardes simultanées : calage et correction écrits en série sans perdre le dernier état', async () => {
  const ui = readFileSync(new URL('../ui/analyzer-tab.js', import.meta.url), 'utf8');
  const start = ui.indexOf('async function saveProject(');
  const body = ui.slice(start, ui.indexOf('\n}\n', start) + 3);
  const writes = [], stored = new Map(); let pendingWrites = 0, maximumWrites = 0, cleans = 0;
  const context = vm.createContext({
    currentAudioPath: '/audio.wav', currentAnalysis: song([seg('C', 0, 8)]),
    projectPath: '/audio.pjc.json', audioIdentity: { path: '/audio.wav' },
    projectRevision: 0, projectSaveQueue: Promise.resolve(), currentProjectOrphanedOverrides: {},
    gridSettings: normalizeGridSettings(), gridRhythm: null, buildProjectData,
    console, showToast() {}, markClean() { cleans++; },
    window: { electronAPI: { files: {
      async writeFile(path, text) {
        pendingWrites++; maximumWrites = Math.max(maximumWrites, pendingWrites);
        await new Promise((resolve) => setTimeout(resolve, 5));
        stored.set(path, text); pendingWrites--;
      },
      async rename(from, to) { stored.set(to, stored.get(from)); writes.push(JSON.parse(stored.get(to))); stored.delete(from); },
    } } },
  });
  vm.runInContext(body, context);
  const first = context.saveProject({ silent: true });
  context.currentAnalysis.chords[0].manualOverride = { root: 7, quality: '7', bass: null };
  context.gridSettings.offsetSeconds = .15; context.projectRevision++;
  const last = context.saveProject({ silent: true });
  await Promise.all([first, last]);
  assert.equal(maximumWrites, 1); assert.equal(writes.length, 2); assert.equal(cleans, 1);
  assert.equal(writes[0].display.chordGrid.settings.offsetSeconds, 0);
  assert.equal(writes[1].display.chordGrid.settings.offsetSeconds, .15);
  assert.equal(Object.values(writes[1].manualChordOverrides)[0].root, 7);
});

test('exports JSON, MIDI, texte et CSV inchangés après toutes les projections', () => {
  const analysis = song([seg('C', 0, 1.8), seg('D#dim', 1.8, 2, 'passing'), seg('F', 2, 8)]);
  const exporters = [exportAnalysisToJson, exportAnalysisToCsv, exportAnalysisToText, buildAnalysisMidiEvents];
  const before = exporters.map((fn) => JSON.stringify(fn(analysis)));
  for (const tempoMultiplier of [.5, 1, 2]) buildMusicalGrid(analysis, { settings: { tempoMultiplier, beatsPerBar: 3, tempoOverride: 100, downbeatSeconds: 1.3 } });
  const after = exporters.map((fn) => JSON.stringify(fn(analysis)));
  // La date d'export est volontairement omise du contrôle.
  const stripDate = (value) => value.replace(/\d{4}-\d\d-\d\dT[^"\\]+/g, 'DATE');
  assert.deepEqual(after.map(stripDate), before.map(stripDate));
  assert(exportAnalysisToCsv(analysis).includes('D#dim'));
});

test('premier temps retardé : la levée ne décale pas les mesures d’une pulsation', () => {
  const analysis = song([seg('C', 0, 8)]);
  const rhythm = { beatTimes: Array.from({ length: 15 }, (_, i) => .3 + i * .5) };
  const grid = buildMusicalGrid(analysis, { rhythm });
  assert.equal(grid.bars[0].pickup, true);
  assert.equal(grid.bars[0].number, 0);
  assert.equal(grid.boundaries[grid.bars[1].from], .3);
  assert.equal(grid.bars[1].number, 1);
  assert.equal(grid.boundaries[grid.bars[2].from], 2.3);
});

test('un décalage fin traversant zéro conserve la phase de toutes les mesures', () => {
  const analysis = song([seg('C', 0, 8)]);
  const grid = buildMusicalGrid(analysis, { settings: { offsetSeconds: .1 } });
  assert.equal(grid.boundaries[grid.bars[1].from], .1);
  assert.equal(grid.boundaries[grid.bars[2].from], 2.1);
  const earlier = buildMusicalGrid(analysis, { settings: { offsetSeconds: -.1 } });
  assert.equal(earlier.boundaries[earlier.bars[1].from], 1.9);
});

test('premier temps de mesure détecté : la barre de mesure s’y place sans réglage', () => {
  // Pulsations à 120 BPM dont la mesure commence au 3e temps (1 s), comme le relevé
  // réel de « You are Yahweh » où le pic tombait sur le temps 3.
  const analysis = song([seg('C', 0, 8)]);
  const beatTimes = Array.from({ length: 16 }, (_, i) => i * 0.5);
  const rhythm = { version: DISPLAY_RHYTHM_VERSION, source: 'beat-this', sourceTempo: 120, tempo: 120, duration: 8, beatTimes, downbeatTimes: [1, 3, 5, 7] };
  const premiere = (options) => buildMusicalGrid(analysis, { rhythm, ...options }).bars[0];
  // Deux temps de levée avant la première mesure pleine : la grille a vu le repère.
  const cale = premiere();
  assert.equal(cale.pickup, true); assert.equal(cale.to - cale.from, 2);
  // Un repère posé à la main garde la priorité sur la détection.
  const manuel = premiere({ settings: { downbeatSeconds: 0 } });
  assert.equal(manuel.pickup, false); assert.equal(manuel.to - manuel.from, 4);
  // Sans premiers temps détectés (repli librosa), le comportement d'avant est conservé.
  const sans = buildMusicalGrid(analysis, { rhythm: { ...rhythm, source: 'librosa-display', downbeatTimes: [] } }).bars[0];
  assert.equal(sans.pickup, false); assert.equal(sans.to - sans.from, 4);
});

test('mesure irrégulière : les barres suivent les repères au lieu de glisser', () => {
  // Une mesure de 2 temps au milieu (1,5 s → 2,5 s), comme une reprise : une grille
  // régulière décalerait tout ce qui suit, ce que Narcisse voyait sur ses morceaux.
  const analysis = song([seg('C', 0, 8)]);
  const beatTimes = Array.from({ length: 16 }, (_, i) => i * 0.5);
  const rhythm = { version: DISPLAY_RHYTHM_VERSION, source: 'beat-this', sourceTempo: 120, tempo: 120, duration: 8,
    beatTimes, downbeatTimes: [0, 2, 3, 5, 7] };
  const bars = buildMusicalGrid(analysis, { rhythm }).bars;
  // Le repère à 3 s créerait une mesure de 2 temps : ignoré. Ceux à 5 et 7 s sont suivis.
  assert.deepEqual(bars.map((b) => b.from), [0, 4, 10, 14]);
  assert.equal(bars[0].pickup, false);
  // Un réglage manuel reprend la main : retour aux mesures régulières.
  const regle = buildMusicalGrid(analysis, { rhythm, settings: { phase: 1 } }).bars;
  assert.deepEqual(regle.map((b) => b.to - b.from).slice(1, 3), [4, 4]);
});

test('le premier temps choisi dans le lecteur aligne une mesure à cet instant', () => {
  const analysis = song([seg('C', 0, 8)]);
  const grid = buildMusicalGrid(analysis, { settings: { downbeatSeconds: 3.2 } });
  assert(grid.bars.some((bar) => Math.abs(grid.boundaries[bar.from] - 3.2) < 1e-8));
  assert.equal(grid.bars.find((bar) => Math.abs(grid.boundaries[bar.from] - 3.2) < 1e-8).to - grid.bars.find((bar) => Math.abs(grid.boundaries[bar.from] - 3.2) < 1e-8).from, 4);
});

test('BPM corrigé : nouvelle pulsation sans changement du moteur ni des exports', () => {
  const analysis = song([seg('C', 0, 8)]), before = structuredClone(analysis);
  const grid = buildMusicalGrid(analysis, { settings: { tempoOverride: 100 } });
  assert.equal(grid.tempo, 100); assert.equal(grid.boundaries[1], .6);
  const stored = buildProjectData({ path: '/audio.wav' }, analysis.chords, {}, analysis,
    { settings: { tempoOverride: 100, downbeatSeconds: 1.3 } });
  const restored = readGridView(stored, analysis);
  assert.equal(restored.settings.tempoOverride, 100); assert.equal(restored.settings.downbeatSeconds, 1.3);
  assert.equal(stored.analysis.tempo, 120); assert.deepEqual(analysis, before);
});

test('ancien calage instable invalidé sans perdre les réglages utilisateur', () => {
  const analysis = song([seg('C', 0, 8)]);
  const project = { display: { chordGrid: { settings: { tempoMultiplier: .5, offsetSeconds: .15 }, rhythm: {
    version: 1, source: 'audio-display', sourceTempo: 120, duration: 8, beatTimes: [0, .5, 1],
  } } } };
  const loaded = readGridView(project, analysis);
  assert.equal(loaded.rhythm, null); assert.equal(loaded.settings.tempoMultiplier, .5);
  assert.equal(loaded.settings.offsetSeconds, .15);
});

test('contrôles Corriger : BPM explicite à ×1, ancrage exact, changement de phase sans conflit', () => {
  const ui = readFileSync(new URL('../ui/analyzer-tab.js', import.meta.url), 'utf8');
  const start = ui.indexOf('function bindMusicalGrid('), body = ui.slice(start, ui.indexOf('\n}\n', start) + 3);
  const els = Object.fromEntries(['musicalGrid', 'gridBpm', 'gridAlign', 'gridHalf', 'gridDouble', 'gridSignature', 'gridPhase', 'gridOffset', 'gridReset']
    .map((key) => [key, { listeners: {}, addEventListener(type, fn) { this.listeners[type] = fn; } }]));
  const context = vm.createContext({
    els, gridSettings: normalizeGridSettings({ tempoMultiplier: .5, downbeatSeconds: 1.25 }),
    currentAnalysis: { tempo: 123, timeSignature: '4/4', chords: [] },
    currentPlayer: { getCurrentTime: () => 3.761633 },
    normalizeGridSettings, createMusicalGridView: () => ({ update() {} }),
    gridRhythm: null, gridRhythmRequest: null, gridRhythmAnalysis: null,
    syncGridSettings() {}, renderMusicalGrid() {}, ensureGridRhythm() {}, markDirty() {}, window: {},
  });
  vm.runInContext(body, context); context.bindMusicalGrid();
  Object.assign(els.gridBpm, { value: '120', valueAsNumber: 120, validity: { valid: true } });
  els.gridBpm.listeners.change();
  assert.equal(context.gridSettings.tempoOverride, 120);
  assert.equal(context.gridSettings.tempoMultiplier, 1);
  assert.equal(context.gridSettings.downbeatSeconds, 1.25);
  els.gridAlign.listeners.click();
  assert.equal(context.gridSettings.downbeatSeconds, 3.761633);
  els.gridPhase.value = '1'; els.gridPhase.listeners.change();
  assert.equal(context.gridSettings.phase, 1);
  assert.equal(context.gridSettings.downbeatSeconds, null);
  assert.equal(context.currentAnalysis.tempo, 123);
});

for (const name of ['sanogo', 'seigneur', 'anges']) test(`${name} : corpus réel, couverture, fusion, répétitions et immutabilité`, () => {
  const { analysis, rhythm } = JSON.parse(readFileSync(new URL(`./fixtures/${name}-musical-grid.json`, import.meta.url)));
  const before = structuredClone(analysis); const grid = buildMusicalGrid(analysis, { rhythm });
  assert.equal(grid.boundaries.at(-1), analysis.duration);
  assert.equal(rhythm.version, DISPLAY_RHYTHM_VERSION);
  assert(readGridView({ display: { chordGrid: { rhythm } } }, analysis).rhythm);
  assert.equal(grid.estimated, false); assert(grid.bars.every((b) => b.cells.length <= 2));
  assert(grid.rows.every((r) => r.bars.length <= 4));
  assert(new Set(grid.sections.map((s) => s.id)).size < grid.rows.length);
  assert(grid.rows.flatMap((r) => r.cells).filter((c) => !c.continued).length <= analysis.chords.length + 1);
  const half = buildMusicalGrid(analysis, { rhythm, settings: { tempoMultiplier: .5 } });
  assert(half.rows.length <= Math.ceil(grid.rows.length / 2) + 1);
  assert.deepEqual(analysis, before);
  console.log(`${name}: ${analysis.chords.length} événements → ${grid.rows.length} lignes (${half.rows.length} à ÷2), ${grid.sections.length} blocs`);
});
