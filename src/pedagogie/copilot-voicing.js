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
 * Familles dérivées mécaniquement de l'empilement fermé à 4 voix : elles ne
 * font que déplacer des voix d'une octave, sans jamais ajouter ni retirer une
 * classe de hauteur — la reconnaissance de l'accord est donc préservée.
 */
const DROP_FAMILIES = new Set(['drop2', 'drop3', 'drop2_4', 'fourway_close', 'spread', 'open', 'block']);

const TECHNIQUE_DISPLAY_NAMES = {
  drop2: 'Drop 2',
  drop3: 'Drop 3',
  drop2_4: 'Drop 2-4',
  fourway_close: 'Four-Way Close',
  spread: 'Spread',
  open: 'Open',
  block: 'Block',
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

  // 2 bis. Refus explicite d'une technique inapplicable à cet accord (ex. drop 2
  // sur une triade) : on renvoie l'échec tel quel, SANS repli guide tones — un
  // repli silencieux masquerait la vraie raison et laisserait croire que la
  // technique demandée a été appliquée.
  if (voicing.refused) {
    voicing.diagnostics = [...diagnostics, ...(voicing.diagnostics || [])];
    voicing.isPlayable = false;
    return voicing;
  }

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
 * Quartal (et So What) : main gauche en shell, main droite en quartes.
 *
 * Main droite = 3 notes espacées de quartes justes, construites à partir de la
 * 9e quand l'accord en possède une (9e → 5te → fondamentale à l'octave), sinon
 * à partir de la fondamentale ([root, +5, +10]). Deux quartes et non trois :
 * un empilement de 3 quartes (15 demi-tons) est injouable d'une main.
 *
 * So What ajoute une tierce majeure au-dessus de la voix la plus aiguë — c'est
 * précisément ce qui le distingue d'un quartal ordinaire.
 */
function buildQuartalVoicingHands(parsed, technique, options = {}) {
  const tones = chordToneList(parsed);
  const chordPcs = new Set(tones.map((t) => t.pc));

  const ninth = tones.find((t) => t.semitones >= 13 && t.semitones <= 15);
  const startPc = ninth ? ninth.pc : parsed.rootPc;
  const start = pickPcNearCenter(startPc, RH_SOFT_RANGE);
  if (start === null) return null;

  const rightHand = [start, start + 5, start + 10];
  if (options.soWhat === true) {
    rightHand.push(rightHand[rightHand.length - 1] + 4);
  }

  // Garde de fidélité harmonique : l'empilement de quartes ne doit introduire
  // AUCUNE classe de hauteur étrangère à l'accord.
  //
  // Sur un accord pourvu d'une 9e (ou un sus4), la pile 9e→5te→fondamentale ne
  // contient que des tons de l'accord et reste parfaitement détectable. Sur un
  // m7 ordinaire en revanche, la quarte ajoutée est une 11e étrangère, et le
  // résultat devient littéralement ambigu : Cm11 et Mib6/9 ont exactement les
  // mêmes notes, et `detectChord()` retourne l'un pour l'autre (mesuré :
  // Cm7 → « F7sus4 », Do#m → « F#7sus4 »). Aucune tierce à la main gauche ne
  // rattrape cela. On refuse donc explicitement plutôt que d'afficher à
  // l'élève un voicing qu'il lui serait impossible de valider.
  const foreign = rightHand.filter((n) => !chordPcs.has((((n % 12) + 12) % 12)));
  if (foreign.length > 0) return null;

  const leftHand = buildLeftHandShell(parsed);

  // Complétude : un voicing auquel il manque un ton fondamental de l'accord
  // redevient ambigu même sans note étrangère (C7sus4 réduit à Do-Fa-Sib se
  // lit « Fasus4 » faute de Sol). On complète la main gauche avec les tons
  // manquants du noyau 1-3-5-7.
  const present = new Set([...leftHand, ...rightHand].map((n) => (((n % 12) + 12) % 12)));
  for (const tone of chordToneList(parsed).slice(0, 4)) {
    if (present.has(tone.pc)) continue;
    if (!placeMissingTone(tone.pc, leftHand, rightHand)) return null;
    present.add(tone.pc);
  }

  if (span(leftHand) > LH_MAX_SPAN || span(rightHand) > RH_MAX_SPAN) return null;

  return finalizeVoicing(parsed, leftHand, rightHand, technique);
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
 * Familles « drop » : toutes partent du même empilement fermé à 4 voix et se
 * bornent à en descendre une ou deux d'une octave. Aucune classe de hauteur
 * n'est ajoutée ni retirée — `detectChord()` reconnaît donc toujours l'accord.
 *
 * @param {object} parsed
 * @param {string} family
 * @returns {object|null} null si l'accord a moins de 4 tons distincts
 */
function buildDropFamilyVoicing(parsed, family) {
  // Spread et Open ne se déduisent pas de l'empilement à 4 voix : ils replient
  // les tons de l'accord dans une seule octave et sacrifient la quinte juste
  // dès qu'une extension occupe sa place (vérifié contre VoicingLab sur Cmaj9,
  // dont les deux familles n'ont pas de Sol).
  if (family === 'spread' || family === 'open') {
    return buildSpreadFamilyVoicing(parsed, family);
  }

  // L'empilement de base reprend TOUS les tons de l'accord repliés dans une
  // octave, pas seulement les 4 voix principales : se limiter à 1-3-5-7
  // effacerait la 9e d'un Cmaj9, et le voicing ne serait plus reconnu comme
  // tel (mesuré : Cmaj9 rendu « Cmaj7 »). Sur un accord de 4 sons, le
  // résultat est identique à l'empilement classique — donc identique à
  // VoicingLab, vérifié note à note sur Cmaj7.
  const base = rootInReferenceOctave(parsed);
  const stack = buildFoldedToneSet(parsed).map((t) => base + t.fold);
  if (stack.length < 4) return null;

  const top = stack.length - 1;
  const nthFromTop = (n) => stack[top - n];      // 0 = voix la plus aiguë
  const others = (dropped) => stack.filter((n) => !dropped.includes(n));

  let leftHand;
  let rightHand;
  switch (family) {
    case 'drop2': {
      // 2e voix depuis le haut descendue d'une octave.
      const v = nthFromTop(1);
      leftHand = [v - 12];
      rightHand = others([v]);
      break;
    }
    case 'drop3': {
      // 3e voix depuis le haut descendue d'une octave.
      const v = nthFromTop(2);
      leftHand = [v - 12];
      rightHand = others([v]);
      break;
    }
    case 'drop2_4': {
      // 2e voix depuis le haut ET voix la plus grave descendues d'une octave.
      const v = nthFromTop(1);
      const lowest = stack[0];
      leftHand = [lowest - 12, v - 12];
      rightHand = others([v, lowest]);
      break;
    }
    case 'fourway_close':
      // L'empilement fermé entier tenu par la seule main droite.
      leftHand = [];
      rightHand = [...stack];
      break;
    case 'block':
      // Four-way close, dont la voix la plus aiguë est doublée une octave plus
      // bas à la main gauche (technique « locked hands »).
      leftHand = [stack[top] - 12];
      rightHand = [...stack];
      break;
    default:
      return null;
  }
  if (rightHand.length === 0) return null;
  return finalizeVoicing(parsed, leftHand, rightHand, family);
}

/**
 * Tons de l'accord repliés dans une octave et triés du plus grave au plus
 * aigu, base des familles Spread et Open.
 *
 * Écart assumé avec VoicingLab : sur un accord à extension, VoicingLab
 * sacrifie la quinte juste (Cmaj9 spread = Do3 / Ré4-Mi4-Si4, sans Sol).
 * Nous la conservons, car sans elle l'accord cesse d'être reconnaissable —
 * mesuré : Do-Ré-Mi-Si est rendu « Mi5 » et non « Cmaj9 ». Ces familles ne
 * doivent rien changer d'autre que la répartition en octaves.
 */
function buildFoldedToneSet(parsed) {
  return chordToneList(parsed)
    .map((t) => ({ ...t, fold: (((t.semitones % 12) + 12) % 12) }))
    .sort((a, b) => a.fold - b.fold);
}

/**
 * Spread : la fondamentale descend seule à la main gauche, les autres voix
 * restent groupées à la main droite.
 *
 * Open : la main gauche prend la fondamentale ET la quinte, la main droite
 * garde le reste.
 *
 * Écart assumé avec VoicingLab sur Open : sur un accord à quinte altérée,
 * VoicingLab ajoute une quinte JUSTE à la main gauche en plus de la quinte
 * altérée (vérifié sur C7#5#9 → Sol3 à côté du Lab, et sur Cm7b5 → Sol3 à
 * côté du Fa#). Cela introduit une classe de hauteur étrangère à l'accord et
 * casserait la reconnaissance, que ces familles doivent justement préserver.
 * On utilise donc la quinte PROPRE de l'accord : résultat identique à
 * VoicingLab sur les accords à quinte juste, fidèle sur les autres.
 */
function buildSpreadFamilyVoicing(parsed, family) {
  const base = rootInReferenceOctave(parsed);
  const folded = buildFoldedToneSet(parsed);
  if (folded.length < 3) return null;

  const rootTone = folded.find((t) => t.fold === 0);
  if (!rootTone) return null;

  if (family === 'spread') {
    const rest = folded.filter((t) => t.fold !== 0).map((t) => base + t.fold);
    return finalizeVoicing(parsed, [base - 12], rest, family);
  }

  // open : fondamentale + quinte (propre à l'accord) à la main gauche.
  const fifth = chordToneList(parsed).find((t) => {
    const semi = (((t.semitones % 12) + 12) % 12);
    return semi === 7 || semi === 6 || semi === 8;
  });
  if (!fifth) return null;
  const fifthFold = (((fifth.semitones % 12) + 12) % 12);
  const leftHand = [base - 12, base - 12 + fifthFold];
  const rightHand = folded
    .filter((t) => t.fold !== 0 && t.fold !== fifthFold)
    .map((t) => base + t.fold);
  if (rightHand.length === 0) return null;
  return finalizeVoicing(parsed, leftHand, rightHand, family);
}

/**
 * So What : l'empilement de quartes emblématique de Kind of Blue — trois
 * quartes justes surmontées d'une tierce majeure.
 *
 * Construit depuis la fondamentale (fondamentale, 4te, 7e, 3ce, 5te), forme
 * réelle de ce voicing, vérifiée contre VoicingLab (Cm7 → Do3-Fa3-Sib3 /
 * Mib4-Sol4). Il contient donc une 11e : comme pour Quartal, on ne le propose
 * que si toutes ses notes appartiennent à l'accord — ce qui le réserve
 * naturellement aux accords de 11e, son terrain modal d'origine.
 */
function buildSoWhatVoicing(parsed) {
  const base = rootInReferenceOctave(parsed) - 12;
  const notes = [base, base + 5, base + 10, base + 15, base + 19];
  const chordPcs = new Set(chordToneList(parsed).map((t) => t.pc));
  if (notes.some((n) => !chordPcs.has((((n % 12) + 12) % 12)))) return null;
  return finalizeVoicing(parsed, notes.slice(0, 3), notes.slice(3), 'so_what');
}

function splitHands(parsed, candidates, technique, styleId, hand, context) {
  const rootPc = parsed.rootPc;
  const bassPc = parsed.bassPc !== null ? parsed.bassPc : rootPc;

  let leftHand = [];
  let rightHand = [];

  // Sélection des notes importantes pour chaque main.
  const rootNotes = candidates.filter((n) => n % 12 === rootPc);
  const thirdPc = thirdPcOf(parsed);
  const seventhPc = seventhPcOf(parsed);
  const fifthPc = findIntervalPc(parsed, 7);

  // Quartal : main gauche en shell (fondamentale + tierce + 7e), main droite
  // en empilement de quartes.
  //
  // L'ancienne construction plaçait la fondamentale SEULE à la main gauche et
  // empilait 3 quartes à la main droite : la tierce n'apparaissait alors nulle
  // part dans le voicing produit, et l'accord devenait indétectable (C#m rendu
  // comme « F#7sus4/C# » en test réel). Garder la tierce à la main gauche
  // préserve la couleur quartale à la main droite ET la qualité de l'accord.
  if (technique === 'quartal' && hand !== 'right' && hand !== 'left') {
    const quartal = buildQuartalVoicingHands(parsed, technique, { soWhat: false });
    if (quartal === null) {
      return {
        ...emptyVoicing(parsed.input, 'quartal', [
          "Quartal nécessite un accord dont l'empilement de quartes reste dans l'accord (9e ou sus4).",
        ]),
        refused: true,
      };
    }
    return quartal;
  }

  // Drop 2 : vrai algorithme (2e voix depuis le haut descendue d'une octave),
  // réservé aux accords de 4 sons ou plus. Sur une triade il ne resterait
  // qu'une note à la main droite : ce n'est pas un drop 2, c'est un artefact.
  // On refuse explicitement plutôt que de produire un résultat dégradé.
  // Familles structurelles : toutes dérivées de l'empilement fermé, elles ne
  // déplacent que des octaves sans toucher aux classes de hauteur.
  if (DROP_FAMILIES.has(technique) && hand !== 'right' && hand !== 'left') {
    const built = buildDropFamilyVoicing(parsed, technique);
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

  if (technique === 'so_what' && hand !== 'right' && hand !== 'left') {
    // So What part de la même construction que Quartal (shell LH + empilement de
    // quartes RH) et ajoute une tierce majeure au sommet de l'empilement. La
    // détection est donc héritée de Quartal : l'accord doit contenir l'ensemble
    // des notes produites, sans quoi le résultat devient ambigu.
    const soWhat = buildQuartalVoicingHands(parsed, 'so_what', { soWhat: true });
    if (soWhat === null) {
      return {
        ...emptyVoicing(parsed.input, 'so_what', [
          "So What nécessite un accord dont l'empilement de quartes reste dans l'accord (9e, sus4 ou 11e).",
        ]),
        refused: true,
      };
    }
    return soWhat;
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
    } else {
      // close : basse + root (le root n'est ajouté que si la basse en diffère,
      // c'est-à-dire sur un accord renversé / slash).
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
    //
    // Pour `close` spécifiquement, l'écart maximal de la main droite est
    // ramené à une OCTAVE (12) au lieu du RH_MAX_SPAN générique (16) : une
    // « position fermée » dont les notes s'étalent sur plus d'une octave n'est
    // pas une position fermée. Les autres techniques gardent 16.
    const rhMaxSpan = technique === 'close' ? 12 : RH_MAX_SPAN;
    rightHand = pickNotesFromRange(rhCandidates, 60, 79, Math.min(5, parsed.intervals.length), rhMaxSpan);

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
 * Transpose un voicing entier (les deux mains ensemble) par octaves, jusqu'à
 * ce que la note la plus grave de la main gauche tombe dans sa tessiture.
 *
 * Transposer les DEUX mains du même nombre d'octaves préserve exactement la
 * structure intervallique produite par la transformation (drop, block…) —
 * contrairement à `adjustRegister`, qui recale chaque main indépendamment et
 * détruirait l'écart caractéristique de ces familles.
 */
function shiftVoicingIntoRange(leftHand, rightHand) {
  const lh = [...leftHand];
  const rh = [...rightHand];
  const hand = lh.length ? lh : rh;
  if (hand.length === 0) return { leftHand: lh, rightHand: rh };
  const range = lh.length ? LH_HARD_RANGE : RH_HARD_RANGE;
  // Il faut caler la main ENTIÈRE, pas seulement sa note la plus grave : une
  // famille qui descend deux voix (drop 2-4, open) produit une main gauche de
  // plusieurs notes dont la plus aiguë peut dépasser la tessiture alors que la
  // plus grave y tient — le voicing était alors rejeté puis remplacé par un
  // repli guide tones, qui perdait la 9e (Dm9 rendu « Dm7 »).
  const low = Math.min(...hand);
  const high = Math.max(...hand);
  let shift = 0;
  while (high + shift > range.max) shift -= 12;
  while (low + shift < range.min) shift += 12;
  return {
    leftHand: lh.map((n) => n + shift),
    rightHand: rh.map((n) => n + shift),
  };
}

/**
 * Emballe un résultat de technique « structurelle » (drop, quartal, block…).
 *
 * Ces familles gèrent elles-mêmes leur registre via `shiftVoicingIntoRange` et
 * ne doivent PAS passer par `adjustRegister` : celui-ci remonte d'une octave
 * toute note de main droite située à moins de 3 demi-tons de la main gauche,
 * ce qui casserait par exemple le doublage à l'octave du voicing Block.
 */
function finalizeVoicing(parsed, leftHand, rightHand, technique) {
  const placed = shiftVoicingIntoRange(leftHand, rightHand);
  const clamp = (n) => Math.max(21, Math.min(108, n));
  const lh = dedupAndSort(placed.leftHand.map(clamp));
  const rh = dedupAndSort(placed.rightHand.map(clamp));
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
