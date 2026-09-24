// [Claude] — 2026-09-24 — Lecteur des démos d'exercice (practice-demo.js).
// Il joue les évènements dans le temps et les confie à `send`, qui les fait
// passer par le même chemin qu'un vrai clavier MIDI (touches, son ou sortie MIDI,
// accord détecté) sans faire avancer l'exercice (voir feedDemoEvent, main.js).
//
// Une même note peut être tenue deux fois (basse d'approche et voicing) : on
// compte les appuis et on ne la relâche qu'au dernier relâchement, sinon la
// première fin couperait la seconde.

const START_DELAY_MS = 80;

/**
 * @param {{
 *   send: (type: 'noteOn'|'noteOff'|'sustain', a: number|boolean, b?: number) => void,
 *   onStep?: (step: number) => void,
 *   onEnd?: (reason: 'finished'|'stopped') => void,
 *   setTimer?: (fn: Function, ms: number) => any,
 *   clearTimer?: (id: any) => void,
 * }} options
 */
export function createDemoPlayer({ send, onStep, onEnd, setTimer = setTimeout, clearTimer = clearTimeout }) {
  let timers = [];
  const held = new Map(); // note → nombre d'appuis en cours
  let pedal = false;
  let playing = false;
  let token = null;

  function fire(event) {
    switch (event.type) {
      case 'noteOn': {
        const count = held.get(event.note) || 0;
        // Note déjà tenue : on la relâche pour la rejouer (nouvelle attaque).
        if (count > 0) send('noteOff', event.note);
        send('noteOn', event.note, event.velocity);
        held.set(event.note, count + 1);
        break;
      }
      case 'noteOff': {
        const count = held.get(event.note) || 0;
        if (count <= 1) {
          held.delete(event.note);
          if (count === 1) send('noteOff', event.note);
        } else {
          held.set(event.note, count - 1);
        }
        break;
      }
      case 'sustain':
        pedal = Boolean(event.value);
        send('sustain', pedal);
        break;
      case 'step':
        onStep?.(event.step);
        break;
      default:
        break;
    }
  }

  function releaseAll() {
    for (const note of held.keys()) send('noteOff', note);
    held.clear();
    if (pedal) send('sustain', false);
    pedal = false;
  }

  /**
   * Joue une démo ({events, beats}) au tempo donné (noires par minute). Une
   * démo en cours est arrêtée d'abord.
   * @returns {object} jeton de lecture (pour savoir si c'est toujours elle qui joue)
   */
  function play({ events, beats }, { tempo = 72 } = {}) {
    stop(false);
    const msPerBeat = 60000 / tempo;
    playing = true;
    const current = {};
    token = current;
    timers = events.map((event) => setTimer(() => {
      if (token === current) fire(event);
    }, START_DELAY_MS + Math.max(0, event.time) * msPerBeat));
    const endAt = START_DELAY_MS + Math.max(beats, ...events.map((e) => e.time)) * msPerBeat + 250;
    timers.push(setTimer(() => {
      if (token !== current) return;
      releaseAll();
      playing = false;
      token = null;
      timers = [];
      onEnd?.('finished');
    }, endAt));
    return current;
  }

  /** Arrête la démo : tout est relâché, pédale comprise. */
  function stop(notify = true) {
    const wasPlaying = playing;
    timers.forEach((id) => clearTimer(id));
    timers = [];
    token = null;
    playing = false;
    releaseAll();
    if (wasPlaying && notify) onEnd?.('stopped');
  }

  return {
    play,
    stop,
    isPlaying: () => playing,
    isCurrent: (t) => t != null && t === token,
  };
}
