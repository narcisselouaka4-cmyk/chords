import assert from 'node:assert/strict';
import {readableTeachingText} from './teaching-language.js';
import {requestedPersonalStyle} from './style-capabilities.js';
import {sendCopilotMessage} from './copilot-client.js';
import {readFileSync} from 'node:fs';
const take=JSON.parse(readFileSync(new URL('./fixtures/copilot-session017.json',import.meta.url)));
const original=JSON.stringify(take);
assert.equal(readableTeachingText('Essaie à 80 BPM. Réécoute le passage à 0:04.'),'Essaie à 80 BPM. Réécoute le passage à 0:04.');
assert.equal(readableTeachingText('L’attaque est décalée de 120 ms. Essaie de jouer les notes ensemble.'),'Essaie de jouer les notes ensemble.');
assert.equal(readableTeachingText('Joue plus doucement (vélocité 52). Garde le tempo à 75 BPM.'),'Joue plus doucement. Garde le tempo à 75 BPM.');
assert.doesNotMatch(readableTeachingText('La vélocité est de 83.'),/vélocité|83/);
for(const q of ['Rejoue ma session en salsa','Fais une version gospel de mon jeu','Et en bossa nova ?','Joue ma prise dans le style jazz'])assert(requestedPersonalStyle(q),q);
for(const q of ['Explique la salsa','Quel style je joue ?','Rejoue ma session en Fa','Fais une version enrichie','Enrichis mon jeu sans salsa'])assert.equal(requestedPersonalStyle(q),null,q);
let calls=0;
const oldFetch=globalThis.fetch;
globalThis.fetch=async()=>{calls++;throw new Error('Aucun fournisseur pour un contrôle de capacité');};
try{
 const generated=await sendCopilotMessage({message:'Fais-moi des propositions',context:{playing:{passage:take}}});
 const messages=[{role:'user',content:'Enrichis mon jeu',take},{role:'assistant',...generated}];
 for(const message of ['Joue ma session en salsa','Fais-moi entendre une version gospel de mon jeu','Et en bossa nova ?']){
  const r=await sendCopilotMessage({message,messages,context:null});
  assert.equal(r.toolResult.styleCapability.status,'unavailable');assert(!r.toolResult.example);assert(!r.autoplay);
  assert.match(r.content,/pas encore/);assert(r.suggestedActions.length);
 }
 const q='Pourquoi le A♭13#11 vers Sol7 ?';
 const simple=await sendCopilotMessage({message:q,messages,context:null});
 assert.match(simple.content,/prépare|préparation/);assert.match(simple.content,/demi-ton/);
 assert(!simple.autoplay);assert(!simple.toolResult.example);
 assert.doesNotMatch(simple.content,/tritonique|vélocité|milliseconde/);
 const detailed=await sendCopilotMessage({message:'Quelle technique de voicing pour le A♭13#11 ?',messages,context:null});
 assert.match(detailed.content,/substitution tritonique/);assert.match(detailed.content,/autre accord prépare/);
 const source=await sendCopilotMessage({message:'De quel morceau vient cette proposition ?',messages,context:null});
 assert.match(source.content,/ne cite pas de morceau/);assert(!source.toolResult.example);
 assert.equal(calls,0);
}finally{globalThis.fetch=oldFetch;}
// Un fournisseur qui ignore la consigne ne fait pas réapparaître ses mesures internes.
const savedWindow=globalThis.window,savedStorage=globalThis.localStorage;
try{
 let payload;
 globalThis.localStorage={getItem:()=>JSON.stringify({apiKey:'fixture-only',baseUrl:'http://fixture.invalid',model:'fixture'})};
 globalThis.window={electronAPI:{ai:{chatCompletion:async(_url,_key,body)=>{payload=body;return {ok:true,status:200,text:JSON.stringify({choices:[{message:{role:'assistant',content:'La vélocité est de 80. Essaie de jouer plus doucement, à 70 BPM.'},finish_reason:'stop'}]})};}}}};
 const r=await sendCopilotMessage({message:'Comment améliorer le son de mon accompagnement ?',review:true,context:{playing:{passage:take}}});
 assert.equal(r.content,'Essaie de jouer plus doucement, à 70 BPM.');
 assert.match(payload.messages[0].content,/Ne cite un morceau/);
}finally{if(savedWindow===undefined)delete globalThis.window;else globalThis.window=savedWindow;if(savedStorage===undefined)delete globalThis.localStorage;else globalThis.localStorage=savedStorage;}
assert.equal(JSON.stringify(take),original);
console.log('✓ Pédagogie : raison musicale, détails progressifs, aucune référence inventée, chiffres utiles gardés, mesures internes retirées ; styles indisponibles sans fausse démonstration ni réutilisation d’un ancien exemple.');
