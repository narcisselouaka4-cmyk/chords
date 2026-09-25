// [Claude] — 2026-09-08 — Tests purs de la logique de prisme du Copilot IA.
//
// Seules les fonctions de décision sont testées ici : pas de DOM, pas de fetch,
// pas d'IPC. Le but est de verrouiller le contrat du mode autonome vs tutoriel.
//
// IMPORTANT : copilot-tab.js importe virtual-keyboard -> simple-synth, qui
// a besoin de window.AudioContext au chargement. On pose un fake window AVANT
// l'import dynamique, comme dans test-copilot-client.js.

function makeFakeNode() {
  return {
    connect() {},
    gain: { value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {}, cancelScheduledValues() {} },
    frequency: { value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {} },
    detune: { value: 0 },
    Q: { value: 0 },
    start() {},
    stop() {},
    type: 'sine',
    buffer: null,
  };
}

global.window = {
  AudioContext: class FakeAudioContext {
    constructor() { this.state = 'suspended'; }
    createGain() { return makeFakeNode(); }
    createOscillator() { return makeFakeNode(); }
    createBiquadFilter() { return makeFakeNode(); }
    createBufferSource() { return makeFakeNode(); }
    decodeAudioData() { return Promise.resolve(makeFakeNode()); }
    async resume() { this.state = 'running'; }
    get currentTime() { return 0; }
    get destination() { return makeFakeNode(); }
  },
};

const {
  AUTONOMOUS_HISTORY_KEY,
  nextModeOnSelectionChange,
  toggleButtonState,
} = await import('./copilot-tab.js');

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

function testNextModeOnSelectionChange() {
  check(
    'Désélection en mode tutoriel → repli autonome',
    nextModeOnSelectionChange('tutorial', null, null) === 'autonomous'
  );
  check(
    'Nouveau tutoriel en mode tutoriel → reste tutoriel',
    nextModeOnSelectionChange('tutorial', '/x.mp4', null) === 'tutorial'
  );
  check(
    'Sélection en mode autonome → reste autonome',
    nextModeOnSelectionChange('autonomous', '/x.mp4', null) === 'autonomous'
  );
  check(
    'Désélection en mode autonome → reste autonome',
    nextModeOnSelectionChange('autonomous', null, null) === 'autonomous'
  );
  check(
    'Désélection en mode session → repli autonome',
    nextModeOnSelectionChange('session', null, null) === 'autonomous'
  );
  check(
    'Nouvelle session en mode session → reste session',
    nextModeOnSelectionChange('session', null, 'sess-123') === 'session'
  );
}

function testToggleButtonState() {
  const autonomousNoPath = toggleButtonState('autonomous', null);
  check(
    'Bouton caché en mode autonome sans tutoriel',
    autonomousNoPath.visible === false
  );

  const autonomousWithPath = toggleButtonState('autonomous', '/x.mp4');
  check(
    'Bouton visible en mode autonome avec tutoriel',
    autonomousWithPath.visible === true
  );
  check(
    'Libellé "Mode tutoriel" en mode autonome',
    autonomousWithPath.label === 'Mode tutoriel'
  );

  const tutorialWithPath = toggleButtonState('tutorial', '/x.mp4');
  check(
    'Bouton visible en mode tutoriel',
    tutorialWithPath.visible === true
  );
  check(
    'Libellé "Revenir au mode autonome" en mode tutoriel',
    tutorialWithPath.label === 'Revenir au mode autonome'
  );

  const session = toggleButtonState('session', null);
  check(
    'Bouton visible en mode session',
    session.visible === true
  );
  check(
    'Libellé "Revenir au mode autonome" en mode session',
    session.label === 'Revenir au mode autonome'
  );

  // [Claude] — 2026-09-25 — Mode exercice (« Demander au Copilote » dans Exercices).
  const exercise = toggleButtonState('exercise', null);
  check(
    'Mode exercice : bouton « Revenir au mode autonome » visible',
    exercise.visible === true && exercise.label === 'Revenir au mode autonome'
  );
}

async function runTests() {
  testNextModeOnSelectionChange();
  testToggleButtonState();

  console.log(`\n=== Résultat : ${passed}/${passed + failed} tests passés ===`);
  process.exit(failed === 0 ? 0 : 1);
}

runTests().catch((err) => {
  console.error(err);
  process.exit(1);
});
