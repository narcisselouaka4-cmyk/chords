import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {sendCopilotMessage} from './copilot-client.js';
import {buildPhraseVariants} from './phrase-variants.js';
import {arrangementFrames} from './phrase-arrangement.js';
import {applyTakeEdit,notePairs} from './take-edit.js';
import {playingHarmonyFacts,sourceKeyConflict} from './playing-harmony-facts.js';
import {explicitPlaybackRequest} from './proposal-explanation.js';
const take=JSON.parse(readFileSync(new URL('./fixtures/copilot-session016.json',import.meta.url)));
const before=JSON.stringify(take),frames=arrangementFrames(take);
// Le nom de tonalité est celui réellement transmis par l'ancien échange.
assert.equal(take.key,'Sib majeur');
const variants=buildPhraseVariants(take,{message:'améliore mon jeu'});
assert(variants.length,'La session réelle doit recevoir une proposition substantielle');
for(const v of variants){
  assert(v.rewrite.ratio>=.8);assert(v.rewrite.topPreserved);
  const changed=applyTakeEdit(take,v.advice.edit);assert(changed);
  const pairs=notePairs(changed.events);
  for(const f of frames){
    assert(changed.events.some(e=>JSON.stringify(e)===JSON.stringify(f.top.event)));
    assert(!pairs.some(p=>p.event.note>f.topMidi&&p.event.time<f.top.end&&p.end>f.top.event.time
      &&!take.events.some(e=>JSON.stringify(e)===JSON.stringify(p.event))));
    if(/dim/.test(f.chord.quality))assert(v.harmony.filter(h=>Math.abs(h.at-f.at)<.001).every(h=>/dim/.test(h.chord)), 'Une tension diminuée ne devient pas un majeur par défaut');
  }
}
assert.equal(JSON.stringify(take),before);
assert(sourceKeyConflict({rootPc:10,minor:false},[{rootPc:10,quality:'madd9'}]));
assert(!sourceKeyConflict({rootPc:10,minor:true},[{rootPc:10,quality:'madd9'}]));
// Une consigne présente explicite reste une contrainte, contrairement au tag de session.
assert(!buildPhraseVariants(take,{message:'En Sib majeur, améliore mon jeu'}).length);
const facts=playingHarmonyFacts(take).join('\n');
assert.match(facts,/Bbmadd9 : quinte juste Fa .*13e naturelle Sol/);
assert.match(facts,/Eb : quinte juste Si♭ .*13e naturelle Do/);
assert(explicitPlaybackRequest('toi tu la jouerais comment ?'));
assert(!explicitPlaybackRequest('pourquoi tu joues cet accord ?'));
const originalFetch=globalThis.fetch;let calls=0;
globalThis.fetch=async()=>{calls++;throw new Error('Une proposition personnelle ne dépend pas du fournisseur');};
try{
  const messages=[{role:'user',content:'Que penses-tu de ma session ?',take},
    {role:'assistant',content:'Analyse précédente'},
    {role:'assistant',isError:true,content:'Je n’ai pas reçu de réponse utilisable.'}];
  for(const message of ['toi tu la jouerais comment ?','améliore mon jeu','Fais-moi entendre une version enrichie de mon jeu.']){
    const reply=await sendCopilotMessage({message,messages,context:{type:'autonomous'}});
    assert(reply.ok);assert(reply.toolResult.variants?.length,message);
    assert(reply.toolResult.example?.events?.length,message);
    assert(reply.toolResult.variants.every(v=>v.rewrite.ratio>=.8));
    if(message!=='améliore mon jeu')assert(reply.autoplay);
    assert.doesNotMatch(reply.content,/pas trouvé|pas reçu|compatible avec cette prise/);
    const saved=JSON.parse(JSON.stringify(reply));assert(saved.toolResult.originalTake.events.length===250);
  }
  const fromSession=await sendCopilotMessage({message:'améliore mon jeu',context:{type:'session',playing:{session:take}}});
  assert(fromSession.toolResult.variants?.length);
  assert.equal(calls,0);
}finally{globalThis.fetch=originalFetch;}
// L'analyse textuelle reçoit les vrais intervalles, même si le modèle est simulé.
const savedWindow=globalThis.window,savedStorage=globalThis.localStorage;
let payload;
try{
  globalThis.localStorage={getItem:()=>JSON.stringify({apiKey:'fixture-only',baseUrl:'http://fixture.invalid',model:'fixture'})};
  globalThis.window={electronAPI:{ai:{chatCompletion:async(_url,_key,body)=>{
    payload=body;
    return {ok:true,status:200,text:JSON.stringify({choices:[{finish_reason:'stop',message:{role:'assistant',content:'Ta mélodie reste le repère pour choisir les couleurs.'}}]})};
  }}}};
  const reply=await sendCopilotMessage({message:'Que penses-tu de ma session ?',review:true,
    context:{type:'session',key:take.key,playing:{session:take}}});
  assert(reply.ok);assert(payload);
  assert.match(payload.messages[0].content,/Bbmadd9 : quinte juste Fa .*13e naturelle Sol/);
  assert.match(payload.messages[0].content,/mode de la tonalité indiquée.*contredit/);
}finally{
  if(savedWindow===undefined)delete globalThis.window;else globalThis.window=savedWindow;
  if(savedStorage===undefined)delete globalThis.localStorage;else globalThis.localStorage=savedStorage;
}
assert.equal(JSON.stringify(take),before);
console.log(`✓ Session_016 : ${variants[0].rewrite.transformed}/${frames.length} accords travaillés, dessus préservés, trois demandes et source session/historique sans fournisseur.`);
