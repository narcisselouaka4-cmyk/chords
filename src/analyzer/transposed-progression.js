import { structureKey } from '../pedagogie/song-structure.js';

export const harmonicFamily = (token) => ['major', 'dominant', 'sus', 'other'].includes(token.family) ? 'major' : token.family;
const pc = (value) => (value % 12 + 12) % 12;
const MAJOR = { 0: 'major', 2: 'minor', 4: 'minor', 5: 'major', 7: 'major', 9: 'minor', 11: 'halfdim' };
const MINOR = { 0: 'minor', 2: 'halfdim', 3: 'major', 5: 'minor', 7: 'minor', 8: 'major', 10: 'major' };
const KEYS = Array.from({ length: 24 }, (_, i) => ({ rootPc: i % 12, minor: i >= 12 }));

function fit(token, key) {
  const degree = pc(token.rootPc - key.rootPc);
  const expected = (key.minor ? MINOR : MAJOR)[degree];
  const matches = expected === harmonicFamily(token);
  return (matches ? 1 : expected ? 0.25 : 0)
    + (degree === 0 && matches ? 0.15 : 0)
    + (key.minor && degree === 7 && token.family === 'dominant' ? 0.8 : 0);
}

function score(tokens, key) {
  return tokens.reduce((sum, token) => sum + fit(token, key) * token.dur, 0);
}

// Des phrases de trois à cinq accords, avec au moins trois fondamentales.
// La signature est relative à la tonique : une transposition garde ses degrés
// ET ses familles. Un seul accord étranger n'est jamais cette preuve.
function phrases(region) {
  const found = new Map();
  const tokens = region.tokens.filter((token) => !token.passing);
  for (let size = 3; size <= 5; size++) {
    for (let i = 0; i + size <= tokens.length; i++) {
      const phrase = tokens.slice(i, i + size);
      if (new Set(phrase.map((t) => t.rootPc)).size < 3) continue;
      const signature = phrase.map((t) => `${pc(t.rootPc - region.rootPc)}:${harmonicFamily(t)}`).join('|');
      if (!found.has(signature)) found.set(signature, []);
      found.get(signature).push(...phrase);
    }
  }
  return found;
}

function sharesProgression(left, right) {
  if (left.minor !== right.minor) return false;
  const before = phrases(left);
  const after = phrases(right);
  const evidence = new Set();
  for (const [signature, tokens] of after) {
    if (before.has(signature)) tokens.forEach((t) => evidence.add(t));
  }
  const covered = [...evidence].reduce((sum, t) => sum + t.dur, 0);
  const duration = right.tokens.reduce((sum, t) => sum + t.dur, 0);
  return evidence.size >= 4 && covered >= Math.max(6, duration * 0.3);
}

/**
 * Une segmentation proposée par les accords, acceptée seulement si les régions
 * partagent effectivement des phrases transposées. Ne change jamais analysis.keys.
 */
export function transposedRegions(tokens, analysis = {}) {
  if (tokens.length < 10) return null;
  const n = tokens.length;
  const durs = tokens.map((t) => t.dur).sort((a, b) => a - b);
  const changeCost = Math.max(6, durs[n >> 1] * 5);
  const durations = new Float64Array(n + 1);
  const sums = KEYS.map(() => new Float64Array(n + 1));
  for (let i = 0; i < n; i++) {
    durations[i + 1] = durations[i] + tokens[i].dur;
    KEYS.forEach((key, k) => { sums[k][i + 1] = sums[k][i] + fit(tokens[i], key) * tokens[i].dur; });
  }
  const best = new Float64Array(n + 1).fill(-Infinity);
  const previous = [];
  best[0] = 0;
  // Pénaliser chaque changement et exiger un passage établi empêche de suivre
  // chaque dominante secondaire ou chaque aller-retour entre I et IV.
  for (let end = 1; end <= n; end++) {
    for (let start = 0; start + 5 <= end; start++) {
      if (!Number.isFinite(best[start]) || durations[end] - durations[start] < 10) continue;
      for (let k = 0; k < KEYS.length; k++) {
        const value = best[start] + sums[k][end] - sums[k][start] - changeCost;
        if (value > best[end]) {
          best[end] = value;
          previous[end] = { start, k };
        }
      }
    }
  }
  if (!previous[n]) return null;
  const regions = [];
  for (let end = n; end > 0;) {
    const { start, k } = previous[end];
    regions.unshift({ ...KEYS[k], start: tokens[start].start, end: tokens[end - 1].end, tokens: tokens.slice(start, end) });
    end = start;
  }
  const merged = [];
  for (const region of regions) {
    const last = merged.at(-1);
    if (last && last.rootPc === region.rootPc && last.minor === region.minor) {
      last.end = region.end;
      last.tokens.push(...region.tokens);
    } else merged.push(region);
  }
  if (merged.length < 2 || merged.some((r) => score(r.tokens, r) < r.tokens.reduce((sum, t) => sum + t.dur, 0) * 0.8)) return null;
  // Une harmonie commune (le V de l'ancienne gamme et le IV de la nouvelle,
  // par exemple) n'avance pas à elle seule la frontière d'une modulation.
  for (let i = 1; i < merged.length; i++) {
    const left = merged[i - 1];
    const right = merged[i];
    while (right.tokens.length > 5 && Math.abs(fit(right.tokens[0], right) - fit(right.tokens[0], left)) < 0.05) {
      left.tokens.push(right.tokens.shift());
      right.start = right.tokens[0].start;
      left.end = right.start;
    }
  }
  // Une ambiguïté relative ne doit pas remplacer une tonalité connue et compatible
  // (Ré / Mi / Fa#m en La majeur). Garder le même cadre pour tous les décalages.
  const text = analysis.key ? `${analysis.key}${analysis.keyMode === 'minor' && !/m$/.test(analysis.key) ? 'm' : ''}` : null;
  const given = text ? structureKey(text) : null;
  if (given && !given.guessed && score(merged[0].tokens, given) >= score(merged[0].tokens, merged[0]) * 0.94) {
    const shift = given.rootPc - merged[0].rootPc;
    merged.forEach((r) => { r.rootPc = pc(r.rootPc + shift); r.minor = given.minor; });
  }
  for (let i = 1; i < merged.length; i++) {
    if (!sharesProgression(merged[i - 1], merged[i])) return null;
  }
  merged[0].start = 0;
  return merged;
}
