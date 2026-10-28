// Projection d'affichage : aucune mutation des segments, du tempo ou des exports.
import { getEffectiveChord } from '../chord-engine/chord-display.js';

export function normalizeGridSettings(value = {}, meter = '4/4') {
  if (!value || typeof value !== 'object') value = {};
  const [numerator, denominator] = String(meter).split('/').map(Number);
  const beatsPerBar = [2, 3, 4, 5, 6, 7, 9, 12].includes(Number(value.beatsPerBar))
    ? Number(value.beatsPerBar) : ([2, 3, 4, 5, 6, 7, 9, 12].includes(numerator) ? numerator : 4);
  return {
    beatsPerBar,
    tempoOverride: Number(value.tempoOverride) >= 20 && Number(value.tempoOverride) <= 400 ? Number(value.tempoOverride) : null,
    downbeatSeconds: value.downbeatSeconds != null && Number.isFinite(Number(value.downbeatSeconds)) && Number(value.downbeatSeconds) >= 0 ? Number(value.downbeatSeconds) : null,
    beatUnit: [4, 8].includes(Number(value.beatUnit)) ? Number(value.beatUnit) : (denominator === 8 ? 8 : 4),
    tempoMultiplier: [0.5, 1, 2].includes(Number(value.tempoMultiplier)) ? Number(value.tempoMultiplier) : 1,
    offsetSeconds: Number.isFinite(Number(value.offsetSeconds)) ? Math.max(-10, Math.min(10, Number(value.offsetSeconds))) : 0,
    phase: Math.max(0, Math.min(beatsPerBar - 1, Math.round(Number(value.phase) || 0))),
  };
}

export function validBeatTimes(times, duration) {
  return Array.isArray(times) && times.length >= 3 && times.length < 100000
    && times.every((t, i) => Number.isFinite(t) && t >= 0 && t <= duration && (!i || t - times[i - 1] >= 0.08));
}

export function beatAtTime(boundaries, time) {
  if (boundaries.length < 2 || !Number.isFinite(time)) return -1;
  if (time < boundaries[0] || time >= boundaries.at(-1)) return -1;
  let lo = 0, hi = boundaries.length - 1;
  while (lo + 1 < hi) { const mid = (lo + hi) >> 1; if (boundaries[mid] <= time) lo = mid; else hi = mid; }
  return lo;
}

function nearest(times, time) {
  if (time <= times[0]) return 0;
  const i = beatAtTime(times, time);
  if (i < 0) return times.length - 1;
  return time - times[i] < times[i + 1] - time ? i : i + 1;
}

export function effectiveGridTempo(analysis, settings, rhythm = null) {
  return settings?.tempoOverride || (Number(rhythm?.tempo) > 0 ? Number(rhythm.tempo) : null)
    || (Number(analysis?.tempo) > 0 ? Number(analysis.tempo) : 120);
}

function medianPeriod(times, tail = false) {
  const excerpt = tail ? times.slice(-9) : times.slice(0, 9);
  const periods = excerpt.slice(1).map((t, i) => t - excerpt[i]).sort((a, b) => a - b);
  return periods[Math.floor(periods.length / 2)];
}

// [Claude] — 2026-10-28 — Les barres de mesure se posent sur les PREMIERS TEMPS détectés
// plutôt que tous les `beatsPerBar` temps. Une grille régulière glisse dès qu'un morceau
// a une mesure irrégulière — une reprise, un break — et tous les accords suivants tombent
// à côté, ce que Narcisse voyait. Mesuré sur quatre de ses morceaux, à nombre de barres
// comparable, part des changements d'accord tombant sur une barre : 48→80 %, 70→98 %,
// 70→76 %, 81→77 %. Trois gagnent, dont deux de trente points ; un perd quatre points.
//
// Deux garde-fous, sinon l'affichage devient bancal : un repère qui créerait une mesure
// de moins de trois quarts de mesure est ignoré, et un trou de plus d'une mesure et demie
// est comblé au pas régulier. Retourne null dès qu'un réglage manuel est en jeu : le
// pianiste garde la main.
function barStartsFrom(downbeats, times, settings, estimated) {
  if (estimated || !downbeats.length || settings.downbeatSeconds != null
    || settings.phase || settings.offsetSeconds || settings.tempoMultiplier !== 1) return null;
  const pas = settings.beatsPerBar;
  const reperes = [...new Set(downbeats.map((t) => nearest(times, t)))].sort((a, b) => a - b);
  const starts = [0];
  for (const repere of reperes) {
    // Au tout début, une mesure courte est une levée : on la garde telle quelle.
    if (starts.length === 1 && repere > 0 && repere < pas) { starts.push(repere); continue; }
    if (repere - starts.at(-1) < pas * 0.75) continue;
    while (repere - starts.at(-1) >= pas * 1.75) starts.push(starts.at(-1) + pas);
    starts.push(repere);
  }
  while (starts.at(-1) + pas < times.length - 1) starts.push(starts.at(-1) + pas);
  return starts;
}

function pulseBoundaries(analysis, settings, rhythm) {
  const duration = Math.max(0, Number(analysis.duration) || 0);
  const tempo = effectiveGridTempo(analysis, settings, rhythm);
  const supplied = settings.tempoOverride != null
    ? (Math.abs(rhythm?.sourceTempo - settings.tempoOverride) < 0.1 ? rhythm.beatTimes : null)
    : (rhythm?.beatTimes ?? analysis.beatTimes);
  const estimated = !validBeatTimes(supplied, duration);
  let times = estimated ? Array.from({ length: Math.ceil(duration * tempo / 60) + 1 }, (_, i) => i * 60 / tempo) : [...supplied];
  if (settings.tempoMultiplier === 0.5) times = times.filter((_, i) => i % 2 === 0);
  if (settings.tempoMultiplier === 2) times = times.flatMap((t, i) => i + 1 < times.length ? [t, (t + times[i + 1]) / 2] : [t]);
  // Conserver l'identité de la pulsation qui ouvre une mesure, même quand on
  // extrapole avant le premier temps ou qu'un réglage traverse le début du fichier.
  let anchor = settings.phase;
  let shift = settings.offsetSeconds;
  // [Claude] — 2026-10-28 — Premier temps de mesure détecté (beat-this) : il place la
  // barre de mesure au lieu de la laisser tomber où elle veut. `phase` reste une
  // correction relative à ce repère, et un repère posé à la main garde la priorité.
  const detecte = Array.isArray(rhythm?.downbeatTimes) ? rhythm.downbeatTimes : [];
  if (settings.downbeatSeconds == null && detecte.length && !estimated) {
    // Le vote de tous les repères, pas le premier seul : sur « You are Yahweh », le
    // premier repère plaçait 30 % des accords sur un début de mesure, le vote 70 %.
    const votes = new Array(settings.beatsPerBar).fill(0);
    for (const t of detecte) votes[nearest(times, t) % settings.beatsPerBar]++;
    anchor = votes.indexOf(Math.max(...votes)) + settings.phase;
  }
  if (settings.downbeatSeconds != null && settings.downbeatSeconds <= duration) {
    anchor = nearest(times, settings.downbeatSeconds);
    shift += settings.downbeatSeconds - times[anchor];
  }
  times = times.map((t) => t + shift);
  const firstPeriod = medianPeriod(times) || 60 / tempo / settings.tempoMultiplier;
  const lastPeriod = medianPeriod(times, true) || firstPeriod;
  while (times[0] > 1e-6) { times.unshift(times[0] - firstPeriod); anchor++; }
  while (times.at(-1) < duration) times.push(times.at(-1) + lastPeriod);
  let first = 0;
  while (first + 1 < times.length && times[first + 1] <= 1e-6) first++;
  anchor -= first;
  times = times.slice(first).filter((t) => t < duration);
  // Le bord à zéro tronque un temps déjà présent. Il n'ajoute PAS de pulsation.
  if (!times.length) times.push(0); else times[0] = 0;
  times.push(duration);
  const pickupBeats = ((anchor % settings.beatsPerBar) + settings.beatsPerBar) % settings.beatsPerBar;
  return { times, estimated, tempo: tempo * settings.tempoMultiplier, pickupBeats,
    barStarts: barStartsFrom(detecte, times, settings, estimated) };
}

function dominant(weights, candidates, start, end) {
  const totals = new Map();
  for (let i = start; i < end; i++) for (const [symbol, value] of weights[i]) {
    if (candidates.has(symbol)) totals.set(symbol, (totals.get(symbol) || 0) + value);
  }
  const ranked = [...totals].sort((a, b) => b[1] - a[1]);
  return { symbol: ranked[0]?.[0] || 'N', score: ranked[0]?.[1] || 0 };
}

// Au plus deux harmonies par mesure. Une frontière doit améliorer la couverture
// d'au moins un tiers de temps : les micro-attaques n'obtiennent pas une case.
function simplifyBar(weights, candidates, start, end) {
  const whole = dominant(weights, candidates, start, end);
  let result = [{ from: start, to: end, symbol: whole.symbol }], score = whole.score + 0.34;
  for (let split = start + 1; split < end; split++) {
    const left = dominant(weights, candidates, start, split), right = dominant(weights, candidates, split, end);
    if (left.symbol !== right.symbol && left.score + right.score > score) {
      score = left.score + right.score;
      result = [{ from: start, to: split, symbol: left.symbol }, { from: split, to: end, symbol: right.symbol }];
    }
  }
  return result;
}

function similarity(a, b) {
  if (!a.size || !b.size) return 0;
  let common = 0; for (const x of a) if (b.has(x)) common++;
  return common / (a.size + b.size - common);
}

// Comparaison de phrases de huit mesures, sans inventer couplet/refrain.
// La palette dominante tolère un passage isolé ; le retour d'une palette reçoit
// la même lettre. Les phrases consécutives similaires forment un seul bloc.
function assignSections(rows) {
  const references = [], sections = [];
  // Huit mesures au minimum pour comparer une assise : quatre mesures peuvent
  // ne contenir que la moitié d'une boucle lente et créeraient de fausses parties.
  for (let r = 0; r < rows.length; r += 2) {
    const phrase = rows.slice(r, r + 2), counts = new Map();
    for (const row of phrase) for (const cell of row.cells) if (cell.symbol !== 'N') counts.set(cell.symbol, (counts.get(cell.symbol) || 0) + cell.to - cell.from);
    const max = Math.max(0, ...counts.values());
    const fingerprint = new Set([...counts].filter(([, n]) => n >= Math.max(1, max * 0.18)).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([s]) => s));
    let id = references.findIndex((ref) => similarity(ref, fingerprint) >= 0.55);
    if (id < 0) { id = references.length; references.push(fingerprint); }
    const letter = id < 26 ? String.fromCharCode(65 + id) : `A${id + 1}`;
    let section = sections.at(-1);
    if (!section || section.id !== id) {
      section = { id, label: `Partie ${letter}`, rows: [], startTime: phrase[0].startTime };
      sections.push(section);
    }
    for (const row of phrase) { row.sectionId = id; section.rows.push(row); }
  }
  return sections;
}

export function buildMusicalGrid(analysis = {}, options = {}) {
  const settings = normalizeGridSettings(options.settings, analysis.timeSignature);
  const pulse = pulseBoundaries(analysis, settings, options.rhythm);
  const { times } = pulse;
  if (!(analysis.duration > 0)) return { settings, boundaries: [], rows: [], sections: [], estimated: true, tempo: pulse.tempo };
  const segments = (analysis.chords || []).filter((s) => Number.isFinite(s.startTime) && s.endTime > s.startTime)
    .map((source) => ({ source, symbol: getEffectiveChord(source), from: nearest(times, source.startTime), to: nearest(times, source.endTime) }));
  const weights = Array.from({ length: times.length - 1 }, () => new Map());
  for (const seg of segments) {
    for (let i = seg.from; i < seg.to && i < weights.length; i++) {
      const weight = seg.source.role === 'passing' ? 0.6 : 1;
      weights[i].set(seg.symbol, (weights[i].get(seg.symbol) || 0) + weight);
    }
  }
  weights.forEach((w) => { if (!w.size) w.set('N', 1); });
  const bars = [];
  // Première mesure incomplète = levée. Elle décale la numérotation de TOUTES les mesures,
  // qu'elle vienne des repères détectés ou du réglage manuel.
  const levee = pulse.barStarts
    ? pulse.barStarts[1] != null && pulse.barStarts[1] < settings.beatsPerBar
    : pulse.pickupBeats > 0;
  for (let from = 0, number = 1, rang = 0; from < weights.length; number++, rang++) {
    const suivant = pulse.barStarts ? pulse.barStarts[rang + 1] : null;
    const to = Math.min(weights.length, suivant != null ? suivant
      : from + (!pulse.barStarts && number === 1 && pulse.pickupBeats ? pulse.pickupBeats : settings.beatsPerBar));
    const candidates = new Set(['N']);
    for (const seg of segments) {
      if (seg.to <= from || seg.from >= to) continue;
      const period = times[Math.min(seg.from + 1, times.length - 1)] - times[seg.from];
      if (seg.source.endTime - seg.source.startTime >= period * 0.99) candidates.add(seg.symbol);
    }
    // Si une mesure n'a que des attaques brèves, retenir son accord dominant.
    if (candidates.size === 1) for (let i = from; i < to; i++) for (const s of weights[i].keys()) candidates.add(s);
    bars.push({ from, to, number: number - (levee ? 1 : 0), pickup: number === 1 && levee, cells: simplifyBar(weights, candidates, from, to) });
    from = to;
  }
  const rows = [];
  for (let i = 0; i < bars.length; i += 4) {
    const rowBars = bars.slice(i, i + 4), from = rowBars[0].from, to = rowBars.at(-1).to;
    const cells = [];
    for (const bar of rowBars) for (const cell of bar.cells) {
      const last = cells.at(-1);
      if (last && last.symbol === cell.symbol) last.to = cell.to;
      else cells.push({ ...cell });
    }
    for (const cell of cells) {
      cell.startTime = times[cell.from]; cell.endTime = times[cell.to];
      const sources = segments.filter((s) => s.source.endTime > cell.startTime && s.source.startTime < cell.endTime);
      const primary = sources.filter((s) => s.symbol === cell.symbol).sort((a, b) =>
        (Math.min(b.source.endTime, cell.endTime) - Math.max(b.source.startTime, cell.startTime))
        - (Math.min(a.source.endTime, cell.endTime) - Math.max(a.source.startTime, cell.startTime)))[0];
      cell.segmentId = primary?.source.segmentId || '';
      cell.continued = rows.at(-1)?.cells.at(-1)?.symbol === cell.symbol && cell === cells[0];
      cell.passages = segments.filter((s) => {
        const onset = s.from === s.to ? beatAtTime(times, s.source.startTime) : s.from;
        return onset >= cell.from && onset < cell.to && s.symbol !== cell.symbol && s.symbol !== 'N';
      })
        .map((s) => ({ symbol: s.symbol, segmentId: s.source.segmentId, startTime: s.source.startTime }));
    }
    const bpm = 60 * (to - from) / (times[to] - times[from]);
    rows.push({ from, to, bars: rowBars, cells, startTime: times[from], bpm, index: rows.length });
  }
  return { settings, boundaries: times, bars, rows, sections: assignSections(rows), estimated: pulse.estimated, tempo: pulse.tempo };
}
