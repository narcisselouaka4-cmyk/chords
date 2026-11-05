import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildPlayingVariants,personalVariantsAnswer} from './playing-variants.js';
import {fixedFrames,harmonyVoicings} from './fixed-harmony.js';
import {applyTakeEdit,notePairs} from './take-edit.js';
import {refreshPlayingResult} from './playing-advice.js';
import {variantMessages} from './copilot-tab.js';
import {sendCopilotMessage} from './copilot-client.js';
import {realizesChord} from '../practice-exercise.js';
const pc=n=>(n%12+12)%12;
const blockTake=blocks=>({duration:blocks.length*2,events:blocks.flatMap((notes,i)=>notes.flatMap(note=>[
 {type:'note_on',note,time:i*2,velocity:.7,channel:0},
 {type:'note_off',note,time:i*2+1.8,velocity:0,channel:0},
])).sort((a,b)=>a.time-b.time)});
const take=blockTake([[48,55,60,64],[50,57,60,65],[52,59,62,67]]);
const context={playing:{passage:take}};
const message='En do majeur, enrichis mes accords, uniquement des accords fixes';
const variants=buildPlayingVariants(take,{message});
let count=0;async function check(title,test){await test();count++;console.log(`✓ ${title}`);}
await check('Les propositions sont des voicings fixes réellement distincts',()=>{
 assert(variants.length>=2);
 assert.equal(new Set(variants.map(v=>JSON.stringify(v.example.events))).size,variants.length);
 assert(variants.every(v=>v.advice.edit.type==='fixed-harmony'));
 assert(variants.every(v=>v.advice.changes.every(p=>p.goal==='enrich')));
 assert(variants.every(v=>!/liaison|arpege|mouvement/i.test(v.title)));
});
await check('Do majeur 9 garde Sol au-dessus de toutes ses voix',()=>{
 const vs=harmonyVoicings({notes:[48,64,67],bassMidi:48,topMidi:67},{rootPc:0,quality:'maj9',preserveBass:true});
 assert(vs.length);assert(vs.every(v=>Math.max(...v.notes)===67));
 assert(vs.every(v=>v.notes.some(n=>pc(n)===11)&&v.notes.some(n=>pc(n)===2)));
});
await check('Do majeur 9 avec Mi au sommet existe même sans position publiée dans le catalogue',()=>{
 const vs=harmonyVoicings({notes:[48,60,64],bassMidi:48,topMidi:64},{rootPc:0,quality:'maj9',preserveBass:true});
 assert(vs.length);assert(vs.every(v=>Math.max(...v.notes)===64&&realizesChord(v.notes,0,'maj9')));
});
await check('La mineur 11 peut remplacer Do tout en gardant le Sol exact',()=>{
 const vs=harmonyVoicings({notes:[48,64,67],bassMidi:48,topMidi:67},{rootPc:9,quality:'m11',preserveBass:false});
 assert(vs.length);assert(vs.every(v=>Math.max(...v.notes)===67&&pc(v.notes[0])===9));
});
await check('La mélodie Mi–Fa–Sol conserve chaque attaque, nuance et relâchement',()=>{
 const {frames}=fixedFrames(take), before=JSON.stringify(take);
 assert.equal(frames.length,3);
 for(const v of variants){
  const changed=applyTakeEdit(take,v.advice.edit);assert(changed);
  for(const f of frames){
   const original=f.source.find(p=>p.event.note===f.topMidi);
   assert(changed.events.some(e=>JSON.stringify(e)===JSON.stringify(original.event)));
   assert(changed.events.some(e=>JSON.stringify(e)===JSON.stringify(take.events[original.off])));
  }
 }
 assert.equal(JSON.stringify(take),before);
});
await check('Aucun nouvel instant, arpège, approche ou accord inséré entre deux appuis',()=>{
 const times=new Set(take.events.filter(e=>e.type==='note_on').map(e=>e.time));
 for(const v of variants){
  const changed=applyTakeEdit(take,v.advice.edit);
  assert(changed.events.filter(e=>e.type==='note_on').every(e=>times.has(e.time)));
  assert(v.example.beats===take.duration);
 }
});
await check('La version conservatrice garde les classes de basse originales',()=>{
 const v=variants.find(v=>v.id==='enrich');assert(v);
 for(const f of v.advice.edit.frames){
  const original=f.source.map(i=>take.events[i].note);
  assert.equal(pc(Math.min(...f.notes)),pc(Math.min(...original)));
 }
});
await check('Le diminué sous Fa est la partie supérieure de Mi7b9, suivi de Lam9 sous Sol',()=>{
 const v=variants.find(v=>v.id==='resolution');assert(v);
 const tension=v.advice.changes.find(c=>c.chord.includes('sans fondamentale'));
 assert(tension);assert.equal(tension.topMidi,65);assert.equal(tension.technique,'drop2');
 assert.deepEqual(new Set(tension.notes.map(pc)),new Set([8,11,2,5]));
 assert(!tension.notes.some(n=>pc(n)===6));
 const resolved=v.advice.changes.find(c=>c.chord==='La mineur 9'&&c.topMidi===67&&pc(c.notes[0])===9);
 assert(resolved);assert(resolved.notes.includes(57)); // Sol#3 monte réellement sur La3.

});
await check('Un demi-ton aigu appartenant au voicing ne rend pas Lam9 impossible',()=>{
 const vs=harmonyVoicings({notes:[45,60,64,67],bassMidi:45,topMidi:67},{rootPc:9,quality:'m9',preserveBass:false});
 assert(vs.some(v=>v.notes.some(n=>pc(n)===11)&&v.notes.some(n=>pc(n)===0)));
});
const ascending=blockTake([[48,57,60,65],[48,60,64,67],[50,60,65,69],[43,59,62,71],[48,64,67,72]]);
await check('Fa–Sol–La–Si–Do peut porter le parcours de basses Do–Fa–Sib–Mib–Lab',()=>{
 for(const request of ['Basses : Do Fa Sib Mib Lab','Des basses par quartes']){
  const vs=buildPlayingVariants(ascending,{message:request});assert(vs.length);
  const frames=vs[0].advice.edit.frames;assert.equal(frames.length,5);
  assert.deepEqual(frames.map(f=>pc(Math.min(...f.notes))),[0,5,10,3,8]);
  assert.deepEqual(frames.map(f=>Math.max(...f.notes)),[65,67,69,71,72]);
 }
});
await check('La basse choisie n’est pas confondue avec la fondamentale de l’accord',()=>{
 const vs=harmonyVoicings({notes:[43,59,62,67],bassMidi:43,topMidi:67},{rootPc:7,quality:'9',bassPc:11,preserveBass:false});
 assert(vs.length);
 assert(vs.every(v=>pc(v.notes[0])===11&&v.notes.at(-1)===67&&realizesChord(v.notes,7,'9')));
 assert(vs.every(v=>v.label.includes('/ Si')));
});
await check('Une liste de basses incomplète n’est pas complétée arbitrairement',()=>{
 assert.deepEqual(buildPlayingVariants(ascending,{message:'Basses : Do Fa'}),[]);
});
await check('Les basses chromatiques explicites sont respectées et ne deviennent pas des bécarres',()=>{
 const vs=buildPlayingVariants(ascending,{message:'Basses : Do Fa# Sib Mib Lab'});
 assert(vs.length);assert.equal(pc(vs[0].advice.edit.frames[1].notes[0]),6);
});
await check('Une contrainte de dessus falsifiée ou un accord mal nommé est refusé',()=>{
 const edit=structuredClone(variants[0].advice.edit);
 edit.frames[0].notes.push(76);assert.equal(applyTakeEdit(take,edit),null);
 const wrong=structuredClone(variants[0].advice.edit);
 wrong.frames[0].quality='dim7';assert.equal(applyTakeEdit(take,wrong),null);
});
await check('La copie JSON et la réouverture gardent chaque lecteur et son plan fixe',()=>{
 const msg={timestamp:'fixture',toolResult:{fixedHarmony:true,variants,example:variants[0].example,playingAdvice:variants[0].advice,originalTake:take}};
 const saved=JSON.parse(JSON.stringify(msg));
 const views=variantMessages(saved);assert.equal(new Set(views.map(v=>v.exampleId)).size,variants.length);
 for(const view of views)assert(refreshPlayingResult(view.toolResult)?.example);
});
await check('Les nouvelles demandes ne reprennent pas les mouvements d’un ancien message',()=>{
 const old={role:'assistant',toolResult:{variants:[{id:'connect',advice:{version:3}}]}};
 const before=JSON.stringify(old);
 const r=personalVariantsAnswer({message:'Fais-moi entendre un exemple',context,messages:[old]});
 assert.equal(r,null);
 assert.equal(JSON.stringify(old),before);
});
await check('Une nouvelle prise délimite le suivi des propositions',()=>{
 const r=personalVariantsAnswer({message,context});
 assert.equal(personalVariantsAnswer({message:'Fais-moi entendre un exemple',context,messages:[{role:'assistant',...r},{role:'user',take}]}),null);
});
await check('Le chemin réel Copilot reste local et propose les voicings de la prise',async()=>{
 const r=await sendCopilotMessage({message:message+' et joue-moi un exemple',context,messages:[]});
 assert(r.autoplay);assert(r.toolResult.phraseHarmony);assert.equal(r.toolResult.originalTake,take);
});
await check('Les deux prises réelles restent utilisables sans nouveaux instants musicaux',()=>{
 for(const file of ['copilot-development-take.json','copilot-approved-links.json']){
  const data=JSON.parse(readFileSync(new URL(`./fixtures/${file}`,import.meta.url))),source=data.take||data;
  const vs=buildPlayingVariants(source,{message:'Enrichis mes accords, uniquement des accords fixes'});assert(vs.length,file);
  for(const v of vs){
   const changed=applyTakeEdit(source,v.advice.edit);assert(changed);
   const times=new Set(source.events.filter(e=>e.type==='note_on').map(e=>e.time));
   assert(changed.events.filter(e=>e.type==='note_on').every(e=>times.has(e.time)));
  }
 }
});
await check('La règle de résolution se transpose et conserve les hauteurs cibles exactes',()=>{
 const shifted={...take,events:take.events.map(e=>({...e,note:e.note+1}))};
 const vs=buildPlayingVariants(shifted,{message:'En réb majeur, enrichis mes accords'});
 const v=vs.find(v=>v.id==='resolution');assert(v);
 assert(v.harmony.some(c=>c.topMidi===66&&c.chord.includes('sans fondamentale')));
 assert(v.harmony.some(c=>c.topMidi===68&&pc(c.bassMidi)===10));
});
await check('Des basses imposées ne sont pas remplacées en silence si la pédale empêche la substitution',()=>{
 const held={...ascending,events:[{type:'control',controller:64,value:127,time:0},...ascending.events,{type:'control',controller:64,value:0,time:ascending.duration}]};
 assert.deepEqual(buildPlayingVariants(held,{message:'Basses : Do Fa Sib Mib Lab'}),[]);
});
await check('Aucune harmonie inventée à partir d’une prise vide',()=>{
 assert.deepEqual(buildPlayingVariants({events:[],duration:0}),[]);
});
console.log(`${count}/${count} vérifications réussies`);
