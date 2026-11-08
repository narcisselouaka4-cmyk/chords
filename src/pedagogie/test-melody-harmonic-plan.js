import assert from 'node:assert/strict';
import fs from 'node:fs';
import {melodyHarmonicPlans,accompanimentPlanCost} from './melody-harmonic-plan.js';
import {sendCopilotMessage} from './copilot-client.js';
import {notePairs,applyTakeEdit} from './take-edit.js';
import {handDistribution,voicedQuality} from './piano-voicing.js';
import {buildConversationMemory} from './copilot-memory.js';
import {buildDegreeAccompaniment} from './melody-progression.js';
const make=(notes,key='Do majeur')=>({name:'Mélodie sans référence',key,duration:notes.length*.5,
 events:notes.flatMap((note,i)=>[{type:'note_on',note,time:i*.5,velocity:.65},{type:'note_off',note,time:i*.5+.46}])});
const major=make([60,64,67,71,62,65,69,72,59,62,65,67,60,64,67,72]);
const minor=make([69,72,76,79,62,65,69,72,64,67,71,74,69,72,76,81],'La mineur');
const original=JSON.stringify([major,minor]);
function inspect(plans,take){
 assert(plans.length);assert(plans.length<=12);
 for(const p of plans){
  assert(p.arrivals.length>=3&&p.arrivals.length<=take.events.length/4,'Ne pas plaquer un accord sur chaque note');
  assert.equal(p.arrivals[0].at,0);assert.equal(p.analysis.method,'melody-phrase-search-v1');
  for(const [i,a]of p.arrivals.entries()){
   const e=take.events[a.sourceOn];assert.equal(e.type,'note_on');assert.equal(e.note,a.melody);assert.equal(e.time,a.at);
   if(i){assert(a.at>p.arrivals[i-1].at);assert.notEqual(a.degree,p.arrivals[i-1].degree);}
  }
 }
}
const base=melodyHarmonicPlans(major,{key:{rootPc:0,minor:false},profile:'ccm'});inspect(base,major);
assert.deepEqual(melodyHarmonicPlans({...major,name:'Inédit',id:'autre-identifiant'},{key:{rootPc:0,minor:false},profile:'ccm'}),base,'Aucune sélection par nom ou identifiant de session');
inspect(melodyHarmonicPlans(minor,{key:{rootPc:9,minor:true}}),minor);
assert(![[4,5,3,6],[1,5,6,4],[2,5,1],[1,4,5,1]].some(ds=>base[0].arrivals.every((a,i)=>a.degree===ds[i%ds.length])),'Le résultat ne dépend pas des quatre anciennes boucles');
for(const shift of [1,3,7]){
 const take={...major,events:major.events.map(e=>({...e,note:e.note+shift}))};
 const plans=melodyHarmonicPlans(take,{key:{rootPc:shift,minor:false},profile:'ccm'});inspect(plans,take);
 assert.deepEqual(plans[0].arrivals.map(a=>[a.at,a.degree]),base[0].arrivals.map(a=>[a.at,a.degree]));
}
for(const factor of [.8,1.2]){
 const take={...major,duration:major.duration*factor,events:major.events.map(e=>({...e,time:e.time*factor}))};
 inspect(melodyHarmonicPlans(take,{key:{rootPc:0,minor:false}}),take);
}
const different=melodyHarmonicPlans(major,{key:{rootPc:0,minor:false},exclude:[base[0].degrees.join('-')]});
assert(different.length);assert.notDeepEqual(different[0].degrees,base[0].degrees);
assert.deepEqual(melodyHarmonicPlans(make(Array.from({length:24},(_,i)=>60+i%12)),{key:{rootPc:0,minor:false}}),[]);
assert.deepEqual(melodyHarmonicPlans(major),[]);
assert.deepEqual(melodyHarmonicPlans(make([60,62,64]),{key:{rootPc:0,minor:false}}),[]);
// Un frottement long produit un coût supérieur à une disposition consonante.
const mock=notes=>({harmony:[{at:0,end:.46,notes,topMidi:60}]});
assert(accompanimentPlanCost(mock([47,59,60]),major)>accompanimentPlanCost(mock([48,52,60]),major));
// Régression sur un vrai passage : écouter toutes les notes à venir permet de
// choisir une autre position du même accord et d'éviter un frottement tenu.
const recorded=JSON.parse(fs.readFileSync(new URL('./fixtures/copilot-session010.json',import.meta.url)));
const clashTime=v=>v.harmony.reduce((sum,h)=>sum+notePairs(recorded.events).reduce((s,p)=>s+
 h.notes.filter(n=>n!==h.topMidi&&[1,13].includes(p.event.note-n)).length*
 Math.max(0,Math.min(h.end,p.end)-Math.max(h.at,p.event.time)),0),0);
let repaired=0;
for(const p of melodyHarmonicPlans(recorded,{key:{rootPc:0,minor:false},profile:'ccm',limit:6})){
 const stamp=t=>`${Math.floor(t/60)}:${(t%60).toFixed(6).replace('.',',')}`;
 const message=`Harmonise sur ${p.degrees.join('-')} en Do majeur en couleurs CCM. Appuis validés : ${p.arrivals.map(a=>`${a.degree} à ${stamp(a.at)}`).join(' ; ')}. Sans accords de passage.`;
 const before=buildDegreeAccompaniment(recorded,{message}),after=buildDegreeAccompaniment(recorded,{message:message+' Évite les frottements avec les notes tenues de toute la phrase.'});
 if(!before||!after)continue;
 assert(clashTime(after)<=clashTime(before)+1e-9);
 if(clashTime(after)<clashTime(before)-.1)repaired++;
}
assert(repaired>0,'Au moins une vraie position évite davantage de frottements, sans modifier la mélodie');
let calls=0;const saved=globalThis.fetch;globalThis.fetch=async()=>{calls++;throw Error('Pas de modèle réseau');};
try{
 for(const take of [major,minor]){
  const messages=[];let response;
  for(const message of ['Harmonise ma mélodie en couleurs CCM. Je ne joue que des notes.','Je ne connais pas la progression, propose un parcours.','Ces appuis me conviennent, fais-moi entendre cette harmonisation.']){
   response=await sendCopilotMessage({message,messages,context:messages.length?{type:'autonomous'}:{type:'session',playing:{session:take}}});
   assert(response.ok);messages.push({role:'user',content:message,...(messages.length?{}:{take})},{role:'assistant',...response});
  }
  const r=response.toolResult,v=r.variants?.[0];assert(v,JSON.stringify(response));
  assert.equal(r.harmonyBrief.planning.method,'melody-phrase-search-v1');
  assert.equal(buildConversationMemory(messages,{take}).harmonyBrief.planning.method,'melody-phrase-search-v1');
  const changed=applyTakeEdit(take,v.advice.edit);assert(changed);
  for(const p of notePairs(take.events))assert(notePairs(changed.events).some(q=>q.event.note===p.event.note&&q.event.time===p.event.time&&q.end===p.end));
  for(const h of v.harmony){assert.equal(voicedQuality(h.notes,h.rootPc,h.quality),h.quality);assert(handDistribution(h.notes));assert(h.notes.at(-1)===h.topMidi);}
  assert.deepEqual(v.arrivals.map(a=>[a.at,a.degree]),r.harmonyBrief.arrivals.map(a=>[a.at,a.degree]));
 }
 assert.equal(calls,0);assert.equal(JSON.stringify([major,minor]),original);
 console.log('✓ Plan par phrase sans grille donnée : majeur/mineur, transpositions, rythmes, changements espacés, rejet chromatique, alternative, coûts des frottements, client et mémoire sans fournisseur, source/sommet/mains préservés.');
}finally{globalThis.fetch=saved;}
