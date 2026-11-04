// [Claude] — 2026-11-04 — Boucle de batterie des démonstrations (Narcisse :
// « chaque style aura sa boucle de batterie […] une sorte de métronome »).
//
// Elle ne passe PAS par les événements de la démo : ceux-ci décrivent deux
// mains de piano et sont vérifiés comme tels (mains 'lh'/'rh', notes 28–96).
// La batterie est donc un accompagnement séparé, calé sur l'horloge de
// l'AudioContext — comme le métronome — pour rester régulière là où la lecture
// des notes, elle, passe par des minuteurs.
//
// Aucun échantillon : la CSP d'Electron interdit de charger un fichier, et le
// reste de l'application synthétise déjà son son. Chaque percussion est donc
// construite avec des oscillateurs et du bruit.

/** Une mesure de 4 temps ; les positions sont en temps depuis le début de la boucle. */
const BAR = 4;

/**
 * Motifs par style. `bars` = longueur de la boucle en mesures de 4 temps,
 * `hits` = [position en temps, voix, nuance].
 *
 * Les motifs latins suivent ce que les sources documentent déjà pour les
 * études : clave son 3-2 (0 / 1,5 / 3 puis 5 / 6), cinquillo (0 / 1 / 1,5 /
 * 2,5 / 3), tresillo (0 / 1,5 / 3). Voir les notes du coffre.
 */
export const DRUM_PATTERNS = {
  // Métronome simple : le style « Accords seuls » ne demande rien de plus.
  plaque: { bars: 1, hits: [[0, 'click', 0.9], [1, 'click', 0.5], [2, 'click', 0.6], [3, 'click', 0.5]] },
  gospel: {
    bars: 1,
    hits: [[0, 'kick', 0.9], [1, 'snare', 0.7], [2.5, 'kick', 0.6], [3, 'snare', 0.75],
      ...[0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5].map((t) => [t, 'hat', 0.28])],
  },
  ballade: {
    bars: 1,
    hits: [[1, 'rim', 0.5], [3, 'rim', 0.5], [0, 'shaker', 0.2], [2, 'shaker', 0.2]],
  },
  swing: {
    bars: 1,
    // Ride swingué : 1, 2, le « et » swingué du 2, 3, 4, le « et » swingué du 4.
    hits: [[0, 'ride', 0.5], [1, 'ride', 0.6], [1 + 2 / 3, 'ride', 0.4],
      [2, 'ride', 0.5], [3, 'ride', 0.6], [3 + 2 / 3, 'ride', 0.4],
      [1, 'hat', 0.45], [3, 'hat', 0.45]],
  },
  // Salsa : clave son 3-2 sur deux mesures, congas et shaker à contretemps.
  montuno: {
    bars: 2,
    hits: [
      [0, 'clave', 0.75], [1.5, 'clave', 0.7], [3, 'clave', 0.7],
      [5, 'clave', 0.75], [6, 'clave', 0.7],
      [2, 'conga', 0.5], [3.5, 'congaOpen', 0.6], [6, 'conga', 0.5], [7.5, 'congaOpen', 0.6],
      ...[0.5, 1.5, 2.5, 3.5, 4.5, 5.5, 6.5, 7.5].map((t) => [t, 'shaker', 0.22]),
    ],
  },
  // Danzón / habanera / guajira : le cinquillo au bloc de bois, basse sur 1 et 3.
  cinquillo: {
    bars: 1,
    hits: [[0, 'clave', 0.6], [1, 'clave', 0.5], [1.5, 'clave', 0.55], [2.5, 'clave', 0.5], [3, 'clave', 0.6],
      [0, 'kick', 0.55], [2, 'kick', 0.45], ...[0.5, 1.5, 2.5, 3.5].map((t) => [t, 'shaker', 0.2])],
  },
  tresillo: {
    bars: 1,
    hits: [[0, 'clave', 0.65], [1.5, 'clave', 0.6], [3, 'clave', 0.6],
      [0, 'kick', 0.55], [2, 'kick', 0.4], ...[0.5, 1.5, 2.5, 3.5].map((t) => [t, 'shaker', 0.2])],
  },
  // Merengue : vite, à deux temps. La boucle tient en une mesure de 4 temps
  // (deux mesures de 2/4), güira en doubles croches et tambora sur les levées.
  merengue: {
    bars: 1,
    hits: [[0, 'kick', 0.8], [1, 'kick', 0.6], [2, 'kick', 0.8], [3, 'kick', 0.6],
      [1.5, 'tom', 0.6], [1.75, 'tom', 0.45], [3.5, 'tom', 0.6], [3.75, 'tom', 0.45],
      ...Array.from({ length: 16 }, (_, k) => [k * 0.25, 'shaker', k % 2 ? 0.14 : 0.24])],
  },
};

/**
 * Motif d'un style de démo ou d'un genre d'étude. Les études latines portent
 * leur genre dans `style` (salsa, danzon…) ; les démos libres portent
 * l'identifiant du style (gospel, swing…).
 */
export function drumPatternFor(name) {
  const key = {
    salsa: 'montuno', 'latin-jazz': 'montuno', montuno: 'montuno',
    danzon: 'cinquillo', habanera: 'tresillo', guajira: 'tresillo',
    merengue: 'merengue', jazz: 'swing', worship: 'gospel',
  }[name] || name;
  return DRUM_PATTERNS[key] || null;
}

/** Bruit court et réutilisable, pour les peaux et les cymbales. */
function noiseBuffer(ctx) {
  const length = Math.floor(ctx.sampleRate * 0.4);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
  return buffer;
}

/**
 * Une percussion. `gain` est la nuance (0–1) ; `when` l'instant AudioContext.
 * Rien n'est tenu : chaque voix s'éteint seule et se débranche.
 */
function hit(ctx, out, noise, voice, when, gain) {
  const g = ctx.createGain();
  g.connect(out);
  const tone = (type, from, to, dur, peak) => {
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(from, when);
    if (to !== from) osc.frequency.exponentialRampToValueAtTime(to, when + dur);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, when);
    env.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), when + 0.003);
    env.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    osc.connect(env).connect(g);
    osc.start(when);
    osc.stop(when + dur + 0.02);
  };
  const hiss = (hz, dur, peak, type = 'highpass', q = 0.7) => {
    const src = ctx.createBufferSource();
    src.buffer = noise;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = hz;
    filter.Q.value = q;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, when);
    env.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), when + 0.002);
    env.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    src.connect(filter).connect(env).connect(g);
    src.start(when);
    src.stop(when + dur + 0.02);
  };
  switch (voice) {
    case 'kick': tone('sine', 120, 45, 0.22, gain * 0.9); break;
    case 'snare': hiss(1800, 0.16, gain * 0.5); tone('triangle', 220, 160, 0.09, gain * 0.3); break;
    case 'rim': tone('square', 1700, 1500, 0.035, gain * 0.22); break;
    case 'hat': hiss(8000, 0.045, gain * 0.3); break;
    case 'ride': hiss(6500, 0.22, gain * 0.18); break;
    case 'shaker': hiss(7000, 0.05, gain * 0.3); break;
    case 'clave': tone('triangle', 2400, 2300, 0.055, gain * 0.5); break;
    case 'conga': tone('sine', 310, 250, 0.16, gain * 0.5); hiss(500, 0.05, gain * 0.15, 'bandpass', 2); break;
    case 'congaOpen': tone('sine', 480, 400, 0.2, gain * 0.5); hiss(900, 0.06, gain * 0.18, 'bandpass', 2); break;
    case 'tom': tone('sine', 220, 150, 0.14, gain * 0.55); break;
    case 'click': default: tone('triangle', gain > 0.7 ? 1600 : 1100, gain > 0.7 ? 1600 : 1100, 0.05, gain * 0.35);
  }
  setTimeout(() => { try { g.disconnect(); } catch (e) { /* déjà parti */ } }, (when - ctx.currentTime + 1) * 1000);
}

const LOOKAHEAD = 0.25;   // on programme un quart de seconde à l'avance
const TICK = 60;          // et on réveille le planificateur toutes les 60 ms

/**
 * Boucle de batterie. `getContext` rend l'AudioContext partagé, `getOutput`
 * le nœud où se brancher (la sortie du synthé, pour passer par son ambiance).
 */
export function createDrumLoop({ getContext, getOutput = null, setTimer = setInterval, clearTimer = clearInterval }) {
  let timer = null;
  let master = null;
  let noise = null;
  let pattern = null;
  let secondsPerBeat = 0.5;
  let startedAt = 0;   // instant AudioContext du temps 0 de la boucle
  let nextBeat = 0;    // prochain temps (dans la boucle) à programmer
  let volume = 0.55;

  function output() {
    const ctx = getContext();
    if (!master || master.context !== ctx) {
      master = ctx.createGain();
      const target = getOutput?.();
      master.connect(target && target.context === ctx ? target : ctx.destination);
      noise = noiseBuffer(ctx);
    }
    master.gain.value = volume;
    return master;
  }

  function schedule() {
    if (!pattern) return;
    const ctx = getContext();
    const out = output();
    const loopBeats = pattern.bars * BAR;
    const horizon = ctx.currentTime + LOOKAHEAD;
    // On avance temps par temps ; chaque tour place les frappes qui tombent
    // dans ce temps-là, c'est-à-dire sur [beatInLoop, beatInLoop + 1[.
    while (startedAt + nextBeat * secondsPerBeat < horizon) {
      const beatInLoop = ((nextBeat % loopBeats) + loopBeats) % loopBeats;
      for (const [at, voice, gain] of pattern.hits) {
        if (at < beatInLoop || at >= beatInLoop + 1) continue;
        const when = startedAt + (nextBeat + (at - beatInLoop)) * secondsPerBeat;
        if (when >= ctx.currentTime) hit(ctx, out, noise, voice, when, gain);
      }
      nextBeat += 1;
    }
  }

  return {
    /**
     * Démarre la boucle. `fromBeat` = position de la démo au départ, pour que
     * la boucle reste en phase après un saut ou une reprise.
     */
    start({ tempo = 100, patternName = null, rate = 1, fromBeat = 0, delay = 0 } = {}) {
      const found = patternName && typeof patternName === 'object' ? patternName : drumPatternFor(patternName);
      if (!found) { this.stop(); return false; }
      const ctx = getContext();
      pattern = found;
      secondsPerBeat = 60 / (Math.max(20, tempo) * (rate || 1));
      startedAt = ctx.currentTime + Math.max(0, delay) - fromBeat * secondsPerBeat;
      nextBeat = Math.max(0, Math.floor(fromBeat));
      if (timer) clearTimer(timer);
      schedule();
      timer = setTimer(schedule, TICK);
      return true;
    },
    stop() {
      if (timer) clearTimer(timer);
      timer = null;
      pattern = null;
    },
    isRunning: () => Boolean(timer),
    /** Nuance de la batterie (0 = muette). */
    setVolume(value) {
      volume = Math.max(0, Math.min(1, Number(value) || 0));
      if (master) master.gain.value = volume;
    },
    volume: () => volume,
  };
}
