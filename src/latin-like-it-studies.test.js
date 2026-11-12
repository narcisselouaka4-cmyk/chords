import assert from 'node:assert/strict';
import catalogue from './exercise-catalogue.js';
import { createPracticeExercise } from './practice-exercise.js';
import { buildDemo } from './practice-demo.js';
import { studyTempo, studyPulse } from './exercise-study-view.js';

const entries = catalogue.movements.filter(m => m.provenance?.video?.id === 'kBRWsELlWqg');
assert.equal(entries.length,2);
const expectedRanges = [[0,35],[39,72.181]];
let cases=0;
for(const [part,m] of entries.entries()) {
  assert.deepEqual(m.provenance.video.excerptSeconds,expectedRanges[part]);
  assert.equal(m.score.repeats,1,'chaque réalisation complète est écrite une fois');
  assert.equal(m.writtenKey,5,'Fa mineur de la référence');
  assert.equal(studyTempo(m)/studyPulse(m),89.7);
  const e=createPracticeExercise();e.setMode('movement');e.setContentChoice(m.id);
  assert.equal(e.getState().progression.currentKey,5);
  const native=buildDemo(e.getState().progression.chords,'gospel');
  const onsets=native.events.filter(ev=>ev.type==='noteOn');
  assert.deepEqual(onsets.filter(ev=>ev.time===onsets[0].time).map(ev=>ev.note).sort((a,b)=>a-b),part===0?[48,60]:[53,65,77]);
  assert.equal(Math.max(...onsets.map(ev=>ev.note)),part===0?65:84,'la seconde réalisation monte réellement dans le registre');
  assert.ok(m.score.steps.length>=90,'conserver tout le déroulement, pas une cellule rebouclée');
  for(const ev of native.events) {
    const sourceTime=m.score.sourceOriginSeconds+ev.time*60/m.score.tempo;
    assert.ok(sourceTime>=expectedRanges[part][0]-.001&&sourceTime<=expectedRanges[part][1]+.001,'aucun événement de la transition 35–39 s');
  }
  for(let key=0;key<12;key++) {
    e.setKeyChoice(key);e.setContentChoice(m.id);
    const written=buildDemo(e.getState().progression.chords,'gospel');
    assert.deepEqual(written.events.filter(ev=>ev.type==='noteOn').map(ev=>ev.note),onsets.map(ev=>ev.note-5+key));
    e.setStudyPlayback('plaque');
    const chords=e.getState().progression.chords;
    assert.ok(chords.length<written.events.filter(ev=>ev.type==='step').length);
    assert.ok(!chords.some(c=>c.studyStep.practice==='notes'));
    assert.ok(Math.abs(buildDemo(chords,'plaque').beats-written.beats)<1e-5);
    e.setStudyPlayback('auto');
    assert.deepEqual(buildDemo(e.getState().progression.chords,'gospel'),written,'le retour restaure la réalisation entière');
    cases++;
  }
}
console.log(`✓ I Like It Like That : deux passages complets, transition exclue, registres distincts et vues accords/phrase dans ${cases} transpositions.`);
