// Le dépouillement doit refuser une autre série et ne jamais inventer un avis.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {score,digest} from './copilot-evaluation.mjs';

const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'pjc-listening-score-'));
try{
 const key={packId:'pack-test',key:[
  {id:'p01',fixture:'first',candidates:[{label:'A',mode:'without-reference',available:true},{label:'B',mode:'baseline-reference',available:true}]},
  {id:'p02',fixture:'second',candidates:[{label:'A',mode:'baseline-reference',available:true},{label:'B',mode:'without-reference',available:false}]},
  {id:'p03',fixture:'melody',candidates:[{label:'A',available:false},{label:'B',available:false}]},
 ]};
 fs.writeFileSync(path.join(temporary,'comparison-private.json'),JSON.stringify(key));
 const answersFile=path.join(temporary,'answers.json');
 const answers=value=>fs.writeFileSync(answersFile,JSON.stringify(value));
 answers({packId:'other',opinions:{}});assert.throws(()=>score(temporary,answersFile),/autre série/);
 answers({packId:'pack-test',opinions:{}});
 const empty=score(temporary,answersFile);assert.equal(empty.counts.unanswered,2);assert.equal(empty.counts['baseline-reference'],0);assert.equal(empty.rows.length,2);
 answers({packId:'pack-test',opinions:{p01:{preference:'A',comment:'À 0:08'},p02:{preference:'neither'}}});
 const result=score(temporary,answersFile);assert.equal(result.counts['without-reference'],1);assert.equal(result.counts.neither,1);assert.equal(result.rows[0].comment,'À 0:08');
 answers({packId:'pack-test',opinions:{p02:{preference:'B'}}});assert.throws(()=>score(temporary,answersFile),/indisponible/);
 answers({packId:'pack-test',opinions:{p01:{preference:'C'}}});assert.throws(()=>score(temporary,answersFile),/inconnue/);
 answers({packId:'pack-test',opinions:{p99:{preference:'A'}}});assert.throws(()=>score(temporary,answersFile),/inconnue/);
 assert.equal(digest({a:1}),digest({a:1}));assert.notEqual(digest({a:1}),digest({a:2}));
 console.log('✓ Dépouillement : série vérifiée, anonymat A/B indépendant de la méthode, absences non comptées comme des votes, réponses invalides refusées.');
}finally{fs.rmSync(temporary,{recursive:true,force:true});}
