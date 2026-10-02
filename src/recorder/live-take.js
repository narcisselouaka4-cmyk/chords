// [Claude] — 2026-09-25 — Le jeu du pianiste, pour « Qu'en penses-tu ? ».
//
// [Claude] — 2026-09-26 — Démarrer / Stop. Narcisse : « j'ai raté une mélodie,
// j'ai recommencé juste après et je l'ai réussie ; « Qu'en penses-tu ? » a pris à
// la fois la mélodie ratée et la mélodie réussie ». Le passage était « ce qui suit
// la dernière pause de 2,5 s » : un essai repris aussitôt s'y ajoutait. Désormais
// le pianiste dit lui-même où commence et où finit ce qu'il fait écouter : un clic
// pour que le Copilote écoute (startCapture), un clic pour arrêter (stopCapture) ;
// seul ce qui est joué entre les deux est gardé.
//
// Format de l'enregistreur ({type: 'note_on'|'note_off'|'control', note, velocity,
// controller, value, channel, time}) ; main.js l'alimente au même endroit que
// l'enregistreur, jamais pendant une démo ni une relecture. Les notes sont à la
// hauteur ENTENDUE (transposition du clavier comprise), la touche enfoncée à côté
// (`raw`) quand elle diffère.
// Au clic de départ, la pédale déjà enfoncée est gardée (elle tient ce qu'on va
// jouer) ; une touche enfoncée avant le clic ne compte pas. À l'arrêt, les notes et
// la pédale encore tenues sont relâchées. Les temps partent de la première note.

// Garde-fou mémoire (le Copilote arrête l'écoute bien avant : 5 minutes).
const MAX_EVENTS = 20000;

/**
 * @param {{now?: () => number}} [options] - now() en secondes
 */
export function createLiveTake({ now = defaultNow } = {}) {
  let capture = null; // {start, events, open: Map(note → touche brute)}
  let pedal = false; // suivie même sans écoute : enfoncée avant le clic, elle compte

  const withRaw = (note, raw) => (raw !== note && Number.isFinite(raw) ? { raw } : {});
  function push(event) {
    if (capture.events.length < MAX_EVENTS) capture.events.push(event);
  }

  return {
    noteOn(note, velocity = 0.8, time = now(), raw = note) {
      if (!capture) return;
      capture.open.set(note, raw);
      push({ type: 'note_on', note, velocity, channel: 0, time, ...withRaw(note, raw) });
    },
    noteOff(note, time = now(), raw = note) {
      // Touche enfoncée avant le clic : son relâché ne compte pas non plus.
      if (!capture || !capture.open.has(note)) return;
      capture.open.delete(note);
      push({ type: 'note_off', note, velocity: 0, channel: 0, time, ...withRaw(note, raw) });
    },
    sustain(down, time = now()) {
      pedal = Boolean(down);
      if (capture) push({ type: 'control', controller: 64, value: down ? 127 : 0, channel: 0, time });
    },
    /** Clic de départ : le Copilote écoute. */
    startCapture(at = now()) {
      capture = { start: at, events: [], open: new Map(), pedalAtStart: pedal };
    },
    isCapturing: () => Boolean(capture),
    /**
     * Clic d'arrêt : ce qui a été joué depuis le départ, ou null si aucune note.
     * @returns {{events: object[], duration: number, noteCount: number}|null}
     */
    stopCapture(at = now()) {
      if (!capture) return null;
      const { events, open, pedalAtStart } = capture;
      capture = null;
      const firstOn = events.find((e) => e.type === 'note_on');
      if (!firstOn) return null;
      const t0 = firstOn.time;
      const close = Math.max(0, at - t0);
      const out = [];
      if (pedalAtStart) out.push({ type: 'control', controller: 64, value: 127, channel: 0, time: 0 });
      for (const e of events) out.push({ ...e, time: Math.min(close, Math.max(0, e.time - t0)) });
      // Ce qui est encore tenu au clic d'arrêt est relâché à cet instant.
      for (const [note, raw] of open) out.push({ type: 'note_off', note, velocity: 0, channel: 0, time: close, ...withRaw(note, raw) });
      let down = false;
      for (const e of out) if (e.type === 'control' && e.controller === 64) down = e.value >= 64;
      if (down) out.push({ type: 'control', controller: 64, value: 0, channel: 0, time: close });
      const noteCount = out.filter((e) => e.type === 'note_on').length;
      return { events: out, duration: close, noteCount };
    },
    clear() {
      capture = null;
    },
  };
}

/**
 * Le jeu de l'application (un seul) : main.js l'alimente, « Qu'en penses-tu ? »
 * (copilot-tab.js) démarre et arrête l'écoute.
 */
export const liveTake = createLiveTake();

function defaultNow() {
  const perf = globalThis.performance;
  return (perf?.now ? perf.now() : Date.now()) / 1000;
}
