import assert from 'node:assert/strict';
import fs from 'node:fs';
import {arrangementFrames,buildPhraseArrangement} from './phrase-arrangement.js';
import {applyTakeEdit,notePairs} from './take-edit.js';
import {extractMelody} from '../recorder/melody-line.js';

const original=JSON.parse(fs.readFileSync(new URL('./fixtures/copilot-arpeggiated-take.json',import.meta.url)));
const snapshot=JSON.stringify(original),pc=n=>(n%12+12)%12;
for(const shift of [0,2,5,7,11]){
  const take={...original,events:original.events.map(e=>({...e,...(e.note!=null?{note:e.note+shift}:{})}))};
  const frames=arrangementFrames(take),plan=buildPhraseArrangement(take);assert(plan);
  const changed=applyTakeEdit(take,plan.advice.edit);assert(changed);
  let enriched=0;
  for(const at of [1.803,5.575,7.503,11.222]){
    const f=frames.find(f=>Math.abs(f.at-at)<.01);assert(f?.rolledSource,'Accord roulé reconnu au lieu d’être ignoré');
    assert(f.source.every(p=>p.event.note<=f.topMidi));
    const h=plan.harmony.find(h=>Math.abs(h.at-f.at)<.001);assert(h);
    if(h.kind==='original'){
      for(const p of f.source)assert(changed.events.some(e=>JSON.stringify(e)===JSON.stringify(p.event)));
      continue;
    }
    assert.equal(h.kind,'enrich');enriched++;
    assert.equal(pc(h.notes[0]),pc(f.bassMidi),'Garder le parcours de basse du geste récupéré');
    const attacks=plan.advice.edit.notes.filter(n=>n.time>=f.at&&n.time<h.end&&h.notes.includes(n.note));
    assert(attacks.length);
    assert(!plan.harmony.some(h=>h.goal==='passing'&&h.at<f.end&&h.end>f.at),
      'L’arpège récupéré n’est pas tronqué par un nouvel accord de passage');
    if(pc(f.chord.rootPc)===pc(7+shift)){
      assert(h.notes.some(n=>pc(n)===pc(5+shift)),'La dominante de Do reçoit Fa, pas Fa dièse');
      assert(!h.notes.some(n=>pc(n)===pc(6+shift)));
    }
  }
  assert(enriched>=(shift===0?4:3),'Transformation de la majorité des accords récupérés, repli intact si aucun voicing jouable');
  for(const m of extractMelody(take.events)){
    const pair=notePairs(take.events).find(p=>p.event.note===m.midi&&p.event.time===m.start);assert(pair);
    // Le skyline peut oublier un dessus entré sous une note précédente encore
    // tenue. Sa prochaine note basse est alors un faux candidat mélodique :
    // elle ne devient accompagnement qu'avec un dessus réel tenu au-dessus.
    if(plan.advice.edit.remove.includes(pair.on)){
      const frame=frames.find(f=>f.rolledSource&&f.accompaniment.some(p=>p.on===pair.on));
      assert(frame&&frame.top.event.note>pair.event.note&&frame.top.end>=pair.event.time+.08,
        'Une note mélodique ne peut être reclassée sans preuve d’un dessus réellement tenu');
    }else for(const i of [pair.on,pair.off])assert(changed.events.some(e=>JSON.stringify(e)===JSON.stringify(take.events[i])));
  }
  assert(!frames.some(f=>f.at<1),'Le début en ligne ascendante ne devient pas un accord plaqué');
}
assert.equal(JSON.stringify(original),snapshot);

const source=(late,{topEnd=2,topAt=0}={})=>({duration:3,events:[
  [48,0,2],[64,topAt,topEnd],[55,late,2],
].flatMap(([note,time,end])=>[{type:'note_on',time,note,velocity:.6},{type:'note_off',time:end,note,velocity:0}])
  .sort((a,b)=>a.time-b.time)});
assert(arrangementFrames(source(.5)).some(f=>f.rolledSource),'Basse et dessus ensemble, intérieur retardé mais tenu avec eux');
assert(!arrangementFrames(source(.5,{topAt:.2})).some(f=>f.rolledSource),'Pas de récupération d’une simple ligne de notes successives');
assert(!arrangementFrames(source(.5,{topEnd:.55})).some(f=>f.rolledSource),'Pas d’accord fabriqué avec un dessus déjà relâché');
assert(!arrangementFrames(source(1.2)).some(f=>f.rolledSource),'Ne pas absorber une note éloignée dans un autre geste');
console.log('✓ Quatre accords arpeggiés récupérés dans cinq tonalités : basses, mélodie exacte, dominante cohérente, pas de passage superposé ; lignes successives et tenues insuffisantes refusées.');
