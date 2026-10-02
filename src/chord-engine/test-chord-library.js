// [Claude] — 2026-10-02 — Bibliothèque d'accords du Temps réel, revue avec Narcisse
// (« je ne suis pas sûr que tout est bon »). Table d'audit figée (73 voicings jazz :
// 71 % de lectures justes avant la revue), renversements (0/7 avant), orthographe
// jazz, « Aussi » (autres lectures des mêmes notes) et le « ? » honnête.
import { detectChord, chordReadings } from './index.js';
import { jazzChordName } from './naming.js';
import { chordRootName, spellChordNotes, slashBassName, displayNoteName } from './spelling.js';

let passed = 0;
let failed = 0;
function check(label, cond, detail = '') {
  if (cond) { passed += 1; } else { failed += 1; console.error(`  ❌ ${label}${detail ? ` — ${detail}` : ''}`); }
}
const text = (html) => String(html).replace(/<[^>]+>/g, '');
const named = (notes, latin = false) => text(jazzChordName(detectChord(notes), latin));

// Noms acceptés (équivalences : mêmes notes, deux écritures usuelles).
const AUDIT = [
  ['C', [48, 52, 55], ['C']], ['C/E', [52, 55, 60], ['C/E']], ['C/G', [55, 60, 64], ['C/G']], ['Cm', [48, 51, 55], ['Cm']],
  ['Cdim', [48, 51, 54], ['Cdim']], ['Caug', [48, 52, 56], ['Caug']], ['Csus4', [48, 53, 55], ['Csus4']], ['Csus2', [48, 50, 55], ['Csus2']],
  ['Cmaj7', [48, 52, 55, 59], ['Cmaj7']], ['C7', [48, 52, 55, 58], ['C7']], ['Cm7', [48, 51, 55, 58], ['Cm7']], ['Cm7♭5', [48, 51, 54, 58], ['Cm7♭5']],
  ['Cdim7', [48, 51, 54, 57], ['Cdim7']], ['CmMaj7', [48, 51, 55, 59], ['CmMaj7']], ['C7sus4', [48, 53, 55, 58], ['C7sus4']], ['C6', [48, 52, 55, 57], ['C6']],
  ['Cm6', [48, 51, 55, 57], ['Cm6']], ['C7♯5', [48, 52, 56, 58], ['C7♯5']], ['C7♭5', [48, 52, 54, 58], ['C7♭5']],
  ['Cmaj7/E', [52, 55, 59, 60], ['Cmaj7/E']], ['C7/B♭', [58, 60, 64, 67], ['C7/B♭']],
  ['Cmaj9', [48, 52, 55, 59, 62], ['Cmaj9']], ['C9 sans quinte', [48, 52, 58, 62], ['C9']], ['Cm9', [48, 51, 58, 62], ['Cm9']],
  ['C7♭9', [48, 52, 58, 61], ['C7♭9']], ['C7♯9', [48, 52, 58, 63], ['C7♯9']], ['C6/9', [48, 52, 57, 62], ['C6/9']], ['Cm6/9', [48, 51, 57, 62], ['Cm6/9']],
  ['Cadd9', [48, 52, 55, 62], ['Cadd9']], ['Cm(add9)', [48, 51, 55, 62], ['Cmadd9']], ['C9sus4', [48, 53, 58, 62], ['C9sus4']], ['CmMaj9', [48, 51, 55, 59, 62], ['CmMaj9']],
  ['Cm7♭9', [48, 51, 58, 61], ['Cm7♭9']], ['Cm11', [48, 51, 58, 62, 65], ['Cm11']], ['Cmaj7♯11', [48, 52, 55, 59, 66], ['Cmaj7♯11']],
  ['Cmaj9♯11', [48, 52, 59, 62, 66], ['Cmaj9♯11']], ['C7♯11 sans quinte', [48, 52, 58, 66], ['C7♯11', 'C7♭5']], ['C9♯11', [48, 52, 58, 62, 66], ['C9♯11']],
  ['C13', [48, 52, 58, 62, 69], ['C13']], ['C13 (Do Si♭ Mi La)', [48, 58, 64, 69], ['C13']], ['Cm13', [48, 51, 58, 62, 69], ['Cm13']],
  ['Cmaj13', [48, 52, 59, 62, 69], ['Cmaj13']], ['C13♭9', [48, 52, 58, 61, 69], ['C13♭9']], ['C13♯11', [48, 52, 58, 62, 66, 69], ['C13♯11']],
  ['C7♭13', [48, 52, 58, 68], ['C7♭13', 'C7♯5']], ['C7alt (♯9 ♭13)', [48, 52, 58, 63, 68], ['C7♯9♭13']], ['C7♭9♭13', [48, 52, 58, 61, 68], ['C7♭9♭13']],
  ['C7♭5♭9', [48, 52, 54, 58, 61], ['C7♭5♭9']], ['C7♯5♯9', [48, 52, 56, 58, 63], ['C7♯9♭13']], ['C13sus4', [48, 53, 58, 62, 69], ['C13sus4']],
  ['C7sus4♭9', [48, 53, 58, 61], ['C7sus4♭9']], ['Cm9♭5', [48, 51, 54, 58, 62], ['Cm9♭5']], ['C13♯9', [48, 52, 58, 63, 69], ['C13♯9']],
  ['C7♭9♯11 (avec quinte)', [48, 52, 55, 58, 61, 66], ['C7♭9♯11']],
  ['B♭7', [46, 50, 53, 56], ['B♭7']], ['E♭maj7', [51, 55, 58, 62], ['E♭maj7']], ['A♭maj7', [56, 60, 63, 67], ['A♭maj7']], ['D♭7', [49, 53, 56, 59], ['D♭7']],
  ['F♯m7♭5', [54, 57, 60, 64], ['F♯m7♭5']], ['B♭m7', [46, 49, 53, 56], ['B♭m7']], ['E♭m', [51, 54, 58], ['E♭m']], ['G♭maj7', [54, 58, 61, 65], ['G♭maj7']],
  ['F La Do Mi', [53, 57, 60, 64], ['Fmaj7']], ['Fa La Si Mi (G13 sans fondamentale)', [53, 57, 59, 64], ['Fmaj7♯11', 'G13']], ['Mi Sol Si Ré', [52, 55, 59, 62], ['Em7']],
  ['G7 shell', [43, 47, 53], ['G7']], ['Cmaj7 shell', [48, 52, 59], ['Cmaj7']], ['Dm7 shell', [50, 53, 60], ['Dm7']], ['Cm9 complet', [48, 51, 55, 58, 62], ['Cm9']],
  ['Dm9 complet', [50, 53, 57, 60, 64], ['Dm9']], ['G13 (Sol Fa Si Mi)', [43, 53, 59, 64], ['G13']], ['G7♭9 (Sol Fa Si La♭)', [43, 53, 59, 68], ['G7♭9']],
  ['Cm7♭5/G♭', [54, 60, 63, 70], ['Cm7♭5/G♭']], ['Sol Si Do Mi (Cmaj7/G, pas G6add11)', [43, 47, 48, 52], ['Cmaj7/G']],
];

console.log('Audit : voicings jazz');
let auditOk = 0;
for (const [label, notes, accepted] of AUDIT) {
  const got = named(notes);
  const ok = accepted.includes(got);
  if (ok) auditOk += 1;
  check(`${label} → ${accepted.join(' ou ')}`, ok, `lu « ${got} »`);
}
console.log(`  ${auditOk}/${AUDIT.length} lectures justes`);

console.log('Renversements : la vraie basse');
for (const [label, notes, inversion] of [['B♭7 fondamental', [46, 50, 53, 56], 0], ['E♭maj7 fondamental', [51, 55, 58, 62], 0], ['C7/E', [52, 55, 58, 60], 1],
  ['C7/G', [55, 58, 60, 64], 2], ['C7/B♭', [58, 60, 64, 67], 3], ['A♭maj7 fondamental', [56, 60, 63, 67], 0], ['F♯m7♭5 fondamental', [54, 57, 60, 64], 0]]) {
  const r = detectChord(notes);
  check(`${label} → renversement ${inversion}`, r.inversion === inversion, `lu ${r.inversion}`);
}

console.log('« ? » honnête et petites formations');
check('Do Do♯ Ré (amas) → « ? », plus « C »', detectChord([60, 61, 62]).symbol === '?');
check('Do Mi Sol + Ré♭ Ré (deux notes étrangères) → « ? » ou un vrai nom', ['?', 'add9'].includes(detectChord([60, 61, 62, 64, 67]).symbol));
check('une note étrangère se signale (extraPcs)', (detectChord([48, 52, 55, 66]).extraPcs || []).length === 1);
check('deux notes : comportement inchangé (Do Mi → symbole vide)', detectChord([60, 64]).symbol === '');
check('Do Sol → quinte à vide (5)', detectChord([48, 55]).symbol === '5');
check('Ré majeur sur Do majeur → polyaccord D/C', named([36, 40, 43, 50, 54, 57]) === 'D/C' && Boolean(detectChord([36, 40, 43, 50, 54, 57]).polychord));

console.log('Orthographe jazz');
check('fondamentales : B♭7, E♭maj7, A♭maj7, D♭7, G♭maj7, F♯7',
  [[10, '7', 'Bb'], [3, 'maj7', 'Eb'], [8, 'maj7', 'Ab'], [1, '7', 'Db'], [6, 'maj7', 'Gb'], [6, '7', 'F#']].every(([pc, sym, n]) => chordRootName(pc, sym) === n));
check('mineurs : C♯m7, G♯m, E♭m, B♭m7, F♯m', [[1, 'm7', 'C#'], [8, 'm', 'G#'], [3, 'm', 'Eb'], [10, 'm7', 'Bb'], [6, 'm', 'F#']].every(([pc, sym, n]) => chordRootName(pc, sym) === n));
check('diminués en dièses : A♯m7♭5, C♯dim7, D♯m7♭5', [[10, 'm7b5', 'A#'], [1, 'dim7', 'C#'], [3, 'm7b5', 'D#']].every(([pc, sym, n]) => chordRootName(pc, sym) === n));
const names = (midis, chord) => spellChordNotes(midis, chord).map((n) => n.name).join(' ');
check('Cm7 : Do Mi♭ Sol Si♭', names([48, 51, 55, 58], { rootPc: 0, symbol: 'm7' }) === 'C Eb G Bb');
check('C7♯9 : la ♯9 reste D♯', names([48, 52, 58, 63], { rootPc: 0, symbol: '7#9' }) === 'C E Bb D#');
check('Cdim7 : B𝄫', names([48, 51, 54, 57], { rootPc: 0, symbol: 'dim7' }) === 'C Eb Gb Bbb');
check('C7♯5 : G♯ ; C7♭13 : A♭', names([48, 52, 56, 58], { rootPc: 0, symbol: '7#5' }) === 'C E G# Bb' && names([48, 52, 58, 68], { rootPc: 0, symbol: '7b13' }) === 'C E Bb Ab');
check('C7♭5 : G♭ ; C7♯11 avec quinte : F♯', names([48, 52, 54, 58], { rootPc: 0, symbol: '7b5' }) === 'C E Gb Bb' && names([48, 52, 55, 58, 66], { rootPc: 0, symbol: '7#11' }) === 'C E G Bb F#');
check('C6/9 : La et Ré', names([48, 52, 57, 62], { rootPc: 0, symbol: '6/9' }) === 'C E A D');
const bSharp = spellChordNotes([60], { rootPc: 8, symbol: 'm' })[0];
check('Si♯3 dans G♯m : octave et rang diatonique justes', bSharp.name === 'B#' && bSharp.octave === 3 && bSharp.step === 27, JSON.stringify(bSharp));
const cFlat = spellChordNotes([59], { rootPc: 1, symbol: '7' })[0];
check('Do♭4 dans D♭7 : octave 4, rang 28', cFlat.name === 'Cb' && cFlat.octave === 4 && cFlat.step === 28, JSON.stringify(cFlat));
check('Do4 = rang 28, Mi♭4 = rang 30', spellChordNotes([60, 63], { rootPc: 0, symbol: 'm' }).map((n) => n.step).join() === '28,30');
check('sans accord : B♭, E♭, F♯ (comme Sessions MIDI), du grave à l\'aigu', names([58, 66, 63], null) === 'Bb Eb F#');
check('basses en slash : D/F♯, A♭/C, E♭/B♭, C7/B♭',
  slashBassName(6, 2, '') === 'F#' && slashBassName(0, 8, '') === 'C' && slashBassName(10, 3, '') === 'Bb' && slashBassName(10, 0, '7') === 'Bb');
check('affichage : B♭, Si♭, F𝄪, B𝄫, HTML',
  displayNoteName('Bb') === 'B♭' && displayNoteName('Bb', { latin: true }) === 'Si♭' && displayNoteName('F##') === 'F𝄪'
  && displayNoteName('Bbb') === 'B𝄫' && displayNoteName('Bb', { html: true }) === 'B<span class="flat">♭</span>');
check('noms complets : B♭7, Si♭7, D/F♯, D♭7', named([46, 50, 53, 56]) === 'B♭7' && named([46, 50, 53, 56], true) === 'Si♭7'
  && named([54, 57, 62]) === 'D/F♯' && named([49, 53, 56, 59]) === 'D♭7');

console.log('« Aussi » : les autres lectures des mêmes notes');
const also = (notes) => chordReadings(notes).map((r) => `${r.rootPc}:${r.symbol}${r.rootless ? ' sans fond.' : ''}`);
check('C6 → aussi Am7', also([48, 52, 55, 57]).includes('9:m7'), JSON.stringify(also([48, 52, 55, 57])));
check('Cm7 → aussi E♭6', also([48, 51, 55, 58]).includes('3:6'));
check('Cdim7 → les quatre lectures', ['0:dim7', '3:dim7', '6:dim7', '9:dim7'].every((k) => also([48, 51, 54, 57]).includes(k)));
check('Fa La Si Mi → aussi G13 sans fondamentale', also([53, 57, 59, 64]).includes('7:13 sans fond.'), JSON.stringify(also([53, 57, 59, 64])));
check('la lecture retenue est en tête', also([48, 52, 55, 57])[0] === '0:6');
check('deux notes : pas d\'autres lectures', chordReadings([60, 64]).length === 0);
check('Cmaj7♯11 : pas de « Gmaj13/C » (deux notes omises)', !also([48, 52, 55, 59, 66]).includes('7:maj13'), JSON.stringify(also([48, 52, 55, 59, 66])));
check('triade de Ré : pas de « Bm7 sans fondamentale »', !also([54, 57, 62]).some((k) => k.includes('sans fond.')), JSON.stringify(also([54, 57, 62])));

console.log(`\nRésultat : ${passed}/${passed + failed} contrôles passés`);
if (failed) process.exit(1);
