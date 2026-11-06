import assert from 'node:assert/strict';
import fs from 'node:fs';
import {handDistribution,voicedQuality} from './piano-voicing.js';
import {buildFixedHarmonyVariants} from './fixed-harmony.js';
import {phrasePedal,applyProposalPedal} from './proposal-pedal.js';
import {buildPhraseArrangement} from './phrase-arrangement.js';
import {applyTakeEdit,notePairs} from './take-edit.js';
assert.equal(handDistribution([46,61,65,68,70,72,73]),null,'Une basse isolée ne permet pas six notes dans la main droite');
assert(handDistribution([58,61,65,68,70,72,73]));
assert.equal(voicedQuality([46,61,65,68,70,73],10,'m11'),'m7','Pas de 11e ni de 9e fictive');
assert.equal(voicedQuality([58,60,61,65,68],10,'m9'),'m9');
assert.equal(voicedQuality([53,60,63,68],5,'m11'),'m7');
const segments=[{at:0,end:1,notes:[48,52,55]},{at:3,end:4,notes:[50,53,57]}];
const ornament={event:{time:.2,note:54},end:.3};
const pedal=phrasePedal(segments,[ornament],5);
assert(pedal.some(e=>e.time===.3&&e.value===0),'Lever après la petite note étrangère');
assert.equal(pedal.filter(e=>e.time<3).at(-1).time,1.015,'Ne pas tenir la pédale jusqu’à 3 s à travers le silence');
assert.equal(pedal.at(-1).value,0);
assert.equal(applyProposalPedal([],{replacePedal:true,pedal:[{time:0,value:127}]},5),null);
const simple={duration:6,events:[[48,55,60,64],[50,57,60,65],[52,59,62,67]].flatMap((ns,i)=>ns.flatMap(note=>[{type:'note_on',note,time:i*2,velocity:.6},{type:'note_off',note,time:i*2+1.2}])).sort((a,b)=>a.time-b.time)};
const fixed=buildFixedHarmonyVariants(simple,{message:'En do majeur, enrichis mes accords'});assert(fixed.length);
for(const v of fixed){assert(v.advice.edit.replacePedal);const changed=applyTakeEdit(simple,v.advice.edit);assert(changed);assert(changed.events.some(e=>e.controller===64));
 assert(changed.events.filter(e=>e.controller===64&&e.time<2).at(-1).time<=1.2151);}

for(const id of ['016','017']){
 const take=JSON.parse(fs.readFileSync(new URL(`./fixtures/copilot-session${id}.json`,import.meta.url)));
 const before=JSON.stringify(take),v=buildPhraseArrangement(take);assert(v);
 const changed=applyTakeEdit(take,v.advice.edit);assert(changed);
 const pairs=notePairs(changed.events);
 // Toutes les attaques et tous les relâchements, pas uniquement les accords de la grille.
 for(const at of new Set(pairs.flatMap(p=>[p.event.time+.0001,p.end+.0001]))){
   const sounding=pairs.filter(p=>p.event.time<=at&&p.end>at).map(p=>p.event.note);
   assert(!sounding.length||handDistribution(sounding),`${id} à ${at} : ${sounding}`);
 }
 for(const h of v.harmony.filter(h=>h.kind==='enrich')){
   const quality=h.chord.replace(/^(?:Do|Ré♭|Ré|Mi♭|Mi|Fa♯|Fa|Sol|La♭|La|Si♭|Si)\s+/,'').replace(/mineur\s*/,'m').replace(/majeur\s*/,'maj');
   const root=(h.notes[0]%12+12)%12;
   assert.equal(voicedQuality([...h.notes,h.topMidi],root,quality),quality,`${id} : ${h.chord}`);
 }
 for(const s of v.harmony){
   const controls=changed.events.filter(e=>e.controller===64&&e.time<=s.end+.016);
   assert(controls.at(-1)?.value!==127,`${id} : pédale prolongée après ${s.end}`);
 }
 if(id==='016'){
   assert.equal(v.harmony[0].notes[0],58,'Si♭3 au lieu du Si♭2 isolé');
   assert.equal(v.harmony.find(h=>h.source==='Fm'&&h.kind==='enrich').notes[0],53,'Fa3 au lieu du Fa2 isolé');
 }
 const sourcePedal={...take,events:[{type:'control',controller:64,time:0,value:127},...take.events,{type:'control',controller:64,time:take.duration,value:0}]};
 const adjusted=buildPhraseArrangement(sourcePedal);assert(adjusted);
 const cleaned=applyTakeEdit(sourcePedal,adjusted.advice.edit);assert(cleaned);
 assert(!cleaned.events.some(e=>e.controller===64&&e.time===0&&e.value===127));
 const dry=buildPhraseArrangement(sourcePedal,{message:'sans pédale'});assert(dry);
 assert(!applyTakeEdit(sourcePedal,dry.advice.edit).events.some(e=>e.controller===64));
 assert.equal(JSON.stringify(take),before);
}
console.log('✓ Positions répartissables entre deux mains, Si♭3/Fa3, extensions réellement présentes ; pédale nettoyée aux fins de segments, appoggiatures et silences, prise originale intacte.');
