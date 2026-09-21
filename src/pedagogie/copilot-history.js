// [Claude] — 2026-09-09 — Copilot IA : historique multi-conversations.
//
// Chaque conversation possède un identifiant unique (`conv_<timestamp>`). Le
// fichier JSON porte ce nom. On conserve un lien vers le tutoriel d'origine
// (ou le mode autonome) dans le champ `tutorialPath` du fichier.
//
// Le stockage utilise `window.electronAPI.files` (IPC main). Il ne passe PAS
// par localStorage : un transcript long dépasserait rapidement la capacité du
// stockage local, et l'historique doit survivre aux changements de localStorage.
//
// Ce module est pur : il ne connaît ni le modèle, ni l'API IA, ni l'UI. Il
// lit/écrit une structure JSON stable.

import { getUserDataDir } from './tutorial-library.js';

export const STORAGE_VERSION = 2;
export const COPILOT_DIR_NAME = 'PedagogieCopilot';
export const AUTONOMOUS_HISTORY_KEY = '__copilot_autonomous__';

function generateConversationId() {
  return `conv_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/** Renvoie le chemin du dossier de persistance des conversations. */
async function getCopilotDir() {
  const home = await getUserDataDir();
  return `${home}/${COPILOT_DIR_NAME}`;
}

/** Renvoie le chemin absolu du fichier JSON pour un ID de conversation. */
export async function getHistoryFilePath(conversationId) {
  if (!conversationId) return null;
  const dir = await getCopilotDir();
  return `${dir}/${conversationId}.json`;
}

/** Assure que le dossier de stockage existe. */
async function ensureDir() {
  const api = typeof window !== 'undefined' ? window.electronAPI?.files : null;
  if (!api?.ensureDir) return false;
  try {
    await api.ensureDir(await getCopilotDir());
    return true;
  } catch (err) {
    console.warn('[CopilotHistory] Impossible de créer le dossier :', err);
    return false;
  }
}

/**
 * Crée une nouvelle conversation vide et retourne son ID.
 *
 * @param {string} tutorialPath - chemin du tutoriel ou AUTONOMOUS_HISTORY_KEY
 * @returns {Promise<string|null>}
 */
export async function createConversation(tutorialPath) {
  if (!tutorialPath) return null;
  if (!(await ensureDir())) return null;
  const conversationId = generateConversationId();
  const filePath = await getHistoryFilePath(conversationId);
  if (!filePath) return null;
  const payload = {
    version: STORAGE_VERSION,
    tutorialPath,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    messages: [],
  };
  const api = typeof window !== 'undefined' ? window.electronAPI?.files : null;
  if (!api?.writeFile) return null;
  try {
    await api.writeFile(filePath, payload);
    dispatchHistorySaved(tutorialPath);
    return conversationId;
  } catch (err) {
    console.warn('[CopilotHistory] Création impossible :', err);
    return null;
  }
}

function dispatchHistorySaved(tutorialPath) {
  if (typeof window !== 'undefined' && typeof document !== 'undefined' && document.dispatchEvent) {
    document.dispatchEvent(new CustomEvent('copilot-history-saved', { detail: { tutorialPath } }));
  }
}

/**
 * Charge une conversation par son ID.
 *
 * @param {string} conversationId
 * @returns {Promise<{conversationId: string, tutorialPath: string, messages: object[]}|null>}
 */
export async function loadHistory(conversationId) {
  if (!conversationId) return null;
  const api = typeof window !== 'undefined' ? window.electronAPI?.files : null;
  if (!api?.readFile) return null;
  const filePath = await getHistoryFilePath(conversationId);
  if (!filePath) return null;
  try {
    const raw = await api.readFile(filePath);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed.messages)) return null;
    return { conversationId, tutorialPath: parsed.tutorialPath || '', messages: parsed.messages };
  } catch (err) {
    if (err?.code === 'ENOENT' || err?.message?.includes('ENOENT')) return null;
    console.warn('[CopilotHistory] Chargement impossible :', err);
    return null;
  }
}

/**
 * Sauvegarde une conversation par son ID.
 *
 * @param {string} conversationId
 * @param {string} tutorialPath
 * @param {object[]} messages
 * @returns {Promise<boolean>}
 */
export async function saveHistory(conversationId, tutorialPath, messages) {
  if (!conversationId || !Array.isArray(messages)) return false;
  if (!(await ensureDir())) return false;
  const api = typeof window !== 'undefined' ? window.electronAPI?.files : null;
  if (!api?.writeFile) return false;
  const filePath = await getHistoryFilePath(conversationId);
  if (!filePath) return false;
  const payload = {
    version: STORAGE_VERSION,
    tutorialPath: tutorialPath || '',
    updatedAt: new Date().toISOString(),
    messages,
  };
  try {
    await api.writeFile(filePath, payload);
    dispatchHistorySaved(tutorialPath);
    return true;
  } catch (err) {
    console.warn('[CopilotHistory] Sauvegarde impossible :', err);
    return false;
  }
}

/**
 * Supprime toutes les conversations dont la liste de messages est vide.
 * Retourne le nombre de conversations supprimées.
 *
 * @returns {Promise<number>}
 */
export async function deleteEmptyConversations() {
  const all = await listAllConversations();
  let removed = 0;
  for (const item of all) {
    const history = await loadHistory(item.conversationId);
    const messages = history?.messages;
    if (!messages || messages.length === 0) {
      const ok = await deleteConversation(item.conversationId);
      if (ok) removed += 1;
    }
  }
  return removed;
}

/**
 * Supprime une conversation par son ID.
 *
 * @param {string} conversationId
 * @returns {Promise<boolean>}
 */
export async function deleteConversation(conversationId) {
  if (!conversationId) return false;
  const api = typeof window !== 'undefined' ? window.electronAPI?.files : null;
  if (!api?.deleteFile) return false;
  const filePath = await getHistoryFilePath(conversationId);
  if (!filePath) return false;
  try {
    await api.deleteFile(filePath);
    dispatchHistorySaved('');
    return true;
  } catch (err) {
    if (err?.code === 'ENOENT' || err?.message?.includes('ENOENT')) return true;
    console.warn('[CopilotHistory] Suppression impossible :', err);
    return false;
  }
}

/**
 * Liste toutes les conversations enregistrées dans le dossier Copilot.
 * Retourne les métadonnées (clé d'origine, date, premier aperçu) sans charger
 * tout le contenu de chaque fichier.
 *
 * @returns {Promise<{conversationId: string, tutorialPath: string, updatedAt: string|null, preview: string}[]>}
 */
export async function listAllConversations() {
  const api = typeof window !== 'undefined' ? window.electronAPI?.files : null;
  if (!api?.readDir) return [];
  const dir = await getCopilotDir();
  try {
    await ensureDir();
    const entries = await api.readDir(dir);
    const conversations = [];
    for (const entry of entries || []) {
      if (!entry.name?.endsWith('.json')) continue;
      const filePath = `${dir}/${entry.name}`;
      let updatedAt = null;
      let preview = '';
      let tutorialPath = '';
      try {
        const raw = await api.readFile(filePath);
        if (raw) {
          const parsed = JSON.parse(raw);
          updatedAt = parsed.updatedAt || null;
          tutorialPath = parsed.tutorialPath || '';
          const firstAssistant = parsed.messages?.find((m) => m.role === 'assistant' && !m.isTyping);
          preview = firstAssistant?.content?.slice(0, 60) || '';
        }
      } catch (_) {
        // Fichier illisible : on affiche quand même l'entrée, sans aperçu.
      }
      conversations.push({
        conversationId: entry.name.replace(/\.json$/, ''),
        tutorialPath,
        updatedAt,
        preview,
      });
    }
    return conversations.sort((a, b) => {
      if (!a.updatedAt) return 1;
      if (!b.updatedAt) return -1;
      return new Date(b.updatedAt) - new Date(a.updatedAt);
    });
  } catch (err) {
    console.warn('[CopilotHistory] Impossible de lister les conversations :', err);
    return [];
  }
}

/**
 * Détermine un libellé lisible pour une conversation.
 *
 * @param {string} tutorialPath
 * @returns {string}
 */
export function labelForConversationPath(tutorialPath) {
  if (!tutorialPath) return 'Conversation';
  if (tutorialPath === AUTONOMOUS_HISTORY_KEY) return 'Mode autonome';
  const name = tutorialPath.split('/').pop();
  return name || 'Tutoriel';
}

/**
 * Supprime l'ancien historique mono-conversation d'un tutoriel.
 * Utilisé pour la compatibilité ascendante : les anciens fichiers hashés sont
 * supprimés lors du premier chargement ; l'utilisateur peut alors créer une
 * nouvelle conversation multi-conversations.
 *
 * @param {string} tutorialPath
 * @returns {Promise<boolean>}
 */
export async function clearLegacyHistory(tutorialPath) {
  if (!tutorialPath || tutorialPath === AUTONOMOUS_HISTORY_KEY) return false;
  // Ancien nom de fichier : hash SHA-256 du chemin.
  const subtle = typeof window !== 'undefined' ? window.crypto?.subtle : crypto.subtle;
  const encoder = new TextEncoder();
  const hashBuffer = await subtle.digest('SHA-256', encoder.encode(tutorialPath));
  const bytes = new Uint8Array(hashBuffer);
  const hash = Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
  const dir = await getCopilotDir();
  const legacyPath = `${dir}/${hash}.json`;
  const api = typeof window !== 'undefined' ? window.electronAPI?.files : null;
  if (!api?.deleteFile) return false;
  try {
    await api.deleteFile(legacyPath);
    return true;
  } catch (err) {
    if (err?.code === 'ENOENT' || err?.message?.includes('ENOENT')) return true;
    console.warn('[CopilotHistory] Suppression legacy impossible :', err);
    return false;
  }
}
