/**
 * Tests de non-régression — Persistance du résultat d'analyse (DoD niveau 6).
 *
 * Exigence : fermer l'application, la rouvrir, sélectionner le morceau, et
 * retrouver analyse, accords, tonalité et corrections **sans relancer
 * l'analyse**.
 *
 * Ces tests vérifient le câblage de bout en bout — IPC, flux d'ouverture,
 * enregistrement automatique, porte de sortie manuelle. La logique pure du
 * schéma est testée dans test-chord-editor.js (Phase C).
 *
 * Usage : node src/ui/test-analysis-persistence.js
 */

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, '../..');

const read = (rel) => readFileSync(resolve(projectRoot, rel), 'utf-8');

let failures = 0;

function assert(condition, message) {
  if (!condition) {
    console.error(`  ❌ ${message}`);
    failures++;
  } else {
    console.log(`  ✅ ${message}`);
  }
}

function runTest(name, fn) {
  console.log(`\n📋 ${name}`);
  try {
    fn();
  } catch (err) {
    console.error(`  ❌ Exception: ${err.message}`);
    failures++;
  }
}

// ── A. Le rechargement dispose d'un chemin qui n'analyse pas ──

runTest("A. IPC — un canal prépare la lecture sans lancer d'analyse", () => {
  const main = read('electron/main.js');
  assert(
    main.includes("ipcMain.handle('analyzer:prepare-playback'"),
    "l'IPC analyzer:prepare-playback existe",
  );
  const start = main.indexOf("ipcMain.handle('analyzer:prepare-playback'");
  const body = main.slice(start, main.indexOf("ipcMain.handle('analyzer:process-file'", start));
  assert(
    !body.includes('analyze-chords'),
    "prepare-playback n'appelle pas analyze-chords : c'est tout l'intérêt",
  );
  assert(
    body.includes('extractTrackAudio'),
    'prepare-playback régénère bien le WAV de lecture',
  );

  const preload = read('electron/preload.cjs');
  assert(
    preload.includes("preparePlayback:") && preload.includes("'analyzer:prepare-playback'"),
    'le preload expose analyzer.preparePlayback au renderer',
  );
});

// ── B. Le flux d'ouverture tente la restauration avant l'écran de préparation ──

runTest("B. Flux — une source déjà analysée court-circuite l'écran de préparation", () => {
  const js = read('src/ui/analyzer-tab.js');
  const start = js.indexOf('async function loadAnalysisSource(');
  assert(start > 0, 'loadAnalysisSource est asynchrone');
  const body = js.slice(start, js.indexOf('\n}\n', start));
  const restoreAt = body.indexOf('restoreSavedAnalysis');
  const resolveAt = body.indexOf('resolveAnalysisState');
  assert(restoreAt > 0, 'loadAnalysisSource tente la restauration');
  assert(
    restoreAt < resolveAt,
    "la restauration est tentée AVANT de router vers l'écran de préparation",
  );
});

runTest('B. Flux — la restauration échoue silencieusement vers le flux normal', () => {
  const js = read('src/ui/analyzer-tab.js');
  const start = js.indexOf('async function restoreSavedAnalysis(');
  assert(start > 0, 'restoreSavedAnalysis existe');
  const body = js.slice(start, js.indexOf('\n}\n', start));
  assert(body.includes('try {') && body.includes('catch'), 'la restauration est protégée');
  assert(
    (body.match(/return false/g) || []).length >= 4,
    'chaque anomalie retombe sur le flux normal plutôt que de bloquer',
  );
  assert(
    body.includes('validateProjectSchema'),
    'le projet est validé avant usage',
  );
  assert(
    body.includes('verifyAudioIdentity'),
    "un fichier audio modifié depuis l'analyse n'est pas restauré",
  );
});

// ── C. Le cache est effectivement alimenté ──

runTest("C. Cache — une analyse fraîche est enregistrée sans intervention", () => {
  const js = read('src/ui/analyzer-tab.js');
  assert(
    /saveProject\(\{ silent: true \}\)/.test(js),
    'showResults déclenche un enregistrement silencieux',
  );
  const start = js.indexOf('if (!analysis.restoredFromProject) {');
  assert(
    start > 0,
    "l'enregistrement automatique ne se déclenche que sur une analyse fraîche",
  );
  const loadAt = js.indexOf('await loadProjectIfExists()');
  assert(
    loadAt > 0 && loadAt < start,
    "l'enregistrement a lieu après la relecture des corrections, jamais avant",
  );
});

runTest('C. Cache — saveProject sait rester silencieux', () => {
  const js = read('src/ui/analyzer-tab.js');
  assert(
    js.includes('async function saveProject({ silent = false } = {}) {'),
    'saveProject accepte un mode silencieux',
  );
  assert(
    js.includes('if (!silent) showToast'),
    "le mode silencieux n'affiche pas de message d'erreur intempestif",
  );
});

// ── D. L'utilisateur garde la main et comprend ce qu'il voit ──

runTest("D. Interface — une porte de sortie permet de recalculer", () => {
  const html = read('src/index.html');
  assert(html.includes('analyzer-reanalyze-btn'), 'le bouton « Relancer l’analyse » existe');

  const js = read('src/ui/analyzer-tab.js');
  assert(js.includes('function reanalyzeCurrentTrack('), 'reanalyzeCurrentTrack existe');
  assert(
    js.includes("els.reanalyzeBtn?.addEventListener('click'"),
    'le bouton est câblé',
  );
  const start = js.indexOf('async function reanalyzeCurrentTrack(');
  const body = js.slice(start, js.indexOf('\n}\n', start));
  assert(
    body.includes('manualOverride') && body.includes('confirm'),
    'recalculer avec des corrections en cours demande confirmation',
  );
});

runTest("D. Interface — l'origine du résultat est visible", () => {
  const html = read('src/index.html');
  assert(html.includes('analyzer-cached-badge'), 'un badge signale une analyse relue');

  const js = read('src/ui/analyzer-tab.js');
  assert(
    js.includes('analysis.restoredFromProject ?'),
    'le badge reflète réellement l’origine du résultat',
  );
});

// ── E. Compatibilité ascendante ──

runTest('E. Compatibilité — les deux versions de schéma sont acceptées', () => {
  const editor = read('src/ui/chord-editor.js');
  assert(
    editor.includes('SUPPORTED_PROJECT_SCHEMA_VERSIONS = [1, 2]'),
    'les projets en schéma 1 restent lisibles',
  );
  assert(
    editor.includes('PROJECT_SCHEMA_VERSION = 2'),
    'les nouveaux projets sont écrits en schéma 2',
  );
});

// ── Bilan ──

console.log('\n' + '='.repeat(50));
if (failures === 0) {
  console.log('✅ Tous les tests de persistance de l’analyse sont passés.');
  process.exit(0);
} else {
  console.error(`❌ ${failures} test(s) en échec.`);
  process.exit(1);
}
