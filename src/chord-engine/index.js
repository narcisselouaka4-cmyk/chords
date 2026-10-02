// [OpenCode] — 2026-07-03 — Module moteur harmonique avancé (rootless, quartal, etc.)
import { CHORD_DEFINITIONS, ROOTLESS_DEFINITIONS, DETECTION_DEFINITIONS } from './chord-defs.js';

import { formatNote } from './intervals.js';

// [OpenCode] — 2026-07-03 — Upper structure triads detection
// Given a detected chord, look for a complete triad formed by the upper notes
// whose root is different from the chord root. Common in jazz (e.g. D major over C7).
const UPPER_STRUCTURE_TRIADS = [
  { name: 'Major', symbol: '', intervals: [0, 4, 7] },
  { name: 'Minor', symbol: 'm', intervals: [0, 3, 7] },
  { name: 'Augmented', symbol: 'aug', intervals: [0, 4, 8] },
  { name: 'Diminished', symbol: 'dim', intervals: [0, 3, 6] },
];

function findUpperStructure(pcSet, rootPc, notes) {
  // Exclude the root from the upper notes search
  const upperPcs = notes.filter((pc) => pc !== rootPc);
  if (upperPcs.length < 3) return null;

  for (const triad of UPPER_STRUCTURE_TRIADS) {
    for (let triadRoot = 0; triadRoot < 12; triadRoot++) {
      if (triadRoot === rootPc) continue;
      const triadPcs = triad.intervals.map((i) => (triadRoot + i) % 12);
      if (triadPcs.every((pc) => upperPcs.includes(pc))) {
        return { rootPc: triadRoot, triad };
      }
    }
  }
  return null;
}

// [OpenCode] — 2026-07-03 — Polychord detection
// A polychord is the superposition of two distinct triads.
function findPolychord(pcSet) {
  const foundTriads = [];
  for (const triad of UPPER_STRUCTURE_TRIADS) {
    for (let root = 0; root < 12; root++) {
      const triadPcs = triad.intervals.map((i) => (root + i) % 12);
      if (triadPcs.every((pc) => pcSet.has(pc))) {
        foundTriads.push({ rootPc: root, triad });
      }
    }
  }
  // Look for pairs of triads with different roots and minimal overlap
  for (let i = 0; i < foundTriads.length; i++) {
    for (let j = i + 1; j < foundTriads.length; j++) {
      const a = foundTriads[i];
      const b = foundTriads[j];
      if (a.rootPc === b.rootPc) continue;
      const setA = new Set(a.triad.intervals.map((i) => (a.rootPc + i) % 12));
      const setB = new Set(b.triad.intervals.map((i) => (b.rootPc + i) % 12));
      const overlap = [...setA].filter((pc) => setB.has(pc)).length;
      if (overlap === 0) {
        return { lower: a, upper: b };
      }
    }
  }
  return null;
}

function setEquals(a, b) {
  if (a.size !== b.size) return false;
  for (const x of a) {
    if (!b.has(x)) return false;
  }
  return true;
}

function isSubset(subset, superset) {
  for (const x of subset) {
    if (!superset.has(x)) return false;
  }
  return true;
}

function buildPcSet(root, intervals) {
  return new Set(intervals.map((i) => (root + i) % 12));
}

const pcOf = (n) => ((n % 12) + 12) % 12;

// [Claude] — 2026-10-02 — Renversement lu sur la VRAIE basse. Avant, la fonction
// recevait les classes de notes triées de Do à Si et prenait la première pour la
// basse : Si♭7 joué en position fondamentale était annoncé « 1ère inversion »,
// C7/E « position fondamentale ». Basse étrangère à l'accord : 0.
function findInversionIndex(bassPc, root, intervals) {
  const idx = intervals.findIndex((i) => (root + i) % 12 === bassPc);
  return idx === -1 ? 0 : idx;
}

// [OpenCode] — 2026-07-03 — Rootless voicings detection
const MIN_ROOTLESS_NOTES = 3;

// [OpenCode] — 2026-07-03 — Dedicated rootless definitions using explicit parent chord tones
// [Claude] — 2026-10-02 — La basse est passée par l'appelant (la note la plus grave
// jouée), plus la plus petite classe de note.
function findRootlessMatches(pcSet, uniquePcs, bassPc = uniquePcs[0]) {
  const matches = [];
  // [OpenCode] — 2026-07-03 — Rootless requires at least 3 notes and no more than the voicing size
  if (uniquePcs.length < MIN_ROOTLESS_NOTES) return matches;

  const sortedPlayed = [...uniquePcs].sort((a, b) => a - b);

  for (const def of ROOTLESS_DEFINITIONS) {
    if (sortedPlayed.length !== def.intervals.length) continue;

    // Try every possible implied root
    for (let impliedRoot = 0; impliedRoot < 12; impliedRoot++) {
      // The root must not be present in the played notes
      if (pcSet.has(impliedRoot)) continue;

      const rootlessRequired = def.intervals.map((i) => (impliedRoot + i) % 12);
      const sortedRequired = [...rootlessRequired].sort((a, b) => a - b);

      if (!sortedPlayed.every((pc, idx) => pc === sortedRequired[idx])) continue;

      // Determine bass note info relative to the parent chord intervals (root included)
      const parentIntervals = [0, ...def.intervals];
      const inversion = parentIntervals.findIndex((i) => (impliedRoot + i) % 12 === bassPc);

      matches.push({
        rootPc: impliedRoot,
        def,
        bassPc,
        inversion: inversion === -1 ? 0 : inversion,
        confidence: 1.0,
      });
    }
  }
  return matches;
}

// [OpenCode] — 2026-07-06 — Classifieur pur de voicing, réutilisable pour le jeu live et les suggestions.
// Même tableau de notes MIDI en entrée → même résultat en sortie.
// [Claude] — 2026-10-02 — Lu sur l'écart RÉEL des touches, plus sur les classes de
// notes (Do…Si) : un Cmaj7 serré était annoncé « Open voicing », un C7♯9 étalé sur
// deux octaves « Cluster ». Le Temps réel affiche, lui, le classifieur complet de
// src/voicing-engine/voicing-classifier.js (drop 2, rootless, upper structure…).
export function classifyVoicing(midiNotes) {
  if (!Array.isArray(midiNotes) || midiNotes.length === 0) {
    return { topNote: null, voicingType: '—', inversion: 0, bassPc: null };
  }

  const sortedNotes = [...new Set(midiNotes)].sort((a, b) => a - b);
  const topNote = sortedNotes[sortedNotes.length - 1];
  const bassMidi = sortedNotes[0];
  const bassPc = pcOf(bassMidi);
  const uniquePcs = new Set(sortedNotes.map(pcOf));

  if (uniquePcs.size < 2) {
    return { topNote, voicingType: 'single', inversion: 0, bassPc };
  }

  const span = topNote - bassMidi;
  const gaps = sortedNotes.slice(1).map((n, i) => n - sortedNotes[i]);
  let voicingType;
  if (sortedNotes.length === 2) {
    voicingType = [3, 4, 10, 11].includes(span % 12) ? 'shell' : span <= 12 ? 'close' : 'open';
  } else if (gaps.includes(1)) {
    voicingType = 'cluster'; // seconde mineure entre deux touches voisines
  } else if (span <= 12) {
    voicingType = 'close';
  } else if (span > 24) {
    voicingType = 'spread';
  } else {
    voicingType = 'open';
  }

  return { topNote, voicingType, inversion: 0, bassPc };
}

// [Claude] — 2026-10-02 — Bibliothèque d'accords du Temps réel, revue avec Narcisse
// (« je ne suis pas sûr que tout est bon »). Audit sur 73 voicings jazz : 71 % de
// lectures justes. L'ancien comparateur exigeait TOUTES les notes d'une définition
// (la 11e d'un 13 compris, que le jazz omet : C13 lu « C9 », Do–Si♭–Mi–La lu
// « Am/C ») et acceptait des notes en trop sans les nommer (Cmaj7♯11 lu « Cmaj7 »).
// Désormais :
//   - une définition se compare sur ses notes obligatoires ; ses optionalIntervals
//     (quinte, 9e et 11e des 13e…) peuvent manquer, avec une petite pénalité ;
//   - une lecture exacte (toutes les notes jouées sont dans l'accord) l'emporte,
//     fondamentale à la basse d'abord ; une note étrangère coûte cher, deux font « ? » ;
//   - la définition « note seule » ne nomme plus un amas de trois notes (C–C♯–D
//     s'affichait « C », comme un accord majeur).
const MATCH_DEFINITIONS = [
  ...CHORD_DEFINITIONS.filter((d) => !d.parentSymbol && d.intervals.length >= 3),
  ...DETECTION_DEFINITIONS,
];
const SMALL_DEFINITIONS = CHORD_DEFINITIONS.filter((d) => !d.parentSymbol && d.intervals.length < 3);

function requiredIntervals(def) {
  const optional = new Set(def.optionalIntervals || []);
  return def.intervals.filter((i) => !optional.has(i));
}

/** Score d'une lecture (fondamentale, définition) des notes jouées, ou null. */
function scoreReading(rootPc, def, pcSet, bassPc) {
  const required = buildPcSet(rootPc, requiredIntervals(def));
  if (!isSubset(required, pcSet)) return null;
  const tones = buildPcSet(rootPc, def.intervals);
  let present = 0;
  for (const pc of tones) if (pcSet.has(pc)) present += 1;
  const extras = [];
  for (const pc of pcSet) if (!tones.has(pc)) extras.push(pc);
  const exact = extras.length === 0;
  const omitted = tones.size - present;
  let score = present * 10 - omitted * 4 - extras.length * 25;
  if (exact) score += 20;
  if (rootPc === bassPc) score += exact ? 15 : 5;
  // Onzte juste qui sonne avec une tierce majeure : la « note à éviter » du jazz.
  // Une telle lecture est rarement la bonne : Sol Si Do Mi est Cmaj7/G, pas
  // G6add11 sans quinte (règle qui remplace l'exception codée en dur d'avant).
  if (pcSet.has((rootPc + 4) % 12) && pcSet.has((rootPc + 5) % 12) && def.intervals.some((i) => i % 12 === 5)) score -= 12;
  return { rootPc, def, score, exact, present, omitted, extras };
}

/** Toutes les lectures possibles, de la meilleure à la moins bonne. */
function rankReadings(pcSet, uniquePcs, bassPc, definitions) {
  const readings = [];
  for (const rootPc of uniquePcs) {
    for (const def of definitions) {
      const reading = scoreReading(rootPc, def, pcSet, bassPc);
      if (reading) readings.push(reading);
    }
  }
  // À score égal : moins de notes omises, puis la définition la plus riche, puis
  // l'ordre de la table (le plus jazz d'abord).
  return readings.sort((a, b) => b.score - a.score || a.omitted - b.omitted || b.def.intervals.length - a.def.intervals.length);
}

function readingResult(reading, sortedNotes, bassPc, voicing) {
  const { rootPc, def, exact, extras, omitted } = reading;
  const result = {
    rootPc,
    symbol: def.symbol,
    fullName: def.name,
    intervals: def.intervals,
    notes: sortedNotes,
    bassPc,
    inversion: findInversionIndex(bassPc, rootPc, def.intervals),
    isSlash: bassPc !== rootPc,
    missing: (def.optionalIntervals || []).filter((i) => !sortedNotes.some((n) => pcOf(n) === (rootPc + i) % 12)),
    confidence: exact ? 1.0 : reading.present / (reading.present + extras.length),
    rootless: false,
    voicing,
  };
  if (extras.length) result.extraPcs = extras;
  if (omitted) result.omittedIntervals = result.missing;
  return result;
}

function unknownResult(sortedNotes, bassPc, voicing) {
  return {
    rootPc: bassPc,
    symbol: '?',
    fullName: 'Accord non identifié',
    intervals: [0],
    notes: sortedNotes,
    bassPc,
    inversion: 0,
    isSlash: false,
    missing: [],
    confidence: 0,
    rootless: false,
    voicing,
  };
}

function rootlessResult(match, sortedNotes, voicing) {
  const { rootPc, def, bassPc, inversion, confidence } = match;
  return {
    rootPc,
    symbol: def.symbol,
    fullName: `${def.name} (rootless)`,
    intervals: [0, ...def.intervals],
    notes: sortedNotes,
    bassPc,
    inversion,
    isSlash: bassPc !== rootPc,
    missing: [0],
    confidence,
    rootless: true,
    voicing,
  };
}

export function detectChord(activeNotes) {
  if (!activeNotes || activeNotes.length === 0) return null;

  const sortedNotes = [...activeNotes].sort((a, b) => a - b);
  const bassPc = pcOf(sortedNotes[0]);
  const uniquePcs = Array.from(new Set(sortedNotes.map(pcOf))).sort((a, b) => a - b);
  const pcSet = new Set(uniquePcs);
  const voicing = classifyVoicing(sortedNotes).voicingType;

  // Une ou deux notes : note seule, quinte à vide, ou la basse nommée seule (le Temps
  // réel affiche alors l'intervalle). Comportement inchangé pour les autres modules.
  if (uniquePcs.length < 3) {
    const small = rankReadings(pcSet, uniquePcs, bassPc, SMALL_DEFINITIONS);
    return small.length ? readingResult(small[0], sortedNotes, bassPc, voicing) : unknownResult(sortedNotes, bassPc, voicing);
  }

  const readings = rankReadings(pcSet, uniquePcs, bassPc, MATCH_DEFINITIONS);
  const best = readings[0] || null;
  // Une note étrangère à l'accord se tolère (elle est rendue dans extraPcs) ;
  // au-delà, mieux vaut dire « ? » que nommer un accord qui ne s'entend pas.
  const acceptable = best && (best.exact || (best.extras.length === 1 && best.present >= 3));
  // Deux triades sans note commune (Ré majeur sur Do majeur) se nomment en
  // polyaccord plutôt qu'en slash à notes manquantes (« Am13/C » sans Si).
  const weakSlash = acceptable && best.rootPc !== bassPc && best.omitted > 0;

  if (!acceptable || (weakSlash && findPolychord(pcSet))) {
    // Ni lecture exacte ni presque exacte : voicing sans fondamentale ?
    const rootless = acceptable ? null : findRootlessMatches(pcSet, uniquePcs, bassPc)
      .sort((a, b) => b.def.intervals.length - a.def.intervals.length)[0];
    if (rootless) return rootlessResult(rootless, sortedNotes, voicing);
    // [OpenCode] — 2026-07-03 — Polychord detection : deux triades sans note commune.
    const poly = findPolychord(pcSet);
    if (poly) {
      const { lower, upper } = poly;
      return {
        rootPc: lower.rootPc,
        symbol: upper.triad.symbol,
        fullName: `${lower.triad.name} / ${upper.triad.name} polychord`,
        intervals: [...lower.triad.intervals, ...upper.triad.intervals.map((i) => i + 12)],
        notes: sortedNotes,
        bassPc,
        inversion: 0,
        isSlash: true,
        missing: [],
        confidence: 1.0,
        rootless: false,
        polychord: { lower, upper },
        voicing,
      };
    }
    return unknownResult(sortedNotes, bassPc, voicing);
  }

  const bestMatch = readingResult(best, sortedNotes, bassPc, voicing);

  // [OpenCode] — 2026-07-03 — Rootless post-processing : E-G-B-D au-dessus d'une
  // triade parfaite, quatre notes ou plus… Une triade fondamentale complète reste
  // une triade (C-E-G est C majeur, pas Am7 sans fondamentale).
  if (best.def.intervals.length === 3 && !best.exact && uniquePcs.length > 3) {
    const richer = findRootlessMatches(pcSet, uniquePcs, bassPc).find((m) => m.def.intervals.length >= 3);
    if (richer) return rootlessResult(richer, sortedNotes, voicing);
  }

  // [OpenCode] — 2026-07-03 — Upper structure enrichment
  // When a standard chord contains a 7th or 9th/11th/13th, see if the upper notes also form
  // a complete triad whose root differs from the chord root. If so, enrich the result.
  if (bestMatch.intervals.some((i) => [10, 11, 14, 17, 18, 20, 21].includes(i))) {
    const upper = findUpperStructure(pcSet, bestMatch.rootPc, uniquePcs);
    if (upper) {
      bestMatch.upperStructure = upper;
      bestMatch.fullName = `${bestMatch.fullName} (upper: ${upper.triad.name} ${formatNote(upper.rootPc)})`;
    }
  }

  return bestMatch;
}

/**
 * [Claude] — 2026-10-02 — Les AUTRES lectures exactes des mêmes notes (« Aussi » du
 * Temps réel) : C6 → Am7/C, Cm7 → E♭6/C, Cdim7 → E♭dim7/C…, F La Si Mi → G13
 * sans fondamentale. Remplacent les alias figés de voicing.js. La lecture que
 * detectChord retient est en tête quand elle est exacte.
 * @param {number[]} activeNotes - MIDI
 * @returns {{rootPc: number, symbol: string, bassPc: number, isSlash: boolean, rootless: boolean}[]}
 */
export function chordReadings(activeNotes) {
  if (!activeNotes || activeNotes.length === 0) return [];
  const sortedNotes = [...activeNotes].sort((a, b) => a - b);
  const bassPc = pcOf(sortedNotes[0]);
  const uniquePcs = Array.from(new Set(sortedNotes.map(pcOf))).sort((a, b) => a - b);
  if (uniquePcs.length < 3) return [];
  const pcSet = new Set(uniquePcs);
  const out = [];
  const seen = new Set();
  const push = (rootPc, symbol, rootless) => {
    const key = `${rootPc}:${symbol}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ rootPc, symbol, bassPc, isSlash: bassPc !== rootPc, rootless });
  };
  // Lectures exactes à une note omise au plus : « Gmaj13/C » (sans Ré ni La) pour
  // Cmaj7♯11 n'aide personne. Sans fondamentale : à partir de quatre notes (une
  // triade de Ré n'est pas « Bm7 sans fondamentale »).
  for (const reading of rankReadings(pcSet, uniquePcs, bassPc, MATCH_DEFINITIONS)) {
    if (reading.exact && reading.omitted <= 1) push(reading.rootPc, reading.def.symbol, false);
  }
  if (uniquePcs.length >= 4) {
    for (const match of findRootlessMatches(pcSet, uniquePcs, bassPc)) push(match.rootPc, match.def.symbol, true);
  }
  return out;
}
