// [Claude] — 2026-11-01 — Ce que joue le prof, décrit comme un pianiste le lit :
// rôles du voicing, voix intérieures, conduite des voix (teacher-voicings.js).
import { teacherVoicings, innerVoices, teacherVoicingLines } from './teacher-voicings.js';

let passed = 0;
let failed = 0;
function check(label, ok, detail = '') {
  if (ok) { passed += 1; console.log(`  ✅ ${label}`); return; }
  failed += 1;
  console.log(`  ❌ ${label}${detail ? ` — ${detail}` : ''}`);
}

// Dm7 (Ré La | Fa Do) → G7 (Sol Fa | Si Ré) : la 7e de Dm7 descend sur la tierce de G7.
const NOTES = [
  { midi: 50, start: 0, end: 1.9, hand: 'lh' }, { midi: 57, start: 0, end: 1.9, hand: 'lh' },
  { midi: 65, start: 0, end: 1.9, hand: 'rh' }, { midi: 72, start: 0, end: 1.9, hand: 'rh' },
  // G7 : Sol à la basse, Fa tenu (7e), Si (3ce) sous le Ré — le Do de Dm7 descend d'un demi-ton dessus.
  { midi: 43, start: 2, end: 3.9, hand: 'lh' },
  { midi: 65, start: 2, end: 3.9, hand: 'rh' }, { midi: 71, start: 2, end: 3.9, hand: 'rh' },
  { midi: 74, start: 2, end: 3.9, hand: 'rh' },
];
const CHORDS = [
  { start: 0, end: 2, label: 'Dm7' },
  { start: 2, end: 4, label: 'G7' },
];

console.log('Les voicings du prof');
const v = teacherVoicings(NOTES, CHORDS, { start: 0, end: 4 });
check('un voicing par accord du passage', v.length === 2, `${v.length}`);
check('les mains sont séparées', v[0].leftHand.join(',') === '50,57' && v[0].rightHand.join(',') === '65,72',
  `${v[0].leftHand} | ${v[0].rightHand}`);
check('la main gauche de G7 n\'a que la basse', v[1].leftHand.join(',') === '43', v[1].leftHand.join(','));
check('le nom de l\'accord suit', v[0].name === 'Dm7' && v[1].name === 'G7');
// Une note qui arrive bien après l'attaque est une ligne, pas l'accord.
const withLine = teacherVoicings([...NOTES, { midi: 79, start: 1.2, end: 1.5, hand: 'rh' }], CHORDS, { start: 0, end: 4 });
check('une note jouée après l\'attaque n\'entre pas dans le voicing', !withLine[0].rightHand.includes(79),
  withLine[0].rightHand.join(','));
check('hors du passage, rien', teacherVoicings(NOTES, CHORDS, { start: 10, end: 20 }).length === 0);
check('sans note, rien', teacherVoicings([], CHORDS, { start: 0, end: 4 }).length === 0);

console.log('Les voix intérieures');
check('ni la basse ni le dessus', innerVoices({ leftHand: [50, 57], rightHand: [65, 72] }).join(',') === '57,65',
  innerVoices({ leftHand: [50, 57], rightHand: [65, 72] }).join(','));
check('deux notes : aucune voix intérieure', innerVoices({ leftHand: [50], rightHand: [65] }).length === 0);
check('un voicing vide ne casse rien', innerVoices({}).length === 0);

console.log('Ce qu\'il joue ici, pour le Copilote');
const lines = teacherVoicingLines({ notes: NOTES, chords: CHORDS, start: 0, end: 4 });
const text = lines.join('\n');
check('les rôles du voicing sont donnés', /main gauche .* \| main droite /.test(text), text);
// Le cœur de la demande de Narcisse : la conduite des voix, calculée et non devinée.
check('la conduite des voix est donnée', /→ vers G7 : .*(descend|monte|reste)/.test(text),
  lines.find((l) => /vers G7/.test(l)) || text);
// Le 7→3 du ii-V, reconnu et nommé — et le Fa commun aux deux accords, signalé comme tel.
check('la 7e de Dm7 descend sur la tierce de G7', /Do \(7e\) descend sur Si, la 3ce de G7/.test(text),
  lines.find((l) => /vers G7/.test(l)) || '');
check('la note commune est dite commune', /Fa reste \(3ce → 7e\)/.test(text),
  lines.find((l) => /vers G7/.test(l)) || '');
check('les voix intérieures sont nommées, pas comptées', /voix intérieures : [A-Z]/.test(text)
  && !/voix intérieures : \d+ \(/.test(text), lines.find((l) => /intérieures/.test(l)) || '');
check('le modèle est prié de ne pas les contredire', /ne les contredis pas/.test(text));
// On préfère se taire plutôt qu'inventer.
check('sans note lisible, aucune ligne', teacherVoicingLines({ notes: [], chords: CHORDS, start: 0, end: 4 }).length === 0);
check('sans accord lisible, aucune ligne', teacherVoicingLines({ notes: NOTES, chords: [], start: 0, end: 4 }).length === 0);
// Un passage long ne noie pas le contexte.
const manyChords = Array.from({ length: 20 }, (_, i) => ({ start: i * 2, end: i * 2 + 2, label: 'Dm7' }));
const manyNotes = manyChords.flatMap((c) => [
  { midi: 50, start: c.start, end: c.end, hand: 'lh' }, { midi: 57, start: c.start, end: c.end, hand: 'lh' },
  { midi: 65, start: c.start, end: c.end, hand: 'rh' }, { midi: 72, start: c.start, end: c.end, hand: 'rh' },
]);
const long = teacherVoicingLines({ notes: manyNotes, chords: manyChords, start: 0, end: 40, max: 5 });
check('un passage long est tronqué, et le dit', /8 accords de plus|accords de plus/.test(long.join('\n'))
  && long.filter((l) => l.startsWith('- ')).length === 5, `${long.filter((l) => l.startsWith('- ')).length} accords`);

console.log(`\n=== Résultat : ${passed}/${passed + failed} contrôles passés ===`);
if (failed) process.exit(1);
