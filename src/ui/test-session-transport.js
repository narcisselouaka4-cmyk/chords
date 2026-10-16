// Lecteur de Sessions MIDI : le bouton Lecture/Pause ne doit être réécrit que lorsque son état change.
// (Réécrit à chaque image, l'icône sous le doigt était remplacée entre l'appui et le relâchement :
// le navigateur ne déclenchait pas le clic — « Pause ne répond pas, il faut cliquer plusieurs fois ».)
import { readFileSync } from 'node:fs';

let passed = 0; let failed = 0;
const check = (ok, label) => { if (ok) { passed++; console.log(`  ✓ ${label}`); } else { failed++; console.log(`  ✗ ${label}`); } };

const src = readFileSync(new URL('./recording-tab.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const fn = src.slice(src.indexOf('function updateTransportUI()'), src.indexOf('function updateTransportUI()') + 2200);

check(/dataset\.state\s*!==\s*wanted/.test(fn), 'le bouton n\'est modifié que si l\'état change (dataset.state)');
const writes = (fn.match(/transportPlay\.innerHTML\s*=/g) || []).length;
check(writes === 1, 'une seule écriture de l\'icône, protégée par le test d\'état');
const guardAt = fn.indexOf('dataset.state !==');
check(guardAt > -1 && fn.indexOf('transportPlay.innerHTML') > guardAt, 'l\'écriture de l\'icône est après le test d\'état');

// Textes retirés (13/10)
check(!html.includes('Cliquez sur une note pour vous y rendre'), 'plus de « Cliquez sur une note pour vous y rendre »');
check(!/<i class="tr-legend-note"><\/i>Notes jouées/.test(html), 'plus de « Notes jouées » sous le paysage');
check(!html.includes('>Session enregistrée<') && !/<\/span>Session enregistrée<\/span>/.test(html), 'plus de mention « Session enregistrée » en haut à droite');
check(html.includes('data-projection="fall"') && html.includes('>Cascade</button>') && !html.includes('>Chute</button>'), 'le troisième angle s\'appelle « Cascade »');

console.log(`\n=== Résultat : ${passed}/${passed + failed} contrôles passés ===`);
process.exit(failed ? 1 : 0);
