// [Claude] — 2026-09-24 — Grilles enregistrées de l'onglet Exercice (Narcisse :
// « une fois la grille ajoutée, pouvoir carrément l'enregistrer […] une nouvelle
// catégorie Perso pour y stocker toutes nos grilles »).
//
// Une grille = un nom et ses accords, chacun avec sa note du dessus éventuelle
// (voice leading : intervalle depuis la fondamentale, transposé ton par ton).
// Persistées dans localStorage sous une clé propre ; le stockage est injecté,
// jamais atteint directement, pour rester testable en Node.

const STORAGE_KEY = 'piano-jazz-exercise-grids';
const MAX_GRIDS = 100;
const MAX_CHORDS = 16;

/** Nom normalisé pour comparer deux grilles (« Ma louange » = « ma louange  »). */
const sameName = (a, b) => String(a).trim().toLowerCase() === String(b).trim().toLowerCase();

/** Accord de grille valide : un nom, une note du dessus entière 0–11 ou rien. */
function cleanChord(c) {
  if (!c || typeof c.name !== 'string' || !c.name.trim()) return null;
  const top = Number.isInteger(c.top) && c.top >= 0 && c.top < 12 ? c.top : null;
  return { name: c.name.trim(), top };
}

/** Grille valide : identifiant, nom, au moins un accord. */
function cleanGrid(g) {
  if (!g || typeof g.id !== 'string' || typeof g.name !== 'string' || !g.name.trim() || !Array.isArray(g.chords)) return null;
  const chords = g.chords.map(cleanChord).filter(Boolean).slice(0, MAX_CHORDS);
  return chords.length > 0 ? { id: g.id, name: g.name.trim(), chords } : null;
}

/**
 * @param {Storage|null} storage
 * @returns {{id: string, name: string, chords: {name: string, top: number|null}[]}[]} du plus récent au plus ancien
 */
export function loadGrids(storage) {
  try {
    const parsed = JSON.parse(storage?.getItem(STORAGE_KEY) || '[]');
    return Array.isArray(parsed) ? parsed.map(cleanGrid).filter(Boolean) : [];
  } catch (_) {
    return [];
  }
}

/** @param {Storage|null} storage @param {object[]} grids */
export function saveGrids(storage, grids) {
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify(grids.slice(0, MAX_GRIDS)));
  } catch (_) {
    // Stockage indisponible ou plein : les grilles restent en mémoire pour la session.
  }
}

/**
 * Enregistre une grille : même nom = mise à jour (en tête de liste), sinon
 * nouvelle grille. `makeId` est injectable pour les tests.
 * @returns {{grids: object[], grid: object|null}}
 */
export function upsertGrid(grids, { name, chords }, makeId = () => `perso-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`) {
  const grid = cleanGrid({ id: 'tmp', name, chords });
  if (!grid) return { grids, grid: null };
  const existing = grids.find((g) => sameName(g.name, grid.name));
  const saved = { ...grid, id: existing ? existing.id : makeId() };
  return { grids: [saved, ...grids.filter((g) => g !== existing)].slice(0, MAX_GRIDS), grid: saved };
}

/** Grilles sans celle d'identifiant `id`. */
export function removeGrid(grids, id) {
  return grids.filter((g) => g.id !== id);
}
