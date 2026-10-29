import test from 'node:test';
import assert from 'node:assert/strict';
import { buildChordScore, scoreVoicing } from './chord-score-model.js';
import { buildMusicalGrid } from '../../analyzer/musical-grid.js';
import { formatMusicChord, formatMusicNote, canonicalChordInput } from '../music-notation.js';

const latin = { latin: true, spelling: 'auto' }, english = { latin: false, spelling: 'auto' };
test('notation : seules fondamentale et basse changent, extensions conservées, saisie latine réversible', () => {
  assert.equal(formatMusicChord('F#m7/C#', latin), 'Fa♯m7/Do♯');
  assert.equal(formatMusicChord('Bb7b9/D', latin), 'Si♭7b9/Ré');
  assert.equal(formatMusicChord('C7#11', latin), 'Do7#11');
  assert.equal(formatMusicChord('F#m7/C#', english), 'F♯m7/C♯');
  assert.equal(formatMusicNote('Bb3', latin), 'Si♭3');
  assert.equal(formatMusicChord('G#maj7', { ...latin, spelling: 'flats' }), 'La♭maj7');
  for (const symbol of ['F#m7/C#', 'Bb7b9/D', 'C7#11', 'Am', 'N']) assert.equal(canonicalChordInput(formatMusicChord(symbol, latin)), symbol);
});
test('portée : orthographe fonctionnelle, basse slash, extensions et doubles altérations', () => {
  assert.deepEqual(scoreVoicing('C#m').treble.map((n) => n.name), ['C#', 'E', 'G#']);
  assert.deepEqual(scoreVoicing('C#').treble.map((n) => n.name), ['C#', 'E#', 'G#']);
  assert.equal(scoreVoicing('C7#9').treble.at(-1).name, 'D#');
  assert.equal(scoreVoicing('Cdim7').treble.at(-1).name, 'Bbb');
  assert.equal(scoreVoicing('D/F#').bass[0].name, 'F#');
  assert.equal(scoreVoicing('Db/C').bass[0].octave, 2);
  assert.equal(scoreVoicing('Cunknown').unsupported, true);
  assert.equal(scoreVoicing('N').silence, true);
});
test('portée : tenues liées entre mesures et systèmes, couverture des temps, source intacte', () => {
  const analysis = { tempo: 120, duration: 12, chords: [
    { chord: 'C', startTime: 0, endTime: 10, segmentId: 'held' },
    { chord: 'N', startTime: 10, endTime: 12, segmentId: 'silence' },
  ] };
  const before = JSON.stringify(analysis), grid = buildMusicalGrid(analysis), score = buildChordScore(grid);
  assert.equal(score.length, 6);
  assert.deepEqual(score.slice(0, 5).map((b) => b.events[0].duration), ['1', '1', '1', '1', '1']);
  assert.deepEqual(score.slice(0, 5).map((b) => b.events[0].tiePrevious), [false, true, true, true, true]);
  assert(score.slice(0, 5).every((b) => b.events[0].segmentId === 'held'));
  assert.equal(score.at(-1).events[0].voicing.silence, true);
  assert.equal(score.at(-1).events[0].tiePrevious, false);
  assert.equal(JSON.stringify(analysis), before);
});
test('portée : une syncope se divise sans changer sa durée, 6/8 et levée restent exacts', () => {
  for (const settings of [{ beatsPerBar: 4, beatUnit: 4, phase: 1 }, { beatsPerBar: 6, beatUnit: 8 }]) {
    const grid = buildMusicalGrid({ tempo: 120, duration: 10, chords: [{ chord: 'Fm7', startTime: 0, endTime: 10, segmentId: 'a' }] }, { settings });
    const score = buildChordScore(grid);
    for (const bar of score) {
      assert.equal(bar.events.reduce((sum, e) => sum + grid.settings.beatUnit / Number(e.duration), 0), bar.to - bar.from);
      assert(bar.events.every((e) => e.from >= bar.from && e.to <= bar.to));
    }
    assert.equal(score.at(-1).events.at(-1).endTime, 10);
  }
});
