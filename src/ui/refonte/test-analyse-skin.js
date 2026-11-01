/**
 * Tests — Onglet Analyse, refonte v2 / Global (chrome commun).
 *
 * Vérifie statiquement :
 *   · analyse.css habille #analysis-tab dans les deux skins ;
 *   · barre de sous-onglets : soulignement en Global, pilule en dégradé en v2 ;
 *   · bande d'accords : rectangulaire en Global, pilule en v2, sélection en
 *     contour blanc neutre dans les deux (§5) ;
 *   · « Outils » est renommé « Corriger » (barre + panneau), sans casser le
 *     mécanisme générique de bascule (data-section).
 *
 * Usage : node src/ui/refonte/test-analyse-skin.js
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
const css = read('src/ui/refonte/analyse.css').replace(/\n/g, ' ');
const tabJs = read('src/ui/analyzer-tab.js');

test('index.html — analyse.css chargée, « Corriger » remplace « Outils »', () => {
  assert(html.includes('href="./ui/refonte/analyse.css"'), 'lien vers analyse.css présent');
  assert(!/>Outils<\/button>/.test(html), 'plus de bouton « Outils »');
  // [Refonte Astra Analyse 12/09] — le libellé du sous-onglet est désormais dans
  // un <span>, précédé d'une icône SVG : on reconnaît le bouton à son data-section.
  assert(/data-section="corriger"[\s\S]*?Corriger[\s\S]*?<\/button>/.test(html), 'bouton « Corriger » avec data-section="corriger"');
  assert(/analyzer-panel[^"]*"\s+data-section="corriger"/.test(html), 'panneau data-section="corriger" présent');
  assert(!/data-section="tools"/.test(html), 'plus aucune référence data-section="tools" dans le HTML');
});

test('analyzer-tab.js — bascule de sous-onglets restée générique', () => {
  assert(tabJs.includes('panel.dataset.section === section'), 'la bascule compare data-section génériquement (pas de valeur en dur)');
  assert(!/['"]tools['"]/.test(tabJs), 'aucune référence en dur à la section « tools » dans le JS');
});

test('analyse.css — les deux skins habillent #analysis-tab', () => {
  assert(/\[data-skin='global'\] #analysis-tab/.test(css), 'bloc skin global');
  assert(/\[data-skin='v2'\] #analysis-tab/.test(css), 'bloc skin v2');
});

test('analyse.css — sous-onglets : soulignement (Global) vs pilule dégradé (v2)', () => {
  assert(/\[data-skin='global'\] #analysis-tab \.analyzer-section-tabs button\.active\s*{[^}]*border-bottom-color:\s*var\(--r-accent\)/.test(css),
    'Global : sous-onglet actif souligné en --r-accent');
  assert(/\[data-skin='v2'\] #analysis-tab \.analyzer-section-tabs button\.active\s*{[^}]*background:\s*var\(--r-grad\)/.test(css),
    'v2 : sous-onglet actif en pilule dégradé');
  assert(/\[data-skin='v2'\] #analysis-tab \.analyzer-section-tabs button\s*{[^}]*border-radius:\s*100px/.test(css),
    'v2 : sous-onglets à border-radius 100px');
});

// [Correctif 02/10] — la frise d'accords est passée sous la couche Astra.
// analyse.css ne doit PLUS la re-skinner : ses sélecteurs étaient plus
// spécifiques que ceux du pont, donc les pastilles gardaient l'habillage
// d'avant la refonte pendant que le reste de l'onglet suivait Astra.
test("analyse.css — la frise d'accords est laissée à la couche Astra", () => {
  assert(!/\.analyzer-timeline-block/.test(css),
    'analyse.css ne contient plus aucune règle sur .analyzer-timeline-block');

  const bridge = read('src/ui/refonte/astra-bridge.css');
  assert(/#analysis-tab \.analyzer-timeline-block\s*{[^}]*position:\s*absolute/.test(bridge.replace(/\n/g, ' ')),
    'le pont positionne les blocs en absolu — analyzer-tab.js leur pose un left/width en pixels');
  assert(/#analyzer-chord-timeline-inner\s*{[^}]*position:\s*relative/.test(bridge.replace(/\n/g, ' ')),
    'la piste intérieure est le repère de ces coordonnées');
  assert(!/#analyzer-chord-timeline-inner\s*{[^}]*display:\s*flex/.test(bridge.replace(/\n/g, ' ')),
    "la piste n'est pas un flux flex : le flux s'additionnait au décalage left et la frise mentait sur les temps");
});

// La scène ne doit pas repeindre un fond opaque par-dessus celui d'Astra.
test('analyse.css — la scène laisse passer le fond Astra', () => {
  assert(!/#analysis-tab \.analyzer-panel\s*{[^}]*background:\s*var\(--r-ground\)/.test(css),
    'aucune dalle --r-ground peinte sur les panneaux de sous-onglets');
});

test('analyse.css — §3.1 Accord sélectionné : carte héros dégradée (v2) vs aplat (Global)', () => {
  assert(/\[data-skin='v2'\] #analysis-tab \.analyzer-hero-card\s*{[^}]*linear-gradient/.test(css),
    'v2 : carte héros en dégradé plein');
  assert(/\[data-skin='v2'\] #analysis-tab \.analyzer-hero-name[^{]*{[^}]*color:\s*#fff/.test(css)
    || /\[data-skin='v2'\][^{]*\.analyzer-hero-name,[^{]*\{[^}]*#fff/.test(css)
    || css.includes('.analyzer-hero-notes {   color: #fff'),
    'v2 : nom d\'accord de la carte héros en blanc');
  assert(/voicing-style-btn\[aria-pressed='true'\]\s*{[^}]*var\(--r-grad\)/.test(css),
    'v2 : segmented Fermer/Simple actif en dégradé');
  assert(/\[data-skin='global'\] #analysis-tab \.voicing-style-btn\[aria-pressed='true'\]\s*{[^}]*var\(--r-accent-soft\)/.test(css),
    'Global : segmented Fermer/Simple actif en accent-soft');
});

console.log('');
if (failures) { console.error(`\n❌ ${failures} assertion(s) en échec.`); process.exit(1); }
console.log('\n✅ Tous les tests analyse-skin passent.');
