import midi from '@julusian/midi';

console.log('\n=== Ports ALSA sequencer (par défaut) ===');
const input = new midi.Input();
const count = input.getPortCount();
console.log('Nombre de ports:', count);
for (let i = 0; i < count; i++) {
  console.log(`  [${i}] ${input.getPortName(i)}`);
}
input.closePort();

console.log('\n=== Ports ALSA raw ===');
try {
  const rawInput = new midi.Input(true);
  const rawCount = rawInput.getPortCount();
  console.log('Nombre de ports raw:', rawCount);
  for (let i = 0; i < rawCount; i++) {
    console.log(`  [${i}] ${rawInput.getPortName(i)}`);
  }
  rawInput.closePort();
} catch (err) {
  console.log('Erreur raw MIDI:', err.message);
}
