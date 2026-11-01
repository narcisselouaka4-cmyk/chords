// Utilitaires de placement MIDI pour les voicings.

import {
  LH_HARD_RANGE,
  LH_SOFT_RANGE,
  RH_HARD_RANGE,
  RH_SOFT_RANGE,
  midiInRange,
  span,
} from '../hand-ranges.js';

/**
 * Genere toutes les instances MIDI d'une pitch class dans une plage.
 * @param {number} pc
 * @param {number} minMidi
 * @param {number} maxMidi
 * @returns {number[]}
 */
export function midiInstancesInRange(pc, minMidi, maxMidi) {
  const notes = [];
  let first = minMidi + ((pc - (minMidi % 12) + 12) % 12);
  if (first < minMidi) first += 12;
  for (let m = first; m <= maxMidi; m += 12) {
    notes.push(m);
  }
  return notes;
}

/**
 * Choisit l'instance MIDI la plus proche d'un centre donne.
 * @param {number[]} instances
 * @param {number} center
 * @returns {number | null}
 */
export function pickNearest(instances, center) {
  if (!instances || instances.length === 0) return null;
  return instances.reduce((best, n) =>
    Math.abs(n - center) < Math.abs(best - center) ? n : best
  );
}

/**
 * Place une pitch class au-dessus d'une note de reference, dans une plage donnee.
 * @param {number} pc
 * @param {number} referenceMidi
 * @param {{ min: number, max: number }} range
 * @returns {number | null}
 */
export function placeAbove(pc, referenceMidi, range) {
  const instances = midiInstancesInRange(pc, range.min, range.max);
  const candidates = instances.filter((n) => n > referenceMidi);
  if (candidates.length === 0) return null;
  return candidates[0];
}

/**
 * Place une pitch class en dessous d'une note de reference, dans une plage donnee.
 * @param {number} pc
 * @param {number} referenceMidi
 * @param {{ min: number, max: number }} range
 * @returns {number | null}
 */
export function placeBelow(pc, referenceMidi, range) {
  const instances = midiInstancesInRange(pc, range.min, range.max);
  const candidates = instances.filter((n) => n < referenceMidi);
  if (candidates.length === 0) return null;
  return candidates[candidates.length - 1];
}

/**
 * Place une note pres du centre d'une plage.
 * @param {number} pc
 * @param {{ min: number, max: number }} range
 * @returns {number | null}
 */
export function placeNearCenter(pc, range) {
  const instances = midiInstancesInRange(pc, range.min, range.max);
  const center = (range.min + range.max) / 2;
  return pickNearest(instances, center);
}

/**
 * Construit une basse LH pour le voicing : fondamentale ou basse slash,
 * placee dans la tessiture confortable si possible.
 * @param {import('../chord-input.js').NormalizedVoicingInput} input
 * @returns {{ note: number | null, diagnostics: string[] }}
 */
export function buildBassNote(input) {
  const diagnostics = [];
  const targetPc = input.bassPc ?? input.rootPc;
  let instances = midiInstancesInRange(targetPc, LH_SOFT_RANGE.min, LH_SOFT_RANGE.max);
  let source = 'LH_SOFT_RANGE';
  if (instances.length === 0) {
    instances = midiInstancesInRange(targetPc, LH_HARD_RANGE.min, LH_HARD_RANGE.max);
    source = 'LH_HARD_RANGE';
  }
  if (instances.length === 0) {
    diagnostics.push(`LH: aucune instance MIDI pour pc ${targetPc}`);
    return { note: null, diagnostics };
  }
  const center = source === 'LH_SOFT_RANGE' ? 42 : 36;
  const note = pickNearest(instances, center);
  diagnostics.push(`LH: ${note} (pc ${targetPc}, ${source})`);
  return { note, diagnostics };
}

/**
 * Reordonne des pitch classes pour un close en commencant par startPc
 * et en montant par demi-tons modulo 12.
 * @param {number[]} pcs
 * @param {number} startPc
 * @returns {number[]}
 */
export function buildOrderedClosePcs(pcs, startPc) {
  const sorted = [...pcs].sort((a, b) => a - b);
  const startIdx = sorted.indexOf(startPc);
  if (startIdx < 0) return sorted;
  const ordered = [];
  for (let i = 0; i < sorted.length; i++) {
    ordered.push(sorted[(startIdx + i) % sorted.length]);
  }
  return ordered;
}

/**
 * Construit un empilement close ordonne a partir d'une liste de roles (pitch classes)
 * en commencant par une note de base et en montant par demi-tons.
 * @param {number[]} pcs - pitch classes ordonnees par rôle (grave -> aigu)
 * @param {number} startMidi
 * @returns {number[]}
 */
export function buildCloseStack(pcs, startMidi) {
  const stack = [startMidi];
  for (let i = 1; i < pcs.length; i++) {
    const prev = stack[i - 1];
    const pc = pcs[i];
    let midi = prev + ((pc - (prev % 12) + 12) % 12);
    if (midi <= prev) midi += 12;
    stack.push(midi);
  }
  return stack;
}

/**
 * Retourne les rotations (inversions) d'un empilement close.
 * Chaque rotation commence par une voix differente tout en preservant l'ordre.
 * @param {number[]} closeStack
 * @returns {number[][]}
 */
export function rotateCloseStack(closeStack) {
  const rotations = [];
  for (let i = 0; i < closeStack.length; i++) {
    const rot = [];
    for (let j = 0; j < closeStack.length; j++) {
      const src = closeStack[(i + j) % closeStack.length];
      if (j === 0) {
        rot.push(src);
        continue;
      }
      const prev = rot[j - 1];
      let midi = src % 12;
      const baseOctave = Math.floor(prev / 12) * 12;
      midi += baseOctave;
      while (midi <= prev) midi += 12;
      rot.push(midi);
    }
    rotations.push(rot);
  }
  return rotations;
}

/**
 * Calcule le span d'une liste de notes.
 * @param {number[]} notes
 * @returns {number}
 */
export function noteSpan(notes) {
  return span(notes);
}
