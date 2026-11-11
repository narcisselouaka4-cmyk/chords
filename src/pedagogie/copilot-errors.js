// [Claude] — 2026-11-11 — Ce que le pianiste lit quand le Copilote n'a pas pu répondre.
//
// Chaque message dit, en français simple : ce qui s'est passé, s'il vaut mieux attendre, changer
// de modèle ou reformuler, et que la question (et la prise) sont gardées. Jamais de code brut,
// de JSON ni de nom interne dans la phrase ; une erreur inconnue donne un message général, avec
// son code entre parenthèses pour pouvoir le signaler.
// [Claude] — 2026-09-26 — Origine : copilotErrorText dans copilot-tab.js.

const KEPT = 'Ta question est conservée.';
const SETTINGS = 'Réglages › Assistant IA';

function waitPhrase(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) return '';
  if (seconds < 90) return ` Le fournisseur demande d'attendre environ ${Math.max(1, Math.round(seconds))} secondes.`;
  return ` Le fournisseur demande d'attendre environ ${Math.round(seconds / 60)} minutes.`;
}

/**
 * @param {string} error code d'erreur (AI_…)
 * @param {{waitSeconds?: number|null, hasTake?: boolean, timeoutSeconds?: number}} [details]
 * @returns {string}
 */
export function copilotErrorText(error, details = {}) {
  const base = errorSentence(error, details);
  // [Claude] — 2026-11-12 — La même demande a déjà échoué : on le dit, et on propose une autre voie
  // au lieu de laisser relancer à l'identique.
  const attempts = Number(details?.attempts) || 0;
  if (attempts < 2) return base;
  const code = String(error || '');
  const advice = details?.stage === 'harmony'
    ? 'Plutôt que de relancer à l’identique : enregistre un passage plus court (10 à 20 secondes), ou choisis un autre modèle dans Réglages › Assistant IA.'
    : /QUOTA|429|BUSY|5\d\d/.test(code) ? 'Attends une ou deux minutes avant de relancer, ou choisis un autre modèle dans Réglages › Assistant IA.'
      : 'Reformule la demande plus simplement, ou choisis un autre modèle dans Réglages › Assistant IA.';
  return `C’est la ${attempts}e tentative pour cette demande, sans succès. ${base} ${advice}`;
}

function errorSentence(error, details = {}) {
  const code = String(error || '');
  const kept = details.hasTake ? 'Ta question et ta prise sont conservées.' : KEPT;
  if (code === 'AI_EMPTY_RESPONSE') return `Je n’ai pas reçu de réponse utilisable, même après une nouvelle tentative. ${kept} Tu peux la renvoyer, ou essayer un autre modèle dans ${SETTINGS} si cela se répète.`;
  if (code === 'AI_OUTPUT_LIMIT' && details.stage === 'harmony') return `Le modèle a manqué de place pour écrire la proposition complète, même en lui demandant une seule version plus courte. ${kept} Un passage plus court (10 à 20 secondes) ou un autre modèle a plus de chances d’aboutir.`;
  if (code === 'AI_OUTPUT_LIMIT') return `La réponse a été interrompue avant d’être rédigée : le modèle a atteint sa limite de longueur. ${kept} Réessaie sur un point plus précis.`;
  if (code === 'AI_INVALID_RESPONSE') return `La réponse du service d’IA est arrivée abîmée et je n’ai pas pu la lire. ${kept} Réessaie ; si cela se répète, choisis un autre modèle dans ${SETTINGS}.`;
  if (code === 'AI_API_KEY_INVALID') return `La clé API a été refusée par le fournisseur. ${kept} Vérifie la clé dans ${SETTINGS} : attendre ne changera rien.`;
  if (code === 'AI_ACCESS_DENIED') return `Le fournisseur refuse l’accès à ce modèle avec ce compte (droits, région ou offre). Ta clé n’est pas forcément en cause. ${kept} Choisis un autre modèle dans ${SETTINGS}, ou vérifie ce que ton compte autorise chez ce fournisseur.`;
  if (code === 'AI_CONTENT_BLOCKED') return `Le fournisseur a bloqué cette demande par son filtre de contenu. ${kept} Reformule-la, ou essaie un autre modèle dans ${SETTINGS}.`;
  if (code === 'AI_MODEL_UNAVAILABLE') return `Ce modèle est introuvable ou inaccessible avec ce compte. ${kept} Choisis un autre modèle dans ${SETTINGS} : attendre ne changera rien.`;
  if (code === 'AI_BAD_REQUEST' || code === 'AI_TOOLS_UNSUPPORTED' || code === 'AI_API_ERROR_400' || code === 'AI_API_ERROR_422') return `Ce modèle n’accepte pas la demande telle que l’application l’envoie. ${kept} Choisis un autre modèle dans ${SETTINGS} ; si cela se répète, signale ce message.`;
  if (code === 'AI_PROVIDER_BUSY') return `Ce modèle est temporairement saturé chez son hébergeur. Ta clé n’est pas en cause.${waitPhrase(details.waitSeconds)} ${kept} Réessaie un peu plus tard, ou choisis un autre modèle dans ${SETTINGS}.`;
  if (code === 'AI_NETWORK_ERROR') return `La connexion au service d’IA a échoué. ${kept} Vérifie la connexion Internet (ou que le serveur local est lancé), puis réessaie.`;
  if (code === 'AI_TIMEOUT' && details.stage === 'harmony') return `Le modèle n’a pas fini de préparer la proposition à temps (${Number.isFinite(details.timeoutSeconds) ? Math.round(details.timeoutSeconds) : 180} secondes). ${kept} Un passage plus court, ou un modèle plus rapide dans ${SETTINGS}, devrait aider.`;
  if (code === 'AI_TIMEOUT') return `Le service d’IA n’a pas répondu à temps (${Number.isFinite(details.timeoutSeconds) ? Math.round(details.timeoutSeconds) : 90} secondes). ${kept} Réessaie ; s’il est souvent aussi lent, choisis un autre modèle dans ${SETTINGS}.`;
  if (code === 'AI_CANCELLED') return `Tu as arrêté cette demande. ${kept} Tu peux la renvoyer quand tu veux.`;
  if (code === 'AI_REQUEST_TOO_LARGE' || code === 'AI_API_ERROR_413') return `La demande dépasse la taille autorisée par ce fournisseur. ${kept} Choisis un passage plus court, ou un modèle chez un autre fournisseur dans ${SETTINGS}.`;
  if (code === 'AI_API_ERROR_429') return `Le quota du service d’IA est atteint pour l’instant.${waitPhrase(details.waitSeconds)} ${kept} Réessaie plus tard, ou choisis un autre fournisseur dans ${SETTINGS}.`;
  if (code === 'AI_API_ERROR_402') return `Le fournisseur refuse la demande pour une limite de crédit ou de budget : ce n’est pas un problème de clé. ${kept} Vérifie ton compte chez ce fournisseur, ou choisis-en un autre dans ${SETTINGS}.`;
  if (/^AI_API_ERROR_5\d\d$/.test(code)) return `Le service d’IA a un problème de son côté. ${kept} Réessaie dans un moment ; si cela dure, choisis un autre modèle dans ${SETTINGS}.`;
  if (/clé API/i.test(code)) return `Aucune clé API n’est configurée. Ajoute-la dans ${SETTINGS}.`;
  // Jamais le texte brut d'une exception sous les yeux du pianiste : seulement un code court.
  const short = /^AI_[A-Z0-9_]{1,40}$/.test(code) ? code : 'erreur inattendue';
  return `Je n’ai pas pu répondre. ${kept} Réessaie ; si cela se répète, signale ce message (${short}).`;
}
