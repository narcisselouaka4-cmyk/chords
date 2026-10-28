// Calage audio réservé à la grille. Ne participe jamais à la détection d'accords.
// Une enveloppe d'attaques puis un chemin de pulsations à période locale variable.
export const DISPLAY_RHYTHM_VERSION = 1;

export function wavOnsets(buffer) {
  const view = new DataView(buffer);
  const tag = (i) => String.fromCharCode(...new Uint8Array(buffer, i, 4));
  if (view.byteLength < 44 || tag(0) !== 'RIFF' || tag(8) !== 'WAVE') throw new Error('WAV attendu');
  let format, channels, sampleRate, bits, offset, size;
  for (let p = 12; p + 8 <= view.byteLength;) {
    const length = view.getUint32(p + 4, true), name = tag(p);
    if (name === 'fmt ') {
      if (length < 16 || p + 8 + length > view.byteLength) throw new Error('En-tête WAV incomplet');
      format = view.getUint16(p + 8, true); channels = view.getUint16(p + 10, true);
      sampleRate = view.getUint32(p + 12, true); bits = view.getUint16(p + 22, true);
    }
    if (name === 'data') { offset = p + 8; size = Math.min(length, view.byteLength - offset); break; }
    p += 8 + length + (length % 2);
  }
  if (!offset || !channels || !sampleRate || !((format === 1 && bits === 16) || (format === 3 && bits === 32))) throw new Error('Format WAV non pris en charge');
  const stride = channels * bits / 8, count = Math.floor(size / stride), hop = Math.round(sampleRate * 0.01);
  const onsets = new Float32Array(Math.ceil(count / hop));
  let previousEnergy = 0, previousHigh = 0, previousSample = 0;
  for (let frame = 0; frame < onsets.length; frame++) {
    let energy = 0, high = 0, n = 0;
    for (let sample = frame * hop; sample < Math.min(count, (frame + 1) * hop); sample += 2) {
      let value = 0;
      for (let ch = 0; ch < channels; ch++) {
        const p = offset + sample * stride + ch * bits / 8;
        value += format === 1 ? view.getInt16(p, true) / 32768 : view.getFloat32(p, true);
      }
      value /= channels; energy += value * value;
      high += (value - previousSample) ** 2; previousSample = value; n++;
    }
    energy = Math.log1p(energy / Math.max(n, 1) * 1000);
    high = Math.log1p(high / Math.max(n, 1) * 1000);
    onsets[frame] = Math.max(0, energy - previousEnergy) + Math.max(0, high - previousHigh);
    previousEnergy = energy; previousHigh = high;
  }
  return { onsets, hopSeconds: hop / sampleRate, duration: count / sampleRate };
}

export function trackDisplayBeats(onsets, hopSeconds, tempo = 120) {
  if (!(tempo > 0) || onsets.length < 100) return [];
  const nominal = 60 / tempo / hopSeconds;
  const localPeriods = new Float32Array(onsets.length);
  // Autocorrélation locale toutes les 4 s, fenêtre de 12 s. La recherche reste
  // dans l'octave du tempo fourni ; ×2 / ÷2 agit ensuite sur ces mêmes temps.
  for (let center = 0; center < onsets.length; center += 400) {
    const lo = Math.max(0, center - 600), hi = Math.min(onsets.length, center + 600);
    let best = -Infinity, period = nominal;
    for (let lag = Math.max(8, Math.round(nominal * 0.8)); lag <= nominal * 1.25; lag++) {
      let dot = 0, normA = 0, normB = 0;
      for (let i = lo + lag; i < hi; i++) {
        dot += onsets[i] * onsets[i - lag]; normA += onsets[i] ** 2; normB += onsets[i - lag] ** 2;
      }
      const score = dot / Math.sqrt(normA * normB + 1e-12) - 0.15 * Math.log(lag / nominal) ** 2;
      if (score > best) { best = score; period = lag; }
    }
    localPeriods.fill(period, center, Math.min(onsets.length, center + 400));
  }
  let max = 0; for (const value of onsets) max = Math.max(max, value);
  if (max < 1e-5) return [];
  const score = new Float32Array(onsets.length), previous = new Int32Array(onsets.length).fill(-1);
  for (let i = 0; i < onsets.length; i++) {
    const period = localPeriods[i]; let best = 0, pred = -1;
    for (let lag = Math.max(8, Math.round(period * 0.7)); lag <= period * 1.4 && lag <= i; lag++) {
      const candidate = score[i - lag] - 6 * Math.log(lag / period) ** 2;
      if (candidate > best) { best = candidate; pred = i - lag; }
    }
    score[i] = onsets[i] / max + 0.96 * best; previous[i] = pred;
  }
  let end = onsets.length - 1;
  for (let i = Math.max(0, end - Math.ceil(nominal * 2)); i < onsets.length; i++) if (score[i] > score[end]) end = i;
  const beats = [];
  for (let i = end; i >= 0; i = previous[i]) beats.push(Number((i * hopSeconds).toFixed(4)));
  return beats.reverse();
}

export function displayRhythmFromWav(buffer, tempo) {
  const { onsets, hopSeconds, duration } = wavOnsets(buffer);
  return { version: DISPLAY_RHYTHM_VERSION, source: 'audio-display', sourceTempo: tempo, duration, beatTimes: trackDisplayBeats(onsets, hopSeconds, tempo) };
}
