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

/**
 * Liste des favoris : nom + technique, puis les notes main gauche | main droite.
 * @param {object[]} favorites
 * @param {{ techniqueLabels?: Record<string, string>, activeKey?: string|null }} [options]
 */
export function renderFavoritesList(favorites, { techniqueLabels = {}, activeKey = null } = {}) {
  if (favorites.length === 0) {
    return '<p class="exercise-favorites-empty">Aucun favori. Ajoutez le voicing affiché avec ☆ sur la carte.</p>';
  }
  const items = favorites.map((f) => {
    const hands = [f.lh, f.rh].filter((h) => h.length > 0).map((h) => h.map(noteWithOctave).join(' ')).join(' | ');
    const technique = techniqueLabels[f.technique] || f.technique;
    return `<li class="exercise-favorite${f.key === activeKey ? ' active' : ''}">
        <button type="button" class="exercise-favorite-open" data-favorite-open="${escapeHtml(f.key)}" title="Afficher ce voicing">
          <span class="exercise-favorite-name">${escapeHtml(f.name)}${technique ? ` <span class="exercise-favorite-technique">${escapeHtml(technique)}</span>` : ''}</span>
          <span class="exercise-favorite-notes">${escapeHtml(hands)}</span>
        </button>
        <button type="button" class="exercise-favorite-remove" data-favorite-remove="${escapeHtml(f.key)}" aria-label="Retirer ${escapeHtml(f.name)} des favoris" title="Retirer des favoris">✕</button>
      </li>`;
  }).join('');
  return `<ul class="exercise-favorites-list">${items}</ul>`;
}
