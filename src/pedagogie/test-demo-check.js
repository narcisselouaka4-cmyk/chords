// Tests de demo-check.js : une case décrit-elle ce qu'elle rejoue ? Les données sont synthétiques ;
// le même contrôle tourne sur les relevés réels (mesure AVANT → APRÈS du 16/10/2026 : 5 cases sur 47
// annonçaient un geste qu'on n'entend pas, 0 après correction).
import { checkDemonstration, DEMO_STATE } from './demo-check.js';
import { buildHighlights } from './guide-highlights.js';
import { buildChapters } from './guide-chapters.js';

let pass = 0; let fail = 0;
const check = (label, ok) => { if (ok) { pass += 1; console.log('  ✓', label); } else { fail += 1; console.log('  ✗', label); } };

// Do (48) → Sol (55) : une basse qui va du degré 1 au degré 5, 3 s.
const note = (midi, start, end) => ({ midi, start, end, velocity: 0.8 });
const notes = [note(48, 10, 11.6), note(64, 10, 11.6), note(55, 11.6, 13), note(62, 11.6, 13)];
const mv = (over = {}) => ({
  id: 'p1:1>5|', part: 'p1', from: { degree: '1', name: 'C' }, to: { degree: '5', name: 'G' }, via: [], kinds: ['direct'],
  times: [{ start: 10, end: 13, terms: [] }], said: { degrees: 2, pair: true, terms: [] }, ...over,
});
const part = { id: 'p1', keyName: 'Do majeur', key: { rootPc: 0, minor: false }, progression: { loop: true, chords: [] }, final: null };
const guideOf = (m) => ({ parts: [part], movements: [m] });
const ctx = (g, n = notes) => ({ guide: g, notes: n });

{
  const g = guideOf(mv());
  const h = buildHighlights(g)[0];
  const r = checkDemonstration(h, ctx(g));
  check('une case qui joue ce qu\'elle annonce est validée', r.state === DEMO_STATE.OK && !r.problems.length && !r.warnings.length);
}
{
  // Le défaut mesuré sur « Drop 2 » : la case affichait un geste d'un AUTRE passage que celui rejoué.
  const g = guideOf(mv());
  const h = { ...buildHighlights(g)[0] };
  h.claims = { ...h.claims, gestures: ['passing'] };
  const r = checkDemonstration(h, ctx(g));
  check('un geste annoncé qui n\'est pas dans le passage joué : non exploitable', r.state === DEMO_STATE.NO && /geste « passing »/.test(r.problems.join()));
}
{
  // « drop 2 » affiché alors que le prof ne le dit pas à ce passage-là.
  const g = guideOf(mv());
  const h = { ...buildHighlights(g)[0] };
  h.claims = { ...h.claims, terms: ['drop 2'] };
  const r = checkDemonstration(h, ctx(g));
  check('un mot du prof affiché mais pas dit à ce passage : non exploitable', r.state === DEMO_STATE.NO && /drop 2/.test(r.problems.join()));
}
{
  const g = guideOf(mv());
  const h = buildHighlights(g)[0];
  check('la fenêtre affichée n\'est pas celle qui est jouée : non exploitable',
    checkDemonstration({ ...h, play: { ...h.play, start: 80, end: 83 } }, ctx(g)).state === DEMO_STATE.NO);
  check('un passage qui n\'est aucune occurrence du mouvement : non exploitable',
    checkDemonstration({ ...h, start: 80, end: 83, play: { ...h.play, start: 80, end: 83 } }, ctx(g)).state === DEMO_STATE.NO);
  check('aucune note dans le passage : non exploitable, jamais un silence présenté comme un mouvement',
    checkDemonstration(h, ctx(g, [])).state === DEMO_STATE.NO);
  check('une case qui ne dit pas d\'où elle vient : non exploitable', checkDemonstration({ ...h, claims: null }, ctx(g)).state === DEMO_STATE.NO);
  check('les degrés annoncés ne sont pas ceux du mouvement : non exploitable',
    checkDemonstration({ ...h, claims: { ...h.claims, to: '4' } }, ctx(g)).state === DEMO_STATE.NO);
}
{
  // La basse entendue contredit le degré annoncé : on peut la jouer, mais on ne le garantit pas.
  const wrong = [note(53, 10, 11.6), note(64, 10, 11.6), note(60, 11.6, 13), note(62, 11.6, 13)];
  const g = guideOf(mv());
  const r = checkDemonstration(buildHighlights(g)[0], ctx(g, wrong));
  check('basse contredisant le degré annoncé : à confirmer (et jouable)', r.state === DEMO_STATE.MAYBE && r.warnings.length === 2 && !r.problems.length);
  // Un renversement ou une basse tenue sous l'accord suivant ne fait pas douter : deux basses sont acceptées.
  const held = [note(48, 10, 13), note(64, 10, 11.6), note(55, 11.6, 13), note(62, 11.6, 13)];
  check('une basse tenue sous l\'accord suivant (deux basses entendues) reste validée',
    checkDemonstration(buildHighlights(g)[0], ctx(g, held)).state === DEMO_STATE.OK);
}
{
  // La progression complète : les accords écrits sont ceux qui sont rejoués.
  const chords = [{ name: 'C', degree: '1', lh: [48], rh: [64], midis: [48, 64] }, { name: 'G', degree: '5', lh: [43], rh: [62], midis: [43, 62] }];
  const p = { ...part, final: { source: 'together', start: 10, end: 13, seconds: 1.5, chords }, progression: { loop: true, chords } };
  const g = { parts: [p], movements: [] };
  const h = buildHighlights(g)[0];
  check('progression complète jouée d\'un trait : validée', checkDemonstration(h, ctx(g)).state === DEMO_STATE.OK);
  check('accords écrits ≠ accords rejoués : non exploitable',
    checkDemonstration({ ...h, chords: [{ degree: '2', name: 'Dm' }, { degree: '5', name: 'G' }] }, ctx(g)).state === DEMO_STATE.NO);
  const assembled = { ...p, final: { ...p.final, source: 'assembled' } };
  const ga = { parts: [assembled], movements: [] };
  check('progression assemblée (jamais jouée d\'un trait) : à confirmer, et dit pourquoi',
    checkDemonstration(buildHighlights(ga)[0], ctx(ga)).state === DEMO_STATE.MAYBE);
}
{
  check('sans guide : non exploitable', checkDemonstration({ kind: 'movement' }, {}).state === DEMO_STATE.NO);
  // Les mouvements d'un chapitre sont dans ses bornes.
  const hs = [{ id: 'move:a', kind: 'movement', start: 25, end: 28, title: '1 → 5' }, { id: 'move:b', kind: 'movement', start: 130, end: 133, title: '5 → 1' }];
  const chapters = buildChapters({ narration: [], spans: [{ start: 0, end: 200, kind: 'joue' }], parts: [], highlights: hs, duration: 200 });
  check('chaque mouvement rattaché à un chapitre commence dans ses bornes',
    chapters.every((c) => c.moves.every((id) => { const h = hs.find((x) => x.id === id); return h.start >= c.start && h.start < c.end; })));
}

console.log(`\n${pass} réussis, ${fail} échoués`);
if (fail) process.exit(1);
