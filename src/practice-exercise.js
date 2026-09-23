// [Claude] — 2026-07-07 — Exercices rapides pour l'onglet Entraînement.
// Modes : accord cible, progression, mouvement dans les 12 tons.
// [Claude] — 2026-09-21 — Les voicings affichés/joués sont désormais produits
// par le moteur Copilot IA (copilot-voicing.js) : vrai split main gauche /
// main droite, validation de tessiture, fallback guide tones. La détection
// côté élève (check()) reste inchangée : elle compare les notes jouées au
// rootPc/symbol cible, indépendamment de l'octave et de la répartition.
// [Claude] — 2026-09-23 — Les voicings viennent désormais exclusivement du
// référentiel VoicingLab extrait ton par ton (voicinglab-availability.js) :
// notes réelles, variantes réelles (flèches), aucune génération mécanique.

import { detectChord } from './chord-engine/index.js';
import { formatPc, noteName } from './chord-engine/naming.js';
import { miniKeyboardForNotes } from './ui/mini-keyboard.js';
import movementsLibrary from './data/movements-library.json' with { type: 'json' };
import { getVoicingLabVoicings, isQualityOnVoicingLab, isDerivedQuality } from './voicing-engine/voicinglab-availability.js';
import { parseChordSymbol } from './pedagogie/chord-parser-v2.js';
import { applyDoublings, DOUBLING_MODES } from './voicing-engine/doublings.js';

// Difficulté exprimée en étoiles (1–5). Le mode "Accord cible" est strict :
// 1★ = triades, 2★ = 7e, 3★ = 9e / couleurs, 4★ = tensions/altérations,
// 5★ = tout. Les modes Progression et Mouvement sont cumulatifs.
export const DIFFICULTY_LEVELS = [1, 2, 3, 4, 5];

const SYMBOL_DIFFICULTY = {
  // Triades / bases (1★)
  '': 1,      // majeur triade
  'm': 1,     // mineur triade
  'sus2': 1,
  'sus4': 1,
  '5': 1,
  // 6e / add (2★)
  '6': 2,
  'm6': 2,
  '6/9': 2,
  'add9': 2,
  'madd9': 2,
  'add11': 2,
  '6add11': 2,
  'dim': 2,
  // 7e de base (2★)
  'm7': 2,
  '7': 2,
  'maj7': 2,
  // 9e / sus riches / demi-dim (3★)
  'm7b5': 3,
  'dim7': 3,
  'aug': 3,
  '7sus4': 3,
  '9sus4': 3,
  '7sus2': 3,
  'm9': 3,
  '9': 3,
  'maj9': 3,
  // 11e / 13e / tensions (4★)
  '11': 4,
  'm11': 4,
  '13': 4,
  'm13': 4,
  'maj13': 4,
  'maj11': 4,
  '13sus4': 4,
  'maj7#11': 4,
  '7b5': 4,
  '7b9': 4,
  '7#9': 4,
  // Altérations / mineur-majeur (5★)
  '7#5': 5,
  '7alt': 5,
  '7#9b13': 5,
  '7b9b13': 5,
  'mMaj7': 5,
  'mMaj9': 5,
  'm7#11': 5, // normalisé en m7b5 par le parser, mais conservé comme symbole avancé
  '13#11': 5,
  'maj13#11': 5,
};

const PRACTICE_SYMBOLS_BY_DIFFICULTY = {
  1: ['', 'm', 'sus4', 'sus2', '5'],
  2: ['6', 'm6', '6/9', 'add9', 'madd9', 'add11', '6add11', 'dim', 'm7', '7', 'maj7'],
  3: ['m7b5', 'dim7', 'aug', '7sus4', '9sus4', '7sus2', 'm9', '9', 'maj9'],
  4: ['11', 'm11', '13', 'm13', 'maj13', 'maj11', '13sus4', 'maj7#11', '7b5', '7b9', '7#9'],
  5: ['7#5', '7alt', '7#9b13', '7b9b13', 'mMaj7', 'mMaj9', 'm7#11', '13#11', 'maj13#11'],
};

const ALL_PRACTICE_SYMBOLS = Object.values(PRACTICE_SYMBOLS_BY_DIFFICULTY).flat();

function symbolsForDifficulty(difficulty, mode) {
  const level = Math.min(Math.max(Number(difficulty) || 5, 1), 5);
  if (mode === 'chord') {
    return PRACTICE_SYMBOLS_BY_DIFFICULTY[level] || PRACTICE_SYMBOLS_BY_DIFFICULTY[5];
  }
  // Progression / mouvement : cumulatif.
  const levels = DIFFICULTY_LEVELS.filter((d) => d <= level);
  return levels.flatMap((d) => PRACTICE_SYMBOLS_BY_DIFFICULTY[d]);
}

// Mapping entre les techniques de l'onglet Exercices et les familyId du
// nouveau moteur de catalogue de voicings.
const TECHNIQUE_TO_FAMILY_ID = {
  close: 'close',
  drop2: 'drop2',
  drop3: 'drop3',
  drop2_4: 'drop2Plus4',
  fourway_close: 'fourWayClose',
  spread: 'spread',
  open: 'open',
  block: 'block',
  quartal: 'quartal',
  so_what: 'soWhat',
  upper_structure: 'upperStructure',
  stride: 'stride',
  // Cluster : style VoicingLab sans famille dans le moteur (servi par le référentiel).
  cluster: 'cluster',
  shell: 'shell',
  two_note_shell: 'twoNoteShell',
  rootless: 'rootlessA',
};

// Les progressions standards sont désormais définies par un motif de degrés
// avec une qualité de base. L'application enrichit automatiquement ces qualités
// en fonction de la difficulté choisie (via QUALITY_UPGRADE_PATHS). Cela permet
// à une même progression de s'adapter du débutant à l'avancé sans maintenir
// 5 tableaux de symboles par progression.
export const PROGRESSION_TEMPLATES = [
  {
    name: 'II-V-I majeur',
    category: 'Cadences',
    level: 2,
    tags: ['jazz', 'gospel', 'cadence'],
    tokens: ['2:m7', '5:7', '1:maj7'],
    description: 'La cadence fondamentale du jazz et du gospel.',
  },
  {
    name: 'I-VI-II-V jazz',
    category: 'Cadences',
    level: 3,
    tags: ['jazz', 'turnaround'],
    tokens: ['1:maj7', '6:m7', '2:m7', '5:7'],
    description: 'Turnaround majeur jazz classique.',
  },
  {
    name: 'III-VI-II-V turnaround',
    category: 'Turnarounds',
    level: 3,
    tags: ['jazz', 'gospel', 'turnaround'],
    tokens: ['3:m7', '6:m7', '2:m7', '5:7'],
    description: 'Turnaround mineur vers la tonique.',
  },
  {
    name: 'I-V-vi-IV pop',
    category: 'Pop / Worship',
    level: 1,
    tags: ['pop', 'worship', 'diatonique'],
    tokens: ['1:', '5:', '6:m', '4:'],
    description: 'La progression pop la plus célèbre.',
  },
  {
    name: 'Rhythm changes A',
    category: 'Jazz standard',
    level: 4,
    tags: ['jazz', 'swing'],
    tokens: ['1:', '1:', '4:', '4:', '1:', '1:', '2:m7', '5:7'],
    description: 'Structure A des Rhythm Changes.',
  },
];

function getTemplateTokens(template) {
  return template.tokens.map((t) => parseProgressionToken(t)).filter(Boolean);
}

function getTemplateSymbols(template, difficulty) {
  const parsed = getTemplateTokens(template);
  return parsed.map((p) => progressionQualityForDifficulty(p.quality, difficulty));
}

function getTemplateDegrees(template) {
  return getTemplateTokens(template).map((p) => p.offset);
}

const DEGREE_SEMITONES = {
  1: 0, 2: 2, 3: 4, 4: 5, 5: 7, 6: 9, 7: 11,
};

const DEFAULT_QUALITY_FOR_DEGREE = {
  1: 'maj7', 2: 'm7', 3: 'm7', 4: 'maj7', 5: '7', 6: 'm7', 7: '7',
};

const MOVEMENT_QUALITY_ALIASES = {
  alt: '7#9b13',
  '7alt': '7#9b13',
  'b5alt': '7#9b13',
  '5alt': '7#9b13',
  m: 'm',
  'm(maj7)': 'mMaj7',
  'maj7#11': 'maj7#11',
};

// Chemins d'enrichissement des qualités selon la difficulté cible.
// Chaque index correspond au niveau 1–5 : on veut une qualité VISIBLEMENT
// différente à chaque palier, sans sauter d'étapes. L'ancien système sautait
// les niveaux 1 et 2 car la qualité de base était déjà au niveau 2.
// Chaque palier aboutit UNIQUEMENT à une qualité présente dans le corpus
// VoicingLab (voicinglab-C-5-familles-2026-09-23.csv). Retirés car absents
// de VoicingLab : maj13#11, m13, 11.
const QUALITY_UPGRADE_PATHS = {
  // VoicingLab ne publie aucune triade majeure/mineure (vérifié sur les
  // 12 tons) : le palier 1 part de 6 / m6, sans 7e mais réellement publiés.
  '': ['6', 'maj7', 'maj9', 'maj13', 'maj7#11'],
  '6': ['6', '6/9', 'maj7', 'maj9', 'maj13'],
  'm': ['m6', 'm7', 'm9', 'm11', 'm11'],
  'm6': ['m6', 'm7', 'm9', 'm11', 'm11'],
  '7sus4': ['7sus4', '9sus4', '13sus4', '13sus4', '13sus4'],
  '9sus4': ['9sus4', '13sus4', '13sus4', '13sus4', '13sus4'],
  '7': ['7', '9', '13', '7#9', '7alt'],
  '9': ['9', '13', '7#9', '7alt', '7alt'],
  '13': ['13', '7#9', '7alt', '7alt', '7alt'],
  'maj7': ['maj7', 'maj9', 'maj13', 'maj7#11', 'maj7#11'],
  'maj9': ['maj9', 'maj13', 'maj7#11', 'maj7#11', 'maj7#11'],
  'm7': ['m7', 'm9', 'm11', 'm11', 'm11'],
  'm9': ['m9', 'm11', 'm11', 'm11', 'm11'],
  'm7b5': ['m7b5', 'm7b5', 'm7b5', 'm7b5', 'm7b5'],
  'alt': ['alt', 'alt', 'alt', '7#9b13', '7#9b13'],
};

/**
 * Parse un token de progression sous la forme "<degré>:<qualité>" ou
 * "<degré><qualité>" (ex. "2:m7", "5:7", "b3m7").
 * Le degré est exprimé en chiffres romains arabes (1-7), avec b/# optionnel.
 * Si la qualité est absente, on utilise DEFAULT_QUALITY_FOR_DEGREE.
 */
function parseProgressionToken(token) {
  const str = String(token || '').trim();
  if (!str) return null;
  // Format "2:m7" ou "#5:7alt"
  const colonMatch = str.match(/^([b#]?)(\d+):(.*)$/);
  if (colonMatch) {
    const accidental = colonMatch[1];
    const degree = parseInt(colonMatch[2], 10);
    let quality = colonMatch[3].trim();
    let offset = DEGREE_SEMITONES[degree];
    if (offset == null) return null;
    if (accidental === 'b') offset = (offset - 1 + 12) % 12;
    if (accidental === '#') offset = (offset + 1) % 12;
    if (!quality) quality = DEFAULT_QUALITY_FOR_DEGREE[degree] || '';
    quality = MOVEMENT_QUALITY_ALIASES[quality] || quality;
    return { degree, offset, quality, raw: str };
  }
  // Format compact "b3m7" ou "5alt"
  const compactMatch = str.match(/^([b#]?)(\d+)(.*)$/);
  if (compactMatch) {
    const accidental = compactMatch[1];
    const degree = parseInt(compactMatch[2], 10);
    let quality = compactMatch[3].trim();
    let offset = DEGREE_SEMITONES[degree];
    if (offset == null) return null;
    if (accidental === 'b') offset = (offset - 1 + 12) % 12;
    if (accidental === '#') offset = (offset + 1) % 12;
    if (!quality) quality = DEFAULT_QUALITY_FOR_DEGREE[degree] || '';
    quality = MOVEMENT_QUALITY_ALIASES[quality] || quality;
    return { degree, offset, quality, raw: str };
  }
  return null;
}

/**
 * Enrichit une qualité de progression pour la difficulté demandée.
 * Contrairement à upgradeQualityForDifficulty (préserve le niveau courant),
 * cette fonction choisit explicitement la qualité correspondant au niveau.
 */
function progressionQualityForDifficulty(quality, difficulty) {
  const clean = MOVEMENT_QUALITY_ALIASES[quality] || quality;
  const path = QUALITY_UPGRADE_PATHS[clean] || [clean];
  // L'index direct (0..4) donne la qualité du niveau 1..5, ce qui garantit
  // un changement visible à chaque palier quand le chemin est bien calibré.
  const index = Math.min(Math.max(Number(difficulty) || 1, 1), path.length) - 1;
  return path[index];
}

function upgradeQualityForDifficulty(quality, difficulty) {
  const clean = MOVEMENT_QUALITY_ALIASES[quality] || quality;
  const path = QUALITY_UPGRADE_PATHS[clean] || [clean];
  const targetIndex = Math.min(difficulty, path.length) - 1;
  // On ne downgrade jamais : si la qualité actuelle est déjà avancée,
  // on la conserve.
  const currentLevel = tokenDifficultyLevel(clean);
  let chosen = clean;
  for (let i = path.length - 1; i >= targetIndex; i -= 1) {
    const candidate = path[i];
    if (tokenDifficultyLevel(candidate) <= difficulty) {
      chosen = candidate;
      break;
    }
  }
  if (tokenDifficultyLevel(chosen) < currentLevel) return clean;
  return chosen;
}

// Techniques proposées dans l'onglet Exercices. Four-Way Close est réservé au
// mode "Accord cible" car il tient dans une seule main et n'a pas de sens
// pédagogique en progression/mouvement où on veut entendre les accords dans
// leur contexte harmonique.
export const TECHNIQUES = [
  'auto', 'shell', 'two_note_shell', 'rootless', 'close', 'fourway_close',
  'drop2', 'drop3', 'drop2_4',
  'spread', 'open', 'block', 'quartal', 'so_what', 'upper_structure',
  'stride', 'cluster',
];

const PROGRESSION_TECHNIQUES = TECHNIQUES.filter((t) => t !== 'fourway_close');

export const TECHNIQUE_LABELS = {
  auto: 'Auto',
  shell: 'Shell',
  two_note_shell: 'Two-note shell',
  rootless: 'Rootless (A/B)',
  close: 'Close position',
  drop2: 'Drop 2',
  drop3: 'Drop 3',
  drop2_4: 'Drop 2-4',
  fourway_close: 'Four-Way Close',
  spread: 'Spread',
  open: 'Open',
  block: 'Block (Locked Hands)',
  quartal: 'Quartal',
  so_what: 'So What',
  upper_structure: 'Upper structure',
  stride: 'Stride',
  cluster: 'Cluster',
};

const MAX_TARGET_ATTEMPTS = 10;

/**
 * Calcule la difficulté (en étoiles) d'un symbole d'accord isolé.
 * @param {string} symbol - qualité seule, ex. 'm7'
 * @returns {number}
 */
export function difficultyOfSymbol(symbol) {
  return SYMBOL_DIFFICULTY[symbol] || 3;
}

/**
 * Bonus de difficulté lié à la technique réellement utilisée.
 * Les techniques complexes ou à grande tessiture ajoutent une demi-étoile.
 * @param {string} technique
 * @returns {number}
 */
function techniqueDifficultyBonus(target) {
  const technique = target?.voicing?.technique || 'auto';
  const complex = new Set(['drop2_4', 'block', 'spread', 'quartal', 'so_what', 'upper_structure']);
  if (complex.has(technique)) return 1;
  // Drop2/Drop3/Four-Way Close méritent un petit bonus structurel.
  if (technique === 'drop2' || technique === 'drop3' || technique === 'fourway_close') return 0.5;
  // Open position : bonus seulement si le voicing est réellement réparti sur
  // les deux mains avec un écart visible. Sinon il reste au niveau de Close.
  if (technique === 'open') {
    const leftHand = target?.voicing?.leftHand || [];
    const rightHand = target?.voicing?.rightHand || [];
    if (leftHand.length > 0 && rightHand.length > 0) {
      const gap = Math.min(...rightHand) - Math.max(...leftHand);
      return gap > 3 ? 0.5 : 0;
    }
    return 0;
  }
  return 0;
}

/**
 * Difficulté affichée d'un voicing généré.
 * Si le voicing vient du nouveau catalogue, on utilise sa difficulte normalisee.
 * Sinon on retombe sur le calcul historique (symbole + bonus technique).
 * @param {{symbol: string, voicing: {technique: string, difficulty?: number}}} target
 * @returns {number} 1–5 étoiles
 */
export function difficultyOfVoicing(target) {
  if (target?.voicing?.difficulty != null) {
    return target.voicing.difficulty;
  }
  const base = difficultyOfSymbol(target?.symbol || '');
  const bonus = techniqueDifficultyBonus(target);
  return Math.min(5, Math.max(1, Math.round(base + bonus)));
}

// Une technique de l'UI peut regrouper plusieurs familles VoicingLab :
// "Rootless" couvre les types A (départ sur la tierce) et B (départ sur la 7e).
const TECHNIQUE_FAMILIES = {
  rootless: ['rootlessA', 'rootlessB'],
};

function familiesForTechnique(technique) {
  return TECHNIQUE_FAMILIES[technique] || [TECHNIQUE_TO_FAMILY_ID[technique]].filter(Boolean);
}

const ROOT_PCS = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/**
 * Sépare un symbole complet en racine (pitch class) et qualité : "Ebm7" -> {3, 'm7'}.
 * @param {string} chordSymbol
 * @returns {{rootPc: number, quality: string}|null}
 */
function splitChordSymbol(chordSymbol) {
  const match = String(chordSymbol || '').match(/^([A-G])([b#]?)(.*)$/);
  if (!match) return null;
  const shift = match[2] === 'b' ? -1 : match[2] === '#' ? 1 : 0;
  return { rootPc: (ROOT_PCS[match[1]] + shift + 12) % 12, quality: match[3] };
}

/**
 * Voicings réels VoicingLab d'une technique pour un accord, dans l'ordre publié
 * par le site. Aucun voicing n'est calculé ici : liste vide = technique indisponible.
 */
function voicingLabVariantsFor(rootPc, quality, technique) {
  return familiesForTechnique(technique).flatMap((familyId) =>
    getVoicingLabVoicings(rootPc, quality, familyId).map((v) => ({ ...v, familyId }))
  );
}

/**
 * Retourne les techniques disponibles pour un symbole d'accord, avec le nombre
 * de variantes réelles publiées par VoicingLab pour cette racine précise.
 * @param {string} chordSymbol
 * @returns {{id: string, label: string, count: number, playable: boolean}[]}
 */
export function getAvailableTechniques(chordSymbol) {
  const chord = splitChordSymbol(chordSymbol);
  return TECHNIQUES.filter((t) => t !== 'auto').map((t) => {
    const count = chord ? voicingLabVariantsFor(chord.rootPc, chord.quality, t).length : 0;
    return {
      id: t,
      label: TECHNIQUE_LABELS[t] || t,
      count,
      playable: count > 0,
    };
  });
}

/**
 * Techniques inapplicables à un accord donné : celles pour lesquelles
 * VoicingLab ne publie aucun voicing pour cette racine et cette qualité.
 * @param {string} chordSymbol
 * @param {string} [mode='chord']
 * @returns {string[]} techniques à désactiver
 */
export function unavailableTechniquesFor(chordSymbol, mode = 'chord') {
  const allowed = mode === 'chord' ? TECHNIQUES : PROGRESSION_TECHNIQUES;
  const out = TECHNIQUES.filter((t) => !allowed.includes(t));
  const available = new Set(getAvailableTechniques(chordSymbol).filter((c) => c.playable).map((c) => c.id));
  for (const technique of allowed) {
    if (technique !== 'auto' && !available.has(technique)) out.push(technique);
  }
  return out;
}

/** Noms des progressions proposables dans le sélecteur du mode progression. */
export function listProgressionNames() {
  return PROGRESSION_TEMPLATES.map((t) => t.name);
}

/** Noms des mouvements proposables dans le sélecteur du mode mouvement. */
export function listMovementNames() {
  return movementsLibrary.movements.map((m) => m.name);
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pick(array) {
  return array[randomInt(0, array.length - 1)];
}

function formatNoteNameWithOctave(midi) {
  const pcName = noteName(midi);
  const octave = Math.floor(midi / 12) - 1;
  return `${pcName}${octave}`;
}

// Qualités proposées en mode Accord cible, par famille : 39 publiées par
// VoicingLab + 9 dérivées. Source unique du menu « Qualité » et du navigateur
// d'accords par note du dessus.
export const TARGET_QUALITY_GROUPS = [
  { id: 'major', label: 'Majeurs', qualities: ['6', '6/9', 'add9', 'add11', '6add11', 'maj7', 'maj9', 'maj11', 'maj13', 'maj7#11', 'maj13#11', 'maj7#5'] },
  { id: 'minor', label: 'Mineurs', qualities: ['m6', 'm6/9', 'madd9', 'm7', 'm9', 'm11', 'm13', 'm7#11', 'mMaj7', 'mMaj9'] },
  { id: 'dominant', label: 'Dominantes', qualities: ['7', '9', '11', '13', '13#11', '7#11', '7b9', '7#9', '7b5', '7#5', '7b13', '7#9b13', '7b5b9', '7#5#9', '7alt'] },
  { id: 'sus', label: 'Suspendus', qualities: ['sus2', 'sus4', '5', '7sus2', '7sus4', '9sus4', '13sus4'] },
  { id: 'dimaug', label: 'Diminués / augmentés', qualities: ['m7b5', 'dim7', 'aug', 'augMaj7'] },
];

/** Qualité servie par des voicings dérivés (absente de VoicingLab) ? */
export { isDerivedQuality };

// Recherche par note du dessus (mode Accord cible). Niveaux exprimés sur la
// difficulté VoicingLab des voicings (1 = close … 5 = cluster).
export const TOP_NOTE_LEVELS = {
  all: { label: 'Tous niveaux', min: 1, max: 5 },
  simple: { label: 'Simple (★1–2)', min: 1, max: 2 },
  intermediate: { label: 'Intermédiaire (★3)', min: 3, max: 3 },
  advanced: { label: 'Avancé (★4–5)', min: 4, max: 5 },
};

// Les shells n'ont que 2–3 notes à la main gauche : pas de vraie note du dessus.
// Stride : VoicingLab le publie en main gauche seule (basse + accord), même cas.
const TOP_NOTE_EXCLUDED_TECHNIQUES = new Set(['shell', 'two_note_shell', 'stride']);

/**
 * Voicings (VoicingLab réels et dérivés) d'un accord dont la note la plus haute
 * est `topPc`, quelle que soit son octave : aucune note du voicing ne dépasse
 * la note cible. Triés du plus simple au plus complexe ; un doublon exact
 * (mêmes notes ET même répartition des mains) n'est gardé qu'une fois.
 *
 * @param {number} rootPc
 * @param {string} quality
 * @param {number} topPc - pitch class de la note du dessus (0–11)
 * @param {{ level?: keyof TOP_NOTE_LEVELS, technique?: string }} [options]
 *   technique : 'auto' = toutes les techniques, sinon uniquement celle-ci
 */
export function findVoicingsByTopNote(rootPc, quality, topPc, { level = 'all', technique = 'auto' } = {}) {
  const range = TOP_NOTE_LEVELS[level] || TOP_NOTE_LEVELS.all;
  const techniques = (technique === 'auto' ? TECHNIQUES.filter((t) => t !== 'auto') : [technique])
    .filter((t) => !TOP_NOTE_EXCLUDED_TECHNIQUES.has(t));
  const seen = new Set();
  const out = [];
  for (const t of techniques) {
    for (const v of voicingLabVariantsFor(rootPc, quality, t)) {
      const notes = [...v.lh, ...v.rh].sort((a, b) => a - b);
      const top = notes[notes.length - 1];
      const difficulty = Math.min(5, Math.max(1, v.difficulty));
      if (((top % 12) + 12) % 12 !== topPc) continue;
      if (difficulty < range.min || difficulty > range.max) continue;
      // Mêmes notes mais mains différentes (ex. Spread F3 | C4 E4 A4 et Open
      // F3 C4 | E4 A4) = deux façons de jouer : on garde les deux.
      const key = `${v.lh.join(',')}|${v.rh.join(',')}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ ...v, technique: t, difficulty, topMidi: top });
    }
  }
  return out.sort((a, b) => a.difficulty - b.difficulty
    || TECHNIQUES.indexOf(a.technique) - TECHNIQUES.indexOf(b.technique));
}

const TECHNIQUE_SHORT_LABELS = {
  rootless: 'Rootless', close: 'Close', fourway_close: '4-way', drop2: 'Drop 2', drop3: 'Drop 3',
  drop2_4: 'Drop 2-4', spread: 'Spread', open: 'Open', block: 'Block', quartal: 'Quartal',
  so_what: 'So What', upper_structure: 'Upper str.', cluster: 'Cluster', stride: 'Stride',
};

/**
 * Recherche inversée : tous les accords (12 racines × qualités de
 * TARGET_QUALITY_GROUPS) qui ont au moins un voicing avec `topPc` au sommet.
 * `index` de chaque voicing = sa position dans findVoicingsByTopNote pour cet
 * accord (même niveau, même technique), donc sélectionnable directement.
 *
 * @param {number} topPc
 * @param {{ level?: string, technique?: string }} [options]
 * @returns {{group: string, groupLabel: string, rootPc: number, quality: string, name: string, derived: boolean,
 *   voicings: {index: number, technique: string, shortLabel: string, difficulty: number, derived: boolean, description: string}[]}[]}
 */
export function findChordsByTopNote(topPc, options = {}) {
  const out = [];
  for (const group of TARGET_QUALITY_GROUPS) {
    for (const quality of group.qualities) {
      for (let rootPc = 0; rootPc < 12; rootPc += 1) {
        const found = findVoicingsByTopNote(rootPc, quality, topPc, options);
        if (found.length === 0) continue;
        out.push({
          group: group.id,
          groupLabel: group.label,
          rootPc,
          quality,
          name: `${formatPc(rootPc, false)}${quality}`,
          derived: isDerivedQuality(quality),
          voicings: found.map((v, index) => ({
            index,
            technique: v.technique,
            shortLabel: TECHNIQUE_SHORT_LABELS[v.technique] || v.technique,
            difficulty: v.difficulty,
            derived: v.derived,
            description: describeVariant(v.technique, v),
          })),
        });
      }
    }
  }
  return out;
}

// Ordre pédagogique du mode Auto. À 1★ (Progression/Mouvement), on commence
// par les voicings VoicingLab de difficulté 1 : two-note shell puis shell.
const AUTO_ORDER = ['shell', 'two_note_shell', 'close', 'fourway_close', 'drop2', 'rootless'];
const AUTO_ORDER_BEGINNER = ['two_note_shell', 'shell', 'rootless', 'close', 'drop2'];

/** Libellé lisible d'une variante (note droppée, triade d'upper structure…). */
function describeVariant(technique, v) {
  const lh = v.lh.map((n) => formatNoteNameWithOctave(n)).join(' ');
  const rhNames = v.rh.map((n) => formatNoteNameWithOctave(n)).join(' ');
  const intervals = v.intervals.split(' ');
  switch (technique) {
    case 'drop2':
    case 'drop3':
    case 'drop2_4':
      return `Voix descendue${v.lh.length > 1 ? 's' : ''} : ${lh} (${intervals.slice(0, v.lh.length).join(', ')})`;
    case 'upper_structure': {
      const triad = triadName(v.rh);
      return triad ? `Triade ${triad} sur ${lh}` : `${rhNames} sur ${lh}`;
    }
    case 'rootless':
      return v.familyId === 'rootlessB' ? 'Type B (départ sur la 7e)' : 'Type A (départ sur la tierce)';
    default: {
      // Du grave à l'aigu : « basse » serait faux pour un voicing sans main gauche.
      const all = [...v.lh, ...v.rh];
      return `De ${formatNoteNameWithOctave(all[0])} à ${formatNoteNameWithOctave(all[all.length - 1])} · ${intervals.join(' ')}`;
    }
  }
}

/** Nom de la triade formée par 3 notes (Db, Ebm, E°, Ab+), ou null. */
function triadName(notes) {
  if (notes.length !== 3) return null;
  const pcs = [...new Set(notes.map((n) => ((n % 12) + 12) % 12))];
  const kinds = [[4, 7, ''], [3, 7, 'm'], [3, 6, '°'], [4, 8, '+']];
  for (const root of pcs) {
    const set = new Set(pcs.map((pc) => (pc - root + 12) % 12));
    const kind = kinds.find(([t, f]) => set.has(t) && set.has(f));
    if (kind && set.size === 3) return `${formatPc(root, false)}${kind[2]}`;
  }
  return null;
}

/**
 * Choisit un voicing réel VoicingLab pour l'accord. En mode 'auto', on prend la
 * première technique disponible dans l'ordre pédagogique ; sinon la technique
 * demandée, puis les autres si VoicingLab ne la publie pas pour cet accord.
 * `variant` sélectionne l'un des voicings publiés (modulo leur nombre).
 *
 * @param {number} rootPc
 * @param {string} quality
 * @param {string} technique - 'auto' | technique de TECHNIQUES
 * @param {number} [variant]
 * @param {number|null} [difficulty] - difficulté Progression/Mouvement (null en mode Accord)
 * @param {{pc: number, level: string}|null} [topNote] - recherche par note du dessus
 * @returns {{voicing: object|null, technique: string}}
 */
function buildPlayableVoicing(rootPc, quality, technique, variant = 0, difficulty = null, topNote = null) {
  if (topNote) return buildTopNoteVoicing(rootPc, quality, technique, variant, topNote);
  const autoOrder = difficulty === 1 ? AUTO_ORDER_BEGINNER : AUTO_ORDER;
  const first = technique === 'auto' ? autoOrder : [technique];
  const order = [...first, ...TECHNIQUES.filter((t) => t !== 'auto' && !first.includes(t))];

  for (const t of order) {
    const variants = voicingLabVariantsFor(rootPc, quality, t);
    if (variants.length === 0) continue;
    const index = ((variant % variants.length) + variants.length) % variants.length;
    const v = variants[index];
    const voicing = {
      leftHand: [...v.lh],
      rightHand: [...v.rh],
      technique: t,
      familyId: v.familyId,
      difficulty: Math.min(5, Math.max(1, v.difficulty)),
      register: '',
      isPlayable: true,
      diagnostics: [],
      fallback: false,
      source: 'voicinglab',
      voicingLabSymbol: v.symbol,
      variantIndex: index,
      variantCount: variants.length,
      variantLabel: describeVariant(t, v),
      derived: v.derived,
      derivedFrom: v.derivedFrom,
    };
    return { voicing, technique: t };
  }
  return { voicing: null, technique };
}

/**
 * Variante « note du dessus » : `variant` parcourt les suggestions de
 * findVoicingsByTopNote (toutes techniques confondues, du plus simple au plus
 * complexe). La liste résumée est jointe au voicing pour l'affichage.
 */
function buildTopNoteVoicing(rootPc, quality, technique, variant, topNote) {
  // Toujours toutes les techniques : la technique cliquée sur la carte ne doit
  // pas filtrer en silence la recherche (bug : Block seul → 0 en Simple/Intermédiaire).
  const suggestions = findVoicingsByTopNote(rootPc, quality, topNote.pc, { level: topNote.level });
  if (suggestions.length === 0) return { voicing: null, technique };
  const index = ((variant % suggestions.length) + suggestions.length) % suggestions.length;
  const v = suggestions[index];
  const voicing = {
    leftHand: [...v.lh],
    rightHand: [...v.rh],
    technique: v.technique,
    familyId: v.familyId,
    difficulty: v.difficulty,
    register: '',
    isPlayable: true,
    diagnostics: [],
    fallback: false,
    source: 'voicinglab',
    voicingLabSymbol: v.symbol,
    variantIndex: index,
    variantCount: suggestions.length,
    variantLabel: describeVariant(v.technique, v),
    derived: v.derived,
    derivedFrom: v.derivedFrom,
    topNote: { pc: topNote.pc, level: topNote.level, midi: v.topMidi },
    topNoteSuggestions: suggestions.map((s) => ({
      technique: s.technique,
      label: TECHNIQUE_LABELS[s.technique] || s.technique,
      difficulty: s.difficulty,
      derived: s.derived,
      description: describeVariant(s.technique, s),
    })),
  };
  return { voicing, technique: v.technique };
}

/**
 * Construit la cible complète d'un accord : nom, rootPc, symbol (qualité),
 * notes fusionnées LH+RH pour la détection/affichage, et le voicing complet.
 * Retourne null si VoicingLab ne publie aucun voicing pour cet accord.
 *
 * @param {number} rootPc
 * @param {string} symbol - qualité seule, ex. 'm7'
 * @param {string} technique
 * @param {number} [variant]
 * @param {number|null} [difficulty]
 * @param {{pc: number, level: string}|null} [topNote]
 * @returns {object|null}
 */
function buildChordTarget(rootPc, symbol, technique, variant = 0, difficulty = null, topNote = null) {
  const rootName = formatPc(rootPc, false);
  const chordSymbol = symbol ? `${rootName}${symbol}` : rootName;
  const { voicing, technique: usedTechnique } = buildPlayableVoicing(rootPc, symbol, technique, variant, difficulty, topNote);
  if (!voicing) return null;
  const notes = [...voicing.leftHand, ...voicing.rightHand];
  return {
    type: 'chord',
    rootPc,
    symbol,
    name: chordSymbol,
    notes,
    voicing: {
      ...voicing,
      technique: usedTechnique,
    },
  };
}

function parseMovementToken(token) {
  // Formats acceptés : "7", "b3maj7", "2m7b5", "b5alt", "1m"
  const match = String(token).match(/^([b#]?)(\d+)(.*)$/);
  if (!match) return null;
  const accidental = match[1];
  const degree = parseInt(match[2], 10);
  let quality = (match[3] || '').trim();
  let offset = DEGREE_SEMITONES[degree];
  if (offset == null) return null;
  if (accidental === 'b') offset = (offset - 1 + 12) % 12;
  if (accidental === '#') offset = (offset + 1) % 12;
  if (!quality) quality = DEFAULT_QUALITY_FOR_DEGREE[degree] || '';
  quality = MOVEMENT_QUALITY_ALIASES[quality] || quality;
  return { degree, offset, quality };
}

  function tokenDifficultyLevel(token) {
    const parsed = parseMovementToken(token);
    if (!parsed) return 5;
    const quality = parsed.quality;
    if (SYMBOL_DIFFICULTY[quality] != null) return SYMBOL_DIFFICULTY[quality];
    // Alias spécifiques aux mouvements.
    if (quality === 'mMaj7') return 5;
    if (quality === '7#9b13' || quality === '7alt') return 5;
    if (quality === 'm7b5') return 3;
    if (quality === 'm6') return 3;
    if (quality === 'maj7#11') return 5;
    if (quality === '6' || quality === '') return 1;
    if (quality === '7' || quality === 'maj7' || quality === 'm7') return 2;
    if (quality === 'm9' || quality === '9' || quality === 'maj9') return 3;
    if (quality.includes('b9') || quality.includes('#9') || quality.includes('#11')) return 5;
    return 3;
  }

  function isTokenDifficultyAllowed(token, difficulty) {
    return tokenDifficultyLevel(token) <= difficulty;
  }

  function buildMovementChords(movement, keyPc, technique, difficulty, variant = 0) {
    const tokens = movement.pattern.split('-');
    return tokens.map((token) => {
      const parsed = parseMovementToken(token);
      if (!parsed) return null;
      const quality = movement.preserveQualities
        ? parsed.quality
        : upgradeQualityForDifficulty(parsed.quality, difficulty);
      const rootPc = (keyPc + parsed.offset) % 12;
      const target = buildChordTarget(rootPc, quality, technique, variant, difficulty);
      if (!target) return null;
      return {
        ...target,
        token,
        degree: parsed.degree,
        quality,
      };
    }).filter(Boolean);
  }

export function createPracticeExercise() {
  // Difficulté prise en compte par le mode Auto (sélecteur masqué en mode Accord).
  const autoDifficulty = () => (state.mode === 'chord' ? null : state.difficulty);

  // Recherche par note du dessus : active uniquement en mode Accord cible.
  const topNoteFilter = () => (state.mode === 'chord' && state.topNote.pc != null ? state.topNote : null);

  /**
   * Cible du mode Accord cible, avec la note du dessus si elle est choisie.
   * Si aucun voicing de l'accord n'a cette note au sommet (à ce niveau), on
   * affiche le voicing standard marqué topNoteMiss pour le signaler à l'UI.
   */
  function chordModeTarget(rootPc, symbol, technique = state.technique) {
    const filter = topNoteFilter();
    const target = buildChordTarget(rootPc, symbol, technique, state.variant, autoDifficulty(), filter);
    if (target || !filter) return withDoublings(target);
    const plain = buildChordTarget(rootPc, symbol, technique, state.variant, autoDifficulty());
    return plain ? withDoublings({ ...plain, topNoteMiss: true }) : null;
  }

  /**
   * Doublures d'octave optionnelles (mode Accord cible) : ajoutées après le
   * choix du voicing VoicingLab, sans changer l'accord détecté.
   */
  function withDoublings(target) {
    if (!target || state.mode !== 'chord' || state.doubling === 'none') return target;
    const { leftHand, rightHand, doubled } = applyDoublings(target.voicing, target.rootPc, state.doubling);
    return {
      ...target,
      notes: [...leftHand, ...rightHand],
      voicing: { ...target.voicing, leftHand, rightHand, doubled },
    };
  }

  let state = {
    mode: 'chord',
    target: null,
    progression: null,
    stepIndex: 0,
    keyIndex: 0,
    score: 0,
    attempts: 0,
    technique: 'auto',
    difficulty: 3,
    variant: 0,
    topNote: { pc: null, level: 'all' },
    // Doublures d'octave : 'none' | 'bass' | 'melody' | 'full'.
    doubling: 'none',
    history: [],
    customProgressionDegrees: null,
    customProgressionKeyPc: null,
    // Mode Accord cible : accord explicitement choisi par l'utilisateur.
    targetChoice: null,
    // null = tirage aléatoire (comportement par défaut). Sinon, nom de la
    // progression / du mouvement explicitement choisi par l'utilisateur.
    progressionChoice: null,
    movementChoice: null,
    // Mode Progression / Mouvement : tonalité explicitement choisie.
    // null = aléatoire.
    keyChoice: null,
    // Mode Progression : progression personnalisée saisie par l'utilisateur.
    customProgression: null,
  };

  function pushHistory(target) {
    if (!target) return;
    state.history.push(target);
    if (state.history.length > 10) state.history.shift();
  }

  function popHistory() {
    return state.history.pop() || null;
  }

  function generateChordTarget() {
    // Si un accord cible a été choisi explicitement, on le régénère avec la
    // technique courante plutôt que de tirer au hasard.
    if (state.targetChoice) {
      const target = chordModeTarget(state.targetChoice.rootPc, state.targetChoice.symbol);
      if (target) return target;
    }
    // En mode Accord cible, la difficulté n'est pas choisie par l'utilisateur :
    // elle est imposée par l'accord + la technique. On tire donc dans toute la
    // bibliothèque de symboles disponibles, en laissant le moteur de voicing
    // décider si la combinaison est jouable.
    // Seules les qualités publiées par VoicingLab sont tirées au sort
    // (les triades majeures/mineures, m13, 11… n'y existent pas).
    const pool = state.mode === 'chord' ? ALL_PRACTICE_SYMBOLS : symbolsForDifficulty(state.difficulty, state.mode);
    const onVoicingLab = pool.filter((q) => isQualityOnVoicingLab(q));
    const allowedSymbols = onVoicingLab.length > 0 ? onVoicingLab : ['maj7'];
    // Avec une note du dessus, on tire jusqu'à trouver un accord qui l'a au sommet.
    const filter = topNoteFilter();
    const attempts = filter ? MAX_TARGET_ATTEMPTS * 20 : MAX_TARGET_ATTEMPTS;
    for (let i = 0; i < attempts; i += 1) {
      const rootPc = randomInt(0, 11);
      const symbol = pick(allowedSymbols);
      const target = buildChordTarget(rootPc, symbol, state.technique, state.variant, autoDifficulty(), filter);
      if (target) return withDoublings(target);
    }
    // Repli ultime : un accord jouable au niveau demandé, sinon Cmaj7 close.
    for (const symbol of allowedSymbols) {
      const target = buildChordTarget(0, symbol, 'close', state.variant, autoDifficulty());
      if (target) return withDoublings(target);
    }
    return withDoublings(buildChordTarget(0, 'maj7', 'close', state.variant, autoDifficulty()));
  }

  function buildProgressionFromTokens(tokens, keyPc, name) {
    const chords = tokens.map((token) => {
      const rootPc = (keyPc + token.offset) % 12;
      const base = token.quality || DEFAULT_QUALITY_FOR_DEGREE[token.degree] || '';
      // Palier demandé d'abord, puis paliers inférieurs si le moteur ne sait
      // pas encore voicer la qualité enrichie (ex. maj7#11, 7alt).
      let target = null;
      for (let level = state.difficulty; level >= 1 && !target; level -= 1) {
        target = buildChordTarget(rootPc, progressionQualityForDifficulty(base, level), state.technique, state.variant, autoDifficulty());
      }
      if (!target) return null;
      return {
        ...target,
        degree: token.degree === 1 ? 'I' : token.degree === 2 ? 'II' : token.degree === 3 ? 'III' : token.degree === 4 ? 'IV' : token.degree === 5 ? 'V' : token.degree === 6 ? 'VI' : 'VII',
      };
    });
    return chords.every(Boolean) ? { type: 'progression', name, keyPc, chords } : null;
  }

  function generateProgressionTarget() {
    // Progression personnalisée saisie par l'utilisateur en symboles complets
    // (ex. "Dm7 G7 Cmaj7") : contrôle total sur les extensions.
    if (state.customProgression && state.customProgression.length > 0) {
      const chords = state.customProgression.map((parsed, iDeg) => {
        const target = buildChordTarget(parsed.rootPc, parsed.symbol, state.technique, state.variant, autoDifficulty());
        if (!target) return null;
        return { ...target, degree: null };
      }).filter(Boolean);
      if (chords.length === state.customProgression.length) {
        return {
          type: 'progression',
          name: 'Progression personnalisée',
          keyPc: state.customProgression[0].rootPc,
          chords,
        };
      }
    }

    // Progression personnalisée saisie par degrés : l'application choisit les
    // qualités automatiquement selon la difficulté.
    if (state.customProgressionDegrees && state.customProgressionDegrees.length > 0) {
      const keyPc = state.customProgressionKeyPc ?? state.keyChoice ?? randomInt(0, 11);
      const built = buildProgressionFromTokens(state.customProgressionDegrees, keyPc, 'Progression personnalisée');
      if (built) return built;
    }

    // Progression explicitement choisie par l'utilisateur, sinon tirage au sort.
    const chosen = state.progressionChoice
      ? PROGRESSION_TEMPLATES.find((t) => t.name === state.progressionChoice)
      : null;
    // Toutes les progressions standards sont désormais valides à tous les niveaux
    // car leurs qualités s'enrichissent automatiquement.
    const pool = chosen ? [chosen] : PROGRESSION_TEMPLATES;
    for (let i = 0; i < MAX_TARGET_ATTEMPTS; i += 1) {
      const template = pick(pool);
      const keyPc = state.keyChoice ?? randomInt(0, 11);
      const tokens = getTemplateTokens(template);
      const built = buildProgressionFromTokens(tokens, keyPc, template.name);
      if (built) return built;
    }
    // Repli ultime : II-V-I majeur en Do.
    return {
      type: 'progression',
      name: 'II-V-I majeur',
      keyPc: 0,
      chords: ['m7', '7', 'maj7'].map((symbol, deg) => {
        const rootPc = ([2, 7, 0][deg]);
        const target = buildChordTarget(rootPc, symbol, state.technique, state.variant, autoDifficulty());
        return {
          ...target,
          degree: deg === 0 ? 'II' : deg === 1 ? 'V' : 'I',
        };
      }),
    };
  }

  function generateMovementTarget() {
    // Mouvement explicitement choisi par l'utilisateur, sinon tirage au sort.
    const chosen = state.movementChoice
      ? movementsLibrary.movements.find((m) => m.name === state.movementChoice)
      : null;
    // Filtre par niveau intrinsèque du mouvement si défini, sinon par analyse
    // des symboles de son pattern.
    const allowedMovements = movementsLibrary.movements.filter((m) => {
      if (typeof m.level === 'number') return m.level <= state.difficulty;
      return m.pattern.split('-').every((token) => isTokenDifficultyAllowed(token, state.difficulty));
    });
    // Si un mouvement a été explicitement choisi mais ne correspond pas au
    // niveau, on l'accepte quand même (l'utilisateur sait ce qu'il fait) ;
    // sinon on tire uniquement dans les mouvements adaptés.
    const pool = chosen
      ? [chosen]
      : (allowedMovements.length > 0 ? allowedMovements : movementsLibrary.movements);
    for (let i = 0; i < MAX_TARGET_ATTEMPTS; i += 1) {
      const movement = chosen || (allowedMovements.length > 0 ? pick(allowedMovements) : pick(pool));
      const startKey = state.keyChoice ?? randomInt(0, 11);
      const chords = buildMovementChords(movement, startKey, state.technique, state.difficulty, state.variant);
      if (chords.length === movement.pattern.split('-').length) {
        return {
          type: 'movement',
          name: movement.name,
          description: movement.description,
          category: movement.category,
          pattern: movement.pattern,
          movement,
          startKey,
          currentKey: startKey,
          totalKeys: 12,
          keyIndex: 0,
          stepIndex: 0,
          chords,
        };
      }
    }
    // Repli ultime : mouvement le plus facile autorisé, sinon le premier.
    const fallback = allowedMovements[0] || movementsLibrary.movements[0];
    const startKey = state.keyChoice ?? randomInt(0, 11);
    return {
      type: 'movement',
      name: fallback.name,
      description: fallback.description,
      category: fallback.category,
      pattern: fallback.pattern,
      movement: fallback,
      startKey,
      currentKey: startKey,
      totalKeys: 12,
      keyIndex: 0,
      stepIndex: 0,
      chords: buildMovementChords(fallback, startKey, state.technique, state.difficulty, state.variant),
    };
  }

  function attachMovementContext(chord, movementState) {
    if (!movementState || movementState.type !== 'movement') return chord;
    const keyName = formatPc(movementState.currentKey, false);
    return {
      ...chord,
      movementName: movementState.name,
      movementDescription: movementState.description,
      movementCategory: movementState.category,
      keyLabel: `Tonalité ${keyName}`,
      keyProgress: `${movementState.keyIndex + 1} / ${movementState.totalKeys} tons`,
      stepProgress: `${movementState.stepIndex + 1} / ${movementState.chords.length} accords`,
    };
  }

  /**
   * Régénère le voicing de la cible courante avec la technique stockée dans
   * l'état, sans changer l'accord (rootPc/symbol). Appelé quand l'utilisateur
   * change de technique ou après un setTechnique.
   */
  function regenerateCurrentTarget() {
    if (!state.target) return;
    const { rootPc, symbol } = state.target;
    const refreshed = state.mode === 'chord'
      ? chordModeTarget(rootPc, symbol)
      : buildChordTarget(rootPc, symbol, state.technique, state.variant, autoDifficulty());
    if (!refreshed) return;
    // topNoteMiss est recalculé à chaque régénération.
    if (!refreshed.topNoteMiss) delete state.target.topNoteMiss;
    // Conserver les métadonnées de contexte mouvement/progression.
    state.target = { ...state.target, ...refreshed };
  }

  function next(forceRegenerate = false) {
    state.attempts = 0;
    state.keyIndex = 0;
    state.stepIndex = 0;
    state.variant = 0;
    state.history = [];
    if (state.mode === 'chord') {
      state.target = generateChordTarget();
      state.progression = null;
    } else if (state.mode === 'progression') {
      state.progression = generateProgressionTarget();
      state.target = state.progression.chords[0];
    } else {
      state.progression = generateMovementTarget();
      state.target = attachMovementContext(state.progression.chords[0], state.progression);
    }
    return state;
  }

  function setMode(mode) {
    state.mode = mode;
    return next();
  }

  function setVariant(delta) {
    // En mode Auto, les flèches parcourent les variantes de la technique
    // réellement jouée, pas celles de la première catégorie.
    const max = Math.max(1, state.target?.voicing?.variantCount || 1);
    state.variant = ((state.variant + delta) % max + max) % max;
    regenerateCurrentTarget();
    if (state.progression && state.progression.chords) {
      const isMovement = state.mode === 'movement';
      const chords = state.progression.chords.map((chord) => {
        const refreshed = buildChordTarget(chord.rootPc, chord.symbol, state.technique, state.variant, autoDifficulty());
        if (!refreshed) return chord;
        const { notes, voicing } = refreshed;
        return { ...chord, notes, voicing };
      });
      state.progression.chords = chords;
      state.target = isMovement
        ? attachMovementContext(chords[state.progression.stepIndex || 0], state.progression)
        : chords[state.stepIndex || 0];
    }
  }

  function setTechnique(technique) {
    if (!TECHNIQUES.includes(technique)) return;
    state.technique = technique;
    state.variant = 0;
    // En mode accord cible avec cible choisie, on la régénère directement.
    if (state.mode === 'chord' && state.targetChoice) {
      state.target = chordModeTarget(state.targetChoice.rootPc, state.targetChoice.symbol, technique);
      return;
    }
    regenerateCurrentTarget();
    // En mode progression/mouvement, il faut aussi recalculer les autres accords
    // de la grille pour qu'ils partagent la même technique.
    if (state.progression && state.progression.chords) {
      const isMovement = state.mode === 'movement';
      const chords = state.progression.chords.map((chord) => {
        const refreshed = buildChordTarget(chord.rootPc, chord.symbol, technique, state.variant, autoDifficulty());
        if (!refreshed) return chord;
        const { notes, voicing } = refreshed;
        return { ...chord, notes, voicing };
      });
      state.progression.chords = chords;
      state.target = isMovement
        ? attachMovementContext(chords[state.progression.stepIndex || 0], state.progression)
        : chords[state.stepIndex || 0];
    }
  }

  function setDifficulty(difficulty) {
    const level = Number(difficulty);
    if (!DIFFICULTY_LEVELS.includes(level)) return;
    state.difficulty = level;
    // Régénère explicitement la cible/progression courante avec les nouvelles
    // qualités. On ne conserve PAS l'ancienne séquence : le changement de
    // difficulté doit être visible immédiatement.
    return next(true);
  }

  /**
   * Choix explicite de la tonalité pour les modes Progression et Mouvement.
   * `null` ou une valeur invalide rétablit le tirage aléatoire.
   * @param {number|string|null} keyPc - 0-11 ou null
   */
  function setKeyChoice(keyPc) {
    const pc = keyPc === '' || keyPc == null ? null : Number(keyPc);
    if (pc != null && (!Number.isFinite(pc) || pc < 0 || pc > 11)) return;
    state.keyChoice = pc;
    return next();
  }

  /**
   * Choix explicite de l'accord cible (mode Accord cible uniquement).
   * @param {number} rootPc - 0-11
   * @param {string} symbol - qualité seule, ex. 'm7'
   */
  function setTargetChoice(rootPc, symbol) {
    if (state.mode !== 'chord') return;
    state.targetChoice = { rootPc, symbol };
    state.variant = 0;
    const target = chordModeTarget(rootPc, symbol);
    if (target) {
      state.target = target;
    }
  }

  /**
   * Note du dessus recherchée (mode Accord cible). null = recherche désactivée.
   * @param {number|null} pc - 0–11
   */
  function setTopNote(pc) {
    state.topNote = { ...state.topNote, pc: pc == null || Number.isNaN(pc) ? null : ((pc % 12) + 12) % 12 };
    state.variant = 0;
    if (state.mode === 'chord' && state.target) regenerateCurrentTarget();
  }

  /** Niveau de difficulté des suggestions par note du dessus. */
  function setTopNoteLevel(level) {
    if (!TOP_NOTE_LEVELS[level]) return;
    state.topNote = { ...state.topNote, level };
    state.variant = 0;
    if (state.mode === 'chord' && state.target) regenerateCurrentTarget();
  }

  /** Doublures d'octave (mode Accord cible). */
  function setDoubling(mode) {
    if (!DOUBLING_MODES.includes(mode)) return;
    state.doubling = mode;
    if (state.mode === 'chord' && state.target) regenerateCurrentTarget();
  }

  /** Sélection directe d'une suggestion (clic dans la liste). */
  function selectTopNoteSuggestion(index) {
    const count = state.target?.voicing?.topNoteSuggestions?.length || 0;
    if (count === 0) return;
    state.variant = Math.max(0, Math.min(count - 1, index));
    regenerateCurrentTarget();
  }

  function clearTargetChoice() {
    state.targetChoice = null;
    state.target = generateChordTarget();
  }

  /**
   * Vrai si un accord précédent existe : soit dans la séquence en cours,
   * soit dans l'historique des accords déjà joués (utile quand l'exercice a
   * avancé automatiquement vers une nouvelle tonalité ou un nouveau contenu).
   */
  function canGoPrevious() {
    if (state.mode === 'chord') return state.history.length > 0;
    if (!state.progression) return false;
    if (state.mode === 'progression') return state.stepIndex > 0;
    return state.progression.stepIndex > 0 || state.progression.keyIndex > 0 || state.history.length > 0;
  }

  /**
   * Revient à l'accord précédent pour réexaminer son voicing (et par exemple
   * changer de technique ou de variante). Ne consomme aucune tentative et ne
   * touche PAS au score : c'est une navigation, pas une réponse.
   *
   * @returns {{stepIndex: number, keyIndex: number}|null} null si déjà au début
   */
  function previous() {
    if (!canGoPrevious()) return null;

    if (state.mode === 'chord') {
      const prev = popHistory();
      if (prev) {
        state.target = prev;
        state.attempts = 0;
      }
      return { stepIndex: 0, keyIndex: 0 };
    }

    if (state.mode === 'progression') {
      if (state.stepIndex > 0) {
        state.stepIndex -= 1;
        state.attempts = 0;
        state.target = state.progression.chords[state.stepIndex];
        return { stepIndex: state.stepIndex, keyIndex: state.keyIndex };
      }
      return null;
    }

    const prog = state.progression;
    if (prog.stepIndex > 0) {
      prog.stepIndex -= 1;
    } else if (prog.keyIndex > 0) {
      // Retour au dernier accord de la tonalité précédente.
      prog.keyIndex -= 1;
      prog.currentKey = (prog.startKey + prog.keyIndex + 12) % 12;
      prog.chords = buildMovementChords(prog.movement, prog.currentKey, state.technique, state.difficulty, state.variant);
      prog.stepIndex = Math.max(0, prog.chords.length - 1);
    } else {
      // Restauration depuis l'historique (ancien mouvement ou tonalité).
      const prev = popHistory();
      if (prev) {
        state.attempts = 0;
        state.target = prev;
        return { stepIndex: state.stepIndex, keyIndex: state.keyIndex };
      }
    }
    state.stepIndex = prog.stepIndex;
    state.keyIndex = prog.keyIndex;
    state.attempts = 0;
    state.target = attachMovementContext(prog.chords[prog.stepIndex], prog);
    return { stepIndex: prog.stepIndex, keyIndex: prog.keyIndex };
  }

  /**
   * Fixe la progression (mode progression) ou le mouvement (mode mouvement)
   * proposé. `null` rétablit le tirage aléatoire.
   */
  function setContentChoice(name) {
    const value = name || null;
    if (state.mode === 'movement') state.movementChoice = value;
    else {
      state.progressionChoice = value;
      // Choisir un template standard désactive la progression personnalisée,
      // sinon le champ personnalisé masquerait le template sélectionné.
      state.customProgression = null;
      state.customProgressionDegrees = null;
      state.customProgressionKeyPc = null;
    }
    return next();
  }

  /**
   * Désélectionne le template/mouvement courant sans toucher à une progression
   * personnalisée déjà saisie. Utilisé par la bibliothèque pour l'entrée
   * « Progression personnalisée ».
   */
  function clearContentChoice() {
    if (state.mode === 'movement') state.movementChoice = null;
    else state.progressionChoice = null;
    return next();
  }

  /**
   * Définit une progression personnalisée à partir de symboles d'accords
   * (ex. "Dm7 G7 Cmaj7"). Chaque accord est parsé et stocké pour génération.
   * @param {string} input
   */
  function setCustomProgression(input) {
    const symbols = String(input || '').trim().split(/\s+/).filter(Boolean);
    if (symbols.length === 0) {
      state.customProgression = null;
      return next();
    }
    const parsed = symbols.map((sym) => {
      const p = parseChordSymbol(sym);
      if (!p || !p.ok) return null;
      return { rootPc: p.rootPc, symbol: p.qualityId || '', name: sym };
    }).filter(Boolean);
    state.customProgression = parsed.length > 0 ? parsed : null;
    return next();
  }

  /**
   * Définit une progression personnalisée à partir d'une liste de degrés.
   * L'application choisit la qualité automatiquement selon la difficulté.
   * @param {{degree: number, accidental: string, quality?: string}[]} degrees
   */
  function setCustomProgressionFromDegrees(degrees) {
    if (!degrees || degrees.length === 0) {
      state.customProgression = null;
      return next();
    }
    const parsed = degrees.map((d) => {
      const token = `${d.accidental || ''}${d.degree}${d.quality ? `:${d.quality}` : ''}`;
      const p = parseProgressionToken(token);
      if (!p) return null;
      // parseProgressionToken remplit déjà la qualité par défaut du degré
      // (I=maj7, II=m7, etc.). On l'enrichit ensuite selon la difficulté.
      // On conserve la qualité de BASE : buildProgressionFromTokens la
      // ré-enrichit à chaque régénération selon la difficulté courante.
      return { degree: d.degree, accidental: d.accidental || '', quality: p.quality, offset: p.offset };
    }).filter(Boolean);
    state.customProgressionDegrees = parsed.length > 0 ? parsed : null;
    state.customProgression = null;
    return next();
  }

  function advanceMovement() {
    if (state.mode !== 'movement' || !state.progression) return null;
    const prog = state.progression;
    prog.stepIndex++;
    if (prog.stepIndex >= prog.chords.length) {
      prog.keyIndex++;
      if (prog.keyIndex >= prog.totalKeys) {
        return { completed: true };
      }
      prog.stepIndex = 0;
      prog.currentKey = (prog.startKey + prog.keyIndex) % 12;
      prog.chords = buildMovementChords(prog.movement, prog.currentKey, state.technique, state.difficulty, state.variant);
    }
    state.stepIndex = prog.stepIndex;
    state.keyIndex = prog.keyIndex;
    return { completed: false };
  }

  function check(notes) {
    if (!state.target) return { success: false, message: 'Aucun exercice actif.' };

    const detected = detectChord(notes);
    state.attempts++;

    if (state.mode === 'chord') {
      // La cible affichée devient l'accord DÉTECTÉ du voicing proposé, et la
      // réponse de l'élève est comparée à cette cible détectée. Cela permet de
      // valider des voicings riches (quartal → Dm11) sans les rejeter.
      const targetDetected = detectChord(state.target.notes) || state.target;
      const success = detected
        && detected.rootPc === targetDetected.rootPc
        && detected.symbol === targetDetected.symbol;
      if (success) {
        state.score += Math.max(1, 4 - state.attempts + 1);
        const old = state.target;
        pushHistory(old);
        state.target = generateChordTarget();
        state.attempts = 0;
        return {
          success: true,
          message: `✅ ${old.name} correct ! Prochain : ${state.target.name}`,
          previousName: old.name,
          nextName: state.target.name,
        };
      }
      const playedName = detected ? `${formatPc(detected.rootPc, false)}${detected.symbol}` : 'inconnu';
      return {
        success: false,
        message: `❌ Vous avez joué ${playedName}. Cible : ${state.target.name}`,
        hint: state.target.notes,
      };
    }

    if (state.mode === 'progression') {
      const expected = state.progression.chords[state.stepIndex];
      const expectedDetected = detectChord(expected.notes) || expected;
      const success = detected
        && detected.rootPc === expectedDetected.rootPc
        && detected.symbol === expectedDetected.symbol;
      if (success) {
        state.stepIndex++;
        pushHistory(state.progression.chords[state.stepIndex - 1]);
        if (state.stepIndex >= state.progression.chords.length) {
          state.score += 10;
          const completedName = state.progression.name;
          state.progression = generateProgressionTarget();
          state.target = state.progression.chords[0];
          state.stepIndex = 0;
          return {
            success: true,
            message: `✅ Progression ${completedName} terminée ! Suivante : ${state.progression.name}`,
            completed: true,
          };
        }
        state.target = state.progression.chords[state.stepIndex];
        return {
          success: true,
          message: `✅ ${expected.name} correct. Suivant : ${state.target.name}`,
          stepIndex: state.stepIndex,
        };
      }
      const playedName = detected ? `${formatPc(detected.rootPc, false)}${detected.symbol}` : 'inconnu';
      return {
        success: false,
        message: `❌ Attendu ${expected.name} (degré ${expected.degree}), joué ${playedName}.`,
        hint: expected.notes,
      };
    }

    // Mode mouvement dans les 12 tons
    const expected = state.progression.chords[state.stepIndex];
    const expectedDetected = detectChord(expected.notes) || expected;
    const success = detected
      && detected.rootPc === expectedDetected.rootPc
      && detected.symbol === expectedDetected.symbol;
    if (success) {
      const justCompletedKey = state.stepIndex + 1 >= state.progression.chords.length;
      pushHistory(state.progression.chords[state.stepIndex]);
      const advance = advanceMovement();
      if (!advance) {
        return { success: false, message: "Erreur interne de l'exercice." };
      }
      if (advance.completed) {
        state.score += 50;
        const completedName = state.progression.name;
        state.progression = generateMovementTarget();
        state.target = attachMovementContext(state.progression.chords[0], state.progression);
        state.stepIndex = 0;
        state.keyIndex = 0;
        state.attempts = 0;
        return {
          success: true,
          message: `✅ ${completedName} parcouru en 12 tons ! Suivant : ${state.progression.name}`,
          completed: true,
        };
      }
      state.target = attachMovementContext(state.progression.chords[state.progression.stepIndex], state.progression);
      state.stepIndex = state.progression.stepIndex;
      state.keyIndex = state.progression.keyIndex;
      if (justCompletedKey) {
        return {
          success: true,
          message: `✅ Tonalité ${formatPc(state.progression.currentKey, false)} validée. Prochain ton : ${state.target.keyLabel}`,
        };
      }
      return {
        success: true,
        message: `✅ ${expected.name} correct. Suivant : ${state.target.name}`,
      };
    }
    const playedName = detected ? `${formatPc(detected.rootPc, false)}${detected.symbol}` : 'inconnu';
    return {
      success: false,
      message: `❌ Attendu ${expected.name} (${state.target.keyLabel}), joué ${playedName}.`,
      hint: expected.notes,
    };
  }

  function getState() {
    return { ...state };
  }

  return {
    next,
    previous,
    canGoPrevious,
    setMode,
    setTechnique,
    setVariant,
    setDifficulty,
    setKeyChoice,
    setTargetChoice,
    clearTargetChoice,
    setTopNote,
    setTopNoteLevel,
    selectTopNoteSuggestion,
    setDoubling,
    setContentChoice,
    clearContentChoice,
    setCustomProgression,
    setCustomProgressionFromDegrees,
    check,
    getState,
  };
}

/**
 * Convertit un voicing d'exercice en séquence MIDI temporisée, prête à être
 * passée au mécanisme de lecture audio (playVirtualNote / releaseVirtualNote).
 *
 * @param {object} voicing
 * @returns {{midi: number, startOffsetMs: number, durationMs: number}[]}
 */
export function exerciseVoicingToSequence(voicing) {
  const notes = [...(voicing?.leftHand || []), ...(voicing?.rightHand || [])];
  const startOffsetMs = 0;
  const durationMs = 1200;
  return notes.map((midi) => ({
    midi,
    startOffsetMs,
    durationMs,
  }));
}

export function renderExerciseTarget(target, options = {}) {
  if (!target) return '';
  const voicing = target.voicing || null;
  // Le clavier reste unifié : toutes les notes actives, sans distinction LH/RH.
  const notes = [...new Set([...(voicing?.leftHand || []), ...(voicing?.rightHand || []), ...(target.notes || [])])].sort((a, b) => a - b);
  const technique = voicing?.technique || 'auto';

  const doubled = voicing?.doubled || [];
  const kb = miniKeyboardForNotes(notes, { leftHand: [], rightHand: [], added: doubled });

  // Affichage des mains : si le moteur a produit un split LH/RH avec des
  // notes distinctes, on montre les deux blocs ; sinon un seul bloc.
  const leftHand = voicing?.leftHand || [];
  const rightHand = voicing?.rightHand || [];
  const splitDisplay = leftHand.length > 0 && rightHand.length > 0
    && leftHand.some((n) => !rightHand.includes(n));

  const allNames = notes.map((n) => formatNoteNameWithOctave(n)).join(' · ');
  const difficulty = options.difficulty ?? difficultyOfVoicing(target);
  const categories = options.categories ?? getAvailableTechniques(target.name);
  const variant = options.variant ?? 0;

  return `
    <div class="exercise-target-card ${target.movementName ? 'has-movement' : ''}">
      <div class="exercise-target-header">
        <div class="exercise-target-title">
          <div class="exercise-target-name">${escapeHtml(target.name)}</div>
        </div>
        <div class="exercise-target-stars" aria-label="Difficulté ${difficulty} sur 5" title="Difficulté ${difficulty} sur 5">
          ${renderStars(difficulty)}
        </div>
      </div>
      ${voicing?.topNoteSuggestions
    ? renderTopNotePanel(voicing)
    : `${renderVoicingCategories(categories, technique, voicing?.variantIndex ?? variant, voicing?.variantLabel || '', options.selectedTechnique ?? technique)}
      ${voicing?.variantCount > 1 ? `<div class="exercise-variant-label">${escapeHtml(voicing.variantLabel)}</div>` : ''}`}
      ${target.topNoteMiss ? `<div class="exercise-topnote-miss">Aucun voicing de ${escapeHtml(target.name)} n'a cette note au sommet à ce niveau : voicing habituel affiché.</div>` : ''}
      ${voicing?.derived ? `<div class="exercise-derived-note" title="Qualité absente de VoicingLab : voicing VoicingLab réel de ${escapeHtml(voicing.derivedFrom)} dont une note est déplacée">Voicing dérivé de ${escapeHtml(voicing.derivedFrom)} (absent de VoicingLab)</div>` : ''}
      <div class="exercise-target-keyboard">${kb.svg}</div>
      ${doubled.length > 0 ? `<div class="exercise-doubled-note">Doublure${doubled.length > 1 ? 's' : ''} ajoutée${doubled.length > 1 ? 's' : ''} : ${escapeHtml(formatHandNotes(doubled))}</div>` : ''}
      <div class="exercise-target-hands">
        ${splitDisplay ? renderHandSplit(leftHand, rightHand) : renderUnifiedHand(allNames, singleHandLabel(leftHand, rightHand))}
      </div>
      <button class="exercise-listen-btn" type="button" data-action="listen-exercise" aria-label="Écouter le voicing">
        <svg class="tr-i" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" fill="currentColor"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>
        Écouter
      </button>
    </div>
  `;
}

/**
 * Panneau « note du dessus » : un seul voicing au clavier, la liste compacte
 * des suggestions (du plus simple au plus complexe) et les flèches ‹ ›.
 */
function renderTopNotePanel(voicing) {
  const { topNote, topNoteSuggestions: list, variantIndex } = voicing;
  const topName = formatNoteNameWithOctave(topNote.midi);
  const items = list.map((sug, i) => {
    const active = i === variantIndex ? ' active' : '';
    const derived = sug.derived ? ' <span class="exercise-topnote-derived" title="Voicing dérivé (qualité absente de VoicingLab)">dérivé</span>' : '';
    return `<li><button type="button" class="exercise-topnote-item${active}" data-topnote-index="${i}" title="${escapeHtml(sug.description)}">
        <span class="exercise-topnote-tech">${escapeHtml(sug.label)}</span>${derived}
        <span class="exercise-topnote-stars" aria-label="Difficulté ${sug.difficulty} sur 5">${'★'.repeat(sug.difficulty)}</span>
      </button></li>`;
  }).join('');
  const arrows = list.length > 1
    ? `<span class="exercise-variant-arrows">
         <button class="exercise-variant-btn" type="button" data-variant-delta="-1" aria-label="Suggestion précédente">‹</button>
         <span class="exercise-variant-index">${variantIndex + 1}/${list.length}</span>
         <button class="exercise-variant-btn" type="button" data-variant-delta="1" aria-label="Suggestion suivante">›</button>
       </span>`
    : '';
  return `
    <div class="exercise-topnote-panel">
      <div class="exercise-topnote-head">
        <span>Note du dessus : <strong>${escapeHtml(topName)}</strong> · ${list.length} voicing${list.length > 1 ? 's' : ''}</span>
        ${arrows}
      </div>
      <ol class="exercise-topnote-list">${items}</ol>
      <div class="exercise-variant-label">${escapeHtml(voicing.variantLabel)}</div>
    </div>`;
}

/**
 * Navigateur « accords avec cette note au sommet » (colonne de gauche) :
 * filtres par famille, puis un accord par ligne avec ses voicings en puces.
 *
 * @param {ReturnType<typeof findChordsByTopNote>} results
 * @param {{ topPc: number, family?: string, selected?: {rootPc: number, quality: string, index: number}|null }} options
 */
export function renderTopNoteBrowser(results, { topPc, family = 'all', selected = null } = {}) {
  const topName = formatPc(topPc, false);
  const families = [{ id: 'all', label: 'Tous' }, ...TARGET_QUALITY_GROUPS.map((g) => ({ id: g.id, label: g.label }))];
  const countFor = (id) => results.filter((r) => id === 'all' || r.group === id).length;
  const chips = families
    .filter((f) => f.id === 'all' || countFor(f.id) > 0)
    .map((f) => `<button type="button" class="exercise-browser-family${f.id === family ? ' active' : ''}" data-browse-family="${f.id}">${escapeHtml(f.label)} <span>${countFor(f.id)}</span></button>`)
    .join('');
  const shown = results.filter((r) => family === 'all' || r.group === family);
  const total = shown.reduce((a, r) => a + r.voicings.length, 0);
  let lastGroup = null;
  const rows = shown.map((r) => {
    const head = r.group !== lastGroup ? `<li class="exercise-browser-group">${escapeHtml(r.groupLabel)}</li>` : '';
    lastGroup = r.group;
    const isSelectedChord = selected && selected.rootPc === r.rootPc && selected.quality === r.quality;
    const voicings = r.voicings.map((v) => {
      const active = isSelectedChord && selected.index === v.index ? ' active' : '';
      return `<button type="button" class="exercise-browser-voicing${active}" data-browse-root="${r.rootPc}" data-browse-quality="${escapeHtml(r.quality)}" data-browse-index="${v.index}" title="${escapeHtml(`${v.description}${v.derived ? ' — dérivé' : ''}`)}">${escapeHtml(v.shortLabel)} <span class="exercise-browser-stars">${'★'.repeat(v.difficulty)}</span></button>`;
    }).join('');
    return `${head}<li class="exercise-browser-chord${isSelectedChord ? ' selected' : ''}">
        <span class="exercise-browser-name">${escapeHtml(r.name)}${r.derived ? '<span class="exercise-browser-derived" title="Qualité absente de VoicingLab : voicings dérivés">*</span>' : ''}</span>
        <span class="exercise-browser-voicings">${voicings}</span>
      </li>`;
  }).join('');
  return `
    <div class="exercise-browser-head">Accords avec <strong>${escapeHtml(topName)}</strong> au sommet · ${shown.length} accords · ${total} voicings</div>
    <div class="exercise-browser-families">${chips}</div>
    ${shown.length === 0
    ? '<p class="exercise-browser-empty">Aucun voicing à ce niveau.</p>'
    : `<ul class="exercise-browser-list" data-browser-scroll>${rows}</ul>`}
    <p class="exercise-browser-note">* qualité absente de VoicingLab (voicings dérivés)</p>`;
}

function renderStars(difficulty) {
  const filled = Math.min(5, Math.max(1, Number(difficulty) || 1));
  const empty = 5 - filled;
  const fullStar = '<span class="star filled">★</span>';
  const emptyStar = '<span class="star empty">☆</span>';
  return fullStar.repeat(filled) + emptyStar.repeat(empty);
}

/**
 * Étiquettes de techniques. `selectedTechnique` = choix de l'utilisateur
 * ('auto' possible) ; `activeTechnique` = technique réellement jouée. En Auto,
 * l'étiquette Auto est active et la technique jouée est marquée « current »
 * (contour) avec ses flèches de variantes.
 */
function renderVoicingCategories(categories, activeTechnique, variant = 0, variantLabel = '', selectedTechnique = activeTechnique) {
  if (!categories || categories.length === 0) return '';
  const isAuto = selectedTechnique === 'auto';
  const autoTag = `<span class="exercise-category-tag exercise-category-auto${isAuto ? ' active' : ''}" data-technique="auto" title="L'application choisit la technique (ordre pédagogique)" aria-pressed="${isAuto}">${escapeHtml(TECHNIQUE_LABELS.auto)}</span>`;
  const items = categories.map((cat) => {
    const playing = cat.id === activeTechnique;
    const state = playing ? (isAuto ? ' current' : ' active') : '';
    const playable = cat.playable ? '' : ' disabled';
    const count = cat.count > 1 ? ` (${cat.count})` : '';
    const arrows = (playing && cat.count > 1)
      ? `<span class="exercise-variant-arrows">
           <button class="exercise-variant-btn" type="button" data-variant-delta="-1" aria-label="Variante précédente">‹</button>
           <span class="exercise-variant-index" title="${escapeHtml(variantLabel)}">${variant + 1}/${cat.count}</span>
           <button class="exercise-variant-btn" type="button" data-variant-delta="1" aria-label="Variante suivante">›</button>
         </span>`
      : '';
    return `<span class="exercise-category-tag${state}${playable}" data-technique="${escapeHtml(cat.id)}" title="${cat.playable ? '' : 'Non applicable à cet accord'}" aria-disabled="${!cat.playable}">${escapeHtml(cat.label)}${count}${arrows}</span>`;
  }).join('');
  return `<div class="exercise-voicing-categories">${autoTag}${items}</div>`;
}

function formatHandNotes(notes) {
  if (!notes || notes.length === 0) return '—';
  return notes.map((n) => formatNoteNameWithOctave(n)).join(' · ');
}

/** Libellé du bloc unique : une seule main quand VoicingLab n'en utilise qu'une. */
function singleHandLabel(leftHand, rightHand) {
  if (leftHand.length > 0 && rightHand.length === 0) return 'Main gauche';
  if (rightHand.length > 0 && leftHand.length === 0) return 'Main droite';
  return 'Les deux mains';
}

function renderUnifiedHand(allNames, label = 'Les deux mains') {
  return `
    <div class="exercise-hand exercise-hand-unified">
      <span class="exercise-hand-label">${escapeHtml(label)}</span>
      <span class="exercise-hand-notes">${escapeHtml(allNames || '—')}</span>
    </div>
  `;
}

function renderHandSplit(leftHand, rightHand) {
  return `
    <div class="exercise-hand exercise-hand-lh">
      <span class="exercise-hand-label">Main gauche</span>
      <span class="exercise-hand-notes">${escapeHtml(formatHandNotes(leftHand))}</span>
    </div>
    <div class="exercise-hand exercise-hand-rh">
      <span class="exercise-hand-label">Main droite</span>
      <span class="exercise-hand-notes">${escapeHtml(formatHandNotes(rightHand))}</span>
    </div>
  `;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
