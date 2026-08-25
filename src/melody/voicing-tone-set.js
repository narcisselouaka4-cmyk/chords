// [Claude] — 2026-08-25 — EXP-034 : inclusion des tensions disponibles dans
// l'ensemble de tons à voicer.
//
// PROBLÈME RÉSOLU
// ---------------
// L'ensemble de tons d'un accord était strictement ses pitch classes
// canoniques (`candidate.pitchClasses`, calculé par
// `chord-candidate-generator.js` depuis `def.intervals`). Quand la note
// mélodique à exposer est une **tension disponible** de l'accord — déjà
// classée comme telle par `classifyMelodyCompatibility` —, aucune forme de
// voicing ne pouvait la faire sonner : elle n'entrait jamais dans l'ensemble
// que les techniques (Drop 2, Rootless, Cluster, Quartal) se partagent.
// Mesuré sur R1 audio : E5 sur G7 (13e, intervalle 9) muet aux steps 20, 22
// et 29 ; D5 sur Fmaj7 (13e) muet au step 11 de la Version fidèle.
//
// PRINCIPE
// --------
// Au moment de **voicer** — jamais au moment de nommer —, l'ensemble de tons
// d'un accord est ses pitch classes canoniques, plus la pitch class de la
// note mélodique lorsque celle-ci est classée `available-tension` pour ce
// candidat.
//
// Trois raisons de placer la règle ici et pas dans le candidat :
//   1. ADR-008 — un voicing est une forme, pas un nom. Enrichir
//      `candidate.pitchClasses` renommerait l'accord dans toute la chaîne :
//      clé de dédoublonnage, identifiant, orthographe, score de transition,
//      affichage. L'accord reste un G7 de degré V ; sa 13e est une couleur
//      de voicing, tracée par `addedTensions`.
//   2. Aucune classification harmonique nouvelle n'est créée. La règle
//      **relit** `melodyCompatibility`, déjà calculée par candidat et par
//      événement mélodique, et déjà portée par le candidat.
//   3. Le périmètre reste celui d'une décision de forme, pas d'une refonte de
//      la construction des accords.
//
// PORTÉE — CE QUI DÉCLENCHE, CE QUI NE DÉCLENCHE PAS
// --------------------------------------------------
// Déclenche : `category === 'available-tension'` uniquement. La tension
// ajoutée est exactement la note que la mélodie joue déjà — jamais une
// tension choisie d'initiative. Une seule pitch class, jamais plus.
//
// Ne déclenche pas :
//   · `chord-tone` — déjà dans l'ensemble ;
//   · `suspension` — une suspension change la fonction de l'accord, pas sa
//     couleur ; elle relève du vocabulaire (`7sus4`, `9sus4`), pas du voicing ;
//   · `non-chord-tone-allowed` — par définition une note que la théorie de
//     cette qualité ne sanctionne pas. L'ajouter fabriquerait une dissonance
//     que rien ne justifie, et casserait la traçabilité (critère 4).
//
// L'audace du résultat est donc bornée par le vocabulaire d'accords
// (`extensionIntervals` de `chord-defs.js`), pas par le mécanisme.
//
// UNIFORME, PAS SENSIBLE AU STYLE — décision tranchée
// ---------------------------------------------------
// La règle s'applique identiquement en Version fidèle, gospel et tendue.
// Trois raisons :
//   1. Ce n'est pas un choix de couleur, c'est l'invariant « ne jamais
//      sacrifier la mélodie » (critère 1 du score de validité). Une mélodie
//      inaudible n'est pas une version plus fidèle : c'est une version
//      cassée.
//   2. La note ajoutée est celle que la mélodie **joue déjà**. Elle sonne de
//      toute façon. L'exclure du voicing ne supprime pas la friction : cela
//      fait seulement jouer l'accompagnement à côté du chant.
//   3. La mesure le confirme : c'est la Version **fidèle** de R1 audio qui
//      échoue le plus (4 steps contre 3). Une règle réservée au gospel
//      laisserait la variante la plus sage avec la mélodie muette.
//
// Module pur : pas d'état, pas de mutation des entrées, pas de dépendance.

/** Nombre maximal de pitch classes qu'un voicing V1 peut porter. */
export const MAX_VOICING_TONES = 6;

function normalizePc(pc) {
  return ((pc % 12) + 12) % 12;
}

/**
 * Pitch class de la tension disponible à faire entrer dans le voicing, ou
 * `null` si la règle ne s'applique pas.
 *
 * @param {object} candidate - ChordCandidate portant `melodyCompatibility`.
 * @returns {number | null}
 */
export function availableMelodyTension(candidate) {
  if (!candidate || typeof candidate !== 'object') return null;
  const compat = candidate.melodyCompatibility;
  if (!compat || compat.category !== 'available-tension') return null;
  const pc = compat.melodyPitchClass;
  // -1 = aucun événement mélodique sur cette ancre.
  if (!Number.isInteger(pc) || pc < 0 || pc > 11) return null;
  return normalizePc(pc);
}

/**
 * Ensemble de tons enrichi : les pitch classes fournies, plus la tension
 * mélodique disponible quand la règle s'applique et que la place le permet.
 *
 * Le plafond de cardinalité n'est pas cosmétique : un voicing V1 se divise en
 * au plus deux notes à la main gauche et quatre à la droite. Au-delà, aucune
 * division de mains n'est admissible et l'accord deviendrait injouable. Dans
 * ce cas la règle s'abstient plutôt que de produire un voicing impossible.
 *
 * @param {number[]} pitchClasses - ensemble de base (non muté).
 * @param {object} candidate
 * @param {{ maxTones?: number }} [options]
 * @returns {{ pitchClasses: number[], addedTensions: number[] }}
 *   `pitchClasses` trié croissant et dédoublonné ; `addedTensions` vide quand
 *   la règle ne s'applique pas.
 */
export function withMelodyTension(pitchClasses, candidate, options = {}) {
  const maxTones = options.maxTones === undefined ? MAX_VOICING_TONES : options.maxTones;
  const base = Array.from(new Set((pitchClasses || []).map(normalizePc)))
    .sort((a, b) => a - b);

  const tension = availableMelodyTension(candidate);
  if (tension === null || base.includes(tension) || base.length + 1 > maxTones) {
    return { pitchClasses: base, addedTensions: [] };
  }

  return {
    pitchClasses: base.concat(tension).sort((a, b) => a - b),
    addedTensions: [tension],
  };
}
