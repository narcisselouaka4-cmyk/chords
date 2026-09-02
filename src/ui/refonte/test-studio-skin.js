/**
 * Tests — Onglet Studio, refonte v2 / Global.
 *
 * Vérifie (statiquement, façon src/ui/test-analysis-dom.js) :
 *   · les deux skins habillent bien #studio-tab (theme + studio.css) ;
 *   · le bloc « Lecture » déplacé contient transposition + volume + boucle ;
 *   · la bascule « Boucler la région » est réellement câblée (relais §2) :
 *     état, persistance, et branche loop→seek(regionStart) au lieu de pause.
 *
 * Usage : node src/ui/refonte/test-studio-skin.js
 */

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '../../..');
const read = (rel) => readFileSync(resolve(root, rel), 'utf-8');

let failures = 0;
const assert = (c, m) => { c ? console.log(`  ✅ ${m}`) : (console.error(`  ❌ ${m}`), failures++); };
const test = (name, fn) => { console.log(`\n📋 ${name}`); try { fn(); } catch (e) { console.error(`  ❌ ${e.stack || e}`); failures++; } };

const html = read('src/index.html');
const css = read('src/ui/refonte/studio.css');
const js = read('src/ui/studio-tab.js');

test('index.html — bloc « Lecture » déplacé dans la colonne de droite', () => {
  assert(html.includes('id="studio-playback-block"'), 'le conteneur #studio-playback-block existe');
  const block = html.slice(html.indexOf('id="studio-playback-block"'), html.indexOf('</aside>', html.indexOf('id="studio-playback-block"')));
  assert(/id="studio-transpose-control"/.test(block), 'la transposition est DANS le bloc Lecture');
  assert(/id="studio-volume"/.test(block), 'le volume est DANS le bloc Lecture');
  assert(/id="studio-loop-region"/.test(block), 'la bascule « Boucler la région » est DANS le bloc Lecture');
  // Elle ne doit plus être dans la barre de transport.
  const controls = html.slice(html.indexOf('class="studio-controls"'), html.indexOf('</section>', html.indexOf('class="studio-controls"')));
  assert(!/id="studio-transpose-control"/.test(controls), 'la transposition a bien quitté .studio-controls');
});

test('studio.css — les deux skins habillent #studio-tab', () => {
  assert(/:root\[data-skin='global'\]\s*#studio-tab/.test(css), 'bloc skin global pour #studio-tab');
  assert(/:root\[data-skin='v2'\]\s*#studio-tab/.test(css), 'bloc skin v2 pour #studio-tab');
  assert(css.includes('--r-vocals') && css.includes('--r-drums') && css.includes('--r-bass') && css.includes('--r-other'),
    'couleurs de stems définies (communes)');
  // Grammaire divergente : pilule 100px en v2, anguleux en global.
  assert(/data-skin='v2'\]\s*#studio-tab \.studio-stem-row\s*{[^}]*border-radius:\s*100px/.test(css.replace(/\n/g, ' ')),
    'v2 : lignes de stems en pilules (border-radius 100px)');
  assert(/data-skin='global'\]\s*#studio-tab \.studio-stem-row\s*{[^}]*border-radius:\s*9px/.test(css.replace(/\n/g, ' ')),
    'global : lignes de stems anguleuses (border-radius 9px)');
});

test('studio.css est chargé en <link> dans index.html', () => {
  assert(html.includes('href="./ui/refonte/studio.css"'), 'lien vers studio.css présent');
});

test('studio-tab.js — « Boucler la région » réellement câblée', () => {
  assert(/let loopRegion = false/.test(js), 'drapeau loopRegion déclaré');
  assert(js.includes("document.getElementById('studio-loop-region')"), 'élément #studio-loop-region récupéré dans els');
  assert(js.includes("localStorage.getItem('studio-loop-region')") && js.includes("localStorage.setItem('studio-loop-region'"),
    'état persisté dans localStorage');
  assert(js.includes("els.loopRegion.addEventListener('change'"), 'la case écoute l\'événement change');
  // Comportement : à regionEnd, si loopRegion → seek(regionStart), sinon pause.
  const loopBranches = js.match(/if \(loopRegion\) \{\s*seek\(regionStart\);\s*\} else \{\s*pause\(\);/g) || [];
  assert(loopBranches.length >= 2,
    `les 2 gardes de fin de région relancent à regionStart quand loopRegion (trouvées : ${loopBranches.length})`);
});

test('studio-tab.js — pastille de couleur par stem exposée en data-stem', () => {
  assert(js.includes('row.dataset.stem = stem'), 'renderStems pose data-stem sur chaque ligne');
});

console.log('');
if (failures) { console.error(`\n❌ ${failures} assertion(s) en échec.`); process.exit(1); }
console.log('\n✅ Tous les tests studio-skin passent.');
