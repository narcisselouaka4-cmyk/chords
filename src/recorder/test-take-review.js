// [Claude] — 2026-09-25 — Tests de « Qu'en penses-tu ? » : mémoire du jeu récent
// (live-take.js), voicing reconnu (voicing-classifier.js), gammes (scales.js) et
// portrait du passage (take-review.js), sur des passages fabriqués.
//
// Lancer : node src/recorder/test-take-review.js

import { createLiveTake, extractLastPassage } from './live-take.js';
import { reviewTake, findCadences, takeContextLines, momentText } from './take-review.js';
import { classifyVoicing, splitHands } from '../voicing-engine/voicing-classifier.js';
import { extractScaleRequest, fitScales } from '../pedagogie/scales.js';

let passed = 0;
let failed = 0;
function check(name, condition, detail = '') {
  if (condition) {
    passed += 1;
    console.log(`\x1b[32m✓\x1b[0m ${name}`);
  } else {
    failed += 1;
    console.log(`\x1b[31m✗\x1b[0m ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

/** Passage fabriqué : accords tenus, lignes, pédale. */
function take() {
  const events = [];
  const api = {
    events,
    chord(t, notes, { hold = 1.8, vel = 0.7 } = {}) {
      notes.forEach((n) => {
        events.push({ type: 'note_on', note: n, velocity: vel, channel: 0, time: t });
        events.push({ type: 'note_off', note: n, velocity: 0, channel: 0, time: t + hold });
      });
      return api;
    },
    line(t, notes, step = 0.25, { hold = 0.22 } = {}) {
      notes.forEach((n, i) => {
        events.push({ type: 'note_on', note: n, velocity: 0.7, channel: 0, time: t + i * step });
        events.push({ type: 'note_off', note: n, velocity: 0, channel: 0, time: t + i * step + hold });
      });
      return api;
    },
    pedal(t, down) {
      events.push({ type: 'control', controller: 64, value: down ? 127 : 0, channel: 0, time: t });
      return api;
    },
  };
  return api;
}

function testLiveTake() {
  let now = 100;
  const live = createLiveTake({ now: () => now });
  // Premier essai, puis 4 s de silence, puis le passage qui compte.
  live.noteOn(60, 0.7, 100); live.noteOff(60, 100.5);
  live.noteOn(62, 0.7, 104.5); live.noteOn(65, 0.7, 104.5); live.noteOff(62, 105.5);
  live.sustain(true, 105.6);
  live.noteOn(67, 0.7, 106);
  now = 107;
  const p = live.lastPassage();
  check('Passage : commence après la dernière pause (recalé à 0)', p && p.events[0].time === 0 && p.events[0].note === 62, JSON.stringify(p?.events[0]));
  check('Passage : 3 attaques, la note d\'avant la pause exclue', p?.noteCount === 3 && !p.events.some((e) => e.note === 60));
  const closing = p.events.filter((e) => Math.abs(e.time - 2.5) < 1e-9);
  check('Passage : notes et pédale encore tenues relâchées au moment du clic', closing.some((e) => e.type === 'note_off' && e.note === 65) && closing.some((e) => e.type === 'note_off' && e.note === 67) && closing.some((e) => e.type === 'control' && e.value === 0), JSON.stringify(closing));
  check('Passage : durée jusqu\'au clic', Math.abs(p.duration - 2.5) < 1e-9);

  // Pause courte (1 s) : même passage.
  const short = extractLastPassage([
    { type: 'note_on', note: 60, velocity: 0.7, time: 0 }, { type: 'note_off', note: 60, time: 0.5 },
    { type: 'note_on', note: 64, velocity: 0.7, time: 1.5 }, { type: 'note_off', note: 64, time: 2 },
  ]);
  check('Pause d\'une seconde : le passage continue', short.noteCount === 2);
  // Pédale enfoncée pendant le silence : il faut deux fois plus long.
  const pedalled = extractLastPassage([
    { type: 'control', controller: 64, value: 127, time: 0 },
    { type: 'note_on', note: 60, velocity: 0.7, time: 0.1 }, { type: 'note_off', note: 60, time: 0.5 },
    { type: 'note_on', note: 64, velocity: 0.7, time: 4 }, { type: 'note_off', note: 64, time: 4.5 },
  ]);
  check('Pédale tenue pendant 3,5 s de silence : un seul passage', pedalled.noteCount === 2 && pedalled.events[0].type === 'control', JSON.stringify(pedalled.events[0]));
  // Plus de 60 s sans pause : les 60 dernières secondes.
  const long = [];
  for (let t = 0; t < 90; t += 0.5) long.push({ type: 'note_on', note: 60 + (t % 5), velocity: 0.7, time: t }, { type: 'note_off', note: 60 + (t % 5), time: t + 0.4 });
  const cut = extractLastPassage(long, { max: 60, at: 90 });
  check('Jeu continu de 90 s : 60 s gardées', cut.duration <= 60.01 && cut.duration > 59, String(cut.duration));
  check('Aucune note : pas de passage', extractLastPassage([]) === null);
  // Mémoire tournante : 90 s.
  const rolling = createLiveTake({ keepSeconds: 90, now: () => 300 });
  rolling.noteOn(60, 0.7, 10); rolling.noteOff(60, 11);
  rolling.noteOn(62, 0.7, 250); rolling.noteOff(62, 251);
  check('Mémoire : au-delà de 90 s, oublié', rolling.events().every((e) => e.time >= 160));
}

function testVoicingClassifier() {
  const t = (notes, root, q) => classifyVoicing(notes, root, q);
  check('Voicing : Ré | Fa La Do Mi = rootless A avec basse', t([38, 53, 57, 60, 64], 2, 'm9').technique === 'rootless' && /type A/.test(t([38, 53, 57, 60, 64], 2, 'm9').detail));
  check('Voicing : Fa La Si Mi sur G13 = rootless B', /type B/.test(t([53, 57, 59, 64], 7, '13').detail));
  check('Voicing : Sol3 Do4 Mi4 Si4 = drop 2 de Cmaj7', t([55, 60, 64, 71], 0, 'maj7').technique === 'drop2');
  check('Voicing : Mi3 Do4 Sol4 Si4 = drop 3', t([52, 60, 67, 71], 0, 'maj7').technique === 'drop3');
  check('Voicing : Do3 Mi3 Sib3 = shell 1-3-7', t([48, 52, 58], 0, '7').technique === 'shell' && t([48, 52, 58], 0, '7').detail === '1-3-7');
  check('Voicing : Mi La Ré Sol Si = So What', t([52, 57, 62, 67, 71], 4, 'm11').technique === 'so_what');
  check('Voicing : Mi Sib | Ré Fa# La = upper structure (triade de D)', t([52, 58, 62, 66, 69], 0, '13#11').technique === 'upper_structure');
  check('Voicing : Mi2 Mi3 | Do4 Mi4 Sol4 = triade, basse en octave', /basse en octave/.test(t([40, 52, 60, 64, 67], 0, '').detail));
  const hands = splitHands([38, 45, 53, 57, 60, 64]);
  check('Mains : Ré2 La2 | Fa3 La3 Do4 Mi4', hands.left.join(',') === '38,45' && hands.right.join(',') === '53,57,60,64', JSON.stringify(hands));
}

function testScales() {
  const q = (text) => extractScaleRequest(text);
  check('Gamme demandée : « la gamme de Ré dorien »', q("J'ai joué la gamme de Ré dorien, c'est juste ?")?.label === 'Ré dorien');
  check('Gamme demandée : « la pentatonique mineure de do » (« la » article)', q('je joue la pentatonique mineure de do')?.label === 'Do pentatonique mineure');
  check('Gamme demandée : « mixolydien de sol » (pas lydien)', q('mixolydien de sol')?.scaleId === 'mixolydian');
  check('Arpège demandé : « arpège de Dm7 »', q('arpège de Dm7 ok ?')?.chord === 'Dm7');
  check('Pas de gamme dans « un accord mineur »', q('un accord mineur') === null && q('mon voicing de Dm9 est bon ?') === null);
  const line = [62, 64, 65, 67, 69, 71, 72, 74, 72, 71, 70, 67, 65, 64, 62].map((m) => ({ pc: m, weight: 0.22 }));
  const best = fitScales(line, { tonicHints: [2] })[0];
  check('Gamme reconnue : Ré dorien malgré un Sib de passage', best?.label === 'Ré dorien' && best.outside.length === 1, JSON.stringify(best));
  const blues = fitScales([60, 63, 65, 66, 67, 70, 72].map((m) => ({ pc: m, weight: 0.3 })), { tonicHints: [0] })[0];
  check('Gamme reconnue : Do blues', blues?.label === 'Do blues', JSON.stringify(blues));
}

function testChordsReview() {
  const good = take().chord(0, [38, 53, 57, 60, 64]).chord(2, [43, 53, 57, 59, 64]).chord(4, [36, 52, 55, 59, 62], { hold: 2.5 });
  const r = reviewTake(good.events, { question: "Je joue un 2-5-1 en Do, c'est bon ?" });
  check('2-5-1 juste : verdict', r.verdict === 'II-V-I en Do majeur : les accords voulus sont là (Dm9 → G13 → Cmaj9)', r.verdict);
  check('2-5-1 juste : aucune suggestion', r.issues.length === 0, r.issues.map((i) => i.id).join(','));
  check('2-5-1 juste : degrés dans la tonalité annoncée', r.chords.map((c) => c.degree).join(' ') === 'II V I');
  const text = r.contextLines.join('\n');
  check('Portrait : notes exactes par main, voicing, rôles, conduite des voix', /0:00,0 Dm9 \[II\] · Ré2 \| Fa3 La3 Do4 Mi4 · Rootless \(type A/.test(text) && /1 b3 5 b7 9 · → Do \(7e\) descend sur Si, la 3ce de G13/.test(text), text);
  check('Portrait : points forts (accords voulus, 7e → 3ce)', /Les accords voulus sont là/.test(text) && /la 7e descend sur la 3ce/.test(text));
  check('Cadences : II-V-I en Do majeur', findCadences(r.chords)[0]?.label === 'II-V-I en Do majeur');

  const wrong = take().chord(0, [38, 53, 57, 60, 64]).chord(2, [43, 54, 57, 59, 64]).chord(4, [36, 52, 55, 59, 62], { hold: 2.5 });
  const w = reviewTake(wrong.events, { question: "Je joue un 2-5-1 en Do, c'est bon ?" });
  const issue = w.issues.find((i) => i.id === 'intent-chord');
  check('Fa# au lieu de Fa sur G7 : l\'accord en cause, la note fausse, la note manquante', issue && issue.chord === 'Gmaj13' && issue.problemNotes.join(',') === '54' && issue.missing.join(',') === '5', JSON.stringify(issue));
  // [Claude] — 2026-09-25 — Plus de marques au clavier : la suggestion est dite en mots.
  check('Suggestion : Fa3 (7e) à la place de Fa#3, en mots',
    /essaie Fa3 \(7e\) à la place de Fa#3/.test(momentText(w.moments[0])), momentText(w.moments[0]));

  const rootless = take().chord(0, [53, 57, 60, 64], { hold: 2 });
  const d = reviewTake(rootless.events, { question: 'mon voicing de Dm9 est bon ?' });
  check('Fa La Do Mi pour Dm9 : lu comme Dm9 rootless (pas « Dm9 absent »)', d.issues.length === 0 && d.chords[0].readAs === 'Dm9' && d.chords[0].voicing.technique === 'rootless', d.verdict);
  check('Dm9 rootless : rôles b3 5 b7 9', d.chords[0].roles.map((x) => x.degree).join(' ') === 'b3 5 b7 9');

  const pedal = take().pedal(0, true).chord(0, [36, 43, 52, 55, 59], { hold: 1 }).chord(2, [41, 48, 57, 60, 64], { hold: 1 }).chord(4, [43, 50, 53, 59, 65], { hold: 1 }).pedal(5.5, false);
  const p = reviewTake(pedal.events);
  check('Pédale gardée : les notes qui traînent sont repérées', p.moments[0]?.issueId === 'pedal-blur' && [...(p.moments[0].problemNotes || [])].sort((a, b) => a - b).join(',') === '43,55,59', JSON.stringify(p.moments[0]));
}

function testLinesReview() {
  const scale = take().line(0, [62, 64, 65, 67, 69, 71, 72, 74, 72, 71, 70, 67, 65, 64, 62], 0.3);
  const s = reviewTake(scale.events, { question: "J'ai joué la gamme de Ré dorien, c'est juste ?" });
  check('Ré dorien : verdict une note à rapprocher de la gamme', s.verdict === 'Ré dorien : 1 note à rapprocher de la gamme', s.verdict);
  const outside = s.issues.find((i) => i.id === 'intent-scale');
  check('Ré dorien : le Sib4, son moment et la note voisine à essayer', outside?.problemNotes.join(',') === '70' && /0:03,0 La4 à la place de Sib4/.test(outside.text), outside?.text);
  check('Rythme : écart entre attaques, sans tempo inventé', s.rhythm.every > 0.29 && s.rhythm.every < 0.31 && /une attaque toutes les 0,3 s/.test(s.contextLines.join('\n')));

  const lick = take().chord(0, [43, 53, 59], { hold: 3 }).line(0.3, [74, 75, 76, 79, 77, 76, 74], 0.33, { hold: 0.3 }).line(2.7, [71], 0.3, { hold: 0.8 });
  const l = reviewTake(lick.events, { question: 'mon lick sur G7 marche ?' });
  check('Lick sur G7 : jugé comme une ligne, pas comme un accord à jouer', /^Ligne sur G7 : 8 notes/.test(l.verdict) && !l.issues.some((i) => i.id.startsWith('intent-chord')), l.verdict);
  const roles = l.lines[0].roles.map((r) => r.kind);
  check('Lick : Mib entre Ré et Mi = passage chromatique', roles[1] === 'passing', roles.join(' '));
  const distinct = new Set(l.lines[0].roles.map((r) => r.midi));
  check('Lick : la forme de la ligne (6 notes différentes, Mib de passage)', distinct.size === 6 && l.lines[0].roles.some((r) => r.midi === 75 && r.kind === 'passing'), [...distinct].join(','));
  // Ligne jouée seule, accord seulement dans la question.
  const alone = take().line(0, [71, 74, 77, 76], 0.4);
  const a = reviewTake(alone.events, { question: 'ma phrase sur G7 est bonne ?' });
  check('Ligne seule : rôles par rapport à l\'accord de la question', a.lines[0].roles.map((r) => r.label).join(' ') === '3 5 b7 13', a.lines[0].roles.map((r) => r.label).join(' '));
}

// [Claude] — 2026-09-25 — Tonalité d'une session sans question : le II-V-I entendu la donne.
function testKeyFromCadence() {
  const s = take();
  [[38, 45, 53, 57, 60, 64], [43, 53, 57, 59, 64], [36, 40, 43, 64, 67, 71], [38, 45, 65, 69, 72, 76], [43, 53, 57, 59, 64], [36, 43, 52, 55, 59, 62]]
    .forEach((n, i) => s.chord(i * 2, n, { hold: 1.2 }));
  const r = reviewTake(s.events);
  check('Sans question : tonalité d\'après le II-V-I (Do majeur), degrés II V I', r.key?.label === 'Do majeur' && r.key.source === 'cadence' && r.chords.map((c) => c.degree).join(' ') === 'II V I II V I', `${r.key?.label} ${r.chords.map((c) => c.degree).join(' ')}`);
  check('Portrait de session : titre et 60 accords au plus', /## Portrait/.test(takeContextLines(r, { title: '## Portrait de la session', maxChords: 60 })[0]));
}

// [Claude] — 2026-09-25 — « Qu'en penses-tu ? » depuis Exercices : comparé à l'exercice.
function testExerciseExpect() {
  const expect = { chords: ['Gm9', 'C13', 'Fmaj9'], technique: null, keyPc: 5, minor: false, label: 'Mouvement 12 tons — II-V-I majeur en F majeur' };
  const two = take().chord(0, [43, 58, 62, 65, 69]).chord(2, [48, 63, 69, 70]);
  const r = reviewTake(two.events, { question: '', expect });
  const issue = r.issues.find((i) => i.id === 'intent-chord');
  check('Exercice : sans question, comparé aux accords de l\'exercice (C13 attendu, Cm13 entendu)', issue && /pour C13, j'entends Cm13/.test(issue.text) && /ajoute Mi \(3ce\)/.test(issue.text), issue?.text);
  check('Exercice : tonalité de l\'exercice, degrés', r.key?.source === 'exercice' && r.key.label === 'Fa majeur' && r.chords[0].degree === 'II' && /tonalité de l'exercice : Fa majeur/.test(r.contextLines.join('\n')), `${r.key?.label} ${r.chords.map((c) => c.degree).join(' ')}`);
  check('Exercice : ce qu\'il voulait jouer = l\'exercice', /Ce qu'il voulait jouer : exercice : Mouvement 12 tons — II-V-I majeur en F majeur/.test(r.contextLines.join('\n')));
  const one = take().chord(0, [43, 58, 62, 65, 69]);
  const r1 = reviewTake(one.events, { expect });
  check('Exercice : l\'accord en cours seul → rien à suggérer (les autres ne sont pas réclamés)', r1.issues.length === 0 && /les accords voulus sont là \(Gm9\)/.test(r1.verdict), `${r1.verdict} ${r1.issues.map((i) => i.id)}`);
  const none = take().chord(0, [40, 47, 52, 56]);
  const r0 = reviewTake(none.events, { expect });
  check('Exercice : aucun de ses accords → « je n\'entends pas ces accords »', /je n'entends pas ces accords/.test(r0.verdict) && r0.issues.length === 1, r0.verdict);
}

// [Claude] — 2026-09-25 — Le passage garde la touche enfoncée à côté de la note entendue.
function testRawKeys() {
  let now = 10;
  const live = createLiveTake({ now: () => now });
  // Transposition +2 : on enfonce Do (60), on entend Ré (62).
  live.noteOn(62, 0.7, 10, 60); live.noteOn(66, 0.7, 10, 64);
  live.noteOff(62, 11, 60);
  now = 12;
  const p = live.lastPassage();
  check('Passage : la touche brute est gardée à côté de la note entendue', p.events[0].note === 62 && p.events[0].raw === 60 && p.events.filter((e) => e.type === 'note_off').every((e) => e.raw != null), JSON.stringify(p.events));
}

function testEmpty() {
  check('Passage vide : null', reviewTake([]) === null);
}

testLiveTake();
testVoicingClassifier();
testScales();
testChordsReview();
testLinesReview();
testKeyFromCadence();
testExerciseExpect();
testRawKeys();
testEmpty();

console.log(`\n=== Résultat : ${passed}/${passed + failed} tests passés ===`);
process.exit(failed === 0 ? 0 : 1);
