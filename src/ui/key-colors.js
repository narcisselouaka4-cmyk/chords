// [Claude] — 2026-09-25 — Couleur des touches allumées : qui joue ?
//
// Narcisse : « Actuellement, elles s'affichent en bleu ; quand Copilot joue, il
// faudrait que ce soit dans une autre couleur. » Il a choisi le jaune, pour tout
// ce que l'application joue : exemples du Copilote, démos des Exercices,
// relecture de ses sessions. Une seule règle : bleu = tes doigts, jaune = l'app.
//
// La touche garde la classe `active` (sa couleur réglée dans le pied de page,
// bleue par défaut) ; `is-app` la passe en jaune (style.css). Le pianiste qui
// joue lui-même une touche jaune la repasse en bleu.
// Module sans état et sans DOM propre : main.js lui donne l'élément de la touche.

export const APP_KEY_CLASS = 'is-app';

/**
 * Allume une touche.
 * @param {{classList: DOMTokenList}|null} key - élément <g id="note-N">
 * @param {boolean} fromApp - c'est l'application qui la joue
 */
export function lightKeyElement(key, fromApp) {
  if (!key?.classList) return;
  key.classList.add('active');
  key.classList.toggle(APP_KEY_CLASS, Boolean(fromApp));
}

/**
 * Éteint une touche, quelle que soit la source qui la jouait.
 * @param {{classList: DOMTokenList}|null} key
 */
export function unlightKeyElement(key) {
  if (!key?.classList) return;
  key.classList.remove('active', APP_KEY_CLASS);
}

const HEX = /^#[0-9a-f]{6}$/i;

/** Jaune d'origine de « ce que joue l'application » (style.css : --kb-app). */
export const DEFAULT_APP_KEY_COLOR = '#f2b705';

/**
 * [Claude] — 2026-10-13 — Quelle couleur pour ce que joue l'application ?
 * 1. celle que le pianiste a réglée lui-même (pastille « L'app » de la légende) : elle gagne toujours ;
 * 2. sinon, la couleur de l'application choisie dans Réglages (rose, vert…) : les touches de
 *    l'application la suivent ;
 * 3. sinon, le jaune d'origine (l'application est restée en violet d'origine).
 * @param {{custom?: string|null, accent?: string|null}} colors
 * @returns {{color: string, source: 'custom'|'accent'|'default'}}
 */
export function resolveAppKeyColor({ custom = null, accent = null } = {}) {
  if (typeof custom === 'string' && HEX.test(custom)) return { color: custom, source: 'custom' };
  if (typeof accent === 'string' && HEX.test(accent)) return { color: accent, source: 'accent' };
  return { color: DEFAULT_APP_KEY_COLOR, source: 'default' };
}
