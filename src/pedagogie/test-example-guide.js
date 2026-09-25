// [Claude] — 2026-09-25 — Tests de ce que le clavier montre pendant un exemple du
// Copilote (example-guide.js, et les moments ajoutés par copilot-demo.js).
//
// Lancer : node src/pedagogie/test-example-guide.js

import { chordExampleSteps, notesExampleSteps, describeVoiceLeading, frenchPitchName } from './example-guide.js';
import { buildChordExample, buildNotesExample } from './copilot-demo.js';

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

function testSpelling() {
  check('Nom écrit d\'après l\'accord : 3ce de G7 = Si, 7e de Bbmaj7 = La, #9 de C7#9 = Ré#',
    frenchPitchName(59, 'G7') === 'Si' && frenchPitchName(57, 'Bbmaj7') === 'La' && frenchPitchName(63, 'C7#9') === 'Ré#',
    [frenchPitchName(59, 'G7'), frenchPitchName(57, 'Bbmaj7'), frenchPitchName(63, 'C7#9')].join(' '));
  check('Sans accord : nom en bémol', frenchPitchName(61) === 'Réb');
}

function testVoiceLeading() {
  const dm7 = { name: 'Dm7', leftHand: [38], rightHand: [53, 57, 60, 64] };
  const g7 = { name: 'G7', leftHand: [43], rightHand: [53, 57, 59, 62] };
  const vl = describeVoiceLeading(dm7, g7);
  const res = vl.moves.find((m) => m.kind === 'resolution');
  check('Dm7 → G7 : la 7e (Do4) descend sur la 3ce (Si3)', res?.from === 60 && res?.to === 59, JSON.stringify(vl.moves));
  check('Dm7 → G7 : Fa reste (3ce → 7e)', vl.moves.some((m) => m.kind === 'common' && m.from === 53 && m.fromDegree === 'b3' && m.toDegree === 'b7'));
  check('Dm7 → G7 : phrase', vl.text === 'Do (7e) descend sur Si, la 3ce de G7 ; Fa reste (3ce → 7e)', vl.text);
  check('La basse ne conduit pas les voix', !vl.moves.some((m) => m.from === 38));
}

function testChordSteps() {
  const ex = buildChordExample(['Dm9', 'G13', 'Cmaj9']);
  check('Progression : un moment par accord', ex.steps?.length === 3, String(ex.steps?.length));
  const stepEvents = ex.events.filter((e) => e.type === 'step').map((e) => e.step);
  check('Progression : la démo annonce chaque accord (évènements « step » 0, 1, 2)', [0, 1, 2].every((i) => stepEvents.includes(i)), stepEvents.join(','));
  const first = ex.steps[0];
  check('Dm9 → G13 : légende 7e → 3ce', /Do \(7e\) descend sur Si, la 3ce de G13/.test(first.caption), first.caption);
  const c4 = first.marks.find((m) => m.midi === 60);
  check('Dm9 : Do4 marqué b7 (note guide) et « va bouger »', c4?.label === 'b7' && c4.kind === 'guide' && c4.moving, JSON.stringify(c4));
  check('Dm9 : la fondamentale de la main gauche marquée 1', first.marks.some((m) => m.kind === 'root' && m.label === '1' && m.midi < 48));
  check('Dernier accord : où la 7e est arrivée', /Cmaj9 : la 7e de G13 \(Fa\) est arrivée sur Mi, la 3ce/.test(ex.steps[2].caption), ex.steps[2].caption);
  check('Dernier accord : plus rien ne bouge', ex.steps[2].marks.every((m) => !m.moving));
  const triads = chordExampleSteps(buildChordExample(['F', 'G', 'Am']).chords);
  check('Triades F → G : la quinte descend sur la 3ce de G', /Do \(quinte\) descend sur Si \(3ce de G\)/.test(triads[0].caption), triads[0].caption);
  const single = buildChordExample(['Cmaj9']).steps[0];
  check('Un seul accord : les deux mains et leurs rôles', /^Cmaj9 : Do \(fondamentale\).*\| Mi \(3ce\).*Si \(7e majeure\) Ré \(9e\)$/.test(single.caption), single.caption);
}

function testLineSteps() {
  const lick = [62, 63, 64, 67].map((midi, i) => ({ midi, startOffsetMs: i * 250, durationMs: 200 }));
  const ex = buildNotesExample(lick, { kind: 'lick', title: 'Lick', chord: 'C' });
  check('Lick : un moment par note', ex.steps.length === 4 && ex.events.filter((e) => e.type === 'step').length === 4);
  check('Lick : Ré = 9e (couleur)', ex.steps[0].caption === 'Ré : 9e, couleur de C', ex.steps[0].caption);
  check('Lick : Ré# = passage chromatique vers Mi, la 3ce (écrit en dièse)', ex.steps[1].caption === 'Ré# : passage chromatique de Ré vers Mi, la 3ce de C', ex.steps[1].caption);
  const shape = ex.steps[0].marks.map((m) => `${m.midi}:${m.kind}`).join(' ');
  check('Lick : toute la forme montrée dès la première note', shape === '62:color 63:passing 64:guide 67:fifth', shape);
  const at = (i) => ex.events.findIndex((e) => e.type === 'step' && e.step === i);
  const onAt = (t) => ex.events.findIndex((e) => e.type === 'noteOn' && Math.abs(e.time - t) < 1e-9);
  check('Lick : le moment s\'annonce juste avant sa note', at(1) < onAt(0.25) && at(1) >= 0);
  const passing = notesExampleSteps([60, 62, 64].map((midi, i) => ({ midi, startOffsetMs: i * 300 })), { chord: 'Cmaj7' });
  check('Ré entre Do et Mi sur Cmaj7 : 9e (couleur disponible)', passing[1].caption === 'Ré : 9e, couleur de Cmaj7', passing[1].caption);
  const scale = notesExampleSteps([60, 62, 64].map((midi, i) => ({ midi, startOffsetMs: i * 400 })));
  check('Sans accord : la note et son octave', scale.map((s) => s.caption).join(' ') === 'Do4 Ré4 Mi4');
}

function testGuideToneBlocks() {
  const blocks = [
    { midi: 50, hand: 'LH', chord: 'Dm7', startOffsetMs: 0 }, { midi: 65, chord: 'Dm7', startOffsetMs: 0 }, { midi: 72, chord: 'Dm7', startOffsetMs: 0 },
    { midi: 43, hand: 'LH', chord: 'G7', startOffsetMs: 1600 }, { midi: 65, chord: 'G7', startOffsetMs: 1600 }, { midi: 71, chord: 'G7', startOffsetMs: 1600 },
  ];
  const steps = notesExampleSteps(blocks);
  check('Guide tones en blocs : lus comme des accords', steps.length === 2 && /Do \(7e\) descend sur Si, la 3ce de G7/.test(steps[0].caption), steps.map((s) => s.caption).join(' / '));
  check('Guide tones : Do5 va bouger', steps[0].marks.find((m) => m.midi === 72)?.moving === true);
}

testSpelling();
testVoiceLeading();
testChordSteps();
testLineSteps();
testGuideToneBlocks();

console.log(`\n=== Résultat : ${passed}/${passed + failed} tests passés ===`);
process.exit(failed === 0 ? 0 : 1);
