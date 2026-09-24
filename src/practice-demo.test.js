// [Claude] — 2026-09-24 — Tests de la démo des mouvements (Gospel / worship,
// Ballade, Comping swing, Plaqué) et de son lecteur.
// [Claude] — 2026-09-24 (soir) — Démo jouable comme au clavier (Narcisse : « ça
// sonne pas réaliste », « j'ai pas de pédale de sustain », vidéo de son jeu) :
// deux mains, aucune pédale, basse ajoutée seulement à une main gauche qui la
// tient, voix du dessus qui bouge, montée finale.
// Exécution : node src/practice-demo.test.js

import { createPracticeExercise, listMovementNames } from './practice-exercise.js';
import {
  buildDemo, buildGospelDemo, cardHands, demoHands, freeBass, topNeighbour, finalRun, strideSplit,
  octaveFrame, passingDiminished, passingName, demoPassingChords, demoCardHands, DEMO_STYLES, DEMO_STYLE_IDS, defaultDemoStyle,
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

/** Accord de test : fondamentale, qualité, mains de la carte. */
const chordOf = (rootPc, symbol, lh, rh, technique = 'close') => ({
  rootPc, symbol, name: symbol, notes: [...lh, ...rh], voicing: { leftHand: lh, rightHand: rh, technique },
});

/**
 * Problèmes de jeu d'une démo : pédale, plus de deux mains (5 doigts, une 10e
 * par main, mains croisées), appuis / relâchements, notes de la carte absentes.
 */
function playabilityProblems(demo, grid, beatsPerChord = 4) {
  const out = [];
  if (demo.events.some((e) => e.type === 'sustain')) out.push('pédale');
  if (demo.events.some((e, k) => k > 0 && demo.events[k - 1].time > e.time)) out.push('ordre');
  const held = new Map();
  for (const t of [...new Set(demo.events.map((e) => e.time))]) {
    for (const e of demo.events.filter((x) => x.time === t)) {
      const key = `${e.hand}:${e.note}`;
      if (e.type === 'noteOff') {
        if (!held.has(key)) out.push(`relâchement sans appui ${e.note}@${t}`);
        held.delete(key);
      }
      if (e.type === 'noteOn') {
        if (!['lh', 'rh'].includes(e.hand)) out.push(`main inconnue ${e.note}@${t}`);
        if (held.has(key)) out.push(`double appui ${e.note}@${t}`);
        if (e.note < 28 || e.note > 96 || e.velocity < 0.3 || e.velocity > 1) out.push(`note / nuance ${e.note}@${t}`);
        held.set(key, e.note);
      }
    }
    const lh = [...held.entries()].filter(([k]) => k.startsWith('lh')).map(([, n]) => n);
    const rh = [...held.entries()].filter(([k]) => k.startsWith('rh')).map(([, n]) => n);
    const span = (a) => (a.length ? Math.max(...a) - Math.min(...a) : 0);
    if (lh.length > 5 || rh.length > 5 || span(lh) > 16 || span(rh) > 16) out.push(`main trop chargée @${t}`);
    if (lh.length && rh.length && Math.max(...lh) >= Math.min(...rh)) out.push(`mains croisées @${t}`);
  }
  if (held.size) out.push('notes jamais relâchées');
  if (demo.events.filter((e) => e.type === 'step').length !== grid.length) out.push('repères');
  grid.forEach((c, i) => {
    const { lh, rh } = cardHands(c);
    const played = new Set(demo.events.filter((e) => e.type === 'noteOn' && e.time >= i * beatsPerChord && e.time < (i + 1) * beatsPerChord).map((e) => e.note));
    if (![...lh, ...rh].every((n) => played.has(n))) out.push(`carte de ${c.name} incomplète`);
  });
  return out;
}

console.log('\n=== Démo : mains ===');
check('Carte lue main par main', JSON.stringify(cardHands(chordOf(7, 'm11', [55, 60], [70, 77]))) === JSON.stringify({ lh: [55, 60], rh: [70, 77] }));
check('Sans mains : tout à la main droite', JSON.stringify(cardHands({ rootPc: 0, notes: [64, 60, 67] })) === JSON.stringify({ lh: [], rh: [60, 64, 67] }));
check('Main gauche libre : fondamentale + quinte, comme G2 D3 dans la vidéo (Gm11)', freeBass(chordOf(7, 'm11', [], [58, 60, 65, 70]), 'fifth', 58).join() === '43,50');
check('Quinte altérée : fondamentale + septième (F7alt → F2 Eb3)', freeBass(chordOf(5, '7alt', [], [57, 59, 63, 68]), 'fifth', 57).join() === '41,51');
check('Main droite basse : la basse descend d\'une octave (C, main droite à D3 → C2 G2)', freeBass(chordOf(0, 'maj7', [], [50, 55, 59]), 'fifth', 50).join() === '36,43');
check('Fondamentale seule en swing, à l\'octave 2 (D2)', freeBass(chordOf(2, 'm7', [], [60, 65, 69]), 'root', 60).join() === '38');
// [Claude] — 2026-09-24 — Procédés du tutoriel gospel envoyé par Narcisse.
check('Dominante : fondamentale + 7e (G13 → G2 F3, comme le tutoriel gospel)', freeBass(chordOf(7, '13', [], [59, 64, 65, 67]), 'fifth', 59).join() === '43,53');
check('7e trop grave sous Fa2 (Levine) : une octave plus haut (C13 → C3 Bb3)', freeBass(chordOf(0, '13', [], [64, 69, 70, 72]), 'fifth', 64).join() === '48,58');
check('Cadre d\'octave : le dessus doublé plus bas (D4 F4 G4 C5 → C4 D4 F4 G4 C5)', octaveFrame([62, 65, 67, 72]).join() === '60,62,65,67,72');
check('Cadre d\'octave refusé s\'il crée une seconde mineure (C4 E4 A4 B4 : B3 contre C4)', octaveFrame([60, 64, 69, 71]).join() === '60,64,69,71');
const toDm = passingDiminished(chordOf(0, '', [], [60, 64, 67, 72]), chordOf(2, 'm7', [], [62, 65, 69, 72]),
  { lh: [36, 43], rh: [60, 64, 67, 72] }, { lh: [38, 45], rh: [62, 65, 69, 72] });
check('Diminué de passage C → C#°7 → Dm : basse C#2, voix à un demi-ton au plus', toDm?.lh.join() === '37' && toDm?.rh.join() === '61,64,67,73', toDm && `${toDm.lh} | ${toDm.rh}`);
const toG = passingDiminished(chordOf(2, 'm11', [], [60, 62, 65, 67, 72]), chordOf(7, '13', [], [59, 64, 65, 67]),
  { lh: [38, 45], rh: [60, 62, 65, 67, 72] }, { lh: [43, 53], rh: [59, 64, 65, 67] });
check('Dm11 → F#°7 → G13 : basse F#2, sensible de la basse suivante', toG?.lh.join() === '42' && toG.rh.every((n) => [6, 9, 0, 3].includes(n % 12)), toG && `${toG.lh} | ${toG.rh}`);
check('Pas de diminué quand la basse ne monte ni d\'un ton ni d\'une quarte (C → Am)',
  passingDiminished(chordOf(0, '', [], [60, 64, 67]), chordOf(9, 'm7', [], [60, 64, 67]), { lh: [36, 43], rh: [60, 64, 67] }) === null);
// Le cas de Narcisse : Drop 2-4 de Gm11, G3 C4 | Bb4 F5 — plus de G1 G2 dessous.
const gm11 = demoHands(chordOf(7, 'm11', [55, 60], [70, 77], 'drop2_4'), 'fifth');
check('Drop 2-4 de Gm11 : pas de troisième main (G2 ne tient pas avec C4)', gm11.lh.join() === '55,60' && gm11.bass.length === 0, gm11.lh.join());
const cDrop2 = demoHands(chordOf(0, 'maj7', [55], [60, 64, 71], 'drop2'), 'fifth');
check('Drop 2 de Cmaj7 (G3 | C4 E4 B4) : la main gauche prend C3 avec G3', cDrop2.lh.join() === '48,55', cDrop2.lh.join());
const spreadBb = demoHands(chordOf(10, 'maj7#11', [46], [62, 64, 69], 'spread'), 'fifth');
check('Spread (basse déjà à la main gauche) : rien d\'ajouté', spreadBb.lh.join() === '46');
const stride = strideSplit(chordOf(0, 'maj7', [43, 52, 55, 59], [], 'stride'), [43, 52, 55, 59]);
check('Stride : basse puis accord (G2 | E3 G3 B3)', stride?.bass.join() === '43' && stride?.chord.join() === '52,55,59');
check('Voix du dessus : Bb4 → A4 sur Gm11 (la 9e, comme dans la vidéo)', topNeighbour(chordOf(7, 'm11', [43, 50], [58, 60, 65, 70]), [43, 50], [58, 60, 65, 70], 69) === 69);
check('Voix du dessus : jamais une note hors de l\'accord (F, A4 vers G4 → rien)', topNeighbour(chordOf(5, '', [41, 48], [60, 65, 69]), [41, 48], [60, 65, 69], 67) === null);
check('Voix du dessus : immobile si le dessus suivant est le même', topNeighbour(chordOf(7, 'm11', [43, 50], [58, 60, 65, 70]), [43, 50], [58, 60, 65, 70], 70) === null);
const run = finalRun(chordOf(5, 'maj9', [41, 48], [57, 60, 64, 67]), [57, 60, 64, 67], [41, 48]);
check('Montée finale 1-2-5 : F4 G4 C5 F5 G5 C6 F6 (deux octaves, terminée sur la fondamentale)', run.join() === '65,67,72,77,79,84,89', run.join());
check('Pas de montée sur un accord altéré', finalRun(chordOf(5, '7alt', [41, 51], [57, 59, 63, 68]), [57, 59, 63, 68]).length === 0);

// [Claude] — 2026-09-24 — Voice leading choisi (Narcisse : « sur le do, il faut tel
// voice leading (si, ré…) ») : la démo garde la mélodie telle quelle.
console.log('\n=== Démo : mélodie choisie ===');
{
  const ex = createPracticeExercise();
  ex.setTechnique('auto');
  ex.setKeyChoice(0);
  ex.setCustomGrid([{ name: 'Cmaj7', top: 11 }, { name: 'Dm7', top: 10 }, { name: 'G7', top: 10 }, { name: 'Cmaj7', top: 4 }]);
  const grid = ex.getState().progression.chords;
  for (const style of DEMO_STYLE_IDS) {
    const demo = buildDemo(grid, style);
    // Dessus de la main droite dans chaque mesure, hors accord de passage (4e temps).
    const tops = grid.map((c, i) => {
      const bar = demo.events.filter((e) => e.type === 'noteOn' && e.hand === 'rh' && e.time >= i * 4 && e.time < (i === grid.length - 1 ? Infinity : i * 4 + 3));
      return bar.length ? Math.max(...bar.map((e) => e.note)) % 12 : null;
    });
    check(`${DEMO_STYLES[style].label} : mélodie B → C → F → E jouée telle quelle (ni broderie, ni montée finale)`, tops.join() === '11,0,5,4', tops.join());
    check(`${DEMO_STYLES[style].label} : grille à mélodie jouable à deux mains, sans pédale`, playabilityProblems(demo, grid).length === 0, playabilityProblems(demo, grid).slice(0, 3).join(' ; '));
  }
}

console.log('\n=== Démo : grille complète ===');
const chords = movement('Cadence II-V-I majeur');
const { events, beats } = buildGospelDemo(chords);
check('Une mesure de 4 temps par accord (+ un temps pour la montée finale)', beats >= chords.length * 4 && beats <= chords.length * 4 + 1.1, String(beats));
const steps = events.filter((e) => e.type === 'step');
check('Un repère par accord, dans l\'ordre, sur le 1er temps', steps.map((e) => `${e.step}@${e.time}`).join() === chords.map((_, i) => `${i}@${i * 4}`).join());
check('Gospel / worship : jouable à deux mains, sans pédale, la carte entière', playabilityProblems({ events, beats }, chords).length === 0, playabilityProblems({ events, beats }, chords).slice(0, 3).join(' ; '));
const onsets = (demo, from, to, hand) => demo.events.filter((e) => e.type === 'noteOn' && e.time >= from && e.time < to && (!hand || e.hand === hand));
const spreadOf = (list) => Math.max(...list.map((e) => e.time)) - Math.min(...list.map((e) => e.time));
check('Accords égrenés du grave à l\'aigu, le premier plus lentement', spreadOf(onsets({ events }, 0, 1)) > spreadOf(onsets({ events }, 4, 5)) && spreadOf(onsets({ events }, 4, 5)) > 0);
check('Accords tenus, pas rejoués : une attaque par note jusqu\'au 4e temps', chords.slice(0, -1).every((c, i) => {
  const { lh, rh } = demoHands(c, 'fifth');
  return [...lh, ...rh].every((n) => onsets({ events }, i * 4, i * 4 + 3).filter((e) => e.note === n).length === 1);
}));
// II-V-I en Do : F#°7 vers G13 au 4e temps (basse chromatique) ; rien après G13, dominante.
const passingBass = [3, 7].map((beat) => onsets({ events }, beat, beat + 0.01, 'lh').map((e) => e.note).join());
check('Diminué de passage au 4e temps (F#2 vers G2), pas après la dominante', passingBass.join('|') === '42|', passingBass.join('|'));
check('Pas de diminué après une dominante (G7 → C)', passingDiminished(chordOf(7, '7', [], [59, 65, 67]), chordOf(0, 'maj7', [], [59, 64, 67]),
  { lh: [43, 53], rh: [59, 65, 67] }, { lh: [36, 43], rh: [59, 64, 67] }) === null);
check('Pas de cadre d\'octave sous Fa3 (rootless F3 G3 A3 C4 : pas de C3)', onsets({ events }, 0, 1, 'rh').map((e) => e.note).join() === '53,55,57,60',
  onsets({ events }, 0, 1, 'rh').map((e) => e.note).join());
const closeGrid = movement('Cadence II-V-I majeur', { technique: 'close' });
const closeDemo = buildGospelDemo(closeGrid);
check('Main droite en cadre d\'octave sur Dm11 en close (C4 D4 F4 G4 C5)', onsets(closeDemo, 0, 1, 'rh').map((e) => e.note).join() === '60,62,65,67,72',
  onsets(closeDemo, 0, 1, 'rh').map((e) => e.note).join());
check('Voix du dessus qui bouge au 3e temps (au moins un accord)', chords.some((c, i) => onsets({ events }, i * 4 + 2, i * 4 + 2.01, 'rh').length === 1));
const lastBar = onsets({ events }, (chords.length - 1) * 4 + 1.5, beats, 'rh');
check('Montée finale ascendante après le dernier accord', lastBar.length >= 4 && lastBar.every((e, k) => k === 0 || e.note > lastBar[k - 1].note), lastBar.map((e) => e.note).join());

// [Claude] — 2026-09-24 — Accords de passage affichés à droite (Narcisse : « ajoute
// ces accords à droite ») : la liste vient du même plan que la démo.
console.log('\n=== Démo : accords de passage (liste de droite) ===');
check('Nom du diminué épelé sur la sensible de l\'accord suivant (Ddim7 avant Eb, C#dim7 avant Dm, Bdim7 avant C)',
  passingName({ name: 'Ebmaj7#11' }, 2) === 'Ddim7' && passingName({ name: 'Dm11' }, 1) === 'C#dim7' && passingName({ name: 'Cmaj13' }, 11) === 'Bdim7'
  && passingName({ name: 'Bmaj13' }, 10) === 'A#dim7');
const turnaround = movement('Turnaround III-VI-II-V-I', { technique: 'auto' });
const turnaroundPassing = demoPassingChords(turnaround, 'gospel');
check('Turnaround en Do : G#dim7 après Em11, C#dim7 après Am11, F#dim7 après Dm11, rien après G13',
  turnaroundPassing.map((p) => `${p.after}:${p.name}`).join() === '0:G#dim7,1:C#dim7,2:F#dim7', turnaroundPassing.map((p) => `${p.after}:${p.name}`).join());
const turnaroundDemo = buildDemo(turnaround, 'gospel');
check('La démo annonce chaque accord de passage au 4e temps (repère « passing »)',
  turnaroundDemo.events.filter((e) => e.type === 'passing').map((e) => `${e.passing}@${e.time}`).join() === '0@3,1@7,2@11');
check('Liste = notes jouées par la démo au 4e temps', turnaroundPassing.every((p) => {
  const played = onsets(turnaroundDemo, p.after * 4 + 3, p.after * 4 + 4).map((e) => e.note).sort((a, b) => a - b).join();
  return played === [...p.lh, ...p.rh].sort((a, b) => a - b).join();
}));
// [Claude] — 2026-09-24 — Narcisse : « ajoute aussi des accords de passage en ballade ».
const balladePassing = demoPassingChords(turnaround, 'ballade');
const balladeTurnaround = buildDemo(turnaround, 'ballade');
check('Ballade : mêmes diminués de passage (G#dim7, C#dim7, F#dim7), annoncés au 4e temps',
  balladePassing.map((p) => `${p.after}:${p.name}`).join() === '0:G#dim7,1:C#dim7,2:F#dim7'
  && balladeTurnaround.events.filter((e) => e.type === 'passing').map((e) => `${e.passing}@${e.time}`).join() === '0@3,1@7,2@11',
  balladePassing.map((p) => `${p.after}:${p.name}`).join());
check('Ballade : la liste donne les notes jouées au 4e temps', balladePassing.every((p) => {
  const played = onsets(balladeTurnaround, p.after * 4 + 3, p.after * 4 + 4).map((e) => e.note).sort((a, b) => a - b).join();
  return played === [...p.lh, ...p.rh].sort((a, b) => a - b).join();
}));
check('Aucun accord de passage en Comping swing ni en Plaqué (ni dans leur démo)', ['swing', 'plaque'].every((style) =>
  demoPassingChords(turnaround, style).length === 0 && !buildDemo(turnaround, style).events.some((e) => e.type === 'passing')));

// [Claude] — 2026-09-24 — Notes que la démo ajoute à la carte (Narcisse : « la démo
// ajoute aussi des basses quand le mini-key ne l'affiche pas, je le veux aussi »).
console.log('\n=== Démo : notes ajoutées à la carte ===');
const closeCadence = movement('Cadence II-V-I majeur', { technique: 'close' });
const dmCard = demoCardHands(closeCadence, 0, 'gospel');
check('Close (main gauche libre) : la démo ajoute la basse D2 A2 et le Do doublé (cadre d\'octave)',
  dmCard?.bass.join() === '38,45' && dmCard?.doubled.join() === '60' && !dmCard.movedToRight, dmCard && `${dmCard.bass} | ${dmCard.doubled}`);
const dmBallade = demoCardHands(closeCadence, 0, 'ballade');
check('Ballade : la basse seule (pas de cadre d\'octave)', dmBallade?.bass.join() === '38,45' && dmBallade.doubled.length === 0);
const dmSwing = demoCardHands(closeCadence, 0, 'swing');
check('Swing : fondamentale et quinte du jeu « en deux »', dmSwing?.bass.length === 2 && dmSwing.bass.every((n) => [2, 9].includes(n % 12)), dmSwing && dmSwing.bass.join());
check('Plaqué : rien d\'ajouté (la carte seule)', demoCardHands(closeCadence, 0, 'plaque') === null);
const rootlessCadence = movement('Cadence II-V-I majeur', { technique: 'rootless' });
const rootlessCard = demoCardHands(rootlessCadence, 0, 'gospel');
check('Rootless : voicing joué à la main droite, basse ajoutée à la main gauche', rootlessCard?.movedToRight === true && rootlessCard.bass.length > 0);
const gm11Card = demoCardHands(movement('Montée diatonique en quartes', { key: 10, technique: 'drop2_4', difficulty: 5 }), 2, 'ballade');
check('Drop 2-4 de Gm11 en Ballade : rien d\'ajouté (la main gauche ne tient pas G2)', gm11Card === null);

// [Claude] — 2026-09-24 — Styles Ballade, Comping swing et Plaqué (demande de Narcisse).
console.log('\n=== Démo : styles ===');
check('Quatre styles, chacun avec son tempo', DEMO_STYLE_IDS.join() === 'gospel,ballade,swing,plaque'
  && DEMO_STYLE_IDS.every((id) => DEMO_STYLES[id].label && DEMO_STYLES[id].tempo >= 50 && DEMO_STYLES[id].tempo <= 160));
check('Style par défaut selon le mouvement : jazz → swing, gospel / worship → gospel, sans style → ballade',
  defaultDemoStyle('jazz') === 'swing' && defaultDemoStyle('gospel') === 'gospel' && defaultDemoStyle('worship') === 'gospel' && defaultDemoStyle(undefined) === 'ballade');
check('Style inconnu : Gospel / worship', JSON.stringify(buildDemo(chords, 'inconnu')) === JSON.stringify(buildGospelDemo(chords)));
for (const style of DEMO_STYLE_IDS) {
  const problems = playabilityProblems(buildDemo(chords, style), chords);
  check(`${DEMO_STYLES[style].label} : deux mains, sans pédale, la carte entière`, problems.length === 0, problems.slice(0, 3).join(' ; '));
}

const ballade = buildDemo(chords, 'ballade');
// Main droite de la démo (le rootless de la carte passe à la main droite, au-dessus de la basse).
const cardRh = demoHands(chords[0], 'fifth').rh;
check('Rootless à une main : joué à la main droite, la main gauche prend la basse (Dm11 : D2 A2 | F3 G3 A3 C4)',
  cardHands(chords[0]).rh.length === 0 && cardRh.join() === cardHands(chords[0]).lh.join() && demoHands(chords[0], 'fifth').lh.join() === '38,45',
  `${demoHands(chords[0], 'fifth').lh} | ${cardRh}`);
const arpeggio = onsets(ballade, 0, 2, 'rh');
check('Ballade : main droite arpégée du grave à l\'aigu, après la main gauche', arpeggio.length === cardRh.length
  && arpeggio.every((e, k) => k === 0 || (e.time > arpeggio[k - 1].time && e.note > arpeggio[k - 1].note)) && arpeggio[0].time > 0,
  arpeggio.map((e) => `${e.note}@${e.time}`).join(' '));
check('Ballade : les deux notes du dessus reprises au 3e temps', cardRh.slice(-2).every((n) => onsets(ballade, 2, 2.1, 'rh').some((e) => e.note === n)));
check('Ballade : main gauche tenue jusqu\'au diminué de passage (4e temps) ou jusqu\'au bout de la mesure',
  ballade.events.filter((e) => e.type === 'noteOff' && e.hand === 'lh' && e.time < 4).every((e) => e.time >= 2.9));

const swing = buildDemo(chords, 'swing');
check('Swing : Charleston — main droite au 1er temps et au « et » du 2e (croche swinguée)',
  cardRh.every((n) => onsets(swing, 0, 0.1, 'rh').some((e) => e.note === n) && onsets(swing, 1.6, 1.8, 'rh').some((e) => e.note === n)));
const swingLh = onsets(swing, 0, 4, 'lh');
check('Swing : main gauche au 1er et au 3e temps (fondamentale, puis quinte au-dessus ou en dessous)', swingLh.length === 2 && swingLh[0].time === 0 && swingLh[1].time === 2
  && [7, -5].includes(swingLh[1].note - swingLh[0].note), swingLh.map((e) => `${e.note}@${e.time}`).join(' '));

const plaque = buildDemo(chords, 'plaque');
check('Plaqué : la carte seule, une fois par mesure, tenue', chords.every((c, i) => {
  const bar = onsets(plaque, i * 4, i * 4 + 4);
  return bar.length === new Set(c.notes).size && bar.every((e) => e.time < i * 4 + 0.1 && c.notes.includes(e.note));
}));

// [Claude] — 2026-09-24 — Le cas de Narcisse : Montée diatonique en quartes, en
// Sib, niveau Avancé, Drop 2-4 (capture du 24/09 : G1 G2 G3 C4 Bb4 F5 sur Gm11).
console.log('\n=== Démo : le cas signalé (Montée diatonique en Sib, Drop 2-4) ===');
const rise = movement('Montée diatonique en quartes', { key: 10, technique: 'drop2_4', difficulty: 5 });
const riseDemo = buildDemo(rise, 'gospel');
const gm11Bar = onsets(riseDemo, 8, 12).map((e) => e.note);
check('Gm11 : plus de G1 ni de G2 sous le voicing à deux mains', rise[2].name === 'Gm11' && !gm11Bar.includes(31) && !gm11Bar.includes(43), gm11Bar.join());
check('Toute la grille : deux mains, sans pédale', playabilityProblems(riseDemo, rise).length === 0, playabilityProblems(riseDemo, rise).slice(0, 3).join(' ; '));

console.log('\n=== Démo : toute la bibliothèque, tous les styles ===');
const problems = [];
for (const name of listMovementNames()) {
  for (const technique of ['auto', 'rootless', 'drop2', 'drop2_4', 'spread', 'stride']) {
    const grid = movement(name, { technique, key: 7 });
    for (const style of DEMO_STYLE_IDS) {
      playabilityProblems(buildDemo(grid, style), grid).forEach((p) => problems.push(`${name} ${technique} ${style} : ${p}`));
    }
  }
}
check('Tous les mouvements × 6 techniques × 4 styles : deux mains, sans pédale, carte entière', problems.length === 0, problems.slice(0, 3).join(' ; '));

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
  const passings = [];
  const ends = [];
  const player = createDemoPlayer({
    send: (type, a, b) => sent.push([type, a, b]),
    onStep: (i) => steps.push(i),
    onPassing: (after) => passings.push(after),
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
    { time: 3, type: 'passing', passing: 0 },
  ];
  player.play({ events, beats: 4 }, { tempo: 60 });
  check('Lecture en cours', player.isPlaying());
  runUntil(2500);
  check('Note rejouée sans être coupée par la première fin', sent.filter(([t, n]) => t === 'noteOff' && n === 60).length === 1
    && sent.filter(([t]) => t === 'noteOn').length === 2, JSON.stringify(sent));
  runUntil(10000);
  check('Relâchée au dernier relâchement ; repère et fin annoncés', sent.filter(([t, n]) => t === 'noteOff' && n === 60).length === 2
    && steps.join() === '0' && ends.join() === 'finished' && !player.isPlaying(), JSON.stringify(sent));
  check('Accord de passage annoncé (onPassing)', passings.join() === '0', passings.join());
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
