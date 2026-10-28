import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { principalChords, buildHarmonicContexts, harmonicContextAt } from './principal-chords.js';

const grid = (symbols, start = 0, step = 2) => symbols.map((chord, i) => ({
  chord, startTime: start + i * step, endTime: start + (i + 1) * step,
}));
const repeat = (symbols, n) => Array.from({ length: n }, () => symbols).flat();
let passed = 0;
function check(name, fn) { fn(); passed++; console.log(`✓ ${name}`); }

check('L’ordre musical prévaut sur la fréquence ou la durée des accords', () => {
  assert.deepEqual(principalChords(grid(repeat(['D', 'E', 'F#m'], 8))), ['D', 'E', 'F#m']);
});
check('Substitutions ponctuelles : le fil Ré / Mi / Fa♯m est conservé', () => {
  assert.deepEqual(principalChords(grid(['D', 'E', 'F#m', 'Bm7', 'E', 'F#m', 'D', 'C#m', 'F#m', ...repeat(['D', 'E', 'F#m'], 4)])), ['D', 'E', 'F#m']);
});
check('Approches et dominantes brèves ne deviennent pas des piliers', () => {
  const chords = grid(repeat(['D', 'E', 'F#m'], 8));
  chords[7].endTime -= 0.5;
  chords.splice(8, 0, { chord: 'C#7', startTime: 15.5, endTime: 16 });
  assert.deepEqual(principalChords(chords), ['D', 'E', 'F#m']);
});
check('Une progression de huit accords reste possible', () => {
  const pattern = ['C', 'Am', 'Dm', 'G', 'Em', 'A7', 'Dm', 'G7'];
  const result = principalChords(grid(repeat(pattern, 4)));
  assert.ok(result.length >= 6, result.join(' '));
});
check('Pas de boucle fabriquée sur trois accords entendus une seule fois', () => {
  assert.deepEqual(principalChords(grid(['D', 'E', 'F#m'])), []);
  assert.deepEqual(principalChords([]), []);
});
check('Une seule harmonie tenue et les silences restent traitables', () => {
  assert.deepEqual(principalChords(grid(['N', 'F#m', 'F#m'])), ['F#m']);
  assert.deepEqual(principalChords(grid(['N'])), []);
});
check('La qualité mineure ne se confond pas avec la majeure', () => {
  assert.deepEqual(principalChords(grid(repeat(['A', 'Am', 'D', 'E'], 4))), ['A', 'Am', 'D', 'E']);
});
check('Les corrections manuelles alimentent le résumé sans modifier la source', () => {
  const chords = grid(repeat(['D', 'Em', 'F#m'], 4)).map((c) => ({ ...c, manualOverride: c.chord === 'Em' ? { root: 4, quality: '', bass: null } : null }));
  const before = JSON.stringify(chords);
  assert.deepEqual(principalChords(chords), ['D', 'E', 'F#m']);
  assert.equal(JSON.stringify(chords), before);
});
check('Quatre modulations : frontières exactes, retours arrière et sauts directs', () => {
  const patterns = [['D', 'E', 'F#m'], ['Eb', 'F', 'Gm'], ['E', 'F#', 'G#m'], ['F', 'G', 'Am'], ['D', 'E', 'F#m']];
  const keys = ['A', 'Bb', 'B', 'C', 'A'];
  const analysis = { key: 'A', keyMode: 'major', duration: 120,
    keys: keys.map((key, i) => ({ key, mode: 'major', start: i * 24, end: (i + 1) * 24 })),
    chords: patterns.flatMap((p, i) => grid(repeat(p, 4), i * 24)) };
  const before = JSON.stringify(analysis);
  const contexts = buildHarmonicContexts(analysis);
  assert.equal(contexts.length, 5);
  for (let i = 0; i < 5; i++) {
    assert.equal(harmonicContextAt(contexts, i * 24).key, keys[i]);
    assert.deepEqual(contexts[i].chords, patterns[i]);
    if (i) assert.equal(harmonicContextAt(contexts, i * 24 - 0.001).key, keys[i - 1]);
  }
  assert.equal(harmonicContextAt(contexts, 119).color, contexts[0].color);
  assert.equal(harmonicContextAt(contexts, 2).key, 'A');
  assert.equal(harmonicContextAt(contexts, 80).key, 'C');
  assert.equal(JSON.stringify(analysis), before);
});
check('Anciens projets sans tonalités locales, départ retardé et entrées invalides', () => {
  assert.equal(buildHarmonicContexts({ key: 'A', duration: 10 })[0].key, 'A');
  const contexts = buildHarmonicContexts({ key: 'A', duration: 20, keys: [{ key: 'B', start: 10 }, { key: 'C', start: NaN }] });
  assert.equal(harmonicContextAt(contexts, -5).key, 'A');
  assert.equal(harmonicContextAt(contexts, 10).key, 'B');
  assert.equal(harmonicContextAt([], 10), null);
});
check('La même progression 1 / 4 / 5 survit aux montées d’un et deux demi-tons', () => {
  const patterns = [['C', 'F', 'G'], ['Db', 'Gb', 'Ab'], ['Eb', 'Ab', 'Bb']];
  const analysis = { key: 'C', keyMode: 'major', duration: 72,
    chords: patterns.flatMap((p, i) => grid(repeat(p, 4), i * 24)) };
  const contexts = buildHarmonicContexts(analysis);
  assert.deepEqual(contexts.map((r) => r.key), ['C', 'Db', 'Eb']);
  assert.deepEqual(contexts.map((r) => r.chords), patterns);
  assert.deepEqual(contexts.map((r) => r.start), [0, 24, 48]);
  assert.ok(contexts.every((r) => r.basis === 'transposed-progression'));
});
check('Une gamme mineure transposée garde sa famille et son cadre', () => {
  const patterns = [['Am', 'Dm', 'E7'], ['Bbm', 'Ebm', 'F7'], ['Cm', 'Fm', 'G7']];
  const contexts = buildHarmonicContexts({ key: 'Am', keyMode: 'minor', duration: 72,
    chords: patterns.flatMap((p, i) => grid(repeat(p, 4), i * 24)) });
  assert.deepEqual(contexts.map((r) => r.key), ['Am', 'Bbm', 'Cm']);
  assert.ok(contexts.every((r) => r.mode === 'minor'));
  assert.deepEqual(contexts.map((r) => r.chords), patterns);
});
check('Un accord étranger et une dominante secondaire ne suffisent pas à moduler', () => {
  const chords = grid([...repeat(['C', 'Am', 'F', 'G'], 3), 'E7', 'Am', ...repeat(['C', 'Am', 'F', 'G'], 3)]);
  const contexts = buildHarmonicContexts({ key: 'C', keyMode: 'major', duration: chords.at(-1).endTime, chords });
  assert.equal(contexts.length, 1);
  assert.equal(contexts[0].key, 'C');
  assert.equal(contexts[0].basis, undefined);
});
check('Deux passages différents ne deviennent pas une boucle par le seul changement de gamme', () => {
  const chords = grid([...repeat(['C', 'F', 'G'], 5), ...repeat(['E', 'C#m', 'A', 'F#m', 'B'], 3)]);
  const contexts = buildHarmonicContexts({ key: 'C', keyMode: 'major', duration: chords.at(-1).endTime, chords });
  assert.ok(contexts.every((r) => r.basis !== 'transposed-progression'));
});
check('Descentes et retour à la tonalité initiale sans dates de modulation fournies', () => {
  const patterns = [['C', 'F', 'G'], ['B', 'E', 'F#'], ['A', 'D', 'E'], ['C', 'F', 'G']];
  const contexts = buildHarmonicContexts({ key: 'C', keyMode: 'major', duration: 96,
    chords: patterns.flatMap((p, i) => grid(repeat(p, 4), i * 24)) });
  assert.deepEqual(contexts.map((r) => r.key), ['C', 'B', 'A', 'C']);
  assert.deepEqual(contexts.map((r) => r.chords), patterns);
  assert.equal(contexts.at(-1).color, contexts[0].color);
});
check('La tonalité connue reste prioritaire dans une ambiguïté majeure / relative mineure', () => {
  const patterns = [['D', 'E', 'F#m'], ['Eb', 'F', 'Gm'], ['F', 'G', 'Am']];
  const contexts = buildHarmonicContexts({ key: 'A', keyMode: 'major', duration: 72,
    chords: patterns.flatMap((p, i) => grid(repeat(p, 4), i * 24)) });
  assert.deepEqual(contexts.map((r) => r.key), ['A', 'Bb', 'C']);
  assert.deepEqual(contexts.map((r) => r.chords), patterns);
});
check('Sanogo : quatre cadres et même motif en degrés, malgré trois régions de cache erronées', () => {
  const analysis = JSON.parse(readFileSync(new URL('./fixtures/sanogo-transposed-chords.json', import.meta.url)));
  const before = JSON.stringify(analysis);
  const contexts = buildHarmonicContexts(analysis);
  assert.deepEqual(contexts.map((r) => [r.start, r.key]), [[0, 'D'], [83.17, 'E'], [121.44, 'F#'], [158.66, 'Ab']]);
  const expected = [
    ['D', 'A', 'Bm', 'D', 'G', 'D', 'Bm', 'Em', 'A'],
    ['E', 'B', 'C#m', 'E', 'A', 'E', 'C#m', 'F#m7', 'B'],
    ['F#', 'C#', 'D#m', 'F#', 'B', 'F#', 'D#m', 'G#m', 'C#'],
    ['Ab', 'Eb', 'Fm', 'Ab', 'Db', 'Ab', 'Fm', 'Bbm', 'Eb'],
  ];
  assert.deepEqual(contexts.map((r) => r.chords), expected);
  for (let i = 1; i < contexts.length; i++) {
    assert.equal(harmonicContextAt(contexts, contexts[i].start - 0.001), contexts[i - 1]);
    assert.equal(harmonicContextAt(contexts, contexts[i].start), contexts[i]);
  }
  assert.equal(harmonicContextAt(contexts, 190).key, 'Ab');
  assert.equal(harmonicContextAt(contexts, 15).key, 'D');
  assert.equal(JSON.stringify(analysis), before);
});
console.log(`${passed} scénarios réussis.`);
