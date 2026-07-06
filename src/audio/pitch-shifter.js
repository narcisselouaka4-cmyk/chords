import { SoundTouchNode } from '@soundtouchjs/audio-worklet';
import processorUrl from '@soundtouchjs/audio-worklet/processor?url';

/**
 * Factory de PitchShifter basé sur SoundTouch AudioWorklet.
 * Le processeur est enregistré une seule fois par AudioContext.
 */
const registeredContexts = new WeakSet();
const registrations = new WeakMap();

async function ensureWorkletRegistered(audioCtx) {
  if (registeredContexts.has(audioCtx)) return;
  if (registrations.has(audioCtx)) return registrations.get(audioCtx);

  const promise = SoundTouchNode.register(audioCtx, processorUrl).then(() => {
    registeredContexts.add(audioCtx);
  }).catch((err) => {
    console.error('[PitchShifter] Failed to register SoundTouch worklet:', err);
    throw err;
  });

  registrations.set(audioCtx, promise);
  return promise;
}

/**
 * Crée un nœud de pitch-shifting et le connecte à destinationNode.
 *
 * @param {AudioContext} audioCtx
 * @param {AudioNode} destinationNode
 * @param {number} semitones
 * @returns {Promise<{ node: AudioNode, setPitch(semitones: number): void, disconnect(): void, clear(): void }>}
 */
function semitonesToPitchRatio(semitones) {
  return Math.pow(2, semitones / 12);
}

export async function createPitchShifter(audioCtx, destinationNode, semitones = 0) {
  await ensureWorkletRegistered(audioCtx);
  const stNode = new SoundTouchNode({ context: audioCtx });

  // Verrouillage STRICT du tempo et du rate sur 1.0.
  // Seul le pitch change. On modifie explicitement les trois paramètres
  // pour éviter que SoundTouch ne reçoive un time-stretching non désiré.
  stNode.tempo = 1.0;
  stNode.rate = 1.0;
  stNode.pitchSemitones = semitones;

  // Paramètre AudioParam de secours si l'objet expose des paramètres wrappés.
  if (stNode.tempo && typeof stNode.tempo.value === 'number') stNode.tempo.value = 1.0;
  if (stNode.rate && typeof stNode.rate.value === 'number') stNode.rate.value = 1.0;
  if (stNode.playbackRate && typeof stNode.playbackRate.value === 'number') stNode.playbackRate.value = 1.0;

  stNode.connect(destinationNode);

  return {
    node: stNode,
    setPitch: (st) => {
      // On garde le verrou tempo/rate actif, on ne touche qu'au pitch.
      if (stNode.tempo && typeof stNode.tempo.value === 'number') stNode.tempo.value = 1.0;
      if (stNode.rate && typeof stNode.rate.value === 'number') stNode.rate.value = 1.0;
      if (stNode.playbackRate && typeof stNode.playbackRate.value === 'number') stNode.playbackRate.value = 1.0;
      stNode.pitchSemitones = st;
    },
    disconnect: () => {
      try {
        stNode.disconnect();
      } catch (_) { /* ignore */ }
    },
    clear: () => {
      // Purge les buffers internes SoundTouch si la méthode existe.
      try {
        if (typeof stNode.clear === 'function') stNode.clear();
        if (typeof stNode.flush === 'function') stNode.flush();
        if (stNode.soundTouch && typeof stNode.soundTouch.clear === 'function') stNode.soundTouch.clear();
      } catch (_) { /* ignore */ }
    },
  };
}
