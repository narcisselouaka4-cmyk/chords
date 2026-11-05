// Contrat du mode Solo. Ce que ces vérifications protègent, dans l'ordre
// d'importance :
//
//   1. Un exercice de rythme ne regarde AUCUNE hauteur. C'est la promesse
//      affichée au pianiste ; si elle tombe, l'exercice ment.
//   2. Une seule frappe ne valide jamais deux positions attendues.
//   3. Les octaves parallèles — la façon de jouer mesurée dans la classe de
//      salsa — comptent pour UNE frappe, jamais pour une frappe en trop.
//   4. Le footing juge un fait (la note est-elle dans l'accord), jamais un goût,
//      et un temps fort laissé libre n'est pas une faute.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  judgeRhythm, rhythmVerdict, expectedBeats, pairHits, groupSimultaneous,
  msToBeats, beatsToMs, DEFAULT_TOLERANCE_MS,
} from './rhythm-judge.js';
import {
  judgeFooting, footingVerdict, strongBeatsBetween, landingPitchClasses, pcName,
} from './footing-judge.js';
import { gridTimeline, chordAtBeat, cycleBeats, createLoopClock, repeatGrid, backingNames } from './play-along.js';
import { createSoloSession, isSoloEntry, SOLO_KINDS, SOLO_KIND_PROMISE } from './solo-session.js';
import { chordToneIntervals, isGridChordPlayable, createPracticeExercise } from '../practice-exercise.js';

let passed = 0;
const check = (label, ok, detail = '') => {
  console.log(`${ok ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (ok) passed += 1; else process.exitCode = 1;
};

const catalogue = JSON.parse(await readFile(new URL('../data/solo-studies.json', import.meta.url), 'utf8'));
const byId = (id) => catalogue.movements.find((m) => m.id === id);
const TEMPO = 90;
const beat = (b) => b; // lisibilité : les instants sont des temps musicaux

// ---------------------------------------------------------------- Déroulé d'un motif

const contretemps = { beats: 4, positions: [0.5, 1.5, 2.5, 3.5] };
check('Un motif cyclique se déroule sur l\'intervalle demandé',
  expectedBeats(contretemps, 0, 8).length === 8);
check('Le déroulé commence au cycle qui contient le début, pas à zéro',
  expectedBeats(contretemps, 4, 8).every((b) => b >= 4),
  expectedBeats(contretemps, 4, 8).join(' '));
check('Borne haute exclue : une frappe pile à la fin n\'est pas attendue',
  !expectedBeats({ beats: 4, positions: [0] }, 0, 4).includes(4));
check('Un motif sans position ne produit aucune attente',
  expectedBeats({ beats: 4, positions: [] }, 0, 8).length === 0);

// ---------------------------------------------------------------- Appariement

// Le point le plus important de l'appariement : une frappe unique posée entre
// deux attentes ne doit pas les satisfaire toutes les deux.
const entre = pairHits([0, 0.5], [0.25], 0.3);
check('Une seule frappe ne valide pas deux positions attendues',
  entre.pairs.length === 1 && entre.missed.length === 1,
  `${entre.pairs.length} appariée(s), ${entre.missed.length} manquée(s)`);
check('L\'appariement sert d\'abord la frappe la plus proche',
  pairHits([0, 1], [0.95], 0.3).pairs[0].expected === 1);
const horsFenetre = pairHits([0], [0.5], 0.2);
check('Une frappe hors de la fenêtre est comptée en trop, pas appariée',
  horsFenetre.pairs.length === 0 && horsFenetre.extra.length === 1 && horsFenetre.missed.length === 1);

// ---------------------------------------------------------------- Octaves parallèles

const octaves = groupSimultaneous(
  [{ at: 0, note: 67 }, { at: 0.002, note: 79 }, { at: 1, note: 70 }],
  msToBeats(55, TEMPO),
);
check('Deux touches à une octave au même instant = une seule frappe',
  octaves.length === 2 && octaves[0].count === 2,
  `${octaves.length} frappe(s), la première a ${octaves[0].count} note(s)`);

// Le professeur de la classe relevée joue TOUT en octaves parallèles (mesuré :
// un écart d'une octave dans 155 cas sur 170). Si l'exercice comptait chaque
// octave comme une frappe en trop, il punirait exactement ce qu'il enseigne.
const enOctaves = [];
for (const p of expectedBeats(contretemps, 0, 8)) {
  enOctaves.push({ at: p, note: 67 }, { at: p + 0.001, note: 79 });
}
const verdictOctaves = judgeRhythm({ hits: enOctaves, pattern: contretemps, fromBeat: 0, toBeat: 8, tempo: TEMPO });
check('Un jeu entièrement en octaves ne produit aucune frappe en trop',
  verdictOctaves.extra === 0 && verdictOctaves.matched === 8,
  `${verdictOctaves.matched} appariées, ${verdictOctaves.extra} en trop`);

// ---------------------------------------------------------------- Le rythme ignore les hauteurs

const positions = expectedBeats(contretemps, 0, 8);
const commun = { pattern: contretemps, fromBeat: 0, toBeat: 8, tempo: TEMPO };
const uneNote = judgeRhythm({ hits: positions.map((at) => ({ at, note: 60 })), ...commun });
const autreNote = judgeRhythm({ hits: positions.map((at) => ({ at, note: 42 })), ...commun });
const nImporteQuoi = judgeRhythm({
  hits: positions.map((at, i) => ({ at, note: [21, 108, 60, 37, 99, 54, 73, 88][i] })), ...commun,
});
check('Le verdict rythmique est identique quelle que soit la hauteur jouée',
  uneNote.matched === autreNote.matched && uneNote.matched === nImporteQuoi.matched
  && uneNote.precisionMs === nImporteQuoi.precisionMs
  && rhythmVerdict(uneNote) === rhythmVerdict(nImporteQuoi),
  `${uneNote.matched} / ${autreNote.matched} / ${nImporteQuoi.matched}`);
check('Un motif joué juste est entièrement apparié',
  uneNote.matched === 8 && uneNote.missed === 0 && uneNote.extra === 0);

// ---------------------------------------------------------------- Avance, retard, régularité

const retardMs = 60;
const enRetard = judgeRhythm({
  hits: positions.map((at) => ({ at: at + msToBeats(retardMs, TEMPO), note: 60 })), ...commun,
});
check('Un jeu en retard est mesuré comme tel, en millisecondes',
  enRetard.matched === 8 && Math.abs(enRetard.meanDeltaMs - retardMs) < 1,
  `${enRetard.meanDeltaMs} ms`);
const enAvance = judgeRhythm({
  hits: positions.map((at) => ({ at: at - msToBeats(40, TEMPO), note: 60 })), ...commun,
});
check('Un jeu en avance donne un écart négatif',
  enAvance.meanDeltaMs < 0 && Math.abs(enAvance.meanDeltaMs + 40) < 1, `${enAvance.meanDeltaMs} ms`);
check('Le décalage d\'ensemble et la régularité sont deux chiffres distincts',
  Math.abs(enRetard.meanDeltaMs - retardMs) < 1 && Math.abs(enRetard.precisionMs - retardMs) < 1
  && enRetard.tight === 0,
  `moyen ${enRetard.meanDeltaMs} ms, précision ${enRetard.precisionMs} ms, serrées ${enRetard.tight}`);
const irregulier = judgeRhythm({
  hits: positions.map((at, i) => ({ at: at + msToBeats(i % 2 ? 50 : -50, TEMPO), note: 60 })), ...commun,
});
check('Un jeu irrégulier mais centré : écart moyen nul, précision mauvaise',
  Math.abs(irregulier.meanDeltaMs) < 1 && irregulier.precisionMs > 45,
  `moyen ${irregulier.meanDeltaMs} ms, précision ${irregulier.precisionMs} ms`);

// ---------------------------------------------------------------- Manqué / en trop

const surLesTemps = judgeRhythm({
  hits: [0, 1, 2, 3, 4, 5, 6, 7].map((at) => ({ at, note: 60 })), ...commun,
});
check('Jouer sur les temps quand on attend les contretemps : tout est faux',
  surLesTemps.matched === 0 && surLesTemps.missed === 8 && surLesTemps.extra === 8,
  rhythmVerdict(surLesTemps));
check('Ne rien jouer ne produit ni appariement ni frappe en trop',
  (() => { const v = judgeRhythm({ hits: [], ...commun }); return v.matched === 0 && v.extra === 0 && v.missed === 8; })());

// ---------------------------------------------------------------- Tolérance

const limite = msToBeats(DEFAULT_TOLERANCE_MS, TEMPO);
check('Une frappe pile sur la tolérance est acceptée',
  judgeRhythm({ hits: [{ at: 0.5 + limite, note: 60 }], pattern: contretemps, fromBeat: 0, toBeat: 1, tempo: TEMPO }).matched === 1);
check('Une frappe juste au-delà de la tolérance est refusée',
  judgeRhythm({ hits: [{ at: 0.5 + limite * 1.02, note: 60 }], pattern: contretemps, fromBeat: 0, toBeat: 1, tempo: TEMPO }).matched === 0);
check('La tolérance en millisecondes se resserre en temps quand le tempo monte',
  msToBeats(90, 180) > msToBeats(90, 90) && Math.abs(beatsToMs(msToBeats(90, 143), 143) - 90) < 1e-9);

// ---------------------------------------------------------------- Triolets

const triolets = byId('solo-rythme-croches-triolets').solo.pattern;
check('La fiche croches/triolets attend 8 croches puis 12 triolets',
  triolets.positions.length === 20 && triolets.beats === 8);
const trioletsJustes = judgeRhythm({
  hits: triolets.positions.map((at) => ({ at, note: 60 })),
  pattern: triolets, fromBeat: 0, toBeat: 8, tempo: TEMPO,
});
check('Les triolets écrits dans la fiche sont jugés justes',
  trioletsJustes.matched === 20 && trioletsJustes.extra === 0 && trioletsJustes.precisionMs < 1,
  `${trioletsJustes.matched}/20, précision ${trioletsJustes.precisionMs} ms`);
// Jouer des croches là où on attend des triolets doit se voir : c'est l'objet
// même de l'exercice (passer de deux à trois notes par temps).
const crochesAuLieuDeTriolets = judgeRhythm({
  hits: [4, 4.5, 5, 5.5, 6, 6.5, 7, 7.5].map((at) => ({ at, note: 60 })),
  pattern: triolets, fromBeat: 4, toBeat: 8, tempo: TEMPO,
});
check('Des croches jouées sur la mesure de triolets ne passent pas pour justes',
  crochesAuLieuDeTriolets.matched < 8 && crochesAuLieuDeTriolets.missed > 0,
  `${crochesAuLieuDeTriolets.matched} appariées sur 12 attendues`);

// ---------------------------------------------------------------- Grille et temps

const grid = byId('solo-play-along-gm').solo.grid;
const timeline = gridTimeline(grid, 4);
check('La grille du play-along fait trois accords de quatre temps',
  timeline.length === 3 && cycleBeats(timeline) === 12);
check('Chaque accord de la grille est reconnu (fondamentale et qualité)',
  timeline.map((s) => s.name).join(' ') === 'Am7b5 D7 Gm'
  && timeline[0].rootPc === 9 && timeline[1].rootPc === 2 && timeline[2].rootPc === 7,
  timeline.map((s) => `${s.name}:${s.rootPc}`).join(' '));
check('L\'accord qui sonne est trouvé au bon instant',
  chordAtBeat(timeline, 0).name === 'Am7b5' && chordAtBeat(timeline, 4).name === 'D7'
  && chordAtBeat(timeline, 11.9).name === 'Gm');
check('La grille tourne en boucle : le tour suivant revient au premier accord',
  chordAtBeat(timeline, 12).name === 'Am7b5' && chordAtBeat(timeline, 16).name === 'D7'
  && chordAtBeat(timeline, 20).name === 'Gm',
  [12, 16, 20].map((b) => `${b}→${chordAtBeat(timeline, b).name}`).join(' '));
check('Le repli du cycle tient sur plusieurs tours et sur un temps négatif',
  chordAtBeat(timeline, 36).name === 'Am7b5' && chordAtBeat(timeline, 37).name === 'Am7b5'
  && chordAtBeat(timeline, 44).name === 'Gm' && chordAtBeat(timeline, -1).name === 'Gm',
  [36, 37, 44, -1].map((b) => `${b}→${chordAtBeat(timeline, b).name}`).join(' '));
check('Un accord déclaré sans durée propre prend la durée par défaut',
  gridTimeline(['Gm', { name: 'D7', beats: 8 }], 4).map((s) => s.beats).join(' ') === '4 8');
check('Les accords sont répétés à plat pour la machinerie des démos',
  repeatGrid(timeline, 3).length === 9 && repeatGrid(timeline, 3)[3] === 'Am7b5');

// ---------------------------------------------------------------- Horloge de boucle

const clock = createLoopClock(12);
check('L\'horloge avance dans le premier tour', clock.beat(0) === 0 && clock.beat(5) === 5);
check('Un retour en arrière franc compte un tour de plus',
  clock.beat(0.2) === 12.2 && clock.cycles() === 1, `cycles=${clock.cycles()}`);
const monotone = createLoopClock(12);
let precedent = -1;
let recule = false;
// Trois tours entiers, position repartant de zéro à chaque tour.
for (let tour = 0; tour < 3; tour += 1) {
  for (const pos of [0, 3, 6, 9, 11.5]) {
    const cumule = monotone.beat(pos);
    if (cumule < precedent) recule = true;
    precedent = cumule;
  }
}
check('Le temps cumulé ne recule jamais d\'un tour à l\'autre',
  !recule && monotone.cycles() === 2 && precedent > 24,
  `dernier temps ${precedent}, ${monotone.cycles()} tours`);
const clockStable = createLoopClock(12);
clockStable.beat(5);
check('Un petit tremblement de position ne compte pas un tour',
  clockStable.beat(4.9) < 12 && clockStable.cycles() === 0);

// ---------------------------------------------------------------- Footing

check('Les temps forts du 4/4 sont le 1 et le 3',
  strongBeatsBetween([0, 2], 4, 0, 8).join(' ') === '0 2 4 6');
const gm = timeline[2];
const d7 = timeline[1];
check('Les notes d\'atterrissage déclarées par la fiche sont utilisées',
  [...landingPitchClasses(gm, chordToneIntervals)].sort((a, b) => a - b).join(' ') === '2 7 10',
  'Gm → sol, si♭, ré');
// Le professeur accepte le mi♭ sur le D7 : c'est la ♭9 de son D7♭9. Un D7
// ordinaire ne la contient pas — d'où la déclaration explicite dans la fiche.
const d7Pcs = landingPitchClasses(d7, chordToneIntervals);
check('Le mi♭ est accepté sur le D7 parce que la fiche le déclare (♭9)',
  d7Pcs.has(3) && d7Pcs.has(2) && d7Pcs.has(6) && d7Pcs.has(9) && d7Pcs.has(0),
  'ré, mi♭, fa♯, la, do');
check('Sans déclaration, ce sont les notes de l\'accord qui servent',
  !landingPitchClasses({ rootPc: 2, quality: '7' }, chordToneIntervals).has(3));

const footCommun = { chordAt: (b) => chordAtBeat(timeline, b), chordTones: chordToneIntervals, strongBeats: [0, 2], barBeats: 4, tempo: TEMPO };
// Le contre-exemple du professeur : un fa♯ posé sur un temps fort de sol mineur.
const faDiese = judgeFooting({
  hits: [{ at: 8, note: 66 }], fromBeat: 8, toBeat: 9, ...footCommun,
});
check('Le contre-exemple du professeur est signalé : fa♯ sur un temps fort de sol mineur',
  faDiese.offChord === 1 && faDiese.landings[0].outside[0].degree === '7',
  footingVerdict(faDiese));
const solSurGm = judgeFooting({ hits: [{ at: 8, note: 67 }], fromBeat: 8, toBeat: 9, ...footCommun });
check('Un sol posé sur sol mineur est un bon atterrissage',
  solSurGm.onChord === 1 && solSurGm.offChord === 0);
const mibSurD7 = judgeFooting({ hits: [{ at: 4, note: 63 }], fromBeat: 4, toBeat: 5, ...footCommun });
check('Le mi♭ posé sur le D7 est accepté (♭9 déclarée)',
  mibSurD7.onChord === 1, footingVerdict(mibSurD7));
const silence = judgeFooting({ hits: [], fromBeat: 8, toBeat: 12, ...footCommun });
check('Un temps fort laissé libre n\'est pas une faute',
  silence.offChord === 0 && silence.silent === 2 && silence.played === 0,
  footingVerdict(silence));
const entreLesTemps = judgeFooting({ hits: [{ at: 8.5, note: 66 }], fromBeat: 8, toBeat: 9, ...footCommun });
check('Une note jouée entre les temps forts n\'est pas jugée',
  entreLesTemps.played === 0 && entreLesTemps.offChord === 0);
const octavesFooting = judgeFooting({
  hits: [{ at: 8, note: 67 }, { at: 8.002, note: 79 }], fromBeat: 8, toBeat: 9, ...footCommun,
});
check('Un atterrissage en octaves est une seule décision, pas deux',
  octavesFooting.played === 1 && octavesFooting.onChord === 1
  && octavesFooting.landings[0].degrees.length === 1);
const deuxTempsForts = judgeFooting({
  hits: [{ at: 8, note: 67 }, { at: 10, note: 66 }], fromBeat: 8, toBeat: 12, ...footCommun,
});
check('Deux temps forts voisins ne se partagent pas une seule frappe',
  deuxTempsForts.played === 2 && deuxTempsForts.onChord === 1 && deuxTempsForts.offChord === 1);
check('Le verdict nomme la note fautive, son degré et l\'accord',
  /Fa♯/.test(footingVerdict(faDiese)) && /Gm/.test(footingVerdict(faDiese)),
  footingVerdict(faDiese));
check('Le nom latin des hauteurs est utilisé, comme ailleurs dans l\'application',
  pcName(7) === 'Sol' && pcName(6) === 'Fa♯' && pcName(3) === 'Ré♯');

// ---------------------------------------------------------------- Les fiches

check('Les quatre fiches du mode Solo sont reconnues comme telles',
  catalogue.movements.length === 4 && catalogue.movements.every(isSoloEntry));
check('Les trois sortes de fiches sont représentées',
  new Set(catalogue.movements.map((m) => m.solo.kind)).size === 3
  && catalogue.movements.every((m) => SOLO_KINDS.includes(m.solo.kind)));
check('Chaque fiche dit sa provenance et cite au moins une source',
  catalogue.movements.every((m) => m.provenance?.sources?.length >= 1));
check('Chaque fiche a un nom, un contexte, un son et un usage en français',
  catalogue.movements.every((m) => m.name && m.context && m.sound && m.use && m.description));
check('Les fiches latines tournent au tempo de la boucle salsa validée (90)',
  catalogue.movements.every((m) => m.solo.tempo === 90 && m.solo.kit === 'salsa'));
// La note du coffre l'exige : le placement rythmique n'a pas pu être relevé sur
// la vidéo. Aucune fiche de rythme ne doit prétendre le contraire.
check('Aucune fiche de rythme ne présente sa grille comme relevée à l\'image',
  catalogue.movements.filter((m) => m.solo.kind === 'rhythm')
    .every((m) => /pas été relevée|non relevé|n'a pas pu être/i.test(m.provenance.sources[0].supports)));

// ---------------------------------------------------------------- La séance

const session = createSoloSession({ chordTones: chordToneIntervals });
session.load(byId('solo-rythme-contretemps'));
check('Une séance de rythme prend la cellule du motif comme tour',
  session.state().loopBeats === 4 && session.state().kind === 'rhythm');
check('Rien n\'est ramassé avant le départ', session.noteOn(60, 0.5) === null && session.state().hits === 0);
session.start();
for (const at of [0.5, 1.5, 2.5, 3.5]) session.noteOn(60, at);
session.tick(3.9);
const vr = session.verdict();
check('La séance rend le verdict rythmique de ses frappes',
  vr.judged && vr.rhythm.matched >= 3, `${vr.rhythm.matched} appariée(s) — ${vr.text}`);
check('Le verdict ne juge pas ce qui n\'est pas encore passé',
  vr.rhythm.expectedCount <= 4, `${vr.rhythm.expectedCount} attendue(s)`);
session.reset();
check('Remise à zéro : les frappes partent, la fiche reste',
  session.state().hits === 0 && session.state().kind === 'rhythm');

const play = createSoloSession({ chordTones: chordToneIntervals });
play.load(byId('solo-play-along-gm'));
play.start();
play.noteOn(67, 1);
const vp = play.verdict();
check('Un play-along ne juge rien, par construction',
  vp.judged === false && !vp.rhythm && !vp.footing, vp.text);
check('Un play-along annonce quand même ce qui a été joué',
  /1 note jouée/.test(vp.text), vp.text);
const playSolo = byId('solo-play-along-gm').solo;
check('La séance fournit les accords répétés pour le fond de jeu',
  play.state().chordNames.length === playSolo.backing.length * playSolo.cycles
  && play.state().kit === 'salsa',
  `${play.state().chordNames.length} accords = ${playSolo.backing.length} × ${playSolo.cycles} tours`);
check('La séance annonce la durée de la séance en temps',
  play.state().totalBeats === 12 * playSolo.cycles && play.state().loopBeats === 12,
  `${play.state().totalBeats} temps`);
check('La promesse affichée au pianiste existe pour les trois sortes',
  SOLO_KINDS.every((k) => typeof SOLO_KIND_PROMISE[k] === 'string' && SOLO_KIND_PROMISE[k].length > 10));

const foot = createSoloSession({ chordTones: chordToneIntervals });
foot.load(byId('solo-footing-gm'));
foot.start();
foot.noteOn(66, 8); // fa♯ sur le temps fort de Gm
foot.tick(9);
const vf = foot.verdict();
check('Une séance de footing signale l\'atterrissage hors accord',
  vf.judged && vf.footing.offChord === 1, vf.text);
check('Une fiche qui n\'est pas du mode Solo n\'est pas chargée',
  createSoloSession({}).load({ id: 'x' }).kind === null);

// La tolérance est bornée : un réglage absurde ne rend pas l'exercice inutile
// (tolérance énorme) ni injouable (tolérance nulle).
const tol = createSoloSession({ chordTones: chordToneIntervals });
tol.load(byId('solo-rythme-contretemps'));
check('La tolérance reste dans des bornes jouables',
  tol.setTolerance(0) === 30 && tol.setTolerance(9999) === 250 && tol.setTolerance(75) === 75);

// ---------------------------------------------------------------- Le fond doit sonner

// Le piège qui a motivé le champ `backing` : VoicingLab ne publie pas les
// triades mineures. Un « Gm » dans le fond n'a aucun voicing et la fabrique de
// démos le laisse tomber SANS RIEN DIRE — trois accords annoncés, deux joués.
check('VoicingLab ne publie pas la triade mineure (la raison du champ backing)',
  !isGridChordPlayable('Gm') && isGridChordPlayable('Gm7'));
const injouables = [];
for (const m of catalogue.movements) {
  for (const name of new Set(backingNames(m, gridTimeline(m.solo.grid || [], m.solo.beatsPerChord)))) {
    if (!isGridChordPlayable(name)) injouables.push(`${m.id}:${name}`);
  }
}
check('Chaque accord du fond de jeu a de vrais voicings', injouables.length === 0, injouables.join(', '));

// Le contrôle qui compte vraiment : la fabrique rend-elle AUTANT d'accords
// qu'on lui en a donné ? Un accord perdu en route ne lève aucune erreur.
const engine = createPracticeExercise();
const perdus = [];
for (const m of catalogue.movements) {
  const names = backingNames(m, gridTimeline(m.solo.grid || [], m.solo.beatsPerChord));
  if (!names.length) continue;
  const built = engine.previewGrid(names.join(' '), 'Solo', { keepTensions: true });
  if (!built || built.length !== names.length) perdus.push(`${m.id}: ${built?.length ?? 0}/${names.length}`);
}
check('Le fond de jeu ne perd aucun accord en route', perdus.length === 0, perdus.join(', '));

const fondPlay = engine.previewGrid(
  backingNames(byId('solo-play-along-gm'), timeline).join(' '), 'Solo', { keepTensions: true });
check('Les accords du fond gardent les qualités de la fiche',
  fondPlay.slice(0, 3).map((c) => c.name).join(' ') === 'Am7b5 D7 Gm7',
  fondPlay.slice(0, 3).map((c) => c.name).join(' '));
check('Chaque accord du fond a bien des notes à jouer',
  fondPlay.every((c) => Array.isArray(c.notes) && c.notes.length >= 3));
check('Le footing juge l\'harmonie annoncée, pas celle du fond',
  byId('solo-footing-gm').solo.grid[2].name === 'Gm'
  && byId('solo-footing-gm').solo.backing[2] === 'Gm7');
// La ♭7 du Gm7 joué par le fond ne doit pas devenir une note d'atterrissage :
// le professeur cite sol, si♭ et ré, pas fa.
const gmLanding = landingPitchClasses(timeline[2], chordToneIntervals);
check('La 7e du Gm7 du fond n\'entre pas dans les atterrissages du Gm',
  !gmLanding.has(5) && gmLanding.size === 3, [...gmLanding].join(' '));
check('Un fond sans grille déclarée ne fabrique aucun accord',
  backingNames(byId('solo-rythme-contretemps'), []).length === 0);
check('Le nombre de tours du fond est respecté',
  backingNames(byId('solo-play-along-gm'), timeline).length === 3 * playSolo.cycles
  && repeatGrid(timeline, 2).length === 6);
// Chaque fiche doit durer assez pour qu'un verdict ait un sens, sans
// immobiliser le pianiste : entre une demi-minute et trois minutes.
const durees = catalogue.movements.map((m) => {
  const loopB = m.solo.pattern ? m.solo.pattern.beats : (m.solo.grid.length * (m.solo.beatsPerChord || 4));
  return { id: m.id, s: loopB * m.solo.cycles * 60 / m.solo.tempo };
});
check('Chaque séance dure entre 30 s et 3 min',
  durees.every((d) => d.s >= 30 && d.s <= 180),
  durees.map((d) => `${d.id.replace('solo-', '')} ${Math.round(d.s)}s`).join(', '));

console.log(`\n=== ${passed} vérifications du mode Solo ===`);
