// [Claude] — 2026-09-21 — Tests headless du moteur de voicing de l'onglet Exercices.

import { createPracticeExercise, exerciseVoicingToSequence } from './practice-exercise.js';
import { generateCopilotVoicing } from './pedagogie/copilot-voicing.js';

const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const RESET = '\x1b[0m';

let passed = 0;
let failed = 0;

function check(name, condition, detail = '') {
  if (condition) {
    passed += 1;
    console.log(`${GREEN}✓${RESET} ${name}`);
  } else {
    failed += 1;
    console.log(`${RED}✗${RESET} ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

function checkChordTargetHasVoicing() {
  const ex = createPracticeExercise();
  ex.next();
  const state = ex.getState();
  check('Mode accord cible a une cible', state.target != null);
  check('Cible a un voicing', state.target.voicing != null);
  check('Voicing jouable', state.target.voicing.isPlayable === true, JSON.stringify(state.target.voicing.diagnostics));
  check('Main gauche non vide', state.target.voicing.leftHand.length > 0);
  check('Main droite non vide', state.target.voicing.rightHand.length > 0);
  check('Notes fusionnées cohérentes', state.target.notes.length === state.target.voicing.leftHand.length + state.target.voicing.rightHand.length);
}

function checkSpecificChords() {
  const cases = ['G#m7', 'C#7'];
  for (const name of cases) {
    const v = generateCopilotVoicing(name, { styleId: 'auto', context: 'accompaniment' });
    check(`${name} voicing jouable`, v.isPlayable === true, v.diagnostics.join(' ; '));
    check(`${name} a LH et RH`, v.leftHand.length > 0 && v.rightHand.length > 0);
    const lhMax = Math.max(...v.leftHand);
    const rhMin = Math.min(...v.rightHand);
    check(`${name} RH au-dessus de LH`, rhMin > lhMax, `LH max=${lhMax} RH min=${rhMin}`);
  }

  // Vérifie aussi que l'exercice peut générer aléatoirement un G#m7
  // en un nombre raisonnable d'essais.
  const ex = createPracticeExercise();
  let found = null;
  for (let i = 0; i < 500; i += 1) {
    ex.next();
    const t = ex.getState().target;
    if (t.rootPc === 8 && t.symbol === 'm7') {
      found = t;
      break;
    }
  }
  check('G#m7 généré par l\'exercice', found != null);
}

function checkTechniqueSwitch() {
  const ex = createPracticeExercise();
  ex.next();
  const firstTarget = ex.getState().target;
  const first = firstTarget.voicing.technique;
  ex.setTechnique('rootless');
  const secondTarget = ex.getState().target;
  const second = secondTarget.voicing.technique;
  check('setTechnique change la technique', second === 'rootless', `avant=${first} après=${second}`);
  check('setTechnique conserve le même accord', secondTarget.rootPc === firstTarget.rootPc && secondTarget.symbol === firstTarget.symbol);
}

function checkProgressionVoicings() {
  const ex = createPracticeExercise();
  ex.setMode('progression');
  const state = ex.getState();
  check('Progression a des accords', state.progression.chords.length > 0);
  check('Tous les accords de progression ont un voicing jouable', state.progression.chords.every((c) => c.voicing?.isPlayable));
}

function checkDemoSequence() {
  const ex = createPracticeExercise();
  ex.next();
  const seq = exerciseVoicingToSequence(ex.getState().target.voicing);
  check('Séquence démo non vide', seq.length > 0);
  check('Séquence block : même offset', seq.every((n) => n.startOffsetMs === 0));
  check('Séquence a des notes MIDI', seq.every((n) => Number.isFinite(n.midi) && n.midi >= 12 && n.midi <= 127));
}

function checkMovementVoicings() {
  const ex = createPracticeExercise();
  ex.setMode('movement');
  const state = ex.getState();
  check('Mouvement a des accords', state.progression.chords.length > 0);
  check('Tous les accords du mouvement ont un voicing', state.progression.chords.every((c) => c.voicing?.isPlayable));
  check('Détection mouvement utilise rootPc', true);
}

function runTests() {
  checkChordTargetHasVoicing();
  checkSpecificChords();
  checkTechniqueSwitch();
  checkProgressionVoicings();
  checkDemoSequence();
  checkMovementVoicings();

  console.log(`\n=== Résultat : ${passed}/${passed + failed} tests passés ===`);
  process.exit(failed === 0 ? 0 : 1);
}

runTests().catch((err) => {
  console.error(err);
  process.exit(1);
});
