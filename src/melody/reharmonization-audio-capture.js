// [OpenCode] — 2026-08-24 — EXP-027 Tâche 4 : pont audio → MelodyTrack.
//
// Équivalent de reharmonization-live-capture.js (qui construit une MelodyTrack
// depuis une capture MIDI live) mais pour une source audio : notes extraites
// par melody_extractor.py (librosa.pyin) depuis un stem séparé (Demucs).
//
// Rôle exclusif :
//   1. recevoir les notes extraites [{midi, start, end, confidence}] de l'IPC
//      reharm:extract-melody ;
//   2. les convertir en snapshot compatible avec createMelodyTrack
//      (format {id, midi, startedAt, endedAt, duration, velocity, channel}) ;
//   3. construire une MelodyTrack + HarmonicContext (avec détection de
//      tonalité sur la mélodie extraite) ;
//   4. retourner un wrapper { track, harmonicContext } prêt pour
//      buildReharmonizationViewModel (orchestrateur canonique, non modifié).
//
// Aucune décision musicale : les accords, voicings et le chemin harmonique
// sont décidés exclusivement par le moteur canonique. Ce module ne fait que
// construire les structures d'entrée depuis une source audio.

import { createMelodyTrack, validateMelodyTrack } from './melody-track.js';
import {
  createTonalContext,
  estimateTonalContextFromMelody,
  setManualTonalContext,
} from './tonal-context.js';
import {
  createHarmonicContext,
  addHarmonicAnchor,
} from './harmonic-context.js';

const AUDIO_CAPTURE_SOURCE_ID = 'reharm-audio';

let nextAudioNoteId = 0;
function makeAudioNoteId() {
  return `an-${++nextAudioNoteId}`;
}

/**
 * Convertit les notes extraites (format melody_extractor.py) en snapshot
 * compatible avec createMelodyTrack.
 *
 * @param {{midi: number, start: number, end: number, confidence: number}[]} extractedNotes
 * @returns {{notes: object[], sourceCaptureId: string, startedAt: number, endedAt: number}}
 */
function extractedToSnapshot(extractedNotes) {
  if (!extractedNotes || extractedNotes.length === 0) return null;
  const notes = extractedNotes.map((n) => ({
    id: makeAudioNoteId(),
    midi: n.midi,
    channel: 0,
    sourceId: AUDIO_CAPTURE_SOURCE_ID,
    startedAt: n.start,
    releasedAt: n.end,
    endedAt: n.end,
    duration: Math.max(0, n.end - n.start),
    velocity: 0.8,
    sustained: false,
    releaseVelocity: 0,
    terminationReason: 'physical-release',
  }));
  const startedAt = notes[0].startedAt;
  const endedAt = notes[notes.length - 1].endedAt;
  return { notes, sourceCaptureId: AUDIO_CAPTURE_SOURCE_ID, startedAt, endedAt };
}

/**
 * Construit un wrapper canonique { track, harmonicContext } depuis les notes
 * extraites d'un fichier audio par melody_extractor.py.
 *
 * @param {{notes: {midi: number, start: number, end: number, confidence: number}[], sr: number, duration: number, n_notes: number}} extracted
 *   Résultat de l'IPC reharm:extract-melody.
 * @param {object} [options]
 * @param {string} [options.name]
 * @param {'allow-notes-above'|'melody-must-be-top'|'free'} [options.sopranoPolicy]
 * @param {string} [options.key] - tonalité manuelle (ex: 'C') si la détection
 *   automatique échoue. Défaut : fallback 'C'.
 * @returns {{ status: 'success', wrapper: { track: object, harmonicContext: object }, noteCount: number } |
 *           { status: 'error', errorKind: string, message: string, noteCount: number }}
 */
export function buildAudioMelodyWrapper(extracted, options = {}) {
  if (!extracted || !Array.isArray(extracted.notes)) {
    return {
      status: 'error',
      errorKind: 'TypeError',
      message: 'Extraction invalide : notes manquantes.',
      noteCount: 0,
    };
  }
  if (extracted.notes.length === 0) {
    return {
      status: 'error',
      errorKind: 'EmptyMelody',
      message: 'Aucune note extraite de l\'audio. Le stem est peut-être instrumental sans voix, ou trop bruité.',
      noteCount: 0,
    };
  }

  const snapshot = extractedToSnapshot(extracted.notes);
  if (!snapshot) {
    return {
      status: 'error',
      errorKind: 'EmptyMelody',
      message: 'Conversion en snapshot échouée.',
      noteCount: extracted.notes.length,
    };
  }

  const track = createMelodyTrack(snapshot, {
    name: options.name || 'Mélodie extraite (audio)',
    sopranoPolicy: options.sopranoPolicy || 'melody-must-be-top',
    harmonizationPolicy: 'automatic',
  });

  const validation = validateMelodyTrack(track);
  if (!validation.valid) {
    return {
      status: 'error',
      errorKind: 'InvalidMelody',
      message: `Mélodie invalide : ${validation.errors.join('; ')}`,
      noteCount: extracted.notes.length,
    };
  }

  // [OpenCode] — 2026-08-24 — EXP-029 Tâche 2 : la tonalité utilisée par le
  // moteur de réharmonisation doit s'appuyer sur l'harmonie déjà fiable
  // (Chordify), pas sur une inférence recalculée depuis la seule mélodie
  // extraite. Si options.harmonicKey = {key, mode} est fourni (depuis
  // Chordify), on l'utilise en priorité. Sinon, fallback sur
  // estimateTonalContextFromMelody, puis sur la clé manuelle.
  let usedTonalContext = null;
  if (options.harmonicKey && options.harmonicKey.key) {
    // Construit la chaîne de tonalité (ex: "C" pour Do majeur, "Am" pour La mineur).
    const keyStr = options.harmonicKey.mode === 'minor'
      ? options.harmonicKey.key + 'm'
      : options.harmonicKey.key;
    usedTonalContext = setManualTonalContextSafe(createTonalContext(), keyStr);
  }
  if (!usedTonalContext || !usedTonalContext.selected) {
    // Fallback : détection sur la mélodie extraite.
    const { context: estimated } = estimateTonalContextFromMelody(track);
    if (estimated && estimated.selected) {
      usedTonalContext = estimated;
    } else {
      usedTonalContext = setManualTonalContextSafe(createTonalContext(), options.key || 'C');
    }
  }

  let ctx = createHarmonicContext(track, { tonalContext: usedTonalContext });
  // Une ancre par événement mélodique.
  for (let i = 0; i < track.events.length; i++) {
    const type = i === 0 ? 'start' : i === track.events.length - 1 ? 'end' : 'user';
    ctx = addHarmonicAnchor(ctx, {
      melodyEventId: track.events[i].id,
      relativeTime: track.events[i].startedAt,
      type,
      harmonizationPolicy: 'automatic',
    });
  }

  return {
    status: 'success',
    wrapper: { track, harmonicContext: ctx },
    noteCount: extracted.notes.length,
  };
}

function setManualTonalContextSafe(base, key) {
  try {
    return setManualTonalContext(base, key);
  } catch (_) {
    return base;
  }
}

/**
 * Orchestre l'extraction complète : appelle l'IPC reharm:extract-melody pour
 * obtenir les notes depuis un stem audio, puis construit le wrapper.
 *
 * @param {string} stemPath - chemin absolu du stem WAV (vocals/piano/other).
 * @param {object} [options]
 * @param {object} [options.ipcOptions] - options passées à l'IPC (fmin, fmax).
 * @returns {Promise<{status, wrapper?, errorKind?, message?, noteCount?}>}
 */
export async function extractAudioMelody(stemPath, options = {}) {
  const api = typeof window !== 'undefined' ? window.electronAPI : null;
  if (!api?.reharm?.extractMelody) {
    return {
      status: 'error',
      errorKind: 'NoIPC',
      message: 'IPC reharm:extract-melody non disponible (Electron requis).',
      noteCount: 0,
    };
  }
  try {
    const extracted = await api.reharm.extractMelody(stemPath, options.ipcOptions || {});
    return buildAudioMelodyWrapper(extracted, options);
  } catch (err) {
    return {
      status: 'error',
      errorKind: 'ExtractionError',
      message: err && err.message ? err.message : 'Erreur d\'extraction audio.',
      noteCount: 0,
    };
  }
}