/**
 * Tests de non-régression — Séparation HOME / RESULTS dans l'onglet Analyse.
 *
 * Vérifie que :
 *   A. Le CSS ne contient pas de règle qui force l'affichage de RESULTS hors état actif.
 *   B. La structure HTML sépare correctement les conteneurs HOME et RESULTS.
 *   C. La fonction setAnalyzerState() gère correctement les classes 'active'.
 *   D. resetAnalysisSession() ramène proprement à HOME.
 *
 * Usage : node src/ui/test-home-results-separation.js
 */

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, '../..');

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

// ── A. Vérification CSS ──

runTest('A. CSS — .analyzer-analysis-view ne force pas display:flex', () => {
  const cssPath = resolve(projectRoot, 'src/ui/components/analyzer-workspace.css');
  const css = readFileSync(cssPath, 'utf-8');

  // Extraire le bloc .analyzer-analysis-view
  const match = css.match(/\.analyzer-analysis-view\s*\{([^}]+)\}/s);
  assert(match !== null, 'La règle .analyzer-analysis-view existe');

  const block = match[1];
  const hasDisplayFlex = /\bdisplay\s*:\s*flex\b/.test(block);
  assert(!hasDisplayFlex, '.analyzer-analysis-view ne contient PAS display: flex');
});

runTest('A. CSS — .analyzer-state cache par défaut', () => {
  const cssPath = resolve(projectRoot, 'src/ui/components/analyzer-workspace.css');
  const css = readFileSync(cssPath, 'utf-8');

  const match = css.match(/\.analyzer-state\s*\{([^}]+)\}/s);
  assert(match !== null, 'La règle .analyzer-state existe');

  const block = match[1];
  const hasDisplayNone = /\bdisplay\s*:\s*none\b/.test(block);
  assert(hasDisplayNone, '.analyzer-state contient display: none');
});

runTest('A. CSS — .analyzer-state.active affiche en flex', () => {
  const cssPath = resolve(projectRoot, 'src/ui/components/analyzer-workspace.css');
  const css = readFileSync(cssPath, 'utf-8');

  const match = css.match(/\.analyzer-state\.active\s*\{([^}]+)\}/s);
  assert(match !== null, 'La règle .analyzer-state.active existe');

  const block = match[1];
  const hasDisplayFlex = /\bdisplay\s*:\s*flex\b/.test(block);
  assert(hasDisplayFlex, '.analyzer-state.active contient display: flex');
});

// ── B. Vérification HTML ──

runTest('B. HTML — #analyzer-results a la classe analyzer-state', () => {
  const htmlPath = resolve(projectRoot, 'src/index.html');
  const html = readFileSync(htmlPath, 'utf-8');

  const match = html.match(/<div[^>]*\bid="analyzer-results"[^>]*>/);
  assert(match !== null, '#analyzer-results existe dans le HTML');

  const tag = match[0];
  const hasAnalyzerState = /\banalyzer-state\b/.test(tag);
  assert(hasAnalyzerState, '#analyzer-results a la classe analyzer-state');
});

runTest('B. HTML — #analyzer-import-screen a la classe analyzer-state', () => {
  const htmlPath = resolve(projectRoot, 'src/index.html');
  const html = readFileSync(htmlPath, 'utf-8');

  const match = html.match(/<div[^>]*\bid="analyzer-import-screen"[^>]*>/);
  assert(match !== null, '#analyzer-import-screen existe dans le HTML');

  const tag = match[0];
  const hasAnalyzerState = /\banalyzer-state\b/.test(tag);
  assert(hasAnalyzerState, '#analyzer-import-screen a la classe analyzer-state');
});

runTest('B. HTML — #analyzer-results contient la timeline', () => {
  const htmlPath = resolve(projectRoot, 'src/index.html');
  const html = readFileSync(htmlPath, 'utf-8');

  // Extraire le contenu entre #analyzer-results et la fermeture du div suivant
  const resultsSection = html.match(/<div[^>]*\bid="analyzer-results"[^>]*>([\s\S]*?)(?=<div[^>]*\bid="analyzer-processing")/);
  assert(resultsSection !== null, 'Contenu de #analyzer-results trouvé');

  const content = resultsSection[1];
  assert(content.includes('analyzer-chord-timeline'), 'La timeline est dans #analyzer-results');
  assert(content.includes('analyzer-section-tabs'), 'Les onglets sont dans #analyzer-results');
  assert(content.includes('analyzer-transport-bar'), 'La barre de transport est dans #analyzer-results');
  assert(content.includes('analyzer-analysis-header'), 'Le header analyse est dans #analyzer-results');
});

runTest('B. HTML — #analyzer-import-screen contient les cartes d\'import', () => {
  const htmlPath = resolve(projectRoot, 'src/index.html');
  const html = readFileSync(htmlPath, 'utf-8');

  const importSection = html.match(/<div[^>]*\bid="analyzer-import-screen"[^>]*>([\s\S]*?)(?=<div[^>]*\bid="analyzer-state-prepare")/);
  assert(importSection !== null, 'Contenu de #analyzer-import-screen trouvé');

  const content = importSection[1];
  assert(content.includes('analyzer-import-audio-btn'), 'Bouton Audio présent');
  assert(content.includes('analyzer-import-video-btn'), 'Bouton Vidéo présent');
  assert(content.includes('analyzer-import-midi-btn'), 'Bouton MIDI présent');
  assert(content.includes('analyzer-library-list'), 'Bibliothèque présente');
});

// ── C. Vérification JS — setAnalyzerState ──

runTest('C. JS — setAnalyzerState gère tous les états', () => {
  const jsPath = resolve(projectRoot, 'src/ui/analyzer-tab.js');
  const js = readFileSync(jsPath, 'utf-8');

  // Vérifier que setAnalyzerState supprime 'active' de tous les conteneurs
  assert(js.includes("els.importScreen?.classList.remove('active')"), 'Supprime active de importScreen');
  assert(js.includes("els.statePrepare?.classList.remove('active')"), 'Supprime active de statePrepare');
  assert(js.includes("els.stateVideoType?.classList.remove('active')"), 'Supprime active de stateVideoType');
  assert(js.includes("els.stateMidiRecord?.classList.remove('active')"), 'Supprime active de stateMidiRecord');
  assert(js.includes("els.stateResults?.classList.remove('active')"), 'Supprime active de stateResults');
  assert(js.includes("els.results?.classList.remove('active')"), 'Supprime active de results (vue analyse)');
});

runTest('C. JS — setAnalyzerState("import") active importScreen', () => {
  const jsPath = resolve(projectRoot, 'src/ui/analyzer-tab.js');
  const js = readFileSync(jsPath, 'utf-8');

  // Vérifier le case 'import'
  const setAnalyzerStateFn = js.match(/function setAnalyzerState\(state\)\s*\{([\s\S]*?)\n\}/);
  assert(setAnalyzerStateFn !== null, 'Fonction setAnalyzerState trouvée');

  const body = setAnalyzerStateFn[1];
  assert(body.includes("case 'import':"), "Case 'import' existe");
  assert(body.includes("els.importScreen?.classList.add('active')"), "Ajoute active à importScreen pour l'état import");
});

runTest('C. JS — setAnalyzerState("analysis") active results', () => {
  const jsPath = resolve(projectRoot, 'src/ui/analyzer-tab.js');
  const js = readFileSync(jsPath, 'utf-8');

  const setAnalyzerStateFn = js.match(/function setAnalyzerState\(state\)\s*\{([\s\S]*?)\n\}/);
  assert(setAnalyzerStateFn !== null, 'Fonction setAnalyzerState trouvée');

  const body = setAnalyzerStateFn[1];
  assert(body.includes("case 'analysis':"), "Case 'analysis' existe");
  assert(body.includes("els.results?.classList.add('active')"), "Ajoute active à results pour l'état analysis");
});

// ── D. Vérification JS — resetAnalysisSession ──

runTest('D. JS — resetAnalysisSession appelle setAnalyzerState("import")', () => {
  const jsPath = resolve(projectRoot, 'src/ui/analyzer-tab.js');
  const js = readFileSync(jsPath, 'utf-8');

  const resetFn = js.match(/export function resetAnalysisSession\(\)\s*\{([\s\S]*?)\n\}/);
  assert(resetFn !== null, 'Fonction resetAnalysisSession trouvée');

  const body = resetFn[1];
  assert(body.includes("setAnalyzerState('import')"), "resetAnalysisSession appelle setAnalyzerState('import')");
  assert(body.includes('currentAnalysis = null'), 'resetAnalysisSession réinitialise currentAnalysis');
  assert(body.includes('currentPlayer.destroy()'), 'resetAnalysisSession détruit le player');
});

// ── Résultat ──

console.log(`\n${'='.repeat(50)}`);
if (failures === 0) {
  console.log('✅ Tous les tests de séparation HOME/RESULTS sont passés.');
} else {
  console.error(`❌ ${failures} test(s) en échec.`);
  process.exitCode = 1;
}
