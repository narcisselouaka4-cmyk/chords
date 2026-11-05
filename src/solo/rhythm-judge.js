// [Claude] — 2026-11-05 — Juge rythmique du mode Solo : il ne regarde QUE le
// « quand ». Aucune hauteur n'entre ici, par choix pédagogique et non par
// simplification — c'est l'ordre qu'impose le professeur de la classe de salsa
// relevée le 05/11 : « Ne t'inquiète pas des gammes que j'utilise, des notes que
// je fais — concentre-toi sur le rythme » (09:02), parce que « la partie
// rythmique est ce qui différencie réellement la salsa des autres genres »
// (06:45). Le reste de l'application juge des hauteurs ; ce module est le seul
// endroit où une réponse est jugée sur le temps seul.
//
// Tout est exprimé en TEMPS musicaux (beats), jamais en secondes : le motif ne
// change pas quand on bouge le tempo. La tolérance, elle, est donnée en
// millisecondes — c'est ce que l'oreille perçoit — et convertie en temps avec
// le tempo courant. À 90 BPM, 90 ms valent 0,135 temps ; au double du tempo,
// la même tolérance devient deux fois plus serrée en fraction de temps, ce qui
// est exactement ce qu'on veut.

/** Tolérance par défaut : au-delà, un auditeur entend la frappe décalée. */
export const DEFAULT_TOLERANCE_MS = 90;
/** Fenêtre « serrée » : une frappe dedans est comptée comme bien placée. */
export const TIGHT_TOLERANCE_MS = 45;
/** Bornes du réglage de tolérance offert à l'utilisateur. */
export const MIN_TOLERANCE_MS = 30;
export const MAX_TOLERANCE_MS = 250;

const round = (n, p = 3) => Math.round(n * 10 ** p) / 10 ** p;

/** Temps musicaux correspondant à une durée en millisecondes, à ce tempo. */
export function msToBeats(ms, tempo) {
  const bpm = Number(tempo);
  if (!Number.isFinite(bpm) || bpm <= 0) return 0;
  return (Number(ms) || 0) / 1000 * (bpm / 60);
}

/** Durée en millisecondes d'un écart exprimé en temps musicaux. */
export function beatsToMs(beats, tempo) {
  const bpm = Number(tempo);
  if (!Number.isFinite(bpm) || bpm <= 0) return 0;
  return (Number(beats) || 0) * 60000 / bpm;
}

/**
 * Déroule un motif cyclique sur un intervalle de temps.
 * Un motif est une cellule (`beats`) et des positions dans cette cellule
 * (`positions`, en temps depuis son début). La cellule se répète ; on rend
 * toutes les frappes attendues entre `fromBeat` (inclus) et `toBeat` (exclu).
 * @param {{beats: number, positions: number[]}} pattern
 * @param {number} fromBeat
 * @param {number} toBeat
 * @returns {number[]} instants attendus, croissants
 */
export function expectedBeats(pattern, fromBeat, toBeat) {
  const cell = Number(pattern?.beats);
  const positions = Array.isArray(pattern?.positions) ? pattern.positions : [];
  if (!Number.isFinite(cell) || cell <= 0 || !positions.length) return [];
  if (!(toBeat > fromBeat)) return [];
  const out = [];
  // On part du cycle qui contient `fromBeat`, pas de zéro : un exercice peut
  // commencer au milieu du morceau (reprise après une pause).
  const firstCycle = Math.floor(fromBeat / cell);
  const lastCycle = Math.ceil(toBeat / cell);
  for (let c = firstCycle; c <= lastCycle; c += 1) {
    for (const p of positions) {
      const at = c * cell + Number(p);
      if (at >= fromBeat && at < toBeat) out.push(round(at));
    }
  }
  return out.sort((a, b) => a - b);
}

/**
 * Apparie les frappes jouées aux frappes attendues, chacune au plus une fois.
 *
 * L'appariement est glouton par distance croissante, et c'est volontaire : une
 * seule frappe ne doit jamais valider deux positions attendues. Sans ça, jouer
 * une note unique entre deux croches en validerait les deux, et l'exercice
 * mentirait. À distance égale, l'instant le plus tôt est servi d'abord, pour
 * que le résultat ne dépende pas de l'ordre d'arrivée.
 *
 * @param {number[]} expected - instants attendus (temps)
 * @param {number[]} played - instants joués (temps)
 * @param {number} window - demi-fenêtre d'acceptation (temps)
 * @returns {{pairs: Array<{expected: number, played: number, delta: number}>,
 *   missed: number[], extra: number[]}}
 */
export function pairHits(expected, played, window) {
  const candidates = [];
  expected.forEach((e, ei) => {
    played.forEach((p, pi) => {
      const delta = p - e;
      if (Math.abs(delta) <= window) candidates.push({ ei, pi, delta, dist: Math.abs(delta) });
    });
  });
  candidates.sort((a, b) => (a.dist - b.dist) || (a.ei - b.ei) || (a.pi - b.pi));
  const usedE = new Set();
  const usedP = new Set();
  const pairs = [];
  for (const c of candidates) {
    if (usedE.has(c.ei) || usedP.has(c.pi)) continue;
    usedE.add(c.ei);
    usedP.add(c.pi);
    pairs.push({ expected: expected[c.ei], played: played[c.pi], delta: round(c.delta) });
  }
  pairs.sort((a, b) => a.expected - b.expected);
  return {
    pairs,
    missed: expected.filter((_, i) => !usedE.has(i)),
    extra: played.filter((_, i) => !usedP.has(i)),
  };
}

/**
 * Regroupe des frappes simultanées en une seule.
 *
 * Indispensable ici : le professeur joue sa ligne DOUBLÉE À L'OCTAVE (mesuré le
 * 05/11 : un écart d'une octave dans 155 cas sur 170). Deux touches pour une
 * seule frappe musicale. Sans ce regroupement, chaque octave compterait comme
 * une frappe en trop et l'exercice punirait précisément ce qu'il enseigne.
 * @param {Array<{at: number}>} hits
 * @param {number} window - en deçà de cet écart, c'est la même frappe (temps)
 * @returns {Array<{at: number, notes: number[], count: number}>}
 */
export function groupSimultaneous(hits, window) {
  const sorted = [...(hits || [])]
    .filter((h) => Number.isFinite(h?.at))
    .sort((a, b) => a.at - b.at);
  const groups = [];
  for (const h of sorted) {
    const last = groups[groups.length - 1];
    if (last && h.at - last.at <= window) {
      last.notes.push(h.note);
      last.count += 1;
      continue;
    }
    groups.push({ at: h.at, notes: [h.note], count: 1 });
  }
  return groups;
}

/** Écart maximal entre deux touches comptées comme une seule frappe. */
export const SIMULTANEOUS_MS = 55;

/**
 * Juge le placement rythmique d'une série de frappes contre un motif.
 *
 * @param {object} options
 * @param {Array<{at: number, note?: number}>} options.hits - frappes jouées, en temps
 * @param {{beats: number, positions: number[]}} options.pattern
 * @param {number} options.fromBeat - début de la fenêtre jugée
 * @param {number} options.toBeat - fin de la fenêtre jugée
 * @param {number} options.tempo - BPM, pour convertir les tolérances
 * @param {number} [options.toleranceMs]
 * @returns {object} verdict détaillé, sans aucune hauteur
 */
export function judgeRhythm({
  hits = [], pattern, fromBeat = 0, toBeat = 0, tempo = 90,
  toleranceMs = DEFAULT_TOLERANCE_MS,
} = {}) {
  const window = msToBeats(toleranceMs, tempo);
  const tight = msToBeats(Math.min(toleranceMs, TIGHT_TOLERANCE_MS), tempo);
  const expected = expectedBeats(pattern, fromBeat, toBeat);
  const groups = groupSimultaneous(hits, msToBeats(SIMULTANEOUS_MS, tempo))
    .filter((g) => g.at >= fromBeat - window && g.at < toBeat + window);
  const { pairs, missed, extra } = pairHits(expected, groups.map((g) => g.at), window);

  const deltas = pairs.map((p) => p.delta);
  const mean = deltas.length ? deltas.reduce((a, b) => a + b, 0) / deltas.length : 0;
  const absMean = deltas.length
    ? deltas.reduce((a, b) => a + Math.abs(b), 0) / deltas.length : 0;
  const tightCount = deltas.filter((d) => Math.abs(d) <= tight).length;

  return {
    expectedCount: expected.length,
    playedCount: groups.length,
    matched: pairs.length,
    missed: missed.length,
    extra: extra.length,
    missedAt: missed,
    extraAt: extra,
    pairs,
    // Signé : négatif = joué en avance, positif = en retard. C'est le défaut
    // que l'oreille entend en premier, et un pianiste le corrige globalement.
    meanDeltaMs: round(beatsToMs(mean, tempo), 1),
    // Écart absolu moyen : la régularité, indépendamment d'un décalage d'ensemble.
    precisionMs: round(beatsToMs(absMean, tempo), 1),
    tight: tightCount,
    toleranceMs,
    tempo,
  };
}

/**
 * Phrase française du verdict rythmique. Elle ne félicite ni ne sanctionne :
 * elle dit ce qui a été mesuré, et le défaut dominant s'il y en a un.
 * Un doute illisible ne s'affiche pas — sans frappe attendue, pas de verdict.
 */
export function rhythmVerdict(result) {
  if (!result || !result.expectedCount) return '';
  const { matched, expectedCount, missed, extra, meanDeltaMs, precisionMs, tight } = result;
  const parts = [`${matched} frappe${matched > 1 ? 's' : ''} sur ${expectedCount} à sa place`];
  if (missed) parts.push(`${missed} manquée${missed > 1 ? 's' : ''}`);
  if (extra) parts.push(`${extra} en trop`);
  const phrase = `${parts.join(', ')}.`;
  if (!matched) return phrase;
  const sens = meanDeltaMs < 0 ? 'en avance' : 'en retard';
  const detail = Math.abs(meanDeltaMs) >= 20
    ? ` Tu joues ${Math.abs(Math.round(meanDeltaMs))} ms ${sens} en moyenne.`
    : ` Placement régulier : ${Math.round(precisionMs)} ms d'écart moyen.`;
  const net = tight === matched && matched > 1 ? ' Tout est dans la fenêtre serrée.' : '';
  return `${phrase}${detail}${net}`;
}
