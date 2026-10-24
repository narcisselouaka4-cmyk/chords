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
export const archivedMovements = legacy.movements.map((m) => ({
  ...m, kind: 'archive', category: 'Archives · grilles seules',
  preserveQualities: true, noAutoPassing: true,
  description: 'Ancienne grille sans interprétation documentée. Accords conservés ; aucun ajout automatique.',
}));

export function findCatalogueEntry(name) {
  return catalogue.movements.find((m) => m.id === name || m.name === name || m.aliases?.includes(name))
    || archivedMovements.find((m) => m.id === name || m.name === name) || null;
}

export default catalogue;
