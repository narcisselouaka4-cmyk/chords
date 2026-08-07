// [OpenCode] — 2026-08-07 — Incrément 9, Lot 1 : fixture canonique de DÉMONSTRATION.
//
// Source de démonstration déterministe pour raccorder le panneau Réharmonisation
// au moteur canonique src/melody/harmonization-planner.js (buildHarmonizationPlan).
//
// IMPORTANT : cette fixture n'est PAS une nouvelle politique musicale et n'utilise
// AUCUNE donnée issue du fichier audio actuellement chargé dans l'onglet Analyse.
// Elle existe uniquement pour démontrer le moteur dans l'interface tant que
// l'extraction d'une vraie MelodyTrack/top note (Incrément 11) n'est pas raccordée.
//
// Déterminisme : aucun appel à l'horloge temps réel ni à l'aléatoire. L'horloge
// de capture est fixe (avance par pas constants) ; les identifiants et horodatages
// proviennent exclusivement des factories publiques de src/melody/*.

import { createMidiCapture } from '../melody/midi-capture.js';
import { createMelodyTrack } from '../melody/melody-track.js';
import { createTonalContext, setManualTonalContext } from '../melody/tonal-context.js';
import { createHarmonicContext, addHarmonicAnchor } from '../melody/harmonic-context.js';

// Ligne mélodique de démonstration : triade de Do majeur ascendante (Do-Mi-Sol).
// Choix volontairement simple et reconnaissable ; le moteur canonique décide
// ensuite seul des accords, voicings et transitions.
const DEMO_MELODY_MIDIS = Object.freeze([60, 64, 67]); // C4, E4, G4
const DEMO_KEY = 'C';
const DEMO_TRACK_NAME = 'Démonstration — ligne mélodique Do-Mi-Sol';
const DEMO_SOURCE_CAPTURE_ID = 'demo-increment-9';

// Métadonnées de démonstration exposées à la couche UI (jamais envoyées au moteur).
export const DEMO_FIXTURE_META = Object.freeze({
  isDemo: true,
  label: 'Démonstration du moteur de réharmonisation',
  description:
    'Ligne mélodique déterministe Do-Mi-Sol en Do majeur. ' +
    'Aucune donnée issue du fichier audio actuellement chargé : ' +
    'le résultat est une démonstration du moteur canonique, pas une ' +
    'analyse de votre morceau.',
  melodyMidis: DEMO_MELODY_MIDIS,
  key: DEMO_KEY,
});

// Horloge fixe en millisecondes, avance par pas déterministes.
// On fournit getTime à createMidiCapture pour éviter tout appel à l'horloge
// native (performance.now / temps réel) côté capture.
function makeFixedClock() {
  let t = 0;
  return {
    now: () => t,
    advance: (ms) => { t += ms; },
  };
}

// Construit la MelodyTrack de démonstration via la factory publique.
// Les notes sont produites par createMidiCapture (API publique réelle),
// puis transformées par createMelodyTrack. Aucun pseudo-objet forgé main.
function buildDemoTrack() {
  const clock = makeFixedClock();
  const capture = createMidiCapture({ getTime: clock.now });
  for (const midi of DEMO_MELODY_MIDIS) {
    capture.noteOn(midi, 0.8, 0);
    clock.advance(400);
    capture.noteOff(midi, 0, 0);
    clock.advance(100);
  }
  capture.finalize();
  return createMelodyTrack(
    { notes: capture.getNotes(), sourceCaptureId: DEMO_SOURCE_CAPTURE_ID },
    {
      name: DEMO_TRACK_NAME,
      sopranoPolicy: 'melody-must-be-top',
      harmonizationPolicy: 'automatic',
    },
  );
}

// Construit le HarmonicContext canonique : tonalité manuelle de Do majeur
// + une ancre par événement mélodique (start / user / end), alignée exactement
// sur l'identifiant et le temps de l'événement correspondant.
function buildDemoHarmonicContext(track) {
  const tonalContext = setManualTonalContext(createTonalContext(), DEMO_KEY);
  let ctx = createHarmonicContext(track, { tonalContext });
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

/**
 * Construit un NOUVEAU wrapper canonique de démonstration
 * { track, harmonicContext } via les factories publiques uniquement.
 *
 * Chaque appel reconstruit intégralement la MelodyTrack (createMidiCapture +
 * createMelodyTrack), le TonalContext (createTonalContext +
 * setManualTonalContext) et le HarmonicContext (createHarmonicContext +
 * addHarmonicAnchor). La fonction ne conserve aucun état entre les appels :
 * deux appels renvoient deux graphes d'objets indépendants.
 *
 * Les identifiants (track-N, anchor-N, n-N, etc.) et les horodatages de création
 * (createdAt/updatedAt) sont générés par les factories canoniques elles-mêmes
 * (compteurs module-level et horloge temps réel). Ce sont des métadonnées
 * d'instance : elles n'ont pas vocation à être identiques entre deux
 * constructions indépendantes. Aucune option publique ne permet de les fixer, et
 * cette fonction ne les réécrit pas.
 *
 * Le CONTENU MUSICAL, en revanche, est déterministe par construction : horloge
 * musicale fixe de createMidiCapture (startedAt/releasedAt/endedAt/duration
 * reproductibles), notes MIDI, tonalité, alignement ancre/événement et ancres.
 *
 * @returns {{ track: import('../melody/midi-types.js').MelodyTrack,
 *             harmonicContext: import('../melody/midi-types.js').HarmonicContext,
 *             meta: object }}
 *   Nouvel objet figé en lecture seule. Ne jamais muter `track` ni
 *   `harmonicContext` : ce sont les valeurs de retour des factories.
 */
export function buildDemoFixture() {
  const track = buildDemoTrack();
  const harmonicContext = buildDemoHarmonicContext(track);
  return Object.freeze({
    track,
    harmonicContext,
    meta: DEMO_FIXTURE_META,
  });
}
