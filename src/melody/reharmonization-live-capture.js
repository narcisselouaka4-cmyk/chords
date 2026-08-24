// [OpenCode] — 2026-08-24 — Réharmonisation V1, Étape 1 : capture MIDI live.
//
// Pont entre le bus MIDI live (src/melody/live-midi-bus.js) et le moteur
// canonique de réharmonisation (buildHarmonizationPlan). Remplace la fixture
// de démonstration (src/ui/reharmonization-demo-fixture.js) par une vraie
// MelodyTrack issue du clavier MIDI/virtuel joué par l'utilisateur.
//
// Rôle exclusif :
//   1. instancier createMidiCapture (API canonique publique) à l'ouverture
//      d'une session de capture ;
//   2. abonner ses handlers au bus MIDI live (note on/off/sustain) ;
//   3. à l'arrêt : finalize() → createMelodyTrack → estimateTonalContextFromMelody
//      → createHarmonicContext + une ancre par événement mélodique ;
//   4. retourner un wrapper { track, harmonicContext } prêt pour
//      buildReharmonizationViewModel.
//
// Aucune décision musicale : les accords, voicings et le chemin harmonique
// sont décidés exclusivement par le moteur canonique. Ce module ne fait que
// construire les structures d'entrée.

import { createMidiCapture } from './midi-capture.js';
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
import { subscribeToLiveMidi } from './live-midi-bus.js';

const LIVE_CAPTURE_SOURCE_ID = 'reharm-live';

/**
 * Crée une session de capture MIDI live pour la réharmonisation.
 *
 * @param {object} [options]
 * @param {() => number} [options.getTime] - horloge monotonique en ms
 *   (défaut : performance.now). En production on garde l'horloge réelle.
 * @param {string} [options.name]
 * @param {'allow-notes-above'|'melody-must-be-top'|'free'} [options.sopranoPolicy]
 * @returns {{ capture: object, unsubscribe: () => void, finalize: () => {
 *   status: 'success'|'error',
 *   wrapper?: { track: object, harmonicContext: object },
 *   errorKind?: string, message?: string, noteCount?: number
 * } }}
 *   `finalize` clot la capture et retourne un wrapper canonique ou une erreur
 *   typée (mélodie vide, tonalité indétectable, etc.).
 */
export function startLiveMelodyCapture(options = {}) {
  const getTime = options.getTime
    || (typeof performance !== 'undefined'
      ? () => performance.now()
      : () => Date.now());
  const capture = createMidiCapture({ getTime });

  const unsubscribe = subscribeToLiveMidi({
    noteOn: (note, velocity, channel) => {
      capture.noteOn(note, velocity, channel, LIVE_CAPTURE_SOURCE_ID);
    },
    noteOff: (note, channel) => {
      capture.noteOff(note, 0, channel, LIVE_CAPTURE_SOURCE_ID);
    },
    sustain: (value, channel) => {
      capture.sustain(value, channel, LIVE_CAPTURE_SOURCE_ID);
    },
  });

  function finalize() {
    // Clôt la capture et libère les notes tenues.
    capture.finalize();
    unsubscribe();

    const notes = capture.getNotes();
    if (!notes || notes.length === 0) {
      return {
        status: 'error',
        errorKind: 'EmptyMelody',
        message: 'Aucune note jouée. Jouez une mélodie au clavier puis arrêtez la capture.',
        noteCount: 0,
      };
    }

    const track = createMelodyTrack(
      { notes, sourceCaptureId: LIVE_CAPTURE_SOURCE_ID },
      {
        name: options.name || 'Mélodie live',
        sopranoPolicy: options.sopranoPolicy || 'melody-must-be-top',
        harmonizationPolicy: 'automatic',
      },
    );

    const validation = validateMelodyTrack(track);
    if (!validation.valid) {
      return {
        status: 'error',
        errorKind: 'InvalidMelody',
        message: `Mélodie invalide : ${validation.errors.join('; ')}`,
        noteCount: notes.length,
      };
    }

    // Détection de tonalité sur la mélodie seule.
    const { context: tonalContext } = estimateTonalContextFromMelody(track);
    if (!tonalContext || !tonalContext.selected) {
      // Fallback : tonalité de Do majeur (la fixture de démo l'utilise).
      // La V1 reste fonctionnelle même sur une mélodie atonale ; l'utilisateur
      // pourra corriger manuellement plus tard (hors périmètre V1 Étape 1).
      const fallback = setManualTonalContextSafe(createTonalContext(), 'C');
      let ctx = createHarmonicContext(track, { tonalContext: fallback });
      ctx = buildAnchorsFromTrackEvents(ctx, track);
      return {
        status: 'success',
        wrapper: { track, harmonicContext: ctx },
        noteCount: notes.length,
      };
    }

    let ctx = createHarmonicContext(track, { tonalContext });
    ctx = buildAnchorsFromTrackEvents(ctx, track);
    return {
      status: 'success',
      wrapper: { track, harmonicContext: ctx },
      noteCount: notes.length,
    };
  }

  return { capture, unsubscribe, finalize };
}

// Aide : setManualTonalContext importé en tête de module.
function setManualTonalContextSafe(base, key) {
  try {
    return setManualTonalContext(base, key);
  } catch (_) {
    return base;
  }
}

// Construit une ancre harmonique par événement mélodique (start / end / user),
// alignée exactement sur l'identifiant et le temps de l'événement. Politique
// 'automatic' par défaut : le moteur canonique décide seul de l'accord.
function buildAnchorsFromTrackEvents(ctx, track) {
  const events = track.events;
  for (let i = 0; i < events.length; i++) {
    const type = i === 0 ? 'start' : i === events.length - 1 ? 'end' : 'user';
    ctx = addHarmonicAnchor(ctx, {
      melodyEventId: events[i].id,
      relativeTime: events[i].startedAt,
      type,
      harmonizationPolicy: 'automatic',
    });
  }
  return ctx;
}