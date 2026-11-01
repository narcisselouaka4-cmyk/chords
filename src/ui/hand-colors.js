// [Claude] — 2026-10-13 — Couleurs des mains dans Exercices (mini-clavier de la carte, blocs « Main
// gauche » / « Main droite »).
//
// Narcisse : « si la couleur de l'application est identique ou quasiment identique à celle de main
// gauche, alors main gauche doit prendre une nouvelle couleur pour bien marquer la différence ». La
// main gauche était dessinée avec la couleur de l'application elle-même : elle se fondait dans le
// reste de l'écran. Chaque main a maintenant sa couleur, choisie dans une courte liste : la première
// qui se distingue nettement de la couleur de l'application (et de l'autre main, et de l'ambre des
// notes ajoutées). Même règle pour la main droite, qui risquait la même chose avec un accent vert.
//
// Fonction pure (testée sous Node) ; main.js pose les variables CSS au lancement et à chaque
// changement de couleur.

import { hexToHsl } from './accent-theme.js';

/** Couleur de l'application quand aucune n'a été choisie (violet d'origine). */
export const DEFAULT_ACCENT = '#9b7bf0';
/** Ambre des notes ajoutées (mini-clavier) : aucune main ne doit s'en approcher. */
export const ADDED_NOTE_COLOR = '#e8b86a';

export const LEFT_HAND_CANDIDATES = ['#a583e2', '#5b8def', '#e4709a', '#3fb6c6', '#e0894f'];
export const RIGHT_HAND_CANDIDATES = ['#8ccdb7', '#e0894f', '#5b8def', '#e4709a', '#a583e2'];

/** Écart de teinte (0–180°) entre deux couleurs ; les gris (saturation faible) sont neutres. */
export function hueDistance(a, b) {
  const ha = hexToHsl(a);
  const hb = hexToHsl(b);
  if (!ha || !hb) return 180;
  if (ha.s < 15 || hb.s < 15) return 180;   // saturation en %
  const d = Math.abs(ha.h - hb.h) % 360;
  return d > 180 ? 360 - d : d;
}

/** Deux couleurs se confondent-elles ? (« identique ou quasiment identique ») */
export function tooClose(a, b, minHue = 38) {
  return hueDistance(a, b) < minHue;
}

function pick(candidates, avoid) {
  return candidates.find((c) => avoid.every((x) => !x || !tooClose(c, x))) || candidates[0];
}

/**
 * @param {string|null} accent couleur de l'application (hex), ou null = violet d'origine
 * @returns {{ lh: string, rh: string }}
 */
export function pickHandColors(accent) {
  const app = hexToHsl(accent) ? accent : DEFAULT_ACCENT;
  const lh = pick(LEFT_HAND_CANDIDATES, [app, ADDED_NOTE_COLOR]);
  const rh = pick(RIGHT_HAND_CANDIDATES, [app, lh, ADDED_NOTE_COLOR]);
  return { lh, rh };
}
