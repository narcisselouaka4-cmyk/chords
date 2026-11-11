// Contrat musical du catalogue actif : harmonie fixée, réalisation propre,
// transposition exacte, carte fidèle à l'écoute et provenance explicite.
import assert from 'node:assert/strict';
import catalogue, { libraryGrids, findCatalogueEntry } from './exercise-catalogue.js';
import legacy from './data/movements-library.json' with { type: 'json' };
import gridKinds from './data/exercise-grid-kinds.json' with { type: 'json' };
import { createPracticeExercise as createEngine, listMovementNames, movementChordNames, spellChordTone } from './practice-exercise.js';
// [Claude] — 2026-11-08 — doubling par défaut passé à 'full' dans l'app (Narcisse) ;
// useWritten (practice-exercise.js) exige doubling === 'none' pour afficher la
// mise en voix de l'étude. Ce fichier existe pour vérifier CETTE mise en voix :
// on revient à 'none' pour garder ce contrat testé, indépendamment du défaut appli.
const createPracticeExercise = () => {
  const ex = createEngine();
  ex.setDoubling('none');
  return ex;
};
import { buildDemo } from './practice-demo.js';
import { exerciseContext, exerciseContextLines } from './pedagogie/exercise-context.js';
import { upsertGrid, saveGrids, loadGrids } from './practice-grids.js';

let cases = 0;
assert.equal(spellChordTone('C#',9,'dim7'),'Bb', 'septième diminuée, et non sixte');
assert.equal(spellChordTone('C#',6,'dim7'),'G', 'quinte diminuée, et non onzième augmentée');
const signatures = new Set();
for (const entry of catalogue.movements) {
  assert.ok(['progression','passage','study'].includes(entry.kind));
  assert.equal(entry.pattern.split('-').length, entry.score.steps.length);
  assert.ok(entry.preserveQualities && entry.noAutoPassing);
  assert.equal(entry.provenance.kind, 'original-study');
  assert.ok(entry.provenance.sources.every((s) => s.title && s.supports && new URL(s.url).protocol === 'https:'));
  if (entry.kind === 'passage') {
    assert.equal(entry.roles[0], 'departure');
    assert.equal(entry.roles.at(-1), 'arrival');
    assert.ok(entry.roles.includes('passing'));
  }
  signatures.add(JSON.stringify(entry.score.steps.map((s) => ({ beats:s.beats, attacks:s.attacks.map(({at,hand,duration})=>({at,hand,duration})) }))));
  for (let key = 0; key < 12; key++) {
    const ex = createPracticeExercise(); ex.setMode('movement'); ex.setKeyChoice(key); ex.setContentChoice(entry.id);
    const state = ex.getState(), chords = state.progression.chords;
    assert.equal(state.progression.name, entry.name);
    assert.equal(state.progression.notice, null);
    assert.deepEqual(chords.map((c)=>c.name), movementChordNames(entry,key));
    assert.ok(chords.every((c)=>!c.passingChord), 'aucun accord intercalé par le moteur');
    chords.forEach((chord, i) => {
      const step = entry.score.steps[i];
      assert.equal(chord.quality, chord.symbol, 'la qualité reste disponible aux menus de voicings et de dessus');
      assert.deepEqual(chord.voicing.leftHand, step.lh.map(n=>n+key));
      assert.deepEqual(chord.voicing.rightHand, step.rh.map(n=>n+key));
      ex.goToStep(i);
      assert.ok(ex.isCorrect(chord.notes), `${entry.id} ${key} ${i} : le voicing écrit doit être une réponse correcte`);
    });
    const phrase = buildDemo(chords,'gospel');
    const plain = buildDemo(chords,'plaque');
    const expectedBeats=entry.score.steps.reduce((sum,s)=>sum+s.beats,0);
    assert.equal(phrase.beats,expectedBeats);
    assert.equal(plain.beats,expectedBeats);
    let at=0;
    for(const [i,chord] of chords.entries()) {
      assert.ok(phrase.events.some(e=>e.type==='step' && e.step===i && e.time===at));
      const heard=new Set(phrase.events.filter(e=>e.type==='noteOn' && e.time>=at && e.time<at+entry.score.steps[i].beats).map(e=>e.note));
      assert.ok(chord.notes.every(n=>heard.has(n)), `${entry.id} ${key} ${i} : toutes les notes de la carte sont jouées`);
      at+=entry.score.steps[i].beats;
    }
    for(const demo of [phrase,plain]) {
      const held=new Map();
      let last=-1;
      for(const e of demo.events) {
        assert.ok(Number.isFinite(e.time) && e.time>=last && e.time<=demo.beats);
        last=e.time;
        if(!['noteOn','noteOff'].includes(e.type)) continue;
        const id=`${e.hand}:${e.note}`;
        assert.ok(e.note>=28 && e.note<=96);
        if(e.type==='noteOn') { assert.ok(!held.has(id), `${entry.id} : double attaque tenue ${id}@${e.time}`); held.set(id,e.note); }
        else { assert.ok(held.has(id), `${entry.id} : relâchement sans note ${id}@${e.time}`); held.delete(id); }
        for(const hand of ['lh','rh']) {
          const notes=[...held].filter(([id])=>id.startsWith(hand)).map(([,n])=>n);
          assert.ok(notes.length<=5);
          assert.ok(!notes.length || Math.max(...notes)-Math.min(...notes)<=12, `${entry.id} : extension au-delà de l'octave`);
        }
      }
      assert.equal(held.size,0);
      assert.ok(!demo.events.some(e=>e.type==='sustain' || e.type==='passing'));
    }
    const original=chords.map(c=>({name:c.name, notes:c.notes}));
    for(const color of [1,2,4,5]) {
      ex.setDifficulty(color);
      assert.deepEqual(ex.getState().progression.chords.map(c=>({name:c.name,notes:c.notes})), original, 'les anciennes recettes ne réécrivent pas une étude');
    }
    const context=exerciseContext(ex.getState());
    assert.equal(context.contentKind,entry.kind);
    assert.equal(context.harmonicColor,null);
    assert.ok(exerciseContextLines(context).some(s=>s.includes('originale écrite')));
    cases++;
  }
}
assert.equal(signatures.size,catalogue.movements.length,'chaque étude a une partition rythmique distincte');
assert.equal(libraryGrids.length,61);
assert.equal(new Set(libraryGrids.map((m) => m.id)).size,61);
assert.deepEqual(Object.keys(gridKinds).sort(),legacy.movements.map((m) => m.id).sort(), 'chaque grille a un classement explicite, sans oubli');
let gridCases = 0;
for (const original of legacy.movements) {
  const entry = findCatalogueEntry(original.id);
  assert.ok(['progression','passage','study'].includes(entry.kind));
  assert.equal(entry.category, { progression:'Progressions',passage:'Mouvements',study:'Gestes & voix' }[entry.kind]);
  assert.ok(!entry.score, 'une grille ne devient pas une étude écrite par son classement');
  assert.deepEqual(entry.passing,original.passing, 'conserver les passages explicitement écrits');
  assert.ok(entry.tags.includes(original.category), 'la famille musicale reste cherchable');
  assert.ok(entry.aliases.includes(original.name), 'les anciens noms restent cherchables');
  for (let key=0;key<12;key++) {
    const before = createEngine({ library:{ movements:[{...original,preserveQualities:true,noAutoPassing:true}] } });
    const after = createPracticeExercise();
    for (const engine of [before,after]) {
      engine.setDoubling('none'); engine.setMode('movement'); engine.setKeyChoice(key); engine.setContentChoice(original.id);
    }
    const harmony = (engine) => engine.getState().progression.chords.map((c) => ({name:c.name, notes:c.notes, passing:c.passingChord && {name:c.passingChord.name,notes:c.passingChord.notes}}));
    assert.deepEqual(harmony(after),harmony(before), `${original.id} : classement sans changement musical en tonalité ${key}`);
    gridCases++;
  }
}
assert.equal(findCatalogueEntry('jazz-blues-1').kind,'progression');
assert.equal(findCatalogueEntry('ii-v-to-iv-1').kind,'passage');
assert.equal(findCatalogueEntry('minor-line-cliche-1').kind,'study');
assert.ok(listMovementNames().every(name=>findCatalogueEntry(name).score));
const archive=createPracticeExercise(); archive.setMode('movement');archive.setKeyChoice(0);archive.setContentChoice('basic-ii-v-i-major-1');
assert.equal(archive.getState().progression.movement.kind,'progression');
assert.equal(archive.getState().progression.chords.map(c=>c.name).join(' '),'Dm7 G7 Cmaj7');
assert.ok(archive.getState().progression.chords.every(c=>!c.passingChord));
assert.equal(findCatalogueEntry('Cadence II-V-I majeur').id,'study-ii-v-i-major');
const explore=createPracticeExercise(); explore.setMode('movement');explore.setKeyChoice(0);explore.setContentChoice('study-ii-v-i-major');explore.setTechnique('drop2');
assert.ok(explore.getState().progression.chords.every(c=>!c.studyStep.writtenVoicing && !c.passingChord));
assert.deepEqual(explore.getState().progression.chords.map(c=>c.name),['Dm7','G7','Cmaj7']);
const personal=createPracticeExercise();
personal.setCustomGrid('Dm7 G7b9 Cm6');
assert.deepEqual(personal.getState().progression.chords.map(c=>c.name),['Dm7','G7b9','Cm6']);
assert.ok(personal.getState().progression.chords.every(c=>!c.passingChord));
personal.setCustomGrid([{name:'Cmaj7'},{name:'A7b9',role:'passing'},{name:'Dm7'}]);
assert.equal(personal.getState().progression.chords[0].passingChord.name,'A7b9');
const saved=upsertGrid([],{name:'Passage personnel',chords:[{name:'Cmaj7'},{name:'A7b9',role:'passing'},{name:'Dm7'}]});
let stored=''; const storage={setItem:(_k,v)=>{stored=v;},getItem:()=>stored};
saveGrids(storage,saved.grids);
assert.equal(loadGrids(storage)[0].chords[1].role,'passing');
console.log(`${catalogue.movements.length} études · ${cases} transpositions : harmonie, notes, phrasé, mains, provenance et absence d'ajouts vérifiés.`);
console.log(`${libraryGrids.length} grilles classées · ${gridCases} transpositions : accords, notes et passages écrits inchangés.`);
