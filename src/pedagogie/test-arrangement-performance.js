import assert from 'node:assert/strict';
import fs from 'node:fs';
import {accompanimentPerformance} from './arrangement-performance.js';
import {buildPhraseArrangement,arrangementFrames} from './phrase-arrangement.js';
import {applyTakeEdit,notePairs} from './take-edit.js';
import {planPhraseMotions} from './phrase-motion.js';

const pair=(note,time,velocity)=>({event:{note,time,velocity},end:time+2});
const a={at:0,bassMidi:48,top:pair(72,0,.8),accompaniment:[pair(48,0,.3),pair(55,.25,.6)]};
const b={at:2,bassMidi:50,top:pair(74,2,.9),accompaniment:[pair(50,2,.5),pair(57,2,.8)]};
const main={at:0,end:2,notes:[48,52,55,59],frame:a,kind:'enrich'};
const next={at:2,end:4,notes:[50,53,57,60],frame:b,kind:'enrich'};
const passing={at:1,end:1.9,notes:[47,53,56,60],frame:a,kind:'dominant'};
const plan=[main,passing,next],performed=accompanimentPerformance(main,plan);
assert.equal(performed.get(48).at,0);assert.equal(performed.get(48).velocity,.3);
for(const n of [52,55,59]){
  assert.equal(performed.get(n).at,.25,'Les voix ne sont pas avancées sur la basse de l’arpège');
  assert.equal(performed.get(n).velocity,.6,'Pas de réduction de volume pour simuler une attaque douce');
}
for(const kind of ['dominant','iiø','tonic']){
  const p=accompanimentPerformance({...passing,kind},plan);
  assert(Math.abs(p.get(47).velocity-.4)<1e-10);
  assert(Math.abs(p.get(53).velocity-.7)<1e-10,'Même continuité des nuances quelle que soit la famille de passage');
}
const midiFrame={...a,accompaniment:a.accompaniment.map(p=>({...p,event:{...p.event,velocity:p.event.velocity*127}}))};
assert.deepEqual(accompanimentPerformance({...main,frame:midiFrame},[{...main,frame:midiFrame},next]),performed);
const snap=JSON.stringify(plan);accompanimentPerformance(main,plan);assert.equal(JSON.stringify(plan),snap);

// Le parcours de repli des accords de passage partage la même règle : une
// basse douce ne doit pas rendre ses trois autres voix inaudibles.
const blocks=[[48,52,55,64],[50,53,57,65],[43,53,59,67],[48,52,55,64]];
for(const hold of [1,1.9]){
const passageTake={duration:8,events:blocks.flatMap((ns,i)=>ns.flatMap((note,j)=>[
  {type:'note_on',note,time:i*2,velocity:j===0?.2:j===3?.8:.6,channel:0},
  {type:'note_off',note,time:i*2+hold,velocity:0,channel:0},
])).sort((a,b)=>a.time-b.time)};
const motions=planPhraseMotions(passageTake,{kind:'passing'});assert(motions.edits.length);
for(const edit of motions.edits){
  assert.equal(edit.velocities[0],.2);
  assert(edit.velocities.slice(1).every(v=>v===.6));
  const changed=applyTakeEdit(passageTake,edit);assert(changed);
  assert.deepEqual(applyTakeEdit(passageTake,JSON.parse(JSON.stringify(edit))),changed,'Nuances par voix conservées après sauvegarde JSON');
  const attacks=changed.events.filter(e=>e.type==='note_on'&&e.time>=edit.start&&e.time<edit.end);
  assert(attacks.some(e=>e.velocity===.6));
  for(const velocities of [[.2],Array(edit.notes.length).fill(0),Array(edit.notes.length).fill(NaN),null])
    assert.equal(applyTakeEdit(passageTake,{...edit,velocities}),null,'Refuser les nuances corrompues');
}
}

const take=JSON.parse(fs.readFileSync(new URL('./fixtures/copilot-arpeggiated-take.json',import.meta.url)));
for(const shift of [0,2,5,7,11]){
  const source={...take,events:take.events.map(e=>({...e,...(e.note!=null?{note:e.note+shift}:{})}))};
  const frames=arrangementFrames(source),f=frames.find(f=>f.chord.bassPc!=null&&f.chord.quality==='m');assert(f);
  const v=buildPhraseArrangement(source);assert(v);const changed=applyTakeEdit(source,v.advice.edit);assert(changed);
  const h=v.harmony.find(h=>Math.abs(h.at-f.at)<.001);assert(h);
  assert.equal(h.notes[0]%12,f.chord.bassPc,'La basse de renversement reste la basse du nouvel accord');
  const bass=f.accompaniment.find(p=>p.event.note===f.bassMidi);
  const inner=f.accompaniment.filter(p=>p!==bass);const innerAt=Math.min(...inner.map(p=>p.event.time));
  const added=v.advice.edit.notes.filter(n=>n.time>=f.at&&n.time<h.end&&h.notes.includes(n.note));
  assert(added.some(n=>n.note===h.notes[0]&&Math.abs(n.time-f.at)<.001));
  assert(added.filter(n=>n.note!==h.notes[0]).every(n=>n.time>=innerAt),
    'Pas d’accord plaqué avant l’entrée intérieure réellement jouée');
  assert(added.some(n=>n.note!==h.notes[0]&&Math.abs(n.time-innerAt)<.001));
  assert(added.filter(n=>n.note!==h.notes[0]).every(n=>n.velocity>=.5),'L’accord ne disparaît plus sous la mélodie');
  for(const segment of v.harmony.filter(h=>h.kind==='enrich')){
    const frame=frames.find(f=>Math.abs(f.at-segment.at)<.001);assert(frame);
    for(const n of v.advice.edit.notes.filter(n=>n.time>=segment.at&&n.time<segment.end&&segment.notes.includes(n.note)))
      assert(Math.abs(n.time-segment.at)<.00001||frame.accompaniment.some(p=>Math.abs(p.event.time-n.time)<.00001),
        'Le relâchement d’une note source ne doit pas fabriquer une nouvelle attaque');
  }
  for(const on of v.advice.edit.keep){const p=notePairs(source.events).find(p=>p.on===on);
    for(const i of [p.on,p.off])assert(changed.events.some(e=>JSON.stringify(e)===JSON.stringify(source.events[i])));
  }
}
console.log('✓ Jeu source : arpège et basse dans cinq tonalités, nuances conservées, relais pour passages/iiø/tonique, repli sans atténuation par la basse, notes mélodiques intactes, données corrompues refusées.');
