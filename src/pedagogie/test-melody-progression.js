import assert from 'node:assert/strict';
import fs from 'node:fs';
import {buildDegreeAccompaniment,melodyBeatMap,requestedDegreeProgression} from './melody-progression.js';
import {notePairs,applyTakeEdit} from './take-edit.js';
import {handDistribution,voicedQuality} from './piano-voicing.js';
import {resolvingVoices} from './harmonic-intentions.js';
import {sendCopilotMessage} from './copilot-client.js';
import {proposalChordGrid,activeChordColumn} from './proposal-chord-grid.js';
const original=JSON.parse(fs.readFileSync(new URL('./fixtures/copilot-session010.json',import.meta.url)));
// La vraie session n'a pas de tonalité renseignée : pas d'aide cachée de la fixture.
const source={...original,key:''},snapshot=JSON.stringify(source);
const message='Fais-moi entendre ma mélodie harmonisée sur la progression 4-5-3-6, avec des accords de passage et des appoggiatures.';
assert.deepEqual(requestedDegreeProgression('4–5–3–6'),{degrees:[4,5,3,6],valid:true});
assert.equal(requestedDegreeProgression('2-9-1').valid,false);
assert.equal(requestedDegreeProgression('Enrichis mon jeu'),null);
assert.equal(requestedDegreeProgression('À 4-5 secondes c’est trop fort'),null);
assert.equal(requestedDegreeProgression('À 10-11 secondes'),null);
const pc=n=>(n%12+12)%12;
function check(take,variant,shift=0){
 assert(variant);const changed=applyTakeEdit(take,variant.advice.edit);assert(changed);
 const pairs=notePairs(take.events),added=variant.advice.edit.notes;
 assert.equal(variant.advice.edit.remove.length,0);assert.equal(variant.advice.edit.keep.length,pairs.length);
 for(const e of take.events)assert(changed.events.some(x=>JSON.stringify(x)===JSON.stringify(e)));
 const main=variant.harmony.filter(h=>h.kind==='accompaniment');assert.equal(main.length,16);
 assert.deepEqual(main.map(h=>h.rootPc),Array.from({length:16},(_,i)=>pc([5,7,4,9][i%4]+shift)));
 const map=melodyBeatMap(pairs.sort((a,b)=>a.event.time-b.event.time));assert(map);
 for(const h of variant.harmony){
  assert(Math.abs(h.at-map.at(h.beat))<.00001,'Accord sur un temps de la mélodie, pas une seconde arbitraire');
  assert.equal(voicedQuality(h.notes,h.rootPc,h.quality),h.quality);
  if(h.kind==='dominant'){
   const target=variant.harmony.find(s=>s.at===h.targetAt);assert(target&&resolvingVoices(h,target));
   assert(h.end<target.at);assert.equal(pc(h.rootPc-target.rootPc),7);
  }
 }
 for(const t of new Set(changed.events.map(e=>e.time+.000001))){
  const active=notePairs(changed.events).filter(p=>p.event.time<=t&&p.end>t);
  assert(!active.length||handDistribution(active.map(p=>p.event.note)),'Mains réellement jouables lors des chevauchements');
  const line=pairs.filter(p=>p.event.time<=t&&p.end>t);
  if(line.length){const top=Math.max(...line.map(p=>p.event.note));assert(added.filter(p=>p.time<=t&&p.end>t).every(p=>p.note<top));}
 }
 for(const o of variant.ornaments){
  assert.equal(Math.abs(o.target-o.note),1);
  assert(added.some(n=>n.note===o.note&&n.time===o.at&&n.end===o.resolveAt));
  assert(added.some(n=>n.note===o.target&&n.time===o.resolveAt));
  if(variant.advice.edit.pedal.length)assert(variant.advice.edit.pedal.some(e=>e.value===0&&Math.abs(e.time-o.end)<.00001));
 }
 assert.deepEqual(applyTakeEdit(take,JSON.parse(JSON.stringify(variant.advice.edit))),changed);
 return variant;
}
const variant=check(source,buildDegreeAccompaniment(source,{message}));
assert.equal(variant.harmony.filter(h=>h.kind==='dominant').length,4);
assert.equal(variant.ornaments.length,2);
const map=melodyBeatMap(notePairs(source.events).sort((a,b)=>a.event.time-b.event.time));
assert(map.points.some(p=>p.beat===21&&Math.abs(p.time-12.411)<.0001),'Le petit Si à 12,398 ne déplace pas l’appui réel du Sol');
for(const [shift,key] of [[2,'Ré majeur'],[5,'Fa majeur'],[7,'Sol majeur']]){
 const moved={...source,events:source.events.map(e=>({...e,...(e.note!=null?{note:e.note+shift}:{})}))};
 check(moved,buildDegreeAccompaniment(moved,{message:message+' en '+key}),shift);
}
for(const rate of [.85,1.15]){
 const stretched={...source,duration:source.duration*rate,events:source.events.map(e=>({...e,time:e.time*rate}))};
 const v=check(stretched,buildDegreeAccompaniment(stretched,{message}));
 assert(Math.abs(v.harmony[0].at-variant.harmony[0].at*rate)<.0001);
}
const fixed=check(source,buildDegreeAccompaniment(source,{message:'Harmonise sur 4-5-3-6 sans accords de passage'}));
assert.equal(fixed.harmony.length,16);assert.equal(fixed.ornaments.length,0);
const dry=buildDegreeAccompaniment(source,{message:message+' sans pédale'});assert(dry);assert.equal(dry.advice.edit.pedal.length,0);
const noOrnaments=buildDegreeAccompaniment(source,{message:message+' sans appoggiatures'});assert(noOrnaments);assert.equal(noOrnaments.ornaments.length,0);
assert.equal(buildDegreeAccompaniment(source,{message:'Harmonise sur 2-9-1'}),null);

let calls=0;const oldFetch=globalThis.fetch;globalThis.fetch=async()=>{calls++;throw Error('Aucune inférence externe');};
try{
 const generic=await sendCopilotMessage({message:'Fais-moi entendre un accompagnement sous ma mélodie.',context:{type:'session',playing:{session:source}}});
 const response=await sendCopilotMessage({message,messages:[{role:'assistant',...generic}],context:{type:'session',playing:{session:source}}});
 assert.equal(response.toolResult.variants[0].id,'melody-progression','Une nouvelle progression ne rejoue pas l’ancienne réponse');
 check(source,response.toolResult.variants[0]);
 const history=[{role:'user',content:message,take:source},{role:'assistant',...response}];
 const next=await sendCopilotMessage({message:'Enrichis ma mélodie sans accords de passage',messages:history,context:{type:'autonomous'}});
 assert.deepEqual(next.toolResult.variants[0].progression.degrees,[4,5,3,6],'La progression reste en mémoire au tour suivant');
 assert(next.toolResult.variants[0].harmony.every(h=>h.kind==='accompaniment'));
 const heard=await sendCopilotMessage({message:'Fais-moi entendre la version sans accords de passage.',messages:history,context:{type:'autonomous'}});
 assert(heard.toolResult.variants[0].harmony.every(h=>h.kind==='accompaniment'),'Une nouvelle consigne d’écoute n’est pas ignorée par le cache');
 const grid=proposalChordGrid(response.toolResult);assert(grid.columns.length>=16);
 assert(activeChordColumn(grid,1,variant.harmony[1].at+.01,source.duration)>=0);
 assert.equal(calls,0);
}finally{globalThis.fetch=oldFetch;}
assert.equal(JSON.stringify(source),snapshot);
console.log('✓ Mélodie seule : 4–5–3–6 calculé, 57 notes exactes, temps adaptatifs, quatre dominantes résolues, deux appoggiatures, positions et pédale vérifiées, transpositions/tempos, grille et mémoire du parcours normal sans fournisseur.');
