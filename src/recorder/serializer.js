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
export function buildMidiFile(events) {
  const trackEvents = [];

  const ppq = 480; // pulses per quarter note
  const tempo = 500000; // microseconds per quarter note = 120 BPM

  // Track name meta event
  trackEvents.push(...deltaTime(0), 0xff, 0x03, ...stringBytes('Piano Jazz Chords Session'));

  // Set tempo meta event
  trackEvents.push(...deltaTime(0), 0xff, 0x51, 0x03, ...uint24(tempo));

  // Time signature 4/4
  trackEvents.push(...deltaTime(0), 0xff, 0x58, 0x04, 0x04, 0x02, 0x18, 0x08);

  const sorted = [...events].filter((e) => MIDI_EVENT_TYPES.includes(e.type)).sort((a, b) => a.time - b.time);

  let lastTick = 0;
  for (const event of sorted) {
    const tick = Math.round(event.time * ppq);
    const delta = tick - lastTick;
    lastTick = tick;

    const channel = event.channel ?? 0;

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
