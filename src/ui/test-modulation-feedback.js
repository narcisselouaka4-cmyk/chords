import test from 'node:test';
import assert from 'node:assert/strict';
import { createModulationFeedback, isModulation, tonalIdentity } from './components/modulation-feedback.js';
import { harmonicContextAt } from '../analyzer/principal-chords.js';

function fixture(reduced = false) {
  const played = [], region = { dataset: {} }, badge = { hidden: true, textContent: '' };
  const host = { animate: (frames, options) => {
    const animation = { frames, options, cancelled: false, cancel() { this.cancelled = true; } };
    played.push(animation); return animation;
  } };
  badge.animate = host.animate;
  const feedback = createModulationFeedback({ host, region, badge, describeKey: (key, mode) => `${key} ${mode}`, reducedMotion: () => reduced });
  return { feedback, played, region, badge };
}
const contexts = [
  { start: 0, end: 60, key: 'D', mode: 'major', color: 0, chords: ['D', 'G', 'A'] },
  { start: 60, end: 120, key: 'E', mode: 'major', color: 1, chords: ['E', 'A', 'B'] },
  { start: 120, end: 180, key: 'F', mode: 'major', color: 2, chords: ['F', 'Bb', 'C'] },
  { start: 180, end: 240, key: 'G', mode: 'major', color: 3, chords: ['G', 'C', 'D'] },
  { start: 240, end: 300, key: 'A', mode: 'major', color: 4, chords: ['A', 'D', 'E'] },
];
test('modulation : déclenchement au seuil exact, quatre changements, pause et retour arrière', () => {
  const { feedback, played, region, badge } = fixture();
  const update = (time) => {
    const context = harmonicContextAt(contexts, time), i = contexts.indexOf(context);
    return feedback.update(context, { modulated: i > 0 && isModulation(contexts[i - 1], context) });
  };
  update(0); update(59.999); assert.equal(played.length, 0); assert.equal(badge.hidden, true);
  assert.equal(update(60), true); assert.equal(region.dataset.harmonicTone, '1');
  assert.equal(badge.textContent, 'Modulation · E major');
  update(60); update(61); assert.equal(played.length, 2); // une respiration + son libellé, pas de répétition.
  update(120); update(180); update(240); assert.equal(played.length, 8);
  update(59); assert.equal(region.dataset.harmonicTone, '0'); assert.equal(badge.hidden, true);
  assert(played[6].cancelled); assert(played[7].cancelled);
});
test('modulation : ni variations de boucle, ni enharmonie, ni changement de langue ne clignotent', () => {
  const { feedback, played, badge } = fixture();
  feedback.update({ key: 'C#', mode: 'minor', color: 0 });
  feedback.update({ key: 'Dbm', mode: 'minor', color: 0, chords: ['Dbm', 'Ab'] });
  assert.equal(played.length, 0);
  assert.equal(isModulation({ key: 'C#', mode: 'minor' }, { key: 'Dbm' }), false);
  assert.equal(tonalIdentity({ key: 'F#m', mode: 'major' }), '6:minor');
  assert.equal(isModulation({ key: 'C' }, { key: 'Cm' }), true);
  feedback.update({ key: 'Dbm', color: 0 }, { modulated: true });
  assert.equal(badge.hidden, false); assert.equal(played.length, 0);
});
test('modulation : arrivée directe, saut de plusieurs régions et remise à zéro', () => {
  const { feedback, played, region, badge } = fixture();
  feedback.update(contexts[2], { modulated: true }); // ouverture déjà à deux minutes : état, sans faux effet.
  assert.equal(played.length, 0); assert.equal(region.dataset.harmonicTone, '2');
  feedback.update(contexts[4], { modulated: true }); assert.equal(played.length, 2);
  feedback.reset(); assert.equal(badge.hidden, true); assert.equal(region.dataset.harmonicTone, undefined);
  feedback.update(contexts[0]); assert.equal(played.length, 2);
});
test('modulation : mouvement réduit ou panneau masqué = couleur/texte sans animation', () => {
  for (const reduced of [true, false]) {
    const { feedback, played, region, badge } = fixture(reduced);
    feedback.update(contexts[0]);
    feedback.update(contexts[1], { modulated: true, animate: reduced });
    assert.equal(played.length, 0); assert.equal(region.dataset.harmonicTone, '1');
    assert.equal(badge.hidden, false);
  }
});
test('modulation : une tonalité absente ou invalide ne constitue pas une preuve de changement', () => {
  const { feedback, played, region, badge } = fixture();
  feedback.update(contexts[0]); feedback.update({ key: null });
  assert.equal(region.dataset.harmonicTone, undefined); assert.equal(badge.hidden, true);
  feedback.update(contexts[1]); assert.equal(played.length, 0);
  assert.equal(isModulation({ key: '?' }, contexts[1]), false);
});
