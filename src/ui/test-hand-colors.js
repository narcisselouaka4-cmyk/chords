// Couleurs des mains (Exercices) : jamais confondues avec la couleur de l'application.
import { pickHandColors, tooClose, hueDistance, ADDED_NOTE_COLOR } from './hand-colors.js';
import { ACCENT_PRESETS } from './accent-theme.js';

let passed = 0; let failed = 0;
const check = (ok, label) => { if (ok) { passed++; console.log(`  ✓ ${label}`); } else { failed++; console.log(`  ✗ ${label}`); } };

check(hueDistance('#ff0000', '#ff0000') === 0 && hueDistance('#ff0000', '#00ffff') === 180, 'écart de teinte : 0 pour une même couleur, 180 pour l\'opposée');
check(tooClose('#9b7bf0', '#a583e2'), 'le violet d\'origine et le violet de la main gauche se confondent');

const violet = pickHandColors(null);
check(violet.lh !== '#a583e2' && !tooClose(violet.lh, '#9b7bf0'), `application violette (d'origine) : la main gauche change de couleur (${violet.lh})`);
check(violet.rh === '#8ccdb7', 'application violette : la main droite garde son vert sauge');

for (const { name, hex } of ACCENT_PRESETS) {
  const { lh, rh } = pickHandColors(hex);
  check(!tooClose(lh, hex) && !tooClose(rh, hex) && !tooClose(lh, rh) && !tooClose(lh, ADDED_NOTE_COLOR) && !tooClose(rh, ADDED_NOTE_COLOR),
    `${name} (${hex}) : main gauche ${lh}, main droite ${rh}, toutes distinctes`);
}
const green = pickHandColors('#4fbf6f');
check(green.rh !== '#8ccdb7', 'application verte : la main droite quitte aussi le vert');
const custom = pickHandColors('#5a8cf0');
check(!tooClose(custom.lh, '#5a8cf0'), 'couleur personnalisée bleue : la main gauche n\'est pas bleue');

console.log(`\n=== Résultat : ${passed}/${passed + failed} contrôles passés ===`);
process.exit(failed ? 1 : 0);
