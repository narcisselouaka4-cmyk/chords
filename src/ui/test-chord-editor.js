import {
  makeSegmentId,
  parseChordSymbol,
  formatEffectiveChord,
  getEffectiveChord,
  normalizeOverride,
  deriveChordDisplay,
  NOTE_NAMES,
  QUALITY_OPTIONS,
} from './chord-editor.js';

function assert(condition, message) {
  if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function runTest(name, fn) {
  try {
    fn();
    console.log(`✅ ${name}`);
  } catch (err) {
    console.error(`❌ ${name}`);
    console.error(err.message);
    process.exitCode = 1;
  }
}

// ---------------------------------------------------------------------------
// makeSegmentId
// ---------------------------------------------------------------------------
runTest('makeSegmentId — déterministe (mêmes entrées → même ID)', () => {
  const a = makeSegmentId({ startTime: 1.0, endTime: 3.0, chord: 'Cmaj7' });
  const b = makeSegmentId({ startTime: 1.0, endTime: 3.0, chord: 'Cmaj7' });
  assert(a === b, `IDs différents: ${a} vs ${b}`);
});

runTest('makeSegmentId — différent pour des entrées différentes', () => {
  const a = makeSegmentId({ startTime: 1.0, endTime: 3.0, chord: 'Cmaj7' });
  const b = makeSegmentId({ startTime: 1.0, endTime: 3.5, chord: 'Cmaj7' });
  assert(a !== b, `IDs identiques pour entrées différentes: ${a}`);
});

runTest('makeSegmentId — préfixe seg_', () => {
  const id = makeSegmentId({ startTime: 0.5, endTime: 2.0, chord: 'G7' });
  assert(id.startsWith('seg_'), `Pas de préfixe seg_: ${id}`);
});

// ---------------------------------------------------------------------------
// parseChordSymbol
// ---------------------------------------------------------------------------
runTest('parseChordSymbol — accord simple majeur', () => {
  const r = parseChordSymbol('C');
  assert(r.root === 0, `root expected 0, got ${r.root}`);
  assert(r.quality === '', `quality expected '', got "${r.quality}"`);
  assert(r.bass === null, `bass expected null, got ${r.bass}`);
});

runTest('parseChordSymbol — accord mineur', () => {
  const r = parseChordSymbol('Am');
  assert(r.root === 9, `root expected 9, got ${r.root}`);
  assert(r.quality === 'm', `quality expected m, got "${r.quality}"`);
  assert(r.bass === null, `bass expected null`);
});

runTest('parseChordSymbol — 7ème de dominante', () => {
  const r = parseChordSymbol('G7');
  assert(r.root === 7, `root expected 7, got ${r.root}`);
  assert(r.quality === '7', `quality expected 7, got "${r.quality}"`);
});

runTest('parseChordSymbol — Maj7', () => {
  const r = parseChordSymbol('Fmaj7');
  assert(r.root === 5, `root expected 5, got ${r.root}`);
  assert(r.quality === 'maj7', `quality expected maj7, got "${r.quality}"`);
});

runTest('parseChordSymbol — m7b5', () => {
  const r = parseChordSymbol('Bm7b5');
  assert(r.root === 11, `root expected 11, got ${r.root}`);
  assert(r.quality === 'm7b5', `quality expected m7b5, got "${r.quality}"`);
});

runTest('parseChordSymbol — slash chord', () => {
  const r = parseChordSymbol('C/E');
  assert(r.root === 0, `root expected 0, got ${r.root}`);
  assert(r.quality === '', `quality expected '', got "${r.quality}"`);
  assert(r.bass === 4, `bass expected 4, got ${r.bass}`);
});

runTest('parseChordSymbol — dièse', () => {
  const r = parseChordSymbol('F#m7');
  assert(r.root === 6, `root expected 6, got ${r.root}`);
  assert(r.quality === 'm7', `quality expected m7, got "${r.quality}"`);
});

runTest('parseChordSymbol — bémol', () => {
  const r = parseChordSymbol('Bb');
  assert(r.root === 10, `root expected 10, got ${r.root}`);
  assert(r.quality === '', `quality expected '', got "${r.quality}"`);
  assert(r.bass === null, `bass expected null`);
});

runTest('parseChordSymbol — N (pas d\'accord)', () => {
  const r = parseChordSymbol('N');
  assert(r.isN === true, `isN expected true`);
  assert(r.root === 0, `root expected 0, got ${r.root}`);
  assert(r.quality === '', `quality expected ''`);
});

runTest('parseChordSymbol — chaîne vide', () => {
  const r = parseChordSymbol('');
  assert(r.isN === true, `isN expected true`);
});

runTest('parseChordSymbol — null', () => {
  const r = parseChordSymbol(null);
  assert(r.isN === true, `isN expected true`);
});

// ---------------------------------------------------------------------------
// formatEffectiveChord
// ---------------------------------------------------------------------------
runTest('formatEffectiveChord — majeur', () => {
  assert(formatEffectiveChord(0, '', null) === 'C', `got ${formatEffectiveChord(0, '', null)}`);
});

runTest('formatEffectiveChord — mineur', () => {
  assert(formatEffectiveChord(9, 'm', null) === 'Am', `got ${formatEffectiveChord(9, 'm', null)}`);
});

runTest('formatEffectiveChord — 7ème', () => {
  assert(formatEffectiveChord(7, '7', null) === 'G7', `got ${formatEffectiveChord(7, '7', null)}`);
});

runTest('formatEffectiveChord — Maj7', () => {
  assert(formatEffectiveChord(5, 'maj7', null) === 'Fmaj7', `got ${formatEffectiveChord(5, 'maj7', null)}`);
});

runTest('formatEffectiveChord — m7b5', () => {
  assert(formatEffectiveChord(11, 'm7b5', null) === 'Bm7b5', `got ${formatEffectiveChord(11, 'm7b5', null)}`);
});

runTest('formatEffectiveChord — slash chord', () => {
  assert(formatEffectiveChord(0, '', 4) === 'C/E', `got ${formatEffectiveChord(0, '', 4)}`);
});

runTest('formatEffectiveChord — slash avec qualité', () => {
  assert(formatEffectiveChord(2, 'm7', 5) === 'Dm7/F', `got ${formatEffectiveChord(2, 'm7', 5)}`);
});

runTest('formatEffectiveChord — basse = 0 (C)', () => {
  assert(formatEffectiveChord(7, '7', 0) === 'G7/C', `got ${formatEffectiveChord(7, '7', 0)}`);
});

// ---------------------------------------------------------------------------
// getEffectiveChord
// ---------------------------------------------------------------------------
runTest('getEffectiveChord — pas d\'override → detected', () => {
  const seg = { chord: 'Cmaj7', manualOverride: null };
  assert(getEffectiveChord(seg) === 'Cmaj7', `got ${getEffectiveChord(seg)}`);
});

runTest('getEffectiveChord — override → effectif', () => {
  const seg = { chord: 'Cmaj7', manualOverride: { root: 9, quality: 'm7', bass: null } };
  assert(getEffectiveChord(seg) === 'Am7', `got ${getEffectiveChord(seg)}`);
});

runTest('getEffectiveChord — override avec basse', () => {
  const seg = { chord: 'G7', manualOverride: { root: 0, quality: 'maj7', bass: 4 } };
  assert(getEffectiveChord(seg) === 'Cmaj7/E', `got ${getEffectiveChord(seg)}`);
});

// ---------------------------------------------------------------------------
// normalizeOverride — retourne null si identique à detected
// ---------------------------------------------------------------------------
runTest('normalizeOverride — identique à detected → null', () => {
  const seg = { chord: 'Cmaj7' };
  const r = normalizeOverride(seg, { root: 0, quality: 'maj7', bass: null });
  assert(r === null, `expected null, got ${JSON.stringify(r)}`);
});

runTest('normalizeOverride — différent → override', () => {
  const seg = { chord: 'Cmaj7' };
  const r = normalizeOverride(seg, { root: 9, quality: 'm7', bass: null });
  assert(r !== null, `expected override, got null`);
  assert(r.root === 9, `root expected 9`);
  assert(r.quality === 'm7');
});

runTest('normalizeOverride — basse ajoutée → override', () => {
  const seg = { chord: 'C' };
  const r = normalizeOverride(seg, { root: 0, quality: '', bass: 4 });
  assert(r !== null, `expected override for added bass`);
  assert(r.bass === 4);
});

runTest('normalizeOverride — basse supprimée → override', () => {
  const seg = { chord: 'C/E' };
  const r = normalizeOverride(seg, { root: 0, quality: '', bass: null });
  assert(r !== null, `expected override for removed bass`);
  assert(r.bass === null);
});

runTest('normalizeOverride — null explicite → null', () => {
  const seg = { chord: 'Cmaj7' };
  assert(normalizeOverride(seg, null) === null, `expected null`);
});

runTest('normalizeOverride — identique avec bémol/dièse → null', () => {
  const seg = { chord: 'Bb' };
  const r = normalizeOverride(seg, { root: 10, quality: '', bass: null });
  assert(r === null, `expected null for enharmonic match, got ${JSON.stringify(r)}`);
});

// ---------------------------------------------------------------------------
// Immutabilité de detected_chord
// ---------------------------------------------------------------------------
runTest('getEffectiveChord — ne modifie pas chord (détection intacte)', () => {
  const seg = { chord: 'Dm7', manualOverride: { root: 0, quality: 'maj7', bass: null } };
  const before = seg.chord;
  getEffectiveChord(seg);
  assert(seg.chord === before, `detected chord modifié: ${before} → ${seg.chord}`);
});

runTest('normalizeOverride — ne modifie pas le segment', () => {
  const seg = { chord: 'G7' };
  const beforeChord = seg.chord;
  normalizeOverride(seg, { root: 0, quality: '', bass: null });
  assert(seg.chord === beforeChord, `segment.chord modifié`);
  assert(seg.manualOverride === undefined, `segment.manualOverride créé par normalizeOverride`);
});

// ---------------------------------------------------------------------------
// NOTE_NAMES cohérence
// ---------------------------------------------------------------------------
runTest('NOTE_NAMES — 12 noms', () => {
  assert(NOTE_NAMES.length === 12, `expected 12, got ${NOTE_NAMES.length}`);
});

runTest('NOTE_NAMES — dièses seulement', () => {
  const hasFlat = NOTE_NAMES.some((n) => n.includes('b'));
  assert(!hasFlat, `contient un bémol: ${NOTE_NAMES}`);
});

// ---------------------------------------------------------------------------
// QUALITY_OPTIONS — doit correspondre à CHORD_DEFINITIONS
// ---------------------------------------------------------------------------
runTest('QUALITY_OPTIONS — contient les 10 qualités V1', () => {
  const values = QUALITY_OPTIONS.map((o) => o.value);
  const expected = ['', 'm', '7', 'maj7', 'm7', 'm7b5', 'dim', 'aug', 'sus2', 'sus4'];
  for (const v of expected) {
    assert(values.includes(v), `qualité manquante: "${v}"`);
  }
  assert(values.length === expected.length, `attendu ${expected.length}, got ${values.length}`);
});

// ---------------------------------------------------------------------------
// Cas particuliers
// ---------------------------------------------------------------------------
runTest('override — racine modifiée, qualité conservée', () => {
  const seg = { chord: 'Cmaj7' };
  const r = normalizeOverride(seg, { root: 7, quality: 'maj7', bass: null });
  assert(r !== null, `devrait être un override`);
  assert(r.root === 7, `root expected 7`);
  assert(r.quality === 'maj7', `quality should stay maj7`);
});

runTest('override — qualité modifiée, racine conservée', () => {
  const seg = { chord: 'C' };
  const r = normalizeOverride(seg, { root: 0, quality: 'm7', bass: null });
  assert(r !== null, `devrait être un override`);
  assert(r.root === 0, `root should stay 0`);
  assert(r.quality === 'm7', `quality expected m7`);
});

runTest('override — ajout basse', () => {
  const seg = { chord: 'C' };
  const r = normalizeOverride(seg, { root: 0, quality: '', bass: 7 });
  assert(r !== null, `override should not be null`);
  assert(r.bass === 7, `bass expected 7`);
});

runTest('override — suppression basse', () => {
  const seg = { chord: 'C/E' };
  const r = normalizeOverride(seg, { root: 0, quality: '', bass: null });
  assert(r !== null, `override should not be null`);
  assert(r.bass === null, `bass expected null`);
});

runTest('override — identique détection → null (override ignoré)', () => {
  const seg = { chord: 'Dm7' };
  const r = normalizeOverride(seg, { root: 2, quality: 'm7', bass: null });
  assert(r === null, `identique should yield null`);
});

// ---------------------------------------------------------------------------
// Affichage des notes — via formatEffectChord + NOTE_NAMES
// ---------------------------------------------------------------------------
runTest('notes m7b5 — pas de bug', () => {
  const effective = formatEffectiveChord(11, 'm7b5', null);
  // Bm7b5 → notes: B(11), D(2), F(5), A(9)
  const rootPc = 11;
  const intervals = [0, 3, 6, 10];
  const notePcs = intervals.map((i) => (rootPc + i) % 12);
  const noteNames = notePcs.map((pc) => NOTE_NAMES[pc]);
  assert(effective === 'Bm7b5', `effective chord: ${effective}`);
  assert(noteNames.join(',') === 'B,D,F,A', `notes: ${noteNames.join(',')}`);
});

runTest('notes sus4 — correct', () => {
  const effective = formatEffectiveChord(7, 'sus4', null);
  assert(effective === 'Gsus4', `effective chord: ${effective}`);
});

// ---------------------------------------------------------------------------
// N (pas d'accord) — parse et format
// ---------------------------------------------------------------------------
runTest('parse N, format effectif par défaut', () => {
  const seg = { chord: 'N', manualOverride: null };
  const eff = getEffectiveChord(seg);
  assert(eff === 'N', `effective chord expected 'N', got '${eff}'`);
});

// ---------------------------------------------------------------------------
// Undo/redo — vérification des données
// ---------------------------------------------------------------------------
runTest('normalizeOverride — cycle null→override→null', () => {
  const seg = { chord: 'C' };
  // Premier override
  const override1 = normalizeOverride(seg, { root: 7, quality: '7', bass: null });
  assert(override1 !== null, `premier override ne doit pas être null`);
  // Revenir à détection
  const back = normalizeOverride(seg, { root: 0, quality: '', bass: null });
  assert(back === null, `retour à détection doit être null`);
});

// ---------------------------------------------------------------------------
// Timeline readability
// ---------------------------------------------------------------------------
runTest('timeline — block width based on duration × PPS, no min-width', () => {
  const pps = 80;
  const duration = 0.25; // 250ms → 20px at 100%
  const gap = 4;
  const timeWidth = Math.max(duration * pps - gap, 0);
  assert(timeWidth === 16, `timeWidth for 250ms: ${timeWidth}`);

  const longDuration = 2.0; // 2s → 160px
  const longWidth = Math.max(longDuration * pps - gap, 0);
  assert(longWidth === 156, `timeWidth for 2s: ${longWidth}`);
});

runTest('timeline — very narrow block (< 24px) gets micro class', () => {
  const pps = 80 * 0.25; // 25% zoom
  const duration = 0.5; // 500ms → 10px at 25%
  const gap = 4;
  const timeWidth = Math.max(duration * pps - gap, 0);
  assert(timeWidth === 6 || timeWidth === 10 - gap, `timeWidth at 25%: ${timeWidth}`);
  assert(timeWidth < 24, `should be micro (< 24px): ${timeWidth}`);
});

runTest('timeline — adequate width shows text', () => {
  const pps = 80; // 100% zoom
  const duration = 2.0; // 2s → 160px - gap
  const gap = 4;
  const timeWidth = Math.max(duration * pps - gap, 0);
  assert(timeWidth >= 100, `adequate width: ${timeWidth}`);
});

runTest('timeline — full chord in tooltip always', () => {
  const chordStr = 'Cmaj7';
  const isOverridden = false;
  const originalDetected = chordStr;
  const effectiveChordStr = chordStr;
  const tooltip = `${effectiveChordStr}  00:00 → 02:00  (2.0s)`;
  assert(tooltip.includes('Cmaj7'), `tooltip should contain Cmaj7`);
});

runTest('timeline — overridden chord in tooltip', () => {
  const originalDetected = 'Fmaj7';
  const effectiveChordStr = 'Fm7/D';
  const tooltip = `Corrigé manuellement — ${originalDetected} → ${effectiveChordStr}  00:01 → 00:03  (2.0s)`;
  assert(tooltip.includes('Fm7/D'), `tooltip should contain Fm7/D`);
  assert(tooltip.includes('Fmaj7'), `tooltip should contain original Fmaj7`);
});

runTest('timeline — effectiveChord unchanged after zoom', () => {
  const chord = { chord: 'G7', manualOverride: { root: 0, quality: 'maj7', bass: null } };
  const effective = formatEffectiveChord(0, 'maj7', null);
  assert(effective === 'Cmaj7', `effective: ${effective}`);
  // The chord object's detected chord is unchanged
  assert(chord.chord === 'G7', `detected unchanged: ${chord.chord}`);
});

// ---------------------------------------------------------------------------
// Segment invalide — pas d'exception
// ---------------------------------------------------------------------------
runTest('parseChordSymbol — symbole non reconnu sans exception', () => {
  const r = parseChordSymbol('X');
  assert(r.root === 0, `root expected 0`);
  assert(r.quality === '', `quality expected ''`);
});

// ---------------------------------------------------------------------------
// deriveChordDisplay
// ---------------------------------------------------------------------------
runTest('deriveChordDisplay — Fmaj7 chord tones corrects', () => {
  const d = deriveChordDisplay('Fmaj7');
  assert(d.symbol === 'Fmaj7', `symbol: ${d.symbol}`);
  assert(d.rootPc === 5, `rootPc: ${d.rootPc}`);
  assert(d.quality === 'maj7', `quality: ${d.quality}`);
  assert(d.bassPc === null, `bassPc: ${d.bassPc}`);
  // Fmaj7 intervals [0,4,7,11] → PCs (5+0,5+4,5+7,5+11) = (5,9,0,4) sorted [0,4,5,9]
  assert(arraysMatch(d.chordTonePcs, [0, 4, 5, 9]), `chordTonePcs: ${d.chordTonePcs}`);
  assert(d.bassName === null, `bassName: ${d.bassName}`);
  assert(arraysMatch(d.allPcs, [0, 4, 5, 9]), `allPcs: ${d.allPcs}`);
});

runTest('deriveChordDisplay — Fm7/D : chord tones + slash bass + pas de A naturel', () => {
  const d = deriveChordDisplay('Fm7/D');
  assert(d.symbol === 'Fm7/D', `symbol: ${d.symbol}`);
  assert(d.rootPc === 5, `rootPc: ${d.rootPc}`);
  assert(d.quality === 'm7', `quality: ${d.quality}`);
  assert(d.bassPc === 2, `bassPc: ${d.bassPc}`);
  // Fm7 intervals [0,3,7,10] → PCs (5,8,0,3) sorted [0,3,5,8]
  assert(arraysMatch(d.chordTonePcs, [0, 3, 5, 8]), `chordTonePcs: ${d.chordTonePcs}`);
  // NOTE_NAMES uses sharps: 3=D#, 8=G#
  assert(arraysMatch(d.chordToneNames, ['C', 'D#', 'F', 'G#']), `chordToneNames: ${d.chordToneNames}`);
  assert(d.bassName === 'D', `bassName: ${d.bassName}`);
  // A = 9 ne doit PAS apparaître
  assert(!d.chordTonePcs.includes(9), 'A (PC 9) ne doit pas être dans chordTonePcs');
  assert(!d.allPcs.includes(9), 'A (PC 9) ne doit pas être dans allPcs');
  // all sounding = chord tones + bass D (2)
  assert(arraysMatch(d.allPcs, [0, 2, 3, 5, 8]), `allPcs: ${d.allPcs}`);
  assert(arraysMatch(d.allNames, ['C', 'D', 'D#', 'F', 'G#']), `allNames: ${d.allNames}`);
});

runTest('deriveChordDisplay — Gm7b5 notes correctes', () => {
  const d = deriveChordDisplay('Gm7b5');
  assert(d.symbol === 'Gm7b5');
  // Gm7b5 intervals [0,3,6,10] → PCs (7,10,1,5) sorted [1,5,7,10]
  // NOTE_NAMES: 1=C#, 5=F, 7=G, 10=A#
  assert(arraysMatch(d.chordTonePcs, [1, 5, 7, 10]), `chordTonePcs: ${d.chordTonePcs}`);
  assert(arraysMatch(d.chordToneNames, ['C#', 'F', 'G', 'A#']), `chordToneNames: ${d.chordToneNames}`);
  assert(d.bassPc === null);
});

runTest('deriveChordDisplay — Fsus4 notes correctes', () => {
  const d = deriveChordDisplay('Fsus4');
  // Fsus4 intervals [0,5,7] → PCs (5,10,0) sorted [0,5,10]
  // NOTE_NAMES: 0=C, 5=F, 10=A#
  assert(arraysMatch(d.chordTonePcs, [0, 5, 10]), `chordTonePcs: ${d.chordTonePcs}`);
  assert(arraysMatch(d.chordToneNames, ['C', 'F', 'A#']), `chordToneNames: ${d.chordToneNames}`);
});

runTest('deriveChordDisplay — N sans accord', () => {
  const d = deriveChordDisplay('N');
  assert(d.symbol === 'N');
  assert(d.rootPc === null);
  assert(d.chordTonePcs.length === 0);
});

runTest('deriveChordDisplay — C (majeur) triad', () => {
  const d = deriveChordDisplay('C');
  assert(arraysMatch(d.chordTonePcs, [0, 4, 7]), `chordTonePcs: ${d.chordTonePcs}`);
  assert(arraysMatch(d.chordToneNames, ['C', 'E', 'G']), `chordToneNames: ${d.chordToneNames}`);
});

runTest('deriveChordDisplay — Am (mineur) triad', () => {
  const d = deriveChordDisplay('Am');
  // Am intervals [0,3,7] → PCs (9,0,4) sorted [0,4,9]
  assert(arraysMatch(d.chordTonePcs, [0, 4, 9]), `chordTonePcs: ${d.chordTonePcs}`);
});

runTest('deriveChordDisplay — C/E (slash majeur)', () => {
  const d = deriveChordDisplay('C/E');
  assert(d.bassPc === 4, `bassPc: ${d.bassPc}`);
  assert(d.bassName === 'E', `bassName: ${d.bassName}`);
  // C triad = C-E-G (0, 4, 7), bass already in chord
  assert(arraysMatch(d.chordTonePcs, [0, 4, 7]), `chordTonePcs: ${d.chordTonePcs}`);
  // allPcs includes bass (already in chord tones)
  assert(arraysMatch(d.allPcs, [0, 4, 7]), `allPcs: ${d.allPcs}`);
});

runTest('deriveChordDisplay — Dm7/F (basse déjà dans accord)', () => {
  const d = deriveChordDisplay('Dm7/F');
  // Dm7 intervals [0,3,7,10] → PCs (2,5,9,0) sorted [0,2,5,9]
  assert(arraysMatch(d.chordTonePcs, [0, 2, 5, 9]), `chordTonePcs: ${d.chordTonePcs}`);
  assert(d.bassPc === 5, `bassPc: ${d.bassPc}`);
  // F = 5 already in chord tones
  assert(arraysMatch(d.allPcs, [0, 2, 5, 9]), `allPcs: ${d.allPcs}`);
});

runTest('deriveChordDisplay — G7/B (basse est la tierce)', () => {
  const d = deriveChordDisplay('G7/B');
  // G7 intervals [0,4,7,10] → PCs (7,11,2,5) sorted [2,5,7,11]
  assert(arraysMatch(d.chordTonePcs, [2, 5, 7, 11]), `chordTonePcs: ${d.chordTonePcs}`);
  assert(d.bassPc === 11, `bassPc: ${d.bassPc}`);
  // B = 11 already in chord tones (the third of G7)
  assert(arraysMatch(d.allPcs, [2, 5, 7, 11]), `allPcs: ${d.allPcs}`);
});

runTest('deriveChordDisplay — retour à détection pas de cache', () => {
  const d1 = deriveChordDisplay('Fm7/D');
  assert(d1.bassPc === 2, `override: bassPc should be 2`);
  assert(d1.chordTonePcs.includes(8), `override: G#/Ab (8) should be present`);

  const d2 = deriveChordDisplay('Fmaj7');
  assert(d2.bassPc === null, `detected: bassPc should be null`);
  assert(d2.chordTonePcs.includes(9), `detected: A (9) should be present`);
  assert(!d2.chordTonePcs.includes(8), `detected: G#/Ab (8) should not be present`);
});

runTest('deriveChordDisplay — Fmaj7 → Fsus4 changement correct', () => {
  const d = deriveChordDisplay('Fsus4');
  // Fsus4 intervals [0,5,7] → PCs (5,10,0) sorted [0,5,10]
  assert(arraysMatch(d.chordTonePcs, [0, 5, 10]), `Fsus4 Pcs: ${d.chordTonePcs}`);
  assert(arraysMatch(d.chordToneNames, ['C', 'F', 'A#']), `Fsus4 names: ${d.chordToneNames}`);
});

runTest('deriveChordDisplay — arg vide/null return propre', () => {
  const d1 = deriveChordDisplay('');
  assert(d1.symbol === 'N', `empty symbol: ${d1.symbol}`);
  const d2 = deriveChordDisplay(null);
  assert(d2.symbol === 'N', `null symbol: ${d2.symbol}`);
});

function arraysMatch(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

console.log('\nTests Phase A — Chord Editor terminés.');
