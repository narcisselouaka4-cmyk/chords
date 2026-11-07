// Nouvelle écoute avant/après à partir de la baseline immuable, sans la régénérer.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {digest} from './copilot-evaluation.mjs';
import {buildPhraseVariants} from '../src/pedagogie/phrase-variants.js';
import {applyTakeEdit} from '../src/pedagogie/take-edit.js';
import {PROPOSAL_POLICY} from '../src/pedagogie/proposal-policy.js';

const root=fileURLToPath(new URL('../',import.meta.url));
const read=file=>JSON.parse(fs.readFileSync(file,'utf8'));
const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8'}).trim();

export function prepareRepair(baselineDirectory,output){
  if(fs.existsSync(output))throw Error('Choisir un dossier neuf ; les écoutes précédentes restent intactes.');
  if(git('diff','HEAD','--','src','scripts/copilot-repair-evaluation.mjs'))throw Error('Commiter le moteur et le dispositif avant de rendre une nouvelle écoute.');
  const baseline=read(path.join(baselineDirectory,'baseline.json'));
  if(digest(fs.readFileSync(path.join(baselineDirectory,baseline.archive.file)))!==baseline.archive.sha256)throw Error('Archive initiale altérée.');
  const before=digest(baseline),media=[],key=[],entries=[];
  const cases=[
    ['session016','p02','Prise 2 — accompagnement','Écoute la continuité sous la mélodie et la douceur des attaques, notamment à la fin.'],
    ['arpeggiated','p05','Prise 5 — résolution','Écoute le passage vers 13–14 secondes et la suspension suivie de la tension, avant le retour final.'],
  ];
  for(const [name,id,title,note] of cases){
    const record=baseline.records.find(r=>r.id===name);
    if(!record||digest(record.take)!==record.sourceSha256||digest(record.open)!==record.openSha256)throw Error('Baseline incohérente : '+name);
    const bytes=fs.readFileSync(path.join(root,'src/pedagogie/fixtures',record.fixture));
    if(digest(bytes)!==record.fixtureSha256)throw Error('Entrée différente de la première écoute : '+name);
    const take=structuredClone(record.take),source=digest(take);
    // Même sélection que les cartes normales de Copilot ; aucune note manuelle.
    const selected=buildPhraseVariants(take,{message:record.message});
    if(!selected[0]||selected[0].id!=='arrangement')throw Error('La reconstruction attendue n’est pas sélectionnée : '+name);
    const proposals=[{mode:'baseline-reference',proposal:record.open},{mode:'continuity-v'+PROPOSAL_POLICY,proposal:selected[0]}];
    if(crypto.randomInt(2))proposals.reverse();
    media.push({id:id+'-original',take});
    const candidates=proposals.map(({mode,proposal},i)=>{
      const label=['A','B'][i],changed=applyTakeEdit(take,proposal.advice.edit);
      if(!changed)throw Error('Proposition invalide : '+name);
      media.push({id:id+'-'+label,take:changed});
      return {label,mode,available:true,audio:`audio/${id}-${label}.wav`,proposal,proposalSha256:digest(proposal)};
    });
    if(digest(take)!==source)throw Error('Source modifiée : '+name);
    entries.push({id,title,note,duration:take.duration,paired:true,original:`audio/${id}-original.wav`,
      candidates:candidates.map(({label,available,audio})=>({label,available,audio}))});
    key.push({id,fixture:record.fixture,sourceSha256:source,candidates});
  }
  if(digest(read(path.join(baselineDirectory,'baseline.json')))!==before)throw Error('Baseline modifiée.');
  const packId=crypto.randomUUID(),publicData={schema:1,packId,
    title:'Copilot — fluidité et résolution',
    introduction:'Deux comparaisons ciblées. Tu peux réécouter ton jeu et passer de A à B au même endroit. Indique si une version te convient davantage, ou si le problème reste présent.',cases:entries};
  const manifest={schema:1,packId,createdAt:new Date().toISOString(),appCommit:git('rev-parse','HEAD'),
    baselineCommit:baseline.appCommit,baselineSha256:before,proposalPolicy:PROPOSAL_POLICY,
    comparison:'frozen-baseline-vs-current-normal-selection',inferenceCalls:0,media,key};
  fs.mkdirSync(output,{recursive:true});
  for(const [file,data] of [['comparison-private.json',manifest],['listening.json',publicData]])
    fs.writeFileSync(path.join(output,file),JSON.stringify(data,null,2)+'\n',{flag:'wx'});
  const json=JSON.stringify(publicData).replace(/</g,'\\u003c');
  const html=fs.readFileSync(path.join(root,'scripts/copilot-listening.html'),'utf8')
    .replace('<!--LISTENING_DATA-->',`<script id="listening-data" type="application/json">${json}</script>`);
  fs.writeFileSync(path.join(output,'index.html'),html,{flag:'wx'});
  console.log(`Deux paires préparées, ${media.length} rendus ; baseline et prises intactes, zéro appel d’IA.`);
  return manifest;
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const [baseline,output]=process.argv.slice(2);
  if(!baseline||!output)throw Error('Usage : node scripts/copilot-repair-evaluation.mjs BASELINE NOUVEAU_DOSSIER');
  prepareRepair(path.resolve(baseline),path.resolve(output));
}
