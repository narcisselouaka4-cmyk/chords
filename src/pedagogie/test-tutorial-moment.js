// [Claude] — 2026-10-03 — Pédagogie IA : le « moment » dont parle le pianiste
// (tutorial-moment.js) et les questions toutes prêtes du Copilote
// (tutorial-questions.js). Sans DOM.
import {
  passageWindow, chordsInWindow, momentContext, linkClockTimes, clock, DEFAULT_PASSAGE_SECONDS,
} from './tutorial-moment.js';
import {
  applyQuestion, otherKeyQuestion, keyIdFrom, keyLabel, TUTORIAL_QUICK_ACTIONS, TUTORIAL_PROGRESSIONS,
} from './tutorial-questions.js';
import { tutorialMomentLines } from './copilot-client.js';

let passed = 0;
let failed = 0;
function check(label, cond, detail = '') {
  if (cond) { passed += 1; console.log(`  ✅ ${label}`); } else { failed += 1; console.error(`  ❌ ${label}${detail ? ` — ${detail}` : ''}`); }
}

console.log('Le passage désigné par « ici »');
check('20 s par défaut avant l\'instant de la vidéo', DEFAULT_PASSAGE_SECONDS === 20 && JSON.stringify(passageWindow(102)) === JSON.stringify({ start: 82, end: 102, now: 102, chosen: false }));
check('début de vidéo : le passage commence à 0', passageWindow(7)?.start === 0 && passageWindow(7)?.end === 7);
check('vidéo pas encore lancée : pas de moment', passageWindow(0) === null && passageWindow(NaN) === null);
check('durée choisie (10 s)', passageWindow(60, { length: 10 })?.start === 50);
check('la plage choisie (Début / Fin) l\'emporte', JSON.stringify(passageWindow(5, { fixed: { start: 40, end: 52 } })) === JSON.stringify({ start: 40, end: 52, now: 40, chosen: true }));
check('l\'ancien nom (boucle A-B) reste accepté', passageWindow(5, { loop: { start: 40, end: 52 } })?.chosen === true);
check('une plage trop courte est ignorée', passageWindow(30, { fixed: { start: 10, end: 10.2 } })?.chosen === false);
check('une plage de 10 min (Amazing Grace 9:57 → 10:57, et plus) est gardée', JSON.stringify(passageWindow(700, { fixed: { start: 597, end: 1197 }, duration: 1200 })) === JSON.stringify({ start: 597, end: 1197, now: 700, chosen: true }));
check('jamais au-delà de la fin de la vidéo', passageWindow(400, { duration: 300 })?.end === 300);

const chords = [
  { start: 0, end: 4, label: 'C' }, { start: 4, end: 8, label: 'Am7' }, { start: 8, end: 12, label: 'Dm9' }, { start: 12, end: 16, label: 'G13' },
];
check('accords du passage : ceux qui sonnent, même en partie', chordsInWindow(chords, 6, 13).map((c) => c.label).join(' ') === 'Am7 Dm9 G13');

const notes = [
  { midi: 50, start: 8.0, end: 11.8, hand: 'lh' }, { midi: 65, start: 8.02, end: 11.8, hand: 'rh' }, { midi: 69, start: 8.03, end: 11.8, hand: 'rh' },
  { midi: 72, start: 8.04, end: 11.8, hand: 'rh' }, { midi: 76, start: 8.04, end: 11.8, hand: 'rh' },
  { midi: 43, start: 12.0, end: 15.8, hand: 'lh' }, { midi: 71, start: 12.02, end: 15.8, hand: 'rh' },
  { midi: 40, start: 2.0, end: 3.0, hand: 'lh' },
];
const moment = momentContext({ now: 16, length: 10, chords, noteEvents: notes, transcript: [{ start: 9, text: 'Ici je pose le Dm9.' }, { start: 1, text: 'Bonjour.' }] });
check('moment : bornes, accords et notes du passage', moment && moment.start === 6 && moment.end === 16 && moment.noteCount === 7
  && moment.chords.map((c) => c.label).join(' ') === 'Am7 Dm9 G13', JSON.stringify(moment && { s: moment.start, e: moment.end, n: moment.noteCount }));
check('moment : frise main gauche | main droite du passage', moment.timeline.some((l) => /Dm9 : Ré3 \| Fa4 La4 Do5 Mi5/.test(l)), moment.timeline.join(' / '));
check('moment : seule la parole du passage', moment.transcript.length === 1 && /Dm9/.test(moment.transcript[0].text));
check('pas de moment avant la lecture', momentContext({ now: 0, chords, noteEvents: notes }) === null);

const lines = tutorialMomentLines(moment).join('\n');
check('contexte du Copilote : « ici » = le passage, avec ses bornes pour les outils',
  /« Ici »[^\n]*le passage de 0:06 à 0:16 \(start 6 s, end 16 s/.test(lines) && /Accords du passage : 0:04 Am7 · 0:08 Dm9 · 0:12 G13/.test(lines), lines);
check('contexte du Copilote : la parole est présentée comme un indice', /transcription automatique, parfois fausse/.test(lines));

// [Claude] — 2026-10-03 — Une plage choisie de 10 min (Narcisse : « une minute, c'est trop court ») :
// le Copilote sait qu'elle est choisie, et une longue plage reste lisible (60 accords, 80 phrases).
const manyChords = Array.from({ length: 100 }, (_, i) => ({ start: i * 6, end: i * 6 + 6, label: i % 2 ? 'G7' : 'Cmaj7' }));
const manyLines = Array.from({ length: 100 }, (_, i) => ({ start: i * 6 + 1, text: `Phrase ${i + 1}.` }));
const long = momentContext({ now: 30, fixed: { start: 0, end: 600 }, duration: 754, chords: manyChords, transcript: manyLines });
check('plage de 10 min : 60 accords et 80 phrases au plus, le reste compté',
  long.chosen === true && long.chords.length === 60 && long.chordsMore === 40 && long.transcript.length === 80 && long.transcriptMore === 20,
  JSON.stringify({ chosen: long.chosen, c: long.chords.length, cm: long.chordsMore, t: long.transcript.length, tm: long.transcriptMore }));
const longLines = tutorialMomentLines(long).join('\n');
check('contexte du Copilote : « le passage qu\'il a choisi », et ce qui n\'est pas détaillé est dit',
  /= le passage qu'il a choisi \(Début \/ Fin\) de 0:00 à 10:00/.test(longLines) && /· … \(40 de plus\)/.test(longLines)
  && /… \(20 phrases de plus, non détaillées/.test(longLines), longLines.slice(0, 400));

console.log('Moments cliquables');
const linked = linkClockTimes('À 1:31, puis de 0:42 → 1:05,4. Ratio 4-5-1, accord C7.', { maxSeconds: 120 });
check('« 1:31 » devient un bouton qui place la vidéo à 91 s', linked.includes('data-seconds="91"') && linked.includes('>1:31</button>'));
check('décimale gardée (« 1:05,4 » → 65,4 s)', linked.includes('data-seconds="65.4"'));
check('les degrés et les accords restent du texte', linked.includes('4-5-1') && linked.includes('C7') && (linked.match(/copilot-time/g) || []).length === 3);
check('un moment après la fin de la vidéo reste du texte', !linkClockTimes('à 9:59', { maxSeconds: 120 }).includes('button'));
check('horloge m:ss', clock(65.9) === '1:05' && clock(0) === '0:00');

console.log('Questions toutes prêtes');
check('quatre propositions : deux directes, deux avec un choix', TUTORIAL_QUICK_ACTIONS.length === 4
  && TUTORIAL_QUICK_ACTIONS.filter((a) => a.message).length === 2 && TUTORIAL_QUICK_ACTIONS.filter((a) => a.chooser).length === 2);
// [Claude] — 2026-10-04 — Ce qui est écrit part (choix de Narcisse) : une étiquette directe
// envoie son propre texte, rien de caché.
check('ce qui est écrit part : « Explique ce passage », « Rejoue ce passage »',
  TUTORIAL_QUICK_ACTIONS.filter((a) => a.message).every((a) => a.message === `${a.label}.`)
  && TUTORIAL_QUICK_ACTIONS.map((a) => a.label).join(' | ') === 'Explique ce passage | Rejoue ce passage | Rejoue-le en… | Applique-le à…',
  TUTORIAL_QUICK_ACTIONS.map((a) => `${a.label} → ${a.message || a.chooser}`).join(' / '));
check('la progression de Narcisse est proposée en premier', TUTORIAL_PROGRESSIONS[0] === '4-5-3-6-2-5-1');
check('« Applique… » : quoi, progression en degrés, tonalité en français',
  applyQuestion({ kind: 'voicing', progression: '4-5-3-6-2-5-1', key: 'F#' }) === 'Applique ses voicings à 4-5-3-6-2-5-1 en Fa♯.');
check('« Applique… » à une progression tapée en accords : pas de tonalité ajoutée',
  applyQuestion({ kind: 'lick', progression: 'Fmaj7 E7 Am7 D9', key: 'C' }) === 'Applique son lick à Fmaj7 E7 Am7 D9.');
check('« Applique… » : ses accords de passage', applyQuestion({ kind: 'enchainement', progression: '2-5-1', key: 'F' }) === 'Applique ses accords de passage à 2-5-1 en Fa.');
check('« Rejoue-le en… » en français', otherKeyQuestion('Bb') === 'Rejoue ce passage en Si♭.');
check('tonalité détectée → tonalité de la liste', keyIdFrom('G major') === 'G' && keyIdFrom('C#') === 'Db' && keyIdFrom('Sol mineur') === 'G' && keyIdFrom('') === null);
check('nom français', keyLabel('Eb') === 'Mi♭' && keyLabel('Fa♯') === 'Fa♯');

console.log(`\n=== Résultat : ${passed}/${passed + failed} contrôles passés ===`);
if (failed) process.exit(1);
