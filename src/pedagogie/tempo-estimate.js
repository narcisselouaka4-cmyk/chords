// [Claude] — 2026-10-14 — Pédagogie IA : repérer le TEMPO (BPM) d'un tutoriel, pour le métronome.
//
// Narcisse : « un métronome… il faut repérer le BPM de la musique. Je ne sais pas si ce sera
// faisable. » Oui pour un BPM de départ : on le tire du SON de la vidéo, sans rien relancer. Le
// niveau sonore de la vidéo (dB toutes les 10 ms) est déjà mesuré à l'analyse (IPC
// pedagogie:loudness, utilisé pour la force des attaques). Les attaques de notes y dessinent des
// pics ; l'écart régulier entre ces pics, c'est le tempo.
//
// Méthode :
//   1. Force des attaques : la montée du niveau (dB) sur 30 ms, ramenée au-dessus de la moyenne
//      locale (on garde les vraies attaques, pas les variations lentes).
//   2. Autocorrélation de cette suite : un pic à l'écart « T » veut dire « quelque chose se répète
//      toutes les T secondes ». On additionne aussi les multiples de T (2 T, 4 T) : le vrai temps se
//      répète à chaque mesure, une subdivision (croches) non.
//   3. Un a priori doux sur la plage où les gens jouent (autour de 100 BPM) départage « 60 ou 120 ».
//   4. Affinage : peigne de battements, par pas de 0,1 BPM, qui donne aussi le PLACEMENT du premier
//      temps (la phase).
//   5. Confiance : combien le peigne est mieux rempli en tombant sur les attaques qu'à n'importe
//      quel autre placement. Faible = musique sans pulsation nette (un prof qui parle, du rubato) :
//      l'écran le dit, et le pianiste règle à l'oreille (tap, + / −).
//
// Module PUR, testé par test-tempo-estimate.js.

export const TEMPO_DEFAULTS = {
  minBpm: 50,
  maxBpm: 200,
  /** A priori : tempo « confortable » (BPM) et largeur (en octaves). */
  priorCenter: 100,
  priorSigma: 0.9,
  /** Il faut au moins ceci de son (s) pour oser une estimation. */
  minSeconds: 8,
};

const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

/** Valeur interpolée linéairement d'un tableau, hors bornes = 0. */
function at(arr, x) {
  if (x < 0 || x > arr.length - 1) return 0;
  const i = Math.floor(x);
  const f = x - i;
  return i + 1 < arr.length ? arr[i] * (1 - f) + arr[i + 1] * f : arr[i];
}

/**
 * Force des attaques : montée du niveau sonore, au-dessus de la moyenne locale.
 * @param {number[]} db - niveau (dB) à pas régulier
 * @param {number} hop - pas (s)
 * @returns {Float32Array}
 */
export function onsetStrength(db, hop) {
  const n = db.length;
  const floor = db.reduce((m, v) => (Number.isFinite(v) && v > m ? v : m), -Infinity) - 60;
  const lvl = new Float32Array(n);
  for (let i = 0; i < n; i += 1) lvl[i] = Number.isFinite(db[i]) ? Math.max(db[i], floor) : floor;
  const lag = Math.max(1, Math.round(0.03 / hop));
  const flux = new Float32Array(n);
  for (let i = lag; i < n; i += 1) flux[i] = Math.max(0, lvl[i] - lvl[i - lag]);
  // Moyenne locale (±0,5 s) retirée : seules les vraies attaques dépassent.
  const win = Math.max(2, Math.round(0.5 / hop));
  const prefix = new Float64Array(n + 1);
  for (let i = 0; i < n; i += 1) prefix[i + 1] = prefix[i] + flux[i];
  const out = new Float32Array(n);
  for (let i = 0; i < n; i += 1) {
    const a = Math.max(0, i - win);
    const b = Math.min(n, i + win + 1);
    const mean = (prefix[b] - prefix[a]) / (b - a);
    out[i] = Math.max(0, flux[i] - mean);
  }
  return out;
}

/**
 * Estime le tempo d'un son à partir de son niveau (dB).
 * @param {number[]} db
 * @param {number} hop - secondes entre deux valeurs (0,01 pour pedagogie:loudness)
 * @param {{ from?: number, to?: number, minBpm?: number, maxBpm?: number, priorCenter?: number, priorSigma?: number }} [options]
 *   from / to : ne regarder que cette plage de la vidéo (s).
 * @returns {{ bpm: number, confidence: number, firstBeat: number, candidates: {bpm: number, score: number}[] } | null}
 *   firstBeat : instant (s, dans la vidéo) d'un temps fort du peigne — le premier à partir de `from`.
 */
export function estimateTempo(db, hop = 0.01, options = {}) {
  const o = { ...TEMPO_DEFAULTS, ...options };
  if (!Array.isArray(db) && !(db instanceof Float32Array)) return null;
  const from = Math.max(0, Number(o.from) || 0);
  const i0 = Math.floor(from / hop);
  const i1 = Number.isFinite(o.to) ? Math.min(db.length, Math.ceil(o.to / hop)) : db.length;
  const slice = Array.from(db).slice(i0, i1);
  if (slice.length * hop < o.minSeconds) return null;

  const env = onsetStrength(slice, hop);
  const n = env.length;
  const total = env.reduce((s, v) => s + v, 0);
  if (!(total > 0)) return null;

  // 2. Autocorrélation, par retards (en pas) de la plage utile, élargie pour les multiples.
  const lagOf = (bpm) => 60 / (bpm * hop);
  const lMin = Math.floor(lagOf(o.maxBpm * 1.05));
  const lMax = Math.ceil(lagOf(o.minBpm / 1.05));
  const maxLag = Math.min(n - 2, lMax * 4 + 2);
  const acf = new Float64Array(maxLag + 2);
  for (let l = Math.max(1, lMin - 1); l <= maxLag; l += 1) {
    let s = 0;
    for (let i = 0; i + l < n; i += 1) s += env[i] * env[i + l];
    acf[l] = s / (n - l);
  }
  const acfAt = (lag) => (lag > maxLag ? 0 : at(acf, lag));

  // 3. Score de chaque tempo candidat : le retard et ses multiples, pondéré par l'a priori.
  const candidates = [];
  for (let bpm = o.minBpm; bpm <= o.maxBpm; bpm += 0.5) {
    const L = lagOf(bpm);
    const raw = acfAt(L) + 0.5 * acfAt(2 * L) + 0.25 * acfAt(4 * L);
    const prior = Math.exp(-0.5 * (Math.log2(bpm / o.priorCenter) / o.priorSigma) ** 2);
    candidates.push({ bpm, score: raw * (0.55 + 0.45 * prior) });
  }
  candidates.sort((a, b) => b.score - a.score);
  // Les meilleurs, un par « creux » (pas dix BPM voisins).
  const best = [];
  for (const c of candidates) {
    if (best.every((b) => Math.abs(b.bpm - c.bpm) > 4)) best.push(c);
    if (best.length >= 4) break;
  }
  if (!best.length || !(best[0].score > 0)) return null;

  // 4. Peigne de battements : le tempo exact (pas de 0,1) et la place du premier temps.
  const comb = (bpm) => {
    const period = 60 / bpm / hop;           // en pas
    const phases = Math.max(8, Math.round(period));
    let top = -Infinity;
    let topPhase = 0;
    let sum = 0;
    for (let p = 0; p < phases; p += 1) {
      const start = (p / phases) * period;
      let s = 0;
      let count = 0;
      for (let t = start; t < n; t += period) { s += at(env, t); count += 1; }
      s /= Math.max(1, count);
      sum += s;
      if (s > top) { top = s; topPhase = start; }
    }
    return { score: top, mean: sum / phases, phase: topPhase };
  };
  let refined = null;
  const center = best[0].bpm;
  for (let bpm = center - 3; bpm <= center + 3; bpm += 0.1) {
    const c = comb(bpm);
    if (!refined || c.score > refined.score) refined = { bpm, ...c };
  }
  const bpm = Math.round(refined.bpm * 10) / 10;

  // 5. Confiance : le peigne tombe-t-il sur les attaques bien mieux qu'ailleurs ?
  // [Calibré sur des enveloppes synthétiques : un bruit donne un rapport de 1,2 environ ; une
  // pulsation jouée à la main et bruitée, 5 ; une pulsation nette, plus de 1 000.] On mesure sur une
  // échelle logarithmique de 1,4 (rien) à 20 (sûr).
  const sorted = candidates.map((c) => c.score).sort((x, y) => x - y);
  const median = sorted[Math.floor(sorted.length / 2)] || 0;
  const strength = median > 0 ? best[0].score / median : 1000;
  const confidence = Math.round(clamp((Math.log10(Math.max(1, strength)) - 0.15) / 1.15, 0, 1) * 100) / 100;

  // Premier temps du peigne, dans la vidéo.
  const firstBeat = from + refined.phase * hop;
  return { bpm, confidence, firstBeat: Math.round(firstBeat * 1000) / 1000, candidates: best.map((b) => ({ bpm: b.bpm, score: b.score })) };
}

/** Mots pour l'écran : « sûr », « probable » ou « incertain ». */
export function tempoConfidenceLabel(confidence) {
  if (!(confidence > 0)) return 'incertain';
  if (confidence >= 0.6) return 'sûr';
  if (confidence >= 0.3) return 'probable';
  return 'incertain';
}
