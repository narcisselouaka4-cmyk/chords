import assert from 'node:assert/strict';
import fs from 'node:fs';
import {sendCopilotMessage,myPlayingExample} from './copilot-client.js';
import {isPersonalExample} from './personal-demo.js';
import {applyTakeEdit,notePairs} from './take-edit.js';
import {refreshPlayingResult} from './playing-advice.js';
const take=JSON.parse(fs.readFileSync(new URL('./fixtures/copilot-session017.json',import.meta.url)));
const context={type:'session',playing:{session:take}},frozen=JSON.stringify(take);
for(const message of ['rejoue ma session','tu peut pas rejouer ma session ?','réécoute ma session','rejoue la session']){
 const r=await sendCopilotMessage({message,messages:[],context});assert(r.ok&&r.autoplay);assert(isPersonalExample(r.toolResult));
 assert.deepEqual(r.toolResult.example.events,myPlayingExample(context.playing,{source:'session'}).example.events);
}
const replay=await sendCopilotMessage({message:'rejoue ma session',messages:[],context:{...context,playing:{session:{...take,offset:2}}}});
assert.equal(replay.toolResult.example.events.find(e=>e.type==='noteOn').note,take.events.find(e=>e.type==='note_on').note+2);
const group=await sendCopilotMessage({message:'Plaquer les accords ensemble (moments 0:03, 0:05, 0:08)',messages:[],context});assert(group.toolResult.example);
const edit=group.toolResult.playingAdvice.edit;assert.equal(edit.groups.length,3);
const aligned=applyTakeEdit(take,edit);assert(aligned);
for(const g of edit.groups)for(const on of g.ons){const p=notePairs(take.events).find(p=>p.on===on);assert(notePairs(aligned.events).some(x=>x.event.time===g.at&&x.event.note===p.event.note&&Math.abs((x.end-x.event.time)-(p.end-p.event.time))<1e-8));}
const bass=await sendCopilotMessage({message:'Aérer le grave à 0:15',messages:[],context});assert(bass.toolResult.example);
const b=bass.toolResult.playingAdvice;assert.equal(b.edit.type,'replace');const source=take.events[b.edit.on];assert(source.time>=15&&source.time<16);assert.equal(b.edit.note,source.note+12);
assert.equal(JSON.stringify(take),frozen);
assert(refreshPlayingResult(JSON.parse(JSON.stringify(bass.toolResult))).example);
const none=await sendCopilotMessage({message:'Plaquer les accords ensemble à 1:30',messages:[],context});assert.equal(none.toolResult.example,null);
const absent=await sendCopilotMessage({message:'rejoue ma session',messages:[],context:null});assert.equal(absent.toolResult.example,null);assert.match(absent.content,/Sessions MIDI/);
assert.equal(applyTakeEdit(take,{type:'align-attacks',groups:[{at:0,ons:[0,0]}]}),null);
console.log('✓ Les demandes exactes de la conversation : rejeu complet hors modèle, offset, trois accords alignés, grave aéré, source immuable, persistance et moment absent');

const hear=await sendCopilotMessage({message:'Réécouter cette proposition.',messages:[{role:'assistant',...group}],context});
assert(hear.autoplay);assert.deepEqual(hear.toolResult.example.events,group.toolResult.example.events);
const unrelated={...take,events:take.events.map(e=>({...e,...(e.note?{note:e.note+2}:{})}))};
const stale=await sendCopilotMessage({message:'Réécouter cette proposition.',messages:[{role:'assistant',...group}],context:{type:'session',playing:{session:unrelated}}});
assert.notDeepEqual(stale.toolResult.example?.events,group.toolResult.example.events);
console.log('✓ Réécoute de la correction exacte, sans réutilisation sur une autre session');

const {sessionAdjustmentAnswer}=await import('./session-adjustments.js');
assert.equal(sessionAdjustmentAnswer({message:'Pourquoi plaquer les accords ensemble ?',context}),null);
assert.equal(sessionAdjustmentAnswer({message:'Comment aérer le grave ?',context}),null);

const long={duration:90,events:[{type:'note_on',note:60,time:0,velocity:80},{type:'note_off',note:60,time:1},{type:'control',controller:64,value:127,time:89},{type:'note_on',note:64,time:89,velocity:90},{type:'note_off',note:64,time:90},{type:'control',controller:64,value:0,time:90}]};
const whole=await sendCopilotMessage({message:'Rejoue ma session.',messages:[],context:{type:'session',playing:{session:long}}});
assert.equal(whole.toolResult.example.beats,90);assert(whole.toolResult.example.events.some(e=>e.type==='noteOn'&&e.time===89));assert(whole.toolResult.example.events.some(e=>e.type==='sustain'&&e.value&&e.time===89));
console.log('✓ Une session entière de 90 secondes conserve sa fin et sa pédale');
