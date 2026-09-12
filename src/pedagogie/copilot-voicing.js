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
  drop2: ['bass', 'fifth'],
  rootless: ['shell'],
  quartal: ['bass', 'guide-tone'],
};

const RH_DEFAULT_ROLES = {
  close: ['third', 'fifth', 'seventh', 'tension'],
  drop2: ['third', 'seventh', 'ninth', 'fifth'],
  rootless: ['third', 'seventh', 'ninth', 'fifth'],
  quartal: ['quartal', 'tension'],
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
  const voicing = splitHands(parsed, candidates, technique, styleId, options.hand || 'both', options.context || 'accompaniment');

  // 3. Validation hard.
  const validation = validateHandVoicing(voicing.leftHand, voicing.rightHand);
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

function splitHands(parsed, candidates, technique, styleId, hand, context) {
  const rootPc = parsed.rootPc;
  const bassPc = parsed.bassPc !== null ? parsed.bassPc : rootPc;

  let leftHand = [];
  let rightHand = [];

  // Sélection des notes importantes pour chaque main.
  const rootNotes = candidates.filter((n) => n % 12 === rootPc);
  const thirdPc = findIntervalPc(parsed, 4) || findIntervalPc(parsed, 3);
  const seventhPc = findIntervalPc(parsed, 11) || findIntervalPc(parsed, 10);
  const fifthPc = findIntervalPc(parsed, 7);

  // Si l'utilisateur demande explicitement un voicing quartal, on génère
  // directement un stack de quartes à partir de la fondamentale, indépendamment
  // des notes de l'accord originel. C'est une couleur harmonique, pas un
  // empilement de tierces.
  if (technique === 'quartal' && hand !== 'right' && hand !== 'left') {
    const bass = rootNotes.find((n) => midiInRange(n, LH_HARD_RANGE)) || fitInRange(rootNotes[0] || candidates[0], LH_HARD_RANGE);
    leftHand = [bass];
    const root = rootNotes.find((n) => midiInRange(n, RH_HARD_RANGE)) || fitInRange(rootNotes[0] || candidates[0], RH_HARD_RANGE);
    rightHand = [root, root + 5, root + 10, root + 15].filter((m) => midiInRange(m, RH_HARD_RANGE));
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

  if (hand === 'right') {
    // Tout à la main droite, réparti autour de C4/C5.
    rightHand = pickNotesFromRange(candidates, RH_HARD_RANGE.min, RH_HARD_RANGE.max, Math.min(4, parsed.intervals.length));
  } else if (hand === 'left') {
    leftHand = pickNotesFromRange(candidates, LH_HARD_RANGE.min, LH_HARD_RANGE.max, Math.min(4, parsed.intervals.length), LH_MAX_SPAN);
  } else {
    // LH : basse + une note structurante (5e ou guide tone).
    const bassNote = rootNotes.find((n) => midiInRange(n, LH_HARD_RANGE));
    const bass = bassNote || fitInRange(rootNotes[0] || candidates[0], LH_HARD_RANGE);
    leftHand = [bass];

    if (technique === 'rootless') {
      // Shell : 3e et 7e à la main gauche.
      const shell = [];
      if (thirdPc !== null) shell.push(...candidates.filter((n) => n % 12 === thirdPc).slice(0, 1));
      if (seventhPc !== null) shell.push(...candidates.filter((n) => n % 12 === seventhPc).slice(0, 1));
      if (shell.length >= 1) {
        leftHand = shell.map((n) => fitInRange(n, LH_HARD_RANGE));
      }
    } else if (technique === 'drop2') {
      // Main gauche : basse + 3e (voicing gospel proche, confortable).
      if (thirdPc !== null) {
        const thirdNote = candidates.find((n) => n % 12 === thirdPc);
        if (thirdNote !== undefined) {
          let thirdInLh = fitInRange(thirdNote, { min: LH_SOFT_RANGE.min, max: LH_HARD_RANGE.max });
          // La tierce doit rester AU-DESSUS de la basse : fitInRange() la
          // place seulement dans la plage LH, sans savoir où est tombée la
          // basse — elle pouvait finir plus grave que `bass`, ce qui fait
          // d'elle (une fois le tableau trié) la note la plus grave du
          // voicing à la place de la fondamentale (observé sur Bb7, A7,
          // Bm7b5). On la remonte d'octave(s) tant qu'elle n'est pas
          // au-dessus de la basse, sans dépasser la tessiture main gauche.
          while (thirdInLh <= bass && thirdInLh + 12 <= LH_HARD_RANGE.max) {
            thirdInLh += 12;
          }
          if (thirdInLh > bass && thirdInLh - bass <= 7) leftHand.push(thirdInLh);
        }
      }
      // Si l'écart est trop grand, on garde juste la basse.
      if (span(leftHand) > LH_MAX_SPAN) {
        leftHand = [bass];
      }
    } else if (technique === 'quartal') {
      // Main gauche : basse seule (la couleur quartal est entièrement à la RH).
      // On ne rajoute pas de guide tone pour garder une sonorité quartale claire.
    } else {
      // close : basse + root.
      if (parsed.bassPc !== null && parsed.bassPc !== rootPc) {
        const rootNote = candidates.find((n) => n % 12 === rootPc);
        if (rootNote !== undefined) leftHand.push(fitInRange(rootNote, LH_HARD_RANGE));
      }
    }

    // RH : complément des notes dans la tessiture aiguë, sans doublons avec LH.
    const lhPcs = new Set(leftHand.map((n) => n % 12));
    const rhCandidates = candidates.filter((n) => !lhPcs.has(n % 12) && midiInRange(n, RH_HARD_RANGE));
    // On prend les notes proches du centre de la tessiture RH pour éviter les spans trop grands.
    // Plage réduite : C4 (60) à G5 (79) maximum.
    rightHand = pickNotesFromRange(rhCandidates, 60, 79, Math.min(5, parsed.intervals.length));

    // Si RH est vide (accord très petit ou notes très graves), on remplit avec les notes disponibles.
    if (rightHand.length === 0) {
      rightHand = pickNotesFromRange(candidates, RH_HARD_RANGE.min + 5, RH_HARD_RANGE.max - 5, Math.min(4, parsed.intervals.length));
    }
  }

  // S'assurer que RH est au-dessus de LH.
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
  for (const note of sorted) {
    if (picked.length === 0) {
      picked.push(note);
      continue;
    }
    if (picked.length >= count) continue;
    const candidateMin = Math.min(note, ...picked);
    const candidateMax = Math.max(note, ...picked);
    if (candidateMax - candidateMin <= maxSpan) {
      picked.push(note);
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
 * Valide un double-voicing pour un pianiste réel.
 * @returns {{valid: boolean, diagnostics: string[]}}
 */
export function validateHandVoicing(leftHand, rightHand) {
  const diagnostics = [];
  let valid = true;

  if (leftHand.length === 0 && rightHand.length === 0) {
    return { valid: false, diagnostics: ['Aucune note dans le voicing.'] };
  }

  for (const n of leftHand) {
    if (!midiInRange(n, LH_HARD_RANGE)) {
      diagnostics.push(`Main gauche : ${chordName(n)} hors tessiture ${chordName(LH_HARD_RANGE.min)}–${chordName(LH_HARD_RANGE.max)}.`);
      valid = false;
    }
  }
  for (const n of rightHand) {
    if (!midiInRange(n, RH_HARD_RANGE)) {
      diagnostics.push(`Main droite : ${chordName(n)} hors tessiture ${chordName(RH_HARD_RANGE.min)}–${chordName(RH_HARD_RANGE.max)}.`);
      valid = false;
    }
  }

  if (span(leftHand) > LH_MAX_SPAN) {
    diagnostics.push(`Écart main gauche trop grand (${span(leftHand)} demi-tons > ${LH_MAX_SPAN}).`);
    valid = false;
  }
  if (span(rightHand) > RH_MAX_SPAN) {
    diagnostics.push(`Écart main droite trop grand (${span(rightHand)} demi-tons > ${RH_MAX_SPAN}).`);
    valid = false;
  }

  if (leftHand.length && rightHand.length) {
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
