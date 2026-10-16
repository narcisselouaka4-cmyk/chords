// [Claude] — 2026-10-09 — Onglet Analyse : le son d'un fichier MIDI.
//
// L'Analyse lit un WAV (lecteur, curseur, surbrillance de l'accord en cours, clic sur une
// étiquette). Un MIDI n'a pas de son : on le rend une fois, hors ligne, avec les échantillons de
// piano de l'application (les mêmes que le clavier), pédale comprise, puis on l'écrit en WAV
// sous ~/PianoJazzChords/Analyse/midi/. Tout le reste de l'onglet marche alors sans changement.
// Repli sans échantillons : une note synthétique douce (l'Analyse ne reste jamais muette).

import { parseMidiFile } from '../recorder/serializer.js';
import { getPianoSampleBuffers } from '../audio/simple-synth.js';
import { analyzeMidiEvents, noteSpans, encodeWav } from './midi-source.js';

const SAMPLE_RATE = 44100;
const RELEASE = 0.25; // s : l'étouffoir retombe
const TAIL = 1.5; // s de résonance après la dernière note
const MAX_SECONDS = 20 * 60;

function nearest(buffers, midi) {
  let best = null;
  let distance = Infinity;
  for (const note of buffers.keys()) {
    const d = Math.abs(note - midi);
    if (d < distance) { distance = d; best = note; }
  }
  return best;
}

/** Rend les notes d'un MIDI en AudioBuffer (stéréo, 44,1 kHz). */
export async function renderMidiAudio(events) {
  const spans = noteSpans(events);
  const end = Math.min(MAX_SECONDS, Math.max(1, ...spans.map((s) => s.end)) + TAIL);
  const ctx = new OfflineAudioContext(2, Math.ceil(end * SAMPLE_RATE), SAMPLE_RATE);
  const out = ctx.createGain();
  out.gain.value = 0.55;
  out.connect(ctx.destination);
  const buffers = await getPianoSampleBuffers().catch(() => new Map());
  for (const s of spans) {
    if (s.start >= end) continue;
    const gain = ctx.createGain();
    const level = 0.15 + 0.85 * Math.min(1, Math.max(0, s.velocity)) ** 1.5;
    const stop = Math.min(end, s.end + RELEASE);
    gain.gain.setValueAtTime(level, s.start);
    gain.gain.setValueAtTime(level, Math.max(s.start, s.end));
    gain.gain.linearRampToValueAtTime(0, stop);
    gain.connect(out);
    const sample = buffers.size ? nearest(buffers, s.midi) : null;
    if (sample !== null) {
      const src = ctx.createBufferSource();
      src.buffer = buffers.get(sample);
      src.playbackRate.value = 2 ** ((s.midi - sample) / 12);
      src.connect(gain);
      src.start(s.start);
      src.stop(stop);
    } else {
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = 440 * 2 ** ((s.midi - 69) / 12);
      const decay = ctx.createGain();
      decay.gain.setValueAtTime(0.5, s.start);
      decay.gain.exponentialRampToValueAtTime(0.05, s.start + 2.5);
      osc.connect(decay).connect(gain);
      osc.start(s.start);
      osc.stop(stop);
    }
  }
  return ctx.startRendering();
}

async function midiWavPath(filePath) {
  const files = window.electronAPI.files;
  const home = await files.homeDir();
  const dir = `${home}/PianoJazzChords/Analyse/midi`;
  await files.ensureDir(dir);
  const base = String(filePath).split(/[\\/]/).pop().replace(/\.[^.]+$/, '').replace(/[^\p{L}\p{N} _-]+/gu, ' ').trim() || 'midi';
  let hash = 0;
  for (const ch of String(filePath)) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return `${dir}/${base}-${hash.toString(36)}.wav`;
}

/** Lit un fichier .mid. */
export async function readMidiFile(filePath) {
  const bytes = await window.electronAPI.files.readBinary(filePath);
  return parseMidiFile(bytes);
}

/** Le WAV d'écoute d'un MIDI (rendu s'il n'existe pas encore, ou si `force`). */
export async function ensureMidiPlayback(filePath, { events = null, force = false } = {}) {
  const files = window.electronAPI.files;
  const wavPath = await midiWavPath(filePath);
  if (!force && await files.exists(wavPath)) return wavPath;
  const list = events || (await readMidiFile(filePath)).events;
  const audio = await renderMidiAudio(list);
  const channels = Array.from({ length: audio.numberOfChannels }, (_, c) => audio.getChannelData(c));
  await files.writeBinary(wavPath, encodeWav(channels, audio.sampleRate));
  return wavPath;
}

/** L'analyse complète d'un fichier MIDI, avec son WAV d'écoute. */
export async function analyzeMidiFile(filePath) {
  if (!window.electronAPI?.files?.readBinary) throw new Error('lecture de fichier indisponible hors de l\'application');
  const parsed = await readMidiFile(filePath);
  if (!parsed.events.some((e) => e.type === 'note_on')) throw new Error('ce fichier MIDI ne contient aucune note');
  const analysis = analyzeMidiEvents(parsed.events, { duration: parsed.duration, tempo: parsed.tempo });
  const wavPath = await ensureMidiPlayback(filePath, { events: parsed.events, force: true });
  return { ...analysis, wavPath, analysisWavPath: wavPath };
}
