// Les motifs latins doivent survivre aux réglages réels de l'application,
// pas uniquement au banc historique qui force « Sans doublure ».
import assert from 'node:assert/strict';
import catalogue from './exercise-catalogue.js';
import { createPracticeExercise, renderExerciseTarget, renderVoicingChoices } from './practice-exercise.js';
import { buildDemo } from './practice-demo.js';

const entries = catalogue.movements.filter((m) => m.category === 'Latino');
const motifs = entries.filter((m) => m.provenance.adaptedFrom);
assert.equal(entries.length, 10);
assert.equal(motifs.length, 2);
let transpositions = 0;
const engine = () => { const e = createPracticeExercise(); e.setMode('movement'); return e; };
const ons = (demo, at, hand) => demo.events.filter((e) => e.type === 'noteOn' && e.time === at && e.hand === hand).map((e) => e.note).sort((a, b) => a - b);
const attacks = (chords) => buildDemo(chords, 'gospel').events;
for (const entry of entries) {
  assert.equal(entry.score.preserveTexture, true);
  for (let key = 0; key < 12; key += 1) {
    const e = engine();
    assert.equal(e.getState().doubling, 'full', 'le défaut demandé par Narcisse reste conservé');
    e.setKeyChoice(key); e.setContentChoice(entry.id);
    const chords = e.getState().progression.chords;
    assert.equal(e.getState().progression.notice, null);
    assert.ok(chords.every((c) => c.studyStep.writtenVoicing));
    chords.forEach((c, i) => {
      assert.deepEqual(c.voicing.leftHand, entry.score.steps[i].lh.map((n) => n + key));
      assert.deepEqual(c.voicing.rightHand, entry.score.steps[i].rh.map((n) => n + key));
    });
    const expected = attacks(chords);
    e.setDoubling('none');
    assert.deepEqual(attacks(e.getState().progression.chords), expected, 'les doublures génériques ne dénaturent pas le motif en Auto');
    e.setDoubling('full'); e.setLeftHandStyle('swing');
    assert.deepEqual(attacks(e.getState().progression.chords), expected, 'une main gauche de style ne remplace pas la partie écrite');
    e.setTechnique('drop2');
    const beforePreview = structuredClone(e.getState());
    assert.deepEqual(attacks(e.previewMovement(entry.id, key)), expected, 'la bibliothèque ne dépend pas de la technique explorée auparavant');
    assert.deepEqual(e.getState(), beforePreview, 'l’aperçu ne modifie pas les réglages du pianiste');
    transpositions += 1;
  }
}
const e = engine(); e.setKeyChoice(0); e.setContentChoice('latin-montuno-guajeo');
const montuno = e.getState().progression.chords;
assert.deepEqual(montuno.map((c) => c.name), ['Cm', 'Ab', 'G7'], 'la grille est celle du motif mineur, sans septièmes ajoutées aux triades');
const demo = buildDemo(montuno, 'gospel');
assert.equal(demo.beats, 32, 'quatre cycles de huit temps, sans terminaison ajoutée');
assert.deepEqual(ons(demo, .25, 'lh'), [43]);
assert.deepEqual(ons(demo, .25, 'rh'), [55, 67], 'octaves mobiles, pas arpège générique');
assert.deepEqual(ons(demo, .75, 'rh'), [60, 72]);
assert.deepEqual(ons(demo, 2, 'rh'), [56, 68]);
assert.deepEqual(ons(demo, 5.5, 'lh'), [42], 'approche chromatique relevée, distincte d’un nouvel accord');
assert.deepEqual(ons(demo, 5.5, 'rh'), [54, 66]);
assert.deepEqual(ons(demo, 8.25, 'rh'), ons(demo, .25, 'rh'), 'la reprise garde sa phase');
assert.ok(!demo.events.some((x) => x.type === 'noteOn' && x.time === 0), 'le premier silence ne disparaît pas');
assert.ok(!renderExerciseTarget(e.getState().target, { doubling: 'full' }).includes('data-exercise-doubling'), 'pas de filtre affiché avec une valeur ignorée dans le motif écrit');
assert.ok(renderVoicingChoices(montuno[2]).includes('Motif écrit'));
assert.ok(!renderVoicingChoices(montuno[2]).includes('data-technique="drop2"'), 'les notes de ce motif ne sont pas remplaçables par une recette d’accord');
e.setTechnique('drop2');
assert.deepEqual(attacks(e.getState().progression.chords), demo.events, 'une ancienne technique ne réécrit pas ce motif à hauteurs fixes');
const plain = buildDemo(montuno, 'plaque');
assert.deepEqual(ons(plain, 0, 'rh'), [60, 63, 67], 'Accords seuls reste une comparaison explicite');
assert.ok(!plain.events.some((x) => x.type === 'noteOn' && x.note === 66));

e.setTechnique('auto'); e.setContentChoice('latin-riff-salsa');
const riff = buildDemo(e.getState().progression.chords, 'gospel');
assert.equal(riff.beats, 32);
assert.deepEqual(ons(riff, 1, 'lh'), [40]);
assert.deepEqual(ons(riff, 1, 'rh'), [55]);
assert.deepEqual(ons(riff, 1.5, 'lh'), [38]);
assert.deepEqual(ons(riff, 1.5, 'rh'), [53]);
assert.deepEqual(ons(riff, 3.5, 'rh'), [59], 'la phrase ne devient pas une simple montée de triade');
const riffSource = buildDemo(e.previewMovement('latin-riff-salsa', 7), 'gospel');
assert.deepEqual(e.previewMovement('latin-riff-salsa', 7).map(c=>c.name), ['G'], 'le riff est en Sol majeur, pas sur Sol7');
assert.deepEqual(ons(riffSource, 3.5, 'rh'), [66], 'Fa dièse de Sol majeur demandé par Narcisse');
assert.ok(!riffSource.events.some(x=>x.type==='noteOn' && x.note%12===5), 'aucun Fa naturel dans ce riff en Sol majeur');
for (let key=0;key<12;key+=1) {
  const transposed=buildDemo(e.previewMovement('latin-riff-salsa',key),'gospel');
  assert.ok(transposed.events.filter(x=>x.type==='noteOn').every(x=>[0,2,4,5,7,9,11].includes((x.note-key+12)%12)), 'le riff reste diatonique majeur dans chaque tonalité');
}
assert.deepEqual(ons(riffSource, 0, 'lh'), [43], 'registre de Sol2 de la référence');
assert.deepEqual(ons(riffSource, 0, 'rh'), [59, 67], 'registre Si3–Sol4 de la référence');
for (const m of motifs) {
  const ref = m.provenance.adaptedFrom;
  assert.match(ref.sha256, /^[a-f0-9]{64}$/);
  assert.ok(ref.file.endsWith('.mp4') && ref.excerptSeconds[1] > ref.excerptSeconds[0]);
  for (const s of m.score.steps) for (const a of s.attacks) {
    assert.ok(['lh', 'rh'].includes(a.hand));
    assert.ok(a.notes.length && a.notes.length <= 5 && a.notes.every((n) => Number.isInteger(n) && n >= 28 && n <= 85));
    assert.ok(Math.max(...a.notes) - Math.min(...a.notes) <= 12);
    assert.ok(a.at >= 0 && a.at + a.duration < s.beats);
  }
}
// Les accords et grilles ordinaires gardent les doublures et l'exploration.
e.setLeftHandStyle('none'); e.setContentChoice('study-ii-v-i-major');
assert.equal(e.getState().doubling, 'full');
assert.ok(e.getState().progression.chords.every((c) => !c.studyStep.writtenVoicing));
console.log(`Latino : ${transpositions} cas avec réglages réels, aperçu indépendant, deux motifs vidéo, quatre cycles, transposition et absence de modification des autres études vérifiés.`);
