import assert from 'node:assert/strict';
import fs from 'node:fs';
import {buildPhraseArrangement} from './phrase-arrangement.js';
import {applyTakeEdit} from './take-edit.js';
import {PROPOSAL_POLICY} from './proposal-policy.js';
const read=name=>JSON.parse(fs.readFileSync(new URL('./fixtures/'+name,import.meta.url)));
const source=read('copilot-session017.json'),approved=read('copilot-approved-reference.json');
const v=buildPhraseArrangement(source);assert(v);
const changed=applyTakeEdit(source,v.advice.edit);assert(changed);
// Le soutien d'arpège autrefois réattaqué devient une tenue continue. Les
// destinations et la majorité des positions de l'oracle restent les repères.
assert.equal(v.harmony.length,approved.plan.length-1,'Une tenue continue remplace la réattaque du soutien d’arpège');
assert.equal(approved.melody.length,58);
for(const e of approved.melody)assert(changed.events.some(x=>JSON.stringify(x)===JSON.stringify(e)));
let retained=0;
for(const h of v.harmony){
 const old=approved.plan.find(p=>Math.abs(h.at-p.at)<.035);
 assert(old,`destination ${h.at}`);
 if(JSON.stringify(h.notes)===JSON.stringify(old.notes))retained++;
}
assert(retained>=Math.ceil(approved.plan.length*.7),'La correction de jouabilité garde la majorité de la référence');
assert.equal(v.harmony.filter(h=>h.kind==='iiø').length,1);
assert.equal(v.harmony.filter(h=>h.kind==='arp-support').length,0);
console.log('✓ Oracle écouté archivé : majorité des positions conservée, corrections de jouabilité/couleurs autorisées, 58 événements mélodiques exacts');
const keys=['C','Db','D','Eb','E','F','Gb','G','Ab','A','Bb','B'],pc=n=>(n%12+12)%12;
for(let shift=1;shift<12;shift++){
 const trans={...source,key:keys[shift]+' majeur',events:source.events.map(e=>({...e,...(e.note!=null?{note:e.note+shift}:{})}))};
 const x=buildPhraseArrangement(trans);assert(x,keys[shift]);assert(applyTakeEdit(trans,x.advice.edit));
 assert(x.harmony.some(h=>h.kind==='dominant'&&h.notes.some(n=>pc(n)===pc(4+shift))));
}
console.log('✓ La grammaire se transpose sans identifiant de session ni horodatage dans le code de génération');
const other=read('copilot-development-take.json');assert(buildPhraseArrangement(other.take||other));
console.log('✓ Une autre prise produit un plan ; pas de rejeu conditionné à Session_017');

const {sendCopilotMessage}=await import('./copilot-client.js');
const {harmonicRewriteCoverage}=await import('./phrase-variants.js');
const {refreshPlayingResult}=await import('./playing-advice.js');
const {variantMessages}=await import('./copilot-tab.js');
for(const message of ['Fais-moi entendre une proposition à partir de mon jeu.','Fais-moi des propositions','Transforme tous mes accords en gardant ma top note']){
 // Nouvelle conversation : pas de référence ni de proposition dans l'historique.
 const response=await sendCopilotMessage({message,messages:[],context:{type:'session',playing:{session:source}}});
 const variants=response.toolResult.variants;assert.equal(variants?.length,1,message);
 const main=variants.find(v=>v.id==='arrangement');assert(main&&main.advice.version===8);
 assert.deepEqual(main.harmony.map(h=>h.notes),v.harmony.map(h=>h.notes),`${message} : même génération corrigée dans le parcours normal`);
 for(const x of variants){const coverage=harmonicRewriteCoverage(source,x);assert(coverage.topPreserved&&coverage.ratio>=.8);}
 assert.equal(new Set(variants.map(v=>JSON.stringify(v.example.events))).size,variants.length);
 const persisted=JSON.parse(JSON.stringify(response.toolResult));assert(refreshPlayingResult(persisted));
 assert.equal(variantMessages({role:'assistant',toolResult:persisted}).length,variants.length);
}
console.log('✓ Nouvelle conversation via le client normal : destinations conservées, soutien continu, une version retenue, au moins 80 % des positions transformées, top notes conservées et cartes persistées');
const strong=await sendCopilotMessage({message:'Enrichis mon jeu',messages:[],context:{type:'session',playing:{session:source}}});
const old={...strong.toolResult,proposalPolicy:undefined};
const follow=await sendCopilotMessage({message:'Fais-moi entendre un exemple',messages:[{role:'assistant',toolResult:old}],context:{type:'session',playing:{session:source}}});
assert.equal(follow.toolResult.proposalPolicy,PROPOSAL_POLICY);
console.log('✓ Une ancienne réponse sans la nouvelle politique est recalculée, pas recyclée silencieusement');

for(const file of ['copilot-development-take.json','copilot-approved-links.json','copilot-arpeggiated-take.json']){
 const data=read(file),take=data.take||data,before=JSON.stringify(take);
 const r=await sendCopilotMessage({message:'Fais-moi des propositions',messages:[],context:{type:'session',playing:{session:take}}});
 assert(r.toolResult.variants?.length,file);
 for(const x of r.toolResult.variants){const c=harmonicRewriteCoverage(take,x);assert(c.ratio>=.8&&c.topPreserved,file);}
 assert.equal(JSON.stringify(take),before);
}
console.log('✓ Trois autres prises dans le client normal : majorité retravaillée, top notes exactes, originaux intacts');
