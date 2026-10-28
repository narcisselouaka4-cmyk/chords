// [Claude] — 2026-09-08 — Copilot IA : fonctions de validation musicale.
//
// Module pur, sans effet de bord : aucun appel réseau, aucun accès DOM. Il
// consomme le moteur d'accords existant pour comparer les notes jouées avec
// le nom d'accord annoncé (sous-chantier 3.3).

import { detectChord } from '../chord-engine/index.js';
import { formatPc } from '../chord-engine/naming.js';
import { noteNameToPc, latinNoteNameToPc, NOTE_NAMES, formatNote } from '../chord-engine/intervals.js';
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

  // Abréviation anglo-saxonne collée : Am, Dm, Gm (tonique + m terminal).
  if (!mode) {
    const m = lower.match(/^(do|ré|re|mi|fa|sol|la|si|[a-g])(?:#|♯|b|♭)?m$/);
    if (m) {
      mode = 'minor';
      modeIndex = lower.length - 1;
      modeWordLength = 1;
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

const KEY_NAME = "(?:Do|Ré|Re|Mi|Fa|Sol|La|Si|[A-Ga-g])(?:#|♯|b|♭)?\\s*(?:majeur|mineur|major|minor|m)?";
const KEY_AFFIRMATION_PATTERNS = [
  // "la tonalité est X", "la tonalité de ce morceau : X", "tonalité : X"
  new RegExp(`(?:tonalit[ée]s?|cl[ée]|key)\\s*(?:est|était|serait|sont|étaient|seraient)?\\s*[:\\-]?\\s*(?:de|en|d['’])?\\s*(${KEY_NAME})`, 'gi'),
  // "on est en X", "c'est en X", "joué en X", "composé en X"
  new RegExp(`\\b(?:est|sont|jou[eé]|compos[ée]|travaill[ée]|on\\s+est|c'est)\\s+(?:écrit\\s+)?en\\s*(${KEY_NAME})`, 'gi'),
  // "en X majeur/mineur" (catch-all en fin, après les motifs plus spécifiques)
  new RegExp(`\\ben\\s+(${KEY_NAME})`, 'gi'),
];

/**
 * Extrait les tonalités affirmées dans un texte de réponse du modèle.
 * Retourne un tableau d'objets { keyName, pc, mode } uniques.
 *
 * @param {string} text
 * @returns {{keyName: string, pc: number, mode: 'major'|'minor'}[]}
 */
export function extractAffirmedKeys(text) {
  if (!text || typeof text !== 'string') return [];
  const found = new Map();

  for (const re of KEY_AFFIRMATION_PATTERNS) {
    let m;
    while ((m = re.exec(text)) !== null) {
      const raw = String(m[1] || '').trim();
      const parsed = parseImpliedKey(raw);
      if (!parsed) continue;
      const pc = noteNameToPc(parsed.tonicName);
      const keyName = formatNote(pc, true, true);
      const uid = `${parsed.tonicName}-${parsed.mode}`;
      if (!found.has(uid)) {
        found.set(uid, { keyName, pc, mode: parsed.mode });
      }
    }
  }

  return Array.from(found.values());
}

/**
 * Vérifie que les tonalités affirmées dans la réponse du modèle ne contredisent
 * pas la tonalité déjà calculée par l'application. Retourne les désaccords avec
 * une suggestion de correction textuelle.
 *
 * @param {string} text - contenu de la réponse du modèle
 * @param {string} expectedKey - tonalité attendue (ex. "Do majeur", "C major", "Dm")
 * @returns {{match: boolean, affirmedKey: string, expectedKey: string, correction: string}[]}
 */
export function checkKeyAffirmation(text, expectedKey) {
  const parsedExpected = parseImpliedKey(expectedKey);
  if (!parsedExpected) return [];

  const affirmed = extractAffirmedKeys(text);
  if (affirmed.length === 0) return [];

  const expectedPc = noteNameToPc(parsedExpected.tonicName);
  const expectedName = `${formatNote(expectedPc, true, true)}${parsedExpected.mode === 'minor' ? 'm' : ''}`;
  const results = [];

  for (const item of affirmed) {
    const match = item.pc === expectedPc && item.mode === parsedExpected.mode;
    const correction = match
      ? ''
      : `La tonalité détectée par l'application est **${expectedName}**, pas **${item.keyName}**. Si tu veux explorer l'hypothèse ${item.keyName}, précise que c'est un 'raisonnement comme si', sans remettre en cause l'analyse initiale.`;
    results.push({
      match,
      affirmedKey: item.keyName,
      expectedKey: expectedName,
      correction,
    });
  }

  return results;
}

const LH_ROOT_PATTERNS = [
  /fondamentale\s+(?:à la basse|en main gauche|à la main gauche|à gauche|en bas)/gi,
  /(?:la|une)?\s*fondamentale\s+(?:est\s+)?(?:à la basse|en main gauche|à la main gauche|à gauche)/gi,
];

const RH_ROOT_PATTERNS = [
  /fondamentale\s+(?:en main droite|à la main droite|à droite|en haut)/gi,
];

const ROOTLESS_PATTERNS = [
  /\brootless\b/gi,
  /sans\s+fondamentale/gi,
  /fondamentale\s+absente/gi,
];

/**
 * Compare les affirmations textuelles sur la répartition main gauche/main droite
 * d'un voicing avec la réalité calculée par le moteur.
 *
 * @param {string} text - contenu de la réponse du modèle
 * @param {object} voicing - voicing réel généré ({ leftHand: number[], rightHand: number[], technique: string })
 * @param {string} chordSymbol - symbole d'accord (ex. "Cmaj7")
 * @returns {{match: boolean, claim: string, expected: string, actual: string, correction: string}[]}
 */
export function checkVoicingDescriptionAgreement(text, voicing, chordSymbol) {
  if (!text || typeof text !== 'string' || !voicing || !chordSymbol) return [];
  const rootPc = extractChordRootPc(chordSymbol);
  if (rootPc === null) return [];

  const lhPcs = new Set((voicing.leftHand || []).map((n) => n % 12));
  const rhPcs = new Set((voicing.rightHand || []).map((n) => n % 12));
  const rootInLh = lhPcs.has(rootPc);
  const rootInRh = rhPcs.has(rootPc);

  const formatHand = (hand) => (hand || []).map((n) => formatNote(n % 12, true, true)).join(', ') || '—';
  const rootName = formatNote(rootPc, true, true);
  const lhText = formatHand(voicing.leftHand);
  const rhText = formatHand(voicing.rightHand);

  const results = [];

  for (const re of LH_ROOT_PATTERNS) {
    let m;
    while ((m = re.exec(text)) !== null) {
      const claim = m[0];
      const match = rootInLh;
      results.push({
        match,
        claim,
        expected: `${rootName} à la main gauche`,
        actual: rootInLh ? `${rootName} à la main gauche` : `${rootName} absente de la main gauche (LH: ${lhText})`,
        correction: match
          ? ''
          : `Précision : dans ce voicing, la main gauche joue réellement [${lhText}], sans la fondamentale ${rootName}. La main droite joue [${rhText}]. Adapte ta description en conséquence.`,
      });
    }
  }

  for (const re of RH_ROOT_PATTERNS) {
    let m;
    while ((m = re.exec(text)) !== null) {
      const claim = m[0];
      const match = rootInRh;
      results.push({
        match,
        claim,
        expected: `${rootName} à la main droite`,
        actual: rootInRh ? `${rootName} à la main droite` : `${rootName} absente de la main droite (RH: ${rhText})`,
        correction: match
          ? ''
          : `Précision : dans ce voicing, la main droite joue réellement [${rhText}], sans la fondamentale ${rootName}. La main gauche joue [${lhText}]. Adapte ta description en conséquence.`,
      });
    }
  }

  for (const re of ROOTLESS_PATTERNS) {
    let m;
    while ((m = re.exec(text)) !== null) {
      const claim = m[0];
      // Un voicing rootless ne doit PAS avoir la fondamentale à la basse (main gauche).
      const match = !rootInLh;
      results.push({
        match,
        claim,
        expected: 'fondamentale absente de la main gauche',
        actual: rootInLh ? `fondamentale ${rootName} présente à la main gauche (LH: ${lhText})` : 'fondamentale absente de la main gauche',
        correction: match
          ? ''
          : `Précision : ce n'est pas un voicing rootless car la main gauche joue la fondamentale ${rootName} ([${lhText}]). La répartition réelle est LH [${lhText}], RH [${rhText}]. Adapte ta description en conséquence.`,
      });
    }
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
