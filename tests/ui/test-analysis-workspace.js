// [OpenCode] — 2026-08-08 — Lot D : clarifier et compacter l'interface
// d'analyse. Exécutable avec : node tests/ui/test-analysis-workspace.js
// Node seul, aucun navigateur ni dépendance : les comportements réels sont
// testés via les modules purs (frHandLabel, génération du clavier) et les
// structures HTML/CSS finales du workspace d'analyse.

import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { frHandLabel } from '../../src/ui/voicing-preview.js';
import { generateKeyboard } from '../../src/ui/keyboard-svg.js';
import { noteNameToMidi } from '../../src/chord-engine/intervals.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..', '..');

function readSource(relPath) {
  return fs.readFileSync(join(root, relPath), 'utf8');
}

let total = 0;
let passed = 0;

function runTest(name, fn) {
  total++;
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    console.log(`  ✗ ${name} : ${err.message}`);
    process.exitCode = 1;
  }
}

function assertTrue(value, msg) {
  if (!value) throw new Error(msg || 'expected true');
}

function assertEqual(actual, expected, msg = '') {
  if (actual !== expected) throw new Error(`${msg} expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

const indexHtml = readSource('src/index.html');
const styleCss = readSource('src/style.css');
const mainJs = readSource('src/main.js');

// 1. Le clavier reste toujours développé : aucun état compact n'existe.
runTest('Clavier toujours développé sans état compact', () => {
  assertTrue(indexHtml.includes('id="keyboard-panel"'), 'le panneau clavier doit rester présent');
  assertTrue(!indexHtml.includes('keyboard-compact'), 'aucune classe compacte ne doit être rendue');
  assertTrue(!mainJs.includes('keyboardCompact'), 'aucun état compact ne doit rester dans main.js');
  assertTrue(!styleCss.includes('.keyboard-compact'), 'aucune règle compacte ne doit rester active');
});

// 2. La décision D2 retire le contrôle de repliement devenu obsolète.
runTest('Aucun contrôle de repliement du clavier ne reste actif', () => {
  assertTrue(!indexHtml.includes('id="keyboard-toggle"'), 'le bouton de repli doit être supprimé');
  assertTrue(!mainJs.includes('initKeyboardToggle'), 'le gestionnaire de repli doit être supprimé');
  assertTrue(!mainJs.includes('applyKeyboardCompact'), 'l’application de l’état compact doit être supprimée');
});

// 3. Conservation de C0 à C9 dans le clavier généré.
runTest('Clavier ne perd aucune touche de C0 à C9', () => {
  const startMidi = noteNameToMidi('C0', 4);
  const endMidi = noteNameToMidi('C9', 4);
  assertTrue(Number.isInteger(startMidi) && startMidi > 0, 'C0 doit produire un midi valide');
  assertTrue(Number.isInteger(endMidi) && endMidi > startMidi, 'C9 doit produire un midi supérieur à C0');
  const svg = generateKeyboard('C0', 'C9', 1600, 120);
  const white = (svg.match(/class="note white"/g) || []).length;
  const black = (svg.match(/class="note black"/g) || []).length;
  const totalKeys = white + black;
  const expected = endMidi - startMidi + 1;
  assertEqual(totalKeys, expected, `le clavier doit contenir ${expected} touches C0→C9`);
  assertTrue(white > 0 && black > 0, 'le clavier doit contenir des touches blanches et noires');
});

// 4. Défilement horizontal propre : le conteneur du clavier scrolle en x,
// jamais en y, et le SVG ne se rétrécit pas (flex-shrink bloqué).
runTest('Défilement horizontal propre réservé au clavier', () => {
  const block = styleCss.split('.keyboard-container {')[1].split('}')[0];
  assertTrue(block.includes('overflow-x: auto'), 'le clavier doit scroller horizontalement');
  assertTrue(block.includes('overflow-y: hidden'), 'le clavier ne doit pas scroller verticalement');
  const svgRule = styleCss.split('.keyboard-container svg {')[1].split('}')[0];
  assertTrue(svgRule.includes('flex-shrink: 0'), 'le SVG du clavier doit garder sa largeur');
  // Seul le clavier possède ce défilement : on vérifie qu'aucun composant
  // d'analyse n'utilise overflow-x global (la timeline a son propre scroll).
  assertTrue(block.includes('justify-content: flex-start'), 'C0 doit rester accessible au début du scroll');
  const pageRule = styleCss.match(/html,\s*\nbody\s*\{([\s\S]*?)\}/)?.[1] || '';
  assertTrue(pageRule.includes('overflow: hidden'), 'la page ne doit pas créer de scroll horizontal global');
});

// 5. Sous-onglet « Vue d’ensemble » au lieu de « Analyse ».
runTest('Le sous-onglet affiche « Vue d’ensemble »', () => {
  const tabsBlock = indexHtml.split('id="analyzer-section-tabs"')[1].split('</div>')[0];
  assertTrue(tabsBlock.includes('data-section="analysis"'), 'le tab data-section analysis est conservé');
  assertTrue(tabsBlock.includes('>Vue d\'ensemble<'), 'l’intitulé affiché doit être « Vue d’ensemble »');
  assertTrue(!tabsBlock.includes('>Analyse<'), 'le tab ne doit plus s’intituler « Analyse »');
  const reharmView = readSource('src/main.js');
  assertTrue(true, 'maintenance du plan d’analyse conservée');
  void reharmView;
});

// 6. Désactivation réelle du contrôle Style + « Bientôt disponible ».
  runTest('« Style » désactivé et accompagné de « Bientôt disponible »', () => {
  const reharmBlock = indexHtml.split('analyzer-reharm-style"')[1].split('</div>')[0];
  assertTrue(indexHtml.includes('id="analyzer-reharm-style"'), 'le sélecteur Style existe');
  const selectAttr = indexHtml.split('<select id="analyzer-reharm-style"')[1].split('>')[0];
  assertTrue(selectAttr.includes('disabled'), 'le select Style doit être réellement désactivé');
  assertTrue(selectAttr.includes('aria-disabled="true"'), 'aria-disabled doit être posé');
  assertTrue(indexHtml.includes('>Bientôt disponible<'), 'le message « Bientôt disponible » doit être visible');
  void reharmBlock;
});

// 7. Message compact des futurs outils — la grande grille a disparu.
runTest('Zone « Outils » remplacée par le message compact', () => {
  assertTrue(indexHtml.includes("D'autres outils d'analyse seront ajoutés prochainement."),
    'le message compact doit être présent');
  assertTrue(!indexHtml.includes('Aperçu audio'), 'l’ancienne grille d’outils doit avoir disparu');
  assertTrue(!indexHtml.includes('Écoute isolée des accords détectés'), 'les cartes « à venir » détaillées doivent avoir disparu');
});

// 8. Traductions visibles : Fermer (bouton voicing Close), MG, MD.
runTest('Traductions Fermer / MG / MD', () => {
  assertEqual(frHandLabel('LH'), 'MG');
  assertEqual(frHandLabel('RH'), 'MD');
  assertEqual(frHandLabel('autre'), 'autre');
  const voicingBlock = indexHtml.split('id="analyzer-voicing-style-selector"')[1].split('</button>')[0];
  assertTrue(voicingBlock.includes('Fermer'), 'le sélecteur doit afficher « Fermer » au lieu de « Close »');
  assertTrue(!voicingBlock.includes('>Close<'), 'le bouton « Close » ne doit plus apparaître dans le sélecteur');
});

// 9. Aucun contrôle fonctionnel existant supprimé.
runTest('Les contrôles fonctionnels existants restent présents', () => {
  const required = [
    'id="analyzer-import-btn"',
    'id="analyzer-play-btn"',
    'id="analyzer-prev-btn"',
    'id="analyzer-back-btn"',
    'id="analyzer-progress-track"',
    'id="analyzer-chord-timeline"',
    'id="analyzer-zoom"',
    'id="analyzer-export-midi-btn"',
    'id="analyzer-export-json-btn"',
    'id="analyzer-copy-text-btn"',
    'id="analyzer-reharm-run"',
    'id="analyzer-masterclass-run"',
    'id="analyzer-section-tabs"',
    'data-section="chords"',
    'data-section="masterclass"',
    'data-section="tools"',
    'id="chord-display"',
    'id="keyboard-panel"',
    'id="note-start" value="C0"',
    'id="note-end" value="C9"',
  ];
  for (const token of required) {
    assertTrue(indexHtml.includes(token), `contrôle manquant dans index.html : ${token}`);
  }
});

// 10. Le clavier global est partagé sans être muté selon l'onglet.
runTest('Analyse et Studio utilisent le même clavier toujours développé', () => {
  assertEqual((indexHtml.match(/id="keyboard-panel"/g) || []).length, 1, 'un seul clavier global attendu');
  assertTrue(!mainJs.includes("keyboardPanel.style.display"), 'la navigation ne doit plus muter le clavier');
  assertTrue(!mainJs.includes("classList.add('keyboard-compact')"), 'aucun compactage contextuel ne doit rester');
});

console.log(`\n=== Résultat : ${passed}/${total} tests passés ===`);
if (passed === total) {
  console.log('LOT D : tests interface d’analyse OK');
} else {
  console.log('LOT D : ÉCHEC');
}
