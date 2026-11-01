// [Claude] — 2026-09-25 — Registre des contextes confiés au Copilote.
//
// Le Copilote reçoit ce que les autres écrans savent (le tutoriel lu dans
// Pédagogie IA, l'exercice en cours dans Exercices) sans importer ces écrans :
// ils touchent au DOM dès leur chargement, ce qui empêchait de tester
// copilot-tab.js en Node. Chaque écran inscrit ici une fonction qui rend son
// contexte ; le Copilote le lit au moment d'en avoir besoin. Module pur.

const providers = new Map();

/**
 * Inscrit la fonction qui rend le contexte d'un écran (la dernière inscrite l'emporte).
 * @param {'tutorial'|'exercise'|string} kind
 * @param {() => object|null} provider
 */
export function registerCopilotContext(kind, provider) {
  if (!kind) return;
  if (typeof provider === 'function') providers.set(kind, provider);
  else providers.delete(kind);
}

/**
 * Contexte actuel d'un écran, ou null (écran pas encore chargé, ou erreur : le
 * Copilote répond alors sans lui plutôt que de planter).
 * @param {string} kind
 * @returns {object|null}
 */
export function readCopilotContext(kind) {
  const provider = providers.get(kind);
  if (!provider) return null;
  try {
    return provider() ?? null;
  } catch (err) {
    console.warn(`[Copilote] contexte « ${kind} » indisponible :`, err);
    return null;
  }
}
