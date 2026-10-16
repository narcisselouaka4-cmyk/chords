// [Claude] — 2026-09-24 — Orthographe des accords selon la tonalité (Exercice,
// modes Progression et Mouvement). Avant, toute fondamentale noire était écrite
// en dièse : le IV de Fa majeur s'affichait « A#maj7 » au lieu de « Bbmaj7 ».
// Fonctions pures, sans dépendance, pour rester testables en Node.

const SHARP_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const FLAT_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

// Toniques usuelles en jazz : Db, Eb, Gb, Ab, Bb en majeur ; C#m, F#m, G#m,
// Ebm, Bbm en mineur (armures les plus courtes ou les plus lues).
const MAJOR_TONICS = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
const MINOR_TONICS = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'G#', 'A', 'Bb', 'B'];

const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const LETTER_PCS = [0, 2, 4, 5, 7, 9, 11];

// Orthographes correctes en théorie mais déroutantes sur une grille : on
// revient à la note naturelle (Cbmaj7 → Bmaj7, E#m7b5 → Fm7b5).
const AWKWARD = new Set(['Cb', 'Fb', 'E#', 'B#']);

const pcOf = (n) => ((n % 12) + 12) % 12;

/** Nom de la tonique (« Bb », « F# »…). */
export function tonicName(keyPc, minor = false) {
  return (minor ? MINOR_TONICS : MAJOR_TONICS)[pcOf(keyPc)];
}

/** Libellé de la tonalité : « F majeur », « C mineur ». */
export function keyLabel(keyPc, minor = false) {
  return `${tonicName(keyPc, minor)} ${minor ? 'mineur' : 'majeur'}`;
}

/** Vrai si l'armure de la tonalité est en dièses (G, D, A, E, B, F# majeur ; E, B, F#, C#, G# mineur). */
function prefersSharps(keyPc, minor) {
  const tonic = tonicName(keyPc, minor);
  if (tonic.includes('#')) return true;
  if (tonic.includes('b')) return false;
  return minor ? ['E', 'B'].includes(tonic) : ['G', 'D', 'A', 'E', 'B'].includes(tonic);
}

/**
 * Nom d'une note sans degré connu (ex. accord joué par l'élève), selon
 * l'armure de la tonalité : bémols en Fa, dièses en Ré. Do et La mineur
 * (sans armure) prennent les bémols, plus courants en jazz.
 */
export function spellPcInKey(pc, keyPc, minor = false) {
  return (prefersSharps(keyPc, minor) ? SHARP_NAMES : FLAT_NAMES)[pcOf(pc)];
}

/**
 * Nom de la fondamentale d'un accord de degré `degree` (1–7, degrés de la gamme
 * majeure de la tonique, altérations comprises dans `rootPc`) : la lettre suit
 * le degré (IV de Fa → B, donc Bb), l'altération vient de la hauteur réelle.
 */
export function spellDegreeInKey(rootPc, degree, keyPc, minor = false) {
  const tonic = tonicName(keyPc, minor);
  const index = (LETTERS.indexOf(tonic[0]) + Number(degree) - 1) % 7;
  if (!(index >= 0)) return spellPcInKey(rootPc, keyPc, minor);
  const letter = LETTERS[index];
  let accidental = pcOf(rootPc - LETTER_PCS[index]);
  if (accidental > 6) accidental -= 12;
  const name = accidental === 0 ? letter : accidental === 1 ? `${letter}#` : accidental === -1 ? `${letter}b` : null;
  if (!name || AWKWARD.has(name)) return spellPcInKey(rootPc, keyPc, minor);
  return name;
}

/**
 * Vrai si une suite de degrés est en mineur : son accord de degré I (sans
 * altération) est mineur (« 1m », « 1:m7 », « 1m6 »…).
 * @param {{degree: number, offset: number, quality: string}[]} tokens
 */
export function isMinorProgression(tokens) {
  return (tokens || []).some((t) => t && Number(t.degree) === 1 && pcOf(t.offset) === 0 && /^m(?!aj)/.test(t.quality || ''));
}
