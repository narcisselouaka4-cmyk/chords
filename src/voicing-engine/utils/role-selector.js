// Selection des roles a inclure dans un voicing selon les regles d'omission.

import { resolveRoles } from '../families/role-map.js';

/** @typedef {import('../chord-input.js').NormalizedVoicingInput} VoicingInput */

const ROLE_PRIORITY = [
  'root',
  'third',
  'seventh',
  'fifth',
  'ninth',
  'eleventh',
  'thirteenth',
];

/**
 * Selectionne les roles a jouer dans un voicing compact.
 * Priorite : fondamentale, tierce, septieme, quinte, extensions.
 * On omet volontairement la quinte si l'accord a des extensions, conformement aux usages jazz.
 * @param {VoicingInput} input
 * @param {number} targetCount - nombre de voix souhaitees
 * @param {{ omitFifth?: boolean }} [options]
 * @returns {string[]}
 */
export function selectRolesForVoicing(input, targetCount, options = {}) {
  const roles = resolveRoles(input);
  const selected = [];

  for (const role of ROLE_PRIORITY) {
    if (roles[role] == null) continue;
    selected.push(role);
  }

  // Omission de la quinte si demande et si des extensions ou une 7e existent.
  if (options.omitFifth && selected.includes('fifth')) {
    const hasExtensions = selected.some((r) => ['ninth', 'eleventh', 'thirteenth'].includes(r));
    const hasSeventh = selected.includes('seventh');
    if (hasExtensions || hasSeventh) {
      const idx = selected.indexOf('fifth');
      if (idx >= 0) selected.splice(idx, 1);
    }
  }

  // Si trop de roles, on supprime les moins essentiels (11e puis 13e puis 9e) pour atteindre targetCount.
  while (selected.length > targetCount) {
    const removable = ['eleventh', 'thirteenth', 'ninth', 'fifth'].find((r) => selected.includes(r));
    if (!removable) break;
    const idx = selected.indexOf(removable);
    selected.splice(idx, 1);
  }

  return selected;
}

/**
 * Retourne les pitch classes correspondant a une liste de roles, dans l'ordre.
 * @param {VoicingInput} input
 * @param {string[]} roles
 * @returns {number[]}
 */
export function rolesToPitchClasses(input, roles) {
  const roleMap = resolveRoles(input);
  return roles.map((role) => roleMap[role]).filter((pc) => pc != null);
}

/**
 * Selectionne 4 voix pour un close 4-way ou un drop 2.
 * Ordre harmonique : root, 3, 5, 7, puis la plus caracteristique extension (9, 11, 13).
 * @param {VoicingInput} input
 * @returns {string[]}
 */
export function selectFourWayRoles(input) {
  const roles = resolveRoles(input);
  const selected = [];
  for (const role of ['root', 'third', 'fifth', 'seventh', 'ninth', 'eleventh', 'thirteenth']) {
    if (roles[role] != null) {
      selected.push(role);
      if (selected.length === 4) break;
    }
  }
  return selected;
}

