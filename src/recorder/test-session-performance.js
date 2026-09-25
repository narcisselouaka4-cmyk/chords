// [Claude] — 2026-09-24 — Tests de l'analyse du jeu d'une session MIDI
// (session-performance.js) : chaque constat sur une session fabriquée.
//
// Lancer : node src/recorder/test-session-performance.js

import { analyzeSessionPerformance, formatPerformanceFindings } from './session-performance.js';

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

/** Session fabriquée : accords tenus `hold` secondes, pédale au choix. */
function session() {
  const events = [];
  const api = {
    events,
    chord(t, notes, { hold = 1.8, vel = 0.7, velOf = null, spread = 0, order = null } = {}) {
      const list = order || notes;
      list.forEach((n, i) => {
        events.push({ type: 'note_on', note: n, velocity: velOf ? velOf(n) : vel, channel: 0, time: t + i * spread });
        events.push({ type: 'note_off', note: n, velocity: 0, channel: 0, time: t + hold });
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
const ids = (list) => list.map((f) => f.id);

// II-V-I propre : basse + rootless, pédale reprise juste après chaque accord,
// changements réguliers, dessus plus fort.
const DM9 = [38, 45, 53, 57, 60, 64];
const G13 = [43, 53, 57, 59, 64];
const CMAJ9 = [36, 43, 52, 55, 59, 62];
function cleanSession() {
  const s = session();
  const grid = [DM9, G13, CMAJ9, CMAJ9.map((n) => n)];
  let t = 0;
  for (let r = 0; r < 3; r += 1) {
    for (const notes of [DM9, G13, CMAJ9]) {
      const top = Math.max(...notes);
      s.chord(t, notes, { hold: 1.9, velOf: (n) => (n === top ? 0.8 : n < 48 ? 0.55 : 0.6) });
      s.pedal(t + 0.12, true).pedal(t + 1.95, false);
      t += 2;
    }
  }
  void grid;
  return s.events;
}

function testCleanPlaying() {
  const a = analyzeSessionPerformance(cleanSession(), { tempo: 60 });
  check('Jeu propre : aucun point à travailler', a.issues.length === 0, ids(a.issues).join(', '));
  check('Jeu propre : pédale propre', ids(a.strengths).includes('pedal-clean'), ids(a.strengths).join(', '));
  check('Jeu propre : voix du dessus bien enchaînée', ids(a.strengths).includes('top-smooth'), ids(a.strengths).join(', '));
  check('Jeu propre : changements réguliers', a.stats.changeEvery != null && Math.abs(a.stats.changeEvery - 2) < 0.05, String(a.stats.changeEvery));
  const text = formatPerformanceFindings(a).join('\n');
  check('Texte pour le Copilote : points forts, à travailler, repères', /Points forts :/.test(text) && /À travailler/.test(text) && /Repères : \d+ notes · 9 accords/.test(text), text);
}

function testPedalBlur() {
  const s = session();
  s.pedal(0, true);
  s.chord(0, [36, 43, 52, 55, 59], { hold: 1.0 }); // Cmaj7, touches relâchées, pédale tenue
  s.chord(2, [41, 48, 57, 60, 64], { hold: 1.0 }); // Fmaj7 : Si et Sol de Cmaj7 encore là
  s.chord(4, [43, 50, 53, 59, 65], { hold: 1.0 }); // G7
  s.chord(6, [36, 43, 52, 55, 59], { hold: 1.0 });
  s.pedal(7.5, false);
  const a = analyzeSessionPerformance(s.events);
  const f = a.issues.find((x) => x.id === 'pedal-blur');
  check('Pédale tenue : constat « pédale gardée entre deux accords »', Boolean(f), ids(a.issues).join(', '));
  // La main gauche frappe une nouvelle basse (Fa2) : l'accord est Fmaj7, le Do2 ne fait que traîner.
  check('Pédale tenue : moments et notes restées (0:02 Cmaj7 → Fmaj7 : Sol2, Sol3, Si3)', /0:02 Cmaj7 → Fmaj7 : Sol2, Sol3, Si3/.test(f?.text || ''), f?.text);
  check('Pédale tenue : priorité haute (tous les changements)', f?.severity === 3);
}

function testLowMudAndMinorNinth() {
  const s = session();
  s.chord(0, [36, 40, 43, 64, 67], { hold: 1.5 }); // C2 E2 G2 : tierce trop grave
  s.chord(2, [47, 60, 64, 67], { hold: 1.5 }); // Si2 sous Do4 : 9e mineure (Cmaj7)
  s.chord(4, [41, 48, 57, 64], { hold: 1.5 });
  s.chord(6, [43, 50, 59, 65], { hold: 1.5 });
  const a = analyzeSessionPerformance(s.events);
  const mud = a.issues.find((x) => x.id === 'low-mud');
  check('Grave boueux : tierce majeure Do2–Mi2 (pas sous Sib2)', /tierce majeure Do2–Mi2 \(pas sous Sib2\)/.test(mud?.text || ''), mud?.text || ids(a.issues).join(', '));
  const rub = a.issues.find((x) => x.id === 'minor-ninth');
  check('9e mineure : Si2 sous Do4 à 0:02', /0:02 Cmaj7\/B, Si2 sous Do4|0:02 [^,]+, Si2 sous Do4/.test(rub?.text || ''), rub?.text || ids(a.issues).join(', '));
}

function testTopLeaps() {
  const s = session();
  // C (dessus Do5) ↔ G7 (dessus Ré4) : dix demi-tons à chaque changement.
  const tops = [[48, 64, 67, 72], [43, 53, 59, 62], [48, 64, 67, 72], [43, 53, 59, 62], [48, 64, 67, 72]];
  tops.forEach((notes, i) => s.chord(i * 2, notes, { hold: 1.8 }));
  const a = analyzeSessionPerformance(s.events);
  check('Dessus qui saute : constat « voix du dessus qui saute »', ids(a.issues).includes('top-leaps'), ids(a.issues).join(', '));
}

function testTiming() {
  const s = session();
  const times = [0, 2, 4, 6, 7.3, 9.3, 11.3, 14.4, 16.4, 18.4];
  times.forEach((t, i) => s.chord(t, i % 2 ? [43, 53, 59, 64] : [36, 52, 55, 59], { hold: 1.2 }));
  const a = analyzeSessionPerformance(s.events);
  const f = a.issues.find((x) => x.id === 'timing');
  check('Changements irréguliers : en avance à 0:07, en retard à 0:14', /0:07 en avance/.test(f?.text || '') && /0:14 en retard/.test(f?.text || ''), f?.text || ids(a.issues).join(', '));
}

function testDynamics() {
  const s = session();
  for (let i = 0; i < 12; i += 1) {
    const notes = i % 2 ? [43, 50, 59, 62, 65] : [36, 43, 52, 55, 59];
    const top = Math.max(...notes);
    s.chord(i * 1.5, notes, { hold: 1.3, velOf: (n) => (n < 55 ? 0.9 + (i % 3) * 0.02 : n === top ? 0.45 : 0.55) });
  }
  const a = analyzeSessionPerformance(s.events);
  check('Main gauche trop forte : constat', ids(a.issues).includes('left-heavy'), ids(a.issues).join(', '));
  check('Dessus effacé : constat', ids(a.issues).includes('melody-buried'), ids(a.issues).join(', '));
  const fixed = session();
  for (let i = 0; i < 12; i += 1) fixed.chord(i * 1.5, [36, 52, 55, 59], { hold: 1.3, vel: 0.8 });
  const b = analyzeSessionPerformance(fixed.events);
  check('Vélocité fixe (clavier virtuel) : aucun constat de nuances', !b.issues.some((x) => ['left-heavy', 'melody-buried', 'flat-dynamics'].includes(x.id)) && b.stats.dynamicsKnown === false);
  check('Vélocité fixe : dit comme tel au Copilote', /vélocité constante/.test(formatPerformanceFindings(b).join('\n')));
}

function testUnknownChordAndGaps() {
  const s = session();
  s.chord(0, [48, 52, 55, 61], { hold: 1.5 }); // Do Mi Sol Do# : note étrangère
  s.chord(2, [41, 53, 57, 60], { hold: 1.5 });
  s.chord(6.5, [43, 55, 59, 62], { hold: 1.5 }); // 3 s de silence avant
  s.chord(8.5, [48, 52, 55, 59], { hold: 1.5 });
  s.chord(21, [41, 53, 57, 60], { hold: 1.0 });
  const a = analyzeSessionPerformance(s.events);
  const u = a.issues.find((x) => x.id === 'unknown-chord');
  check('Note étrangère : accord non reconnu à 0:00 (Do3 Mi3 Sol3 Réb4)', /0:00 Do3 Mi3 Sol3 Réb4/.test(u?.text || ''), u?.text || ids(a.issues).join(', '));
  const g = a.issues.find((x) => x.id === 'gaps');
  check('Arrêts : 0:03 (3 s) et 0:10', /0:03 \(3 s\)/.test(g?.text || '') && /0:10/.test(g?.text || ''), g?.text || ids(a.issues).join(', '));
}

function testVocabulary() {
  const s = session();
  const triads = [[48, 52, 55], [53, 57, 60], [55, 59, 62], [45, 48, 52], [48, 52, 55], [53, 57, 60]];
  triads.forEach((n, i) => s.chord(i * 2, n, { hold: 1.8 }));
  const a = analyzeSessionPerformance(s.events);
  check('Triades seulement : suggestion 7e / 9e', ids(a.issues).includes('triads-only'), ids(a.issues).join(', '));
  const rich = analyzeSessionPerformance(cleanSession());
  check('Rootless (9e, 13e) : vocabulaire coloré', ids(rich.strengths).includes('vocabulary') || rich.stats.vocabulary.color >= 3, JSON.stringify(rich.stats.vocabulary));
}

// [Claude] — 2026-09-25 — Chaque cas garde ses notes exactes (carnet, clavier, Copilote).
function testDetails() {
  const s = session();
  s.pedal(0, true);
  s.chord(0, [36, 43, 52, 55, 59], { hold: 1.0 });
  s.chord(2, [41, 48, 57, 60, 64], { hold: 1.0 });
  s.chord(4, [43, 50, 53, 59, 65], { hold: 1.0 });
  s.chord(6, [36, 43, 52, 55, 59], { hold: 1.0 });
  s.pedal(7.5, false);
  const blur = analyzeSessionPerformance(s.events).issues.find((x) => x.id === 'pedal-blur');
  const d = blur?.details?.[0];
  check('Détail pédale : moment, accords, notes qui traînent', d?.at === 2 && d.from === 'Cmaj7' && d.chord === 'Fmaj7' && d.problemNotes.join(',') === '43,55,59', JSON.stringify(d));
  check('Détail pédale : notes jouées sur le nouvel accord', d?.notes.join(',') === '41,48,57,60,64', JSON.stringify(d?.notes));
  check('Détail pédale : phrase courte', /Sol2, Sol3, Si3 de Cmaj7 traînent sous Fmaj7/.test(d?.text || ''), d?.text);

  const r = session();
  r.chord(0, [36, 40, 43, 64, 67], { hold: 1.5 });
  r.chord(2, [47, 60, 64, 67], { hold: 1.5 });
  r.chord(4, [41, 48, 57, 64], { hold: 1.5 });
  const a = analyzeSessionPerformance(r.events);
  const mud = a.issues.find((x) => x.id === 'low-mud')?.details?.[0];
  check('Détail grave boueux : la paire en cause (Do2–Mi2)', mud?.problemNotes.join(',') === '36,40' && mud.at === 0, JSON.stringify(mud));
  const rub = a.issues.find((x) => x.id === 'minor-ninth')?.details?.[0];
  check('Détail 9e mineure : Si2 et Do4', rub?.problemNotes.join(',') === '47,60' && rub.at === 2, JSON.stringify(rub));

  const u = session();
  u.chord(0, [48, 52, 55, 61], { hold: 1.5 });
  u.chord(2, [41, 53, 57, 60], { hold: 1.5 });
  const unknown = analyzeSessionPerformance(u.events).issues.find((x) => x.id === 'unknown-chord')?.details?.[0];
  check('Détail accord non reconnu : la fausse note probable (Réb4)', unknown?.problemNotes.includes(61), JSON.stringify(unknown));
}

function testEmpty() {
  check('Session vide : null', analyzeSessionPerformance([]) === null);
  check('Texte d\'une analyse absente : aucune ligne', formatPerformanceFindings(null).length === 0);
}

testCleanPlaying();
testPedalBlur();
testLowMudAndMinorNinth();
testTopLeaps();
testTiming();
testDynamics();
testUnknownChordAndGaps();
testVocabulary();
testDetails();
testEmpty();

console.log(`\n=== Résultat : ${passed}/${passed + failed} tests passés ===`);
process.exit(failed === 0 ? 0 : 1);
