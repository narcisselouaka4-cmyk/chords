import { resumeAudio } from './simple-synth.js';
import { createPitchShifter } from './pitch-shifter.js';

const STEMS = ['bass', 'drums', 'vocals', 'other', 'piano'];

// [Claude] — 2026-10-09 — Narcisse : « après la séparation, le lecteur, la vidéo, les voix…
// micro-latences par-ci, par-là ». Cause mesurée : un SoundTouch (AudioWorklet) PAR piste, même à
// transposition 0. Son pire bloc coûte ~0,7 ms ; les 5 pistes démarrent ensemble, leurs pics
// tombent au même bloc (~3,4 ms pour un budget de 2,9 ms à 44,1 kHz) → le son décroche. Et
// SoundTouch retarde le son d'environ 135 ms : la vidéo, calée sur l'horloge, passait devant.
// Désormais : pistes → volumes → un bus → UN SoundTouch seulement si on transpose, sinon direct.
/** Retard de SoundTouch (mesuré : 128 à 142 ms avant la première sortie), rattrapé dans l'horloge. */
export const PITCH_SHIFTER_LATENCY = 0.135;

// Convert a dB value to a linear gain. -Infinity dB -> 0 gain.
export function dbToGain(db) {
  if (db <= -60) return 0;
  return Math.pow(10, db / 20);
}

export function gainToDb(gain) {
  if (gain <= 0) return -Infinity;
  return 20 * Math.log10(gain);
}

/**
 * Crée le mixer de stems autour d'un AudioContext partagé.
 *
 * @param {AudioContext|null} sharedAudioCtx - Contexte audio à partager.
 * @param {(path: string) => Promise<ArrayBuffer>} readAudioFn - Fonction de lecture
 *   du fichier (obligatoire). Doit retourner un ArrayBuffer valide pour
 *   AudioContext.decodeAudioData(). Cela permet d'éviter fetch(blob:) bloqué par CSP.
 */
export function createStemMixer(sharedAudioCtx = null, readAudioFn = null) {
  let audioCtx = sharedAudioCtx;
  let readAudio = readAudioFn;

  let buffers = {};           // stem -> AudioBuffer
  let sourceNodes = {};       // stem -> AudioBufferSourceNode actif
  let pitchShifter = null;    // UN seul pitch-shifter, sur le bus (persistant)
  let bus = null;             // somme des pistes, après leurs volumes
  let busThroughShifter = false;
  let gains = {};             // stem -> GainNode (persistant)
  let state = {};
  let destination = null;
  let currentDuration = 0;
  let onProgress = null;
  let progressInterval = null;
  let masterGain = null;
  let isLoaded = false;
  let currentPitch = 0;

  let currentTime = 0;          // position dans le fichier (secondes)
  let playStartCtxTime = 0;     // audioCtx.currentTime au moment du play
  let isPlaying = false;

  for (const stem of STEMS) {
    state[stem] = { muted: false, solo: false, volumeDb: 0 };
  }

  function ensureContext() {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (!destination) {
      destination = audioCtx.createGain();
      destination.connect(audioCtx.destination);
      masterGain = destination;
    }
    return audioCtx;
  }

  async function loadStems(stemPaths) {
    const hasAny = Object.values(stemPaths).some(Boolean);
    if (!hasAny) {
      isLoaded = false;
      stop();
      disconnectSources();
      buffers = {};
      gains = {};
      currentDuration = 0;
      return [];
    }

    ensureContext();
    await resumeAudio();
    await audioCtx.resume();

    stop();
    disconnectSources();
    for (const stem of Object.keys(gains)) {
      try { gains[stem].disconnect(); } catch (_) {}
    }
    buffers = {};
    sourceNodes = {};
    gains = {};
    currentDuration = 0;
    ensureBus();

    if (!readAudio) {
      console.error('[StemMixer] readAudioFn manquant : impossible de charger les stems.');
      return [];
    }

    for (const stem of STEMS) {
      const path = stemPaths[stem];
      if (!path) continue;

      try {
        const arrayBuffer = await readAudio(path);
        const buffer = await audioCtx.decodeAudioData(arrayBuffer);
        buffers[stem] = buffer;

        const gain = audioCtx.createGain();
        gain.gain.setValueAtTime(0, audioCtx.currentTime);
        gain.connect(bus);
        gains[stem] = gain;

        if (buffer.duration && buffer.duration > currentDuration) {
          currentDuration = buffer.duration;
        }
      } catch (err) {
        console.warn(`[StemMixer] failed to load stem ${stem}:`, err);
      }
    }

    // Le pitch-shifter unique est créé une fois (il reste sans entrée, donc sans calcul, tant
    // qu'on ne transpose pas) : passer de 0 à ±n demi-tons en lecture ne demande qu'un rebranchement.
    if (!pitchShifter) {
      try {
        pitchShifter = await createPitchShifter(audioCtx, destination, currentPitch);
      } catch (err) {
        console.warn('[StemMixer] pitch-shifter indisponible :', err);
      }
    }
    routeBus();

    isLoaded = Object.keys(buffers).length > 0;
    currentTime = 0;
    return Object.keys(buffers);
  }

  function ensureBus() {
    if (bus) return;
    bus = audioCtx.createGain();
    busThroughShifter = false;
    bus.connect(destination);
  }

  /** Bus → SoundTouch si on transpose, sinon directement vers la sortie (aucun calcul). */
  function routeBus() {
    if (!bus) return;
    const wantShifter = currentPitch !== 0 && !!pitchShifter;
    if (wantShifter === busThroughShifter) return;
    try { bus.disconnect(); } catch (_) {}
    if (wantShifter) {
      pitchShifter.clear?.();
      bus.connect(pitchShifter.node);
    } else {
      bus.connect(destination);
    }
    busThroughShifter = wantShifter;
  }

  function disconnectSources() {
    for (const stem of Object.keys(sourceNodes)) {
      try {
        sourceNodes[stem].stop?.();
      } catch (_) {}
      try {
        sourceNodes[stem].disconnect();
      } catch (_) {}
    }
    sourceNodes = {};
  }

  function computeGain(stem) {
    const s = state[stem];
    const anySolo = Object.values(state).some((x) => x.solo);
    if (s.muted) return 0;
    if (anySolo && !s.solo) return 0;
    return dbToGain(s.volumeDb);
  }

  function applyState(rampTime = 0.05) {
    if (!audioCtx) return;
    const now = audioCtx.currentTime;
    for (const stem of Object.keys(gains)) {
      const gain = gains[stem];
      const target = computeGain(stem);
      gain.gain.setTargetAtTime(target, now, rampTime);
    }
  }

  function setMute(stem, muted) {
    if (!state[stem]) return;
    state[stem].muted = muted;
    applyState();
  }

  function setSolo(stem, soloed) {
    if (!state[stem]) return;
    state[stem].solo = soloed;
    applyState();
  }

  function setVolume(stem, volumeDb) {
    if (!state[stem]) return;
    state[stem].volumeDb = volumeDb;
    applyState();
  }

  function setMasterVolume(volumeDb) {
    if (masterGain && audioCtx) {
      masterGain.gain.setTargetAtTime(dbToGain(volumeDb), audioCtx.currentTime, 0.05);
    }
  }

  function createSourceForStem(stem, offset, startAt = 0) {
    const buffer = buffers[stem];
    const gain = gains[stem];
    if (!buffer || !gain) return null;

    const src = audioCtx.createBufferSource();
    src.buffer = buffer;
    src.playbackRate.value = 1.0;
    src.connect(gain);

    src.start(startAt, offset);
    return src;
  }

  function play(offset = null) {
    if (!audioCtx || !isLoaded) return;
    if (audioCtx.state === 'suspended') {
      audioCtx.resume().catch(() => {});
    }

    const startOffset = offset !== null ? offset : currentTime;
    currentTime = startOffset;
    playStartCtxTime = audioCtx.currentTime + 0.01;
    isPlaying = true;

    disconnectSources();

    const now = audioCtx.currentTime;
    for (const stem of Object.keys(gains)) {
      gains[stem].gain.cancelScheduledValues(now);
      gains[stem].gain.setValueAtTime(0, now);
    }

    // Toutes les pistes démarrent au même instant de l'horloge audio (léger délai pour que les
    // cinq départs tombent dans le même bloc).
    const startAt = audioCtx.currentTime + 0.01;
    for (const stem of Object.keys(buffers)) {
      sourceNodes[stem] = createSourceForStem(stem, startOffset, startAt);
    }

    // Ramp up après un court délai pour synchroniser les stems.
    setTimeout(() => applyState(0.05), 30);
    startProgress();
  }

  function pause() {
    if (!isPlaying) return;
    currentTime = getCurrentTime();
    isPlaying = false;
    disconnectSources();
    stopProgress();
  }

  function stop() {
    disconnectSources();
    isPlaying = false;
    currentTime = 0;
    stopProgress();
  }

  function reset() {
    stop();
    for (const stem of Object.keys(gains)) {
      try { gains[stem].disconnect(); } catch (_) {}
    }
    // Le bus et le pitch-shifter unique sont gardés : ils resservent au morceau suivant.
    currentPitch = 0;
    routeBus();
    buffers = {};
    sourceNodes = {};
    gains = {};
    currentDuration = 0;
    isLoaded = false;
  }

  function seek(time) {
    currentTime = Math.max(0, time);
    if (isPlaying) {
      play(currentTime);
    }
  }

  function getCurrentTime() {
    if (!audioCtx || !isLoaded) return 0;
    if (isPlaying) {
      // Par SoundTouch, on entend le son ~135 ms après l'avoir envoyé : l'horloge (vidéo,
      // curseur) suit ce qu'on entend.
      const latency = busThroughShifter ? PITCH_SHIFTER_LATENCY : 0;
      const elapsed = Math.max(0, audioCtx.currentTime - playStartCtxTime - latency);
      return Math.min(currentDuration, currentTime + elapsed);
    }
    return currentTime;
  }

  function getDuration() {
    return currentDuration;
  }

  function hasStems() {
    return isLoaded;
  }

  function setDetune(semitones) {
    // Mémoriser la position exacte avant de changer le pitch pour rester synchrone.
    if (isPlaying) {
      currentTime = getCurrentTime();
    }
    currentPitch = semitones;
    pitchShifter?.setPitch(semitones);
    routeBus();

    // Si on est en lecture, recréer les sources pour qu'elles démarrent à la
    // position actuelle avec le nouveau pitch (évite la dérive temporelle).
    if (isPlaying) {
      play(currentTime);
    }
  }

  function startProgress() {
    stopProgress();
    progressInterval = setInterval(() => {
      const t = getCurrentTime();
      const d = getDuration();
      onProgress?.(t, d);
    }, 80);
  }

  function stopProgress() {
    if (progressInterval) {
      clearInterval(progressInterval);
      progressInterval = null;
    }
  }

  return {
    loadStems,
    setMute,
    setSolo,
    setVolume,
    setMasterVolume,
    play,
    pause,
    stop,
    reset,
    seek,
    getCurrentTime,
    getDuration,
    hasStems,
    setDetune,
    setOnProgress: (cb) => { onProgress = cb; },
    get loadedStems() { return Object.keys(buffers); },
    getState: () => state,
    getAudioContext: ensureContext,
    getDestination: () => destination,
    getSources: () => buffers,
  };
}
