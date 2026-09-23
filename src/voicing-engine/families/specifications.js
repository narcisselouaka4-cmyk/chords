// Specifications formelles des familles de voicing.
// Source de verite musicale : src/voicing-engine/families/FORMAL_DEFINITIONS.md
// Chaque famille declare ses regles musicales avant toute implementation.

/** @typedef {import('../chord-input.js').NormalizedVoicingInput} VoicingInput */

import { hasThirdAndSeventh, hasNinth, hasAtLeastFourNotes } from './role-map.js';

/**
 * @typedef {{
 *   id: string,
 *   displayName: string,
 *   description: string,
 *   minVoices: number,
 *   maxVoices: number,
 *   voiceCountScope: 'all' | 'rightHand' | 'chordVoices',
 *   requiredRoles: string[],
 *   optionalRoles: string[],
 *   allowsRootless: boolean,
 *   allowsRegisterGaps?: boolean,
 *   handRangeOptions?: import('../utils/voicing-utils.js').SpanOverrides,
 *   isApplicable: (input: VoicingInput) => boolean,
 * }} VoicingFamilySpec
 *
 * `allowsRegisterGaps` desactive la continuite de registre intra-main pour les
 * familles ou un trou d'octave est justifie musicalement (stride, walking bass).
 */

/**
 * Liste ordonnee des familles. Les familles non encore implementees musicalement
 * restent dans la liste avec isApplicable() = false ; l'UI les affiche alors "—".
 * @type {VoicingFamilySpec[]}
 */
export const FAMILY_SPECS = Object.freeze([
  // ---------- Familles MVP (implementees) ----------

  Object.freeze({
    id: 'shell',
    displayName: 'Shell',
    description:
      'Voicing guide-tone : la main gauche joue la fondamentale (ou la basse slash), ' +
      'la main droite joue la tierce et la septieme. Une extension caracteristique ' +
      '(9e, 11e, 13e) ou la quinte peut etre ajoutee si elle appartient a l\'accord.',
    minVoices: 2,
    maxVoices: 5,
    voiceCountScope: 'rightHand',
    requiredRoles: ['rootOrBass', 'third', 'seventh'],
    optionalRoles: ['fifth', 'ninth', 'eleventh', 'thirteenth'],
    allowsRootless: false,
    isApplicable(input) {
      return hasThirdAndSeventh(input);
    },
  }),

  Object.freeze({
    id: 'twoNoteShell',
    displayName: 'Two-Note Shell',
    description:
      'Version minimale du Shell : basse en main gauche, guide tones ' +
      '(tierce + septieme) seuls en main droite.',
    minVoices: 3,
    maxVoices: 3,
    voiceCountScope: 'all',
    requiredRoles: ['rootOrBass', 'third', 'seventh'],
    optionalRoles: [],
    allowsRootless: false,
    isApplicable(input) {
      return hasThirdAndSeventh(input);
    },
  }),

  Object.freeze({
    id: 'rootlessA',
    displayName: 'Rootless A',
    description:
      'Voicing sans fondamentale type A : 3e - 5e - 7e - 9e en close. ' +
      'La neuvieme et la quinte sont obligatoires pour que la structure A soit pertinente.',
    minVoices: 4,
    maxVoices: 4,
    voiceCountScope: 'all',
    requiredRoles: ['third', 'fifth', 'seventh', 'ninth'],
    optionalRoles: [],
    allowsRootless: true,
    isApplicable(input) {
      return hasThirdAndSeventh(input) && hasNinth(input) && hasAtLeastFourNotes(input);
    },
  }),

  Object.freeze({
    id: 'rootlessB',
    displayName: 'Rootless B',
    description:
      'Voicing sans fondamentale type B : 7e - 3e - 5e - 9e en close, ' +
      'centre sur la septieme. La quinte et la neuvieme sont requises.',
    minVoices: 4,
    maxVoices: 4,
    voiceCountScope: 'all',
    requiredRoles: ['seventh', 'third', 'fifth', 'ninth'],
    optionalRoles: [],
    allowsRootless: true,
    isApplicable(input) {
      return hasThirdAndSeventh(input) && hasNinth(input) && hasAtLeastFourNotes(input);
    },
  }),

  Object.freeze({
    id: 'close',
    displayName: 'Close',
    description:
      'Empilement compact des notes de l\'accord dans une seule octave, ' +
      'ordonnees par role (1 - 3 - 5/omis - 7 - 9 - 11 - 13). ' +
      'La quinte est omise des qu\'une 7e ou une extension est presente.',
    minVoices: 3,
    maxVoices: 6,
    voiceCountScope: 'rightHand',
    requiredRoles: ['rootOrBass', 'third'],
    optionalRoles: ['fifth', 'seventh', 'ninth', 'eleventh', 'thirteenth'],
    allowsRootless: false,
    isApplicable(input) {
      return input.chordTonePcs.length >= 3;
    },
  }),

  Object.freeze({
    id: 'fourWayClose',
    displayName: '4-Way Close',
    description:
      'Close exactement a 4 voix reelles. Par defaut root-3-5-7 ; ' +
      'la 5e peut etre remplacee par une extension caracteristique (9/11/13) ' +
      'mais la fondamentale est conservee.',
    minVoices: 4,
    maxVoices: 4,
    voiceCountScope: 'chordVoices',
    requiredRoles: ['rootOrBass', 'third', 'seventh'],
    optionalRoles: ['fifth', 'ninth', 'eleventh', 'thirteenth'],
    allowsRootless: false,
    isApplicable(input) {
      return hasAtLeastFourNotes(input) && hasThirdAndSeventh(input);
    },
  }),

  Object.freeze({
    id: 'drop2',
    displayName: 'Drop 2',
    description:
      'Construit a partir d\'un 4-Way Close valide : la 2e voix depuis le haut ' +
      'est descendue d\'une octave. Le resultat est verifiable par reconstruction du close.',
    minVoices: 4,
    maxVoices: 4,
    voiceCountScope: 'chordVoices',
    requiredRoles: ['rootOrBass', 'third', 'seventh'],
    optionalRoles: ['fifth', 'ninth', 'eleventh', 'thirteenth'],
    allowsRootless: false,
    isApplicable(input) {
      return hasAtLeastFourNotes(input) && hasThirdAndSeventh(input);
    },
  }),

  // ---------- Familles Phase 4 (non implementees : affichees "—") ----------

  Object.freeze({
    id: 'drop3',
    displayName: 'Drop 3',
    description:
      'Construit a partir d\'un 4-Way Close valide : la 3e voix depuis le haut ' +
      '(2e depuis le bas) est descendue d\'une octave. Le resultat est verifiable par reconstruction du close.',
    minVoices: 4,
    maxVoices: 4,
    voiceCountScope: 'chordVoices',
    requiredRoles: ['rootOrBass', 'third', 'seventh'],
    optionalRoles: ['fifth', 'ninth', 'eleventh', 'thirteenth'],
    allowsRootless: false,
    isApplicable(input) {
      return hasAtLeastFourNotes(input) && hasThirdAndSeventh(input);
    },
  }),

  Object.freeze({
    id: 'drop2Plus4',
    displayName: 'Drop 2+4',
    description:
      'Volontairement non implemente dans ce modele : descendre la 2e et la 4e voix ' +
      'depuis le haut du close implique de descendre la voix la plus basse du close, ' +
      'qui est deja la basse fondamentale (doublon LH interdit).',
    minVoices: 4,
    maxVoices: 4,
    voiceCountScope: 'chordVoices',
    requiredRoles: [],
    optionalRoles: [],
    allowsRootless: false,
    isApplicable() {
      return false;
    },
  }),

  Object.freeze({
    id: 'block',
    displayName: 'Block / Locked Hands',
    description:
      'Close sur 5 voix reelles : 2 notes graves en main gauche, 3 notes aigues en ' +
      'main droite, span total ≤ 12.',
    minVoices: 5,
    maxVoices: 5,
    voiceCountScope: 'all',
    requiredRoles: ['rootOrBass'],
    optionalRoles: ['third', 'fifth', 'seventh', 'ninth', 'eleventh', 'thirteenth'],
    allowsRootless: false,
    isApplicable(input) {
      return input.chordTonePcs.length >= 5;
    },
  }),

  Object.freeze({
    id: 'stride',
    displayName: 'Stride',
    description:
      'Basse lointaine en main gauche + accord compact en main droite. Le grand trou ' +
      'entre les mains est intentionnel.',
    minVoices: 4,
    maxVoices: 6,
    voiceCountScope: 'all',
    requiredRoles: ['rootOrBass'],
    optionalRoles: ['third', 'fifth', 'seventh', 'ninth', 'eleventh', 'thirteenth'],
    allowsRootless: false,
    allowsRegisterGaps: true,
    isApplicable(input) {
      return input.chordTonePcs.length >= 4;
    },
  }),

  Object.freeze({
    id: 'open',
    displayName: 'Open',
    description:
      'Close avec une ou plusieurs voix deplacees d\'une octave pour elargir la sonorite.',
    minVoices: 4,
    maxVoices: 6,
    voiceCountScope: 'all',
    requiredRoles: ['rootOrBass', 'third'],
    optionalRoles: ['fifth', 'seventh', 'ninth', 'eleventh', 'thirteenth'],
    allowsRootless: false,
    handRangeOptions: { right: { maxSpan: 24 } },
    isApplicable(input) {
      return input.chordTonePcs.length >= 4;
    },
  }),

  Object.freeze({
    id: 'spread',
    displayName: 'Spread',
    description: 'Voix etalees sur plusieurs octaves, chaque note dans une octave differente.',
    minVoices: 4,
    maxVoices: 6,
    voiceCountScope: 'all',
    requiredRoles: ['rootOrBass'],
    optionalRoles: ['third', 'fifth', 'seventh', 'ninth', 'eleventh', 'thirteenth'],
    allowsRootless: false,
    handRangeOptions: { right: { maxSpan: 36 } },
    isApplicable(input) {
      return input.chordTonePcs.length >= 4;
    },
  }),

  Object.freeze({
    id: 'quartal',
    displayName: 'Quartal',
    description: 'Empilement d\'intervalles de quartes.',
    minVoices: 4,
    maxVoices: 5,
    voiceCountScope: 'all',
    requiredRoles: ['rootOrBass'],
    optionalRoles: ['third', 'fifth', 'seventh', 'ninth', 'eleventh', 'thirteenth'],
    allowsRootless: true,
    handRangeOptions: { right: { maxSpan: 24 } },
    isApplicable(input) {
      return input.quality.includes('sus') || input.quality.includes('11');
    },
  }),

  Object.freeze({
    id: 'soWhat',
    displayName: 'So What',
    description: 'Stack quartal decale, sonorite modale/dorienne.',
    minVoices: 4,
    maxVoices: 4,
    voiceCountScope: 'all',
    requiredRoles: ['rootOrBass', 'third'],
    optionalRoles: ['fifth', 'seventh', 'ninth', 'eleventh', 'thirteenth'],
    allowsRootless: true,
    isApplicable(input) {
      const q = input.quality;
      return (q === 'm7' || q === 'm9') && input.chordTonePcs.length >= 4;
    },
  }),

  Object.freeze({
    id: 'upperStructure',
    displayName: 'Upper Structure',
    description: 'Triade superposee sur une fondamentale dominante.',
    minVoices: 4,
    maxVoices: 4,
    voiceCountScope: 'all',
    requiredRoles: ['rootOrBass'],
    optionalRoles: [],
    allowsRootless: false,
    isApplicable(input) {
      const q = input.quality;
      return (q.startsWith('7') || q.includes('alt') || q.includes('#') || q.includes('b'))
        && input.chordTonePcs.length >= 4;
    },
  }),
]);

/**
 * Index des specifications par id.
 * @type {Record<string, VoicingFamilySpec>}
 */
export const FAMILY_SPEC_BY_ID = Object.freeze(
  Object.fromEntries(FAMILY_SPECS.map((spec) => [spec.id, spec]))
);

/**
 * Retourne la liste des familles applicables a un accord donne.
 * @param {VoicingInput} input
 * @returns {VoicingFamilySpec[]}
 */
export function applicableFamilies(input) {
  if (!input || !input.valid) return [];
  return FAMILY_SPECS.filter((spec) => spec.isApplicable(input));
}
