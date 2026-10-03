// [Claude] — 2026-10-03 — Pédagogie IA, lot 6 : un exemple du Copilote envoyé dans
// Exercices (example-export.js). Sans DOM.
import { gridFromExample, favoritesFromExample } from './example-export.js';
import { upsertGrid } from '../practice-grids.js';
import { loadFavorites, saveFavorites } from '../practice-favorites.js';

let passed = 0;
let failed = 0;
function check(label, cond, detail = '') {
  if (cond) { passed += 1; console.log(`  ✅ ${label}`); } else { failed += 1; console.error(`  ❌ ${label}${detail ? ` — ${detail}` : ''}`); }
}

const transfer = {
  kind: 'tutorial-transfer',
  chords: [
    { name: 'Fmaj7', leftHand: [41, 52], rightHand: [57, 60, 67] },
    { name: 'F#dim7', leftHand: [42], rightHand: [57, 60, 63] },
    { name: 'G7', leftHand: [43, 53], rightHand: [59, 62, 69] },
    { name: 'Cmaj7', leftHand: [36, 47], rightHand: [52, 55, 62] },
    { name: 'G7', leftHand: [43, 53], rightHand: [59, 62, 69] },
  ],
};
console.log('Ma grille');
const grid = gridFromExample(transfer, { prefix: 'Tuto' });
check('les accords de l\'exemple, dans l\'ordre, passages compris', grid?.chords.map((c) => c.name).join(' ') === 'Fmaj7 F#dim7 G7 Cmaj7 G7' && grid.name === 'Tuto · Fmaj7 F#dim7 G7 Cmaj7 G7', JSON.stringify(grid));
const long = gridFromExample({ chords: Array.from({ length: 20 }, (_, i) => ({ name: i % 2 ? 'G7' : 'Dm7' })) });
check('16 accords au plus (limite des grilles), nom raccourci', long.chords.length === 16 && long.name.length <= 'Copilote · '.length + 54 && long.name.endsWith('…'), long.name);
check('un seul accord, ou aucun : pas de grille', gridFromExample({ chords: [{ name: 'Cmaj7' }] }) === null && gridFromExample(null) === null);
const saved = upsertGrid([], grid, () => 'perso-1');
check('… et la grille s\'enregistre telle quelle dans Perso', saved.grid?.chords.map((c) => c.name).join(' ') === 'Fmaj7 F#dim7 G7 Cmaj7 G7');

console.log('Favoris');
const favs = favoritesFromExample(transfer, { technique: 'Voicing du prof' });
check('chaque voicing exact, sans doublon (G7 deux fois = un favori)', favs.length === 4 && favs.map((f) => f.name).join(' ') === 'Fmaj7 F#dim7 G7 Cmaj7', favs.map((f) => f.name).join(' '));
check('mains, notes, accord et libellé gardés', favs[0].rootPc === 5 && favs[0].quality === 'maj7' && favs[0].lh.join(',') === '41,52' && favs[0].rh.join(',') === '57,60,67'
  && favs[0].technique === 'Voicing du prof' && favs[0].key === '5|maj7|41,52|57,60,67');
const store = { data: {}, getItem(k) { return this.data[k] ?? null; }, setItem(k, v) { this.data[k] = v; } };
saveFavorites(store, favs);
check('… et ils se relisent comme des favoris de l\'Accord cible', loadFavorites(store).length === 4);
check('un exemple sans mains (un lick) : pas de favori', favoritesFromExample({ chords: [{ name: 'G7', leftHand: [], rightHand: [] }] }).length === 0);

console.log(`\n=== Résultat : ${passed}/${passed + failed} contrôles passés ===`);
if (failed) process.exit(1);
