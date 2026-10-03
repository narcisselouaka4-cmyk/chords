// [Claude] — 2026-10-03 — Pédagogie IA : appliquer ce que fait le prof à une autre
// progression (tutorial-transfer.js). Cas écrits à la main, notes vérifiées une à une.
// Sans DOM.
import {
  noteLabel, chordFamily, roleOfInterval, intervalForRole, voicingShapes, describeShape,
  applyVoicings, progressionFromDegrees, parseKey, applyTutorialPassage, prefersSharps,
} from './tutorial-transfer.js';

let passed = 0;
let failed = 0;
function check(label, cond, detail = '') {
  if (cond) { passed += 1; console.log(`  ✅ ${label}`); } else { failed += 1; console.error(`  ❌ ${label}${detail ? ` — ${detail}` : ''}`); }
}
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const hands = (c) => c && `${c.leftHand.join(',')} | ${c.rightHand.join(',')}`;

// Le prof, en Do : main gauche Do2 Si2 (1 · 7), main droite Mi3 Sol3 Ré4 (3 · 5 · 9).
const CMAJ7_NOTES = [
  { midi: 36, start: 1.0, end: 3.8, hand: 'lh' }, { midi: 47, start: 1.01, end: 3.8, hand: 'lh' },
  { midi: 52, start: 1.02, end: 3.8, hand: 'rh' }, { midi: 55, start: 1.02, end: 3.8, hand: 'rh' }, { midi: 62, start: 1.03, end: 3.8, hand: 'rh' },
];
const CMAJ7_GRID = [{ start: 0.9, end: 4, label: 'Cmaj7' }];

console.log('Les notes et les rôles');
check('nom français et octave (Do4 = 60)', noteLabel(60) === 'Do4' && noteLabel(66) === 'Fa♯4' && noteLabel(46) === 'Si♭2');
check('en dièses dans une tonalité à dièses', noteLabel(63, { sharps: true }) === 'Ré♯4' && prefersSharps(['Bmaj7', 'C#7', 'A#m7']) && !prefersSharps(['Ebmaj7', 'Bb7', 'Cm7']));
check('familles d\'accords', chordFamily('maj7') === 'major' && chordFamily('7') === 'dominant' && chordFamily('13') === 'dominant'
  && chordFamily('m9') === 'minor' && chordFamily('m7b5') === 'halfdim' && chordFamily('dim7') === 'dim' && chordFamily('7sus4') === 'sus');
check('rôles : 9e, #9 (avec la tierce majeure), 13, #11', same(roleOfInterval(2, 'maj9'), { role: '9', alt: 2 })
  && same(roleOfInterval(3, '7#9', new Set([4, 10])), { role: '9', alt: 3 }) && same(roleOfInterval(3, 'm7'), { role: '3', alt: 3 })
  && same(roleOfInterval(9, '13'), { role: '13', alt: 9 }) && same(roleOfInterval(6, 'maj7#11'), { role: '11', alt: 6 }));
check('la sixte d\'un accord de sixte tient la place de la 7e', same(roleOfInterval(9, '6'), { role: '7', alt: 9 }));
check('une 11 du mineur devient #11 sur un majeur', intervalForRole({ role: '11', alt: 5 }, 'maj7') === 6 && intervalForRole({ role: '11', alt: 5 }, 'm7') === 5);
check('la 7e prend celle de l\'accord cible', intervalForRole({ role: '7', alt: 11 }, '7') === 10 && intervalForRole({ role: '7', alt: 10 }, 'maj7') === 11
  && intervalForRole({ role: '7', alt: 10 }, 'm6') === 9 && intervalForRole({ role: '7', alt: 10 }, '') === null);
check('la tierce : mineure, majeure, ou la quarte d\'un sus4', intervalForRole({ role: '3', alt: 4 }, 'm7') === 3 && intervalForRole({ role: '3', alt: 3 }, '7') === 4
  && intervalForRole({ role: '3', alt: 4 }, '7sus4') === 5);
check('la 13 d\'une dominante devient b13 sur un altéré qui l\'appelle, la 9 reste 9', intervalForRole({ role: '13', alt: 9 }, 'm7b5') === 8 && intervalForRole({ role: '9', alt: 2 }, 'dim7') === 2);

console.log('Le voicing du prof');
const shapes = voicingShapes(CMAJ7_NOTES, CMAJ7_GRID, { start: 0, end: 5 });
check('un gabarit par accord, main par main, de bas en haut', shapes.length === 1 && describeShape(shapes[0]) === 'main gauche 1 · 7 | main droite 3 · 5 · 9', shapes[0] && describeShape(shapes[0]));
check('les écarts du prof sont gardés', same(shapes[0].hands.rh.map((n) => n.gap), [0, 3, 7]) && same(shapes[0].hands.lh.map((n) => n.gap), [0, 11]));

// La basse posée avant l'accord est gardée ; un reste de l'accord précédent qui
// n'appartient pas au nouvel accord est écarté.
const held = voicingShapes([
  { midi: 61, start: 0, end: 2.1, hand: 'rh' }, // Do♯4, reste d'un A7 : pas dans Dm9
  { midi: 38, start: 1.7, end: 4, hand: 'lh' }, // Ré2, posé avant la main droite
  { midi: 53, start: 2.0, end: 4, hand: 'rh' }, { midi: 57, start: 2.01, end: 4, hand: 'rh' },
  { midi: 60, start: 2.02, end: 4, hand: 'rh' }, { midi: 64, start: 2.02, end: 4, hand: 'rh' },
], [{ start: 1.7, end: 4, label: 'Dm9' }], { start: 0, end: 5 });
check('basse tenue gardée, reste étranger écarté', held.length === 1 && describeShape(held[0]) === 'main gauche 1 | main droite b3 · 5 · b7 · 9', held[0] && describeShape(held[0]));
check('trop peu de notes : pas de gabarit', voicingShapes([{ midi: 60, start: 1, end: 2 }, { midi: 64, start: 1, end: 2 }], CMAJ7_GRID, { start: 0, end: 5 }).length === 0);

console.log('Ses voicings sur 4-5-3-6-2-5-1');
const progression = progressionFromDegrees('4-5-3-6-2-5-1', 'C');
check('4-5-3-6-2-5-1 en Do : accords à quatre sons diatoniques', progression.join(' ') === 'Fmaj7 G7 Em7 Am7 Dm7 G7 Cmaj7', progression.join(' '));
const realized = applyVoicings(shapes, progression);
const expected = {
  // Fa2 Mi3 | La3 Do4 Sol4 : la fondamentale et la 7e à gauche, 3 · 5 · 9 à droite, mêmes écarts.
  Fmaj7: '41,52 | 57,60,67',
  // Sol2 Fa3 | Si3 Ré4 La4 : la 7e devient la 7e mineure de G7.
  G7: '43,53 | 59,62,69',
  Em7: '40,50 | 55,59,66',
  Am7: '33,43 | 48,52,59',
  Dm7: '38,48 | 53,57,64',
  Cmaj7: '36,47 | 52,55,62',
};
check('Fmaj7 : Fa2 Mi3 | La3 Do4 Sol4', hands(realized[0]) === expected.Fmaj7, hands(realized[0]));
check('G7 : Sol2 Fa3 | Si3 Ré4 La4', hands(realized[1]) === expected.G7, hands(realized[1]));
check('Em7 : Mi2 Ré3 | Sol3 Si3 Fa♯4', hands(realized[2]) === expected.Em7, hands(realized[2]));
check('Am7 : La1 Sol2 | Do3 Mi3 Si3', hands(realized[3]) === expected.Am7, hands(realized[3]));
check('Dm7 : Ré2 Do3 | Fa3 La3 Mi4', hands(realized[4]) === expected.Dm7, hands(realized[4]));
check('le Cmaj7 final retombe sur le voicing du prof', hands(realized[6]) === expected.Cmaj7, hands(realized[6]));
check('les mains restent dans le registre du prof (pas de montée d\'accord en accord)',
  realized.every((c) => Math.abs(c.leftHand[0] - 36) <= 7 && Math.abs(c.rightHand[0] - 52) <= 12), realized.map(hands).join(' / '));
check('la main droite reste au-dessus de la gauche', realized.every((c) => Math.min(...c.rightHand) > Math.max(...c.leftHand)));

console.log('Un gabarit par famille d\'accord');
// Le prof joue Dm9 (gauche Ré2 · droite Fa3 La3 Do4 Mi4), G13 (gauche Sol2 · droite Fa3 Si3 Mi4)
// et Cmaj9 (gauche Do2 · droite Mi3 Sol3 Si3 Ré4).
const ii_v_i = [
  { midi: 38, start: 0, end: 1.9, hand: 'lh' }, { midi: 53, start: 0, end: 1.9, hand: 'rh' }, { midi: 57, start: 0, end: 1.9, hand: 'rh' },
  { midi: 60, start: 0, end: 1.9, hand: 'rh' }, { midi: 64, start: 0, end: 1.9, hand: 'rh' },
  { midi: 43, start: 2, end: 3.9, hand: 'lh' }, { midi: 53, start: 2, end: 3.9, hand: 'rh' }, { midi: 59, start: 2, end: 3.9, hand: 'rh' }, { midi: 64, start: 2, end: 3.9, hand: 'rh' },
  { midi: 36, start: 4, end: 6, hand: 'lh' }, { midi: 52, start: 4, end: 6, hand: 'rh' }, { midi: 55, start: 4, end: 6, hand: 'rh' },
  { midi: 59, start: 4, end: 6, hand: 'rh' }, { midi: 62, start: 4, end: 6, hand: 'rh' },
];
const ii_v_i_grid = [{ start: 0, end: 2, label: 'Dm9' }, { start: 2, end: 4, label: 'G13' }, { start: 4, end: 6, label: 'Cmaj9' }];
const familyShapes = voicingShapes(ii_v_i, ii_v_i_grid, { start: 0, end: 6 });
check('trois gabarits : mineur, dominante, majeur', familyShapes.map((s) => s.family).join(' ') === 'minor dominant major'
  && describeShape(familyShapes[1]) === 'main gauche 1 | main droite b7 · 3 · 13', familyShapes.map(describeShape).join(' / '));
const inF = applyVoicings(familyShapes, progressionFromDegrees('2-5-1', 'F'));
check('2-5-1 en Fa : Gm7 prend la forme du Dm9 (Sol2 | Si♭3 Ré4 Fa4 La4)', inF[0]?.from === 'Dm9' && hands(inF[0]) === '43 | 58,62,65,69', hands(inF[0]));
check('C7 prend la forme du G13 (Do3 | Si♭3 Mi4 La4)', inF[1]?.from === 'G13' && hands(inF[1]) === '48 | 58,64,69', hands(inF[1]));
check('Fmaj7 prend la forme du Cmaj9 (Fa2 | La3 Do4 Mi4 Sol4)', inF[2]?.from === 'Cmaj9' && hands(inF[2]) === '41 | 57,60,64,67', hands(inF[2]));
const slash = applyVoicings(familyShapes, ['G7/B']);
check('basse écrite (G7/B) : la main gauche la prend', slash[0]?.leftHand[0] % 12 === 11, hands(slash[0]));
const triad = applyVoicings(shapes, ['F']);
check('accord sans septième : le rôle de la 7e prend la fondamentale', hands(triad[0]) === '41,53 | 57,60,67', hands(triad[0]));

// Un prof qui joue haut (G13 : Sol2 | Fa4 Si4 Mi5 La5) : sa forme, posée sur Bb7, ne
// monte pas au-delà de son propre dessus (La5) — Lab3 Ré4 Sol4 Do5, pas Lab4 … Do6.
const high = voicingShapes([
  { midi: 43, start: 0, end: 2, hand: 'lh' }, { midi: 65, start: 0, end: 2, hand: 'rh' }, { midi: 71, start: 0, end: 2, hand: 'rh' },
  { midi: 76, start: 0, end: 2, hand: 'rh' }, { midi: 81, start: 0, end: 2, hand: 'rh' },
], [{ start: 0, end: 2, label: 'G13' }], { start: 0, end: 3 });
const bb7 = applyVoicings(high, ['Bb7']);
check('forme large posée sur un accord aigu : une octave plus bas plutôt que Do6', hands(bb7[0]) === '46 | 56,62,67,72', hands(bb7[0]));

// Les douze tonalités de 4-5-3-6-2-5-1 avec les voicings de ii-V-I du prof : jamais de
// croisement de mains, dessus de main droite au plus La5 (le dessus du prof), basse
// entre Mi♭2 et La3.
const sweep = voicingShapes([
  ...[50, 65, 69, 72, 76].map((midi) => ({ midi, start: 0, end: 3.8, hand: midi < 60 ? 'lh' : 'rh' })),
  ...[43, 65, 71, 76, 81].map((midi) => ({ midi, start: 4, end: 7.8, hand: midi < 60 ? 'lh' : 'rh' })),
  ...[48, 64, 67, 71, 74].map((midi) => ({ midi, start: 8, end: 11.8, hand: midi < 60 ? 'lh' : 'rh' })),
], [{ start: 0, end: 4, label: 'Dm9' }, { start: 4, end: 8, label: 'G13' }, { start: 8, end: 12, label: 'Cmaj9' }], { start: 0, end: 12 });
const keys = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
const allKeys = keys.flatMap((k) => applyVoicings(sweep, progressionFromDegrees('4-5-3-6-2-5-1', k)));
check('12 tonalités : mains jamais croisées, dessus ≤ La5, basse entre Mi♭2 et La3', allKeys.length === 84
  && allKeys.every((c) => Math.min(...c.rightHand) > Math.max(...c.leftHand) && Math.max(...c.rightHand) <= 81 && c.leftHand[0] >= 39 && c.leftHand[0] <= 57),
  allKeys.filter((c) => !(Math.min(...c.rightHand) > Math.max(...c.leftHand) && Math.max(...c.rightHand) <= 81)).map(hands).join(' / '));

console.log('Progressions en degrés et tonalités');
check('Fa♯ : avec des dièses ; Sol♭ : avec des bémols', progressionFromDegrees('2-5-1', 'F#').join(' ') === 'G#m7 C#7 F#maj7'
  && progressionFromDegrees('2-5-1', 'Gb').join(' ') === 'Abm7 Db7 Gbmaj7');
check('noms français : « Fa♯ », « Si♭ », « Ré bémol »', progressionFromDegrees('2-5-1', 'Fa♯').join(' ') === 'G#m7 C#7 F#maj7'
  && progressionFromDegrees('2-5-1', 'Si♭').join(' ') === 'Cm7 F7 Bbmaj7' && progressionFromDegrees('2-5-1', 'Ré bémol').join(' ') === 'Ebm7 Ab7 Dbmaj7');
check('mineur : ii ø, V7, i m7', progressionFromDegrees('2-5-1', 'Am').join(' ') === 'Bm7b5 E7 Am7' && progressionFromDegrees('2-5-1', 'Sol mineur').join(' ') === 'Am7b5 D7 Gm7');
check('chiffres romains', progressionFromDegrees('ii-V-I', 'C').join(' ') === 'Dm7 G7 Cmaj7');
check('pas une suite de degrés : null', progressionFromDegrees('Fmaj7 G7', 'C') === null && progressionFromDegrees('8-1', 'C') === null);
check('tonalité lue', same(parseKey('Mi♭'), { rootPc: 3, minor: false, flats: true }) && parseKey('F#m').minor === true && parseKey('xyz') === null);

console.log('L\'outil apply_tutorial_passage');
const tool = applyTutorialPassage({ notes: CMAJ7_NOTES, chords: CMAJ7_GRID, start: 0, end: 5, what: 'voicing', targets: progression });
const lines = tool.text.split('\n');
check('le texte dit ce qui est repris du prof', /^_Voicings repris du prof \(0:01 Cmaj7 : main gauche 1 · 7 \| main droite 3 · 5 · 9\) :_$/.test(lines[0]), lines[0]);
check('puis les notes de chaque accord, en français', lines[1] === '- **Fmaj7** : main gauche Fa2 Mi3 · main droite La3 Do4 Sol4'
  && lines[2] === '- **G7** : main gauche Sol2 Fa3 · main droite Si3 Ré4 La4' && lines.length === 8, lines.slice(1, 3).join(' / '));
const ons = (tool.example?.events || []).filter((e) => e.type === 'noteOn');
check('l\'exemple joue ces notes, un accord après l\'autre, mains comprises', ons.length === 35 && tool.example.chords.length === 7
  && same(ons.filter((e) => e.time === 0).map((e) => e.note).sort((a, b) => a - b), [41, 52, 57, 60, 67])
  && ons.filter((e) => e.hand === 'lh').length === 14, `${ons.length}`);
check('titre et sous-titre de l\'exemple', tool.example.title === 'Ses voicings sur Fmaj7 → G7 → Em7 → Am7 → Dm7 → G7 → Cmaj7' && tool.example.subtitle === 'Repris de 0:00–0:05 · 7 accords', tool.example.subtitle);
const sharp = applyTutorialPassage({ notes: CMAJ7_NOTES, chords: CMAJ7_GRID, start: 0, end: 5, targets: progressionFromDegrees('2-5-1', 'F#') });
// (Le prof joue grave, basse Do2 : G#m7 reste dans ce registre.)
check('en Fa♯ : les notes s\'écrivent en dièses', sharp.text.split('\n')[1] === '- **G#m7** : main gauche Sol♯1 Fa♯2 · main droite Si2 Ré♯3 La♯3', sharp.text.split('\n')[1]);
check('« auto » : les voicings', applyTutorialPassage({ notes: CMAJ7_NOTES, chords: CMAJ7_GRID, start: 0, end: 5, what: 'auto', targets: ['Fmaj7'] }).example !== null);
const noShape = applyTutorialPassage({ notes: CMAJ7_NOTES, chords: CMAJ7_GRID, start: 20, end: 30, targets: ['Fmaj7'] });
check('passage sans accord net : dit simplement', !noShape.example && /pas trouvé d'accord du prof assez net entre 0:20 et 0:30/.test(noShape.error), noShape.error);
check('aucun accord cible reconnu : dit simplement', /Aucun accord cible/.test(applyTutorialPassage({ notes: CMAJ7_NOTES, chords: CMAJ7_GRID, start: 0, end: 5, targets: ['xyz'] }).error));

console.log(`\n=== Résultat : ${passed}/${passed + failed} contrôles passés ===`);
if (failed) process.exit(1);
