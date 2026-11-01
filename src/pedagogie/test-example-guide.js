// [Claude] — 2026-09-25 — Tests des notes en mots (example-guide.js) et des
// exemples du Copilote sans marques (copilot-demo.js).
//
// Lancer : node src/pedagogie/test-example-guide.js

import { describeVoiceLeading, frenchPitchName, lineNoteRole } from './example-guide.js';
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

// [Claude] — 2026-09-25 — Le rôle d'une note de ligne sert encore aux portraits
// envoyés au Copilote (texte seul : plus de marques au clavier).
function testLineRoles() {
  check('Ré sur C : 9e, couleur', lineNoteRole(62, 'C', null, 63).text === 'Ré : 9e, couleur de C', lineNoteRole(62, 'C', null, 63).text);
  check('Ré# entre Ré et Mi sur C : passage chromatique vers la 3ce (écrit en dièse)',
    lineNoteRole(63, 'C', 62, 64).text === 'Ré# : passage chromatique de Ré vers Mi, la 3ce de C', lineNoteRole(63, 'C', 62, 64).text);
  check('Ré entre Do et Mi sur Cmaj7 : 9e (couleur disponible)', lineNoteRole(62, 'Cmaj7', 60, 64).text === 'Ré : 9e, couleur de Cmaj7');
  check('Sans accord : la note et son octave', lineNoteRole(60, '', null, null).text === 'Do4');
}

// [Claude] — 2026-09-25 — Narcisse : pas d'étiquettes sur les touches. Les exemples
// ne portent plus de moments à marquer ; leurs touches s'allument en jaune.
function testNoMarksInExamples() {
  const ex = buildChordExample(['Dm9', 'G13', 'Cmaj9']);
  check('Progression : plus de moments à marquer', ex && ex.steps === undefined && ex.chords.length === 3);
  const lick = buildNotesExample([62, 63, 64, 67].map((midi, i) => ({ midi, startOffsetMs: i * 250, durationMs: 200 })), { kind: 'lick', title: 'Lick' });
  check('Lick : seulement des notes (aucun évènement « step »)', lick.steps === undefined && lick.events.every((e) => e.type === 'noteOn' || e.type === 'noteOff'));
  // Même note rejouée juste à la fin de la précédente : relâchement d'abord.
  const repeat = buildNotesExample([{ midi: 60, startOffsetMs: 0, durationMs: 500 }, { midi: 60, startOffsetMs: 500, durationMs: 500 }]);
  const atHalf = repeat.events.filter((e) => Math.abs(e.time - 0.5) < 1e-9).map((e) => e.type).join(',');
  check('Même instant : relâchement avant l\'attaque suivante', atHalf === 'noteOff,noteOn', atHalf);
}

testSpelling();
testVoiceLeading();
testLineRoles();
testNoMarksInExamples();

console.log(`\n=== Résultat : ${passed}/${passed + failed} tests passés ===`);
process.exit(failed === 0 ? 0 : 1);
