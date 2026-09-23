// Generateurs specifiques par famille de voicing.
// Chaque generateur applique l'algorithme de construction defini dans
// src/voicing-engine/families/FORMAL_DEFINITIONS.md.

import { createHandVoicing } from '../data-model.js';
import {
  resolveRoles,
  hasThirdAndSeventh,
  hasNinth,
  hasAtLeastFourNotes,
} from '../families/role-map.js';
import {
  buildStandardLeftHand,
  buildBassBelow,
  defaultRhCenter,
  successResult,
  unavailableResult,
  buildCandidate,
} from './base-generator.js';
import {
  midiInstancesInRange,
  buildCloseStack,
  rotateCloseStack,
  placeAbove,
} from '../utils/midi-placement.js';
import {
  LH_HARD_RANGE,
  LH_SOFT_RANGE,
  RH_HARD_RANGE,
  RH_SOFT_RANGE,
  midiInRange,
  span,
} from '../hand-ranges.js';

/** @typedef {import('../chord-input.js').NormalizedVoicingInput} VoicingInput */

const ROLE_ORDER = ['root', 'third', 'fifth', 'seventh', 'ninth', 'eleventh', 'thirteenth'];

/**
 * Convertit une liste de roles en pitch classes dans l'ordre, en filtrant les absents.
 * @param {VoicingInput} input
 * @param {string[]} roles
 * @returns {number[]}
 */
function rolesToPcs(input, roles) {
  const roleMap = resolveRoles(input);
  return roles.map((role) => roleMap[role]).filter((pc) => pc != null);
}

/**
 * Place une liste de pitch classes en close harmonique au-dessus d'une reference.
 * Retourne la position la plus proche du centre de la tessiture RH.
 * @param {number[]} pcs - pitch classes ordonnees par role (grave -> aigu)
 * @param {number} bassMidi
 * @returns {number[] | null}
 */
function buildRightHandClose(pcs, bassMidi) {
  const startPc = pcs[0];
  const candidates = midiInstancesInRange(startPc, RH_HARD_RANGE.min, RH_HARD_RANGE.max)
    .filter((m) => m > bassMidi);
  if (candidates.length === 0) return null;

  const center = defaultRhCenter();
  let best = null;
  let bestScore = Infinity;
  for (const start of candidates) {
    const stack = buildCloseStack(pcs, start);
    if (!stack.every((n) => midiInRange(n, RH_HARD_RANGE))) continue;
    if (span(stack) > 12) continue;

    const sorted = [...stack].sort((a, b) => a - b);
    if (sorted[0] < RH_SOFT_RANGE.min) continue;

    const avg = stack.reduce((a, b) => a + b, 0) / stack.length;
    const distance = Math.abs(avg - center);
    const gap = sorted[0] - bassMidi;
    // Privilegie un voicing centre, avec un ecart LH/RH raisonnable (< 12 demi-tons).
    const gapPenalty = gap > 12 ? (gap - 12) * 2 : 0;
    const score = distance + gapPenalty;
    if (score < bestScore) {
      bestScore = score;
      best = stack;
    }
  }
  return best;
}

/**
 * Parmi une liste de candidates de rôles, choisit la premiere qui produit un close valide.
 * Les candidates sont ordonnees par preference (nombre de notes decroissant, extensions essentielles).
 * @param {VoicingInput} input
 * @param {string[][]} roleCandidates
 * @param {number} bassMidi
 * @returns {{ notes: number[], roles: string[] } | null}
 */
function buildBestCloseFromRoleCandidates(input, roleCandidates, bassMidi) {
  for (const roles of roleCandidates) {
    const pcs = rolesToPcs(input, roles);
    if (pcs.length !== roles.length) continue;
    const notes = buildRightHandClose(pcs, bassMidi);
    if (notes) return { notes, roles };
  }
  return null;
}

/**
 * Genere un voicing Shell : basse en LH, guide tones + extension en RH.
 * @param {VoicingInput} input
 * @returns {import('./base-generator.js').GeneratorResult}
 */
export function generateShell(input) {
  const diagnostics = [];
  if (!hasThirdAndSeventh(input)) {
    return unavailableResult('Shell: accord sans tierce ou sans septieme');
  }

  const { hand: lh, diagnostics: lhDiagnostics } = buildStandardLeftHand(input);
  diagnostics.push(...lhDiagnostics);
  if (!lh) {
    return unavailableResult('Shell: impossible de placer la basse', diagnostics);
  }

  const roles = resolveRoles(input);
  const roleCandidates = [
    ['third', 'seventh', 'ninth'],
    ['third', 'seventh', 'thirteenth'],
    ['third', 'seventh', 'eleventh'],
    ['third', 'seventh', 'fifth'],
    ['third', 'seventh'],
  ].filter((list) => list.every((r) => r === 'third' || r === 'seventh' || roles[r] != null));

  const best = buildBestCloseFromRoleCandidates(input, roleCandidates, Math.max(...lh.notes));
  if (!best) {
    return unavailableResult('Shell: impossible de placer la main droite', diagnostics);
  }
  const rhNotes = best.notes;

  const rh = createHandVoicing('RH', rhNotes, { source: 'shell' });
  const candidate = buildCandidate(input, lh, rh, 'shell', 'Shell', {
    generatorId: 'shell-v2',
    style: 'shell',
  });
  return successResult(candidate, diagnostics);
}

/**
 * Genere un Two-Note Shell : basse en LH, guide tones seuls en RH.
 * @param {VoicingInput} input
 * @returns {import('./base-generator.js').GeneratorResult}
 */
export function generateTwoNoteShell(input) {
  const diagnostics = [];
  if (!hasThirdAndSeventh(input)) {
    return unavailableResult('Two-Note Shell: accord sans tierce ou sans septieme');
  }

  const { hand: lh, diagnostics: lhDiagnostics } = buildStandardLeftHand(input);
  diagnostics.push(...lhDiagnostics);
  if (!lh) {
    return unavailableResult('Two-Note Shell: impossible de placer la basse', diagnostics);
  }

  const pcs = rolesToPcs(input, ['third', 'seventh']);
  const rhNotes = buildRightHandClose(pcs, Math.max(...lh.notes));
  if (!rhNotes) {
    return unavailableResult('Two-Note Shell: impossible de placer la main droite', diagnostics);
  }

  const rh = createHandVoicing('RH', rhNotes, { source: 'twoNoteShell' });
  const candidate = buildCandidate(input, lh, rh, 'twoNoteShell', 'Two-Note Shell', {
    generatorId: 'twoNoteShell-v1',
    style: 'twoNoteShell',
  });
  return successResult(candidate, diagnostics);
}

/**
 * Genere un voicing Rootless A : structure 3-5-7-9 en close, pas de fondamentale.
 * @param {VoicingInput} input
 * @returns {import('./base-generator.js').GeneratorResult}
 */
export function generateRootlessA(input) {
  const diagnostics = [];
  const roles = resolveRoles(input);
  if (!hasThirdAndSeventh(input) || !hasNinth(input) || roles.fifth == null) {
    return unavailableResult('Rootless A: requiert tierce, quinte, septieme et neuvieme');
  }

  const pcs = rolesToPcs(input, ['third', 'fifth', 'seventh', 'ninth']);
  const rhNotes = buildRightHandClose(pcs, RH_HARD_RANGE.min - 1);
  if (!rhNotes) {
    return unavailableResult('Rootless A: impossible de placer les voix', diagnostics);
  }

  const rh = createHandVoicing('RH', rhNotes, { source: 'rootlessA' });
  const candidate = buildCandidate(input, createHandVoicing('LH', []), rh, 'rootlessA', 'Rootless A', {
    generatorId: 'rootlessA-v2',
    style: 'rootlessA',
    rootless: true,
  });
  return successResult(candidate, diagnostics);
}

/**
 * Genere un voicing Rootless B : structure 7-3-5-9 en close, pas de fondamentale.
 * @param {VoicingInput} input
 * @returns {import('./base-generator.js').GeneratorResult}
 */
export function generateRootlessB(input) {
  const diagnostics = [];
  const roles = resolveRoles(input);
  if (!hasThirdAndSeventh(input) || !hasNinth(input) || roles.fifth == null) {
    return unavailableResult('Rootless B: requiert tierce, quinte, septieme et neuvieme');
  }

  const pcs = rolesToPcs(input, ['seventh', 'third', 'fifth', 'ninth']);
  const rhNotes = buildRightHandClose(pcs, RH_HARD_RANGE.min - 1);
  if (!rhNotes) {
    return unavailableResult('Rootless B: impossible de placer les voix', diagnostics);
  }

  const rh = createHandVoicing('RH', rhNotes, { source: 'rootlessB' });
  const candidate = buildCandidate(input, createHandVoicing('LH', []), rh, 'rootlessB', 'Rootless B', {
    generatorId: 'rootlessB-v2',
    style: 'rootlessB',
    rootless: true,
  });
  return successResult(candidate, diagnostics);
}

/**
 * Genere les candidates de rôles pour un Close, de la plus riche a la plus pauvre,
 * en gardant root et third.
 * @param {VoicingInput} input
 * @returns {string[][]}
 */
function generateCloseRoleCandidates(input) {
  const roles = resolveRoles(input);
  const base = [];
  for (const role of ROLE_ORDER) {
    if (roles[role] != null && role !== 'fifth') base.push(role);
  }
  // Si pas de 7e ni d'extension, la quinte est fondamentale.
  if (roles.fifth != null && !roles.seventh && !roles.ninth && !roles.eleventh && !roles.thirteenth) {
    base.splice(base.indexOf('third') + 1, 0, 'fifth');
  }

  const candidates = [];
  // Essayer toutes les combinaisons contenant root et third, de longueur decroissante.
  for (let len = Math.min(6, base.length); len >= 3; len--) {
    const combos = combinationsOfSize(base, len).filter((c) => c.includes('root') && c.includes('third'));
    // Trier par priorite : plus d'extensions essentielles d'abord (seventh, ninth...).
    combos.sort((a, b) => {
      const score = (arr) => arr.reduce((s, r) => s + ROLE_ORDER.indexOf(r), 0);
      return score(a) - score(b);
    });
    candidates.push(...combos);
  }
  return candidates;
}

/**
 * Genere toutes les combinaisons d'une taille donnee.
 * @template T
 * @param {T[]} arr
 * @param {number} size
 * @returns {T[][]}
 */
function combinationsOfSize(arr, size) {
  if (size === 0) return [[]];
  if (size > arr.length) return [];
  const result = [];
  function backtrack(start, current) {
    if (current.length === size) {
      result.push([...current]);
      return;
    }
    for (let i = start; i < arr.length; i++) {
      current.push(arr[i]);
      backtrack(i + 1, current);
      current.pop();
    }
  }
  backtrack(0, []);
  return result;
}

/**
 * Genere des candidates de roles sans la fondamentale, en incluant la quinte
 * pour les familles etendues (stride, open, spread, block).
 * @param {VoicingInput} input
 * @param {number} [minLength]
 * @param {number} [maxLength]
 * @returns {string[][]}
 */
function generateNonRootRoleCandidates(input, minLength = 3, maxLength = 6) {
  const roles = resolveRoles(input);
  const base = [];
  for (const role of ROLE_ORDER) {
    if (roles[role] != null && role !== 'root') base.push(role);
  }
  // La quinte est disponible pour augmenter le nombre de voix non-fondamentales.
  if (roles.fifth != null && !base.includes('fifth')) {
    base.splice(base.indexOf('third') + 1, 0, 'fifth');
  }

  const candidates = [];
  for (let len = Math.min(maxLength, base.length); len >= minLength; len--) {
    const combos = combinationsOfSize(base, len).filter((c) => c.includes('third'));
    // Priorite : extensions caracteristiques d'abord.
    combos.sort((a, b) => {
      const score = (arr) => arr.reduce((s, r) => s + ROLE_ORDER.indexOf(r), 0);
      return score(a) - score(b);
    });
    candidates.push(...combos);
  }
  return candidates;
}

/**
 * Genere un voicing Close : empilement compact des notes de l'accord dans une octave.
 * @param {VoicingInput} input
 * @returns {import('./base-generator.js').GeneratorResult}
 */
export function generateClose(input) {
  const diagnostics = [];
  if (input.chordTonePcs.length < 3) {
    return unavailableResult('Close: accord a moins de 3 notes');
  }

  const roleCandidates = generateCloseRoleCandidates(input);
  const center = defaultRhCenter();
  let best = null;
  let bestDistance = Infinity;

  for (const roleList of roleCandidates) {
    const pcs = rolesToPcs(input, roleList);
    if (pcs.length !== roleList.length) continue;
    const startPc = pcs[0];
    const instances = midiInstancesInRange(startPc, RH_SOFT_RANGE.min, RH_SOFT_RANGE.max);
    for (const start of instances) {
      const closeStack = buildCloseStack(pcs, start);
      if (!closeStack.every((n) => midiInRange(n, RH_HARD_RANGE))) continue;
      if (span(closeStack) > 12) continue;

      const avg = closeStack.reduce((a, b) => a + b, 0) / closeStack.length;
      const distance = Math.abs(avg - center);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = { notes: closeStack, roles: roleList };
      }
    }
  }

  if (!best) {
    return unavailableResult('Close: aucune position valide dans la tessiture', diagnostics);
  }

  const { note: bassNote, diagnostics: bassDiagnostics } = buildBassBelow(input, best.notes[0]);
  diagnostics.push(...bassDiagnostics);
  if (bassNote == null) {
    return unavailableResult('Close: impossible de placer la basse sous le RH', diagnostics);
  }

  const lh = createHandVoicing('LH', [bassNote], { source: 'close' });
  const rh = createHandVoicing('RH', best.notes, { source: 'close' });
  const candidate = buildCandidate(input, lh, rh, 'close', 'Close', {
    generatorId: 'close-v3',
    style: 'close',
  });
  return successResult(candidate, diagnostics);
}

/**
 * Genere un voicing 4-Way Close : exactement 4 voix en close.
 * @param {VoicingInput} input
 * @returns {import('./base-generator.js').GeneratorResult}
 */
export function generateFourWayClose(input) {
  const diagnostics = [];
  if (!hasAtLeastFourNotes(input) || !hasThirdAndSeventh(input)) {
    return unavailableResult('4-Way Close: requiert au moins 4 notes avec tierce et septieme');
  }

  const roles = resolveRoles(input);
  const roleCandidates = [];
  // Priorite : extensions caracteristiques d'abord.
  for (const ext of ['ninth', 'thirteenth', 'eleventh']) {
    if (roles[ext] != null) roleCandidates.push(['root', 'third', 'seventh', ext]);
  }
  if (roles.fifth != null) roleCandidates.push(['root', 'third', 'fifth', 'seventh']);

  const center = defaultRhCenter();
  let best = null;
  let bestDistance = Infinity;

  for (const roleList of roleCandidates) {
    const pcs = rolesToPcs(input, roleList);
    if (pcs.length !== 4) continue;
    const startPc = pcs[0];
    const instances = midiInstancesInRange(startPc, RH_SOFT_RANGE.min, RH_SOFT_RANGE.max);
    for (const start of instances) {
      const closeStack = buildCloseStack(pcs, start);
      if (!closeStack.every((n) => midiInRange(n, RH_HARD_RANGE))) continue;
      if (span(closeStack) > 12) continue;

      const avg = closeStack.reduce((a, b) => a + b, 0) / closeStack.length;
      const distance = Math.abs(avg - center);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = { notes: closeStack, roles: roleList };
      }
    }
  }

  if (!best) {
    return unavailableResult('4-Way Close: aucune position valide dans la tessiture', diagnostics);
  }

  const { note: bassNote, diagnostics: bassDiagnostics } = buildBassBelow(input, best.notes[0]);
  diagnostics.push(...bassDiagnostics);
  if (bassNote == null) {
    return unavailableResult('4-Way Close: impossible de placer la basse sous le RH', diagnostics);
  }

  const lh = createHandVoicing('LH', [bassNote], { source: 'fourWayClose' });
  const rh = createHandVoicing('RH', best.notes, { source: 'fourWayClose' });
  const candidate = buildCandidate(input, lh, rh, 'fourWayClose', '4-Way Close', {
    generatorId: 'fourWayClose-v3',
    style: 'fourWayClose',
  });
  return successResult(candidate, diagnostics);
}

/**
 * Genere un voicing Drop 2 a partir d'un 4-Way Close valide.
 * Descend la 2e voix depuis le haut d'une octave en LH (avec la basse).
 * La basse est placee a un octave sous le close parent pour garder le span LH raisonnable.
 * @param {VoicingInput} input
 * @returns {import('./base-generator.js').GeneratorResult}
 */
export function generateDrop2(input) {
  const diagnostics = [];
  if (!hasAtLeastFourNotes(input) || !hasThirdAndSeventh(input)) {
    return unavailableResult('Drop 2: requiert au moins 4 notes avec tierce et septieme');
  }

  const roles = resolveRoles(input);
  const roleCandidates = [];
  for (const ext of ['ninth', 'thirteenth', 'eleventh']) {
    if (roles[ext] != null) roleCandidates.push(['root', 'third', 'seventh', ext]);
  }
  if (roles.fifth != null) roleCandidates.push(['root', 'third', 'fifth', 'seventh']);

  const targetPc = input.bassPc ?? input.rootPc;
  const center = defaultRhCenter();
  let best = null;
  let bestScore = Infinity;

  for (const roleList of roleCandidates) {
    const pcs = rolesToPcs(input, roleList);
    if (pcs.length !== 4) continue;
    const startPc = pcs[0];
    const instances = midiInstancesInRange(startPc, RH_HARD_RANGE.min, RH_HARD_RANGE.max);
    for (const start of instances) {
      const closeStack = buildCloseStack(pcs, start);
      if (!closeStack.every((n) => midiInRange(n, RH_HARD_RANGE))) continue;
      if (span(closeStack) > 12) continue;

      const sortedClose = [...closeStack].sort((a, b) => a - b);
      const lowestClose = sortedClose[0];
      const secondFromTop = sortedClose[sortedClose.length - 2];
      const droppedNote = secondFromTop - 12;
      let bassNote = lowestClose - 12;
      while (bassNote % 12 !== targetPc && bassNote > LH_HARD_RANGE.min) bassNote -= 1;

      if (!midiInRange(bassNote, LH_HARD_RANGE)) continue;
      if (!midiInRange(droppedNote, LH_HARD_RANGE)) continue;
      if (droppedNote <= bassNote) continue;
      if (droppedNote >= Math.min(...closeStack)) continue;

      const avg = closeStack.reduce((a, b) => a + b, 0) / closeStack.length;
      const distance = Math.abs(avg - center);
      const gap = sortedClose[0] - Math.max(bassNote, droppedNote);
      // Priorite aux voicings compacts (gap petit), puis centres.
      const score = gap + distance / 2;
      if (score < bestScore) {
        bestScore = score;
        const rhNotes = closeStack.filter((n) => n !== secondFromTop).sort((a, b) => a - b);
        best = {
          lh: createHandVoicing('LH', [bassNote, droppedNote].sort((a, b) => a - b), { source: 'drop2' }),
          rh: createHandVoicing('RH', rhNotes, { source: 'drop2' }),
        };
      }
    }
  }

  if (!best) {
    return unavailableResult('Drop 2: aucune position valide dans les tessitures', diagnostics);
  }

  const candidate = buildCandidate(input, best.lh, best.rh, 'drop2', 'Drop 2', {
    generatorId: 'drop2-v3',
    style: 'drop2',
  });
  return successResult(candidate, diagnostics);
}

/**
 * Genere un voicing Drop 3 a partir d'un 4-Way Close valide.
 * Descend la 3e voix depuis le haut (2e depuis le bas) d'une octave en LH (avec la basse).
 * @param {VoicingInput} input
 * @returns {import('./base-generator.js').GeneratorResult}
 */
export function generateDrop3(input) {
  const diagnostics = [];
  if (!hasAtLeastFourNotes(input) || !hasThirdAndSeventh(input)) {
    return unavailableResult('Drop 3: requiert au moins 4 notes avec tierce et septieme');
  }

  const roles = resolveRoles(input);
  const roleCandidates = [];
  for (const ext of ['ninth', 'thirteenth', 'eleventh']) {
    if (roles[ext] != null) roleCandidates.push(['root', 'third', 'seventh', ext]);
  }
  if (roles.fifth != null) roleCandidates.push(['root', 'third', 'fifth', 'seventh']);

  const targetPc = input.bassPc ?? input.rootPc;
  const center = defaultRhCenter();
  let best = null;
  let bestScore = Infinity;

  for (const roleList of roleCandidates) {
    const pcs = rolesToPcs(input, roleList);
    if (pcs.length !== 4) continue;
    const startPc = pcs[0];
    const instances = midiInstancesInRange(startPc, RH_HARD_RANGE.min, RH_HARD_RANGE.max);
    for (const start of instances) {
      const closeStack = buildCloseStack(pcs, start);
      if (!closeStack.every((n) => midiInRange(n, RH_HARD_RANGE))) continue;
      if (span(closeStack) > 12) continue;

      const sortedClose = [...closeStack].sort((a, b) => a - b);
      const lowestClose = sortedClose[0];
      const secondFromBottom = sortedClose[1];
      const droppedNote = secondFromBottom - 12;
      let bassNote = lowestClose - 12;
      while (bassNote % 12 !== targetPc && bassNote > LH_HARD_RANGE.min) bassNote -= 1;

      if (!midiInRange(bassNote, LH_HARD_RANGE)) continue;
      if (!midiInRange(droppedNote, LH_HARD_RANGE)) continue;
      if (droppedNote <= bassNote) continue;
      if (droppedNote >= Math.min(...closeStack)) continue;

      const avg = closeStack.reduce((a, b) => a + b, 0) / closeStack.length;
      const distance = Math.abs(avg - center);
      const gap = sortedClose[0] - Math.max(bassNote, droppedNote);
      const score = gap + distance / 2;
      if (score < bestScore) {
        bestScore = score;
        const rhNotes = closeStack.filter((n) => n !== secondFromBottom).sort((a, b) => a - b);
        best = {
          lh: createHandVoicing('LH', [bassNote, droppedNote].sort((a, b) => a - b), { source: 'drop3' }),
          rh: createHandVoicing('RH', rhNotes, { source: 'drop3' }),
        };
      }
    }
  }

  if (!best) {
    return unavailableResult('Drop 3: aucune position valide dans les tessitures', diagnostics);
  }

  const candidate = buildCandidate(input, best.lh, best.rh, 'drop3', 'Drop 3', {
    generatorId: 'drop3-v2',
    style: 'drop3',
  });
  return successResult(candidate, diagnostics);
}

/**
 * Registre des generateurs par famille.
 * @type {Record<string, (input: VoicingInput) => import('./base-generator.js').GeneratorResult>}
 */
/**
 * Genere un voicing Block / Locked Hands : 5 voix reelles en close sur 2 mains.
 * LH = 2 notes les plus graves, RH = 3 notes les plus aigues, span total ≤ 12.
 * @param {VoicingInput} input
 * @returns {import('./base-generator.js').GeneratorResult}
 */
export function generateBlock(input) {
  const diagnostics = [];
  if (input.chordTonePcs.length < 5) {
    return unavailableResult('Block: requiert au moins 5 notes distinctes');
  }

  const roles = resolveRoles(input);
  const selectedRoles = [];
  for (const role of ROLE_ORDER) {
    if (roles[role] != null) selectedRoles.push(role);
  }
  // On veut 5 notes distinctes. Si plus de 5, on prefere extensions a la quinte.
  let finalRoles = selectedRoles;
  if (selectedRoles.length > 5) {
    const withoutFifth = selectedRoles.filter((r) => r !== 'fifth');
    if (withoutFifth.length >= 5) finalRoles = withoutFifth.slice(0, 5);
    else finalRoles = selectedRoles.slice(0, 5);
  }

  const pcs = rolesToPcs(input, finalRoles);
  if (pcs.length < 5) {
    return unavailableResult('Block: pas assez de roles distincts', diagnostics);
  }

  // Le close doit tenir dans une octave : trier les pitch classes par hauteur.
  const sortedPcs = [...pcs].sort((a, b) => a - b);
  if ((sortedPcs[sortedPcs.length - 1] - sortedPcs[0]) > 12) {
    return unavailableResult('Block: les 5 notes selectionnees ne tiennent pas dans une octave', diagnostics);
  }

  // Base stack dans une octave arbitraire, puis rotations et transpositions.
  const baseStack = buildCloseStack(sortedPcs, sortedPcs[0]);
  const rotations = rotateCloseStack(baseStack);

  const center = defaultRhCenter();
  let best = null;
  let bestDistance = Infinity;

  for (const rot of rotations) {
    // Transposer pour que le cluster s'inscrive dans les tessitures.
    const minK = Math.ceil((LH_HARD_RANGE.min - rot[0]) / 12);
    const maxK = Math.floor((RH_HARD_RANGE.max - 12 - rot[0]) / 12);
    for (let k = minK; k <= maxK; k++) {
      const shifted = rot.map((n) => n + 12 * k);
      const lhNotes = shifted.slice(0, 2);
      const rhNotes = shifted.slice(2);
      if (!lhNotes.every((n) => midiInRange(n, LH_HARD_RANGE))) continue;
      if (!rhNotes.every((n) => midiInRange(n, RH_HARD_RANGE))) continue;
      if (span(shifted) > 12) continue;

      const avg = shifted.reduce((a, b) => a + b, 0) / shifted.length;
      const distance = Math.abs(avg - center);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = {
          lh: createHandVoicing('LH', lhNotes, { source: 'block' }),
          rh: createHandVoicing('RH', rhNotes, { source: 'block' }),
        };
      }
    }
  }

  if (!best) {
    return unavailableResult('Block: aucune position compacte valide', diagnostics);
  }

  const candidate = buildCandidate(input, best.lh, best.rh, 'block', 'Block / Locked Hands', {
    generatorId: 'block-v2',
    style: 'block',
  });
  return successResult(candidate, diagnostics);
}

/**
 * Genere un voicing Stride : basse lointaine + accord compact en RH.
 * Le RH ne contient jamais la fondamentale pour eviter un comptage de voix degrade.
 * @param {VoicingInput} input
 * @returns {import('./base-generator.js').GeneratorResult}
 */
export function generateStride(input) {
  const diagnostics = [];
  if (input.chordTonePcs.length < 4) {
    return unavailableResult('Stride: requiert au moins 4 notes distinctes');
  }

  const nonRootCandidates = generateNonRootRoleCandidates(input, 3, 5);
  if (nonRootCandidates.length === 0) {
    return unavailableResult('Stride: pas assez de notes non-fondamentales', diagnostics);
  }

  const targetPc = input.bassPc ?? input.rootPc;
  const bassInstances = midiInstancesInRange(targetPc, LH_HARD_RANGE.min, LH_HARD_RANGE.max)
    .filter((n) => n <= LH_SOFT_RANGE.max);
  if (bassInstances.length === 0) {
    return unavailableResult('Stride: impossible de placer la basse', diagnostics);
  }

  let best = null;
  let bestGap = -Infinity;

  for (const bassNote of bassInstances) {
    for (const roleList of nonRootCandidates) {
      const pcs = rolesToPcs(input, roleList);
      if (pcs.length !== roleList.length) continue;
      const notes = buildRightHandClose(pcs, bassNote);
      if (!notes) continue;

      const gap = notes[0] - bassNote;
      if (gap < 12) continue; // stride requiert un ecart d'au moins une octave

      if (gap > bestGap) {
        bestGap = gap;
        best = {
          lh: createHandVoicing('LH', [bassNote], { source: 'stride' }),
          rh: createHandVoicing('RH', notes, { source: 'stride' }),
        };
      }
    }
  }

  if (!best) {
    return unavailableResult('Stride: impossible de placer un accord compact au-dessus d\'une basse lointaine', diagnostics);
  }

  const candidate = buildCandidate(input, best.lh, best.rh, 'stride', 'Stride', {
    generatorId: 'stride-v2',
    style: 'stride',
  });
  return successResult(candidate, diagnostics);
}

/**
 * Genere un voicing Open : close avec une voix deplacee d'une octave.
 * @param {VoicingInput} input
 * @returns {import('./base-generator.js').GeneratorResult}
 */
export function generateOpen(input) {
  const diagnostics = [];
  if (input.chordTonePcs.length < 4) {
    return unavailableResult('Open: requiert au moins 4 notes distinctes');
  }

  const { hand: lhBass, diagnostics: lhDiagnostics } = buildStandardLeftHand(input);
  diagnostics.push(...lhDiagnostics);
  if (!lhBass) {
    return unavailableResult('Open: impossible de placer la basse', diagnostics);
  }

  const bassMidi = Math.max(...lhBass.notes);
  // Le RH est un close des notes non-fondamentales ; la fondamentale reste en LH.
  const roleCandidates = generateNonRootRoleCandidates(input, 3, 5);
  let best = null;
  let bestSpan = Infinity;

  for (const roleList of roleCandidates) {
    const pcs = rolesToPcs(input, roleList);
    if (pcs.length !== roleList.length) continue;

    const closeNotes = buildRightHandClose(pcs, bassMidi);
    if (!closeNotes) continue;

    // Ouvrir en montant une voix d'une octave (sauf la plus haute).
    for (let i = 0; i < closeNotes.length - 1; i++) {
      const openNotes = [...closeNotes];
      openNotes[i] += 12;
      openNotes.sort((a, b) => a - b);

      if (!openNotes.every((n) => midiInRange(n, RH_HARD_RANGE))) continue;
      if (openNotes[0] <= bassMidi) continue;
      if (span(openNotes) <= 12) continue; // doit depasser le close parent

      if (span(openNotes) < bestSpan) {
        bestSpan = span(openNotes);
        best = {
          lh: lhBass,
          rh: createHandVoicing('RH', openNotes, { source: 'open' }),
        };
      }
    }
  }

  if (!best) {
    return unavailableResult('Open: aucune position valide', diagnostics);
  }

  const candidate = buildCandidate(input, best.lh, best.rh, 'open', 'Open', {
    generatorId: 'open-v2',
    style: 'open',
  });
  return successResult(candidate, diagnostics);
}

/**
 * Genere un voicing Spread : voix etalees sur plusieurs octaves.
 * @param {VoicingInput} input
 * @returns {import('./base-generator.js').GeneratorResult}
 */
export function generateSpread(input) {
  const diagnostics = [];
  if (input.chordTonePcs.length < 4) {
    return unavailableResult('Spread: requiert au moins 4 notes distinctes');
  }

  const { hand: lhBass, diagnostics: lhDiagnostics } = buildStandardLeftHand(input);
  diagnostics.push(...lhDiagnostics);
  if (!lhBass) {
    return unavailableResult('Spread: impossible de placer la basse', diagnostics);
  }

  // Une note par octave au-dessus de la basse ; 3 notes en RH suffisent.
  const roleCandidates = generateNonRootRoleCandidates(input, 3, 4);
  let best = null;
  let bestSpread = -Infinity;

  for (const roleList of roleCandidates) {
    const pcs = rolesToPcs(input, roleList);
    if (pcs.length !== roleList.length) continue;

    const notes = [];
    let lastOct = Math.floor(Math.max(...lhBass.notes) / 12);
    let valid = true;
    for (const pc of pcs) {
      lastOct += 1;
      let note = lastOct * 12 + pc;
      // S'assurer que la note est bien au-dessus de la basse et dans la tessiture RH.
      while (note <= Math.max(...lhBass.notes)) note += 12;
      if (!midiInRange(note, RH_HARD_RANGE)) {
        valid = false;
        break;
      }
      notes.push(note);
    }
    if (!valid) continue;
    if (!notes.every((n) => midiInRange(n, RH_HARD_RANGE))) continue;

    const spread = notes[notes.length - 1] - notes[0];
    if (spread <= 12) continue;
    if (notes[0] <= Math.max(...lhBass.notes)) continue;

    if (spread > bestSpread) {
      bestSpread = spread;
      best = {
        lh: lhBass,
        rh: createHandVoicing('RH', notes, { source: 'spread' }),
      };
    }
  }

  if (!best) {
    return unavailableResult('Spread: aucune position valide', diagnostics);
  }

  const candidate = buildCandidate(input, best.lh, best.rh, 'spread', 'Spread', {
    generatorId: 'spread-v2',
    style: 'spread',
  });
  return successResult(candidate, diagnostics);
}

/**
 * Genere un voicing Quartal : chaine d'intervalles de quartes.
 * @param {VoicingInput} input
 * @returns {import('./base-generator.js').GeneratorResult}
 */
export function generateQuartal(input) {
  const diagnostics = [];
  if (!input.quality.includes('sus') && !input.quality.includes('11')) {
    return unavailableResult('Quartal: qualite non compatible (sus ou 11 requis)');
  }

  const { hand: lhBass, diagnostics: lhDiagnostics } = buildStandardLeftHand(input);
  diagnostics.push(...lhDiagnostics);
  if (!lhBass) {
    return unavailableResult('Quartal: impossible de placer la basse', diagnostics);
  }

  const allowedPcs = new Set(input.chordTonePcs);
  const bassPc = input.bassPc ?? input.rootPc;
  allowedPcs.add(bassPc);

  // Construire des stacks quartals en commencant par chaque note de l'accord au-dessus de la basse.
  let best = null;
  let bestSpan = Infinity;

  for (const startPc of allowedPcs) {
    if (startPc === bassPc) continue;
    const startInstances = midiInstancesInRange(startPc, RH_HARD_RANGE.min, RH_HARD_RANGE.max)
      .filter((n) => n > Math.max(...lhBass.notes));
    for (const start of startInstances) {
      const stack = [start];
      let current = start;
      while (stack.length < 5) {
        // Chercher la prochaine note de l'accord a un intervalle de quartes (5, 6 ou 7 demi-tons).
        const currentPc = current % 12;
        const candidates = [5, 6, 7]
          .map((interval) => (currentPc + interval) % 12)
          .filter((pc) => allowedPcs.has(pc) && !stack.some((n) => n % 12 === pc));
        if (candidates.length === 0) break;
        const nextPc = candidates[0];
        const nextInstances = midiInstancesInRange(nextPc, RH_HARD_RANGE.min, RH_HARD_RANGE.max)
          .filter((n) => n > current);
        if (nextInstances.length === 0) break;
        current = nextInstances[0];
        stack.push(current);
      }
      if (stack.length < 3) continue;
      if (!stack.every((n) => midiInRange(n, RH_HARD_RANGE))) continue;
      if (span(stack) > 24) continue;
      if (span(stack) < bestSpan) {
        bestSpan = span(stack);
        best = {
          lh: lhBass,
          rh: createHandVoicing('RH', stack, { source: 'quartal' }),
        };
      }
    }
  }

  if (!best) {
    return unavailableResult('Quartal: impossible de construire une chaine de quartes valide', diagnostics);
  }

  const candidate = buildCandidate(input, best.lh, best.rh, 'quartal', 'Quartal', {
    generatorId: 'quartal-v1',
    style: 'quartal',
    rootless: true, // la basse peut etre la fondamentale, mais le RH est sans structure 3-7 classique
  });
  return successResult(candidate, diagnostics);
}

/**
 * Genere un voicing So What : stack quartal decale [3e, 6e/9e, 4e/11e].
 * @param {VoicingInput} input
 * @returns {import('./base-generator.js').GeneratorResult}
 */
export function generateSoWhat(input) {
  const diagnostics = [];
  const q = input.quality;
  if ((q !== 'm7' && q !== 'm9') || input.chordTonePcs.length < 4) {
    return unavailableResult('So What: requiert un accord m7 ou m9 non altere');
  }

  const roles = resolveRoles(input);
  if (roles.third == null || roles.seventh == null || roles.fourth == null) {
    return unavailableResult('So What: requiert tierce, septieme et quarte/11e');
  }

  const { hand: lhBass, diagnostics: lhDiagnostics } = buildStandardLeftHand(input);
  diagnostics.push(...lhDiagnostics);
  if (!lhBass) {
    return unavailableResult('So What: impossible de placer la basse', diagnostics);
  }

  // Stack : tierce, tierce + 5 demi-tons (sixte/neuvième), + 5 demi-tons (quinte/4e du mode).
  const stackPcs = [roles.third, (roles.third + 5) % 12, (roles.third + 10) % 12];
  if (!stackPcs.every((pc) => input.chordTonePcs.includes(pc))) {
    return unavailableResult('So What: les notes du stack quartal ne sont pas toutes dans l\'accord');
  }

  const notes = buildRightHandClose(stackPcs, Math.max(...lhBass.notes));
  if (!notes) {
    return unavailableResult('So What: impossible de placer le stack', diagnostics);
  }

  const candidate = buildCandidate(input, lhBass, createHandVoicing('RH', notes, { source: 'soWhat' }), 'soWhat', 'So What', {
    generatorId: 'soWhat-v1',
    style: 'soWhat',
    rootless: true,
  });
  return successResult(candidate, diagnostics);
}

/**
 * Genere un voicing Upper Structure : triade superposee sur une fondamentale.
 * @param {VoicingInput} input
 * @returns {import('./base-generator.js').GeneratorResult}
 */
export function generateUpperStructure(input) {
  const diagnostics = [];
  if (input.chordTonePcs.length < 4) {
    return unavailableResult('Upper Structure: requiert au moins 4 notes distinctes');
  }

  const { hand: lhBass, diagnostics: lhDiagnostics } = buildStandardLeftHand(input);
  diagnostics.push(...lhDiagnostics);
  if (!lhBass) {
    return unavailableResult('Upper Structure: impossible de placer la basse', diagnostics);
  }

  const allowedPcs = new Set(input.chordTonePcs);
  const bassMidi = Math.max(...lhBass.notes);

  // Types de triades a tester.
  const triadTypes = [
    { name: 'majeure', intervals: [0, 4, 7] },
    { name: 'mineure', intervals: [0, 3, 7] },
    { name: 'diminuee', intervals: [0, 3, 6] },
    { name: 'augmentee', intervals: [0, 4, 8] },
  ];

  let best = null;
  let bestSpan = Infinity;

  for (let rootPc = 0; rootPc < 12; rootPc++) {
    for (const triad of triadTypes) {
      const triadPcs = triad.intervals.map((i) => (rootPc + i) % 12);
      if (!triadPcs.every((pc) => allowedPcs.has(pc))) continue;
      if (triadPcs.includes(input.rootPc)) continue; // triade ne doit pas contenir la fondamentale

      const notes = buildRightHandClose(triadPcs, bassMidi);
      if (!notes) continue;
      if (!notes.every((n) => midiInRange(n, RH_HARD_RANGE))) continue;
      if (span(notes) > 12) continue;

      if (span(notes) < bestSpan) {
        bestSpan = span(notes);
        best = {
          lh: lhBass,
          rh: createHandVoicing('RH', notes, { source: 'upperStructure' }),
          triadName: triad.name,
          triadRoot: rootPc,
        };
      }
    }
  }

  if (!best) {
    return unavailableResult('Upper Structure: aucune triade superposable trouvee', diagnostics);
  }

  const candidate = buildCandidate(input, best.lh, best.rh, 'upperStructure', `Upper Structure (${best.triadName})`, {
    generatorId: 'upperStructure-v1',
    style: 'upperStructure',
    triadRootPc: best.triadRoot,
    triadType: best.triadName,
  });
  return successResult(candidate, diagnostics);
}

/**
 * Registre des generateurs par famille.
 * @type {Record<string, (input: VoicingInput) => import('./base-generator.js').GeneratorResult>}
 */
export const FAMILY_GENERATORS = Object.freeze({
  shell: generateShell,
  twoNoteShell: generateTwoNoteShell,
  rootlessA: generateRootlessA,
  rootlessB: generateRootlessB,
  close: generateClose,
  fourWayClose: generateFourWayClose,
  drop2: generateDrop2,
  drop3: generateDrop3,
  block: generateBlock,
  stride: generateStride,
  open: generateOpen,
  spread: generateSpread,
  quartal: generateQuartal,
  soWhat: generateSoWhat,
  upperStructure: generateUpperStructure,
});
