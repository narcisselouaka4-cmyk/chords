// [Claude] — 2026-10-02 — « Lecture en direct » du Temps réel (live-reading.js) : ce que
// la roue et les lectures affichent, sans DOM.
import { detectChord } from '../chord-engine/index.js';
import {
  intervalName, qualityLabel, intervalDegrees, positionLabel, readingName, describeLiveReading,
} from './live-reading.js';

let passed = 0;
let failed = 0;
function check(label, cond, detail = '') {
  if (cond) { passed += 1; console.log(`  ✅ ${label}`); } else { failed += 1; console.error(`  ❌ ${label}${detail ? ` — ${detail}` : ''}`); }
}
const view = (notes, latin = false) => describeLiveReading(notes, detectChord(notes), latin);

console.log('Intervalles (deux notes)');
check('3 → Tierce mineure, 7 → Quinte juste, 6 → Triton', intervalName(3) === 'Tierce mineure' && intervalName(7) === 'Quinte juste' && intervalName(6) === 'Triton');
check('12 → Octave, 16 → Dixième majeure, 21 → Treizième majeure', intervalName(12) === 'Octave' && intervalName(16) === 'Dixième majeure' && intervalName(21) === 'Treizième majeure');
check('au-delà de deux octaves : intervalle simple + octaves', intervalName(28) === 'Tierce majeure (+2 oct.)');

console.log('Qualités en français');
check('majeur, mineur, dominante 7, majeur 7', qualityLabel('') === 'majeur' && qualityLabel('m') === 'mineur' && qualityLabel('7') === 'dominante 7' && qualityLabel('maj7') === 'majeur 7');
check('demi-diminué, diminué 7, mineur 7', qualityLabel('m7b5') === 'demi-diminué (ø7)' && qualityLabel('dim7') === 'diminué 7' && qualityLabel('m7') === 'mineur 7');
check('dominante 13, dominante 7♯9♭13, majeur 7♯11', qualityLabel('13') === 'dominante 13' && qualityLabel('7#9b13') === 'dominante 7♯9♭13' && qualityLabel('maj7#11') === 'majeur 7♯11');
check('non identifié', qualityLabel('?') === 'non identifié');

console.log('Degrés (ordre d\'empilement jazz)');
check('Cmaj7 : 1 · 3 · 5 · 7', intervalDegrees([48, 52, 55, 59], 0, 'maj7').join(' · ') === '1 · 3 · 5 · 7');
check('C13 (Do Si♭ Mi La) : 1 · 3 · ♭7 · 13', intervalDegrees([48, 58, 64, 69], 0, '13').join(' · ') === '1 · 3 · ♭7 · 13');
check('C7♯9 : la ♯9 reste ♯9', intervalDegrees([48, 52, 58, 63], 0, '7#9').join(' · ') === '1 · 3 · ♭7 · ♯9');
check('Cm7♭5 : 1 · ♭3 · ♭5 · ♭7', intervalDegrees([48, 51, 54, 58], 0, 'm7b5').join(' · ') === '1 · ♭3 · ♭5 · ♭7');
check('C6 : 6 (pas 13, pas de septième)', intervalDegrees([48, 52, 55, 57], 0, '6').join(' · ') === '1 · 3 · 5 · 6');
check('Csus4 : 4', intervalDegrees([48, 53, 55], 0, 'sus4').join(' · ') === '1 · 4 · 5');

console.log('Position de la basse');
check('fondamentale', positionLabel(detectChord([48, 52, 55, 58]), [48, 52, 55, 58]) === 'position fondamentale');
check('C7/E : 1er renversement', positionLabel(detectChord([52, 55, 58, 60]), [52, 55, 58, 60]) === '1er renversement');
check('C7/G : 2e renversement', positionLabel(detectChord([55, 58, 60, 64]), [55, 58, 60, 64]) === '2e renversement');
check('C7/B♭ : 3e renversement', positionLabel(detectChord([58, 60, 64, 67]), [58, 60, 64, 67]) === '3e renversement');

console.log('La lecture complète');
let v = view([60]);
check('une note : « C4 », note seule', v.title === 'C4' && v.quality === 'note seule' && !v.titleIsChord);
v = view([60, 63]);
check('deux notes : l\'intervalle, pas un faux accord', v.title === 'Tierce mineure' && v.quality === 'intervalle' && v.intervals === '1 · ♭3');
v = view([48, 60]);
check('deux Do : « C (octaves) »', v.title === 'C (octaves)');
v = view([60, 61, 62]);
check('amas : les notes, « non identifié »', v.title === 'C · D♭ · D' && v.quality === 'non identifié');
v = view([46, 50, 53, 56]);
check('B♭7 : fondamentale B♭, basse B♭2, position fondamentale', v.titleIsChord && v.root === 'B♭' && v.bass === 'B♭2' && v.position === 'position fondamentale', JSON.stringify(v));
check('B♭7 : plus de lignes MIDI ni Fréquence (retirées le 02/10)', !('midi' in v) && !('frequency' in v));
check('B♭7 : la roue marque la fondamentale et la basse', v.wheel.rootPc === 10 && v.wheel.bassPc === 10 && v.wheel.active.size === 4);
v = view([46, 50, 53, 56], true);
check('latin : Si♭, Si♭2', v.root === 'Si♭' && v.bass === 'Si♭2');
v = view([48, 52, 58, 63]);
check('C7♯9 : la roue écrit D♯ (pas E♭)', v.wheel.names.get(3) === 'D♯');
v = view([48, 51, 55, 58]);
check('Cm7 : la roue écrit E♭, « Aussi » E♭6/C', v.wheel.names.get(3) === 'E♭' && v.also.includes('E♭6/C'), JSON.stringify(v.also));
v = view([48, 52, 55, 57]);
check('C6 : « Aussi » Am7/C', v.also.includes('Am7/C'));
v = view([48, 52, 55, 59, 62, 54]);
check('le voicing joué est nommé', v.voicing && v.voicing !== '—', v.voicing);
check('readingName : sans fondamentale', readingName({ rootPc: 7, symbol: '13', bassPc: 5, isSlash: true, rootless: true }) === 'G13 sans fondamentale');
v = describeLiveReading([], null);
check('repos : « — » (plus « en attente »), roue vide', v.quality === '—' && v.count === 0 && v.wheel.active.size === 0);

console.log(`\n=== Résultat : ${passed}/${passed + failed} contrôles passés ===`);
if (failed) process.exit(1);
