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
// [Claude] — 2026-09-24 — check() juge la réponse sur l'accord ANNONCÉ
// (judgeAnswer), plus sur la lecture du voicing affiché par detectChord ; les
// voicings trop aigus, toutes familles, descendent d'octave (withPlayableRegister).
// [Claude] — 2026-09-24 — Accords de 11e, de 13e et altérés : les voicings
// VoicingLab qui ne respectent pas la définition de leur famille ou une règle
// de voicing des manuels sont reconstruits (textbook-voicings.js) ; aucun
// voicing ne descend sous les limites d'intervalle grave de Levine.

import { detectChord } from './chord-engine/index.js';
import { formatPc, noteName } from './chord-engine/naming.js';
import { miniKeyboardForNotes } from './ui/mini-keyboard.js';
import movementsLibrary from './data/movements-library.json' with { type: 'json' };
import { getVoicingLabVoicings, isQualityOnVoicingLab, isDerivedQuality } from './voicing-engine/voicinglab-availability.js';
import {
  respectsLowIntervalLimits, minorNinthClashes, hasEleventhAgainstMajorThird, respectsFamilyDefinition,
  rebuildFromNotes, upperStructureCandidates, dominantScalesFor, fitsChordScale,
} from './voicing-engine/textbook-voicings.js';
import { parseChordSymbol, chordSymbolToPitchClasses } from './pedagogie/chord-parser-v2.js';
import { applyDoublings, DOUBLING_MODES, DOUBLING_LABELS } from './voicing-engine/doublings.js';
// Main gauche d'un style (option de la carte) : mêmes mains que la démo. Import
// circulaire sans risque : practice-demo.js n'appelle ce module qu'à l'usage.
import { styleLeftHand, LEFT_HAND_STYLES } from './practice-demo.js';
import { spellDegreeInKey, spellPcInKey, keyLabel, isMinorProgression } from './practice-key-spelling.js';

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

// [Claude] — 2026-09-24 — Mode Progression retiré (décision de Narcisse : il
// choisissait seul extensions et altérations, sans contexte). Les mouvements
// gardent la même syntaxe de jetons (parseProgressionToken) ; une grille tapée
// en symboles se joue désormais comme un mouvement (« Ma grille »).

const DEGREE_SEMITONES = {
  1: 0, 2: 2, 3: 4, 4: 5, 5: 7, 6: 9, 7: 11,
};

const DEFAULT_QUALITY_FOR_DEGREE = {
  1: 'maj7', 2: 'm7', 3: 'm7', 4: 'maj7', 5: '7', 6: 'm7', 7: '7',
};

// « alt » seul (jeton « 5alt » de la bibliothèque) = 7#9b13 ; « 7alt » écrit en
// toutes lettres (grille tapée) reste 7alt, publié par VoicingLab.
const MOVEMENT_QUALITY_ALIASES = {
  alt: '7#9b13',
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
 * Qualité d'un accord de mouvement au niveau demandé : le palier du chemin
 * d'enrichissement (niveau 1 = qualité de base … niveau 5 = altérée). Une
 * qualité hors chemin (m7b5, mMaj7, 7#9b13…) est fixée par le mouvement.
 * [Claude] — 2026-09-24 — Corrige le niveau (Narcisse : « en Avancé, ce qui
 * s'affiche ne fait pas avancé ») : la difficulté d'un palier était lue comme
 * celle d'un jeton de mouvement (« m9 » → illisible → 5★), si bien que seul le
 * niveau 5 enrichissait les accords ; les niveaux 2 à 4 restaient en 7e simples.
 */
function upgradeQualityForDifficulty(quality, difficulty) {
  const clean = MOVEMENT_QUALITY_ALIASES[quality] || quality;
  const path = QUALITY_UPGRADE_PATHS[clean];
  if (!path) return clean;
  const index = Math.min(Math.max(Number(difficulty) || 1, 1), path.length) - 1;
  return path[index];
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

const MOVEMENT_TECHNIQUES = TECHNIQUES.filter((t) => t !== 'fourway_close');

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

// [Claude] — 2026-09-24 — Accords tapés d'une progression personnalisée
// (« Dm7 G7 Cmaj7 »). La qualité venait de parseChordSymbol().qualityId, qui est
// le nom Tonal (« major seventh ») et non la qualité de l'app (« maj7 ») : aucun
// voicing VoicingLab, et la progression était remplacée en silence par une
// autre. On garde la qualité tapée quand l'app la connaît, sinon on convertit le
// nom Tonal (CM7, C-7, Cø7, C°7, CmM7…).
const TYPED_QUALITY_ALIASES = { 69: '6/9', m69: 'm6/9', 'Δ': 'maj7', 'Δ7': 'maj7', 'Δ9': 'maj9', 'm(maj7)': 'mMaj7', 'mΔ7': 'mMaj7', alt: '7alt' };

let typedQualityTables = null;

/** Qualités de l'app, et qualité de l'app pour chaque nom Tonal (la plus simple d'abord). */
function appQualityTables() {
  if (!typedQualityTables) {
    const known = new Set(['', 'm', ...ALL_PRACTICE_SYMBOLS, ...TARGET_QUALITY_GROUPS.flatMap((g) => g.qualities)]);
    const byTonalName = new Map();
    for (const quality of known) {
      const tonalName = parseChordSymbol(`C${quality}`)?.qualityId;
      if (tonalName && !byTonalName.has(tonalName)) byTonalName.set(tonalName, quality);
    }
    typedQualityTables = { known, byTonalName };
  }
  return typedQualityTables;
}

/**
 * Accord tapé → { name, rootPc, symbol }, `symbol` étant la qualité de l'app
 * (celle de VoicingLab) ; null si l'accord est inconnu ou a une basse séparée
 * (Dm7/G : VoicingLab n'en publie pas).
 * @param {string} name - ex. « Bbmaj7 », « F#m7b5 », « C-7 »
 */
function parseTypedChord(name) {
  const { known, byTonalName } = appQualityTables();
  const split = splitChordSymbol(name);
  const typed = split ? (TYPED_QUALITY_ALIASES[split.quality] ?? split.quality) : null;
  if (split && known.has(typed)) return { name, rootPc: split.rootPc, symbol: typed };
  const parsed = parseChordSymbol(name);
  if (!parsed?.ok || (parsed.bassPc != null && parsed.bassPc !== parsed.rootPc)) return { name, rootPc: null, symbol: null };
  const quality = known.has(parsed.qualityId) ? parsed.qualityId : byTonalName.get(parsed.qualityId);
  return { name, rootPc: parsed.rootPc, symbol: quality ?? null };
}

/**
 * Voicings réels VoicingLab d'une technique pour un accord, dans l'ordre publié
 * par le site. Aucun voicing n'est calculé ici : liste vide = technique indisponible.
 */
function voicingLabVariantsFor(rootPc, quality, technique) {
  // Registre d'abord : la main gauche ajoutée aux clusters se cale ensuite sous
  // la main droite, là où elle a été placée.
  const placed = familiesForTechnique(technique).flatMap((familyId) =>
    getVoicingLabVoicings(rootPc, quality, familyId).map((v) => withClusterLeftHand(withPlayableRegister({ ...v, familyId }), rootPc, quality))
  );
  const variants = isTextbookScope(quality)
    ? conformOrRebuild(placed, rootPc, quality, technique)
    : placed.filter((v) => isFaithfulVariant(v, rootPc, quality, technique));
  const playable = variants.filter(isHandPlayable);
  return technique === 'close' ? withCloseInversions(playable, rootPc, quality) : playable;
}

// [Claude] — 2026-09-24 — Contrôle « manuels » (Narcisse : « j'ai un doute sur la
// fiabilité des voicings […] regarder aussi sur d'autres sites », limité pour
// l'instant aux enrichissements 11e / 13e et à tous les accords altérés). Une
// variante VoicingLab qui respecte la définition de sa famille et les règles de
// voicing est gardée telle quelle ; les autres sont remplacées par les voicings
// du manuel construits sur les mêmes notes (upper structure : triades standard).
// Détails et sources : src/voicing-engine/textbook-voicings.js.

/**
 * Accord de 11e ou de 13e, ou accord altéré (#11, b9, #9, b13, #5, b5, alt) ?
 * Hors périmètre : add11 / 6add11 (accords ajoutés, la 11 y sonne avec la tierce
 * par définition), demi-diminué et diminués.
 */
export function isTextbookScope(quality) {
  const q = String(quality || '');
  if (q === 'm7b5' || q.startsWith('dim') || q.includes('add')) return false;
  return /11|13|[#b](?:5|9)|alt|^aug/.test(q);
}

/** Tierces (ou quarte des accords sus / 11) et septièmes (ou sixte) de la qualité. */
function guideTones(quality) {
  const q = String(quality || '');
  const core = chordCoreIntervals(q);
  let thirds;
  if (q.includes('sus4') || q === '11' || q === 'maj11') thirds = [5];
  else if (q.includes('sus2')) thirds = [2];
  else thirds = core.filter((i) => i === 3 || i === 4);
  return {
    thirds,
    sevenths: core.filter((i) => i >= 9),
    alteredFifth: /#5|b13|b5|alt|^aug/.test(q),
  };
}

// [Claude] — 2026-09-24 — 7alt (Narcisse : voicings « absurdes » de la démo en
// Sib, F7alt joué F A B Eb). « alt » = gamme altérée : 9e altérée (b9 ou #9) ET
// quinte altérée (b5 ou #5 / b13), sans quinte juste, 9e, 11e ni 13e naturelles
// (Levine, The Jazz Theory Book). VoicingLab publie ses 7alt à 4 sons en 7b5
// (1 3 b5 b7, sans 9e altérée) et son Open avec la quinte juste (F C Eb A B).
const ALT_NINTHS = [1, 3];
const ALT_FIFTHS = [6, 8];
const ALT_FORBIDDEN = [2, 5, 7, 9];
const isAltQuality = (quality) => /alt/.test(String(quality || ''));

function isTrueAlt(notes, rootPc) {
  const rels = new Set(notes.map((n) => pcRelativeTo(n, rootPc)));
  return ALT_NINTHS.some((i) => rels.has(i)) && ALT_FIFTHS.some((i) => rels.has(i))
    && !ALT_FORBIDDEN.some((i) => rels.has(i));
}

/**
 * Notes d'un 7alt à reconstruire depuis une variante qui n'en est pas un : on
 * retire les notes étrangères à la gamme altérée, on ajoute la #9 et / ou la b13
 * manquantes, et les familles à 4 voix (Drop, 4-way close, Block) laissent la
 * fondamentale à la basse / main gauche (3 b7 #9 b13 et leurs cousins).
 */
function altRels(rels, technique) {
  const out = new Set([...rels].filter((i) => !ALT_FORBIDDEN.includes(i)));
  if (!ALT_NINTHS.some((i) => out.has(i))) out.add(3);
  if (!ALT_FIFTHS.some((i) => out.has(i))) out.add(8);
  if (technique === 'rootless') out.delete(0);
  if (['drop2', 'drop3', 'drop2_4', 'fourway_close', 'block'].includes(technique)) {
    for (const extra of [0, 6, 1]) {
      if (out.size <= 4) break;
      if (extra === 6 && !out.has(8)) continue;
      if (extra === 1 && !out.has(3)) continue;
      out.delete(extra);
    }
  }
  return out;
}

/** Vrai si la variante respecte la définition de sa famille et les règles de voicing. */
function meetsTextbook(technique, v, rootPc, quality) {
  const notes = [...v.lh, ...v.rh];
  if (!respectsFamilyDefinition(technique, v, rootPc, guideTones(quality))) return false;
  if (isAltQuality(quality) && !isTrueAlt(notes, rootPc)) return false;
  if (!respectsLowIntervalLimits(notes, { skipBass: technique === 'stride' })) return false;
  if (minorNinthClashes(notes, rootPc, { flatNineChord: /b9|alt/.test(quality) }).length > 0) return false;
  if (hasEleventhAgainstMajorThird(notes, rootPc)) return false;
  return technique !== 'upper_structure' || fitsChordScale(notes, rootPc, dominantScalesFor(quality));
}

/** Nom d'intervalle (notation VoicingLab : 1P, 3M, 13m…) d'une classe de hauteur. */
function intervalLabel(i, quality) {
  const q = String(quality || '');
  const names = {
    0: '1P', 1: '9m', 2: '9M', 3: /#9|alt/.test(q) ? '9A' : '3m', 4: '3M',
    5: /sus4/.test(q) ? '4P' : '11P', 6: /b5|alt/.test(q) ? '5d' : '11A', 7: '5P',
    8: /#5|^aug/.test(q) ? '5A' : '13m', 9: /^m?6/.test(q) ? '6M' : '13M', 10: '7m', 11: '7M',
  };
  return names[i];
}

/**
 * Garde les variantes fidèles et conformes au manuel, remplace les autres par
 * leurs reconstructions sur les mêmes notes (sans doublon), dans l'ordre publié
 * par VoicingLab. Une variante infidèle par sa seule basse (Drop 2-4 de Bmaj13
 * avec la 13e à la basse) redonne ainsi un voicing juste ; une variante à qui il
 * manque une couleur du nom n'en redonne aucun.
 */
function conformOrRebuild(placed, rootPc, quality, technique) {
  const guide = guideTones(quality);
  const out = [];
  const seen = new Set();
  // Un même voicing à une autre octave n'est pas une variante de plus (les
  // reconstructions de deux variantes VoicingLab peuvent coïncider à l'octave).
  const push = (v) => {
    const all = [...v.lh, ...v.rh];
    const low = Math.min(...all);
    const key = `${low % 12}:${v.lh.map((n) => n - low).join(',')}|${v.rh.map((n) => n - low).join(',')}`;
    if (!seen.has(key)) {
      seen.add(key);
      out.push(v);
    }
  };
  for (const v of placed) {
    if (isFaithfulVariant(v, rootPc, quality, technique) && meetsTextbook(technique, v, rootPc, quality)) {
      push(v);
      continue;
    }
    const notes = [...v.lh, ...v.rh];
    const own = new Set(notes.map((n) => pcRelativeTo(n, rootPc)));
    const rels = isAltQuality(quality) ? altRels(own, technique) : own;
    const midpoint = (Math.min(...notes) + Math.max(...notes)) / 2;
    const shapes = technique === 'upper_structure'
      ? upperStructureCandidates(rootPc, guide)
      : rebuildFromNotes(technique, rels, rootPc, guide, midpoint);
    for (const shape of shapes) {
      const all = [...shape.lh, ...shape.rh];
      let familyId = v.familyId;
      if (technique === 'rootless') familyId = guide.sevenths.includes(pcRelativeTo(all[0], rootPc)) ? 'rootlessB' : 'rootlessA';
      const placedShape = withPlayableRegister({ lh: shape.lh, rh: shape.rh, familyId });
      const rebuilt = {
        ...v,
        lh: placedShape.lh,
        rh: placedShape.rh,
        familyId,
        names: [...placedShape.lh, ...placedShape.rh].map((n) => formatNoteNameWithOctave(n)).join(' '),
        intervals: [...placedShape.lh, ...placedShape.rh].map((n) => intervalLabel(pcRelativeTo(n, rootPc), quality)).join(' '),
        octaveShift: undefined,
        addedLH: undefined,
        rebuilt: true,
        rebuiltFrom: v.names,
      };
      if (isFaithfulVariant(rebuilt, rootPc, quality, technique) && meetsTextbook(technique, rebuilt, rootPc, quality)) push(rebuilt);
    }
  }
  return out;
}

// [Claude] — 2026-09-24 — Registre des voicings (Narcisse : « registre trop aigu
// de certains Drop 3 », puis « étends la règle aux autres familles »). VoicingLab
// publie chaque ton en transposant Do vers le haut (jusqu'à +11 demi-tons) : en
// Si, un Drop 2 avait sa main gauche à D#5 et un Shell sa basse à B3 ; les Drop 3
// d'accords enrichis sont même aigus en Do (C9 : main gauche C5 D5, main droite
// E6 A#6). Le voicing entier descend d'une octave tant que son milieu (entre la
// note la plus grave et la plus aiguë) dépasse le plafond de sa famille :
// classes de hauteur, écarts et mains inchangés, seul le registre bouge.
const REGISTER_CEILINGS = {
  // Main gauche seule avec la basse (VoicingLab : hand = left) : milieu ≤ Do4,
  // basse autour de Do2–Do3 (Shell de Gmaj7 : G2 B2 F#3, pas G3 B3 F#4). Les
  // Stride publiés en Do avec la quinte à la basse descendent aussi
  // (Cmaj7 : G3 E4 G4 B4 → G2 E3 G3 B3).
  shell: 60,
  twoNoteShell: 60,
  stride: 60,
  // Rootless, main gauche sans fondamentale : milieu ≤ Mi4, autour du Do central
  // (Gmaj7 reste B3 D4 F#4 A4 ; à Do4 il tomberait à B2, trop grave).
  rootlessA: 64,
  rootlessB: 64,
  // 4-way close : mélodie en main droite, que VoicingLab monte jusqu'à G#5 en Do
  // (renversements B4 C5 E5 G5) : milieu ≤ Mi5 pour ne pas descendre ce registre.
  fourWayClose: 76,
};
// Deux mains ou main droite (Drop 2/3/2-4, Close, Block, Spread, Open, Quartal,
// So What, Upper structure, Cluster avant ajout de sa main gauche) : milieu
// ≤ Do5. Parmi les voicings publiés en Do, seuls bougent des renversements trop
// aigus d'accords enrichis (Drop 3 de C9 : C5 D5 | E6 A#6 → C4 D4 | E5 A#5).
const DEFAULT_REGISTER_CEILING = 72;

// [Claude] — 2026-09-24 — Plancher : la descente s'arrête avant qu'un intervalle
// passe sous sa limite grave (Levine), et un voicing publié trop grave remonte
// (Rootless de C7alt publié A#2 C#3 E3 F#3 : tierce mineure sous Do3). Sans ce
// plancher, la règle du plafond donnait des voicings boueux (Stride de Cmaj11
// C3 D3 F3 B3, Shell de Gmaj11 G2 C3 F#3). Stride : la basse, jouée seule, ne
// compte pas.
// [Claude] — 2026-09-24 — Registre de pianiste (Narcisse : « les voicings
// proposés sont absurdes », démo de la Montée diatonique en Sib). Le milieu seul
// laissait passer des voicings joués ainsi par personne : Spread de Bbmaj7#11 à
// Bb3 | D5 E5 A5 (basse au-dessus de Sol3, dessus à La5), dessus jusqu'à Mib6 en
// Spread, Si6 en Drop 3, rootless de main gauche montant jusqu'à Do5, close de
// main droite commencé à Mi3. En plus du plafond du milieu :
//   - le dessus ne dépasse pas Sol5 (Do6 pour les familles qui portent une
//     mélodie : 4-way close, block) ;
//   - la basse d'un Spread ou d'un Open (fondamentale seule à la main gauche,
//     le reste au-dessus) descend sous Mi3, tant que la main droite reste au
//     milieu du clavier (dessus ≥ Mi4) ;
//   - un close à une main (main droite) ne commence pas sous Fa3 : il monte
//     d'une octave si son dessus reste sous Sol5.
// Toujours à l'octave près et jamais sous les limites graves de Levine.
const TOP_CEILING = 79; // Sol5
const MELODY_TOP_CEILING = 84; // Do6
const MELODY_FAMILIES = new Set(['fourWayClose', 'block']);
const BASS_CEILING = 52; // Mi3
const BASS_FAMILY_TOP_FLOOR = 64; // Mi4
const BASS_FAMILIES = new Set(['spread', 'open']);
const RIGHT_HAND_FLOOR = 53; // Fa3
const RIGHT_HAND_FAMILIES = new Set(['close', 'fourWayClose']);

function withPlayableRegister(v) {
  const all = [...v.lh, ...v.rh];
  if (all.length === 0) return v;
  const ceiling = REGISTER_CEILINGS[v.familyId] ?? DEFAULT_REGISTER_CEILING;
  const low = Math.min(...all);
  const top = Math.max(...all);
  const midpoint = (low + top) / 2;
  const topCeiling = MELODY_FAMILIES.has(v.familyId) ? MELODY_TOP_CEILING : TOP_CEILING;
  const clear = (shift) => respectsLowIntervalLimits(all.map((n) => n + shift), { skipBass: v.familyId === 'stride' });
  let shift = 0;
  while (midpoint + shift > ceiling && clear(shift - 12)) shift -= 12;
  while (top + shift > topCeiling && clear(shift - 12)) shift -= 12;
  if (BASS_FAMILIES.has(v.familyId)) {
    while (low + shift > BASS_CEILING && top + shift - 12 >= BASS_FAMILY_TOP_FLOOR && clear(shift - 12)) shift -= 12;
  }
  if (RIGHT_HAND_FAMILIES.has(v.familyId) && v.lh.length === 0) {
    while (low + shift < RIGHT_HAND_FLOOR && top + shift + 12 <= topCeiling) shift += 12;
  }
  while (!clear(shift) && shift < 36) shift += 12;
  if (shift === 0) return v;
  return { ...v, lh: v.lh.map((n) => n + shift), rh: v.rh.map((n) => n + shift), octaveShift: shift };
}

// [Claude] — 2026-09-24 — Mains jouables : une main ne tient pas plus d'une 10e
// (Shell d'add11 C3 E3 F4 : une 11e), et une main gauche seule reste sous La4
// (rootless A de Bbmaj7#11 à D4 E4 A4 C5 : sa seconde grave interdit l'octave du
// dessous). Stride : la basse est jouée seule, avant l'accord.
const HAND_SPAN = 16;
const LEFT_HAND_FAMILIES = new Set(['shell', 'twoNoteShell', 'rootlessA', 'rootlessB']);
const LEFT_HAND_TOP = 69; // La4

function isHandPlayable(v) {
  const span = (hand) => (hand.length ? Math.max(...hand) - Math.min(...hand) : 0);
  if (v.familyId !== 'stride' && span(v.lh) > HAND_SPAN) return false;
  if (span(v.rh) > HAND_SPAN) return false;
  return !(LEFT_HAND_FAMILIES.has(v.familyId) && v.rh.length === 0 && Math.max(...v.lh) > LEFT_HAND_TOP);
}

// [Claude] — 2026-09-24 — Renversements de la Close position (Narcisse : la démo
// « sonne pas réaliste »). VoicingLab ne publie la close position qu'en position
// fondamentale : dans une grille, la main droite ne pouvait que sauter d'une
// quarte ou d'une quinte en bloc (Dm11 D4 F4 G4 C5 → G13 G4 B4 E5 F5). Une close
// renversée reste une close (toutes les notes dans l'octave) : ses renversements
// s'ajoutent, basse sur la fondamentale, la tierce ou la quinte (règle de basse
// des variantes), placés dans le même registre que les autres voicings.
const closeKey = (notes) => [...notes].sort((a, b) => a - b).map((n) => pcRelativeTo(n, 0)).join(',');

function withCloseInversions(variants, rootPc, quality) {
  const out = [...variants];
  const seen = new Set(variants.map((v) => closeKey([...v.lh, ...v.rh])));
  for (const v of variants) {
    const notes = [...v.rh].sort((a, b) => a - b);
    if (v.lh.length > 0 || notes.length < 3 || notes[notes.length - 1] - notes[0] >= 12) continue;
    for (let k = 1; k < notes.length; k += 1) {
      const rotated = [...notes.slice(k), ...notes.slice(0, k).map((n) => n + 12)];
      const placed = withPlayableRegister({ lh: [], rh: rotated, familyId: v.familyId });
      const inversion = {
        ...v,
        lh: [],
        rh: placed.rh,
        names: placed.rh.map((n) => formatNoteNameWithOctave(n)).join(' '),
        intervals: placed.rh.map((n) => intervalLabel(pcRelativeTo(n, rootPc), quality)).join(' '),
        octaveShift: undefined,
        inversion: k,
      };
      const key = closeKey(inversion.rh);
      if (seen.has(key) || !isHandPlayable(inversion) || !isFaithfulVariant(inversion, rootPc, quality, 'close')) continue;
      if (isTextbookScope(quality) && !meetsTextbook('close', inversion, rootPc, quality)) continue;
      seen.add(key);
      out.push(inversion);
    }
  }
  return out;
}

// [Claude] — 2026-09-24 — Variantes fidèles au nom de l'accord (Narcisse :
// « barrer » les techniques qui trahissent l'accord). Une variante VoicingLab
// est écartée s'il lui manque une couleur du nom (Shell de G7alt = G7, Shell de
// Dm11 = Dm7, cluster « 13 » sans 13e) ou une note qui définit l'accord
// (tierce, septième / sixte, quinte altérée), ou si sa basse n'est ni la
// fondamentale, ni la tierce, ni la quinte (Drop 3 de Fmaj13 avec la 7e majeure
// à la basse, lu « Dmadd9 »). Les techniques sans fondamentale par nature
// échappent à la règle de basse. Une technique sans variante fidèle est barrée.
const BASS_RULE_EXEMPT = new Set(['rootless', 'two_note_shell', 'upper_structure', 'quartal', 'so_what', 'block']);

const colorGroupsCache = new Map();

/** Morceaux d'une qualité : « maj13#11 » → maj, 13, #11. */
function qualityTokens(quality) {
  const q = String(quality || '').replace(/^(m?)69/, '$16/9');
  return q.match(/sus[24]|add(?:9|11)|[#b](?:5|9|11|13)|\/9|alt|maj|Maj|dim|aug|m|\d+/g) || [];
}

/**
 * Couleurs exigées par le nom de la qualité (demi-tons depuis la fondamentale).
 * Chaque groupe doit être représenté par au moins une de ses notes.
 * @returns {number[][]}
 */
export function requiredColorGroups(quality) {
  const key = String(quality || '');
  if (colorGroupsCache.has(key)) return colorGroupsCache.get(key);
  const tokens = qualityTokens(key);
  const groups = [];
  let sizeSeen = false;
  for (const t of tokens) {
    if (t === 'sus2') groups.push([2]);
    else if (t === 'sus4') groups.push([5]);
    else if (t === 'add9' || t === '/9') groups.push([2]);
    else if (t === 'add11') groups.push([5]);
    else if (t === 'b9') groups.push([1]);
    else if (t === '#9') groups.push([3]);
    else if (t === '#11' || t === 'b5') groups.push([6]);
    else if (t === 'b13' || t === '#5') groups.push([8]);
    else if (t === 'alt') groups.push([1, 3, 6, 8]);
    else if (/^\d+$/.test(t) && !sizeSeen) {
      // Chiffre principal : 6 → sixte, 9 → neuvième, 11 → onzième, 13 → treizième.
      sizeSeen = true;
      const color = { 6: 9, 9: 2, 11: 5, 13: 9 }[Number(t)];
      if (color != null) groups.push([color]);
    }
  }
  colorGroupsCache.set(key, groups);
  return groups;
}

/** Notes admises à la basse : fondamentale, tierce, quinte (toutes pour dim7 / aug, symétriques). */
function allowedBassIntervals(quality) {
  const core = chordCoreIntervals(quality);
  if (/^(dim7|aug)/.test(quality || '')) return new Set(core);
  return new Set(core.filter((i) => [0, 3, 4, 6, 7, 8].includes(i)));
}

/**
 * Vrai si les notes (demi-tons depuis la fondamentale) contiennent ce qui définit
 * l'accord : son noyau et chaque couleur de son nom. Fondamentale et quinte juste
 * peuvent manquer (rootless, quinte omise). La tierce majeure est facultative
 * sous une 11e juste (maj11 : elle frotterait, on l'omet comme pour l'accord
 * « 11 »). `withCore: false` n'exige que les couleurs.
 */
function hasDefiningNotes(rel, quality, { withCore = true } = {}) {
  const colors = requiredColorGroups(quality);
  const optional = new Set([0, 7]);
  if (colors.some((g) => g.length === 1 && g[0] === 5)) optional.add(4);
  if (withCore && !chordCoreIntervals(quality).every((i) => optional.has(i) || rel.has(i))) return false;
  return colors.every((g) => g.some((i) => rel.has(i)));
}

/** Vrai si la variante porte l'accord annoncé (voir plus haut). */
export function isFaithfulVariant(v, rootPc, quality, technique) {
  const notes = [...v.lh, ...v.rh];
  if (notes.length === 0) return false;
  const rel = new Set(notes.map((n) => (((n - rootPc) % 12) + 12) % 12));
  // Le two-note shell (fondamentale + tierce ou septième) est une
  // simplification voulue : pas d'exigence de noyau.
  if (!hasDefiningNotes(rel, quality, { withCore: technique !== 'two_note_shell' })) return false;
  if (!BASS_RULE_EXEMPT.has(technique)) {
    const bass = (((Math.min(...notes) - rootPc) % 12) + 12) % 12;
    if (!allowedBassIntervals(quality).has(bass)) return false;
  }
  return true;
}

// [Claude] — 2026-09-24 — Validation contre l'accord ANNONCÉ (Narcisse : « la
// validation se base sur la lecture du voicing affiché »). check() comparait le
// jeu à ce que detectChord lisait dans le voicing affiché. Or 61 % des voicings
// affichés sont lus comme un autre accord (Shell de C6 = Do Mi La lu « Am »,
// rootless de Cmaj7 lu « Em7 ») : un vrai C6 était refusé et un La mineur
// accepté comme « C6 ». Une réponse est désormais juste si elle rejoue le
// voicing affiché, si le détecteur nomme exactement l'accord annoncé, ou si
// elle réalise l'accord annoncé (realizesChord).

const pcRelativeTo = (n, rootPc) => (((n - rootPc) % 12) + 12) % 12;

/**
 * Notes qui appartiennent à l'accord annoncé (demi-tons depuis la fondamentale) :
 * définition du parseur, noyau, couleurs du nom, et la 9e sous-entendue par un
 * accord de 11e ou de 13e (Cmaj11 = C E G B D F).
 */
export function chordToneIntervals(quality) {
  const tones = new Set([
    ...(chordSymbolToPitchClasses(`C${quality}`) || []),
    ...chordCoreIntervals(quality),
    ...requiredColorGroups(quality).flat(),
  ]);
  const size = qualityTokens(quality).find((t) => /^\d+$/.test(t));
  if (size === '11' || size === '13') tones.add(2);
  return tones;
}

/**
 * Vrai si les notes jouées réalisent l'accord annoncé, quel que soit le voicing :
 * - aucune note étrangère à l'accord ni au voicing affiché (ses tensions font
 *   partie de la consigne : un « C7 » affiché avec une 9e accepte la 9e) ;
 * - toutes les notes qui le définissent (hasDefiningNotes) ;
 * - au moins 3 notes différentes avec la fondamentale, 4 sans (rootless A/B :
 *   Mi Sol Si seul reste un Mi mineur, pas un Cmaj7) ;
 * - fondamentale jouée : basse = fondamentale, tierce ou quinte (Do Mi La avec
 *   La à la basse = Am, pas C6).
 * @param {number[]} notes - MIDI joués
 * @param {number} rootPc
 * @param {string} quality - ex. 'm7'
 * @param {number[]} [shownNotes] - MIDI du voicing affiché
 */
export function realizesChord(notes, rootPc, quality, shownNotes = []) {
  if (!notes?.length) return false;
  const played = new Set(notes.map((n) => pcRelativeTo(n, rootPc)));
  const hasRoot = played.has(0);
  if (played.size < (hasRoot ? 3 : 4)) return false;
  const allowed = chordToneIntervals(quality);
  shownNotes.forEach((n) => allowed.add(pcRelativeTo(n, rootPc)));
  if (![...played].every((i) => allowed.has(i))) return false;
  if (!hasDefiningNotes(played, quality)) return false;
  return !hasRoot || allowedBassIntervals(quality).has(pcRelativeTo(Math.min(...notes), rootPc));
}

/** Vrai si le jeu reprend le voicing affiché : mêmes classes de hauteur, même basse, à n'importe quelle octave. */
function replaysShownVoicing(notes, shownNotes) {
  if (!notes?.length || !shownNotes?.length) return false;
  const pcs = (list) => new Set(list.map((n) => pcRelativeTo(n, 0)));
  const played = pcs(notes);
  const shown = pcs(shownNotes);
  return played.size === shown.size && [...played].every((pc) => shown.has(pc))
    && pcRelativeTo(Math.min(...notes), 0) === pcRelativeTo(Math.min(...shownNotes), 0);
}

/**
 * Verdict d'une réponse pour l'accord attendu ({rootPc, symbol, notes}) : juste
 * si elle rejoue le voicing affiché, si detectChord nomme exactement l'accord
 * annoncé, ou si elle le réalise (realizesChord). Jamais d'après la lecture du
 * voicing affiché par le détecteur.
 * @returns {{success: boolean, detected: object|null}}
 */
export function judgeAnswer(notes, target) {
  const detected = notes?.length ? detectChord(notes) : null;
  if (!target) return { success: false, detected };
  const shown = target.notes || [];
  const success = replaysShownVoicing(notes, shown)
    || Boolean(detected && detected.rootPc === target.rootPc && detected.symbol === target.symbol)
    || realizesChord(notes, target.rootPc, target.symbol, shown);
  return { success, detected };
}

// Intervalles de la « septième » de l'accord, par ordre de préférence.
const SHELL_SEVENTH_SEMITONES = { '7m': 10, '7M': 11, '7d': 9, '6M': 9 };

/**
 * Les clusters VoicingLab sont des couleurs de main droite seule (ex. G4 A4 Bb4
 * pour Eb7#11 : 3, #11, 5), sans fondamentale ni septième : joués seuls, ils
 * ne définissent pas l'accord. On ajoute la main gauche qui les porte :
 * fondamentale + septième (C2–B2), marquée `addedLH` pour l'affichage.
 * Les notes VoicingLab de la main droite ne sont pas touchées.
 */
function withClusterLeftHand(v, rootPc, quality) {
  if (v.familyId !== 'cluster' || v.lh.length > 0 || v.rh.length === 0) return v;
  const intervals = parseChordSymbol(`${formatPc(rootPc, false)}${quality}`)?.intervals || [];
  const seventh = Object.keys(SHELL_SEVENTH_SEMITONES).find((i) => intervals.includes(i));
  // [Claude] — 2026-09-24 — Fondamentale entre Fa2 et Mi3 : la septième posée
  // sur Do2 passait sous la limite grave de Levine (7e mineure : Fa2).
  let root = 41 + ((rootPc - 5 + 12) % 12); // F2–E3
  let lh = seventh ? [root, root + SHELL_SEVENTH_SEMITONES[seventh]] : [root];
  // La main gauche reste sous la main droite ; faute de place, la fondamentale
  // seule, une octave plus bas si besoin.
  if (Math.max(...lh) >= Math.min(...v.rh)) lh = [root];
  if (root >= Math.min(...v.rh)) {
    root -= 12;
    lh = [root];
  }
  return { ...v, lh, addedLH: [...lh] };
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
  const allowed = mode === 'chord' ? TECHNIQUES : MOVEMENT_TECHNIQUES;
  const out = TECHNIQUES.filter((t) => !allowed.includes(t));
  const available = new Set(getAvailableTechniques(chordSymbol).filter((c) => c.playable).map((c) => c.id));
  for (const technique of allowed) {
    if (technique !== 'auto' && !available.has(technique)) out.push(technique);
  }
  return out;
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

/** Voicings servis par l'Exercice pour une technique (registre et main gauche des clusters appliqués). */
export { voicingLabVariantsFor as exerciseVoicingsFor };

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

// Filtres de la recherche par note du dessus : ils trient, ils ne choisissent
// pas. 'all' = pas de filtre. Les mêmes filtres servent à la carte et au
// navigateur, pour que l'index d'un voicing soit le même des deux côtés.
export const TOP_NOTE_FILTERS = {
  hands: ['all', 'one', 'two'],
  technique: ['all', ...TECHNIQUES.filter((t) => t !== 'auto' && !TOP_NOTE_EXCLUDED_TECHNIQUES.has(t))],
  // Navigateur seulement (la carte a déjà son accord) : fondamentale de l'accord.
  chordRoot: ['all', ...Array.from({ length: 12 }, (_, i) => String(i))],
  // Tonalité majeure : voicings dont toutes les notes sont dans sa gamme.
  key: ['all', ...Array.from({ length: 12 }, (_, i) => String(i))],
};

const MAJOR_SCALE = [0, 2, 4, 5, 7, 9, 11];

/**
 * Notes qui définissent la qualité (demi-tons depuis la fondamentale) :
 * fondamentale, tierce (sauf sus, 11, power chord), quinte (juste ou altérée),
 * septième ou sixte. Les couleurs (9, 11, 13, altérations) n'en font pas partie.
 * La quinte juste compte même si le voicing l'omet : Bm11 n'est pas en Do.
 */
export function chordCoreIntervals(quality) {
  const q = quality || '';
  const out = [0];
  const minor = /^m(?!aj)/.test(q) || q.startsWith('dim');
  if (!q.includes('sus') && q !== '5' && q !== '11') out.push(minor ? 3 : 4);
  if (q.startsWith('dim') || q.includes('b5')) out.push(6);
  else if (q.startsWith('aug') || q.includes('#5')) out.push(8);
  else if (!q.includes('alt')) out.push(7);
  if (/maj/i.test(q.replace(/^m(?=Maj)/, ''))) {
    if (/7|9|11|13/.test(q)) out.push(11);
  } else if (q === 'dim7') out.push(9);
  else if (/^m?6/.test(q)) out.push(9);
  else if (/7|9|11|13/.test(q) && !q.includes('add')) out.push(10);
  return out;
}

/** Vrai si le voicing passe les filtres (mains, tonalité). */
function passesTopNoteFilters(v, rootPc, quality, { hands = 'all', key = 'all' } = {}) {
  const all = [...v.lh, ...v.rh];
  if (key !== 'all') {
    // Voicing par voicing : un cluster ♯11/♭13 de G13 sort de Do majeur, pas G13 entier.
    // L'accord lui-même (fondamentale, tierce, septième) doit aussi être dans la
    // gamme : un Ebmaj7#11 sans fondamentale dont les notes jouées tombent en Do reste exclu.
    const scale = new Set(MAJOR_SCALE.map((d) => (Number(key) + d) % 12));
    const core = chordCoreIntervals(quality).map((i) => (rootPc + i) % 12);
    if (!core.every((pc) => scale.has(pc))) return false;
    if (!all.every((n) => scale.has(((n % 12) + 12) % 12))) return false;
  }
  if (hands !== 'all' && (v.lh.length > 0 && v.rh.length > 0 ? 'two' : 'one') !== hands) return false;
  return true;
}


/**
 * Voicings (VoicingLab réels et dérivés) d'un accord dont la note la plus haute
 * est `topPc`, quelle que soit son octave : aucune note du voicing ne dépasse
 * la note cible. Triés du plus simple au plus complexe ; un doublon exact
 * (mêmes notes ET même répartition des mains) n'est gardé qu'une fois.
 *
 * @param {number} rootPc
 * @param {string} quality
 * @param {number} topPc - pitch class de la note du dessus (0–11)
 * @param {{ level?: keyof TOP_NOTE_LEVELS, technique?: string, hands?: string, key?: string }} [options]
 *   technique : 'auto' ou 'all' = toutes les techniques, sinon uniquement celle-ci ;
 *   hands / key : voir TOP_NOTE_FILTERS
 */
export function findVoicingsByTopNote(rootPc, quality, topPc, { level = 'all', technique = 'auto', ...filters } = {}) {
  const range = TOP_NOTE_LEVELS[level] || TOP_NOTE_LEVELS.all;
  const anyTechnique = technique === 'auto' || technique === 'all';
  const techniques = (anyTechnique ? TECHNIQUES.filter((t) => t !== 'auto') : [technique])
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
      if (!passesTopNoteFilters(v, rootPc, quality, filters)) continue;
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
export function findChordsByTopNote(topPc, { chordRoot = 'all', ...options } = {}) {
  const out = [];
  for (const group of TARGET_QUALITY_GROUPS) {
    for (const quality of group.qualities) {
      for (let rootPc = 0; rootPc < 12; rootPc += 1) {
        if (chordRoot !== 'all' && rootPc !== Number(chordRoot)) continue;
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

/**
 * Libellé lisible d'une variante (note droppée, triade d'upper structure…),
 * avec le registre quand il a été abaissé (withPlayableRegister).
 */
// [Claude] — 2026-09-24 — Rien sur la provenance à l'écran (Narcisse : « nous on
// le sait mais les users n'ont pas besoin de savoir ça ») : ni source, ni voicing
// dérivé, reconstruit, déplacé d'octave ou main gauche ajoutée. Ces informations
// restent dans le voicing (derived, rebuilt, octaveShift, addedLH) pour le code.
function describeVariant(technique, v) {
  return variantShape(technique, v);
}

function variantShape(technique, v) {
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
    case 'cluster':
      return v.addedLH ? `Cluster ${rhNames} sur ${lh}` : `Cluster ${rhNames}`;
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
  const resolved = resolveVariants(rootPc, quality, technique, difficulty);
  if (!resolved) return { voicing: null, technique };
  const { technique: t, variants } = resolved;
  const index = ((variant % variants.length) + variants.length) % variants.length;
  return { voicing: voicingFromVariant(t, variants[index], index, variants.length), technique: t };
}

/**
 * Technique réellement jouée et ses variantes : la technique demandée, sinon
 * (Auto ou indisponible) la première disponible dans l'ordre pédagogique.
 * @returns {{technique: string, variants: object[]}|null}
 */
function resolveVariants(rootPc, quality, technique, difficulty = null) {
  const autoOrder = difficulty === 1 ? AUTO_ORDER_BEGINNER : AUTO_ORDER;
  const first = technique === 'auto' ? autoOrder : [technique];
  const order = [...first, ...TECHNIQUES.filter((t) => t !== 'auto' && !first.includes(t))];
  for (const t of order) {
    const variants = voicingLabVariantsFor(rootPc, quality, t);
    if (variants.length > 0) return { technique: t, variants };
  }
  return null;
}

/** Voicing de l'Exercice pour la variante `index` (sur `count`) de la technique `t`. */
function voicingFromVariant(t, v, index, count) {
  return {
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
    variantCount: count,
    variantLabel: describeVariant(t, v),
    derived: v.derived,
    derivedFrom: v.derivedFrom,
    addedLH: v.addedLH,
    octaveShift: v.octaveShift,
    rebuilt: Boolean(v.rebuilt),
    rebuiltFrom: v.rebuiltFrom,
  };
}

// [Claude] — 2026-09-24 — Voicings enchaînés (Narcisse : la démo et l'exercice
// partagent les mêmes voicings ; « des voicings adaptés en fonction des
// mouvements »). Dans une grille, chaque accord prend, parmi les variantes de sa
// technique (à l'octave près), celle qui bouge le moins depuis l'accord
// précédent, la voix du dessus comptant double. Le premier accord prend la
// variante choisie par les flèches ; une variante fixée sur un autre accord
// relance l'enchaînement à partir de lui.

const sortedNotes = (v) => [...v.lh, ...v.rh].sort((a, b) => a - b);

/**
 * Coût d'enchaînement de deux voicings (demi-tons) : chaque note va vers la
 * plus proche de l'autre accord (dans les deux sens, moyenne), plus le
 * mouvement de la voix du dessus.
 * @param {number[]} from
 * @param {number[]} to
 */
export function voiceLeadingCost(from, to) {
  if (!from?.length || !to?.length) return 0;
  const nearest = (n, list) => Math.min(...list.map((m) => Math.abs(m - n)));
  const spread = (to.reduce((sum, n) => sum + nearest(n, from), 0) + from.reduce((sum, n) => sum + nearest(n, to), 0)) / 2;
  return spread + Math.abs(Math.max(...to) - Math.max(...from));
}

/**
 * Registre admis pour un voicing déplacé d'octave dans un enchaînement : mêmes
 * règles que le placement (withPlayableRegister) — milieu, dessus sous Sol5 (Do6
 * pour les familles à mélodie), close de main droite au-dessus de Fa3, basse
 * d'un Spread / Open au plus Sol3, mains jouables, limites graves de Levine.
 */
function chainRegisterOk(v) {
  const all = sortedNotes(v);
  const low = all[0];
  const top = all[all.length - 1];
  if (low < 28) return false;
  const ceiling = REGISTER_CEILINGS[v.familyId] ?? DEFAULT_REGISTER_CEILING;
  const midpoint = (low + top) / 2;
  if (midpoint > ceiling || midpoint < ceiling - 19) return false;
  if (top > (MELODY_FAMILIES.has(v.familyId) ? MELODY_TOP_CEILING : TOP_CEILING)) return false;
  if (RIGHT_HAND_FAMILIES.has(v.familyId) && v.lh.length === 0 && low < RIGHT_HAND_FLOOR) return false;
  if (BASS_FAMILIES.has(v.familyId) && low > BASS_CEILING + 3) return false;
  return isHandPlayable(v) && respectsLowIntervalLimits(all, { skipBass: v.familyId === 'stride' });
}

const shiftVariant = (v, shift) => ({
  ...v,
  lh: v.lh.map((n) => n + shift),
  rh: v.rh.map((n) => n + shift),
  addedLH: v.addedLH?.map((n) => n + shift),
  octaveShift: (v.octaveShift || 0) + shift,
});

/**
 * Voicings enchaînés d'une suite d'accords.
 * @param {{rootPc: number, quality: string}[]} chords
 * @param {string} technique
 * @param {number|null} difficulty
 * @param {Record<number, number>} anchors - rang de l'accord → variante imposée
 * @returns {({technique: string, variant: object, index: number, count: number}|null)[]}
 */
export function chainVoicings(chords, technique, difficulty = null, anchors = {}) {
  let previous = null;
  return chords.map((chord, i) => {
    const resolved = resolveVariants(chord.rootPc, chord.quality, technique, difficulty);
    if (!resolved) return null;
    const { technique: t, variants } = resolved;
    const count = variants.length;
    const anchor = anchors[i] != null ? ((anchors[i] % count) + count) % count : (previous ? null : 0);
    let best = null;
    variants.forEach((v, index) => {
      if (anchor != null && index !== anchor) return;
      for (const shift of previous ? [0, -12, 12] : [0]) {
        const candidate = shift ? shiftVariant(v, shift) : v;
        if (shift && !chainRegisterOk(candidate)) continue;
        // Léger avantage au registre d'origine à coût égal.
        const cost = previous ? voiceLeadingCost(previous, sortedNotes(candidate)) + (shift ? 0.5 : 0) : 0;
        if (!best || cost < best.cost) best = { variant: candidate, index, cost };
      }
    });
    previous = sortedNotes(best.variant);
    return { technique: t, variant: best.variant, index: best.index, count };
  });
}

/**
 * Variante « note du dessus » : `variant` parcourt les suggestions de
 * findVoicingsByTopNote (toutes techniques confondues, du plus simple au plus
 * complexe). La liste résumée est jointe au voicing pour l'affichage.
 */
function buildTopNoteVoicing(rootPc, quality, technique, variant, topNote) {
  // La technique cliquée sur la carte ne filtre pas la recherche en silence
  // (bug : Block seul → 0 en Simple/Intermédiaire) ; seul le filtre Technique,
  // choisi explicitement, la restreint.
  const { pc, ...options } = topNote;
  const suggestions = findVoicingsByTopNote(rootPc, quality, pc, options);
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
    addedLH: v.addedLH,
    octaveShift: v.octaveShift,
    rebuilt: Boolean(v.rebuilt),
    rebuiltFrom: v.rebuiltFrom,
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
 * @param {string} [doubling] - doublures d'octave : 'none' | 'bass' | 'melody' | 'full'
 * @returns {object|null}
 */
function buildChordTarget(rootPc, symbol, technique, variant = 0, difficulty = null, topNote = null, doubling = 'none', leftHandStyle = 'none') {
  const { voicing, technique: usedTechnique } = buildPlayableVoicing(rootPc, symbol, technique, variant, difficulty, topNote);
  if (!voicing) return null;
  return targetFromVoicing(rootPc, symbol, voicing, usedTechnique, doubling, leftHandStyle);
}

// [Claude] — 2026-09-24 — Option « Main gauche » (Narcisse : la main gauche que
// la démo gospel ajoutait lui plaisait, mais elle disparaissait du favori ; « une
// option avec seulement la main droite, une option avec la main gauche […]
// déclinée en fonction du style »). La main gauche du style fait partie du
// voicing de la carte : affichée, jouée par « Écouter » et la démo, gardée par
// les favoris. `styleAdded` = notes ajoutées au voicing de base (en couleur).
export const LEFT_HAND_LABELS = { gospel: 'Gospel / worship', ballade: 'Ballade', swing: 'Comping swing' };

function withLeftHandStyle(rootPc, symbol, voicing, usedTechnique, leftHandStyle) {
  if (!LEFT_HAND_STYLES.includes(leftHandStyle)) return;
  const styled = styleLeftHand({
    rootPc,
    symbol,
    voicing: { leftHand: voicing.leftHand, rightHand: voicing.rightHand, technique: usedTechnique, familyId: voicing.familyId },
  }, leftHandStyle);
  if (!styled) return;
  Object.assign(voicing, {
    leftHand: styled.lh,
    rightHand: styled.rh,
    styleAdded: styled.added,
    styleMovedToRight: styled.movedToRight,
    baseHasLeftHand: (voicing.leftHand || []).length > 0,
    leftHandStyle,
  });
}

/** Cible d'un accord à partir de son voicing (doublures, puis main gauche du style, ajoutées ensuite). */
function targetFromVoicing(rootPc, symbol, voicing, usedTechnique, doubling = 'none', leftHandStyle = 'none') {
  const rootName = formatPc(rootPc, false);
  const chordSymbol = symbol ? `${rootName}${symbol}` : rootName;
  // Doublures ajoutées après le choix VoicingLab : classes de hauteur et basse
  // inchangées, donc l'accord détecté reste le même.
  if (doubling !== 'none') {
    const { leftHand, rightHand, doubled } = applyDoublings(voicing, rootPc, doubling);
    Object.assign(voicing, { leftHand, rightHand, doubled });
  }
  withLeftHandStyle(rootPc, symbol, voicing, usedTechnique, leftHandStyle);
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

/** Vrai si le mouvement est en mineur (son accord de degré I est mineur). */
function isMinorMovement(movement) {
  return isMinorProgression(String(movement?.pattern || '').split('-').map((t) => parseMovementToken(t)));
}

/**
 * Jeton de mouvement = degré (1–7, b/# optionnel) puis qualité. Le b/# altère
 * le DEGRÉ : « b5alt » = accord altéré sur bV (Gb7alt en Do), le V altéré
 * s'écrit « 5alt ». Formats : compact (« 7 », « b3maj7 », « 2m7b5 », « 5alt »,
 * « 1mMaj7 ») ou « degré:qualité » quand la qualité commence par un chiffre
 * (« b3:7 » = bIII7 ; « b37 » serait lu degré 37). Même syntaxe que les
 * progressions (parseProgressionToken).
 */
function parseMovementToken(token) {
  return parseProgressionToken(token);
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

  /**
   * Accords d'un mouvement dans une tonalité. Un jeton illisible ou un accord
   * sans voicing est omis ; `failures` (facultatif) reçoit alors son nom, pour
   * le signaler à l'écran au lieu de changer de mouvement en silence.
   */
  function buildMovementChords(movement, keyPc, technique, difficulty, anchors = {}, doubling = 'none', failures = null, leftHandStyle = 'none') {
    const tokens = movement.pattern.split('-');
    const minor = isMinorMovement(movement);
    const skeleton = tokens.map((token) => {
      const parsed = parseMovementToken(token);
      if (!parsed) {
        failures?.push(`« ${token} » (jeton illisible)`);
        return null;
      }
      const quality = movement.preserveQualities
        ? parsed.quality
        : upgradeQualityForDifficulty(parsed.quality, difficulty);
      const rootPc = (keyPc + parsed.offset) % 12;
      const name = `${spellDegreeInKey(rootPc, parsed.degree, keyPc, minor)}${quality}`;
      if (!resolveVariants(rootPc, quality, technique, difficulty)) {
        failures?.push(name);
        return null;
      }
      return { rootPc, quality, name, token, degree: parsed.degree };
    }).filter(Boolean);
    // Voicings enchaînés d'un accord à l'autre (voir chainVoicings).
    const chained = chainVoicings(skeleton, technique, difficulty, anchors);
    return skeleton.map((chord, i) => {
      const { technique: used, variant, index, count } = chained[i];
      const target = targetFromVoicing(chord.rootPc, chord.quality, voicingFromVariant(used, variant, index, count), used, doubling, leftHandStyle);
      return { ...target, name: chord.name, token: chord.token, degree: chord.degree, quality: chord.quality };
    });
  }

// [Claude] — 2026-09-24 — Choix des tonalités du tour (Narcisse : « on ne peut
// pas choisir ses tonalités ») : tonalités retenues, ordre de parcours, départ.
export const KEY_ORDERS = {
  chromatic: { label: 'Chromatique', step: 1 },
  fourths: { label: 'Cycle des quartes', step: 5 },
  fifths: { label: 'Cycle des quintes', step: 7 },
};
const ALL_KEYS = Array.from({ length: 12 }, (_, pc) => pc);

/** Tonalités du tour, dans l'ordre, en partant de `startKey`. */
export function keySequence(startKey, keySet = ALL_KEYS, order = 'chromatic') {
  const step = KEY_ORDERS[order]?.step ?? 1;
  const wanted = new Set(keySet);
  const keys = [];
  for (let i = 0; i < 12; i += 1) {
    const key = (startKey + i * step) % 12;
    if (wanted.has(key)) keys.push(key);
  }
  return keys;
}

// « Ma grille » : accords tapés en symboles, joués comme un mouvement dans les
// tonalités choisies. Les qualités sont gardées telles quelles : c'est
// l'utilisateur qui fixe extensions et altérations (le contexte est le sien).
export const CUSTOM_GRID_NAME = 'Ma grille';
const OFFSET_TOKENS = ['1', 'b2', '2', 'b3', '3', '4', '#4', '5', 'b6', '6', 'b7', '7'];
const MAJOR_TONIC_QUALITY = /^(maj|6|add9)/;
const MINOR_TONIC_QUALITY = /^m(?!aj|7b5)/;

/**
 * Tonalité dans laquelle se lit la grille : le dernier accord s'il est une
 * tonique mineure ; sinon la gamme majeure qui contient le plus de
 * fondamentales, de préférence celle d'un accord de tonique majeur de la grille
 * (Dm7 G7 Cmaj7 et Cmaj7 Am7 Dm7 G7 → Do majeur), puis celle du dernier accord.
 */
function customGridKey(chords) {
  const last = chords[chords.length - 1];
  if (MINOR_TONIC_QUALITY.test(last.symbol)) return { keyPc: last.rootPc, minor: true };
  const inScale = (key) => chords.filter((c) => MAJOR_SCALE.includes((c.rootPc - key + 12) % 12)).length;
  const best = Math.max(...ALL_KEYS.map(inScale));
  const candidates = ALL_KEYS.filter((key) => inScale(key) === best);
  const tonics = chords.filter((c) => MAJOR_TONIC_QUALITY.test(c.symbol)).map((c) => c.rootPc).reverse();
  const keyPc = tonics.find((pc) => candidates.includes(pc))
    ?? (candidates.includes(last.rootPc) ? last.rootPc : candidates[0]);
  return { keyPc, minor: false };
}

/**
 * Accords jouables d'une grille tapée, et ceux qu'on ignore : inconnus, avec
 * basse séparée ou sans aucun voicing (triades : VoicingLab n'en publie pas).
 */
function splitCustomGrid(typed) {
  const playable = (t) => t.symbol != null && isQualityOnVoicingLab(t.symbol, t.rootPc);
  return { chords: typed.filter(playable), ignored: typed.filter((t) => !playable(t)).map((t) => t.name) };
}

const unplayableNames = (names) => `${names.join(', ')} (aucun voicing : accord${names.length > 1 ? 's' : ''} inconnu${names.length > 1 ? 's' : ''}, triade${names.length > 1 ? 's' : ''} ou basse séparée)`;

/**
 * Mouvement construit sur une grille tapée : jetons « degré:qualité » relatifs à
 * sa tonalité de lecture. null si aucun accord n'est jouable.
 * @param {{name: string, rootPc: number|null, symbol: string|null}[]} typed
 */
function customGridMovement(typed) {
  const { chords } = splitCustomGrid(typed);
  if (chords.length === 0) return null;
  const { keyPc, minor } = customGridKey(chords);
  const pattern = chords.map((c) => `${OFFSET_TOKENS[(c.rootPc - keyPc + 12) % 12]}:${c.symbol}`).join('-');
  return {
    id: 'custom-grid',
    name: CUSTOM_GRID_NAME,
    category: 'Ma grille',
    level: 1,
    preserveQualities: true,
    pattern,
    writtenKey: keyPc,
    description: `${chords.map((c) => c.name).join(' → ')} : lue en ${keyLabel(keyPc, minor)}, puis transposée ton par ton, extensions et altérations comprises.`,
  };
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
    const target = buildChordTarget(rootPc, symbol, technique, state.variant, autoDifficulty(), filter, state.doubling, state.leftHandStyle);
    if (target || !filter) return target;
    const plain = buildChordTarget(rootPc, symbol, technique, state.variant, autoDifficulty(), null, state.doubling, state.leftHandStyle);
    return plain ? ({ ...plain, topNoteMiss: true }) : null;
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
    topNote: {
      pc: null, level: 'all', hands: 'all', technique: 'all',
      chordRoot: 'all', key: 'all',
    },
    // Doublures d'octave : 'none' | 'bass' | 'melody' | 'full'.
    doubling: 'none',
    // Main gauche d'un style ajoutée au voicing : 'none' | 'gospel' | 'ballade' | 'swing'.
    leftHandStyle: 'none',
    history: [],
    // Mode Accord cible : accord explicitement choisi par l'utilisateur.
    targetChoice: null,
    // null = tirage aléatoire (comportement par défaut). Sinon, nom du
    // mouvement explicitement choisi par l'utilisateur.
    movementChoice: null,
    // Tonalité de départ du tour (null = au hasard parmi les tonalités retenues),
    // tonalités retenues et ordre de parcours.
    keyChoice: null,
    keySet: [...ALL_KEYS],
    keyOrder: 'chromatic',
    // « Ma grille » : accords tapés ({name, rootPc, symbol}, symbol null = inconnu).
    customGrid: null,
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
    const onVoicingLab = ALL_PRACTICE_SYMBOLS.filter((q) => isQualityOnVoicingLab(q));
    const allowedSymbols = onVoicingLab.length > 0 ? onVoicingLab : ['maj7'];
    // Avec une note du dessus, on tire jusqu'à trouver un accord qui l'a au sommet.
    const filter = topNoteFilter();
    const attempts = filter ? MAX_TARGET_ATTEMPTS * 20 : MAX_TARGET_ATTEMPTS;
    for (let i = 0; i < attempts; i += 1) {
      const rootPc = randomInt(0, 11);
      const symbol = pick(allowedSymbols);
      const target = buildChordTarget(rootPc, symbol, state.technique, state.variant, autoDifficulty(), filter, state.doubling, state.leftHandStyle);
      if (target) return target;
    }
    // Repli ultime : un accord jouable au niveau demandé, sinon Cmaj7 close.
    for (const symbol of allowedSymbols) {
      const target = buildChordTarget(0, symbol, 'close', state.variant, autoDifficulty(), null, state.doubling, state.leftHandStyle);
      if (target) return target;
    }
    return buildChordTarget(0, 'maj7', 'close', state.variant, autoDifficulty(), null, state.doubling, state.leftHandStyle);
  }

  /** Départ du tour : la tonalité choisie si elle est retenue, sinon au hasard parmi les retenues. */
  function chooseStartKey(preferred = null) {
    if (state.keyChoice != null && state.keySet.includes(state.keyChoice)) return state.keyChoice;
    if (preferred != null && state.keySet.includes(preferred)) return preferred;
    return pick(state.keySet);
  }

  /** Mouvement nommé : bibliothèque, ou « Ma grille » construite sur les accords tapés. */
  function findMovement(name) {
    if (!name) return null;
    if (name === CUSTOM_GRID_NAME) return state.customGrid ? customGridMovement(state.customGrid) : null;
    return movementsLibrary.movements.find((m) => m.name === name) || null;
  }

  function generateMovementTarget() {
    // Mouvement explicitement choisi par l'utilisateur, sinon tirage au sort.
    const chosen = findMovement(state.movementChoice);
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
    // Grille tapée jouable : ses accords impossibles sont ignorés, et l'écran le dit.
    // Grille tapée sans aucun accord jouable : un autre mouvement, annoncé.
    const gridImpossible = !chosen && state.movementChoice === CUSTOM_GRID_NAME;
    const ignoredNotice = (movement) => {
      const { ignored } = splitCustomGrid(state.customGrid || []);
      if (gridImpossible) return `« ${CUSTOM_GRID_NAME} » impossible : ${unplayableNames(ignored)}. Mouvement proposé à la place : « ${movement.name} ».`;
      if (movement.name !== CUSTOM_GRID_NAME) return null;
      return ignored.length > 0 ? `Ignoré${ignored.length > 1 ? 's' : ''} : ${unplayableNames(ignored)}.` : null;
    };
    const build = (movement, startKey, failures = null) => buildMovementChords(movement, startKey, state.technique, state.difficulty, {}, state.doubling, failures, state.leftHandStyle);
    const isComplete = (movement, chords) => chords.length === movement.pattern.split('-').length;
    // Accords introuvables du mouvement choisi, pour l'expliquer à l'écran.
    let failures = [];
    let failedKey = null;
    for (let i = 0; i < MAX_TARGET_ATTEMPTS; i += 1) {
      const movement = pick(pool);
      // « Ma grille » commence dans le ton où elle a été écrite.
      const startKey = chooseStartKey(movement.writtenKey);
      const missing = [];
      const chords = build(movement, startKey, missing);
      if (isComplete(movement, chords)) return movementTarget(movement, startKey, chords, ignoredNotice(movement));
      if (movement === chosen) {
        failures = missing;
        failedKey = startKey;
      }
    }
    // [Claude] — 2026-09-24 — Repli : premier mouvement de la bibliothèque qui
    // se construit en entier (niveau adapté d'abord). Un mouvement CHOISI n'est
    // plus remplacé en silence (bug « II-V-I altéré en mineur » et « Cycle de
    // tierces majeures ») : `notice` dit à l'écran lequel et pourquoi.
    const startKey = chooseStartKey();
    const candidates = [...allowedMovements, ...movementsLibrary.movements].filter((m) => m !== chosen);
    const noticeFor = (replacement) => {
      if (gridImpossible) return ignoredNotice(replacement);
      if (!chosen) return null;
      const reason = `« ${chosen.name} » ne peut pas être construit en ${keyLabel(failedKey, isMinorMovement(chosen))} (${[...new Set(failures)].join(', ')} : aucun voicing).`;
      return replacement === chosen ? reason : `${reason} Mouvement proposé à la place : « ${replacement.name} ».`;
    };
    for (const movement of candidates) {
      const chords = build(movement, startKey);
      if (isComplete(movement, chords)) return movementTarget(movement, startKey, chords, noticeFor(movement));
    }
    // Bibliothèque entière inconstructible : ne doit pas arriver (test 12 tons × 5 niveaux).
    const fallback = chosen || allowedMovements[0] || movementsLibrary.movements[0];
    return movementTarget(fallback, startKey, build(fallback, startKey), noticeFor(fallback));
  }

  /** État d'un mouvement dans sa première tonalité ; `notice` = message à afficher. */
  function movementTarget(movement, startKey, chords, notice = null) {
    const keys = keySequence(startKey, state.keySet, state.keyOrder);
    return {
      type: 'movement',
      name: movement.name,
      minor: isMinorMovement(movement),
      description: movement.description,
      category: movement.category,
      pattern: movement.pattern,
      movement,
      startKey,
      currentKey: startKey,
      keys,
      totalKeys: keys.length,
      keyIndex: 0,
      // Variantes fixées par les flèches (rang de l'accord → variante), gardées
      // d'une tonalité à l'autre ; les autres accords s'enchaînent.
      anchors: {},
      stepIndex: 0,
      chords,
      notice,
    };
  }

  function attachMovementContext(chord, movementState) {
    if (!movementState || movementState.type !== 'movement') return chord;
    return {
      ...chord,
      movementName: movementState.name,
      movementDescription: movementState.description,
      movementCategory: movementState.category,
      keyLabel: `Tonalité ${keyLabel(movementState.currentKey, isMinorMovement(movementState.movement))}`,
      keyName: keyLabel(movementState.currentKey, isMinorMovement(movementState.movement)),
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
    // Mouvement : toute la grille est réenchaînée (voir refreshProgressionChords).
    if (state.mode === 'movement') {
      refreshProgressionChords();
      return;
    }
    const { rootPc, symbol } = state.target;
    const refreshed = state.mode === 'chord'
      ? chordModeTarget(rootPc, symbol)
      : buildChordTarget(rootPc, symbol, state.technique, state.variant, autoDifficulty(), null, state.doubling, state.leftHandStyle);
    if (!refreshed) return;
    // topNoteMiss est recalculé à chaque régénération.
    if (!refreshed.topNoteMiss) delete state.target.topNoteMiss;
    // Conserver les métadonnées de contexte mouvement/progression, dont le nom
    // épelé selon la tonalité (buildChordTarget écrit toujours en dièses).
    state.target = state.mode === 'chord'
      ? { ...state.target, ...refreshed }
      : { ...state.target, ...refreshed, name: state.target.name };
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
    } else {
      state.progression = generateMovementTarget();
      state.target = attachMovementContext(state.progression.chords[0], state.progression);
    }
    return state;
  }

  function setMode(mode) {
    if (mode !== 'chord' && mode !== 'movement') return state;
    state.mode = mode;
    return next();
  }

  function setVariant(delta) {
    // En mode Auto, les flèches parcourent les variantes de la technique
    // réellement jouée, pas celles de la première catégorie.
    const max = Math.max(1, state.target?.voicing?.variantCount || 1);
    if (state.mode === 'movement' && state.progression) {
      // Mouvement : la variante choisie est fixée sur l'accord affiché, les
      // accords suivants s'enchaînent à partir d'elle.
      const prog = state.progression;
      const current = state.target?.voicing?.variantIndex || 0;
      prog.anchors = { ...prog.anchors, [prog.stepIndex || 0]: ((current + delta) % max + max) % max };
      refreshProgressionChords();
      return;
    }
    state.variant = ((state.variant + delta) % max + max) % max;
    regenerateCurrentTarget();
  }

  /**
   * Mouvement : réenchaîne les voicings de la tonalité en cours (technique,
   * variantes fixées, doublures courantes), sans changer les accords.
   */
  function refreshProgressionChords() {
    const prog = state.progression;
    if (state.mode !== 'movement' || !prog?.chords) return;
    prog.chords = buildMovementChords(prog.movement, prog.currentKey, state.technique, state.difficulty, prog.anchors, state.doubling, null, state.leftHandStyle);
    const step = Math.min(prog.stepIndex || 0, prog.chords.length - 1);
    state.target = attachMovementContext(prog.chords[step], prog);
    state.variant = state.target?.voicing?.variantIndex || 0;
  }

  function setTechnique(technique) {
    if (!TECHNIQUES.includes(technique)) return;
    state.technique = technique;
    state.variant = 0;
    // Les variantes fixées n'ont de sens que dans la technique où elles l'ont été.
    if (state.progression) state.progression.anchors = {};
    // En mode accord cible avec cible choisie, on la régénère directement.
    if (state.mode === 'chord' && state.targetChoice) {
      state.target = chordModeTarget(state.targetChoice.rootPc, state.targetChoice.symbol, technique);
      return;
    }
    // Mouvement : toute la grille est réenchaînée dans la nouvelle technique.
    regenerateCurrentTarget();
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
   * Tonalité de départ du tour (mode Mouvement). `null` ou une valeur invalide
   * rétablit le tirage au hasard parmi les tonalités retenues ; une tonalité non
   * retenue est ajoutée au tour.
   * @param {number|string|null} keyPc - 0-11 ou null
   */
  function setKeyChoice(keyPc) {
    const pc = keyPc === '' || keyPc == null ? null : Number(keyPc);
    if (pc != null && (!Number.isInteger(pc) || pc < 0 || pc > 11)) return;
    state.keyChoice = pc;
    if (pc != null && !state.keySet.includes(pc)) state.keySet = [...state.keySet, pc].sort((a, b) => a - b);
    return next();
  }

  /**
   * Tonalités retenues pour le tour (au moins une). Le départ choisi qui n'en
   * fait plus partie repasse au hasard.
   * @param {number[]} keys - classes de hauteur 0–11
   */
  function setKeySet(keys) {
    const set = [...new Set((keys || []).map(Number).filter((k) => Number.isInteger(k) && k >= 0 && k < 12))].sort((a, b) => a - b);
    if (set.length === 0) return state;
    state.keySet = set;
    if (state.keyChoice != null && !set.includes(state.keyChoice)) state.keyChoice = null;
    return next();
  }

  /** Ordre de parcours des tonalités : 'chromatic' | 'fourths' | 'fifths'. */
  function setKeyOrder(order) {
    if (!KEY_ORDERS[order]) return state;
    state.keyOrder = order;
    return next();
  }

  /**
   * Saut direct à un accord de la tonalité en cours (clic dans la liste) : pas
   * besoin de jouer les précédents. Ne compte ni essai ni point.
   * @param {number} stepIndex
   */
  function goToStep(stepIndex) {
    const prog = state.progression;
    if (state.mode !== 'movement' || !prog?.chords?.length) return state;
    const index = Math.max(0, Math.min(prog.chords.length - 1, Number(stepIndex) || 0));
    prog.stepIndex = index;
    state.stepIndex = index;
    state.attempts = 0;
    state.target = attachMovementContext(prog.chords[index], prog);
    return state;
  }

  /**
   * Saut direct à une tonalité du tour (clic sur la frise des tonalités), sur son
   * premier accord.
   * @param {number} keyIndex - rang dans le tour
   */
  function goToKey(keyIndex) {
    const prog = state.progression;
    if (state.mode !== 'movement' || !prog?.keys?.length) return state;
    const index = Math.max(0, Math.min(prog.keys.length - 1, Number(keyIndex) || 0));
    loadMovementKey(prog, index);
    state.stepIndex = 0;
    state.keyIndex = index;
    state.attempts = 0;
    state.target = attachMovementContext(prog.chords[0], prog);
    return state;
  }

  /** Accords de la tonalité de rang `keyIndex` ; un accord sans voicing est sauté, et l'écran le dit. */
  function loadMovementKey(prog, keyIndex) {
    prog.keyIndex = keyIndex;
    prog.stepIndex = 0;
    prog.currentKey = prog.keys[keyIndex];
    const missing = [];
    prog.chords = buildMovementChords(prog.movement, prog.currentKey, state.technique, state.difficulty, prog.anchors, state.doubling, missing, state.leftHandStyle);
    prog.notice = missing.length > 0
      ? `${missing.join(', ')} : aucun voicing en ${keyLabel(prog.currentKey, isMinorMovement(prog.movement))}, accord sauté.`
      : null;
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

  /** Doublures d'octave (tous modes) : la cible et toute la grille sont recalculées. */
  function setDoubling(mode) {
    if (!DOUBLING_MODES.includes(mode)) return;
    state.doubling = mode;
    if (state.mode === 'chord') regenerateCurrentTarget();
    else refreshProgressionChords();
  }

  /** Main gauche d'un style (tous modes, 'none' = voicing seul) : cible et grille recalculées. */
  function setLeftHandStyle(style) {
    if (style !== 'none' && !LEFT_HAND_STYLES.includes(style)) return;
    state.leftHandStyle = style;
    if (state.mode === 'chord') regenerateCurrentTarget();
    else refreshProgressionChords();
  }

  /**
   * Filtre de la recherche par note du dessus.
   * @param {keyof TOP_NOTE_FILTERS} name
   * @param {string} value
   */
  function setTopNoteFilter(name, value) {
    if (!TOP_NOTE_FILTERS[name]?.includes(value)) return;
    state.topNote = { ...state.topNote, [name]: value };
    state.variant = 0;
    if (state.mode === 'chord' && state.target) regenerateCurrentTarget();
  }

  /**
   * Affiche un voicing favori tel qu'il a été enregistré (mode Accord cible).
   * L'accord devient l'accord choisi : changer de technique ou de variante
   * repart ensuite des voicings VoicingLab de cet accord.
   * @param {{rootPc: number, quality: string, name: string, lh: number[], rh: number[], technique: string, difficulty?: number, doubled?: number[], addedLH?: number[]}} fav
   */
  function showFavorite(fav) {
    if (state.mode !== 'chord' || !fav) return;
    state.targetChoice = { rootPc: fav.rootPc, symbol: fav.quality };
    state.variant = 0;
    state.target = {
      type: 'chord',
      rootPc: fav.rootPc,
      symbol: fav.quality,
      name: fav.name,
      notes: [...fav.lh, ...fav.rh],
      voicing: {
        leftHand: [...fav.lh],
        rightHand: [...fav.rh],
        technique: fav.technique,
        difficulty: fav.difficulty,
        isPlayable: true,
        diagnostics: [],
        fallback: false,
        source: 'favori',
        variantIndex: 0,
        variantCount: 1,
        variantLabel: 'Favori',
        doubled: fav.doubled?.length ? [...fav.doubled] : undefined,
        addedLH: fav.addedLH?.length ? [...fav.addedLH] : undefined,
        styleAdded: fav.styleAdded?.length ? [...fav.styleAdded] : undefined,
        leftHandStyle: fav.leftHandStyle || undefined,
        baseHasLeftHand: Boolean(fav.baseHasLeftHand),
      },
    };
    // L'option « Main gauche » reprend celle du favori (les accords suivants la gardent).
    state.leftHandStyle = LEFT_HAND_STYLES.includes(fav.leftHandStyle) ? fav.leftHandStyle : 'none';
  }

  /** Remet tous les filtres de la note du dessus à « tous », niveau compris. */
  function resetTopNoteFilters() {
    const cleared = Object.fromEntries(Object.keys(TOP_NOTE_FILTERS).map((name) => [name, 'all']));
    state.topNote = { ...state.topNote, ...cleared, level: 'all' };
    state.variant = 0;
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

    const prog = state.progression;
    if (prog.stepIndex > 0) {
      prog.stepIndex -= 1;
    } else if (prog.keyIndex > 0) {
      // Retour au dernier accord de la tonalité précédente.
      loadMovementKey(prog, prog.keyIndex - 1);
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

  /** Fixe le mouvement proposé (mode Mouvement). `null` rétablit le tirage au sort. */
  function setContentChoice(name) {
    state.movementChoice = name || null;
    return next();
  }

  /**
   * Aperçu d'un mouvement (démo de la bibliothèque) sans rien changer à
   * l'exercice : ses accords dans la tonalité `keyPc`, avec la technique, le
   * niveau et les doublures courants, voicings enchaînés comme à l'exercice.
   * @returns {object[]|null}
   */
  function previewMovement(name, keyPc = 0) {
    const movement = findMovement(name);
    if (!movement) return null;
    const chords = buildMovementChords(movement, keyPc, state.technique, state.difficulty, {}, state.doubling, null, state.leftHandStyle);
    return chords.length > 0 ? chords : null;
  }

  /** Revient au tirage au sort des mouvements. */
  function clearContentChoice() {
    state.movementChoice = null;
    return next();
  }

  /**
   * « Ma grille » : accords tapés en symboles (ex. « Dm11 G7#9b13 Cmaj13 »),
   * joués comme un mouvement dans les tonalités choisies, qualités gardées
   * telles quelles. Les accords inconnus sont gardés (symbol null) pour être
   * signalés à l'écran, pas écartés en silence. Vide = retour au tirage au sort.
   * @param {string} input
   */
  function setCustomGrid(input) {
    const symbols = String(input || '').trim().split(/\s+/).filter(Boolean);
    state.customGrid = symbols.length > 0 ? symbols.map(parseTypedChord) : null;
    state.movementChoice = state.customGrid ? CUSTOM_GRID_NAME : null;
    if (state.mode !== 'movement') state.mode = 'movement';
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
      loadMovementKey(prog, prog.keyIndex);
    }
    state.stepIndex = prog.stepIndex;
    state.keyIndex = prog.keyIndex;
    return { completed: false };
  }

  /** Accord attendu maintenant : la cible (Accord cible) ou l'étape de la grille. */
  function expectedChord() {
    return state.mode === 'chord' ? state.target : state.progression?.chords?.[state.stepIndex] || null;
  }

  /** Vrai si `notes` est une bonne réponse, sans compter d'essai (voir judgeAnswer). */
  function isCorrect(notes) {
    return judgeAnswer(notes, expectedChord()).success;
  }

  function check(notes) {
    if (!state.target) return { success: false, message: 'Aucun exercice actif.' };

    // Réponse jugée sur l'accord ANNONCÉ, pas sur la lecture par detectChord
    // du voicing affiché (voir judgeAnswer) : rejouer le voicing affiché reste
    // juste (quartal, rootless, clusters), un autre voicing de l'accord aussi.
    const { success, detected } = judgeAnswer(notes, expectedChord());
    state.attempts++;

    if (state.mode === 'chord') {
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

    // Mode mouvement dans les 12 tons
    const expected = state.progression.chords[state.stepIndex];
    if (success) {
      const justCompletedKey = state.stepIndex + 1 >= state.progression.chords.length;
      const doneKeyName = state.target?.keyName;
      pushHistory(state.progression.chords[state.stepIndex]);
      const advance = advanceMovement();
      if (!advance) {
        return { success: false, message: "Erreur interne de l'exercice." };
      }
      if (advance.completed) {
        state.score += 50;
        const completedName = state.progression.name;
        const totalKeys = state.progression.totalKeys;
        state.progression = generateMovementTarget();
        state.target = attachMovementContext(state.progression.chords[0], state.progression);
        state.stepIndex = 0;
        state.keyIndex = 0;
        state.attempts = 0;
        return {
          success: true,
          message: `✅ ${completedName} parcouru dans ${totalKeys} ton${totalKeys > 1 ? 's' : ''} ! Suivant : ${state.progression.name}`,
          completed: true,
        };
      }
      state.target = attachMovementContext(state.progression.chords[state.progression.stepIndex], state.progression);
      state.stepIndex = state.progression.stepIndex;
      state.keyIndex = state.progression.keyIndex;
      if (justCompletedKey) {
        return {
          success: true,
          message: `✅ ${doneKeyName} validé. Prochain ton : ${state.target.keyName}`,
        };
      }
      return {
        success: true,
        message: `✅ ${expected.name} correct. Suivant : ${state.target.name}`,
      };
    }
    const playedName = detected ? `${spellPcInKey(detected.rootPc, state.progression.currentKey, isMinorMovement(state.progression.movement))}${detected.symbol}` : 'inconnu';
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
    setTopNoteFilter,
    resetTopNoteFilters,
    showFavorite,
    selectTopNoteSuggestion,
    setDoubling,
    setLeftHandStyle,
    setContentChoice,
    clearContentChoice,
    setCustomGrid,
    previewMovement,
    setKeySet,
    setKeyOrder,
    goToStep,
    goToKey,
    check,
    isCorrect,
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
  // [Claude] — 2026-09-24 — Notes que la démo ajoute à la carte (Mouvement :
  // basse de la main gauche, note doublée ; Narcisse : « la démo ajoute aussi des
  // basses quand le mini-key ne l'affiche pas, je le veux aussi »).
  const demo = options.demo || null;
  const demoAdded = demo ? [...demo.bass, ...demo.doubled] : [];
  // Notes de l'exercice (cases des mains) ; le clavier y ajoute celles de la démo.
  const cardNotes = [...new Set([...(voicing?.leftHand || []), ...(voicing?.rightHand || []), ...(target.notes || [])])].sort((a, b) => a - b);
  // Le clavier reste unifié : toutes les notes actives, sans distinction LH/RH.
  const notes = [...new Set([...cardNotes, ...demoAdded])].sort((a, b) => a - b);

  // Doublures et main gauche du style (options de l'utilisateur), notes ajoutées
  // par la démo : colorées à part.
  const doubled = voicing?.doubled || [];
  const styleAdded = voicing?.styleAdded || [];
  const kb = miniKeyboardForNotes(notes, { leftHand: [], rightHand: [], added: [...doubled, ...styleAdded, ...demoAdded] });

  // Affichage des mains : si le moteur a produit un split LH/RH avec des
  // notes distinctes, on montre les deux blocs ; sinon un seul bloc.
  const leftHand = voicing?.leftHand || [];
  const rightHand = voicing?.rightHand || [];
  const splitDisplay = leftHand.length > 0 && rightHand.length > 0
    && leftHand.some((n) => !rightHand.includes(n));

  // Notes épelées selon la tonalité en Progression / Mouvement (Bb4 en Fa, pas A#4).
  const noteLabel = options.spelling
    ? (n) => `${spellPcInKey(n, options.spelling.keyPc, options.spelling.minor)}${Math.floor(n / 12) - 1}`
    : formatNoteNameWithOctave;
  const allNames = cardNotes.map((n) => noteLabel(n)).join(' · ');
  const difficulty = options.difficulty ?? difficultyOfVoicing(target);
  // Accord cible : le choix du voicing et les doublures quittent la carte
  // (colonne de droite et fenêtre Filtres) ; la carte garde l'essentiel.
  const compact = options.layout === 'chord';

  return `
    <div class="exercise-target-card ${target.movementName ? 'has-movement' : ''}">
      <button class="exercise-favorite-toggle${options.isFavorite ? ' active' : ''}" type="button" data-action="toggle-favorite" aria-pressed="${options.isFavorite ? 'true' : 'false'}" title="${options.isFavorite ? 'Retirer des favoris' : 'Ajouter ce voicing aux favoris'}">${options.isFavorite ? '★' : '☆'}</button>
      <div class="exercise-target-header">
        <div class="exercise-target-title">
          <div class="exercise-target-name">${escapeHtml(target.name)}</div>
        </div>
        <div class="exercise-target-stars" aria-label="Difficulté ${difficulty} sur 5" title="Difficulté ${difficulty} sur 5">
          ${renderStars(difficulty)}
        </div>
      </div>
      ${compact ? '' : renderVoicingChoices(target, options)}
      ${target.topNoteMiss ? `<div class="exercise-topnote-miss">Aucun voicing de ${escapeHtml(target.name)} n'a cette note au sommet avec ces filtres : voicing habituel affiché.</div>` : ''}
      <div class="exercise-target-keyboard">${kb.svg}</div>
      ${doubled.length > 0 ? `<div class="exercise-doubled-note">Doublure${doubled.length > 1 ? 's' : ''} ajoutée${doubled.length > 1 ? 's' : ''} : ${escapeHtml(formatHandNotes(doubled, noteLabel))}</div>` : ''}
      ${voicing?.leftHandStyle ? `<div class="exercise-doubled-note exercise-style-added">${escapeHtml(describeLeftHandStyle(voicing, noteLabel))}</div>` : ''}
      ${demo ? `<div class="exercise-doubled-note exercise-demo-added">${escapeHtml(describeDemoAdditions(demo, noteLabel))}</div>` : ''}
      <div class="exercise-target-hands">
        ${splitDisplay ? renderHandSplit(leftHand, rightHand, noteLabel) : renderUnifiedHand(allNames, singleHandLabel(leftHand, rightHand))}
      </div>
      <div class="exercise-target-actions">
      ${compact ? '' : renderDoublingSelect(options.doubling)}
      ${renderLeftHandSelect(options.leftHandStyle ?? voicing?.leftHandStyle ?? 'none', baseHasLeftHand(voicing))}
      <button class="exercise-listen-btn" type="button" data-action="listen-exercise" aria-label="Écouter le voicing">
        <svg class="tr-i" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" fill="currentColor"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>
        Écouter
      </button>
      </div>
    </div>
  `;
}

/** Vrai si le voicing de base (avant la main gauche du style) a une main gauche. */
function baseHasLeftHand(voicing) {
  if (!voicing) return false;
  return voicing.leftHandStyle ? Boolean(voicing.baseHasLeftHand) : (voicing.leftHand || []).length > 0;
}

/**
 * Menu « Main gauche » de la carte : le voicing seul (« Main droite seule » s'il
 * n'a pas de main gauche), ou avec la main gauche d'un style.
 * @param {string} style - 'none' | 'gospel' | 'ballade' | 'swing'
 * @param {boolean} hasOwnLeftHand - le voicing de base a déjà une main gauche
 */
export function renderLeftHandSelect(style = 'none', hasOwnLeftHand = false) {
  const options = [['none', hasOwnLeftHand ? 'Voicing seul' : 'Main droite seule'],
    ...Object.entries(LEFT_HAND_LABELS).map(([id, label]) => [id, `+ main gauche ${label}`])];
  return `<select class="exercise-left-hand-select" data-exercise-left-hand aria-label="Main gauche ajoutée au voicing, selon le style" title="Main gauche ajoutée au voicing, selon le style">
        ${options.map(([id, label]) => `<option value="${id}"${id === style ? ' selected' : ''}>${escapeHtml(label)}</option>`).join('')}
      </select>`;
}

/**
 * Phrase décrivant la main gauche du style ajoutée au voicing : « Main gauche
 * Gospel / worship : basse D2 · A2, C4 doublé à la main droite ».
 */
function describeLeftHandStyle(voicing, noteLabel = formatNoteNameWithOctave) {
  const label = LEFT_HAND_LABELS[voicing.leftHandStyle] || voicing.leftHandStyle;
  const added = new Set(voicing.styleAdded || []);
  const bass = (voicing.leftHand || []).filter((n) => added.has(n));
  const doubled = (voicing.rightHand || []).filter((n) => added.has(n));
  const parts = [];
  if (bass.length) parts.push(`basse ${formatHandNotes(bass, noteLabel)}`);
  if (voicing.styleMovedToRight) parts.push('voicing à la main droite');
  if (doubled.length) parts.push(`${formatHandNotes(doubled, noteLabel)} doublé${doubled.length > 1 ? 's' : ''} à la main droite`);
  if (!parts.length) return `Main gauche ${label} : rien à ajouter, ce voicing a déjà sa main gauche`;
  return `Main gauche ${label} : ${parts.join(', ')}`;
}

/**
 * Phrase décrivant ce que la démo ajoute à la carte : « Démo Gospel / worship :
 * basse D2 · A2 à la main gauche, C4 doublé à la main droite ».
 * @param {{bass: number[], doubled: number[], movedToRight: boolean, styleLabel?: string}} demo
 */
function describeDemoAdditions(demo, noteLabel = formatNoteNameWithOctave) {
  const parts = [];
  if (demo.bass.length) parts.push(`basse ${formatHandNotes(demo.bass, noteLabel)} à la main gauche`);
  if (demo.movedToRight) parts.push('voicing joué à la main droite');
  if (demo.doubled.length) parts.push(`${formatHandNotes(demo.doubled, noteLabel)} doublé${demo.doubled.length > 1 ? 's' : ''} à la main droite`);
  const keep = demo.styleId && LEFT_HAND_LABELS[demo.styleId]
    ? ` — pour la garder (favoris compris) : « + main gauche ${LEFT_HAND_LABELS[demo.styleId]} »`
    : '';
  return `Démo${demo.styleLabel ? ` ${demo.styleLabel}` : ''} : ${parts.join(', ')}${keep}`;
}

/** Menu des doublures d'octave (carte des modes Progression / Mouvement, fenêtre Filtres). */
export function renderDoublingSelect(doubling = 'none') {
  return `<select class="exercise-doubling-select" data-exercise-doubling aria-label="Doublures d'octave ajoutées au voicing">
        ${Object.entries(DOUBLING_LABELS).map(([id, label]) => `<option value="${id}"${id === doubling ? ' selected' : ''}>${id === 'none' ? 'Sans doublure' : escapeHtml(label)}</option>`).join('')}
      </select>`;
}

/**
 * Voicings disponibles pour la cible : étiquettes de technique (flèches sur la
 * technique jouée) ou, avec une top note, la liste des voicings trouvés.
 * Dans la carte (Progression / Mouvement) ou dans la colonne de droite (Accord cible).
 */
export function renderVoicingChoices(target, options = {}) {
  const voicing = target?.voicing;
  if (!voicing) return '';
  if (voicing.topNoteSuggestions) return renderTopNotePanel(voicing);
  const technique = voicing.technique || 'auto';
  const categories = options.categories ?? getAvailableTechniques(target.name);
  return renderVoicingCategories(categories, technique, voicing.variantIndex ?? options.variant ?? 0, voicing.variantLabel || '', options.selectedTechnique ?? technique);
}

/**
 * Liste des voicings trouvés pour la top note, du plus simple au plus
 * complexe ; la description de chaque voicing reste en info-bulle.
 */
function renderTopNotePanel(voicing) {
  const { topNoteSuggestions: list, variantIndex } = voicing;
  const items = list.map((sug, i) => {
    const active = i === variantIndex ? ' active' : '';
    return `<li><button type="button" class="exercise-topnote-item${active}" data-topnote-index="${i}" title="${escapeHtml(sug.description)}">
        <span class="exercise-topnote-tech">${escapeHtml(sug.label)}</span>
        <span class="exercise-topnote-stars" aria-label="Difficulté ${sug.difficulty} sur 5">${'★'.repeat(sug.difficulty)}</span>
      </button></li>`;
  }).join('');
  return `
    <div class="exercise-topnote-panel">
      <ol class="exercise-topnote-list">${items}</ol>
    </div>`;
}

/**
 * Navigateur « accords avec cette note au sommet » : liste épurée, un bouton
 * par accord (nom + nombre de voicings), groupés par famille. Un clic charge
 * l'accord sur la carte, dont les flèches ‹ › parcourent les voicings.
 *
 * @param {ReturnType<typeof findChordsByTopNote>} results
 * @param {{ topPc: number, selected?: {rootPc: number, quality: string}|null }} options
 */
export function renderTopNoteBrowser(results, { topPc, selected = null } = {}) {
  const topName = formatPc(topPc, false);
  const groups = [];
  for (const r of results) {
    if (groups.length === 0 || groups[groups.length - 1].id !== r.group) groups.push({ id: r.group, label: r.groupLabel, chords: [] });
    groups[groups.length - 1].chords.push(r);
  }
  const rows = groups.map((g) => {
    const chords = g.chords.map((r) => {
      const isSelected = selected && selected.rootPc === r.rootPc && selected.quality === r.quality;
      const techniques = [...new Set(r.voicings.map((v) => v.shortLabel))].join(', ');
      const count = r.voicings.length;
      const title = `${count} voicing${count > 1 ? 's' : ''} : ${techniques}`;
      return `<button type="button" class="exercise-browser-chord${isSelected ? ' selected' : ''}" data-browse-root="${r.rootPc}" data-browse-quality="${escapeHtml(r.quality)}" title="${escapeHtml(title)}">`
        + `<span class="exercise-browser-name">${escapeHtml(r.name)}</span>`
        + `<span class="exercise-browser-count">${count}</span></button>`;
    }).join('');
    return `<li class="exercise-browser-group">${escapeHtml(g.label)}</li><li class="exercise-browser-grid">${chords}</li>`;
  }).join('');
  return `
    <div class="exercise-browser-head"><strong>${escapeHtml(topName)}</strong> au sommet · ${results.length} accord${results.length > 1 ? 's' : ''}</div>
    ${results.length === 0
    ? '<p class="exercise-browser-empty">Aucun voicing avec ces filtres.</p>'
    : `<ul class="exercise-browser-list" data-browser-scroll>${rows}</ul>`}`;
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

function formatHandNotes(notes, noteLabel = formatNoteNameWithOctave) {
  if (!notes || notes.length === 0) return '—';
  return notes.map((n) => noteLabel(n)).join(' · ');
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

function renderHandSplit(leftHand, rightHand, noteLabel = formatNoteNameWithOctave) {
  return `
    <div class="exercise-hand exercise-hand-lh">
      <span class="exercise-hand-label">Main gauche</span>
      <span class="exercise-hand-notes">${escapeHtml(formatHandNotes(leftHand, noteLabel))}</span>
    </div>
    <div class="exercise-hand exercise-hand-rh">
      <span class="exercise-hand-label">Main droite</span>
      <span class="exercise-hand-notes">${escapeHtml(formatHandNotes(rightHand, noteLabel))}</span>
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
