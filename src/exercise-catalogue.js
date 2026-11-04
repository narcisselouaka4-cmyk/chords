import catalogue from './data/exercise-studies.json' with { type: 'json' };
import legacy from './data/movements-library.json' with { type: 'json' };

export const EXERCISE_KIND_LABELS = {
  progression: 'Progression',
  passage: 'Mouvement de passage',
  study: 'Geste de voix',
  archive: 'Ancienne grille',
};

// Les 61 anciennes fiches sont conservées, sans insertion ni enrichissement
// automatique. Une suite d'accords sans réalisation n'est pas une étude écrite.
// [Claude] — 2026-11-04 — Les 61 grilles gardaient leur famille musicale
// (« Cadences II-V-I », « Blues », « Turnarounds »…) dans le fichier d'origine,
// mais on l'ÉCRASAIT en les rangeant toutes sous « Archives » : impossible d'y
// retrouver quoi que ce soit (Narcisse : « il y a tout un tas de progression et
// mouvement, il va falloir les ranger aussi »). La famille devient maintenant
// un panneau (`tags`) à l'intérieur de la catégorie Archives, comme pour Latino.
export const archivedMovements = legacy.movements.map((m) => ({
  ...m, kind: 'archive', category: 'Archives · grilles seules',
  tags: [...new Set([m.category, ...(m.tags || [])].filter(Boolean))],
  preserveQualities: true, noAutoPassing: true,
  description: 'Ancienne grille sans interprétation documentée. Accords conservés ; aucun ajout automatique.',
}));

export function findCatalogueEntry(name) {
  return catalogue.movements.find((m) => m.id === name || m.name === name || m.aliases?.includes(name))
    || archivedMovements.find((m) => m.id === name || m.name === name) || null;
}

export default catalogue;
