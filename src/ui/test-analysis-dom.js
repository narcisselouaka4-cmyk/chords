// [OpenCode] — Test de contrat DOM pour l'onglet Analyse.
// Vérifie que les éléments DOM et le CSS sont cohérents avec la machine d'état.
// Ne nécessite pas jsdom : parse le HTML et le CSS comme texte.
//
// Contrairement aux tests workflow (logique pure), ce test vérifie le contrat
// runtime réel : pas de style inline qui écraserait les classes CSS.

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, '..', '..');

function readText(relPath) {
  return readFileSync(resolve(projectRoot, relPath), 'utf-8');
}

// ── Test 1 : Aucun analyzer-state ne doit avoir de style inline display:none ──
function testNoInlineDisplayNone() {
  const html = readText('src/index.html');
  // Cherche les divs analyzer-state avec style="display: none" (ou variantes)
  const pattern = /<div\b[^>]*\bclass="[^"]*\banalyzer-state\b[^"]*"[^>]*\bstyle="[^"]*\bdisplay:\s*none[^"]*"/gi;
  const matches = html.match(pattern) || [];
  if (matches.length > 0) {
    console.error(`❌ DOM — ${matches.length} analyzer-state avec style="display:none" inline trouvé(s) :`);
    for (const m of matches) {
      const idMatch = m.match(/id="([^"]+)"/);
      console.error(`   → ${idMatch ? idMatch[1] : '(sans id)'}`);
    }
    process.exit(1);
  }
  console.log('✅ DOM — Aucun analyzer-state avec style="display:none" inline');
}

// ── Test 2 : Le CSS doit avoir .analyzer-state { display: none } et .active { display: flex } ──
function testCssRules() {
  const css = readText('src/ui/components/analyzer-workspace.css');

  // Vérifie la règle de base
  if (!/\.analyzer-state\s*\{[^}]*display:\s*none/.test(css)) {
    console.error('❌ CSS — Règle .analyzer-state { display: none } absente');
    process.exit(1);
  }
  console.log('✅ CSS — Règle .analyzer-state { display: none } présente');

  // Vérifie la règle active
  if (!/\.analyzer-state\.active\s*\{[^}]*display:\s*flex/.test(css)) {
    console.error('❌ CSS — Règle .analyzer-state.active { display: flex } absente');
    process.exit(1);
  }
  console.log('✅ CSS — Règle .analyzer-state.active { display: flex } présente');
}

// ── Test 3 : Tous les IDs référencés dans setAnalyzerState existent dans le HTML ──
function testStateElementIds() {
  const html = readText('src/index.html');

  const requiredIds = [
    'analyzer-import-screen',
    'analyzer-state-prepare',
    'analyzer-state-video-type',
    'analyzer-state-midi-record',
    'analyzer-state-results',
    'analyzer-results',
  ];

  for (const id of requiredIds) {
    if (!html.includes(`id="${id}"`)) {
      console.error(`❌ DOM — ID "${id}" référencé par setAnalyzerState introuvable dans index.html`);
      process.exit(1);
    }
  }
  console.log('✅ DOM — Tous les IDs de setAnalyzerState existent dans index.html');
}

// ── Test 4 : Les IDs de la sidebar (Flux d'analyse) existent ──
function testSidebarIds() {
  const html = readText('src/index.html');
  const flowIds = ['analyzer-flow-import', 'analyzer-flow-detect', 'analyzer-flow-launch'];
  for (const id of flowIds) {
    if (!html.includes(`id="${id}"`)) {
      console.error(`❌ DOM — ID sidebar "${id}" introuvable`);
      process.exit(1);
    }
  }
  console.log('✅ DOM — IDs sidebar Flux d\'analyse présents');
}

// ── Test 5 : Contrat de mapping état → élément DOM ──
function testStateMapping() {
  // Vérifie que le mapping dans setAnalyzerState est cohérent
  const mapping = {
    'import': 'analyzer-import-screen',
    'prepare': 'analyzer-state-prepare',
    'video-type': 'analyzer-state-video-type',
    'midi-record': 'analyzer-state-midi-record',
    'results': 'analyzer-state-results',
    'analysis': 'analyzer-results',
  };

  const html = readText('src/index.html');

  for (const [state, elementId] of Object.entries(mapping)) {
    if (!html.includes(`id="${elementId}"`)) {
      console.error(`❌ Mapping — état "${state}" → #${elementId} : élément absent du DOM`);
      process.exit(1);
    }
    // Vérifie que l'élément a bien la classe analyzer-state (ordre attributs indifférent)
    const elSection = html.slice(html.indexOf(`id="${elementId}"`) - 200, html.indexOf(`id="${elementId}"`) + 200);
    if (!/\bclass="[^"]*\banalyzer-state\b[^"]*"/.test(elSection)) {
      console.error(`❌ Mapping — #${elementId} n'a pas la classe analyzer-state`);
      process.exit(1);
    }
  }
  console.log('✅ Mapping — Chaque état correspond à un élément analyzer-state dans le DOM');
}

// ── Exécution ──
console.log('=== Tests contrat DOM Analyse ===\n');
testNoInlineDisplayNone();
testCssRules();
testStateElementIds();
testSidebarIds();
testStateMapping();
console.log('\n✅ Tous les tests DOM Analyse passent.');
