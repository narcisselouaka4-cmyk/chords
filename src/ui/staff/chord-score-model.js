// Réduction harmonique d'affichage. Aucun changement aux segments ou aux exports.
import { resolveCanonicalChordDefinition } from '../../chord-engine/chord-display.js';
import { degreeOf } from '../../chord-engine/spelling.js';
import { noteNameToPc } from '../../chord-engine/intervals.js';

const letters = 'CDEFGAB', naturals = [0, 2, 4, 5, 7, 9, 11];
const mod = (value) => ((value % 12) + 12) % 12;

function pitch(midi, rootName, quality, relative) {
  const degree = degreeOf(mod(midi - noteNameToPc(rootName)), relative, quality);
  const index = (letters.indexOf(rootName[0]) + degree - 1) % 7;
  let alter = mod(midi - naturals[index]); if (alter > 6) alter -= 12;
  if (Math.abs(alter) > 2) return null;
  const octave = Math.floor((midi - alter) / 12) - 1;
  return { midi, name: letters[index] + ({ '-2': 'bb', '-1': 'b', 0: '', 1: '#', 2: '##' }[alter]), octave };
}

/** Position de référence : basse octave 2, accord en position fondamentale octave 4. */
export function scoreVoicing(symbol) {
  if (!symbol || symbol === 'N') return { treble: [], bass: [], silence: true };
  const match = /^([A-G][#b]?)([^/]*)(?:\/([A-G][#b]?))?$/.exec(symbol);
  if (!match) return { treble: [], bass: [], unsupported: true };
  const [, rootName, quality, slash] = match;
  const definition = resolveCanonicalChordDefinition(quality);
  // Ne jamais transformer silencieusement une qualité inconnue en triade majeure.
  if (!definition) return { treble: [], bass: [], unsupported: true };
  const root = noteNameToPc(rootName), bassPc = noteNameToPc(slash || rootName);
  const relative = new Set(definition.intervals.map(mod));
  const treble = definition.intervals.map((interval) => pitch(60 + root + interval, rootName, quality, relative));
  const bassName = slash || rootName;
  const bassAlter = bassName.endsWith('#') ? 1 : bassName.endsWith('b') ? -1 : 0;
  const bassMidi = 36 + bassPc;
  const bass = [{ midi: bassMidi, name: bassName, octave: Math.floor((bassMidi - bassAlter) / 12) - 1 }];
  return treble.some((note) => !note) ? { treble: [], bass: [], unsupported: true } : { treble, bass };
}

/** Durées binaires, liées si besoin, sans franchir une barre ni masquer une syncope. */
export function splitScoreDuration(from, to, barFrom, beatUnit) {
  const notes = []; let at = from;
  while (at < to) {
    let beats = beatUnit;
    while (beats > to - at || (at - barFrom) % beats !== 0) beats /= 2;
    notes.push({ from: at, to: at + beats, duration: String(beatUnit / beats) });
    at += beats;
  }
  return notes;
}

export function buildChordScore(grid, { spellSymbol = (symbol) => symbol } = {}) {
  const cells = grid.rows.flatMap((row) => row.cells);
  let previous = null;
  return (grid.bars || []).map((bar) => {
    const events = [];
    for (const cell of cells) {
      const from = Math.max(cell.from, bar.from), to = Math.min(cell.to, bar.to);
      if (to <= from) continue;
      const voicing = scoreVoicing(spellSymbol(cell.symbol));
      for (const span of splitScoreDuration(from, to, bar.from, grid.settings.beatUnit)) {
        const event = { ...span, symbol: cell.symbol, segmentId: cell.segmentId, voicing,
          startTime: grid.boundaries[span.from], endTime: grid.boundaries[span.to],
          tiePrevious: !!previous && previous.to === span.from && previous.symbol === cell.symbol && !voicing.silence && !voicing.unsupported,
        };
        events.push(event); previous = event;
      }
    }
    const incomplete = bar.pickup || bar.to === grid.boundaries.length - 1 && bar.to - bar.from < grid.settings.beatsPerBar;
    return { ...bar, events, signature: `${incomplete ? grid.settings.beatsPerBar : bar.to - bar.from}/${grid.settings.beatUnit}` };
  });
}
