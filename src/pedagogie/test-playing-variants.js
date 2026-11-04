import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildPlayingVariants,personalVariantsAnswer,variationAffinity} from './playing-variants.js';
import {playingProposals} from './playing-advice.js';
import {applyTakeEdit,notePairs} from './take-edit.js';
import {variantMessages} from './copilot-tab.js';
import {sendCopilotMessage} from './copilot-client.js';
const take=JSON.parse(readFileSync(new URL('./fixtures/copilot-development-take.json',import.meta.url)));
const latin=JSON.parse(readFileSync(new URL('./fixtures/copilot-latin-takes.json',import.meta.url))).takes[1];
const context={playing:{passage:take}};
const variants=buildPlayingVariants(take);
let count=0;async function check(title,test){await test();count++;console.log(`✓ ${title}`);}
await check('Trois interprétations réellement différentes, et non trois titres pour le même MIDI',()=>{
 assert.equal(variants.length,3);
 assert.equal(new Set(variants.map(v=>JSON.stringify(v.example.events))).size,3);
 assert(variants.some(v=>v.advice.changes.some(p=>p.technique==='arpeggio')));
 assert(variants.some(v=>v.advice.changes.some(p=>p.technique==='approach')));
 assert(variants.some(v=>v.advice.changes.some(p=>p.goal==='passing')));
});
await check('Chaque version garde les attaques originales, la basse et les notes principales',()=>{
 const before=JSON.stringify(take);
 for(const v of variants){
  const changed=applyTakeEdit(take,v.advice.edit);assert(changed);
  for(const e of take.events.filter(e=>e.type==='note_on'&&e.velocity>0))assert(changed.events.some(n=>n.type===e.type&&n.note===e.note&&n.time===e.time&&n.velocity===e.velocity));
  assert.equal(v.example.beats,take.duration);
  assert(changed.events.every(e=>e.time>=0&&e.time<=take.duration));
  assert(changed.events.every(e=>!Object.getOwnPropertySymbols(e).length));
 }
 assert.equal(JSON.stringify(take),before);
});
await check('Les arpèges ajoutent des attaques intermédiaires et des intervalles arpégés',()=>{
 const v=variants.find(v=>v.id==='flow');
 const sourceTimes=new Set(take.events.map(e=>e.time));
 assert(v.advice.changes.length>=3);
 for(const p of v.advice.changes){
  assert(p.edit.notes.length>=2);
  assert(p.edit.notes.some(n=>!sourceTimes.has(n.time)));
  for(let i=1;i<p.edit.notes.length;i++)assert(p.edit.notes[i].note-p.edit.notes[i-1].note>=3);
 }
});
await check('Les approches résolvent sur les vraies notes source sans les retarder',()=>{
 const v=variants.find(v=>v.id==='connect');
 for(const p of v.advice.changes.filter(p=>p.technique==='approach')) {
  const target=take.events[p.edit.on];
  for(const n of p.edit.notes){assert(n.end<target.time);assert(target.time-n.end<=.04);assert(Math.abs(target.note-n.note)<=2);}
 }
});
await check('Le passage Mi7 prépare La mineur suffisamment tôt et garde son arrivée',()=>{
 const p=variants.find(v=>v.id==='connect').advice.changes.find(p=>p.edit.notes?.join(',')==='52,62,68');
 assert(p);assert.equal(p.edit.placement,'held-cadence');
 const arrival=take.events[p.edit.on];assert(p.edit.start<=arrival.time-.4);assert(p.edit.end<arrival.time);
 const changed=applyTakeEdit(take,p.edit);
 assert(changed.events.some(e=>e.type==='note_on'&&e.note===arrival.note&&e.time===arrival.time));
 assert(p.edit.attacks.every(t=>t>=p.edit.start&&t<p.edit.end));
});
await check('Affinité ordonnée et exclusion des familles éloignées',()=>{
 for(let i=1;i<variants.length;i++)assert(variants[i-1].affinity>=variants[i].affinity);
 const review=playingProposals(take).review;
 assert.equal(variationAffinity(take,take,review,'jazz','latin'),null);
 assert.equal(variationAffinity(take,take,review,'latin','worship'),null);
 const jazz=buildPlayingVariants(take,{message:'Je joue du jazz, propose plusieurs versions'});
 assert(jazz.every(v=>v.family==='jazz'&&!/salsa|montuno|worship/i.test(v.title)));
});
await check('Le montuno conserve sa famille et les attaques du motif, sans figure gospel imposée',()=>{
 const vs=buildPlayingVariants(latin);assert(vs.length>=2);
 const times=new Set(latin.events.filter(e=>e.type==='note_on').map(e=>e.time));
 for(const v of vs){
  assert.equal(v.family,'latin');assert(!/worship|gospel/i.test(v.title));
  assert(v.example.events.filter(e=>e.type==='noteOn').every(e=>times.has(e.time)));
  assert(!v.advice.changes.some(p=>p.technique==='approach'||p.technique==='arpeggio'));
 }
});
await check('Sans genre établi, aucun nom de genre ni score de confiance inventé dans la réponse',()=>{
 const r=personalVariantsAnswer({message:'Améliore mon jeu',context});
 assert(r.toolResult.variants.every(v=>v.family==='unclassified'));
 assert.doesNotMatch(r.content,/choisis|laquelle|score|probabil|worship|salsa|gospel|jazz/i);
});
await check('Chaque proposition se réécoute avec un identifiant stable et son propre exemple',()=>{
 const msg={timestamp:'fixture',toolResult:{variants,example:variants[0].example,playingAdvice:variants[0].advice,originalTake:take}};
 const views=variantMessages(msg);assert.equal(new Set(views.map(v=>v.exampleId)).size,3);
 views.forEach((v,i)=>{assert.equal(v.toolResult.example,variants[i].example);assert.equal(v.toolResult.playingAdvice,variants[i].advice);});
 assert.deepEqual(variantMessages(msg).map(v=>v.exampleId),views.map(v=>v.exampleId));
 assert.equal(JSON.parse(JSON.stringify(msg)).toolResult.variants.length,3);
});
await check('Une demande d’écoute retrouve toutes les propositions ; une nouvelle prise délimite le suivi',()=>{
 const first=personalVariantsAnswer({message:'Améliore mon jeu',context});
 const heard=personalVariantsAnswer({message:'Fais-moi entendre un exemple',context,messages:[{role:'assistant',...first}]});
 assert(heard.autoplay);assert.equal(heard.toolResult.variants.length,3);
 const next=personalVariantsAnswer({message:'Fais-moi entendre un exemple',context,messages:[{role:'assistant',...first},{role:'user',content:'Nouvelle prise',take}]});
 assert.equal(next,null);
});
await check('Le modèle ne remplace pas ces versions de prise par une progression générique',async()=>{
 const r=await sendCopilotMessage({message:'Améliore mon jeu avec plusieurs propositions et fais-moi une démonstration',context,messages:[]});
 assert(r.autoplay);assert.equal(r.toolResult.variants.length,3);assert.equal(r.toolResult.originalTake,take);
});
await check('La porte d’entrée Rends mes accords plus beaux propose aussi plusieurs versions',()=>{
 const r=personalVariantsAnswer({message:'Rends mes accords plus beaux et joue-moi un exemple',context});
 assert(r.autoplay);assert.equal(r.toolResult.variants.length,3);
});
await check('La demande de mouvements et accords enrichis développe plusieurs gestes sur la prise',()=>{
 const r=personalVariantsAnswer({message:'Rajoute des mouvements et des accords enrichis',context});
 assert.equal(r.toolResult.variants.length,3);
 assert(r.toolResult.variants.some(v=>v.advice.changes.some(p=>p.technique==='arpeggio')));
});
await check('Les demandes de style, d’explication ou de technique précise gardent leur chemin dédié',()=>{
 for(const message of ['Quel style je joue ?','Explique-moi le Fa','Montre-moi un drop 2','Allège mes accords'])assert.equal(personalVariantsAnswer({message,context}),null);
});
await check('Une pédale tenue ne prolonge pas silencieusement une approche sur les accords suivants',()=>{
 const p=notePairs(take.events).find(p=>p.event.note===69&&p.event.time>1);
 const pedal={...take,events:[{type:'control',controller:64,value:127,time:0},...take.events,{type:'control',controller:64,value:0,time:take.duration}].sort((a,b)=>a.time-b.time)};
 const t=p.event.time-.15;
 assert.equal(applyTakeEdit(pedal,{type:'ornament',on:p.on+1,approach:true,notes:[{note:70,time:t,end:p.event.time-.012}]}),null);
});
await check('Pas de trois versions factices quand la source ne donne pas de base harmonique',()=>{
 assert.deepEqual(buildPlayingVariants({events:[],duration:0}),[]);
});
console.log(`${count}/${count} vérifications réussies`);
