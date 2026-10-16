// [Claude] — 2026-09-25 — Tests des notes du professeur (teacher-notes.js) : touches
// allumées image par image → notes, notes de V2N ou du son → notes, mains, frise
// pour le Copilote, transposition, passage rejoué en exemple.
//
// Lancer : node src/pedagogie/test-teacher-notes.js

import {
  samplesToNoteEvents, eventsFromTranscription, guessHands, notesInRange, notesAt,
  compactTimeline, transposeInterval, transposeChordLabel, passageExample, approachNotes, runNotes,
} from './teacher-notes.js';
import { withoutPedal } from '../exercise-demo-player.js';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

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

// Le professeur : Dm9 (Ré2 | Fa3 La3 Do4 Mi4) de 0 à 2 s, puis un lick Ré Ré# Mi sur G13.
const TEACHER = [
  { midi: 38, start: 0, end: 1.9, hand: 'lh' },
  { midi: 53, start: 0, end: 1.9, hand: 'rh' },
  { midi: 57, start: 0, end: 1.9, hand: 'rh' },
  { midi: 60, start: 0, end: 1.9, hand: 'rh' },
  { midi: 64, start: 0, end: 1.9, hand: 'rh' },
  { midi: 74, start: 2, end: 2.2, hand: 'rh' },
  { midi: 75, start: 2.25, end: 2.45, hand: 'rh' },
  { midi: 76, start: 2.5, end: 3, hand: 'rh' },
];
const GRID = [{ start: 0, end: 2, label: 'Dm9' }, { start: 2, end: 4, label: 'G13' }];

function testSamples() {
  // Clavier dessiné lu 4 fois par seconde : Do4 allumé 3 images, Mi4 2 images (main gauche).
  const samples = [
    { t: 0, keys: [{ midi: 60, hand: 'right' }, { midi: 52, hand: 'left' }] },
    { t: 0.25, keys: [{ midi: 60, hand: 'right' }, { midi: 52, hand: 'left' }] },
    { t: 0.5, keys: [{ midi: 60, hand: 'right' }] },
    { t: 0.75, keys: [] },
    { t: 1, keys: [{ midi: 67 }] },
  ];
  const notes = samplesToNoteEvents(samples, 0.25);
  const c = notes.find((n) => n.midi === 60);
  const e = notes.find((n) => n.midi === 52);
  const g = notes.find((n) => n.midi === 67);
  check('Images → notes : une note par touche allumée d\'affilée', notes.length === 3, JSON.stringify(notes));
  check('Images → notes : début et fin (Do4 de 0 à 0,75 s)', c?.start === 0 && c?.end === 0.75, JSON.stringify(c));
  check('Images → notes : main d\'après la couleur', c?.hand === 'rh' && e?.hand === 'lh' && e?.end === 0.5 && g?.hand === null);
  check('Images → notes : touche encore allumée à la fin, fermée une image plus tard', g?.end === 1.25, JSON.stringify(g));
}

function testTranscription() {
  const notes = eventsFromTranscription([
    { midi: 62, onset: 1.004, offset: 1.5, velocity: 90 },
    { midi: 60, onset: 0.5, offset: 0.4 },
    { midi: null, onset: 2 },
  ]);
  check('V2N / son → notes : triées, invalides écartées', notes.length === 2 && notes[0].midi === 60, JSON.stringify(notes));
  check('V2N / son → notes : fin absente ou avant le début → 0,25 s', notes[0].end === 0.75);
  check('V2N / son → notes : vélocité ramenée entre 0 et 1', Math.abs(notes[1].velocity - 90 / 127) < 1e-9 && notes[1].start === 1);
}

function testHands() {
  const bare = TEACHER.map(({ hand, ...n }) => n);
  const hands = guessHands(bare);
  check('Mains devinées : Ré2 sous la grande coupure → main gauche', hands.find((n) => n.midi === 38).hand === 'lh');
  check('Mains devinées : Fa3 La3 Do4 Mi4 → main droite', hands.filter((n) => [53, 57, 60, 64].includes(n.midi)).every((n) => n.hand === 'rh'));
  check('Mains devinées : note seule au-dessus de Do4 → main droite', hands.find((n) => n.midi === 76).hand === 'rh');
  check('Mains données (couleur) gardées', guessHands([{ midi: 72, start: 0, end: 1, hand: 'lh' }])[0].hand === 'lh');
}

function testRangeAndTimeline() {
  check('Passage 2–3 s : les trois notes du lick', notesInRange(TEACHER, 2, 3).map((n) => n.midi).join(',') === '74,75,76');
  check('Passage main gauche seule', notesInRange(TEACHER, 0, 3, { hand: 'LH' }).map((n) => n.midi).join(',') === '38');
  check('Ce qui sonne à 1 s : le Dm9', notesAt(TEACHER, 1).length === 5);
  const lines = compactTimeline(TEACHER, GRID);
  check('Frise : une ligne par accord de la grille', lines.length === 2, lines.join(' / '));
  check('Frise : Dm9 main gauche | main droite', lines[0] === '- 0:00 Dm9 : Ré2 | Fa3 La3 Do4 Mi4', lines[0]);
  check('Frise : le lick de G13 en ligne', /^- 0:02 G13 : — \| Ré5 · puis Ré#5 Mi5$|^- 0:02 G13 : — \| Ré5 · puis Mib5 Mi5$/.test(lines[1]), lines[1]);
  const free = compactTimeline(TEACHER, []);
  check('Frise sans grille : groupes de huit secondes', free.length === 1 && /^- 0:00 : Ré2\(g\)/.test(free[0]), free.join(' / '));
  const many = compactTimeline(Array.from({ length: 50 }, (_, i) => ({ midi: 60, start: i * 2, end: i * 2 + 1 })), Array.from({ length: 50 }, (_, i) => ({ start: i * 2, end: i * 2 + 2, label: 'C' })), { maxLines: 5 });
  check('Frise bornée : 5 lignes puis « suite non détaillée »', many.length === 6 && /non détaillée/.test(many[5]));
  check('Frise vide sans notes', compactTimeline([], GRID).length === 0);
  // Amazing Grace, 0:47 : le Fa# d'un D9 s'écrit Fa#, pas Solb.
  const d9 = compactTimeline([38, 54, 57, 60, 64].map((midi) => ({ midi, start: 47, end: 49 })), [{ start: 47, end: 50, label: 'D9' }]);
  check('Frise : notes écrites d\'après l\'accord (D9 : Fa#3)', d9[0] === '- 0:47 D9 : Ré2 | Fa#3 La3 Do4 Mi4', d9[0]);
}

function testTranspose() {
  check('Transposer de Do en Fa : +5', transposeInterval('C', 'F') === 5);
  check('Transposer de Do en Sol : −5 (le plus court)', transposeInterval('Do majeur', 'Sol') === -5);
  check('Transposer de Sib en Do : +2', transposeInterval('Sib', 'C') === 2);
  check('Transposer de Ré mineur en Mi : +2', transposeInterval('Ré mineur', 'Mi') === 2);
  check('Tonalité inconnue : pas de transposition', transposeInterval('', 'F') === 0);
  check('Accord transposé : Dm9 +3 → Fm9, C/E +2 → D/F#', transposeChordLabel('Dm9', 3) === 'Fm9' && transposeChordLabel('C/E', 2) === 'D/F#');
}

function testPassageExample() {
  const ex = passageExample(TEACHER, { start: 0, end: 3, title: 'Le passage de 0:00' });
  const ons = ex.events.filter((e) => e.type === 'noteOn');
  check('Passage en exemple : les notes exactes du professeur', ons.map((e) => e.note).join(',') === '38,53,57,60,64,74,75,76', ons.map((e) => e.note).join(','));
  check('Passage en exemple : moments gardés (lick à 2 s), mains gardées', ons.find((e) => e.note === 74).time === 2 && ons.find((e) => e.note === 38).hand === 'lh');
  check('Passage en exemple : le moment de la vidéo est gardé', ex.kind === 'tutorial' && ex.tutorialStart === 0 && ex.tutorialEnd === 3 && ex.title === 'Le passage de 0:00');
  check('Passage en exemple : rien à marquer au clavier (touches en jaune), seulement notes et pédale', ex.steps === undefined && ex.events.every((e) => ['noteOn', 'noteOff', 'sustain'].includes(e.type)));
  const up = passageExample(TEACHER, { start: 2, end: 3, semitones: 3 });
  check('Passage transposé de +3 : notes transposées', up.events.filter((e) => e.type === 'noteOn').map((e) => e.note).join(',') === '77,78,79', up.events.filter((e) => e.type === 'noteOn').map((e) => e.note).join(','));
  check('Passage transposé : dit dans le sous-titre', /transposées de \+3 demi-tons/.test(up.subtitle), up.subtitle);
  check('Main gauche seule', passageExample(TEACHER, { start: 0, end: 3, hand: 'LH' }).events.filter((e) => e.type === 'noteOn').length === 1);
  check('Rien entre deux instants → pas d\'exemple', passageExample(TEACHER, { start: 10, end: 12 }) === null);

  // [Claude] — 2026-10-03 — La « vrille » (vidéo de Narcisse) : les notes duraient jusqu'à la
  // fin du passage et s'empilaient.
  const pile = Array.from({ length: 30 }, (_, i) => ({ midi: 40 + i * 2, start: 4 + i * 0.6, end: 24 }));
  const piled = passageExample(pile, { start: 4, end: 24 });
  let now = 0;
  let max = 0;
  for (const e of piled.events) { now += e.type === 'noteOn' ? 1 : -1; max = Math.max(max, now); }
  check('Rejeu : jamais plus de 10 notes ensemble', max <= 10, `max ${max}`);
  const durations = [];
  const on = new Map();
  for (const e of piled.events) {
    if (e.type === 'noteOn') on.set(e.note, e.time);
    else if (e.type === 'noteOff') durations.push(e.time - on.get(e.note));
  }
  check('Rejeu : une note dure 2,5 s au plus', durations.every((d) => d <= 2.5 + 1e-9), Math.max(...durations).toFixed(2));

  // [Claude] — 2026-10-03 — Amazing Grace, 9:57 → 10:57 : « il joue comme s'il n'avait pas de
  // pédale, le jeu devient saccadé ». Pédale à chaque accord (nouvelle basse de main gauche).
  const pedalOf = (ex) => ex.events.filter((e) => e.type === 'sustain').map((e) => `${e.value ? '↓' : '↑'}${e.time}`).join(' ');
  const twoChords = [
    { midi: 36, start: 0, end: 0.5, hand: 'lh' }, ...[60, 64, 67].map((midi) => ({ midi, start: 0.01, end: 0.4, hand: 'rh' })),
    { midi: 41, start: 2, end: 2.5, hand: 'lh' }, ...[65, 69, 72].map((midi) => ({ midi, start: 2.01, end: 2.4, hand: 'rh' })),
  ];
  const harmonic = passageExample(twoChords, { start: 0, end: 3 });
  check('Rejeu : pédale enfoncée après chaque accord, relevée juste avant le suivant', pedalOf(harmonic) === '↓0.04 ↑1.98 ↓2.04 ↑2.8', pedalOf(harmonic));
  check('Rejeu : le sous-titre le dit (« pédale à chaque accord »)', /pédale à chaque accord/.test(harmonic.subtitle), harmonic.subtitle);
  const heard = passageExample(twoChords, { start: 0, end: 3, pedals: [{ start: 0.1, end: 1.9 }] });
  check('Rejeu : la vraie pédale, quand le son l\'a relevée, remplace la pédale par accord', pedalOf(heard) === '↓0.1 ↑1.9' && /avec sa pédale/.test(heard.subtitle), `${pedalOf(heard)} — ${heard.subtitle}`);

  // Il joue Do, s'arrête pour expliquer (11 s), puis joue Mi : la pause est ramenée à 2 s,
  // signalée, et la pédale est relevée pendant ce temps.
  const talk = [{ start: 1.2, end: 11.5, kind: 'parle' }];
  const gap = passageExample([{ midi: 60, start: 0, end: 1 }, { midi: 64, start: 12, end: 13 }], { start: 0, end: 14, speech: talk });
  const second = gap.events.find((e) => e.type === 'noteOn' && e.note === 64).time;
  check('Rejeu : une explication de 11 s est ramenée à 2 s', Math.abs(second - 3) < 0.01, `${second}`);
  check('Rejeu : la pause est signalée (« le prof explique », avec ses instants dans la vidéo)',
    JSON.stringify(gap.markers) === JSON.stringify([{ at: 1, until: 3, videoStart: 1, videoEnd: 12, kind: 'parle' }]) && /explications raccourcies à 2 s/.test(gap.subtitle),
    `${JSON.stringify(gap.markers)} — ${gap.subtitle}`);
  check('Rejeu : la pédale est relevée pendant l\'explication', pedalOf(gap) === '↓0.04 ↑1.3 ↓3 ↑4.3', pedalOf(gap));
  check('Rejeu : temps de l\'exemple → temps de la vidéo (pour la barre de lecture)', JSON.stringify(gap.timeMap) === JSON.stringify([[0, 0], [1, 1], [3, 12], [4, 13]]), JSON.stringify(gap.timeMap));
  const silent = passageExample([{ midi: 60, start: 0, end: 1 }, { midi: 64, start: 12, end: 13 }], { start: 0, end: 14 });
  check('Rejeu : une pause sans parole est aussi ramenée à 2 s, notée « pause »', silent.markers.length === 1 && silent.markers[0].kind === 'pause');
  const leading = passageExample([{ midi: 60, start: 20, end: 21 }], { start: 4, end: 24, speech: [{ start: 4, end: 19.5, kind: 'parle' }] });
  check('Rejeu : il parle d\'abord (0:04 → 0:20) : 2 s signalées, puis ses notes',
    leading.events.find((e) => e.type === 'noteOn').time === 2 && leading.markers[0]?.kind === 'parle', JSON.stringify(leading.markers));
  const quiet = passageExample([{ midi: 60, start: 20, end: 21 }], { start: 4, end: 24 });
  check('Rejeu : un silence en tête, sans parole, est sauté', quiet.events.find((e) => e.type === 'noteOn').time <= 0.3 && !quiet.markers.length);
  // [Claude] — 2026-10-03 — Sa note (0:20 dans la vidéo) est à 0,3 s dans l'exemple : la barre de
  // lecture doit dire « dans la vidéo : 0:20 », pas 0:07.
  check('Rejeu : le silence sauté compte dans le temps de la vidéo', JSON.stringify(quiet.timeMap) === JSON.stringify([[0, 19.7], [1.3, 21]]), JSON.stringify(quiet.timeMap));
}

/**
 * Ce qui sonne quand on rejoue les évènements : pour chaque note, son attaque, le lever du
 * doigt et la fin du son (la pédale prolonge une note relâchée jusqu'à sa remontée).
 */
function sounding(events) {
  let pedal = false;
  const open = new Map();
  const done = [];
  const close = (v, t) => { v.end = Math.round(t * 1000) / 1000; done.push(v); };
  for (const e of events) {
    if (e.type === 'sustain') {
      pedal = e.value;
      if (!pedal) for (const [k, v] of [...open]) if (v.off !== null) { close(v, e.time); open.delete(k); }
    } else if (e.type === 'noteOn') {
      const prev = open.get(e.note);
      if (prev) close(prev, e.time);
      open.set(e.note, { note: e.note, on: e.time, off: null });
    } else if (e.type === 'noteOff') {
      const v = open.get(e.note);
      if (!v) continue;
      v.off = Math.round(e.time * 1000) / 1000;
      if (!pedal) { close(v, e.time); open.delete(e.note); }
    }
  }
  for (const v of open.values()) close(v, Infinity);
  // Dans l'ordre des attaques (celui des notes du passage).
  return done.sort((a, b) => a.on - b.on || a.note - b.note);
}
const endOf = (list, note) => list.find((v) => v.note === note)?.end;
const at = (list, t) => list.filter((v) => v.on <= t && v.end > t).map((v) => v.note).sort((a, b) => a - b).join(' ');

// [Claude] — 2026-10-04 — Notes d'approche sous la pédale (Narcisse : « copilot gère mal quand
// il y a un mélange de grace note (montée ou descente chromatique) et pédale de sustain : ça crée
// des dissonances qui n'ont pas lieu d'être »).
function testApproachNotes() {
  const names = (notes) => [...approachNotes(notes)].map((n) => n.midi).sort((a, b) => a - b).join(' ');
  check('Approche enchaînée : Ré♯5 (0,12 s) puis Mi5', names([{ midi: 75, start: 0, end: 0.12, hand: 'rh' }, { midi: 76, start: 0.12, end: 1, hand: 'rh' }]) === '75');
  check('Approche détachée : Ré5 relâché avant Ré♯5', names([{ midi: 74, start: 0, end: 0.12, hand: 'rh' }, { midi: 75, start: 0.25, end: 0.5, hand: 'rh' }]) === '74');
  check('Montée chromatique Do5 → Do♯5 → Ré5 : toutes sauf la dernière',
    names([{ midi: 72, start: 0, end: 0.12, hand: 'rh' }, { midi: 73, start: 0.12, end: 0.24, hand: 'rh' }, { midi: 74, start: 0.24, end: 1, hand: 'rh' }]) === '72 73');
  check('Broderie La5 → La♯5 → La5 : les deux premières',
    names([{ midi: 81, start: 0, end: 0.13, hand: 'rh' }, { midi: 82, start: 0.13, end: 0.25, hand: 'rh' }, { midi: 81, start: 0.25, end: 0.5, hand: 'rh' }]) === '81 82');
  check('Écrasée : Ré♯5 attaqué avec Mi5 tenu, relâché bien avant',
    names([{ midi: 75, start: 0, end: 0.1, hand: 'rh' }, { midi: 76, start: 0, end: 1, hand: 'rh' }, { midi: 67, start: 0, end: 1, hand: 'rh' }]) === '75');
  check('Amas bref Do5 + Do♯5 écrasés ensemble : les deux',
    names([{ midi: 72, start: 0, end: 0.12, hand: 'rh' }, { midi: 73, start: 0, end: 0.12, hand: 'rh' }, { midi: 74, start: 0.12, end: 0.5, hand: 'rh' }]) === '72 73');
  check('Un accord bref avec un demi-ton (Si Do Mi Sol) n\'en est pas, même lu une image de travers',
    names([59, 60, 64, 67].map((midi) => ({ midi, start: 0, end: 0.25, hand: 'rh' }))) === ''
    && names([{ midi: 59, start: 0, end: 0.13, hand: 'rh' }, ...[60, 64, 67].map((midi) => ({ midi, start: 0, end: 0.25, hand: 'rh' }))]) === '');
  check('Pas une approche : note longue, autre main, ou tenue après l\'attaque de sa voisine',
    names([{ midi: 75, start: 0, end: 0.5, hand: 'rh' }, { midi: 76, start: 0.5, end: 1, hand: 'rh' }]) === ''
    && names([{ midi: 59, start: 0, end: 0.2, hand: 'lh' }, { midi: 60, start: 0.2, end: 1, hand: 'rh' }]) === ''
    && names([{ midi: 74, start: 0, end: 0.3, hand: 'rh' }, { midi: 75, start: 0.15, end: 1, hand: 'rh' }]) === '');
  check('Accord de passage un demi-ton au-dessus (main droite seule) : ses notes mènent à l\'accord suivant',
    names([...[61, 65, 68].map((midi) => ({ midi, start: 0, end: 0.25, hand: 'rh' })), ...[60, 64, 67].map((midi) => ({ midi, start: 0.25, end: 1, hand: 'rh' }))]) === '61 65 68');

  // Accord de Do (basse brève, relâchée tôt) avec Ré♯5 écrasé, qui mène à Mi5 ; puis Fa.
  const crush = [
    { midi: 48, start: 0, end: 0.1, hand: 'lh' }, ...[64, 67, 72].map((midi) => ({ midi, start: 0, end: 1.5, hand: 'rh' })),
    { midi: 75, start: 0, end: 0.12, hand: 'rh' }, { midi: 76, start: 0.12, end: 1.8, hand: 'rh' },
    { midi: 41, start: 2, end: 2.5, hand: 'lh' }, ...[69, 72, 77].map((midi) => ({ midi, start: 2.01, end: 2.4, hand: 'rh' })),
  ];
  const crushed = passageExample(crush, { start: 0, end: 3 });
  const s1 = sounding(crushed.events);
  const pedalOf = (ex) => ex.events.filter((e) => e.type === 'sustain').map((e) => `${e.value ? '↓' : '↑'}${e.time}`).join(' ');
  check('Ré♯5 écrasé avec l\'accord : la pédale attend la fin de l\'approche (↓0,16), puis change avec l\'accord suivant',
    pedalOf(crushed) === '↓0.16 ↑1.98 ↓2.04 ↑2.8', pedalOf(crushed));
  check('… Ré♯5 s\'éteint à l\'attaque de Mi5 ; Mi5, l\'accord et la basse sonnent jusqu\'au changement (1,98)',
    endOf(s1, 75) === 0.12 && [76, 64, 67, 48].every((m) => endOf(s1, m) === 1.98) && at(s1, 1) === '48 64 67 72 76', `${endOf(s1, 75)} | ${at(s1, 1)}`);
  // (Une note rejouée dure 0,05 s au moins depuis le 09/10 — 0,12 s avant : la basse se lève à sa
  // vraie fin, 0,1 s.)
  check('… la basse relâchée tôt est tenue au doigt jusqu\'à la pédale (0,21), sa vraie fin (0,1) gardée pour le mode sans pédale',
    crushed.events.some((e) => e.type === 'noteOff' && e.note === 48 && Math.abs(e.time - 0.21) < 1e-9 && Math.abs(e.withoutPedalAt - 0.1) < 1e-9));

  // Fa♯5 → Sol5 au milieu d'une harmonie de Sol.
  const line = [
    { midi: 43, start: 0, end: 0.4, hand: 'lh' }, ...[59, 62, 65].map((midi) => ({ midi, start: 0.01, end: 0.5, hand: 'rh' })),
    { midi: 74, start: 0.6, end: 0.85, hand: 'rh' }, { midi: 78, start: 1, end: 1.15, hand: 'rh' }, { midi: 79, start: 1.15, end: 1.75, hand: 'rh' },
  ];
  const middle = passageExample(line, { start: 0, end: 3 });
  const s2 = sounding(middle.events);
  check('Fa♯5 → Sol5 au milieu de l\'harmonie : la pédale se relève au lever de Fa♯5 et se rabaisse 0,04 s après',
    pedalOf(middle) === '↓0.04 ↑1.15 ↓1.19 ↑2.05', pedalOf(middle));
  check('… Fa♯5 ne sonne plus avec Sol5 ; la basse, l\'accord et Ré5 sonnent jusqu\'au bout comme avant',
    endOf(s2, 78) === 1.15 && [43, 59, 62, 65, 74, 79].every((m) => endOf(s2, m) === 2.05) && at(s2, 1.5) === '43 59 62 65 74 79', `${endOf(s2, 78)} | ${at(s2, 1.5)}`);
  const free = sounding(withoutPedal(middle.events));
  check('Sans la pédale : chaque note s\'arrête quand le doigt se lève (rien n\'est prolongé)',
    free.every((v) => v.end === v.off) && endOf(free, 43) === 0.4 && endOf(free, 74) === 0.85, free.map((v) => `${v.note}:${v.off}/${v.end}`).join(' '));
  const heard = passageExample(line, { start: 0, end: 3, pedals: [{ start: 0, end: 2 }] });
  const s3 = sounding(heard.events);
  check('Sa vraie pédale (relevée au son) est changée de même',
    pedalOf(heard) === '↓0 ↑1.15 ↓1.19 ↑2' && endOf(s3, 78) === 1.15 && endOf(s3, 43) === 2 && /avec sa pédale/.test(heard.subtitle), pedalOf(heard));

  // Montée chromatique Do5 → Do♯5 → Ré5 sur un accord de Do.
  const run = [
    { midi: 48, start: 0, end: 0.5, hand: 'lh' }, ...[64, 67].map((midi) => ({ midi, start: 0, end: 0.5, hand: 'rh' })),
    { midi: 72, start: 1, end: 1.12, hand: 'rh' }, { midi: 73, start: 1.12, end: 1.24, hand: 'rh' }, { midi: 74, start: 1.24, end: 2, hand: 'rh' },
  ];
  const s4 = sounding(passageExample(run, { start: 0, end: 3 }).events);
  check('Montée chromatique Do5 → Do♯5 → Ré5 : seule Ré5 reste, avec l\'accord',
    at(s4, 1.5) === '48 64 67 74' && endOf(s4, 72) === 1.12 && endOf(s4, 73) === 1.24, at(s4, 1.5));

  // Sans note d'approche : rien ne change (même pédale, aucune note tenue au doigt).
  const plain = [
    { midi: 36, start: 0, end: 0.5, hand: 'lh' }, ...[60, 64, 67].map((midi) => ({ midi, start: 0.01, end: 0.4, hand: 'rh' })),
    { midi: 41, start: 2, end: 2.5, hand: 'lh' }, ...[65, 69, 72].map((midi) => ({ midi, start: 2.01, end: 2.4, hand: 'rh' })),
  ];
  const same = passageExample(plain, { start: 0, end: 3 });
  check('Sans note d\'approche : la pédale ne change pas, aucune note n\'est tenue au doigt',
    pedalOf(same) === '↓0.04 ↑1.98 ↓2.04 ↑2.8' && !same.events.some((e) => 'withoutPedalAt' in e));

  // Son vrai relevé : « L'Éternel est bon » (48 s, clavier dessiné lu à l'image). Avant la
  // correction, 8 de ses 11 notes d'approche sonnaient encore après le doigt, 5 s en tout
  // (Do♯5 1,23 s ; Ré♯5 0,98 s ; La♯5 1,11 s), un demi-ton à côté de leur note d'arrivée.
  const eternel = JSON.parse(readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'eternel-est-bon.json'), 'utf-8'));
  const picked = guessHands(notesInRange(eternel.noteEvents, 0, 48)).sort((a, b) => a.start - b.start || a.midi - b.midi);
  const found = approachNotes(picked);
  check('« L\'Éternel est bon » : ses 11 notes d\'approche (Do5 Do♯5 → Ré5, Ré♯5 → Ré5, La5 La♯5 → La5…)',
    [...found].map((n) => n.midi).join(' ') === '72 73 70 72 73 74 75 74 75 81 82', [...found].map((n) => n.midi).join(' '));
  const solo = passageExample(eternel.noteEvents, { start: 0, end: 48 });
  const soloSound = sounding(solo.events);
  const isApproach = (i) => found.has(picked[i]);
  check('… aucune ne sonne plus après le lever du doigt',
    soloSound.every((v, i) => !isApproach(i) || v.end === v.off), soloSound.filter((v, i) => isApproach(i) && v.end !== v.off).map((v) => v.note).join(' '));
  const others = soloSound.filter((v, i) => !isApproach(i));
  const total = others.reduce((s, v) => s + (v.end - v.on), 0);
  check('… et ses 144 autres notes sonnent comme avant (214,49 s de son, 132 prolongées par la pédale)',
    others.length === 144 && Math.abs(total - 214.49) < 0.01 && others.filter((v) => v.end > v.off).length === 132,
    `${others.length} notes, ${total.toFixed(2)} s, ${others.filter((v) => v.end > v.off).length} prolongées`);
}

testSamples();
testTranscription();
testHands();
testRangeAndTimeline();
testTranspose();
// [Claude] — 2026-10-09 — Grace notes d'un ton, runs rapides sous la pédale.
function testGraceAndRuns() {
  console.log('\n--- Grace notes d\'un ton, runs rapides sous la pédale ---');
  const names = (notes) => [...approachNotes(notes)].map((n) => n.midi).sort((a, b) => a - b).join(' ');
  check('Grace note d\'un ton : Ré5 très bref → Mi5 tenu (Ré5 est une note d\'approche)',
    names([{ midi: 74, start: 0, end: 0.06, hand: 'rh' }, { midi: 76, start: 0.06, end: 0.8, hand: 'rh' }]) === '74');
  check('Grace d\'un ton écrasée avec sa note d\'arrivée (Ré5 + Mi5 attaqués ensemble, Ré5 lâché tout de suite)',
    names([{ midi: 74, start: 0, end: 0.05, hand: 'rh' }, { midi: 76, start: 0, end: 0.9, hand: 'rh' }]) === '74');
  check('Mais une gamme par tons (Do Ré Mi Fa♯, notes égales) n\'a pas de grace note',
    names([72, 74, 76, 78].map((midi, i) => ({ midi, start: i * 0.25, end: i * 0.25 + 0.24, hand: 'rh' }))) === '');
  check('Ni un ton vers une note pas plus tenue qu\'elle (Fa5 0,12 s → Sol5 0,25 s)',
    names([{ midi: 77, start: 0, end: 0.12, hand: 'rh' }, { midi: 79, start: 0.12, end: 0.37, hand: 'rh' }]) === '');

  // Accord de Do tenu (basse + main droite), puis un lick qui descend de Do6 à Ré3 en 1,5 s
  // (une note toutes les 70 ms), puis Fa.
  const WHITE = [0, 2, 4, 5, 7, 9, 11];
  const run = [];
  for (let m = 84; m >= 50 && run.length < 21; m -= 1) if (WHITE.includes(m % 12)) run.push(m);
  const notes = [
    { midi: 36, start: 0, end: 3.5, hand: 'lh' }, ...[40, 43, 46].map((midi) => ({ midi, start: 0, end: 0.6, hand: 'lh' })),
    ...run.map((midi, i) => ({ midi, start: 1 + i * 0.07, end: 1 + i * 0.07 + 0.06, hand: 'rh' })),
    { midi: 41, start: 3.6, end: 4.5, hand: 'lh' }, ...[69, 72, 77].map((midi) => ({ midi, start: 3.6, end: 4.5, hand: 'rh' })),
  ];
  const runSet = runNotes(guessHands(notes).sort((a, b) => a.start - b.start || a.midi - b.midi));
  check(`Le lick de ${run.length} notes est reconnu comme un run (toutes sauf la dernière)`, runSet.length === run.length - 1);
  const ex = passageExample(notes, { start: 0, end: 5 });
  const v = sounding(ex.events);
  const runEnd = 1 + (run.length - 1) * 0.07 + 0.06;
  const pileUp = Math.max(...run.map((m, i) => at(v, 1 + i * 0.07 + 0.03).split(' ').filter((x) => run.includes(Number(x))).length));
  check(`Sous la pédale, les notes du run ne s'empilent plus (au plus ${pileUp} ensemble)`, pileUp <= 2);
  check('… la basse Do2 sonne toujours pendant le run (tenue au doigt)', at(v, 1.5).split(' ').includes('36'));
  check('… la dernière note du run (Ré3) est reprise par la pédale et sonne jusqu\'à Fa',
    (endOf(v, run[run.length - 1]) ?? 0) > runEnd + 0.5, String(endOf(v, run[run.length - 1])));
  const rate = passageExample(run.map((midi, i) => ({ midi, start: i * 0.07, end: i * 0.07 + 0.06, hand: 'rh' })), { start: 0, end: 2 });
  const shortest = Math.min(...sounding(rate.events).map((x) => x.end - x.on));
  check(`Les notes d'un run gardent leur durée (60 ms), au lieu d'être allongées à 120 ms (la plus courte : ${Math.round(shortest * 1000)} ms)`, shortest < 0.1);
}

testPassageExample();
testApproachNotes();
testGraceAndRuns();

// [Claude] — 2026-10-09 — Un montuno de salsa relevé au son (« Clase dos », 5:29–5:37) : notes
// courtes et répétées, sans pédale. Le rejeu doit rester détaché (aucune pédale ajoutée, ni celle,
// trompeuse, de la transcription), chaque attaque à sa place, avec ses accents.
function testSalsaMontuno() {
  const beat = 60 / 190;
  const notes = [];
  const pattern = [0, 1.5, 2.5, 3, 4, 5.5, 6.5, 7]; // en croches, syncopé
  for (let bar = 0; bar < 4; bar += 1) {
    const t0 = 5 * 60 + 29 + bar * 4 * beat;
    pattern.forEach((e, k) => {
      const t = t0 + (e / 2) * beat;
      const accent = e % 1 !== 0 ? 0.85 : 0.5;
      for (const midi of [72 + (k % 3 === 0 ? 0 : 4), 84 + (k % 3 === 0 ? 0 : 4)]) notes.push({ midi, start: Math.round(t * 1000) / 1000, end: Math.round((t + 0.11) * 1000) / 1000, velocity: accent });
    });
    for (const e of [1.5, 3]) notes.push({ midi: 41, start: Math.round((t0 + e * beat) * 1000) / 1000, end: Math.round((t0 + e * beat + 0.18) * 1000) / 1000, velocity: 0.7 });
  }
  notes.sort((a, b) => a.start - b.start || a.midi - b.midi);
  const from = 5 * 60 + 29;
  const plain = passageExample(notes, { start: from, end: from + 8 });
  const pedalOf = (ex) => ex.events.filter((e) => e.type === 'sustain').length;
  check('Montuno : aucune pédale ajoutée (jeu détaché)', pedalOf(plain) === 0 && /détaché/.test(plain.subtitle), plain.subtitle);
  const withSoundPedal = passageExample(notes, { start: from, end: from + 8, pedals: [{ start: from - 1, end: from + 9 }] });
  check('Montuno : la pédale que la transcription croit entendre est retirée aussi', pedalOf(withSoundPedal) === 0);
  const ons = plain.events.filter((e) => e.type === 'noteOn');
  const offs = plain.events.filter((e) => e.type === 'noteOff');
  check(`Montuno : toutes les attaques, à leur place (${ons.length} / ${notes.length})`, ons.length === notes.length
    && notes.every((n) => ons.some((e) => Math.abs(e.time - (n.start - notes[0].start)) < 0.002 && e.note === n.midi)));
  check('Montuno : chaque note s\'arrête court (0,11 à 0,18 s), rien ne traîne', offs.every((e) => !(e.withoutPedalAt > 0)) && ons.every((on) => {
    const off = offs.find((e) => e.note === on.note && e.time > on.time);
    return off && off.time - on.time <= 0.19;
  }));
  const strong = ons.filter((e) => e.velocity >= 0.75).length;
  const soft = ons.filter((e) => e.velocity <= 0.6).length;
  check(`Montuno : les accents du pianiste restent (${strong} attaques fortes, ${soft} douces)`, strong >= 16 && soft >= 16);
  // Et une ballade gardée telle quelle : sa pédale à chaque accord reste.
  const ballad = [];
  for (let k = 0; k < 4; k += 1) for (const midi of [48, 55, 64, 71]) ballad.push({ midi, start: k * 2, end: k * 2 + 0.4 });
  check('Ballade (accords brefs, peu nombreux) : pédale à chaque accord gardée', pedalOf(passageExample(ballad, { start: 0, end: 8 })) > 0);
}
testSalsaMontuno();

console.log(`\n=== Résultat : ${passed}/${passed + failed} tests passés ===`);
process.exit(failed === 0 ? 0 : 1);
