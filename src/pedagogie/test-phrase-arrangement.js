import assert from 'node:assert/strict';
import fs from 'node:fs';
import {buildPhraseArrangement,arrangementFrames} from './phrase-arrangement.js';
import {buildPhraseVariants} from './phrase-variants.js';
import {applyTakeEdit,notePairs} from './take-edit.js';
import {sendCopilotMessage} from './copilot-client.js';
import {refreshPlayingResult} from './playing-advice.js';
const t=JSON.parse(fs.readFileSync(new URL('./fixtures/copilot-session017.json',import.meta.url)));
const frozen=JSON.stringify(t);
const v=buildPhraseArrangement(t);assert(v);
const changed=applyTakeEdit(t,v.advice.edit);assert(changed);
assert.equal(arrangementFrames(t).length,10);
for(const on of v.advice.edit.keep){const p=notePairs(t.events).find(p=>p.on===on);for(const i of [p.on,p.off])assert(changed.events.some(e=>JSON.stringify(e)===JSON.stringify(t.events[i])));}
assert.equal(JSON.stringify(t),frozen);
assert(v.harmony.filter(h=>h.kind==='enrich').length>=8);
const ii=v.harmony.find(h=>h.kind==='iiø'&&h.at>8&&h.at<10);assert(ii&&ii.chord.startsWith('Si '));
const dom=v.harmony.find(h=>h.kind==='dominant'&&h.at>9&&h.at<10.459);assert(dom&&dom.chord.startsWith('Mi '));
assert(v.harmony.some(h=>h.kind==='tonic'&&h.chord.startsWith('Do ')));
const pedal=changed.events.filter(e=>e.controller===64);assert(pedal.length>10);assert.equal(pedal.at(-1).value,0);
assert.equal(notePairs(changed.events).length*2,changed.events.filter(e=>e.type==='note_on'||e.type==='note_off').length);
assert(!v.advice.changes.some(c=>c.technique==='inner-line'));
console.log('✓ Session réelle : dix accords, mélodie exacte, 7–3–6 et cadence finale, pédale renouvelée, aucun remplissage scalaire');
const keys=['C','Db','D','Eb','E','F','Gb','G','Ab','A','Bb','B'];
for(let shift=1;shift<12;shift++){
 const trans={...t,key:keys[shift]+' majeur',events:t.events.map(e=>({...e,...(e.note!=null?{note:e.note+shift}:{})}))};
 const x=buildPhraseArrangement(trans);assert(x,keys[shift]);assert(x.harmony.some(h=>h.kind==='dominant'));assert(applyTakeEdit(trans,x.advice.edit));
}
console.log('✓ Les douze tonalités produisent un plan rejouable, sans référence à des instants ou hauteurs codés pour Session_017');
const noPedal=buildPhraseArrangement(t,{message:'Améliore sans pédale'});assert(noPedal);assert.equal(noPedal.advice.edit.pedal.length,0);
const sustain={...t,events:[{type:'control',controller:64,value:127,time:0},...t.events,{type:'control',controller:64,value:0,time:t.duration}]};
const kept=buildPhraseArrangement(sustain);assert(kept);assert.equal(kept.advice.edit.pedal.length,0);assert(!kept.harmony.some(h=>h.kind==='dominant'));
const bass=buildPhraseArrangement(t,{message:'Garde ma basse'});if(bass)assert(!bass.harmony.some(h=>h.goal==='passing'));assert(buildPhraseVariants(t,{message:'Améliore mon jeu, garde ma basse'}).length);assert.equal(buildPhraseArrangement(t,{latin:true}),null);
assert.equal(buildPhraseArrangement(t,{message:'uniquement des accords fixes'}),null);
assert.equal(buildPhraseArrangement(t,{message:'Basses : Do Fa Ré Sol'}),null);
assert.equal(buildPhraseArrangement({duration:1,events:t.events.slice(0,2)}),null);
assert.equal(applyTakeEdit(t,{...v.advice.edit,remove:[...v.advice.edit.remove,v.advice.edit.keep[0]]}),null);
assert.equal(applyTakeEdit(t,{...v.advice.edit,pedal:[{time:0,value:127}]}),null);
assert.equal(applyTakeEdit(t,{...v.advice.edit,notes:[{note:120,time:0,end:1,velocity:.4}]}),null);
console.log('✓ Contraintes de basse, pédale, accords fixes et Latin ; refus des plans corrompus et prises insuffisantes');
const saved=JSON.parse(JSON.stringify({example:v.example,playingAdvice:v.advice}));assert(refreshPlayingResult(saved));assert.deepEqual(applyTakeEdit(t,saved.playingAdvice.edit).events,changed.events);
const first=buildPhraseVariants(t,{message:'Améliore mon jeu'});assert.equal(first[0].id,'arrangement');
const session=await sendCopilotMessage({message:'Améliore mon jeu',messages:[],context:{type:'session',playing:{session:t}}});assert.equal(session.toolResult.variants[0].id,'arrangement');
console.log('✓ Première carte construite, session sans prise supplémentaire, persistance JSON et relecture du plan');

for(const file of ['copilot-development-take.json','copilot-approved-links.json','copilot-arpeggiated-take.json']){
 const data=JSON.parse(fs.readFileSync(new URL('./fixtures/'+file,import.meta.url))),source=data.take||data;
 const x=buildPhraseArrangement(source);assert(x,file);assert(applyTakeEdit(source,x.advice.edit));
 for(const on of x.advice.edit.keep){const p=notePairs(source.events).find(p=>p.on===on);for(const i of [p.on,p.off])assert(applyTakeEdit(source,x.advice.edit).events.some(e=>JSON.stringify(e)===JSON.stringify(source.events[i])));}
}
const withoutKey=buildPhraseArrangement({...t,key:null});assert(withoutKey);assert(!withoutKey.harmony.some(h=>h.kind==='tonic'));assert(!withoutKey.harmony.some(h=>h.chord==='Sol majeur 9'));
console.log('✓ Trois autres prises réelles, arpèges protégés, collection diatonique sans tonique finale inventée');

const random=await sendCopilotMessage({message:"J'ai joué n'importe quoi, améliore mon jeu",messages:[],context:{playing:{passage:t}}});assert.equal(random.toolResult.example,null);console.log('✓ Une exploration déclarée au hasard ne reçoit pas un arrangement présenté comme une analyse musicale');
