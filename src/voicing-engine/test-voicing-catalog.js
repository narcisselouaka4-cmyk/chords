// Tests musicaux du catalogue de voicings par famille.
// Ce fichier compare le moteur contre une fixture de reference ecrite a la main
// (src/voicing-engine/fixtures/REFERENCE_VOICINGS.json) et verifie les proprietes
// structurelles de chaque famille.

import { generateVoicingCatalogFromSymbol } from './generate-voicing-catalog.js';
import { RH_MAX_SPAN } from './hand-ranges.js';
import { resolveRoles } from './families/role-map.js';
import REFERENCE from './fixtures/REFERENCE_VOICINGS.json' with { type: 'json' };

const failures = [];
let total = 0;
let passed = 0;

async function test(name, fn) {
  total++;
  try {
    await fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failures.push({ name, error: err });
    console.log(`  ✗ ${name}: ${err.message}`);
  }
}

function assertEqual(actual, expected, msg = '') {
  if (actual !== expected) {
    throw new Error(`${msg} expected ${expected}, got ${actual}`);
  }
}

function assertTrue(value, msg = '') {
  if (!value) throw new Error(msg || 'expected true');
}

function assertFalse(value, msg = '') {
  if (value) throw new Error(msg || 'expected false');
}

function assertArrayEqual(actual, expected, msg = '') {
  if (actual.length !== expected.length || !actual.every((v, i) => v === expected[i])) {
    throw new Error(`${msg} expected [${expected.join(',')}], got [${actual.join(',')}]`);
  }
}

function pcSet(notes) {
  return notes.map((n) => n % 12);
}

function roleNameForPc(input, pc) {
  const roles = resolveRoles(input);
  return Object.keys(roles).find((r) => roles[r] === pc) || 'unknown';
}

function assertNoIntraHandDoubling(candidate, msg = '') {
  for (const hand of [candidate.lh, candidate.rh]) {
    const seen = new Set();
    for (const note of hand.notes) {
      const pc = note % 12;
      if (seen.has(pc)) {
        throw new Error(`${msg}${hand.hand}: doublure intra-main de pc ${pc}`);
      }
      seen.add(pc);
    }
  }
}

function assertNotesBelongToChord(candidate, msg = '') {
  const allowed = new Set(candidate.input.chordTonePcs);
  const bassPc = candidate.input.bassPc;
  if (bassPc != null) allowed.add(bassPc);
  for (const note of [...candidate.lh.notes, ...candidate.rh.notes]) {
    if (!allowed.has(note % 12)) {
      throw new Error(`${msg}note ${note} (pc ${note % 12}) n'appartient pas a l'accord`);
    }
  }
}

function assertHandsSorted(candidate, msg = '') {
  for (const hand of [candidate.lh, candidate.rh]) {
    for (let i = 1; i < hand.notes.length; i++) {
      if (hand.notes[i] <= hand.notes[i - 1]) {
        throw new Error(`${msg}${hand.hand}: notes non triees`);
      }
    }
  }
}

function assertNoCrossing(candidate, msg = '') {
  if (candidate.lh.notes.length === 0 || candidate.rh.notes.length === 0) return;
  const maxLh = Math.max(...candidate.lh.notes);
  const minRh = Math.min(...candidate.rh.notes);
  if (maxLh > minRh) {
    throw new Error(`${msg}croisement LH/RH: LH max ${maxLh} > RH min ${minRh}`);
  }
}

function assertSpanRhWithin(candidate, maxSpan, msg = '') {
  const rh = candidate.rh.notes;
  if (rh.length < 2) return;
  const span = rh[rh.length - 1] - rh[0];
  if (span > maxSpan) {
    throw new Error(`${msg}span RH ${span} > ${maxSpan}`);
  }
}

function assertIsClose(candidate, msg = '') {
  assertSpanRhWithin(candidate, 12, `${msg}Close: `);
  const expectedBassPc = candidate.input.bassPc ?? candidate.input.rootPc;
  assertTrue(candidate.lh.notes.length === 1 && candidate.lh.notes[0] % 12 === expectedBassPc, `${msg}Close: LH doit etre la basse`);
  const rh = candidate.rh.notes;
  for (let i = 1; i < rh.length; i++) {
    const prevRole = roleNameForPc(candidate.input, rh[i - 1] % 12);
    const curRole = roleNameForPc(candidate.input, rh[i] % 12);
    const order = ['root', 'third', 'fifth', 'seventh', 'ninth', 'eleventh', 'thirteenth'];
    assertTrue(order.indexOf(curRole) >= order.indexOf(prevRole), `${msg}Close: ordre des roles invalide ${prevRole} -> ${curRole}`);
  }
}

function assertIsFourWayClose(candidate, msg = '') {
  assertTrue(candidate.rh.notes.length === 4, `${msg}4-Way Close: RH doit avoir 4 notes`);
  assertSpanRhWithin(candidate, 12, `${msg}4-Way Close: `);
  const expectedBassPc = candidate.input.bassPc ?? candidate.input.rootPc;
  assertTrue(candidate.lh.notes.length === 1 && candidate.lh.notes[0] % 12 === expectedBassPc, `${msg}4-Way Close: LH doit etre la basse`);
  assertIsClose(candidate, msg);
}

function assertIsDrop2(candidate, msg = '') {
  const expectedBassPc = candidate.input.bassPc ?? candidate.input.rootPc;
  assertTrue(candidate.lh.notes.length >= 1 && candidate.lh.notes[0] % 12 === expectedBassPc, `${msg}Drop 2: LH doit commencer par la basse`);

  // Reconstruction du close parent : remonter les voix LH (hors basse) d'une octave + RH.
  const hasSlashBass = candidate.input.bassPc != null && candidate.input.bassPc !== candidate.input.rootPc
    && candidate.lh.notes[0] % 12 === candidate.input.bassPc;
  const lhVoices = hasSlashBass ? candidate.lh.notes.slice(1) : candidate.lh.notes.slice(1);
  const liftedLh = lhVoices.map((n) => n + 12);
  const closeStack = [...liftedLh, ...candidate.rh.notes].sort((a, b) => a - b);
  assertTrue(closeStack.length === 4, `${msg}Drop 2: reconstruction doit avoir 4 notes`);
  assertTrue(closeStack[closeStack.length - 1] - closeStack[0] <= 12, `${msg}Drop 2: reconstruction close span > 12`);

  // La note descendue est la 2e voix depuis le haut du close.
  const droppedNote = Math.max(...lhVoices);
  const secondFromTop = closeStack[closeStack.length - 2];
  assertTrue(droppedNote + 12 === secondFromTop, `${msg}Drop 2: la note descendue ${droppedNote} n'est pas la 2e voix du haut ${secondFromTop}`);

  // Ordre harmonique dans le close reconstruit.
  for (let i = 1; i < closeStack.length; i++) {
    const prevRole = roleNameForPc(candidate.input, closeStack[i - 1] % 12);
    const curRole = roleNameForPc(candidate.input, closeStack[i] % 12);
    const order = ['root', 'third', 'fifth', 'seventh', 'ninth', 'eleventh', 'thirteenth'];
    assertTrue(order.indexOf(curRole) >= order.indexOf(prevRole), `${msg}Drop 2: ordre des roles invalide dans le close ${prevRole} -> ${curRole}`);
  }
}

function assertIsDrop3(candidate, msg = '') {
  const expectedBassPc = candidate.input.bassPc ?? candidate.input.rootPc;
  assertTrue(candidate.lh.notes.length >= 1 && candidate.lh.notes[0] % 12 === expectedBassPc, `${msg}Drop 3: LH doit commencer par la basse`);

  const lhVoices = candidate.lh.notes.slice(1);
  const liftedLh = lhVoices.map((n) => n + 12);
  const closeStack = [...liftedLh, ...candidate.rh.notes].sort((a, b) => a - b);
  assertTrue(closeStack.length === 4, `${msg}Drop 3: reconstruction doit avoir 4 notes`);
  assertTrue(closeStack[closeStack.length - 1] - closeStack[0] <= 12, `${msg}Drop 3: reconstruction close span > 12`);

  const droppedNote = Math.max(...lhVoices);
  const thirdFromTop = closeStack[1];
  assertTrue(droppedNote + 12 === thirdFromTop, `${msg}Drop 3: la note descendue ${droppedNote} n'est pas la 3e voix du haut du close (${thirdFromTop})`);

  for (let i = 1; i < closeStack.length; i++) {
    const prevRole = roleNameForPc(candidate.input, closeStack[i - 1] % 12);
    const curRole = roleNameForPc(candidate.input, closeStack[i] % 12);
    const order = ['root', 'third', 'fifth', 'seventh', 'ninth', 'eleventh', 'thirteenth'];
    assertTrue(order.indexOf(curRole) >= order.indexOf(prevRole), `${msg}Drop 3: ordre des roles invalide dans le close ${prevRole} -> ${curRole}`);
  }
}

function assertIsBlock(candidate, msg = '') {
  assertTrue(candidate.lh.notes.length === 2, `${msg}Block: LH doit avoir 2 notes`);
  assertTrue(candidate.rh.notes.length === 3, `${msg}Block: RH doit avoir 3 notes`);
  const all = [...candidate.lh.notes, ...candidate.rh.notes];
  const unique = new Set(all.map((n) => n % 12));
  assertTrue(unique.size === 5, `${msg}Block: attendu 5 voix distinctes, got ${unique.size}`);
  const span = Math.max(...all) - Math.min(...all);
  assertTrue(span <= 12, `${msg}Block: span total ${span} > 12`);
}

function assertIsStride(candidate, msg = '') {
  const expectedBassPc = candidate.input.bassPc ?? candidate.input.rootPc;
  assertTrue(candidate.lh.notes.length === 1 && candidate.lh.notes[0] % 12 === expectedBassPc, `${msg}Stride: LH doit etre la basse`);
  assertTrue(candidate.rh.notes.length >= 3, `${msg}Stride: RH doit avoir au moins 3 notes`);
  const rhSpan = candidate.rh.notes[candidate.rh.notes.length - 1] - candidate.rh.notes[0];
  assertTrue(rhSpan <= 12, `${msg}Stride: RH ne forme pas un close (span ${rhSpan})`);
  const gap = candidate.rh.notes[0] - candidate.lh.notes[0];
  assertTrue(gap >= 12, `${msg}Stride: ecart LH/RH ${gap} < 12`);
}

function assertIsOpen(candidate, msg = '') {
  const expectedBassPc = candidate.input.bassPc ?? candidate.input.rootPc;
  assertTrue(candidate.lh.notes.length === 1 && candidate.lh.notes[0] % 12 === expectedBassPc, `${msg}Open: LH doit etre la basse`);
  assertTrue(candidate.rh.notes.length >= 3, `${msg}Open: RH doit avoir au moins 3 notes`);
  const rhSpan = candidate.rh.notes[candidate.rh.notes.length - 1] - candidate.rh.notes[0];
  assertTrue(rhSpan > 12, `${msg}Open: RH n'est pas elargi (span ${rhSpan})`);
}

function assertIsSpread(candidate, msg = '') {
  const expectedBassPc = candidate.input.bassPc ?? candidate.input.rootPc;
  assertTrue(candidate.lh.notes.length === 1 && candidate.lh.notes[0] % 12 === expectedBassPc, `${msg}Spread: LH doit etre la basse`);
  assertTrue(candidate.rh.notes.length >= 3, `${msg}Spread: RH doit avoir au moins 3 notes`);
  const rhSpan = candidate.rh.notes[candidate.rh.notes.length - 1] - candidate.rh.notes[0];
  assertTrue(rhSpan > 12, `${msg}Spread: RH span ${rhSpan} n'est pas etale`);
  const octaves = new Set(candidate.rh.notes.map((n) => Math.floor(n / 12)));
  assertTrue(octaves.size >= 3, `${msg}Spread: RH reparti sur moins de 3 octaves`);
}

function assertIsQuartal(candidate, msg = '') {
  const expectedBassPc = candidate.input.bassPc ?? candidate.input.rootPc;
  assertTrue(candidate.lh.notes.length === 1 && candidate.lh.notes[0] % 12 === expectedBassPc, `${msg}Quartal: LH doit etre la basse`);
  assertTrue(candidate.rh.notes.length >= 3, `${msg}Quartal: RH doit avoir au moins 3 notes`);
  const sorted = [...candidate.rh.notes].sort((a, b) => a - b);
  for (let i = 1; i < sorted.length; i++) {
    const diff = sorted[i] - sorted[i - 1];
    assertTrue([5, 6, 7].includes(diff), `${msg}Quartal: ecart ${diff} n'est pas une quarte`);
  }
}

function assertIsSoWhat(candidate, msg = '') {
  const expectedBassPc = candidate.input.bassPc ?? candidate.input.rootPc;
  assertTrue(candidate.lh.notes.length === 1 && candidate.lh.notes[0] % 12 === expectedBassPc, `${msg}So What: LH doit etre la basse`);
  assertTrue(candidate.rh.notes.length === 3, `${msg}So What: RH doit avoir 3 notes`);
  assertIsQuartal(candidate, msg);
}

function assertIsUpperStructure(candidate, msg = '') {
  const expectedBassPc = candidate.input.bassPc ?? candidate.input.rootPc;
  assertTrue(candidate.lh.notes.length === 1 && candidate.lh.notes[0] % 12 === expectedBassPc, `${msg}Upper Structure: LH doit etre la basse`);
  assertTrue(candidate.rh.notes.length === 3, `${msg}Upper Structure: RH doit avoir 3 notes`);
  const rhSpan = candidate.rh.notes[candidate.rh.notes.length - 1] - candidate.rh.notes[0];
  assertTrue(rhSpan <= 12, `${msg}Upper Structure: RH ne forme pas un close`);
  const rhPcs = new Set(candidate.rh.notes.map((n) => n % 12));
  assertFalse(rhPcs.has(candidate.input.rootPc), `${msg}Upper Structure: fondamentale interdite en RH`);
  const allowed = new Set(candidate.input.chordTonePcs);
  for (const pc of rhPcs) {
    assertTrue(allowed.has(pc), `${msg}Upper Structure: note ${pc} hors accord`);
  }
}

function assertIsShell(candidate, msg = '') {
  const expectedBassPc = candidate.input.bassPc ?? candidate.input.rootPc;
  assertTrue(candidate.lh.notes.length === 1 && candidate.lh.notes[0] % 12 === expectedBassPc, `${msg}Shell: LH doit etre la basse`);
  assertTrue(candidate.rh.notes.length >= 2, `${msg}Shell: RH doit avoir au moins 2 notes`);
  const rhPcs = new Set(candidate.rh.notes.map((n) => n % 12));
  const roles = resolveRoles(candidate.input);
  assertTrue(rhPcs.has(roles.third), `${msg}Shell: tierce manquante en RH`);
  assertTrue(rhPcs.has(roles.seventh), `${msg}Shell: septieme manquante en RH`);
  assertSpanRhWithin(candidate, 12, `${msg}Shell: `);
}

function assertIsTwoNoteShell(candidate, msg = '') {
  const expectedBassPc = candidate.input.bassPc ?? candidate.input.rootPc;
  assertTrue(candidate.lh.notes.length === 1 && candidate.lh.notes[0] % 12 === expectedBassPc, `${msg}Two-Note Shell: LH doit etre la basse`);
  assertTrue(candidate.rh.notes.length === 1, `${msg}Two-Note Shell: RH doit contenir exactement 1 note`);
  const rhPc = candidate.rh.notes[0] % 12;
  const roles = resolveRoles(candidate.input);
  const isThird = roles.third != null && rhPc === roles.third;
  const isSeventh = roles.seventh != null && rhPc === roles.seventh;
  assertTrue(isThird || isSeventh, `${msg}Two-Note Shell: RH doit etre la tierce ou la septieme`);
}

function assertIsRootlessA(candidate, msg = '') {
  assertTrue(candidate.lh.notes.length === 0, `${msg}Rootless A: LH doit etre vide`);
  assertTrue(candidate.rh.notes.length === 4, `${msg}Rootless A: RH doit avoir 4 notes`);
  const roles = resolveRoles(candidate.input);
  const rhPcs = new Set(candidate.rh.notes.map((n) => n % 12));
  assertTrue(rhPcs.has(roles.third), `${msg}Rootless A: tierce manquante`);
  assertTrue(rhPcs.has(roles.fifth), `${msg}Rootless A: quinte manquante`);
  assertTrue(rhPcs.has(roles.seventh), `${msg}Rootless A: septieme manquante`);
  assertTrue(rhPcs.has(roles.ninth), `${msg}Rootless A: neuvieme manquante`);
  assertFalse(rhPcs.has(roles.root), `${msg}Rootless A: fondamentale interdite`);
  assertSpanRhWithin(candidate, 12, `${msg}Rootless A: `);
  // Ordre : third < fifth < seventh < ninth
  const ordered = [...candidate.rh.notes].sort((a, b) => a - b);
  const order = ['third', 'fifth', 'seventh', 'ninth'];
  for (let i = 0; i < 4; i++) {
    assertEqual(roleNameForPc(candidate.input, ordered[i] % 12), order[i], `${msg}Rootless A: role ${i} attendu ${order[i]}`);
  }
}

function assertCandidateInvariants(candidate, msg = '') {
  assertNoIntraHandDoubling(candidate, msg);
  assertNotesBelongToChord(candidate, msg);
  assertHandsSorted(candidate, msg);
  assertNoCrossing(candidate, msg);
  assertTrue(candidate.metadata.difficulty >= 1 && candidate.metadata.difficulty <= 5, `${msg}difficulte hors 1..5`);
}

function assertFamilyStructure(candidate, familyId, msg = '') {
  switch (familyId) {
    case 'shell': assertIsShell(candidate, msg); break;
    case 'twoNoteShell': assertIsTwoNoteShell(candidate, msg); break;
    case 'rootlessA': assertIsRootlessA(candidate, msg); break;
    case 'close': assertIsClose(candidate, msg); break;
    case 'fourWayClose': assertIsFourWayClose(candidate, msg); break;
    case 'drop2': assertIsDrop2(candidate, msg); break;
    case 'drop3': assertIsDrop3(candidate, msg); break;
    case 'block': assertIsBlock(candidate, msg); break;
    case 'stride': assertIsStride(candidate, msg); break;
    case 'open': assertIsOpen(candidate, msg); break;
    case 'spread': assertIsSpread(candidate, msg); break;
    case 'quartal': assertIsQuartal(candidate, msg); break;
    case 'soWhat': assertIsSoWhat(candidate, msg); break;
    case 'upperStructure': assertIsUpperStructure(candidate, msg); break;
    default: break;
  }
}

console.log('\n=== Tests musicaux du catalogue de voicings ===');
console.log('Comparaison contre la fixture de reference independante.\n');

for (const [symbol, families] of Object.entries(REFERENCE.accords)) {
  const catalog = generateVoicingCatalogFromSymbol(symbol);

  test(`${symbol}: catalogue valide`, () => {
    assertTrue(catalog.ok, `catalogue invalide: ${catalog.diagnostics?.join('; ')}`);
  });

  for (const [familyId, expected] of Object.entries(families)) {
    test(`${symbol}: ${familyId} correspond a la reference`, () => {
      const entry = catalog.families[familyId];
      if (expected.available) {
        assertTrue(entry != null && entry.available, `${symbol}/${familyId}: devrait etre disponible: ${entry?.reason || 'absent'}`);
        const candidate = entry.candidate;
        assertCandidateInvariants(candidate, `${symbol}/${familyId}: `);
        assertArrayEqual(candidate.lh.notes, expected.lh, `${symbol}/${familyId} LH: `);
        assertArrayEqual(candidate.rh.notes, expected.rh, `${symbol}/${familyId} RH: `);
        assertEqual(candidate.metadata.difficulty, expected.difficulty, `${symbol}/${familyId} difficulte: `);
        assertFamilyStructure(candidate, familyId, `${symbol}/${familyId}: `);
      } else {
        assertFalse(entry?.available, `${symbol}/${familyId}: devrait etre indisponible`);
      }
    });
  }
}

console.log('\n=== Invariants globaux ===');

test('Les familles volontairement non implementees sont affichees "—"', () => {
  const catalog = generateVoicingCatalogFromSymbol('C7');
  const entry = catalog.families.drop2Plus4;
  assertTrue(entry == null || !entry.available, 'drop2Plus4 doit etre indisponible');
});

test('Toutes les familles du catalogue retournent une raison si indisponible', () => {
  const catalog = generateVoicingCatalogFromSymbol('C7');
  for (const [id, entry] of Object.entries(catalog.families)) {
    if (!entry.available) {
      assertTrue(typeof entry.reason === 'string' && entry.reason.length > 0, `famille ${id} indisponible sans raison`);
    }
  }
});

test('generateSingleVoicing conserve la compatibilite descendante', async () => {
  const { generateSingleVoicing } = await import('./generate-voicing-catalog.js');
  const result = generateSingleVoicing({ rootPc: 0, quality: 'maj7' });
  assertTrue(result.ok, result.diagnostics?.join('; '));
  assertEqual(result.selectedCandidate.metadata.familyId, 'close', 'famille par defaut attendue close');
});

console.log('\n=== Recapitulatif ===');
console.log(`Total: ${total}, Passes: ${passed}, Echecs: ${failures.length}`);
if (failures.length > 0) {
  console.log('\nEchecs :');
  for (const f of failures) {
    console.log(`- ${f.name}: ${f.error.message}`);
  }
  process.exitCode = 1;
} else {
  console.log('\nCatalogue de voicings valide avec succes.');
}
