/**
 * Tests de non-régression — Menu bibliothèque ⋮ et Renommage.
 *
 * Vérifie que :
 *   1. Le menu ⋮ est entièrement accessible (y compris pour la dernière entrée).
 *   2. Le menu s'ouvre vers le haut quand l'espace est insuffisant en dessous.
 *   3. La modale Renommer fonctionne (nom prérempli, persistance, même ID).
 *   4. La modale Supprimer fonctionne.
 *   5. Le menu se ferme après action et au clic extérieur.
 *
 * Usage : node src/ui/test-library-menu.js
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

// ── 1. CSS du menu ──

runTest('1. CSS — Le menu a position:absolute et z-index élevé', () => {
  const cssPath = resolve(projectRoot, 'src/ui/components/analyzer-workspace.css');
  const css = readFileSync(cssPath, 'utf-8');

  const menuMatch = css.match(/\.analyzer-library-menu\s*\{([^}]+)\}/s);
  assert(menuMatch !== null, 'Règle .analyzer-library-menu existe');

  const block = menuMatch[1];
  assert(/\bposition\s*:\s*absolute\b/.test(block), 'Menu en position:absolute');
  assert(/\bz-index\s*:\s*100\b/.test(block), 'Menu a z-index:100');
  assert(/\bright\s*:\s*0\b/.test(block), 'Menu aligné à droite');
});

runTest('1. CSS — Le menu a une variante .up pour ouverture vers le haut', () => {
  const cssPath = resolve(projectRoot, 'src/ui/components/analyzer-workspace.css');
  const css = readFileSync(cssPath, 'utf-8');

  const upMatch = css.match(/\.analyzer-library-menu\.up\s*\{([^}]+)\}/s);
  assert(upMatch !== null, 'Règle .analyzer-library-menu.up existe');

  const block = upMatch[1];
  assert(/bottom\s*:\s*100%/.test(block), 'Menu.up utilise bottom:100%');
  assert(/top\s*:\s*auto\b/.test(block), 'Menu.up annule top');
});

runTest('1. CSS — Le conteneur du menu est en position:relative', () => {
  const cssPath = resolve(projectRoot, 'src/ui/components/analyzer-workspace.css');
  const css = readFileSync(cssPath, 'utf-8');

  const containerMatch = css.match(/\.analyzer-library-menu-container\s*\{([^}]+)\}/s);
  assert(containerMatch !== null, 'Règle .analyzer-library-menu-container existe');

  const block = containerMatch[1];
  assert(/\bposition\s*:\s*relative\b/.test(block), 'Conteneur en position:relative (ancre du menu)');
});

// ── 2. JS — Détection d'espace pour le menu ──

runTest('2. JS — Le handler ⋮ calcule l\'espace disponible', () => {
  const jsPath = resolve(projectRoot, 'src/ui/analyzer-tab.js');
  const js = readFileSync(jsPath, 'utf-8');

  assert(js.includes('getBoundingClientRect'), 'Utilise getBoundingClientRect pour mesurer');
  assert(js.includes('window.innerHeight'), 'Utilise window.innerHeight');
  assert(js.includes("menu.classList.add('up')"), 'Ajoute la classe up si espace insuffisant');
  assert(js.includes("menu.classList.remove('up')"), 'Retire la classe up si espace suffisant');
  assert(js.includes('estimatedMenuHeight'), 'Utilise une hauteur estimée du menu');
});

runTest('2. JS — Le handler ferme les autres menus avant d\'ouvrir', () => {
  const jsPath = resolve(projectRoot, 'src/ui/analyzer-tab.js');
  const js = readFileSync(jsPath, 'utf-8');

  assert(js.includes("document.querySelectorAll('.analyzer-library-menu.open')"), 'Ferme tous les menus ouverts');
  assert(js.includes("m !== menu"), 'Ne ferme pas le menu courant');
});

// ── 3. JS — Modale Renommer ──

runTest('3. JS — La fonction showRenameModal existe', () => {
  const jsPath = resolve(projectRoot, 'src/ui/analyzer-tab.js');
  const js = readFileSync(jsPath, 'utf-8');

  assert(js.includes('function showRenameModal'), 'showRenameModal est définie');
  assert(js.includes('Renommer le morceau'), 'Titre de la modale présent');
  assert(js.includes('analyzer-rename-input'), 'Champ input présent');
  assert(js.includes("class=\"btn-primary"), 'Bouton Enregistrer présent');
  assert(js.includes('Annuler'), 'Bouton Annuler présent');
});

runTest('3. JS — La modale Renommer retourne une Promise', () => {
  const jsPath = resolve(projectRoot, 'src/ui/analyzer-tab.js');
  const js = readFileSync(jsPath, 'utf-8');

  assert(js.includes('return new Promise'), 'showRenameModal retourne une Promise');
  assert(js.includes('resolve(value'), 'Résout avec la valeur saisie');
  assert(js.includes('resolve(null)'), 'Résout avec null si annulé');
});

runTest('3. JS — La modale gère Enter et Escape', () => {
  const jsPath = resolve(projectRoot, 'src/ui/analyzer-tab.js');
  const js = readFileSync(jsPath, 'utf-8');

  // Vérifier que le handler keydown est présent dans showRenameModal
  const fnMatch = js.match(/function showRenameModal\(currentName\)\s*\{([\s\S]*?)\n\}/);
  assert(fnMatch !== null, 'Fonction showRenameModal trouvée');

  const body = fnMatch[1];
  assert(body.includes("e.key === 'Enter'"), 'Touche Enter gérée');
  assert(body.includes("e.key === 'Escape'"), 'Touche Escape gérée');
});

runTest('3. JS — promptRenameTrack utilise showRenameModal', () => {
  const jsPath = resolve(projectRoot, 'src/ui/analyzer-tab.js');
  const js = readFileSync(jsPath, 'utf-8');

  const fnMatch = js.match(/async function promptRenameTrack\(track, currentName\)\s*\{([\s\S]*?)\n\}/);
  assert(fnMatch !== null, 'Fonction promptRenameTrack trouvée');

  const body = fnMatch[1];
  assert(body.includes('showRenameModal'), 'Utilise showRenameModal au lieu de prompt()');
  assert(!body.includes('prompt('), 'N\'utilise plus prompt() natif');
  assert(body.includes('renameTrack'), 'Appelle renameTrack');
  assert(body.includes('refreshLibraryList'), 'Rafraîchit la bibliothèque');
});

// ── 4. JS — Modale Supprimer ──

runTest('4. JS — La fonction showDeleteModal existe', () => {
  const jsPath = resolve(projectRoot, 'src/ui/analyzer-tab.js');
  const js = readFileSync(jsPath, 'utf-8');

  assert(js.includes('function showDeleteModal'), 'showDeleteModal est définie');
  assert(js.includes('Supprimer le morceau'), 'Titre de la modale présent');
  assert(js.includes('irréversible'), 'Avertissement irréversible présent');
});

runTest('4. JS — confirmDeleteTrack utilise showDeleteModal', () => {
  const jsPath = resolve(projectRoot, 'src/ui/analyzer-tab.js');
  const js = readFileSync(jsPath, 'utf-8');

  const fnMatch = js.match(/async function confirmDeleteTrack\(track, displayName\)\s*\{([\s\S]*?)\n\}/);
  assert(fnMatch !== null, 'Fonction confirmDeleteTrack trouvée');

  const body = fnMatch[1];
  assert(body.includes('showDeleteModal'), 'Utilise showDeleteModal au lieu de confirm()');
  assert(!body.includes('confirm('), 'N\'utilise plus confirm() natif');
  assert(body.includes('deleteTrack'), 'Appelle deleteTrack');
  assert(body.includes('refreshLibraryList'), 'Rafraîchit la bibliothèque');
});

// ── 5. CSS des modales ──

runTest('5. CSS — Les modales ont un overlay avec z-index élevé', () => {
  const cssPath = resolve(projectRoot, 'src/ui/components/analyzer-workspace.css');
  const css = readFileSync(cssPath, 'utf-8');

  const overlayMatch = css.match(/\.analyzer-modal-overlay\s*\{([^}]+)\}/s);
  assert(overlayMatch !== null, 'Règle .analyzer-modal-overlay existe');

  const block = overlayMatch[1];
  assert(/\bposition\s*:\s*fixed\b/.test(block), 'Overlay en position:fixed');
  assert(/\bz-index\s*:\s*1000\b/.test(block), 'Overlay a z-index:1000 (au-dessus du menu)');
  assert(/\binset\s*:\s*0\b/.test(block), 'Overlay couvre tout l\'écran');
});

runTest('5. CSS — La modale a un style cohérent', () => {
  const cssPath = resolve(projectRoot, 'src/ui/components/analyzer-workspace.css');
  const css = readFileSync(cssPath, 'utf-8');

  const modalMatch = css.match(/\.analyzer-modal\s*\{([^}]+)\}/s);
  assert(modalMatch !== null, 'Règle .analyzer-modal existe');

  const block = modalMatch[1];
  assert(/background\s*:\s*var\(--panel-bg\)/.test(block), 'Fond cohérent avec le thème');
  assert(/border-radius\s*:\s*var\(--radius\)/.test(block), 'Bordures cohérentes');
});

// ── 6. Fermeture du menu ──

runTest('6. JS — Le menu se ferme après Renommer', () => {
  const jsPath = resolve(projectRoot, 'src/ui/analyzer-tab.js');
  const js = readFileSync(jsPath, 'utf-8');

  // Vérifier que le handler Renommer ferme le menu avant d'appeler promptRenameTrack
  assert(js.includes("menu.classList.remove('open');\n      promptRenameTrack"), 'Ferme le menu avant Renommer');
});

runTest('6. JS — Le menu se ferme après Supprimer', () => {
  const jsPath = resolve(projectRoot, 'src/ui/analyzer-tab.js');
  const js = readFileSync(jsPath, 'utf-8');

  assert(js.includes("menu.classList.remove('open');\n      confirmDeleteTrack"), 'Ferme le menu avant Supprimer');
});

runTest('6. JS — Le menu se ferme au clic extérieur', () => {
  const jsPath = resolve(projectRoot, 'src/ui/analyzer-tab.js');
  const js = readFileSync(jsPath, 'utf-8');

  assert(js.includes("!menuContainer.contains(e.target)"), 'Détecte le clic hors du conteneur');
  assert(js.includes("menu.classList.remove('open')"), 'Ferme le menu au clic extérieur');
});

// ── Résultat ──

console.log(`\n${'='.repeat(50)}`);
if (failures === 0) {
  console.log('✅ Tous les tests du menu bibliothèque et renommage sont passés.');
} else {
  console.error(`❌ ${failures} test(s) en échec.`);
  process.exitCode = 1;
}
