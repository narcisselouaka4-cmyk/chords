import { formatNote } from './intervals.js';
import { chordRootName, slashBassName, displayNoteName } from './spelling.js';

const SHARP_HTML = '<span class="sharp">♯</span>';
const FLAT_HTML = '<span class="flat">♭</span>';

export function noteName(pc, latin = false) {
  return formatNote(pc, true, latin);
}

export function formatPc(pc, latin = false) {
  return formatNote(pc, true, latin);
}

function formatSymbol(symbol) {
  if (!symbol) return '';
  return symbol
    .replace(/#(\d)/g, `${SHARP_HTML}$1`)
    .replace(/b(\d)/g, `${FLAT_HTML}$1`)
    .replace(/#/g, SHARP_HTML)
    .replace(/b/g, FLAT_HTML)
    .replace(/maj/g, 'maj')
    .replace(/dim/g, 'dim')
    .replace(/aug/g, 'aug')
    .replace(/sus/g, 'sus');
}

export function chordName(rootPc, symbol, latin = false) {
  const root = formatPc(rootPc, latin);
  const sym = formatSymbol(symbol);
  return `${root}${sym}`;
}

export function slashName(rootPc, symbol, bassPc, latin = false) {
  const name = chordName(rootPc, symbol, latin);
  const bass = formatPc(bassPc, latin);
  return `${name}/${bass}`;
}

export function formatNoteList(pcs, latin = false) {
  return pcs.map((pc) => formatPc(pc, latin));
}

export function inversionName(inversionIndex) {
  switch (inversionIndex) {
    case 0:
      return 'position fondamentale';
    case 1:
      return '1ère inversion';
    case 2:
      return '2ème inversion';
    case 3:
      return '3ème inversion';
    case 4:
      return '4ème inversion';
    default:
      return `${inversionIndex}ème inversion`;
  }
}

// [Claude] — 2026-10-02 — Nom à la manière jazz pour le Temps réel : B♭7 et non A♯7,
// D/F♯, A♭/C, polyaccord « D/C » (triade de Ré sur triade de Do). Même rendu HTML
// que chordName() (signes dans des <span>). chordName() et slashName() restent pour
// les autres modules. Accord non identifié : chaîne vide.
export function jazzChordName(result, latin = false) {
  if (!result || result.symbol === '?') return '';
  const root = (rootPc, symbol) => displayNoteName(chordRootName(rootPc, symbol), { latin, html: true });
  if (result.polychord) {
    const { lower, upper } = result.polychord;
    return `${root(upper.rootPc, upper.triad.symbol)}${formatSymbol(upper.triad.symbol)}/${root(lower.rootPc, lower.triad.symbol)}${formatSymbol(lower.triad.symbol)}`;
  }
  const name = `${root(result.rootPc, result.symbol)}${formatSymbol(result.symbol)}`;
  if (!result.isSlash || result.rootless) return name;
  const bass = displayNoteName(slashBassName(result.bassPc, result.rootPc, result.symbol), { latin, html: true });
  return `${name}/${bass}`;
}
