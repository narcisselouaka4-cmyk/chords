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
//
// [Claude] — 2026-10-04 — Narcisse : « quand j'appuie sur pause pour observer un accord
// particulier, il faudrait que le jeu en bas se mette réellement en pause et fige
// l'affichage » ; « si je redescends avec le curseur […], il faudrait que le jeu en bas
// rembobine aussi », sans « cumul d'accords » ; et « un mode sans pédale ». En pause, le son
// s'arrête mais les touches de l'instant restent allumées (`show` / `hide` : la touche sans
// le son) ; aller à un autre instant montre les touches de cet instant, et seulement elles
// (calculées à cet instant, jamais accumulées). Sans la pédale (setPedal), chaque note
// s'arrête quand le doigt se lève.

const START_DELAY_MS = 80;
const defaultNow = () => (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now());

/**
 * [Claude] — 2026-10-04 — Ce qui sonne à l'instant `at` d'une démo (évènements triés par
 * temps) : les notes tenues (nombre d'appuis, force), celles que la pédale prolonge après
 * leur relâchement, la pédale et le dernier repère d'accord.
 * @param {object[]} events - évènements triés par temps
 * @param {number} at - l'instant, en temps de la démo
 * @param {{inclusive?: boolean}} [options] - inclusive : ce qui tombe pile à `at` compte (ce
 *   qu'on voit à cet instant) ; sinon seul un relâchement pile à `at` compte (une reprise :
 *   les attaques de cet instant partent à leur heure)
 * @returns {{held: Map<number, {count: number, velocity: number}>, sustained: Map<number, number>,
 *   pedal: boolean, lastStep: object|null}}
 */
export function stateAt(events, at, { inclusive = false } = {}) {
  const t = Number(at) || 0;
  const counts = inclusive ? (e) => e.time <= t : (e) => playedBefore(e, t);
  const held = new Map(); // note → { count, velocity }
  const sustained = new Map(); // note → force : relâchée, la pédale la fait encore sonner
  let pedal = false;
  let lastStep = null;
  for (const e of events || []) {
    if (e.time > t) break;
    if (!counts(e)) continue;
    if (e.type === 'sustain') {
      pedal = Boolean(e.value);
      if (!pedal) sustained.clear();
    } else if (e.type === 'step') lastStep = e;
    else if (e.type === 'noteOn') {
      const d = held.get(e.note) || { count: 0, velocity: e.velocity };
      d.count += 1;
      d.velocity = e.velocity;
      held.set(e.note, d);
      sustained.delete(e.note);
    } else if (e.type === 'noteOff') {
      const d = held.get(e.note);
      if (d && --d.count <= 0) {
        held.delete(e.note);
        if (pedal) sustained.set(e.note, d.velocity);
      }
    }
  }
  return { held, sustained, pedal, lastStep };
}

/**
 * Ce qui s'est joué avant une reprise à `at`. Un relâchement pile à cet instant en fait
 * partie : la note ne serait rejouée que pour être aussitôt relâchée.
 */
const playedBefore = (e, at) => e.time < at || (at > 0 && e.time === at && e.type === 'noteOff');

/** Les évènements sans la pédale. */
const withoutPedal = (events) => events.filter((e) => e.type !== 'sustain');

/**
 * @param {{
 *   send: (type: 'noteOn'|'noteOff'|'sustain'|'show'|'hide', a: number|boolean, b?: number) => void,
 *   onStep?: (step: number) => void,
 *   onPassing?: (after: number) => void, // accord de passage joué après l'accord `after`
 *   onEnd?: (reason: 'finished'|'stopped') => void,
 *   setTimer?: (fn: Function, ms: number) => any,
 *   clearTimer?: (id: any) => void,
 *   now?: () => number, // horloge en millisecondes (simulée dans les tests)
 * }} options - `show` / `hide` : allumer / éteindre une touche sans le son
 */
export function createDemoPlayer({ send, onStep, onPassing, onEnd, setTimer = setTimeout, clearTimer = clearTimeout, now = defaultNow }) {
  let timers = [];
  const held = new Map(); // note → nombre d'appuis en cours
  // [Claude] — 2026-10-04 — Touches allumées sans le son (en pause) : note → force.
  const shown = new Map();
  let pedal = false;
  let playing = false; // ça sonne (pas en pause)
  let paused = false;
  let token = null;
  // La démo en cours : ses évènements dans l'ordre du temps (`allEvents`, et `events` :
  // ceux qu'on joue, sans la pédale si on l'a enlevée), sa fin et son tempo.
  let demo = null;
  let withPedal = true;
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

  /**
   * [Claude] — 2026-10-04 — Montre, sans le son, les touches de l'instant `at` : celles qui
   * n'y sonnent plus s'éteignent, celles qui y sonnent s'allument. Rien ne s'accumule.
   */
  function showAt(at) {
    const { held: down, sustained } = stateAt(demo.events, at, { inclusive: true });
    const wanted = new Map(sustained);
    for (const [note, d] of down) wanted.set(note, d.velocity);
    for (const note of [...shown.keys()].sort((a, b) => a - b)) {
      if (wanted.has(note)) continue;
      send('hide', note);
      shown.delete(note);
    }
    for (const [note, velocity] of [...wanted].sort((a, b) => a[0] - b[0])) {
      if (shown.has(note)) continue;
      send('show', note, velocity);
      shown.set(note, velocity);
    }
  }

  /** Éteint les touches montrées sans le son. */
  function hideShown() {
    for (const note of [...shown.keys()].sort((a, b) => a - b)) send('hide', note);
    shown.clear();
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
    hideShown();
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
    hideShown();
    const current = token;
    const { events, endBeat, msPerBeat } = demo;
    const at = Math.max(0, Math.min(Number(beat) || 0, endBeat));
    const { held: down, sustained, pedal: sustain, lastStep } = stateAt(events, at);
    fromBeat = at;
    startedAt = now() + delayMs;
    playing = true;
    paused = false;
    const chase = () => {
      if (token !== current) return;
      if (lastStep) fire(lastStep);
      if (sustain) fire({ type: 'sustain', value: true });
      // [Claude] — 2026-10-04 — Les notes que la pédale prolongeait restent allumées (sans
      // être rejouées) jusqu'à la remontée de la pédale, comme pendant la lecture.
      for (const [note, velocity] of [...sustained].sort((a, b) => a[0] - b[0])) {
        send('show', note, velocity);
        send('hide', note);
      }
      // Une seule attaque par note tenue, même tenue deux fois.
      for (const [note, d] of down) {
        send('noteOn', note, d.velocity);
        held.set(note, d.count);
      }
    };
    // [Claude] — 2026-10-04 — Reprise (sans délai) : tout de suite, pour que les touches
    // figées ne s'éteignent pas une image avant de se rallumer.
    if (at > 0) {
      if (delayMs > 0) timers.push(setTimer(chase, delayMs));
      else chase();
    }
    for (const e of events) {
      if (playedBefore(e, at)) continue;
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
   * @param {{tempo?: number, pedal?: boolean}} [options] - pedal : false, sans la pédale
   * @returns {object} jeton de lecture (pour savoir si c'est toujours elle qui joue)
   */
  function play({ events, beats }, { tempo = 72, pedal: usePedal = true } = {}) {
    stop(false);
    withPedal = usePedal !== false;
    const sorted = events.map((e, i) => ({ e, i })).sort((a, b) => a.e.time - b.e.time || a.i - b.i).map(({ e }) => e);
    // La durée compte la pédale, même enlevée : le curseur garde la même longueur.
    const endBeat = sorted.reduce((max, e) => Math.max(max, e.time), Number(beats) || 0);
    demo = { allEvents: sorted, events: withPedal ? sorted : withoutPedal(sorted), endBeat, msPerBeat: 60000 / tempo };
    const current = {};
    token = current;
    startFrom(0, START_DELAY_MS);
    return current;
  }

  /**
   * Pause : le son s'arrête (tout est relâché, pédale comprise) ; la position est gardée, et
   * les touches de cet instant restent allumées.
   */
  function pause() {
    if (!playing || !demo) return false;
    pausedAt = position();
    clearTimers();
    releaseAll();
    playing = false;
    paused = true;
    showAt(pausedAt);
    return true;
  }

  /** Reprise là où la pause a laissé la lecture. */
  function resume() {
    if (!paused || !demo) return false;
    startFrom(pausedAt, 0);
    return true;
  }

  /**
   * Va à un instant (en temps de la démo) : la lecture continue, ou la pause y reste et le
   * clavier montre les touches de cet instant.
   */
  function seek(beat) {
    if (!demo) return false;
    const at = Math.max(0, Math.min(Number(beat) || 0, demo.endBeat));
    if (paused) {
      pausedAt = at;
      showAt(at);
      return true;
    }
    if (!playing) return false;
    startFrom(at, 0);
    return true;
  }

  /**
   * [Claude] — 2026-10-04 — Avec ou sans la pédale (Narcisse : « avec la pédale, il y a une
   * telle flopée de notes qu'on ne distingue pas bien le jeu du prof »). Sans elle, chaque
   * note s'arrête quand le doigt se lève. La lecture continue du même instant ; en pause, le
   * clavier montre ce qui sonne alors. (Chaque play() dit le sien, avec la pédale par défaut.)
   */
  function setPedal(on) {
    withPedal = on !== false;
    if (!demo) return false;
    demo.events = withPedal ? demo.allEvents : withoutPedal(demo.allEvents);
    if (playing) startFrom(position(), 0);
    else if (paused) showAt(pausedAt);
    return true;
  }

  /** Arrête la démo : tout est relâché, pédale comprise ; les touches figées s'éteignent. */
  function stop(notify = true) {
    const wasActive = playing || paused;
    clearTimers();
    token = null;
    playing = false;
    paused = false;
    demo = null;
    releaseAll();
    hideShown();
    if (wasActive && notify) onEnd?.('stopped');
  }

  return {
    play,
    stop,
    pause,
    resume,
    seek,
    setPedal,
    position,
    /** Durée de la démo, en temps. */
    duration: () => (demo ? demo.endBeat : 0),
    isPlaying: () => playing,
    isPaused: () => paused,
    /** Elle joue, ou elle est en pause. */
    isActive: () => playing || paused,
    isCurrent: (t) => t != null && t === token,
    /** [Claude] — 2026-10-04 — La pédale est jouée (true), ou enlevée. */
    pedal: () => withPedal,
    /** La démo en cours a une pédale (qu'on peut enlever). */
    hasPedal: () => Boolean(demo?.allEvents.some((e) => e.type === 'sustain')),
    /** La force d'une touche allumée sans le son (en pause), ou null. */
    shownVelocity: (note) => (shown.has(note) ? shown.get(note) : null),
  };
}
