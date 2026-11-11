// [Claude] — 2026-11-11 — Une seule lecture des refus des fournisseurs d'IA.
//
// Avant, chaque statut était interprété à l'endroit de l'appel : un 403 passait pour une clé
// refusée, un 400 pour une incompatibilité des outils, une saturation de l'hébergeur pour un
// quota personnel. Ce module range chaque refus dans une catégorie, et dit ce que le pianiste
// peut faire : attendre, changer de modèle, vérifier son compte ou sa clé, raccourcir la demande.
// Fonctions pures : aucun appel réseau, aucune clé manipulée.

/** Ce que le pianiste peut faire. */
export const USER_ACTIONS = ['attendre', 'changer-de-modele', 'verifier-compte', 'verifier-cle', 'raccourcir-ou-reformuler', 'reessayer'];

const ACTION_BY_CODE = {
  AI_API_KEY_INVALID: 'verifier-cle',
  AI_API_ERROR_402: 'verifier-compte',
  AI_ACCESS_DENIED: 'changer-de-modele',
  AI_CONTENT_BLOCKED: 'raccourcir-ou-reformuler',
  AI_MODEL_UNAVAILABLE: 'changer-de-modele',
  AI_REQUEST_TOO_LARGE: 'raccourcir-ou-reformuler',
  AI_BAD_REQUEST: 'changer-de-modele',
  AI_TOOLS_UNSUPPORTED: 'changer-de-modele',
  AI_API_ERROR_429: 'attendre',
  AI_PROVIDER_BUSY: 'attendre',
  AI_NETWORK_ERROR: 'reessayer',
  AI_TIMEOUT: 'reessayer',
  AI_CANCELLED: 'reessayer',
  AI_EMPTY_RESPONSE: 'reessayer',
  AI_OUTPUT_LIMIT: 'raccourcir-ou-reformuler',
  AI_INVALID_RESPONSE: 'reessayer',
};

/** L'action conseillée pour un code d'erreur (les 5xx : attendre). */
export function userActionFor(code) {
  if (ACTION_BY_CODE[code]) return ACTION_BY_CODE[code];
  if (/^AI_API_ERROR_5\d\d$/.test(String(code))) return 'attendre';
  return 'reessayer';
}

function parseBody(bodyText) {
  const text = String(bodyText || '');
  let parsed = null;
  try { parsed = JSON.parse(text); } catch (_) { parsed = null; }
  const error = parsed?.error && typeof parsed.error === 'object' ? parsed.error : parsed?.error ? { message: String(parsed.error) } : parsed;
  const message = [error?.message, error?.metadata?.raw, error?.metadata?.error_type, error?.metadata?.limit_source, error?.type, error?.code, error?.status, error?.param]
    .filter((part) => part != null).map(String).join(' · ');
  return { text, error: error || null, haystack: `${message} ${text}`.toLowerCase() };
}

/** Durée d'attente annoncée par le fournisseur, en secondes (en-tête Retry-After ou texte). */
export function retryDelaySeconds(retryAfter, bodyText = '') {
  const header = String(retryAfter ?? '').trim();
  if (/^\d+(\.\d+)?$/.test(header)) return Math.min(3600, Math.ceil(Number(header)));
  if (header) {
    const at = Date.parse(header);
    if (Number.isFinite(at)) return Math.max(0, Math.min(3600, Math.ceil((at - Date.now()) / 1000)));
  }
  const text = String(bodyText || '');
  const spoken = /try again in\s+(?:(\d+)\s*h)?\s*(?:(\d+)\s*m(?!s))?\s*(?:(\d+(?:\.\d+)?)\s*s)?/i.exec(text);
  if (spoken && (spoken[1] || spoken[2] || spoken[3])) {
    return Math.min(3600, Math.ceil((Number(spoken[1]) || 0) * 3600 + (Number(spoken[2]) || 0) * 60 + (Number(spoken[3]) || 0)));
  }
  const millis = /try again in\s+(\d+(?:\.\d+)?)\s*ms/i.exec(text);
  if (millis) return 1;
  return null;
}

const PARAMETERS = ['temperature', 'max_completion_tokens', 'max_tokens', 'tool_choice', 'response_format', 'top_p'];

/** Le paramètre que le fournisseur dit refuser, s'il le nomme. */
export function rejectedParameter(bodyText) {
  const { error, haystack } = parseBody(bodyText);
  // [Claude] — 2026-11-11 — Revue indépendante : « invalid » figure dans presque toutes les erreurs
  // OpenAI (invalid_request_error). Seul un paramètre REFUSÉ en tant que tel se retire ; une valeur
  // trop grande ou invalide (« max_tokens is too large », « Invalid value for temperature ») non.
  if (/too large|too small|out of range|must be (?:less|greater|between|at most|at least)|invalid value|invalid type|exceeds/.test(haystack)) return null;
  if (!/unsupported|not supported|unknown (?:parameter|field|argument)|unrecognized|deprecated|not allowed|extra inputs|is not permitted/.test(haystack)) return null;
  const named = String(error?.param || '').toLowerCase();
  if (PARAMETERS.includes(named)) return named;
  // Le plus long d'abord : « max_completion_tokens » contient « max_tokens » par endroits.
  return PARAMETERS.find((name) => new RegExp(`['"\`]?${name}['"\`]?`).test(haystack) && !(name === 'max_tokens' && /max_completion_tokens/.test(haystack) && !/max_tokens\b(?!_)/.test(haystack.replace(/max_completion_tokens/g, '')))) || null;
}

/**
 * Corps de requête sans le paramètre refusé, ou null si on ne sait pas réparer.
 * La réparation ne touche jamais aux messages, aux notes ni au modèle.
 */
export function repairRejectedParameter(body, bodyText) {
  const name = rejectedParameter(bodyText);
  if (!name || !body || typeof body !== 'object') return null;
  const next = { ...body };
  if (name === 'temperature' || name === 'top_p' || name === 'response_format' || name === 'tool_choice') {
    if (!(name in next)) return null;
    delete next[name];
    return next;
  }
  if (name === 'max_tokens' && Number.isInteger(next.max_tokens)) {
    next.max_completion_tokens = next.max_tokens;
    delete next.max_tokens;
    return next;
  }
  if (name === 'max_completion_tokens' && Number.isInteger(next.max_completion_tokens)) {
    next.max_tokens = next.max_completion_tokens;
    delete next.max_completion_tokens;
    return next;
  }
  return null;
}

/**
 * Range un refus HTTP dans une catégorie.
 * @param {{status: number, bodyText?: string, retryAfter?: string|number|null}} failure
 * @returns {{code: string, userAction: string, waitSeconds: number|null, parameter: string|null}}
 */
export function classifyProviderFailure({ status, bodyText = '', retryAfter = null } = {}) {
  const { haystack } = parseBody(bodyText);
  const done = (code, extra = {}) => ({ code, userAction: userActionFor(code), waitSeconds: null, parameter: null, ...extra });
  const tooLarge = /context_length_exceeded|max_tokens_exceeded|string_too_long|maximum context length|context window|too many tokens|prompt is too long|request too large|input is too long/.test(haystack);
  const modelMissing = /model_not_found|model[^.]{0,60}(does not exist|not found|is not available|no longer available|decommissioned|deprecated)|unknown model|invalid model|no endpoints found/.test(haystack);
  const busy = /upstream|shared_pool|temporarily rate-limited|overloaded|over capacity|at capacity|provider returned error|server is busy|try again shortly/.test(haystack);
  const credit = /credit|billing|payment|insufficient (?:funds|balance|quota)|budget|subscription|subscribe|add usage|plan/.test(haystack);

  if (status === 401) return done('AI_API_KEY_INVALID');
  if (status === 402) return done('AI_API_ERROR_402');
  if (status === 403) {
    if (/invalid[^.]{0,20}key|incorrect api key|api key[^.]{0,30}(invalid|revoked|expired|disabled)|authentication/.test(haystack)) return done('AI_API_KEY_INVALID');
    if (credit) return done('AI_API_ERROR_402');
    if (/moderation|flagged|safety|content policy|content_filter|blocked/.test(haystack)) return done('AI_CONTENT_BLOCKED');
    // Permissions, région, modèle réservé à certains comptes : pas forcément la clé.
    return done('AI_ACCESS_DENIED');
  }
  if (status === 404) return done('AI_MODEL_UNAVAILABLE');
  if (status === 413) return done('AI_REQUEST_TOO_LARGE');
  if (status === 400 || status === 422) {
    if (tooLarge) return done('AI_REQUEST_TOO_LARGE');
    if (modelMissing) return done('AI_MODEL_UNAVAILABLE');
    const parameter = rejectedParameter(bodyText);
    if (parameter) return done('AI_BAD_REQUEST', { parameter });
    if (/\btools?\b|tool_calls|function calling|function_call/.test(haystack) && /not support|unsupported|does not support|not available|invalid|unknown/.test(haystack)) return done('AI_TOOLS_UNSUPPORTED');
    return done(`AI_API_ERROR_${status}`);
  }
  if (status === 429) {
    const waitSeconds = retryDelaySeconds(retryAfter, bodyText);
    if (credit && /exceeded your current quota|insufficient_quota/.test(haystack)) return done('AI_API_ERROR_402');
    if (busy && !/requests per|tokens per|rpm|tpm|rpd|per minute|per day/.test(haystack)) return done('AI_PROVIDER_BUSY', { waitSeconds });
    return done('AI_API_ERROR_429', { waitSeconds });
  }
  if (status === 503 || status === 529) return done('AI_PROVIDER_BUSY', { waitSeconds: retryDelaySeconds(retryAfter, bodyText) });
  if (status >= 500 && status <= 599) return done(`AI_API_ERROR_${status}`);
  return done(`AI_API_ERROR_${status}`);
}

/**
 * Une erreur renvoyée dans un corps HTTP 200 (OpenRouter et d'autres relais) : `{error: {...}}`
 * ou `choices[0].error`. Rend le statut à retenir et le texte, ou null.
 */
export function embeddedProviderError(data) {
  const error = data?.error || data?.choices?.[0]?.error || null;
  if (!error) return null;
  const code = Number(typeof error === 'object' ? error.code ?? error.status : NaN);
  return { status: Number.isInteger(code) && code >= 400 && code <= 599 ? code : 502, bodyText: JSON.stringify({ error }) };
}

/** Une exception réseau (fetch, IPC) rangée dans une catégorie, sans jamais recopier son texte. */
export function classifyTransportError(err, { aborted = false, cancelled = false } = {}) {
  const message = String(err?.message || err || '');
  if (cancelled) return 'AI_CANCELLED';
  if (aborted || err?.name === 'AbortError' || /timeout|timed out/i.test(message)) return 'AI_TIMEOUT';
  if (err instanceof SyntaxError || /unexpected (?:token|end)|json/i.test(message)) return 'AI_INVALID_RESPONSE';
  return 'AI_NETWORK_ERROR';
}
