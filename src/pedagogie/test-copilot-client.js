// [Claude] — 2026-09-06 — Tests du client Copilot IA (setup + dynamic import).
//
// simple-synth.js a besoin de window.AudioContext au chargement du module.
// Ce fichier configure d'abord le fake window, puis importe dynamiquement
// copilot-client.js APRÈS que window soit prêt.

import { createRequire } from 'module';
const require = createRequire(import.meta.url);

// 1. Configuration du fake window AVANT tout import
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
global.localStorage = {
  store: {},
  getItem(k) { return this.store[k] ?? null; },
  setItem(k, v) { this.store[k] = v; },
  removeItem(k) { delete this.store[k]; },
};

// 1 bis. Document minimal pour tester les fonctions qui lisent le DOM
if (!globalThis.CustomEvent) {
  globalThis.CustomEvent = class CustomEvent extends Event {
    constructor(type, options = {}) {
      super(type, options);
      this.detail = options.detail ?? null;
    }
  };
}

global.document = {
  getElementById(id) {
    return this._els?.[id] ?? null;
  },
  querySelector(sel) {
    if (sel === '#keyboard-container svg') return this._svg ?? null;
    if (sel === '#keyboard-annotation-layer .keyboard-annotation-marker') {
      return (this._markers || [])[0] ?? null;
    }
    return null;
  },
  querySelectorAll(sel) {
    if (sel === '#keyboard-annotation-layer .keyboard-annotation-marker') {
      return this._markers || [];
    }
    return [];
  },
  _els: {},
  _markers: [],
  resetMock() {
    this._els = {};
    this._svg = null;
    this._markers = [];
  },
  setPanel(collapsed = false) {
    this._els['keyboard-panel'] = { classList: { contains: () => collapsed } };
  },
  setSvg(width = 200, height = 150) {
    this._svg = {
      getBoundingClientRect() {
        return { left: 0, top: 0, width, height };
      },
    };
  },
  setKey(midi, x = 0, y = 0, w = 40, h = 150) {
    const rect = { left: x, top: y, width: w, height: h };
    this._els[`note-${midi}`] = {
      getBoundingClientRect() { return rect; },
    };
  },
  setLayer() {
    this._els['keyboard-annotation-layer'] = {
      innerHTML: '',
      appendChild(child) {
        this.innerHTML += child._html;
        global.document._markers.push(child);
      },
    };
  },
  createElement(tag) {
    const el = { _tag: tag, style: {} };
    el.setAttribute = (k, v) => { el[k] = v; };
    el.classList = {
      _class: '',
      add(c) { this._class += (this._class ? ' ' : '') + c; },
    };
    Object.defineProperty(el, 'innerHTML', {
      get() { return this._html || ''; },
      set(v) { this._html = v; },
    });
    return el;
  },
  dispatchEvent(evt) {
    return true;
  },
};

// 2. Import dynamique APRÈS le setup de window
const { sendCopilotMessage, executeToolCalls, wantsToHear, myPlayingRequest } = await import('./copilot-client.js');

const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const RESET = '\x1b[0m';

let passed = 0;
let failed = 0;

function check(name, condition, detail = '') {
  if (condition) {
    passed += 1;
    console.log(`${'\x1b[32m'}✓${'\x1b[0m'} ${name}`);
  } else {
    failed += 1;
    console.log(`${'\x1b[31m'}✗${'\x1b[0m'} ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

function testToolCalls() {
  const result = executeToolCalls([
    { function: { name: 'play_note', arguments: JSON.stringify({ midi: 60, durationMs: 500 }) } },
    { function: { name: 'play_note', arguments: JSON.stringify({ midi: 200 }) } },
    { function: { name: 'play_note', arguments: JSON.stringify({ midi: 10 }) } },
    { function: { name: 'unknown_tool', arguments: '{}' } },
    { function: { name: 'play_note', arguments: 'not json' } },
  ]);
  check('Une note valide est jouée', result.played.length >= 1);
  check('Les notes hors 21–108 sont ignorées', result.ignored >= 2);
  check('Les outils inconnus sont ignorés', result.ignored >= 1);
}

async function testNoKey() {
  global.localStorage.store = {};
  const res = await sendCopilotMessage({ message: 'Bonjour', messages: [], context: {} });
  check('Sans clé API, le client retourne une erreur', res.ok === false);
  check("L'erreur mentionne la clé API", res.error.includes('clé') || res.error.includes('API'));
}

async function test401() {
  const originalFetch = global.fetch;
  global.fetch = async () => ({ ok: false, status: 401, text: async () => 'Unauthorized' });
  global.localStorage.store = { 'piano-jazz-ai-config': JSON.stringify({ apiKey: 'fake-key', baseUrl: 'https://api.groq.com/openai/v1', model: 'openai/gpt-oss-20b', monthlyCap: 50 }) };
  const res = await sendCopilotMessage({ message: 'Test', messages: [], context: {} });
  check('Une erreur 401 retourne AI_API_KEY_INVALID', res.error === 'AI_API_KEY_INVALID');
  global.fetch = originalFetch;
}

function checkAllObjectsHaveAdditionalPropertiesFalse(schema, path = 'schema') {
  if (typeof schema !== 'object' || schema === null) return null;
  if (schema.type === 'object') {
    if (schema.additionalProperties !== false) {
      return `Objet ${path} n'a pas additionalProperties: false`;
    }
  }
  if (Array.isArray(schema.properties)) {
    // Certains schémas peuvent être exprimés sous forme de tableau (tuple).
    for (let i = 0; i < schema.properties.length; i++) {
      const sub = checkAllObjectsHaveAdditionalPropertiesFalse(schema.properties[i], `${path}.properties[${i}]`);
      if (sub) return sub;
    }
  } else if (schema.properties && typeof schema.properties === 'object') {
    for (const key of Object.keys(schema.properties)) {
      const sub = checkAllObjectsHaveAdditionalPropertiesFalse(schema.properties[key], `${path}.properties.${key}`);
      if (sub) return sub;
    }
  }
  if (schema.items && typeof schema.items === 'object') {
    const sub = checkAllObjectsHaveAdditionalPropertiesFalse(schema.items, `${path}.items`);
    if (sub) return sub;
  }
  if (schema.anyOf && Array.isArray(schema.anyOf)) {
    for (let i = 0; i < schema.anyOf.length; i++) {
      const sub = checkAllObjectsHaveAdditionalPropertiesFalse(schema.anyOf[i], `${path}.anyOf[${i}]`);
      if (sub) return sub;
    }
  }
  if (schema.oneOf && Array.isArray(schema.oneOf)) {
    for (let i = 0; i < schema.oneOf.length; i++) {
      const sub = checkAllObjectsHaveAdditionalPropertiesFalse(schema.oneOf[i], `${path}.oneOf[${i}]`);
      if (sub) return sub;
    }
  }
  if (schema.allOf && Array.isArray(schema.allOf)) {
    for (let i = 0; i < schema.allOf.length; i++) {
      const sub = checkAllObjectsHaveAdditionalPropertiesFalse(schema.allOf[i], `${path}.allOf[${i}]`);
      if (sub) return sub;
    }
  }
  return null;
}

async function testRequestBodySchemaAndTokens() {
  const originalFetch = global.fetch;
  let capturedBody = null;
  global.fetch = async (url, options) => {
    capturedBody = JSON.parse(options.body);
    return {
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{
          message: {
            role: 'assistant',
            content: 'Réponse de test.',
          },
        }],
      }),
    };
  };
  global.localStorage.store = { 'piano-jazz-ai-config': JSON.stringify({ apiKey: 'fake-key', baseUrl: 'https://api.groq.com/openai/v1', model: 'openai/gpt-oss-20b', monthlyCap: 50 }) };

  await sendCopilotMessage({ message: 'Quels outils envoies-tu ?', messages: [], context: {} });

  check('Le corps de requête a été capturé', capturedBody !== null);
  check('Le corps utilise max_completion_tokens et non max_tokens', capturedBody?.max_completion_tokens === 1200 && !('max_tokens' in capturedBody));
  check('Le tableau tools est présent et non vide', Array.isArray(capturedBody?.tools) && capturedBody.tools.length > 0);

  let schemaError = null;
  for (let i = 0; i < (capturedBody?.tools || []).length; i++) {
    const parameters = capturedBody.tools[i]?.function?.parameters;
    if (!parameters) {
      schemaError = `Outil ${i} n'a pas de function.parameters`;
      break;
    }
    schemaError = checkAllObjectsHaveAdditionalPropertiesFalse(parameters, `tools[${i}].function.parameters`);
    if (schemaError) break;
  }
  check('Tout objet type: object du schéma tools porte additionalProperties: false', schemaError === null, schemaError || '');

  global.fetch = originalFetch;
}

async function testMessagesSanitizedBeforeApiCall() {
  const originalFetch = global.fetch;
  let capturedBody = null;
  global.fetch = async (url, options) => {
    capturedBody = JSON.parse(options.body);
    return {
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{
          message: {
            role: 'assistant',
            content: 'Réponse de test.',
          },
        }],
      }),
    };
  };
  global.localStorage.store = { 'piano-jazz-ai-config': JSON.stringify({ apiKey: 'fake-key', baseUrl: 'https://api.groq.com/openai/v1', model: 'openai/gpt-oss-20b', monthlyCap: 50 }) };

  const messagesWithExtraFields = [
    { role: 'user', content: 'Première question', timestamp: '2026-09-08T10:00:00Z' },
    { role: 'assistant', content: 'Première réponse', toolResult: { played: [] }, timestamp: '2026-09-08T10:00:01Z' },
  ];
  await sendCopilotMessage({ message: 'Deuxième question', messages: messagesWithExtraFields, context: {} });

  check('Le corps de requête a été capturé (sanitization)', capturedBody !== null);

  const apiMessages = capturedBody?.messages || [];
  const userMessages = apiMessages.filter((m) => m.role === 'user');
  const assistantMessages = apiMessages.filter((m) => m.role === 'assistant');

  check('Les messages utilisateur gardent seulement role et content', userMessages.every((m) => Object.keys(m).length === 2 && 'role' in m && 'content' in m));
  check('Les messages assistant gardent seulement role et content', assistantMessages.every((m) => Object.keys(m).length === 2 && 'role' in m && 'content' in m));
  check('timestamp est retiré des messages envoyés à l\'API', apiMessages.every((m) => !('timestamp' in m)));
  check('toolResult est retiré des messages envoyés à l\'API', apiMessages.every((m) => !('toolResult' in m)));
  check('Le message système est présent', apiMessages[0]?.role === 'system');
  check('Le message en cours est ajouté à la fin', apiMessages[apiMessages.length - 1]?.content === 'Deuxième question');

  global.fetch = originalFetch;
}

async function testAutonomousModeNoPhantomContext() {
  const originalFetch = global.fetch;
  let capturedBody = null;
  global.fetch = async (url, options) => {
    capturedBody = JSON.parse(options.body);
    return {
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{
          message: {
            role: 'assistant',
            content: 'Réponse de test.',
          },
        }],
      }),
    };
  };
  global.localStorage.store = { 'piano-jazz-ai-config': JSON.stringify({ apiKey: 'fake-key', baseUrl: 'https://api.groq.com/openai/v1', model: 'openai/gpt-oss-20b', monthlyCap: 50 }) };

  await sendCopilotMessage({ message: 'Bonjour', messages: [], context: null });

  check('Le corps de requête a été capturé (contexte null)', capturedBody !== null);

  const systemMessage = capturedBody?.messages?.find((m) => m.role === 'system')?.content || '';
  check('Mode autonome (null) : PAS de section "Tutoriel en cours"', !systemMessage.includes('## Tutoriel en cours'));
  check('Mode autonome (null) : PAS de section "Session MIDI en cours"', !systemMessage.includes('## Session MIDI en cours'));
  check('Mode autonome (null) : contient toujours "Clavier MIDI virtuel"', systemMessage.includes('Clavier MIDI virtuel :'));

  capturedBody = null;
  await sendCopilotMessage({ message: 'Bonjour', messages: [], context: {} });

  check('Le corps de requête a été capturé (contexte {})', capturedBody !== null);

  const systemMessage2 = capturedBody?.messages?.find((m) => m.role === 'system')?.content || '';
  check('Mode autonome ({}) : PAS de section "Tutoriel en cours"', !systemMessage2.includes('## Tutoriel en cours'));
  check('Mode autonome ({}) : PAS de section "Session MIDI en cours"', !systemMessage2.includes('## Session MIDI en cours'));
  check('Mode autonome ({}) : contient toujours "Clavier MIDI virtuel"', systemMessage2.includes('Clavier MIDI virtuel :'));

  global.fetch = originalFetch;
}

function testToolParsing() {
  const result = executeToolCalls([
    { function: { name: 'play_note', arguments: JSON.stringify({ midi: 60, velocity: 0.5, durationMs: 100 }) } },
  ]);
  check('Une note avec vélocité et durée est acceptée', result.played.length === 1);
}

function testSequenceScheduling() {
  document.resetMock();
  document.setPanel(false);

  const capturedEvents = [];
  const originalDispatchEvent = document.dispatchEvent;
  document.dispatchEvent = (evt) => {
    capturedEvents.push({ type: evt.type, detail: evt.detail });
    return true;
  };
  global.document.dispatchEvent = document.dispatchEvent;

  const originalSetTimeout = global.setTimeout;
  const scheduled = [];
  global.setTimeout = (fn, delay) => {
    scheduled.push({ fn, delay });
    // On n'exécute PAS le vrai setTimeout ici : on exécute les callbacks
    // manuellement juste après executeToolCalls pour garder le wrapper
    // dispatchEvent actif pendant la capture.
    return 0;
  };

  const result = executeToolCalls([
    { function: { name: 'play_note', arguments: JSON.stringify({ midi: 60, startOffsetMs: 0 }) } },
    { function: { name: 'play_note', arguments: JSON.stringify({ midi: 64, startOffsetMs: 200 }) } },
    { function: { name: 'play_note', arguments: JSON.stringify({ midi: 67, startOffsetMs: 400 }) } },
  ]);

  const playedSorted = [...result.played].sort((a, b) => a.startOffsetMs - b.startOffsetMs);
  check('Une séquence de 3 notes est préparée', result.played.length === 3);
  check('Les notes sont retournées dans l\'ordre croissant des startOffsetMs', playedSorted.every((p, i) => p.startOffsetMs === [0, 200, 400][i]));
  // [Claude] — 2026-09-24 — Rien ne joue pendant la réponse (Narcisse : « il va
  // directement me le jouer au lieu d'expliquer d'abord ») : un exemple est préparé.
  check('Rien n\'est joué pendant la réponse (aucune minuterie, aucune note envoyée)', scheduled.length === 0
    && capturedEvents.filter((e) => e.type === 'copilot-note-on').length === 0);
  const onsets = result.example?.events.filter((e) => e.type === 'noteOn').map((e) => `${e.note}@${e.time}`).join();
  check('Exemple prêt à écouter : les 3 notes aux bons instants (0 ; 0,2 ; 0,4 s)', onsets === '60@0,64@0.2,67@0.4', onsets);

  document.dispatchEvent = originalDispatchEvent;
  global.document.dispatchEvent = originalDispatchEvent;
  global.setTimeout = originalSetTimeout;
}

function testKeyboardCollapsed() {
  // Simuler un clavier masqué
  document.resetMock();
  document.setPanel(true);

  const result = executeToolCalls([
    { function: { name: 'play_note', arguments: JSON.stringify({ midi: 60 }) } },
  ]);
  // L'exemple s'entend même clavier masqué ; le drapeau reste pour le signaler.
  check('Clavier masqué : l\'exemple est préparé quand même', result.played.length === 1 && Boolean(result.example));
  check('Le flag keyboardCollapsed est renvoyé', result.keyboardCollapsed === true);
}

// [Claude] — 2026-09-24 — L'exemple ne démarre seul que si l'élève demande à
// l'entendre ; une question d'explication attend son clic.
function testWantsToHear() {
  const hear = ['Joue-moi un 2-5-1 en Do', 'Je veux écouter un 2-5-1', 'Écoute ce Dm7', 'Je veux entendre un 2-5-1',
    'fais-moi écouter Cmaj9', 'Montre-moi un voicing de Dm9', 'Peux-tu me faire une démo ?', 'Peux-tu me jouer un Cmaj9 ?',
    'Fais-moi un arpège lent.', 'Fais-moi un lick adapté.', 'Rejoue-le plus lentement', 'Fais-moi réécouter ma main gauche'];
  const explain = ['Explique-moi l\'harmonie d\'un 2-5-1.', 'Comment jouer un 2-5-1 ?', 'Qu\'est-ce qu\'un accord plaqué ?',
    'Je joue Dm7 G7 Cmaj7, c\'est juste ?', 'Qu\'est-ce que la main gauche peut jouer ici ?'];
  check('Demandes d\'écoute reconnues (accents compris)', hear.every(wantsToHear), hear.filter((m) => !wantsToHear(m)).join(' | '));
  check('Questions d\'explication : pas de lecture automatique', explain.every((m) => !wantsToHear(m)), explain.filter(wantsToHear).join(' | '));
}

// [Claude] — 2026-09-25 — Narcisse : « j'aime pas les étiquettes pour indiquer la
// fonction de chaque note ». Plus d'annotate_keyboard, plus de légendes d'étapes :
// un appel résiduel (vieux modèle, historique) est ignoré sans rien casser.
function testNoKeyboardLabels() {
  document.resetMock();
  document.setPanel(false);
  const result = executeToolCalls([
    { function: { name: 'annotate_keyboard', arguments: JSON.stringify({ notes: [{ midi: 60, label: 'Do' }] }) } },
  ]);
  check('annotate_keyboard : ignoré (plus d\'étiquettes au clavier)', result.ignored === 1 && !result.example && result.annotated === undefined, JSON.stringify(result));
  const prog = executeToolCalls([
    { function: { name: 'play_progression', arguments: JSON.stringify({ chords: ['Dm7', 'G7', 'Cmaj7'], steps: ['Dm7 : écoute le Do du dessus'] }) } },
  ]);
  check('Exemple de progression : joué, sans étapes à marquer', prog.example && prog.example.steps === undefined && prog.example.chords.length === 3);
}

async function testRetryWhenDemoAnnouncedButNoToolCalls() {
  const originalFetch = global.fetch;
  let callCount = 0;
  let capturedBodies = [];
  global.fetch = async (url, options) => {
    callCount += 1;
    capturedBodies.push(JSON.parse(options.body));
    return {
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{
          message: {
            role: 'assistant',
            content: 'Voici la démonstration : un Cmaj7 en arpège.',
          },
        }],
      }),
    };
  };
  global.localStorage.store = { 'piano-jazz-ai-config': JSON.stringify({ apiKey: 'fake-key', baseUrl: 'https://api.groq.com/openai/v1', model: 'openai/gpt-oss-20b', monthlyCap: 50 }) };

  const res = await sendCopilotMessage({ message: 'Joue-moi un Cmaj7', messages: [], context: {} });

  check('Texte affiché = texte original (première réponse)', res.content === 'Voici la démonstration : un Cmaj7 en arpège.');
  check('Routage d\'intention offline joue le voicing Cmaj7', res.toolResult.played.length >= 3);
  check('Exactement 1 appel API grâce au routage d\'intention', callCount === 1);

  global.fetch = originalFetch;
}

async function testRetryFailsAgainAddsNotice() {
  const originalFetch = global.fetch;
  let callCount = 0;
  global.fetch = async () => {
    callCount += 1;
    return {
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{
          message: {
            role: 'assistant',
            content: 'Je vais te jouer un Cmaj7.',
          },
        }],
      }),
    };
  };
  global.localStorage.store = { 'piano-jazz-ai-config': JSON.stringify({ apiKey: 'fake-key', baseUrl: 'https://api.groq.com/openai/v1', model: 'openai/gpt-oss-20b', monthlyCap: 50 }) };

  const res = await sendCopilotMessage({ message: 'Joue-moi un Cmaj7', messages: [], context: {} });

  check('Routage d\'intention joue Cmaj7 sans retry', callCount === 1);
  check('toolResult contient les notes du voicing Cmaj7', res.toolResult.played.length >= 3);

  global.fetch = originalFetch;
}

async function testNoRetryWhenToolCallsPlayImmediately() {
  const originalFetch = global.fetch;
  let callCount = 0;
  global.fetch = async () => {
    callCount += 1;
    return {
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{
          message: {
            role: 'assistant',
            content: 'Voici la démonstration.',
            tool_calls: [
              {
                function: {
                  name: 'play_note',
                  arguments: JSON.stringify({ midi: 60, startOffsetMs: 0, durationMs: 500 }),
                },
              },
              {
                function: {
                  name: 'play_note',
                  arguments: JSON.stringify({ midi: 64, startOffsetMs: 350, durationMs: 500 }),
                },
              },
              {
                function: {
                  name: 'play_note',
                  arguments: JSON.stringify({ midi: 67, startOffsetMs: 700, durationMs: 500 }),
                },
              },
              {
                function: {
                  name: 'play_note',
                  arguments: JSON.stringify({ midi: 71, startOffsetMs: 1050, durationMs: 500 }),
                },
              },
            ],
          },
        }],
      }),
    };
  };
  global.localStorage.store = { 'piano-jazz-ai-config': JSON.stringify({ apiKey: 'fake-key', baseUrl: 'https://api.groq.com/openai/v1', model: 'openai/gpt-oss-20b', monthlyCap: 50 }) };

  const res = await sendCopilotMessage({ message: 'Joue-moi un Cmaj7', messages: [], context: {} });

  check('Un seul appel API quand les tool_calls jouent un accord complet', callCount === 1);
  check('Les 4 notes du Cmaj7 ont été jouées', res.toolResult.played.length === 4);

  global.fetch = originalFetch;
}

async function testNoRetryWithoutAnnouncement() {
  const originalFetch = global.fetch;
  let callCount = 0;
  global.fetch = async () => {
    callCount += 1;
    return {
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{
          message: {
            role: 'assistant',
            content: 'Un Cmaj7 est un accord de do majeur septième.',
          },
        }],
      }),
    };
  };
  global.localStorage.store = { 'piano-jazz-ai-config': JSON.stringify({ apiKey: 'fake-key', baseUrl: 'https://api.groq.com/openai/v1', model: 'openai/gpt-oss-20b', monthlyCap: 50 }) };

  const res = await sendCopilotMessage({ message: "C'est quoi un Cmaj7 ?", messages: [], context: {} });

  check('Un seul appel API quand aucune démonstration n\'est promise', callCount === 1);
  check('Aucun retry déclenché', res.content === 'Un Cmaj7 est un accord de do majeur septième.');

  global.fetch = originalFetch;
}

// [Claude] — 2026-09-24 — « Explique-moi un 2-5-1 » : l'explication, puis un
// exemple prêt sous le texte (sans lecture automatique ni relance du modèle),
// avec les accords que la réponse écrit.
async function testExplanationGetsExampleCard() {
  const originalFetch = global.fetch;
  global.localStorage.store = { 'piano-jazz-ai-config': JSON.stringify({ apiKey: 'fake-key', baseUrl: 'https://api.groq.com/openai/v1', model: 'openai/gpt-oss-20b', monthlyCap: 50 }) };
  const ask = async (message, reply) => {
    let calls = 0;
    global.fetch = async () => {
      calls += 1;
      return { ok: true, status: 200, json: async () => ({ choices: [{ message: { role: 'assistant', content: reply } }] }) };
    };
    const res = await sendCopilotMessage({ message, messages: [], context: {} });
    return { res, calls };
  };
  let { res, calls } = await ask("Explique-moi l'harmonie d'un 2-5-1.", 'Le II-V-I en Do : **Dm7** (II), **G7** (V), **Cmaj7** (I). La 7e de Dm7 descend sur la tierce de G7.');
  check('Explication : un seul appel au modèle (pas de relance)', calls === 1, `appels : ${calls}`);
  check('Explication : exemple prêt sous le texte', res.toolResult?.example?.title === 'Dm7 → G7 → Cmaj7', res.toolResult?.example?.title);
  check('Explication : pas de lecture automatique', res.autoplay === false);
  check('Explication : texte inchangé (pas de remarque d\'échec)', !/n'ai pas réussi/.test(res.content));
  ({ res } = await ask('Explique-moi un 2-5-1', 'En Do, avec des couleurs : **Dm9 → G13 → Cmaj9**.'));
  check('Exemple = accords écrits dans la réponse (Dm9 G13 Cmaj9)', res.toolResult?.example?.title === 'Dm9 → G13 → Cmaj9', res.toolResult?.example?.title);
  ({ res } = await ask('Explique-moi un II-V-I en Fa', 'En Fa : **Gm7 → C7 → Fmaj7**.'));
  check('Tonalité française comprise (« en Fa » → Gm7 C7 Fmaj7)', res.toolResult?.example?.title === 'Gm7 → C7 → Fmaj7', res.toolResult?.example?.title);
  ({ res } = await ask('Joue-moi un 2-5-1 en Sib', 'Voici un II-V-I en Sib.'));
  check('« Joue-moi… en Sib » : Cm7 F7 Bbmaj7, lecture automatique', res.toolResult?.example?.title === 'Cm7 → F7 → Bbmaj7' && res.autoplay === true, `${res.toolResult?.example?.title} autoplay=${res.autoplay}`);
  global.fetch = originalFetch;
}

// [Claude] — 2026-09-24 — Session envoyée au Copilote : les constats de
// l'analyse du jeu et l'origine (prise du Studio) sont dans le contexte.
async function testSessionFindingsInPrompt() {
  const originalFetch = global.fetch;
  let system = '';
  global.fetch = async (url, options) => {
    system = JSON.parse(options.body).messages[0].content;
    return { ok: true, status: 200, json: async () => ({ choices: [{ message: { role: 'assistant', content: 'Analyse.' } }] }) };
  };
  global.localStorage.store = { 'piano-jazz-ai-config': JSON.stringify({ apiKey: 'fake-key', baseUrl: 'https://api.groq.com/openai/v1', model: 'openai/gpt-oss-20b', monthlyCap: 50 }) };
  const context = {
    type: 'session', name: 'Studio · Oceans', source: 'Prise du Studio', duration: 12, tempo: 60, noteCount: 34, chordCount: 6,
    chords: [{ start: 0, label: 'Dm9' }, { start: 2, label: 'G13' }],
    performance: { lines: ['Points forts :', '- Harmonies colorées.', 'À travailler (du plus important au moins important) :', '- Pédale gardée pendant 5 changements d\'accord sur 5 (0:02 Dm9 → G13 : Ré2, Do4).'] },
  };
  const res = await sendCopilotMessage({ message: 'Que penses-tu de ma session ? Ce qui marche, et tes suggestions (avec les moments) pour aller plus loin.', messages: [], context });
  check('Session : constats de l\'analyse du jeu dans le contexte', /## Constats de l'analyse du jeu/.test(system) && /Pédale gardée pendant 5 changements/.test(system));
  check('Session : origine « Prise du Studio » dans le contexte', /Origine : Prise du Studio/.test(system));
  check('Session : demande d\'analyse sans exemple ni lecture', res.ok && !res.toolResult?.example && res.autoplay === false);
  global.fetch = originalFetch;
}

// [Claude] — 2026-09-24 — Clavier masqué : l'explication reste, une note dit
// comment voir les touches (l'exemple s'entend quand même).
async function testCollapsedKeyboardKeepsExplanation() {
  const originalFetch = global.fetch;
  global.fetch = async () => ({ ok: true, status: 200, json: async () => ({ choices: [{ message: {
    role: 'assistant',
    content: 'Le II-V-I en Do : **Dm7 → G7 → Cmaj7**. Écoute l\'exemple ci-dessous.',
    tool_calls: [{ id: 'c1', type: 'function', function: { name: 'play_progression', arguments: JSON.stringify({ chords: ['Dm7', 'G7', 'Cmaj7'] }) } }],
  } }] }) });
  global.localStorage.store = { 'piano-jazz-ai-config': JSON.stringify({ apiKey: 'fake-key', baseUrl: 'https://api.groq.com/openai/v1', model: 'openai/gpt-oss-20b', monthlyCap: 50 }) };
  document.resetMock();
  document.setPanel(true);
  const res = await sendCopilotMessage({ message: 'Fais-moi une démo d\'un 2-5-1', messages: [], context: {} });
  check('Clavier masqué : l\'explication est gardée', /Le II-V-I en Do/.test(res.content), res.content);
  check('Clavier masqué : note pour voir les touches, exemple prêt', /affiche-le pour voir les touches/.test(res.content) && Boolean(res.toolResult?.example));
  document.setPanel(false);
  global.fetch = originalFetch;
}

function testMetadataOnPlayedNotes() {
  const result = executeToolCalls([
    { function: { name: 'play_note', arguments: JSON.stringify({ midi: 60, impliedChordName: 'Cmaj7', impliedRomanNumeral: 'I', impliedKey: 'Do majeur' }) } },
    { function: { name: 'play_note', arguments: JSON.stringify({ midi: 64 }) } },
  ]);
  check('Note avec métadonnées expose impliedChordName', result.played[0]?.impliedChordName === 'Cmaj7');
  check('Note avec métadonnées expose impliedRomanNumeral', result.played[0]?.impliedRomanNumeral === 'I');
  check('Note avec métadonnées expose impliedKey', result.played[0]?.impliedKey === 'Do majeur');
  check('Note sans métadonnées n\'a pas de champ fantôme', !('impliedChordName' in result.played[1]));
}

async function testCorrectsAnnouncedChordMismatchOnRetry() {
  const originalFetch = global.fetch;
  let callCount = 0;
  global.fetch = async () => {
    callCount += 1;
    if (callCount === 1) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          choices: [{
            message: {
              role: 'assistant',
              content: 'Voici un **Cmaj7**.',
              tool_calls: [
                { function: { name: 'play_note', arguments: JSON.stringify({ midi: 65, impliedChordName: 'Cmaj7', startOffsetMs: 0, durationMs: 500 }) } },
                { function: { name: 'play_note', arguments: JSON.stringify({ midi: 68, impliedChordName: 'Cmaj7', startOffsetMs: 80, durationMs: 500 }) } },
                { function: { name: 'play_note', arguments: JSON.stringify({ midi: 72, impliedChordName: 'Cmaj7', startOffsetMs: 160, durationMs: 500 }) } },
              ],
            },
          }],
        }),
      };
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{
          message: {
            role: 'assistant',
            content: 'Précision : c\'est en réalité un **Fm**.',
            tool_calls: [],
          },
        }],
      }),
    };
  };
  global.localStorage.store = { 'piano-jazz-ai-config': JSON.stringify({ apiKey: 'fake-key', baseUrl: 'https://api.groq.com/openai/v1', model: 'openai/gpt-oss-20b', monthlyCap: 50 }) };

  const res = await sendCopilotMessage({ message: 'Joue-moi un Cmaj7', messages: [], context: {} });

  check('Accord faux → relance utilisée (2 appels API)', callCount === 2);
  check('Texte final = texte de la seconde réponse', res.content === "Précision : c'est en réalité un **Fm**.");
  // [Claude] — 2026-09-24 — Les exemples ne jouent plus d'eux-mêmes : celui de la première
  // réponse reste à écouter sous le texte corrigé (ce sont les notes que ce texte décrit).
  check('Exemple de la première réponse gardé sous le texte corrigé', Boolean(res.toolResult.example) && res.toolResult.played.length > 0);

  global.fetch = originalFetch;
}

async function testChordMismatchFallbackOnNetworkFailure() {
  const originalFetch = global.fetch;
  let callCount = 0;
  global.fetch = async () => {
    callCount += 1;
    if (callCount === 1) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          choices: [{
            message: {
              role: 'assistant',
              content: 'Voici un **Cmaj7**.',
              tool_calls: [
                { function: { name: 'play_note', arguments: JSON.stringify({ midi: 65, impliedChordName: 'Cmaj7', startOffsetMs: 0, durationMs: 500 }) } },
                { function: { name: 'play_note', arguments: JSON.stringify({ midi: 68, impliedChordName: 'Cmaj7', startOffsetMs: 80, durationMs: 500 }) } },
                { function: { name: 'play_note', arguments: JSON.stringify({ midi: 72, impliedChordName: 'Cmaj7', startOffsetMs: 160, durationMs: 500 }) } },
              ],
            },
          }],
        }),
      };
    }
    return {
      ok: false,
      status: 500,
      text: async () => 'Internal Server Error',
    };
  };
  global.localStorage.store = { 'piano-jazz-ai-config': JSON.stringify({ apiKey: 'fake-key', baseUrl: 'https://api.groq.com/openai/v1', model: 'openai/gpt-oss-20b', monthlyCap: 50 }) };

  const res = await sendCopilotMessage({ message: 'Joue-moi un Cmaj7', messages: [], context: {} });

  check('Accord faux + retry reseau impossible -> 2 appels', callCount === 2, `callCount=${callCount}`);
  check('Note de correction ajoutee au texte original', res.content && res.content.includes('les notes jouées correspondent en réalité'), `content=${JSON.stringify(res.content)}`);
  check('Correction mentionne Fm (detecte) vs Cmaj7 (annonce)', res.content && res.content.includes('Fm') && res.content.includes('Cmaj7'), `content=${JSON.stringify(res.content)}`);
  check('toolResult original conserve', res.toolResult.played.length === 3);

  global.fetch = originalFetch;
}

async function testDemoRetryThenChordFallbackNoThirdCall() {
  const originalFetch = global.fetch;
  let callCount = 0;
  global.fetch = async () => {
    callCount += 1;
    return {
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{
          message: {
            role: 'assistant',
            content: 'Voici la démonstration : un Cmaj7.',
          },
        }],
      }),
    };
  };
  global.localStorage.store = { 'piano-jazz-ai-config': JSON.stringify({ apiKey: 'fake-key', baseUrl: 'https://api.groq.com/openai/v1', model: 'openai/gpt-oss-20b', monthlyCap: 50 }) };

  const res = await sendCopilotMessage({ message: 'Joue-moi un Cmaj7', messages: [], context: {} });

  check('Routage d\'intention offline = 1 seul appel API', callCount === 1);
  check('Le voicing Cmaj7 est joué', res.toolResult.played.length >= 3);

  global.fetch = originalFetch;
}

async function testCorrectAnnouncedChordNotCorrected() {
  const originalFetch = global.fetch;
  let callCount = 0;
  global.fetch = async () => {
    callCount += 1;
    return {
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{
          message: {
            role: 'assistant',
            content: 'Voici un **Cmaj7**.',
            tool_calls: [
              { function: { name: 'play_note', arguments: JSON.stringify({ midi: 60, impliedChordName: 'Cmaj7', startOffsetMs: 0, durationMs: 500 }) } },
              { function: { name: 'play_note', arguments: JSON.stringify({ midi: 64, impliedChordName: 'Cmaj7', startOffsetMs: 80, durationMs: 500 }) } },
              { function: { name: 'play_note', arguments: JSON.stringify({ midi: 67, impliedChordName: 'Cmaj7', startOffsetMs: 160, durationMs: 500 }) } },
            ],
          },
        }],
      }),
    };
  };
  global.localStorage.store = { 'piano-jazz-ai-config': JSON.stringify({ apiKey: 'fake-key', baseUrl: 'https://api.groq.com/openai/v1', model: 'openai/gpt-oss-20b', monthlyCap: 50 }) };

  const res = await sendCopilotMessage({ message: 'Joue-moi un Cmaj7', messages: [], context: {} });

  check('Accord correct → 1 seul appel API', callCount === 1);
  check('Texte inchangé quand accord correct', res.content === 'Voici un **Cmaj7**.');

  global.fetch = originalFetch;
}

async function testNoChordCorrectionWhenNoMetadata() {
  const originalFetch = global.fetch;
  let callCount = 0;
  global.fetch = async () => {
    callCount += 1;
    return {
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{
          message: {
            role: 'assistant',
            content: 'Voici la démonstration.',
            tool_calls: [
              { function: { name: 'play_note', arguments: JSON.stringify({ midi: 60, startOffsetMs: 0, durationMs: 500 }) } },
              { function: { name: 'play_note', arguments: JSON.stringify({ midi: 64, startOffsetMs: 80, durationMs: 500 }) } },
              { function: { name: 'play_note', arguments: JSON.stringify({ midi: 67, startOffsetMs: 160, durationMs: 500 }) } },
            ],
          },
        }],
      }),
    };
  };
  global.localStorage.store = { 'piano-jazz-ai-config': JSON.stringify({ apiKey: 'fake-key', baseUrl: 'https://api.groq.com/openai/v1', model: 'openai/gpt-oss-20b', monthlyCap: 50 }) };

  const res = await sendCopilotMessage({ message: 'Joue-moi un Cmaj7', messages: [], context: {} });

  check('Sans métadonnée → 1 seul appel API', callCount === 1);
  check('Texte inchangé sans métadonnée', res.content === 'Voici la démonstration.');

  global.fetch = originalFetch;
}

async function testRetry31KeepsOriginalTextEvenIfRetryHasDifferentText() {
  const originalFetch = global.fetch;
  let callCount = 0;
  global.fetch = async () => {
    callCount += 1;
    if (callCount === 1) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          choices: [{
            message: {
              role: 'assistant',
              content: 'Je vais te jouer un exemple.',
            },
          }],
        }),
      };
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{
          message: {
            role: 'assistant',
            content: 'Texte DIFFERENT de la relance 3.1.',
            tool_calls: [
              { function: { name: 'play_note', arguments: JSON.stringify({ midi: 60, startOffsetMs: 0, durationMs: 500 }) } },
            ],
          },
        }],
      }),
    };
  };
  global.localStorage.store = { 'piano-jazz-ai-config': JSON.stringify({ apiKey: 'fake-key', baseUrl: 'https://api.groq.com/openai/v1', model: 'openai/gpt-oss-20b', monthlyCap: 50 }) };

  const res = await sendCopilotMessage({ message: 'Joue-moi quelque chose', messages: [], context: {} });

  check('Relance 3.1 avec texte différent garde le texte ORIGINAL', res.content === 'Je vais te jouer un exemple.');
  check('toolResult vient bien de la relance (note jouée)', res.toolResult.played.length === 1);
  check('Exactement 2 appels API', callCount === 2);

  global.fetch = originalFetch;
}

async function testCorrectsAnnouncedDegreeMismatchOnRetry() {
  const originalFetch = global.fetch;
  let callCount = 0;
  global.fetch = async () => {
    callCount += 1;
    if (callCount === 1) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          choices: [{
            message: {
              role: 'assistant',
              content: 'Voici le iii de Do# majeur.',
              tool_calls: [
                { function: { name: 'play_note', arguments: JSON.stringify({ midi: 60, impliedRomanNumeral: 'iii', impliedKey: 'Do# majeur', startOffsetMs: 0, durationMs: 500 }) } },
                { function: { name: 'play_note', arguments: JSON.stringify({ midi: 64, impliedRomanNumeral: 'iii', impliedKey: 'Do# majeur', startOffsetMs: 80, durationMs: 500 }) } },
                { function: { name: 'play_note', arguments: JSON.stringify({ midi: 67, impliedRomanNumeral: 'iii', impliedKey: 'Do# majeur', startOffsetMs: 160, durationMs: 500 }) } },
                { function: { name: 'play_note', arguments: JSON.stringify({ midi: 71, impliedRomanNumeral: 'iii', impliedKey: 'Do# majeur', startOffsetMs: 240, durationMs: 500 }) } },
              ],
            },
          }],
        }),
      };
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{
          message: {
            role: 'assistant',
            content: 'Précision : c\'est plutôt un accord de Do majeur.',
            tool_calls: [],
          },
        }],
      }),
    };
  };
  global.localStorage.store = { 'piano-jazz-ai-config': JSON.stringify({ apiKey: 'fake-key', baseUrl: 'https://api.groq.com/openai/v1', model: 'openai/gpt-oss-20b', monthlyCap: 50 }) };

  const res = await sendCopilotMessage({ message: 'Montre-moi le iii de Do# majeur', messages: [], context: {} });

  check('Désaccord degré/tonalité → relance (2 appels API)', callCount === 2);
  check('Texte final = texte de la seconde réponse', res.content === "Précision : c'est plutôt un accord de Do majeur.");
  // [Claude] — 2026-09-24 — Les exemples ne jouent plus d'eux-mêmes : celui de la première
  // réponse reste à écouter sous le texte corrigé (ce sont les notes que ce texte décrit).
  check('Exemple de la première réponse gardé sous le texte corrigé', Boolean(res.toolResult.example) && res.toolResult.played.length > 0);

  global.fetch = originalFetch;
}

async function testDegreeMismatchFallbackOnNetworkFailure() {
  const originalFetch = global.fetch;
  let callCount = 0;
  global.fetch = async () => {
    callCount += 1;
    if (callCount === 1) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          choices: [{
            message: {
              role: 'assistant',
              content: 'Voici le iii de Do# majeur.',
              tool_calls: [
                { function: { name: 'play_note', arguments: JSON.stringify({ midi: 60, impliedRomanNumeral: 'iii', impliedKey: 'Do# majeur', startOffsetMs: 0, durationMs: 500 }) } },
                { function: { name: 'play_note', arguments: JSON.stringify({ midi: 64, impliedRomanNumeral: 'iii', impliedKey: 'Do# majeur', startOffsetMs: 80, durationMs: 500 }) } },
                { function: { name: 'play_note', arguments: JSON.stringify({ midi: 67, impliedRomanNumeral: 'iii', impliedKey: 'Do# majeur', startOffsetMs: 160, durationMs: 500 }) } },
                { function: { name: 'play_note', arguments: JSON.stringify({ midi: 71, impliedRomanNumeral: 'iii', impliedKey: 'Do# majeur', startOffsetMs: 240, durationMs: 500 }) } },
              ],
            },
          }],
        }),
      };
    }
    return { ok: false, status: 500, text: async () => 'Internal Server Error' };
  };
  global.localStorage.store = { 'piano-jazz-ai-config': JSON.stringify({ apiKey: 'fake-key', baseUrl: 'https://api.groq.com/openai/v1', model: 'openai/gpt-oss-20b', monthlyCap: 50 }) };

  const res = await sendCopilotMessage({ message: 'Montre-moi le iii de Do# majeur', messages: [], context: {} });

  check('Désaccord degré + retry réseau impossible → 2 appels', callCount === 2, `callCount=${callCount}`);
  check('Note de précision degré ajoutée', res.content && res.content.includes('l\'accord théoriquement attendu est plutôt'), `content=${JSON.stringify(res.content)}`);
  check('toolResult original conservé', res.toolResult.played.length === 4);

  global.fetch = originalFetch;
}

async function testDegreeRetryAfterChordRetryNoThirdCallButNoDoubleFallback() {
  const originalFetch = global.fetch;
  let callCount = 0;
  global.fetch = async () => {
    callCount += 1;
    if (callCount === 1) {
      // Première réponse : annonce Cmaj7, joue Fm (désaccord nom d'accord).
      return {
        ok: true,
        status: 200,
        json: async () => ({
          choices: [{
            message: {
              role: 'assistant',
              content: 'Voici un **Cmaj7**.',
              tool_calls: [
                { function: { name: 'play_note', arguments: JSON.stringify({ midi: 65, impliedChordName: 'Cmaj7', impliedRomanNumeral: 'iii', impliedKey: 'Do# majeur', startOffsetMs: 0, durationMs: 500 }) } },
                { function: { name: 'play_note', arguments: JSON.stringify({ midi: 68, impliedChordName: 'Cmaj7', impliedRomanNumeral: 'iii', impliedKey: 'Do# majeur', startOffsetMs: 80, durationMs: 500 }) } },
                { function: { name: 'play_note', arguments: JSON.stringify({ midi: 72, impliedChordName: 'Cmaj7', impliedRomanNumeral: 'iii', impliedKey: 'Do# majeur', startOffsetMs: 160, durationMs: 500 }) } },
              ],
            },
          }],
        }),
      };
    }
    // Seconde réponse (retry 3.3) : corrige le nom d'accord mais garde le
    // désaccord degré/tonalité. Le 3.4 doit tomber en repli déterministe,
    // sans troisième appel API.
    return {
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{
          message: {
            role: 'assistant',
            content: 'Précision : c\'est un **Fm**.',
            tool_calls: [
              { function: { name: 'play_note', arguments: JSON.stringify({ midi: 65, impliedChordName: 'Fm', impliedRomanNumeral: 'iii', impliedKey: 'Do# majeur', startOffsetMs: 0, durationMs: 500 }) } },
              { function: { name: 'play_note', arguments: JSON.stringify({ midi: 68, impliedChordName: 'Fm', impliedRomanNumeral: 'iii', impliedKey: 'Do# majeur', startOffsetMs: 80, durationMs: 500 }) } },
              { function: { name: 'play_note', arguments: JSON.stringify({ midi: 72, impliedChordName: 'Fm', impliedRomanNumeral: 'iii', impliedKey: 'Do# majeur', startOffsetMs: 160, durationMs: 500 }) } },
            ],
          },
        }],
      }),
    };
  };
  global.localStorage.store = { 'piano-jazz-ai-config': JSON.stringify({ apiKey: 'fake-key', baseUrl: 'https://api.groq.com/openai/v1', model: 'openai/gpt-oss-20b', monthlyCap: 50 }) };

  const res = await sendCopilotMessage({ message: 'Montre-moi le iii de Do# majeur', messages: [], context: {} });

  check('Retry 3.3 puis fallback 3.4 = exactement 2 appels API', callCount === 2);
  // La seconde réponse (Fm) est musicalement CORRECTE pour le iii de Do# majeur
  // (E#m/Fm, même classe de hauteur), donc la correction de degré 3.4 ne doit
  // PAS se déclencher. On vérifie juste qu'on n'a pas fait de 3e appel.
  check('Texte corrigé de la seconde réponse conservé', res.content === "Précision : c'est un **Fm**.");
  check('toolResult vient de la seconde réponse', res.toolResult.played.length === 3);

  global.fetch = originalFetch;
}

async function testCorrectDegreeNotCorrected() {
  const originalFetch = global.fetch;
  let callCount = 0;
  global.fetch = async () => {
    callCount += 1;
    return {
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{
          message: {
            role: 'assistant',
            content: 'Voici le iii de Do# majeur.',
            tool_calls: [
              { function: { name: 'play_note', arguments: JSON.stringify({ midi: 65, impliedRomanNumeral: 'iii', impliedKey: 'Do# majeur', startOffsetMs: 0, durationMs: 500 }) } },
              { function: { name: 'play_note', arguments: JSON.stringify({ midi: 68, impliedRomanNumeral: 'iii', impliedKey: 'Do# majeur', startOffsetMs: 80, durationMs: 500 }) } },
              { function: { name: 'play_note', arguments: JSON.stringify({ midi: 72, impliedRomanNumeral: 'iii', impliedKey: 'Do# majeur', startOffsetMs: 160, durationMs: 500 }) } },
            ],
          },
        }],
      }),
    };
  };
  global.localStorage.store = { 'piano-jazz-ai-config': JSON.stringify({ apiKey: 'fake-key', baseUrl: 'https://api.groq.com/openai/v1', model: 'openai/gpt-oss-20b', monthlyCap: 50 }) };

  const res = await sendCopilotMessage({ message: 'Montre-moi le iii de Do# majeur', messages: [], context: {} });

  check('Degré/tonalité corrects → 1 seul appel API', callCount === 1);
  check('Texte inchangé quand degré correct', res.content === 'Voici le iii de Do# majeur.');

  global.fetch = originalFetch;
}

async function testVoicingDescriptionMismatchRootlessTriggersRetry() {
  const originalFetch = global.fetch;
  let callCount = 0;
  global.fetch = async () => {
    callCount += 1;
    return {
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{
          message: {
            role: 'assistant',
            content: 'Voici un Cmaj7 rootless avec la fondamentale à la basse.',
            tool_calls: [
              { function: { name: 'play_voicing', arguments: JSON.stringify({ chordSymbol: 'Cmaj7', technique: 'rootless' }) } },
            ],
          },
        }],
      }),
    };
  };
  global.localStorage.store = { 'piano-jazz-ai-config': JSON.stringify({ apiKey: 'fake-key', baseUrl: 'https://api.groq.com/openai/v1', model: 'openai/gpt-oss-20b', monthlyCap: 50 }) };

  const res = await sendCopilotMessage({ message: 'Joue-moi un Cmaj7 rootless', messages: [], context: {} });

  check('Voicing rootless + texte "fondamentale à la basse" → 2 appels API (retry)', callCount === 2, `callCount=${callCount}`);
  check('toolResult expose le voicing généré', res.toolResult.voicing?.isPlayable === true, `voicing=${JSON.stringify(res.toolResult.voicing)}`);
  check('Le voicing rootless n\'a pas la fondamentale à la main gauche', res.toolResult.voicing.leftHand.every((n) => n % 12 !== 0), `leftHand=${JSON.stringify(res.toolResult.voicing.leftHand)}`);

  global.fetch = originalFetch;
}

async function testVoicingDescriptionDrop2CoherentNoRetry() {
  const originalFetch = global.fetch;
  let callCount = 0;
  global.fetch = async () => {
    callCount += 1;
    return {
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{
          message: {
            role: 'assistant',
            // Dans un VRAI drop 2, c'est la 2e voix depuis le haut (ici la
            // quinte) qui descend à la main gauche : la fondamentale reste à
            // la main droite. Une description affirmant « fondamentale à la
            // main gauche » serait donc incohérente et déclencherait une
            // relance — c'est bien ce que vérifie le test symétrique.
            content: 'Voici un Cmaj7 en drop 2, la fondamentale est à la main droite.',
            tool_calls: [
              { function: { name: 'play_voicing', arguments: JSON.stringify({ chordSymbol: 'Cmaj7', technique: 'drop2' }) } },
            ],
          },
        }],
      }),
    };
  };
  global.localStorage.store = { 'piano-jazz-ai-config': JSON.stringify({ apiKey: 'fake-key', baseUrl: 'https://api.groq.com/openai/v1', model: 'openai/gpt-oss-20b', monthlyCap: 50 }) };

  const res = await sendCopilotMessage({ message: 'Joue-moi un Cmaj7 drop 2', messages: [], context: {} });

  check('Drop2 + description cohérente → 1 seul appel API', callCount === 1, `callCount=${callCount}`);
  check('Texte inchangé quand description cohérente', res.content === 'Voici un Cmaj7 en drop 2, la fondamentale est à la main droite.');
  check('toolResult expose le voicing drop2', res.toolResult.voicing?.isPlayable === true && res.toolResult.voicing.technique === 'drop2', `voicing=${JSON.stringify(res.toolResult.voicing)}`);

  global.fetch = originalFetch;
}

async function testFallbackWithoutToolsOn400() {
  const originalFetch = global.fetch;
  let callCount = 0;
  let capturedBodies = [];
  global.fetch = async (url, options) => {
    callCount += 1;
    capturedBodies.push(JSON.parse(options.body));
    if (callCount === 1) {
      return {
        ok: false,
        status: 400,
        text: async () => JSON.stringify({ error: { message: 'model does not support tools', type: 'invalid_request_error' } }),
      };
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{
          message: {
            role: 'assistant',
            content: 'Voici un Cmaj7 : [PLAY_NOTE: C4, E4, G4]',
          },
        }],
      }),
    };
  };

  const res = await sendCopilotMessage({ message: 'Joue-moi un Cmaj7', messages: [], context: {} });

  check('Erreur 400 → repli sans tools (2 appels)', callCount === 2);
  check('Le second appel ne contient pas tools', !('tools' in capturedBodies[1]));
  check('Le texte de réponse est conservé', res.content === 'Voici un Cmaj7 : [PLAY_NOTE: C4, E4, G4]');
  check('Les notes textuelles sont jouées (3 notes)', res.toolResult.played.length === 3);

  global.fetch = originalFetch;
}

async function testParsePlayNoteFromText() {
  const originalFetch = global.fetch;
  const originalSetTimeout = global.setTimeout;
  const scheduled = [];
  global.setTimeout = (fn, delay) => {
    scheduled.push({ fn, delay });
    return scheduled.length;
  };
  let callCount = 0;
  global.fetch = async () => {
    callCount += 1;
    if (callCount === 1) {
      return {
        ok: false,
        status: 400,
        text: async () => JSON.stringify({ error: { message: 'model does not support tools', type: 'invalid_request_error' } }),
      };
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{
          message: {
            role: 'assistant',
            content: 'Regarde ces touches : [PLAY_NOTE: C4, E4, G4]',
          },
        }],
      }),
    };
  };

  const res = await sendCopilotMessage({ message: 'Montre-moi un Cmaj7', messages: [], context: {} });

  check('Trois notes textuelles trouvées dans un seul groupe', res.toolResult.played.length === 3, `played.length=${res.toolResult.played.length}`);
  if (res.toolResult.played.length >= 3) {
    check('La première note est C4 (MIDI 60)', res.toolResult.played[0].midi === 60, `played=${JSON.stringify(res.toolResult.played)}`);
    check('La dernière note est G4 (MIDI 67)', res.toolResult.played[2].midi === 67, `played=${JSON.stringify(res.toolResult.played)}`);
  }

  global.fetch = originalFetch;
  global.setTimeout = originalSetTimeout;
}

// [Claude] — 2026-09-25 — Tutoriel : rejouer les notes EXACTES du professeur
// (play_tutorial_passage), transposées au besoin ; message honnête quand
// l'application n'a pas lu ses notes.
const TUTORIAL = {
  key: 'C',
  segments: [{ start: 0, end: 2, label: 'Dm9' }, { start: 2, end: 4, label: 'G13' }],
  noteEvents: [
    { midi: 38, start: 0, end: 1.9, hand: 'lh' }, { midi: 53, start: 0, end: 1.9, hand: 'rh' }, { midi: 57, start: 0, end: 1.9, hand: 'rh' },
    { midi: 60, start: 0, end: 1.9, hand: 'rh' }, { midi: 64, start: 0, end: 1.9, hand: 'rh' },
    { midi: 74, start: 2, end: 2.2, hand: 'rh' }, { midi: 75, start: 2.25, end: 2.45, hand: 'rh' }, { midi: 76, start: 2.5, end: 3, hand: 'rh' },
  ],
};

function testTutorialPassageTool() {
  document.resetMock();
  document.setPanel(false);
  const call = (args) => ({ function: { name: 'play_tutorial_passage', arguments: JSON.stringify(args) } });
  const lick = executeToolCalls([call({ start: 2, end: 3, title: 'Le lick de 0:02' })], 'Voici le lick.', { tutorial: TUTORIAL });
  const ons = (ex) => (ex?.events || []).filter((e) => e.type === 'noteOn').map((e) => e.note).join(',');
  check('play_tutorial_passage : les notes exactes du professeur', ons(lick.example) === '74,75,76' && lick.example.title === 'Le lick de 0:02', ons(lick.example));
  check('play_tutorial_passage : l\'exemple garde le moment de la vidéo', lick.example.tutorialStart === 2 && lick.example.tutorialEnd === 3);
  const inF = executeToolCalls([call({ start: 2, end: 3, transposeTo: 'F' })], 'En Fa.', { tutorial: TUTORIAL });
  check('play_tutorial_passage : transposé de Do en Fa (+5)', ons(inF.example) === '79,80,81', ons(inF.example));
  const lh = executeToolCalls([call({ start: 0, end: 2, hand: 'LH' })], '', { tutorial: TUTORIAL });
  check('play_tutorial_passage : main gauche seule', ons(lh.example) === '38');
  const none = executeToolCalls([call({ start: 2, end: 3 })], 'Voici le lick.', { tutorial: null });
  check('Sans notes du professeur : pas d\'exemple, message honnête', !none.example && /pas les notes exactes jouées par le professeur/.test(none.content || ''), none.content);
  const empty = executeToolCalls([call({ start: 30, end: 32 })], '', { tutorial: TUTORIAL });
  check('Aucune note lue entre deux instants : dit tel quel', !empty.example && /Aucune note du professeur/.test(empty.content || ''), empty.content);
}

async function testTutorialContextInPrompt() {
  const originalFetch = global.fetch;
  // Premier appel de chaque question (une relance peut suivre : elle garde les mêmes outils).
  let body = null;
  const bodies = [];
  global.fetch = async (url, options) => {
    bodies.push(JSON.parse(options.body));
    if (!body) body = bodies[bodies.length - 1];
    return { ok: true, status: 200, json: async () => ({ choices: [{ message: { role: 'assistant', content: 'Réponse.' } }] }) };
  };
  global.localStorage.store = { 'piano-jazz-ai-config': JSON.stringify({ apiKey: 'fake-key', baseUrl: 'https://api.groq.com/openai/v1', model: 'openai/gpt-oss-20b', monthlyCap: 50 }) };
  const context = {
    type: 'tutorial', path: '/t/cours.mp4', name: 'Cours de gospel', key: 'C', sourceLabel: 'lu à l\'image (clavier dessiné)',
    summary: 'Le professeur enchaîne Dm9 et G13 puis joue un lick chromatique.',
    chords: TUTORIAL.segments, transcript: [{ start: 1, text: 'On pose le Dm9.' }],
    notesTimeline: ['- 0:00 Dm9 : Ré2 | Fa3 La3 Do4 Mi4', '- 0:02 G13 : — | Ré5 · puis Ré#5 Mi5'],
    noteEvents: TUTORIAL.noteEvents,
  };
  await sendCopilotMessage({ message: 'Joue-moi le lick de 0:02 en Fa', messages: [], context });
  const system = body?.messages?.[0]?.content || '';
  const tools = (body?.tools || []).map((t) => t.function?.name);
  check('Tutoriel : relevé, résumé du cours et frise des notes dans le contexte',
    /Relevé : lu à l'image \(clavier dessiné\)/.test(system) && /## Résumé du cours/.test(system) && /- 0:02 G13 : — \| Ré5 · puis Ré#5 Mi5/.test(system), system.slice(-900));
  check('Tutoriel avec notes : outil play_tutorial_passage proposé (plus de show_tutorial_moment ni d\'annotate_keyboard)', tools.includes('play_tutorial_passage') && !tools.includes('show_tutorial_moment') && !tools.includes('annotate_keyboard'), tools.join(','));
  check('Tutoriel : la relance (exemple annoncé sans outil) garde les outils du tutoriel',
    bodies.length === 2 && (bodies[1].tools || []).some((t) => t.function?.name === 'play_tutorial_passage'), `appels=${bodies.length}`);
  body = null;
  bodies.length = 0;
  await sendCopilotMessage({ message: 'Joue-moi le lick de 0:02', messages: [], context: { ...context, notesTimeline: [], noteEvents: [], notesUnavailable: 'le clavier n\'est pas lisible à l\'image' } });
  const system2 = body?.messages?.[0]?.content || '';
  const tools2 = (body?.tools || []).map((t) => t.function?.name);
  check('Tutoriel sans notes : la raison est dite au modèle, pas d\'outil de passage',
    /non disponibles \(le clavier n'est pas lisible à l'image\)/.test(system2) && !tools2.includes('play_tutorial_passage'), `${tools2.join(',')}`);
  global.fetch = originalFetch;
}

// [Claude] — 2026-09-25 — Exercice : le Copilote reçoit l'exercice affiché et
// fait entendre les voicings EXACTS de la carte (play_exercise).
const EXERCISE = {
  type: 'exercise', mode: 'movement', id: 'mouvement:II-V-I:5', title: 'Mouvement 12 tons — II-V-I majeur en F majeur', name: 'II-V-I majeur',
  description: '', key: 'F majeur', keyProgress: '1 / 12 tons', stepProgress: '2 / 3 accords', technique: 'Auto', level: 3,
  chords: [
    { name: 'Gm9', rootPc: 7, quality: 'm9', degree: '2', passing: false, technique: 'rootless', lh: [43], rh: [58, 62, 65, 69], roles: ['1', 'b3', '5', 'b7', '9'], current: false },
    { name: 'C13', rootPc: 0, quality: '13', degree: '5', passing: false, technique: 'rootless', lh: [48], rh: [58, 64, 69], roles: ['1', 'b7', '3', '13'], current: true },
    { name: 'Fmaj9', rootPc: 5, quality: 'maj9', degree: '1', passing: false, technique: 'rootless', lh: [41], rh: [57, 60, 64, 67], roles: ['1', '3', '5', '7', '9'], current: false },
  ],
  attempts: [{ expected: 'C13', notes: [48, 58, 63, 69], heard: 'Cm13' }],
  expect: { chords: ['Gm9', 'C13', 'Fmaj9'], technique: null, keyPc: 5, minor: false },
};

function testExerciseTool() {
  document.resetMock();
  document.setPanel(false);
  const call = (args) => ({ function: { name: 'play_exercise', arguments: JSON.stringify(args) } });
  const ons = (ex) => (ex?.events || []).filter((e) => e.type === 'noteOn').map((e) => e.note).join(',');
  const current = executeToolCalls([call({})], 'Voici C13.', { exercise: EXERCISE });
  check('play_exercise : l\'accord en cours avec le voicing EXACT de la carte', ons(current.example) === '48,58,64,69' && current.example.kind === 'exercise', ons(current.example));
  const all = executeToolCalls([call({ chords: 'all', title: 'Le II-V-I de la carte' })], '', { exercise: EXERCISE });
  const at = (ex, t) => (ex?.events || []).filter((e) => e.type === 'noteOn' && Math.abs(e.time - t) < 1e-6).map((e) => e.note).join(',');
  check('play_exercise « all » : les trois accords enchaînés (un toutes les 1,6 s)', at(all.example, 0) === '43,58,62,65,69' && at(all.example, 1.6) === '48,58,64,69' && at(all.example, 3.2) === '41,57,60,64,67' && all.example.title === 'Le II-V-I de la carte', `${at(all.example, 0)} | ${at(all.example, 1.6)} | ${at(all.example, 3.2)}`);
  const bass = (all.example.events || []).find((e) => e.type === 'noteOn' && e.note === 43);
  check('play_exercise : la main gauche de la carte reste à la main gauche', bass?.hand === 'lh' && all.example.steps === undefined, JSON.stringify(bass));
  const named = executeToolCalls([call({ chords: 'Fmaj9 Gm9' })], '', { exercise: EXERCISE });
  check('play_exercise par noms : dans l\'ordre demandé', at(named.example, 0) === '41,57,60,64,67' && at(named.example, 1.6) === '43,58,62,65,69');
  const none = executeToolCalls([call({})], 'Voici.', { exercise: null });
  check('play_exercise sans exercice : pas d\'exemple, message honnête', !none.example && /Aucun exercice n'est affiché/.test(none.content || ''), none.content);
  const both = executeToolCalls([call({}), { function: { name: 'play_progression', arguments: JSON.stringify({ chords: ['Gm7', 'C7', 'Fmaj7'] }) } }], '', { exercise: EXERCISE });
  check('play_exercise l\'emporte sur play_progression (voicings de la carte)', ons(both.example) === '48,58,64,69' && both.ignored === 1, `${ons(both.example)} ignored=${both.ignored}`);
}

async function testExerciseContextInPrompt() {
  const originalFetch = global.fetch;
  let body = null;
  global.fetch = async (url, options) => {
    if (!body) body = JSON.parse(options.body);
    return { ok: true, status: 200, json: async () => ({ choices: [{ message: { role: 'assistant', content: 'Réponse.' } }] }) };
  };
  global.localStorage.store = { 'piano-jazz-ai-config': JSON.stringify({ apiKey: 'fake-key', baseUrl: 'https://api.groq.com/openai/v1', model: 'openai/gpt-oss-20b', monthlyCap: 50 }) };
  await sendCopilotMessage({ message: 'Explique-moi le voicing de la carte.', messages: [], context: EXERCISE });
  const system = body?.messages?.[0]?.content || '';
  const tools = (body?.tools || []).map((t) => t.function?.name);
  check('Exercice : titre, accord en cours et voicings exacts dans le contexte',
    /## Exercice en cours : Mouvement 12 tons — II-V-I majeur en F majeur/.test(system) && /- ▶ C13 \[5\] : Do3 \| Sib3 Mi4 La4/.test(system), system.slice(system.indexOf('## Exercice'), system.indexOf('## Exercice') + 500));
  check('Exercice : derniers essais pas encore retenus dans le contexte', /pour C13 : Do3 Sib3 Ré#4 La4 \(entendu : Cm13\)|pour C13 : Do3 Sib3 Mib4 La4 \(entendu : Cm13\)/.test(system), (system.match(/pour C13 :[^\n]*/) || [''])[0]);
  check('Exercice : outil play_exercise proposé ; paragraphe du prompt présent', tools.includes('play_exercise') && /Exercice en cours \(quand le contexte décrit un exercice/.test(system), tools.join(','));
  global.fetch = originalFetch;
}

// [Claude] — 2026-09-25 — Rejouer le jeu EXACT du pianiste (play_my_playing).
// Session : Dm9 (Ré2 La2 | Do4 Mi4 Fa4, La4 dessus) puis Sol4 Fa4 ; G13 (Sol2 Fa3 | La4 Si4, Mi5 dessus).
function sessionEvents() {
  const events = [];
  const note = (at, midi, hold, velocity = 0.7) => {
    events.push({ type: 'note_on', note: midi, velocity, channel: 0, time: at });
    events.push({ type: 'note_off', note: midi, velocity: 0, channel: 0, time: at + hold });
  };
  [38, 45].forEach((m) => note(0, m, 1.9, 0.55));
  [60, 64, 65].forEach((m) => note(0, m, 0.9, 0.55));
  note(0, 69, 0.9, 0.8);
  note(1, 67, 0.45); note(1.5, 65, 0.45);
  [43, 53].forEach((m) => note(2, m, 1.9, 0.5));
  [69, 71].forEach((m) => note(2, m, 1.8, 0.5));
  note(2, 76, 1.8, 0.85);
  events.push({ type: 'control', controller: 64, value: 127, channel: 0, time: 0.1 });
  events.push({ type: 'control', controller: 64, value: 0, channel: 0, time: 1.95 });
  return events.sort((a, b) => a.time - b.time);
}
const PASSAGE_EVENTS = [
  { type: 'note_on', note: 72, velocity: 0.7, channel: 0, time: 0 }, { type: 'note_off', note: 72, velocity: 0, channel: 0, time: 0.4 },
  { type: 'note_on', note: 74, velocity: 0.7, channel: 0, time: 0.5 }, { type: 'note_off', note: 74, velocity: 0, channel: 0, time: 0.9 },
];

function testMyPlayingTool() {
  document.resetMock();
  document.setPanel(false);
  const call = (args) => ({ function: { name: 'play_my_playing', arguments: JSON.stringify(args) } });
  const ons = (ex) => (ex?.events || []).filter((e) => e.type === 'noteOn').map((e) => e.note).join(',');
  const playing = { session: { events: sessionEvents(), key: 'Do majeur', offset: 0 } };
  const all = executeToolCalls([call({ start: 0, end: 4 })], 'Voici ta session.', { playing });
  check('play_my_playing : les notes EXACTES de la session, pédale comprise', ons(all.example) === '38,45,60,64,65,69,67,65,43,53,69,71,76' && all.example.kind === 'playing' && all.example.events.some((e) => e.type === 'sustain'), ons(all.example));
  const melody = executeToolCalls([call({ part: 'melodie' })], '', { playing });
  check('play_my_playing « melodie » : la voix du dessus (notes jouées avec les accords comprises)', ons(melody.example) === '69,67,65,76', ons(melody.example));
  const left = executeToolCalls([call({ part: 'main_gauche' })], '', { playing });
  check('play_my_playing « main_gauche » : Ré2 La2 puis Sol2 Fa3', ons(left.example) === '38,45,43,53', ons(left.example));
  const heard = executeToolCalls([call({ part: 'melodie' })], '', { playing: { session: { ...playing.session, offset: 2 } } });
  check('Session : même hauteur que sa relecture (transposition du clavier +2)', ons(heard.example) === '71,69,67,78', ons(heard.example));
  const inF = executeToolCalls([call({ part: 'melodie', transposeTo: 'F' })], '', { playing });
  check('play_my_playing transposé de Do en Fa (+5)', ons(inF.example) === '74,72,70,81' && /\+5 demi-tons/.test(inF.example.subtitle), `${ons(inF.example)} ${inF.example?.subtitle}`);
  const both = { ...playing, passage: { events: PASSAGE_EVENTS, key: null } };
  check('Passage de « Qu\'en penses-tu ? » présent : rejoué par défaut', ons(executeToolCalls([call({})], '', { playing: both }).example) === '72,74');
  check('source « session » : la session, même avec un passage', ons(executeToolCalls([call({ source: 'session', part: 'melodie' })], '', { playing: both }).example) === '69,67,65,76');
  const wins = executeToolCalls([call({ part: 'melodie' }), { function: { name: 'play_progression', arguments: JSON.stringify({ chords: ['Dm7', 'G7'] }) } }], '', { playing });
  check('play_my_playing l\'emporte sur un exemple recomposé (play_progression)', ons(wins.example) === '69,67,65,76' && wins.ignored === 1, `${ons(wins.example)} ignored=${wins.ignored}`);
  const none = executeToolCalls([call({ part: 'melodie' })], 'Voici.', { playing: null });
  check('Jeu pas confié : pas d\'exemple, il est dit comment le confier', !none.example && /Analyser mon jeu avec le Copilot/.test(none.content || '') && /Qu'en penses-tu/.test(none.content || ''), none.content);
  const empty = executeToolCalls([call({ start: 30, end: 40 })], '', { playing });
  check('Rien joué entre deux moments : dit tel quel', !empty.example && /Je ne trouve rien de joué entre 0:30 et 0:40/.test(empty.content || ''), empty.content);
}

function testMyPlayingRequest() {
  const r1 = myPlayingRequest('Rejoue ma mélodie');
  check('« Rejoue ma mélodie » → son jeu, la mélodie', r1?.part === 'melodie', JSON.stringify(r1));
  const r2 = myPlayingRequest('Fais-moi réécouter ma main gauche de 0:30 à 0:45');
  check('« réécouter ma main gauche de 0:30 à 0:45 » → main gauche, 30 à 45 s', r2?.part === 'main_gauche' && r2.start === 30 && r2.end === 45, JSON.stringify(r2));
  const r3 = myPlayingRequest('Tu peux rejouer ce que j\'ai joué à 1:12,5 ?');
  check('« ce que j\'ai joué à 1:12,5 » → tout, autour de ce moment', r3?.part === 'tout' && Math.abs(r3.start - 72.2) < 1e-9 && Math.abs(r3.end - 82.5) < 1e-9, JSON.stringify(r3));
  check('« Rejoue 0:30 » : son jeu quand une session est confiée, sinon non', myPlayingRequest('Rejoue 0:30', { session: true })?.start === 29.7 && myPlayingRequest('Rejoue 0:30') === null);
  const r5 = myPlayingRequest('Rejoue ma session transposée en Fa');
  check('« ma session transposée en Fa » → transposeTo F', r5?.transposeTo === 'F', JSON.stringify(r5));
  check('Un lick, un 2-5-1 : pas son jeu', myPlayingRequest('Joue-moi un lick sur G7') === null && myPlayingRequest('Explique-moi un 2-5-1 en Do') === null && myPlayingRequest('Joue la mélodie de Autumn Leaves') === null);
  const questions = ['Est-ce que ce que je joue est juste ?', 'Je joue ma mélodie trop vite ?', 'Comment améliorer ma main gauche ?', 'Ma session est-elle en Do ?', 'J\'ai joué ma mélodie à 0:30, c\'est bien ?'];
  check('Questions sur son jeu (sans demande d\'écoute) : pas de relecture imposée', questions.every((m) => myPlayingRequest(m, { session: true }) === null), questions.filter((m) => myPlayingRequest(m, { session: true })).join(' | '));
  const asks = ['Joue ma mélodie', 'Peux-tu rejouer ce que j\'ai joué à 1:12 ?', 'Je veux réentendre ma session', 'Fais-moi entendre mes accords', 'Rejoue le passage de 0:30', 'Joue-moi ma main droite'];
  check('Demandes d\'écoute de son jeu reconnues', asks.every((m) => myPlayingRequest(m, { session: true })), asks.filter((m) => !myPlayingRequest(m, { session: true })).join(' | '));
}

async function testMyPlayingInSend() {
  const originalFetch = global.fetch;
  global.localStorage.store = { 'piano-jazz-ai-config': JSON.stringify({ apiKey: 'fake-key', baseUrl: 'https://api.groq.com/openai/v1', model: 'openai/gpt-oss-20b', monthlyCap: 50 }) };
  let body = null;
  // Le modèle répond sans appeler d'outil.
  global.fetch = async (url, options) => {
    if (!body) body = JSON.parse(options.body);
    return { ok: true, status: 200, json: async () => ({ choices: [{ message: { role: 'assistant', content: 'Voici ta mélodie : La4 Sol4 Fa4, puis Mi5 sur G13.' } }] }) };
  };
  const context = {
    type: 'session', sessionId: 's1', name: 'Ma session', duration: 4, noteCount: 13, chordCount: 2,
    portrait: ['## Portrait de la session (notes exactes, moments m:ss,d)', '### Mélodie (voix du dessus)', '- 0:00,0 Dm9 : La4 Sol4 Fa4'],
    events: sessionEvents(),
    playing: { session: { events: sessionEvents(), key: null, offset: 0 } },
  };
  const res = await sendCopilotMessage({ message: 'Rejoue ma mélodie', messages: [], context });
  const system = body?.messages?.[0]?.content || '';
  const tools = (body?.tools || []).map((t) => t.function?.name);
  check('Session confiée : outil play_my_playing proposé, paragraphe du prompt présent', tools.includes('play_my_playing') && /Ne recompose jamais son jeu/.test(system) && /play_my_playing \(source « session »\)/.test(system), tools.join(','));
  check('Les évènements exacts ne partent jamais dans le texte envoyé', !/note_on|"velocity"/.test(system) && system.length < 60000, String(system.length));
  const ons = (res.toolResult?.example?.events || []).filter((e) => e.type === 'noteOn').map((e) => e.note).join(',');
  check('« Rejoue ma mélodie » sans outil appelé : sa mélodie rejouée à l\'identique, jamais un lick', res.ok && res.toolResult?.example?.kind === 'playing' && ons === '69,67,65,76', `${res.toolResult?.example?.kind} ${ons}`);
  check('« Rejoue ma mélodie » : l\'exemple démarre tout seul', res.autoplay === true);

  body = null;
  const offset = await sendCopilotMessage({ message: 'Que penses-tu de ma session ?', messages: [], context: { ...context, playing: { session: { ...context.playing.session, offset: -3 } } } });
  const system2 = body?.messages?.[0]?.content || '';
  check('Transposition du clavier dite au modèle', offset.ok && /Transposition du clavier en cours : -3 demi-tons \(la relecture et play_my_playing sonnent 3 demi-tons plus bas/.test(system2), (system2.match(/Transposition du clavier[^\n]*/) || [''])[0]);

  body = null;
  const alone = await sendCopilotMessage({ message: 'Rejoue ma mélodie', messages: [], context: null });
  const tools3 = (body?.tools || []).map((t) => t.function?.name);
  check('Rien de confié : pas d\'outil play_my_playing, pas d\'exemple inventé, comment le confier',
    !tools3.includes('play_my_playing') && !alone.toolResult?.example && /Analyser mon jeu avec le Copilot/.test(alone.content || ''), `${tools3.join(',')} | ${alone.content}`);
  global.fetch = originalFetch;
}

async function runTests() {
  testToolCalls();
  await testNoKey();
  await test401();
  await testRequestBodySchemaAndTokens();
  await testMessagesSanitizedBeforeApiCall();
  await testAutonomousModeNoPhantomContext();
  await testRetryWhenDemoAnnouncedButNoToolCalls();
  await testRetryFailsAgainAddsNotice();
  await testNoRetryWhenToolCallsPlayImmediately();
  await testNoRetryWithoutAnnouncement();
  await testCorrectsAnnouncedChordMismatchOnRetry();
  await testChordMismatchFallbackOnNetworkFailure();
  await testDemoRetryThenChordFallbackNoThirdCall();
  await testCorrectAnnouncedChordNotCorrected();
  await testNoChordCorrectionWhenNoMetadata();
  await testRetry31KeepsOriginalTextEvenIfRetryHasDifferentText();
  await testCorrectsAnnouncedDegreeMismatchOnRetry();
  await testDegreeMismatchFallbackOnNetworkFailure();
  await testDegreeRetryAfterChordRetryNoThirdCallButNoDoubleFallback();
  await testCorrectDegreeNotCorrected();
  await testVoicingDescriptionMismatchRootlessTriggersRetry();
  await testVoicingDescriptionDrop2CoherentNoRetry();
  await testFallbackWithoutToolsOn400();
  await testParsePlayNoteFromText();
  await testExplanationGetsExampleCard();
  await testSessionFindingsInPrompt();
  await testCollapsedKeyboardKeepsExplanation();
  testMetadataOnPlayedNotes();
  testToolParsing();
  testSequenceScheduling();
  testKeyboardCollapsed();
  testNoKeyboardLabels();
  testTutorialPassageTool();
  await testTutorialContextInPrompt();
  testExerciseTool();
  await testExerciseContextInPrompt();
  testMyPlayingTool();
  testMyPlayingRequest();
  await testMyPlayingInSend();
  testWantsToHear();

  console.log(`\n=== Résultat : ${passed}/${passed + failed} tests passés ===`);
  process.exit(failed === 0 ? 0 : 1);
}

runTests().catch((err) => {
  console.error(err);
  process.exit(1);
});