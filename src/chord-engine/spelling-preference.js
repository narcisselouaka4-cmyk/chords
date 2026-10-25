// [Claude] — 2026-10-25 — Le réglage d'orthographe des accords.
//
// Narcisse : « fait un réglage ». Deux conventions s'opposaient dans l'app, et
// aucune n'était la bonne partout. Sessions MIDI écrivait tout en bémols,
// l'onglet Analyse tout en dièses : sa session du 25/10 en do majeur sortait
// « G#maj7 A# C# C#7#9 » là où un pianiste écrit « Abmaj7 Bb Db Db7#9 ». Mais
// lui pense et écrit en dièses (« ré dièse majeur », « La#7 bémol 9 »).
//
// D'où trois valeurs, et non deux :
//   auto    — la convention jazz, par famille d'accord (spelling.js) : bémols
//             pour les majeurs et les dominantes, dièses pour les diminués.
//   sharps  — tout en dièses, la convention de Narcisse.
//   flats   — tout en bémols.
//
// Module pur côté lecture/écriture ; le stockage est celui du navigateur, et
// son absence (Node, mode privé) ne doit jamais faire échouer l'appelant.

import { SPELLINGS } from './spelling.js';

export const SPELLING_STORAGE_KEY = 'pjc.chords.spelling';
export const DEFAULT_SPELLING = 'auto';

/** Les trois valeurs, avec leur libellé d'interface. */
export const SPELLING_OPTIONS = [
  { value: 'auto', label: 'Automatique (A♭maj7, C♯°7)' },
  { value: 'sharps', label: 'Dièses (G♯maj7, A♯7)' },
  { value: 'flats', label: 'Bémols (A♭maj7, B♭7)' },
];

/** La valeur si elle est connue, sinon la valeur par défaut. */
export function normalizeSpelling(value) {
  return SPELLINGS.includes(value) ? value : DEFAULT_SPELLING;
}

/** L'orthographe choisie, ou « auto » si rien n'est enregistré. */
export function readSpelling(storage = globalThis.localStorage) {
  try {
    return normalizeSpelling(storage?.getItem(SPELLING_STORAGE_KEY));
  } catch {
    return DEFAULT_SPELLING;
  }
}

/** Enregistre le choix. Retourne la valeur retenue. */
export function writeSpelling(value, storage = globalThis.localStorage) {
  const spelling = normalizeSpelling(value);
  try {
    storage?.setItem(SPELLING_STORAGE_KEY, spelling);
  } catch {
    // Stockage indisponible : le choix vaut pour la séance, sans être gardé.
  }
  return spelling;
}
