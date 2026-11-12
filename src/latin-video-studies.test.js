// Régressions propres aux références fournies le 11 novembre : aucune recette
// de comping ni validation d'accord ne doit remplacer un motif ou un lick.
import assert from 'node:assert/strict';
import catalogue from './exercise-catalogue.js';
import { createPracticeExercise, judgeAnswer, writtenNoteLabel } from './practice-exercise.js';
import { buildDemo, buildStudyDemo } from './practice-demo.js';

const entries = catalogue.movements.filter(m => m.provenance.kind === 'source-excerpt');
const byId = id => entries.find(m => m.id === id);
const engine = (id, key = null) => {
  const e = createPracticeExercise(); e.setMode('movement');
  if (key !== null) e.setKeyChoice(key);
  e.setContentChoice(id); return e;
};
const noteOns = demo => demo.events.filter(e => e.type === 'noteOn');
const nativeDemo = id => { const e = engine(id); return buildDemo(e.getState().progression.chords, 'gospel'); };

assert.equal(entries.length, 5, 'deux motifs vidéo et les trois licks conservés');
for (const id of ['latin-montuno-one-minute','latin-essential-montuno','latin-montuno-tumbao-koala']) assert.ok(!byId(id), 'contenu retiré à la demande du pianiste');
for (const m of entries) {
  const video = m.provenance.video;
  assert.equal(video.url, `https://www.youtube.com/watch?v=${video.id}`);
  assert.ok(video.excerptSeconds[0] >= 0 && video.excerptSeconds[1] > video.excerptSeconds[0]);
  assert.equal(m.score.repeats, 1, 'un passage écrit, sans quatre boucles ajoutées');
  assert.equal(engine(m.id).getState().progression.currentKey, m.writtenKey, 'départ dans la tonalité de la référence');
  assert.equal(engine(m.id, 3).getState().progression.currentKey, 3, 'le choix explicite du pianiste reste prioritaire');
  assert.ok(m.score.steps.every(s => s.attacks.every(a => a.notes?.length)), 'aucune recette harmonique à la place des notes relevées');
}
const first = noteOns(nativeDemo('latin-coordination-mineure')).filter(e=>e.time===0);
assert.deepEqual(first.map(e=>e.note).sort((a,b)=>a-b), [33,57,69], 'basse La1 et octaves de la référence');
const major = noteOns(nativeDemo('latin-major-groove'));
assert.ok(major.some(e=>e.hand==='rh' && e.note===55 && e.time<16));
assert.ok(major.some(e=>e.hand==='rh' && e.note===79 && e.time>=16), 'la reprise monte réellement à l’octave');

let gestures=0;
for (const id of ['latin-ellen-lick-1','latin-ellen-lick-2','latin-ellen-lick-3']) {
  const m=byId(id); assert.ok(m, id);
  assert.equal(m.score.practice,'notes');
  const e=engine(id), chords=e.getState().progression.chords;
  assert.deepEqual(buildDemo(chords,'plaque'),buildDemo(chords,'gospel'), 'une préférence Accords seuls ne transforme pas le lick');
  for (const [i,target] of chords.entries()) {
    e.goToStep(i);
    assert.ok(e.isCorrect(target.notes));
    assert.ok(!e.isCorrect(target.notes.map(n=>n+12)), 'registre réel, pas seulement classes de hauteur');
    assert.ok(!e.isCorrect([...target.notes,21]), 'pas de note étrangère validée');
    assert.ok(judgeAnswer(target.notes,target).success);
    gestures++;
  }
  const target=chords[0];
  assert.ok(!judgeAnswer([52,56,59,62],target).success, 'un Mi7 correct ne remplace pas le premier geste');
}
const lick1=engine('latin-ellen-lick-1').getState().progression.chords[0];
assert.equal(writtenNoteLabel(56,lick1,{keyPc:9,minor:true}),'G#3', 'la sensible de La mineur reste Sol♯');
// Une note tenue franchit le repère harmonique sans être rejouée ni coupée.
const carry=buildStudyDemo([
  {voicing:{leftHand:[48],rightHand:[]},studyStep:{beats:1,carryAcrossSteps:true,writtenVoicing:true,keyPc:0,attacks:[{at:0,hand:'lh',notes:[48],duration:1.5,velocity:.6}]}},
  {voicing:{leftHand:[],rightHand:[64]},studyStep:{beats:1,carryAcrossSteps:true,writtenVoicing:true,keyPc:0,attacks:[{at:0,hand:'rh',notes:[64],duration:5,velocity:.6}]}},
]);
assert.ok(carry.events.some(e=>e.type==='noteOff' && e.note===48 && e.time===1.5));
assert.ok(carry.events.some(e=>e.type==='noteOff' && e.note===64 && e.time===1.99), 'aucune tenue après la fin');
const one={notes:[69],studyStep:{practice:'notes',keyPc:0,allowedHeld:[48]}};
assert.ok(judgeAnswer([69],one).success && judgeAnswer([48,69],one).success);
assert.ok(!judgeAnswer([68,69],one).success);
console.log(`${entries.length} relevés vidéo ; ${gestures} gestes de licks : source, registre, indépendance des mains, transposition et tenues vérifiés.`);
