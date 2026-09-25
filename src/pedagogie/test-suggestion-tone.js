// [Claude] — 2026-09-25 — Garde-fou du ton « assistant, pas coach ».
//
// Narcisse : « ce serait pas très bien vu de simplement dire à l'utilisateur qu'il
// a fait des erreurs […] on reste un assistant, pas un coach. L'assistant
// devrait plutôt lui conseiller de faire ci ou ça. » Ce test fait produire à
// l'application ses textes sur des jeux variés (passage joué, session, exercice,
// avis sans clé d'IA dans la ligne d'état) et vérifie :
//   - qu'aucun ne juge (« erreur », « faux », « ne va pas », « à revoir »…) ;
//   - que chaque suggestion propose une action (essaie, ajoute, relève…).
//
// Lancer : node src/pedagogie/test-suggestion-tone.js

import { reviewTake, takeVerdict } from '../recorder/take-review.js';
import { analyzeSessionPerformance, formatPerformanceFindings } from '../recorder/session-performance.js';
import { createPracticeExercise } from '../practice-exercise.js';
import { localReviewText } from './copilot-tab.js';

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

// Frontières de mot écrites à la main : en JavaScript, \b ne voit pas un « é » comme une lettre.
const word = (list) => new RegExp(`(?:^|[^\\p{L}])(?:${list})(?![\\p{L}])`, 'iu');
const JUDGING = word('erreurs?|faux|fausses?|fautes?|fautifs?|fautives?|ne va pas|ne vont pas|à revoir|trompée?s?|mauvaise?s?|ratée?s?');
const ACTION = word('essaie|essayez|ajoute|ajoutez|relève|écarte|déplace|fais|glisse|donne|allège|rejoue|réécoute|garde|pars|laisse|empile|resserre|mettez|remplacez');
const judging = (texts) => texts.filter((t) => JUDGING.test(String(t || '')));

// ── Passages joués ──
function take() {
  const events = [];
  const api = {
    chord(t, notes, { hold = 1.8, velocity = 0.7 } = {}) {
      notes.forEach((n) => {
        events.push({ type: 'note_on', note: n, velocity, channel: 0, time: t });
        events.push({ type: 'note_off', note: n, velocity: 0, channel: 0, time: t + hold });
      });
      return api;
    },
    line(t, notes, step = 0.3, { hold = 0.25 } = {}) {
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
    events: () => events.sort((a, b) => a.time - b.time),
  };
  return api;
}

const PASSAGES = [
  { what: 'II-V-I avec Fa#3 dans G7', events: take().chord(0, [38, 53, 57, 60, 64]).chord(2, [43, 54, 57, 59, 64]).chord(4, [36, 52, 55, 59, 62]).events(), question: 'Je joue un 2-5-1 en Do, c\'est bon ?' },
  { what: 'II-V-I sans question (Gmaj13 au lieu de G13)', events: take().chord(0, [38, 53, 57, 60, 64]).chord(2, [43, 54, 57, 59, 64]).chord(4, [36, 52, 55, 59, 62]).events(), question: '' },
  { what: 'drop 2 demandé, rootless joué', events: take().chord(0, [38, 53, 57, 60, 64]).chord(2, [43, 53, 57, 59, 64]).chord(4, [36, 52, 55, 59, 62]).events(), question: 'mon 2-5-1 en drop 2 est bon ?' },
  { what: 'gamme de Ré dorien avec un Sib', events: take().line(0, [62, 64, 65, 67, 69, 70, 72, 74], 0.3).events(), question: 'j\'ai joué Ré dorien, c\'est juste ?' },
  { what: 'lick sur G7 avec une note étrangère tenue', events: take().chord(0, [43, 53, 59], { hold: 3.5 }).line(0.3, [74, 75, 76, 79], 0.33).line(1.8, [73], 0.3, { hold: 1.2 }).events(), question: 'mon lick sur G7 marche ?' },
  { what: 'pédale gardée', events: take().pedal(0, true).chord(0, [36, 43, 52, 55, 59], { hold: 1.5 }).chord(2, [41, 48, 57, 60, 64], { hold: 1.5 }).chord(4, [43, 50, 53, 59, 65], { hold: 1.5 }).chord(6, [36, 43, 52, 55, 59], { hold: 1.5 }).pedal(8, false).events(), question: '' },
  { what: 'accord de Dm9 attendu, D7 joué', events: take().chord(0, [38, 54, 57, 60, 64]).events(), question: 'mon voicing de Dm9 est bon ?' },
];

function testTakeReviews() {
  for (const p of PASSAGES) {
    const review = reviewTake(p.events, { question: p.question });
    const texts = [
      review.verdict, takeVerdict(review),
      ...review.issues.flatMap((i) => [i.title, i.text, ...(i.moments || []).map((m) => m.text)]),
      ...review.contextLines,
      localReviewText(review),
    ];
    const bad = judging(texts);
    check(`Passage (${p.what}) : aucun mot qui juge`, bad.length === 0, bad.join(' | '));
    const noAction = review.issues.filter((i) => !ACTION.test(i.text));
    check(`Passage (${p.what}) : chaque suggestion propose une action`, noAction.length === 0, noAction.map((i) => i.text).join(' | '));
  }
}

// ── Session : beaucoup de choses à proposer d'un coup ──
function testSession() {
  const t = take().pedal(0, true);
  const grid = [
    [36, 40, 43, 64, 67, 71], // grave serré (Do2 Mi2 Sol2)
    [43, 53, 57, 59, 64],
    [38, 45, 65, 69, 72, 76], // le dessus saute
    [47, 60, 64, 67], // Si2 sous Do4 : 9e mineure
    [48, 52, 55, 61], // accord que l'application ne sait pas nommer
    [43, 53, 57, 59, 64],
  ];
  grid.forEach((notes, i) => t.chord(i * 2, notes, { hold: 1.2, velocity: 0.62 }));
  t.pedal(12.5, false);
  grid.forEach((notes, i) => t.chord(16 + i * 2, notes, { hold: 1.2, velocity: 0.62 }));
  const events = t.events();
  const analysis = analyzeSessionPerformance(events);
  const texts = [
    ...analysis.issues.flatMap((f) => [f.title, f.text, ...(f.details || []).map((d) => d.text)]),
    ...formatPerformanceFindings(analysis),
  ];
  check('Session : plusieurs suggestions produites', analysis.issues.length >= 4, analysis.issues.map((f) => f.id).join(', '));
  const bad = judging(texts);
  check('Session : aucun mot qui juge (titres, textes, cas)', bad.length === 0, bad.join(' | '));
  const noAction = analysis.issues.filter((f) => !ACTION.test(f.text));
  check('Session : chaque suggestion propose une action', noAction.length === 0, noAction.map((f) => f.text).join(' | '));
  const review = reviewTake(events, {});
  const bad2 = judging(review.contextLines);
  check('Session : portrait envoyé au Copilote sans mot qui juge', bad2.length === 0, bad2.join(' | '));
}

// ── Exercices ──
function testExercise() {
  const ex = createPracticeExercise();
  ex.setTechnique('shell');
  ex.setTargetChoice(0, '6');
  const messages = [ex.check([57, 60, 64]).message, ex.check([48, 52, 55, 59]).message, ex.check([61]).message];
  const mv = createPracticeExercise();
  mv.setMode('movement');
  messages.push(mv.check([61, 66, 70]).message);
  const bad = messages.filter((m) => JUDGING.test(m) || /❌|Vous avez joué|Cible :/.test(m));
  check('Exercices : des suggestions, jamais de verdict', bad.length === 0, bad.join(' | '));
  check('Exercices : chaque message propose une action', messages.every((m) => ACTION.test(m) || /essayez les notes de la carte/.test(m)), messages.join(' | '));
}

testTakeReviews();
testSession();
testExercise();

console.log(`\n=== Résultat : ${passed}/${passed + failed} tests passés ===`);
process.exit(failed === 0 ? 0 : 1);
