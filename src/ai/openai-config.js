// [Claude] — 2026-07-04 — Configuration générique pour une API OpenAI-compatible (Groq, OpenRouter, Gemini, etc.)

const STORAGE_KEY = 'piano-jazz-ai-config';

const DEFAULTS = {
  baseUrl: 'https://api.groq.com/openai/v1',
  apiKey: '',
  model: 'llama-3.1-8b-instant',
};

export function getAIConfig() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw);
    return {
      baseUrl: parsed.baseUrl || DEFAULTS.baseUrl,
      apiKey: parsed.apiKey || DEFAULTS.apiKey,
      model: parsed.model || DEFAULTS.model,
    };
  } catch (e) {
    console.warn('[AI Config] Failed to load config:', e);
    return { ...DEFAULTS };
  }
}

export function saveAIConfig(config) {
  const safe = {
    baseUrl: config.baseUrl?.trim() || DEFAULTS.baseUrl,
    apiKey: config.apiKey?.trim() || DEFAULTS.apiKey,
    model: config.model?.trim() || DEFAULTS.model,
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(safe));
  return safe;
}

export function createOpenAIClient(config = getAIConfig()) {
  return {
    baseUrl: config.baseUrl.replace(/\/$/, ''),
    apiKey: config.apiKey,
    model: config.model,
  };
}

export async function testAIConfig(config) {
  const client = createOpenAIClient(config);
  if (!client.apiKey) {
    throw new Error('Clé API manquante');
  }

  const res = await fetch(`${client.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${client.apiKey}`,
    },
    body: JSON.stringify({
      model: client.model,
      messages: [{ role: 'user', content: 'Réponds par un simple OK.' }],
      max_tokens: 5,
    }),
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
    models: [
      'llama-3.1-8b-instant',
      'llama-3.3-70b-versatile',
      'llama-3.3-70b-specdec',
      'gemma2-9b-it',
      'mixtral-8x7b-32768',
    ],
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
