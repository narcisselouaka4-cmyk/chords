import assert from 'node:assert/strict';
import fs from 'node:fs';
import {buildDegreeAccompaniment,melodyBeatMap} from './melody-progression.js';
import {notePairs,applyTakeEdit} from './take-edit.js';
import {handDistribution,voicedQuality} from './piano-voicing.js';
import {resolvingVoices} from './harmonic-intentions.js';
import {sendCopilotMessage} from './copilot-client.js';
import {proposalChordGrid,activeChordColumn} from './proposal-chord-grid.js';
const source={...JSON.parse(fs.readFileSync(new URL('./fixtures/copilot-session010.json',import.meta.url))),key:''};
const prefix='Fais-moi entendre ma mélodie harmonisée sur 4-5-3-6. Arrivées : 4 sur Fa, 5 sur Si, 3 sur Mi, 6 sur Do. Variante 4-5-6 : 6 sur Mi aigu.';
const ending='Finale : 4 sur La ; 5 sur Ré ; 1 sur Do après Do-Si-Do en contretemps.';
const message=prefix+' '+ending+' Avec quelques accords de passage et une appoggiature intérieure. Toucher doux.';
const expected=[[.994,4],[2.669,5],[4.786,3],[7.084,6],[9.25,4],[11.37,5],[13.445,3],[15.522,6],[17.632,4],[19.701,5],[21.733,6],[25.686,4],[27.696,5],[29.4975,1]];
function check(take,v,rate=1){
 assert(v);const snapshot=JSON.stringify(take),changed=applyTakeEdit(take,v.advice.edit);assert(changed);
 assert.deepEqual(v.arrivals.map(a=>a.degree),expected.map(([,d])=>d));
 for(const [i,[t]] of expected.entries())assert(Math.abs(v.arrivals[i].at-t*rate)<.000001);
 const pairs=notePairs(take.events),actual=notePairs(changed.events),added=v.advice.edit.notes;
 for(const p of pairs)assert(actual.some(q=>q.event.note===p.event.note&&q.event.time===p.event.time&&q.end===p.end));
 for(const n of added)assert(actual.some(p=>p.event.note===n.note&&p.event.time===n.time&&p.end===n.end));
 const tonic=v.harmony.at(-1);assert(tonic.offbeat);assert.equal(tonic.degree,1);
 assert(Math.abs(tonic.melodyAt-29.254*rate)<.00001);assert(tonic.at>tonic.melodyAt);
 const map=melodyBeatMap(pairs.sort((a,b)=>a.event.time-b.event.time));assert.equal(tonic.at,map.at(tonic.beat));
 assert(!added.some(n=>n.time>=tonic.melodyAt&&n.time<tonic.at));
 const passing=v.harmony.filter(h=>h.kind==='dominant');assert(passing.length>=2&&passing.length<=4);
 assert(passing.some(h=>h.quality==='13'));assert(passing.some(h=>h.quality==='7b9b13'));
 for(const [i,h]of v.harmony.entries()){
  assert.equal(voicedQuality(h.notes,h.rootPc,h.quality),h.quality);
  assert(h.notes.length<=(h.kind==='dominant'?6:4));assert.equal(h.end,v.harmony[i+1]?.at??take.duration);
  const onsets=added.filter(n=>n.time>=h.at&&n.time<=h.at+.015);assert(onsets.some(n=>n.time===h.at&&n.note===h.notes[0]),'Basse sur le repère, jamais retardée');
  if(h.kind==='dominant'){const to=v.harmony[i+1];assert.equal(h.targetAt,to.at);assert(resolvingVoices(h,to));}
 }
 assert.equal(v.ornaments.length,1);
 const ornament=v.ornaments[0];assert.equal(Math.abs(ornament.note-ornament.target),1);
 assert(added.some(n=>n.note===ornament.note&&n.time===ornament.at&&n.end===ornament.resolveAt));
 assert(added.some(n=>n.note===ornament.target&&n.time===ornament.resolveAt));
 assert(v.advice.edit.pedal.some(e=>e.value===0&&Math.abs(e.time-ornament.end)<.000001));
 assert(added.every(n=>n.velocity>=.25&&n.velocity<=.58),'Accompagnement doux mais pas effacé');
 for(const t of new Set(changed.events.map(e=>e.time+.000001))){
  const active=actual.filter(p=>p.event.time<=t&&p.end>t);assert(!active.length||handDistribution(active.map(p=>p.event.note)));
  const melody=pairs.filter(p=>p.event.time<=t&&p.end>t);
  if(melody.length)assert(added.filter(n=>n.time<=t&&n.end>t).every(n=>n.note<Math.max(...melody.map(p=>p.event.note))));
 }
 assert.equal(JSON.stringify(take),snapshot);return v;
}
const v=check(source,buildDegreeAccompaniment(source,{message}));
for(const rate of [.85,1.15]){
 const take={...source,duration:source.duration*rate,events:source.events.map(e=>({...e,time:e.time*rate}))};check(take,buildDegreeAccompaniment(take,{message}),rate);
}
for(const [shift,key,notes]of [[2,'Ré majeur',['Sol','Do♯','Fa♯','Ré','Si','Mi']],[5,'Fa majeur',['Si♭','Mi','La','Fa','Ré','Sol']],[7,'Sol majeur',['Do','Fa♯','Si','Sol','Mi','La']]]){
 const [a,b,c,d,e,f]=notes,take={...source,events:source.events.map(ev=>({...ev,...(ev.note!=null?{note:ev.note+shift}:{})}))};
 const q=`Harmonise sur 4-5-3-6 en ${key}. Arrivées : 4 sur ${a}, 5 sur ${b}, 3 sur ${c}, 6 sur ${d}. Variante 4-5-6 : 6 sur ${c} aigu. Finale : 4 sur ${e} ; 5 sur ${f} ; 1 sur ${d} après ${d}-${b}-${d} en contretemps. Avec quelques accords de passage et une appoggiature intérieure.`;
 check(take,buildDegreeAccompaniment(take,{message:q}));
}
assert(v.advice.edit.pedal.some(e=>e.value===0&&Math.abs(e.time-33.557)<.000001),'Nettoyer la dernière note mélodique étrangère sans lâcher les voix tenues');
const dry=buildDegreeAccompaniment(source,{message:message+' Sans pédale.'});assert(dry);assert(!dry.advice.edit.pedal.length);
const held=buildDegreeAccompaniment(source,{message:message+' Sans accords de passage. Sans appoggiatures.'});assert(held);assert.equal(held.harmony.length,14);assert(!held.ornaments.length);
let calls=0;const old=globalThis.fetch;globalThis.fetch=async()=>{calls++;throw Error('Pas de fournisseur');};
try{
 const r=await sendCopilotMessage({message,context:{type:'session',playing:{session:source}}});check(source,r.toolResult.variants[0]);
 const grid=proposalChordGrid(r.toolResult),at=v.harmony.at(-1).at;
 const nameAt=t=>grid.columns[activeChordColumn(grid,1,t,source.duration)].cells[1].name;
 assert.match(nameAt(at-.01),/^G7/);assert.match(nameAt(at+.01),/^C6/);
 const before=await sendCopilotMessage({message:prefix+' Sans passages ni grace notes.',context:{type:'session',playing:{session:source}}});
 const history=[{role:'user',content:prefix,take:source},{role:'assistant',...before}];
 const follow=await sendCopilotMessage({message:'Fais-moi entendre ces voicings. '+ending+' Avec quelques accords de passage et une appoggiature intérieure. Toucher doux.',messages:history,context:{type:'autonomous'}});
 check(source,follow.toolResult.variants[0]);assert.equal(calls,0);
}finally{globalThis.fetch=old;}
console.log('✓ Finale IV/V/I en contretemps sur le vrai motif, quatre préparations fonctionnelles dont 13 et 7b9b13, appoggiature résolue, toucher nuancé, mélodie et tenues intactes, transpositions/tempos, parcours normal et consignes héritées sans réseau.');
