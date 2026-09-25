// [Claude] — 2026-09-25 — Mémoire du jeu récent, pour « Qu'en penses-tu ? ».
//
// Narcisse : « avec une sorte de bouton, je lui demande si ce que je joue est
// bon ». Rien ne gardait les notes jouées hors d'un enregistrement de session.
// Cette mémoire tournante garde les 90 dernières secondes au format de
// l'enregistreur ({type: 'note_on'|'note_off'|'control', note, velocity,
// controller, value, channel, time}) ; main.js l'alimente au même endroit que
// l'enregistreur, jamais pendant une démo ni une relecture. Les notes sont à la
// hauteur ENTENDUE (transposition du clavier comprise), comme l'accord affiché.
//
// lastPassage() rend le passage qui suit la dernière pause : un silence d'au
// moins `pause` secondes (touches relâchées, pédale levée ; le double si la
// pédale reste enfoncée), borné aux `max` dernières secondes. Le passage est
// recalé à 0 et les notes (ou la pédale) encore tenues au moment du clic sont
// relâchées à cet instant.

const DEFAULT_KEEP = 90;

/**
 * @param {{keepSeconds?: number, now?: () => number}} [options] - now() en secondes
 */
export function createLiveTake({ keepSeconds = DEFAULT_KEEP, now = defaultNow } = {}) {
  let events = [];

  function trim(t) {
    const limit = t - keepSeconds;
    if (events.length && events[0].time < limit) {
      const first = events.findIndex((e) => e.time >= limit);
      events = first < 0 ? [] : events.slice(first);
    }
  }

  function push(event) {
    events.push(event);
    trim(event.time);
  }

  return {
    noteOn(note, velocity = 0.8, time = now()) {
      push({ type: 'note_on', note, velocity, channel: 0, time });
    },
    noteOff(note, time = now()) {
      push({ type: 'note_off', note, velocity: 0, channel: 0, time });
    },
    sustain(down, time = now()) {
      push({ type: 'control', controller: 64, value: down ? 127 : 0, channel: 0, time });
    },
    clear() {
      events = [];
    },
    /** Évènements gardés (copie), temps absolus. */
    events: () => events.slice(),
    /**
     * Dernier passage joué (voir l'en-tête), ou null si aucune note.
     * @param {{pause?: number, max?: number, at?: number}} [options]
     * @returns {{events: object[], duration: number, noteCount: number, startedAt: number, endedAt: number}|null}
     */
    lastPassage({ pause = 2.5, max = 60, at = now() } = {}) {
      return extractLastPassage(events, { pause, max, at });
    },
  };
}

/**
 * Mémoire de l'application (une seule) : main.js l'alimente, « Qu'en penses-tu ? »
 * (copilot-tab.js) la lit.
 */
export const liveTake = createLiveTake();

function defaultNow() {
  const perf = globalThis.performance;
  return (perf?.now ? perf.now() : Date.now()) / 1000;
}

/**
 * Passage qui suit la dernière pause (fonction pure, voir createLiveTake).
 * @param {object[]} all - évènements au format de l'enregistreur, temps croissants
 */
export function extractLastPassage(all, { pause = 2.5, max = 60, at = null } = {}) {
  const list = (all || []).filter((e) => Number.isFinite(e?.time)).sort((a, b) => a.time - b.time);
  if (!list.some((e) => e.type === 'note_on')) return null;
  const end = Number.isFinite(at) ? Math.max(at, list[list.length - 1].time) : list[list.length - 1].time;

  // Silences : instants où plus aucune touche n'est tenue, jusqu'à la note suivante.
  const held = new Set();
  let pedal = false;
  let silentSince = null;
  let silentPedal = false;
  let start = list.find((e) => e.type === 'note_on').time;
  for (const e of list) {
    if (e.type === 'note_on') {
      if (held.size === 0 && silentSince != null) {
        const gap = e.time - silentSince;
        // Pédale enfoncée pendant tout le silence : les notes sonnent encore, il faut plus long.
        if (gap >= (silentPedal ? pause * 2 : pause)) start = e.time;
      }
      held.add(e.note);
      silentSince = null;
    } else if (e.type === 'note_off') {
      held.delete(e.note);
      if (held.size === 0) {
        silentSince = e.time;
        silentPedal = pedal;
      }
    } else if (e.type === 'control' && e.controller === 64) {
      pedal = e.value >= 64;
      if (pedal && silentSince != null) silentPedal = true;
    }
  }
  // Plus de `max` secondes sans pause : les dernières secondes seulement,
  // à partir de la première attaque de la fenêtre.
  if (end - start > max) {
    start = list.find((e) => e.type === 'note_on' && e.time >= end - max)?.time ?? start;
  }

  // Pédale enfoncée au début du passage : on la garde (elle tient ce qu'on joue).
  let pedalAtStart = false;
  for (const e of list) {
    if (e.time >= start) break;
    if (e.type === 'control' && e.controller === 64) pedalAtStart = e.value >= 64;
  }
  const out = [];
  if (pedalAtStart) out.push({ type: 'control', controller: 64, value: 127, channel: 0, time: 0 });
  const open = new Set();
  let pedalDown = pedalAtStart;
  for (const e of list) {
    if (e.time < start) continue;
    if (e.type === 'note_off' && !open.has(e.note)) continue; // attaquée avant le passage
    const copy = { ...e, time: Math.max(0, e.time - start) };
    if (e.type === 'note_on') open.add(e.note);
    else if (e.type === 'note_off') open.delete(e.note);
    else if (e.type === 'control' && e.controller === 64) pedalDown = e.value >= 64;
    out.push(copy);
  }
  // Ce qui est encore tenu au moment du clic est relâché à cet instant.
  const close = Math.max(0, end - start);
  for (const note of open) out.push({ type: 'note_off', note, velocity: 0, channel: 0, time: close });
  if (pedalDown) out.push({ type: 'control', controller: 64, value: 0, channel: 0, time: close });
  const noteCount = out.filter((e) => e.type === 'note_on').length;
  return { events: out, duration: close, noteCount, startedAt: start, endedAt: end };
}
