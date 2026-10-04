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
  reviewButtonState,
  copilotErrorText,
  splitAnswerNotes,
  answerActions,
  MORE_DETAILS,
  hasPedalEvents,
  exampleSubtitle,
  EXAMPLE_RATES,
  rateLabel,
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

// [Claude] — 2026-09-26 — « Qu'en penses-tu ? » : un clic, le Copilote écoute ; Stop, ça part.
function testReviewButtonState() {
  const idle = reviewButtonState();
  check('« Qu\'en penses-tu ? » au repos', idle.label === 'Qu\'en penses-tu ?' && idle.pressed === false && idle.hint === '');
  const listening = reviewButtonState({ capturing: true, seconds: 12.7 });
  check('Pendant l\'écoute : « Stop · 0:12 », bouton enfoncé, aide « J\'écoute… »', listening.label === 'Stop · 0:12' && listening.pressed === true && /J'écoute ton jeu/.test(listening.hint), JSON.stringify(listening));
  check('Compteur au-delà d\'une minute : « Stop · 1:05 »', reviewButtonState({ capturing: true, seconds: 65 }).label === 'Stop · 1:05');
}

// [Claude] — 2026-09-26 — Quand le Copilote n'a pas pu répondre : la raison, en clair.
function testCopilotErrorText() {
  check('Délai dépassé : dit en clair, avec quoi faire', /n'a pas répondu à temps \(90 secondes\)/.test(copilotErrorText('AI_TIMEOUT')) && /Réglages › Assistant IA/.test(copilotErrorText('AI_TIMEOUT')));
  check('Clé refusée : message de la clé', /clé API a été refusée/.test(copilotErrorText('AI_API_KEY_INVALID')));
  check('Trop long / trop de demandes (413, 429) : dit en clair', /refuse la demande pour l'instant/.test(copilotErrorText('AI_API_ERROR_429')) && /refuse la demande/.test(copilotErrorText('AI_API_ERROR_413')));
  check('Panne du service (5xx) : dit en clair', /problème de son côté/.test(copilotErrorText('AI_API_ERROR_503')));
  check('Autre erreur : la raison technique, à recopier', /Je n'ai pas pu répondre \(Unexpected token\)/.test(copilotErrorText('Unexpected token')));
}

// [Claude] — 2026-10-04 — Réponses courtes, détail sur demande (Narcisse : « trop de détails,
// trop d'inscriptions » ; son choix : des réponses courtes, le détail sur demande).
function testSplitAnswerNotes() {
  const notes = 'Sur Fmaj7 : main gauche Fa2 Do3 Mi3 · main droite La3 Do4 Mi4\nSur E7 : main gauche Mi2 Ré3 Sol#3 · main droite Si3 Ré4 Sol#4';
  const answer = `Le prof garde la tierce et la septième en main gauche.\n\n${notes}\n\nÉcoute l'exemple ci-dessous.`;
  const split = splitAnswerNotes(answer, `${notes}\n`);
  check('Les notes écrites par l\'application sont repliées : la réponse garde son texte, sans elles',
    split.notes === notes && split.text === 'Le prof garde la tierce et la septième en main gauche.\n\nÉcoute l\'exemple ci-dessous.',
    JSON.stringify(split));
  check('Sans notes de l\'application : rien n\'est replié',
    splitAnswerNotes('Une réponse.', undefined).notes === '' && splitAnswerNotes('Une réponse.', '').text === 'Une réponse.');
  check('Notes absentes de la réponse (ancienne conversation) : rien n\'est replié',
    splitAnswerNotes('Une réponse sans les notes.', notes).notes === '');
  check('Une réponse faite des seules notes : elles restent visibles (pas de bulle vide)',
    splitAnswerNotes(notes, notes).notes === '' && splitAnswerNotes(notes, notes).text === notes);
}

function testAnswerActions() {
  const answer = { role: 'assistant', content: 'L\'idée en une phrase.', suggestedActions: [{ label: 'Que fait la main gauche ?', message: 'Que fait la main gauche ?' }] };
  const last = answerActions(answer, { last: true, asked: 'Explique ce passage.' });
  check('Sous la dernière réponse : « Plus de détails » d\'abord, puis les suggestions',
    MORE_DETAILS === 'Plus de détails' && last.length === 2 && last[0].label === MORE_DETAILS && last[0].message === MORE_DETAILS && last[1].message === 'Que fait la main gauche ?',
    JSON.stringify(last));
  check('Sous une réponse plus ancienne : les suggestions seulement',
    answerActions(answer, { last: false }).map((a) => a.message).join('|') === 'Que fait la main gauche ?');
  check('Après une demande de détail (étiquette ou tapée) : pas de nouveau « Plus de détails »',
    ['Plus de détails', 'plus de détails.', 'Détaille la main gauche', 'Explique-moi plus'].every((asked) => !answerActions(answer, { last: true, asked }).some((a) => a.message === MORE_DETAILS)));
  check('Après une erreur, ou une réponse vide : pas de « Plus de détails »',
    answerActions({ role: 'assistant', content: 'Le service d\'IA n\'a pas répondu à temps.', isError: true }, { last: true }).length === 0
    && answerActions({ role: 'assistant', content: '  ' }, { last: true }).length === 0);
  const twice = answerActions({ ...answer, suggestedActions: [{ label: 'Plus de détails.', message: 'Plus de détails.' }, ...answer.suggestedActions] }, { last: true });
  check('Le Copilote propose aussi « Plus de détails » : une seule fois',
    twice.filter((a) => /plus de détails/i.test(a.message)).length === 1 && twice.length === 2, JSON.stringify(twice));
  check('Ni sous la question du pianiste, ni sous l\'attente',
    answerActions({ role: 'user', content: 'Explique ce passage.' }, { last: true }).length === 0
    && answerActions({ role: 'assistant', isTyping: true }, { last: true }).length === 0);
}

// [Claude] — 2026-10-04 — Le mode sans pédale (Narcisse : « avec la pédale, il y a une telle
// flopée de notes qu'on ne distingue pas bien le jeu du prof »).
function testExampleSubtitle() {
  const pedal = [{ time: 0, type: 'sustain', value: true }, { time: 0, type: 'noteOn', note: 60 }];
  const prof = { subtitle: '15 notes jouées par le professeur · avec sa pédale · ses explications raccourcies à 2 s', events: pedal };
  check('Avec la pédale : le sous-titre tel quel', exampleSubtitle(prof) === prof.subtitle && hasPedalEvents(prof));
  check('Sans la pédale : « sans pédale » à la place de « avec sa pédale »',
    exampleSubtitle(prof, { pedal: false }) === '15 notes jouées par le professeur · sans pédale · ses explications raccourcies à 2 s');
  check('« pédale à chaque accord » et « pédale comprise » aussi',
    exampleSubtitle({ subtitle: '8 notes jouées par le professeur · pédale à chaque accord', events: pedal }, { pedal: false }) === '8 notes jouées par le professeur · sans pédale'
    && exampleSubtitle({ subtitle: '12 notes comme tu les as jouées, pédale comprise · transposées de +2 demi-tons', events: pedal }, { pedal: false }) === '12 notes comme tu les as jouées · sans pédale · transposées de +2 demi-tons');
  check('Un sous-titre qui ne parle pas de pédale : « sans pédale » ajouté',
    exampleSubtitle({ subtitle: 'Repris de 0:00–0:09', events: pedal }, { pedal: false }) === 'Repris de 0:00–0:09 · sans pédale');
  check('Un exemple sans pédale : rien ne change, pas de bouton',
    !hasPedalEvents({ events: [{ time: 0, type: 'noteOn', note: 60 }] }) && exampleSubtitle({ subtitle: 'Dm7 → G7', events: [] }, { pedal: false }) === 'Dm7 → G7' && !hasPedalEvents(null));
}

// [Claude] — 2026-10-04 — La vitesse des exemples (Narcisse : « ça évite de lui demander à
// chaque fois de ralentir »).
function testExampleRates() {
  check('Vitesses proposées : 0,5× · 0,75× · 1× · 1,25×', EXAMPLE_RATES.map(rateLabel).join(' · ') === '0,5× · 0,75× · 1× · 1,25×', EXAMPLE_RATES.map(rateLabel).join(' · '));
}

async function runTests() {
  testNextModeOnSelectionChange();
  testToggleButtonState();
  testReviewButtonState();
  testCopilotErrorText();
  testSplitAnswerNotes();
  testAnswerActions();
  testExampleSubtitle();
  testExampleRates();

  console.log(`\n=== Résultat : ${passed}/${passed + failed} tests passés ===`);
  process.exit(failed === 0 ? 0 : 1);
}

runTests().catch((err) => {
  console.error(err);
  process.exit(1);
});
