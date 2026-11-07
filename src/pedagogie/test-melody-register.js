import assert from 'node:assert/strict';
import fs from 'node:fs';
import {buildDegreeAccompaniment} from './melody-progression.js';
import {notePairs,applyTakeEdit} from './take-edit.js';
import {handDistribution,voicedQuality} from './piano-voicing.js';
import {sendCopilotMessage} from './copilot-client.js';
import {isExplanationQuestion} from './proposal-explanation.js';
const pc=n=>(n%12+12)%12;
const source={...JSON.parse(fs.readFileSync(new URL('./fixtures/copilot-session010.json',import.meta.url))),key:''};
const request=(key='',p=['Fa','Si','Mi','Do','La','Ré'])=>{
 const [a,b,c,d,e,f]=p;
 return `Harmonise ma mélodie sur 4-5-3-6 ${key}. Arrivées : 4 sur ${a}, 5 sur ${b}, 3 sur ${c}, 6 sur ${d}. Variante 4-5-6 : 6 sur ${c} aigu. Finale : 4 sur ${e} ; 5 sur ${f} ; 1 sur ${d} après ${d}-${b}-${d} avant le ${d} suivant. Couleurs : 5 avant la variante = 7b9 ; 4 de finale = maj9. Avec quelques accords de passage et une appoggiature intérieure. Toucher doux.`;
};
function check(take,v,shift=0,rate=1){
 assert(v,'Une mélodie déjà acceptée reste harmonisable en registre compact');
 const changed=applyTakeEdit(take,v.advice.edit);assert(changed);
 const original=notePairs(take.events),actual=notePairs(changed.events);
 for(const p of original)assert(actual.some(q=>q.event.note===p.event.note&&q.event.time===p.event.time&&q.end===p.end));
 const tonic=shift,lowest=Math.min(...v.arrivals.map(a=>a.melody)),floor=lowest-pc(lowest-tonic)-12;
 for(const h of v.harmony){
  assert.equal(voicedQuality(h.notes,h.rootPc,h.quality),h.quality);
  assert(h.notes.at(-1)-h.notes[0]<=24,'Le sommet et la basse ne dépassent pas deux octaves');
  assert(h.notes[0]>=floor-5&&(h.notes[0]>=floor||[7,9,11].includes(pc(h.notes[0]-tonic))));
  assert(h.notes.every((n,i)=>!i||n-h.notes[i-1]<=12),'Pas de trou supérieur à une octave sous le sommet');
 }
 for(const t of new Set(changed.events.map(e=>e.time+.000001))){
  const sounding=actual.filter(p=>p.event.time<=t&&p.end>t);
  assert(!sounding.length||handDistribution(sounding.map(p=>p.event.note)),'Mains vérifiées pendant le legato réel');
 }
 const variant=v.arrivals.find(a=>a.variant),before=v.harmony.filter(h=>h.kind==='arrival'&&h.at<variant.at).at(-1);
 assert.equal(before.quality,'7b9');assert.equal(pc(before.rootPc-tonic),7);
 const coda=v.harmony.find(h=>h.degree===4&&h.at>variant.at);assert.equal(coda.quality,'maj9');
 const final=v.harmony.at(-1);assert(final.anticipation);assert(final.melodyAt<final.at&&final.at<final.nextMelodyAt);
 assert(Math.abs(final.at-29.9845*rate)<.00001);
 assert(final.at-final.melodyAt>final.nextMelodyAt-final.at,'Entrée plus près du Do suivant');
 assert(v.ornaments.length===1);const o=v.ornaments[0];
 const arrival=v.harmony.find(h=>o.at>=h.at&&o.at<h.at+.02);
 assert(arrival.topMidi-o.target<=16,'Appoggiature intérieure dans le registre audible');
 assert(o.end-o.at>=.085-1e-8&&o.end-o.at<=.095+1e-8);
 assert((v.advice.edit.pedal.filter(e=>e.time<=o.end+1e-8).at(-1)?.value??0)===0);
 return v;
}
const v=check(source,buildDegreeAccompaniment(source,{message:request()}));
assert(!isExplanationQuestion(request()),'« quelques accords » est une consigne, pas « quel accord ? »');
assert(isExplanationQuestion('Quels accords as-tu changés ?'));
for(const [shift,key,notes]of [[2,'en Ré majeur',['Sol','Do♯','Fa♯','Ré','Si','Mi']],[5,'en Fa majeur',['Si♭','Mi','La','Fa','Ré','Sol']],[7,'en Sol majeur',['Do','Fa♯','Si','Sol','Mi','La']]]){
 const take={...source,events:source.events.map(e=>({...e,...(e.note!=null?{note:e.note+shift}:{})}))};
 check(take,buildDegreeAccompaniment(take,{message:request(key,notes)}),shift);
}
for(const rate of [.85,1.15]){
 const take={...source,duration:source.duration*rate,events:source.events.map(e=>({...e,time:e.time*rate}))};
 check(take,buildDegreeAccompaniment(take,{message:request()}),0,rate);
}
// Des écarts d'arrondi aux frontières du legato ne doivent pas réintroduire
// les basses graves ou les trous de registre interdits.
for(const epsilon of [-1e-12,1e-12]){
 const take={...source,duration:source.duration+epsilon,events:source.events.map(e=>({...e,time:e.time+epsilon}))};
 check(take,buildDegreeAccompaniment(take,{message:request()}));
}
let calls=0;const fetch=globalThis.fetch;globalThis.fetch=async()=>{calls++;throw Error('Aucun fournisseur');};
try{
 const r=await sendCopilotMessage({message:request(),context:{type:'session',playing:{session:source}}});check(source,r.toolResult.variants[0]);
 const messages=[{role:'user',content:request(),take:source},{role:'assistant',...r}];
 const follow=await sendCopilotMessage({message:'Fais-moi entendre ces voicings. Couleurs : 5 avant la variante = 7 ; 4 de finale = maj7.',messages,context:{type:'autonomous'}});
 const next=follow.toolResult.variants[0],variantAt=next.arrivals.find(a=>a.variant).at;
 assert.equal(next.harmony.filter(h=>h.kind==='arrival'&&h.at<variantAt).at(-1).quality,'7');
 assert.equal(next.harmony.find(h=>h.degree===4&&h.at>variantAt).quality,'maj7');
 assert.equal(calls,0);
}finally{globalThis.fetch=fetch;}
console.log('✓ Registre compact, inversions réelles, deux couleurs différentes, I entre les deux notes et plus près de la suivante, ornement dans le registre proche, source intacte, transpositions/tempos/arrondis et client normal sans fournisseur.');
