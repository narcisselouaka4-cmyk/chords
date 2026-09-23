// Validateurs specifiques par famille de voicing.
// Chaque validateur prouve que la candidate satisfait la DEFINITION formelle de sa famille.
// Voir src/voicing-engine/families/FORMAL_DEFINITIONS.md.

import { resolveRoles, ROLE_INTERVALS } from '../families/role-map.js';
import { allNotes, uniquePcs, chordVoiceNotes } from '../utils/voicing-utils.js';
import { span } from '../hand-ranges.js';

/** @typedef {import('../data-model.js').VoicingCandidate} VoicingCandidate */
/** @typedef {import('../families/specifications.js').VoicingFamilySpec} VoicingFamilySpec */

/**
 * @typedef {{ ok: boolean, errors: string[] }} ValidationResult
 */

/**
 * Calcule le span total (toutes notes confondues).
 * @param {VoicingCandidate} candidate
 * @returns {number}
 */
function totalSpan(candidate) {
  const notes = allNotes(candidate);
  if (notes.length < 2) return 0;
  return Math.max(...notes) - Math.min(...notes);
}

/**
 * Verifie qu'une candidate ne contient pas la fondamentale dans aucune main.
 * @param {VoicingCandidate} candidate
 * @returns {ValidationResult}
 */
function validateNoRoot(candidate) {
  const rootPc = candidate.input.rootPc;
  for (const note of allNotes(candidate)) {
    if (note % 12 === rootPc) {
      return { ok: false, errors: [`rootless: fondamentale pc ${rootPc} presente`] };
    }
  }
  return { ok: true, errors: [] };
}

/**
 * Verifie que les roles requis sont tous presents.
 * @param {VoicingCandidate} candidate
 * @param {string[]} requiredRoles
 * @returns {ValidationResult}
 */
function validateRequiredRolesPresent(candidate, requiredRoles) {
  const roles = resolveRoles(candidate.input);
  const presentPcs = new Set(allNotes(candidate).map((n) => n % 12));
  const errors = [];

  for (const role of requiredRoles) {
    if (role === 'rootOrBass') {
      const bassPc = candidate.input.bassPc ?? candidate.input.rootPc;
      if (!presentPcs.has(bassPc)) {
        errors.push(`role rootOrBass (pc ${bassPc}) manquant`);
      }
      continue;
    }
    const pc = roles[role];
    if (pc == null) {
      errors.push(`role ${role} non defini dans l'accord`);
    } else if (!presentPcs.has(pc)) {
      errors.push(`role ${role} (pc ${pc}) manquant dans le voicing`);
    }
  }

  return { ok: errors.length === 0, errors };
}

/**
 * Retourne l'ordre harmonique des roles (index croissant).
 * @param {string[]} roles
 * @returns {number[]}
 */
function roleOrderIndices(roles) {
  const order = ['root', 'third', 'fifth', 'seventh', 'ninth', 'eleventh', 'thirteenth'];
  return roles.map((r) => order.indexOf(r));
}

/**
 * Verifie qu'un tableau de notes MIDI forme un close valide.
 * @param {number[]} notes
 * @returns {boolean}
 */
function isCloseStack(notes) {
  if (notes.length < 2) return true;
  const sorted = [...notes].sort((a, b) => a - b);
  return sorted[sorted.length - 1] - sorted[0] <= 12;
}

/**
 * Verifie que les roles presents dans une main suivent l'ordre harmonique ascendant.
 * @param {number[]} handNotes
 * @param {VoicingCandidate} candidate
 * @returns {{ ok: boolean, error?: string }}
 */
function validateRoleOrder(handNotes, candidate) {
  const roles = resolveRoles(candidate.input);
  const sorted = [...handNotes].sort((a, b) => a - b);
  const presentRoles = sorted.map((n) => {
    const pc = n % 12;
    return Object.keys(roles).find((r) => roles[r] === pc) || 'unknown';
  });
  const indices = roleOrderIndices(presentRoles);
  for (let i = 1; i < indices.length; i++) {
    if (indices[i] < indices[i - 1]) {
      return { ok: false, error: `ordre des roles invalide: ${presentRoles.join(', ')}` };
    }
  }
  return { ok: true };
}

/**
 * Validateur Shell : LH = fondamentale/basse seule, RH = guide tones + extension.
 * @param {VoicingCandidate} candidate
 * @param {VoicingFamilySpec} spec
 * @returns {ValidationResult}
 */
export function validateShell(candidate, spec) {
  const errors = [];

  const expectedBassPc = candidate.input.bassPc ?? candidate.input.rootPc;
  if (candidate.lh.notes.length !== 1) {
    errors.push(`Shell: LH doit contenir exactement 1 note, got ${candidate.lh.notes.length}`);
  } else if (candidate.lh.notes[0] % 12 !== expectedBassPc) {
    errors.push(`Shell: LH doit jouer pc ${expectedBassPc}, got ${candidate.lh.notes[0] % 12}`);
  }

  const required = validateRequiredRolesPresent(candidate, spec.requiredRoles.filter((r) => r !== 'rootOrBass'));
  errors.push(...required.errors);

  if (!isCloseStack(candidate.rh.notes)) {
    errors.push(`Shell: RH ne forme pas un close (span > 12)`);
  }

  const orderCheck = validateRoleOrder(candidate.rh.notes, candidate);
  if (!orderCheck.ok) errors.push(`Shell: ${orderCheck.error}`);

  return { ok: errors.length === 0, errors };
}

/**
 * Validateur Two-Note Shell : LH basse, RH exactement tierce + septieme.
 * @param {VoicingCandidate} candidate
 * @param {VoicingFamilySpec} spec
 * @returns {ValidationResult}
 */
export function validateTwoNoteShell(candidate, spec) {
  const errors = [];

  const expectedBassPc = candidate.input.bassPc ?? candidate.input.rootPc;
  if (candidate.lh.notes.length !== 1 || candidate.lh.notes[0] % 12 !== expectedBassPc) {
    errors.push(`Two-Note Shell: LH doit etre la basse pc ${expectedBassPc}`);
  }

  if (candidate.rh.notes.length !== 2) {
    errors.push(`Two-Note Shell: RH doit contenir exactement 2 notes`);
  }

  const required = validateRequiredRolesPresent(candidate, spec.requiredRoles.filter((r) => r !== 'rootOrBass'));
  errors.push(...required.errors);

  return { ok: errors.length === 0, errors };
}

/**
 * Validateur Rootless A : structure exacte 3-5-7-9 en close.
 * @param {VoicingCandidate} candidate
 * @param {VoicingFamilySpec} spec
 * @returns {ValidationResult}
 */
export function validateRootlessA(candidate, spec) {
  const errors = [];

  const noRoot = validateNoRoot(candidate);
  errors.push(...noRoot.errors);

  if (candidate.lh.notes.length !== 0) {
    errors.push(`Rootless A: LH doit etre vide, got ${candidate.lh.notes.length}`);
  }

  if (candidate.rh.notes.length !== 4) {
    errors.push(`Rootless A: RH doit contenir exactement 4 notes`);
  }

  const required = validateRequiredRolesPresent(candidate, spec.requiredRoles);
  errors.push(...required.errors);

  if (!isCloseStack(candidate.rh.notes)) {
    errors.push(`Rootless A: RH ne forme pas un close (span > 12)`);
  }

  const orderCheck = validateRoleOrder(candidate.rh.notes, candidate);
  if (!orderCheck.ok) errors.push(`Rootless A: ${orderCheck.error}`);

  return { ok: errors.length === 0, errors };
}

/**
 * Validateur Rootless B : structure exacte 7-3-5-9 en close, 7 en bas.
 * @param {VoicingCandidate} candidate
 * @param {VoicingFamilySpec} spec
 * @returns {ValidationResult}
 */
export function validateRootlessB(candidate, spec) {
  const errors = [];

  const noRoot = validateNoRoot(candidate);
  errors.push(...noRoot.errors);

  if (candidate.lh.notes.length !== 0) {
    errors.push(`Rootless B: LH doit etre vide, got ${candidate.lh.notes.length}`);
  }

  if (candidate.rh.notes.length !== 4) {
    errors.push(`Rootless B: RH doit contenir exactement 4 notes`);
  }

  const required = validateRequiredRolesPresent(candidate, spec.requiredRoles);
  errors.push(...required.errors);

  if (!isCloseStack(candidate.rh.notes)) {
    errors.push(`Rootless B: RH ne forme pas un close (span > 12)`);
  }

  const roles = resolveRoles(candidate.input);
  if (roles.seventh != null) {
    const lowestPc = Math.min(...candidate.rh.notes) % 12;
    if (lowestPc !== roles.seventh) {
      errors.push(`Rootless B: la note la plus grave doit etre la septieme (pc ${roles.seventh}), got ${lowestPc}`);
    }
  }

  const orderCheck = validateRoleOrder(candidate.rh.notes, candidate);
  if (!orderCheck.ok) errors.push(`Rootless B: ${orderCheck.error}`);

  return { ok: errors.length === 0, errors };
}

/**
 * Validateur Close : RH compact dans une octave, fondamentale + tierce presentes.
 * @param {VoicingCandidate} candidate
 * @param {VoicingFamilySpec} spec
 * @returns {ValidationResult}
 */
export function validateClose(candidate, spec) {
  const errors = [];

  const expectedBassPc = candidate.input.bassPc ?? candidate.input.rootPc;
  if (candidate.lh.notes.length !== 1 || candidate.lh.notes[0] % 12 !== expectedBassPc) {
    errors.push(`Close: LH doit etre la basse pc ${expectedBassPc}`);
  }

  const required = validateRequiredRolesPresent(candidate, spec.requiredRoles.filter((r) => r !== 'rootOrBass'));
  errors.push(...required.errors);

  const rh = candidate.rh.notes;
  if (rh.length >= 2) {
    const rhSpan = rh[rh.length - 1] - rh[0];
    if (rhSpan > 12) {
      errors.push(`Close: span RH ${rhSpan} > 12`);
    }
  }

  const orderCheck = validateRoleOrder(rh, candidate);
  if (!orderCheck.ok) errors.push(`Close: ${orderCheck.error}`);

  return { ok: errors.length === 0, errors };
}

/**
 * Validateur 4-Way Close : exactement 4 voix reelles dans une octave.
 * @param {VoicingCandidate} candidate
 * @param {VoicingFamilySpec} spec
 * @returns {ValidationResult}
 */
export function validateFourWayClose(candidate, spec) {
  const errors = [];

  const expectedBassPc = candidate.input.bassPc ?? candidate.input.rootPc;
  if (candidate.lh.notes.length !== 1 || candidate.lh.notes[0] % 12 !== expectedBassPc) {
    errors.push(`4-Way Close: LH doit etre la basse pc ${expectedBassPc}`);
  }

  const rh = candidate.rh.notes;
  if (rh.length !== 4) {
    errors.push(`4-Way Close: RH doit contenir exactement 4 notes, got ${rh.length}`);
  }

  const rhPcs = [...new Set(rh.map((n) => n % 12))];
  if (rhPcs.length !== 4) {
    errors.push(`4-Way Close: attendu 4 pitch classes distinctes en RH, got ${rhPcs.length}`);
  }

  if (!isCloseStack(rh)) {
    errors.push(`4-Way Close: RH ne forme pas un close (span > 12)`);
  }

  const required = validateRequiredRolesPresent(candidate, spec.requiredRoles);
  errors.push(...required.errors);

  // La 4e voix doit etre fifth ou une extension autorisée.
  const roles = resolveRoles(candidate.input);
  const presentRoleNames = rhPcs.map((pc) => {
    return Object.keys(roles).find((r) => roles[r] === pc) || 'unknown';
  });
  const allowedFourthRoles = ['fifth', 'ninth', 'eleventh', 'thirteenth'];
  const fourthRoles = presentRoleNames.filter((r) => allowedFourthRoles.includes(r));
  if (fourthRoles.length === 0) {
    errors.push(`4-Way Close: la 4e voix doit etre fifth ou une extension, got ${presentRoleNames.join(', ')}`);
  }

  const orderCheck = validateRoleOrder(rh, candidate);
  if (!orderCheck.ok) errors.push(`4-Way Close: ${orderCheck.error}`);

  return { ok: errors.length === 0, errors };
}

/**
 * Validateur Drop 2 : derive d'un close 4 voix, 2e voix depuis le haut descendue d'une octave.
 * @param {VoicingCandidate} candidate
 * @param {VoicingFamilySpec} spec
 * @returns {ValidationResult}
 */
export function validateDrop2(candidate, spec) {
  const errors = [];

  const expectedBassPc = candidate.input.bassPc ?? candidate.input.rootPc;
  if (candidate.lh.notes.length === 0) {
    errors.push(`Drop 2: LH doit contenir au moins la basse`);
  } else if (candidate.lh.notes[0] % 12 !== expectedBassPc) {
    errors.push(`Drop 2: la note la plus grave de LH doit etre la basse pc ${expectedBassPc}`);
  }

  const voices = [...new Set(chordVoiceNotes(candidate).map((n) => n % 12))];
  if (voices.length !== 4) {
    errors.push(`Drop 2: attendu 4 voix distinctes, got ${voices.length}`);
  }

  // Reconstitution : remonter les notes LH (hors basse) d'une octave et fusionner avec RH.
  const hasSlashBass = candidate.input.bassPc != null && candidate.input.bassPc !== candidate.input.rootPc
    && candidate.lh.notes[0] % 12 === candidate.input.bassPc;
  const lhVoices = hasSlashBass ? candidate.lh.notes.slice(1) : candidate.lh.notes.slice(1);
  const liftedLh = lhVoices.map((n) => n + 12);
  const closeStack = [...liftedLh, ...candidate.rh.notes].sort((a, b) => a - b);

  if (!isCloseStack(closeStack)) {
    errors.push(`Drop 2: la remontee de la LH ne forme pas un close valide (span ${span(closeStack)})`);
  }

  // La note descendue doit etre la 2e voix depuis le haut du close.
  if (lhVoices.length > 0) {
    const droppedNote = Math.max(...lhVoices);
    const secondFromTop = closeStack[closeStack.length - 2];
    if (droppedNote + 12 !== secondFromTop) {
      errors.push(`Drop 2: la note descendue ${droppedNote} n'est pas la 2e voix du haut du close (${secondFromTop})`);
    }
  }

  const required = validateRequiredRolesPresent(candidate, spec.requiredRoles);
  errors.push(...required.errors);

  return { ok: errors.length === 0, errors };
}

/**
 * Validateur Drop 3 : derive d'un close 4 voix, 3e voix depuis le haut descendue d'une octave.
 * @param {VoicingCandidate} candidate
 * @param {VoicingFamilySpec} spec
 * @returns {ValidationResult}
 */
export function validateDrop3(candidate, spec) {
  const errors = [];

  const expectedBassPc = candidate.input.bassPc ?? candidate.input.rootPc;
  if (candidate.lh.notes.length === 0) {
    errors.push(`Drop 3: LH doit contenir au moins la basse`);
  } else if (candidate.lh.notes[0] % 12 !== expectedBassPc) {
    errors.push(`Drop 3: la note la plus grave de LH doit etre la basse pc ${expectedBassPc}`);
  }

  const voices = [...new Set(chordVoiceNotes(candidate).map((n) => n % 12))];
  if (voices.length !== 4) {
    errors.push(`Drop 3: attendu 4 voix distinctes, got ${voices.length}`);
  }

  const lhVoices = candidate.lh.notes.slice(1);
  const liftedLh = lhVoices.map((n) => n + 12);
  const closeStack = [...liftedLh, ...candidate.rh.notes].sort((a, b) => a - b);

  if (!isCloseStack(closeStack)) {
    errors.push(`Drop 3: la remontee de la LH ne forme pas un close valide (span ${span(closeStack)})`);
  }

  if (lhVoices.length > 0) {
    const droppedNote = Math.max(...lhVoices);
    const thirdFromTop = closeStack[1];
    if (droppedNote + 12 !== thirdFromTop) {
      errors.push(`Drop 3: la note descendue ${droppedNote} n'est pas la 3e voix du haut du close (${thirdFromTop})`);
    }
  }

  const required = validateRequiredRolesPresent(candidate, spec.requiredRoles);
  errors.push(...required.errors);

  return { ok: errors.length === 0, errors };
}

/**
 * Placeholder pour les familles non implementees.
 * @returns {ValidationResult}
 */
function validateUnavailable() {
  return { ok: false, errors: ['Famille non implementee'] };
}

/**
 * Registre des validateurs par famille.
 * @type {Record<string, (candidate: VoicingCandidate, spec: VoicingFamilySpec) => ValidationResult>}
 */
/**
 * Validateur Block / Locked Hands : 5 voix reelles en close sur 2 mains.
 * @param {VoicingCandidate} candidate
 * @param {VoicingFamilySpec} spec
 * @returns {ValidationResult}
 */
export function validateBlock(candidate, spec) {
  const errors = [];

  if (candidate.lh.notes.length !== 2) {
    errors.push(`Block: LH doit contenir 2 notes, got ${candidate.lh.notes.length}`);
  }

  if (candidate.rh.notes.length !== 3) {
    errors.push(`Block: RH doit contenir 3 notes, got ${candidate.rh.notes.length}`);
  }

  const allPcs = new Set(allNotes(candidate).map((n) => n % 12));
  if (allPcs.size !== 5) {
    errors.push(`Block: attendu 5 pitch classes distinctes, got ${allPcs.size}`);
  }

  const fullSpan = totalSpan(candidate);
  if (fullSpan > 12) {
    errors.push(`Block: span total ${fullSpan} > 12`);
  }

  const required = validateRequiredRolesPresent(candidate, spec.requiredRoles);
  errors.push(...required.errors);

  return { ok: errors.length === 0, errors };
}

/**
 * Validateur Stride : basse lointaine + accord compact.
 * @param {VoicingCandidate} candidate
 * @param {VoicingFamilySpec} spec
 * @returns {ValidationResult}
 */
export function validateStride(candidate, spec) {
  const errors = [];

  const expectedBassPc = candidate.input.bassPc ?? candidate.input.rootPc;
  if (candidate.lh.notes.length !== 1) {
    errors.push(`Stride: LH doit contenir 1 note, got ${candidate.lh.notes.length}`);
  } else if (candidate.lh.notes[0] % 12 !== expectedBassPc) {
    errors.push(`Stride: LH doit etre la basse pc ${expectedBassPc}`);
  }

  if (!isCloseStack(candidate.rh.notes)) {
    errors.push(`Stride: RH ne forme pas un close (span > 12)`);
  }

  if (candidate.lh.notes.length > 0 && candidate.rh.notes.length > 0) {
    const gap = candidate.rh.notes[0] - Math.max(...candidate.lh.notes);
    if (gap < 12) {
      errors.push(`Stride: ecart LH/RH ${gap} < 12`);
    }
  }

  const required = validateRequiredRolesPresent(candidate, spec.requiredRoles);
  errors.push(...required.errors);

  return { ok: errors.length === 0, errors };
}

/**
 * Validateur Open : close avec au moins une voix ouverte d'une octave.
 * @param {VoicingCandidate} candidate
 * @param {VoicingFamilySpec} spec
 * @returns {ValidationResult}
 */
/**
 * Verifie qu'un ensemble de notes peut etre ramene a un close en abaissant
 * une seule voix d'une octave (definition d'un voicing Open).
 * @param {number[]} notes
 * @returns {boolean}
 */
function isOpenStack(notes) {
  if (notes.length < 3) return false;
  const sorted = [...notes].sort((a, b) => a - b);
  if (sorted[sorted.length - 1] - sorted[0] <= 12) return false;
  for (let i = 0; i < sorted.length; i++) {
    const reduced = [...sorted];
    reduced[i] -= 12;
    reduced.sort((a, b) => a - b);
    if (reduced[reduced.length - 1] - reduced[0] <= 12) return true;
  }
  return false;
}

export function validateOpen(candidate, spec) {
  const errors = [];

  const expectedBassPc = candidate.input.bassPc ?? candidate.input.rootPc;
  if (candidate.lh.notes.length < 1 || candidate.lh.notes[0] % 12 !== expectedBassPc) {
    errors.push(`Open: LH doit commencer par la basse pc ${expectedBassPc}`);
  }

  // Le RH n'est plus un close : il est elargi.
  const rhSpan = span(candidate.rh.notes);
  if (rhSpan <= 12) {
    errors.push(`Open: span RH ${rhSpan} n'est pas elargi`);
  }

  if (!isOpenStack(candidate.rh.notes)) {
    errors.push(`Open: RH ne derive pas d'un close par deplacement d'une octave`);
  }

  const required = validateRequiredRolesPresent(candidate, spec.requiredRoles);
  errors.push(...required.errors);

  return { ok: errors.length === 0, errors };
}

/**
 * Validateur Spread : voix etalees sur plusieurs octaves.
 * @param {VoicingCandidate} candidate
 * @param {VoicingFamilySpec} spec
 * @returns {ValidationResult}
 */
export function validateSpread(candidate, spec) {
  const errors = [];

  const expectedBassPc = candidate.input.bassPc ?? candidate.input.rootPc;
  if (candidate.lh.notes.length < 1 || candidate.lh.notes[0] % 12 !== expectedBassPc) {
    errors.push(`Spread: LH doit commencer par la basse pc ${expectedBassPc}`);
  }

  if (candidate.rh.notes.length < 2) {
    errors.push(`Spread: RH doit contenir au moins 2 notes`);
  }

  const rhSpan = span(candidate.rh.notes);
  if (rhSpan <= 12) {
    errors.push(`Spread: span RH ${rhSpan} <= 12`);
  }

  const rhOctaves = new Set(candidate.rh.notes.map((n) => Math.floor(n / 12)));
  if (rhOctaves.size < 3) {
    errors.push(`Spread: notes reparties sur moins de 3 octaves`);
  }

  const required = validateRequiredRolesPresent(candidate, spec.requiredRoles);
  errors.push(...required.errors);

  return { ok: errors.length === 0, errors };
}

/**
 * Verifie qu'une liste de notes forme une chaine de quartes (ecarts 5, 6 ou 7 demi-tons).
 * @param {number[]} notes
 * @returns {boolean}
 */
function isQuartalStack(notes) {
  if (notes.length < 2) return true;
  const sorted = [...notes].sort((a, b) => a - b);
  for (let i = 1; i < sorted.length; i++) {
    const diff = sorted[i] - sorted[i - 1];
    if (![5, 6, 7].includes(diff)) return false;
  }
  return true;
}

/**
 * Validateur Quartal : chaine d'intervalles de quartes.
 * @param {VoicingCandidate} candidate
 * @param {VoicingFamilySpec} spec
 * @returns {ValidationResult}
 */
export function validateQuartal(candidate, spec) {
  const errors = [];

  const expectedBassPc = candidate.input.bassPc ?? candidate.input.rootPc;
  if (candidate.lh.notes.length !== 1 || candidate.lh.notes[0] % 12 !== expectedBassPc) {
    errors.push(`Quartal: LH doit etre la basse pc ${expectedBassPc}`);
  }

  if (candidate.rh.notes.length < 3) {
    errors.push(`Quartal: RH doit contenir au moins 3 notes`);
  }

  if (!isQuartalStack(candidate.rh.notes)) {
    errors.push(`Quartal: RH ne forme pas une chaine de quartes`);
  }

  const required = validateRequiredRolesPresent(candidate, spec.requiredRoles);
  errors.push(...required.errors);

  return { ok: errors.length === 0, errors };
}

/**
 * Validateur So What : stack quartal decale.
 * @param {VoicingCandidate} candidate
 * @param {VoicingFamilySpec} spec
 * @returns {ValidationResult}
 */
export function validateSoWhat(candidate, spec) {
  const errors = [];

  const expectedBassPc = candidate.input.bassPc ?? candidate.input.rootPc;
  if (candidate.lh.notes.length !== 1 || candidate.lh.notes[0] % 12 !== expectedBassPc) {
    errors.push(`So What: LH doit etre la basse pc ${expectedBassPc}`);
  }

  if (candidate.rh.notes.length !== 3) {
    errors.push(`So What: RH doit contenir exactement 3 notes`);
  }

  if (!isQuartalStack(candidate.rh.notes)) {
    errors.push(`So What: RH ne forme pas un stack quartal decale`);
  }

  const required = validateRequiredRolesPresent(candidate, spec.requiredRoles);
  errors.push(...required.errors);

  return { ok: errors.length === 0, errors };
}

/**
 * Verifie qu'une liste de 3 pitch classes forme une triade reconnue.
 * Teste chaque note comme fondamentale possible et compare les intervalles.
 * @param {Set<number>} pcs
 * @returns {{ name: string } | null}
 */
function classifyTriad(pcs) {
  const sorted = [...pcs].sort((a, b) => a - b);
  if (sorted.length !== 3) return null;

  const types = [
    { intervals: [4, 7], name: 'majeure' },
    { intervals: [3, 7], name: 'mineure' },
    { intervals: [3, 6], name: 'diminuee' },
    { intervals: [4, 8], name: 'augmentee' },
  ];

  for (let i = 0; i < sorted.length; i++) {
    const root = sorted[i];
    const others = sorted.filter((_, idx) => idx !== i);
    const intervals = others
      .map((pc) => (pc - root + 12) % 12)
      .sort((a, b) => a - b);
    for (const type of types) {
      if (intervals[0] === type.intervals[0] && intervals[1] === type.intervals[1]) {
        return { name: type.name };
      }
    }
  }
  return null;
}

/**
 * Validateur Upper Structure : triade superposee sur la fondamentale.
 * @param {VoicingCandidate} candidate
 * @param {VoicingFamilySpec} spec
 * @returns {ValidationResult}
 */
export function validateUpperStructure(candidate, spec) {
  const errors = [];

  const expectedBassPc = candidate.input.bassPc ?? candidate.input.rootPc;
  if (candidate.lh.notes.length !== 1 || candidate.lh.notes[0] % 12 !== expectedBassPc) {
    errors.push(`Upper Structure: LH doit etre la basse pc ${expectedBassPc}`);
  }

  if (candidate.rh.notes.length !== 3) {
    errors.push(`Upper Structure: RH doit contenir exactement 3 notes`);
  }

  const rhPcs = new Set(candidate.rh.notes.map((n) => n % 12));
  if (rhPcs.has(candidate.input.rootPc)) {
    errors.push(`Upper Structure: le RH ne doit pas contenir la fondamentale`);
  }

  if (!isCloseStack(candidate.rh.notes)) {
    errors.push(`Upper Structure: RH ne forme pas un close`);
  }

  const triad = classifyTriad(rhPcs);
  if (!triad) {
    errors.push(`Upper Structure: RH ne forme pas une triade reconnue`);
  }

  const allowedPcs = new Set(candidate.input.chordTonePcs);
  if (candidate.input.bassPc != null) allowedPcs.add(candidate.input.bassPc);
  for (const pc of rhPcs) {
    if (!allowedPcs.has(pc)) {
      errors.push(`Upper Structure: note ${pc} du RH n'appartient pas a l'accord`);
    }
  }

  const required = validateRequiredRolesPresent(candidate, spec.requiredRoles);
  errors.push(...required.errors);

  return { ok: errors.length === 0, errors };
}

/**
 * Registre des validateurs par famille.
 * @type {Record<string, (candidate: VoicingCandidate, spec: VoicingFamilySpec) => ValidationResult>}
 */
export const FAMILY_VALIDATORS = Object.freeze({
  shell: validateShell,
  twoNoteShell: validateTwoNoteShell,
  rootlessA: validateRootlessA,
  rootlessB: validateRootlessB,
  close: validateClose,
  fourWayClose: validateFourWayClose,
  drop2: validateDrop2,
  drop3: validateDrop3,
  drop2Plus4: validateUnavailable,
  block: validateBlock,
  stride: validateStride,
  open: validateOpen,
  spread: validateSpread,
  quartal: validateQuartal,
  soWhat: validateSoWhat,
  upperStructure: validateUpperStructure,
});
