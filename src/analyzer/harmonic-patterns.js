// [Claude] — 2026-07-07 — Détection des patterns harmoniques : degrés, cadences, II-V-I,
// turnarounds et substitutions. Utilisé par l'analyseur de session pour enrichir le rapport pédagogique.

import {
  degreeName,
  degreeOf,
  isDominantSymbol,
  isMajorSymbol,
  isMinorSymbol,
  formatChordBrief,
} from './harmonic-utils.js';

export function enrichChordsWithDegrees(chords, key) {
  if (!key || chords.length === 0) return chords;

  return chords.map((chord) => {
    const degree = degreeName(chord.rootPc, key.pc, key.mode);
    const functionType = isDominantSymbol(chord.symbol)
      ? 'dominant'
      : isMinorSymbol(chord.symbol)
        ? 'minor'
        : 'major';
    return { ...chord, degree, functionType };
  });
}

export function detectII_V_I(chords, key) {
  if (!key || chords.length < 3) return [];

  const patterns = [];
  for (let i = 0; i <= chords.length - 3; i++) {
    const a = chords[i];
    const b = chords[i + 1];
    const c = chords[i + 2];

    // Degrés attendus : II -> V -> I (ou ii -> V7 -> Imaj7)
    const degA = degreeOf(a.rootPc, key.pc);
    const degB = degreeOf(b.rootPc, key.pc);
    const degC = degreeOf(c.rootPc, key.pc);

    const isII = degA === 2 && isMinorSymbol(a.symbol);
    const isV = degB === 7 && isDominantSymbol(b.symbol);
    const isI = degC === 0 && isMajorSymbol(c.symbol);

    if (isII && isV && isI) {
      patterns.push({
        type: 'ii-v-i',
        startIndex: i,
        endIndex: i + 2,
        chords: [a, b, c],
        description: `${formatChordBrief(a)} → ${formatChordBrief(b)} → ${formatChordBrief(c)} forme un II-V-I en ${key.name}.`,
      });
    }
  }
  return patterns;
}

export function detectCadences(chords, key) {
  if (!key || chords.length < 2) return [];

  const cadences = [];
  for (let i = 0; i < chords.length - 1; i++) {
    const a = chords[i];
    const b = chords[i + 1];
    const degA = degreeOf(a.rootPc, key.pc);
    const degB = degreeOf(b.rootPc, key.pc);

    // Cadence parfaite : V -> I (dominant -> majeur)
    if (degA === 7 && isDominantSymbol(a.symbol) && degB === 0 && isMajorSymbol(b.symbol)) {
      cadences.push({
        type: 'perfect',
        label: 'Cadence parfaite',
        startIndex: i,
        endIndex: i + 1,
        description: `Résolution classique V → I en ${key.name}.`,
      });
      continue;
    }

    // Cadence plagale : IV -> I
    if (degA === 5 && isMajorSymbol(a.symbol) && degB === 0 && isMajorSymbol(b.symbol)) {
      cadences.push({
        type: 'plagal',
        label: 'Cadence plagale',
        startIndex: i,
        endIndex: i + 1,
        description: `Mouvement IV → I, typique du gospel et de la louange.`,
      });
      continue;
    }

    // Cadence demi : X -> V (se termine sur la dominante)
    if (degB === 7 && isDominantSymbol(b.symbol)) {
      cadences.push({
        type: 'half',
        label: 'Demi-cadence',
        startIndex: i,
        endIndex: i + 1,
        description: `Phrase se terminant sur la dominante (V), créant une tension à résoudre.`,
      });
      continue;
    }

    // Cadence rompue / déceptive : V -> vi
    if (degA === 7 && isDominantSymbol(a.symbol) && degB === 9) {
      cadences.push({
        type: 'deceptive',
        label: 'Cadence rompue',
        startIndex: i,
        endIndex: i + 1,
        description: `V → vi : la dominante ne résout pas comme attendu, effet suspendu.`,
      });
    }
  }
  return cadences;
}

export function detectTurnarounds(chords, key) {
  if (!key || chords.length < 4) return [];

  const turnarounds = [];
  // Patterns classiques de turnaround :
  // I - VI - II - V  (degrés 0, 9, 2, 7)
  // III - VI - II - V (degrés 4, 9, 2, 7)
  const candidates = [
    [0, 9, 2, 7],
    [4, 9, 2, 7],
  ];

  for (let i = 0; i <= chords.length - 4; i++) {
    const seq = chords.slice(i, i + 4);
    const degrees = seq.map((c) => degreeOf(c.rootPc, key.pc));

    for (const pattern of candidates) {
      if (pattern.every((deg, idx) => degrees[idx] === deg)) {
        turnarounds.push({
          type: 'turnaround',
          startIndex: i,
          endIndex: i + 3,
          chords: seq,
          description: `Turnaround ${formatDegree(pattern[0])} - ${formatDegree(pattern[1])} - ${formatDegree(pattern[2])} - ${formatDegree(pattern[3])} vers la tonique de ${key.name}.`,
        });
        break;
      }
    }
  }
  return turnarounds;
}

function formatDegree(degree) {
  const DEGREE_NAMES_MAJOR = ['I', 'ii', 'iii', 'IV', 'V', 'vi', 'vii°'];
  return DEGREE_NAMES_MAJOR[degree] || String(degree);
}

export function detectCommonSubstitutions(chords, key) {
  if (!key || chords.length < 2) return [];

  const subs = [];
  for (let i = 0; i < chords.length - 1; i++) {
    const a = chords[i];
    const b = chords[i + 1];
    const rootA = a.rootPc;
    const rootB = b.rootPc;

    // Substitution tritonique : dominante un triton (6 demi-tons) de la dominante attendue
    if (isDominantSymbol(a.symbol) && isDominantSymbol(b.symbol)) {
      const diff = (rootB - rootA + 12) % 12;
      if (diff === 6) {
        subs.push({
          type: 'tritone-sub',
          startIndex: i,
          endIndex: i + 1,
          description: `${formatChordBrief(a)} peut être une substitution tritonique de la dominante menant à ${formatChordBrief(b)}.`,
        });
      }
    }

    // Backdoor : bVII7 -> I
    const degA = degreeOf(rootA, key.pc);
    const degB = degreeOf(rootB, key.pc);
    if (degA === 10 && isDominantSymbol(a.symbol) && degB === 0 && isMajorSymbol(b.symbol)) {
      subs.push({
        type: 'backdoor',
        startIndex: i,
        endIndex: i + 1,
        description: `Backdoor dominante (bVII7) résolvant vers I en ${key.name}.`,
      });
    }
  }
  return subs;
}

export function summarizeHarmonicPatterns(chords, key) {
  if (!key || chords.length === 0) return null;

  const iiVIs = detectII_V_I(chords, key);
  const cadences = detectCadences(chords, key);
  const turnarounds = detectTurnarounds(chords, key);
  const substitutions = detectCommonSubstitutions(chords, key);

  return {
    iiVIs,
    cadences,
    turnarounds,
    substitutions,
    summary: buildSummary(iiVIs.length, cadences.length, turnarounds.length, substitutions.length),
  };
}

function buildSummary(iiViCount, cadenceCount, turnaroundCount, subCount) {
  const parts = [];
  if (iiViCount > 0) parts.push(`${iiViCount} II-V-I`);
  if (cadenceCount > 0) parts.push(`${cadenceCount} cadence${cadenceCount > 1 ? 's' : ''}`);
  if (turnaroundCount > 0) parts.push(`${turnaroundCount} turnaround${turnaroundCount > 1 ? 's' : ''}`);
  if (subCount > 0) parts.push(`${subCount} substitution${subCount > 1 ? 's' : ''}`);
  if (parts.length === 0) return 'Aucun pattern harmonique caractéristique détecté.';
  return `Patterns détectés : ${parts.join(', ')}.`;
}
