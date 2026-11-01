// [Claude] — 2026-09-25 — Tests du contexte d'exercice pour le Copilote
// (exercise-context.js) : accord cible, mouvement, voicings exacts de la carte,
// étape en cours, essais pas encore retenus, attentes pour « Qu'en penses-tu ? ».
//
// Lancer : node src/pedagogie/test-exercise-context.js

import { createPracticeExercise } from '../practice-exercise.js';
import { exerciseContext, exerciseContextLines } from './exercise-context.js';

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

function testChordMode() {
  const ex = createPracticeExercise();
  ex.setTechnique('rootless');
  ex.setTargetChoice(2, 'm9');
  const state = ex.getState();
  const ctx = exerciseContext(state, [
    { expected: 'Dm9', notes: [50, 54, 57, 60], heard: 'D7' },
    { expected: 'G7', notes: [43, 53, 59], heard: 'G7' },
  ]);
  check('Accord cible : type, mode et titre', ctx.type === 'exercise' && ctx.mode === 'chord' && ctx.title === 'Accord cible — Dm9', ctx.title);
  const card = ctx.chords[0];
  const lh = [...state.target.voicing.leftHand].sort((a, b) => a - b).join(',');
  const rh = [...state.target.voicing.rightHand].sort((a, b) => a - b).join(',');
  check('Accord cible : le voicing EXACT de la carte (main gauche | main droite)', card.lh.join(',') === lh && card.rh.join(',') === rh && card.current, `${card.lh} | ${card.rh}`);
  check('Accord cible : rôles des notes (b3, b7…)', card.roles.includes('b3') && card.roles.includes('b7'), card.roles.join(' '));
  check('Essais : seuls ceux de l\'exercice affiché sont gardés', ctx.attempts.length === 1 && ctx.attempts[0].expected === 'Dm9');
  check('Attentes : l\'accord, la technique rootless, pas de tonalité', ctx.expect.chords.join() === 'Dm9' && ctx.expect.technique === 'rootless' && ctx.expect.keyPc === null);
  const lines = exerciseContextLines(ctx).join('\n');
  check('Texte pour le Copilote : titre, accord à jouer, essai écrit d\'après l\'accord (Fa#3)',
    /## Exercice en cours : Accord cible — Dm9/.test(lines) && /- ▶ Dm9 :/.test(lines) && /pour Dm9 : Ré3 Fa#3 La3 Do4 \(entendu : D7\)/.test(lines), lines);
  ex.setTechnique('shell');
  check('Technique que l\'avis ne sait pas reconnaître (shell) : pas d\'attente de technique', exerciseContext(ex.getState()).expect.technique === null);
  check('Aucun exercice → pas de contexte', exerciseContext({ target: null }) === null);
}

function testMovementMode() {
  const mv = createPracticeExercise();
  mv.setMode('movement');
  mv.setKeyChoice(5);
  mv.setContentChoice('Turnaround III-VI-II-V-I');
  const state = mv.getState();
  const prog = state.progression;
  const ctx = exerciseContext(state, []);
  check('Mouvement : titre avec la tonalité', ctx.mode === 'movement' && /^Mouvement 12 tons — Turnaround III-VI-II-V-I en /.test(ctx.title), ctx.title);
  const mains = ctx.chords.filter((c) => !c.passing);
  check('Mouvement : accords principaux et de passage, dans l\'ordre', mains.map((c) => c.name).join(' ') === prog.chords.map((c) => c.name).join(' ') && ctx.chords.length > mains.length, ctx.chords.map((c) => c.name).join(' '));
  check('Mouvement : un seul accord « à jouer maintenant » (le premier)', ctx.chords.filter((c) => c.current).length === 1 && ctx.chords[0].current);
  check('Mouvement : degrés gardés', mains.every((c) => c.degree), mains.map((c) => c.degree).join(' '));
  check('Attentes : accords principaux de la tonalité en cours, tonalité de l\'exercice', ctx.expect.chords.join(' ') === prog.chords.map((c) => c.name).join(' ') && ctx.expect.keyPc === prog.currentKey, JSON.stringify(ctx.expect));
  // Accord suivant réussi : l'étape avance.
  const first = prog.chords[0];
  const r = mv.check([...first.voicing.leftHand, ...first.voicing.rightHand]);
  const next = exerciseContext(mv.getState(), []);
  check('Étape suivante : « à jouer maintenant » avance', r.success && !next.chords[0].current && next.chords.some((c) => c.current), next.chords.map((c) => `${c.current ? '▶' : ''}${c.name}`).join(' '));
  const lines = exerciseContextLines(next).join('\n');
  check('Texte : étape et tonalités du tour', /étape : 2 \/ \d+ accords/.test(lines) && /tonalités : 1 \/ \d+ tons/.test(lines), lines.split('\n').slice(0, 3).join(' | '));
}

testChordMode();
testMovementMode();

console.log(`\n=== Résultat : ${passed}/${passed + failed} tests passés ===`);
process.exit(failed === 0 ? 0 : 1);
