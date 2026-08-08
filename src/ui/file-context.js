// [OpenCode] — 2026-08-07 — Lot B : libellés de contexte fichier pour les onglets
// Studio et Analyse. Fonctions pures, testables sans DOM.
//
// Objectif :
//   - expliciter QUEL fichier est actuellement chargé dans quel onglet
//     (« Fichier du Studio » vs « Fichier analysé ») ;
//   - afficher le nom réel du fichier actif ;
//   - fournir un état vide explicite quand aucun fichier n’est chargé ;
//   - ne jamais laisser croire qu’un changement d’onglet transfère le média :
//     chaque onglet reste indépendant et son contexte le rappelle.

export const STUDIO_FILE_LABEL = 'Fichier du Studio';
export const ANALYZER_FILE_LABEL = 'Fichier analysé';

export const STUDIO_EMPTY_FILE_TEXT = 'Aucun fichier chargé dans le Studio';
export const ANALYZER_EMPTY_FILE_TEXT = 'Aucun fichier analysé';

/**
 * Construit le texte de contexte pour un onglet donné.
 * Garantit qu’aucun libellé ne prête à confusion entre les deux onglets.
 *
 * @param {{ tab: 'studio' | 'analyzer', fileName: string }} params
 * @returns {string}
 */
export function buildFileContextText({ tab, fileName }) {
  const label = tab === 'studio' ? STUDIO_FILE_LABEL : ANALYZER_FILE_LABEL;
  const emptyText = tab === 'studio' ? STUDIO_EMPTY_FILE_TEXT : ANALYZER_EMPTY_FILE_TEXT;
  const name = String(fileName || '').trim();
  if (!name) {
    return `${label} : ${emptyText}`;
  }
  return `${label} : ${name}`;
}
