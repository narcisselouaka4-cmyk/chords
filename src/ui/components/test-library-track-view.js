import assert from 'node:assert/strict';
import { libraryTrackLabel } from './library-track-view.js';

assert.deepEqual(libraryTrackLabel({ name: 'Nous élevons Ton nom.mp3', duration: 347 }), {
  original: 'Nous élevons Ton nom.mp3', title: 'Nous élevons Ton nom', format: 'MP3', duration: '05:47',
});
assert.equal(libraryTrackLabel({ name: 'Amazing.Grace.mp3' }).title, 'Amazing.Grace');
assert.equal(libraryTrackLabel({ name: 'Une prise', sourcePath: '/music/prise.flac' }).format, 'FLAC');
assert.equal(libraryTrackLabel({ name: 'Prise', format: '<img onerror=alert(1)>' }).format, '');
for (const duration of [undefined, null, '', 0, -20, Infinity, 'inconnu']) {
  assert.equal(libraryTrackLabel({ name: 'Prise', duration }).duration, '');
}
assert.equal(libraryTrackLabel({}, 'track-123').title, 'track-123');
assert.equal(libraryTrackLabel({ name: 'Titre sans extension' }).format, '');
assert.equal(libraryTrackLabel({ name: 'Version.final' }).title, 'Version.final');
assert.equal(libraryTrackLabel({ name: 'Version.final' }).format, '');
console.log('15 contrôles de présentation des morceaux réussis.');
