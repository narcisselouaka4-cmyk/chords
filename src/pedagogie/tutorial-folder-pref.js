// [Claude] — 2026-09-06 — Pédagogie IA : dossier des tutoriels, réglage persistant.
//
// Le dossier où chercher les tutoriels .mp4 est CHOISI par l'utilisateur et
// codé nulle part : pas de chemin en dur, pas de valeur par défaut cachée.
// Persisté dans localStorage sous une clé propre, comme la configuration IA
// (openai-config.js) le fait pour la clé API.
//
// Ce module ne sait PAS lister un dossier — c'est tutorial-library.js. Il sait
// seulement lire, garder et effacer le réglage, de façon testable en Node :
// localStorage est injecté, jamais atteint directement.

const STORAGE_KEY = 'piano-jazz-tutorial-folder';
const CATEGORY_KEY = 'piano-jazz-tutorial-category';

/** Catégories de tutoriel connues. */
export const TUTORIAL_CATEGORIES = {
  TUTORIAL: 'tutorial', // tutoriel avec explications (ex: Gospel Harmony Secrets)
  COVER: 'cover',       // cover / interprétation (ex: Amazing Grace Gospel Piano)
};

/**
 * Lit le dossier configuré.
 * @param {Storage|null} storage - localStorage du navigateur, ou null en Node
 * @returns {string} chemin absolu, ou '' si rien n'est configuré
 */
export function getTutorialFolder(storage) {
  try {
    const raw = storage?.getItem(STORAGE_KEY);
    return typeof raw === 'string' ? raw.trim() : '';
  } catch (_) {
    return '';
  }
}

/**
 * Enregistre le dossier configuré. Une valeur vide efface le réglage.
 * @param {Storage|null} storage
 * @param {string} folderPath
 * @returns {string} le chemin effectivement conservé (délimité du blanc)
 */
export function saveTutorialFolder(storage, folderPath) {
  const clean = typeof folderPath === 'string' ? folderPath.trim() : '';
  try {
    if (clean) storage?.setItem(STORAGE_KEY, clean);
    else storage?.removeItem(STORAGE_KEY);
  } catch (_) { /* stockage indisponible : on rend la valeur quand même */ }
  return clean;
}

/**
 * Lit la catégorie associée à un fichier vidéo.
 *
 * Le choix est lié au CHEMIN ABSOLU du fichier, pas à un identifiant interne :
  * un fichier déplacé perd son réglage, et c'est le comportement attendu.
 *
 * @param {Storage|null} storage
 * @param {string} filePath
 * @returns {string|null} une valeur de TUTORIAL_CATEGORIES, ou null si non classé
 */
export function getTutorialCategory(storage, filePath) {
  if (!filePath) return null;
  try {
    const raw = storage?.getItem(CATEGORY_KEY);
    const all = raw ? JSON.parse(raw) : {};
    const cat = all[filePath];
    return Object.values(TUTORIAL_CATEGORIES).includes(cat) ? cat : null;
  } catch (_) {
    return null;
  }
}

/**
 * Enregistre la catégorie d'un fichier vidéo.
 *
 * @param {Storage|null} storage
 * @param {string} filePath
 * @param {string|null} category - valeur de TUTORIAL_CATEGORIES, ou null pour effacer
 * @returns {string|null}
 */
export function saveTutorialCategory(storage, filePath, category) {
  if (!filePath) return null;
  const cat = Object.values(TUTORIAL_CATEGORIES).includes(category) ? category : null;
  try {
    const raw = storage?.getItem(CATEGORY_KEY);
    const all = raw ? JSON.parse(raw) : {};
    if (cat) all[filePath] = cat;
    else delete all[filePath];
    storage?.setItem(CATEGORY_KEY, JSON.stringify(all));
  } catch (_) { /* silencieux */ }
  return cat;
}