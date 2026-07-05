import { formatNote } from './intervals.js';

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
