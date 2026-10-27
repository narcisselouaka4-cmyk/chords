import { getEffectiveChord } from '../chord-engine/chord-display.js';
import { harmonicTokens, markPassing, loopCandidates } from '../pedagogie/song-structure.js';

// Aligner le morceau sur des tours du motif, avec insertions, remplacements
// et étapes absentes. Cela distingue une boucle habillée d'un simple palmarès
// d'accords fréquents, et évite d'exiger deux tours consécutifs identiques.
function loopCost(tokens, pattern, idOf) {
  const durations = tokens.map((t) => t.dur).sort((a, b) => a - b);
  const typical = durations[Math.floor(durations.length / 2)] || 1;
  const columns = tokens.length + 2 * pattern.length;
  let previous = Float64Array.from({ length: columns + 1 }, (_, j) => Math.max(0, j - pattern.length + 1) * typical);
  for (const token of tokens) {
    const row = new Float64Array(columns + 1);
    row[0] = previous[0] + token.dur;
    const id = idOf(token);
    for (let j = 1; j <= columns; j++) {
      row[j] = Math.min(previous[j] + token.dur,
        row[j - 1] + typical,
        previous[j - 1] + (id === pattern[(j - 1) % pattern.length] ? 0 : Math.max(token.dur, typical) * 1.1));
    }
    previous = row;
  }
  return Math.min(...previous.slice(2 * pattern.length));
}

/** Résumé de lecture uniquement : ne réécrit ni les accords ni leurs temps. */
export function principalChords(chords = []) {
  const source = chords.filter((c) => c && Number.isFinite(c.startTime)
    && Number.isFinite(c.endTime) && c.endTime > c.startTime)
    .map((c) => ({ start: c.startTime, end: c.endTime, label: getEffectiveChord(c) }))
    .filter((c) => c.label && c.label !== 'N').sort((a, b) => a.start - b.start);
  const tokens = harmonicTokens(source);
  if (!tokens.length) return [];
  // Les silences ne donnent pas artificiellement du poids à l'accord précédent.
  tokens.forEach((t) => { t.dur = source.reduce((sum, c) => sum + Math.max(0, Math.min(t.end, c.end) - Math.max(t.start, c.start)), 0); });
  markPassing(tokens);
  const identity = (t) => `${t.rootPc}:${['major', 'dominant', 'sus', 'other'].includes(t.family) ? 'major' : t.family}`;
  const identities = [...new Set(tokens.map(identity))];
  const idOf = (t) => identities.indexOf(identity(t));
  if (identities.length === 1) return [tokens[0].name];
  const structural = tokens.filter((t) => !t.passing);
  const occurrences = new Map();
  tokens.forEach((t) => occurrences.set(idOf(t), (occurrences.get(idOf(t)) || 0) + 1));
  const counts = new Map();
  structural.forEach((t) => counts.set(idOf(t), (counts.get(idOf(t)) || 0) + 1));
  const recurrent = Math.max(2, Math.ceil(Math.max(0, ...counts.values()) / 2));
  // Chercher aussi dans les piliers récurrents : une substitution ponctuelle
  // ne doit pas casser tous les tours. Aucun accord absent n'est ajouté.
  const streams = [tokens, structural, structural.filter((t) => counts.get(idOf(t)) >= recurrent)];
  const total = tokens.reduce((sum, t) => sum + t.dur, 0);
  let best = null;
  for (const stream of streams) {
    for (const loop of loopCandidates(stream.map(idOf), stream.map((t) => t.dur), { maxPeriod: 16, minShare: 0.1 })) {
      // Un motif tolérant trop long peut absorber une variation unique : ce
      // n'est pas la preuve que cette variation porte la boucle du morceau.
      if (loop.pattern.some((id) => occurrences.get(id) < 2)) continue;
      const cost = loopCost(tokens, loop.pattern, idOf) / total;
      if (cost > 0.48) continue;
      const score = cost + loop.pattern.length * 0.012;
      if (!best || score < best.score) {
        best = { pattern: loop.pattern, score };
      }
    }
  }
  if (!best) return [];
  // Présenter le tour à partir du premier pilier rencontré, sans imposer la tonique.
  const first = tokens.find((t) => best.pattern.includes(idOf(t)));
  const anchor = best.pattern.indexOf(idOf(first));
  const pattern = [...best.pattern.slice(anchor), ...best.pattern.slice(0, anchor)];
  return pattern.map((id) => {
    const names = new Map();
    for (const t of tokens.filter((t) => idOf(t) === id)) {
      names.set(t.name, (names.get(t.name) || 0) + t.dur);
    }
    return [...names].sort((a, b) => b[1] - a[1])[0][0];
  });
}

/** Les tonalités livrées par le moteur deviennent des intervalles continus. */
export function buildHarmonicContexts(analysis = {}) {
  const duration = Math.max(0, Number(analysis.duration) || 0,
    ...(analysis.chords || []).map((c) => Number(c?.endTime) || 0));
  const fallback = { start: 0, key: analysis.key || null, mode: analysis.keyMode || null };
  const changes = (analysis.keys || []).filter((k) => k?.key && Number.isFinite(k.start)
    && k.start >= 0 && k.start < duration).map((k) => ({ ...k }))
    .sort((a, b) => a.start - b.start);
  const starts = [fallback];
  for (const change of changes) {
    const last = starts[starts.length - 1];
    if (change.start === last.start) starts[starts.length - 1] = change;
    else if (change.key !== last.key || change.mode !== last.mode) starts.push(change);
  }
  const colors = new Map();
  return starts.map((section, index) => {
    const end = starts[index + 1]?.start ?? duration;
    const colorKey = `${section.key}:${section.mode || ''}`;
    if (!colors.has(colorKey)) colors.set(colorKey, colors.size);
    const local = (analysis.chords || []).filter((c) => c && c.startTime < end && c.endTime > section.start)
      .map((c) => ({ ...c, startTime: Math.max(c.startTime, section.start), endTime: Math.min(c.endTime, end) }));
    return { start: section.start, end, key: section.key, mode: section.mode,
      color: colors.get(colorKey), chords: principalChords(local) };
  });
}

/** Même règle à la lecture, en pause et après un saut, dans les deux sens. */
export function harmonicContextAt(contexts, time = 0) {
  const seconds = Number.isFinite(time) ? Math.max(0, time) : 0;
  let low = 0;
  let high = contexts.length - 1;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (contexts[mid].start <= seconds) low = mid;
    else high = mid - 1;
  }
  return contexts[low] || null;
}
