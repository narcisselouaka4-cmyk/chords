// [Claude] — 2026-10-03 — Pédagogie IA : appliquer ce que fait le prof à une autre
// progression (tutorial-transfer.js). Cas écrits à la main, notes vérifiées une à une.
// Sans DOM.
import {
  noteLabel, chordFamily, roleOfInterval, intervalForRole, voicingShapes, describeShape,
  applyVoicings, progressionFromDegrees, parseKey, applyTutorialPassage, prefersSharps,
  spellInChord, passingMoves, applyPassingMoves, relationLabel,
  chordScale, lickLine, describeLick, realizeLick, lickPlacements,
} from './tutorial-transfer.js';
import { parseChordName } from './note-roles.js';

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
  // La2 Sol3 | Do4 Mi4 Si4 : La1 Sol2 serait plus boueux dans le grave que Do2 Si2 du prof.
  Am7: '45,55 | 60,64,71',
  Dm7: '38,48 | 53,57,64',
  Cmaj7: '36,47 | 52,55,62',
};
check('Fmaj7 : Fa2 Mi3 | La3 Do4 Sol4', hands(realized[0]) === expected.Fmaj7, hands(realized[0]));
check('G7 : Sol2 Fa3 | Si3 Ré4 La4', hands(realized[1]) === expected.G7, hands(realized[1]));
check('Em7 : Mi2 Ré3 | Sol3 Si3 Fa♯4', hands(realized[2]) === expected.Em7, hands(realized[2]));
check('Am7 : La2 Sol3 | Do4 Mi4 Si4 (pas plus boueux que le prof)', hands(realized[3]) === expected.Am7, hands(realized[3]));
check('Dm7 : Ré2 Do3 | Fa3 La3 Mi4', hands(realized[4]) === expected.Dm7, hands(realized[4]));
check('le Cmaj7 final retombe sur le voicing du prof', hands(realized[6]) === expected.Cmaj7, hands(realized[6]));
check('les mains restent dans le registre du prof, à l\'octave près (pas de montée d\'accord en accord)',
  realized.every((c) => Math.abs(c.leftHand[0] - 36) <= 12 && Math.abs(c.rightHand[0] - 52) <= 12), realized.map(hands).join(' / '));
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
check('en Fa♯ : les notes s\'écrivent en dièses', sharp.text.split('\n')[1] === '- **G#m7** : main gauche Sol♯2 Fa♯3 · main droite Si3 Ré♯4 La♯4', sharp.text.split('\n')[1]);
check('« auto » : les voicings', applyTutorialPassage({ notes: CMAJ7_NOTES, chords: CMAJ7_GRID, start: 0, end: 5, what: 'auto', targets: ['Fmaj7'] }).example !== null);
const noShape = applyTutorialPassage({ notes: CMAJ7_NOTES, chords: CMAJ7_GRID, start: 20, end: 30, targets: ['Fmaj7'] });
check('passage sans accord net : dit simplement', !noShape.example && /pas trouvé d'accord du prof assez net entre 0:20 et 0:30/.test(noShape.error), noShape.error);
check('aucun accord cible reconnu : dit simplement', /Aucun accord cible/.test(applyTutorialPassage({ notes: CMAJ7_NOTES, chords: CMAJ7_GRID, start: 0, end: 5, targets: ['xyz'] }).error));

console.log('Orthographe dans l\'accord');
check('Sol♭ dans Ab7, Ré♯ dans Bmaj7, Si♭ (bb7) dans C#dim7, Do♯ (3) dans A7#9', spellInChord(66, 'Ab7') === 'Sol♭4' && spellInChord(63, 'Bmaj7') === 'Ré♯4'
  && spellInChord(58, 'C#dim7') === 'Si♭3' && spellInChord(61, 'A7#9') === 'Do♯4');
check('orthographe illisible (Mi♯, Si♯) : le nom courant', spellInChord(65, 'C#7') === 'Fa4' && spellInChord(60, 'A7#9') === 'Do4' && spellInChord(70, 'Gb7') === 'Si♭4');

// ── Lot 3 : ses enchaînements ──────────────────────────────────────────────────
console.log('Ses accords de passage');
// Le prof, en Do : Cmaj7 (2 s) → C#dim7 (0,5 s) → Dm7 (2 s) → Db7 (0,5 s) → Cmaj7 (2 s).
const PASS_GRID = [
  { start: 0, end: 2, label: 'Cmaj7' }, { start: 2, end: 2.5, label: 'C#dim7' }, { start: 2.5, end: 4.5, label: 'Dm7' },
  { start: 4.5, end: 5, label: 'Db7' }, { start: 5, end: 7, label: 'Cmaj7' },
];
const block = (t, d, lh, rh) => [...lh.map((midi) => ({ midi, start: t, end: t + d - 0.05, hand: 'lh' })), ...rh.map((midi) => ({ midi, start: t + 0.01, end: t + d - 0.05, hand: 'rh' }))];
const PASS_NOTES = [
  ...block(0, 2, [36, 47], [52, 55, 62]), ...block(2, 0.5, [37], [52, 55, 58]), ...block(2.5, 2, [38, 48], [53, 57, 64]),
  ...block(4.5, 0.5, [37, 47], [53, 56, 63]), ...block(5, 2, [36, 47], [52, 55, 62]),
];
const found = passingMoves(PASS_GRID, { start: 0, end: 7, key: 'C' });
check('deux enchaînements relevés, décrits par rapport à l\'accord d\'arrivée', found.moves.length === 2
  && found.moves[0].chain[0].name === 'C#dim7' && found.moves[0].chain[0].interval === 11 && found.moves[0].to.name === 'Dm7' && found.moves[0].motion === 2
  && found.moves[1].chain[0].name === 'Db7' && found.moves[1].chain[0].interval === 1 && found.moves[1].to.name === 'Cmaj7',
  JSON.stringify(found.moves.map((m) => [m.chain.map((c) => c.name), m.to.name])));
check('sa durée relative (0,5 s sur 2,5 s)', Math.abs(found.moves[0].chain[0].share - 0.2) < 1e-9);
check('relations en mots', /diminué un demi-ton sous l'accord d'arrivée/.test(found.moves[0].chain[0].relation) && /substitution tritonique/.test(found.moves[1].chain[0].relation));
check('relations : dominante, backdoor, IV mineur, glissement', relationLabel({ interval: 7, family: 'dominant' }, 'minor') === 'dominante de l\'accord d\'arrivée'
  && /backdoor/.test(relationLabel({ interval: 10, family: 'dominant' }, 'major')) && /IV mineur/.test(relationLabel({ interval: 5, family: 'minor' }, 'major'))
  && /glissement/.test(relationLabel({ interval: 1, family: 'minor' }, 'minor')));
check('accords de même durée, dans la tonalité : pas de passage', passingMoves([{ start: 0, end: 2, label: 'Dm7' }, { start: 2, end: 4, label: 'G7' }, { start: 4, end: 6, label: 'Cmaj7' }], { start: 0, end: 6, key: 'C' }).moves.length === 0);
check('accord hors tonalité dans une relation connue : passage même s\'il dure (IV mineur)',
  passingMoves([{ start: 0, end: 2, label: 'F' }, { start: 2, end: 4, label: 'Fm6' }, { start: 4, end: 6, label: 'C' }], { start: 0, end: 6, key: 'C' }).moves[0]?.chain[0]?.name === 'Fm6');

const prog7 = progressionFromDegrees('4-5-3-6-2-5-1', 'C');
const placed = applyPassingMoves(found.moves, prog7);
const seq = placed.sequence;
const seqText = seq.map((c) => (c.passing ? `(${c.name})` : c.name)).join(' ');
const show = (r) => r.sequence.map((c) => (c.passing ? `(${c.name})` : c.name)).join(' ');
// Diminué sur la sensible devant chaque accord mineur (et entre Fa et Sol : même montée
// d'un ton que Cmaj7 → Dm7) ; substitution tritonique devant le I ; rien devant G7 après Dm7.
check('4-5-3-6-2-5-1 : ses passages là où il s\'en sert (même genre d\'accord, ou même mouvement de basse)',
  seqText === 'Fmaj7 (F#dim7) G7 (D#dim7) Em7 (G#dim7) Am7 (C#dim7) Dm7 G7 (Db7) Cmaj7' && !placed.everywhere, seqText);
check('durées : le passage prend sa part sur l\'accord qui le précède', seq[0].seconds === 1.6 && seq[1].seconds === 0.4 && seq[seq.length - 1].seconds === 2);
// Garde-fous (ceux des Exercices) : pas de doublon de l'accord précédent, pas de
// diminué après la dominante qui mène déjà à l'accord, rien quand la basse avance d'un demi-ton.
const v7 = passingMoves([{ start: 0, end: 2, label: 'Fmaj7' }, { start: 2, end: 2.5, label: 'D7' }, { start: 2.5, end: 4.5, label: 'Gm7' }], { start: 0, end: 5, key: 'F' });
check('dominante de l\'arrivée : pas de G7 glissé après G7 (Dm7 G7 → C)', show(applyPassingMoves(v7.moves, ['Dm7', 'G7', 'Cmaj7'])) === 'Dm7 (D7) G7 Cmaj7', show(applyPassingMoves(v7.moves, ['Dm7', 'G7', 'Cmaj7'])));
check('… et dit qu\'il a fallu le glisser ailleurs que là où le prof s\'en sert', applyPassingMoves(v7.moves, ['Dm7', 'G7', 'Cmaj7']).everywhere === true);
check('pas de diminué après la dominante qui mène déjà à l\'accord (G7 → C)', !applyPassingMoves(found.moves.slice(0, 1), ['G7', 'Cmaj7']).sequence.some((c) => c.passing));
check('basse qui avance d\'un demi-ton : pas de passage (B7 → Cmaj7)', !applyPassingMoves(found.moves, ['Bm7', 'Cmaj7']).sequence.some((c) => c.passing));
// Sa substitution tritonique de V → I (G13 → Db9 → Cmaj9) : sur chaque quinte descendante.
const tritone = passingMoves([{ start: 0, end: 2, label: 'G13' }, { start: 2, end: 2.5, label: 'Db9' }, { start: 2.5, end: 4.5, label: 'Cmaj9' }], { start: 0, end: 5, key: 'C' });
check('substitution tritonique : sur chaque quinte descendante (chromatisme à la basse)', show(applyPassingMoves(tritone.moves, prog7)) === 'Fmaj7 G7 Em7 (Bb9) Am7 (Eb9) Dm7 (Ab9) G7 (Db9) Cmaj7', show(applyPassingMoves(tritone.moves, prog7)));

// II-V vers l'arrivée et marche de basse.
const iiV = passingMoves([{ start: 0, end: 2, label: 'Cmaj7' }, { start: 2, end: 2.5, label: 'Em7b5' }, { start: 2.5, end: 3, label: 'A7' }, { start: 3, end: 5, label: 'Dm7' }], { start: 0, end: 5, key: 'C' });
check('II-V vers l\'arrivée : deux passages, décrits comme tels', iiV.moves[0]?.chain.map((c) => c.relation).join(' / ') === 'II du II-V de l\'accord d\'arrivée / V du II-V de l\'accord d\'arrivée');
check('… glissé devant G7 : Am7b5 D7', applyPassingMoves(iiV.moves, ['Fmaj7', 'G7']).sequence.map((c) => c.name).join(' ') === 'Fmaj7 Am7b5 D7 G7');
const walk = passingMoves([{ start: 0, end: 2, label: 'C' }, { start: 2, end: 2.5, label: 'C/E' }, { start: 2.5, end: 4.5, label: 'F' }], { start: 0, end: 5, key: 'C' });
check('basse qui monte vers l\'arrivée (C/E → F) : D/F# devant G', /la basse marche vers elle/.test(walk.moves[0]?.chain[0]?.relation || '')
  && applyPassingMoves(walk.moves, ['F', 'G']).sequence.map((c) => c.name).join(' ') === 'F D/F# G', applyPassingMoves(walk.moves, ['F', 'G']).sequence.map((c) => c.name).join(' '));

console.log('L\'outil, pour ses enchaînements');
const ench = applyTutorialPassage({ notes: PASS_NOTES, chords: PASS_GRID, start: 0, end: 7, what: 'enchainement', targets: prog7, key: 'C' });
const enchLines = ench.text.split('\n');
check('le texte dit ses enchaînements, puis ses voicings', /^_Enchaînement repris du prof \(0:02 : Cmaj7 → C#dim7 → Dm7, diminué un demi-ton sous l'accord d'arrivée/.test(enchLines[0])
  && /^_Joués avec ses voicings \(0:00 Cmaj7 : main gauche 1 · 7 \| main droite 3 · 5 · 9 ; 0:02 C#dim7 : main gauche 1 \| main droite b3 · b5 · bb7/.test(enchLines[1]), enchLines.slice(0, 2).join(' / '));
check('les accords de passage en italique, avec leurs notes et leurs mains, chacun avec SA forme', enchLines[3] === '- _F#dim7_ (passage) : main gauche Fa♯2 · main droite La3 Do4 Mi♭4'
  && enchLines[12] === '- _Db7_ (passage) : main gauche Ré♭2 Si2 · main droite Fa3 La♭3 Mi♭4' && enchLines.length === 14, enchLines.slice(3, 14).join(' / '));
const onsAt = (ex, t) => (ex?.events || []).filter((e) => e.type === 'noteOn' && Math.abs(e.time - t) < 1e-6).map((e) => e.note).sort((a, b) => a - b).join(',');
check('l\'exemple : le passage arrive à 1,6 s, l\'accord suivant à 2 s', onsAt(ench.example, 1.6) === '42,57,60,63' && onsAt(ench.example, 2) === '43,53,59,62,69', `${onsAt(ench.example, 1.6)} | ${onsAt(ench.example, 2)}`);
const auto = applyTutorialPassage({ notes: PASS_NOTES, chords: PASS_GRID, start: 0, end: 7, what: 'auto', targets: ['Dm7', 'G7', 'Cmaj7'], key: 'C' });
check('« auto » : ses accords de passage quand le passage en a', /^_Enchaînement repris du prof/.test(auto.text));
const none = applyTutorialPassage({ notes: CMAJ7_NOTES, chords: CMAJ7_GRID, start: 0, end: 5, what: 'enchainement', targets: ['Dm7', 'G7'], key: 'C' });
check('pas d\'accord de passage : dit tel quel, et ses voicings à la place', /Pas d'accord de passage entre 0:00 et 0:05 : il enchaîne directement Cmaj7\. Voici ses voicings sur ta progression\./.test(none.text) && none.example, none.text.split('\n')[0]);
check('« auto » sans accord de passage : ses voicings', /^_Voicings repris du prof/.test(applyTutorialPassage({ notes: CMAJ7_NOTES, chords: CMAJ7_GRID, start: 0, end: 5, what: 'auto', targets: ['Dm7'] }).text));

// ── Lot 4 : ses licks, runs et fills ───────────────────────────────────────────
console.log('Sa ligne (lick, run, fill)');
// Le prof, sur G7 → Cmaj7 : gauche Sol2 Fa3 puis Do2 Si2 ; droite un accord, puis la ligne
// Ré5 Do5 Si4 La4 Fa♯4 Sol4 | Mi4 (5 · 11 · 3 · 9 · approche chromatique · 1 | la 3 de Do).
const LICK_GRID = [{ start: 0, end: 2, label: 'G7' }, { start: 2, end: 4, label: 'Cmaj7' }];
const LICK_NOTES = [
  { midi: 43, start: 0, end: 1.95, hand: 'lh' }, { midi: 53, start: 0, end: 1.95, hand: 'lh' },
  { midi: 59, start: 0, end: 0.9, hand: 'rh' }, { midi: 62, start: 0, end: 0.9, hand: 'rh' }, { midi: 65, start: 0, end: 0.9, hand: 'rh' },
  ...[[74, 1.0], [72, 1.15], [71, 1.3], [69, 1.45], [66, 1.6], [67, 1.75], [64, 2.0, 0.6]].map(([midi, start, d = 0.14]) => ({ midi, start, end: start + d, hand: 'rh' })),
  { midi: 36, start: 2, end: 3.95, hand: 'lh' }, { midi: 47, start: 2, end: 3.95, hand: 'lh' },
];
const lick = lickLine(LICK_NOTES, LICK_GRID, { start: 0, end: 4 });
check('la ligne de la main droite, sans son accord, sur G7 → Cmaj7', lick?.hand === 'rh' && lick.notes.map((n) => n.midi).join(' ') === '74 72 71 69 66 67 64'
  && lick.chords.map((c) => c.name).join(' ') === 'G7 Cmaj7', lick && lick.notes.map((n) => n.midi).join(' '));
check('chaque note par rapport à l\'accord dessous (entre parenthèses : chromatique)', describeLick(lick) === '5 · 11 · 3 · 9 · (7) · 1 | 3', describeLick(lick));
check('note de l\'accord, note de gamme, note chromatique', lick.notes.map((n) => n.role.kind).join(' ') === 'role scale role role chromatic role role');
check('gamme de l\'accord : dorien, mixolydien, altérée, locrien, diminuée, lydien',
  ['m7', '7', '7alt', 'm7b5', 'dim7', 'maj7#11', '7b9', 'maj7'].map((q) => chordScale(q).id).join(' ') === 'dorian mixolydian altered locrian diminished-wh lydian diminished-hw major');
const onTargets = (names) => realizeLick(lick, names.map((n) => parseChordName(n))).join(' ');
check('sur ses propres accords : sa ligne telle quelle', onTargets(['G7', 'Cmaj7']) === '74 72 71 69 66 67 64');
check('sur C7 → Fmaj7 : la même ligne, une quarte plus haut', onTargets(['C7', 'Fmaj7']) === '79 77 76 74 71 72 69', onTargets(['C7', 'Fmaj7']));
check('sur A7 → Dm7 : la note d\'arrivée devient la tierce mineure (Fa)', onTargets(['A7', 'Dm7']) === '76 74 73 71 68 69 65', onTargets(['A7', 'Dm7']));
check('sur Am7 → Dm7 : 3 → b3, la 4te de la gamme reste la 4te (dorien)', onTargets(['Am7', 'Dm7']) === '76 74 72 71 68 69 65', onTargets(['Am7', 'Dm7']));
const places = lickPlacements(lick, progressionFromDegrees('4-5-3-6-2-5-1', 'C').map((n) => parseChordName(n)));
check('4-5-3-6-2-5-1 : sur ses quintes descendantes, G7 → Cmaj7 d\'abord, sans chevauchement', places.at.join(',') === '3,5' && !places.everywhere, JSON.stringify(places));
check('aucune quinte descendante : sur chaque paire, et dit', lickPlacements(lick, ['C', 'D', 'E'].map((n) => parseChordName(n))).everywhere === true);
// Un run sur un seul accord : Do6 → Do5 sur Cmaj7, avec la #11 (Fa♯).
const RUN_GRID = [{ start: 0, end: 3, label: 'Cmaj7' }];
const RUN_NOTES = [84, 83, 81, 79, 78, 76, 74, 72].map((midi, i) => ({ midi, start: 0.5 + i * 0.1, end: 0.58 + i * 0.1, hand: 'rh' }));
const run = lickLine(RUN_NOTES, RUN_GRID, { start: 0, end: 3 });
// Fa6 → Fa5 : la transposition la plus proche de son registre (une quarte plus haut).
check('un run sur un accord : sa #11 reste la #11 (Si sur Fmaj7)', run && realizeLick(run, [parseChordName('Fmaj7')]).join(' ') === '89 88 86 84 83 81 79 77', run && realizeLick(run, [parseChordName('Fmaj7')]).join(' '));
check('… posé sur chaque accord majeur de la progression', lickPlacements(run, progressionFromDegrees('4-5-3-6-2-5-1', 'C').map((n) => parseChordName(n))).at.join(',') === '0,6');
const rolled = lickLine([60, 64, 67, 71].map((midi, i) => ({ midi, start: 1 + i * 0.06, end: 2.5, hand: 'rh' })), RUN_GRID, { start: 0, end: 3 });
check('un accord arpégé n\'est pas un lick', rolled === null);

console.log('L\'outil, pour sa ligne');
const lickTool = applyTutorialPassage({ notes: LICK_NOTES, chords: LICK_GRID, start: 0, end: 4, what: 'lick', targets: progressionFromDegrees('4-5-3-6-2-5-1', 'C') });
const lickLines = lickTool.text.split('\n');
check('le texte dit sa ligne, puis ses notes sur chaque place', /^_Lick repris du prof \(0:01–0:02, main droite, sur G7 → Cmaj7 : 5 · 11 · 3 · 9 · \(7\) · 1 \| 3/.test(lickLines[0])
  && lickLines[1] === '- **Am7 → Dm7** : main droite Mi5 Ré5 Do5 Si4 Sol♯4 La4 Fa4' && lickLines[2] === '- **G7 → Cmaj7** : main droite Ré5 Do5 Si4 La4 Fa♯4 Sol4 Mi4'
  && lickLines[3] === '_Accompagné de ses voicings._', lickLines.join(' / '));
// Accords toutes les 2 s : Am7 à 6 s, Dm7 à 8 s ; la note d'arrivée (Fa4) tombe avec Dm7.
const lickOns = (lickTool.example?.events || []).filter((e) => e.type === 'noteOn');
check('l\'exemple : sa note d\'arrivée tombe avec l\'accord d\'arrivée, son rythme est gardé', lickOns.some((e) => e.note === 65 && Math.abs(e.time - 8) < 1e-6)
  && lickOns.some((e) => e.note === 76 && Math.abs(e.time - 7) < 1e-6) && lickOns.some((e) => e.note === 74 && Math.abs(e.time - 7.15) < 1e-6),
  lickOns.filter((e) => e.time >= 6.9 && e.time <= 8.1).map((e) => `${e.note}@${e.time}`).join(' '));
check('… et la main gauche l\'accompagne avec ses voicings', lickOns.some((e) => e.hand === 'lh' && Math.abs(e.time - 6) < 1e-6));
check('« auto » : sa ligne quand elle finit dans la seconde moitié du passage', /^_Lick repris du prof/.test(applyTutorialPassage({ notes: LICK_NOTES, chords: LICK_GRID, start: 0, end: 4, what: 'auto', targets: ['Dm7', 'G7'] }).text));
const noLine = applyTutorialPassage({ notes: CMAJ7_NOTES, chords: CMAJ7_GRID, start: 0, end: 5, what: 'lick', targets: ['Dm7', 'G7'] });
check('pas de ligne dans le passage : dit tel quel, et ses voicings à la place', /^_\(Pas de ligne de notes seules \(lick, run, fill\) entre 0:00 et 0:05 : il y joue des accords\. Voici ses voicings sur ta progression\.\)_/.test(noLine.text) && noLine.example, noLine.text.split('\n')[0]);

console.log(`\n=== Résultat : ${passed}/${passed + failed} contrôles passés ===`);
if (failed) process.exit(1);
