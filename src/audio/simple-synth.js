const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
const activeOscillators = new Map();
let synthMode = 'piano';

// [Claude] — 2026-07-07 — Bus de sortie permanent du synthé.
// Toutes les notes passent par ce gain, qui est branché sur la destination système.
// Pour l'enregistrement Studio, on branche temporairement une MediaStreamDestination
// sur ce bus au moment de l'appel à getMediaStream().
const synthOutput = audioCtx.createGain();
synthOutput.connect(audioCtx.destination);

export function midiToFrequency(midi) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

const MAX_OSC_FREQUENCY = 20000; // Marge sous la limite Web Audio nominale (24000 Hz)
const MIN_MIDI_NOTE = 12;        // C0 — rejette la note 0 et les infrasons en dessous

function clampOscFrequency(freq) {
  return Math.min(Math.max(freq, 20), MAX_OSC_FREQUENCY);
}

function isValidMidiNote(midi) {
  return Number.isFinite(midi) && Number.isInteger(midi) && midi >= MIN_MIDI_NOTE && midi <= 127;
}

export async function resumeAudio() {
  if (audioCtx.state === 'suspended') {
    await audioCtx.resume();
  }
}

export function getAudioContext() {
  return audioCtx;
}

export function getMediaStream() {
  // Crée une destination temporaire branchée sur le bus permanent du synthé.
  // Ainsi, toutes les notes jouées (même après l'appel) sont capturées.
  const destination = audioCtx.createMediaStreamDestination();
  synthOutput.connect(destination);
  return destination.stream;
}

export function connectOutput(destination) {
  // Branche le bus permanent du synthé sur une destination externe.
  // Utilisé par le Studio pour mixer le synthé dans un seul MediaStream.
  if (destination && destination.context === audioCtx) {
    synthOutput.connect(destination);
  }
}

export function setSynthMode(mode) {
  synthMode = mode === 'rhodes' ? 'rhodes' : 'piano';
}

export function getSynthMode() {
  return synthMode;
}

// [Claude] — 2026-09-05 — Sampler piano : de vrais échantillons de piano à
// queue (Salamander, licence CC-BY Alexander Holm) remplacent la synthèse
// additive pour le mode « piano ». Le Rhodes reste synthétisé (il plaît).
//
// Contraintes du projet respectées :
//   - chargement par l'IPC files:read-binary + decodeAudioData — la CSP
//     d'Electron bloque fetch(blob:), piège déjà documenté ;
//   - 30 échantillons de A0 à C8 (un par tierce mineure) : chaque note jouée
//     est lue depuis l'échantillon le plus proche, pitché d'au plus une tierce
//     mineure — l'écart reste inaudible, et la répartition préserve la
//     décroissance réelle par registre de l'échantillon source ;
//   - repli automatique sur le moteur synthétique si un échantillon manque :
//     l'utilisateur a toujours un son, jamais un silence.
const PIANO_SAMPLES_NOTES = [
  21, 24, 28, 31, 33, 36, 40, 43, 45, 48, 52, 55, 57, 60, 64, 67, 69, 72,
  76, 79, 81, 84, 88, 91, 93, 96, 100, 103, 105, 108,
]; // A0 C1 E1 G1 … C8

const pianoSampleBuffers = new Map(); // midi échantillon → AudioBuffer
let pianoSampleState = 'idle';       // idle | loading | ready | failed
const pianoSampleWaiters = [];

function noteNameForMidi(midi) {
  const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  return `${NAMES[midi % 12]}${Math.floor(midi / 12) - 1}`;
}

/**
 * Charge les échantillons de piano une seule fois, à la première note ou à
 * l'init. Idempotent : les appels simultanés partagent la même promesse.
 * @returns {Promise<boolean>} true si le sampler est prêt
 */
export async function ensurePianoSamples() {
  if (pianoSampleBuffers.size > 0) return true;
  if (pianoSampleState === 'loading') {
    return new Promise((resolve) => pianoSampleWaiters.push(resolve));
  }
  const files = window.electronAPI?.files;
  const sampleDir = await window.electronAPI?.assets?.pianoSamplesDir?.();
  if (!files?.readBinary || !sampleDir) {
    // Sans IPC assets (nav ordinaire sans Electron), pas de sampler : le
    // moteur synthétique prend le relais, l'utilisateur a toujours un son.
    pianoSampleState = 'failed';
    return false;
  }
  pianoSampleState = 'loading';
  let loaded = 0;
  for (const note of PIANO_SAMPLES_NOTES) {
    try {
      const path = `${sampleDir}/${noteNameForMidi(note)}.mp3`;
      const bytes = await files.readBinary(path);
      const arrayBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
      const buffer = await audioCtx.decodeAudioData(arrayBuffer);
      pianoSampleBuffers.set(note, buffer);
      loaded++;
    } catch (_) {
      // Un échantillon manquant ne fait pas échouer l'ensemble : les notes de
      // cette zone retomberont sur l'échantillon voisin, ou sur le moteur
      // synthétique si vraiment rien ne charge.
    }
  }
  pianoSampleState = loaded > 0 ? 'ready' : 'failed';
  const ok = pianoSampleState === 'ready';
  for (const resolve of pianoSampleWaiters) resolve(ok);
  pianoSampleWaiters.length = 0;
  return ok;
}

/** Échantillon le plus proche de la note jouée, en MIDI. */
function nearestSampleFor(midi) {
  let best = null;
  let bestDistance = Infinity;
  for (const note of pianoSampleBuffers.keys()) {
    const d = Math.abs(note - midi);
    if (d < bestDistance) {
      bestDistance = d;
      best = note;
    }
  }
  return best;
}

/**
 * Joue une note de piano à partir de l'échantillon le plus proche, pitché
 * par playbackRate (au plus une tierce mineure — l'écart de timbre reste
 * inaudible). Retourne null si aucun échantillon n'est chargé.
 */
function playSampledPianoNote(midi, velocity) {
  const sampleNote = nearestSampleFor(midi);
  if (sampleNote === null) return null;

  const now = audioCtx.currentTime;
  const source = audioCtx.createBufferSource();
  source.buffer = pianoSampleBuffers.get(sampleNote);
  const semitones = midi - sampleNote;
  source.playbackRate.value = Math.pow(2, semitones / 12);

  // Enveloppe de sortie : l'échantillon porte déjà sa propre attaque et sa
  // décroissance naturelle. On n'ajoute qu'un gain de vélocité et une rampe
  // d'entrée très courte pour éviter le clic si le point de lecture n'est
  // pas sur un zéro de crossing.
  const gain = audioCtx.createGain();
  const peak = 0.22 * Math.pow(velocity, 1.3);
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(peak, now + 0.004);

  source.connect(gain);
  gain.connect(synthOutput);
  source.start(now);

  return {
    sampled: true,
    oscillators: [source],
    gains: [gain],
    masterGain: gain,
    filter: null,
  };
}

// Piano additive synthesis.
//
// [Claude] — 2026-09-05 — Réécriture du moteur de note pour un son moins
// « bipeur ». Quatre défauts de l'ancienne version, tous auditifs :
//   1. Partiels HARMONIQUES (multiples entiers exacts) : un piano réel est
//      inharmonique (cordes raides → partiels légèrement trop hauts), et c'est
//      précisément ce léger écart qui fait « piano » plutôt « orgue de sinus ».
//   2. Même enveloppe pour tous les partiels : en vrai, les partiels hauts
//      meurent bien plus vite que la fondamentale. C'est ce décalage qui donne
//      la brillance de l'attaque puis le rond de la tenue.
//   3. Une seule décroissance (0,8 s) pour toutes les notes : les graves
//      résonnent des dizaines de secondes, les aigus quelques secondes.
//   4. Un accord tenu ne « vit » pas : sans résonance de sympathie ni
//      oscillation de niveau, dix notes tenues sonnent comme dix sinus figés.
//
// Paramètres musicaux, pas des seuils de jugement : ils décrivent un piano,
// ils ne mesurent pas l'utilisateur.
const PIANO_PARTIALS = [
  { ratio: 1.0, gain: 1.0 },
  { ratio: 2.0, gain: 0.5 },
  { ratio: 3.0, gain: 0.28 },
  { ratio: 4.0, gain: 0.15 },
  { ratio: 5.0, gain: 0.07 },
  { ratio: 6.0, gain: 0.04 },
  { ratio: 7.0, gain: 0.022 },
];

// Coefficient d'inharmonie de Railsback-Ordway-Brown : B croît quand la corde
// est courte/raide. 0.0004 ≈ registre médium ; les graves montent, les aigus
// redescendent. fn = n·f0·√(1 + B·n²).
function partialFrequency(freq, n, inharmonicB) {
  return freq * n * Math.sqrt(1 + inharmonicB * n * n);
}

function playPianoNote(midi, velocity) {
  const freq = midiToFrequency(midi);
  const now = audioCtx.currentTime;

  // B inharmonique par registre : les graves ont des cordes raides (B fort),
  // les aigus des cordes fines (B faible).
  const inharmonicB = Math.max(0.00004, 0.0012 * Math.pow(2, (48 - midi) / 24));

  // Décroissance dépendante de la hauteur : Do1 ≈ 12 s, Do4 ≈ 5 s, Do7 ≈ 1,5 s.
  const decaySec = Math.max(1.2, 14 * Math.pow(2, -(midi - 24) / 22));

  // Le filtre s'ouvre à l'attaque puis se referme : le marteau excite tout le
  // spectre, la corde ne garde ensuite que ses partiels bas. Ça remplace
  // l'ancien lowpass figé à 8000 Hz par une attaque vivante.
  const openHz = clampOscFrequency(Math.min(11000, freq * 14 + 1500));
  const settleHz = Math.max(600, Math.min(6000, freq * 5 + 700));

  const masterGain = audioCtx.createGain();
  const filter = audioCtx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.Q.value = 0.3;
  filter.frequency.setValueAtTime(openHz, now);
  filter.frequency.exponentialRampToValueAtTime(settleHz, now + 0.35);

  masterGain.connect(filter);
  filter.connect(synthOutput);

  const oscillators = [];
  const gains = [];
  const maxPartialGain = PIANO_PARTIALS.reduce((sum, p) => sum + p.gain, 0);

  for (let i = 0; i < PIANO_PARTIALS.length; i++) {
    const partial = PIANO_PARTIALS[i];
    const n = i + 1;
    const osc = audioCtx.createOscillator();
    const partialGain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.value = clampOscFrequency(partialFrequency(freq, n, inharmonicB));
    osc.detune.value = (Math.random() - 0.5) * 4;

    partialGain.connect(masterGain);
    osc.connect(partialGain);

    const amplitude = (partial.gain / maxPartialGain) * velocity * 0.35;
    // Les partiels hauts meurent plus vite : 1/n sur la décroissance. La
    // fondamentale tient toute la note, la brillance s'éteint en quelques
    // dixièmes — c'est elle qui fait l'attaque « métallique » du marteau.
    const partialDecay = decaySec / n;
    partialGain.gain.setValueAtTime(0, now);
    partialGain.gain.linearRampToValueAtTime(amplitude, now + 0.008);
    partialGain.gain.exponentialRampToValueAtTime(
      Math.max(0.0001, amplitude * 0.12), now + partialDecay);

    osc.start(now);
    oscillators.push(osc);
    gains.push(partialGain);
  }

  // Léger « bloom » : une corde frappée gonfle pendant ~120 ms avant de
  // décroître (l'énergie se répartit entre cordes voisines et table). Sans
  // lui, le son démarre à son niveau maximal et paraît plat.
  masterGain.gain.setValueAtTime(0, now);
  masterGain.gain.linearRampToValueAtTime(velocity * 0.66, now + 0.012);
  masterGain.gain.linearRampToValueAtTime(velocity * 0.58, now + 0.13);
  masterGain.gain.exponentialRampToValueAtTime(velocity * 0.24, now + decaySec * 0.35);
  masterGain.gain.exponentialRampToValueAtTime(0.002, now + decaySec);

  // Oscillation lente du niveau (battement acoustique entre cordes légèrement
  // désaccordées d'une même note) : donne la vie de la tenue.
  const shimmer = audioCtx.createOscillator();
  const shimmerGain = audioCtx.createGain();
  shimmer.type = 'sine';
  shimmer.frequency.value = 0.9 + Math.random() * 0.6;
  shimmerGain.gain.value = velocity * 0.05;
  shimmer.connect(shimmerGain);
  shimmerGain.connect(masterGain.gain);
  shimmer.start(now);
  oscillators.push(shimmer);
  gains.push(shimmerGain);

  return { oscillators, gains, masterGain, filter };
}

// Rhodes FM synthesis
//
// [Claude] — 2026-09-05 — Même défaut que le piano avant réécriture : une
// enveloppe unique et courte (0,6 s) pour toutes les notes, alors qu'un Rhodes
// tient longuement, surtout dans les graves. Décroissance par registre et
// index FM qui s'apaise au fil de la note (le « tine » mordant de l'attaque
// laisse place au corps).
function playRhodesNote(midi, velocity) {
  const freq = midiToFrequency(midi);
  const now = audioCtx.currentTime;

  // Graves ronds et longs, aigus plus courts — profil mesuré d'un Rhodes réel.
  const decaySec = Math.max(1.6, 10 * Math.pow(2, -(midi - 30) / 24));

  const masterGain = audioCtx.createGain();
  const filter = audioCtx.createBiquadFilter();
  filter.type = 'lowpass';
  // Le filtre s'ouvre fort à l'attaque (le tine est brillant) puis se referme.
  const openHz = 4200 + velocity * 2600;
  filter.frequency.setValueAtTime(openHz, now);
  filter.frequency.exponentialRampToValueAtTime(
    Math.max(900, freq * 4 + 600), now + 0.5);
  filter.Q.value = 0.4;

  masterGain.connect(filter);
  filter.connect(synthOutput);

  // FM: carrier + modulator. L'index FM s'affaisse avec le temps : la
  // brillance métallique de l'attaque cède la place au son de « toilettte »
  // de la lampe — c'est la signature du Rhodes.
  const modRatio = 3 + (Math.random() - 0.5) * 0.2;
  const modIndexPeak = velocity * modRatio * 80;

  const modulator = audioCtx.createOscillator();
  const modGain = audioCtx.createGain();
  modulator.type = 'sine';
  modulator.frequency.value = clampOscFrequency(freq * modRatio);
  modGain.gain.setValueAtTime(modIndexPeak, now);
  modGain.gain.exponentialRampToValueAtTime(modIndexPeak * 0.12, now + decaySec * 0.4);
  modulator.connect(modGain);
  modGain.connect(modulator.frequency);

  const carrier = audioCtx.createOscillator();
  const carrierGain = audioCtx.createGain();
  carrier.type = 'sine';
  carrier.frequency.value = clampOscFrequency(freq);
  carrierGain.connect(masterGain);
  carrier.connect(carrierGain);

  // Second oscillateur désaccordé pour la chaleur (battement lent, pas figé).
  const carrier2 = audioCtx.createOscillator();
  const carrier2Gain = audioCtx.createGain();
  carrier2.type = 'sine';
  carrier2.frequency.value = clampOscFrequency(freq);
  carrier2.detune.value = 6;
  carrier2Gain.gain.value = velocity * 0.3;
  carrier2Gain.connect(masterGain);
  carrier2.connect(carrier2Gain);

  // Partiels « cloche » du tine : ils ne sont PAS modulés par la FM (l'ancien
  // code connectait le modulator à leur gain, ce qui les rendait instables).
  // Ils meurent vite : c'est le cliquetis de l'attaque.
  const bellPartials = [5.01, 8.02, 13.03];
  const bellGains = [];
  for (const ratio of bellPartials) {
    const osc = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.value = clampOscFrequency(freq * ratio);
    g.gain.setValueAtTime(velocity * 0.035, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.25);
    g.connect(masterGain);
    osc.connect(g);
    osc.start(now);
    bellGains.push(g);
  }

  // Enveloppe : attaque douce, bloom, puis décroissance longue du registre.
  masterGain.gain.setValueAtTime(0, now);
  masterGain.gain.linearRampToValueAtTime(velocity * 0.5, now + 0.006);
  masterGain.gain.linearRampToValueAtTime(velocity * 0.56, now + 0.12);
  masterGain.gain.exponentialRampToValueAtTime(velocity * 0.3, now + decaySec * 0.4);
  masterGain.gain.exponentialRampToValueAtTime(0.002, now + decaySec);

  carrierGain.gain.value = velocity * 0.5;

  modulator.start(now);
  carrier.start(now);
  carrier2.start(now);

  const oscillators = [modulator, carrier, carrier2];
  const gains = [modGain, carrierGain, carrier2Gain, ...bellGains];

  return { oscillators, gains, masterGain, filter };
}

export function playNote(midi, velocity = 0.8) {
  if (!isValidMidiNote(midi)) {
    console.warn('[simple-synth] Note MIDI invalide ignorée:', midi);
    return;
  }

  const vel = Number.isFinite(velocity) && velocity >= 0 && velocity <= 1
    ? velocity
    : 0.8;

  resumeAudio();

  if (activeOscillators.has(midi)) {
    // Re-frappe d'une note encore tenue (y compris maintenue par la pédale) :
    // l'ancienne voix s'éteint vite, la nouvelle la remplace.
    stopOscillators(activeOscillators.get(midi), 0.05);
    activeOscillators.delete(midi);
    releasedWithSustain.delete(midi);
  }

  let nodes = null;
  if (synthMode === 'piano') {
    // Sampler d'abord : échantillons prêts → note réelle. Sinon on amorce le
    // chargement (la TOUTE première note d'une session peut retomber sur le
    // moteur synthétique le temps du décodage — un seul frais de départ).
    if (pianoSampleBuffers.size > 0) {
      nodes = playSampledPianoNote(midi, vel);
    } else {
      ensurePianoSamples();
    }
  }
  if (nodes === null) {
    nodes = synthMode === 'rhodes'
      ? playRhodesNote(midi, vel)
      : playPianoNote(midi, vel);
  }

  activeOscillators.set(midi, nodes);
}

// Pédale sustain du synthé : une note relâchée pédale enfoncée continue de
// sonner (piano : l'étouffoir se lève), et s'éteint à la remontée de la pédale.
// main.js connaissait déjà l'état de la pédale pour l'affichage — il lui
// manquait de le demander au son. `releaseNote` consulte ce drapeau : rien ne
// change pour les appelants.
let sustainDown = false;

/**
 * Fait remonter la pédale sustain dans le synthé.
 * @param {boolean} value - true = pédale enfoncée
 */
export function setSustain(value) {
  sustainDown = value === true;
  if (!sustainDown) {
    // Remontée de pédale : toutes les notes maintenues s'éteignent ensemble,
    // comme les étouffoirs qui retombent d'un coup sur les cordes.
    for (const [midi, nodes] of activeOscillators) {
      if (releasedWithSustain.has(midi)) {
        stopOscillators(nodes, 0.22);
        activeOscillators.delete(midi);
        releasedWithSustain.delete(midi);
      }
    }
  }
}

// Notes physiquement relâchées mais maintenues par la pédale.
const releasedWithSustain = new Set();

function stopOscillators({ oscillators, gains, masterGain, filter }, releaseSec = 0.18) {
  const now = audioCtx.currentTime;
  try {
    masterGain.gain.cancelScheduledValues(now);
    masterGain.gain.setValueAtTime(masterGain.gain.value, now);
    masterGain.gain.exponentialRampToValueAtTime(0.001, now + releaseSec);

    for (const g of gains) {
      try {
        g.gain.cancelScheduledValues(now);
        g.gain.setValueAtTime(g.gain.value, now);
        g.gain.exponentialRampToValueAtTime(0.001, now + releaseSec);
      } catch (e) { /* ignore */ }
    }

    const stopTime = now + releaseSec + 0.1;
    for (const osc of oscillators) {
      try { osc.stop(stopTime); } catch (e) { /* ignore */ }
    }

    setTimeout(() => {
      try {
        for (const osc of oscillators) try { osc.disconnect(); } catch (e) { /* ignore */ }
        for (const g of gains) try { g.disconnect(); } catch (e) { /* ignore */ }
        masterGain.disconnect();
        if (filter) filter.disconnect();
      } catch (e) { /* ignore */ }
    }, (releaseSec + 0.25) * 1000);
  } catch (e) { /* ignore */ }
}

export function releaseNote(midi) {
  if (!isValidMidiNote(midi)) return;
  if (!activeOscillators.has(midi)) return;
  if (sustainDown) {
    // Pédale enfoncée : la note continue de résonner, mais se souvient qu'elle
    // est relâchée — la remontée de pédale l'éteindra.
    releasedWithSustain.add(midi);
    return;
  }
  stopOscillators(activeOscillators.get(midi), 0.18);
  activeOscillators.delete(midi);
}
