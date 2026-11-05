// Une prise reste la source : les données MIDI ne sont jamais reconstruites depuis un nom d'accord.
export function takeExample(take, title = 'Ton jeu') {
  const source = take?.events || [];
  if (!source.some((e) => e.type === 'note_on' && e.velocity > 0)) return null;
  const events = source.flatMap((e) => {
    if (!Number.isFinite(e.time) || e.time < 0) return [];
    if (e.type === 'control' && e.controller === 64) return [{ time: e.time, type: 'sustain', value: e.value >= 64 }];
    if (!Number.isInteger(e.note) || e.note < 21 || e.note > 108) return [];
    if (e.type === 'note_off' || (e.type === 'note_on' && e.velocity === 0)) return [{ time: e.time, type: 'noteOff', note: e.note }];
    if (e.type !== 'note_on') return [];
    return [{ time: e.time, type: 'noteOn', note: e.note, velocity: e.velocity > 1 ? e.velocity / 127 : e.velocity }];
  }).sort((a, b) => a.time - b.time);
  const duration = Math.max(Number(take.duration) || 0, ...events.map((e) => e.time));
  return { kind: 'playing', title, subtitle: '', tempo: 60, events, beats: duration, chords: [], noteCount: events.filter((e) => e.type === 'noteOn').length };
}

/** Enveloppe visuelle du MIDI : activité et force des attaques, silences conservés. */
export function takeEnvelope(take, count = 96) {
  const example = takeExample(take);
  const bins = Array(count).fill(0);
  if (!example || !example.beats) return bins;
  const held = new Map();
  for (const e of example.events) {
    if (e.type === 'noteOn') held.set(e.note, e);
    if (e.type !== 'noteOff') continue;
    const on = held.get(e.note);
    if (!on) continue;
    const lo = Math.floor(on.time / example.beats * count);
    const hi = Math.min(count - 1, Math.floor(e.time / example.beats * count));
    for (let i = lo; i <= hi; i += 1) bins[i] = Math.max(bins[i], on.velocity);
    held.delete(e.note);
  }
  return bins;
}

export function lastAttachedTake(messages) {
  return [...messages].reverse().find((m) => m.role === 'user' && m.take?.events?.length)?.take || null;
}

/** Une session confiée autrefois peut être conservée dans l'original d'une proposition. */
export function lastPlayingTake(messages = []) {
  // Une nouvelle prise utilisateur est une frontière : une ancienne réponse ne l'écrase pas.
  const attached=lastAttachedTake(messages);
  if(attached)return attached;
  return [...messages].reverse().find(m=>m.role==='assistant'&&m.toolResult?.originalTake?.events?.length)?.toolResult.originalTake||null;
}
