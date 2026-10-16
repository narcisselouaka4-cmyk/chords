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

/**
 * Ce qui fait un mouvement « intéressant » : d'abord ce dont le PROF parle, ensuite un geste, et
 * seulement après une simple suite d'accords de la boucle.
 *
 * [Claude] — 2026-10-16 — Mesuré sur « Above All » : 85 mouvements relevés, 5 cases à remplir, et les
 * retenues (1 → 2, 4 → 6, 2 → 6…) n'étaient pas le sujet du tuto — lui annonce « a 6, 5 chord
 * progression ». Les degrés qu'il nomme à voix haute départagent : le tuto désigne son propre sujet.
 */
function movementScore(m, time = null) {
  const kinds = m.kinds || [];
  const said = m.said || {};
  // Les mots dits PENDANT ce passage-là (sinon, ceux du mouvement entier).
  const terms = time ? (time.terms || []) : (said.terms || []);
  let score = 0;
  // Il enchaîne lui-même ces deux degrés à voix haute (« from the chord I to the chord V »).
  if (said.pair) score += 6;
  else if (said.degrees === 2) score += 3;
  else if (said.degrees === 1) score += 1;
  if (terms.length) score += 1.5;
  if (kinds.includes('modulation')) score += 4;
  if (kinds.some((k) => ['chromatic', 'walkUp', 'walkDown', 'lick', 'line'].includes(k))) score += 3;
  if (kinds.includes('passing') || (m.via && m.via.length)) score += 2;
  if (!time) score += Math.min((m.times || []).length, 3) * 0.5;
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
    // Combien de tonalités DIFFÉRENTES : « Amazing Grace » a trois parties, toutes en Do — annoncer
    // « en 3 tonalités » était faux.
    const keys = new Set((guide.parts || []).map((p) => `${p.key?.rootPc}${p.key?.minor ? 'm' : ''}`)).size;
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
      // La tonalité vient-elle de sa bouche ? (« the key of C sharp ») — pour que l'écran puisse le dire.
      keySaid: part.saidKey?.text || null,
      chords: f.chords.map((c) => ({ degree: bareDegree(c.degree), name: c.name })),
      start: f.source === 'together' ? f.start : null,
      end: f.source === 'together' ? f.end : null,
      play: { kind: 'final', part: part.id, hand: null },
    });
  }

  // [Claude] — 2026-10-16 — Groupé par DEGRÉS seuls, plus par degrés + geste : « Drop 2 » montrait
  // « 1 → 5 » deux fois (une fois en direct, une fois par un accord de passage) et « 5 → 1 » deux fois,
  // soit quatre cases pour deux enseignements. La même en deux tonalités (« Next Level Worship »)
  // compte pour une : c'est le même enseignement.
  //
  // Une case DÉCRIT EXACTEMENT ce qu'elle rejoue. La première version affichait l'union des gestes de
  // tous les passages regroupés puis rejouait l'un d'eux : « 1 → 5 · avec accord de passage » jouait
  // un enchaînement DIRECT (le seul passage avec accord de passage est cinq minutes plus loin). Une
  // case est donc choisie parmi les OCCURRENCES (un mouvement à un instant) et se décrit à partir
  // d'elle seule ; le nombre d'occurrences est dit à part (« montré 5 fois »).
  const groups = new Map();
  for (const m of guide.movements || []) {
    if (!m.times?.length || !m.from || !m.to) continue;
    // Un « mouvement » du 2 au 2 n'en est pas un (sauf un changement de tonalité) : mesuré sur « Above All ».
    if (bareDegree(m.from.degree) === bareDegree(m.to.degree) && !(m.kinds || []).includes('modulation')) continue;
    const key = `${bareDegree(m.from.degree)}>${bareDegree(m.to.degree)}`;
    let g = groups.get(key);
    if (!g) { g = { best: null, count: 0, score: -Infinity }; groups.set(key, g); }
    g.count += m.times.length;
    for (const t of m.times) {
      const score = movementScore(m, t);
      if (score > g.score || (score === g.score && t.start < g.best.time.start)) { g.best = { m, time: t }; g.score = score; }
    }
  }
  const room = Math.max(0, max - out.length);
  const picked = [...groups.entries()]
    .map(([key, g]) => ({ key, ...g, rank: g.score + Math.min(g.count, 3) * 0.1 }))
    .sort((a, b) => b.rank - a.rank || a.best.time.start - b.best.time.start)
    .slice(0, room)
    .sort((a, b) => a.best.time.start - b.best.time.start);

  for (const g of picked) {
    const { m, time } = g.best;
    // Le geste de CE passage, sans les noms d'accords de passage : le relevé les rate souvent (Narcisse).
    const gestures = (m.kinds || []).filter((k) => k !== 'direct');
    const kind = movementKindText({ ...m, kinds: gestures, via: [] });
    // [Claude] — 2026-10-16 — Le mot du prof, quand il en emploie un en jouant CE passage : « drop 2 »,
    // « accord de passage », « notes de passage ». Narcisse : « si tu vois qu'il fait une upper structure,
    // tu indiques upper structure » — et c'est encore plus sûr quand c'est lui qui le dit.
    const terms = (time.terms || []).slice(0, 2);
    out.push({
      id: `move:${g.key}`,
      kind: 'movement',
      title: `${bareDegree(m.from.degree)} → ${bareDegree(m.to.degree)}`,
      detail: [terms.join(' · '), kind, g.count > 1 ? `montré ${g.count} fois` : ''].filter(Boolean).join(' · '),
      terms,
      said: Boolean(m.said?.pair || m.said?.degrees === 2),
      start: time.start,
      end: time.end,
      play: { kind: 'movement', start: time.start, end: time.end },
      // Ce que la case affirme, et d'où : le contrôle de cohérence (demo-check.js) le relit.
      claims: { movementId: m.id, from: bareDegree(m.from.degree), to: bareDegree(m.to.degree), gestures, terms, count: g.count },
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
