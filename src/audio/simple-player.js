import { resumeAudio } from './simple-synth.js';

const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

// [Claude] — 2026-07-03 — Lecteur MIDI simple pour écouter un accord original ou une alternative dans l'onglet Analyse.
export async function playNotes(notes, velocity = 0.6, duration = 1.2) {
  await resumeAudio();
  await audioCtx.resume();

  const now = audioCtx.currentTime;

  for (const note of notes) {
    const freq = 440 * Math.pow(2, (note - 69) / 12);
    const osc1 = audioCtx.createOscillator();
    const osc2 = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    osc1.type = 'triangle';
    osc1.frequency.value = freq;
    osc2.type = 'sine';
    osc2.frequency.value = freq;

    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(velocity * 0.25, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(audioCtx.destination);

    osc1.start(now);
    osc2.start(now);
    osc1.stop(now + duration + 0.1);
    osc2.stop(now + duration + 0.1);
  }
}
