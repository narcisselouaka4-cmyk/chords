import catalogue from './data/exercise-studies.json' with { type: 'json' };
import legacy from './data/movements-library.json' with { type: 'json' };
import gridKinds from './data/exercise-grid-kinds.json' with { type: 'json' };

export const EXERCISE_KIND_LABELS = {
  progression: 'Progression',
  passage: 'Mouvement de passage',
  study: 'Geste de voix',
};

const GRID_CATEGORIES = { progression: 'Progressions', passage: 'Mouvements', study: 'Gestes & voix' };
// Corriger les intitulés qui ne décrivaient pas les degrés réellement stockés.
// Les identifiants, anciens noms, accords et passages écrits restent disponibles.
const GRID_COPY = {
  'walk-up-gospel-1': {
    name: 'Chaîne diatonique vii–iii–vi–ii–V',
    context: 'Une chaîne de quintes descendantes, de la sensible à la dominante.',
  },
  'diatonic-rise-worship-1': {
    name: 'Progression I–IV–vi–V',
    context: 'Quatre degrés diatoniques, avec une relance sur la dominante.',
  },
  'minor-turnaround-1': { name: 'Turnaround mineur i–♭VI–iiø–V' },
  'gospel-1625-dominants-1': {
    name: 'I–VI7–II7–V7 · chaîne de dominantes',
    context: 'La tonique majeure ouvre une chaîne de dominantes vers le V.',
  },
};

// Classement éditorial explicite : cycle/grille, trajet vers une arrivée, ou
// travail d'une voix. La couleur d'un accord ne détermine jamais sa catégorie.
// Une grille libre garde ses passages écrits, sans ajout automatique du moteur.
export const libraryGrids = legacy.movements.map((m) => ({
  ...m, ...GRID_COPY[m.id], kind: gridKinds[m.id], category: GRID_CATEGORIES[gridKinds[m.id]],
  aliases: [...new Set([m.name, ...(m.aliases || [])])],
  tags: [...new Set([m.category, ...(m.tags || [])].filter(Boolean))],
  preserveQualities: true, noAutoPassing: true,
}));

export function findCatalogueEntry(name) {
  return catalogue.movements.find((m) => m.id === name || m.name === name || m.aliases?.includes(name))
    || libraryGrids.find((m) => m.id === name || m.name === name || m.aliases.includes(name)) || null;
}

export default catalogue;
