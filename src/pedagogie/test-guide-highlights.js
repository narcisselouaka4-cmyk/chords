// Tests de guide-highlights.js : le guide réduit à l'essentiel (≤ 6 cases, degrés, pas de mains).
import { buildHighlights, describeSubject, highlightAt, MAX_HIGHLIGHTS } from './guide-highlights.js';

let pass = 0; let fail = 0;
const check = (label, ok) => { if (ok) { pass += 1; console.log('  ✓', label); } else { fail += 1; console.log('  ✗', label); } };

const mv = (id, from, to, kinds, times, via = []) => ({
  id, part: 'p1', from: { degree: from, name: 'X' }, to: { degree: to, name: 'Y' }, via, kinds,
  times: times.map(([start, end]) => ({ start, end })),
});
const chord = (degree) => ({ degree, name: 'Z', rh: [], lh: [] });
const part = (final = true) => ({
  id: 'p1', keyName: 'Ré♭ majeur', progression: { loop: true, chords: ['2(m7)', '5(7)', '1', '6(m7)'].map(chord) },
  final: final ? { source: 'together', start: 30, end: 50, chords: ['2(m7)', '5(7)', '1', '6(m7)'].map(chord) } : null,
});

{
  const guide = { parts: [part()], movements: [mv('a', '6', '4', ['chromatic'], [[45, 60]])] };
  const h = buildHighlights(guide);
  check('la progression complète vient en premier', h[0].kind === 'final' && h[0].detail === '2 – 5 – 1 – 6');
  check('un mouvement est nommé en degrés, avec son geste', h[1].title === '6 → 4' && /chromatique/.test(h[1].detail));
  check('chaque case se rejoue', h.every((x) => x.play && x.play.kind));
  check('aucun nom d\'accord ni main dans les cases', h.every((x) => !/ main |Main|droite|gauche/i.test(`${x.title} ${x.detail}`)));
}
{
  // 30 mouvements : jamais plus de 6 cases, et les gestes l'emportent sur les simples enchaînements.
  const movements = Array.from({ length: 30 }, (_, i) => mv(`m${i}`, String((i % 6) + 1), String(((i + 2) % 6) + 1), i % 5 === 0 ? ['chromatic'] : ['direct'], [[i * 10, i * 10 + 5]]));
  const h = buildHighlights({ parts: [part()], movements });
  check(`au plus ${MAX_HIGHLIGHTS} cases pour toute la vidéo`, h.length <= MAX_HIGHLIGHTS);
  check('les gestes (chromatique) passent avant les enchaînements simples', h.filter((x) => x.kind === 'movement').some((x) => /chromatique/.test(x.detail)));
  check('dans l\'ordre du tuto', h.filter((x) => x.kind === 'movement').every((x, i, a) => i === 0 || a[i - 1].start <= x.start));
}
{
  // Le même mouvement montré 3 fois = une seule case, qui le dit.
  const g = { parts: [part(false)], movements: [mv('a', '2', '5', ['direct'], [[10, 15]]), mv('b', '2', '5', ['direct'], [[70, 75]]), mv('c', '2', '5', ['direct'], [[130, 135]])] };
  const h = buildHighlights(g);
  check('un mouvement répété est une seule case', h.length === 1 && /3 fois/.test(h[0].detail) && h[0].start === 10);
}
{
  check('sans guide : rien', buildHighlights(null).length === 0 && describeSubject(null) === '');
  check('de quoi ça parle : la boucle et la tonalité relevées', describeSubject({ parts: [part()] }) === 'Une boucle 2 – 5 – 1 – 6, en Ré♭ majeur.');
  check('plusieurs tonalités : dit combien', /en 3 tonalités/.test(describeSubject({ parts: [part(), part(), part()] })));
  check('rien de sûr : rien d\'inventé', describeSubject({ parts: [{ id: 'p1', progression: { chords: [] } }] }) === '');
  const hl = [{ id: 'a', start: 10, end: 20 }, { id: 'b', start: 100, end: 110 }];
  check('la case où en est la vidéo', highlightAt(hl, 15) === 'a' && highlightAt(hl, 105) === 'b' && highlightAt(hl, 60) === null);
}

console.log(`\n${pass} réussis, ${fail} échoués`);
if (fail) process.exit(1);
