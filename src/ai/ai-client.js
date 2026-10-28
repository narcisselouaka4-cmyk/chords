// [OpenCode] — 2026-07-04 — Client API IA (explication et traduction de narration).
// Compatible OpenAI (Groq, OpenRouter, Google AI Studio, etc.).
// La clé est cherchée dans :
//   1. localStorage (via openai-config.js / modal UI)
//   2. window.electronAPI.env.IA_API_KEY (exposé par preload depuis .env)
//
// 2026-10-28 — generateReharmonization et generateMasterclass (et leurs
// aides) sont retirées avec les sous-onglets Réharmonisation et
// Masterclass ; seuls les appels de narration restent.

import { getAIConfig, callChatCompletions } from './openai-config.js';

function getApiConfig() {
  const local = getAIConfig();
  if (local.apiKey) return local;

  // Fallback : variable d'environnement exposée par le preload Electron
  try {
    const envKey = window.electronAPI?.env?.IA_API_KEY;
    const envBaseUrl = window.electronAPI?.env?.IA_BASE_URL;
    const envModel = window.electronAPI?.env?.IA_MODEL;
    if (envKey) {
      return {
        baseUrl: envBaseUrl || 'https://api.groq.com/openai/v1',
        apiKey: envKey,
        model: envModel || 'llama-3.1-8b-instant',
      };
    }
  } catch (e) { /* window.electronAPI non disponible */ }

  return null;
}

const RETRY_DELAYS = [1000, 3000, 9000];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── Pédagogie IA : approfondir ce que dit le professeur ──
//
// FACULTATIF, ET JAMAIS LE COMPORTEMENT PAR DÉFAUT. La transcription brute est
// toujours affichée seule ; cette fonction ne fait qu'ajouter une reformulation
// quand une clé personnelle est configurée. Sans clé : `null` immédiat, aucun
// appel réseau, l'écran garde le texte transcrit tel quel.
//
// Ce que l'IA a le droit de faire ici : reformuler et remettre en contexte ce
// que le professeur a DIT, en s'appuyant sur les accords que l'application a
// RELEVÉS. Ce qu'elle n'a pas le droit de faire : recalculer un accord ou
// ajouter un conseil qui ne serait pas dans la vidéo — c'est la même règle que
// pour les fiches du glossaire (voir src/pedagogie/glossary.js).

// [Claude] — 2026-09-25 — Un assistant qui aide un pianiste (Narcisse : « on reste un assistant, pas un coach »).
const NARRATION_SYSTEM_PROMPT = 'Tu es un assistant musical (piano jazz et gospel) qui aide un pianiste à '
  + "comprendre un tutoriel vidéo. On te donne la TRANSCRIPTION de ce que dit le professeur dans la "
  + "vidéo, et la GRILLE D'ACCORDS que l'application a relevée sur la même vidéo.\n\n"
  + 'Ta tâche : expliquer avec des mots simples, en français, ce que le professeur enseigne — les '
  + "conseils qu'il donne, ce qu'il demande de travailler, et le lien avec les accords relevés.\n\n"
  + "RÈGLES STRICTES :\n"
  + "- Ne parle QUE de ce qui est dans la transcription et dans la grille fournies.\n"
  + "- N'invente aucun conseil, aucun accord, aucune note qui ne s'y trouve pas.\n"
  + "- Si la transcription est trop courte ou trop confuse pour en tirer quelque chose, dis-le "
  + "franchement en une phrase plutôt que de meubler.\n"
  + '- Réponds en texte BRUT, sans Markdown (pas d\'astérisques, pas de dièse, pas de tirets de liste), '
  + 'court (10 lignes maximum), sans JSON et sans titre.';

async function fetchNarrationExplanation(config, userPrompt) {
  const response = await callChatCompletions(config.baseUrl, config.apiKey, {
    model: config.model,
    messages: [
      { role: 'system', content: NARRATION_SYSTEM_PROMPT },
      { role: 'user', content: userPrompt },
    ],
    max_tokens: 900,
    temperature: 0.3,
  }, { timeoutMs: 30000 });

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new Error('AI_API_KEY_INVALID');
    } else if (response.status === 429) {
      throw new Error('AI_RATE_LIMIT');
    }
    throw new Error(`AI_API_ERROR_${response.status}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;
  const text = typeof content === 'string' ? content.trim() : '';
  return text || null;
}

/**
 * Reformule et met en contexte ce que le professeur explique dans la vidéo.
 *
 * @param {string} segmentText - transcription (un passage, ou le texte suivi)
 * @param {object} [context]
 * @param {string} [context.key] - tonalité relevée
 * @param {string[]} [context.chords] - accords relevés, dans l'ordre
 * @param {string} [context.source] - 'video' (lu à l'image) ou 'audio' (lu au son)
 * @returns {Promise<string|null>} l'explication, ou null si aucune clé n'est
 *          configurée, si le texte est vide, ou si l'appel échoue
 */
export async function explainNarration(segmentText, context = {}) {
  const text = typeof segmentText === 'string' ? segmentText.trim() : '';
  if (!text) return null;

  const config = getApiConfig();
  if (!config) return null;

  const chords = Array.isArray(context.chords) ? context.chords.filter(Boolean) : [];
  const sourceLine = context.source === 'video'
    ? "Les accords ont été lus sur le clavier affiché à l'image."
    : 'Les accords viennent de l\'analyse du son, pas de l\'image.';

  const userPrompt = `Transcription de la vidéo :\n${text}\n\n`
    + `Grille relevée par l'application${context.key ? ` (tonalité : ${context.key})` : ''} : `
    + `${chords.length ? chords.join(' — ') : 'aucun accord relevé'}\n`
    + `${sourceLine}\n\n`
    + "Explique au pianiste ce que le professeur enseigne dans ce passage.";

  let lastErr = null;
  for (let attempt = 0; attempt <= RETRY_DELAYS.length; attempt++) {
    try {
      const result = await fetchNarrationExplanation(config, userPrompt);
      if (result) return result;
    } catch (err) {
      lastErr = err;
      if (err.message === 'AI_API_KEY_INVALID') {
        console.error('[AI] Clé API invalide ou refusée.');
        throw err;
      }
      if (attempt < RETRY_DELAYS.length) {
        console.warn(`[AI] Explication tentative ${attempt + 1} échouée (${err.message}). Retry dans ${RETRY_DELAYS[attempt]}ms...`);
        await sleep(RETRY_DELAYS[attempt]);
      }
    }
  }

  // Pas de repli fabriqué : il n'existe aucune
  // bibliothèque locale capable de dire ce que CE professeur a expliqué. Le
  // repli, c'est la transcription brute — déjà affichée à l'écran.
  console.warn('[AI] Explication de la narration indisponible :', lastErr?.message);
  return null;
}

// ── Pédagogie IA : traduction automatique du transcript ──
//
// Narcisse ne parle pas anglais ; faster-whisper détection automatique laisse
// la transcription dans la langue de la vidéo. Décision prise avec lui le
// 06/09 : traduire en français QUAND une clé personnelle est configurée.
// Sans clé, le texte brut dans la langue source reste le comportement par
// défaut — ce n'est pas une nouvelle exigence posée sur la fonction de base.
//
// Même patron qu'explainNarration : null immédiat sans clé, pas de repli
// inventé (une traduction ratée retombe sur le texte original, montré par
// l'appelant), mêmes erreurs nommées 401/403 et 429.

const NARRATION_TRANSLATION_PROMPT = 'Tu traduis la transcription d\'un tutoriel de piano. '
  + 'Traduis chaque passage en français, dans l\'ordre, sans rien ajouter ni retirer — '
  + 'ni titre, ni numérotation, ni commentaire. Un passage par ligne, autant de lignes '
  + 'que de passages fournis, même si un passage est vide.\n'
  + 'Conserve le vocabulaire musical tel quel (accords, notes, techniques). '
  + 'Si un passage est inintelligible, recopie-le tel quel plutôt que de l\'inventer.';

/**
 * Appel réseau de la traduction. Réutilise la mise en forme et la gestion
 * d'erreurs de fetchNarrationExplanation : 401/403 et 429 y sont nommées.
 */
async function fetchNarrationTranslation(config, userPrompt, maxSegments) {
  const response = await callChatCompletions(config.baseUrl, config.apiKey, {
    model: config.model,
    messages: [
      { role: 'system', content: NARRATION_TRANSLATION_PROMPT },
      { role: 'user', content: userPrompt },
    ],
    max_tokens: Math.min(4000, Math.max(500, maxSegments * 90)),
    temperature: 0.2,
  }, { timeoutMs: 30000 });

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new Error('AI_API_KEY_INVALID');
    } else if (response.status === 429) {
      throw new Error('AI_RATE_LIMIT');
    }
    throw new Error(`AI_API_ERROR_${response.status}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;
  const text = typeof content === 'string' ? content.trim() : '';
  return text || null;
}

/**
 * Traduit les passages parlés dans la langue cible.
 *
 * Le nombre de lignes renvoyées est vérifié contre le nombre de passages
 * envoyés : une traduction qui ne compte plus les passages est une traduction
 * dont la synchronisation avec les horodatages est perdue. Elle est rejetée
 * en bloc — l'appelant retombe sur le texte original, qui est toujours juste.
 *
 * @param {{start: number, end: number, text: string}[]} segments
 * @param {object} [options]
 * @param {string} [options.targetLang] - 'fr' par défaut
 * @param {string} [options.sourceLang] - langue détectée, purement informative
 * @returns {Promise<string[]|null>} un texte traduit par passage, ou null si
 *          aucune clé n'est configurée, s'il n'y a rien à traduire, si l'appel
 *          échoue ou si la réponse ne compte pas les passages
 */
export async function translateNarrationSegments(segments, options = {}) {
  const list = (Array.isArray(segments) ? segments : [])
    .map((s) => (typeof s?.text === 'string' ? s.text.trim() : ''))
    .filter((t) => t.length > 0);
  if (list.length === 0) return null;

  const config = getApiConfig();
  if (!config) return null;

  const targetLang = options.targetLang || 'fr';
  const userPrompt = `Langue source détectée : ${options.sourceLang || 'inconnue'}.\n`
    + `Langue cible : ${targetLang}.\n\n`
    + `${list.map((t) => `>>> ${t.replace(/\n/g, ' ')}`).join('\n')}\n\n`
    + 'Traduis chaque ligne ci-dessus, une pour une.';

  let lastErr = null;
  for (let attempt = 0; attempt <= RETRY_DELAYS.length; attempt++) {
    try {
      const result = await fetchNarrationTranslation(config, userPrompt, list.length);
      if (result) {
        const lines = result.split('\n').map((l) => l.trim()).filter(Boolean);
        // La traduction doit compter exactement les passages envoyés, sinon la
        // correspondance texte ↔ horodatage est perdue : on ne l'affiche pas.
        if (lines.length === list.length) return lines;
        console.warn(`[AI] Traduction rejetée : ${lines.length} lignes pour ${list.length} passages.`);
      }
    } catch (err) {
      lastErr = err;
      if (err.message === 'AI_API_KEY_INVALID') {
        console.error('[AI] Clé API invalide ou refusée.');
        throw err;
      }
      if (attempt < RETRY_DELAYS.length) {
        console.warn(`[AI] Traduction tentative ${attempt + 1} échouée (${err.message}). Retry dans ${RETRY_DELAYS[attempt]}ms...`);
        await sleep(RETRY_DELAYS[attempt]);
      }
    }
  }

  // Pas de repli inventé : l'appelant garde le texte original, qui est exact.
  console.warn('[AI] Traduction de la narration indisponible :', lastErr?.message);
  return null;
}

