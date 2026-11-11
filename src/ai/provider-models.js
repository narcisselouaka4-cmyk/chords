// Catalogue API publique Anthropic vérifié le 10/11/2026 (modèles disponibles,
// hors modèles retirés et accès restreints). Prix standard USD / million de tokens,
// hors cache et batch : https://platform.claude.com/docs/en/about-claude/pricing
// Haiku 5.5 : tarif des requêtes jusqu'à 100 000 tokens ; au-delà : 0,50 / 2,50.
export const ANTHROPIC_MODELS = [
  { id: 'claude-haiku-5-5', input: 0.1, output: 0.5 },
  { id: 'claude-haiku-4-5-20251001', input: 1, output: 5 },
  { id: 'claude-sonnet-5-5', input: 2, output: 10 },
  { id: 'claude-sonnet-5', input: 2, output: 10 },
  { id: 'claude-sonnet-4-6', input: 3, output: 15 },
  { id: 'claude-sonnet-4-5-20250929', input: 3, output: 15 },
  { id: 'claude-opus-5-5', input: 4, output: 20 },
  { id: 'claude-opus-5', input: 5, output: 25 },
  { id: 'claude-opus-4-8', input: 5, output: 25 },
  { id: 'claude-opus-4-7', input: 5, output: 25 },
  { id: 'claude-opus-4-6', input: 5, output: 25 },
  { id: 'claude-opus-4-5-20251101', input: 5, output: 25 },
  { id: 'claude-fable-5-2', input: 8, output: 40 },
  { id: 'claude-fable-5-1', input: 10, output: 50 },
  { id: 'claude-fable-5', input: 10, output: 50 },
];

export function providerIdentity(baseUrl) {
  try {
    const url = new URL(baseUrl.trim());
    // Les anciennes clés Anthropic portent parfois /v1/messages ou /v1.
    if (url.hostname === 'api.anthropic.com') return url.origin;
    return `${url.origin}${url.pathname.replace(/\/+$/, '')}`;
  } catch {
    return '';
  }
}

export function sortProviderModels(baseUrl, models) {
  const unique = [...new Set(models)].filter((model) => !isRetiredPublicModel(baseUrl, model));
  if (providerIdentity(baseUrl) !== 'https://api.anthropic.com') return unique;
  const rank = new Map(ANTHROPIC_MODELS.map((m, i) => [m.id, i]));
  // Ordre tarifaire du catalogue ; identifiants libres sans tarif connu à la fin.
  return unique.sort((a, b) => (rank.get(a) ?? rank.size) - (rank.get(b) ?? rank.size));
}

// Références retirées des offres publiques, vérifiées le 10/11/2026. Le filtre
// porte aussi sur l'historique : modifier les préréglages seuls les faisait revenir.
// Groq conserve éventuellement ces Llama pour des contrats Enterprise spécifiques.
export function isRetiredPublicModel(baseUrl, model) {
  const provider = providerIdentity(baseUrl);
  if (provider === 'https://openrouter.ai/api/v1') {
    // 12/11/2026 : les très petits modèles (1,7 à 2,6 milliards de paramètres) ne tiennent pas un plan
    // d'harmonisation ; ils sont masqués des menus, jamais supprimés des données enregistrées.
    return ['meta-llama/llama-3.1-8b-instruct:free', 'google/gemini-flash-1.5:free', 'liquid/lfm-3-1.7b:free', 'liquid/lfm-2.5-2.6b:free', 'google/gemma-4-26b-a4b-it:free'].includes(model);
  }
  if (provider === 'https://generativelanguage.googleapis.com/v1beta/openai') {
    // Arrêtés par Google (page des modèles, vérifiée le 12/11/2026).
    return /^gemini-(?:1\.5|2\.0)-/.test(String(model)) || ['gemini-3.1-flash-lite-preview', 'gemini-3-pro-preview'].includes(model);
  }
  if (provider === 'https://api.groq.com/openai/v1') {
    return ['llama-3.1-8b-instant', 'llama-3.3-70b-versatile'].includes(model);
  }
  return false;
}

export function modelsForProvider(baseUrl, presets, profiles) {
  const provider = providerIdentity(baseUrl);
  if (!provider) return [];
  const preset = presets.find((p) => providerIdentity(p.baseUrl) === provider);
  const saved = profiles.filter((p) => providerIdentity(p.baseUrl) === provider);
  return sortProviderModels(baseUrl, [
    ...(preset?.models || []),
    ...saved.flatMap((p) => p.models || []),
  ]);
}
