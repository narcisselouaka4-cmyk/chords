// [Claude] — 2026-09-09 — Tests du générateur de progressions Copilot IA.

import {
  generateCopilotProgression,
  progressionToNoteSequence,
  formatProgressionNotes,
  listProgressionFoci,
  describeProgressionFocus,
} from './copilot-progression.js';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function approxEqual(a, b, epsilon = 0) {
  return Math.abs(a - b) <= epsilon;
}

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed += 1;
    console.error(`  ✗ ${name} : ${err.message}`);
  }
}

console.log('=== test-copilot-progression.js ===');

test('génère un ii-V-I jouable en focus full', () => {
  const prog = generateCopilotProgression(['Dm7', 'G7', 'Cmaj7'], {
    focus: 'full',
    styleId: 'jazz',
    durationMs: 2400,
  });
  assert(prog.isPlayable, `non jouable : ${prog.diagnostics.join('; ')}`);
  assert(prog.chords.length === 3, 'doit avoir 3 accords');
  assert(prog.chords[0].chordSymbol === 'Dm7', 'premier Dm7');
  assert(prog.chords[1].chordSymbol === 'G7', 'second G7');
  assert(prog.chords[2].chordSymbol === 'Cmaj7', 'troisième Cmaj7');
  for (const c of prog.chords) {
    assert(c.leftHand.length >= 1, `basse manquante pour ${c.chordSymbol}`);
    assert(c.rightHand.length >= 2, `main droite trop courte pour ${c.chordSymbol}`);
  }
});

test('focus 7→3 met la guide tone en note aiguë de la RH', () => {
  const prog = generateCopilotProgression(['Dm7', 'G7', 'Cmaj7'], {
    focus: '7-to-3',
    durationMs: 2400,
  });
  assert(prog.isPlayable, `non jouable : ${prog.diagnostics.join('; ')}`);
  const dm7 = prog.chords[0];
  const g7 = prog.chords[1];
  const cmaj7 = prog.chords[2];
  // En focus 7→3, la note la plus aiguë de la RH doit être une guide tone
  // pertinente (3e ou 7e). On vérifie que ce n'est pas la fondamentale.
  const dm7TopPc = dm7.rightHand[dm7.rightHand.length - 1] % 12;
  const g7TopPc = g7.rightHand[g7.rightHand.length - 1] % 12;
  const cmaj7TopPc = cmaj7.rightHand[cmaj7.rightHand.length - 1] % 12;
  // Dm7 : root=2, 3e=5, 7e=0 → la note du haut ne doit pas être la fondamentale (2).
  assert(dm7TopPc !== 2, `note du haut de Dm7 est la fondamentale ${dm7TopPc}`);
  // G7 : root=7, 3e=11, 7e=5 → la note du haut ne doit pas être la fondamentale (7).
  assert(g7TopPc !== 7, `note du haut de G7 est la fondamentale ${g7TopPc}`);
  // Cmaj7 : root=0, 3e=4, 7e=11 → la note du haut ne doit pas être la fondamentale (0).
  assert(cmaj7TopPc !== 0, `note du haut de Cmaj7 est la fondamentale ${cmaj7TopPc}`);
  // La 7e de Dm7 (C) doit être présente dans la RH.
  assert(dm7.rightHand.some((n) => n % 12 === 0), '7e de Dm7 absente');
  // La 3e de G7 (B) doit être présente dans la RH.
  assert(g7.rightHand.some((n) => n % 12 === 11), '3e de G7 absente');
});

test('les mains ne se chevauchent pas', () => {
  const prog = generateCopilotProgression(['Dm7', 'G7', 'Cmaj7'], { focus: 'full' });
  for (const c of prog.chords) {
    const lhMax = Math.max(...c.leftHand);
    const rhMin = Math.min(...c.rightHand);
    assert(rhMin >= lhMax, `chevauchement sur ${c.chordSymbol}`);
  }
});

test('la 3e de G7 est proche de la 7e de Dm7 (voice leading 7→3)', () => {
  const prog = generateCopilotProgression(['Dm7', 'G7', 'Cmaj7'], { focus: '7-to-3' });
  const dm7Top = prog.chords[0].rightHand[prog.chords[0].rightHand.length - 1];
  const g7Top = prog.chords[1].rightHand[prog.chords[1].rightHand.length - 1];
  const distance = Math.abs(g7Top - dm7Top);
  assert(distance <= 4, `distance ${distance} demi-tons entre guide tones`);
});

test('génère une séquence de notes avec offsets croissants', () => {
  const prog = generateCopilotProgression(['Dm7', 'G7', 'Cmaj7'], {
    focus: 'full',
    durationMs: 2400,
    startOffsetMs: 100,
  });
  const notes = progressionToNoteSequence(prog, { pattern: 'block' });
  assert(notes.length > 0, 'aucune note');
  const firstDm7 = notes.filter((n) => n.startOffsetMs === 100);
  const g7Start = notes.find((n) => n.startOffsetMs > 100);
  assert(g7Start, 'G7 n\'a pas démarré après Dm7');
  assert(approxEqual(g7Start.startOffsetMs, 900, 50), `offset G7 inattendu ${g7Start.startOffsetMs}`);
});

test('les accords invalides retournent isPlayable=false', () => {
  const prog = generateCopilotProgression(['XYZ7'], { focus: 'full' });
  assert(!prog.isPlayable, 'doit être non jouable');
  assert(prog.diagnostics.some((d) => d.includes('XYZ7')), 'diagnostic mentionne XYZ7');
});

test('les notes restent dans la tessiture piano 21–108', () => {
  const prog = generateCopilotProgression(['Dm7', 'G7', 'Cmaj7'], { focus: 'full' });
  const notes = progressionToNoteSequence(prog);
  for (const n of notes) {
    assert(n.midi >= 21 && n.midi <= 108, `note hors tessiture ${n.midi}`);
  }
});

test('formatProgressionNotes retourne une chaîne descriptive', () => {
  const prog = generateCopilotProgression(['Dm7', 'G7'], { focus: 'full' });
  const text = formatProgressionNotes(prog);
  assert(text.includes('Dm7'), 'Dm7 manquant');
  assert(text.includes('G7'), 'G7 manquant');
  assert(text.includes('LH'), 'LH manquant');
  assert(text.includes('RH'), 'RH manquant');
});

test('listProgressionFoci et descriptions', () => {
  const foci = listProgressionFoci();
  assert(foci.includes('7-to-3'), '7-to-3 manquant');
  assert(describeProgressionFocus('7-to-3').includes('guide-tone'), 'description incorrecte');
});

test('arpège montant produit des notes ordonnées par MIDI croissant', () => {
  const prog = generateCopilotProgression(['Cmaj7'], { focus: 'full', durationMs: 800 });
  const notes = progressionToNoteSequence(prog, { pattern: 'arppegio-up' });
  for (let i = 1; i < notes.length; i += 1) {
    assert(notes[i].midi >= notes[i - 1].midi, 'arpège non croissant');
  }
});

test('arpège descendant produit des notes ordonnées par MIDI décroissant', () => {
  const prog = generateCopilotProgression(['Cmaj7'], { focus: 'full', durationMs: 800 });
  const notes = progressionToNoteSequence(prog, { pattern: 'arppegio-down' });
  for (let i = 1; i < notes.length; i += 1) {
    assert(notes[i].midi <= notes[i - 1].midi, 'arpège non décroissant');
  }
});

test('style auto devient jazz', () => {
  const prog = generateCopilotProgression(['Dm7', 'G7', 'Cmaj7'], {
    focus: 'full',
    styleId: 'auto',
  });
  assert(prog.isPlayable, 'auto devrait produire un résultat jouable');
});

test('focus guide-tones-only retourne seulement 3e et 7e', () => {
  const prog = generateCopilotProgression(['Dm7', 'G7', 'Cmaj7'], {
    focus: 'guide-tones-only',
  });
  assert(prog.isPlayable, `non jouable : ${prog.diagnostics.join('; ')}`);
  for (const c of prog.chords) {
    assert(c.rightHand.length <= 2, `trop de notes en guide-tones-only pour ${c.chordSymbol}`);
    // Dm7 : 3e=F, 7e=C ; G7 : 3e=B, 7e=F ; Cmaj7 : 3e=E, 7e=B.
    const expected = {
      Dm7: new Set([0, 5]),
      G7: new Set([5, 11]),
      Cmaj7: new Set([4, 11]),
    }[c.chordSymbol];
    const actual = new Set(c.rightHand.map((n) => n % 12));
    for (const pc of expected) {
      assert(actual.has(pc), `guide tone ${pc} manquante pour ${c.chordSymbol}`);
    }
  }
});

test('slash chord preserve la basse à la main gauche', () => {
  const prog = generateCopilotProgression(['Dm7/C'], { focus: 'full' });
  assert(prog.isPlayable, `non jouable : ${prog.diagnostics.join('; ')}`);
  const chord = prog.chords[0];
  assert(chord.leftHand[0] % 12 === 0, 'basse slash doit être Do');
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
