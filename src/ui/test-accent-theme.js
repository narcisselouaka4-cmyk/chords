// Tests — couleur générale de l'application (accent-theme.js, partie pure).
//
// Usage : node src/ui/test-accent-theme.js

import { hexToHsl, accentPalette, accentCss, perceivedLightness, ACCENT_PRESETS } from './accent-theme.js';

let failed = 0;
let passed = 0;
function check(label, ok, detail = '') {
  if (ok) { passed += 1; console.log(`✅ ${label}`); } else { failed += 1; console.error(`❌ ${label}${detail ? ` — ${detail}` : ''}`); }
}

const yellow = hexToHsl('#f2b705');
check('hexToHsl : jaune ≈ teinte 45°', yellow.h >= 43 && yellow.h <= 47 && yellow.s > 90, JSON.stringify(yellow));
check('hexToHsl : valeur invalide → null', hexToHsl('rouge') === null && hexToHsl('#12') === null);

const p = accentPalette('#f2b705');
const families = ['--tr-accent', '--r-accent', '--vk-accent', '--an-accent', '--accent'];
check('Les cinq familles de variables reçoivent la couleur (sombre et clair)', families.every((v) => p.dark[v] && p.light[v]));
const veloursVars = ['--velours-accent', '--velours-accent-soft', '--velours-accent-glow', '--r-active-bg', '--r-tab-active-border', '--r-coral', '--an-amber'];
check('Velours reçoit aussi la couleur choisie jusque dans ses états secondaires', veloursVars.every((v) => p.dark[v] && p.light[v]));
check('Même teinte partout (45°)', Object.values({ ...p.dark, ...p.light }).filter((v) => /^hsl\(/.test(v)).every((v) => Math.abs(Number(v.match(/hsl\((\d+)/)[1]) - 45) <= 13));
check('Jaune : le texte posé sur un bouton est sombre (lisible)', p.dark['--tr-button-text'] === '#1d1726' && p.light['--tr-button-text'] === '#1d1726');
const violet = accentPalette('#7b52db');
check('Violet foncé : texte de bouton blanc en thème clair', violet.light['--tr-button-text'] === '#ffffff');
check('Le thème clair prend des fonds teintés, pas lilas', p.light['--tr-bg'].startsWith('hsl(45') && !p.dark['--tr-bg']);
check('Le thème sombre est plus clair que le clair pour l\'accent, et inversement pour les fonds', Number(p.dark['--tr-accent'].match(/(\d+)%\)$/)[1]) > Number(p.light['--tr-accent'].match(/(\d+)%\)$/)[1]));
const css = accentCss('#4fbf6f');
check('La feuille cible les deux thèmes et passe devant toutes les familles (!important)', css.includes("[data-theme='light']") && css.includes(':not([data-theme=\'light\'])') && css.includes('!important') && css.includes('--tr-accent'));
check('Couleur invalide : aucune feuille (violet d\'origine)', accentCss('n\'importe quoi') === '');
check('Les pastilles proposées sont des couleurs valides, la première est celle d\'origine', ACCENT_PRESETS.every((c) => hexToHsl(c.hex)) && ACCENT_PRESETS[0].original === true);
check('perceivedLightness : jaune clair, bleu sombre', perceivedLightness(50, 90, 60) > 0.38 && perceivedLightness(230, 70, 35) < 0.38);

console.log(`\n=== Résultat : ${passed}/${passed + failed} contrôles passés ===`);
if (failed) process.exit(1);
