// [Claude] — 2026-11-12 — Le jeu d'accompagnement gospel / worship du Copilote.
//
// Narcisse : « Copilote joue comme dans les démonstrations de l'exercice. Quand l'accompagnement est
// en mode posé, il joue comme ça, alors qu'un pianiste joue de différentes façons. Ce manque de
// diversité fait que l'accompagnement n'est pas top. » Mesuré : une progression gospel recevait
// toujours la même texture (accord tenu quatre temps, une note voisine au 3e temps, main gauche
// immobile), accord après accord.
//
// Ici, chaque mesure reçoit un geste de main gauche et un geste de main droite pris dans un
// vocabulaire de pianiste d'église, jamais deux fois de suite le même :
//   main gauche : octaves tenues, fondamentale–quinte–octave, coquille (fondamentale, quinte,
//                 septième : le voicing que joue Narcisse), relances, basse qui marche vers l'accord
//                 suivant ;
//   main droite : accord posé avec note voisine, contretemps, renversement qui monte, anticipation
//                 de l'accord suivant, retard 4–3 sur une dominante, broderie vers la tierce,
//                 réponse dans l'aigu, accord de passage diminué ;
//   fin         : montée finale, retombée arpégée ou accord large tenu.
// Le choix est tiré d'une graine : la même graine rejoue exactement la même phrase (l'exemple gardé
// dans la conversation ne change pas), une autre graine donne une autre façon de jouer.
// Les ACCORDS restent ceux demandés ; les voicings sont ceux de l'application, montés dans le
// registre de la main droite. Ce qui est ajouté (notes d'approche, retard, broderie, accord de
// passage) est nommé dans `gestures`, pour que la carte le dise.
//
// Ce module ne sert qu'au Copilote : les démonstrations de l'onglet Exercices ne changent pas.

import { demoHands, topNeighbour, finalRun } from '../practice-demo.js';

const LIFT = 0.05;
const TOP_LIMIT = 88;
const pcOf = (n) => ((n % 12) + 12) % 12;
const round = (t) => Math.round(t * 1000) / 1000;

/** Générateur déterministe (mulberry32) : même graine, même jeu. */
function rng(seed) {
  let a = (seed >>> 0) || 1;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function seedOf(names, variation = 0) {
  let h = 2166136261;
  for (const ch of names.join('|')) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  return (h >>> 0) + Math.imul(Math.round(Number(variation) || 0) + 1, 0x9E3779B1);
}

const isMinor = (chord) => /^m(?!aj)/.test(String(chord.symbol ?? ''));
const isDominant = (chord, tones) => tones.has(10) && tones.has(4) && !isMinor(chord);
const plainFifth = (chord) => !/b5|#5|b13|alt|aug|dim/.test(String(chord.symbol ?? ''));

/**
 * Mains de travail d'un accord : basse (fondamentale grave), main droite montée dans son registre.
 * [Claude] — 2026-11-13 — `voicing` : les notes d'un pianiste relevé dans un tutoriel
 * (tutorial-comping.js), gardées dans SON registre ; seule la basse descend d'une octave si elle
 * gênerait la main droite.
 */
function barHands(chord, voicing = null) {
  const hands = demoHands(chord, 'fifth');
  const tones = new Set([...hands.lh, ...hands.rh].map((n) => pcOf(n - chord.rootPc)));
  tones.add(0);
  if (voicing?.rh?.length >= 2 && Number.isFinite(voicing.root)) {
    const given = [...new Set(voicing.rh)].sort((a, b) => a - b);
    let low = voicing.root;
    if (low + 12 > given[0] - 3 && low - 12 >= 28) low -= 12;
    return { chord, rh: given, root: low, tones, top: given[given.length - 1], given: true };
  }
  let rh = [...hands.rh].sort((a, b) => a - b);
  // Les voicings de l'application sont écrits près du Do central ; la main droite d'un pianiste
  // d'église chante plus haut.
  while (rh.length && rh[rh.length - 1] < 66 && rh[rh.length - 1] + 12 <= 84) rh = rh.map((n) => n + 12);
  let root = 36 + pcOf(chord.rootPc);
  if (rh.length && root + 12 > rh[0] - 3) root = Math.max(28, root - 12);
  return { chord, rh, root, tones, top: rh.length ? rh[rh.length - 1] : null };
}

function createScore() {
  const events = [];
  const sounding = new Map();
  const score = {
    note(time, n, velocity, duration, hand) {
      if (!(duration > 0.04) || n < 21 || n > 108) return;
      const start = round(time);
      const key = `${hand}:${n}`;
      const open = sounding.get(key);
      // La même touche rejouée : la première est relâchée juste avant.
      if (open && open.off.time > start - 0.02) open.off.time = Math.max(open.on.time + 0.03, start - 0.02);
      const on = { time: start, type: 'noteOn', note: n, velocity: Math.min(1, Math.max(0.3, round(velocity))), hand };
      const off = { time: round(time + duration), type: 'noteOff', note: n, hand };
      events.push(on, off);
      sounding.set(key, { on, off });
    },
    chord(time, notes, velocity, release, { roll = 0, hand = 'rh', accentTop = 0 } = {}) {
      [...notes].sort((a, b) => a - b).forEach((n, k, all) => {
        const start = time + k * roll;
        score.note(start, n, velocity + (k === all.length - 1 ? accentTop : 0), release - start, hand);
      });
    },
    step(time, i) { events.push({ time: round(time), type: 'step', step: i }); },
    finish(beats) {
      const order = (e) => (e.type === 'noteOff' ? 0 : e.type === 'step' ? 1 : 2);
      events.sort((a, b) => a.time - b.time || order(a) - order(b));
      return { events, beats };
    },
  };
  return score;
}

// ── Main gauche ───────────────────────────────────────────────────────────

const LEFT = {
  octaves: {
    label: 'basse en octaves',
    play(score, bar, t, end, v) { score.chord(t, [bar.root, bar.root + 12], v, end, { roll: 0.02, hand: 'lh' }); },
  },
  quinte: {
    label: 'fondamentale, quinte, octave',
    fits: (bar) => plainFifth(bar.chord) && bar.root + 12 <= bar.rh[0] - 3,
    play(score, bar, t, end, v) {
      score.note(t, bar.root, v, end - t, 'lh');
      if (t + 1.5 < end) score.note(t + 1.5, bar.root + 7, v - 0.08, end - t - 1.5, 'lh');
      if (t + 2.5 < end) score.note(t + 2.5, bar.root + 12, v - 0.05, end - t - 2.5, 'lh');
    },
  },
  coquille: {
    label: 'coquille fondamentale–quinte–septième',
    fits: (bar) => plainFifth(bar.chord) && (bar.tones.has(10) || bar.tones.has(11)) && bar.root + 11 <= bar.rh[0] - 2 && bar.root >= 33,
    play(score, bar, t, end, v) {
      const seventh = bar.root + (bar.tones.has(10) ? 10 : 11);
      score.chord(t, [bar.root, bar.root + 7, seventh], v, end, { roll: 0.05, hand: 'lh' });
    },
  },
  relance: {
    label: 'basse relancée',
    play(score, bar, t, end, v) {
      score.chord(t, [bar.root, bar.root + 12], v, Math.min(end, t + 1.4), { roll: 0.02, hand: 'lh' });
      if (t + 1.5 < end) score.note(t + 1.5, bar.root + 12, v - 0.1, Math.min(0.9, end - t - 1.5), 'lh');
      if (t + 2.5 < end) score.note(t + 2.5, bar.root, v - 0.04, end - t - 2.5, 'lh');
    },
  },
};

/** Deux notes d'approche (4e temps) vers la basse de l'accord suivant, par demi-tons ou par ton. */
function walkTo(bar, next) {
  if (!next) return null;
  let target = next.root;
  while (target - bar.root > 6) target -= 12;
  while (bar.root - target > 6) target += 12;
  if (target === bar.root) return null;
  const up = target > bar.root;
  const notes = up ? [target - 2, target - 1] : [target + 2, target + 1];
  return notes.every((n) => n >= 28 && n <= 55 && n !== bar.root) ? { notes, target } : null;
}

// ── Main droite ───────────────────────────────────────────────────────────

/** Renversement suivant vers le haut : la note du bas passe à l'octave. */
const invertUp = (rh) => [...rh.slice(1), rh[0] + 12];

const RIGHT = {
  pose: {
    label: 'accord posé, voix du dessus mobile',
    play(score, bar, t, end, v, ctx) {
      const neighbour = ctx.next && end - t > 2.6 ? topNeighbour(bar.chord, [], bar.rh, ctx.next.top) : null;
      if (neighbour == null || bar.rh.length < 3) { score.chord(t + 0.04, bar.rh, v, end, { roll: 0.045, accentTop: 0.08 }); return; }
      score.chord(t + 0.04, bar.rh.slice(0, -1), v - 0.04, end, { roll: 0.045 });
      score.note(t + 0.04 + (bar.rh.length - 1) * 0.045, bar.top, v + 0.07, 2 - LIFT - 0.04 - (bar.rh.length - 1) * 0.045, 'rh');
      score.note(t + 2, neighbour, v + 0.02, end - t - 2, 'rh');
    },
  },
  contretemps: {
    label: 'contretemps',
    play(score, bar, t, end, v) {
      [[0, 1.4, 0], [1.5, 1.4, 0.06], [3, 0.9, -0.03]].forEach(([at, length, accent]) => {
        if (t + at + 0.2 < end) score.chord(t + at + 0.01, bar.rh, v + accent, Math.min(end, t + at + length), { roll: 0.015, accentTop: 0.06 });
      });
    },
  },
  renversement: {
    label: 'renversement qui monte',
    fits: (bar, end, t) => bar.rh.length >= 3 && bar.rh[0] + 12 <= TOP_LIMIT - 4 && end - t > 2.6,
    play(score, bar, t, end, v) {
      score.chord(t + 0.03, bar.rh, v, t + 2 - LIFT, { roll: 0.03, accentTop: 0.06 });
      score.chord(t + 2, invertUp(bar.rh), v + 0.04, end, { roll: 0.05, accentTop: 0.08 });
    },
  },
  retard: {
    label: 'retard 4–3',
    fits: (bar, end, t) => isDominant(bar.chord, bar.tones) && bar.rh.some((n) => pcOf(n - bar.chord.rootPc) === 4) && !bar.rh.some((n) => pcOf(n - bar.chord.rootPc) === 5) && end - t > 2.6,
    play(score, bar, t, end, v) {
      const third = bar.rh.find((n) => pcOf(n - bar.chord.rootPc) === 4);
      const others = bar.rh.filter((n) => n !== third);
      score.chord(t + 0.03, others, v, end, { roll: 0.04, accentTop: 0.06 });
      score.note(t + 0.05, third + 1, v + 0.03, 2 - LIFT - 0.05, 'rh');
      score.note(t + 2, third, v - 0.02, end - t - 2, 'rh');
    },
  },
  broderie: {
    label: 'broderie vers la tierce',
    fits: (bar) => {
      const third = bar.rh.find((n) => [3, 4].includes(pcOf(n - bar.chord.rootPc)));
      return third != null && !bar.rh.includes(third - 1);
    },
    play(score, bar, t, end, v) {
      const third = bar.rh.find((n) => [3, 4].includes(pcOf(n - bar.chord.rootPc)));
      score.note(t, third - 1, v - 0.06, 0.09, 'rh');
      score.chord(t + 0.1, bar.rh, v + 0.02, end, { roll: 0.02, accentTop: 0.07 });
    },
  },
  reponse: {
    label: 'réponse dans l’aigu',
    fits: (bar, end, t) => bar.rh.length >= 3 && bar.top + 9 <= TOP_LIMIT && end - t > 3.9,
    play(score, bar, t, end, v) {
      score.chord(t + 0.03, bar.rh, v, t + 2 - LIFT, { roll: 0.04, accentTop: 0.07 });
      // Trois notes de l'accord au-dessus du chant, puis retour : une réponse courte, en croches.
      const above = [];
      for (let n = bar.top + 1; n <= TOP_LIMIT && above.length < 3; n += 1) if (bar.rh.some((r) => pcOf(r) === pcOf(n))) above.push(n);
      const line = above.length === 3 ? [above[0], above[1], above[2], above[1]] : [...above, bar.top];
      line.forEach((n, k) => {
        const at = t + 2 + k * 0.5;
        if (at + 0.2 < end) score.note(at, n, v + 0.02 + k * 0.015, k === line.length - 1 ? end - at : Math.min(0.52, end - at), 'rh');
      });
    },
  },
};

/** Accord diminué de passage, un demi-ton sous la fondamentale de l'accord suivant. */
function passingDiminished(bar, next) {
  if (!next || !(isMinor(next.chord) || isDominant(next.chord, next.tones))) return null;
  if (pcOf(next.chord.rootPc - bar.chord.rootPc) === 1) return null; // déjà un demi-ton : rien à ajouter
  const base = pcOf(next.chord.rootPc - 1);
  const isTone = (n) => pcOf(n - base) % 3 === 0;
  let low = Math.max(bar.rh[0] - 2, 55);
  while (!isTone(low)) low += 1;
  const rh = [low, low + 3, low + 6, low + 9];
  if (rh[3] > TOP_LIMIT) return null;
  let bass = next.root - 1;
  if (bass < 28) bass += 12;
  if (bass > rh[0] - 3) return null;
  return { rh, bass, name: `${['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'][base]}dim7` };
}

// ── Fins ──────────────────────────────────────────────────────────────────

const ENDINGS = {
  montee: {
    label: 'montée finale',
    fits: (bar) => finalRun(bar.chord, bar.rh, [bar.root, bar.root + 12]).length >= 4,
    play(score, bar, t, v) {
      const run = finalRun(bar.chord, bar.rh, [bar.root, bar.root + 12]);
      const hold = t + 5;
      score.chord(t, [bar.root, bar.root + 12], v + 0.04, hold, { roll: 0.03, hand: 'lh' });
      score.chord(t + 0.06, bar.rh, v, t + 1.5 - LIFT, { roll: 0.07, accentTop: 0.08 });
      run.forEach((n, k) => {
        const at = t + 1.5 + k * 0.25;
        score.note(at, n, v - 0.06 + k * 0.025, k === run.length - 1 ? hold - at : 0.27, 'rh');
      });
      return hold + LIFT;
    },
  },
  retombee: {
    label: 'retombée arpégée',
    play(score, bar, t, v) {
      const hold = t + 5;
      score.chord(t, [bar.root, bar.root + 12], v + 0.02, hold, { roll: 0.03, hand: 'lh' });
      score.chord(t + 0.08, bar.rh, v, t + 2 - LIFT, { roll: 0.06, accentTop: 0.08 });
      [...bar.rh].reverse().forEach((n, k) => score.note(t + 2 + k * 0.45, n, v - 0.02 - k * 0.03, hold - t - 2 - k * 0.45, 'rh'));
      return hold + LIFT;
    },
  },
  large: {
    label: 'accord large tenu',
    play(score, bar, t, v) {
      const hold = t + 5;
      score.note(t, bar.root, v + 0.05, hold - t, 'lh');
      if (plainFifth(bar.chord)) score.note(t + 0.12, bar.root + 7, v - 0.03, hold - t - 0.12, 'lh');
      score.note(t + 0.24, bar.root + 12, v, hold - t - 0.24, 'lh');
      score.chord(t + 0.4, bar.rh, v + 0.02, hold, { roll: 0.11, accentTop: 0.1 });
      return hold + LIFT;
    },
  },
};

const pick = (random, list) => list[Math.floor(random() * list.length)];

/**
 * Joue une progression comme un pianiste gospel / worship.
 * @param {object[]} chords accords de l'application ({name, rootPc, symbol, voicing…})
 * @param {{seed?: number, feel?: 'gospel'|'worship', beatsPerChord?: number, overrides?: (object|null)[]}} [options]
 *   overrides[i] : ce qu'un pianiste relevé apporte à la mesure i —
 *     `voicing: {rh, root}` : ses notes, que le vocabulaire ci-dessus anime ;
 *     `play(score, t, v)`   : son passage entier, joué tel quel (aucun geste ajouté) ;
 *     `plan`                : ce que la carte en dit (source, moment de la vidéo).
 * @returns {{events: object[], beats: number, gestures: string[], bars: {name: string, left: string, right: string, extra?: string}[], hands: {lh: number[], rh: number[]}[]}|null}
 */
export function buildGospelComping(chords, { seed = 1, feel = 'gospel', beatsPerChord = 4, overrides = null } = {}) {
  const over = (i) => (Array.isArray(overrides) ? overrides[i] || null : null);
  const bars = (chords || []).map((chord, i) => barHands(chord, over(i)?.voicing || null));
  if (bars.length < 2 || bars.some((b) => b.rh.length < 2)) return null;
  const random = rng(seed);
  const score = createScore();
  const worship = feel === 'worship';
  const leftPool = worship ? ['octaves', 'quinte', 'relance'] : ['octaves', 'quinte', 'coquille', 'relance'];
  const rightPool = worship ? ['pose', 'contretemps', 'renversement', 'reponse'] : ['pose', 'contretemps', 'renversement', 'retard', 'broderie', 'reponse'];
  const plan = [];
  let end = bars.length * beatsPerChord;
  let prevLeft = null;
  let prevRight = null;
  let anticipated = false; // la main droite de cette mesure est déjà arrivée (poussée depuis la précédente)
  let passingLeft = Math.max(1, Math.round(bars.length / 4));
  const used = new Set();

  bars.forEach((bar, i) => {
    const t = i * beatsPerChord;
    const last = i === bars.length - 1;
    const next = bars[i + 1] || null;
    // Nuance : on part posé, on ouvre au milieu, on referme.
    const arc = bars.length > 2 ? Math.sin((Math.PI * i) / (bars.length - 1)) : 0.5;
    const v = 0.5 + arc * 0.1 + (random() - 0.5) * 0.03;
    score.step(t, i);

    if (last) {
      const options = Object.keys(ENDINGS).filter((k) => !ENDINGS[k].fits || ENDINGS[k].fits(bar));
      const ending = anticipated ? 'large' : pick(random, options);
      if (anticipated) {
        // L'accord final est déjà là (poussé) : la basse le rejoint, puis il est rejoué large.
        score.chord(t, [bar.root, bar.root + 12], v + 0.04, t + 5, { roll: 0.03, hand: 'lh' });
        score.chord(t + 2, bar.rh, v, t + 5, { roll: 0.1, accentTop: 0.09 });
        end = t + 5 + LIFT;
      } else end = ENDINGS[ending].play(score, bar, t, v);
      plan.push({ name: bar.chord.name, left: 'basse en octaves', right: ENDINGS[ending].label, ...(over(i)?.plan || {}) });
      used.add(ENDINGS[ending].label);
      return;
    }

    // Le passage d'un pianiste relevé, tel qu'il l'a joué : rien n'est ajouté par-dessus.
    if (over(i)?.play) {
      over(i).play(score, t, v);
      plan.push({ name: bar.chord.name, left: 'comme dans la vidéo', right: 'comme dans la vidéo', ...(over(i).plan || {}) });
      prevLeft = null;
      prevRight = null;
      anticipated = false;
      return;
    }

    // Ce qui occupe le 4e temps : un accord de passage, une anticipation, ou une basse qui marche.
    const passing = !worship && passingLeft > 0 && i > 0 && random() < 0.5 ? passingDiminished(bar, next) : null;
    const push = !passing && i > 0 && next && !over(i + 1)?.play && !(i + 1 === bars.length - 1 && random() < 0.5) && random() < (worship ? 0.45 : 0.35);
    const walk = !passing && random() < (worship ? 0.3 : 0.5) ? walkTo(bar, next) : null;
    const bodyEnd = t + (passing ? 3 : 4) - LIFT;
    const leftEnd = walk ? t + 3 - LIFT : bodyEnd;
    const rightEnd = passing ? bodyEnd : push ? t + 3.5 - LIFT : bodyEnd;

    // Main gauche.
    const leftOptions = leftPool.filter((k) => k !== prevLeft && (!LEFT[k].fits || LEFT[k].fits(bar)));
    const left = i === 0 ? (LEFT.coquille.fits(bar) && !worship && random() < 0.5 ? 'coquille' : 'octaves') : pick(random, leftOptions.length ? leftOptions : ['octaves']);
    LEFT[left].play(score, bar, t, leftEnd, v + 0.06);
    let leftLabel = LEFT[left].label;
    if (walk) {
      walk.notes.forEach((n, k) => score.note(t + 3 + k * 0.5, n, v + 0.02 + k * 0.03, 0.5 - LIFT, 'lh'));
      leftLabel += ', puis basse qui marche';
      used.add('basse qui marche');
    }
    used.add(LEFT[left].label);
    prevLeft = left;

    // Main droite.
    let rightLabel;
    if (anticipated) {
      // Déjà posée sur le « et » du 4 : elle répond en contretemps au lieu de réattaquer le 1er temps.
      [[1.5, 1.4, 0.04], [3, 0.9, -0.03]].forEach(([at, length, accent]) => {
        if (t + at + 0.2 < rightEnd) score.chord(t + at + 0.01, bar.rh, v + accent, Math.min(rightEnd, t + at + length), { roll: 0.015, accentTop: 0.06 });
      });
      rightLabel = 'accord arrivé en avance, puis contretemps';
      prevRight = 'contretemps';
    } else {
      const rightOptions = rightPool.filter((k) => k !== prevRight && (!RIGHT[k].fits || RIGHT[k].fits(bar, rightEnd, t)));
      const right = i === 0 ? pick(random, ['pose', 'broderie'].filter((k) => rightPool.includes(k) && (!RIGHT[k].fits || RIGHT[k].fits(bar, rightEnd, t)))) || 'pose'
        : pick(random, rightOptions.length ? rightOptions : ['pose']);
      RIGHT[right].play(score, bar, t, rightEnd, v, { next });
      rightLabel = RIGHT[right].label;
      used.add(rightLabel);
      prevRight = right;
    }
    anticipated = false;

    let extra;
    if (passing) {
      score.note(t + 3, passing.bass, v + 0.02, 1 - LIFT, 'lh');
      score.chord(t + 3.02, passing.rh, v - 0.02, t + 4 - LIFT, { roll: 0.03, accentTop: 0.05 });
      extra = `accord de passage ${passing.name}`;
      used.add('accord de passage diminué');
      passingLeft -= 1;
    } else if (push) {
      // Anticipation : l'accord suivant arrive sur le « et » du 4e temps et reste tenu.
      score.chord(t + 3.5, next.rh, v + 0.05, t + 4 + 1.4, { roll: 0.02, accentTop: 0.08 });
      extra = 'accord suivant anticipé';
      used.add('anticipation');
      anticipated = true;
    }
    plan.push({ name: bar.chord.name, left: leftLabel, right: rightLabel, ...(extra ? { extra } : {}), ...(over(i)?.plan || {}) });
  });

  const { events } = score.finish(end);
  return {
    events, beats: end, gestures: [...used], bars: plan,
    hands: bars.map((b, i) => over(i)?.hands || { lh: [b.root, b.root + 12], rh: b.rh }),
  };
}
