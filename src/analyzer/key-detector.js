import { formatNote, noteNameToPc } from '../chord-engine/intervals.js';

// [OpenCode] — 2026-07-05 — Détecteur de tonalité par profils Krumhansl-Schmuckler
// combiné à une heuristique sur les accords joués.

// Profils Krumhansl-Kessler pour la corrélation tonale (12 degrés, Do = index 0)
const MAJOR_PROFILE = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const MINOR_PROFILE = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

const NOTE_NAMES_SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const NOTE_NAMES_FLAT = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

function rotate(arr, steps) {
  return arr.slice(steps).concat(arr.slice(0, steps));
}

function mean(arr) {
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function stdDev(arr, m) {
  return Math.sqrt(arr.reduce((sum, v) => sum + (v - m) ** 2, 0) / arr.length);
}

function correlation(a, b) {
  const ma = mean(a);
  const mb = mean(b);
  const sa = stdDev(a, ma);
  const sb = stdDev(b, mb);
  if (sa === 0 || sb === 0) return 0;
  return a.reduce((sum, av, i) => sum + (av - ma) * (b[i] - mb), 0) / (a.length * sa * sb);
}

function buildPcHistogram(events) {
  const hist = new Array(12).fill(0);
  if (!events || events.length === 0) return hist;

  // Accumule la durée pondérée par vélocité pour chaque pitch class.
  const active = new Map(); // note -> { time, velocity }
  for (const e of events) {
    if (e.type === 'note_on') {
      active.set(e.note, { time: e.time, velocity: e.velocity ?? 0.8 });
    } else if (e.type === 'note_off') {
      const start = active.get(e.note);
      if (start) {
        const duration = Math.max(0, e.time - start.time);
        const weight = duration * (0.5 + start.velocity * 0.5);
        hist[e.note % 12] += weight;
        active.delete(e.note);
      }
    }
  }

  // Notes encore actives à la fin : comptabilisées avec la durée restante.
  const lastTime = events[events.length - 1]?.time || 0;
  for (const [note, start] of active) {
    const duration = Math.max(0, lastTime - start.time);
    const weight = duration * (0.5 + start.velocity * 0.5);
    hist[note % 12] += weight;
  }

  return hist;
}

function detectByKrumhansl(hist) {
  const normalized = hist.map((v) => v / (Math.max(...hist) || 1));
  let bestScore = -Infinity;
  let best = null;

  for (let pc = 0; pc < 12; pc++) {
    const major = correlation(normalized, rotate(MAJOR_PROFILE, pc));
    const minor = correlation(normalized, rotate(MINOR_PROFILE, pc));
    if (major > bestScore) {
      bestScore = major;
      best = { pc, mode: 'major', score: major };
    }
    if (minor > bestScore) {
      bestScore = minor;
      best = { pc, mode: 'minor', score: minor };
    }
  }

  return best;
}

function chordRootPc(chord) {
  return typeof chord.rootPc === 'number' ? chord.rootPc : null;
}

function chordSymbol(chord) {
  return chord.symbol || '';
}

function isMinor(symbol) {
  return /^(m(?=\d|\/|add|sus|$)|min|mi(?=\d|\/|add|sus|$)|-)/i.test(symbol);
}

function isDominant(symbol) {
  if (!symbol || isMinor(symbol)) return false;
  return /^(7|9|13|dim|°)/i.test(symbol) || (/7/.test(symbol) && !/maj/i.test(symbol));
}

function isMajor(symbol) {
  return !isMinor(symbol) && !isDominant(symbol);
}

function degreeOf(rootPc, keyPc) {
  return (rootPc - keyPc + 12) % 12;
}

function chordScoreForKey(chords, keyPc, mode) {
  let score = 0;
  let count = 0;

  const degreeWeightsMajor = {
    0: 5, // I
    2: 1, // ii
    4: 2, // iii
    5: 3, // IV
    7: 4, // V
    9: 2, // vi
    11: 1, // vii°
  };

  const degreeWeightsMinor = {
    0: 5, // i
    2: 1, // ii°
    3: 2, // III
    5: 2, // iv
    7: 4, // V (harmonic)
    8: 2, // VI
    10: 1, // VII
  };

  const weights = mode === 'minor' ? degreeWeightsMinor : degreeWeightsMajor;

  for (const chord of chords) {
    const root = chordRootPc(chord);
    if (root == null) continue;
    const deg = degreeOf(root, keyPc);
    const weight = weights[deg] || 0;
    const symbol = chordSymbol(chord);
    const duration = chord.duration || 1;

    // Bonus pour les cadences typiques
    let cadenceBonus = 0;
    if (mode === 'major') {
      if (deg === 5 && isDominant(symbol)) cadenceBonus += 2;
      if (deg === 0 && isMajor(symbol)) cadenceBonus += 1.5;
      if (deg === 5 && isMajor(symbol)) cadenceBonus += 0.5; // V comme majeur
      if (deg === 9 && isMinor(symbol)) cadenceBonus += 1;
    } else {
      if (deg === 7 && isDominant(symbol)) cadenceBonus += 2; // V7 mineur harmonique
      if (deg === 0 && isMinor(symbol)) cadenceBonus += 1.5;
      if (deg === 5 && isMinor(symbol)) cadenceBonus += 0.5;
    }

    score += (weight + cadenceBonus) * duration;
    count += duration;
  }

  return count > 0 ? score / count : 0;
}

function keyName(pc, mode, useSharps = true, latin = false) {
  return formatNote(pc, useSharps, latin) + (mode === 'minor' ? 'm' : '');
}

export function computeKeyFromRawNotes(events, options = {}) {
  const hist = buildPcHistogram(events);
  const histTotal = hist.reduce((a, b) => a + b, 0);

  if (histTotal <= 0) return null;

  const krumhanslResult = detectByKrumhansl(hist);
  if (!krumhanslResult) return null;

  return {
    pc: krumhanslResult.pc,
    mode: krumhanslResult.mode,
    name: keyName(krumhanslResult.pc, krumhanslResult.mode, options.useSharps !== false, options.latin),
    confidence: Math.min(1, Math.max(0, krumhanslResult.score)),
    source: 'krumhansl-raw',
  };
}

/**
 * Retourne tous les candidats tonals (24 combinaisons pc × mode) triés par
 * score Krumhansl-Kessler décroissant. Utilisé par le contexte tonal pour
 * conserver les alternatives et permettre la sélection/correction manuelle.
 *
 * @param {Array<{time:number, type:string, note?:number, velocity?:number}>} events
 * @param {object} [options]
 * @param {boolean} [options.useSharps]
 * @param {boolean} [options.latin]
 * @returns {Array<{pc:number, mode:string, name:string, score:number, confidence:number}>}
 */
export function computeKeyCandidatesFromRawNotes(events, options = {}) {
  const hist = buildPcHistogram(events);
  const histTotal = hist.reduce((a, b) => a + b, 0);

  if (histTotal <= 0) return [];

  const normalized = hist.map((v) => v / (Math.max(...hist) || 1));
  const candidates = [];

  for (let pc = 0; pc < 12; pc++) {
    const majorScore = correlation(normalized, rotate(MAJOR_PROFILE, pc));
    const minorScore = correlation(normalized, rotate(MINOR_PROFILE, pc));
    candidates.push({
      pc,
      mode: 'major',
      name: keyName(pc, 'major', options.useSharps !== false, options.latin),
      score: majorScore,
      confidence: Math.min(1, Math.max(0, majorScore)),
    });
    candidates.push({
      pc,
      mode: 'minor',
      name: keyName(pc, 'minor', options.useSharps !== false, options.latin),
      score: minorScore,
      confidence: Math.min(1, Math.max(0, minorScore)),
    });
  }

  candidates.sort((a, b) => b.score - a.score);
  return candidates;
}

export function detectKey(events, chords, options = {}) {
  const hist = buildPcHistogram(events);
  const histTotal = hist.reduce((a, b) => a + b, 0);

  let krumhanslResult = null;
  if (histTotal > 0) {
    krumhanslResult = detectByKrumhansl(hist);
  }

  // Si peu de données ou histogramme plat, on se base sur les accords.
  if (chords && chords.length > 0) {
    let bestScore = -Infinity;
    let best = krumhanslResult || { pc: 0, mode: 'major', score: 0 };

    for (let pc = 0; pc < 12; pc++) {
      for (const mode of ['major', 'minor']) {
        const score = chordScoreForKey(chords, pc, mode);
        if (score > bestScore) {
          bestScore = score;
          best = { pc, mode, score };
        }
      }
    }

    // Si Krumhansl donne une relative mineure/majeure proche du score d'accords,
    // on privilégie l'accordique car plus fiable sur du jazz/gospel court.
    if (krumhanslResult) {
      const relativePc = (krumhanslResult.pc + (krumhanslResult.mode === 'major' ? 9 : 3)) % 12;
      const relativeMode = krumhanslResult.mode === 'major' ? 'minor' : 'major';
      const chordScoreKrumhansl = chordScoreForKey(chords, krumhanslResult.pc, krumhanslResult.mode);
      const chordScoreRelative = chordScoreForKey(chords, relativePc, relativeMode);

      if (chordScoreRelative > chordScoreKrumhansl * 1.15) {
        best = { pc: relativePc, mode: relativeMode, score: chordScoreRelative };
      } else if (chordScoreKrumhansl > (best.score || 0)) {
        best = { pc: krumhanslResult.pc, mode: krumhanslResult.mode, score: chordScoreKrumhansl };
      }
    }

    return {
      pc: best.pc,
      mode: best.mode,
      name: keyName(best.pc, best.mode, options.useSharps !== false, options.latin),
      confidence: Math.min(1, Math.max(0, best.score / 6)),
      source: 'chords+krumhansl',
    };
  }

  if (krumhanslResult) {
    return {
      pc: krumhanslResult.pc,
      mode: krumhanslResult.mode,
      name: keyName(krumhanslResult.pc, krumhanslResult.mode, options.useSharps !== false, options.latin),
      confidence: Math.min(1, Math.max(0, krumhanslResult.score)),
      source: 'krumhansl',
    };
  }

  return null;
}

export function parseKeyInput(key) {
  if (!key) return null;
  const normalized = String(key).trim();
  const match = normalized.match(/^([A-Ga-g][#b]?)(m?)$/);
  if (!match) return null;
  const pc = noteNameToPc(match[1]);
  if (pc == null) return null;
  const mode = match[2] === 'm' ? 'minor' : 'major';
  return { pc, mode, name: `${formatNote(pc, true, false)}${mode === 'minor' ? 'm' : ''}` };
}
