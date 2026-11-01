// [Claude] — 2026-11-01 — Ce que joue le prof, décrit comme un pianiste le lit.
//
// Narcisse : « j'aimerais comprendre ce que joue le prof dans sa cover […] les inner
// voicings, les mouvements entre deux accords principaux, les voicings et le voice
// leading ». Le Copilote recevait jusqu'ici les notes BRUTES du prof, accord par accord
// (« 1:05 C : Do2 | Mi3 Sol3 Do4 ») : à lui de redéduire les rôles et la conduite des
// voix de tête, à chaque question. Il s'en tirait de façon vague et parfois fausse.
//
// Or l'application sait déjà faire ces deux calculs, et les fait ailleurs :
//   - les RÔLES d'un voicing (`describeShape`, tutorial-transfer.js) : « main gauche 1 · 7 |
//     main droite 3 · 5 · 9 » — utilisés pour adapter un passage à une autre progression ;
//   - la CONDUITE DES VOIX (`describeVoiceLeading`, example-guide.js) : « Fa (3ce) descend
//     sur Mi (3ce de C) ; Do reste (7e → fondamentale) » — utilisée pour le jeu du pianiste
//     lui-même (take-review.js), jamais pour le prof.
//
// Ce module les branche sur les notes du prof et en fait des lignes pour le contexte du
// Copilote. On ne lui demande plus de deviner : on lui donne des faits calculés.
//
// Module PUR (aucune dépendance au navigateur), testé par test-teacher-voicings.js.

import { guessHands } from './teacher-notes.js';
import { voicingShapes, describeShape } from './tutorial-transfer.js';
import { describeVoiceLeading, frenchNoteName } from './example-guide.js';
import { noteRoles, parseChordName } from './note-roles.js';

/** Les voix intérieures : ni la basse, ni le dessus — celles qu'on n'entend pas bouger seul. */
const INNER_MIN = 3;

const clock = (t) => {
  const s = Math.max(0, Math.round(Number(t) || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

/**
 * Le voicing attaqué au début de chaque accord du passage : ses notes, par main.
 * Les notes attaquées ensemble (±60 ms) forment l'accord ; le reste est une ligne.
 * @returns {{name: string, start: number, leftHand: number[], rightHand: number[]}[]}
 */
export function teacherVoicings(notes, chords, { start = 0, end = Infinity } = {}) {
  const list = guessHands((notes || []).filter((n) => Number.isFinite(n?.midi)
    && Number.isFinite(n?.start) && n.start >= start && n.start < end));
  if (!list.length) return [];
  const segs = (chords || [])
    .filter((c) => Number.isFinite(c?.start) && c.start < end && (Number.isFinite(c.end) ? c.end : Infinity) > start)
    .sort((a, b) => a.start - b.start);
  const out = [];
  for (const seg of segs) {
    const to = Number.isFinite(seg.end) ? seg.end : Infinity;
    const inSeg = list.filter((n) => n.start >= seg.start - 0.05 && n.start < to).sort((a, b) => a.start - b.start);
    if (!inSeg.length) continue;
    const first = inSeg[0].start;
    const attack = inSeg.filter((n) => n.start - first < 0.06);
    const left = attack.filter((n) => n.hand === 'lh').map((n) => n.midi).sort((a, b) => a - b);
    const right = attack.filter((n) => n.hand !== 'lh').map((n) => n.midi).sort((a, b) => a - b);
    if (!left.length && !right.length) continue;
    out.push({ name: seg.label || seg.name || '', start: seg.start, leftHand: left, rightHand: right });
  }
  return out;
}

/**
 * Les voix intérieures d'un voicing : ce que la main droite tient entre la note du
 * dessus et la basse. C'est là que se logent les 7e, 9e et 3ce qui font la couleur, et
 * ce sont elles qui bougent d'un demi-ton d'un accord au suivant.
 * @returns {number[]} les hauteurs MIDI, graves vers aigus
 */
export function innerVoices({ leftHand = [], rightHand = [] } = {}) {
  const all = [...leftHand, ...rightHand].sort((a, b) => a - b);
  if (all.length < INNER_MIN) return [];
  return all.slice(1, -1);
}

/**
 * Ce que joue le prof dans ce passage, pour le contexte du Copilote : par accord, la
 * forme en rôles et ses voix intérieures ; entre deux accords, la conduite des voix.
 * Lignes vides si le passage n'a pas d'accord lisible : on ne dit rien plutôt que d'inventer.
 * @param {{notes: object[], chords: object[], start: number, end: number, max?: number}} params
 * @returns {string[]}
 */
export function teacherVoicingLines({ notes = [], chords = [], start = 0, end = Infinity, max = 12 } = {}) {
  const voicings = teacherVoicings(notes, chords, { start, end });
  if (!voicings.length) return [];
  const shapes = voicingShapes(notes, chords, { start, end });
  // Le rôle de chaque note est calculé par accord : on retrouve la forme à son instant.
  const shapeAt = (t) => shapes.find((s) => Number.isFinite(s?.time) && Math.abs(s.time - t) < 0.75) || null;

  const lines = ['', '## Ce qu\'il joue ici, note par note (calculé par l\'application d\'après ses notes : rôles, voix intérieures, conduite des voix)'];
  const shown = voicings.slice(0, max);
  for (let i = 0; i < shown.length; i += 1) {
    const v = shown[i];
    const shape = shapeAt(v.start);
    const roles = shape ? describeShape(shape) : null;
    const inner = innerVoices(v);
    const parts = [`- ${clock(v.start)} **${v.name || '?'}**`];
    if (roles) parts.push(`forme : ${roles}${shape?.unsure ? ' (lecture incertaine)' : ''}`);
    // Les voix intérieures NOMMÉES, avec leur rôle : c'est là que se loge la couleur, et
    // les compter n'apprend rien au pianiste — il veut savoir lesquelles.
    if (inner.length) {
      const chord = parseChordName(v.name);
      const degrees = chord ? new Map(noteRoles(chord, inner).map((r) => [r.midi, r.degree])) : new Map();
      const named = inner.map((m) => {
        const d = degrees.get(m);
        return `${frenchNoteName(m, chord)}${d ? ` (${d})` : ''}`;
      });
      parts.push(`voix intérieures : ${named.join(' ')}`);
    }
    lines.push(parts.join(' · '));
    const next = shown[i + 1];
    if (!next) continue;
    const leading = describeVoiceLeading(v, next);
    // Rien de calculable (accord non reconnu, aucune voix conjointe) : on se tait.
    if (leading?.text) lines.push(`  → vers ${next.name || '?'} : ${leading.text}`);
  }
  if (voicings.length > shown.length) lines.push(`_(${voicings.length - shown.length} accords de plus dans ce passage, non détaillés ici.)_`);
  lines.push('Ces rôles et ces mouvements viennent du relevé : ne les contredis pas, et n\'en invente pas d\'autres.');
  return lines;
}
