// Présentation seulement : les symboles canoniques anglais restent dans les données.
import { displayNoteName, forcedPitchName } from '../chord-engine/spelling.js';
import { noteNameToPc } from '../chord-engine/intervals.js';

export function notationOptions() {
  return {
    latin: globalThis.document?.getElementById('notation-select')?.value === 'latin',
    spelling: globalThis.document?.getElementById('spelling-select')?.value || 'auto',
  };
}

export function formatMusicNote(name, options = notationOptions()) {
  const match = /^([A-G](?:##|bb|[#b♯♭])?)(.*)$/.exec(String(name || ''));
  if (!match) return String(name || '');
  const canonical = match[1].replaceAll('♯', '#').replaceAll('♭', 'b');
  const pc = noteNameToPc(canonical);
  const root = pc == null ? canonical : forcedPitchName(pc, options.spelling) || canonical;
  return displayNoteName(root, options) + match[2];
}

export function formatMusicChord(symbol, options = notationOptions()) {
  if (!symbol || symbol === 'N') return symbol || 'N';
  // Ne convertir que la fondamentale et la basse : les suffixes maj7, b9, #11 restent intacts.
  return String(symbol).split('/').map((part) => formatMusicNote(part, options)).join('/');
}

export function canonicalChordInput(input) {
  const roots = { do: 'C', ré: 'D', re: 'D', mi: 'E', fa: 'F', sol: 'G', la: 'A', si: 'B' };
  return String(input || '').trim().split('/').map((part) => part.trim()
    .replace(/^(sol|do|ré|re|mi|fa|la|si)(?=$|[#b♯♭0-9mM+°ø(])/i, (root) => roots[root.toLowerCase()])
    .replaceAll('♯', '#').replaceAll('♭', 'b')).join('/');
}
