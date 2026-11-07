import assert from 'node:assert/strict';
import fs from 'node:fs';
import {buildDegreeAccompaniment} from './melody-progression.js';
import {notePairs,applyTakeEdit} from './take-edit.js';
import {handDistribution,voicedQuality} from './piano-voicing.js';
import {resolvingVoices} from './harmonic-intentions.js';
import {sendCopilotMessage} from './copilot-client.js';
import {personalStyleCapabilityAnswer,requestedPersonalStyle} from './style-capabilities.js';
import {melodyColorProfile} from './melody-color-profile.js';
const source={...JSON.parse(fs.readFileSync(new URL('./fixtures/copilot-session010.json',import.meta.url))),key:''};
const pc=n=>(n%12+12)%12;
const request=(key='',p=['Fa','Si','Mi','Do','La','Ré'])=>{
 const [a,b,c,d,e,f]=p;
 return `Fais-moi entendre ma mélodie harmonisée sur 4-5-3-6 ${key} en couleurs CCM. Arrivées : 4 sur ${a}, 5 sur ${b}, 3 sur ${c}, 6 sur ${d}. Variante 4-5-6 : 6 sur ${c} aigu. Finale : 4 sur ${e} ; 5 sur ${f} ; 1 sur ${d} après ${d}-${b}-${d} avant le ${d} suivant. Couleurs : 4 de finale = maj7 ; 1 de finale = sus2. Avec quelques accords de passage et une appoggiature intérieure rapide. Toucher doux.`;
};
function check(take,v,shift=0,rate=1){
 assert(v);assert.equal(v.colorProfile,'ccm');const changed=applyTakeEdit(take,v.advice.edit);assert(changed);
 const pairs=notePairs(take.events),played=notePairs(changed.events),added=v.advice.edit.notes;
 for(const p of pairs)assert(played.some(q=>p.event.note===q.event.note&&p.event.time===q.event.time&&p.end===q.end));
 assert.equal(v.arrivals.length,14);assert.equal(v.harmony.length,18);
 const near=t=>v.harmony.find(h=>Math.abs(h.at-t*rate)<1e-6);
 const warm=near(19.231),leading=near(19.701),arrival=near(21.733),four=near(25.686),final=v.harmony.at(-1);
 assert.equal(warm.quality,'m7');assert.equal(pc(warm.rootPc-shift),2);
 assert.equal(leading.quality,'dim7');assert.equal(pc(leading.rootPc-shift),8);assert.equal(leading.function.kind,'leading-tone');
 assert.equal(pc(leading.notes[0]-shift),8);assert.equal(leading.topMidi,71+shift);
 assert.equal(leading.function.targetRootPc,arrival.rootPc);assert(resolvingVoices(leading,arrival));
 assert(resolvingVoices(warm,leading));assert.equal(resolvingVoices(leading,{...arrival,rootPc:pc(arrival.rootPc+1)}),0);
 assert.equal(four.quality,'maj7');assert(!four.notes.some(n=>pc(n-four.rootPc)===2),'La neuvième retirée du Fa ne doit pas revenir dans le voicing');
 assert.equal(final.quality,'sus2');assert.equal(pc(final.notes[0]-shift),0);
 assert(Math.abs(final.at-29.9845*rate)<1e-6);assert(final.at>final.melodyAt&&final.at<final.nextMelodyAt);
 for(const [i,h]of v.harmony.entries()){
  assert.equal(voicedQuality(h.notes,h.rootPc,h.quality),h.quality);
  assert(h.notes.at(-1)-h.notes[0]<=24);assert(h.notes.every((n,j)=>!j||n-h.notes[j-1]<=12));
  assert.equal(h.end,v.harmony[i+1]?.at??take.duration);
  if(h.quality==='sus2')assert(!h.notes.some(n=>[3,4].includes(pc(n-h.rootPc))),'Un sus2 ne conserve pas la tierce');
 }
 assert(v.harmony.some(h=>h.quality==='sus2'));
 assert.equal(v.ornaments.length,1);const o=v.ornaments[0];assert(o.end-o.at>=.085-1e-8&&o.end-o.at<=.095+1e-8);
 assert(added.some(n=>n.note===o.note&&n.time===o.at&&n.end===o.end));assert(added.some(n=>n.note===o.target&&n.time===o.end));
 assert((v.advice.edit.pedal.filter(e=>e.time<=o.end+1e-8).at(-1)?.value??0)===0,'La pédale est relevée à la résolution, ou déjà relevée avant');
 for(const t of new Set(changed.events.map(e=>e.time+1e-6))){
  const active=played.filter(p=>p.event.time<=t&&p.end>t);assert(!active.length||handDistribution(active.map(p=>p.event.note)));
  const melody=pairs.filter(p=>p.event.time<=t&&p.end>t);
  if(melody.length)assert(added.filter(n=>n.time<=t&&n.end>t).every(n=>n.note<Math.max(...melody.map(p=>p.event.note))));
 }
 return v;
}
check(source,buildDegreeAccompaniment(source,{message:request()}));
for(const [shift,key,notes]of [[2,'en Ré majeur',['Sol','Do♯','Fa♯','Ré','Si','Mi']],[5,'en Fa majeur',['Si♭','Mi','La','Fa','Ré','Sol']],[7,'en Sol majeur',['Do','Fa♯','Si','Sol','Mi','La']]]){
 const take={...source,events:source.events.map(e=>({...e,...(e.note!=null?{note:e.note+shift}:{})}))};check(take,buildDegreeAccompaniment(take,{message:request(key,notes)}),shift);
}
for(const rate of [.85,1.15]){const take={...source,duration:source.duration*rate,events:source.events.map(e=>({...e,time:e.time*rate}))};check(take,buildDegreeAccompaniment(take,{message:request()}),0,rate);}
assert.equal(requestedPersonalStyle('Fais-moi entendre une version gospel CCM.'),'CCM');
assert.equal(melodyColorProfile('Sans CCM.'),null);assert.equal(melodyColorProfile('Couleurs contemporary Christian music.'),'ccm');
assert.equal(personalStyleCapabilityAnswer({message:'Fais-moi entendre une version CCM.',context:{type:'session',playing:{passage:source}}}).toolResult.styleCapability.status,'unavailable','Ne pas promettre une conversion de style sans progression');
let calls=0;const fetch=globalThis.fetch;globalThis.fetch=async()=>{calls++;throw Error('Pas de fournisseur');};
try{
 const response=await sendCopilotMessage({message:request(),context:{type:'session',playing:{session:source}}});check(source,response.toolResult.variants[0]);assert.match(response.content,/couleurs CCM/);
 const current=[{role:'user',content:request(),take:source},{role:'assistant',...response}];
 const reason=await sendCopilotMessage({message:'Pourquoi le G#dim7 ?',messages:current,context:{type:'autonomous'}});assert.match(reason.content,/prépare.*La(?:m| mineur)/i);assert.match(reason.content,/Sol♯ rejoint le La/);
 const suspended=await sendCopilotMessage({message:'Pourquoi le Csus2 ?',messages:current,context:{type:'autonomous'}});assert.match(suspended.content,/seconde.*tierce/);
 const oldRequest=request().replace('en couleurs CCM','').replace('4 de finale = maj7 ; 1 de finale = sus2','5 avant la variante = 7b9 ; 4 de finale = maj9');
 const before=await sendCopilotMessage({message:oldRequest,context:{type:'session',playing:{session:source}}});assert(before.toolResult.variants.length);
 const messages=[{role:'user',content:oldRequest,take:source},{role:'assistant',...before}];
 const follow=await sendCopilotMessage({message:'Fais-moi entendre une version CCM. Couleurs : 4 de finale = maj7 ; 1 de finale = sus2. Avec une appoggiature intérieure rapide.',messages,context:{type:'autonomous'}});
 check(source,follow.toolResult.variants[0]);assert(!follow.toolResult.harmonicRequest.includes('5 avant la variante = 7b9'));
 assert.equal(calls,0);
}finally{globalThis.fetch=fetch;}
console.log('✓ Palette CCM limitée à l’harmonie : suspendus réels, préparation diminuée vers vi avec résolution, ii mineur plus doux, neuvième retirée du IV final, I sus2 et ornement bref ; source/tenues/mains/pédale, transpositions/tempos, mémoire et client normal sans fournisseur.');
