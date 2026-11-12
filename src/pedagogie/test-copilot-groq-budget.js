import assert from 'node:assert/strict';
import { groqBudgetRetry } from '../ai/groq-token-budget.js';

global.window = { AudioContext: class { constructor() { this.state = 'suspended'; } } };
global.document = { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], dispatchEvent: () => true };
global.CustomEvent ||= class { constructor(type) { this.type = type; } };
const store = new Map();
global.localStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
const { sendCopilotMessage, setCopilotTimeout } = await import('./copilot-client.js');
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
// 12/11 : 1 200 pour la réponse + 4 000 pour le raisonnement, qui compte dans max_tokens chez OpenRouter.
assert.equal(openRouter.max_tokens, 5200);
assert.deepEqual(openRouter.reasoning, { effort: 'low' });
assert.ok(!('reasoning' in compact) && compact.reasoning_effort === 'low');
assert.ok(!('max_completion_tokens' in openRouter));
assert.ok(compact.messages[0].content.length < full.messages[0].content.length / 2);
assert.deepEqual(compact.messages.slice(1), full.messages.slice(1));
// 12/11 : la bibliothèque (catalogue + deux outils) seulement quand la demande la touche, chez Groq.
const LIB = ['consult_library', 'combine_library'];
assert.deepEqual(compact.tools, full.tools.filter((t) => !LIB.includes(t.function.name)));
assert.ok(LIB.every((n) => full.tools.some((t) => t.function.name === n)) && !compact.tools.some((t) => LIB.includes(t.function.name)));
assert.ok(full.messages[0].content.includes('latin-ellen-lick-3') && !compact.messages[0].content.includes('latin-ellen-lick-3'));
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
for (const [status, text, error] of [
  [404, 'model_not_found', 'AI_MODEL_UNAVAILABLE'],
  [429, '{"error":{"metadata":{"limit_source":"upstream_provider_shared_pool"}}}', 'AI_PROVIDER_BUSY'],
  [402, 'Add usage credits or subscribe', 'AI_API_ERROR_402'],
]) {
  calls = 0;
  global.fetch = async () => { calls++; return { ok: false, status, text: async () => text }; };
  const result = await sendCopilotMessage(params);
  assert.equal(result.error, error);
  assert.equal(calls, 1);
}
console.log(JSON.stringify({ compactSystemChars: compact.messages[0].content.length, fullSystemChars: full.messages[0].content.length, compactBodyChars: JSON.stringify(compact).length, preserved: 'historique, contexte, question, outils', oversized: 'erreur explicite sans réessai identique' }));

const quotaError = JSON.stringify({ error: { message: 'Request too large on tokens per minute (TPM): Limit 8000, Requested 10503, please reduce your message size.' } });
const originalBody = { model: 'openai/gpt-oss-120b', messages: [{ role: 'user', content: 'Notes exactes' }], max_completion_tokens: 8192 };
const reduced = groqBudgetRetry('https://api.groq.com/openai/v1', originalBody, 413, quotaError);
assert.equal(reduced.max_completion_tokens, 5561);
assert.equal(reduced.messages, originalBody.messages);
assert.equal(originalBody.max_completion_tokens, 8192);
assert.equal(groqBudgetRetry('https://openrouter.ai/api/v1', originalBody, 413, quotaError), null);
assert.equal(groqBudgetRetry('https://api.groq.com/openai/v1', originalBody, 429, quotaError), null);
assert.equal(groqBudgetRetry('https://api.groq.com/openai/v1', originalBody, 413, 'Other error'), null);
assert.equal(groqBudgetRetry('https://api.groq.com/openai/v1', { ...originalBody, max_completion_tokens: 1200 }, 413, quotaError), null);
const legacyReduced = groqBudgetRetry('https://api.groq.com/openai/v1', { max_tokens: 8192 }, 413, quotaError);
assert.equal(legacyReduced.max_tokens, 5561);

const take = { name: 'Prise synthétique', duration: 6, events: [[48,55,60,64],[50,57,60,65],[52,59,62,67]].flatMap((ns,i) => ns.flatMap(note => [
  { type: 'note_on', note, time: i*2, velocity: .7, channel: 0 },
  { type: 'note_off', note, time: i*2+1.8, velocity: 0, channel: 0 },
])).sort((a,b) => a.time-b.time) };
const sourceBefore = JSON.stringify(take);
const plan = { variants: [{ title: 'Accords liés', segments: [[0,'maj7',[48,55,59,64]],[2,'m7',[50,57,60,65]],[4,'m7',[52,59,62,67]]].map(([rootPc,quality,notes],anchor) => ({ anchor, rootPc, quality, notes, reason: 'Cette couleur soutient la mélodie.' })) }] };
store.set('piano-jazz-ai-config', JSON.stringify({ apiKey: 'fake-test', baseUrl: 'https://api.groq.com/openai/v1', model: 'openai/gpt-oss-120b' }));
const harmonyParams = { message: 'Enrichis mes accords.', context: { playing: { passage: take } } };
const harmonyQuotaError = JSON.stringify({ error: { message: 'Request too large on tokens per minute (TPM): Limit 8000, Requested 8900, please reduce your message size.' } });
let requests = [];
let finalStatus = 200;
let finishReason = 'stop';
global.fetch = async (_url, options) => {
  requests.push(JSON.parse(options.body));
  // 12/11 : la réserve est proportionnée à la prise (2 000 jetons ici) ; le refus TPM simulé chiffre donc une demande plus petite.
  if (requests.length === 1 || finalStatus === 413) return { ok: false, status: 413, text: async () => harmonyQuotaError };
  return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: JSON.stringify(plan) }, finish_reason: finishReason }] }) };
};
const recovered = await sendCopilotMessage(harmonyParams);
assert.ok(recovered.ok && recovered.toolResult.variants?.length);
assert.equal(requests.length, 2);
assert.equal(requests[0].max_completion_tokens, 3000); // réserve proportionnée (3 appuis), et non 8 192
assert.equal(requests[0].reasoning_effort, 'low'); // gpt-oss chez Groq : raisonnement bref pour un plan JSON
assert.equal(requests[1].max_completion_tokens, 1972); // 3 000 − (8 900 − 8 000) − 128
assert.deepEqual(requests[0].messages, requests[1].messages);
assert.equal(JSON.stringify(take), sourceBefore);
assert.equal(recovered.toolResult.generation.engine, 'model');
requests = []; finalStatus = 413;
const stillTooLarge = await sendCopilotMessage(harmonyParams);
assert.equal(requests.length, 2);
assert.equal(stillTooLarge.error, 'AI_REQUEST_TOO_LARGE');
assert.ok(!stillTooLarge.toolResult.variants?.length);
requests = []; finalStatus = 200; finishReason = 'length';
const truncated = await sendCopilotMessage(harmonyParams);
// [Claude] — 2026-11-12 — Contrat changé volontairement : un plan coupé reçoit UNE nouvelle demande
// plus courte (une version) avant l'échec ; toujours borné, jamais de plan partiel joué.
assert.equal(requests.length, 3);
assert.match(requests[2].messages.at(-1).content, /UNE seule version/);
assert.equal(truncated.error, 'AI_OUTPUT_LIMIT');
assert.ok(!truncated.toolResult.variants?.length);
// [Claude] — 2026-11-11 — 400 ms et non 25 : sur une machine chargée, 25 ms s'écoulaient avant même
// le premier envoi et le test échouait une fois sur deux, sans rapport avec le code testé.
requests = []; setCopilotTimeout(400);
global.fetch = async (_url, options) => {
  requests.push(JSON.parse(options.body));
  if (requests.length === 1) return { ok: false, status: 413, text: async () => harmonyQuotaError };
  return new Promise(() => {});
};
const timedOut = await sendCopilotMessage(harmonyParams);
assert.equal(requests.length, 2);
assert.equal(timedOut.error, 'AI_TIMEOUT');
setCopilotTimeout(90000);
console.log('Groq 10503/8000 : réserve 8192 → 5561, prise identique, plan validé ; deux appels maximum, aucune proposition tronquée ni repli local.');
