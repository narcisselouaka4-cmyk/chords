import assert from 'node:assert/strict';
import { ANTHROPIC_MODELS, modelsForProvider, providerIdentity } from './provider-models.js';
import { PRESETS, listSavedKeys } from './openai-config.js';

const profiles = PRESETS.map((p, i) => ({ baseUrl: p.baseUrl, models: [`saved-${i}`] }));
profiles.push({ baseUrl: 'https://ollama.com/v1', models: ['beam', 'nemotron-3-ultra', 'gpt-oss:120b'] });
profiles.push({ baseUrl: 'https://custom.test/team-a', models: ['custom-a'] });
profiles.push({ baseUrl: 'https://custom.test/team-b', models: ['custom-b'] });
for (const [i, preset] of PRESETS.entries()) {
  const models = modelsForProvider(`${preset.baseUrl}/`, PRESETS, profiles);
  assert.deepEqual(new Set(models), new Set([...preset.models, `saved-${i}`]));
  assert.equal(models.length, new Set(models).size);
}
assert.deepEqual(modelsForProvider('https://ollama.com/v1/', PRESETS, profiles), ['beam', 'nemotron-3-ultra', 'gpt-oss:120b']);
assert.deepEqual(modelsForProvider('https://custom.test/team-a', PRESETS, profiles), ['custom-a']);
assert.deepEqual(modelsForProvider('', PRESETS, profiles), []);
assert.deepEqual(modelsForProvider('invalide', PRESETS, profiles), []);
assert.deepEqual(modelsForProvider('https://unknown.test/v1', PRESETS, profiles), []);
assert.equal(providerIdentity('https://api.anthropic.com/v1/messages'), 'https://api.anthropic.com');
assert.deepEqual(modelsForProvider('https://api.anthropic.com/v1/messages', PRESETS, profiles), modelsForProvider('https://api.anthropic.com', PRESETS, profiles));
assert.equal(ANTHROPIC_MODELS.length, 15);
assert.equal(ANTHROPIC_MODELS.filter((m) => m.id.startsWith('claude-fable-')).length, 3);
for (let i = 1; i < ANTHROPIC_MODELS.length; i++) {
  assert.ok(ANTHROPIC_MODELS[i].input >= ANTHROPIC_MODELS[i - 1].input);
  assert.ok(ANTHROPIC_MODELS[i].output >= ANTHROPIC_MODELS[i - 1].output);
}
console.log('Catalogue : 15 modèles Claude dont 3 Fable, prix entrée/sortie croissants ; isolation des 5 préréglages, Ollama, adresses personnalisées et anciennes adresses Anthropic vérifiée.');

const legacyProfiles = [
  { baseUrl: 'https://openrouter.ai/api/v1', models: ['google/gemini-flash-1.5:free', 'meta-llama/llama-3.1-8b-instruct:free', 'user/custom-model'] },
  { baseUrl: 'https://api.groq.com/openai/v1', models: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'openai/gpt-oss-20b'] },
  { baseUrl: 'https://ollama.com/v1', models: ['llama-3.3-70b-versatile'] },
];
const original = JSON.stringify(legacyProfiles);
assert.ok(!modelsForProvider(legacyProfiles[0].baseUrl, PRESETS, legacyProfiles).includes('google/gemini-flash-1.5:free'));
assert.ok(!modelsForProvider(legacyProfiles[1].baseUrl, PRESETS, legacyProfiles).includes('llama-3.3-70b-versatile'));
assert.ok(modelsForProvider(legacyProfiles[0].baseUrl, PRESETS, legacyProfiles).includes('user/custom-model'));
assert.deepEqual(modelsForProvider(legacyProfiles[2].baseUrl, PRESETS, legacyProfiles), ['llama-3.3-70b-versatile']);
assert.equal(JSON.stringify(legacyProfiles), original);
console.log('Anciennes références masquées aussi dans les historiques ; données sources et autres fournisseurs intacts.');

// Vérifie le vrai chemin des clés enregistrées, sans aucun profil Electron.
const raw = JSON.stringify(legacyProfiles.map((p, i) => ({ ...p, id: `fixture-${i}`, apiKey: 'fixture-key' })));
global.window = {};
global.localStorage = { getItem: (key) => key === 'piano-jazz-ai-keys' ? raw : null };
const saved = listSavedKeys();
assert.ok(!saved[0].models.includes('google/gemini-flash-1.5:free'));
assert.ok(!saved[1].models.includes('llama-3.3-70b-versatile'));
assert.ok(saved[2].models.includes('llama-3.3-70b-versatile'));
assert.equal(global.localStorage.getItem('piano-jazz-ai-keys'), raw);
