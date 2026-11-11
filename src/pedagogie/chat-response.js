// Lire seulement la réponse publique. Le raisonnement du modèle n'est jamais affiché ni journalisé.
const count = (n) => Number.isFinite(n) && n >= 0 ? n : null;
export function normalizeChatResponse(data) {
  const response = data?.choices?.[0];
  const message = response?.message;
  const raw = message?.content;
  const content = typeof raw === 'string' ? raw : Array.isArray(raw) ? raw
    .filter((p) => ['text', 'output_text'].includes(p?.type) && typeof p.text === 'string').map((p) => p.text).join('\n') : '';
  const toolCalls = Array.isArray(message?.tool_calls) ? message.tool_calls : [];
  return {
    choice: { role: 'assistant', content, tool_calls: toolCalls },
    diagnostics: {
      hasMessage: Boolean(message),
      finishReason: ['stop', 'length', 'tool_calls', 'content_filter', 'function_call'].includes(response?.finish_reason) ? response.finish_reason : null,
      contentLength: content.trim().length,
      tools: toolCalls.map((t) => /^[a-z][a-z0-9_]{0,63}$/.test(t?.function?.name) ? t.function.name : 'unknown'),
      outputTokens: count(data?.usage?.completion_tokens),
      reasoningTokens: count(data?.usage?.completion_tokens_details?.reasoning_tokens),
    },
  };
}

export function hasCompletionOutput(choice) {
  // Une réponse qui ne fait que demander l'harmonisation du jeu n'est pas vide : l'application la réalise.
  return Boolean(choice?.content?.trim()) || (choice?.tool_calls || []).some((c) => c?.function?.name?.startsWith('play_') || ['apply_tutorial_passage', 'harmonize_my_playing'].includes(c?.function?.name));
}

export function completionFailure(result, stage) {
  const diagnostics = result?.diagnostics || {};
  console.warn('[CopilotResponse]', { stage, ...diagnostics });
  return { ok: false, error: diagnostics.finishReason === 'length' ? 'AI_OUTPUT_LIMIT' : 'AI_EMPTY_RESPONSE', diagnostics };
}
