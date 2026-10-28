import { resumeAudio } from './simple-synth.js';
import { createPitchShifter, createPitchShifterNow } from './pitch-shifter.js';

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

  /**
   * Bus → SoundTouch dès qu'on a transposé, sinon directement vers la sortie (aucun calcul).
   * [Claude] — 2026-10-09 — Une fois branché, SoundTouch le reste (même revenu à 0) jusqu'au
   * prochain morceau : changer de transposition n'est alors qu'un `setPitch()`, en direct, sans
   * relancer les pistes (CLAUDE.md §5). Chaque bascule de branchement, elle, relance les pistes.
   * `force` : débrancher quoi qu'il arrive (changement de morceau).
   * @returns {boolean} le branchement a changé
   */
  function routeBus(force = false) {
    if (!bus) return false;
    const wantShifter = !force && !!pitchShifter && (currentPitch !== 0 || busThroughShifter);
    if (wantShifter === busThroughShifter) return false;
    try { bus.disconnect(); } catch (_) {}
    bus.connect(wantShifter ? pitchShifter.node : destination);
    busThroughShifter = wantShifter;
    return true;
  }

  /**
   * Remplace SoundTouch par un nœud neuf (tampons vides). Appelé à chaque relance des pistes :
   * sans cela, ~0,13 s de l'ancienne position ressortait après un saut ou une transposition,
   * avec un retard variable — l'image se recalait, on croyait que « ça accélère puis ralentit ».
   */
  function freshShifter() {
    if (!pitchShifter || !busThroughShifter) return;
    let next;
    try {
      next = createPitchShifterNow(audioCtx, destination, currentPitch);
    } catch (err) {
      console.warn('[StemMixer] nouveau pitch-shifter impossible, on garde l\'ancien :', err);
      return;
    }
    try { bus.disconnect(); } catch (_) {}
    bus.connect(next.node);
    pitchShifter.disconnect();
    pitchShifter = next;
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

    freshShifter();

    // Toutes les pistes démarrent au même instant de l'horloge audio (léger délai pour que les
    // cinq départs tombent dans le même bloc). Le volume remonte depuis 0 à partir de cet
    // instant, programmé sur l'horloge audio (avant : un setTimeout de 30 ms, qui glissait quand
    // le processeur était chargé).
    const now = audioCtx.currentTime;
    const startAt = now + 0.01;
    for (const stem of Object.keys(gains)) {
      const param = gains[stem].gain;
      param.cancelScheduledValues(now);
      param.setValueAtTime(0, now);
      param.setTargetAtTime(computeGain(stem), startAt, 0.01);
    }
    for (const stem of Object.keys(buffers)) {
      sourceNodes[stem] = createSourceForStem(stem, startOffset, startAt);
    }
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
    pitchShifter?.setPitch(0);
    routeBus(true);
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
    // Position entendue AVANT un éventuel changement de branchement (le retard en dépend).
    const heard = isPlaying ? getCurrentTime() : currentTime;
    currentPitch = semitones;
    pitchShifter?.setPitch(semitones);
    // SoundTouch déjà branché : la hauteur change en direct (tempo verrouillé à 1, la position ne
    // bouge pas) — rien à relancer. Seule la première transposition branche SoundTouch : on
    // relance alors les pistes depuis la position entendue.
    if (routeBus() && isPlaying) {
      play(heard);
    }
  }

  /**
   * Secondes avant que le son relancé ne soit entendu (départ programmé + retard de SoundTouch
   * neuf). La vidéo attend ce délai au lieu de partir devant puis d'être recalée.
   */
  function getWarmupRemaining() {
    if (!audioCtx || !isPlaying) return 0;
    const latency = busThroughShifter ? PITCH_SHIFTER_LATENCY : 0;
    return Math.max(0, playStartCtxTime + latency - audioCtx.currentTime);
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
    getWarmupRemaining,
    setOnProgress: (cb) => { onProgress = cb; },
    get loadedStems() { return Object.keys(buffers); },
    getState: () => state,
    getAudioContext: ensureContext,
    getDestination: () => destination,
    getSources: () => buffers,
  };
}
