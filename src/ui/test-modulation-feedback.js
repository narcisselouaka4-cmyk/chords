import test from 'node:test';
import assert from 'node:assert/strict';
import { createModulationFeedback, isModulation, tonalIdentity } from './components/modulation-feedback.js';
import { harmonicContextAt } from '../analyzer/principal-chords.js';

function fixture() {
  const classes = new Set(), region = { dataset: {}, classList: { add: (s) => classes.add(s), remove: (s) => classes.delete(s) } };
  return { feedback: createModulationFeedback({ region }), region, classes };
}
const contexts = [
  { start: 0, end: 60, key: 'D', mode: 'major', color: 0 },
  { start: 60, end: 120, key: 'E', mode: 'major', color: 1 },
  { start: 120, end: 180, key: 'F', mode: 'major', color: 2 },
  { start: 180, end: 240, key: 'G', mode: 'major', color: 3 },
  { start: 240, end: 300, key: 'A', mode: 'major', color: 4 },
];
test('encre : seuil exact, quatre changements, pause et retour à la tonalité initiale', () => {
  const { feedback, region, classes } = fixture();
  const update = (time) => feedback.update(harmonicContextAt(contexts, time));
  assert.equal(update(0), false); assert.equal(update(59.999), false);
  assert.equal(classes.size, 0);
  assert.equal(update(60), true); assert.equal(region.dataset.harmonicTone, '1');
  assert(classes.has('has-key-transition'));
  assert.equal(update(60), false); assert.equal(update(61), false);
  for (const time of [120, 180, 240]) assert.equal(update(time), true);
  assert.equal(update(59), true); assert.equal(region.dataset.harmonicTone, '0');
});
test('encre : variations de boucle, enharmonie et langue ne constituent pas une modulation', () => {
  const { feedback, classes } = fixture();
  feedback.update({ key: 'C#', mode: 'minor', color: 0 });
  assert.equal(feedback.update({ key: 'Dbm', color: 0, chords: ['Dbm', 'Ab'] }), false);
  assert.equal(classes.size, 0);
  assert.equal(isModulation({ key: 'C#', mode: 'minor' }, { key: 'Dbm' }), false);
  assert.equal(tonalIdentity({ key: 'F#m', mode: 'major' }), '6:minor');
  assert.equal(isModulation({ key: 'C' }, { key: 'Cm' }), true);
});
test('encre : arrivée directe sans effet, saut de régions, puis remise à zéro', () => {
  const { feedback, region, classes } = fixture();
  feedback.update(contexts[2]); assert.equal(classes.size, 0); assert.equal(region.dataset.harmonicTone, '2');
  feedback.update(contexts[4]); assert(classes.has('has-key-transition'));
  feedback.reset(); assert.equal(classes.size, 0); assert.equal(region.dataset.harmonicTone, undefined);
  feedback.update(contexts[0]); assert.equal(classes.size, 0);
});
test('encre : panneau masqué = état de couleur directement à jour', () => {
  const { feedback, region, classes } = fixture();
  feedback.update(contexts[0]); feedback.update(contexts[1], { animate: false });
  assert.equal(classes.size, 0); assert.equal(region.dataset.harmonicTone, '1');
});
test('encre : tonalité absente ou invalide, aucune preuve de modulation', () => {
  const { feedback, region, classes } = fixture();
  feedback.update(contexts[0]); feedback.update({ key: null });
  assert.equal(region.dataset.harmonicTone, undefined); assert.equal(classes.size, 0);
  feedback.update(contexts[1]); assert.equal(classes.size, 0);
  assert.equal(isModulation({ key: '?' }, contexts[1]), false);
});
