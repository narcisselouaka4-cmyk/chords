// [Claude] — 2026-09-09 — Générateur de voicings pour le Copilot IA.
//
// Transforme un symbole d'accord + un style + un contexte en une structure
// jouable au piano (main gauche / main droite / technique / pattern).
// Contrairement à la version précédente, ce module ne compte plus sur
// generate-voicing.js (moteur V1 limité en accords) pour fournir les notes :
// il utilise chord-parser.js qui connaît les tensions, altérations et slash bass.

import { Interval } from '@tonaljs/tonal';
import {
  LH_HARD_RANGE,
  LH_SOFT_RANGE,
  RH_HARD_RANGE,
  RH_SOFT_RANGE,
  LH_MAX_SPAN,
  RH_MAX_SPAN,
  span,
  midiInRange,
} from '../voicing-engine/hand-ranges.js';
import {
  parseChordSymbol,
  chordSymbolToPitchClasses,
  chordSymbolToMidi as parserChordSymbolToMidi,
} from './chord-parser-v2.js';
import { chordName } from '../chord-engine/naming.js';

/**
 * @typedef {{
 *   chordSymbol: string,
 *   leftHand: number[],
 *   rightHand: number[],
 *   technique: string,
 *   register: string,
 *   isPlayable: boolean,
 *   diagnostics: string[],
 *   fallback: boolean,
 * }} CopilotVoicing
 */

const STYLE_TO_TECHNIQUE = {
  worship: 'close',
  gospel: 'drop2',
  jazz: 'rootless',
  neoSoul: 'quartal',
};

const LH_DEFAULT_ROLES = {
  close: ['bass', 'root'],
  drop2: ['fifth'],
  rootless: ['shell'],
  quartal: ['bass', 'third', 'seventh'],
  drop3: ['third'],
  drop2_4: ['bass', 'fifth'],
  fourway_close: [],
  spread: ['bass'],
  open: ['bass', 'fifth'],
  block: ['melody-doubling'],
  so_what: ['bass', 'fourth', 'seventh'],
};

const RH_DEFAULT_ROLES = {
  close: ['third', 'fifth', 'seventh', 'tension'],
  drop2: ['third', 'seventh', 'ninth', 'fifth'],
  rootless: ['third', 'seventh', 'ninth', 'fifth'],
  quartal: ['quartal', 'tension'],
  drop3: ['root', 'fifth', 'seventh'],
  drop2_4: ['third', 'seventh'],
  fourway_close: ['root', 'third', 'fifth', 'seventh'],
  spread: ['third', 'seventh', 'tension'],
  open: ['third', 'seventh', 'tension'],
  block: ['root', 'third', 'fifth', 'melody'],
  so_what: ['third', 'fifth'],
};

/**
 * Techniques produites comme des transformations mécaniques de l'empilement
 * fermé : close, drop2/3/2-4, fourway_close, spread, open, block. Quartal et
 * So What ont leur propre construction. Ces techniques peuvent produire des
 * spans plus larges qu'un simple close position ; la validation accepte donc
 * des écarts jusqu'à 24 demi-tons pour la main droite.
 */
const DROP_FAMILIES = new Set(['close', 'drop2', 'drop3', 'drop2_4', 'fourway_close', 'spread', 'open', 'block']);
const STRUCTURAL_TECHNIQUES = new Set(['close', 'drop2', 'drop3', 'drop2_4', 'fourway_close', 'spread', 'open', 'block', 'quartal', 'so_what', 'upper_structure']);

const TECHNIQUE_DISPLAY_NAMES = {
  drop2: 'Drop 2',
  drop3: 'Drop 3',
  drop2_4: 'Drop 2-4',
  fourway_close: 'Four-Way Close',
  spread: 'Spread',
  open: 'Open',
  block: 'Block',
  upper_structure: 'Upper structure',
};

/**
 * Convertit un symbole d'accord en notes MIDI (classes de pitch + octaves choisies).
 * @param {string} chordStr
 * @param {number} [baseMidi=48]
 * @returns {number[]}
 */
export function chordSymbolToMidi(chordStr, baseMidi = 48) {
  const parsed = parseChordSymbol(chordStr);
  if (!parsed || !parsed.ok) return [];

  // Utilise chordSymbolToPitchClasses pour obtenir les classes de pitch relatives.
  const pcs = chordSymbolToPitchClasses(chordStr);
  if (!pcs || pcs.length === 0) return [];

  return parserChordSymbolToMidi(chordStr, { baseMidi });
}

/**
 * Détermine la technique de voicing préférée pour un style donné.
 * @param {string} styleId
 * @returns {string}
 */
export function defaultTechniqueForStyle(styleId) {
  return STYLE_TO_TECHNIQUE[styleId] || 'close';
}

/**
 * Liste des styles disponibles pour le Copilot.
 * @returns {{id: string, label: string}[]}
 */
export function listCopilotStyles() {
  return [
    { id: 'auto', label: 'Auto' },
    { id: 'worship', label: 'Worship' },
    { id: 'gospel', label: 'Gospel' },
    { id: 'jazz', label: 'Jazz' },
    { id: 'neoSoul', label: 'Neo Soul' },
  ];
}

/**
 * Génère un voicing jouable pour le Copilot IA.
 *
 * @param {string} chordSymbol - ex. "Cmaj7", "Dm9", "G7alt"
 * @param {object} options
 * @param {string} [options.styleId='auto'] - 'auto'|'worship'|'gospel'|'jazz'|'neoSoul'
 * @param {string} [options.technique] - 'close'|'drop2'|'rootless'|'quartal'
 * @param {string} [options.context='accompaniment'] - 'accompaniment'|'solo'
 * @param {string} [options.hand='both'] - 'both'|'left'|'right'
 * @returns {CopilotVoicing}
 */
export function generateCopilotVoicing(chordSymbol, options = {}) {
  const diagnostics = [];
  let technique = options.technique;
  let styleId = options.styleId || 'auto';
  if (styleId === 'auto') styleId = 'gospel';
  if (!technique) technique = defaultTechniqueForStyle(styleId);

  const parsed = parseChordSymbol(chordSymbol);
  if (!parsed || !parsed.ok) {
    diagnostics.push(`Symbole d'accord non reconnu : ${chordSymbol}.`);
    return emptyVoicing(chordSymbol, technique, diagnostics);
  }

  // 1. Construire les notes de l'accord sur 2 octaves pour pouvoir choisir un voicing.
  const candidates = buildCandidateNotes(parsed);
  if (!candidates || candidates.length === 0) {
    diagnostics.push(`Impossible de construire des notes pour ${chordSymbol}.`);
    return emptyVoicing(chordSymbol, technique, diagnostics);
  }

  // 2. Répartition LH/RH selon la technique et le style.
  const voicing = splitHands(parsed, candidates, technique, styleId, options.hand || 'both', options.context || 'accompaniment', options);

  // 2 bis. Refus explicite d'une technique structurellement impossible
  // (ex. drop 2 sur une triade) : on renvoie l'échec tel quel.
  if (voicing.refused) {
    voicing.diagnostics = [...diagnostics, ...(voicing.diagnostics || [])];
    voicing.isPlayable = false;
    return voicing;
  }

  // 3. Validation hard. La reconnaissance exacte de l'accord n'est plus exigée
  // ici : un voicing quartal sur Dm7 peut être interprété comme Dm11, ce qui
  // est valide pour un pianiste. La validation porte sur la jouabilité.
  //
  // Pour les techniques structurelles, l'onglet Exercices fusionne LH+RH : on
  // autorise un bloc de notes réparti sur les deux mains, avec un écart total
  // max de 24 demi-tons (2 octaves) et chaque note dans l'union des tessitures
  // main gauche + main droite (28–84).
  const allNotes = [...voicing.leftHand, ...voicing.rightHand];
  const isStructural = STRUCTURAL_TECHNIQUES.has(technique);
  const unionRange = { min: Math.min(LH_HARD_RANGE.min, RH_HARD_RANGE.min), max: Math.max(LH_HARD_RANGE.max, RH_HARD_RANGE.max) };
  const isOpenSpread = technique === 'open' || technique === 'spread';
  // Validation main par main pour toutes les techniques : un pianiste n'a que
  // 5 doigts par main. Pour les techniques structurelles affichées en un bloc,
  // on relaxe les contraintes de tessiture, de chevauchement et d'écart total.
  let validation = validateHandVoicing(voicing.leftHand, voicing.rightHand, {
    maxLeftSpan: isOpenSpread ? 16 : (isStructural ? LH_MAX_SPAN : undefined),
    maxRightSpan: isStructural ? RH_MAX_SPAN : undefined,
    allowOverlap: isStructural,
    leftRange: isStructural ? unionRange : undefined,
    rightRange: isStructural ? unionRange : undefined,
  });
  if (isStructural && validation.valid && allNotes.length > 0) {
    // L'affichage Exercices fusionne les deux mains : on vérifie que le bloc
    // total reste jouable (aucun trou d'octave entre notes consécutives).
    const fullValidation = validateStructuralVoicing(allNotes);
    if (!fullValidation.valid) {
      validation.valid = false;
      validation.diagnostics.push(...fullValidation.diagnostics);
    }
  }
  diagnostics.push(...validation.diagnostics);
  voicing.diagnostics = diagnostics;
  voicing.isPlayable = validation.valid;

  // 4. Si non jouable, fallback sur guide tones + basse.
  if (!voicing.isPlayable) {
    const fallback = buildGuideToneFallback(parsed, options.context || 'accompaniment');
    const fbValidation = validateHandVoicing(fallback.leftHand, fallback.rightHand);
    if (fbValidation.valid) {
      fbValidation.diagnostics.push(`Voicing initial non jouable — fallback sur guide tones.`);
      return { ...fallback, diagnostics: fbValidation.diagnostics, isPlayable: true, fallback: true };
    }
  }

  return voicing;
}

function emptyVoicing(chordSymbol, technique, diagnostics) {
  return {
    chordSymbol,
    leftHand: [],
    rightHand: [],
    technique,
    register: 'inconnu',
    isPlayable: false,
    diagnostics,
    fallback: false,
  };
}

/**
 * Retourne le nombre de variantes jouables pour un symbole et une technique.
 * Pour les techniques ne supportant pas les variantes, retourne 1.
 * Pour drop2/drop3, on compte uniquement les variantes qui restent jouables
 * dans la technique demandée (sans fallback sur une autre famille) ; sinon
 * l'UI proposerait des positions qui font disparaître l'étiquette active.
 *
 * @param {string} chordSymbol
 * @param {string} technique
 * @returns {number}
 */
export function countVoicingVariants(chordSymbol, technique) {
  const parsed = parseChordSymbol(chordSymbol);
  if (!parsed || !parsed.ok) return 0;
  if (technique === 'upper_structure') {
    return listCompatibleUpperStructures(parsed).length;
  }
  if (!['drop2', 'drop3'].includes(technique)) {
    const v = generateCopilotVoicing(chordSymbol, { technique });
    return v.isPlayable ? 1 : 0;
  }
  const stack = buildClosePositionStack(parsed);
  if (stack.length < 4) return 0;
  const maxPositions = technique === 'drop2' ? stack.length - 1 : stack.length - 2;
  let playable = 0;
  for (let variant = 0; variant < maxPositions; variant += 1) {
    const voicing = generateCopilotVoicing(chordSymbol, { technique, variant });
    if (voicing.isPlayable && voicing.technique === technique) playable += 1;
  }
  return playable;
}

/**
 * Construit un pool de notes MIDI couvrant 2 octaves à partir de la définition.
 * @returns {number[]}
 */
function buildCandidateNotes(parsed) {
  const base = 36;
  const notes = [];
  const rootPc = parsed.rootPc;
  // Utilise chordSymbolToMidi pour obtenir une octave de base, puis étend sur 4 octaves.
  // chordSymbolToMidi (définie plus haut dans ce fichier) attend un baseMidi NUMÉRIQUE en
  // 2e argument, pas un objet options — { baseMidi: base } ici était doublement enveloppé
  // (chordSymbolToMidi refait lui-même { baseMidi } en interne), ce qui neutralisait
  // silencieusement le paramètre `base` et retombait toujours sur la valeur par défaut (48).
  const baseNotes = chordSymbolToMidi(parsed.input || 'C', base) || [];
  for (let oct = 0; oct < 5; oct += 1) {
    for (const midi of baseNotes) {
      const transposed = midi + oct * 12;
      if (transposed >= 24 && transposed <= 96) notes.push(transposed);
    }
  }
  const unique = Array.from(new Set(notes)).sort((a, b) => a - b);
  return unique;
}

/**
 * Construit le shell de main gauche : fondamentale + tierce (+ 7e si l'accord
 * en a une), empilées vers l'aigu.
 *
 * La fondamentale est cherchée dans LH_SOFT_RANGE, de la plus centrée à la
 * moins centrée, en retenant la première pour laquelle le shell ENTIER tient
 * sous LH_HARD_RANGE.max : choisir d'abord la fondamentale la plus centrée
 * puis abandonner la 7e faute de place produisait des voicings amputés (Cm9
 * sans son Sib, donc indétectable comme accord de 9e).
 *
 * @returns {number[]}
 */
function buildLeftHandShell(parsed) {
  const rootPc = (((parsed.rootPc % 12) + 12) % 12);
  const wanted = [thirdPcOf(parsed), seventhPcOf(parsed)].filter((pc) => pc !== null);
  const center = (LH_SOFT_RANGE.min + LH_SOFT_RANGE.max) / 2;

  const roots = [];
  for (let midi = LH_SOFT_RANGE.min; midi <= LH_SOFT_RANGE.max; midi += 1) {
    if ((((midi % 12) + 12) % 12) === rootPc) roots.push(midi);
  }
  if (roots.length === 0) return [];
  // Plus centré d'abord ; à distance égale, la position la plus AIGUË (plus
  // confortable que la plus grave).
  roots.sort((a, b) => (Math.abs(a - center) - Math.abs(b - center)) || (b - a));

  const stackFrom = (root) => {
    const shell = [root];
    for (const pc of wanted) {
      const below = shell[shell.length - 1];
      let midi = below + ((((pc - below) % 12) + 12) % 12);
      if (midi === below) midi += 12;
      shell.push(midi);
    }
    return shell;
  };

  for (const root of roots) {
    const shell = stackFrom(root);
    if (Math.max(...shell) <= LH_HARD_RANGE.max) return shell;
  }
  // Aucune position ne loge le shell complet : on tronque celui de la position
  // la plus centrée plutôt que de renvoyer une main gauche vide.
  return stackFrom(roots[0]).filter((n) => n <= LH_HARD_RANGE.max);
}

/**
 * Quartal (et So What) : voicing en empilement de quartes.
 *
 * Contrairement à l'ancienne version, on ne rejette PLUS le voicing quand il
 * produit un accord différent de l'accord demandé (ex. Dm7 quartal → Dm11) : la
 * cible affichée dans l'onglet Exercices devient l'accord DÉTECTÉ sur ce
 * voicing, et l'utilisateur le joue tel quel. C'est le comportement normal de
 * VoicingLab.
 *
 * Construction : empilement de quartes à partir de la 9e quand elle existe,
 * sinon à partir de la fondamentale. L'écart entre notes consécutives est de 5
 * demi-tons (quarte juste), et l'empilement ne dépasse pas 19 demi-tons au
 * total (3 quartes + tierce pour So What), conformément aux données de
 * VoicingLab sur Dm7 (50-55-60-65-69).
 *
 * So What ajoute une tierce majeure au-dessus de la voix la plus aiguë.
 */
function buildQuartalVoicingHands(parsed, technique, options = {}) {
  const tones = chordToneList(parsed);

  // On cherche la 9e, la 4te (sus4) ou, à défaut, la fondamentale comme point
  // de départ de l'empilement de quartes.
  const ninth = tones.find((t) => t.semitones >= 13 && t.semitones <= 15);
  const fourth = tones.find((t) => t.semitones === 5 || t.semitones === 6);
  const startPc = ninth ? ninth.pc : (fourth ? fourth.pc : parsed.rootPc);

  // Point de départ placé dans la tessiture RH confortable, centrée autour de
  // C4 (60). Pour Dm7, D3 (50) donne l'empilement D3-G3-C4-F4-A4.
  let start = pickPcNearCenter(startPc, { min: 50, max: 67 });
  if (start === null) start = pickPcNearCenter(startPc, RH_SOFT_RANGE);
  if (start === null) return null;

  // Limite l'empilement à 3 quartes (15 demi-tons) + tierce majeure (19) pour
  // So What. Sur Quartal, 3 quartes max (15) pour rester jouable.
  const maxSemitones = options.soWhat === true ? 19 : 15;
  const stack = [start];
  while (stack.length < (options.soWhat === true ? 5 : 4)) {
    const next = stack[stack.length - 1] + 5;
    if (next - start > maxSemitones) break;
    stack.push(next);
  }
  if (options.soWhat === true && stack.length === 4) {
    stack.push(stack[stack.length - 1] + 4);
  }

  // Si l'empilement ne contient pas assez de notes pour être reconnaissable,
  // on le complète avec la fondamentale en bas.
  if (stack.length < 4) {
    const root = pickPcNearCenter(parsed.rootPc, { min: start - 12, max: start - 5 });
    if (root !== null) stack.unshift(root);
  }

  if (stack.length < 3) return null;

  return finalizeVoicing(parsed, [], stack, technique);
}

/**
 * Loge un ton manquant, d'abord au-dessus de la main gauche, sinon sous la
 * main droite — en respectant les tessitures, les écarts maximaux et l'ordre
 * des mains. Mute `leftHand`/`rightHand` et renvoie true en cas de succès.
 */
function placeMissingTone(pc, leftHand, rightHand) {
  const above = (from) => {
    let midi = from + ((((pc - from) % 12) + 12) % 12);
    if (midi === from) midi += 12;
    return midi;
  };

  if (leftHand.length > 0) {
    const candidate = above(leftHand[leftHand.length - 1]);
    const lhMin = Math.min(...leftHand);
    if (candidate <= LH_HARD_RANGE.max
      && candidate - lhMin <= LH_MAX_SPAN
      && (rightHand.length === 0 || candidate < Math.min(...rightHand))) {
      leftHand.push(candidate);
      return true;
    }
  }

  if (rightHand.length > 0) {
    const rhMin = Math.min(...rightHand);
    const rhMax = Math.max(...rightHand);
    // Sous la main droite, sans descendre dans la main gauche.
    let candidate = rhMin - ((((rhMin - pc) % 12) + 12) % 12);
    if (candidate === rhMin) candidate -= 12;
    const lhMax = leftHand.length ? Math.max(...leftHand) : -Infinity;
    if (candidate > lhMax
      && candidate >= RH_HARD_RANGE.min
      && rhMax - candidate <= RH_MAX_SPAN) {
      rightHand.unshift(candidate);
      return true;
    }
  }

  return false;
}

/**
 * Familles « drop » et apparentées : toutes partent de l'empilement fermé et
 * déplacent une ou deux voix d'une octave. Le résultat est ensuite ajusté pour
 * respecter la règle d'écart maximal d'une octave entre notes consécutives
 * (dernière note autorisée à déborder légèrement).
 *
 * @param {object} parsed
 * @param {string} family
 * @returns {object|null} null si l'accord a moins de 4 tons distincts
 */
function buildDropFamilyVoicing(parsed, family, options = {}) {
  // Close position : empilement fermé complet, tenu par la main droite seule.
  if (family === 'close') {
    const stack = buildClosePositionStack(parsed);
    if (stack.length === 0) return null;
    return finalizeVoicing(parsed, [], stack, 'close');
  }

  // Spread et Open ont leur propre logique de plage.
  if (family === 'spread' || family === 'open') {
    return buildSpreadFamilyVoicing(parsed, family);
  }

  const base = rootInReferenceOctave(parsed);
  const stack = buildFoldedToneSet(parsed).map((t) => base + t.fold);
  if (stack.length < 4) return null;

  const top = stack.length - 1;
  const nthFromTop = (n) => stack[top - n];
  const others = (dropped) => stack.filter((n) => !dropped.includes(n));

  // Pour drop2/drop3/drop2_4, on génère 4 positions en fonction de la
  // variante demandée. La variante détermine quelle voix de l'empilement
  // fermé est descendue d'une octave.
  // Variantes Drop 2 : 4 positions (la 2e, 3e, 4e ou 5e voix depuis le haut
  // descendue d'une octave). Variantes Drop 3 : 3 positions.
  const variant = Number(options.variant || 0);

  let leftHand;
  let rightHand;
  switch (family) {
    case 'drop2': {
      // 4 positions possibles : 2e, 3e, 4e, 5e voix depuis le haut descendues.
      const voiceIndex = variant % Math.max(1, stack.length - 1);
      const v = nthFromTop(1 + voiceIndex);
      leftHand = [v - 12];
      rightHand = others([v]);
      break;
    }
    case 'drop3': {
      // 3 positions : 3e, 4e, 5e voix depuis le haut descendues.
      const maxVariants = Math.max(1, stack.length - 2);
      const voiceIndex = variant % maxVariants;
      const v = nthFromTop(2 + voiceIndex);
      leftHand = [v - 12];
      rightHand = others([v]);
      break;
    }
    case 'drop2_4': {
      const v = nthFromTop(1);
      const lowest = stack[0];
      leftHand = [lowest - 12, v - 12];
      rightHand = others([v, lowest]);
      break;
    }
    case 'fourway_close':
      // Empilement fermé complet, une seule main visuellement.
      leftHand = [];
      rightHand = [...stack];
      break;
    case 'block':
      // Voix la plus aiguë doublée une octave plus bas.
      leftHand = [stack[top] - 12];
      rightHand = [...stack];
      break;
    default:
      return null;
  }
  if (rightHand.length === 0) return null;

  // Recompacte le voicing entier (LH+RH) pour éviter un trou d'octave entre
  // notes consécutives, sauf pour la toute dernière note qui peut déborder.
  // Block et drop2_4 peuvent produire un trou à la jonction LH/RH ; on le
  // comble en remontant les notes de RH autour de la dernière note de LH.
  const all = [...leftHand, ...rightHand].sort((a, b) => a - b);
  const compacted = compactRightHand(all, 12, 3);
  leftHand = compacted.slice(0, leftHand.length);
  rightHand = compacted.slice(leftHand.length);

  return finalizeVoicing(parsed, leftHand, rightHand, family);
}

/**
 * Recompacte un ensemble de notes de main droite : aucune note ne doit être
 * à plus d'une octave (12 demi-tons) de la précédente, sauf la dernière qui
 * peut déborder de 3 demi-tons maximum. Si une note est trop haute, elle est
 * descendue d'octaves jusqu'à ce que la condition soit respectée.
 *
 * @param {number[]} notes
 * @param {number} maxGap
 * @param {number} lastOverflow
 * @returns {number[]}
 */
function compactRightHand(notes, maxGap = 12, lastOverflow = 3) {
  if (notes.length < 2) return [...notes];
  const out = [notes[0]];
  for (let i = 1; i < notes.length; i += 1) {
    let note = notes[i];
    const prev = out[i - 1];
    const limit = i === notes.length - 1 ? maxGap + lastOverflow : maxGap;
    while (note - prev > limit) {
      note -= 12;
    }
    out.push(note);
  }
  return out;
}

/**
 * Tons de l'accord repliés dans une octave au-dessus de la fondamentale et
 * triés du plus grave au plus aigu. Le `fold` est l'intervalle en demi-tons
 * par rapport à la fondamentale (0–11), pas la classe de hauteur absolue.
 *
 * Écart assumé avec VoicingLab : sur un accord à extension, VoicingLab
 * sacrifie la quinte juste (Cmaj9 spread = Do3 / Ré4-Mi4-Si4, sans Sol).
 * Nous la conservons, car sans elle l'accord cesse d'être reconnaissable —
 * mesuré : Do-Ré-Mi-Si est rendu « Mi5 » et non « Cmaj9 ». Ces familles ne
 * doivent rien changer d'autre que la répartition en octaves.
 */
function buildFoldedToneSet(parsed) {
  const rootPc = (((parsed.rootPc % 12) + 12) % 12);
  return chordToneList(parsed)
    .map((t) => {
      const fold = (((t.pc - rootPc) % 12) + 12) % 12;
      return { ...t, fold };
    })
    .sort((a, b) => a.fold - b.fold);
}

/**
 * Spread : la fondamentale descend seule à la main gauche, les autres voix
 * restent groupées à la main droite au-dessus du close stack.
 *
 * Open : la main gauche prend la fondamentale (une octave sous le close stack)
 * ET la quinte, la main droite garde le reste replié dans l'octave du close
 * stack (entre la fondamentale et son octave supérieure).
 *
 * Conformément aux données VoicingLab :
 * - Dm7 spread = D3 C4 F4 A4  → [50, 60, 65, 69]
 * - Dm7 open   = D3 A3 C4 F4  → [50, 57, 60, 65]
 */
function buildSpreadFamilyVoicing(parsed, family) {
  const base = rootInReferenceOctave(parsed);
  const stack = buildClosePositionStack(parsed);
  if (stack.length < 3) return null;

  const tones = chordToneList(parsed);
  const rootPc = parsed.rootPc;

  // Trouve la première occurrence d'une classe de hauteur dans le close stack
  // et retourne sa valeur MIDI la plus proche d'une octave de référence donnée.
  const findToneMidi = (targetPc, refMidi) => {
    const matches = stack.filter((n) => ((n % 12) + 12) % 12 === ((targetPc % 12) + 12) % 12);
    if (matches.length === 0) return null;
    return matches.reduce((best, n) =>
      (Math.abs(n - refMidi) < Math.abs(best - refMidi) ? n : best), matches[0]);
  };

  const buildAbove = (lHand, sourceNotes, maxGap = 12, lastOverflow = 3) => {
    const out = [];
    let prev = lHand[lHand.length - 1];
    for (const src of sourceNotes) {
      let midi = src;
      while (midi <= prev) midi += 12;
      while (midi > prev + 12) midi -= 12;
      out.push(midi);
      prev = midi;
    }
    return compactRightHand(out, maxGap, lastOverflow);
  };

  if (family === 'spread') {
    const leftHand = [base - 12];
    const rightHand = buildAbove(leftHand, stack.slice(1), 12, 3);
    return finalizeVoicing(parsed, leftHand, rightHand, family);
  }

  // Open : main gauche plus riche (fondamentale + quinte + septième/tierce)
  // pour alléger la main droite et créer l'espacement gospel typique.
  const fifth = tones.find((t) => {
    const semi = (((t.semitones % 12) + 12) % 12);
    return semi === 7 || semi === 6 || semi === 8;
  });
  const seventh = tones.find((t) => {
    const semi = (((t.semitones % 12) + 12) % 12);
    return semi === 10 || semi === 11;
  });
  const third = tones.find((t) => {
    const semi = (((t.semitones % 12) + 12) % 12);
    return semi === 3 || semi === 4;
  });
  if (!fifth) return null;

  const lRoot = base - 12;
  const fifthFold = (((fifth.semitones % 12) + 12) % 12);
  const leftTones = [lRoot, lRoot + fifthFold];

  // Ajoute une troisième note à la main gauche quand l'accord le permet :
  // tierce d'abord (répartition gospel type Gm11 : G D Bb / C F Bb), sinon
  // septième. On ne l'ajoute que s'il reste au moins 2 notes pour la main
  // droite, pour éviter un voicing déséquilibré sur les accords de 4 sons.
  const extraTone = third || seventh;
  const wouldLeaveInRh = stack.length - leftTones.length - (extraTone ? 1 : 0);
  if (extraTone && wouldLeaveInRh >= 2) {
    let extraMidi = lRoot + extraTone.semitones;
    const used = new Set(leftTones.map((n) => n % 12));
    while (extraMidi <= lRoot) extraMidi += 12;
    while (used.has(extraMidi % 12) && extraMidi <= lRoot + 12) extraMidi += 12;
    if (!used.has(extraMidi % 12)) {
      leftTones.push(extraMidi);
    }
  }

  const usedPcs = new Set(leftTones.map((n) => (n % 12)));
  const rest = stack.filter((n) => !usedPcs.has((n % 12)));

  // L'open gospel aère la main droite : on permet des écarts jusqu'à 7
  // demi-tons entre notes consécutives (sauf la dernière qui peut déborder).
  const rightHand = buildAbove(leftTones, rest, 9, 3);
  return finalizeVoicing(parsed, leftTones, rightHand, family);
}

/**
 * So What : alias de buildQuartalVoicingHands avec l'option soWhat activée.
 *
 * L'ancien code construisait une pile fixe et la rejetait quand elle sortait de
 * l'accord. La nouvelle version accepte que le résultat soit interprété comme
 * un accord riche (ex. Dm7 So What → Dm11 / Dm13) ; l'onglet Exercices affiche
 * l'accord détecté.
 */
function buildSoWhatVoicing(parsed) {
  return buildQuartalVoicingHands(parsed, 'so_what', { soWhat: true });
}

/**
 * Construit un voicing « upper structure » pour les accords dominants :
 * main gauche = fondamentale + tierce + septième (guide tones),
 * main droite = triade supérieure (tensions caractéristiques).
 *
 * Les variantes proposent plusieurs triades classiques (ex. D maj sur C7,
 * Eb min sur C7, A min sur C7…). Si aucune triade n'est compatible avec
 * les tensions explicites de l'accord, la technique est refusée.
 */

const UPPER_STRUCTURE_TRIADS = [
  { offset: 2, quality: 'major', label: 'Maj sur 9e' },   // 9, #11, 13
  { offset: 1, quality: 'minor', label: 'min sur b9e' },  // b9, 3, b13
  { offset: 1, quality: 'major', label: 'Maj sur b9e' },  // b9, 11, b13
  { offset: 3, quality: 'minor', label: 'min sur #9e' },  // #9, #11, b7
  { offset: 6, quality: 'major', label: 'Maj sur #11e' }, // #11, b7, b9
  { offset: 9, quality: 'minor', label: 'min sur 13e' },  // 13, root, 9
  { offset: 10, quality: 'major', label: 'Maj sur b7e' }, // b7, 9, 11
];

function triadOffsets(quality) {
  if (quality === 'major') return [0, 4, 7];
  if (quality === 'minor') return [0, 3, 7];
  if (quality === 'diminished') return [0, 3, 6];
  if (quality === 'augmented') return [0, 4, 8];
  return [0, 4, 7];
}

function listCompatibleUpperStructures(parsed) {
  const intervals = parsed.intervals || [];
  const semitones = intervals
    .map((iv) => Interval.semitones(iv))
    .filter((n) => Number.isFinite(n))
    .map((n) => ((n % 12) + 12) % 12);
  const explicit = new Set(semitones);
  const hasMajor3 = explicit.has(4);
  const hasMinor7 = explicit.has(10);
  if (!hasMajor3 || !hasMinor7) return [];

  const naturalTensions = new Set([2, 5, 9]); // 9, 11, 13
  const alteredTensions = new Set([1, 3, 8]); // b9, #9, b13
  const neutralTensions = new Set([6]);      // #11, considéré comme disponible
  const hasExplicitNatural = [...naturalTensions].some((s) => explicit.has(s));
  const hasExplicitAltered = [...alteredTensions].some((s) => explicit.has(s));
  // Dominant nu : toutes les tensions classiques sont autorisées.
  const isPlainDominant = [...explicit].every((s) => [0, 4, 7, 10].includes(s));

  let allowedTensions = new Set([...naturalTensions, ...alteredTensions, ...neutralTensions]);
  if (!isPlainDominant) {
    if (hasExplicitNatural) allowedTensions = new Set([...naturalTensions, ...neutralTensions]);
    else if (hasExplicitAltered) allowedTensions = new Set([...alteredTensions, ...neutralTensions]);
  }

  return UPPER_STRUCTURE_TRIADS.filter((s) => {
    const notes = triadOffsets(s.quality).map((off) => (s.offset + off) % 12);
    // Chaque note de la triade doit être soit une note de l'accord explicite,
    // soit une tension autorisée par la famille de l'accord.
    return notes.every((n) => explicit.has(n) || allowedTensions.has(n));
  });
}

function buildUpperStructureVoicing(parsed, options = {}) {
  const compatible = listCompatibleUpperStructures(parsed);
  if (compatible.length === 0) return null;

  const variant = options.variant || 0;
  const structure = compatible[variant % compatible.length];

  // Guide tones en main gauche : fondamentale + tierce + septième.
  const tones = chordToneList(parsed);
  const thirdTone = tones.find((t) => t.semitones === 3 || t.semitones === 4);
  const seventhTone = tones.find((t) => t.semitones === 10);
  if (!thirdTone || !seventhTone) return null;

  const rootPc = parsed.rootPc;
  // Main gauche plus aiguë que la tessiture normale : l'upper structure a besoin
  // de guide tones proches de la triade supérieure pour éviter un trou d'octave.
  const upperLeftRange = { min: 36, max: 62 };
  const rootMidi = pickPcNearCenter(rootPc, upperLeftRange);
  const thirdMidi = rootMidi + thirdTone.semitones;
  let seventhMidi = rootMidi + 10;
  while (seventhMidi > upperLeftRange.max) seventhMidi -= 12;
  while (seventhMidi < upperLeftRange.min) seventhMidi += 12;
  const leftHand = [rootMidi, thirdMidi, seventhMidi].sort((a, b) => a - b);

  // Triade supérieure en main droite.
  const triadRootPc = (rootPc + structure.offset) % 12;
  let triadRootMidi = pickPcNearCenter(triadRootPc, RH_HARD_RANGE);
  const offsets = triadOffsets(structure.quality);
  // S'assure que la triade reste au-dessus de la main gauche.
  const lhMax = Math.max(...leftHand);
  while (triadRootMidi + offsets[offsets.length - 1] <= lhMax) triadRootMidi += 12;
  const rightHand = offsets.map((off) => triadRootMidi + off);

  return finalizeVoicing(parsed, leftHand, rightHand, 'upper_structure');
}

function splitHands(parsed, candidates, technique, styleId, hand, context, options = {}) {
  // L'ancien code rejetait le résultat quand detectChord() ne reconnaissait pas
  // exactement l'accord demandé. On supprime ce rejet : le voicing produit est
  // une réalisation pianistique réelle ; l'onglet Exercices affiche l'accord
  // détecté sur ce voicing.
  if (technique === 'quartal' && hand !== 'right' && hand !== 'left') {
    return buildQuartalVoicingHands(parsed, technique, { soWhat: false });
  }

  if (technique === 'so_what' && hand !== 'right' && hand !== 'left') {
    return buildSoWhatVoicing(parsed);
  }

  if (DROP_FAMILIES.has(technique) && hand !== 'right' && hand !== 'left') {
    const built = buildDropFamilyVoicing(parsed, technique, options);
    if (built === null) {
      return {
        ...emptyVoicing(parsed.input, technique, [
          `${TECHNIQUE_DISPLAY_NAMES[technique] || technique} nécessite un accord de 4 sons minimum.`,
        ]),
        refused: true,
      };
    }
    return built;
  }

  if (technique === 'upper_structure' && hand !== 'right' && hand !== 'left') {
    const built = buildUpperStructureVoicing(parsed, options);
    if (built === null) {
      return {
        ...emptyVoicing(parsed.input, technique, [
          `${TECHNIQUE_DISPLAY_NAMES.upper_structure} n'est utilisable que sur un accord dominant (X7, X9, X13, X7alt…).`,
        ]),
        refused: true,
      };
    }
    return built;
  }

  // --- Branche legacy pour rootless / main droite seule / main gauche seule ---
  const rootPc = parsed.rootPc;
  const thirdPc = thirdPcOf(parsed);
  const seventhPc = seventhPcOf(parsed);

  let leftHand = [];
  let rightHand = [];

  if (hand === 'right') {
    rightHand = pickNotesFromRange(candidates, RH_HARD_RANGE.min, RH_HARD_RANGE.max, Math.min(4, parsed.intervals.length));
  } else if (hand === 'left') {
    leftHand = pickNotesFromRange(candidates, LH_HARD_RANGE.min, LH_HARD_RANGE.max, Math.min(4, parsed.intervals.length), LH_MAX_SPAN);
  } else {
    const rootNotes = candidates.filter((n) => n % 12 === rootPc);
    const bassNote = rootNotes.find((n) => midiInRange(n, LH_HARD_RANGE));
    const bass = bassNote || fitInRange(rootNotes[0] || candidates[0], LH_HARD_RANGE);
    leftHand = [bass];

    if (technique === 'rootless') {
      const shell = [];
      if (thirdPc !== null) shell.push(...candidates.filter((n) => n % 12 === thirdPc).slice(0, 1));
      if (seventhPc !== null) shell.push(...candidates.filter((n) => n % 12 === seventhPc).slice(0, 1));
      if (shell.length >= 1) {
        leftHand = shell.map((n) => fitInRange(n, LH_HARD_RANGE));
      }
    } else if (parsed.bassPc !== null && parsed.bassPc !== rootPc) {
      const rootNote = candidates.find((n) => n % 12 === rootPc);
      if (rootNote !== undefined) leftHand.push(fitInRange(rootNote, LH_HARD_RANGE));
    }

    const lhPcs = new Set(leftHand.map((n) => n % 12));
    const rhCandidates = candidates.filter((n) => !lhPcs.has(n % 12) && midiInRange(n, RH_HARD_RANGE));
    const rhMaxSpan = technique === 'close' ? 12 : RH_MAX_SPAN;
    rightHand = pickNotesFromRange(rhCandidates, 60, 79, Math.min(5, parsed.intervals.length), rhMaxSpan);

    if (rightHand.length === 0) {
      rightHand = pickNotesFromRange(candidates, RH_HARD_RANGE.min + 5, RH_HARD_RANGE.max - 5, Math.min(4, parsed.intervals.length));
    }
  }

  const adjusted = adjustRegister(leftHand, rightHand, context);

  return {
    chordSymbol: parsed.input,
    leftHand: dedupAndSort(adjusted.leftHand),
    rightHand: dedupAndSort(adjusted.rightHand),
    technique,
    register: describeRegister(adjusted.leftHand, adjusted.rightHand),
    isPlayable: false,
    diagnostics: [],
    fallback: false,
  };
}

function findIntervalPc(parsed, interval) {
  const pc = (parsed.rootPc + interval) % 12;
  // parsed.intervals contient des noms d'intervalles Tonal.js (ex. "3m", "7m", "9M"), pas des
  // demi-tons numériques — il faut les convertir avant de comparer, sinon la comparaison
  // échoue toujours silencieusement (NaN !== pc).
  return parsed.intervals.some((iv) => Interval.semitones(iv) % 12 === interval) ? pc : null;
}

/**
 * Tierce de l'accord (majeure sinon mineure), ou null si l'accord n'en a pas.
 *
 * `findIntervalPc(...) || findIntervalPc(...)` ne convient PAS ici : une classe
 * de hauteur vaut 0 pour Do, et `0 || x` retombe sur la branche suivante — la
 * tierce de Abmaj7 (Do) était donc vue comme absente. On teste explicitement
 * contre null.
 */
function thirdPcOf(parsed) {
  const major = findIntervalPc(parsed, 4);
  if (major !== null) return major;
  return findIntervalPc(parsed, 3);
}

/** Septième de l'accord (majeure sinon mineure), ou null. Même piège que thirdPcOf. */
function seventhPcOf(parsed) {
  const major = findIntervalPc(parsed, 11);
  if (major !== null) return major;
  return findIntervalPc(parsed, 10);
}

/**
 * Liste les tons distincts de l'accord dans l'ordre ascendant des intervalles
 * (1, 3, 5, 7, 9, 11, 13...), dédupliqués par classe de hauteur.
 *
 * @param {object} parsed
 * @returns {{pc: number, semitones: number, interval: string}[]}
 */
function chordToneList(parsed) {
  const seen = new Set();
  const out = [];
  for (const iv of parsed.intervals) {
    const semitones = Interval.semitones(iv);
    if (!Number.isFinite(semitones)) continue;
    const pc = (((parsed.rootPc + semitones) % 12) + 12) % 12;
    if (seen.has(pc)) continue;
    seen.add(pc);
    out.push({ pc, semitones, interval: iv });
  }
  return out;
}

/**
 * Renvoie la fondamentale placée dans l'octave de référence [60, 71] — la
 * position de départ de l'empilement fermé, alignée sur la convention de
 * VoicingLab (Cmaj7 → C4 = 60).
 */
function rootInReferenceOctave(parsed) {
  return 60 + ((((parsed.rootPc % 12) + 12) % 12));
}

/**
 * Construit l'empilement fermé (close position) ascendant de l'accord : chaque
 * ton placé au-dessus du précédent, dans l'ordre 1-3-5-7-9…
 *
 * C'est la base commune de la technique `close` et de toutes les familles
 * « drop » : celles-ci ne font que déplacer une ou deux voix de cet
 * empilement d'une octave, sans jamais changer les classes de hauteur.
 *
 * @param {object} parsed
 * @param {number} [baseMidi] - fondamentale de départ (défaut : octave de référence)
 * @param {number} [voiceCount=Infinity] - nombre de voix à retenir (4 pour les drops)
 * @returns {number[]} notes MIDI triées du grave à l'aigu
 */
function buildClosePositionStack(parsed, baseMidi = null, voiceCount = Infinity) {
  const tones = chordToneList(parsed);
  if (tones.length === 0) return [];
  const base = baseMidi === null ? rootInReferenceOctave(parsed) : baseMidi;
  const limited = Number.isFinite(voiceCount) ? tones.slice(0, voiceCount) : tones;
  const stack = [];
  let prev = -Infinity;
  for (const tone of limited) {
    let midi = base + tone.semitones;
    while (midi <= prev) midi += 12;
    stack.push(midi);
    prev = midi;
  }
  return stack;
}

/**
 * Choisit l'occurrence d'une classe de hauteur la plus proche du CENTRE d'une
 * plage, au lieu de la plus grave qui y rentre. Sans cela la fondamentale
 * tombait systématiquement au plus grave possible (C#2 au lieu de C#3),
 * défaut d'ergonomie relevé en test réel.
 *
 * @returns {number|null}
 */
function pickPcNearCenter(pc, range) {
  const target = (((pc % 12) + 12) % 12);
  const center = (range.min + range.max) / 2;
  let best = null;
  for (let midi = range.min; midi <= range.max; midi += 1) {
    if ((((midi % 12) + 12) % 12) !== target) continue;
    // `<=` et non `<` : à distance égale du centre on retient la position la
    // plus aiguë, plus confortable que son équivalent une octave plus bas.
    if (best === null || Math.abs(midi - center) <= Math.abs(best - center)) best = midi;
  }
  return best;
}

/**
 * Ajuste chaque main indépendamment pour qu'elle tombe dans sa tessiture. Les
 * techniques structurelles (drop, spread, open, block, quartal, so_what)
 * produisent des répartitions précises qui ne doivent pas être transposées en
 * bloc : seules les notes hors tessiture sont recalées par octaves. Comme
 * l'onglet Exercices fusionne désormais LH et RH pour l'affichage, le
 * chevauchement entre les deux mains n'est plus un problème.
 *
 * Pour les techniques structurelles, chaque note peut occuper l'union des
 * tessitures (28–84) afin de garder le bloc compact ; pour les autres, on
 * applique les plages strictes.
 */
function shiftVoicingIntoRange(leftHand, rightHand, technique) {
  const isStructural = STRUCTURAL_TECHNIQUES.has(technique);
  const unionRange = { min: Math.min(LH_HARD_RANGE.min, RH_HARD_RANGE.min), max: Math.max(LH_HARD_RANGE.max, RH_HARD_RANGE.max) };
  const clampToRange = (n, range) => {
    if (n >= range.min && n <= range.max) return n;
    if (n < range.min) return n + Math.ceil((range.min - n) / 12) * 12;
    return n - Math.ceil((n - range.max) / 12) * 12;
  };
  return {
    leftHand: leftHand.map((n) => clampToRange(n, isStructural ? unionRange : LH_HARD_RANGE)),
    rightHand: rightHand.map((n) => clampToRange(n, isStructural ? unionRange : RH_HARD_RANGE)),
  };
}

/**
 * Emballe un résultat de technique « structurelle » (drop, quartal, block…).
 *
 * Chaque main est recalée dans sa tessiture sans casser la structure
 * intervallique au sein de la main. L'affichage Exercices fusionne LH+RH.
 */
/**
 * Rééquilibre les notes entre les deux mains pour qu'aucune main ne dépasse
 * 5 doigts. Essaie d'abord de déplacer les notes excédentaires vers l'autre
 * main, puis supprime les tensions les moins essentielles si nécessaire.
 * L'ordre d'importance est : fondamentale, tierce, septième, quinte, tensions.
 */
function balanceHands(parsed, leftHand, rightHand, technique) {
  const MAX_PER_HAND = 5;
  const isStructural = STRUCTURAL_TECHNIQUES.has(technique);
  const unionRange = { min: Math.min(LH_HARD_RANGE.min, RH_HARD_RANGE.min), max: Math.max(LH_HARD_RANGE.max, RH_HARD_RANGE.max) };
  const maxLeftSpan = isStructural ? 16 : LH_MAX_SPAN;
  const maxRightSpan = isStructural ? RH_MAX_SPAN + 4 : RH_MAX_SPAN;
  const leftMaxNote = isStructural ? unionRange.max : LH_HARD_RANGE.max;
  const importance = (midi) => {
    const fold = (((midi % 12) - parsed.rootPc + 12) % 12);
    if (fold === 0) return 0;
    if (fold === 3 || fold === 4) return 1;
    if (fold === 10 || fold === 11) return 2;
    if (fold === 6 || fold === 7 || fold === 8) return 3;
    return 4;
  };

  let lh = [...leftHand].sort((a, b) => a - b);
  let rh = [...rightHand].sort((a, b) => a - b);

  // Déplace les notes excédentaires de la main droite vers la main gauche.
  while (rh.length > MAX_PER_HAND && lh.length < MAX_PER_HAND) {
    const candidate = rh[0];
    const newLh = [...lh, candidate].sort((a, b) => a - b);
    if (span(newLh) <= maxLeftSpan && candidate >= LH_HARD_RANGE.min && candidate <= leftMaxNote) {
      lh = newLh;
      rh = rh.slice(1);
    } else {
      break;
    }
  }

  // Supprime les notes les moins importantes de la main droite si elle reste
  // surchargée.
  while (rh.length > MAX_PER_HAND) {
    rh.sort((a, b) => importance(b) - importance(a) || b - a);
    rh.pop();
  }

  // Même chose pour la main gauche.
  while (lh.length > MAX_PER_HAND && rh.length < MAX_PER_HAND) {
    const candidate = lh[lh.length - 1];
    const newRh = [...rh, candidate].sort((a, b) => a - b);
    if (span(newRh) <= maxRightSpan && candidate <= RH_HARD_RANGE.max) {
      rh = newRh;
      lh = lh.slice(0, -1);
    } else {
      break;
    }
  }
  while (lh.length > MAX_PER_HAND) {
    lh.sort((a, b) => importance(b) - importance(a) || a - b);
    lh.pop();
  }

  return { leftHand: lh, rightHand: rh };
}

function finalizeVoicing(parsed, leftHand, rightHand, technique) {
  const placed = shiftVoicingIntoRange(leftHand, rightHand, technique);
  const balanced = balanceHands(parsed, placed.leftHand, placed.rightHand, technique);
  const clamp = (n) => Math.max(21, Math.min(108, n));
  const lh = dedupAndSort(balanced.leftHand.map(clamp));
  const rh = dedupAndSort(balanced.rightHand.map(clamp));
  return {
    chordSymbol: parsed.input,
    leftHand: lh,
    rightHand: rh,
    technique,
    register: describeRegister(lh, rh),
    isPlayable: false,
    diagnostics: [],
    fallback: false,
  };
}

function pickNotesFromRange(candidates, min, max, count, maxSpan = RH_MAX_SPAN) {
  const inRange = candidates.filter((n) => n >= min && n <= max);
  if (inRange.length === 0) return [];
  // On prend les notes les plus proches du centre de la plage pour confort.
  const center = (min + max) / 2;
  const sorted = [...inRange].sort((a, b) => Math.abs(a - center) - Math.abs(b - center));
  // On s'assure que l'écart ENTRE LA NOTE LA PLUS GRAVE ET LA PLUS AIGUË du
  // groupe final ne dépasse pas maxSpan. L'ancienne version comparait chaque
  // candidate à picked[0] (la toute première note ajoutée, pas forcément
  // l'extrême du groupe final) : deux notes pouvaient chacune être "assez
  // proches" de picked[0] tout en étant, une fois toutes les deux dans le
  // groupe, plus éloignées l'une de l'autre que maxSpan (vu sur F#m7b5 en
  // technique 'rootless' : span réel de 18 demi-tons validé à tort).
  const picked = [];
  const usedPcs = new Set();
  for (const note of sorted) {
    const pc = ((note % 12) + 12) % 12;
    // Ne jamais sélectionner deux fois la même classe de hauteur par défaut :
    // le pool `candidates` contient chaque note de l'accord à plusieurs
    // octaves, donc sans cette garde on pouvait doubler une note (ex. Ré#4 +
    // Ré#5) au lieu d'aller chercher une tension distincte — ça gonfle
    // l'écart entre les mains sans ajouter de substance harmonique (vu sur
    // Sol#m7 : Ré#4·Fa#4·Ré#5·Fa#5 au lieu d'un voicing resserré).
    if (usedPcs.has(pc)) continue;
    if (picked.length === 0) {
      picked.push(note);
      usedPcs.add(pc);
      continue;
    }
    if (picked.length >= count) continue;
    const candidateMin = Math.min(note, ...picked);
    const candidateMax = Math.max(note, ...picked);
    if (candidateMax - candidateMin <= maxSpan) {
      picked.push(note);
      usedPcs.add(pc);
    }
  }
  return picked.sort((a, b) => a - b);
}

function dedupAndSort(notes) {
  const unique = Array.from(new Set(notes.filter(Number.isFinite)));
  unique.sort((a, b) => a - b);
  return unique;
}

function buildGuideToneFallback(parsed, context) {
  const rootPc = parsed.rootPc;
  const thirdPc = findIntervalPc(parsed, 4) || findIntervalPc(parsed, 3);
  const seventhPc = findIntervalPc(parsed, 11) || findIntervalPc(parsed, 10);
  const fifthPc = findIntervalPc(parsed, 7);

  const candidates = buildCandidateNotes(parsed);

  // LH : basse + quinte si possible.
  let leftHand = [];
  const bass = candidates.find((n) => n % 12 === rootPc && midiInRange(n, LH_HARD_RANGE));
  if (bass !== undefined) leftHand.push(bass);
  if (fifthPc !== null) {
    const fifth = candidates.find((n) => n % 12 === fifthPc && midiInRange(n, LH_HARD_RANGE));
    if (fifth !== undefined && fifth !== leftHand[0]) leftHand.push(fifth);
  }

  // RH : 3e + 7e (guide tones).
  let rightHand = [];
  if (thirdPc !== null) {
    const third = candidates.find((n) => n % 12 === thirdPc && midiInRange(n, RH_HARD_RANGE));
    if (third !== undefined) rightHand.push(third);
  }
  if (seventhPc !== null) {
    const seventh = candidates.find((n) => n % 12 === seventhPc && midiInRange(n, RH_HARD_RANGE));
    if (seventh !== undefined) rightHand.push(seventh);
  }

  const adjusted = adjustRegister(leftHand, rightHand, context);
  return {
    chordSymbol: parsed.input,
    leftHand: dedupAndSort(adjusted.leftHand),
    rightHand: dedupAndSort(adjusted.rightHand),
    technique: 'guide-tones',
    register: describeRegister(adjusted.leftHand, adjusted.rightHand),
    isPlayable: false,
    diagnostics: ['Fallback sur guide tones.'],
    fallback: true,
  };
}

function buildQuartalVoicing(chordSymbol) {
  const parsed = parseChordSymbol(chordSymbol);
  if (!parsed || !parsed.ok) return [];
  const rootNotes = [];
  for (let oct = 3; oct < 6; oct += 1) {
    rootNotes.push(parsed.rootPc + oct * 12);
  }
  const root = rootNotes.find((n) => midiInRange(n, RH_HARD_RANGE)) || rootNotes[0];
  return [root, root + 5, root + 10, root + 15].filter((m) => midiInRange(m, { min: 36, max: 84 }));
}

function fitInRange(midi, range) {
  if (midi < range.min) {
    const octaves = Math.ceil((range.min - midi) / 12);
    return midi + octaves * 12;
  }
  if (midi > range.max) {
    const octaves = Math.ceil((midi - range.max) / 12);
    return midi - octaves * 12;
  }
  return midi;
}

function shiftToRange(notes, range) {
  return notes.map((n) => fitInRange(n, range));
}

function adjustRegister(leftHand, rightHand, context) {
  const isAccompaniment = context === 'accompaniment';
  let lh = [...leftHand];
  let rh = [...rightHand];

  if (isAccompaniment) {
    lh = lh.map((n) => fitInRange(n, LH_HARD_RANGE));
    rh = rh.map((n) => fitInRange(n, RH_HARD_RANGE));
    const lhMax = lh.length ? Math.max(...lh) : 0;
    rh = rh.map((n) => (n <= lhMax + 3 ? n + 12 : n));
  }

  const clamp = (n) => Math.max(21, Math.min(108, n));
  return {
    leftHand: lh.map(clamp),
    rightHand: rh.map(clamp),
  };
}

function describeRegister(leftHand, rightHand) {
  const all = [...leftHand, ...rightHand];
  if (all.length === 0) return 'vide';
  const min = Math.min(...all);
  const max = Math.max(...all);
  return `${chordName(min)} – ${chordName(max)}`;
}

/**
 * Valide un bloc de notes produit par une technique structurelle, où les deux
 * mains sont affichées/jouées comme un tout. L'écart total est limité à 24
 * demi-tons (2 octaves) pour rester confortable, et chaque note doit tenir dans
 * l'union des tessitures (28–84).
 *
 * @param {number[]} notes
 * @returns {{valid: boolean, diagnostics: string[]}}
 */
function validateStructuralVoicing(notes) {
  const diagnostics = [];
  let valid = true;
  if (notes.length === 0) {
    return { valid: false, diagnostics: ['Aucune note dans le voicing.'] };
  }
  for (const n of notes) {
    if (n < LH_HARD_RANGE.min || n > RH_HARD_RANGE.max) {
      diagnostics.push(`Note ${chordName(n)} hors tessiture ${chordName(LH_HARD_RANGE.min)}–${chordName(RH_HARD_RANGE.max)}.`);
      valid = false;
    }
  }
  // Écart entre notes consécutives : max une octave (12) ; la dernière note
  // peut déborder de 3 demi-tons (15). L'accord total peut s'étaler sur plus
  // d'une octave quand il compte 5+ sons, du moment que chaque intervalle
  // consécutif reste jouable.
  const sorted = [...notes].sort((a, b) => a - b);
  for (let i = 1; i < sorted.length; i += 1) {
    const gap = sorted[i] - sorted[i - 1];
    const limit = i === sorted.length - 1 ? 15 : 12;
    if (gap > limit) {
      diagnostics.push(`Écart entre ${chordName(sorted[i - 1])} et ${chordName(sorted[i])} trop grand (${gap} > ${limit}).`);
      valid = false;
    }
  }
  return { valid, diagnostics };
}

/**
 * Valide un voicing pour un pianiste réel.
 *
 * @param {number[]} leftHand
 * @param {number[]} rightHand
 * @param {{maxLeftSpan?: number, maxRightSpan?: number, maxSpan?: number, allowOverlap?: boolean}} [options]
 * @returns {{valid: boolean, diagnostics: string[]}}
 */
export function validateHandVoicing(leftHand, rightHand, options = {}) {
  const diagnostics = [];
  let valid = true;
  const notes = [...leftHand, ...rightHand];

  if (notes.length === 0) {
    return { valid: false, diagnostics: ['Aucune note dans le voicing.'] };
  }
  if (leftHand.length > 5) {
    diagnostics.push(`Main gauche : ${leftHand.length} notes, maximum 5.`);
    valid = false;
  }
  if (rightHand.length > 5) {
    diagnostics.push(`Main droite : ${rightHand.length} notes, maximum 5.`);
    valid = false;
  }

  const leftRange = options.leftRange || LH_HARD_RANGE;
  const rightRange = options.rightRange || RH_HARD_RANGE;
  for (const n of leftHand) {
    if (!midiInRange(n, leftRange)) {
      diagnostics.push(`Main gauche : ${chordName(n)} hors tessiture ${chordName(leftRange.min)}–${chordName(leftRange.max)}.`);
      valid = false;
    }
  }
  for (const n of rightHand) {
    if (!midiInRange(n, rightRange)) {
      diagnostics.push(`Main droite : ${chordName(n)} hors tessiture ${chordName(rightRange.min)}–${chordName(rightRange.max)}.`);
      valid = false;
    }
  }

  const maxLeftSpan = options.maxLeftSpan ?? LH_MAX_SPAN;
  const maxRightSpan = options.maxRightSpan ?? RH_MAX_SPAN;
  const maxSpan = options.maxSpan;

  if (span(leftHand) > maxLeftSpan) {
    diagnostics.push(`Écart main gauche trop grand (${span(leftHand)} demi-tons > ${maxLeftSpan}).`);
    valid = false;
  }
  if (span(rightHand) > maxRightSpan) {
    diagnostics.push(`Écart main droite trop grand (${span(rightHand)} demi-tons > ${maxRightSpan}).`);
    valid = false;
  }
  if (maxSpan !== undefined && span(notes) > maxSpan) {
    diagnostics.push(`Écart total trop grand (${span(notes)} demi-tons > ${maxSpan}).`);
    valid = false;
  }

  if (leftHand.length && rightHand.length && !options.allowOverlap) {
    const lhMax = Math.max(...leftHand);
    const rhMin = Math.min(...rightHand);
    if (rhMin < lhMax) {
      diagnostics.push(`Chevauchement des mains : main droite en dessous de la main gauche.`);
      valid = false;
    }
  }

  return { valid, diagnostics };
}

/**
 * Convertit un voicing en séquence de notes MIDI avec offsets pour un pattern rythmique.
 *
 * @param {CopilotVoicing} voicing
 * @param {object} options
 * @param {string} [options.pattern='block'] - 'block'|'arppegio-up'|'arppegio-down'|'rolled'
 * @param {number} [options.startOffsetMs=0]
 * @param {number} [options.durationMs=1200]
 * @returns {{midi: number, startOffsetMs: number, durationMs: number, hand: 'LH'|'RH', role: string}[]}
 */
export function voicingToNoteSequence(voicing, options = {}) {
  const pattern = options.pattern || 'block';
  const startOffsetMs = options.startOffsetMs || 0;
  const durationMs = options.durationMs || 1200;
  const notes = [];

  const allNotes = [
    ...voicing.leftHand.map((midi, i) => ({
      midi,
      hand: 'LH',
      role: (LH_DEFAULT_ROLES[voicing.technique] || ['bass'])[i] || 'bass',
    })),
    ...voicing.rightHand.map((midi, i) => ({
      midi,
      hand: 'RH',
      role: (RH_DEFAULT_ROLES[voicing.technique] || ['note'])[i] || 'note',
    })),
  ];

  if (pattern === 'block') {
    for (const note of allNotes) {
      notes.push({ ...note, startOffsetMs, durationMs });
    }
  } else if (pattern === 'arppegio-up') {
    const sorted = [...allNotes].sort((a, b) => a.midi - b.midi);
    const step = Math.floor(durationMs / Math.max(1, sorted.length));
    sorted.forEach((note, i) => {
      notes.push({ ...note, startOffsetMs: startOffsetMs + i * step, durationMs: Math.max(200, durationMs - i * step) });
    });
  } else if (pattern === 'arppegio-down') {
    const sorted = [...allNotes].sort((a, b) => b.midi - a.midi);
    const step = Math.floor(durationMs / Math.max(1, sorted.length));
    sorted.forEach((note, i) => {
      notes.push({ ...note, startOffsetMs: startOffsetMs + i * step, durationMs: Math.max(200, durationMs - i * step) });
    });
  } else if (pattern === 'rolled') {
    const sorted = [...allNotes].sort((a, b) => a.midi - b.midi);
    sorted.forEach((note, i) => {
      notes.push({ ...note, startOffsetMs: startOffsetMs + i * 80, durationMs });
    });
  }

  return notes;
}

/**
 * Retourne une représentation textuelle des notes d'un voicing.
 * @param {CopilotVoicing} voicing
 * @returns {string}
 */
export function formatVoicingNotes(voicing) {
  const lhNames = voicing.leftHand.map((n) => chordName(n)).join(' ');
  const rhNames = voicing.rightHand.map((n) => chordName(n)).join(' ');
  return `LH: ${lhNames || '-'} | RH: ${rhNames || '-'}`;
}
