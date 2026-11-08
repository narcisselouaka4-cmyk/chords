import assert from 'node:assert/strict';
import fs from 'node:fs';
import {harmonyBriefTurn} from './harmony-brief.js';
import {harmonyStyleFamilies,harmonyColors,findHarmonyColors} from './harmony-preferences.js';
import {sendCopilotMessage} from './copilot-client.js';
import {buildConversationMemory,conversationMemoryContext} from './copilot-memory.js';
import {applyTakeEdit,notePairs} from './take-edit.js';
const take=JSON.parse(fs.readFileSync(new URL('./fixtures/copilot-session010.json',import.meta.url)));
const context={type:'session',playing:{passage:take,session:take}};
function local(){
 const messages=[];
 return {messages,turn(message){
  const r=harmonyBriefTurn({message,messages,context});assert(r?.reply,message);
  messages.push({role:'user',content:message},{role:'assistant',...r.reply});return r.reply;
 }};
}
const stage=(r,s)=>{assert.equal(r.toolResult.harmonyBrief.stage,s);assert(!r.autoplay);assert(!r.toolResult.variants);};
const initial='Harmonise ma mélodie en Do majeur sur 4-5-3-6. Je ne joue que des notes.';
let tested=0;
// Chaque choix réellement affiché doit être accessible et classé honnêtement.
for(const family of harmonyStyleFamilies)for(const style of family.styles){
 const c=local();let r=c.turn(initial);stage(r,'style');
 const group=r.suggestedActions.find(a=>a.label===family.label);assert(group);
 r=c.turn(group.message);stage(r,'style');
 const item=r.suggestedActions.find(a=>a.label===style.label);assert(item);
 r=c.turn(item.message);stage(r,style.profile?'color':'style-scope');
 assert.equal(r.toolResult.harmonyBrief.requestedStyle.id,style.id);
 if(!style.profile){assert.match(r.content,/pas encore|pas une version/);assert(!r.toolResult.harmonyBrief.style);}
 tested++;
}
assert(tested>50);assert(harmonyColors.length>10);
for(const color of harmonyColors){
 const d=local();d.turn(initial);d.turn('Voir les styles : gospel');d.turn('Mon style : Gospel doux / worship');
 const r=d.turn(`Ma couleur : ${color.label}`);stage(r,color.detail?'arrivals':'color-scope');
 assert.equal(r.toolResult.harmonyBrief.requestedColor.ids[0],color.id);
}
stage(local().turn(initial+' En gospel.'),'style');
assert.deepEqual(findHarmonyColors('chaleureux mais pas de sombre').map(c=>c.id),['warm']);
const c=local();let r=c.turn(initial);
r=c.turn('Voir les styles : gospel');assert.match(r.content,/louange contemporaine/);assert(r.suggestedActions.some(a=>/Gospel traditionnel/.test(a.label)));
r=c.turn('Mon style : Gospel doux / worship');stage(r,'color');
r=c.turn('chaleureux et aéré');stage(r,'arrivals');assert.equal(r.toolResult.harmonyBrief.style,'ccm');assert.deepEqual(r.toolResult.harmonyBrief.requestedColor.ids,['warm','airy']);
// Artiste, morceau ou mélange hors catalogue : garder la demande exacte, ne
// pas inventer un rendu, permettre l'annulation sans lancer de génération.
const free=local();free.turn(initial);free.turn('Je veux écrire un autre style.');
const text='Une fusion maloya et gospel, dans l’esprit du morceau de mon groupe';
r=free.turn(text);stage(r,'style-scope');assert.equal(r.toolResult.harmonyBrief.requestedStyle.text,text);
free.messages.splice(0,free.messages.length,...JSON.parse(JSON.stringify(free.messages)));
r=free.turn('Essayer seulement la palette jazz.');stage(r,'color');assert.equal(r.toolResult.harmonyBrief.requestedStyle.text,text);assert.equal(r.toolResult.harmonyBrief.styleScope,'alternative');
r=free.turn('Voir les autres nuances.');assert(r.suggestedActions.some(a=>a.label==='Mélancolique'));
r=free.turn('Ma couleur : mystérieux et nostalgique');stage(r,'color-scope');
assert.equal(r.toolResult.harmonyBrief.requestedColor.text,'Ma couleur : mystérieux et nostalgique');
r=free.turn('Essayer seulement la palette chaleureuse.');stage(r,'arrivals');assert.match(r.content,/style demandé n’est pas reproduit/);
const memory=buildConversationMemory(free.messages,{take});assert.equal(memory.harmonyBrief.requestedStyle.text,text);assert.equal(memory.harmonyBrief.colorScope,'alternative');assert.match(conversationMemoryContext(memory),/maloya/);
r=free.turn('Annuler le guidage de cette harmonisation.');assert.equal(r.toolResult.harmonyBrief.status,'cancelled');
// Ne pas effacer une salsa demandée parce que le texte cite aussi le jazz.
stage(local().turn(initial+' Je veux une salsa avec des couleurs jazz.'),'style-scope');
// Vérification du parcours normal du client, pas uniquement du catalogue :
// Sobriété change les événements (aucun passage), mélodie d'origine intacte.
const history=[];const saved=globalThis.fetch;let calls=0;
globalThis.fetch=async()=>{calls++;throw Error('Pas de fournisseur dans ce test');};
async function turn(message){
 const response=await sendCopilotMessage({message,messages:history,context:history.length?{type:'autonomous'}:{type:'session',playing:{session:take}}});
 assert(response.ok);history.push({role:'user',content:message,...(history.length?{}:{take})},{role:'assistant',...response});return response;
}
try{
 await turn(initial);await turn('Voir les styles : gospel');await turn('Mon style : Gospel doux / worship');
 r=await turn('Ma couleur : Sobre');stage(r,'arrivals');assert.equal(r.toolResult.harmonyBrief.colorPassages,false);
 r=await turn('Ces appuis me conviennent, fais-moi entendre cette harmonisation.');assert(r.toolResult.variants?.length);
 assert.match(r.toolResult.harmonicRequest,/Sans accords de passage/);
 const v=r.toolResult.variants[0];assert(!v.harmony.some(h=>h.kind==='dominant'||h.kind==='leading-tone'));
 const changed=applyTakeEdit(take,v.advice.edit);for(const p of notePairs(take.events))assert(notePairs(changed.events).some(q=>q.event.note===p.event.note&&q.event.time===p.event.time&&q.end===p.end));
 const before=JSON.stringify(r.toolResult.harmonyBrief.arrivals);
 await turn('Reprendre le guidage de cette harmonisation.');r=await turn('Changer la couleur de cette harmonisation.');stage(r,'color');assert.equal(r.toolResult.harmonyBrief.requestedStyle.id,'worship');
 r=await turn('Ma couleur : Chaleureux');stage(r,'arrivals');assert.equal(JSON.stringify(r.toolResult.harmonyBrief.arrivals),before);assert.equal(r.toolResult.harmonyBrief.colorPassages,undefined);
 // Un style indisponible ne disparaît pas à la génération et n'est pas
 // présenté comme réalisé dans la réponse finale.
 await turn('Ces appuis me conviennent, fais-moi entendre cette harmonisation.');
 await turn('Reprendre le guidage de cette harmonisation.');await turn('Changer le style de cette harmonisation.');
 r=await turn('Je veux une version salsa.');stage(r,'style-scope');
 await turn('Essayer seulement la palette jazz.');r=await turn('Garder la couleur de ce style.');stage(r,'arrivals');
 r=await turn('Ces appuis me conviennent, fais-moi entendre cette harmonisation.');assert(r.toolResult.variants?.length);assert.equal(r.toolResult.variants[0].colorProfile,'jazz');assert.equal(r.toolResult.harmonyBrief.requestedStyle.id,'salsa');assert.match(r.content,/souhait « Salsa » est conservé/);assert.match(r.content,/seulement la palette jazz/);
 assert.equal(calls,0);
 console.log(`✓ ${tested} styles accessibles dans 10 familles, 12 nuances, Gospel visible, texte libre/reprise/mémoire, alternatives explicites, génération sobre réelle sans fournisseur et mélodie intacte.`);
}finally{globalThis.fetch=saved;}
