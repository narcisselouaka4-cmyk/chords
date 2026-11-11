// [Claude] — 2026-11-11 — Modèle de partition des prises et propositions du Copilote (critère 11
// de la mission « Copilot fiable ») : hauteurs, durées, altérations, silences, liaisons, mesures,
// incertitude dite, synchronisation sur le temps réel.

import {
  buildProposalScore, estimatePulse, notesFromEvents, splitDuration, spellPitch, prefersFlats,
  scorePositionAt, UNITS_PER_BAR, CERTAIN_PULSE,
} from './proposal-score-model.js';

let passed = 0;
let failed = 0;
function check(name, condition, detail = '') {
  if (condition) { passed += 1; console.log(`\x1b[32m✓\x1b[0m ${name}`); }
  else { failed += 1; console.log(`\x1b[31m✗\x1b[0m ${name}${detail ? ` — ${detail}` : ''}`); }
}
const BEAT = 0.5; // 120 à la noire
const on = (note, beat, beats) => [{ type: 'noteOn', note, time: beat * BEAT, velocity: 0.7 }, { type: 'noteOff', note, time: (beat + beats) * BEAT - 0.02 }];
const names = (event) => event.rest ? 'silence' : event.keys.map((k) => `${k.name}${k.octave}`).join('+');
const line = (events) => events.map((e) => `${names(e)}:${e.code}`).join(' ');

// ── Hauteurs et altérations ──
check('Do central = C4 ; Si bémol écrit selon le contexte', spellPitch(60).name === 'C' && spellPitch(60).octave === 4 && spellPitch(70, true).name === 'Bb' && spellPitch(70, false).name === 'A#' && spellPitch(21).octave === 0);
check('Tonalités à bémols reconnues en français et en anglais', prefersFlats({ key: 'Mi bémol majeur' }) && prefersFlats({ key: 'Eb' }) && prefersFlats({ key: 'F' }) && prefersFlats({ key: 'Do mineur' }) && prefersFlats({ key: 'Dm' }));
check('Tonalités à dièses ou sans altération : pas de bémols', !prefersFlats({ key: 'Sol majeur' }) && !prefersFlats({ key: 'D' }) && !prefersFlats({ key: 'Fa dièse mineur' }) && !prefersFlats({ key: 'Do majeur' }) && !prefersFlats({ key: 'Am' }));
check('Sans tonalité : d\'après les noms d\'accords', prefersFlats({ chordNames: ['Bbmaj7', 'Eb6', 'F7'] }) && !prefersFlats({ chordNames: ['F#m7', 'B7', 'E'] }));

// ── Notes à partir des évènements (formats du lecteur et des prises) ──
const mixed = notesFromEvents([{ type: 'note_on', note: 60, time: 0, velocity: 80 }, { type: 'note_off', note: 60, time: 1, velocity: 0 }, { type: 'noteOn', note: 64, time: 1, velocity: 0.6 }, { type: 'note_on', note: 64, time: 2, velocity: 0 }, { type: 'sustain', time: 0.5, value: true }]);
check('Deux formats d\'évènements lus, pédale ignorée', mixed.length === 2 && mixed[0].midi === 60 && mixed[0].end === 1 && mixed[1].end === 2);
check('Touche rejouée sans relâchement : deux notes distinctes', notesFromEvents([{ type: 'noteOn', note: 60, time: 0, velocity: 0.7 }, { type: 'noteOn', note: 60, time: 1, velocity: 0.7 }, { type: 'noteOff', note: 60, time: 2 }]).length === 2);

// ── Durées écrivables ──
const codes = (from, to) => splitDuration(from, to).map((p) => p.code).join(' ');
check('Ronde, blanche pointée, blanche, noire pointée, noire', codes(0, 16) === 'w' && codes(0, 12) === 'hd' && codes(0, 8) === 'h' && codes(0, 6) === 'qd' && codes(4, 8) === 'q');
check('Hors du temps : on complète d\'abord jusqu\'au temps suivant', codes(2, 8) === '8 q' && codes(1, 4) === '8d' && codes(3, 8) === '16 q');
check('Cinq doubles croches sur le temps : noire liée à une double', codes(0, 5) === 'q 16');
check('La somme des morceaux fait toujours la durée demandée', [[0, 16], [3, 13], [5, 16], [1, 2], [6, 15]].every(([a, b]) => splitDuration(a, b).reduce((n, p) => n + (p.to - p.from), 0) === b - a && splitDuration(a, b).every((p) => p.code)));

// ── Une proposition régulière : accords tenus à gauche, mélodie à droite ──
const structured = [
  ...on(48, 0, 4), ...on(52, 0, 4), ...on(55, 0, 4),            // Do majeur tenu, mesure 1
  ...on(72, 0, 1), ...on(74, 1, 1), ...on(76, 2, 2),             // Do Ré Mi(blanche)
  ...on(53, 4, 4), ...on(57, 4, 4),                              // Fa La tenu, mesure 2
  ...on(77, 4, 1.5), ...on(76, 5.5, 0.5), ...on(74, 6, 1),       // Fa pointée, Mi croche, Ré noire, puis silence
  ...on(43, 8, 6), ...on(71, 8, 4),                              // Sol tenu six temps (liaison par-dessus la barre), Si ronde
];
const score = buildProposalScore({ events: structured, key: 'Do majeur', chordLabels: [{ at: 0, name: 'C' }, { at: 2, name: 'F' }, { at: 4, name: 'G' }] });
check('Pulsation retrouvée (120 à la noire) et dite certaine', score.meter.bpm === 120 && score.meter.confidence >= CERTAIN_PULSE && score.meter.certain === true, JSON.stringify(score.meter));
check('Quatre mesures de quatre temps', score.bars.length === 4 && score.bars.every((b) => b.to - b.from === UNITS_PER_BAR), String(score.bars.length));
check('Mesure 1, clé de sol : Do noire, Ré noire, Mi blanche', line(score.bars[0].treble) === 'C5:q D5:q E5:h', line(score.bars[0].treble));
check('Mesure 1, clé de fa : accord Do-Mi-Sol en ronde', line(score.bars[0].bass) === 'C3+E3+G3:w', line(score.bars[0].bass));
check('Mesure 2 : noire pointée, croche, noire, puis un soupir', line(score.bars[1].treble) === 'F5:qd E5:8 D5:q silence:q', line(score.bars[1].treble));
check('Silences écrits quand rien ne sonne', score.bars[1].treble.at(-1).rest === true && score.bars[3].treble.every((e) => e.rest));
check('Note tenue par-dessus la barre : liée, pas réattaquée', line(score.bars[2].bass) === 'G2:w' && line(score.bars[3].bass) === 'G2:h silence:h' && score.bars[2].bass[0].keys[0].tiedToNext === true && score.bars[3].bass[0].keys[0].tiedFromPrevious === true, `${line(score.bars[2].bass)} | ${line(score.bars[3].bass)}`);
check('Les accords sont placés dans leur mesure', score.bars[0].chords[0].name === 'C' && score.bars[1].chords[0].name === 'F' && score.bars[2].chords[0].name === 'G');
check('Toutes les notes jouées sont écrites (13 notes)', score.noteCount === 13, String(score.noteCount));
const written = new Set();
for (const bar of score.bars) for (const staff of ['treble', 'bass']) for (const e of bar[staff]) for (const k of e.keys) if (!k.tiedFromPrevious) written.add(`${k.midi}@${e.from}`);
check('Chaque attaque apparaît une fois et une seule', written.size === 13, String(written.size));
check('Les limites sont dites : mesure supposée, arrondi, portées', score.limits.some((l) => /Barres de mesure supposées/.test(l)) && score.limits.some((l) => /arrondies à la double croche/.test(l)) && score.limits.some((l) => /pas la détection des mains/.test(l)));

// ── Altérations selon la tonalité ──
const flatScore = buildProposalScore({ events: [...on(58, 0, 1), ...on(63, 1, 1), ...on(68, 2, 1), ...on(70, 3, 1), ...on(75, 4, 4)], key: 'Mi bémol majeur' });
check('En Mi bémol : Si♭ en clé de fa, puis un silence de trois temps', line(flatScore.bars[0].bass) === 'Bb3:q silence:hd', line(flatScore.bars[0].bass));
check('… et à la main droite', /Eb4:q Ab4:q Bb4:q/.test(line(flatScore.bars[0].treble)), line(flatScore.bars[0].treble));
const sharpScore = buildProposalScore({ events: [...on(66, 0, 1), ...on(68, 1, 1), ...on(73, 2, 1), ...on(69, 3, 1)], key: 'La majeur' });
check('En La majeur : Fa♯, Sol♯, Do♯', line(sharpScore.bars[0].treble) === 'F#4:q G#4:q C#5:q A4:q', line(sharpScore.bars[0].treble));

// ── Prise libre : l'incertitude est dite, rien n'est présenté comme certain ──
const free = [[0, 60], [0.37, 64], [1.21, 67], [1.9, 62], [3.33, 60], [3.41, 67], [5.02, 59], [5.9, 65], [7.13, 72]].flatMap(([t, n]) => [{ type: 'note_on', note: n, time: t, velocity: 0.7 }, { type: 'note_off', note: n, time: t + 0.6, velocity: 0 }]);
const freeScore = buildProposalScore({ events: free });
check('Rythme libre : la mesure est dite incertaine', freeScore.meter.certain === false && freeScore.limits[0].startsWith('Rythme libre'), JSON.stringify(freeScore.meter));
check('… les hauteurs restent toutes écrites', freeScore.noteCount === 9 && freeScore.bars.length >= 1);
check('… et l\'écart introduit par l\'arrondi est mesuré', freeScore.meter.driftSeconds > 0 && freeScore.meter.driftSeconds < freeScore.unitSeconds);
check('Trop peu d\'attaques : aucune pulsation prétendue', estimatePulse([0, 1.3]).confidence === 0 && buildProposalScore({ events: [...on(60, 0, 2)] }).meter.certain === false);
check('Rien à écrire : dit simplement', buildProposalScore({ events: [] }).empty === true);

// ── Lecture : une note relâchée juste avant la suivante s'écrit tenue jusqu'à elle ──
const detached = buildProposalScore({ events: [[48, 55], [50, 57], [52, 59], [53, 60]].flatMap((ns, i) => ns.flatMap((note) => [{ type: 'note_on', note, time: i * 1, velocity: 0.7 }, { type: 'note_off', note, time: i * 1 + 0.9, velocity: 0 }])) });
check('Accords relâchés un instant avant le suivant : écrits tenus, sans quart de soupir parasite', line(detached.bars[0].bass) === 'C3+G3:h D3+A3:h' && line(detached.bars[1].bass).startsWith('E3+B3:h F3:h') && !/:16/.test(line(detached.bars[0].bass)), `${line(detached.bars[0].bass)} | ${line(detached.bars[1].bass)}`);
const fewNotes = buildProposalScore({ events: [[48, 0], [50, 2], [52, 4]].flatMap(([note, t]) => [{ type: 'note_on', note, time: t, velocity: 0.7 }, { type: 'note_off', note, time: t + 1.8, velocity: 0 }]) });
check('Trois attaques seulement : « trop peu de notes », pas « rythme irrégulier »', fewNotes.meter.certain === false && /^Trop peu de notes pour reconnaître une pulsation/.test(fewNotes.limits[0]), fewNotes.limits[0]);

// ── Exemple écrit par l'application (temps en battues, tempo connu) : rien n'est estimé ──
const writtenExample = buildProposalScore({ events: [{ type: 'noteOn', note: 48, time: 0, velocity: 0.7 }, { type: 'noteOn', note: 60, time: 0, velocity: 0.7 }, { type: 'noteOn', note: 64, time: 0.5, velocity: 0.7 }, { type: 'noteOn', note: 67, time: 1, velocity: 0.7 }, { type: 'noteOn', note: 71, time: 1.5, velocity: 0.7 }, ...[48, 60, 64, 67, 71].map((note) => ({ type: 'noteOff', note, time: 4 }))], chordLabels: [{ at: 0, name: 'Cmaj7' }], writtenTempo: 72 });
check('Exemple écrit : tempo connu, mesure certaine, aucune mention d\'estimation', writtenExample.meter.certain && writtenExample.meter.bpm === 72 && /écrit par l’application, à 72 à la noire/.test(writtenExample.limits[0]) && !writtenExample.limits.some((l) => /supposées|estimée/.test(l)));
check('Exemple écrit : Do3 en clé de fa ; Do4, Mi4, Sol4, Si4 arpégés puis tenus en clé de sol', line(writtenExample.bars[0].bass) === 'C3:w' && /^C4:8 C4\+E4:8 C4\+E4\+G4:8 C4\+E4\+G4\+B4:8 C4\+E4\+G4\+B4:h$/.test(line(writtenExample.bars[0].treble)), `${line(writtenExample.bars[0].bass)} | ${line(writtenExample.bars[0].treble)}`);

// ── Synchronisation : le temps RÉEL du lecteur, pas le temps arrondi ──
check('La lecture suit les secondes réelles (mesure 2 à 2 s)', scorePositionAt(score, 2.01).bar === 1 && scorePositionAt(score, 0.6).unit === 4 && scorePositionAt(score, 4.5).bar === 2);
check('Avant la première note : aucune position', scorePositionAt(score, -1) === null);
const late = freeScore.onsets.find((o) => o.seconds === 3.41);
check('Prise libre : l\'attaque jouée à 3,41 s est suivie à 3,41 s, où qu\'elle soit écrite', Boolean(late) && scorePositionAt(freeScore, 3.42).unit === late.unit);

console.log(`\n=== Résultat : ${passed}/${passed + failed} tests passés ===`);
process.exit(failed === 0 ? 0 : 1);
