import { detectChord } from '../chord-engine/index.js';
import { isDominantSymbol, isMinorSymbol } from './harmonic-utils.js';

// [Claude] — 2026-07-03 — Détection basique de substitutions harmoniques.
// Pour l'instant, on repère les cas classiques à partir de l'accord courant et du précédent.
export function findSubstitutions(prevResult, currentResult) {
  if (!currentResult) return [];

  const substitutions = [];
  const root = currentResult.rootPc;
  const symbol = currentResult.symbol;
  const intervals = currentResult.intervals || [];
  const isDom = isDominantSymbol(symbol);
  const isMin = isMinorSymbol(symbol);

  // Substitution tritonique : un accord dominant dont la fondamentale est un triton de la dominante attendue.
  // Exemple : Db7 remplace G7 dans une cadence V-I en C.
  if (isDom) {
    substitutions.push({
      type: 'tritone',
      label: 'Substitution tritonique possible',
      description:
        'Cet accord dominant peut remplacer la dominante située un triton au-dessus ou en dessous.',
    });
  }

  // Dominante secondaire : un accord dominant résolvant vers un degré autre que la tonique.
  // Détectée si l'accord précédent forme un intervalle de quinte descendante vers l'accord courant.
  if (
    prevResult &&
    isDom
  ) {
    const prevRoot = prevResult.rootPc;
    const fifthUp = (prevRoot + 7) % 12;
    if (fifthUp === root) {
      substitutions.push({
        type: 'secondary-dominant',
        label: 'Dominante secondaire',
        description:
          "L'accord précédent fonctionne comme la dominante (V) de cet accord.",
      });
    }
  }

  // Accord de passage chromatique : accord dominant d'une demi-ton au-dessus/dessous
  // situé entre deux accords diatoniques. Ici, on signale juste la possibilité.
  if (isDom && intervals.includes(10)) {
    substitutions.push({
      type: 'passing',
      label: 'Accord de passage chromatique',
      description:
        "Cet accord dominant peut servir de passage chromatique entre deux degrés voisins.",
    });
  }

  return substitutions;
}
