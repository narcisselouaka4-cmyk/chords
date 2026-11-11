// [Claude] — 2026-11-11 — Erreurs des fournisseurs d'IA : catégories, messages, relances bornées.
//
// Deux niveaux : la lecture pure des refus (src/ai/provider-errors.js), puis le VRAI client du
// Copilote branché sur le faux fournisseur local (scripts/copilot-e2e/mock-provider.mjs, HTTP sur
// 127.0.0.1) : pour chaque catégorie, le bon code, le bon message, et le nombre exact de requêtes
// parties (aucune boucle). Aucune vraie clé, aucun vrai fournisseur.

import {
  classifyProviderFailure, retryDelaySeconds, rejectedParameter, repairRejectedParameter,
  embeddedProviderError, classifyTransportError, userActionFor,
} from '../ai/provider-errors.js';
import { copilotErrorText } from './copilot-errors.js';
import { startMockProvider, ERROR_SCENARIOS, completionBody } from '../../scripts/copilot-e2e/mock-provider.mjs';

global.window = { AudioContext: class { constructor() { this.state = 'suspended'; } } };
global.document = { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], dispatchEvent: () => true };
global.CustomEvent ||= class { constructor(type) { this.type = type; } };
const store = new Map();
global.localStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
const { sendCopilotMessage, setCopilotTimeout, cancelCopilotRequest } = await import('./copilot-client.js');

let passed = 0;
let failed = 0;
function check(name, condition, detail = '') {
  if (condition) { passed += 1; console.log(`\x1b[32m✓\x1b[0m ${name}`); }
  else { failed += 1; console.log(`\x1b[31m✗\x1b[0m ${name}${detail ? ` — ${detail}` : ''}`); }
}
const quiet = async (fn) => { const { log, warn } = console; console.log = () => {}; console.warn = () => {}; try { return await fn(); } finally { console.log = log; console.warn = warn; } };
const code = (status, body, retryAfter = null) => classifyProviderFailure({ status, bodyText: typeof body === 'string' ? body : JSON.stringify(body), retryAfter }).code;

// ── 1. Lecture pure des refus, avec des corps réalistes ─────────────────────
check('401 → clé refusée', code(401, { error: { message: 'Invalid API Key', code: 'invalid_api_key' } }) === 'AI_API_KEY_INVALID');
check('401 Anthropic → clé refusée', code(401, { type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } }) === 'AI_API_KEY_INVALID');
check('402 → crédit, pas la clé', code(402, 'Add usage credits or subscribe') === 'AI_API_ERROR_402' && userActionFor('AI_API_ERROR_402') === 'verifier-compte');
check('403 permissions → accès refusé, la clé n\'est pas accusée', code(403, { error: { message: 'The model is not available for your account or region.', type: 'permission_error' } }) === 'AI_ACCESS_DENIED');
check('403 crédit (OpenRouter « key limit ») → compte', code(403, { error: { message: 'Key limit exceeded. Manage it using your billing page', code: 403 } }) === 'AI_API_ERROR_402');
check('403 filtre de contenu → reformuler', code(403, { error: { message: 'Your input was flagged by moderation', code: 403 } }) === 'AI_CONTENT_BLOCKED' && userActionFor('AI_CONTENT_BLOCKED') === 'raccourcir-ou-reformuler');
check('403 clé révoquée → clé', code(403, { error: { message: 'API key has been revoked or is invalid' } }) === 'AI_API_KEY_INVALID');
check('404 → modèle introuvable', code(404, { error: { message: 'model "beam" not found' } }) === 'AI_MODEL_UNAVAILABLE');
check('400 modèle retiré → modèle introuvable (pas « outils »)', code(400, { error: { message: 'The model `llama-3.3` has been decommissioned', code: 'model_decommissioned' } }) === 'AI_MODEL_UNAVAILABLE');
check('400 contexte → demande trop grande', code(400, ERROR_SCENARIOS.context400.body) === 'AI_REQUEST_TOO_LARGE');
check('400 contexte relayé par OpenRouter', code(400, { error: { code: 400, metadata: { error_type: 'context_length_exceeded' } } }) === 'AI_REQUEST_TOO_LARGE');
check('400 paramètre refusé → nommé', classifyProviderFailure({ status: 400, bodyText: JSON.stringify(ERROR_SCENARIOS.badParam400.body) }).parameter === 'temperature');
check('400 Anthropic « temperature is deprecated » → nommé', rejectedParameter(JSON.stringify({ type: 'error', error: { type: 'invalid_request_error', message: '`temperature` is deprecated for this model.' } })) === 'temperature');
check('400 « max_tokens » refusé, pas confondu avec max_completion_tokens', rejectedParameter(JSON.stringify({ error: { message: "Unsupported parameter: 'max_tokens' is not supported with this model. Use 'max_completion_tokens' instead.", param: 'max_tokens' } })) === 'max_tokens');
check('400 outils refusés → outils', code(400, ERROR_SCENARIOS.tools400.body) === 'AI_TOOLS_UNSUPPORTED');
check('400 inexpliqué → reste un 400 (pas « outils » d\'office)', code(400, { error: { message: 'Bad request' } }) === 'AI_API_ERROR_400');
check('413 TPM Groq → demande trop grande', code(413, ERROR_SCENARIOS.tooLarge413.body) === 'AI_REQUEST_TOO_LARGE');
const quota = classifyProviderFailure({ status: 429, bodyText: JSON.stringify(ERROR_SCENARIOS.quota429.body), retryAfter: '12' });
check('429 quota personnel → quota, avec le délai annoncé', quota.code === 'AI_API_ERROR_429' && quota.waitSeconds === 12 && quota.userAction === 'attendre');
check('429 hébergeur partagé saturé → saturation, pas quota', code(429, ERROR_SCENARIOS.busy429.body) === 'AI_PROVIDER_BUSY');
check('429 OpenRouter « shared pool » → saturation', code(429, { error: { metadata: { limit_source: 'upstream_provider_shared_pool' } } }) === 'AI_PROVIDER_BUSY');
check('429 OpenAI « insufficient_quota » → compte', code(429, { error: { message: 'You exceeded your current quota, please check your plan and billing details.', code: 'insufficient_quota' } }) === 'AI_API_ERROR_402');
check('500 → panne du service', code(500, ERROR_SCENARIOS.server500.body) === 'AI_API_ERROR_500' && userActionFor('AI_API_ERROR_500') === 'attendre');
check('503 et 529 → saturation', code(503, ERROR_SCENARIOS.overloaded503.body) === 'AI_PROVIDER_BUSY' && code(529, { type: 'error', error: { type: 'overloaded_error', message: 'Overloaded' } }) === 'AI_PROVIDER_BUSY');
check('Délai lu dans le texte (« try again in 1m30s »)', retryDelaySeconds(null, 'Please try again in 1m30s.') === 90 && retryDelaySeconds(null, 'try again in 7.66s') === 8);
check('Délai : en-tête prioritaire, borné à une heure', retryDelaySeconds('30', 'try again in 5s') === 30 && retryDelaySeconds('99999') === 3600 && retryDelaySeconds(null, 'rien') === null);
check('Erreur dans un HTTP 200 (corps)', embeddedProviderError({ error: { code: 429, message: 'rate limited' } })?.status === 429);
check('Erreur dans un HTTP 200 (choix)', embeddedProviderError({ choices: [{ error: { code: 502, message: 'upstream' } }] })?.status === 502);
check('Réponse normale : pas d\'erreur embarquée', embeddedProviderError(completionBody({ text: 'ok' })) === null);
const repaired = repairRejectedParameter({ model: 'm', messages: [{ role: 'user', content: 'notes exactes' }], temperature: 0.4, max_completion_tokens: 1200 }, JSON.stringify(ERROR_SCENARIOS.badParam400.body));
check('Réparation : seul le paramètre refusé est retiré', repaired && !('temperature' in repaired) && repaired.max_completion_tokens === 1200 && repaired.messages[0].content === 'notes exactes');
check('Réparation impossible quand rien n\'est nommé', repairRejectedParameter({ temperature: 0.4 }, '{"error":{"message":"Bad request"}}') === null);
check('Exception réseau → catégorie, jamais son texte', classifyTransportError(new TypeError('fetch failed')) === 'AI_NETWORK_ERROR' && classifyTransportError(new SyntaxError('Unexpected token')) === 'AI_INVALID_RESPONSE' && classifyTransportError(new Error('x'), { cancelled: true }) === 'AI_CANCELLED');

// ── 2. Le vrai client du Copilote sur le faux fournisseur local ─────────────
const mock = await startMockProvider();
store.set('piano-jazz-ai-config', JSON.stringify({ apiKey: 'cle-de-test-locale', baseUrl: mock.url, model: 'mock-model' }));
const ask = (message = 'Explique-moi le rôle de la tierce dans un accord.') => quiet(() => sendCopilotMessage({ message, messages: [], context: null }));

async function scenario(name, queue, expected, requests, more = () => true) {
  mock.reset();
  mock.enqueue(...queue);
  const result = await ask();
  const text = result.ok ? '' : copilotErrorText(result.error, result.details);
  check(`${name} → ${expected} en ${requests} requête${requests > 1 ? 's' : ''}`,
    (result.ok ? 'ok' : result.error) === expected && mock.requests.length === requests && more(result, text),
    JSON.stringify({ got: result.ok ? 'ok' : result.error, requests: mock.requests.length, text: text.slice(0, 120) }));
  return result;
}

await scenario('401', ['auth401'], 'AI_API_KEY_INVALID', 1, (r, t) => /clé API a été refusée/.test(t));
await scenario('402', ['credit402'], 'AI_API_ERROR_402', 1, (r, t) => /pas un problème de clé/.test(t));
await scenario('403', ['forbidden403'], 'AI_ACCESS_DENIED', 1, (r, t) => /pas forcément en cause/.test(t));
await scenario('404', ['notFound404'], 'AI_MODEL_UNAVAILABLE', 1, (r, t) => /autre modèle/.test(t));
await scenario('400 contexte', ['context400'], 'AI_REQUEST_TOO_LARGE', 1, (r, t) => /plus court/.test(t));
await scenario('413', ['tooLarge413'], 'AI_REQUEST_TOO_LARGE', 1);
await scenario('429 quota', ['quota429'], 'AI_API_ERROR_429', 1, (r, t) => r.details?.waitSeconds === 12 && /environ 12 secondes/.test(t));
await scenario('429 hébergeur saturé', ['busy429'], 'AI_PROVIDER_BUSY', 1, (r, t) => /clé n’est pas en cause/.test(t));
await scenario('500', ['server500'], 'AI_API_ERROR_500', 1, (r, t) => /problème de son côté/.test(t));
await scenario('503', ['overloaded503'], 'AI_PROVIDER_BUSY', 1);
await scenario('Erreur dans un HTTP 200', ['embedded200'], 'AI_API_ERROR_502', 1);
await scenario('JSON invalide', ['invalidJson200'], 'AI_INVALID_RESPONSE', 1, (r, t) => /abîmée/.test(t) && !/Unexpected|JSON/.test(t));
await scenario('Connexion coupée', [{ drop: true }], 'AI_NETWORK_ERROR', 1, (r, t) => /connexion/.test(t) && !/ECONN|socket|fetch/.test(t));
// Réponse vide : une seule relance (sans outils) pour obtenir le texte, puis échec explicite.
await scenario('Réponse vide deux fois', ['empty200', 'empty200'], 'AI_EMPTY_RESPONSE', 2, (r, t) => /pas reçu de réponse utilisable/.test(t));
await scenario('Réponse vide puis texte', ['empty200', { text: 'La tierce donne la couleur majeure ou mineure.' }], 'ok', 2, (r) => /tierce/.test(r.content));
// Paramètre refusé : une reprise sans lui, mêmes messages et mêmes outils.
await scenario('Paramètre refusé puis accepté', ['badParam400', { text: 'Réponse après réparation.' }], 'ok', 2, () => {
  const [first, second] = mock.requests.map((r) => r.body);
  return 'temperature' in first && !('temperature' in second) && JSON.stringify(first.messages) === JSON.stringify(second.messages) && JSON.stringify(first.tools) === JSON.stringify(second.tools);
});
await scenario('Paramètre refusé deux fois : pas de boucle', ['badParam400', 'badParam400'], 'AI_BAD_REQUEST', 2);
// Outils refusés : un repli sans outils (comportement historique), borné.
await scenario('Outils refusés puis réponse sans outils', ['tools400', { text: 'Réponse sans outils.' }], 'ok', 2, () => !('tools' in mock.requests[1].body));
await scenario('Sortie coupée par la limite', ['truncated200'], 'ok', 1, (r) => /coupée par la limite/.test(r.content) && /trois acc/.test(r.content));

// Délai dépassé : une seule requête, message clair.
setCopilotTimeout(300);
await scenario('Délai dépassé', [{ text: 'trop tard', delayMs: 900 }], 'AI_TIMEOUT', 1, (r, t) => /pas répondu à temps/.test(t));
setCopilotTimeout(90000);

// Arrêt par le pianiste : la demande s'arrête tout de suite, sans relance.
mock.reset();
mock.enqueue({ text: 'jamais lue', delayMs: 1500 });
const started = Date.now();
const pending = ask();
setTimeout(() => cancelCopilotRequest(), 150);
const cancelled = await pending;
check('Arrêt demandé → AI_CANCELLED, tout de suite, une seule requête',
  cancelled.error === 'AI_CANCELLED' && Date.now() - started < 900 && mock.requests.length === 1 && /Tu as arrêté/.test(copilotErrorText(cancelled.error)),
  JSON.stringify({ error: cancelled.error, ms: Date.now() - started, n: mock.requests.length }));
mock.reset();
const after = await ask();
check('Après un arrêt, la demande suivante part normalement', after.ok && mock.requests.length === 1, JSON.stringify(after.error));

// Aucun secret ni changement silencieux : même adresse, même modèle, clé jamais recopiée.
mock.reset();
mock.enqueue('server500');
const failedTurn = await ask();
check('La clé n\'apparaît dans aucun résultat d\'erreur', !JSON.stringify(failedTurn).includes('cle-de-test-locale'));
check('Le modèle demandé est celui des réglages (aucun changement silencieux)', mock.requests.every((r) => r.body.model === 'mock-model'));

await mock.close();
console.log(`\n=== Résultat : ${passed}/${passed + failed} tests passés ===`);
process.exit(failed === 0 ? 0 : 1);
