// Écoute reproductible depuis une vraie session, par le client normal de Copilot.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {sendCopilotMessage} from '../src/pedagogie/copilot-client.js';
import {applyTakeEdit} from '../src/pedagogie/take-edit.js';
import {PROPOSAL_POLICY} from '../src/pedagogie/proposal-policy.js';
const [sessionDirectory,output,message,comparison,revisionFile]=process.argv.slice(2);
if(!sessionDirectory||!output||!message)throw Error('Usage : node scripts/copilot-melody-evaluation.mjs DOSSIER_SESSION DOSSIER_NEUF DEMANDE');
if(fs.existsSync(output))throw Error('Choisir un dossier neuf : ne pas remplacer une écoute.');
if(comparison&&!['--compare-development','--guided','--revision'].includes(comparison))throw Error('Option inconnue');
const guided=comparison==='--guided',revise=comparison==='--revision',compareDevelopment=comparison==='--compare-development';
if(revise&&!revisionFile)throw Error('Le mode révision demande un fichier de consignes et un pack antérieur.');
const git=(...args)=>execFileSync('git',args,{encoding:'utf8'}).trim();
if(git('diff','HEAD','--','src/pedagogie','src/practice-exercise.js','src/recorder','scripts/copilot-melody-evaluation.mjs','scripts/copilot-melody-listening.html'))throw Error('Commiter le générateur avant le rendu.');
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const input={};
for(const name of ['session.json','metadata.json','events.json']){
 const file=path.join(sessionDirectory,name);input[name]={sha256:sha(fs.readFileSync(file)),value:JSON.parse(fs.readFileSync(file,'utf8'))};
}
const session=input['session.json'].value,meta=input['metadata.json'].value,events=input['events.json'].value;
const take={name:meta.name||session.name,key:meta.key||session.key||'',duration:Math.max(session.duration,...events.map(e=>e.time)),events};
const source=JSON.stringify(take),oldFetch=globalThis.fetch;let calls=0;
globalThis.fetch=async()=>{calls++;throw Error('Aucun appel réseau autorisé pour cette écoute.');};
let response,alternativeResponse,revision;const dialogue=[];
const alternativeMessage=compareDevelopment?message+' Développe les préparations et les voix intérieures.':null;
try{
 if(revise){
  const instructions=JSON.parse(fs.readFileSync(revisionFile,'utf8'));
  const packBytes=fs.readFileSync(instructions.fromPack),previous=JSON.parse(packBytes);
  if(!previous.dialogue?.length||!Array.isArray(instructions.messages)||!instructions.messages.length||instructions.messages.length>12
   ||JSON.stringify(previous.media[0].take)!==source)throw Error('La révision doit repartir du même jeu et de son dialogue vérifiable.');
  dialogue.push(...previous.dialogue);
  revision={fromPack:instructions.fromPack,fromPackId:previous.packId,fromPackSha256:sha(packBytes),instructions};
  for(const content of instructions.messages){
   if(typeof content!=='string'||content.length>4000)throw Error('Consigne de révision invalide.');
   response=await sendCopilotMessage({message:content,messages:dialogue,context:{type:'autonomous'}});
   dialogue.push({role:'user',content},{role:'assistant',...response});
  }
 }else response=await sendCopilotMessage({message,messages:[],context:{type:'session',playing:{session:take}}});
 if(guided){
  dialogue.push({role:'user',content:message,take},{role:'assistant',...response});
  const answers={style:'Des couleurs CCM.',color:'Garder la couleur de ce style.',melody:'Oui, toutes ces notes sont ma mélodie.',key:'Je ne sais pas, choisis une tonalité à essayer.',progression:'Je ne connais pas la progression, propose un parcours.',arrivals:'Ces appuis me conviennent, fais-moi entendre cette harmonisation.'};
  for(let i=0;i<8&&response.toolResult?.harmonyBrief?.status==='pending';i++){
   const answer=answers[response.toolResult.harmonyBrief.stage];if(!answer)throw Error('Étape sans réponse de test : '+response.toolResult.harmonyBrief.stage);
   response=await sendCopilotMessage({message:answer,messages:dialogue,context:{type:'autonomous'}});
   dialogue.push({role:'user',content:answer},{role:'assistant',...response});
  }
 }
 if(compareDevelopment)alternativeResponse=await sendCopilotMessage({message:alternativeMessage,messages:[],context:{type:'session',playing:{session:take}}});
}finally{globalThis.fetch=oldFetch;}
const variant=response.toolResult?.variants?.[0];
if(!response.ok||variant?.id!=='melody-progression'||calls)throw Error('La sélection normale n’a pas produit la progression demandée.');
if((guided||revise)&&(response.toolResult.harmonyBrief?.planning?.method!=='melody-phrase-search-v1'||response.toolResult.harmonyBrief.progressionOrigin!=='proposal'
 ||JSON.stringify(variant.arrivals.map(a=>[a.at,a.degree]))!==JSON.stringify(response.toolResult.harmonyBrief.arrivals.map(a=>[a.at,a.degree]))))throw Error('Le mode guidé doit produire son propre parcours et en respecter les appuis.');
const changed=applyTakeEdit(take,variant.advice.edit);if(!changed||JSON.stringify(take)!==source)throw Error('Édition invalide ou source modifiée.');
const alternative=alternativeResponse?.toolResult?.variants?.[0];
const developed=alternative&&applyTakeEdit(take,alternative.advice.edit);
if(compareDevelopment&&(!alternativeResponse.ok||!developed||!alternative.development?.length||JSON.stringify(developed.events)===JSON.stringify(changed.events)||calls))throw Error('Le développement normal n’a pas produit de différence vérifiable.');
for(const [name,data] of Object.entries(input))if(sha(fs.readFileSync(path.join(sessionDirectory,name)))!==data.sha256)throw Error('Session modifiée pendant la génération.');
const packId=crypto.randomUUID(),manifest={schema:1,packId,createdAt:new Date().toISOString(),appCommit:git('rev-parse','HEAD'),proposalPolicy:PROPOSAL_POLICY,
 inferenceCalls:calls,sessionId:session.id,inputFilesSha256:Object.fromEntries(Object.entries(input).map(([name,d])=>[name,d.sha256])),message,
 media:[{id:'p01-original',take},{id:'p01-A',take:changed},...(developed?[{id:'p01-B',take:developed}]:[])],response,
 ...(compareDevelopment?{alternativeMessage,alternativeResponse}:{}),...((guided||revise)?{dialogue}: {}),...(revise?{revision}: {})};
const data={schema:1,packId,name:take.name,duration:take.duration,original:'audio/p01-original.wav',proposal:'audio/p01-A.wav',harmony:variant.harmony,
 ornaments:variant.ornaments,description:variant.description,placement:variant.rhythm?.placement,accompaniment:variant.rhythm?.accompaniment,arrivals:variant.arrivals,
 ...(compareDevelopment?{alternative:{proposal:'audio/p01-B.wav',harmony:alternative.harmony,ornaments:alternative.ornaments,description:alternative.description,
 development:alternative.development},feedbackQuestion:'La base corrigée te convient-elle ? La version développée apporte-t-elle quelque chose de musical, dans les trois passages indiqués ? Indique laquelle respecte le mieux ton jeu et les moments à reprendre.'}:{}),
 ...(guided?{feedbackQuestion:'La progression et les moments choisis par Copilot respectent-ils ta mélodie ? Indique les couleurs, les arrivées ou les tenues à reprendre. Aucun accord ni moment de changement n’a été fourni au moteur.'}: {})};
if(revise)data.feedbackQuestion=revision.instructions.feedbackQuestion||'Les corrections respectent-elles tes indications et le passage conservé ? Les nouvelles préparations fonctionnent-elles ? Cette révision utilise tes corrections ; ce n’est pas une nouvelle harmonisation sans indications.';
fs.mkdirSync(output,{recursive:true});
for(const [name,value] of [['comparison-private.json',manifest],['listening.json',data]])fs.writeFileSync(path.join(output,name),JSON.stringify(value,null,2)+'\n',{flag:'wx'});
const html=fs.readFileSync(new URL('./copilot-melody-listening.html',import.meta.url),'utf8')
 .replace('<!--LISTENING_DATA-->',`<script id="listening-data" type="application/json">${JSON.stringify(data).replace(/</g,'\\u003c')}</script>`);
fs.writeFileSync(path.join(output,'index.html'),html,{flag:'wx'});
console.log(`Session ${session.id} : mélodie originale + proposition normale ; ${variant.harmony.length} accords, ${variant.ornaments.length} appoggiatures, zéro appel de modèle.`);
