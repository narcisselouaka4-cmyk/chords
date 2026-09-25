// [Claude] — 2026-09-25 — Tests du pas à pas au clavier (copilot-steps.js) : étapes
// d'un exemple ou d'un passage, jugement de ce qui est joué, retour au clavier.
//
// Lancer : node src/pedagogie/test-copilot-steps.js

import { stepsFromExample, stepsFromMoments, judgeChordStep, judgeSequenceStep, stepFeedback } from './copilot-steps.js';
import { buildChordExample, buildNotesExample } from './copilot-demo.js';
import { reviewTake, takeMarks } from '../recorder/take-review.js';

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

function testStepsFromExamples() {
  const prog = stepsFromExample(buildChordExample(['Dm9', 'G13', 'Cmaj9']));
  check('Progression : une étape par accord', prog.length === 3 && prog.every((s) => s.kind === 'chord'), prog.map((s) => s.kind).join(' '));
  check('Progression : notes des deux mains, rôles, légende de l\'exemple', prog[0].notes.length >= 4 && prog[0].marks.some((m) => m.label === 'b7') && /Do \(7e\) descend sur Si/.test(prog[0].caption), prog[0].caption);
  const lick = buildNotesExample([62, 63, 64, 67, 65, 64, 62, 60].map((midi, i) => ({ midi, startOffsetMs: i * 250, durationMs: 200 })), { chord: 'C' });
  const steps = stepsFromExample(lick);
  check('Lick de 8 notes : deux étapes de 4 notes à jouer dans l\'ordre', steps.length === 2 && steps.every((s) => s.kind === 'sequence' && s.notes.length === 4), steps.map((s) => s.notes.join(',')).join(' | '));
  check('Lick : les touches numérotées dans l\'ordre', steps[0].marks.map((m) => m.label).join('') === '1234');
  const blocks = buildNotesExample([
    { midi: 50, hand: 'LH', chord: 'Dm7', startOffsetMs: 0 }, { midi: 65, chord: 'Dm7', startOffsetMs: 0 }, { midi: 72, chord: 'Dm7', startOffsetMs: 0 },
    { midi: 43, hand: 'LH', chord: 'G7', startOffsetMs: 1600 }, { midi: 65, chord: 'G7', startOffsetMs: 1600 }, { midi: 71, chord: 'G7', startOffsetMs: 1600 },
  ], { kind: 'progression' });
  const guide = stepsFromExample(blocks);
  check('Guide tones en blocs : des accords, avec leur nom', guide.length === 2 && guide.every((s) => s.kind === 'chord') && guide[1].name === 'G7', JSON.stringify(guide.map((s) => [s.kind, s.name])));
}

function testJudgeChord() {
  const step = { kind: 'chord', name: 'Dm9', notes: [38, 53, 57, 60, 64] };
  check('Accord : toutes les notes → juste (exact)', judgeChordStep([38, 53, 57, 60, 64], step).status === 'ok' && judgeChordStep([38, 53, 57, 60, 64], step).exact);
  const octave = judgeChordStep([50, 53, 57, 60, 64], step);
  check('Accord : basse une octave plus haut → juste, pas exact', octave.status === 'ok' && !octave.exact);
  const partial = judgeChordStep([38, 53, 57, 64], step);
  check('Accord : il manque Do4 → à compléter', partial.status === 'partial' && partial.missing.join(',') === '60', JSON.stringify(partial));
  const wrong = judgeChordStep([38, 53, 57, 61, 64], step);
  check('Accord : Réb au lieu de Do → pas encore (note en trop repérée)', wrong.status === 'wrong' && wrong.extra.join(',') === '61', JSON.stringify(wrong));
  const tension = judgeChordStep([38, 53, 57, 60, 64, 67], step);
  check('Accord : une 11e (Sol) en plus sur Dm9 → toujours juste', tension.status === 'ok', JSON.stringify(tension));
  check('Accord : rien joué → en attente', judgeChordStep([], step).status === 'idle');
  const fb = stepFeedback({ ...step, marks: [{ midi: 60, kind: 'guide', label: 'b7' }], caption: 'Dm9' }, partial);
  check('Retour : « Ajoute Do (7e) », Do suggéré en pointillé', /^Ajoute Do \(7e\)$/.test(fb.caption) && fb.marks.some((m) => m.midi === 60 && m.kind === 'suggest') && fb.tone === 'tip', fb.caption);
  const fbWrong = stepFeedback({ ...step, marks: [{ midi: 60, kind: 'guide', label: 'b7' }], caption: 'Dm9' }, wrong);
  check('Retour : « Essaie Do (7e) à la place de Réb », Réb à remplacer (orange), jamais en rouge', /^Essaie Do \(7e\) à la place de Réb$/.test(fbWrong.caption) && fbWrong.tone === 'tip' && fbWrong.marks.some((m) => m.midi === 61 && m.kind === 'swap'), fbWrong.caption);
  const far = stepFeedback({ ...step, marks: [], caption: 'Dm9' }, judgeChordStep([38, 53, 57, 60, 61, 64], step));
  check('Retour : note en plus, rien à jouer à côté → « Essaie sans Réb »', /^Essaie sans Réb$/.test(far.caption), far.caption);
}

function testJudgeSequence() {
  const step = { kind: 'sequence', notes: [62, 63, 64, 67], caption: 'Ré Ré# Mi Sol' };
  check('Suite : dans l\'ordre → juste', judgeSequenceStep([62, 63, 64, 67], step).status === 'ok');
  check('Suite : une autre octave compte', judgeSequenceStep([74, 75, 76, 79], step).status === 'ok');
  const partial = judgeSequenceStep([62, 63], step);
  check('Suite : 2 / 4, ensuite Mi', partial.status === 'partial' && partial.matched === 2 && partial.expected === 64);
  const order = judgeSequenceStep([62, 64], step);
  check('Suite : Mi avant Ré# → mauvais ordre', order.status === 'wrong' && order.wrongOrder && order.expected === 63, JSON.stringify(order));
  const wrong = judgeSequenceStep([62, 66], step);
  check('Suite : Fa# absent de la suite → fausse note', wrong.status === 'wrong' && !wrong.wrongOrder && wrong.wrongNote === 66);
  const fb = stepFeedback(step, order);
  check('Retour : « D\'abord Ré#, Mi vient plus tard »', /^D'abord .+ : Mi vient plus tard$/.test(fb.caption) && fb.marks.some((m) => m.kind === 'swap'), fb.caption);
  check('Retour : note hors de la suite → « La suite continue sur … »', /^La suite continue sur /.test(stepFeedback(step, wrong).caption), stepFeedback(step, wrong).caption);
  const next = stepFeedback(step, partial);
  check('Retour : la prochaine note pulse', next.marks.find((m) => m.midi === 64)?.moving === true);
}

function testErrorSteps() {
  const events = [];
  const chord = (t, notes) => notes.forEach((n) => {
    events.push({ type: 'note_on', note: n, velocity: 0.7, channel: 0, time: t });
    events.push({ type: 'note_off', note: n, velocity: 0, channel: 0, time: t + 1.8 });
  });
  chord(0, [38, 53, 57, 60, 64]);
  chord(2, [43, 54, 57, 59, 64]);
  chord(4, [36, 52, 55, 59, 62]);
  const review = reviewTake(events, { question: "Je joue un 2-5-1 en Do, c'est bon ?" });
  const steps = stepsFromMoments(review.moments, { marksOf: (m) => takeMarks(null, m) });
  check('Erreurs : une étape pour le G7 fautif', steps.length === 1 && steps[0].kind === 'chord' && steps[0].correction, JSON.stringify(steps.map((s) => s.kind)));
  check('Erreurs : la version corrigée remplace Fa#3 par Fa3', steps[0].notes.join(',') === '43,53,57,59,64', steps[0].notes.join(','));
  check('Erreurs : rejouer juste est jugé juste', judgeChordStep([43, 53, 57, 59, 64], steps[0]).status === 'ok');
  const pedal = stepsFromMoments([{ at: 2, chord: 'Fmaj7', notes: [41, 48, 57], problemNotes: [43], issueId: 'pedal-blur', text: 'traîne' }], { marksOf: (m) => takeMarks(null, m) });
  check('Erreurs : pédale gardée → étape à regarder (pas à rejouer)', pedal[0].kind === 'show');
}

testStepsFromExamples();
testJudgeChord();
testJudgeSequence();
testErrorSteps();

console.log(`\n=== Résultat : ${passed}/${passed + failed} tests passés ===`);
process.exit(failed === 0 ? 0 : 1);
