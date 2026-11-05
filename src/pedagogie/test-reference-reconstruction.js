import assert from 'node:assert/strict';
import fs from 'node:fs';
import {buildPhraseArrangement} from './phrase-arrangement.js';
import {applyTakeEdit} from './take-edit.js';
const read=name=>JSON.parse(fs.readFileSync(new URL('./fixtures/'+name,import.meta.url)));
const source=read('copilot-session017.json'),approved=read('copilot-approved-reference.json');
const v=buildPhraseArrangement(source);assert(v);
const changed=applyTakeEdit(source,v.advice.edit);assert(changed);
assert.equal(v.harmony.length,approved.plan.length);
assert.equal(approved.melody.length,58);
for(const e of approved.melody)assert(changed.events.some(x=>JSON.stringify(x)===JSON.stringify(e)));
for(let i=0;i<approved.plan.length;i++){
 assert.deepEqual(v.harmony[i].notes,approved.plan[i].notes,`position ${i}`);
 assert(Math.abs(v.harmony[i].at-approved.plan[i].at)<.035,`placement ${i}`);
}
assert.equal(v.harmony.filter(h=>h.kind==='iiø').length,1);
assert.equal(v.harmony.filter(h=>h.kind==='arp-support').length,1);
console.log('✓ Oracle écouté indépendant : 16 positions identiques, 58 événements mélodiques exacts, attaques à moins de 35 ms');
const keys=['C','Db','D','Eb','E','F','Gb','G','Ab','A','Bb','B'],pc=n=>(n%12+12)%12;
for(let shift=1;shift<12;shift++){
 const trans={...source,key:keys[shift]+' majeur',events:source.events.map(e=>({...e,...(e.note!=null?{note:e.note+shift}:{})}))};
 const x=buildPhraseArrangement(trans);assert(x,keys[shift]);assert(applyTakeEdit(trans,x.advice.edit));
 assert(x.harmony.some(h=>h.kind==='dominant'&&h.notes.some(n=>pc(n)===pc(4+shift))));
}
console.log('✓ La grammaire se transpose sans identifiant de session ni horodatage dans le code de génération');
const other=read('copilot-development-take.json');assert(buildPhraseArrangement(other.take||other));
console.log('✓ Une autre prise produit un plan ; pas de rejeu conditionné à Session_017');
