// [Claude] — 2026-09-08 — Copilot IA : fonctions de validation musicale.
//
// Module pur, sans effet de bord : aucun appel réseau, aucun accès DOM. Il
// consomme le moteur d'accords existant pour comparer les notes jouées avec
// le nom d'accord annoncé (sous-chantier 3.3).

import { detectChord } from '../chord-engine/index.js';
import { formatPc } from '../chord-engine/naming.js';
import { noteNameToPc, latinNoteNameToPc, NOTE_NAMES } from '../chord-engine/intervals.js';
import { Key } from 'tonal';

/**
 * Regroupe les notes jouées par fenêtre de temps.
 * @param {object[]} playedNotes - notes renvoyées par executeToolCalls
 * @param {number} gapThresholdMs - écart maximal (ms) pour rester dans le même groupe
 * @returns {{ notes: object[], startOffsetMs: number, isChordLike: boolean }[]}
 */
export function groupNotesByTimeWindow(playedNotes, gapThresholdMs = 200) {
  if (!Array.isArray(playedNotes) || playedNotes.length === 0) return [];
  const sorted = [...playedNotes].sort((a, b) => (a.startOffsetMs ?? 0) - (b.startOffsetMs ?? 0));
  const groups = [];
  let current = { notes: [sorted[0]], startOffsetMs: sorted[0].startOffsetMs ?? 0 };

  for (let i = 1; i < sorted.length; i += 1) {
    const note = sorted[i];
    const prev = current.notes[current.notes.length - 1];
    const gap = (note.startOffsetMs ?? 0) - (prev.startOffsetMs ?? 0);
    if (gap <= gapThresholdMs) {
      current.notes.push(note);
    } else {
      groups.push({ ...current, isChordLike: current.notes.length >= 3 });
      current = { notes: [note], startOffsetMs: note.startOffsetMs ?? 0 };
    }
  }
  groups.push({ ...current, isChordLike: current.notes.length >= 3 });
  return groups;
}

/**
 * Extrait les accords en gras markdown (ex. **Cmaj7**).
 * @param {string} text
 * @returns {string[]}
 */
export function extractBoldChordNames(text) {
  if (!text) return [];
  const matches = [];
  const re = /\*\*([^*]+)\*\*/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    matches.push(m[1].trim());
  }
  return matches;
}

/**
 * Extrait les mentions de degré, de façon conservative (log uniquement).
 * Deux motifs seulement :
 *  - proximité immédiate du mot « degré » (ex. « le degré iii ») ;
 *  - progression de chiffres romains avec au moins deux symboles séparés
 *    par des tirets (ex. « ii-V-I »).
 * @param {string} text
 * @returns {string[]}
 */
export function extractDegreeReferences(text) {
  if (!text) return [];
  const matches = [];

  // Motif (a) : "degré X" ou "degrés X-Y-Z" avec une capture large.
  const degreeWordRe = /\bdegr[ée]s?\s+([ivxlcdmIVXLCDM0-9][ivxlcdmIVXLCDM0-9\-\/\(\)\.]*)/gi;
  let m;
  while ((m = degreeWordRe.exec(text)) !== null) {
    matches.push(m[1].trim());
  }

  // Motif (b) : progression complète type ii-V-I, IV-V-vi, etc.
  // Au moins deux symboles romains séparés par des tirets (ou slash).
  const progressionRe = /\b([ivxlcdmIVXLCDM]+(?:[-/][ivxlcdmIVXLCDM]+){1,})\b/g;
  while ((m = progressionRe.exec(text)) !== null) {
    const candidate = m[1].trim();
    // S'assurer qu'on a au moins 2 symboles distincts (exclure les faux tir
    const parts = candidate.split(/[-/]/).filter(Boolean);
    if (parts.length >= 2) {
      matches.push(candidate);
    }
  }

  return matches;
}

/**
 * Construit un objet de log si au moins un signal de validation est présent.
 * Retourne null sinon pour éviter le spam console.
 * @param {object} params
 * @param {object[]} params.groups
 * @param {string[]} params.extractedChordNames
 * @param {string[]} params.extractedDegreeRefs
 * @returns {object|null}
 */
/**
 * Extrait la classe de hauteur (pitch class) de la fondamentale d'un nom d'accord.
 * ATTENTION : on ne passe JAMAIS le nom d'accord complet à noteNameToPc(),
 * car tout ce qui suit la première lettre est interprété comme des altérations
 * sur la fondamentale (ex. "Am7b5" donnerait La bémol). On capture donc juste
 * la lettre A-G et les altérations qui la suivent immédiatement.
 * @param {string} impliedChordName
 * @returns {number|null}
 */
export function extractChordRootPc(impliedChordName) {
  if (!impliedChordName || typeof impliedChordName !== 'string') return null;
  const match = String(impliedChordName).match(/^\s*([A-Ga-g])([#♯b♭]*)/);
  if (!match) return null;
  return noteNameToPc(match[1].toUpperCase() + match[2]);
}

/**
 * Compare, pour chaque groupe d'accord, le nom annoncé avec la détection du
 * moteur d'accords. Ne compare que les fondamentales (palier léger).
 * @param {object[]} groups - sortie de groupNotesByTimeWindow
 * @returns {object[]}
 */
export function checkChordNameAgreement(groups) {
  if (!Array.isArray(groups)) return [];
  const results = [];
  for (const group of groups) {
    if (!group.isChordLike) continue;
    const noteWithName = group.notes.find((n) => n.impliedChordName);
    if (!noteWithName) continue;
    const impliedChordName = noteWithName.impliedChordName;
    const announcedRootPc = extractChordRootPc(impliedChordName);
    if (announcedRootPc === null) continue;

    const detected = detectChord(group.notes.map((n) => n.midi));
    if (!detected || detected.symbol === '?') continue;

    const match = detected.rootPc === announcedRootPc;
    results.push({ group, impliedChordName, detected, announcedRootPc, match });
  }
  return results;
}

/**
 * Formate un résultat detectChord en texte brut (sans balise HTML).
 * @param {object} detected
 * @returns {string}
 */
export function formatDetectedChordPlain(detected) {
  if (!detected) return '';
  return `${formatPc(detected.rootPc, false)}${detected.symbol || ''}`;
}

const DEGREE_GRADES = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];

/**
 * Parse une tonalité exprimée en français ("Do# majeur") ou en anglais ("C major").
 * Retourne { tonicName, mode } où tonicName est un nom de note anglo-saxon avec
 * dièse (format compatible avec Tonal.js) et mode vaut 'major' ou 'minor'.
 * Retourne null si le mode n'est pas détectable avec confiance.
 * @param {string} impliedKey
 * @returns {{tonicName: string, mode: 'major'|'minor'}|null}
 */
export function parseImpliedKey(impliedKey) {
  if (!impliedKey || typeof impliedKey !== 'string') return null;
  const lower = impliedKey.toLowerCase();

  // Détection du mode : on cherche le mot de mode dans la chaîne entière.
  let mode = null;
  let modeIndex = -1;
  let modeWordLength = 0;

  const majorWords = ['majeur', 'major'];
  const minorWords = ['mineur', 'minor'];

  for (const word of majorWords) {
    const idx = lower.indexOf(word);
    if (idx !== -1 && (modeIndex === -1 || idx < modeIndex)) {
      mode = 'major';
      modeIndex = idx;
      modeWordLength = word.length;
    }
  }
  for (const word of minorWords) {
    const idx = lower.indexOf(word);
    if (idx !== -1 && (modeIndex === -1 || idx < modeIndex)) {
      mode = 'minor';
      modeIndex = idx;
      modeWordLength = word.length;
    }
  }

  if (!mode) return null;

  // La fondamentale est dans le texte AVANT le mot de mode.
  const tonicText = impliedKey.slice(0, modeIndex).trim();
  if (!tonicText) return null;

  // 1. Essai en solfège latin (Do, Ré#, Sib, ...).
  let pc = latinNoteNameToPc(tonicText);

  // 2. Essai en notation anglo-saxonne (C, C#, Bb, ...).
  if (pc === null) {
    const match = tonicText.match(/^\s*([A-Ga-g])([#♯b♭]*)/);
    if (match) {
      pc = noteNameToPc(match[1].toUpperCase() + match[2]);
    }
  }

  if (pc === null) return null;

  // NOTE_NAMES utilise des dièses : C, C#, D, D#, E, F, F#, G, G#, A, A#, B.
  const tonicName = NOTE_NAMES[pc];
  return { tonicName, mode };
}

/**
 * Convertit un chiffre romain en index 0-6 (grades I-VII).
 * Retourne null si le texte commence par une altération (bémol/dièse) ou si
 * aucun chiffre romain valide n'est trouvé en tête. Les suffixes (7, °, dim...)
 * sont ignorés.
 * @param {string} impliedRomanNumeral
 * @returns {number|null}
 */
export function romanNumeralToDegreeIndex(impliedRomanNumeral) {
  if (!impliedRomanNumeral || typeof impliedRomanNumeral !== 'string') return null;
  const text = String(impliedRomanNumeral).trim();

  // Degrés altérés (bVI, #IV...) volontairement ignorés : emprunts modaux
  // légitimes, hors périmètre de cette vérification.
  if (/^[b♭#♯]/.test(text)) return null;

  const match = text.match(/^([ivxIVX]+)/);
  if (!match) return null;
  const roman = match[1].toUpperCase();
  const index = DEGREE_GRADES.indexOf(roman);
  return index === -1 ? null : index;
}

/**
 * Compare, pour chaque groupe d'accord, le degré et la tonalité annoncés avec
 * les notes réellement jouées. Ne compare que la fondamentale attendue du degré
 * diatonique (palier léger). Les degrés altérés sont ignorés.
 * @param {object[]} groups - sortie de groupNotesByTimeWindow
 * @returns {object[]}
 */
export function checkDegreeKeyAgreement(groups) {
  if (!Array.isArray(groups)) return [];
  const results = [];

  for (const group of groups) {
    if (!group.isChordLike) continue;

    // On exige que impliedRomanNumeral ET impliedKey soient présents sur la
    // MÊME note du groupe ; sinon c'est trop ambigu.
    const noteWithBoth = group.notes.find(
      (n) => n.impliedRomanNumeral && n.impliedKey
    );
    if (!noteWithBoth) continue;

    const parsedKey = parseImpliedKey(noteWithBoth.impliedKey);
    if (!parsedKey) continue;

    const degreeIndex = romanNumeralToDegreeIndex(noteWithBoth.impliedRomanNumeral);
    if (degreeIndex === null) continue;

    const keyData =
      parsedKey.mode === 'major'
        ? Key.majorKey(parsedKey.tonicName)
        : Key.minorKey(parsedKey.tonicName).natural;

    const expectedTriad = keyData.triads[degreeIndex];
    const expectedRootPc = extractChordRootPc(expectedTriad);
    if (expectedRootPc === null) continue;

    const detected = detectChord(group.notes.map((n) => n.midi));
    if (!detected || detected.symbol === '?') continue;

    let match = detected.rootPc === expectedRootPc;

    // Cas particulier : VII en mineur. Mineur naturel vs harmonique ont une
    // fondamentale différente pour le 7ème degré (bVII vs vii°) ; les deux sont
    // légitimes. On accepte si l'une ou l'autre correspond.
    if (!match && parsedKey.mode === 'minor' && degreeIndex === 6) {
      const harmonicTriad = Key.minorKey(parsedKey.tonicName).harmonic.triads[6];
      const harmonicRootPc = extractChordRootPc(harmonicTriad);
      if (harmonicRootPc !== null) {
        match = detected.rootPc === harmonicRootPc;
      }
    }

    results.push({
      group,
      impliedRomanNumeral: noteWithBoth.impliedRomanNumeral,
      impliedKey: noteWithBoth.impliedKey,
      expectedTriad,
      expectedRootPc,
      detected,
      match,
    });
  }

  return results;
}

export function buildValidationLogPayload({ groups, extractedChordNames, extractedDegreeRefs }) {
  const enrichedGroups = Array.isArray(groups)
    ? groups.filter((g) =>
        g.notes.some(
          (n) => n.impliedChordName || n.impliedRomanNumeral || n.impliedKey
        )
      )
    : [];

  const hasTextSignal =
    (Array.isArray(extractedChordNames) && extractedChordNames.length > 0) ||
    (Array.isArray(extractedDegreeRefs) && extractedDegreeRefs.length > 0);

  if (enrichedGroups.length === 0 && !hasTextSignal) {
    return null;
  }

  return {
    enrichedGroups: enrichedGroups.map((g) => ({
      startOffsetMs: g.startOffsetMs,
      isChordLike: g.isChordLike,
      notes: g.notes.map((n) => ({
        midi: n.midi,
        name: n.name,
        impliedChordName: n.impliedChordName || undefined,
        impliedRomanNumeral: n.impliedRomanNumeral || undefined,
        impliedKey: n.impliedKey || undefined,
      })),
    })),
    extractedChordNames: extractedChordNames?.length ? extractedChordNames : undefined,
    extractedDegreeRefs: extractedDegreeRefs?.length ? extractedDegreeRefs : undefined,
  };
}
