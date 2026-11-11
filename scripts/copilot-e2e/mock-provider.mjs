// [Claude] — 2026-11-11 — Faux fournisseur d'IA local, pour les essais de bout en bout du Copilote.
//
// Un petit serveur HTTP sans dépendance, lié à 127.0.0.1, qui parle le format OpenAI
// (`POST /v1/chat/completions`, `GET /v1/models`). Il ne contacte personne : aucune vraie clé,
// aucun vrai compte. Les réponses sont programmées par scénario (texte, appels d'outils, erreurs
// avec leurs en-têtes, réponse lente, connexion coupée, erreur dans un HTTP 200, sortie tronquée),
// et chaque requête reçue est gardée pour vérifier ce que l'application envoie vraiment.
//
// Usage dans un test :  const mock = await startMockProvider(); mock.enqueue({ text: 'Bonjour' });
// Usage en ligne de commande :  node scripts/copilot-e2e/mock-provider.mjs [port]
//   POST /__scenario  {"queue":[{...},{...}]}   programme les prochaines réponses
//   GET  /__requests                             relit les requêtes reçues (autorisation masquée)

import http from 'node:http';
import { pathToFileURL } from 'node:url';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Corps d'une complétion au format OpenAI. */
export function completionBody({ text = '', toolCalls = [], finishReason = null, model = 'mock-model', usage = null, reasoningTokens = 0 } = {}) {
  const message = { role: 'assistant', content: text };
  if (toolCalls.length) {
    message.tool_calls = toolCalls.map((call, index) => ({
      id: `call_${index + 1}`,
      type: 'function',
      function: { name: call.name, arguments: typeof call.arguments === 'string' ? call.arguments : JSON.stringify(call.arguments || {}) },
    }));
  }
  return {
    id: `chatcmpl-mock-${Date.now()}`,
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [{ index: 0, message, finish_reason: finishReason || (toolCalls.length ? 'tool_calls' : 'stop') }],
    usage: usage || { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20, ...(reasoningTokens ? { completion_tokens_details: { reasoning_tokens: reasoningTokens } } : {}) },
  };
}

/** Réponses d'erreur réalistes, par catégorie (statut, corps, en-têtes). */
export const ERROR_SCENARIOS = {
  auth401: { status: 401, body: { error: { message: 'Invalid API Key', type: 'invalid_request_error', code: 'invalid_api_key' } } },
  credit402: { status: 402, body: { error: { message: 'Insufficient credits. Add credits to continue.', code: 402 } } },
  forbidden403: { status: 403, body: { error: { message: 'The model is not available for your account or region.', type: 'permission_error' } } },
  notFound404: { status: 404, body: { error: { message: 'The model `ancien-modele` does not exist or you do not have access to it.', type: 'invalid_request_error', code: 'model_not_found' } } },
  badParam400: { status: 400, body: { error: { message: "Unsupported parameter: 'temperature' is not supported with this model.", type: 'invalid_request_error', param: 'temperature' } } },
  context400: { status: 400, body: { error: { message: "This model's maximum context length is 8192 tokens. However, your messages resulted in 11300 tokens.", type: 'invalid_request_error', code: 'context_length_exceeded' } } },
  tools400: { status: 400, body: { error: { message: 'tools is not supported by this model', type: 'invalid_request_error', param: 'tools' } } },
  tooLarge413: { status: 413, body: { error: { message: 'Request too large for model `mock-model` in organization `org_x` service tier `on_demand` on tokens per minute (TPM): Limit 8000, Requested 10503, please reduce your message size and try again.', type: 'tokens', code: 'rate_limit_exceeded' } } },
  quota429: { status: 429, headers: { 'retry-after': '12' }, body: { error: { message: 'Rate limit reached for requests per minute. Please try again in 12s.', type: 'requests', code: 'rate_limit_exceeded' } } },
  busy429: { status: 429, body: { error: { message: 'Provider returned error', code: 429, metadata: { raw: 'mock-model:free is temporarily rate-limited upstream. Please retry shortly.', provider_name: 'MockHost' } } } },
  server500: { status: 500, body: { error: { message: 'Internal server error', type: 'server_error' } } },
  overloaded503: { status: 503, body: { error: { message: 'The server is overloaded. Please try again later.', type: 'server_error' } } },
  embedded200: { status: 200, body: { error: { message: 'Provider returned error', code: 502, metadata: { raw: 'upstream connect error' } } } },
  empty200: { status: 200, body: completionBody({ text: '' }) },
  truncated200: { status: 200, body: completionBody({ text: 'Le II–V–I est une suite de trois acc', finishReason: 'length' }) },
  invalidJson200: { status: 200, raw: '{"choices":[{"message":{"role":"assistant","content":"coupé' },
};

function lastUserText(body) {
  const messages = Array.isArray(body?.messages) ? body.messages : [];
  const last = [...messages].reverse().find((m) => m.role === 'user');
  const content = last?.content;
  return typeof content === 'string' ? content : Array.isArray(content) ? content.map((part) => part?.text || '').join(' ') : '';
}

/**
 * Démarre le faux fournisseur.
 * @param {{port?: number}} [options] port 0 : un port libre
 * @returns {Promise<{url: string, port: number, requests: object[], enqueue: Function, reset: Function, close: Function}>}
 */
export async function startMockProvider({ port = 0 } = {}) {
  const queue = [];
  const requests = [];
  let answered = 0;

  const readBody = (req) => new Promise((resolve) => {
    let raw = '';
    req.on('data', (chunk) => { raw += chunk; });
    req.on('end', () => resolve(raw));
    req.on('error', () => resolve(raw));
  });
  const sendJson = (res, status, body, headers = {}) => {
    res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', ...headers });
    res.end(typeof body === 'string' ? body : JSON.stringify(body));
  };

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    const raw = await readBody(req);
    let body = null;
    try { body = raw ? JSON.parse(raw) : null; } catch (_) { body = null; }

    if (url.pathname === '/__scenario' && req.method === 'POST') {
      if (body?.reset) { queue.length = 0; requests.length = 0; answered = 0; }
      for (const item of body?.queue || []) queue.push(typeof item === 'string' ? ERROR_SCENARIOS[item] || { text: item } : item);
      return sendJson(res, 200, { queued: queue.length });
    }
    if (url.pathname === '/__requests') return sendJson(res, 200, { requests });
    if (url.pathname.endsWith('/models') && req.method === 'GET') {
      return sendJson(res, 200, { object: 'list', data: [{ id: 'mock-model', object: 'model' }, { id: 'mock-model-2', object: 'model' }] });
    }
    if (!url.pathname.endsWith('/chat/completions') || req.method !== 'POST') return sendJson(res, 404, { error: { message: `Route inconnue : ${url.pathname}` } });

    const headers = { ...req.headers };
    // La clé n'est jamais gardée : seulement le fait qu'un en-tête d'autorisation était présent.
    if (headers.authorization) headers.authorization = '[masqué]';
    if (headers['x-api-key']) headers['x-api-key'] = '[masqué]';
    const record = { at: Date.now(), path: url.pathname, headers, body };
    requests.push(record);

    const next = queue.shift() || null;
    const spec = typeof next === 'function' ? await next(body, record) : next;
    if (spec?.delayMs) await sleep(spec.delayMs);
    if (spec?.drop) { req.socket.destroy(); return; }
    answered += 1;
    if (spec?.raw != null) {
      res.writeHead(spec.status || 200, { 'content-type': 'application/json; charset=utf-8', ...(spec.headers || {}) });
      res.end(spec.raw);
      return;
    }
    if (spec?.body) return sendJson(res, spec.status || 200, spec.body, spec.headers || {});
    const text = spec?.text != null ? spec.text : `Réponse simulée n°${answered} à : ${lastUserText(body).slice(0, 80)}`;
    return sendJson(res, spec?.status || 200, completionBody({ text, toolCalls: spec?.toolCalls || [], finishReason: spec?.finishReason || null, model: body?.model || 'mock-model', reasoningTokens: spec?.reasoningTokens || 0 }), spec?.headers || {});
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', resolve);
  });
  const actualPort = server.address().port;
  return {
    port: actualPort,
    url: `http://127.0.0.1:${actualPort}/v1`,
    requests,
    /** Programme la prochaine réponse : objet, nom d'un scénario d'erreur, ou fonction (body) => objet. */
    enqueue(...items) { for (const item of items) queue.push(typeof item === 'string' ? ERROR_SCENARIOS[item] || { text: item } : item); },
    pending: () => queue.length,
    reset() { queue.length = 0; requests.length = 0; answered = 0; },
    close: () => new Promise((resolve) => { server.closeAllConnections?.(); server.close(() => resolve()); }),
  };
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const mock = await startMockProvider({ port: Number(process.argv[2]) || 0 });
  console.log(`Faux fournisseur prêt : ${mock.url} (clé : n'importe quelle valeur de test)`);
}
