// [OpenCode] — 2026-08-07 — Lot B : formatage partagé et robuste de la durée
// média pour les onglets Studio et Analyse. Aucune dépendance, vanilla JS.
//
// Objectif :
//   - ne JAMAIS afficher NaN, Infinity, ni de valeurs négatives ;
//   - utiliser une seule fonction de formatage pour le temps courant et la
//     durée totale (cohérence d’affichage) ;
//   - retourner '00:00' uniquement lorsque la durée est réellement indisponible
//     (nulle, non finie ou négative), jamais rester bloqué sur 00:00 quand une
//     durée valide est disponible.
//
// Cette fonction est pure et déterministe : aucun effet de bord, aucun accès DOM.

/**
 * Formate une durée en secondes en « MM:SS ». Retourne '00:00' pour toute valeur
 * non finie, négative ou non numérique. Les très grandes valeurs sont bornées
 * à 99:59:59 maximum pour éviter toute représentation absurde.
 *
 * @param {number} seconds
 * @returns {string}
 */
export function formatMediaDuration(seconds) {
  const n = Number(seconds);
  if (!Number.isFinite(n) || n < 0) return '00:00';
  const total = Math.floor(n);
  if (total === 0) return '00:00';
  // Bornage défensif : on n’affiche jamais plus de 99h59m59s.
  const capped = Math.min(total, 359999);
  const h = Math.floor(capped / 3600);
  const m = Math.floor((capped % 3600) / 60);
  const s = capped % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  if (h > 0) {
    const hh = String(h).padStart(2, '0');
    return `${hh}:${mm}:${ss}`;
  }
  return `${mm}:${ss}`;
}

/**
 * Retourne true si la valeur est une durée média valide (finie, positive).
 * Utilisé par les appelants pour décider s’ils doivent rafraîchir l’affichage.
 *
 * @param {number} seconds
 * @returns {boolean}
 */
export function isValidMediaDuration(seconds) {
  const n = Number(seconds);
  return Number.isFinite(n) && n > 0;
}