// [Claude] — 2026-10-14 — Tests de flash-notes.js (claviers qui n'allument une touche qu'à la frappe).
// node src/pedagogie/test-flash-notes.js
import { isFlashRendering, harmonyWindows, holdFlashNotes, flashSegments, notesToSamples, MAX_HOLD } from './flash-notes.js';
import { labelNotes } from './chord-labeling.js';

let passed = 0;
let failed = 0;
const check = (name, ok, detail = '') => {
  if (ok) { passed += 1; console.log(`  ✓ ${name}`); } else { failed += 1; console.log(`  ✗ ${name} ${detail}`); }
};

// « Next Level Worship », 3:08 → 3:21 (relevé réel, simplifié) : la progression Mi♭m9 → Sol♭maj9 →
// Si♭m9 → Ré♭maj9, jouée en accords brisés ; chaque touche ne s'allume que 0,12 à 0,38 s.
const flash = (midi, start, d = 0.13) => ({ midi, start, end: Math.round((start + d) * 100) / 100, hand: null });
const pattern = (t0, bass, lower, upper) => [
  flash(bass, t0, 0.38), flash(upper[0], t0),
  ...lower.map((m) => flash(m, t0 + 0.25)), flash(upper[1] ?? upper[0], t0 + 0.5, 0.25),
  ...lower.map((m) => flash(m, t0 + 0.88)), flash(upper[0], t0 + 1.25, 0.25),
  ...lower.map((m) => flash(m, t0 + 1.88)), flash(upper[1] ?? upper[0], t0 + 2.25),
];
const EBM9 = pattern(188.75, 51, [58, 61, 65, 66], [73]);
const GBMAJ9 = pattern(192.0, 54, [61, 65, 68, 70], [77]);
const BBM9 = pattern(195.25, 58, [65, 68, 72], [73, 80]);
const DBMAJ9 = pattern(198.5, 61, [68, 72, 75], [77, 84]);
const together = [...EBM9, ...GBMAJ9, ...BBM9, ...DBMAJ9].sort((a, b) => a.start - b.start);
// Assez de notes pour juger le rendu.
const twice = [...together, ...together.map((n) => ({ ...n, start: n.start + 13, end: n.end + 13 }))];

console.log('Rendu « éclair »');
check('reconnu sur des touches qui ne s\'allument qu\'à la frappe', isFlashRendering(twice));
const held = twice.map((n) => ({ ...n, end: n.start + 1.2 }));
check('pas reconnu quand les touches restent allumées', !isFlashRendering(held));
check('pas reconnu sur trop peu de notes', !isFlashRendering(together.slice(0, 20)));

console.log('Harmonies');
const wins = harmonyWindows(together);
check('quatre harmonies, une par accord', wins.length === 4, `(${wins.length} : ${wins.map((w) => w.start).join(' ')})`);
check('chaque harmonie commence à sa basse', wins.map((w) => w.start).join(' ') === '188.75 192 195.25 198.5', wins.map((w) => w.start).join(' '));
// Une note de plus en haut (la tierce de Ré♭, Fa5 ajouté tard) ne ferme pas l'harmonie.
const lateThird = [...together, flash(77, 199.4)].sort((a, b) => a.start - b.start);
check('une note ajoutée en haut ne coupe pas l\'harmonie', harmonyWindows(lateThird).length === 4);
// Retour au Mi♭ grave : une basse plus grave, même sur des notes déjà entendues, rouvre.
const back = [...together, flash(51, 201.75, 0.38), flash(73, 201.75)].sort((a, b) => a.start - b.start);
check('le retour de la basse grave rouvre une harmonie', harmonyWindows(back).length === 5);
// Un silence plus long que MAX_HOLD coupe.
const pause = [...EBM9, ...EBM9.map((n) => ({ ...n, start: n.start + MAX_HOLD + 4, end: n.end + MAX_HOLD + 4 }))];
check('un long silence coupe', harmonyWindows(pause).length === 2);

console.log('Notes tenues');
const h = holdFlashNotes(together);
const bassEb = h.find((n) => n.midi === 51);
check('la basse Mi♭ tient jusqu\'à Sol♭', Math.abs(bassEb.end - 192) < 0.01, String(bassEb.end));
const db5 = h.filter((n) => n.midi === 73 && n.start < 192);
check('une note refrappée s\'arrête à sa frappe suivante', Math.abs(db5[0].end - db5[1].start) < 0.01, `${db5[0].end} / ${db5[1].start}`);
check('les attaques ne bougent pas', h.every((n, i) => n.start === [...together].sort((a, b) => a.start - b.start || a.midi - b.midi)[i].start));
check('jamais plus de MAX_HOLD', h.every((n) => n.end - n.start <= MAX_HOLD + 1e-9));
const long = holdFlashNotes([{ midi: 60, start: 0, end: 3 }, { midi: 64, start: 0.1, end: 0.2 }]);
check('une note déjà longue ne raccourcit pas', long.find((n) => n.midi === 60).end === 3);

console.log('Grille');
const segs = flashSegments(together, labelNotes);
const names = segs.map((s) => s.chord.label);
check('Mi♭m9 → Sol♭maj9 → Si♭m9 → Ré♭maj9', names.length === 4 && /^D#m9|^Ebm9/.test(names[0]) && /maj9/.test(names[1]) && /m9/.test(names[2]) && /maj7|maj9/.test(names[3]), names.join(' '));
check('chaque accord porte ses notes', segs[0].midis.join(' ') === '51 58 61 65 66 73', segs[0].midis.join(' '));

console.log('Relevés');
const samples = notesToSamples([{ midi: 60, start: 0, end: 0.5 }], { fps: 8, duration: 1 });
check('notes → relevés image par image', samples.length === 8 && samples[0].keys.length === 1 && samples[4].keys.length === 0);

console.log(`\n${passed} réussis, ${failed} échoués`);
if (failed) process.exitCode = 1;
