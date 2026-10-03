// [Claude] — 2026-10-02 — Orthographe des accords et de leurs notes, à la manière jazz.
//
// Le Temps réel écrivait toute fondamentale noire en dièse : A♯7, D♯maj7, G♯maj7,
// C7/A♯… alors que Sessions MIDI écrit déjà B♭7, E♭maj7 (midi-chord-namer.js). Et la
// portée (3e notation, demandée par Narcisse) a besoin de la VRAIE orthographe de
// chaque note : E♭ dans Cm7, D♯ dans C7♯9 (la ♯9 reste une ♯9), B𝄫 dans Cdim7.
//
// Fondamentale selon la famille de l'accord :
//   - majeur (maj7, 6, add9, sus…) : D♭, E♭, G♭, A♭, B♭ ;
//   - dominante (7, 9, 13, altérés) : D♭, E♭, F♯, A♭, B♭ ;
//   - mineur : C♯, E♭, F♯, G♯, B♭ ;
//   - diminué et demi-diminué : en dièses (C♯°7, D♯ø7, A♯ø7 : B♭ø7 obligerait à F♭).
// Puis chaque note est écrite par son degré dans l'accord (1, 3, 5, 7, 9…).
// Module pur, testé dans test-spelling.js.

const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const LETTER_PCS = [0, 2, 4, 5, 7, 9, 11];
const LATIN_LETTERS = { C: 'Do', D: 'Ré', E: 'Mi', F: 'Fa', G: 'Sol', A: 'La', B: 'Si' };

const MAJOR_ROOTS = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
const DOMINANT_ROOTS = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
const MINOR_ROOTS = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'G#', 'A', 'Bb', 'B'];
const DIMINISHED_ROOTS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

const pcOf = (n) => ((n % 12) + 12) % 12;

/** Famille d'un symbole : 'diminished' | 'minor' | 'dominant' | 'major'. */
export function chordFamily(symbol = '') {
  const s = String(symbol || '');
  if (/^(dim|°|ø)|^m7b5|^m9b5/.test(s)) return 'diminished';
  if (/^m(?!aj)/.test(s)) return 'minor';
  if (/^(7|9|11|13)/.test(s)) return 'dominant';
  return 'major';
}

/** Nom anglais de la fondamentale (« Bb », « F# »…) selon la famille de l'accord. */
export function chordRootName(rootPc, symbol = '') {
  const pc = pcOf(rootPc);
  switch (chordFamily(symbol)) {
    case 'diminished': return DIMINISHED_ROOTS[pc];
    case 'minor': return MINOR_ROOTS[pc];
    case 'dominant': return DOMINANT_ROOTS[pc];
    default: return MAJOR_ROOTS[pc];
  }
}

/**
 * Degré (1 à 7) d'une note de l'accord, d'après son écart à la fondamentale.
 * `rel` : les écarts présents (pour départager ♭3 / ♯9, ♭5 / ♯11, ♯5 / ♭13).
 */
export function degreeOf(semitones, rel = new Set(), symbol = '') {
  const s = String(symbol || '');
  switch (pcOf(semitones)) {
    case 0: return 1;
    case 1: case 2: return 2; // ♭9, 9 (et la 2de d'un sus2)
    case 3: return rel.has(4) ? 2 : 3; // ♯9 à côté d'une tierce majeure, sinon ♭3
    case 4: return 3;
    case 5: return 4; // 11, sus4
    case 6: return /#11/.test(s) || rel.has(7) ? 4 : 5; // ♯11 si la quinte juste sonne, sinon ♭5
    case 7: return 5;
    case 8: return /#5|aug|\+/.test(s) || !(rel.has(7) || /b13/.test(s)) ? 5 : 6; // ♯5 ou ♭13
    case 9: return /dim7|°7/.test(s) ? 7 : 6; // 𝄫7 d'un dim7, sinon 6 / 13
    default: return 7; // ♭7, 7
  }
}

const ACCIDENTALS = { '-2': 'bb', '-1': 'b', 0: '', 1: '#', 2: '##' };

/** Nom par défaut, sans contexte d'accord (même choix que Sessions MIDI). */
function defaultSpelling(pc) {
  const name = DOMINANT_ROOTS[pcOf(pc)];
  const letterIndex = LETTERS.indexOf(name[0]);
  return { letter: name[0], letterIndex, alter: name.length > 1 ? (name[1] === '#' ? 1 : -1) : 0 };
}

/** Écrit la classe de note `pc` comme degré `degree` au-dessus de la fondamentale `rootName`. */
function spellDegree(pc, rootName, degree) {
  const letterIndex = (LETTERS.indexOf(rootName[0]) + degree - 1) % 7;
  let alter = pcOf(pc - LETTER_PCS[letterIndex]);
  if (alter > 6) alter -= 12;
  if (alter < -2 || alter > 2) return null;
  return { letter: LETTERS[letterIndex], letterIndex, alter };
}

/**
 * Orthographe des notes jouées dans le contexte de l'accord reconnu.
 * @param {number[]} midis
 * @param {{rootPc?: number, symbol?: string}|null} chord - null ou '?' : orthographe par défaut
 * @returns {{midi: number, letter: string, alter: number, octave: number, step: number, name: string}[]}
 *   step : rang diatonique (Do4 = 28), utile à la portée.
 */
export function spellChordNotes(midis, chord = null) {
  const notes = [...(midis || [])].filter(Number.isFinite).sort((a, b) => a - b);
  const known = chord && Number.isFinite(chord.rootPc) && chord.symbol !== '?';
  const rootName = known ? chordRootName(chord.rootPc, chord.symbol) : null;
  const rel = known ? new Set(notes.map((m) => pcOf(m - chord.rootPc))) : new Set();
  return notes.map((midi) => {
    const pc = pcOf(midi);
    const spelled = (known && spellDegree(pc, rootName, degreeOf(pc - chord.rootPc, rel, chord.symbol))) || defaultSpelling(pc);
    const octave = Math.floor((midi - spelled.alter) / 12) - 1;
    return {
      midi,
      letter: spelled.letter,
      alter: spelled.alter,
      octave,
      step: octave * 7 + spelled.letterIndex,
      name: `${spelled.letter}${ACCIDENTALS[spelled.alter]}`,
    };
  });
}

/** Nom de la basse d'un accord en slash, écrite comme degré de l'accord (D/F♯, A♭/C). */
export function slashBassName(bassPc, rootPc, symbol = '') {
  const rootName = chordRootName(rootPc, symbol);
  const rel = new Set([0, pcOf(bassPc - rootPc)]);
  const spelled = spellDegree(pcOf(bassPc), rootName, degreeOf(bassPc - rootPc, rel, symbol)) || defaultSpelling(bassPc);
  return `${spelled.letter}${ACCIDENTALS[spelled.alter]}`;
}

/**
 * Affichage d'un nom anglais (« Bb », « F## »), en latin si demandé, avec les vrais
 * signes ♯ ♭ 𝄪 𝄫. `html` : signes dans des <span class="sharp|flat"> (comme naming.js).
 */
export function displayNoteName(name, { latin = false, html = false } = {}) {
  const letter = name[0];
  const accidentals = name.slice(1);
  const base = latin ? LATIN_LETTERS[letter] : letter;
  const sign = accidentals === '##' ? '𝄪' : accidentals === 'bb' ? '𝄫' : accidentals.replace('#', '♯').replace('b', '♭');
  if (!sign) return base;
  if (!html) return `${base}${sign}`;
  const cls = accidentals.startsWith('#') ? 'sharp' : 'flat';
  return `${base}<span class="${cls}">${sign}</span>`;
}
