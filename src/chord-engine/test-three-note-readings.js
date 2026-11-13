import assert from 'node:assert/strict';
import test from 'node:test';
import { detectChord, chordReadings } from './index.js';
import { deriveChordDisplay, resolveCanonicalChordDefinition } from './chord-display.js';
import { jazzChordName } from './naming.js';
import { describeLiveReading } from '../ui/live-reading.js';
import { buildAnalysisMidiEvents } from '../analyzer/analysis-export.js';

const liveChord = (notes) => detectChord(notes, { allowRootless: false });
const pcs = (notes) => [...new Set(notes.map((n) => ((n % 12) + 12) % 12))].sort((a, b) => a - b);
const chordPcs = (result) => pcs(result.intervals
  .filter((i) => !(result.missing || []).includes(i))
  .map((i) => result.rootPc + i));
const plainName = (result, latin = false) => jazzChordName(result, latin).replace(/<[^>]+>/g, '');
const invert = (notes, n) => [...notes.slice(n), ...notes.slice(0, n).map((m) => m + 12)];

test('Ré–Mi–Si : Mi7 sans tierce / Ré, mêmes notes, vraie basse et renversement', () => {
  const notes = [62, 64, 71];
  const result = liveChord(notes);
  assert.equal(result.rootPc, 4);
  assert.equal(result.symbol, '7(no3)');
  assert.equal(result.bassPc, 2);
  assert.equal(result.inversion, 3);
  assert.equal(result.isSlash, true);
  assert.equal(result.rootless, false);
  assert.deepEqual(result.missing, [4]);
  assert.deepEqual(chordPcs(result), pcs(notes));
  assert.equal(plainName(result), 'E7(no3)/D');
  assert.equal(plainName(result, true), 'Mi7(no3)/Ré');
  const view = describeLiveReading(notes, result, true);
  assert.equal(view.root, 'Mi');
  assert.equal(view.bass, 'Ré4');
  assert.equal(view.quality, 'septième sans tierce');
  assert.equal(view.position, '3e renversement');
  assert.equal(view.intervals, '1 · 5 · ♭7');
  assert.equal(view.titleIsChord, true);
});

test('les septièmes sans tierce dans douze tons, trois basses, registres et doublures', () => {
  for (const [symbol, seventh] of [['7(no3)', 10], ['maj7(no3)', 11]]) {
    for (let root = 0; root < 12; root++) {
      for (const register of [36, 60]) {
        const closed = [0, 7, seventh].map((n) => register + root + n);
        for (let inversion = 0; inversion < 3; inversion++) {
          const notes = invert(closed, inversion);
          for (const played of [notes, [...notes, notes[0] + 24]]) {
            const input = [...played].reverse();
            const snapshot = [...input];
            const result = liveChord(input);
            assert.equal(result.rootPc, root, `${symbol} root ${root}`);
            assert.equal(result.symbol, symbol);
            assert.equal(result.bassPc, notes[0] % 12);
            assert.equal(result.inversion, [0, 2, 3][inversion]);
            assert.deepEqual(chordPcs(result), pcs(played));
            assert.deepEqual(input, snapshot);
            assert(chordReadings(played, { includeRootless: false }).some((r) => r.rootPc === root && r.symbol === symbol));
          }
        }
      }
    }
  }
});

test('ajouter une tierce nomme le véritable accord complet, sans conserver no3', () => {
  for (let root = 0; root < 12; root++) {
    for (const [symbol, third, seventh] of [['7', 4, 10], ['m7', 3, 10], ['maj7', 4, 11], ['mMaj7', 3, 11]]) {
      const notes = [0, third, 7, seventh].map((n) => 48 + root + n);
      const result = liveChord(notes);
      assert.equal(result.rootPc, root);
      assert.equal(result.symbol, symbol);
    }
  }
});

test('triades majeure, mineure, diminuée, augmentée et suspendues dans les douze tons', () => {
  for (const intervals of [[0, 4, 7], [0, 3, 7], [0, 3, 6], [0, 4, 8], [0, 2, 7], [0, 5, 7]]) {
    for (let root = 0; root < 12; root++) {
      const notes = intervals.map((n) => 48 + root + n);
      for (let inversion = 0; inversion < 3; inversion++) {
        const played = invert(notes, inversion);
        const result = liveChord(played);
        assert.notEqual(result.symbol, '?');
        assert(!result.symbol.includes('no3'));
        assert.deepEqual(chordPcs(result), pcs(played));
      }
    }
  }
});

test('triades mineures et diminuées renversées : la triade complète prime sur une sixième incomplète', () => {
  for (const [symbol, fifth] of [['m', 7], ['dim', 6]]) {
    for (let root = 0; root < 12; root++) {
      const notes = [0, 3, fifth].map((n) => 48 + root + n);
      for (let inversion = 0; inversion < 3; inversion++) {
        const played = invert(notes, inversion);
        const result = liveChord(played);
        assert.equal(result.rootPc, root);
        assert.equal(result.symbol, symbol);
        assert.deepEqual(result.missing, []);
        const first = chordReadings(played, { includeRootless: false })[0];
        assert.equal(first.rootPc, root);
        assert.equal(first.symbol, symbol);
      }
    }
  }
});

test('les 220 groupes de trois classes de notes ont une lecture utile et honnête', () => {
  let combinations = 0;
  let named = 0;
  let described = 0;
  for (let a = 0; a < 10; a++) for (let b = a + 1; b < 11; b++) for (let c = b + 1; c < 12; c++) {
    combinations++;
    const notes = [a, b, c].map((n) => 48 + n);
    for (let bass = 0; bass < 3; bass++) {
      const played = invert(notes, bass);
      const result = liveChord(played);
      for (const latin of [false, true]) {
        const view = describeLiveReading(played, result, latin);
        assert.notEqual(view.quality, 'non identifié', played.join());
        assert.notEqual(view.intervals, '—');
        assert.equal(view.wheel.active.size, 3);
        if (result.symbol === '?') {
          assert.equal(view.titleIsChord, false);
          assert.equal(view.quality, 'groupe de trois notes');
          assert.equal(view.root, '—');
          assert.equal(view.wheel.rootPc, null);
          assert.equal(view.also.length, 0);
          assert.equal(view.wheel.names.size, 3);
          described++;
        } else {
          assert.equal(view.titleIsChord, true);
          assert(pcs(played).includes(result.rootPc));
          assert.equal(result.rootless, false);
          assert.deepEqual(chordPcs(result), pcs(played));
          named++;
        }
      }
    }
  }
  assert.equal(combinations, 220);
  assert(named > 0 && described > 0, 'descriptions distinctes des noms d’accords');
});

test('reconstruction/export : ne pas réinventer une tierce ou remplacer par une triade majeure', () => {
  for (const [symbol, seventh] of [['7(no3)', 10], ['maj7(no3)', 11]]) {
    assert.deepEqual(resolveCanonicalChordDefinition(symbol).intervals, [0, 7, seventh]);
    const display = deriveChordDisplay(`E${symbol}/D`);
    assert.deepEqual(display.chordTonePcs, pcs([4, 11, 4 + seventh]));
    assert(!display.chordTonePcs.includes(8)); // Pas de Sol♯ ajouté.
    assert(!display.chordTonePcs.includes(7)); // Pas de Sol ajouté.
  }
  const events = buildAnalysisMidiEvents({ chords: [{ chord: 'E7(no3)/D', startTime: 0, endTime: 1 }] }, { includeBass: false });
  assert.deepEqual(pcs(events[0].events.filter((e) => e.type === 'note_on').map((e) => e.note)), [2, 4, 11]);
});

test('notes seules, intervalles, amas plus grands et groupes espacés restent distincts', () => {
  for (const [notes, quality] of [[[60], 'note seule'], [[60, 72], 'octaves'], [[60, 64], 'intervalle']]) {
    assert.equal(describeLiveReading(notes, liveChord(notes)).quality, quality);
  }
  const unknown = liveChord([60, 61, 62]);
  assert.equal(unknown.symbol, '?'); // Ne pas nommer faussement un accord.
  const spaced = describeLiveReading([60, 73, 86, 84], liveChord([60, 73, 86, 84]));
  assert.equal(spaced.quality, 'groupe de trois notes');
  assert.equal(spaced.intervals, 'Neuvième mineure · Seconde majeure (+2 oct.)');
  const larger = describeLiveReading([60, 61, 62, 68], liveChord([60, 61, 62, 68]));
  assert.equal(larger.quality, 'non identifié');
});
