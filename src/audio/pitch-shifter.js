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
 * @returns {Promise<{ node: AudioNode, setPitch(semitones: number): void, disconnect(): void }>}
 */
export async function createPitchShifter(audioCtx, destinationNode, semitones = 0) {
  await ensureWorkletRegistered(audioCtx);
  const stNode = new SoundTouchNode({ context: audioCtx });
  stNode.pitchSemitones.value = semitones;
  stNode.playbackRate.value = 1;
  stNode.connect(destinationNode);

  return {
    node: stNode,
    setPitch: (st) => {
      stNode.pitchSemitones.value = st;
    },
    disconnect: () => {
      try {
        stNode.disconnect();
      } catch (_) { /* ignore */ }
    },
  };
}
