// Tests — adaptateur Anthropic (10/11/2026) : traduction requête/réponse entre le schéma
// OpenAI-compatible utilisé partout dans l'app (chat-response.js, ai-client.js…) et le
// schéma natif Messages API d'Anthropic.
//
// Usage : node src/ai/test-anthropic-adapter.js

import {
  isAnthropicEndpoint, anthropicRequestUrl, anthropicHeaders, toAnthropicBody, fromAnthropicResponse,
} from './anthropic-adapter.js';

let failed = 0;
let passed = 0;
function check(label, ok) {
  if (ok) { passed += 1; console.log(`✅ ${label}`); } else { failed += 1; console.error(`❌ ${label}`); }
}

check('isAnthropicEndpoint reconnaît api.anthropic.com',
  isAnthropicEndpoint('https://api.anthropic.com') && isAnthropicEndpoint('https://api.anthropic.com/v1'));
check('isAnthropicEndpoint ne confond pas un autre hôte', !isAnthropicEndpoint('https://api.groq.com/openai/v1'));
check('isAnthropicEndpoint ne plante pas sur une URL invalide', !isAnthropicEndpoint('pas une url'));

check('anthropicRequestUrl pointe toujours vers /v1/messages, quel que soit le chemin tapé',
  anthropicRequestUrl('https://api.anthropic.com') === 'https://api.anthropic.com/v1/messages'
  && anthropicRequestUrl('https://api.anthropic.com/v1/messages') === 'https://api.anthropic.com/v1/messages'
  && anthropicRequestUrl('https://api.anthropic.com/nimporte/quoi') === 'https://api.anthropic.com/v1/messages');

const headers = anthropicHeaders('sk-ant-test');
check('anthropicHeaders utilise x-api-key et anthropic-version, pas Authorization: Bearer',
  headers['x-api-key'] === 'sk-ant-test' && headers['anthropic-version'] === '2023-06-01' && !('Authorization' in headers));

// ── Traduction de la requête ────────────────────────────────────────────────

{
  const body = toAnthropicBody({
    model: 'claude-haiku-4-5-20251001',
    messages: [
      { role: 'system', content: 'Tu es un assistant.' },
      { role: 'user', content: 'Bonjour' },
      { role: 'assistant', content: 'Salut !' },
      { role: 'user', content: 'Joue un Do.' },
    ],
    max_tokens: 900,
    temperature: 0.3,
  });
  check('Le message système sort des messages et devient `system`', body.system === 'Tu es un assistant.');
  check('Les messages restants gardent user/assistant dans l\'ordre',
    body.messages.length === 3 && body.messages[0].role === 'user' && body.messages[2].content === 'Joue un Do.');
  check('max_tokens est conservé', body.max_tokens === 900);
  check('temperature est omise pour éviter le refus des modèles Claude récents', !('temperature' in body));

  for (const model of ['claude-sonnet-5', 'claude-opus-5', 'claude-haiku-5-5', 'claude-haiku-4-5-20251001']) {
    const request = toAnthropicBody({ model, messages: [{ role: 'user', content: 'OK' }], temperature: 0.3 });
    check(`${model} : modèle conservé, sans temperature`, request.model === model && !('temperature' in request));
  }
  check('Aucun champ `tools` quand la requête n\'en a pas', !('tools' in body));
}

{
  const body = toAnthropicBody({ model: 'claude-haiku-4-5-20251001', messages: [{ role: 'user', content: 'Salut' }] });
  check('max_tokens absent reçoit un repli sûr (requis par Anthropic)', body.max_tokens === 1024);
}

{
  // Forme réellement envoyée par copilot-client.js (PLAY_NOTE_TOOL) et body.tool_choice = 'auto'.
  const body = toAnthropicBody({
    model: 'claude-haiku-4-5-20251001',
    messages: [{ role: 'user', content: 'Joue un Do.' }],
    max_tokens: 500,
    tools: [{
      type: 'function',
      function: {
        name: 'play_note',
        description: 'Joue une note MIDI.',
        parameters: { type: 'object', properties: { midi: { type: 'integer' } }, required: ['midi'] },
      },
    }],
    tool_choice: 'auto',
  });
  check('Un outil OpenAI {type:function,function:{...}} devient {name,description,input_schema}',
    body.tools?.[0]?.name === 'play_note'
    && body.tools[0].description === 'Joue une note MIDI.'
    && body.tools[0].input_schema?.properties?.midi?.type === 'integer');
  check("tool_choice:'auto' devient {type:'auto'}", body.tool_choice?.type === 'auto');
}

{
  const body = toAnthropicBody({
    model: 'x', messages: [{ role: 'user', content: 'x' }], max_tokens: 10,
    tool_choice: { type: 'function', function: { name: 'play_note' } },
  });
  check('Un tool_choice ciblant une fonction précise devient {type:tool,name}',
    body.tool_choice?.type === 'tool' && body.tool_choice.name === 'play_note');
}

// ── Traduction de la réponse ────────────────────────────────────────────────

{
  const data = {
    content: [{ type: 'text', text: 'Voici un Do majeur.' }],
    stop_reason: 'end_turn',
    usage: { input_tokens: 42, output_tokens: 17 },
  };
  const out = fromAnthropicResponse(data);
  check('Un bloc texte devient choices[0].message.content (forme OpenAI)',
    out.choices[0].message.content === 'Voici un Do majeur.' && out.choices[0].message.role === 'assistant');
  check('stop_reason end_turn devient finish_reason stop', out.choices[0].finish_reason === 'stop');
  check('Pas de tool_calls quand aucun bloc tool_use', !('tool_calls' in out.choices[0].message));
  check('usage traduit input_tokens/output_tokens vers prompt_tokens/completion_tokens',
    out.usage.prompt_tokens === 42 && out.usage.completion_tokens === 17);
}

{
  // Forme réellement lue par chat-response.js : message.tool_calls[].function.{name,arguments (JSON string)}.
  const data = {
    content: [
      { type: 'text', text: 'Je joue un Do.' },
      { type: 'tool_use', id: 'toolu_01abc', name: 'play_note', input: { midi: 60, velocity: 0.8 } },
    ],
    stop_reason: 'tool_use',
    usage: { input_tokens: 10, output_tokens: 5 },
  };
  const out = fromAnthropicResponse(data);
  const call = out.choices[0].message.tool_calls?.[0];
  check('Un bloc tool_use devient un tool_call OpenAI {type:function,function:{name,arguments}}',
    call?.type === 'function' && call.function.name === 'play_note');
  check('`input` (objet) devient `arguments` (chaîne JSON), relu correctement',
    JSON.parse(call.function.arguments).midi === 60 && JSON.parse(call.function.arguments).velocity === 0.8);
  check('stop_reason tool_use devient finish_reason tool_calls', out.choices[0].finish_reason === 'tool_calls');
  check('Le texte et l\'appel d\'outil coexistent dans la même réponse',
    out.choices[0].message.content === 'Je joue un Do.' && call);
}

{
  const out = fromAnthropicResponse({ content: [], stop_reason: 'max_tokens', usage: {} });
  check('stop_reason max_tokens devient finish_reason length', out.choices[0].finish_reason === 'length');
  check('Une réponse sans contenu donne un texte vide, pas une exception', out.choices[0].message.content === '');
}

console.log(`\n=== Résultat : ${passed}/${passed + failed} contrôles passés ===`);
process.exitCode = failed > 0 ? 1 : 0;
