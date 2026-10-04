// [Claude] — 2026-10-04 — Tests de song-structure.js : la structure d'un morceau (sa boucle,
// ses parties, ses accords de passage, ses remplacements).
// Exécutable avec : node src/pedagogie/test-song-structure.js

import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import {
  harmonicTokens, structureKey, keyName, degreeLabel, findLoop, songStructure, structureLines, structureMomentLines, respell,
} from './song-structure.js';

let total = 0;
let passed = 0;
function check(name, ok, detail = '') {
  total += 1;
  if (ok) { passed += 1; console.log(`  ✓ ${name}`); } else console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
}

/** Une grille datée : [[accord, secondes], …], répétée `times` fois, à partir de `from`. */
function grid(seq, { times = 1, from = 0 } = {}) {
  const out = [];
  let t = from;
  for (let k = 0; k < times; k += 1) {
    for (const [label, seconds] of seq) {
      out.push({ start: Math.round(t * 1000) / 1000, end: Math.round((t + seconds) * 1000) / 1000, label });
      t += seconds;
    }
  }
  return out;
}
const loops = (s) => s.sections.filter((x) => x.kind === 'loop');
const degrees = (section) => section.pattern.map((x) => x.degree).join(' – ');
const names = (section) => section.pattern.map((x) => x.name).join(' – ');

console.log('Degrés');
const C = { rootPc: 0, minor: false };
check('Diatoniques : 1, 5, 6 ; leur couleur seulement quand elle change',
  degreeLabel(C, { rootPc: 0, family: 'major' }) === '1' && degreeLabel(C, { rootPc: 7, family: 'dominant' }) === '5'
  && degreeLabel(C, { rootPc: 9, family: 'minor' }) === '6' && degreeLabel(C, { rootPc: 4, family: 'dominant' }) === '3(7)'
  && degreeLabel(C, { rootPc: 5, family: 'minor' }) === '4(m)');
check('Hors gamme : b7, b2(7) (substitution tritonique), #4(°)',
  degreeLabel(C, { rootPc: 10, family: 'major' }) === 'b7' && degreeLabel(C, { rootPc: 1, family: 'dominant' }) === 'b2(7)'
  && degreeLabel(C, { rootPc: 6, family: 'dim' }) === '#4(°)');
check('Un diminué hors gamme, sur le degré du dessous haussé : #1(°) (C#°7 vers Dm), #5(°) (G#°7 vers Am) ; en La mineur, #7(°)',
  degreeLabel(C, { rootPc: 1, family: 'dim' }) === '#1(°)' && degreeLabel(C, { rootPc: 8, family: 'dim' }) === '#5(°)'
  && degreeLabel(C, { rootPc: 3, family: 'dim' }) === '#2(°)' && degreeLabel({ rootPc: 9, minor: true }, { rootPc: 8, family: 'dim' }) === '#7(°)'
  && degreeLabel(C, { rootPc: 1, family: 'dominant' }) === 'b2(7)');
check('En mineur : 1, 4, 5 ; le 7 de la gamme mineure', degreeLabel({ rootPc: 9, minor: true }, { rootPc: 9, family: 'minor' }) === '1'
  && degreeLabel({ rootPc: 9, minor: true }, { rootPc: 4, family: 'dominant' }) === '5' && degreeLabel({ rootPc: 9, minor: true }, { rootPc: 7, family: 'major' }) === '7');

console.log('Jetons');
const merged = harmonicTokens(grid([['Dsus4', 1], ['D', 3], ['Em7', 2], ['Em9', 2], ['C', 4]]));
check('Même harmonie fusionnée (Dsus4 puis D ; Em7 puis Em9), nommée par sa plus longue partie',
  merged.map((t) => t.name).join(' ') === 'D Em7 C' && merged[0].dur === 4 && merged[1].dur === 4, merged.map((t) => `${t.name}:${t.dur}`).join(' '));
// « Em7 » à la frise, mais Do à la basse et Mi Sol Si Ré au-dessus : c'est Cmaj9.
const relu = harmonicTokens([{ start: 0, end: 2, label: 'Em7' }, { start: 2, end: 4, label: 'G' }], {
  notes: [{ midi: 36, start: 0.02, end: 2, hand: 'lh' }, { midi: 64, start: 0, end: 2, hand: 'rh' }, { midi: 67, start: 0, end: 2, hand: 'rh' }, { midi: 71, start: 0, end: 2, hand: 'rh' }, { midi: 74, start: 0, end: 2, hand: 'rh' }],
});
check('Un accord relu d\'après ses notes (Em7 avec Do à la basse : un accord de Do)', relu[0].rootPc === 0 && relu[1].name === 'G', relu.map((t) => t.name).join(' '));

console.log('Tonalité');
const lovely = grid([['G', 2], ['Em', 2], ['C', 2], ['D', 2]], { times: 6 });
check('Donnée par le tuto (« G major »), ou devinée d\'après les accords (Sol majeur)',
  keyName(structureKey('G major')) === 'Sol majeur' && !structureKey('G major').guessed
  && keyName(structureKey(null, harmonicTokens(lovely))) === 'Sol majeur' && structureKey(null, harmonicTokens(lovely)).guessed);
check('Fa♯ mineur, Si♭ majeur', keyName(structureKey('F#m')) === 'Fa♯ mineur' && keyName(structureKey('Bb')) === 'Si♭ majeur');

console.log('La boucle');
let s = songStructure({ chords: lovely, key: 'G major' });
check('1 – 6 – 4 – 5 en Sol : une boucle de 4 accords, 6 tours, 8 s par tour',
  loops(s).length === 1 && degrees(loops(s)[0]) === '1 – 6 – 4 – 5' && names(loops(s)[0]) === 'G – Em – C – D'
  && loops(s)[0].cycles === 6 && Math.round(loops(s)[0].secondsPerCycle) === 8 && s.sections.length === 1,
  JSON.stringify(s.sections.map((x) => [x.kind, x.pattern && degrees(x), x.cycles])));
const keys = [1, 6, 4, 5, 1, 6, 4, 5, 1, 6, 4, 5];
check('findLoop : la plus courte qui couvre tout (4, pas 8)', findLoop(keys, keys.map(() => 2))?.period === 4);

// Le gospel « 4-5-3-6-2-5-1 », trois fois, en Do.
s = songStructure({ chords: grid([['Fmaj7', 2], ['G7', 2], ['Em7', 2], ['Am7', 2], ['Dm7', 2], ['G7', 2], ['Cmaj7', 4]], { times: 3 }), key: 'C' });
check('4-5-3-6-2-5-1 : une boucle de 7 accords (le 5 deux fois)', loops(s).length === 1 && degrees(loops(s)[0]) === '4 – 5 – 3 – 6 – 2 – 5 – 1' && loops(s)[0].cycles === 3,
  JSON.stringify(s.sections.map((x) => [x.kind, x.pattern && degrees(x)])));

// Les mêmes 4 accords, avec des accords de passage : B7 (0,5 s) avant Em à chaque tour,
// D/F# avant G aux tours 2 à 6.
const withPassing = [];
for (let k = 0; k < 6; k += 1) {
  withPassing.push(...grid([['G', 1.5], ['B7', 0.5], ['Em', 2], ['C', 2], ...(k < 5 ? [['D', 1.5], ['D/F#', 0.5]] : [['D', 2]])], { from: k * 8 }));
}
s = songStructure({ chords: withPassing, key: 'G' });
const passing = loops(s)[0]?.passing || [];
check('Les accords de passage n\'entrent pas dans la boucle', degrees(loops(s)[0]) === '1 – 6 – 4 – 5' && loops(s)[0].cycles === 6, degrees(loops(s)[0] || { pattern: [] }));
check('B7 avant le 6 (Em) : dominante de l\'accord d\'arrivée, 6 fois',
  passing.some((g) => g.name === 'B7' && g.before.degree === '6' && g.count === 6 && /dominante de l'accord d'arrivée/.test(g.relation)), JSON.stringify(passing.map((g) => [g.name, g.before.degree, g.count, g.relation])));
check('D/F# avant le 1 (G) : la basse qui monte vers lui, 5 fois',
  passing.some((g) => g.name === 'D/F#' && g.before.degree === '1' && g.count === 5 && /basse/.test(g.relation)));

// Remplacements : aux tours 3 et 6, Am7 à la place de C.
const subs = [];
for (let k = 0; k < 7; k += 1) subs.push(...grid([['G', 2], ['Em', 2], [k === 2 || k === 5 ? 'Am7' : 'C', 2], ['D', 2]], { from: k * 8 }));
s = songStructure({ chords: subs, key: 'G' });
const sec = loops(s)[0];
check('Remplacement : le 4 (C) par Am7 (le 2), aux tours 3 et 6 ; la boucle reste 1 – 6 – 4 – 5',
  loops(s).length === 1 && degrees(sec) === '1 – 6 – 4 – 5' && sec.cycles === 7 && sec.subs.length === 2
  && sec.subs.every((r) => r.name === 'Am7' && r.degree === '2' && r.expected.degree === '4')
  && sec.subs.map((r) => r.at).join() === '20,44', JSON.stringify(s.sections.map((x) => [x.kind, x.pattern && degrees(x), x.subs?.map((r) => [r.name, r.at])])));
// Un tour sur deux : c'est une boucle de 8 accords (1-6-4-5 puis 1-6-2-5).
const alternate = [];
for (let k = 0; k < 6; k += 1) alternate.push(...grid([['G', 2], ['Em', 2], [k % 2 ? 'Am7' : 'C', 2], ['D', 2]], { from: k * 8 }));
s = songStructure({ chords: alternate, key: 'G' });
check('Le remplacement un tour sur deux : une boucle de 8 accords, 1-6-4-5 puis 1-6-2-5',
  loops(s).length === 1 && degrees(loops(s)[0]) === '1 – 6 – 4 – 5 – 1 – 6 – 2 – 5' && loops(s)[0].cycles === 3,
  JSON.stringify(s.sections.map((x) => [x.kind, x.pattern && degrees(x), x.cycles])));

// Introduction (le 5, 4 s) et fin (4 puis 1).
s = songStructure({ chords: [...grid([['D', 4]]), ...grid([['G', 2], ['Em', 2], ['C', 2], ['D', 2]], { times: 4, from: 4 }), ...grid([['C', 2], ['G', 6]], { from: 36 })], key: 'G' });
check('Introduction et fin, hors de la boucle',
  s.sections.map((x) => x.kind === 'loop' ? 'boucle' : x.place).join(' ') === 'intro boucle fin'
  && s.sections[0].chords.map((c) => c.degree).join() === '5' && s.sections[2].chords.map((c) => c.degree).join() === '4,1',
  JSON.stringify(s.sections.map((x) => [x.kind, x.place, x.chords?.map((c) => c.degree), x.pattern && degrees(x)])));

// Deux parties : A (1-6-4-5) quatre fois, B (4-5-3-6) quatre fois, puis A deux fois.
s = songStructure({
  chords: [
    ...grid([['G', 2], ['Em', 2], ['C', 2], ['D', 2]], { times: 4 }),
    ...grid([['C', 2], ['D', 2], ['Bm', 2], ['Em', 2]], { times: 4, from: 32 }),
    ...grid([['G', 2], ['Em', 2], ['C', 2], ['D', 2]], { times: 2, from: 64 }),
  ],
  key: 'G',
});
check('Deux parties : A, B, puis A qui revient (même lettre)',
  loops(s).map((x) => `${x.label}:${degrees(x)}`).join(' | ') === 'A:1 – 6 – 4 – 5 | B:4 – 5 – 3 – 6 | A:1 – 6 – 4 – 5',
  JSON.stringify(s.sections.map((x) => [x.kind, x.label, x.pattern && degrees(x), x.start, x.end])));

// Rien ne se répète : pas de boucle inventée.
s = songStructure({ chords: grid([['C', 2], ['F', 2], ['Bb', 2], ['Eb', 2], ['Ab', 2], ['Db', 2]]), key: 'C' });
check('Une suite qui ne revient pas : pas de boucle', loops(s).length === 0 && structureLines(s).some((l) => /Pas de boucle/.test(l)), structureLines(s).join(' / '));

// Une erreur de lecture isolée ne casse pas la boucle.
const noisy = grid([['G', 2], ['Em', 2], ['C', 2], ['D', 2]], { times: 8 });
noisy[13].label = 'Am'; // un C lu « Am » au 4e tour
noisy[22].label = 'Bm'; // un Em lu « Bm » au 6e tour
s = songStructure({ chords: noisy, key: 'G' });
check('Deux erreurs de lecture : la boucle tient, chacune notée une seule fois',
  loops(s).length === 1 && degrees(loops(s)[0]) === '1 – 6 – 4 – 5' && loops(s)[0].subs.length === 2,
  JSON.stringify(s.sections.map((x) => [x.kind, x.pattern && degrees(x), x.subs?.length])));

// Des erreurs qui recopient l'accord voisin (Em lu « G » après G) : les deux fusionnent, un
// accord manque au tour. La boucle tient, et commence bien au début.
const merging = grid([['G', 2], ['Em', 2], ['C', 2], ['D', 2]], { times: 8 });
merging[4 + 1].label = 'G';  // tour 2 : Em lu « G »
merging[28 + 0].label = 'D'; // tour 8 : G lu « D » (après le D du tour 7)
s = songStructure({ chords: merging, key: 'G' });
check('Un accord lu comme son voisin (fusionné) : la boucle tient dès le début, l\'accord sauté est noté',
  loops(s).length === 1 && degrees(loops(s)[0]) === '1 – 6 – 4 – 5' && loops(s)[0].start === 0 && loops(s)[0].missing.length >= 1,
  JSON.stringify(s.sections.map((x) => [x.kind, x.pattern && degrees(x), x.start, x.missing?.length])));
// Des erreurs de lecture aux tours pairs : quelques fenêtres décalées les évitent, la boucle
// est vue à l'identique (sûre), dès le début.
const scattered = grid([['G', 2], ['Em', 2], ['C', 2], ['D', 2]], { times: 8 });
scattered[4 + 1].label = 'Bm';  // tour 2 : Em lu « Bm »
scattered[12 + 2].label = 'Am'; // tour 4 : C lu « Am »
scattered[20 + 3].label = 'Bm'; // tour 6 : D lu « Bm »
scattered[28 + 0].label = 'Bm'; // tour 8 : G lu « Bm »
s = songStructure({ chords: scattered, key: 'G' });
check('Des erreurs aux tours pairs, à des places différentes : la boucle, dès le début',
  loops(s).length === 1 && degrees(loops(s)[0]) === '1 – 6 – 4 – 5' && loops(s)[0].start === 0 && loops(s)[0].subs.length === 4,
  JSON.stringify(s.sections.map((x) => [x.kind, x.pattern && degrees(x), x.start, x.subs?.length])));
// Le Do mal lu à chaque tour pair, chaque fois autrement : aucun tour n'est identique au
// suivant ; la boucle est trouvée à la majorité, et dite « probable ».
const everyOther = grid([['G', 2], ['Em', 2], ['C', 2], ['D', 2]], { times: 8 });
everyOther[4 + 2].label = 'Am';    // tour 2
everyOther[12 + 2].label = 'Bm';   // tour 4
everyOther[20 + 2].label = 'F#dim'; // tour 6
everyOther[28 + 2].label = 'Am';   // tour 8
s = songStructure({ chords: everyOther, key: 'G' });
check('Une erreur de lecture un tour sur deux : la boucle trouvée à la majorité, « probable »',
  loops(s).length === 1 && degrees(loops(s)[0]) === '1 – 6 – 4 – 5' && loops(s)[0].sure === false && loops(s)[0].start === 0
  && structureLines(s).some((l) => /^Boucle — 4 accords : 1 – 6 – 4 – 5 .*\(probable/.test(l)),
  JSON.stringify(s.sections.map((x) => [x.kind, x.pattern && degrees(x), x.sure, x.start])));

console.log('Pour le Copilote');
s = songStructure({ chords: withPassing, key: 'G' });
let lines = structureLines(s);
check('« Boucle — 4 accords : 1 – 6 – 4 – 5 (G – Em – C – D) », tours, accords de passage',
  lines.some((l) => l === 'Boucle — 4 accords : 1 – 6 – 4 – 5 (G – Em – C – D) ; environ 8 s par tour ; 6 tours (0:00 → 0:48).')
  && lines.some((l) => /^ {2}Accords de passage : .*B7 avant le 6 \(Em\) : dominante de l'accord d'arrivée, 6 fois/.test(l)), lines.join('\n'));
s = songStructure({ chords: subs, key: 'G' });
lines = structureLines(s);
check('« Remplacement : le 4 (C) remplacé par Am7 (2), à 0:20 et 0:44 »',
  lines.some((l) => l === '  Remplacement : le 4 (C) remplacé par Am7 (2), à 0:20 et 0:44.'), lines.join('\n'));

console.log('Le passage désigné, dans la structure');
s = songStructure({ chords: withPassing, key: 'G' });
let moment = structureMomentLines(s, { start: 16, end: 24 });
check('Tour 3 sur 6 ; chaque accord à sa place ; B7 de passage avant Em',
  moment[0] === 'Dans la structure : boucle 1 – 6 – 4 – 5 (G – Em – C – D), tour 3 sur 6.'
  && moment[1] === 'Accords de la boucle ici : 0:16 le 1 (G) · 0:18 le 6 (Em) · 0:20 le 4 (C) · 0:22 le 5 (D).'
  && /^Accords de passage ici : 0:17 B7 avant le 6 \(Em\) : dominante de l'accord d'arrivée ; 0:23 D\/F# avant le 1 \(G\)/.test(moment[2] || ''), moment.join('\n'));
s = songStructure({ chords: subs, key: 'G' });
moment = structureMomentLines(s, { start: 16, end: 24 });
check('Un remplacement dans le passage : « le 4 remplacé par Am7 (2) »', moment.some((l) => /0:20 le 4 remplacé par Am7 \(2\)/.test(l)), moment.join('\n'));
moment = structureMomentLines(s, { start: 0, end: 56 });
check('Un long passage : seulement les écarts à la boucle', moment.some((l) => l === 'Écarts à la boucle ici : 0:20 le 4 remplacé par Am7 (2) · 0:44 le 4 remplacé par Am7 (2) (les autres accords sont à leur place).'), moment.join('\n'));
s = songStructure({ chords: [...grid([['D', 4]]), ...grid([['G', 2], ['Em', 2], ['C', 2], ['D', 2]], { times: 4, from: 4 })], key: 'G' });
check('Dans l\'introduction : hors boucle, ses accords', structureMomentLines(s, { start: 0, end: 3 })[0] === 'Dans la structure : l\'introduction, hors boucle. Accords principaux ici : 0:00 5 (D).', structureMomentLines(s, { start: 0, end: 3 }).join(' / '));

// [Claude] — 2026-10-04 — Le vrai relevé de Narcisse : « L'Éternel est bon » (Dena Mwana, solo
// blues), clavier dessiné lu à l'image, 48 s. Des notes de mélodie y sont lues comme des
// « accords » (« A », « A# » : une seule note), des accords n'y sont pas nommés (« F? » : Fa Do
// Mi♭), la tonalité y est écrite « A# ».
console.log('Le vrai relevé de « L\'Éternel est bon »');
check('L\'orthographe de la tonalité : Si♭ majeur (pas La♯) ; les accords aussi (A# → Bb, D#maj7/G → Ebmaj7/G, D/F# reste)',
  keyName(structureKey('A#')) === 'Si♭ majeur' && respell('A#', true) === 'Bb' && respell('D#maj7/G', true) === 'Ebmaj7/G'
  && respell('D/F#', true) === 'D/F#' && respell('G#9sus4', true) === 'Ab9sus4');
// L'orthographe suit le degré : hors gamme, le degré d'usage (b2, b3, #4, b6, b7 en majeur).
{
  const C = structureKey('C');
  const A = structureKey('A');
  const Bb = structureKey('Bb');
  const Em = structureKey('Em');
  const spelled = [
    respell('C#9', C), respell('Db9', C), respell('A#', C), respell('D#m7', C), respell('Gb7', C),
    respell('Db', A), respell('Bb7', A), respell('A#7', A),
    respell('A#', Bb), respell('D#maj7/G', Bb), respell('G#9sus4', Bb), respell('D/F#', Bb), respell('B7', Bb), respell('Cm/F', Bb),
    respell('Eb', Em), respell('D#°7', Em), respell('C#/F', structureKey('F#')),
  ].join(' ');
  check('Les accords écrits d\'après leur degré : en Do, Db9 (b2), Bb (b7), Ebm7, F#7 (#4) ; en La, C# et Bb7 ; en Si♭, B7 (pas Cb7)',
    spelled === 'Db9 Db9 Bb Ebm7 F#7 C# Bb7 Bb7 Bb Ebmaj7/G Ab9sus4 D/F# B7 Cm/F D# D#°7 C#/F', spelled);
  // Un diminué hors gamme monte vers le degré suivant : écrit sur le degré du dessous, haussé.
  const dims = [
    respell('Db°7', C), respell('Ebdim7', C), respell('Abo7', C), respell('Gb°7', structureKey('F')), respell('Bbdim7', structureKey('Am')),
    respell('Bbm7b5', C), respell('Bb°7', structureKey('Bb')),
  ].join(' ');
  check('Les diminués de passage : en Do, C#°7 (vers Dm), D#dim7 (vers Em), G#o7 (vers Am) ; en Fa, F#°7 ; un demi-diminué garde son degré (Bbm7b5)',
    dims === 'C#°7 D#dim7 G#o7 F#°7 A#dim7 Bbm7b5 Bb°7', dims);
}
check('Un accord posé sur une autre basse (Cm/F) : le 5 (F9sus4) en Si♭, pas le 2 ; un renversement (F/A) garde sa fondamentale',
  harmonicTokens([{ start: 0, end: 2, label: 'Cm/F' }, { start: 2, end: 4, label: 'F/A' }]).map((t) => `${t.rootPc}:${t.family}`).join(' ') === '5:sus 5:major');
const unnamed = harmonicTokens([{ start: 0, end: 2, label: 'F?' }, { start: 2, end: 4, label: 'G?' }, { start: 4, end: 6, label: 'A' }], {
  notes: [[53, 0], [60, 0], [63, 0], [67, 2], [70, 2], [72, 2], [45, 4], [72, 4]].map(([midi, start]) => ({ midi, start, end: start + 1.5 })),
});
check('« F? » (Fa Do Mi♭) lu F7 ; « G? » (Sol Si♭ Do) lu Gm ; « A » joué La et Do lu Am', unnamed.map((t) => t.name).join(' ') === 'F7 Gm Am', unnamed.map((t) => t.name).join(' '));
const real = JSON.parse(readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'eternel-est-bon.json'), 'utf-8'));
// Comme l'application : pas les « accords » d'une seule note.
const realChords = real.segments.filter((x) => !(Array.isArray(x.midis) && new Set(x.midis.map((m) => m % 12)).size < 2)).map((x) => ({ start: x.start, end: x.end, label: x.label }));
s = songStructure({ chords: realChords, notes: real.noteEvents, key: real.key });
lines = structureLines(s);
check('Si♭ majeur ; 48 s sans boucle (la suite ne se répète pas) : elle est dite, sans en inventer',
  s.key.name === 'Si♭ majeur' && loops(s).length === 0 && lines.some((l) => /^Pas de boucle/.test(l)), lines.join('\n'));
check('Les accords principaux dans l\'ordre, bien écrits : b7 (Ab9sus4) – 4 (Ebmaj7/G) – 5 (F7) – 6 (Gm) – 2 (Cm) – 5 (F7) – 1 (Bb) — le 2-5-1 vers Si♭',
  lines.some((l) => l.startsWith('Accords principaux, dans l\'ordre : b7 (Ab9sus4) – 4 (Ebmaj7/G) – 5 (F7) – 6 (Gm) – 2 (Cm) – 5 (F7) – 1 (Bb) – 6 (Gm)')), lines.join('\n'));
moment = structureMomentLines(s, { start: 18, end: 48 });
check('Le passage 0:18 → 0:48 : « pas de boucle », et les accords qui y tombent', /^Dans la structure : pas de boucle \(la suite des accords ne se répète pas\)\. Accords principaux ici : .*0:45 6 \(Gm7\)\.$/.test(moment[0] || ''), moment.join('\n'));

// Les grilles réelles du dépôt (relevées au son, avec leurs erreurs) : rien ne casse, et ce
// qui est trouvé est montré pour mémoire.
console.log('Grilles réelles (benchmark_outputs)');
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
for (const file of ['chords_ton_nom_est_jehovah.json', 'chords_amazing_grace.json', 'chords_autumn_leaves_mix.json']) {
  const path = resolve(root, 'benchmark_outputs', file);
  if (!existsSync(path)) continue;
  const text = readFileSync(path, 'utf-8');
  const data = JSON.parse(text.slice(text.indexOf('{')));
  const chords = data.chords.map((c) => ({ start: c.startTime, end: c.endTime, label: c.chord }));
  let result = null;
  let error = null;
  try {
    result = songStructure({ chords, key: `${data.key}${data.keyMode === 'minor' ? 'm' : ''}` });
  } catch (err) {
    error = err;
  }
  check(`${file} : analysée sans erreur`, !error && result, error?.message);
  if (result) console.log(`      ${structureLines(result).slice(2).join('\n      ')}`);
}

console.log(`\n=== Résultat : ${passed}/${total} contrôles passés ===`);
if (passed < total) process.exitCode = 1;
