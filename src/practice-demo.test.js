// [Claude] — 2026-09-24 — Tests de la démo des mouvements (Gospel / worship,
// Ballade, Comping swing, Plaqué) et de son lecteur.
// Exécution : node src/practice-demo.test.js

import { createPracticeExercise, listMovementNames } from './practice-exercise.js';
import {
  buildGospelDemo, buildDemo, bassOctave, bassNote, bassApproach, innerMovement,
  DEMO_STYLES, DEMO_STYLE_IDS, defaultDemoStyle,
} from './practice-demo.js';
import { createDemoPlayer } from './exercise-demo-player.js';

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

function movement(name, { key = 0, technique = 'drop2', difficulty = 3, doubling = 'none' } = {}) {
  const ex = createPracticeExercise();
  ex.setMode('movement');
  ex.setTechnique(technique);
  ex.setDifficulty(difficulty);
  ex.setDoubling(doubling);
  ex.setKeyChoice(key);
  ex.setContentChoice(name);
  return ex.getState().progression.chords;
}

console.log('\n=== Démo : briques ===');
check('Basse en octaves sous le voicing (Dm11 F3 G3 A3 C4 → D2 D3)', bassOctave(2, [53, 55, 57, 60]).join() === '38,50');
check('Basse seule quand l\'octave ne tient pas (voicing grave)', bassOctave(0, [45, 52, 55]).join() === '36');
check('Pas de basse sous un voicing déjà au plus grave', bassOctave(4, [28, 40]).length === 0);
check('Approche chromatique : par-dessous en montant, par-dessus en descendant', bassApproach(43, 48) === 47 && bassApproach(50, 43) === 44);
check('Pas d\'approche quand la basse ne change pas', bassApproach(43, 43) === null);
check('Mouvement interne 7 → 3 : Do de Dm7 vers Si de G7', JSON.stringify(innerMovement([53, 55, 57, 60], [53, 57, 59, 64])) === JSON.stringify({ from: 60, to: 59 }));
check('Pas de mouvement interne quand tout saute', innerMovement([60, 64, 67], [70, 74, 77]) === null);

console.log('\n=== Démo : grille complète ===');
const chords = movement('Cadence II-V-I majeur');
const { events, beats } = buildGospelDemo(chords);
check('Une mesure de 4 temps par accord', beats === chords.length * 4);
const steps = events.filter((e) => e.type === 'step');
check('Un repère par accord, dans l\'ordre, sur le 1er temps', steps.map((e) => `${e.step}@${e.time}`).join() === chords.map((_, i) => `${i}@${i * 4}`).join());
const ons = events.filter((e) => e.type === 'noteOn');
const offs = events.filter((e) => e.type === 'noteOff');
check('Chaque note enfoncée est relâchée', ons.length === offs.length);
check('Évènements triés dans le temps', events.every((e, i) => i === 0 || events[i - 1].time <= e.time));
check('Vélocités entre 0,3 et 1', ons.every((e) => e.velocity >= 0.3 && e.velocity <= 1));
const pedal = events.filter((e) => e.type === 'sustain');
check('Pédale reprise à chaque accord et relevée à la fin', pedal.filter((e) => e.value).length === chords.length && pedal[pedal.length - 1].value === false);

// Les voicings de la démo sont ceux de l'exercice (voicings enchaînés).
chords.forEach((chord, i) => {
  const onBeat1 = new Set(ons.filter((e) => e.time === i * 4 || (i === chords.length - 1 && e.time >= i * 4 && e.time < i * 4 + 1)).map((e) => e.note));
  check(`${chord.name} : le voicing de l'exercice est joué tel quel au 1er temps`, chord.notes.every((n) => onBeat1.has(n)));
});
const onBeat = (beat) => new Set(ons.filter((e) => e.time === beat).map((e) => e.note));
check('Accords rejoués sur les temps 2 et 4', chords[0].notes.every((n) => onBeat(1).has(n) && onBeat(3).has(n)));
const bassDm = bassOctave(chords[0].rootPc, chords[0].notes);
check('Basse en octaves sur le 1er temps (Dm11 : D2 D3)', bassDm.join() === '38,50' && bassDm.every((n) => onBeat(0).has(n)), bassDm.join());
check('4e temps « et » : approche de la basse (Ab2 vers G) et 7e de Dm11 → 3ce de G13 (C4 → B3)', onBeat(3.5).has(44) && onBeat(3.5).has(59), [...onBeat(3.5)].join());

// [Claude] — 2026-09-24 — Styles Ballade, Comping swing et Plaqué (demande de Narcisse).
console.log('\n=== Démo : styles ===');
check('Quatre styles, chacun avec son tempo', DEMO_STYLE_IDS.join() === 'gospel,ballade,swing,plaque'
  && DEMO_STYLE_IDS.every((id) => DEMO_STYLES[id].label && DEMO_STYLES[id].tempo >= 50 && DEMO_STYLES[id].tempo <= 160));
check('Style par défaut selon le mouvement : jazz → swing, gospel / worship → gospel, sans style → ballade',
  defaultDemoStyle('jazz') === 'swing' && defaultDemoStyle('gospel') === 'gospel' && defaultDemoStyle('worship') === 'gospel' && defaultDemoStyle(undefined) === 'ballade');
check('Style inconnu : Gospel / worship', JSON.stringify(buildDemo(chords, 'inconnu')) === JSON.stringify(buildGospelDemo(chords)));
check('Basse seule sous le voicing, dans le grave (Dm11 F3 G3 A3 C4 → D2)', bassNote(2, [53, 55, 57, 60]) === 38);
check('Pas de basse seule si le voicing a déjà sa fondamentale au grave (shell C2 E2 Bb2)', bassNote(0, [36, 40, 46]) === null);

const attacks = (demo, from, to) => demo.events.filter((e) => e.type === 'noteOn' && e.time >= from && e.time < to);
const durations = (demo) => {
  const open = new Map(); const out = [];
  for (const e of demo.events) {
    if (e.type === 'noteOn') open.set(`${e.note}@${e.time}`, e);
    if (e.type === 'noteOff') {
      const key = [...open.keys()].find((k) => k.startsWith(`${e.note}@`));
      if (key) { out.push({ note: e.note, start: open.get(key).time, length: e.time - open.get(key).time }); open.delete(key); }
    }
  }
  return out;
};

const ballade = buildDemo(chords, 'ballade');
const balladeBar = attacks(ballade, 0, 4);
const arpeggio = balladeBar.filter((e) => chords[0].notes.includes(e.note) && e.time < 2);
check('Ballade : basse seule au 1er temps (D2)', balladeBar.some((e) => e.time === 0 && e.note === 38) && !balladeBar.some((e) => e.time === 0 && e.note === 50));
check('Ballade : voicing arpégé du grave à l\'aigu, après la basse', arpeggio.length === chords[0].notes.length
  && arpeggio.every((e, k) => k === 0 || (e.time > arpeggio[k - 1].time && e.note > arpeggio[k - 1].note)) && arpeggio[0].time > 0,
  arpeggio.map((e) => `${e.note}@${e.time}`).join(' '));
const top2 = [...chords[0].notes].sort((a, b) => a - b).slice(-2);
check('Ballade : les deux notes du dessus reprises au 3e temps', top2.every((n) => balladeBar.some((e) => e.time === 2 && e.note === n)));
check('Ballade : pédale changée à chaque accord', ballade.events.filter((e) => e.type === 'sustain' && e.value).length === chords.length);

const swing = buildDemo(chords, 'swing');
const swingBar = attacks(swing, 0, 4);
check('Swing : Charleston — accord au 1er temps et au « et » du 2e (croche swinguée)',
  chords[0].notes.every((n) => swingBar.some((e) => e.time === 0 && e.note === n) && swingBar.some((e) => Math.abs(e.time - (1 + 2 / 3)) < 1e-9 && e.note === n)));
check('Swing : basse au 1er temps, sans pédale', swingBar.some((e) => e.time === 0 && e.note === 38) && !swing.events.some((e) => e.type === 'sustain'));
check('Swing : accords courts (≤ un demi-temps et demi), sauf le dernier',
  durations(swing).filter((d) => d.start < (chords.length - 1) * 4 && chords.some((c) => c.notes.includes(d.note))).every((d) => d.length <= 0.55 + 1e-9));

const plaque = buildDemo(chords, 'plaque');
check('Plaqué : le voicing seul, une fois par mesure, tenu', chords.every((c, i) => {
  const bar = attacks(plaque, i * 4, i * 4 + 4);
  return bar.length === c.notes.length && bar.every((e) => e.time === i * 4 && c.notes.includes(e.note));
}) && !plaque.events.some((e) => e.type === 'sustain') && durations(plaque).every((d) => d.length >= 3.9));

console.log('\n=== Démo : toute la bibliothèque, tous les styles ===');
let problems = [];
for (const name of listMovementNames()) {
  for (const technique of ['auto', 'rootless', 'drop2', 'spread']) {
    const grid = movement(name, { technique, key: 7 });
    for (const style of DEMO_STYLE_IDS) {
      const demo = buildDemo(grid, style);
      const ons = demo.events.filter((e) => e.type === 'noteOn');
      if (ons.some((e) => e.note < 28 || e.note > 100)) problems.push(`${name} ${technique} ${style} : note hors clavier`);
      if (ons.some((e) => e.velocity < 0.3 || e.velocity > 1)) problems.push(`${name} ${technique} ${style} : vélocité`);
      if (ons.length !== demo.events.filter((e) => e.type === 'noteOff').length) problems.push(`${name} ${technique} ${style} : notes non relâchées`);
      if (demo.events.filter((e) => e.type === 'step').length !== grid.length) problems.push(`${name} ${technique} ${style} : repères`);
      // Le voicing de l'exercice est joué en entier dans la mesure de chaque accord.
      grid.forEach((c, i) => {
        const played = new Set(ons.filter((e) => e.time >= i * 4 && e.time < i * 4 + 4).map((e) => e.note));
        if (!c.notes.every((n) => played.has(n))) problems.push(`${name} ${technique} ${style} : voicing de ${c.name} incomplet`);
      });
      if (demo.events.some((e, k) => k > 0 && demo.events[k - 1].time > e.time)) problems.push(`${name} ${technique} ${style} : ordre`);
    }
  }
}
check('12 mouvements × 4 techniques × 4 styles : démo jouable (Mi1–Mi7, voicing entier, un repère par accord)', problems.length === 0, problems.slice(0, 3).join(' ; '));

console.log('\n=== Lecteur de démo ===');
{
  // Horloge simulée : les minuteries sont rangées puis déclenchées dans l'ordre.
  let clock = [];
  const setTimer = (fn, ms) => { const id = { fn, ms }; clock.push(id); return id; };
  const clearTimer = (id) => { clock = clock.filter((t) => t !== id); };
  const runUntil = (ms) => {
    const due = clock.filter((t) => t.ms <= ms).sort((a, b) => a.ms - b.ms);
    clock = clock.filter((t) => t.ms > ms);
    due.forEach((t) => t.fn());
  };
  const sent = [];
  const steps = [];
  const ends = [];
  const player = createDemoPlayer({
    send: (type, a, b) => sent.push([type, a, b]),
    onStep: (i) => steps.push(i),
    onEnd: (reason) => ends.push(reason),
    setTimer,
    clearTimer,
  });
  // Même note tenue deux fois (0–2 et 1–3) : relâchée une seule fois, à la fin.
  const events = [
    { time: 0, type: 'step', step: 0 },
    { time: 0, type: 'sustain', value: true },
    { time: 0, type: 'noteOn', note: 60, velocity: 0.7 },
    { time: 1, type: 'noteOn', note: 60, velocity: 0.5 },
    { time: 2, type: 'noteOff', note: 60 },
    { time: 3, type: 'noteOff', note: 60 },
  ];
  player.play({ events, beats: 4 }, { tempo: 60 });
  check('Lecture en cours', player.isPlaying());
  runUntil(2500);
  check('Note rejouée sans être coupée par la première fin', sent.filter(([t, n]) => t === 'noteOff' && n === 60).length === 1
    && sent.filter(([t]) => t === 'noteOn').length === 2, JSON.stringify(sent));
  runUntil(10000);
  check('Relâchée au dernier relâchement ; repère et fin annoncés', sent.filter(([t, n]) => t === 'noteOff' && n === 60).length === 2
    && steps.join() === '0' && ends.join() === 'finished' && !player.isPlaying(), JSON.stringify(sent));
  check('Pédale relevée à la fin', sent[sent.length - 1][0] === 'sustain' && sent[sent.length - 1][1] === false);

  sent.length = 0; ends.length = 0;
  player.play({ events, beats: 4 }, { tempo: 60 });
  runUntil(1200);
  player.stop();
  check('Arrêt : notes tenues et pédale relâchées, plus rien ne joue ensuite', sent.some(([t, n]) => t === 'noteOff' && n === 60)
    && sent[sent.length - 1][0] === 'sustain' && sent[sent.length - 1][1] === false && ends.join() === 'stopped');
  const count = sent.length;
  runUntil(10000);
  check('Après l\'arrêt, aucune minuterie ne rejoue', sent.length === count && clock.length === 0);
}

console.log(`\n=== Résultat : ${passed}/${passed + failed} tests passés ===`);
if (failed > 0) process.exit(1);
