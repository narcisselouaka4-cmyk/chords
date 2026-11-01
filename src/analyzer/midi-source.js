// [Claude] — 2026-10-09 — Onglet Analyse : un fichier MIDI comme source.
//
// Narcisse : « dans l'onglet Analyse, je voudrais qu'on puisse intégrer aussi les fichiers
// MIDI », pour lui donner une session exportée (Sessions MIDI → .mid) ou tout autre MIDI.
// Un MIDI n'a pas besoin du moteur audio (ffmpeg, chromagramme) : ses notes sont exactes. On
// reprend la détection d'accords des Sessions MIDI (session-analysis.js), qui sait déjà lire un
// jeu de piano (pédale, attaques groupées), et on rend le résultat dans la forme de l'analyse
// audio (audio-analyzer.js) : la frise, l'inspecteur, l'édition et l'enregistrement du projet
// marchent sans changement. Le son d'écoute est rendu à part (midi-render.js).
//
// Module PUR (testé par test-midi-source.js).

import { segmentSessionEvents, nameChordSegments } from '../recorder/session-analysis.js';
import { detectKey } from './key-detector.js';

export const MIDI_EXTENSIONS = ['mid', 'midi'];

/** Vrai pour un chemin .mid / .midi. */
export function isMidiPath(filePath) {
  const ext = String(filePath || '').split('.').pop().toLowerCase();
  return MIDI_EXTENSIONS.includes(ext);
}

/**
 * Les notes jouées, avec leur fin sonore : une note relâchée pédale enfoncée sonne jusqu'à la
 * remontée de la pédale (ou jusqu'à sa prochaine attaque).
 * @param {object[]} events - {type: 'note_on'|'note_off'|'control', note, velocity, controller, value, time}
 * @returns {{midi: number, start: number, end: number, velocity: number}[]}
 */
export function noteSpans(events) {
  const sorted = [...(events || [])].filter((e) => e && Number.isFinite(Number(e.time))).sort((a, b) => a.time - b.time);
  const open = new Map(); // note → span en cours (doigt posé)
  const held = new Map(); // note → span relâché mais tenu par la pédale
  const spans = [];
  let pedal = false;
  const close = (span, t) => { span.end = Math.max(span.start + 0.02, t); spans.push(span); };
  for (const e of sorted) {
    const t = Number(e.time);
    if (e.type === 'control' && Number(e.controller) === 64) {
      const down = Number(e.value) >= 64;
      if (pedal && !down) {
        for (const span of held.values()) close(span, t);
        held.clear();
      }
      pedal = down;
    } else if (e.type === 'note_on' && Number(e.velocity) > 0) {
      const previous = open.get(e.note) || held.get(e.note);
      if (previous) { close(previous, t); open.delete(e.note); held.delete(e.note); }
      open.set(e.note, { midi: e.note, start: t, end: t, velocity: Math.min(1, Number(e.velocity) || 0.8) });
    } else if (e.type === 'note_off' || e.type === 'note_on') {
      const span = open.get(e.note);
      if (!span) continue;
      open.delete(e.note);
      if (pedal) { span.end = t; held.set(e.note, span); } else close(span, t);
    }
  }
  const last = sorted.length ? Number(sorted[sorted.length - 1].time) : 0;
  for (const span of [...open.values(), ...held.values()]) close(span, Math.max(last, span.end));
  return spans.sort((a, b) => a.start - b.start || a.midi - b.midi);
}

/**
 * L'analyse d'un MIDI, dans la forme de l'analyse audio (TemplateAudioAnalyzer.analyze).
 * @param {object[]} events
 * @param {{duration?: number, tempo?: number|null}} [options]
 */
export function analyzeMidiEvents(events, { duration = 0, tempo = null } = {}) {
  const list = events || [];
  const spans = noteSpans(list);
  const end = Math.max(Number(duration) || 0, ...spans.map((s) => s.end), 0);
  const segments = nameChordSegments(segmentSessionEvents(list)).filter((s) => s.chordName);

  // Des accords qui se touchent : un accord dure jusqu'au suivant (comme la grille audio) ;
  // deux accords de même nom qui se suivent n'en font qu'un.
  const chords = [];
  for (const s of segments) {
    const last = chords[chords.length - 1];
    if (last && last.chord === s.chordName) { last.endTime = Math.max(last.endTime, s.end); continue; }
    if (last) last.endTime = Math.max(last.startTime + 0.05, s.start);
    chords.push({
      startTime: round3(s.start),
      endTime: round3(s.end),
      chord: s.chordName,
      structuralChord: null,
      confidence: s.matched === false ? 0.6 : 1,
      role: 'structural',
      inStructuralLoop: null,
      degree: null,
      analysis: {},
      techniques: [],
      suggestions: [],
      reharmonizations: [],
      voiceLeading: {},
      notes: [...(s.notes || [])],
    });
  }
  if (chords.length) chords[chords.length - 1].endTime = round3(Math.max(chords[chords.length - 1].endTime, end));
  for (const c of chords) c.endTime = round3(c.endTime);

  const keyChords = segments.map((s) => ({ time: s.start, duration: s.end - s.start, rootPc: s.rootPc, symbol: s.symbol, notes: s.notes }));
  const key = list.some((e) => e.type === 'note_on') ? detectKey(list, keyChords, { useSharps: true, latin: false }) : null;

  // La basse : la note la plus grave de chaque accord.
  const bassSegments = chords.map((c) => {
    const low = Math.min(...(c.notes.length ? c.notes : [NaN]));
    if (!Number.isFinite(low)) return null;
    return { startTime: c.startTime, endTime: c.endTime, midi: low, note: NOTE_NAMES[low % 12], octave: Math.floor(low / 12) - 1, confidence: 1, source: 'midi', isVirtual: false };
  }).filter(Boolean);

  return {
    sourceType: 'midi',
    wavPath: '',
    analysisWavPath: '',
    usedPianoStem: false,
    usedBassStem: false,
    duration: round3(end),
    tempo: Number.isFinite(tempo) ? tempo : null,
    timeSignature: '4/4',
    key: key?.name ?? null,
    keyMode: key?.mode ?? 'major',
    keyConfidence: key?.confidence ?? 0,
    keyCandidates: [],
    confidence: 1,
    chords,
    bassSegments,
    noteCount: spans.length,
  };
}

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

/**
 * Un fichier WAV (PCM 16 bits) à partir de canaux de samples (-1..1).
 * @param {Float32Array[]} channels
 * @param {number} sampleRate
 * @returns {Uint8Array}
 */
export function encodeWav(channels, sampleRate) {
  const count = channels.length || 1;
  const frames = channels[0]?.length || 0;
  const dataBytes = frames * count * 2;
  const buffer = new ArrayBuffer(44 + dataBytes);
  const view = new DataView(buffer);
  const ascii = (at, text) => { for (let i = 0; i < text.length; i += 1) view.setUint8(at + i, text.charCodeAt(i)); };
  ascii(0, 'RIFF');
  view.setUint32(4, 36 + dataBytes, true);
  ascii(8, 'WAVE');
  ascii(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, count, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * count * 2, true);
  view.setUint16(32, count * 2, true);
  view.setUint16(34, 16, true);
  ascii(36, 'data');
  view.setUint32(40, dataBytes, true);
  let at = 44;
  for (let i = 0; i < frames; i += 1) {
    for (let c = 0; c < count; c += 1) {
      const x = Math.max(-1, Math.min(1, channels[c][i] || 0));
      view.setInt16(at, x < 0 ? x * 0x8000 : x * 0x7fff, true);
      at += 2;
    }
  }
  return new Uint8Array(buffer);
}

function round3(x) {
  return Math.round(x * 1000) / 1000;
}
