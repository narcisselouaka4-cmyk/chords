import assert from 'node:assert/strict';
import { ANTHROPIC_MODELS, modelsForProvider, providerIdentity } from './provider-models.js';
import { PRESETS } from './openai-config.js';

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
