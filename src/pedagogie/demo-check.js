// [Claude] — 2026-10-16 — Pédagogie IA : le CONTRÔLE DE COHÉRENCE d'une démonstration du guide.
//
// Un bouton « Écouter » doit jouer exactement ce que sa case annonce. Mesuré sur « Passing chords…
// Drop 2 » : la case « 1 → 5 · drop 2 · avec accord de passage » rejouait un enchaînement direct, et
// rien dans l'application ne pouvait le dire. Ce module le dit : pour chaque case, il relit ce qu'elle
// AFFIRME (`claims`) et le confronte aux données du moteur et à ce qui sera réellement joué.
//
// Trois états, calculés sans IA et jamais montrés tels quels à l'écran (Narcisse a fait retirer les
// bulles d'hypothèses) : on n'en voit que l'effet.
//   validé           tout concorde : la case est proposée normalement ;
//   à confirmer      elle se joue, mais un détail ne concorde pas (la basse jouée n'est pas celle du degré
//                    annoncé) : le Copilote le sait, l'écran ne promet rien de plus que le relevé ;
//   non exploitable  elle ne peut pas se jouer fidèlement (aucune note, passage hors vidéo, case qui
//                    affirme autre chose que ce qu'elle rejoue) : pas de bouton « Écouter ».
//
// La détection des NOTES (observé) et l'analyse HARMONIQUE (interprété) restent distinguées : les
// contrôles (a) à (c) portent sur l'observé, (d) sur l'interprété.
//
// Module PUR (aucune dépendance au navigateur), testé par test-demo-check.js.

import { parseChordName } from './note-roles.js';
import { passageExample } from './teacher-notes.js';
import { finalResultExample } from './tutorial-guide.js';

export const DEMO_STATE = Object.freeze({ OK: 'validé', MAYBE: 'à confirmer', NO: 'non exploitable' });

/** Une démonstration plus longue que ceci n'est plus « un mouvement » (s). */
const MAX_WINDOW = 30;
/** La basse d'une harmonie se lit sur ses premières (ou dernières) secondes (s). */
const BASS_WINDOW = 1.5;
const EPS = 1e-6;

const pcOf = (n) => ((n % 12) + 12) % 12;
const same = (a, b) => Math.abs(a - b) < EPS;

/**
 * Les classes de hauteur les plus graves qui SONNENT dans [from, to] (les deux plus basses). Pas
 * seulement les notes attaquées dans la fenêtre : la basse d'un accord est frappée au début de
 * l'accord, bien avant les dernières secondes qu'on regarde. Et deux, pas une : un renversement, une
 * basse tenue sous l'accord suivant ou une note de passage grave déplacent la plus basse sans que
 * l'accord annoncé soit faux.
 */
function bassPitchClasses(notes, from, to) {
  const sounding = [];
  for (const n of notes) {
    if (!Number.isFinite(n?.midi) || !Number.isFinite(n?.start)) continue;
    const end = Number.isFinite(n.end) ? n.end : n.start + 0.25;
    if (n.start > to + EPS || end < from - EPS) continue;
    sounding.push(n.midi);
  }
  const pcs = [];
  for (const midi of sounding.sort((x, y) => x - y)) {
    const pc = pcOf(midi);
    if (!pcs.includes(pc)) pcs.push(pc);
    if (pcs.length === 2) break;
  }
  return pcs;
}

/** L'accord annoncé (fondamentale, ou basse d'un renversement) est-il dans les basses entendues ? */
function bassMatches(pcs, chordName) {
  const parsed = parseChordName(chordName);
  if (!parsed || !pcs.length) return null;
  return pcs.includes(parsed.rootPc) || (parsed.bassPc != null && pcs.includes(parsed.bassPc));
}

/**
 * Contrôle une case du guide.
 * @param {object} h - une case de `buildHighlights`
 * @param {{guide: object, notes: object[], pedals?: object[]|null, activity?: object[]}} ctx
 * @returns {{state: string, problems: string[], warnings: string[]}}
 */
export function checkDemonstration(h, { guide, notes = [], pedals = null, activity = [] } = {}) {
  const problems = [];
  const warnings = [];
  const done = () => ({
    state: problems.length ? DEMO_STATE.NO : warnings.length ? DEMO_STATE.MAYBE : DEMO_STATE.OK,
    problems,
    warnings,
  });
  if (!h || !guide) { problems.push('pas de case ou pas de guide'); return done(); }

  // ── La progression complète ────────────────────────────────────────────────
  if (h.kind === 'final') {
    const part = (guide.parts || []).find((p) => p.id === h.play?.part);
    if (!part?.final) { problems.push('la partie annoncée n\'a pas de résultat final'); return done(); }
    const written = (h.chords || []).map((c) => c.degree).join(' ');
    const built = (part.final.chords || []).map((c) => String(c.degree).replace(/\(.*\)$/, '')).join(' ');
    if (written !== built) problems.push(`les accords écrits (${written}) ne sont pas ceux rejoués (${built})`);
    const { example } = finalResultExample({ guide, noteEvents: notes, pedals, activity }, { part: part.id });
    const played = example?.events?.length || example?.chords?.length || 0;
    if (!played) problems.push('rien à jouer');
    if (part.final.source === 'assembled') warnings.push('résultat assemblé (main gauche et main droite montrées séparément), pas joué d\'un trait par le prof');
    return done();
  }

  if (h.kind !== 'movement') { problems.push(`genre de case inconnu : ${h.kind}`); return done(); }

  // ── Un mouvement ───────────────────────────────────────────────────────────
  const claims = h.claims;
  const move = (guide.movements || []).find((m) => m.id === claims?.movementId);
  if (!claims || !move) { problems.push('la case ne dit pas de quel mouvement elle vient'); return done(); }
  const time = (move.times || []).find((t) => same(t.start, h.play?.start) && same(t.end, h.play?.end));

  // (a) La fenêtre jouée est celle qui est décrite, et c'est un passage du mouvement.
  if (!time) problems.push('le passage joué n\'est aucune des occurrences de ce mouvement');
  if (!same(h.start, h.play?.start) || !same(h.end, h.play?.end)) problems.push('la fenêtre affichée n\'est pas celle qui est jouée');
  if (!(h.play?.end > h.play?.start) || h.play.end - h.play.start > MAX_WINDOW) problems.push('fenêtre de lecture invalide');

  // (b) Les degrés annoncés sont ceux du mouvement.
  const bare = (d) => String(d || '').replace(/\(.*\)$/, '');
  if (bare(move.from.degree) !== claims.from || bare(move.to.degree) !== claims.to) problems.push('les degrés annoncés ne sont pas ceux du mouvement');

  // (c) Les gestes et les mots affichés existent dans CE passage (le défaut mesuré sur « Drop 2 »).
  for (const g of claims.gestures || []) if (!(move.kinds || []).includes(g)) problems.push(`le geste « ${g} » est annoncé mais n'est pas dans ce passage`);
  for (const t of claims.terms || []) if (time && !(time.terms || []).includes(t)) problems.push(`le mot « ${t} » est affiché mais le prof ne le dit pas à ce passage`);

  // (d) Ce qui sera joué : des notes, et une basse qui va bien du premier au second degré.
  if (!problems.length) {
    const example = passageExample(notes, { start: h.play.start, end: h.play.end, title: 'contrôle', pedals, speech: activity });
    if (!example?.events?.length) problems.push('aucune note à jouer dans ce passage');
    else {
      const inWindow = notes.filter((n) => n.start <= h.play.end + EPS && (Number.isFinite(n.end) ? n.end : n.start + 0.25) >= h.play.start - EPS);
      const start = bassMatches(bassPitchClasses(inWindow, h.play.start, h.play.start + BASS_WINDOW), move.from.name);
      const end = bassMatches(bassPitchClasses(inWindow, h.play.end - BASS_WINDOW, h.play.end), move.to.name);
      if (start === false) warnings.push(`la basse du début n'est pas celle de ${move.from.name} (degré ${claims.from})`);
      if (end === false) warnings.push(`la basse de la fin n'est pas celle de ${move.to.name} (degré ${claims.to})`);
    }
  }
  return done();
}

/**
 * Contrôle toutes les cases.
 * @returns {{highlight: object, check: object}[]}
 */
export function checkDemonstrations(highlights, ctx) {
  return (highlights || []).map((highlight) => ({ highlight, check: checkDemonstration(highlight, ctx) }));
}
