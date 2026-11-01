import { midiToNoteName } from '../chord-engine/intervals.js';

// [OpenCode] — 2026-07-04 — Sérialisation des événements MIDI en JSON et en fichier MIDI (SMF).

export function serializeEventsJson(events) {
  return JSON.stringify(
    events.map((e) => ({
      time: Math.round(e.time * 1000) / 1000,
      type: e.type,
      note: e.note,
      noteName: e.note != null ? midiToNoteName(e.note, false, false) : undefined,
      velocity: e.velocity,
      controller: e.controller,
      value: e.value,
      program: e.program,
      data: e.data,
      channel: e.channel ?? 0,
    })),
    null,
    2,
  );
}

export function parseEventsJson(json) {
  return JSON.parse(json);
}

// [OpenCode] — 2026-07-04 — Génération d'un fichier MIDI SMF format 0 à partir d'événements.
// Supporte note_on, note_off, control, pitch_bend, program_change.
//
// [Claude] — 2026-10-09 — Les évènements sont datés en SECONDES : à 120 à la noire, une seconde vaut
// deux noires, soit 960 ticks. Le calcul faisait `time × 480`, et le fichier se jouait deux fois
// plus lentement que la session (invisible tant qu'il ne sortait pas de l'application ; Narcisse
// veut maintenant l'exporter). Les vélocités sont bornées à 1..127 (une note_on à 0 serait lue
// comme un relâchement), les notes et valeurs à 0..127.
export function buildMidiFile(events, { name = 'Piano Jazz Chords Session' } = {}) {
  const trackEvents = [];

  const ppq = 480; // pulses per quarter note
  const tempo = 500000; // microseconds per quarter note = 120 BPM
  const ticksPerSecond = ppq * 1e6 / tempo;
  const byte = (x) => Math.max(0, Math.min(127, Math.round(Number(x) || 0)));
  const velocity127 = (v, fallback) => {
    const n = Number.isFinite(Number(v)) ? Number(v) : fallback;
    return n > 1 ? byte(n) : byte(n * 127);
  };

  // Track name meta event
  trackEvents.push(...deltaTime(0), 0xff, 0x03, ...stringBytes(String(name || 'Piano Jazz Chords Session').slice(0, 40)));

  // Set tempo meta event
  trackEvents.push(...deltaTime(0), 0xff, 0x51, 0x03, ...uint24(tempo));

  // Time signature 4/4
  trackEvents.push(...deltaTime(0), 0xff, 0x58, 0x04, 0x04, 0x02, 0x18, 0x08);

  const sorted = [...events].filter((e) => MIDI_EVENT_TYPES.includes(e.type)).sort((a, b) => a.time - b.time);

  let lastTick = 0;
  for (const event of sorted) {
    const tick = Math.max(lastTick, Math.round((Number(event.time) || 0) * ticksPerSecond));
    const delta = tick - lastTick;
    lastTick = tick;

    const channel = Math.max(0, Math.min(15, Number(event.channel) || 0));

    switch (event.type) {
      case 'note_on': {
        // Une note_on à force nulle est un relâchement (comme le lit le lecteur).
        if (event.velocity != null && !(Number(event.velocity) > 0)) {
          trackEvents.push(...deltaTime(Math.max(0, delta)), 0x80 | channel, byte(event.note), 0);
          break;
        }
        const velocity = Math.max(1, velocity127(event.velocity, 0.8));
        trackEvents.push(...deltaTime(Math.max(0, delta)), 0x90 | channel, byte(event.note), velocity);
        break;
      }
      case 'note_off': {
        const velocity = velocity127(event.velocity, 0);
        trackEvents.push(...deltaTime(Math.max(0, delta)), 0x80 | channel, byte(event.note), velocity);
        break;
      }
      case 'control': {
        trackEvents.push(...deltaTime(Math.max(0, delta)), 0xb0 | channel, byte(event.controller), byte(event.value));
        break;
      }
      case 'pitch_bend': {
        const bend = Math.round(((event.value ?? 0) + 1) * 8191); // -1..+1 -> 0..16382
        const lsb = bend & 0x7f;
        const msb = (bend >> 7) & 0x7f;
        trackEvents.push(...deltaTime(Math.max(0, delta)), 0xe0 | channel, lsb, msb);
        break;
      }
      case 'program_change': {
        trackEvents.push(...deltaTime(Math.max(0, delta)), 0xc0 | channel, event.program);
        break;
      }
    }
  }

  // End of track
  trackEvents.push(...deltaTime(0), 0xff, 0x2f, 0x00);

  const trackChunk = buildChunk('MTrk', new Uint8Array(trackEvents));
  const headerChunk = buildChunk('MThd', new Uint8Array([
    0x00, 0x00, // format 0
    0x00, 0x01, // 1 track
    ...uint16(ppq),
  ]));

  const totalLength = headerChunk.length + trackChunk.length;
  const result = new Uint8Array(totalLength);
  result.set(headerChunk, 0);
  result.set(trackChunk, headerChunk.length);
  return result;
}

// [Claude] — 2026-07-10 — Extension : buildMidiFileMultiTrack (Format 1, multi-pistes, tempo dynamique)
export function buildMidiFileMultiTrack(tracks, options = {}) {
  const ppq = options.ppq ?? 480;
  const tempoUsPerQn = options.tempo ? Math.round(60_000_000 / options.tempo) : 500000;
  const tsNumerator = options.timeSignature?.[0] ?? 4;
  const tsDenominator = options.timeSignature?.[1] ?? 4;
  const tsMetronome = options.timeSignature?.[2] ?? 24;
  const ts32nds = options.timeSignature?.[3] ?? 8;
  const title = options.title ?? 'Piano Jazz Chords Analysis';

  const trackChunks = [];

  // Track 0: global tempo + time signature + title
  const globalTrack = [];
  globalTrack.push(...deltaTime(0), 0xff, 0x03, ...stringBytes(title));
  globalTrack.push(...deltaTime(0), 0xff, 0x51, 0x03, ...uint24(tempoUsPerQn));
  globalTrack.push(...deltaTime(0), 0xff, 0x58, 0x04, tsNumerator, tsDenominator === 4 ? 2 : 3, tsMetronome, ts32nds);
  globalTrack.push(...deltaTime(0), 0xff, 0x2f, 0x00);
  trackChunks.push(buildChunk('MTrk', new Uint8Array(globalTrack)));

  // Track 1..N: each instrument track
  for (const track of tracks) {
    const trackEvents = [];
    const channel = track.channel ?? 0;

    if (track.name) {
      trackEvents.push(...deltaTime(0), 0xff, 0x03, ...stringBytes(track.name));
    }

    if (track.program != null) {
      trackEvents.push(...deltaTime(0), 0xc0 | channel, track.program);
    }

    const sorted = (track.events || []).filter((e) => MIDI_EVENT_TYPES.includes(e.type)).sort((a, b) => a.time - b.time);
    let lastTick = 0;
    for (const event of sorted) {
      const tick = Math.round(event.time * ppq);
      const delta = tick - lastTick;
      lastTick = tick;

      switch (event.type) {
        case 'note_on': {
          const velocity = Math.round((event.velocity ?? 0.8) * 127);
          trackEvents.push(...deltaTime(Math.max(0, delta)), 0x90 | channel, event.note, velocity);
          break;
        }
        case 'note_off': {
          const velocity = Math.round((event.velocity ?? 0) * 127);
          trackEvents.push(...deltaTime(Math.max(0, delta)), 0x80 | channel, event.note, velocity);
          break;
        }
        case 'control': {
          trackEvents.push(...deltaTime(Math.max(0, delta)), 0xb0 | channel, event.controller, event.value);
          break;
        }
        case 'pitch_bend': {
          const bend = Math.round(((event.value ?? 0) + 1) * 8191);
          const lsb = bend & 0x7f;
          const msb = (bend >> 7) & 0x7f;
          trackEvents.push(...deltaTime(Math.max(0, delta)), 0xe0 | channel, lsb, msb);
          break;
        }
        case 'program_change': {
          trackEvents.push(...deltaTime(Math.max(0, delta)), 0xc0 | channel, event.program);
          break;
        }
      }
    }

    trackEvents.push(...deltaTime(0), 0xff, 0x2f, 0x00);
    trackChunks.push(buildChunk('MTrk', new Uint8Array(trackEvents)));
  }

  const numTracks = trackChunks.length;
  const headerChunk = buildChunk('MThd', new Uint8Array([
    0x00, 0x01,
    (numTracks >> 8) & 0xff, numTracks & 0xff,
    ...uint16(ppq),
  ]));

  const totalLength = headerChunk.length + trackChunks.reduce((s, c) => s + c.length, 0);
  const result = new Uint8Array(totalLength);
  result.set(headerChunk, 0);
  let offset = headerChunk.length;
  for (const chunk of trackChunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

const MIDI_EVENT_TYPES = ['note_on', 'note_off', 'control', 'pitch_bend', 'program_change'];

function buildChunk(type, data) {
  const chunk = new Uint8Array(8 + data.length);
  for (let i = 0; i < 4; i++) {
    chunk[i] = type.charCodeAt(i);
  }
  const view = new DataView(chunk.buffer);
  view.setUint32(4, data.length, false);
  chunk.set(data, 8);
  return chunk;
}

function deltaTime(ticks) {
  const bytes = [];
  let value = ticks;
  do {
    let byte = value & 0x7f;
    value >>= 7;
    if (bytes.length > 0) byte |= 0x80;
    bytes.unshift(byte);
  } while (value > 0);
  if (bytes.length === 0) bytes.push(0);
  return bytes;
}

function uint16(value) {
  return [(value >> 8) & 0xff, value & 0xff];
}

function uint24(value) {
  return [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff];
}

function stringBytes(str) {
  const encoder = new TextEncoder();
  const bytes = Array.from(encoder.encode(str));
  return [bytes.length, ...bytes];
}

// [Claude] — 2026-10-09 — Lecture d'un fichier MIDI (SMF format 0 ou 1), pour l'onglet Analyse.
// Narcisse veut exporter une session (.mid) puis la donner à l'Analyse, et y importer aussi des
// fichiers MIDI d'ailleurs. On rend les évènements au format de l'enregistreur (en SECONDES, en
// suivant les changements de tempo du fichier) : {type: 'note_on'|'note_off'|'control', note,
// velocity (0..1), controller, value, channel, time}. Toutes les pistes sont fusionnées ; la
// piste 10 (batterie, canal 9) est écartée : ses notes ne sont pas des hauteurs.
/**
 * @param {Uint8Array|ArrayBuffer|number[]} data
 * @returns {{events: object[], duration: number, name: string, tempo: number}}
 */
export function parseMidiFile(data) {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const text = (at, n) => String.fromCharCode(...bytes.subarray(at, at + n));
  if (bytes.length < 14 || text(0, 4) !== 'MThd') throw new Error('Ce fichier n\'est pas un fichier MIDI.');
  const headerLength = view.getUint32(4);
  const trackCount = view.getUint16(10);
  const division = view.getUint16(12);
  if (division & 0x8000) throw new Error('Fichier MIDI en temps SMPTE : non pris en charge.');
  const ppq = division || 480;

  // Chaque piste : ses évènements en ticks.
  const raw = [];
  const tempos = [{ tick: 0, us: 500000 }];
  let name = '';
  let offset = 8 + headerLength;
  for (let t = 0; t < trackCount && offset + 8 <= bytes.length; t += 1) {
    const length = view.getUint32(offset + 4);
    const isTrack = text(offset, 4) === 'MTrk';
    let p = offset + 8;
    const end = Math.min(bytes.length, p + length);
    offset = p + length;
    if (!isTrack) continue;
    let tick = 0;
    let status = 0;
    const varLen = () => {
      let v = 0;
      for (let k = 0; k < 4 && p < end; k += 1) {
        const b = bytes[p++];
        v = (v << 7) | (b & 0x7f);
        if (!(b & 0x80)) break;
      }
      return v;
    };
    while (p < end) {
      tick += varLen();
      let b = bytes[p];
      if (b & 0x80) { status = b; p += 1; } else if (!status) break; // statut courant
      const kind = status & 0xf0;
      if (status === 0xff) {
        const type = bytes[p++];
        const len = varLen();
        if (type === 0x51 && len === 3) tempos.push({ tick, us: (bytes[p] << 16) | (bytes[p + 1] << 8) | bytes[p + 2] });
        if (type === 0x03 && !name && len) name = new TextDecoder().decode(bytes.subarray(p, p + len)).trim();
        p += len;
        if (type === 0x2f) break;
        status = 0;
      } else if (status === 0xf0 || status === 0xf7) {
        p += varLen();
        status = 0;
      } else {
        const channel = status & 0x0f;
        const d1 = bytes[p++];
        const d2 = kind === 0xc0 || kind === 0xd0 ? 0 : bytes[p++];
        if (channel === 9) continue;
        if (kind === 0x90 && d2 > 0) raw.push({ tick, order: 1, type: 'note_on', note: d1, velocity: d2 / 127, channel });
        else if (kind === 0x80 || kind === 0x90) raw.push({ tick, order: 0, type: 'note_off', note: d1, velocity: 0, channel });
        else if (kind === 0xb0) raw.push({ tick, order: 0, type: 'control', controller: d1, value: d2, channel });
      }
    }
  }

  // Ticks → secondes, en suivant la carte des tempos.
  tempos.sort((a, b) => a.tick - b.tick);
  const map = [];
  let seconds = 0;
  for (let i = 0; i < tempos.length; i += 1) {
    const prev = map[map.length - 1];
    if (prev) seconds += ((tempos[i].tick - prev.tick) * prev.us) / 1e6 / ppq;
    if (prev && prev.tick === tempos[i].tick) map.pop();
    map.push({ tick: tempos[i].tick, us: tempos[i].us, seconds });
  }
  const toSeconds = (tick) => {
    let seg = map[0];
    for (const m of map) { if (m.tick <= tick) seg = m; else break; }
    return seg.seconds + ((tick - seg.tick) * seg.us) / 1e6 / ppq;
  };
  raw.sort((a, b) => a.tick - b.tick || a.order - b.order);
  const events = raw.map(({ tick, order, ...e }) => ({ ...e, time: Math.round(toSeconds(tick) * 1000) / 1000 }));
  const duration = events.length ? events[events.length - 1].time : 0;
  return { events, duration, name, tempo: Math.round(60e6 / (map[0]?.us || 500000)) };
}
