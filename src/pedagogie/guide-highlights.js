// [Claude] — 2026-10-15 — Le guide du tuto, réduit à l'essentiel : « de quoi ça parle » et « ce qu'il
// montre ». Narcisse : « il y a trop de cases, quasiment une pour chaque phrase […] il faut aller à
// l'essentiel », « beaucoup trop d'options […] il faut scroller tout en bas de la sidebar ».
//
// Avant : trois volets (résultat final, une étape par moment, tous les mouvements) avec accords, mains,
// rôle supposé et paroles. Maintenant : au plus MAX_HIGHLIGHTS cases, chacune un enseignement rejouable.
//
// Rien n'est inventé : tout vient du guide du moteur (tutorial-guide.js). Les degrés remplacent les noms
// d'accords, que le relevé rate souvent (ADR-052). Aucune main n'est nommée (ADR-054).
//
// Module PUR (aucune dépendance au navigateur), testé par test-guide-highlights.js.

import { bareDegree, movementKindText, clock } from './tutorial-guide.js';

export const MAX_HIGHLIGHTS = 6;

/** Ce qui fait un mouvement « intéressant » : un geste, pas une simple suite d'accords de la boucle. */
function movementScore(m) {
  const kinds = m.kinds || [];
  let score = 0;
  if (kinds.includes('modulation')) score += 4;
  if (kinds.some((k) => ['chromatic', 'walkUp', 'walkDown', 'lick', 'line'].includes(k))) score += 3;
  if (kinds.includes('passing') || (m.via && m.via.length)) score += 2;
  score += Math.min((m.times || []).length, 3) * 0.5;
  return score;
}

/**
 * Les enseignements du tuto : la progression complète d'abord (si le moteur l'a reconstituée), puis les
 * mouvements qui se distinguent, dans l'ordre du tuto. Les mouvements identiques (mêmes degrés, même
 * geste) sont une seule case, qui dit combien de fois le tuto le montre.
 *
 * @returns {{id: string, kind: 'final'|'movement', title: string, detail: string, start: number|null,
 *   end: number|null, play: object}[]}
 */
export function buildHighlights(guide, { max = MAX_HIGHLIGHTS } = {}) {
  if (!guide) return [];
  const out = [];

  const finals = (guide.parts || []).filter((p) => p.final && p.final.chords?.length);
  if (finals.length) {
    const part = finals[finals.length - 1];
    const f = part.final;
    const keys = (guide.parts || []).length;
    out.push({
      id: `final:${part.id}`,
      kind: 'final',
      title: 'La progression complète',
      detail: keys > 1 ? `en ${keys} tonalités` : '',
      // [Claude] — 2026-10-16 — Écrite, pas seulement jouée (Narcisse : « on voit quels sont les accords,
      // mais pas ce qui est dit à l'écrit »). Vient du même relevé que le rejeu (f.chords) : pas une seconde
      // source. La case ne PRÉTEND à rien de plus que ce que le moteur a lu — aucun degré du chapitre n'en
      // dérive (guide-chapters.js garde sa propre prudence sur « de quoi ça parle »).
      keyName: part.keyName,
      chords: f.chords.map((c) => ({ degree: bareDegree(c.degree), name: c.name })),
      start: f.source === 'together' ? f.start : null,
      end: f.source === 'together' ? f.end : null,
      play: { kind: 'final', part: part.id, hand: null },
    });
  }

  const groups = new Map();
  for (const m of guide.movements || []) {
    if (!m.times?.length || !m.from || !m.to) continue;
    // Un « mouvement » du 2 au 2 n'en est pas un (sauf un changement de tonalité) : mesuré sur « Above All ».
    if (bareDegree(m.from.degree) === bareDegree(m.to.degree) && !(m.kinds || []).includes('modulation')) continue;
    const key = `${bareDegree(m.from.degree)}>${bareDegree(m.to.degree)}|${(m.kinds || []).join('+')}`;
    const g = groups.get(key);
    if (g) { g.count += m.times.length; if (m.times[0].start < g.first.start) g.first = m.times[0]; } else groups.set(key, { m, first: m.times[0], count: m.times.length });
  }
  const room = Math.max(0, max - out.length);
  const picked = [...groups.entries()]
    .map(([key, g]) => ({ key, ...g, score: movementScore(g.m) + Math.min(g.count, 3) * 0.1 }))
    .sort((a, b) => b.score - a.score || a.first.start - b.first.start)
    .slice(0, room)
    .sort((a, b) => a.first.start - b.first.start);

  for (const g of picked) {
    // Le geste, sans les noms d'accords de passage : le relevé les rate souvent (Narcisse), les degrés suffisent.
    const kind = movementKindText({ ...g.m, via: [] });
    out.push({
      id: `move:${g.key}`,
      kind: 'movement',
      title: `${bareDegree(g.m.from.degree)} → ${bareDegree(g.m.to.degree)}`,
      detail: [kind && kind !== 'enchaînement direct' ? kind : '', g.count > 1 ? `${g.count} fois` : ''].filter(Boolean).join(' · '),
      start: g.first.start,
      end: g.first.end,
      play: { kind: 'movement', start: g.first.start, end: g.first.end },
    });
  }
  return out;
}

/** L'enseignement où se trouve la vidéo (pour l'éclairer) : le dernier dont le début est passé. */
export function highlightAt(highlights, t) {
  if (!Number.isFinite(t)) return null;
  let current = null;
  for (const h of highlights) {
    if (Number.isFinite(h.start) && Number.isFinite(h.end) && t >= h.start && t < h.end + 4) current = h;
  }
  return current ? current.id : null;
}

export { clock };
