// [OpenCode] — 2026-08-08 — Lot D2 : navigation stable, clavier permanent,
// état vide Studio et fond initial sombre. Exécutable avec Node seul.

import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { applyTabVisibility } from '../../src/ui/tab-visibility.js';
import { applyStudioSidebarState } from '../../src/ui/studio-view-state.js';
import { generateKeyboard } from '../../src/ui/keyboard-svg.js';
import { noteNameToMidi } from '../../src/chord-engine/intervals.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..', '..');
const readSource = (path) => fs.readFileSync(join(root, path), 'utf8');

const indexHtml = readSource('src/index.html');
const mainJs = readSource('src/main.js');
const styleCss = readSource('src/style.css');
const studioJs = readSource('src/ui/studio-tab.js');
const electronMain = readSource('electron/main.js');

let total = 0;
let passed = 0;

function runTest(name, fn) {
  total++;
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (error) {
    process.exitCode = 1;
    console.log(`  ✗ ${name} : ${error.message}`);
  }
}

function assertTrue(value, message) {
  if (!value) throw new Error(message || 'expected true');
}

function assertEqual(actual, expected, message = '') {
  if (actual !== expected) {
    throw new Error(`${message} expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function createElement(classes = []) {
  const classSet = new Set(classes);
  return {
    disabled: false,
    attributes: {},
    style: {
      display: '',
      width: '',
      removeProperty(name) { this[name] = ''; },
    },
    classList: {
      contains: (name) => classSet.has(name),
      toggle: (name, force) => {
        if (force) classSet.add(name);
        else classSet.delete(name);
      },
    },
    setAttribute(name, value) { this.attributes[name] = String(value); },
  };
}

function createTabs() {
  return {
    practice: createElement(['app-main', 'practice-layout']),
    analysis: createElement(['analysis-root']),
    studio: createElement(['studio-tab', 'stage-0']),
  };
}

function nearestParentIds(html) {
  const parents = new Map();
  const stack = [];
  const voidTags = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
  const tags = /<\/?([a-z][\w:-]*)([^>]*)>/gi;
  let match;
  while ((match = tags.exec(html))) {
    const full = match[0];
    const tag = match[1].toLowerCase();
    if (full.startsWith('</')) {
      for (let i = stack.length - 1; i >= 0; i--) {
        const node = stack.pop();
        if (node.tag === tag) break;
      }
      continue;
    }
    const id = match[2].match(/\bid="([^"]+)"/)?.[1] || null;
    if (id) {
      const parent = [...stack].reverse().find((node) => node.id)?.id || null;
      parents.set(id, parent);
    }
    if (!voidTags.has(tag) && !full.endsWith('/>')) stack.push({ tag, id });
  }
  return parents;
}

runTest('D2.1 — plusieurs cycles Analyse → Entraînement gardent le layout naturel', () => {
  const tabs = createTabs();
  for (let i = 0; i < 4; i++) {
    applyTabVisibility(tabs, 'analysis');
    applyTabVisibility(tabs, 'practice');
  }
  assertEqual(tabs.practice.style.display, '', 'Entraînement ne doit pas garder display:grid inline');
  assertTrue(tabs.practice.classList.contains('practice-layout'), 'la classe propriétaire doit rester intacte');
  assertEqual(tabs.analysis.style.display, 'none', 'Analyse doit être masqué au retour');
});

runTest('D2.2 — plusieurs cycles Studio → Entraînement gardent le layout naturel', () => {
  const tabs = createTabs();
  for (let i = 0; i < 4; i++) {
    applyTabVisibility(tabs, 'studio');
    applyTabVisibility(tabs, 'practice');
  }
  assertEqual(tabs.practice.style.display, '');
  assertEqual(tabs.practice.style.width, '', 'aucune largeur corrective ne doit être injectée');
  assertEqual(tabs.studio.style.display, 'none');
});

runTest('D2.3 — Analyse → Studio → Entraînement nettoie les états de visibilité', () => {
  const tabs = createTabs();
  applyTabVisibility(tabs, 'analysis');
  applyTabVisibility(tabs, 'studio');
  applyTabVisibility(tabs, 'practice');
  assertEqual(tabs.practice.style.display, '');
  assertEqual(tabs.analysis.style.display, 'none');
  assertEqual(tabs.studio.style.display, 'none');
  assertTrue(tabs.studio.classList.contains('stage-0'), 'les classes Studio restent sur leur propre racine');
});

runTest('D2.4 — les contrôles fonctionnels Entraînement restent présents', () => {
  for (const id of ['practice-exercise-panel', 'new-exercise-btn', 'exercise-target', 'pedagogy-panel', 'pedagogy-content']) {
    assertTrue(indexHtml.includes(`id="${id}"`), `contrôle Entraînement manquant : ${id}`);
  }
});

runTest('D2.5 — résultat d’accord et notes restent dans la scène Entraînement', () => {
  const parents = nearestParentIds(indexHtml);
  assertEqual(parents.get('chord-display'), 'practice-center', 'accord déplacé hors de practice-center');
  assertEqual(parents.get('notes-display'), 'practice-center', 'notes déplacées hors de practice-center');
  assertEqual(parents.get('practice-center'), 'practice-tab', 'scène déplacée hors de practice-tab');
});

runTest('D2.6 — le clavier reste développé pendant les changements d’onglet', () => {
  const tabs = createTabs();
  const keyboard = createElement(['keyboard-panel']);
  applyTabVisibility(tabs, 'analysis');
  applyTabVisibility(tabs, 'studio');
  assertTrue(keyboard.classList.contains('keyboard-panel'));
  assertTrue(!keyboard.classList.contains('keyboard-compact'), 'le clavier ne doit jamais devenir compact');
  assertEqual(keyboard.style.display, '', 'la navigation ne doit pas masquer ou redimensionner le clavier');
});

runTest('D2.7 — aucun contrôle ou gestionnaire de repli clavier ne subsiste', () => {
  assertTrue(!indexHtml.includes('id="keyboard-toggle"'), 'bouton obsolète présent');
  assertTrue(!mainJs.includes('keyboardCompact'), 'état obsolète présent');
  assertTrue(!mainJs.includes('initKeyboardToggle'), 'gestionnaire obsolète présent');
  assertTrue(!styleCss.includes('.keyboard-compact'), 'CSS obsolète présent');
});

runTest('D2.8 — le clavier garde C0–C9 et un scroll interne accessible depuis C0', () => {
  const start = noteNameToMidi('C0', 4);
  const end = noteNameToMidi('C9', 4);
  const svg = generateKeyboard('C0', 'C9', 1600, 120);
  const keys = (svg.match(/class="note (?:white|black)"/g) || []).length;
  assertEqual(keys, end - start + 1, 'plage C0–C9 incomplète');
  const keyboardRule = styleCss.split('.keyboard-container {')[1].split('}')[0];
  assertTrue(keyboardRule.includes('overflow-x: auto'), 'scroll horizontal interne manquant');
  assertTrue(keyboardRule.includes('justify-content: flex-start'), 'C0 serait inaccessible dans un débordement centré');
  assertTrue(/html,\s*\nbody\s*\{[\s\S]*?overflow:\s*hidden/.test(styleCss), 'scroll global non contenu');
});

runTest('D2.9 — Studio sans média garde son interface d’import visible', () => {
  const sidebar = createElement(['studio-sidebar', 'left', 'collapsed']);
  const collapseButton = createElement();
  const expandButton = createElement();
  const collapsed = applyStudioSidebarState({ sidebar, collapseButton, expandButton }, 0, true);
  assertEqual(collapsed, false, 'le panneau vide ne peut pas rester replié');
  assertTrue(!sidebar.classList.contains('collapsed'), 'classe collapsed non nettoyée');
  assertEqual(collapseButton.disabled, true, 'le repli doit être désactivé en étape 0');
  assertTrue(indexHtml.includes('class="studio-tab stage-0"'), 'Studio doit démarrer explicitement en étape 0');
  assertTrue(indexHtml.includes('id="studio-import-btn"'), 'action d’import absente');
  assertTrue(indexHtml.includes('Sélectionnez un morceau pour commencer à travailler.'), 'message vide absent');
  assertTrue(/if \(!currentTrack\) updateStudioStage\(0\)/.test(studioJs), 'retour Studio sans média non réconcilié');
});

runTest('D2.10 — le fond initial sombre couvre HTML et BrowserWindow', () => {
  assertTrue(/<html[^>]*data-theme="dark"[^>]*background-color:\s*#0f1117/.test(indexHtml), 'fond HTML initial sombre absent');
  assertTrue(/let theme = 'dark'/.test(indexHtml), 'fallback HTML réel non sombre');
  assertTrue(/localStorage\.getItem\('theme'\)/.test(indexHtml), 'préférence enregistrée non lue avant CSS');
  assertTrue(/localStorage\.getItem\('theme'\) \|\| 'dark'/.test(mainJs), 'fallback du contrôleur de thème incohérent');
  assertTrue(/backgroundColor:\s*'#0f1117'/.test(electronMain), 'fond BrowserWindow absent');
});

console.log(`\n=== Résultat : ${passed}/${total} tests passés ===`);
if (passed === total) console.log('LOT D2 : navigation et démarrage visuel OK');
else console.log('LOT D2 : ÉCHEC');
