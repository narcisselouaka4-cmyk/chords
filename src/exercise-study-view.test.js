import assert from 'node:assert/strict';
import catalogue from './exercise-catalogue.js';
import { createPracticeExercise, judgeAnswer } from './practice-exercise.js';
import { buildDemo } from './practice-demo.js';
import { studyTempo, studyPulse, studyForPlayback, phraseGestures } from './exercise-study-view.js';

const find = id => catalogue.movements.find(m=>m.id===id);
const factors = { 'latin-montuno-guajeo':1.5, 'latin-coordination-mineure':1.3, 'latin-major-groove':1.3,
  'latin-ellen-lick-1':1.8, 'latin-ellen-lick-2':1.8, 'latin-ellen-lick-3':1.8 };
assert.equal(catalogue.movements.filter(m=>m.category==='Latino').length,8);
for(const [id,factor] of Object.entries(factors)) {
  const m=find(id);
  assert.equal(studyTempo(m),m.score.tempo*factor);
  assert.equal(studyPulse(m),2);
  assert.equal(studyForPlayback(studyForPlayback(m,'plaque'),'auto'),m,'retour à la phrase source intacte');
}
assert.equal(studyTempo(find('latin-ellen-lick-1'))/2,108,'pulsation de présentation à la blanche');
assert.equal(studyTempo(find('study-turnaround')),find('study-turnaround').score.tempo*1.3);
assert.equal(studyPulse(find('study-turnaround')),1);
let transpositions=0;
for(const id of Object.keys(factors)) for(let key=0;key<12;key++) {
  const e=createPracticeExercise();e.setMode('movement');e.setKeyChoice(key);e.setContentChoice(id);
  const before=structuredClone(e.getState().progression.chords);
  const phrase=buildDemo(before,'gospel');
  e.goToStep(Math.min(4,before.length-1));
  e.setStudyPlayback('plaque');
  const plain=e.getState().progression;
  assert.equal(plain.currentKey,key);
  assert.ok(plain.chords.every(c=>c.studyStep.practice!=='notes'));
  assert.ok(Math.abs(buildDemo(plain.chords,'plaque').beats-phrase.beats)<1e-6,'même durée musicale, avec les silences et les reprises');
  for(const chord of plain.chords) assert.ok(judgeAnswer(chord.notes,chord).success);
  if(id.startsWith('latin-ellen')) {
    assert.ok(plain.chords.length<before.length,'des accords, pas les notes du lick plaquées séparément');
    assert.ok(plain.chords.every(c=>c.notes.length>=4));
    const source=find(id);
    assert.equal(plain.chords.length,source.score.harmony.length);
    if(id.endsWith('1')) {
      assert.deepEqual(plain.chords.map(c=>c.token),['5:7','1:m','5:7','1:m']);
      assert.equal(before[0].studyStep.cellName, key===9?'G#dim7':before[0].studyStep.cellName);
      if(key===2) assert.equal(before[0].studyStep.cellName,'C#dim7');
    }
  } else {
    const gestures=phraseGestures(before);
    assert.ok(gestures.length>before.length,'la frise montre les attaques du motif');
    for(const g of gestures) assert.ok(g.notes.every(n=>phrase.events.some(ev=>ev.type==='noteOn'&&Math.abs(ev.time-g.phraseBeat)<.001&&ev.note===n)));
  }
  e.setStudyPlayback('auto');
  assert.deepEqual(e.getState().progression.chords,before,'les notes, les mains et les durées source sont préservées');
  transpositions++;
}
console.log(`✓ Vitesses de référence, pulsation moitié, accords/gestes réversibles et arpège diminué : ${transpositions} transpositions.`);
