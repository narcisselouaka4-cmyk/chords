// [Claude] — 2026-09-24 — Voicings favoris de l'onglet Exercice.
//
// Un favori garde le voicing EXACT affiché (mains, notes ajoutées) : on y
// revient sans reconfigurer les filtres ni se souvenir de l'accord.
// Persisté dans localStorage sous une clé propre ; le stockage est injecté,
// jamais atteint directement, pour rester testable en Node.

import { noteName } from './chord-engine/naming.js';

const STORAGE_KEY = 'piano-jazz-exercise-favorites';
const MAX_FAVORITES = 200;

/** Clé d'identité : même accord, mêmes notes, même répartition des mains. */
export function favoriteKey({ rootPc, quality, lh, rh }) {
  return `${rootPc}|${quality}|${lh.join(',')}|${rh.join(',')}`;
}

/**
 * Favori construit depuis la cible affichée par l'exercice.
 * @param {object} target - state.target (type 'chord')
 * @returns {object|null}
 */
export function favoriteFromTarget(target) {
  const v = target?.voicing;
  if (!target || !v) return null;
  const fav = {
    rootPc: target.rootPc,
    quality: target.symbol,
    name: target.name,
    lh: [...(v.leftHand || [])],
    rh: [...(v.rightHand || [])],
    technique: v.technique || '',
    difficulty: v.difficulty ?? null,
    doubled: [...(v.doubled || [])],
    addedLH: [...(v.addedLH || [])],
  };
  return { ...fav, key: favoriteKey(fav) };
}

/** Favori valide : champs indispensables présents et bien typés. */
function isValidFavorite(f) {
  return f && Number.isInteger(f.rootPc) && typeof f.quality === 'string' && typeof f.name === 'string'
    && Array.isArray(f.lh) && Array.isArray(f.rh) && f.lh.length + f.rh.length > 0
    && [...f.lh, ...f.rh].every(Number.isInteger);
}

/**
 * @param {Storage|null} storage
 * @returns {object[]} favoris, du plus récent au plus ancien
 */
export function loadFavorites(storage) {
  try {
    const parsed = JSON.parse(storage?.getItem(STORAGE_KEY) || '[]');
    return Array.isArray(parsed)
      ? parsed.filter(isValidFavorite).map((f) => ({ ...f, key: favoriteKey(f) }))
      : [];
  } catch (_) {
    return [];
  }
}

/** @param {Storage|null} storage @param {object[]} favorites */
export function saveFavorites(storage, favorites) {
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify(favorites.slice(0, MAX_FAVORITES)));
  } catch (_) {
    // Stockage indisponible ou plein : les favoris restent en mémoire pour la session.
  }
}

/**
 * Ajoute le favori s'il est absent (en tête), le retire s'il est présent.
 * @returns {object[]} nouvelle liste
 */
export function toggleFavorite(favorites, fav) {
  if (!fav) return favorites;
  return favorites.some((f) => f.key === fav.key)
    ? favorites.filter((f) => f.key !== fav.key)
    : [fav, ...favorites].slice(0, MAX_FAVORITES);
}

export function removeFavorite(favorites, key) {
  return favorites.filter((f) => f.key !== key);
}

const noteWithOctave = (midi) => `${noteName(midi)}${Math.floor(midi / 12) - 1}`;

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Remet un favori retiré à sa place d'origine (Annuler). */
export function restoreFavorite(favorites, fav, index = 0) {
  if (!fav || favorites.some((f) => f.key === fav.key)) return favorites;
  const at = Math.max(0, Math.min(index, favorites.length));
  return [...favorites.slice(0, at), fav, ...favorites.slice(at)].slice(0, MAX_FAVORITES);
}

/**
 * Annule plusieurs retraits successifs : du plus récent au plus ancien, chaque
 * favori reprend l'index qu'il avait au moment de son retrait.
 * @param {{fav: object, index: number}[]} removals - dans l'ordre des retraits
 */
export function restoreFavorites(favorites, removals) {
  return [...removals].reverse().reduce((list, r) => restoreFavorite(list, r.fav, r.index), favorites);
}

// Noms en bémols : « Bb » doit trouver A#m7b5, « Eb » D#maj7…
const FLAT_ROOTS = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

/** Vrai si le favori correspond à la recherche (nom en dièses ou bémols, technique). */
export function favoriteMatches(f, query, techniqueLabels = {}) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return true;
  const technique = techniqueLabels[f.technique] || f.technique || '';
  const haystack = [f.name, `${FLAT_ROOTS[f.rootPc] || ''}${f.quality}`, technique].join(' ').toLowerCase();
  return q.split(/\s+/).every((word) => haystack.includes(word));
}

/**
 * Favoris regroupés par accord, dans l'ordre des notes (C, C#, D…) puis des
 * qualités ; dans un groupe, du plus récent au plus ancien.
 */
export function groupFavorites(favorites) {
  const groups = new Map();
  for (const f of favorites) {
    const id = `${f.rootPc}|${f.quality}`;
    if (!groups.has(id)) groups.set(id, { rootPc: f.rootPc, quality: f.quality, name: f.name, items: [] });
    groups.get(id).items.push(f);
  }
  return [...groups.values()].sort((a, b) => a.rootPc - b.rootPc || a.quality.localeCompare(b.quality));
}

/**
 * Liste des favoris groupés par accord : technique puis notes main gauche |
 * main droite. `removed` (liste) affiche le bandeau « … retiré(s) — Annuler ».
 * @param {object[]} favorites
 * @param {{ techniqueLabels?: Record<string, string>, activeKey?: string|null, query?: string, removed?: object|null }} [options]
 */
export function renderFavoritesList(favorites, { techniqueLabels = {}, activeKey = null, query = '', removed = [] } = {}) {
  // `removed` : favoris retirés récemment (un ou plusieurs), annulables d'un coup.
  const list = Array.isArray(removed) ? removed : (removed ? [removed] : []);
  const label = list.length === 1 ? `${escapeHtml(list[0].name)} retiré des favoris` : `${list.length} favoris retirés`;
  const undo = list.length > 0
    ? `<div class="exercise-favorites-undo" role="status">${label} <button type="button" data-favorite-undo>Annuler</button></div>`
    : '';
  if (favorites.length === 0) {
    return `${undo}<p class="exercise-favorites-empty">Aucun favori. Ajoutez le voicing affiché avec ☆ sur la carte.</p>`;
  }
  const shown = favorites.filter((f) => favoriteMatches(f, query, techniqueLabels));
  if (shown.length === 0) {
    return `${undo}<p class="exercise-favorites-empty">Aucun favori ne correspond à « ${escapeHtml(query.trim())} ».</p>`;
  }
  const groups = groupFavorites(shown).map((g) => {
    const items = g.items.map((f) => {
      const hands = [f.lh, f.rh].filter((h) => h.length > 0).map((h) => h.map(noteWithOctave).join(' ')).join(' | ');
      const technique = techniqueLabels[f.technique] || f.technique || 'Voicing';
      return `<li class="exercise-favorite${f.key === activeKey ? ' active' : ''}">
        <button type="button" class="exercise-favorite-open" data-favorite-open="${escapeHtml(f.key)}" title="Afficher ce voicing">
          <span class="exercise-favorite-technique">${escapeHtml(technique)}</span>
          <span class="exercise-favorite-notes">${escapeHtml(hands)}</span>
        </button>
        <button type="button" class="exercise-favorite-remove" data-favorite-remove="${escapeHtml(f.key)}" aria-label="Retirer ${escapeHtml(f.name)} (${escapeHtml(technique)}) des favoris" title="Retirer des favoris">✕</button>
      </li>`;
    }).join('');
    return `<li class="exercise-favorites-group">
        <span class="exercise-favorites-group-name">${escapeHtml(g.name)} <span>${g.items.length}</span></span>
        <ul class="exercise-favorites-list">${items}</ul>
      </li>`;
  }).join('');
  return `${undo}<ul class="exercise-favorites-groups">${groups}</ul>`;
}
