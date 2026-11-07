import assert from 'node:assert/strict';
import fs from 'node:fs';
import {buildDegreeAccompaniment} from './melody-progression.js';
import {notePairs,applyTakeEdit} from './take-edit.js';
import {handDistribution,voicedQuality} from './piano-voicing.js';
import {resolvingVoices} from './harmonic-intentions.js';
import {sendCopilotMessage} from './copilot-client.js';
const fixture={...JSON.parse(fs.readFileSync(new URL('./fixtures/copilot-session010.json',import.meta.url))),key:''};
const pc=n=>(n%12+12)%12;
const request=(key='',names=['Fa','Si','Mi','Do','La','Ré'])=>{
 const [a,b,c,d,e,f]=names;
 return `Fais-moi entendre ma mélodie harmonisée sur 4-5-3-6 ${key} en couleurs CCM. Arrivées : 4 sur ${a}, 5 sur ${b}, 3 sur ${c}, 6 sur ${d}. Variante 4-5-6 : 6 sur ${c} aigu. Finale : 4 sur ${e} ; 5 sur ${f} ; 1 sur ${d} après ${d}-${b}-${d} avant le ${d} suivant. Couleurs : 4 de finale = maj7 ; 1 de finale = sus2. Avec quelques accords de passage. Sans appoggiature. Toucher doux.`;
};
const instruction=' Développe les préparations et les voix intérieures.';
// Une prise peut finir sur son deuxième IV : aucun accord suivant ne peut
// alors servir à évaluer une substitution, mais la prise reste accompagnable.
const short={...fixture,duration:9.7,events:fixture.events.filter(e=>e.time<=9.7)};
const shortRequest='Harmonise sur 4-5-3-6 en Do majeur en couleurs CCM. Arrivées : 4 sur Fa, 5 sur Si, 3 sur Mi, 6 sur Do. Avec quelques accords de passage. Sans appoggiature.';
const shortBase=buildDegreeAccompaniment(short,{message:shortRequest});
const shortVersion=buildDegreeAccompaniment(short,{message:shortRequest+instruction});
assert(shortBase);assert(shortVersion);assert(!shortVersion.development.some(d=>d.kind==='diatonic-color'));
assert.equal(shortVersion.harmony.at(-1).chord,shortBase.harmony.at(-1).chord);
function verify(take,base,version,rate=1,shift=0){
 assert(base);assert(version);assert.equal(base.ornaments.length,0);assert.equal(version.ornaments.length,0);
 assert.equal(base.harmony.length,18);assert.equal(version.harmony.length,21);
 assert.deepEqual(version.arrivals,base.arrivals,'Les repères principaux ne sont pas déplacés');
 const root=base.harmony.find(h=>Math.abs(h.at-21.733*rate)<1e-6);
 assert.equal(pc(root.notes[0]-shift),9);assert.equal(root.quality,'m7');
 const added=base.advice.edit.notes,relay=added.find(n=>n.note===67+shift&&Math.abs(n.end-root.end)<1e-6);
 assert(relay);assert(Math.abs(relay.time-21.769*rate)<1e-6,'Relais au vrai relâchement de la mélodie');
 for(const n of [57,60])assert(added.some(p=>p.note===n+shift&&p.time>=root.at&&p.time<=root.at+.015&&p.end===root.end));
 const group=version.development.find(d=>d.kind==='seven-three');assert(group);
 const chain=[group.at,group.via,group.end].map(t=>version.harmony.find(h=>h.at===t));
 assert.equal(chain[0].quality,'m11b5');assert.equal(chain[1].rootPc,pc(4+shift));
 assert(resolvingVoices(chain[0],chain[1]));assert(resolvingVoices(chain[1],chain[2]));
 assert.equal(chain[0].targetAt,chain[1].at);assert.equal(chain[1].targetAt,chain[2].at);
 const inner=version.development.find(d=>d.kind==='inner-color');assert(inner);
 assert(Math.abs(inner.at-23.739*rate)<1e-6);assert(Math.abs(inner.end-24.223*rate)<1e-6);
 const innerChord=version.harmony.find(h=>h.at===inner.at);assert.equal(innerChord.quality,'m9');
 assert.equal(voicedQuality(innerChord.notes,innerChord.rootPc,'m9'),'m9');
 // Le retour n'est pas une nouvelle attaque de tout l'accord. Seule la
 // neuvième se relâche : basse, tierce et septième restent réellement tenues.
 for(const pitch of [57,60,67]){
  const spans=version.advice.edit.notes.filter(n=>n.note===pitch+shift&&n.time>=root.at&&n.time<root.end);
  assert.equal(spans.length,1);assert.equal(spans[0].end,root.end);
 }
 assert(!version.advice.edit.notes.some(n=>Math.abs(n.time-inner.end)<1e-6));
 const color=version.development.find(d=>d.kind==='diatonic-color');assert(color);
 const substitution=version.harmony.find(h=>h.at===color.at);assert.equal(substitution.rootPc,pc(2+shift));assert.equal(substitution.quality,'m7');assert.equal(substitution.degree,2);assert.equal(voicedQuality(substitution.notes,substitution.rootPc,'m7'),'m7');
 for(const h of base.harmony.filter(h=>h.at!==group.at&&h.at!==color.at)){
  const matching=version.harmony.find(v=>v.at===h.at);assert(matching);
  assert.equal(matching.chord,h.chord);assert.deepEqual(matching.notes,h.notes,'Aucun autre accord de la base n’est réécrit');
 }
 for(const v of [base,version]){
  const snapshot=JSON.stringify(take),played=applyTakeEdit(take,v.advice.edit);assert(played);assert.equal(JSON.stringify(take),snapshot);
  const original=notePairs(take.events),actual=notePairs(played.events);
  for(const p of original)assert(actual.some(q=>q.event.note===p.event.note&&q.event.time===p.event.time&&q.end===p.end));
  for(const n of v.advice.edit.notes)assert(actual.some(p=>p.event.note===n.note&&p.event.time===n.time&&p.end===n.end));
  for(const time of new Set(played.events.map(e=>e.time+1e-6))){
   const active=actual.filter(p=>p.event.time<=time&&p.end>time).map(p=>p.event.note);
   if(active.length)assert(handDistribution(active));
   const melody=original.filter(p=>p.event.time<=time&&p.end>time);
   if(melody.length)assert(v.advice.edit.notes.filter(n=>n.time<=time&&n.end>time).every(n=>n.note<Math.max(...melody.map(p=>p.event.note))));
  }
 }
}
for(const [shift,key,names,rate]of [[0,'',undefined,1],[2,'en Ré majeur',['Sol','Do♯','Fa♯','Ré','Si','Mi'],1],[5,'en Fa majeur',['Si♭','Mi','La','Fa','Ré','Sol'],1],[7,'en Sol majeur',['Do','Fa♯','Si','Sol','Mi','La'],1],[0,'',undefined,.85],[0,'',undefined,1.15]]){
 const take={...fixture,duration:fixture.duration*rate,events:fixture.events.map(e=>({...e,time:e.time*rate,...(e.note!=null?{note:e.note+shift}:{})}))};
 const message=request(key,names),base=buildDegreeAccompaniment(take,{message}),version=buildDegreeAccompaniment(take,{message:message+instruction});
 verify(take,base,version,rate,shift);
}
let calls=0;const oldFetch=globalThis.fetch;globalThis.fetch=async()=>{calls++;throw Error('Pas de fournisseur');};
try{
 const message=request(),r=await sendCopilotMessage({message,context:{type:'session',playing:{session:fixture}}});
 const messages=[{role:'user',content:message,take:fixture},{role:'assistant',...r}];
 const developed=await sendCopilotMessage({message:'Fais-moi entendre une version développée. Développe les préparations et les voix intérieures.',messages,context:{type:'autonomous'}});
 verify(fixture,r.toolResult.variants[0],developed.toolResult.variants[0]);
 const fixed=buildDegreeAccompaniment(fixture,{message:message+instruction+' Sans développement.'});
 assert.deepEqual(fixed.advice.edit,r.toolResult.variants[0].advice.edit);
 assert.equal(calls,0);
}finally{globalThis.fetch=oldFetch;}
console.log('✓ Base CCM conservée, vi sur sa fondamentale avec relais exact du legato, aucun ornement, 7–3 ciblé, substitution diatonique et neuvième intérieure sans réattaque des voix communes, mélodie/mains/registre, transpositions/tempos et suite de conversation sans réseau.');
