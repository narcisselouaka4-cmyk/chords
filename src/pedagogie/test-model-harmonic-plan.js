import assert from 'node:assert/strict';
import {modelHarmonySource,modelHarmonyRequest,modelHarmonyData,realizeModelHarmony} from './model-harmonic-plan.js';
import {sendCopilotMessage,setCopilotTimeout} from './copilot-client.js';
import {buildConversationMemory} from './copilot-memory.js';
import {proposalChordGrid} from './proposal-chord-grid.js';
import {notePairs} from './take-edit.js';
import {refreshPlayingResult} from './playing-advice.js';

const take={name:'Prise inconnue des références',duration:6,events:[[48,55,60,64],[50,57,60,65],[52,59,62,67]].flatMap((ns,i)=>ns.flatMap(note=>[
 {type:'note_on',note,time:i*2,velocity:.7,channel:0},
 {type:'note_off',note,time:i*2+1.8,velocity:0,channel:0},
])).sort((a,b)=>a.time-b.time)};
const context={playing:{passage:take}},source=modelHarmonySource(take),original=JSON.stringify(take);
assert(source.ok);assert.equal(source.anchors.length,3);
const plan=(alternative=false)=>({variants:[{title:alternative?'Autres basses':'Accords liés',segments:(alternative?
 [[9,'m7',[45,55,60,64]],[5,'maj7',[53,57,60,64,65]],[0,'maj7',[48,52,59,67]]]:
 [[0,'maj7',[48,55,59,64]],[2,'m7',[50,57,60,65]],[4,'m7',[52,59,62,67]]])
 .map(([rootPc,quality,notes],anchor)=>({anchor,rootPc,quality,notes,reason:'Cette couleur soutient la mélodie avec une basse proche.'}))}]});
let checks=0;const check=(label,test)=>{test();checks++;console.log('✓ '+label);};
check('Deux plans fournissent des notes réellement différentes, sans référence musicale codée',()=>{
 const a=realizeModelHarmony(JSON.stringify(plan()),source),b=realizeModelHarmony(JSON.stringify(plan(true)),source);
 assert(a.ok,a.reason);assert(b.ok,b.reason);assert.notDeepEqual(a.variants[0].example.events,b.variants[0].example.events);
 for(const v of [...a.variants,...b.variants])for(const p of source.melody){
  const preserved=notePairs(v.example.events.map(e=>({...e,type:({noteOn:'note_on',noteOff:'note_off'})[e.type]||e.type}))).find(q=>q.event.note===p.event.note&&q.event.time===p.event.time);
  assert(preserved);assert.equal(preserved.end,p.end);assert.equal(preserved.event.velocity,p.event.velocity);
 }
 assert.equal(JSON.stringify(take),original);
});
check('Extensions absentes, top changée, main trop ouverte, appui oublié : refus atomique',()=>{
 const reject=edit=>{const p=plan();edit(p.variants[0].segments);assert(!realizeModelHarmony(JSON.stringify(p),source).ok);};
 reject(ss=>ss[0].quality='maj9');reject(ss=>ss[0].notes.push(72));
 reject(ss=>ss[0].notes=[28,43,59,64]);reject(ss=>ss.splice(1,1));
 reject(ss=>ss[0].anchor=70);reject(ss=>ss.reverse());reject(ss=>ss[1].anchor=0);
 reject(ss=>{for(const s of ss)s.notes=[...source.anchors[s.anchor].frame.notes];ss[0].quality='';});
 reject(ss=>ss[0].quality='invente');
 assert(!realizeModelHarmony('{}',source).ok);
});
check('Voicings approuvés et couleurs imposées ne sont pas négociables',()=>{
 const p=plan(),lockedHarmony=[{at:0,notes:p.variants[0].segments[0].notes}];
 const s=modelHarmonySource(take,{lockedHarmony});assert(realizeModelHarmony(JSON.stringify(p),s).ok);
 assert(!realizeModelHarmony(JSON.stringify(plan(true)),s).ok);
 const c=modelHarmonySource(take,{key:{rootPc:0,minor:false},arrivals:[{sourceOn:source.anchors[0].sourceOn,at:0,degree:6,rootBass:true}]});
 assert(!realizeModelHarmony(JSON.stringify(p),c).ok);assert(realizeModelHarmony(JSON.stringify(plan(true)),c).ok);
});
check('Doublons filtrés et anciens plans fournis comme exclusions',()=>{
 const p=plan();p.variants.push({...p.variants[0],title:'Même notes autre titre'});
 const r=realizeModelHarmony(JSON.stringify(p),source);assert.equal(r.variants.length,1);
 assert(!realizeModelHarmony(JSON.stringify(plan()),source,{exclude:[r.variants[0].example.events]}).ok);
});
check('Intentions de substitution, y compris le terme mal orthographié, branchées sur le modèle',()=>{
 assert(modelHarmonyRequest('fait des substitution diatonique et trtionique si il faut'));
 assert(!modelHarmonyRequest('Rejoue mon jeu'));
});
check('Une mélodie nouvelle reçoit des accords tenus sur quelques appuis, sans déplacer ses notes',()=>{
 const melody={duration:8,events:[65,67,72,71,69,67,65,64].flatMap((note,i)=>[
  {type:'note_on',note,time:i,velocity:.65},{type:'note_off',note,time:i+.9,velocity:0}])};
 const s=modelHarmonySource(melody);assert(s.ok&&s.melodic);
 const p={variants:[{title:'Sous une mélodie',segments:[
  {anchor:0,rootPc:5,quality:'maj7',notes:[53,57,60,64,65],reason:'Une couleur douce pour commencer.'},
  {anchor:3,rootPc:7,quality:'7',notes:[55,59,62,65,71],reason:'Cette tension prépare la suite.'},
  {anchor:7,rootPc:9,quality:'m7',notes:[45,55,60,64],reason:'La tension se relâche.'},
 ]}]};
 const r=realizeModelHarmony(JSON.stringify(p),s);assert(r.ok,r.reason);
 const v=r.variants[0];assert.equal(v.harmony.length,3);assert.equal(v.advice.edit.remove.length,0);
 assert(v.advice.edit.notes.some(n=>n.time===0&&n.end>2.9),'Accompagnement tenu pendant les notes suivantes');
 assert.equal(refreshPlayingResult({playingAdvice:v.advice}).example.beats,8);
});

let selected='beam',calls=[],queue=[],pending=false;
globalThis.localStorage={getItem:()=>JSON.stringify({baseUrl:'https://ollama.com/v1',model:selected,apiKey:'TEST-ONLY-NOT-A-REAL-KEY'})};
globalThis.window={electronAPI:{ai:{chatCompletion:async(baseUrl,key,body)=>{
 calls.push(body);
 if(pending)return new Promise(()=>{});
 const output=queue.shift();
 return {ok:true,status:200,text:JSON.stringify({choices:[{message:{content:typeof output==='string'?output:JSON.stringify(output)},finish_reason:'stop'}]})};
}}}};
queue.push(plan());
const a=await sendCopilotMessage({message:'Enrichis mes accords.',context});
check('Le parcours public appelle vraiment le modèle choisi avec les notes MIDI',()=>{
 assert(a.ok);assert.equal(calls.length,1);assert.equal(calls[0].model,'beam');
 assert.equal(calls[0].max_tokens,3000); /* 12/11 : réserve proportionnée à la prise (3 appuis), et non plus 8 192 fixes */assert(!calls[0].tools);
 const data=JSON.parse(calls[0].messages[1].content);assert.deepEqual(data.source,modelHarmonyData(source));
 assert.equal(a.toolResult.generation.engine,'model');assert(a.toolResult.variants.length);
 assert.equal(proposalChordGrid(a.toolResult).rows.length,2);
});
selected='nemotron-3-ultra';queue.push(plan(true));
const b=await sendCopilotMessage({message:'Enrichis mes accords.',context});
check('Changer de modèle n’utilise ni cache ni variante locale',()=>{
 assert.equal(calls.length,2);assert.equal(calls[1].model,'nemotron-3-ultra');assert(b.toolResult.variants.length);
 assert.notDeepEqual(a.toolResult.example.events,b.toolResult.example.events);
});
const messages=[{role:'user',content:'Enrichis',take},{role:'assistant',...b}];
check('La mémoire contient le modèle et les raisons de ses accords',()=>{
 const memory=buildConversationMemory(messages,{take});assert.equal(memory.proposals[0].variants[0].generation.model,selected);
 assert(memory.proposals[0].variants[0].harmony.every(h=>h.reason));
});
const details=await sendCopilotMessage({message:'Plus de détails',context,messages});
check('Les explications retrouvent les raisons du plan joué sans nouvel appel cloud',()=>{
 assert(details.ok);assert(details.content.includes('Cette couleur soutient'));assert.equal(calls.length,2);
 const restored=refreshPlayingResult(b.toolResult);assert(restored);assert.deepEqual(restored.example,b.toolResult.example);
});
const replay=await sendCopilotMessage({message:'Rejoue mon jeu.',context,messages});
check('Rejouer la prise originale ne génère aucune nouvelle harmonie',()=>{
 assert(replay.ok);assert.equal(calls.length,2);assert(!replay.toolResult.variants);
});
queue.push('réponse invalide',plan());
const corrected=await sendCopilotMessage({message:'Fais des substitutions diatoniques.',context});
check('Une correction bornée valide le plan réparé sans changer de modèle',()=>{
 assert(corrected.toolResult.variants.length);assert.equal(calls.length,4);
 assert(calls.at(-1).messages.at(-1).content.includes('refusé'));
});
queue.push('invalide','encore invalide');
const rejected=await sendCopilotMessage({message:'Fais des substitutions tritoniques.',context});
check('Deux plans invalides ne déclenchent jamais la recette locale',()=>{
 assert(rejected.ok);assert(!rejected.toolResult.variants);assert(!rejected.toolResult.example);
 assert(rejected.toolResult.generation.rejected);assert.equal(calls.length,6);
});
// [Claude] — 2026-11-11 — 400 ms et non 25 : sous forte charge, le délai s'écoulait avant le premier envoi.
pending=true;setCopilotTimeout(400);
const timeout=await sendCopilotMessage({message:'Enrichis mes accords.',context});
check('Le délai global interrompt la génération sans résultat local de secours',()=>{
 assert(!timeout.ok);assert.equal(timeout.error,'AI_TIMEOUT');assert(!timeout.toolResult.example);
});
pending=false;setCopilotTimeout(90000);
const local=await sendCopilotMessage({message:'Enrichis mes accords.',context,generationMode:'local'});
check('Le mode hors réseau demeure explicite et annonce sa provenance',()=>{
 assert(local.toolResult.variants.length);assert.equal(local.toolResult.generation.engine,'local');assert.equal(calls.length,7);
 assert(local.content.includes('sans appel au modèle'));
});
assert.equal(JSON.stringify(take),original);
console.log(`${checks} contrôles réussis — fournisseur simulé, aucun appel cloud.`);
