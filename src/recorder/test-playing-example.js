// [Claude] — 2026-09-25 — Tests de l'extrait rejoué à l'identique (playing-example.js).
//
// Lancer : node src/recorder/test-playing-example.js

import { playingExample, PLAYING_MAX_EVENTS, PLAYING_MAX_SECONDS } from './playing-example.js';

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

/** Jeu fabriqué : notes (début, durée, vélocité), pédale. */
function take() {
  const events = [];
  const api = {
    note(at, midi, hold = 0.4, velocity = 0.7) {
      events.push({ type: 'note_on', note: midi, velocity, channel: 0, time: at });
      events.push({ type: 'note_off', note: midi, velocity: 0, channel: 0, time: at + hold });
      return api;
    },
    chord(at, notes, hold = 1, velocity = 0.6) { notes.forEach((n) => api.note(at, n, hold, velocity)); return api; },
    pedal(at, down, value = null) { events.push({ type: 'control', controller: 64, value: value ?? (down ? 127 : 0), channel: 0, time: at }); return api; },
    events: () => [...events].sort((a, b) => a.time - b.time),
  };
  return api;
}

const ons = (ex) => ex.events.filter((e) => e.type === 'noteOn');
const round = (x) => Math.round(x * 1000) / 1000;

// Dm9 : Ré2 La2 | Do4 Mi4 Fa4 et La4 dessus, puis Sol4 Fa4 (la main gauche tient) ;
// G13 : Sol2 Fa3 | La4 Si4 et Mi5 dessus.
function session() {
  return take()
    .chord(0, [38, 45], 1.9, 0.55).chord(0, [60, 64, 65], 0.9, 0.55).note(0, 69, 0.9, 0.8)
    .pedal(0.1, true)
    .note(1, 67, 0.45, 0.62).note(1.5, 65, 0.45, 0.6)
    .pedal(1.95, false)
    .chord(2, [43, 53], 1.9, 0.5).chord(2, [69, 71], 1.8, 0.5).note(2, 76, 1.8, 0.85)
    .pedal(2.1, true).pedal(3.95, false)
    .events();
}

function testExact() {
  const ex = playingExample(session(), { start: 0, end: 4 });
  const got = ons(ex).map((e) => `${e.note}@${round(e.time)}`).join(' ');
  check('Toutes les notes, à leurs moments exacts', got === '38@0 45@0 60@0 64@0 65@0 69@0 67@1 65@1.5 43@2 53@2 69@2 71@2 76@2', got);
  const la = ons(ex).find((e) => e.note === 69);
  const laOff = ex.events.find((e) => e.type === 'noteOff' && e.note === 69);
  check('Nuances et durées gardées (La4 : vélocité 0,8, relâché à 0,9 s)', Math.abs(la.velocity - 0.8) < 1e-9 && Math.abs(laOff.time - 0.9) < 1e-9, JSON.stringify([la, laOff]));
  const pedal = ex.events.filter((e) => e.type === 'sustain').map((e) => `${e.value ? 'bas' : 'haut'}@${round(e.time)}`).join(' ');
  check('Pédale rejouée à ses moments', pedal === 'bas@0.1 haut@1.95 bas@2.1 haut@3.95', pedal);
  check('Format des exemples du Copilote (tempo 60, un temps = une seconde)', ex.kind === 'playing' && ex.tempo === 60 && ex.beats >= 3.9 && Array.isArray(ex.chords));
  check('Titre et sous-titre en français simple', ex.title === 'Ton jeu, 0:00–0:03' && /13 notes comme tu les as jouées, pédale comprise/.test(ex.subtitle), `${ex.title} / ${ex.subtitle}`);
}

function testRestoreAtStart() {
  // Extrait à 1,2 s : Ré2 La2 et Sol4 sont encore tenus ; Do4 Mi4 Fa4 La4, relâchés,
  // sonnent encore par la pédale enfoncée.
  const ex = playingExample(session(), { start: 1.2, end: 3 });
  const atZero = ons(ex).filter((e) => e.time === 0).map((e) => e.note).join(',');
  check('Au début de l\'extrait : ce qui sonnait sonne (touches tenues, notes gardées par la pédale)', atZero === '38,45,60,64,65,67,69', atZero);
  const shortOnes = ex.events.filter((e) => e.type === 'noteOff' && e.time <= 0.05 + 1e-9).map((e) => e.note).join(',');
  check('Notes gardées par la pédale : relâchées aussitôt (la pédale les tient)', shortOnes === '60,64,65,69', shortOnes);
  check('Au début de l\'extrait : la pédale enfoncée l\'est encore', ex.events[0].type === 'sustain' && ex.events[0].value === true && ex.events[0].time === 0);
  check('Puis la suite, recalée au début de l\'extrait (Fa4 à 0,3 s)', ons(ex).some((e) => e.note === 65 && Math.abs(e.time - 0.3) < 1e-9));
  // Accord relâché mais gardé par la pédale : il sonne encore au début de l'extrait.
  const pedalled = take().pedal(0, true).chord(0, [48, 55, 64], 0.5).note(1.5, 72, 0.3).pedal(3, false).events();
  const ex2 = playingExample(pedalled, { start: 1, end: 3 });
  const restored = ons(ex2).filter((e) => e.time === 0).map((e) => e.note).join(',');
  const released = ex2.events.filter((e) => e.type === 'noteOff' && [48, 55, 64].includes(e.note)).every((e) => e.time <= 0.05 + 1e-9);
  check('Notes gardées par la pédale : rejouées au début, pédale enfoncée', restored === '48,55,64' && released && ex2.events[0].type === 'sustain', `${restored} ${JSON.stringify(ex2.events.slice(0, 4))}`);
  const old = take().pedal(0, true).chord(0, [48, 55, 64], 0.5).note(9, 72, 0.3).pedal(10, false).events();
  check('Notes gardées par la pédale depuis plus de 4 s : pas rejouées', ons(playingExample(old, { start: 8.5, end: 10 })).map((e) => e.note).join(',') === '72');
}

function testParts() {
  const melody = playingExample(session(), { start: 0, end: 4, part: 'melodie' });
  check('Partie « melodie » : la voix du dessus seule, sans pédale', ons(melody).map((e) => e.note).join(',') === '69,67,65,76' && !melody.events.some((e) => e.type === 'sustain'), ons(melody).map((e) => e.note).join(','));
  check('Partie « melodie » : titre', melody.title === 'Ta mélodie, 0:00–0:03' && /4 notes de la voix du dessus/.test(melody.subtitle), `${melody.title} / ${melody.subtitle}`);
  const left = playingExample(session(), { start: 0, end: 4, part: 'main_gauche' });
  check('Partie « main_gauche » : Ré2 La2 puis Sol2 Fa3', ons(left).map((e) => e.note).join(',') === '38,45,43,53', ons(left).map((e) => e.note).join(','));
  const right = playingExample(session(), { start: 0, end: 4, part: 'main_droite' });
  check('Partie « main_droite » : le reste, mélodie comprise', ons(right).map((e) => e.note).join(',') === '60,64,65,69,67,65,69,71,76', ons(right).map((e) => e.note).join(','));
  check('Partie inconnue : tout', ons(playingExample(session(), { start: 0, end: 4, part: 'n_importe' })).length === 13);
  // Mains devinées sur des cas usuels.
  const shell = playingExample(take().chord(0, [48, 52, 58], 1).events(), { part: 'main_gauche' });
  check('Shell Do3 Mi3 Sib3 seul : main gauche', ons(shell).length === 3);
  const triad = playingExample(take().chord(0, [60, 64, 67, 72], 1).events(), { part: 'main_droite' });
  check('Accord Do4 Mi4 Sol4 Do5 seul : une main, la droite', ons(triad).length === 4);
  const spread = playingExample(take().chord(0, [36, 43, 52, 59, 62, 67], 1).events(), { part: 'main_gauche' });
  check('Accord à deux mains Do2 Sol2 | Mi3 Si3 Ré4 Sol4 : Do2 Sol2 à gauche', ons(spread).map((e) => e.note).join(',') === '36,43', ons(spread).map((e) => e.note).join(','));
}

function testPitch() {
  const heard = playingExample(session(), { start: 0, end: 4, offset: 2 });
  check('Session transposée au clavier (+2) : même hauteur que sa relecture, sans le dire', ons(heard)[0].note === 40 && !/transpos/.test(heard.subtitle), heard.subtitle);
  const moved = playingExample(session(), { start: 0, end: 4, semitones: 3 });
  check('Transposition demandée (+3) : notes et sous-titre', ons(moved).map((e) => e.note).slice(0, 2).join(',') === '41,48' && /transposées de \+3 demi-tons/.test(moved.subtitle), moved.subtitle);
  const loud = playingExample(take().note(0, 60, 0.5, 100).events(), {});
  check('Vélocités de 0 à 127 ramenées entre 0 et 1', Math.abs(ons(loud)[0].velocity - 100 / 127) < 1e-9);
}

function testBounds() {
  const long = take();
  for (let i = 0; i < 90; i += 1) long.note(i, 60 + (i % 12), 0.5);
  const ex = playingExample(long.events(), { start: 5 });
  check(`Sans fin : ${PLAYING_MAX_SECONDS} s au plus`, ex.playingStart === 5 && ex.playingEnd === 5 + PLAYING_MAX_SECONDS && ons(ex).length === 60, `${ex.playingStart}–${ex.playingEnd} (${ons(ex).length})`);
  const dense = take();
  for (let i = 0; i < 2000; i += 1) dense.note(i * 0.02, 48 + (i % 36), 0.015);
  const cut = playingExample(dense.events(), { start: 0, end: 40 });
  check(`Jeu très dense : ${PLAYING_MAX_EVENTS} évènements au plus, coupé à une attaque`, cut.events.length <= PLAYING_MAX_EVENTS && cut.playingEnd < 40 && cut.events.filter((e) => e.type === 'noteOn').length === cut.events.filter((e) => e.type === 'noteOff').length, `${cut.events.length} évènements, fin ${cut.playingEnd}`);
  check('Rien entre deux moments : pas d\'exemple', playingExample(session(), { start: 30, end: 40 }) === null);
  check('Rien joué : pas d\'exemple', playingExample([], {}) === null);
  const ordered = playingExample(session(), { start: 0, end: 4 }).events.every((e, i, all) => i === 0 || all[i - 1].time <= e.time);
  check('Évènements dans l\'ordre du temps', ordered);
}

testExact();
testRestoreAtStart();
testParts();
testPitch();
testBounds();

console.log(`\n=== Résultat : ${passed}/${passed + failed} tests passés ===`);
process.exit(failed === 0 ? 0 : 1);
