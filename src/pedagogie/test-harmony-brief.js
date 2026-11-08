import assert from 'node:assert/strict';
import fs from 'node:fs';
import {sendCopilotMessage} from './copilot-client.js';
import {harmonyBriefLines} from './harmony-brief.js';
import {answerActions} from './copilot-tab.js';
import {buildConversationMemory,conversationMemoryContext} from './copilot-memory.js';
import {notePairs,applyTakeEdit} from './take-edit.js';
const source={...JSON.parse(fs.readFileSync(new URL('./fixtures/copilot-session010.json',import.meta.url))),key:''};
const original=JSON.stringify(source);let calls=0;const fetch=globalThis.fetch;
globalThis.fetch=async()=>{calls++;throw Error('Aucune inférence autorisée');};
function conversation(take=source){
 const history=[];
 return {history,async turn(message){
  const response=await sendCopilotMessage({message,messages:history,context:history.length?{type:'autonomous'}:{type:'session',playing:{session:take}}});
  assert(response.ok);history.push({role:'user',content:message,...(history.length?{}:{take})},{role:'assistant',...response});
  return response;
 }};
}
const pending=(r,stage)=>{assert.equal(r.toolResult.harmonyBrief.status,'pending');assert.equal(r.toolResult.harmonyBrief.stage,stage);assert(!r.toolResult.variants);assert(!r.toolResult.example);assert(!r.autoplay);};
try{
 const c=conversation();let r=await c.turn('Harmonise ma mélodie.');pending(r,'style');
 const actions=answerActions({role:'assistant',...r},{last:true,source:'session'});
 assert.deepEqual(actions,r.suggestedActions);assert(!actions.some(a=>/version enrichie|autre proposition/.test(a.message)));
 assert.deepEqual(answerActions({role:'assistant',...r},{last:false}),[],'Les anciens choix ne restent pas des commandes actives');
 r=await c.turn('Je veux une version salsa.');pending(r,'style-scope');assert.match(r.content,/ne sais pas encore/);assert.equal(r.toolResult.harmonyBrief.requestedStyle.id,'salsa');
 r=await c.turn('Des couleurs CCM.');pending(r,'melody');assert(r.toolResult.harmonyBriefPreview);
 r=await c.turn('Il y a aussi des notes d’accompagnement.');pending(r,'melody');assert.match(r.content,/pas.*sélection fiable/);assert.doesNotMatch(r.content,/réenregistre|recommence ta prise/);
 const replay=await c.turn('Rejoue mon jeu.');assert(replay.toolResult.example?.events?.length);assert(!replay.toolResult.variants);
 r=await c.turn('Oui, toutes ces notes sont ma mélodie.');pending(r,'progression');
 // L'historique sur disque est du JSON : le tour reprend après réouverture,
 // sans variable globale ni remise à zéro des choix précédents.
 const reopened=JSON.parse(JSON.stringify(c.history));c.history.splice(0,c.history.length,...reopened);
 r=await c.turn('Je ne connais pas la progression, propose un parcours.');pending(r,'arrivals');
 assert.equal(r.toolResult.harmonyBrief.progressionOrigin,'proposal');assert.match(r.content,/pas une progression détectée/);
 assert(r.toolResult.harmonyBrief.arrivals.length>=3);assert(harmonyBriefLines(r.toolResult.harmonyBrief).length>4);
 assert(r.content.split('\n').filter(line=>/^\d+:/.test(line)).length<=4,'Question courte, le placement complet se déplie séparément');
 const before=JSON.stringify(r.toolResult.harmonyBrief.arrivals);
 const alternative=await sendCopilotMessage({message:'Propose un autre parcours harmonique.',messages:JSON.parse(JSON.stringify(c.history)),context:{type:'autonomous'}});
 pending(alternative,'arrivals');
 if(/pas trouvé d’autre/.test(alternative.content))assert.equal(JSON.stringify(alternative.toolResult.harmonyBrief.arrivals),before);
 else assert.notDeepEqual(alternative.toolResult.harmonyBrief.degrees,r.toolResult.harmonyBrief.degrees,'Une autre proposition change réellement de parcours');
 r=await c.turn('5 à 9:59');pending(r,'arrivals');assert.match(r.content,/ne retrouve pas/);assert.equal(JSON.stringify(r.toolResult.harmonyBrief.arrivals),before);
 r=await c.turn('4 à 0:02,7 ; 6 à 9:59');pending(r,'arrivals');assert.equal(JSON.stringify(r.toolResult.harmonyBrief.arrivals),before,'Une correction partiellement invalide ne change aucun appui');
 // On peut changer le degré à un appui, et pas seulement déplacer un autre
 // appui du même degré : nécessaire pour une fin qui varie.
 r=await c.turn('La mineur à 0:21,7');pending(r,'arrivals');
 assert.equal(r.toolResult.harmonyBrief.arrivals.find(a=>a.at===21.733).degree,6);
 assert(r.toolResult.harmonyBrief.planning?.correctedByUser);
 assert(r.toolResult.harmonyBrief.planning.evidence.every(e=>r.toolResult.harmonyBrief.arrivals.some(a=>a.at===e.at&&a.degree===e.degree)),'Aucune ancienne preuve de degré après une correction');
 // Ajouter un changement absent puis l'enlever ne supprime aucune note de
 // la prise. Le placement revient à celui d'avant cette édition.
 const corrected=JSON.stringify(r.toolResult.harmonyBrief.arrivals);
 r=await c.turn('Ajoute un appui Sol à 0:27,7');pending(r,'arrivals');assert(r.toolResult.harmonyBrief.arrivals.some(a=>a.at===27.696&&a.degree===5));
 r=await c.turn('Retire l’appui à 0:27,7');pending(r,'arrivals');assert.equal(JSON.stringify(r.toolResult.harmonyBrief.arrivals),corrected);
 const memory=buildConversationMemory(c.history,{take:source});assert.equal(memory.harmonyBrief.style,'ccm');assert(memory.harmonyBrief.melodyConfirmed);
 assert.match(conversationMemoryContext(memory),/parcours proposé reste une possibilité/);
 r=await c.turn('Ces appuis me conviennent, fais-moi entendre cette harmonisation.');
 assert.equal(r.toolResult.harmonyBrief.status,'ready');assert(r.toolResult.variants?.length);assert(r.autoplay);
 const variant=r.toolResult.variants[0],changed=applyTakeEdit(source,variant.advice.edit);assert(changed);
 assert.deepEqual(variant.arrivals.map(a=>[a.at,a.degree]),r.toolResult.harmonyBrief.arrivals.map(a=>[a.at,a.degree]));
 for(const p of notePairs(source.events))assert(notePairs(changed.events).some(q=>q.event.note===p.event.note&&q.event.time===p.event.time&&q.end===p.end));
 assert(answerActions({role:'assistant',...r},{last:true,source:'session'}).some(a=>/guidage/.test(a.message)));
 const choices=JSON.stringify(r.toolResult.harmonyBrief.arrivals);
 r=await c.turn('Reprendre le guidage de cette harmonisation.');pending(r,'review');
 r=await c.turn('Changer le style de cette harmonisation.');pending(r,'style');
 r=await c.turn('Des couleurs jazz.');pending(r,'arrivals');assert.equal(JSON.stringify(r.toolResult.harmonyBrief.arrivals),choices);
 r=await c.turn('Ces appuis me conviennent, fais-moi entendre cette harmonisation.');
 assert(r.toolResult.variants?.length);assert.equal(r.toolResult.variants[0].colorProfile,'jazz');assert.equal(r.toolResult.harmonyBrief.style,'jazz');
 r=await c.turn('Reprendre le guidage de cette harmonisation.');pending(r,'review');
 r=await c.turn('Changer la progression de cette harmonisation.');pending(r,'progression');
 r=await c.turn('Ma progression : Fa → Sol → Mi mineur → La mineur');pending(r,'arrivals');assert.deepEqual(r.toolResult.harmonyBrief.degrees,[4,5,3,6]);
 r=await c.turn('Annuler le guidage de cette harmonisation.');assert.equal(r.toolResult.harmonyBrief.status,'cancelled');assert(!r.toolResult.variants);
 // Une nouvelle prise ou une nouvelle conversation n'hérite pas des choix.
 const different={...source,events:source.events.map(e=>({...e,...(e.note!=null?{note:e.note+2}:{})}))};
 r=await sendCopilotMessage({message:'Harmonise ma mélodie.',messages:c.history,context:{type:'session',playing:{session:different}}});pending(r,'style');assert(!r.toolResult.harmonyBrief.degrees);
 for(const [shift,key]of [[1,'Ré♭ majeur'],[2,'Ré majeur'],[5,'Fa majeur']]){
  const take={...source,key,events:source.events.map(e=>({...e,...(e.note!=null?{note:e.note+shift}:{})}))};
  const d=conversation(take);pending(await d.turn('Harmonise ma mélodie en couleurs CCM sur 4-5-3-6.'),'melody');
  pending(await d.turn('Oui, toutes ces notes sont ma mélodie.'),'arrivals');
  const done=await d.turn('Ces appuis me conviennent, fais-moi entendre cette harmonisation.');
  assert(done.toolResult.variants?.length,key);assert.equal(done.toolResult.variants[0].progression.key.rootPc,shift);
 }
 assert.equal(JSON.stringify(source),original);assert.equal(calls,0);
 console.log('✓ Guidage sans fournisseur : styles limités, rôle de la mélodie, parcours proposé et non détecté, appuis corrigés et respectés, source intacte, réouverture/mémoire, révision sans répétition, annulation, nouvelle prise et transpositions dont Ré♭.');
}finally{globalThis.fetch=fetch;}
