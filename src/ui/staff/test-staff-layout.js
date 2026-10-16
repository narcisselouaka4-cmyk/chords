// [Claude] — 2026-10-02 — Portée du Temps réel (staff-layout.js) : où chaque note
// s'écrit, avec quelles lignes supplémentaires et quelles altérations, sans DOM.
import { layoutStaff, STAFF_MODES } from './staff-layout.js';
import { spellChordNotes } from '../../chord-engine/spelling.js';
import { GLYPHS } from './staff-glyphs.js';

let passed = 0;
let failed = 0;
function check(label, cond, detail = '') {
  if (cond) { passed += 1; console.log(`  ✅ ${label}`); } else { failed += 1; console.error(`  ❌ ${label}${detail ? ` — ${detail}` : ''}`); }
}
const lay = (midis, chord = null, mode = 'grand') => layoutStaff({
  notes: spellChordNotes(midis, chord), mode, rootPc: chord ? chord.rootPc : null,
});
const heads = (l) => l.heads.map((h) => `${h.staff[0]}${h.step}`).join(' ');

console.log('Glyphes Bravura');
check('clés, ronde, altérations et accolade présentes', ['gClef', 'fClef', 'cClef', 'noteheadWhole', 'accidentalSharp', 'accidentalFlat',
  'accidentalNatural', 'accidentalDoubleSharp', 'accidentalDoubleFlat', 'brace'].every((g) => GLYPHS[g]?.d?.startsWith('M')));

console.log('Grande portée (Sol + Fa)');
let l = lay([60]);
check('Do4 : clé de sol, une ligne supplémentaire', heads(l) === 't28' && l.ledgers.length === 1);
l = lay([59]);
check('Si3 : clé de fa, sans ligne supplémentaire', heads(l) === 'b27' && l.ledgers.length === 0);
l = lay([64]);
check('Mi4 : première ligne de la clé de sol', heads(l) === 't30' && l.ledgers.length === 0);
l = lay([60, 64, 67, 71], { rootPc: 0, symbol: 'maj7' });
check('Cmaj7 serré : quatre rondes en clé de sol, aucune altération', heads(l) === 't28 t30 t32 t34' && l.accidentals.length === 0);
check('Cmaj7 : la fondamentale est marquée', l.heads.filter((h) => h.isRoot).length === 1 && l.heads.find((h) => h.isRoot).midi === 60);
l = lay([48, 52, 58, 63], { rootPc: 0, symbol: '7#9' });
const sharp = l.accidentals.find((a) => a.glyph === 'accidentalSharp');
check('C7♯9 : Ré♯4 en clé de sol avec un ♯, Si♭3 en clé de fa avec un ♭',
  heads(l).split(' ').sort().join(' ') === 'b21 b23 b27 t29' && sharp?.step === 29 && l.accidentals.some((a) => a.glyph === 'accidentalFlat' && a.step === 27), heads(l));
l = lay([48, 51, 54, 57], { rootPc: 0, symbol: 'dim7' });
check('Cdim7 : un double bémol (Si𝄫)', l.accidentals.some((a) => a.glyph === 'accidentalDoubleFlat'));
check('deux clés, accolade et trait de système', l.clefs.length === 2 && Boolean(l.brace) && Boolean(l.systemLine));

console.log('Rondes et altérations');
l = lay([60, 62, 64]);
check('amas Do Ré Mi : Ré passe à droite (zigzag)', l.heads.map((h) => h.x).join() === [l.heads[0].x, l.heads[0].x + GLYPHS.noteheadWhole.width * 10, l.heads[0].x].join());
l = lay([63, 66, 70], { rootPc: 3, symbol: 'm' });
check('E♭ G♭ B♭ : trois colonnes d\'altérations, la plus haute contre les rondes',
  l.accidentals.length === 3 && l.accidentals.find((a) => a.step === 34)?.column === 0 && new Set(l.accidentals.map((a) => a.column)).size === 3);
l = lay([63, 64]);
check('Mi♭ et Mi♮ ensemble : têtes côte à côte, bécarre affiché',
  l.heads.length === 2 && l.heads[0].x !== l.heads[1].x && l.accidentals.some((a) => a.glyph === 'accidentalNatural'));
l = lay([60, 76]);
check('deux notes éloignées dans une portée : pas d\'altération inutile', l.accidentals.length === 0);

console.log('Lignes supplémentaires et octaves');
l = lay([84, 88, 91, 95, 98]);
check('accord très aigu : « 8va » et notes ramenées dans la portée', l.ottavas[0]?.text === '8va' && Math.max(...l.heads.map((h) => h.step)) <= 47);
l = lay([24, 28, 31]);
check('accord très grave : « 8vb »', l.ottavas[0]?.text === '8vb');
l = lay([81]);
check('La5 : une ligne supplémentaire au-dessus', l.ledgers.length === 1);
const fixed = [lay([60]).height, lay([36, 96]).height, lay([]).height];
check('hauteur fixe d\'un accord à l\'autre (la portée ne saute pas)', new Set(fixed).size === 1, fixed.join());

console.log('Clés seules');
l = lay([60], null, 'alto');
check('ut 3e : Do4 sur la ligne du milieu', l.clefs[0].glyph === 'cClef' && l.staffLines[2].y === l.heads[0].y);
l = lay([60], null, 'tenor');
check('ut 4e : Do4 sur la 4e ligne', l.clefs[0].glyph === 'cClef' && l.staffLines[3].y === l.heads[0].y);
l = lay([67], null, 'treble');
check('sol seule : Sol4 sur la 2e ligne, ligne de la clé', l.clefs[0].glyph === 'gClef' && l.staffLines[1].y === l.heads[0].y && l.clefs[0].y === l.heads[0].y);
l = lay([53], null, 'bass');
check('fa seule : Fa3 sur la 4e ligne, ligne de la clé', l.clefs[0].glyph === 'fClef' && l.staffLines[3].y === l.heads[0].y && l.clefs[0].y === l.heads[0].y);
l = lay([48, 52, 55, 58, 63], { rootPc: 0, symbol: '7#9' }, 'treble');
check('sol seule : tout l\'accord sur une portée, Do3 avec ses lignes supplémentaires', l.heads.every((h) => h.staff === 'treble') && l.ledgers.length >= 4);
check('les cinq modes existent', STAFF_MODES.join() === 'grand,treble,bass,alto,tenor');
check('mode inconnu : grande portée', lay([60], null, 'xyz').mode === 'grand');

console.log(`\n=== Résultat : ${passed}/${passed + failed} contrôles passés ===`);
if (failed) process.exit(1);
