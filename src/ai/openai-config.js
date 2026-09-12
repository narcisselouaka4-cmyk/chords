// [Claude] — 2026-07-04 — Configuration générique pour une API OpenAI-compatible (Groq, OpenRouter, Gemini, etc.)
// [Refonte 2026-09-02] — La clé API est chiffrée via Electron safeStorage quand il est disponible.

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
 * Même logique que dans masterclass-panel.js et pedagogie-tab.js.
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
  const url = `${baseUrl.replace(/\/$/, '')}/chat/completions`;
  if (typeof window !== 'undefined' && window.electronAPI?.ai?.chatCompletion) {
    // Les appelants historiques construisent un AbortController + setTimeout(30000).
    // Un AbortSignal ne traverse pas IPC ; on transmet donc le délai explicite
    // au processus principal pour qu'il l'applique sur son propre fetch().
    const timeoutMs = options.timeoutMs || (options.signal ? 30000 : undefined);
    const { ok, status, text } = await window.electronAPI.ai.chatCompletion(baseUrl, apiKey, body, timeoutMs);
    return {
      ok,
      status,
      json: async () => JSON.parse(text),
      text: async () => text,
    };
  }
  return fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(body),
    ...(options.signal ? { signal: options.signal } : {}),
  });
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

export const PRESETS = [
  {
    name: 'Groq (gratuit, rapide)',
    baseUrl: 'https://api.groq.com/openai/v1',
    models: ['openai/gpt-oss-20b', 'openai/gpt-oss-120b', 'llama-3.3-70b-versatile'],
  },
  {
    name: 'OpenRouter (multi-modèles gratuits)',
    baseUrl: 'https://openrouter.ai/api/v1',
    models: ['meta-llama/llama-3.1-8b-instruct:free', 'google/gemini-flash-1.5:free'],
  },
  {
    name: 'Google AI Studio (Gemini Flash)',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    models: ['gemini-1.5-flash', 'gemini-1.5-flash-8b'],
  },
];
