// [Claude] — 2026-09-25 — Tests du rôle des notes (note-roles.js).
//
// Lancer : node src/pedagogie/test-note-roles.js

import { noteRoles, parseChordName, availableTensions } from './note-roles.js';

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

const roles = (name, notes) => noteRoles(name, notes).map((r) => `${r.degree}/${r.kind}`).join(' ');

function testChordRoles() {
  check('Dm9 (Ré | Fa La Do Mi) : 1, b3, 5, b7, 9', roles('Dm9', [50, 53, 57, 60, 64]) === '1/root b3/guide 5/fifth b7/guide 9/color', roles('Dm9', [50, 53, 57, 60, 64]));
  check('G13 rootless + basse : 1, b7, 9, 3, 13', roles('G13', [43, 53, 57, 59, 64]) === '1/root b7/guide 9/color 3/guide 13/color', roles('G13', [43, 53, 57, 59, 64]));
  check('Bm7b5 : quinte diminuée de structure', roles('Bm7b5', [47, 50, 53, 57]) === '1/root b3/guide b5/fifth b7/guide', roles('Bm7b5', [47, 50, 53, 57]));
  check('Bdim7 : septième diminuée (bb7)', roles('Bdim7', [47, 50, 53, 56]).endsWith('bb7/guide'), roles('Bdim7', [47, 50, 53, 56]));
  check('C+ : quinte augmentée', roles('C+', [48, 52, 56]) === '1/root 3/guide #5/fifth', roles('C+', [48, 52, 56]));
  check('C7alt : b9, #9, b13 en couleurs', roles('C7alt', [48, 52, 58, 61, 63, 68]) === '1/root 3/guide b7/guide b9/color #9/color b13/color', roles('C7alt', [48, 52, 58, 61, 63, 68]));
  check('Gsus4 : la quarte remplace la tierce (guide)', roles('Gsus4', [43, 48, 50]) === '1/root 4/guide 5/fifth', roles('Gsus4', [43, 48, 50]));
  check('C6/9 : la sixte tient le rôle de la septième', roles('C6/9', [36, 43, 52, 57, 62]) === '1/root 5/fifth 3/guide 6/guide 9/color', roles('C6/9', [36, 43, 52, 57, 62]));
}

function testTensionsAndOutside() {
  const g7 = noteRoles('G7', [43, 57, 59, 65]);
  const nine = g7.find((r) => r.midi === 57);
  check('G7 + La : 9e disponible (couleur, pas une faute)', nine?.kind === 'color' && nine.tension && !nine.inChord, JSON.stringify(nine));
  const am = noteRoles('Am', [45, 48, 52, 61]);
  check('Am + Do# : tierce majeure étrangère (hors accord)', am.find((r) => r.midi === 61)?.kind === 'outside');
  const cmaj = noteRoles('Cmaj7', [48, 52, 53, 59]);
  check('Cmaj7 + Fa : la 11 juste frotte la tierce (hors accord)', cmaj.find((r) => r.midi === 53)?.kind === 'outside');
  check('Tensions de Dm7 : 9, 11, 13', [...availableTensions('m7')].sort((a, b) => a - b).join(',') === '2,5,9');
  check('Tensions de G7 : b9, 9, #9, #11, b13, 13', [...availableTensions('7')].sort((a, b) => a - b).join(',') === '1,2,3,6,8,9');
}

function testSlashChords() {
  const c = parseChordName('Dm7/G');
  check('Dm7/G : fondamentale Ré, qualité m7, basse Sol', c?.rootPc === 2 && c.quality === 'm7' && c.bassPc === 7, JSON.stringify(c));
  check('C6/9 : « /9 » reste la qualité (pas une basse)', parseChordName('C6/9')?.quality === '6/9' && parseChordName('C6/9')?.bassPc === null);
  const cd = noteRoles('C/D', [38, 48, 52, 55]);
  check('C/D : la basse écrite (Ré) a le rôle « basse »', cd[0]?.kind === 'bass' && cd[0].inChord, JSON.stringify(cd[0]));
  check('Nom inconnu : aucun rôle', noteRoles('Xyz', [60]).length === 0 && parseChordName('Xyz') === null);
}

// [Claude] — 2026-09-25 — Noms lus dans un tutoriel (« comment harmoniser
// rapidement ») : altérations typographiques et balises d'affichage.
function testTypographicNames() {
  const f = parseChordName('F#7♭13');
  check('F#7♭13 : Fa#, qualité 7b13', f?.rootPc === 6 && f.quality === '7b13' && f.bassPc === null, JSON.stringify(f));
  const e = parseChordName('E7♯9♭13');
  check('E7♯9♭13 : Mi, qualité 7#9b13', e?.rootPc === 4 && e.quality === '7#9b13', JSON.stringify(e));
  const b = parseChordName('B<span class="flat">♭</span>7');
  check('B♭7 écrit en HTML : Sib, qualité 7', b?.rootPc === 10 && b.quality === '7', JSON.stringify(b));
  check('F#7♭13 : le Ré (♭13) est une note de l\'accord', noteRoles('F#7♭13', [42, 62]).every((r) => r.inChord));
}

testChordRoles();
testTensionsAndOutside();
testSlashChords();
testTypographicNames();

console.log(`\n=== Résultat : ${passed}/${passed + failed} tests passés ===`);
process.exit(failed === 0 ? 0 : 1);
