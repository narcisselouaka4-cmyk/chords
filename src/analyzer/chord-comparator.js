// [OpenCode] — 2026-07-04 — Comparateur de grilles pour le Coach de Studio.
// Compare une grille de référence (saisie manuelle ou import) avec les accords joués.
// Phase 1 : parsing texte + structure. Phase 2 : IA pour le feedback.

export function parseChordGrid(text) {
  if (!text || typeof text !== 'string') return [];
  const lines = text.split('\n').filter((l) => l.trim() && !l.trim().startsWith('#'));
  const chords = [];
  for (const line of lines) {
    const trimmed = line.trim();
    const parts = trimmed.split(/\s+/);
    for (const part of parts) {
      const parsed = parseChordSymbol(part);
      if (parsed) chords.push(parsed);
    }
  }
  return chords;
}

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

function formatChordName(chord) {
  if (!chord) return '—';
  const root = NOTE_NAMES[chord.rootPc % 12] || '?';
  return `${root}${chord.symbol || ''}`;
}

function parseChordSymbol(str) {
  const match = str.match(/^([A-Ga-g][#b]?)(.*)$/);
  if (!match) return null;
  const rootStr = match[1];
  const symbol = match[2] || '';
  const pcMap = {
    C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3,
    E: 4, F: 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8,
    Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11,
  };
  const rootPc = pcMap[rootStr];
  if (rootPc == null) return null;
  return { rootPc, symbol: symbol || '', name: formatChordName({ rootPc, symbol }) };
}

export function compareGridToPlayed(referenceGrid, playedChords) {
  if (!referenceGrid.length || !playedChords.length) return { matches: 0, total: 0, feedback: [] };

  const feedback = [];
  const maxLen = Math.max(referenceGrid.length, playedChords.length);

  for (let i = 0; i < maxLen; i++) {
    const ref = referenceGrid[i];
    const played = playedChords[i];
    if (!ref || !played) {
      feedback.push({
        index: i,
        ref: ref ? formatChordName(ref) : '—',
        played: played ? formatChordName(played) : '—',
        match: false,
        comment: !ref ? 'Accord joué non attendu' : 'Accord attendu non joué',
      });
      continue;
    }
    const match = ref.rootPc === played.rootPc && normalizeSymbol(ref.symbol) === normalizeSymbol(played.symbol || '');
    feedback.push({
      index: i,
      ref: formatChordName(ref),
      played: formatChordName(played),
      match,
      comment: match ? 'Correct' : getSubstitutionComment(ref, played),
    });
  }

  const matches = feedback.filter((f) => f.match).length;
  return { matches, total: feedback.length, feedback };
}

function normalizeSymbol(sym) {
  return sym.replace(/^m$/, 'min').replace(/^M$/, 'maj').replace(/^$/, '');
}

function getSubstitutionComment(ref, played) {
  if (!ref || !played) return 'Non comparable';
  const refPc = ref.rootPc;
  const playedPc = played.rootPc;
  if (playedPc === (refPc + 6) % 12) return 'Substitution tritonique';
  if (playedPc === refPc) return 'Voicing différent (même fondamentale)';
  if (Math.abs(playedPc - refPc) === 4 || Math.abs(playedPc - refPc) === 8) return 'Substitution par tierce';
  if (Math.abs(playedPc - refPc) === 5 || Math.abs(playedPc - refPc) === 7) return 'Substitution par quarte/quinte';
  return `${formatChordName(played)} au lieu de ${formatChordName(ref)}`;
}
