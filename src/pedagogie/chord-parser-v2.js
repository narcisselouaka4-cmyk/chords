// [Claude] — 2026-09-09 — Parser d'accords v2 pour le Copilot IA.
//
// Combine le parser maison (slash bass, notation libre) avec @tonaljs/tonal
// pour la robustesse sur les tensions et altérations complexes.

import { Chord, Note } from '@tonaljs/tonal';

/**
 * Parser un symbole d'accord en une définition normalisée.
 * @param {string} symbol
 * @returns {{rootPc: number, bassPc: number|null, qualityId: string, notes: string[], intervals: string[], ok: boolean, error?: string}|null}
 */
export function parseChordSymbol(symbol) {
  const input = String(symbol || '').trim();
  if (!input) return null;

  // Séparation éventuelle de la basse slash.
  // [Claude] — 2026-09-24 — Seul un NOM DE NOTE après « / » est une basse
  // (C/E, Dm7/G). Dans « C6/9 » ou « Cm6/9 », « 9 » est la neuvième : on
  // coupait avant, ce qui donnait C6 / Cm6 et perdait le Ré.
  const slashIndex = input.lastIndexOf('/');
  let chordPart = input;
  let slashBassName = null;
  let bassPc = null;
  if (slashIndex > 0) {
    const bassNote = Note.get(input.slice(slashIndex + 1));
    if (!bassNote.empty) {
      chordPart = input.slice(0, slashIndex);
      slashBassName = input.slice(slashIndex + 1);
      bassPc = bassNote.chroma;
    }
  }

  // Normalisation des notations utilisées par les musiciens mais non reconnues
  // nativement par Tonal.js : parenthèses autour des altérations, minMaj, ø, 6/9.
  let normalizedChordPart = normalizeChordSymbol(chordPart);

  // Utilisation de Tonal.js pour le corps de l'accord.
  let chord = Chord.get(normalizedChordPart);
  // Suffixe après « / » qui n'est ni une note ni une notation connue (« C/X ») :
  // comportement historique conservé, l'accord avant le « / » est lu seul.
  if ((chord.empty || !chord.tonic) && slashIndex > 0 && bassPc === null) {
    chordPart = input.slice(0, slashIndex);
    normalizedChordPart = normalizeChordSymbol(chordPart);
    chord = Chord.get(normalizedChordPart);
  }
  if (chord.empty || !chord.tonic) {
    return {
      input,
      rootPc: null,
      bassPc,
      qualityId: '',
      notes: [],
      intervals: [],
      ok: false,
      error: `Symbole non reconnu : ${chordPart}`,
    };
  }

  const rootPc = Note.get(chord.tonic).chroma;
  const notes = chord.notes || [];
  const intervals = chord.intervals || [];
  const qualityId = chord.type || chord.aliases[0] || '';

  // Si une basse slash est précisée et absente des notes, on l'ajoute.
  if (bassPc !== null && !notes.some((n) => Note.get(n).chroma === bassPc)) {
    const bassName = Note.get(slashBassName).name;
    notes.unshift(bassName);
  }

  return {
    input,
    rootPc,
    bassPc,
    qualityId,
    notes,
    intervals,
    ok: true,
  };
}

/**
 * Convertit un symbole d'accord en notes MIDI.
 * @param {string} symbol
 * @param {{baseMidi?: number, octave?: number}} [options]
 * @returns {number[]|null}
 */
export function chordSymbolToMidi(symbol, options = {}) {
  const parsed = parseChordSymbol(symbol);
  if (!parsed || !parsed.ok) return null;

  const base = Number.isFinite(options.baseMidi)
    ? options.baseMidi
    : (Number.isFinite(options.octave) ? (options.octave + 1) * 12 : 48);

  const basePc = base % 12;
  const notes = parsed.notes.map((name) => {
    const note = Note.get(name);
    if (note.empty) return null;
    const pc = note.chroma;
    let midi = base + ((pc - basePc + 12) % 12);
    if (midi < base) midi += 12;
    return midi;
  }).filter((n) => n !== null);

  if (parsed.bassPc !== null) {
    const existingBass = notes.find((n) => n % 12 === parsed.bassPc);
    if (existingBass !== undefined && existingBass !== Math.min(...notes)) {
      const idx = notes.indexOf(existingBass);
      if (idx >= 0) notes[idx] = existingBass - 12;
    }
  }

  const unique = Array.from(new Set(notes)).sort((a, b) => a - b);
  return unique;
}

/**
 * Retourne les classes de pitch (0–11) de l'accord.
 * @param {string} symbol
 * @returns {number[]|null}
 */
export function chordSymbolToPitchClasses(symbol) {
  const parsed = parseChordSymbol(symbol);
  if (!parsed || !parsed.ok) return null;
  const rootPc = parsed.rootPc;
  // Tonal retourne les notes à partir de la fondamentale (ex. Am9 : A,C,E,G,B).
  // On veut les classes de pitch ABSOLUES (C=0, C#=1...) pour que les tests
  // et la logique LH/RH existante continuent de fonctionner.
  const absolutePcs = parsed.notes
    .map((name) => {
      const pc = Note.get(name).chroma;
      return pc === undefined ? null : pc;
    })
    .filter((n) => n !== null);
  return Array.from(new Set(absolutePcs)).sort((a, b) => a - b);
}

/**
 * Normalise une chaîne de qualité d'accord en un alias compris par Tonal.js.
 * @param {string} symbol
 * @returns {string}
 */
function normalizeChordSymbol(symbol) {
  if (!symbol) return '';
  let normalized = symbol;

  // Remplace la notation parenthesée des altérations par la notation compacte
  // utilisée par Tonal.js : C7(b9) → C7b9, C7(#9) → C7#9, etc.
  normalized = normalized
    .replace(/\(\s*#\s*(\d+)\s*\)/g, '#$1')
    .replace(/\(\s*b\s*(\d+)\s*\)/g, 'b$1')
    .replace(/\(\s*\+\s*(\d+)\s*\)/g, '#$1')
    .replace(/\(\s*-\s*(\d+)\s*\)/g, 'b$1');

  // Variantes orthographiques du mineur-majeur 9.
  if (/^([A-G][#b]?)minMaj9$/i.test(normalized)) {
    normalized = normalized.replace(/minMaj9$/i, 'mMaj9');
  }

  // Variantes du demi-diminué : ø7 → m7b5.
  if (/^([A-G][#b]?)ø7$/i.test(normalized)) {
    normalized = normalized.replace(/ø7$/i, 'm7b5');
  }

  // m7#11 est enharmonique du demi-diminué (b5 = #11) : Cm7#11 = Cm7b5.
  if (/^([A-G][#b]?)m7#11$/i.test(normalized)) {
    normalized = normalized.replace(/m7#11$/i, 'm7b5');
  }

  // 6/9 et m6/9 : alias Tonal « 69 » et « m69 », qui gardent la neuvième
  // (C6/9 = C E G A D, Cm6/9 = C Eb G A D).
  normalized = normalized.replace(/^([A-G][#b]?)(m?)6\/9$/, (_, root, minor) => `${root}${minor}69`);

  return normalized;
}

/**
 * Détecte si un symbole est reconnu.
 * @param {string} symbol
 * @returns {boolean}
 */
export function isChordSymbolRecognized(symbol) {
  const parsed = parseChordSymbol(symbol);
  return parsed != null && parsed.ok;
}

/**
 * Détecte si un texte contient un symbole d'accord isolé (ex. "Am9", "C#13b9").
 * @param {string} text
 * @returns {string|null}
 */
export function extractChordSymbol(text) {
  const trimmed = String(text || '').trim();
  if (isChordSymbolRecognized(trimmed)) return trimmed;
  // Cherche un symbole entre espaces ou en fin de phrase.
  const match = trimmed.match(/\b([A-G][#b]?(?:m|maj|min|dim|aug|sus|7|9|11|13|alt|ø|add|\+|-|\()[^\s]*)/i);
  if (match && isChordSymbolRecognized(match[1])) return match[1];
  // Cherche aussi une notation avec parenthèse (ex. C7(b9)).
  const parenMatch = trimmed.match(/\b([A-G][#b]?(?:m|maj|min|dim|aug|sus|7|9|11|13|alt|add|\+|-|\()[^(\s]*\([^\)]*\))/i);
  if (parenMatch && isChordSymbolRecognized(parenMatch[1])) return parenMatch[1];
  return null;
}
