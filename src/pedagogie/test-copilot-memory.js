import assert from 'node:assert/strict';
import fs from 'node:fs';
import {buildConversationMemory,conversationMemoryContext,loadPersonalMemories,updatePersonalMemory,memoryCommandAnswer,rememberedMessages,conversationSourceForTurn,MEMORY_FILE} from './copilot-memory.js';
import {saveHistory,loadHistory,listAllConversations} from './copilot-history.js';
import {buildPhraseVariants} from './phrase-variants.js';
import {sendCopilotMessage,wantsToHear,asksForExample,looksLikeDemoRequest} from './copilot-client.js';
import {PROPOSAL_POLICY} from './proposal-policy.js';

const store=new Map(),requests=[];
global.window={electronAPI:{files:{homeDir:async()=>'/fixture',ensureDir:async()=>true,
  readFile:async p=>store.get(p)||null,writeFile:async(p,v)=>store.set(p,typeof v==='string'?v:JSON.stringify(v)),
  readDir:async()=>[...store.keys()].map(p=>({name:p.split('/').at(-1),isFile:true})),
},ai:{chatCompletion:async(_url,_key,body)=>{requests.push(body);return {ok:true,status:200,text:JSON.stringify({choices:[{message:{role:'assistant',content:'La neuvième colore l’accord sans déplacer la mélodie.'},finish_reason:'stop'}]})};}}}};
global.localStorage={getItem:()=>JSON.stringify({apiKey:'fixture-only',baseUrl:'http://fixture.invalid',model:'fixture'})};
const take=JSON.parse(fs.readFileSync(new URL('./fixtures/copilot-session017.json',import.meta.url)));
const sessionOnly=[{role:'user',content:'Que penses-tu de ma session ?'}];
sessionOnly[0].take=conversationSourceForTurn({type:'session',name:'Session_017',playing:{session:take}},sessionOnly);
assert(sessionOnly[0].take.events.length);assert.equal(sessionOnly[0].take.name,'Session_017');
assert.equal(conversationSourceForTurn({type:'session',playing:{session:take}},sessionOnly),null);
await saveHistory('conv_session_only','__copilot_autonomous__',sessionOnly);
const sessionReload=await loadHistory('conv_session_only');
const replaySession=await sendCopilotMessage({message:'Rejoue ma session.',messages:sessionReload.messages,context:null});
assert(replaySession.toolResult.example?.events.length);
const variants=buildPhraseVariants(take),result={originalTake:take,variants,example:variants[0].example,playingAdvice:variants[0].advice,proposalPolicy:PROPOSAL_POLICY,proposalDiversity:1,phraseHarmony:true};
const question='pourquoi après le Dm9 tu joue un A♭13#11 ? (très belle couleur au passage';
const messages=[{role:'user',content:'Fais-moi des propositions.'},{role:'assistant',content:'Voici une proposition.',toolResult:result},{role:'user',content:'Garde ma mélodie et cette couleur.'}];
const before=JSON.stringify(messages),memory=buildConversationMemory(messages,{conversationId:'conv_fixture'});
assert.equal(memory.source.eventCount,take.events.length);
const progression=items=>items.map(h=>[h.at,h.chord,h.notes]);
assert.deepEqual(progression(memory.proposals[0].variants[0].harmony),progression(variants[0].harmony));
assert(memory.decisions.includes('Garde ma mélodie et cette couleur.'));
assert(conversationMemoryContext(memory).includes('13#11'));
assert.equal(JSON.stringify(messages),before);
assert(await saveHistory('conv_fixture','__copilot_autonomous__',messages));
const path='/fixture/PianoJazzChords/PedagogieCopilot/conv_fixture.json';assert(JSON.parse(store.get(path)).memory.proposals.length);
const saved=await loadHistory('conv_fixture');assert.deepEqual(saved.memory,memory);
store.set(path,JSON.stringify({messages}));assert.deepEqual((await loadHistory('conv_fixture')).memory,memory,'Ancien historique réindexé sans migration destructive');
const long=[...saved.messages,...Array.from({length:80},(_,i)=>({role:i%2?'assistant':'user',content:`Échange ${i}`}))];
const answer=await sendCopilotMessage({message:question,messages:long,context:null});
assert(answer.ok&&!answer.autoplay&&!answer.toolResult.example);
assert.match(answer.content,/Sol7/);assert.match(answer.content,/Ré7/);assert.match(answer.content,/demi-ton/);
assert(!/envoie ta prise|enregistre/.test(answer.content));assert.equal(requests.length,0);
for(const q of [question,'Pourquoi tu joues cet accord ?','Pourquoi tu joue un F#7 ?','Explique ce que tu joues.']){
  assert(!wantsToHear(q),q);assert(!asksForExample(q),q);assert(!looksLikeDemoRequest(q),q);
}
assert(wantsToHear('Pourquoi ce choix ? Fais-moi entendre un exemple.'));
const after=[...long,{role:'user',content:question},{role:'assistant',...answer}];
const details=await sendCopilotMessage({message:'Détails',messages:after,context:null});assert.match(details.content,/La♭13#11/);
const timed=await sendCopilotMessage({message:'Pourquoi le Dm9 à 0:18 ?',messages:after,context:null});assert(timed.toolResult.proposalReference.at>18);
const replay=await sendCopilotMessage({message:'Réécouter cette proposition.',messages:after,context:null});assert(replay.autoplay);assert.deepEqual(replay.toolResult.example.events,result.example.events);
const other={duration:1,events:[{type:'note_on',note:60,time:0,velocity:.5},{type:'note_off',note:60,time:1}]};
assert.equal(buildConversationMemory([...messages,{role:'user',take:other,content:'Nouvelle prise'}]).proposals.length,0);
console.log('✓ Mémoire de conversation : plans persistés et réindexés, source intacte, question exacte après 80 messages, explication sans audio/modèle, Détails et réécoute, nouvelle prise isolée');

let command=await memoryCommandAnswer('Retiens que je préfère garder ma basse.');assert.match(command.content,/retenu/);
assert.equal((await loadPersonalMemories()).entries.length,1);
await Promise.all([updatePersonalMemory({text:'Je préfère les explications courtes.'}),updatePersonalMemory({text:'Je préfère les résolutions douces.'})]);
assert.equal((await loadPersonalMemories()).entries.length,3);
await updatePersonalMemory({text:'Je préfère les explications courtes.'});assert.equal((await loadPersonalMemories()).entries.length,3);
const id=(await loadPersonalMemories()).entries[0].id;
await updatePersonalMemory({id,text:'Je préfère garder ma basse, sauf demande contraire.'});assert.match((await loadPersonalMemories()).entries[0].text,/sauf/);
await memoryCommandAnswer('Retiens cette proposition comme référence.',{memory});
const reference=(await loadPersonalMemories()).entries.at(-1);assert.equal(reference.reference.conversationId,'conv_fixture');assert.deepEqual(progression(reference.reference.variants[0].harmony),progression(variants[0].harmony));
const personalised=await sendCopilotMessage({message:'Fais-moi des propositions',messages:[],context:{type:'session',playing:{session:take}}});
assert(personalised.toolResult.variants?.length);assert(personalised.toolResult.variants.every(v=>v.harmony.every(h=>h.goal!=='passing')),'La préférence de basse est transmise au générateur local');
assert(!personalised.toolResult.harmonicRequest.includes('Préférences retenues'));
const override=await sendCopilotMessage({message:'Fais-moi des propositions avec un autre parcours de basse',messages:[],context:{type:'session',playing:{session:take}}});
assert(override.toolResult.variants.some(v=>v.harmony.some(h=>h.goal==='passing')),'La demande actuelle prime sur la préférence de basse');
assert.equal((await listAllConversations()).length,2,'Le fichier mémoire ne doit pas apparaître comme conversation');
await sendCopilotMessage({message:'Quelle est la neuvième dans ta proposition ?',messages,context:null});
assert.equal(requests.length,1);const system=requests[0].messages.find(m=>m.role==='system').content;
assert(system.includes('13#11')&&system.includes('Je préfère les explications courtes.'));
assert(requests[0].messages.every(m=>Object.keys(m).every(k=>['role','content'].includes(k))));
const fresh=await sendCopilotMessage({message:'Comment travailler mon oreille ?',messages:[],context:null});assert(fresh.ok);
assert(!requests.at(-1).messages[0].content.includes('Mémoire vérifiable de cet échange'),'Pas de session implicite d’une autre conversation');
assert(requests.at(-1).messages[0].content.includes('Préférences retenues entre les conversations'));
await updatePersonalMemory({id,remove:true});assert(!(await loadPersonalMemories()).entries.some(e=>e.id===id));
await memoryCommandAnswer('Oublie tous mes souvenirs');assert.equal((await loadPersonalMemories()).entries.length,0);
assert.equal((await loadHistory('conv_fixture')).messages.length,messages.length);
const memoryPath=`/fixture/PianoJazzChords/PedagogieCopilot/${MEMORY_FILE}`;
store.set(memoryPath,'corrompu');const failed=await memoryCommandAnswer('Retiens que je joue du gospel');assert.match(failed.content,/pas pu/);assert.equal(store.get(memoryPath),'corrompu');
assert.equal(await memoryCommandAnswer('Je préfère ce passage.'),null,'Pas de souvenir personnel implicite');
console.log('✓ Souvenirs personnels : commandes explicites, persistance, dédoublonnage, écritures simultanées, modification/oubli, référence exacte, contexte fournisseur, pas de fausse confirmation sur fichier corrompu');

const relevant=[{role:'user',content:'Je travaille le morceau Ebenezer.'},{role:'assistant',content:'Nous garderons la mélodie d’Ebenezer.'},...Array.from({length:60},(_,i)=>({role:i%2?'assistant':'user',content:`Tour ${i}`}))];
const retrieved=rememberedMessages(relevant,'Reprenons Ebenezer.');assert(retrieved.some(m=>m.content.includes('Ebenezer')));assert(retrieved.length<=28);assert.equal(retrieved.at(-1).content,'Tour 59');
console.log('✓ Conversations longues : derniers échanges et rappels pertinents, sans supprimer l’historique complet');

window.electronAPI.ai.chatCompletion=async()=>({ok:true,status:200,text:JSON.stringify({choices:[{finish_reason:'stop',message:{role:'assistant',content:'Ce F#7 peut préparer une arrivée sur Si.',tool_calls:[{id:'bad-audio',type:'function',function:{name:'play_progression',arguments:JSON.stringify({chords:['F#7','Bm']})}}]}}]})});
const theory=await sendCopilotMessage({message:'Pourquoi tu joue un F#7 ?',messages,context:null});
assert(theory.ok);assert.match(theory.content,/F#7/);assert(!theory.toolResult.example&&!theory.autoplay);
assert(!/envoie ta prise/.test(theory.content));
console.log('✓ Un outil audio proposé par le modèle ne remplace plus une explication par une demande de prise');
