// [Claude] — 2026-10-03 — Pédagogie IA : ce que fait le prof à chaque instant (il joue, il
// parle, les deux, ou rien), et les notes qui sont vraiment les siennes.
//
// Narcisse : « le clavier MIDI virtuel arrive assez bien à reproduire ce que le pianiste
// joue […] vers la fin ça vrille totalement », et « tous les tutoriels ne sont pas de
// simples démonstrations, il faudra aussi savoir repérer les explications parlées ».
//
// Ce que montrait sa vidéo (tuto « Gospel Piano Harmony Secrets », 0:04 → 0:24) : le prof
// PARLE, assis sur un canapé, sans clavier à l'image. Le relevé au son
// (piano-transcription-inference) a pourtant donné 150 « notes » : sa voix, transcrite
// comme un piano. Rejouées, elles s'empilaient (chaque note durait jusqu'à la fin du
// passage) en un amas de 12 notes, Si♭3 → La6, les 12 sons.
//
// Ce module, pur et testé (test-teacher-activity.js) :
//   - cleanTeacherNotes : des notes possibles pour deux mains (durée bornée, jamais plus de
//     10 notes ensemble, pas d'amas de demi-tons collés quand elles viennent du son) ;
//   - teacherActivity : les moments où il joue, où il parle (phrases de la transcription de
//     la parole, faster-whisper), les deux, ou rien ; et les notes jouées, sans celles que
//     sa voix fait naître pendant qu'il parle ;
//   - activitySummary : « il parle 0:04–0:24 · il joue 0:24–0:52 ».
//
// Les seuils sont posés d'après la vidéo de Narcisse et la façon dont joue un pianiste ;
// ils sont réunis ici pour être réglés sur de vrais relevés.

import { clock } from './tutorial-moment.js';

/** Touches d'un piano. */
export const PIANO_LOW = 21;
export const PIANO_HIGH = 108;
/** Une note relevée dure 4 s au plus (le relevé au son prolonge souvent les notes). */
export const MAX_NOTE_SECONDS = 4;
/** Notes attaquées ensemble (un accord) : ±50 ms. */
export const ATTACK_WINDOW = 0.05;
/** Deux mains : 10 notes au plus. */
export const MAX_TOGETHER = 10;
/** 4 demi-tons collés (Do Do♯ Ré Ré♯) : pas un voicing, un amas de bruit. */
export const CLUSTER_SEMITONES = 4;
/** Notes « fantômes » du relevé au son : très brèves et très faibles. */
export const GHOST_SECONDS = 0.05;
export const GHOST_VELOCITY = 0.12;
/** Pendant qu'il parle, une note du son ne compte que dans un accord d'au moins 3 notes… */
export const SPEECH_CHORD_NOTES = 3;
/** … ou jouée assez fort (à son niveau de jeu ailleurs dans le passage, borné). */
export const SPEECH_VELOCITY_MIN = 0.4;
export const SPEECH_VELOCITY_MAX = 0.6;
/** Niveau de jeu supposé quand le passage n'a pas assez de notes hors parole. */
export const DEFAULT_PLAY_LEVEL = 0.55;
/** Une phrase couvre un pas de temps à partir de 30 %. */
const SPEECH_COVER = 0.3;
/** Il parle : ses phrases, élargies d'un souffle, et les pauses de moins d'une seconde
 * entre deux phrases (la transcription laisse des trous entre les phrases ; sa voix y fait
 * encore naître des notes). */
export const SPEECH_PAD = 0.3;
export const SPEECH_BRIDGE = 1;
/** Dans un accord attaqué pendant qu'il parle, une note bien plus faible que les autres
 * (moins de 60 % de leur force) est un reste de la voix. */
const CHORD_RELATIVE = 0.6;
/** Une ligne jouée (lick, run) : 4 notes au moins, à moins de 0,35 s l'une de l'autre, par
 * intervalles de 4 demi-tons au plus, courtes (0,6 s au plus en médiane). */
export const LINE_NOTES = 4;
export const LINE_GAP = 0.35;
export const LINE_STEP = 4;
export const LINE_DURATION = 0.6;
/** Pas de temps du découpage, et trou le plus long qui ne coupe pas un moment. */
export const BIN_SECONDS = 0.5;
export const BRIDGE_SECONDS = 1.5;

export const ACTIVITY = { PLAYS: 'joue', SPEAKS: 'parle', BOTH: 'joue-et-parle', NONE: 'rien' };

/** Les notes viennent-elles du son (et non de l'image) ? */
export function fromSound(source) {
  return /son|audio/i.test(String(source || ''));
}

const finite = (n) => Number.isFinite(n);

/** Une suite de `size` demi-tons collés parmi ces hauteurs. */
export function hasChromaticCluster(pitches, size = CLUSTER_SEMITONES) {
  const set = new Set(pitches);
  for (const p of set) {
    let run = 1;
    while (set.has(p + run)) run += 1;
    if (run >= size) return true;
  }
  return false;
}

/** Groupes de notes attaquées ensemble (±ATTACK_WINDOW autour de la première). */
function attackGroups(sorted) {
  const groups = [];
  for (const n of sorted) {
    const last = groups[groups.length - 1];
    if (last && n.start - last[0].start <= ATTACK_WINDOW) last.push(n);
    else groups.push([n]);
  }
  return groups;
}

/**
 * Des notes possibles pour un pianiste à deux mains.
 * Toutes sources : touches 21 à 108 ; 4 s au plus ; une note s'arrête quand la même touche
 * est rejouée. Notes du son seulement : notes fantômes écartées ; une attaque de plus de
 * 10 notes, ou de 4 demi-tons collés, écartée ; jamais plus de 10 notes ensemble, ni 4
 * demi-tons collés qui sonnent ensemble (les plus anciennes s'arrêtent).
 * @param {{midi: number, start: number, end: number, hand?: string, velocity?: number}[]} notes
 * @param {{source?: string}} [options] - analysis.notesSource (« son », « image (V2N) »…)
 * @returns {object[]} nouvelles notes, triées
 */
export function cleanTeacherNotes(notes, { source = '' } = {}) {
  let list = (notes || [])
    .filter((n) => finite(n?.midi) && finite(n?.start) && n.midi >= PIANO_LOW && n.midi <= PIANO_HIGH)
    .map((n) => ({ ...n, end: finite(n.end) && n.end > n.start ? n.end : n.start + 0.25 }))
    .sort((a, b) => a.start - b.start || a.midi - b.midi);

  // Durée bornée ; la même touche rejouée arrête la précédente.
  const nextSame = new Map();
  for (let i = list.length - 1; i >= 0; i -= 1) {
    const n = list[i];
    const next = nextSame.get(n.midi);
    let end = Math.min(n.end, n.start + MAX_NOTE_SECONDS);
    if (next !== undefined && next < end) end = Math.max(n.start + 0.03, next - 0.01);
    n.end = Math.round(end * 1000) / 1000;
    nextSame.set(n.midi, n.start);
  }
  if (!fromSound(source)) return list;

  // Notes fantômes.
  list = list.filter((n) => !(n.end - n.start < GHOST_SECONDS && finite(n.velocity) && n.velocity < GHOST_VELOCITY));
  // Attaques impossibles pour deux mains.
  list = attackGroups(list)
    .filter((g) => g.length <= MAX_TOGETHER && !hasChromaticCluster(g.map((n) => n.midi)))
    .flat();
  // Ce qui sonne ensemble : 10 notes au plus, et pas d'amas de demi-tons collés.
  const sounding = [];
  for (const n of list) {
    for (let i = sounding.length - 1; i >= 0; i -= 1) if (sounding[i].end <= n.start) sounding.splice(i, 1);
    // L'amas que formerait cette note avec celles qui sonnent : elles s'arrêtent.
    const near = sounding.filter((m) => Math.abs(m.midi - n.midi) < CLUSTER_SEMITONES);
    if (near.length && hasChromaticCluster([...near.map((m) => m.midi), n.midi])) {
      for (const m of near) if (m.start < n.start) m.end = Math.max(m.start + 0.03, n.start);
      for (let i = sounding.length - 1; i >= 0; i -= 1) if (sounding[i].end <= n.start) sounding.splice(i, 1);
    }
    while (sounding.length >= MAX_TOGETHER) {
      // La plus ancienne s'arrête.
      sounding.sort((a, b) => a.start - b.start);
      const oldest = sounding.shift();
      oldest.end = Math.max(oldest.start + 0.03, n.start);
    }
    sounding.push(n);
  }
  return list;
}

/**
 * Les moments où il parle : ses phrases élargies de SPEECH_PAD, réunies quand moins de
 * SPEECH_BRIDGE les sépare.
 * @param {{start: number, end: number, text?: string}[]} lines
 */
export function talkingRegions(lines) {
  const sorted = (lines || [])
    .filter((s) => finite(s?.start) && finite(s?.end) && s.end > s.start && String(s.text ?? 'x').trim())
    .map((s) => ({ start: s.start - SPEECH_PAD, end: s.end + SPEECH_PAD }))
    .sort((a, b) => a.start - b.start);
  const out = [];
  for (const r of sorted) {
    const last = out[out.length - 1];
    if (last && r.start - last.end < SPEECH_BRIDGE) last.end = Math.max(last.end, r.end);
    else out.push({ ...r });
  }
  return out;
}

/**
 * Les notes d'une ligne jouée (lick, run, gamme) : au moins LINE_NOTES notes isolées qui se
 * suivent à moins de LINE_GAP s, les trois quarts par intervalles de LINE_STEP demi-tons au
 * plus, et courtes (durée médiane de LINE_DURATION s au plus).
 * @param {object[]} notes - triées
 * @param {Set<object>} chordNotes - notes d'accords (exclues)
 * @returns {Set<object>}
 */
export function lineNotes(notes, chordNotes = new Set()) {
  const singles = (notes || []).filter((n) => !chordNotes.has(n));
  const kept = new Set();
  const close = (run) => {
    if (run.length < LINE_NOTES) return;
    let small = 0;
    for (let i = 1; i < run.length; i += 1) if (Math.abs(run[i].midi - run[i - 1].midi) <= LINE_STEP) small += 1;
    const durations = run.map((n) => n.end - n.start).sort((a, b) => a - b);
    const median = durations[Math.floor(durations.length / 2)];
    if (small / (run.length - 1) >= 0.75 && median <= LINE_DURATION) for (const n of run) kept.add(n);
  };
  let run = [];
  for (const n of singles) {
    if (run.length && n.start - run[run.length - 1].start > LINE_GAP) { close(run); run = []; }
    run.push(n);
  }
  close(run);
  return kept;
}

/** Part de [a, b] couverte par les phrases. */
function speechCover(speech, a, b) {
  let covered = 0;
  for (const s of speech) {
    const lo = Math.max(a, s.start);
    const hi = Math.min(b, s.end);
    if (hi > lo) covered += hi - lo;
  }
  return Math.min(1, covered / (b - a));
}

function percentile(values, p) {
  if (!values.length) return null;
  const sorted = [...values].sort((x, y) => x - y);
  return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
}

/**
 * Ce que fait le prof, moment par moment, et les notes qu'il joue vraiment.
 * - Notes lues à l'image (clavier dessiné, V2N) : toutes jouées.
 * - Notes du son : hors parole, toutes (déjà nettoyées) ; pendant qu'il parle, seulement
 *   celles d'un accord d'au moins 3 notes, ou jouées à son niveau de jeu — les petites
 *   notes isolées que fait naître sa voix sont écartées.
 * @param {object} input
 * @param {object[]} input.notes - notes du prof (nettoyées ici)
 * @param {{start: number, end: number, text?: string}[]} [input.speech] - phrases de la parole
 * @param {number} [input.start]
 * @param {number} [input.end]
 * @param {string} [input.source] - analysis.notesSource
 * @returns {{spans: {start: number, end: number, kind: string}[], played: object[], cleaned: object[], playLevel: number}}
 */
export function teacherActivity({ notes = [], speech = [], start = null, end = null, source = '' } = {}) {
  const cleaned = cleanTeacherNotes(notes, { source });
  const lines = talkingRegions(speech);
  const from = finite(start) ? start : Math.min(...cleaned.map((n) => n.start), ...lines.map((s) => s.start), Infinity);
  const to = finite(end) ? end : Math.max(...cleaned.map((n) => n.end), ...lines.map((s) => s.end), -Infinity);
  if (!finite(from) || !finite(to) || to <= from) return { spans: [], played: [], cleaned, playLevel: DEFAULT_PLAY_LEVEL };

  const sound = fromSound(source);
  const talking = (t) => lines.some((s) => t >= s.start && t < s.end);
  // Son niveau de jeu, hors parole.
  const outside = cleaned.filter((n) => !talking(n.start) && finite(n.velocity)).map((n) => n.velocity);
  const playLevel = outside.length >= 8 ? percentile(outside, 0.6) : DEFAULT_PLAY_LEVEL;
  const speechFloor = Math.min(SPEECH_VELOCITY_MAX, Math.max(SPEECH_VELOCITY_MIN, playLevel * 0.85));
  // Pendant qu'il parle, un accord attaqué compte s'il a au moins 3 notes ; une note bien
  // plus faible que les autres de l'accord n'en fait pas partie (un reste de la voix).
  const inChord = new Set();
  for (const g of attackGroups(cleaned)) {
    if (g.length < SPEECH_CHORD_NOTES) continue;
    const forces = g.filter((n) => finite(n.velocity)).map((n) => n.velocity);
    const middle = forces.length ? percentile(forces, 0.5) : null;
    const members = g.filter((n) => middle === null || !finite(n.velocity) || n.velocity >= middle * CHORD_RELATIVE);
    if (members.length >= SPEECH_CHORD_NOTES) for (const n of members) inChord.add(n);
  }
  // Un lick joué doucement en parlant reste son jeu : une suite de notes courtes et
  // rapprochées, par petits intervalles. Sa voix, elle, donne des notes longues (voyelles
  // tenues) aux sauts irréguliers.
  const inLine = lineNotes(cleaned, inChord);
  const played = cleaned.filter((n) => {
    if (!sound || !talking(n.start)) return true;
    // Force inconnue : rien ne permet de l'écarter.
    if (!finite(n.velocity)) return true;
    return inChord.has(n) || inLine.has(n) || n.velocity >= speechFloor;
  });

  // Pas de temps : joue (une note jouée y sonne), parle (une phrase le couvre), les deux, rien.
  const count = Math.max(1, Math.ceil((to - from) / BIN_SECONDS));
  const kinds = [];
  for (let i = 0; i < count; i += 1) {
    const a = from + i * BIN_SECONDS;
    const b = Math.min(to, a + BIN_SECONDS);
    const plays = played.some((n) => n.start < b && n.end > a);
    const speaks = lines.length > 0 && speechCover(lines, a, b) >= SPEECH_COVER;
    kinds.push(plays && speaks ? ACTIVITY.BOTH : plays ? ACTIVITY.PLAYS : speaks ? ACTIVITY.SPEAKS : ACTIVITY.NONE);
  }
  let spans = [];
  kinds.forEach((kind, i) => {
    const a = from + i * BIN_SECONDS;
    const b = Math.min(to, a + BIN_SECONDS);
    const last = spans[spans.length - 1];
    if (last && last.kind === kind) last.end = b;
    else spans.push({ start: a, end: b, kind });
  });
  spans = smoothSpans(spans);
  return {
    spans: spans.map((s) => ({ start: Math.round(s.start * 100) / 100, end: Math.round(s.end * 100) / 100, kind: s.kind })),
    played,
    cleaned,
    playLevel,
  };
}

/**
 * Un trou de moins de BRIDGE_SECONDS ne coupe pas un moment. Un moment où il joue n'est
 * jamais effacé : au plus, un court moment de jeu entouré de jeu prend leur nature.
 */
function smoothSpans(input) {
  let spans = input.map((s) => ({ ...s }));
  const merge = () => {
    const out = [];
    for (const s of spans) {
      const last = out[out.length - 1];
      if (last && last.kind === s.kind) last.end = s.end;
      else out.push({ ...s });
    }
    spans = out;
  };
  for (let pass = 0; pass < 4; pass += 1) {
    let changed = false;
    for (let i = 0; i < spans.length; i += 1) {
      const s = spans[i];
      if (s.end - s.start >= BRIDGE_SECONDS) continue;
      const prev = spans[i - 1];
      const next = spans[i + 1];
      // Un court « rien » rejoint le moment d'avant (ou d'après, au début).
      if (s.kind === ACTIVITY.NONE && (prev || next)) { s.kind = (prev || next).kind; changed = true; continue; }
      if (!prev || !next || prev.kind !== next.kind || s.kind === prev.kind) continue;
      // Entre deux moments de jeu : un court moment de jeu en prend la nature, une courte
      // phrase devient « il joue en parlant ». Un moment de jeu entre deux phrases reste.
      if (isPlaying(prev.kind)) { s.kind = isPlaying(s.kind) ? prev.kind : ACTIVITY.BOTH; changed = true; }
      else if (!isPlaying(s.kind)) { s.kind = prev.kind; changed = true; }
    }
    merge();
    if (!changed) break;
  }
  return spans;
}

/** Le prof joue-t-il dans ce moment ? */
export const isPlaying = (kind) => kind === ACTIVITY.PLAYS || kind === ACTIVITY.BOTH;

/** Les moments qui touchent [start, end], bornés à ce passage. */
export function spansIn(spans, start, end) {
  return (spans || [])
    .filter((s) => s.start < end && s.end > start)
    .map((s) => ({ ...s, start: Math.max(s.start, start), end: Math.min(s.end, end) }))
    .filter((s) => s.end - s.start > 0.05);
}

/** Dans ce passage, le prof ne fait que parler (aucun moment où il joue, au moins une phrase). */
export function onlySpeech(spans, start, end) {
  const inside = spansIn(spans, start, end);
  return inside.some((s) => s.kind === ACTIVITY.SPEAKS) && !inside.some((s) => isPlaying(s.kind));
}

/** Les accords relevés pendant qu'il joue (ceux lus pendant qu'il parle ne sont pas son jeu). */
export function chordsWhilePlaying(chords, spans) {
  const playing = (spans || []).filter((s) => isPlaying(s.kind));
  if (!(spans || []).length) return chords || [];
  return (chords || []).filter((c) => playing.some((s) => c.start < s.end && (c.end ?? c.start + 0.01) > s.start));
}

const LABELS = { [ACTIVITY.PLAYS]: 'il joue', [ACTIVITY.SPEAKS]: 'il parle', [ACTIVITY.BOTH]: 'il joue en parlant' };

/**
 * « il parle 0:04–0:24 · il joue 0:24–0:52 » ; les moments sans rien sont omis.
 * @param {{start: number, end: number, kind: string}[]} spans
 * @param {{max?: number, minSeconds?: number}} [options]
 */
export function activitySummary(spans, { max = 8, minSeconds = 1 } = {}) {
  const parts = (spans || [])
    .filter((s) => LABELS[s.kind] && s.end - s.start >= minSeconds)
    .map((s) => `${LABELS[s.kind]} ${clock(s.start)}–${clock(s.end)}`);
  if (parts.length > max) return `${parts.slice(0, max).join(' · ')} · …`;
  return parts.join(' · ');
}
