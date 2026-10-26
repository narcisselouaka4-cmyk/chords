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
import { nameMidiChord } from '../recorder/midi-chord-namer.js';
import { detectKey } from './key-detector.js';
import { classifyMidiRoles } from './midi-roles.js';
import { enrichChordsWithDegrees } from './harmonic-patterns.js';

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

// Durée en dessous de laquelle un segment n'est pas un accord joué mais le
// transitoire d'une attaque : une note du voicing arrive quelques millisecondes
// avant les autres, et le segmenteur ouvre un accord sur un voicing partiel.
// Mesuré sur la session du 25/10 : 15 segments de ce type sur 97, dont le tout
// premier accord du morceau, et deux « ? » affichés à l'écran.
const MIN_CHORD_DURATION = 0.12;
// Un segment qu'AUCUN modèle d'accord n'explique (nom approché par `detectChord`)
// et qui ne dure pas est une figure de passage, pas une harmonie. Mesuré sur
// Session_019 de Narcisse : sa marche chromatique de basse Si2 → Do3 → Do#3,
// entre deux accords diminués, produisait un « Cmaj7sus2/B » de 0,18 s sur
// {Si, Do, Ré}. Le seuil est plus large que celui des transitoires d'attaque,
// mais ne s'applique qu'aux noms que le moteur n'a pas su poser.
const MIN_UNNAMED_DURATION = 0.35;

/**
 * Les accords sans leurs transitoires d'attaque : le segment trop court est
 * retiré, et l'accord qui le suit reprend son début (c'est là que l'attaque a
 * réellement commencé). Aucun accord ne se chevauche en sortie.
 * @param {object[]} chords
 * @returns {object[]}
 */
export function pruneAttackTransients(chords) {
  const kept = [];
  let dropped = null;
  const tooShort = (c) => {
    const dur = c.endTime - c.startTime;
    return dur < MIN_CHORD_DURATION
      || (c.confidence < 1 && dur < MIN_UNNAMED_DURATION);
  };
  for (const c of chords) {
    if (tooShort(c)) { dropped = dropped ?? c; continue; }
    if (dropped) {
      // Transitoire d'attaque : ses notes appartiennent à l'accord qui suit, qui
      // reprend donc son début. Figure de passage : elles n'y sont pas, et c'est
      // l'accord PRÉCÉDENT qui se prolonge (son harmonie n'a pas changé).
      const next = new Set(c.notes || []);
      const partOfNext = (dropped.notes || []).every((n) => next.has(n));
      if (partOfNext) c.startTime = round3(Math.min(c.startTime, dropped.startTime));
      dropped = null;
    }
    const prev = kept[kept.length - 1];
    if (prev && prev.chord === c.chord) { prev.endTime = c.endTime; continue; }
    if (prev) prev.endTime = round3(Math.max(prev.startTime, c.startTime));
    kept.push(c);
  }
  // Tout le morceau tient dans des transitoires : mieux vaut les garder que rien.
  return kept.length ? kept : chords;
}

/**
 * L'analyse d'un MIDI, dans la forme de l'analyse audio (TemplateAudioAnalyzer.analyze).
 * @param {object[]} events
 * @param {{duration?: number, tempo?: number|null}} [options]
 */
export function analyzeMidiEvents(events, { duration = 0, tempo = null, spelling = 'auto' } = {}) {
  const list = events || [];
  const spans = noteSpans(list);
  const end = Math.max(Number(duration) || 0, ...spans.map((s) => s.end), 0);
  // Accords et tonalité sous la MÊME orthographe, celle du réglage : la frise
  // montrait « Eb » sous une tonalité « D# ».
  const useSharps = spelling === 'sharps';
  const segments = nameChordSegments(segmentSessionEvents(list), { spelling })
    .filter((s) => s.chordName);

  // Des accords qui se touchent : un accord dure jusqu'au suivant (comme la grille audio) ;
  // deux accords de même nom qui se suivent n'en font qu'un.
  const chords = [];
  for (const s of segments) {
    const last = chords[chords.length - 1];
    if (last && last.chord === s.chordName) { last.endTime = Math.max(last.endTime, s.end); continue; }
    // Un accord s'arrête EXACTEMENT où le suivant commence. Le plancher de 0,05 s
    // appliqué ici faisait dépasser le segment précédent sur le suivant : mesuré
    // sur la session du 25/10, 11 segments se chevauchaient, jusqu'à 39 ms.
    if (last) last.endTime = Math.max(last.startTime, s.start);
    chords.push({
      startTime: round3(s.start),
      endTime: round3(s.end),
      chord: s.chordName,
      rootPc: s.rootPc,
      symbol: s.symbol,
      structuralChord: null,
      confidence: s.matched === false ? 0.6 : 1,
      // Rôle et degré sont posés plus bas : ils dépendent du morceau entier et
      // de sa tonalité, pas d'un accord isolé.
      role: null,
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
  const kept = pruneAttackTransients(chords);

  // La tonalité se vote sur les accords RETENUS, pas sur les segments bruts : un
  // transitoire d'attaque de 50 ms pesait autant qu'un accord tenu deux secondes.
  const keyChords = segments.map((s) => ({ time: s.start, duration: s.end - s.start, rootPc: s.rootPc, symbol: s.symbol, notes: s.notes }));
  const key = list.some((e) => e.type === 'note_on') ? detectKey(list, keyChords, { useSharps, latin: false }) : null;

  // Seconde passe de nommage, maintenant que la tonalité est connue : une
  // dominante dont la fondamentale n'est pas jouée ne peut se reconnaître que
  // par rapport à elle (voir `impliedDominant`). La tonalité n'est PAS
  // redétectée ensuite : elle a été établie sur la première lecture.
  if (key && Number.isFinite(key.pc)) {
    for (const chord of kept) {
      const named = nameMidiChord(chord.notes, { spelling, keyPc: key.pc });
      if (named) { chord.chord = named.name; chord.rootPc = named.rootPc; chord.symbol = named.symbol; }
    }
  }

  // Deux étiquettes de suite pour un seul accord. Narcisse, après avoir ouvert
  // la session du 14/10 : « si une étiquette est suivie d'une autre portant le
  // même accord (la même notation), ces deux étiquettes fusionnent », et « un
  // pianiste débutant va penser qu'il y a eu deux enregistrements pour le même
  // accord ». Son si bémol mineur de 27,3 s portait TROIS étiquettes « Bbm »
  // identiques d'affilée.
  //
  // La fusion existait déjà (plus haut), mais sur le nom de la PREMIÈRE passe :
  // deux segments nommés différemment pendant le découpage reçoivent le même nom
  // à la seconde passe, quand la tonalité est connue — trop tard pour fusionner.
  // On la refait donc ici, après le renommage.
  //
  // Second cas, le sien aussi : même fondamentale, et l'une des deux étiquettes
  // est la TRIADE NUE. Ses arpèges ajoutent et retirent des notes en cours de
  // route — « Bbm » puis « Bbmadd9 » (13 s), « Dbadd11 » puis « Db » (16 s),
  // « Db » puis « Dbsus4/Ab » (23 s) — et il dit chaque fois n'avoir joué qu'un
  // accord : « j'ai simplement joué un si bémol mineur », « j'ai simplement fait
  // un ré bémol ». C'est la triade nue qu'on garde, conformément à sa préférence
  // constante pour le nom simple (voir aussi son « Em simple »).
  //
  // Le nom n'est PAS recalculé sur l'union des notes : celles-ci accumulent tout
  // ce qui a sonné pendant le segment, et le renommage sortait « Gbmaj7/Bb » de
  // la fusion de ses trois si bémol mineur.
  const bareTriad = (symbol) => symbol === '' || symbol === 'm';
  const joined = [];
  for (const chord of kept) {
    const last = joined[joined.length - 1];
    const sameName = last && last.chord === chord.chord;
    const enriched = last && !sameName && last.rootPc === chord.rootPc
      && (bareTriad(last.symbol) !== bareTriad(chord.symbol));
    if (sameName || enriched) {
      // Des deux, on garde la triade nue ; à nom égal, le premier.
      const keepChord = enriched && bareTriad(chord.symbol) ? chord : last;
      last.chord = keepChord.chord;
      last.rootPc = keepChord.rootPc;
      last.symbol = keepChord.symbol;
      last.endTime = round3(Math.max(last.endTime, chord.endTime));
      last.notes = [...new Set([...last.notes, ...chord.notes])].sort((a, b) => a - b);
      last.confidence = Math.min(last.confidence, chord.confidence);
      continue;
    }
    joined.push(chord);
  }
  kept.length = 0;
  kept.push(...joined);

  // Hiérarchie et degrés. Jusqu'ici le chemin MIDI posait `role: 'structural'`
  // pour TOUS les accords et `degree: null` partout : l'onglet Analyse ne
  // montrait aucune structure sur les sessions de Narcisse.
  const beatDuration = Number.isFinite(tempo) && tempo > 0 ? 60 / tempo : 0.5;
  classifyMidiRoles(kept, { beatDuration });
  const withDegrees = key ? enrichChordsWithDegrees(kept, key) : kept;

  // La basse : la note la plus grave de chaque accord.
  const bassSegments = withDegrees.map((c) => {
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
    chords: withDegrees,
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
