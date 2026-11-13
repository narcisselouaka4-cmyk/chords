import assert from 'node:assert/strict';
import fs from 'node:fs';
import {sendCopilotMessage} from './copilot-client.js';
import {melodySource,buildMelodyAccompaniment} from './melody-accompaniment.js';
import {applyTakeEdit,notePairs} from './take-edit.js';
import {handDistribution,voicedQuality} from './piano-voicing.js';
import {proposalChordGrid,activeChordColumn} from './proposal-chord-grid.js';
const take=JSON.parse(fs.readFileSync(new URL('./fixtures/copilot-session010.json',import.meta.url)));
const before=JSON.stringify(take),pairs=notePairs(take.events);assert.equal(pairs.length,57);assert(melodySource(take));
const v=buildMelodyAccompaniment(take);assert(v);assert(v.harmony.length>=15);
const changed=applyTakeEdit(take,v.advice.edit);assert(changed);
for(const p of pairs)for(const i of [p.on,p.off])assert(changed.events.some(e=>JSON.stringify(e)===JSON.stringify(take.events[i])));
const added=notePairs(changed.events).filter(p=>!take.events.some(e=>JSON.stringify(e)===JSON.stringify(p.event)));
for(const p of added){
 const line=pairs.filter(q=>q.event.time<p.end&&q.end>p.event.time);
 assert(line.every(q=>q.event.note>p.event.note));
}
for(const h of v.harmony)assert.equal(voicedQuality(h.notes,h.rootPc,h.quality),h.quality);
for(const at of new Set(changed.events.map(e=>e.time+.0001))){
 const ns=notePairs(changed.events).filter(p=>p.event.time<=at&&p.end>at).map(p=>p.event.note);
 assert(!ns.length||handDistribution(ns));
}
const grid=proposalChordGrid({originalTake:take,variants:[v]});assert.equal(grid.rows[0].title,'Ta mélodie');assert.equal(grid.columns[0].cells[0].name,'F');
let calls=0;const oldFetch=globalThis.fetch;globalThis.fetch=async()=>{calls++;throw Error('Pas de fournisseur pour ces demandes personnelles');};
try{
 const context={type:'session',playing:{session:take}};
 const review=await sendCopilotMessage({message:'Que penses-tu de ma session ?',review:true,context});
 assert(review.ok);assert.match(review.content,/surtout une mélodie/);assert.doesNotMatch(review.content,/locrien|0,52|drop|ajoute la 9/);
 const messages=[{role:'user',content:'Que penses-tu de ma session ?',take},{role:'assistant',...review}];
 for(const message of ['Fais-moi entendre une version enrichie de mon jeu.','fait comme tu veux','Fais-moi entendre un accompagnement sous ma mélodie.']){
  let r=await sendCopilotMessage({message,messages,context:{type:'autonomous'}});
  assert.equal(r.toolResult.harmonyBrief?.status,'pending','Sans grille connue, préparer les choix plutôt que générer au hasard');
  const preparation=[...messages,{role:'user',content:message},{role:'assistant',...r}];
  for(const answer of ['Choisis une couleur pour moi.','Oui, toutes ces notes sont ma mélodie.','Je ne connais pas la progression, propose un parcours.','Ces appuis me conviennent, fais-moi entendre cette harmonisation.']){
   r=await sendCopilotMessage({message:answer,messages:preparation,context:{type:'autonomous'}});
   preparation.push({role:'user',content:answer},{role:'assistant',...r});
  }
  assert(r.toolResult.example?.events?.length,message);assert(r.toolResult.variants[0].advice.goal==='accompany');
  assert.match(r.content,/accords proposés/);assert.doesNotMatch(r.content,/enregistre|compatible avec cette prise|pas reçu/);
  if(message!=='fait comme tu veux')assert(r.autoplay);
 }
 const drop=await sendCopilotMessage({message:'Écoute le Gadd9 avec le voicing drop 2',messages,context:{type:'autonomous'}});
 assert(drop.toolResult.example);const h=drop.toolResult.variants[0].harmony[0];
 assert.equal(h.technique,'drop2');assert.equal(h.rootPc,7);assert.equal(h.quality,'add9');assert.equal(h.at,11.875);
 const targetedGrid=proposalChordGrid(drop.toolResult);assert.equal(activeChordColumn(targetedGrid,1,13,33.867),-1,'La grille cesse de montrer l’accord ajouté après le passage ciblé');
 // Retrouver la position serrée : remonter la voix abaissée, sans inventer une technique.
 assert(h.notes.some((n,i)=>{const close=h.notes.map((m,j)=>j===i?m+12:m).sort((a,b)=>a-b);return close.at(-1)-close[0]<12&&close.at(-2)===n+12;}));
 // [Claude] — 2026-11-13 — La tournure ne change rien : « en drop 2 » vise aussi l'accord de sa session.
 const phrased=await sendCopilotMessage({message:'Écoute le Gadd9 en drop 2',messages,context:{type:'autonomous'}});
 assert(phrased.toolResult?.example);assert.deepEqual(phrased.toolResult.variants[0].harmony.map(x=>[x.technique,x.rootPc,x.quality,x.at]),drop.toolResult.variants[0].harmony.map(x=>[x.technique,x.rootPc,x.quality,x.at]));
 // Accord absent de sa session, demandé « avec le voicing » : réponse locale honnête.
 const absent=await sendCopilotMessage({message:'Écoute le Dm9 avec le voicing drop 2',messages,context:{type:'autonomous'}});
 assert(!absent.toolResult.example);assert.match(absent.content,/bien ta session/);assert.doesNotMatch(absent.content,/Enregistre ton jeu/);
 // Accord absent, simplement nommé (« le Dm9 en drop 2 ») : règle du 11/11 (39c5e9a), l'accord seul,
 // sans la prendre pour une proposition sur sa prise — ni demande de réenregistrer.
 const named=await sendCopilotMessage({message:'Écoute le Dm9 en drop 2',messages,context:{type:'autonomous'}});
 assert(!named.toolResult?.variants&&!named.toolResult?.originalTake);assert.doesNotMatch(String(named.content||''),/Enregistre ton jeu/);
 assert.equal(calls,0);
}finally{globalThis.fetch=oldFetch;}
assert.equal(buildMelodyAccompaniment({...take,key:'',events:take.events.map((e,i)=>e.note!=null?{...e,note:48+(i*7)%25}:e)}),null);
assert.equal(buildMelodyAccompaniment(take,{message:"J'ai joué n'importe quoi"}),null);
for(const [shift,key] of [[2,'Ré majeur'],[5,'Fa majeur']]){const trans={...take,key,events:take.events.map(e=>e.note!=null?{...e,note:e.note+shift}:e)};assert(buildMelodyAccompaniment(trans),key);}
assert.equal(buildMelodyAccompaniment(take,{message:'Garde ma basse'}),null);
assert.equal(JSON.stringify(take),before);
console.log('✓ Session_010 : 57 notes exactes, accompagnement jouable sous la mélodie, noms vérifiés, grille de repères, relance et vrai drop 2 ciblé sans fournisseur ni demande de réenregistrement.');
