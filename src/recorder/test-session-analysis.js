// [Claude] — 2026-09-11 — Tests du module d'analyse offline des sessions MIDI.

import { createRequire } from 'module';
const require = createRequire(import.meta.url);

global.window = {
  AudioContext: class FakeAudioContext {
    constructor() { this.state = 'suspended'; }
    createGain() { return {}; }
    createOscillator() { return {}; }
    createBiquadFilter() { return {}; }
    createBufferSource() { return {}; }
    decodeAudioData() { return Promise.resolve({}); }
    async resume() { this.state = 'running'; }
    get currentTime() { return 0; }
    get destination() { return {}; }
  },
};

const { segmentSessionEvents, nameChordSegments } = await import('./session-analysis.js');

const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const RESET = '\x1b[0m';

let passed = 0;
let failed = 0;

function check(name, condition, detail = '') {
  if (condition) {
    passed += 1;
    console.log(`${GREEN}✓${RESET} ${name}`);
  } else {
    failed += 1;
    console.log(`${RED}✗${RESET} ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

function createNoteOn(note, time, velocity = 0.8, channel = 0) {
  return { type: 'note_on', note, velocity, channel, time };
}

function createNoteOff(note, time, channel = 0) {
  return { type: 'note_off', note, velocity: 0, channel, time };
}

function createControl(controller, value, time, channel = 0) {
  return { type: 'control', controller, value, channel, time };
}

async function testChordDetection() {
  const events = [
    createNoteOn(60, 0.0),   // C4
    createNoteOn(64, 0.01),  // E4
    createNoteOn(67, 0.02),  // G4
    createNoteOn(71, 0.03),  // B4
    createNoteOff(60, 1.0),
    createNoteOff(64, 1.0),
    createNoteOff(67, 1.0),
    createNoteOff(71, 1.0),
  ];

  const segments = segmentSessionEvents(events);
  const named = nameChordSegments(segments);

  check('Un accord joué ensemble produit un segment chord', named.some((s) => s.type === 'chord'));
  const chordSeg = named.find((s) => s.type === 'chord');
  check('Le segment chord a un nom d\'accord', chordSeg?.chordName !== null && chordSeg?.chordName !== undefined);
  check('Le nom d\'accord est plausible (contient maj7 ou C)', chordSeg?.chordName?.includes('C') || chordSeg?.chordName?.includes('maj7') || chordSeg?.chordName?.includes('Major'));
}

async function testMelodyNoChord() {
  const events = [];
  let time = 0;
  for (let i = 0; i < 10; i++) {
    const note = 60 + i;
    events.push(createNoteOn(note, time));
    events.push(createNoteOff(note, time + 0.3));
    time += 0.35;
  }

  const segments = segmentSessionEvents(events);
  const named = nameChordSegments(segments);

  check('Mélodie note à note : aucun segment chord', !named.some((s) => s.type === 'chord'));
  check('Mélodie note à note : au moins un segment melody', named.some((s) => s.type === 'melody'));
  check('Aucune note isolée n\'est étiquetée chord', named.every((s) => s.type !== 'chord'));
}

async function testChordMelodyChordMelody() {
  const events = [
    // Dm7 chord at 0.5s
    createNoteOn(50, 0.5),   // D3
    createNoteOn(53, 0.51),  // F3
    createNoteOn(57, 0.52),  // A3
    createNoteOn(60, 0.53),  // C4
    createNoteOff(50, 1.5),
    createNoteOff(53, 1.5),
    createNoteOff(57, 1.5),
    createNoteOff(60, 1.5),

    // Melody from 2.0 to 4.0
    createNoteOn(62, 2.0),   // D4
    createNoteOff(62, 2.3),
    createNoteOn(64, 2.4),   // E4
    createNoteOff(64, 2.7),
    createNoteOn(65, 2.8),   // F4
    createNoteOff(65, 3.1),
    createNoteOn(67, 3.2),   // G4
    createNoteOff(67, 3.5),
    createNoteOn(69, 3.6),   // A4
    createNoteOff(69, 3.9),

    // G7 chord at 4.5s
    createNoteOn(55, 4.5),   // G3
    createNoteOn(59, 4.51),  // B3
    createNoteOn(62, 4.52),  // D4
    createNoteOn(65, 4.53),  // F4
    createNoteOff(55, 5.5),
    createNoteOff(59, 5.5),
    createNoteOff(62, 5.5),
    createNoteOff(65, 5.5),

    // Melody from 6.0 to 8.0
    createNoteOn(67, 6.0),   // G4
    createNoteOff(67, 6.3),
    createNoteOn(69, 6.4),   // A4
    createNoteOff(69, 6.7),
    createNoteOn(71, 6.8),   // B4
    createNoteOff(71, 7.1),
    createNoteOn(72, 7.2),   // C5
    createNoteOff(72, 7.5),
    createNoteOn(74, 7.6),   // D5
    createNoteOff(74, 7.9),
  ];

  const segments = segmentSessionEvents(events);
  const named = nameChordSegments(segments);

  const chords = named.filter((s) => s.type === 'chord');
  const melodies = named.filter((s) => s.type === 'melody');

  check('Deux segments chord trouvés', chords.length === 2);
  check('Deux segments melody trouvés', melodies.length === 2);
  check('Ordre correct : chord -> melody -> chord -> melody',
    named[0].type === 'chord' && named[1].type === 'melody' &&
    named[2].type === 'chord' && named[3].type === 'melody');
  check('Premier accord nommé Dm7 ou équivalent', chords[0].chordName?.includes('Minor') || chords[0].chordName?.includes('m7') || chords[0].chordName?.includes('D'));
  check('Deuxième accord nommé G7 ou équivalent', chords[1].chordName?.includes('Dominant') || chords[1].chordName?.includes('7') || chords[1].chordName?.includes('G'));
}

async function testSustainPedal() {
  const events = [
    createNoteOn(60, 0.0),   // C4
    createNoteOff(60, 0.15), // note_off mais pédale tenue
    createNoteOn(64, 0.1),   // E4 (within 200ms of previous)
    createNoteOff(64, 0.25),
    createNoteOn(67, 0.15),  // G4 (within 200ms of previous)
    createNoteOff(67, 0.35),
    createControl(64, 127, 0.0),  // sustain on
    createControl(64, 0, 1.2),    // sustain off
  ];

  const segments = segmentSessionEvents(events);
  const named = nameChordSegments(segments);

  const chordSeg = named.find((s) => s.type === 'chord');
  check('Avec pédale : les notes forment un accord (superposées via sustain)', chordSeg !== undefined);
  if (chordSeg) {
    check('La fin du segment chord correspond au relâchement de la pédale (≈1.2s)', Math.abs(chordSeg.end - 1.2) < 0.15);
  }
}

// [Claude] — 2026-09-24 — Jeu de pianiste réel (Narcisse : « les accords détectés
// et affichés ne sont pas toujours les bons » en Session MIDI).
const chordEvents = (notes, t0, t1, roll = 0.01) => notes.flatMap((n, k) => [createNoteOn(n, t0 + k * roll), createNoteOff(n, t1)]);
const describe = (events) => nameChordSegments(segmentSessionEvents(events))
  .map((s) => (s.type === 'chord' ? s.chordName : `mélodie(${s.notes.length})`)).join(' | ');

async function testPianistPlaying() {
  check('Accord à deux mains (C2 G2 | E4 G4 B4 D5) : Cmaj9, pas de la mélodie',
    describe(chordEvents([36, 43, 64, 67, 71, 74], 0, 2)) === 'Cmaj9', describe(chordEvents([36, 43, 64, 67, 71, 74], 0, 2)));
  const iiVI = [...chordEvents([38, 45, 65, 69, 72, 76], 0, 1.95), ...chordEvents([43, 53, 64, 69, 71], 2, 3.95), ...chordEvents([36, 43, 64, 67, 71, 74], 4, 6)];
  check('II-V-I à deux mains : Dm9, G13 (la 13e comptée), Cmaj9', describe(iiVI) === 'Dm9 | G13 | Cmaj9', describe(iiVI));
  const heldBass = [createNoteOn(36, 0), createNoteOff(36, 4), ...chordEvents([64, 67, 71], 0.02, 1.95), ...chordEvents([65, 69, 72], 2, 4)];
  check('Basse tenue pendant que la main droite change : Cmaj7 puis F/C', describe(heldBass) === 'Cmaj7 | F/C', describe(heldBass));
  const melodyAfter = [...chordEvents([48, 52, 55], 0, 2), createNoteOn(74, 0.15), createNoteOff(74, 0.5)];
  check('Note de mélodie juste après l\'accord : C, puis la mélodie (pas Cadd9)', describe(melodyAfter) === 'C | mélodie(1)', describe(melodyAfter));
  check('Accord roulé (60 ms entre les notes) : Fmaj9', describe(chordEvents([41, 48, 57, 64, 67, 72], 0, 2, 0.06)) === 'Fmaj9');
  const pedalBass = [createControl(64, 127, 0), createNoteOn(38, 0), createNoteOff(38, 0.3), ...chordEvents([53, 57, 60, 64], 0.5, 2.4), createControl(64, 0, 2.45)];
  check('Basse frappée puis gardée à la pédale, rootless F A C E au-dessus : Dm9', describe(pedalBass) === 'Dm9', describe(pedalBass));
  const melodyOver = [...chordEvents([48, 52, 55], 0, 3), createNoteOn(76, 0.5), createNoteOff(76, 0.9), createNoteOn(74, 1.0), createNoteOff(74, 1.4), createNoteOn(72, 1.5), createNoteOff(72, 2.9)];
  check('Mélodie sur un accord tenu : l\'accord ne change pas', describe(melodyOver) === 'C | mélodie(3)', describe(melodyOver));
  const walking = [...chordEvents([60, 64, 67], 0, 4), createNoteOn(36, 0), createNoteOff(36, 1.95), createNoteOn(33, 2), createNoteOff(33, 4)];
  check('Nouvelle basse sous un accord tenu : l\'accord change (C → Am7)', describe(walking) === 'C | Am7', describe(walking));
  const comping = [...chordEvents([50, 53, 57, 60], 0, 0.4), ...chordEvents([50, 53, 57, 60], 0.67, 1.2), ...chordEvents([50, 53, 57, 60], 2, 2.5)];
  check('Même accord rejoué (comping) : un seul segment', describe(comping) === 'Dm7', describe(comping));
  const arpeggio = [41, 48, 57, 64].flatMap((n, k) => [createNoteOn(n, k * 0.15), createNoteOff(n, 2)]);
  check('Arpège lent (150 ms) : un seul accord, complété (Fmaj7)', describe(arpeggio) === 'Fmaj7', describe(arpeggio));
  // [Claude] — 2026-09-24 — Pédale tenue d'un accord à l'autre : Ré2 traîne sous
  // G13, mais la main gauche a frappé sa basse (Sol2) : l'accord joué est G13.
  const blurred = [createControl(64, 127, 0), ...chordEvents([38, 45, 53, 57, 60, 64], 0, 1.2), ...chordEvents([43, 53, 57, 59, 64], 2, 3.2), createControl(64, 0, 3.5)];
  check('Pédale tenue, nouvelle basse frappée : Dm9 puis G13 (pas Fmaj13#11/D)', describe(blurred) === 'Dm9 | G13', describe(blurred));
  const named = nameChordSegments(segmentSessionEvents(chordEvents([36, 43, 64, 67, 71, 74], 0, 2)));
  check('Nom avec sa fondamentale (Cmaj9), plus « Major 9 »', named[0].chordName === 'Cmaj9' && named[0].rootPc === 0 && named[0].symbol === 'maj9');
  check('Notation latine possible (Dom9 → Domaj9)', nameChordSegments(segmentSessionEvents(chordEvents([36, 43, 64, 67, 71, 74], 0, 2)), { latin: true })[0].chordName === 'Domaj9');
}

async function testEmptySession() {
  const segments = segmentSessionEvents([]);
  check('Session vide : liste vide', segments.length === 0);
}

async function runTests() {
  await testChordDetection();
  await testMelodyNoChord();
  await testChordMelodyChordMelody();
  await testSustainPedal();
  await testPianistPlaying();
  await testEmptySession();

  console.log(`\n=== Résultat : ${passed}/${passed + failed} tests passés ===`);
  process.exit(failed === 0 ? 0 : 1);
}

runTests().catch((err) => {
  console.error(err);
  process.exit(1);
});