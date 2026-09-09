// [Claude] — 2026-09-09 — Tests du générateur de licks Copilot IA.

import {
  generateCopilotLick,
  validateLick,
  lickToPlayNoteCalls,
} from './copilot-lick.js';

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

function checkBasicLick() {
  const lick = generateCopilotLick('Cmaj7', { styleId: 'gospel', hand: 'RH', difficulty: 'intermediate', lengthBeats: 4, bpm: 90 });
  check('Lick généré pour Cmaj7', lick.notes.length > 0);
  check('Lick Cmaj7 gospel jouable', lick.isPlayable, lick.diagnostics.join(' ; '));
  check('Toutes les notes sont finies', lick.notes.every((n) => Number.isFinite(n.midi)));
  check('Toutes les notes sont dans la tessiture RH', lick.notes.every((n) => n.midi >= 55 && n.midi <= 84));
  check('Offsets croissants', lick.notes.every((n, i) => i === 0 || n.startOffsetMs >= lick.notes[i - 1].startOffsetMs));
}

function checkDifficultySpans() {
  for (const diff of ['beginner', 'intermediate', 'advanced']) {
    const lick = generateCopilotLick('Dm7', { styleId: 'jazz', hand: 'RH', difficulty: diff, lengthBeats: 4, bpm: 90 });
    const span = Math.max(...lick.notes.map((n) => n.midi)) - Math.min(...lick.notes.map((n) => n.midi));
    const maxSpan = diff === 'beginner' ? 7 : diff === 'intermediate' ? 10 : 14;
    check(`Span ${diff} respecté (${span} ≤ ${maxSpan})`, span <= maxSpan);
  }
}

function checkValidation() {
  const bad = [
    { midi: 40, startOffsetMs: 0, durationMs: 100, velocity: 0.8, hand: 'RH', role: 'x' },
    { midi: 80, startOffsetMs: 0, durationMs: 100, velocity: 0.8, hand: 'RH', role: 'x' },
  ];
  const v = validateLick(bad, 'beginner');
  check('Validation détecte l\'étendue trop grande', !v.valid);
}

function checkToolCalls() {
  const lick = generateCopilotLick('G7', { styleId: 'jazz', hand: 'RH', difficulty: 'intermediate', lengthBeats: 4, bpm: 90 });
  const calls = lickToPlayNoteCalls(lick);
  check('Conversion en tool calls', calls.length === lick.notes.length);
  check('Chaque tool call a un midi', calls.every((c) => typeof c.function.arguments === 'string' && c.function.arguments.includes('"midi"')));
}

function checkBothHands() {
  const lick = generateCopilotLick('Cmaj7', { styleId: 'worship', hand: 'both', difficulty: 'beginner', lengthBeats: 4, bpm: 90 });
  check('Mode both hands génère des notes', lick.notes.length > 0);
}

async function runTests() {
  checkBasicLick();
  checkDifficultySpans();
  checkValidation();
  checkToolCalls();
  checkBothHands();

  console.log(`\n=== Résultat : ${passed}/${passed + failed} tests passés ===`);
  process.exit(failed === 0 ? 0 : 1);
}

runTests().catch((err) => {
  console.error(err);
  process.exit(1);
});
