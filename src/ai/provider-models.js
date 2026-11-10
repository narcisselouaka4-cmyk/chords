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
  const unique = [...new Set(models)];
  if (providerIdentity(baseUrl) !== 'https://api.anthropic.com') return unique;
  const rank = new Map(ANTHROPIC_MODELS.map((m, i) => [m.id, i]));
  // Ordre tarifaire du catalogue ; identifiants libres sans tarif connu à la fin.
  return unique.sort((a, b) => (rank.get(a) ?? rank.size) - (rank.get(b) ?? rank.size));
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
