// Vérifie le routage de l'expression vers les notes tenues et nouvelles,
// pour le piano synthétique, les échantillons et le Rhodes.
import assert from 'node:assert/strict';

class Param {
  constructor(value = 0) { this.value = value; }
  setValueAtTime(value) { this.value = value; }
  linearRampToValueAtTime() {}
  exponentialRampToValueAtTime() {}
  cancelScheduledValues() {}
  setTargetAtTime(value) { this.value = value; }
}
const allNodes = [];
function node(kind) {
  const value = {
    kind, connections: [], gain: new Param(), frequency: new Param(),
    detune: new Param(), playbackRate: new Param(1), Q: new Param(),
    connect(target) { this.connections.push(target); },
    disconnect() { this.connections = []; },
    start() {}, stop() { this.stopped = true; },
  };
  allNodes.push(value);
  return value;
}
global.window = { AudioContext: class {
  currentTime = 0;
  state = 'running';
  destination = {};
  createGain() { return node('gain'); }
  createOscillator() { return node('oscillator'); }
  createBiquadFilter() { return node('filter'); }
  createBufferSource() { return node('sample'); }
  async decodeAudioData() { return {}; }
} };
const synth = await import('./simple-synth.js');

let previousCount = allNodes.length;
synth.playNote(60);
const piano = allNodes.slice(previousCount).filter(n => n.kind === 'oscillator');
const partials = piano.slice(0, -2); // les deux derniers sont le battement et le vibrato
const originalDetunes = partials.map(n => n.detune.value);
const shimmer = piano.at(-2);
const vibrato = piano.at(-1);
const depth = vibrato.connections[0];
assert.equal(vibrato.frequency.value, 5);
assert.equal(depth.gain.value, 0);
synth.setPitchBend(1);
partials.forEach((n, i) => assert.equal(n.detune.value, originalDetunes[i] + 200));
assert.equal(shimmer.detune.value, 0, 'le battement acoustique reste indépendant');
synth.setPitchBend(-1);
partials.forEach((n, i) => assert.equal(n.detune.value, originalDetunes[i] - 200));
synth.setPitchBend(0);
partials.forEach((n, i) => assert.equal(n.detune.value, originalDetunes[i], 'timbre initial conservé'));
synth.setModulation(0.5);
assert.equal(depth.gain.value, 15);
assert.deepEqual(depth.connections, partials.map(n => n.detune));
synth.setSustain(true);
synth.releaseNote(60);
synth.setPitchBend(0.5);
partials.forEach((n, i) => assert.equal(n.detune.value, originalDetunes[i] + 100, 'la pédale conserve l’expression'));
synth.setSustain(false);
assert(piano.every(n => n.stopped), 'tous les oscillateurs sont arrêtés à la remontée de pédale');

synth.setSynthMode('rhodes');
previousCount = allNodes.length;
synth.playNote(64);
const rhodes = allNodes.slice(previousCount).filter(n => n.kind === 'oscillator');
assert.equal(rhodes.length, 7, 'FM, deux porteuses, trois cloches et vibrato');
assert.equal(rhodes[2].detune.value, 106, 'désaccordage initial de 6 cents conservé');
assert.equal(rhodes.at(-1).connections[0].gain.value, 15, 'la nouvelle note hérite de la modulation');
synth.releaseNote(64);
assert(rhodes.every(n => n.stopped), 'aucun partiel de Rhodes ne reste actif');

window.electronAPI = { assets: { pianoSamplesDir: async () => '/samples' }, files: { readBinary: async () => new Uint8Array([0]) } };
await synth.ensurePianoSamples();
synth.setSynthMode('piano');
previousCount = allNodes.length;
synth.playNote(61);
const sample = allNodes.slice(previousCount).find(n => n.kind === 'sample');
assert(sample, 'échantillon utilisé');
assert.equal(sample.detune.value, 100, 'le sampler reçoit le pitch courant');
const sampleRate = sample.playbackRate.value;
synth.setPitchBend(20);
assert.equal(sample.detune.value, 200, 'valeur bornée');
assert.equal(sample.playbackRate.value, sampleRate, 'transposition de l’échantillon conservée');
synth.setPitchBend(NaN);
assert.equal(sample.detune.value, 0);
synth.setModulation(20);
assert.equal(allNodes.at(-1).gain.value, 30);
synth.setModulation(NaN);
assert.equal(allNodes.at(-1).gain.value, 0);
synth.releaseNote(61);
console.log('✅ Expression audio : piano, Rhodes, sampler, notes tenues/nouvelles, sustain, retour au centre, modulation et bornes.');
