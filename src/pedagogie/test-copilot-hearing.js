// Tests — « je veux entendre » est tenu, quelle que soit la demande (12/11/2026).
// Narcisse : « je vais poser d'autres questions/demandes, ça va encore poser problème ». Cause
// commune mesurée : le modèle promet un exemple sans appeler d'outil. Deux garanties générales :
//   1. une demande d'écoute sans appel d'outil → une relance qui rappelle les outils ;
//   2. sans exemple sous la réponse, aucune phrase n'en annonce un.
// Usage : node src/pedagogie/test-copilot-hearing.js

import assert from 'node:assert/strict';

global.window = { AudioContext: class { constructor() { this.state = 'suspended'; } } };
global.document = { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], dispatchEvent: () => true };
global.CustomEvent ||= class { constructor(type) { this.type = type; } };
const store = new Map();
global.localStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v), removeItem: (k) => store.delete(k) };
store.set('piano-jazz-ai-config', JSON.stringify({ apiKey: 'TEST-ONLY', baseUrl: 'https://example.test/v1', model: 'mock' }));
const { sendCopilotMessage, withoutPhantomExample } = await import('./copilot-client.js');

let passed = 0;
let failed = 0;
async function check(name, fn) {
  try { await fn(); passed += 1; console.log(`✓ ${name}`); } catch (err) { failed += 1; console.error(`✗ ${name}\n  ${err.message}`); }
}
const bodies = [];
let replies = [];
global.fetch = async (_url, init) => {
  bodies.push(JSON.parse(init.body));
  const message = replies.shift() || { content: 'Voilà.' };
  return { ok: true, status: 200, json: async () => ({ choices: [{ message: { role: 'assistant', ...message }, finish_reason: message.tool_calls ? 'tool_calls' : 'stop' }] }) };
};
const call = (name, args) => ({ id: `c${bodies.length}`, type: 'function', function: { name, arguments: JSON.stringify(args) } });
async function ask(message, list, extra = {}) {
  bodies.length = 0; replies = [...list];
  const prev = console.log; console.log = () => {};
  try { return await sendCopilotMessage({ message, messages: [], ...extra }); } finally { console.log = prev; }
}

let r = await ask('Fais-moi entendre une walking bass sur un blues en Fa', [
  { content: 'Une walking bass avance par noires. Écoute l’exemple ci-dessous.' },
  { content: 'Voici.', tool_calls: [call('play_progression', { chords: ['F7', 'Bb7', 'F7', 'C7'], focus: 'full' })] },
]);
await check('Demande d’écoute sans outil : une relance, et l’exemple arrive', () => {
  assert.equal(bodies.length, 2);
  assert.match(bodies[1].messages.at(-1).content, /demandé à ENTENDRE[\s\S]*aucun outil/);
  assert.ok(r.toolResult.example, 'exemple présent');
  assert.match(r.content, /walking bass avance par noires/, 'le texte d’origine reste');
});

r = await ask('Joue-moi quelque chose de sombre', [
  { content: 'Je ne peux pas te le jouer ici.' },
  { content: 'Un accord mineur avec une sixte bémol, sombre et suspendu.', tool_calls: [call('play_voicing', { chordSymbol: 'Cm6' })] },
]);
await check('Texte d’origine « je ne peux pas » démenti par l’exemple : c’est le texte de la relance qui reste', () => {
  assert.ok(r.toolResult.example);
  assert.ok(!/ne peux pas/.test(r.content), r.content);
});

r = await ask('Fais-moi entendre ce que donnerait une réharmonisation en Coltrane changes', [
  { content: 'Les Coltrane changes divisent l’octave en trois. Écoute l’exemple ci-dessous : je te joue la grille.' },
  { content: 'Je vais te jouer l’exemple.' },
]);
await check('Toujours aucun outil après la relance : aucune annonce d’exemple, et ce qui manque est dit', () => {
  assert.ok(!r.toolResult.example);
  assert.ok(!/ci-dessous|je te joue|Je vais te jouer/.test(r.content), r.content);
  assert.match(r.content, /Je n’ai pas pu préparer d’exemple/);
  assert.match(r.content, /divisent l’octave en trois/, 'l’explication reste');
});

r = await ask('C’est quoi le mode dorien ?', [{ content: 'Le dorien est une gamme mineure à sixte majeure.' }]);
await check('Question d’explication : aucune relance, une seule requête', () => {
  assert.equal(bodies.length, 1);
  assert.match(r.content, /sixte majeure/);
});

r = await ask('Joue-moi un Cmaj7', [{ content: 'Cmaj7 : Do Mi Sol Si.' }]);
await check('Accord écrit en toutes lettres : joué par l’application, sans relance du modèle', () => {
  assert.equal(bodies.length, 1);
  assert.ok(r.toolResult.example);
});

global.fetch = async (_url, init) => { bodies.push(JSON.parse(init.body)); return { ok: false, status: 429, headers: { get: () => '20' }, text: async () => JSON.stringify({ error: { message: 'Rate limit reached for model on tokens per minute (TPM)' } }) }; };
r = await ask('enchaine le lick 1 et le lick 2', []);
await check('Quota du modèle atteint : des éléments de la bibliothèque nommés sont joués quand même, et c’est dit', () => {
  assert.ok(r.ok);
  assert.equal(r.toolResult.example?.kind, 'library');
  assert.match(r.content, /Voici, enchaînés : Lick 1[\s\S]*Sans commentaire cette fois : le service d’IA est saturé/);
});
r = await ask('c’est quoi le mode dorien ?', []);
await check('… mais une question qui demande le modèle reste un échec clair', () => {
  assert.equal(r.ok, false); assert.equal(r.error, 'AI_API_ERROR_429');
});

await check('Annonce d’exemple retirée seulement quand il n’y a rien à écouter', () => {
  assert.equal(withoutPhantomExample('Écoute l’exemple ci-dessous : Cmaj7.', { played: true }), 'Écoute l’exemple ci-dessous : Cmaj7.');
  assert.equal(withoutPhantomExample('Le dorien a une sixte majeure.'), 'Le dorien a une sixte majeure.');
  assert.equal(withoutPhantomExample('Je te joue la grille. Elle tourne sur Fa.', { heldBack: true }), 'Elle tourne sur Fa.');
});

console.log(`\n=== Résultat : ${passed}/${passed + failed} tests passés ===`);
process.exit(failed ? 1 : 0);
