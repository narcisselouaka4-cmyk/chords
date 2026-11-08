import assert from 'node:assert/strict';
import fs from 'node:fs';
import {sendCopilotMessage} from './copilot-client.js';
import {applyTakeEdit,notePairs} from './take-edit.js';
import {buildConversationMemory} from './copilot-memory.js';
import {buildDegreeAccompaniment} from './melody-progression.js';
import {melodyHarmonicPlans} from './melody-harmonic-plan.js';
import {handDistribution,voicedQuality} from './piano-voicing.js';
import {resolvingVoices} from './harmonic-intentions.js';
const fixture=JSON.parse(fs.readFileSync(new URL('./fixtures/copilot-test4-plan-before-revision.json',import.meta.url)));
const take=JSON.parse(fs.readFileSync(new URL('./fixtures/copilot-session010.json',import.meta.url)));
const saved=JSON.stringify([fixture,take]),pc=n=>(n%12+12)%12;
const correction='Conserve les voicings avant 0:21 ; La mineur à 0:21,7 avec la fondamentale à la basse ; Fa maj7 à 0:25,7 ; Sol add9 à 0:27,7 ; Do sus2 à 0:29,3 ; Retire l’appui à 0:31,5';
const historyFor=(source,brief=fixture.brief,harmony=fixture.harmony)=>[
 {role:'user',content:'Harmonise ma mélodie en couleurs CCM.',take:source},
 {role:'assistant',content:'Proposition précédente',toolResult:{originalTake:source,harmonyBrief:brief,harmonicRequest:fixture.request,variants:[{harmony}]}}];
const savedFetch=globalThis.fetch;let calls=0;globalThis.fetch=async()=>{calls++;throw Error('Aucun modèle autorisé');};
try{
 const history=historyFor(take);
 let r=await sendCopilotMessage({message:correction,messages:history,context:{type:'autonomous'}});
 assert.equal(r.toolResult.harmonyBrief.status,'pending');assert(!r.toolResult.variants);
 assert.match(r.content,/appuis corrigés/);assert.match(r.content,/0:21,7.*La mineur/);assert.match(r.content,/0:29,3.*Do/);
 assert.match(r.content,/Appui retiré : 0:31,5/);
 history.push({role:'user',content:correction},{role:'assistant',...r});
 const pending=JSON.stringify(r.toolResult.harmonyBrief);
 const invalid=await sendCopilotMessage({message:'Fa à 0:25,7 ; Sol à 9:59',messages:history,context:{type:'autonomous'}});
 assert.equal(JSON.stringify(invalid.toolResult.harmonyBrief),pending,'Pas de demi-correction après une erreur');
 const protectedChange=await sendCopilotMessage({message:'Retire l’appui à 0:02,7',messages:history,context:{type:'autonomous'}});
 assert.equal(JSON.stringify(protectedChange.toolResult.harmonyBrief),pending);assert.match(protectedChange.content,/conserver/);
 // Réouverture : toutes les contraintes sont du JSON, pas un état de session JS.
 const reopened=JSON.parse(JSON.stringify(history));
 r=await sendCopilotMessage({message:'Ces appuis me conviennent, fais-moi entendre cette harmonisation.',messages:reopened,context:{type:'autonomous'}});
 assert.equal(r.toolResult.harmonyBrief.status,'ready');const variant=r.toolResult.variants?.[0];assert(variant);
 const changed=applyTakeEdit(take,variant.advice.edit);assert(changed);
 for(const h of fixture.harmony.filter(h=>h.at<21)){
  const kept=variant.harmony.find(x=>x.at===h.at&&x.kind===h.kind);assert(kept);
  assert.deepEqual([kept.rootPc,kept.quality,kept.notes],[h.rootPc,h.quality,h.notes],'Position approuvée conservée');
 }
 for(const [at,degree,root,quality] of [[21.733,6,9,'m7'],[25.686,4,5,'maj7'],[27.696,5,7,'add9'],[29.254,1,0,'sus2']]){
  const h=variant.harmony.find(h=>h.at===at&&h.kind==='arrival');assert(h);assert.deepEqual([h.degree,h.rootPc,h.quality],[degree,root,quality]);
 }
 assert.equal(pc(variant.harmony.find(h=>h.at===21.733).notes[0]),9);
 assert(!variant.arrivals.some(a=>a.at===31.517));assert.equal(variant.harmony.at(-1).end,take.duration);
 const newPasses=variant.harmony.filter(h=>h.kind==='dominant'&&!fixture.harmony.some(old=>old.at===h.at));
 assert(newPasses.length>=2,'Des préparations possibles sous les notes tenues');
 for(const h of newPasses){
  const target=variant.harmony.find(x=>x.at===h.end);assert(resolvingVoices(h,target));
  if(!notePairs(take.events).some(p=>p.event.time===h.at)){
   assert(notePairs(take.events).some(p=>p.on===h.sourceOn&&p.event.time<h.at&&p.end>=h.at+.08));
   assert(Math.abs(h.beat-Math.round(h.beat))<1e-8);
  }
 }
 for(const [i,h]of variant.harmony.entries()){
  assert.equal(h.end,variant.harmony[i+1]?.at??take.duration);assert.equal(voicedQuality(h.notes,h.rootPc,h.quality),h.quality);
  assert.equal(h.notes.at(-1),h.topMidi);assert(handDistribution(h.notes));assert(h.notes.at(-1)-h.notes[0]<=24);
 }
 for(const p of notePairs(take.events))assert(notePairs(changed.events).some(q=>q.event.note===p.event.note&&q.event.time===p.event.time&&q.end===p.end));
 reopened.push({role:'user',content:'Confirme ces appuis.'},{role:'assistant',...r});
 assert.deepEqual(buildConversationMemory(reopened,{take}).harmonyBrief.revision,r.toolResult.harmonyBrief.revision);
 // Les positions protégées ne peuvent pas servir à une autre prise ou être
 // forcées avec un faux sommet ; les contrôles musicaux restent actifs.
 const constraints={arrivals:r.toolResult.harmonyBrief.arrivals,lockedHarmony:fixture.harmony.filter(h=>h.at<21)};
 const message=r.toolResult.harmonicRequest;
 assert.equal(buildDegreeAccompaniment(take,{message,constraints:{...constraints,lockedHarmony:[{...constraints.lockedHarmony[0],notes:[1,2,99]}]}}),null);
 // La transposition conserve les degrés, pas des noms ni des MIDI absolus.
 for(const shift of [2,5]){
  const source={...take,key:'',events:take.events.map(e=>({...e,...(e.note!=null?{note:e.note+shift}:{})}))};
  const brief=JSON.parse(JSON.stringify(r.toolResult.harmonyBrief));brief.key.rootPc=shift;
  for(const a of brief.arrivals)a.melody+=shift;
  for(const h of brief.revision.lockedHarmony){h.notes=h.notes.map(n=>n+shift);h.topMidi+=shift;h.rootPc=pc(h.rootPc+shift);if(h.function)h.function.targetRootPc=pc(h.function.targetRootPc+shift);}
  const shifted=await sendCopilotMessage({message:'Ces appuis me conviennent, fais-moi entendre cette harmonisation.',messages:historyFor(source,{...brief,status:'pending',stage:'arrivals'},[]),context:{type:'autonomous'}});
  const v=shifted.toolResult.variants?.[0];assert(v);assert.equal(v.harmony.find(h=>h.at===21.733).rootPc,pc(9+shift));
  assert.deepEqual(v.arrivals.map(a=>[a.at,a.degree]),variant.arrivals.map(a=>[a.at,a.degree]));
 }
 // Une nouvelle recherche reçoit les appuis imposés comme contraintes du
 // parcours : un accord ne peut plus les englober ni changer leur degré.
 const required=variant.arrivals.filter(a=>a.userConfirmed);
 const plans=melodyHarmonicPlans(take,{key:fixture.brief.key,profile:'ccm',required});assert(plans.length);
 for(const plan of plans)for(const a of required)assert(plan.arrivals.some(b=>b.sourceOn===a.sourceOn&&b.degree===a.degree&&b.at===a.at));
 assert.equal(JSON.stringify([fixture,take]),saved);assert.equal(calls,0);
 console.log('✓ Révision locale : début approuvé conservé, corrections atomiques, couleurs/basse, quatre arrivées exactes, fin sans réattaque, passages sur pulsation résolus, source/mains/sommet intacts, JSON/mémoire et transpositions, contraintes de recherche.');
}finally{globalThis.fetch=savedFetch;}
