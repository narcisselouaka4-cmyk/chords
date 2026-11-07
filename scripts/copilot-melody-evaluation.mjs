// Écoute reproductible depuis une vraie session, par le client normal de Copilot.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {sendCopilotMessage} from '../src/pedagogie/copilot-client.js';
import {applyTakeEdit} from '../src/pedagogie/take-edit.js';
import {PROPOSAL_POLICY} from '../src/pedagogie/proposal-policy.js';
const [sessionDirectory,output,message]=process.argv.slice(2);
if(!sessionDirectory||!output||!message)throw Error('Usage : node scripts/copilot-melody-evaluation.mjs DOSSIER_SESSION DOSSIER_NEUF DEMANDE');
if(fs.existsSync(output))throw Error('Choisir un dossier neuf : ne pas remplacer une écoute.');
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
let response;
try{response=await sendCopilotMessage({message,messages:[],context:{type:'session',playing:{session:take}}});}finally{globalThis.fetch=oldFetch;}
const variant=response.toolResult?.variants?.[0];
if(!response.ok||variant?.id!=='melody-progression'||calls)throw Error('La sélection normale n’a pas produit la progression demandée.');
const changed=applyTakeEdit(take,variant.advice.edit);if(!changed||JSON.stringify(take)!==source)throw Error('Édition invalide ou source modifiée.');
for(const [name,data] of Object.entries(input))if(sha(fs.readFileSync(path.join(sessionDirectory,name)))!==data.sha256)throw Error('Session modifiée pendant la génération.');
const packId=crypto.randomUUID(),manifest={schema:1,packId,createdAt:new Date().toISOString(),appCommit:git('rev-parse','HEAD'),proposalPolicy:PROPOSAL_POLICY,
 inferenceCalls:calls,sessionId:session.id,inputFilesSha256:Object.fromEntries(Object.entries(input).map(([name,d])=>[name,d.sha256])),message,
 media:[{id:'p01-original',take},{id:'p01-A',take:changed}],response};
const data={schema:1,packId,name:take.name,duration:take.duration,original:'audio/p01-original.wav',proposal:'audio/p01-A.wav',harmony:variant.harmony,
 ornaments:variant.ornaments,description:variant.description,placement:variant.rhythm?.placement,accompaniment:variant.rhythm?.accompaniment,arrivals:variant.arrivals};
fs.mkdirSync(output,{recursive:true});
for(const [name,value] of [['comparison-private.json',manifest],['listening.json',data]])fs.writeFileSync(path.join(output,name),JSON.stringify(value,null,2)+'\n',{flag:'wx'});
const html=fs.readFileSync(new URL('./copilot-melody-listening.html',import.meta.url),'utf8')
 .replace('<!--LISTENING_DATA-->',`<script id="listening-data" type="application/json">${JSON.stringify(data).replace(/</g,'\\u003c')}</script>`);
fs.writeFileSync(path.join(output,'index.html'),html,{flag:'wx'});
console.log(`Session ${session.id} : mélodie originale + proposition normale ; ${variant.harmony.length} accords, ${variant.ornaments.length} appoggiatures, zéro appel de modèle.`);
