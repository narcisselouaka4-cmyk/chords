// [Claude] — 2026-10-03 — Pédagogie IA, lot 6 : envoyer un exemple du Copilote dans
// Exercices. Narcisse a choisi les « outils de travail » : ce que le Copilote vient de
// construire (les voicings du prof posés sur sa progression, ses accords de passage…)
// doit pouvoir se travailler ensuite.
//   - « Ajouter à Ma grille » : les accords de l'exemple, en grille Perso (16 au plus,
//     la limite des grilles enregistrées, practice-grids.js) ;
//   - « Ajouter aux Favoris » : chaque voicing exact de l'exemple (mains, notes), comme un
//     favori de l'Accord cible (practice-favorites.js).
// Les grilles et favoris vivent dans main.js : la carte du Copilote les lui envoie par
// évènement (exercise-save-grid, exercise-add-favorites). Pur et testé.

import { favoriteKey } from '../practice-favorites.js';
import { parseChordName } from './note-roles.js';

const MAX_GRID_CHORDS = 16;
const MAX_LABEL = 52;

/**
 * La grille d'un exemple (deux accords au moins), nommée d'après ses accords.
 * @param {{chords?: {name: string}[]}} example
 * @param {{prefix?: string}} [options] - début du nom (« Tuto », « Copilote »)
 * @returns {{name: string, chords: {name: string, top: null}[]}|null} prête pour upsertGrid
 */
export function gridFromExample(example, { prefix = 'Copilote' } = {}) {
  const names = (example?.chords || []).map((c) => String(c?.name || '').trim()).filter((n) => parseChordName(n)).slice(0, MAX_GRID_CHORDS);
  if (names.length < 2) return null;
  let label = names.join(' ');
  if (label.length > MAX_LABEL) label = `${label.slice(0, MAX_LABEL).replace(/\s+\S*$/, '')} …`;
  return { name: `${prefix} · ${label}`, chords: names.map((name) => ({ name, top: null })) };
}

/**
 * Les voicings exacts d'un exemple, en favoris de l'Accord cible (sans doublon ; deux
 * notes au moins par voicing).
 * @param {{chords?: {name: string, leftHand?: number[], rightHand?: number[], technique?: string}[]}} example
 * @param {{technique?: string}} [options] - libellé de la technique (« Voicing du prof »)
 * @returns {object[]}
 */
export function favoritesFromExample(example, { technique = '' } = {}) {
  const out = [];
  for (const c of example?.chords || []) {
    const chord = parseChordName(c?.name);
    const lh = (c?.leftHand || []).filter(Number.isInteger);
    const rh = (c?.rightHand || []).filter(Number.isInteger);
    if (!chord || lh.length + rh.length < 2) continue;
    const fav = {
      rootPc: chord.rootPc,
      quality: chord.quality,
      name: chord.name,
      lh,
      rh,
      technique: technique || c.technique || '',
      difficulty: null,
      doubled: [],
      addedLH: [],
      styleAdded: [],
      leftHandStyle: '',
      baseHasLeftHand: lh.length > 0,
    };
    fav.key = favoriteKey(fav);
    if (!out.some((f) => f.key === fav.key)) out.push(fav);
  }
  return out;
}
