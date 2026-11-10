import assert from 'node:assert/strict';

global.window = { AudioContext: class { constructor() { this.state = 'suspended'; } } };
global.document = { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], dispatchEvent: () => true };
global.CustomEvent ||= class { constructor(type) { this.type = type; } };
const store = new Map();
global.localStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
const { sendCopilotMessage } = await import('./copilot-client.js');
let captured;
global.fetch = async (_url, options) => {
  captured = JSON.parse(options.body);
  return { ok: true, status: 200, json: async () => ({ choices: [{ message: { role: 'assistant', content: 'Réponse de contrôle.' } }] }) };
};
const params = { message: 'Comment varier mon accompagnement ?', messages: [{ role: 'user', content: 'Phrase à conserver intégralement.' }], context: { type: 'session', name: 'SESSION_EXACTE', duration: 15, tempo: 90, chords: [{ start: 1, label: 'Cmaj7' }] } };
async function request(baseUrl) {
  store.set('piano-jazz-ai-config', JSON.stringify({ apiKey: 'fake-test', baseUrl, model: 'openai/gpt-oss-20b' }));
  const result = await sendCopilotMessage(params);
  assert.ok(result.ok);
  return captured;
}
const compact = await request('https://api.groq.com/openai/v1');
const full = await request('https://example.test/v1');
const openRouter = await request('https://openrouter.ai/api/v1');
assert.deepEqual(openRouter.messages, compact.messages);
assert.deepEqual(openRouter.tools, compact.tools);
assert.equal(openRouter.max_tokens, 1200);
assert.ok(!('max_completion_tokens' in openRouter));
assert.ok(compact.messages[0].content.length < full.messages[0].content.length / 2);
assert.deepEqual(compact.messages.slice(1), full.messages.slice(1));
assert.deepEqual(compact.tools, full.tools);
assert.equal(compact.max_completion_tokens, 1200);
for (const body of [compact, full]) {
  assert.ok(body.messages[0].content.includes('SESSION_EXACTE'));
  assert.ok(body.messages.some((m) => m.content === 'Phrase à conserver intégralement.'));
  assert.equal(body.messages.at(-1).content, params.message);
}
let calls = 0;
global.fetch = async () => { calls++; return { ok: false, status: 413, text: async () => 'Limit 8000 Requested 11269' }; };
store.set('piano-jazz-ai-config', JSON.stringify({ apiKey: 'fake-test', baseUrl: 'https://api.groq.com/openai/v1', model: 'openai/gpt-oss-20b' }));
const rejected = await sendCopilotMessage(params);
assert.equal(rejected.error, 'AI_REQUEST_TOO_LARGE');
assert.equal(calls, 1);
calls = 0;
store.set('piano-jazz-ai-config', JSON.stringify({ apiKey: 'fake-test', baseUrl: 'https://openrouter.ai/api/v1', model: 'test/model:free' }));
global.fetch = async () => { calls++; return { ok: false, status: 400, text: async () => JSON.stringify({ error: { code: 400, metadata: { error_type: 'context_length_exceeded' } } }) }; };
const contextRejected = await sendCopilotMessage(params);
assert.equal(contextRejected.error, 'AI_REQUEST_TOO_LARGE');
assert.equal(calls, 1);
calls = 0;
global.fetch = async () => { calls++; return { ok: true, status: 200, json: async () => ({ error: { code: 429, message: 'rate limited' } }) }; };
const embeddedError = await sendCopilotMessage(params);
assert.equal(embeddedError.error, 'AI_API_ERROR_429');
assert.equal(calls, 1);
console.log(JSON.stringify({ compactSystemChars: compact.messages[0].content.length, fullSystemChars: full.messages[0].content.length, compactBodyChars: JSON.stringify(compact).length, preserved: 'historique, contexte, question, outils', oversized: 'erreur explicite sans réessai identique' }));
