import { getEffectiveChord, formatEffectiveChord } from '../chord-engine/chord-display.js';
import { harmonicTokens, markPassing, loopCandidates, respell, structureKey } from '../pedagogie/song-structure.js';
import { harmonicFamily, transposedRegions } from './transposed-progression.js';

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

function tokensFor(chords = []) {
  const source = chords.filter((c) => c && Number.isFinite(c.startTime)
    && Number.isFinite(c.endTime) && c.endTime > c.startTime)
    .map((c) => ({ start: c.startTime, end: c.endTime, label: getEffectiveChord(c) }))
    .filter((c) => c.label && c.label !== 'N').sort((a, b) => a.start - b.start);
  const tokens = harmonicTokens(source);
  // Les silences ne donnent pas artificiellement du poids à l'accord précédent.
  tokens.forEach((t) => { t.dur = source.reduce((sum, c) => sum + Math.max(0, Math.min(t.end, c.end) - Math.max(t.start, c.start)), 0); });
  markPassing(tokens);
  return tokens;
}

/** Résumé de lecture uniquement : ne réécrit ni les accords ni leurs temps. */
export function principalChords(chords = [], { sharedEvidence = false, key = null } = {}) {
  const tokens = tokensFor(chords);
  if (!tokens.length) return [];
  const identity = (t) => `${t.rootPc}:${harmonicFamily(t)}`;
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
    const candidates = loopCandidates(stream.map(idOf), stream.map((t) => t.dur), { maxPeriod: 16, minShare: 0.1 });
    // Deux tours n'ont pas besoin de se toucher : une variante, une transition
    // ou une modulation peut se trouver entre les occurrences d'une phrase.
    const seen = new Map();
    for (let size = 2; sharedEvidence && size <= Math.min(16, Math.floor(stream.length / 2)); size++) {
      for (let i = 0; i + size <= stream.length; i++) {
        const pattern = stream.slice(i, i + size).map(idOf);
        if (pattern[0] === pattern.at(-1)) continue;
        const key = pattern.join(',');
        const prior = seen.get(key);
        if (prior == null) seen.set(key, i);
        else if (i >= prior + size) candidates.push({ pattern });
      }
    }
    const tested = new Set();
    for (const loop of candidates) {
      const signature = loop.pattern.join(',');
      if (tested.has(signature)) continue;
      tested.add(signature);
      // Un motif tolérant trop long peut absorber une variation unique : ce
      // n'est pas la preuve que cette variation porte la boucle du morceau.
      if (loop.pattern.some((id) => occurrences.get(id) < 2)) continue;
      const cost = loopCost(tokens, loop.pattern, idOf) / total;
      if (cost > 0.48) continue;
      const score = cost + loop.pattern.length * (sharedEvidence ? 0.004 : 0.012);
      if (!best || score < best.score) {
        best = { pattern: loop.pattern, score };
      }
    }
  }
  if (!best) return [];
  // [Claude] — 2026-10-29 — Présenter le tour à partir de la TONIQUE quand elle fait
  // partie du motif. Narcisse, sur « Ma référence » : le bandeau affichait « D G C »
  // alors que sa boucle commence par G — le D venait d'une intro, et l'ancre tombait
  // sur le premier pilier rencontré dans le morceau. « Un pianiste aura tendance à
  // comprendre que les accords principaux sont dans l'ordre chronologique », et lit
  // donc une boucle qui démarre au mauvais endroit. Il a tranché : « on ancre sur le
  // début de la boucle, et on initialise ça pour tous les morceaux ». Il cite d'ailleurs
  // toujours ses boucles depuis la tonique — « sol, do, ré, do » ici, « La bémol, Mi
  // bémol, Si bémol mineur, Fa mineur » sur Sabaoth.
  // Sans tonalité exploitable, ou si elle ne figure pas dans le motif, on garde la règle
  // d'avant : le premier pilier rencontré.
  const tonicPc = key ? structureKey(key)?.rootPc : null;
  const tonicId = Number.isFinite(tonicPc)
    ? best.pattern.find((id) => tokens.some((t) => idOf(t) === id && t.rootPc === tonicPc))
    : undefined;
  const first = tokens.find((t) => best.pattern.includes(idOf(t)));
  const anchor = best.pattern.indexOf(tonicId !== undefined ? tonicId : idOf(first));
  const pattern = [...best.pattern.slice(anchor), ...best.pattern.slice(0, anchor)];
  // Le cycle complet sert à reconnaître la forme. Le bandeau ne montre que
  // ses piliers : quatre harmonies distinctes au maximum, sans répéter le I.
  // Choisir dans le motif établi écarte les variations qui n'en font pas partie.
  // [Claude] — 2026-10-29 — Départager par le NOMBRE DE TOURS, pas par la durée
  // cumulée. Narcisse, sur « Sabaoth » (Jonathan Gambela) : la boucle est
  //   Ab Eb Bbm Fm | Ab Eb C#
  // soit cinq harmonies pour quatre cases. Le C#, posé en fin de phrase, est tenu
  // 2,3 s en moyenne contre 1,5 s pour le Fm : il revient MOINS souvent (34 tours
  // contre 36) mais totalisait plus de temps (77 s contre 54 s), et chassait le Fm
  // du bandeau. Sa formulation : « on fonctionne du nombre de fois qu'une suite
  // d'accords apparaît ». Un accord tenu longtemps n'est pas plus structurant
  // qu'un accord qui revient à chaque tour.
  // Mesuré sur ses seize analyses : seul « Sabaoth » change, et il devient juste.
  // La durée reste le départage secondaire, à nombre de tours égal.
  const unique = [...new Set(pattern)];
  const support = new Map(unique.map((id) => [id, { tours: 0, dur: 0 }]));
  tokens.forEach((t) => {
    const entry = support.get(idOf(t));
    if (entry) { entry.tours += 1; entry.dur += t.dur; }
  });
  const pillars = new Set([...unique]
    .sort((a, b) => support.get(b).tours - support.get(a).tours
      || support.get(b).dur - support.get(a).dur)
    .slice(0, 4));
  // Conserver l'ordre de première apparition dans le motif, pas l'ordre du classement.
  return unique.filter((id) => pillars.has(id)).map((id) => {
    const names = new Map();
    for (const t of tokens.filter((t) => idOf(t) === id)) {
      names.set(t.name, (names.get(t.name) || 0) + t.dur);
    }
    return [...names].sort((a, b) => b[1] - a[1])[0][0];
  });
}

/** Motifs transposés étayés par les accords ; sinon régions livrées par le moteur. */
export function buildHarmonicContexts(analysis = {}) {
  const duration = Math.max(0, Number(analysis.duration) || 0,
    ...(analysis.chords || []).map((c) => Number(c?.endTime) || 0));
  const transposed = transposedRegions(tokensFor(analysis.chords || []), analysis);
  if (transposed) {
    const names = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
    // Mettre les tours dans un même cadre de degrés pour réunir leurs preuves.
    const normalized = transposed.flatMap((r) => r.tokens.map((t) => ({
      startTime: t.start, endTime: t.start + t.dur,
      chord: formatEffectiveChord((t.rootPc - r.rootPc + 12) % 12, t.quality, null),
    })));
    // Les accords sont normalisés en degrés : la tonique y est le degré 0, donc « C ».
    const pattern = tokensFor(principalChords(normalized, { sharedEvidence: true, key: 'C' }).map((chord, i) => ({ chord, startTime: i, endTime: i + 1 })));
    if (pattern.length) {
      const colors = new Map();
      return transposed.map((r, i) => {
        const key = `${names[r.rootPc]}${r.minor ? 'm' : ''}`;
        if (!colors.has(key)) colors.set(key, colors.size);
        const spelling = structureKey(key);
        const chords = pattern.map((pillar) => {
          const root = (pillar.rootPc + r.rootPc) % 12;
          // Afficher le symbole réellement relevé localement, jamais un accord
          // absent de la région extrapolé depuis une autre tonalité.
          const matches = r.tokens.filter((t) => t.rootPc === root && harmonicFamily(t) === harmonicFamily(pillar));
          if (!matches.length) return null;
          const labels = new Map();
          matches.forEach((t) => labels.set(t.name, (labels.get(t.name) || 0) + t.dur));
          const label = [...labels].sort((a, b) => b[1] - a[1])[0][0];
          return respell(label, spelling);
        });
        return { start: r.start, end: transposed[i + 1]?.start ?? duration, key,
          mode: r.minor ? 'minor' : 'major', color: colors.get(key),
          chords: chords.every(Boolean) ? chords : principalChords((analysis.chords || []).filter((c) => c.startTime >= r.start && c.startTime < r.end), { key }),
          basis: 'transposed-progression' };
      });
    }
  }
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
      color: colors.get(colorKey), chords: principalChords(local, { key: section.key }) };
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
