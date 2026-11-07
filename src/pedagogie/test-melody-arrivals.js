import assert from 'node:assert/strict';
import fs from 'node:fs';
import {buildDegreeAccompaniment,requestedDegreeProgression} from './melody-progression.js';
import {notePairs,applyTakeEdit} from './take-edit.js';
import {handDistribution,voicedQuality} from './piano-voicing.js';
import {chordToneIntervals} from '../practice-exercise.js';
import {sendCopilotMessage} from './copilot-client.js';
import {requestedPersonalStyle} from './style-capabilities.js';
import {proposalChordGrid,activeChordColumn} from './proposal-chord-grid.js';
const source={...JSON.parse(fs.readFileSync(new URL('./fixtures/copilot-session010.json',import.meta.url))),key:''};
const snapshot=JSON.stringify(source),pc=n=>(n%12+12)%12;
const base='Fais-moi entendre ma mélodie harmonisée sur 4-5-3-6 en accord-mélodie.';
const message=base+' Arrivées : 4 sur Fa, 5 sur Si, 3 sur Mi, 6 sur Do. Variante 4-5-6 : 6 sur Mi aigu. Uniquement les notes principales, puis le premier La. Maintiens les voicings jusqu’à la suivante. Sans passages ni grace notes.';
const expected=[[.994,4,65],[2.669,5,71],[4.786,3,64],[7.084,6,72],[9.25,4,65],[11.370,5,71],[13.445,3,64],[15.522,6,72],[17.632,4,65],[19.701,5,71],[21.733,6,76],[25.686,6,69]];
const addedOnsets=v=>[...new Set(v.advice.edit.notes.map(n=>n.time))];
function check(take,v,{rate=1,shift=0}={}){
 assert(v,'Une proposition existe sans référence ni fournisseur');
 const changed=applyTakeEdit(take,v.advice.edit);assert(changed);
 assert.equal(v.rhythm.placement,'melody-arrivals');assert.equal(v.rhythm.accompaniment,'held');
 assert.equal(v.harmony.length,12);assert(v.harmony.every(h=>h.kind==='arrival'));assert.equal(v.ornaments.length,0);
 assert(addedOnsets(v).every(t=>v.arrivals.some(a=>a.at===t)),'Aucune attaque ajoutée sur les notes intermédiaires');
 assert.deepEqual(v.arrivals.map(a=>[+a.at.toFixed(5),a.degree,a.melody]),expected.map(([t,d,n])=>[+(t*rate).toFixed(5),d,n+shift]));
 const pairs=notePairs(take.events),edit=v.advice.edit,added=edit.notes;
 assert.equal(edit.remove.length,0);assert.equal(edit.keep.length,pairs.length);
 for(const e of take.events)assert(changed.events.some(x=>JSON.stringify(x)===JSON.stringify(e)),'Chaque événement source est intact');
 for(const h of v.harmony){
  const melody=pairs.find(p=>p.on===h.sourceOn);assert.equal(h.at,melody.event.time);
  assert.equal(h.notes.at(-1),melody.event.note);assert(h.notes.length>=3&&h.notes.length<=4);
  const attacks=added.filter(n=>n.time===h.at);assert(attacks.length>=1&&attacks.length<=3);
  assert(attacks.every(n=>n.note<h.topMidi&&h.notes.includes(n.note)));
  assert.equal(voicedQuality(h.notes,h.rootPc,h.quality),h.quality);
  if(h.kind==='arrival')assert.equal(pc(h.notes[0]),h.rootPc);
  if(h.technique==='drop2'){
   const tones=chordToneIntervals(h.quality);assert.equal(tones.size,4);
   const close=[...tones].map(t=>{let n=h.topMidi;while(pc(n-h.rootPc)!==t)n--;return n;}).sort((a,b)=>a-b);
   assert.deepEqual(h.notes,[close[0],close[1],close[2]-12,close[3]].sort((a,b)=>a-b));
  }

 }
 for(const [i,h] of v.harmony.entries()){
  const end=v.harmony[i+1]?.at??take.duration;assert.equal(h.end,end);
  const held=added.filter(n=>n.time===h.at);assert(held.every(n=>n.end===end),'Les voix restent tenues jusqu’au prochain voicing');
 }
 assert(!added.some(n=>Math.abs(n.time-33.529*rate)<.00001),'Pas de réattaque tardive du La final');
 const changedPairs=notePairs(changed.events);
 for(const p of pairs)assert(changedPairs.some(q=>q.event.note===p.event.note&&q.event.time===p.event.time&&q.end===p.end),'Le relais de la même touche ne coupe pas une note source');
 for(const n of added)assert(changedPairs.some(q=>q.event.note===n.note&&q.event.time===n.time&&q.end===n.end),'Chaque tenue existe dans le flux MIDI réellement ordonné');
 for(const t of new Set(changed.events.map(e=>e.time+.000001))){
  const active=changedPairs.filter(p=>p.event.time<=t&&p.end>t);assert(!active.length||handDistribution(active.map(p=>p.event.note)));
  const line=pairs.filter(p=>p.event.time<=t&&p.end>t);
  if(line.length)assert(added.filter(p=>p.time<=t&&p.end>t).every(n=>n.note<Math.max(...line.map(p=>p.event.note))));
 }
 assert(!v.harmony.some(h=>Math.abs(h.at-21.269*rate)<.00001),'Le Sol avant le Mi aigu reste mélodique');
 assert(!v.harmony.some(h=>Math.abs(h.at-12.411*rate)<.00001),'Pas de nouvel accord sur le Sol intermédiaire');
 let down=false;for(const e of edit.pedal){assert.notEqual(down,e.value===127);down=e.value===127;}assert(!down);
 assert.deepEqual(applyTakeEdit(take,JSON.parse(JSON.stringify(edit))),changed);
 return v;
}
assert.equal(requestedDegreeProgression('Variante 4-5-6 : 6 sur Mi aigu.'),null,'Une variante seule ne remplace pas la progression principale');
const relay={duration:2,events:[{type:'note_on',note:60,time:0,velocity:.6},{type:'note_off',note:60,time:1},{type:'note_on',note:64,time:1,velocity:.7},{type:'note_off',note:64,time:2}]};
const relayed=applyTakeEdit(relay,{type:'arrangement',keep:[0,2],remove:[],notes:[{note:64,time:0,end:1,velocity:.5}]});assert(relayed);
assert(notePairs(relayed.events).some(p=>p.event.note===64&&p.event.time===1&&p.end===2),'Note_off avant note_on pour le relais exact de la même touche');
const variant=check(source,buildDegreeAccompaniment(source,{message}));
assert.equal(requestedPersonalStyle(message),null,'Accord-mélodie est une technique, pas un genre indisponible');
const simple=buildDegreeAccompaniment(source,{message:base});assert(simple);
assert.deepEqual(simple.arrivals.slice(0,4).map(a=>a.at),expected.slice(0,4).map(a=>a[0]),'Pas de mesure de quatre temps imposée par défaut');
for(const [shift,key,notes] of [[2,'Ré majeur',['Sol','Do♯','Fa♯','Ré','Fa♯']],[5,'Fa majeur',['Si♭','Mi','La','Fa','La']],[7,'Sol majeur',['Do','Fa♯','Si','Sol','Si']]]){
 const moved={...source,events:source.events.map(e=>({...e,...(e.note!=null?{note:e.note+shift}:{})}))};
 const [a,b,c,d,e]=notes;
 const request=base+` en ${key}. Arrivées : 4 sur ${a}, 5 sur ${b}, 3 sur ${c}, 6 sur ${d}. Variante 4-5-6 : 6 sur ${e} aigu. Drop 2.`;
 check(moved,buildDegreeAccompaniment(moved,{message:request}),{shift});
}
for(const rate of [.85,1.15]){
 const stretched={...source,duration:source.duration*rate,events:source.events.map(e=>({...e,time:e.time*rate}))};
 check(stretched,buildDegreeAccompaniment(stretched,{message}),{rate});
}
const fixed=buildDegreeAccompaniment(source,{message:message+' Sans accords de passage.'});assert(fixed);assert.equal(fixed.harmony.length,12);assert(fixed.harmony.every(h=>h.kind==='arrival'));
const dry=buildDegreeAccompaniment(source,{message:message+' Sans pédale.'});assert(dry);assert.equal(dry.advice.edit.pedal.length,0);
let calls=0;const oldFetch=globalThis.fetch;globalThis.fetch=async()=>{calls++;throw Error('Pas d’inférence payante');};
try{
 const response=await sendCopilotMessage({message,context:{type:'session',playing:{session:source}}});assert(response.ok);check(source,response.toolResult.variants[0]);
 const history=[{role:'user',content:message,take:source},{role:'assistant',...response}];
 const next=await sendCopilotMessage({message:'Fais-moi entendre la version sans accords de passage.',messages:history,context:{type:'autonomous'}});
 assert.equal(next.toolResult.variants[0].harmony.length,12);assert.equal(next.toolResult.variants[0].arrivals[10].degree,6,'La variante et les repères restent en mémoire');
 const updated=await sendCopilotMessage({message:'Fais-moi entendre la variante 4-5-6 : 6 sur Mi aigu.',messages:history,context:{type:'autonomous'}});
 assert.deepEqual(updated.toolResult.variants[0].progression.degrees,[4,5,3,6]);assert.equal(updated.toolResult.variants[0].arrivals[10].degree,6);
 const grid=proposalChordGrid(response.toolResult);assert(grid.columns.length>=12);
 assert(activeChordColumn(grid,1,variant.arrivals[1].at+.01,source.duration)>=0);
 assert.equal(calls,0);
}finally{globalThis.fetch=oldFetch;}
assert.equal(JSON.stringify(source),snapshot);
console.log('✓ 12 notes principales, premier La après Mi aigu, voicings tenus sans attaque intermédiaire, 57 notes source intactes, mains/hauteurs/pédale, transpositions/tempos, parcours normal et mémoire sans fournisseur.');
