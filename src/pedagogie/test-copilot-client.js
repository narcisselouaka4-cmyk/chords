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
const { sendCopilotMessage, executeToolCalls } = await import('./copilot-client.js');

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
  check('Une séquence de 3 notes est programmée', result.played.length === 3);
  check('Les notes sont retournées dans l\'ordre croissant des startOffsetMs', playedSorted.every((p, i) => p.startOffsetMs === [0, 200, 400][i]));
  check('Les délais setTimeout reflètent les startOffsetMs', scheduled.some((s) => s.delay === 0) && scheduled.some((s) => s.delay === 200) && scheduled.some((s) => s.delay === 400));

  // Exécuter les callbacks dans l'ordre de leurs délais pour simuler le temps.
  for (const { fn } of scheduled.slice().sort((a, b) => a.delay - b.delay)) fn();

  document.dispatchEvent = originalDispatchEvent;
  global.document.dispatchEvent = originalDispatchEvent;
  global.setTimeout = originalSetTimeout;

  check('Les événements copilot-note-on sont dispatchés au démarrage de chaque note', capturedEvents.filter((e) => e.type === 'copilot-note-on').length === 3);
}

function testKeyboardCollapsed() {
  // Simuler un clavier masqué
  document.resetMock();
  document.setPanel(true);

  const result = executeToolCalls([
    { function: { name: 'play_note', arguments: JSON.stringify({ midi: 60 }) } },
  ]);
  check('Une note ne joue pas si le clavier est masqué', result.played.length === 0);
  check('Le flag keyboardCollapsed est renvoyé', result.keyboardCollapsed === true);
}

function testAnnotation() {
  // Simuler un clavier SVG minimal
  document.resetMock();
  document.setPanel(false);
  document.setSvg(200, 150);
  document.setKey(60, 0, 0, 40, 150);
  document.setLayer();

  const result = executeToolCalls([
    { function: { name: 'annotate_keyboard', arguments: JSON.stringify({ notes: [{ midi: 60, label: 'Do' }] }) } },
  ]);
  check('annotate_keyboard est exécuté sur le clavier visible', result.annotated.length === 1);
  check('Le marqueur est posé dans le DOM', document.querySelectorAll('#keyboard-annotation-layer .keyboard-annotation-marker').length === 1);
  check('Le bon data-midi est annoté', result.annotated[0].midi === 60);

  // Nouvelle annotation : l'ancienne est effacée
  document._els['keyboard-annotation-layer'] = {
    innerHTML: '<marker>old</marker>',
    appendChild(child) {
      this.innerHTML = child._html;
      global.document._markers = [child];
    },
  };
  executeToolCalls([
    { function: { name: 'annotate_keyboard', arguments: JSON.stringify({ notes: [{ midi: 60 }] }) } },
  ]);
  const layer = document.getElementById('keyboard-annotation-layer');
  check('L\'annotation précédente est effacée avant la nouvelle', !layer.innerHTML.includes('old'));
  check('La nouvelle annotation est présente', layer.innerHTML.length > 0 && layer.innerHTML.includes('keyboard-annotation'));
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
  check('toolResult vidé par la seconde réponse', res.toolResult.played.length === 0);

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
  check('toolResult vidé par la seconde réponse', res.toolResult.played.length === 0);

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
  await testFallbackWithoutToolsOn400();
  await testParsePlayNoteFromText();
  testMetadataOnPlayedNotes();
  testToolParsing();
  testSequenceScheduling();
  testKeyboardCollapsed();
  testAnnotation();

  console.log(`\n=== Résultat : ${passed}/${passed + failed} tests passés ===`);
  process.exit(failed === 0 ? 0 : 1);
}

runTests().catch((err) => {
  console.error(err);
  process.exit(1);
});