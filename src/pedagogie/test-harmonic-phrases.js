import {planPhraseMotions} from './phrase-motion.js';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildFixedHarmonyVariants,fixedFrames} from './fixed-harmony.js';
import {buildPhraseVariants} from './phrase-variants.js';
import {realizesHarmony} from './harmonic-identity.js';
import {resolvingVoices} from './harmonic-intentions.js';
import {personalVariantsAnswer} from './playing-variants.js';
import {applyTakeEdit,notePairs} from './take-edit.js';
import {refreshPlayingResult} from './playing-advice.js';
import {sendCopilotMessage} from './copilot-client.js';
const pc=n=>(n%12+12)%12;
const block=(blocks,hold=1.25)=>({duration:blocks.length*2,events:blocks.flatMap((ns,i)=>ns.flatMap(note=>[
  {type:'note_on',note,time:i*2,velocity:.7,channel:0},
  {type:'note_off',note,time:i*2+hold,velocity:0,channel:0},
])).sort((a,b)=>a.time-b.time)});
const blocks=[[48,55,60,64,67],[53,57,60,65,69],[50,57,60,65,69],[43,53,59,62,67]];
const take=block(blocks), held=block(blocks,1.9);
const message='En do majeur, améliore mon jeu avec des mouvements et des accords de passage';
const variants=buildPhraseVariants(take,{message});
let count=0;
async function check(title,fn){await fn();console.log('✓ '+title);count++;}
function assertTops(source,changed){
  for(const f of fixedFrames(source).frames){
    const top=f.source.find(p=>p.event.note===f.topMidi);
    for(const index of [top.on,top.off])assert(changed.events.some(e=>JSON.stringify(e)===JSON.stringify(source.events[index])));
  }
}
await check('Une dominante secondaire ne perd pas sa tierce chromatique dans la tonalité globale',()=>{
  const t=block([[42,52,58,61,64],[47,54,57,61,62],[40,47,56,59,64]]);
  const v=buildFixedHarmonyVariants(t,{message:'En la majeur, enrichis mes accords'}).find(v=>v.id==='enrich');
  assert(v);const f=v.advice.edit.frames.find(f=>f.source.includes(0));assert(f);
  assert.equal(f.rootPc,6);assert(f.notes.some(n=>pc(n)===10));assertTops(t,applyTakeEdit(t,v.advice.edit));
});
await check('La substitution au triton conserve le dessus et a une résolution réellement jouée',()=>{
  const t=block([[48,52,58,62,70],[53,60,64,67,69]]);
  const v=buildFixedHarmonyVariants(t,{message:'En do majeur, enrichis mes accords'}).find(v=>v.id==='tritone');assert(v);
  const c=v.harmony.find(c=>c.function);assert(c&&c.rootPc===6&&c.function.targetRootPc===5);
  const changed=applyTakeEdit(t,v.advice.edit);assertTops(t,changed);
  assert(resolvingVoices({...c,function:c.function},{rootPc:5,quality:'maj9',notes:notePairs(changed.events).filter(p=>p.event.time===2).map(p=>p.event.note)}));
});
await check('Un accord majeur septième n’est pas rebaptisé dominante pour justifier un triton',()=>{
  const t=block([[48,52,59,67],[53,60,64,69]]);
  assert(!buildFixedHarmonyVariants(t,{message:'En do majeur, enrichis'}).some(v=>v.id==='tritone'));
});
await check('Do9 avec Si bémol en bas reste un accord réalisable, sans Do fictif ajouté',()=>{
  const notes=[58,62,64,67,72,76];assert(realizesHarmony(notes,0,'9'));
  assert(!realizesHarmony([58,62,65,67,72,76],0,'9'));
  const t=block([notes,[53,60,64,67,69]]),fs=fixedFrames(t).frames;
  assert.equal(fs.length,2);assert.equal(fs[0].chord.rootPc,0);assert.equal(fs[0].chord.quality,'9');
  const v=buildFixedHarmonyVariants(t,{message:'En do majeur, enrichis et garde ma basse'}).find(v=>v.id==='enrich');assert(v);
  assert.equal(v.advice.edit.frames[0].notes[0],58);
});
await check('La relation de deux lignes vers V fonctionne dans les douze tonalités',()=>{
  const keys=['do','réb','ré','mib','mi','fa','fa#','sol','lab','la','sib','si'];
  for(let shift=0;shift<12;shift++){
    const t=block([[49,54,57,64],[47,54,62],[45,52,61],[44,52,59]].map(ns=>ns.map(n=>n+shift)));
    const v=buildFixedHarmonyVariants(t,{message:`En ${keys[(9+shift)%12]} majeur, enrichis mes accords`}).find(v=>v.id==='two-lines');
    assert(v,`transposition ${shift}`);const changed=applyTakeEdit(t,v.advice.edit);assertTops(t,changed);
    assert.deepEqual([0,2,4,6].map(time=>pc(Math.min(...notePairs(changed.events).filter(p=>p.event.time===time).map(p=>p.event.note)))),[1,11,9,8].map(n=>pc(n+shift)));
  }
});
await check('Le détour parallèle est suivi d’un retour présent, et n’est pas appliqué sans celui-ci',()=>{
  const t=block([[48,55,60,64,74],[43,55,59,62,79],[50,57,60,65,77]]);
  const v=buildFixedHarmonyVariants(t,{message:'En do majeur, enrichis'}).find(v=>v.id==='parallel-return');assert(v);
  assert.deepEqual(v.harmony.slice(0,2).map(c=>c.rootPc),[10,3]);
  const noReturn=block([[48,55,60,64,74],[43,55,59,62,79],[48,55,60,64,76]]);
  assert(!buildFixedHarmonyVariants(noReturn,{message:'En do majeur, enrichis'}).some(v=>v.id==='parallel-return'));
});
await check('Les variantes développées sont différentes et protègent les événements mélodiques',()=>{
  assert(variants.some(v=>v.id==='arrangement'));assert(!variants.some(v=>v.id==='connection'));
  assert(variants.length<=5);assert.equal(new Set(variants.map(v=>JSON.stringify(v.example.events))).size,variants.length);
  for(const v of variants){const changed=applyTakeEdit(take,v.advice.edit);assert(changed);assertTops(take,changed);
    assert.equal(notePairs(changed.events).length,changed.events.filter(e=>e.type==='note_on'&&e.velocity>0).length);
  }
});
await check('Aucune ligne intérieure automatique dans les propositions construites',()=>{
  assert(!variants.some(v=>v.advice.changes.some(c=>c.technique==='inner-line')));
});
await check('Un passage unitaire dans un silence a une durée audible et aucune arrivée déplacée',()=>{
  const plan=planPhraseMotions(take,{kind:'passing'});assert(plan.motions.length);
  for(const c of plan.motions){assert(c.end-c.at>=.32);assert.equal(new Set(c.edit.attacks).size,1);assert(c.end<c.function.targetAt);assert.equal(c.edit.adjustments.length,0);}
});
await check('Un accord tenu garde son dessus dans le nouvel arrangement',()=>{
  const v=buildPhraseVariants(held,{message}).find(v=>v.id==='arrangement');assert(v);
  assert(v.advice.changes.some(c=>c.goal==='passing'));assertTops(held,applyTakeEdit(held,v.advice.edit));
});
await check('Pédale maintenue ou relâchée à l’intérieur du passage : aucun mouvement incompatible',()=>{
  for(const release of [1.6,8]){
    const t={...held,events:[{type:'control',controller:64,value:127,time:0},...held.events,{type:'control',controller:64,value:0,time:release}].sort((a,b)=>a.time-b.time)};
    const vs=buildPhraseVariants(t,{message});
    assert(!vs.some(v=>v.advice.changes.some(c=>c.goal==='passing'&&c.at<release)));
  }
});
await check('Sans mouvements, sans passages et basse conservée restent de vraies contraintes',()=>{
  const fixed=buildPhraseVariants(take,{message:'En do majeur, améliore sans mouvements'});
  assert(fixed.every(v=>v.advice.edit.type==='fixed-harmony'));
  const noPassing=buildPhraseVariants(take,{message:message+", mais pas d’accords de passage"});
  assert(!noPassing.some(v=>v.id==='passing'));
  const keep=buildPhraseVariants(take,{message:message+', garde ma basse'});
  assert(keep.length);assert(!keep.some(v=>v.id==='passing'));
  for(const v of keep){const changed=applyTakeEdit(take,v.advice.edit);
    for(const f of fixedFrames(take).frames)assert(notePairs(changed.events).some(p=>p.event.note===f.bassMidi&&p.event.time===f.at));
  }
});
await check('Le motif latin ne reçoit pas de cadence gospel ni de débit chromatique automatique',()=>{
  const data=JSON.parse(readFileSync(new URL('./fixtures/copilot-latin-takes.json',import.meta.url)));
  const takes=data.takes.slice(1);assert.equal(takes.length,2);
  // Les véritables prises sont testées également dans test-playing-style.js.
  for(const t of takes){
    assert((t.take||t).events.length);
    const vs=buildPhraseVariants(t.take||t,{message});
    assert(vs.every(v=>v.advice.edit.type==='fixed-harmony'));
  }
});
await check('Les séquences et leurs comparaisons survivent à JSON et à la réouverture',()=>{
  const v=JSON.parse(JSON.stringify(variants.find(v=>v.id==='arrangement')));
  const r=refreshPlayingResult({example:v.example,playingAdvice:v.advice});assert(r);
  assert.deepEqual(applyTakeEdit(take,v.advice.edit).events,applyTakeEdit(v.advice.take,v.advice.edit).events);
  assert(v.example.comparison.changes.some(c=>c.kind==='added'));
  assert.equal(applyTakeEdit(take,{type:'sequence',edits:[{type:'sequence',edits:[]}]}),null);
});
await check('Une relance conserve la tonalité et les basses ; les versions identiques ne sont pas répétées',()=>{
  const request='En do majeur, enrichis mes accords. Basses : Do Fa Ré Sol';
  const first=personalVariantsAnswer({message:request,context:{playing:{passage:take}}});assert(first.toolResult.variants.length);
  const next=personalVariantsAnswer({message:'Va plus loin',context:{playing:{passage:take}},messages:[{role:'assistant',...first}]});
  assert(next.toolResult.harmonicRequest.includes('Basses : Do Fa Ré Sol'));
  const seen=new Set(first.toolResult.variants.map(v=>JSON.stringify(v.example.events)));
  assert((next.toolResult.variants||[]).every(v=>!seen.has(JSON.stringify(v.example.events))));
});
await check('Une nouvelle tonalité et de nouvelles basses remplacent les contraintes précédentes',()=>{
  const context={playing:{passage:take}};
  const first=personalVariantsAnswer({message:'En do majeur, enrichis mes accords. Basses : Do Fa Ré Sol',context});
  const next=personalVariantsAnswer({message:'Va plus loin, en sol majeur. Basses : Sol Do La Ré',context,messages:[{role:'assistant',...first}]});
  assert(!next.toolResult.harmonicRequest.includes('En do majeur'));
  assert(!next.toolResult.harmonicRequest.includes('Basses : Do Fa Ré Sol'));
  assert(next.toolResult.harmonicRequest.includes('Basses : Sol Do La Ré'));
});
await check('Une demande d’écoute retrouve la même proposition et le chemin client ne dépend pas du fournisseur',async()=>{
  const context={playing:{passage:take}};
  const first=await sendCopilotMessage({message,context,messages:[]});assert(first.toolResult.phraseHarmony);
  const hear=await sendCopilotMessage({message:'Fais-moi entendre un exemple',context,messages:[{role:'assistant',...first}]});
  assert(hear.autoplay);assert.deepEqual(hear.toolResult.variants,first.toolResult.variants);
});
console.log(`${count}/${count} vérifications réussies`);
