// [Claude] — 2026-09-24 — Lecteur des démos d'exercice (practice-demo.js).
// Il joue les évènements dans le temps et les confie à `send`, qui les fait
// passer par le même chemin qu'un vrai clavier MIDI (touches, son ou sortie MIDI,
// accord détecté) sans faire avancer l'exercice (voir feedDemoEvent, main.js).
//
// Une même note peut être tenue deux fois (basse d'approche et voicing) : on
// compte les appuis et on ne la relâche qu'au dernier relâchement, sinon la
// première fin couperait la seconde.
//
// [Claude] — 2026-10-03 — Comme un lecteur (Narcisse : « il faudrait un système pour
// pouvoir revenir en arrière manuellement quand le copilote joue, un peu comme sur un
// lecteur ») : pause, reprise, aller à un instant (−5 s). Une reprise au milieu d'un
// accord le rejoue : la pédale est remise dans son état, et les notes tenues à cet
// instant sont rejouées, puis la suite part à son heure.

const START_DELAY_MS = 80;
const defaultNow = () => (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now());

/**
 * @param {{
 *   send: (type: 'noteOn'|'noteOff'|'sustain', a: number|boolean, b?: number) => void,
 *   onStep?: (step: number) => void,
 *   onPassing?: (after: number) => void, // accord de passage joué après l'accord `after`
 *   onEnd?: (reason: 'finished'|'stopped') => void,
 *   setTimer?: (fn: Function, ms: number) => any,
 *   clearTimer?: (id: any) => void,
 *   now?: () => number, // horloge en millisecondes (simulée dans les tests)
 * }} options
 */
export function createDemoPlayer({ send, onStep, onPassing, onEnd, setTimer = setTimeout, clearTimer = clearTimeout, now = defaultNow }) {
  let timers = [];
  const held = new Map(); // note → nombre d'appuis en cours
  let pedal = false;
  let playing = false; // ça sonne (pas en pause)
  let paused = false;
  let token = null;
  // La démo en cours : ses évènements dans l'ordre du temps, sa fin et son tempo.
  let demo = null;
  // Où en est la lecture : le temps (de la démo) au dernier départ, l'horloge à ce
  // départ, et le temps où elle s'est mise en pause.
  let fromBeat = 0;
  let startedAt = 0;
  let pausedAt = 0;

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
      case 'passing':
        onPassing?.(event.passing);
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

  function clearTimers() {
    timers.forEach((id) => clearTimer(id));
    timers = [];
  }

  /** Où en est la lecture, en temps de la démo. */
  function position() {
    if (!demo) return 0;
    if (paused) return pausedAt;
    if (!playing) return 0;
    return Math.min(demo.endBeat, fromBeat + Math.max(0, now() - startedAt) / demo.msPerBeat);
  }

  function finish() {
    clearTimers();
    releaseAll();
    playing = false;
    paused = false;
    token = null;
    demo = null;
    onEnd?.('finished');
  }

  /**
   * Joue la démo en cours à partir du temps `beat`. Ce qui s'est joué avant cet instant
   * donne son état : la pédale, les notes encore tenues (rejouées) et le dernier repère.
   */
  function startFrom(beat, delayMs) {
    clearTimers();
    releaseAll();
    const current = token;
    const { events, endBeat, msPerBeat } = demo;
    const at = Math.max(0, Math.min(Number(beat) || 0, endBeat));
    // Ce qui s'est joué avant. Un relâchement pile à l'instant de reprise en fait partie :
    // la note ne serait rejouée que pour être aussitôt relâchée.
    const before = (e) => e.time < at || (at > 0 && e.time === at && e.type === 'noteOff');
    let sustain = false;
    let lastStep = null;
    const down = new Map(); // note → { count, velocity }
    for (const e of events) {
      if (!before(e)) continue;
      if (e.type === 'sustain') sustain = Boolean(e.value);
      else if (e.type === 'step') lastStep = e;
      else if (e.type === 'noteOn') {
        const d = down.get(e.note) || { count: 0, velocity: e.velocity };
        d.count += 1;
        d.velocity = e.velocity;
        down.set(e.note, d);
      } else if (e.type === 'noteOff') {
        const d = down.get(e.note);
        if (d && --d.count <= 0) down.delete(e.note);
      }
    }
    fromBeat = at;
    startedAt = now() + delayMs;
    playing = true;
    paused = false;
    if (at > 0) {
      timers.push(setTimer(() => {
        if (token !== current) return;
        if (lastStep) fire(lastStep);
        if (sustain) fire({ type: 'sustain', value: true });
        // Une seule attaque par note tenue, même tenue deux fois.
        for (const [note, d] of down) {
          send('noteOn', note, d.velocity);
          held.set(note, d.count);
        }
      }, delayMs));
    }
    for (const e of events) {
      if (before(e)) continue;
      timers.push(setTimer(() => {
        if (token === current) fire(e);
      }, delayMs + (e.time - at) * msPerBeat));
    }
    timers.push(setTimer(() => {
      if (token === current) finish();
    }, delayMs + (endBeat - at) * msPerBeat + 250));
  }

  /**
   * Joue une démo ({events, beats}) au tempo donné (noires par minute). Une
   * démo en cours est arrêtée d'abord.
   * @returns {object} jeton de lecture (pour savoir si c'est toujours elle qui joue)
   */
  function play({ events, beats }, { tempo = 72 } = {}) {
    stop(false);
    const sorted = events.map((e, i) => ({ e, i })).sort((a, b) => a.e.time - b.e.time || a.i - b.i).map(({ e }) => e);
    const endBeat = sorted.reduce((max, e) => Math.max(max, e.time), Number(beats) || 0);
    demo = { events: sorted, endBeat, msPerBeat: 60000 / tempo };
    const current = {};
    token = current;
    startFrom(0, START_DELAY_MS);
    return current;
  }

  /** Pause : tout est relâché, pédale comprise ; la position est gardée. */
  function pause() {
    if (!playing || !demo) return false;
    pausedAt = position();
    clearTimers();
    releaseAll();
    playing = false;
    paused = true;
    return true;
  }

  /** Reprise là où la pause a laissé la lecture. */
  function resume() {
    if (!paused || !demo) return false;
    startFrom(pausedAt, 0);
    return true;
  }

  /** Va à un instant (en temps de la démo) : la lecture continue, ou la pause y reste. */
  function seek(beat) {
    if (!demo) return false;
    const at = Math.max(0, Math.min(Number(beat) || 0, demo.endBeat));
    if (paused) {
      pausedAt = at;
      return true;
    }
    if (!playing) return false;
    startFrom(at, 0);
    return true;
  }

  /** Arrête la démo : tout est relâché, pédale comprise. */
  function stop(notify = true) {
    const wasActive = playing || paused;
    clearTimers();
    token = null;
    playing = false;
    paused = false;
    demo = null;
    releaseAll();
    if (wasActive && notify) onEnd?.('stopped');
  }

  return {
    play,
    stop,
    pause,
    resume,
    seek,
    position,
    /** Durée de la démo, en temps. */
    duration: () => (demo ? demo.endBeat : 0),
    isPlaying: () => playing,
    isPaused: () => paused,
    /** Elle joue, ou elle est en pause. */
    isActive: () => playing || paused,
    isCurrent: (t) => t != null && t === token,
  };
}
