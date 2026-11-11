// [Claude] — 2026-11-11 — Partition d'une prise ou d'une proposition du Copilote : le modèle.
//
// Les notes du Copilote sont des évènements datés en secondes, sans mesure. Une partition
// demande des durées : elles sont donc ESTIMÉES ici, et le modèle dit avec quelle confiance.
//   - Les HAUTEURS sont exactes (ce sont les notes jouées).
//   - Les DURÉES sont arrondies à la double croche d'une pulsation estimée ; si la pulsation
//     n'est pas assez régulière, `meter.certain` est faux et l'affichage le dit. Une
//     quantification supposée n'est jamais présentée comme une partition certaine.
//   - Les barres de mesure sont SUPPOSÉES (quatre temps, première note sur le premier temps).
//   - La portée (clé de sol ou de fa) est une répartition de NOTATION autour du Do central,
//     pas la détection des mains.
//   - La lecture garde le rythme exact : chaque évènement conserve ses secondes d'origine, et
//     `scorePositionAt` suit le lecteur par le temps réel, pas par le temps arrondi.
// Module pur, sans DOM : testé par test-proposal-score-model.js. L'affichage est dans
// proposal-score-view.js (VexFlow).

export const UNITS_PER_BEAT = 4; // double croche
export const BEATS_PER_BAR = 4;
export const UNITS_PER_BAR = UNITS_PER_BEAT * BEATS_PER_BAR;
/** En dessous de cette part d'attaques proches de la pulsation, la mesure est dite incertaine. */
export const CERTAIN_PULSE = 0.85;

const SHARP_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const FLAT_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
const FRENCH = { do: 'C', re: 'D', 'ré': 'D', mi: 'E', fa: 'F', sol: 'G', la: 'A', si: 'B' };
const FLAT_MAJORS = new Set(['F', 'Bb', 'Eb', 'Ab', 'Db', 'Gb', 'Cb']);
const FLAT_MINORS = new Set(['D', 'G', 'C', 'F', 'Bb', 'Eb', 'Ab']);

/** « Mi bémol majeur », « Eb », « Do mineur », « Dm » → faut-il des bémols ? null si illisible. */
function keyPrefersFlats(key) {
  const match = /^\s*(do|ré|re|mi|fa|sol|la|si|[A-G])\s*(bémol|bemol|♭|b(?![a-z])|dièse|diese|♯|#)?\s*(.*)$/i.exec(String(key || ''));
  if (!match) return null;
  const letter = FRENCH[match[1].toLowerCase()] || match[1].toUpperCase();
  const accidental = !match[2] ? '' : /bémol|bemol|♭|b/i.test(match[2]) ? 'b' : '#';
  if (accidental === '#') return false;
  const minor = /^(?:m(?!aj)|min|mineur)/i.test(match[3].trim());
  return (minor ? FLAT_MINORS : FLAT_MAJORS).has(letter + accidental);
}

/** Faut-il écrire avec des bémols ? D'après la tonalité, sinon d'après les noms d'accords. */
export function prefersFlats({ key = '', chordNames = [] } = {}) {
  const fromKey = String(key || '').trim() ? keyPrefersFlats(key) : null;
  if (fromKey !== null) return fromKey;
  const names = chordNames.join(' ');
  const flats = (names.match(/[A-G]b|♭/g) || []).length;
  const sharps = (names.match(/[A-G]#|♯/g) || []).length;
  return flats > sharps;
}

/** Nom et octave d'une note MIDI (Do central = C4 = 60). */
export function spellPitch(midi, flats = false) {
  const pc = ((midi % 12) + 12) % 12;
  return { midi, name: (flats ? FLAT_NAMES : SHARP_NAMES)[pc], octave: Math.floor(midi / 12) - 1 };
}

/** Notes avec début et fin (secondes), à partir des évènements du lecteur ou d'une prise. */
export function notesFromEvents(events = []) {
  const open = new Map();
  const notes = [];
  const sortedEvents = [...events].filter((e) => Number.isFinite(e?.time)).sort((a, b) => a.time - b.time);
  for (const e of sortedEvents) {
    const isOn = (e.type === 'noteOn' || e.type === 'note_on') && (e.velocity ?? 1) > 0;
    const isOff = e.type === 'noteOff' || e.type === 'note_off' || ((e.type === 'noteOn' || e.type === 'note_on') && e.velocity === 0);
    if (!Number.isInteger(e.note)) continue;
    if (isOn) {
      // Une même touche rejouée sans relâchement : la précédente s'arrête là.
      if (open.has(e.note)) { const prev = open.get(e.note); if (e.time > prev.start) notes.push({ ...prev, end: e.time }); }
      open.set(e.note, { midi: e.note, start: e.time });
    } else if (isOff && open.has(e.note)) {
      const prev = open.get(e.note);
      open.delete(e.note);
      if (e.time > prev.start) notes.push({ ...prev, end: e.time });
    }
  }
  const last = sortedEvents.length ? sortedEvents.at(-1).time : 0;
  for (const prev of open.values()) notes.push({ ...prev, end: Math.max(last, prev.start + 0.25) });
  return notes.sort((a, b) => a.start - b.start || a.midi - b.midi);
}

/**
 * Pulsation estimée d'après les attaques. `confidence` : part des attaques à moins de 60 ms d'une
 * croche de cette pulsation. Moins de quatre attaques distinctes : aucune estimation fiable.
 * @returns {{beatSeconds: number, bpm: number, confidence: number}}
 */
export function estimatePulse(onsets = []) {
  const times = [...new Set(onsets.filter(Number.isFinite).map((t) => Math.round(t * 1000) / 1000))].sort((a, b) => a - b);
  const intoRange = (beat) => { let b = beat; while (b > 1.0) b /= 2; while (b < 0.375) b *= 2; return b; };
  if (times.length < 4) {
    // Trop peu d'attaques pour estimer : l'écart médian sert d'unité d'écriture, sans aucune confiance.
    const gaps = times.slice(1).map((t, i) => t - times[i]).filter((g) => g > 0.05).sort((a, b) => a - b);
    const beatSeconds = gaps.length ? Math.round(intoRange(gaps[Math.floor(gaps.length / 2)]) * 1000) / 1000 : 0.6;
    return { beatSeconds, bpm: Math.round(60 / beatSeconds), confidence: 0 };
  }
  const origin = times[0];
  let best = null;
  for (let beat = 0.375; beat <= 1.0001; beat += 0.0025) {
    const half = beat / 2;
    // Tolérance relative à la croche : une attaque « proche » l'est à 12 % près (30 ms à 120 à la noire).
    const tolerance = Math.min(0.045, half * 0.12);
    let close = 0;
    let error = 0;
    for (const t of times) {
      const x = (t - origin) / half;
      const distance = Math.abs(x - Math.round(x)) * half;
      if (distance <= tolerance) close += 1;
      error += distance;
    }
    const candidate = { beatSeconds: beat, score: close / times.length, error: Math.round((error / times.length) * 1000) };
    // Le plus d'attaques proches ; à égalité, le moindre écart moyen ; puis la pulsation la plus
    // proche de 100 à la noire (une noire à 60 ou à 120 s'écrivent pareil : ambiguïté d'octave).
    if (!best || candidate.score > best.score + 1e-9
      || (Math.abs(candidate.score - best.score) <= 1e-9 && (candidate.error < best.error
        || (candidate.error === best.error && Math.abs(beat - 0.6) < Math.abs(best.beatSeconds - 0.6))))) best = candidate;
  }
  const beatSeconds = Math.round(best.beatSeconds * 10000) / 10000;
  return { beatSeconds, bpm: Math.round(60 / beatSeconds), confidence: Math.round(best.score * 100) / 100 };
}

// Durées écrivables (en doubles croches) et leur code : ronde, blanche pointée, blanche, noire
// pointée, noire, croche pointée, croche, double croche.
export const DURATION_CODES = { 16: 'w', 12: 'hd', 8: 'h', 6: 'qd', 4: 'q', 3: '8d', 2: '8', 1: '16' };

/**
 * Découpe [from, to) (doubles croches dans la mesure) en durées écrivables, sans masquer les
 * temps : hors d'un temps, on complète d'abord jusqu'au temps suivant.
 */
export function splitDuration(from, to) {
  const out = [];
  let at = from;
  while (at < to) {
    const left = to - at;
    const inBeat = at % UNITS_PER_BEAT;
    let length;
    if (inBeat !== 0) {
      const toBeat = UNITS_PER_BEAT - inBeat;
      length = [3, 2, 1].find((v) => v <= Math.min(left, toBeat) && (v !== 3 || inBeat === 1));
    } else if (at === 0 && left >= 16) length = 16;
    else if ((at === 0 || at === 4) && left >= 12) length = 12;
    else if (at % 8 === 0 && left >= 8) length = 8;
    else if (left >= 6 && at % 8 === 0) length = 6;
    else if (left >= 4) length = 4;
    else length = [3, 2, 1].find((v) => v <= left);
    out.push({ from: at, to: at + length, code: DURATION_CODES[length] });
    at += length;
  }
  return out;
}

function staffSlices(notes, barStart) {
  const barEnd = barStart + UNITS_PER_BAR;
  const inside = notes.filter((n) => n.from < barEnd && n.to > barStart);
  const cuts = new Set([barStart, barEnd]);
  for (const n of inside) { cuts.add(Math.max(barStart, n.from)); cuts.add(Math.min(barEnd, n.to)); }
  const points = [...cuts].sort((a, b) => a - b);
  const events = [];
  for (let i = 0; i < points.length - 1; i += 1) {
    const a = points[i];
    const b = points[i + 1];
    // Une même touche attaquée deux fois dans la même double croche ne s'écrit qu'une fois (revue indépendante).
    const sounding = [...new Map(inside.filter((n) => n.from <= a && n.to > a).sort((x, y) => x.from - y.from).map((n) => [n.midi, n])).values()].sort((x, y) => x.midi - y.midi);
    for (const piece of splitDuration(a - barStart, b - barStart)) {
      const from = barStart + piece.from;
      const to = barStart + piece.to;
      events.push({
        from, to, code: piece.code, rest: sounding.length === 0,
        keys: sounding.map((n) => ({ ...n.pitch, tiedFromPrevious: n.from < from, tiedToNext: n.to > to })),
        // Secondes réelles de la première note attaquée ici (lecture exacte), sinon du début estimé.
        seconds: sounding.filter((n) => n.from === from).map((n) => n.start).sort((x, y) => x - y)[0] ?? null,
      });
    }
  }
  return events;
}

/**
 * Le modèle de partition.
 * @param {{events: object[], chordLabels?: {at: number, name: string}[], key?: string, splitAt?: number, pulse?: {beatSeconds: number, confidence: number}}} input
 *   chordLabels : accords et instant (secondes) ; splitAt : note MIDI à partir de laquelle on écrit en clé de sol.
 *   writtenTempo : pour un exemple ÉCRIT par l'application (temps en battues, tempo connu) : rien n'est estimé.
 */
export function buildProposalScore({ events = [], chordLabels = [], key = '', splitAt = 60, pulse = null, writtenTempo = null } = {}) {
  const notes = notesFromEvents(events);
  if (!notes.length) return { empty: true, bars: [], meter: null, noteCount: 0, limits: ['Aucune note à écrire.'] };
  const written = Number.isFinite(writtenTempo) && writtenTempo > 0;
  const estimated = written ? { beatSeconds: 1, confidence: 1 } : pulse || estimatePulse(notes.map((n) => n.start));
  const unit = estimated.beatSeconds / UNITS_PER_BEAT;
  const origin = notes[0].start;
  const flats = prefersFlats({ key, chordNames: chordLabels.map((c) => c.name) });
  const quantized = notes.map((n) => {
    const from = Math.max(0, Math.round((n.start - origin) / unit));
    const to = Math.max(from + 1, Math.round((n.end - origin) / unit));
    return { midi: n.midi, start: n.start, end: n.end, from, to, pitch: spellPitch(n.midi, flats), staff: n.midi >= splitAt ? 'treble' : 'bass' };
  });
  // Une même touche ne se superpose pas à elle-même après arrondi.
  const byPitch = new Map();
  for (const n of quantized) {
    const previous = byPitch.get(n.midi);
    if (previous && previous.to > n.from) previous.to = Math.max(previous.from + 1, n.from);
    byPitch.set(n.midi, n);
  }
  // Lecture : une note relâchée une double croche avant l'attaque suivante de sa portée (ou avant
  // le temps) s'écrit tenue jusque-là. Sans cela, un accord tenu « presque » deux temps devenait
  // noire pointée liée à une double croche, suivie d'un quart de soupir : exact, mais illisible.
  for (const staff of ['treble', 'bass']) {
    const inStaff = quantized.filter((n) => n.staff === staff);
    const starts = [...new Set(inStaff.map((n) => n.from))].sort((a, b) => a - b);
    for (const n of inStaff) {
      const next = starts.find((start) => start >= n.to);
      if (next !== undefined && next - n.to === 1) n.to = next;
      else if (next === undefined && n.to % UNITS_PER_BEAT === UNITS_PER_BEAT - 1) n.to += 1;
    }
  }
  const lastUnit = Math.max(...quantized.map((n) => n.to));
  const barCount = Math.max(1, Math.ceil(lastUnit / UNITS_PER_BAR));
  const labels = chordLabels.filter((c) => Number.isFinite(c?.at) && c.name).map((c) => ({ name: String(c.name), seconds: c.at, at: Math.max(0, Math.round((c.at - origin) / unit)) }));
  const bars = [];
  for (let index = 0; index < barCount; index += 1) {
    const start = index * UNITS_PER_BAR;
    bars.push({
      index, from: start, to: start + UNITS_PER_BAR,
      startSeconds: origin + start * unit,
      treble: staffSlices(quantized.filter((n) => n.staff === 'treble'), start),
      bass: staffSlices(quantized.filter((n) => n.staff === 'bass'), start),
      chords: labels.filter((c) => c.at >= start && c.at < start + UNITS_PER_BAR),
    });
  }
  // Écart moyen entre le rythme joué et le rythme écrit : ce que l'arrondi a déplacé.
  const drift = quantized.reduce((sum, n) => sum + Math.abs((origin + n.from * unit) - n.start), 0) / quantized.length;
  const certain = estimated.confidence >= CERTAIN_PULSE;
  const fewOnsets = !written && new Set(notes.map((n) => Math.round(n.start * 1000))).size < 4;
  const limits = [
    written ? `Exemple écrit par l’application, à ${Math.round(writtenTempo)} à la noire.`
      : certain ? `Pulsation estimée : environ ${Math.round(60 / estimated.beatSeconds)} à la noire.`
        : fewOnsets ? 'Trop peu de notes pour reconnaître une pulsation : les durées écrites sont une approximation.'
          : 'Rythme libre : la pulsation n’est pas assez régulière pour être certaine. Les durées écrites sont une approximation.',
    written ? 'Mesures à quatre temps.' : 'Barres de mesure supposées : quatre temps, la première note sur le premier temps.',
    written ? 'Durées écrites à la double croche près.' : 'Hauteurs exactes ; durées arrondies à la double croche (pas de triolets).',
    'Portées : répartition de lecture autour du Do central, pas la détection des mains.',
  ];
  return {
    empty: false,
    noteCount: notes.length,
    flats,
    origin,
    unitSeconds: unit,
    written,
    meter: { beatsPerBar: BEATS_PER_BAR, beatUnit: 4, beatSeconds: estimated.beatSeconds, bpm: written ? Math.round(writtenTempo) : Math.round(60 / estimated.beatSeconds), confidence: estimated.confidence, certain, driftSeconds: Math.round(drift * 1000) / 1000 },
    bars,
    limits,
    // Les secondes réelles de chaque attaque, dans l'ordre : la synchronisation suit le son.
    onsets: [...new Set(quantized.map((n) => `${n.from}:${n.start}`))].map((pair) => { const [from, start] = pair.split(':'); return { unit: Number(from), seconds: Number(start) }; }).sort((a, b) => a.seconds - b.seconds),
  };
}

/**
 * Où en est la lecture sur la partition : l'attaque en cours, d'après le temps RÉEL du lecteur.
 * @returns {{unit: number, bar: number}|null}
 */
export function scorePositionAt(score, seconds) {
  if (!score || score.empty || !Number.isFinite(seconds)) return null;
  let current = null;
  for (const onset of score.onsets) {
    if (onset.seconds <= seconds + 0.02) current = onset; else break;
  }
  if (!current) return null;
  return { unit: current.unit, bar: Math.floor(current.unit / UNITS_PER_BAR) };
}
