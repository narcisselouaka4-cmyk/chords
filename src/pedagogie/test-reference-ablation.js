// Vérifier l'absence d'appel à la grammaire, pas seulement l'absence d'étiquette.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {buildPhraseArrangement} from './phrase-arrangement.js';
import {applyTakeEdit} from './take-edit.js';

const directory=fs.mkdtempSync(path.join(os.tmpdir(),'pjc-reference-ablation-'));
const take=JSON.parse(fs.readFileSync(new URL('./fixtures/copilot-session017.json',import.meta.url)));
try{
 const original=new URL('./phrase-arrangement.js',import.meta.url);
 const references=new URL('./reference-voicings.js',import.meta.url);
 const stub=path.join(directory,'reference-probe.mjs');
 fs.writeFileSync(stub,`import * as real from ${JSON.stringify(references.href)};
 export const calls=[];
 export function referenceVoicing(...args){calls.push('voicing');return real.referenceVoicing(...args);}
 export function referenceFinalDominant(...args){calls.push('final');return real.referenceFinalDominant(...args);}
 `);
 const source=fs.readFileSync(original,'utf8').replace(/from\s+(['"])(\.[^'"]+)\1/g,(_,quote,spec)=>
  'from '+JSON.stringify(spec==='./reference-voicings.js'?pathToFileURL(stub).href:new URL(spec,original).href));
 const instrumented=path.join(directory,'arranger.mjs');fs.writeFileSync(instrumented,source);
 const {buildPhraseArrangement:build}=await import(pathToFileURL(instrumented));
 const probe=await import(pathToFileURL(stub));
 const before=JSON.stringify(take),normal=build(take);
 assert.deepEqual(normal,buildPhraseArrangement(take));
 assert(probe.calls.includes('voicing')&&probe.calls.includes('final'),'Les deux accès de référence sont réellement exercés par le témoin');
 probe.calls.length=0;
 const linked=build(take,{voicingMode:'linked'});
 assert(linked&&probe.calls.length,'La variante liée historique reste partiellement dépendante de la référence');
 for(const voicingMode of ['open','linked']){
  probe.calls.length=0;
  const independent=build(take,{voicingMode,useReferenceVoicings:false});
  assert(independent);assert(applyTakeEdit(take,independent.advice.edit));
  assert(independent.harmony.some(h=>h.kind==='tonic'),'La branche de cadence finale est atteinte sans référence');
  assert(independent.harmony.every(h=>h.technique!=='spread-reference'));
  assert.equal(probe.calls.length,0,'Aucun appel indirect ou final à la grammaire');
 }
 for(const fixture of ['copilot-session016.json','copilot-arpeggiated-take.json','copilot-development-take.json']){
  const data=JSON.parse(fs.readFileSync(new URL('./fixtures/'+fixture,import.meta.url))),input=data.take||data;
  probe.calls.length=0;
  const result=build(input,{useReferenceVoicings:false});
  assert(result);assert(applyTakeEdit(input,result.advice.edit));assert.equal(probe.calls.length,0);
 }
 assert.equal(JSON.stringify(take),before);
 console.log('✓ Ablation complète : zéro appel aux deux fonctions de référence, cadence finale exercée, modes ouvert et lié, sources intactes.');
}finally{fs.rmSync(directory,{recursive:true,force:true});}
