// Module harmonique partagé — pure, sans DOM, sans Electron, sans état UI.
// Fournit la résolution de l'accord effectif, le calcul des pitch classes,
// le traitement de la basse slash et le formatage des symboles.
//
// Consommateurs :
//   - src/ui/chord-editor.js
//   - src/ui/analyzer-tab.js
//   - src/analyzer/analysis-export.js
//   - src/voicing-engine/*

import { noteNameToPc, NOTE_NAMES } from './intervals.js';
import { CHORD_DEFINITIONS } from './chord-defs.js';

/**
 * Résout la définition canonique d'une qualité publique.
 * Priorité :
 *   1. définition normale (non rootless, sans parentSymbol) dont le symbol
 *      correspond exactement à la qualité publique ;
 *   2. si la qualité est vide, retourne la définition de la fondamentale seule.
 * Les définitions rootless (parentSymbol présent) et les variantes internes ne
 * sont jamais choisies par cette fonction.
 * @param {string} quality
 * @returns {{name: string, symbol: string, intervals: number[]}|undefined}
 */
export function resolveCanonicalChordDefinition(quality) {
  const trimmed = quality === '' ? '' : quality.trim();
  return CHORD_DEFINITIONS.find((d) => d.symbol === trimmed && !d.parentSymbol);
}

/**
 * Parse un symbole d'accord en composantes harmoniques.
 * @param {string|null} chordStr
 * @returns {{root: number, quality: string, bass: number|null, isN: boolean}}
 */
export function parseChordSymbol(chordStr) {
  if (!chordStr || chordStr === 'N') {
    return { root: 0, quality: '', bass: null, isN: !chordStr || chordStr === 'N' };
  }
  const slashParts = chordStr.split('/');
  const namePart = slashParts[0];
  const bassPart = slashParts[1];
  const rootMatch = namePart.match(/^([A-G][#b]?)(.*)/);
  if (!rootMatch) {
    return { root: 0, quality: '', bass: null, isN: false };
  }
  const root = noteNameToPc(rootMatch[1]);
  const quality = rootMatch[2] || '';
  const bass = bassPart ? noteNameToPc(bassPart.trim()) : null;
  return { root: root != null ? root : 0, quality: quality || '', bass, isN: false };
}

/**
 * Formate un accord effectif à partir de ses composantes numériques.
 * @param {number} root
 * @param {string} quality
 * @param {number|null} bass
 * @returns {string}
 */
export function formatEffectiveChord(root, quality, bass) {
  const idx = ((root % 12) + 12) % 12;
  const rootName = NOTE_NAMES[idx];
  const sym = quality === '' ? rootName : `${rootName}${quality}`;
  if (bass != null && bass >= 0) {
    const bassIdx = ((bass % 12) + 12) % 12;
    return `${sym}/${NOTE_NAMES[bassIdx]}`;
  }
  return sym;
}

/**
 * Résout l'accord effectif d'un segment (manualOverride ?? detectedChord).
 * @param {{chord: string, manualOverride?: {root:number,quality:string,bass:number|null}|null}} segment
 * @returns {string}
 */
export function getEffectiveChord(segment) {
  if (segment.manualOverride) {
    return formatEffectiveChord(
      segment.manualOverride.root,
      segment.manualOverride.quality,
      segment.manualOverride.bass,
    );
  }
  return segment.chord;
}

/**
 * Normalise un override : retourne null s'il est identique à la détection.
 * @param {{chord: string}} segment
 * @param {{root:number,quality:string,bass:number|null}|null} override
 * @returns {{root:number,quality:string,bass:number|null}|null}
 */
export function normalizeOverride(segment, override) {
  if (override == null) return null;
  const detected = parseChordSymbol(segment.chord);
  const overrideRoot = ((override.root % 12) + 12) % 12;
  const detectedRoot = ((detected.root % 12) + 12) % 12;
  if (
    detectedRoot === overrideRoot &&
    detected.quality === override.quality &&
    detected.bass === override.bass
  ) {
    return null;
  }
  return { root: override.root, quality: override.quality, bass: override.bass != null ? override.bass : null };
}

/**
 * Dérive toutes les informations d'affichage et d'analyse d'un accord effectif.
 * @param {string} effectiveChord
 * @returns {{
 *   symbol: string,
 *   rootPc: number|null,
 *   quality: string|null,
 *   bassPc: number|null,
 *   chordTonePcs: number[],
 *   chordToneNames: string[],
 *   bassName: string|null,
 *   allPcs: number[],
 *   allNames: string[]
 * }}
 */
export function deriveChordDisplay(effectiveChord) {
  if (!effectiveChord || effectiveChord === 'N') {
    return {
      symbol: effectiveChord || 'N',
      rootPc: null,
      quality: null,
      bassPc: null,
      chordTonePcs: [],
      chordToneNames: [],
      bassName: null,
      allPcs: [],
      allNames: [],
    };
  }

  const slashIdx = effectiveChord.indexOf('/');
  const chordPart = slashIdx >= 0 ? effectiveChord.slice(0, slashIdx) : effectiveChord;
  const bassStr = slashIdx >= 0 ? effectiveChord.slice(slashIdx + 1).trim() : null;

  const rootMatch = chordPart.match(/^([A-G][#b]?)(.*)/);
  if (!rootMatch) {
    return {
      symbol: effectiveChord,
      rootPc: null,
      quality: null,
      bassPc: null,
      chordTonePcs: [],
      chordToneNames: [],
      bassName: null,
      allPcs: [],
      allNames: [],
    };
  }

  const rootName = rootMatch[1];
  const quality = rootMatch[2].trim();
  const rootPc = noteNameToPc(rootName);
  if (rootPc == null) {
    return {
      symbol: effectiveChord,
      rootPc: null,
      quality: null,
      bassPc: null,
      chordTonePcs: [],
      chordToneNames: [],
      bassName: null,
      allPcs: [],
      allNames: [],
    };
  }

  const def = resolveCanonicalChordDefinition(quality);
  const intervals = def ? def.intervals : [0, 4, 7];

  const pcSet = new Set(intervals.map((i) => ((rootPc + i) % 12 + 12) % 12));
  const chordTonePcs = [...pcSet].sort((a, b) => a - b);

  const bassPc = bassStr != null ? noteNameToPc(bassStr) : null;
  const normalizedBassPc = bassPc != null ? ((bassPc % 12) + 12) % 12 : null;

  const chordToneNames = chordTonePcs.map((pc) => NOTE_NAMES[pc]);
  const bassName = normalizedBassPc != null ? NOTE_NAMES[normalizedBassPc] : null;

  const bassInChord = normalizedBassPc != null && pcSet.has(normalizedBassPc);
  const allPcsRaw = bassInChord
    ? chordTonePcs
    : [...chordTonePcs, ...(normalizedBassPc != null ? [normalizedBassPc] : [])];
  const allPcs = [...allPcsRaw].sort((a, b) => a - b);
  const allNames = allPcs.map((pc) => NOTE_NAMES[pc]);

  return {
    symbol: effectiveChord,
    rootPc: ((rootPc % 12) + 12) % 12,
    quality,
    bassPc: normalizedBassPc,
    chordTonePcs,
    chordToneNames,
    bassName,
    allPcs,
    allNames,
  };
}
