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

// [Claude] — 2026-11-12 — Les modèles Claude 5 réfléchissent AVANT d'écrire, et cette réflexion
// se prend sur max_tokens. Mesuré avec la clé de Narcisse : Haiku 5.5, plan d'harmonisation,
// 3 080 jetons de sortie consommés, 0 caractère de texte (fin « max_tokens »). Sonnet 5, Sonnet 5.5
// pareil : « le modèle a manqué de place ». Le Copilote répond en direct à un pianiste : on coupe
// la réflexion là où l'API le permet, et ailleurs on la borne et on lui laisse de la place en plus.
// Règles par modèle (documentation API Anthropic, novembre 2026) :
//   Sonnet 5.5 : {type:"disabled"} refusé (400), on envoie {type:"between_tools"} ;
//   Haiku 5.5, Sonnet 5, Opus 5 : {type:"disabled"} accepté (effort high ou moins, le défaut) ;
//   Opus 5.5, Fable, Mythos : réflexion impossible à couper → effort « low » + marge ;
//   Claude 4.x : sans paramètre, pas de réflexion → rien à envoyer.
const THINKING_HEADROOM = 8000;

export function anthropicThinkingPolicy(model) {
  const id = String(model || '').toLowerCase();
  if (/claude-sonnet-5-5\b/.test(id)) return { thinking: { type: 'between_tools' } };
  if (/claude-(?:haiku-5-5|sonnet-5|opus-5)(?![-.]\d)/.test(id)) return { thinking: { type: 'disabled' } };
  if (/claude-(?:opus-5-5|fable|mythos)/.test(id)) return { effort: 'low', headroom: THINKING_HEADROOM };
  // Un modèle Claude plus récent que cette table : sa réflexion est probablement active.
  if (/claude-[a-z]+-(?:[5-9]|\d{2})/.test(id)) return { headroom: THINKING_HEADROOM };
  return {};
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
    // [Claude] — 2026-11-12 — Anthropic exige max_tokens. Le Copilote envoie le plus souvent
    // max_completion_tokens (forme OpenAI) : il était IGNORÉ, et chaque demande tombait sur le repli
    // de 1 024 jetons. Une proposition d'harmonisation (1 300 à 3 500 jetons) était donc toujours
    // coupée : « le modèle a manqué de place », même avec Sonnet ou Haiku (retour de Narcisse, 12/11).
    max_tokens: [body.max_tokens, body.max_completion_tokens].find((n) => Number.isFinite(n) && n > 0) ?? 1024,
    messages: chatMessages,
  };
  if (system) out.system = system;
  // `thinking_control: false` : le fournisseur a refusé le réglage (voir provider-errors.js) ; on
  // renvoie alors la demande telle quelle, avec la seule marge de place.
  const policy = anthropicThinkingPolicy(body.model);
  if (body.thinking_control !== false) {
    if (policy.thinking) out.thinking = policy.thinking;
    if (policy.effort) out.output_config = { effort: policy.effort };
  }
  if (policy.headroom || body.thinking_control === false) out.max_tokens += policy.headroom || THINKING_HEADROOM;
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
  refusal: 'content_filter',
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
