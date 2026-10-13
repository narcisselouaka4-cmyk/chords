// [Claude] — 2026-10-13 — Export du Studio (Narcisse : « tu peux ensuite brancher les boutons d'export »).
//
// Deux exports, à partir de ce que le pianiste entend :
//   - « Exporter le mixage (WAV) » : les pistes séparées telles qu'elles sont réglées (volume,
//     muet, solo, volume général) et transposées, rendues hors temps réel en un fichier WAV. Sans
//     pistes séparées (étape 1), la région du morceau d'origine, transposée.
//   - « Exporter le piano (MIDI) » : les notes de la piste piano, transcrites depuis le son par le
//     même moteur que Pédagogie IA (piano-transcriber.py), décalées de la transposition, en fichier
//     .mid standard. Sans piste piano séparée, c'est le son de la région qui est transcrit.
//
// Les fonctions pures (encodage WAV, gains, notes → évènements MIDI) sont testées sous Node
// (test-studio-export.js) ; le rendu passe par un OfflineAudioContext.

/** Gain effectif d'une piste, comme le mixeur (stem-mixer.js) : muet, solo, puis volume en dB. */
export function effectiveGain(stem, state, masterDb = 0) {
  const s = state?.[stem];
  if (!s) return 0;
  const anySolo = Object.values(state).some((x) => x?.solo);
  if (s.muted) return 0;
  if (anySolo && !s.solo) return 0;
  return 10 ** (((Number(s.volumeDb) || 0) + (Number(masterDb) || 0)) / 20);
}

/**
 * WAV PCM 16 bits à partir de canaux Float32Array (mêmes longueurs).
 * @param {Float32Array[]} channels
 * @param {number} sampleRate
 * @returns {Uint8Array}
 */
export function encodeWav(channels, sampleRate) {
  const n = channels.length ? channels[0].length : 0;
  const ch = Math.max(1, channels.length);
  const bytes = 44 + n * ch * 2;
  const buf = new ArrayBuffer(bytes);
  const v = new DataView(buf);
  const text = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  text(0, 'RIFF'); v.setUint32(4, bytes - 8, true); text(8, 'WAVE');
  text(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, ch, true);
  v.setUint32(24, sampleRate, true); v.setUint32(28, sampleRate * ch * 2, true); v.setUint16(32, ch * 2, true); v.setUint16(34, 16, true);
  text(36, 'data'); v.setUint32(40, n * ch * 2, true);
  let o = 44;
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < ch; c++) {
      const x = Math.max(-1, Math.min(1, channels[c]?.[i] || 0));
      v.setInt16(o, x < 0 ? x * 0x8000 : x * 0x7fff, true);
      o += 2;
    }
  }
  return new Uint8Array(buf);
}

/**
 * Notes transcrites → évènements du format des sessions (serializer.js : buildMidiFile).
 * @param {Array<{midi:number, onset:number, offset:number, velocity?:number}>} notes
 * @param {{ shift?: number, from?: number, to?: number|null, pedals?: Array<{onset:number, offset:number}> }} options
 *   shift : transposition (demi-tons) ; from/to : ne garder que cette plage (secondes), ramenée à 0.
 */
export function transcriptionToEvents(notes, { shift = 0, from = 0, to = null, pedals = [] } = {}) {
  const events = [];
  const end = to == null ? Infinity : to;
  for (const n of notes || []) {
    const on = Number(n.onset); const off = Number(n.offset);
    if (!Number.isFinite(on) || !Number.isFinite(off) || off <= from || on >= end) continue;
    const note = Math.round(Number(n.midi)) + Math.round(shift);
    if (note < 0 || note > 127) continue;
    const velocity = Math.max(1, Math.min(127, Math.round(Number(n.velocity) || 80)));
    events.push({ type: 'note_on', time: Math.max(0, on - from), note, velocity, channel: 0 });
    events.push({ type: 'note_off', time: Math.max(0.01, Math.min(end, off) - from), note, velocity: 0, channel: 0 });
  }
  for (const p of pedals || []) {
    const on = Number(p.onset); const off = Number(p.offset);
    if (!Number.isFinite(on) || !Number.isFinite(off) || off <= from || on >= end) continue;
    events.push({ type: 'control', time: Math.max(0, on - from), controller: 64, value: 127, channel: 0 });
    events.push({ type: 'control', time: Math.max(0, Math.min(end, off) - from), controller: 64, value: 0, channel: 0 });
  }
  return events.sort((a, b) => a.time - b.time);
}

/** Nom de fichier sûr, à partir du nom du morceau. */
export function exportFileName(name, suffix, ext) {
  const base = String(name || 'Studio').replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim() || 'Studio';
  return `${base}${suffix ? ` - ${suffix}` : ''}.${ext}`;
}

/**
 * Rend un mixage hors temps réel.
 * @param {{ sources: Array<{buffer: AudioBuffer, gain: number, offset?: number}>, duration: number, transpose?: number,
 *           createPitchShifter?: (ctx: BaseAudioContext, dest: AudioNode, semitones: number) => Promise<{node: AudioNode}> }} options
 *   offset : début (secondes) dans le buffer source.
 * @returns {Promise<{ channels: Float32Array[], sampleRate: number, transposed: boolean }>}
 */
export async function renderMix({ sources, duration, transpose = 0, createPitchShifter = null }) {
  const sampleRate = sources[0]?.buffer?.sampleRate || 44100;
  // SoundTouch retarde le son (~0,135 s) : on rend un peu plus long, puis on retire ce début.
  const LATENCY = transpose && createPitchShifter ? 0.135 : 0;
  const length = Math.max(1, Math.ceil((duration + LATENCY + 0.05) * sampleRate));
  const Offline = globalThis.OfflineAudioContext || globalThis.webkitOfflineAudioContext;
  const ctx = new Offline(2, length, sampleRate);
  let input = ctx.destination;
  let transposed = false;
  if (transpose && createPitchShifter) {
    try {
      const shifter = await createPitchShifter(ctx, ctx.destination, transpose);
      input = shifter.node;
      transposed = true;
    } catch (err) {
      console.warn('[Studio] export : transposition hors temps réel indisponible', err);
    }
  }
  for (const { buffer, gain, offset = 0 } of sources) {
    if (!buffer || !(gain > 0)) continue;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const g = ctx.createGain();
    g.gain.value = gain;
    src.connect(g).connect(input);
    src.start(0, Math.max(0, offset), duration);
  }
  const rendered = await ctx.startRendering();
  const skip = transposed ? Math.round(LATENCY * sampleRate) : 0;
  const keep = Math.max(1, Math.min(rendered.length - skip, Math.round(duration * sampleRate)));
  const channels = [0, 1].map((c) => rendered.getChannelData(Math.min(c, rendered.numberOfChannels - 1)).slice(skip, skip + keep));
  return { channels, sampleRate, transposed };
}
