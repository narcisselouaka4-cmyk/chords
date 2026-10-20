import assert from 'node:assert/strict';
import { Note } from '@tonaljs/tonal';
import { buildScaleNotes, resolveScaleRequest, scaleTheoryAnswer, SCALE_DEFINITIONS } from './copilot-scale.js';

let passed = 0;
function test(name, fn) { fn(); passed++; console.log(`PASS ${name}`); }
const eb = { tonic: 'Eb', scale: 'minorPentatonic', direction: 'both' };

test('la question exacte de la vidéo est comprise', () => {
  assert.deepEqual(resolveScaleRequest("c'est quoi la gamme pentatonique mineur de Eb ?"), eb);
  assert.deepEqual(resolveScaleRequest('Joue la gamme pentatonique mineure de Mi♭'), eb);
  assert.deepEqual(resolveScaleRequest('Play Eb minor pentatonic scale'), eb);
});
test('Mi bémol : cinq notes correctement nommées, une octave aller-retour', () => {
  const result = buildScaleNotes(eb);
  assert.deepEqual(result.names, ['Mib', 'Solb', 'Lab', 'Sib', 'Réb']);
  assert.deepEqual(result.notes.map((note) => note.midi), [63, 66, 68, 70, 73, 75, 73, 70, 68, 66, 63]);
  assert(result.notes.every((note, i) => note.durationMs > 0 && (i === 0 || note.startOffsetMs > result.notes[i - 1].startOffsetMs)));
});
test('cette gamme et joue-la reprennent la tonique, pas le pronom « la »', () => {
  const history = [{ role: 'user', content: 'Explique la gamme pentatonique mineure de Eb' }];
  assert.deepEqual(resolveScaleRequest('joue moi cette gamme', history), eb);
  assert.deepEqual(resolveScaleRequest('joue-la', history), eb);
  history.push({ role: 'assistant', content: 'Voici la gamme Mib — pentatonique mineure : Mib – Solb – Lab – Sib – Réb.' });
  assert.deepEqual(resolveScaleRequest('Fais-le-moi entendre', history), eb);
  assert.deepEqual(resolveScaleRequest('Joue cette gamme', [{ role: 'assistant', content: 'La gamme Mib — pentatonique mineure contient Mib – Solb – Lab – Sib – Réb. Tu peux me demander de la jouer.' }]), eb);
});
test('une nouvelle tonalité explicite remplace celle de la conversation', () => {
  assert.equal(resolveScaleRequest('Et en Fa ?', [{ role: 'user', content: 'gamme pentatonique mineure de Eb' }]).tonic, 'F');
});
test('après comparaison, « cette gamme » suit la dernière demande, pas la dernière note citée', () => {
  const history = [
    { role: 'user', content: 'gamme pentatonique mineure de Eb' },
    { role: 'user', content: 'Quelle différence avec la gamme blues de Mib ?' },
    { role: 'assistant', content: 'Mib — pentatonique mineure : Mib – Solb – Lab – Sib – Réb. Mib — blues mineure : Mib – Solb – Lab – La – Sib – Réb.' },
  ];
  assert.deepEqual(resolveScaleRequest('Joue cette gamme', history), { tonic: 'Eb', scale: 'minorBlues', direction: 'both' });
});
test('sans gamme ou tonique connue, ne rien inventer', () => {
  assert.equal(resolveScaleRequest('joue moi cette gamme'), null);
  assert.equal(resolveScaleRequest('joue une gamme pentatonique'), null);
  assert.equal(resolveScaleRequest("c'est quoi une gamme majeure dans de la musique ?"), null);
  assert.equal(resolveScaleRequest('Explique Cmaj7'), null);
  assert.equal(resolveScaleRequest('Joue un lick sur la gamme pentatonique mineure de Eb'), null);
  assert.equal(buildScaleNotes({ tonic: 'X', scale: 'major' }), null);
  assert.equal(buildScaleNotes({ tonic: 'Eb', scale: 'inconnue' }), null);
});
test('définition : vrais intervalles de la pentatonique, pas ceux inventés par le modèle', () => {
  const answer = scaleTheoryAnswer("c'est quoi la gamme pentatonique mineure de Eb ?");
  assert(answer.includes('Mib – Solb – Lab – Sib – Réb'));
  assert(answer.includes('3 – 2 – 2 – 3 – 2 demi-tons'));
});
test('blues de Mib : la blue note est La, pas Ré naturel', () => {
  const scale = buildScaleNotes({ tonic: 'Eb', scale: 'minorBlues' });
  assert.deepEqual(scale.names, ['Mib', 'Solb', 'Lab', 'La', 'Sib', 'Réb']);
  const answer = scaleTheoryAnswer('Quelle différence avec la gamme blues de Mib ? Explique sans jouer.', [{ role: 'user', content: 'gamme pentatonique mineure de Eb' }]);
  assert(answer.includes('ajoute **La**'));
  assert(!answer.includes('Ré♮'));
});
test('descente et main gauche respectent le choix demandé', () => {
  const result = buildScaleNotes({ ...eb, direction: 'down', hand: 'LH' });
  assert.deepEqual(result.notes.map((n) => n.midi), [63, 61, 58, 56, 54, 51]);
  assert(result.notes.every((n) => n.hand === 'LH'));
});
for (const tonic of ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B']) {
  for (const [scale, definition] of Object.entries(SCALE_DEFINITIONS)) {
    test(`${tonic} ${scale} : intervalles et retour exacts`, () => {
      const result = buildScaleNotes({ tonic, scale });
      assert.equal(result.names.length, definition.intervals.length);
      const up = result.notes.slice(0, definition.intervals.length + 1);
      assert.deepEqual(up.map((n) => n.midi - up[0].midi), definition.intervals.map((interval) => Note.get(Note.transpose('C4', interval)).midi - 60).concat(12));
      assert.equal(result.notes.at(-1).midi, result.notes[0].midi);
      assert(result.notes.every((n) => n.midi >= 21 && n.midi <= 108));
    });
  }
}
console.log(`\n${passed} tests de gammes passés`);
