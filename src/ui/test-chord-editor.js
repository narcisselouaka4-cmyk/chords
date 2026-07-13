import {
  makeSegmentId,
  parseChordSymbol,
  formatEffectiveChord,
  getEffectiveChord,
  normalizeOverride,
  deriveChordDisplay,
  NOTE_NAMES,
  QUALITY_OPTIONS,
  buildProjectPath,
  buildProjectData,
  validateProjectSchema,
  verifyAudioIdentity,
  findTemporalFallback,
  tryApplyProjectOverrides,
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

// ---------------------------------------------------------------------------
// Phase B : Persistance
// ---------------------------------------------------------------------------

function makeSegments() {
  return [
    { startTime: 0, endTime: 2, chord: 'C', segmentId: makeSegmentId({ startTime: 0, endTime: 2, chord: 'C' }), manualOverride: null },
    { startTime: 2, endTime: 4, chord: 'G7', segmentId: makeSegmentId({ startTime: 2, endTime: 4, chord: 'G7' }), manualOverride: null },
    { startTime: 4, endTime: 6, chord: 'Am7', segmentId: makeSegmentId({ startTime: 4, endTime: 6, chord: 'Am7' }), manualOverride: null },
  ];
}

runTest('Phase B — buildProjectPath transforme chemin audio', () => {
  const p = buildProjectPath('/home/test/audio.mp3');
  assert(p === '/home/test/audio.pjc.json', `path: ${p}`);
});

runTest('Phase B — buildProjectPath null si chemin vide', () => {
  assert(buildProjectPath(null) === null, 'null input');
  assert(buildProjectPath('') === null, 'empty input');
});

runTest('Phase B — buildProjectPath gère chemins sans extension', () => {
  const p = buildProjectPath('/home/test/file');
  assert(p === '/home/test/file.pjc.json', `path: ${p}`);
});

runTest('Phase B — buildProjectData sans overrides', () => {
  const identity = { path: '/test.mp3', size: 1000, duration: 30, modifiedAt: 12345 };
  const data = buildProjectData(identity, makeSegments());
  assert(data.schemaVersion === 1, `schemaVersion: ${data.schemaVersion}`);
  assert(data.audio.path === '/test.mp3', `audio.path: ${data.audio.path}`);
  assert(Object.keys(data.manualChordOverrides).length === 0, `overrides length: ${Object.keys(data.manualChordOverrides).length}`);
  assert(data.analysis.segmentSignatureVersion === 1, `segmentSignatureVersion`);
});

runTest('Phase B — buildProjectData avec overrides', () => {
  const identity = { path: '/test.mp3', size: 1000, duration: 30, modifiedAt: 12345 };
  const segments = makeSegments();
  segments[1].manualOverride = { root: 0, quality: 'maj7', bass: null };
  const data = buildProjectData(identity, segments);
  assert(Object.keys(data.manualChordOverrides).length === 1, `overrides: ${Object.keys(data.manualChordOverrides).length}`);
  const key = segments[1].segmentId;
  assert(data.manualChordOverrides[key] !== undefined, 'override present');
  assert(data.manualChordOverrides[key].root === 0, 'root=0');
  assert(data.manualChordOverrides[key].quality === 'maj7', 'quality=maj7');
  assert(data.manualChordOverrides[key].bass === null, 'bass=null');
  assert(typeof data.manualChordOverrides[key].editedAt === 'string', 'editedAt present');
  assert(data.manualChordOverrides[key].source === 'user', 'source=user');
  assert(data.manualChordOverrides[key].startTime === 2, 'startTime stocké');
  assert(data.manualChordOverrides[key].endTime === 4, 'endTime stocké');
  assert(data.manualChordOverrides[key].detectedChord === 'G7', 'detectedChord stocké');
});

runTest('Phase B — buildProjectData ne modifie pas les originaux', () => {
  const segments = makeSegments();
  const origChord = segments[0].chord;
  buildProjectData({ path: '/x', size: 0, duration: 0, modifiedAt: 0 }, segments);
  assert(segments[0].chord === origChord, 'chord inchangé');
});

runTest('Phase B — validateProjectSchema valide un projet correct', () => {
  const data = {
    schemaVersion: 1,
    audio: { path: '/test.mp3', size: 1000, duration: 30, modifiedAt: 0 },
    analysis: { segmentSignatureVersion: 1 },
    manualChordOverrides: {},
    orphanedOverrides: {},
  };
  assert(validateProjectSchema(data) === true, 'devrait être valide');
});

runTest('Phase B — validateProjectSchema rejette schemaVersion invalide', () => {
  assert(validateProjectSchema(null) === false, 'null');
  assert(validateProjectSchema({}) === false, 'objet vide');
  assert(validateProjectSchema({ schemaVersion: 2 }) === false, 'version 2');
  assert(validateProjectSchema({ schemaVersion: 1, audio: null }) === false, 'audio null');
  assert(validateProjectSchema({ schemaVersion: 1, audio: {} }) === false, 'audio sans path');
  assert(validateProjectSchema({ schemaVersion: 1, audio: { path: '/x' }, manualChordOverrides: null }) === false, 'overrides null');
});

runTest('Phase B — verifyAudioIdentity correspondance', () => {
  const saved = { path: '/a.mp3', size: 1000, duration: 30, modifiedAt: 12345 };
  const current = { path: '/a.mp3', size: 1000, duration: 30, modifiedAt: 12345 };
  assert(verifyAudioIdentity(saved, current) === true, 'identique');
});

runTest('Phase B — verifyAudioIdentity chemin différent', () => {
  const saved = { path: '/a.mp3', size: 1000 };
  const current = { path: '/b.mp3', size: 1000 };
  assert(verifyAudioIdentity(saved, current) === false, 'path différent');
});

runTest('Phase B — verifyAudioIdentity taille différente', () => {
  const saved = { path: '/a.mp3', size: 1000, modifiedAt: 12345 };
  const current = { path: '/a.mp3', size: 2000, modifiedAt: 12345 };
  assert(verifyAudioIdentity(saved, current) === false, 'size différent');
});

runTest('Phase B — verifyAudioIdentity taille zero ignorée', () => {
  const saved = { path: '/a.mp3', size: 0, modifiedAt: 0 };
  const current = { path: '/a.mp3', size: 1000, modifiedAt: 12345 };
  // Quand l'une des deux tailles est 0 (non disponible), on ignore la vérification
  assert(verifyAudioIdentity(saved, current) === true, 'size zero ignoré');
});

runTest('Phase B — verifyAudioIdentity null safe', () => {
  assert(verifyAudioIdentity(null, {}) === false, 'saved null');
  assert(verifyAudioIdentity({}, null) === false, 'current null');
});

runTest('Phase B — findTemporalFallback retourne null si pas de timing', () => {
  const segments = makeSegments();
  const overrideData = { root: 0, quality: 'maj7', bass: null };
  assert(findTemporalFallback(overrideData, segments) === null, 'pas de timing');
});

runTest('Phase B — findTemporalFallback correspondance temporelle', () => {
  const segments = makeSegments();
  const overrideData = { startTime: 2, endTime: 4, root: 0, quality: 'maj7', bass: null };
  const match = findTemporalFallback(overrideData, segments);
  assert(match !== null, 'devrait trouver un match');
  assert(match.startTime === 2, `startTime: ${match.startTime}`);
  assert(match.endTime === 4, `endTime: ${match.endTime}`);
});

runTest('Phase B — findTemporalFallback pas de match temporel', () => {
  const segments = makeSegments();
  const overrideData = { startTime: 10, endTime: 12, root: 0, quality: 'maj7', bass: null };
  assert(findTemporalFallback(overrideData, segments) === null, 'pas de match');
});

runTest('Phase B — findTemporalFallback ambiguïté retourne null', () => {
  // Deux segments qui se chevauchent avec le même temps → ambigu
  const segments = [
    { startTime: 1, endTime: 5, chord: 'C', manualOverride: null },
    { startTime: 2, endTime: 6, chord: 'G', manualOverride: null },
  ];
  const overrideData = { startTime: 2, endTime: 5, root: 0, quality: 'maj7', bass: null };
  assert(findTemporalFallback(overrideData, segments) === null, 'ambigu');
});

runTest('Phase B — findTemporalFallback overlap insuffisant', () => {
  const segments = makeSegments();
  const overrideData = { startTime: 2.5, endTime: 2.8, root: 0, quality: 'maj7', bass: null };
  // overlap (0.3s) / min(origDur=0.3, segDur=2) = 1.0 → OK
  // durRatio = |0.3-2|/max(0.3,2) = 1.7/2 = 0.85 > 0.2 → FAIL
  assert(findTemporalFallback(overrideData, segments) === null, 'durée trop différente');
});

runTest('Phase B — tryApplyProjectOverrides chargement par segment_id exact', () => {
  const segments = makeSegments();
  const segmentId = segments[1].segmentId;
  const projectData = {
    schemaVersion: 1,
    audio: { path: '/test.mp3' },
    analysis: { segmentSignatureVersion: 1 },
    manualChordOverrides: {
      [segmentId]: { root: 0, quality: 'maj7', bass: null },
    },
    orphanedOverrides: {},
  };
  const { applied, orphaned } = tryApplyProjectOverrides(projectData, segments);
  assert(applied.length === 1, `applied: ${applied.length}`);
  assert(Object.keys(orphaned).length === 0, `orphaned: ${Object.keys(orphaned).length}`);
  assert(applied[0].temporal === false, 'exact match, pas temporel');
  assert(segments[1].manualOverride !== null, 'override appliqué');
  assert(segments[1].manualOverride.root === 0, 'root=0');
  assert(segments[1].manualOverride.quality === 'maj7', 'quality=maj7');
});

runTest('Phase B — tryApplyProjectOverrides chargement temporel', () => {
  const segments = makeSegments();
  // Utilise un segment_id qui n'existe pas, mais les temps correspondent
  const fakeId = 'seg_unknown';
  const projectData = {
    schemaVersion: 1,
    audio: { path: '/test.mp3' },
    analysis: { segmentSignatureVersion: 1 },
    manualChordOverrides: {
      [fakeId]: {
        root: 0, quality: 'maj7', bass: null,
        startTime: 0, endTime: 2, detectedChord: 'C',
      },
    },
    orphanedOverrides: {},
  };
  const { applied, orphaned } = tryApplyProjectOverrides(projectData, segments);
  assert(applied.length === 1, `applied: ${applied.length}`);
  assert(applied[0].temporal === true, 'fallback temporel');
  assert(segments[0].manualOverride !== null, 'override sur segment 0');
  assert(segments[0].manualOverride.root === 0, 'root=0');
});

runTest('Phase B — tryApplyProjectOverrides override identique → null (pas de dirty)', () => {
  const segments = makeSegments();
  const segmentId = segments[0].segmentId; // C
  const projectData = {
    schemaVersion: 1,
    audio: { path: '/test.mp3' },
    analysis: { segmentSignatureVersion: 1 },
    manualChordOverrides: {
      [segmentId]: { root: 0, quality: '', bass: null }, // same as detected C
    },
    orphanedOverrides: {},
  };
  const { applied } = tryApplyProjectOverrides(projectData, segments);
  // L'override est identique à detected → normalizeOverride retourne null
  assert(applied.length === 1, `applied: ${applied.length}`);
  assert(segments[0].manualOverride === null, 'identique → null');
  assert(applied[0].status === 'applied', 'applied status');
});

runTest('Phase B — tryApplyProjectOverrides orphelin si aucun match', () => {
  const segments = makeSegments();
  const projectData = {
    schemaVersion: 1,
    audio: { path: '/test.mp3' },
    analysis: { segmentSignatureVersion: 1 },
    manualChordOverrides: {
      seg_phantom: { root: 7, quality: '7', bass: null, startTime: 20, endTime: 22, detectedChord: 'G' },
    },
    orphanedOverrides: {},
  };
  const { applied, orphaned } = tryApplyProjectOverrides(projectData, segments);
  assert(applied.length === 0, `applied: ${applied.length}`);
  assert(Object.keys(orphaned).length === 1, `orphaned: ${Object.keys(orphaned).length}`);
  assert(orphaned['seg_phantom'] !== undefined, 'orphaned préservé');
});

runTest('Phase B — tryApplyProjectOverrides ne touche pas les autres segments', () => {
  const segments = makeSegments();
  const segmentId = segments[2].segmentId;
  const projectData = {
    schemaVersion: 1,
    audio: { path: '/test.mp3' },
    analysis: { segmentSignatureVersion: 1 },
    manualChordOverrides: {
      [segmentId]: { root: 0, quality: 'maj7', bass: null },
    },
    orphanedOverrides: {},
  };
  tryApplyProjectOverrides(projectData, segments);
  assert(segments[0].manualOverride === null, 'seg0 untouched');
  assert(segments[1].manualOverride === null, 'seg1 untouched');
  assert(segments[2].manualOverride !== null, 'seg2 overridden');
});

runTest('Phase B — tryApplyProjectOverrides overrides multiples', () => {
  const segments = makeSegments();
  const id0 = segments[0].segmentId;
  const id2 = segments[2].segmentId;
  const projectData = {
    schemaVersion: 1,
    audio: { path: '/test.mp3' },
    analysis: { segmentSignatureVersion: 1 },
    manualChordOverrides: {
      [id0]: { root: 7, quality: '7', bass: null },
      [id2]: { root: 5, quality: 'maj7', bass: null },
    },
    orphanedOverrides: {},
  };
  const { applied } = tryApplyProjectOverrides(projectData, segments);
  assert(applied.length === 2, `applied: ${applied.length}`);
  assert(segments[0].manualOverride.root === 7, 'seg0 root=7');
  assert(segments[2].manualOverride.root === 5, 'seg2 root=5');
});

runTest('Phase B — buildProjectData conserve dans orphanedOverrides existant', () => {
  const identity = { path: '/x.mp3', size: 0, duration: 0, modifiedAt: 0 };
  const segments = makeSegments();
  const data = buildProjectData(identity, segments);
  // orphanedOverrides est préservé comme objet vide
  assert(typeof data.orphanedOverrides === 'object', 'orphanedOverrides present');
  assert(Object.keys(data.orphanedOverrides).length === 0, 'orphanedOverrides empty');
});

runTest('Phase B — buildProjectData preserve orphanedOverrides passés', () => {
  const identity = { path: '/x.mp3', size: 0, duration: 0, modifiedAt: 0 };
  const segments = makeSegments();
  const existingOrphans = { seg_old: { root: 0, quality: '', bass: null, startTime: 0, endTime: 1, detectedChord: 'C' } };
  const data = buildProjectData(identity, segments, existingOrphans);
  assert(data.orphanedOverrides.seg_old !== undefined, 'orphan preserved');
});

runTest('Phase B — orphanedOverrides jamais supprimés par tryApply', () => {
  const segments = makeSegments();
  const projectData = {
    schemaVersion: 1,
    audio: { path: '/test.mp3' },
    analysis: { segmentSignatureVersion: 1 },
    manualChordOverrides: {
      seg_phantom: { root: 7, quality: '7', bass: null, startTime: 20, endTime: 22, detectedChord: 'G' },
    },
    orphanedOverrides: { seg_old: { root: 0, quality: '', bass: null, startTime: 0, endTime: 1, detectedChord: 'C' } },
  };
  const { applied, orphaned } = tryApplyProjectOverrides(projectData, segments);
  assert(Object.keys(orphaned).length === 2, 'orphaned conserve nouveaux + anciens');
  assert(orphaned['seg_phantom'] !== undefined, 'phantom');
  assert(orphaned['seg_old'] !== undefined, 'old');
});

console.log('\nTests Phase B — Persistance terminés.');
