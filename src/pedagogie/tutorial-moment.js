// [Claude] — 2026-10-03 — Pédagogie IA : « le moment » de la vidéo dont parle le pianiste.
//
// Narcisse veut questionner le Copilote à côté de la vidéo du prof : « Qu'est-ce qu'il a
// voulu dire à ce moment-là ? », « Comment appliquerait-on ce qu'il vient de faire dans
// une progression 4-5-3-6-2-5-1 ? ». « Ce moment », « ici », « ce qu'il vient de faire » =
// le passage qui vient de se jouer : les N dernières secondes avant l'instant de la
// vidéo, ou la plage qu'il a choisie (Début / Fin, 10 min au plus : passage-range.js).
//
// Fonctions pures, testées dans test-tutorial-moment.js. L'écran (src/ui/pedagogie-tab.js)
// les appelle ; le Copilote reçoit le résultat dans son contexte (copilot-client.js).

import { compactTimeline } from './teacher-notes.js';

/** Durées de passage proposées au pianiste (secondes). */
export const PASSAGE_LENGTHS = [10, 20, 30, 60];
export const DEFAULT_PASSAGE_SECONDS = 20;
/** Avant cet instant, la vidéo n'a encore rien montré : pas de « moment ». */
const MIN_NOW = 0.5;

/** « 1:05 » (minutes:secondes), comme partout dans l'application. */
export function clock(seconds) {
  const s = Math.max(0, Number(seconds) || 0);
  return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
}

/**
 * Le passage désigné par « ici » : les `length` secondes qui précèdent `now`, ou la plage
 * choisie (Début / Fin) quand il y en a une — elle l'emporte : c'est un passage choisi
 * exprès. [Claude] — 2026-10-03 — `fixed` remplace `loop` (la boucle A-B est devenue la
 * plage choisie, qu'on peut faire boucler) ; `loop` reste accepté.
 * @param {number} now - instant de la vidéo (s)
 * @param {{length?: number, fixed?: {start: number, end: number}|null, loop?: object|null, duration?: number}} [options]
 * @returns {{start: number, end: number, now: number, chosen: boolean}|null}
 */
export function passageWindow(now, { length = DEFAULT_PASSAGE_SECONDS, fixed = null, loop = null, duration = Infinity } = {}) {
  const limit = Number.isFinite(duration) && duration > 0 ? duration : Infinity;
  const range = fixed || loop;
  if (range && Number.isFinite(range.start) && Number.isFinite(range.end) && range.end - range.start >= 0.5) {
    const start = Math.max(0, range.start);
    const end = Math.min(limit, range.end);
    return { start, end, now: Number.isFinite(now) ? Math.min(Math.max(now, start), end) : end, chosen: true };
  }
  if (!Number.isFinite(now) || now < MIN_NOW) return null;
  const span = Number.isFinite(length) && length > 0 ? Math.min(120, length) : DEFAULT_PASSAGE_SECONDS;
  const end = Math.min(now, limit);
  return { start: Math.max(0, end - span), end, now: end, chosen: false };
}

/** Ce qu'on garde d'une longue plage pour le Copilote (10 min, c'est beaucoup de phrases). */
const MOMENT_MAX_CHORDS = 60;
const MOMENT_MAX_LINES = 80;

/** Accords de la grille qui sonnent pendant le passage (même partiellement). */
export function chordsInWindow(chords, start, end) {
  return (chords || []).filter((c) => {
    if (!Number.isFinite(c?.start)) return false;
    const until = Number.isFinite(c.end) ? c.end : c.start + 0.01;
    return c.start < end && until > start;
  });
}

/** Phrases de la parole commencées pendant le passage (ou juste avant). */
export function linesInWindow(lines, start, end) {
  return (lines || []).filter((l) => Number.isFinite(l?.start) && l.start >= start - 2 && l.start < end);
}

/**
 * Tout ce que le Copilote reçoit du moment : l'instant, les bornes du passage, ses
 * accords, les notes du professeur qui y sont attaquées (frise main gauche | main
 * droite, comme la frise générale) et ce qui y est dit.
 * @param {object} input
 * @param {number} input.now
 * @param {number} [input.length]
 * @param {{start: number, end: number}|null} [input.loop]
 * @param {number} [input.duration]
 * @param {{start: number, end: number, label: string}[]} [input.chords]
 * @param {{midi: number, start: number, end: number, hand?: string}[]} [input.noteEvents]
 * @param {{start: number, text: string}[]} [input.transcript]
 * @param {{start: number, end: number, kind: string}[]} [input.activity] - teacherActivity().spans
 * @returns {object|null}
 */
export function momentContext({ now, length = DEFAULT_PASSAGE_SECONDS, fixed = null, loop = null, duration = Infinity, chords = [], noteEvents = [], transcript = [], activity = [] } = {}) {
  const win = passageWindow(now, { length, fixed, loop, duration });
  if (!win) return null;
  const inChords = chordsInWindow(chords, win.start, win.end);
  const inNotes = (noteEvents || []).filter((n) => Number.isFinite(n?.start) && n.start >= win.start - 0.05 && n.start < win.end);
  // [Claude] — 2026-10-03 — Ce que fait le prof dans le passage (teacher-activity.js) :
  // il joue, il parle, les deux. « parle » seul : il n'y a rien à rejouer.
  const spans = (activity || [])
    .filter((s) => s.start < win.end && s.end > win.start)
    .map((s) => ({ start: Math.max(s.start, win.start), end: Math.min(s.end, win.end), kind: s.kind }))
    .filter((s) => s.end - s.start > 0.05);
  const playing = spans.some((s) => s.kind === 'joue' || s.kind === 'joue-et-parle');
  const lines = linesInWindow(transcript, win.start, win.end);
  return {
    now: win.now,
    start: win.start,
    end: win.end,
    chosen: win.chosen,
    chords: inChords.slice(0, MOMENT_MAX_CHORDS).map((c) => ({ start: c.start, end: c.end, label: c.label })),
    chordsMore: Math.max(0, inChords.length - MOMENT_MAX_CHORDS),
    noteCount: inNotes.length,
    timeline: inNotes.length ? compactTimeline(inNotes, inChords, { maxLines: 30 }) : [],
    transcript: lines.slice(0, MOMENT_MAX_LINES).map((l) => ({ start: l.start, text: l.text })),
    transcriptMore: Math.max(0, lines.length - MOMENT_MAX_LINES),
    activity: spans,
    spokenOnly: !playing && !inNotes.length && spans.some((s) => s.kind === 'parle'),
  };
}

/**
 * Rend cliquables les moments « m:ss » (ou « m:ss,d ») d'une réponse du Copilote, sur
 * du texte DÉJÀ échappé : chacun devient un bouton qui place la vidéo à cet instant.
 * Un moment au-delà de la fin de la vidéo reste du texte.
 * @param {string} html
 * @param {{maxSeconds?: number}} [options]
 * @returns {string}
 */
export function linkClockTimes(html, { maxSeconds = Infinity } = {}) {
  return String(html || '').replace(/(^|[^\d:,.])(\d{1,2}):([0-5]\d)(?:,(\d))?(?![\d:])/g, (match, before, mm, ss, tenth) => {
    const seconds = Number(mm) * 60 + Number(ss) + (tenth ? Number(tenth) / 10 : 0);
    if (seconds > maxSeconds + 1) return match;
    const text = `${mm}:${ss}${tenth ? `,${tenth}` : ''}`;
    return `${before}<button type="button" class="copilot-time" data-seconds="${seconds}" title="Aller à ${text} dans la vidéo">${text}</button>`;
  });
}
