import { resumeAudio } from './simple-synth.js';
import { createPitchShifter } from './pitch-shifter.js';

const STEMS = ['bass', 'drums', 'vocals', 'other', 'piano'];

// Convert a dB value to a linear gain. -Infinity dB -> 0 gain.
export function dbToGain(db) {
  if (db <= -60) return 0;
  return Math.pow(10, db / 20);
}

export function gainToDb(gain) {
  if (gain <= 0) return -Infinity;
  return 20 * Math.log10(gain);
}

export function createStemMixer() {
  let audioCtx = null;
  let sources = {};
  let sourceNodes = {};
  let pitchShifters = {};
  let gains = {};
  let state = {};
  let destination = null;
  let currentDuration = 0;
  let onProgress = null;
  let progressInterval = null;
  let masterGain = null;
  let isLoaded = false;
  let currentPitch = 0;

  for (const stem of STEMS) {
    state[stem] = { muted: false, solo: false, volumeDb: 0 };
  }

  function ensureContext() {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
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
      disconnectAll();
      sources = {};
      gains = {};
      currentDuration = 0;
      return [];
    }

    ensureContext();
    await resumeAudio();
    await audioCtx.resume();

    stop();
    disconnectAll();
    sources = {};
    sourceNodes = {};
    pitchShifters = {};
    gains = {};
    currentDuration = 0;

    for (const stem of STEMS) {
      const path = stemPaths[stem];
      if (!path) continue;

      const audio = new Audio(path);
      audio.crossOrigin = 'anonymous';
      audio.preload = 'auto';
      try {
        const mediaSource = audioCtx.createMediaElementSource(audio);
        sourceNodes[stem] = mediaSource;
        const gain = audioCtx.createGain();
        // Start completely silent to avoid any noise when playback begins.
        gain.gain.setValueAtTime(0, audioCtx.currentTime);
        const shifter = await createPitchShifter(audioCtx, gain, currentPitch);
        pitchShifters[stem] = shifter;
        mediaSource.connect(shifter.node);
        gain.connect(destination);
        sources[stem] = audio;
        gains[stem] = gain;
        audio.addEventListener('loadedmetadata', () => {
          if (audio.duration && audio.duration > currentDuration) {
            currentDuration = audio.duration;
          }
        });
      } catch (err) {
        console.warn(`[StemMixer] failed to create source for ${stem}:`, err);
      }
    }

    isLoaded = true;
    // Keep gains at 0 until play() ramps them up.
    return Object.keys(sources);
  }

  function disconnectAll() {
    for (const stem of Object.keys(pitchShifters)) {
      try {
        pitchShifters[stem].disconnect();
      } catch (e) {
        // ignore
      }
    }
    for (const stem of Object.keys(gains)) {
      try {
        gains[stem].disconnect();
      } catch (e) {
        // ignore
      }
    }
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

  function play() {
    if (!audioCtx || !isLoaded) return;
    const now = audioCtx.currentTime;
    // Reset all gains to 0 immediately, then ramp up smoothly.
    for (const stem of Object.keys(gains)) {
      gains[stem].gain.cancelScheduledValues(now);
      gains[stem].gain.setValueAtTime(0, now);
    }
    for (const audio of Object.values(sources)) {
      audio.currentTime = getCurrentTime();
      audio.play().catch(() => {});
    }
    // Ramp up after a tiny delay so all sources are roughly in sync.
    setTimeout(() => applyState(0.05), 30);
    startProgress();
  }

  function pause() {
    for (const audio of Object.values(sources)) {
      audio.pause();
    }
    stopProgress();
  }

  function stop() {
    for (const audio of Object.values(sources)) {
      audio.pause();
      audio.currentTime = 0;
    }
    stopProgress();
  }

  function reset() {
    stop();
    disconnectAll();
    for (const stem of Object.keys(sourceNodes)) {
      try {
        sourceNodes[stem].mediaElement?.pause?.();
      } catch (_) {
        // ignore
      }
    }
    sources = {};
    sourceNodes = {};
    pitchShifters = {};
    gains = {};
    currentDuration = 0;
    isLoaded = false;
  }

  function seek(time) {
    for (const audio of Object.values(sources)) {
      audio.currentTime = time;
    }
  }

  function getCurrentTime() {
    const src = Object.values(sources)[0];
    return src ? src.currentTime : 0;
  }

  function getDuration() {
    return currentDuration;
  }

  function hasStems() {
    return isLoaded;
  }

  function setDetune(semitones) {
    currentPitch = semitones;
    for (const stem of Object.keys(pitchShifters)) {
      pitchShifters[stem]?.setPitch(semitones);
    }
  }

  function startProgress() {
    stopProgress();
    progressInterval = setInterval(() => {
      const t = getCurrentTime();
      const d = getDuration();
      onProgress?.(t, d);
    }, 200);
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
    get loadedStems() { return Object.keys(sources); },
    getState: () => state,
    getAudioContext: ensureContext,
    getDestination: () => destination,
    getSources: () => sources,
  };
}
