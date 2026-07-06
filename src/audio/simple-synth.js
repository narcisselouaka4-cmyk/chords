const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
const activeOscillators = new Map();
let synthMode = 'piano';

export function midiToFrequency(midi) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

export async function resumeAudio() {
  if (audioCtx.state === 'suspended') {
    await audioCtx.resume();
  }
}

export function getAudioContext() {
  return audioCtx;
}

export function setSynthMode(mode) {
  synthMode = mode === 'rhodes' ? 'rhodes' : 'piano';
}

export function getSynthMode() {
  return synthMode;
}

// Piano additive synthesis
const PIANO_PARTIALS = [
  { ratio: 1, gain: 1.0 },
  { ratio: 2, gain: 0.55 },
  { ratio: 3, gain: 0.28 },
  { ratio: 4, gain: 0.14 },
  { ratio: 5, gain: 0.08 },
  { ratio: 6, gain: 0.05 },
  { ratio: 7, gain: 0.03 },
];

function playPianoNote(midi, velocity) {
  const freq = midiToFrequency(midi);
  const now = audioCtx.currentTime;

  const masterGain = audioCtx.createGain();
  const filter = audioCtx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 8000;
  filter.Q.value = 0;

  masterGain.connect(filter);
  filter.connect(audioCtx.destination);

  const oscillators = [];
  const gains = [];
  const maxPartialGain = PIANO_PARTIALS.reduce((sum, p) => sum + p.gain, 0);

  for (const partial of PIANO_PARTIALS) {
    const osc = audioCtx.createOscillator();
    const partialGain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq * partial.ratio;
    osc.detune.value = (Math.random() - 0.5) * 6;

    partialGain.connect(masterGain);
    osc.connect(partialGain);

    const amplitude = (partial.gain / maxPartialGain) * velocity * 0.35;
    partialGain.gain.setValueAtTime(0, now);
    partialGain.gain.linearRampToValueAtTime(amplitude, now + 0.01);

    osc.start(now);
    oscillators.push(osc);
    gains.push(partialGain);
  }

  masterGain.gain.setValueAtTime(0, now);
  masterGain.gain.linearRampToValueAtTime(velocity * 0.6, now + 0.01);
  masterGain.gain.exponentialRampToValueAtTime(velocity * 0.35, now + 0.15);
  masterGain.gain.exponentialRampToValueAtTime(velocity * 0.12, now + 0.8);

  return { oscillators, gains, masterGain, filter };
}

// Rhodes FM synthesis
function playRhodesNote(midi, velocity) {
  const freq = midiToFrequency(midi);
  const now = audioCtx.currentTime;

  const masterGain = audioCtx.createGain();
  const filter = audioCtx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 4000 + velocity * 2000;
  filter.Q.value = 0.5;

  masterGain.connect(filter);
  filter.connect(audioCtx.destination);

  // FM: carrier + modulator
  const modRatio = 3 + (Math.random() - 0.5) * 0.2;
  const modIndex = velocity * modRatio * 80;

  const modulator = audioCtx.createOscillator();
  const modGain = audioCtx.createGain();
  modulator.type = 'sine';
  modulator.frequency.value = freq * modRatio;
  modGain.gain.value = modIndex;
  modulator.connect(modGain);
  modGain.connect(modulator.frequency);

  const carrier = audioCtx.createOscillator();
  const carrierGain = audioCtx.createGain();
  carrier.type = 'sine';
  carrier.frequency.value = freq;
  carrierGain.connect(masterGain);
  carrier.connect(carrierGain);

  // Second oscillator detuned for warmth
  const carrier2 = audioCtx.createOscillator();
  const carrier2Gain = audioCtx.createGain();
  carrier2.type = 'sine';
  carrier2.frequency.value = freq;
  carrier2.detune.value = 8;
  carrier2Gain.gain.value = velocity * 0.3;
  carrier2Gain.connect(masterGain);
  carrier2.connect(carrier2Gain);

  // Bell-like partials
  const bellPartials = [5.01, 8.02, 13.03];
  const bellGains = [];
  for (const ratio of bellPartials) {
    const osc = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq * ratio;
    g.gain.value = velocity * 0.03;
    g.connect(masterGain);
    osc.connect(g);
    osc.start(now);
    bellGains.push(g);
    modulator.connect(g);
    // Track for cleanup
  }

  // Rhodes ADSR: soft attack, long sustain, slow release
  masterGain.gain.setValueAtTime(0, now);
  masterGain.gain.linearRampToValueAtTime(velocity * 0.5, now + 0.005);
  masterGain.gain.exponentialRampToValueAtTime(velocity * 0.35, now + 0.2);
  masterGain.gain.exponentialRampToValueAtTime(velocity * 0.15, now + 0.6);

  carrierGain.gain.value = velocity * 0.5;

  modulator.start(now);
  carrier.start(now);
  carrier2.start(now);

  const oscillators = [modulator, carrier, carrier2];
  const gains = [modGain, carrierGain, carrier2Gain, ...bellGains];

  return { oscillators, gains, masterGain, filter };
}

export function playNote(midi, velocity = 0.8) {
  if (!Number.isFinite(midi) || midi < 0 || midi > 127) {
    console.warn('[simple-synth] Note MIDI invalide ignorée:', midi);
    return;
  }

  resumeAudio();

  if (activeOscillators.has(midi)) {
    stopOscillators(activeOscillators.get(midi));
  }

  const nodes = synthMode === 'rhodes'
    ? playRhodesNote(midi, velocity)
    : playPianoNote(midi, velocity);

  activeOscillators.set(midi, nodes);
}

function stopOscillators({ oscillators, gains, masterGain, filter }) {
  const now = audioCtx.currentTime;
  try {
    masterGain.gain.cancelScheduledValues(now);
    masterGain.gain.setValueAtTime(masterGain.gain.value, now);
    masterGain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

    for (const g of gains) {
      try {
        g.gain.cancelScheduledValues(now);
        g.gain.setValueAtTime(g.gain.value, now);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
      } catch (e) { /* ignore */ }
    }

    const stopTime = now + 0.45;
    for (const osc of oscillators) {
      try { osc.stop(stopTime); } catch (e) { /* ignore */ }
    }

    setTimeout(() => {
      try {
        for (const osc of oscillators) try { osc.disconnect(); } catch (e) { /* ignore */ }
        for (const g of gains) try { g.disconnect(); } catch (e) { /* ignore */ }
        masterGain.disconnect();
        filter.disconnect();
      } catch (e) { /* ignore */ }
    }, 500);
  } catch (e) { /* ignore */ }
}

export function releaseNote(midi) {
  if (!Number.isFinite(midi) || midi < 0 || midi > 127) return;
  if (!activeOscillators.has(midi)) return;
  stopOscillators(activeOscillators.get(midi));
  activeOscillators.delete(midi);
}
