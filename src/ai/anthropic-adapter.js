// [Claude] — 2026-11-10 — Adaptateur pour l'API native Anthropic (Messages API), dont le schéma
// de requête/réponse diffère de l'API OpenAI-compatible (Groq, OpenRouter, Google AI Studio,
// OpenAI) utilisée partout ailleurs dans l'app : en-têtes différents (x-api-key +
// anthropic-version, pas Authorization: Bearer), adresse différente (/v1/messages, pas
// /chat/completions), système à part des messages, et outils/tool_choice dans un schéma différent.
// Traduit la requête et la réponse pour que callChatCompletions et le canal IPC Electron restent
// transparents pour tous les appelants existants (chat-response.js, ai-client.js…), qui
// continuent de lire une réponse au format OpenAI (`choices[0].message`).

const ANTHROPIC_VERSION = '2023-06-01';

export function isAnthropicEndpoint(baseUrl) {
  try {
    return new URL(baseUrl).hostname === 'api.anthropic.com';
  } catch (_) {
    return false;
  }
}

export function anthropicRequestUrl(baseUrl) {
  return `${new URL(baseUrl).origin}/v1/messages`;
}

export function anthropicHeaders(apiKey) {
  return {
    'Content-Type': 'application/json',
    'x-api-key': apiKey,
    'anthropic-version': ANTHROPIC_VERSION,
  };
}

function toAnthropicToolChoice(choice) {
  if (!choice) return undefined;
  if (choice === 'auto') return { type: 'auto' };
  if (choice === 'none') return { type: 'none' };
  if (choice === 'required') return { type: 'any' };
  if (choice?.type === 'function' && choice.function?.name) {
    return { type: 'tool', name: choice.function.name };
  }
  return undefined;
}

/** Traduit un corps de requête façon OpenAI (/chat/completions) vers l'API Messages d'Anthropic. */
export function toAnthropicBody(body) {
  const messages = Array.isArray(body?.messages) ? body.messages : [];
  const system = messages
    .filter((m) => m.role === 'system' && typeof m.content === 'string')
    .map((m) => m.content)
    .join('\n\n');
  const chatMessages = messages
    .filter((m) => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.length > 0)
    .map((m) => ({ role: m.role, content: m.content }));

  const out = {
    model: body.model,
    // Anthropic exige max_tokens ; tous les appelants internes le fournissent déjà, le
    // repli ne sert qu'à ne jamais envoyer une requête invalide.
    max_tokens: Number.isFinite(body.max_tokens) && body.max_tokens > 0 ? body.max_tokens : 1024,
    messages: chatMessages,
  };
  if (system) out.system = system;
  // Les modèles Claude récents refusent temperature (HTTP 400). On laisse
  // Anthropic appliquer son réglage par défaut, y compris pour les anciens
  // modèles ; les requêtes aux autres fournisseurs ne passent pas ici.
  if (Array.isArray(body.tools) && body.tools.length) {
    out.tools = body.tools
      .filter((t) => t?.type === 'function' && t.function?.name)
      .map((t) => ({
        name: t.function.name,
        description: t.function.description || '',
        input_schema: t.function.parameters || { type: 'object', properties: {} },
      }));
  }
  const toolChoice = toAnthropicToolChoice(body.tool_choice);
  if (toolChoice) out.tool_choice = toolChoice;
  return out;
}

const STOP_REASON_TO_FINISH = {
  end_turn: 'stop',
  stop_sequence: 'stop',
  max_tokens: 'length',
  tool_use: 'tool_calls',
};

/**
 * Traduit une réponse Messages API d'Anthropic vers la forme OpenAI (`choices[0].message`)
 * que tout le reste de l'app sait déjà lire.
 */
export function fromAnthropicResponse(data) {
  const blocks = Array.isArray(data?.content) ? data.content : [];
  const text = blocks
    .filter((b) => b?.type === 'text' && typeof b.text === 'string')
    .map((b) => b.text)
    .join('\n');
  const toolCalls = blocks
    .filter((b) => b?.type === 'tool_use' && typeof b.name === 'string')
    .map((b) => ({
      id: b.id || `toolu_${Math.random().toString(36).slice(2)}`,
      type: 'function',
      function: { name: b.name, arguments: JSON.stringify(b.input || {}) },
    }));

  return {
    choices: [{
      message: {
        role: 'assistant',
        content: text,
        ...(toolCalls.length ? { tool_calls: toolCalls } : {}),
      },
      finish_reason: STOP_REASON_TO_FINISH[data?.stop_reason] || null,
    }],
    usage: {
      prompt_tokens: data?.usage?.input_tokens ?? null,
      completion_tokens: data?.usage?.output_tokens ?? null,
    },
  };
}
