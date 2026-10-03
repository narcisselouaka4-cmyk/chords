// Tests — Découpage d'une grille d'accords en parties (chord-sections.js).
// Usage : node src/analyzer/test-chord-sections.js

import { splitIntoSections, progressionOf, paletteOf, changeCountOf } from './chord-sections.js';

let failures = 0;
const assert = (cond, msg) => {
  if (cond) console.log(`  ✅ ${msg}`);
  else { console.error(`  ❌ ${msg}`); failures += 1; }
};
const test = (name, fn) => {
  console.log(`\n📋 ${name}`);
  try { fn(); } catch (e) { console.error(`  ❌ ${e.stack || e}`); failures += 1; }
};

/** Fabrique une suite d'accords de durée fixe à partir de symboles. */
const grid = (symbols, { from = 0, dur = 4, gapBefore = 0 } = {}) => {
  let t = from + gapBefore;
  return symbols.map((chord) => {
    const seg = { startTime: t, endTime: t + dur, chord, role: 'structural' };
    t += dur;
    return seg;
  });
};

test('grille vide', () => {
  assert(splitIntoSections([], 0).length === 0, 'aucune partie sur une grille vide');
  assert(splitIntoSections(null, 0).length === 0, 'aucune partie sur null');
});

test('une boucle qui se répète est LA MÊME partie qui revient', () => {
  // Dmaj7 G13 Am7 D7 joué deux fois = la boucle recommence à l'index 4.
  const chords = grid(['Dmaj7', 'G13', 'Am7', 'D7', 'Dmaj7', 'G13', 'Am7', 'D7']);
  const sections = splitIntoSections(chords, 32);
  assert(sections.length === 2, `deux passages détectés (obtenu ${sections.length})`);
  assert(sections[1].start === 16, `le second passage démarre à la reprise (obtenu ${sections[1].start})`);
  // Même assise harmonique des deux côtés : c'est A qui revient, pas un B.
  // C'est ce qui fait une structure — A · B · A se lit, A · B · C ment.
  assert(sections[0].letter === 'A' && sections[1].letter === 'A',
    `même lettre pour les deux passages (obtenu ${sections[0].letter} puis ${sections[1].letter})`);
  assert(sections[0].pass === 1 && sections[1].pass === 2, 'les passages sont numérotés 1 puis 2');
  assert(sections[0].label === 'Partie A', 'libellé « Partie A » — un repère, jamais « Refrain »');
});

test('une partie bâtie sur d\'autres accords reçoit une nouvelle lettre', () => {
  const a = grid(['Cmaj7', 'Fmaj7', 'Cmaj7', 'Fmaj7'], { dur: 5 });
  const b = grid(['Abmaj7', 'Bbm7', 'Eb7', 'Abmaj7'], { from: 20, dur: 5, gapBefore: 2 });
  const sections = splitIntoSections([...a, ...b], 44);
  const lettres = sections.map((s) => s.letter);
  assert(new Set(lettres).size >= 2, `au moins deux parties distinctes (obtenu ${lettres.join(' ')})`);
  assert(lettres[lettres.length - 1] !== lettres[0],
    'la partie finale ne porte pas la lettre de la première');
});

test('un silence franc coupe aussi', () => {
  const a = grid(['Cmaj7', 'Fmaj7', 'Cmaj7'], { dur: 5 });
  const b = grid(['Am7', 'Dm7', 'G7'], { from: 15, dur: 5, gapBefore: 3 });
  const sections = splitIntoSections([...a, ...b], 36);
  assert(sections.length === 2, `deux parties de part et d'autre du silence (obtenu ${sections.length})`);
  assert(sections[1].chords[0].chord === 'Am7', 'la seconde partie commence après le blanc');
});

test('une partie trop courte est absorbée, pas affichée seule', () => {
  // Suite sans reprise immédiate : rien ne la coupe en interne.
  const a = grid(['Cmaj7', 'Fmaj7', 'Am7', 'G7'], { dur: 5 });
  // Deux accords de 2 s après un blanc : 4 s, sous le seuil de 8 s.
  const court = grid(['Bm7b5', 'E7'], { from: 20, dur: 2, gapBefore: 2 });
  const sections = splitIntoSections([...a, ...court], 26);
  assert(sections.length === 1, `la respiration est absorbée (obtenu ${sections.length})`);
  assert(sections[0].chords.length === 6, 'ses accords restent dans la partie précédente');
  assert(sections[0].end === 26, 'la partie est étendue jusqu\'à la fin de la respiration');
});

test('une boucle répétée coupe aussi À L\'INTÉRIEUR d\'une suite continue', () => {
  // Cmaj7 Fmaj7 joué deux fois sans aucun blanc : la forme est là quand même.
  const chords = grid(['Cmaj7', 'Fmaj7', 'Cmaj7', 'Fmaj7'], { dur: 5 });
  const sections = splitIntoSections(chords, 20);
  assert(sections.length === 2, `la reprise ouvre une partie (obtenu ${sections.length})`);
  assert(sections[1].start === 10, 'la seconde partie démarre au deuxième passage');
});

test('les silences du moteur ne comptent pas comme des accords', () => {
  const chords = [
    { startTime: 0, endTime: 1, chord: 'N', role: 'silence' },
    ...grid(['Cmaj7', 'Fmaj7'], { from: 1, dur: 6 }),
  ];
  const sections = splitIntoSections(chords, 13);
  assert(sections.length === 1, 'une seule partie');
  assert(sections[0].chords.every((c) => c.role !== 'silence'), 'aucun segment de silence retenu');
  assert(sections[0].start === 1, 'la partie démarre au premier vrai accord');
});

test('morceau sans forme repérable = une seule partie', () => {
  const chords = grid(['Cmaj7', 'Dm7', 'Em7', 'Fmaj7', 'G7', 'Am7'], { dur: 6 });
  const sections = splitIntoSections(chords, 36);
  assert(sections.length === 1, "pas de découpe inventée quand rien ne la justifie");
});

test('progressionOf retire les répétitions consécutives', () => {
  const p = progressionOf(grid(['Cmaj7', 'Cmaj7', 'Fmaj7', 'Fmaj7', 'Cmaj7']));
  assert(JSON.stringify(p) === JSON.stringify(['Cmaj7', 'Fmaj7', 'Cmaj7']),
    `progression lissée (obtenu ${JSON.stringify(p)})`);
});

test('une correction manuelle prime sur la détection', () => {
  const chords = grid(['Cmaj7', 'Fmaj7'], { dur: 6 });
  chords[1].manualOverride = 'F6';
  assert(progressionOf(chords)[1] === 'F6', "c'est l'accord corrigé qui est lu");
});

test('une première partie trop courte est absorbée par la suivante', () => {
  // Deux accords de levée (4 s), puis le morceau. Rien avant elle : c'est la
  // partie suivante qui doit l'accueillir.
  const levee = grid(['Fmaj7', 'Gm7'], { dur: 2 });
  const corps = grid(['Cmaj7', 'Fmaj7', 'Am7', 'G7'], { from: 4, dur: 6, gapBefore: 2 });
  const sections = splitIntoSections([...levee, ...corps], 30);
  assert(sections.length === 1, `la levée ne forme pas une partie à elle seule (obtenu ${sections.length})`);
  assert(sections[0].start === 0, 'la partie démarre au tout début du morceau');
  assert(sections[0].chords.length === 6, 'la levée est conservée, pas jetée');
});

test('paletteOf classe les accords par le temps qu\'ils occupent', () => {
  const chords = [
    { startTime: 0, endTime: 20, chord: 'C#maj7', role: 'structural', segmentId: 's1' },
    { startTime: 20, endTime: 24, chord: 'Fm7', role: 'structural', segmentId: 's2' },
    { startTime: 24, endTime: 44, chord: 'C#maj7', role: 'structural', segmentId: 's3' },
    { startTime: 44, endTime: 50, chord: 'Gm7', role: 'passing', segmentId: 's4' },
  ];
  const pal = paletteOf(chords);
  assert(pal[0].symbol === 'C#maj7', "l'accord le plus présent vient en tête");
  assert(pal[0].seconds === 40 && pal[0].count === 2, '40 s cumulées sur 2 passages');
  assert(Math.round(pal[0].share * 100) === 80, `80 % du temps de la partie (obtenu ${Math.round(pal[0].share * 100)})`);
  assert(pal.map((p) => p.symbol).join(' ') === 'C#maj7 Gm7 Fm7', 'ordre décroissant strict');
  assert(pal[0].segmentId === 's1', "chaque entrée garde un segment où l'ouvrir dans la frise");
});

test('paletteOf sur une partie vide ne jette pas', () => {
  assert(paletteOf([]).length === 0, 'palette vide');
  assert(paletteOf(null).length === 0, 'palette vide sur null');
});

test('changeCountOf compte les changements, pas les segments', () => {
  const chords = grid(['Cmaj7', 'Cmaj7', 'Cmaj7', 'Fmaj7']);
  assert(changeCountOf(chords) === 2, `deux changements pour quatre segments (obtenu ${changeCountOf(chords)})`);
});

console.log('');
if (failures) { console.error(`❌ ${failures} assertion(s) en échec.`); process.exit(1); }
console.log('✅ Tous les tests chord-sections passent.');
