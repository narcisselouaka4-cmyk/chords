// [Claude] — 2026-10-14 — Le métronome (Pédagogie IA).
//
// Narcisse : « un métronome… ça pourrait aider l'utilisateur au niveau du tempo : savoir à quel moment
// et ce qu'il doit jouer ». Deux façons de s'en servir :
//   - LIBRE : un clic régulier au tempo réglé, comme un métronome ordinaire ;
//   - AVEC LA VIDÉO : les clics tombent sur les temps DE LA VIDÉO (le « 1 » est placé une fois sur un
//     temps fort), et seulement quand la vidéo joue — pause, saut, vitesse 0,5× : le métronome suit.
//     Le pianiste entend sa grille de temps par-dessus le prof.
//
// Partie pure (planification des clics, testée par test-metronome.js) + un moteur Web Audio
// (planification en avance sur l'horloge audio : précis à la milliseconde, insensible aux à-coups
// de la page).

/** Nombre de temps par mesure proposés. */
export const BEATS_PER_BAR = [2, 3, 4, 6];

const mod = (a, n) => ((a % n) + n) % n;

/** Force d'un temps dans la mesure : le 1 fort, le 4 d'une mesure à 6 moyen, les autres faibles. */
export function beatKind(beatInBar, beatsPerBar) {
  if (beatInBar === 0) return 'strong';
  if (beatsPerBar === 6 && beatInBar === 3) return 'medium';
  return 'weak';
}

/**
 * Les temps qui tombent dans une fenêtre de temps (secondes de la vidéo).
 * Le temps d'indice k tombe à `offset + k × 60 / bpm` ; k = 0 est le « 1 » d'une mesure (négatif avant).
 * @returns {{ index: number, time: number, beatInBar: number, kind: 'strong'|'medium'|'weak' }[]}
 */
export function beatsInWindow({ from, to, offset = 0, bpm, beatsPerBar = 4 }) {
  if (!(bpm > 0) || !(to > from)) return [];
  const period = 60 / bpm;
  const first = Math.ceil((from - offset) / period - 1e-9);
  const out = [];
  for (let k = first; offset + k * period < to - 1e-9; k += 1) {
    const beatInBar = mod(k, beatsPerBar);
    out.push({ index: k, time: offset + k * period, beatInBar, kind: beatKind(beatInBar, beatsPerBar) });
  }
  return out;
}

/**
 * Quels clics lancer maintenant, quand la vidéo joue ? (appelé toutes les ~25 ms)
 * @param {object} s
 * @param {number} s.videoTime - position de la vidéo (s)
 * @param {number} s.rate - vitesse de lecture (1 = normale)
 * @param {number} s.horizon - on planifie les clics des `horizon` prochaines secondes (réelles)
 * @param {number|null} s.lastIndex - dernier temps déjà planifié (null : aucun)
 * @param {number} s.offset
 * @param {number} s.bpm
 * @param {number} s.beatsPerBar
 * @returns {{ clicks: { index: number, delay: number, beatInBar: number, kind: string }[], lastIndex: number|null }}
 *   delay : dans combien de secondes RÉELLES le clic doit sonner (la vitesse est déjà prise en compte).
 */
export function planFollowClicks({ videoTime, rate = 1, horizon = 0.12, lastIndex = null, offset = 0, bpm, beatsPerBar = 4 }) {
  const r = rate > 0 ? rate : 1;
  const beats = beatsInWindow({ from: videoTime, to: videoTime + horizon * r, offset, bpm, beatsPerBar });
  const clicks = [];
  let last = lastIndex;
  for (const b of beats) {
    if (last != null && b.index <= last) continue;
    clicks.push({ index: b.index, delay: Math.max(0, (b.time - videoTime) / r), beatInBar: b.beatInBar, kind: b.kind });
    last = b.index;
  }
  return { clicks, lastIndex: last };
}

/** Un saut de la vidéo (curseur, clic sur un accord) ou un arrêt : les temps déjà planifiés ne valent plus. */
export function isSeek({ videoTime, expectedTime, tolerance = 0.25 }) {
  return !Number.isFinite(expectedTime) || Math.abs(videoTime - expectedTime) > tolerance;
}

/** Fréquence et force du clic selon le temps : le « 1 » plus aigu et plus net. */
export const CLICK_SOUND = {
  strong: { freq: 1568, gain: 1 },
  medium: { freq: 1175, gain: 0.8 },
  weak: { freq: 880, gain: 0.65 },
};

/**
 * Le moteur. `getContext` rend l'AudioContext de l'application ; `getVideo` la vidéo suivie.
 * @param {{ getContext: () => AudioContext, getVideo?: () => HTMLVideoElement|null, onBeat?: (b: {beatInBar: number, kind: string, time: number}) => void }} deps
 */
export function createMetronome({ getContext, getVideo = () => null, onBeat = () => {} }) {
  const state = { bpm: 100, beatsPerBar: 4, offset: 0, follow: false, volume: 0.7, running: false };
  let timer = null;
  let master = null;
  // Mode libre
  let nextTime = 0;
  let freeBeat = 0;
  // Mode vidéo
  let lastIndex = null;
  let lastVideoTime = null;
  let lastClock = null;

  const ctx = () => getContext();
  const output = () => {
    const c = ctx();
    if (!master || master.context !== c) {
      master = c.createGain();
      master.connect(c.destination);
    }
    master.gain.value = state.volume;
    return master;
  };

  function click(when, kind, beatInBar) {
    const c = ctx();
    const spec = CLICK_SOUND[kind] || CLICK_SOUND.weak;
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(spec.freq, when);
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(spec.gain, when + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, when + 0.06);
    osc.connect(g).connect(output());
    osc.start(when);
    osc.stop(when + 0.08);
    // Le voyant s'allume au moment où le clic sonne.
    const delay = Math.max(0, (when - c.currentTime) * 1000);
    setTimeout(() => { if (state.running) onBeat({ beatInBar, kind, time: when }); }, delay);
  }

  function tick() {
    if (!state.running) return;
    const c = ctx();
    const now = c.currentTime;
    const video = state.follow ? getVideo() : null;
    if (state.follow) {
      if (!video || video.paused || video.ended) { lastIndex = null; lastVideoTime = null; return; }
      const vt = video.currentTime;
      const rate = video.playbackRate || 1;
      // Saut ? Alors on repart de zéro : les temps déjà planifiés ne comptent plus.
      if (lastVideoTime != null) {
        const expected = lastVideoTime + (now - lastClock) * rate;
        if (isSeek({ videoTime: vt, expectedTime: expected })) lastIndex = null;
      }
      lastVideoTime = vt;
      lastClock = now;
      const plan = planFollowClicks({ videoTime: vt, rate, lastIndex, offset: state.offset, bpm: state.bpm, beatsPerBar: state.beatsPerBar });
      lastIndex = plan.lastIndex;
      for (const k of plan.clicks) click(now + k.delay, k.kind, k.beatInBar);
      return;
    }
    // Libre : on planifie en avance, à l'heure de l'horloge audio.
    while (nextTime < now + 0.12) {
      const beatInBar = mod(freeBeat, state.beatsPerBar);
      click(Math.max(nextTime, now), beatKind(beatInBar, state.beatsPerBar), beatInBar);
      nextTime += 60 / state.bpm;
      freeBeat += 1;
    }
  }

  return {
    state,
    async start() {
      if (state.running) return;
      const c = ctx();
      try { if (c.state === 'suspended') await c.resume(); } catch { /* sera repris au prochain geste */ }
      state.running = true;
      nextTime = c.currentTime + 0.06;
      freeBeat = 0;
      lastIndex = null;
      lastVideoTime = null;
      timer = setInterval(tick, 25);
      tick();
    },
    stop() {
      state.running = false;
      clearInterval(timer);
      timer = null;
      lastIndex = null;
      lastVideoTime = null;
    },
    isRunning: () => state.running,
    set(patch) {
      const changedMode = patch.follow != null && patch.follow !== state.follow;
      Object.assign(state, patch);
      if (patch.volume != null && master) master.gain.value = state.volume;
      if (changedMode) { lastIndex = null; lastVideoTime = null; if (ctx()) nextTime = ctx().currentTime + 0.06; freeBeat = 0; }
    },
  };
}
