// [Claude] — 2026-10-03 — Pédagogie IA : la plage dont on parle au Copilote, choisie sans
// rien taper.
//
// Narcisse : « pour la sélection du passage, ce n'est vraiment pas optimal de devoir définir
// une région en secondes […] je veux pouvoir le sélectionner manuellement, mais sans avoir à
// taper du texte, des tirets ou des zéros. Il faudrait des champs présélectionnés (heures,
// minutes de 0 à 59) », puis « une minute, c'est trop court : il faudrait que ce soit nous
// qui puissions choisir cette plage ». Son choix : 10 minutes au plus.
//
// Fonctions pures, testées dans test-passage-range.js. L'écran (src/ui/pedagogie-tab.js) en
// tire ses listes Début / Fin et ses bornes.

/** Une plage dure 10 minutes au plus (choix de Narcisse). */
export const MAX_PASSAGE_SECONDS = 600;
/** Avant tout choix, la plage suit la vidéo : les 30 dernières secondes. */
export const FOLLOW_SECONDS = 30;
/** Une plage dure au moins une seconde. */
export const MIN_PASSAGE_SECONDS = 1;

const finite = (n) => Number.isFinite(n);

/** Secondes → heures, minutes, secondes (entières). */
export function splitTime(seconds) {
  const total = Math.max(0, Math.floor(Number(seconds) || 0));
  return { h: Math.floor(total / 3600), m: Math.floor((total % 3600) / 60), s: total % 60 };
}

/** Heures, minutes, secondes → secondes. */
export function joinTime({ h = 0, m = 0, s = 0 } = {}) {
  return Math.max(0, (Number(h) || 0) * 3600 + (Number(m) || 0) * 60 + (Number(s) || 0));
}

/**
 * Les choix des listes, d'après la durée de la vidéo : les heures n'apparaissent que pour
 * une vidéo d'une heure ou plus ; minutes de 0 à 59 (jusqu'à la dernière minute de la vidéo
 * si elle dure moins d'une heure) ; secondes de 0 à 59.
 * @param {number} duration
 * @returns {{hours: number[], minutes: number[], seconds: number[]}}
 */
export function timeOptions(duration) {
  const d = finite(duration) && duration > 0 ? duration : 0;
  const range = (n) => Array.from({ length: n + 1 }, (_, i) => i);
  const long = d >= 3600;
  return {
    hours: long ? range(Math.floor(d / 3600)) : [],
    minutes: long ? range(59) : range(Math.floor(d / 60)),
    seconds: range(59),
  };
}

/**
 * Change un bord de la plage. Le début reste avant la fin (d'une seconde au moins), la plage
 * dure 10 minutes au plus et reste dans la vidéo : l'autre bord suit au besoin, et
 * `adjusted` dit lequel a bougé (l'écran le dit au pianiste).
 * @param {{start: number, end: number}} range
 * @param {'start'|'end'} edge
 * @param {number} seconds
 * @param {number} [duration]
 * @returns {{start: number, end: number, adjusted: 'start'|'end'|null}}
 */
export function setRangeBound(range, edge, seconds, duration = Infinity) {
  const limit = finite(duration) && duration > 0 ? duration : Infinity;
  const clampTime = (t) => Math.min(Math.max(0, Math.floor(Number(t) || 0)), limit);
  let start = clampTime(range?.start ?? 0);
  let end = clampTime(range?.end ?? start + FOLLOW_SECONDS);
  let adjusted = null;
  if (edge === 'start') {
    start = clampTime(seconds);
    if (finite(limit) && start > limit - MIN_PASSAGE_SECONDS) start = Math.max(0, Math.floor(limit - MIN_PASSAGE_SECONDS));
    if (end < start + MIN_PASSAGE_SECONDS) { end = Math.min(limit, start + FOLLOW_SECONDS); adjusted = 'end'; }
    if (end - start > MAX_PASSAGE_SECONDS) { end = start + MAX_PASSAGE_SECONDS; adjusted = 'end'; }
  } else {
    end = clampTime(seconds);
    if (end < MIN_PASSAGE_SECONDS) end = Math.min(limit, MIN_PASSAGE_SECONDS);
    if (end < start + MIN_PASSAGE_SECONDS) { start = Math.max(0, end - FOLLOW_SECONDS); adjusted = 'start'; }
    if (end - start > MAX_PASSAGE_SECONDS) { start = end - MAX_PASSAGE_SECONDS; adjusted = 'start'; }
  }
  return { start, end, adjusted };
}

/** « 1:45 », « 10:00 », « 1:02:05 » : la durée d'une plage. */
export function rangeLength(range) {
  const length = Math.max(0, Math.round((range?.end ?? 0) - (range?.start ?? 0)));
  const { h, m, s } = splitTime(length);
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}
