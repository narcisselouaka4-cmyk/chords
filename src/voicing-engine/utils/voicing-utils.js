// Utilitaires communs pour la validation et la construction de voicings.

import {
  LH_HARD_RANGE,
  LH_SOFT_RANGE,
  RH_HARD_RANGE,
  RH_SOFT_RANGE,
  LH_MAX_SPAN,
  RH_MAX_SPAN,
  midiInRange,
  span,
} from '../hand-ranges.js';

/** @typedef {import('../data-model.js').VoicingCandidate} VoicingCandidate */
/** @typedef {import('../chord-input.js').NormalizedVoicingInput} VoicingInput */

/**
 * Retourne toutes les notes MIDI d'une candidate.
 * @param {VoicingCandidate} candidate
 * @returns {number[]}
 */
export function allNotes(candidate) {
  return [...candidate.lh.notes, ...candidate.rh.notes];
}

/**
 * Retourne les pitch classes distinctes presentes dans une candidate.
 * @param {VoicingCandidate} candidate
 * @returns {Set<number>}
 */
export function uniquePcs(candidate) {
  return new Set(allNotes(candidate).map((n) => n % 12));
}

/**
 * Retourne les notes MIDI qui sont des voix reelles de l'accord,
 * en excluant une basse slash exterieure a l'accord.
 * @param {VoicingCandidate} candidate
 * @returns {number[]}
 */
export function chordVoiceNotes(candidate) {
  const { bassPc, rootPc } = candidate.input;
  const hasSlashBass = bassPc != null && bassPc !== rootPc;
  return allNotes(candidate).filter((n) => !hasSlashBass || n % 12 !== bassPc);
}

/**
 * Verifie que toutes les pitch classes presentes appartiennent a l'accord.
 * @param {VoicingCandidate} candidate
 * @returns {{ ok: boolean, errors: string[] }}
 */
export function validateNotesBelongToChord(candidate) {
  const errors = [];
  const allowedPcs = new Set(candidate.input.chordTonePcs);
  const bassPc = candidate.input.bassPc;
  if (bassPc != null) allowedPcs.add(bassPc);

  for (const note of allNotes(candidate)) {
    if (!allowedPcs.has(note % 12)) {
      errors.push(`note ${note} (pc ${note % 12}) n'appartient pas a l'accord`);
    }
  }
  return { ok: errors.length === 0, errors };
}

/**
 * Verifie qu'il n'y a pas de note inutile ajoutee arbitrairement.
 * Une note est inutile si elle duplique une pitch class deja presente dans la meme main.
 * @param {VoicingCandidate} candidate
 * @returns {{ ok: boolean, errors: string[] }}
 */
export function validateNoUselessNotes(candidate) {
  const errors = [];
  for (const hand of [candidate.lh, candidate.rh]) {
    const seenPcs = new Set();
    for (const note of hand.notes) {
      const pc = note % 12;
      if (seenPcs.has(pc)) {
        errors.push(`${hand.hand}: doublure intra-main de pc ${pc}`);
      }
      seenPcs.add(pc);
    }
  }
  return { ok: errors.length === 0, errors };
}

/**
 * Verifie le nombre de voix distinctes par pitch class.
 * Une voix musicale est une pitch class unique, pas une instance MIDI.
 * Selon le scope, on compte toutes les notes, seule la main droite, ou les
 * voix de l'accord (toutes les notes sauf une basse slash exterieure a l'accord).
 * @param {VoicingCandidate} candidate
 * @param {number} minVoices
 * @param {number} maxVoices
 * @param {'all' | 'rightHand' | 'chordVoices'} [scope]
 * @returns {{ ok: boolean, errors: string[] }}
 */
export function validateVoiceCount(candidate, minVoices, maxVoices, scope = 'all') {
  const errors = [];
  let notes;
  if (scope === 'rightHand') {
    notes = candidate.rh.notes;
  } else {
    notes = allNotes(candidate);
  }
  const uniquePcs = new Set(notes.map((n) => n % 12));

  // Pour les voix de l'accord, une basse slash (differentie de la fondamentale)
  // n'est pas une voix du close ; on l'exclut du comptage.
  if (scope === 'chordVoices') {
    const { bassPc, rootPc } = candidate.input;
    if (bassPc != null && bassPc !== rootPc) {
      uniquePcs.delete(bassPc);
    }
  }

  const count = uniquePcs.size;
  if (count < minVoices) {
    errors.push(`trop peu de voix: ${count} < ${minVoices}`);
  }
  if (count > maxVoices) {
    errors.push(`trop de voix: ${count} > ${maxVoices}`);
  }
  return { ok: errors.length === 0, errors };
}

/**
 * Verifie les contraintes de tessiture et de span main par main.
 * @param {VoicingCandidate} candidate
 * @param {{ left?: boolean, right?: boolean }} [options]
 * @returns {{ ok: boolean, errors: string[] }}
 */
export function validateHandRanges(candidate, options = {}) {
  const errors = [];
  const checkLeft = options.left !== false;
  const checkRight = options.right !== false;
  const lhMaxSpan = options.left?.maxSpan ?? LH_MAX_SPAN;
  const rhMaxSpan = options.right?.maxSpan ?? RH_MAX_SPAN;

  if (checkLeft && candidate.lh.notes.length > 0) {
    for (const note of candidate.lh.notes) {
      if (!midiInRange(note, LH_HARD_RANGE)) {
        errors.push(`LH note ${note} hors plage ${LH_HARD_RANGE.min}-${LH_HARD_RANGE.max}`);
      }
    }
    if (span(candidate.lh.notes) > lhMaxSpan) {
      errors.push(`LH span ${span(candidate.lh.notes)} > ${lhMaxSpan}`);
    }
  }

  if (checkRight && candidate.rh.notes.length > 0) {
    for (const note of candidate.rh.notes) {
      if (!midiInRange(note, RH_HARD_RANGE)) {
        errors.push(`RH note ${note} hors plage ${RH_HARD_RANGE.min}-${RH_HARD_RANGE.max}`);
      }
    }
    if (span(candidate.rh.notes) > rhMaxSpan) {
      errors.push(`RH span ${span(candidate.rh.notes)} > ${rhMaxSpan}`);
    }
  }

  return { ok: errors.length === 0, errors };
}

/**
 * Verifie qu'il n'y a pas de croisement problematique entre les mains.
 * Par defaut, LH max <= RH min.
 * @param {VoicingCandidate} candidate
 * @param {{ allowOverlap?: boolean }} [options]
 * @returns {{ ok: boolean, errors: string[] }}
 */
export function validateNoHandCrossing(candidate, options = {}) {
  const errors = [];
  if (options.allowOverlap) return { ok: true, errors: [] };
  if (candidate.lh.notes.length === 0 || candidate.rh.notes.length === 0) return { ok: true, errors: [] };
  const maxLh = Math.max(...candidate.lh.notes);
  const minRh = Math.min(...candidate.rh.notes);
  if (maxLh > minRh) {
    errors.push(`croisement LH/RH: LH max ${maxLh} > RH min ${minRh}`);
  }
  return { ok: errors.length === 0, errors };
}

/**
 * Verifie que la basse slash est bien la note la plus grave.
 * Si la main gauche est vide (famille rootless), il n'y a pas de basse jouee :
 * la validation est alors sans objet.
 * @param {VoicingCandidate} candidate
 * @returns {{ ok: boolean, errors: string[] }}
 */
export function validateSlashBass(candidate) {
  const errors = [];
  if (candidate.input.bassPc == null) return { ok: true, errors: [] };
  if (candidate.lh.notes.length === 0) return { ok: true, errors: [] };
  const notes = allNotes(candidate);
  if (notes.length === 0) return { ok: true, errors: [] };
  const lowest = Math.min(...notes);
  if (lowest % 12 !== candidate.input.bassPc) {
    errors.push(`basse slash attendue pc ${candidate.input.bassPc}, note la plus grave ${lowest} (pc ${lowest % 12})`);
  }
  return { ok: errors.length === 0, errors };
}

/**
 * Verifie que les voix sont ordonnees de maniere strictement croissante.
 * @param {VoicingCandidate} candidate
 * @returns {{ ok: boolean, errors: string[] }}
 */
export function validateVoiceOrdering(candidate) {
  const errors = [];
  for (const hand of [candidate.lh, candidate.rh]) {
    for (let i = 1; i < hand.notes.length; i++) {
      if (hand.notes[i] <= hand.notes[i - 1]) {
        errors.push(`${hand.hand}: voix non ordonnees`);
        break;
      }
    }
  }
  return { ok: errors.length === 0, errors };
}

/**
 * Verifie la continuite de registre a l'interieur d'une main.
 * Pour chaque main, toutes les octaves comprises entre la note la plus basse et
 * la plus haute de cette main doivent contenir au moins une note. Un trou
 * d'octave entier au sein d'une main statique est invalide ; le passage entre
 * LH et RH est un changement de main, pas un trou de registre.
 * @param {VoicingCandidate} candidate
 * @returns {{ ok: boolean, errors: string[] }}
 */
export function validateRegisterContinuity(candidate) {
  for (const hand of [candidate.lh, candidate.rh]) {
    if (hand.notes.length < 2) continue;
    const notes = hand.notes;
    const lowest = Math.min(...notes);
    const highest = Math.max(...notes);
    const lowestOct = Math.floor(lowest / 12);
    const highestOct = Math.floor(highest / 12);

    if (lowestOct === highestOct) continue;

    const octavesWithNote = new Set(notes.map((n) => Math.floor(n / 12)));
    for (let oct = lowestOct + 1; oct < highestOct; oct++) {
      if (!octavesWithNote.has(oct)) {
        return {
          ok: false,
          errors: [`${hand.hand}: trou d'octave ${oct} entre ${lowest} et ${highest}`],
        };
      }
    }
  }

  return { ok: true, errors: [] };
}

/**
 * Regroupe plusieurs resultats de validation en un seul.
 * @param {{ ok: boolean, errors: string[] }[]} results
 * @returns {{ ok: boolean, errors: string[] }}
 */
export function combineValidationResults(results) {
  const errors = [];
  for (const r of results) {
    if (!r.ok) errors.push(...r.errors);
  }
  return { ok: errors.length === 0, errors };
}
