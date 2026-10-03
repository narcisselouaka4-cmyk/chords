// [Claude] — 2026-10-03 — Tests de copilot-width.js : la largeur du Copilote à côté de la
// vidéo (poignée, bouton Agrandir / Réduire, flèches du clavier).
// Exécutable avec : node src/pedagogie/test-copilot-width.js

import {
  DEFAULT_SHARE, WIDE_SHARE, MIN_SHARE, MAX_SHARE, clampShare, shareAt, isWide, toggledShare, shareForKey, storedShare,
} from './copilot-width.js';

let total = 0;
let passed = 0;
function check(name, ok, detail = '') {
  total += 1;
  if (ok) { passed += 1; console.log(`  ✓ ${name}`); } else console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
}

console.log('Bornes');
check('Par défaut : 38 % (comme avant la poignée)', DEFAULT_SHARE === 0.38 && clampShare(undefined) === 0.38 && clampShare('abc') === 0.38);
check('La vidéo garde au moins 28 %, le Copilote au moins 25 %', clampShare(0.95) === MAX_SHARE && MAX_SHARE === 0.72 && clampShare(0.1) === MIN_SHARE);

console.log('La poignée');
const rect = { left: 0, width: 1600 };
check('Poignée au milieu : la moitié', Math.abs(shareAt(800 - 8, rect) - 0.5) < 0.001, String(shareAt(792, rect)));
check('Poignée à 992 px sur 1600 : 37,5 %', Math.abs(shareAt(992, rect) - 0.375) < 0.001, String(shareAt(992, rect)));
check('Tirée trop loin : bornée', shareAt(10, rect) === MAX_SHARE && shareAt(1590, rect) === MIN_SHARE);
check('Écran pas encore mesuré : la part par défaut', shareAt(500, { left: 0, width: 0 }) === DEFAULT_SHARE);

console.log('Le bouton');
check('Normal → Agrandir (60 %)', toggledShare(DEFAULT_SHARE) === WIDE_SHARE && !isWide(DEFAULT_SHARE));
check('Agrandi → Réduire (38 %)', toggledShare(WIDE_SHARE) === DEFAULT_SHARE && isWide(WIDE_SHARE));
check('Tirée à 55 % : le bouton propose « Réduire »', isWide(0.55) && !isWide(0.45));

console.log('Le clavier');
check('← : le Copilote grandit de 2 %, → : il rétrécit', shareForKey(0.38, 'ArrowLeft') === 0.4 && shareForKey(0.38, 'ArrowRight') === 0.36);
check('Début / Fin : le plus large, le plus étroit ; une autre touche : rien', shareForKey(0.4, 'Home') === MAX_SHARE && shareForKey(0.4, 'End') === MIN_SHARE && shareForKey(0.4, 'a') === null);

console.log('La part retenue');
check('Lue telle quelle, ou la part par défaut', storedShare('0.55') === 0.55 && storedShare(null) === DEFAULT_SHARE && storedShare('n/a') === DEFAULT_SHARE && storedShare('3') === MAX_SHARE);

console.log(`\n=== Résultat : ${passed}/${total} contrôles passés ===`);
if (passed < total) process.exitCode = 1;
