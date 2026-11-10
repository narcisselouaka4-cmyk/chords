// [Claude] — 2026-07-04 — Configuration générique pour une API OpenAI-compatible (Groq, OpenRouter, Gemini, etc.)
// [Refonte 2026-09-02] — La clé API est chiffrée via Electron safeStorage quand il est disponible.
// [Claude] — 2026-11-10 — Anthropic (schéma natif Messages API, pas /chat/completions) est
// maintenant un fournisseur réel : voir anthropic-adapter.js pour la traduction requête/réponse.

import {
  isAnthropicEndpoint, anthropicRequestUrl, anthropicHeaders, toAnthropicBody, fromAnthropicResponse,
} from './anthropic-adapter.js';
import { incrementMonthlyUsage } from './usage-cap.js';
import { ANTHROPIC_MODELS, providerIdentity, modelsForProvider, sortProviderModels } from './provider-models.js';

const STORAGE_KEY = 'piano-jazz-ai-config';
const ENCRYPTED_PREFIX = 'enc:';

const DEFAULTS = {
  baseUrl: 'https://api.groq.com/openai/v1',
  apiKey: '',
  model: 'openai/gpt-oss-20b',
  monthlyCap: 50,
};

let cachedConfig = null;
let secureLoaded = false;

function isBrowser() {
  return typeof window !== 'undefined';
}

function getLocalRaw() {
  if (!isBrowser()) return null;
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch (_) {
    return null;
  }
}

function setLocalRaw(value) {
  if (!isBrowser()) return;
  try {
    localStorage.setItem(STORAGE_KEY, value);
  } catch (_) { /* ignore */ }
}

async function decryptApiKey(storedKey) {
  if (!storedKey || !storedKey.startsWith(ENCRYPTED_PREFIX)) return storedKey || '';
  const encrypted = storedKey.slice(ENCRYPTED_PREFIX.length);
  if (!isBrowser() || !window.electronAPI?.safeStorage?.decryptString) {
    return '';
  }
  try {
    return await window.electronAPI.safeStorage.decryptString(encrypted);
  } catch (e) {
    console.warn('[AI Config] Échec du déchiffrement de la clé API :', e.message);
    return '';
  }
}

async function encryptApiKey(plainKey) {
  if (!plainKey) return '';
  if (!isBrowser() || !window.electronAPI?.safeStorage?.encryptString) {
    return plainKey;
  }
  try {
    const encrypted = await window.electronAPI.safeStorage.encryptString(plainKey);
    return `${ENCRYPTED_PREFIX}${encrypted}`;
  } catch (e) {
    console.warn('[AI Config] safeStorage indisponible, clé stockée en clair :', e.message);
    return plainKey;
  }
}

/**
 * Charge la configuration de façon sécurisée (déchiffrement asynchrone).
 * À appeler une fois au démarrage de l'application ; getAIConfig() reste synchrone
 * ensuite en utilisant le cache.
 */
export async function loadSecureAIConfig() {
  const raw = getLocalRaw();
  let parsed = null;
  if (raw) {
    try {
      parsed = JSON.parse(raw);
    } catch (_) {
      parsed = null;
    }
  }

  const storedKey = parsed?.apiKey || '';
  const apiKey = await decryptApiKey(storedKey);

  cachedConfig = {
    baseUrl: parsed?.baseUrl || DEFAULTS.baseUrl,
    apiKey,
    model: parsed?.model || DEFAULTS.model,
    monthlyCap: Number.isFinite(parseInt(parsed?.monthlyCap, 10))
      ? parseInt(parsed?.monthlyCap, 10)
      : DEFAULTS.monthlyCap,
  };
  secureLoaded = true;
  return cachedConfig;
}

export function getAIConfig() {
  if (secureLoaded && cachedConfig) {
    return { ...cachedConfig };
  }
  try {
    const raw = getLocalRaw();
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw);
    return {
      baseUrl: parsed.baseUrl || DEFAULTS.baseUrl,
      apiKey: parsed.apiKey?.startsWith(ENCRYPTED_PREFIX) ? '' : (parsed.apiKey || ''),
      model: parsed.model || DEFAULTS.model,
      monthlyCap: Number.isFinite(parseInt(parsed.monthlyCap, 10))
        ? parseInt(parsed.monthlyCap, 10)
        : DEFAULTS.monthlyCap,
    };
  } catch (e) {
    console.warn('[AI Config] Failed to load config:', e);
    return { ...DEFAULTS };
  }
}

/**
 * Vérifie si une clé API personnelle est configurée.
 * Même logique que dans usage-cap.js et pedagogie-tab.js.
 */
export function hasAIKey() {
  try {
    const cfg = getAIConfig();
    return Boolean(cfg && cfg.apiKey);
  } catch (_) {
    return false;
  }
}

export async function saveAIConfig(config) {
  const plainKey = config.apiKey?.trim() || '';
  const encryptedKey = await encryptApiKey(plainKey);
  const cap = parseInt(config.monthlyCap, 10);
  const safe = {
    baseUrl: config.baseUrl?.trim() || DEFAULTS.baseUrl,
    apiKey: encryptedKey,
    model: config.model?.trim() || DEFAULTS.model,
    monthlyCap: Number.isFinite(cap) && cap > 0 ? cap : DEFAULTS.monthlyCap,
  };
  setLocalRaw(JSON.stringify(safe));

  // Le cache mémoire conserve la clé en clair pour les appels API synchrones.
  cachedConfig = {
    baseUrl: safe.baseUrl,
    apiKey: plainKey,
    model: safe.model,
    monthlyCap: safe.monthlyCap,
  };
  secureLoaded = true;
  if (isBrowser()) {
    document.dispatchEvent(new CustomEvent('app-ai-config-saved', { detail: { ...cachedConfig } }));
  }
  return { ...cachedConfig };
}

export function createOpenAIClient(config = getAIConfig()) {
  return {
    baseUrl: config.baseUrl.replace(/\/$/, ''),
    apiKey: config.apiKey,
    model: config.model,
  };
}

/**
 * Appelle /chat/completions en passant par le processus principal d'Electron
 * quand c'est possible (pour contourner CORS du renderer, notamment Ollama Cloud).
 * Sinon, retombe sur fetch() direct (tests Node, navigateur hors Electron).
 *
 * L'objet retourné imite la réponse fetch() minimale utilisée dans le projet :
 * { ok, status, json(), text() }.
 */
export async function callChatCompletions(baseUrl, apiKey, body, options = {}) {
  if (typeof window !== 'undefined' && window.electronAPI?.ai?.chatCompletion) {
    // Les appelants historiques construisent un AbortController + setTimeout(30000).
    // Un AbortSignal ne traverse pas IPC ; on transmet donc le délai explicite
    // au processus principal pour qu'il l'applique sur son propre fetch(). Le
    // processus principal traduit déjà Anthropic vers la forme OpenAI avant de
    // renvoyer son texte : rien à faire ici dans ce cas.
    const timeoutMs = options.timeoutMs || (options.signal ? 30000 : undefined);
    const { ok, status, text } = await window.electronAPI.ai.chatCompletion(baseUrl, apiKey, body, timeoutMs);
    // [Claude] — 2026-11-10 — Seul point de passage réel de tout appel IA (Copilot,
    // narration Pédagogie, test de connexion) : avant ce lot, incrementMonthlyUsage()
    // existait mais n'était jamais appelée nulle part — « 0 / 50 ce mois » ne bougeait
    // jamais. Compte maintenant un vrai appel réseau réussi, quel que soit l'appelant.
    if (ok) incrementMonthlyUsage();
    return {
      ok,
      status,
      json: async () => JSON.parse(text),
      text: async () => text,
    };
  }

  // Repli fetch() direct (hors Electron : tests Node, navigateur) — même traduction
  // Anthropic que le processus principal, pour que les appelants n'aient jamais à
  // savoir quel fournisseur répond.
  const anthropic = isAnthropicEndpoint(baseUrl);
  const url = anthropic ? anthropicRequestUrl(baseUrl) : `${baseUrl.replace(/\/$/, '')}/chat/completions`;
  const headers = anthropic
    ? anthropicHeaders(apiKey)
    : { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` };
  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(anthropic ? toAnthropicBody(body) : body),
    ...(options.signal ? { signal: options.signal } : {}),
  });
  if (!anthropic || !res.ok) {
    if (res.ok) incrementMonthlyUsage();
    return res; // erreur : le texte brut du fournisseur reste utile tel quel
  }
  incrementMonthlyUsage();
  const data = await res.json();
  const translated = fromAnthropicResponse(data);
  return { ok: true, status: res.status, json: async () => translated, text: async () => JSON.stringify(translated) };
}

export async function testAIConfig(config) {
  const client = createOpenAIClient(config);
  if (!client.apiKey) {
    throw new Error('Clé API manquante');
  }

  const res = await callChatCompletions(client.baseUrl, client.apiKey, {
    model: client.model,
    messages: [{ role: 'user', content: 'Réponds par un simple OK.' }],
    max_tokens: 5,
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Erreur API ${res.status}: ${body}`);
  }

  return await res.json();
}

// [Claude] — 2026-10-19 — `genUrl` et `blurb` : Narcisse, Réglages › Assistant IA — « proposer des
// clés API préexistantes ou présélectionnées ». genUrl pointe vers la page où générer une clé
// gratuite chez le fournisseur (ouverte dans le navigateur système, pas dans l'app) ; blurb est la
// phrase courte affichée sur la carte. OpenAI est ajouté : son API /chat/completions est au même
// format que Groq/OpenRouter/Google (Authorization: Bearer, même schéma JSON) — compatible sans
// code supplémentaire.
// [Claude] — 2026-11-10 — Anthropic (Claude) est un vrai préréglage : son schéma natif
// (Messages API, en-têtes x-api-key/anthropic-version) est traduit par anthropic-adapter.js,
// transparent pour callChatCompletions des deux côtés (requête et réponse). Avant ce lot,
// l'app ne proposait qu'un lien vers la page de clé, sans jamais pouvoir réellement appeler
// Claude (404 : /chat/completions n'existe pas chez Anthropic, et les en-têtes différaient).
export const PRESETS = [
  {
    name: 'Groq',
    blurb: 'Gratuit, rapide',
    baseUrl: 'https://api.groq.com/openai/v1',
    models: ['openai/gpt-oss-20b', 'openai/gpt-oss-120b', 'llama-3.3-70b-versatile'],
    genUrl: 'https://console.groq.com/keys',
  },
  {
    name: 'OpenRouter',
    blurb: 'Multi-modèles gratuits',
    baseUrl: 'https://openrouter.ai/api/v1',
    // Catalogue public OpenRouter vérifié le 10/11/2026 : variantes gratuites
    // annonçant le support des outils. Les deux anciennes références ont disparu.
    models: ['nvidia/nemotron-3-ultra-550b-a55b:free', 'google/gemma-4-26b-a4b-it:free', 'liquid/lfm-3-1.7b:free'],
    genUrl: 'https://openrouter.ai/keys',
  },
  {
    name: 'Google AI Studio',
    blurb: 'Gemini Flash, gratuit',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    models: ['gemini-1.5-flash', 'gemini-1.5-flash-8b'],
    genUrl: 'https://aistudio.google.com/apikey',
  },
  {
    name: 'OpenAI',
    blurb: 'Payant, large choix de modèles',
    baseUrl: 'https://api.openai.com/v1',
    models: ['gpt-4o-mini', 'gpt-4o'],
    genUrl: 'https://platform.openai.com/api-keys',
  },
  {
    name: 'Anthropic (Claude)',
    blurb: 'Haiku, Sonnet, Opus et Fable · prix croissants',
    baseUrl: 'https://api.anthropic.com',
    models: ANTHROPIC_MODELS.map((m) => m.id),
    genUrl: 'https://console.anthropic.com/settings/keys',
  },
];

// Fournisseurs sans préréglage utilisable ici (schéma d'appel différent de
// /chat/completions, et pas de traduction écrite pour eux) : seul un lien vers
// leur page de clé est proposé, pour que l'utilisateur configure lui-même une
// adresse compatible s'il en connaît une.
export const EXTERNAL_PROVIDER_LINKS = [];

// ── Clés enregistrées (plusieurs profils, un seul actif à la fois) ─────────
// [Claude] — 2026-10-19 — Narcisse : « il faut un bouton qui permette de voir
// toutes les clés enregistrées et d'en sélectionner une dans la liste. C'est
// trop long de devoir retaper une clé ». Stockage séparé de la config active
// (STORAGE_KEY ci-dessus, inchangée) : une liste de profils {id, label,
// baseUrl, apiKey chiffrée, models}. Activer un modèle d'un profil ne fait que
// (re)poser la config active avec ses valeurs — aucun code existant
// (ai-client.js, usage-cap.js, pedagogie-tab.js…) n'a besoin de changer.
// [Claude] — 2026-11-10 — Narcisse : « quand je clique sur ma clé Ollama, rien
// ne me permet de dérouler les modèles que j'y ai déjà mis (Nemotron, Beam,
// GPT-OSS) — je suis obligé de tout retaper ». Une clé enregistrée porte donc
// maintenant une LISTE de modèles déjà utilisés sous cette même adresse/clé
// (`models`, pas un `model` singulier) : chaque nouveau modèle tapé une fois
// s'y ajoute et reste proposable ensuite, qu'il vienne d'un préréglage connu
// (Anthropic, Groq…) ou d'un fournisseur libre comme Ollama, dont le
// catalogue de modèles ne peut pas être deviné à l'avance. Compatibilité :
// une entrée plus ancienne n'a qu'un `model` (chaîne) — lue comme `models: [model]`.
const KEYS_LIST_STORAGE_KEY = 'piano-jazz-ai-keys';

function modelsOf(entry) {
  if (Array.isArray(entry?.models) && entry.models.length) return entry.models;
  if (typeof entry?.model === 'string' && entry.model) return [entry.model];
  return [];
}

function getKeysListRaw() {
  if (!isBrowser()) return [];
  try {
    const raw = localStorage.getItem(KEYS_LIST_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
}

function setKeysListRaw(list) {
  if (!isBrowser()) return;
  try {
    localStorage.setItem(KEYS_LIST_STORAGE_KEY, JSON.stringify(list));
  } catch (_) { /* ignore */ }
}

function labelForBaseUrl(baseUrl) {
  const preset = PRESETS.find((p) => p.baseUrl === baseUrl);
  if (preset) return preset.name;
  try {
    return new URL(baseUrl).hostname;
  } catch (_) {
    return baseUrl || 'Fournisseur personnalisé';
  }
}

/**
 * Liste des profils enregistrés, SANS déchiffrer les clés (un simple survol
 * de la liste n'a pas besoin du secret — il n'est lu qu'à l'activation).
 * `models` fusionne l'historique de la clé avec les modèles connus du
 * préréglage correspondant (si l'adresse en est un) : une clé Anthropic tout
 * juste enregistrée propose donc tout de suite ses 3 vrais modèles, pas
 * seulement celui utilisé au premier enregistrement.
 */
export function listSavedKeys() {
  return getKeysListRaw().map((entry) => {
    const preset = PRESETS.find((p) => providerIdentity(p.baseUrl) === providerIdentity(entry.baseUrl));
    const own = modelsOf(entry);
    const hidden = new Set(Array.isArray(entry.hiddenPresetModels) ? entry.hiddenPresetModels : []);
    const presetModels = preset ? preset.models.filter((m) => !hidden.has(m)) : [];
    const models = sortProviderModels(entry.baseUrl, [...presetModels, ...own]);
    return { id: entry.id, label: entry.label, baseUrl: entry.baseUrl, models };
  });
}

/** Suggestions limitées au fournisseur du champ ou de la clé en cours d'édition. */
export function getProviderModels(baseUrl) {
  return modelsForProvider(baseUrl, PRESETS, listSavedKeys());
}

/**
 * Enregistre un profil nommé. Une entrée existante avec le même baseUrl est
 * mise à jour (un profil par fournisseur) plutôt que dupliquée ; son modèle
 * s'ajoute à l'historique de la clé (`models`) au lieu de remplacer les
 * précédents.
 */
export async function saveNamedKey({ label, baseUrl, apiKey, model }) {
  const cleanBaseUrl = baseUrl?.trim() || DEFAULTS.baseUrl;
  const encryptedKey = await encryptApiKey(apiKey?.trim() || '');
  const list = getKeysListRaw();
  const existingIndex = list.findIndex((k) => k.baseUrl === cleanBaseUrl);
  const cleanModel = model?.trim() || DEFAULTS.model;
  const previousModels = existingIndex >= 0 ? modelsOf(list[existingIndex]) : [];
  const entry = {
    id: existingIndex >= 0 ? list[existingIndex].id : `key-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    label: label?.trim() || labelForBaseUrl(cleanBaseUrl),
    baseUrl: cleanBaseUrl,
    apiKey: encryptedKey,
    models: previousModels.includes(cleanModel) ? previousModels : [...previousModels, cleanModel],
  };
  if (existingIndex >= 0) list[existingIndex] = entry;
  else list.push(entry);
  setKeysListRaw(list);
  return entry.id;
}

/** Active un profil enregistré avec son premier modèle connu : déchiffre sa clé et la pose comme config active. */
export async function activateSavedKey(id) {
  const entry = getKeysListRaw().find((k) => k.id === id);
  if (!entry) throw new Error('Clé enregistrée introuvable.');
  return activateSavedKeyModel(id, modelsOf(entry)[0] || DEFAULTS.model);
}

/**
 * Active un profil enregistré avec un modèle précis parmi ceux déjà listés
 * pour cette clé (ou un nouveau, voir addModelToSavedKey) — déroulé dans la
 * liste des clés (Narcisse : « il doit y avoir un déploiement de ces trois
 * modèles » au clic sur une clé déjà enregistrée, sans tout retaper).
 */
export async function activateSavedKeyModel(id, model) {
  const entry = getKeysListRaw().find((k) => k.id === id);
  if (!entry) throw new Error('Clé enregistrée introuvable.');
  const apiKey = await decryptApiKey(entry.apiKey);
  return saveAIConfig({ baseUrl: entry.baseUrl, apiKey, model, monthlyCap: getAIConfig().monthlyCap });
}

/**
 * Ajoute un modèle à l'historique d'une clé déjà enregistrée, sans toucher à
 * son adresse ni sa clé (Narcisse : « ajouter une clé » doit rester réservé à
 * une VRAIE nouvelle clé API — ajouter un modèle à une clé existante est une
 * action distincte).
 */
export function addModelToSavedKey(id, model) {
  const clean = model?.trim();
  if (!clean) return;
  const list = getKeysListRaw();
  const idx = list.findIndex((k) => k.id === id);
  if (idx < 0) throw new Error('Clé enregistrée introuvable.');
  const models = modelsOf(list[idx]);
  if (!models.includes(clean)) {
    list[idx] = { ...list[idx], models: [...models, clean] };
    setKeysListRaw(list);
  }
}

/**
 * Retire un modèle de l'historique d'une clé (Narcisse : « faut qu'on puisse supprimer
 * des modèles aussi »), sans toucher à l'adresse ni à la clé. Pour une adresse de
 * préréglage (Anthropic, Groq…), ses modèles connus sont normalement toujours proposés
 * (listSavedKeys fusionne avec PRESETS.models) : ce modèle précis est donc en plus
 * gardé dans `hiddenPresetModels`, pour qu'il reste masqué malgré la fusion.
 */
export function removeModelFromSavedKey(id, model) {
  const list = getKeysListRaw();
  const idx = list.findIndex((k) => k.id === id);
  if (idx < 0) throw new Error('Clé enregistrée introuvable.');
  const own = modelsOf(list[idx]).filter((m) => m !== model);
  const hiddenPresetModels = Array.isArray(list[idx].hiddenPresetModels) ? list[idx].hiddenPresetModels : [];
  list[idx] = {
    ...list[idx],
    models: own,
    hiddenPresetModels: hiddenPresetModels.includes(model) ? hiddenPresetModels : [...hiddenPresetModels, model],
  };
  setKeysListRaw(list);
}

export function deleteSavedKey(id) {
  const list = getKeysListRaw().filter((k) => k.id !== id);
  setKeysListRaw(list);
}
