import { createRecorder } from './recorder.js';
import { createPlayer } from './player.js';
import { serializeEventsJson, parseEventsJson, buildMidiFile } from './serializer.js';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function testRecorder() {
  const recorder = createRecorder();
  const events = [];
  recorder.start();
  recorder.noteOn(60, 0.8);
  await sleep(50);
  recorder.noteOn(64, 0.7);
  await sleep(50);
  recorder.noteOff(60);
  await sleep(50);
  recorder.sustain(true);
  await sleep(50);
  recorder.noteOff(64);
  await sleep(50);
  recorder.sustain(false);
  const recorded = recorder.stop();

  console.log('Recorded events:', recorded.length);
  for (const e of recorded) console.log(' ', e.type, e.time.toFixed(3), e.note || e.controller || e.value);

  if (recorded.length !== 6) throw new Error(`Expected 6 events, got ${recorded.length}`);
  if (recorded[0].type !== 'note_on' || recorded[0].note !== 60) throw new Error('First event should be C4 note_on');
  if (recorded[recorded.length - 1].type !== 'control' || recorded[recorded.length - 1].controller !== 64) throw new Error('Last event should be sustain off');

  return recorded;
}

async function testSerializer(events) {
  const json = serializeEventsJson(events);
  const parsed = parseEventsJson(json);
  if (parsed.length !== events.length) throw new Error('JSON roundtrip failed');

  const midi = buildMidiFile(events);
  console.log('MIDI file size:', midi.length, 'bytes');
  if (midi.length < 50) throw new Error('MIDI file too small');

  // Basic MIDI header check
  const header = String.fromCharCode(...midi.slice(0, 4));
  if (header !== 'MThd') throw new Error('Invalid MIDI header');

  return midi;
}

async function testPlayer(events) {
  const received = [];
  const player = createPlayer({
    onNoteOn: (note, velocity) => received.push({ type: 'note_on', note, velocity }),
    onNoteOff: (note) => received.push({ type: 'note_off', note }),
    onSustain: (value) => received.push({ type: 'sustain', value }),
  });

  player.load(events);
  player.setSpeed(10);
  player.play();

  for (let i = 0; i < 100 && player.isPlaying; i++) {
    await sleep(10);
  }

  console.log('Player received:', received.length, 'events');
  for (const e of received) console.log(' ', e.type, e.note ?? e.value);

  if (received.length !== 6) throw new Error(`Expected 6 played events, got ${received.length}`);
  if (received[0].type !== 'note_on') throw new Error('First played event should be note_on');

  player.stop();
}

async function main() {
  console.log('=== Testing Recorder ===');
  const events = await testRecorder();
  console.log('=== Testing Serializer ===');
  await testSerializer(events);
  console.log('=== Testing Player ===');
  await testPlayer(events);
  console.log('=== All tests passed ===');
}

main().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
