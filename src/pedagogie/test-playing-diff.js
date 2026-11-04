import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { comparedTakeExample, playingChangesAt } from './playing-diff.js';
import { applyTakeEdit } from './take-edit.js';
import { personalPlayingAnswer, refreshPlayingResult } from './playing-advice.js';
import { takeExample } from './take-attachment.js';
import { createPlayingHighlights } from '../ui/playing-highlights.js';
import { lightKeyElement, unlightKeyElement } from '../ui/key-colors.js';
import { createDemoPlayer } from '../exercise-demo-player.js';

let count = 0;
function check(name, fn) { fn(); count++; console.log(`✓ ${name}`); }
const note = (n, start, end, channel = 0) => [{ type: 'note_on', note: n, time: start, velocity: .7, channel }, { type: 'note_off', note: n, time: end, channel }];
const take = { duration: 5, events: [...note(60, 0, 1), ...note(60, 3, 4), ...note(67, 0, 1)].sort((a,b) => a.time-b.time) };
const on = take.events.findIndex((e) => e.note === 60 && e.time === 0);
const compare = (edit) => comparedTakeExample(take, applyTakeEdit(take, edit));
check('La comparaison ne change aucun événement joué ni la source', () => {
  const before = JSON.stringify(take);
  const changed = applyTakeEdit(take, { type: 'add', on, note: 64 });
  assert.deepEqual(comparedTakeExample(take, changed).events, takeExample(changed).events);
  assert.equal(JSON.stringify(take), before);
  assert.equal(comparedTakeExample(take, take).comparison.changes.length, 0);
});
check('Un ajout ne colore que son occurrence et sa durée', () => {
  const example = compare({ type: 'add', on, note: 64 });
  assert.deepEqual([...playingChangesAt(example.comparison, .5).changed], [64]);
  assert.equal(playingChangesAt(example.comparison, 1).changed.size, 0);
  assert.equal(playingChangesAt(example.comparison, 3.5).changed.size, 0);
});
check('Remplacement : nouvelle note distinguée et ancienne occurrence identifiée', () => {
  const c = compare({ type: 'replace', on, note: 64 }).comparison;
  const at = playingChangesAt(c, .5);
  assert.deepEqual([...at.changed], [64]); assert.deepEqual([...at.removed], [60]);
  assert.equal(playingChangesAt(c, 3.5).removed.size, 0);
});
check('Retrait : le MIDI reste muet et le repère dure uniquement au bon endroit', () => {
  const e = compare({ type: 'remove', on });
  assert(!e.events.some((n) => n.type === 'noteOn' && n.note === 60 && n.time === 0));
  assert.deepEqual([...playingChangesAt(e.comparison, .5).removed], [60]);
  assert.equal(playingChangesAt(e.comparison, 3.5).removed.size, 0);
});
check('Un relâchement écourté montre la modification puis la partie retirée', () => {
  const changed = structuredClone(take);
  changed.events.find((e) => e.type === 'note_off' && e.note === 60 && e.time === 1).time = .6;
  const c = comparedTakeExample(take, changed).comparison;
  assert.deepEqual([...playingChangesAt(c, .4).changed], [60]);
  assert.deepEqual([...playingChangesAt(c, .8).removed], [60]);
  assert.equal(playingChangesAt(c, 1).removed.size, 0);
});
check('Les canaux et les répétitions ne sont pas confondus', () => {
  const t = { duration: 3, events: [...note(60, 0, 1, 1), ...note(60, 0, 1, 2)] };
  const changed = { ...t, events: t.events.filter((e) => e.channel === 1) };
  assert.equal(comparedTakeExample(t, changed).comparison.changes.length, 1);
});
check('La pédale prolonge le jaune, jusqu’à sa levée ou la prochaine attaque', () => {
  const t = { ...take, events: [...take.events, { type: 'control', controller: 64, value: 127, time: .5 }, { type: 'control', controller: 64, value: 0, time: 4.5 }].sort((a,b) => a.time-b.time) };
  const changed = { ...t, events: [...t.events, ...note(64, 0, 1), ...note(64, 3, 4)].sort((a,b) => a.time-b.time) };
  const c = comparedTakeExample(t, changed).comparison;
  assert(playingChangesAt(c, 2).changed.has(64));
  assert.equal(playingChangesAt(c, 2, { pedal: false }).changed.size, 0);
  assert.equal(c.changes[0].sustainedEnd, 3);
  assert.equal(playingChangesAt(c, 4.5).changed.size, 0);
});
const real = JSON.parse(readFileSync(new URL('./fixtures/copilot-arpeggiated-take.json', import.meta.url)));
check('Le plan réel marque chaque ajout et les deux relâchements ajustés', () => {
  const result = personalPlayingAnswer({ message: 'Ajoute des mouvements ou des accords enrichis à ma progression et fais-moi directement une démonstration', context: { playing: { passage: real } } });
  const c = result.toolResult.example.comparison;
  assert(c.changes.filter((s) => s.kind === 'added').length >= 10);
  assert.equal(c.changes.filter((s) => s.kind === 'modified').length, 2);
  assert.equal(c.changes.filter((s) => s.kind === 'removed').length, 2);
  const saved = structuredClone(result.toolResult);
  delete saved.example.comparison;
  const migrated = refreshPlayingResult(saved);
  assert.deepEqual(migrated.example.comparison, c);
  assert(!saved.example.comparison);
  const more = personalPlayingAnswer({ message: "c'est tout ? tu peut rien ajouter de plus ?", messages: [{ role: 'assistant', ...result }], context: { playing: { passage: real } } });
  assert(more.toolResult.example.comparison.changes.length > c.changes.length);
  assert.deepEqual(JSON.parse(JSON.stringify(migrated.example)).comparison, c);
});

// Lecteur réel et touches factices : déplacements et pauses passent par les
// mêmes callbacks que main.js ; aucun évènement sonore n'est ajouté au diff.
const keys = new Map([60, 64, 67].map((n) => {
  const classes = new Set(['note']);
  return [n, { dataset: { midi: String(n) }, classes, classList: { add: (...s) => s.forEach((c) => classes.add(c)), remove: (...s) => s.forEach((c) => classes.delete(c)), contains: (s) => classes.has(s), toggle: (s, yes) => yes ? classes.add(s) : classes.delete(s) } }];
}));
const root = { querySelectorAll: (selector) => [...keys.values()].filter((k) => selector === '.note' || ['is-copilot-source', 'is-copilot-change'].some((c) => k.classes.has(c))) };
const highlights = createPlayingHighlights(root);
let player;
const example = compare({ type: 'replace', on, note: 64 });
const sends = [];
player = createDemoPlayer({ send(type, n) {
  sends.push([type,n]);
  if (type === 'noteOn' || type === 'show') lightKeyElement(keys.get(n), true);
  else if (type === 'noteOff' || type === 'hide') unlightKeyElement(keys.get(n));
}, onEnd: () => highlights.clear(), setTimer: () => 1, clearTimer: () => {}, now: () => 0 });
function sync() { highlights.show(example.comparison, player.position()); }
check('Pause, déplacement et retour : distinction source/ajout sans faire sonner une note retirée', () => {
  player.play(example, { tempo: 60 }); player.pause(); player.seek(.5); sync();
  assert(keys.get(64).classes.has('is-copilot-change'));
  assert(keys.get(67).classes.has('is-copilot-source'));
  assert(!keys.get(60).classes.has('active'));
  assert(!sends.some(([t,n]) => t === 'noteOn' && n === 60));
  player.seek(3.5); sync();
  assert(!keys.get(64).classes.has('is-copilot-change'));
  assert(!keys.get(60).classes.has('is-copilot-removed'));
  assert(keys.get(60).classes.has('is-copilot-source'));
  player.seek(.5); player.setRate(.5); sync();
  assert(keys.get(64).classes.has('is-copilot-change'));
  player.resume(); sync(); assert(keys.get(64).classes.has('is-copilot-change'));
  player.stop(); assert([...keys.values()].every((k) => ![...k.classes].some((c) => c.startsWith('is-copilot-'))));
});
check('Le jeu personnel et la lecture originale ne gardent aucun jaune de comparaison', () => {
  keys.get(64).classList.add('is-copilot-change');
  lightKeyElement(keys.get(64), false);
  assert(!keys.get(64).classes.has('is-copilot-change'));
  highlights.show(example.comparison, .5); highlights.show(undefined, .5);
  assert([...keys.values()].every((k) => ![...k.classes].some((c) => c.startsWith('is-copilot-'))));
});
console.log(`${count}/${count} vérifications réussies`);
