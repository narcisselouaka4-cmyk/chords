// [Claude] — 2026-10-04 — Tests du réglage de vitesse commun (speed-menu.js) : les bornes, le
// pas, les valeurs reçues d'ailleurs (stockage, ancien choix) et les étiquettes.
// Lancer : node src/ui/components/test-speed-menu.js

import {
  SPEED_MIN, SPEED_MAX, SPEED_STEP, SPEED_PRESETS, clampSpeed, speedLabel,
} from './speed-menu.js';

let passed = 0;
let failed = 0;
function check(name, condition, detail = '') {
  if (condition) {
    passed += 1;
    console.log(`\x1b[32m✓\x1b[0m ${name}`);
  } else {
    failed += 1;
    console.log(`\x1b[31m✗\x1b[0m ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

check('La plage : de 0,25× à 2×, par pas de 0,05 (Narcisse : « une plus large plage de choix »)',
  SPEED_MIN === 0.25 && SPEED_MAX === 2 && SPEED_STEP === 0.05);
check('Vitesses courantes : 0,5× · 0,75× · 1× · 1,25× · 1,5×',
  SPEED_PRESETS.map(speedLabel).join(' · ') === '0,5× · 0,75× · 1× · 1,25× · 1,5×', SPEED_PRESETS.map(speedLabel).join(' · '));
check('… toutes dans la plage et sur le pas', SPEED_PRESETS.every((p) => clampSpeed(p) === p));

check('Bornée : 0,1 → 0,25 ; 3 → 2', clampSpeed(0.1) === 0.25 && clampSpeed(3) === 2);
check('Arrondie au pas, sans reste de calcul : 0,33 → 0,35 ; 1,234 → 1,25 ; 0,6 → 0,6',
  clampSpeed(0.33) === 0.35 && clampSpeed(1.234) === 1.25 && clampSpeed(0.6) === 0.6 && String(clampSpeed(0.35)) === '0.35',
  `${clampSpeed(0.33)} ${clampSpeed(1.234)} ${clampSpeed(0.6)}`);
// Le pas, ajouté 35 fois de 0,25 à 2 : chaque valeur reste exacte (« 1,05× », jamais « 1,0500000001× »).
const steps = [];
for (let v = SPEED_MIN; v <= SPEED_MAX + 1e-9; v = clampSpeed(v + SPEED_STEP)) {
  steps.push(v);
  if (v === SPEED_MAX) break;
}
check('Les 36 vitesses de 0,25× à 2×, chacune écrite proprement',
  steps.length === 36 && steps.every((v) => /^\d,?\d{0,2}×$/.test(speedLabel(v))) && speedLabel(steps[16]) === '1,05×',
  `${steps.length} : ${steps.map(speedLabel).join(' ')}`);
check('Valeur absente ou fausse : la valeur de repli (1× par défaut)',
  clampSpeed(null) === 1 && clampSpeed(undefined) === 1 && clampSpeed('') === 1 && clampSpeed('x') === 1
  && clampSpeed(0) === 1 && clampSpeed(-1) === 1 && clampSpeed(Number.NaN, 0.75) === 0.75);
check('Lue comme dans le stockage (« 0.75 ») ou écrite à la française (« 0,75 »)',
  clampSpeed('0.75') === 0.75 && clampSpeed('0,75') === 0.75 && clampSpeed(' 1.5 ') === 1.5);
check('Un ancien choix gardé (0,5 · 0,75 · 1 · 1,25) reste valable', [0.5, 0.75, 1, 1.25].every((r) => clampSpeed(String(r)) === r));
check('Étiquettes : « 0,25× », « 0,6× », « 1× », « 2× »',
  speedLabel(0.25) === '0,25×' && speedLabel(0.6) === '0,6×' && speedLabel(1) === '1×' && speedLabel(2) === '2×'
  && speedLabel(0.1 + 0.2) === '0,3×' && speedLabel('x') === '1×');

console.log(`\n=== Résultat : ${passed}/${passed + failed} contrôles passés ===`);
if (failed > 0) process.exit(1);
