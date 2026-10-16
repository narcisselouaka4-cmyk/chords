// Tests de guide-highlights.js : le guide réduit à l'essentiel (≤ 6 cases, degrés, pas de mains).
import { buildHighlights, highlightAt, MAX_HIGHLIGHTS } from './guide-highlights.js';

let pass = 0; let fail = 0;
const check = (label, ok) => { if (ok) { pass += 1; console.log('  ✓', label); } else { fail += 1; console.log('  ✗', label); } };

const mv = (id, from, to, kinds, times, via = [], said = null) => ({
  id, part: 'p1', from: { degree: from, name: 'X' }, to: { degree: to, name: 'Y' }, via, kinds,
  times: times.map(([start, end, terms]) => ({ start, end, terms: terms || said?.terms || [] })),
  ...(said ? { said } : {}),
});
const chord = (degree) => ({ degree, name: 'Z', rh: [], lh: [] });
const part = (final = true, key = { rootPc: 1, minor: false }) => ({
  id: 'p1', keyName: 'Ré♭ majeur', key, progression: { loop: true, chords: ['2(m7)', '5(7)', '1', '6(m7)'].map(chord) },
  final: final ? { source: 'together', start: 30, end: 50, chords: ['2(m7)', '5(7)', '1', '6(m7)'].map(chord) } : null,
});

{
  const guide = { parts: [part()], movements: [mv('a', '6', '4', ['chromatic'], [[45, 60]])] };
  const h = buildHighlights(guide);
  check('la progression complète vient en premier, écrite : degrés, noms d\'accords, tonalité', h[0].kind === 'final' && h[0].keyName === 'Ré♭ majeur'
    && h[0].chords.map((c) => c.degree).join(' ') === '2 5 1 6' && h[0].chords[0].name === 'Z');
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
  // Mesuré sur « Above All » : un « mouvement » du 2 au 2 n'en est pas un ; les noms d'accords de passage ne s'affichent pas.
  const g = { parts: [part(false)], movements: [
    mv('a', '2', '2', ['passing'], [[10, 15]], [{ name: 'C#m13' }]),
    mv('b', '1', '2', ['passing', 'chromatic'], [[20, 25]], [{ name: 'C6' }, { name: 'E/G#' }]),
  ] };
  const h = buildHighlights(g);
  check('un mouvement du degré vers lui-même est écarté', h.every((x) => x.title !== '2 → 2') && h.length === 1);
  check('les noms d\'accords de passage ne sont pas affichés', !/C6|E\/G#|C#m13|\(/.test(`${h[0].title} ${h[0].detail}`) && /accord de passage/.test(h[0].detail));
  const mod = buildHighlights({ parts: [part(false)], movements: [mv('m', '1', '1', ['modulation'], [[5, 9]])] });
  check('un changement de tonalité reste, même du 1 au 1', mod.length === 1);
}
{
  // Le même mouvement montré 3 fois = une seule case, qui le dit.
  const g = { parts: [part(false)], movements: [mv('a', '2', '5', ['direct'], [[10, 15]]), mv('b', '2', '5', ['direct'], [[70, 75]]), mv('c', '2', '5', ['direct'], [[130, 135]])] };
  const h = buildHighlights(g);
  check('un mouvement répété est une seule case', h.length === 1 && /3 fois/.test(h[0].detail) && h[0].start === 10);
}
{
  // [Claude] — 2026-10-16 — Ce que le PROF DIT départage les mouvements, et son mot s'affiche.
  // Mesuré sur « Passing chords… Drop 2 » : il annonce « from the chord I to the chord V » et dit
  // « drop 2 » en le jouant ; sur « Above All », 85 mouvements relevés pour 5 cases à remplir.
  const movements = [
    mv('a', '3', '6', ['chromatic'], [[10, 15]]),
    mv('b', '1', '5', ['direct'], [[20, 25], [60, 65]], [], { degrees: 2, pair: true, terms: ['drop 2'] }),
    mv('c', '4', '2', ['passing'], [[30, 35]], [{ name: 'Bb' }]),
  ];
  const h = buildHighlights({ parts: [part(false)], movements }, { max: 2 });
  const announced = h.find((x) => x.title === '1 → 5');
  // Deux places seulement : celui qu'il annonce est gardé, l'accord de passage dont il ne parle pas sort.
  check('le mouvement que le prof annonce est gardé, le muet est écarté', Boolean(announced) && !h.some((x) => x.title === '4 → 2'));
  check('le mot du prof s\'affiche sur la case', /drop 2/.test(announced.detail));
  check('la case dit qu\'il l\'annonce', announced.said === true && h.filter((x) => x !== announced).every((x) => !x.said));
  check('les cases restent dans l\'ordre du tuto', h.every((x, i, a) => i === 0 || a[i - 1].start <= x.start));
}
{
  // Mesuré sur « Drop 2 » : « 1 → 5 » en direct puis « 1 → 5 » par un accord de passage faisaient
  // DEUX cases pour un seul enseignement. Une case par mouvement, qui porte tous ses gestes et joue
  // son passage le plus riche.
  const g = { parts: [part(false)], movements: [
    mv('a', '1', '5', ['direct'], [[20, 25]]),
    mv('b', '1', '5', ['passing', 'chromatic'], [[80, 85]], [{ name: 'Gb' }]),
  ] };
  const h = buildHighlights(g);
  check('un mouvement, une seule case, quel que soit le geste', h.length === 1 && h[0].title === '1 → 5');
  check('la case porte tous ses gestes et compte tous ses passages', /chromatique/.test(h[0].detail) && /2 fois/.test(h[0].detail));
  check('elle rejoue le passage le plus instructif', h[0].play.start === 80);
}
{
  // [Claude] — 2026-10-16 — Une case DÉCRIT EXACTEMENT ce qu'elle rejoue. Mesuré sur « Drop 2 » : la
  // case « 1 → 5 · drop 2 · avec accord de passage » rejouait un enchaînement direct (le seul passage
  // avec accord de passage est cinq minutes plus loin, et le prof n'y dit pas « drop 2 »).
  const direct = mv('d', '1', '5', ['direct'], [[113, 116, ['drop 2']], [249, 252, ['drop 2']]], [], { degrees: 2, pair: true, terms: ['drop 2'] });
  const passing = mv('p', '1', '5', ['passing'], [[286, 290, []]], [{ name: 'Gb' }], { degrees: 2, pair: true, terms: [] });
  const h = buildHighlights({ parts: [part(false)], movements: [direct, passing] });
  const c = h[0];
  // Le passage avec accord de passage est le plus instructif (8 contre 7,5) : c'est lui qui est joué…
  check('la case rejoue le passage le plus instructif', c.play.start === 286);
  // … et la case ne dit QUE ce qu'on y entend : ni « drop 2 » (dit ailleurs), ni les gestes d'un autre passage.
  check('… et ne décrit que celui-là : son accord de passage, pas le « drop 2 » dit ailleurs',
    /accord de passage/.test(c.detail) && !/drop 2/.test(c.detail) && c.terms.length === 0);
  // Même scénario, mais sans accord de passage : c'est alors le passage direct où il dit « drop 2 ».
  const solo = buildHighlights({ parts: [part(false)], movements: [direct] })[0];
  check('sans autre candidat, la case décrit le passage direct et le mot du prof dit à cet endroit',
    solo.play.start === 113 && /drop 2/.test(solo.detail) && !/accord de passage/.test(solo.detail));
  check('elle dit combien de fois le tuto le montre, à part', /montré 3 fois/.test(c.detail));
  check('elle porte ce qu\'elle affirme (pour le contrôle de cohérence)', c.claims.movementId === 'p' && c.claims.from === '1' && c.claims.to === '5');
}
{
  check('sans guide : rien', buildHighlights(null).length === 0);
  check('plusieurs tonalités : dit combien', /en 2 tonalités/.test(buildHighlights({ parts: [part(), part(true, { rootPc: 0, minor: false })], movements: [] })[0].detail));
  check('deux parties dans la MÊME tonalité ne font pas deux tonalités', !/tonalités/.test(buildHighlights({ parts: [part(), part()], movements: [] })[0].detail));
  const hl = [{ id: 'a', start: 10, end: 20 }, { id: 'b', start: 100, end: 110 }];
  check('la case où en est la vidéo', highlightAt(hl, 15) === 'a' && highlightAt(hl, 105) === 'b' && highlightAt(hl, 60) === null);
}

console.log(`\n${pass} réussis, ${fail} échoués`);
if (fail) process.exit(1);
