// Tests — l'accompagnement du Copilote repris du jeu des pianistes relevés (13/11/2026).
// Narcisse, à la question « je m'appuie sur quoi pour aller plus loin sur le jeu gospel ? » :
// « Mes tutoriels ». Ce qui se vérifie sans oreille : seuls les relevés d'église et sûrs servent ;
// les notes rejouées sont bien celles du pianiste, transposées ; un passage n'est repris tel quel
// que si la suite demandée est la sienne ; les mains restent jouables ; rien n'est repris dans le
// doute. La qualité musicale reste à écouter.
//
// Les relevés sont fabriqués ici : aucun fichier de Narcisse n'est lu.
//
// Usage : node src/pedagogie/test-tutorial-comping.js

import assert from 'node:assert/strict';
import { buildExampleChords, buildChordExample } from './copilot-demo.js';
import { buildGospelComping } from './gospel-comping.js';
import { tutorialGestures, buildTutorialComping, shapeOf, labelKind, isChurchTutorial, trustOf, shortTitle } from './tutorial-comping.js';
import { tutorialItem, uniqueTutorials } from './library-combine.js';

let passed = 0;
let failed = 0;
function check(name, fn) {
  try { fn(); passed += 1; console.log(`✓ ${name}`); } catch (err) { failed += 1; console.error(`✗ ${name}\n  ${err.message}`); }
}
const pc = (n) => ((n % 12) + 12) % 12;

// ── Un relevé fabriqué ────────────────────────────────────────────────────
// Chaque ligne : [début, nom, [[décalage, durée, ...notes]]]. La pulsation : deux secondes par accord.
function tutorial(title, lines, { revision = 7, soundChecked = true } = {}) {
  const notes = [];
  const segments = [];
  lines.forEach(([start, label, attacks], i) => {
    segments.push({ start, end: lines[i + 1] ? lines[i + 1][0] : start + 2, label });
    for (const [offset, duration, ...midis] of attacks) for (const midi of midis) notes.push({ midi, start: start + offset, end: start + offset + duration, hand: null, velocity: 0.4 });
  });
  return { id: `tuto-${title}`, title, key: 'C', duration: lines.at(-1)[0] + 2, notes, segments, revision, soundChecked, savedAt: '' };
}

// Un pianiste gospel, en Do : I (qui bouge), vi (posé, Am9), ii (posé), puis V7 → ♭II7 → I
// (substitution tritonique, accord de passage d'une demi-seconde), IV posé, et une ligne douteuse.
const GOSPEL = tutorial('Gospel Piano Lesson', [
  [0, 'Cadd9', [[0, 1.8, 36, 55, 60, 62, 64], [1, 0.4, 67], [1.5, 0.4, 64]]],
  [2, 'Am9', [[0, 1.9, 45, 55, 59, 60, 64]]],
  [4, 'Dm9', [[0, 1.9, 38, 53, 57, 60, 64]]],
  [6, 'G13', [[0, 1.4, 43, 53, 59, 64]]],
  [7.5, 'Db7', [[0, 0.4, 37, 53, 59, 63]]],
  [8, 'Cmaj9', [[0, 1.9, 36, 52, 55, 59, 62]]],
  [10, 'Fadd9', [[0, 1.9, 41, 55, 57, 60]]],
  // Renversement (la basse n'est pas la fondamentale) : Do/Mi.
  [12, 'C/E', [[0, 1.9, 40, 55, 60, 64]]],
  // Deux touches voisines tenues (Mi–Fa sur un Sol) : lecture douteuse.
  [14, 'G13', [[0, 1.9, 43, 59, 64, 65]]],
  // La basse arrive après la main droite.
  [16, 'C', [[0, 1.9, 48, 55, 60, 64], [0.8, 1, 33]]],
  [18, 'C', [[0, 1.9, 36, 55, 60, 64]]],
]);
const chordsOf = (names) => buildExampleChords(names, { technique: 'auto' });
const noteOns = (r) => r.events.filter((e) => e.type === 'noteOn');
const inBar = (r, i) => noteOns(r).filter((e) => e.time >= i * 4 - 0.001 && e.time < (i + 1) * 4 - 0.001);
const signature = (r) => JSON.stringify(r.events.filter((e) => e.type !== 'step').map((e) => [e.time, e.type, e.note]));

check('Les gestes d’un relevé : la basse donne la fondamentale, l’accord de passage rattache deux accords posés', () => {
  const gestures = tutorialGestures(GOSPEL);
  const at = (t) => gestures.find((g) => Math.abs(g.at - t) < 0.01);
  assert.equal(at(0).rootPc, 0);
  assert.ok(at(0).moves, 'le premier accord bouge (deux notes ajoutées)');
  assert.ok(!at(2).moves, 'La mineur est simplement posé');
  assert.equal(at(6).rootPc, 7);
  assert.equal(at(6).linked.interval, 5, 'Sol → Do : une quarte au-dessus');
  assert.equal(at(6).linked.changes.length, 1, 'un accord de passage entre les deux');
  assert.deepEqual(at(6).linked.passing, ['Db7']);
  assert.ok(!at(7.5), 'l’accord de passage n’est pas un geste à lui seul');
});

check('Dans le doute, le geste n’est pas repris : renversement lu comme autre accord, demi-ton voisin, basse tardive', () => {
  const gestures = tutorialGestures(GOSPEL);
  const at = (t) => gestures.find((g) => Math.abs(g.at - t) < 0.01);
  assert.ok(!at(14), 'Mi–Fa tenus ensemble sur Sol');
  assert.ok(!at(16), 'basse arrivée après la main droite');
  // Do/Mi : la basse Mi donne « Mi » avec une sixte mineure — aucun accord demandé ne l'accepte.
  const taken = buildTutorialComping(chordsOf(['Em7', 'Am7', 'Em7', 'Am7']), [GOSPEL], { seed: 1 });
  assert.ok(!taken || taken.bars.every((b) => b.seconds !== 12), 'Do/Mi n’est pas repris pour un Mi mineur');
});

check('Ce que dit la grille relevée : nature de l’accord, ou rien', () => {
  assert.deepEqual(labelKind('Am9'), { rootPc: 9, kind: 'min' });
  assert.deepEqual(labelKind('C#7♯9♭13'), { rootPc: 1, kind: 'dom' });
  assert.deepEqual(labelKind('Fmaj7sus4/C'), { rootPc: 5, kind: 'sus' });
  assert.deepEqual(labelKind('Cadd9'), { rootPc: 0, kind: 'maj' });
  assert.equal(labelKind('F5'), null);
  assert.equal(labelKind('F?'), null);
  assert.equal(labelKind(null), null);
});

check('L’accord demandé : ce qu’il accepte et exige', () => {
  const [c, am7, g7, cmaj7] = chordsOf(['C', 'Am7', 'G7', 'Cmaj7']).map((x) => shapeOf(x));
  assert.equal(c.kind, 'maj');
  assert.ok(!c.allowed.has(11), 'pas de septième majeure sur un accord parfait demandé');
  assert.ok(cmaj7.allowed.has(11));
  assert.equal(am7.kind, 'min');
  assert.ok(am7.allowed.has(2) && !am7.allowed.has(4));
  assert.equal(g7.kind, 'dom');
  assert.ok(g7.allowed.has(3) && g7.allowed.has(8), 'gospel : dominante altérée admise');
  const worship = shapeOf(chordsOf(['G7'])[0], 'worship');
  assert.ok(!worship.allowed.has(3) && !worship.allowed.has(8), 'worship : la dominante reste telle qu’écrite');
});

check('Seuls les relevés d’église et sûrs servent', () => {
  assert.ok(isChurchTutorial({ title: 'Amazing Grace - Slow Gospel Blues Piano' }));
  assert.ok(isChurchTutorial({ title: 'Amazing Grace Gospel Jazz Chords' }), '« gospel » l’emporte sur « jazz »');
  assert.ok(!isChurchTutorial({ title: 'Clase 2 10 SECRETOS para improvisar en la SALSA' }));
  assert.ok(!isChurchTutorial({ title: 'McCoy Tyner Voicings' }));
  assert.equal(trustOf({ revision: 3, soundChecked: true }), 2);
  assert.equal(trustOf({ revision: 5, soundChecked: false }), 1);
  assert.equal(trustOf({ revision: 2, soundChecked: false }), 0);
  const names = ['C', 'Am7', 'Dm7', 'G7', 'C'];
  const old = { ...GOSPEL, notes: [...GOSPEL.notes], revision: 2, soundChecked: false };
  assert.equal(buildTutorialComping(chordsOf(names), [old], { seed: 1 }), null, 'lecture ancienne jamais recoupée');
  const salsa = { ...GOSPEL, notes: [...GOSPEL.notes], title: 'Montuno salsa' };
  assert.equal(buildTutorialComping(chordsOf(names), [salsa], { seed: 1 }), null, 'autre style');
  assert.equal(buildTutorialComping(chordsOf(names), [], { seed: 1 }), null);
});

check('Les notes rejouées sont celles du pianiste, transposées sur l’accord demandé', () => {
  // En Ré : I vi ii V I. Le voicing de La mineur 9 du pianiste (La2 | Sol3 Si3 Do4 Mi4) devient
  // Si mineur 9, deux demi-tons plus haut.
  const names = ['D', 'Bm7', 'Em7', 'A7', 'D'];
  const r = buildTutorialComping(chordsOf(names), [GOSPEL], { seed: 4 });
  assert.ok(r, 'une prise');
  const bm = r.bars[1];
  assert.equal(bm.source, 'Gospel Piano Lesson');
  // Deux accords mineurs chez lui : La mineur 9 (0:02) ou Ré mineur 9 (0:04).
  const his = { 2: { rh: [55, 59, 60, 64], name: 'Bm9', shift: 2 }, 4: { rh: [53, 57, 60, 64], name: 'Bm9', shift: -3 } }[bm.seconds];
  assert.ok(his, `geste pris à ${bm.seconds} s`);
  assert.equal(bm.played, his.name);
  assert.equal(bm.semitones, his.shift);
  assert.deepEqual(r.hands[1].rh, his.rh.map((n) => n + his.shift));
  const played = new Set(inBar(r, 1).filter((e) => e.hand !== 'lh').map((e) => e.note));
  for (const n of his.rh) assert.ok(played.has(n + his.shift), `note ${n + his.shift} du pianiste`);
  assert.equal(r.sources.length, 1);
});

check('Un passage est repris tel quel quand la suite demandée est celle du pianiste, accord de passage compris', () => {
  // V7 → I en Fa : Do7 → Fa. Le pianiste jouait Sol13, puis Ré♭7, puis Do : ici Do13, Fa♯7 (l'application écrit Fa♯), Fa.
  const names = ['F', 'Gm7', 'C7', 'F'];
  let seen = false;
  for (let seed = 1; seed <= 12 && !seen; seed += 1) {
    const r = buildTutorialComping(chordsOf(names), [GOSPEL], { seed });
    const c7 = r.bars[2];
    if (!c7.linked) continue;
    seen = true;
    assert.deepEqual(c7.passing, ['F#7']);
    assert.equal(c7.how, 'passage');
    // L'accord de passage (Sol♭ à la basse) arrive aux trois quarts de la mesure.
    const bass = inBar(r, 2).filter((e) => e.hand === 'lh');
    assert.equal(pc(bass[0].note), 0, 'la mesure commence sur Do');
    const passing = bass.find((e) => pc(e.note) === 6);
    assert.ok(passing && passing.time - 8 > 2.5 && passing.time - 8 < 3.5, 'Sol♭ sur le dernier temps');
  }
  assert.ok(seen, 'le passage enchaîné est choisi');
});

check('La même dominante, quand la suite n’est pas celle du pianiste : son voicing seulement, sans son accord de passage', () => {
  // Do7 → Si♭ : le pianiste, lui, allait une quarte au-dessus.
  const names = ['F', 'C7', 'Bb', 'F'];
  for (let seed = 1; seed <= 8; seed += 1) {
    const r = buildTutorialComping(chordsOf(names), [GOSPEL], { seed });
    assert.ok(r);
    assert.ok(!r.bars[1].linked && !r.bars[1].passing, `graine ${seed}`);
    assert.ok(!inBar(r, 1).some((e) => e.hand === 'lh' && pc(e.note) === 6 && r.bars[1].how === 'passage'), 'pas de Sol♭ à la basse');
  }
});

check('Un accord posé chez le pianiste est animé par l’application ; un accord qui bouge est joué comme dans la vidéo', () => {
  const r = buildTutorialComping(chordsOf(['C', 'Am7', 'Dm7', 'C']), [GOSPEL], { seed: 3 });
  assert.equal(r.bars[1].how, 'voicing');
  assert.notEqual(r.bars[1].left, 'comme dans la vidéo');
  const moving = Array.from({ length: 10 }, (_, s) => buildTutorialComping(chordsOf(['C', 'Am7', 'Dm7', 'C']), [GOSPEL], { seed: s + 1 }).bars[0]);
  assert.ok(moving.some((b) => b.how === 'passage' && b.left === 'comme dans la vidéo'), 'le Do qui bouge est repris tel quel');
  assert.match(r.gestures[0], /d’après « Gospel Piano Lesson »/);
});

check('Sans geste qui convienne : le voicing de l’application, et la carte le dit ; moins de la moitié couverte : rien', () => {
  // Mi♭ diminué : le pianiste n'en joue pas.
  const r = buildTutorialComping(chordsOf(['C', 'Ebdim7', 'Dm7', 'C']), [GOSPEL], { seed: 2 });
  assert.ok(r);
  assert.equal(r.bars[1].source, null);
  assert.ok(r.gestures.some((g) => /1 accord sur le voicing de l’application/.test(g)));
  assert.equal(buildTutorialComping(chordsOf(['Ebdim7', 'F#dim7', 'Adim7', 'C']), [GOSPEL], { seed: 2 }), null);
});

check('Mains jouables : cinq notes au plus par main, une neuvième d’écart à la main droite du voicing', () => {
  for (const names of [['C', 'Am7', 'Dm7', 'G7', 'C'], ['Ab', 'Fm7', 'Bbm7', 'Eb7', 'Ab'], ['E', 'C#m7', 'F#m7', 'B7', 'E']]) {
    for (let seed = 1; seed <= 6; seed += 1) {
      const r = buildTutorialComping(chordsOf(names), [GOSPEL], { seed, variation: seed });
      assert.ok(r, names.join(' '));
      const offs = r.events.filter((e) => e.type === 'noteOff');
      const notes = noteOns(r).map((e) => ({ ...e, end: (offs.find((o) => o.note === e.note && o.hand === e.hand && o.time > e.time) || { time: e.time + 0.1 }).time }));
      for (const n of notes) {
        const held = notes.filter((m) => m.hand === n.hand && m.time <= n.time + 0.03 && m.end > n.time + 0.25);
        assert.ok(held.length <= 5, `${names.join(' ')} : ${held.length} notes dans une main`);
        assert.ok(n.note >= 24 && n.note <= 100);
      }
      r.hands.forEach((h) => assert.ok(!h.rh.length || h.rh.at(-1) - h.rh[0] <= 14));
    }
  }
});

check('Même graine : même prise ; autre graine : autre jeu', () => {
  const names = ['C', 'Am7', 'Dm7', 'G7', 'C'];
  const a = buildTutorialComping(chordsOf(names), [GOSPEL], { seed: 9 });
  const b = buildTutorialComping(chordsOf(names), [GOSPEL], { seed: 9 });
  assert.equal(signature(a), signature(b));
  const many = new Set(Array.from({ length: 8 }, (_, s) => signature(buildTutorialComping(chordsOf(names), [GOSPEL], { seed: 100 + s * 37, variation: s }))));
  assert.ok(many.size >= 6, `${many.size} jeux différents sur 8`);
});

check('« Une autre façon » : un autre pianiste mène la prise quand il y en a plusieurs', () => {
  const other = { ...GOSPEL, id: 'tuto-autre', title: 'Worship Chords', notes: GOSPEL.notes.map((n) => ({ ...n, midi: n.midi + 2 })), segments: GOSPEL.segments.map((s) => ({ ...s })) };
  const names = ['C', 'Am7', 'Dm7', 'C'];
  const leads = new Set([0, 1].map((variation) => buildTutorialComping(chordsOf(names), [GOSPEL, other], { seed: 5, variation }).lead));
  assert.equal(leads.size, 2);
});

check('Worship : ni dominante altérée ni accord de passage d’un pianiste gospel', () => {
  for (let seed = 1; seed <= 8; seed += 1) {
    const r = buildTutorialComping(chordsOf(['F', 'Gm7', 'C7', 'F']), [GOSPEL], { seed, feel: 'worship' });
    assert.ok(r);
    assert.ok(r.bars.every((b) => !b.passing), `graine ${seed}`);
  }
});

check('Le moteur gospel accepte le voicing et le passage d’un pianiste, mesure par mesure', () => {
  const chords = chordsOf(['C', 'Am7', 'Dm7', 'G7', 'C']);
  let calls = 0;
  const overrides = [
    { voicing: { rh: [55, 60, 62, 64], root: 36 }, plan: { source: 'X', how: 'voicing' } },
    { play(score, t, v) { calls += 1; score.note(t, 45, v, 3.9, 'lh'); score.note(t, 67, v, 3.9, 'rh'); }, plan: { source: 'X', how: 'passage' } },
    null, null, null,
  ];
  for (let seed = 1; seed <= 20; seed += 1) {
    const r = buildGospelComping(chords, { seed, overrides });
    assert.deepEqual(r.hands[0].rh, [55, 60, 62, 64]);
    assert.equal(r.bars[1].left, 'comme dans la vidéo');
    assert.equal(r.bars[1].source, 'X');
    assert.equal(r.bars[0].extra === 'accord suivant anticipé', false, 'aucun accord poussé vers un passage repris tel quel');
    // Dans la mesure reprise telle quelle : seulement les deux notes fournies.
    assert.deepEqual(inBar(r, 1).map((e) => e.note).sort(), [45, 67]);
  }
  assert.equal(calls, 20);
  // Sans relevé : le moteur d'hier, inchangé.
  const plain = buildGospelComping(chords, { seed: 3 });
  const same = buildGospelComping(chords, { seed: 3, overrides: null });
  assert.equal(signature(plain), signature(same));
});

check('La carte du Copilote : d’après qui, le tempo du pianiste, et rien de changé hors gospel ou sans relevé', () => {
  const names = ['C', 'Am7', 'Dm7', 'G7', 'C'];
  const ex = buildChordExample(names, { styleId: 'gospel', variation: 0, tutorials: [GOSPEL] });
  assert.match(ex.subtitle, /^Gospel · 5 accords · d’après « Gospel Piano Lesson »/);
  assert.deepEqual(ex.comping.sources, ['Gospel Piano Lesson']);
  assert.ok(ex.tempo >= 72 && ex.tempo <= 92);
  assert.equal(ex.chords.length, 5);
  const without = buildChordExample(names, { styleId: 'gospel', variation: 0 });
  assert.ok(!/d’après/.test(without.subtitle) && !without.comping.sources);
  const jazzWith = buildChordExample(['Dm7', 'G7', 'Cmaj7'], { styleId: 'jazz', tutorials: [GOSPEL] });
  const jazz = buildChordExample(['Dm7', 'G7', 'Cmaj7'], { styleId: 'jazz' });
  assert.deepEqual(jazzWith.events, jazz.events);
  const block = buildChordExample(names, { styleId: 'gospel', pattern: 'block', tutorials: [GOSPEL] });
  assert.ok(!block.comping, 'plaqué demandé : plaqué');
});

check('Un relevé garde sa révision et son recoupement au son ; la lecture la plus récente d’une vidéo l’emporte', () => {
  const saved = (rev, count, sound) => ({ path: '/x/Amazing Grace.mp4', key: 'C', savedAt: '2026-10-0' + rev, analysis: { readingRevision: rev, ...(sound ? { soundCheck: { reliable: true } } : {}), noteEvents: Array.from({ length: count }, (_, i) => ({ midi: 60, start: i, end: i + 0.5 })), segments: [] } });
  const old = tutorialItem('aaa', saved(1, 603, false));
  const recent = tutorialItem('bbb', saved(7, 577, true));
  assert.equal(recent.revision, 7);
  assert.equal(recent.soundChecked, true);
  assert.equal(old.soundChecked, false);
  assert.equal(uniqueTutorials([old, recent])[0].id, 'tuto-bbb', 'la révision 7 plutôt que la plus riche en notes');
  assert.equal(uniqueTutorials([recent, old])[0].id, 'tuto-bbb');
});

check('Titre court pour la carte', () => {
  assert.equal(shortTitle('Yohan Kim 6-2-5 Gospel Progression (Tutorial) - Above All'), 'Yohan Kim 6-2-5 Gospel Progression');
  assert.ok(shortTitle('This Pianist Stuns Cory Henry With Nasty 7-3-6 on No Ways Tired').length <= 40);
  assert.equal(shortTitle('Amazing Grace'), 'Amazing Grace');
});

console.log(`\n=== Résultat : ${passed}/${passed + failed} tests passés ===`);
process.exit(failed ? 1 : 0);
